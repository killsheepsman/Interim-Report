import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight, ArrowsClockwise, Bell, CaretDown, ChartBar, ChartPieSlice, CheckCircle,
  ClipboardText, ClockCountdown, Cube, Database, DownloadSimple, Eye, FileXls,
  FloppyDisk, Funnel, GearSix, House, Kanban, ListChecks, Plus, Pulse,
  Question, Rows, ShieldCheck, SidebarSimple, Sparkle, Table, Target, Trash,
  UploadSimple, User, Warning, WarningCircle, X,
} from "@phosphor-icons/react";
import { analyzeImported, downloadJson, normalizeIpqcLeaderMapRows, normalizeIpqcWorkshop, parseFiles } from "./dataEngine.js";
import { createSourcesSignature, downloadSourceFiles, loadAppliedDateRange, loadCachedAnalysis, loadCurrentUser, loadDefaultAnalysis, loadDefaultAnnotations, loadDefaultSources, loadImportedSources, loadPermissionConfig, mergeImportedSources, saveAppliedDateRange, saveCachedAnalysis, saveImportedSources, savePermissionConfig, sourceRowCount, summarizeSources, uploadSourceFiles } from "./dataStore.js";
import { sampleData } from "./sampleData.js";
import { BarCompare, Donut, HorizontalRank, MachinedTpmCompareChart, Pareto, QuantityRateCombo, ScoreMonthlyCombo, ScoreYearCompare, StackedStage, WorkshopCategoryHeatmap, YearStackedCompare } from "./charts.jsx";

const moduleIcons = { IQC: Cube, IPQC: Pulse, OQC: ShieldCheck, DQA: ClipboardText };
const moduleColor = { IQC: "green", IPQC: "blue", OQC: "orange", DQA: "amber" };
const UiThemeContext = createContext("classic");
const useUiTheme = () => useContext(UiThemeContext);
const ANALYSIS_CACHE_VERSION = "server-analysis-cache-v1";
const safeParse = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};
const defaultFeaturePermissions = {
  dataImport: { public: false, deputy: true, label: "数据导入" },
  workspace: { public: false, deputy: true, label: "质量工作台" },
  annotationEdit: { public: false, deputy: true, label: "分析改善措施" },
  annotationView: { public: false, deputy: true, label: "分析显示" },
  exportReport: { public: true, deputy: true, label: "导出报告" },
  dateTemporaryRefresh: { public: true, deputy: true, label: "临时刷新日期" },
};
const defaultApiPermissions = {
  "POST /api/uploads": { public: false, deputy: true, label: "上传原始Excel" },
  "PUT /api/state/imported-sources": { public: false, deputy: true, label: "保存数据源清单" },
  "PUT /api/state/analysis-cache": { public: false, deputy: true, label: "保存分析结果" },
  "PUT /api/state/applied-date-range": { public: false, deputy: true, label: "保存默认日期" },
  "PUT /api/permissions": { public: false, deputy: false, label: "保存权限设置" },
  "GET /api/state/analysis-cache": { public: true, deputy: true, label: "读取分析结果" },
  "GET /api/state/imported-sources": { public: true, deputy: true, label: "读取数据源清单" },
  "GET /api/state/applied-date-range": { public: true, deputy: true, label: "读取默认日期" },
  "GET /api/uploads/*": { public: true, deputy: true, label: "读取原始Excel" },
};
const normalizePermissions = (value = {}) => ({
  deputyAdmins: Array.isArray(value.deputyAdmins) ? value.deputyAdmins : [],
  features: Object.fromEntries(Object.entries(defaultFeaturePermissions).map(([key, item]) => [key, { ...item, ...(value.features?.[key] || {}) }])),
  apis: Object.fromEntries(Object.entries(defaultApiPermissions).map(([key, item]) => [key, { ...item, ...(value.apis?.[key] || {}) }])),
});
const canUseFeature = (auth, permissions, key) => {
  if (auth?.isAdmin) return true;
  const rule = permissions?.features?.[key] || defaultFeaturePermissions[key];
  return auth?.isDeputy ? rule?.deputy !== false : rule?.public === true;
};

function Delta({ value, goodWhenDown = false }) {
  const good = goodWhenDown ? value <= 0 : value >= 0;
  return <span className={`delta ${good ? "positive" : "negative"}`}>{value >= 0 ? "↑" : "↓"} {Math.abs(value).toFixed(1)}{Math.abs(value) < 20 ? " pp" : "%"}</span>;
}

function KpiCard({ item, compact = false }) {
  return <div className={`kpi-card ${compact ? "compact" : ""}`}>
    <div className="kpi-label"><span className={`kpi-mark ${item.key}`}></span>{item.label}<span className="unit-chip">{item.unit}</span></div>
    <div className="kpi-main">{typeof item.value === "number" && item.value > 999 ? item.value.toLocaleString() : item.value}<small>{item.unit}</small></div>
    <div className="kpi-change"><span>较去年同期</span><Delta value={item.delta} goodWhenDown={item.goodWhenDown} /></div>
    {!compact && <div className="kpi-detail">{item.detail}</div>}
  </div>;
}

function Panel({ title, subtitle, action, children, className = "" }) {
  return <section className={`panel ${className}`}>
    <header className="panel-head">
      <div><h3>{title}</h3>{subtitle && <span>{subtitle}</span>}</div>
      {action}
    </header>
    {children}
  </section>;
}

function Switcher({ view, onChange, canWorkspace = true }) {
  return <div className="view-switcher">
    <button className={view === "executive" ? "active" : ""} onClick={() => onChange("executive")}>经营驾驶舱</button>
    {canWorkspace && <button className={view === "workspace" ? "active" : ""} onClick={() => onChange("workspace")}>质量工作台</button>}
  </div>;
}

function ImportModal({ open, onClose, onSourcesChanged, files, dateRange, targetModule }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const handleFiles = async (selected) => {
    setBusy(true);
    try {
      const selectedFiles = [...selected];
      const parsed = await parseFiles(selectedFiles);
      const valid = targetModule ? parsed.filter((file) => file.module === targetModule) : parsed.filter((file) => file.module !== "UNKNOWN");
      const rejected = parsed.filter((file) => targetModule ? file.module !== targetModule : file.module === "UNKNOWN");
      const uploaded = await uploadSourceFiles(valid, selectedFiles);
      const merged = mergeImportedSources(files, uploaded);
      await onSourcesChanged(merged.sources, {
        added: merged.added, replaced: merged.replaced,
        rejected: rejected.map((file) => `${file.name}（识别为${file.module}）`),
      });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  const moduleCount = (name) => files.filter((f) => f.module === name).length;
  const visibleFiles = targetModule ? files.filter((file) => file.module === targetModule) : files.filter((file) => file.module !== "UNKNOWN");
  const recentVisibleFiles = visibleFiles.slice(-8);
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="import-modal">
      <div className="modal-title">
        <div><span className="modal-icon"><UploadSimple size={22} /></span><div><h2>{targetModule ? `导入${targetModule}原始数据` : "导入原始质量数据"}</h2><p>相同模块且文件名相同会替换旧数据，并自动保存到本机</p></div></div>
        <button className="icon-btn" onClick={onClose}><X size={20} /></button>
      </div>
      <div className="module-upload-grid">
        {(targetModule ? [targetModule] : ["IQC", "IPQC", "OQC", "DQA"]).map((name) => {
          const Icon = moduleIcons[name];
          const count = moduleCount(name);
          return <div className={`module-upload ${count ? "ready" : ""}`} key={name}>
            <Icon size={23} /><strong>{name}</strong><span>{count ? `${count} 个文件` : "等待上传"}</span>
            {count > 0 && <CheckCircle weight="fill" size={18} />}
          </div>;
        })}
      </div>
      <div
        className={`drop-zone ${drag ? "dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        <FileXls size={42} weight="duotone" />
        <h3>{busy ? "正在识别表头并计算指标…" : "拖入Excel文件或点击选择"}</h3>
        <p>支持 .xlsx / .xls，可同时选择多个年度、地点和模块文件</p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
      </div>
      <div className="file-list">
        {recentVisibleFiles.map((file, index) => <div className="file-row" key={`${file.name}-${index}`}>
          <FileXls size={19} /><div><strong>{file.name}</strong><span>{sourceRowCount(file).toLocaleString()} 行 · {file.sheets.length} 个工作表</span></div>
          <span className={`module-pill ${file.module === "UNKNOWN" ? "unknown" : ""}`}>{file.module === "UNKNOWN" ? "需确认" : file.module}</span>
        </div>)}
        {!recentVisibleFiles.length && <div className="empty-files">{targetModule ? `尚未导入${targetModule}文件，导入后这里只显示${targetModule}数据源。` : "导入后，这里会显示模块识别结果与数据行数。"}</div>}
      </div>
      <div className="modal-foot"><span><ShieldCheck size={16} /> 自动识别失败的文件不会进入计算</span><button className="primary-btn" onClick={onClose}>完成导入</button></div>
    </div>
  </div>;
}

const SelectBox = ({ children }) => <button className="select-box">{children}<CaretDown size={14} /></button>;
const preserveScrollPosition = (action) => {
  const x = window.scrollX || document.documentElement.scrollLeft || 0;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  action();
  const restore = () => window.scrollTo(x, y);
  requestAnimationFrame(restore);
  setTimeout(restore, 0);
  setTimeout(restore, 80);
};

const exportText = {
  button: "\u5bfc\u51fa\u62a5\u544a",
  title: "\u5bfc\u51fa\u5f53\u524d\u9875\u9762",
  desc: "\u5bfc\u51fa\u5f53\u524d\u9875\u9762\u4e2d\u53ef\u89c1\u7684\u56fe\u8868\u3001\u6570\u636e\u8868\u548c\u5206\u6790\u5185\u5bb9\u3002",
  html: "HTML\u7f51\u9875\u6587\u4ef6",
  htmlDesc: "\u53ef\u7528\u6d4f\u89c8\u5668\u6253\u5f00\uff0c\u4fdd\u7559\u5f53\u524d\u56fe\u8868\u548c\u8868\u683c\u6837\u5f0f\u3002",
  pdf: "PDF\u6587\u4ef6",
  pdfDesc: "\u8c03\u7528\u7cfb\u7edf\u6253\u5370\u5bf9\u8bdd\u6846\uff0c\u9009\u62e9\u201c\u53e6\u5b58\u4e3aPDF\u201d\u5e76\u4fdd\u5b58\u3002",
  cancel: "\u53d6\u6d88",
  exporting: "\u6b63\u5728\u51c6\u5907...",
  fallback: "\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u76f4\u63a5\u9009\u62e9\u4fdd\u5b58\u8def\u5f84\uff0c\u5df2\u6539\u4e3a\u9ed8\u8ba4\u4e0b\u8f7d\u3002",
  printTip: "\u8bf7\u5728\u6253\u5370\u7a97\u53e3\u4e2d\u9009\u62e9\u201c\u53e6\u5b58\u4e3a PDF\u201d\u3002",
};

const exportFileName = (ext) => {
  const title = document.querySelector(".executive-topbar h1, .report-title-input, .workspace-brand strong")?.value
    || document.querySelector(".executive-topbar h1, .workspace-brand strong")?.textContent
    || "QMS\u8d28\u91cf\u62a5\u544a";
  const stamp = new Date().toISOString().slice(0, 10);
  return `${String(title).replace(/[\\/:*?"<>|]/g, "-")}-${stamp}.${ext}`;
};

const exportRootElement = () => document.querySelector(".workspace-main") || document.querySelector(".executive-main") || document.querySelector("#root");

const exportStyles = () => Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
  .map((node) => node.outerHTML)
  .join("\n");

const exportCleanup = (clone) => {
  clone.querySelectorAll(".export-report-button,.export-dialog-backdrop,.module-floating-tabs,.chart-label-position-control,.axis-angle-control,.date-refresh-btn,.import-btn,.label-controls-toggle,.view-switcher").forEach((node) => node.remove());
  clone.querySelectorAll("input, textarea, select").forEach((node) => {
    if (node.tagName === "TEXTAREA") {
      const div = document.createElement("div");
      div.className = `${node.className || ""} export-field-text`;
      div.innerText = node.value || "";
      node.replaceWith(div);
    } else if (node.tagName === "SELECT") {
      const span = document.createElement("span");
      span.className = `${node.className || ""} export-field-text`;
      span.innerText = node.options[node.selectedIndex]?.text || node.value || "";
      node.replaceWith(span);
    } else {
      const span = document.createElement("span");
      span.className = `${node.className || ""} export-field-text`;
      span.innerText = node.value || "";
      node.replaceWith(span);
    }
  });
};

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const buildAnnotationReportHtml = () => {
  const rows = normalizeAnnotations(loadAnnotations())
    .filter((row) => row.include !== false && String(row.content || "").trim());
  const grouped = annotationTypes
    .map((type) => ({ type, rows: rows.filter((row) => row.type === type) }))
    .filter((group) => group.rows.length);
  const stamp = new Date().toLocaleDateString("zh-CN");
  const body = grouped.length
    ? grouped.map((group) => `<section class="formal-section"><h2>${escapeHtml(group.type)}</h2>${group.rows.map((row) => `<p>${escapeHtml(row.content).replace(/\n/g, "<br/>")}</p>`).join("")}</section>`).join("")
    : `<section class="formal-section"><p>暂无已进入报告的批注素材。</p></section>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>总结报告</title><style>
    body{margin:0;background:#f5f7fb;color:#172033;font-family:"PingFang SC","Microsoft YaHei",Arial,sans-serif}
    .formal-report{max-width:980px;margin:0 auto;padding:42px 54px 64px;background:#fff;min-height:100vh;box-shadow:0 18px 48px rgba(16,24,40,.08)}
    h1{margin:0;color:#0f2f5f;font-size:30px;letter-spacing:-.4px}
    .meta{margin:8px 0 30px;color:#64748b;font-size:13px;border-bottom:1px solid #e5edf6;padding-bottom:18px}
    .formal-section{break-inside:avoid;margin:0 0 28px}
    .formal-section h2{margin:0 0 12px;color:#174f8b;font-size:20px;border-left:4px solid #0a84ff;padding-left:10px}
    .formal-section p{margin:0 0 12px;white-space:normal;line-height:1.9;font-size:15px;color:#243348;text-align:justify}
    @media print{body{background:#fff}.formal-report{box-shadow:none;padding:0;max-width:none}.formal-section{page-break-inside:avoid}}
  </style></head><body><main class="formal-report"><h1>总结报告</h1><div class="meta">导出日期：${stamp}</div>${body}</main></body></html>`;
};

const buildExportHtml = () => {
  if (document.querySelector(".summary-report-shell")) return buildAnnotationReportHtml();
  const root = exportRootElement();
  if (!root) return "";
  const clone = root.cloneNode(true);
  const sourceCanvases = Array.from(root.querySelectorAll("canvas"));
  const cloneCanvases = Array.from(clone.querySelectorAll("canvas"));
  cloneCanvases.forEach((canvas, index) => {
    try {
      const image = document.createElement("img");
      image.src = sourceCanvases[index]?.toDataURL("image/png") || "";
      image.className = "export-chart-image";
      image.style.cssText = canvas.getAttribute("style") || "max-width:100%;height:auto;";
      canvas.replaceWith(image);
    } catch {}
  });
  exportCleanup(clone);
  const title = document.querySelector(".executive-topbar h1")?.textContent || document.querySelector(".report-title-input")?.value || exportText.button;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>${exportStyles()}<style>body{background:#f5f7fb!important}.export-document{max-width:1480px;margin:0 auto;padding:18px}.export-chart-image{display:block;max-width:100%;height:auto}.export-field-text{white-space:pre-wrap;display:block;border:1px solid #dce5f1;border-radius:12px;background:#fff;padding:10px 12px;line-height:1.65}.executive-main,.workspace-main{margin-left:0!important;width:100%!important}.executive-topbar{position:static!important}.executive-sidebar,.global-date-filter,.filter-bar,.page-foot,.workspace-foot{display:none!important}@media print{body{background:#fff!important}.panel,.kpi-card,.summary-kpi,.oqc-division-card{break-inside:avoid;box-shadow:none!important}.export-document{padding:0}}</style></head><body><div class="export-document">${clone.outerHTML}</div></body></html>`;
};

const saveBlobWithPicker = async (blob, filename, accept) => {
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: filename.split(".").pop().toUpperCase(), accept }] });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return "picker";
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  return "download";
};

async function exportCurrentPage(format) {
  const html = buildExportHtml();
  if (!html) return;
  if (format === "html") {
    const result = await saveBlobWithPicker(new Blob([html], { type: "text/html;charset=utf-8" }), exportFileName("html"), { "text/html": [".html"] });
    if (result === "download") alert(exportText.fallback);
    return;
  }
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    alert(exportText.printTip);
    printWindow.print();
  }, 600);
}

function ExportReportButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (format) => {
    setBusy(true);
    try {
      await exportCurrentPage(format);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };
  return <>
    <button className="export-report-button" onClick={() => setOpen(true)}><DownloadSimple size={17}/>{exportText.button}</button>
    {open && createPortal(<div className="export-dialog-backdrop" onClick={() => !busy && setOpen(false)}>
      <div className="export-dialog" onClick={(event) => event.stopPropagation()}>
        <header><h3>{exportText.title}</h3><p>{busy ? exportText.exporting : exportText.desc}</p></header>
        <div className="export-choice-grid">
          <button disabled={busy} onClick={() => run("pdf")}><strong>{exportText.pdf}</strong><span>{exportText.pdfDesc}</span></button>
          <button disabled={busy} onClick={() => run("html")}><strong>{exportText.html}</strong><span>{exportText.htmlDesc}</span></button>
        </div>
        <footer><button disabled={busy} onClick={() => setOpen(false)}>{exportText.cancel}</button></footer>
      </div>
    </div>, document.body)}
  </>;
}

const annotationStorageKey = "qms-page-annotations-v1";
const annotationTypes = [
  "\u5206\u6790\u7ed3\u8bba", "\u98ce\u9669\u5224\u65ad", "\u6539\u5584\u63aa\u65bd", "\u5f85\u529e\u4e8b\u9879", "\u62a5\u544a\u91cd\u70b9",
];
const annotationModules = ["\u603b\u89c8", "IQC", "IPQC", "OQC", "DQA", "\u6570\u636e\u5bfc\u5165", "\u8d28\u91cf\u5de5\u4f5c\u53f0"];
const annotationText = {
  button: "\u5206\u6790\u6539\u5584\u63aa\u65bd",
  showButton: "\u5206\u6790\u663e\u793a",
  add: "\u5206\u6790\u6539\u5584\u63aa\u65bd",
  showTitle: "\u5df2\u4fdd\u5b58\u7684\u5206\u6790\u6539\u5584\u63aa\u65bd",
  desc: "\u6309\u7c7b\u578b\u8bb0\u5f55\u5f53\u524d\u9875\u9762\u7684\u5206\u6790\u3001\u5224\u65ad\u548c\u6539\u5584\u63aa\u65bd\uff0c\u4fdd\u5b58\u540e\u53ef\u7ee7\u7eed\u8865\u5145\u3002",
  showDesc: "\u67e5\u770b\u6240\u6709\u5df2\u4fdd\u5b58\u7684\u6279\u6ce8\u5185\u5bb9\uff0c\u8fd9\u91cc\u4e0d\u906e\u6321\u56fe\u8868\u3002",
  module: "\u6a21\u5757",
  include: "\u8fdb\u5165\u62a5\u544a",
  save: "\u4fdd\u5b58\u5185\u5bb9",
  cancel: "\u5173\u95ed",
  placeholder: "\u5728\u8fd9\u91cc\u8f93\u5165\u5bf9\u5e94\u7c7b\u578b\u7684\u5206\u6790\u6216\u63aa\u65bd...",
  pool: "\u6279\u6ce8\u7d20\u6750\u6c60",
  poolSub: "\u6765\u81ea\u7ecf\u8425\u9a7e\u9a76\u8231\u548c\u8d28\u91cf\u5de5\u4f5c\u53f0\u7684\u624b\u5de5\u6279\u6ce8\uff0c\u53ef\u5728\u6b64\u4fee\u6539\u540e\u7eb3\u5165\u6700\u7ec8\u62a5\u544a\u3002",
  empty: "\u6682\u65e0\u6279\u6ce8\u3002\u70b9\u51fb\u9876\u90e8\u201c\u5206\u6790\u6539\u5584\u63aa\u65bd\u201d\u5373\u53ef\u8bb0\u5f55\u3002",
  created: "\u8bb0\u5f55\u65f6\u95f4",
  delete: "\u5220\u9664",
  saved: "\u5df2\u4fdd\u5b58",
};
const loadAnnotations = () => safeParse(localStorage.getItem(annotationStorageKey), []);
const normalizeAnnotations = (rows = []) => rows.map((row) => ({ ...row, include: row.include !== false }));
const saveAnnotations = (rows) => {
  localStorage.setItem(annotationStorageKey, JSON.stringify(normalizeAnnotations(rows)));
  window.dispatchEvent(new CustomEvent("qms-annotations-updated", { detail: rows }));
};
const seedDefaultAnnotations = async () => {
  const current = normalizeAnnotations(loadAnnotations());
  if (current.length) return;
  const defaults = normalizeAnnotations(await loadDefaultAnnotations());
  if (!defaults.length) return;
  saveAnnotations(defaults);
};
function useAnnotations() {
  const [rows, setRows] = useState(() => normalizeAnnotations(loadAnnotations()));
  useEffect(() => {
    const update = () => setRows(normalizeAnnotations(loadAnnotations()));
    window.addEventListener("qms-annotations-updated", update);
    return () => window.removeEventListener("qms-annotations-updated", update);
  }, []);
  const persist = (next) => { saveAnnotations(next); setRows(normalizeAnnotations(next)); };
  return [rows, persist];
}
const annotationDraftFromRows = (rows, module) => Object.fromEntries(annotationTypes.map((type) => [type, rows.find((row) => row.module === module && row.type === type)?.content || ""]));
const currentPageName = (fallback) => document.querySelector(".executive-topbar h1")?.textContent || document.querySelector(".workspace-brand strong")?.textContent || fallback;
function AnnotationEditButton({ defaultModule = "\u603b\u89c8" }) {
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState(defaultModule);
  const [include, setInclude] = useState(true);
  const [draft, setDraft] = useState(() => annotationDraftFromRows(loadAnnotations(), defaultModule));
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (open) {
      setModule(defaultModule);
      const rows = loadAnnotations();
      setDraft(annotationDraftFromRows(rows, defaultModule));
      const first = rows.find((row) => row.module === defaultModule);
      setInclude(first?.include !== false);
      setSaved(false);
    }
  }, [defaultModule, open]);
  useEffect(() => {
    document.body.classList.toggle("annotation-drawer-open", open);
    return () => document.body.classList.remove("annotation-drawer-open");
  }, [open]);
  const changeModule = (value) => {
    setModule(value);
    const rows = loadAnnotations();
    setDraft(annotationDraftFromRows(rows, value));
    const first = rows.find((row) => row.module === value);
    setInclude(first?.include !== false);
    setSaved(false);
  };
  const save = () => {
    const rows = loadAnnotations();
    const others = rows.filter((row) => !(row.module === module && annotationTypes.includes(row.type)));
    const page = currentPageName(module);
    const now = new Date().toISOString();
    const nextRows = annotationTypes.flatMap((type) => {
      const content = (draft[type] || "").trim();
      if (!content) return [];
      const existing = rows.find((row) => row.module === module && row.type === type);
      return [{ ...(existing || {}), id: existing?.id || `${module}-${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`, type, module, include, content, page, createdAt: existing?.createdAt || now, updatedAt: now }];
    });
    saveAnnotations([...others, ...nextRows]);
    setSaved(true);
  };
  return <>
    <button className="annotation-button" onClick={() => setOpen(true)}><ClipboardText size={17}/>{annotationText.button}</button>
    {open && createPortal(<aside className="annotation-drawer" aria-label={annotationText.add}>
      <header><div><h3>{annotationText.add}</h3><p>{annotationText.desc}</p></div><button className="annotation-close" onClick={() => setOpen(false)}><X size={18}/></button></header>
      <div className="annotation-drawer-body">
        <div className="annotation-form-grid single"><label><span>{annotationText.module}</span><select value={module} onChange={(event) => changeModule(event.target.value)}>{annotationModules.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        <div className="annotation-type-editor">
          {annotationTypes.map((type) => <label key={type} className="annotation-content"><span>{type}</span><textarea rows={5} value={draft[type] || ""} placeholder={annotationText.placeholder} onChange={(event) => setDraft((current) => ({ ...current, [type]: event.target.value }))} /></label>)}
        </div>
      </div>
      <div className="annotation-dialog-foot"><label className="annotation-include"><input type="checkbox" checked={include} onChange={(event) => setInclude(event.target.checked)}/>{annotationText.include}</label><div>{saved && <span className="annotation-saved">{annotationText.saved}</span>}<button onClick={() => setOpen(false)}>{annotationText.cancel}</button><button className="primary" onClick={save}>{annotationText.save}</button></div></div>
    </aside>, document.body)}
  </>;
}
function AnnotationViewButton() {
  const [open, setOpen] = useState(false);
  const [rows] = useAnnotations();
  useEffect(() => {
    document.body.classList.toggle("annotation-drawer-open", open);
    return () => document.body.classList.remove("annotation-drawer-open");
  }, [open]);
  const grouped = annotationModules.map((module) => ({ module, rows: rows.filter((row) => row.module === module) })).filter((group) => group.rows.length);
  return <>
    <button className="annotation-button secondary" onClick={() => setOpen(true)}><Eye size={17}/>{annotationText.showButton}</button>
    {open && createPortal(<aside className="annotation-drawer annotation-view-drawer" aria-label={annotationText.showTitle}>
      <header><div><h3>{annotationText.showTitle}</h3><p>{annotationText.showDesc}</p></div><button className="annotation-close" onClick={() => setOpen(false)}><X size={18}/></button></header>
      <div className="annotation-drawer-body annotation-view-body">
        {!grouped.length && <div className="annotation-empty">{annotationText.empty}</div>}
        {grouped.map((group) => <section className="annotation-view-group" key={group.module}><h4>{group.module}</h4>{group.rows.map((row) => <article key={row.id}><div><b>{row.type}</b>{row.include === false && <em>未进入报告</em>}</div><p>{row.content}</p></article>)}</section>)}
      </div>
    </aside>, document.body)}
  </>;
}
function AnnotationReportPanel() {
  const [rows, setRows] = useAnnotations();
  const [draftRows, setDraftRows] = useState(rows);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraftRows(rows); }, [rows]);
  const update = (id, patch) => {
    setDraftRows((current) => current.map((row) => row.id === id ? { ...row, ...patch, updatedAt: new Date().toISOString() } : row));
    setSaved(false);
  };
  const save = () => {
    setRows(draftRows);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };
  const remove = (id) => setRows(rows.filter((row) => row.id !== id));
  const autosizeRows = (value) => Math.max(4, String(value || "").split(/\r?\n/).length + Math.ceil(String(value || "").length / 78) + 1);
  const reportRows = draftRows.filter((row) => row.include !== false);
  const grouped = annotationModules.map((module) => ({ module, rows: reportRows.filter((row) => row.module === module) })).filter((group) => group.rows.length);
  if (!draftRows.length) return <div className="annotation-empty">{annotationText.empty}</div>;
  return <div className="annotation-report-panel">
    <div className="annotation-save-bar"><span>{saved ? annotationText.saved : "修改后请点击保存，导出报告会使用已保存内容。"}</span><button onClick={save}><FloppyDisk size={15}/>{annotationText.save}</button></div>
    {grouped.map((group) => <section className="annotation-module-group" key={group.module}>
      <h4>{group.module}</h4>
      {group.rows.map((row) => <div className="annotation-report-row" key={row.id}>
        <div className="annotation-row-meta"><select value={row.type} onChange={(event) => update(row.id, { type: event.target.value })}>{annotationTypes.map((item) => <option key={item}>{item}</option>)}</select><select value={row.module} onChange={(event) => update(row.id, { module: event.target.value })}>{annotationModules.map((item) => <option key={item}>{item}</option>)}</select><label><input type="checkbox" checked={row.include !== false} onChange={(event) => update(row.id, { include: event.target.checked })}/>{annotationText.include}</label><span>{annotationText.created}: {String(row.createdAt || "").slice(0, 10)}</span><button onClick={() => remove(row.id)}><Trash size={14}/>{annotationText.delete}</button></div>
        <textarea className="annotation-full-text" value={row.content} rows={autosizeRows(row.content)} onChange={(event) => update(row.id, { content: event.target.value })}/>
      </div>)}
    </section>)}
    {draftRows.some((row) => row.include === false) && <section className="annotation-module-group muted"><h4>未进入报告</h4>{draftRows.filter((row) => row.include === false).map((row) => <div className="annotation-report-row" key={row.id}><div className="annotation-row-meta"><select value={row.type} onChange={(event) => update(row.id, { type: event.target.value })}>{annotationTypes.map((item) => <option key={item}>{item}</option>)}</select><select value={row.module} onChange={(event) => update(row.id, { module: event.target.value })}>{annotationModules.map((item) => <option key={item}>{item}</option>)}</select><label><input type="checkbox" checked={false} onChange={(event) => update(row.id, { include: event.target.checked })}/>{annotationText.include}</label><button onClick={() => remove(row.id)}><Trash size={14}/>{annotationText.delete}</button></div><textarea className="annotation-full-text" value={row.content} rows={autosizeRows(row.content)} onChange={(event) => update(row.id, { content: event.target.value })}/></div>)}</section>}
  </div>;
}

function AnnotationTransferActions() {
  const [rows, setRows] = useAnnotations();
  const mergeInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const [notice, setNotice] = useState("");
  const showNotice = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 2600);
  };
  const exportAnnotations = () => {
    const payload = {
      app: "QMS质量分析平台",
      type: "annotations",
      version: 1,
      exportedAt: new Date().toISOString(),
      count: rows.length,
      rows: normalizeAnnotations(rows),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `QMS批注-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showNotice(`已导出 ${rows.length} 条批注`);
  };
  const normalizeImportRows = (payload) => {
    const imported = Array.isArray(payload) ? payload : payload?.rows;
    if (!Array.isArray(imported)) return [];
    const now = new Date().toISOString();
    return normalizeAnnotations(imported).map((row, index) => ({
      id: row.id || `imported-${Date.now()}-${index}`,
      type: annotationTypes.includes(row.type) ? row.type : annotationTypes[0],
      module: annotationModules.includes(row.module) ? row.module : annotationModules[0],
      include: row.include !== false,
      content: String(row.content || "").trim(),
      page: row.page || row.module || annotationModules[0],
      createdAt: row.createdAt || now,
      updatedAt: now,
    })).filter((row) => row.content);
  };
  const mergeRows = (current, imported) => {
    const next = [...current];
    imported.forEach((row) => {
      const key = `${row.module}::${row.type}::${row.content}`;
      const exists = next.some((item) => `${item.module}::${item.type}::${item.content}` === key);
      if (!exists) next.push({ ...row, id: row.id || `imported-${Date.now()}-${Math.random().toString(16).slice(2)}` });
    });
    return next;
  };
  const importAnnotations = (file, mode) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        const imported = normalizeImportRows(payload);
        if (!imported.length) {
          showNotice("没有识别到可导入的批注");
          return;
        }
        const next = mode === "replace" ? imported : mergeRows(rows, imported);
        setRows(next);
        showNotice(mode === "replace" ? `已覆盖导入 ${imported.length} 条批注` : `已合并导入 ${next.length - rows.length} 条新批注`);
      } catch {
        showNotice("导入失败：文件格式不是有效的批注 JSON");
      }
    };
    reader.readAsText(file, "utf-8");
  };
  return <div className="annotation-transfer-actions">
    <button onClick={exportAnnotations}><DownloadSimple size={15}/>导出批注</button>
    <button onClick={() => mergeInputRef.current?.click()}><UploadSimple size={15}/>导入批注</button>
    <button className="danger" onClick={() => replaceInputRef.current?.click()}><UploadSimple size={15}/>覆盖导入</button>
    <input ref={mergeInputRef} type="file" accept=".json,application/json" hidden onChange={(event) => { importAnnotations(event.target.files?.[0], "merge"); event.target.value = ""; }} />
    <input ref={replaceInputRef} type="file" accept=".json,application/json" hidden onChange={(event) => { importAnnotations(event.target.files?.[0], "replace"); event.target.value = ""; }} />
    {notice && <span>{notice}</span>}
  </div>;
}

function FloatingTabs({ options, active, onChange, watchSelector = ".sticky-switch-bar .site-tabs", className = "" }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.querySelector(watchSelector);
        if (!target) {
          setVisible(false);
          return;
        }
        const rect = target.getBoundingClientRect();
        setVisible(rect.bottom <= 0);
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [watchSelector]);
  if (typeof document === "undefined" || !visible) return null;
  const normalized = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  return createPortal(<div className={`module-floating-tabs ${className}`} aria-label="module quick switch">
    {normalized.map((option) => <button key={option.value} className={active === option.value ? "active" : ""} onClick={() => preserveScrollPosition(() => onChange(option.value))}>{option.label}</button>)}
  </div>, document.body);
}
const AppliedPeriodTag = ({ data }) => {
  const range = data.appliedDateRange;
  if (!range) return null;
  return <div className="applied-period-tag">已应用：{range.start2025}—{range.end2025} / {range.start2026}—{range.end2026}</div>;
};

function FontSizeControl({ value, onChange, dark = false }) {
  return <div className={`font-size-control ${dark ? "dark" : ""}`}><span>字体</span>{[
    ["small","小"],["standard","标准"],["large","大"],["xlarge","特大"],
  ].map(([key,label]) => <button key={key} className={value === key ? "active" : ""} onClick={() => onChange(key)}>{label}</button>)}</div>;
}

function DateRangeFilter({ value, onChange, onRefresh, fontSize, onFontSize, refreshStatus = "idle", refreshProgress, canRefresh = true }) {
  const invalid2025 = value.start2025 && value.end2025 && value.start2025 > value.end2025;
  const invalid2026 = value.start2026 && value.end2026 && value.start2026 > value.end2026;
  const invalid = invalid2025 || invalid2026 || !value.start2025 || !value.end2025 || !value.start2026 || !value.end2026;
  const presets = [
    ["1—3月", 3], ["1—5月", 5], ["上半年", 6], ["1—8月", 8], ["全年", 12],
  ];
  const applyPreset = (month) => {
    const lastDay = (year) => new Date(year, month, 0).getDate();
    onChange({
      start2025: "2025-01-01",
      end2025: `2025-${String(month).padStart(2, "0")}-${lastDay(2025)}`,
      start2026: "2026-01-01",
      end2026: `2026-${String(month).padStart(2, "0")}-${lastDay(2026)}`,
    });
  };
  return <div className="global-date-filter">
    <span><ClockCountdown size={15}/>同比日期</span>
    <div className="date-presets"><b>快捷区间</b>{presets.map(([label, month]) => <button key={label} onClick={() => applyPreset(month)}>{label}</button>)}</div>
    <div className="year-date-group"><b>2025同期</b><label>开始<input type="date" value={value.start2025} onChange={(event) => onChange({ ...value, start2025: event.target.value })}/></label><i>—</i><label>结束<input type="date" value={value.end2025} onChange={(event) => onChange({ ...value, end2025: event.target.value })}/></label></div>
    <div className="year-date-group"><b>2026本期</b><label>开始<input type="date" value={value.start2026} onChange={(event) => onChange({ ...value, start2026: event.target.value })}/></label><i>—</i><label>结束<input type="date" value={value.end2026} onChange={(event) => onChange({ ...value, end2026: event.target.value })}/></label></div>
    {canRefresh && <button className={`date-refresh-btn ${refreshStatus}`} disabled={invalid || refreshStatus === "loading"} onClick={onRefresh}><ArrowsClockwise size={15}/>{refreshStatus === "loading" ? "加载中" : refreshStatus === "done" ? "已刷新" : refreshStatus === "missing" ? "请先导入数据" : "刷新数据"}</button>}
    {refreshStatus === "loading" && refreshProgress && <div className="date-refresh-progress"><span>{refreshProgress.label}</span><b>{Math.round(refreshProgress.percent || 0)}%</b><i style={{ width: `${Math.max(3, Math.min(100, refreshProgress.percent || 0))}%` }} /></div>}
    <FontSizeControl value={fontSize} onChange={onFontSize}/>
    {(invalid2025 || invalid2026) && <em>同一年度的开始日期不能晚于结束日期</em>}
  </div>;
}

function ThemeToggle({ value, onChange }) {
  return <div className="theme-switcher" aria-label="风格切换">
    <button className={value === "classic" ? "active" : ""} onClick={() => onChange("classic")}>class</button>
    <button className={value === "apple" ? "active" : ""} onClick={() => onChange("apple")}>Apple</button>
  </div>;
}

function ExecutiveSidebar({ active, setActive, uiTheme, onThemeChange, collapsed, onToggleCollapsed, permissions, auth }) {
  const nav = [
    ["总览", House], ["IQC", Cube], ["IPQC", Pulse],
    ["OQC", ShieldCheck], ["DQA", ClipboardText],
    ...(canUseFeature(auth, permissions, "dataImport") ? [["数据导入", UploadSimple]] : []),
    ...(auth?.isAdmin ? [["权限设置", GearSix]] : []),
  ];
  return <aside className={`executive-sidebar ${collapsed ? "collapsed" : ""}`}>
    <div className="brand"><div className="brand-logo"><ShieldCheck size={26} weight="fill" /></div><div><strong>品质智控</strong><span>质量分析平台</span></div></div>
    <nav>{nav.map(([name, Icon]) => <button key={name} className={active === name ? "active" : ""} onClick={() => setActive(name)}><Icon size={20} /><span>{name}</span></button>)}</nav>
    <div className="sidebar-bottom"><ThemeToggle value={uiTheme} onChange={onThemeChange}/></div>
    <button className="sidebar-drawer-toggle" aria-label={collapsed ? "展开导航" : "收起导航"} onClick={onToggleCollapsed}><SidebarSimple size={18} /></button>
  </aside>;
}

const moduleLabels = { IQC: "来料检验", IPQC: "过程检验", OQC: "出货评分", DQA: "研发质量" };

const ipqcMapText = {
  title: "IPQC 工坊-交付经理-机长映射设置",
  desc: "映射表会作为 IPQC 配置保存。新增机长未覆盖时，可在这里直接补充，不必反复上传表格。",
  export: "导出映射表",
  add: "新增一行",
  save: "保存映射",
  import: "导入/替换映射表",
  uncovered: "IPQC数据中未覆盖机长",
};

const ipqcFileSite = (fileName = "") => fileName.includes("杭州") ? "杭州" : "深圳";
const rowText = (row, key) => row?.[key] == null ? "" : String(row[key]).trim();
const yearFromValue = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
};

function IpqcMappingSettings({ files, onImportModule, onSourcesChanged }) {
  const mappingFile = files.find((file) => file.kind === "IPQC_LEADER_MAP");
  const [collapsed, setCollapsed] = useState(true);
  const [rows, setRows] = useState([]);
  useEffect(() => {
    setRows(normalizeIpqcLeaderMapRows(mappingFile?.rows || []).map((row) => ({
      site: row.site,
      workshop: row.workshop,
      manager: row.manager,
      leader: row.leader,
    })));
  }, [mappingFile?.importedAt, mappingFile?.rows?.length]);

  const mappedKeys = useMemo(() => new Set(rows.filter((row) => row.site && row.leader).map((row) => `${row.site}::${row.leader}`)), [rows]);
  const uncovered = useMemo(() => {
    const map = new Map();
    files.filter((file) => file.module === "IPQC" && file.kind !== "IPQC_LEADER_MAP").forEach((file) => {
      const site = ipqcFileSite(file.name);
      (file.rows || []).forEach((row) => {
        const leader = rowText(row, "机长");
        if (!leader || mappedKeys.has(`${site}::${leader}`)) return;
        const year = yearFromValue(row["日期"]);
        if (year && year !== 2026) return;
        const workshop = normalizeIpqcWorkshop(rowText(row, "产品工坊") || rowText(row, "工坊"));
        const key = `${site}::${leader}`;
        if (!map.has(key)) map.set(key, { site, leader, workshop, count: 0 });
        map.get(key).count += 1;
      });
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [files, mappedKeys]);

  const update = (index, key, value) => setRows((current) => current.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const remove = (index) => setRows((current) => current.filter((_, i) => i !== index));
  const addRow = (row = {}) => setRows((current) => [...current, { site: row.site || "深圳", workshop: row.workshop || "一工坊", manager: row.manager || "", leader: row.leader || "" }]);
  const save = async () => {
    const normalized = normalizeIpqcLeaderMapRows(rows.map((row) => ({
      厂区: row.site,
      工坊: normalizeIpqcWorkshop(row.workshop),
      交付经理: row.manager,
      机长: row.leader,
    })));
    const source = {
      name: mappingFile?.name || "IPQC工坊交付经理机长映射表_在线设置.xlsx",
      size: JSON.stringify(normalized).length,
      module: "IPQC",
      kind: "IPQC_LEADER_MAP",
      subKind: "IPQC_LEADER_MAP",
      rows: normalized.map((row) => ({ 厂区: row.site, 工坊: row.workshop, 交付经理: row.manager, 机长: row.leader })),
      sheets: ["在线设置"],
      importedAt: new Date().toISOString(),
    };
    const next = [...files.filter((file) => file.kind !== "IPQC_LEADER_MAP"), source];
    await onSourcesChanged(next, { added: mappingFile ? [] : [source.name], replaced: mappingFile ? [source.name] : [] });
  };
  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const sheetRows = [["厂区", "工坊", "交付经理", "机长"], ...rows.map((row) => [row.site, normalizeIpqcWorkshop(row.workshop), row.manager, row.leader])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetRows), "映射表");
    XLSX.writeFile(wb, "工坊交付经理机长映射表.xlsx");
  };
  return <section className="ipqc-map-settings">
    <header>
      <div><h3>{ipqcMapText.title}</h3><p>{ipqcMapText.desc}</p></div>
      <div className="ipqc-map-actions">
        <button onClick={() => setCollapsed((current) => !current)}><CaretDown size={15} className={collapsed ? "" : "rotate"}/>{collapsed ? "展开设置" : "收起设置"}</button>
        <button onClick={() => onImportModule("IPQC")}><UploadSimple size={15}/>{ipqcMapText.import}</button>
        <button onClick={exportXlsx}><DownloadSimple size={15}/>{ipqcMapText.export}</button>
        <button className="primary-btn" onClick={save}><FloppyDisk size={15}/>{ipqcMapText.save}</button>
      </div>
    </header>
    {!collapsed && <div className="ipqc-map-body">
      <div className="ipqc-map-table">
        <div className="ipqc-map-row head"><span>厂区</span><span>工坊</span><span>交付经理</span><span>机长</span><span>操作</span></div>
        {rows.map((row, index) => <div className="ipqc-map-row" key={`${row.site}-${row.leader}-${index}`}>
          <select value={row.site} onChange={(event) => update(index, "site", event.target.value)}><option>深圳</option><option>杭州</option></select>
          <input value={row.workshop} onChange={(event) => update(index, "workshop", event.target.value)} />
          <input value={row.manager} onChange={(event) => update(index, "manager", event.target.value)} />
          <input value={row.leader} onChange={(event) => update(index, "leader", event.target.value)} />
          <button className="delete-source" onClick={() => remove(index)}><Trash size={14}/>删除</button>
        </div>)}
        <button className="ipqc-map-add" onClick={() => addRow()}><Plus size={15}/>{ipqcMapText.add}</button>
      </div>
      <aside className="ipqc-unmapped-box">
        <h4>{ipqcMapText.uncovered}<small>{uncovered.length}人</small></h4>
        <div>
          {uncovered.slice(0, 18).map((item) => <button key={`${item.site}-${item.leader}`} onClick={() => addRow(item)}>
            <strong>{item.leader}</strong><span>{item.site} · {item.workshop}</span><em>{item.count}行</em>
          </button>)}
          {!uncovered.length && <p>当前 IPQC 机长都已覆盖。</p>}
        </div>
      </aside>
    </div>}
  </section>;
}

function DataSourcePage({ files, onImportModule, onDelete, onSourcesChanged }) {
  const modules = ["IQC", "IPQC", "OQC", "DQA"];
  return <div className="data-source-page">
    <div className="data-source-hero">
      <div><Database size={30}/><div><h2>本地数据源管理</h2><p>数据已保存到当前电脑。相同模块且文件名相同再次导入时自动替换，也可以手动删除后重传。</p></div></div>
    </div>
    <IpqcMappingSettings files={files} onImportModule={onImportModule} onSourcesChanged={onSourcesChanged}/>
    <div className="data-source-modules">
      {modules.map((module) => {
        const Icon = moduleIcons[module];
        const rows = files.filter((file) => file.module === module);
        return <section className="data-source-module" key={module}>
          <header><span className={`dataset-icon ${moduleColor[module]}`}><Icon size={22}/></span><div><h3>{module} · {moduleLabels[module]}</h3><p>{rows.length}个数据源</p></div><button onClick={() => onImportModule(module)}><UploadSimple size={16}/>导入/替换</button></header>
          <div className="source-file-table">
            <div className="source-file-row source-file-head"><span>文件名</span><span>数据行数</span><span>工作表</span><span>导入时间</span><span>操作</span></div>
            {rows.map((file) => <div className="source-file-row" key={`${file.module}-${file.name}`}>
              <strong><FileXls size={16}/>{file.name}</strong><span>{sourceRowCount(file).toLocaleString()}</span><span>{file.sheets.length}</span>
              <span>{new Date(file.importedAt).toLocaleString("zh-CN", { hour12: false })}</span>
              <button className="delete-source" onClick={() => onDelete(file)}><Trash size={15}/>删除</button>
            </div>)}
            {!rows.length && <div className="source-empty">尚未导入{module}数据</div>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}

function PermissionTable({ rows, onChange, showKey = false }) {
  return <div className="permission-table">
    <div className={`permission-row permission-head ${showKey ? "with-key" : ""}`}><span>名称</span>{showKey && <span>接口</span>}<span>普通用户允许</span><span>副管理员允许</span></div>
    {Object.entries(rows || {}).map(([key, row]) => <div className={`permission-row ${showKey ? "with-key" : ""}`} key={key}>
      <strong>{row.label || key}</strong>
      {showKey && <code>{key}</code>}
      <label><input type="checkbox" checked={!!row.public} onChange={(event) => onChange(key, "public", event.target.checked)} />允许</label>
      <label><input type="checkbox" checked={row.deputy !== false} onChange={(event) => onChange(key, "deputy", event.target.checked)} />允许</label>
    </div>)}
  </div>;
}

function PermissionSettingsPage({ auth, permissions, onPermissionsChanged }) {
  const [draft, setDraft] = useState(() => normalizePermissions(permissions));
  const [newIp, setNewIp] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => setDraft(normalizePermissions(permissions)), [permissions]);
  const updateRule = (group, key, field, value) => setDraft((current) => ({
    ...current,
    [group]: { ...current[group], [key]: { ...current[group][key], [field]: value } },
  }));
  const addIp = () => {
    const ip = newIp.trim();
    if (!ip) return;
    setDraft((current) => ({ ...current, deputyAdmins: [...new Set([...(current.deputyAdmins || []), ip])] }));
    setNewIp("");
  };
  const removeIp = (ip) => setDraft((current) => ({ ...current, deputyAdmins: (current.deputyAdmins || []).filter((item) => item !== ip) }));
  const save = async () => {
    setStatus("保存中...");
    const result = await savePermissionConfig(draft);
    if (result?.permissions) {
      onPermissionsChanged(result.permissions);
      setStatus("已保存");
    } else {
      setStatus("保存失败，请确认当前IP是否为主管理员");
    }
    setTimeout(() => setStatus(""), 2600);
  };
  return <div className="permission-page">
    <section className="permission-hero"><div><h2>权限设置</h2><p>当前访问IP：{auth?.ip || "-"}；角色：{auth?.role || "public"}。主管理员永远拥有全部权限，副管理员按下方开关授权。</p></div><button className="primary-btn" onClick={save}><FloppyDisk size={16}/>保存权限</button></section>
    {status && <div className="permission-status">{status}</div>}
    <section className="permission-card"><header><h3>副管理员 IP</h3><span>添加后，可通过“副管理员允许”列控制功能和接口。</span></header><div className="permission-ip-input"><input value={newIp} onChange={(event) => setNewIp(event.target.value)} placeholder="输入副管理员IP，例如 192.168.230.50" /><button onClick={addIp}><Plus size={15}/>添加</button></div><div className="permission-ip-list">{(draft.deputyAdmins || []).map((ip) => <span key={ip}>{ip}<button onClick={() => removeIp(ip)}><X size={13}/></button></span>)}{!(draft.deputyAdmins || []).length && <em>暂未设置副管理员 IP</em>}</div></section>
    <section className="permission-card"><header><h3>功能权限</h3><span>控制普通用户/副管理员在界面上能看到哪些功能。</span></header><PermissionTable rows={draft.features} onChange={(key, field, value) => updateRule("features", key, field, value)} /></section>
    <section className="permission-card"><header><h3>接口权限</h3><span>控制浏览器控制台直接调用接口时是否允许。</span></header><PermissionTable rows={draft.apis} onChange={(key, field, value) => updateRule("apis", key, field, value)} showKey /></section>
  </div>;
}

const buildSupplierCandidates = (data) => ["深圳", "杭州"].flatMap((site) => {
  const rows = [...(data.iqc.mainSuppliers?.[site] || []), ...(data.iqc.supplierCandidates?.[site] || [])];
  const unique = new Map();
  rows.forEach((row) => {
    const key = `${site}::${row.supplier}`;
    if (!unique.has(key) || (row.y2026Qty || 0) > (unique.get(key).y2026Qty || 0)) unique.set(key, { ...row, site, key });
  });
  return [...unique.values()];
});

function SupplierPicker({ candidates, selected, setSelected, title }) {
  const [pending, setPending] = useState("");
  const add = () => {
    if (!pending || selected.includes(pending)) return;
    setSelected((current) => [...current, pending]);
    setPending("");
  };
  return <div className="overview-risk-control">
    <span>{title}</span>
    <select value={pending} onChange={(event) => setPending(event.target.value)}>
      <option value="">选择深圳或杭州供应商</option>
      {candidates.filter((row) => !selected.includes(row.key)).map((row) => <option key={row.key} value={row.key}>{row.site} · {row.supplier} · {row.type}</option>)}
    </select>
    <button onClick={add} disabled={!pending}><Plus size={14}/>加入</button>
    <small>选择后自动保存</small>
  </div>;
}

function MainSupplierOverview({ data }) {
  const candidates = useMemo(() => buildSupplierCandidates(data), [data]);
  const defaults = useMemo(() => ["深圳", "杭州"].flatMap((site) => (data.iqc.mainSuppliers?.[site] || []).map((row) => `${site}::${row.supplier}`)), [data]);
  const [selected, setSelected] = useState(() => {
    const saved = localStorage.getItem("qms-overview-main-suppliers");
    return saved == null ? null : JSON.parse(saved);
  });
  useEffect(() => { setSelected((current) => current == null ? defaults : current); }, [defaults]);
  useEffect(() => {
    if (selected != null) localStorage.setItem("qms-overview-main-suppliers", JSON.stringify(selected));
  }, [selected]);
  const active = selected ?? defaults;
  const rowsBySite = Object.fromEntries(["深圳", "杭州"].map((site) => [
    site,
    active.map((key) => candidates.find((row) => row.key === key)).filter((row) => row?.site === site),
  ]));
  return <>
    <Panel title="主力供应商选择" subtitle="默认沿用当前名单；可增加或移除，选择结果保存在当前电脑" className="span-12">
      <SupplierPicker candidates={candidates} selected={active} setSelected={setSelected} title="配置主力供应商"/>
      <div className="supplier-selection-chips">{active.map((key) => {
        const row = candidates.find((item) => item.key === key);
        return row ? <button key={key} onClick={() => setSelected((current) => current.filter((item) => item !== key))}>{row.site} · {row.supplier}<X size={13}/></button> : null;
      })}</div>
    </Panel>
    <AxisControlledPanel title="深圳主力供应商批次良率对比" subtitle="柱形为检验总数/不合格数，折线为批次良率" className="span-6" axisKey="overview-main-supplier-shenzhen-axis-v1" defaults={{ min: 80, max: 100 }}>{(axis) => <QuantityRateCombo rows={rowsBySite.深圳} labelKey="supplier" height={350} rateAxisOverride={axis.effective} hideRateAxisControl/>}</AxisControlledPanel>
    <AxisControlledPanel title="杭州主力供应商批次良率对比" subtitle="柱形为检验总数/不合格数，折线为批次良率" className="span-6" axisKey="overview-main-supplier-hangzhou-axis-v1" defaults={{ min: 80, max: 100 }}>{(axis) => <QuantityRateCombo rows={rowsBySite.杭州} labelKey="supplier" height={350} rateAxisOverride={axis.effective} hideRateAxisControl/>}</AxisControlledPanel>
  </>;
}

function ManualRiskSuppliers({ data }) {
  const candidates = useMemo(() => buildSupplierCandidates(data), [data]);
  const [selected, setSelected] = useState(() => {
    const saved = localStorage.getItem("qms-overview-risk-suppliers-v2");
    return saved == null ? ["杭州::优之达（原新达NT）", "深圳::铭耀（钣金）"] : JSON.parse(saved);
  });
  useEffect(() => { localStorage.setItem("qms-overview-risk-suppliers-v2", JSON.stringify(selected)); }, [selected]);
  const rows = selected.map((key) => candidates.find((row) => row.key === key)).filter(Boolean);
  return <>
    <SupplierPicker candidates={candidates} selected={selected} setSelected={setSelected} title="人工选择风险供应商"/>
    <div className="overview-risk-table">
      <div className="overview-risk-row overview-risk-head"><span>地点</span><span>供应商</span><span>加工类型</span><span>2025良率</span><span>2026良率</span><span>同比</span><span>2026异常/总数</span><span>操作</span></div>
      {rows.map((row) => <div className="overview-risk-row" key={row.key}>
        <b>{row.site}</b><strong>{row.supplier}</strong><span>{row.type}</span><span>{row.y2025Rate}%</span>
        <span className={row.y2026Rate < 90 ? "rate-risk" : ""}>{row.y2026Rate}%</span>
        <span className={row.y2026Rate >= row.y2025Rate ? "up" : "down"}>{row.y2026Rate >= row.y2025Rate ? "↑" : "↓"} {Math.abs(row.y2026Rate - row.y2025Rate).toFixed(1)}pp</span>
        <span>{row.y2026Bad.toLocaleString()} / {row.y2026Qty.toLocaleString()}</span>
        <button onClick={() => setSelected((current) => current.filter((key) => key !== row.key))}><X size={14}/>移除</button>
      </div>)}
      {!rows.length && <div className="source-empty">尚未选择风险供应商，请从上方名单人工加入。</div>}
    </div>
  </>;
}

function IpqcWorkshopRisk({ data }) {
  const [expanded, setExpanded] = useState(false);
  const rows = ["深圳", "杭州"].flatMap((site) => (data.ipqc.workshopsBySite?.[site] || []).map((row) => ({
    ...row, site, delta: Number((row.y2026Rate - row.y2025Rate).toFixed(2)),
  }))).sort((a, b) => b.y2026Rate - a.y2026Rate);
  const visibleRows = expanded ? rows : rows.slice(0, 5);
  return <div className="overview-workshop-table">
    <div className="overview-workshop-row overview-workshop-head"><span>地点</span><span>工坊</span><span>2025送检数</span><span>2025问题数</span><span>2025密度</span><span>2026送检数</span><span>2026问题数</span><span>2026密度</span><span>同比</span></div>
    {visibleRows.map((row) => <div className="overview-workshop-row" key={`${row.site}-${row.name}`}>
      <b>{row.site}</b><strong>{row.name}</strong><span>{row.y2025Qty.toLocaleString()}</span><span>{row.y2025Bad.toLocaleString()}</span><span>{row.y2025Rate}%</span>
      <span>{row.y2026Qty.toLocaleString()}</span><span>{row.y2026Bad.toLocaleString()}</span><span className={row.y2026Rate >= 10 ? "rate-risk" : ""}>{row.y2026Rate}%</span>
      <span className={row.delta <= 0 ? "up" : "down"}>{row.delta > 0 ? "↑" : "↓"} {Math.abs(row.delta).toFixed(2)}pp</span>
    </div>)}
    {!rows.length && <div className="source-empty">导入IPQC数据后显示工坊风险排序。</div>}
    {rows.length > 5 && <button className="workshop-expand-btn" onClick={() => setExpanded((current) => !current)}>
      {expanded ? "收起其它工坊" : `展开其它 ${rows.length - 5} 个工坊`}
      <CaretDown size={14} className={expanded ? "rotate" : ""}/>
    </button>}
  </div>;
}

const sumRows = (rows = [], getter) => rows.reduce((sum, row) => sum + (Number(getter(row)) || 0), 0);
const percentText = (value, digits = 1) => `${Number(value || 0).toFixed(digits)}%`;
const numberText = (value) => Number(value || 0).toLocaleString();
const signedText = (value, suffix = "pp", digits = 1) => `${value >= 0 ? "↑" : "↓"} ${Math.abs(Number(value || 0)).toFixed(digits)}${suffix ? suffix : ""}`;

const yearTotalsFromMonthly = (rows = [], year) => rows.reduce((result, row) => ({
  qty: result.qty + (Number(row[`y${year}Qty`]) || 0),
  bad: result.bad + (Number(row[`y${year}Bad`]) || 0),
  good: result.good + ((Number(row[`y${year}Qty`]) || 0) - (Number(row[`y${year}Bad`]) || 0)),
}), { qty: 0, bad: 0, good: 0 });

const rateFromTotals = (totals, goodWhenDown = false) => {
  if (goodWhenDown) return Number((totals.bad / Math.max(totals.qty, 1) * 100).toFixed(2));
  return Number((totals.good / Math.max(totals.qty, 1) * 100).toFixed(1));
};

function OverviewMetricLine({ label, y2026, y2025, delta, deltaUnit = "pp", deltaDigits = 1, tone = "neutral", goodWhenDown = false }) {
  const deltaValue = Number(delta || 0);
  const deltaTone = goodWhenDown ? (deltaValue <= 0 ? "good" : "bad") : (deltaValue >= 0 ? "good" : "bad");
  return <div className="overview-kpi-line">
    <span>{label}</span>
    <div className="overview-kpi-year-values">
      <b>{y2025}</b>
      <b className={tone}>{y2026}</b>
    </div>
    <strong className={deltaTone}>{signedText(deltaValue, deltaUnit, deltaDigits)}</strong>
  </div>;
}

const compactMetricValue = (value, digits = 1) => value == null || value === "" ? "-"
  : typeof value === "number"
  ? Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits })
  : value;
const metricWithUnit = (value, unit, digits = 1) => value == null || value === "" ? "-" : `${compactMetricValue(value, digits)}${unit}`;

function OverviewQualityCard({ type, title, subtitle, mainValue, previousValue, unit = "%", previousUnit = unit, delta, deltaUnit = "pp", goodWhenDown = false, lines = [] }) {
  const deltaGood = goodWhenDown ? Number(delta || 0) <= 0 : Number(delta || 0) >= 0;
  const mainDigits = unit === "项" || Number(mainValue || 0) > 100 ? 0 : 2;
  const previousDigits = previousUnit === "项" || Number(previousValue || 0) > 100 ? 0 : 2;
  return <div className={`overview-kpi-card ${type}`}>
    <div className="overview-kpi-head">
      <div><span>{subtitle}</span><strong>{title}</strong></div>
      <em className={deltaGood ? "good" : "bad"}>{signedText(delta || 0, deltaUnit, Math.abs(delta || 0) < 10 ? 1 : 0)}</em>
    </div>
    <div className={`overview-kpi-main ${type === "ipqc" || type === "dqa" ? "risk-main" : ""}`}>
      <strong>{compactMetricValue(mainValue, mainDigits)}</strong><small>{unit}</small>
    </div>
    <div className="overview-kpi-baseline">
      <span>2025同期</span><b>{metricWithUnit(previousValue, previousUnit, previousDigits)}</b>
    </div>
    <div className="overview-kpi-lines">
      <div className="overview-kpi-line-head"><span>指标</span><b>2025</b><b>2026</b><b>同比</b></div>
      {lines.map((line) => <OverviewMetricLine key={line.label} {...line}/>)}
    </div>
  </div>;
}

function OverviewKpiCards({ data }) {
  const iqcOverall = (() => {
    const rows = ["深圳", "杭州"].flatMap((site) => data.iqc.siteMonthly?.[site] || []);
    const y25 = yearTotalsFromMonthly(rows, 2025);
    const y26 = yearTotalsFromMonthly(rows, 2026);
    return {
      y2025Rate: rateFromTotals(y25, false),
      y2026Rate: rateFromTotals(y26, false),
      y2025Qty: y25.qty,
      y2026Qty: y26.qty,
    };
  })();
  const ipqcOverall = (() => {
    const rows = ["深圳", "杭州"].flatMap((site) => data.ipqc.siteMonthly?.[site] || []);
    const y25 = yearTotalsFromMonthly(rows, 2025);
    const y26 = yearTotalsFromMonthly(rows, 2026);
    return {
      y2025Rate: rateFromTotals(y25, true),
      y2026Rate: rateFromTotals(y26, true),
      y2025Qty: y25.qty,
      y2026Qty: y26.qty,
      y2025Bad: y25.bad,
      y2026Bad: y26.bad,
    };
  })();
  const iqcSite = (site) => {
    const rows = data.iqc.siteMonthly?.[site] || [];
    const y25 = yearTotalsFromMonthly(rows, 2025);
    const y26 = yearTotalsFromMonthly(rows, 2026);
    const r25 = rateFromTotals(y25, false);
    const r26 = rateFromTotals(y26, false);
    return { y2025Rate: r25, y2026Rate: r26, delta: Number((r26 - r25).toFixed(1)), y2025Qty: y25.qty, y2026Qty: y26.qty };
  };
  const ipqcSite = (site) => {
    const rows = data.ipqc.siteMonthly?.[site] || [];
    const y25 = yearTotalsFromMonthly(rows, 2025);
    const y26 = yearTotalsFromMonthly(rows, 2026);
    const r25 = rateFromTotals(y25, true);
    const r26 = rateFromTotals(y26, true);
    return { y2025Rate: r25, y2026Rate: r26, delta: Number((r26 - r25).toFixed(2)), y2025Qty: y25.qty, y2026Qty: y26.qty, y2025Bad: y25.bad, y2026Bad: y26.bad };
  };
  const oqcOverall = (() => {
    const detail = data.oqc.shipmentDetail?.overall;
    if (detail?.y2026?.count) return {
      five25: detail.y2025.fiveRate,
      five: detail.y2026.fiveRate,
      low25: detail.y2025.lowRate,
      low: detail.y2026.lowRate,
      lowCount25: detail.y2025.low,
      lowCount: detail.y2026.low,
      count25: detail.y2025.count,
      count: detail.y2026.count,
      deltaFive: Number((detail.y2026.fiveRate - detail.y2025.fiveRate).toFixed(1)),
      deltaLow: Number((detail.y2026.lowRate - detail.y2025.lowRate).toFixed(1)),
    };
    const divisions = data.oqc.monthlySummary?.divisions || [];
    const y2026Count = sumRows(divisions, (row) => row.y2026Count);
    const y2025Count = sumRows(divisions, (row) => row.y2025Count);
    const y2026Five = sumRows(divisions, (row) => row.y2026Five);
    const y2025Five = sumRows(divisions, (row) => row.y2025Five);
    const y2026Low = sumRows(divisions, (row) => row.y2026Low);
    const y2025Low = sumRows(divisions, (row) => row.y2025Low);
    const five = Number((y2026Five / Math.max(y2026Count, 1) * 100).toFixed(1));
    const low = Number((y2026Low / Math.max(y2026Count, 1) * 100).toFixed(1));
    const five25 = Number((y2025Five / Math.max(y2025Count, 1) * 100).toFixed(1));
    const low25 = Number((y2025Low / Math.max(y2025Count, 1) * 100).toFixed(1));
    return { five25, five, low25, low, lowCount25: y2025Low, lowCount: y2026Low, count25: y2025Count, count: y2026Count, deltaFive: Number((five - five25).toFixed(1)), deltaLow: Number((low - low25).toFixed(1)) };
  })();
  const dqaRows = data.dqa.divisions || [];
  const dqaReview = sumRows(dqaRows, (row) => row.review);
  const dqaProduction = sumRows(dqaRows, (row) => row.production);
  const dqaOnsite = sumRows(dqaRows, (row) => row.onsite);
  const dqaBack = dqaProduction + dqaOnsite;
  const dqaStage2025 = (() => {
    const stageRows = data.dqa.yearCompare?.byDivision?.stages || [];
    if (stageRows.length) {
      return stageRows.reduce((result, row) => {
        const y2025 = row.years?.find((item) => item.year === 2025) || { counts: {} };
        result.review += y2025.counts?.评审 || 0;
        result.production += y2025.counts?.生产 || 0;
        result.onsite += y2025.counts?.现场 || 0;
        return result;
      }, { review: 0, production: 0, onsite: 0 });
    }
    const delta = Number(data.kpis[3]?.delta || 0);
    return { review: 0, production: 0, onsite: Math.round((dqaBack || data.kpis[3]?.value || 0) / Math.max(1 + delta / 100, 0.01)) };
  })();
  const dqaBack2025 = dqaStage2025.production + dqaStage2025.onsite;
  const shenzhenIqc = iqcSite("深圳");
  const hangzhouIqc = iqcSite("杭州");
  const shenzhenIpqc = ipqcSite("深圳");
  const hangzhouIpqc = ipqcSite("杭州");

  return <div className="overview-kpi-grid">
    <OverviewQualityCard type="iqc" title="IQC 批次良率" subtitle="供应商加工件" mainValue={iqcOverall.y2026Rate || data.kpis[0]?.value || 0} previousValue={iqcOverall.y2025Rate} delta={data.kpis[0]?.delta || 0} lines={[
      { label: "深圳", y2026: percentText(shenzhenIqc.y2026Rate), y2025: percentText(shenzhenIqc.y2025Rate), tone: shenzhenIqc.delta >= 0 ? "good" : "bad", delta: shenzhenIqc.delta, deltaUnit: "pp", deltaDigits: 1 },
      { label: "杭州", y2026: percentText(hangzhouIqc.y2026Rate), y2025: percentText(hangzhouIqc.y2025Rate), tone: hangzhouIqc.delta >= 0 ? "good" : "bad", delta: hangzhouIqc.delta, deltaUnit: "pp", deltaDigits: 1 },
      { label: "检验批次", y2026: numberText(iqcOverall.y2026Qty), y2025: numberText(iqcOverall.y2025Qty), tone: "neutral", delta: (iqcOverall.y2026Qty || 0) - (iqcOverall.y2025Qty || 0), deltaUnit: "", deltaDigits: 0 },
    ]}/>
    <OverviewQualityCard type="ipqc" title="IPQC 异常密度" subtitle="问题数量 ÷ 送检数" mainValue={ipqcOverall.y2026Rate || data.kpis[1]?.value || 0} previousValue={ipqcOverall.y2025Rate} delta={data.kpis[1]?.delta || 0} goodWhenDown lines={[
      { label: "深圳", y2026: percentText(shenzhenIpqc.y2026Rate, 2), y2025: percentText(shenzhenIpqc.y2025Rate, 2), tone: shenzhenIpqc.delta <= 0 ? "good" : "bad", delta: shenzhenIpqc.delta, deltaUnit: "pp", deltaDigits: 2, goodWhenDown: true },
      { label: "杭州", y2026: percentText(hangzhouIpqc.y2026Rate, 2), y2025: percentText(hangzhouIpqc.y2025Rate, 2), tone: hangzhouIpqc.delta <= 0 ? "good" : "bad", delta: hangzhouIpqc.delta, deltaUnit: "pp", deltaDigits: 2, goodWhenDown: true },
      { label: "问题数量", y2026: numberText(ipqcOverall.y2026Bad), y2025: numberText(ipqcOverall.y2025Bad), tone: "bad", delta: (ipqcOverall.y2026Bad || 0) - (ipqcOverall.y2025Bad || 0), deltaUnit: "", deltaDigits: 0, goodWhenDown: true },
    ]}/>
    <OverviewQualityCard type="oqc" title="OQC 5分率" subtitle="出货评分" mainValue={oqcOverall.five} previousValue={oqcOverall.five25} delta={oqcOverall.deltaFive} lines={[
      { label: "低分率", y2026: percentText(oqcOverall.low), y2025: percentText(oqcOverall.low25), tone: oqcOverall.deltaLow <= 0 ? "good" : "bad", delta: oqcOverall.deltaLow, deltaUnit: "pp", deltaDigits: 1, goodWhenDown: true },
      { label: "评分数量", y2026: numberText(oqcOverall.count), y2025: numberText(oqcOverall.count25), tone: "neutral", delta: (oqcOverall.count || 0) - (oqcOverall.count25 || 0), deltaUnit: "", deltaDigits: 0 },
      { label: "5分率", y2026: percentText(oqcOverall.five), y2025: percentText(oqcOverall.five25), tone: oqcOverall.deltaFive >= 0 ? "good" : "bad", delta: oqcOverall.deltaFive, deltaUnit: "pp", deltaDigits: 1 },
    ]}/>
    <OverviewQualityCard type="dqa" title="DQA 后端问题" subtitle="生产 + 现场，不含评审拦截" mainValue={dqaBack || data.kpis[3]?.value || 0} previousValue={dqaBack2025} unit="项" delta={data.kpis[3]?.delta || 0} deltaUnit="%" goodWhenDown lines={[
      { label: "评审拦截", y2026: `${numberText(dqaReview)}项`, y2025: `${numberText(dqaStage2025.review)}项`, tone: "good", delta: dqaReview - dqaStage2025.review, deltaUnit: "项", deltaDigits: 0 },
      { label: "生产问题", y2026: `${numberText(dqaProduction)}项`, y2025: `${numberText(dqaStage2025.production)}项`, tone: "bad", delta: dqaProduction - dqaStage2025.production, deltaUnit: "项", deltaDigits: 0, goodWhenDown: true },
      { label: "现场问题", y2026: `${numberText(dqaOnsite)}项`, y2025: `${numberText(dqaStage2025.onsite)}项`, tone: "bad", delta: dqaOnsite - dqaStage2025.onsite, deltaUnit: "项", deltaDigits: 0, goodWhenDown: true },
    ]}/>
  </div>;
}

function OqcOverviewScore({ data }) {
  const rows = data.oqc.monthlySummary?.divisions || [];
  const text = {
    productOne: "\u4ea7\u54c1\u4e00\u90e8",
    semi: "\u534a\u5bfc\u4f53&\u5317\u7f8e",
    score2026: "2026\u51fa\u8d27\u8bc4\u5206",
    fiveRate: "5\u5206\u6bd4\u4f8b",
    lowRate: "\u4f4e\u5206\u6bd4\u4f8b \u22643\u5206",
    count: "\u8bc4\u5206\u6570\u91cf",
    empty: "\u5bfc\u5165OQC\u6708\u5ea6\u8bc4\u5206\u6c47\u603b\u540e\u663e\u793a\u4ea7\u54c1\u90e8\u6307\u6807\u3002",
  };
  const displayName = (name) => name === text.productOne ? text.semi : name;
  return <div className="oqc-overview-score oqc-overview-cards">
    {rows.map((row, index) => <div className={`oqc-division-card oqc-card-tone-${index % 3}`} key={row.name}>
      <div className="oqc-card-head">
        <strong>{displayName(row.name)}</strong>
        <span>{text.score2026}</span>
      </div>
      <div className="oqc-five-rate">
        <em>{text.fiveRate}</em>
        <b>{row.y2026FiveRate || 0}%</b>
      </div>
      <div className="oqc-card-bottom">
        <div className="oqc-low-rate"><span>{text.lowRate}</span><b>{row.y2026LowRate || 0}%</b></div>
        <div className="oqc-score-count"><span>{text.count}</span><b>{(row.y2026Count || 0).toLocaleString()}</b></div>
      </div>
    </div>)}
    {!rows.length && <div className="source-empty">{text.empty}</div>}
  </div>;
}

function ManagementReportPage({ data }) {
  const [annotations] = useAnnotations();
  const kpis = data.kpis || [];
  const oqc = data.oqc.shipmentDetail?.overall?.y2026;
  const iqcWorst = ["深圳", "杭州"].flatMap((site) => (data.iqc.mainSuppliers?.[site] || []).map((row) => ({ ...row, site })))
    .sort((a, b) => (a.y2026Rate || 0) - (b.y2026Rate || 0)).slice(0, 3);
  const ipqcRisk = ["深圳", "杭州"].flatMap((site) => (data.ipqc.workshopsBySite?.[site] || []).map((row) => ({ ...row, site })))
    .sort((a, b) => (b.y2026Rate || 0) - (a.y2026Rate || 0)).slice(0, 3);
  const dqaBack = (data.dqa.divisions || []).map((row) => ({ ...row, back: (row.production || 0) + (row.onsite || 0) }))
    .sort((a, b) => b.back - a.back);
  const dqaTotalReview = sumRows(data.dqa.divisions || [], (row) => row.review);
  const dqaTotalBack = sumRows(data.dqa.divisions || [], (row) => (row.production || 0) + (row.onsite || 0));
  const reportCards = [
    { label: "IQC批次良率", value: `${kpis[0]?.value ?? "-"}%`, delta: kpis[0]?.delta, goodWhenDown: false, note: "供应商加工件质量" },
    { label: "IPQC异常密度", value: `${kpis[1]?.value ?? "-"}%`, delta: kpis[1]?.delta, goodWhenDown: true, note: "过程问题数量÷送检数" },
    { label: "OQC 5分率", value: `${kpis[2]?.value ?? "-"}%`, delta: kpis[2]?.delta, goodWhenDown: false, note: `低分率 ${oqc?.lowRate ?? "-"}%` },
    { label: "DQA后端问题", value: `${Number(dqaTotalBack || kpis[3]?.value || 0).toLocaleString()}项`, delta: kpis[3]?.delta, goodWhenDown: true, note: `评审拦截 ${dqaTotalReview.toLocaleString()}项` },
  ];
  const deltaClass = (item) => (item.goodWhenDown ? (item.delta <= 0 ? "good" : "bad") : (item.delta >= 0 ? "good" : "bad"));
  const reportRows = normalizeAnnotations(annotations)
    .filter((row) => row.include !== false && String(row.content || "").trim())
    .sort((a, b) => {
      const moduleA = annotationModules.indexOf(a.module);
      const moduleB = annotationModules.indexOf(b.module);
      const typeA = annotationTypes.indexOf(a.type);
      const typeB = annotationTypes.indexOf(b.type);
      return (moduleA < 0 ? 999 : moduleA) - (moduleB < 0 ? 999 : moduleB) || (typeA < 0 ? 999 : typeA) - (typeB < 0 ? 999 : typeB);
    });
  const rowsByTypes = (types) => reportRows.filter((row) => types.includes(row.type));
  const groupReportRows = (rows) => {
    const moduleOrder = [...annotationModules, ...new Set(rows.map((row) => row.module).filter((module) => !annotationModules.includes(module)))];
    return moduleOrder.map((module) => ({ module, rows: rows.filter((row) => row.module === module) })).filter((group) => group.rows.length);
  };
  const conclusionRows = rowsByTypes(["\u62a5\u544a\u91cd\u70b9", "\u5206\u6790\u7ed3\u8bba"]);
  const riskRows = rowsByTypes(["\u98ce\u9669\u5224\u65ad"]);
  const actionRows = rowsByTypes(["\u6539\u5584\u63aa\u65bd"]);
  const todoRows = rowsByTypes(["\u5f85\u529e\u4e8b\u9879"]);
  const sectionMeta = [
    { label: "\u7ba1\u7406\u5c42\u7ed3\u8bba", count: conclusionRows.length },
    { label: "TOP\u98ce\u9669", count: riskRows.length },
    { label: "\u6539\u5584\u63aa\u65bd", count: actionRows.length },
    { label: "\u5f85\u529e\u4e8b\u9879", count: todoRows.length },
  ];
  const renderAnnotationSection = ({ title, subtitle, rows, empty, className = "" }) => {
    const groups = groupReportRows(rows);
    return <Panel title={title} subtitle={subtitle} className={className}>
      <div className="management-template-section">
        {!groups.length && <div className="management-template-empty">{empty}</div>}
        {groups.map((group) => <section className="management-template-group" key={`${title}-${group.module}`}>
          <h4>{group.module}</h4>
          {group.rows.map((row) => <article key={row.id}>
            <div><span>{row.type}</span>{row.updatedAt && <em>{String(row.updatedAt).slice(0, 10)}</em>}</div>
            <p>{row.content}</p>
          </article>)}
        </section>)}
      </div>
    </Panel>;
  };
  return <div className="management-report-page">
    <section className="management-hero">
      <div>
        <span>管理层汇报</span>
        <h2>半年度质量经营摘要</h2>
        <p>面向二级以上管理层，聚焦核心指标、TOP风险和下半年资源投入方向。量化指标随经营驾驶舱当前日期区间同步更新，文字内容自动引用“已保存的分析改善措施”。</p>
      </div>
      <AppliedPeriodTag data={data}/>
    </section>
    <div className="management-card-grid">
      {reportCards.map((item) => <div className="management-metric-card" key={item.label}>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <em className={deltaClass(item)}>{signedText(Number(item.delta || 0), Math.abs(item.delta || 0) < 10 ? "pp" : "%", Math.abs(item.delta || 0) < 10 ? 1 : 0)}</em>
        <p>{item.note}</p>
      </div>)}
    </div>
    <div className="management-template-summary">
      <div>
        <strong>自动成稿模板</strong>
        <span>已纳入 {reportRows.length} 条批注素材；只统计“进入报告”的内容。</span>
      </div>
      <div className="management-template-tags">
        {sectionMeta.map((item) => <em key={item.label}>{item.label}<b>{item.count}</b></em>)}
      </div>
    </div>
    <div className="management-report-grid">
      {renderAnnotationSection({
        title: "一、管理层结论",
        subtitle: "来自“报告重点”和“分析结论”，用于开场摘要",
        rows: conclusionRows,
        empty: "暂无管理层结论素材。请在各图表页面点击“分析改善措施”，填写“报告重点”或“分析结论”。",
        className: "span-12",
      })}
      <Panel title="数据识别TOP风险" subtitle="用于管理层快速判断资源投入优先级">
        <div className="management-risk-list">
          <div><h4>IQC供应商</h4>{iqcWorst.map((row) => <p key={`${row.site}-${row.supplier}`}><b>{row.site}</b><span>{row.supplier}</span><em>{row.y2026Rate}%</em></p>)}</div>
          <div><h4>IPQC工坊</h4>{ipqcRisk.map((row) => <p key={`${row.site}-${row.name}`}><b>{row.site}</b><span>{row.name}</span><em>{row.y2026Rate}%</em></p>)}</div>
          <div><h4>DQA产品部</h4>{dqaBack.slice(0, 3).map((row) => <p key={row.name}><b>{row.name}</b><span>生产+现场</span><em>{row.back.toLocaleString()}项</em></p>)}</div>
        </div>
      </Panel>
      {renderAnnotationSection({
        title: "二、风险判断",
        subtitle: "来自“风险判断”，按模块自动分组",
        rows: riskRows,
        empty: "暂无风险判断素材。建议记录TOP供应商、工坊、TPM、产品部的高风险原因。",
      })}
      {renderAnnotationSection({
        title: "三、下半年改善措施",
        subtitle: "来自“改善措施”，用于形成行动主线",
        rows: actionRows,
        empty: "暂无改善措施素材。建议写明对象、原因、措施、验证指标和完成时间。",
      })}
      {renderAnnotationSection({
        title: "四、待办与责任推进",
        subtitle: "来自“待办事项”，后续可转为质量工作台任务",
        rows: todoRows,
        empty: "暂无待办素材。建议把问题严重的组装工坊、交付经理、产品部和TPM写成具体责任事项。",
        className: "span-12",
      })}
    </div>
  </div>;
}

function ExecutiveDashboard({ data, files, onImport, onDeleteSource, onSourcesChanged, view, onViewChange, dateRange, onDateRange, onRefreshDate, dateRefreshStatus, refreshProgress, fontSize, onFontSize, analysisKey, labelControlsVisible, onToggleLabelControls, uiTheme, onThemeChange, sidebarCollapsed, onToggleSidebar, auth, permissions, onPermissionsChanged }) {
  const [active, setActive] = useState("总览");
  const moduleView = ["IQC", "IPQC", "OQC", "DQA"].includes(active) ? active : null;
  const allowImport = canUseFeature(auth, permissions, "dataImport");
  const allowWorkspace = canUseFeature(auth, permissions, "workspace");
  const allowAnnotationEdit = canUseFeature(auth, permissions, "annotationEdit");
  const allowAnnotationView = canUseFeature(auth, permissions, "annotationView");
  const allowExport = canUseFeature(auth, permissions, "exportReport");
  const allowTemporaryRefresh = canUseFeature(auth, permissions, "dateTemporaryRefresh");
  useEffect(() => {
    if ((active === "数据导入" && !allowImport) || (active === "权限设置" && !auth?.isAdmin)) setActive("总览");
  }, [active, allowImport, auth?.isAdmin]);
  return <div className={`executive-shell theme-${uiTheme} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <ExecutiveSidebar active={active} setActive={setActive} uiTheme={uiTheme} onThemeChange={onThemeChange} collapsed={sidebarCollapsed} onToggleCollapsed={onToggleSidebar} permissions={permissions} auth={auth} />
    <main className="executive-main">
      <header className="executive-topbar">
        <div><h1>{moduleView ? `${moduleView} 专题分析` : active === "数据导入" ? "数据源管理" : "经营驾驶舱"}</h1><p>{moduleView ? "从原始数据下钻到TOP问题与责任对象" : "全局质量运营总览"}</p></div>
        <div className="top-actions"><Switcher view={view} onChange={onViewChange} canWorkspace={allowWorkspace} />{allowAnnotationEdit && <AnnotationEditButton defaultModule={moduleView || "\u603b\u89c8"} />}{allowAnnotationView && <AnnotationViewButton />}{allowExport && <ExportReportButton />}<button className={`label-controls-toggle ${labelControlsVisible ? "active" : ""}`} onClick={onToggleLabelControls}>{labelControlsVisible ? "隐藏数值设置" : "显示数值设置"}</button>{allowImport && <button className="import-btn" onClick={() => onImport(null)}><UploadSimple size={17} />导入数据</button>}</div>
      </header>
      <DateRangeFilter value={dateRange} onChange={onDateRange} onRefresh={onRefreshDate} refreshStatus={dateRefreshStatus} refreshProgress={refreshProgress} canRefresh={allowTemporaryRefresh} fontSize={fontSize} onFontSize={onFontSize}/>
      {active === "权限设置" && auth?.isAdmin ? <PermissionSettingsPage auth={auth} permissions={permissions} onPermissionsChanged={onPermissionsChanged}/> : active === "数据导入" && allowImport ? <DataSourcePage files={files} onImportModule={onImport} onDelete={onDeleteSource} onSourcesChanged={onSourcesChanged}/> : moduleView ? <ModuleDetail key={`${moduleView}-${analysisKey}`} module={moduleView} data={data} /> : <>
        <OverviewKpiCards data={data}/>
        <div className="dashboard-grid">
          <MainSupplierOverview data={data}/>
          <Panel title="TOP 风险供应商（人工选择）" subtitle="不再由系统按良率自动生成；选择结果保存在当前电脑" className="span-12"><ManualRiskSuppliers data={data}/></Panel>
          <Panel title="IPQC 工坊风险 TOP5" subtitle="默认展示异常密度最高的5个工坊，其余工坊可展开查看" className="span-12"><IpqcWorkshopRisk data={data}/></Panel>
          <Panel title="OQC 出货评分总览" subtitle="基于月度汇总源数据，按当前日期区间同步更新" className="span-7"><OqcOverviewScore data={data}/></Panel>
          <Panel title="DQA 阶段质量问题分布" subtitle="按当前日期区间同步更新" className="span-5"><StackedStage rows={data.dqa.divisions} height={252} /></Panel>
        </div>
      </>}
      <footer className="page-foot">数据更新时间：{data.updatedAt}<span>{files.length ? `已导入 ${files.length} 个文件` : "当前展示内置半年报样例数据"}</span></footer>
    </main>
  </div>;
}

function WorkspaceTop({ view, onViewChange, auth, permissions }) {
  const allowAnnotationEdit = canUseFeature(auth, permissions, "annotationEdit");
  const allowAnnotationView = canUseFeature(auth, permissions, "annotationView");
  const allowExport = canUseFeature(auth, permissions, "exportReport");
  return <header className="workspace-top summary-workspace-top">
    <div className="workspace-brand"><ShieldCheck size={24} weight="fill" /><strong>总结报告</strong></div>
    <div className="workspace-actions"><Switcher view={view} onChange={onViewChange} canWorkspace />{allowAnnotationEdit && <AnnotationEditButton defaultModule="\u8d28\u91cf\u5de5\u4f5c\u53f0" />}{allowAnnotationView && <AnnotationViewButton />}{allowExport && <ExportReportButton />}</div>
  </header>;
}

function DatasetStatus({ files }) {
  const rows = [
    { module: "IQC", label: "来料检验", expected: 2 },
    { module: "IPQC", label: "过程检验", expected: 2 },
    { module: "OQC", label: "出货检验", expected: 2 },
    { module: "DQA", label: "研发质量", expected: 9 },
  ];
  return <div className="dataset-strip">
    {rows.map((row) => {
      const count = files.filter((f) => f.module === row.module).length;
      const ready = files.length ? count >= 1 : true;
      const Icon = moduleIcons[row.module];
      return <div className="dataset-item" key={row.module}><span className={`dataset-icon ${moduleColor[row.module]}`}><Icon size={21} /></span><div><strong>{row.module} <small>{row.label}</small></strong><b>{files.length ? `${count}/${row.expected}` : "样例数据"}</b></div><em className={ready ? "ready" : "partial"}>{ready ? "已完成" : "部分缺失"}</em></div>;
    })}
  </div>;
}

function InsightPanel({ data }) {
  const worst = [...data.iqc.suppliers].sort((a, b) => a.y2026 - b.y2026)[0];
  const bestTpm = [...data.oqc.tpm].sort((a, b) => b.fiveRate - a.fiveRate)[0];
  const highStage = [...data.dqa.tpmStages].sort((a, b) => b.onsite - a.onsite)[0];
  const insights = [
    ["整体趋势", `OQC 5分率达到 ${data.kpis[2].value}%，IPQC异常密度为 ${data.kpis[1].value}%。`, "green"],
    ["供应商表现", `${worst?.supplier || "—"}批次良率最低，主要问题集中在${worst?.issue || "待识别"}。`, "orange"],
    ["TPM表现", `${bestTpm?.name || "—"} 5分率 ${bestTpm?.fiveRate || 0}%，处于领先位置。`, "green"],
    ["研发风险", `${highStage?.name || "—"}现场问题 ${highStage?.onsite || 0} 项，建议前移至TR3/TR5控制。`, "orange"],
    ["建议", "优先处理P0行动，并将现场问题反向补入设计评审与FAT用例。", "blue"],
  ];
  return <div className="insight-panel">
    <div className="insight-title"><Sparkle size={21} weight="fill" /><strong>智能洞察</strong><span>基于当前筛选条件</span></div>
    {insights.map(([title, content, color]) => <div className="insight-row" key={title}><i className={color}></i><div><strong>{title}</strong><p>{content}</p></div></div>)}
  </div>;
}

function ActionBoard({ actions, onAdd }) {
  return <div className="action-board">
    <div className="action-tabs"><button className="active">全部({actions.length})</button><button>P0({actions.filter(a => a.priority === "P0").length})</button><button>P1({actions.filter(a => a.priority === "P1").length})</button></div>
    <div className="action-head"><span>优先级</span><span>问题标题</span><span>责任人</span><span>目标日期</span><span>进度</span><span>状态</span></div>
    {actions.map((a) => <div className="action-row" key={a.id}><span><em className={`priority ${a.priority}`}>{a.priority}</em></span><strong>{a.title}</strong><span>{a.owner}</span><span>{a.due}</span><span><i className="progress"><b style={{ width: `${a.progress}%` }}></b></i>{a.progress}%</span><span className={`status ${a.status === "未开始" ? "idle" : ""}`}>{a.status}</span></div>)}
    <button className="add-action" onClick={onAdd}><Plus size={17} />新建改善行动</button>
  </div>;
}

function Filters({ dateRange, onDateRange, onRefreshDate, dateRefreshStatus, fontSize, onFontSize }) {
  return <div className="filter-bar summary-filter-bar"><DateRangeFilter value={dateRange} onChange={onDateRange} onRefresh={onRefreshDate} refreshStatus={dateRefreshStatus} fontSize={fontSize} onFontSize={onFontSize}/></div>;
}

const reportStorageKey = "qms-half-year-summary-report-v1";
const topBy = (rows = [], getter = (row) => row.count || 0) => [...rows].sort((a, b) => getter(b) - getter(a))[0] || {};
const sumBy = (rows = [], getter = (row) => row.count || 0) => rows.reduce((sum, row) => sum + (Number(getter(row)) || 0), 0);
const fmt = (value) => Number(value || 0).toLocaleString();
const rateText = (value) => `${Number(value || 0).toFixed(1)}%`;
const reportPeriodText = (range) => `2025同期：${range.start2025} 至 ${range.end2025}；2026本期：${range.start2026} 至 ${range.end2026}`;

function buildSummaryReport(data, files, dateRange) {
  const worstSupplier = [...(data.iqc?.suppliers || [])].sort((a, b) => (a.y2026 || 100) - (b.y2026 || 100))[0] || {};
  const highWorkshop = topBy(data.ipqc?.workshops || [], (row) => row.y2026 || 0);
  const topIpqcIssue = topBy(data.ipqc?.categories || [], (row) => row.shenzhen || row.hangzhou || row.count || 0);
  const topOqcIssue = topBy(data.oqc?.onsite || [], (row) => row.count || 0);
  const lowOqcTpm = [...(data.oqc?.tpm || [])].sort((a, b) => (a.fiveRate || 100) - (b.fiveRate || 100))[0] || {};
  const highDqaDivision = topBy(data.dqa?.divisions || [], (row) => (row.production || 0) + (row.onsite || 0));
  const highDqaTpm = topBy(data.dqa?.tpmStages || [], (row) => (row.production || 0) + (row.onsite || 0));
  const topDqaIssue = topBy(data.dqa?.categories || [], (row) => (row.production || 0) + (row.onsite || 0));
  const kpis = data.kpis || [];
  const totalFiles = files?.length || 0;
  return {
    title: "2026年半年度质量总结报告",
    period: reportPeriodText(dateRange),
    summary: [
      `本报告基于经营驾驶舱当前数据自动生成，覆盖 IQC、IPQC、OQC、DQA 四个模块，共读取 ${totalFiles} 个源数据文件。`,
      `2026本期核心指标：IQC批次良率 ${kpis[0]?.value ?? "-"}${kpis[0]?.unit || "%"}，IPQC异常密度 ${kpis[1]?.value ?? "-"}${kpis[1]?.unit || "%"}，OQC 5分率 ${kpis[2]?.value ?? "-"}${kpis[2]?.unit || "%"}，DQA生产+现场问题 ${fmt(kpis[3]?.value)} 项。`,
      `主要风险集中在供应商来料稳定性、组装工坊过程异常、现场交付扣分和研发问题后移四条链路，需要下半年用“TOP问题闭环+责任人待办”方式推进。`,
    ].join("\n"),
    conclusions: [
      `IQC：${worstSupplier.supplier || "待识别供应商"} 批次良率相对偏低，2026良率约 ${rateText(worstSupplier.y2026)}，主要问题指向“${worstSupplier.issue || "待识别"}”。`,
      `IPQC：${highWorkshop.name || "待识别工坊"} 异常密度最高，约 ${rateText(highWorkshop.y2026)}；TOP异常为“${topIpqcIssue.name || "待识别"}”，需优先压降装配过程重复异常。`,
      `OQC：现场扣分TOP为“${topOqcIssue.name || "待识别"}”（${fmt(topOqcIssue.count)}项，占比${rateText(topOqcIssue.share)}）；${lowOqcTpm.name || "待识别TPM"} 的5分比例需要重点拉升。`,
      `DQA：${highDqaDivision.name || "待识别产品部"} 的生产+现场问题最多；TPM维度 ${highDqaTpm.name || "待识别TPM"} 问题数最高，TOP研发问题为“${topDqaIssue.name || "待识别"}”。`,
    ].join("\n"),
    topImprovements: [
      `1. 供应商端：针对 ${worstSupplier.supplier || "低良率供应商"} 建立来料异常周度复盘，按材料属性和加工类型分层制定纠正措施。`,
      `2. 组装工坊端：针对 ${highWorkshop.name || "高异常工坊"} 建立TOP异常日清机制，对“${topIpqcIssue.name || "TOP异常"}”形成作业标准、首件确认和巡检加严。`,
      `3. 交付端：围绕OQC现场扣分“${topOqcIssue.name || "TOP扣分"}”建立发货前风险清单，交付经理对低分设备逐台复盘。`,
      `4. 研发端：将“${topDqaIssue.name || "TOP研发问题"}”前移到IPD评审、设计发布、FAT验证节点，TPM负责项目级闭环。`,
    ].join("\n"),
    measures: [
      "IQC：对低良率供应商实施月度质量评分、重复异常8D、首批加严检验和SQE驻场确认；对特采风险单独评审是否存在过度设计。",
      "IPQC：对高异常工坊建立问题照片库、标准作业点检表、首件互检和巡检频次提升；对重复问题执行班组长现场确认。",
      "OQC：交付经理按TPM输出5分率排名和低分问题清单，发货前完成问题确认、整改证据和客户风险评估。",
      "DQA：产品部按TOP问题建立IPD门禁，TR3关注设计完整性，TR4关注BOM/资料齐套，TR5关注FAT和稳定性验证。",
    ].join("\n"),
    todos: [
      { type: "组装工坊", owner: highWorkshop.name || "高风险工坊负责人", object: topIpqcIssue.name || "TOP过程异常", priority: "P0", due: "2026-07-31", action: "建立TOP异常日清单，更新作业指导书和首件确认表，连续4周跟踪异常密度下降。" },
      { type: "交付经理", owner: lowOqcTpm.name || "低5分率TPM/交付经理", object: topOqcIssue.name || "现场扣分TOP", priority: "P0", due: "2026-08-15", action: "输出低分设备复盘清单，发货前逐台确认整改证据，低分问题横向展开。" },
      { type: "产品部", owner: highDqaDivision.name || "高风险产品部", object: topDqaIssue.name || "TOP研发问题", priority: "P0", due: "2026-08-31", action: "把TOP研发问题写入IPD门禁检查项，TR3/TR4/TR5分别补充设计、资料、验证要求。" },
      { type: "TPM", owner: highDqaTpm.name || "高风险TPM", object: `${highDqaTpm.division || "对应产品部"} 生产/现场问题`, priority: "P1", due: "2026-09-15", action: "按项目建立问题闭环台账，复盘生产和现场问题根因，月度向产品部汇报关闭率。" },
    ],
  };
}

function EditableBlock({ label, value, onChange, rows = 5 }) {
  return <label className="report-field"><span>{label}</span><textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TodoTable({ rows, onChange }) {
  const update = (index, patch) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const add = () => onChange([...rows, { type: "新增待办", owner: "待分配", object: "待填写", priority: "P1", due: "", action: "填写改善动作和验证方式。" }]);
  return <div className="report-todo-table">
    <div className="report-todo-row report-todo-head"><span>对象</span><span>责任人</span><span>问题/指标</span><span>优先级</span><span>截止日期</span><span>改善动作</span></div>
    {rows.map((row, index) => <div className="report-todo-row" key={`${row.type}-${index}`}>
      <input value={row.type} onChange={(event) => update(index, { type: event.target.value })} />
      <input value={row.owner} onChange={(event) => update(index, { owner: event.target.value })} />
      <input value={row.object} onChange={(event) => update(index, { object: event.target.value })} />
      <select value={row.priority} onChange={(event) => update(index, { priority: event.target.value })}><option>P0</option><option>P1</option><option>P2</option></select>
      <input type="date" value={row.due} onChange={(event) => update(index, { due: event.target.value })} />
      <textarea rows={2} value={row.action} onChange={(event) => update(index, { action: event.target.value })} />
    </div>)}
    <button className="add-action" onClick={add}><Plus size={17}/>新增待办</button>
  </div>;
}

function WorkspaceDashboard({ data, files, onImport, view, onViewChange, uiTheme, auth, permissions }) {
  return <div className={`workspace-shell summary-report-shell annotation-only-workspace theme-${uiTheme}`}>
    <WorkspaceTop onImport={onImport} view={view} onViewChange={onViewChange} auth={auth} permissions={permissions} />
    <main className="workspace-main summary-report-page">
      <section className="dataset-section"><div className="section-label">数据集状态（与经营驾驶舱一致）<Question size={14} /></div><DatasetStatus files={files} /></section>
      <Panel title={annotationText.pool} subtitle={annotationText.poolSub} action={<AnnotationTransferActions />} className="report-todos-panel"><AnnotationReportPanel /></Panel>
    </main>
    <footer className="workspace-foot">数据更新时间：{data.updatedAt}<span>质量工作台已简化为批注素材池，用于整理最终报告手写内容。</span></footer>
  </div>;
}

function IpdMatrix({ rows }) {
  return <div className="ipd-matrix">
    <div className="ipd-row ipd-head"><span>IPD阶段</span><span>评审</span><span>生产</span><span>现场</span><span>质量门禁</span></div>
    {rows.map((r) => <div className="ipd-row" key={r.stage}><strong>{r.stage}</strong><span>{r.review}</span><span>{r.production}</span><span className={r.onsite > 300 ? "hot-number" : ""}>{r.onsite}</span><em>{r.gate}</em></div>)}
  </div>;
}

function TemplatePage() {
  return <div className="template-page">
    <div className="template-hero"><div><span className="template-icon"><FloppyDisk size={28}/></span><h2>分析模板设置</h2><p>保存数据口径、筛选条件、图表顺序和改善计划结构；下次导入新数据后自动套用。</p></div><button className="import-btn"><Plus size={17}/>新建模板</button></div>
    <div className="template-grid">
      {[
        ["2026半年报模板","IQC / IPQC / OQC / DQA","当前使用","2026-06-21"],
        ["质量月报标准模板","四模块月度趋势 + TOP问题","可用","2026-06-10"],
        ["产品部研发质量模板","DQA TPM / 学科 / IPD门禁","可用","2026-06-18"],
      ].map((r,i)=><div className="template-card" key={r[0]}><div><FileXls size={23}/><em className={i===0?"current":""}>{r[2]}</em></div><h3>{r[0]}</h3><p>{r[1]}</p><span>最后更新：{r[3]}</span><footer><button><Eye size={15}/>预览</button><button><FloppyDisk size={15}/>复制</button></footer></div>)}
    </div>
    <Panel title="模板复用规则"><div className="template-rules"><div><strong>1</strong><p>导入原始Excel<br/><span>按文件表头自动识别模块</span></p></div><ArrowRight/><div><strong>2</strong><p>执行统一分类<br/><span>使用保存的分类字典与口径</span></p></div><ArrowRight/><div><strong>3</strong><p>刷新图表与结论<br/><span>保留图表布局和筛选配置</span></p></div><ArrowRight/><div><strong>4</strong><p>更新改善计划<br/><span>自动带出TOP问题和责任对象</span></p></div></div></Panel>
  </div>;
}

function ActionPage({ data }) {
  return <TaskTracker data={data}/>;
}

const taskStorageKey = "qms-notion-quality-tasks-v1";
const emptyTask = {
  title: "新建改善待办", module: "DQA", object: "待填写", priority: "P1", status: "待开始",
  owner: "待分配", due: "", measure: "写清楚要改什么、谁来改、怎么验证。", verification: "复盘数据是否改善，必要时补充现场验证。",
};
const taskModules = ["全部", "IQC", "IPQC", "OQC", "DQA", "ECN"];
const taskPriorities = ["P0", "P1", "P2"];
const taskStatuses = ["待开始", "进行中", "已完成", "搁置"];
const toInputDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : "";
const moduleForNewTask = (moduleFilter) => moduleFilter === "全部" ? "DQA" : moduleFilter;
const taskSeed = (actions = []) => actions.map((action, index) => ({
  id: action.id || `QA-${String(index + 1).padStart(3, "0")}`,
  title: action.title || "质量改善任务",
  module: action.module || "DQA",
  object: action.object || action.issue || "TOP问题",
  priority: action.priority || "P1",
  status: action.status || "待开始",
  owner: action.owner || "待分配",
  due: toInputDate(action.due) || "",
  measure: action.measure || "根据前面板块的数据分析，补充具体改善措施。",
  verification: action.verification || "用下月/下季度同口径数据验证改善效果。",
  createdAt: new Date().toISOString(),
}));

function TaskTracker({ data }) {
  const [tasks, setTasks] = useState(() => {
    const saved = safeParse(localStorage.getItem(taskStorageKey), null);
    return Array.isArray(saved) && saved.length ? saved : taskSeed(data.actions);
  });
  const [moduleFilter, setModuleFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [priorityFilter, setPriorityFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(tasks[0]?.id || "");
  useEffect(() => { localStorage.setItem(taskStorageKey, JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { if (!tasks.some((task) => task.id === selectedId)) setSelectedId(tasks[0]?.id || ""); }, [tasks, selectedId]);
  const updateTask = (id, patch) => setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
  const addTask = (module = "DQA") => {
    const id = `QA-${Date.now().toString().slice(-6)}`;
    const next = { ...emptyTask, id, module, createdAt: new Date().toISOString() };
    setTasks((current) => [...current, next]);
    setSelectedId(id);
    setStatusFilter("全部");
    setPriorityFilter("全部");
  };
  const duplicateTask = (task) => {
    const id = `QA-${Date.now().toString().slice(-6)}`;
    setTasks((current) => [{ ...task, id, title: `${task.title}（复制）`, status: "待开始" }, ...current]);
    setSelectedId(id);
  };
  const removeTask = (id) => setTasks((current) => current.filter((task) => task.id !== id));
  const filtered = tasks.filter((task) => {
    const hitModule = moduleFilter === "全部" || task.module === moduleFilter;
    const hitStatus = statusFilter === "全部" || task.status === statusFilter;
    const hitPriority = priorityFilter === "全部" || task.priority === priorityFilter;
    const textHit = !query || [task.title, task.object, task.owner, task.measure, task.verification].some((value) => String(value || "").toLowerCase().includes(query.toLowerCase()));
    return hitModule && hitStatus && hitPriority && textHit;
  });
  const selected = tasks.find((task) => task.id === selectedId) || filtered[0] || tasks[0];
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "已完成").length;
  const p0Open = tasks.filter((task) => task.priority === "P0" && task.status !== "已完成").length;
  const overdue = tasks.filter((task) => task.due && task.status !== "已完成" && new Date(`${task.due}T23:59:59`) < new Date()).length;
  const completion = Number((done / Math.max(total, 1) * 100).toFixed(1));
  return <div className="task-page">
    <div className="task-hero">
      <div>
        <span className="task-eyebrow">改善计划 · Notion式任务追踪器</span>
        <h1>把质量分析变成可追踪的改善待办</h1>
        <p>根据 IQC / IPQC / OQC / DQA / ECN 的分析结果，手动沉淀任务、责任人、措施和验证方式。</p>
      </div>
      <button className="task-primary-btn" onClick={() => addTask()}><Plus size={18} weight="bold"/>新建待办</button>
    </div>
    <div className="task-kpis">
      <div><span>待办总数</span><strong>{total}</strong><em>当前任务库</em></div>
      <div><span>P0未关闭</span><strong className="red">{p0Open}</strong><em>需管理关注</em></div>
      <div><span>逾期任务</span><strong className={overdue ? "red" : "green"}>{overdue}</strong><em>按截止日期</em></div>
      <div><span>完成率</span><strong className="green">{completion}%</strong><em>{done}/{total} 已完成</em></div>
    </div>
    <div className="task-shell">
      <section className="task-table-panel">
        <div className="task-toolbar">
          <div className="task-view-tabs">
            {taskModules.map((module) => <button key={module} className={moduleFilter === module ? "active" : ""} onClick={() => setModuleFilter(module)}>{module}</button>)}
          </div>
          <div className="task-filters">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务 / 对象 / 负责人 / 措施"/>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>全部</option>{taskStatuses.map((status) => <option key={status}>{status}</option>)}</select>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>全部</option>{taskPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select>
          </div>
        </div>
        <div className="task-grid task-head"><span>任务名称</span><span>状态</span><span>负责人</span><span>截止日期</span><span>优先级</span><span>任务类型</span><span>描述</span></div>
        <div className="task-list">
          {filtered.map((task) => <div key={task.id} className={`task-grid task-row task-edit-row ${selected?.id === task.id ? "selected" : ""}`} onClick={() => setSelectedId(task.id)}>
            <input className="task-cell-title" value={task.title} onChange={(event) => updateTask(task.id, { title: event.target.value })} onFocus={() => setSelectedId(task.id)} placeholder="任务名称"/>
            <select className={`task-status-select ${task.status}`} value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value })} onFocus={() => setSelectedId(task.id)}>{taskStatuses.map((status) => <option key={status}>{status}</option>)}</select>
            <input value={task.owner} onChange={(event) => updateTask(task.id, { owner: event.target.value })} onFocus={() => setSelectedId(task.id)} placeholder="负责人"/>
            <input type="date" value={task.due} onChange={(event) => updateTask(task.id, { due: event.target.value })} onFocus={() => setSelectedId(task.id)}/>
            <select className={`task-priority-select ${task.priority}`} value={task.priority} onChange={(event) => updateTask(task.id, { priority: event.target.value })} onFocus={() => setSelectedId(task.id)}>{taskPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select>
            <select className={`task-module-select ${task.module.toLowerCase()}`} value={task.module} onChange={(event) => updateTask(task.id, { module: event.target.value })} onFocus={() => setSelectedId(task.id)}>{taskModules.filter((x) => x !== "全部").map((module) => <option key={module}>{module}</option>)}</select>
            <input value={task.measure} onChange={(event) => updateTask(task.id, { measure: event.target.value })} onFocus={() => setSelectedId(task.id)} placeholder="描述 / 改善措施"/>
          </div>)}
          {!filtered.length && <div className="task-empty">没有匹配的待办。换个筛选条件，或者新建一条。</div>}
          <button className="task-new-row" onClick={() => addTask(moduleForNewTask(moduleFilter))}><Plus size={16}/>新建任务</button>
        </div>
      </section>
      <aside className="task-detail-panel">
        {selected ? <>
          <div className="task-detail-top">
            <span>{selected.id}</span>
            <div><button onClick={() => duplicateTask(selected)}>复制</button><button className="danger" onClick={() => removeTask(selected.id)}>删除</button></div>
          </div>
          <input className="task-title-input" value={selected.title} onChange={(event) => updateTask(selected.id, { title: event.target.value })}/>
          <div className="task-form-grid">
            <label>来源板块<select value={selected.module} onChange={(event) => updateTask(selected.id, { module: event.target.value })}>{taskModules.filter((x) => x !== "全部").map((module) => <option key={module}>{module}</option>)}</select></label>
            <label>优先级<select value={selected.priority} onChange={(event) => updateTask(selected.id, { priority: event.target.value })}>{taskPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
            <label>状态<select value={selected.status} onChange={(event) => updateTask(selected.id, { status: event.target.value })}>{taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label>负责人<input value={selected.owner} onChange={(event) => updateTask(selected.id, { owner: event.target.value })}/></label>
            <label>问题对象<input value={selected.object} onChange={(event) => updateTask(selected.id, { object: event.target.value })}/></label>
            <label>截止日期<input type="date" value={selected.due} onChange={(event) => updateTask(selected.id, { due: event.target.value })}/></label>
          </div>
          <label className="task-long-field">改善措施<textarea value={selected.measure} onChange={(event) => updateTask(selected.id, { measure: event.target.value })}/></label>
          <label className="task-long-field">验证方式<textarea value={selected.verification} onChange={(event) => updateTask(selected.id, { verification: event.target.value })}/></label>
          <div className="task-quick-add">
            <span>快速新建</span>
            {["IQC", "IPQC", "OQC", "DQA", "ECN"].map((module) => <button key={module} onClick={() => addTask(module)}>{module}</button>)}
          </div>
        </> : <div className="task-empty">请选择一条任务。</div>}
      </aside>
    </div>
  </div>;
}

const workshopColumns = [
  ["name", "工坊"], ["y2025Qty", "2025送检数"], ["y2025Bad", "2025问题数量"],
  ["y2025Rate", "2025异常密度"], ["y2026Qty", "2026送检数"], ["y2026Bad", "2026问题数量"],
  ["y2026Rate", "2026异常密度"], ["delta", "同比变化"],
];

function WorkshopCompare({ rows }) {
  const [selected, setSelected] = useState(() => rows.map((row) => row.name));
  const [sort, setSort] = useState({ key: "y2026Rate", direction: "desc" });
  const axis = useMachinedAxisRange("ipqc-workshop-compare-axis-v1", { min: 0, max: 80 });
  useEffect(() => setSelected(rows.map((row) => row.name)), [rows]);
  const visibleRows = useMemo(() => rows.filter((row) => selected.includes(row.name))
    .map((row) => ({ ...row, delta: row.y2026Rate - row.y2025Rate }))
    .sort((a, b) => {
      const av = a[sort.key] ?? 0; const bv = b[sort.key] ?? 0;
      const result = typeof av === "string" ? av.localeCompare(bv, "zh-CN") : av - bv;
      return sort.direction === "asc" ? result : -result;
    }), [rows, selected, sort]);
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  return <>
    <div className="supplier-selector">
      <label className="supplier-check all"><input type="checkbox" checked={selected.length === rows.length} onChange={() => setSelected(selected.length === rows.length ? [] : rows.map((row) => row.name))}/><span>全选</span></label>
      {rows.map((row) => <label className="supplier-check" key={row.name}><input type="checkbox" checked={selected.includes(row.name)} onChange={() => setSelected((current) => current.includes(row.name) ? current.filter((name) => name !== row.name) : [...current, row.name])}/><span>{row.name}</span></label>)}
    </div>
    <MachinedAxisPanelControl axis={axis}/>
    {visibleRows.length ? <QuantityRateCombo rows={visibleRows} labelKey="name" rateLabel="异常密度" qtyLabel="送检数/问题数量" height={400} rateAxisOverride={axis.effective} hideRateAxisControl/> : <div className="supplier-empty">请至少选择一个工坊</div>}
    <div className="workshop-table">
      <div className="workshop-row workshop-head">{workshopColumns.map(([key, label]) => <button key={key} onClick={() => changeSort(key)}>{label}<span>{sort.key === key ? sort.direction === "asc" ? "▲" : "▼" : "↕"}</span></button>)}</div>
      {visibleRows.map((row) => <div className="workshop-row" key={row.name}>
        <strong>{row.name}</strong><span>{row.y2025Qty.toLocaleString()}</span><span>{row.y2025Bad.toLocaleString()}</span><span>{row.y2025Rate}%</span>
        <span>{row.y2026Qty.toLocaleString()}</span><span>{row.y2026Bad.toLocaleString()}</span><span className={row.y2026Rate >= 10 ? "rate-risk" : ""}>{row.y2026Rate}%</span>
        <span className={row.delta <= 0 ? "up" : "down"}>{row.delta <= 0 ? "↓" : "↑"} {Math.abs(row.delta).toFixed(1)}pp</span>
      </div>)}
    </div>
  </>;
}

function ImprovementTable({ rows }) {
  return <div className="ipqc-improvement-table">
    <div className="ipqc-improvement-row improvement-head"><span>TOP</span><span>异常分类</span><span>2026数量/占比</span><span>同比变化</span><span>重点工坊</span><span>责任对象</span><span>针对性措施</span></div>
    {rows.map((row) => <div className="ipqc-improvement-row" key={row.category}>
      <b>{row.rank}</b><strong>{row.category}</strong><span>{row.count.toLocaleString()} / {row.share}%</span>
      <span className={row.delta <= 0 ? "up" : "down"}>{row.delta >= 0 ? "↑" : "↓"} {Math.abs(row.delta).toLocaleString()}</span>
      <span>{row.workshop}</span><span>{row.owner}</span><p>{row.action}</p>
    </div>)}
  </div>;
}

const leaderColumns = [
  ["leader", "机长"], ["workshop", "工坊"], ["manager", "交付经理"], ["qty", "2026送检数"],
  ["issues", "问题数量"], ["density", "异常密度"], ["passRate", "合格率"], ["deaScore", "DEA效率分"], ["riskScore", "综合风险"],
];

function IpqcLeaderRankTable({ rows }) {
  const [sort, setSort] = useState({ key: "riskScore", direction: "desc" });
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sort.key] ?? 0;
    const bv = b[sort.key] ?? 0;
    const result = typeof av === "string" ? av.localeCompare(bv, "zh-CN") : av - bv;
    return sort.direction === "asc" ? result : -result;
  }), [rows, sort]);
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  const format = (row, key) => {
    if (["density", "passRate"].includes(key)) return `${Number(row[key] || 0).toFixed(2)}%`;
    if (["deaScore", "riskScore"].includes(key)) return Number(row[key] || 0).toFixed(1);
    if (["qty", "issues"].includes(key)) return Number(row[key] || 0).toLocaleString();
    return row[key] || "—";
  };
  return <div className="ipqc-leader-table">
    <div className="ipqc-leader-row head">{leaderColumns.map(([key, label]) => <button key={key} onClick={() => changeSort(key)}>{label}<span>{sort.key === key ? sort.direction === "asc" ? "▲" : "▼" : "↕"}</span></button>)}</div>
    {sorted.map((row) => <div className="ipqc-leader-row" key={`${row.site}-${row.leader}`}>
      {leaderColumns.map(([key]) => <span key={key} className={key === "deaScore" ? row[key] >= 90 ? "up" : row[key] < 70 ? "down" : "" : key === "riskScore" && row[key] >= 45 ? "rate-risk" : ""}>
        {key === "leader" ? <strong>{format(row, key)}{!row.mapped && <em>未覆盖</em>}</strong> : format(row, key)}
      </span>)}
    </div>)}
  </div>;
}

function IpqcUnmappedLeaders({ rows }) {
  return <div className="ipqc-unmapped-list">
    {rows.slice(0, 12).map((row) => <div key={`${row.site}-${row.leader}`}>
      <strong>{row.leader}</strong><span>{row.workshop} · {row.manager}</span><b>{row.issues.toLocaleString()}个问题 / {row.density}%</b>
    </div>)}
    {!rows.length && <div className="source-empty">当前站点机长都已在映射表中覆盖。</div>}
  </div>;
}

function IpqcUnassignedWorkshopRows({ rows }) {
  const [open, setOpen] = useState(false);
  if (!rows?.length) return null;
  return <div className="ipqc-fold-note">
    <button onClick={() => setOpen((current) => !current)}>未分工坊明细：{rows.length}条 <CaretDown size={14} className={open ? "rotate" : ""}/></button>
    {open && <div className="ipqc-unassigned-table">
      <div className="ipqc-unassigned-row head"><span>厂区</span><span>年份</span><span>日期</span><span>任务单号</span><span>组件类型</span><span>送检数</span><span>问题</span><span>机长</span><span>来源文件</span></div>
      {rows.map((row, index) => <div className="ipqc-unassigned-row" key={`${row.file}-${row.taskNo}-${index}`}>
        <span>{row.site}</span><span>{row.year}</span><span>{row.date}</span><strong>{row.taskNo || "—"}</strong><span>{row.component || "—"}</span>
        <span>{Number(row.qty || 0).toLocaleString()}</span><span>{row.issue ? row.badContent || row.badType || "有问题" : "无"}</span><span>{row.leader || "—"}</span><em>{row.file || "—"}</em>
      </div>)}
    </div>}
  </div>;
}

function IpqcDeaNote() {
  const [open, setOpen] = useState(false);
  return <div className="ipqc-fold-note dea-note">
    <button onClick={() => setOpen((current) => !current)}>DEA效率分算法说明 <CaretDown size={14} className={open ? "rotate" : ""}/></button>
    {open && <div className="ipqc-dea-content">
      <p>当前为“CCR思路的相对效率评分”第一版，用于管理看板排序，不是完整线性规划求解版。</p>
      <p>投入项：送检数 + 问题数量惩罚；产出项：合格数量。合格数量 = 送检数 - 问题数量。</p>
      <p>效率分 = 当前对象效率 / 样本中最高效率 × 100。效率越高，代表在相近投入下问题更少、合格产出更好。</p>
      <p>综合风险 = DEA低分风险 × 55% + 异常密度风险 × 45%。因此既不会只惩罚做得多的人，也不会放过高异常密度。</p>
    </div>}
  </div>;
}

function IpqcManagerQualityTable({ rows }) {
  const [sort, setSort] = useState({ key: "y2026Rate", direction: "desc" });
  const maxDensity = Math.max(0, ...rows.map((row) => row.y2026Rate || 0));
  const minDea = Math.min(...rows.map((row) => row.deaScore || 100));
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sort.key] ?? 0;
    const bv = b[sort.key] ?? 0;
    const result = typeof av === "string" ? av.localeCompare(bv, "zh-CN") : av - bv;
    return sort.direction === "asc" ? result : -result;
  }), [rows, sort]);
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  const columns = [
    ["name", "交付经理"], ["workshop", "工坊"], ["leaderCount", "机长数"], ["y2025Qty", "2025送检"],
    ["y2025Bad", "2025问题"], ["y2025Rate", "2025密度"], ["y2026Qty", "2026送检"],
    ["y2026Bad", "2026问题"], ["y2026Rate", "2026密度"], ["deaScore", "DEA均分"],
  ];
  const format = (row, key) => {
    if (key === "y2025Rate" || key === "y2026Rate") return `${Number(row[key] || 0).toFixed(2)}%`;
    if (key === "deaScore") return Number(row[key] || 0).toFixed(1);
    if (["leaderCount", "y2025Qty", "y2025Bad", "y2026Qty", "y2026Bad"].includes(key)) return Number(row[key] || 0).toLocaleString();
    return row[key] || "—";
  };
  return <div className="ipqc-manager-table">
    <div className="ipqc-manager-row head">{columns.map(([key, label]) => <button key={key} onClick={() => changeSort(key)}>{label}<span>{sort.key === key ? sort.direction === "asc" ? "▲" : "▼" : "↕"}</span></button>)}</div>
    {sorted.map((row) => {
      const densityRisk = row.y2026Rate === maxDensity || row.y2026Rate >= 10;
      const deaRisk = row.deaScore === minDea || row.deaScore < 70;
      return <div className={`ipqc-manager-row ${densityRisk && deaRisk ? "high-risk-row" : ""}`} key={`${row.manager}-${row.workshop}`}>
        {columns.map(([key]) => <span key={key} className={(key === "y2026Rate" || key === "y2025Rate") && densityRisk ? "rate-risk" : key === "deaScore" && deaRisk ? "down" : ""}>
          {key === "name" ? <strong>{format(row, key)}</strong> : format(row, key)}
        </span>)}
      </div>;
    })}
  </div>;
}

function IpqcLeaderSelector({ rows, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const allKeys = rows.map((row) => `${row.site}::${row.leader}`);
  const allChecked = allKeys.length > 0 && allKeys.every((key) => selected.includes(key));
  const toggle = (key) => onChange(selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key]);
  return <div className="ipqc-leader-selector">
    <button onClick={() => setOpen((current) => !current)}><Funnel size={14}/>筛选机长<span>{selected.length}/{allKeys.length}</span></button>
    {open && <div className="supplier-selector">
      <label className="supplier-check all"><input type="checkbox" checked={allChecked} onChange={() => onChange(allChecked ? [] : allKeys)}/><span>全选</span></label>
      {rows.map((row) => {
        const key = `${row.site}::${row.leader}`;
        return <label className="supplier-check" key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)}/><span>{row.site !== "全公司" ? `${row.site} · ` : ""}{row.leader}</span></label>;
      })}
    </div>}
  </div>;
}

function IpqcLeaderAnalysis({ data, site }) {
  const detail = data.ipqc.leaderAnalysis?.bySite?.[site];
  const storageKey = `qms-ipqc-leader-selected-${site}-v1`;
  const limitStorageKey = `qms-ipqc-leader-top-limit-${site}-v1`;
  const leaderKeys = useMemo(() => (detail?.leaders || []).map((row) => `${row.site}::${row.leader}`), [detail?.leaders]);
  const [selectedLeaders, setSelectedLeaders] = useState(() => safeParse(localStorage.getItem(storageKey), null));
  const [topLimit, setTopLimit] = useState(() => localStorage.getItem(limitStorageKey) || "12");
  useEffect(() => {
    setSelectedLeaders((current) => {
      const saved = safeParse(localStorage.getItem(storageKey), null);
      return saved == null ? leaderKeys : saved.filter((key) => leaderKeys.includes(key));
    });
  }, [storageKey, leaderKeys.join("|")]);
  useEffect(() => {
    if (selectedLeaders) localStorage.setItem(storageKey, JSON.stringify(selectedLeaders));
  }, [selectedLeaders, storageKey]);
  useEffect(() => {
    const saved = localStorage.getItem(limitStorageKey) || "12";
    setTopLimit(saved);
  }, [limitStorageKey]);
  useEffect(() => {
    localStorage.setItem(limitStorageKey, topLimit);
  }, [limitStorageKey, topLimit]);
  if (!detail) return <div className="summary-note"><strong>暂无机长分析数据</strong><p>请导入包含“机长”字段的2026年IPQC检验记录，并在数据导入页维护映射表。</p></div>;
  const summary = detail.summary || {};
  const activeLeaderKeys = selectedLeaders || leaderKeys;
  const filteredLeaders = detail.leaders.filter((row) => activeLeaderKeys.includes(`${row.site}::${row.leader}`));
  const displayCount = topLimit === "all" ? filteredLeaders.length : Number(topLimit || 12);
  const displayLeaders = filteredLeaders.slice(0, displayCount);
  const leaderChartRows = displayLeaders.map((row) => ({
    ...row,
    y2025Qty: 0,
    y2025Bad: 0,
    y2025Rate: 0,
    y2026Qty: row.qty,
    y2026Bad: row.issues,
    y2026Rate: row.density,
  }));
  return <div className="iqc-analysis-grid ipqc-leader-analysis">
    <div className="iqc-summary-strip ipqc-summary ipqc-leader-summary">
      <div><span>2026送检数</span><strong>{Number(summary.qty || 0).toLocaleString()}</strong></div>
      <div><span>问题数量</span><strong>{Number(summary.issues || 0).toLocaleString()}</strong></div>
      <div><span>机长覆盖</span><strong>{Number(summary.mappedCount || 0)} / {Number(summary.leaderCount || 0)}</strong></div>
      <div><span>未覆盖机长</span><strong className={summary.unmappedCount ? "red" : "green"}>{Number(summary.unmappedCount || 0)}</strong></div>
      <div><span>DEA平均效率</span><strong className={summary.avgDea >= 85 ? "green" : "red"}>{Number(summary.avgDea || 0).toFixed(1)}</strong></div>
    </div>
    <AxisControlledPanel title="2.L1 交付经理/工坊质量对比" subtitle="工坊质量对应交付经理；二、二（外包）等统一归入二工坊" axisKey={`ipqc-leader-manager-${site}-axis-v1`} defaults={{ min: 0, max: 35 }}>
      {(axis) => <>
        <QuantityRateCombo rows={detail.managers} labelKey="name" rateLabel="异常密度" qtyLabel="送检数/问题数量" height={360} rateAxisOverride={axis.effective} hideRateAxisControl/>
        <IpqcUnassignedWorkshopRows rows={detail.unassignedWorkshops || []}/>
        <IpqcManagerQualityTable rows={detail.managers}/>
      </>}
    </AxisControlledPanel>
    <AxisControlledPanel title="2.L2 机长质量风险TOP" subtitle="柱形为送检数/问题数量，折线为异常密度；下表用DEA效率分处理数量与质量冲突" axisKey={`ipqc-leader-top-${site}-axis-v1`} defaults={{ min: 0, max: 80 }}>
      {(axis) => <>
        <IpqcDeaNote/>
        <div className="ipqc-leader-toolbar">
          <IpqcLeaderSelector rows={detail.leaders} selected={activeLeaderKeys} onChange={setSelectedLeaders}/>
          <label>显示数量<select value={topLimit} onChange={(event) => setTopLimit(event.target.value)}>
            <option value="12">TOP 12</option>
            <option value="20">TOP 20</option>
            <option value="30">TOP 30</option>
            <option value="all">全部</option>
          </select></label>
        </div>
        <QuantityRateCombo rows={leaderChartRows} labelKey="leader" rateLabel="异常密度" qtyLabel="送检数/问题数量" height={Math.max(430, leaderChartRows.length * 32 + 190)} rateAxisOverride={axis.effective} hideRateAxisControl/>
        <IpqcLeaderRankTable rows={displayLeaders}/>
      </>}
    </AxisControlledPanel>
    <Panel title="2.L3 机长 × 原始不良类型热力图" subtitle="聚焦综合风险靠前机长，直接使用原始“不良类型”字段">
      <WorkshopCategoryHeatmap data={detail.heatmap} height={Math.max(360, detail.heatmap.rows.length * 38 + 150)}/>
    </Panel>
    <Panel title="2.L4 未覆盖机长清单" subtitle="去“数据导入”页顶部映射设置中一键补充，保存后本页同步更新">
      <IpqcUnmappedLeaders rows={detail.unmapped}/>
    </Panel>
  </div>;
}

function IpqcOverallStatus({ data, mode }) {
  if (mode === "leader") {
    const summary = data.ipqc.leaderAnalysis?.bySite?.全公司?.summary || {};
    return <div className="ipqc-overall-status">
      <div><span>全公司机长送检数</span><strong>{Number(summary.qty || 0).toLocaleString()}</strong></div>
      <div><span>全公司问题数量</span><strong>{Number(summary.issues || 0).toLocaleString()}</strong></div>
      <div><span>机长覆盖</span><strong>{Number(summary.mappedCount || 0)} / {Number(summary.leaderCount || 0)}</strong></div>
      <div><span>未覆盖机长</span><strong className={summary.unmappedCount ? "red" : "green"}>{Number(summary.unmappedCount || 0)}</strong></div>
      <div><span>DEA平均效率</span><strong className={summary.avgDea >= 85 ? "green" : "red"}>{Number(summary.avgDea || 0).toFixed(1)}</strong></div>
    </div>;
  }
  const monthly = data.ipqc.siteMonthly?.全公司 || [];
  const totals = monthly.reduce((acc, row) => ({
    y2025Qty: acc.y2025Qty + (row.y2025Qty || 0),
    y2025Bad: acc.y2025Bad + (row.y2025Bad || 0),
    y2026Qty: acc.y2026Qty + (row.y2026Qty || 0),
    y2026Bad: acc.y2026Bad + (row.y2026Bad || 0),
  }), { y2025Qty: 0, y2025Bad: 0, y2026Qty: 0, y2026Bad: 0 });
  const rate25 = Number((totals.y2025Bad / Math.max(totals.y2025Qty, 1) * 100).toFixed(2));
  const rate26 = Number((totals.y2026Bad / Math.max(totals.y2026Qty, 1) * 100).toFixed(2));
  const delta = Number((rate26 - rate25).toFixed(2));
  const topWorkshop = (data.ipqc.workshopsBySite?.全公司 || [])[0];
  return <div className="ipqc-overall-status">
    <div><span>全公司2025送检数</span><strong>{totals.y2025Qty.toLocaleString()}</strong></div>
    <div><span>全公司2026送检数</span><strong>{totals.y2026Qty.toLocaleString()}</strong></div>
    <div><span>2025异常密度</span><strong>{rate25}%</strong></div>
    <div><span>2026异常密度</span><strong className={delta <= 0 ? "green" : "red"}>{rate26}%</strong></div>
    <div><span>TOP风险工坊</span><strong className="small">{topWorkshop?.name || "—"}</strong></div>
  </div>;
}

function IpqcAnalysis({ data }) {
  const [site, setSite] = useState("全公司");
  const [subView, setSubView] = useState("process");
  const monthly = data.ipqc.siteMonthly?.[site] || [];
  const workshops = data.ipqc.workshopsBySite?.[site] || data.ipqc.workshops || [];
  const rawTypes = data.ipqc.rawTypesBySite?.[site] || [];
  const heatmap = data.ipqc.heatmapBySite?.[site] || { categories: [], rows: [] };
  const improvements = data.ipqc.improvementsBySite?.[site] || [];
  const totals = monthly.reduce((acc, row) => ({
    y2025Qty: acc.y2025Qty + row.y2025Qty, y2025Bad: acc.y2025Bad + row.y2025Bad,
    y2026Qty: acc.y2026Qty + row.y2026Qty, y2026Bad: acc.y2026Bad + row.y2026Bad,
  }), { y2025Qty: 0, y2025Bad: 0, y2026Qty: 0, y2026Bad: 0 });
  const density = (year) => Number((totals[`y${year}Bad`] / Math.max(totals[`y${year}Qty`], 1) * 100).toFixed(2));
  const top = improvements[0];
  return <div className="module-page iqc-supplier-page ipqc-page">
    <FloatingTabs options={["全公司", "深圳", "杭州"]} active={site} onChange={setSite}/>
    <div className="iqc-section-title">
      <div><span className="section-number">2</span><div><h2>IPQC过程质量同比分析</h2><p>异常密度＝问题数量÷送检数；不良内容非空的一行计1个问题</p></div></div>
      <div className="module-heading-actions sticky-switch-bar"><AppliedPeriodTag data={data}/></div>
    </div>
    <div className="dqa-sub-tabs ipqc-sub-tabs">
      <button className={subView === "process" ? "active" : ""} onClick={() => setSubView("process")}>过程质量分析</button>
      <button className={subView === "leader" ? "active" : ""} onClick={() => setSubView("leader")}>机长质量分析</button>
    </div>
    <IpqcOverallStatus data={data} mode={subView}/>
    <div className="ipqc-site-switch sticky-switch-bar"><span>当前明细维度</span><div className="site-tabs"><button className={site === "全公司" ? "active" : ""} onClick={() => preserveScrollPosition(() => setSite("全公司"))}>全公司</button><button className={site === "深圳" ? "active" : ""} onClick={() => preserveScrollPosition(() => setSite("深圳"))}>深圳</button><button className={site === "杭州" ? "active" : ""} onClick={() => preserveScrollPosition(() => setSite("杭州"))}>杭州</button></div></div>
    {subView === "leader" ? <IpqcLeaderAnalysis data={data} site={site}/> : <>
    <div className="iqc-summary-strip ipqc-summary">
      <div><span>2025送检数</span><strong>{totals.y2025Qty.toLocaleString()}</strong></div>
      <div><span>2026送检数</span><strong>{totals.y2026Qty.toLocaleString()}</strong></div>
      <div><span>2025问题数量</span><strong>{totals.y2025Bad.toLocaleString()}</strong></div>
      <div><span>2026问题数量</span><strong>{totals.y2026Bad.toLocaleString()}</strong></div>
      <div><span>异常密度同比</span><strong className={density(2026) <= density(2025) ? "green" : "red"}>{density(2025)}% → {density(2026)}%</strong></div>
    </div>
    <div className="ipqc-insight"><strong>重点结论</strong><span>{top ? `${site}${top.workshop}的“${top.category}”为当前TOP问题，2026年占比${top.share}%，建议由${top.owner}牵头改善。` : "导入IPQC原始数据后自动生成重点结论。"}</span></div>
    <div className="iqc-analysis-grid">
      <AxisControlledPanel title="2.1 总体质量趋势" subtitle={`${site} · 柱形为送检数/问题数量，折线为异常密度（问题数量÷送检数）`} axisKey={`ipqc-${site}-monthly-axis-v1`} defaults={{ min: 0, max: 20 }}>
        {(axis) => <QuantityRateCombo rows={monthly} labelKey="month" rateLabel="异常密度" qtyLabel="送检数/问题数量" height={390} rateAxisOverride={axis.effective} hideRateAxisControl/>}
      </AxisControlledPanel>
      <Panel title="2.2 工坊质量表现" subtitle="可勾选工坊；表头点击后按对应指标升降序排列">
        <WorkshopCompare rows={workshops}/>
      </Panel>
      <AxisControlledPanel title="2.3 原始不良类型同比" subtitle="直接使用原始数据中的“不良类型”；柱形为问题数量，折线为分类占比" axisKey={`ipqc-${site}-raw-type-axis-v1`} defaults={{ min: 0, max: 60 }}>
        {(axis) => <QuantityRateCombo rows={rawTypes} qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Share" rate2026="y2026Share" rateLabel="分类占比" qtyLabel="问题数量" showBad={false} height={410} rateAxisOverride={axis.effective} hideRateAxisControl/>}
      </AxisControlledPanel>
      <Panel title="2.4 工坊 × 原始不良类型热力图" subtitle="直接使用原始“不良类型”字段；颜色越深表示该工坊对应问题越集中">
        <WorkshopCategoryHeatmap data={heatmap} height={Math.max(360, heatmap.rows.length * 38 + 150)}/>
      </Panel>
      <Panel title="2.5 TOP问题与针对性改善措施" subtitle="按2026原始不良类型数量排序，明确重点工坊、责任对象和执行动作">
        <ImprovementTable rows={improvements}/>
      </Panel>
    </div>
    </>}
  </div>;
}

const oqcColumns = [
  ["name", "对象"], ["y2025Count", "2025评分数"], ["y2025Avg", "2025平均分"], ["y2025FiveRate", "2025五分率"], ["y2025LowRate", "2025低分率"],
  ["y2026Count", "2026评分数"], ["y2026Avg", "2026平均分"], ["y2026FiveRate", "2026五分率"], ["y2026LowRate", "2026低分率"],
];

function OqcScoreTable({ rows }) {
  const [sort, setSort] = useState({ key: "y2026FiveRate", direction: "desc" });
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const result = typeof a[sort.key] === "string" ? a[sort.key].localeCompare(b[sort.key], "zh-CN") : (a[sort.key] || 0) - (b[sort.key] || 0);
    return sort.direction === "asc" ? result : -result;
  }), [rows, sort]);
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  return <div className="oqc-score-table">
    <div className="oqc-score-row oqc-score-head">{oqcColumns.map(([key,label]) => <button key={key} onClick={() => changeSort(key)}>{label}<span>{sort.key === key ? sort.direction === "asc" ? "▲" : "▼" : "↕"}</span></button>)}</div>
    {sorted.map((row) => <div className="oqc-score-row" key={row.name}>
      <strong>{row.name === "产品一部" ? "半导体&北美" : row.name}</strong><span>{row.y2025Count.toLocaleString()}</span><span>{row.y2025Avg}</span><span>{row.y2025FiveRate}%</span><span>{row.y2025LowRate}%</span>
      <span>{row.y2026Count.toLocaleString()}</span><span>{row.y2026Avg}</span><span>{row.y2026FiveRate}%</span><span className={row.y2026LowRate > row.y2025LowRate ? "rate-risk" : ""}>{row.y2026LowRate}%</span>
    </div>)}
  </div>;
}

const buildOqcOverallMetrics = (rows = []) => {
  const total = (key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  const count2025 = total("y2025Count");
  const count2026 = total("y2026Count");
  const score2025 = total("y2025ScoreTotal");
  const score2026 = total("y2026ScoreTotal");
  const five2025 = total("y2025Five");
  const five2026 = total("y2026Five");
  const low2025 = total("y2025Low");
  const low2026 = total("y2026Low");
  return {
    avg: {
      label: "平均分",
      y2025: Number((score2025 / Math.max(count2025, 1)).toFixed(2)),
      y2026: Number((score2026 / Math.max(count2026, 1)).toFixed(2)),
      suffix: "分",
      goodWhenDown: false,
      digits: 2,
    },
    fiveRate: {
      label: "5分比例",
      y2025: Number((five2025 / Math.max(count2025, 1) * 100).toFixed(1)),
      y2026: Number((five2026 / Math.max(count2026, 1) * 100).toFixed(1)),
      suffix: "%",
      goodWhenDown: false,
      digits: 1,
    },
    lowRate: {
      label: "低分比例",
      y2025: Number((low2025 / Math.max(count2025, 1) * 100).toFixed(1)),
      y2026: Number((low2026 / Math.max(count2026, 1) * 100).toFixed(1)),
      suffix: "%",
      goodWhenDown: true,
      digits: 1,
    },
  };
};

function OqcSummaryMetricCard({ item }) {
  const delta = Number((item.y2026 - item.y2025).toFixed(item.digits));
  const improved = item.goodWhenDown ? delta <= 0 : delta >= 0;
  const direction = delta >= 0 ? "↑" : "↓";
  const value = (number) => Number(number || 0).toFixed(item.digits);
  return <div className="oqc-summary-metric-card">
    <span>{item.label}</span>
    <strong>{value(item.y2026)}<small>{item.suffix}</small></strong>
    <div className="oqc-summary-card-foot">
      <em>2025：{value(item.y2025)}{item.suffix}</em>
      <b className={improved ? "good" : "bad"}>{direction} {Math.abs(delta).toFixed(item.digits)}{item.suffix}</b>
    </div>
  </div>;
}

function OqcSummaryCountCard({ y2025 = 0, y2026 = 0 }) {
  const delta = y2026 - y2025;
  return <div className="oqc-summary-metric-card oqc-summary-count-card">
    <span>评分设备</span>
    <strong>{Number(y2026 || 0).toLocaleString()}<small>台</small></strong>
    <div className="oqc-summary-card-foot">
      <em>2025：{Number(y2025 || 0).toLocaleString()}台</em>
      <b className={delta >= 0 ? "good" : "bad"}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toLocaleString()}台</b>
    </div>
  </div>;
}

function OqcSummaryFocusCard({ row }) {
  return <div className="oqc-summary-metric-card oqc-summary-focus-card">
    <span>重点关注</span>
    <strong>{row?.name || "—"}</strong>
    <div className="oqc-summary-card-foot">
      <em>2026低分率</em>
      <b className="bad">{Number(row?.y2026LowRate || 0).toFixed(1)}% / {Number(row?.y2026Low || 0).toLocaleString()}台</b>
    </div>
  </div>;
}

const oqcDetailChartRows = (rows = []) => rows.map((row) => ({
  ...row,
  y2025Qty: row.y2025Count || 0,
  y2026Qty: row.y2026Count || 0,
  y2025Bad: row.y2025Low || 0,
  y2026Bad: row.y2026Low || 0,
  y2025Rate: row.y2025LowRate || 0,
  y2026Rate: row.y2026LowRate || 0,
}));

function OqcShipmentMetricTable({ rows, nameLabel = "对象" }) {
  const [sort, setSort] = useState({ key: "y2026LowRate", direction: "desc" });
  const columns = [
    ["name", nameLabel], ["y2025Count", "2025机台"], ["y2025Avg", "2025均分"], ["y2025FiveRate", "2025 5分率"], ["y2025LowRate", "2025低分率"],
    ["y2026Count", "2026机台"], ["y2026Avg", "2026均分"], ["y2026FiveRate", "2026 5分率"], ["y2026LowRate", "2026低分率"],
  ];
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sort.key] ?? -Infinity;
    const bv = b[sort.key] ?? -Infinity;
    const result = typeof av === "string" ? av.localeCompare(bv, "zh-CN") : av - bv;
    return sort.direction === "asc" ? result : -result;
  }), [rows, sort]);
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  const value = (row, key) => key.includes("Rate") ? `${Number(row[key] || 0).toFixed(1)}%` : key.includes("Avg") ? Number(row[key] || 0).toFixed(2) : Number(row[key] || 0).toLocaleString();
  return <div className="oqc-score-table oqc-shipment-table">
    <div className="oqc-score-row oqc-score-head">{columns.map(([key, label]) => <button key={key} onClick={() => changeSort(key)}>{label}<span>{sort.key === key ? sort.direction === "asc" ? "▲" : "▼" : "↕"}</span></button>)}</div>
    {sorted.map((row) => <div className="oqc-score-row" key={`${row.name}-${row.division || ""}-${row.machine || ""}`}>
      <strong>{row.name}</strong>
      {columns.slice(1).map(([key]) => <span key={key} className={key === "y2026LowRate" && row[key] >= 15 ? "rate-risk" : ""}>{value(row, key)}</span>)}
    </div>)}
  </div>;
}

function OqcRiskMatrix({ rows }) {
  const maxLow = Math.max(1, ...rows.map((row) => row.y2026LowRate || 0));
  const divisions = ["半导体&北美", "产品五部", "FPC事业部"].filter((division) => rows.some((row) => row.division === division));
  return <div className="oqc-risk-matrix">
    {divisions.map((division) => <div className="oqc-risk-division-row" key={division}>
      <div className="oqc-risk-division-label">{division}</div>
      <div className="oqc-risk-division-cells">
        {rows.filter((row) => row.division === division).map((row) => {
          const level = row.y2026LowRate >= 15 ? "high" : row.y2026LowRate >= 8 ? "mid" : "low";
          return <div className={`oqc-risk-cell ${level}`} key={`${row.division}-${row.machine}`} style={{ "--risk-alpha": Math.min(.85, (row.y2026LowRate || 0) / maxLow) }}>
            <b>{row.machine}</b>
            <strong>{Number(row.y2026LowRate || 0).toFixed(1)}%</strong>
            <em>低分 {Number(row.y2026Low || 0).toLocaleString()} / 机台 {Number(row.y2026Count || 0).toLocaleString()}</em>
            <small>2025：{Number(row.y2025LowRate || 0).toFixed(1)}%</small>
          </div>;
        })}
      </div>
    </div>)}
  </div>;
}

function OqcShareTable({ rows }) {
  return <div className="oqc-share-table">
    <div className="oqc-share-row head"><span>类别</span><span>2025机台/占比</span><span>2026机台/占比</span><span>占比变化</span></div>
    {rows.map((row) => <div className="oqc-share-row" key={row.name}>
      <strong>{row.name}</strong>
      <span>{Number(row.y2025Count || 0).toLocaleString()} / {Number(row.y2025Share || 0).toFixed(1)}%</span>
      <span>{Number(row.y2026Count || 0).toLocaleString()} / {Number(row.y2026Share || 0).toFixed(1)}%</span>
      <b className={row.deltaShare >= 0 ? "up" : "down"}>{row.deltaShare >= 0 ? "↑" : "↓"} {Math.abs(row.deltaShare || 0).toFixed(1)}pp</b>
    </div>)}
  </div>;
}

function OqcImpactCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const signed = (value, digits = 2) => `${value >= 0 ? "+" : ""}${Number(value || 0).toFixed(digits)}`;
  return <div className={`oqc-impact-card ${expanded ? "expanded" : ""}`}>
    <button className="oqc-impact-card-main" onClick={() => setExpanded((current) => !current)}>
      <div><span>{item.label}</span><strong>{item.totalDelta >= 0 ? "↑" : "↓"} {Math.abs(item.totalDelta).toFixed(2)}分</strong></div>
      <p>2025平均分 {item.y2025Avg.toFixed(2)} → 2026平均分 {item.y2026Avg.toFixed(2)}</p>
      <div className="oqc-impact-parts">
        <em>质量改善贡献 <b className={item.qualityImpact >= 0 ? "up" : "down"}>{signed(item.qualityImpact)}</b></em>
        <em>结构变化影响 <b className={item.structureImpact >= 0 ? "up" : "down"}>{signed(item.structureImpact)}</b></em>
        <em>残差 <b>{signed(item.residual)}</b></em>
      </div>
      <small>{expanded ? "收起明细" : "展开明细"}</small>
    </button>
    {expanded && <div className="oqc-impact-detail">
      <div className="oqc-impact-detail-row head"><span>对象</span><span>2025占比/均分</span><span>2026占比/均分</span><span>质量改善贡献</span><span>结构变化影响</span></div>
      {item.rows.map((row) => <div className="oqc-impact-detail-row" key={`${item.label}-${row.name}`}>
        <strong>{row.name}</strong>
        <span>{Number(row.y2025Share || 0).toFixed(1)}% / {Number(row.y2025Avg || 0).toFixed(2)}</span>
        <span>{Number(row.y2026Share || 0).toFixed(1)}% / {Number(row.y2026Avg || 0).toFixed(2)}</span>
        <b className={row.qualityContribution >= 0 ? "up" : "down"}>{signed(row.qualityContribution)}</b>
        <b className={row.mixContribution >= 0 ? "up" : "down"}>{signed(row.mixContribution)}</b>
      </div>)}
      <p className="oqc-impact-residual-note">残差 = 总评分提升 - 质量改善贡献 - 结构变化影响。它主要代表拆解公式近似、四舍五入、交叉项分摊后剩下的未解释部分；当前残差越接近0，说明拆解越完整。</p>
    </div>}
  </div>;
}

function OqcStructureImpact({ items }) {
  return <div className="oqc-impact-grid">
    {items.map((item) => <OqcImpactCard item={item} key={item.label}/>)}
  </div>;
}

function OqcShipmentDetailAnalysis({ data }) {
  const detail = data.oqc.shipmentDetail;
  const [tpmDivision, setTpmDivision] = useState("全公司");
  const machineAxis = useMachinedAxisRange("oqc-shipment-machine-low-axis-v1", { min: 0, max: 35 });
  const tpmAxis = useMachinedAxisRange(`oqc-shipment-tpm-${tpmDivision}-low-axis-v1`, { min: 0, max: 45 });
  const scoreStructureAxis = useMachinedAxisRange("oqc-shipment-score-structure-axis-v1", { min: 0, max: 100 });
  const shareAxis = useMachinedAxisRange("oqc-shipment-share-axis-v1", { min: 0, max: 60 });
  if (!detail) return <div className="summary-note"><strong>待导入出货明细</strong><p>请导入“2025年出货汇总.xlsx”和“2026年出货汇总.xlsx”生成明细分析。</p></div>;
  const tpmRows = tpmDivision === "全公司" ? detail.tpmRows : detail.tpmRows.filter((row) => row.division === tpmDivision);
  const topTpmRows = tpmRows.slice(0, 12);
  const scoreValues = ["5分", "4分", "3分", "2分", "1分"];
  return <div className="oqc-shipment-analysis">
    <div className="iqc-summary-strip oqc-summary">
      <OqcSummaryCountCard y2025={detail.overall.y2025.count} y2026={detail.overall.y2026.count} />
      <OqcSummaryMetricCard item={{ label: "平均分", y2025: detail.overall.y2025.avg, y2026: detail.overall.y2026.avg, suffix: "", digits: 2, goodWhenDown: false }} />
      <OqcSummaryMetricCard item={{ label: "5分比例", y2025: detail.overall.y2025.fiveRate, y2026: detail.overall.y2026.fiveRate, suffix: "%", digits: 1, goodWhenDown: false }} />
      <OqcSummaryMetricCard item={{ label: "低分比例", y2025: detail.overall.y2025.lowRate, y2026: detail.overall.y2026.lowRate, suffix: "%", digits: 1, goodWhenDown: true }} />
      <OqcSummaryFocusCard row={detail.tpmRows[0]} />
    </div>
    <div className="iqc-analysis-grid">
      <div className="oqc-section-heading"><span className="section-number">3.D1</span><div><h2>机台分类评分对比</h2><p>按机台数量加权，定位治具与自动化出货质量差异</p></div></div>
      <Panel title="治具 vs 自动化低分风险" subtitle="柱形为机台数/低分机台数，折线为低分率" className="iqc-wide" action={<MachinedAxisPanelControl axis={machineAxis}/>}>
        <QuantityRateCombo rows={oqcDetailChartRows(detail.machineRows)} labelKey="name" qtyLabel="机台数量" badLabel="低分机台" rateLabel="低分率" height={380} chartKey="oqc-shipment-machine-low-rate" rateAxisOverride={machineAxis.effective} hideRateAxisControl/>
        <OqcShipmentMetricTable rows={detail.machineRows} nameLabel="机台分类"/>
      </Panel>

      <div className="oqc-section-heading"><span className="section-number">3.D2</span><div><h2>产品部 × 机台分类低分率</h2><p>按产品部纵向排列；颜色越深表示2026低分率越高，数字显示低分机台数/机台数</p></div></div>
      <Panel title="产品部 × 机台分类低分率" className="iqc-wide"><OqcRiskMatrix rows={detail.matrix}/></Panel>

      <div className="oqc-section-heading sticky-switch-bar"><span className="section-number">3.D3</span><div><h2>TPM风险排名</h2><p>按低分率、低分机台数和机台数量排序，可切换产品部</p></div>
        <div className="site-tabs">{["全公司", "半导体&北美", "产品五部", "FPC事业部"].map((name) => <button key={name} className={tpmDivision === name ? "active" : ""} onClick={() => preserveScrollPosition(() => setTpmDivision(name))}>{name}</button>)}</div>
      </div>
      <Panel title={`${tpmDivision} TPM低分风险TOP`} subtitle="柱形为机台数/低分机台数，折线为低分率" className="iqc-wide" action={<MachinedAxisPanelControl axis={tpmAxis}/>}>
        <QuantityRateCombo rows={oqcDetailChartRows(topTpmRows)} labelKey="name" qtyLabel="机台数量" badLabel="低分机台" rateLabel="低分率" height={Math.max(360, topTpmRows.length * 42 + 150)} chartKey={`oqc-shipment-tpm-${tpmDivision}`} rateAxisOverride={tpmAxis.effective} hideRateAxisControl/>
        <OqcShipmentMetricTable rows={tpmRows} nameLabel="TPM"/>
      </Panel>

      <div className="oqc-section-heading"><span className="section-number">3.D4</span><div><h2>评分结构迁移</h2><p>按5分到1分顺序展示，突出5分占比提升和低分收敛</p></div></div>
      <Panel title="评分档位结构对比" className="iqc-wide" action={<MachinedAxisPanelControl axis={scoreStructureAxis}/>}>
        <YearStackedCompare rows={detail.scoreStructureRows} values={scoreValues} height={Math.max(420, detail.scoreStructureRows.length * 82 + 120)} chartKey="oqc-shipment-score-structure" topToBottom rateAxisOverride={scoreStructureAxis.effective} hideRateAxisControl/>
      </Panel>

      <div className="oqc-section-heading"><span className="section-number">3.D5</span><div><h2>出货结构变化分析</h2><p>对比产品部与机台分类的出货占比，并拆解结构变化对平均分的影响</p></div><MachinedAxisPanelControl axis={shareAxis}/></div>
      <div className="oqc-three-grid oqc-two-grid">
        <Panel title="产品部出货占比变化"><BarCompare labels={detail.productShareRows.map((row) => row.name)} first={detail.productShareRows.map((row) => row.y2025Share)} second={detail.productShareRows.map((row) => row.y2026Share)} names={["2025占比", "2026占比"]} chartKey="oqc-product-share" rateAxisOverride={shareAxis.effective} hideRateAxisControl/><OqcShareTable rows={detail.productShareRows}/></Panel>
        <Panel title="机台分类出货占比变化"><BarCompare labels={detail.machineShareRows.map((row) => row.name)} first={detail.machineShareRows.map((row) => row.y2025Share)} second={detail.machineShareRows.map((row) => row.y2026Share)} names={["2025占比", "2026占比"]} chartKey="oqc-machine-share" rateAxisOverride={shareAxis.effective} hideRateAxisControl/><OqcShareTable rows={detail.machineShareRows}/></Panel>
      </div>
      <Panel title="评分提升拆解" subtitle="质量改善贡献按2025结构加权；结构变化影响用于判断是否由出货结构变化带来" className="iqc-wide">
        <OqcStructureImpact items={detail.structureImpact}/>
      </Panel>
    </div>
  </div>;
}

function OqcSummaryAnalysis({ data, summary }) {
  const [focusDivision, setFocusDivision] = useState("FPC事业部");
  if (!summary) return <div className="module-summary"><KpiCard item={data.kpis[2]} /><div className="summary-note"><strong>待导入月度汇总表</strong><p>请导入“2025年-2026年评分按月汇总.xlsx”生成同期评分分析。</p></div></div>;
  const monthly = summary.divisionMonthly?.[focusDivision] || summary.fpcMonthly || [];
  const overallMetrics = buildOqcOverallMetrics(summary.divisions);
  const total2025 = summary.divisions.reduce((sum, row) => sum + (Number(row.y2025Count) || 0), 0);
  const total2026 = summary.divisions.reduce((sum, row) => sum + (Number(row.y2026Count) || 0), 0);
  const fpcWorst = [...(summary.fpcTpm || [])].sort((a,b) => (b.y2026LowRate || 0) - (a.y2026LowRate || 0))[0];
  const avgAxis = useMachinedAxisRange(`oqc-${focusDivision}-avg-axis-v1`, { min: 0, max: 5 });
  const fiveAxis = useMachinedAxisRange(`oqc-${focusDivision}-five-axis-v1`, { min: 0, max: 100 });
  const lowAxis = useMachinedAxisRange(`oqc-${focusDivision}-low-axis-v1`, { min: 0, max: 30 });
  return <div className="oqc-summary-analysis">
    <FloatingTabs options={[{ value: "产品一部", label: "半导体&北美" }, { value: "产品五部", label: "产品五部" }, { value: "FPC事业部", label: "FPC事业部" }]} active={focusDivision} onChange={setFocusDivision}/>
    <div className="iqc-summary-strip oqc-summary">
      <OqcSummaryCountCard y2025={total2025} y2026={total2026} />
      <OqcSummaryMetricCard item={overallMetrics.avg} />
      <OqcSummaryMetricCard item={overallMetrics.fiveRate} />
      <OqcSummaryMetricCard item={overallMetrics.lowRate} />
      <OqcSummaryFocusCard row={fpcWorst} />
    </div>
    <div className="iqc-analysis-grid">
      <div className="oqc-section-heading"><span className="section-number">3.1</span><div><h2>三大产品部总体对比</h2><p>半导体&北美、产品五部、FPC事业部按评分数量加权计算</p></div></div>
      <div className="oqc-three-grid">
        <Panel title="平均分同期对比"><ScoreYearCompare rows={summary.divisions} metric="Avg" label="平均分" max={5}/></Panel>
        <Panel title="5分比例同期对比"><ScoreYearCompare rows={summary.divisions} metric="FiveRate" label="5分比例" percent max={100}/></Panel>
        <Panel title="低分（≤3分）比例同期对比"><ScoreYearCompare rows={summary.divisions} metric="LowRate" label="低分比例" percent max={100}/></Panel>
      </div>
      <Panel title="产品部指标明细" subtitle="点击表头可按评分数、平均分、5分率或低分率排序"><OqcScoreTable rows={summary.divisions}/></Panel>

      <div className="oqc-section-heading sticky-switch-bar"><span className="section-number">3.2</span><div><h2>月度评分趋势</h2><p>切换产品部查看1—5月平均分、5分率和低分率走势</p></div>
        <div className="site-tabs">{["产品一部","产品五部","FPC事业部"].map((name) => <button key={name} className={focusDivision === name ? "active" : ""} onClick={() => preserveScrollPosition(() => setFocusDivision(name))}>{name === "产品一部" ? "半导体&北美" : name}</button>)}</div>
        <OqcMonthlyAxisControl scoreAxis={avgAxis} fiveAxis={fiveAxis} lowAxis={lowAxis}/>
      </div>
      <div className="oqc-three-grid">
        <Panel title={`${focusDivision === "产品一部" ? "半导体&北美" : focusDivision}平均分月度趋势`}><ScoreMonthlyCombo rows={monthly} metric="Avg" label="平均分" numeratorKey="ScoreTotal" numeratorName="评分总分" denominatorName="评分数量" max={5} rateAxisOverride={avgAxis.effective} hideRateAxisControl/></Panel>
        <Panel title={`${focusDivision === "产品一部" ? "半导体&北美" : focusDivision}5分比例月度趋势`}><ScoreMonthlyCombo rows={monthly} metric="FiveRate" label="5分比例" numeratorKey="Five" numeratorName="5分数量" denominatorName="评分总数量" percent max={100} rateAxisOverride={fiveAxis.effective} hideRateAxisControl/></Panel>
        <Panel title={`${focusDivision === "产品一部" ? "半导体&北美" : focusDivision}低分率月度趋势`}><ScoreMonthlyCombo rows={monthly} metric="LowRate" label="低分比例" numeratorKey="Low" numeratorName="≤3分数量" denominatorName="评分总数量" percent max={100} rateAxisOverride={lowAxis.effective} hideRateAxisControl/></Panel>
      </div>

      <div className="oqc-section-heading"><span className="section-number">3.3</span><div><h2>FPC事业部TPM对比</h2><p>刘波、王辉、罗超、林秋秋、朱慧慧同期评分表现</p></div></div>
      <div className="oqc-three-grid">
        <Panel title="FPC TPM平均分"><ScoreYearCompare rows={summary.fpcTpm} metric="Avg" label="平均分" max={5}/></Panel>
        <Panel title="FPC TPM 5分比例"><ScoreYearCompare rows={summary.fpcTpm} metric="FiveRate" label="5分比例" percent max={100}/></Panel>
        <Panel title="FPC TPM低分比例"><ScoreYearCompare rows={summary.fpcTpm} metric="LowRate" label="低分比例" percent max={100}/></Panel>
      </div>
      <Panel title="FPC TPM指标明细" subtitle="2025年无1分栏，按1分数量为0计算"><OqcScoreTable rows={summary.fpcTpm}/></Panel>
    </div>
  </div>;
}

function OqcAnalysis({ data }) {
  const [oqcTab, setOqcTab] = useState("summary");
  const summary = data.oqc.monthlySummary;
  const hasDetail = Boolean(data.oqc.shipmentDetail);
  return <div className="module-page iqc-supplier-page oqc-page">
    <div className="iqc-section-title">
      <div><span className="section-number">3</span><div><h2>OQC出货评分同期分析</h2><p>按顶部已应用日期范围进行同期对比；低分定义为最终评分≤3分</p></div></div>
      <AppliedPeriodTag data={data}/>
    </div>
    <div className="dqa-sub-tabs oqc-sub-tabs">
      <button className={oqcTab === "summary" ? "active" : ""} onClick={() => setOqcTab("summary")}>评分汇总分析</button>
      <button className={oqcTab === "detail" ? "active" : ""} onClick={() => setOqcTab("detail")}>出货明细分析{hasDetail ? "" : "（待导入）"}</button>
    </div>
    {oqcTab === "detail" ? <OqcShipmentDetailAnalysis data={data}/> : <OqcSummaryAnalysis data={data} summary={summary}/>}
  </div>;
}

function DqaCompareTable({ rows, values, sort, onSort }) {
  const sortIcon = (key) => sort?.key === key ? (sort.direction === "asc" ? "ASC" : "DESC") : "SORT";
  const changeSort = (key) => onSort?.(key);
  return <div className="dqa-compare-table">
    <div className="dqa-compare-row dqa-compare-head" style={{ "--dqa-cols": values.length }}>
      <button onClick={() => changeSort("name")}>对象 <span>{sortIcon("name")}</span></button>
      <button onClick={() => changeSort("year")}>年度 <span>{sortIcon("year")}</span></button>
      <button onClick={() => changeSort("total")}>问题总数 <span>{sortIcon("total")}</span></button>
      {values.map((value) => <button key={value} onClick={() => changeSort(value)}>{value} <span>{sortIcon(value)}</span></button>)}
    </div>
    {rows.flatMap((row) => row.years.map((year) => <div className="dqa-compare-row" key={`${row.name}-${year.year}`} style={{ "--dqa-cols": values.length }}>
      <strong>{row.name}</strong><b>{year.year}</b><span>{year.total.toLocaleString()}</span>
      {values.map((value) => {
        const count = year.counts[value] || 0;
        const share = Number((count / Math.max(year.total, 1) * 100).toFixed(1));
        return <span key={value}>{count.toLocaleString()} <em>{share}%</em></span>;
      })}
    </div>))}
  </div>;
}

function DqaComparePanel({ title, subtitle, rows, values }) {
  const [sort, setSort] = useState({ key: "total", direction: "desc" });
  const sortedRows = useMemo(() => {
    const valueOf = (row, key) => {
      if (key === "name") return row.name || "";
      const y2026 = row.years.find((year) => year.year === 2026) || row.years[row.years.length - 1] || {};
      if (key === "year") return y2026.year || 0;
      if (key === "total") return y2026.total || 0;
      return y2026.counts?.[key] || 0;
    };
    return [...rows].sort((a, b) => {
      const av = valueOf(a, sort.key);
      const bv = valueOf(b, sort.key);
      const result = typeof av === "string" ? av.localeCompare(bv, "zh-CN") : av - bv;
      return sort.direction === "asc" ? result : -result;
    });
  }, [rows, sort]);
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  return <Panel title={title} subtitle={subtitle}>
    <YearStackedCompare rows={sortedRows} values={values} height={Math.max(360, sortedRows.length * 72 + 90)}/>
    <DqaCompareTable rows={sortedRows} values={values} sort={sort} onSort={changeSort}/>
  </Panel>;
}


function DqaTpmSelector({ tpms, hidden, onToggle, onSelectAll, onClearAll }) {
  const selectedCount = tpms.filter((name) => !hidden.includes(name)).length;
  return <div className="dqa-tpm-selector">
    <div><strong>TPM筛选</strong><span>已选 {selectedCount}/{tpms.length}</span></div>
    <div className="dqa-tpm-actions"><button onClick={onSelectAll}>全选</button><button onClick={onClearAll}>清空</button></div>
    <div className="dqa-tpm-checks">
      {tpms.map((name) => <label key={name} className={hidden.includes(name) ? "" : "active"}><input type="checkbox" checked={!hidden.includes(name)} onChange={() => onToggle(name)}/><span>{name}</span></label>)}
    </div>
  </div>;
}

const ecnFlattenRows = (rows) => rows.map((row) => {
  const y2025 = row.years.find((item) => item.year === 2025) || {};
  const y2026 = row.years.find((item) => item.year === 2026) || {};
  return {
    ...row,
    y2025Qty: y2025.denominator || 0,
    y2025Bad: y2025.numerator || 0,
    y2025Rate: y2025.rate || 0,
    y2026Qty: y2026.denominator || 0,
    y2026Bad: y2026.numerator || 0,
    y2026Rate: y2026.rate || 0,
    delta: Number(((y2026.rate || 0) - (y2025.rate || 0)).toFixed(2)),
  };
});

const ecnRateValue = (numerator, denominator) => Number((numerator / Math.max(denominator, 1) * 100).toFixed(2));
const ecnBuildDimensionRows = (entities, years, numeratorRows, denominatorRows, entityGetter) => entities.map((entity) => {
  const name = typeof entity === "string" ? entity : entity.name;
  return {
    name,
    division: entity.division,
    tpm: entity.tpm,
    years: years.map((year) => {
      const numerator = numeratorRows.filter((row) => row.year === year && entityGetter(row) === name).length;
      const denominator = denominatorRows.filter((row) => row.year === year && entityGetter(row) === name).reduce((sum, row) => sum + row.materialCount, 0);
      return { year, numerator, denominator, rate: ecnRateValue(numerator, denominator) };
    }),
  };
});
const ecnBuildReasonRows = (entities, values, years, numeratorRows, entityGetter) => entities.map((entity) => {
  const name = typeof entity === "string" ? entity : entity.name;
  return {
    name,
    division: entity.division,
    tpm: entity.tpm,
    years: years.map((year) => {
      const source = numeratorRows.filter((row) => row.year === year && entityGetter(row) === name);
      const counts = Object.fromEntries(values.map((value) => [value, source.filter((row) => row.reason === value).length]));
      return { year, counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
    }),
  };
});
const filterEcnByReasons = (ecn, selectedReasons) => {
  if (!ecn?.source) return ecn;
  const { numeratorRows, denominatorRows, years, months, divisions, tpmEntities } = ecn.source;
  const selected = new Set(selectedReasons);
  const filteredNumerator = numeratorRows.filter((row) => selected.has(row.reason));
  const numeratorByTpm = filteredNumerator.filter((row) => row.tpmKey);
  const denominatorByTpm = denominatorRows.filter((row) => row.tpmKey);
  const reasonValues = (ecn.allReasonValues || []).filter((reason) => selected.has(reason));
  const topReasonValues = reasonValues.slice(0, 10);
  const monthly = months.map((month) => {
    const result = { name: `${month}月` };
    years.forEach((year) => {
      const numerator = filteredNumerator.filter((row) => row.year === year && row.month === month).length;
      const denominator = denominatorRows.filter((row) => row.year === year && row.month === month).reduce((sum, row) => sum + row.materialCount, 0);
      result[`y${year}Qty`] = denominator;
      result[`y${year}Bad`] = numerator;
      result[`y${year}Rate`] = ecnRateValue(numerator, denominator);
    });
    result.delta = Number((result.y2026Rate - result.y2025Rate).toFixed(2));
    return result;
  });
  const totals = years.reduce((result, year) => {
    const numerator = filteredNumerator.filter((row) => row.year === year).length;
    const denominator = denominatorRows.filter((row) => row.year === year).reduce((sum, row) => sum + row.materialCount, 0);
    result[year] = { numerator, denominator, rate: ecnRateValue(numerator, denominator) };
    return result;
  }, {});
  return {
    ...ecn,
    totals,
    monthly,
    divisions: ecnBuildDimensionRows(divisions, years, filteredNumerator, denominatorRows, (row) => row.division),
    tpms: ecnBuildDimensionRows(tpmEntities, years, numeratorByTpm, denominatorByTpm, (row) => row.tpmKey),
    reasonValues: topReasonValues,
    tpmReasonValues: topReasonValues,
    divisionReasons: ecnBuildReasonRows(divisions, topReasonValues, years, filteredNumerator, (row) => row.division),
    tpmReasons: ecnBuildReasonRows(tpmEntities, topReasonValues, years, numeratorByTpm, (row) => row.tpmKey),
  };
};

function EcnReasonSelector({ reasons, selected, onChange }) {
  const allSelected = reasons.length > 0 && selected.length === reasons.length;
  const toggle = (reason) => onChange(selected.includes(reason) ? selected.filter((item) => item !== reason) : [...selected, reason]);
  return <div className="ecn-reason-filter">
    <div>
      <b>变更原因统计范围</b>
      <span>只统计已勾选原因；默认排除“分批下单/多人协作下单”。</span>
    </div>
    <div className="ecn-reason-actions">
      <button onClick={() => onChange(reasons)}>{allSelected ? "已全选" : "全选"}</button>
      <button onClick={() => onChange([])}>清空</button>
    </div>
    <div className="ecn-reason-checks">
      {reasons.map((reason) => <label key={reason} className={selected.includes(reason) ? "active" : ""}>
        <input type="checkbox" checked={selected.includes(reason)} onChange={() => toggle(reason)}/>
        <span>{reason}</span>
      </label>)}
    </div>
  </div>;
}

function EcnKpiCards({ ecn }) {
  const y2025 = ecn.totals?.[2025] || { numerator: 0, denominator: 0, rate: 0 };
  const y2026 = ecn.totals?.[2026] || { numerator: 0, denominator: 0, rate: 0 };
  const delta = Number((y2026.rate - y2025.rate).toFixed(2));
  const numeratorDelta = y2026.numerator - y2025.numerator;
  const denominatorDelta = y2026.denominator - y2025.denominator;
  const judgement = delta > 0.05 ? { text: "恶化", cls: "risk-up", hint: "ECN率同比上升" }
    : delta < -0.05 ? { text: "改善", cls: "risk-down", hint: "ECN率同比下降" }
    : { text: "持平", cls: "", hint: "ECN率同比基本持平" };
  return <div className="dqa-overview-kpis ecn-kpis">
    <div><span>2026 ECN率</span><strong>{y2026.rate}%</strong><p><b>2025：{y2025.rate}%</b><em className={delta > 0 ? "risk-up" : "risk-down"}>{delta > 0 ? "+" : ""}{delta}pp</em></p></div>
    <div><span>2026 ECN条数</span><strong>{y2026.numerator.toLocaleString()}</strong><p><b>2025：{y2025.numerator.toLocaleString()}</b><em className={numeratorDelta > 0 ? "risk-up" : "risk-down"}>{numeratorDelta > 0 ? "+" : ""}{numeratorDelta.toLocaleString()}</em></p></div>
    <div><span>2026 物料款数</span><strong>{y2026.denominator.toLocaleString()}</strong><p><b>2025：{y2025.denominator.toLocaleString()}</b><em className={denominatorDelta > 0 ? "risk-up" : "risk-down"}>{denominatorDelta > 0 ? "+" : ""}{denominatorDelta.toLocaleString()}</em></p></div>
    <div className="review-card"><span>同比判断</span><strong className={judgement.cls}>{judgement.text}</strong><p><b>{judgement.hint} {delta > 0 ? "+" : ""}{delta}pp</b><em>条数 {numeratorDelta > 0 ? "+" : ""}{numeratorDelta.toLocaleString()} / 物料 {denominatorDelta > 0 ? "+" : ""}{denominatorDelta.toLocaleString()}</em></p></div>
  </div>;
}

function EcnRateTable({ rows, numeratorLabel = "ECN条数", denominatorLabel = "物料款数", rateLabel = "ECN率" }) {
  return <div className="dqa-compare-table">
    <div className="ecn-rate-row ecn-rate-head"><span>对象</span><span>2025 {numeratorLabel}</span><span>2025 {denominatorLabel}</span><span>2025 {rateLabel}</span><span>2026 {numeratorLabel}</span><span>2026 {denominatorLabel}</span><span>2026 {rateLabel}</span><span>同比变化</span></div>
    {ecnFlattenRows(rows).map((row) => <div className="ecn-rate-row" key={row.name}>
      <strong>{row.name}</strong>
      <span>{row.y2025Bad.toLocaleString()}</span><span>{row.y2025Qty.toLocaleString()}</span><b>{row.y2025Rate}%</b>
      <span>{row.y2026Bad.toLocaleString()}</span><span>{row.y2026Qty.toLocaleString()}</span><b>{row.y2026Rate}%</b>
      <em className={row.delta > 0 ? "risk-up" : "risk-down"}>{row.delta > 0 ? "+" : ""}{row.delta}pp</em>
    </div>)}
  </div>;
}

function EcnRatePanel({ title, subtitle, rows, chartKey, numeratorLabel = "ECN条数", denominatorLabel = "物料款数", rateLabel = "ECN率" }) {
  const flat = ecnFlattenRows(rows);
  return <AxisControlledPanel title={title} subtitle={subtitle} axisKey={`${chartKey}-axis-v1`} defaults={{ min: 0, max: 20 }}>
    {(axis) => <>
    <QuantityRateCombo rows={flat} qtyLabel={denominatorLabel} badLabel={numeratorLabel} rateLabel={rateLabel} height={Math.max(360, flat.length * 46 + 160)} chartKey={chartKey} rateAxisOverride={axis.effective} hideRateAxisControl/>
    <EcnRateTable rows={rows} numeratorLabel={numeratorLabel} denominatorLabel={denominatorLabel} rateLabel={rateLabel}/>
    </>}
  </AxisControlledPanel>;
}

const ecnTpmDisplayName = (name) => String(name || "").split("\n").pop();

function EcnTpmReasonTable({ rows, values }) {
  const groups = [...new Set(rows.map((row) => row.division).filter(Boolean))];
  return <div className="dqa-compare-table ecn-tpm-reason-table">
    <div className="dqa-compare-row dqa-compare-head" style={{ "--dqa-cols": values.length }}><span>产品部</span><span>TPM</span><span>年度</span><span>ECN数</span>{values.map((value) => <span key={value}>{value}</span>)}</div>
    {groups.flatMap((division) => rows.filter((row) => row.division === division).flatMap((row, rowIndex) => row.years.map((year, yearIndex) => <div className="dqa-compare-row ecn-tpm-table-row" key={`${row.name}-${year.year}`} style={{ "--dqa-cols": values.length }}>
      <strong>{rowIndex === 0 && yearIndex === 0 ? division : ""}</strong><strong>{yearIndex === 0 ? ecnTpmDisplayName(row.name) : ""}</strong><b>{year.year}</b><span>{year.total.toLocaleString()}</span>
      {values.map((value) => {
        const count = year.counts[value] || 0;
        const share = Number((count / Math.max(year.total, 1) * 100).toFixed(1));
        return <span key={value}>{count.toLocaleString()} <em>{share}%</em></span>;
      })}
    </div>)))}
  </div>;
}

function EcnTpmReasonGrouped({ ecn }) {
  const rows = ecn.tpmReasons || [];
  const divisions = ["全公司", ...new Set(rows.map((row) => row.division).filter(Boolean))];
  const [division, setDivision] = useState("全公司");
  const filteredRows = division === "全公司" ? rows : rows.filter((row) => row.division === division);
  const groups = [...new Set(filteredRows.map((row) => row.division).filter(Boolean))].map((division) => ({
    division,
    rows: filteredRows.filter((row) => row.division === division),
  })).filter((group) => group.rows.length);
  const chartRows = filteredRows.map((row) => ({ ...row, name: ecnTpmDisplayName(row.name) }));
  const totalAxisRows = Math.max(1, chartRows.reduce((sum, row) => sum + row.years.length, 0));
  const chartHeight = Math.max(420, totalAxisRows * 28 + 120);
  return <Panel title="TPM变更原因占比" subtitle="可按产品部或全公司切换；TPM姓名不带产品部前缀">
    <div className="machined-tpm-toolbar">
      <div className="site-tabs machined-division-tabs">
        {divisions.map((item) => <button key={item} className={division === item ? "active" : ""} onClick={() => setDivision(item)}>{item}</button>)}
      </div>
    </div>
    <div className="ecn-tpm-grouped-chart" style={{ "--ecn-axis-rows": totalAxisRows, "--ecn-plot-height": `${chartHeight - 76}px` }}>
      <div className="ecn-tpm-group-labels">
        {groups.map((group) => <div key={group.division} style={{ flex: group.rows.length * 2 }}><span>{group.division}</span></div>)}
      </div>
      <div className="ecn-tpm-group-chart">
        <YearStackedCompare rows={chartRows} values={ecn.tpmReasonValues} height={chartHeight} chartKey="dqa-ecn-tpm-reasons-grouped" topToBottom/>
      </div>
    </div>
    <EcnTpmReasonTable rows={filteredRows} values={ecn.tpmReasonValues}/>
  </Panel>;
}

function DqaEcnAnalysis({ data }) {
  const baseEcn = data.dqa.ecn;
  const reasons = baseEcn?.allReasonValues || baseEcn?.reasonValues || [];
  const defaultReasons = reasons.filter((reason) => reason !== "分批下单/多人协作下单");
  const storageKey = "qms-dqa-ecn-selected-reasons-v1";
  const [selectedReasons, setSelectedReasons] = useState(() => {
    const saved = safeParse(localStorage.getItem(storageKey), null);
    return Array.isArray(saved) && saved.length ? saved.filter((reason) => reasons.includes(reason)) : defaultReasons;
  });
  useEffect(() => {
    if (!reasons.length) return;
    setSelectedReasons((current) => {
      const valid = current.filter((reason) => reasons.includes(reason));
      const next = valid.length ? valid : defaultReasons;
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [reasons.join("|")]);
  const updateSelectedReasons = (next) => {
    setSelectedReasons(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };
  const ecn = useMemo(() => filterEcnByReasons(baseEcn, selectedReasons), [baseEcn, selectedReasons.join("|")]);
  if (!baseEcn) return <div className="summary-note ecn-empty"><strong>待导入ECN数据</strong><p>请在 DQA 数据源中导入“2025-2026年ECN汇总.xlsx”，系统会自动读取 ECN（分子）和 ECN（分母）两个Sheet。</p></div>;
  return <div className="dqa-ecn-page">
    <div className="dqa-module-title"><span className="section-number">4.E</span><div><h2>ECN同期分析</h2><p>ECN率 = ECN条数 / 物料款数；统计周期跟随顶部日期筛选，分母为空不计算，其它部门暂不统计。</p></div></div>
    <EcnReasonSelector reasons={reasons} selected={selectedReasons} onChange={updateSelectedReasons}/>
    <EcnKpiCards ecn={ecn}/>
    <div className="dqa-grid">
      <AxisControlledPanel title="ECN率月度趋势" subtitle="柱形图为物料款数与ECN条数，折线为ECN率" axisKey="dqa-ecn-monthly-axis-v1" defaults={{ min: 0, max: 10 }}>
        {(axis) => <>
        <QuantityRateCombo rows={ecn.monthly} qtyLabel="物料款数" badLabel="ECN条数" rateLabel="ECN率" height={390} chartKey="dqa-ecn-monthly" rateAxisOverride={axis.effective} hideRateAxisControl/>
        <EcnRateTable rows={ecn.monthly.map((row) => ({
          name: row.name,
          years: [
            { year: 2025, denominator: row.y2025Qty, numerator: row.y2025Bad, rate: row.y2025Rate },
            { year: 2026, denominator: row.y2026Qty, numerator: row.y2026Bad, rate: row.y2026Rate },
          ],
        }))}/>
        </>}
      </AxisControlledPanel>
      <EcnRatePanel title="产品部ECN率同期对比" subtitle="IC载板产品部、北美项目部、传感器产品部合并为半导体&北美" rows={ecn.divisions} chartKey="dqa-ecn-division-rate"/>
      <DqaComparePanel title="产品部变更原因占比" subtitle="按ECN（分子）中的“变更原因”统计，上方为2025、下方为2026" rows={ecn.divisionReasons} values={ecn.reasonValues}/>
    </div>
    <div className="dqa-module-title"><span className="section-number">4.E.1</span><div><h2>TPM变更原因合并分析</h2><p>TPM分析使用原始产品部做左侧分组标记，不把IC载板/北美/传感器合并；仅产品部总体分析时才合并为“半导体&北美”。</p></div></div>
    <EcnTpmReasonGrouped ecn={ecn}/>
  </div>;
}

function MachinedPartKpiCards({ parts }) {
  const items = [
    { title: "ECN加工件占比", data: parts.ecn },
    { title: "ECN加工件数量", data: parts.ecn, mode: "count" },
    { title: "非BOM加工件占比", data: parts.nonBom },
    { title: "非BOM加工件数量", data: parts.nonBom, mode: "count" },
  ];
  return <div className="dqa-overview-kpis ecn-kpis machined-kpis">
    {items.map((item) => {
      const y2025 = item.data?.totals?.[2025] || { numerator: 0, denominator: 0, rate: 0 };
      const y2026 = item.data?.totals?.[2026] || { numerator: 0, denominator: 0, rate: 0 };
      const isCount = item.mode === "count";
      const value2026 = isCount ? y2026.numerator : y2026.rate;
      const value2025 = isCount ? y2025.numerator : y2025.rate;
      const delta = Number((value2026 - value2025).toFixed(2));
      return <div key={item.title}>
        <span>2026 {item.title}</span>
        <strong>{isCount ? value2026.toLocaleString() : `${value2026}%`}</strong>
        <p><b>2025：{isCount ? value2025.toLocaleString() : `${value2025}%`}</b><em className={delta > 0 ? "risk-up" : "risk-down"}>{delta > 0 ? "+" : ""}{isCount ? delta.toLocaleString() : `${delta}pp`}</em></p>
      </div>;
    })}
  </div>;
}

const MACHINED_TPM_DIVISIONS = ["全公司", "半导体&北美", "产品五部", "FPC事业部"];

const machinedMonthlyRows = (rows) => rows.map((row) => ({
  name: row.name,
  years: [
    { year: 2025, denominator: row.y2025Qty, numerator: row.y2025Bad, rate: row.y2025Rate },
    { year: 2026, denominator: row.y2026Qty, numerator: row.y2026Bad, rate: row.y2026Rate },
  ],
}));

function useMachinedAxisRange(storageKey, defaults = { min: 0, max: 20 }) {
  const [range, setRange] = useState(() => {
    const saved = safeParse(localStorage.getItem(storageKey), null);
    return saved && saved.min != null && saved.max != null ? saved : defaults;
  });
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(range)); }, [storageKey, range]);
  const safeMax = Math.max(0.1, Number(range.max) || defaults.max || 20);
  const safeMin = Math.min(safeMax - 0.1, Math.max(0, Number(range.min) || 0));
  const update = (key, value) => setRange((current) => ({ ...current, [key]: value }));
  const commit = () => setRange({ min: safeMin, max: safeMax });
  return { range, effective: { min: safeMin, max: safeMax }, update, commit };
}

function MachinedAxisPanelControl({ axis }) {
  return <div className="machined-axis-group machined-panel-axis">
    <label className="machined-axis-control">比例轴最小值<input type="number" min="0" step="0.1" value={axis.range.min} onChange={(event) => axis.update("min", event.target.value)} onBlur={axis.commit}/><span>%</span></label>
    <label className="machined-axis-control">比例轴最大值<input type="number" min="0.1" step="0.1" value={axis.range.max} onChange={(event) => axis.update("max", event.target.value)} onBlur={axis.commit}/><span>%</span></label>
  </div>;
}

function OqcMonthlyAxisControl({ scoreAxis, fiveAxis, lowAxis }) {
  const axisItems = [
    { label: "平均分轴", axis: scoreAxis, unit: "分", step: "0.1" },
    { label: "5分比例轴", axis: fiveAxis, unit: "%", step: "0.1" },
    { label: "低分比例轴", axis: lowAxis, unit: "%", step: "0.1" },
  ];
  return <div className="machined-axis-group machined-panel-axis oqc-monthly-axis-group">
    {axisItems.map(({ label, axis, unit, step }) => <div className="oqc-axis-mini-group" key={label}>
      <span>{label}</span>
      <label className="machined-axis-control">最小<input type="number" min="0" step={step} value={axis.range.min} onChange={(event) => axis.update("min", event.target.value)} onBlur={axis.commit}/><em>{unit}</em></label>
      <label className="machined-axis-control">最大<input type="number" min="0.1" step={step} value={axis.range.max} onChange={(event) => axis.update("max", event.target.value)} onBlur={axis.commit}/><em>{unit}</em></label>
    </div>)}
  </div>;
}

function AxisControlledPanel({ title, subtitle, className = "", axisKey, defaults = { min: 0, max: 100 }, children }) {
  const axis = useMachinedAxisRange(axisKey, defaults);
  return <Panel title={title} subtitle={subtitle} className={className} action={<MachinedAxisPanelControl axis={axis}/>}>
    {children(axis)}
  </Panel>;
}

function MachinedTpmSummary({ rows, totals, kindLabel = "ECN" }) {
  const summaryRows = rows.filter((row) => row.division !== "FPC事业部" || String(row.tpm || row.name || "").includes("总计"));
  const total = summaryRows.reduce((acc, row) => ({
    y2025Qty: acc.y2025Qty,
    y2026Qty: acc.y2026Qty,
    y2025Bad: acc.y2025Bad + (row.y2025Bad || 0),
    y2026Bad: acc.y2026Bad + (row.y2026Bad || 0),
  }), { y2025Qty: totals?.[2025]?.denominator || 0, y2026Qty: totals?.[2026]?.denominator || 0, y2025Bad: 0, y2026Bad: 0 });
  const rate25 = Number((total.y2025Bad / Math.max(total.y2025Qty, 1) * 100).toFixed(2));
  const rate26 = Number((total.y2026Bad / Math.max(total.y2026Qty, 1) * 100).toFixed(2));
  return <div className="machined-tpm-total-cards">
    <div><span>2025加工件总数</span><strong>{total.y2025Qty.toLocaleString()}</strong><em>{kindLabel} {total.y2025Bad.toLocaleString()} / {rate25}%</em></div>
    <div><span>2026加工件总数</span><strong>{total.y2026Qty.toLocaleString()}</strong><em>{kindLabel} {total.y2026Bad.toLocaleString()} / {rate26}%</em></div>
  </div>;
}

function MonthlyTotalStrip({ rows }) {
  return <div className="machined-monthly-total-strip">
    {rows.map((row) => <span key={row.name}>{row.name}：2025 {Number(row.y2025Qty || 0).toLocaleString()} / 2026 {Number(row.y2026Qty || 0).toLocaleString()}</span>)}
  </div>;
}

const machinedPeriodTotals = (rows) => rows.reduce((acc, row) => ({
  y2025Qty: acc.y2025Qty + (row.y2025Qty || 0),
  y2026Qty: acc.y2026Qty + (row.y2026Qty || 0),
  y2025Bad: acc.y2025Bad + (row.y2025Bad || 0),
  y2026Bad: acc.y2026Bad + (row.y2026Bad || 0),
}), { y2025Qty: 0, y2026Qty: 0, y2025Bad: 0, y2026Bad: 0 });

const machinedTpmColumns = [
  ["displayName", "TPM"], ["y2025Bad", "2025数量"], ["y2025Rate", "2025比例"],
  ["y2026Bad", "2026数量"], ["y2026Rate", "2026比例"], ["deltaCount", "数量变化"],
  ["deltaRate", "比例变化"], ["division", "产品部"],
];

function MachinedTpmTable({ rows, sort, onSort }) {
  const sortIcon = (key) => sort?.key === key ? (sort.direction === "asc" ? "▲" : "▼") : "↕";
  return <div className="dqa-compare-table">
    <div className="ecn-rate-row ecn-rate-head">{machinedTpmColumns.map(([key, label]) => <button key={key} onClick={() => onSort(key)}>{label}<span>{sortIcon(key)}</span></button>)}</div>
    {rows.map((row) => {
      return <div className="ecn-rate-row" key={row.name}>
        <strong>{row.displayName}</strong>
        <span>{(row.y2025Bad || 0).toLocaleString()}</span><b>{row.y2025Rate}%</b>
        <span>{(row.y2026Bad || 0).toLocaleString()}</span><b>{row.y2026Rate}%</b>
        <em className={row.deltaCount > 0 ? "risk-up" : "risk-down"}>{row.deltaCount > 0 ? "+" : ""}{row.deltaCount.toLocaleString()}</em>
        <em className={row.deltaRate > 0 ? "risk-up" : "risk-down"}>{row.deltaRate > 0 ? "+" : ""}{row.deltaRate}pp</em>
        <span>{row.division}</span>
      </div>;
    })}
  </div>;
}

function MachinedTpmPanel({ part, kindLabel = "ECN加工件", storagePrefix = "ecn" }) {
  const storageDivisionKey = `qms-dqa-machined-${storagePrefix}-tpm-division-v1`;
  const storageMonthlyDivisionKey = `qms-dqa-machined-${storagePrefix}-monthly-division-v1`;
  const storageMinKey = `qms-dqa-machined-${storagePrefix}-tpm-rate-min-v1`;
  const storageMaxKey = `qms-dqa-machined-${storagePrefix}-tpm-rate-max-v1`;
  const storageMonthlyMinKey = `qms-dqa-machined-${storagePrefix}-monthly-rate-min-v1`;
  const storageMonthlyMaxKey = `qms-dqa-machined-${storagePrefix}-monthly-rate-max-v1`;
  const storageHiddenKey = `qms-dqa-machined-${storagePrefix}-tpm-hidden-v1`;
  const [division, setDivision] = useState(() => localStorage.getItem(storageDivisionKey) || "全公司");
  const [monthlyDivision, setMonthlyDivision] = useState(() => localStorage.getItem(storageMonthlyDivisionKey) || "全公司");
  const [rateMin, setRateMin] = useState(() => Number(localStorage.getItem(storageMinKey)) || 0);
  const [rateMax, setRateMax] = useState(() => Number(localStorage.getItem(storageMaxKey)) || 2);
  const [monthlyRateMin, setMonthlyRateMin] = useState(() => Number(localStorage.getItem(storageMonthlyMinKey)) || 0);
  const [monthlyRateMax, setMonthlyRateMax] = useState(() => Number(localStorage.getItem(storageMonthlyMaxKey)) || 2);
  const [hiddenByDivision, setHiddenByDivision] = useState(() => safeParse(localStorage.getItem(storageHiddenKey), {}));
  const [showTpmFilter, setShowTpmFilter] = useState(false);
  const [sort, setSort] = useState({ key: "y2026Bad", direction: "desc" });
  useEffect(() => { localStorage.setItem(storageDivisionKey, division); }, [division]);
  useEffect(() => { localStorage.setItem(storageMonthlyDivisionKey, monthlyDivision); }, [monthlyDivision]);
  useEffect(() => { localStorage.setItem(storageMinKey, String(rateMin)); }, [rateMin]);
  useEffect(() => { localStorage.setItem(storageMaxKey, String(rateMax)); }, [rateMax]);
  useEffect(() => { localStorage.setItem(storageMonthlyMinKey, String(monthlyRateMin)); }, [monthlyRateMin]);
  useEffect(() => { localStorage.setItem(storageMonthlyMaxKey, String(monthlyRateMax)); }, [monthlyRateMax]);
  useEffect(() => { localStorage.setItem(storageHiddenKey, JSON.stringify(hiddenByDivision)); }, [hiddenByDivision]);
  const allRows = ecnFlattenRows(part.tpms)
    .map((row) => ({
      ...row,
      deltaCount: (row.y2026Bad || 0) - (row.y2025Bad || 0),
      deltaRate: Number(((row.y2026Rate || 0) - (row.y2025Rate || 0)).toFixed(2)),
    }))
    .filter((row) => (row.y2025Bad || 0) > 0 || (row.y2026Bad || 0) > 0);
  const decorateRows = (sourceRows, currentDivision) => sourceRows.map((row) => ({
    ...row,
    displayName: currentDivision === "全公司" ? String(row.name || "").replace("\n", " / ") : ecnTpmDisplayName(row.name),
    label: currentDivision === "全公司" ? String(row.name || "").replace("\n", "\n") : ecnTpmDisplayName(row.name),
  }));
  const baseRows = decorateRows(allRows.filter((row) => division === "全公司" || row.division === division), division);
  const hidden = hiddenByDivision[division] || [];
  const visibleRows = baseRows.filter((row) => !hidden.includes(row.name));
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  const rows = useMemo(() => [...visibleRows].sort((a, b) => {
    const av = a[sort.key] ?? 0;
    const bv = b[sort.key] ?? 0;
    const result = typeof av === "string" ? av.localeCompare(bv, "zh-CN") : av - bv;
    return sort.direction === "asc" ? result : -result;
  }), [visibleRows, sort]);
  const monthlyByName = new Map((part.tpmMonthly || []).map((row) => [row.name, row]));
  const monthlyHidden = hiddenByDivision[monthlyDivision] || [];
  const monthlyRows = decorateRows(allRows.filter((row) => monthlyDivision === "全公司" || row.division === monthlyDivision), monthlyDivision)
    .filter((row) => !monthlyHidden.includes(row.name))
    .map((row) => ({
      ...row,
      displayName: row.division === "半导体&北美" && row.tpm === "产品一部" ? "半导体&北美" : row.division === "产品五部" && row.tpm === "产品五部" ? "产品五部" : row.displayName,
      months: monthlyByName.get(row.name)?.months || [],
    }))
    .filter((row) => row.months.length);
  const safeRateMax = Math.max(0.1, Number(rateMax) || 2);
  const safeRateMin = Math.min(safeRateMax - 0.1, Math.max(0, Number(rateMin) || 0));
  const safeMonthlyRateMax = Math.max(0.1, Number(monthlyRateMax) || 2);
  const safeMonthlyRateMin = Math.min(safeMonthlyRateMax - 0.1, Math.max(0, Number(monthlyRateMin) || 0));
  const tpmRateAxis = { min: safeRateMin, max: safeRateMax };
  const monthlyRateAxis = { min: safeMonthlyRateMin, max: safeMonthlyRateMax };
  const toggleTpm = (name) => setHiddenByDivision((current) => {
    const currentHidden = current[division] || [];
    const nextHidden = currentHidden.includes(name) ? currentHidden.filter((item) => item !== name) : [...currentHidden, name];
    return { ...current, [division]: nextHidden };
  });
  const selectAllTpms = () => setHiddenByDivision((current) => ({ ...current, [division]: [] }));
  const clearAllTpms = () => setHiddenByDivision((current) => ({ ...current, [division]: baseRows.map((row) => row.name) }));
  return <Panel title={`${kindLabel}TPM同期对比`} subtitle={`只展示${kindLabel}数量和加工件占比；全公司显示全部TPM，产品部按钮只显示当前产品部TPM`}>
    <div className="machined-tpm-toolbar">
      <div className="site-tabs machined-division-tabs">
        {MACHINED_TPM_DIVISIONS.map((item) => <button key={item} className={division === item ? "active" : ""} onClick={() => setDivision(item)}>{item}</button>)}
      </div>
      <button className="machined-filter-toggle" onClick={() => setShowTpmFilter((current) => !current)}>{showTpmFilter ? "隐藏TPM筛选" : "显示TPM筛选"}</button>
      <div className="machined-axis-group">
        <label className="machined-axis-control">比例轴最小值<input type="number" min="0" step="0.1" value={rateMin} onChange={(event) => setRateMin(event.target.value)} onBlur={() => setRateMin(safeRateMin)}/><span>%</span></label>
        <label className="machined-axis-control">比例轴最大值<input type="number" min="0.1" step="0.1" value={rateMax} onChange={(event) => setRateMax(event.target.value)} onBlur={() => setRateMax(safeRateMax)}/><span>%</span></label>
      </div>
    </div>
    {showTpmFilter && <div className="machined-tpm-check-row">
        <div><strong>当前TPM</strong><span>默认全选，取消后总图、表格、月度趋势同步隐藏</span></div>
      <div className="dqa-tpm-actions"><button onClick={selectAllTpms}>全选</button><button onClick={clearAllTpms}>清空</button></div>
      <div className="dqa-tpm-checks">
        {baseRows.map((row) => <label key={row.name} className={hidden.includes(row.name) ? "" : "active"}><input type="checkbox" checked={!hidden.includes(row.name)} onChange={() => toggleTpm(row.name)}/><span>{row.displayName}</span></label>)}
      </div>
    </div>}
    <MachinedTpmSummary rows={rows} totals={part.totals} kindLabel={kindLabel}/>
    {rows.length
      ? <MachinedTpmCompareChart rows={rows} labelKey="label" minRate={safeRateMin} maxRate={safeRateMax} rateAxisOverride={tpmRateAxis} hideRateAxisControl height={Math.max(390, rows.length * 42 + 150)} chartKey={`dqa-machined-${storagePrefix}-tpm-${division}`}/>
      : <div className="supplier-empty">当前产品部没有{kindLabel}TPM数据</div>}
    <MachinedTpmTable rows={rows} sort={sort} onSort={changeSort}/>
    <div className="machined-monthly-block">
      <div className="machined-monthly-title">
        <div><h3>{kindLabel}TPM月度趋势对比</h3><span>按月度趋势产品部切换和TPM勾选结果展示；图表会随月份数量自动加宽</span></div>
        <MonthlyTotalStrip rows={part.monthly || []}/>
      </div>
      <div className="machined-monthly-toolbar">
        <div className="site-tabs machined-division-tabs">
          {MACHINED_TPM_DIVISIONS.map((item) => <button key={item} className={monthlyDivision === item ? "active" : ""} onClick={() => setMonthlyDivision(item)}>{item}</button>)}
        </div>
        <div className="machined-axis-group">
          <label className="machined-axis-control">比例轴最小值<input type="number" min="0" step="0.1" value={monthlyRateMin} onChange={(event) => setMonthlyRateMin(event.target.value)} onBlur={() => setMonthlyRateMin(safeMonthlyRateMin)}/><span>%</span></label>
          <label className="machined-axis-control">比例轴最大值<input type="number" min="0.1" step="0.1" value={monthlyRateMax} onChange={(event) => setMonthlyRateMax(event.target.value)} onBlur={() => setMonthlyRateMax(safeMonthlyRateMax)}/><span>%</span></label>
        </div>
      </div>
      <div className="machined-monthly-grid">
        {monthlyRows.map((row) => {
          const monthCount = Math.max(1, row.months.length);
          const cardWidth = Math.max(460, monthCount * 108 + 150);
          return <div className="machined-monthly-card" key={row.name} style={{ "--monthly-card-width": `${cardWidth}px` }}>
          <h4>{row.displayName}</h4>
          <MachinedTpmCompareChart rows={row.months} minRate={safeMonthlyRateMin} maxRate={safeMonthlyRateMax} rateAxisOverride={monthlyRateAxis} hideRateAxisControl height={320} chartKey={`dqa-machined-${storagePrefix}-monthly-${row.name}`}/>
        </div>;
        })}
      </div>
    </div>
  </Panel>;
}

function MachinedPartSection({ title, subtitle, part, chartPrefix }) {
  const labels = { numeratorLabel: "加工件数量", denominatorLabel: "加工件总数", rateLabel: "加工件占比" };
  const isEcn = chartPrefix === "dqa-machined-ecn";
  const monthlyAxis = useMachinedAxisRange(`${chartPrefix}-legacy-monthly-axis-v1`, { min: 0, max: 10 });
  return <div className="dqa-grid machined-grid">
    <Panel title={`${title}月度同期趋势`} subtitle="柱形图为加工件总数与对应加工件数量，折线为加工件占比">
      <MachinedAxisPanelControl axis={monthlyAxis}/>
      <QuantityRateCombo rows={part.monthly} qtyLabel={labels.denominatorLabel} badLabel={labels.numeratorLabel} rateLabel={labels.rateLabel} height={390} chartKey={`${chartPrefix}-monthly`} rateAxisOverride={monthlyAxis.effective} hideRateAxisControl/>
      <EcnRateTable rows={machinedMonthlyRows(part.monthly)} {...labels}/>
    </Panel>
    <EcnRatePanel title={`${title}产品部同期对比`} subtitle={subtitle} rows={part.divisions} chartKey={`${chartPrefix}-division`} {...labels}/>
    <MachinedTpmPanel part={part} kindLabel={title} storagePrefix={isEcn ? "ecn" : "nonbom"}/>
  </div>;
}

function DqaMachinedPartsAnalysis({ data }) {
  const parts = data.dqa.machinedParts;
  if (!parts) return <div className="summary-note ecn-empty"><strong>待导入ECN和非BOM加工件数据</strong><p>请在 DQA 数据源中导入“2025年加工件数量比例.xlsx”和“2026年加工件数量比例.xlsx”，系统会读取 ECN加工件统计、非BOM加工件统计两个Sheet。</p></div>;
  return <div className="dqa-ecn-page dqa-machined-page">
    <div className="dqa-module-title"><span className="section-number">4.N</span><div><h2>ECN和非BOM加工件同期分析</h2><p>加工件占比 = 对象加工件数量 / 同期加工件总数；默认按2025年1-5月 vs 2026年1-5月对比，海外亚太项目开发部、技术中心不统计。</p></div></div>
    <MachinedPartKpiCards parts={parts}/>
    <div className="dqa-module-title"><span className="section-number">4.N.1</span><div><h2>ECN加工件分析</h2><p>产品一部、IC载板、北美、半导体、传感器统一合并为“半导体&北美”。</p></div></div>
    <MachinedPartSection title="ECN加工件" subtitle="产品部按三大产品部合并；2025年产品一部归入半导体&北美" part={parts.ecn} chartPrefix="dqa-machined-ecn"/>
    <div className="dqa-module-title"><span className="section-number">4.N.2</span><div><h2>非BOM加工件分析</h2><p>非BOM加工件作为研发设计/资料完整性风险的前置信号，按产品部和TPM做同期对比。</p></div></div>
    <MachinedPartSection title="非BOM加工件" subtitle="产品部按三大产品部合并；2025年产品一部归入半导体&北美" part={parts.nonBom} chartPrefix="dqa-machined-nonbom"/>
  </div>;
}

function MachinedPartSectionClean({ title, subtitle, part, chartPrefix }) {
  const labels = { numeratorLabel: "加工件数量", denominatorLabel: "加工件总数", rateLabel: "加工件占比" };
  const isEcn = chartPrefix === "dqa-machined-ecn";
  const monthlyAxis = useMachinedAxisRange(`${chartPrefix}-monthly-axis-v1`, { min: 0, max: 25 });
  const divisionAxis = useMachinedAxisRange(`${chartPrefix}-division-axis-v1`, { min: 0, max: 10 });
  const divisionRows = ecnFlattenRows(part.divisions);
  return <div className="dqa-grid machined-grid">
    <Panel title={`${title}月度同期趋势`} subtitle="柱形图为加工件总数与对应加工件数量，折线为加工件占比" action={<MachinedAxisPanelControl axis={monthlyAxis}/>}>
      <QuantityRateCombo rows={part.monthly} qtyLabel={labels.denominatorLabel} badLabel={labels.numeratorLabel} rateLabel={labels.rateLabel} height={390} chartKey={`${chartPrefix}-monthly`} rateAxisOverride={monthlyAxis.effective} hideRateAxisControl/>
      <EcnRateTable rows={machinedMonthlyRows(part.monthly)} {...labels}/>
    </Panel>
    <Panel title={`${title}产品部同期对比`} subtitle={subtitle} action={<MachinedAxisPanelControl axis={divisionAxis}/>}>
      <QuantityRateCombo rows={divisionRows} qtyLabel={labels.denominatorLabel} badLabel={labels.numeratorLabel} rateLabel={labels.rateLabel} height={360} chartKey={`${chartPrefix}-division`} rateAxisOverride={divisionAxis.effective} hideRateAxisControl/>
      <EcnRateTable rows={divisionRows} {...labels}/>
    </Panel>
    <MachinedTpmPanel part={part} kindLabel={title} storagePrefix={isEcn ? "ecn" : "nonbom"}/>
  </div>;
}

function DqaMachinedPartsAnalysisClean({ data }) {
  const parts = data.dqa.machinedParts;
  if (!parts) return <div className="summary-note ecn-empty"><strong>待导入ECN和非BOM加工件数据</strong><p>请在 DQA 数据源中导入“2025年加工件数量比例.xlsx”和“2026年加工件数量比例.xlsx”，系统会读取 ECN加工件统计、非BOM加工件统计两个Sheet。</p></div>;
  return <div className="dqa-ecn-page dqa-machined-page">
    <div className="dqa-module-title"><span className="section-number">4.N</span><div><h2>ECN和非BOM加工件同期分析</h2><p>加工件占比 = 对象加工件数量 / 同期加工件总数；默认按2025年1-5月 vs 2026年1-5月对比，海外亚太项目开发部、技术中心不统计。</p></div></div>
    <MachinedPartKpiCards parts={parts}/>
    <div className="dqa-module-title"><span className="section-number">4.N.1</span><div><h2>ECN加工件分析</h2><p>产品一部、IC载板、北美、半导体、传感器统一合并为“半导体&北美”。</p></div></div>
    <MachinedPartSectionClean title="ECN加工件" subtitle="产品部按三大产品部合并；2025年产品一部归入半导体&北美" part={parts.ecn} chartPrefix="dqa-machined-ecn"/>
    <div className="dqa-module-title"><span className="section-number">4.N.2</span><div><h2>非BOM加工件分析</h2><p>非BOM加工件作为研发设计/资料完整性风险的前置信号，按产品部和TPM做同期对比。</p></div></div>
    <MachinedPartSectionClean title="非BOM加工件" subtitle="产品部按三大产品部合并；2025年产品一部归入半导体&北美" part={parts.nonBom} chartPrefix="dqa-machined-nonbom"/>
  </div>;
}

const dqaYear = (row, year) => row?.years?.find((item) => item.year === year) || { counts: {}, total: 0 };
const dqaShare = (count, total) => Number((count / Math.max(total, 1) * 100).toFixed(1));
const dqaDelta = (current, previous) => previous
  ? Number(((current - previous) / previous * 100).toFixed(1))
  : current ? null : 0;
const dqaDeltaText = (value) => value == null ? "新增" : `${value > 0 ? "+" : ""}${value}%`;

function buildDqaOverview(compare) {
  const stages = compare.byDivision.stages;
  const totalFor = (year, stage) => stages.reduce((sum, row) => {
    const current = dqaYear(row, year);
    return sum + (stage ? current.counts[stage] || 0 : (current.counts.生产 || 0) + (current.counts.现场 || 0));
  }, 0);
  const cards = ["研发问题总数", "生产", "现场", "评审"].map((stage) => {
    const y2025 = totalFor(2025, stage === "研发问题总数" ? null : stage);
    const y2026 = totalFor(2026, stage === "研发问题总数" ? null : stage);
    const all2025 = totalFor(2025, null) + totalFor(2025, "评审");
    const all2026 = totalFor(2026, null) + totalFor(2026, "评审");
    return {
      stage, y2025, y2026, delta: dqaDelta(y2026, y2025),
      rate2025: stage === "评审" ? dqaShare(y2025, all2025) : null,
      rate2026: stage === "评审" ? dqaShare(y2026, all2026) : null,
    };
  });
  const topValue = (rows, values, year) => values.map((name) => ({
    name,
    count: rows.reduce((sum, row) => sum + (dqaYear(row, year).counts[name] || 0), 0),
  })).sort((a, b) => b.count - a.count)[0] || { name: "—", count: 0 };
  const divisions = compare.divisionNames.map((name) => {
    const stageRow = stages.find((row) => row.name === name);
    const categoryRow = compare.byDivision.categories.find((row) => row.name === name);
    const disciplineRow = compare.byDivision.disciplines.find((row) => row.name === name);
    const y2025 = dqaYear(stageRow, 2025);
    const y2026 = dqaYear(stageRow, 2026);
    const backEnd2025 = (y2025.counts.生产 || 0) + (y2025.counts.现场 || 0);
    const backEnd2026 = (y2026.counts.生产 || 0) + (y2026.counts.现场 || 0);
    const topCategory = topValue([categoryRow], compare.categoryValues, 2026);
    const topDiscipline = topValue([disciplineRow], compare.disciplineValues, 2026);
    const topTpm = (compare.byTpm[name]?.stages || []).map((row) => ({
      name: row.name,
      count: (dqaYear(row, 2026).counts.生产 || 0) + (dqaYear(row, 2026).counts.现场 || 0),
    })).sort((a, b) => b.count - a.count)[0] || { name: "—", count: 0 };
    return {
      name, y2025: backEnd2025, y2026: backEnd2026,
      delta: dqaDelta(backEnd2026, backEnd2025),
      field2025: dqaShare(y2025.counts.现场 || 0, backEnd2025),
      field2026: dqaShare(y2026.counts.现场 || 0, backEnd2026),
      topCategory, topDiscipline, topTpm,
    };
  });
  const highestField = [...divisions].sort((a, b) => b.field2026 - a.field2026)[0];
  const fastestGrowth = [...divisions].sort((a, b) => (b.delta ?? 999) - (a.delta ?? 999))[0];
  const bestImprovement = [...divisions].sort((a, b) => (a.delta ?? 999) - (b.delta ?? 999))[0];
  const topCategory = topValue(compare.byDivision.categories, compare.categoryValues, 2026);
  const topDiscipline = topValue(compare.byDivision.disciplines, compare.disciplineValues, 2026);
  return {
    cards, divisions,
    insights: [
      `2026年问题增长最高的是${fastestGrowth.name}，同比${dqaDeltaText(fastestGrowth.delta)}。`,
      `${highestField.name}现场问题占比最高，为${highestField.field2026}%，较2025年${highestField.field2026 >= highestField.field2025 ? "上升" : "下降"}${Math.abs(highestField.field2026 - highestField.field2025).toFixed(1)}个百分点。`,
      `生产与现场问题中，TOP异常分类为“${topCategory.name}”（${topCategory.count}项），TOP学科为“${topDiscipline.name}”（${topDiscipline.count}项）。`,
      `${bestImprovement.name}问题总数改善最明显，同比${dqaDeltaText(bestImprovement.delta)}。`,
    ],
  };
}

function DqaOverview({ compare }) {
  const overview = buildDqaOverview(compare);
  return <>
    <div className="dqa-overview-kpis">
      {overview.cards.map((item) => <div key={item.stage} className={item.stage === "评审" ? "review-card" : ""}>
        <span>{item.stage === "研发问题总数" ? "研发问题总数（生产＋现场）" : `${item.stage}问题`}</span>
        <strong>{item.y2026.toLocaleString()}</strong>
        {item.stage === "评审"
          ? <p><b>2025：{item.y2025.toLocaleString()}</b><em>拦截占比 {item.rate2025}% → {item.rate2026}%</em></p>
          : <p><b>2025：{item.y2025.toLocaleString()}</b><em className={(item.delta ?? 0) > 0 ? "risk-up" : "risk-down"}>同比 {dqaDeltaText(item.delta)}</em></p>}
      </div>)}
    </div>
    <div className="dqa-overview-grid">
      <Panel title="三大产品部同期风险概览" subtitle="问题总数仅统计生产与现场；评审问题作为前端拦截指标单独展示">
        <div className="dqa-risk-table">
          <div className="dqa-risk-row dqa-risk-head"><span>产品部</span><span>2025问题数</span><span>2026问题数</span><span>同比</span><span>现场占比</span><span>TOP异常分类</span><span>TOP学科</span><span>TOP TPM</span></div>
          {overview.divisions.map((row) => <div className="dqa-risk-row" key={row.name}>
            <strong>{row.name}</strong><span>{row.y2025.toLocaleString()}</span><span>{row.y2026.toLocaleString()}</span>
            <b className={(row.delta ?? 0) > 0 ? "risk-up" : "risk-down"}>{dqaDeltaText(row.delta)}</b>
            <span>{row.field2025}% → <em>{row.field2026}%</em></span>
            <span>{row.topCategory.name}<small>{row.topCategory.count}项</small></span>
            <span>{row.topDiscipline.name}<small>{row.topDiscipline.count}项</small></span>
            <span>{row.topTpm.name}<small>{row.topTpm.count}项</small></span>
          </div>)}
        </div>
      </Panel>
      <Panel title="同期分析结论" subtitle="根据当前日期筛选范围自动更新">
        <div className="dqa-auto-insights">
          {overview.insights.map((text, index) => <div key={text}><b>{index + 1}</b><p>{text}</p></div>)}
        </div>
      </Panel>
    </div>
  </>;
}

function DqaAnalysis({ data }) {
  const compare = data.dqa.yearCompare;
  const [division, setDivision] = useState("半导体&北美");
  const [dqaTab, setDqaTab] = useState("issues");
  const [hiddenTpmsByDivision, setHiddenTpmsByDivision] = useState(() => safeParse(localStorage.getItem("qms-dqa-hidden-tpms-v1"), {}));
  useEffect(() => { localStorage.setItem("qms-dqa-hidden-tpms-v1", JSON.stringify(hiddenTpmsByDivision)); }, [hiddenTpmsByDivision]);
  if (!compare && dqaTab === "issues") return <div className="module-page"><div className="module-summary"><KpiCard item={data.kpis[3]}/><div className="summary-note"><strong>暂无DQA数据</strong><p>请确认已导入2025、2026年DQA研发问题数据。</p></div></div></div>;
  const tpmData = compare?.byTpm?.[division] || { stages: [], categories: [], disciplines: [] };
  const divisionTpms = compare?.tpmsByDivision?.[division] || [];
  const hiddenTpms = hiddenTpmsByDivision[division] || [];
  const visibleTpms = divisionTpms.filter((name) => !hiddenTpms.includes(name));
  const visibleTpmSet = new Set(visibleTpms);
  const filteredTpmData = {
    stages: tpmData.stages.filter((row) => visibleTpmSet.has(row.name)),
    categories: tpmData.categories.filter((row) => visibleTpmSet.has(row.name)),
    disciplines: tpmData.disciplines.filter((row) => visibleTpmSet.has(row.name)),
  };
  const toggleTpm = (name) => setHiddenTpmsByDivision((current) => {
    const currentHidden = current[division] || [];
    const nextHidden = currentHidden.includes(name) ? currentHidden.filter((item) => item !== name) : [...currentHidden, name];
    return { ...current, [division]: nextHidden };
  });
  const selectAllTpms = () => setHiddenTpmsByDivision((current) => ({ ...current, [division]: [] }));
  const clearAllTpms = () => setHiddenTpmsByDivision((current) => ({ ...current, [division]: divisionTpms }));
  const dqaSubtitle = dqaTab === "ecn"
    ? "ECN率按月、产品部、TPM和变更原因做2025/2026同期对比"
    : dqaTab === "machined"
      ? "ECN加工件与非BOM加工件按月、产品部、TPM做2025/2026同期对比"
      : "2025评审按汇总数量统计，2026评审按“阶段=评审”的明细行统计；产品一部统一显示为“半导体&北美”";
  return <div className="module-page iqc-supplier-page dqa-page">
    {compare && dqaTab === "issues" && <FloatingTabs options={compare.divisionNames} active={division} onChange={setDivision}/>}
    <div className="iqc-section-title">
      <div>
        <span className="section-number">4</span>
        <div>
          <h2>DQA研发质量同期分析</h2>
          <p>{dqaSubtitle}</p>
        </div>
      </div>
      <AppliedPeriodTag data={data}/>
    </div>
    <div className="dqa-sub-tabs">
      <button className={dqaTab === "issues" ? "active" : ""} onClick={() => setDqaTab("issues")}>研发问题分析</button>
      <button className={dqaTab === "ecn" ? "active" : ""} onClick={() => setDqaTab("ecn")}>ECN分析</button>
      <button className={dqaTab === "machined" ? "active" : ""} onClick={() => setDqaTab("machined")}>ECN和非BOM加工件分析</button>
    </div>
    {dqaTab === "ecn" ? <DqaEcnAnalysis data={data}/> : dqaTab === "machined" ? <DqaMachinedPartsAnalysisClean data={data}/> : <>
    <DqaOverview compare={compare}/>
    <div className="dqa-module-title"><span className="section-number">4.1</span><div><h2>三大产品部总体对比</h2><p>阶段、异常分类和学科均按产品部展示2025/2026两条堆叠柱</p></div></div>
    <div className="dqa-grid">
      <DqaComparePanel title="产品部评审/生产/现场占比" subtitle="评审问题按评审问题数加权；生产与现场问题每条明细计1项" rows={compare.byDivision.stages} values={compare.stageValues}/>
      <DqaComparePanel title="各产品部异常分类占比" subtitle="使用源数据“类别/问题分类”字段；仅统计生产与现场问题" rows={compare.byDivision.categories} values={compare.categoryValues}/>
      <DqaComparePanel title="各产品部学科问题占比" subtitle="使用源数据“学科”字段；仅统计生产与现场问题" rows={compare.byDivision.disciplines} values={compare.disciplineValues}/>
    </div>
    <div className="dqa-module-title sticky-switch-bar">
      <span className="section-number">4.2</span><div><h2>各产品部TPM对比</h2><p>切换产品部，查看对应TPM的阶段、异常分类和学科同期结构</p></div>
      <div className="site-tabs">{compare.divisionNames.map((name) => <button key={name} className={division === name ? "active" : ""} onClick={() => preserveScrollPosition(() => setDivision(name))}>{name}</button>)}</div>
    </div>
    <DqaTpmSelector tpms={divisionTpms} hidden={hiddenTpms} onToggle={toggleTpm} onSelectAll={selectAllTpms} onClearAll={clearAllTpms}/>
    <div className="dqa-grid">
      <DqaComparePanel title={`${division} · TPM阶段问题占比`} subtitle="每个TPM分别对应2025、2026两条堆叠柱" rows={filteredTpmData.stages} values={compare.stageValues}/>
      <DqaComparePanel title={`${division} · 各TPM异常分类占比`} subtitle="按原始异常类别统计，仅包含生产与现场问题" rows={filteredTpmData.categories} values={compare.categoryValues}/>
      <DqaComparePanel title={`${division} · 各TPM学科问题占比`} subtitle="按原始学科统计，仅包含生产与现场问题" rows={filteredTpmData.disciplines} values={compare.disciplineValues}/>
    </div>
    </>}
  </div>;
}

function ModuleDetail({ module, data }) {
  if (module === "IQC") return <IqcSupplierAnalysis data={data} />;
  if (module === "IPQC") return <IpqcAnalysis data={data} />;
  if (module === "OQC") return <OqcAnalysis data={data} />;
  return <DqaAnalysis data={data}/>;
}

const supplierColumns = [
  ["supplier", "供应商"], ["type", "加工类型"], ["y2025Qty", "2025批次"], ["y2025Bad", "2025异常"],
  ["y2025Rate", "2025良率"], ["y2026Qty", "2026批次"], ["y2026Bad", "2026异常"],
  ["y2026Rate", "2026良率"], ["delta", "同比变化"],
];

function SupplierCompareTable({ title, rows, candidates = [] }) {
  const [activeRows, setActiveRows] = useState(rows);
  const [selected, setSelected] = useState(() => rows.map((r) => r.supplier));
  const [newSupplier, setNewSupplier] = useState("");
  const [sort, setSort] = useState({ key: "y2026Qty", direction: "desc" });
  const axis = useMachinedAxisRange(`iqc-supplier-${title}-axis-v1`, { min: 80, max: 100 });
  useEffect(() => { setActiveRows(rows); setSelected(rows.map((r) => r.supplier)); setNewSupplier(""); }, [rows]);
  const toggle = (supplier) => setSelected((current) => current.includes(supplier) ? current.filter((x) => x !== supplier) : [...current, supplier]);
  const availableCandidates = candidates.filter((candidate) => !activeRows.some((row) => row.supplier === candidate.supplier));
  const addSupplier = () => {
    const candidate = candidates.find((row) => row.supplier === newSupplier);
    if (!candidate) return;
    setActiveRows((current) => [...current, candidate]);
    setSelected((current) => [...current, candidate.supplier]);
    setNewSupplier("");
  };
  const visibleRows = useMemo(() => activeRows
    .filter((r) => selected.includes(r.supplier))
    .map((r) => ({ ...r, delta: r.y2025Qty > 0 && r.y2026Qty > 0 ? r.y2026Rate - r.y2025Rate : null }))
    .sort((a, b) => {
      const av = a[sort.key] ?? -Infinity;
      const bv = b[sort.key] ?? -Infinity;
      const result = typeof av === "string" ? av.localeCompare(bv, "zh-CN") : av - bv;
      return sort.direction === "asc" ? result : -result;
    }), [activeRows, selected, sort]);
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  return <Panel title={title} subtitle="仅按提纲指定加工类型筛选；无对应数据时显示—">
    <div className="supplier-add">
      <span>增加名单</span>
      <select value={newSupplier} onChange={(event) => setNewSupplier(event.target.value)}>
        <option value="">选择原始数据中的供应商</option>
        {availableCandidates.map((row) => <option key={row.supplier} value={row.supplier}>{row.supplier} · {row.type}</option>)}
      </select>
      <button disabled={!newSupplier} onClick={addSupplier}><Plus size={13}/>加入分析</button>
    </div>
    <div className="supplier-selector">
      <label className="supplier-check all"><input type="checkbox" checked={selected.length === activeRows.length} onChange={() => setSelected(selected.length === activeRows.length ? [] : activeRows.map((r) => r.supplier))}/><span>全选</span></label>
      {activeRows.map((r) => <label className="supplier-check" key={r.supplier}><input type="checkbox" checked={selected.includes(r.supplier)} onChange={() => toggle(r.supplier)}/><span>{r.supplier}</span></label>)}
    </div>
    {visibleRows.length
      ? <div className="supplier-chart"><MachinedAxisPanelControl axis={axis}/><QuantityRateCombo rows={visibleRows} labelKey="supplier" height={360} rateAxisOverride={axis.effective} hideRateAxisControl /></div>
      : <div className="supplier-empty">请至少选择一家供应商</div>}
    <div className="supplier-compare-table">
      <div className="supplier-compare-row supplier-compare-head">
        {supplierColumns.map(([key, label]) => <button key={key} onClick={() => changeSort(key)}>{label}<span>{sort.key === key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span></button>)}
      </div>
      {visibleRows.map((r) => {
        const valid25 = r.y2025Qty > 0;
        const valid26 = r.y2026Qty > 0;
        const delta = r.delta;
        return <div className="supplier-compare-row" key={`${r.supplier}-${r.type}`}>
          <strong>{r.supplier}</strong><span className="type-tag">{r.type}</span>
          <span>{valid25 ? r.y2025Qty.toLocaleString() : "—"}</span><span>{valid25 ? r.y2025Bad.toLocaleString() : "—"}</span><span>{valid25 ? `${r.y2025Rate}%` : "—"}</span>
          <span>{valid26 ? r.y2026Qty.toLocaleString() : "—"}</span><span>{valid26 ? r.y2026Bad.toLocaleString() : "—"}</span><span className={valid26 && r.y2026Rate < 90 ? "rate-risk" : ""}>{valid26 ? `${r.y2026Rate}%` : "—"}</span>
          <span className={delta == null ? "" : delta >= 0 ? "up" : "down"}>{delta == null ? "—" : `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}pp`}</span>
        </div>;
      })}
    </div>
  </Panel>;
}


const focusProjectText = {
  sectionNo: "1.2.5",
  title: "重点项目供应商良率",
  subtitle: "自动识别IQC文件夹内的项目质检统计文件；新增同格式项目文件后会自动进入本板块",
  overview: "项目总体同期对比",
  overviewSub: "柱形为检验总数/异常数，折线为批次良率；异常=不合格+特采",
  supplier: "项目供应商良率对比",
  supplierSub: "按当前项目的供应商统计检验批次、异常批次和批次良率",
  issue: "项目异常原因分类",
  issueSub: "从原始质检说明归类，特采和不合格均作为异常样本",
  sampleTip: "样本偏少，结论需谨慎",
  supplierName: "供应商",
  material: "材料属性",
  qty25: "2025批次",
  bad25: "2025异常",
  rate25: "2025良率",
  qty26: "2026批次",
  bad26: "2026异常",
  rate26: "2026良率",
  delta: "同比变化",
  count25: "2025数量",
  share25: "2025占比",
  count26: "2026数量",
  share26: "2026占比",
  issueCategory: "异常分类",
  specialShare: "特采/异常占比",
  checkBatches: "检验批次",
  abnormalBatches: "异常批次",
  passRate: "批次良率",
  abnormalShare: "异常占比",
};

const focusSupplierColumns = [
  ["supplier", focusProjectText.supplierName], ["type", focusProjectText.material], ["y2025Qty", focusProjectText.qty25], ["y2025Bad", focusProjectText.bad25],
  ["y2025Rate", focusProjectText.rate25], ["y2026Qty", focusProjectText.qty26], ["y2026Bad", focusProjectText.bad26],
  ["y2026Rate", focusProjectText.rate26], ["delta", focusProjectText.delta],
];
const focusIssueColumns = [
  ["name", focusProjectText.issueCategory], ["y2025Count", focusProjectText.count25], ["y2025Share", focusProjectText.share25],
  ["y2026Count", focusProjectText.count26], ["y2026Share", focusProjectText.share26], ["delta", focusProjectText.delta],
];

function formatFocusValue(row, key) {
  if (key.includes("Rate") || key.includes("Share")) return row[key] == null ? "?" : `${row[key]}%`;
  if (key === "delta") return row[key] == null ? "?" : `${row[key] >= 0 ? "\u2191" : "\u2193"} ${Math.abs(row[key]).toFixed(1)}pp`;
  const value = row[key];
  return typeof value === "number" ? value.toLocaleString() : value || "?";
}

function FocusProjectTable({ rows, columns, rowKey, defaultSort = "y2026Bad" }) {
  const [sort, setSort] = useState({ key: defaultSort, direction: "desc" });
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sort.key] ?? -Infinity;
    const bv = b[sort.key] ?? -Infinity;
    const result = typeof av === "string" ? av.localeCompare(bv, "zh-CN") : av - bv;
    return sort.direction === "asc" ? result : -result;
  }), [rows, sort]);
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  return <div className="focus-project-table">
    <div className="focus-project-row focus-project-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(96px, 1fr))` }}>
      {columns.map(([key, label]) => <button key={key} onClick={() => changeSort(key)}>{label}<span>{sort.key === key ? (sort.direction === "asc" ? "\u25b2" : "\u25bc") : ""}</span></button>)}
    </div>
    {sorted.map((row, index) => <div className="focus-project-row" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(96px, 1fr))` }} key={`${row[rowKey] || row.name}-${index}`}>
      {columns.map(([key]) => <span key={key} className={key === "delta" ? (row.delta == null ? "" : row.delta >= 0 ? "up" : "down") : key.includes("Rate") && row[key] < 90 ? "rate-risk" : ""}>{formatFocusValue(row, key)}</span>)}
    </div>)}
  </div>;
}

function IqcFocusProjectAnalysis({ data }) {
  const focus = data.iqc.focusProjects;
  const projects = focus?.projects || [];
  const [active, setActive] = useState(projects[0]?.name || "");
  useEffect(() => { if (projects.length && !projects.some((project) => project.name === active)) setActive(projects[0].name); }, [projects, active]);
  if (!projects.length) return null;
  const current = focus.byProject?.[active] || focus.byProject?.[projects[0]?.name] || { suppliers: [], issues: [] };
  const activeProject = projects.find((project) => project.name === active) || projects[0];
  const projectOptions = projects.map((project) => project.name);
  return <div className="iqc-focus-section">
    <FloatingTabs options={projectOptions} active={active} onChange={setActive} watchSelector="[data-focus-project-tabs]" className="focus-project-floating-tabs"/>
    <div className="iqc-table-heading focus-heading"><span className="section-number">{focusProjectText.sectionNo}</span><div><h2>{focusProjectText.title}</h2><p>{focusProjectText.subtitle}</p></div></div>
    <div className="focus-project-cards">
      {projects.map((project) => <button key={project.name} className={`focus-project-card ${project.name === active ? "active" : ""}`} onClick={() => setActive(project.name)}>
        <span>{project.name}</span>
        <strong>{project.y2026Rate}%</strong>
        <em>{focusProjectText.rate26}</em>
        <small>{focusProjectText.qty26} {project.y2026Qty.toLocaleString()} / {focusProjectText.bad26} {project.y2026Bad.toLocaleString()}</small>
        {project.y2026Qty > 0 && project.y2026Qty < 30 && <b>{focusProjectText.sampleTip}</b>}
      </button>)}
    </div>
    <AxisControlledPanel title={focusProjectText.overview} subtitle={focusProjectText.overviewSub} className="iqc-wide" axisKey="iqc-focus-project-overview-axis-v1" defaults={{ min: 80, max: 100 }}>
      {(axis) => <QuantityRateCombo rows={projects} labelKey="name" qtyLabel={focusProjectText.checkBatches} badLabel={focusProjectText.abnormalBatches} rateLabel={focusProjectText.passRate} height={360} chartKey="iqc-focus-project-overview" rateAxisOverride={axis.effective} hideRateAxisControl/>}
    </AxisControlledPanel>
    <div className="focus-project-detail">
      <div className="focus-project-detail-head">
        <div><h3>{activeProject.name}</h3><p>{focusProjectText.specialShare}: 2025 {activeProject.y2025SpecialShare}% / 2026 {activeProject.y2026SpecialShare}%</p></div>
        <div className="focus-project-tabs" data-focus-project-tabs>{projects.map((project) => <button key={project.name} className={project.name === active ? "active" : ""} onClick={() => setActive(project.name)}>{project.name}</button>)}</div>
      </div>
      <AxisControlledPanel title={focusProjectText.supplier} subtitle={focusProjectText.supplierSub} className="iqc-wide" axisKey={`iqc-focus-supplier-${active}-axis-v1`} defaults={{ min: 80, max: 100 }}>
        {(axis) => <>
        <QuantityRateCombo rows={current.suppliers.slice(0, 12)} labelKey="supplier" qtyLabel={focusProjectText.checkBatches} badLabel={focusProjectText.abnormalBatches} rateLabel={focusProjectText.passRate} height={380} chartKey={`iqc-focus-supplier-${active}`} rateAxisOverride={axis.effective} hideRateAxisControl/>
        <FocusProjectTable rows={current.suppliers} columns={focusSupplierColumns} rowKey="supplier" />
        </>}
      </AxisControlledPanel>
      <AxisControlledPanel title={focusProjectText.issue} subtitle={focusProjectText.issueSub} className="iqc-wide" axisKey={`iqc-focus-issue-${active}-axis-v1`} defaults={{ min: 0, max: 80 }}>
        {(axis) => <>
        <QuantityRateCombo rows={current.issues} qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Share" rate2026="y2026Share" rateLabel={focusProjectText.abnormalShare} qtyLabel={focusProjectText.abnormalBatches} showBad={false} height={350} chartKey={`iqc-focus-issue-${active}`} rateAxisOverride={axis.effective} hideRateAxisControl/>
        <FocusProjectTable rows={current.issues} columns={focusIssueColumns} rowKey="name" defaultSort="y2026Count" />
        </>}
      </AxisControlledPanel>
    </div>
  </div>;
}

function IqcSpecialTable({ rows }) {
  return <div className="iqc-special-table">
    <div className="iqc-special-row iqc-special-head"><span>证据等级</span><span>供应商</span><span>材料属性</span><span>异常原因</span><span>特采说明</span><span>判定依据</span></div>
    {rows.slice(0, 20).map((row, index) => <div className="iqc-special-row" key={`${row.supplier}-${index}`}>
      <b className={row.level === "高" ? "high" : "medium"}>{row.level}</b><strong>{row.supplier}</strong><span>{row.material}</span>
      <p>{row.reason}</p><p>{row.note}</p><p>{row.evidence}</p>
    </div>)}
    {!rows.length && <div className="supplier-empty">当前日期范围内没有可支持“疑似过度设计”判断的特采证据</div>}
  </div>;
}

function IqcSpecialAnalysis({ data, site }) {
  const [expanded, setExpanded] = useState(false);
  const special = data.iqc.specialAnalysis?.[site];
  if (!special) return null;
  const total2026 = special.monthly.reduce((sum, row) => sum + row.y2026Bad, 0);
  const design = special.evidence.find((row) => row.name === "疑似过度设计");
  const highEvidence = special.highDesignEvidenceTotal || 0;
  const monthlyAxis = useMachinedAxisRange(`iqc-special-${site}-monthly-axis-v1`, { min: 0, max: 20 });
  const materialsAxis = useMachinedAxisRange(`iqc-special-${site}-materials-axis-v1`, { min: 0, max: 80 });
  const suppliersAxis = useMachinedAxisRange(`iqc-special-${site}-suppliers-axis-v1`, { min: 0, max: 50 });
  const evidenceAxis = useMachinedAxisRange(`iqc-special-${site}-evidence-axis-v1`, { min: 0, max: 80 });
  return <div className="iqc-special-section">
    <button className={`iqc-special-collapse ${expanded ? "expanded" : ""}`} onClick={() => setExpanded((current) => !current)}>
      <span className="section-number special-number">1.2.T</span>
      <div><h2>特采风险专项分析</h2><p>特采均作为风险样本单独分析；“疑似过度设计”是线索判断，需研发结合功能、公差链和成本进一步确认</p></div>
      <CaretDown size={20}/>
    </button>
    {expanded && <><div className="iqc-special-summary">
      <div><span>2026特采数量</span><strong>{total2026.toLocaleString()}</strong></div>
      <div><span>疑似过度设计</span><strong>{(design?.y2026Count || 0).toLocaleString()}</strong><em>{design?.y2026Share || 0}%</em></div>
      <div><span>高证据样本</span><strong>{highEvidence.toLocaleString()}</strong><em>偏离规格但说明不影响装配/功能</em></div>
      <div><span>管理结论</span><p>{(design?.y2026Share || 0) >= 20 ? "存在规格合理性复核需求，建议优先审查高频材料、供应商和设计参数。" : "现有证据以制造偏差为主，尚不足以判断研发存在普遍过度设计。"}</p></div>
    </div>
    <div className="iqc-analysis-grid">
      <Panel title="特采月度趋势" subtitle={`${site} · 柱形为检验总数/特采数量，折线为特采率`}>
        <MachinedAxisPanelControl axis={monthlyAxis}/>
        <QuantityRateCombo rows={special.monthly} labelKey="month" rateLabel="特采率" qtyLabel="检验批次" badLabel="特采" height={360} rateAxisOverride={monthlyAxis.effective} hideRateAxisControl/>
      </Panel>
      <Panel title="特采材料属性" subtitle="按特采数量和占比进行同期对比">
        <MachinedAxisPanelControl axis={materialsAxis}/>
        <QuantityRateCombo rows={special.materials} qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Share" rate2026="y2026Share" rateLabel="特采占比" qtyLabel="特采数量" showBad={false} height={370} rateAxisOverride={materialsAxis.effective} hideRateAxisControl/>
      </Panel>
      <Panel title="特采供应商TOP" subtitle="柱形为特采数量，折线为该供应商特采率">
        <MachinedAxisPanelControl axis={suppliersAxis}/>
        <QuantityRateCombo rows={special.suppliers.slice(0, 10)} labelKey="name" qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Rate" rate2026="y2026Rate" rateLabel="特采率" qtyLabel="特采数量" showBad={false} height={390} rateAxisOverride={suppliersAxis.effective} hideRateAxisControl/>
      </Panel>
      <Panel title="特采原因证据分类" subtitle="区分疑似过度设计、资料问题、供应商制造偏差及证据不足">
        <MachinedAxisPanelControl axis={evidenceAxis}/>
        <QuantityRateCombo rows={special.evidence} qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Share" rate2026="y2026Share" rateLabel="特采占比" qtyLabel="特采数量" showBad={false} height={360} rateAxisOverride={evidenceAxis.effective} hideRateAxisControl/>
      </Panel>
      <Panel title="疑似研发过度设计证据明细" subtitle="高证据：规格偏差且质检说明明确不影响装配/功能；中证据：规格偏差后仍被特采放行">
        <IqcSpecialTable rows={special.designEvidence}/>
      </Panel>
    </div></>}
  </div>;
}

function IqcInternalAnalysis({ data, site, specialAsBad }) {
  const [expanded, setExpanded] = useState(false);
  const mode = specialAsBad ? data.iqc.internalModes?.rejected : data.iqc.internalModes?.accepted;
  const internal = mode?.[site];
  if (!internal) return null;
  const totals = internal.monthly.reduce((result, row) => ({
    y2025Qty: result.y2025Qty + row.y2025Qty, y2025Bad: result.y2025Bad + row.y2025Bad,
    y2026Qty: result.y2026Qty + row.y2026Qty, y2026Bad: result.y2026Bad + row.y2026Bad,
  }), { y2025Qty: 0, y2025Bad: 0, y2026Qty: 0, y2026Bad: 0 });
  const rate = (year) => Number(((totals[`y${year}Qty`] - totals[`y${year}Bad`]) / Math.max(totals[`y${year}Qty`], 1) * 100).toFixed(1));
  const monthlyAxis = useMachinedAxisRange(`iqc-internal-${site}-${specialAsBad ? "special-bad" : "special-good"}-monthly-axis-v1`, { min: 80, max: 100 });
  const issuesAxis = useMachinedAxisRange(`iqc-internal-${site}-${specialAsBad ? "special-bad" : "special-good"}-issues-axis-v1`, { min: 0, max: 80 });
  const materialsAxis = useMachinedAxisRange(`iqc-internal-${site}-${specialAsBad ? "special-bad" : "special-good"}-materials-axis-v1`, { min: 80, max: 100 });
  return <div className="iqc-internal-section">
    <button className={`iqc-special-collapse internal-collapse ${expanded ? "expanded" : ""}`} onClick={() => setExpanded((current) => !current)}>
      <span className="section-number internal-number">1.2.I</span>
      <div><h2>内部加工（一楼自制）专项分析</h2><p>不计入外部供应商总体良率、材料表现及供应商排名，独立评价内部加工质量</p></div>
      <CaretDown size={20}/>
    </button>
    {expanded && <><div className="iqc-summary-strip internal-summary">
      <div><span>2025内部检验批次</span><strong>{totals.y2025Qty.toLocaleString()}</strong></div>
      <div><span>2026内部检验批次</span><strong>{totals.y2026Qty.toLocaleString()}</strong></div>
      <div><span>2025内部良率</span><strong>{rate(2025)}%</strong></div>
      <div><span>2026内部良率</span><strong className={rate(2026) < rate(2025) ? "red" : "green"}>{rate(2026)}%</strong></div>
      <div><span>同比变化</span><strong className={rate(2026) < rate(2025) ? "red" : "green"}>{rate(2026) >= rate(2025) ? "↑" : "↓"} {Math.abs(rate(2026) - rate(2025)).toFixed(1)}pp</strong></div>
    </div>
    <div className="iqc-analysis-grid">
      <Panel title="一楼自制月度良率趋势" subtitle={`${site} · 按当前“计入特采”口径计算`}>
        <MachinedAxisPanelControl axis={monthlyAxis}/>
        <QuantityRateCombo rows={internal.monthly} labelKey="month" height={360} rateAxisOverride={monthlyAxis.effective} hideRateAxisControl/>
      </Panel>
      <Panel title="一楼自制异常类型" subtitle="仅统计质检结果=不合格">
        <MachinedAxisPanelControl axis={issuesAxis}/>
        <QuantityRateCombo rows={internal.issues} qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Share" rate2026="y2026Share" rateLabel="异常占比" qtyLabel="异常批次" showBad={false} height={360} rateAxisOverride={issuesAxis.effective} hideRateAxisControl/>
      </Panel>
      <Panel title="一楼自制材料质量表现" subtitle="按材料属性对比检验数量、不合格数量和良率">
        <MachinedAxisPanelControl axis={materialsAxis}/>
        <QuantityRateCombo rows={internal.materials} height={380} rateAxisOverride={materialsAxis.effective} hideRateAxisControl/>
      </Panel>
    </div></>}
  </div>;
}

function IqcSupplierAnalysis({ data }) {
  const uiTheme = useUiTheme();
  const [site, setSite] = useState("深圳");
  const [specialAsBad, setSpecialAsBad] = useState(false);
  const mode = specialAsBad ? data.iqc.qualityModes?.rejected : data.iqc.qualityModes?.accepted;
  const iqcData = mode || data.iqc;
  const monthly = iqcData.siteMonthly?.[site] || [];
  const issues = iqcData.issueBySite?.[site] || [];
  const materials = iqcData.materialBySite?.[site] || [];
  const siteSuppliers = iqcData.mainSuppliers || { 深圳: [], 杭州: [] };
  const supplierCandidates = iqcData.supplierCandidates || { 深圳: [], 杭州: [] };
  const totals = monthly.reduce((acc, row) => ({
    y2025Qty: acc.y2025Qty + row.y2025Qty,
    y2026Qty: acc.y2026Qty + row.y2026Qty,
  }), { y2025Qty: 0, y2026Qty: 0 });
  const weightedRate = (year) => {
    const qty = totals[`y${year}Qty`];
    return qty ? monthly.reduce((sum, row) => sum + row[`y${year}Qty`] * row[`y${year}Rate`], 0) / qty : 0;
  };
  return <div className={`module-page iqc-supplier-page ${uiTheme === "apple" ? "iqc-apple-page" : ""}`}>
    <FloatingTabs options={["深圳", "杭州"]} active={site} onChange={setSite}/>
    <div className="iqc-section-title">
      <div><span className="section-number">1.2</span><div><h2>供应商加工件同比分析</h2><p>按检验批次计算数量和批次良率，深圳、杭州独立分析</p></div></div>
      <div className="iqc-title-actions sticky-switch-bar"><label className={`special-toggle ${specialAsBad ? "active" : ""}`}><input type="checkbox" checked={specialAsBad} onChange={(event) => setSpecialAsBad(event.target.checked)}/><span>计入特采</span></label><div className="site-tabs"><button className={site==="深圳"?"active":""} onClick={()=>preserveScrollPosition(() => setSite("深圳"))}>深圳</button><button className={site==="杭州"?"active":""} onClick={()=>preserveScrollPosition(() => setSite("杭州"))}>杭州</button></div></div>
    </div>
    <div className="iqc-summary-strip">
      <div><span>{site} 2025检验批次</span><strong>{totals.y2025Qty.toLocaleString()}</strong></div>
      <div><span>{site} 2026检验批次</span><strong>{totals.y2026Qty.toLocaleString()}</strong></div>
      <div><span>2025批次良率</span><strong>{weightedRate(2025).toFixed(1)}%</strong></div>
      <div><span>2026批次良率</span><strong className={weightedRate(2026) < weightedRate(2025) ? "red" : "green"}>{weightedRate(2026).toFixed(1)}%</strong></div>
      <div><span>同比变化</span><strong className={weightedRate(2026) < weightedRate(2025) ? "red" : "green"}>{weightedRate(2026)-weightedRate(2025)>=0?"↑":"↓"} {Math.abs(weightedRate(2026)-weightedRate(2025)).toFixed(1)}pp</strong></div>
    </div>
    <div className="iqc-analysis-grid">
      <AxisControlledPanel title="1.2.3 总体供应商良率趋势" subtitle={`${site} · 按月同比 · 柱形为检验总数/不合格数，折线为批次良率`} className="iqc-wide" axisKey={`iqc-${site}-${specialAsBad ? "special-bad" : "special-good"}-monthly-axis-v1`} defaults={{ min: 80, max: 100 }}>
        {(axis) => <QuantityRateCombo rows={monthly} labelKey="month" height={360} rateAxisOverride={axis.effective} hideRateAxisControl />}
      </AxisControlledPanel>
      <AxisControlledPanel title="1.2.1 加工件异常类型" subtitle={`${site} · 仅统计质检结果=不合格；特采进入专项分析，不重复计数`} className="iqc-wide" axisKey={`iqc-${site}-${specialAsBad ? "special-bad" : "special-good"}-issues-axis-v1`} defaults={{ min: 0, max: 80 }}>
        {(axis) => <QuantityRateCombo rows={issues} qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Share" rate2026="y2026Share" rateLabel="异常占比" qtyLabel="异常批次" showBad={false} height={370} rateAxisOverride={axis.effective} hideRateAxisControl />}
      </AxisControlledPanel>
      <AxisControlledPanel title="1.2.2 异常加工件材料属性" subtitle={`${site} · 按材料类别同比 · 柱形为检验总数/不合格数，折线为材料批次良率`} className="iqc-wide" axisKey={`iqc-${site}-${specialAsBad ? "special-bad" : "special-good"}-materials-axis-v1`} defaults={{ min: 80, max: 100 }}>
        {(axis) => <QuantityRateCombo rows={materials} height={380} rateAxisOverride={axis.effective} hideRateAxisControl />}
      </AxisControlledPanel>
      <div className="iqc-table-heading"><span className="section-number">1.2.4</span><div><h2>主要供应商良率趋势</h2><p>按提纲指定加工类型筛选，深圳、杭州分别呈现</p></div></div>
      <div className="iqc-supplier-tables">
        <SupplierCompareTable title="深圳主力供应商同期对比" rows={siteSuppliers.深圳 || []} candidates={supplierCandidates.深圳 || []} />
        <SupplierCompareTable title="杭州主力供应商同期对比" rows={siteSuppliers.杭州 || []} candidates={supplierCandidates.杭州 || []} />
      </div>
      <IqcFocusProjectAnalysis data={data}/>
      <IqcInternalAnalysis data={data} site={site} specialAsBad={specialAsBad}/>
      <IqcSpecialAnalysis data={data} site={site}/>
    </div>
  </div>;
}

export function App() {
  const machinedSourceVersion = "20260630-tpm-monthly-bridge-v1";
  const oqcShipmentSourceVersion = "20260630-oqc-shipment-detail-v1";
  const defaultSourceVersion = "20260701-overview-kpi-refresh-v3";
  const defaultDateRange = {
    start2025: "2025-01-01", end2025: "2025-05-31",
    start2026: "2026-01-01", end2026: "2026-05-31",
  };
  const isSameDateRange = (left, right) => left?.start2025 === right?.start2025
    && left?.end2025 === right?.end2025
    && left?.start2026 === right?.start2026
    && left?.end2026 === right?.end2026;
  const isValidDateRange = (range) => range?.start2025 && range?.end2025 && range?.start2026 && range?.end2026
    && range.start2025 <= range.end2025 && range.start2026 <= range.end2026;
  const cacheMatchesRange = (cache, range) => cache?.version === ANALYSIS_CACHE_VERSION
    && cache?.data
    && isSameDateRange(cache.dateRange, range);
  const cacheMatchesSources = (cache, sources) => cache?.sourceSignature
    && cache.sourceSignature === createSourcesSignature(sources);
  let initialDateRange = defaultDateRange;
  try {
    const storedDateRange = JSON.parse(localStorage.getItem("qms-date-range-v202605") || "null");
    const wasOldDefault = storedDateRange?.start2025 === "2025-01-01" && storedDateRange?.end2025 === "2025-06-30"
      && storedDateRange?.start2026 === "2026-01-01" && (storedDateRange?.end2026 === "2026-06-30" || storedDateRange?.end2026 === "2026-05-31");
    initialDateRange = storedDateRange && !wasOldDefault ? storedDateRange : defaultDateRange;
  } catch { initialDateRange = defaultDateRange; }
  const [view, setView] = useState(() => location.hash.includes("workspace") ? "workspace" : "executive");
  const [data, setData] = useState(null);
  const [files, setFiles] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importModule, setImportModule] = useState(null);
  const [storageReady, setStorageReady] = useState(false);
  const [usingDefaultAnalysis, setUsingDefaultAnalysis] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sourceNotice, setSourceNotice] = useState("");
  const [dateRefreshStatus, setDateRefreshStatus] = useState("idle");
  const [refreshProgress, setRefreshProgress] = useState(null);
  const [auth, setAuth] = useState({ ip: "", role: "public", isAdmin: false, isDeputy: false, features: {} });
  const [permissions, setPermissions] = useState(() => normalizePermissions({}));
  const [authReady, setAuthReady] = useState(false);
  const [fontSize, setFontSize] = useState(() => localStorage.getItem("qms-font-size") || "standard");
  const [labelControlsVisible, setLabelControlsVisible] = useState(() => localStorage.getItem("qms-chart-label-controls-visible-v2") === "true");
  const [uiTheme, setUiTheme] = useState(() => localStorage.getItem("qms-ui-theme") || "classic");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("qms-sidebar-collapsed") === "true");
  const [dateRange, setDateRange] = useState(initialDateRange);
  const [appliedDateRange, setAppliedDateRange] = useState(initialDateRange);
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const skipNextDateAnalysisRef = useRef(true);
  const analyzeInBackground = useCallback((sources, range, fallback = sampleData) => new Promise((resolve) => {
    setTimeout(() => resolve(sources.length ? analyzeImported(sources, range) : fallback), 0);
  }), []);
  const applyAnalyzedData = useCallback(async (sources, range, { fallback = sampleData, bumpRevision = true } = {}) => {
    const nextData = await analyzeInBackground(sources, range, fallback);
    startTransition(() => {
      setData(nextData);
      if (bumpRevision) setAnalysisRevision((current) => current + 1);
    });
    return nextData;
  }, [analyzeInBackground]);
  const prepareSourcesForAnalysis = useCallback(async (sources, onProgress = () => {}) => {
    if (!sources?.length || sources.every((source) => Array.isArray(source.rows) && source.rows.length)) return sources;
    const downloadable = sources.filter((source) => source.serverFile);
    if (!downloadable.length) return sources;
    onProgress({ label: "正在从服务器读取原始Excel", percent: 18 });
    const downloadedFiles = await downloadSourceFiles(downloadable);
    if (!downloadedFiles.length) return sources;
    onProgress({ label: "正在解析服务器原始数据", percent: 45 });
    const parsed = await parseFiles(downloadedFiles);
    const metaByKey = new Map(sources.map((source) => [`${source.module}::${source.name}`, source]));
    const parsedKeys = new Set(parsed.map((source) => `${source.module}::${source.name}`));
    const hydrated = parsed.map((source) => ({ ...source, ...(metaByKey.get(`${source.module}::${source.name}`) || {}), rows: source.rows }));
    const rest = sources.filter((source) => !parsedKeys.has(`${source.module}::${source.name}`));
    return [...rest, ...hydrated];
  }, []);
  const saveAnalysisCacheFor = useCallback((sources, range, nextData) => {
    if (!sources?.length || !nextData) return Promise.resolve(null);
    return saveCachedAnalysis({
      version: ANALYSIS_CACHE_VERSION,
      savedAt: new Date().toISOString(),
      dateRange: { ...range },
      sourceSignature: createSourcesSignature(sources),
      files: summarizeSources(sources),
      data: nextData,
    }).catch(() => null);
  }, []);

  useEffect(() => { location.hash = view; }, [view]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCurrentUser(), loadPermissionConfig()]).then(([user, payload]) => {
      if (cancelled) return;
      setAuth(user || { ip: "", role: "public", isAdmin: false, isDeputy: false });
      setPermissions(normalizePermissions(payload?.permissions || payload || {}));
      setAuthReady(true);
    }).catch(() => {
      if (cancelled) return;
      setAuth({ ip: "", role: "public", isAdmin: false, isDeputy: false });
      setPermissions(normalizePermissions({}));
      setAuthReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (view === "workspace" && !canUseFeature(auth, permissions, "workspace")) setView("executive");
  }, [view, auth, permissions]);
  useEffect(() => {
    const theme = uiTheme === "apple" ? "apple" : "classic";
    document.documentElement.dataset.uiTheme = theme;
    localStorage.setItem("qms-ui-theme", theme);
  }, [uiTheme]);
  useEffect(() => { localStorage.setItem("qms-sidebar-collapsed", sidebarCollapsed ? "true" : "false"); }, [sidebarCollapsed]);
  useEffect(() => { seedDefaultAnnotations(); }, []);
  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const cached = await loadCachedAnalysis();
        const cachedRange = isValidDateRange(cached?.dateRange) ? {
          start2025: cached.dateRange.start2025,
          end2025: cached.dateRange.end2025,
          start2026: cached.dateRange.start2026,
          end2026: cached.dateRange.end2026,
        } : null;
        if (!cancelled && cached?.version === ANALYSIS_CACHE_VERSION && cached?.data && cachedRange) {
          setUsingDefaultAnalysis(false);
          setFiles(cached.files || []);
          setDateRange(cachedRange);
          setAppliedDateRange(cachedRange);
          localStorage.setItem("qms-date-range-v202605", JSON.stringify(cachedRange));
          setData(cached.data);
          setStorageReady(true);
          loadImportedSources().then(async (stored) => {
            if (cancelled || !stored.length) return;
            setFiles(stored);
            if (!cacheMatchesSources(cached, stored)) {
              const hydrated = await prepareSourcesForAnalysis(stored);
              if (cancelled) return;
              setFiles(hydrated);
              const nextData = await applyAnalyzedData(hydrated, cachedRange, { bumpRevision: false });
              saveAnalysisCacheFor(hydrated, cachedRange, nextData);
            }
          });
          return;
        }

        const savedRange = await loadAppliedDateRange();
        const activeRange = isValidDateRange(savedRange) ? {
          start2025: savedRange.start2025,
          end2025: savedRange.end2025,
          start2026: savedRange.start2026,
          end2026: savedRange.end2026,
        } : appliedDateRange;
        if (!isSameDateRange(activeRange, appliedDateRange)) {
          setDateRange(activeRange);
          setAppliedDateRange(activeRange);
          localStorage.setItem("qms-date-range-v202605", JSON.stringify(activeRange));
        }

        const stored = await loadImportedSources();
        if (cancelled) return;
        if (stored.length) {
          setUsingDefaultAnalysis(false);
          setFiles(stored);
          const hydrated = await prepareSourcesForAnalysis(stored);
          if (cancelled) return;
          setFiles(hydrated);
          const nextData = await applyAnalyzedData(hydrated, activeRange, { bumpRevision: false });
          saveAnalysisCacheFor(hydrated, activeRange, nextData);
          if (!cancelled) setStorageReady(true);
          return;
        }

        const defaultAnalysis = await loadDefaultAnalysis();
        if (cancelled) return;
        if (isSameDateRange(activeRange, defaultDateRange) && defaultAnalysis?.data) {
          setUsingDefaultAnalysis(true);
          setFiles(defaultAnalysis.files || []);
          setData(defaultAnalysis.data);
          setStorageReady(true);
          return;
        }

        const defaultFiles = await loadDefaultSources();
        if (cancelled) return;
        setUsingDefaultAnalysis(false);
        setFiles(defaultFiles);
        if (defaultFiles.length) {
          await applyAnalyzedData(defaultFiles, activeRange, { bumpRevision: false });
        } else {
          setData(sampleData);
        }
        if (!cancelled) setStorageReady(true);
      } catch {
        if (!cancelled) {
          setData(sampleData);
          setStorageReady(true);
        }
      }
    };
    initialize();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
    localStorage.setItem("qms-font-size", fontSize);
    window.dispatchEvent(new CustomEvent("qms-font-size", { detail: fontSize }));
  }, [fontSize]);
  useEffect(() => {
    if (storageReady && files.length && !usingDefaultAnalysis) {
      if (skipNextDateAnalysisRef.current) {
        skipNextDateAnalysisRef.current = false;
        return;
      }
      applyAnalyzedData(files, appliedDateRange).then((nextData) => saveAnalysisCacheFor(files, appliedDateRange, nextData));
    }
  }, [appliedDateRange, storageReady, usingDefaultAnalysis]);
  useEffect(() => {
    localStorage.setItem("qms-chart-label-controls-visible-v2", String(labelControlsVisible));
    window.dispatchEvent(new CustomEvent("qms-chart-label-controls", { detail: labelControlsVisible }));
  }, [labelControlsVisible]);
  const openImport = (module = null) => {
    if (!canUseFeature(auth, permissions, "dataImport")) return;
    setImportModule(module);
    setImportOpen(true);
  };
  const applySources = async (sources, result = {}) => {
    setUsingDefaultAnalysis(false);
    setFiles(sources);
    await saveImportedSources(sources);
    localStorage.setItem("qms-user-imported-sources-v2", "true");
    const nextData = await applyAnalyzedData(sources, appliedDateRange);
    saveAnalysisCacheFor(sources, appliedDateRange, nextData);
    const parts = [];
    if (result.added?.length) parts.push(`新增${result.added.length}个`);
    if (result.replaced?.length) parts.push(`替换${result.replaced.length}个`);
    if (result.rejected?.length) parts.push(`拒绝${result.rejected.length}个模块不匹配文件`);
    setSourceNotice(parts.length ? `数据源已保存：${parts.join("，")}` : "本地数据源已更新");
    setTimeout(() => setSourceNotice(""), 3200);
  };
  const deleteSource = async (source) => {
    const sources = files.filter((file) => !(file.module === source.module && file.name === source.name));
    await applySources(sources);
    setSourceNotice(`已删除：${source.name}`);
    setTimeout(() => setSourceNotice(""), 2600);
  };
  const updateDateRange = (next) => {
    setDateRange(next);
    setDateRefreshStatus("idle");
  };
  const getVisibleDateRange = () => {
    const inputs = Array.from(document.querySelectorAll('.global-date-filter input[type="date"]'));
    if (inputs.length >= 4) {
      return {
        start2025: inputs[0].value || dateRange.start2025,
        end2025: inputs[1].value || dateRange.end2025,
        start2026: inputs[2].value || dateRange.start2026,
        end2026: inputs[3].value || dateRange.end2026,
      };
    }
    return dateRange;
  };
  const refreshDateData = () => {
    const selectedRange = getVisibleDateRange();
    setDateRange(selectedRange);
    const valid = selectedRange.start2025 && selectedRange.end2025 && selectedRange.start2026 && selectedRange.end2026
      && selectedRange.start2025 <= selectedRange.end2025 && selectedRange.start2026 <= selectedRange.end2026;
    if (!valid) return;
    if (!files.length) {
      setDateRefreshStatus("missing");
      setTimeout(() => setDateRefreshStatus("idle"), 2600);
      return;
    }
    if (usingDefaultAnalysis) {
      setDateRefreshStatus("loading");
      setRefreshProgress({ label: "正在加载默认数据源", percent: 15 });
      loadDefaultSources().then(async (defaultFiles) => {
        setUsingDefaultAnalysis(false);
        setFiles(defaultFiles);
        skipNextDateAnalysisRef.current = true;
        setAppliedDateRange({ ...selectedRange });
        localStorage.setItem("qms-date-range-v202605", JSON.stringify(selectedRange));
        setRefreshProgress({ label: "正在计算分析结果", percent: 70 });
        const nextData = await applyAnalyzedData(defaultFiles, selectedRange);
        await saveAnalysisCacheFor(defaultFiles, selectedRange, nextData);
        await saveAppliedDateRange(selectedRange).catch(() => {});
        setRefreshProgress({ label: "刷新完成", percent: 100 });
        setDateRefreshStatus("done");
        setTimeout(() => { setDateRefreshStatus("idle"); setRefreshProgress(null); }, 1800);
      });
      return;
    }
    setDateRefreshStatus("loading");
    setRefreshProgress({ label: "准备刷新数据", percent: 8 });
    skipNextDateAnalysisRef.current = true;
    setAppliedDateRange({ ...selectedRange });
    localStorage.setItem("qms-date-range-v202605", JSON.stringify(selectedRange));
    prepareSourcesForAnalysis(files, setRefreshProgress).then((readySources) => {
      setFiles(readySources);
      setRefreshProgress({ label: "正在计算图表和数据表", percent: 78 });
      return applyAnalyzedData(readySources, selectedRange).then((nextData) => ({ readySources, nextData }));
    }).then(({ readySources, nextData }) => {
      const canSaveGlobal = (auth?.isAdmin || auth?.isDeputy) && canUseFeature(auth, permissions, "dataImport") && localStorage.getItem("qms-user-imported-sources-v2") === "true";
      if (!canSaveGlobal) return null;
      setRefreshProgress({ label: "正在保存到服务器", percent: 92 });
      return Promise.all([saveAnalysisCacheFor(readySources, selectedRange, nextData), saveAppliedDateRange(selectedRange)]);
    }).then(() => {
      setRefreshProgress({ label: "刷新完成", percent: 100 });
      setDateRefreshStatus("done");
      setTimeout(() => { setDateRefreshStatus("idle"); setRefreshProgress(null); }, 1800);
    }).catch(() => {
      setRefreshProgress({ label: "刷新完成", percent: 100 });
      setDateRefreshStatus("done");
      setTimeout(() => { setDateRefreshStatus("idle"); setRefreshProgress(null); }, 1800);
    });
  };
  const saveTemplate = () => {
    localStorage.setItem("qms-quality-template", JSON.stringify({ view, savedAt: Date.now(), data }));
    setSaved(true); setTimeout(() => setSaved(false), 2200);
  };
  const exportData = () => downloadJson(data, `质量分析-${data.period}.json`);
  const changeUiTheme = (nextTheme) => {
    const theme = nextTheme === "apple" ? "apple" : "classic";
    document.documentElement.dataset.uiTheme = theme;
    localStorage.setItem("qms-ui-theme", theme);
    setUiTheme(theme);
  };

  if (!storageReady || !data || !authReady) {
    const theme = uiTheme === "apple" ? "apple" : "classic";
    return <UiThemeContext.Provider value={theme}>
      <div className={`app-loading-shell theme-${theme}`}>
        <div className="app-loading-card">
          <ShieldCheck size={30} weight="fill" />
          <strong>正在加载服务器最新数据</strong>
          <span>系统会优先读取共享数据，加载完成后一次性呈现，避免先显示默认数据再刷新。</span>
        </div>
      </div>
    </UiThemeContext.Provider>;
  }

  return <UiThemeContext.Provider value={uiTheme === "apple" ? "apple" : "classic"}>
    {view === "executive"
      ? <ExecutiveDashboard data={data} files={files} onImport={openImport} onDeleteSource={deleteSource} onSourcesChanged={applySources} view={view} onViewChange={setView} dateRange={dateRange} appliedDateRange={appliedDateRange} onDateRange={updateDateRange} onRefreshDate={refreshDateData} dateRefreshStatus={dateRefreshStatus} refreshProgress={refreshProgress} fontSize={fontSize} onFontSize={setFontSize} analysisKey={analysisRevision} labelControlsVisible={labelControlsVisible} onToggleLabelControls={() => setLabelControlsVisible((current) => !current)} uiTheme={uiTheme === "apple" ? "apple" : "classic"} onThemeChange={changeUiTheme} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((current) => !current)} auth={auth} permissions={permissions} onPermissionsChanged={(next) => setPermissions(normalizePermissions(next))} />
      : <WorkspaceDashboard key={`workspace-${analysisRevision}`} data={data} files={files} onImport={() => openImport(null)} view={view} onViewChange={setView} onExport={exportData} onSave={saveTemplate} dateRange={dateRange} appliedDateRange={appliedDateRange} onDateRange={updateDateRange} onRefreshDate={refreshDateData} dateRefreshStatus={dateRefreshStatus} fontSize={fontSize} onFontSize={setFontSize} uiTheme={uiTheme === "apple" ? "apple" : "classic"} auth={auth} permissions={permissions} />}
    <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSourcesChanged={applySources} files={files} dateRange={appliedDateRange} targetModule={importModule} />
    {saved && <div className="toast"><CheckCircle size={19} weight="fill" />当前分析视图已保存为本机模板</div>}
    {sourceNotice && <div className="toast"><Database size={19}/>{sourceNotice}</div>}
  </UiThemeContext.Provider>;
}
