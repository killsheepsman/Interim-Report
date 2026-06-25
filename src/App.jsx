import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight, ArrowsClockwise, Bell, CaretDown, ChartBar, ChartPieSlice, CheckCircle,
  ClipboardText, ClockCountdown, Cube, Database, DownloadSimple, Eye, FileXls,
  FloppyDisk, Funnel, GearSix, House, Kanban, ListChecks, Plus, Pulse,
  Question, Rows, ShieldCheck, SidebarSimple, Sparkle, Table, Target, Trash,
  UploadSimple, User, Warning, WarningCircle, X,
} from "@phosphor-icons/react";
import { analyzeImported, downloadJson, parseFiles } from "./dataEngine.js";
import { loadDefaultAnalysis, loadDefaultSources, loadImportedSources, mergeImportedSources, saveImportedSources } from "./dataStore.js";
import { sampleData } from "./sampleData.js";
import { BarCompare, Donut, HorizontalRank, Pareto, QuantityRateCombo, ScoreMonthlyCombo, ScoreYearCompare, StackedStage, WorkshopCategoryHeatmap, YearStackedCompare } from "./charts.jsx";

const moduleIcons = { IQC: Cube, IPQC: Pulse, OQC: ShieldCheck, DQA: ClipboardText };
const moduleColor = { IQC: "green", IPQC: "blue", OQC: "orange", DQA: "amber" };
const safeParse = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
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

function Switcher({ view, onChange }) {
  return <div className="view-switcher">
    <button className={view === "executive" ? "active" : ""} onClick={() => onChange("executive")}>经营驾驶舱</button>
    <button className={view === "workspace" ? "active" : ""} onClick={() => onChange("workspace")}>质量工作台</button>
  </div>;
}

function ImportModal({ open, onClose, onSourcesChanged, files, dateRange, targetModule }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const handleFiles = async (selected) => {
    setBusy(true);
    try {
      const parsed = await parseFiles([...selected]);
      const valid = targetModule ? parsed.filter((file) => file.module === targetModule) : parsed.filter((file) => file.module !== "UNKNOWN");
      const rejected = parsed.filter((file) => targetModule ? file.module !== targetModule : file.module === "UNKNOWN");
      const merged = mergeImportedSources(files, valid);
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
        {files.slice(-6).map((file, index) => <div className="file-row" key={`${file.name}-${index}`}>
          <FileXls size={19} /><div><strong>{file.name}</strong><span>{file.rows.length.toLocaleString()} 行 · {file.sheets.length} 个工作表</span></div>
          <span className={`module-pill ${file.module === "UNKNOWN" ? "unknown" : ""}`}>{file.module === "UNKNOWN" ? "需确认" : file.module}</span>
        </div>)}
        {!files.length && <div className="empty-files">导入后，这里会显示模块识别结果与数据行数。</div>}
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

const buildExportHtml = () => {
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

function DateRangeFilter({ value, onChange, onRefresh, fontSize, onFontSize, refreshStatus = "idle" }) {
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
    <button className={`date-refresh-btn ${refreshStatus}`} disabled={invalid} onClick={onRefresh}><ArrowsClockwise size={15}/>{refreshStatus === "done" ? "已刷新" : refreshStatus === "missing" ? "请先导入数据" : "刷新数据"}</button>
    <FontSizeControl value={fontSize} onChange={onFontSize}/>
    {(invalid2025 || invalid2026) && <em>同一年度的开始日期不能晚于结束日期</em>}
  </div>;
}

function ExecutiveSidebar({ active, setActive }) {
  const nav = [
    ["总览", House], ["IQC", Cube], ["IPQC", Pulse],
    ["OQC", ShieldCheck], ["DQA", ClipboardText], ["改善计划", Target], ["数据导入", UploadSimple], ["模板设置", GearSix],
  ];
  return <aside className="executive-sidebar">
    <div className="brand"><div className="brand-logo"><ShieldCheck size={26} weight="fill" /></div><div><strong>品质智控</strong><span>质量分析平台</span></div></div>
    <nav>{nav.map(([name, Icon]) => <button key={name} className={active === name ? "active" : ""} onClick={() => setActive(name)}><Icon size={20} /><span>{name}</span></button>)}</nav>
    <button className="collapse-nav"><SidebarSimple size={18} />收起</button>
  </aside>;
}

const moduleLabels = { IQC: "来料检验", IPQC: "过程检验", OQC: "出货评分", DQA: "研发质量" };
function DataSourcePage({ files, onImportModule, onDelete }) {
  const modules = ["IQC", "IPQC", "OQC", "DQA"];
  return <div className="data-source-page">
    <div className="data-source-hero">
      <div><Database size={30}/><div><h2>本地数据源管理</h2><p>数据已保存到当前电脑。相同模块且文件名相同再次导入时自动替换，也可以手动删除后重传。</p></div></div>
    </div>
    <div className="data-source-modules">
      {modules.map((module) => {
        const Icon = moduleIcons[module];
        const rows = files.filter((file) => file.module === module);
        return <section className="data-source-module" key={module}>
          <header><span className={`dataset-icon ${moduleColor[module]}`}><Icon size={22}/></span><div><h3>{module} · {moduleLabels[module]}</h3><p>{rows.length}个数据源</p></div><button onClick={() => onImportModule(module)}><UploadSimple size={16}/>导入/替换</button></header>
          <div className="source-file-table">
            <div className="source-file-row source-file-head"><span>文件名</span><span>数据行数</span><span>工作表</span><span>导入时间</span><span>操作</span></div>
            {rows.map((file) => <div className="source-file-row" key={`${file.module}-${file.name}`}>
              <strong><FileXls size={16}/>{file.name}</strong><span>{file.rows.length.toLocaleString()}</span><span>{file.sheets.length}</span>
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
    <Panel title="深圳主力供应商批次良率对比" subtitle="柱形为检验总数/不合格数，折线为批次良率" className="span-6"><QuantityRateCombo rows={rowsBySite.深圳} labelKey="supplier" height={350}/></Panel>
    <Panel title="杭州主力供应商批次良率对比" subtitle="柱形为检验总数/不合格数，折线为批次良率" className="span-6"><QuantityRateCombo rows={rowsBySite.杭州} labelKey="supplier" height={350}/></Panel>
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

function ExecutiveDashboard({ data, files, onImport, onDeleteSource, view, onViewChange, dateRange, onDateRange, onRefreshDate, dateRefreshStatus, fontSize, onFontSize, analysisKey, labelControlsVisible, onToggleLabelControls }) {
  const [active, setActive] = useState("总览");
  const moduleView = ["IQC", "IPQC", "OQC", "DQA"].includes(active) ? active : null;
  return <div className="executive-shell">
    <ExecutiveSidebar active={active} setActive={setActive} />
    <main className="executive-main">
      <header className="executive-topbar">
        <div><h1>{moduleView ? `${moduleView} 专题分析` : active === "数据导入" ? "数据源管理" : active === "改善计划" ? "改善计划与闭环" : "经营驾驶舱"}</h1><p>{moduleView ? "从原始数据下钻到TOP问题与责任对象" : "全局质量运营总览"}</p></div>
        <div className="top-actions"><Switcher view={view} onChange={onViewChange} /><ExportReportButton /><button className={`label-controls-toggle ${labelControlsVisible ? "active" : ""}`} onClick={onToggleLabelControls}>{labelControlsVisible ? "隐藏数值设置" : "显示数值设置"}</button><button className="import-btn" onClick={() => onImport(null)}><UploadSimple size={17} />导入数据</button></div>
      </header>
      <DateRangeFilter value={dateRange} onChange={onDateRange} onRefresh={onRefreshDate} refreshStatus={dateRefreshStatus} fontSize={fontSize} onFontSize={onFontSize}/>
      {active === "数据导入" ? <DataSourcePage files={files} onImportModule={onImport} onDelete={onDeleteSource}/> : active === "改善计划" ? <ActionPage data={data} /> : active === "模板设置" ? <TemplatePage /> : moduleView ? <ModuleDetail key={`${moduleView}-${analysisKey}`} module={moduleView} data={data} /> : <>
        <div className="kpi-grid">{data.kpis.map((item) => <KpiCard key={item.key} item={item} />)}</div>
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

function WorkspaceTop({ view, onViewChange }) {
  return <header className="workspace-top summary-workspace-top">
    <div className="workspace-brand"><ShieldCheck size={24} weight="fill" /><strong>总结报告</strong></div>
    <div className="workspace-actions"><Switcher view={view} onChange={onViewChange} /><ExportReportButton /></div>
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

function WorkspaceDashboard({ data, files, onImport, view, onViewChange, onExport, onSave, dateRange, appliedDateRange, onDateRange, onRefreshDate, dateRefreshStatus, fontSize, onFontSize }) {
  const [section, setSection] = useState("top");
  const [toast, setToast] = useState("");
  const reportDateRange = appliedDateRange || dateRange;
  const generated = useMemo(() => buildSummaryReport(data, files, reportDateRange), [data, files, reportDateRange]);
  const reportSignature = useMemo(() => JSON.stringify({
    period: generated.period,
    kpis: (data.kpis || []).map((item) => [item.key, item.value, item.delta]),
  }), [generated.period, data.kpis]);
  const [report, setReport] = useState(() => {
    const saved = safeParse(localStorage.getItem(reportStorageKey), null);
    return saved?.reportSignature === reportSignature ? saved : generated;
  });
  useEffect(() => {
    const saved = safeParse(localStorage.getItem(reportStorageKey), null);
    setReport(saved?.reportSignature === reportSignature ? saved : generated);
  }, [generated, reportSignature]);
  const update = (key, value) => setReport((current) => ({ ...current, [key]: value }));
  const saveReport = () => {
    localStorage.setItem(reportStorageKey, JSON.stringify({ ...report, reportSignature, savedAt: new Date().toISOString() }));
    setToast("?????????????");
    setTimeout(() => setToast(""), 2600);
  };
  const regenerate = () => {
    setReport(generated);
    setToast("已按当前经营驾驶舱数据重新生成报告草稿");
    setTimeout(() => setToast(""), 2600);
  };
  const jump = (key) => {
    setSection(key);
    const selectors = { top: ".summary-report-page", datasets: ".dataset-section", analysis: ".summary-report-section", actions: ".report-todos-panel" };
    document.querySelector(selectors[key])?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return <div className="workspace-shell summary-report-shell">
    <WorkspaceTop onImport={onImport} view={view} onViewChange={onViewChange} onExport={onExport} onSave={saveReport} section={section} onSection={jump} />
    <Filters dateRange={dateRange} onDateRange={onDateRange} onRefreshDate={onRefreshDate} dateRefreshStatus={dateRefreshStatus} fontSize={fontSize} onFontSize={onFontSize} />
    <main className="workspace-main summary-report-page">
      <section className="summary-report-hero">
        <div><span className="section-number">报告</span><input className="report-title-input" value={report.title} onChange={(event) => update("title", event.target.value)} /><p>{report.period}</p></div>
        <div className="report-actions"><button className="ghost-btn" onClick={regenerate}><ArrowsClockwise size={17}/>重新生成报告</button><button className="green-btn" onClick={saveReport}><FloppyDisk size={17}/>保存报告</button></div>
      </section>
      <section className="dataset-section"><div className="section-label">数据集状态（与经营驾驶舱一致）<Question size={14} /></div><DatasetStatus files={files} /></section>
      <section className="summary-report-kpis">
        {(data.kpis || []).map((item) => <div className="summary-kpi" key={item.key || item.label}><span>{item.label}</span><strong>{fmt(item.value)}{item.unit}</strong><em className={(item.delta || 0) > 0 && item.goodWhenDown ? "risk-up" : "risk-down"}>同比 {item.delta > 0 ? "+" : ""}{item.delta}</em><small>{item.detail}</small></div>)}
      </section>
      <div className="summary-report-grid">
        <Panel title="一、管理层摘要" className="summary-report-section"><EditableBlock label="可编辑摘要" value={report.summary} onChange={(value) => update("summary", value)} rows={7}/></Panel>
        <Panel title="二、量化分析结论" className="summary-report-section"><EditableBlock label="按经营驾驶舱数据自动生成，可修改" value={report.conclusions} onChange={(value) => update("conclusions", value)} rows={8}/></Panel>
        <Panel title="三、TOP改善点" className="summary-report-section"><EditableBlock label="TOP问题与改善方向" value={report.topImprovements} onChange={(value) => update("topImprovements", value)} rows={7}/></Panel>
        <Panel title="四、下半年改善措施" className="summary-report-section"><EditableBlock label="措施要具体到模块、责任对象和验证方式" value={report.measures} onChange={(value) => update("measures", value)} rows={8}/></Panel>
        <Panel title="五、待办安排：组装工坊 / 交付经理 / 产品部 / TPM" className="report-todos-panel"><TodoTable rows={report.todos || []} onChange={(rows) => update("todos", rows)} /></Panel>
      </div>
    </main>
    <footer className="workspace-foot">数据更新时间：{data.updatedAt}<span>总结报告可编辑并保存在本地浏览器；经营驾驶舱页面未改动</span></footer>
    {toast && <div className="toast"><CheckCircle size={19} weight="fill" />{toast}</div>}
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
    {visibleRows.length ? <QuantityRateCombo rows={visibleRows} labelKey="name" rateLabel="异常密度" qtyLabel="送检数/问题数量" height={400}/> : <div className="supplier-empty">请至少选择一个工坊</div>}
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

function IpqcAnalysis({ data }) {
  const [site, setSite] = useState("深圳");
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
    <FloatingTabs options={["深圳", "杭州"]} active={site} onChange={setSite}/>
    <div className="iqc-section-title">
      <div><span className="section-number">2</span><div><h2>IPQC过程质量同比分析</h2><p>异常密度＝问题数量÷送检数；不良内容非空的一行计1个问题</p></div></div>
      <div className="module-heading-actions sticky-switch-bar"><AppliedPeriodTag data={data}/><div className="site-tabs"><button className={site === "深圳" ? "active" : ""} onClick={() => preserveScrollPosition(() => setSite("深圳"))}>深圳</button><button className={site === "杭州" ? "active" : ""} onClick={() => preserveScrollPosition(() => setSite("杭州"))}>杭州</button></div></div>
    </div>
    <div className="iqc-summary-strip ipqc-summary">
      <div><span>2025送检数</span><strong>{totals.y2025Qty.toLocaleString()}</strong></div>
      <div><span>2026送检数</span><strong>{totals.y2026Qty.toLocaleString()}</strong></div>
      <div><span>2025问题数量</span><strong>{totals.y2025Bad.toLocaleString()}</strong></div>
      <div><span>2026问题数量</span><strong>{totals.y2026Bad.toLocaleString()}</strong></div>
      <div><span>异常密度同比</span><strong className={density(2026) <= density(2025) ? "green" : "red"}>{density(2025)}% → {density(2026)}%</strong></div>
    </div>
    <div className="ipqc-insight"><strong>重点结论</strong><span>{top ? `${site}${top.workshop}的“${top.category}”为当前TOP问题，2026年占比${top.share}%，建议由${top.owner}牵头改善。` : "导入IPQC原始数据后自动生成重点结论。"}</span></div>
    <div className="iqc-analysis-grid">
      <Panel title="2.1 总体质量趋势" subtitle={`${site} · 柱形为送检数/问题数量，折线为异常密度（问题数量÷送检数）`}>
        <QuantityRateCombo rows={monthly} labelKey="month" rateLabel="异常密度" qtyLabel="送检数/问题数量" height={390}/>
      </Panel>
      <Panel title="2.2 工坊质量表现" subtitle="可勾选工坊；表头点击后按对应指标升降序排列">
        <WorkshopCompare rows={workshops}/>
      </Panel>
      <Panel title="2.3 原始不良类型同比" subtitle="直接使用原始数据中的“不良类型”；柱形为问题数量，折线为分类占比">
        <QuantityRateCombo rows={rawTypes} qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Share" rate2026="y2026Share" rateLabel="分类占比" qtyLabel="问题数量" showBad={false} height={410}/>
      </Panel>
      <Panel title="2.4 工坊 × 原始不良类型热力图" subtitle="直接使用原始“不良类型”字段；颜色越深表示该工坊对应问题越集中">
        <WorkshopCategoryHeatmap data={heatmap} height={Math.max(360, heatmap.rows.length * 38 + 150)}/>
      </Panel>
      <Panel title="2.5 TOP问题与针对性改善措施" subtitle="按2026原始不良类型数量排序，明确重点工坊、责任对象和执行动作">
        <ImprovementTable rows={improvements}/>
      </Panel>
    </div>
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

function OqcAnalysis({ data }) {
  const summary = data.oqc.monthlySummary;
  if (!summary) return <div className="module-page"><div className="module-summary"><KpiCard item={data.kpis[2]} /><div className="summary-note"><strong>待导入月度汇总表</strong><p>请导入“2025年-2026年评分按月汇总.xlsx”生成同期评分分析。</p></div></div></div>;
  const [focusDivision, setFocusDivision] = useState("FPC事业部");
  const monthly = summary.divisionMonthly?.[focusDivision] || summary.fpcMonthly || [];
  const total2025 = summary.divisions.reduce((sum, row) => sum + row.y2025Count, 0);
  const total2026 = summary.divisions.reduce((sum, row) => sum + row.y2026Count, 0);
  const fpcWorst = [...summary.fpcTpm].sort((a,b) => b.y2026LowRate - a.y2026LowRate)[0];
  return <div className="module-page iqc-supplier-page oqc-page">
    <FloatingTabs options={[{ value: "产品一部", label: "半导体&北美" }, { value: "产品五部", label: "产品五部" }, { value: "FPC事业部", label: "FPC事业部" }]} active={focusDivision} onChange={setFocusDivision}/>
    <div className="iqc-section-title">
      <div><span className="section-number">3</span><div><h2>OQC出货评分同期分析</h2><p>按顶部已应用日期范围进行同期对比；低分定义为评分≤3分</p></div></div>
      <AppliedPeriodTag data={data}/>
    </div>
    <div className="iqc-summary-strip oqc-summary">
      <div><span>2025评分设备</span><strong>{total2025.toLocaleString()}</strong></div>
      <div><span>2026评分设备</span><strong>{total2026.toLocaleString()}</strong></div>
      <div><span>产品部范围</span><strong>3</strong></div>
      <div><span>FPC TPM范围</span><strong>5</strong></div>
      <div><span>重点关注</span><strong className="red">{fpcWorst?.name || "—"}低分率 {fpcWorst?.y2026LowRate || 0}%</strong></div>
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
      </div>
      <div className="oqc-three-grid">
        <Panel title={`${focusDivision === "产品一部" ? "半导体&北美" : focusDivision}平均分月度趋势`}><ScoreMonthlyCombo rows={monthly} metric="Avg" label="平均分" numeratorKey="ScoreTotal" numeratorName="评分总分" denominatorName="评分数量" max={5}/></Panel>
        <Panel title={`${focusDivision === "产品一部" ? "半导体&北美" : focusDivision}5分比例月度趋势`}><ScoreMonthlyCombo rows={monthly} metric="FiveRate" label="5分比例" numeratorKey="Five" numeratorName="5分数量" denominatorName="评分总数量" percent max={100}/></Panel>
        <Panel title={`${focusDivision === "产品一部" ? "半导体&北美" : focusDivision}低分率月度趋势`}><ScoreMonthlyCombo rows={monthly} metric="LowRate" label="低分比例" numeratorKey="Low" numeratorName="≤3分数量" denominatorName="评分总数量" percent max={100}/></Panel>
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
  return <div className="dqa-overview-kpis ecn-kpis">
    <div><span>2026 ECN率</span><strong>{y2026.rate}%</strong><p><b>2025：{y2025.rate}%</b><em className={delta > 0 ? "risk-up" : "risk-down"}>{delta > 0 ? "+" : ""}{delta}pp</em></p></div>
    <div><span>2026 ECN条数</span><strong>{y2026.numerator.toLocaleString()}</strong><p><b>2025：{y2025.numerator.toLocaleString()}</b><em>分子</em></p></div>
    <div><span>2026 物料款数</span><strong>{y2026.denominator.toLocaleString()}</strong><p><b>2025：{y2025.denominator.toLocaleString()}</b><em>分母</em></p></div>
    <div className="review-card"><span>统计周期</span><strong>1-5月</strong><p><b>2026只统计到5月</b><em>分母空值剔除 {ecn.blankDenominatorRows || 0} 行</em></p></div>
  </div>;
}

function EcnRateTable({ rows }) {
  return <div className="dqa-compare-table">
    <div className="ecn-rate-row ecn-rate-head"><span>对象</span><span>2025 ECN条数</span><span>2025物料款数</span><span>2025 ECN率</span><span>2026 ECN条数</span><span>2026物料款数</span><span>2026 ECN率</span><span>同比变化</span></div>
    {ecnFlattenRows(rows).map((row) => <div className="ecn-rate-row" key={row.name}>
      <strong>{row.name}</strong>
      <span>{row.y2025Bad.toLocaleString()}</span><span>{row.y2025Qty.toLocaleString()}</span><b>{row.y2025Rate}%</b>
      <span>{row.y2026Bad.toLocaleString()}</span><span>{row.y2026Qty.toLocaleString()}</span><b>{row.y2026Rate}%</b>
      <em className={row.delta > 0 ? "risk-up" : "risk-down"}>{row.delta > 0 ? "+" : ""}{row.delta}pp</em>
    </div>)}
  </div>;
}

function EcnRatePanel({ title, subtitle, rows, chartKey }) {
  const flat = ecnFlattenRows(rows);
  return <Panel title={title} subtitle={subtitle}>
    <QuantityRateCombo rows={flat} qtyLabel="物料款数" badLabel="ECN条数" rateLabel="ECN率" height={Math.max(360, flat.length * 46 + 160)} chartKey={chartKey}/>
    <EcnRateTable rows={rows}/>
  </Panel>;
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
  const groups = [...new Set(rows.map((row) => row.division).filter(Boolean))].map((division) => ({
    division,
    rows: rows.filter((row) => row.division === division),
  })).filter((group) => group.rows.length);
  const chartRows = rows.map((row) => ({ ...row, name: ecnTpmDisplayName(row.name) }));
  const totalAxisRows = Math.max(1, chartRows.reduce((sum, row) => sum + row.years.length, 0));
  const chartHeight = Math.max(420, totalAxisRows * 28 + 120);
  return <Panel title="TPM变更原因占比" subtitle="TPM合并在同一张图展示；左侧产品部色块仅作分组标记，TPM姓名不再带产品部前缀">
    <div className="ecn-tpm-grouped-chart" style={{ "--ecn-axis-rows": totalAxisRows, "--ecn-plot-height": `${chartHeight - 76}px` }}>
      <div className="ecn-tpm-group-labels">
        {groups.map((group) => <div key={group.division} style={{ flex: group.rows.length * 2 }}><span>{group.division}</span></div>)}
      </div>
      <div className="ecn-tpm-group-chart">
        <YearStackedCompare rows={chartRows} values={ecn.tpmReasonValues} height={chartHeight} chartKey="dqa-ecn-tpm-reasons-grouped" topToBottom/>
      </div>
    </div>
    <EcnTpmReasonTable rows={rows} values={ecn.tpmReasonValues}/>
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
      <Panel title="ECN率月度趋势" subtitle="柱形图为物料款数与ECN条数，折线为ECN率">
        <QuantityRateCombo rows={ecn.monthly} qtyLabel="物料款数" badLabel="ECN条数" rateLabel="ECN率" height={390} chartKey="dqa-ecn-monthly"/>
        <EcnRateTable rows={ecn.monthly.map((row) => ({
          name: row.name,
          years: [
            { year: 2025, denominator: row.y2025Qty, numerator: row.y2025Bad, rate: row.y2025Rate },
            { year: 2026, denominator: row.y2026Qty, numerator: row.y2026Bad, rate: row.y2026Rate },
          ],
        }))}/>
      </Panel>
      <EcnRatePanel title="产品部ECN率同期对比" subtitle="IC载板产品部、北美项目部、传感器产品部合并为半导体&北美" rows={ecn.divisions} chartKey="dqa-ecn-division-rate"/>
      <DqaComparePanel title="产品部变更原因占比" subtitle="按ECN（分子）中的“变更原因”统计，上方为2025、下方为2026" rows={ecn.divisionReasons} values={ecn.reasonValues}/>
    </div>
    <div className="dqa-module-title"><span className="section-number">4.E.1</span><div><h2>TPM变更原因合并分析</h2><p>TPM分析使用原始产品部做左侧分组标记，不把IC载板/北美/传感器合并；仅产品部总体分析时才合并为“半导体&北美”。</p></div></div>
    <EcnTpmReasonGrouped ecn={ecn}/>
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
  if (!compare && dqaTab !== "ecn") return <div className="module-page"><div className="module-summary"><KpiCard item={data.kpis[3]}/><div className="summary-note"><strong>???DQA??</strong><p>???2025?2026????????????</p></div></div></div>;
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
  return <div className="module-page iqc-supplier-page dqa-page">
    {compare && dqaTab !== "ecn" && <FloatingTabs options={compare.divisionNames} active={division} onChange={setDivision}/>}
    <div className="iqc-section-title">
      <div>
        <span className="section-number">4</span>
        <div>
          <h2>DQA研发质量同期分析</h2>
          <p>{dqaTab === "ecn" ? "ECN率按月、产品部、TPM和变更原因做2025/2026同期对比" : "2025评审按汇总数量统计，2026评审按“阶段=评审”的明细行统计；产品一部统一显示为“半导体&北美”"}</p>
        </div>
      </div>
      <AppliedPeriodTag data={data}/>
    </div>
    <div className="dqa-sub-tabs">
      <button className={dqaTab === "issues" ? "active" : ""} onClick={() => setDqaTab("issues")}>研发问题分析</button>
      <button className={dqaTab === "ecn" ? "active" : ""} onClick={() => setDqaTab("ecn")}>ECN分析</button>
    </div>
    {dqaTab === "ecn" ? <DqaEcnAnalysis data={data}/> : <>
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
      ? <div className="supplier-chart"><QuantityRateCombo rows={visibleRows} labelKey="supplier" height={360} /></div>
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
    <Panel title={focusProjectText.overview} subtitle={focusProjectText.overviewSub} className="iqc-wide">
      <QuantityRateCombo rows={projects} labelKey="name" qtyLabel={focusProjectText.checkBatches} badLabel={focusProjectText.abnormalBatches} rateLabel={focusProjectText.passRate} height={360} chartKey="iqc-focus-project-overview"/>
    </Panel>
    <div className="focus-project-detail">
      <div className="focus-project-detail-head">
        <div><h3>{activeProject.name}</h3><p>{focusProjectText.specialShare}: 2025 {activeProject.y2025SpecialShare}% / 2026 {activeProject.y2026SpecialShare}%</p></div>
        <div className="focus-project-tabs" data-focus-project-tabs>{projects.map((project) => <button key={project.name} className={project.name === active ? "active" : ""} onClick={() => setActive(project.name)}>{project.name}</button>)}</div>
      </div>
      <Panel title={focusProjectText.supplier} subtitle={focusProjectText.supplierSub} className="iqc-wide">
        <QuantityRateCombo rows={current.suppliers.slice(0, 12)} labelKey="supplier" qtyLabel={focusProjectText.checkBatches} badLabel={focusProjectText.abnormalBatches} rateLabel={focusProjectText.passRate} height={380} chartKey={`iqc-focus-supplier-${active}`}/>
        <FocusProjectTable rows={current.suppliers} columns={focusSupplierColumns} rowKey="supplier" />
      </Panel>
      <Panel title={focusProjectText.issue} subtitle={focusProjectText.issueSub} className="iqc-wide">
        <QuantityRateCombo rows={current.issues} qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Share" rate2026="y2026Share" rateLabel={focusProjectText.abnormalShare} qtyLabel={focusProjectText.abnormalBatches} showBad={false} height={350} chartKey={`iqc-focus-issue-${active}`}/>
        <FocusProjectTable rows={current.issues} columns={focusIssueColumns} rowKey="name" defaultSort="y2026Count" />
      </Panel>
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
        <QuantityRateCombo rows={special.monthly} labelKey="month" rateLabel="特采率" qtyLabel="检验批次" badLabel="特采" height={360}/>
      </Panel>
      <Panel title="特采材料属性" subtitle="按特采数量和占比进行同期对比">
        <QuantityRateCombo rows={special.materials} qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Share" rate2026="y2026Share" rateLabel="特采占比" qtyLabel="特采数量" showBad={false} height={370}/>
      </Panel>
      <Panel title="特采供应商TOP" subtitle="柱形为特采数量，折线为该供应商特采率">
        <QuantityRateCombo rows={special.suppliers.slice(0, 10)} labelKey="name" qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Rate" rate2026="y2026Rate" rateLabel="特采率" qtyLabel="特采数量" showBad={false} height={390}/>
      </Panel>
      <Panel title="特采原因证据分类" subtitle="区分疑似过度设计、资料问题、供应商制造偏差及证据不足">
        <QuantityRateCombo rows={special.evidence} qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Share" rate2026="y2026Share" rateLabel="特采占比" qtyLabel="特采数量" showBad={false} height={360}/>
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
        <QuantityRateCombo rows={internal.monthly} labelKey="month" height={360}/>
      </Panel>
      <Panel title="一楼自制异常类型" subtitle="仅统计质检结果=不合格">
        <QuantityRateCombo rows={internal.issues} qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Share" rate2026="y2026Share" rateLabel="异常占比" qtyLabel="异常批次" showBad={false} height={360}/>
      </Panel>
      <Panel title="一楼自制材料质量表现" subtitle="按材料属性对比检验数量、不合格数量和良率">
        <QuantityRateCombo rows={internal.materials} height={380}/>
      </Panel>
    </div></>}
  </div>;
}

function IqcSupplierAnalysis({ data }) {
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
  return <div className="module-page iqc-supplier-page">
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
      <Panel title="1.2.3 总体供应商良率趋势" subtitle={`${site} · 按月同比 · 柱形为检验总数/不合格数，折线为批次良率`} className="iqc-wide">
        <QuantityRateCombo rows={monthly} labelKey="month" height={360} />
      </Panel>
      <Panel title="1.2.1 加工件异常类型" subtitle={`${site} · 仅统计质检结果=不合格；特采进入专项分析，不重复计数`} className="iqc-wide">
        <QuantityRateCombo rows={issues} qty2025="y2025Count" qty2026="y2026Count" rate2025="y2025Share" rate2026="y2026Share" rateLabel="异常占比" qtyLabel="异常批次" showBad={false} height={370} />
      </Panel>
      <Panel title="1.2.2 异常加工件材料属性" subtitle={`${site} · 按材料类别同比 · 柱形为检验总数/不合格数，折线为材料批次良率`} className="iqc-wide">
        <QuantityRateCombo rows={materials} height={380} />
      </Panel>
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
  const defaultDateRange = {
    start2025: "2025-01-01", end2025: "2025-05-31",
    start2026: "2026-01-01", end2026: "2026-05-31",
  };
  let initialDateRange = defaultDateRange;
  try {
    const storedDateRange = JSON.parse(localStorage.getItem("qms-date-range-v202605") || "null");
    const wasOldDefault = storedDateRange?.start2025 === "2025-01-01" && storedDateRange?.end2025 === "2025-06-30"
      && storedDateRange?.start2026 === "2026-01-01" && (storedDateRange?.end2026 === "2026-06-30" || storedDateRange?.end2026 === "2026-05-31");
    initialDateRange = storedDateRange && !wasOldDefault ? storedDateRange : defaultDateRange;
  } catch { initialDateRange = defaultDateRange; }
  const [view, setView] = useState(() => location.hash.includes("workspace") ? "workspace" : "executive");
  const [data, setData] = useState(sampleData);
  const [files, setFiles] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importModule, setImportModule] = useState(null);
  const [storageReady, setStorageReady] = useState(false);
  const [usingDefaultAnalysis, setUsingDefaultAnalysis] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sourceNotice, setSourceNotice] = useState("");
  const [dateRefreshStatus, setDateRefreshStatus] = useState("idle");
  const [fontSize, setFontSize] = useState(() => localStorage.getItem("qms-font-size") || "standard");
  const [labelControlsVisible, setLabelControlsVisible] = useState(() => localStorage.getItem("qms-chart-label-controls-visible-v2") === "true");
  const [dateRange, setDateRange] = useState(initialDateRange);
  const [appliedDateRange, setAppliedDateRange] = useState(initialDateRange);
  const [analysisRevision, setAnalysisRevision] = useState(0);

  useEffect(() => { location.hash = view; }, [view]);
  useEffect(() => {
    loadImportedSources().then(async (stored) => {
      if (stored.length) {
        setUsingDefaultAnalysis(false);
        setFiles(stored);
        setData(analyzeImported(stored, appliedDateRange));
        setStorageReady(true);
        return;
      }
      const defaultAnalysis = await loadDefaultAnalysis();
      if (defaultAnalysis?.data) {
        setUsingDefaultAnalysis(true);
        setFiles(defaultAnalysis.files || []);
        setData(defaultAnalysis.data);
        setStorageReady(true);
        return;
      }
      const defaultFiles = await loadDefaultSources();
      setUsingDefaultAnalysis(false);
      setFiles(defaultFiles);
      if (defaultFiles.length) setData(analyzeImported(defaultFiles, appliedDateRange));
      setStorageReady(true);
    });
  }, []);
  useEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
    localStorage.setItem("qms-font-size", fontSize);
    window.dispatchEvent(new CustomEvent("qms-font-size", { detail: fontSize }));
  }, [fontSize]);
  useEffect(() => {
    if (storageReady && files.length && !usingDefaultAnalysis) {
      setData(analyzeImported(files, appliedDateRange));
      setAnalysisRevision((current) => current + 1);
    }
  }, [appliedDateRange, storageReady, usingDefaultAnalysis]);
  useEffect(() => {
    localStorage.setItem("qms-chart-label-controls-visible-v2", String(labelControlsVisible));
    window.dispatchEvent(new CustomEvent("qms-chart-label-controls", { detail: labelControlsVisible }));
  }, [labelControlsVisible]);
  const openImport = (module = null) => {
    setImportModule(module);
    setImportOpen(true);
  };
  const applySources = async (sources, result = {}) => {
    setUsingDefaultAnalysis(false);
    setFiles(sources);
    await saveImportedSources(sources);
    setData(sources.length ? analyzeImported(sources, appliedDateRange) : sampleData);
    setAnalysisRevision((current) => current + 1);
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
      loadDefaultSources().then((defaultFiles) => {
        setUsingDefaultAnalysis(false);
        setFiles(defaultFiles);
        setAppliedDateRange({ ...selectedRange });
        localStorage.setItem("qms-date-range-v202605", JSON.stringify(selectedRange));
        setData(defaultFiles.length ? analyzeImported(defaultFiles, selectedRange) : sampleData);
        setAnalysisRevision((current) => current + 1);
        setDateRefreshStatus("done");
        setTimeout(() => setDateRefreshStatus("idle"), 1800);
      });
      return;
    }
    setAppliedDateRange({ ...selectedRange });
    localStorage.setItem("qms-date-range-v202605", JSON.stringify(selectedRange));
    setDateRefreshStatus("done");
    setTimeout(() => setDateRefreshStatus("idle"), 1800);
  };
  const saveTemplate = () => {
    localStorage.setItem("qms-quality-template", JSON.stringify({ view, savedAt: Date.now(), data }));
    setSaved(true); setTimeout(() => setSaved(false), 2200);
  };
  const exportData = () => downloadJson(data, `质量分析-${data.period}.json`);

  return <>
    {view === "executive"
      ? <ExecutiveDashboard data={data} files={files} onImport={openImport} onDeleteSource={deleteSource} view={view} onViewChange={setView} dateRange={dateRange} appliedDateRange={appliedDateRange} onDateRange={updateDateRange} onRefreshDate={refreshDateData} dateRefreshStatus={dateRefreshStatus} fontSize={fontSize} onFontSize={setFontSize} analysisKey={analysisRevision} labelControlsVisible={labelControlsVisible} onToggleLabelControls={() => setLabelControlsVisible((current) => !current)} />
      : <WorkspaceDashboard key={`workspace-${analysisRevision}`} data={data} files={files} onImport={() => openImport(null)} view={view} onViewChange={setView} onExport={exportData} onSave={saveTemplate} dateRange={dateRange} appliedDateRange={appliedDateRange} onDateRange={updateDateRange} onRefreshDate={refreshDateData} dateRefreshStatus={dateRefreshStatus} fontSize={fontSize} onFontSize={setFontSize} />}
    <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSourcesChanged={applySources} files={files} dateRange={appliedDateRange} targetModule={importModule} />
    {saved && <div className="toast"><CheckCircle size={19} weight="fill" />当前分析视图已保存为本机模板</div>}
    {sourceNotice && <div className="toast"><Database size={19}/>{sourceNotice}</div>}
  </>;
}
