import { Component, Fragment, Suspense, createContext, lazy, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight, ArrowsClockwise, Bell, CaretDown, ChartBar, ChartPieSlice, CheckCircle,
  ClipboardText, ClockCountdown, Cube, Database, DownloadSimple, Eye, FileXls, FolderOpen,
  FloppyDisk, Funnel, GearSix, Kanban, ListChecks, Pause, Plus, Pulse, Brain, MagnifyingGlass,
  Question, Rows, ShieldCheck, SidebarSimple, Sparkle, Table, Target, Trash,
  UploadSimple, User, Warning, WarningCircle, X,
} from "@phosphor-icons/react";
import { analyzeImported, buildDqaEngineerSupplementSource, buildOqcRuleDimensionDispersions, downloadJson, normalizeIpqcLeaderMapRows, normalizeIpqcWorkshop, parseDqaAgentRawFiles, parseDqaEngineerSupplementFiles, parseFiles, parseOqcProjectNameByRules } from "./dataEngine.js";
import { clearDqaAgentRaw as clearDqaAgentRawState, clearDqaEngineerSupplement as clearDqaEngineerSupplementState, controlKnowledgeDistillationJob, createExamSession, createKnowledgeDocument, createSourcesSignature, createSnapshotJob, deleteKnowledgeDocument, downloadSourceFiles, generateKnowledgeMatches, governKnowledgeDocument, importKnowledgeDistillation, listSnapshotJobs, loadAgentSkills, loadAiConfig, loadAiModels, loadAppliedDateRange, loadCachedAnalysis, loadCurrentUser, loadDqaAgentRaw, loadDefaultAnalysis, loadDefaultAnnotations, loadDefaultQmsSources, loadDefaultSources, loadDistilledKnowledge, loadDqaEngineerSupplement, loadExamResults, loadExamSession, loadImportedSources, loadKnowledgeAuditLogs, loadKnowledgeClauses, loadKnowledgeConflicts, loadKnowledgeConsistency, loadKnowledgeDocuments, loadKnowledgeFeedbackRecords, loadKnowledgeIssues, loadKnowledgeJob, loadKnowledgeJobs, loadKnowledgeMatches, loadKnowledgePerformanceMetrics, loadKnowledgeRecurrences, loadKnowledgeReviewPoints, loadKnowledgeReviewSessions, loadPermissionConfig, loadProjectNameMapping, loadQualityAgentRoleSnapshotRegistry, loadQualityAgentSnapshotRegistry, loadReportQualityRules, loadSnapshotJob, mergeImportedSources, openSnapshotStorage, patchCachedAnalysis, reparseKnowledgeDocument, requestAiChat, reviewDistilledKnowledge, reviewKnowledgeDocument, reviewKnowledgeMatch, runKnowledgePerformanceBenchmark, saveAiConfig, saveAiReport, saveDqaAgentRaw, saveKnowledgeConflict, saveKnowledgeFeedbackRecord, saveKnowledgeRecurrenceAction, saveKnowledgeReviewSession, saveLocalAiReport, saveAppliedDateRange, saveCachedAnalysis, saveDqaEngineerSupplement, saveImportedSources, savePermissionConfig, saveProjectNameMapping, saveQualityAgentRoleSnapshotRegistry, saveQualityAgentSnapshotRegistry, saveReportQualityRules, sourceRowCount, startKnowledgeDistillation, submitExamSession, summarizeSources, syncKnowledgeIssues, testAiConfig, updateKnowledgeDocumentMetadata, updateSnapshotJob, uploadKnowledgeSource, uploadSourceFiles } from "./dataStore.js";
import { bulkReviewKnowledgeCards, bulkUpdateKnowledgeCards, deleteKnowledgeCard, deleteKnowledgeClause, exportKnowledgeData, loadKnowledgeBackups, loadKnowledgeImpact, restoreKnowledgeBackup, updateKnowledgeCard, updateKnowledgeClause } from "./dataStore.js";
import { loadOqcEquipmentRuleCache } from "./dataStore.js";
import { deleteKnowledgeJob } from "./dataStore.js";
import { loadKnowledgeDataQuality, repairKnowledgeDataQuality } from "./dataStore.js";
import { cleanupKnowledgeDataQuality } from "./dataStore.js";
import { mergeKnowledgeCards } from "./dataStore.js";
import { sampleData } from "./sampleData.js";
import { BarCompare, Donut, EquipmentQuantityDistributionPareto, HorizontalRank, MachinedTpmCompareChart, Pareto, QmsDivisionCombo, QmsScoreCompare, QmsTpmRank, QmsTrendCombo, QuantityRateCombo, ReportBarChart, ReportStatusDonut, ScoreMonthlyCombo, ScoreYearCompare, StackedStage, WorkshopCategoryHeatmap, YearStackedCompare } from "./charts.jsx";
import { loadAgentReport, loadAgentReports, loadLocalAgentReport, loadLocalAgentReports } from "./dataStore.js";
import { sanitizeHumanReportContent } from "./reportSanitizer.js";
import { buildQualityAgentSnapshot } from "./agent/qualitySnapshot.js";
import { buildSnapshotPeriods, createDefaultQualitySnapshotRegistry, getQualitySnapshotRulePreview, mergeQualitySnapshotHistory, moduleAnalysisSkillOptions, normalizeQualitySnapshotRegistry, qualitySnapshotPresentationOptions, updateQualitySnapshotRule } from "./agent/snapshotRegistry.js";
import { buildRoleSnapshots, createDefaultRoleSnapshotRegistry, mergeRoleSnapshotRegistry, normalizeRoleSnapshotRegistry, roleSnapshotMappingSignature, roleSnapshotRule, roleSnapshotSourceSignature, updateRoleSnapshotRule } from "./agent/roleSnapshotRegistry.js";
import { DEFAULT_REPORT_QUALITY_RULES, reportQualityAdvice, validateReportQuality } from "./agent/reportQualityRules.js";
import * as XLSX from "xlsx";
import "./qmdp.css";

// Agent pages pull report renderers and role evidence helpers. They are not
// needed for the operational dashboard, so do not parse them on website open.
const QualityAgentPage = lazy(() => import("./agent/QualityAgentPage.jsx").then((module) => ({ default: module.QualityAgentPage })));
const AgentRoleReportPage = lazy(() => import("./agent/AgentRoleReportPage.jsx").then((module) => ({ default: module.AgentRoleReportPage })));
const AgentExamStatsPage = lazy(() => import("./agent/AgentExamStatsPage.jsx").then((module) => ({ default: module.AgentExamStatsPage })));

const moduleIcons = { IQC: Cube, IPQC: Pulse, OQC: ShieldCheck, DQA: ClipboardText, QMS: ListChecks };
const moduleColor = { IQC: "green", IPQC: "blue", OQC: "orange", DQA: "amber", QMS: "purple" };
const isLegacyDqaEngineerSource = (source = {}) => {
  const name = String(source.name || "").toLowerCase();
  return ["dqa_engineer_problems", "dqa_engineer_ecn", "dqa_engineer_non_bom"].includes(source.subKind)
    || name.includes("fpc事业部-研发问题")
    || name.includes("ecn查询导出")
    || name.includes("非bom需求申请表")
    || name.includes("研发评审mp");
};
const UiThemeContext = createContext("classic");
const useUiTheme = () => useContext(UiThemeContext);
class PageErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null, pageKey: props.pageKey }; }
  static getDerivedStateFromError(error) { return { error }; }
  static getDerivedStateFromProps(props, state) { return props.pageKey !== state.pageKey ? { error: null, pageKey: props.pageKey } : null; }
  render() {
    if (!this.state.error) return this.props.children;
    return <section className="qmdp-card qmdp-page-error"><WarningCircle size={30}/><div><strong>当前页面未能完成加载</strong><p>数据或历史缓存格式不完整。可返回总览后重新进入；不会影响已导入数据和已保存报告。</p><small>{String(this.state.error?.message || "未知页面错误").slice(0, 180)}</small></div><button className="qmdp-primary-btn" onClick={this.props.onRecover}>返回总览</button></section>;
  }
}
class SnapshotPanelBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <section className="qmdp-card qmdp-page-error"><WarningCircle size={24}/><div><strong>{this.props.title}未能加载</strong><p>该区域的数据格式异常，已隔离，不影响其它快照功能。</p><small>{String(this.state.error?.message || "未知错误").slice(0, 180)}</small></div></section>;
  }
}
const ANALYSIS_CACHE_VERSION = "server-analysis-cache-v6-equipment-mapping";
const safeParse = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};
const aiEndpointHistoryKey = "qms-ai-endpoint-history-v1";
const normalizeAiEndpointHistory = (items = []) => [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 12);
const formatSyncDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const part = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}`;
};
const defaultFeaturePermissions = {
  dataImport: { public: false, deputy: true, label: "数据导入" },
  workspace: { public: false, deputy: true, label: "质量工作台" },
  annotationEdit: { public: false, deputy: true, label: "分析改善措施" },
  annotationView: { public: false, deputy: true, label: "分析显示" },
  exportReport: { public: true, deputy: true, label: "保存报告" },
  dateTemporaryRefresh: { public: true, deputy: true, label: "临时刷新日期" },
  aiAnalysis: { public: false, deputy: true, label: "AI分析" },
  aiInterface: { public: false, deputy: true, label: "AI接口" },
  qualityAgent: { public: true, deputy: true, label: "质量分析 Agent" },
  qualityAgentStart: { public: false, deputy: false, label: "启动 Agent 分析" },
  agentRoleReportGenerate: { public: false, deputy: false, label: "生成全部角色报告" },
};
const defaultApiPermissions = {
  "POST /api/uploads": { public: false, deputy: true, label: "上传原始Excel" },
  "PUT /api/state/imported-sources": { public: false, deputy: true, label: "保存数据源清单" },
  "PUT /api/state/analysis-cache": { public: false, deputy: true, label: "保存分析结果" },
  "PATCH /api/state/analysis-cache": { public: false, deputy: true, label: "增量更新分析结果" },
  "PUT /api/state/applied-date-range": { public: false, deputy: true, label: "保存默认日期" },
  "PUT /api/state/project-name-mapping": { public: false, deputy: true, label: "保存项目名称映射" },
  "PUT /api/permissions": { public: false, deputy: false, label: "保存权限设置" },
  "GET /api/state/analysis-cache": { public: true, deputy: true, label: "读取分析结果" },
  "GET /api/state/imported-sources": { public: true, deputy: true, label: "读取数据源清单" },
  "GET /api/state/applied-date-range": { public: true, deputy: true, label: "读取默认日期" },
  "GET /api/state/project-name-mapping": { public: true, deputy: true, label: "读取项目名称映射" },
  "GET /api/uploads/*": { public: true, deputy: true, label: "读取原始Excel" },
  "GET /api/exam-results": { public: true, deputy: true, label: "读取知识考试结果" },
  "GET /api/knowledge/*": { public: true, deputy: true, label: "读取知识库" },
  "POST /api/knowledge/*": { public: false, deputy: true, label: "维护知识库" },
  "PUT /api/knowledge/*": { public: false, deputy: true, label: "更新知识任务" },
  "DELETE /api/knowledge/*": { public: false, deputy: true, label: "删除知识文件" },
};
defaultApiPermissions["GET /api/state/oqc-equipment-rule-cache"] = { public: true, deputy: true, label: "OQC equipment rule cache" };
defaultApiPermissions["GET /api/state/quality-agent-runs"] = { public: true, deputy: true, label: "Quality Agent run history" };
defaultApiPermissions["PUT /api/state/quality-agent-runs"] = { public: false, deputy: false, label: "Save Quality Agent run history" };
const normalizePermissionMembers = (items = []) => {
  const byIp = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const ip = String(typeof item === "string" ? item : item?.ip || "").trim();
    if (!ip) return;
    byIp.set(ip, { ip, name: String(typeof item === "string" ? "" : item?.name || "").trim() });
  });
  return [...byIp.values()];
};
const normalizePermissions = (value = {}) => ({
  deputyAdmins: normalizePermissionMembers(value.deputyAdmins),
  ordinaryUsers: normalizePermissionMembers(value.ordinaryUsers),
  allowIntranetUsers: value.allowIntranetUsers === true,
  menus: normalizeMenuPermissions(value.menus),
  features: Object.fromEntries(Object.entries(defaultFeaturePermissions).map(([key, item]) => [key, { ...item, ...(value.features?.[key] || {}), label: item.label }])),
  apis: Object.fromEntries(Object.entries(defaultApiPermissions).map(([key, item]) => [key, { ...item, ...(value.apis?.[key] || {}) }])),
});
const canUseFeature = (auth, permissions, key) => {
  if (!auth?.isAuthorized) return false;
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
  const [saveStage, setSaveStage] = useState({ state: "idle", label: "等待导入" });

  const handleFiles = async (selected) => {
    setBusy(true);
    try {
      setSaveStage({ state: "loading", label: "正在解析 Excel" });
      const selectedFiles = [...selected];
      const parsed = await parseFiles(selectedFiles);
      const valid = targetModule ? parsed.filter((file) => file.module === targetModule) : parsed.filter((file) => file.module !== "UNKNOWN");
      const rejected = parsed.filter((file) => targetModule ? file.module !== targetModule : file.module === "UNKNOWN");
      setSaveStage({ state: "loading", label: "正在上传原始文件" });
      const uploaded = await uploadSourceFiles(valid, selectedFiles);
      const merged = mergeImportedSources(files, uploaded);
      await onSourcesChanged(merged.sources, {
        added: merged.added, replaced: merged.replaced,
        rejected: rejected.map((file) => `${file.name}（识别为${file.module}）`),
      }, setSaveStage);
      setSaveStage({ state: "success", label: "已保存到服务器" });
    } catch {
      setSaveStage({ state: "error", label: "保存失败，请重新导入" });
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
        {(targetModule ? [targetModule] : ["IQC", "IPQC", "OQC", "DQA", "QMS"]).map((name) => {
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
      <div className="modal-foot"><span className={`import-save-state ${saveStage.state}`}>{saveStage.state === "success" ? <CheckCircle size={16} weight="fill"/> : saveStage.state === "error" ? <WarningCircle size={16} weight="fill"/> : <ShieldCheck size={16}/>} {saveStage.label}</span><button className="primary-btn" onClick={onClose} disabled={busy}>{busy ? "请稍候" : "完成导入"}</button></div>
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
const annotationModules = ["\u603b\u89c8", "IQC", "IPQC", "OQC", "DQA", "QMS", "\u6570\u636e\u5bfc\u5165", "\u8d28\u91cf\u5de5\u4f5c\u53f0"];
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
    <div className="annotation-save-bar"><span>{saved ? annotationText.saved : "修改后请点击保存，保存报告会使用已保存内容。"}</span><button onClick={save}><FloppyDisk size={15}/>{annotationText.save}</button></div>
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

function DateRangeFilter({ value, onChange, onRefresh, fontSize, onFontSize, refreshStatus = "idle", refreshProgress, canRefresh = true, teamDefaultRange, lastServerSavedAt }) {
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
    {teamDefaultRange && <div className="team-default-range"><CheckCircle size={14} weight="fill"/><span>统计周期：{teamDefaultRange.start2025}—{teamDefaultRange.end2025} / {teamDefaultRange.start2026}—{teamDefaultRange.end2026}</span>{lastServerSavedAt && <b>服务器保存于 {formatSyncDateTime(lastServerSavedAt)}</b>}</div>}
  </div>;
}

function ServerSyncBadge({ value }) {
  const state = value?.state || "idle";
  return <div className={`server-sync-badge ${state}`} title={value?.detail || "服务器同步状态"}>{state === "saving" ? <ArrowsClockwise size={14}/> : state === "error" ? <WarningCircle size={14} weight="fill"/> : <CheckCircle size={14} weight="fill"/>}<span>{value?.label || "等待服务器同步"}</span></div>;
}

function ThemeToggle({ value, onChange }) {
  return <div className="theme-switcher" aria-label="风格切换">
    <button className={value === "classic" ? "active" : ""} onClick={() => onChange("classic")}>class</button>
    <button className={value === "apple" ? "active" : ""} onClick={() => onChange("apple")}>Apple</button>
  </div>;
}

const qmdpMenuGroups = [
  { label: "质量数据", icon: ChartBar, children: ["总览", "IQC", "IPQC", "OQC", "DQA", "QMS", "数据导入"] },
  { label: "知识管理", icon: Database, children: ["知识库", "题库管理", "知识考试", "后台知识管理"] },
  { label: "质量报告", icon: ChartBar, children: ["IPQC操作报告", "机长报告", "交付经理报告", "供应链经理报告", "研发工程师报告", "PM报告", "TPM报告", "产总报告", "董事长报告", "报告任务中心"] },
  { label: "质量分析 Agent", icon: Brain, children: ["IQC Agent", "IPQC Agent", "OQC Agent", "DQA Agent", "QMS Agent"] },
  { label: "Agent角色报告", icon: ChartBar, children: ["组装人员 Agent报告", "机长 Agent报告", "交付经理 Agent报告", "供应链经理 Agent报告", "研发工程师 Agent报告", "PM Agent报告", "TPM Agent报告", "产总 Agent报告"] },
  { label: "Agent工具", icon: Brain, children: ["Agent考试统计", "报告历史对比"] },
  { label: "系统管理", icon: GearSix, children: ["研发组织映射", "供应链映射", "项目名称映射", "研发项目映射", "后台快照", "Agent配置", "员工信息", "评分权重", "企业微信", "操作日志"] },
];
const menuPermissionDefinitions = [
  ...qmdpMenuGroups.map((group) => ({ key: group.label, children: group.children })),
  { key: "AI分析", children: [] },
  { key: "AI接口", children: [] },
  { key: "权限设置", children: [] },
];
const normalizeMenuPermissions = (value = {}) => Object.fromEntries(menuPermissionDefinitions.map(({ key, children }) => {
  const source = value?.[key] || {};
  const childRules = Object.fromEntries(children.map((child) => [child, { public: true, deputy: true, ...(source.children?.[child] || {}) }]));
  return [key, { public: true, deputy: true, ...source, children: childRules }];
}));
const canUseMenu = (auth, permissions, parent, child = "") => {
  if (auth?.isAdmin) return true;
  const roleKey = auth?.isDeputy ? "deputy" : "public";
  const parentRule = permissions?.menus?.[parent];
  if (parentRule && parentRule[roleKey] === false) return false;
  if (!child) return true;
  const childRule = parentRule?.children?.[child];
  return !childRule || childRule[roleKey] !== false;
};

const qualityAgentMenuModules = { "IQC Agent": "IQC", "IPQC Agent": "IPQC", "OQC Agent": "OQC", "DQA Agent": "DQA", "QMS Agent": "QMS" };
const agentRoleMenuRoles = { "组装人员 Agent报告": "组装人员", "机长 Agent报告": "机长", "交付经理 Agent报告": "交付经理", "供应链经理 Agent报告": "供应链经理", "研发工程师 Agent报告": "研发工程师", "PM Agent报告": "PM", "TPM Agent报告": "TPM", "产总 Agent报告": "产总" };
const qualityAgentMenuItems = Object.keys(qualityAgentMenuModules);
const agentRoleMenuItems = Object.keys(agentRoleMenuRoles);
const agentUtilityMenuItems = ["Agent考试统计"];

const sidebarWidthLimits = { min: 190, max: 360, default: 220 };
const clampSidebarWidth = (value) => Math.min(sidebarWidthLimits.max, Math.max(sidebarWidthLimits.min, Number(value) || sidebarWidthLimits.default));

function ExecutiveSidebar({ active, setActive, uiTheme, onThemeChange, collapsed, onToggleCollapsed, permissions, auth, width, onWidthChange }) {
  const [openGroups, setOpenGroups] = useState(() => {
    const saved = safeParse(localStorage.getItem("qms-qmdp-menu-open-v1"), null);
    return saved && typeof saved === "object" ? saved : { 质量数据: true, 知识管理: true, 质量报告: true, 系统管理: true };
  });
  const [resizing, setResizing] = useState(false);
  useEffect(() => { localStorage.setItem("qms-qmdp-menu-open-v1", JSON.stringify(openGroups)); }, [openGroups]);
  useEffect(() => {
    if (!resizing) return undefined;
    const move = (event) => onWidthChange(clampSidebarWidth(event.clientX));
    const stop = () => setResizing(false);
    document.body.classList.add("sidebar-resizing");
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop, { once: true });
    return () => {
      document.body.classList.remove("sidebar-resizing");
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
    };
  }, [onWidthChange, resizing]);
  const resizeByKeyboard = (event) => {
    if (collapsed) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); onWidthChange(clampSidebarWidth(width - 10)); }
    if (event.key === "ArrowRight") { event.preventDefault(); onWidthChange(clampSidebarWidth(width + 10)); }
    if (event.key === "Home") { event.preventDefault(); onWidthChange(sidebarWidthLimits.min); }
    if (event.key === "End") { event.preventDefault(); onWidthChange(sidebarWidthLimits.max); }
  };
  const groups = qmdpMenuGroups.map((group) => ({
    ...group,
    children: canUseMenu(auth, permissions, group.label) ? group.children.filter((child) => {
      if (!canUseMenu(auth, permissions, group.label, child)) return false;
      if (child === "数据导入") return canUseFeature(auth, permissions, "dataImport");
      if ([...qualityAgentMenuItems, ...agentRoleMenuItems, ...agentUtilityMenuItems].includes(child)) return canUseFeature(auth, permissions, "qualityAgent");
      return true;
    }) : [],
  })).filter((group) => group.children.length);
  const utilityNav = [
    ...(canUseMenu(auth, permissions, "AI分析") && canUseFeature(auth, permissions, "aiAnalysis") ? [["AI分析", Brain]] : []),
    ...(canUseMenu(auth, permissions, "AI接口") && canUseFeature(auth, permissions, "aiInterface") ? [["AI接口", GearSix]] : []),
    ...(auth?.isAdmin && canUseMenu(auth, permissions, "权限设置") ? [["权限设置", GearSix]] : []),
  ];
  return <aside className={`executive-sidebar ${collapsed ? "collapsed" : ""} ${resizing ? "resizing" : ""}`}>
    <div className="brand"><div className="brand-logo"><ShieldCheck size={26} weight="fill" /></div><div><strong>品质智控</strong><span>质量分析平台</span></div></div>
    <nav>
      {utilityNav.map(([name, Icon]) => <button key={name} className={active === name ? "active" : ""} onClick={() => setActive(name)}><Icon size={20} /><span>{name}</span></button>)}
      <div className="qmdp-nav-groups">
        {groups.map((group) => {
          const GroupIcon = group.icon;
          const expanded = openGroups[group.label] !== false;
          const groupActive = group.children.includes(active);
          return <div className={`qmdp-nav-group ${expanded ? "expanded" : ""} ${groupActive ? "has-active" : ""}`} key={group.label}>
            <button className={`qmdp-nav-parent ${groupActive ? "active-parent" : ""}`} onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !expanded }))}>
              <GroupIcon size={19}/><span>{group.label}</span><CaretDown size={14} className={expanded ? "rotate" : ""}/>
            </button>
            {expanded && <div className="qmdp-nav-children">{group.children.map((child) => <button key={child} className={active === child ? "active" : ""} onClick={() => setActive(child)}><span>{child}</span></button>)}</div>}
          </div>;
        })}
      </div>
    </nav>
    <div className="sidebar-bottom"><ThemeToggle value={uiTheme} onChange={onThemeChange}/></div>
    {!collapsed && <div className="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label="调整侧边栏宽度" aria-valuemin={sidebarWidthLimits.min} aria-valuemax={sidebarWidthLimits.max} aria-valuenow={Math.round(width)} tabIndex={0} onPointerDown={(event) => { event.preventDefault(); setResizing(true); }} onKeyDown={resizeByKeyboard} />}
    <button className="sidebar-drawer-toggle" aria-label={collapsed ? "展开导航" : "收起导航"} onClick={onToggleCollapsed}><SidebarSimple size={18} /></button>
  </aside>;
}

const moduleLabels = { IQC: "来料检验", IPQC: "过程检验", OQC: "出货评分", DQA: "研发质量", QMS: "客户满意度" };

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

const aiBaseModules = ["IQC", "IPQC", "OQC", "DQA", "QMS"];
const aiCrossModule = "跨模块分析";
const aiModuleOptions = [...aiBaseModules, aiCrossModule];
const aiSkillOptions = [{ value: "generate-quality-review-report", label: "generate-quality-review-report（质量复盘）" }];
const aiRiskMeta = {
  red: { label: "红色", text: "客户/现场或系统性风险" },
  orange: { label: "橙色", text: "高暴露或可能向后端逃逸" },
  yellow: { label: "黄色", text: "内部重复性过程弱点" },
  blue: { label: "蓝色", text: "局部受控或标杆" },
};
const aiTop = (rows = [], score = (row) => row.count || 0) => [...rows].sort((a, b) => score(b) - score(a))[0] || {};
const aiSum = (rows = [], field) => rows.reduce((total, row) => total + (Number(row?.[field]) || 0), 0);
const aiPercent = (part, total) => total > 0 ? Number((part / total * 100).toFixed(1)) : 0;
const aiRows = (value) => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value).flatMap((item) => Array.isArray(item) ? item : []) : [];

// Keep the AI overview cards on the exact same definitions as the executive overview.
const buildAiOverviewMetricCards = (data) => {
  const sites = ["深圳", "杭州"];
  const iqcRows = sites.flatMap((site) => data.iqc?.siteMonthly?.[site] || []);
  const ipqcRows = sites.flatMap((site) => data.ipqc?.siteMonthly?.[site] || []);
  const iqc25 = yearTotalsFromMonthly(iqcRows, 2025);
  const iqc26 = yearTotalsFromMonthly(iqcRows, 2026);
  const ipqc25 = yearTotalsFromMonthly(ipqcRows, 2025);
  const ipqc26 = yearTotalsFromMonthly(ipqcRows, 2026);
  const oqcDetail = data.oqc?.shipmentDetail?.overall;
  const oqc = oqcDetail?.y2026?.count ? {
    five: oqcDetail.y2026.fiveRate, five25: oqcDetail.y2025.fiveRate,
    low: oqcDetail.y2026.lowRate, count: oqcDetail.y2026.count,
  } : { five: 0, five25: 0, low: 0, count: 0 };
  const dqaRows = data.dqa?.divisions || [];
  const dqaReview = sumRows(dqaRows, (row) => row.review);
  const dqaBack = sumRows(dqaRows, (row) => (row.production || 0) + (row.onsite || 0));
  const dqaStage25 = data.dqa?.yearCompare?.byDivision?.stages || [];
  const dqaBack25FromStages = dqaStage25.reduce((total, row) => {
    const year = row.years?.find((item) => item.year === 2025) || { counts: {} };
    return total + (year.counts?.生产 || 0) + (year.counts?.现场 || 0);
  }, 0);
  const dqaDelta = Number(data.kpis?.[3]?.delta || 0);
  const dqaBack25 = dqaStage25.length
    ? dqaBack25FromStages
    : Math.round((dqaBack || data.kpis?.[3]?.value || 0) / Math.max(1 + dqaDelta / 100, 0.01));
  return {
    IQC: { value: `${rateFromTotals(iqc26, false)}%`, previous: `${rateFromTotals(iqc25, false)}%`, label: "IQC 批次良率", note: `${iqc26.qty.toLocaleString()} 批次/件检验` },
    IPQC: { value: `${rateFromTotals(ipqc26, true)}%`, previous: `${rateFromTotals(ipqc25, true)}%`, label: "IPQC 异常密度", note: `${ipqc26.bad.toLocaleString()} 条问题 / ${ipqc26.qty.toLocaleString()} 件送检` },
    OQC: { value: `${oqc.five}%`, previous: `${oqc.five25}%`, label: "OQC 5分率", note: `低分率 ${oqc.low}% · ${oqc.count.toLocaleString()} 份评分` },
    DQA: { value: `${dqaBack.toLocaleString()}项`, previous: `${dqaBack25.toLocaleString()}项`, label: "DQA 后端问题", note: `生产+现场；评审拦截 ${dqaReview.toLocaleString()} 项` },
  };
};

function buildAiQualityReview(data, module, dateRange) {
  const companyMonthly = (value) => Object.values(value || {}).filter(Array.isArray).sort((a, b) => aiSum(b, "y2026Qty") - aiSum(a, "y2026Qty"))[0] || [];
  const iqcSites = data.iqc?.siteMonthly?.["全公司"] || companyMonthly(data.iqc?.siteMonthly);
  const iqcQty = aiSum(iqcSites, "y2026Qty");
  const iqcBad = aiSum(iqcSites, "y2026Bad");
  const ipqcSites = data.ipqc?.siteMonthly?.["全公司"] || companyMonthly(data.ipqc?.siteMonthly);
  const ipqcQty = aiSum(ipqcSites, "y2026Qty");
  const ipqcIssues = aiSum(ipqcSites, "y2026Bad");
  const oqc = data.oqc?.shipmentDetail?.overall?.y2026 || {};
  const qms = data.qms?.current?.samples ? data.qms.current : [...(data.qms?.periods || [])].filter((item) => item.year === 2026).sort((a, b) => (b.half || 0) - (a.half || 0))[0] || {};
  const dqaDivision = aiTop(data.dqa?.divisions || [], (row) => (row.production || 0) + (row.onsite || 0));
  const dqaTpm = aiTop(data.dqa?.tpmStages || [], (row) => (row.production || 0) + (row.onsite || 0));
  const dqaTheme = aiTop(data.dqa?.categories || [], (row) => (row.production || 0) + (row.onsite || 0) + (row.review || 0));
  const iqcSupplier = aiRows(data.iqc?.mainSuppliers || data.iqc?.suppliers).sort((a, b) => (a.y2026Rate ?? a.y2026 ?? 100) - (b.y2026Rate ?? b.y2026 ?? 100))[0] || {};
  const iqcTheme = aiTop(data.iqc?.categories || [], (row) => (row.shenzhen || 0) + (row.hangzhou || 0) + (row.count || 0));
  const ipqcWorkshop = aiTop(data.ipqc?.workshopsBySite?.["全公司"] || data.ipqc?.workshops || [], (row) => row.y2026Rate || row.issues || 0);
  const ipqcTheme = aiTop(data.ipqc?.rawTypesBySite?.["全公司"] || data.ipqc?.categories || [], (row) => row.y2026Count || row.count || row.shenzhen || 0);
  const oqcTpm = [...(data.oqc?.shipmentDetail?.tpmRows || data.oqc?.tpm || [])].sort((a, b) => (b.y2026LowRate || b.lowRate || 0) - (a.y2026LowRate || a.lowRate || 0))[0] || {};
  const oqcTheme = aiTop(data.oqc?.onsite || [], (row) => row.count || 0);
  const qmsDivision = [...(data.qms?.divisionCompare || [])].sort((a, b) => (b.periods?.p2026h1?.lowRate || 0) - (a.periods?.p2026h1?.lowRate || 0))[0] || {};
  const qmsTpmRows = aiRows(data.qms?.tpmByDivision?.["全公司"] || Object.values(data.qms?.tpmByDivision || {})[0]);
  const qmsTpm = qmsTpmRows.sort((a, b) => (b.periods?.p2026h1?.lowRate || 0) - (a.periods?.p2026h1?.lowRate || 0))[0] || {};
  const qmsSuggestions = (data.qms?.suggestions || []).filter((row) => row.period === "2026年上半年");

  const metricCards = { ...buildAiOverviewMetricCards(data), QMS: { value: `${qms.avg ?? 0}分`, label: "客户满意度", note: `${qms.samples || 0}份有效调查` } };
  const allMetrics = Object.entries(metricCards).map(([key, item]) => ({ key, ...item }));
  const visibleMetrics = module === "公司综合" ? allMetrics : allMetrics.filter((item) => item.key === module);

  const moduleFindings = {
    DQA: { risk: "red", org: dqaDivision.name || "产品部待识别", owner: dqaTpm.name || "TPM待识别", mechanism: dqaTheme.name || "设计/发布问题", conclusion: `生产与现场后端问题集中在${dqaDivision.name || "重点产品部"}，${dqaTpm.name || "重点TPM"}项目组合需要优先前移门禁。`, action: "把高频问题写入TR3/TR5证据门，重复问题必须完成跨项目横展和三批/三项目验证。" },
    IQC: { risk: "red", org: iqcSupplier.site || "深圳/杭州基地", owner: iqcSupplier.supplier || "重点供应商", mechanism: iqcTheme.name || "尺寸/公差", conclusion: `${iqcTheme.name || "尺寸/公差"}是主要来料机制，低表现供应商/物料组合需要按数量口径而非问题条数评价。`, action: "建立关键尺寸清单、首件全尺寸、量具一致性与Cpk门禁；SCAR以连续三批验证解除。" },
    IPQC: { risk: "orange", org: ipqcWorkshop.site || "重点基地", owner: ipqcWorkshop.name || "重点工坊/交付经理", mechanism: ipqcTheme.name || "装配/接线", conclusion: `${ipqcWorkshop.name || "高风险工坊"}的过程暴露较高，问题记录条数与不良件数必须分开管理。`, action: "按工坊与交付经理建立首件、标准作业、外包同责和重复问题日清机制。" },
    OQC: { risk: "red", org: oqcTpm.division || "重点产品部/事业部", owner: oqcTpm.name || "重点TPM", mechanism: oqcTheme.name || "功能/测试/稳定性", conclusion: `现场问题以${oqcTheme.name || "功能/测试/稳定性"}为首要流出风险，评分改善不能替代客户现场可靠性。`, action: "建立功能边界工况、老化/连续运行和测试证据门；低分设备逐台联合评审。" },
    QMS: { risk: "orange", org: qmsDivision.name || "重点事业部", owner: qmsTpm.name || "重点TPM", mechanism: "客户意见闭环/设计软件/交付响应", conclusion: `${qmsSuggestions.length || "现有"}项客户意见需独立于平均分管理，重点识别重复意见、关系风险和客户确认关闭。`, action: "建立VOC台账，关联产品部和TPM，记录严重度、承诺日期、关闭证据及客户确认。" },
  };
  const visibleFindings = module === "公司综合" ? Object.entries(moduleFindings) : [[module, moduleFindings[module]]];
  const commonThemes = [
    { name: "设计与接口完整性", stages: ["DQA", "IPQC", "OQC", "QMS"], evidence: "共同主题假设", text: "设计/3D/软件/接口问题在研发、装配、出货及客户意见中重复出现，需要用项目或SN进一步验证同源关系。" },
    { name: "装配与连接可靠性", stages: ["IQC", "IPQC", "OQC"], evidence: "机制集中", text: "尺寸、装配、螺丝、接线及结构干涉构成连续质量链，应建立统一关键特性和放行证据。" },
    { name: "问题闭环与反馈", stages: ["DQA", "OQC", "QMS"], evidence: "客户声音", text: "重复问题、FACA/8D质量和改善状态反馈决定客户对闭环有效性的信任。" },
  ];
  const actions = visibleFindings.map(([key, item], index) => ({
    id: `AI-${String(index + 1).padStart(2, "0")}`,
    module: key,
    risk: item.risk,
    owner: item.owner,
    due: "30/60/90天",
    deliverable: item.action,
    leading: "门禁证据完整率≥98%",
    lagging: item.risk === "red" ? "核心问题月均下降30%" : "重复问题下降30%",
    release: "连续三批/三项目达标并完成有效性复核",
  }));
  const confidence = (!iqcQty || !ipqcQty || !oqc.count || !qms.samples) ? "B" : "A";
  return {
    generatedAt: new Date().toISOString(), module, confidence,
    period: `${dateRange.start2025}—${dateRange.end2025} / ${dateRange.start2026}—${dateRange.end2026}`,
    metrics: visibleMetrics, findings: visibleFindings, commonThemes, actions,
    audit: [
      { label: "指标口径", pass: true, detail: "结果指标与问题暴露量分开呈现" },
      { label: "三级责任", pass: visibleFindings.every(([, item]) => item.org && item.owner), detail: "结果责任—过程责任—执行责任" },
      { label: "根因证据", pass: true, detail: "跨模块关联标记为假设，需标识符验证" },
      { label: "客户意见", pass: true, detail: "独立于满意度分数分析" },
      { label: "发布门禁", pass: confidence === "A", detail: confidence === "A" ? "关键模块数据完整" : "部分指标缺少有效分母或字段" },
    ],
  };
}

const approvedAiReports = {
  DQA: {
    confidence: "B", source: "2026年上半年DQA质量复盘报告-三级改善行动版.docx",
    metric: { value: "5,129条", label: "有效研发问题", note: "同比增加64.7%；生产+现场占75.0%" },
    findings: [
      { risk: "red", mechanism: "产品五部现场逃逸压降", org: "产品五部", owner: "产品五部负责人/郑昊翔、谢作林、周超", conclusion: "产品五部问题由374增至1,424，现场由136增至657；贡献公司问题增量52.1%。ECN率下降但ECN绝对量反增7.4%，不能只看比例改善。", action: "建立红色战情室，回溯设计、程序、BOM/资料和首台验证门禁；8月底形成项目级关闭证据，Q4现场月均下降40%。" },
      { risk: "red", mechanism: "机械设计与设计输出一次正确率", org: "研发体系", owner: "研发体系负责人/机械技术委员会", conclusion: "设计、结构干涉、尺寸、3D、孔位、选型、BOM和资料构成主要问题群；ME与测试ME约占69.7%。", action: "发布机械设计Top 30规则，强制3D干涉、公差孔位、维修空间、选型及BOM/图纸/3D一致性证据；Q4相关问题月均下降30%。" },
      { risk: "red", mechanism: "程序与控制逻辑验证门禁", org: "软件/控制体系", owner: "软件/控制负责人", conclusion: "程序问题749条，为第二大类别；高风险项目组合集中，需求—用例—版本—回归证据不足会使问题在联调和现场暴露。", action: "建立软件/PLC最小验证包和ECN跨专业影响清单；9月作为放行必备证据，Q4程序类现场问题下降30%。" },
    ],
  },
  IQC: {
    confidence: "B", source: "2026年上半年IQC质量复盘报告-三级改善行动版.docx",
    metric: { value: "95.42%", label: "数量合格率", note: "检验78,762件，不良3,611件" },
    findings: [
      { risk: "red", mechanism: "尺寸/公差过程能力提升", org: "公司/SQE", owner: "SQE及重点供应商", conclusion: "2026年尺寸/公差问题1,932条，占两基地问题约54.8%，是绝对第一大问题。", action: "对贡献80%的供应商/物料实施关键尺寸清单、首件全尺寸、量具一致性和Cpk验证；Q4尺寸问题月均较Q2下降30%。" },
      { risk: "red", mechanism: "深圳回落与高风险物料", org: "深圳基地", owner: "深圳IQC/SQE", conclusion: "深圳H1合格率95.70%，但6月降至93.9%；铜件85.3%、载板89.6%、底板90.0%、PAI针模92.1%。", action: "铜件、非金属/针模和底板实施专项检验与供应商过程审核；9月铜件合格率≥92%，深圳连续三个月≥95%。" },
      { risk: "red", mechanism: "专项项目供应链质量门禁", org: "重点项目组合", owner: "项目负责人+SQE", conclusion: "Handler 76.2%、新加坡52.9%、折弯18.2%、IMU 60.9%，显著低于常规来料。", action: "建立供应商准入、首件认可、关键特性和加严检验；折弯/新加坡立即红色管控，Q4各项目合格率提升至少15个百分点。" },
    ],
  },
  IPQC: {
    confidence: "A", source: "2026年上半年IPQC质量复盘报告-三级改善行动版.docx",
    metric: { value: "3.15%", label: "不良件率", note: "送检60,336件，不良1,901件；软件问题记录2,852条" },
    findings: [
      { risk: "red", mechanism: "装配纪律与首件门禁", org: "公司/制造质量", owner: "制造质量负责人", conclusion: "装配问题649件、螺丝问题207件，合计856件，占公司不良件45.0%。", action: "统一装配关键点、扭矩/防错记录和首件签核；9月底装配+螺丝不良月均较Q2下降30%，证据完整率≥98%。" },
      { risk: "orange", mechanism: "连接可靠性与设计接口", org: "产品部+制造", owner: "产品部及制造负责人", conclusion: "接线327件、3D问题179件、设计问题174件，合计680件，占35.8%。", action: "建立接线红线检查和DQA—IPQC联合评审；Q4连接/设计类不良月均下降30%，重复问题为0。" },
      { risk: "red", mechanism: "外包过程同责管理", org: "深圳/杭州基地", owner: "对应交付经理", conclusion: "深圳二外包14.29%、杭州一外包9.39%、深圳五外包7.83%，均显著高于公司3.15%。", action: "外包工坊并入交付经理KPI，执行首件、巡检和连续三批解除加严；9月底各外包工坊≤5%。" },
    ],
  },
  OQC: {
    confidence: "B", source: "2026年上半年OQC质量复盘报告-三级改善行动版.docx",
    metric: { value: "4.59分", label: "出货平均评分", note: "评价1,011台；5分率67.2%，低分率7.1%" },
    findings: [
      { risk: "red", mechanism: "功能与稳定性放行门禁", org: "公司/OQC", owner: "OQC负责人", conclusion: "客户现场功能/测试/稳定性问题154条，占现场问题28.3%，是绝对第一类。", action: "建立产品族功能清单、边界工况、连续运行/老化和测试数据证据；9月底现场功能类问题月均较Q2下降30%。" },
      { risk: "orange", mechanism: "结构、电气、装配综合门禁", org: "制造+OQC", owner: "制造与OQC负责人", conclusion: "针模/探针/排线47条、机械结构/干涉45条、电气接线36条、装配紧固36条，合计164条，占30.1%。", action: "合并为结构与连接可靠性清单，关键点照片/数据留证；Q4四类现场问题合计下降30%，重复问题为0。" },
      { risk: "orange", mechanism: "低分设备升级评审", org: "产品部/事业部", owner: "质量总监办公室+TPM", conclusion: "2026仍有72台低分设备，占7.1%；FPC低分率9.1%、产品五部6.7%。", action: "≤3分设备由TPM、制造、OQC联合评审；低分100%闭环，Q4公司低分率≤5%。" },
    ],
  },
  QMS: {
    confidence: "C", source: "2026年上半年QMS客户满意度与客户意见复盘报告-三级改善行动版.docx",
    metric: { value: "4.5分", label: "客户满意度", note: "37份调查；高分率59.5%，低分率2.7%，有效意见25项" },
    findings: [
      { risk: "red", mechanism: "客户意见闭环机制", org: "公司/QMS", owner: "QMS负责人", conclusion: "闭环/变更沟通主题11次，涉及FACA、变更提前同步、改善状态反馈、重大异常台账和重复问题复盘。", action: "7月底完成25项VOC建账；9月底有效意见闭环率100%、逾期<10%、重复意见为0。" },
      { risk: "red", mechanism: "设计/软件/DFx与可靠性", org: "产品部", owner: "产品部负责人", conclusion: "设计/软件/DFx主题13次、质量/可靠性8次，涉及通讯/探针DFx、软件漏洞、治具卡滞、尺寸偏移和机械寿命。", action: "DQA—OQC—售后联合分类；Q4重复设计/软件/可靠性意见下降50%，重大问题横展率100%。" },
      { risk: "orange", mechanism: "交付与售后能力保障", org: "交付+售后", owner: "交付与售后负责人", conclusion: "交付/计划7次、售后/响应7次，客户要求交付基准、专家支援、熟手配置、快速响应和培训。", action: "建立资源模型、Buyoff基准和专家升级通道；Q4计划节点达成率≥95%、重大异常2小时响应。" },
    ],
  },
};

function buildApprovedAiReview(module, data) {
  const modules = module === "公司综合" ? Object.keys(approvedAiReports) : [module];
  const selected = modules.map((key) => [key, approvedAiReports[key]]).filter(([, report]) => report);
  const findings = selected.flatMap(([key, report]) => report.findings.map((item) => [key, item]));
  const confidenceOrder = { A: 1, B: 2, C: 3, D: 4 };
  const confidence = selected.reduce((grade, [, report]) => confidenceOrder[report.confidence] > confidenceOrder[grade] ? report.confidence : grade, "A");
  const liveMetrics = data ? { ...buildAiOverviewMetricCards(data), QMS: (() => {
    const current = data.qms?.current?.samples ? data.qms.current : [...(data.qms?.periods || [])].filter((item) => item.year === 2026).sort((a, b) => (b.half || 0) - (a.half || 0))[0] || {};
    return { value: `${current.avg ?? 0}分`, label: "客户满意度", note: `${current.samples || 0}份有效调查` };
  })() } : null;
  return {
    module, confidence, approved: true, period: "2025-01-01—2025-06-30 / 2026-01-01—2026-06-30",
    metrics: selected.map(([key, report]) => ({ key, ...(liveMetrics?.[key] || report.metric) })), findings,
    commonThemes: [
      { name: "设计与接口完整性", stages: ["DQA", "IPQC", "OQC", "QMS"], evidence: "跨报告共同主题假设", text: "正式报告共同指向设计/3D/软件/接口问题；需用项目、批次或SN验证同源关系后才能认定跨阶段逃逸。" },
      { name: "装配与连接可靠性", stages: ["IQC", "IPQC", "OQC"], evidence: "跨报告机制集中", text: "尺寸、公差、装配、螺丝、接线和结构干涉构成连续质量链，应建立统一关键特性和放行证据。" },
      { name: "问题闭环与客户反馈", stages: ["DQA", "OQC", "QMS"], evidence: "客户声音", text: "重复问题、FACA/8D质量和改善状态反馈决定客户对闭环有效性的信任。" },
    ],
    actions: findings.map(([key, item], index) => ({ id: `AR-${String(index + 1).padStart(2, "0")}`, module: key, risk: item.risk, owner: item.owner, deliverable: item.action, leading: "责任/期限/证据完整率100%", lagging: item.risk === "red" ? "核心风险按报告目标压降" : "重复问题持续下降", release: "达到报告量化目标并完成有效性复核" })),
    audit: [
      { label: "报告来源", pass: true, detail: selected.map(([, report]) => report.source).join("；") },
      { label: "指标口径", pass: true, detail: "沿用正式报告审计后的分子、分母和限制" },
      { label: "责任与行动", pass: true, detail: "沿用正式报告三级责任和量化待办" },
      { label: "数据更新", pass: false, detail: "当前展示为审核版；源数据更新后必须重新生成正式分析" },
    ],
  };
}

const aiGeneratedStorageKey = "qms-ai-generated-module-reviews-v1";
const compactAiValue = (value, depth = 0, limits = { arrayLimit: 40, keyLimit: 45 }) => {
  if (depth > 5 || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, limits.arrayLimit).map((item) => compactAiValue(item, depth + 1, limits));
  return Object.fromEntries(Object.entries(value).filter(([key]) => !["rawRows", "rows", "files"].includes(key)).slice(0, limits.keyLimit).map(([key, item]) => [key, compactAiValue(item, depth + 1, limits)]));
};
const boundedAiJson = (value, maxChars = 70000) => {
  const raw = JSON.stringify(value);
  if (raw.length <= maxChars) return raw;
  const compact = JSON.stringify(compactAiValue(value, 0, { arrayLimit: 16, keyLimit: 24 }));
  if (compact.length <= maxChars) return `${compact}\n[数据已按字段和行数压缩，未改变统计口径]`;
  return `${compact.slice(0, Math.max(1000, maxChars - 80))}\n[数据已截断，禁止据此推断未提供的数字]`;
};
const readAiReportFile = async (file) => {
  if (!/\.docx$/i.test(file.name)) return await file.text();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("无法读取DOCX压缩包");
  const entries = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  let cursor = centralOffset;
  let documentEntry = null;
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength));
    if (name === "word/document.xml") documentEntry = { method, compressedSize, localHeaderOffset };
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  if (!documentEntry) throw new Error("DOCX中未找到正文内容");
  const local = documentEntry.localHeaderOffset;
  const localNameLength = view.getUint16(local + 26, true);
  const localExtraLength = view.getUint16(local + 28, true);
  const compressed = bytes.slice(local + 30 + localNameLength + localExtraLength, local + 30 + localNameLength + localExtraLength + documentEntry.compressedSize);
  const xmlBytes = documentEntry.method === 0
    ? compressed
    : new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), "application/xml");
  const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const body = xml.getElementsByTagNameNS(namespace, "body")[0];
  const blocks = [...(body?.children || [])].flatMap((block) => {
    if (block.localName === "p") {
      const text = [...block.getElementsByTagNameNS(namespace, "t")].map((item) => item.textContent || "").join("").trim();
      if (!text) return [];
      const style = block.getElementsByTagNameNS(namespace, "pStyle")[0]?.getAttributeNS(namespace, "val") || "";
      const heading = style.match(/Heading([1-6])/i);
      return [heading ? `${"#".repeat(Number(heading[1]))} ${text}` : text];
    }
    if (block.localName === "tbl") {
      return [...block.getElementsByTagNameNS(namespace, "tr")].map((row) => {
        const cells = [...row.getElementsByTagNameNS(namespace, "tc")].map((cell) => [...cell.getElementsByTagNameNS(namespace, "t")].map((item) => item.textContent || "").join(" ").trim());
        return cells.length ? `| ${cells.join(" | ")} |` : "";
      }).filter(Boolean);
    }
    return [];
  });
  return blocks.join("\n").trim() || xml.documentElement?.textContent?.trim() || "";
};
const splitImportedReportSections = (content = "") => {
  const sections = [];
  let current = { title: "报告内容", lines: [] };
  String(content).replace(/\r/g, "").split("\n").forEach((line) => {
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      if (current.lines.some((item) => item.trim())) sections.push(current);
      current = { title: heading[2], level: heading[1].length, lines: [] };
    } else current.lines.push(line);
  });
  if (current.lines.some((item) => item.trim()) || !sections.length) sections.push(current);
  return sections;
};
const sanitizeAiReportContent = (content = "") => sanitizeHumanReportContent(content);
const renderReportInline = (value = "") => {
  const parts = String(value).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : <Fragment key={index}>{part}</Fragment>);
};
const reportRiskClass = (value = "") => /红色|高风险|严重/.test(String(value)) ? "risk-red" : /橙色|中高风险|系统性/.test(String(value)) ? "risk-orange" : /黄色|中风险|重复/.test(String(value)) ? "risk-yellow" : /蓝色|低风险|已受控|局部/.test(String(value)) ? "risk-blue" : "";
const reportPointClass = (value = "") => {
  const text = String(value).replace(/\*/g, "");
  if (/^分析结论\s*[:：]?/.test(text)) return "point-conclusion";
  if (/^风险判断\s*[:：]?/.test(text)) return "point-risk";
  if (/^改善措施\s*[:：]?/.test(text)) return "point-improvement";
  if (/^待办事项\s*[:：]?/.test(text)) return "point-action";
  if (/^(待验证假设|已验证根因)\s*[:：]?/.test(text)) return "point-root-cause";
  return "";
};
function ImportedReportViewer({ content }) {
  const sections = useMemo(() => splitImportedReportSections(sanitizeAiReportContent(content)), [content]);
  return <div className="ai-imported-report-viewer">{sections.map((section, sectionIndex) => {
    const lines = section.lines;
    const rows = lines.filter((line) => /^\s*\|/.test(line) && !/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line));
    const nonTableLines = lines.filter((line) => !/^\s*\|/.test(line));
    const sectionTitle = String(section.title || "").trim();
    const riskClass = reportRiskClass(sectionTitle) || (/客户|逃逸/.test(sectionTitle) ? "risk-red" : /行动|待办|措施/.test(sectionTitle) ? "action" : "");
    return <section className={`ai-imported-section level-${section.level || 1} ${riskClass}`} key={`${section.title}-${sectionIndex}`}><h4>{renderReportInline(sectionTitle)}</h4>{rows.length > 0 && <div className="ai-imported-table">{rows.map((line, index) => { const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()); const rowText = cells.join(" "); const rowRisk = reportRiskClass(rowText); const pointClass = reportPointClass(cells[0]); const titleRow = cells.length === 1 || (!pointClass && /红色|橙色|黄色|蓝色|高风险|中高风险|中风险/.test(rowText) && rowText.length < 120); const rowClass = `${titleRow ? "title-row" : index === 0 ? "head" : ""} ${rowRisk} ${pointClass}`; return <div className={`ai-imported-table-row ${rowClass}`} style={{ gridTemplateColumns: `repeat(${Math.max(cells.length, 1)}, minmax(0, 1fr))` }} key={index}>{titleRow ? <span className="report-title-cell" style={{ gridColumn: "1 / -1" }}>{renderReportInline(cells.join(" | "))}</span> : cells.map((cell, cellIndex) => <span className={pointClass ? cellIndex === 0 ? "point-label" : "point-value" : ""} key={cellIndex}>{renderReportInline(cell)}</span>)}</div>; })}</div>}{nonTableLines.map((line, index) => { const trimmed = line.trim(); if (!trimmed) return <div className="ai-imported-spacer" key={index}/>; if (/^(?:[-*]|\d+[.)])\s+/.test(trimmed)) return <p className="ai-imported-bullet" key={index}>{renderReportInline(trimmed.replace(/^(?:[-*]|\d+[.)])\s+/, ""))}</p>; const pointText = trimmed.replace(/\*\*/g, ""); const pointClass = reportPointClass(pointText); const paragraphClass = pointClass ? `key-point ${pointClass} ${reportRiskClass(pointText)}` : reportRiskClass(pointText) ? `key-point ${reportRiskClass(pointText)}` : /^(战役|重点|问题|主题|行动|风险)/.test(pointText) ? `report-inline-title ${reportRiskClass(pointText)}` : ""; return <p className={paragraphClass} key={index}>{renderReportInline(trimmed)}</p>; })}</section>;
  })}</div>;
}
const buildAiModuleData = (data, module, dateRange) => {
  const source = data?.[module.toLowerCase()] || {};
  const selected = module === "IQC" ? {
    siteMonthly: source.siteMonthly, mainSuppliers: source.mainSuppliers, categories: source.categories,
    projects: source.projects, workshops: source.workshops, supplierTypes: source.supplierTypes,
  } : module === "IPQC" ? {
    siteMonthly: source.siteMonthly, workshopsBySite: source.workshopsBySite, rawTypesBySite: source.rawTypesBySite,
    contentTypesBySite: source.contentTypesBySite, outsourcingBySite: source.outsourcingBySite,
    leaderAnalysis: source.leaderAnalysis?.bySite,
  } : module === "OQC" ? {
    monthlySummary: source.monthlySummary, tpm: source.tpm, onsite: source.onsite,
    shipmentOverall: source.shipmentDetail?.overall, divisionRows: source.shipmentDetail?.divisionRows,
    tpmRows: source.shipmentDetail?.tpmRows, scoreStructureRows: source.shipmentDetail?.scoreStructureRows,
  } : module === "DQA" ? {
    divisions: source.divisions, tpmStages: source.tpmStages, categories: source.categories,
    disciplines: source.disciplines, yearCompare: source.yearCompare, ecn: source.ecn, machinedParts: source.machinedParts,
  } : {
    periods: source.periods, current: source.current, base: source.base, divisionCompare: source.divisionCompare,
    tpmByDivision: source.tpmByDivision, completeDimensions: source.completeDimensions,
    risks: source.risks, customerOpinions: source.suggestions,
  };
  const prepared = compactAiValue(selected, 0, { arrayLimit: 10, keyLimit: 24 });
  return {
    module,
    period: dateRange,
    source: "QMS analytics cache",
    sourceDescription: "仅使用项目已完成的统计、趋势、Pareto、责任层级和客户意见摘要；不包含原始明细行、上传文件或 rawRows。",
    dataScope: {
      includes: ["result metrics", "process/exposure metrics", "organizational Pareto", "mechanism/category Pareto", "responsibility dimensions", "customer voice summary when available"],
      excludes: ["rawRows", "rows", "files", "original upload records"],
    },
    data: prepared,
  };
};
const buildLocalAiAudit = (data, module, dateRange, payload) => {
  const overview = buildAiOverviewMetricCards(data);
  const currentQms = data.qms?.current?.samples ? data.qms.current : [...(data.qms?.periods || [])].filter((item) => item.year === 2026).sort((a, b) => (b.half || 0) - (a.half || 0))[0] || {};
  const metrics = { ...overview, QMS: { value: `${currentQms.avg ?? 0}分`, previous: "-", label: "QMS客户满意度", note: `${currentQms.samples || 0}份有效调查` } };
  const selectedMetrics = module === "公司综合" ? metrics : { [module]: metrics[module] };
  const metricLines = Object.entries(selectedMetrics).map(([key, item]) => `- ${key}｜结果指标：${item?.label || "待识别"}｜本期：${item?.value || "-"}｜对比期：${item?.previous || "-"}｜说明：${item?.note || "-"}`).join("\n");
  const dimensions = Object.keys(payload?.data || {}).filter((key) => payload.data[key] != null).join("、") || "无可用分析维度";
  const denominatorNotes = module === "IQC" ? "批次/件检验量作为分母，问题数量作为暴露量。" : module === "IPQC" ? "送检件数作为分母，不良件数与问题记录分开。" : module === "OQC" ? "出货评分数量作为分母，5分率与平均分分开。" : module === "DQA" ? "生产+现场问题为后端暴露量，评审拦截单独统计。" : "有效问卷作为满意度分母，客户意见条数不替代满意度。";
  const confidence = Object.values(selectedMetrics).every((item) => item?.value && item.value !== "0%") ? "A" : "B";
  return `# 数据审计与口径（本地QMS统计引擎）
## 审计范围
- 模块：${module}
- 统计周期：2025同期 ${dateRange.start2025}—${dateRange.end2025}；2026本期 ${dateRange.start2026}—${dateRange.end2026}
- 输入来源：QMS analytics cache；未读取原始上传明细、rawRows或文件对象
- 已整理维度：${dimensions}

## 指标字典与结果
${metricLines}
- 口径纪律：${denominatorNotes}

## 数据质量与可信度
- 数据可信度：${confidence}（本地缓存已完成字段整理；跨文件指纹、重复行和原始缓存差异需以导入审计记录补充）
- 排除项：原始明细行、上传文件内容、无法从缓存复算的字段不参与结论。
- 解释限制：问题记录/意见条数是暴露量，不自动等同于不良件数；缺少有效分母时只做风险信号。

## 责任链
- 结果责任：公司/模块总体负责人
- 过程责任：${module === "IQC" ? "基地与供应商/物料族" : module === "IPQC" ? "基地与工坊/交付经理" : module === "OQC" ? "产品部/事业部与OQC" : module === "DQA" ? "产品部与研发流程" : "产品部/QMS客户意见闭环"}
- 执行责任：${module === "IQC" ? "SQE、供应商质量角色" : module === "IPQC" ? "工坊、交付经理、站点责任角色" : module === "OQC" ? "TPM、OQC与制造责任角色" : module === "DQA" ? "TPM/项目组合负责人" : "QMS、TPM与客户接口角色"}

## 审计结论
本阶段已由本地统计引擎完成，后续AI只需基于以上整理后的指标、趋势、Pareto和责任维度开展双重二八、根因假设、改善措施和行动台账分析。`;
};
const localParetoScore = (row = {}) => {
  const preferred = ["count", "issues", "production", "onsite", "y2026Bad", "y2026Count", "total", "samples"];
  const direct = preferred.reduce((sum, key) => sum + (Number(row[key]) || 0), 0);
  if (direct) return direct;
  return Object.entries(row).reduce((sum, [key, value]) => sum + (/count|qty|bad|issue|total|number/i.test(key) && Number.isFinite(Number(value)) ? Number(value) : 0), 0);
};
const localParetoLabel = (row = {}) => String(row.name || row.supplier || row.workshop || row.division || row.category || row.project || row.site || row.type || "未分类");
const localParetoRows = (value) => aiRows(value).filter((row) => row && typeof row === "object");
const normalizeLocalMechanism = (label) => {
  const text = String(label || "");
  if (/尺寸|公差|孔位|干涉/.test(text)) return "尺寸/公差/结构接口";
  if (/装配|螺丝|接线|连接|线束/.test(text)) return "装配与连接可靠性";
  if (/软件|程序|控制|逻辑|通讯/.test(text)) return "软件/控制验证";
  if (/功能|测试|稳定|老化/.test(text)) return "功能与稳定性放行";
  if (/资料|图纸|BOM|版本|设计/.test(text)) return "设计资料与发布";
  return text || "其他机制";
};
const buildLocalAiPareto = (data, module, auditContent) => {
  const source = data?.[module.toLowerCase()] || {};
  const organizationalSources = module === "DQA" ? [source.divisions, source.tpmStages] : module === "IQC" ? [source.mainSuppliers, source.projects] : module === "IPQC" ? [source.workshopsBySite, source.outsourcingBySite] : module === "OQC" ? [source.shipmentDetail?.divisionRows, source.shipmentDetail?.tpmRows] : [source.divisionCompare, source.tpmByDivision];
  const organizationRows = organizationalSources.flatMap((value) => localParetoRows(value));
  const mechanismSources = module === "DQA" ? [source.categories, source.disciplines] : module === "IQC" ? [source.categories, source.materialBySite] : module === "IPQC" ? [source.rawTypesBySite, source.contentTypesBySite] : module === "OQC" ? [source.onsite, source.scoreStructureRows] : [source.risks, source.suggestions];
  const mechanismRows = mechanismSources.flatMap((value) => localParetoRows(value));
  const summarize = (rows, labeler = localParetoLabel) => {
    const grouped = new Map();
    rows.forEach((row) => { const label = labeler(row); const score = localParetoScore(row); if (!grouped.has(label)) grouped.set(label, 0); grouped.set(label, grouped.get(label) + score); });
    const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]).filter(([, score]) => score > 0).slice(0, 8);
    const total = sorted.reduce((sum, [, score]) => sum + score, 0);
    return sorted.map(([label, score], index) => `${index + 1}. ${label}：${score.toLocaleString()}（${total ? (score / total * 100).toFixed(1) : "0.0"}%）`).join("\n") || "暂无可用Pareto分组";
  };
  const mechanismText = summarize(mechanismRows, (row) => normalizeLocalMechanism(localParetoLabel(row)));
  return `# 双重二八与根因证据（本地QMS统计引擎）
## 组织集中度Pareto
${summarize(organizationRows)}

## 失效机制集中度Pareto（已合并同义项）
${mechanismText}

## 交叉判断
- 组织Pareto用于定位结果责任，机制Pareto用于定位过程失效；两者交叉后再选择公司级战役。
- 上述集中度属于“数据信号”，不是已验证根因；不得仅凭排名确认因果。
- 根因验证要求：责任角色通过抽样复核、5Why、重现试验、能力证据或连续三批有效性验证完成确认。

## 上一步审计摘要
${String(auditContent || "").slice(0, 7000)}

本阶段已由本地统计引擎完成，AI后续只需针对Pareto交叉结果形成三级责任、改善措施和行动台账。`;
};
const aiSkillPrompt = (module, dateRange, payload, skillName) => `你是公司质量总监。请严格按照 ${skillName} SKILL 分析 ${module} 板块。

统计周期：2025同期 ${dateRange.start2025}—${dateRange.end2025}；2026本期 ${dateRange.start2026}—${dateRange.end2026}。

必须遵守：
1. 先说明指标口径和数据可信度A/B/C/D，区分结果指标、问题暴露量和业务影响，不混淆问题条数与不良件数。
2. 做两次二八分析：组织集中度、失效机制集中度，再交叉形成不超过3项公司级战役。
3. 按该模块真实责任链做三级分析：公司→部门/基地→TPM/供应商/工坊或交付经理。
4. 根因必须标记为“数据信号”“待验证假设”或“已验证根因”，没有证据不得写成已验证。
5. 每个主题按“分析结论—风险判断—改善措施—待办事项”输出。
6. 每项待办必须包含责任角色、期限、交付物、领先指标、结果指标、解除条件和升级规则。
7. ${module === "QMS" ? "必须单独分析客户意见原文的主题、严重度、重复性、责任归属和关闭证据，不能用平均分替代客户声音。" : "不要引用其他模块数据，不做未经标识符验证的跨模块因果推断。"}
8. 不编造数据；缺少分母时只能写风险暴露量，不能做绩效排名。

请用中文Markdown输出以下章节：
# 质量复盘摘要
## 数据口径与可信度
## 公司级三项重点战役
## 第二层责任分析
## 第三层责任分析
## 30/60/90天行动台账
## 数据限制与待验证事项

当前模块结构化数据：
${JSON.stringify(payload)}`;

const aiWorkflowVersion = "quality-review-workflow-v2";
const aiWorkflowStages = [
  { id: "audit", label: "数据审计与口径", maxTokens: 900 },
  { id: "pareto", label: "双重二八与根因证据", maxTokens: 1400 },
  { id: "actions", label: "三级责任与行动台账", maxTokens: 1900 },
  { id: "report", label: "正式复盘报告", maxTokens: 3600 },
];
const aiCrossWorkflowStages = [
  { id: "chainAudit", label: "关联证据审计", maxTokens: 2600 },
  { id: "crossActions", label: "质量链与公司战役", maxTokens: 3600 },
  { id: "crossReport", label: "跨模块正式报告", maxTokens: 6000 },
];
const aiModuleResponsibility = {
  DQA: "公司→产品部→TPM/项目组合负责人",
  IQC: "公司→深圳/杭州基地→供应商/物料族责任角色",
  IPQC: "公司→深圳/杭州基地→工坊/交付经理",
  OQC: "公司→产品部/事业部→TPM/项目负责人",
  QMS: "公司→产品部/事业部→TPM/客户意见闭环责任角色",
};
const aiStageSystemPrompt = "你是严谨的制造业质量总监。只能使用本次提供的数据和上一步产物；禁止编造数字、项目、批次、SN、责任人或因果关系。输出中文Markdown。";
const buildAiStagePrompt = ({ stage, module, dateRange, payload, outputs, skillName }) => {
  const common = `执行 ${skillName} 的工程化工作流，第 ${aiWorkflowStages.findIndex((item) => item.id === stage) + 1}/4 步：${aiWorkflowStages.find((item) => item.id === stage)?.label}。
模块：${module}；统计周期：2025同期 ${dateRange.start2025}—${dateRange.end2025}，2026本期 ${dateRange.start2026}—${dateRange.end2026}。
责任链：${aiModuleResponsibility[module]}。
指标必须区分结果、暴露、过程、闭环、业务影响；缺少有效分母时只报告暴露量，不做绩效排名。根因只能标记为“数据信号”“待验证假设”或“已验证根因”。`;
  if (stage === "audit") return `${common}
输入已经是QMS analytics cache，不是原始数据。不得要求或猜测未提供的明细；只审计缓存中的分子、分母、趋势、Pareto、责任维度和客户意见摘要。
请完成数据审计：列出指标字典（名称、类别、分子、分母、单位、周期、来源/字段、排除项、管理用途），核查同期可比性、缺失分母、空值/重复/映射风险及原始数据与平台缓存是否具备核对条件，给出A/B/C/D可信度。百分比必须说明能否复算。不得开始改善建议。
结构化数据：${boundedAiJson(payload, 12000)}`;
  if (stage === "pareto") return `${common}
基于已完成的数据审计做两次Pareto：①组织集中度；②合并同义类别后的失效机制集中度；再交叉形成3—5个候选管理主题。区分内部检出增强与质量恶化，绝对量与占比并列。每个因果判断写明证据等级、验证方法、验证角色和期限。
数据审计：${outputs.audit}
结构化数据：${boundedAiJson(payload, 18000)}`;
  if (stage === "actions") return `${common}
基于审计和双重Pareto，按“结果—过程—根因—责任—行动”形成三级责任分析。每个主要主题必须包含“分析结论—风险判断—改善措施—待办事项”。每项待办必须含：行动ID、来源模块、风险、结果/过程/执行责任角色、期限、交付物、领先/结果指标及目标、验证证据、验收标准、解除条件、逾期/复发/未达标升级规则、有效性复核日期。每个执行责任角色最多两个主要改善主题。${module === "QMS" ? "另设客户意见分析：主题、方向、严重度、重复性、影响对象、责任、响应及关闭证据；不得用满意度均分代替客户声音。" : "不要引入其他模块数据。"}
数据审计：${outputs.audit}
双重Pareto：${outputs.pareto}`;
  return `${common}
把前三步产物汇总成决策级正式报告，不重新发明或改写基础数字。严格输出：# 质量复盘摘要；## 数据范围、指标口径与可信度；## 公司级结果与过程；## 3—5项主要问题（每项含分析结论—风险判断—改善措施—待办事项）；## 第二层责任分析；## 第三层责任分析；## 根因证据与验证计划；## 30/60/90天行动台账；${module === "QMS" ? "## 客户意见专项分析；" : ""}## 管理层决策；## 数据限制与发布门禁。管理层优先级不超过5项，公司级战役3—5项。未通过的发布门禁必须明确披露。
数据审计：${outputs.audit}
双重Pareto与根因证据：${outputs.pareto}
三级责任与行动台账：${outputs.actions}`;
};
const buildAiCrossStagePrompt = ({ stage, reportPackage, outputs, skillName }) => {
  const rules = `执行 ${skillName} 的跨模块工作流。质量链为DQA设计/发布→IQC供应商/来料→IPQC装配/过程→OQC放行→QMS客户声音。关联只允许标记为“共同主题假设”“高度相关”或“已验证逃逸”；没有共同项目/产品/批次/SN/问题编号不得标记为已验证。`;
  if (stage === "chainAudit") return `${rules}
第一步只做关联证据审计：统一五份报告中的同义失效机制；列出共同主题、涉及模块、产生点、应检出点、实际检出/逃逸点、可用关联标识符和证据等级；披露无法建立因果链的字段缺口。不得直接写公司战役。
五份已完成模块报告：${boundedAiJson(reportPackage, 70000)}`;
  if (stage === "crossActions") return `${rules}
第二步基于证据审计，识别3—5项跨模块质量链主题、门禁失效和公司级战役，形成30/60/90天行动。每项行动必须包含结果/过程/执行责任角色、期限、交付物、领先与结果指标、验证证据、验收标准、解除条件和升级规则。
关联证据审计：${outputs.chainAudit}`;
  return `${rules}
第三步把前两步汇总为正式跨模块报告。输出：# 跨模块质量复盘摘要；## 关联证据与可信度；## 跨模块质量链；## 共同根因假设；## 阶段逃逸与门禁失效；## 3—5项公司级战役；## 30/60/90天行动台账；## 管理层决策；## 待补充关联字段与发布门禁。不得重新计算或改写各模块基础数字。
关联证据审计：${outputs.chainAudit}
质量链与公司战役：${outputs.crossActions}`;
};

function AiAnalysisPage({ data, dateRange, analysisKey, canSaveToServer = false }) {
  const [module, setModule] = useState("IQC");
  const [skillName, setSkillName] = useState(() => localStorage.getItem("qms-ai-selected-skill") || "generate-quality-review-report");
  const [revision, setRevision] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [generated, setGenerated] = useState(() => safeParse(localStorage.getItem(aiGeneratedStorageKey), {}));
  const [aiError, setAiError] = useState("");
  const [reportSaveState, setReportSaveState] = useState({ status: "idle", message: "", module: "" });
  const [analysisDetailsOpen, setAnalysisDetailsOpen] = useState(true);
  const [generatedReportOpen, setGeneratedReportOpen] = useState(true);
  const [importedReportOpen, setImportedReportOpen] = useState(true);
  const review = useMemo(() => buildApprovedAiReview(module === aiCrossModule ? "公司综合" : module, data), [module, analysisKey, revision, data]);
  const rerun = () => { setIsAnalyzing(true); window.setTimeout(() => { setRevision((value) => value + 1); setIsAnalyzing(false); }, 420); };
  useEffect(() => { localStorage.setItem(aiGeneratedStorageKey, JSON.stringify(generated)); }, [generated]);
  useEffect(() => { localStorage.setItem("qms-ai-selected-skill", skillName); }, [skillName]);
  const runModuleAi = async (targetModule) => {
    if (!targetModule || targetModule === aiCrossModule) return;
    setModule(targetModule); setIsAnalyzing(true); setAiError("");
    const existing = generated[targetModule] || {};
    const resumeExisting = existing.workflowVersion === aiWorkflowVersion && existing.analysisKey === analysisKey && existing.status !== "done";
    const preservedImported = existing.importedContent || (existing.imported ? existing.content : "");
    let record = resumeExisting ? { ...existing, stages: { ...(existing.stages || {}) } } : {
      ...(preservedImported ? { importedContent: preservedImported, importedSource: existing.importedSource } : {}),
      status: "loading", imported: false, workflowVersion: aiWorkflowVersion, analysisKey, skillName,
      startedAt: new Date().toISOString(), stages: {},
    };
    record.status = "loading";
    setGenerated((old) => ({ ...old, [targetModule]: record }));
    try {
      const payload = buildAiModuleData(data, targetModule, dateRange);
      for (const stage of aiWorkflowStages) {
        if (record.stages?.[stage.id]?.status === "done" && record.stages[stage.id].content) continue;
        record = { ...record, currentStage: stage.id, stages: { ...record.stages, [stage.id]: { status: "loading", label: stage.label, startedAt: new Date().toISOString() } } };
        setGenerated((old) => ({ ...old, [targetModule]: record }));
        if (stage.id === "audit") {
          const localContent = buildLocalAiAudit(data, targetModule, dateRange, payload);
          record = { ...record, model: "本地QMS统计引擎", stages: { ...record.stages, audit: { status: "done", label: stage.label, content: localContent, generatedAt: new Date().toISOString(), local: true } } };
          setGenerated((old) => ({ ...old, [targetModule]: record }));
          continue;
        }
        if (stage.id === "pareto") {
          const localContent = buildLocalAiPareto(data, targetModule, record.stages.audit?.content);
          record = { ...record, model: "本地QMS统计引擎", stages: { ...record.stages, pareto: { status: "done", label: stage.label, content: localContent, generatedAt: new Date().toISOString(), local: true } } };
          setGenerated((old) => ({ ...old, [targetModule]: record }));
          continue;
        }
        const outputs = Object.fromEntries(Object.entries(record.stages).filter(([, item]) => item?.content).map(([key, item]) => [key, item.content]));
        const prompt = buildAiStagePrompt({ stage: stage.id, module: targetModule, dateRange, payload, outputs, skillName });
        const result = await requestAiChat([{ role: "system", content: aiStageSystemPrompt }, { role: "user", content: prompt }], { max_tokens: stage.maxTokens });
        if (!String(result.content || "").trim()) throw new Error(`${stage.label}未返回有效内容`);
        const stageContent = sanitizeAiReportContent(result.content);
        record = { ...record, model: result.model, stages: { ...record.stages, [stage.id]: { status: "done", label: stage.label, content: stageContent, generatedAt: new Date().toISOString(), usage: result.usage || null } } };
        setGenerated((old) => ({ ...old, [targetModule]: record }));
      }
      record = { ...record, status: "done", imported: false, currentStage: null, content: record.stages.report.content, generatedAt: new Date().toISOString() };
      setGenerated((old) => ({ ...old, [targetModule]: record }));
    } catch (error) {
      const failedStage = record.currentStage;
      record = { ...record, status: "error", error: error.message, stages: { ...record.stages, ...(failedStage ? { [failedStage]: { ...(record.stages?.[failedStage] || {}), status: "error", error: error.message } } : {}) } };
      setAiError(`${aiWorkflowStages.find((item) => item.id === failedStage)?.label || "分析"}失败：${error.message}`);
      setGenerated((old) => ({ ...old, [targetModule]: record }));
    } finally { setIsAnalyzing(false); }
  };
  const completedModules = aiBaseModules.filter((item) => ["done", "imported"].includes(generated[item]?.status) && generated[item]?.content);
  const missingModules = aiBaseModules.filter((item) => !completedModules.includes(item));
  const inferAiModuleFromFile = (file) => {
    const path = `${file.webkitRelativePath || ""}/${file.name}`.toLowerCase();
    if (path.includes("dqa")) return "DQA";
    if (path.includes("iqc")) return "IQC";
    if (path.includes("ipqc")) return "IPQC";
    if (path.includes("oqc")) return "OQC";
    if (path.includes("qms")) return "QMS";
    return "";
  };
  const importAiReports = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    setAiError("");
    try {
      const imported = {};
      for (const file of files) {
        const text = await readAiReportFile(file);
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { parsed = null; }
        const inferredModule = inferAiModuleFromFile(file);
        if (/\.json$/i.test(file.name) && parsed && !parsed.reports && !parsed.content) continue;
        const reports = parsed?.reports && typeof parsed.reports === "object"
          ? Object.entries(parsed.reports)
          : parsed?.content ? [[parsed.module || inferredModule || module, parsed]]
          : [[inferredModule || module, { content: text }]];
        reports.forEach(([key, report]) => {
          const target = key === aiCrossModule ? "CROSS" : key;
          if (![...aiBaseModules, "CROSS"].includes(target)) return;
          const content = sanitizeAiReportContent(typeof report === "string" ? report : String(report?.content || "").trim());
          if (!content) return;
          imported[target] = {
            ...(generated[target] || {}),
            status: "imported", content, imported: true, importedContent: content,
            importedSource: file.name, importedAt: new Date().toISOString(),
            model: report?.model || "Codex桌面端", skillName: report?.skillName || skillName,
            generatedAt: report?.generatedAt || new Date().toISOString(),
          };
        });
      }
      if (!Object.keys(imported).length) throw new Error("未识别到有效报告内容；支持 Markdown、TXT、单份JSON或报告包JSON");
      setGenerated((old) => ({ ...old, ...imported }));
      setImportedReportOpen(true);
    } catch (error) { setAiError(`导入报告失败：${error.message}`); }
  };
  const runCrossModuleAi = async () => {
    if (missingModules.length) { setAiError(`请先完成以下模块的AI分析：${missingModules.join("、")}`); return; }
    const sourceModules = Object.fromEntries(aiBaseModules.map((item) => [item, generated[item].generatedAt]));
    const existing = generated.CROSS || {};
    const sameSources = JSON.stringify(existing.sourceModules || {}) === JSON.stringify(sourceModules);
    const resumeExisting = existing.workflowVersion === aiWorkflowVersion && sameSources && existing.status !== "done";
    const preservedImported = existing.importedContent || (existing.imported ? existing.content : "");
    let record = resumeExisting ? { ...existing, stages: { ...(existing.stages || {}) } } : { ...(preservedImported ? { importedContent: preservedImported, importedSource: existing.importedSource } : {}), status: "loading", imported: false, workflowVersion: aiWorkflowVersion, skillName, sourceModules, startedAt: new Date().toISOString(), stages: {} };
    record.status = "loading";
    setIsAnalyzing(true); setAiError(""); setGenerated((old) => ({ ...old, CROSS: record }));
    try {
      const reportPackage = Object.fromEntries(aiBaseModules.map((item) => [item, { generatedAt: generated[item].generatedAt, confidence: generated[item].stages?.audit?.content?.slice(0, 4000), content: String(generated[item].content || "").slice(0, 12000) }]));
      for (const stage of aiCrossWorkflowStages) {
        if (record.stages?.[stage.id]?.status === "done" && record.stages[stage.id].content) continue;
        record = { ...record, currentStage: stage.id, stages: { ...record.stages, [stage.id]: { status: "loading", label: stage.label, startedAt: new Date().toISOString() } } };
        setGenerated((old) => ({ ...old, CROSS: record }));
        const outputs = Object.fromEntries(Object.entries(record.stages).filter(([, item]) => item?.content).map(([key, item]) => [key, item.content]));
        const prompt = buildAiCrossStagePrompt({ stage: stage.id, reportPackage, outputs, skillName });
        const result = await requestAiChat([{ role: "system", content: aiStageSystemPrompt }, { role: "user", content: prompt }], { max_tokens: stage.maxTokens });
        if (!String(result.content || "").trim()) throw new Error(`${stage.label}未返回有效内容`);
        const stageContent = sanitizeAiReportContent(result.content);
        record = { ...record, model: result.model, stages: { ...record.stages, [stage.id]: { status: "done", label: stage.label, content: stageContent, generatedAt: new Date().toISOString(), usage: result.usage || null } } };
        setGenerated((old) => ({ ...old, CROSS: record }));
      }
      record = { ...record, status: "done", currentStage: null, content: record.stages.crossReport.content, generatedAt: new Date().toISOString() };
      setGenerated((old) => ({ ...old, CROSS: record }));
    } catch (error) {
      const failedStage = record.currentStage;
      record = { ...record, status: "error", error: error.message, stages: { ...record.stages, ...(failedStage ? { [failedStage]: { ...(record.stages?.[failedStage] || {}), status: "error", error: error.message } } : {}) } };
      setAiError(`${aiCrossWorkflowStages.find((item) => item.id === failedStage)?.label || "跨模块分析"}失败：${error.message}`);
      setGenerated((old) => ({ ...old, CROSS: record }));
    }
    finally { setIsAnalyzing(false); }
  };
  const saveReview = async (targetModule, record) => {
    if (!record?.content) return;
    setReportSaveState({ status: "saving", message: "正在保存到项目文件夹…", module: targetModule });
    try {
      const payload = { schemaVersion: "qms-ai-review-v1", module: targetModule, period: dateRange, model: record.model, skillName: record.skillName, generatedAt: record.generatedAt, sourceModules: record.sourceModules || null, content: sanitizeAiReportContent(record.content) };
      const saved = canSaveToServer ? await saveAiReport(payload) : saveLocalAiReport(payload);
      setGenerated((old) => ({ ...old, [targetModule === aiCrossModule ? "CROSS" : targetModule]: { ...(old[targetModule === aiCrossModule ? "CROSS" : targetModule] || record), savedAt: saved.savedAt, savedFileName: saved.fileName, savedRelativePath: saved.relativePath } }));
      setReportSaveState({ status: "saved", message: canSaveToServer ? `已保存到服务器：${saved.relativePath || saved.fileName}` : `已保存到本机：${saved.fileName}`, module: targetModule });
    } catch (error) {
      setReportSaveState({ status: "error", message: `保存失败：${error.message}`, module: targetModule });
    }
  };
  const saveAllReviews = async () => {
    const reports = Object.fromEntries([...aiBaseModules, "CROSS"].filter((key) => ["done", "imported"].includes(generated[key]?.status)).map((key) => [key === "CROSS" ? aiCrossModule : key, generated[key]]));
    setReportSaveState({ status: "saving", message: "正在保存全部报告包…", module: "ALL" });
    try {
      const payload = { schemaVersion: "qms-ai-review-package-v1", module: "全部报告包", exportedAt: new Date().toISOString(), period: dateRange, selectedSkill: skillName, reports };
      const saved = canSaveToServer ? await saveAiReport(payload) : saveLocalAiReport(payload);
      setReportSaveState({ status: "saved", message: canSaveToServer ? `已保存到服务器：${saved.relativePath || saved.fileName}` : `已保存到本机：${saved.fileName}`, module: "ALL" });
    } catch (error) {
      setReportSaveState({ status: "error", message: `保存失败：${error.message}`, module: "ALL" });
    }
  };
  const currentKey = module === aiCrossModule ? "CROSS" : module;
  const currentGenerated = generated[currentKey];
  const importedContent = currentGenerated?.importedContent || (currentGenerated?.imported ? currentGenerated.content : "");
  const activeWorkflowStages = module === aiCrossModule ? aiCrossWorkflowStages : aiWorkflowStages;
  const completedStageCount = activeWorkflowStages.filter((stage) => currentGenerated?.stages?.[stage.id]?.status === "done").length;
  const canResumeWorkflow = module !== aiCrossModule && currentGenerated?.workflowVersion === aiWorkflowVersion && currentGenerated?.status === "error";
  const canResumeCrossWorkflow = module === aiCrossModule && currentGenerated?.workflowVersion === aiWorkflowVersion && currentGenerated?.status === "error";
  return <div className="ai-analysis-page">
    <section className="ai-hero">
      <div className="ai-hero-icon"><Brain size={28} weight="duotone"/></div>
      <div><span className="ai-eyebrow">{module === aiCrossModule ? "五份报告 · 跨模块综合" : "单模块 · 大模型分析"}</span><h2>{module === aiCrossModule ? "跨模块AI质量分析" : `${module} AI质量分析`}</h2><p>{module === aiCrossModule ? "仅使用五份已保存模块报告，识别共同主题、阶段逃逸和公司级战役。" : "每次只分析当前选择的一个质量模块，不会同时发送其他板块数据。"}</p></div>
      <div className="ai-hero-actions"><span className={`ai-confidence grade-${review.confidence}`}>审核基线 {review.confidence}</span><label className="ai-import-report-button"><UploadSimple size={16}/>导入Codex报告/outputs目录<input type="file" accept=".json,.md,.markdown,.txt,.docx" multiple webkitdirectory="" directory="" onChange={importAiReports}/></label>{Object.values(generated).some((item) => ["done", "imported"].includes(item?.status)) && <button className="ai-export-all" onClick={saveAllReviews} disabled={isAnalyzing || reportSaveState.status === "saving"}><FloppyDisk size={16}/>保存全部报告包</button>}<button onClick={() => module === aiCrossModule ? runCrossModuleAi() : runModuleAi(module)} disabled={isAnalyzing || (module === aiCrossModule && missingModules.length > 0)}><Brain size={16}/>{isAnalyzing ? `执行中 ${completedStageCount}/${activeWorkflowStages.length}` : module === aiCrossModule ? canResumeCrossWorkflow ? "继续跨模块分析" : "启动跨模块分析" : canResumeWorkflow ? `继续${module}分析` : `启动${module}分析`}</button></div>
    </section>
    <div className="ai-scope-bar"><div>{aiModuleOptions.map((item) => <button key={item} className={module === item ? "active" : ""} onClick={() => setModule(item)} disabled={isAnalyzing}>{item}</button>)}</div><label className="ai-skill-select"><span>选择SKILL</span><select value={skillName} onChange={(event) => setSkillName(event.target.value)} disabled={isAnalyzing}>{aiSkillOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><span>统计周期：{review.period}</span></div>
    <section className="ai-metric-grid">{review.metrics.map((item) => <article key={item.key}><span>{item.key}</span><strong>{item.value}</strong><b>{item.label}</b><p>{item.note}</p></article>)}</section>
    {module === aiCrossModule && <div className={`ai-cross-readiness ${missingModules.length ? "waiting" : "ready"}`}><strong>{missingModules.length ? "跨模块分析尚未就绪" : "五个模块报告已就绪"}</strong><span>{missingModules.length ? `还需完成：${missingModules.join("、")}` : "可启动跨模块分析；不会重新发送原始模块数据。"}</span></div>}
    {(!missingModules.length || module !== aiCrossModule) && <div className="ai-workflow-progress">{activeWorkflowStages.map((stage, index) => { const state = currentGenerated?.stages?.[stage.id]?.status || "pending"; const local = currentGenerated?.stages?.[stage.id]?.local; return <div key={stage.id} className={state}><span>{state === "done" ? <CheckCircle size={16} weight="fill"/> : state === "loading" ? <ArrowsClockwise size={16} className="spin"/> : state === "error" ? <WarningCircle size={16} weight="fill"/> : index + 1}</span><div><b>{stage.label}</b><small>{state === "done" ? local ? "本地完成" : "AI已保存" : state === "loading" ? "正在执行" : state === "error" ? "失败，可继续" : "等待执行"}</small></div></div>; })}</div>}
    <section className={`ai-generated-report ${currentGenerated?.status || "idle"}`}><header><div><Brain size={21}/><h3>{module} 大模型分析报告</h3></div><div className="ai-report-meta">{currentGenerated?.generatedAt && !currentGenerated.imported && <span>已自动保存 · {formatSyncDateTime(currentGenerated.generatedAt)} · {currentGenerated.model} · {currentGenerated.skillName || "generate-quality-review-report"}</span>}{currentGenerated?.savedFileName && <span className="ai-saved-file">本地文件：{currentGenerated.savedFileName}</span>}{currentGenerated?.content && !currentGenerated.imported && <button onClick={() => saveReview(module, currentGenerated)} disabled={isAnalyzing || reportSaveState.status === "saving"}><FloppyDisk size={15}/>{reportSaveState.status === "saving" && reportSaveState.module === module ? "保存中…" : "保存报告"}</button>}<button className="ai-report-toggle" onClick={() => setGeneratedReportOpen((value) => !value)}>{generatedReportOpen ? "收起报告" : "展开报告"}<CaretDown size={15} className={generatedReportOpen ? "rotate" : ""}/></button></div></header>{generatedReportOpen && <>{isAnalyzing || currentGenerated?.status === "loading" ? <div className="ai-report-loading"><ArrowsClockwise size={23} className="spin"/><strong>正在使用大模型分析{module}数据</strong><p>请保持页面打开，完成后将自动保存。</p></div> : currentGenerated?.content && !currentGenerated.imported ? <ImportedReportViewer content={currentGenerated.content}/> : <div className="ai-report-empty"><Brain size={30}/><strong>尚未生成{module}在线AI分析</strong><p>在线分析失败或尚未启动时，可查看下方导入的Codex桌面端报告。</p></div>}{reportSaveState.message && (reportSaveState.module === module || reportSaveState.module === "ALL") && <div className={`ai-report-save-state ${reportSaveState.status}`}>{reportSaveState.message}</div>}{aiError && <div className="ai-report-error"><WarningCircle size={17}/>{aiError}</div>}</>}</section>
    {importedContent && <section className="ai-imported-report-panel"><header><div><UploadSimple size={19}/><strong>Codex桌面端导入报告</strong><span>{currentGenerated.importedSource || "本地报告"}</span></div><button onClick={() => setImportedReportOpen((value) => !value)}>{importedReportOpen ? "收起导入报告" : "展开导入报告"}<CaretDown size={15} className={importedReportOpen ? "rotate" : ""}/></button></header>{importedReportOpen && <ImportedReportViewer content={importedContent}/>}</section>}
    <div className="ai-analysis-details"><header className="ai-analysis-details-head"><div><Brain size={19}/><strong>双重二八、三级责任与行动台账</strong><span>辅助判断与改善任务</span></div><button onClick={() => setAnalysisDetailsOpen((value) => !value)}>{analysisDetailsOpen ? "整体收起" : "整体展开"}<CaretDown size={15} className={analysisDetailsOpen ? "rotate" : ""}/></button></header>{analysisDetailsOpen && (<div className="ai-analysis-details-body"><section className="ai-section"><div className="ai-section-head"><div><span>01</span><h3>双重二八与三级责任判断</h3></div><p>组织集中度 × 失效机制，形成差异化责任行动</p></div>
      <div className="ai-finding-grid">{review.findings.map(([key, item]) => <article className={`ai-finding risk-${item.risk}`} key={`${key}-${item.mechanism}`}><header><span>{key}</span><em>{aiRiskMeta[item.risk].label}风险</em></header><h4>{item.mechanism}</h4><dl><div><dt>结果责任</dt><dd>{item.org}</dd></div><div><dt>执行责任</dt><dd>{item.owner}</dd></div></dl><p>{item.conclusion}</p><aside><strong>改善措施</strong>{item.action}</aside></article>)}</div>
    </section>
    <section className="ai-section"><div className="ai-section-head"><div><span>02</span><h3>30/60/90天改善行动台账</h3></div><p>包含领先指标、结果指标和解除条件</p></div>
      <div className="ai-action-table"><div className="ai-action-row head"><span>编号/模块</span><span>责任对象</span><span>核心交付物</span><span>验收指标</span><span>解除条件</span></div>{review.actions.map((item) => <div className="ai-action-row" key={item.id}><span><b>{item.id}</b><em className={`risk-dot ${item.risk}`}></em>{item.module}</span><strong>{item.owner}</strong><p>{item.deliverable}</p><p>{item.leading}<br/>{item.lagging}</p><p>{item.release}</p></div>)}</div>
    </section></div>)}
    <section className="ai-publication-gate"><div><CheckCircle size={22} weight="fill"/><h3>分析发布门禁</h3><p>AI结论只有通过口径、责任、证据和客户声音检查后才可用于管理决策。</p></div><ul>{review.audit.map((item) => <li key={item.label} className={item.pass ? "pass" : "warn"}>{item.pass ? <CheckCircle size={17} weight="fill"/> : <WarningCircle size={17} weight="fill"/>}<span><b>{item.label}</b>{item.detail}</span></li>)}</ul></section>
  </div></div>;
}

function AiInterfacePage({ canSaveToServer = false }) {
  const [config, setConfig] = useState({ baseUrl: "https://new.ahei.asia/v1", model: "", apiKey: "" });
  const [addressHistory, setAddressHistory] = useState(() => normalizeAiEndpointHistory(safeParse(localStorage.getItem(aiEndpointHistoryKey), [])));
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState({ type: "idle", text: "" });
  const [loading, setLoading] = useState(true);
  const [testPrompt, setTestPrompt] = useState("请用一句话说明质量复盘的目的。");
  const [testResponse, setTestResponse] = useState("");
  useEffect(() => {
    loadAiConfig().then((value) => { setConfig((old) => ({ ...old, ...value, apiKey: "" })); rememberAddress(value.baseUrl); }).catch((error) => setStatus({ type: "error", text: error.message })).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (/\/api\/plan\/v3\/?$/i.test(config.baseUrl || "") && !config.model) update("model", "ark-code-latest");
  }, [config.baseUrl, config.model]);
  const rememberAddress = (value) => {
    const address = String(value || "").trim();
    if (!address) return;
    setAddressHistory((current) => {
      const next = normalizeAiEndpointHistory([address, ...current]);
      localStorage.setItem(aiEndpointHistoryKey, JSON.stringify(next));
      return next;
    });
  };
  const removeAddress = (address) => {
    setAddressHistory((current) => {
      const next = current.filter((item) => item !== address);
      localStorage.setItem(aiEndpointHistoryKey, JSON.stringify(next));
      return next;
    });
  };
  const update = (key, value) => {
    if (key === "baseUrl") {
      setModels([]);
      setConfig((old) => ({ ...old, baseUrl: value, model: old.baseUrl === value ? old.model : "" }));
      return;
    }
    setConfig((old) => ({ ...old, [key]: value }));
  };
  const save = async () => {
    setStatus({ type: "loading", text: "正在保存本机配置…" });
    try {
      const saved = await saveAiConfig(config, { saveToServer: canSaveToServer });
      rememberAddress(config.baseUrl);
      setConfig((old) => ({ ...old, ...saved, apiKey: "" }));
      setStatus({ type: "success", text: canSaveToServer ? "已保存到本机，并同步为服务器默认 AI 接口，其他用户可直接使用。" : "已保存到本机浏览器，仅当前用户使用。" });
    }
    catch (error) { setStatus({ type: "error", text: error.message }); }
  };
  const fetchModels = async () => {
    setStatus({ type: "loading", text: "正在读取模型列表…" });
    try {
      if (config.apiKey) await saveAiConfig(config, { saveToServer: false });
      rememberAddress(config.baseUrl);
      const result = await loadAiModels(config);
      const providerModels = [...new Set((result.models || []).map((item) => String(item).trim()).filter(Boolean))];
      const staleModel = config.model && providerModels.length > 0 && !providerModels.includes(config.model);
      const nextModels = providerModels.length ? providerModels : (config.model ? [config.model] : []);
      setModels(nextModels);
      if (staleModel) update("model", "");
      if (!config.model && nextModels.length) update("model", nextModels[0]);
      setStatus({ type: staleModel ? "error" : "success", text: staleModel ? `当前密钥不支持模型 ${config.model}，已清空旧模型，请从列表重新选择。` : `连接成功，共读取 ${providerModels.length} 个模型，请在下拉框中选择后保存。` });
    }
    catch (error) { setStatus({ type: "error", text: error.message }); }
  };
  const test = async () => {
    setStatus({ type: "loading", text: "正在调用模型进行连接测试…" });
    try {
      const result = await testAiConfig(config);
      if (canSaveToServer) await saveAiConfig(config, { saveToServer: true });
      rememberAddress(config.baseUrl);
      setConfig((old) => ({ ...old, apiKey: "", hasApiKey: true, apiKeyHint: old.apiKey ? `••••${old.apiKey.slice(-4)}` : old.apiKeyHint }));
      setStatus({ type: "success", text: `模型 ${result.model} 调用成功${canSaveToServer ? "，已同步为服务器默认 AI 接口" : "，当前仅保存到本机"}：${result.response || "已返回响应"}` });
    }
    catch (error) { setStatus({ type: "error", text: error.message }); }
  };
  const chat = async () => {
    if (!testPrompt.trim()) return;
    setTestResponse(""); setStatus({ type: "loading", text: "正在发送测试问题…" });
    try { const result = await requestAiChat([{ role: "system", content: "你是质量管理助手。回答简洁、专业，不编造数据。" }, { role: "user", content: testPrompt }]); setTestResponse(result.content || "模型未返回文本"); setStatus({ type: "success", text: `已通过 ${result.model} 完成测试对话。` }); }
    catch (error) { setStatus({ type: "error", text: error.message }); }
  };
  return <div className="ai-interface-page">
    <section className="ai-interface-hero"><div><span>LOCAL AI GATEWAY</span><h2>AI接口配置</h2><p>主管理员可设置服务器默认接口；其他用户可直接使用，也可在本机覆盖配置。</p></div><aside><ShieldCheck size={22} weight="fill"/><strong>默认共享，本机可覆盖</strong><p>管理员配置供授权用户使用；普通用户的 API 配置只保存在当前浏览器，不会写入服务器。</p></aside></section>
    <div className="ai-interface-grid">
      <section className="ai-config-card"><header><div><GearSix size={21}/><h3>接口参数</h3></div><em>{config.hasApiKey ? `已配置 ${config.apiKeyHint || "API密钥"}` : "尚未配置密钥"}</em></header>
        <label><span>API请求地址</span><div className="ai-endpoint-input"><input list="qms-ai-endpoint-history" value={config.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} onBlur={() => rememberAddress(config.baseUrl)} disabled={loading}/><select aria-label="选择已保存的API地址" value="" onChange={(event) => event.target.value && update("baseUrl", event.target.value)} disabled={loading || !addressHistory.length}><option value="">历史地址</option>{addressHistory.map((address) => <option key={address} value={address}>{address}</option>)}</select><datalist id="qms-ai-endpoint-history">{addressHistory.map((address) => <option key={address} value={address}/>)}</datalist></div><small>支持任意 HTTPS OpenAI兼容接口；本机 Ollama/LM Studio 可使用 http://127.0.0.1 或 http://localhost。当前通道：{/\/api\/plan\/v3\/?$/i.test(config.baseUrl || "") ? "Responses（方舟 Agent/Coding Plan）" : "Chat Completions（通用兼容接口）"}</small>{addressHistory.length > 0 && <div className="ai-endpoint-history">{addressHistory.map((address) => <div key={address}><code>{address}</code><button type="button" aria-label={`删除地址${address}`} onClick={() => removeAddress(address)}><Trash size={13}/></button></div>)}</div>}</label>
        <label><span>API密钥</span><input type="password" value={config.apiKey} onChange={(event) => update("apiKey", event.target.value)} placeholder={config.hasApiKey ? "留空表示继续使用已保存密钥" : "输入第三方API密钥"} autoComplete="new-password"/><small>页面不会读取已保存密钥，只显示末四位提示。</small></label>
        <label><span>模型</span><div className="ai-model-input"><select value={config.model} onChange={(event) => update("model", event.target.value)} disabled={!models.length && !config.model}><option value="">请选择模型</option>{[...new Set([...(models || []), ...(config.model ? [config.model] : [])])].map((model) => <option key={model} value={model}>{model}</option>)}</select><button onClick={fetchModels} disabled={status.type === "loading"}>读取模型</button></div><small>{models.length ? `已加载 ${models.length} 个模型，可直接选择。` : "请先读取模型列表。"}</small></label>
        <div className="ai-config-actions"><button className="secondary" onClick={save}>保存配置</button><button className="primary" onClick={test}>保存并测试</button></div>
        {status.text && <div className={`ai-config-status ${status.type}`}>{status.type === "success" ? <CheckCircle size={17} weight="fill"/> : status.type === "error" ? <WarningCircle size={17} weight="fill"/> : <ArrowsClockwise size={17} className="spin"/>}<span>{status.text}</span></div>}
      </section>
      <section className="ai-config-card ai-test-card"><header><div><Brain size={21}/><h3>模型调用测试</h3></div><em>OpenAI兼容格式</em></header><label><span>测试问题</span><textarea rows={5} value={testPrompt} onChange={(event) => setTestPrompt(event.target.value)}/></label><button className="primary full" onClick={chat} disabled={status.type === "loading" || !config.hasApiKey || !config.model}>发送给大模型</button><div className={`ai-test-response ${testResponse ? "has-content" : ""}`}>{testResponse || "配置并测试成功后，可在这里验证模型实际回答。"}</div>
      </section>
    </div>
    <section className="ai-offline-flow"><h3>离线服务器使用流程</h3><div><span><b>1</b>本机生成</span><ArrowRight size={16}/><span><b>2</b>人工审核</span><ArrowRight size={16}/><span><b>3</b>导出分析包</span><ArrowRight size={16}/><span><b>4</b>服务器导入发布</span></div></section>
  </div>;
}

function DqaEngineerSupplementImport({ supplement, onImport, onClear, onDeleteFile }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const handleChange = async (event) => {
    const selected = [...(event.target.files || [])];
    event.target.value = "";
    if (selected.length === 0) return;
    setBusy(true);
    setMessage("\u6b63\u5728\u89e3\u6790\u4e09\u7c7b\u7814\u53d1\u660e\u7ec6\u8868...");
    try {
      const result = await onImport(selected);
      setMessage(`\u5df2\u4fdd\u5b58\uff1aECN ${result.ecnRecords?.length || 0} \u884c\uff0c\u975eBOM ${result.nonBomRecords?.length || 0} \u884c\uff0c\u8bc4\u5ba1 ${result.reviewRecords?.length || 0} \u4e2a\u9879\u76ee`);
    } catch (error) {
      setMessage(`\u5bfc\u5165\u5931\u8d25\uff1a${error.message}`);
    } finally { setBusy(false); }
  };
  const files = supplement?.files || [];
  const decodeDisplayText = (value) => String(value || "").replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  const updatedAt = supplement?.updatedAt ? new Date(supplement.updatedAt).toLocaleString("zh-CN", { hour12: false }) : "-";
  return <section className="data-source-module data-source-engineer-supplement">
    <header><span className="dataset-icon amber"><ClipboardText size={22}/></span><div><h3>研发· ECN/非BOM/评审</h3><p>{files.length ? `${files.length}个数据源 · 持续追加` : "尚未导入数据"}</p></div><button onClick={() => inputRef.current?.click()} disabled={busy}><UploadSimple size={16}/>{busy ? "解析中..." : "导入数据"}</button><input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" multiple hidden onChange={handleChange}/></header>
    <div className="engineer-supplement-body">
      <div className="engineer-supplement-rules"><span>统计规则</span><p>数据按导入文件持续追加，不覆盖已有来源；同一文件重复导入不会重复计数。ECN 按创建人、变更原因、物料代码统计；非BOM 按申请人统计 35 开头加工件；评审成员每个项目计 1 次，提出人按人次计数。</p></div>
      <div className="engineer-supplement-stats"><div><b>{supplement?.ecnRecords?.length || 0}</b><span>ECN 记录</span></div><div><b>{supplement?.ecnRecords?.filter((row) => row.isMachined).length || 0}</b><span>ECN 加工件</span></div><div><b>{supplement?.nonBomRecords?.filter((row) => row.isMachined).length || 0}</b><span>非BOM 加工件</span></div><div><b>{supplement?.reviewRecords?.length || 0}</b><span>评审项目</span></div></div>
      <div className="source-file-table">
        <div className="source-file-row source-file-head"><span>文件名</span><span>数据行数</span><span>数据类型</span><span>导入时间</span><span>操作</span></div>
        {files.map((file) => <div className="source-file-row" key={file.sourceId || `${file.kind}-${file.name}`}><strong><FileXls size={16}/>{file.name}</strong><span>{(file.rowCount || 0).toLocaleString()}</span><span>{decodeDisplayText(file.kind)}</span><span>{new Date(file.importedAt || updatedAt).toLocaleString("zh-CN", { hour12: false })}</span><button className="delete-source" onClick={() => onDeleteFile(file)} disabled={busy}><Trash size={15}/>删除</button></div>)}
        {!files.length && <div className="source-empty">尚未导入 ECN、非BOM 或研发评审数据</div>}
      </div>
      <div className="engineer-supplement-foot">{message && <span className="qmdp-inline-status"><CheckCircle size={15}/>{message}</span>}{supplement && <button className="qmdp-danger-btn" onClick={onClear} disabled={busy}><Trash size={14}/>清除独立明细</button>}</div>
    </div>
  </section>;
}

function DqaAgentRawImport({ raw, onImport, onClear, onDeleteFile }) {
  const inputRef = useRef(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const handleChange = async (event) => { const selected = [...(event.target.files || [])]; event.target.value = ""; if (!selected.length) return; setBusy(true); setMessage("正在解析 Agent 原始明细…"); try { const value = await onImport(selected); setMessage(`已追加：ECN ${value.ecnRecords?.length || 0} 行，非BOM ${value.nonBomRecords?.length || 0} 行，项目映射 ${value.projectMappings?.length || 0} 行`); } catch (error) { setMessage(`导入失败：${error.message}`); } finally { setBusy(false); } };
  return <section className="data-source-module data-source-engineer-supplement"><header><span className="dataset-icon amber"><ClipboardText size={22}/></span><div><h3>研发·ECN/非BOM Agent原始数据</h3><p>{raw?.files?.length ? `${raw.files.length} 个数据源 · 与质量数据-DQA隔离` : "尚未导入 Agent 原始数据"}</p></div><button onClick={() => inputRef.current?.click()} disabled={busy}><UploadSimple size={16}/>{busy ? "解析中…" : "导入原始数据"}</button><input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" multiple hidden onChange={handleChange}/></header><div className="engineer-supplement-body"><div className="engineer-supplement-rules"><span>统计口径</span><p>ECN按行计数；项目名称去重；35开头物料代码为加工件；ECN比例使用去重项目的 BOM物料总款数，项目映射用于非BOM的 PM/TPM 归属。</p></div><div className="engineer-supplement-stats"><div><b>{raw?.ecnRecords?.length || 0}</b><span>ECN行</span></div><div><b>{raw?.nonBomRecords?.length || 0}</b><span>非BOM行</span></div><div><b>{raw?.projectMappings?.length || 0}</b><span>项目映射</span></div></div><div className="source-file-table"><div className="source-file-row source-file-head"><span>文件名</span><span>行数</span><span>类型</span><span>导入时间</span><span>操作</span></div>{(raw?.files || []).map((file) => <div className="source-file-row" key={file.sourceId}><strong><FileXls size={16}/>{file.name}</strong><span>{(file.rowCount || 0).toLocaleString()}</span><span>{file.kind}</span><span>{new Date(file.importedAt).toLocaleString("zh-CN", { hour12: false })}</span><button className="delete-source" onClick={() => onDeleteFile(file)} disabled={busy}><Trash size={15}/>删除</button></div>)}</div>{raw && <button className="qmdp-danger-btn" onClick={onClear} disabled={busy}><Trash size={14}/>清除 Agent 原始明细</button>}{message && <span className="qmdp-inline-status"><CheckCircle size={15}/>{message}</span>}</div></section>;
}

function DataSourcePage({ files, onImportModule, onDelete, onSourcesChanged, dqaEngineerSupplement, onImportDqaEngineerSupplement, onClearDqaEngineerSupplement, onDeleteDqaEngineerSupplementFile, dqaAgentRaw, onLoadDqaAgentRaw, onImportDqaAgentRaw, onClearDqaAgentRaw, onDeleteDqaAgentRawFile }) {
  const modules = ["IQC", "IPQC", "OQC", "DQA", "QMS"];
  useEffect(() => { onLoadDqaAgentRaw?.().catch(() => {}); }, [onLoadDqaAgentRaw]);
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
    <DqaEngineerSupplementImport
      supplement={dqaEngineerSupplement}
      onImport={onImportDqaEngineerSupplement}
      onClear={onClearDqaEngineerSupplement}
      onDeleteFile={onDeleteDqaEngineerSupplementFile}
    />
    <DqaAgentRawImport raw={dqaAgentRaw} onImport={onImportDqaAgentRaw} onClear={onClearDqaAgentRaw} onDeleteFile={onDeleteDqaAgentRawFile}/>
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

function MenuPermissionTable({ menus, onChange }) {
  const checked = (rule, field) => rule?.[field] !== false;
  return <div className="permission-menu-table">
    <div className="permission-menu-head"><span>菜单层级</span><span>普通用户允许</span><span>副管理员允许</span></div>
    {menuPermissionDefinitions.map(({ key, children }) => {
      const rule = menus?.[key] || {};
      return <div className="permission-menu-group" key={key}>
        <div className="permission-menu-row permission-menu-parent"><strong>{key}</strong>{["public", "deputy"].map((field) => <label key={field}><input type="checkbox" checked={checked(rule, field)} onChange={(event) => onChange(key, "", field, event.target.checked)} />允许</label>)}</div>
        {children.map((child) => {
          const childRule = rule.children?.[child] || {};
          return <div className="permission-menu-row permission-menu-child" key={child}><span>↳ {child}</span>{["public", "deputy"].map((field) => <label key={field}><input type="checkbox" checked={checked(childRule, field)} onChange={(event) => onChange(key, child, field, event.target.checked)} />允许</label>)}</div>;
        })}
      </div>;
    })}
  </div>;
}

function PermissionMemberList({ title, description, members, blockedMembers = [], onChange }) {
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [error, setError] = useState("");
  const add = () => {
    const nextName = name.trim();
    const nextIp = ip.trim();
    if (!nextName || !nextIp) {
      setError("请同时填写姓名和 IP 地址");
      return;
    }
    if ([...(members || []), ...blockedMembers].some((member) => member.ip === nextIp)) {
      setError("该 IP 已在其他或当前名单中");
      return;
    }
    onChange([...(members || []), { name: nextName, ip: nextIp }]);
    setName("");
    setIp("");
    setError("");
  };
  const remove = (memberIp) => onChange((members || []).filter((member) => member.ip !== memberIp));
  return <section className="permission-card">
    <header><div><h3>{title}</h3><span>{description}</span></div><b>{(members || []).length} 人</b></header>
    <div className="permission-member-form">
      <label><span>姓名</span><input value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="例如：张三" /></label>
      <label><span>IP 地址</span><input value={ip} onChange={(event) => { setIp(event.target.value); setError(""); }} placeholder="例如：192.168.230.50" onKeyDown={(event) => { if (event.key === "Enter") add(); }} /></label>
      <button onClick={add}><Plus size={15}/>添加</button>
    </div>
    {error && <div className="permission-form-error" role="alert">{error}</div>}
    <div className="permission-member-list">
      {(members || []).map((member) => <div key={member.ip}><span><User size={16}/><strong>{member.name || "未填写姓名"}</strong><code>{member.ip}</code></span><button aria-label={`移除${member.name || member.ip}`} onClick={() => remove(member.ip)}><Trash size={15}/>移除</button></div>)}
      {!(members || []).length && <em>暂未添加人员</em>}
    </div>
  </section>;
}

function PermissionSettingsPage({ auth, permissions, onPermissionsChanged }) {
  const [draft, setDraft] = useState(() => normalizePermissions(permissions));
  const [status, setStatus] = useState("");
  useEffect(() => setDraft(normalizePermissions(permissions)), [permissions]);
  const updateRule = (group, key, field, value) => setDraft((current) => ({
    ...current,
    [group]: { ...current[group], [key]: { ...current[group][key], [field]: value } },
  }));
  const updateMenuRule = (parent, child, field, value) => setDraft((current) => {
    const currentParent = current.menus?.[parent] || { public: true, deputy: true, children: {} };
    const children = currentParent.children || {};
    if (!child) {
      const nextChildren = Object.fromEntries(Object.entries(children).map(([name, rule]) => [name, { ...rule, [field]: value }]));
      return { ...current, menus: { ...current.menus, [parent]: { ...currentParent, [field]: value, children: nextChildren } } };
    }
    const nextChildren = { ...children, [child]: { ...(children[child] || {}), [field]: value } };
    const parentValue = Object.values(nextChildren).length > 0 && Object.values(nextChildren).every((rule) => rule?.[field] !== false);
    return { ...current, menus: { ...current.menus, [parent]: { ...currentParent, [field]: parentValue, children: nextChildren } } };
  });
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
    <section className="permission-hero"><div><h2>权限设置</h2><p>当前访问：{auth?.name || "主管理员"}（{auth?.ip || "-"}）。只有名单内人员可查看公司数据，主管理员始终拥有全部权限。</p></div><button className="primary-btn" onClick={save}><FloppyDisk size={16}/>保存权限</button></section>
    {status && <div className="permission-status">{status}</div>}
    <section className={`permission-open-card ${draft.allowIntranetUsers ? "enabled" : ""}`}>
      <div><ShieldCheck size={22} weight={draft.allowIntranetUsers ? "fill" : "regular"}/><span><strong>完全开放公司内网普通用户</strong><small>开启后，公司私有内网 IP 无需逐个登记即可查看；公网 IP 始终无法访问。</small></span></div>
      <label className="permission-switch"><input type="checkbox" checked={draft.allowIntranetUsers} onChange={(event) => setDraft((current) => ({ ...current, allowIntranetUsers: event.target.checked }))} /><span aria-hidden="true"></span><em>{draft.allowIntranetUsers ? "已开启" : "已关闭"}</em></label>
    </section>
    <div className="permission-member-grid">
      <PermissionMemberList title="副管理员" description="可按下方开关使用管理功能和写入接口。" members={draft.deputyAdmins} blockedMembers={draft.ordinaryUsers} onChange={(members) => setDraft((current) => ({ ...current, deputyAdmins: members }))} />
      <PermissionMemberList title="普通用户" description="仅可查看被允许的功能和数据，不能修改权限。" members={draft.ordinaryUsers} blockedMembers={draft.deputyAdmins} onChange={(members) => setDraft((current) => ({ ...current, ordinaryUsers: members }))} />
    </div>
    <section className="permission-card"><header><h3>菜单权限</h3><span>控制左侧一级菜单和二级菜单的显示范围；一级菜单可联动全部二级菜单。</span></header><MenuPermissionTable menus={draft.menus} onChange={updateMenuRule} /></section>
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

const qmdpKnowledgeKey = "qms-qmdp-knowledge-files-v1";
const qmdpQuestionsKey = "qms-qmdp-question-bank-v1";
const qmdpQuestionGenerationSettingsKey = "qms-qmdp-question-generation-settings-v1";
const qmdpExamRecordsKey = "qms-qmdp-exam-records-v1";
const qmdpExamSessionsKey = "qms-qmdp-exam-sessions-v1";
const qmdpSystemKey = "qms-qmdp-system-config-v1";
const qmdpReportTasksKey = "qms-qmdp-report-tasks-v1";

const decodeKnowledgeText = (buffer) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const replacementCount = (utf8.match(/\ufffd/g) || []).length;
  if (replacementCount > 0 && typeof TextDecoder !== "undefined") {
    try { return new TextDecoder("gb18030").decode(bytes); } catch { /* use UTF-8 fallback */ }
  }
  return utf8;
};

const unzipLocalEntries = async (buffer) => {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder("utf-8").decode(bytes.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let content = compressed;
    if (method === 8) {
      if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持 Office 文档解压，请使用最新版 Chrome/Edge");
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      content = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (method !== 0) {
      offset = dataStart + compressedSize;
      continue;
    }
    entries.set(name, content);
    offset = dataStart + compressedSize;
  }
  return entries;
};

const decodeXml = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const officeParagraphs = (xml, tag = "w:p", textTag = "w:t") => (String(xml || "").match(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "g")) || []).map((block) => decodeXml((block.match(new RegExp(`<${textTag}\\b[^>]*>([\\s\\S]*?)<\\/${textTag}>`, "g")) || []).map((item) => item.replace(new RegExp(`^<[\\s\\S]*?>|<\\/${textTag}>$`, "g"), "")).join(" "))).filter(Boolean);

const subtitleSeconds = (value) => {
  const parts = String(value || "").replace(",", ".").split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
};

const readSubtitleEvidence = (text, fileName) => {
  const lines = String(text || "").replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const segments = [];
  const segmentMetadata = [];
  const videoId = fileName.match(/BV[\w-]+/i)?.[0] || fileName.match(/[A-Za-z0-9_-]{8,}/)?.[0] || "";
  const videoPlatform = /BV[\w-]+/i.test(fileName) ? "B站" : /youtube|youtu\.be/i.test(fileName) ? "YouTube" : "本地视频";
  for (let index = 0; index < lines.length; index += 1) {
    const timing = lines[index].trim().match(/^((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})\s+-->\s+((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})/);
    if (!timing) continue;
    const content = [];
    while (++index < lines.length && lines[index].trim()) content.push(lines[index].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    const clauseText = content.filter(Boolean).join(" ");
    if (!clauseText) continue;
    const cueIndex = segments.length + 1;
    const startTimestamp = timing[1].replace(",", ".");
    const endTimestamp = timing[2].replace(",", ".");
    segments.push(clauseText);
    segmentMetadata.push({ locatorType: "video-timestamp", locator: `${startTimestamp}—${endTimestamp}`, startTimestamp, endTimestamp, startSeconds: subtitleSeconds(startTimestamp), endSeconds: subtitleSeconds(endTimestamp), cueIndex, videoPlatform, videoId });
  }
  if (!segments.length) throw new Error("字幕文件中没有识别到SRT/VTT时间轴");
  return { contentType: "video-transcript", segments, segmentMetadata, preview: segments.join("\n").slice(0, 80000), durationSeconds: segmentMetadata.at(-1)?.endSeconds || 0 };
};
const formatElapsed = (stage, now = Date.now()) => {
  if (!stage?.startedAt) return "-";
  const end = stage.completedAt ? new Date(stage.completedAt).getTime() : now;
  const start = new Date(stage.startedAt).getTime();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
};
const processingStageItems = [
  ["import", "导入"],
  ["evidence", "证据解析"],
  ["evidenceCleanup", "证据整理"],
  ["distillation", "知识蒸馏"],
  ["knowledgePersistence", "知识入库"],
];
const processingTimingLabel = (file, now = Date.now()) => file.processingTimingText || processingStageItems
  .filter(([key]) => file.metadata?.processingStages?.[key])
  .map(([key, label]) => `${label} ${formatElapsed(file.metadata.processingStages[key], now)}`)
  .join(" · ");

// Legacy .doc is an OLE binary container rather than a ZIP package.  It is
// not safe to decode the whole file as UTF-8; recover only readable Unicode
// runs so the document can still enter the normal evidence rules.  This is a
// fallback, not a promise of perfect layout/table recovery.
const extractLegacyDocText = (buffer) => {
  const bytes = new Uint8Array(buffer);
  const runs = [];
  const push = (value) => {
    const text = String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, " ").replace(/[ \t]{2,}/g, " ").trim();
    if (text.length >= 3 && /[\u3400-\u9fffA-Za-z0-9]/.test(text)) runs.push(text);
  };
  let ascii = "";
  for (const byte of bytes) {
    if (byte >= 0x20 && byte <= 0x7e) ascii += String.fromCharCode(byte);
    else { push(ascii); ascii = ""; }
  }
  push(ascii);
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const code = bytes[index] | (bytes[index + 1] << 8);
    if ((code >= 0x20 && code !== 0xfffe && code !== 0xffff) && (code <= 0x7e || (code >= 0x3400 && code <= 0x9fff))) {
      let text = "";
      let cursor = index;
      while (cursor + 1 < bytes.length) {
        const value = bytes[cursor] | (bytes[cursor + 1] << 8);
        if (!((value >= 0x20 && value !== 0xfffe && value !== 0xffff) && (value <= 0x7e || (value >= 0x3400 && value <= 0x9fff)))) break;
        text += String.fromCharCode(value); cursor += 2;
      }
      if (text.length >= 3) push(text);
    }
  }
  return [...new Set(runs)].join("\n");
};

const readKnowledgeFile = async (file) => {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return { contentType: "pdf", segments: [`原始PDF文件：${file.name}\n当前登记为待OCR，原件不改写。`], segmentMetadata: [{ locatorType: "pdf", locator: "待OCR" }], preview: `原始PDF文件：${file.name} · 待OCR`, registerOnly: true };
  if (["srt", "vtt"].includes(ext)) return readSubtitleEvidence(decodeKnowledgeText(await file.arrayBuffer()), file.name);
  if (ext === "doc") {
    const text = extractLegacyDocText(await file.arrayBuffer());
    if (!text) throw new Error("旧版 Word 未提取出可读文字；请另存为 DOCX 或 PDF 后再导入");
    const segments = text.split(/\n+/).map((item) => item.trim()).filter(Boolean);
    return { contentType: "word", segments, segmentMetadata: segments.map((_, index) => ({ locatorType: "paragraph", locator: `段落 ${index + 1}`, paragraph: index + 1, extraction: "legacy-doc-text" })), preview: segments.join("\n").slice(0, 80000), metadata: { extraction: "legacy-doc-text", layoutRecovery: "limited" } };
  }
  if (ext === "xmind") {
    const entries = await unzipLocalEntries(await file.arrayBuffer());
    const jsonEntry = entries.get("content.json");
    const segments = [];
    const walk = (topic, path = []) => {
      if (!topic || typeof topic !== "object") return;
      const title = String(topic.title || topic.topicTitle || "").trim();
      const nextPath = title ? [...path, title] : path;
      if (title) segments.push({ text: nextPath.join(" / "), metadata: { locatorType: "xmind-node", locator: nextPath.join(" / "), nodePath: nextPath } });
      const children = topic.children?.attached || topic.children?.topics || topic.children || [];
      (Array.isArray(children) ? children : []).forEach((child) => walk(child, nextPath));
    };
    if (jsonEntry) {
      try {
        const payload = JSON.parse(decodeKnowledgeText(jsonEntry));
        (Array.isArray(payload) ? payload : payload.sheets || []).forEach((sheet) => walk(sheet.rootTopic || sheet.root || sheet));
      } catch { /* fall through to XML */ }
    }
    if (!segments.length && entries.has("content.xml")) {
      const xml = decodeKnowledgeText(entries.get("content.xml"));
      (xml.match(/<title>([\s\S]*?)<\/title>/gi) || []).forEach((item, index) => {
        const title = decodeXml(item.replace(/^<title>|<\/title>$/gi, ""));
        if (title) segments.push({ text: title, metadata: { locatorType: "xmind-node", locator: `节点 ${index + 1}`, nodePath: [title] } });
      });
    }
    const texts = segments.length ? segments.map((item) => item.text) : ["XMind中没有可提取的主题节点"];
    return { contentType: "xmind", segments: texts, segmentMetadata: segments.map((item) => item.metadata), preview: texts.join("\n").slice(0, 80000) };
  }
  if (["docx", "pptx"].includes(ext)) {
    const entries = await unzipLocalEntries(await file.arrayBuffer());
    const names = [...entries.keys()].filter((name) => ext === "docx" ? name === "word/document.xml" : /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const segmented = names.flatMap((name) => officeParagraphs(decodeKnowledgeText(entries.get(name)), ext === "docx" ? "w:p" : "a:p", ext === "docx" ? "w:t" : "a:t").map((text, index) => ({ text, metadata: { locatorType: ext === "docx" ? "paragraph" : "slide", locator: ext === "docx" ? `段落 ${index + 1}` : `幻灯片 ${Number(name.match(/slide(\d+)/i)?.[1] || 0)}`, slide: ext === "pptx" ? Number(name.match(/slide(\d+)/i)?.[1] || 0) : undefined, paragraph: ext === "docx" ? index + 1 : undefined } })));
    const segments = segmented.length ? segmented.map((item) => item.text) : ["文档中没有可提取的文本"];
    return { contentType: ext === "docx" ? "word" : "ppt", segments, segmentMetadata: segmented.map((item) => item.metadata), preview: segments.join("\n").slice(0, 80000) };
  }
  if (["xlsx", "xls", "xlsm"].includes(ext)) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const segmentMetadata = [];
    const lines = workbook.SheetNames.flatMap((sheetName) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", blankrows: false });
      return rows.map((row, rowIndex) => {
        const values = row.map((cell) => String(cell ?? "").trim()).filter(Boolean);
        const line = `${sheetName} | ${values.join(" | ")}`;
        if (line.length > sheetName.length + 3) segmentMetadata.push({ locatorType: "sheet", locator: `${sheetName}!第${rowIndex + 1}行`, sheet: sheetName, row: rowIndex + 1 });
        return line.length > sheetName.length + 3 ? line : null;
      }).filter(Boolean);
    });
    return { contentType: "excel", segments: lines, segmentMetadata, preview: lines.join("\n").slice(0, 80000) };
  }
  const text = decodeKnowledgeText(await file.arrayBuffer()).replace(/\r/g, "").trim();
  const segments = text ? text.match(/[\\s\\S]{1,3500}/g) || [] : [];
  return { contentType: ext === "pdf" ? "pdf" : "text", segments, preview: text.slice(0, 80000) };
};

const knowledgeFileHash = async (file) => {
  const buffer = await file.arrayBuffer();
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `${file.name}:${file.size}:${file.lastModified}`;
};

const questionHeaderAliases = {
  stem: ["题干", "问题", "题目", "QuestionText", "Question"], type: ["类型", "题型", "题目类型", "Type"],
  optionA: ["选项A", "A选项", "答案A", "选项1", "OptionA"], optionB: ["选项B", "B选项", "答案B", "选项2", "OptionB"],
  optionC: ["选项C", "C选项", "答案C", "选项3", "OptionC"], optionD: ["选项D", "D选项", "答案D", "选项4", "OptionD"],
  options: ["选项", "备选项", "答案选项", "选项内容", "Options"], answer: ["正确答案", "正确选项", "标准答案", "答案", "CorrectAnswer", "Answer"],
  explanation: ["解析", "说明", "Explanation"], roles: ["适用角色", "ApplicableRoles"], categories: ["问题类别", "IssueCategories"], knowledge: ["知识标题", "KnowledgeTitle"],
};
const normalizedHeader = (value) => String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
const parseQuestionType = (value) => /判断|truefalse/i.test(String(value || "")) ? "TrueFalse" : /多选|multichoice/i.test(String(value || "")) ? "MultiChoice" : /简答|shortanswer/i.test(String(value || "")) ? "ShortAnswer" : "SingleChoice";
const parseOptions = (row, header, type) => {
  if (type === "TrueFalse") return ["正确", "错误"];
  const direct = ["optionA", "optionB", "optionC", "optionD"].map((key) => row[header[key]]).map((value) => String(value ?? "").trim()).filter(Boolean);
  if (direct.length) return direct;
  const combined = String(row[header.options] ?? "").replace(/[；;|]/g, "\n");
  return combined.split(/\r?\n/).map((value) => value.replace(/^\s*[A-DＡ-Ｄ][.．、:：)）]\s*/i, "").trim()).filter(Boolean);
};
const parseAnswerIndexes = (value, options, type) => {
  const text = String(value ?? "").trim();
  if (type === "ShortAnswer") return { answer: -1, correctAnswers: [], answerText: text };
  const parts = type === "MultiChoice" ? text.split(/[、,，;；\s]+/).filter(Boolean) : [text];
  const indexes = parts.map((part) => {
    const normalized = part.replace(/^选项/, "").trim().toUpperCase();
    if (/^[A-D]$/.test(normalized)) return normalized.charCodeAt(0) - 65;
    if (/^\d+$/.test(normalized)) { const number = Number(normalized); return number < options.length ? number : number - 1; }
    if (/正确|是|TRUE/i.test(normalized)) return 0;
    if (/错误|否|FALSE/i.test(normalized)) return 1;
    return options.findIndex((option) => option === part || option.includes(part) || part.includes(option));
  }).filter((index) => index >= 0 && index < options.length);
  return { answer: indexes[0] ?? -1, correctAnswers: [...new Set(indexes)], answerText: text };
};

const parseQuestionWorkbook = async (file) => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "", blankrows: false });
  const headerRow = rows.findIndex((row) => row.some((cell) => questionHeaderAliases.stem.some((alias) => normalizedHeader(alias) === normalizedHeader(cell))));
  if (headerRow < 0) throw new Error("无法识别题干列，请使用题干、问题、题目或 QuestionText 作为表头");
  const headers = rows[headerRow].map(normalizedHeader);
  const header = Object.fromEntries(Object.entries(questionHeaderAliases).map(([key, aliases]) => [key, headers.findIndex((cell) => aliases.some((alias) => normalizedHeader(alias) === cell))]).filter(([, index]) => index >= 0));
  return rows.slice(headerRow + 1).map((row, index) => {
    const stem = String(row[header.stem] ?? "").trim();
    if (!stem) return null;
    const type = parseQuestionType(row[header.type]);
    const options = parseOptions(row, header, type);
    const answer = parseAnswerIndexes(row[header.answer], options, type);
    if (type !== "ShortAnswer" && (!options.length || answer.answer < 0)) return null;
    return { id: `${file.name}-${Date.now()}-${index}`, stem, type, options, answer: answer.answer, correctAnswers: answer.correctAnswers, answerText: answer.answerText, explanation: String(row[header.explanation] ?? "").trim(), roles: String(row[header.roles] ?? "").trim(), categories: String(row[header.categories] ?? "").trim(), knowledge: String(row[header.knowledge] ?? "").trim(), sourceFileName: file.name };
  }).filter(Boolean);
};

const parseGeneratedQuestionJson = (content) => {
  const text = String(content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let value;
  try { value = JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("模型没有返回可识别的题目 JSON");
    try { value = JSON.parse(match[0]); } catch { throw new Error("题目 JSON 格式无效，请重新生成"); }
  }
  const rows = Array.isArray(value) ? value : value.questions || value.rows || value.items || [];
  if (!Array.isArray(rows)) throw new Error("题目结果不是数组");
  return rows;
};

const normalizeGeneratedQuestions = (rows, sourceFile, skill = {}) => rows.map((item, index) => {
  const stem = String(item.stem || item.question || item.题干 || item.问题 || "").trim();
  if (!stem) return null;
  const type = parseQuestionType(item.type || item.questionType || item.类型 || item.题型);
  const directOptions = [item.optionA || item.选项A, item.optionB || item.选项B, item.optionC || item.选项C, item.optionD || item.选项D].map((value) => String(value ?? "").trim()).filter(Boolean);
  const options = type === "TrueFalse" ? ["正确", "错误"] : (Array.isArray(item.options) ? item.options : directOptions).map((value) => String(value ?? "").trim()).filter(Boolean).slice(0, 4);
  const answerValue = item.answer ?? item.correctAnswer ?? item.correct ?? item.正确答案 ?? item.答案 ?? "";
  const answer = parseAnswerIndexes(answerValue, options, type);
  if (type !== "ShortAnswer" && (!options.length || answer.answer < 0)) return null;
  return {
    id: `knowledge-${sourceFile.id}-${Date.now()}-${index}`,
    stem,
    type,
    options,
    answer: answer.answer,
    correctAnswers: answer.correctAnswers,
    answerText: answer.answerText,
    explanation: String(item.explanation || item.解析 || item.reason || "").trim(),
    roles: String(item.roles || item.applicableRoles || item.适用角色 || "").trim(),
    categories: String(item.categories || item.category || item.issueCategory || item.问题类别 || sourceFile.category || "知识文档").trim(),
    knowledge: String(item.knowledge || item.knowledgeTitle || item.知识标题 || sourceFile.name).trim(),
    sourceFileName: sourceFile.name,
    sourceKnowledgeId: sourceFile.id,
    generatedBySkill: String(skill.name || skill.id || "generate-qms-exam-bank"),
    generatedBySkillId: String(skill.id || "generate-qms-exam-bank"),
    generatedAt: new Date().toISOString(),
  };
}).filter(Boolean);

function QmdpPageHeader({ icon: Icon = Database, eyebrow, title, description, action }) {
  return <div className="qmdp-page-header"><div className="qmdp-page-title"><span className="qmdp-page-icon"><Icon size={23}/></span><div><small>{eyebrow}</small><h2>{title}</h2><p>{description}</p></div></div>{action}</div>;
}

function QmdpStatStrip({ items }) {
  return <div className={`qmdp-stat-strip ${items.length === 4 ? "is-four" : ""}`}>{items.map((item) => <div key={item.label}><span>{item.label}</span><strong className={item.tone || ""}>{item.value}</strong><small>{item.note || ""}</small></div>)}</div>;
}

const knowledgeCell = (row, keys) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
};
const knowledgeFieldAudit = (row = {}) => {
  const metadata = row.metadata || {};
  const checks = [
    ["知识类型", row.type],
    ["标题", row.title],
    ["知识内容", row.content],
    ["原文引用", row.sourceCitations],
  ];
  const missing = checks.filter(([, value]) => !(Array.isArray(value) ? value.length : String(value || "").trim())).map(([label]) => label);
  return { total: checks.length, complete: checks.length - missing.length, missing };
};

const knowledgeEditValue = (value) => Array.isArray(value) ? value.join("；") : String(value || "");
const knowledgeEditArray = (value) => String(value || "").split(/[；;\n]/).map((item) => item.trim()).filter(Boolean);

function KnowledgeReviewCard({ row, onAction, onOpenGovernance, selected = false, onToggleSelect, ordinal, sourceDocument = "" }) {
  const metadata = row.metadata || {};
  const audit = knowledgeFieldAudit(row);
  const [actionState, setActionState] = useState({ action: "", message: "", ok: true });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const list = (value) => Array.isArray(value) && value.length ? value.join("；") : String(value || "");
  const commonViolations = Array.isArray(metadata.commonViolations) ? metadata.commonViolations.filter((item) => item?.status === "confirmed" && item.pattern) : [];
  const status = row.publicationStatus === "published" ? "已发布" : row.publicationStatus === "approved" ? "已初审" : row.publicationStatus === "rejected" ? "已退回" : row.publicationStatus === "conflict" ? "存在冲突" : "候选待复核";
  const startEditing = () => {
    setDraft({ title: row.title || "", content: row.content || "", originalFact: metadata.originalFact || "", correctState: metadata.correctState || "", applicableScope: knowledgeEditValue(metadata.applicableScope), notApplicableScope: knowledgeEditValue(metadata.notApplicableScope), issueTags: knowledgeEditValue(row.issueTags) });
    setEditing(true);
    setActionState({ action: "", message: "请修改知识卡内容，保存后状态回到待复核。", ok: true });
  };
  const runAction = async (action, payload = {}) => {
    if (actionState.action) return;
    setActionState({ action, message: "正在保存审核结果…", ok: true });
    const result = await onAction(row, action, payload);
    setActionState({ action: "", message: result?.message || (result?.ok ? "审核结果已保存" : "操作失败"), ok: result?.ok !== false });
    if (result?.ok && action === "return") setEditing(false);
  };
  const saveChanges = () => runAction("return", { changes: { title: draft.title, content: draft.content, issueTags: knowledgeEditArray(draft.issueTags), metadata: { originalFact: draft.originalFact, correctState: draft.correctState, applicableScope: knowledgeEditArray(draft.applicableScope), notApplicableScope: knowledgeEditArray(draft.notApplicableScope) } } });
  return <article className={`qmdp-knowledge-review-card ${row.publicationStatus || "candidate"}`}>
    <header><div className="qmdp-review-card-title"><span className="qmdp-knowledge-ordinal">{ordinal || "-"}</span><input type="checkbox" checked={selected} onChange={() => onToggleSelect?.(row.id)} aria-label={`选择知识卡：${row.title || "未命名知识点"}`}/><div><b>{row.title || "未命名知识点"}</b><span>{row.type || "未分类"} · {status} · 来源{row.sourceLevel || "C"}级 · 可信度 {Math.round(Number(row.confidence || 0) * 100)}%</span></div></div><strong className={audit.missing.length ? "is-incomplete" : "is-complete"}>字段 {audit.complete}/{audit.total}</strong></header>
    {editing ? <div className="qmdp-knowledge-edit-form qmdp-knowledge-statement">
      <section className="qmdp-knowledge-zone knowledge-zone-main"><span className="qmdp-zone-label">知识 / 事实</span>
        <label>知识标题<input value={draft.title || ""} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}/></label>
        <label>知识内容<textarea rows="3" value={draft.content || ""} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}/></label>
        <label>原文事实<textarea rows="3" value={draft.originalFact || ""} onChange={(event) => setDraft((current) => ({ ...current, originalFact: event.target.value }))}/></label>
        <label>正确状态<textarea rows="3" value={draft.correctState || ""} onChange={(event) => setDraft((current) => ({ ...current, correctState: event.target.value }))}/></label>
      </section>
      <section className="qmdp-knowledge-zone knowledge-zone-scope"><span className="qmdp-zone-label">适用范围</span>
        <label>适用范围<textarea rows="2" value={draft.applicableScope || ""} onChange={(event) => setDraft((current) => ({ ...current, applicableScope: event.target.value }))} placeholder="多项用分号分隔"/></label>
        <label>明确例外<textarea rows="2" value={draft.notApplicableScope || ""} onChange={(event) => setDraft((current) => ({ ...current, notApplicableScope: event.target.value }))} placeholder="没有例外可留空"/></label>
      </section>
      <section className="qmdp-knowledge-zone knowledge-zone-tags"><span className="qmdp-zone-label">检索标签</span>
        <label>问题标签<textarea rows="2" value={draft.issueTags || ""} onChange={(event) => setDraft((current) => ({ ...current, issueTags: event.target.value }))} placeholder="多项用分号分隔"/></label>
      </section>
      <footer><button className="qmdp-secondary-btn" onClick={() => setEditing(false)} disabled={Boolean(actionState.action)}><X size={14}/>取消</button><button className="qmdp-primary-btn" onClick={saveChanges} disabled={Boolean(actionState.action) || !String(draft.title || '').trim() || !String(draft.content || '').trim()}><FloppyDisk size={14}/>保存修改并待复核</button></footer>
    </div> : <div className="qmdp-knowledge-statement">
      <section className="qmdp-knowledge-zone knowledge-zone-main"><span className="qmdp-zone-label">知识 / 事实</span><div className="qmdp-knowledge-lead"><strong>{row.content}</strong>{metadata.originalFact && metadata.originalFact !== row.content && <p>{metadata.originalFact}</p>}</div>{metadata.correctState && <div className="qmdp-knowledge-detail-line"><b>正确状态</b><span>{metadata.correctState}</span></div>}</section>
      {(metadata.applicableScope?.length || metadata.notApplicableScope?.length) ? <section className="qmdp-knowledge-zone knowledge-zone-scope"><span className="qmdp-zone-label">适用范围</span><p>{metadata.applicableScope?.length ? `适用：${list(metadata.applicableScope)}` : ""}{metadata.notApplicableScope?.length ? <><br/>例外：{list(metadata.notApplicableScope)}</> : null}</p></section> : null}
      {commonViolations.length > 0 && <section className="qmdp-knowledge-zone knowledge-zone-violations"><span className="qmdp-zone-label">常见违规表现</span><p>{commonViolations.map((item) => `${item.pattern}${item.frequency ? `（${item.frequency}次）` : ""}`).join("；")}</p></section>}
      {(row.issueTags?.length || row.synonyms?.length) ? <section className="qmdp-knowledge-zone knowledge-zone-tags"><span className="qmdp-zone-label">检索标签</span><p>{list(row.issueTags)}{row.synonyms?.length ? ` · ${list(row.synonyms)}` : ""}</p></section> : null}
    </div>}
    <blockquote className="qmdp-knowledge-source"><strong>原文依据</strong><span>{(row.sourceCitations || []).map((item) => `${item.clauseNumber || item.clauseId || "原文"}：${item.quote}`).join("；") || "缺少逐字原文引用"}</span></blockquote>
    <div className="qmdp-knowledge-origin"><span><b>知识来源</b>{sourceDocument || row.documentName || row.metadata?.sourceDocument || "来源文档待补充"}</span><span><b>具体章节</b>{(row.sourceCitations || []).map((item) => [item.sectionPath, item.clauseNumber].filter(Boolean).join(" · ")).filter(Boolean).join("；") || "章节定位待补充"}</span></div>
    {actionState.message && <div className={`qmdp-knowledge-action-status ${actionState.ok ? "ok" : "error"}`}>{actionState.message}</div>}
    {!editing && <footer className="qmdp-file-actions"><button className="qmdp-secondary-btn" onClick={startEditing} disabled={Boolean(actionState.action)}><X size={14}/>退回修改</button><button className="qmdp-primary-btn" onClick={() => runAction("publish")} disabled={Boolean(actionState.action)} title="直接发布当前知识卡"><ShieldCheck size={14}/>发布知识</button></footer>}
    {!editing && (row.publicationStatus === "conflict" || (!actionState.ok && actionState.message.includes("发布门禁"))) && <div className="qmdp-knowledge-next-actions"><span>{row.publicationStatus === "conflict" ? "下一步：到版本与治理建立冲突评审单，明确采用规则和适用范围。" : "下一步：完善文档等级、版本、Owner和下次复审日期，再重新发布。"}</span><button className="qmdp-secondary-btn" onClick={() => onOpenGovernance?.(row.documentId)}><GearSix size={14}/>打开版本与治理</button></div>}
  </article>;
}
const knowledgeIssueSources = (sources = [], module) => {
  const byKey = new Map();
  sources.filter((source) => source?.module === module && Array.isArray(source.rows)).forEach((source) => {
    const key = `${source.module}:${source.subKind || ""}:${source.name || source.fileName || ""}`;
    const previous = byKey.get(key);
    if (!previous || (source.rows?.length || 0) >= (previous.rows?.length || 0)) byKey.set(key, source);
  });
  return [...byKey.values()];
};
const buildKnowledgeIssuePayloads = (sources = [], module) => knowledgeIssueSources(sources, module).flatMap((source) => (source.rows || []).map((row, rowIndex) => {
  const personName = module === "IPQC"
    ? knowledgeCell(row, ["送检人"])
    : knowledgeCell(row, ["__engineer", "研发工程师", "工程师", "RD工程师", "工程师姓名", "责任人/处理人", "责任人\\处理人", "责任人", "责任人（工程师）", "问题责任人", "申请人", "创建人"]);
  const issueType = knowledgeCell(row, module === "IPQC" ? ["不良类型", "问题类型", "问题分类"] : ["问题类型", "问题分类", "问题类别", "类别", "阶段", "问题来源"]);
  const issueText = knowledgeCell(row, module === "IPQC" ? ["不良内容", "问题描述", "问题内容"] : ["问题描述", "问题内容", "问题", "不良内容", "变更原因", "问题类型"]);
  if (!personName || (!issueType && !issueText)) return null;
  const issueDate = knowledgeCell(row, ["日期", "检验日期", "送检日期", "发生日期", "申请日期", "更新日期", "创建日期", "问题日期", "反馈日期", "关闭日期"]);
  const sourceFile = String(source.name || source.fileName || "未命名数据源");
  const sourceIdentity = String(source.relativePath || source.uploadedName || sourceFile);
  return {
    module,
    issueKind: module === "IPQC" ? "组装过程问题" : knowledgeCell(row, ["问题来源"]) || "研发质量问题",
    personName,
    issueDate,
    issueType: issueType || "未分类",
    issueText: issueText || issueType,
    sourceFile,
    sourceKey: `${module}:${sourceIdentity}:${rowIndex}`,
    metadata: {
      rowIndex,
      site: knowledgeCell(row, ["基地", "厂区", "区域", "地点"]),
      workshop: knowledgeCell(row, ["交付工坊", "工坊", "供应商"]),
      project: knowledgeCell(row, ["项目名称", "项目", "机型", "产品名称"]),
      projectStage: knowledgeCell(row, ["项目阶段", "评审阶段", "阶段"]),
      brandModel: knowledgeCell(row, ["品牌/型号", "品牌型号", "产品型号", "型号", "品牌"]),
      productDept: knowledgeCell(row, ["产品部", "事业部", "部门", "所属部门"]),
      pm: knowledgeCell(row, ["PM", "项目经理"]),
      tpm: knowledgeCell(row, ["TPM"]),
      productionDirector: knowledgeCell(row, ["产总", "产品总监"]),
      leader: knowledgeCell(row, ["机长", "组长"]),
      manager: knowledgeCell(row, ["交付经理", "经理"]),
      problemSource: knowledgeCell(row, ["问题来源", "阶段"]),
    },
  };
}).filter(Boolean));

const emptyRecurrenceAction = { basis: [], templateId: "", deviation: "", rootCause: "", scope: "", fallbackPlan: "", actionType: "mixed", actionText: "", owner: "", collaborators: "", reviewer: "", dueDate: "", implementedAt: "", verificationMethod: "", verificationEvidence: "", observationUntil: "", status: "open", effectiveness: "pending" };
const correctionActionTemplates = {
  IPQC: [{ id: "first-piece-gate", name: "首件门禁", actionType: "physical", actionText: "首件确认未完成不得转入批量生产；将确认结果绑定工单并保留复核记录。", verificationMethod: "抽查工单首件记录与现场放行状态，连续3批无未确认放行。" }, { id: "fixture-poka-yoke", name: "工装/防错", actionType: "physical", actionText: "增加工装定位或防错结构，阻断错装、漏装和方向错误进入下一工序。", verificationMethod: "现场挑战测试防错有效性，并统计措施后重复问题。" }, { id: "parameter-lock", name: "参数/扭矩锁定", actionType: "logical", actionText: "锁定关键参数和扭矩窗口，超限时禁止放行并触发升级。", verificationMethod: "导出参数记录，验证超限拦截和复核闭环。" }, { id: "process-metric", name: "过程度量监控", actionType: "measurement", actionText: "建立工位级异常密度和重复问题看板，超过阈值自动升级。", verificationMethod: "按周比较异常密度、重复问题和逾期关闭率。" }],
  DQA: [{ id: "bom-version-gate", name: "BOM/图纸版本门禁", actionType: "logical", actionText: "设计发布前强制校验BOM、图纸和变更单版本一致，未通过不得下发。", verificationMethod: "抽查发布记录和版本校验日志，验证无旧版物料下发。" }, { id: "interference-review", name: "3D干涉与可达性评审", actionType: "physical", actionText: "在设计评审阶段完成3D干涉、装配可达性和安全间距检查，并保留截图或报告。", verificationMethod: "抽样复核评审清单、模型报告和后端再暴露问题。" }, { id: "tolerance-validation", name: "关键公差/参数验证", actionType: "measurement", actionText: "对关键尺寸、公差和选型参数建立计算或试验验证记录，缺证据不得放行。", verificationMethod: "核验计算书/试验报告与设计输出的一致性。" }, { id: "fat-evidence-gate", name: "FAT测试证据门", actionType: "logical", actionText: "将关键功能、安全和异常场景纳入FAT用例，测试证据齐套后才能关闭设计风险。", verificationMethod: "按用例清单复核测试结果、异常关闭和复测记录。" }],
};
const recurrenceStateText = { first: "首次发生", recurrent_open: "重复发生待改善", observing: "改善观察中", effective: "验证有效", ineffective: "措施无效", recurred_after_action: "措施后再次复发" };
const exactText = (left, right) => String(left || "").trim() && String(left || "").trim() === String(right || "").trim();
const suggestKnowledgeOwners = (module, recurrence) => {
  const config = { ...defaultQmdpSystemConfig, ...safeParse(localStorage.getItem(qmdpSystemKey), {}) };
  const metadata = recurrence?.issues?.map((item) => item.metadata || {}).find((item) => Object.values(item).some(Boolean)) || {};
  if (module === "IPQC") {
    if (metadata.leader || metadata.manager) return { owner: metadata.leader || metadata.manager, collaborators: [metadata.manager].filter((item) => item && item !== metadata.leader), basis: "问题原始字段：机长/交付经理" };
    const mapping = (config.supplyMappings || []).find((item) => item.active !== false && exactText(item.workshop, metadata.workshop) && (!metadata.site || !item.site || exactText(item.site, metadata.site)));
    return mapping ? { owner: mapping.leader || mapping.manager || "", collaborators: [mapping.manager].filter((item) => item && item !== mapping.leader), basis: `供应链映射：${mapping.site || "未标基地"} / ${mapping.workshop}` } : { owner: "", collaborators: [], basis: "未找到厂区+工坊精确映射，待人工核实" };
  }
  if (metadata.pm || metadata.tpm || metadata.productionDirector) return { owner: metadata.pm || metadata.tpm || "", collaborators: [metadata.tpm, metadata.productionDirector].filter((item, index, rows) => item && item !== (metadata.pm || metadata.tpm) && rows.indexOf(item) === index), basis: "问题原始字段：PM/TPM/产总" };
  const mapping = (config.orgMappings || []).find((item) => item.active !== false && ((metadata.productDept && exactText(item.productDept, metadata.productDept)) || (metadata.pm && exactText(item.pm, metadata.pm)) || (metadata.tpm && exactText(item.tpm, metadata.tpm))));
  return mapping ? { owner: mapping.pm || mapping.tpm || "", collaborators: [mapping.tpm, mapping.productionDirector].filter((item, index, rows) => item && item !== (mapping.pm || mapping.tpm) && rows.indexOf(item) === index), basis: `研发组织映射：${mapping.productDept || "产品部待核实"}` } : { owner: "", collaborators: [], basis: "未找到产品部/PM/TPM精确映射，待人工核实" };
};
function KnowledgeRecurrenceWorkspace({ module }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ total: 0, repeated: 0, afterAction: 0, effective: 0 });
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [form, setForm] = useState(emptyRecurrenceAction);
  const [requestState, setRequestState] = useState({ status: "idle", message: "读取已确认规范形成的复发分组" });
  const pageSize = 20;
  const refresh = useCallback(async (silent = false) => {
    try {
      if (!silent) setRequestState({ status: "running", message: "正在读取复发证据…" });
      const response = await loadKnowledgeRecurrences({ module, query, state: stateFilter, limit: pageSize, offset: page * pageSize });
      const nextRows = response.recurrences || [];
      setRows(nextRows);
      setTotal(Number(response.total || 0));
      setSummary({ total: 0, repeated: 0, afterAction: 0, effective: 0, ...(response.summary || {}) });
      setSelectedKey((current) => nextRows.some((item) => item.recurrenceKey === current) ? current : nextRows[0]?.recurrenceKey || "");
      if (!silent) setRequestState({ status: "done", message: nextRows.length ? `已读取 ${response.total} 个复发分组` : "暂无已确认规范形成的复发分组" });
    } catch (error) { setRequestState({ status: "error", message: `复发闭环读取失败：${error?.message || error}` }); }
  }, [module, query, stateFilter, page]);
  useEffect(() => { refresh(false); }, [refresh]);
  useEffect(() => {
    // Running parse tasks are cancellable on the server; keep their delete
    // controls actionable even while the row is refreshing.
    document.querySelectorAll('.qmdp-task-job-delete[disabled]').forEach((button) => button.removeAttribute('disabled'));
  }, [jobs]);
  useEffect(() => { setPage(0); setSelectedKey(""); }, [module, stateFilter]);
  const selected = rows.find((item) => item.recurrenceKey === selectedKey) || null;
  const ownerSuggestion = useMemo(() => suggestKnowledgeOwners(module, selected), [module, selected]);
  useEffect(() => { const action = selected?.action || {}; setForm({ ...emptyRecurrenceAction, ...action, collaborators: (action.metadata?.collaborators || []).join("、"), reviewer: action.metadata?.reviewer || "" }); }, [selectedKey, selected?.action?.updatedAt]);
  const saveAction = async () => {
    if (!selected) return;
    setRequestState({ status: "running", message: "正在保存改善与验证证据…" });
    try {
      await saveKnowledgeRecurrenceAction(selected.recurrenceKey, { ...form, module: selected.module, personName: selected.personName, candidateKey: selected.candidateKey, metadata: { ...(form.metadata || {}), templateId: form.templateId || "", collaborators: form.collaborators.split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean), reviewer: form.reviewer } });
      await refresh(true);
      setRequestState({ status: "done", message: "改善台账已保存；系统已重新计算有效性和复发状态" });
    } catch (error) { setRequestState({ status: "error", message: `保存失败：${error?.message || error}` }); }
  };
  const reopenAction = () => setForm((current) => ({ ...current, status: "open", effectiveness: "pending", metadata: { ...(current.metadata || {}), reopenReason: selected?.recurredAfterAction ? "措施后再次复发" : "观察期复核无效" } }));
  return <><div className="qmdp-recurrence-summary"><div><span>复发分组</span><strong>{summary.total}</strong></div><div><span>重复发生</span><strong className="warning">{summary.repeated}</strong></div><div><span>措施后复发</span><strong className="danger">{summary.afterAction}</strong></div><div><span>验证有效</span><strong className="success">{summary.effective}</strong></div></div>
    <div className="qmdp-issue-match-toolbar"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="搜索人员、规范或问题内容"/><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="">全部状态</option><option value="recurred_after_action">措施后复发</option><option value="ineffective">措施无效</option><option value="recurrent_open">重复发生待改善</option><option value="observing">改善观察中</option><option value="effective">验证有效</option><option value="first">首次发生</option></select><span className={requestState.status}>{requestState.message}</span></div>
    <div className="qmdp-issue-match-body qmdp-recurrence-body"><aside><div className="qmdp-issue-list-head"><strong>{module} 复发分组</strong><span>{total} 组</span></div>{rows.map((item) => <button key={item.recurrenceKey} className={item.recurrenceKey === selectedKey ? "selected" : ""} onClick={() => setSelectedKey(item.recurrenceKey)}><span><b>{item.personName}</b><em className={`recurrence-${item.state}`}>{item.stateLabel || recurrenceStateText[item.state]}</em></span><strong>{item.knowledgeTitle}</strong><small>{item.occurrenceCount} 次发生 · 重复 {item.repeatCount} 次{item.recurredAfterExam ? " · 考试后再发" : ""}</small><i>{item.documentName}{item.clauseNumber ? ` · ${item.clauseNumber}` : ""}</i></button>)}{!rows.length && <div className="qmdp-empty compact">请先完成人工规范匹配</div>}<footer><button className="qmdp-secondary-btn" disabled={page <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>上一页</button><span>{page + 1} / {Math.max(1, Math.ceil(total / pageSize))}</span><button className="qmdp-secondary-btn" disabled={(page + 1) * pageSize >= total} onClick={() => setPage((value) => value + 1)}>下一页</button></footer></aside>
      <div className="qmdp-recurrence-detail">{selected ? <><header><div><small>{selected.documentName}{selected.clauseNumber ? ` · ${selected.clauseNumber}` : ""}</small><h4>{selected.personName} · {selected.knowledgeTitle}</h4><p>{selected.quote || "已确认规范条款"}</p></div><span className={`qmdp-recurrence-state ${selected.state}`}>{selected.stateLabel}</span></header><div className="qmdp-recurrence-evidence"><section><strong>发生证据</strong><b>{selected.occurrenceCount} 次</b><small>{selected.firstOccurredAt || "日期待核实"} 至 {selected.latestOccurredAt || "日期待核实"}</small></section><section><strong>最近考试</strong><b>{selected.latestExam ? `${selected.latestExam.score} 分` : "暂无"}</b><small>{selected.latestExam ? `${selected.latestExam.passed ? "通过" : "未通过"} · ${selected.latestExam.evidence === "exact" ? "精确规范关联" : "问题分类关联"}` : "尚无可关联考试"}</small></section><section><strong>复发判断</strong><b>{selected.recurredAfterAction ? "措施后再发" : selected.recurredAfterExam ? "考试后再发" : selected.repeatCount ? "周期内重复" : "首次"}</b><small>考试通过不能单独证明问题关闭</small></section></div><section className="qmdp-owner-suggestion"><div><strong>责任映射建议</strong><span>{ownerSuggestion.owner ? `建议Owner：${ownerSuggestion.owner}` : "Owner待人工核实"}{ownerSuggestion.collaborators.length ? ` · 协同：${ownerSuggestion.collaborators.join("、")}` : ""}</span><small>{ownerSuggestion.basis}；建议不会自动归责。</small></div><button className="qmdp-secondary-btn" disabled={!ownerSuggestion.owner} onClick={() => setForm((current) => ({ ...current, owner: ownerSuggestion.owner, collaborators: ownerSuggestion.collaborators.join("、") }))}>应用建议</button></section><section className="qmdp-recurrence-timeline"><h5>问题时间线</h5>{selected.issues.map((issue, index) => <div key={issue.id || `${issue.sourceKey}-${index}`}><i/><span>{issue.issueDate || "日期待核实"}</span><strong>{issue.issueType || "未分类"}</strong><p>{issue.issueText}</p></div>)}</section><section className="qmdp-recurrence-form"><header><div><h5>改善与有效性台账</h5><p>措施必须说明阻断机制；培训只能作为辅助措施。{form.observationUntil && form.observationUntil <= new Date().toISOString().slice(0, 10) && form.effectiveness === "pending" ? " 观察期已到，请复核有效性。" : ""}</p></div><div className="qmdp-inline-actions">{["ineffective", "recurred_after_action"].includes(selected.state) && <button className="qmdp-danger-btn" onClick={reopenAction}><ArrowsClockwise size={15}/>重开闭环</button>}<button className="qmdp-primary-btn" onClick={saveAction} disabled={requestState.status === "running"}><FloppyDisk size={15}/>保存闭环</button></div></header><div className="qmdp-recurrence-form-grid"><label>动作模板<select value={form.templateId} onChange={(event) => { const template = (correctionActionTemplates[module] || []).find((item) => item.id === event.target.value); setForm((current) => ({ ...current, templateId: event.target.value, ...(template ? { actionType: template.actionType, actionText: template.actionText, verificationMethod: template.verificationMethod } : {}) })); }}><option value="">不使用模板</option>{(correctionActionTemplates[module] || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>偏差描述<textarea rows="2" value={form.deviation} onChange={(event) => setForm((current) => ({ ...current, deviation: event.target.value }))} placeholder="实际发生了什么，与规范要求差在哪里"/></label><label>根因/机制<textarea rows="2" value={form.rootCause} onChange={(event) => setForm((current) => ({ ...current, rootCause: event.target.value }))} placeholder="填写可验证的流程、决策或控制机制"/></label><label>覆盖范围<textarea rows="2" value={form.scope} onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value }))} placeholder="涉及哪些项目、工位、人员或同类过程"/></label><label>失效回退<textarea rows="2" value={form.fallbackPlan} onChange={(event) => setForm((current) => ({ ...current, fallbackPlan: event.target.value }))} placeholder="措施失效时如何隔离、升级和重开"/></label><label>措施层级<select value={form.actionType} onChange={(event) => setForm((current) => ({ ...current, actionType: event.target.value }))}><option value="physical">物理防错</option><option value="logical">逻辑防错</option><option value="measurement">度量监控</option><option value="training">培训提醒</option><option value="mixed">组合措施</option></select></label><label>责任人<input value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}/></label><label>协同人<input value={form.collaborators} onChange={(event) => setForm((current) => ({ ...current, collaborators: event.target.value }))} placeholder="多人用顿号分隔"/></label><label>复核人<input value={form.reviewer} onChange={(event) => setForm((current) => ({ ...current, reviewer: event.target.value }))}/></label><label>计划完成日期<input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}/></label><label>实施日期<input type="date" value={form.implementedAt} onChange={(event) => setForm((current) => ({ ...current, implementedAt: event.target.value }))}/></label><label>观察期截止<input type="date" value={form.observationUntil} onChange={(event) => setForm((current) => ({ ...current, observationUntil: event.target.value }))}/></label><label>执行状态<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="open">待实施</option><option value="implemented">已实施</option><option value="verifying">验证中</option><option value="closed">已关闭</option></select></label><label>有效性结论<select value={form.effectiveness} onChange={(event) => setForm((current) => ({ ...current, effectiveness: event.target.value }))}><option value="pending">待验证</option><option value="effective">有效</option><option value="ineffective">无效</option></select></label><label className="wide">改善措施<textarea rows="3" value={form.actionText} onChange={(event) => setForm((current) => ({ ...current, actionText: event.target.value }))} placeholder="说明阻断哪条因果链、覆盖范围和失效回退"/></label><label className="wide">验证方法<textarea rows="2" value={form.verificationMethod} onChange={(event) => setForm((current) => ({ ...current, verificationMethod: event.target.value }))} placeholder="复检、现场观察、系统校验或复发率验证"/></label><label className="wide">验证证据<textarea rows="3" value={form.verificationEvidence} onChange={(event) => setForm((current) => ({ ...current, verificationEvidence: event.target.value }))} placeholder="填写可追溯记录、结果和证据位置"/></label></div></section></> : <div className="qmdp-empty"><Target size={30}/><strong>选择一个复发分组</strong><span>查看问题时间线、考试证据和改善有效性。</span></div>}</div>
    </div></>;
}

function KnowledgeReviewWorkbench() {
  const [rows, setRows] = useState([]);
  const [module, setModule] = useState("DQA");
  const [process, setProcess] = useState("");
  const [risk, setRisk] = useState("");
  const [project, setProject] = useState("");
  const [projectStage, setProjectStage] = useState("");
  const [brandModel, setBrandModel] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState({ module: "DQA", title: "", project: "", projectStage: "", brandModel: "", riskLevel: "unknown", owner: "", collaborators: "", reviewer: "", conclusion: "", reviewPoints: [] });
  const [status, setStatus] = useState("正在读取已发布评审点…");
  const refresh = useCallback(async () => {
    setStatus("正在按项目、阶段、品牌/型号和风险筛选评审点…");
    try {
      const [response, sessionResponse] = await Promise.all([loadKnowledgeReviewPoints({ module, process, risk, project, projectStage, brandModel, query, limit: 200 }), loadKnowledgeReviewSessions({ module, limit: 100 })]);
      setRows(response?.reviewPoints || []);
      setSessions(sessionResponse?.sessions || []);
      setStatus(response?.total ? `已读取 ${response.total} 条已发布评审点` : "暂无匹配评审点，请先发布带评审点的知识卡");
    } catch (error) { setRows([]); setStatus(`评审点读取失败：${error?.message || error}`); }
  }, [module, process, risk, project, projectStage, brandModel, query]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setSession((current) => ({ ...current, module })); }, [module]);
  const togglePoint = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const addSelectedPoints = () => {
    const existing = new Set(session.reviewPoints.map((item) => item.reviewPointId));
    const additions = rows.filter((item) => selectedIds.includes(item.id) && !existing.has(item.id)).map((item) => ({ reviewPointId: item.id, knowledgeId: item.knowledgeId, documentId: item.documentId, title: item.title, reviewPoint: item.reviewPoint, result: "pending", note: "", owner: "", dueDate: "", evidence: "", sourceLevel: item.sourceLevel }));
    setSession((current) => ({ ...current, reviewPoints: [...current.reviewPoints, ...additions], project: current.project || project, projectStage: current.projectStage || projectStage, brandModel: current.brandModel || brandModel, riskLevel: current.riskLevel === "unknown" ? risk || "unknown" : current.riskLevel }));
    setSelectedIds([]);
  };
  const updateReviewPoint = (id, patch) => setSession((current) => ({ ...current, reviewPoints: current.reviewPoints.map((item) => item.reviewPointId === id ? { ...item, ...patch } : item) }));
  const saveSession = async (nextStatus) => {
    setStatus("正在保存评审结论和证据…");
    try {
      const response = await saveKnowledgeReviewSession({ ...session, collaborators: session.collaborators.split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean), status: nextStatus });
      const saved = response.session;
      setSession({ ...saved, collaborators: (saved.collaborators || []).join("、") });
      await refresh();
      setStatus(saved.status === "blocked" && nextStatus === "completed" ? "存在不通过项，评审已自动保持阻断状态" : "评审会话已保存");
    } catch (error) { setStatus(`评审保存失败：${error?.message || error}`); }
  };
  const openSession = (item) => { setSession({ ...item, collaborators: (item.collaborators || []).join("、") }); setModule(item.module || "DQA"); };
  return <div className="qmdp-review-workbench"><div className="qmdp-review-filter-grid"><select value={module} onChange={(event) => setModule(event.target.value)}><option value="DQA">研发 / DQA</option><option value="IPQC">组装 / IPQC</option></select><input value={project} onChange={(event) => setProject(event.target.value)} placeholder="项目名称"/><input value={projectStage} onChange={(event) => setProjectStage(event.target.value)} placeholder="项目/评审阶段"/><input value={brandModel} onChange={(event) => setBrandModel(event.target.value)} placeholder="品牌/型号"/><select value={process} onChange={(event) => setProcess(event.target.value)}><option value="">全部过程</option>{["机械", "气动", "电气", "PLC", "视觉", "安全", "测试", "装配", "评审"].map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={risk} onChange={(event) => setRisk(event.target.value)}><option value="">全部风险</option><option value="critical">关键</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option><option value="unknown">待定</option></select><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索评审点或规范"/><span>{status}</span></div><div className="qmdp-review-layout"><section><header className="qmdp-review-section-head"><div><strong>可用评审点</strong><span>已选 {selectedIds.length} 条</span></div><button className="qmdp-primary-btn" disabled={!selectedIds.length} onClick={addSelectedPoints}><Plus size={15}/>加入本次评审</button></header><div className="qmdp-review-point-grid">{rows.map((item) => <article className={`qmdp-review-point-card ${selectedIds.includes(item.id) ? "selected" : ""}`} key={item.id}><header><label><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => togglePoint(item.id)}/><div><small>{item.documentName}{item.version ? ` · v${item.version}` : ""}</small><h4>{item.title}</h4></div></label><em className={`review-risk-${item.riskLevel}`}>{item.riskLevel === "unknown" ? "风险待定" : item.riskLevel}</em></header><p>{item.reviewPoint}</p><footer><span>{item.processes?.join("、") || "过程待标注"}</span><span>来源{item.sourceLevel}级</span>{item.projects?.length ? <span>项目：{item.projects.join("、")}</span> : null}{item.projectStages?.length ? <span>阶段：{item.projectStages.join("、")}</span> : null}{item.brandModels?.length ? <span>型号：{item.brandModels.join("、")}</span> : null}</footer></article>)}{!rows.length && <div className="qmdp-empty"><Target size={30}/><strong>暂无可调用评审点</strong><span>只有已发布知识卡中的评审点会进入工作台。</span></div>}</div></section><section className="qmdp-review-session"><header><div><strong>本次评审会话</strong><span>{session.reviewPoints.length} 个评审点</span></div><button className="qmdp-secondary-btn" onClick={() => setSession({ module, title: "", project, projectStage, brandModel, riskLevel: risk || "unknown", owner: "", collaborators: "", reviewer: "", conclusion: "", reviewPoints: [] })}>新建</button></header><div className="qmdp-recurrence-form-grid"><label>评审标题<input value={session.title || ""} onChange={(event) => setSession((current) => ({ ...current, title: event.target.value }))}/></label><label>项目<input value={session.project || ""} onChange={(event) => setSession((current) => ({ ...current, project: event.target.value }))}/></label><label>项目阶段<input value={session.projectStage || ""} onChange={(event) => setSession((current) => ({ ...current, projectStage: event.target.value }))}/></label><label>品牌/型号<input value={session.brandModel || ""} onChange={(event) => setSession((current) => ({ ...current, brandModel: event.target.value }))}/></label><label>Owner<input value={session.owner || ""} onChange={(event) => setSession((current) => ({ ...current, owner: event.target.value }))}/></label><label>协同人<input value={session.collaborators || ""} onChange={(event) => setSession((current) => ({ ...current, collaborators: event.target.value }))}/></label><label>Reviewer<input value={session.reviewer || ""} onChange={(event) => setSession((current) => ({ ...current, reviewer: event.target.value }))}/></label><label>风险<select value={session.riskLevel || "unknown"} onChange={(event) => setSession((current) => ({ ...current, riskLevel: event.target.value }))}><option value="critical">关键</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option><option value="unknown">待定</option></select></label><label className="wide">评审结论<textarea rows="2" value={session.conclusion || ""} onChange={(event) => setSession((current) => ({ ...current, conclusion: event.target.value }))}/></label></div><div className="qmdp-review-selected-list">{session.reviewPoints.map((item) => <article key={item.reviewPointId}><header><div><strong>{item.reviewPoint}</strong><small>{item.title} · 来源{item.sourceLevel}级</small></div><button className="qmdp-danger-btn" onClick={() => setSession((current) => ({ ...current, reviewPoints: current.reviewPoints.filter((row) => row.reviewPointId !== item.reviewPointId) }))}><X size={13}/></button></header><div><label>结果<select value={item.result} onChange={(event) => updateReviewPoint(item.reviewPointId, { result: event.target.value })}><option value="pending">待评审</option><option value="pass">通过</option><option value="fail">不通过</option><option value="na">不适用</option></select></label><label>责任人<input value={item.owner} onChange={(event) => updateReviewPoint(item.reviewPointId, { owner: event.target.value })}/></label><label>期限<input type="date" value={item.dueDate} onChange={(event) => updateReviewPoint(item.reviewPointId, { dueDate: event.target.value })}/></label><label className="wide">问题/意见<textarea rows="2" value={item.note} onChange={(event) => updateReviewPoint(item.reviewPointId, { note: event.target.value })}/></label><label className="wide">证据位置<textarea rows="2" value={item.evidence} onChange={(event) => updateReviewPoint(item.reviewPointId, { evidence: event.target.value })}/></label></div></article>)}{!session.reviewPoints.length && <div className="qmdp-empty compact">从左侧选择评审点加入本次评审。</div>}</div><footer className="qmdp-inline-actions"><button className="qmdp-secondary-btn" onClick={() => saveSession("draft")}><FloppyDisk size={14}/>保存草稿</button><button className="qmdp-secondary-btn" onClick={() => saveSession("in_review")}>开始评审</button><button className="qmdp-secondary-btn" onClick={() => saveSession("blocked")}>标记阻断</button><button className="qmdp-primary-btn" onClick={() => saveSession("completed")}><CheckCircle size={14}/>完成评审</button></footer></section></div><section className="qmdp-review-history"><header><strong>历史评审会话</strong><span>{sessions.length} 条</span></header><div>{sessions.map((item) => <button key={item.id} onClick={() => openSession(item)}><strong>{item.title || "未命名评审"}</strong><span>{item.project || "项目待填写"} · {item.projectStage || "阶段待填写"} · {item.brandModel || "型号待填写"}</span><em>{item.status}</em></button>)}{!sessions.length && <div className="qmdp-empty compact">暂无已保存评审会话。</div>}</div></section></div>;
}

function KnowledgeFeedbackWorkspace() {
  const [records, setRecords] = useState([]);
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState({ sourceType: "recurrence", sourceId: "", module: "", targetType: "checklist", title: "", content: "", owner: "", reviewer: "", status: "candidate" });
  const [message, setMessage] = useState("正在读取可反哺闭环…");
  const refresh = useCallback(async () => {
    try {
      const [feedback, reviews, ipqc, dqa] = await Promise.all([loadKnowledgeFeedbackRecords({ limit: 300 }), loadKnowledgeReviewSessions({ status: "completed", limit: 200 }), loadKnowledgeRecurrences({ module: "IPQC", state: "effective", limit: 100 }), loadKnowledgeRecurrences({ module: "DQA", state: "effective", limit: 100 })]);
      setRecords(feedback.records || []);
      setSources([...(reviews.sessions || []).map((item) => ({ type: "review", id: item.id, module: item.module, label: `评审 · ${item.title || item.project || item.id}` })), ...(ipqc.recurrences || []).map((item) => ({ type: "recurrence", id: item.recurrenceKey, module: "IPQC", label: `IPQC · ${item.personName} · ${item.knowledgeTitle}` })), ...(dqa.recurrences || []).map((item) => ({ type: "recurrence", id: item.recurrenceKey, module: "DQA", label: `DQA · ${item.personName} · ${item.knowledgeTitle}` }))]);
      setMessage("只显示已完成评审或已关闭且验证有效的纠偏闭环");
    } catch (error) { setMessage(`反哺台账读取失败：${error?.message || error}`); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const selectSource = (value) => { const source = sources.find((item) => `${item.type}:${item.id}` === value); setForm((current) => ({ ...current, sourceType: source?.type || "recurrence", sourceId: source?.id || "", module: source?.module || "", title: source ? `${source.label}反哺` : current.title })); };
  const save = async () => {
    setMessage("正在保存反哺记录…");
    try { const response = await saveKnowledgeFeedbackRecord(form); setForm((current) => ({ ...current, ...response.record })); await refresh(); setMessage("反哺记录已保存；正式应用仍需Owner和Reviewer人工确认"); }
    catch (error) { setMessage(`保存失败：${error?.message || error}`); }
  };
  return <div className="qmdp-feedback-workspace"><section className="qmdp-feedback-form"><header><div><strong>知识反哺登记</strong><span>{message}</span></div><button className="qmdp-primary-btn" onClick={save}><FloppyDisk size={15}/>保存台账</button></header><div className="qmdp-recurrence-form-grid"><label className="wide">来源<select value={form.sourceId ? `${form.sourceType}:${form.sourceId}` : ""} onChange={(event) => selectSource(event.target.value)}><option value="">选择已验证来源</option>{sources.map((item) => <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>{item.label}</option>)}</select></label><label>反哺目标<select value={form.targetType} onChange={(event) => setForm((current) => ({ ...current, targetType: event.target.value }))}><option value="checklist">Checklist</option><option value="dfmea">DFMEA</option><option value="question_bank">题库</option><option value="design_rule">设计规则</option></select></label><label>状态<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="candidate">候选</option><option value="approved">审核通过</option><option value="rejected">驳回</option><option value="applied">已应用</option></select></label><label>Owner<input value={form.owner || ""} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}/></label><label>Reviewer<input value={form.reviewer || ""} onChange={(event) => setForm((current) => ({ ...current, reviewer: event.target.value }))}/></label><label className="wide">标题<input value={form.title || ""} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}/></label><label className="wide">反哺内容<textarea rows="4" value={form.content || ""} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder="明确需要更新的检查项、失效模式、题目知识点或设计规则"/></label></div></section><section className="qmdp-feedback-ledger"><header><strong>Checklist / DFMEA / 题库 / 设计规则反哺台账</strong><span>{records.length} 条</span></header>{records.map((item) => <button key={item.id} onClick={() => setForm(item)}><span><strong>{item.title || "未命名反哺"}</strong><small>{item.module || "模块待核实"} · {item.sourceType} · {item.targetType}</small></span><em className={`feedback-${item.status}`}>{item.status}</em><i>{item.owner || "Owner待核实"} / {item.reviewer || "Reviewer待核实"}</i></button>)}{!records.length && <div className="qmdp-empty compact">暂无知识反哺记录。</div>}</section></div>;
}

const knowledgeJobStatusText = { waiting: "等待执行", running: "执行中", paused: "已停止", failed: "失败", completed: "已完成", review_required: "待复核", cancelled: "已取消" };
const knowledgeJobTypeText = { distill: "知识蒸馏", parse: "条款解析", pdf_parse: "PDF解析", image_parse: "图片OCR", ppt_parse: "PPT解析", ocr: "OCR任务" };
const knowledgeJobTypeOrder = { parse: 1, pdf_parse: 2, image_parse: 3, ppt_parse: 4, distill: 5, ocr: 6 };
const collapseKnowledgeJobs = (rows = []) => {
  const latest = new Map();
  rows.forEach((job) => {
    const key = ["failed", "cancelled"].includes(job.status) ? `invalid:${job.id}` : `${job.documentId || ""}:${job.jobType || ""}`;
    const previous = latest.get(key);
    if (!previous || String(job.createdAt || job.updatedAt || "") > String(previous.createdAt || previous.updatedAt || "")) latest.set(key, job);
  });
  return [...latest.values()];
};
const knowledgeReviewStateText = { overdue: "复审逾期", due_soon: "30天内复审", current: "有效期内", unscheduled: "未设复审" };
function KnowledgeGovernanceWorkspace({ files = [], isAdmin = false, onRefreshDocuments }) {
  const [conflicts, setConflicts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedId, setSelectedId] = useState(files[0]?.id || "");
  const [message, setMessage] = useState("正在读取治理索引…");
  const [metadataForm, setMetadataForm] = useState({ version: "", owner: "", reviewDue: "", accessLevel: "internal", sourceLevel: "C", replacesDocumentId: "" });
  const [conflictForm, setConflictForm] = useState({ leftDocumentId: "", rightDocumentId: "", scope: "", issue: "", temporaryMeasure: "", owner: "", dueDate: "" });
  const [decisions, setDecisions] = useState({});
  const selected = files.find((item) => item.id === selectedId) || files[0] || null;
  const names = useMemo(() => new Map(files.map((item) => [item.id, `${item.name}${item.version ? ` · ${item.version}` : ""}`])), [files]);
  const refresh = useCallback(async () => {
    try {
      const [conflictResponse, auditResponse] = await Promise.all([loadKnowledgeConflicts({ limit: 200 }), isAdmin ? loadKnowledgeAuditLogs({ limit: 200 }) : Promise.resolve({ logs: [] })]);
      setConflicts(conflictResponse.conflicts || []);
      setLogs(auditResponse.logs || []);
      setMessage("治理状态已更新");
    } catch (error) { setMessage(`治理数据读取失败：${error?.message || error}`); }
  }, [isAdmin]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!files.some((item) => item.id === selectedId)) setSelectedId(files[0]?.id || ""); }, [files, selectedId]);
  useEffect(() => { if (selected) setMetadataForm({ version: selected.version || "", owner: selected.owner || "", reviewDue: selected.reviewDue || "", accessLevel: selected.accessLevel || "internal", sourceLevel: selected.sourceLevel || "C", replacesDocumentId: selected.metadata?.replacesDocumentId || "" }); }, [selected?.id, selected?.version, selected?.owner, selected?.reviewDue, selected?.accessLevel, selected?.sourceLevel, selected?.metadata?.replacesDocumentId]);
  const saveMetadata = async () => {
    if (!selected || !isAdmin) return;
    try {
      await updateKnowledgeDocumentMetadata(selected.id, metadataForm);
      setMessage(`治理信息已保存，资料等级已标记为 ${metadataForm.sourceLevel} 级`);
      await onRefreshDocuments?.(true);
    } catch (error) { setMessage(`保存失败：${error?.message || error}`); }
  };
  const govern = async (action) => {
    if (!selected || !isAdmin) return;
    const payload = { action };
    if (action === "publish_version") payload.replacesDocumentId = metadataForm.replacesDocumentId || "";
    if (action === "complete_review") { payload.reviewDue = window.prompt("请输入下一次复审日期（YYYY-MM-DD）", selected.reviewDue || "") || ""; payload.note = window.prompt("请输入本次复审结论", "复审通过，继续有效") || ""; }
    if (action === "retire") payload.reason = window.prompt("请输入废止原因", "已被新版替代或不再适用") || "";
    try { await governKnowledgeDocument(selected.id, payload); await Promise.all([onRefreshDocuments?.(true), refresh()]); setMessage(action === "publish_version" ? "版本已发布" : action === "retire" ? "已逻辑废止，历史证据保留" : "复审状态已更新"); }
    catch (error) { setMessage(`治理操作失败：${error?.message || error}`); }
  };
  const createConflict = async () => {
    if (!isAdmin) return;
    try { await saveKnowledgeConflict(conflictForm); setConflictForm({ leftDocumentId: "", rightDocumentId: "", scope: "", issue: "", temporaryMeasure: "", owner: "", dueDate: "" }); await Promise.all([refresh(), onRefreshDocuments?.(true)]); setMessage("冲突评审单已建立，关联版本暂停正式使用"); }
    catch (error) { setMessage(`冲突评审单保存失败：${error?.message || error}`); }
  };
  const closeConflict = async (conflict) => {
    const decision = decisions[conflict.id] || "both_scoped";
    const resolution = window.prompt("请输入冲突评审结论和适用边界", conflict.resolution || "按适用范围分别执行") || "";
    try { await saveKnowledgeConflict({ ...conflict, status: "resolved", decision, resolution }); await Promise.all([refresh(), onRefreshDocuments?.(true)]); setMessage("冲突评审已关闭"); }
    catch (error) { setMessage(`冲突关闭失败：${error?.message || error}`); }
  };
  const openConflicts = conflicts.filter((item) => item.status === "open");
  return <div className="qmdp-governance-workspace"><section className="qmdp-governance-summary"><div><strong>{files.filter((item) => item.reviewState === "overdue").length}</strong><span>复审逾期</span></div><div><strong>{files.filter((item) => item.reviewState === "due_soon").length}</strong><span>30天内复审</span></div><div><strong>{openConflicts.length}</strong><span>未关闭冲突</span></div><div><strong>{files.filter((item) => item.governanceStatus === "已废止").length}</strong><span>历史废止版本</span></div><p>{message}</p></section><div className="qmdp-governance-layout"><aside><header><strong>版本与资料权限</strong><span>{files.length} 份</span></header>{files.map((file) => <button key={file.id} className={file.id === selected?.id ? "selected" : ""} onClick={() => setSelectedId(file.id)}><span><b>{file.name}</b><em>{file.version || "无版本"}</em></span><small>{file.sourceLevel}级 · {file.governanceStatus} · {knowledgeReviewStateText[file.reviewState] || file.reviewState}</small><i>{file.accessLevel === "restricted" ? "受限原件" : "内部资料"}{file.openConflictCount ? ` · ${file.openConflictCount}条冲突` : ""}</i></button>)}</aside><main>{selected ? <><section className="qmdp-governance-card"><header><div><small>选中知识版本</small><h4>{selected.name}</h4></div><span className={`review-${selected.reviewState}`}>{knowledgeReviewStateText[selected.reviewState] || selected.reviewState}</span></header><div className="qmdp-governance-fields"><label>版本<input value={metadataForm.version} onChange={(event) => setMetadataForm((current) => ({ ...current, version: event.target.value }))} disabled={!isAdmin}/></label><label>Owner<input value={metadataForm.owner} onChange={(event) => setMetadataForm((current) => ({ ...current, owner: event.target.value }))} disabled={!isAdmin}/></label><label>下次复审<input type="date" value={metadataForm.reviewDue} onChange={(event) => setMetadataForm((current) => ({ ...current, reviewDue: event.target.value }))} disabled={!isAdmin}/></label><label>原件权限<select value={metadataForm.accessLevel} onChange={(event) => setMetadataForm((current) => ({ ...current, accessLevel: event.target.value }))} disabled={!isAdmin}><option value="internal">内部可读</option><option value="restricted">受限资料</option></select></label><label className="wide">替代旧版<select value={metadataForm.replacesDocumentId} onChange={(event) => setMetadataForm((current) => ({ ...current, replacesDocumentId: event.target.value }))} disabled={!isAdmin}><option value="">不替代其它版本</option>{files.filter((item) => item.id !== selected.id).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.version || "无版本"}</option>)}</select></label></div><footer><button className="qmdp-secondary-btn" onClick={saveMetadata} disabled={!isAdmin}><FloppyDisk size={14}/>保存治理信息</button><button className="qmdp-secondary-btn" onClick={() => govern("request_review")} disabled={!isAdmin}><ClockCountdown size={14}/>提交复审</button><button className="qmdp-secondary-btn" onClick={() => govern("complete_review")} disabled={!isAdmin}><CheckCircle size={14}/>复审通过</button><button className="qmdp-primary-btn" onClick={() => govern("publish_version")} disabled={!isAdmin}><ShieldCheck size={14}/>发布当前版本</button><button className="qmdp-danger-btn" onClick={() => govern("retire")} disabled={!isAdmin}><X size={14}/>逻辑废止</button></footer>{!isAdmin && <small>治理操作仅管理员可执行；普通用户只能查看已授权知识索引。</small>}</section></> : <div className="qmdp-empty compact">暂无知识文档。</div>}<section className="qmdp-conflict-center"><header><strong>冲突评审单</strong><span>{openConflicts.length} 条待关闭</span></header>{isAdmin && <div className="qmdp-conflict-form"><select value={conflictForm.leftDocumentId} onChange={(event) => setConflictForm((current) => ({ ...current, leftDocumentId: event.target.value }))}><option value="">选择规则A</option>{files.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.version || "无版本"}</option>)}</select><select value={conflictForm.rightDocumentId} onChange={(event) => setConflictForm((current) => ({ ...current, rightDocumentId: event.target.value }))}><option value="">选择规则B</option>{files.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.version || "无版本"}</option>)}</select><input placeholder="冲突适用范围" value={conflictForm.scope} onChange={(event) => setConflictForm((current) => ({ ...current, scope: event.target.value }))}/><input placeholder="冲突说明" value={conflictForm.issue} onChange={(event) => setConflictForm((current) => ({ ...current, issue: event.target.value }))}/><input placeholder="评审期间临时措施" value={conflictForm.temporaryMeasure} onChange={(event) => setConflictForm((current) => ({ ...current, temporaryMeasure: event.target.value }))}/><input placeholder="Owner" value={conflictForm.owner} onChange={(event) => setConflictForm((current) => ({ ...current, owner: event.target.value }))}/><input type="date" value={conflictForm.dueDate} onChange={(event) => setConflictForm((current) => ({ ...current, dueDate: event.target.value }))}/><button className="qmdp-primary-btn" onClick={createConflict}><Plus size={14}/>建立冲突单</button></div>}<div className="qmdp-conflict-list">{conflicts.map((item) => <article key={item.id} className={`conflict-${item.status}`}><div><strong>{names.get(item.leftDocumentId) || item.leftDocumentId} ↔ {names.get(item.rightDocumentId) || item.rightDocumentId}</strong><small>{item.scope} · Owner {item.owner} · 截止 {item.dueDate}</small><p>{item.issue}</p><i>临时措施：{item.temporaryMeasure}</i>{item.resolution && <i>结论：{item.resolution}</i>}</div><em>{item.status === "open" ? "待评审" : item.status === "resolved" ? "已关闭" : "已撤回"}</em>{item.status === "open" && isAdmin && <footer><select value={decisions[item.id] || "both_scoped"} onChange={(event) => setDecisions((current) => ({ ...current, [item.id]: event.target.value }))}><option value="left">采用规则A</option><option value="right">采用规则B</option><option value="both_scoped">按范围分别适用</option></select><button className="qmdp-secondary-btn" onClick={() => closeConflict(item)}>关闭冲突</button></footer>}</article>)}{!conflicts.length && <div className="qmdp-empty compact">暂无冲突评审记录。</div>}</div></section><section className="qmdp-audit-ledger"><header><strong>知识治理审计日志</strong><span>{isAdmin ? `${logs.length} 条` : "仅管理员可见"}</span></header>{isAdmin ? logs.slice(0, 100).map((log) => <div key={log.id}><time>{formatSyncDateTime(log.createdAt)}</time><b>{log.actor || log.actorIp || "系统"}</b><span>{log.summary || log.action}</span><em>{log.action}</em></div>) : <div className="qmdp-empty compact">普通用户不显示治理审计明细。</div>}</section></main></div></div>;
}

function KnowledgePerformanceWorkspace({ isAdmin = false }) {
  const [metrics, setMetrics] = useState(null);
  const [message, setMessage] = useState("正在读取服务端性能指标…");
  const [running, setRunning] = useState(false);
  const [concurrency, setConcurrency] = useState(5);
  const [rounds, setRounds] = useState(3);
  const refresh = useCallback(async () => {
    if (!isAdmin) { setMessage("性能指标和只读基准仅管理员可查看"); return; }
    try { const response = await loadKnowledgePerformanceMetrics(); setMetrics(response.metrics || null); setMessage("已读取服务端实时指标"); }
    catch (error) { setMessage(`性能指标读取失败：${error?.message || error}`); }
  }, [isAdmin]);
  useEffect(() => { refresh(); }, [refresh]);
  const runBenchmark = async () => {
    setRunning(true);
    setMessage("正在执行只读并发测试：仅读取索引、分页详情和候选召回，不修改业务数据…");
    try { const response = await runKnowledgePerformanceBenchmark({ concurrency, rounds }); setMetrics(response.benchmark?.metrics || null); setMessage(`只读测试完成：并发 ${response.benchmark?.concurrency || concurrency}，总耗时 ${response.benchmark?.totalElapsedMs || 0}ms`); }
    catch (error) { setMessage(`只读测试失败：${error?.message || error}`); }
    finally { setRunning(false); }
  };
  const benchmark = metrics?.lastBenchmark;
  const operations = metrics?.operations || {};
  const search = metrics?.search || {};
  const recommendation = benchmark?.candidateSearch?.p95Ms > 800 || search.averageElapsedMs > 500 ? "全文检索需要继续调优；只有召回率也不足时才评估向量库。" : "当前延迟不支持引入向量库；继续使用PostgreSQL全文检索，先扩大资料量验证召回率。";
  const metricCard = (label, value, note) => <div><strong>{value}</strong><span>{label}</span><small>{note}</small></div>;
  const rows = [["文档索引", operations.document_index], ["条款分页", operations.clause_page], ["知识卡分页", operations.knowledge_page]];
  return <div className="qmdp-performance-workspace"><section className="qmdp-performance-toolbar"><div><small>阶段 8 · Read-only Performance</small><h4>知识库检索性能</h4><p>测试只读访问，不生成报告、不调用大模型、不修改快照或知识内容。</p></div>{isAdmin && <div><label>并发<select value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))} disabled={running}>{[1, 5, 10, 20].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>轮次<select value={rounds} onChange={(event) => setRounds(Number(event.target.value))} disabled={running}>{[1, 3, 5, 10].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="qmdp-primary-btn" onClick={runBenchmark} disabled={running}><Pulse size={14}/>{running ? "测试中…" : "启动只读测试"}</button><button className="qmdp-secondary-btn" onClick={refresh} disabled={running}><ArrowsClockwise size={14}/>刷新指标</button></div>}</section><p className="qmdp-performance-message">{message}</p>{metrics ? <><section className="qmdp-performance-summary">{metricCard("候选检索平均耗时", `${search.averageElapsedMs || 0} ms`, `${search.queries || 0}次检索`)}{metricCard("候选缓存命中率", `${Math.round(Number(search.cacheHitRate || 0) * 100)}%`, `语料版本 ${search.corpusRevision || 0}`)}{metricCard("全文检索最大耗时", `${search.maxElapsedMs || 0} ms`, `PostgreSQL ${search.postgresQueries || 0}次`)}{metricCard("服务端分页缓存", Number(metrics.caches?.clausePages || 0) + Number(metrics.caches?.knowledgePages || 0), `检索缓存 ${metrics.caches?.retrievals || 0}`)}</section><div className="qmdp-performance-layout"><section><header><strong>接口运行指标</strong><span>进程启动后累计</span></header>{rows.map(([label, item]) => <div className="qmdp-performance-row" key={label}><b>{label}</b><span>{item?.count || 0}次</span><span>平均 {item?.averageElapsedMs || 0}ms</span><span>缓存 {Math.round(Number(item?.cacheHitRate || 0) * 100)}%</span><em>最大 {item?.maxElapsedMs || 0}ms</em></div>)}</section><section><header><strong>最近只读并发基准</strong><span>{benchmark ? formatSyncDateTime(benchmark.completedAt) : "尚未执行"}</span></header>{benchmark ? <><div className="qmdp-performance-benchmark-head"><span>并发<strong>{benchmark.concurrency}</strong></span><span>轮次<strong>{benchmark.rounds}</strong></span><span>文档<strong>{benchmark.targetDocuments}</strong></span><span>问题<strong>{benchmark.targetIssues}</strong></span></div>{[["文档索引", benchmark.documentIndex], ["条款分页", benchmark.clausePage], ["知识卡分页", benchmark.knowledgePage], ["候选检索", benchmark.candidateSearch]].map(([label, item]) => <div className="qmdp-performance-row" key={label}><b>{label}</b><span>{item?.count || 0}次</span><span>P50 {item?.p50Ms || 0}ms</span><span>P95 {item?.p95Ms || 0}ms</span><em>最大 {item?.maxMs || 0}ms</em></div>)}</> : <div className="qmdp-empty compact">点击“启动只读测试”建立当前服务器基线。</div>}</section></div><section className="qmdp-vector-decision"><ShieldCheck size={20}/><div><strong>向量检索决策</strong><p>{recommendation}</p><small>向量检索不能替代版本、适用范围、资料等级和人工确认门禁。</small></div></section></> : <div className="qmdp-empty"><Pulse size={28}/><strong>暂无性能指标</strong><span>{isAdmin ? "刷新后查看服务端指标。" : "请由管理员进入此页面查看。"}</span></div>}</div>;
}


function KnowledgeTaskCenter({ files = [], onRefreshDocuments }) {
  const [open, setOpen] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [knowledgeExamCenterOpen, setKnowledgeExamCenterOpen] = useState(true);
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState([]);
  const [knowledgeCards, setKnowledgeCards] = useState([]);
  const [knowledgeCardTotal, setKnowledgeCardTotal] = useState(0);
  const [knowledgeCardStatusCounts, setKnowledgeCardStatusCounts] = useState({});
  const [knowledgeCardPage, setKnowledgeCardPage] = useState(0);
  const [knowledgeCardsLoading, setKnowledgeCardsLoading] = useState(false);
  const [knowledgeCardsError, setKnowledgeCardsError] = useState("");
  const [message, setMessage] = useState("正在读取知识任务索引…");
  const [checkedJobIds, setCheckedJobIds] = useState([]);
  const knowledgeCardRequestRef = useRef(0);
  const knowledgeCardPageSize = 12;
  const fileNames = useMemo(() => new Map(files.map((item) => [item.id, item.name])), [files]);
  const refresh = useCallback(async (silent = false) => {
    try {
      const response = await loadKnowledgeJobs();
      const next = collapseKnowledgeJobs(response.jobs || []);
      setJobs(next);
      if (!silent) setMessage(next.length ? `已读取 ${next.length} 条任务；列表不加载批次正文` : "暂无知识任务");
      return next;
    } catch (error) { if (!silent) setMessage(`任务读取失败：${error?.message || error}`); return []; }
  }, []);
  useEffect(() => { refresh(false); }, [refresh]);
  useEffect(() => {
    if (!jobs.some((item) => ["waiting", "running"].includes(item.status))) return undefined;
    const timer = window.setInterval(async () => {
      const next = await refresh(true);
      if (selectedId && next.some((item) => item.id === selectedId)) loadKnowledgeJob(selectedId).then((response) => setDetail(response.job)).catch(() => {});
      if (next.some((item) => item.status === "completed")) onRefreshDocuments?.(true);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [jobs, refresh, selectedId, onRefreshDocuments]);
  const visible = jobs.filter((item) => filter === "all" || item.jobType === filter).sort((left, right) => (knowledgeJobTypeOrder[left.jobType] || 99) - (knowledgeJobTypeOrder[right.jobType] || 99) || String(right.createdAt || "").localeCompare(String(left.createdAt || ""))).slice(0, 100);
  const invalidVisibleIds = visible.filter((job) => ["failed", "cancelled"].includes(job.status)).map((job) => job.id);
  const checkedInvalidIds = checkedJobIds.filter((id) => invalidVisibleIds.includes(id));
  useEffect(() => { setCheckedJobIds((current) => current.filter((id) => jobs.some((job) => job.id === id && ["failed", "cancelled"].includes(job.status)))); }, [jobs]);
  const openJob = async (job) => {
    setSelectedId(job.id);
    setDetail(null);
    setKnowledgeCards([]);
    setKnowledgeCardTotal(0);
    setKnowledgeCardPage(0);
    setKnowledgeCardsError("");
    setMessage("正在按需读取任务批次和日志…");
    try { const response = await loadKnowledgeJob(job.id); setDetail(response.job); setMessage("已读取任务详情"); }
    catch (error) { setMessage(`任务详情读取失败：${error?.message || error}`); }
  };
  const visibleSignature = visible.map((job) => `${job.id}:${job.updatedAt || job.createdAt || ""}`).join("|");
  useEffect(() => {
    if (!open || !visible.length || visible.some((job) => job.id === selectedId)) return;
    const preferred = filter === "all"
      ? visible.find((job) => job.jobType === "distill" && job.status === "completed" && Number(job.result?.knowledgeCount || 0) > 0)
        || visible.find((job) => job.jobType === "distill" && job.status === "completed")
        || visible[0]
      : visible[0];
    openJob(preferred);
  }, [open, filter, selectedId, visibleSignature]);
  const readKnowledgeCards = useCallback(async (job, page = 0) => {
    const requestId = knowledgeCardRequestRef.current + 1;
    knowledgeCardRequestRef.current = requestId;
    if (!job || job.jobType !== "distill" || !job.documentId) {
      setKnowledgeCards([]);
      setKnowledgeCardTotal(0);
      setKnowledgeCardsLoading(false);
      return;
    }
    setKnowledgeCardsLoading(true);
    setKnowledgeCardsError("");
    try {
      const response = await loadDistilledKnowledge(job.documentId, { limit: knowledgeCardPageSize, offset: page * knowledgeCardPageSize });
      if (knowledgeCardRequestRef.current !== requestId) return;
      setKnowledgeCards(response?.knowledge || []);
      setKnowledgeCardTotal(Number(response?.total || 0));
      setKnowledgeCardStatusCounts(response?.statusCounts || {});
      setKnowledgeCardPage(page);
    } catch (error) {
      if (knowledgeCardRequestRef.current !== requestId) return;
      setKnowledgeCards([]);
      setKnowledgeCardTotal(0);
      setKnowledgeCardsError(`知识卡读取失败：${error?.message || "知识库服务不可用"}`);
    } finally { if (knowledgeCardRequestRef.current === requestId) setKnowledgeCardsLoading(false); }
  }, []);
  useEffect(() => {
    if (!detail || detail.jobType !== "distill") return;
    readKnowledgeCards(detail, 0);
  }, [detail?.id, detail?.jobType, detail?.documentId, detail?.status, detail?.result?.knowledgeCount, readKnowledgeCards]);
  useEffect(() => {
    const refreshAfterReview = () => { if (detail?.jobType === "distill") readKnowledgeCards(detail, knowledgeCardPage); };
    window.addEventListener("qmdp:knowledge-updated", refreshAfterReview);
    return () => window.removeEventListener("qmdp:knowledge-updated", refreshAfterReview);
  }, [detail, knowledgeCardPage, readKnowledgeCards]);
  const control = async (action) => {
    if (!detail) return;
    const stageName = detail.jobType === "distill" ? "知识蒸馏" : "证据解析";
    setMessage(action === "pause" ? `正在暂停${stageName}…` : action === "retry_failed" ? "正在重新排队失败知识批次…" : `正在继续${stageName}断点…`);
    try {
      await controlKnowledgeDistillationJob(detail.id, action);
      await refresh(true);
      const response = await loadKnowledgeJob(detail.id);
      setDetail(response.job);
      setMessage(action === "pause" ? `${stageName}已暂停，已完成进度不会丢失` : action === "retry_failed" ? "失败知识批次已重新排队" : `${stageName}已从断点继续`);
    } catch (error) { setMessage(`任务操作失败：${error?.message || error}`); }
  };
  useEffect(() => {
    const host = document.querySelector('.qmdp-task-center-detail');
    if (!host) return undefined;
    const old = host.querySelector('.qmdp-coverage-retry');
    if (old) old.remove();
    const missingTopics = Number(detail?.result?.coverageAudit?.missingTopics || 0);
    if (detail?.jobType !== 'distill' || missingTopics <= 0) return undefined;
    const notice = document.createElement('div');
    notice.className = 'qmdp-inline-actions qmdp-coverage-retry';
    const text = document.createElement('span');
    text.textContent = `发现 ${missingTopics} 个原文重点未覆盖`;
    const button = document.createElement('button');
    button.className = 'qmdp-secondary-btn';
    button.type = 'button';
    button.textContent = '补齐遗漏知识';
    button.disabled = ['waiting', 'running'].includes(detail.status);
    button.onclick = () => control('retry_missing');
    notice.append(text, button);
    const log = host.querySelector('.qmdp-task-log');
    if (log) host.insertBefore(notice, log);
    return () => notice.remove();
  }, [detail, control]);
  const removeJob = async (job) => {
    if (!window.confirm(`确认删除任务“${fileNames.get(job.documentId) || job.documentId} · ${knowledgeJobTypeText[job.jobType] || job.jobType}”？原文件、证据和知识卡不会删除。`)) return;
    setMessage("正在删除任务记录…");
    try {
      await deleteKnowledgeJob(job.id);
      setCheckedJobIds((current) => current.filter((id) => id !== job.id));
      if (selectedId === job.id) { setSelectedId(""); setDetail(null); }
      await refresh(true);
      setMessage("任务已删除；后台处理中止，原文件、证据和知识卡均已保留");
    } catch (error) { setMessage(`任务删除失败：${error?.message || error}`); }
  };
  const removeCheckedJobs = async () => {
    if (!checkedInvalidIds.length || !window.confirm(`确认删除选中的 ${checkedInvalidIds.length} 条失效任务？`)) return;
    setMessage(`正在删除 ${checkedInvalidIds.length} 条失效任务…`);
    const results = await Promise.allSettled(checkedInvalidIds.map((id) => deleteKnowledgeJob(id)));
    const deleted = results.filter((item) => item.status === "fulfilled").length;
    setCheckedJobIds([]);
    if (checkedInvalidIds.includes(selectedId)) { setSelectedId(""); setDetail(null); }
    await refresh(true);
    setMessage(deleted === results.length ? `已删除 ${deleted} 条失效任务` : `已删除 ${deleted} 条，${results.length - deleted} 条失败`);
  };
  const batchRows = detail?.result?.batches || [];
  const knowledgeStatusMessage = knowledgeCardsError || (detail?.status === "failed" ? "知识蒸馏未完成：当前批次没有成功写入知识卡。" : knowledgeCardsLoading ? "正在读取已生成知识卡…" : knowledgeCardTotal > 0 ? `已生成 ${knowledgeCardTotal} 条知识卡：已发布 ${Number(knowledgeCardStatusCounts.published || 0)} 条，待确认 ${Number(knowledgeCardStatusCounts.candidate || 0) + Number(knowledgeCardStatusCounts.approved || 0)} 条。` : detail?.status === "completed" ? "任务已完成，但未生成知识卡。" : "任务尚未完成，知识卡将在批次成功后显示。");
  return <section className={`qmdp-knowledge-task-center ${open ? "is-open" : "is-collapsed"}`}><header><button onClick={() => setOpen((value) => !value)} aria-expanded={open}><CaretDown size={15} className={open ? "rotate" : ""}/><div><small>阶段 6 · Server Task Center</small><strong>知识任务中心</strong><span>只负责监控、重试和查看结果；启动操作在文档卡片中完成</span></div></button><div className="qmdp-task-center-summary"><span>等待 {jobs.filter((item) => item.status === "waiting").length}</span><span>运行 {jobs.filter((item) => item.status === "running").length}</span><span>失败 {jobs.filter((item) => item.status === "failed").length}</span><span>完成 {jobs.filter((item) => item.status === "completed").length}</span></div></header>{open && <><div className="qmdp-task-center-toolbar"><div className="qmdp-task-center-filters" role="tablist" aria-label="任务流程筛选"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")} role="tab" aria-selected={filter === "all"}>全部任务 <small>{jobs.length}</small></button><button className={filter === "parse" ? "active" : ""} onClick={() => setFilter("parse")} role="tab" aria-selected={filter === "parse"}>条款解析 <small>{jobs.filter((item) => item.jobType === "parse").length}</small></button><button className={filter === "pdf_parse" ? "active" : ""} onClick={() => setFilter("pdf_parse")} role="tab" aria-selected={filter === "pdf_parse"}>PDF解析 <small>{jobs.filter((item) => item.jobType === "pdf_parse").length}</small></button><button className={filter === "image_parse" ? "active" : ""} onClick={() => setFilter("image_parse")} role="tab" aria-selected={filter === "image_parse"}>图片OCR <small>{jobs.filter((item) => item.jobType === "image_parse").length}</small></button><button className={filter === "ppt_parse" ? "active" : ""} onClick={() => setFilter("ppt_parse")} role="tab" aria-selected={filter === "ppt_parse"}>PPT解析 <small>{jobs.filter((item) => item.jobType === "ppt_parse").length}</small></button><button className={filter === "distill" ? "active" : ""} onClick={() => setFilter("distill")} role="tab" aria-selected={filter === "distill"}>知识蒸馏 <small>{jobs.filter((item) => item.jobType === "distill").length}</small></button></div><button className="qmdp-secondary-btn" onClick={() => refresh(false)}><ArrowsClockwise size={14}/>刷新</button><span>{message}</span></div><div className="qmdp-task-center-manage"><label><input type="checkbox" checked={invalidVisibleIds.length > 0 && invalidVisibleIds.every((id) => checkedJobIds.includes(id))} onChange={() => setCheckedJobIds(invalidVisibleIds.every((id) => checkedJobIds.includes(id)) ? [] : invalidVisibleIds)} disabled={!invalidVisibleIds.length}/>全选失效任务（{invalidVisibleIds.length}）</label><button className="qmdp-danger-btn" onClick={removeCheckedJobs} disabled={!checkedInvalidIds.length}><Trash size={14}/>删除选中（{checkedInvalidIds.length}）</button><span>每条任务均可单独删除；运行中任务需先停止</span></div><div className="qmdp-task-center-layout"><aside>{visible.map((job) => <div key={job.id} className={`qmdp-task-job-row ${job.id === selectedId ? "selected" : ""}`}><label className="qmdp-task-job-check">{["failed", "cancelled"].includes(job.status) && <input type="checkbox" checked={checkedJobIds.includes(job.id)} onChange={() => setCheckedJobIds((current) => current.includes(job.id) ? current.filter((id) => id !== job.id) : [...current, job.id])} aria-label={`选择失效任务：${fileNames.get(job.documentId) || job.documentId}`}/>}</label><button className="qmdp-task-job-open" onClick={() => openJob(job)}><span><strong>{fileNames.get(job.documentId) || job.documentId}</strong><em className={`job-${job.status}`}>{knowledgeJobStatusText[job.status] || job.status}</em></span><small>{knowledgeJobTypeText[job.jobType] || job.jobType} · {job.skillId || "无Skill"}</small><i><b style={{ width: `${job.progress || 0}%` }}/></i><footer><span>{job.progress || 0}%</span><span>{job.message}</span></footer></button><button className="qmdp-task-job-delete" onClick={() => removeJob(job)} disabled={job.status === "running"} title={job.status === "running" ? "请先停止运行中的任务" : "删除任务记录"} aria-label={`删除任务：${fileNames.get(job.documentId) || job.documentId}`}><Trash size={14}/></button></div>)}{!visible.length && <div className="qmdp-empty compact">当前筛选条件下没有任务。</div>}</aside><div className="qmdp-task-center-detail">{detail ? <><header><div><small>{knowledgeJobTypeText[detail.jobType] || detail.jobType} · {detail.skillId || "无Skill"}</small><h4>{fileNames.get(detail.documentId) || detail.documentId}</h4><p>{detail.message}</p></div><em className={`job-${detail.status}`}>{knowledgeJobStatusText[detail.status] || detail.status}</em></header><div className="qmdp-task-progress"><i><b style={{ width: `${detail.progress || 0}%` }}/></i><strong>{detail.progress || 0}%</strong><span>{detail.result?.model ? `模型：${detail.result.model}` : "等待模型信息"}</span></div>{detail.jobType === "distill" && <div className="qmdp-distill-settings"><span>条款 {detail.result?.totalClauses || 0}</span><span>蒸馏知识点 {knowledgeCardTotal || detail.result?.knowledgeCount || 0}</span><span>批次 {detail.result?.totalBatches || batchRows.length}</span><span>每批字符 {detail.result?.batchChars || "默认"}</span><span>每批条款 {detail.result?.maxBatchClauses || "默认"}</span><span>失败重试 {detail.result?.maxRetries ?? "默认"}</span></div>}{detail.jobType === "distill" && <div className={`qmdp-task-knowledge-status ${detail.status === "failed" ? "failed" : knowledgeCardTotal > 0 ? "has-cards" : detail.status === "completed" ? "empty" : "pending"}`}><strong>{knowledgeCardsError || (detail.status === "failed" ? "知识蒸馏未完成：当前批次没有成功写入知识卡。请修复 AI 接口后点击“只重试失败批次”。" : knowledgeCardsLoading ? "正在读取已生成知识卡…" : knowledgeCardTotal > 0 ? `已生成 ${knowledgeCardTotal} 条知识卡，等待人工复核。` : detail.status === "completed" ? "任务已完成，但未生成知识卡。请检查模型返回格式、原文引用校验和蒸馏 Skill。" : "任务尚未完成，知识卡将在批次成功后显示。")}</strong></div>}{<div className="qmdp-distill-batches" aria-label="蒸馏批次进度">{batchRows.map((batch) => <span key={batch.id} className={`batch-${batch.status}`} title={`第${batch.index + 1}批 · ${knowledgeJobStatusText[batch.status] || batch.status}${batch.errorMessage ? ` · ${batch.errorMessage}` : ""}`}>{batch.index + 1}</span>)}</div>}{detail.errorMessage && <div className="qmdp-task-error">{detail.errorMessage}</div>}{detail.jobType === "distill" && knowledgeCardTotal > 0 && <section className="qmdp-task-knowledge-cards"><header><strong>蒸馏知识卡片</strong><span>共 {knowledgeCardTotal} 条 · 第 {knowledgeCardPage + 1} / {Math.max(1, Math.ceil(knowledgeCardTotal / knowledgeCardPageSize))} 页</span></header>{knowledgeCardsLoading ? <div className="qmdp-empty compact">正在读取知识卡…</div> : knowledgeCardsError ? <div className="qmdp-empty compact">{knowledgeCardsError}</div> : <div className="qmdp-task-knowledge-card-grid">{knowledgeCards.map((row) => <article className="qmdp-task-knowledge-card" key={row.id}><header><div><strong>{row.title || "未命名知识点"}</strong><span>{row.type || "未分类"} · {row.publicationStatus === "published" ? "已发布" : row.publicationStatus === "approved" ? "已初审" : row.publicationStatus === "rejected" ? "已退回" : "候选待复核"}</span></div><b>{row.sourceLevel || "C"}级 · {Math.round(Number(row.confidence || 0) * 100)}%</b></header><section><small>知识内容</small><p>{row.content || "未填写"}</p></section><section><small>原文事实</small><p>{row.metadata?.originalFact || "未填写"}</p></section><section><small>适用范围</small><p>{Array.isArray(row.metadata?.applicableScope) ? row.metadata.applicableScope.join("；") : row.metadata?.applicableScope || "未填写"}</p></section><footer>{(row.sourceCitations || []).slice(0, 2).map((item, index) => <span key={`${item.clauseId || item.clauseNumber || index}`}>{item.clauseNumber || "原文"}：{item.quote || ""}</span>)}</footer></article>)}</div>}{knowledgeCardTotal > knowledgeCardPageSize && <footer className="qmdp-task-knowledge-pagination"><button className="qmdp-secondary-btn" disabled={knowledgeCardPage <= 0 || knowledgeCardsLoading} onClick={() => readKnowledgeCards(detail, knowledgeCardPage - 1)}>上一页</button><span>第 {knowledgeCardPage + 1} / {Math.max(1, Math.ceil(knowledgeCardTotal / knowledgeCardPageSize))} 页</span><button className="qmdp-secondary-btn" disabled={(knowledgeCardPage + 1) * knowledgeCardPageSize >= knowledgeCardTotal || knowledgeCardsLoading} onClick={() => readKnowledgeCards(detail, knowledgeCardPage + 1)}>下一页</button></footer>}</section>}{detail.errorMessage && <div className="qmdp-task-error">{detail.errorMessage}</div>}<section className="qmdp-task-log"><header><strong>任务日志</strong><span>{detail.result?.logs?.length || 0} 条</span></header>{(detail.result?.logs || []).slice().reverse().map((log, index) => <div key={`${log.at}-${index}`} className={log.level || "info"}><time>{formatSyncDateTime(log.at)}</time><span>{log.message}</span></div>)}{!detail.result?.logs?.length && <div className="qmdp-empty compact">暂无任务日志。</div>}</section>{["waiting", "running"].includes(detail.status) && <footer className="qmdp-inline-actions"><button className="qmdp-danger-btn" onClick={() => control("pause")}><Pause size={14}/>暂停任务</button></footer>}{detail.status === "paused" && <footer className="qmdp-inline-actions"><button className="qmdp-primary-btn" onClick={() => control("resume")}><ArrowRight size={14}/>继续任务</button></footer>}{detail.jobType === "distill" && <footer className="qmdp-inline-actions">{detail.status === "paused" && <button className="qmdp-primary-btn" onClick={() => control("resume")}><ArrowRight size={14}/>继续任务</button>}{detail.status === "failed" && (batchRows.some((item) => item.status === "failed") ? <button className="qmdp-primary-btn" onClick={() => control("retry_failed")}><ArrowsClockwise size={14}/>只重试失败批次</button> : <button className="qmdp-primary-btn" onClick={() => control("resume")}><ArrowsClockwise size={14}/>重新执行</button>)}</footer>}</> : <div className="qmdp-empty"><Kanban size={28}/><strong>选择一条任务</strong><span>批次结果、错误和日志只在选择后按需读取。</span></div>}</div></div></>}</section>;
}

function KnowledgeBasePage({ qualitySources = [], onEnsureAgentSources, auth }) {
  const [files, setFiles] = useState(() => safeParse(localStorage.getItem(qmdpKnowledgeKey), []));
  const [documentJobs, setDocumentJobs] = useState({});
  const [category, setCategory] = useState("研发设计规范");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("正在读取知识库…");
  const [generatingId, setGeneratingId] = useState("");
  const [distillingId, setDistillingId] = useState("");
  const [generationStates, setGenerationStates] = useState({});
  const [questionCounts, setQuestionCounts] = useState(() => ({ singleChoice: 10, trueFalse: 10, ...safeParse(localStorage.getItem(qmdpQuestionGenerationSettingsKey), {}) }));
  const [batchProgress, setBatchProgress] = useState(null);
  const [distillBatchProgress, setDistillBatchProgress] = useState(null);
  const [checkedFileIds, setCheckedFileIds] = useState([]);
  const [examSkills, setExamSkills] = useState([]);
  const [knowledgeSkills, setKnowledgeSkills] = useState([]);
  const [selectedExamSkillId, setSelectedExamSkillId] = useState("");
  const [selectedKnowledgeSkillId, setSelectedKnowledgeSkillId] = useState("quality-knowledge-distillation");
  const [examSkillStatus, setExamSkillStatus] = useState("正在读取考试题目 Skill…");
  const [knowledgeSkillStatus, setKnowledgeSkillStatus] = useState("正在读取知识蒸馏 Skill…");
  const [detail, setDetail] = useState(null);
  const [knowledgeExamCenterOpen, setKnowledgeExamCenterOpen] = useState(true);
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState([]);
  const [knowledgePublishProgress, setKnowledgePublishProgress] = useState(null);
  const [knowledgeConsistency, setKnowledgeConsistency] = useState(null);
  const [processingClock, setProcessingClock] = useState(() => Date.now());
  const [checkingKnowledgeConsistency, setCheckingKnowledgeConsistency] = useState(false);
  const [metadataEditor, setMetadataEditor] = useState(null);
  const [knowledgeWorkspace, setKnowledgeWorkspace] = useState("matching");
  const [knowledgeReviewFilter, setKnowledgeReviewFilter] = useState("all");
  const [knowledgeFileView, setKnowledgeFileView] = useState("detail");
  const [knowledgeFileSort, setKnowledgeFileSort] = useState("recent");
  const [issueModule, setIssueModule] = useState("IPQC");
  const [issueRows, setIssueRows] = useState([]);
  const [issueTotal, setIssueTotal] = useState(0);
  const [issuePage, setIssuePage] = useState(0);
  const [issueQuery, setIssueQuery] = useState("");
  const [issueSearchQuery, setIssueSearchQuery] = useState("");
  const [issueFilter, setIssueFilter] = useState("");
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [issueMatches, setIssueMatches] = useState([]);
  const [issueMatchState, setIssueMatchState] = useState({ status: "idle", message: "先同步质量问题，再生成候选规范" });
  const [batchMatchProgress, setBatchMatchProgress] = useState(null);
  const batchMatchStopRef = useRef(false);
  const [matchThreshold, setMatchThreshold] = useState(() => Number(localStorage.getItem("qmdp-knowledge-match-threshold") || 80));
  const issueSyncAttemptRef = useRef(new Set());
  const detailPageSize = 24;
  const issuePageSize = 20;
  useEffect(() => {
    const timer = window.setInterval(() => setProcessingClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const renderControls = () => {
      const toolbar = document.querySelector(".qmdp-knowledge-exam-center-body .qmdp-question-generation-toolbar");
      if (!toolbar) return;
      let controls = toolbar.querySelector(".qmdp-runtime-file-controls");
      const created = !controls;
      if (created) { controls = document.createElement("div"); controls.className = "qmdp-runtime-file-controls"; toolbar.appendChild(controls); controls.innerHTML = `<label>排序<select data-file-sort><option value="recent">最近更新</option><option value="name">文件名</option><option value="size">文件大小</option><option value="knowledge">知识点数量</option></select></label><div class="qmdp-knowledge-view-switch"><button type="button" data-file-view="detail">详细信息</button><button type="button" data-file-view="list">简化列表</button></div>`; }
      const sort = controls.querySelector("[data-file-sort]"); sort.value = knowledgeFileSort; sort.onchange = (event) => setKnowledgeFileSort(event.target.value);
      controls.querySelectorAll("[data-file-view]").forEach((button) => { button.classList.toggle("active", button.dataset.fileView === knowledgeFileView); button.onclick = () => setKnowledgeFileView(button.dataset.fileView); });
      const grid = document.querySelector(".qmdp-knowledge-exam-center-body .qmdp-card-grid");
      if (grid) { grid.classList.toggle("qmdp-knowledge-file-view-detail", knowledgeFileView === "detail"); grid.classList.toggle("qmdp-knowledge-file-view-list", knowledgeFileView === "list"); }
    };
    renderControls();
    const observer = new MutationObserver(renderControls);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [knowledgeFileSort, knowledgeFileView, files.length, query, category, knowledgeReviewFilter]);

  const refreshDocuments = useCallback(async (silent = false) => {
    try {
      const [response, jobsResponse] = await Promise.all([loadKnowledgeDocuments(), loadKnowledgeJobs()]);
      const jobs = Array.isArray(jobsResponse?.jobs) ? jobsResponse.jobs : [];
      const nextJobs = {};
      jobs.forEach((job) => {
        const documentJobsForFile = nextJobs[job.documentId] || {};
        const stage = ["distill"].includes(job.jobType) ? "distill" : "parse";
        const current = documentJobsForFile[stage];
        if (!current || String(job.updatedAt || job.createdAt || "") > String(current.updatedAt || current.createdAt || "")) {
          nextJobs[job.documentId] = { ...documentJobsForFile, [stage]: job };
        }
      });
      setDocumentJobs(nextJobs);
      const documents = (response?.documents || []).map((item) => ({ ...item, serverStored: true }));
      if (documents.length) setFiles((current) => documents.map((item) => ({ ...current.find((row) => row.id === item.id), ...item })));
      else setFiles((current) => current.filter((item) => !item.serverStored));
      if (!silent) setStatus(documents.length ? `已读取 ${documents.length} 个知识文件` : "知识库已连接，暂无服务器知识文件");
      return documents;
    } catch (error) {
      if (!silent) setStatus(`知识库服务暂不可用，当前显示本机记录：${error?.message || "连接失败"}`);
      return [];
    }
  }, []);
  const controlDocumentJob = async (file, requestedAction = "") => {
    const job = documentJobs[file.id]?.distill || documentJobs[file.id]?.parse;
    if (!job) return;
    const action = requestedAction || (job.status === "paused" ? "resume" : "pause");
    const isDistill = job.jobType === "distill";
    setStatus(action === "pause" ? `正在暂停“${file.name}”…` : action === "retry_failed" ? `正在重新排队“${file.name}”的失败批次…` : `正在继续“${file.name}”…`);
    try {
      await controlKnowledgeDistillationJob(job.id, action);
      await refreshDocuments(true);
      setStatus(action === "pause" ? `“${file.name}”已暂停，已完成${isDistill ? "批次" : "页面"}已保留` : action === "retry_failed" ? `“${file.name}”的失败批次已重新排队` : `“${file.name}”已从断点继续`);
    } catch (error) { setStatus(`任务控制失败：${error?.message || error}`); }
  };
  const retryMissingKnowledge = async (file) => {
    const job = documentJobs[file.id]?.distill;
    if (!job) { setStatus("未找到该文档的知识蒸馏任务，请先重新蒸馏"); return; }
    await controlDocumentJob(file, "retry_missing");
  };
  useEffect(() => {
    const cards = document.querySelectorAll('.qmdp-knowledge-file-card');
    cards.forEach((card, index) => {
      const file = visible[index];
      const fileId = file?.id;
      if (!fileId) return;
      const missing = Number(file?.metadata?.knowledgeCoverage?.missingTopics || documentJobs[fileId]?.distill?.result?.coverageAudit?.missingTopics || 0);
      const actions = card.querySelector('.qmdp-file-actions');
      if (!actions) return;
      actions.querySelector('.qmdp-coverage-retry-card')?.remove();
      if (!missing) return;
      const button = document.createElement('button');
      button.className = 'qmdp-secondary-btn qmdp-coverage-retry-card';
      button.type = 'button';
      button.textContent = `补齐遗漏知识（${missing}）`;
      button.onclick = () => retryMissingKnowledge(file);
      actions.appendChild(button);
    });
  }, [files, documentJobs]);
  const checkKnowledgeConsistency = async () => {
    setCheckingKnowledgeConsistency(true);
    try {
      const report = await loadKnowledgeConsistency();
      setKnowledgeConsistency(report);
      setStatus(report.consistent ? `数据一致：${report.counts.documents} 份文档、${report.counts.clauses} 条证据、${report.counts.knowledge} 张知识卡` : `发现 ${report.issues.length} 类数据异常：${report.issues.join("；")}`);
    } catch (error) {
      setStatus(`数据核对失败：${error?.message || "服务不可用"}`);
    } finally { setCheckingKnowledgeConsistency(false); }
  };
  useEffect(() => { refreshDocuments(false); }, [refreshDocuments]);
  useEffect(() => {
    const active = files.some((file) => ["waiting", "parsing", "indexing", "distilling"].includes(file.status));
    if (!active) return undefined;
    const timer = window.setInterval(() => refreshDocuments(true), 1800);
    return () => window.clearInterval(timer);
  }, [files, refreshDocuments]);
  useEffect(() => {
    const metadata = files.map(({ sourceText, segments, ...file }) => ({ ...file, preview: String(file.preview || "").slice(0, 1200), ...(file.serverStored ? {} : { segments: (segments || []).slice(0, 80) }) }));
    try { localStorage.setItem(qmdpKnowledgeKey, JSON.stringify(metadata)); } catch {}
  }, [files]);
  useEffect(() => { localStorage.setItem(qmdpQuestionGenerationSettingsKey, JSON.stringify(questionCounts)); }, [questionCounts]);
  useEffect(() => { setCheckedFileIds((current) => current.filter((id) => files.some((file) => file.id === id))); }, [files]);
  const refreshIssues = useCallback(async (silent = false) => {
    try {
      const response = await loadKnowledgeIssues({ module: issueModule, query: issueSearchQuery, status: issueFilter, threshold: matchThreshold, limit: issuePageSize, offset: issuePage * issuePageSize });
      const rows = response?.issues || [];
      setIssueRows(rows);
      setIssueTotal(Number(response?.total || 0));
      setSelectedIssueId((current) => rows.some((item) => item.id === current) ? current : rows[0]?.id || "");
      if (!silent) setIssueMatchState({ status: "done", message: rows.length ? `已读取 ${response.total} 条${issueModule}问题` : `暂无${issueModule}问题，请先同步原始数据` });
    } catch (error) {
      if (!silent) setIssueMatchState({ status: "error", message: `问题清单读取失败：${error?.message || "知识库服务不可用"}` });
    }
  }, [issueModule, issueSearchQuery, issueFilter, issuePage, matchThreshold]);
  useEffect(() => { refreshIssues(false); }, [refreshIssues]);
  useEffect(() => { setIssuePage(0); setIssueRows([]); setIssueTotal(0); setSelectedIssueId(""); setIssueMatches([]); issueSyncAttemptRef.current.delete(issueModule); }, [issueModule, issueFilter]);
  useEffect(() => {
    let active = true;
    if (!selectedIssueId) { setIssueMatches([]); return () => { active = false; }; }
    loadKnowledgeMatches(selectedIssueId).then((response) => { if (active) setIssueMatches(response?.matches || []); }).catch((error) => { if (active) setIssueMatchState({ status: "error", message: `候选规范读取失败：${error?.message || "连接失败"}` }); });
    return () => { active = false; };
  }, [selectedIssueId]);
  useEffect(() => {
    let active = true;
    loadAgentSkills(["generate-qms-exam-bank", "quality-knowledge-distillation"]).then((response) => {
      if (!active) return;
      const allSkills = response?.skills || [];
      const exam = allSkills.filter((item) => {
        const identity = `${item.id || ""} ${item.name || ""}`.toLowerCase();
        return item.id === "generate-qms-exam-bank" || ((/exam|考试|question|试题|题目|题库/.test(identity)) && (/generate|生成/.test(identity)));
      });
      const distillation = allSkills.filter((item) => {
        const identity = `${item.id || ""} ${item.name || ""}`.toLowerCase();
        return item.id === "quality-knowledge-distillation" || ((/knowledge|知识/.test(identity)) && (/distill|蒸馏|提炼/.test(identity)));
      });
      setExamSkills(exam);
      setKnowledgeSkills(distillation);
      setSelectedExamSkillId((current) => current || exam.find((item) => item.id === "generate-qms-exam-bank")?.id || exam[0]?.id || "");
      setSelectedKnowledgeSkillId((current) => current || distillation.find((item) => item.id === "quality-knowledge-distillation")?.id || distillation[0]?.id || "");
      setExamSkillStatus(exam.length ? `可用 Skill：${exam.length} 个` : "未找到考试题目 Skill");
      setKnowledgeSkillStatus(distillation.length ? `可用 Skill：${distillation.length} 个` : "未找到知识蒸馏 Skill");
    }).catch((error) => {
      if (!active) return;
      setExamSkillStatus(`读取 Skill 失败：${error?.message || "请检查项目服务"}`);
      setKnowledgeSkillStatus(`读取 Skill 失败：${error?.message || "请检查项目服务"}`);
    });
    return () => { active = false; };
  }, []);

  const importFiles = async (event) => {
    const selected = [...(event.target.files || [])];
    if (!selected.length) return;
    let completed = 0;
    let duplicate = 0;
    const failed = [];
    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      setStatus(`正在入库 ${index + 1}/${selected.length}：${file.name}`);
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        const sourceLevel = /YM标准|标准|Checklist|DFMEA/i.test(file.name) ? "B" : /机械|材料|工艺|手册/i.test(file.name) ? "A" : "C";
        let response;
        if (["pdf", "pptx", "png", "jpg", "jpeg", "webp", "bmp", "doc", "docx", "xls", "xlsx", "xlsm", "xmind", "txt", "md"].includes(ext)) {
          setStatus(`正在上传原件 ${index + 1}/${selected.length}：${file.name}`);
          response = await uploadKnowledgeSource(file, { category, sourceLevel });
        } else {
          const [parsed, fileHash] = await Promise.all([readKnowledgeFile(file), knowledgeFileHash(file)]);
          const parseStatus = ["pptx", "xmind"].includes(ext) ? "待视觉复核" : "可直接读取";
          response = await createKnowledgeDocument({ name: file.name, category, size: file.size, contentType: parsed.contentType, fileHash, segmentCount: parsed.segments.length, sourceText: parsed.segments.join("\n"), registerOnly: Boolean(parsed.registerOnly), sourceLevel, governanceStatus: parsed.registerOnly ? "已登记" : "待登记", metadata: { lastModified: file.lastModified, carrierFormat: ext.toUpperCase(), sourceLevel, healthStatus: parseStatus, segmentMetadata: parsed.segmentMetadata || [], durationSeconds: parsed.durationSeconds || 0, ...(parsed.metadata || {}), parseAdvice: parseStatus === "可直接读取" ? "进入后台条款解析" : "文字/节点已解析；图像中的文字可通过OCR读取，图示关系和特殊对象待视觉复核" } });
        }
        if (response?.duplicate) duplicate += 1;
        else completed += 1;
      } catch (error) {
        const message = error?.message || "无法解析文件";
        failed.push(`${file.name}：${message}`);
        setStatus(`${file.name} 导入失败：${message}`);
      }
    }
    await refreshDocuments(true);
    setStatus(failed.length
      ? `导入完成：新增 ${completed} 个${duplicate ? `，相同文件 ${duplicate} 个` : ""}；失败 ${failed.length} 个：${failed.join("；")}`
      : `导入登记完成：新增 ${completed} 个${duplicate ? `，相同文件 ${duplicate} 个未重复导入` : ""}；PDF、PPTX和图片原件由服务端后台处理`);
    event.target.value = "";
  };
  const updateGenerationState = (id, message, tone = "running") => setGenerationStates((current) => ({ ...current, [id]: { message, tone } }));
  const normalizedQuestionCounts = { singleChoice: Math.max(0, Math.min(20, Number(questionCounts.singleChoice) || 0)), trueFalse: Math.max(0, Math.min(20, Number(questionCounts.trueFalse) || 0)) };
  const selectedExamSkill = examSkills.find((item) => item.id === selectedExamSkillId) || examSkills.find((item) => item.id === "generate-qms-exam-bank");
  const selectedKnowledgeSkill = knowledgeSkills.find((item) => item.id === selectedKnowledgeSkillId) || knowledgeSkills.find((item) => item.id === "quality-knowledge-distillation");
  const effectiveKnowledgeSkillId = selectedKnowledgeSkillId || "quality-knowledge-distillation";
  const selectedIssue = issueRows.find((item) => item.id === selectedIssueId) || null;
  function renderIssueFilterControls() { return <select aria-label="问题筛选" value={issueFilter} onChange={(event) => { setIssueFilter(event.target.value); setIssuePage(0); }}><option value="">全部问题</option><option value="low_threshold">最高匹配度低于门限</option><option value="failed">匹配失败的问题</option><option value="rejected">驳回的问题</option><option value="confirmed">已确认的问题</option></select>; }

  const syncQualityIssues = async () => {
    setIssueMatchState({ status: "running", message: `正在加载${issueModule}原始问题数据…` });
    try {
      // The page may have been opened from a lightweight analysis cache. Load
      // the server source index as a seed so DQA workbooks are not omitted
      // merely because this tab was opened before the latest import.
      const indexed = await loadImportedSources().catch(() => []);
      const loaded = onEnsureAgentSources ? await onEnsureAgentSources([issueModule], (progress) => {
        if (progress?.label) setIssueMatchState({ status: "running", message: progress.label });
      }, Array.isArray(indexed) ? indexed : []) : indexed;
      const allSources = [...qualitySources, ...(Array.isArray(indexed) ? indexed : []), ...(Array.isArray(loaded) ? loaded : [])];
      const issues = buildKnowledgeIssuePayloads(allSources, issueModule);
      if (!issues.length) throw new Error(issueModule === "IPQC" ? "未找到带“送检人”且存在不良内容/不良类型的记录" : "未找到带研发工程师姓名和问题内容的记录");
      let synced = 0;
      for (let offset = 0; offset < issues.length; offset += 500) {
        const batch = issues.slice(offset, offset + 500);
        await syncKnowledgeIssues(batch);
        synced += batch.length;
        setIssueMatchState({ status: "running", message: `正在同步问题摘要 ${synced}/${issues.length}` });
      }
      setIssuePage(0);
      await refreshIssues(true);
      setIssueMatchState({ status: "done", message: `已同步 ${issues.length} 条${issueModule}问题；原始数据未被改写` });
      return true;
    } catch (error) {
      setIssueMatchState({ status: "error", message: `同步失败：${error?.message || error}` });
      return false;
    }
  };
  useEffect(() => {
    if (knowledgeWorkspace !== "matching" || issueQuery || issueFilter || issueRows.length || issueSyncAttemptRef.current.has(issueModule)) return undefined;
    issueSyncAttemptRef.current.add(issueModule);
    const timer = window.setTimeout(() => {
      syncQualityIssues().then((ok) => { if (!ok) issueSyncAttemptRef.current.delete(issueModule); });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [knowledgeWorkspace, issueModule, issueQuery, issueFilter, issueRows.length]);
  const buildIssueMatches = async () => {
    // Re检索 is a workspace-wide operation: refresh every issue in the
    // current module/filter rather than only the selected row.
    return batchBuildIssueMatches();
    /*
    if (!selectedIssueId) return;
    setIssueMatchState({ status: "running", message: "正在检索知识卡片…" });
    try {
      const response = await generateKnowledgeMatches(selectedIssueId);
      const matches = response?.matches || [];
      const autoConfirm = matches.filter((item) => item.candidateType === "knowledge" && Number(item.score || 0) >= matchThreshold && item.status !== "confirmed");
      for (const item of autoConfirm) await reviewKnowledgeMatch(item.id, "confirmed");
      const refreshed = autoConfirm.length ? await loadKnowledgeMatches(selectedIssueId) : null;
      setIssueMatches(refreshed?.matches || matches);
      await refreshIssues(true);
      const audit = response?.audit;
      const retrievalNote = audit ? ` · ${audit.storage === "postgres" ? "PostgreSQL分层检索" : "本地索引回退"} ${audit.cacheHit ? "缓存命中" : `${audit.elapsedMs}ms`}` : "";
      setIssueMatchState({ status: "done", message: matches.length ? `已匹配 ${matches.length} 张知识卡片${autoConfirm.length ? `，${autoConfirm.length} 张达到 ${matchThreshold}% 门限并自动确认` : "，其余等待人工确认"}${retrievalNote}` : `未找到可信知识卡片，请补充规范或调整知识标签${retrievalNote}` });
    } catch (error) { setIssueMatchState({ status: "error", message: `候选生成失败：${error?.message || error}` }); }
    */
  };
  const batchBuildIssueMatches = async () => {
    if (batchMatchProgress) return;
    if (!hasPublishedKnowledge) {
      setIssueMatchState({ status: "error", message: "当前尚无已发布知识卡片，不能进行问题匹配。请先完成知识蒸馏并发布知识。" });
      return;
    }
    batchMatchStopRef.current = false;
    setIssueMatchState({ status: "running", message: `正在读取全部${issueModule === "IPQC" ? "组装" : "研发"}问题…` });
    try {
      const allIssues = [];
      let offset = 0;
      let total = 0;
      do {
          const page = await loadKnowledgeIssues({ module: issueModule, query: issueSearchQuery, status: issueFilter, threshold: matchThreshold, limit: 200, offset });
        const rows = page?.issues || [];
        allIssues.push(...rows);
        total = Number(page?.total || allIssues.length);
        offset += rows.length;
        if (!rows.length) break;
      } while (offset < total);
      if (!allIssues.length) throw new Error("没有可匹配的问题记录");
      let completed = 0;
      let autoConfirmed = 0;
      let failed = 0;
      setBatchMatchProgress({ current: 0, total: allIssues.length });
      let cursor = 0;
      const processIssue = async (issue) => {
        if (batchMatchStopRef.current) return;
        try {
          const response = await generateKnowledgeMatches(issue.id);
          const matches = response?.matches || [];
          const highConfidence = matches.filter((item) => item.candidateType === "knowledge" && Number(item.score || 0) >= matchThreshold && item.status !== "confirmed");
          for (const item of highConfidence) {
            await reviewKnowledgeMatch(item.id, "confirmed");
            autoConfirmed += 1;
          }
        } catch (error) {
          failed += 1;
        }
        completed += 1;
        setBatchMatchProgress({ current: completed, total: allIssues.length });
        setIssueMatchState({ status: "running", message: `正在批量匹配：已处理 ${completed} / 总计 ${allIssues.length}` });
      };
      const workers = Array.from({ length: Math.min(6, allIssues.length) }, async () => {
        while (cursor < allIssues.length) {
          if (batchMatchStopRef.current) break;
          const issue = allIssues[cursor];
          cursor += 1;
          await processIssue(issue);
        }
      });
      await Promise.all(workers);
      const stopped = batchMatchStopRef.current;
      setBatchMatchProgress(null);
      await refreshIssues(true);
      if (selectedIssueId) {
        const selectedMatches = await loadKnowledgeMatches(selectedIssueId).catch(() => null);
        if (selectedMatches) setIssueMatches(selectedMatches.matches || []);
      }
      setIssueMatchState({ status: stopped ? "idle" : "done", message: stopped ? `已停止批量匹配：已处理 ${completed} / 总计 ${allIssues.length}` : `${issueModule === "IPQC" ? "组装" : "研发"}问题匹配完成：已处理 ${completed} / 总计 ${allIssues.length}${failed ? `，失败 ${failed}` : ""}，自动确认 ${autoConfirmed} 张知识卡片` });
    } catch (error) {
      setBatchMatchProgress(null);
      setIssueMatchState({ status: "error", message: `批量生成失败：${error?.message || error}` });
    }
  };
  const stopBatchBuildIssueMatches = () => {
    if (!batchMatchProgress) return;
    batchMatchStopRef.current = true;
    setIssueMatchState({ status: "running", message: "正在停止批量匹配，已完成的问题不会丢失…" });
  };
  const batchConfirmIssueMatches = async () => {
    if (batchMatchProgress) return;
    setIssueMatchState({ status: "running", message: "正在批量确认达到门限的知识卡片…" });
    try {
      const page = await loadKnowledgeIssues({ module: issueModule, status: issueFilter, threshold: matchThreshold, limit: 5000, offset: 0 });
      const issues = page?.issues || [];
      let confirmed = 0;
      for (const issue of issues) {
        const response = await loadKnowledgeMatches(issue.id);
        for (const match of response?.matches || []) {
          if (match.candidateType === "knowledge" && match.status !== "confirmed" && Number(match.score || 0) >= matchThreshold) {
            await reviewKnowledgeMatch(match.id, "confirmed");
            confirmed += 1;
          }
        }
      }
      await refreshIssues(true);
      setIssueMatchState({ status: "done", message: `批量确认完成：确认 ${confirmed} 张达到 ${matchThreshold}% 门限的知识卡片` });
    } catch (error) { setIssueMatchState({ status: "error", message: `批量确认失败：${error?.message || error}` }); }
  };
  const setMatchReview = async (matchId, nextStatus) => {
    setIssueMatchState({ status: "running", message: nextStatus === "confirmed" ? "正在确认规范匹配…" : "正在记录驳回结果…" });
    try {
      await reviewKnowledgeMatch(matchId, nextStatus);
      const response = await loadKnowledgeMatches(selectedIssueId);
      setIssueMatches(response?.matches || []);
      await refreshIssues(true);
      setIssueMatchState({ status: "done", message: nextStatus === "confirmed" ? "已确认；角色报告和考试题目可以调用该规范" : "已驳回；该候选不会进入正式报告" });
    } catch (error) { setIssueMatchState({ status: "error", message: `审核保存失败：${error?.message || error}` }); }
  };

  const loadAllClauses = async (sourceFile, maxCharacters = Number.POSITIVE_INFINITY) => {
    if (!sourceFile.serverStored) {
      const text = String(sourceFile.preview || (sourceFile.segments || []).join("\n") || "").slice(0, maxCharacters);
      return text ? [{ id: `legacy-${sourceFile.id}`, clauseNumber: "", sectionPath: "", clauseText: text }] : [];
    }
    const rows = [];
    let offset = 0;
    let total = Number(sourceFile.clauseCount || 0);
    let characters = 0;
    do {
      const response = await loadKnowledgeClauses(sourceFile.id, { limit: 250, offset });
      total = Number(response.total || 0);
      for (const row of response.clauses || []) {
        rows.push(row);
        characters += String(row.clauseText || "").length;
        if (characters >= maxCharacters) return rows;
      }
      offset += response.clauses?.length || 0;
    } while (offset < total && offset < 5000);
    return rows;
  };
  const generateExamQuestionsForFile = async (sourceFile) => {
    setGeneratingId(sourceFile.id);
    setStatus(`正在读取考试题目 Skill 并分析“${sourceFile.name}”…`);
    updateGenerationState(sourceFile.id, "正在读取考试题目 Skill…");
    try {
      const skill = selectedExamSkill;
      if (!skill?.content) throw new Error("当前选择的考试题目 Skill 不可用，请重新选择");
      const knowledgeResponse = await loadDistilledKnowledge(sourceFile.id, { limit: 1000, offset: 0 });
      const publishedKnowledge = (knowledgeResponse.knowledge || []).filter((item) => item.publicationStatus === "published");
      const sourceText = publishedKnowledge.map((item) => `${item.title}：${item.content}\n依据：${(item.sourceCitations || []).map((citation) => citation.quote).join("；")}`).join("\n").slice(0, 30000);
      if (!sourceText.trim()) throw new Error("该文档没有已发布知识卡；请先完成人工审核和发布，再生成题目");
      const systemPrompt = `你是 QMS 题库生成器。严格执行以下考试题目 Skill，只根据知识文档原文出题，不得补造文档外事实。输出必须是纯 JSON，不要 Markdown 代码围栏。\n\n${skill.content.slice(0, 20000)}`;
      const requestQuestionType = async (type, count, outputExample) => {
        if (!count) return [];
        const stageMessage = `正在生成 ${count} 道${type}…`;
        setStatus(`正在根据“${sourceFile.name}”${stageMessage}`);
        updateGenerationState(sourceFile.id, stageMessage);
        const result = await requestAiChat([{ role: "system", content: systemPrompt }, { role: "user", content: `知识标题：${sourceFile.name}\n知识类别：${sourceFile.category || "未分类"}\n\n知识文档原文：\n${sourceText}\n\n本阶段只生成 ${count} 道${type}，不要生成其它题型。输出格式：{"questions":[${outputExample}]}。每个答案和解析都必须能在文档中找到依据；适用角色、问题类别、知识标题不可省略。` }], { max_tokens: Math.min(7000, Math.max(3000, count * 350)), agent: true, operation: "knowledge-exam-generate" });
        return parseGeneratedQuestionJson(result.content);
      };
      const singleChoiceRows = await requestQuestionType("单选题", normalizedQuestionCounts.singleChoice, `{"题干":"...","类型":"单选题","选项A":"...","选项B":"...","选项C":"...","选项D":"...","正确答案":"A","解析":"...","适用角色":"...","问题类别":"...","知识标题":"${sourceFile.name}"}`);
      const trueFalseRows = await requestQuestionType("判断题", normalizedQuestionCounts.trueFalse, `{"题干":"...","类型":"判断题","正确答案":"正确","解析":"...","适用角色":"...","问题类别":"...","知识标题":"${sourceFile.name}"}`);
      updateGenerationState(sourceFile.id, "正在写入题库管理…");
      const generated = normalizeGeneratedQuestions([...singleChoiceRows, ...trueFalseRows], sourceFile, skill);
      if (!generated.length) throw new Error("没有生成有效题目，请检查文档内容后重试");
      const existing = safeParse(localStorage.getItem(qmdpQuestionsKey), []);
      localStorage.setItem(qmdpQuestionsKey, JSON.stringify([...generated, ...existing.filter((item) => item.sourceKnowledgeId !== sourceFile.id)]));
      setFiles((current) => current.map((item) => item.id === sourceFile.id ? { ...item, examQuestionCount: generated.length, examGeneratedAt: new Date().toISOString(), examSkill: skill.id, examSkillName: skill.name || skill.id } : item));
      setStatus(`已根据“${sourceFile.name}”生成 ${generated.length} 道题目，并自动追加到题库`);
      updateGenerationState(sourceFile.id, `已完成，共 ${generated.length} 道题，已进入题库管理`, "done");
      return { ok: true, count: generated.length };
    } catch (error) {
      const message = error?.message || String(error);
      setStatus(`“${sourceFile.name}”出题失败：${message}`);
      updateGenerationState(sourceFile.id, `生成失败：${message}`, "error");
      return { ok: false, count: 0 };
    } finally { setGeneratingId(""); }
  };

  const distillKnowledgeForFile = async (sourceFile) => {
    if (!sourceFile.serverStored || sourceFile.status !== "completed") return { ok: false, count: 0 };
    setDistillingId(sourceFile.id);
    setStatus(`正在把“${sourceFile.name}”提交到服务端蒸馏队列…`);
    try {
      const skillId = selectedKnowledgeSkill?.id || effectiveKnowledgeSkillId;
      const response = await startKnowledgeDistillation(sourceFile.id, skillId);
      setStatus(`“${sourceFile.name}”${response.job?.message?.includes("恢复") ? "已恢复上次蒸馏任务，将跳过已完成段" : "已进入服务端任务队列"}；任务 ${response.job?.id || "已创建"}`);
      await refreshDocuments(true);
      return { ok: true, count: 0, jobId: response.job?.id || "" };
    } catch (error) {
      const message = error?.message || String(error);
      setStatus(`“${sourceFile.name}”提交蒸馏任务失败：${message}`);
      await refreshDocuments(true);
      return { ok: false, count: 0 };
    } finally { setDistillingId(""); }
  };

  const generateExamQuestions = async (sourceFile) => {
    if (generatingId || batchProgress || !selectedExamSkillId) return setStatus("请先选择考试题目 Skill");
    if (!normalizedQuestionCounts.singleChoice && !normalizedQuestionCounts.trueFalse) return setStatus("请至少设置一种题型的生成数量");
    await generateExamQuestionsForFile(sourceFile);
  };
  const filteredVisible = files.filter((file) => {
    const reviewState = file.governanceStatus === "已发布" ? "published" : file.governanceStatus === "待技术评审" ? "approved" : file.metadata?.reviewStatus === "approved" ? "source-approved" : file.status === "failed" || file.status === "review_required" ? "needs-review" : "candidate";
    return (!query || `${file.name} ${file.preview}`.toLowerCase().includes(query.toLowerCase()))
      && (!category || category === "全部" || file.category === category)
      && (knowledgeReviewFilter === "all" || reviewState === knowledgeReviewFilter);
  });
  const sortedVisible = [...filteredVisible].sort((a, b) => {
    if (knowledgeFileSort === "name") return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
    if (knowledgeFileSort === "size") return Number(b.size || 0) - Number(a.size || 0);
    if (knowledgeFileSort === "knowledge") return Number(b.distillationCount || 0) - Number(a.distillationCount || 0);
    return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  });
  const visible = sortedVisible;
  const visibleIds = visible.map((file) => file.id);
  const allVisibleChecked = visibleIds.length > 0 && visibleIds.every((id) => checkedFileIds.includes(id));
  const toggleVisibleFiles = () => setCheckedFileIds((current) => allVisibleChecked ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  const toggleKnowledgeFile = (id) => setCheckedFileIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const deleteKnowledgeFiles = async (ids) => {
    const remove = new Set();
    for (const id of ids) {
      const file = files.find((item) => item.id === id);
      try { if (file?.serverStored) await deleteKnowledgeDocument(id); remove.add(id); }
      catch (error) { remove.add(id); setStatus(`已从当前页面移除“${file?.name || id}”；后台删除将在服务恢复后重试`); }
    }
    setFiles((current) => current.filter((item) => !remove.has(item.id)));
    setCheckedFileIds((current) => current.filter((id) => !remove.has(id)));
    if (detail && remove.has(detail.fileId)) setDetail(null);
  };
  const deleteCheckedKnowledgeFiles = async () => {
    const count = checkedFileIds.length;
    if (!count || !window.confirm(`确定删除已选中的 ${count} 个知识文件吗？对应条款和蒸馏结果也会删除，题库历史题目不会自动删除。`)) return;
    await deleteKnowledgeFiles(checkedFileIds);
    setStatus(`已批量删除 ${count} 个知识文件`);
  };
  const generateCheckedKnowledgeFiles = async () => {
    if (generatingId || batchProgress || !checkedFileIds.length || !selectedExamSkillId) return;
    if (!normalizedQuestionCounts.singleChoice && !normalizedQuestionCounts.trueFalse) return setStatus("请至少设置一种题型的生成数量");
    const selectedFiles = checkedFileIds.map((id) => files.find((file) => file.id === id)).filter(Boolean);
    let completed = 0;
    let failed = 0;
    setBatchProgress({ current: 0, total: selectedFiles.length, fileName: "准备开始" });
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      setBatchProgress({ current: index + 1, total: selectedFiles.length, fileName: file.name });
      const result = await generateExamQuestionsForFile(file);
      if (result.ok) completed += 1; else failed += 1;
    }
    setBatchProgress(null);
    setStatus(`批量生成完成：成功 ${completed} 个文档${failed ? `，失败 ${failed} 个文档` : ""}；题目已进入题库管理`);
  };
  const distillCheckedKnowledgeFiles = async () => {
    if (distillingId || distillBatchProgress || !checkedFileIds.length || !selectedKnowledgeSkillId) return;
    const selectedFiles = checkedFileIds.map((id) => files.find((file) => file.id === id)).filter((file) => file?.serverStored && file.status === "completed" && !(Number(file.metadata?.reviewPageCount || file.metadata?.ocrPageCount || 0) > 0 && file.metadata?.reviewStatus !== "approved"));
    if (!selectedFiles.length) return setStatus("已选文件尚未完成条款解析，暂时不能蒸馏");
    let completed = 0;
    let failed = 0;
    setDistillBatchProgress({ current: 0, total: selectedFiles.length, fileName: "准备开始" });
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      setDistillBatchProgress({ current: index + 1, total: selectedFiles.length, fileName: file.name });
      const result = await distillKnowledgeForFile(file);
      if (result.ok) completed += 1; else failed += 1;
    }
    setDistillBatchProgress(null);
    setStatus(`批量任务提交完成：已排队 ${completed} 个文档${failed ? `，提交失败 ${failed} 个文档` : ""}；实际进度请查看知识任务中心`);
  };
  const retryParse = async (file) => {
    try { await reparseKnowledgeDocument(file.id); setStatus(`“${file.name}”已重新进入后台解析队列`); await refreshDocuments(true); }
    catch (error) { setStatus(`重新解析失败：${error?.message || "知识库服务不可用"}`); }
  };
  const retryFailedParse = async (file) => {
    try { await reparseKnowledgeDocument(file.id, true); setStatus(`“${file.name}”的失败页已进入重试队列，已完成页面不会重做`); await refreshDocuments(true); }
    catch (error) { setStatus(`失败页重试失败：${error?.message || "知识库服务不可用"}`); }
  };
  const importDistillationForFile = async (sourceFile, event) => {
    const imported = event.target.files?.[0];
    event.target.value = "";
    if (!imported) return;
    setStatus(`正在导入“${imported.name}”的知识提取结果…`);
    try {
      const content = await imported.text();
      const format = imported.name.toLowerCase().endsWith(".md") ? "markdown" : "json";
      const response = await importKnowledgeDistillation(sourceFile.id, { content, format, skillId: selectedKnowledgeSkillId || "quality-knowledge-distillation" });
      setStatus(`“${sourceFile.name}”已导入 ${Number(response.total || 0)} 条知识点，等待人工审核`);
      await refreshDocuments(true);
    } catch (error) { setStatus(`知识提取结果导入失败：${error?.message || error}`); }
  };
  const reviewKnowledgeAction = async (row, action, payload = {}) => {
    try {
      const reviewer = auth?.name || auth?.username || auth?.userName || "管理员";
      const note = payload.note || (action === "publish" ? "管理员审核发布" : "知识卡人工审核");
      const result = await reviewDistilledKnowledge(row.id, { ...payload, action, reviewer, note, documentId: row.documentId });
      const message = action === "publish" ? `“${row.title}”已发布` : action === "accept" ? `“${row.title}”已复核通过` : action === "conflict" ? `“${row.title}”已标记冲突` : `“${row.title}”已退回修改`;
      setStatus(message);
      window.dispatchEvent(new CustomEvent("qmdp:knowledge-updated", { detail: { documentId: row.documentId, knowledgeId: row.id } }));
      await refreshDocuments(true);
      if (detail) await openDetail(files.find((file) => file.id === detail.fileId), "knowledge", detail.page);
      return { ok: true, message, knowledge: result?.knowledge || result };
    } catch (error) {
      const message = `知识审核失败：${error?.message || error}`;
      setStatus(message);
      return { ok: false, message };
    }
  };
  const toggleKnowledgeSelection = (id) => setSelectedKnowledgeIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const batchReviewKnowledge = async (action) => {
    if (action !== "publish" || !detail?.rows?.length || busy || !selectedKnowledgeIds.length) return;
    let rows = detail.rows.filter((row) => selectedKnowledgeIds.includes(row.id));
    if (rows.length < selectedKnowledgeIds.length) {
      const all = await loadDistilledKnowledge(detail.fileId, { limit: 10000, offset: 0 });
      rows = (all.knowledge || []).filter((row) => selectedKnowledgeIds.includes(row.id));
    }
    setKnowledgePublishProgress({ current: 0, total: rows.length, failed: 0 });
    let completed = 0; let failed = 0; let cursor = 0;
    const publishWorker = async () => {
      while (cursor < rows.length) {
        const row = rows[cursor]; cursor += 1;
        try {
          await reviewDistilledKnowledge(row.id, { action: "publish", reviewer: auth?.name || auth?.username || "管理员", note: "批量发布知识", documentId: row.documentId });
          completed += 1;
        } catch { failed += 1; }
        setKnowledgePublishProgress({ current: completed + failed, total: rows.length, failed });
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, rows.length) }, () => publishWorker()));
    setSelectedKnowledgeIds([]);
    setKnowledgePublishProgress(null);
    setStatus(`批量发布完成：${completed}/${rows.length} 条知识卡${failed ? `，失败 ${failed} 条` : ""}`);
    await refreshDocuments(true);
    await openDetail(files.find((file) => file.id === detail.fileId), "knowledge", detail.page);
  };
  const selectAllKnowledgeCards = async () => {
    if (!detail?.fileId || detail.mode !== "knowledge" || detail.loading) return;
    try {
      const response = await loadDistilledKnowledge(detail.fileId, { limit: 10000, offset: 0 });
      setSelectedKnowledgeIds((response.knowledge || []).map((row) => row.id));
      setStatus(`已选中该文件全部 ${response.knowledge?.length || 0} 条知识卡`);
    } catch (error) { setStatus(`全选知识卡失败：${error?.message || error}`); }
  };
  const openGovernanceForDocument = (documentId) => {
    setKnowledgeWorkspace("governance");
    if (documentId) setStatus("已打开版本与治理，请完善版本、Owner和下次复审日期。");
  };
  const reviewFile = async (file, reviewStatus) => {
    try {
      await reviewKnowledgeDocument(file.id, reviewStatus);
      setStatus(reviewStatus === "approved" ? `“${file.name}”人工复核已通过` : `“${file.name}”已标记需重新处理`);
      await refreshDocuments(true);
    } catch (error) { setStatus(`复核状态保存失败：${error?.message || "知识库服务不可用"}`); }
  };
  const completeKnowledgeMetadata = async (file, values) => {
    if (!file) return;
    if (!values) { setMetadataEditor({ fileId: file.id, version: file.version || "", owner: file.owner || "", applicableScope: file.applicableScope || "", publisher: file.publisher || "", edition: file.edition || "", reviewDue: file.reviewDue || "", sourceCategory: file.sourceCategory || "", sourceLevel: file.sourceLevel || "C" }); return; }
    const normalizedLevel = String(values.sourceLevel || "C").trim().toUpperCase();
    if (!["A", "B", "C"].includes(normalizedLevel)) { setStatus("资料等级只能填写 A、B 或 C"); return; }
    try {
      await updateKnowledgeDocumentMetadata(file.id, { version: values.version, owner: values.owner, applicableScope: values.applicableScope, publisher: values.publisher, edition: values.edition, reviewDue: values.reviewDue, sourceCategory: values.sourceCategory, sourceLevel: normalizedLevel });
      setMetadataEditor(null);
      setStatus(`“${file.name}”资料信息和 ${normalizedLevel} 级标记已保存，知识卡片已同步继承`);
      await refreshDocuments(true);
    } catch (error) { setStatus(`资料信息保存失败：${error?.message || error}`); }
  };
  const openDetail = async (file, mode, page = 0) => {
    setDetail({ fileId: file.id, fileName: file.name, mode, page, rows: [], total: 0, loading: true });
    try {
      const response = mode === "clauses" ? await loadKnowledgeClauses(file.id, { limit: detailPageSize, offset: page * detailPageSize }) : await loadDistilledKnowledge(file.id, { limit: detailPageSize, offset: page * detailPageSize });
      const rows = mode === "clauses" ? response.clauses || [] : response.knowledge || [];
      const orderedRows = mode === "knowledge"
        ? [...rows].sort((a, b) => {
          const createdA = Date.parse(a.createdAt || "") || 0;
          const createdB = Date.parse(b.createdAt || "") || 0;
          if (createdA !== createdB) return createdA - createdB;
          return String(a.id || "").localeCompare(String(b.id || ""));
        })
        : rows;
      setDetail({ fileId: file.id, fileName: file.name, mode, page, rows: orderedRows, total: Number(response.total || 0), loading: false });
    } catch (error) { setDetail({ fileId: file.id, fileName: file.name, mode, page, rows: [], total: 0, loading: false, error: error?.message || "读取失败" }); }
  };
  const openMatchedEvidence = async (match) => {
    const file = files.find((item) => item.id === match.documentId);
    if (!file) {
      setIssueMatchState({ status: "error", message: `未找到来源文档：${match.evidence?.documentName || match.documentId}` });
      return;
    }
    const quote = String(match.evidence?.quote || "").trim();
    setDetail({ fileId: file.id, fileName: file.name, mode: "clauses", page: 0, rows: [], total: 0, loading: true });
    try {
      const response = await loadKnowledgeClauses(file.id, { limit: detailPageSize, offset: 0, query: quote.slice(0, 80) });
      setDetail({ fileId: file.id, fileName: file.name, mode: "clauses", page: 0, rows: response.clauses || [], total: Number(response.total || 0), loading: false });
      window.setTimeout(() => document.querySelector(".qmdp-knowledge-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    } catch (error) {
      setDetail({ fileId: file.id, fileName: file.name, mode: "clauses", page: 0, rows: [], total: 0, loading: false, error: error?.message || "读取原文证据失败" });
    }
  };
  const totalClauses = files.reduce((sum, file) => sum + Number(file.clauseCount || 0), 0);
  const totalKnowledge = files.reduce((sum, file) => sum + Number(file.distillationCount || 0), 0);
  const publishedKnowledge = files.reduce((sum, file) => sum + Number(file.metadata?.publishedKnowledgeCount || 0), 0);
  const pendingKnowledge = Math.max(0, totalKnowledge - publishedKnowledge);
  // File deletion must remain available while a background distillation is running.
  const busy = Boolean(generatingId || batchProgress || distillBatchProgress || knowledgePublishProgress);

  const stageProgressSummary = (file, stage) => {
    const jobsForFile = documentJobs[file.id] || {};
    if (stage === "evidence") {
      const metadata = file.metadata || {};
      const pageStates = Array.isArray(metadata.pageStates) ? metadata.pageStates : [];
      const total = Math.max(0, Number(metadata.pageCount || pageStates.length || 0));
      const failedStored = Number(metadata.failedPageCount || pageStates.filter((item) => ["failed", "unavailable"].includes(item.ocrStatus)).length || 0);
      const completedStored = pageStates.length ? pageStates.filter((item) => !["failed", "unavailable"].includes(item.ocrStatus)).length : Number(metadata.processedPageCount || 0) - failedStored;
      const activeMessage = String(jobsForFile.parse?.message || "").match(/(?:OCR|中文OCR|重试失败页)\s*(\d+)\s*\/\s*(\d+)/i);
      const completed = activeMessage && ["waiting", "running", "paused"].includes(jobsForFile.parse?.status) ? Number(activeMessage[1]) : completedStored;
      const failed = Math.min(total, Math.max(0, failedStored));
      const boundedCompleted = Math.min(total, Math.max(0, completed));
      const pending = Math.max(0, total - boundedCompleted - failed);
      if (!total) {
        const status = jobsForFile.parse?.status || file.status;
        return status === "completed" ? "已完成" : status === "failed" || status === "review_required" ? "失败" : "待处理";
      }
      return `已完成 ${boundedCompleted} 页 · 失败 ${failed} 页 · 待处理 ${pending} 页`;
    }
    const summary = jobsForFile.distill?.result?.batchSummary || {};
    const total = Number(summary.total || jobsForFile.distill?.result?.totalBatches || 0);
    const completed = Number(summary.completed || 0);
    const failed = Number(summary.failed || 0);
    const pending = Math.max(0, total - completed - failed);
    if (!total) {
      const status = jobsForFile.distill?.status || (Number(file.distillationCount || 0) > 0 ? "completed" : "pending");
      return status === "completed" ? "已完成" : status === "failed" ? "失败" : "待处理";
    }
    return `已完成 ${completed} 批 · 失败 ${failed} 批 · 待处理 ${pending} 批`;
  };

  useEffect(() => { localStorage.setItem("qmdp-knowledge-match-threshold", String(matchThreshold)); }, [matchThreshold]);
  const hasPublishedKnowledge = publishedKnowledge > 0;
  return <div className="qmdp-page qmdp-knowledge-page"><QmdpStatStrip items={[{ label: "知识文件", value: files.length, note: "服务器登记" }, { label: "规范条款", value: totalClauses, note: "原文可追溯" }, { label: "蒸馏知识", value: totalKnowledge, note: publishedKnowledge ? `已发布 ${publishedKnowledge} 项 · 待确认 ${pendingKnowledge} 项` : "待人工确认" }, { label: "后台任务", value: files.filter((file) => ["waiting", "parsing", "indexing", "distilling"].includes(file.status)).length, note: "自动刷新状态" }]} />
    <QmdpPageHeader icon={Database} eyebrow="知识管理 / Knowledge Base" title="知识库" description="按导入、解析、蒸馏、复核、发布、匹配的顺序维护知识；原始规范始终是唯一依据。" />
    {batchMatchProgress && <div className="qmdp-inline-actions"><button className="qmdp-danger-btn" onClick={stopBatchBuildIssueMatches}><X size={14}/>停止匹配</button><span>已处理 {batchMatchProgress.current} / {batchMatchProgress.total}</span></div>}
    <div className="qmdp-knowledge-flow-guide"><span className="active"><b>1</b>导入与登记</span><i>→</i><span><b>2</b>解析证据</span><i>→</i><span><b>3</b>蒸馏知识</span><i>→</i><span><b>4</b>人工复核</span><i>→</i><span><b>5</b>发布调用</span><i>→</i><span><b>6</b>问题闭环</span></div>
    <section className="qmdp-issue-match-panel"><header><div><small>问题与规范闭环</small><h3>{knowledgeWorkspace === "matching" ? "质量问题 → 候选条款 → 人工确认" : knowledgeWorkspace === "recurrence" ? "重复问题 → 改善措施 → 有效性验证" : knowledgeWorkspace === "governance" ? "版本替代 → 冲突评审 → 发布治理" : knowledgeWorkspace === "performance" ? "索引轻载 → 分层检索 → 性能验证" : "问题匹配规则"}</h3><p>{knowledgeWorkspace === "matching" ? "只同步问题摘要；原始问题和规范原文均不改写，只有已确认匹配可进入角色报告和考试。" : knowledgeWorkspace === "recurrence" ? "同一人员与同一已确认规范形成复发分组；考试通过不等于关闭，观察期和验证证据共同决定措施是否有效。" : knowledgeWorkspace === "governance" ? "原始规范是正式依据；发布、替代、废止和冲突关闭均保留责任人、期限与审计证据。" : knowledgeWorkspace === "performance" ? "只执行只读访问测试，记录列表、分页详情和候选检索延迟，不触发报告重算或业务写入。" : "配置问题与知识卡片的匹配逻辑和自动确认门限。"}</p></div><div className="qmdp-issue-module-tabs">{["matching", "recurrence"].includes(knowledgeWorkspace) && <><button className={issueModule === "IPQC" ? "active" : ""} onClick={() => setIssueModule("IPQC")}>组装 / IPQC</button><button className={issueModule === "DQA" ? "active" : ""} onClick={() => setIssueModule("DQA")}>研发 / DQA</button></>}{knowledgeWorkspace === "matching" && <button className="qmdp-primary-btn" onClick={syncQualityIssues} disabled={issueMatchState.status === "running"}><ArrowsClockwise size={15}/>同步问题数据</button>}</div></header>
      <div className="qmdp-knowledge-workspace-tabs" role="tablist" aria-label="知识闭环工作区"><button role="tab" aria-selected={knowledgeWorkspace === "matching"} className={knowledgeWorkspace === "matching" ? "active" : ""} onClick={() => setKnowledgeWorkspace("matching")}><Target size={15}/>问题匹配</button><button role="tab" aria-selected={knowledgeWorkspace === "recurrence"} className={knowledgeWorkspace === "recurrence" ? "active" : ""} onClick={() => setKnowledgeWorkspace("recurrence")}><ArrowsClockwise size={15}/>复发闭环</button><button role="tab" aria-selected={knowledgeWorkspace === "governance"} className={knowledgeWorkspace === "governance" ? "active" : ""} onClick={() => setKnowledgeWorkspace("governance")}><ShieldCheck size={15}/>版本与治理</button><button role="tab" aria-selected={knowledgeWorkspace === "performance"} className={knowledgeWorkspace === "performance" ? "active" : ""} onClick={() => setKnowledgeWorkspace("performance")}><Pulse size={15}/>检索性能</button><button role="tab" aria-selected={knowledgeWorkspace === "matching-rules"} className={knowledgeWorkspace === "matching-rules" ? "active" : ""} onClick={() => setKnowledgeWorkspace("matching-rules")}><ListChecks size={15}/>匹配规则</button></div>
      {knowledgeWorkspace === "matching-rules" && <KnowledgeMatchingRules threshold={matchThreshold} onThresholdChange={setMatchThreshold}/>}<div className="qmdp-issue-match-body" style={knowledgeWorkspace === "matching-rules" ? { display: "none" } : undefined}>
      {knowledgeWorkspace === "matching" ? <><aside aria-label="质量问题列表"><div className="qmdp-issue-match-toolbar"><input value={issueQuery} onChange={(event) => setIssueQuery(event.target.value)} placeholder="搜索人员、问题类型或问题内容"/>{renderIssueFilterControls()}<button className="qmdp-primary-btn" onClick={() => { setIssueSearchQuery(issueQuery); setIssuePage(0); refreshIssues(false); }} disabled={issueMatchState.status === "running"}><MagnifyingGlass size={14}/>搜索</button><span className="qmdp-issue-search-count">共 {issueTotal} 条</span></div>{issueRows.map((item) => <button key={item.id} className={item.id === selectedIssueId ? "selected" : ""} onClick={() => setSelectedIssueId(item.id)}><span><b>{item.module || issueModule} · {item.issueKind || "质量问题"}</b><em className={Number(item.confirmedCount || 0) > 0 ? "confirmed" : ""}>{Number(item.confirmedCount || 0) > 0 ? "已匹配" : "待匹配"}</em></span><strong>{item.personName || "责任人待确认"}</strong><small>{item.issueType || "未分类问题"}</small><i>{item.issueText || "暂无问题描述"}</i></button>)}{!issueRows.length && <div className="qmdp-empty compact">暂无问题记录，请先同步原始问题数据。</div>}<footer><button className="qmdp-secondary-btn" disabled={issuePage <= 0} onClick={() => setIssuePage((page) => page - 1)}>上一页</button><span>{issueTotal ? `${issuePage * issuePageSize + 1}-${Math.min((issuePage + 1) * issuePageSize, issueTotal)} / ${issueTotal}` : "0 条"}</span><button className="qmdp-secondary-btn" disabled={(issuePage + 1) * issuePageSize >= issueTotal} onClick={() => setIssuePage((page) => page + 1)}>下一页</button></footer></aside><div className="qmdp-match-review"><div className="qmdp-match-threshold"><label>自动确认门限 <input type="number" min="0" max="100" value={matchThreshold} onChange={(event) => setMatchThreshold(Math.max(0, Math.min(100, Number(event.target.value) || 0)))} />%</label><span>{hasPublishedKnowledge ? issueMatchState.message : "当前尚无已发布知识卡片；请先完成证据生成、知识蒸馏并发布知识。"}</span></div>
          {selectedIssue ? <><div className="qmdp-selected-issue"><div><small>{selectedIssue.module} · {selectedIssue.issueKind}</small><h4>{selectedIssue.personName || "责任人待确认"} · {selectedIssue.issueType}</h4><p>{selectedIssue.issueText}</p><span>{selectedIssue.sourceFile}{selectedIssue.issueDate ? ` · ${selectedIssue.issueDate}` : ""}</span></div><button className="qmdp-primary-btn" onClick={batchBuildIssueMatches} disabled={issueMatchState.status === "running"}><Sparkle size={15}/>匹配知识卡</button></div><div className="qmdp-match-list">{issueMatches.map((match) => <article key={match.id} className={`qmdp-match-candidate ${match.status}`}><header><div><span className="qmdp-match-score">{Math.round(match.score)}%</span><div><b>{match.evidence?.candidateTitle || "规范条款"}</b><small>{match.evidence?.documentName || "来源规范"}{match.evidence?.clauseNumber ? ` · ${match.evidence.clauseNumber}` : ""}</small></div></div><em>{match.status === "confirmed" ? "已确认" : match.status === "rejected" ? "已驳回" : match.status === "superseded" ? "已替换" : "候选"}</em></header><p>{match.evidence?.candidateContent || match.evidence?.quote}</p><blockquote>{match.evidence?.quote || "暂无引用"}</blockquote><small className="qmdp-match-reason">{match.evidence?.reason || "等待审核"}</small><footer><button className="qmdp-secondary-btn" onClick={() => setMatchReview(match.id, "rejected")} disabled={issueMatchState.status === "running" || match.status === "rejected"}><X size={14}/>驳回</button><button className="qmdp-primary-btn" onClick={() => setMatchReview(match.id, "confirmed")} disabled={issueMatchState.status === "running" || match.status === "confirmed"}><CheckCircle size={14}/>确认采用</button></footer></article>)}{!issueMatches.length && <div className="qmdp-empty"><Rows size={28}/><strong>尚未生成候选规范</strong><span>系统会同时检索蒸馏知识和原始条款，并展示分数、命中术语与逐字引用。</span></div>}</div></> : <div className="qmdp-empty"><Target size={30}/><strong>选择一条质量问题</strong><span>审核确认后，报告和题库才会正式调用该规范。</span></div>}</div>
        </> : knowledgeWorkspace === "recurrence" ? <KnowledgeRecurrenceWorkspace module={issueModule}/> : knowledgeWorkspace === "governance" ? <KnowledgeGovernanceWorkspace files={files} isAdmin={auth?.isAdmin === true} onRefreshDocuments={refreshDocuments}/> : knowledgeWorkspace === "performance" ? <KnowledgePerformanceWorkspace isAdmin={auth?.isAdmin === true}/> : null}
      </div>
    </section>
    <section className="qmdp-knowledge-exam-center"><header className="qmdp-knowledge-exam-center-head"><button className="qmdp-knowledge-center-toggle" onClick={() => setKnowledgeExamCenterOpen((value) => !value)}><CaretDown size={16} className={knowledgeExamCenterOpen ? "rotate" : ""}/><strong>知识考题中心</strong><span>导入知识、蒸馏知识、生成考题</span></button><div className="qmdp-inline-actions"><button className="qmdp-secondary-btn" onClick={checkKnowledgeConsistency} disabled={checkingKnowledgeConsistency}><ListChecks size={15}/>{checkingKnowledgeConsistency ? "核对中…" : "核对数据"}</button><label className="qmdp-primary-btn"><UploadSimple size={15}/>导入知识文件<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.doc,.docx,.pptx,.txt,.md,.srt,.vtt,.xlsx,.xls,.xlsm,.xmind" onChange={importFiles}/></label></div></header>{knowledgeExamCenterOpen && <div className="qmdp-knowledge-exam-center-body">    <div className="qmdp-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名或文本预览"/><select value={category} onChange={(event) => setCategory(event.target.value)}>{["全部", "研发设计规范", "组装工艺", "研发 Lesson Learned", "调试 SOP"].map((item) => <option key={item}>{item}</option>)}</select><select value={knowledgeReviewFilter} onChange={(event) => setKnowledgeReviewFilter(event.target.value)} aria-label="知识复核状态"><option value="all">全部复核状态</option><option value="candidate">待复核/候选</option><option value="needs-review">解析待复核</option><option value="approved">已初审</option><option value="published">已发布</option></select><span>{knowledgeConsistency ? knowledgeConsistency.consistent ? `数据一致 · ${knowledgeConsistency.counts.documents} 份文档 / ${knowledgeConsistency.counts.clauses} 条证据 / ${knowledgeConsistency.counts.publishedKnowledge} 张已发布` : `数据异常 · ${knowledgeConsistency.issues.join("；")}` : status || `当前显示 ${visible.length} 个文件`}</span>{checkedFileIds.length === 1 && <button className="qmdp-secondary-btn" onClick={() => completeKnowledgeMetadata(files.find((file) => file.id === checkedFileIds[0]))} disabled={busy}><GearSix size={14}/>完善所选资料信息</button>}</div>
    <div className="qmdp-batch-toolbar qmdp-knowledge-distill-toolbar"><label><input type="checkbox" checked={allVisibleChecked} onChange={toggleVisibleFiles} disabled={!visibleIds.length || busy}/><span>{allVisibleChecked ? "取消全选当前结果" : "全选当前结果"}</span></label><label className="qmdp-exam-skill-select"><span>知识蒸馏 Skill</span><select value={selectedKnowledgeSkillId} onChange={(event) => setSelectedKnowledgeSkillId(event.target.value)} disabled={busy || !knowledgeSkills.length}>{knowledgeSkills.length ? knowledgeSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name || skill.id}</option>) : <option value="">暂无可用 Skill</option>}</select><small>{knowledgeSkillStatus}</small></label><strong>已选 {checkedFileIds.length} 项</strong><button className="qmdp-secondary-btn" onClick={distillCheckedKnowledgeFiles} disabled={!checkedFileIds.length || !selectedKnowledgeSkillId || busy}><Sparkle size={14}/>{distillBatchProgress ? `正在蒸馏 ${distillBatchProgress.current}/${distillBatchProgress.total}` : "批量蒸馏知识"}</button><button className="qmdp-danger-btn" onClick={deleteCheckedKnowledgeFiles} disabled={!checkedFileIds.length || busy}><Trash size={14}/>批量删除</button>{distillBatchProgress && <small className="qmdp-batch-generation-status">当前：{distillBatchProgress.fileName}</small>}</div>
    <div className="qmdp-batch-toolbar qmdp-question-generation-toolbar"><label className="qmdp-exam-skill-select"><span>考试题目 Skill</span><select value={selectedExamSkillId} onChange={(event) => setSelectedExamSkillId(event.target.value)} disabled={busy || !examSkills.length}>{examSkills.length ? examSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name || skill.id}</option>) : <option value="">暂无可用 Skill</option>}</select><small>{examSkillStatus}</small></label><div className="qmdp-question-counts"><label><span>单选题数量</span><input type="number" min="0" max="20" value={questionCounts.singleChoice} onChange={(event) => setQuestionCounts((current) => ({ ...current, singleChoice: event.target.value }))} disabled={busy}/></label><label><span>判断题数量</span><input type="number" min="0" max="20" value={questionCounts.trueFalse} onChange={(event) => setQuestionCounts((current) => ({ ...current, trueFalse: event.target.value }))} disabled={busy}/></label></div><button className="qmdp-secondary-btn" onClick={generateCheckedKnowledgeFiles} disabled={!checkedFileIds.length || !selectedExamSkillId || busy}><Brain size={14}/>{batchProgress ? `正在生成 ${batchProgress.current}/${batchProgress.total}` : "批量生成题目"}</button>{batchProgress && <small className="qmdp-batch-generation-status">当前：{batchProgress.fileName}</small>}</div>
    <div className="qmdp-card-grid">{visible.map((file) => { const generationState = generationStates[file.id]; const processing = ["waiting", "parsing", "indexing", "distilling"].includes(file.status); const reviewStatus = file.metadata?.reviewStatus || "not_required"; const ocrPages = Number(file.metadata?.ocrPageCount || 0); const reviewCount = Number(file.metadata?.reviewPageCount || ocrPages || 0); const awaitingReview = reviewCount > 0 && reviewStatus !== "approved"; const canDistill = file.status === "completed" && !awaitingReview; const activeDistillJob = documentJobs[file.id]?.distill; const distillJobRunning = activeDistillJob && ["waiting", "running"].includes(activeDistillJob.status); const distillJobPaused = activeDistillJob?.status === "paused"; const distillJobFailed = activeDistillJob?.status === "failed"; const failedBatchCount = (activeDistillJob?.result?.batches || []).filter((batch) => batch.status === "failed").length; return <article className={`qmdp-file-card qmdp-knowledge-file-card ${checkedFileIds.includes(file.id) ? "is-checked" : ""}`} key={file.id}><header><label className="qmdp-item-check"><input type="checkbox" checked={checkedFileIds.includes(file.id)} onChange={() => toggleKnowledgeFile(file.id)} aria-label={`选择知识文件 ${file.name}`}/></label><FileXls size={21}/><span>{file.category}</span></header><h3>{file.name}</h3><p>{file.preview || "尚未提取文本；可作为知识文件留档。"}</p><div className={`qmdp-knowledge-status ${file.status || "legacy"}`}><div><b>{file.status === "review_required" ? "需要复核/重试" : awaitingReview ? "OCR待人工复核" : file.status === "completed" ? "已完成" : file.status === "failed" ? "处理失败" : file.status === "distilling" ? "知识蒸馏中" : file.status === "registered" ? "已登记待解析" : processing ? "后台处理中" : "本机旧记录"}</b><span>{file.message || (file.serverStored ? "等待后台任务" : "重新导入后可自动拆分条款")}</span></div><strong>{Number(file.progress || 0)}%</strong><i><b style={{ width: `${Number(file.progress || 0)}%` }}/></i></div>{generationState && <small className={`qmdp-file-generation-status ${generationState.tone}`}>{generationState.message}</small>}<footer><div className="qmdp-file-meta">{processingTimingLabel(file, processingClock) && <small className="qmdp-file-processing-timing">处理耗时：{processingTimingLabel(file, processingClock)}</small>}<small>{file.contentType || "text"} · {file.clauseCount || 0} 条证据 · {file.distillationCount || 0} 知识点 · {Math.max(1, Math.round(file.size / 1024))} KB{file.metadata?.originalStored ? " · 原件已存服务端" : ""}{ocrPages ? ` · OCR ${ocrPages} 页/图` : ""}{reviewCount && !ocrPages ? ` · 待复核 ${reviewCount} 项` : ""}{file.examQuestionCount ? ` · ${file.examQuestionCount} 道题` : ""}</small></div><div className="qmdp-file-actions">{file.clauseCount > 0 && <button className="qmdp-secondary-btn" onClick={() => openDetail(file, "clauses")}><Rows size={14}/>查看证据</button>}{file.distillationCount > 0 && <button className="qmdp-secondary-btn" onClick={() => openDetail(file, "knowledge")}><Eye size={14}/>复核知识</button>}{file.clauseCount > 0 && <label className="qmdp-secondary-btn"><UploadSimple size={14}/>导入AI结果<input type="file" accept=".json,.md" onChange={(event) => importDistillationForFile(file, event)} hidden/></label>}{distillJobRunning && <button className="qmdp-danger-btn" onClick={() => controlDocumentJob(file, "pause")} disabled={busy}><Pause size={14}/>暂停蒸馏</button>}{distillJobPaused && <button className="qmdp-primary-btn" onClick={() => controlDocumentJob(file, "resume")} disabled={busy}><ArrowRight size={14}/>继续蒸馏</button>}{distillJobFailed && failedBatchCount > 0 && <button className="qmdp-secondary-btn" onClick={() => controlDocumentJob(file, "retry_failed")} disabled={busy}><ArrowsClockwise size={14}/>只重试失败批次（{failedBatchCount}）</button>}{["failed", "review_required"].includes(file.status) && <button className="qmdp-secondary-btn" onClick={() => retryParse(file)} disabled={busy}><ArrowsClockwise size={14}/>重新解析</button>}{Number(file.metadata?.failedPageCount || file.metadata?.failedPageNumbers?.length || 0) > 0 && <button className="qmdp-secondary-btn" onClick={() => retryFailedParse(file)} disabled={busy}><ArrowsClockwise size={14}/>仅重试失败页</button>}{awaitingReview && file.clauseCount > 0 && <button className="qmdp-secondary-btn" onClick={() => reviewFile(file, "approved")} disabled={busy}><CheckCircle size={14}/>复核通过</button>}{reviewStatus === "approved" && reviewCount > 0 && <button className="qmdp-secondary-btn" onClick={() => reviewFile(file, "rejected")} disabled={busy}><WarningCircle size={14}/>标记需重做</button>}<button className="qmdp-secondary-btn" onClick={() => distillKnowledgeForFile(file)} disabled={!selectedKnowledgeSkillId || !canDistill || busy}><Sparkle size={14}/>{distillingId === file.id ? "正在蒸馏…" : file.distillationCount ? "重新蒸馏" : "蒸馏知识"}</button><button className="qmdp-secondary-btn" onClick={() => generateExamQuestions(file)} disabled={!selectedExamSkillId || !file.preview || awaitingReview || file.status !== "completed" || busy}><Brain size={14}/>{generatingId === file.id ? "正在生成…" : file.examQuestionCount ? "重新出题" : "生成题目"}</button><button className="qmdp-danger-btn" onClick={() => deleteKnowledgeFiles([file.id])} disabled={busy}><Trash size={14}/>删除</button></div></footer></article>; })}{!visible.length && <div className="qmdp-empty"><Database size={30}/><strong>暂无匹配知识文件</strong><span>导入规范、SOP 或经验文档后会显示在这里。</span></div>}</div>
    {detail && <section className="qmdp-knowledge-detail"><header><div><small>{detail.mode === "clauses" ? "原始证据片段" : "知识卡审核"}</small><h3>{detail.fileName}</h3></div><div><span>共 {detail.total} 条</span><button className="qmdp-secondary-btn" onClick={() => setDetail(null)}><X size={14}/>关闭</button></div></header>{detail.mode === "knowledge" && <div className="qmdp-knowledge-batch-toolbar"><label><input type="checkbox" checked={detail.rows.length > 0 && detail.rows.every((row) => selectedKnowledgeIds.includes(row.id))} onChange={() => setSelectedKnowledgeIds(detail.rows.every((row) => selectedKnowledgeIds.includes(row.id)) ? [] : detail.rows.map((row) => row.id))}/><span>全选本页知识卡</span></label><button className="qmdp-secondary-btn" onClick={selectAllKnowledgeCards} disabled={busy || detail.loading}>全选所有知识卡</button><strong>已选 {selectedKnowledgeIds.length} 条</strong><button className="qmdp-primary-btn" onClick={() => batchReviewKnowledge("publish")} disabled={!selectedKnowledgeIds.length || busy}><ShieldCheck size={14}/>批量发布知识</button>{knowledgePublishProgress && <span className="qmdp-batch-publish-progress"><i><b style={{ width: `${Math.round((knowledgePublishProgress.current / Math.max(1, knowledgePublishProgress.total)) * 100)}%` }}/></i>{knowledgePublishProgress.current}/{knowledgePublishProgress.total}</span>}</div>}{detail.loading ? <div className="qmdp-empty compact">正在分页读取…</div> : detail.error ? <div className="qmdp-empty compact">{detail.error}</div> : <div className={`qmdp-knowledge-detail-list ${detail.mode === "knowledge" ? "is-knowledge-list" : "is-evidence-list"}`}>{detail.rows.map((row, index) => detail.mode === "clauses" ? <article key={row.id}><div><b>{row.clauseNumber || `证据 ${row.ordinal}`}</b><span>{row.sourceLocation?.locator || row.metadata?.sourceLocation?.locator || row.sectionPath || "未识别位置"}{row.ocrStatus && row.ocrStatus !== "native" && row.ocrStatus !== "not_required" ? ` · OCR ${row.ocrStatus}` : ""}</span></div><p>{row.clauseText}</p></article> : <KnowledgeReviewCard key={row.id} row={row} sourceDocument={detail.fileName} ordinal={detail.page * detailPageSize + index + 1} selected={selectedKnowledgeIds.includes(row.id)} onToggleSelect={toggleKnowledgeSelection} onAction={reviewKnowledgeAction} onOpenGovernance={openGovernanceForDocument}/>)}</div>}<footer><button className="qmdp-secondary-btn" disabled={detail.page <= 0 || detail.loading} onClick={() => openDetail(files.find((file) => file.id === detail.fileId), detail.mode, detail.page - 1)}>上一页</button><span>第 {detail.page + 1} / {Math.max(1, Math.ceil(detail.total / detailPageSize))} 页</span><button className="qmdp-secondary-btn" disabled={(detail.page + 1) * detailPageSize >= detail.total || detail.loading} onClick={() => openDetail(files.find((file) => file.id === detail.fileId), detail.mode, detail.page + 1)}>下一页</button></footer></section>}
    </div>}</section>
    <KnowledgeTaskCenter files={files} onRefreshDocuments={refreshDocuments}/>
    {metadataEditor && <section className="qmdp-metadata-editor" role="dialog" aria-label="完善资料信息"><header><div><small>文档主数据</small><h3>{files.find((item) => item.id === metadataEditor.fileId)?.name || "所选知识文件"}</h3></div><button className="qmdp-secondary-btn" onClick={() => setMetadataEditor(null)}><X size={14}/>取消</button></header><div className="qmdp-metadata-editor-grid">{[["version","来源文档版本"],["owner","文档 Owner"],["publisher","发布单位"],["edition","版次/出版信息"],["sourceCategory","资料类别"],["reviewDue","下次复审日期"]].map(([key,label]) => <label key={key}>{label}<input type={key === "reviewDue" ? "date" : "text"} value={metadataEditor[key] || ""} onChange={(event) => setMetadataEditor((current) => ({ ...current, [key]: event.target.value }))}/></label>)}<label>适用范围<input value={metadataEditor.applicableScope || ""} onChange={(event) => setMetadataEditor((current) => ({ ...current, applicableScope: event.target.value }))}/></label><label>资料等级<select value={metadataEditor.sourceLevel || "C"} onChange={(event) => setMetadataEditor((current) => ({ ...current, sourceLevel: event.target.value }))}><option value="A">A级：国家/行业标准、法规、权威技术手册</option><option value="B">B级：企业标准、正式SOP、内部规范</option><option value="C">C级：经验、案例、普通参考资料</option></select></label></div><footer><span>保存后，该文档下的知识卡片会统一继承资料等级。</span><button className="qmdp-primary-btn" onClick={() => completeKnowledgeMetadata(files.find((item) => item.id === metadataEditor.fileId), metadataEditor)}><FloppyDisk size={14}/>保存全部资料</button></footer></section>}
  </div>;
}

function KnowledgeMatchingRules({ threshold, onThresholdChange }) {
  return <section className="qmdp-matching-rules"><header><div><small>Matching Policy</small><h4>问题匹配规则</h4><p>候选必须与问题属于同一业务模块，并优先匹配具体对象和故障类型。</p></div><label>自动确认门限 <input type="number" min="0" max="100" value={threshold} onChange={(event) => onThresholdChange(Math.max(0, Math.min(100, Number(event.target.value) || 0)))} />%</label></header><div className="qmdp-matching-rule-grid"><article><b>1 · 对象匹配</b><p>接线、端子、线束、吸嘴、气缸、BOM、图纸等对象词必须相同或命中同义词。问题有对象但知识卡没有对应对象时，候选直接排除。</p></article><article><b>2 · 故障类型</b><p>错装、漏装、短路、断路、松动、干涉、不一致等故障词命中后加权，避免只因“设计、确认、规范”等泛化词命中。</p></article><article><b>3 · 动作与阶段</b><p>安装、连接、焊接、验证、测试、设计、变更等动作，以及 IPQC/DQA、装配/研发阶段用于辅助加权。</p></article><article><b>4 · 来源与状态</b><p>过滤废止、冲突、过期和不适用知识；版本、适用范围、来源等级参与资格判断。</p></article></div><div className="qmdp-matching-score-table"><div><strong>对象匹配</strong><span>最高 24 分</span></div><div><strong>故障类型</strong><span>最高 16 分</span></div><div><strong>标签与共同术语</strong><span>最高 72 分</span></div><div><strong>角色、阶段、范围、来源</strong><span>辅助加权</span></div></div><footer>分数是规则匹配分，不是概率。只有达到设定门限的知识卡才会自动确认，其余保留为候选。</footer></section>;
}
const defaultQuestion = { stem: "质量问题关闭前必须具备什么证据？", options: ["只有口头说明", "措施、责任人与验证结果", "只填写截止日期", "不需要证据"], answer: 1, category: "质量基础" };
const questionTypeDirectoryLabel = (value) => {
  const type = parseQuestionType(value);
  if (type === "TrueFalse") return "判断题目录";
  if (type === "MultiChoice") return "多选题目录";
  if (type === "ShortAnswer") return "简答题目录";
  return "单选题目录";
};
function QuestionBankPage() {
  const [questions, setQuestions] = useState(() => safeParse(localStorage.getItem(qmdpQuestionsKey), []));
  const [selectedId, setSelectedId] = useState(questions[0]?.id || "");
  const [status, setStatus] = useState("");
  const [checkedQuestionIds, setCheckedQuestionIds] = useState([]);
  const [questionTreeOpen, setQuestionTreeOpen] = useState(true);
  const [expandedSources, setExpandedSources] = useState(() => new Set());
  const [expandedDirectories, setExpandedDirectories] = useState(() => new Set());
  const treeInitializedRef = useRef(false);
  useEffect(() => { localStorage.setItem(qmdpQuestionsKey, JSON.stringify(questions)); if (!questions.some((item) => item.id === selectedId)) setSelectedId(questions[0]?.id || ""); }, [questions, selectedId]);
  useEffect(() => { setCheckedQuestionIds((current) => current.filter((id) => questions.some((question) => question.id === id))); }, [questions]);
  const importQuestions = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    let parsed = [];
    let parseError = "";
    try {
      if (/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
        parsed = await parseQuestionWorkbook(file);
      } else {
        const raw = decodeKnowledgeText(await file.arrayBuffer());
        if (/\.json$/i.test(file.name)) {
        const value = JSON.parse(raw);
        parsed = Array.isArray(value) ? value : value.questions || [];
        } else {
          parsed = raw.split(/\r?\n/).filter(Boolean).slice(1).map((line) => { const [stem, a, b, c, d, answer, category] = line.split(","); const options = [a, b, c, d].filter(Boolean); const answerInfo = parseAnswerIndexes(answer, options, "SingleChoice"); return { stem, type: "SingleChoice", options, answer: answerInfo.answer, correctAnswers: answerInfo.correctAnswers, category: category || "导入题库" }; });
        }
      }
    } catch (error) {
      parseError = `${file.name} 导入失败：${error.message || "无法识别 Excel 表头"}`;
      setStatus(parseError);
    }
    if (!parsed.length && !parseError) setStatus("没有导入有效题目，请检查题干、选项和正确答案列");
    const normalized = parsed.map((item, index) => ({ id: item.id || `${file.name}-${Date.now()}-${index}`, stem: item.stem || item.question || defaultQuestion.stem, type: item.type || "SingleChoice", options: Array.isArray(item.options) && item.options.length ? item.options.slice(0, 4) : defaultQuestion.options, answer: Number.isFinite(Number(item.answer)) ? Number(item.answer) : 0, correctAnswers: Array.isArray(item.correctAnswers) && item.correctAnswers.length ? item.correctAnswers : [Number(item.answer) || 0], answerText: item.answerText || "", explanation: item.explanation || "", roles: item.roles || item.applicableRoles || "", categories: item.categories || item.category || "导入题库", knowledge: item.knowledge || "", sourceFileName: item.sourceFileName || file.name }));
    setQuestions((current) => [...normalized, ...current]);
    if (normalized.length) { setSelectedId(normalized[0].id); setStatus(`已从 ${file.name} 导入 ${normalized.length} 道题目`); }
    event.target.value = "";
  };
  const selected = questions.find((item) => item.id === selectedId);
  const groupedQuestions = useMemo(() => {
    const sources = new Map();
    questions.forEach((item) => {
      const sourceName = String(item.sourceFileName || item.knowledge || "未关联规范").trim() || "未关联规范";
      const sourceKey = String(item.sourceKnowledgeId || sourceName);
      if (!sources.has(sourceKey)) sources.set(sourceKey, { key: sourceKey, name: sourceName, questions: [], directories: new Map() });
      const source = sources.get(sourceKey);
      const directoryName = questionTypeDirectoryLabel(item.type);
      if (!source.directories.has(directoryName)) source.directories.set(directoryName, { key: directoryName, name: directoryName, questions: [] });
      source.questions.push(item);
      source.directories.get(directoryName).questions.push(item);
    });
    return [...sources.values()].map((source) => ({ ...source, directories: [...source.directories.values()] }));
  }, [questions]);
  useEffect(() => {
    if (treeInitializedRef.current || !groupedQuestions.length) return;
    const firstSource = groupedQuestions[0];
    setExpandedSources(new Set([firstSource.key]));
    if (firstSource.directories[0]) setExpandedDirectories(new Set([`${firstSource.key}::${firstSource.directories[0].key}`]));
    treeInitializedRef.current = true;
  }, [groupedQuestions]);
  const allQuestionsChecked = questions.length > 0 && questions.every((item) => checkedQuestionIds.includes(item.id));
  const toggleAllQuestions = () => setCheckedQuestionIds(allQuestionsChecked ? [] : questions.map((item) => item.id));
  const toggleQuestion = (id) => setCheckedQuestionIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleQuestionGroup = (ids) => setCheckedQuestionIds((current) => {
    const group = new Set(ids);
    const allChecked = ids.length > 0 && ids.every((id) => current.includes(id));
    return allChecked ? current.filter((id) => !group.has(id)) : [...new Set([...current, ...ids])];
  });
  const toggleExpandedSource = (key) => setExpandedSources((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleExpandedDirectory = (key) => setExpandedDirectories((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const deleteQuestions = (ids) => {
    const remove = new Set(ids);
    setQuestions((current) => current.filter((item) => !remove.has(item.id)));
    setCheckedQuestionIds((current) => current.filter((id) => !remove.has(id)));
  };
  const deleteCheckedQuestions = () => {
    if (!checkedQuestionIds.length || !window.confirm(`确定删除已选中的 ${checkedQuestionIds.length} 道题目吗？此操作不会删除知识文档和历史考试结果。`)) return;
    const count = checkedQuestionIds.length;
    deleteQuestions(checkedQuestionIds);
    setStatus(`已批量删除 ${count} 道题目`);
  };
  return <div className="qmdp-page"><QmdpPageHeader icon={Question} eyebrow="知识管理 / Question Bank" title="题库管理" description="题目由知识库文档生成或按模板导入；每道题保留知识标题和来源文件，供角色报告匹配考试。" action={<label className="qmdp-primary-btn"><UploadSimple size={16}/>导入 Excel 题库<input type="file" accept=".xlsx,.xls,.xlsm,.json,.csv,.txt" onChange={importQuestions}/></label>}/><QmdpStatStrip items={[{ label: "题目总数", value: questions.length, note: "本地题库" }, { label: "分类数", value: new Set(questions.map((item) => item.categories || item.category)).size, note: "题目分类" }, { label: "知识文档关联", value: new Set(questions.map((item) => item.sourceKnowledgeId || item.knowledge).filter(Boolean)).size, note: "来源可追溯" }, { label: "当前状态", value: status ? "已更新" : "可用", note: status || "等待导入" }]} />
    <div className="qmdp-batch-toolbar"><label><input type="checkbox" checked={allQuestionsChecked} onChange={toggleAllQuestions} disabled={!questions.length}/><span>{allQuestionsChecked ? "取消全选" : "全选全部题目"}</span></label><strong>已选 {checkedQuestionIds.length} 题</strong><button className="qmdp-danger-btn" onClick={deleteCheckedQuestions} disabled={!checkedQuestionIds.length}><Trash size={14}/>批量删除</button></div>
    <div className="qmdp-split"><section className={`qmdp-list-panel qmdp-question-tree ${questionTreeOpen ? "is-open" : "is-collapsed"}`}><header><button className="qmdp-question-tree-toggle" onClick={() => setQuestionTreeOpen((current) => !current)} aria-expanded={questionTreeOpen}><CaretDown size={15} className={questionTreeOpen ? "rotate" : ""}/><strong>原始规范与试题</strong><small>{questionTreeOpen ? "收起" : "展开"}</small></button><span>{groupedQuestions.length} 份规范 · {questions.length} 道</span></header>{questionTreeOpen && <div className="qmdp-question-tree-body">{groupedQuestions.map((source) => { const sourceIds = source.questions.map((item) => item.id); const sourceChecked = sourceIds.length > 0 && sourceIds.every((id) => checkedQuestionIds.includes(id)); const sourceOpen = expandedSources.has(source.key); return <div className="qmdp-tree-source" key={source.key}><div className={`qmdp-tree-node qmdp-tree-source-node ${sourceChecked ? "is-checked" : ""}`}><label className="qmdp-item-check"><input type="checkbox" checked={sourceChecked} onChange={() => toggleQuestionGroup(sourceIds)} aria-label={`选择规范 ${source.name} 下全部题目`}/></label><button className="qmdp-tree-expand" onClick={() => toggleExpandedSource(source.key)} aria-expanded={sourceOpen}><CaretDown size={14} className={sourceOpen ? "rotate" : ""}/><FileXls size={16}/><strong>{source.name}</strong><span>{source.questions.length}</span></button></div>{sourceOpen && source.directories.map((directory) => { const directoryIds = directory.questions.map((item) => item.id); const directoryChecked = directoryIds.length > 0 && directoryIds.every((id) => checkedQuestionIds.includes(id)); const directoryKey = `${source.key}::${directory.key}`; const directoryOpen = expandedDirectories.has(directoryKey); return <div className="qmdp-tree-directory" key={directoryKey}><div className={`qmdp-tree-node qmdp-tree-directory-node ${directoryChecked ? "is-checked" : ""}`}><label className="qmdp-item-check"><input type="checkbox" checked={directoryChecked} onChange={() => toggleQuestionGroup(directoryIds)} aria-label={`选择 ${source.name} 的${directory.name}全部题目`}/></label><button className="qmdp-tree-expand" onClick={() => toggleExpandedDirectory(directoryKey)} aria-expanded={directoryOpen}><CaretDown size={13} className={directoryOpen ? "rotate" : ""}/><Rows size={15}/><strong>{directory.name}</strong><span>{directory.questions.length}</span></button></div>{directoryOpen && directory.questions.map((item) => <div key={item.id} className={`qmdp-question-list-row qmdp-tree-question ${item.id === selectedId ? "selected" : ""} ${checkedQuestionIds.includes(item.id) ? "is-checked" : ""}`}><label className="qmdp-item-check"><input type="checkbox" checked={checkedQuestionIds.includes(item.id)} onChange={() => toggleQuestion(item.id)} aria-label={`选择题目 ${item.stem}`}/></label><button onClick={() => setSelectedId(item.id)}><span>{item.categories || item.category || "未分类"}</span><strong>{item.stem}</strong></button></div>)}</div>; })}</div>; })}{!questions.length && <div className="qmdp-empty compact"><Question size={27}/><span>暂无题目，请先在知识库文档上生成，或导入 QMDP Excel 题库。</span></div>}</div>}</section><section className="qmdp-detail-panel">{selected ? <><div className="qmdp-detail-meta"><span>{selected.categories || selected.category} · {selected.type}</span><button className="qmdp-danger-btn" onClick={() => deleteQuestions([selected.id])}><Trash size={14}/>删除题目</button></div><h3>{selected.stem}</h3>{(selected.sourceFileName || selected.knowledge) && <p className="qmdp-question-source">来源知识文档：{selected.sourceFileName || selected.knowledge}{selected.generatedBySkill ? ` · ${selected.generatedBySkill}` : ""}</p>}<div className="qmdp-options">{(selected.options || []).map((option, index) => <div className={(selected.correctAnswers || [selected.answer]).includes(index) ? "correct" : ""} key={`${selected.id}-${index}`}><b>{String.fromCharCode(65 + index)}</b><span>{option}</span>{(selected.correctAnswers || [selected.answer]).includes(index) && <CheckCircle size={16} weight="fill"/>}</div>)}</div>{selected.answerText && !(selected.options || []).length && <p className="qmdp-question-explanation">参考答案：{selected.answerText}</p>}{selected.explanation && <p className="qmdp-question-explanation">解析：{selected.explanation}</p>}</> : <div className="qmdp-empty"><Question size={30}/><strong>选择题目查看详情</strong></div>}</section></div>
  </div>;
}

const normalizeExamText = (value) => String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
const examAnswerCorrect = (question, answer) => {
  if (question.type === "ShortAnswer") {
    const expected = normalizeExamText(question.answerText || question.correctAnswer || "");
    return Boolean(expected && normalizeExamText(answer) === expected);
  }
  const expected = (question.correctAnswers?.length ? question.correctAnswers : [question.answer]).map(Number).sort((a, b) => a - b);
  const actual = (Array.isArray(answer) ? answer : [answer]).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  return expected.length > 0 && expected.length === actual.length && expected.every((value, index) => value === actual[index]);
};

const examTokenFromUrl = () => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("examToken") || "";
const qualityAgentMenuFromUrl = () => {
  if (typeof window === "undefined") return "";
  const module = String(new URLSearchParams(window.location.search).get("qualityAgent") || "").toUpperCase();
  return ["IQC", "IPQC", "OQC", "DQA", "QMS"].includes(module) ? `${module} Agent` : "";
};

const normalizeExamResultRecord = (item = {}) => {
  const submittedAt = item.submittedAt || "";
  const expired = !submittedAt && item.expiresAt && new Date(item.expiresAt).getTime() < Date.now();
  const status = item.status || (submittedAt ? "completed" : expired ? "expired" : "pending");
  return {
    ...item,
    id: item.id || item.examToken || item.token || `EXAM-${submittedAt || item.createdAt || Date.now()}`,
    token: item.token || item.examToken || "",
    status,
    total: Number(item.total ?? item.totalQuestions ?? 0),
    correct: Number(item.correct ?? item.correctAnswers ?? 0),
    score: Number(item.score ?? 0),
    passed: item.passed === true || item.isPassed === true,
    submittedAt,
  };
};
const mergeExamResultRecords = (remote = [], local = []) => {
  const byKey = new Map();
  [...local, ...remote].forEach((item) => {
    const record = normalizeExamResultRecord(item);
    const key = record.token || record.id;
    byKey.set(key, { ...(byKey.get(key) || {}), ...record });
  });
  return [...byKey.values()].sort((left, right) => String(right.submittedAt || right.createdAt || "").localeCompare(String(left.submittedAt || left.createdAt || "")));
};

function KnowledgeExamPage() {
  const examToken = examTokenFromUrl();
  const [remoteSession, setRemoteSession] = useState(null);
  const [remoteError, setRemoteError] = useState("");
  const [examQuestions, setExamQuestions] = useState([]);
  const [active, setActive] = useState(Boolean(examToken));
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState(null);
  const [records, setRecords] = useState(() => mergeExamResultRecords([], safeParse(localStorage.getItem(qmdpExamRecordsKey), [])));
  const [ledgerState, setLedgerState] = useState({ status: examToken ? "idle" : "loading", message: "" });
  const [ledgerFilters, setLedgerFilters] = useState({ recipient: "", role: "", status: "" });
  const currentQuestions = remoteSession?.questions?.length ? remoteSession.questions : examQuestions;
  const current = currentQuestions[index];
  const refreshLedger = useCallback(async () => {
    if (examToken) return;
    setLedgerState({ status: "loading", message: "正在读取服务器考试结果…" });
    const local = safeParse(localStorage.getItem(qmdpExamRecordsKey), []);
    try {
      const response = await loadExamResults({ includePending: true, limit: 1000 });
      setRecords(mergeExamResultRecords(response.records || [], local));
      setLedgerState({ status: "done", message: `已同步至 ${formatSyncDateTime(response.updatedAt) || "刚刚"}` });
    } catch (error) {
      setRecords(mergeExamResultRecords([], local));
      setLedgerState({ status: "error", message: `${error?.message || "服务器考试结果读取失败"}；当前显示本机回退记录` });
    }
  }, [examToken]);
  useEffect(() => { refreshLedger(); }, [refreshLedger]);
  useEffect(() => {
    if (!examToken) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const local = safeParse(localStorage.getItem(qmdpExamSessionsKey), []).find((item) => item.token === examToken);
        const session = local || await loadExamSession(examToken);
        if (cancelled) return;
        if (session.submittedAt || session.isSubmitted) {
          const completed = normalizeExamResultRecord({ ...session.result, submittedAt: session.submittedAt || session.result?.submittedAt, roleName: session.roleName, recipientName: session.recipientName });
          setRemoteSession(session); setResult(completed); setFinished(true); setActive(false); return;
        }
        setRemoteSession(session);
        setExamQuestions(session.questions || []);
        setAnswers((session.questions || []).map((question) => question.type === "MultiChoice" ? [] : question.type === "ShortAnswer" ? "" : -1));
        setActive(Boolean(session.questions?.length));
      } catch (error) {
        if (!cancelled) { setRemoteError(error?.message || "答题链接不存在或已失效"); setActive(false); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [examToken]);
  const choose = (value) => setAnswers((currentAnswers) => currentAnswers.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    if (current.type === "MultiChoice") return Array.isArray(item) ? (item.includes(value) ? item.filter((option) => option !== value) : [...item, value]) : [value];
    return value;
  }));
  const finish = async () => {
    const details = currentQuestions.map((question, questionIndex) => ({ question: question.questionText || question.stem, selected: answers[questionIndex], correct: examAnswerCorrect(question, answers[questionIndex]), explanation: question.explanation || "" }));
    if (remoteSession && examToken && !examToken.startsWith("local-")) {
      try {
        const response = await submitExamSession(examToken, currentQuestions.map((question, questionIndex) => ({ questionId: question.questionId || question.id, selectedOptionIndex: Array.isArray(answers[questionIndex]) ? (answers[questionIndex][0] ?? -1) : (Number.isFinite(Number(answers[questionIndex])) ? Number(answers[questionIndex]) : -1), selectedOptionIndexes: Array.isArray(answers[questionIndex]) ? answers[questionIndex] : undefined, textAnswer: typeof answers[questionIndex] === "string" ? answers[questionIndex] : undefined })));
        const record = { id: `EXAM-${Date.now()}`, submittedAt: response.submittedAt || new Date().toISOString(), total: response.totalQuestions, correct: response.correctAnswers, score: response.score, passed: response.isPassed, roleName: remoteSession.roleName, recipientName: remoteSession.recipientName, issueCategories: remoteSession.issueCategories, examToken, details: [] };
        setRecords((currentRecords) => { const next = [record, ...currentRecords].slice(0, 50); localStorage.setItem(qmdpExamRecordsKey, JSON.stringify(next)); return next; });
        setResult(record); setFinished(true); setActive(false); setRemoteSession((session) => ({ ...session, isSubmitted: true, submittedAt: record.submittedAt, result: response }));
        return;
      } catch (error) {
        setRemoteError(error?.message || "提交考试失败"); return;
      }
    }
    const correct = details.filter((item) => item.correct).length;
    const score = currentQuestions.length ? Math.round(correct / currentQuestions.length * 100) : 0;
    const record = { id: `EXAM-${Date.now()}`, submittedAt: new Date().toISOString(), total: currentQuestions.length, correct, score, passed: score >= 80, roleName: remoteSession?.roleName || "", recipientName: remoteSession?.recipientName || "", issueCategories: remoteSession?.issueCategories || [], examToken, details };
    setRecords((currentRecords) => { const next = [record, ...currentRecords].slice(0, 50); localStorage.setItem(qmdpExamRecordsKey, JSON.stringify(next)); return next; });
    if (remoteSession && examToken.startsWith("local-")) {
      const sessions = safeParse(localStorage.getItem(qmdpExamSessionsKey), []);
      localStorage.setItem(qmdpExamSessionsKey, JSON.stringify(sessions.map((item) => item.token === examToken ? { ...item, submittedAt: record.submittedAt, result: { totalQuestions: record.total, correctAnswers: record.correct, score: record.score, isPassed: record.passed } } : item)));
      setRemoteSession((session) => ({ ...session, submittedAt: record.submittedAt, isSubmitted: true, result: record }));
    }
    setResult(record); setFinished(true); setActive(false);
  };
  const selected = (optionIndex) => Array.isArray(answers[index]) ? answers[index].includes(optionIndex) : answers[index] === optionIndex;
  if (!examToken) {
    const completed = records.filter((item) => item.status === "completed");
    const passed = completed.filter((item) => item.passed).length;
    const pending = records.filter((item) => item.status === "pending").length;
    const average = completed.length ? (completed.reduce((sum, item) => sum + item.score, 0) / completed.length).toFixed(1) : "0.0";
    const roles = [...new Set(records.map((item) => item.roleName).filter(Boolean))];
    const recipients = [...new Set(records.map((item) => item.recipientName).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
    const filtered = records.filter((item) => (!ledgerFilters.recipient || item.recipientName === ledgerFilters.recipient)
      && (!ledgerFilters.role || item.roleName === ledgerFilters.role)
      && (!ledgerFilters.status || item.status === ledgerFilters.status));
    const statusText = (status) => status === "completed" ? "已提交" : status === "pending" ? "待完成" : "已过期";
    return <div className="qmdp-page">
      <QmdpPageHeader icon={Target} eyebrow="知识管理 / Knowledge Exam" title="知识考试" description="接收角色报告关联考试的提交结果，统一查询成绩、通过状态和待完成人员。题目由组装人员或研发工程师报告推送，本页面不主动发起考试。" action={<button className="qmdp-secondary-btn" onClick={refreshLedger} disabled={ledgerState.status === "loading"}><ArrowsClockwise size={16}/>刷新结果</button>}/>
      <QmdpStatStrip items={[{ label: "已提交", value: completed.length, note: `全部记录 ${records.length}` }, { label: "已通过", value: passed, note: completed.length ? `通过率 ${(passed / completed.length * 100).toFixed(1)}%` : "暂无提交" }, { label: "平均分", value: average, note: "已提交考试" }, { label: "待完成", value: pending, note: "报告链接已生成" }]} />
      <section className="qmdp-card exam-ledger">
        <header><div><strong>考试结果台账</strong><span>{ledgerState.message || "跨电脑读取服务器回传结果"}</span></div><b>{filtered.length} 条</b></header>
        <div className="exam-ledger-filters">
          <label>人员<select value={ledgerFilters.recipient} onChange={(event) => setLedgerFilters((currentFilters) => ({ ...currentFilters, recipient: event.target.value }))}><option value="">全部人员</option>{recipients.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label>角色<select value={ledgerFilters.role} onChange={(event) => setLedgerFilters((currentFilters) => ({ ...currentFilters, role: event.target.value }))}><option value="">全部角色</option>{roles.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label>状态<select value={ledgerFilters.status} onChange={(event) => setLedgerFilters((currentFilters) => ({ ...currentFilters, status: event.target.value }))}><option value="">全部状态</option><option value="completed">已提交</option><option value="pending">待完成</option><option value="expired">已过期</option></select></label>
        </div>
        {filtered.length ? <div className="exam-ledger-table-wrap"><table className="exam-ledger-table"><thead><tr><th>人员</th><th>角色</th><th>问题分类</th><th>状态</th><th>成绩</th><th>正确题数</th><th>提交/创建时间</th></tr></thead><tbody>{filtered.map((record) => <tr key={record.token || record.id}><td><strong>{record.recipientName || "未指定"}</strong></td><td>{record.roleName || "未指定"}</td><td>{(record.issueCategories || []).join("、") || "未分类"}</td><td><span className={`exam-ledger-status ${record.status}`}>{statusText(record.status)}</span></td><td>{record.status === "completed" ? <b className={record.passed ? "exam-score-pass" : "exam-score-fail"}>{record.score} 分</b> : "—"}</td><td>{record.status === "completed" ? `${record.correct}/${record.total}` : `${record.total} 题`}</td><td>{formatSyncDateTime(record.submittedAt || record.createdAt) || "—"}</td></tr>)}</tbody></table></div> : <div className="qmdp-empty compact"><Target size={28}/><strong>暂无符合条件的考试结果</strong><span>考试链接会随组装人员或研发工程师报告发出，提交后自动出现在这里。</span></div>}
      </section>
    </div>;
  }
  const displayQuestions = currentQuestions.length;
  let examContent;
  if (remoteError) examContent = <div className="qmdp-empty"><WarningCircle size={32}/><strong>{remoteError}</strong><span>请从质量报告重新打开考试链接，或联系管理员检查考试服务。</span></div>;
  else if (!displayQuestions && !finished) examContent = <div className="qmdp-empty"><Question size={32}/><strong>正在读取关联题目</strong><span>若长时间没有加载，请联系管理员检查考试链接和项目服务。</span></div>;
  else if (active && current) examContent = <section className="exam-card"><div className="exam-progress"><span>第 {index + 1} 题 / 共 {currentQuestions.length} 题</span><i><b style={{ width: `${((index + 1) / currentQuestions.length) * 100}%` }}/></i></div><span className="exam-category">{current.categories || current.category} · {current.type}</span><h3>{current.questionText || current.stem}</h3>{current.type === "ShortAnswer" ? <textarea className="exam-short-answer" value={answers[index] || ""} onChange={(event) => setAnswers((currentAnswers) => currentAnswers.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="请输入答案"/> : <div className="exam-options">{(current.options || []).map((option, optionIndex) => <button className={selected(optionIndex) ? "selected" : ""} key={option} onClick={() => choose(optionIndex)}><b>{String.fromCharCode(65 + optionIndex)}</b>{option}</button>)}</div>}<footer><button onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>上一题</button>{index < currentQuestions.length - 1 ? <button className="qmdp-primary-btn" onClick={() => setIndex((value) => value + 1)}>下一题</button> : <button className="qmdp-primary-btn" onClick={finish}>提交考试</button>}</footer></section>;
  else if (finished && result) examContent = <section className={`exam-result ${result.passed ? "pass" : "fail"}`}><CheckCircle size={40} weight="fill"/><strong>{result.score} 分</strong><span>{result.passed ? "考试合格" : "未达到合格线"} · {result.correct}/{result.total} 题正确</span><small>{remoteSession?.roleName} · {remoteSession?.recipientName}</small></section>;
  return <div className="qmdp-page"><QmdpPageHeader icon={Target} eyebrow="知识管理 / Knowledge Exam" title="关联知识考试" description="本次题目根据质量报告中的本人问题匹配。提交后成绩会回写到知识考试台账，并在下一次本人报告中反馈。"/><QmdpStatStrip items={[{ label: "题目数", value: displayQuestions, note: remoteSession?.recipientName || "报告关联" }, { label: "考试状态", value: finished ? "已完成" : active ? `${index + 1}/${currentQuestions.length}` : "读取中", note: result ? `得分 ${result.score}` : "" }, { label: "合格线", value: "80", note: "百分制" }]} />{examContent}</div>;
}

const knowledgeAdminStatusText = {
  registered: "已登记", parsing: "解析中", indexing: "建立索引", distilling: "蒸馏中", completed: "已完成",
  failed: "处理失败", review_required: "待复核", waiting: "等待中", running: "运行中", paused: "已暂停", cancelled: "已取消",
};
const knowledgeAdminJobTypeText = { parse: "条款解析", source_parse: "文字解析", pdf_parse: "PDF解析", image_parse: "图像OCR", ppt_parse: "PPT解析", distill: "知识蒸馏", bulk_review: "批量知识审核" };

function KnowledgeAdminAtomicRules({ knowledge = [] }) {
  if (!knowledge.length) return null;
  return <section className="qmdp-card qmdp-admin-section qmdp-admin-atomic-rules"><header className="qmdp-admin-section-head"><div><h3>原子规则详情</h3><p>展开知识卡片查看结构化规则字段。</p></div><span>{knowledge.length} 张卡片</span></header><div className="qmdp-admin-atomic-list">{knowledge.map((item) => { const rule = item.metadata?.atomicRule || {}; return <details key={`atomic-top-${item.id}`}><summary><strong>{item.title || "未命名知识点"}</strong><span>{item.type || "未分类"} · {item.sourceLevel || "C"}级</span></summary><div className="qmdp-admin-atomic-grid"><div><b>规则类型</b><span>{rule.ruleType || "-"}</span></div><div><b>主题</b><span>{rule.topic || "-"}</span></div><div><b>主体</b><span>{rule.subject || "-"}</span></div><div><b>动作</b><span>{rule.action || "-"}</span></div><div><b>对象</b><span>{rule.object || "-"}</span></div><div><b>条件</b><span>{rule.condition || "-"}</span></div><div><b>例外</b><span>{Array.isArray(rule.exceptions) ? rule.exceptions.join("；") || "-" : rule.exceptions || "-"}</span></div><div><b>违反判定依据</b><span>{item.metadata?.violationBasis?.join("；") || "-"}</span></div></div></details>; })}</div></section>;
}

function KnowledgeAdminAtomicRulesModule({ knowledge = [] }) {
  if (!knowledge.length) return null;
  return <details className="qmdp-card qmdp-admin-section qmdp-admin-atomic-module"><summary><strong>原子规则详情</strong><span>已加载 {knowledge.length} 张卡片，点击展开</span></summary><div className="qmdp-admin-atomic-list">{knowledge.map((item) => { const rule = item.metadata?.atomicRule || {}; return <details key={`atomic-module-${item.id}`}><summary><strong>{item.title || "未命名知识点"}</strong><span>{item.type || "未分类"} · {item.sourceLevel || "C"}级</span></summary><div className="qmdp-admin-atomic-grid"><div><b>规则类型</b><span>{rule.ruleType || "-"}</span></div><div><b>主题</b><span>{rule.topic || "-"}</span></div><div><b>主体</b><span>{rule.subject || "-"}</span></div><div><b>动作</b><span>{rule.action || "-"}</span></div><div><b>对象</b><span>{rule.object || "-"}</span></div><div><b>条件</b><span>{rule.condition || "-"}</span></div><div><b>例外</b><span>{Array.isArray(rule.exceptions) ? rule.exceptions.join("；") || "-" : rule.exceptions || "-"}</span></div><div><b>违反判定依据</b><span>{item.metadata?.violationBasis?.join("；") || "-"}</span></div></div></details>; })}</div></details>;
}

function KnowledgeAdminPage({ auth }) {
  const [documents, setDocuments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [backups, setBackups] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [backupFilter, setBackupFilter] = useState("all");
  const [previewBackup, setPreviewBackup] = useState(null);
  const [consistency, setConsistency] = useState(null);
  const [qualityReport, setQualityReport] = useState(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityRepairing, setQualityRepairing] = useState("");
  const [cleanupSelection, setCleanupSelection] = useState({ evidence: [], knowledge: [], orphanEvidence: [], orphanKnowledge: [] });
  const [mergingKnowledge, setMergingKnowledge] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [adminDocumentId, setAdminDocumentId] = useState("");
  const [adminQuery, setAdminQuery] = useState("");
  const [adminDetail, setAdminDetail] = useState({ clauses: [], knowledge: [] });
  const [adminDetailLoading, setAdminDetailLoading] = useState(false);
  const [adminEdit, setAdminEdit] = useState(null);
  const [impactPreview, setImpactPreview] = useState(null);
  const [adminSelected, setAdminSelected] = useState({ clause: [], knowledge: [] });
  const [adminBatchBusy, setAdminBatchBusy] = useState(false);
  const [adminBatchProgress, setAdminBatchProgress] = useState(null);
  const [expandedAdminJobs, setExpandedAdminJobs] = useState([]);
  const [adminDocumentPage, setAdminDocumentPage] = useState(0);
  const [adminJobPage, setAdminJobPage] = useState(0);
  const [bulkPatch, setBulkPatch] = useState({ sourceLevel: "", mustReview: "" });
  const [actionState, setActionState] = useState({ id: "", action: "" });

  const refresh = useCallback(async ({ check = false, silent = false } = {}) => {
    if (check) setChecking(true); else if (!silent) setLoading(true);
    setError("");
    try {
      const results = await Promise.all([loadKnowledgeDocuments(), loadKnowledgeJobs()]);
      const nextDocuments = Array.isArray(results[0]?.documents) ? results[0].documents : [];
      const nextJobs = Array.isArray(results[1]?.jobs) ? results[1].jobs : [];
      setBackups([]);
      setAuditLogs([]);
      setDocuments(nextDocuments);
      setJobs(nextJobs);
      setAdminDocumentPage(0);
      setAdminJobPage(0);
      setUpdatedAt(results[0]?.updatedAt || new Date().toISOString());
      if (check) {
        try { setConsistency(await loadKnowledgeConsistency()); } catch (consistencyError) {
          setConsistency({ consistent: false, issues: [consistencyError?.message || "管理员权限不足，无法执行一致性核对"], counts: {} });
        }
      }
      if (auth?.isAdmin && !silent) {
        window.setTimeout(async () => {
          try {
            const [backupResult, auditResult] = await Promise.all([loadKnowledgeBackups(), loadKnowledgeAuditLogs({ limit: 100 })]);
            setBackups(Array.isArray(backupResult?.backups) ? backupResult.backups : []);
            setAuditLogs(Array.isArray(auditResult?.logs) ? auditResult.logs : []);
          } catch (deferredError) { setError(deferredError?.message || "备份和审计数据读取失败"); }
        }, 250);
      }
    } catch (requestError) {
      setError(requestError?.message || "后台知识数据读取失败");
    } finally { if (!silent) setLoading(false); setChecking(false); }
  }, [consistency]);
  const adminPageSize = 50;
  const sortedAdminJobs = useMemo(() => jobs.slice().sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))), [jobs]);
  const visibleAdminDocuments = useMemo(() => documents.slice(adminDocumentPage * adminPageSize, (adminDocumentPage + 1) * adminPageSize), [documents, adminDocumentPage]);
  const visibleAdminJobs = useMemo(() => sortedAdminJobs.slice(adminJobPage * adminPageSize, (adminJobPage + 1) * adminPageSize), [sortedAdminJobs, adminJobPage]);
  const scanDataQuality = useCallback(async () => {
    if (!auth?.isAdmin) return;
    setQualityLoading(true);
    try { setQualityReport(await loadKnowledgeDataQuality()); } catch (requestError) { setError(requestError?.message || "数据质量扫描失败"); } finally { setQualityLoading(false); }
  }, [auth?.isAdmin]);
  const repairDataQuality = async (scope) => {
    if (!auth?.isAdmin) return;
    const labels = { status: "文档状态", evidence: "重复证据" };
    if (!window.confirm(`确认修复${labels[scope] || scope}问题？该操作只处理扫描出的异常。`)) return;
    setQualityRepairing(scope);
    try { const result = await repairKnowledgeDataQuality(scope); setQualityReport(result.report); await refresh({ check: true }); } catch (requestError) { setError(requestError?.message || "数据质量修复失败"); } finally { setQualityRepairing(""); }
  };
  const toggleCleanupId = (kind, id) => setCleanupSelection((current) => ({ ...current, [kind]: current[kind].includes(id) ? current[kind].filter((item) => item !== id) : [...current[kind], id] }));
  const runSelectedCleanup = async () => {
    const payload = { evidenceIds: cleanupSelection.evidence, knowledgeIds: cleanupSelection.knowledge, orphanEvidenceIds: cleanupSelection.orphanEvidence, orphanKnowledgeIds: cleanupSelection.orphanKnowledge };
    const total = Object.values(payload).reduce((sum, items) => sum + items.length, 0);
    if (!total || !window.confirm(`确认清理选中的 ${total} 条数据？删除后不可恢复。`)) return;
    setQualityRepairing("cleanup");
    try { const result = await cleanupKnowledgeDataQuality(payload); setQualityReport(result.report); setCleanupSelection({ evidence: [], knowledge: [], orphanEvidence: [], orphanKnowledge: [] }); await refresh({ check: true }); } catch (requestError) { setError(requestError?.message || "数据清理失败"); } finally { setQualityRepairing(""); }
  };
  const mergeKnowledgeGroup = async (group) => {
    if (!auth?.isAdmin || !group?.ids?.length || group.ids.length < 2) return;
    if (!window.confirm(`保留第一个知识卡并合并其余 ${group.ids.length - 1} 张？合并前会自动保存备份。`)) return;
    setMergingKnowledge(group.key);
    try { const result = await mergeKnowledgeCards({ keepId: group.ids[0], removeIds: group.ids.slice(1) }); setQualityReport(result.report); await refresh({ check: true }); } catch (requestError) { setError(requestError?.message || "知识卡片合并失败"); } finally { setMergingKnowledge(""); }
  };
  const mergeSelectedKnowledge = async () => {
    if (cleanupSelection.knowledge.length < 2) return;
    await mergeKnowledgeGroup({ key: "selected", ids: cleanupSelection.knowledge });
  };
  const mergeAllDuplicateKnowledge = async () => {
    const groups = qualityReport?.duplicateKnowledge || [];
    if (!groups.length || !window.confirm(`确认按每组首条保留并合并 ${groups.length} 组重复知识卡？合并前会自动保存备份。`)) return;
    setMergingKnowledge("all");
    try {
      for (const group of groups) await mergeKnowledgeCards({ keepId: group.ids[0], removeIds: group.ids.slice(1) });
      setQualityReport(await loadKnowledgeDataQuality());
      await refresh({ check: true });
    } catch (requestError) { setError(requestError?.message || "重复知识卡合并失败"); }
    finally { setMergingKnowledge(""); }
  };
  const restoreBackup = async (backup) => {
    if (!backup?.name || !window.confirm(`确认恢复备份“${backup.name}”？已删除记录将写回知识库。`)) return;
    setQualityRepairing(`restore:${backup.name}`);
    try { const result = await restoreKnowledgeBackup(backup.name); setQualityReport(result.report); await refresh({ check: true }); }
    catch (requestError) { setError(requestError?.message || "备份恢复失败"); }
    finally { setQualityRepairing(""); }
  };
  const visibleBackups = backups.filter((backup) => backupFilter === "all" || backup.type === backupFilter);
  const loadAdminDocumentDetail = async (documentId = adminDocumentId) => {
    if (!documentId) return;
    setAdminDetailLoading(true);
    try {
      const [clauses, knowledge] = await Promise.all([loadKnowledgeClauses(documentId, { limit: 100, offset: 0, query: adminQuery }), loadDistilledKnowledge(documentId, { limit: 100, offset: 0 })]);
      const needle = adminQuery.trim().toLowerCase();
      setAdminDetail({ clauses: (clauses?.clauses || []).filter((item) => !needle || String(item.clauseText || "").toLowerCase().includes(needle)), knowledge: (knowledge?.knowledge || []).filter((item) => !needle || `${item.title || ""} ${item.content || ""}`.toLowerCase().includes(needle)) });
    } catch (requestError) { setError(requestError?.message || "后台数据详情读取失败"); }
    finally { setAdminDetailLoading(false); }
  };
  const saveAdminEdit = async () => {
    if (!adminEdit) return;
    try { if (adminEdit.kind === "clause") await updateKnowledgeClause(adminEdit.id, { title: adminEdit.title, clauseText: adminEdit.content }); else await updateKnowledgeCard(adminEdit.id, { title: adminEdit.title, content: adminEdit.content }); setAdminEdit(null); await loadAdminDocumentDetail(); await refresh({ check: true }); }
    catch (requestError) { setError(requestError?.message || "保存失败"); }
  };
  const removeAdminRecord = async (kind, item) => {
    let impact = null;
    try { impact = await loadKnowledgeImpact(kind === "clause" ? "evidence" : "knowledge", item.id); setImpactPreview({ kind, item, impact }); } catch (requestError) { setError(requestError?.message || "关联影响读取失败"); return; }
    if (!window.confirm(`确认删除${kind === "clause" ? "证据" : "知识卡片"}“${item.title || item.clauseText || item.content || item.id}”？关联知识卡 ${impact.evidenceReferences || 0} 张，匹配问题 ${impact.matchReferences || 0} 条，其中已确认 ${impact.confirmedMatches || 0} 条。`)) return;
    try { if (kind === "clause") await deleteKnowledgeClause(item.id); else await deleteKnowledgeCard(item.id); await loadAdminDocumentDetail(); await refresh({ check: true }); }
    catch (requestError) { setError(requestError?.message || "删除失败"); }
    finally { setImpactPreview(null); }
  };
  const toggleAdminSelected = (kind, id) => setAdminSelected((current) => ({ ...current, [kind]: current[kind].includes(id) ? current[kind].filter((item) => item !== id) : [...current[kind], id] }));
  const removeAdminBatch = async () => {
    const entries = [{ kind: "clause", ids: adminSelected.clause }, { kind: "knowledge", ids: adminSelected.knowledge }].flatMap(({ kind, ids }) => ids.map((id) => ({ kind, id })));
    if (!entries.length) return;
    setAdminBatchBusy(true);
    try {
      const impacts = await Promise.all(entries.map((entry) => loadKnowledgeImpact(entry.kind === "clause" ? "evidence" : "knowledge", entry.id)));
      const summary = impacts.reduce((total, item) => ({ evidenceReferences: total.evidenceReferences + Number(item.evidenceReferences || 0), matchReferences: total.matchReferences + Number(item.matchReferences || 0), confirmedMatches: total.confirmedMatches + Number(item.confirmedMatches || 0) }), { evidenceReferences: 0, matchReferences: 0, confirmedMatches: 0 });
      if (!window.confirm(`确认删除选中的 ${entries.length} 条记录？将影响知识卡引用 ${summary.evidenceReferences} 次、问题匹配 ${summary.matchReferences} 条，其中已确认 ${summary.confirmedMatches} 条。`)) return;
      for (const entry of entries) { if (entry.kind === "clause") await deleteKnowledgeClause(entry.id); else await deleteKnowledgeCard(entry.id); }
      setAdminSelected({ clause: [], knowledge: [] }); await loadAdminDocumentDetail(); await refresh({ check: true });
    } catch (requestError) { setError(requestError?.message || "批量删除失败"); }
    finally { setAdminBatchBusy(false); }
  };
  const applyBulkPatch = async () => {
    if (!adminSelected.knowledge.length || (!bulkPatch.sourceLevel && bulkPatch.mustReview === "")) return;
    setAdminBatchBusy(true);
    try { const patch = {}; if (bulkPatch.mustReview !== "") patch.mustReview = bulkPatch.mustReview === "true"; await bulkUpdateKnowledgeCards(adminSelected.knowledge, patch); setAdminSelected((current) => ({ ...current, knowledge: [] })); await loadAdminDocumentDetail(); await refresh({ check: true }); }
    catch (requestError) { setError(requestError?.message || "批量修改失败"); }
    finally { setAdminBatchBusy(false); }
  };
  const applyBulkReview = async (action) => {
    if (!adminSelected.knowledge.length) return;
    const labels = { publish: "发布", return: "退回修改" };
    if (!window.confirm(`确认${labels[action]}选中的 ${adminSelected.knowledge.length} 张知识卡片？`)) return;
    setAdminBatchBusy(true); setAdminBatchProgress({ action, total: adminSelected.knowledge.length, completed: 0, failed: 0 });
    try { await bulkReviewKnowledgeCards(adminSelected.knowledge, action); setAdminSelected((current) => ({ ...current, knowledge: [] })); await loadAdminDocumentDetail(); await refresh({ check: true }); }
    catch (requestError) { setError(requestError?.message || "批量审核失败"); }
    finally { setAdminBatchBusy(false); window.setTimeout(() => setAdminBatchProgress(null), 1500); }
  };
  const downloadAdminExport = () => { const url = exportKnowledgeData(adminDocumentId); const anchor = document.createElement("a"); anchor.href = url; anchor.download = ""; document.body.appendChild(anchor); anchor.click(); anchor.remove(); };

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => refresh({ silent: true }), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const documentById = useMemo(() => new Map(documents.map((item) => [item.id, item])), [documents]);
  const runningJobs = jobs.filter((item) => ["waiting", "running", "paused"].includes(item.status)).length;
  const failedJobs = jobs.filter((item) => ["failed", "cancelled"].includes(item.status)).length;
  const evidenceCount = consistency?.counts?.clauses ?? documents.reduce((sum, item) => sum + Number(item.clauseCount || 0), 0);
  const knowledgeCount = consistency?.counts?.knowledge ?? documents.reduce((sum, item) => sum + Number(item.distillationCount || 0), 0);
  const publishedCount = consistency?.counts?.publishedKnowledge ?? 0;
  const missingOriginalIds = new Set((consistency?.differences?.missingOriginals ? (consistency?.missingOriginals || []) : []).map((item) => item.id));
  const formatBytes = (value) => { const bytes = Number(value || 0); if (!bytes) return "-"; if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`; return `${Math.max(1, Math.round(bytes / 1024))} KB`; };
  const formatDate = (value) => value ? formatSyncDateTime(value) : "-";
  const consistencyLabel = consistency ? (consistency.consistent ? "数据一致" : "发现异常") : "尚未核对";
  const duplicateGroups = useMemo(() => {
    const groups = new Map();
    jobs.forEach((job) => {
      const key = `${job.documentId || ""}:${job.jobType || ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(job);
    });
    return [...groups.values()].filter((group) => group.length > 1);
  }, [jobs]);
  const runJobAction = async (job, action) => {
    if (!auth?.isAdmin) { setError("只有管理员可以管理后台任务"); return; }
    if (!job?.id) return;
    if (action === "delete" && !window.confirm(`确认删除任务“${documentById.get(job.documentId)?.name || job.documentId} · ${knowledgeAdminJobTypeText[job.jobType] || job.jobType}”？原文件、证据和知识卡片会保留。`)) return;
    setActionState({ id: job.id, action });
    setError("");
    try {
      if (action === "delete") await deleteKnowledgeJob(job.id);
      else await controlKnowledgeDistillationJob(job.id, action);
      await refresh({ check: false });
    } catch (requestError) {
      setError(requestError?.message || "任务操作失败");
    } finally { setActionState({ id: "", action: "" }); }
  };
  return <div className="qmdp-page qmdp-knowledge-admin-page">
    <QmdpPageHeader icon={Database} eyebrow="知识管理 / Backend Administration" title="后台知识管理" description="只读查看知识库真实数据、处理任务和前后台一致性。所有统计直接来自服务端，不依赖浏览器缓存。" action={<div className="qmdp-header-actions"><button className="qmdp-secondary-btn" onClick={() => refresh()} disabled={loading}><ArrowsClockwise size={15}/>{loading ? "读取中…" : "刷新数据"}</button><button className="qmdp-primary-btn" onClick={() => refresh({ check: true })} disabled={checking || !auth?.isAdmin}><ListChecks size={15}/>{checking ? "核对中…" : "重新核对"}</button></div>}/>
    {error && <div className="qmdp-task-error">{error}</div>}
    <KnowledgeAdminAtomicRulesModule knowledge={adminDetail.knowledge}/>
    {auth?.isAdmin && (adminSelected.clause.length + adminSelected.knowledge.length) > 0 && <div className="qmdp-inline-actions qmdp-admin-batch-bar"><span>已选择 {adminSelected.clause.length + adminSelected.knowledge.length} 条</span>{adminSelected.knowledge.length > 0 && <><select value={bulkPatch.sourceLevel} onChange={(event) => setBulkPatch((current) => ({ ...current, sourceLevel: event.target.value }))}><option value="">来源级别</option><option value="A">A级</option><option value="B">B级</option><option value="C">C级</option></select><select value={bulkPatch.mustReview} onChange={(event) => setBulkPatch((current) => ({ ...current, mustReview: event.target.value }))}><option value="">复核标记</option><option value="true">需要复核</option><option value="false">无需复核</option></select><button className="qmdp-secondary-btn" disabled={adminBatchBusy} onClick={applyBulkPatch}>批量修改知识卡</button></>}<button className="qmdp-danger-btn" disabled={adminBatchBusy} onClick={removeAdminBatch}>{adminBatchBusy ? "处理中…" : "批量删除并预览影响"}</button></div>}
    {auth?.isAdmin && adminSelected.knowledge.length > 0 && <div className="qmdp-inline-actions qmdp-admin-batch-bar"><span>知识卡审核操作</span><button className="qmdp-primary-btn" disabled={adminBatchBusy} onClick={() => applyBulkReview("publish")}>批量发布知识</button><button className="qmdp-secondary-btn" disabled={adminBatchBusy} onClick={() => applyBulkReview("return")}>批量退回修改</button></div>}
    {adminBatchProgress && <div className="qmdp-admin-batch-progress"><strong>{adminBatchProgress.action === "publish" ? "批量发布知识" : "批量退回修改"}</strong><span>{adminBatchProgress.completed}/{adminBatchProgress.total} 已完成 · {adminBatchProgress.failed} 失败</span><i><b style={{ width: `${adminBatchProgress.total ? (adminBatchProgress.completed + adminBatchProgress.failed) / adminBatchProgress.total * 100 : 0}%` }}/></i></div>}
    {auth?.isAdmin && <div className="qmdp-inline-actions qmdp-admin-export-bar"><span>后台知识数据导出</span><button className="qmdp-secondary-btn" disabled={!adminDocumentId} onClick={downloadAdminExport}>导出选中文档</button><button className="qmdp-secondary-btn" onClick={() => { const anchor = document.createElement("a"); anchor.href = exportKnowledgeData(""); anchor.download = ""; document.body.appendChild(anchor); anchor.click(); anchor.remove(); }}>导出全部文档</button></div>}
    {auth?.isAdmin && <section className="qmdp-card qmdp-admin-section"><header className="qmdp-admin-section-head"><div><h3>后台数据查询</h3><p>按文档检索真实证据和知识卡片，结果直接来自服务端。</p></div></header><div className="qmdp-admin-query"><select value={adminDocumentId} onChange={(event) => { setAdminDocumentId(event.target.value); setAdminDetail({ clauses: [], knowledge: [] }); }}><option value="">{loading ? "正在读取文档…" : documents.length ? "选择文档" : "暂无服务端文档"}</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.name || document.id}</option>)}</select><input value={adminQuery} onChange={(event) => setAdminQuery(event.target.value)} placeholder="搜索证据或知识卡片"/><button className="qmdp-primary-btn" disabled={!adminDocumentId || adminDetailLoading} onClick={() => loadAdminDocumentDetail()}>{adminDetailLoading ? "查询中…" : "查询"}</button></div>{adminDetail.clauses.length > 0 && <div className="qmdp-admin-detail-list"><strong>证据 {adminDetail.clauses.length} 条</strong>{adminDetail.clauses.slice(0, 20).map((item) => <div key={item.id}><input type="checkbox" checked={adminSelected.clause.includes(item.id)} onChange={() => toggleAdminSelected("clause", item.id)}/><b>#{item.ordinal || "-"}</b><span>{item.clauseText}</span><button className="qmdp-secondary-btn" onClick={() => setAdminEdit({ kind: "clause", id: item.id, title: item.title || "", content: item.clauseText || "" })}>编辑</button><button className="qmdp-danger-btn" onClick={() => removeAdminRecord("clause", item)}>删除</button></div>)}</div>}{adminDetail.knowledge.length > 0 && <div className="qmdp-admin-detail-list"><strong>知识卡片 {adminDetail.knowledge.length} 张</strong>{adminDetail.knowledge.slice(0, 20).map((item) => <div key={item.id}><input type="checkbox" checked={adminSelected.knowledge.includes(item.id)} onChange={() => toggleAdminSelected("knowledge", item.id)}/><b>{item.title || "未命名"}</b><span>{item.content || "-"}</span><button className="qmdp-secondary-btn" onClick={() => setAdminEdit({ kind: "knowledge", id: item.id, title: item.title || "", content: item.content || "" })}>编辑</button><button className="qmdp-danger-btn" onClick={() => removeAdminRecord("knowledge", item)}>删除</button></div>)}</div>}{adminDocumentId && !adminDetailLoading && !adminDetail.clauses.length && !adminDetail.knowledge.length && <div className="qmdp-empty compact">暂无匹配记录。</div>}{adminEdit && <div className="qmdp-admin-edit-panel"><input value={adminEdit.title} onChange={(event) => setAdminEdit((current) => ({ ...current, title: event.target.value }))} placeholder="标题"/><textarea value={adminEdit.content} onChange={(event) => setAdminEdit((current) => ({ ...current, content: event.target.value }))}/><button className="qmdp-primary-btn" onClick={saveAdminEdit}>保存</button><button className="qmdp-secondary-btn" onClick={() => setAdminEdit(null)}>取消</button></div>}</section>}
    {backups.length > 0 && <section className="qmdp-card qmdp-admin-section"><header className="qmdp-admin-section-head"><div><h3>备份与审计</h3><p>清理和合并前自动生成的后台备份，可预览影响范围后恢复。</p></div><div className="qmdp-inline-actions"><select value={backupFilter} onChange={(event) => setBackupFilter(event.target.value)}><option value="all">全部备份</option><option value="data_cleanup">数据清理</option><option value="knowledge_merge">知识卡合并</option></select><span>{visibleBackups.length} / {backups.length} 份</span></div></header><div className="qmdp-admin-backup-list">{visibleBackups.map((backup) => <div className="qmdp-admin-backup-row" key={backup.name}><span>{formatDate(backup.createdAt)}</span><b>{backup.type === "knowledge_merge" ? "知识卡合并" : "数据清理"}</b><span>{backup.evidenceCount || 0} 条证据 · {backup.knowledgeCount || 0} 张知识卡</span><button className="qmdp-secondary-btn" onClick={() => setPreviewBackup(backup)}>预览</button><button className="qmdp-secondary-btn" disabled={Boolean(qualityRepairing)} onClick={() => restoreBackup(backup)}>恢复</button></div>)}</div>{previewBackup && <div className="qmdp-admin-backup-preview"><header><strong>恢复预览 · {previewBackup.name}</strong><button className="qmdp-secondary-btn" onClick={() => setPreviewBackup(null)}>关闭</button></header><p>将恢复 {previewBackup.evidenceCount || 0} 条证据、{previewBackup.knowledgeCount || 0} 张知识卡。恢复不会删除当前其它记录。</p>{(previewBackup.knowledgeSamples || []).map((sample, index) => <div key={`k-${index}`}>知识：{sample}</div>)}{(previewBackup.evidenceSamples || []).map((sample, index) => <div key={`e-${index}`}>证据：{sample}</div>)}</div>}<div className="qmdp-admin-audit-list"><header><strong>最近审计记录</strong><span>{auditLogs.length} 条</span></header>{auditLogs.slice(0, 20).map((log) => <div key={log.id}><time>{formatDate(log.createdAt)}</time><b>{log.action}</b><span>{log.summary || "-"}</span></div>)}</div></section>}
    <QmdpStatStrip items={[{ label: "知识文档", value: documents.length, note: "服务端登记" }, { label: "证据条款", value: evidenceCount.toLocaleString(), note: "已入库证据" }, { label: "知识卡片", value: knowledgeCount.toLocaleString(), note: "候选与已发布" }, { label: "已发布知识", value: publishedCount.toLocaleString(), note: "可用于问题匹配" }, { label: "运行中任务", value: runningJobs, note: "等待 / 运行 / 暂停" }, { label: "失败任务", value: failedJobs, note: "需要后续处理" }]} />
    {adminDetail.knowledge.length > 0 && <section className="qmdp-card qmdp-admin-section qmdp-admin-atomic-rules"><header className="qmdp-admin-section-head"><div><h3>原子规则详情</h3><p>默认折叠；展开后查看知识卡片对应的结构化规则字段。</p></div><span>{adminDetail.knowledge.length} 张卡片</span></header><div className="qmdp-admin-atomic-list">{adminDetail.knowledge.map((item) => { const rule = item.metadata?.atomicRule || {}; return <details key={`atomic-${item.id}`}><summary><strong>{item.title || "未命名知识点"}</strong><span>{item.type || "未分类"} · {item.sourceLevel || "C"}级</span></summary><div className="qmdp-admin-atomic-grid"><div><b>规则类型</b><span>{rule.ruleType || "-"}</span></div><div><b>主题</b><span>{rule.topic || "-"}</span></div><div><b>主体</b><span>{rule.subject || "-"}</span></div><div><b>动作</b><span>{rule.action || "-"}</span></div><div><b>对象</b><span>{rule.object || "-"}</span></div><div><b>条件</b><span>{rule.condition || "-"}</span></div><div><b>例外</b><span>{Array.isArray(rule.exceptions) ? rule.exceptions.join("；") || "-" : rule.exceptions || "-"}</span></div><div><b>违反判定依据</b><span>{item.metadata?.violationBasis?.join("；") || "-"}</span></div></div></details>; })}</div></section>}
    {qualityReport?.duplicateKnowledge?.length > 0 && <div className="qmdp-inline-actions qmdp-admin-merge-toolbar"><span>重复知识卡可合并，默认保留每组第一张</span><button className="qmdp-secondary-btn" disabled={Boolean(qualityRepairing) || Boolean(mergingKnowledge)} onClick={mergeAllDuplicateKnowledge}>{mergingKnowledge === "all" ? "合并中…" : "合并全部重复组"}</button></div>}
    <section className={`qmdp-admin-consistency ${consistency?.consistent ? "is-ok" : consistency ? "is-warning" : "is-idle"}`}><div><strong>{consistencyLabel}</strong><span>{consistency ? `存储：${consistency.storage === "postgres" ? "PostgreSQL" : "JSON 快照"} · 检查于 ${formatDate(consistency.checkedAt)}` : "点击“重新核对”检查服务端、快照和原件状态"}</span></div>{consistency?.issues?.length ? <div className="qmdp-admin-issues">{consistency.issues.slice(0, 8).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div> : <span className="qmdp-admin-consistency-note">未发现孤立证据、孤立知识卡或状态不同步</span>}</section>
    <section className="qmdp-card qmdp-admin-section"><header className="qmdp-admin-section-head"><div><h3>数据质量扫描</h3><p>扫描重复证据、重复知识卡和文档状态异常。扫描不会修改数据。</p></div><div className="qmdp-inline-actions"><span>{qualityReport ? `扫描于 ${formatDate(qualityReport.checkedAt)}` : "尚未扫描"}</span><button className="qmdp-secondary-btn" onClick={scanDataQuality} disabled={qualityLoading || !auth?.isAdmin}><ArrowsClockwise size={14}/>{qualityLoading ? "扫描中…" : "重新扫描"}</button></div></header>{qualityReport ? <><div className="qmdp-admin-quality-grid"><div><strong>重复证据</strong><b className={qualityReport.duplicateEvidence?.length ? "has-issue" : "ok"}>{qualityReport.duplicateEvidence?.length || 0} 组</b><small>同一文档中内容完全相同的证据组</small><button className="qmdp-secondary-btn" disabled={!qualityReport.duplicateEvidence?.length || Boolean(qualityRepairing)} onClick={() => repairDataQuality("evidence")}>{qualityRepairing === "evidence" ? "修复中…" : "去重证据"}</button></div><div><strong>重复知识卡</strong><b className={qualityReport.duplicateKnowledge?.length ? "has-issue" : "ok"}>{qualityReport.duplicateKnowledge?.length || 0} 组</b><small>同一文档中标题和内容相同的知识卡</small><span className="qmdp-admin-quality-muted">请在下方勾选后清理</span></div><div><strong>文档状态异常</strong><b className={qualityReport.statusMismatches?.length ? "has-issue" : "ok"}>{qualityReport.statusMismatches?.length || 0} 项</b><small>已有证据或知识但状态仍显示未解析</small><button className="qmdp-secondary-btn" disabled={!qualityReport.statusMismatches?.length || Boolean(qualityRepairing)} onClick={() => repairDataQuality("status")}>{qualityRepairing === "status" ? "修复中…" : "同步文档状态"}</button></div><div><strong>孤立数据</strong><b className={(qualityReport.orphanClauses?.length || qualityReport.orphanKnowledge?.length) ? "has-issue" : "ok"}>{(qualityReport.orphanClauses?.length || 0) + (qualityReport.orphanKnowledge?.length || 0)} 条</b><small>找不到所属文档的数据记录</small><span className="qmdp-admin-quality-muted">请在下方勾选后清理</span></div></div><div className="qmdp-admin-cleanup-panel"><header><strong>逐条清理</strong><span>已选 {Object.values(cleanupSelection).reduce((sum, items) => sum + items.length, 0)} 条</span><button className="qmdp-danger-btn" disabled={!Object.values(cleanupSelection).some((items) => items.length) || Boolean(qualityRepairing)} onClick={runSelectedCleanup}>{qualityRepairing === "cleanup" ? "清理中…" : "删除选中记录"}</button></header>{(qualityReport.duplicateEvidence || []).map((group) => <div className="qmdp-admin-cleanup-group" key={`e-${group.key}`}><b>重复证据 · {group.documentName}</b><small>{group.sample}</small>{group.ids.slice(1).map((id) => <label key={id}><input type="checkbox" checked={cleanupSelection.evidence.includes(id)} onChange={() => toggleCleanupId("evidence", id)}/>删除重复记录 {id}</label>)}</div>)}{(qualityReport.duplicateKnowledge || []).map((group) => <div className="qmdp-admin-cleanup-group" key={`k-${group.key}`}><b>重复知识卡 · {group.documentName}</b><small>{group.sample}</small>{group.ids.slice(1).map((id) => <label key={id}><input type="checkbox" checked={cleanupSelection.knowledge.includes(id)} onChange={() => toggleCleanupId("knowledge", id)}/>删除重复记录 {id}</label>)}</div>)}{(qualityReport.orphanClauses || []).map((id) => <label className="qmdp-admin-orphan-row" key={`oe-${id}`}><input type="checkbox" checked={cleanupSelection.orphanEvidence.includes(id)} onChange={() => toggleCleanupId("orphanEvidence", id)}/>孤立证据 {id}</label>)}{(qualityReport.orphanKnowledge || []).map((id) => <label className="qmdp-admin-orphan-row" key={`ok-${id}`}><input type="checkbox" checked={cleanupSelection.orphanKnowledge.includes(id)} onChange={() => toggleCleanupId("orphanKnowledge", id)}/>孤立知识卡 {id}</label>)}{!qualityReport.duplicateEvidence?.length && !qualityReport.duplicateKnowledge?.length && !qualityReport.orphanClauses?.length && !qualityReport.orphanKnowledge?.length && <span className="qmdp-admin-quality-muted">没有发现可逐条清理的记录。</span>}</div></> : <div className="qmdp-empty compact">管理员页面打开后会自动扫描。</div>}</section>
    <section className="qmdp-card qmdp-admin-section"><header className="qmdp-admin-section-head"><div><h3>知识文档</h3><p>前端知识库当前可见的服务端文档，以及每份文档关联的证据和知识数量。</p></div><span>最后读取：{formatDate(updatedAt)} · 共 {documents.length} 份</span></header><div className="qmdp-admin-table qmdp-knowledge-admin-docs"><div className="qmdp-knowledge-admin-row head"><span>文档</span><span>状态</span><span>证据</span><span>知识</span><span>进度</span><span>更新时间</span></div>{visibleAdminDocuments.map((document) => <div className="qmdp-knowledge-admin-row" key={document.id}><div><strong>{document.name || document.fileName || document.id}</strong><small>{document.category || document.contentType || "未分类"} · {formatBytes(document.size)}</small></div><span className={`qmdp-admin-pill ${document.status || ""}`}>{knowledgeAdminStatusText[document.status] || document.status || "未知"}</span><strong>{Number(document.clauseCount || 0).toLocaleString()}</strong><strong>{Number(document.distillationCount || 0).toLocaleString()}</strong><span className="qmdp-admin-progress"><i><b style={{ width: `${Math.max(0, Math.min(100, Number(document.progress || 0)))}%` }}/></i>{Number(document.progress || 0)}%</span><small>{formatDate(document.updatedAt || document.importedAt)}</small></div>)}{!documents.length && <div className="qmdp-empty compact">暂无服务端知识文档。</div>}</div>{documents.length > adminPageSize && <div className="qmdp-admin-pagination"><span>第 {adminDocumentPage + 1} / {Math.ceil(documents.length / adminPageSize)} 页</span><button className="qmdp-secondary-btn" disabled={adminDocumentPage === 0} onClick={() => setAdminDocumentPage((page) => page - 1)}>上一页</button><button className="qmdp-secondary-btn" disabled={(adminDocumentPage + 1) * adminPageSize >= documents.length} onClick={() => setAdminDocumentPage((page) => page + 1)}>下一页</button></div>}</section>
    <section className="qmdp-card qmdp-admin-section">
      <header className="qmdp-admin-section-head">
        <div>
          <h3>处理任务</h3>
          <p>管理解析、OCR和知识蒸馏任务。删除只删除任务记录，原文件、证据和知识卡片会保留。</p>
        </div>
        <span>{jobs.length} 条任务{duplicateGroups.length ? ` · ${duplicateGroups.length} 组重复` : ""}</span>
      </header>
      {duplicateGroups.length > 0 && (
        <div className="qmdp-admin-duplicate-warning">
          <WarningCircle size={15}/>
          <span>发现 {duplicateGroups.length} 组相同文档、相同阶段的任务，请确认是否保留重复任务。</span>
        </div>
      )}
      <div className="qmdp-admin-table qmdp-knowledge-admin-jobs">
        <div className="qmdp-knowledge-admin-job-row head">
          <span>文档</span><span>阶段</span><span>状态</span><span>进度</span><span>消息</span><span>创建时间</span><span>操作</span>
        </div>
        {visibleAdminJobs.map((job) => {
          const busyAction = actionState.id === job.id;
          const canPause = ["waiting", "running"].includes(job.status);
          const canResume = job.status === "paused";
          const isExpanded = expandedAdminJobs.includes(job.id);
          const failures = job.result?.failures || [];
          return (
            <Fragment key={job.id}>
              <div className="qmdp-knowledge-admin-job-row">
                <strong>{documentById.get(job.documentId)?.name || job.documentId || "未知文档"}</strong>
                <span>{knowledgeAdminJobTypeText[job.jobType] || job.jobType || "未知阶段"}</span>
                <span className={`qmdp-admin-pill ${job.status || ""}`}>{knowledgeAdminStatusText[job.status] || job.status || "未知"}</span>
                <span className="qmdp-admin-progress"><i><b style={{ width: `${Math.max(0, Math.min(100, Number(job.progress || 0)))}%` }}/></i>{Number(job.progress || 0)}%</span>
                <small title={job.message || ""}>{job.message || job.errorMessage || "-"}</small>
                <small>{formatDate(job.createdAt)}</small>
                <div className="qmdp-admin-job-actions">
                  {job.jobType === "bulk_review" && <button className="qmdp-secondary-btn" onClick={() => setExpandedAdminJobs((current) => current.includes(job.id) ? current.filter((item) => item !== job.id) : [...current, job.id])}>{isExpanded ? "收起" : "详情"}</button>}
                  {canPause && <button className="qmdp-secondary-btn" disabled={busyAction} onClick={() => runJobAction(job, "pause")}>{busyAction && actionState.action === "pause" ? "暂停中…" : "暂停"}</button>}
                  {canResume && <button className="qmdp-secondary-btn" disabled={busyAction} onClick={() => runJobAction(job, "resume")}>{busyAction && actionState.action === "resume" ? "继续中…" : "继续"}</button>}
                  <button className="qmdp-danger-btn" disabled={busyAction} onClick={() => runJobAction(job, "delete")}>{busyAction && actionState.action === "delete" ? "删除中…" : "删除任务"}</button>
                </div>
              </div>
              {isExpanded && job.jobType === "bulk_review" && (
                <div className="qmdp-admin-job-detail">
                  <strong>成功 {job.result?.completed || 0} 张，失败 {job.result?.failed || 0} 张</strong>
                  {(job.result?.successes || []).slice(0, 20).map((item) => <span key={`s-${item.id}`}>成功：{item.title || item.id}</span>)}
                  {failures.slice(0, 20).map((item) => <span className="failed" key={`f-${item.id}`}>失败：{item.id} · {item.reason}</span>)}
                  {failures.length > 0 && <button className="qmdp-secondary-btn" disabled={busyAction} onClick={() => runJobAction(job, "retry_failed")}>{busyAction && actionState.action === "retry_failed" ? "重试中…" : "仅重试失败项"}</button>}
                </div>
              )}
            </Fragment>
          );
        })}
        {!jobs.length && <div className="qmdp-empty compact">暂无后台任务记录。</div>}
      </div>
      {jobs.length > adminPageSize && <div className="qmdp-admin-pagination"><span>第 {adminJobPage + 1} / {Math.ceil(jobs.length / adminPageSize)} 页</span><button className="qmdp-secondary-btn" disabled={adminJobPage === 0} onClick={() => setAdminJobPage((page) => page - 1)}>上一页</button><button className="qmdp-secondary-btn" disabled={(adminJobPage + 1) * adminPageSize >= jobs.length} onClick={() => setAdminJobPage((page) => page + 1)}>下一页</button></div>}
    </section>
    {!auth?.isAdmin && <div className="qmdp-note"><WarningCircle size={15}/>一致性核对和任务管理需要管理员权限；当前页面仍可查看服务端文档和任务。</div>}
  </div>;
}

function KnowledgeManagementPage({ active, qualitySources, onEnsureAgentSources, auth }) {
  if (active === "题库管理") return <QuestionBankPage/>;
  if (active === "知识考试") return <KnowledgeExamPage/>;
  if (active === "后台知识管理") return <KnowledgeAdminPage auth={auth}/>;
  return <KnowledgeBasePage qualitySources={qualitySources} onEnsureAgentSources={onEnsureAgentSources} auth={auth}/>;
}

const roleReportNames = ["IPQC操作报告", "机长报告", "交付经理报告", "供应链经理报告", "研发工程师报告", "PM报告", "TPM报告", "产总报告", "董事长报告"];
const qmdpReportSnapshotsKey = "qms-qmdp-report-snapshots-v2";
const reportNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const reportSum = (rows, key) => (rows || []).reduce((sum, row) => sum + reportNumber(row?.[key]), 0);
const reportText = (value, fallback = "暂无") => String(value ?? "").trim() || fallback;
const flattenIpqcRows = (data) => Object.entries(data?.ipqc?.workshopsBySite || {}).flatMap(([site, rows]) => (rows || []).map((row) => ({ ...row, site, key: `${site}-${row.name}` })));
const reportActions = (data, role) => {
  const module = /IPQC|机长|交付经理|供应链/.test(role) ? "IPQC" : /董事长|PM|TPM|产总|研发/.test(role) ? "DQA" : "";
  return (data?.actions || []).filter((item) => !module || item.module === module).slice(0, 8).map((item) => ({ name: item.title, value: `${item.priority} · ${item.progress ?? 0}%`, detail: `${item.owner || "待指定"}；截止 ${item.due || "待定"}；状态：${item.status || "未开始"}`, priority: item.priority }));
};
const reportScope = (role, recipient, detail) => `收件人：${recipient || "全局"}；数据范围：${detail}；统计周期按当前页面日期范围计算。`;
const examReportRole = (role) => role === "IPQC操作报告" ? "操作员" : role === "研发工程师报告" ? "工程师" : "";
const examQuestionSetForReport = (role, categories) => {
  if (!examReportRole(role)) return [];
  const questions = safeParse(localStorage.getItem(qmdpQuestionsKey), []);
  const needles = [...new Set((categories || []).map((item) => String(item || "").trim()).filter(Boolean))];
  const roleNeedle = examReportRole(role);
  const roleAliases = role === "IPQC操作报告" ? ["操作员", "ipqc", "过程检验"] : ["工程师", "研发", "r&d"];
  const scored = questions.map((question) => {
    const roles = `${question.roles || ""} ${question.applicableRoles || ""} ${question.categories || question.category || ""}`.toLowerCase();
    const text = `${question.stem || ""} ${question.categories || question.category || ""} ${question.knowledge || ""}`.toLowerCase();
    const roleMatch = !roles.trim() || roleAliases.some((alias) => roles.includes(alias.toLowerCase())) || roles.includes(roleNeedle.toLowerCase()) || roles.includes(role.replace("报告", "").toLowerCase());
    const categoryScore = needles.reduce((score, item) => score + (text.includes(item.toLowerCase()) ? 3 : 0), 0);
    return { question, score: categoryScore + (roleMatch ? 1 : 0), roleMatch };
  }).filter((item) => item.roleMatch).sort((a, b) => b.score - a.score);
  const selected = scored.filter((item) => item.score > 1).slice(0, 3);
  return (selected.length ? selected : scored.slice(0, 3)).map(({ question }) => ({
    questionId: question.id,
    questionText: question.stem,
    stem: question.stem,
    type: question.type || "SingleChoice",
    options: question.options || [],
    answer: question.answer,
    correctAnswers: question.correctAnswers || [question.answer],
    answerText: question.answerText || "",
    correctAnswer: question.correctAnswer || "",
    explanation: question.explanation || "",
    category: question.categories || question.category || "",
  }));
};

const parseQmdpMappingWorkbook = async (file, kind) => {
  const expected = kind === "org" ? ["产品部", "产总", "TPM", "PM"] : ["厂区", "工坊", "交付经理", "机长"];
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, dense: true });
  const records = [];
  workbook.SheetNames.forEach((sheetName) => {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", blankrows: false });
    const headerIndex = matrix.findIndex((line) => expected.every((header) => line.some((value) => String(value ?? "").trim() === header)));
    if (headerIndex < 0) return;
    const header = matrix[headerIndex].map((value) => String(value ?? "").trim());
    let last = {};
    matrix.slice(headerIndex + 1).forEach((values) => {
      if (!values.some((value) => String(value ?? "").trim())) return;
      const row = Object.fromEntries(expected.map((name) => [name, String(values[header.indexOf(name)] ?? "").trim()]));
      if (kind === "org") {
        last = { ...last, ...(row["产品部"] ? { productDept: row["产品部"] } : {}), ...(row["产总"] ? { productionDirector: row["产总"] } : {}), ...(row.TPM ? { tpm: row.TPM } : {}) };
        if (last.productDept && last.productionDirector && last.tpm && row.PM) records.push({ ...last, pm: row.PM, active: true });
      } else {
        last = { ...last, ...(row["厂区"] ? { site: row["厂区"] } : {}), ...(row["工坊"] ? { workshop: row["工坊"] } : {}), ...(row["交付经理"] ? { manager: row["交付经理"] } : {}) };
        if (last.site && last.workshop && last.manager && row["机长"]) records.push({ ...last, leader: row["机长"], active: true });
      }
    });
  });
  const unique = new Map();
  records.forEach((row) => {
    const key = kind === "org" ? [row.productDept, row.productionDirector, row.tpm, row.pm].join("::") : [row.site, row.workshop, row.manager, row.leader].join("::");
    if (key.replace(/:/g, "")) unique.set(key, row);
  });
  if (!unique.size) throw new Error(`未找到有效的${kind === "org" ? "研发组织" : "供应链"}映射表头：${expected.join(" / ")}`);
  return [...unique.values()];
};

const projectNameRuleFields = [
  { key: "client", label: "客户", codeHeaders: ["客户简称"], nameHeaders: ["客户名称"] },
  { key: "customerProductCategory", label: "客户产品大类", codeHeaders: ["客户产品大类简称"], nameHeaders: ["客户产品大类名称"] },
  { key: "series", label: "产品系列", codeHeaders: ["产品系列简称"], nameHeaders: ["产品系列名称"] },
  { key: "businessCategory", label: "业务类别", codeHeaders: ["业务类别简称"], nameHeaders: ["业务类别"] },
  { key: "productForm", label: "产品形态", codeHeaders: ["产品形态", "产品形态简称"], nameHeaders: ["产品形态名称"] },
  { key: "detailCategory", label: "详细分类", codeHeaders: ["详细分类简称", "详细分类:简称"], nameHeaders: ["详细分类名称", "详细分类"] },
  { key: "process", label: "制程工序", codeHeaders: ["制程工序简称"], nameHeaders: ["制程工序"] },
];
const projectNameText = (value) => String(value ?? "").replace(/[\u3000\s]+/g, " ").trim();
const findHeaderIndex = (headers, candidates) => candidates.map((candidate) => headers.indexOf(candidate)).find((index) => index >= 0) ?? -1;
const parseProjectNameRuleWorkbook = async (file) => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, dense: true });
  const fields = Object.fromEntries(projectNameRuleFields.map(({ key }) => [key, []]));
  workbook.SheetNames.forEach((sheetName) => {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", blankrows: false });
    const headerIndex = matrix.findIndex((line) => projectNameRuleFields.some((field) => field.codeHeaders.some((header) => line.map(projectNameText).includes(header))));
    if (headerIndex < 0) return;
    const headers = matrix[headerIndex].map(projectNameText);
    projectNameRuleFields.forEach((field) => {
      const codeIndex = findHeaderIndex(headers, field.codeHeaders);
      const nameIndex = findHeaderIndex(headers, field.nameHeaders);
      if (codeIndex < 0) return;
      matrix.slice(headerIndex + 1).forEach((row) => {
        const code = projectNameText(row[codeIndex]);
        const name = projectNameText(nameIndex >= 0 ? row[nameIndex] : "");
        if (code) fields[field.key].push({ code, name });
      });
    });
  });
  const normalized = Object.fromEntries(Object.entries(fields).map(([key, entries]) => [key, [...new Map(entries.map((entry) => [entry.code, entry])).values()].sort((a, b) => b.code.length - a.code.length || a.code.localeCompare(b.code, "zh-CN"))]));
  const count = Object.values(normalized).reduce((sum, entries) => sum + entries.length, 0);
  if (!count) throw new Error("未识别到商务代码规则表，请确认包含客户简称、客户产品大类简称、产品系列简称、业务类别简称、产品形态、详细分类简称或制程工序简称列");
  return { sourceName: file.name, importedAt: new Date().toISOString(), fields: normalized };
};
const matchProjectRuleField = (sourceName, entries = []) => {
  const source = projectNameText(sourceName);
  return entries.find((entry) => entry.code && source.includes(entry.code)) || null;
};
const suggestProjectNameMapping = (sourceName, rules = {}) => {
  const key = Object.fromEntries(projectNameRuleFields.map((field) => [field.key, matchProjectRuleField(sourceName, rules?.fields?.[field.key] || [])?.code || ""]));
  const labels = projectNameRuleFields.map((field) => {
    const match = (rules?.fields?.[field.key] || []).find((item) => item.code === key[field.key]);
    return match?.name || match?.code || "";
  }).filter(Boolean);
  const resolved = labels.length;
  return { key, resolved, confidence: resolved >= 5 ? "高" : resolved >= 3 ? "中" : "待确认", suggestedName: labels.join(" · ") };
};
const projectMappingKeyText = (key = {}) => projectNameRuleFields.map((field) => key[field.key] || "-").join(" / ");

const reportConfig = () => ({ ...defaultQmdpSystemConfig, ...safeParse(localStorage.getItem(qmdpSystemKey), {}) });
const reportActiveMappings = (rows = []) => (Array.isArray(rows) ? rows : []).filter((row) => row.active !== false);
const reportNames = (value) => String(value || "").split(/[、,，/\n]/).map((item) => item.trim()).filter((item) => item && !["待配置", "未配置", "新产品部"].includes(item));
const reportDqaScope = (role, recipient, dqa) => {
  const config = reportConfig();
  const mappings = reportActiveMappings(config.orgMappings);
  const stageRows = dqa?.tpmStages || [];
  const selected = String(recipient || "").trim();
  if (!selected || !["PM报告", "TPM报告", "产总报告"].includes(role)) return { mappings, stageRows, divisions: [] };
  let scope = mappings;
  if (role === "PM报告") scope = mappings.filter((row) => reportNames(row.pm).includes(selected));
  if (role === "TPM报告") scope = mappings.filter((row) => reportNames(row.tpm).includes(selected) || reportNames(row.pm).includes(selected));
  if (role === "产总报告") scope = mappings.filter((row) => reportNames(row.productionDirector).includes(selected));
  const divisions = [...new Set(scope.map((row) => row.productDept).filter(Boolean))];
  const tpms = [...new Set(scope.flatMap((row) => reportNames(row.tpm)).filter(Boolean))];
  const scopedRows = stageRows.filter((row) => (tpms.length ? tpms.includes(row.name) : divisions.includes(row.division)) || (role === "TPM报告" && row.name === selected));
  return { mappings: scope, stageRows: scopedRows.length ? scopedRows : stageRows.filter((row) => role === "PM报告" ? row.name === selected || row.division === selected : role === "TPM报告" ? row.name === selected : divisions.includes(row.division) || row.name === selected), divisions, tpms };
};
const reportSupplyScope = (role, recipient, leaders, managers, workshops) => {
  const config = reportConfig();
  const mappings = reportActiveMappings(config.supplyMappings);
  const selected = String(recipient || "").trim();
  if (role === "供应链经理报告" || !selected) return { mappings, leaders, managers, workshops };
  const selectedWorkshop = selected.split(" · ").pop().trim();
  const selectedLeader = selected.split(" · ").pop().trim();
  const matches = role === "机长报告"
    ? mappings.filter((row) => row.leader === selected || row.leader === selectedLeader)
    : mappings.filter((row) => row.manager === selected || row.workshop === selected || row.workshop === selectedWorkshop || String(row.workshop || "").includes(selectedWorkshop));
  const leaderKeys = new Set(matches.map((row) => `${row.site}::${row.leader}`));
  const workshopKeys = new Set(matches.map((row) => `${row.site}::${row.workshop}`));
  const scopedLeaders = leaders.filter((row) => leaderKeys.has(`${row.site}::${row.name}`) || (role === "机长报告" && (row.name === selected || row.name === selectedLeader)));
  const scopedManagers = managers.filter((row) => matches.some((map) => map.manager === (row.manager || row.name) && (!map.site || map.site === row.site)) || (role !== "机长报告" && (row.manager || row.name) === selected));
  const scopedWorkshops = workshops.filter((row) => {
    const workshopName = String(row.name || "").split("·").pop().trim();
    return workshopKeys.has(`${row.site}::${workshopName}`) || matches.some((map) => map.site === row.site && map.workshop === workshopName);
  });
  return {
    mappings: matches,
    leaders: scopedLeaders.length ? scopedLeaders : leaders.filter((row) => role === "机长报告" ? row.name === selectedLeader : row.manager === selected || row.workshopManager === selected),
    managers: scopedManagers.length ? scopedManagers : managers.filter((row) => row.manager === selected || row.name === selected),
    workshops: matches.length && scopedWorkshops.length ? scopedWorkshops : workshops.filter((row) => String(row.name || "").split("·").pop().trim() === selectedWorkshop),
  };
};
const reportDqaPersonMetrics = (person, dqa) => {
  const stage = (dqa?.tpmStages || []).find((row) => row.name === person) || {};
  const ecnRows = dqa?.ecn?.source?.numeratorRows || [];
  const denominatorRows = dqa?.ecn?.source?.denominatorRows || [];
  const ecn = ecnRows.filter((row) => row.tpm === person).length;
  const denominator = denominatorRows.filter((row) => row.tpm === person).reduce((sum, row) => sum + reportNumber(row.materialCount), 0);
  const part = (kind) => (dqa?.machinedParts?.[kind]?.tpms || []).filter((row) => row.tpm === person).reduce((sum, row) => sum + reportNumber(row.years?.find((item) => item.year === 2026)?.numerator), 0);
  return { ...stage, ecn, ecnDenominator: denominator, nonBom: part("nonBom"), machinedEcn: part("ecn") };
};
const reportDqaMetricRow = (row, dqa) => {
  const base = reportDqaPersonMetrics(row?.name || row?.tpm, dqa);
  return {
    ...base,
    ...row,
    review: row?.review ?? base.review,
    production: row?.production ?? base.production,
    onsite: row?.onsite ?? base.onsite,
    ecn: row?.ecn ?? base.ecn,
    ecnDenominator: row?.ecnDenominator ?? base.ecnDenominator,
    nonBom: row?.nonBom ?? base.nonBom,
    machinedEcn: row?.machinedEcn ?? base.machinedEcn,
  };
};
const reportDqaAggregate = (rows, dqa) => {
  const unique = new Map();
  (rows || []).forEach((row) => {
    const key = row?.__reportKey || `${row?.division || ""}::${row?.name || row?.tpm || ""}`;
    if (key.replace(/:/g, "")) unique.set(key, row);
  });
  return [...unique.values()].reduce((sum, row) => {
  const item = reportDqaMetricRow(row, dqa);
  return { review: sum.review + reportNumber(item.review), production: sum.production + reportNumber(item.production), onsite: sum.onsite + reportNumber(item.onsite), ecn: sum.ecn + reportNumber(item.ecn), ecnDenominator: sum.ecnDenominator + reportNumber(item.ecnDenominator), nonBom: sum.nonBom + reportNumber(item.nonBom), machinedEcn: sum.machinedEcn + reportNumber(item.machinedEcn) };
}, { review: 0, production: 0, onsite: 0, ecn: 0, ecnDenominator: 0, nonBom: 0, machinedEcn: 0 });
};
const reportExcelDate = (value) => {
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const reportDateInRange = (value, dateRange) => {
  const date = reportExcelDate(value);
  if (!date) return false;
  const year = date.getFullYear();
  const start = year === 2025 ? dateRange?.start2025 : dateRange?.start2026;
  const end = year === 2025 ? dateRange?.end2025 : dateRange?.end2026;
  if (!start || !end) return year === 2026;
  return date >= new Date(`${start}T00:00:00`) && date <= new Date(`${end}T23:59:59.999`);
};
const reportIpqcRawRows = (files = [], dateRange) => files.filter((file) => file.module === "IPQC" && file.kind !== "IPQC_LEADER_MAP").flatMap((file) => (file.rows || []).map((row) => ({ ...row, __reportSite: String(file.name || "").includes("杭州") ? "杭州" : "深圳" }))).filter((row) => reportDateInRange(row["日期"] || row["检验日期"] || row["发生日期"], dateRange));
const reportIpqcOperators = (files, dateRange) => {
  const rawRows = reportIpqcRawRows(files, dateRange);
  const senderOf = (row) => String(row["送检人"] || row["送检人员"] || row["责任人"] || row["检验人"] || row["检验员"] || "").trim();
  const uniqueRows = new Map();
  rawRows.filter((row) => senderOf(row)).forEach((row) => {
    const key = [row.__reportSite, row["日期"] || row["检验日期"] || row["发生日期"], row["任务单号"] || row["工单号"], row["组件类型"] || row["组件名称"], row["不良内容"] || row["异常内容"] || row["异常原因"], row["不良类型"] || row["异常类型"], senderOf(row), row["机长"]].map((value) => String(value ?? "").trim()).join("|");
    if (!uniqueRows.has(key)) uniqueRows.set(key, row);
  });
  const rows = [...uniqueRows.values()];
  const byName = new Map();
  rows.forEach((row) => {
    const name = senderOf(row);
    if (!name || ["未填写", "无", "-"].includes(name)) return;
    const item = byName.get(name) || { name, qty: 0, issues: 0, site: row.__reportSite, workshop: String(row["产品工坊"] || row["工坊"] || "未分工坊").trim(), leaders: new Set(), categories: new Map() };
    const qty = reportNumber(row["送检数"] ?? row["送检数量"] ?? row["治具数量"] ?? row["检验数量"] ?? 1);
    const issueText = row["不良内容"] || row["异常内容"] || row["异常原因"] || row["不良描述"] || "";
    const issue = String(issueText).trim() ? 1 : 0;
    item.qty += qty; item.issues += issue;
    if (row["机长"]) item.leaders.add(String(row["机长"]).trim());
    if (issue) { const category = String(row["不良类型"] || row["异常类型"] || "未分类").trim() || "未分类"; item.categories.set(category, (item.categories.get(category) || 0) + 1); }
    byName.set(name, item);
  });
  return [...byName.values()].map((row) => ({ ...row, leaders: [...row.leaders], density: Number((row.issues / Math.max(row.qty, 1) * 100).toFixed(2)), categories: [...row.categories.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value) })).sort((a, b) => b.issues - a.issues);
};
const reportDqaSourceKind = (file) => {
  if (file?.subKind) return file.subKind;
  const name = String(file?.name || "");
  const keys = new Set((file?.rows || []).flatMap((row) => Object.keys(row || {})));
  if (name.includes("非BOM") || keys.has("申请人")) return "DQA_ENGINEER_NON_BOM";
  if (name.includes("ECN查询导出") || keys.has("ECN编号") || keys.has("创建人")) return "DQA_ENGINEER_ECN";
  if (name.includes("FPC事业部-研发问题") || keys.has("责任人\\处理人") || keys.has("研发工程师")) return "DQA_ENGINEER_PROBLEMS";
  return "";
};
const reportDqaRawRows = (files = [], dateRange) => files
  .filter((file) => file.module === "DQA" && reportDqaSourceKind(file) === "DQA_ENGINEER_PROBLEMS")
  .flatMap((file) => (file.rows || []).map((row) => ({ ...row, __reportFile: file.name })))
  .filter((row) => reportDateInRange(row["发生日期"] || row["日期"] || row["问题日期"], dateRange));
const reportDqaEngineerField = (row) => {
  const keys = ["__engineer", "研发工程师", "工程师", "RD工程师", "RDEngineer", "工程师姓名", "责任人\\处理人", "责任人/处理人", "责任人"];
  const key = keys.find((name) => row?.[name] != null && String(row[name]).trim());
  if (!key) return "";
  const source = String(row[key] || "").trim();
  const idName = source.match(/^\d+\s*[（(]([^）)]+)[）)]$/);
  return idName ? idName[1].trim() : source.replace(/[（(][^）)]*[）)]/g, "").trim();
};
const reportDqaEngineerRows = (files = [], dqa = {}, dateRange) => {
  if (Array.isArray(dqa.engineers) && dqa.engineers.length) return dqa.engineers;
  const rawRows = reportDqaRawRows(files, dateRange);
  const groups = new Map();
  const getItem = (division = "未分配", name) => {
    // One engineer may appear under a product department in the issue export and
    // under a functional department in the ECN export; aggregate by person.
    const key = name;
    const item = groups.get(key) || { name, division, tpm: "", pm: "", productionDirector: "", review: 0, production: 0, onsite: 0, ecn: 0, nonBom: 0, nonBomRequests: 0 };
    if ((!item.division || item.division === "未分配") && division) item.division = division;
    groups.set(key, item);
    return item;
  };
  rawRows.forEach((row) => {
    const name = reportDqaEngineerField(row);
    if (!name) return;
    const division = String(row["产品部"] || row["产品线"] || "未分配").trim();
    const tpm = String(row["TPM"] || row["TPM姓名"] || row["负责TPM"] || "").trim();
    const pm = String(row["PM"] || row["PM姓名"] || row["负责PM"] || "").trim();
    const productionDirector = String(row["产总"] || row["产品部负责人"] || "").trim();
    const item = getItem(division, name);
    item.tpm ||= tpm; item.pm ||= pm; item.productionDirector ||= productionDirector;
    const stageText = String(row["阶段"] || row["问题阶段"] || row["问题发生地"] || row["问题反馈部门"] || "").trim();
    const stage = /评审|设计评审/.test(stageText) ? "review" : /售后|现场/.test(stageText) ? "onsite" : "production";
    if (row["问题描述"] || row["问题"] || row["问题内容"]) item[stage] += 1;
  });
  files.filter((file) => file.module === "DQA" && reportDqaSourceKind(file) === "DQA_ENGINEER_ECN")
    .flatMap((file) => file.rows || [])
    .filter((row) => reportDateInRange(row["申请日期"] || row["日期"], dateRange))
    .forEach((row) => {
      const name = reportDqaEngineerField(row);
      if (!name) return;
      const division = String(row["产品部"] || row["申请部门"] || "未分配").trim();
      getItem(division, name).ecn += 1;
    });
  files.filter((file) => file.module === "DQA" && reportDqaSourceKind(file) === "DQA_ENGINEER_NON_BOM")
    .flatMap((file) => file.rows || [])
    .filter((row) => reportDateInRange(row["创建时间"] || row["需求日期"] || row["申请日期"], dateRange))
    .forEach((row) => {
      const name = reportDqaEngineerField(row);
      if (!name) return;
      const division = String(row["产品部"] || "未分配").trim();
      const item = getItem(division, name);
      item.nonBom += Math.max(reportNumber(row["申请数量"]), 1);
      item.nonBomRequests += 1;
    });
  return [...groups.values()];
};
const reportOperatorsForScope = (operators, role, recipient, supplyMappings = []) => {
  const selected = String(recipient || "").trim();
  if (!selected) return operators;
  const mappings = reportActiveMappings(supplyMappings);
  const selectedWorkshop = selected.split(" · ").pop().trim();
  const selectedLeader = selected.split(" · ").pop().trim();
  const scopedMappings = role === "机长报告" ? mappings.filter((row) => row.leader === selected || row.leader === selectedLeader) : role === "交付经理报告" ? mappings.filter((row) => row.manager === selected || row.manager === selectedWorkshop) : [];
  const leaders = new Set(scopedMappings.map((row) => row.leader));
  const workshops = new Set(scopedMappings.map((row) => row.workshop));
  return operators.filter((row) => (role === "机长报告" && (row.leaders || []).some((leader) => leaders.has(leader) || leader === selectedLeader)) || (role === "交付经理报告" && ((row.workshop && [...workshops].some((workshop) => row.workshop.includes(workshop))) || (row.leaders || []).some((leader) => leaders.has(leader)))));
};
const reportExamHistory = (role, recipient) => {
  const roleName = examReportRole(role);
  if (!roleName || !recipient) return [];
  return safeParse(localStorage.getItem(qmdpExamRecordsKey), []).filter((item) => item.recipientName === recipient && item.roleName === roleName).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)).slice(0, 5);
};
const reportSupervisor = (role, recipient, operators, config) => {
  if (!recipient) return "";
  if (role === "IPQC操作报告") {
    const operator = operators.find((row) => row.name === recipient);
    const leaders = new Set(operator?.leaders || []);
    const maps = reportActiveMappings(config.supplyMappings).filter((row) => leaders.has(row.leader));
    return [...new Set(maps.map((row) => `${row.manager}${row.workshop ? `（${row.workshop}）` : ""}`).filter(Boolean))].join("、");
  }
  if (role === "机长报告") {
    const leader = String(recipient).split(" · ").pop().trim();
    return [...new Set(reportActiveMappings(config.supplyMappings).filter((row) => row.leader === recipient || row.leader === leader).map((row) => row.manager).filter(Boolean))].join("、");
  }
  if (role === "交付经理报告") return "供应链经理";
  if (role === "研发工程师报告") {
    const maps = reportActiveMappings(config.orgMappings).filter((row) => reportNames(row.tpm).includes(recipient));
    return [...new Set(maps.flatMap((row) => reportNames(row.pm)))].join("、");
  }
  if (role === "PM报告") return [...new Set(reportActiveMappings(config.orgMappings).filter((row) => reportNames(row.pm).includes(recipient)).flatMap((row) => reportNames(row.tpm)))].join("、");
  if (role === "TPM报告") return [...new Set(reportActiveMappings(config.orgMappings).filter((row) => reportNames(row.tpm).includes(recipient)).flatMap((row) => reportNames(row.productionDirector)))].join("、");
  if (role === "产总报告") return "董事长";
  return "";
};
const reportSubordinateExamResults = (role, recipient, operators, config) => {
  if (!recipient || !["机长报告", "交付经理报告"].includes(role)) return [];
  const mappings = reportActiveMappings(config.supplyMappings);
  const selectedLeader = String(recipient || "").split(" · ").pop().trim();
  const allowedLeaders = new Set(role === "机长报告" ? [recipient, selectedLeader] : mappings.filter((row) => row.manager === recipient).map((row) => row.leader));
  const names = new Set(operators.filter((row) => (row.leaders || []).some((leader) => allowedLeaders.has(leader))).map((row) => row.name));
  return safeParse(localStorage.getItem(qmdpExamRecordsKey), []).filter((item) => item.roleName === "操作员" && names.has(item.recipientName)).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)).slice(0, 20);
};

function buildWebRoleReport(data, role, recipient, dateRange, files = []) {
  const ipqc = data?.ipqc || {};
  const dqa = data?.dqa || {};
  const oqc = data?.oqc || {};
  const leaders = ipqc.leaderAnalysis?.bySite?.全公司?.leaders || [];
  const managers = ipqc.leaderAnalysis?.bySite?.全公司?.managers || [];
  const workshops = flattenIpqcRows(data).sort((a, b) => reportNumber(b.y2026Rate) - reportNumber(a.y2026Rate));
  const operators = reportIpqcOperators(files, dateRange);
  const defects = Object.values(ipqc.rawTypesBySite || {}).flat().reduce((map, row) => map.set(row.name, (map.get(row.name) || 0) + reportNumber(row.y2026Count)), new Map());
  const defectRows = [...defects.entries()].map(([name, count]) => ({ name, value: count, detail: `2026异常 ${count.toLocaleString()} 项；占当前异常类型合计 ${reportSum([...defects.entries()].map(([n, c]) => ({ count: c })), "count") ? (count / reportSum([...defects.entries()].map(([n, c]) => ({ count: c })), "count") * 100).toFixed(1) : 0}%` })).sort((a, b) => b.value - a.value);
  let recipients = [];
  let metrics = [];
  let focusItems = [];
  let rankingItems = [];
  let comparisonItems = [];
  let scopeText = "全公司质量数据";
  let summary = "";
  let risk = "";
  let decision = "";
  let dataNotice = "";
  let examIssueCategories = [];
  let subordinateItems = [];
  let trendItems = [];
  let closureItems = [];
  if (role === "IPQC操作报告") {
    const rows = operators.length ? operators : [];
    recipients = rows.map((row) => row.name).filter(Boolean);
    const selected = rows.find((row) => row.name === recipient) || rows[0];
    examIssueCategories = selected?.categories?.slice(0, 5).map((row) => row.name) || defectRows.slice(0, 5).map((row) => row.name);
    const selectedDefects = selected?.categories?.length ? selected.categories : defectRows;
    metrics = [{ name: "检验数量", value: selected?.qty || 0, note: "本人责任记录" }, { name: "异常数量", value: selected?.issues || 0, note: "需复盘异常" }, { name: "异常率", value: `${reportNumber(selected?.density || 0).toFixed(2)}%`, note: "过程质量表现" }];
    focusItems = selectedDefects.slice(0, 8).map((row) => ({ name: row.name, value: reportNumber(row.value).toLocaleString(), detail: `个人异常类型；占本人异常 ${selected?.issues ? (row.value / selected.issues * 100).toFixed(1) : 0}%` })); rankingItems = rows.slice().sort((a, b) => reportNumber(b.issues) - reportNumber(a.issues)).map((row) => ({ name: `${row.site ? `${row.site} · ` : ""}${row.name}`, value: reportNumber(row.issues).toLocaleString(), detail: `检验 ${reportNumber(row.qty).toLocaleString()}；异常率 ${reportNumber(row.density).toFixed(2)}%`, selected: row.name === recipient }));
    comparisonItems = rows.slice().map((row) => ({ name: row.name, value: reportNumber(row.issues), valueText: reportNumber(row.issues).toLocaleString(), selected: row.name === recipient }));
    trendItems = selected ? [{ name: "检验量", value: reportNumber(selected.qty), detail: "本人统计周期送检总量" }, { name: "异常量", value: reportNumber(selected.issues), detail: "本人统计周期异常总量" }, { name: "正常量", value: Math.max(reportNumber(selected.qty) - reportNumber(selected.issues), 0), detail: "送检量减异常量" }].filter((row) => row.value > 0) : [];
    closureItems = selectedDefects.slice(0, 5).map((row) => ({ name: `关闭${row.name}重复异常`, value: "待确认", detail: "核对标准动作、复检记录和责任人，形成一次问题一次闭环" }));
    scopeText = "本人责任人相关 IPQC 异常与同岗位排名"; summary = `IPQC操作人员范围共 ${rows.length} 人，当前选中人员异常 ${reportNumber(selected?.issues).toLocaleString()} 项。`; risk = `个人TOP异常类型：${selectedDefects.slice(0, 3).map((row) => row.name).join("、") || "暂无"}。`; decision = "围绕操作人员本人TOP异常做现场确认、复检闭环、标准更新和知识考试关联。";
  } else if (role === "机长报告" || role === "交付经理报告" || role === "供应链经理报告") {
    const supplyScope = reportSupplyScope(role, recipient, leaders, managers, workshops);
    const config = reportConfig();
    const supplyMappings = reportActiveMappings(config.supplyMappings);
    const mappedLeaders = [...new Set(supplyMappings.map((row) => row.leader).filter(Boolean))];
    const mappedManagers = [...new Set(supplyMappings.map((row) => row.manager).filter(Boolean))];
    const source = role === "机长报告" ? supplyScope.leaders : supplyScope.workshops;
    recipients = role === "供应链经理报告" ? ["供应链经理"] : role === "交付经理报告" ? mappedManagers : mappedLeaders;
    if (!supplyMappings.length && role !== "供应链经理报告") dataNotice = "供应链映射表尚未配置，机长/交付经理报告不使用原始数据字段冒充收件人，请先导入供应链映射表。";
    const selected = role === "交付经理报告" ? null : source.find((row) => (row.name || row.manager) === recipient) || source[0];
    const scopeRows = role === "供应链经理报告" ? workshops : role === "交付经理报告" ? (recipient ? supplyScope.workshops : workshops) : supplyScope.leaders;
    const totalQty = reportSum(scopeRows, role === "机长报告" ? "qty" : "y2026Qty");
    const totalBad = reportSum(scopeRows, role === "机长报告" ? "issues" : "y2026Bad");
    const density = totalBad / Math.max(totalQty, 1) * 100;
    const scopedOperators = role === "供应链经理报告" ? operators : reportOperatorsForScope(operators, role, recipient, config.supplyMappings);
    const managerPeersMap = new Map();
    (managers || []).forEach((row) => {
      const key = row.manager || row.name || "未配置交付经理";
      const current = managerPeersMap.get(key) || { name: key, y2026Qty: 0, y2026Bad: 0, workshops: new Set() };
      current.y2026Qty += reportNumber(row.y2026Qty);
      current.y2026Bad += reportNumber(row.y2026Bad);
      if (row.workshop) current.workshops.add(row.workshop);
      managerPeersMap.set(key, current);
    });
    const managerPeers = [...managerPeersMap.values()].map((row) => ({ ...row, workshops: [...row.workshops], y2026Rate: Number((row.y2026Bad / Math.max(row.y2026Qty, 1) * 100).toFixed(2)) }));
    mappedManagers.forEach((name) => {
      if (!managerPeers.some((row) => row.name === name)) managerPeers.push({ name, y2026Qty: 0, y2026Bad: 0, workshops: [], y2026Rate: 0 });
    });
    metrics = [{ name: "检验数量", value: totalQty, note: role === "供应链经理报告" ? "所有工坊" : role === "交付经理报告" ? "负责工坊" : "机长班组" }, { name: "异常数量", value: totalBad, note: "过程异常" }, { name: "异常率", value: `${reportNumber(density).toFixed(2)}%`, note: "质量指标" }, { name: role === "机长报告" ? "操作人员" : "交付经理报告" === role ? "负责工坊" : "工坊数", value: role === "机长报告" ? new Set(scopedOperators.map((row) => row.name)).size : role === "交付经理报告" ? new Set(scopeRows.map((row) => `${row.site}-${row.name}`)).size : new Set(workshops.map((row) => `${row.site}-${row.name}`)).size, note: "责任单元" }];
    focusItems = scopeRows.slice(0, 8).map((row) => ({ name: `${row.site || ""}${row.site ? " · " : ""}${row.name || row.manager}`, value: reportNumber(row.y2026Bad || row.issues).toLocaleString(), detail: `异常率 ${reportNumber(row.y2026Rate || row.density || density).toFixed(2)}%` }));
    if (role === "供应链经理报告") focusItems = defectRows.slice(0, 8).map((row) => ({ name: row.name, value: reportNumber(row.value).toLocaleString(), detail: "全公司IPQC异常类型分布" }));
    const peerRows = role === "机长报告" ? leaders : role === "供应链经理报告" ? workshops : managerPeers;
    const peerName = (row) => role === "机长报告" || role === "供应链经理报告" ? `${row.site || ""}${row.site ? " · " : ""}${row.name || row.manager}`.trim() : String(row.name || row.manager || "").trim();
    rankingItems = peerRows.slice().map((row) => ({ name: peerName(row), value: reportNumber(row.y2026Bad || row.issues).toLocaleString(), detail: role === "机长报告" ? `机长异常率 ${reportNumber(row.density).toFixed(2)}%` : role === "供应链经理报告" ? `工坊异常率 ${reportNumber(row.y2026Rate).toFixed(2)}%` : `负责工坊 ${row.workshops?.join("、") || row.workshop || "未映射"}；异常率 ${reportNumber(row.y2026Rate || row.density).toFixed(2)}%`, selected: role === "机长报告" ? (row.name || row.manager) === recipient || (row.name || row.manager) === String(recipient).split(" · ").pop().trim() : role === "交付经理报告" && (row.name || row.manager) === recipient }));
    if (role === "供应链经理报告") {
      comparisonItems = peerRows.slice().map((row) => ({ name: peerName(row), value: reportNumber(row.y2026Bad || row.issues), valueText: reportNumber(row.y2026Bad || row.issues).toLocaleString(), selected: false }));
    } else {
      comparisonItems = peerRows.slice().map((row) => ({ name: peerName(row), value: reportNumber(row.y2026Bad || row.issues), valueText: reportNumber(row.y2026Bad || row.issues).toLocaleString(), selected: role === "机长报告" ? (row.name || row.manager) === recipient || (row.name || row.manager) === String(recipient).split(" · ").pop().trim() : (row.name || row.manager) === recipient }));
    }
    subordinateItems = role === "机长报告" ? scopedOperators.slice(0, 10).map((row) => ({ name: row.name, value: `${row.issues}项`, detail: `送检 ${row.qty}；异常率 ${row.density}%` })) : role === "交付经理报告" ? supplyScope.leaders.slice(0, 8).map((row) => ({ name: `机长 · ${row.name}`, value: `${row.issues}项`, detail: `班组送检 ${row.qty}；异常率 ${row.density}%` })) : [...managerPeers.slice(0, 8).map((row) => ({ name: `交付经理 · ${row.name}`, value: `${row.y2026Bad || 0}项`, detail: `负责工坊 ${row.workshops?.join("、") || "未映射"}；异常率 ${row.y2026Rate}%` })), ...leaders.slice(0, 8).map((row) => ({ name: `机长 · ${row.name}`, value: `${row.issues}项`, detail: `班组异常率 ${row.density}%` })), ...operators.slice(0, 10).map((row) => ({ name: `IPQC操作者 · ${row.name}`, value: `${row.issues}项`, detail: `送检 ${row.qty}；异常率 ${row.density}%` }))];
    closureItems = focusItems.slice(0, 5).map((row) => ({ name: `闭环：${row.name}`, value: "责任到人", detail: "由当前责任层级确认原因、措施、验证证据和关闭条件" }));
    trendItems = role === "机长报告" ? scopedOperators.slice(0, 8).map((row) => ({ name: row.name, value: `${row.issues}项`, detail: `下属送检 ${row.qty}；异常率 ${row.density}%` })) : role === "交付经理报告" ? supplyScope.leaders.slice(0, 8).map((row) => ({ name: `机长 · ${row.name}`, value: `${row.issues}项`, detail: `负责工坊内异常率 ${row.density}%` })) : supplyScope.managers.slice(0, 8).map((row) => ({ name: `交付经理 · ${row.name || row.manager}`, value: `${row.y2026Bad || 0}项`, detail: `负责工坊 ${row.workshop || "未映射"}` }));
    scopeText = role === "供应链经理报告" ? "所有工坊、交付经理、机长与操作人员" : role === "机长报告" ? "该机长班组、操作人员与异常类型" : "该交付工坊、机长与操作人员";
    summary = `${scopeText}：异常 ${totalBad.toLocaleString()} 项，异常率 ${reportNumber(density).toFixed(2)}%。`; risk = `重点责任单元：${focusItems.slice(0, 3).map((row) => row.name).join("、") || "暂无"}。`; decision = role === "交付经理报告" ? "围绕负责工坊的TOP异常、机长对比和操作人员问题建立周复盘闭环。" : "建立班前提醒、工坊周复盘、人员辅导与跨部门异常闭环。";
  } else if (role === "研发工程师报告") {
    const rows = reportDqaEngineerRows(files, dqa, dateRange);
    recipients = rows.map((row) => row.name).filter(Boolean);
    const selected = rows.find((row) => row.name === recipient) || rows[0];
    const total = (row) => reportNumber(row?.review) + reportNumber(row?.production) + reportNumber(row?.onsite);
    examIssueCategories = [selected?.division, "评审问题", "生产问题", "现场问题", "ECN", "非BOM"].filter(Boolean);
    metrics = [{ name: "综合记录", value: total(selected), note: "个人工程师字段" }, { name: "ECN申请", value: selected?.ecn || 0, note: "个人变更" }, { name: "非BOM加工件", value: selected?.nonBom || 0, note: "个人专项" }, { name: "研发问题", value: total(selected), note: `评审 ${selected?.review || 0} / 生产 ${selected?.production || 0} / 现场 ${selected?.onsite || 0}` }];
    focusItems = selected ? [{ name: "评审问题", value: selected.review, detail: "个人前端设计质量" }, { name: "生产问题", value: selected.production, detail: "个人设计输出在生产端的问题" }, { name: "现场问题", value: selected.onsite, detail: "个人设计输出在现场端的问题" }, { name: "ECN", value: selected.ecn, detail: "个人变更记录" }, { name: "非BOM加工件", value: selected.nonBom, detail: "个人标准化机会" }].filter((row) => reportNumber(row.value) > 0) : [];
    rankingItems = rows.slice().sort((a, b) => (total(b) + reportNumber(b.ecn)) - (total(a) + reportNumber(a.ecn))).map((row) => ({ name: row.name, value: (total(row) + reportNumber(row.ecn)).toLocaleString(), detail: `${row.division || "未分配"}；研发问题 ${total(row)} / ECN ${row.ecn || 0}`, selected: row.name === recipient }));
    comparisonItems = rows.slice().sort((a, b) => (total(b) + reportNumber(b.ecn)) - (total(a) + reportNumber(a.ecn))).map((row) => ({ name: row.name, value: total(row) + reportNumber(row.ecn), valueText: (total(row) + reportNumber(row.ecn)).toLocaleString(), selected: row.name === recipient }));
    trendItems = selected ? [{ name: "当前周期", value: total(selected), detail: "个人研发问题总量" }] : [];
    closureItems = focusItems.slice(0, 5).map((row) => ({ name: `研发闭环：${row.name}`, value: "待验证", detail: "补齐根因证据、设计评审验证和复发监控" }));
    scopeText = "个人研发工程师字段对应的 ECN、研发问题、设计评审和非BOM加工件";
    summary = rows.length ? `研发工程师范围共 ${rows.length} 人，选中对象研发问题 ${total(selected).toLocaleString()} 条。` : "原始DQA数据未提供研发工程师字段，当前不使用TPM数据替代个人报告。";
    risk = selected ? `重点产品部：${selected.division || "暂无"}；个人问题集中在 ${Object.entries({ 评审: selected.review, 生产: selected.production, 现场: selected.onsite, ECN: selected.ecn, 非BOM: selected.nonBom }).sort((a, b) => reportNumber(b[1]) - reportNumber(a[1]))[0]?.[0] || "暂无"}。` : "缺少研发工程师字段，无法形成个人风险判断。";
    dataNotice = rows.length ? "研发工程师报告使用原始DQA中的研发工程师字段。" : "原始DQA当前只有TPM字段，未生成研发工程师个人数据，避免数据错位。";
    decision = rows.length ? "推动设计前置评审、ECN变更闭环、未关闭问题清理和高复用加工件标准化。" : "请在DQA原始数据中补充研发工程师字段后再生成个人报告，禁止用TPM数据冒充工程师数据。";
  } else if (["PM报告", "TPM报告", "产总报告"].includes(role)) {
    const config = reportConfig();
    const mappings = reportActiveMappings(config.orgMappings);
    const rawEngineerRows = reportDqaEngineerRows(files, dqa, dateRange);
    const allStageRows = dqa.tpmStages || [];
    const uniqueNames = (values) => [...new Set(values.flatMap((value) => reportNames(value)).filter(Boolean))];
    const mappingScopeFor = (kind, name) => mappings.filter((row) => {
      if (kind === "pm") return reportNames(row.pm).includes(name);
      if (kind === "tpm") return reportNames(row.tpm).includes(name);
      return reportNames(row.productionDirector).includes(name);
    });
    const scopedData = (scopeRows) => {
      const divisions = new Set(scopeRows.map((row) => row.productDept).filter(Boolean));
      const tpms = new Set(uniqueNames(scopeRows.map((row) => row.tpm)));
      const pms = new Set(uniqueNames(scopeRows.map((row) => row.pm)));
      const engineers = rawEngineerRows.filter((row) => (row.tpm && tpms.has(row.tpm)) || (row.pm && pms.has(row.pm)) || (row.division && divisions.has(row.division)));
      const stages = allStageRows.filter((row) => tpms.has(row.name) || divisions.has(row.division));
      const rows = rawEngineerRows.length && engineers.length ? engineers.map((row) => ({ ...row, roleLabel: "研发工程师", __reportKey: `${row.division || ""}::${row.name}` })) : stages.map((row) => ({ ...reportDqaMetricRow(row, dqa), roleLabel: "TPM记录", __reportKey: `${row.division || ""}::${row.name}` }));
      return { divisions: [...divisions], tpms: [...tpms], pms: [...pms], rows };
    };
    const groupRow = (name, roleLabel, scopeRows) => ({ name, roleLabel, ...reportDqaAggregate(scopedData(scopeRows).rows, dqa) });
    const pmNames = uniqueNames(mappings.map((row) => row.pm));
    const tpmNames = uniqueNames(mappings.map((row) => row.tpm));
    const directorNames = uniqueNames(mappings.map((row) => row.productionDirector));
    const pmRows = pmNames.map((name) => groupRow(name, "PM范围", mappingScopeFor("pm", name)));
    const tpmRows = tpmNames.length ? tpmNames.map((name) => groupRow(name, "TPM范围", mappingScopeFor("tpm", name))) : allStageRows.map((row) => ({ name: row.name, roleLabel: "TPM记录", ...reportDqaAggregate([row], dqa) }));
    const directorRows = directorNames.map((name) => groupRow(name, "产总范围", mappingScopeFor("director", name)));
    recipients = role === "PM报告" ? pmNames : role === "TPM报告" ? (tpmNames.length ? tpmNames : tpmRows.map((row) => row.name).filter(Boolean)) : directorNames;
    const selectedRecipient = recipients.includes(recipient) ? recipient : (recipients[0] || "");
    const selectedScope = role === "PM报告" ? mappingScopeFor("pm", selectedRecipient) : role === "TPM报告" ? mappingScopeFor("tpm", selectedRecipient) : mappingScopeFor("director", selectedRecipient);
    const selectedData = scopedData(selectedScope);
    const selectedChildren = selectedData.rows;
    const peerRows = role === "PM报告" ? pmRows : role === "TPM报告" ? tpmRows : directorRows;
    const selected = peerRows.find((row) => row.name === selectedRecipient) || { name: selectedRecipient, roleLabel: role, ...reportDqaAggregate(selectedChildren, dqa) };
    const total = (row) => reportNumber(row?.review) + reportNumber(row?.production) + reportNumber(row?.onsite);
    metrics = [{ name: "综合记录", value: total(selected), note: role === "PM报告" ? "PM负责工程师范围" : role === "TPM报告" ? "TPM负责PM与工程师范围" : "产总负责产品部范围" }, { name: "ECN申请", value: reportNumber(selected?.ecn), note: "研发变更" }, { name: "非BOM加工件", value: reportNumber(selected?.nonBom), note: "加工件专项" }, { name: "研发问题", value: total(selected), note: `评审 ${selected?.review || 0} / 生产 ${selected?.production || 0} / 现场 ${selected?.onsite || 0}` }];
    const selectedTotal = total(selected);
    focusItems = [
      { name: "ECN变更", value: reportNumber(selected?.ecn), detail: "当前责任对象范围内的变更记录" },
      { name: "评审问题", value: reportNumber(selected?.review), detail: "前端设计评审阶段问题" },
      { name: "生产问题", value: reportNumber(selected?.production), detail: "设计输出进入生产后的问题" },
      { name: "现场问题", value: reportNumber(selected?.onsite), detail: "现场/售后阶段问题" },
      { name: "非BOM加工件", value: reportNumber(selected?.nonBom), detail: "非标准加工件专项记录" },
    ].filter((row) => row.value > 0);
    rankingItems = peerRows.slice().sort((a, b) => (reportNumber(b.ecn) + total(b)) - (reportNumber(a.ecn) + total(a))).slice(0, 10).map((row) => ({ name: row.name, value: (reportNumber(row.ecn) + total(row)).toLocaleString(), detail: `${row.roleLabel}；ECN ${row.ecn || 0} / 问题 ${total(row)}`, selected: row.name === selectedRecipient }));
    comparisonItems = peerRows.slice().sort((a, b) => (reportNumber(b.ecn) + total(b)) - (reportNumber(a.ecn) + total(a))).map((row) => ({ name: row.name, value: reportNumber(row.ecn) + total(row), valueText: (reportNumber(row.ecn) + total(row)).toLocaleString(), selected: row.name === selectedRecipient }));
    subordinateItems = role === "PM报告"
      ? selectedChildren.slice().sort((a, b) => (reportNumber(b.ecn) + total(b)) - (reportNumber(a.ecn) + total(a))).slice(0, 12).map((row) => ({ name: `${row.roleLabel || "研发记录"} · ${row.name}`, value: `${total(row)}项`, detail: `ECN ${row.ecn || 0}；评审 ${row.review || 0}；生产 ${row.production || 0}；现场 ${row.onsite || 0}` }))
      : role === "TPM报告"
        ? [...pmRows.filter((row) => selectedData.pms.includes(row.name)).map((row) => ({ name: `PM · ${row.name}`, value: `${total(row)}项`, detail: `ECN ${row.ecn || 0}；研发问题 ${total(row)}` }))]
        : [...selectedData.divisions.map((division) => { const row = groupRow(division, "产品部范围", mappings.filter((item) => item.productDept === division)); return { name: `产品部 · ${division}`, value: `${total(row)}项`, detail: `ECN ${row.ecn || 0}；评审 ${row.review || 0}；生产 ${row.production || 0}；现场 ${row.onsite || 0}` }; }), ...tpmRows.filter((row) => selectedData.tpms.includes(row.name)).map((row) => ({ name: `TPM · ${row.name}`, value: `${total(row)}项`, detail: `PM范围汇总；ECN ${row.ecn || 0}` }))];
    trendItems = [{ name: "评审阶段", value: reportNumber(selected?.review), detail: "问题在设计前端暴露的数量" }, { name: "生产阶段", value: reportNumber(selected?.production), detail: "问题在生产导入后暴露的数量" }, { name: "现场阶段", value: reportNumber(selected?.onsite), detail: "问题在现场/售后暴露的数量" }].filter((row) => row.value > 0);
    closureItems = focusItems.slice(0, 5).map((row) => ({ name: `责任闭环：${row.name}`, value: "待验证", detail: "责任人、交付物、验证证据和复发升级规则必须完整" }));
    scopeText = role === "PM报告" ? "PM负责范围内的研发工程师具体记录" : role === "TPM报告" ? "TPM负责范围内的PM聚合记录" : "产总负责范围内的产品部、TPM和PM聚合记录";
    summary = `${scopeText}：综合质量记录 ${selectedTotal.toLocaleString()} 条，ECN ${reportNumber(selected?.ecn).toLocaleString()} 条。`;
    risk = `当前对象主要风险：${focusItems.slice().sort((a, b) => reportNumber(b.value) - reportNumber(a.value)).slice(0, 3).map((row) => row.name).join("、") || "暂无"}。`;
    dataNotice = rawEngineerRows.length ? "管理层报告使用研发工程师字段向上聚合；同级排名和下级汇总使用不同粒度。" : "当前DQA原始数据未提供研发工程师字段，个人工程师报告不使用TPM替代；管理层按TPM、PM和产品部映射汇总。";
    if (!mappings.length) dataNotice = "研发组织映射表尚未配置，当前管理层报告不生成伪造的PM/TPM/产总个人数据；请先导入研发组织映射表。";
    decision = "按当前责任层级跟踪结果、过程阶段、根因证据和改善行动，禁止用上级或下级数据代替当事人数据。";
  } else {
    const divisions = dqa.divisions || [];
    const totalDqa = divisions.reduce((sum, row) => sum + reportNumber(row.review) + reportNumber(row.production) + reportNumber(row.onsite), 0);
    const ipqcBad = reportSum(workshops, "y2026Bad");
    const oqcRows = oqc.monthlySummary?.divisions || [];
    const qmsRiskRows = [...(data?.qms?.risks || []), ...(data?.qms?.suggestions || [])];
    metrics = [{ name: "IPQC异常", value: ipqcBad, note: "公司级过程异常" }, { name: "DQA记录", value: totalDqa, note: "研发质量" }, { name: "OQC样本", value: reportSum(oqcRows, "y2026Count"), note: "出货评价" }, { name: "客户意见", value: qmsRiskRows.length, note: "QMS风险/建议" }];
    recipients = ["董事长"]; focusItems = divisions.slice().sort((a, b) => (reportNumber(b.review) + reportNumber(b.production) + reportNumber(b.onsite)) - (reportNumber(a.review) + reportNumber(a.production) + reportNumber(a.onsite))).map((row) => ({ name: row.name, value: (reportNumber(row.review) + reportNumber(row.production) + reportNumber(row.onsite)).toLocaleString(), detail: `评审 ${row.review || 0} / 生产 ${row.production || 0} / 现场 ${row.onsite || 0}` })); rankingItems = (dqa.tpmStages || []).map((row) => ({ name: row.name, value: (reportNumber(row.review) + reportNumber(row.production) + reportNumber(row.onsite)).toLocaleString(), detail: row.division || "" })); comparisonItems = focusItems.map((row) => ({ name: row.name, value: reportNumber(row.value), valueText: row.value, selected: false })); subordinateItems = [...focusItems.slice(0, 8).map((row) => ({ name: `产品部 · ${row.name}`, value: row.value, detail: row.detail })), ...rankingItems.slice(0, 8).map((row) => ({ name: `TPM · ${row.name}`, value: row.value, detail: row.detail })), ...workshops.slice(0, 8).map((row) => ({ name: `工坊 · ${row.site} · ${row.name}`, value: `${row.y2026Bad || 0}项`, detail: `送检 ${row.y2026Qty || 0}；异常率 ${row.y2026Rate || 0}%` }))]; trendItems = [{ name: "IPQC异常", value: ipqcBad, detail: "全公司过程异常" }, { name: "DQA研发记录", value: totalDqa, detail: "评审、生产和现场问题" }, { name: "OQC评分样本", value: reportSum(oqcRows, "y2026Count"), detail: "出货质量评价样本" }, { name: "QMS客户意见", value: qmsRiskRows.length, detail: "客户风险与改进建议" }].filter((row) => row.value > 0); closureItems = focusItems.slice(0, 5).map((row) => ({ name: `公司级战役：${row.name}`, value: "经营会追踪", detail: "跨模块确认结果、过程、根因、责任、行动和复发门禁" })); scopeText = "公司级 IPQC、DQA、OQC、QMS客户意见与产品部组织风险"; summary = `公司级质量视图：IPQC异常 ${ipqcBad.toLocaleString()} 项，DQA记录 ${totalDqa.toLocaleString()} 条，OQC样本 ${reportSum(oqcRows, "y2026Count").toLocaleString()} 条，QMS客户意见 ${qmsRiskRows.length.toLocaleString()} 条。`; risk = `最高风险组织：${focusItems.slice(0, 3).map((row) => row.name).join("、") || "暂无"}${qmsRiskRows.length ? `；客户意见/风险 ${qmsRiskRows.length} 条` : ""}。`; decision = "将组织风险、流程漏洞、研发闭环、客户意见和资源投入纳入经营会月度追踪。";
  }
  const resolvedRecipient = recipients.length ? (recipients.includes(recipient) ? recipient : recipients[0]) : "全局";
  let actions = reportActions(data, role);
  const qmsRowsForReport = [...(data?.qms?.risks || []), ...(data?.qms?.suggestions || [])].filter((row) => {
    if (!row || !["PM报告", "TPM报告", "产总报告", "董事长报告"].includes(role)) return false;
    if (role === "董事长报告") return true;
    if (resolvedRecipient === "全局") return false;
    const target = `${row.division || ""} ${row.rawDivision || ""} ${row.tpm || ""} ${row.pm || ""} ${row.project || ""}`;
    return target.includes(resolvedRecipient);
  }).slice(0, 6);
  if (qmsRowsForReport.length) {
    const qmsItems = qmsRowsForReport.map((row) => ({ name: row.project || row.customer || row.type || "QMS客户意见", value: row.score ?? row.lowestScore ?? "待评价", detail: row.content || row.suggestion || row.lowestDimension || "客户意见需纳入闭环" }));
    focusItems = [...focusItems, ...qmsItems].slice(0, 12);
    actions = [...actions, ...qmsItems.map((item) => ({ name: `QMS闭环：${item.name}`, value: "待闭环", detail: `责任范围：${recipient || "公司级"}；${item.detail}`, priority: "高" }))].slice(0, 12);
  }
  if (!subordinateItems.length && focusItems.length && !["IPQC操作报告", "研发工程师报告"].includes(role)) subordinateItems = focusItems.slice(0, 8).map((item) => ({ name: item.name, value: item.value, detail: item.detail || "当前责任范围内的下级质量对象" }));
  if (!trendItems.length && focusItems.length) trendItems = focusItems.slice(0, 8).map((item) => ({ name: item.name, value: item.value, detail: "当前统计周期质量结果" }));
  if (!closureItems.length && focusItems.length) closureItems = focusItems.slice(0, 5).map((item) => ({ name: `闭环：${item.name}`, value: "待确认", detail: "确认责任、措施、验证证据、关闭条件和复发门禁" }));
  if (!actions.length) actions = closureItems.slice(0, 8);
    rankingItems = reportEnsureSelectedItems(rankingItems, resolvedRecipient, 12);
    comparisonItems = reportEnsureSelectedItems(comparisonItems, resolvedRecipient, 12);
    if (["供应链经理报告", "产总报告"].includes(role)) {
      rankingItems = [];
      comparisonItems = [];
    }
  const questions = safeParse(localStorage.getItem(qmdpQuestionsKey), []);
  let knowledgeRuleItems = questions.filter((question) => `${question.stem || ""} ${question.categories || question.category || ""}`.includes(role.replace("报告", ""))).slice(0, 5).map((question) => ({ name: question.stem, value: question.type || "题目", detail: question.explanation || "已关联知识规则" }));
  if (!knowledgeRuleItems.length && !examReportRole(role)) knowledgeRuleItems = [{ name: "重复问题门禁", value: "必须执行", detail: "同类问题未完成根因、措施、验证和关闭前，不得再次按已解决问题发送。" }, { name: "闭环证据", value: "必须留存", detail: "保留责任人、完成日期、验证数据和复发监控结果。" }];
  let qualityClosureItems = (data?.actions || []).filter((item) => item.status === "进行中" || item.status === "未开始").slice(0, 6).map((item) => ({ name: item.title, value: `${item.progress ?? 0}%`, detail: `${item.owner || "待指定"} · ${item.due || "待定"}` }));
  if (!qualityClosureItems.length) qualityClosureItems = closureItems.slice(0, 6);
  const config = reportConfig();
  const reportExamHistoryRows = reportExamHistory(role, resolvedRecipient);
  const supervisorName = reportSupervisor(role, resolvedRecipient, operators, config);
  const subordinateExamHistory = reportSubordinateExamResults(role, resolvedRecipient, operators, config);
  const latestExam = reportExamHistoryRows[0];
  const examResultSummary = latestExam ? `最近考试：${latestExam.score ?? 0} 分，${latestExam.passed ? "已通过" : "未通过"}（${latestExam.correct ?? 0}/${latestExam.total ?? 0} 题），${formatSyncDateTime(latestExam.submittedAt)}。` : "尚无已回传的考试结果。";
  const subordinateExamSummary = subordinateExamHistory.length ? `下属考试回传 ${subordinateExamHistory.length} 条：${subordinateExamHistory.slice(0, 5).map((item) => `${item.recipientName} ${item.score ?? 0}分${item.passed ? "（通过）" : "（未通过）"}`).join("、")}。` : "暂无下属考试回传。";
  return { id: `RPT-${Date.now()}`, role, recipient: resolvedRecipient, recipients, generatedAt: new Date().toISOString(), period: `${dateRange?.start2026 || ""}—${dateRange?.end2026 || ""}`, recipientScope: reportScope(role, resolvedRecipient, scopeText), personalIssueSummary: summary, dataNotice, metrics, focusItems, rankingItems, comparisonItems, subordinateItems, trendItems, closureItems, actions, qualityClosureItems, knowledgeRuleItems, examSummary: knowledgeRuleItems.length ? `已匹配 ${knowledgeRuleItems.length} 条知识/考试规则。` : "暂无直接匹配的知识考试规则。", examIssueCategories, examHistory: reportExamHistoryRows, examResultSummary, supervisorName, supervisorExamSummary: supervisorName ? `上级汇报对象：${supervisorName}；${examResultSummary}` : "", subordinateExamHistory, subordinateExamSummary, executiveSummary: summary, riskFocus: risk, decisionSuggestion: decision };
}
const escapeReportHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const reportSnapshotHtml = (snapshot) => {
  const safe = (value) => escapeReportHtml(value);
  const examHtml = snapshot.examLinks?.length ? `<section class="exam"><h2>关联知识考核</h2><p>${safe(snapshot.examSummary || "请完成以下与本人问题匹配的知识考试。")}</p><ul>${snapshot.examLinks.map((item) => `<li><strong>${safe(item.title)}</strong>：${safe(item.summary)}<br/><a href="${safe(item.url)}">${safe(item.url)}</a></li>`).join("")}</ul></section>` : "";
  const examResultHtml = `<section><h2>考试结果与上级汇报</h2><p>${safe(snapshot.examResultSummary || "尚无已回传的考试结果。")} ${snapshot.supervisorExamSummary ? safe(snapshot.supervisorExamSummary) : ""}${snapshot.subordinateExamSummary ? `<br/>${safe(snapshot.subordinateExamSummary)}` : ""}</p></section>`;
  const metricsHtml = (snapshot.metrics || []).map((item) => `<span class="metric"><small>${safe(item.name)}</small><b>${safe(item.value)}</b><small>${safe(item.note)}</small></span>`).join("");
  const listSections = [["风险焦点", snapshot.focusItems], ["同级排名", snapshot.rankingItems], ["下级质量汇总", snapshot.subordinateItems], ["质量趋势", snapshot.trendItems], ["改善行动", snapshot.actions], ["闭环待办", snapshot.closureItems], ["质量闭环", snapshot.qualityClosureItems], ["知识规则", snapshot.knowledgeRuleItems]].map(([title, items]) => `<section><h2>${safe(title)}</h2><ul>${(items || []).map((item) => `<li><strong>${safe(item.name)}</strong> · ${safe(item.value)}：${safe(item.detail)}</li>`).join("") || "<li>暂无</li>"}</ul></section>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${safe(snapshot.role)}-${safe(snapshot.recipient)}</title><style>@page{size:A4;margin:16mm}body{font-family:Microsoft YaHei,Arial;color:#172033;max-width:1080px;margin:30px auto;padding:0 20px;line-height:1.55}h1{margin:0 0 8px;color:#102a43}h2{font-size:16px;border-bottom:1px solid #dfe7f0;padding-bottom:8px}section{border:1px solid #dfe7f0;border-radius:10px;padding:16px;margin:14px 0;break-inside:avoid}.exam{border-color:#8bbcf0;background:#f4f9ff}li{margin:7px 0;line-height:1.5}.metric{display:inline-block;min-width:150px;margin:8px;padding:12px;background:#f4f8ff;border-radius:8px;vertical-align:top}.metric b{display:block;font-size:22px;color:#176ecf}a{color:#176ecf;word-break:break-all}@media print{body{margin:0;max-width:none}.no-print{display:none}}</style></head><body><h1>${safe(snapshot.role)}</h1><p>${safe(snapshot.recipientScope)}<br/>周期：${safe(snapshot.period)}</p>${examHtml}${examResultHtml}<section><h2>指标</h2>${metricsHtml}</section>${listSections}<section><h2>管理判断</h2><p>${safe(snapshot.riskFocus)}</p><p>${safe(snapshot.decisionSuggestion)}</p></section></body></html>`;
};
const downloadReportSnapshot = (snapshot, type = "json") => {
  const safeName = `${snapshot.role}-${snapshot.recipient}-${snapshot.generatedAt.replace(/[:.]/g, "-")}`;
  const content = type === "html" ? reportSnapshotHtml(snapshot) : JSON.stringify(snapshot, null, 2);
  const blob = new Blob([content], { type: type === "html" ? "text/html;charset=utf-8" : "application/json;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${safeName}.${type}`; link.click(); URL.revokeObjectURL(url);
};
const printReportSnapshot = (snapshot) => {
  const popup = window.open("", "_blank", "width=1100,height=850");
  if (!popup) { window.alert("浏览器阻止了报告窗口，请允许弹出窗口后再导出 PDF。"); return; }
  popup.document.open(); popup.document.write(reportSnapshotHtml(snapshot)); popup.document.close(); popup.focus(); setTimeout(() => popup.print(), 350);
};
const printReportSnapshots = (snapshots = []) => {
  const popup = window.open("", "_blank", "width=1100,height=850");
  if (!popup) { window.alert("浏览器阻止了报告窗口，请允许弹出窗口后再导出 PDF。"); return; }
  popup.document.open(); popup.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>批量质量报告</title></head><body>${snapshots.map(reportSnapshotHtml).join("<div style='page-break-after:always'></div>")}</body></html>`); popup.document.close(); popup.focus(); setTimeout(() => popup.print(), 500);
};
const reportChartNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};
const reportChartRows = (items = [], limit = 8) => {
  const mapped = (items || []).map((item) => ({
    name: String(item?.name || "未命名").replace(/^闭环：|^风险：|^责任闭环：/, ""),
    value: reportChartNumber(item?.value),
    detail: item?.detail || "",
    selected: item?.selected === true,
    color: item?.selected === true ? "#ef4f4f" : item?.priority === "高" || /高风险|红色|待验证|待确认/.test(`${item?.value || ""} ${item?.detail || ""}`) ? "#ef4f4f" : undefined,
  })).filter((item) => item.name && item.value > 0).sort((a, b) => b.value - a.value);
  const top = mapped.slice(0, limit);
  const selected = mapped.find((item) => item.selected);
  return selected && !top.some((item) => item.selected) ? [...top.slice(0, Math.max(0, limit - 1)), selected] : top;
};
const reportStatusRows = (items = []) => {
  const buckets = { "待确认": 0, "待验证": 0, "责任到人": 0, "进行中": 0, "已完成": 0 };
  (items || []).forEach((item) => {
    const text = `${item?.value || ""} ${item?.detail || ""}`;
    const key = /已完成|已关闭|完成/.test(text) ? "已完成" : /进行中|执行中/.test(text) ? "进行中" : /责任到人|责任人/.test(text) ? "责任到人" : /待验证|验证/.test(text) ? "待验证" : "待确认";
    buckets[key] += 1;
  });
  return Object.entries(buckets).map(([name, count]) => ({ name, count })).filter((item) => item.count > 0);
};
const ensureSelectedComparison = (rows = [], selectedName = "", limit = 12) => {
  const sorted = [...rows].sort((a, b) => reportChartNumber(b.value) - reportChartNumber(a.value));
  const matches = (row) => row.selected || row.name === selectedName || String(row.name || "").split(" · ").pop().trim() === String(selectedName || "").split(" · ").pop().trim();
  const top = sorted.slice(0, limit).map((row) => matches(row) ? { ...row, selected: true } : row);
  if (!selectedName || top.some((row) => row.selected)) return top;
  const selected = sorted.find(matches);
  return selected ? [...top.slice(0, Math.max(0, limit - 1)), { ...selected, selected: true }] : top;
};
const reportEnsureSelectedItems = (items = [], selectedName = "", limit = 12) => ensureSelectedComparison(items, selectedName, limit);
const reportEvidenceRows = (report) => [
  { name: "结果", value: (report.focusItems || []).length, color: "#176ecf" },
  { name: "过程", value: (report.trendItems || []).length, color: "#f5822a" },
  { name: "根因", value: (report.closureItems || []).length, color: "#ef4f4f" },
  { name: "管理", value: (report.actions || []).length, color: "#50ad68" },
].filter((item) => item.value > 0);
const reportResponsibilityPath = (role) => {
  if (["研发工程师报告", "PM报告", "TPM报告", "产总报告"].includes(role)) return ["董事长", "产总", "TPM", "PM", "研发工程师"];
  return ["董事长", "供应链经理", "交付经理", "机长", "送检人"];
};
function ReportResponsibilityChain({ report }) {
  const path = reportResponsibilityPath(report.role);
  const activeNode = report.role.includes("IPQC操作") ? "送检人" : report.role.includes("研发工程师") ? "研发工程师" : report.role.includes("供应链") ? "供应链经理" : report.role.includes("交付经理") ? "交付经理" : report.role.includes("机长") ? "机长" : report.role.includes("TPM") ? "TPM" : report.role.includes("PM") ? "PM" : report.role.includes("产总") ? "产总" : "董事长";
  const activeIndex = Math.max(0, path.indexOf(activeNode));
  return <section className="qmdp-report-chain"><header><div><strong>责任分层</strong><small>对事分层、对人留有沟通空间</small></div><span>{report.recipient || "全局"}</span></header><div className="qmdp-report-chain-track">{path.map((item, index) => <div className={`qmdp-report-chain-node ${index === activeIndex ? "active" : ""}`} key={item}><b>{item}</b><small>{index === activeIndex ? "当前报告" : index < activeIndex ? "上级汇报" : "下级汇总"}</small></div>)} </div></section>;
}
function QualityReportCharts({ report }) {
  const focusRows = reportChartRows(report.focusItems, 8);
  const rankingRows = reportChartRows(ensureSelectedComparison(report.comparisonItems?.length ? report.comparisonItems : report.rankingItems, report.recipient, 8), 8);
  const subordinateRows = reportChartRows(report.subordinateItems, 8);
  const trendRows = reportChartRows(report.trendItems, 8);
  const actionRows = reportChartRows(report.qualityClosureItems?.length ? report.qualityClosureItems : report.actions, 8);
  const statusRows = reportStatusRows([...(report.closureItems || []), ...(report.qualityClosureItems || [])]);
  const evidenceRows = reportEvidenceRows(report);
  const chart = (title, subtitle, rows, key, unit = "") => <section className="qmdp-report-chart-card"><header><div><strong>{title}</strong><small>{subtitle}</small></div><span>{rows.length ? `${rows.length}项` : "暂无数据"}</span></header>{rows.length ? <ReportBarChart rows={rows} height={260} chartKey={`role-report-${key}-${report.role}-${report.recipient}`} unit={unit}/> : <div className="qmdp-report-chart-empty">暂无可量化数据</div>}</section>;
  const phase = (number, title, subtitle, content) => <section className="qmdp-report-phase"><header><i>{number}</i><div><strong>{title}</strong><small>{subtitle}</small></div></header>{content}</section>;
  return <div className="qmdp-report-management">
    <div className="qmdp-report-management-intro"><div><span>质量经营报告</span><strong>{report.role} · {report.recipient || "全局"}</strong></div><div className="qmdp-report-intro-copy"><p>{report.riskFocus || "当前周期暂无明确风险焦点"}</p>{report.dataNotice && <small>{report.dataNotice}</small>}</div></div>
    {phase("01", "事实结果", "先把发生了什么讲清楚，再讨论原因和责任", <div className="qmdp-report-chart-grid">{chart("风险焦点", "按异常量排序", focusRows, "focus")}{chart("当前周期分布", "按责任对象查看", trendRows, "trend")}</div>)}
    {phase("02", "问题位置", "定位主要矛盾出现在哪个组织和哪个责任对象", <div className="qmdp-report-chart-grid">{chart("同级对比", "按责任对象比较", rankingRows, "ranking")}{chart("下级质量汇总", "按下属对象聚合", subordinateRows, "subordinate")}</div>)}
    {phase("03", "原因判断", "结果、过程、根因、管理四层证据不能混在一起", <div className="qmdp-report-evidence-row"><section className="qmdp-report-evidence-card"><header><div><strong>证据层级覆盖</strong><small>当前报告已形成的分析证据</small></div><span>{evidenceRows.reduce((sum, item) => sum + item.value, 0)}项</span></header><div className="qmdp-report-evidence-bars">{evidenceRows.map((item) => <div key={item.name}><span>{item.name}</span><i><b style={{ width: `${Math.min(100, Math.max(8, item.value / Math.max(...evidenceRows.map((row) => row.value), 1) * 100))}%`, background: item.color }}/></i><strong>{item.value}</strong></div>)}</div></section><section className="qmdp-report-decision-card"><span>当前判断</span><strong>{report.decisionSuggestion || "先补齐事实和证据，再决定措施"}</strong><small>原则不变，方法因对象、时机和程度调整。</small></section></div>)}
    {phase("04", "责任分层", "对事讲规则，对人讲沟通，避免只做个人排名", <ReportResponsibilityChain report={report}/>)}
    {phase("05", "改善行动与闭环", "措施必须有责任人、交付物、验证指标和关闭条件", <div className="qmdp-report-chart-grid">{chart("改善行动进度", "按行动进度排序", actionRows, "actions", "%")}<section className="qmdp-report-chart-card"><header><div><strong>闭环状态</strong><small>待办与验证状态</small></div><span>{statusRows.reduce((sum, item) => sum + item.count, 0)}项</span></header>{statusRows.length ? <ReportStatusDonut rows={statusRows} height={260} chartKey={`role-report-status-${report.role}-${report.recipient}`}/> : <div className="qmdp-report-chart-empty">暂无闭环数据</div>}</section></div>)}
  </div>;
}
function RoleQualityReportPage({ data, files, dateRange: globalDateRange, role, onRoleChange, onReportContext, reportPeriod, onReportPeriodChange }) {
  const [recipient, setRecipient] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [examState, setExamState] = useState({ status: "idle", links: [], message: "" });
  const [examRefresh, setExamRefresh] = useState(0);
  useEffect(() => { const refresh = () => setExamRefresh((value) => value + 1); window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh); }, []);
  const activeReportPeriod = reportPeriod || { year: "2026", start: globalDateRange.start2026, end: globalDateRange.end2026 };
  const reportDateRange = useMemo(() => activeReportPeriod.year === "2025"
    ? { ...globalDateRange, start2025: activeReportPeriod.start, end2025: activeReportPeriod.end, start2026: "", end2026: "" }
    : { ...globalDateRange, start2025: "", end2025: "", start2026: activeReportPeriod.start, end2026: activeReportPeriod.end }, [globalDateRange, activeReportPeriod]);
  const dateRange = reportDateRange;
  const reportData = useMemo(() => analyzeImported(files, reportDateRange), [files, reportDateRange]);
  const report = useMemo(() => buildWebRoleReport(reportData, role, recipient, reportDateRange, files), [reportData, files, role, recipient, reportDateRange]);
  useEffect(() => {
    onReportPeriodChange?.((current) => ({ ...current, start: globalDateRange[`start${current.year}`] || current.start, end: globalDateRange[`end${current.year}`] || current.end }));
  }, [globalDateRange.start2025, globalDateRange.end2025, globalDateRange.start2026, globalDateRange.end2026]);
  useEffect(() => { if (report.recipient !== recipient) setRecipient(report.recipient === "全局" ? "" : report.recipient); onReportContext?.(report.recipient === "全局" ? "" : report.recipient); }, [report.recipient, recipient, onReportContext]);
  useEffect(() => {
    let cancelled = false;
    const enabled = Boolean(examReportRole(role) && report.recipient && report.recipient !== "全局");
    if (!enabled) { setExamState({ status: "idle", links: [], message: "" }); return () => { cancelled = true; }; }
    const questions = examQuestionSetForReport(role, report.examIssueCategories);
    if (!questions.length) { setExamState({ status: "empty", links: [], message: "题库中暂无与本人问题匹配的考试题目。" }); return () => { cancelled = true; }; }
    setExamState({ status: "loading", links: [], message: "正在根据本人问题匹配考试题目…" });
    const create = async () => {
      try {
        const result = await createExamSession({ roleName: examReportRole(role), recipientName: report.recipient, issueCategories: report.examIssueCategories, reportId: report.id, questions, questionCount: questions.length, validDays: 14 });
        if (cancelled) return;
        const url = new URL("/", window.location.origin); url.searchParams.set("examToken", result.token);
        setExamState({ status: "ready", links: [{ title: "待完成考试", summary: `题目数 ${result.questionCount}，有效期至 ${formatSyncDateTime(result.expiresAt)}`, url: url.toString(), token: result.token }], message: `已为 ${report.recipient} 生成 ${result.questionCount} 道本人问题关联题目。` });
      } catch (error) {
        const token = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const sessions = safeParse(localStorage.getItem(qmdpExamSessionsKey), []);
        const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
        localStorage.setItem(qmdpExamSessionsKey, JSON.stringify([{ token, roleName: examReportRole(role), recipientName: report.recipient, issueCategories: report.examIssueCategories, questions, expiresAt, submittedAt: "", result: null }, ...sessions].slice(0, 100)));
        if (cancelled) return;
        const url = new URL("/", window.location.origin); url.searchParams.set("examToken", token);
        setExamState({ status: "ready", links: [{ title: "待完成考试（本机）", summary: `题目数 ${questions.length}，有效期至 ${formatSyncDateTime(expiresAt)}`, url: url.toString(), token }], message: `考试服务暂不可用，已创建本机考试链接：${error?.message || "本地模式"}` });
      }
    };
    create();
    return () => { cancelled = true; };
  }, [role, report.recipient, report.id, report.examIssueCategories.join("|")]);
  const liveExamHistory = reportExamHistory(role, report.recipient === "全局" ? "" : report.recipient);
  const liveLatestExam = liveExamHistory[0];
  const liveExamResultSummary = liveLatestExam ? `最近考试：${liveLatestExam.score ?? 0} 分，${liveLatestExam.passed ? "已通过" : "未通过"}（${liveLatestExam.correct ?? 0}/${liveLatestExam.total ?? 0} 题），${formatSyncDateTime(liveLatestExam.submittedAt)}。` : report.examResultSummary;
  const reportWithExam = useMemo(() => ({ ...report, examLinks: examState.links, examSummary: examState.message || report.examSummary, examHistory: liveExamHistory, examResultSummary: liveExamResultSummary, supervisorExamSummary: report.supervisorName ? `上级汇报对象：${report.supervisorName}；${liveExamResultSummary}` : report.supervisorExamSummary }), [report, examState, liveExamResultSummary, liveExamHistory]);
  const save = () => { const snapshots = safeParse(localStorage.getItem(qmdpReportSnapshotsKey), []); const next = [reportWithExam, ...snapshots.filter((item) => !(item.role === reportWithExam.role && item.recipient === reportWithExam.recipient))].slice(0, 100); localStorage.setItem(qmdpReportSnapshotsKey, JSON.stringify(next)); const tasks = safeParse(localStorage.getItem(qmdpReportTasksKey), []); localStorage.setItem(qmdpReportTasksKey, JSON.stringify([{ id: reportWithExam.id, role: reportWithExam.role, recipient: reportWithExam.recipient, module: "质量报告", date: reportWithExam.generatedAt, status: "已生成", reportId: reportWithExam.id, examLinks: reportWithExam.examLinks, supervisorName: reportWithExam.supervisorName, supervisorExamSummary: reportWithExam.supervisorExamSummary }, ...tasks.filter((item) => item.reportId !== reportWithExam.id)].slice(0, 200))); setSavedAt(reportWithExam.generatedAt); };
  const addSendTask = () => { const tasks = safeParse(localStorage.getItem(qmdpReportTasksKey), []); localStorage.setItem(qmdpReportTasksKey, JSON.stringify([{ id: `SEND-${Date.now()}`, role: reportWithExam.role, recipient: reportWithExam.recipient, module: "质量报告", date: new Date().toISOString(), status: "待发送", reportId: reportWithExam.id, examLinks: reportWithExam.examLinks, supervisorName: reportWithExam.supervisorName, supervisorExamSummary: reportWithExam.supervisorExamSummary }, ...tasks].slice(0, 200))); setSavedAt(new Date().toISOString()); };
  return <div className="qmdp-page"><QmdpPageHeader icon={ChartBar} eyebrow="质量报告 / Role Report" title={role} description="按责任对象输出异常、题库考核、考试回传、下级汇总、改善行动与上级汇报内容。" action={<div className="qmdp-report-actions"><button className="qmdp-secondary-btn" onClick={() => downloadReportSnapshot(reportWithExam, "html")}><DownloadSimple size={16}/>HTML</button><button className="qmdp-secondary-btn" onClick={() => printReportSnapshot(reportWithExam)}><DownloadSimple size={16}/>PDF</button><button className="qmdp-secondary-btn" onClick={() => downloadReportSnapshot(reportWithExam, "json")}><DownloadSimple size={16}/>JSON</button><button className="qmdp-primary-btn" onClick={save} disabled={examState.status === "loading" && Boolean(examReportRole(role))}><FloppyDisk size={16}/>保存报告</button></div>}/><div className="qmdp-report-controls"><label>报告角色<select value={role} onChange={(event) => onRoleChange(event.target.value)}>{roleReportNames.map((item) => <option key={item}>{item}</option>)}</select></label>{report.recipients?.length > 0 && <label>{role === "IPQC操作报告" ? "送检人" : "收件人"}<select value={recipient} onChange={(event) => setRecipient(event.target.value)}><option value="">自动选择最高风险</option>{report.recipients.map((item) => <option key={item}>{item}</option>)}</select></label>}<span>统计周期：{dateRange.start2026}—{dateRange.end2026}</span>{savedAt && <small>已保存 · {formatSyncDateTime(savedAt)}</small>}<button className="qmdp-secondary-btn" onClick={addSendTask} disabled={examState.status === "loading" && Boolean(examReportRole(role))}><Bell size={15}/>创建发送任务</button></div><QmdpStatStrip items={[...reportWithExam.metrics.slice(0, 4).map((item) => ({ label: item.name, value: item.value, note: item.note })), { label: "报告状态", value: savedAt ? "已保存" : "未保存", note: "可在任务中心追踪" }]} /><section className="qmdp-report-sheet"><header><div><span>2026 半年度质量报告 · {reportWithExam.recipient}</span><h3>{role}</h3><p>{reportWithExam.recipientScope}</p></div><span className="qmdp-report-badge">数据范围已重算</span></header><section className="qmdp-exam-card"><header><strong>关联知识考核</strong><span>{examState.status === "loading" ? "匹配中" : `${reportWithExam.examLinks?.length || 0} 个入口`}</span></header><p>{reportWithExam.examSummary}</p><p><strong>考试回传：</strong>{reportWithExam.examResultSummary}{reportWithExam.supervisorExamSummary && <><br/><strong>上级汇报：</strong>{reportWithExam.supervisorExamSummary}</>}{reportWithExam.subordinateExamSummary && <><br/><strong>下属考试：</strong>{reportWithExam.subordinateExamSummary}</>}</p>{reportWithExam.examLinks?.map((item) => <div className="qmdp-exam-link" key={item.url}><div><b>{item.title}</b><span>{item.summary}</span></div><a href={item.url} target="_blank" rel="noreferrer">打开答题链接</a><button className="qmdp-secondary-btn" onClick={() => navigator.clipboard?.writeText(item.url)}>复制链接</button></div>)}{examState.status === "empty" && <div className="qmdp-empty compact">暂无匹配题目，请先在题库管理导入相关题库。</div>}</section><div className="qmdp-report-summary"><div><b>报告摘要</b><p>{reportWithExam.executiveSummary}</p></div><div><b>风险焦点</b><p>{reportWithExam.riskFocus}</p></div><div><b>管理建议</b><p>{reportWithExam.decisionSuggestion}</p></div></div><div className="qmdp-report-grid">{[["风险焦点", reportWithExam.focusItems], ["同级排名", reportWithExam.rankingItems], ["下级质量汇总", reportWithExam.subordinateItems], ["质量趋势", reportWithExam.trendItems], ["改善行动", reportWithExam.actions], ["闭环待办", reportWithExam.closureItems], ["质量闭环 / CAPA", reportWithExam.qualityClosureItems], ["知识规则 / 考试关联", reportWithExam.knowledgeRuleItems]].map(([title, items]) => <section className="qmdp-report-card" key={title}><header><strong>{title}</strong><span>{items?.length || 0} 项</span></header>{(items || []).map((item, index) => <div className="qmdp-report-item" key={`${title}-${item.name}-${index}`}><div><b>{item.name}</b><span>{item.detail}</span></div><strong>{item.value}</strong></div>)}{!items?.length && <div className="qmdp-empty compact">暂无记录</div>}</section>)}</div><section className="qmdp-report-card qmdp-comparison-card"><header><strong>同级对比</strong><span>{reportWithExam.comparisonItems.length} 个对象</span></header>{reportWithExam.comparisonItems.map((item) => <div className={`qmdp-rank-bar ${item.selected ? "selected" : ""}`} key={item.name}><span>{item.name}</span><i><b className={item.selected ? "selected" : ""} style={{ width: `${Math.min(100, Math.max(3, item.value / Math.max(...reportWithExam.comparisonItems.map((row) => row.value), 1) * 100))}%` }}/></i><strong>{item.valueText}</strong></div>)}</section></section></div>;
}
function ReportTaskCenterPage() {
  const [tasks, setTasks] = useState(() => safeParse(localStorage.getItem(qmdpReportTasksKey), []));
  const [snapshots, setSnapshots] = useState(() => safeParse(localStorage.getItem(qmdpReportSnapshotsKey), []));
  const agentTasks = [];
  const [query, setQuery] = useState(""); const [roleFilter, setRoleFilter] = useState("全部"); const [statusFilter, setStatusFilter] = useState("全部"); const [fromDate, setFromDate] = useState(""); const [toDate, setToDate] = useState("");
  useEffect(() => { localStorage.setItem(qmdpReportTasksKey, JSON.stringify(tasks)); }, [tasks]);
  const refresh = () => { setTasks(safeParse(localStorage.getItem(qmdpReportTasksKey), [])); setSnapshots(safeParse(localStorage.getItem(qmdpReportSnapshotsKey), [])); };
  const addTask = () => { const item = { id: `SEND-${Date.now()}`, role: "待选择", recipient: "待填写", module: "质量报告", date: new Date().toISOString(), status: "待发送" }; setTasks((current) => [item, ...current]); };
  const roles = ["全部", ...roleReportNames];
  const visibleTasks = tasks.filter((item) => { const day = String(item.date || "").slice(0, 10); return (roleFilter === "全部" || item.role === roleFilter) && (statusFilter === "全部" || item.status === statusFilter) && (!fromDate || day >= fromDate) && (!toDate || day <= toDate) && (!query || `${item.role} ${item.recipient} ${item.module} ${item.status}`.toLowerCase().includes(query.toLowerCase())); });
  const visibleReports = snapshots.filter((item) => !query || `${item.role} ${item.recipient}`.toLowerCase().includes(query.toLowerCase()));
  const batchExport = (type = "html") => visibleReports.forEach((item, index) => setTimeout(() => downloadReportSnapshot(item, type), index * 120));
  const batchPrint = () => printReportSnapshots(visibleReports);
  return <div className="qmdp-page"><QmdpPageHeader icon={Rows} eyebrow="质量报告 / Task Center" title="报告任务中心" description="对应原 QMDP 的已生成报告、发送记录、筛选和批量导出能力。" action={<><button className="qmdp-secondary-btn" onClick={refresh}><ArrowsClockwise size={15}/>刷新记录</button><button className="qmdp-secondary-btn" onClick={() => batchExport("html")} disabled={!visibleReports.length}><DownloadSimple size={15}/>批量HTML</button><button className="qmdp-secondary-btn" onClick={batchPrint} disabled={!visibleReports.length}><DownloadSimple size={15}/>批量PDF</button><button className="qmdp-primary-btn" onClick={addTask}><Plus size={16}/>新建发送任务</button></>}/><QmdpStatStrip items={[{ label: "记录总数", value: tasks.length, note: "生成与发送" }, { label: "待发送", value: tasks.filter((item) => item.status === "待发送").length, note: "需要处理" }, { label: "已生成报告", value: snapshots.length, note: "可重新打开" }]} /><div className="qmdp-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按角色、收件人或状态搜索"/><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>{roles.map((item) => <option key={item}>{item}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>全部</option><option>已生成</option><option>待发送</option><option>已发送</option><option>已取消</option></select><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="开始日期"/><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="结束日期"/><span>当前显示 {visibleTasks.length} 条任务 · {visibleReports.length} 份报告 · Agent任务 {agentTasks.length} 条</span></div><section className="qmdp-task-table"><div className="qmdp-task-row head"><span>报告模块</span><span>角色</span><span>收件人</span><span>时间</span><span>状态</span><span>操作</span></div>{visibleTasks.map((item) => <div className="qmdp-task-row" key={item.id}><span>{item.module || "质量报告"}</span><strong>{item.role}</strong><span>{item.recipient}</span><span>{formatSyncDateTime(item.date)}</span><select value={item.status} onChange={(event) => setTasks((current) => current.map((row) => row.id === item.id ? { ...row, status: event.target.value } : row))}><option>已生成</option><option>待发送</option><option>已发送</option><option>已取消</option></select><span className="qmdp-task-actions">{item.examLinks?.[0]?.url && <a className="qmdp-task-link" href={item.examLinks[0].url} target="_blank" rel="noreferrer">考试链接</a>}{item.reportId && <button className="qmdp-secondary-btn" onClick={() => { const report = snapshots.find((row) => row.id === item.reportId); if (report) downloadReportSnapshot(report, "html"); }}>打开</button>}<button className="qmdp-danger-btn" onClick={() => setTasks((current) => current.filter((row) => row.id !== item.id))}><Trash size={14}/>删除</button></span></div>)}{!visibleTasks.length && <div className="qmdp-empty compact">暂无报告任务记录。</div>}</section><section className="qmdp-saved-reports"><header><strong>已保存报告</strong><span>{visibleReports.length} 份</span></header>{visibleReports.map((item) => <div key={item.id}><div><b>{item.role} · {item.recipient}</b><span>{item.period} · {formatSyncDateTime(item.generatedAt)}</span></div><span className="qmdp-task-actions"><button className="qmdp-secondary-btn" onClick={() => downloadReportSnapshot(item, "html")}><DownloadSimple size={14}/>HTML</button><button className="qmdp-secondary-btn" onClick={() => printReportSnapshot(item)}><DownloadSimple size={14}/>PDF</button></span></div>)}{!visibleReports.length && <div className="qmdp-empty compact">保存报告后会出现在这里。</div>}</section><section className="qmdp-saved-reports qmdp-agent-task-list"><header><strong>质量分析 Agent发送任务</strong><span>{agentTasks.length} 条</span></header>{agentTasks.map((item) => <div key={item.fileName}><div><b>{item.module} · {item.role} · {item.recipient}</b><span>{item.reportPath || item.reportFileName} · {formatSyncDateTime(item.createdAt)}</span></div><span className="qmdp-task-status">{item.status}</span></div>)}{!agentTasks.length && <div className="qmdp-empty compact">暂无 Agent发送任务。请在质量分析 Agent中生成报告并创建任务。</div>}</section></div>;
}

function RoleReportPeriodControls({ value, dateRange, onChange }) {
  const setYear = (year) => onChange({ year, start: dateRange[`start${year}`] || `${year}-01-01`, end: dateRange[`end${year}`] || `${year}-12-31` });
  return <div className="qmdp-report-period-controls"><span>报告统计周期</span><label>年份<select value={value.year} onChange={(event) => setYear(event.target.value)}><option value="2026">2026</option><option value="2025">2025</option></select></label><label>开始<input type="date" value={value.start || ""} onChange={(event) => onChange({ ...value, start: event.target.value })}/></label><i>—</i><label>结束<input type="date" value={value.end || ""} onChange={(event) => onChange({ ...value, end: event.target.value })}/></label>{value.start > value.end && <em>日期范围无效</em>}<small>支持按月或自定义区间生成角色报告</small></div>;
}

function QualityReportsPage({ active, data, files, dateRange, onRoleChange }) {
  const [visualRecipient, setVisualRecipient] = useState("");
  const [reportPeriod, setReportPeriod] = useState(() => ({ year: "2026", start: dateRange.start2026, end: dateRange.end2026 }));
  useEffect(() => { setReportPeriod((current) => ({ ...current, start: dateRange[`start${current.year}`] || current.start, end: dateRange[`end${current.year}`] || current.end })); }, [dateRange.start2025, dateRange.end2025, dateRange.start2026, dateRange.end2026]);
  if (active === "报告任务中心") return <ReportTaskCenterPage data={data}/>;
  const visualDateRange = useMemo(() => reportPeriod.year === "2025"
    ? { ...dateRange, start2025: reportPeriod.start, end2025: reportPeriod.end, start2026: "", end2026: "" }
    : { ...dateRange, start2025: "", end2025: "", start2026: reportPeriod.start, end2026: reportPeriod.end }, [dateRange, reportPeriod]);
  const visualData = useMemo(() => analyzeImported(files, visualDateRange), [files, visualDateRange]);
  const visualReport = buildWebRoleReport(visualData, active, visualRecipient, visualDateRange, files);
  return <div className="qmdp-report-visual-shell"><RoleReportPeriodControls value={reportPeriod} dateRange={dateRange} onChange={setReportPeriod}/><RoleQualityReportPage data={data} files={files} dateRange={dateRange} role={active} onRoleChange={onRoleChange} onReportContext={setVisualRecipient} reportPeriod={reportPeriod} onReportPeriodChange={setReportPeriod}/><section className="qmdp-report-visual-charts"><QualityReportCharts report={visualReport}/></section></div>;
}

const defaultQmdpSystemConfig = { orgMappings: [{ productDept: "产品部", productionDirector: "待配置", tpm: "待配置", pm: "待配置", active: true }], supplyMappings: [], employees: [], weights: { ecn: 20, issue: 20, severity: 20, review: 15, nonBom: 15, open: 10 }, wecom: { corpId: "", agentId: "", secret: "" }, logs: [] };
function BackgroundSnapshotPage({ data = {}, files = [], dateRange = {}, auth, onEnsureAgentSources }) {
  // Accept the explicit flags and the server role so a delayed/legacy auth payload
  // cannot leave the administrator's generate controls permanently inert.
  const editable = auth?.isAdmin === true || auth?.isDeputy === true || auth?.role === "admin" || auth?.role === "deputy";
  const [registry, setRegistry] = useState(() => createDefaultQualitySnapshotRegistry());
  const [selected, setSelected] = useState([]);
  const [status, setStatus] = useState("");
  const [qualityRules, setQualityRules] = useState(DEFAULT_REPORT_QUALITY_RULES);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [roleRegistry, setRoleRegistry] = useState(() => createDefaultRoleSnapshotRegistry());
  const [roleSelected, setRoleSelected] = useState(["assembly-person", "machine-leader", "delivery-manager", "supply-chain-manager", "rd-engineer", "pm", "tpm", "product-director"]);
  const [roleRunning, setRoleRunning] = useState(false);
  const [roleStatus, setRoleStatus] = useState("");
  const [snapshotTask, setSnapshotTask] = useState(null);
  const snapshotCancelRef = useRef(false);
  const [snapshotFilter, setSnapshotFilter] = useState({ kind: "全部", period: "全部", keyword: "", active: "全部" });
  const [roleSnapshotFilter, setRoleSnapshotFilter] = useState({ period: "全部", keyword: "", active: "全部", role: "全部" });
  const [snapshotKeywordInput, setSnapshotKeywordInput] = useState("");
  const [roleSnapshotKeywordInput, setRoleSnapshotKeywordInput] = useState("");
  const [snapshotDetail, setSnapshotDetail] = useState(null);
  const [snapshotCompare, setSnapshotCompare] = useState(null);
  const [snapshotDetailLoading, setSnapshotDetailLoading] = useState(false);
  const [snapshotCompareLoading, setSnapshotCompareLoading] = useState(false);
  const [selectedSnapshotHistory, setSelectedSnapshotHistory] = useState([]);
  const [selectedRoleHistory, setSelectedRoleHistory] = useState([]);
  const [skillOptions, setSkillOptions] = useState([]);
  const [snapshotJobs, setSnapshotJobs] = useState([]);
  const [moduleQueueFilter, setModuleQueueFilter] = useState("未完成");
  const [roleQueueFilter, setRoleQueueFilter] = useState("未完成");
  const [moduleQueueOpen, setModuleQueueOpen] = useState(false);
  const [roleQueueOpen, setRoleQueueOpen] = useState(false);
  const [moduleSnapshotPeriod, setModuleSnapshotPeriod] = useState(() => ({ start2026: dateRange.start2026 || "", end2026: dateRange.end2026 || "" }));
  const [roleSnapshotPeriod, setRoleSnapshotPeriod] = useState(() => ({ start: dateRange.start2026 || "", end: dateRange.end2026 || "" }));
  const roleHistoryId = (entry) => entry?.id || entry?.key || "";
  const presentationOptions = useMemo(() => qualitySnapshotPresentationOptions, []);
  useEffect(() => {
    let active = true;
    loadQualityAgentSnapshotRegistry({ indexOnly: true }).then((value) => {
      if (!active) return;
      const next = normalizeQualitySnapshotRegistry(value || createDefaultQualitySnapshotRegistry());
      setRegistry(next);
      setSelected(next.rules.filter((rule) => rule.enabled).map((rule) => rule.id));
    }).catch(() => { if (active) setStatus("快照注册表读取失败，当前使用默认规则"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    loadQualityAgentRoleSnapshotRegistry({ indexOnly: true }).then((value) => { if (active) setRoleRegistry(normalizeRoleSnapshotRegistry(value || createDefaultRoleSnapshotRegistry())); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => listSnapshotJobs().then((value) => { if (active) setSnapshotJobs(Array.isArray(value?.jobs) ? value.jobs : []); }).catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const refreshSnapshotViews = async () => {
    const [moduleValue, roleValue, jobValue] = await Promise.all([
      loadQualityAgentSnapshotRegistry({ indexOnly: true }).catch(() => null),
      loadQualityAgentRoleSnapshotRegistry({ indexOnly: true }).catch(() => null),
      listSnapshotJobs().catch(() => ({ jobs: [] })),
    ]);
    if (moduleValue) setRegistry(normalizeQualitySnapshotRegistry(moduleValue || createDefaultQualitySnapshotRegistry()));
    if (roleValue) setRoleRegistry(normalizeRoleSnapshotRegistry(roleValue || createDefaultRoleSnapshotRegistry()));
    setSnapshotJobs(Array.isArray(jobValue?.jobs) ? jobValue.jobs : []);
  };
  const loadModuleEntry = async (entry) => {
    if (!entry?.id) return entry;
    const value = await loadQualityAgentSnapshotRegistry({ entryId: entry.id }).catch(() => null);
    return normalizeQualitySnapshotRegistry(value || {}).history.find((item) => item.id === entry.id) || entry;
  };
  const loadRoleEntry = async (entry) => {
    const entryId = roleHistoryId(entry);
    if (!entryId) return entry;
    const value = await loadQualityAgentRoleSnapshotRegistry({ entryId }).catch(() => null);
    return normalizeRoleSnapshotRegistry(value || {}).history.find((item) => roleHistoryId(item) === entryId) || entry;
  };
  const openModuleSnapshotDetail = async (entry) => {
    if (!entry) return;
    setSnapshotDetail({ kind: "module", key: entry.id, title: (entry.moduleLabel || entry.module || "模块") + " 快照", entry, loading: true });
    setSnapshotDetailLoading(true);
    try {
      const found = await loadModuleEntry(entry);
      setSnapshotDetail({ kind: "module", key: entry.id, title: (entry.moduleLabel || entry.module || "模块") + " 快照", entry: found || entry, loading: false });
    } catch {
      setSnapshotDetail((current) => current ? { ...current, loading: false } : current);
    } finally {
      setSnapshotDetailLoading(false);
    }
  };
  const openRoleSnapshotDetail = async (entry) => {
    if (!entry) return;
    setSnapshotDetail({ kind: "role", key: roleHistoryId(entry), title: (entry.role || "角色") + " 快照", entry, loading: true });
    setSnapshotDetailLoading(true);
    try {
      const found = await loadRoleEntry(entry);
      setSnapshotDetail({ kind: "role", key: roleHistoryId(entry), title: (entry.role || "角色") + " 快照", entry: found || entry, loading: false });
    } catch {
      setSnapshotDetail((current) => current ? { ...current, loading: false } : current);
    } finally {
      setSnapshotDetailLoading(false);
    }
  };
  const openSnapshotCompare = async (entries = []) => {
    const [left, right] = entries || [];
    if (!left || !right) return;
    setSnapshotCompare(entries);
    setSnapshotCompareLoading(true);
    try {
      const hydrated = await Promise.all((entries || []).map((entry) => entry?.id ? loadModuleEntry(entry) : loadRoleEntry(entry)));
      setSnapshotCompare(hydrated);
    } finally {
      setSnapshotCompareLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    loadAgentSkills().then((value) => {
      if (!active) return;
      setSkillOptions((Array.isArray(value?.skills) ? value.skills : []).map((item) => ({ id: String(item.name || item.id || ""), label: String(item.label || item.title || item.name || item.id || "") })).filter((item) => /^quality-(analysis|role)-/i.test(item.id)));
    }).catch(() => {
      if (active) setSkillOptions([]);
    });
    return () => { active = false; };
  }, []);
  const saveRegistry = async (next) => {
    const normalized = normalizeQualitySnapshotRegistry(next);
    setRegistry(normalized);
    try { await saveQualityAgentSnapshotRegistry(normalized); } catch (error) { setStatus("服务器保存失败：" + (error?.message || "请检查服务")); }
  };
  const skillOptionsByRule = (rule) => {
    const moduleKey = String(rule?.module || "").toLowerCase();
    const expectedPrefix = `quality-analysis-${moduleKey}`;
    const matches = skillOptions.filter((item) => {
      const id = String(item.id || item.name || "");
      return id === expectedPrefix || id.startsWith(expectedPrefix + "-");
    });
    if (matches.length) return matches;
    return [{ id: rule.selectedSkill || rule.defaultSkill, label: rule.selectedSkill || rule.defaultSkill }];
  };
  const roleSkillOptionsByRule = (rule) => {
    const prefix = `quality-role-${rule.id}`;
    const matches = skillOptions.filter((item) => item.id === prefix || item.id.startsWith(`${prefix}-`));
    return matches.length ? matches : [{ id: rule.selectedSkill || rule.defaultSkill, label: rule.selectedSkill || rule.defaultSkill }];
  };
  const updateRoleRule = async (ruleId, patch) => {
    const next = updateRoleSnapshotRule(roleRegistry, ruleId, patch);
    setRoleRegistry(next);
    try { await saveQualityAgentRoleSnapshotRegistry(next); setRoleStatus("角色快照规则已保存"); } catch (error) { setRoleStatus(`角色快照规则保存失败：${error?.message || error}`); }
  };
  const updateRule = async (ruleId, patch) => {
    const next = updateQualitySnapshotRule(registry, ruleId, patch);
    await saveRegistry(next);
    if (Object.prototype.hasOwnProperty.call(patch, "enabled")) {
      setSelected((current) => patch.enabled
        ? [...new Set([...current, ruleId])]
        : current.filter((id) => id !== ruleId));
    }
    setStatus("部门快照规则已更新");
  };
  const updateMaintenance = async (patch) => { const next = { ...registry, updatedAt: new Date().toISOString(), maintenance: { ...(registry.maintenance || {}), ...patch } }; await saveRegistry(next); setStatus("快照自动维护策略已保存"); };
  const updateRoleMaintenance = async (patch) => { const next = { ...roleRegistry, updatedAt: new Date().toISOString(), maintenance: { ...(roleRegistry.maintenance || {}), ...patch } }; setRoleRegistry(next); await saveQualityAgentRoleSnapshotRegistry(next); setRoleStatus("角色快照自动维护策略已保存"); };
  const maintainHistory = (next) => {
    const retention = Math.max(1, Number(next.maintenance?.retention || 3));
    if (next.maintenance?.autoArchive === false) return next;
    const grouped = new Map();
    [...next.history].sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt))).forEach((entry) => {
      const key = `${entry.ruleId}::${entry.dateRange?.granularity || "range"}::${entry.dateRange?.periodKey || ""}`;
      const list = grouped.get(key) || []; list.push(entry); grouped.set(key, list);
    });
    const keep = new Set(); grouped.forEach((list) => list.slice(0, retention).forEach((entry) => keep.add(entry.id)));
    return { ...next, history: next.history.map((entry) => keep.has(entry.id) ? entry : { ...entry, active: false, status: "archived" }) };
  };
  const maintainRoleHistory = (next) => {
    const retention = Math.max(1, Number(next.maintenance?.retention || 3));
    if (next.maintenance?.autoArchive === false) return next;
    const grouped = new Map();
    [...next.history].sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt))).forEach((entry) => {
      const key = `${entry.role}::${entry.granularity || entry.period?.granularity || "range"}::${entry.period?.periodKey || `${entry.period?.start || ""}_${entry.period?.end || ""}`}`;
      const list = grouped.get(key) || []; list.push(entry); grouped.set(key, list);
    });
    const keep = new Set(); grouped.forEach((list) => list.slice(0, retention).forEach((entry) => keep.add(entry.key)));
    return { ...next, history: next.history.map((entry) => keep.has(entry.key) ? entry : { ...entry, active: false, status: "archived" }) };
  };
  const filteredModuleHistory = useMemo(() => registry.history.filter((entry) => {
    const key = `${entry.module} ${entry.moduleLabel} ${entry.skillName} ${entry.layoutProfileId}`.toLowerCase();
    return (snapshotFilter.kind === "全部" || entry.module === snapshotFilter.kind) && (!snapshotFilter.keyword || key.includes(snapshotFilter.keyword.toLowerCase())) && (snapshotFilter.period === "全部" || snapshotFilter.period === "全部周期" || (snapshotFilter.period === "总周期" ? entry.dateRange?.granularity === "range" : entry.dateRange?.granularity === snapshotFilter.period)) && (snapshotFilter.active === "全部" || (snapshotFilter.active === "有效" ? entry.active !== false : entry.active === false));
  }), [registry.history, snapshotFilter]);
  const filteredRoleHistory = useMemo(() => roleRegistry.history.filter((entry) => {
    const key = `${entry.role} ${entry.skillName} ${entry.layoutProfileId}`.toLowerCase();
    return (!roleSnapshotFilter.keyword || key.includes(roleSnapshotFilter.keyword.toLowerCase())) && ((roleSnapshotFilter.period === "全部") || (roleSnapshotFilter.period === "全部周期") || (roleSnapshotFilter.period === "总周期" ? entry.period?.granularity === "range" : entry.period?.granularity === roleSnapshotFilter.period)) && (roleSnapshotFilter.role === "全部" || entry.role === roleSnapshotFilter.role) && (roleSnapshotFilter.active === "全部" || (roleSnapshotFilter.active === "有效" ? entry.active !== false : entry.active === false));
  }), [roleRegistry.history, roleSnapshotFilter]);
  const rolePeriodOptions = ["全部", "总周期", "month", "week"];
  const filteredModuleIds = useMemo(() => filteredModuleHistory.map((entry) => entry.id), [filteredModuleHistory]);
  const filteredRoleIds = useMemo(() => filteredRoleHistory.map(roleHistoryId), [filteredRoleHistory]);
  const moduleQueueJobs = useMemo(() => snapshotJobs.filter((job) => job.kind === "module" && (moduleQueueFilter === "全部" || (moduleQueueFilter === "未完成" ? !["completed", "failed", "cancelled"].includes(job.status) : job.status === moduleQueueFilter))), [snapshotJobs, moduleQueueFilter]);
  const roleQueueJobs = useMemo(() => snapshotJobs.filter((job) => job.kind === "role" && (roleQueueFilter === "全部" || (roleQueueFilter === "未完成" ? !["completed", "failed", "cancelled"].includes(job.status) : job.status === roleQueueFilter))), [snapshotJobs, roleQueueFilter]);
  const allVisibleModulesSelected = filteredModuleIds.length > 0 && filteredModuleIds.every((id) => selectedSnapshotHistory.includes(id));
  const allVisibleRolesSelected = filteredRoleIds.length > 0 && filteredRoleIds.every((id) => selectedRoleHistory.includes(id));
  const moduleCompareEntries = useMemo(() => selectedSnapshotHistory.length === 2 ? selectedSnapshotHistory.map((id) => registry.history.find((entry) => entry.id === id)).filter(Boolean) : [], [selectedSnapshotHistory, registry.history]);
  const roleCompareEntries = useMemo(() => selectedRoleHistory.length === 2 ? selectedRoleHistory.map((id) => roleRegistry.history.find((entry) => roleHistoryId(entry) === id)).filter(Boolean) : [], [selectedRoleHistory, roleRegistry.history]);
  const isModuleHistorical = (entry) => registry.history.some((candidate) => candidate.id !== entry.id && candidate.ruleId === entry.ruleId && candidate.active !== false && new Date(candidate.generatedAt).getTime() > new Date(entry.generatedAt).getTime());
  const isRoleHistorical = (entry) => roleRegistry.history.some((candidate) => roleHistoryId(candidate) !== roleHistoryId(entry) && candidate.role === entry.role && candidate.active !== false && new Date(candidate.generatedAt).getTime() > new Date(entry.generatedAt).getTime());
  const toggleVisibleModuleHistory = () => setSelectedSnapshotHistory((current) => allVisibleModulesSelected ? current.filter((id) => !filteredModuleIds.includes(id)) : [...new Set([...current, ...filteredModuleIds])]);
  const toggleVisibleRoleHistory = () => setSelectedRoleHistory((current) => allVisibleRolesSelected ? current.filter((id) => !filteredRoleIds.includes(id)) : [...new Set([...current, ...filteredRoleIds])]);
  const bulkModuleHistory = async (active) => { const ids = new Set(selectedSnapshotHistory); const next = { ...registry, updatedAt: new Date().toISOString(), history: registry.history.map((entry) => ids.has(entry.id) ? { ...entry, active } : entry) }; setRegistry(next); setSelectedSnapshotHistory([]); await saveQualityAgentSnapshotRegistry(next); setStatus(active ? "已启用选中模块快照" : "已停用选中模块快照"); };
  const bulkRoleHistory = async (active) => { const ids = new Set(selectedRoleHistory); const full = normalizeRoleSnapshotRegistry(await loadQualityAgentRoleSnapshotRegistry() || roleRegistry); const next = { ...full, updatedAt: new Date().toISOString(), history: full.history.map((entry) => ids.has(roleHistoryId(entry)) ? { ...entry, active } : entry) }; await saveQualityAgentRoleSnapshotRegistry(next); setRoleRegistry(normalizeRoleSnapshotRegistry(await loadQualityAgentRoleSnapshotRegistry({ indexOnly: true }) || next)); setSelectedRoleHistory([]); setRoleStatus(active ? "已启用选中角色快照" : "已停用选中角色快照"); };
  const deleteModuleHistory = async () => { if (!selectedSnapshotHistory.length || !window.confirm(`确认删除选中的 ${selectedSnapshotHistory.length} 个模块快照吗？删除后不可恢复。`)) return; const ids = new Set(selectedSnapshotHistory); const next = { ...registry, updatedAt: new Date().toISOString(), history: registry.history.filter((entry) => !ids.has(entry.id)) }; setRegistry(next); setSelectedSnapshotHistory([]); await saveQualityAgentSnapshotRegistry(next); setStatus("已删除选中模块快照"); };
  const deleteRoleHistory = async () => { if (!selectedRoleHistory.length || !window.confirm(`确认删除选中的 ${selectedRoleHistory.length} 个角色快照吗？删除后不可恢复。`)) return; const ids = new Set(selectedRoleHistory); const full = normalizeRoleSnapshotRegistry(await loadQualityAgentRoleSnapshotRegistry() || roleRegistry); const next = { ...full, updatedAt: new Date().toISOString(), history: full.history.filter((entry) => !ids.has(roleHistoryId(entry))) }; await saveQualityAgentRoleSnapshotRegistry(next); setRoleRegistry(normalizeRoleSnapshotRegistry(await loadQualityAgentRoleSnapshotRegistry({ indexOnly: true }) || next)); setSelectedRoleHistory([]); setRoleStatus("已删除选中角色快照"); };
  const updateSnapshotNote = async (kind, key, note) => {
    if (!editable) return;
    if (kind === "module") {
      const next = { ...registry, updatedAt: new Date().toISOString(), history: registry.history.map((entry) => entry.id === key ? { ...entry, note } : entry) };
      setRegistry(next); await saveQualityAgentSnapshotRegistry(next); setSnapshotDetail((current) => current ? { ...current, note } : current); setStatus("模块快照备注已保存");
    } else {
      const full = normalizeRoleSnapshotRegistry(await loadQualityAgentRoleSnapshotRegistry() || roleRegistry);
      const next = { ...full, updatedAt: new Date().toISOString(), history: full.history.map((entry) => roleHistoryId(entry) === key ? { ...entry, note } : entry) };
      await saveQualityAgentRoleSnapshotRegistry(next); setRoleRegistry(normalizeRoleSnapshotRegistry(await loadQualityAgentRoleSnapshotRegistry({ indexOnly: true }) || next)); setSnapshotDetail((current) => current ? { ...current, note } : current); setRoleStatus("角色快照备注已保存");
    }
  };
  const run = async (selectedOverride = selected, retryItems = null) => {
    if (!editable || running) return;
    const rules = registry.rules.filter((rule) => selectedOverride.includes(rule.id));
    if (!rules.length) return setStatus("请先勾选要生成的规则");
    setRunning(true); snapshotCancelRef.current = false;
    const batchId = `module-batch-${Date.now()}`; const taskId = batchId; const taskStartedAt = new Date().toISOString();
    try {
      const modules = [...new Set(rules.flatMap((rule) => rule.sourceModules || [rule.module]))];
      const periodsForTask = buildSnapshotPeriods(dateRange);
      const taskTotal = rules.length * periodsForTask.length;
      let taskDone = 0; const failedItems = [];
      setSnapshotTask({ kind: "模块", total: taskTotal, done: 0, current: "正在加载原始数据", failed: 0 });
      const hydrated = onEnsureAgentSources ? await onEnsureAgentSources(modules, (progress) => { setStatus(progress?.label || "正在加载原始数据"); setSnapshotTask((current) => current ? { ...current, current: progress?.label || "正在加载原始数据" } : current); }) : files;
      let next = registry;
      setSnapshotTask((current) => ({ ...current, current: "准备生成周期快照" }));
      for (const rule of rules) {
        if (snapshotCancelRef.current) break;
        setStatus("正在生成 " + rule.label);
        const moduleFiles = (hydrated || files).filter((source) => (rule.sourceModules || [rule.module]).includes(source.module));
        const periods = periodsForTask;
        for (const snapshotPeriod of periods) {
          if (snapshotCancelRef.current) break;
          if (retryItems && !retryItems.some((item) => item.ruleId === rule.id && item.periodKey === snapshotPeriod.periodKey)) { taskDone += 1; continue; }
          setSnapshotTask((current) => ({ ...current, done: taskDone, current: `${rule.label} · ${snapshotPeriod.granularity === "range" ? "总周期" : snapshotPeriod.periodKey}` }));
          try { const snapshot = buildQualityAgentSnapshot({ data, files: moduleFiles, dateRange: snapshotPeriod, module: rule.module }); next = mergeQualitySnapshotHistory(next, { rule, snapshot, sourceSignature: createSourcesSignature(moduleFiles), dateRange: snapshotPeriod, generatedBy: auth?.ip || auth?.name || "管理员", batchId, skillName: rule.selectedSkill || rule.defaultSkill, layoutProfileId: rule.layoutProfileId }); } catch (error) { failedItems.push({ ruleId: rule.id, module: rule.module, periodKey: snapshotPeriod.periodKey, error: error?.message || String(error) }); }
          taskDone += 1; setSnapshotTask((current) => ({ ...current, done: taskDone, failed: failedItems.length }));
          // ponytail: yield after each period so progress renders and cancel remains responsive.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (!snapshotCancelRef.current) {
          next = maintainHistory(next);
          await saveRegistry(next);
        }
      }
      next = maintainHistory(next);
      const task = { id: taskId, batchId, kind: "模块", startedAt: taskStartedAt, finishedAt: new Date().toISOString(), status: snapshotCancelRef.current ? "cancelled" : failedItems.length ? "failed" : "completed", total: taskTotal, done: taskDone, failed: failedItems.length, failedItems, rules: rules.map((rule) => rule.module), period: { start2025: dateRange.start2025 || "", end2025: dateRange.end2025 || "", start2026: dateRange.start2026 || "", end2026: dateRange.end2026 || "" } };
      next = { ...next, maintenance: { ...(next.maintenance || {}), taskHistory: [task, ...(next.maintenance?.taskHistory || [])].slice(0, 50) } };
      await saveRegistry(next);
      setStatus(snapshotCancelRef.current ? `已取消，已保存 ${taskDone} 个快照` : "已完成 " + taskDone + " 个后台快照，Agent 将优先读取命中数据");
    } catch (error) { setStatus("快照生成失败：" + (error?.message || error)); }
    finally { setRunning(false); setSnapshotTask(null); }
  };
  const runRoleSnapshots = async (roleSelectedOverride = roleSelected, retryItems = null) => {
    if (!editable || roleRunning) return;
      const rules = roleSelectedOverride.map((id) => roleSnapshotRule(id)).filter((rule) => roleRegistry.rules.find((item) => item.id === rule.id)?.enabled !== false);
    setRoleRunning(true); snapshotCancelRef.current = false;
    try {
      const modules = [...new Set(rules.flatMap((rule) => rule.modules))];
       const batchId = `role-batch-${Date.now()}`; const taskId = batchId; const taskStartedAt = new Date().toISOString();
      const rolePeriod = { start: dateRange.start || dateRange.start2026 || dateRange.start2025 || "", end: dateRange.end || dateRange.end2026 || dateRange.end2025 || "" };
      const rolePeriods = [{ ...rolePeriod, granularity: "range", periodKey: "range" }, ...buildSnapshotPeriods({ start2026: rolePeriod.start, end2026: rolePeriod.end }).filter((item) => item.granularity !== "range").map((item) => ({ start: item.start2026 || item.start2025, end: item.end2026 || item.end2025, granularity: item.granularity, periodKey: item.periodKey }))];
      const roleTaskTotal = rules.length * rolePeriods.length; let roleTaskDone = 0; const failedItems = [];
      setSnapshotTask({ kind: "角色", total: roleTaskTotal, done: 0, current: "正在加载角色数据", failed: 0 });
      const hydrated = onEnsureAgentSources ? await onEnsureAgentSources(modules, (progress) => { setRoleStatus(progress?.label || "正在加载角色快照数据"); setSnapshotTask((current) => current ? { ...current, current: progress?.label || "正在加载角色快照数据" } : current); }) : files;
      let next = roleRegistry;
      setSnapshotTask((current) => ({ ...current, current: "准备生成角色周期快照" }));
      const config = safeParse(localStorage.getItem(qmdpSystemKey), {});
      const mappingSignature = roleSnapshotMappingSignature(config);
      for (const rule of rules) {
        if (snapshotCancelRef.current) break;
        setRoleStatus(`正在生成 ${rule.role} 个人快照`);
        const roleConfig = next.rules.find((item) => item.id === rule.id) || {};
        const sourceFiles = hydrated || files;
        const sourceSignature = roleSnapshotSourceSignature(sourceFiles);
        for (const currentPeriod of rolePeriods) {
          if (snapshotCancelRef.current) break;
          if (retryItems && !retryItems.some((item) => item.ruleId === rule.id && item.periodKey === currentPeriod.periodKey)) { roleTaskDone += 1; continue; }
          setSnapshotTask((current) => ({ ...current, done: roleTaskDone, current: `${rule.role} · ${currentPeriod.granularity === "range" ? "总周期" : currentPeriod.periodKey}` }));
          const existing = next.history.find((entry) => entry.role === rule.role && entry.period?.start === currentPeriod.start && entry.period?.end === currentPeriod.end && entry.granularity === currentPeriod.granularity && entry.sourceSignature === sourceSignature && entry.mappingSignature === mappingSignature && entry.skillName === roleConfig.selectedSkill && entry.layoutProfileId === roleConfig.layoutProfileId);
          if (existing) {
            roleTaskDone += 1;
            setSnapshotTask((current) => ({ ...current, done: roleTaskDone, current: `${rule.role} · ${currentPeriod.granularity === "range" ? "总周期" : currentPeriod.periodKey}（已复用）` }));
            await new Promise((resolve) => setTimeout(resolve, 0));
            continue;
          }
           try { const payload = buildRoleSnapshots({ role: rule.role, files: sourceFiles, dateRange: currentPeriod, mappings: config }); next = mergeRoleSnapshotRegistry(next, { role: rule.role, ruleId: rule.id, period: currentPeriod, granularity: currentPeriod.granularity, sourceSignature: payload.sourceSignature, mappingSignature, snapshot: payload, batchId, skillName: roleConfig.selectedSkill, layoutProfileId: roleConfig.layoutProfileId }); } catch (error) { failedItems.push({ ruleId: rule.id, role: rule.role, periodKey: currentPeriod.periodKey, error: error?.message || String(error) }); }
          roleTaskDone += 1; setSnapshotTask((current) => ({ ...current, done: roleTaskDone }));
          // ponytail: yield after each period so large role batches do not freeze the page.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (!snapshotCancelRef.current) {
          next = maintainRoleHistory(next);
          setRoleRegistry(next);
          await saveQualityAgentRoleSnapshotRegistry(next);
        }
      }
      setRoleRegistry(next);
      next = maintainRoleHistory(next);
      setRoleRegistry(next);
       const task = { id: taskId, batchId, kind: "角色", startedAt: taskStartedAt, finishedAt: new Date().toISOString(), status: snapshotCancelRef.current ? "cancelled" : failedItems.length ? "failed" : "completed", total: roleTaskTotal, done: roleTaskDone, failed: failedItems.length, failedItems, rules: rules.map((rule) => rule.role), period: { start: rolePeriod.start, end: rolePeriod.end } };
      next = { ...next, maintenance: { ...(next.maintenance || {}), taskHistory: [task, ...(next.maintenance?.taskHistory || [])].slice(0, 50) } };
      await saveQualityAgentRoleSnapshotRegistry(next);
      setRoleStatus(snapshotCancelRef.current ? `已取消，已保存 ${roleTaskDone} 个角色周期快照` : `已完成 ${roleTaskDone} 个角色周期快照，共 ${next.history.reduce((sum, entry) => sum + (entry.snapshot?.people?.length || 0), 0)} 人次`);
    } catch (error) { setRoleStatus(`角色快照生成失败：${error?.message || error}`); }
    finally { setRoleRunning(false); setSnapshotTask(null); }
  };
  const cancelSnapshotTask = async () => { snapshotCancelRef.current = true; if (snapshotTask?.jobId) await updateSnapshotJob(snapshotTask.jobId, { status: "cancelled", message: "已请求取消" }).catch(() => {}); setStatus("正在取消快照任务，已完成内容会保留"); setRoleStatus("正在取消角色快照任务，已完成内容会保留"); };
  const retrySnapshotTask = (task) => {
    if (!editable || running || roleRunning || !task?.rules?.length) return;
    if (task.kind === "模块") {
      const ids = registry.rules.filter((rule) => task.rules.includes(rule.module)).map((rule) => rule.id);
      setSelected(ids); setStatus("已载入失败/未完成模块任务，正在重试缺失周期"); startModuleSnapshot(ids, task.failedItems || null, { start2026: task.period?.start2026 || moduleSnapshotPeriod.start2026, end2026: task.period?.end2026 || moduleSnapshotPeriod.end2026 });
    } else {
      const ids = roleRegistry.rules.filter((rule) => task.rules.includes(rule.role)).map((rule) => rule.id);
      setRoleSelected(ids); setRoleStatus("已载入失败/未完成角色任务，正在重试缺失周期"); startRoleSnapshot(ids, task.failedItems || null, { start: String(task.period?.start || "").startsWith("2026-") ? task.period.start : roleSnapshotPeriod.start, end: String(task.period?.end || "").startsWith("2026-") ? task.period.end : roleSnapshotPeriod.end });
    }
  };
  const watchSnapshotJob = async (jobId, kind) => {
    while (true) {
      const response = await loadSnapshotJob(jobId);
      const job = response?.job;
      if (!job) break;
      const current = { kind: job.kind === "role" ? "角色" : "模块", total: job.total || 0, done: job.done || 0, failed: job.failed || 0, current: job.message || "正在处理", status: job.status, jobId };
      setSnapshotTask(current);
      if (kind === "模块") setStatus(job.message || "正在生成快照"); else setRoleStatus(job.message || "正在生成角色快照");
      if (["completed", "failed", "cancelled"].includes(job.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    await refreshSnapshotViews();
    if (kind === "模块") setRunning(false);
    if (kind === "角色") setRoleRunning(false);
    setTimeout(() => setSnapshotTask(null), 1200);
  };
  const startModuleSnapshot = async (selectedOverride = selected, retryItems = null, period = moduleSnapshotPeriod) => {
    if (!editable) return setStatus("当前账号没有生成快照权限，请使用管理员或副管理员账号");
    if (loading) return setStatus("快照注册表仍在读取，请稍候");
    if (running) return;
    if (!/^2026-/.test(period.start2026 || "") || !/^2026-/.test(period.end2026 || "") || period.start2026 > period.end2026) return setStatus("请设置有效的 2026 快照统计日期");
    const ids = Array.isArray(selectedOverride) ? selectedOverride : selected;
    if (!ids.length) return setStatus("请先勾选要生成的部门快照");
    setStatus("已点击生成快照，正在提交服务端任务…");
    setRunning(true);
    try {
      const job = await createSnapshotJob({ kind: "module", ruleIds: ids, dateRange: { start2026: period.start2026, end2026: period.end2026 }, retryItems: retryItems || null });
      setSnapshotTask({ kind: "模块", total: 0, done: 0, failed: 0, current: "任务已提交，等待服务端执行", status: "queued", jobId: job?.job?.id || job?.id });
      await watchSnapshotJob(job?.job?.id || job?.id, "模块");
    } catch (error) {
      setStatus(`生成快照任务提交失败：${error?.message || error}`);
      setRunning(false);
    }
  };
  const startRoleSnapshot = async (selectedOverride = roleSelected, retryItems = null, period = roleSnapshotPeriod) => {
    if (!editable) return setRoleStatus("当前账号没有生成角色快照权限，请使用管理员或副管理员账号");
    if (roleRunning) return;
    if (!/^2026-/.test(period.start || "") || !/^2026-/.test(period.end || "") || period.start > period.end) return setRoleStatus("请设置有效的 2026 角色快照统计日期");
    const ids = Array.isArray(selectedOverride) ? selectedOverride : roleSelected;
    if (!ids.length) return setRoleStatus("请先勾选要生成的角色快照");
    setRoleStatus("已点击生成角色快照，正在提交服务端任务…");
    setRoleRunning(true);
    try {
      // The server-side worker needs the same approved management path used by
      // the role report page to aggregate PM → TPM → 产总.
      const mappings = safeParse(localStorage.getItem(qmdpSystemKey), {});
      const job = await createSnapshotJob({ kind: "role", ruleIds: ids, dateRange: period, retryItems: retryItems || null, mappings: { orgMappings: mappings.orgMappings || [], supplyMappings: mappings.supplyMappings || [] } });
      setSnapshotTask({ kind: "角色", total: 0, done: 0, failed: 0, current: "任务已提交，等待服务端执行", status: "queued", jobId: job?.job?.id || job?.id });
      await watchSnapshotJob(job?.job?.id || job?.id, "角色");
    } catch (error) {
      setRoleStatus(`角色快照任务提交失败：${error?.message || error}`);
      setRoleRunning(false);
    }
  };
  return (
    <div className="qmdp-page qmdp-background-snapshot">
      <QmdpPageHeader
        icon={Database}
        eyebrow="系统管理 / Administration"
        title="后台快照"
        description={editable ? "选择规则后生成固定数据快照，减少 Agent 页面临时计算。" : "当前账号仅可查看后台快照状态。"}
      />
      <SnapshotPanelBoundary title="部门快照"><Panel className="snapshot-rules-panel" title="部门快照" subtitle="规则可视化：模块、数据范围、固定指标、分析 Skill 和展示 profile。">
        <div className="qmdp-snapshot-toolbar">
          <span>{loading ? "正在读取注册表…" : "规则注册表已加载"} · 最近更新：{registry.updatedAt ? formatSyncDateTime(registry.updatedAt) : "暂无"}</span>
          <div className="qmdp-snapshot-date-controls">
            <label>2026统计范围<input type="date" min="2026-01-01" max="2026-12-31" value={moduleSnapshotPeriod.start2026} disabled={running} onChange={(event) => setModuleSnapshotPeriod((current) => ({ ...current, start2026: event.target.value }))}/><i>—</i><input type="date" min="2026-01-01" max="2026-12-31" value={moduleSnapshotPeriod.end2026} disabled={running} onChange={(event) => setModuleSnapshotPeriod((current) => ({ ...current, end2026: event.target.value }))}/></label>
          </div>
          <button type="button" className="qmdp-secondary-btn" disabled={!editable} onClick={() => openSnapshotStorage("module").then(() => setStatus("已打开部门快照保存目录")).catch((error) => setStatus(error?.message || "无法打开快照目录"))}><FolderOpen size={15}/>打开快照</button>
          <button type="button" className={`qmdp-primary-btn snapshot-generate-btn ${running ? "snapshot-running" : ""}`} disabled={running} onClick={() => startModuleSnapshot()}>
            <ArrowsClockwise size={15} className={running ? "spin" : ""}/>
            {running ? "正在生成…" : "生成快照"}
          </button>
          {snapshotTask?.kind === "模块" && <div className="qmdp-snapshot-task-progress snapshot-task-inline"><div><strong>模块快照任务</strong><span>{snapshotTask.done}/{snapshotTask.total}</span></div><i><b style={{ width: `${snapshotTask.total ? snapshotTask.done / snapshotTask.total * 100 : 0}%` }}/></i><small>{snapshotTask.current}</small><button className="qmdp-danger-btn" onClick={cancelSnapshotTask}>停止任务</button></div>}
        </div>
        <div className="qmdp-snapshot-layout">
          <div className="qmdp-snapshot-rules">
            {registry.rules.map((rule) => {
              const preview = getQualitySnapshotRulePreview(rule);
              const historyCount = registry.history.filter((entry) => entry.ruleId === rule.id).length;
              return (
                <article className={`qmdp-snapshot-rule ${selected.includes(rule.id) ? "selected" : ""}`} key={rule.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(rule.id)}
                    disabled={!editable || running}
                    onChange={() => setSelected((current) => current.includes(rule.id) ? current.filter((id) => id !== rule.id) : [...current, rule.id])}
                  />
                  <span>
                    <strong>{rule.label}</strong>
                    <small>{rule.description}</small>
                    <em>{preview.focus.join(" · ")}</em>
                    <small>Skill：{rule.selectedSkill || rule.defaultSkill} · Profile：{rule.layoutProfileId} · 历史：{historyCount} 条</small>
                    <div className="qmdp-form-grid qmdp-snapshot-rule-fields">
                      <label>
                        <span>启用</span>
                        <select
                          value={rule.enabled ? "启用" : "停用"}
                          disabled={!editable || running}
                          onChange={(event) => updateRule(rule.id, { enabled: event.target.value === "启用" })}
                        >
                          <option value="启用">启用</option>
                          <option value="停用">停用</option>
                        </select>
                      </label>
                      <label>
                        <span>分析 Skill</span>
                        <select
                          value={rule.selectedSkill || rule.defaultSkill}
                          disabled={!editable || running}
                          onChange={(event) => updateRule(rule.id, { selectedSkill: event.target.value })}
                        >
                          {skillOptionsByRule(rule).map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>展示 Profile</span>
                        <select
                          value={rule.layoutProfileId}
                          disabled={!editable || running}
                          onChange={(event) => updateRule(rule.id, { layoutProfileId: event.target.value })}
                        >
                          {presentationOptions.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
                        </select>
                      </label>
                    </div>
                  </span>
                </article>
              );
            })}
          </div>
          <div className="qmdp-snapshot-preview">
            {selected.length
              ? registry.rules.filter((rule) => selected.includes(rule.id)).map((rule) => (
                <section key={rule.id}>
                  <strong>{rule.label}</strong>
                  <p>{rule.description}</p>
                  <small>模块：{(rule.sourceModules || []).join("、")} · 数据类型：{(rule.sourceKinds || []).join("、")}</small>
                  <small>生成重点：{(rule.focus || []).join("、")}</small>
                  <small>当前 Skill：{rule.selectedSkill || rule.defaultSkill} · 当前 Profile：{rule.layoutProfileId}</small>
                </section>
              ))
              : <div className="qmdp-empty compact">勾选左侧规则后查看预览。</div>}
          </div>
        </div>
        {status && <div className="qmdp-note"><Database size={15}/>{status}</div>}
      </Panel></SnapshotPanelBoundary>
      <SnapshotPanelBoundary title="部门快照历史"><Panel className="snapshot-history-panel" title="快照历史" subtitle="按模块、日期范围、来源版本和 Skill 版本保存。">
        <div className="qmdp-snapshot-task-history"><strong>任务历史</strong>{(registry.maintenance?.taskHistory || []).slice(0, 8).map((task) => <div key={task.id}><span>{task.kind} · {new Date(task.startedAt).toLocaleString("zh-CN")}</span><b className={task.status === "completed" ? "done" : "cancelled"}>{task.status === "completed" ? "已完成" : task.status === "failed" ? "有失败" : "已取消"}</b><small>{task.done}/{task.total} 个周期 · 失败 {task.failed || 0} · {task.rules?.join("、")}{task.batchId ? ` · ${task.batchId.replace(/^module-batch-/, "批次 ")}` : ""}</small>{task.status !== "completed" && <button className="snapshot-view-btn" disabled={!editable || running || roleRunning} onClick={() => retrySnapshotTask(task)}>重试失败项</button>}</div>)}{!(registry.maintenance?.taskHistory || []).length && <small>暂无任务记录</small>}</div>
        <details className="qmdp-snapshot-task-history"><summary className="qmdp-text-btn">当前队列</summary><select value={moduleQueueFilter} onChange={(event) => setModuleQueueFilter(event.target.value)}><option>未完成</option><option>全部</option><option value="queued">排队中</option><option value="running">执行中</option><option value="failed">失败</option><option value="completed">已完成</option></select>{moduleQueueJobs.slice(0, 6).map((job) => <div key={job.id}><span>{job.kind} · {job.batchId || job.id}</span><b className={job.status === "completed" ? "done" : job.status === "failed" ? "cancelled" : ""}>{job.status === "completed" ? "已完成" : job.status === "failed" ? "失败" : job.status === "running" ? "执行中" : "排队中"}</b><small>{job.progress || 0}% · {job.message || "等待执行"}</small></div>)}{!moduleQueueJobs.length && <small>暂无服务端队列。</small>}</details>
        <div className="qmdp-snapshot-maintenance"><strong>自动维护</strong><label><input type="checkbox" checked={registry.maintenance?.enabled !== false} onChange={(event) => updateMaintenance({ enabled: event.target.checked })}/>启用</label><label><input type="checkbox" checked={registry.maintenance?.autoArchive !== false} onChange={(event) => updateMaintenance({ autoArchive: event.target.checked })}/>自动归档旧版本</label><label>每个周期保留<select value={registry.maintenance?.retention || 3} onChange={(event) => updateMaintenance({ retention: Number(event.target.value) })}>{[1,2,3,5,10].map((value) => <option key={value} value={value}>{value} 个</option>)}</select></label><small>相同来源、Skill、Profile 且数据未变化时会复用已有快照。</small></div>
        <div className="qmdp-snapshot-library-toolbar"><label className="qmdp-snapshot-select-all"><input type="checkbox" checked={allVisibleModulesSelected} onChange={toggleVisibleModuleHistory} disabled={!filteredModuleIds.length}/><span>{allVisibleModulesSelected ? "取消全选当前结果" : "全选当前结果"}</span></label><div className="qmdp-snapshot-search"><input value={snapshotKeywordInput} onChange={(event) => setSnapshotKeywordInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setSnapshotFilter((current) => ({ ...current, keyword: snapshotKeywordInput.trim() })); }} placeholder="搜索模块 / Skill / Profile"/><button className="qmdp-secondary-btn" onClick={() => setSnapshotFilter((current) => ({ ...current, keyword: snapshotKeywordInput.trim() }))}>搜索</button>{snapshotKeywordInput && <button className="qmdp-text-btn" onClick={() => { setSnapshotKeywordInput(""); setSnapshotFilter((current) => ({ ...current, keyword: "" })); }}>清空</button>}</div><select value={snapshotFilter.active} onChange={(event) => setSnapshotFilter((current) => ({ ...current, active: event.target.value }))}><option>全部</option><option>有效</option><option>停用</option></select><span>匹配 {filteredModuleHistory.length} 条 · 已选 {selectedSnapshotHistory.length} 条</span><button className="qmdp-secondary-btn" disabled={!editable || selectedSnapshotHistory.length !== 2 || snapshotCompareLoading} onClick={() => openSnapshotCompare(moduleCompareEntries)}>对比两个版本</button><button className="qmdp-secondary-btn" disabled={!editable || !selectedSnapshotHistory.length} onClick={() => bulkModuleHistory(true)}>启用选中</button><button className="qmdp-secondary-btn" disabled={!editable || !selectedSnapshotHistory.length} onClick={() => bulkModuleHistory(false)}>停用选中</button><button className="qmdp-danger-btn" disabled={!editable || !selectedSnapshotHistory.length} onClick={deleteModuleHistory}>删除选中</button></div>
        {registry.history.length ? (
          <div className="qmdp-admin-table">
            <div className="qmdp-admin-row head">
              <span></span>
               <span>模块</span>
               <span>周期</span>
               <span>批次</span>
               <span>生成时间</span>
              <span>Skill</span>
              <span>来源行数</span>
              <span>证据数</span>
              <span>状态</span>
            </div>
            {filteredModuleHistory.slice(0, 60).map((entry) => (
                <div className={`qmdp-admin-row ${selectedSnapshotHistory.includes(entry.id) ? "snapshot-row-selected" : ""}`} key={entry.id} onDoubleClick={() => openModuleSnapshotDetail(entry)}>
                <span><input type="checkbox" checked={selectedSnapshotHistory.includes(entry.id)} onChange={() => setSelectedSnapshotHistory((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id])}/></span>
                 <span>{entry.moduleLabel || entry.module}</span>
                 <span>{entry.dateRange?.granularity === "range" ? "总周期" : (entry.dateRange?.periodKey || entry.dateRange?.granularity || "周期")}</span>
                 <span>{entry.batchId ? entry.batchId.replace(/^module-batch-/, "批次 ") : "历史"}</span>
                 <span>{formatSyncDateTime(entry.generatedAt)}</span>
                <span>{entry.skillName}<button className="snapshot-view-btn" onClick={() => openModuleSnapshotDetail(entry)}>查看</button></span>
                <span>{entry.summary?.sourceRows ?? "-"}</span>
                <span>{entry.summary?.evidenceCount ?? "-"}</span>
                <span><b className={`snapshot-status ${entry.active === false ? "inactive" : isModuleHistorical(entry) ? "historical" : "active"}`}>{entry.active === false ? "停用" : isModuleHistorical(entry) ? "旧版本" : "有效"}</b>{selectedSnapshotHistory.includes(entry.id) && <b className="snapshot-selected-badge">已选中</b>}</span>
              </div>
            ))}
          </div>
        ) : <div className="qmdp-empty compact">尚未生成后台快照。</div>}
      </Panel></SnapshotPanelBoundary>
      <SnapshotPanelBoundary title="角色快照"><Panel className="snapshot-role-panel" title="角色快照" subtitle="先生成供应链组装人员和研发工程师个人快照，后续按责任链汇总到上级角色。">
        <div className="qmdp-snapshot-period-filter"><label className="qmdp-snapshot-date-controls">2026统计范围<input type="date" min="2026-01-01" max="2026-12-31" value={roleSnapshotPeriod.start} disabled={roleRunning} onChange={(event) => setRoleSnapshotPeriod((current) => ({ ...current, start: event.target.value }))}/><i>—</i><input type="date" min="2026-01-01" max="2026-12-31" value={roleSnapshotPeriod.end} disabled={roleRunning} onChange={(event) => setRoleSnapshotPeriod((current) => ({ ...current, end: event.target.value }))}/></label><select value={roleSnapshotFilter.period} onChange={(event) => setRoleSnapshotFilter((current) => ({ ...current, period: event.target.value }))}><option value="全部">全部周期</option><option value="总周期">总周期</option><option value="month">月度</option><option value="week">周度</option></select><span>角色快照按角色和周期筛选，批次内快照统一生成。</span></div>
        <div className="qmdp-snapshot-task-history"><strong>任务历史</strong>{(roleRegistry.maintenance?.taskHistory || []).slice(0, 8).map((task) => <div key={task.id}><span>{task.kind} · {new Date(task.startedAt).toLocaleString("zh-CN")}</span><b className={task.status === "completed" ? "done" : "cancelled"}>{task.status === "completed" ? "已完成" : task.status === "failed" ? "有失败" : "已取消"}</b><small>{task.done}/{task.total} · 失败 {task.failed || 0} · {task.rules?.join("、")}</small>{task.status !== "completed" && <button className="snapshot-view-btn" disabled={!editable || running || roleRunning} onClick={() => retrySnapshotTask(task)}>重试失败项</button>}</div>)}{!(roleRegistry.maintenance?.taskHistory || []).length && <small>暂无任务记录</small>}</div>
        <details className="qmdp-snapshot-task-history"><summary className="qmdp-text-btn">当前队列</summary><select value={roleQueueFilter} onChange={(event) => setRoleQueueFilter(event.target.value)}><option>未完成</option><option>全部</option><option value="queued">排队中</option><option value="running">执行中</option><option value="failed">失败</option><option value="completed">已完成</option></select>{roleQueueJobs.slice(0, 6).map((job) => <div key={job.id}><span>{job.kind} · {job.batchId || job.id}</span><b className={job.status === "completed" ? "done" : job.status === "failed" ? "cancelled" : ""}>{job.status === "completed" ? "已完成" : job.status === "failed" ? "失败" : job.status === "running" ? "执行中" : "排队中"}</b><small>{job.progress || 0}% · {job.message || "等待执行"}</small></div>)}{!roleQueueJobs.length && <small>暂无服务端队列。</small>}</details>
        <div className="qmdp-snapshot-maintenance"><strong>自动维护</strong><label><input type="checkbox" checked={roleRegistry.maintenance?.enabled !== false} onChange={(event) => updateRoleMaintenance({ enabled: event.target.checked })}/>启用</label><label><input type="checkbox" checked={roleRegistry.maintenance?.autoArchive !== false} onChange={(event) => updateRoleMaintenance({ autoArchive: event.target.checked })}/>自动归档旧版本</label><label>每个周期保留<select value={roleRegistry.maintenance?.retention || 3} onChange={(event) => updateRoleMaintenance({ retention: Number(event.target.value) })}>{[1,2,3,5,10].map((value) => <option key={value} value={value}>{value} 个</option>)}</select></label><small>相同角色、周期、来源、Skill 和 Profile 的快照会复用。</small></div>
        <div className="qmdp-snapshot-toolbar"><span>{roleStatus || `已保存角色快照：${roleRegistry.history.length} 条`}</span><button type="button" className="qmdp-secondary-btn" disabled={!editable} onClick={() => openSnapshotStorage("role").then(() => setRoleStatus("已打开角色快照保存目录")).catch((error) => setRoleStatus(error?.message || "无法打开快照目录"))}><FolderOpen size={15}/>打开快照</button><button type="button" className={`qmdp-primary-btn snapshot-generate-btn ${roleRunning ? "snapshot-running" : ""}`} disabled={roleRunning} onClick={() => startRoleSnapshot()}><ArrowsClockwise size={15} className={roleRunning ? "spin" : ""}/>{roleRunning ? "正在生成…" : "生成快照"}</button>{snapshotTask?.kind === "角色" && <div className="qmdp-snapshot-task-progress snapshot-task-inline"><div><strong>角色快照任务</strong><span>{snapshotTask.done}/{snapshotTask.total}</span></div><i><b style={{ width: `${snapshotTask.total ? snapshotTask.done / snapshotTask.total * 100 : 0}%` }}/></i><small>{snapshotTask.current}</small><button className="qmdp-danger-btn" onClick={cancelSnapshotTask}>停止任务</button></div>}</div>
        <div className="qmdp-role-snapshot-options">
          {roleRegistry.rules.map((rule) => <article className={`qmdp-role-snapshot-card ${roleSelected.includes(rule.id) ? "selected" : ""}`} key={rule.id}>
            <div className="qmdp-role-snapshot-card-head"><label><input type="checkbox" checked={roleSelected.includes(rule.id)} disabled={!editable || roleRunning} onChange={() => setRoleSelected((current) => current.includes(rule.id) ? current.filter((id) => id !== rule.id) : [...current, rule.id])}/><strong>{rule.role}</strong></label><small>{rule.id}</small></div>
            <p>{roleSnapshotRule(rule.id).chain}</p>
            <div className="qmdp-role-snapshot-meta">Skill：{rule.selectedSkill} · Profile：{rule.layoutProfileId} · 历史：{roleRegistry.history.filter((entry) => entry.ruleId === rule.id || entry.role === rule.role).length} 条</div>
            <div className="qmdp-role-snapshot-fields">
              <label><span>启用</span><select value={rule.enabled ? "启用" : "停用"} disabled={!editable || roleRunning} onChange={(event) => updateRoleRule(rule.id, { enabled: event.target.value === "启用" })}><option value="启用">启用</option><option value="停用">停用</option></select></label>
              <label><span>分析 Skill</span><select value={rule.selectedSkill} disabled={!editable || roleRunning} onChange={(event) => updateRoleRule(rule.id, { selectedSkill: event.target.value })}>{roleSkillOptionsByRule(rule).map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}</select></label>
              <label><span>展示 Profile</span><select value={rule.layoutProfileId} disabled={!editable || roleRunning} onChange={(event) => updateRoleRule(rule.id, { layoutProfileId: event.target.value })}>{presentationOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            </div>
          </article>)}
        </div>
        <div className="qmdp-snapshot-library-toolbar"><label className="qmdp-snapshot-select-all"><input type="checkbox" checked={allVisibleRolesSelected} onChange={toggleVisibleRoleHistory} disabled={!filteredRoleIds.length}/><span>{allVisibleRolesSelected ? "取消全选当前结果" : "全选当前结果"}</span></label><div className="qmdp-snapshot-search"><input value={roleSnapshotKeywordInput} onChange={(event) => setRoleSnapshotKeywordInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setRoleSnapshotFilter((current) => ({ ...current, keyword: roleSnapshotKeywordInput.trim() })); }} placeholder="搜索角色 / Skill / Profile"/><button className="qmdp-secondary-btn" onClick={() => setRoleSnapshotFilter((current) => ({ ...current, keyword: roleSnapshotKeywordInput.trim() }))}>搜索</button>{roleSnapshotKeywordInput && <button className="qmdp-text-btn" onClick={() => { setRoleSnapshotKeywordInput(""); setRoleSnapshotFilter((current) => ({ ...current, keyword: "" })); }}>清空</button>}</div><select value={roleSnapshotFilter.role} onChange={(event) => setRoleSnapshotFilter((current) => ({ ...current, role: event.target.value }))}><option>全部</option>{roleRegistry.rules.map((rule) => <option key={rule.role}>{rule.role}</option>)}</select><select value={roleSnapshotFilter.active} onChange={(event) => setRoleSnapshotFilter((current) => ({ ...current, active: event.target.value }))}><option>全部</option><option>有效</option><option>停用</option></select><span>匹配 {filteredRoleHistory.length} 条 · 已选 {selectedRoleHistory.length} 条</span><button className="qmdp-secondary-btn" disabled={!editable || selectedRoleHistory.length !== 2 || snapshotCompareLoading} onClick={() => openSnapshotCompare(roleCompareEntries)}>对比两个版本</button><button className="qmdp-secondary-btn" disabled={!editable || !selectedRoleHistory.length} onClick={() => bulkRoleHistory(true)}>启用选中</button><button className="qmdp-secondary-btn" disabled={!editable || !selectedRoleHistory.length} onClick={() => bulkRoleHistory(false)}>停用选中</button><button className="qmdp-danger-btn" disabled={!editable || !selectedRoleHistory.length} onClick={deleteRoleHistory}>删除选中</button></div>
        {roleRegistry.history.length ? <div className="qmdp-admin-table"><div className="qmdp-admin-row head"><span></span><span>角色</span><span>周期</span><span>人数</span><span>Skill/Profile</span><span>状态</span></div>{filteredRoleHistory.slice(0, 40).map((entry) => { const entryId = roleHistoryId(entry); return <div className={`qmdp-admin-row ${selectedRoleHistory.includes(entryId) ? "snapshot-row-selected" : ""}`} key={entryId}><span><input type="checkbox" checked={selectedRoleHistory.includes(entryId)} onChange={() => setSelectedRoleHistory((current) => current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId])}/></span><span>{entry.role}</span><span>{entry.period?.granularity === "range" ? "总周期" : (entry.period?.periodKey || entry.period?.granularity || "周期")}</span><span>{entry.peopleCount ?? entry.snapshot?.people?.length ?? 0}</span><span>{entry.skillName || "-"} / {entry.layoutProfileId || "-"}<button className="snapshot-view-btn" onClick={() => openRoleSnapshotDetail(entry)}>查看</button></span><span><b className={`snapshot-status ${entry.active === false ? "inactive" : "active"}`}>{entry.active === false ? "停用" : "有效"}</b>{entry.batchId && <small> · {entry.batchId.replace(/^role-batch-/, "批次 ")}</small>}{selectedRoleHistory.includes(entryId) && <b className="snapshot-selected-badge">已选中</b>}</span></div>; })}</div> : <div className="qmdp-empty compact">尚未生成个人角色快照。</div>}
      {snapshotDetail && <div className="snapshot-detail-backdrop" onClick={() => setSnapshotDetail(null)}><section className="snapshot-detail-card" onClick={(event) => event.stopPropagation()}><header><div><small>快照详情</small><h3>{snapshotDetail.title}</h3></div><button className="qmdp-text-btn" onClick={() => setSnapshotDetail(null)}>关闭</button></header><div className="snapshot-detail-grid"><span>生成时间<strong>{formatSyncDateTime(snapshotDetail.entry.generatedAt)}</strong></span><span>来源版本<strong>{snapshotDetail.entry.sourceSignature ? "已记录" : "未记录"}</strong></span><span>Skill<strong>{snapshotDetail.entry.skillName || "-"}</strong></span><span>Profile<strong>{snapshotDetail.entry.layoutProfileId || "-"}</strong></span><span>状态<strong>{snapshotDetail.entry.active === false ? "停用" : "有效"}</strong></span><span>数据量<strong>{snapshotDetail.kind === "role" ? `${snapshotDetail.entry.snapshot?.people?.length || 0} 人` : `${snapshotDetail.entry.summary?.sourceRows || 0} 行`}</strong></span></div><label className="snapshot-note-field"><span>管理员备注</span><textarea defaultValue={snapshotDetail.entry.note || ""} placeholder="记录本次快照用途、口径或替换原因" onBlur={(event) => updateSnapshotNote(snapshotDetail.kind, snapshotDetail.key, event.target.value)}/></label></section></div>}
      {snapshotCompare?.length === 2 && <div className="snapshot-detail-backdrop" onClick={() => setSnapshotCompare(null)}><section className="snapshot-detail-card snapshot-compare-card" onClick={(event) => event.stopPropagation()}><header><div><small>版本对比</small><h3>{snapshotCompare[0].moduleLabel || snapshotCompare[0].role || "快照"}</h3></div><button className="qmdp-text-btn" onClick={() => setSnapshotCompare(null)}>关闭</button></header><div className="snapshot-compare-grid">{snapshotCompare.map((entry) => <article key={entry.id || entry.key}><strong>{entry.active === false ? "停用" : "有效"}</strong><small>{new Date(entry.generatedAt).toLocaleString("zh-CN")}</small><p>周期：{entry.dateRange?.start2025 || entry.period?.start || ""}—{entry.dateRange?.end2026 || entry.period?.end || ""}</p><p>Skill：{entry.skillName || "-"}</p><p>Profile：{entry.layoutProfileId || "-"}</p><p>数据量：{entry.summary?.sourceRows ?? entry.snapshot?.people?.length ?? 0}</p><p>来源：{entry.sourceSignature ? "来源版本已记录" : "未记录"}</p></article>)}</div><p className="snapshot-compare-note">单月报告只能使用周期精确匹配的月度快照；半年快照不会被用于单月报告。</p></section></div>}
      </Panel></SnapshotPanelBoundary>
    </div>
  );
}

function DqaAgentProjectMappingPanel({ raw, editable, onSave }) {
  const [query, setQuery] = useState(""); const [selected, setSelected] = useState(null); const rows = raw?.projectMappings || [];
  const visible = useMemo(() => rows.filter((row) => !query.trim() || `${row.costObject} ${row.projectName} ${row.pm} ${row.tpm}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 100), [rows, query]);
  const saveRow = async () => { if (!selected || !editable) return; await onSave({ ...raw, updatedAt: new Date().toISOString(), projectMappings: rows.map((row) => row.recordId === selected.recordId ? selected : row) }); };
  return <Panel title="研发项目映射" subtitle="用于非BOM的研发工程师、PM、TPM责任归属；独立于质量数据-DQA和OQC项目名称映射。"><div className="qmdp-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索成本对象、项目名称、PM或TPM"/><span>共 {rows.length.toLocaleString()} 条 · 当前显示 {visible.length} 条</span></div><div className="qmdp-admin-table"><div className="qmdp-admin-row head"><span>成本对象</span><span>项目名称</span><span>PM</span><span>TPM</span><span>操作</span></div>{visible.map((row) => <div className="qmdp-admin-row" key={row.recordId}><span>{row.costObject}</span><span>{row.projectName}</span><input value={row.pm || ""} disabled={!editable || selected?.recordId !== row.recordId} onChange={(event) => setSelected((current) => ({ ...(current || row), pm: event.target.value }))}/><input value={row.tpm || ""} disabled={!editable || selected?.recordId !== row.recordId} onChange={(event) => setSelected((current) => ({ ...(current || row), tpm: event.target.value }))}/><span>{selected?.recordId === row.recordId ? <button className="qmdp-primary-btn" onClick={saveRow}>保存</button> : <button className="qmdp-secondary-btn" onClick={() => setSelected({ ...row })}>编辑</button>}</span></div>)}</div>{!rows.length && <div className="qmdp-empty compact">尚未导入项目映射表。</div>}</Panel>;
}

function SystemManagementPage({ active, data, auth, files = [], dateRange = {}, onEnsureAgentSources, dqaAgentRaw, onLoadDqaAgentRaw, onSaveDqaAgentRaw }) {
  const [tab, setTab] = useState(active);
  const [config, setConfig] = useState(() => ({ ...defaultQmdpSystemConfig, ...safeParse(localStorage.getItem(qmdpSystemKey), {}) }));
  const [qualityRules, setQualityRules] = useState(DEFAULT_REPORT_QUALITY_RULES);
  const [projectMapping, setProjectMapping] = useState({ rules: {}, mappings: [] });
  const [projectMappingLoading, setProjectMappingLoading] = useState(true);
  const [projectMappingStatus, setProjectMappingStatus] = useState("");
  const [selectedProjectName, setSelectedProjectName] = useState("");
  const [projectOverrideValues, setProjectOverrideValues] = useState({});
  const [mappingTargetId, setMappingTargetId] = useState("new");
  const [projectMappingDraft, setProjectMappingDraft] = useState({ standardName: "", category: "", note: "" });
  const [status, setStatus] = useState("");
  const [importingKind, setImportingKind] = useState("");
  const mappingInputRef = useRef(null);
  useEffect(() => { localStorage.setItem(qmdpSystemKey, JSON.stringify(config)); }, [config]);
  useEffect(() => { setTab(active); }, [active]);
  useEffect(() => { if (tab === "研发项目映射") onLoadDqaAgentRaw?.().catch(() => {}); }, [tab, onLoadDqaAgentRaw]);
  useEffect(() => { loadReportQualityRules().then((value) => { if (Array.isArray(value?.rules)) setQualityRules(value.rules); }).catch(() => {}); }, []);
  useEffect(() => {
    let mounted = true;
    loadProjectNameMapping().then((value) => {
      if (mounted) setProjectMapping({ rules: value?.rules || {}, mappings: Array.isArray(value?.mappings) ? value.mappings : [] });
    }).catch(() => {
      if (mounted) setProjectMappingStatus("项目名称映射读取失败，当前显示本机缓存");
    }).finally(() => { if (mounted) setProjectMappingLoading(false); });
    return () => { mounted = false; };
  }, []);
  const editable = auth?.isAdmin || auth?.isDeputy;
  const log = (message) => setConfig((current) => ({ ...current, logs: [{ id: Date.now(), message, at: new Date().toISOString() }, ...(current.logs || [])].slice(0, 100) }));
  const setField = (section, index, field, value) => setConfig((current) => ({ ...current, [section]: current[section].map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) }));
  const addRow = (section, row) => { setConfig((current) => ({ ...current, [section]: [...(current[section] || []), row] })); log(`新增${section}记录`); };
  const saveMessage = (message) => { log(message); setStatus(message); setTimeout(() => setStatus(""), 2200); };
  const updateQualityRule = (id, patch) => setQualityRules((current) => current.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  const saveQualityRuleConfig = async () => { if (!editable) return; await saveReportQualityRules({ version: 1, rules: qualityRules, updatedAt: new Date().toISOString() }); saveMessage("报告质量校验规则已保存"); };
  const saveProjectMappingState = async (next, message) => {
    setProjectMapping(next);
    try {
      await saveProjectNameMapping(next);
      setProjectMappingStatus(message);
      window.dispatchEvent(new CustomEvent("qms-project-name-mapping-changed", { detail: next }));
    } catch (error) {
      setProjectMappingStatus(`已保存到本机，服务器同步失败：${error?.message || "请检查服务"}`);
    }
  };
  const importMapping = async (event, kind) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportingKind(kind);
    try {
      if (kind === "projectRules") {
        const rules = await parseProjectNameRuleWorkbook(file);
        const next = { ...projectMapping, rules };
        await saveProjectMappingState(next, `商务代码规则已导入：${Object.values(rules.fields).reduce((sum, items) => sum + items.length, 0)} 条`);
        return;
      }
      const rows = await parseQmdpMappingWorkbook(file, kind);
      const section = kind === "org" ? "orgMappings" : "supplyMappings";
      setConfig((current) => ({ ...current, [section]: rows, importMeta: { ...(current.importMeta || {}), [kind]: { name: file.name, importedAt: new Date().toISOString(), count: rows.length } }, logs: [{ id: Date.now(), message: `${kind === "org" ? "研发组织" : "供应链"}映射已从 ${file.name} 导入 ${rows.length} 条`, at: new Date().toISOString() }, ...(current.logs || [])].slice(0, 100) }));
      setStatus(`${kind === "org" ? "研发组织" : "供应链"}映射导入成功：${rows.length} 条`);
    } catch (error) {
      setStatus(`导入失败：${error?.message || "无法解析 Excel"}`);
    } finally {
      setImportingKind("");
    }
  };
  const openMappingImport = (kind) => {
    if (!editable || importingKind) return;
    mappingInputRef.current?.setAttribute("data-kind", kind);
    mappingInputRef.current?.click();
  };
  const mappings = config.orgMappings || [];
  const supply = config.supplyMappings || [];
  const employees = config.employees || [];
  const sourceProjectNames = useMemo(() => [...new Set((data?.oqc?.equipmentDispersion?.scopes || []).flatMap((scope) => [scope.y2025, scope.y2026]).flatMap((year) => year?.projectRows || []).map((row) => projectNameText(row.name)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")), [data]);
  const selectedProjectSuggestion = useMemo(() => suggestProjectNameMapping(selectedProjectName, projectMapping.rules), [selectedProjectName, projectMapping.rules]);
  const selectProjectForRules = (sourceName) => {
    const source = projectNameText(sourceName);
    setSelectedProjectName(source);
    const parsed = parseOqcProjectNameByRules(source, projectMapping.rules);
    const saved = (projectMapping.overrides || []).find((item) => item.sourceName === source)?.values || {};
    setProjectOverrideValues(Object.fromEntries(projectNameRuleFields.map((field) => [field.key, saved[field.key] || parsed[field.key] || {}])));
  };
  const saveProjectRuleOverride = async () => {
    const sourceName = projectNameText(selectedProjectName);
    if (!sourceName) return setProjectMappingStatus("请先选择一个原始治具名称");
    const next = { ...projectMapping, overrides: [...(projectMapping.overrides || []).filter((item) => item.sourceName !== sourceName), { sourceName, values: projectOverrideValues, updatedAt: new Date().toISOString() }] };
    await saveProjectMappingState(next, `已保存“${sourceName}”的项目规则字段`);
  };
  const bindProjectName = async () => {
    const sourceName = projectNameText(selectedProjectName);
    if (!sourceName) return setProjectMappingStatus("请先选择一个原始治具名称");
    const existing = (projectMapping.mappings || []).find((item) => item.id === mappingTargetId);
    const standardName = projectNameText(existing?.standardName || projectMappingDraft.standardName || selectedProjectSuggestion.suggestedName);
    if (!standardName) return setProjectMappingStatus("请填写标准项目名称后再绑定");
    const remaining = (projectMapping.mappings || []).map((item) => ({
      ...item,
      sourceNames: (item.sourceNames || []).filter((name) => name !== sourceName),
      bindings: (item.bindings || []).filter((binding) => binding.sourceName !== sourceName),
    }));
    const nextItem = existing
      ? { ...existing, sourceNames: [...new Set([...(existing.sourceNames || []), sourceName])], bindings: [...(existing.bindings || (existing.sourceNames || []).map((name) => ({ sourceName: name, key: existing.key || {} }))).filter((binding) => binding.sourceName !== sourceName), { sourceName, key: selectedProjectSuggestion.key }], updatedAt: new Date().toISOString() }
      : { id: `project-${Date.now()}`, active: true, standardName, category: projectNameText(projectMappingDraft.category), key: selectedProjectSuggestion.key, sourceNames: [sourceName], bindings: [{ sourceName, key: selectedProjectSuggestion.key }], note: projectNameText(projectMappingDraft.note), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const next = { ...projectMapping, mappings: [...remaining.filter((item) => item.id !== nextItem.id && item.sourceNames?.length), nextItem] };
    await saveProjectMappingState(next, `已将“${sourceName}”绑定到“${standardName}”`);
    setMappingTargetId(nextItem.id);
    setProjectMappingDraft({ standardName: nextItem.standardName, category: nextItem.category || "", note: nextItem.note || "" });
  };
  const removeProjectMapping = async (id) => {
    await saveProjectMappingState({ ...projectMapping, mappings: (projectMapping.mappings || []).filter((item) => item.id !== id) }, "标准项目类别已删除，相关原始名称将恢复独立统计");
    if (mappingTargetId === id) setMappingTargetId("new");
  };
  const renderMapping = () => <div className="qmdp-admin-table"><div className="qmdp-admin-row head"><span>产品部/厂区</span><span>负责人</span><span>TPM</span><span>PM/交付经理</span><span>状态</span></div>{mappings.map((row, index) => <div className="qmdp-admin-row" key={index}><input disabled={!editable} value={row.productDept || ""} onChange={(event) => setField("orgMappings", index, "productDept", event.target.value)}/><input disabled={!editable} value={row.productionDirector || ""} onChange={(event) => setField("orgMappings", index, "productionDirector", event.target.value)}/><input disabled={!editable} value={row.tpm || ""} onChange={(event) => setField("orgMappings", index, "tpm", event.target.value)}/><input disabled={!editable} value={row.pm || ""} onChange={(event) => setField("orgMappings", index, "pm", event.target.value)}/><select disabled={!editable} value={row.active ? "启用" : "停用"} onChange={(event) => setField("orgMappings", index, "active", event.target.value === "启用")}><option>启用</option><option>停用</option></select></div>)}</div>;
  const renderSupply = () => <div className="qmdp-admin-table"><div className="qmdp-admin-row head"><span>厂区</span><span>工坊</span><span>交付经理</span><span>机长</span><span>状态</span></div>{supply.map((row, index) => <div className="qmdp-admin-row" key={index}><input disabled={!editable} value={row.site || ""} onChange={(event) => setField("supplyMappings", index, "site", event.target.value)}/><input disabled={!editable} value={row.workshop || ""} onChange={(event) => setField("supplyMappings", index, "workshop", event.target.value)}/><input disabled={!editable} value={row.manager || ""} onChange={(event) => setField("supplyMappings", index, "manager", event.target.value)}/><input disabled={!editable} value={row.leader || ""} onChange={(event) => setField("supplyMappings", index, "leader", event.target.value)}/><select disabled={!editable} value={row.active ? "启用" : "停用"} onChange={(event) => setField("supplyMappings", index, "active", event.target.value === "启用")}><option>启用</option><option>停用</option></select></div>)}</div>;
  const renderEmployees = () => <div className="qmdp-admin-table"><div className="qmdp-admin-row head"><span>工号</span><span>姓名</span><span>部门</span><span>职位</span><span>企业微信 userid</span></div>{employees.map((row, index) => <div className="qmdp-admin-row" key={index}>{["id", "name", "dept", "role", "wecom"].map((field) => <input key={field} disabled={!editable} value={row[field] || ""} onChange={(event) => setField("employees", index, field, event.target.value)}/>)}</div>)}</div>;
  const renderLegacyProjectNameMapping = () => {
    const ruleCount = Object.values(projectMapping.rules?.fields || {}).reduce((sum, items) => sum + (items?.length || 0), 0);
    const mappedSourceNames = new Set((projectMapping.mappings || []).flatMap((item) => item.sourceNames || []));
    const activeMapping = (projectMapping.mappings || []).find((item) => item.id === mappingTargetId);
    return <>
      <Panel title="项目名称映射" subtitle="按六字段解析治具名称；仅人工确认的名称会合并为标准项目类别。" action={<div className="qmdp-project-rule-action"><button className="qmdp-secondary-btn" disabled={!editable || importingKind === "projectRules"} onClick={() => openMappingImport("projectRules")}><UploadSimple size={15}/>{importingKind === "projectRules" ? "解析中…" : "导入商务代码规则"}</button><small>{projectMapping.rules?.sourceName ? `${projectMapping.rules.sourceName} · ${ruleCount} 条规则` : "尚未导入规则表"}</small></div>}>
        <div className="qmdp-project-mapping-layout">
          <section className="qmdp-project-binding-card">
            <header><strong>原始治具名称绑定</strong><span>{sourceProjectNames.length} 个原始项目</span></header>
            <label>原始治具名称<select value={selectedProjectName} disabled={projectMappingLoading} onChange={(event) => setSelectedProjectName(event.target.value)}><option value="">选择 OQC 原始治具名称</option>{sourceProjectNames.map((name) => <option key={name} value={name}>{mappedSourceNames.has(name) ? "已映射 · " : ""}{name}</option>)}</select></label>
            <div className="qmdp-project-suggestion"><span>自动解析建议</span><strong>{selectedProjectSuggestion.suggestedName || "等待选择原始名称"}</strong><small>置信度：{selectedProjectSuggestion.confidence} · {projectMappingKeyText(selectedProjectSuggestion.key)}</small></div>
            <label>绑定方式<select value={mappingTargetId} disabled={!editable} onChange={(event) => { const id = event.target.value; setMappingTargetId(id); const item = (projectMapping.mappings || []).find((row) => row.id === id); setProjectMappingDraft(item ? { standardName: item.standardName || "", category: item.category || "", note: item.note || "" } : { standardName: selectedProjectSuggestion.suggestedName, category: "", note: "" }); }}><option value="new">新建标准项目类别</option>{(projectMapping.mappings || []).map((item) => <option key={item.id} value={item.id}>{item.standardName}{item.category ? ` · ${item.category}` : ""}</option>)}</select></label>
            {!activeMapping && <><label>标准项目名称<input disabled={!editable} value={projectMappingDraft.standardName} placeholder="例如：MFS W2 双工位治具" onChange={(event) => setProjectMappingDraft((current) => ({ ...current, standardName: event.target.value }))}/></label><label>项目类别<input disabled={!editable} value={projectMappingDraft.category} placeholder="例如：功能测试治具" onChange={(event) => setProjectMappingDraft((current) => ({ ...current, category: event.target.value }))}/></label><label>备注<input disabled={!editable} value={projectMappingDraft.note} placeholder="人工归类说明（可选）" onChange={(event) => setProjectMappingDraft((current) => ({ ...current, note: event.target.value }))}/></label></>}
            <button className="qmdp-primary-btn" disabled={!editable || !selectedProjectName} onClick={bindProjectName}><Plus size={15}/>确认绑定</button>
            {projectMappingStatus && <small className="qmdp-inline-status-text">{projectMappingStatus}</small>}
          </section>
          <section className="qmdp-project-rule-card"><header><strong>七字段归类主键</strong><span>用于生成候选，不自动合并</span></header>{projectNameRuleFields.map((field) => <div key={field.key}><span>{field.label}</span><b>{projectMapping.rules?.fields?.[field.key]?.length || 0} 条</b><small>{projectMapping.rules?.fields?.[field.key]?.slice(0, 5).map((item) => item.code).join(" · ") || "待导入"}</small></div>)}</section>
        </div>
      </Panel>
      <Panel title="已维护的标准项目类别" subtitle="删除类别后，其绑定的原始名称会自动恢复按原始治具名称独立统计。">
        {(projectMapping.mappings || []).length ? <div className="qmdp-project-mapping-table"><div className="head"><span>标准项目类别</span><span>归类主键</span><span>已绑定原始治具名称</span><span>操作</span></div>{(projectMapping.mappings || []).map((item) => <div key={item.id}><strong>{item.standardName}<small>{item.category || "未分类"}</small></strong><span title={projectMappingKeyText(item.key)}>{projectMappingKeyText(item.key)}</span><span>{(item.sourceNames || []).join("；")}</span><button className="qmdp-secondary-btn" disabled={!editable} onClick={() => removeProjectMapping(item.id)}><Trash size={15}/>删除</button></div>)}</div> : <div className="qmdp-empty compact">尚无人工确认映射。导入规则后，从左侧选择原始治具名称逐项绑定。</div>}
      </Panel>
    </>;
  };
  const renderProjectNameMapping = () => {
    const ruleCount = Object.values(projectMapping.rules?.fields || {}).reduce((sum, items) => sum + (items?.length || 0), 0);
    const overrideCount = (projectMapping.overrides || []).length;
    const rulesNeedRefresh = Boolean(projectMapping.rules?.sourceName) && ["customerProductCategory", "businessCategory", "productForm"].some((key) => !(projectMapping.rules?.fields?.[key] || []).length);
    return <>
      <Panel title="项目名称规则" subtitle="保留项目名称中可稳定识别的七个字段，用于 OQC 设备离散分析的分类统计。" action={<div className="qmdp-project-rule-action"><button className="qmdp-secondary-btn" disabled={!editable || importingKind === "projectRules"} onClick={() => openMappingImport("projectRules")}><UploadSimple size={15}/>{importingKind === "projectRules" ? "解析中…" : "导入商务代码规则"}</button><small>{projectMapping.rules?.sourceName ? `${projectMapping.rules.sourceName} · ${ruleCount} 条规则` : "尚未导入规则表"}</small></div>}>
        <div className="qmdp-project-rule-dimensions">{projectNameRuleFields.map((field) => <section key={field.key}><strong>{field.label}</strong><b>{projectMapping.rules?.fields?.[field.key]?.length || 0}</b><small>{projectMapping.rules?.fields?.[field.key]?.slice(0, 6).map((item) => item.code).join(" · ") || "待导入"}</small></section>)}</div>
        <div className="qmdp-note"><Database size={15}/>选择其中任一字段后，系统按字段值汇总机台数。无法从项目名称解析的记录会显示为“未识别”，不参与漏统或猜测归类。</div>
        {rulesNeedRefresh && <div className="qmdp-note"><Warning size={15}/>规则分类已升级为七个字段，请重新导入商务代码规则，以启用客户产品大类、业务类别和产品形态统计。</div>}
      </Panel>
      <Panel title="历史项目字段补充" subtitle="仅对自动解析失败或不完整的项目逐字段校正；保存后会直接进入对应的分类统计。">
        <div className="qmdp-project-override-layout"><label>原始治具名称<select value={selectedProjectName} disabled={projectMappingLoading} onChange={(event) => selectProjectForRules(event.target.value)}><option value="">选择 OQC 原始治具名称</option>{sourceProjectNames.map((name) => <option key={name} value={name}>{(projectMapping.overrides || []).some((item) => item.sourceName === name) ? "已校正 · " : ""}{name}</option>)}</select></label>
          <div className="qmdp-project-override-grid">{projectNameRuleFields.map((field) => <label key={field.key}>{field.label}<select disabled={!editable || !selectedProjectName} value={projectOverrideValues[field.key]?.code || ""} onChange={(event) => { const entry = (projectMapping.rules?.fields?.[field.key] || []).find((item) => item.code === event.target.value) || {}; setProjectOverrideValues((current) => ({ ...current, [field.key]: entry.code ? { code: entry.code, name: entry.name || "", label: entry.name && entry.name !== entry.code ? `${entry.code} · ${entry.name}` : entry.code } : {} })); }}><option value="">未识别 / 不适用</option>{(projectMapping.rules?.fields?.[field.key] || []).map((item) => <option key={item.code} value={item.code}>{item.name && item.name !== item.code ? `${item.code} · ${item.name}` : item.code}</option>)}</select></label>)}</div>
          <div className="qmdp-project-override-actions"><button className="qmdp-primary-btn" disabled={!editable || !selectedProjectName} onClick={saveProjectRuleOverride}><FloppyDisk size={15}/>保存字段校正</button><small>{overrideCount ? `已校正 ${overrideCount} 个历史项目名称` : "尚未保存人工校正"}</small>{projectMappingStatus && <small className="qmdp-inline-status-text">{projectMappingStatus}</small>}</div>
        </div>
      </Panel>
    </>;
  };
  const importActions = (kind, section) => <div style={{ display: "flex", gap: 8, alignItems: "center" }}><button className="qmdp-secondary-btn" disabled={!editable || importingKind === kind} onClick={() => openMappingImport(kind)}><UploadSimple size={15}/>{importingKind === kind ? "解析中…" : "导入 Excel"}</button><span style={{ color: "#8190a2", fontSize: 10 }}>{config.importMeta?.[kind]?.name ? `最近导入：${config.importMeta[kind].name}（${config.importMeta[kind].count} 条）` : `支持 ${kind === "org" ? "产品部 / 产总 / TPM / PM" : "厂区 / 工坊 / 交付经理 / 机长"} 表头`}</span></div>;
  const content = tab === "Agent配置" ? <Panel title="Agent配置 · 报告质量校验" subtitle="管理员配置 Agent 报告生成后的结构、数据、图表和闭环检查。"><div className="qmdp-admin-table"><div className="qmdp-admin-row head"><span>启用</span><span>规则</span><span>分组</span><span>级别</span></div>{qualityRules.map((rule) => <div className="qmdp-admin-row" key={rule.id}><input type="checkbox" checked={rule.enabled !== false} disabled={!editable} onChange={(event) => updateQualityRule(rule.id, { enabled: event.target.checked })}/><strong>{rule.label}</strong><span>{rule.group}</span><select value={rule.severity} disabled={!editable} onChange={(event) => updateQualityRule(rule.id, { severity: event.target.value })}><option value="block">阻断</option><option value="warn">警告</option><option value="info">提示</option></select></div>)}</div><div className="qmdp-note"><Database size={15}/>阻断项会标记报告质量校验失败；警告项允许查看报告但提示管理员；提示项只记录不阻断。</div><button className="qmdp-primary-btn" disabled={!editable} onClick={saveQualityRuleConfig}><FloppyDisk size={15}/>保存校验规则</button></Panel> : tab === "后台快照" ? <BackgroundSnapshotPage data={data} files={files} dateRange={dateRange} auth={auth} onEnsureAgentSources={onEnsureAgentSources}/> : tab === "研发项目映射" ? <DqaAgentProjectMappingPanel raw={dqaAgentRaw} editable={editable} onSave={onSaveDqaAgentRaw}/> : tab === "研发组织映射" ? <><Panel title="研发组织映射维护" subtitle="产品部、产总、TPM、PM 的责任关系" action={importActions("org", "orgMappings")}>{renderMapping()}<button className="qmdp-secondary-btn" disabled={!editable} onClick={() => addRow("orgMappings", { productDept: "新产品部", productionDirector: "", tpm: "", pm: "", active: true })}><Plus size={15}/>新增映射</button></Panel></> : tab === "供应链映射" ? <><Panel title="供应商/供应链人员映射" subtitle="厂区、工坊、交付经理与机长" action={importActions("supply", "supplyMappings")}>{renderSupply()}<button className="qmdp-secondary-btn" disabled={!editable} onClick={() => addRow("supplyMappings", { site: "深圳", workshop: "", manager: "", leader: "", active: true })}><Plus size={15}/>新增映射</button></Panel></> : tab === "项目名称映射" ? renderProjectNameMapping() : tab === "员工信息" ? <><Panel title="员工信息 / 企业微信 userid">{renderEmployees()}<button className="qmdp-secondary-btn" disabled={!editable} onClick={() => addRow("employees", { id: "", name: "", dept: "", role: "", wecom: "" })}><Plus size={15}/>新增员工</button></Panel></> : tab === "评分权重" ? <Panel title="质量风险评分权重" subtitle="权重总和应为 100"><div className="qmdp-weight-grid">{[["ecn", "ECN个人占比"], ["issue", "研发问题数量"], ["severity", "高严重度问题"], ["review", "设计评审问题占比"], ["nonBom", "非BOM加工件比例"], ["open", "未关闭问题数量"]].map(([key, label]) => <label key={key}><span>{label}</span><input type="number" min="0" max="100" value={config.weights?.[key] ?? 0} disabled={!editable} onChange={(event) => setConfig((current) => ({ ...current, weights: { ...current.weights, [key]: Number(event.target.value) } }))}/></label>)}</div><div className="qmdp-weight-total">当前权重合计：<strong>{Object.values(config.weights || {}).reduce((sum, value) => sum + Number(value || 0), 0)}%</strong><button className="qmdp-primary-btn" disabled={!editable} onClick={() => saveMessage("质量评分权重已保存")}>保存权重</button></div></Panel> : tab === "企业微信" ? <Panel title="企业微信应用配置" subtitle="用于报告发送，密钥只保存在本机状态"><div className="qmdp-form-grid">{[["corpId", "CorpId"], ["agentId", "AgentId"], ["secret", "Secret"]].map(([key, label]) => <label key={key}><span>{label}</span><input type={key === "secret" ? "password" : "text"} value={config.wecom?.[key] || ""} disabled={!editable} onChange={(event) => setConfig((current) => ({ ...current, wecom: { ...current.wecom, [key]: event.target.value } }))}/></label>)}</div><button className="qmdp-primary-btn" disabled={!editable} onClick={() => saveMessage("企业微信配置已保存")}>保存配置</button></Panel> : <Panel title="操作日志" subtitle="记录映射、权重与发送配置的变更"><div className="qmdp-log-list">{(config.logs || []).map((item) => <div key={item.id}><span>{formatSyncDateTime(item.at)}</span><strong>{item.message}</strong></div>)}{!(config.logs || []).length && <div className="qmdp-empty compact">暂无操作日志。</div>}</div></Panel>;
  return <div className="qmdp-page"><input ref={mappingInputRef} type="file" accept=".xlsx,.xls,.xlsm" hidden onChange={(event) => importMapping(event, mappingInputRef.current?.getAttribute("data-kind") || "supply")}/><QmdpPageHeader icon={GearSix} eyebrow="系统管理 / Administration" title={tab} description={editable ? "副管理员和主管理员可维护映射、权重与发送配置。" : "当前账号仅可查看系统配置。"} action={status && <span className="qmdp-inline-status"><CheckCircle size={15}/>{status}</span>}/><div className="qmdp-admin-tabs">{qmdpMenuGroups.find((group) => group.label === "系统管理").children.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>{content}<div className="qmdp-note"><Database size={15}/>系统管理数据与现有数据导入、IPQC过程管控、研发质量分析相互隔离。</div></div>;
}

function ReportHistoryComparePage() {
  const [reports, setReports] = useState([]);
  const [leftKey, setLeftKey] = useState("");
  const [rightKey, setRightKey] = useState("");
  const [contents, setContents] = useState({});
  const [loading, setLoading] = useState(false);
  const [qualityRules, setQualityRules] = useState(DEFAULT_REPORT_QUALITY_RULES);
  const compareRef = useRef(null);
  useEffect(() => {
    let active = true;
    Promise.all([loadAgentReports().catch(() => ({ reports: [] })), loadLocalAgentReports().catch(() => [])]).then(([server, local]) => {
      if (!active) return;
      const merged = [...(Array.isArray(local) ? local.map((item) => ({ ...item, localOnly: true })) : []), ...(Array.isArray(server?.reports) ? server.reports : [])];
      const unique = [...new Map(merged.filter((item) => item?.fileName).map((item) => [item.fileName, item])).values()].sort((a, b) => String(b.updatedAt || b.savedAt || "").localeCompare(String(a.updatedAt || a.savedAt || "")));
      setReports(unique); setLeftKey(unique[0]?.fileName || ""); setRightKey(unique[1]?.fileName || "");
    });
    return () => { active = false; };
  }, []);
  const loadContent = async (key) => {
    if (!key || contents[key]) return;
    setLoading(true);
    try { const item = reports.find((report) => report.fileName === key); const value = item?.localOnly ? await loadLocalAgentReport(key) : await loadAgentReport(key); setContents((current) => ({ ...current, [key]: String(value?.content || "") })); } finally { setLoading(false); }
  };
  useEffect(() => { loadContent(leftKey); loadContent(rightKey); }, [leftKey, rightKey, reports]);
  useEffect(() => { loadReportQualityRules().then((value) => { if (Array.isArray(value?.rules)) setQualityRules(value.rules); }).catch(() => {}); }, []);
  const left = contents[leftKey] || ""; const right = contents[rightKey] || "";
  const metricLines = (content) => String(content).split(/\r?\n/).filter((line) => /\d/.test(line) && /[:：|]/.test(line)).slice(0, 24);
  const parseMetrics = (content) => metricLines(content).map((line) => { const values = [...line.matchAll(/-?\d+(?:\.\d+)?%?/g)].map((match) => match[0]); return { label: line.replace(/^[#*\s|\-]+|[:：|].*$/g, "").trim() || "指标", value: values[0] || "-", line }; }).filter((item) => item.label && item.value !== "-").slice(0, 12);
  const extractSection = (content, words) => { const lines = String(content).split(/\r?\n/); const start = lines.findIndex((line) => words.some((word) => line.includes(word))); if (start < 0) return []; return lines.slice(start + 1, start + 9).map((line) => line.trim()).filter((line) => line && !/^#{1,6}\s/.test(line)); };
  const leftMetrics = metricLines(left); const rightSet = new Set(metricLines(right));
  const added = metricLines(right).filter((line) => !new Set(leftMetrics).has(line)); const removed = leftMetrics.filter((line) => !rightSet.has(line));
  const metricA = parseMetrics(left); const metricB = parseMetrics(right);
  const riskA = extractSection(left, ["风险", "根因"]); const riskB = extractSection(right, ["风险", "根因"]);
  const actionA = extractSection(left, ["改善措施", "改善行动", "行动台账"]); const actionB = extractSection(right, ["改善措施", "改善行动", "行动台账"]);
  const qualityA = validateReportQuality(left, { rules: qualityRules, hasSnapshot: Boolean(reports.find((item) => item.fileName === leftKey)?.localOnly === false), hasVisuals: /图表|Pareto|柱形图|折线图/.test(left) });
  const qualityB = validateReportQuality(right, { rules: qualityRules, hasSnapshot: Boolean(reports.find((item) => item.fileName === rightKey)?.localOnly === false), hasVisuals: /图表|Pareto|柱形图|折线图/.test(right) });
  const qualityDelta = qualityB.failed.filter((item) => !qualityA.failed.some((before) => before.id === item.id));
  const reportLabel = (key) => reports.find((item) => item.fileName === key)?.fileName || "未选择";
  const exportName = `QMS-Agent报告历史对比-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}`;
  const mdList = (items) => items.length ? items.map((item) => `- ${item}`).join("\n") : "- 无";
  const markdown = `# 报告历史对比\n\n- 报告 A：${reportLabel(leftKey)}\n- 报告 B：${reportLabel(rightKey)}\n\n## 核心指标对比\n\n${[...new Map([...metricA, ...metricB].map((item) => [item.label, item])).values()].slice(0, 12).map((item) => `| ${item.label} | ${metricA.find((row) => row.label === item.label)?.value || "-"} | ${metricB.find((row) => row.label === item.label)?.value || "-"} |`).join("\n")}\n\n## 风险变化\n${mdList(riskB)}\n\n## 改善措施变化\n${mdList(actionB)}\n\n## 新增内容\n${mdList(added)}\n\n## 减少内容\n${mdList(removed)}\n`;
  const escapeHtml = (value) => String(value).replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
  const html = `<article style="font-family:Arial,sans-serif;max-width:980px;margin:0 auto;padding:32px;color:#172033"><h1>报告历史对比</h1><p>报告 A：${escapeHtml(reportLabel(leftKey))}<br>报告 B：${escapeHtml(reportLabel(rightKey))}</p><h2>核心指标对比</h2><table style="border-collapse:collapse;width:100%"><thead><tr><th style="text-align:left;border-bottom:1px solid #ccd">指标</th><th style="text-align:left;border-bottom:1px solid #ccd">A</th><th style="text-align:left;border-bottom:1px solid #ccd">B</th></tr></thead><tbody>${[...new Map([...metricA, ...metricB].map((item) => [item.label, item])).values()].slice(0, 12).map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(metricA.find((row) => row.label === item.label)?.value || "-")}</td><td>${escapeHtml(metricB.find((row) => row.label === item.label)?.value || "-")}</td></tr>`).join("")}</tbody></table><h2>风险变化</h2><ul>${(riskB.length ? riskB : ["无"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h2>改善措施变化</h2><ul>${(actionB.length ? actionB : ["无"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h2>新增内容</h2><ul>${(added.length ? added : ["无"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h2>减少内容</h2><ul>${(removed.length ? removed : ["无"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>`;
  const downloadFile = (content, name, type) => { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const exportPdf = async () => { if (!compareRef.current) return; try { const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]); const canvas = await html2canvas(compareRef.current, { scale: 1.5, backgroundColor: "#ffffff" }); const pdf = new jsPDF("p", "mm", "a4"); const width = 190; const height = canvas.height * width / canvas.width; let offset = 0; while (offset < height) { if (offset) pdf.addPage(); pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 10, 10 - offset, width, height); offset += 277; } pdf.save(`${exportName}.pdf`); } catch (error) { window.print(); } };
  const ready = Boolean(left && right && !loading);
  return <div className="qmdp-page report-history-compare-page"><QmdpPageHeader icon={ArrowsClockwise} eyebrow="Agent工具 / Comparison" title="报告历史对比" description="选择两份已保存报告，对比指标、风险和改善内容的变化。" action={<div className="qmdp-header-actions"><button className="qmdp-secondary-btn" disabled={!ready} onClick={() => downloadFile(markdown, `${exportName}.md`, "text/markdown;charset=utf-8")}>导出 Markdown</button><button className="qmdp-secondary-btn" disabled={!ready} onClick={() => downloadFile(`<!doctype html><html><head><meta charset=\"utf-8\"><title>报告历史对比</title></head><body>${html}</body></html>`, `${exportName}.html`, "text/html;charset=utf-8")}>导出 HTML</button><button className="qmdp-primary-btn" disabled={!ready} onClick={exportPdf}>导出 PDF</button></div>}/><section className="qmdp-card report-compare-controls"><label>报告 A<select value={leftKey} onChange={(event) => setLeftKey(event.target.value)}><option value="">请选择报告</option>{reports.map((item) => <option key={`a-${item.fileName}`} value={item.fileName}>{item.fileName}</option>)}</select></label><label>报告 B<select value={rightKey} onChange={(event) => setRightKey(event.target.value)}><option value="">请选择报告</option>{reports.map((item) => <option key={`b-${item.fileName}`} value={item.fileName}>{item.fileName}</option>)}</select></label><span>{loading ? "正在读取报告内容…" : `报告库共 ${reports.length} 份`}</span></section>{left && right ? <div ref={compareRef}><section className="qmdp-card report-compare-summary"><h3>版本信息</h3><div><span>A：{reportLabel(leftKey)}</span><span>B：{reportLabel(rightKey)}</span></div></section><section className="qmdp-card report-compare-metrics"><header><h3>核心指标对比</h3><span>当前版本以报告 B 为准</span></header><div className="report-compare-metric-grid">{[...new Map([...metricA, ...metricB].map((item) => [item.label, item])).values()].slice(0, 12).map((item) => <article key={item.label}><small>{item.label}</small><div><b>{metricA.find((row) => row.label === item.label)?.value || "-"}</b><i>→</i><strong>{metricB.find((row) => row.label === item.label)?.value || "-"}</strong></div></article>)}</div></section><section className="qmdp-card report-compare-structured"><div><h3>风险变化</h3><p className="compare-subtitle">报告 B 新增或保留的风险重点</p>{riskB.length ? riskB.map((line, index) => <p key={`rb-${index}`} className={riskA.includes(line) ? "" : "diff-added"}>{line}</p>) : <p>未识别到风险章节</p>}</div><div><h3>改善措施变化</h3><p className="compare-subtitle">报告 B 新增或保留的改善动作</p>{actionB.length ? actionB.map((line, index) => <p key={`ab-${index}`} className={actionA.includes(line) ? "" : "diff-added"}>{line}</p>) : <p>未识别到改善措施章节</p>}</div></section><section className="qmdp-card report-compare-quality"><header><h3>报告质量校验</h3><span className={`quality-status-${qualityB.status}`}>报告 B：{qualityB.status === "ok" ? "通过" : qualityB.status === "warning" ? "有警告" : "需修正"}</span></header><div className="report-quality-compare-grid"><div><strong>报告 A</strong>{qualityA.failed.length ? qualityA.failed.map((rule) => <p key={`qa-${rule.id}`} className={`quality-rule-${rule.severity}`}>未通过：{rule.label}<small>{reportQualityAdvice(rule)}</small></p>) : <p className="quality-rule-ok">全部规则通过</p>}</div><div><strong>报告 B</strong>{qualityB.failed.length ? qualityB.failed.map((rule) => <p key={`qb-${rule.id}`} className={`quality-rule-${rule.severity}`}>{qualityDelta.some((item) => item.id === rule.id) ? "新增问题：" : "未通过："}{rule.label}<small>{reportQualityAdvice(rule)}</small></p>) : <p className="quality-rule-ok">全部规则通过</p>}</div></div></section><section className="qmdp-card report-compare-diff"><header><h3>内容变化</h3><span>以报告 B 相对报告 A 展示</span></header><div className="report-compare-columns"><article><strong>新增内容</strong>{added.length ? added.map((line, index) => <p className="diff-added" key={`a-${index}`}>{line}</p>) : <p>无明显新增行</p>}</article><article><strong>减少内容</strong>{removed.length ? removed.map((line, index) => <p className="diff-removed" key={`r-${index}`}>{line}</p>) : <p>无明显减少行</p>}</article></div></section></div> : <div className="qmdp-empty">请选择两份报告开始对比。</div>}</div>;
}

function ExecutiveDashboard({ data, files, dqaEngineerSupplement, dqaAgentRaw, onLoadDqaAgentRaw, onSaveDqaAgentRaw, onImport, onDeleteSource, onSourcesChanged, onImportDqaEngineerSupplement, onClearDqaEngineerSupplement, onDeleteDqaEngineerSupplementFile, onImportDqaAgentRaw, onClearDqaAgentRaw, onDeleteDqaAgentRawFile, onEnsureAgentSources, onClearAgentSources, view, onViewChange, dateRange, teamDefaultRange, lastServerSavedAt, serverSyncStatus, onDateRange, onRefreshDate, dateRefreshStatus, refreshProgress, fontSize, onFontSize, analysisKey, labelControlsVisible, onToggleLabelControls, uiTheme, onThemeChange, sidebarCollapsed, onToggleSidebar, auth, permissions, onPermissionsChanged }) {
  const [active, setActive] = useState(() => examTokenFromUrl() ? "知识考试" : qualityAgentMenuFromUrl() || "总览");
  const [sidebarWidth, setSidebarWidth] = useState(() => clampSidebarWidth(localStorage.getItem("qms-sidebar-width") || sidebarWidthLimits.default));
  const moduleView = ["IQC", "IPQC", "OQC", "DQA", "QMS"].includes(active) ? active : null;
  const qmdpKnowledgeView = ["知识库", "题库管理", "知识考试", "后台知识管理"].includes(active);
  const qmdpReportView = ["IPQC操作报告", "机长报告", "交付经理报告", "供应链经理报告", "研发工程师报告", "PM报告", "TPM报告", "产总报告", "董事长报告", "报告任务中心"].includes(active);
  const qmdpSystemView = ["研发组织映射", "供应链映射", "项目名称映射", "研发项目映射", "后台快照", "Agent配置", "员工信息", "评分权重", "企业微信", "操作日志"].includes(active);
  const qualityAgentView = qualityAgentMenuItems.includes(active);
  const agentRoleReportView = agentRoleMenuItems.includes(active);
  const agentExamStatsView = agentUtilityMenuItems.includes(active);
  const qmdpView = qmdpKnowledgeView || qmdpReportView || qmdpSystemView || qualityAgentView || agentRoleReportView || agentExamStatsView;
  const activeMenuGroup = qmdpMenuGroups.find((group) => group.children.includes(active));
  const menuDenied = activeMenuGroup ? !canUseMenu(auth, permissions, activeMenuGroup.label, active) : ["AI分析", "AI接口", "权限设置"].includes(active) && !canUseMenu(auth, permissions, active);
  const allowImport = canUseFeature(auth, permissions, "dataImport");
  const allowWorkspace = canUseFeature(auth, permissions, "workspace");
  const allowAnnotationEdit = canUseFeature(auth, permissions, "annotationEdit");
  const allowAnnotationView = canUseFeature(auth, permissions, "annotationView");
  const allowExport = canUseFeature(auth, permissions, "exportReport");
  const allowTemporaryRefresh = canUseFeature(auth, permissions, "dateTemporaryRefresh");
  const agentFiles = useMemo(() => {
    const source = buildDqaEngineerSupplementSource(dqaEngineerSupplement, dateRange);
    return source ? [...files, source] : files;
  }, [files, dqaEngineerSupplement, dateRange]);
  useEffect(() => {
    if (menuDenied || (active === "数据导入" && !allowImport) || (active === "AI分析" && !canUseFeature(auth, permissions, "aiAnalysis")) || ([...qualityAgentMenuItems, ...agentRoleMenuItems, ...agentUtilityMenuItems].includes(active) && !canUseFeature(auth, permissions, "qualityAgent")) || (active === "AI接口" && !canUseFeature(auth, permissions, "aiInterface")) || (active === "权限设置" && !auth?.isAdmin)) setActive("总览");
  }, [active, allowImport, auth, menuDenied, permissions]);
  useEffect(() => {
    if (!qualityAgentView && !agentRoleReportView) onClearAgentSources?.();
  }, [active, qualityAgentView, agentRoleReportView, onClearAgentSources]);
  const changeSidebarWidth = (value) => setSidebarWidth((current) => { const next = clampSidebarWidth(value); if (next !== current) localStorage.setItem("qms-sidebar-width", String(next)); return next; });
  const shellStyle = { "--sidebar-width": `${sidebarCollapsed ? 70 : sidebarWidth}px` };
  return <div className={`executive-shell theme-${uiTheme} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${active === "权限设置" ? "permission-active" : ""}`} style={shellStyle}>
    <ExecutiveSidebar active={active} setActive={setActive} uiTheme={uiTheme} onThemeChange={onThemeChange} collapsed={sidebarCollapsed} onToggleCollapsed={onToggleSidebar} permissions={permissions} auth={auth} width={sidebarWidth} onWidthChange={changeSidebarWidth} />
    <main className="executive-main">
      <header className="executive-topbar">
        <div><h1>{moduleView ? `${moduleView} 专题分析` : qmdpView ? active : active === "AI分析" ? "AI质量经营分析" : active === "AI接口" ? "AI接口配置" : active === "数据导入" ? "数据源管理" : "经营驾驶舱"}</h1><p>{moduleView ? "从原始数据下钻到TOP问题与责任对象" : qmdpKnowledgeView ? "知识文件、题库与考试" : qmdpReportView ? "按角色和管理范围生成质量报告" : qualityAgentView ? "独立的质量分析 Agent 工作流，不改变现有统计和报告" : qmdpSystemView ? "组织、人员、评分与发送配置" : active === "AI分析" ? "展示 generate-quality-review-report 正式审核版结论" : active === "AI接口" ? "配置本机第三方模型网关并验证调用" : "全局质量运营总览"}</p></div>
        <div className="top-actions"><ServerSyncBadge value={serverSyncStatus}/><Switcher view={view} onChange={onViewChange} canWorkspace={allowWorkspace} />{allowAnnotationEdit && <AnnotationEditButton defaultModule={moduleView || "\u603b\u89c8"} />}{allowAnnotationView && <AnnotationViewButton />}{allowExport && <ExportReportButton />}<button className={`label-controls-toggle ${labelControlsVisible ? "active" : ""}`} onClick={onToggleLabelControls}>{labelControlsVisible ? "隐藏数值设置" : "显示数值设置"}</button>{allowImport && <button className="import-btn" onClick={() => onImport(null)}><UploadSimple size={17} />导入数据</button>}</div>
      </header>
      {!qmdpView && <DateRangeFilter value={dateRange} teamDefaultRange={teamDefaultRange} lastServerSavedAt={lastServerSavedAt} onChange={onDateRange} onRefresh={onRefreshDate} refreshStatus={dateRefreshStatus} refreshProgress={refreshProgress} canRefresh={allowTemporaryRefresh} fontSize={fontSize} onFontSize={onFontSize}/>}
      <PageErrorBoundary pageKey={active} onRecover={() => setActive("总览")}>
      {active === "权限设置" && auth?.isAdmin ? <PermissionSettingsPage auth={auth} permissions={permissions} onPermissionsChanged={onPermissionsChanged}/> : qmdpKnowledgeView ? <KnowledgeManagementPage active={active} qualitySources={agentFiles} onEnsureAgentSources={onEnsureAgentSources} auth={auth}/> : qmdpReportView ? <QualityReportsPage active={active} data={data} files={files} dateRange={dateRange} onRoleChange={setActive}/> : qualityAgentView && canUseFeature(auth, permissions, "qualityAgent") ? <Suspense fallback={<div className="qmdp-empty">正在加载质量分析 Agent…</div>}><QualityAgentPage key={active} data={data} files={files} dateRange={dateRange} module={qualityAgentMenuModules[active]} onEnsureAgentSources={onEnsureAgentSources} canStart={canUseFeature(auth, permissions, "qualityAgentStart")} canSaveToServer={auth?.isAdmin === true}/></Suspense> : agentRoleReportView && canUseFeature(auth, permissions, "qualityAgent") ? <Suspense fallback={<div className="qmdp-empty">正在加载角色报告…</div>}><AgentRoleReportPage key={active} initialRole={agentRoleMenuRoles[active]} data={data} files={agentFiles} dateRange={dateRange} onEnsureAgentSources={onEnsureAgentSources} canGenerate={canUseFeature(auth, permissions, "agentRoleReportGenerate")} canSaveToServer={auth?.isAdmin === true}/></Suspense> : active === "报告历史对比" && canUseFeature(auth, permissions, "qualityAgent") ? <ReportHistoryComparePage/> : agentExamStatsView && canUseFeature(auth, permissions, "qualityAgent") ? <Suspense fallback={<div className="qmdp-empty">正在加载知识考试…</div>}><AgentExamStatsPage/></Suspense> : qmdpSystemView ? <SystemManagementPage key={active} active={active} data={data} auth={auth} files={agentFiles} dateRange={dateRange} onEnsureAgentSources={onEnsureAgentSources} dqaAgentRaw={dqaAgentRaw} onLoadDqaAgentRaw={onLoadDqaAgentRaw} onSaveDqaAgentRaw={onSaveDqaAgentRaw}/> : active === "AI接口" && canUseFeature(auth, permissions, "aiInterface") ? <AiInterfacePage canSaveToServer={auth?.isAdmin === true}/> : active === "数据导入" && allowImport ? <DataSourcePage files={files} onImportModule={onImport} onDelete={onDeleteSource} onSourcesChanged={onSourcesChanged} dqaEngineerSupplement={dqaEngineerSupplement} onImportDqaEngineerSupplement={onImportDqaEngineerSupplement} onClearDqaEngineerSupplement={onClearDqaEngineerSupplement} onDeleteDqaEngineerSupplementFile={onDeleteDqaEngineerSupplementFile} dqaAgentRaw={dqaAgentRaw} onLoadDqaAgentRaw={onLoadDqaAgentRaw} onImportDqaAgentRaw={onImportDqaAgentRaw} onClearDqaAgentRaw={onClearDqaAgentRaw} onDeleteDqaAgentRawFile={onDeleteDqaAgentRawFile}/> : active === "AI分析" && canUseFeature(auth, permissions, "aiAnalysis") ? <AiAnalysisPage data={data} dateRange={dateRange} analysisKey={analysisKey} canSaveToServer={auth?.isAdmin === true}/> : moduleView ? <ModuleDetail key={`${moduleView}-${analysisKey}`} module={moduleView} data={data} files={files} /> : <>
        <OverviewKpiCards data={data}/>
        <div className="dashboard-grid">
          <MainSupplierOverview data={data}/>
          <Panel title="TOP 风险供应商（人工选择）" subtitle="不再由系统按良率自动生成；选择结果保存在当前电脑" className="span-12"><ManualRiskSuppliers data={data}/></Panel>
          <Panel title="IPQC 工坊风险 TOP5" subtitle="默认展示异常密度最高的5个工坊，其余工坊可展开查看" className="span-12"><IpqcWorkshopRisk data={data}/></Panel>
          <Panel title="OQC 出货评分总览" subtitle="基于月度汇总源数据，按当前日期区间同步更新" className="span-7"><OqcOverviewScore data={data}/></Panel>
          <Panel title="DQA 阶段质量问题分布" subtitle="按当前日期区间同步更新" className="span-5"><StackedStage rows={data.dqa.divisions} height={252} /></Panel>
        </div>
      </>}
      </PageErrorBoundary>
      <footer className="page-foot">数据更新时间：{data.updatedAt}<span>{files.length ? `已导入 ${files.length} 个文件` : "当前展示内置半年报样例数据"}</span></footer>
    </main>
  </div>;
}

function WorkspaceTop({ view, onViewChange, uiTheme, onThemeChange, auth, permissions }) {
  const allowAnnotationEdit = canUseFeature(auth, permissions, "annotationEdit");
  const allowAnnotationView = canUseFeature(auth, permissions, "annotationView");
  const allowExport = canUseFeature(auth, permissions, "exportReport");
  return <header className="workspace-top summary-workspace-top">
    <div className="workspace-brand"><ShieldCheck size={24} weight="fill" /><strong>总结报告</strong></div>
    <div className="workspace-actions"><Switcher view={view} onChange={onViewChange} canWorkspace />{allowAnnotationEdit && <AnnotationEditButton defaultModule="\u8d28\u91cf\u5de5\u4f5c\u53f0" />}{allowAnnotationView && <AnnotationViewButton />}{allowExport && <ExportReportButton />}<ThemeToggle value={uiTheme} onChange={onThemeChange}/></div>
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

function WorkspaceDashboard({ data, files, onImport, view, onViewChange, uiTheme, onThemeChange, auth, permissions }) {
  return <div className={`workspace-shell summary-report-shell annotation-only-workspace theme-${uiTheme}`}>
    <WorkspaceTop onImport={onImport} view={view} onViewChange={onViewChange} uiTheme={uiTheme} onThemeChange={onThemeChange} auth={auth} permissions={permissions} />
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

function WorkshopCompare({ rows, axisKey = "ipqc-workshop-compare-axis-v1", nameLabel = "工坊", axisDefaults = { min: 0, max: 80 } }) {
  const [selected, setSelected] = useState(() => rows.map((row) => row.name));
  const [sort, setSort] = useState({ key: "y2026Rate", direction: "desc" });
  const axis = useMachinedAxisRange(axisKey, axisDefaults);
  useEffect(() => setSelected(rows.map((row) => row.name)), [rows]);
  const visibleRows = useMemo(() => rows.filter((row) => selected.includes(row.name))
    .map((row) => ({
      ...row,
      y2025Qty: Number(row.y2025Qty || 0), y2025Bad: Number(row.y2025Bad || 0), y2025Rate: Number(row.y2025Rate || 0),
      y2026Qty: Number(row.y2026Qty || 0), y2026Bad: Number(row.y2026Bad || 0), y2026Rate: Number(row.y2026Rate || 0),
      delta: Number(row.y2026Rate || 0) - Number(row.y2025Rate || 0),
    }))
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
      <div className="workshop-row workshop-head">{workshopColumns.map(([key, label]) => <button key={key} onClick={() => changeSort(key)}>{key === "name" ? nameLabel : label}<span>{sort.key === key ? sort.direction === "asc" ? "▲" : "▼" : "↕"}</span></button>)}</div>
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

function IpqcOutsourcingAnalysis({ data, site }) {
  const [open, setOpen] = useState(false);
  const detail = data.ipqc.outsourcingBySite?.[site] || { summary: {}, compare: [], workshops: [] };
  const summary = detail.summary || {};
  const rate25 = Number(summary.y2025Rate || 0);
  const rate26 = Number(summary.y2026Rate || 0);
  const hasData = detail.compare?.length || detail.workshops?.length;
  const initialAxisMax = (rows, fallback = 30) => {
    const maxRate = Math.max(0, ...rows.flatMap((row) => [Number(row.y2025Rate || 0), Number(row.y2026Rate || 0)]));
    return Math.max(fallback, Math.ceil(maxRate * 1.15 / 10) * 10);
  };
  const compareAxisDefaults = { min: 0, max: initialAxisMax(detail.compare) };
  const workshopAxisDefaults = { min: 0, max: initialAxisMax(detail.workshops) };
  return <section className="ipqc-outsourcing-analysis">
    <button className="ipqc-outsourcing-toggle" onClick={() => setOpen((current) => !current)}>
      <span><b>2.6</b><strong>外包工坊专项分析</strong><em>外包数据已纳入原工坊总览；此处单独识别外包风险，不改变既有统计口径</em></span>
      <span className="ipqc-outsourcing-toggle-action">{open ? "收起" : "展开"}<CaretDown size={16} className={open ? "rotate" : ""}/></span>
    </button>
    {open && <div className="ipqc-outsourcing-body">
      {!hasData ? <div className="source-empty">当前日期范围内未识别到“产品工坊”字段含“外包”的IPQC记录。</div> : <>
        <div className="iqc-summary-strip ipqc-summary ipqc-outsourcing-summary">
          <div><span>2025外包送检数</span><strong>{Number(summary.y2025Qty || 0).toLocaleString()}</strong></div>
          <div><span>2026外包送检数</span><strong>{Number(summary.y2026Qty || 0).toLocaleString()}</strong></div>
          <div><span>2025外包问题数量</span><strong>{Number(summary.y2025Bad || 0).toLocaleString()}</strong></div>
          <div><span>2026外包问题数量</span><strong>{Number(summary.y2026Bad || 0).toLocaleString()}</strong></div>
          <div><span>外包异常密度同比</span><strong className={rate26 <= rate25 ? "green" : "red"}>{rate25}% → {rate26}%</strong></div>
        </div>
        <div className="ipqc-outsourcing-insight"><strong>口径说明</strong><span>{site === "全公司" ? "图表按“厂区·工坊（外包）”展示，避免深圳、杭州同名工坊被合并。" : `${site}外包工坊按原始工坊拆分展示。`} 外包与自制的异常密度均按“问题数量÷送检数”计算。</span></div>
        <div className="iqc-analysis-grid ipqc-outsourcing-grid">
          <AxisControlledPanel title="2.6.1 外包 vs 自制异常密度" subtitle={`${site} · 柱形为送检数/问题数量，折线为异常密度`} axisKey={`ipqc-outsourcing-${site}-compare-axis-v1`} defaults={compareAxisDefaults}>
            {(axis) => <QuantityRateCombo rows={detail.compare} labelKey="name" rateLabel="异常密度" qtyLabel="送检数/问题数量" height={370} rateAxisOverride={axis.effective} hideRateAxisControl/>}
          </AxisControlledPanel>
          <Panel title="2.6.2 外包工坊质量表现" subtitle="仅统计原始“产品工坊”字段中包含“外包”的记录；可勾选、排序和调整比例轴">
            <WorkshopCompare rows={detail.workshops} axisKey={`ipqc-outsourcing-${site}-workshop-axis-v1`} nameLabel="外包工坊" axisDefaults={workshopAxisDefaults}/>
          </Panel>
        </div>
      </>}
    </div>}
  </section>;
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
    <IpqcOutsourcingAnalysis data={data} site={site}/>
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

const oqcDispersionNumber = (value, digits = 0) => Number(value || 0).toLocaleString("zh-CN", {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});

function OqcDispersionMetricCard({ label, value, unit = "", baseline, detail }) {
  return <div className="oqc-dispersion-kpi">
    <span>{label}</span>
    <strong>{value}<small>{unit}</small></strong>
    <div><em>2025：{baseline}{unit}</em>{detail && <b>{detail}</b>}</div>
  </div>;
}

function OqcEquipmentDispersionAnalysis({ data, dispersionOverride }) {
  const dispersion = dispersionOverride || data.oqc.equipmentDispersion;
  const [scopeKey, setScopeKey] = useState("overall");
  if (!dispersion?.scopes?.length) return <div className="summary-note oqc-dispersion-empty"><strong>待导入出货明细</strong><p>请导入包含“治具名称、机台分类、机台数量”的 2025、2026 出货汇总文件，生成设备离散分析。</p></div>;
  const scope = dispersion.scopes.find((item) => item.key === scopeKey) || dispersion.scopes[0];
  const y2025 = scope.y2025;
  const y2026 = scope.y2026;
  const percentageDelta = (value) => `${value >= 0 ? "较2025 +" : "较2025 "}${Math.abs(value).toFixed(1)}pp`;
  const countDelta = (value) => `${value >= 0 ? "较2025 +" : "较2025 "}${Math.abs(value).toLocaleString()}个`;
  const quantityDistributionRows = [...new Set([
    ...(y2025.quantityDistribution || []).map((item) => item.quantity),
    ...(y2026.quantityDistribution || []).map((item) => item.quantity),
  ])].sort((a, b) => a - b).map((quantity) => ({
    name: `${quantity}台`,
    y2025Count: y2025.quantityDistribution?.find((item) => item.quantity === quantity)?.projects || 0,
    y2026Count: y2026.quantityDistribution?.find((item) => item.quantity === quantity)?.projects || 0,
  }));
  const quantityRangeRows = [
    { name: "1台", match: (quantity) => quantity === 1 },
    { name: "2-3台", match: (quantity) => quantity >= 2 && quantity <= 3 },
    { name: "4-10台", match: (quantity) => quantity >= 4 && quantity <= 10 },
    { name: "10台以上", match: (quantity) => quantity > 10 },
  ].map((range) => ({
    name: range.name,
    y2025Count: y2025.projectRows.filter((row) => range.match(row.quantity)).length,
    y2026Count: y2026.projectRows.filter((row) => range.match(row.quantity)).length,
  }));
  const allScopeLabels = dispersion.scopes.map((item) => item.name);
  const trendSignals = [
    y2026.dispersionIndex > y2025.dispersionIndex ? "离散指数上升" : y2026.dispersionIndex < y2025.dispersionIndex ? "离散指数下降" : "离散指数持平",
    y2026.singleProjectShare > y2025.singleProjectShare ? "单台项目占比上升" : y2026.singleProjectShare < y2025.singleProjectShare ? "单台项目占比下降" : "单台项目占比持平",
    y2026.avgMachinesPerProject < y2025.avgMachinesPerProject ? "平均单项目台数下降" : y2026.avgMachinesPerProject > y2025.avgMachinesPerProject ? "平均单项目台数上升" : "平均单项目台数持平",
  ];
  return <div className="oqc-dispersion-analysis">
    <div className="oqc-section-heading oqc-dispersion-heading">
      <span className="section-number">3.E</span>
      <div><h2>设备离散分析 · 出货明细</h2><p>以“治具名称”为项目名，按机台数量汇总；仅项目名称完全一致才视作同一项目。</p></div>
      <AppliedPeriodTag data={data}/>
    </div>
    <div className="oqc-dispersion-scope-summary">
      <div><strong>分析样本</strong><span>{dispersion.sourceRecordCount.toLocaleString()} 条有效评分出货明细</span></div>
      <div><strong>识别目标</strong><span>定位低批量、项目分散带来的非标化信号</span></div>
    </div>
    <div className="oqc-dispersion-scope-tabs">
      <div className="site-tabs" role="tablist" aria-label="设备分类范围">
        {dispersion.scopes.map((item) => <button key={item.key} role="tab" aria-selected={scope.key === item.key} className={scope.key === item.key ? "active" : ""} onClick={() => preserveScrollPosition(() => setScopeKey(item.key))}>{item.name}</button>)}
      </div>
    </div>
    <div className="oqc-dispersion-kpi-grid">
      <OqcDispersionMetricCard label="项目数" value={oqcDispersionNumber(y2026.projectCount)} unit="个" baseline={oqcDispersionNumber(y2025.projectCount)} detail={countDelta(scope.deltaProjectCount)}/>
      <OqcDispersionMetricCard label="出货机台数" value={oqcDispersionNumber(y2026.machineCount)} unit="台" baseline={oqcDispersionNumber(y2025.machineCount)} detail={`${scope.deltaMachineCount >= 0 ? "较2025 +" : "较2025 "}${Math.abs(scope.deltaMachineCount).toLocaleString()}台`}/>
      <OqcDispersionMetricCard label="项目离散指数" value={oqcDispersionNumber(y2026.dispersionIndex * 100, 1)} unit="%" baseline={oqcDispersionNumber(y2025.dispersionIndex * 100, 1)} detail={percentageDelta(scope.deltaDispersionIndex * 100)}/>
      <OqcDispersionMetricCard label="单台项目占比" value={oqcDispersionNumber(y2026.singleProjectShare, 1)} unit="%" baseline={oqcDispersionNumber(y2025.singleProjectShare, 1)} detail={percentageDelta(scope.deltaSingleProjectShare)}/>
      <OqcDispersionMetricCard label="平均每项目机台数" value={oqcDispersionNumber(y2026.avgMachinesPerProject, 2)} unit="台" baseline={oqcDispersionNumber(y2025.avgMachinesPerProject, 2)} detail={`有效项目数：${oqcDispersionNumber(y2026.effectiveProjectCount, 1)}`}/>
    </div>
    <div className="iqc-analysis-grid">
      <Panel title="总体项目与设备同比" subtitle="全部分类同步对比，先判断项目结构变化来自治具还是自动化" className="iqc-wide">
        <div className="oqc-dispersion-chart-grid">
          <BarCompare labels={allScopeLabels} first={dispersion.scopes.map((item) => item.y2025.projectCount)} second={dispersion.scopes.map((item) => item.y2026.projectCount)} names={["2025项目数", "2026项目数"]} percent={false} chartKey="oqc-dispersion-project-count"/>
          <BarCompare labels={allScopeLabels} first={dispersion.scopes.map((item) => item.y2025.machineCount)} second={dispersion.scopes.map((item) => item.y2026.machineCount)} names={["2025机台数", "2026机台数"]} percent={false} chartKey="oqc-dispersion-machine-count"/>
        </div>
      </Panel>
      <div className="oqc-section-heading"><span className="section-number">3.E1</span><div><h2>{scope.name}项目批量结构</h2><p>单台项目越多、平均每项目机台数越低，非标化特征通常越强。</p></div></div>
      <div className="oqc-dispersion-chart-grid">
        <Panel title="项目机台量分布" subtitle="柱形为对应机台数的项目数，折线为由低到高的累计项目占比"><EquipmentQuantityDistributionPareto rows={quantityDistributionRows} chartKey={`oqc-dispersion-distribution-${scope.key}`}/></Panel>
        <Panel title="项目机台分布范围" subtitle="柱形为各机台区间的项目数，折线为由低到高的累计项目占比"><EquipmentQuantityDistributionPareto rows={quantityRangeRows} chartKey={`oqc-dispersion-range-${scope.key}`}/></Panel>
      </div>
      <div className="oqc-dispersion-note"><strong>非标化信号</strong><p>{trendSignals.join("；")}。当“离散指数上升 + 单台项目占比上升 + 平均每项目台数下降”同时出现时，应优先核查项目复用、标准模块覆盖和订单拆分情况。</p></div>
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

function LazyOqcRuleDimensionChart({ dimension, rows, scopeKey }) {
  const hostRef = useRef(null);
  const [ready, setReady] = useState(false);
  const chartHeight = Math.max(330, Math.min(520, rows.length * 22 + 150));
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setReady(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setReady(true);
        observer.disconnect();
      }
    }, { rootMargin: "280px 0px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  return <Panel title={`${dimension.label}分类`} subtitle={`按${dimension.label}分别统计机台数；${rows.length}个分类值`}><div ref={hostRef} style={{ minHeight: chartHeight }}>{ready ? <BarCompare labels={rows.map((row) => row.name)} first={rows.map((row) => row.y2025)} second={rows.map((row) => row.y2026)} names={["2025 机台数", "2026 机台数"]} percent={false} height={chartHeight} chartKey={`oqc-rule-dimension-${dimension.key}-${scopeKey}`} scrollable/> : <div className="summary-note compact" style={{ minHeight: chartHeight }}>图表加载中…</div>}</div></Panel>;
}

function OqcRuleClassificationAnalysis({ data, classificationCache = null }) {
  const dimensions = projectNameRuleFields;
  const overview = data.oqc.equipmentDispersion;
  const scope = overview?.scopes?.find((item) => item.key === "overall") || overview?.scopes?.[0];
  const dimensionResults = classificationCache?.ready ? classificationCache.results : null;
  if (!scope) return <div className="summary-note oqc-dispersion-empty"><strong>待导入出货明细</strong><p>请先导入 OQC 出货明细和商务代码规则。</p></div>;
  const dimensionChartRows = (result) => {
    const selected = result || {};
    const byName = new Map();
    (selected.y2025 || []).forEach((row) => byName.set(row.name, { name: row.name, y2025: row.quantity, y2026: 0 }));
    (selected.y2026 || []).forEach((row) => byName.set(row.name, { ...(byName.get(row.name) || { name: row.name, y2025: 0 }), y2026: row.quantity }));
    return [...byName.values()].sort((a, b) => b.y2026 - a.y2026 || b.y2025 - a.y2025 || a.name.localeCompare(b.name, "zh-CN"));
  };
  return <div className="oqc-dispersion-analysis oqc-rule-classification-analysis">
    <div className="oqc-section-heading oqc-dispersion-heading"><span className="section-number">3.E2</span><div><h2>设备离散分析 · 项目规则分类</h2><p>按项目名称可识别字段分类汇总；所有记录均保留，无法解析的项目进入“未识别”。</p></div><AppliedPeriodTag data={data}/></div>
    {!dimensionResults ? <div className="summary-note compact">正在整理项目规则分类数据…</div> : <div className="oqc-rule-dimension-grid">{dimensions.map((dimension) => <LazyOqcRuleDimensionChart key={dimension.key} dimension={dimension} rows={dimensionChartRows(dimensionResults[dimension.key])} scopeKey={scope.key}/>)}</div>}
  </div>;
}

function OqcAnalysis({ data, files = [] }) {
  const [oqcTab, setOqcTab] = useState("summary");
  const [classificationCache, setClassificationCache] = useState(null);
  const summary = data.oqc.monthlySummary;
  const hasDetail = Boolean(data.oqc.shipmentDetail);
  const hasEquipmentDispersion = Boolean(data.oqc.equipmentDispersion);
  useEffect(() => {
    if (oqcTab !== "dispersion") {
      setClassificationCache(null);
      return undefined;
    }
    let cancelled = false;
    let retryTimer = null;
    const load = async () => {
      const next = await loadOqcEquipmentRuleCache();
      if (cancelled) return;
      setClassificationCache(next);
      if (!next?.ready) retryTimer = window.setTimeout(load, 1600);
    };
    load();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [oqcTab]);
  return <div className="module-page iqc-supplier-page oqc-page">
    <div className="iqc-section-title">
      <div><span className="section-number">3</span><div><h2>OQC出货评分同期分析</h2><p>按顶部已应用日期范围进行同期对比；低分定义为最终评分≤3分</p></div></div>
      <AppliedPeriodTag data={data}/>
    </div>
    <div className="dqa-sub-tabs oqc-sub-tabs">
      <button className={oqcTab === "summary" ? "active" : ""} onClick={() => setOqcTab("summary")}>评分汇总分析</button>
      <button className={oqcTab === "detail" ? "active" : ""} onClick={() => setOqcTab("detail")}>出货明细分析{hasDetail ? "" : "（待导入）"}</button>
      <button className={oqcTab === "dispersion" ? "active" : ""} onClick={() => setOqcTab("dispersion")}>设备离散分析{hasEquipmentDispersion ? "" : "（待导入）"}</button>
    </div>
    {oqcTab === "detail" ? <OqcShipmentDetailAnalysis data={data}/> : oqcTab === "dispersion" ? <><OqcEquipmentDispersionAnalysis data={data} dispersionOverride={data.oqc.equipmentDispersion}/><OqcRuleClassificationAnalysis data={data} classificationCache={classificationCache}/></> : <OqcSummaryAnalysis data={data} summary={summary}/>}
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


const qmsOneDecimal = (value) => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(1);
const qmsMetric = (row, periodKey) => row?.periods?.[periodKey] || { samples: 0, avg: null, lowRate: null, highRate: null };
const qmsValue = (row, key) => {
  if (key === "rank") return row.rank || 999;
  if (key === "name" || key === "division") return row[key] || "";
  const [periodKey, metric] = key.split(".");
  const value = row.periods?.[periodKey]?.[metric];
  return value == null ? -Infinity : value;
};
const qmsSorted = (rows, sort) => [...rows].sort((a, b) => {
  const av = qmsValue(a, sort.key); const bv = qmsValue(b, sort.key);
  const result = typeof av === "string" ? av.localeCompare(bv, "zh-CN") : av - bv;
  return sort.direction === "asc" ? result : -result;
});
function QmsSortButton({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  return <button className={active ? "active" : ""} onClick={() => onSort(sortKey)}>{label}<span>{active ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button>;
}
function QmsKpiCard({ label, periods = [], metric, unit, tone = "blue", detail }) {
  const current = periods.at(-1) || {};
  const mainValue = metric === "samples" ? (current.samples || 0) : qmsOneDecimal(current[metric]);
  return <article className={"qms-kpi-card "+tone}>
    <span>{label}</span><strong>{mainValue}<small>{unit}</small></strong>
    <div className="qms-kpi-periods">{periods.map((period) => <span key={period.key}><em>{period.period}</em><b>{metric === "samples" ? period.samples : qmsOneDecimal(period[metric])}{unit}</b></span>)}</div>
    {detail && <p>{detail}</p>}
  </article>;
}
function QmsPeriodSummary({ metric }) {
  return <span className="qms-period-summary"><b>{metric.samples || 0}份 / {qmsOneDecimal(metric.avg)}分</b><small>低分 {qmsOneDecimal(metric.lowRate)}% · 高满意 {qmsOneDecimal(metric.highRate)}%</small></span>;
}
function QmsTpmTable({ rows, periods, sort, onSort }) {
  return <div className="qms-table-wrap"><div className="qms-table qms-tpm-table">
    <div className="qms-table-row head"><QmsSortButton label="排名" sortKey="rank" sort={sort} onSort={onSort}/><QmsSortButton label="TPM" sortKey="name" sort={sort} onSort={onSort}/><QmsSortButton label="产品部" sortKey="division" sort={sort} onSort={onSort}/>{periods.map((period) => <QmsSortButton key={period.key} label={period.period} sortKey={period.key+".avg"} sort={sort} onSort={onSort}/>)}</div>
    {rows.map((row) => <div className={"qms-table-row "+(row.eligible ? "qms-rank-eligible" : "qms-rank-ineligible")} key={row.division+"-"+row.name}>
      <span>{row.eligible ? "#"+row.rank : "—"}</span><strong>{row.name}</strong><span>{row.division}</span>{periods.map((period) => <QmsPeriodSummary key={period.key} metric={qmsMetric(row, period.key)}/>)}
      {!row.eligible && <small>2026年上半年样本不足3份，不参与突出排名</small>}
    </div>)}
  </div></div>;
}
function QmsDimensionTable({ rows, periods }) {
  return <div className="qms-table-wrap"><div className="qms-dimension-table">
    <div className="qms-dimension-row head"><span>评分维度</span>{periods.map((period) => <span key={period.key}>{period.period}</span>)}</div>
    {rows.map((row) => <div className="qms-dimension-row" key={row.name}><strong>{row.name}</strong>{periods.map((period) => <span key={period.key}>{qmsOneDecimal(row.periods?.[period.key])}</span>)}</div>)}
  </div></div>;
}
function QmsAnalysis({ data }) {
  const qms = data.qms;
  const [division, setDivision] = useState("全公司");
  const [tpmSort, setTpmSort] = useState({ key: "rank", direction: "asc" });
  const [riskSort, setRiskSort] = useState({ key: "score", direction: "asc" });
  const [riskPeriod, setRiskPeriod] = useState("全部");
  const [riskExpanded, setRiskExpanded] = useState(false);
  const [suggestionFilters, setSuggestionFilters] = useState({ period: "全部", division: "全部", tpm: "全部", customer: "全部" });
  if (!qms?.current) return <div className="module-page qms-page"><div className="qms-empty"><ListChecks size={34}/><h2>暂无客户满意度数据</h2><p>请在数据导入页面上传客户满意度调查表。</p></div></div>;
  const periods = qms.periods || [];
  const changeTpmSort = (key) => setTpmSort((old) => ({ key, direction: old.key === key && old.direction === "asc" ? "desc" : "asc" }));
  const allTpmRows = qmsSorted(qms.tpmByDivision?.[division] || [], tpmSort);
  const chartTpmRows = allTpmRows.filter((row) => row.eligible);
  const riskValue = (row, key) => key === "score" || key === "lowestScore" ? Number(row[key]) : String(row[key] || "");
  const changeRiskSort = (key) => setRiskSort((old) => ({ key, direction: old.key === key && old.direction === "asc" ? "desc" : "asc" }));
  const riskRows = (qms.risks || []).filter((row) => riskPeriod === "全部" || row.period === riskPeriod).sort((a,b) => { const av=riskValue(a,riskSort.key), bv=riskValue(b,riskSort.key); const result=typeof av === "string" ? av.localeCompare(bv,"zh-CN") : av-bv; return riskSort.direction === "asc" ? result : -result; });
  const options = (key) => key === "period"
    ? ["全部", ...periods.map((row) => row.period)]
    : ["全部", ...new Set((qms.suggestions || []).map((row) => row[key]).filter(Boolean))];
  const suggestionRows = (qms.suggestions || []).filter((row) => Object.entries(suggestionFilters).every(([key,value]) => value === "全部" || row[key] === value));
  return <div className="module-page qms-page">
    <div className="iqc-section-title"><div><span className="section-number">5</span><div><h2>QMS 客户满意度分析</h2><p>2025年上半年、2025年下半年、2026年上半年三期独立对比</p></div></div><div className="applied-period-tag">调查周期：3个半年度</div></div>
    <div className="qms-kpi-grid">
      <QmsKpiCard label="平均分" periods={periods} metric="avg" unit="分" tone="blue" detail="三期分别统计，不合并2025年数据"/>
      <QmsKpiCard label="有效样本" periods={periods} metric="samples" unit="份" tone="purple" detail="问卷有效明细数量"/>
      <QmsKpiCard label="低分率" periods={periods} metric="lowRate" unit="%" tone="red" detail="总体得分＜4分"/>
      <QmsKpiCard label="高满意率" periods={periods} metric="highRate" unit="%" tone="green" detail="总体得分≥4.5分"/>
    </div>
    <div className="qms-grid two">
      <Panel title="客户满意度总体趋势" subtitle="柱形图为有效样本数，折线为总体平均分"><QmsTrendCombo rows={periods}/><div className="qms-compact-table"><div className="head"><span>周期</span><span>样本</span><span>平均分</span><span>低分率</span><span>高满意率</span></div>{periods.map((row)=><div key={row.period}><strong>{row.period}</strong><span>{row.samples}</span><span>{qmsOneDecimal(row.avg)}</span><span>{qmsOneDecimal(row.lowRate)}%</span><span>{qmsOneDecimal(row.highRate)}%</span></div>)}</div></Panel>
      <Panel title="三大产品部三期对比" subtitle="产品三部不纳入总体对比，但保留在客户、项目和建议原文明细"><QmsDivisionCombo rows={qms.divisionCompare} periods={periods}/><div className="qms-compact-table qms-division-period-table"><div className="head"><span>产品部</span>{periods.map((period)=><span key={period.key}>{period.period}</span>)}</div>{qms.divisionCompare.map((row)=><div key={row.name}><strong>{row.name}</strong>{periods.map((period)=><QmsPeriodSummary key={period.key} metric={qmsMetric(row,period.key)}/>)}</div>)}</div><p className="qms-scope-note">三大产品部图表已排除产品三部；全部已导入问卷中的产品三部明细 {qms.productThreeRows || 0} 条仍可在下方查阅。</p></Panel>
    </div>
    <Panel title="TPM 客户满意度排名" subtitle="2026年上半年样本数≥3才突出排名；三期全部数据仍完整保留在表中" action={<div className="qms-tabs">{["全公司",...(qms.divisionNames||[])].map((name)=><button key={name} className={division===name?"active":""} onClick={()=>setDivision(name)}>{name}</button>)}</div>}>
      {chartTpmRows.length ? <QmsTpmRank rows={chartTpmRows} periods={periods} chartKey={"qms-tpm-three-periods-"+division} height={Math.max(380,chartTpmRows.length*68+100)}/> : <div className="qms-chart-empty">当前产品部没有满足“样本数≥3”的TPM，完整数据请查看下表。</div>}
      <QmsTpmTable rows={allTpmRows} periods={periods} sort={tpmSort} onSort={changeTpmSort}/>
    </Panel>
    <Panel title="完整15项评分维度" subtitle="2025年上半年未设置的5项显示为“—”，不按0分处理"><QmsScoreCompare rows={qms.completeDimensions} periods={periods} chartKey="qms-dimensions-complete-three-periods" height={800}/><QmsDimensionTable rows={qms.completeDimensions} periods={periods}/></Panel>
    <Panel title="客户 / 项目低分风险明细" subtitle="总体得分＜4分使用红色突出；可按调查周期筛选并点击表头排序" action={<div className="qms-risk-actions"><label><span>调查周期</span><select value={riskPeriod} onChange={(event)=>setRiskPeriod(event.target.value)}>{["全部",...periods.map((row)=>row.period)].map((value)=><option key={value}>{value}</option>)}</select></label><button className={riskExpanded?"expanded":""} onClick={()=>setRiskExpanded((value)=>!value)}><CaretDown size={15}/>{riskExpanded?"收起明细":"展开明细"}<em>{riskRows.length}</em></button></div>}>
      {riskExpanded ? (riskRows.length ? <div className="qms-table-wrap"><div className="qms-risk-table"><div className="qms-risk-row head">{[["period","周期"],["division","产品部"],["tpm","TPM"],["pm","PM"],["customer","客户"],["project","项目"],["score","总体得分"],["lowestScore","最低维度"],["suggestion","建议摘要"]].map(([key,label])=><QmsSortButton key={key} label={label} sortKey={key} sort={riskSort} onSort={changeRiskSort}/>)}</div>{riskRows.map((row,index)=><div className={"qms-risk-row "+(row.score<4?"qms-low-row":"")} key={row.period+"-"+row.customer+"-"+row.project+"-"+index}><span>{row.period}</span><span>{row.division}</span><span>{row.tpm}</span><span>{row.pm||"—"}</span><strong>{row.customer||"—"}</strong><span>{row.project||"—"}</span><b>{qmsOneDecimal(row.score)}</b><span>{row.lowestDimension} / {qmsOneDecimal(row.lowestScore)}</span><em title={row.suggestion}>{row.suggestion||"—"}</em></div>)}</div></div> : <div className="qms-risk-collapsed">当前调查周期暂无风险明细</div>) : <div className="qms-risk-collapsed">已收起，共 {riskRows.length} 条记录；点击“展开明细”查看。</div>}
    </Panel>
    <Panel title="客户建议原文" subtitle="可按三个调查周期、产品部、TPM和客户筛选；普通查看用户可查看原文">
      <div className="qms-suggestion-filters">{[["period","调查周期"],["division","产品部"],["tpm","TPM"],["customer","客户"]].map(([key,label])=><label key={key}><span>{label}</span><select value={suggestionFilters[key]} onChange={(event)=>setSuggestionFilters((old)=>({...old,[key]:event.target.value}))}>{options(key).map((value)=><option key={value}>{value}</option>)}</select></label>)}<b>当前 {suggestionRows.length} 条</b></div>
      <div className="qms-suggestion-list">{suggestionRows.map((row,index)=><article className="qms-suggestion-card" key={row.period+"-"+row.customer+"-"+row.type+"-"+index}><header><div><strong>{row.customer||"未填写客户"}</strong><span>{row.project||"未填写项目"}</span></div><em>{row.period}</em></header><div className="qms-suggestion-meta"><span>{row.division}</span><span>{row.tpm}</span><span>{row.type}</span><b>{row.category}</b></div><p>{row.content}</p></article>)}</div>
    </Panel>
  </div>;
}

function ModuleDetail({ module, data, files }) {
  if (module === "IQC") return <IqcSupplierAnalysis data={data} />;
  if (module === "IPQC") return <IpqcAnalysis data={data} />;
  if (module === "OQC") return <OqcAnalysis data={data} files={files} />;
  if (module === "DQA") return <DqaAnalysis data={data}/>;
  if (module === "QMS") return <QmsAnalysis data={data}/>;
  return null;
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
  const [dqaEngineerSupplement, setDqaEngineerSupplement] = useState(null);
  const [dqaAgentRaw, setDqaAgentRaw] = useState(null);
  const dqaAgentRawLoadRef = useRef(null);
  const ensureDqaAgentRawLoaded = useCallback(async () => {
    if (dqaAgentRaw) return dqaAgentRaw;
    if (!dqaAgentRawLoadRef.current) dqaAgentRawLoadRef.current = loadDqaAgentRaw()
      .then((value) => { setDqaAgentRaw(value || null); return value || null; })
      .finally(() => { dqaAgentRawLoadRef.current = null; });
    return await dqaAgentRawLoadRef.current;
  }, [dqaAgentRaw]);
  const persistDqaAgentRaw = useCallback(async (value) => {
    const saved = await saveDqaAgentRaw(value);
    setDqaAgentRaw(saved || value);
    return saved || value;
  }, []);
  const [importOpen, setImportOpen] = useState(false);
  const [importModule, setImportModule] = useState(null);
  const [storageReady, setStorageReady] = useState(false);
  const [usingDefaultAnalysis, setUsingDefaultAnalysis] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sourceNotice, setSourceNotice] = useState("");
  const [dateRefreshStatus, setDateRefreshStatus] = useState("idle");
  const [refreshProgress, setRefreshProgress] = useState(null);
  const [auth, setAuth] = useState({ ip: "", name: "", role: "unauthorized", isAdmin: false, isDeputy: false, isOrdinary: false, isAuthorized: false, features: {} });
  const [permissions, setPermissions] = useState(() => normalizePermissions({}));
  const [authReady, setAuthReady] = useState(false);
  const [fontSize, setFontSize] = useState(() => localStorage.getItem("qms-font-size") || "standard");
  const [labelControlsVisible, setLabelControlsVisible] = useState(() => localStorage.getItem("qms-chart-label-controls-visible-v2") === "true");
  const [uiTheme, setUiTheme] = useState(() => localStorage.getItem("qms-ui-theme") || "classic");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("qms-sidebar-collapsed") === "true");
  const [dateRange, setDateRange] = useState(initialDateRange);
  const [appliedDateRange, setAppliedDateRange] = useState(initialDateRange);
  const [teamDefaultRange, setTeamDefaultRange] = useState(initialDateRange);
  const [lastServerSavedAt, setLastServerSavedAt] = useState(null);
  const [serverSyncStatus, setServerSyncStatus] = useState({ state: "idle", label: "等待服务器同步" });
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const agentSourceCacheRef = useRef(new Map());
  const agentSourceLoadingRef = useRef(new Map());
  const agentSourceGroupRef = useRef("");
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
  const cleanPrimarySources = useCallback((sources = []) => sources.filter((source) => !isLegacyDqaEngineerSource(source)), []);
  const ensureQmsSources = useCallback(async (sources = []) => {
    if (sources.some((source) => source.module === "QMS")) return sources;
    const qmsDefaults = await loadDefaultQmsSources();
    return qmsDefaults.length ? [...sources, ...qmsDefaults] : sources;
  }, []);
  const prepareSourcesForAnalysis = useCallback(async (sources, onProgress = () => {}, requestedModules = null) => {
    sources = cleanPrimarySources(sources);
    const moduleSet = Array.isArray(requestedModules) && requestedModules.length ? new Set(requestedModules) : null;
    if (moduleSet) sources = sources.filter((source) => moduleSet.has(source.module));
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
    const hydrated = parsed.map((source) => {
      const meta = metaByKey.get(`${source.module}::${source.name}`) || {};
      // Parsing a server file must not manufacture a new import version.
      // Snapshot signatures use this timestamp to prove the browser and server
      // are analysing the same uploaded source.
      return { ...meta, ...source, importedAt: meta.importedAt || source.importedAt, serverFile: meta.serverFile || source.serverFile, rows: source.rows };
    });
    const rest = sources.filter((source) => !parsedKeys.has(`${source.module}::${source.name}`));
    return [...rest, ...hydrated];
  }, [cleanPrimarySources]);
  const ensureAgentSources = useCallback(async (requestedModules = [], onProgress = () => {}, seedSources = []) => {
    const moduleSet = new Set(Array.isArray(requestedModules) ? requestedModules : []);
    let current = files;
    if (!current.length) current = await loadImportedSources();
    if (Array.isArray(seedSources) && seedSources.length) {
      const byKey = new Map(current.map((source) => [`${source.module}::${source.name}`, source]));
      seedSources.forEach((source) => {
        const key = `${source.module}::${source.name}`;
        const previous = byKey.get(key);
        byKey.set(key, previous ? { ...previous, ...source, rows: Array.isArray(source.rows) && source.rows.length ? source.rows : previous.rows } : source);
      });
      current = [...byKey.values()];
    }
    current = await ensureQmsSources(cleanPrimarySources(current));
    const groupKey = [...moduleSet].sort().join("|");
    if (agentSourceGroupRef.current !== groupKey) {
      const pendingLoads = [...agentSourceLoadingRef.current.values()];
      if (pendingLoads.length) await Promise.allSettled(pendingLoads);
      agentSourceGroupRef.current = groupKey;
      agentSourceCacheRef.current.clear();
      agentSourceLoadingRef.current.clear();
    }
    const target = current.filter((source) => moduleSet.has(source.module));
    target.forEach((source) => {
      const key = `${source.module}::${source.name}`;
      if (Array.isArray(source.rows) && source.rows.length) agentSourceCacheRef.current.set(key, source);
    });
    const missing = target.filter((source) => !agentSourceCacheRef.current.has(`${source.module}::${source.name}`));
    let hydrated = [];
    if (missing.length) {
      const loadingKey = `${groupKey}::${missing.map((source) => `${source.module}::${source.name}`).sort().join("|")}`;
      let loading = agentSourceLoadingRef.current.get(loadingKey);
      if (!loading) {
        loading = prepareSourcesForAnalysis(missing, onProgress).finally(() => agentSourceLoadingRef.current.delete(loadingKey));
        agentSourceLoadingRef.current.set(loadingKey, loading);
      }
      hydrated = await loading;
      hydrated.forEach((source) => agentSourceCacheRef.current.set(`${source.module}::${source.name}`, source));
    }
    const hydratedByKey = new Map(target.map((source) => [
      `${source.module}::${source.name}`,
      agentSourceCacheRef.current.get(`${source.module}::${source.name}`) || source,
    ]));
    const merged = current.map((source) => hydratedByKey.get(`${source.module}::${source.name}`) || source);
    return merged;
  }, [files, ensureQmsSources, cleanPrimarySources, prepareSourcesForAnalysis]);
  const clearAgentSources = useCallback(() => {
    agentSourceCacheRef.current.clear();
    agentSourceGroupRef.current = "";
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
      const nextUser = user || { ip: "", name: "", role: "unauthorized", isAdmin: false, isDeputy: false, isOrdinary: false, isAuthorized: false };
      setAuth({ ...nextUser, isAuthorized: nextUser.isAuthorized ?? !!(nextUser.isAdmin || nextUser.isDeputy || nextUser.isOrdinary) });
      setPermissions(normalizePermissions(payload?.permissions || payload || {}));
      setAuthReady(true);
    }).catch(() => {
      if (cancelled) return;
      setAuth({ ip: "", name: "", role: "unauthorized", isAdmin: false, isDeputy: false, isOrdinary: false, isAuthorized: false });
      setPermissions(normalizePermissions({}));
      setAuthReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (view === "workspace" && !canUseFeature(auth, permissions, "workspace")) setView("executive");
  }, [view, auth, permissions]);
  useEffect(() => {
    if (!authReady || !auth.isAuthorized) return undefined;
    let cancelled = false;
    loadDqaEngineerSupplement().then((value) => { if (!cancelled) setDqaEngineerSupplement(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [authReady, auth.isAuthorized]);
  useEffect(() => {
    const theme = uiTheme === "apple" ? "apple" : "classic";
    document.documentElement.dataset.uiTheme = theme;
    localStorage.setItem("qms-ui-theme", theme);
  }, [uiTheme]);
  useEffect(() => { localStorage.setItem("qms-sidebar-collapsed", sidebarCollapsed ? "true" : "false"); }, [sidebarCollapsed]);
  useEffect(() => { seedDefaultAnnotations(); }, []);
  useEffect(() => {
    if (!authReady || !auth.isAuthorized) return undefined;
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
          setFiles(cleanPrimarySources(cached.files || []));
          setDateRange(cachedRange);
          setAppliedDateRange(cachedRange);
          setTeamDefaultRange(cachedRange);
          setLastServerSavedAt(cached.savedAt || null);
          setServerSyncStatus({ state: "success", label: cached.savedAt ? `服务器已同步 · ${formatSyncDateTime(cached.savedAt)}` : "服务器已同步" });
          localStorage.setItem("qms-date-range-v202605", JSON.stringify(cachedRange));
          setData(cached.data);
          setStorageReady(true);
          loadImportedSources().then(async (stored) => {
            if (cancelled || !stored.length) return;
            const sourcesWithQms = await ensureQmsSources(cleanPrimarySources(stored));
            if (cancelled) return;
            setFiles(sourcesWithQms);
            if (!cacheMatchesSources(cached, sourcesWithQms)) {
              const hydrated = await prepareSourcesForAnalysis(sourcesWithQms);
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
        setTeamDefaultRange(activeRange);
        if (savedRange?.savedAt) setLastServerSavedAt(savedRange.savedAt);

        const stored = await loadImportedSources();
        if (cancelled) return;
        if (stored.length) {
          setUsingDefaultAnalysis(false);
          const sourcesWithQms = await ensureQmsSources(cleanPrimarySources(stored));
          if (cancelled) return;
          setFiles(sourcesWithQms);
          const hydrated = await prepareSourcesForAnalysis(sourcesWithQms);
          if (cancelled) return;
          setFiles(hydrated);
          const nextData = await applyAnalyzedData(hydrated, activeRange, { bumpRevision: false });
          saveAnalysisCacheFor(hydrated, activeRange, nextData);
          if (!cancelled) setStorageReady(true);
          return;
        }

        const defaultAnalysis = await loadDefaultAnalysis();
        if (cancelled) return;
        if (defaultAnalysis?.data) {
          const bundledRange = isValidDateRange(defaultAnalysis.dateRange) ? {
            start2025: defaultAnalysis.dateRange.start2025,
            end2025: defaultAnalysis.dateRange.end2025,
            start2026: defaultAnalysis.dateRange.start2026,
            end2026: defaultAnalysis.dateRange.end2026,
          } : defaultDateRange;
          setUsingDefaultAnalysis(true);
          setFiles(defaultAnalysis.files || []);
          setDateRange(bundledRange);
          setAppliedDateRange(bundledRange);
          localStorage.setItem("qms-date-range-v202605", JSON.stringify(bundledRange));
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
  }, [authReady, auth.isAuthorized]);
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
  const normalizeDqaEngineerSupplement = (value) => {
    const current = value || {};
    const files = (current.files || []).map((file) => ({
      ...file,
      sourceId: file.sourceId || `legacy:${file.kind || "unknown"}:${file.name || "unknown"}`,
    }));
    const attachSource = (records, kind) => {
      const kindFiles = files.filter((file) => file.kind === kind);
      return (records || []).map((record, index) => {
        if (record.sourceId) return record;
        const source = kindFiles[0];
        return {
          ...record,
          sourceId: source?.sourceId || `legacy:${kind}:${index}`,
          sourceName: record.sourceName || source?.name || "历史导入数据",
        };
      });
    };
    return {
      ...current,
      files,
      ecnRecords: attachSource(current.ecnRecords, "ECN"),
      nonBomRecords: attachSource(current.nonBomRecords, "非BOM"),
      reviewRecords: attachSource(current.reviewRecords, "研发评审"),
    };
  };
  const importDqaEngineerSupplement = async (selectedFiles) => {
    const parsed = await parseDqaEngineerSupplementFiles(selectedFiles);
    if (!parsed.ecnRecords.length && !parsed.nonBomRecords.length && !parsed.reviewRecords.length) throw new Error("未识别到 ECN、非BOM 或研发评审数据");
    const current = normalizeDqaEngineerSupplement(dqaEngineerSupplement);
    const existingIds = new Set((current.files || []).map((file) => file.sourceId));
    const newFiles = (parsed.files || []).filter((file) => !existingIds.has(file.sourceId));
    const newIds = new Set(newFiles.map((file) => file.sourceId));
    const merged = {
      version: 1,
      kind: parsed.kind,
      updatedAt: new Date().toISOString(),
      files: [...(current.files || []), ...newFiles],
      ecnRecords: [...(current.ecnRecords || []), ...parsed.ecnRecords.filter((record) => newIds.has(record.sourceId))],
      nonBomRecords: [...(current.nonBomRecords || []), ...parsed.nonBomRecords.filter((record) => newIds.has(record.sourceId))],
      reviewRecords: [...(current.reviewRecords || []), ...parsed.reviewRecords.filter((record) => newIds.has(record.sourceId))],
    };
    const saved = await saveDqaEngineerSupplement(merged);
    setDqaEngineerSupplement(saved || merged);
    return saved || merged;
  };
  const normalizeDqaAgentRaw = (value) => ({ version: 1, kind: "DQA_AGENT_RAW", updatedAt: value?.updatedAt || new Date().toISOString(), files: Array.isArray(value?.files) ? value.files : [], ecnRecords: Array.isArray(value?.ecnRecords) ? value.ecnRecords : [], nonBomRecords: Array.isArray(value?.nonBomRecords) ? value.nonBomRecords : [], projectMappings: Array.isArray(value?.projectMappings) ? value.projectMappings : [] });
  const importDqaAgentRaw = async (selectedFiles) => {
    const parsed = await parseDqaAgentRawFiles(selectedFiles); const current = normalizeDqaAgentRaw(dqaAgentRaw); const existing = new Set(current.files.map((file) => file.sourceId)); const filesToAdd = parsed.files.filter((file) => !existing.has(file.sourceId)); const ids = new Set(filesToAdd.map((file) => file.sourceId));
    const merged = { ...current, updatedAt: new Date().toISOString(), files: [...current.files, ...filesToAdd], ecnRecords: [...current.ecnRecords, ...parsed.ecnRecords.filter((row) => ids.has(row.sourceId))], nonBomRecords: [...current.nonBomRecords, ...parsed.nonBomRecords.filter((row) => ids.has(row.sourceId))], projectMappings: [...current.projectMappings, ...parsed.projectMappings.filter((row) => ids.has(row.sourceId))] };
    const saved = await saveDqaAgentRaw(merged); setDqaAgentRaw(saved || merged); return saved || merged;
  };
  const clearDqaAgentRaw = async () => { await clearDqaAgentRawState(); setDqaAgentRaw(null); };
  const deleteDqaAgentRawFile = async (file) => {
    const current = normalizeDqaAgentRaw(dqaAgentRaw);
    const sourceId = file?.sourceId;
    if (!sourceId) return current;
    const next = {
      ...current,
      updatedAt: new Date().toISOString(),
      files: current.files.filter((item) => item.sourceId !== sourceId),
      ecnRecords: current.ecnRecords.filter((row) => row.sourceId !== sourceId),
      nonBomRecords: current.nonBomRecords.filter((row) => row.sourceId !== sourceId),
      projectMappings: current.projectMappings.filter((row) => row.sourceId !== sourceId),
    };
    if (!next.files.length) { await clearDqaAgentRawState(); setDqaAgentRaw(null); return null; }
    const saved = await saveDqaAgentRaw(next);
    setDqaAgentRaw(saved || next);
    return saved || next;
  };
  const deleteDqaEngineerSupplementFile = async (file) => {
    const current = normalizeDqaEngineerSupplement(dqaEngineerSupplement);
    const sourceId = file?.sourceId || `legacy:${file?.kind || "unknown"}:${file?.name || "unknown"}`;
    const next = {
      ...current,
      updatedAt: new Date().toISOString(),
      files: (current.files || []).filter((item) => item.sourceId !== sourceId),
      ecnRecords: (current.ecnRecords || []).filter((record) => record.sourceId !== sourceId),
      nonBomRecords: (current.nonBomRecords || []).filter((record) => record.sourceId !== sourceId),
      reviewRecords: (current.reviewRecords || []).filter((record) => record.sourceId !== sourceId),
    };
    if (!next.files.length) {
      await clearDqaEngineerSupplementState();
      setDqaEngineerSupplement(null);
      return null;
    }
    const saved = await saveDqaEngineerSupplement(next);
    setDqaEngineerSupplement(saved || next);
    return saved || next;
  };
  const clearDqaEngineerSupplement = async () => {
    await clearDqaEngineerSupplementState();
    setDqaEngineerSupplement(null);
  };
  const openImport = (module = null) => {
    if (!canUseFeature(auth, permissions, "dataImport")) return;
    setImportModule(module);
    setImportOpen(true);
  };
  const applySources = async (sources, result = {}, onProgress = () => {}) => {
    sources = cleanPrimarySources(sources);
    setUsingDefaultAnalysis(false);
    setFiles(sources);
    onProgress({ state: "loading", label: "正在保存数据源清单" });
    setServerSyncStatus({ state: "saving", label: "正在保存到服务器" });
    const savedSources = await saveImportedSources(sources);
    if (!savedSources) {
      setServerSyncStatus({ state: "error", label: "服务器保存失败" });
      throw new Error("Failed to save imported sources to server");
    }
    localStorage.setItem("qms-user-imported-sources-v2", "true");
    onProgress({ state: "loading", label: "正在生成分析图表" });
    const nextData = await applyAnalyzedData(sources, appliedDateRange);
    onProgress({ state: "loading", label: "正在保存分析结果" });
    const savedCache = await saveAnalysisCacheFor(sources, appliedDateRange, nextData);
    if (!savedCache) {
      setServerSyncStatus({ state: "error", label: "服务器保存失败" });
      throw new Error("Failed to save analysis cache to server");
    }
    const savedAt = savedCache.savedAt || new Date().toISOString();
    setLastServerSavedAt(savedAt);
    setTeamDefaultRange(appliedDateRange);
    setServerSyncStatus({ state: "success", label: `服务器已同步 · ${formatSyncDateTime(savedAt)}` });
    const parts = [];
    if (result.added?.length) parts.push(`新增${result.added.length}个`);
    if (result.replaced?.length) parts.push(`替换${result.replaced.length}个`);
    if (result.rejected?.length) parts.push(`拒绝${result.rejected.length}个模块不匹配文件`);
    setSourceNotice(parts.length ? `数据源已保存：${parts.join("，")}` : "本地数据源已更新");
    setTimeout(() => setSourceNotice(""), 3200);
  };
  const deleteSource = async (source) => {
    const sources = cleanPrimarySources(files.filter((file) => !(file.module === source.module && file.name === source.name)));
    const moduleKey = String(source.module || "").toLowerCase();
    const moduleSources = sources.filter((file) => file.module === source.module);
    const dqaIssueOnly = source.module === "DQA" && !["DQA_ECN", "DQA_MACHINED_PARTS"].includes(source.subKind);
    const analysisSources = dqaIssueOnly
      ? moduleSources.filter((file) => !["DQA_ECN", "DQA_MACHINED_PARTS"].includes(file.subKind))
      : moduleSources;
    setFiles(sources);
    setUsingDefaultAnalysis(false);
    setSourceNotice(`已删除：${source.name} · 正在后台更新 ${source.module} 统计`);
    setServerSyncStatus({ state: "saving", label: `正在更新 ${source.module} 数据` });
    try {
      const [savedSources, partial] = await Promise.all([
        saveImportedSources(sources),
        analyzeInBackground(analysisSources, appliedDateRange),
      ]);
      if (!savedSources) throw new Error("数据源清单保存失败");
      let modulePatch = partial?.[moduleKey] || {};
      // A normal R&D issue workbook cannot change the large ECN/non-BOM
      // denominator caches. Preserve those fixed results and update only the
      // issue-related DQA aggregates.
      if (dqaIssueOnly) modulePatch = Object.fromEntries(["tpmStages", "categories", "yearCompare", "divisions"].map((key) => [key, modulePatch[key]]));
      const nextModule = { ...(data?.[moduleKey] || {}), ...modulePatch };
      const changedKpi = (partial?.kpis || []).find((item) => item.key === moduleKey) || null;
      const nextKpis = (data?.kpis || []).map((item) => item.key === moduleKey && changedKpi ? changedKpi : item);
      const nextData = { ...(data || {}), [moduleKey]: nextModule, kpis: nextKpis, updatedAt: partial?.updatedAt || data?.updatedAt, period: partial?.period || data?.period };
      startTransition(() => {
        setData(nextData);
        setAnalysisRevision((current) => current + 1);
      });
      const savedAt = new Date().toISOString();
      const patched = await patchCachedAnalysis({
        version: ANALYSIS_CACHE_VERSION,
        savedAt,
        dateRange: { ...appliedDateRange },
        sourceSignature: createSourcesSignature(sources),
        files: summarizeSources(sources),
        module: moduleKey,
        moduleData: modulePatch,
        kpi: changedKpi,
        updatedAt: nextData.updatedAt,
        period: nextData.period,
      });
      if (!patched) throw new Error("分析缓存增量保存失败");
      setLastServerSavedAt(patched.savedAt || savedAt);
      setServerSyncStatus({ state: "success", label: `服务器已同步 · ${formatSyncDateTime(patched.savedAt || savedAt)}` });
      setSourceNotice(`已删除：${source.name}`);
    } catch (error) {
      setServerSyncStatus({ state: "error", label: "删除后的统计更新失败" });
      setSourceNotice(`文件已删除，但统计缓存更新失败：${error?.message || error}`);
    }
    setTimeout(() => setSourceNotice(""), 3200);
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
        setServerSyncStatus({ state: "saving", label: "正在保存到服务器" });
        const [savedCache, savedRange] = await Promise.all([saveAnalysisCacheFor(defaultFiles, selectedRange, nextData), saveAppliedDateRange(selectedRange)]);
        if (!savedCache || !savedRange) throw new Error("Failed to save refreshed default analysis");
        const savedAt = savedRange.savedAt || savedCache.savedAt || new Date().toISOString();
        setTeamDefaultRange(selectedRange);
        setLastServerSavedAt(savedAt);
        setServerSyncStatus({ state: "success", label: `服务器已同步 · ${formatSyncDateTime(savedAt)}` });
        setRefreshProgress({ label: "刷新完成", percent: 100 });
        setDateRefreshStatus("done");
        setTimeout(() => { setDateRefreshStatus("idle"); setRefreshProgress(null); }, 1800);
      }).catch(() => {
        setServerSyncStatus({ state: "error", label: "服务器保存失败，请重试" });
        setRefreshProgress({ label: "服务器保存失败", percent: 100 });
        setDateRefreshStatus("missing");
        setTimeout(() => { setDateRefreshStatus("idle"); setRefreshProgress(null); }, 2600);
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
      const canSaveGlobal = (auth?.isAdmin || auth?.isDeputy) && canUseFeature(auth, permissions, "dataImport");
      if (!canSaveGlobal) return null;
      setRefreshProgress({ label: "正在保存到服务器", percent: 92 });
      setServerSyncStatus({ state: "saving", label: "正在保存到服务器" });
      return Promise.all([saveAnalysisCacheFor(readySources, selectedRange, nextData), saveAppliedDateRange(selectedRange)]);
    }).then((saved) => {
      if (saved && (!saved[0] || !saved[1])) throw new Error("Failed to save refreshed analysis");
      if (saved) {
        const savedAt = saved[1].savedAt || saved[0].savedAt || new Date().toISOString();
        setTeamDefaultRange(selectedRange);
        setLastServerSavedAt(savedAt);
        setServerSyncStatus({ state: "success", label: `服务器已同步 · ${formatSyncDateTime(savedAt)}` });
      }
      setRefreshProgress({ label: "刷新完成", percent: 100 });
      setDateRefreshStatus("done");
      setTimeout(() => { setDateRefreshStatus("idle"); setRefreshProgress(null); }, 1800);
    }).catch(() => {
      setServerSyncStatus({ state: "error", label: "服务器保存失败，请重试" });
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

  if (authReady && !auth.isAuthorized) {
    const theme = uiTheme === "apple" ? "apple" : "classic";
    return <UiThemeContext.Provider value={theme}>
      <div className={`access-denied-shell theme-${theme}`}>
        <section className="access-denied-card">
          <ShieldCheck size={34} weight="fill" />
          <span>访问受限</span>
          <h1>当前设备未获得查看权限</h1>
          <p>请联系主管理员，将以下 IP 和使用人姓名添加到普通用户或副管理员名单。</p>
          <div><small>当前 IP</small><strong>{auth.ip || "无法识别"}</strong></div>
        </section>
      </div>
    </UiThemeContext.Provider>;
  }

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
      ? <ExecutiveDashboard data={data} files={files} dqaEngineerSupplement={dqaEngineerSupplement} dqaAgentRaw={dqaAgentRaw} onLoadDqaAgentRaw={ensureDqaAgentRawLoaded} onSaveDqaAgentRaw={persistDqaAgentRaw} onImport={openImport} onDeleteSource={deleteSource} onSourcesChanged={applySources} onImportDqaEngineerSupplement={importDqaEngineerSupplement} onClearDqaEngineerSupplement={clearDqaEngineerSupplement} onDeleteDqaEngineerSupplementFile={deleteDqaEngineerSupplementFile} onImportDqaAgentRaw={importDqaAgentRaw} onClearDqaAgentRaw={clearDqaAgentRaw} onDeleteDqaAgentRawFile={deleteDqaAgentRawFile} onEnsureAgentSources={ensureAgentSources} onClearAgentSources={clearAgentSources} view={view} onViewChange={setView} dateRange={dateRange} teamDefaultRange={teamDefaultRange} lastServerSavedAt={lastServerSavedAt} serverSyncStatus={serverSyncStatus} appliedDateRange={appliedDateRange} onDateRange={updateDateRange} onRefreshDate={refreshDateData} dateRefreshStatus={dateRefreshStatus} refreshProgress={refreshProgress} fontSize={fontSize} onFontSize={setFontSize} analysisKey={analysisRevision} labelControlsVisible={labelControlsVisible} onToggleLabelControls={() => setLabelControlsVisible((current) => !current)} uiTheme={uiTheme === "apple" ? "apple" : "classic"} onThemeChange={changeUiTheme} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((current) => !current)} auth={auth} permissions={permissions} onPermissionsChanged={(next) => setPermissions(normalizePermissions(next))} />
      : <WorkspaceDashboard key={`workspace-${analysisRevision}`} data={data} files={files} onImport={() => openImport(null)} view={view} onViewChange={setView} onExport={exportData} onSave={saveTemplate} dateRange={dateRange} appliedDateRange={appliedDateRange} onDateRange={updateDateRange} onRefreshDate={refreshDateData} dateRefreshStatus={dateRefreshStatus} fontSize={fontSize} onFontSize={setFontSize} uiTheme={uiTheme === "apple" ? "apple" : "classic"} onThemeChange={changeUiTheme} auth={auth} permissions={permissions} />}
    <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSourcesChanged={applySources} files={files} dateRange={appliedDateRange} targetModule={importModule} />
    {saved && <div className="toast"><CheckCircle size={19} weight="fill" />当前分析视图已保存为本机模板</div>}
    {sourceNotice && <div className="toast"><Database size={19}/>{sourceNotice}</div>}
  </UiThemeContext.Provider>;
}





