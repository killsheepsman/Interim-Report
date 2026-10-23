import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsClockwise, Brain, CaretDown, CaretRight, CheckCircle, DownloadSimple, Eye, EyeSlash, FileArrowUp, FileHtml, FilePdf, FloppyDisk, PaperPlaneTilt, Printer, ShareNetwork, Trash, WarningCircle } from "@phosphor-icons/react";
import { createSourcesSignature, deleteAgentReport, deleteLocalAgentReport, loadAgentReport, loadAgentReports, loadCurrentUser, loadLocalAgentReport, loadLocalAgentReports, loadAgentSkills, loadDqaAgentRaw, loadQualityAgentSnapshotRegistry, loadQualityAgentRunsFromServer, previewWecomSend, requestAiChat, saveAgentReportFile, saveLocalAgentReport, saveQualityAgentRunsToServer, fetchReportFile, fetchReportPdf, sendWecomReports } from "../dataStore.js";
import { alignIqcYieldMetrics, applyQualitySnapshotWindow, buildQualityAgentSnapshot, ipqcSnapshotReady, oqcSnapshotReady, pickIqcAnalysisSnapshot, pickIpqcAnalysisSnapshot, pickOqcAnalysisSnapshot, sliceIqcSnapshotToWindow, refillIqcSnapshotDetails, iqcSplitDetailsMissing, sliceIpqcSnapshotToWindow, sliceOqcSnapshotToWindow, sliceDqaRdSnapshotToWindow } from "./qualitySnapshot.js";
import { loadDoamPack } from "../doamStore.js";
import { hydrateDoamDefault, mergeDoamDatasets } from "../doamEngine.js";
import { chooseAgentRunSnapshot, closeQualityAgentAction, iqcSnapshotReady, loadQualityAgentRuns, qualityAgentSnapshotHash, QUALITY_AGENT_STAGES, runQualityAgent, saveQualityAgentRuns } from "./qualityAgent.js";
import { calloutToneClass, headingClass, isLayoutMarker, isMachineMetadataLine, metricLine, sectionClass, tableToneClass } from "./reportLayout.js";
import { DEFAULT_REPORT_PRESENTATION_PROFILE, getReportPresentationProfile, normalizeReportPresentationProfile, presentationOwnsCharts, REPORT_PRESENTATION_PROFILES, reportPresentationClass } from "./reportPresentationProfiles.js";
import { normalizeCompanyBrief, renderPorcelainSheet } from "./porcelainSheet.js";
import { ensurePersonalReportHeading } from "./roleFixedEvidenceReport.js";
import { renderBasicsSheet } from "./basicsSheet.js";
import { normalizeQualitySnapshotRegistry, pickLatestQualitySnapshot } from "./snapshotRegistry.js";
import { extractReportVisualSpec, sanitizeHumanReportContent } from "../reportSanitizer.js";
import { chartThemeFromSkill, isRoleChartSkill, keepActiveWeekChartRows, trendBucketSelected } from "./roleSnapshotRegistry.js";
import { oqcTpmHeatmap } from "./oqcShipmentSplit.js";
import { applyDqaPmMachined, dqaRdSnapshotReady, shapeDqaRdSplit } from "./dqaRdSplit.js";
import { buildQmsCustomerSplit } from "./qmsCustomerSplit.js";
import { buildDoamStabilitySplit } from "./doamStabilitySplit.js";
import { writeReportDuration } from "./reportDuration.js";
import { EmployeeSearchSelect } from "./EmployeeSearchSelect.jsx";
import { periodChartTitle, renderLieflatFigure, renderLieflatMultiLine, renderLieflatPairedTrend, renderLieflatRungBars, renderOqcTargetMatrix } from "./lieflatRoleCharts.js";

const formatBackendLogTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("zh-CN", { hour12: false });
};
const backendWaitSeconds = (log, now) => {
  const last = log?.[log.length - 1]?.at;
  const started = new Date(last || 0).getTime();
  if (!started) return 0;
  return Math.max(0, Math.round((now - started) / 1000));
};
const AGENT_TITLE = "质量分析 Agent";
const CORE_SKILL_NAME = "quality-analysis-core";
const DEFAULT_CORE_SKILL = { id: CORE_SKILL_NAME, name: CORE_SKILL_NAME, description: "质量分析共通证据与闭环规则", content: "只解释固定统计快照，区分事实、推断和待验证假设，并用结果—过程—根因—责任—行动形成闭环。" };
const REPORT_PRESENTATION_STORAGE_KEY = "qms-quality-agent-report-presentation-v1";
const CHART_SKILL_STORAGE_KEY = "qms-quality-agent-chart-skill-v1";
const DEFAULT_ANALYSIS_CHART_SKILL = "quality-role-charts-lieflat";
const MODULE_DEFAULT_SKILLS = {
  IQC: { id: "quality-analysis-iqc", name: "quality-analysis-iqc", description: "IQC来料质量分析", content: "按公司、基地/厂区和供应商分析来料质量。" },
  IPQC: { id: "quality-analysis-ipqc", name: "quality-analysis-ipqc", description: "IPQC过程质量分析", content: "按公司、基地、工坊和交付经理分析过程质量。" },
  OQC: { id: "quality-analysis-oqc", name: "quality-analysis-oqc", description: "OQC出货质量分析", content: "按公司、产品部、TPM和项目分析出货质量。" },
  DQA: { id: "quality-analysis-dqa", name: "quality-analysis-dqa", description: "DQA研发质量分析", content: "综合研发问题、设计评审、ECN和非BOM分析研发质量。" },
  QMS: { id: "quality-analysis-qms", name: "quality-analysis-qms", description: "QMS客户质量分析", content: "综合客户评分、低分率和客户意见分析客户质量。" },
  DOAM: { id: "quality-analysis-doam", name: "quality-analysis-doam", description: "DOAM机台稳定性分析", content: "先报重叠月份再解释2026窗口；重叠不足3个月不得把总体同比写成年度改善。必须带班次分母、剔除局部后加权和带YYYY-MM标签的月度趋势。0-30天只打当前瓶颈，每项行动只有一个Owner。" },
};
const agentSourceModules = (name) => [name];
const ANALYSIS_CHOICE_KEY = "qms-quality-agent-choices-v1";
const readAnalysisChoices = () => {
  try {
    const value = JSON.parse(localStorage.getItem(ANALYSIS_CHOICE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
};
const readModuleChoice = (moduleName) => {
  const choice = readAnalysisChoices()[moduleName];
  return choice && typeof choice === "object" ? choice : {};
};
const writeModuleChoice = (moduleName, patch) => {
  try {
    const all = readAnalysisChoices();
    const current = all[moduleName] && typeof all[moduleName] === "object" ? all[moduleName] : {};
    localStorage.setItem(ANALYSIS_CHOICE_KEY, JSON.stringify({ ...all, [moduleName]: { ...current, ...patch } }));
  } catch {}
};
const savedAnalysisPeriod = (moduleName, fallback = {}) => {
  const choice = readModuleChoice(moduleName);
  const start2026 = /^\d{4}-\d{2}-\d{2}$/.test(choice.start2026 || "") ? choice.start2026 : "";
  const end2026 = /^\d{4}-\d{2}-\d{2}$/.test(choice.end2026 || "") ? choice.end2026 : "";
  if (!start2026 || !end2026) return { ...fallback };
  return { ...fallback, start2026, end2026 };
};
const IMPORTED_REPORTS_KEY = "qms-quality-agent-imported-reports-v1";
const MAX_IMPORTED_REPORTS_PER_MODULE = 12;
const ACTION_STATUS_LABELS = {
  "in-progress": "执行中",
  overdue: "逾期未达标",
  "verification-ready": "待核验关闭",
  closed: "已关闭",
  reopened: "已自动重开",
};
const actionMetricLabel = (item) => item.metricKey
  ? `${item.metricKey}：${item.currentValue ?? "待取数"} / 目标${item.direction === "gte" ? "≥" : "≤"}${item.target ?? "待定"}`
  : "人工证据复查";
const reportLayoutClass = (layoutProfileId) => reportPresentationClass(layoutProfileId);
const reportLayoutLabel = (layoutProfileId) => getReportPresentationProfile(layoutProfileId)?.label || "研究简报网页风格";
const savedReportLayout = (report) => {
  return normalizeReportPresentationProfile(String(report?.layoutProfileId || report?.layoutSkillName || ""));
};
const initialReportLayout = () => {
  if (typeof localStorage === "undefined") return DEFAULT_REPORT_PRESENTATION_PROFILE;
  return normalizeReportPresentationProfile(localStorage.getItem(REPORT_PRESENTATION_STORAGE_KEY) || "");
};

const readImportedReports = () => {
  try {
    const value = JSON.parse(localStorage.getItem(IMPORTED_REPORTS_KEY) || "{}");
    if (!value || typeof value !== "object") return {};
    const normalized = Object.fromEntries(Object.entries(value).map(([module, reports]) => [module, (Array.isArray(reports) ? reports : [])
      .map((report) => ({ ...report, content: String(report?.content || "").slice(0, 120000) }))
      .filter((report) => report.content && !(/\.docx?$/i.test(report.fileName || "") && (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(report.content) || (report.content.match(/\ufffd/g) || []).length > 10))).slice(0, MAX_IMPORTED_REPORTS_PER_MODULE)]));
    if (JSON.stringify(normalized) !== JSON.stringify(value)) localStorage.setItem(IMPORTED_REPORTS_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return {};
  }
};

const saveImportedReports = (value) => {
  try { localStorage.setItem(IMPORTED_REPORTS_KEY, JSON.stringify(value)); } catch {}
};

const readDocxReport = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("无法读取 DOCX 压缩包");
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
    const name = new TextDecoder("utf-8").decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength));
    if (name === "word/document.xml") documentEntry = { method, compressedSize, localHeaderOffset };
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  if (!documentEntry) throw new Error("DOCX 中未找到正文内容");
  const local = documentEntry.localHeaderOffset;
  const localNameLength = view.getUint16(local + 26, true);
  const localExtraLength = view.getUint16(local + 28, true);
  const dataStart = local + 30 + localNameLength + localExtraLength;
  const compressed = bytes.slice(dataStart, dataStart + documentEntry.compressedSize);
  let xmlBytes = compressed;
  if (documentEntry.method === 8) {
    if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持 DOCX 解压，请使用新版 Chrome/Edge");
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (documentEntry.method !== 0) {
    throw new Error("DOCX 使用了暂不支持的压缩方式");
  }
  const xml = new DOMParser().parseFromString(new TextDecoder("utf-8").decode(xmlBytes), "application/xml");
  const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paragraphs = [...xml.getElementsByTagNameNS(namespace, "p")]
    .map((paragraph) => [...paragraph.getElementsByTagNameNS(namespace, "t")].map((item) => item.textContent || "").join("").trim())
    .filter(Boolean);
  if (!paragraphs.length) throw new Error("DOCX 中没有可提取的正文文本");
  return paragraphs.join("\n").slice(0, 120000);
};

const importedContentFromText = (fileName, text) => {
  if (!/\.json$/i.test(fileName)) return text;
  try {
    const value = JSON.parse(text);
    if (typeof value?.content === "string") return value.content;
    if (typeof value?.report === "string") return value.report;
    if (value?.reports && typeof value.reports === "object") {
      return Object.entries(value.reports).map(([name, content]) => `## ${name}\n${typeof content === "string" ? content : JSON.stringify(content, null, 2)}`).join("\n\n");
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return text;
  }
};

// This is intentionally the same Markdown payload used by the download action.
export const reportFileName = (record = {}, extension = "md") => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const segments = [
    AGENT_TITLE,
    record.module || "报告",
    record.skillName || "",
    record.role || "",
    record.recipient || "",
    `model-${record.model || "unknown"}`,
    `ip-${record.creatorIp || "unknown"}`,
    stamp,
  ].filter(Boolean).map((value) => String(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim());
  return `${segments.join("-")}.${extension}`;
};
const reportShareUrl = (reportModule, source = {}) => {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || "").trim();
  const currentOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const currentHost = typeof window === "undefined" ? "" : window.location.hostname;
  const loopback = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(currentHost);
  const base = configured || currentOrigin;
  if (loopback && !configured) throw new Error("当前页面是本机地址，无法分享给其他电脑；请配置 VITE_PUBLIC_APP_URL 或使用服务器内网地址打开");
  const url = new URL("/", base);
  url.searchParams.set("qualityAgent", reportModule);
  if (source.fileName && !source.localOnly && !source.importedAt) url.searchParams.set("agentReport", source.fileName);
  return url.toString();
};
const downloadAgentReport = (record) => {
  const blob = new Blob([sanitizeHumanReportContent(record.content || "暂无报告")], { type: "text/markdown;charset=utf-8" });
  downloadBlob(blob, reportFileName(record, "md"));
};

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 1200);
};

const savePdfBlobWithPicker = async (blob, fileName) => {
  if (typeof window.showSaveFilePicker !== "function") {
    throw new Error("当前浏览器不支持系统保存窗口，请使用最新版 Chrome/Edge 并通过 HTTPS 或本机地址访问");
  }
  const handle = await window.showSaveFilePicker({
    suggestedName: fileName,
    types: [{ description: "PDF 文件", accept: { "application/pdf": [".pdf"] } }],
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!bytes.byteLength) throw new Error("PDF 内容为空，未执行保存");
  const writable = await handle.createWritable();
  await writable.write({ type: "write", position: 0, data: bytes });
  await writable.close();
  const savedFile = await handle.getFile();
  if (savedFile.size !== bytes.byteLength) {
    throw new Error(`PDF 写入校验失败：应为 ${bytes.byteLength} 字节，实际为 ${savedFile.size} 字节`);
  }
  return savedFile.size;
};

const printAgentReport = (node) => {
  if (!node) throw new Error("当前没有可打印的报告内容");
  const overlay = document.createElement("main");
  overlay.className = "report-print-overlay";
  overlay.append(node.cloneNode(true));
  const cleanup = () => overlay.remove();
  document.body.append(overlay);
  window.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(() => {
    window.print();
    // Some browsers do not emit afterprint when the dialog is cancelled.
    window.setTimeout(cleanup, 1500);
  }, 60);
};

const escapeHtml = (value) => String(value || "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
const categoryText = (value, seen) => {
  const guard = seen instanceof Set ? seen : new Set();
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "object" || guard.has(value)) return "";
  guard.add(value);
  return categoryText(value.name ?? value.label ?? value.text ?? "", guard);
};
const periodAxisText = (value, withYear = false) => {
  const text = categoryText(value);
  const month = text.match(/^((?:19|20)\d{2})[-/.年](0?[1-9]|1[0-2])$/);
  if (month) return withYear ? `${month[1]}年${Number(month[2])}月` : `${Number(month[2])}月`;
  const week = text.match(/W(\d{1,2})$/i);
  if (week) return `W${String(week[1]).padStart(2, "0")}`;
  return text;
};
const periodLabelsNeedYear = (labels) => new Set(labels.map((item) => categoryText(item).match(/^((?:19|20)\d{2})/)?.[1]).filter(Boolean)).size > 1;
const inlineReportMarkdown = (value) => escapeHtml(value)
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*([^*]+)\*/g, "<em>$1</em>");
const isMarkdownTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);
const isMarkdownTableSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const reportNumber = (value) => {
  const text = String(value || "").replace(/[,*_`，]/g, "").trim();
  if (!text || /(?:S|M|O|C|X)-[A-Z0-9]+-\d{3}/i.test(text)) return null;
  if (/(?:\d{4}\s*年|\d{4}-\d{2}-\d{2}|\d{1,2}\s*月\s*\d{1,2}\s*日)/.test(text)) return null;
  const matched = text.match(/[-+]?\d+(?:\.\d+)?/);
  if (!matched) return null;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const chartText = (value, limit = 12) => {
  const text = String(value || "未命名").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};
const isWeekChartContext = (...values) => /周|week/i.test(values.map((item) => String(item || "")).join(" "));
const lieflatClass = (theme) => theme === "lieflat" ? " lieflat-mono" : "";
const niceChartMax = (value) => {
  const source = Math.max(1, Number(value) || 1);
  const magnitude = 10 ** Math.floor(Math.log10(source));
  const normalized = source / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
};
const renderComboChart = ({ title, subtitle, rows, barLabel, lineLabel, lineMin = 0, lineMax = 100, lineClass = "rate", theme = "default" }) => {
  const sourceRows = (rows || []).filter((row) => Number.isFinite(row.bar) && Number.isFinite(row.line)).slice(0, 12);
  if (sourceRows.length < 2) return "";
  const width = 920;
  const height = 380;
  const margin = { top: 32, right: 66, bottom: 94, left: 70 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const barMax = niceChartMax(Math.max(...sourceRows.map((row) => row.bar), 1));
  const rateMin = Math.max(0, Math.min(lineMin, lineMax - 1));
  const rateMax = Math.max(rateMin + 1, lineMax);
  const step = plotWidth / sourceRows.length;
  const barWidth = Math.min(46, step * .48);
  const barY = (value) => margin.top + plotHeight - (Math.max(0, value) / barMax) * plotHeight;
  const lineY = (value) => margin.top + plotHeight - ((Math.max(rateMin, Math.min(rateMax, value)) - rateMin) / (rateMax - rateMin)) * plotHeight;
  const points = sourceRows.map((row, index) => `${(margin.left + step * (index + .5)).toFixed(1)},${lineY(row.line).toFixed(1)}`).join(" ");
  const leftTicks = [0, .25, .5, .75, 1].map((ratio) => {
    const y = margin.top + plotHeight * (1 - ratio);
    const value = Math.round(barMax * ratio);
    return `<g><line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="combo-grid"/><text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" class="combo-axis-label">${value.toLocaleString("zh-CN")}</text></g>`;
  }).join("");
  const rightTicks = [0, .25, .5, .75, 1].map((ratio) => {
    const y = margin.top + plotHeight * (1 - ratio);
    const value = rateMin + (rateMax - rateMin) * ratio;
    return `<text x="${width - margin.right + 10}" y="${y + 4}" class="combo-axis-label">${Number(value.toFixed(1))}%</text>`;
  }).join("");
  const bars = sourceRows.map((row, index) => {
    const center = margin.left + step * (index + .5);
    const y = barY(row.bar);
    const label = escapeHtml(chartText(row.label));
    return `<g><title>${escapeHtml(row.label)}：${barLabel} ${row.bar.toLocaleString("zh-CN")}；${lineLabel} ${row.line}%</title><rect x="${(center - barWidth / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, margin.top + plotHeight - y).toFixed(1)}" rx="${theme === "lieflat" ? 0 : 5}" class="combo-bar"/><text x="${center.toFixed(1)}" y="${Math.max(margin.top + 11, y - 7).toFixed(1)}" text-anchor="middle" class="combo-value">${escapeHtml(row.bar.toLocaleString("zh-CN"))}</text><text x="${center.toFixed(1)}" y="${margin.top + plotHeight + 20}" text-anchor="end" transform="rotate(-32 ${center.toFixed(1)} ${margin.top + plotHeight + 20})" class="combo-x-label">${label}</text></g>`;
  }).join("");
  const pointsMarkup = sourceRows.map((row, index) => {
    const x = margin.left + step * (index + .5);
    const y = lineY(row.line);
    return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${theme === "lieflat" ? 2.4 : 5}" class="combo-line-point"/><text x="${x.toFixed(1)}" y="${Math.max(margin.top + 10, y - 10).toFixed(1)}" text-anchor="middle" class="combo-rate-value">${Number(row.line.toFixed(1))}%</text></g>`;
  }).join("");
  const eightyLine = rateMin < 80 && rateMax >= 80
    ? `<line x1="${margin.left}" y1="${lineY(80)}" x2="${width - margin.right}" y2="${lineY(80)}" class="combo-threshold"/><text x="${width - margin.right - 4}" y="${lineY(80) - 5}" text-anchor="end" class="combo-threshold-label">80%</text>`
    : "";
  return `<figure class="agent-report-auto-chart agent-report-combo-chart combo-${lineClass}${lieflatClass(theme)}" role="img" aria-label="${escapeHtml(title)}，柱形为${escapeHtml(barLabel)}，折线为${escapeHtml(lineLabel)}"><figcaption><strong>${escapeHtml(title)}</strong></figcaption><div class="agent-report-combo-legend"><span><i class="bar"></i>${escapeHtml(barLabel)}</span><span><i class="line"></i>${escapeHtml(lineLabel)}</span></div><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${leftTicks}${rightTicks}${eightyLine}<line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" class="combo-axis"/>${bars}<polyline points="${points}" class="combo-line"/>${pointsMarkup}</svg></figure>`;
};
const renderYearComparisonComboChart = ({ title, subtitle, rows }) => {
  const sourceRows = (rows || []).filter((row) => row.label
    && [row.qty2025, row.qty2026, row.rate2025, row.rate2026].every(Number.isFinite)).slice(0, 12);
  if (sourceRows.length < 2) return "";
  const width = 920;
  const height = 400;
  const margin = { top: 34, right: 68, bottom: 86, left: 70 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const barMax = niceChartMax(Math.max(...sourceRows.flatMap((row) => [row.qty2025, row.qty2026]), 1));
  const minRateValue = Math.min(...sourceRows.flatMap((row) => [row.rate2025, row.rate2026]));
  const rateMin = Math.max(0, Math.floor((minRateValue - 3) / 5) * 5);
  const rateMax = 100;
  const step = plotWidth / sourceRows.length;
  const barWidth = Math.min(30, step * .28);
  const barY = (value) => margin.top + plotHeight - (Math.max(0, value) / barMax) * plotHeight;
  const lineY = (value) => margin.top + plotHeight - ((Math.max(rateMin, Math.min(rateMax, value)) - rateMin) / Math.max(1, rateMax - rateMin)) * plotHeight;
  const leftTicks = [0, .25, .5, .75, 1].map((ratio) => {
    const y = margin.top + plotHeight * (1 - ratio);
    return `<g><line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="combo-grid"/><text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" class="combo-axis-label">${Math.round(barMax * ratio).toLocaleString("zh-CN")}</text></g>`;
  }).join("");
  const rightTicks = [0, .25, .5, .75, 1].map((ratio) => {
    const y = margin.top + plotHeight * (1 - ratio);
    const value = rateMin + (rateMax - rateMin) * ratio;
    return `<text x="${width - margin.right + 10}" y="${y + 4}" class="combo-axis-label">${Number(value.toFixed(1))}%</text>`;
  }).join("");
  const bars = sourceRows.map((row, index) => {
    const center = margin.left + step * (index + .5);
    const y2025 = barY(row.qty2025);
    const y2026 = barY(row.qty2026);
    return `<g><title>${escapeHtml(row.label)}：2025检验批次 ${row.qty2025.toLocaleString("zh-CN")}，良率 ${row.rate2025}%；2026检验批次 ${row.qty2026.toLocaleString("zh-CN")}，良率 ${row.rate2026}%</title><rect x="${(center - barWidth - 2).toFixed(1)}" y="${y2025.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, margin.top + plotHeight - y2025).toFixed(1)}" rx="4" class="combo-bar combo-bar-2025"/><rect x="${(center + 2).toFixed(1)}" y="${y2026.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, margin.top + plotHeight - y2026).toFixed(1)}" rx="4" class="combo-bar combo-bar-2026"/><text x="${center.toFixed(1)}" y="${margin.top + plotHeight + 22}" text-anchor="middle" class="combo-x-label">${escapeHtml(chartText(row.label, 9))}</text></g>`;
  }).join("");
  const seriesMarkup = [2025, 2026].map((year) => {
    const points = sourceRows.map((row, index) => `${(margin.left + step * (index + .5)).toFixed(1)},${lineY(row[`rate${year}`]).toFixed(1)}`).join(" ");
    const pointMarkup = sourceRows.map((row, index) => {
      const x = margin.left + step * (index + .5);
      const y = lineY(row[`rate${year}`]);
      const labelY = year === 2025 ? y - 10 : y + 18;
      return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" class="combo-line-point combo-line-point-${year}"/><text x="${x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" class="combo-rate-value combo-rate-value-${year}">${Number(row[`rate${year}`].toFixed(1))}%</text></g>`;
    }).join("");
    return `<polyline points="${points}" class="combo-line combo-line-${year}"/>${pointMarkup}`;
  }).join("");
  return `<figure class="agent-report-auto-chart agent-report-combo-chart combo-year-compare" role="img" aria-label="${escapeHtml(title)}，柱形为2025和2026检验批次，折线为2025和2026批次良率"><figcaption><strong>${escapeHtml(title)}</strong></figcaption><div class="agent-report-combo-legend"><span><i class="bar bar-2025"></i>2025检验批次</span><span><i class="bar bar-2026"></i>2026检验批次</span><span><i class="line line-2025"></i>2025良率</span><span><i class="line line-2026"></i>2026良率</span></div><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${leftTicks}${rightTicks}<line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" class="combo-axis"/>${bars}${seriesMarkup}</svg></figure>`;
};
const paretoReportChart = (header, body, sectionTitle) => {
  const context = `${sectionTitle} ${header.join(" ")}`;
  if (!/Pareto/i.test(context)) return null;
  const countColumn = header.findIndex((item) => /(?:不合格批次|问题数|异常数|数量|次数|件数)/i.test(item));
  const cumulativeColumn = header.findIndex((item) => /累计\s*%?/i.test(item));
  const shareColumn = header.findIndex((item) => /占比\s*%?/i.test(item));
  if (countColumn < 0 || (cumulativeColumn < 0 && shareColumn < 0)) return null;
  const labelColumns = header.map((item, index) => ({ item, index }))
    .filter(({ item, index }) => index !== countColumn && index !== cumulativeColumn && index !== shareColumn && !/(?:排名|序号|证据|编号|说明|备注)/i.test(item))
    .map(({ index }) => index)
    .slice(0, 2);
  const rowLabel = (row) => labelColumns.map((column) => row[column] || "").join(" ");
  const explicitTotalRow = body.find((row) => /(?:合计|总计)/i.test(rowLabel(row)));
  const hasRemainder = body.some((row) => /(?:其他项|其它项|其余)/i.test(rowLabel(row)));
  const denominator = reportNumber(explicitTotalRow?.[countColumn])
    || (hasRemainder ? body.filter((row) => !/(?:合计|总计)/i.test(rowLabel(row))).reduce((sum, row) => sum + (reportNumber(row[countColumn]) || 0), 0) : 0);
  let cumulative = 0;
  let previousReportedCumulative = 0;
  const rows = body.filter((row) => !/(?:其他项|其它项|其余|合计|总计)/i.test(rowLabel(row))).map((row) => {
    const count = reportNumber(row[countColumn]);
    const share = shareColumn >= 0 ? reportNumber(row[shareColumn]) : null;
    const reportedCumulative = cumulativeColumn >= 0 ? reportNumber(row[cumulativeColumn]) : null;
    const increment = Number.isFinite(share)
      ? share
      : denominator > 0 && Number.isFinite(count) ? count / denominator * 100
        : Number.isFinite(reportedCumulative) ? Math.max(0, reportedCumulative - previousReportedCumulative) : 0;
    cumulative = Math.min(100, cumulative + increment);
    if (Number.isFinite(reportedCumulative)) previousReportedCumulative = reportedCumulative;
    return {
      label: labelColumns.map((column) => row[column]).filter(Boolean).join(" · "),
      bar: count,
      line: Number(cumulative.toFixed(1)),
    };
  }).filter((row) => Number.isFinite(row.bar) && Number.isFinite(row.line));
  if (rows.length < 2) return null;
  return { kind: "pareto", rows, barLabel: header[countColumn], lineLabel: "累计占比", sectionTitle };
};
const renderIqcSnapshotCharts = (snapshot) => {
  if (snapshot?.module !== "IQC") return {};
  const categories = (snapshot?.data?.evidence?.categories || []).map((row) => ({
    label: row.name || row.material || row.category,
    bar: reportNumber(row.y2026Qty ?? row.quantity ?? row.qty),
    line: reportNumber(row.y2026Rate ?? row.rate ?? row.value),
  })).filter((row) => row.label && Number.isFinite(row.bar) && Number.isFinite(row.line));
  const trends = (snapshot?.data?.evidence?.trends || []).map((row) => ({
    label: row.month || row.period || row.name,
    qty2025: reportNumber(row.y2025Qty),
    qty2026: reportNumber(row.y2026Qty ?? row.quantity ?? row.qty),
    rate2025: reportNumber(row.y2025Rate),
    rate2026: reportNumber(row.y2026Rate ?? row.rate),
  })).filter((row) => row.label && [row.qty2025, row.qty2026, row.rate2025, row.rate2026].every(Number.isFinite));
  const minRate = (rows) => rows.length ? Math.max(0, Math.floor((Math.min(...rows.map((row) => row.line)) - 3) / 5) * 5) : 0;
  return {
    material: renderComboChart({ title: "物料类别检验数量与良率", subtitle: "柱形表示 2026 检验批次，折线表示批次良率", rows: categories, barLabel: "检验批次", lineLabel: "良率", lineMin: minRate(categories), lineMax: 100, lineClass: "yield" }),
    monthly: renderYearComparisonComboChart({ title: "月度检验批次与良率同比", subtitle: "杭州 + 深圳汇总 · 分组柱形表示两年月度检验批次，折线表示两年月度批次良率", rows: trends }),
  };
};

// Build module-level trend figures from the fixed snapshot.  This keeps
// charts deterministic when an upstream model omits or misformats its visual
// contract, while preserving the module's existing metric definitions.
const buildModulePeriodTrendFigure = ({ module, rows, title, badLabel = "不良数量", totalLabel = "总数量", rateLabel = "不良率", sectionId = "趋势分析" }) => {
  const source = (rows || []).map((row) => {
    const label = String(row.label || row.month || row.period || "").trim();
    const bad = Number(row.bad);
    const total = Number(row.total);
    if (!label || !Number.isFinite(bad) || !Number.isFinite(total) || total < 0 || bad < 0) return null;
    return { label, bad: Math.max(0, bad), total: Math.max(0, total), rate: total > 0 ? Number((Math.max(0, bad) / total * 100).toFixed(2)) : 0 };
  }).filter(Boolean);
  if (source.length < 2) return null;
  return {
    id: `${String(module || "module").toLowerCase()}-period-trend`,
    sectionId,
    intent: "period-trend",
    preferredChart: "dual-column-line",
    title,
    unit: "条/件/批",
    categories: source.map((row) => row.label),
    series: [
      { name: badLabel, values: source.map((row) => Number(row.bad.toFixed(2))), axis: "left" },
      { name: totalLabel, values: source.map((row) => Number(row.total.toFixed(2))), axis: "left" },
      { name: rateLabel, values: source.map((row) => row.rate), axis: "right", unit: "%" },
    ],
    coverage: "complete",
    sourceEvidenceIds: [],
    accessibilitySummary: `${title}使用两组柱形表示${badLabel}和${totalLabel}，折线表示不良率。`,
    tablePolicy: "replace",
  };
};

const buildModuleVisualSpec = (snapshot, module, options = {}) => {
  const evidence = snapshot?.data?.evidence || {};
  const trends = Array.isArray(evidence.trends) ? evidence.trends : [];
  let rows = [];
  let title = "周期质量趋势";
  let badLabel = "不良数量";
  let totalLabel = "总数量";
  if (module === "IPQC" && options.ipqcAssembly) {
    const cellMonthly = snapshot?.data?.ipqcSplit?.cellMonthly;
    if (Array.isArray(cellMonthly) && cellMonthly.length) {
      const year = snapshot.data.ipqcSplit.trendYear || snapshot?.data?.periodTrend?.year || "";
      const figures = cellMonthly.map((cell, index) => {
        const figure = buildModulePeriodTrendFigure({
          module,
          rows: (cell.rows || []).filter((row) => Number(row.inspected) > 0).map((row) => ({ label: row.month, bad: Number(row.bad), total: Number(row.inspected), rate: Number(row.rate) || 0 })),
          title: (year ? year + "年" : "") + (cell.label || cell.name) + "月度趋势",
          badLabel: "异常数",
          totalLabel: "送检数",
          rateLabel: "异常密度",
          sectionId: "四格",
        });
        return figure ? { ...figure, id: "ipqc-cell-trend-" + index, sectionId: "四格", year } : null;
      }).filter(Boolean);
      if (figures.length) return { version: "1.0", layoutProfile: DEFAULT_REPORT_PRESENTATION_PROFILE, reportKind: "module", subject: { scopeType: "company" }, figures, tableFallbacks: [], sourceLimitations: [] };
    }
  }
  if (module === "DQA" && options.dqaRd) {
    return { version: "1.0", layoutProfile: DEFAULT_REPORT_PRESENTATION_PROFILE, reportKind: "module", subject: { scopeType: "company" }, figures: [], tableFallbacks: [], sourceLimitations: [] };
  }
  if (module === "OQC" && options.oqcShipment) {
    const divisionMonthly = snapshot?.data?.oqcSplit?.divisionMonthly;
    if (Array.isArray(divisionMonthly) && divisionMonthly.length) {
      const year = snapshot.data.oqcSplit.trendYear || snapshot?.data?.periodTrend?.year || "";
      const figures = divisionMonthly.map((cell, index) => {
        const figure = buildModulePeriodTrendFigure({
          module,
          rows: (cell.rows || []).filter((row) => Number(row.count) > 0).map((row) => ({ label: row.month, bad: Number(row.five), total: Number(row.count), rate: Number(row.fiveRate) || 0 })),
          title: (year ? year + "年" : "") + (cell.label || cell.name) + "月度趋势",
          badLabel: "5分台数",
          totalLabel: "出货台数",
          rateLabel: "5分率",
          sectionId: "产品部",
        });
        return figure ? { ...figure, id: "oqc-cell-trend-" + index, sectionId: "产品部", year } : null;
      }).filter(Boolean);
      if (figures.length) return { version: "1.0", layoutProfile: DEFAULT_REPORT_PRESENTATION_PROFILE, reportKind: "module", subject: { scopeType: "company" }, figures, tableFallbacks: [], sourceLimitations: [] };
    }
  }
  if (module === "IPQC") {
    rows = trends.map((row) => ({ label: row.month || row.period, bad: Number(row.y2026Bad), total: Number(row.y2026Qty) }));
    title = "送检量与异常密度趋势";
    badLabel = "异常数量";
    totalLabel = "送检数量";
  } else if (module === "IQC") {
    const cellMonthly = snapshot?.data?.iqcSplit?.cellMonthly;
    if (Array.isArray(cellMonthly) && cellMonthly.length) {
      const year = snapshot.data.iqcSplit.trendYear || snapshot?.data?.periodTrend?.year || "";
      const figures = cellMonthly.map((cell, index) => {
        const figure = buildModulePeriodTrendFigure({
          module,
          rows: (cell.rows || []).map((row) => ({ label: row.month, bad: Number(row.bad), total: Number(row.inspected), rate: Number(row.rate) || 0 })),
          title: (year ? year + "年" : "") + (cell.label || cell.name) + "月度趋势",
          badLabel: "不合格批次",
          totalLabel: "检验批次",
          rateLabel: "不合格率",
          sectionId: "四格结果",
        });
        return figure ? { ...figure, id: "iqc-cell-trend-" + index, sectionId: "四格结果", year } : null;
      }).filter(Boolean);
      if (figures.length) return { version: "1.0", layoutProfile: DEFAULT_REPORT_PRESENTATION_PROFILE, reportKind: "module", subject: { scopeType: "company" }, figures, tableFallbacks: [], sourceLimitations: [] };
    }
    const fixed = Array.isArray(snapshot?.data?.periodTrend?.rows) ? snapshot.data.periodTrend.rows : [];
    rows = fixed.length ? fixed.map((row) => ({ label: row.label || row.month, bad: Number(row.bad), total: Number(row.total) })) : trends.map((row) => ({ label: row.month || row.period, bad: Number(row.y2026Bad), total: Number(row.y2026Qty) }));
    const trendYear = snapshot?.data?.periodTrend?.year || "";
    title = trendYear ? trendYear + "年检验批次与不良批次趋势" : "检验批次与不良批次趋势";
    badLabel = "不合格批次";
    totalLabel = "检验批次";
  } else if (module === "OQC") {
    // OQC stores one monthly row per product division. Aggregate divisions
    // before drawing a company-level trend so rows are not duplicated.
    const grouped = new Map();
    trends.forEach((row) => {
      const label = String(row.month || row.period || "").trim();
      if (!label) return;
      const current = grouped.get(label) || { label, bad: 0, total: 0 };
      current.bad += Number(row.y2026Low) || 0;
      current.total += Number(row.y2026Count) || 0;
      grouped.set(label, current);
    });
    rows = [...grouped.values()];
    title = "出货低分机台与评价机台趋势";
    badLabel = "低分机台";
    totalLabel = "评价机台";
  } else if (module === "QMS") {
    const splitPeriods = Array.isArray(snapshot?.data?.qmsSplit?.periods) ? snapshot.data.qmsSplit.periods : [];
    const sourced = splitPeriods.filter((row) => Number(row.samples) > 0);
    rows = (sourced.length ? sourced : trends).map((row) => ({ label: row.name || row.period || row.month || row.label, bad: Number(row.lowCount) || 0, total: Number(row.samples) || 0 }));
    title = "客户低分样本与有效样本趋势";
    badLabel = "低分样本";
    totalLabel = "有效样本";
  }
  const endMonth = Number(String(snapshot?.period?.end2026 || "").slice(5, 7)) || 12;
  rows = rows.filter((row) => {
    const match = String(row.label || "").match(/(?:^|\D)(\d{1,2})\s*月/) || String(row.label || "").match(/-(\d{2})$/);
    const month = match ? Number(match[1]) : 0;
    return !month || month <= endMonth;
  });
  const figure = buildModulePeriodTrendFigure({ module, rows, title, badLabel, totalLabel, rateLabel: module === "QMS" ? "低分率" : "不良率", sectionId: module === "QMS" ? "半年趋势" : "趋势分析" });
  if (figure && snapshot?.data?.periodTrend?.year) figure.year = snapshot.data.periodTrend.year;
  return figure ? { version: "1.0", layoutProfile: DEFAULT_REPORT_PRESENTATION_PROFILE, reportKind: "module", subject: { scopeType: "company" }, figures: [figure], tableFallbacks: [], sourceLimitations: [] } : null;
};
const mergeModuleVisualSpec = (baseSpec, snapshot, module, options = {}) => {
  const moduleSpec = buildModuleVisualSpec(snapshot, module, options);
  const baseFigures = Array.isArray(baseSpec?.figures) ? baseSpec.figures : [];
  const cellFigure = (figure) => { const id = String(figure?.id || ""); return id.startsWith("iqc-cell-trend") || id.startsWith("ipqc-cell-trend") || id.startsWith("oqc-cell-trend"); };
  const moduleHasCells = (moduleSpec?.figures || []).some(cellFigure);
  const baseHasCells = baseFigures.some(cellFigure);
  if ((module === "IQC" || options.ipqcAssembly || options.oqcShipment) && !moduleHasCells && baseHasCells) return baseSpec;
  if (!moduleSpec) return baseSpec || null;
  const base = baseSpec && typeof baseSpec === "object" ? baseSpec : {};
  // A fixed module trend is authoritative. Replace a model-provided trend
  // with it instead of rendering two charts for the same section.
  const figures = (Array.isArray(base.figures) ? base.figures : []).filter((figure) => {
    const intent = `${figure?.intent || ""} ${figure?.preferredChart || ""}`.toLowerCase();
    return !(intent.includes("period-trend") || intent.includes("dual-column-line"));
  });
  const moduleFigures = moduleSpec.figures || [];
  const existingIds = new Set(figures.map((figure) => String(figure?.id || "")));
  return {
    ...base,
    version: base.version || moduleSpec.version,
    layoutProfile: base.layoutProfile || moduleSpec.layoutProfile,
    reportKind: base.reportKind || moduleSpec.reportKind,
    subject: base.subject || moduleSpec.subject,
    figures: [...figures, ...moduleFigures.filter((figure) => !existingIds.has(String(figure.id)))],
    tableFallbacks: Array.isArray(base.tableFallbacks) ? base.tableFallbacks : [],
    sourceLimitations: Array.isArray(base.sourceLimitations) ? base.sourceLimitations : [],
  };
};
const chartableReportTable = (header, body, sectionTitle) => {
  if (body.length < 2 || body.length > 12 || header.length < 2) return null;
  const context = `${sectionTitle} ${header.join(" ")}`;
  const pareto = paretoReportChart(header, body, sectionTitle);
  if (pareto) return pareto;
  if (/(?:行动|措施|责任|期限|关闭|验证|根因|结论|风险判断|状态|交付物|待办|要做的事|完成时间|跟进)/i.test(sectionTitle)) return null;
  if (!/(?:排名|TOP|Pareto|趋势|分布|结构|供应商|缺陷|不良|批次|良率|物料类别|占比|集中|对比)/i.test(context)) return null;
  const ignoredColumn = (column) => /(?:排名|序号|证据|编号|累计|说明|备注)/i.test(header[column] || "");
  const candidateColumns = header.map((_, column) => column).filter((column) => !ignoredColumn(column) && body.filter((row) => reportNumber(row[column]) !== null).length >= Math.max(2, Math.ceil(body.length * 0.7)));
  const countColumns = candidateColumns.filter((column) => /(?:数量|批次|问题数|异常数|次数|件数|总数)/i.test(header[column] || ""));
  const timeColumns = candidateColumns.filter((column) => /(?:20\d{2}|本期|同期|当期|上期)/i.test(header[column] || ""));
  const rateColumns = candidateColumns.filter((column) => /(?:良率|占比|比例|密度|评分|得分|率\s*%?|%)/i.test(header[column] || ""));
  const preferredColumns = countColumns.length ? countColumns : timeColumns.length ? timeColumns : rateColumns.length ? rateColumns : candidateColumns;
  const numericColumns = preferredColumns.filter((column) => {
    const valid = body.filter((row) => reportNumber(row[column]) !== null).length;
    return valid >= Math.max(2, Math.ceil(body.length * 0.7));
  }).slice(0, 3);
  if (!numericColumns.length) return null;
  const labelColumns = header.map((_, column) => column).filter((column) => !numericColumns.includes(column) && !ignoredColumn(column) && body.some((row) => reportNumber(row[column]) === null && String(row[column] || "").trim())).slice(0, 2);
  if (!labelColumns.length) return null;
  const plotBody = /(?:Pareto|TOP|排名)/i.test(context)
    ? body.filter((row) => !/(?:其他项|其它项|其余|合计|总计)/i.test(labelColumns.map((column) => row[column] || "").join(" ")))
    : body;
  if (plotBody.length < 2) return null;
  const series = numericColumns.map((column) => ({ column, label: header[column] || `指标${column}` }));
  const values = plotBody.flatMap((row) => series.map((item) => reportNumber(row[item.column])).filter((value) => value !== null));
  const max = Math.max(...values, 0);
  if (!(max > 0)) return null;
  return { series, labelColumns, plotBody, max };
};
const renderReportChart = (header, body, sectionTitle, chart) => {
  if (chart.kind === "pareto") return renderComboChart({
    title: chart.sectionTitle || "Pareto 分析",
    subtitle: "柱形表示问题数量，折线表示累计占比",
    rows: chart.rows,
    barLabel: chart.barLabel || "问题数量",
    lineLabel: chart.lineLabel || "累计占比",
    lineMin: 0,
    lineMax: 100,
    lineClass: "pareto",
  });
  const title = escapeHtml(sectionTitle || `${header[0] || "项目"}对比`);
  const displayTitle = escapeHtml(sectionTitle ? `${header[0] || "项目"}数据图` : `${header[0] || "项目"}对比`);
  const legend = chart.series.length > 1 ? `<div class="agent-report-chart-legend">${chart.series.map((item, index) => `<span><i class="series-${index + 1}"></i>${escapeHtml(item.label)}</span>`).join("")}</div>` : "";
  const displayedBody = chart.plotBody || body;
  const rows = displayedBody.map((row) => {
    const label = chart.labelColumns.map((column) => String(row[column] || "").trim()).filter(Boolean).join(" · ") || "未命名";
    return `<div class="agent-report-chart-row"><strong>${escapeHtml(label)}</strong><div class="agent-report-chart-bars">${chart.series.map((item, index) => {
    const value = reportNumber(row[item.column]);
    const width = value === null ? 0 : Math.max(2, value / chart.max * 100);
    return `<div class="agent-report-chart-series"><span>${chart.series.length > 1 ? escapeHtml(item.label) : ""}</span><i><b class="series-${index + 1}" style="width:${width.toFixed(2)}%"></b></i><em>${escapeHtml(row[item.column] || "—")}</em></div>`;
  }).join("")}</div></div>`;
  }).join("");
  return `<figure class="agent-report-auto-chart series-count-${chart.series.length}" role="img" aria-label="${title}，共${displayedBody.length}个项目、${chart.series.length}组数值"><figcaption><strong>${displayTitle}</strong></figcaption>${legend}<div class="agent-report-chart-body">${rows}</div></figure>`;
};
const renderDualColumnLineChart = ({ title, subtitle, rows, barLabels = ["不良数量", "总数量"], lineLabel = "不良率", theme = "default" }) => {
  const finiteRows = (rows || []).filter((row) => Number.isFinite(row.bad) && Number.isFinite(row.total) && Number.isFinite(row.rate));
  const sourceRows = (isWeekChartContext(title, subtitle) ? keepActiveWeekChartRows(finiteRows) : finiteRows).slice(0, 24);
  if (sourceRows.length < 2) return "";
  const width = 980;
  const height = 420;
  const margin = { top: 34, right: 70, bottom: 98, left: 76 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = niceChartMax(Math.max(...sourceRows.flatMap((row) => [row.bad, row.total]), 1));
  const step = plotWidth / sourceRows.length;
  const groupWidth = Math.min(62, step * .7);
  const barWidth = Math.max(8, groupWidth / 2 - 3);
  const barY = (value) => margin.top + plotHeight - (Math.max(0, value) / maxValue) * plotHeight;
  const lineY = (value) => margin.top + plotHeight - Math.max(0, Math.min(100, value)) / 100 * plotHeight;
  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const y = margin.top + plotHeight * (1 - ratio);
    return `<g><line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="combo-grid"/><text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" class="combo-axis-label">${Math.round(maxValue * ratio).toLocaleString("zh-CN")}</text></g>`;
  }).join("");
  const rightTicks = [0, 25, 50, 75, 100].map((value) => `<text x="${width - margin.right + 10}" y="${lineY(value) + 4}" class="combo-axis-label">${value}%</text>`).join("");
  const points = sourceRows.map((row, index) => `${(margin.left + step * (index + .5)).toFixed(1)},${lineY(row.rate).toFixed(1)}`).join(" ");
  const bars = sourceRows.map((row, index) => {
    const center = margin.left + step * (index + .5);
    const badY = barY(row.bad);
    const totalY = barY(row.total);
    const xBad = center - barWidth - 2;
    const xTotal = center + 2;
    const label = escapeHtml(chartText(row.label, 18));
    return `<g><title>${escapeHtml(row.label)}：${barLabels[0]} ${row.bad.toLocaleString("zh-CN")}；${barLabels[1]} ${row.total.toLocaleString("zh-CN")}；${lineLabel} ${row.rate}%</title><rect x="${xBad.toFixed(1)}" y="${badY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, margin.top + plotHeight - badY).toFixed(1)}" rx="${theme === "lieflat" ? 0 : 4}" class="combo-bar combo-bar-bad"/><rect x="${xTotal.toFixed(1)}" y="${totalY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, margin.top + plotHeight - totalY).toFixed(1)}" rx="${theme === "lieflat" ? 0 : 4}" class="combo-bar combo-bar-total"/><text x="${center.toFixed(1)}" y="${margin.top + plotHeight + 21}" text-anchor="end" transform="rotate(-32 ${center.toFixed(1)} ${margin.top + plotHeight + 21})" class="combo-x-label">${label}</text></g>`;
  }).join("");
  const pointsMarkup = sourceRows.map((row, index) => { const x = margin.left + step * (index + .5); const y = lineY(row.rate); return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${theme === "lieflat" ? 2.4 : 5}" class="combo-line-point"/><text x="${x.toFixed(1)}" y="${Math.max(margin.top + 10, y - 10).toFixed(1)}" text-anchor="middle" class="combo-rate-value">${row.rate}%</text></g>`; }).join("");
  return `<figure class="agent-report-auto-chart agent-report-combo-chart combo-period-trend${lieflatClass(theme)}" role="img" aria-label="${escapeHtml(title)}，两组柱形为${escapeHtml(barLabels.join("和"))}，折线为${escapeHtml(lineLabel)}"><figcaption><strong>${escapeHtml(title)}</strong></figcaption><div class="agent-report-combo-legend"><span><i class="bar bar-bad"></i>${escapeHtml(barLabels[0])}</span><span><i class="bar bar-total"></i>${escapeHtml(barLabels[1])}</span><span><i class="line"></i>${escapeHtml(lineLabel)}</span></div><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${grid}${rightTicks}<line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" class="combo-axis"/>${bars}<polyline points="${points}" class="combo-line"/>${pointsMarkup}</svg></figure>`;
};

const renderSingleSeriesLineChart = ({ title, subtitle, rows, seriesLabel = "数量", theme = "default" }) => {
  const finiteRows = (rows || []).filter((row) => row.label && Number.isFinite(row.value));
  const sourceRows = isWeekChartContext(title, subtitle) ? keepActiveWeekChartRows(finiteRows.map((row) => ({ ...row, count: row.value }))) : finiteRows;
  if (sourceRows.length < 2) return "";
  const width = Math.max(920, sourceRows.length * 48);
  const height = 350;
  const margin = { top: 38, right: 30, bottom: 88, left: 70 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = niceChartMax(Math.max(...sourceRows.map((row) => row.value), 1));
  const step = plotWidth / Math.max(sourceRows.length - 1, 1);
  const point = (row, index) => ({ x: margin.left + step * index, y: margin.top + plotHeight - Math.max(0, row.value) / maxValue * plotHeight });
  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const y = margin.top + plotHeight * (1 - ratio);
    return `<g><line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="combo-grid"/><text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" class="combo-axis-label">${Math.round(maxValue * ratio)}</text></g>`;
  }).join("");
  const points = sourceRows.map((row, index) => { const item = point(row, index); return `${item.x.toFixed(1)},${item.y.toFixed(1)}`; }).join(" ");
  const marks = sourceRows.map((row, index) => {
    const item = point(row, index);
    return `<g><title>${escapeHtml(row.label)}：${escapeHtml(seriesLabel)} ${row.value}</title><circle cx="${item.x.toFixed(1)}" cy="${item.y.toFixed(1)}" r="${theme === "lieflat" ? 2.4 : 5}" class="combo-line-point"/><text x="${item.x.toFixed(1)}" y="${Math.max(margin.top + 10, item.y - 10).toFixed(1)}" text-anchor="middle" class="combo-value">${row.value}</text><text x="${item.x.toFixed(1)}" y="${margin.top + plotHeight + 22}" text-anchor="end" transform="rotate(-32 ${item.x.toFixed(1)} ${margin.top + plotHeight + 22})" class="combo-x-label">${escapeHtml(chartText(row.label, 12))}</text></g>`;
  }).join("");
  return `<figure class="agent-report-auto-chart agent-report-combo-chart combo-single-line${lieflatClass(theme)}" role="img" aria-label="${escapeHtml(title)}，折线表示${escapeHtml(seriesLabel)}"><figcaption><strong>${escapeHtml(title)}</strong></figcaption><div class="agent-report-combo-legend"><span><i class="line"></i>${escapeHtml(seriesLabel)}</span></div><div style="overflow-x:auto"><svg viewBox="0 0 ${width} ${height}" style="min-width:${width}px" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${grid}<line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" class="combo-axis"/><polyline points="${points}" class="combo-line"/>${marks}</svg></div></figure>`;
};

// Render the machine-readable visual contract emitted by every Agent.  Older
// reports use `charts/data`, newer reports use `figures/categories/series`;
// both are normalised here so the Markdown renderer remains the single entry
// point for module and role reports.
const visualFigureList = (spec) => {
  if (!spec || typeof spec !== "object") return [];
  const figures = Array.isArray(spec.figures) ? spec.figures : [];
  const legacy = Array.isArray(spec.charts) ? spec.charts.map((chart) => {
    const data = chart.data;
    if (Array.isArray(data) && /heatmap/i.test(String(chart.type || ""))) return { ...chart, intent: "relationship", preferredChart: "heatmap", tablePolicy: "replace" };
    if (Array.isArray(data)) return { ...chart, categories: data.map((row) => row.name), series: [{ name: "数量", values: data.map((row) => Number(row.value) || 0), axis: "left" }, { name: "累计占比", values: data.map((row) => Number(row.cumulativeShare ?? row.share) || 0), axis: "right", unit: "%" }], intent: "pareto", preferredChart: "pareto-column-line", tablePolicy: "replace" };
    if (data && Array.isArray(data.months)) return { ...chart, categories: data.months, series: [{ name: "送检量", values: data.inspectedQty2026 || [], axis: "left" }, { name: "异常密度", values: data.issueRate2026 || [], axis: "right", unit: "%" }], intent: "trend", preferredChart: "column-line", tablePolicy: "replace" };
    return { ...chart, intent: chart.intent || "comparison", preferredChart: chart.preferredChart || "clustered-bar" };
  }) : [];
  return [...figures, ...legacy].map((figure, index) => ({ ...figure, __key: String(figure.id || `${figure.title || "figure"}-${index}`) }));
};
const figureMatchesSection = (figure, sectionTitle = "") => {
  const title = String(sectionTitle || "").toLowerCase();
  const fTitle = String(figure.title || "").toLowerCase();
  const intent = `${figure.intent || ""} ${figure.preferredChart || ""} ${figure.type || ""}`.toLowerCase();
  const sectionId = String(figure.sectionId || "").replace(/[.)、]/g, "").toLowerCase();
  if (sectionId) return title.includes(sectionId) || title.replace(/[.)、]/g, "").includes(sectionId);
  const aliases = [
    ["trend", "趋势"], ["rate-trend", "趋势"], ["pareto", "pareto"],
    ["period-trend", "趋势"], ["dual-column-line", "趋势"], ["period-trend", "过程"], ["dual-column-line", "过程"],
    ["ranking", "排名"], ["comparison", "对比"], ["distribution", "分布"],
    ["relationship", "交叉"], ["heatmap", "交叉"], ["timeline", "行动"],
  ];
  const alias = aliases.find(([key]) => intent.includes(key));
  if (alias && title.includes(alias[1])) return true;
  const words = fTitle.split(/[ ·×与和/—()（）]+/).filter((word) => word.length >= 2);
  return words.some((word) => title.includes(word));
};
const renderVisualSpecFigure = (figure, theme = "default") => {
  const categories = Array.isArray(figure.categories) ? figure.categories : [];
  const series = Array.isArray(figure.series) ? figure.series : [];
  if (theme === "lieflat") return renderLieflatFigure(figure);
  const intent = String(figure.intent || figure.preferredChart || "comparison").toLowerCase();
  const title = String(figure.title || "数据图表");
  if (!categories.length && !Array.isArray(figure.data)) return `<figure class="agent-report-auto-chart agent-report-visual-empty"><figcaption><strong>${escapeHtml(title)}</strong></figcaption><p>${escapeHtml(figure.data?.note || figure.accessibilitySummary || "当前缺少完整可视化分母，保留为待补数据，不生成误导性图表。")}</p></figure>`;
  if (String(figure.preferredChart).toLowerCase() === "line" && series.length === 1) return renderSingleSeriesLineChart({ title, subtitle: figure.accessibilitySummary || "按连续周期展示固定快照数量", rows: categories.map((label, index) => ({ label: categoryText(label), value: Number(series[0]?.values?.[index]) })), seriesLabel: series[0]?.name || figure.unit || "数量", theme });
  const makeRows = (barIndex = 0, lineIndex = 1) => categories.map((label, index) => ({ label: categoryText(label), bar: Number(series[barIndex]?.values?.[index]), line: Number(series[lineIndex]?.values?.[index]) })).filter((row) => Number.isFinite(row.bar) && Number.isFinite(row.line));
  if (intent.includes("pareto") || String(figure.preferredChart).includes("pareto")) return renderComboChart({ title, subtitle: `${figure.unit || "数量"}柱形 + 累计占比折线`, rows: makeRows(0, 1), barLabel: series[0]?.name || "数量", lineLabel: series[1]?.name || "累计占比", lineMin: 0, lineMax: 100, lineClass: "pareto", theme });
  if (intent.includes("period-trend") || intent.includes("dual-column-line") || String(figure.preferredChart).includes("dual-column-line")) {
    const withYear = periodLabelsNeedYear(categories);
    const rows = categories.map((label, index) => ({ label: periodAxisText(label, withYear), bad: Number(series[0]?.values?.[index]), total: Number(series[1]?.values?.[index]), rate: Number(series[2]?.values?.[index]) })).filter((row) => [row.bad, row.total, row.rate].every(Number.isFinite));
    const chartRows = isWeekChartContext(figure.id, figure.sectionId, title) ? keepActiveWeekChartRows(rows) : rows;
    return renderDualColumnLineChart({ title, subtitle: "柱形表示不良数量与总数量，折线表示不良率", rows: chartRows, barLabels: [series[0]?.name || "不良数量", series[1]?.name || "总数量"], lineLabel: series[2]?.name || "不良率", theme });
  }
  if (intent.includes("trend") || String(figure.preferredChart).includes("column-line")) return renderComboChart({ title, subtitle: `${series[0]?.name || "数量"}柱形 + ${series[1]?.name || "比率"}折线`, rows: makeRows(0, 1), barLabel: series[0]?.name || "数量", lineLabel: series[1]?.name || "比率", lineMin: 0, lineMax: 100, lineClass: "yield", theme });
  if (intent.includes("relationship") || intent.includes("heatmap") || String(figure.preferredChart).includes("heatmap")) {
    const rows = Array.isArray(figure.data) ? figure.data : categories.map((label, index) => ({ name: label, value: Number(series[0]?.values?.[index]) || 0 }));
    const max = Math.max(1, ...rows.map((row) => Number(row.value) || 0));
    return `<figure class="agent-report-auto-chart agent-report-visual-heatmap"><figcaption><strong>${escapeHtml(title)}</strong></figcaption><div class="agent-report-heatmap-grid">${rows.map((row) => `<div class="agent-report-heat-cell" style="--heat:${Math.max(.08, (Number(row.value) || 0) / max)}"><b>${escapeHtml(categoryText(row.organization || row.name || row.category) || "未命名")} × ${escapeHtml(row.mechanism || "")}</b><strong>${(Number(row.value) || 0).toLocaleString("zh-CN")}</strong></div>`).join("")}</div></figure>`;
  }
  const rows = categories.map((label, index) => {
    const category = label && typeof label === "object" ? label : { name: label };
    return { label: categoryText(category.name || category.label) || "未命名", focus: Boolean(category.focus), site: categoryText(category.site), values: series.map((item) => Number(item?.values?.[index]) || 0) };
  });
  const max = Math.max(1, ...rows.flatMap((row) => row.values));
  const ranking = intent.includes("ranking") || String(figure.preferredChart).includes("horizontal");
  return `<figure class="agent-report-auto-chart agent-report-visual-bars ${ranking ? "agent-report-visual-ranking" : ""}${lieflatClass(theme)}"><figcaption><strong>${escapeHtml(title)}</strong></figcaption><div class="agent-report-visual-legend">${series.map((item, index) => `<span><i class="series-${index + 1}"></i>${escapeHtml(item.name || `指标${index + 1}`)}</span>`).join("")}</div><div class="agent-report-visual-bars-body">${rows.map((row) => `<div class="agent-report-visual-bar-row ${row.focus ? "is-focus" : ""}"><b>${row.focus ? "★ " : ""}${escapeHtml(chartText(row.label, 22))}</b><div>${row.values.map((value, index) => `<i class="series-${index + 1}" style="width:${Math.max(2, value / max * 100).toFixed(2)}%"><span>${value.toLocaleString("zh-CN")}</span></i>`).join("")}</div></div>`).join("")}</div></figure>`;
};

const renderPeriodTrendTable = (figure) => {
  const intent = String(figure?.intent || figure?.preferredChart || "");
  if (!intent.includes("period-trend") && !intent.includes("dual-column-line")) return "";
  const categories = Array.isArray(figure?.categories) ? figure.categories : [];
  const series = Array.isArray(figure?.series) ? figure.series : [];
  if (!categories.length || series.length < 2) return "";
  const year = figure.year ? String(figure.year) + "年" : "";
  const labels = categories.map((label) => categoryText(label));
  const weekTable = labels.length > 0 && labels.every((item) => /W\d{1,2}$/i.test(item));
  const header = [weekTable ? "周次" : "月份", ...series.map((item) => item.name || "数值")];
  const withYear = periodLabelsNeedYear(categories);
  const body = categories.map((label, index) => [periodAxisText(label, withYear), ...series.map((item) => {
    const value = Number(item.values?.[index]);
    if (!Number.isFinite(value)) return "";
    const text = value.toLocaleString("zh-CN");
    return item.unit === "%" || /率/.test(item.name || "") ? text + "%" : text;
  })]);
  return '<div class="agent-report-table-wrap"><table class="agent-report-table"><caption>' + escapeHtml(year) + '年初至所选截止日期</caption><thead><tr>' + header.map((cell) => "<th>" + escapeHtml(cell) + "</th>").join("") + "</tr></thead><tbody>" + body.map((row) => "<tr>" + row.map((cell) => "<td>" + escapeHtml(cell) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
};
const renderFigureBlock = (figure, theme) => {
  const chart = renderVisualSpecFigure(figure, theme);
  return chart ? chart + renderPeriodTrendTable(figure) : "";
};
const renderMarkdownTable = (lines, { chartFirst = false, sectionTitle = "", suppressIqcYieldTable = false, visualFigures = [] } = {}) => {
  const rows = lines.map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  if (!rows.length) return "";
  const hasSeparator = rows.length > 1 && isMarkdownTableSeparator(lines[1]);
  const header = rows[0];
  const body = hasSeparator ? rows.slice(2) : rows.slice(1);
  if (suppressIqcYieldTable && /(?:物料类别.*良率|月度趋势)/i.test(`${sectionTitle} ${header.join(" ")}`)) return "";
  const visualCovered = (Array.isArray(visualFigures) ? visualFigures : []).some((figure) => figureMatchesSection(figure, sectionTitle));
  const chart = chartFirst && !visualCovered ? chartableReportTable(header, body, sectionTitle) : null;
  if (chart) return renderReportChart(header, body, sectionTitle, chart);
  return `<div class="${tableToneClass(sectionTitle)}"><table class="agent-report-table"><thead><tr>${header.map((cell) => `<th scope="col">${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${header.map((_, index) => `<td>${escapeHtml(row[index] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
};
const reportPublisherChrome = (content, fragment, profileId, module = "质量分析", lede = "", extras = {}) => {
  if (getReportPresentationProfile(profileId).renderer === "porcelainSheet") return renderPorcelainSheet(content, { module, lede, snapshot: extras.snapshot || null, visualSpec: extras.visualSpec || null });
  if (getReportPresentationProfile(profileId).renderer === "basicsSheet") return renderBasicsSheet(content, { module, lede, snapshot: extras.snapshot || null, visualSpec: extras.visualSpec || null });
  const source = sanitizeHumanReportContent(content);
  const title = source.match(/^#\s+(.+)$/m)?.[1]?.trim() || `${module} 质量分析报告`;
  const markdownHeadings = [...source.matchAll(/^#{2,3}\s+(.+)$/gm)].map((match) => match[1].trim()).filter(Boolean);
  const chineseHeadings = [...source.matchAll(/^[一二三四五六七八九十]+、\s*[^\n]+$/gm)].map((match) => match[0].trim());
  const headings = (markdownHeadings.length ? markdownHeadings : chineseHeadings).slice(0, 12);
  const metricItems = source.split(/\r?\n/).map((line) => metricLine(line.trim())).filter(Boolean).slice(0, 4);
  const toc = headings.length ? `<nav class="report-publisher-toc"><p>REPORT SECTIONS</p>${headings.map((heading, index) => `<a href="#report-section-${index + 1}">${escapeHtml(heading.replace(/^\d+[.)、]\s*/, ""))}</a>`).join("")}</nav>` : "";
  const quick = metricItems.length ? `<section class="report-publisher-quick"><div class="report-publisher-quick-grid">${metricItems.map((item) => `<div class="report-publisher-quick-item"><b>${inlineReportMarkdown(item.value)}</b><p>${inlineReportMarkdown(item.label)}</p></div>`).join("")}</div></section>` : "";
  const sectionedFragment = String(fragment || "").replace(/<section class="agent-report-section/g, (match, offset, whole) => {
    const before = whole.slice(0, offset);
    const sectionNumber = (before.match(/report-section-/g) || []).length + 1;
    return `<section id="report-section-${sectionNumber}" class="agent-report-section`;
  });
  return `<div class="report-publisher report-publisher-${escapeHtml(profileId || "research-briefing-v1")}"><div class="report-publisher-masthead"></div><header class="report-publisher-header"><strong>QUALITY <span>INTELLIGENCE</span></strong><small>${escapeHtml(reportLayoutLabel(profileId))}</small></header><section class="report-publisher-hero"><div><span class="report-publisher-eyebrow">QUALITY ANALYSIS AGENT / ${escapeHtml(module)}</span><h1>${inlineReportMarkdown(escapeHtml(title))}</h1><p>${escapeHtml(lede || "固定统计结果、证据卡和改善行动的管理复盘。")}</p></div></section>${quick}<div class="report-publisher-layout">${toc}<article class="report-publisher-article">${sectionedFragment}</article></div><footer class="report-publisher-footer">${escapeHtml(module)} · Agent 正式报告</footer></div>`;
};
const iqcCellLabel = (name) => String(name || "").replace("公司加工", "机加");
const iqcHtmlTable = (caption, headers, rows) => {
  if (!rows.length) return "";
  return '<div class="agent-report-table-wrap"><table class="agent-report-table"><caption>' + escapeHtml(caption) + '</caption><thead><tr>' + headers.map((cell) => "<th>" + escapeHtml(cell) + "</th>").join("") + "</tr></thead><tbody>" + rows.map((row) => "<tr>" + row.map((cell) => "<td>" + escapeHtml(cell) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
};
const iqcRateText = (value) => value == null || value === "" ? "" : String(value) + "%";
const rungLines = ({ axis, cross, length, color, half = 7, step = 4.2, seed = 1, vertical = false }) => {
  const span = Math.max(0, Number(length) || 0);
  if (span <= 0) return "";
  const count = Math.max(1, Math.round(span / step));
  const lines = [];
  for (let index = 0; index < count; index += 1) {
    const offset = count === 1 ? span : (span * index) / (count - 1);
    const jitter = ((index * 17 + seed) % 5) - 2;
    const reach = half + jitter * 0.28;
    const opacity = (0.82 + ((index * 13 + seed) % 10) / 50).toFixed(2);
    const pos = axis + (vertical ? 0 : offset);
    const y = cross - (vertical ? offset : 0);
    lines.push(vertical
      ? `<line x1="${(pos - reach).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(pos + reach).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" opacity="${opacity}"/>`
      : `<line x1="${pos.toFixed(1)}" y1="${(y - reach).toFixed(1)}" x2="${pos.toFixed(1)}" y2="${(y + reach).toFixed(1)}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" opacity="${opacity}"/>`);
  }
  return lines.join("");
};
const iqcDefectColumnChart = (split, theme = "default", options = {}) => {
  const colors = options.distinct ? ["#0B4F9C", "#E06A12", "#1C8A4A", "#C4374A"] : theme === "lieflat" ? ["#1C1C1A", "#5E5D57", "#8F8E88", "#C6C5BF"] : ["#2f80d9", "#ef6c35", "#1f9d55", "#7b61c9"];
  const groups = [];
  (split?.cells || []).forEach((cell) => {
    const items = (cell.defects || []).map((item) => ({ name: String(item.name || "未分类"), count: Number(item.count) || 0 })).filter((item) => item.count > 0);
    if (items.length) groups.push({ label: iqcCellLabel(cell.name), items });
  });
  const rows = groups.flatMap((group, groupIndex) => group.items.map((item) => ({ ...item, group: group.label, groupIndex })));
  if (rows.length < 2) return "";
  const width = Math.max(options.largeType ? 720 : 980, rows.length * (options.largeType ? 64 : 54) + 150);
  const height = options.largeType ? 530 : 470;
  const margin = { top: options.largeType ? 48 : 40, right: 28, bottom: options.largeType ? 196 : 148, left: 70 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = niceChartMax(Math.max(...rows.map((row) => row.count), 1));
  const step = plotWidth / rows.length;
  const barWidth = Math.max(12, Math.min(30, step * 0.62));
  const bars = rows.map((row, index) => {
    const center = margin.left + step * index + step / 2;
    const y = margin.top + plotHeight - (row.count / maxValue) * plotHeight;
    const barHeight = Math.max(1, margin.top + plotHeight - y);
    const fill = colors[row.groupIndex % colors.length];
    const valueSize = options.largeType ? 16 : 11;
    const labelSize = options.largeType ? 15 : 11;
    const column = options.rungs
      ? rungLines({ axis: center, cross: margin.top + plotHeight, length: barHeight, color: fill, half: Math.max(6, barWidth / 2), seed: index + 3, vertical: true })
      : '<rect x="' + (center - barWidth / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" rx="' + (theme === "lieflat" && !options.distinct ? 0 : 3) + '" fill="' + fill + '"/>';
    return '<g><title>' + escapeHtml(row.group + " " + row.name + "：" + row.count) + '</title>' + column + '<text x="' + center.toFixed(1) + '" y="' + Math.max(margin.top + 14, y - 8).toFixed(1) + '" text-anchor="middle" class="combo-value" font-size="' + valueSize + '">' + row.count + '</text><text x="' + center.toFixed(1) + '" y="' + (margin.top + plotHeight + 18) + '" text-anchor="end" transform="rotate(-48 ' + center.toFixed(1) + ' ' + (margin.top + plotHeight + 18) + ')" class="combo-x-label" font-size="' + labelSize + '">' + escapeHtml(chartText(row.name, 12)) + '</text></g>';
  }).join("");
  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, index) => {
    const value = Math.round(maxValue * (ticks - index) / ticks);
    const y = margin.top + plotHeight * index / ticks;
    return '<text x="' + (margin.left - 8) + '" y="' + (y + 4) + '" text-anchor="end" class="combo-axis-label">' + value + '</text><line x1="' + margin.left + '" y1="' + y + '" x2="' + (width - margin.right) + '" y2="' + y + '" class="combo-grid"/>';
  }).join("");
  const legend = groups.map((group, index) => '<span><i class="bar" style="background:' + colors[index % colors.length] + '"></i>' + escapeHtml(group.label) + '</span>').join("");
  const caption = options.caption || "四格缺陷";
  const subtitle = options.subtitle || "柱形为不合格批次";
  const figureClass = "agent-report-auto-chart agent-report-combo-chart iqc-defect-columns" + (options.largeType ? " ipqc-defect-chart" : "") + (options.distinct ? "" : lieflatClass(theme));
  return '<figure class="' + figureClass + '" role="img" aria-label="' + escapeHtml(caption) + '"><figcaption><strong>' + escapeHtml(caption) + '</strong></figcaption><div class="agent-report-combo-legend">' + legend + '</div><svg viewBox="0 0 ' + width + ' ' + height + '" style="width:100%;height:auto;display:block" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + grid + '<line x1="' + margin.left + '" y1="' + (margin.top + plotHeight) + '" x2="' + (width - margin.right) + '" y2="' + (margin.top + plotHeight) + '" class="combo-axis"/>' + bars + '</svg></figure>';
};

const iqcStructuredTable = (split, title, theme = "default") => {
  if (!split?.cellMonthly?.length) return "";
  const text = String(title || "");
  if (text.includes("四格")) {
    return iqcHtmlTable("四格本月结果", ["分类", "送检批次", "不合格批次", "不合格率", "上月送检", "上月不合格", "上月不合格率"], (split.cells || []).map((cell) => [iqcCellLabel(cell.name), cell.inspected ?? "", cell.bad ?? "", iqcRateText(cell.rate), cell.previousInspected ?? "", cell.previousBad ?? "", iqcRateText(cell.previousRate)]));
  }
  if (text.includes("缺陷")) {
    const rows = [];
    (split.cells || []).forEach((cell) => (cell.defects || []).forEach((item) => rows.push([iqcCellLabel(cell.name), item.name, item.count])));
    return iqcDefectColumnChart(split, theme) || iqcHtmlTable("四格缺陷", ["分类", "缺陷", "不合格批次"], rows);
  }
  if (text.includes("供应商")) {
    return iqcHtmlTable("供应商来料", ["厂区", "供应商", "送检批次", "不合格批次", "不合格率", "主要缺陷"], (split.suppliers || []).map((item) => [item.site, item.name, item.inspected ?? "", item.bad ?? "", iqcRateText(item.rate), (item.topDefects || []).map((defect) => defect.name + defect.count).join("、")]));
  }
  if (text.includes("公司加工") || text.includes("机加")) {
    return iqcHtmlTable("公司加工", ["厂区", "送检批次", "不合格批次", "不合格率", "主要缺陷"], (split.companyMachining || []).map((item) => [item.site || item.name, item.inspected ?? "", item.bad ?? "", iqcRateText(item.rate), (item.topDefects || []).map((defect) => defect.name + defect.count).join("、")]));
  }
  return "";
};


const ipqcDensityRankChart = (rows, title) => {
  const source = (rows || []).filter((row) => row && row.rate != null && Number(row.inspected) > 0)
    .sort((left, right) => Number(right.rate) - Number(left.rate) || Number(right.bad) - Number(left.bad) || String(left.name).localeCompare(String(right.name), "zh-CN"));
  if (!source.length) return "";
  const max = Math.max(...source.map((row) => Number(row.rate) || 0), 0.1);
  const rowHeight = 30;
  const width = 760;
  const labelWidth = 210;
  const plotWidth = width - labelWidth - 78;
  const height = 16 + source.length * rowHeight + 8;
  const bars = source.map((row, index) => {
    const y = 10 + index * rowHeight;
    const bar = Math.max(2, (Number(row.rate) / max) * plotWidth);
    const fill = index < 3 ? "#C4374A" : "#0B4F9C";
    const fence = rungLines({ axis: labelWidth, cross: y + 13, length: bar, color: fill, half: 7, seed: index + 5, vertical: false });
    return '<g><title>' + escapeHtml(row.name + " 异常密度 " + row.rate + "%") + '</title><text x="' + (labelWidth - 8) + '" y="' + (y + 16) + '" text-anchor="end" class="ipqc-rank-name">' + escapeHtml(chartText(row.name, 16)) + '</text>' + fence + '<text x="' + (labelWidth + bar + 6).toFixed(1) + '" y="' + (y + 17) + '" class="ipqc-rank-value">' + row.rate + '%</text></g>';
  }).join("");
  return '<figure class="agent-report-auto-chart ipqc-density-rank" role="img" aria-label="' + escapeHtml(title) + '"><figcaption><strong>' + escapeHtml(title) + '</strong></figcaption><svg viewBox="0 0 ' + width + ' ' + height + '" style="width:100%;height:auto;display:block" aria-hidden="true">' + bars + '</svg></figure>';
};


const dqaRate = (value) => value == null || value === "" ? "" : String(value) + "%";
const dqaCountChart = (title, rows) => {
  const source = (rows || []).filter((row) => Number(row.count) > 0);
  return source.length ? renderLieflatRungBars({ title, rows: source.map((row) => ({ label: row.label || row.name || row.month, value: Number(row.count) || 0 })), valueLabel: "项" }) : "";
};
const dqaMachinedChart = (title, rows, quantityKey, rateKey) => {
  const source = (rows || []).filter((row) => Number(row[quantityKey]) > 0 || Number(row[rateKey]) > 0);
  if (source.length < 2) return "";
  return renderLieflatPairedTrend({
    title,
    rows: source.map((row) => ({ label: row.month, bad: Number(row[quantityKey]) || 0, total: 0, rate: Number(row[rateKey]) || 0 })),
    barLabels: ["数量", ""],
    lineLabel: "比例",
    grain: "month",
    singleBar: true,
    targetRate: 0.8,
  });
};
const dqaTpmRateChart = (title, pack, key) => renderLieflatMultiLine({
  title,
  subtitle: "每条线是一个 TPM。分子是其下各 PM 的加工件条数，分母是当月全公司加工件总数。纵轴是比例，红虚线是 0.8%。",
  months: pack?.months || [],
  series: (pack?.series || []).map((item) => ({ name: (item.division ? item.division + " · " : "") + item.name, values: item[key] || [] })),
  target: Number(pack?.target) || 0.8,
});
const dqaStructuredTable = (split, title, orgMappings = []) => {
  const view = shapeDqaRdSplit(split, orgMappings);
  if (!view?.divisions?.length) return "";
  const text = String(title || "");
  if (text.includes("产品部")) {
    const charts = (view.divisionMonthly || []).map((item) => dqaCountChart(item.name + "研发问题月度", item.rows)).join("");
    const table = iqcHtmlTable("产品部", ["产品部", "本期研发问题", "上月研发问题", "累计研发问题", "ECN比例", "ECN加工件数量", "ECN加工件比例", "非BOM加工件数量", "非BOM加工件比例", "评审次数", "有效改善项"], view.divisions.map((item) => [item.name, item.issues ?? "", item.previousIssues ?? "", item.ytdIssues ?? "", dqaRate(item.ecnRate), item.ecnMachined ?? "", dqaRate(item.ecnMachinedRate), item.nonBomMachined ?? "", dqaRate(item.nonBomMachinedRate), item.reviews ?? "", item.suggestions ?? ""]));
    return charts + table;
  }
  if (text.includes("TPM")) {
    const rows = [...(view.tpms || [])].sort((left, right) => String(left.division).localeCompare(String(right.division), "zh-CN") || Number(right.issues) - Number(left.issues) || String(left.name).localeCompare(String(right.name), "zh-CN"));
    const charts = dqaTpmRateChart("各TPM · ECN加工件比例", view.tpmPartMonthly, "ecnRate") + dqaTpmRateChart("各TPM · 非BOM加工件比例", view.tpmPartMonthly, "nonBomRate");
    const table = rows.length ? iqcHtmlTable("TPM", ["产品部", "TPM", "研发问题", "ECN数量", "ECN比例", "ECN加工件数量", "ECN加工件比例", "非BOM加工件数量", "非BOM加工件比例", "评审次数", "有效改善项", "评审有效性"], rows.map((item) => [item.division, item.name, item.issues ?? "", item.ecn ?? "", dqaRate(item.ecnRate), item.ecnMachined ?? "", dqaRate(item.ecnMachinedRate), item.nonBomMachined ?? "", dqaRate(item.nonBomMachinedRate), item.reviews ?? "", item.suggestions ?? "", dqaRate(item.reviewEffect)])) : "";
    return charts + table;
  }
  if (text.includes("问题") || text.includes("变更")) {
    const categories = dqaCountChart("问题分类", view.categories);
    const reasons = dqaCountChart("ECN变更原因", view.reasons);
    const categoryTable = iqcHtmlTable("问题分类", ["分类", "项数"], (view.categories || []).map((item) => [item.name, item.count]));
    const reasonTable = iqcHtmlTable("ECN变更原因", ["原因", "项数"], (view.reasons || []).map((item) => [item.name, item.count]));
    return categories + categoryTable + reasons + reasonTable;
  }
  if (text.includes("评审")) {
    return iqcHtmlTable("设计评审", ["产品部", "评审次数", "有效改善项"], view.divisions.map((item) => [item.name, item.reviews ?? "", item.suggestions ?? ""]));
  }
  return "";
};

const oqcPercent = (value) => value == null || value === "" ? "" : String(value) + "%";
const oqcStructuredTable = (split, title, orgMappings = []) => {
  if (!split?.divisionMonthly?.length) return "";
  const text = String(title || "");
  if (text.includes("TPM")) {
    const charts = (split.divisions || []).map((division) => {
      const heat = oqcTpmHeatmap(split, division.name, orgMappings);
      return heat.rows.length ? renderOqcTargetMatrix({ title: division.name + " · 各TPM", columns: heat.columns, rows: heat.rows, division: division.name }) : "";
    }).join("");
    const table = iqcHtmlTable("本产品部 TPM", ["产品部", "TPM", "本期出货", "本期5分率", "本期平均分", "本期低分率", "累计出货", "累计5分率", "累计平均分", "累计低分率"], (split.tpms || []).map((item) => [item.division, item.name, item.count ?? "", oqcPercent(item.fiveRate), item.avg ?? "", oqcPercent(item.lowRate), item.ytdCount ?? "", oqcPercent(item.ytdFiveRate), item.ytdAvg ?? "", oqcPercent(item.ytdLowRate)]));
    return charts + table;
  }
  if (text.includes("治具") || text.includes("自动化")) {
    return iqcHtmlTable("治具和自动化", ["机台", "数量", "占整机比例", "5分率", "平均分", "低分率", "累计数量", "累计比例", "累计5分率", "累计平均分", "累计低分率"], (split.machines || []).map((item) => [item.name, item.count ?? "", oqcPercent(item.share), oqcPercent(item.fiveRate), item.avg ?? "", oqcPercent(item.lowRate), item.ytdCount ?? "", oqcPercent(item.ytdShare), oqcPercent(item.ytdFiveRate), item.ytdAvg ?? "", oqcPercent(item.ytdLowRate)]));
  }
  if (text.includes("产品部")) {
    return iqcHtmlTable("产品部出货评分", ["产品部", "本期出货", "本期5分率", "本期平均分", "本期低分率", "上月5分率", "累计出货", "累计5分率", "累计平均分", "累计低分率"], (split.divisions || []).map((item) => [item.name, item.count ?? "", oqcPercent(item.fiveRate), item.avg ?? "", oqcPercent(item.lowRate), oqcPercent(item.previousFiveRate), item.ytdCount ?? "", oqcPercent(item.ytdFiveRate), item.ytdAvg ?? "", oqcPercent(item.ytdLowRate)]));
  }
  return "";
};
const ipqcStructuredTable = (split, title, theme = "default") => {
  if (!split?.cellMonthly?.length) return "";
  const text = String(title || "");
  if (text.includes("四格")) {
    return iqcHtmlTable("四格本月结果", ["分类", "送检数", "异常数", "异常密度", "上月送检", "上月异常", "上月异常密度"], (split.cells || []).map((cell) => [cell.name, cell.inspected ?? "", cell.bad ?? "", iqcRateText(cell.rate), cell.previousInspected ?? "", cell.previousBad ?? "", iqcRateText(cell.previousRate)]));
  }
  if (text.includes("缺陷")) {
    const chart = iqcDefectColumnChart(split, theme, { distinct: true, largeType: true, rungs: true, caption: "缺陷", subtitle: "栅栏柱为异常数。蓝、橙、绿、红对应四个分类" });
    const rows = [];
    (split.cells || []).forEach((cell) => (cell.crossWorkshop || []).forEach((item) => rows.push([cell.name, item.name, item.count, (item.workshops || []).join("、")])));
    const table = rows.length ? iqcHtmlTable("跨工坊重复缺陷", ["分类", "缺陷", "异常数", "工坊"], rows) : "";
    return chart + table;
  }
  if (text.includes("交付经理")) {
    const ranked = (split.managers || []).map((item) => ({ name: item.site + item.source + " " + item.name, rate: item.rate, inspected: item.inspected, bad: item.bad }));
    const table = iqcHtmlTable("交付经理", ["厂区", "来源", "交付经理", "送检数", "异常数", "异常密度", "主要缺陷"], (split.managers || []).map((item) => [item.site, item.source, item.name, item.inspected ?? "", item.bad ?? "", iqcRateText(item.rate), (item.topDefects || []).map((defect) => defect.name + defect.count).join("、")]));
    return ipqcDensityRankChart(ranked, "交付经理异常密度") + table;
  }
  if (text.includes("机长")) {
    const rows = [];
    const ranked = [];
    (split.focus || []).forEach((item) => (item.leaders || []).forEach((leader) => {
      rows.push([item.site, item.source, item.manager, leader.name, leader.inspected ?? "", leader.bad ?? "", iqcRateText(leader.rate), (leader.topDefects || []).map((defect) => defect.name + defect.count).join("、")]);
      ranked.push({ name: item.manager + "·" + leader.name, rate: leader.rate, inspected: leader.inspected, bad: leader.bad });
    }));
    return ipqcDensityRankChart(ranked, "机长异常密度") + iqcHtmlTable("被点名交付经理名下的机长", ["厂区", "来源", "交付经理", "机长", "送检数", "异常数", "异常密度", "主要缺陷"], rows);
  }
  return "";
};

const qmsPercent = (value) => value == null || value === "" ? "" : String(value) + "%";
const qmsStructuredTable = (split, title) => {
  if (!split?.periods?.length) return "";
  const text = String(title || "");
  if (text.includes("趋势")) {
    const chart = renderLieflatPairedTrend({
      title: "客户满意度半年趋势",
      rows: split.periods.map((item) => ({ label: item.label, bad: item.lowCount || 0, total: item.samples || 0, rate: item.lowRate || 0 })),
      barLabels: ["低分份数", "问卷份数"],
      lineLabel: "低分率",
      grain: "category",
    });
    const table = iqcHtmlTable("半年", ["半年", "问卷", "平均分", "低分份数", "低分率"], split.periods.map((item) => [item.name, item.samples ?? "", item.avg ?? "", item.lowCount ?? "", qmsPercent(item.lowRate)]));
    return chart + table;
  }
  if (text.includes("产品部")) {
    const chart = renderLieflatPairedTrend({
      title: "各产品部 · 低分率",
      rows: (split.divisions || []).map((item) => ({ label: item.name, bad: item.lowCount || 0, total: item.samples || 0, rate: item.lowRate || 0 })),
      barLabels: ["低分份数", "问卷份数"],
      lineLabel: "低分率",
      grain: "category",
    });
    const table = iqcHtmlTable("产品部", ["产品部", "问卷", "平均分", "低分份数", "低分率", "上一半年平均分", "上一半年低分率"], (split.divisions || []).map((item) => [item.name, item.samples ?? "", item.avg ?? "", item.lowCount ?? "", qmsPercent(item.lowRate), item.previousAvg ?? "", qmsPercent(item.previousLowRate)]));
    return chart + table;
  }
  if (text.includes("TPM")) {
    return iqcHtmlTable("TPM", ["产品部", "TPM", "问卷", "平均分", "低分份数", "低分率"], (split.tpms || []).map((item) => [item.division, item.name, item.samples ?? "", item.avg ?? "", item.lowCount ?? "", qmsPercent(item.lowRate)]));
  }
  if (text.includes("低分") || text.includes("意见")) {
    const chart = (split.themes || []).length ? renderLieflatRungBars({ title: "客户意见主题", rows: split.themes.map((item) => ({ label: item.name, value: item.count })), valueLabel: "条" }) : "";
    const lows = (split.lowScores || []).length ? iqcHtmlTable("低分", ["产品部", "TPM", "客户", "项目", "得分", "最低维度", "意见"], split.lowScores.map((item) => [item.division, item.tpm, item.customer, item.project, item.score ?? "", item.lowestDimension, item.suggestion])) : "";
    const dimensions = (split.dimensions || []).length ? iqcHtmlTable("维度", ["维度", "平均分"], split.dimensions.map((item) => [item.name, item.avg ?? ""])) : "";
    return chart + lows + dimensions;
  }
  return "";
};
const doamStructuredTable = (split, title) => {
  if (!split?.monthly?.length && !split?.totals?.shifts) return "";
  const text = String(title || "");
  if (text.includes("趋势")) {
    const chart = renderLieflatPairedTrend({
      title: (split.trendYear || "") + "年机台告警月度趋势",
      rows: (split.monthly || []).map((item) => ({ label: item.month, bad: item.alarms || 0, total: 0, rate: item.average || 0 })),
      barLabels: ["告警次数", ""],
      lineLabel: "次/班次",
      grain: "month",
      singleBar: true,
      lineSuffix: "",
    });
    const table = iqcHtmlTable("月度", ["月份", "告警次数", "班次", "次/班次"], (split.monthly || []).map((item) => [item.month, item.alarms ?? "", item.shifts ?? "", item.average ?? ""]));
    return chart + table;
  }
  if (text.includes("产品部")) {
    const rows = (split.divisions || []).filter((item) => item.name !== "未归类");
    const chart = renderLieflatPairedTrend({
      title: "各产品部 · 次/班次",
      rows: rows.map((item) => ({ label: item.name, bad: item.alarms || 0, total: 0, rate: item.average || 0 })),
      barLabels: ["告警次数", ""],
      lineLabel: "次/班次",
      grain: "category",
      singleBar: true,
      lineSuffix: "",
    });
    const table = iqcHtmlTable("产品部", ["产品部", "告警次数", "班次", "次/班次"], rows.map((item) => [item.name, item.alarms ?? "", item.shifts ?? "", item.average ?? ""]));
    return chart + table;
  }
  if (text.includes("TPM")) {
    return iqcHtmlTable("TPM", ["产品部", "TPM", "告警次数", "班次", "次/班次"], (split.tpms || []).map((item) => [item.division, item.name, item.alarms ?? "", item.shifts ?? "", item.average ?? ""]));
  }
  if (text.includes("分类")) {
    const chart = renderLieflatRungBars({ title: "告警分类", rows: (split.categories || []).map((item) => ({ label: item.name, value: item.count })), valueLabel: "次" });
    const table = iqcHtmlTable("告警分类", ["分类", "次数"], (split.categories || []).map((item) => [item.name, item.count ?? ""]));
    return chart + table;
  }
  return "";
};


export const renderAgentMarkdown = (rawContent, { chartFirst = false, snapshot = null, includeSnapshotCharts = false, publisher = false, profileId = DEFAULT_REPORT_PRESENTATION_PROFILE, module = "质量分析", visualSpec = null, chartTheme = "", lede = "", orgMappings = [], recipient = "", period = null, role = "" } = {}) => {
  // The visual contract is machine-readable metadata, never report prose.
  const content = module === "公司" ? normalizeCompanyBrief(rawContent || "") : rawContent;
  const visualFigures = visualFigureList(visualSpec || extractReportVisualSpec(content || ""));
  const resolvedChartTheme = chartTheme || (visualSpec?.reportKind === "role" || String(module || "").startsWith("角色报告") ? "lieflat" : "default");
  const reportText = ensurePersonalReportHeading(sanitizeHumanReportContent(content || "暂无报告"), { recipient, period, role, module });
  const lines = reportText.split(/\r?\n/);
  const output = [];
  const snapshotCharts = includeSnapshotCharts ? renderIqcSnapshotCharts(snapshot) : {};
  const insertedSnapshotCharts = new Set();
  const insertedVisualFigures = new Set();
  const metricBuffer = [];
  let sectionTitle = "";
  let sectionOpen = false;
  let skipIqcProse = false;
  const flushMetrics = () => {
    if (!metricBuffer.length) return;
    output.push(`<div class="agent-report-kpi-grid">${metricBuffer.splice(0).map((item) => `<article class="agent-report-kpi"><span>${inlineReportMarkdown(item.label)}</span><strong>${inlineReportMarkdown(item.value)}</strong></article>`).join("")}</div>`);
  };
  const closeSection = () => {
    flushMetrics();
    if (sectionOpen) output.push("</section>");
    sectionOpen = false;
  };
  const openSection = (title, tag) => {
    closeSection();
    sectionTitle = title;
    const figure = visualFigures.find((item) => figureMatchesSection(item, title));
    const labels = (figure?.categories || []).map((item) => String(typeof item === "object" ? (item.name || item.label || "") : item));
    const heading = /趋势/.test(title) ? periodChartTitle(title, labels) : title;
    output.push(`<section class="${sectionClass(title)}"><${tag} class="${headingClass(title)}">${inlineReportMarkdown(heading)}</${tag}>`);
    sectionOpen = true;
    const formalSplit = snapshot?.module === "IPQC" ? snapshot?.data?.ipqcSplit : snapshot?.module === "OQC" ? snapshot?.data?.oqcSplit : snapshot?.data?.iqcSplit;
    const splitReady = snapshot?.module === "OQC" ? Boolean(formalSplit?.divisionMonthly?.length) : snapshot?.module === "DQA" ? Boolean(snapshot?.data?.dqaSplit?.divisions?.length) : snapshot?.module === "QMS" ? Boolean(snapshot?.data?.qmsSplit?.periods?.length) : snapshot?.module === "DOAM" ? Boolean(snapshot?.data?.doamSplit?.monthly?.length) : Boolean(formalSplit?.cellMonthly?.length);
    skipIqcProse = splitReady && (snapshot?.module === "IPQC" ? /四格|缺陷|交付经理|机长/.test(title) : snapshot?.module === "OQC" ? /产品部|TPM|治具|自动化/.test(title) : snapshot?.module === "DQA" ? /产品部|TPM|问题|变更|评审/.test(title) : snapshot?.module === "QMS" ? /趋势|产品部|TPM|低分|意见/.test(title) : snapshot?.module === "DOAM" ? /趋势|产品部|TPM|分类/.test(title) : /四格|缺陷|供应商|公司加工|机加/.test(title));
    const structured = snapshot?.module === "IPQC" ? ipqcStructuredTable(formalSplit, title, resolvedChartTheme) : snapshot?.module === "OQC" ? oqcStructuredTable(formalSplit, title, orgMappings) : snapshot?.module === "DQA" && snapshot?.data?.dqaSplit ? dqaStructuredTable(snapshot.data.dqaSplit, title, orgMappings) : snapshot?.module === "QMS" && snapshot?.data?.qmsSplit ? qmsStructuredTable(snapshot.data.qmsSplit, title) : snapshot?.module === "DOAM" && snapshot?.data?.doamSplit ? doamStructuredTable(snapshot.data.doamSplit, title) : iqcStructuredTable(snapshot?.data?.iqcSplit, title, resolvedChartTheme);
    if (structured) output.push(structured);
  };
  const insertSnapshotChartForSection = (title) => {
    const chartKey = /月度趋势/i.test(title) ? "monthly" : /物料类别.*良率/i.test(title) ? "material" : "";
    if (!chartKey || insertedSnapshotCharts.has(chartKey) || !snapshotCharts[chartKey]) return;
    if (chartKey === "monthly" && visualFigures.some((figure) => String(figure.intent || figure.preferredChart || "").toLowerCase().includes("period-trend"))) return;
    output.push(`<div class="agent-report-inline-chart">${snapshotCharts[chartKey]}</div>`);
    insertedSnapshotCharts.add(chartKey);
  };
  const insertVisualFiguresForSection = (title) => {
    if (!chartFirst) return;
    visualFigures.filter((figure) => !insertedVisualFigures.has(figure.__key) && figureMatchesSection(figure, title)).forEach((figure) => {
      const markup = renderFigureBlock(figure, resolvedChartTheme);
      if (markup) {
        output.push(`<div class="agent-report-inline-chart" data-figure-id="${escapeHtml(figure.__key)}">${markup}</div>`);
        insertedVisualFigures.add(figure.__key);
      }
    });
  };
  let skippedDocumentTitle = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (skipIqcProse && !/^#{1,3}\s/.test(lines[index].trim()) && !/^[一二三四五六七八九十]+、/.test(lines[index].trim())) continue;
    const line = lines[index];
    const raw = line.trim();
    if (isLayoutMarker(raw)) continue;
    if (isMachineMetadataLine(raw)) continue;
    if (isMarkdownTableLine(line)) {
      flushMetrics();
      const tableLines = [];
      while (index < lines.length && isMarkdownTableLine(lines[index])) tableLines.push(lines[index++]);
      const suppressSnapshotTable = (/月度趋势/i.test(sectionTitle) && insertedSnapshotCharts.has("monthly"))
        || (/物料类别.*良率/i.test(sectionTitle) && insertedSnapshotCharts.has("material"));
      const replacingFigure = visualFigures.some((figure) => figure.tablePolicy === "replace" && figureMatchesSection(figure, sectionTitle));
      if (!replacingFigure) output.push(renderMarkdownTable(tableLines, { chartFirst, sectionTitle, suppressIqcYieldTable: suppressSnapshotTable, visualFigures }));
      index -= 1;
      continue;
    }
    const chineseSection = raw.match(/^([一二三四五六七八九十]+、\s*\S.*)$/);
    if (chineseSection && !raw.startsWith("#")) { openSection(chineseSection[1], "h4"); insertSnapshotChartForSection(sectionTitle); insertVisualFiguresForSection(sectionTitle); continue; }
    if (/^###\s/.test(raw)) { openSection(raw.replace(/^###\s/, ""), "h5"); insertSnapshotChartForSection(sectionTitle); insertVisualFiguresForSection(sectionTitle); continue; }
    if (/^##\s/.test(raw)) { openSection(raw.replace(/^##\s/, ""), "h4"); insertSnapshotChartForSection(sectionTitle); insertVisualFiguresForSection(sectionTitle); continue; }
    if (/^#\s/.test(raw)) {
      if (publisher && !skippedDocumentTitle) { skippedDocumentTitle = true; continue; }
      openSection(raw.replace(/^#\s/, ""), "h3"); insertSnapshotChartForSection(sectionTitle); insertVisualFiguresForSection(sectionTitle); continue;
    }
    const metric = metricLine(raw);
    if (metric) { metricBuffer.push(metric); continue; }
    flushMetrics();
    const value = inlineReportMarkdown(raw);
    if (!value) output.push("<div class=\"agent-report-spacer\"></div>");
    else if (/^>\s?/.test(raw)) output.push(`<div class="${calloutToneClass(raw)}">${inlineReportMarkdown(raw.replace(/^>\s?/, ""))}</div>`);
    else if (/^(\-|\*)\s/.test(raw)) output.push(`<div class=\"agent-report-bullet\"><i></i><span>${inlineReportMarkdown(raw.replace(/^(\-|\*)\s/, ""))}</span></div>`);
    else if (/^\d+[.)]\s/.test(raw)) output.push(`<div class=\"agent-report-numbered\"><b>${escapeHtml(raw.match(/^\d+[.)]/)?.[0] || "")}</b><span>${inlineReportMarkdown(raw.replace(/^\d+[.)]\s/, ""))}</span></div>`);
    else if (/^---+$/.test(raw)) output.push("<hr class=\"agent-report-divider\">");
    else output.push(`<p>${value}</p>`);
  }
  closeSection();
  const remainingFigures = visualFigures.filter((figure) => !insertedVisualFigures.has(figure.__key));
  if (chartFirst && remainingFigures.length) {
    output.push(`<section class="agent-report-section agent-report-visual-appendix"><h4 class="agent-report-section-heading">图表附录</h4>${remainingFigures.map((figure) => { insertedVisualFigures.add(figure.__key); return `<div class="agent-report-inline-chart" data-figure-id="${escapeHtml(figure.__key)}">${renderFigureBlock(figure, resolvedChartTheme)}</div>`; }).join("")}</section>`);
  }
  const fragment = output.join("");
  return publisher ? reportPublisherChrome(reportText, fragment, profileId, module, lede, { snapshot, visualSpec }) : fragment;
};

export function QualityAgentPage({ data, files = [], dateRange, module = "DQA", onEnsureAgentSources, canStart = false, canSaveToServer = false, creatorIp = "", orgMappings = [], employees = [] }) {
  const [doamDataset, setDoamDataset] = useState(null);
  const [dqaAgentRaw, setDqaAgentRaw] = useState(null);
  const initialSkill = MODULE_DEFAULT_SKILLS[module] || MODULE_DEFAULT_SKILLS.DQA;
  const [skillName, setSkillName] = useState(() => readModuleChoice(module).skillName || initialSkill.name);
  const [skillContent, setSkillContent] = useState(initialSkill.content);
  const [coreSkillContent, setCoreSkillContent] = useState(DEFAULT_CORE_SKILL.content);
  const [skills, setSkills] = useState([initialSkill]);
  const [layoutSkills] = useState(REPORT_PRESENTATION_PROFILES);
  const [chartSkills, setChartSkills] = useState([{ id: DEFAULT_ANALYSIS_CHART_SKILL, name: DEFAULT_ANALYSIS_CHART_SKILL }, { id: "quality-role-charts-default", name: "quality-role-charts-default" }]);
  const [chartSkillName, setChartSkillName] = useState(() => {
    try { return readModuleChoice(module).chartSkillName || localStorage.getItem(CHART_SKILL_STORAGE_KEY) || DEFAULT_ANALYSIS_CHART_SKILL; } catch { return DEFAULT_ANALYSIS_CHART_SKILL; }
  });
  const [layoutSkillName, setLayoutSkillName] = useState(() => readModuleChoice(module).layoutSkillName || initialReportLayout());
  const [runs, setRuns] = useState(() => loadQualityAgentRuns());
  const [serverRunsReady, setServerRunsReady] = useState(() => !canSaveToServer);
  const [stageOpen, setStageOpen] = useState({});
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [backendOpen, setBackendOpen] = useState(false);
  const [backendNow, setBackendNow] = useState(() => Date.now());
  const backendLogRef = useRef(null);
  const [closureEvidence, setClosureEvidence] = useState({});
  const [savedReports, setSavedReports] = useState([]);
  const [selectedReportName, setSelectedReportName] = useState(() => readModuleChoice(module).reportName || "");
  const [pinnedReport, setPinnedReport] = useState({ fileName: "", snapshot: null });
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [selectedReportContent, setSelectedReportContent] = useState("");
  const [selectedReportState, setSelectedReportState] = useState({ status: "idle", message: "" });
  const [sendTarget, setSendTarget] = useState("");
  const [sendFormat, setSendFormat] = useState("pdf");
  const [sendNotice, setSendNotice] = useState({ status: "", message: "" });
  const [importedReports, setImportedReports] = useState(() => readImportedReports()[module] || []);
  const [selectedImportedId, setSelectedImportedId] = useState(() => readModuleChoice(module).importedId || "");
  const [showImportedReport, setShowImportedReport] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState("");
  const [pdfDownload, setPdfDownload] = useState({ signature: "", status: "idle", blob: null, fileName: "", message: "" });
  const importInputRef = useRef(null);
  const requestedReportNameRef = useRef(typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("agentReport") || "");
  const finalReportRef = useRef(null);
  const savedReportRef = useRef(null);
  const importedReportRef = useRef(null);
  const [error, setError] = useState("");
  const [resolvedCreatorIp, setResolvedCreatorIp] = useState("");
  const [saveState, setSaveState] = useState({ status: "idle", message: "" });
  const [agentFiles, setAgentFiles] = useState(files);
  const [snapshotRegistry, setSnapshotRegistry] = useState(null);
  const [sourceState, setSourceState] = useState({ status: "idle", message: "" });
  const abortRef = useRef(null);
  const serverRunSaveTimerRef = useRef(null);
  const sourceReady = useMemo(() => module === "DOAM" ? Boolean(doamDataset?.units?.length) : agentFiles.some((source) => agentSourceModules(module).includes(source.module) && Array.isArray(source.rows) && source.rows.length), [agentFiles, module, doamDataset]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  useEffect(() => { loadCurrentUser().then((user) => setResolvedCreatorIp(String(user?.ip || ""))).catch(() => {}); }, []);
  useEffect(() => {
    let active = true;
    loadQualityAgentSnapshotRegistry().then((value) => {
      if (active) setSnapshotRegistry(normalizeQualitySnapshotRegistry(value || null));
    }).catch(() => {}).finally(() => {});
    return () => { active = false; };
  }, []);
  const [period, setPeriod] = useState(() => savedAnalysisPeriod(module, dateRange));
  useEffect(() => {
    const choice = readModuleChoice(module);
    if (choice.start2026 && choice.end2026) return;
    setPeriod((current) => current.start2026 === dateRange.start2026 && current.end2026 === dateRange.end2026
      ? current
      : { ...current, ...dateRange });
  }, [module, dateRange.start2026, dateRange.end2026, dateRange.start2025, dateRange.end2025]);
  useEffect(() => {
    setAgentFiles((current) => {
      const byKey = new Map();
      [...files.filter((source) => agentSourceModules(module).includes(source.module)), ...current.filter((source) => agentSourceModules(module).includes(source.module))].forEach((source) => {
        const key = `${source.module}::${source.name}`;
        const previous = byKey.get(key);
        const previousRows = Array.isArray(previous?.rows) ? previous.rows.length : 0;
        const nextRows = Array.isArray(source.rows) ? source.rows.length : 0;
        if (!previous || nextRows >= previousRows) byKey.set(key, source);
      });
      return [...byKey.values()];
    });
  }, [files, module]);
  useEffect(() => {
    if (module !== "DOAM") return undefined;
    let active = true;
    setSourceState({ status: "loading", message: "正在加载 DOAM 告警数据" });
    const loadDefault = () => fetch((import.meta.env.BASE_URL || "./") + "doam-default.json", { cache: "no-store" }).then((response) => response.json()).then((payload) => hydrateDoamDefault(payload));
    loadDoamPack().then((pack) => {
      const items = pack?.items || [];
      if (items.length) return mergeDoamDatasets({ units: [], categories: [], quality: {}, files: [] }, items);
      return loadDefault();
    }).then((dataset) => {
      if (!active) return;
      setDoamDataset(dataset || { units: [], categories: [], quality: {}, files: [] });
      const fileCount = (dataset?.quality?.files || dataset?.files || []).length || (dataset?.units?.length ? 1 : 0);
      setSourceState({ status: dataset?.units?.length ? "ready" : "error", message: dataset?.units?.length ? `DOAM 数据已就绪 · ${fileCount} 个数据源` : "未找到 DOAM 告警数据，请先到质量数据 / 数据导入中上传 CSV" });
    }).catch((loadError) => {
      if (active) {
        setDoamDataset({ units: [], categories: [], quality: {}, files: [] });
        setSourceState({ status: "error", message: `DOAM 数据加载失败：${loadError.message || loadError}` });
      }
    });
    const sync = () => {
      loadDoamPack().then((pack) => {
        const items = pack?.items || [];
        if (!items.length) return;
        if (active) setDoamDataset(mergeDoamDatasets({ units: [], categories: [], quality: {}, files: [] }, items));
      }).catch(() => {});
    };
    window.addEventListener("qms-doam-changed", sync);
    return () => { active = false; window.removeEventListener("qms-doam-changed", sync); };
  }, [module]);
  useEffect(() => {
    let active = true;
    if (module === "DOAM") return undefined;
    if (!onEnsureAgentSources || !canStart) {
      setSourceState({ status: "ready", message: canStart ? "Agent 数据已就绪" : "当前账号仅读取已保存报告" });
      return undefined;
    }
    setSourceState({ status: "loading", message: "正在按模块加载 Agent 原始数据" });
    onEnsureAgentSources(agentSourceModules(module), (progress) => {
      if (active && progress?.label) setSourceState({ status: "loading", message: progress.label });
    }).then((next) => {
      if (!active) return;
      const byKey = new Map();
      [...files.filter((source) => agentSourceModules(module).includes(source.module)), ...(next || []).filter((source) => agentSourceModules(module).includes(source.module))].forEach((source) => {
        const key = `${source.module}::${source.name}`;
        const previous = byKey.get(key);
        const previousRows = Array.isArray(previous?.rows) ? previous.rows.length : 0;
        const nextRows = Array.isArray(source.rows) ? source.rows.length : 0;
        if (!previous || nextRows >= previousRows) byKey.set(key, source);
      });
      setAgentFiles([...byKey.values()]);
      setSourceState({ status: "ready", message: "Agent 数据已就绪" });
    }).catch((loadError) => {
      if (active) setSourceState({ status: "error", message: `Agent 原始数据加载失败：${loadError.message || loadError}` });
    });
    return () => { active = false; };
  }, [module]);
  useEffect(() => {
    if (module !== "DQA") return undefined;
    let active = true;
    loadDqaAgentRaw().then((value) => { if (active) setDqaAgentRaw(value || null); }).catch(() => {});
    return () => { active = false; };
  }, [module]);
  const snapshot = useMemo(() => {
    try {
      return buildQualityAgentSnapshot({ data: module === "DOAM" ? { ...data, doam: doamDataset || {} } : data, files: agentFiles, dateRange: period, module, orgMappings, agentRaw: dqaAgentRaw });
    } catch (error) {
      console.error("DOAM/质量分析快照生成失败", module, error);
      return { schemaVersion: "quality-agent-snapshot-v3", module, moduleLabel: module, period, data: { metrics: {}, organization: {}, evidence: {}, sourceAudit: { sourceFileCount: 0, totalRows: 0 }, localPareto: { organizationPareto: [], mechanismPareto: [], crossThemes: [] }, evidenceCatalog: { entries: [] } } };
    }
  }, [data, agentFiles, period, module, doamDataset, orgMappings, dqaAgentRaw]);
  const sourceSignature = useMemo(() => {
    if (module !== "DOAM") return createSourcesSignature(agentFiles.filter((source) => agentSourceModules(module).includes(source.module)));
    const compact = agentFiles.filter((source) => source.module === "DOAM" && (source.kind === "DOAM_COMPACT" || String(source.name || "").toLowerCase().endsWith(".doam.json")));
    return compact.length ? createSourcesSignature(compact, { includeDoam: true }) : JSON.stringify({ files: doamDataset?.quality?.files || doamDataset?.files || [], rowCount: doamDataset?.quality?.rowCount || 0, units: doamDataset?.units?.length || 0, dateMax: doamDataset?.quality?.dateMax || "" });
  }, [agentFiles, module, doamDataset]);
  const matchedSnapshotEntry = useMemo(() => {
    if (!snapshotRegistry) return null;
    if (module === "IQC") {
      const matched = pickIqcAnalysisSnapshot(snapshotRegistry.history, period);
      if (matched) return matched;
    }
    if (module === "IPQC") return pickIpqcAnalysisSnapshot(snapshotRegistry.history, period);
    if (module === "OQC") return pickOqcAnalysisSnapshot(snapshotRegistry.history, period);
    return pickLatestQualitySnapshot(snapshotRegistry, { module, dateRange: period, sourceSignature, skillName, layoutProfileId: layoutSkillName, allowPeriodFallback: true });
  }, [snapshotRegistry, module, period, sourceSignature, skillName, layoutSkillName]);
  const combinedSkillContent = useMemo(() => `模块 Skill：${skillName}\n${skillContent}\n\n核心 Skill：${CORE_SKILL_NAME}\n${coreSkillContent}`, [skillName, skillContent, coreSkillContent]);
  const record = runs[module] || {};
  const formalIqcLayout = skillName === "quality-analysis-iqc-machined";
  const formalIpqcLayout = skillName === "quality-analysis-ipqc-assembly";
  const formalOqcLayout = skillName === "quality-analysis-oqc-shipment";
  const formalDqaLayout = skillName === "quality-analysis-dqa-rd";
  const formalQmsLayout = skillName === "quality-analysis-qms-customer";
  const formalDoamLayout = skillName === "quality-analysis-doam-stability";
  const formalReportLayout = formalIqcLayout || formalIpqcLayout || formalOqcLayout || formalDqaLayout || formalQmsLayout || formalDoamLayout;
  const baseDisplaySnapshot = [record.renderSnapshot, record.snapshot, matchedSnapshotEntry?.snapshot, snapshot].find((item) => module === "IQC" ? iqcSnapshotReady(item) : formalIpqcLayout ? ipqcSnapshotReady(item) : formalOqcLayout ? oqcSnapshotReady(item) : formalDqaLayout ? dqaRdSnapshotReady(item) : Number(item?.data?.sourceAudit?.totalRows || 0) > 0) || snapshot;
  const displaySnapshot = useMemo(() => {
    let next = baseDisplaySnapshot;
    if (module === "IQC" && matchedSnapshotEntry?.matchLevel === "coverage" && matchedSnapshotEntry.selectedWindow && iqcSnapshotReady(matchedSnapshotEntry.snapshot)) {
      next = sliceIqcSnapshotToWindow(matchedSnapshotEntry.snapshot, matchedSnapshotEntry.selectedWindow, matchedSnapshotEntry.dateRange, snapshotRegistry?.history || []);
      if (iqcSplitDetailsMissing(next?.data?.iqcSplit)) next = refillIqcSnapshotDetails(next, snapshotRegistry?.history || [], matchedSnapshotEntry.selectedWindow);
    }
    if (module === "DQA" && next?.data?.dqaSplit) next = { ...next, data: { ...next.data, dqaSplit: applyDqaPmMachined(next.data.dqaSplit, dqaAgentRaw, orgMappings) } };
    if (module === "QMS") {
      const qmsSplit = buildQmsCustomerSplit({ qms: data?.qms, files: agentFiles, period });
      if (qmsSplit) next = { ...(next || { module: "QMS", data: {} }), module: "QMS", data: { ...(next?.data || {}), qmsSplit } };
    }
    if (module === "DOAM") {
      const doamSplit = buildDoamStabilitySplit(doamDataset || {}, period);
      if (doamSplit) next = { ...(next || { module: "DOAM", data: {} }), module: "DOAM", data: { ...(next?.data || {}), doamSplit } };
    }
    return next;
  }, [baseDisplaySnapshot, module, dqaAgentRaw, orgMappings, data, period, doamDataset, agentFiles, matchedSnapshotEntry, snapshotRegistry]);
  const moduleVisualSpec = useMemo(() => {
    const embedded = record.visualSpec || extractReportVisualSpec(record.content || "");
    return mergeModuleVisualSpec(embedded, displaySnapshot, module, { ipqcAssembly: formalIpqcLayout, oqcShipment: formalOqcLayout, dqaRd: formalDqaLayout });
  }, [record.visualSpec, record.content, displaySnapshot, module, formalIpqcLayout, formalOqcLayout]);
  const activeReportLayoutClass = reportLayoutClass(layoutSkillName);
  const styleOwnsCharts = presentationOwnsCharts(layoutSkillName);
  const chartTheme = chartThemeFromSkill(chartSkills.find((item) => (item.name || item.id) === chartSkillName) || { name: chartSkillName });
  const finalReportHtml = useMemo(() => record.content
    ? renderAgentMarkdown(record.content, { chartFirst: true, snapshot: displaySnapshot, includeSnapshotCharts: module === "IQC" && !formalIqcLayout, publisher: true, profileId: layoutSkillName, module, visualSpec: moduleVisualSpec, lede: formalIqcLayout ? "加工件来料与公司加工质量报告。" : formalIpqcLayout ? "组装过程质量报告。深圳、杭州分开，自制和外包分开。" : formalOqcLayout ? "出货评分报告。按产品部和 TPM 看出货质量。" : formalDqaLayout ? "研发质量报告。研发问题、变更和设计评审分开。" : formalQmsLayout ? "客户满意度报告。按半年看平均分、低分率和客户意见。" : formalDoamLayout ? "机台稳定性报告。告警按月上传，次/班次和告警次数分开。" : "", chartTheme, orgMappings })
    : "", [record.content, displaySnapshot, module, layoutSkillName, moduleVisualSpec, chartTheme, formalIqcLayout, formalIpqcLayout, formalOqcLayout, formalDqaLayout, formalQmsLayout, formalDoamLayout]);
  // Presentation profiles are deterministic browser rendering. Switching one
  // must never invalidate the completed analysis or trigger another AI call.
  const reportLayoutChanged = false;
  const auditSummary = useMemo(() => {
    try { return JSON.parse(record.stages?.audit?.content || "{}"); } catch { return {}; }
  }, [record.stages?.audit?.content]);
  const auditDetail = [...(auditSummary.blockers || []), ...(auditSummary.materialIssues || []), ...(auditSummary.warnings || [])].join("；");
  const doamFileCount = ((doamDataset?.quality?.files || doamDataset?.files || []).length) || (doamDataset?.units?.length ? 1 : 0);
  const snapshotTrace = module === "DOAM" && !matchedSnapshotEntry
    ? (sourceState.status === "loading" || doamDataset == null
      ? { status: "loading", label: "正在准备 DOAM 统计", detail: "正在读取导入的告警明细", meta: "" }
      : sourceReady
        ? { status: "missing", label: "未命中 DOAM 后台快照", detail: `${skillName} · ${doamFileCount} 个数据源`, meta: `将使用当前导入明细；可在系统管理 / 后台快照生成 DOAM 快照` }
        : { status: "missing", label: "DOAM 数据未就绪", detail: sourceState.message || "请先到质量数据 / 数据导入中上传告警明细", meta: "" })
    : matchedSnapshotEntry
      ? { status: "matched", label: matchedSnapshotEntry.matchLevel === "coverage" ? "已命中覆盖快照" : matchedSnapshotEntry.matchLevel === "period" ? "已命中同周期快照" : "已命中有效快照", detail: `${matchedSnapshotEntry.moduleLabel || module} · ${matchedSnapshotEntry.skillName || skillName} · ${matchedSnapshotEntry.layoutProfileId || layoutSkillName}`, meta: matchedSnapshotEntry.matchLevel === "coverage" ? `快照覆盖 ${matchedSnapshotEntry.coverage?.start || matchedSnapshotEntry.dateRange?.start2026} ~ ${matchedSnapshotEntry.coverage?.end || matchedSnapshotEntry.dateRange?.end2026}，本次窗口 ${matchedSnapshotEntry.selectedWindow?.start} ~ ${matchedSnapshotEntry.selectedWindow?.end}。固定数字用这份覆盖快照。` : matchedSnapshotEntry.matchLevel === "period" ? `生成于 ${new Date(matchedSnapshotEntry.generatedAt).toLocaleString("zh-CN")} · 当前 Skill 或来源版本与快照不完全一致，固定数字仍用这份同周期快照` : `生成于 ${new Date(matchedSnapshotEntry.generatedAt).toLocaleString("zh-CN")} · 来源版本已匹配` }
      : snapshotRegistry
        ? (module === "IPQC" && (snapshotRegistry.history || []).some((entry) => entry?.module === "IPQC" && entry?.active !== false) ? ((snapshotRegistry.history || []).some((entry) => entry?.module === "IPQC" && entry?.active !== false && ipqcSnapshotReady(entry.snapshot)) ? { status: "missing", label: "快照日期没有盖住本次选择", detail: "已有组装四格快照，但没有覆盖 " + (period.start2026 || "") + " ~ " + (period.end2026 || ""), meta: "把 IPQC 快照生成到包含这段日期，或继续用当前数据现算" } : { status: "missing", label: "快照还是旧结构", detail: "后台 IPQC 快照没有组装四格，不能给这份组装报告使用", meta: "接口服务还在用更新前的程序。先重启网页服务，再重新生成 IPQC 快照" }) : { status: "missing", label: "未命中有效快照", detail: "当前周期、来源版本、Skill 或 Profile 没有完全匹配的有效快照", meta: "本次分析将使用当前确定性统计结果；请管理员检查后台快照" })
        : { status: "loading", label: "正在读取快照注册表", detail: "尚未完成快照匹配", meta: "" };
  const snapshotCacheMessage = matchedSnapshotEntry ? "缓存命中：本次分析将复用固定快照，跳过重复统计" : (module === "DOAM" && sourceReady ? "未命中后台快照，使用当前导入明细生成固定统计" : "缓存未命中：本次分析将重新整理当前数据");
  const workflowProgress = record.progress || { percent: record.status === "done" ? 100 : 0, phase: record.status === "running" ? "正在准备分析" : "等待启动", detail: record.status === "done" ? "报告已生成，可直接查看或保存" : "点击“启动 Agent 分析”后开始" };
  useEffect(() => {
    if (!backendOpen || record.status !== "running") return undefined;
    const timer = window.setInterval(() => setBackendNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [backendOpen, record.status]);
  const update = (next) => setRuns((current) => {
    const value = { ...current, [module]: next };
    return value;
  });

  const refreshReports = async () => {
    try {
      const value = await loadAgentReports();
      const reports = Array.isArray(value?.reports) ? value.reports : [];
      const localReports = (await loadLocalAgentReports()).filter((item) => item.module === module);
      const merged = [...localReports, ...reports];
      setSavedReports(merged);
      return merged;
    } catch {
      const localReports = (await loadLocalAgentReports()).filter((item) => item.module === module);
      setSavedReports(localReports);
      return localReports;
    }
  };
  const moduleReports = useMemo(() => savedReports.filter((item) => String(item.module || "") === module
    || String(item.fileName || "").includes(`QMS-Agent报告-${module}-`)
    || (item.localOnly && String(item.module || "") === module)), [savedReports, module]);
  const selectedReport = moduleReports.find((item) => item.fileName === selectedReportName) || null;
  const selectedReportSnapshot = selectedReportName && pinnedReport.fileName === selectedReportName && pinnedReport.snapshot ? pinnedReport.snapshot : (selectedReport?.period?.start2026 && selectedReport.period.start2026 === period.start2026 && selectedReport.period.end2026 === period.end2026 ? displaySnapshot : null);
  const selectedImportedReport = importedReports.find((item) => item.id === selectedImportedId) || null;
  useEffect(() => {
    const reports = readImportedReports()[module] || [];
    const list = Array.isArray(reports) ? reports : [];
    setImportedReports(list);
    const rememberedImport = readModuleChoice(module).importedId || "";
    const importExists = list.some((item) => item.id === rememberedImport);
    setSelectedImportedId(importExists ? rememberedImport : "");
    setShowImportedReport(importExists);
  }, [module]);

  useEffect(() => {
    if (selectedImportedId && importedReports.length && !importedReports.some((item) => item.id === selectedImportedId)) {
      setSelectedImportedId("");
      setShowImportedReport(false);
      writeModuleChoice(module, { importedId: "" });
    }
  }, [importedReports, selectedImportedId]);

  useEffect(() => {
    if (!reportsLoaded) return;
    if (!moduleReports.length) {
      if (!requestedReportNameRef.current) setSelectedReportName("");
      setSelectedReportContent("");
      return;
    }
    if (requestedReportNameRef.current) {
      const requested = requestedReportNameRef.current;
      requestedReportNameRef.current = "";
      if (moduleReports.some((item) => item.fileName === requested)) {
        setSelectedReportName(requested);
        return;
      }
    }
    if (selectedReportName && !moduleReports.some((item) => item.fileName === selectedReportName)) { setSelectedReportName(""); writeModuleChoice(module, { reportName: "" }); }
  }, [moduleReports, selectedReportName, reportsLoaded, module]);

  useEffect(() => {
    let active = true;
    if (!selectedReportName) {
      setSelectedReportContent("");
      setSelectedReportState({ status: "idle", message: "" });
      return () => { active = false; };
    }
    if (selectedReport?.localOnly) {
      loadLocalAgentReport(selectedReportName).then((value) => {
        if (!active) return;
        setSelectedReportContent(String(value?.content || ""));
        setSelectedReportState({ status: "loaded", message: "" });
      }).catch((loadError) => {
        if (active) setSelectedReportState({ status: "error", message: `本机报告读取失败：${loadError.message}` });
      });
      return () => { active = false; };
    }
    setSelectedReportState({ status: "loading", message: "正在读取已保存报告…" });
    loadAgentReport(selectedReportName).then((value) => {
      if (!active) return;
      setSelectedReportContent(String(value?.content || ""));
      setSelectedReportState({ status: "loaded", message: "" });
    }).catch((loadError) => {
      if (!active) return;
      // Keep an optimistic just-saved copy visible if the follow-up read is delayed.
      // Existing reports still surface the read error instead of silently rebuilding.
      setSelectedReportState({ status: "error", message: `报告读取失败：${loadError.message}` });
    });
    return () => { active = false; };
  }, [selectedReportName, selectedReport]);
  useEffect(() => {
    if (!canSaveToServer) {
      setServerRunsReady(true);
      return undefined;
    }
    let active = true;
    setServerRunsReady(false);
    loadQualityAgentRunsFromServer().then((remoteRuns) => {
      if (!active || !Object.keys(remoteRuns).length) return;
      setRuns((current) => {
        const merged = { ...remoteRuns };
        // A refreshed page has already recovered its local running state as
        // interrupted. Do not let a stale server snapshot turn that state back
        // into an active run after the user has stopped it locally.
        Object.entries(current || {}).forEach(([moduleName, localRun]) => {
          const remoteRun = remoteRuns[moduleName];
          if (localRun?.status === "error" && remoteRun?.status === "running" && /停止|中断|连接/.test(String(localRun.error || ""))) {
            merged[moduleName] = localRun;
          }
        });
        return merged;
      });
    }).catch(() => {}).finally(() => { if (active) setServerRunsReady(true); });
    return () => { active = false; };
  }, [canSaveToServer]);
  useEffect(() => {
    saveQualityAgentRuns(runs);
    if (!canSaveToServer || !serverRunsReady) return undefined;
    if (serverRunSaveTimerRef.current) window.clearTimeout(serverRunSaveTimerRef.current);
    serverRunSaveTimerRef.current = window.setTimeout(() => {
      saveQualityAgentRunsToServer(runs).catch(() => {});
    }, 350);
    return () => {
      if (serverRunSaveTimerRef.current) window.clearTimeout(serverRunSaveTimerRef.current);
    };
  }, [runs, canSaveToServer, serverRunsReady]);
  useEffect(() => { localStorage.setItem(REPORT_PRESENTATION_STORAGE_KEY, layoutSkillName); }, [layoutSkillName]);
  useEffect(() => { try { localStorage.setItem(CHART_SKILL_STORAGE_KEY, chartSkillName); } catch {} }, [chartSkillName]);
  useEffect(() => {
    const choice = readModuleChoice(module);
    if (choice.chartSkillName) setChartSkillName(choice.chartSkillName);
    if (choice.layoutSkillName) setLayoutSkillName(normalizeReportPresentationProfile(choice.layoutSkillName));
    setSelectedReportName(choice.reportName || "");
    setReportsLoaded(false);
    loadAgentSkills().then((value) => {
      const allSkills = Array.isArray(value?.skills) ? value.skills : [];
      const next = allSkills.filter((item) => !String(item.id || item.name || "").startsWith("quality-role-"));
      const charts = allSkills.filter((item) => isRoleChartSkill(item));
      const chartList = charts.length ? charts : [{ id: DEFAULT_ANALYSIS_CHART_SKILL, name: DEFAULT_ANALYSIS_CHART_SKILL }, { id: "quality-role-charts-default", name: "quality-role-charts-default" }];
      setChartSkills(chartList);
      setChartSkillName((current) => chartList.some((item) => (item.name || item.id) === current) ? current : ((chartList.find((item) => (item.name || item.id) === DEFAULT_ANALYSIS_CHART_SKILL) || chartList[0])?.name || current));
      const core = next.find((item) => (item.name || item.id) === CORE_SKILL_NAME) || DEFAULT_CORE_SKILL;
      setCoreSkillContent(core.content || DEFAULT_CORE_SKILL.content);
      const defaultSkill = MODULE_DEFAULT_SKILLS[module] || MODULE_DEFAULT_SKILLS.DQA;
      const prefix = `${defaultSkill.name}-`;
      const compatible = next.filter((item) => {
        const name = String(item.name || item.id || "");
        return name === defaultSkill.name || name.startsWith(prefix);
      });
      const available = compatible.length ? compatible : [defaultSkill];
      setSkills(available);
      const rememberedSkill = readModuleChoice(module).skillName;
      const selected = available.find((item) => (item.name || item.id) === rememberedSkill) || available.find((item) => (item.name || item.id) === defaultSkill.name) || available[0];
      if (selected) { setSkillName(selected.name); setSkillContent(selected.content || ""); writeModuleChoice(module, { skillName: selected.name }); }
    }).catch(() => {
      const fallback = MODULE_DEFAULT_SKILLS[module] || MODULE_DEFAULT_SKILLS.DQA;
      setSkills([fallback]);
      const rememberedSkill = readModuleChoice(module).skillName || fallback.name;
      setSkillName(rememberedSkill);
      setSkillContent(rememberedSkill === fallback.name ? fallback.content : "");
      setCoreSkillContent(DEFAULT_CORE_SKILL.content);
    });
    refreshReports().finally(() => setReportsLoaded(true));
  }, [module]);

  const start = async ({ force = false } = {}) => {
    if (!canStart) {
      setError("当前账号没有“启动 Agent 分析”权限，请联系主管理员");
      return;
    }
    if (force && !window.confirm("确定重复分析当前模块吗？系统将重新调用大模型，并覆盖当前运行缓存；已保存到项目的历史报告不会删除。")) return;
    setSelectedReportName("");
    writeModuleChoice(module, { reportName: "" });
    setPinnedReport({ fileName: "", snapshot: null });
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;
    const throwIfStopped = () => {
      if (!controller.signal.aborted) return;
      const abortError = new Error("已停止本次 Agent 分析");
      abortError.name = "AbortError";
      throw abortError;
    };
    try {
      throwIfStopped();
      // When a previous run finished, raw rows are deliberately released from
      // browser memory. On continue, rebuild the snapshot from the freshly
      // loaded rows in the same click; using the stale empty-row snapshot was
      // incorrectly reported as an Agent data-audit failure.
      // Prefer the deterministic backend snapshot when the current run does
      // not already carry its own snapshot. This keeps the AI workflow from
      // re-reading and re-aggregating raw Excel rows on every run.
      const auditFailed = record.status === "error"
        && (record.currentStage === "audit" || record.stages?.audit?.status === "error");
      const sourceChanged = Boolean(sourceReady && sourceSignature && matchedSnapshotEntry?.sourceSignature && matchedSnapshotEntry.sourceSignature !== sourceSignature);
      const snapshotChoice = chooseAgentRunSnapshot({
        matchedSnapshot: matchedSnapshotEntry?.snapshot || null,
        liveSnapshot: snapshot,
        recordSnapshot: record.snapshot || null,
        sourceReady,
        auditFailed,
      });
      const canUseStoredSnapshot = snapshotChoice.canUseStoredSnapshot;
      let snapshotForRun = snapshotChoice.snapshotForRun;
      let reportFiles = agentFiles;
      const dqaSplitMissing = module === "DQA" && skillName === "quality-analysis-dqa-rd" && !dqaRdSnapshotReady(snapshotForRun);
      const qmsRowsMissing = module === "QMS" && !(agentFiles || []).some((file) => file.module === "QMS" && (file.rows || []).some((row) => Number(row["总体得分"]) > 0));
      if (module !== "DOAM" && (snapshotChoice.needsSourceHydration || dqaSplitMissing || qmsRowsMissing) && onEnsureAgentSources) {
        setSourceState({ status: "loading", message: "正在重新加载当前模块原始数据" });
        const nextSources = await onEnsureAgentSources(agentSourceModules(module), (progress) => {
          if (progress?.label) setSourceState({ status: "loading", message: progress.label });
        });
        throwIfStopped();
        const byKey = new Map();
        [...files.filter((source) => agentSourceModules(module).includes(source.module)), ...(nextSources || []).filter((source) => agentSourceModules(module).includes(source.module))].forEach((source) => {
          const key = `${source.module}::${source.name}`;
          const previous = byKey.get(key);
          const previousRows = Array.isArray(previous?.rows) ? previous.rows.length : 0;
          const nextRows = Array.isArray(source.rows) ? source.rows.length : 0;
          if (!previous || nextRows >= previousRows) byKey.set(key, source);
        });
        const refreshedFiles = [...byKey.values()];
        reportFiles = refreshedFiles;
        setAgentFiles(refreshedFiles);
        snapshotForRun = buildQualityAgentSnapshot({ data, files: refreshedFiles, dateRange: period, module, orgMappings, agentRaw: dqaAgentRaw });
        setSourceState({ status: "ready", message: "原始数据已重新加载，正在继续 Agent 分析" });
      }
      if (module === "IQC" && matchedSnapshotEntry?.matchLevel === "coverage" && matchedSnapshotEntry.selectedWindow) {
        snapshotForRun = sliceIqcSnapshotToWindow(matchedSnapshotEntry.snapshot || snapshotForRun, matchedSnapshotEntry.selectedWindow, matchedSnapshotEntry.dateRange, snapshotRegistry?.history || []);
        if (iqcSplitDetailsMissing(snapshotForRun?.data?.iqcSplit)) snapshotForRun = refillIqcSnapshotDetails(snapshotForRun, snapshotRegistry?.history || [], matchedSnapshotEntry.selectedWindow);
      }
      if (module === "IPQC" && matchedSnapshotEntry?.matchLevel === "coverage" && matchedSnapshotEntry.selectedWindow) {
        snapshotForRun = sliceIpqcSnapshotToWindow(snapshotForRun, matchedSnapshotEntry.selectedWindow, matchedSnapshotEntry.dateRange);
      }
      if (module === "OQC" && matchedSnapshotEntry?.matchLevel === "coverage" && matchedSnapshotEntry.selectedWindow) {
        snapshotForRun = sliceOqcSnapshotToWindow(snapshotForRun, matchedSnapshotEntry.selectedWindow, matchedSnapshotEntry.dateRange);
      }
      if (module === "DQA" && matchedSnapshotEntry?.matchLevel === "coverage" && matchedSnapshotEntry.selectedWindow) {
        snapshotForRun = sliceDqaRdSnapshotToWindow(snapshotForRun, matchedSnapshotEntry.selectedWindow, matchedSnapshotEntry.dateRange);
      }
      if (matchedSnapshotEntry?.matchLevel === "coverage" && matchedSnapshotEntry.selectedWindow) {
        snapshotForRun = applyQualitySnapshotWindow(snapshotForRun, matchedSnapshotEntry.selectedWindow);
      }
      if (module === "DQA" && snapshotForRun?.data?.dqaSplit) {
        snapshotForRun = { ...snapshotForRun, data: { ...snapshotForRun.data, dqaSplit: applyDqaPmMachined(snapshotForRun.data.dqaSplit, dqaAgentRaw, orgMappings) } };
      }
      if (module === "QMS") {
        const qmsSplit = buildQmsCustomerSplit({ qms: data?.qms, files: reportFiles, period });
        if (qmsSplit) snapshotForRun = { ...(snapshotForRun || { module: "QMS", data: {} }), module: "QMS", data: { ...(snapshotForRun?.data || {}), qmsSplit } };
      }
      if (module === "DOAM") {
        const doamSplit = buildDoamStabilitySplit(doamDataset || data?.doam || {}, period);
        if (doamSplit) snapshotForRun = { ...(snapshotForRun || { module: "DOAM", data: {} }), module: "DOAM", data: { ...(snapshotForRun?.data || {}), doamSplit } };
      }
      throwIfStopped();
      const currentHash = qualityAgentSnapshotHash(snapshotForRun);
      const sameSnapshot = record.snapshotHash === currentHash || record.snapshotHash === currentHash.slice(0, 80);
      const hasCompleteReport = record.status === "done" && Boolean(record.content);
      let existing = record;
      if (force) {
        existing = null;
      } else if (hasCompleteReport && sameSnapshot) {
        if (!window.confirm("当前数据和统计周期均未变化，已生成报告。继续后会从头重新分析并覆盖当前运行缓存；如需保留当前版本，请先点击“保存到项目”。是否继续？")) return;
        existing = null;
      }
      const coverageText = matchedSnapshotEntry?.matchLevel === "coverage" ? "。覆盖 " + (matchedSnapshotEntry.coverage?.start || matchedSnapshotEntry.dateRange?.start2026 || "") + " ~ " + (matchedSnapshotEntry.coverage?.end || matchedSnapshotEntry.dateRange?.end2026 || "") + "，本次窗口 " + (matchedSnapshotEntry.selectedWindow?.start || period.start2026 || "") + " ~ " + (matchedSnapshotEntry.selectedWindow?.end || period.end2026 || "") : "";
      const activitySeed = [canUseStoredSnapshot ? "使用已有快照，本次不重读 Excel" + coverageText + (sourceChanged ? "。当前内存里的文件行数和快照登记不一致，日期仍在覆盖范围内，继续用这份快照" : "") : snapshotChoice.storedSnapshotEmpty ? "已有快照没有来源记录，不能拿来出报告。本次已读取 Excel，并按这份明细重做快照" : matchedSnapshotEntry ? "快照目录有记录，但没有读到快照正文，改为用当前数据现算" : "没有覆盖 " + (period.start2026 || "") + " ~ " + (period.end2026 || "") + " 的快照，改为用当前数据现算"];
      snapshotForRun = alignIqcYieldMetrics(snapshotForRun);
      const durationKey = "analysis:" + module + ":" + skillName;
      const runStartedAt = Date.now();
      const next = await runQualityAgent({ snapshot: snapshotForRun, skillName, skillContent: combinedSkillContent, layoutProfileId: layoutSkillName, existing, requestChat: (messages, options = {}) => requestAiChat(messages, { ...options, operation: "quality-agent-start" }), signal: controller.signal, onUpdate: update, activitySeed, durationKey });
      if (next?.status === "done") writeReportDuration(durationKey, (Date.now() - runStartedAt) / 1000);
      if (next.status === "error") setError(`${next.currentStage || "Agent分析"}：${next.error}`);
      else {
        // Keep the deterministic aggregate snapshot for rendering, but release raw Excel rows.
        const visualSpec = mergeModuleVisualSpec(next.visualSpec || extractReportVisualSpec(next.content || ""), snapshotForRun, module, { ipqcAssembly: formalIpqcLayout, oqcShipment: formalOqcLayout, dqaRd: formalDqaLayout });
        update({ ...next, visualSpec });
        if (next.content) await saveReportContent(next.content, { ...next, visualSpec, snapshot: snapshotForRun, module, skillName, layoutProfileId: layoutSkillName, period: snapshotForRun.period || period, model: next.model || "" });
        setAgentFiles((current) => current
          .filter((source) => agentSourceModules(module).includes(source.module))
          .map(({ rows, ...source }) => ({ ...source, rows: [] })));
      }
    } catch (startError) {
      const stopped = startError?.name === "AbortError" || controller.signal.aborted;
      const message = stopped ? "已停止本次 Agent 分析，已完成阶段保留，可继续。" : `Agent 分析启动失败：${startError?.message || String(startError)}`;
      setError(message);
      setSourceState((current) => ({ ...current, status: stopped ? "ready" : "error", message }));
      update({ ...record, status: "error", error: message, currentStage: record.currentStage || "audit", progress: { ...(record.progress || {}), phase: stopped ? "已停止" : "启动失败", detail: message } });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const stop = () => {
    const controller = abortRef.current;
    if (controller && !controller.signal.aborted) controller.abort();
    if (abortRef.current === controller) abortRef.current = null;
    const message = "已停止本次分析。已保存到项目的报告不会删除。";
    setError("");
    setSourceState((current) => ({ ...current, status: "ready", message }));
    setRuns((current) => {
      const active = current[module] || {};
      if (active.status !== "running" && active.status !== "error") return current;
      const stageId = active.currentStage || "audit";
      return {
        ...current,
        [module]: {
          ...active,
          status: "idle",
          error: "",
          stages: {
            ...(active.stages || {}),
            [stageId]: {
              ...(active.stages?.[stageId] || {}),
              status: "pending",
              error: "",
            },
          },
          progress: { percent: 0, phase: "已停止", detail: message },
        },
      };
    });
  };

  const closeAction = (actionId) => {
    try {
      const next = closeQualityAgentAction(record, actionId, closureEvidence[actionId]);
      update(next);
      setClosureEvidence((current) => ({ ...current, [actionId]: "" }));
      setSaveState({ status: "saved", message: `${actionId} 已核验关闭；后续同模块分析将按重开阈值自动复查。` });
    } catch (closeError) {
      setSaveState({ status: "error", message: closeError.message });
    }
  };

  const sendSavedToSelected = async () => {
    const person = String(sendTarget || "").trim();
    if (!canSaveToServer) { setSendNotice({ status: "error", message: "只有主管理员可以从这里发送企业微信" }); return; }
    if (!selectedReportContent) { setSendNotice({ status: "error", message: "请先在项目报告中选择要发送的报告" }); return; }
    if (!person) { setSendNotice({ status: "error", message: "请先选择收件人" }); return; }
    const formatLabel = sendFormat === "html" ? "HTML 网页" : "PDF";
    setSendNotice({ status: "running", message: `正在把这份${formatLabel}发给 ${person}…` });
    try {
      let fileName = selectedReport?.localOnly ? "" : String(selectedReportName || "");
      if (!/^QMS-Agent报告-.+\.md$/i.test(fileName)) {
        const saved = await saveAgentReportFile({ module: selectedReport?.module || module, skillName: selectedReport?.skillName || skillName, layoutProfileId: selectedReport?.layoutProfileId || layoutSkillName, period: selectedReport?.period || snapshot.period || period, model: selectedReport?.model || "", creatorIp: selectedReport?.creatorIp || creatorIp || resolvedCreatorIp, content: selectedReportContent, visualSpec: selectedReport?.visualSpec || extractReportVisualSpec(selectedReportContent) });
        fileName = saved.fileName;
      }
      const preview = await previewWecomSend([{ fileName, recipient: person, role: "" }]);
      const matched = (preview.rows || [])[0];
      if (!matched || matched.status !== "ok") {
        setSendNotice({ status: "error", message: matched?.reason || `${person} 还不能发送。请到系统管理-员工信息填写企业微信 userid` });
        return;
      }
      const payload = await sendWecomReports([fileName], person, { layoutProfileId: layoutSkillName, format: sendFormat, snapshot: pageExportSnapshot(), visualSpec: pageExportVisualSpec(selectedReportContent, selectedReport || {}) });
      const failed = (payload.results || []).find((item) => !item.ok);
      setSendNotice({ status: failed ? "error" : "done", message: failed ? `发送失败：${failed.reason || "未知原因"}` : `发送成功：已把${formatLabel}发给 ${person}` });
    } catch (error) { setSendNotice({ status: "error", message: `发送失败：${error.message}` }); }
  };
  const saveReportContent = async (content, source = {}) => {
    if (!content) return;
    setSaveState({ status: "saving", message: "正在保存导出内容到项目报告库…" });
    try {
      const saved = canSaveToServer
        ? await saveAgentReportFile({ module: source.module || module, skillName: source.skillName || skillName, layoutProfileId: source.layoutProfileId || layoutSkillName, period: source.period || snapshot.period || period, model: source.model || "", creatorIp: source.creatorIp || creatorIp || resolvedCreatorIp, content, visualSpec: mergeModuleVisualSpec(source.visualSpec || extractReportVisualSpec(content), source.snapshot || displaySnapshot, source.module || module, { ipqcAssembly: (source.skillName || skillName) === "quality-analysis-ipqc-assembly", oqcShipment: (source.skillName || skillName) === "quality-analysis-oqc-shipment", dqaRd: (source.skillName || skillName) === "quality-analysis-dqa-rd" }) })
        : await saveLocalAgentReport({ module: source.module || module, skillName: source.skillName || skillName, layoutProfileId: source.layoutProfileId || layoutSkillName, layoutSkillName: source.layoutSkillName || source.layoutProfileId || layoutSkillName, period: source.period || snapshot.period || period, model: source.model || "", creatorIp: source.creatorIp || creatorIp || resolvedCreatorIp, content, visualSpec: mergeModuleVisualSpec(source.visualSpec || extractReportVisualSpec(content), source.snapshot || displaySnapshot, source.module || module, { ipqcAssembly: (source.skillName || skillName) === "quality-analysis-ipqc-assembly", oqcShipment: (source.skillName || skillName) === "quality-analysis-oqc-shipment", dqaRd: (source.skillName || skillName) === "quality-analysis-dqa-rd" }) });
      const entry = { ...saved, module: saved.module || module, localOnly: saved.localOnly === true || !canSaveToServer };
      await refreshReports().catch(() => {});
      // Always merge the save response into the current list. This covers
      // IndexedDB/local-only saves and PostgreSQL responses that arrive before
      // the report-list refresh is visible to the browser.
      setSavedReports((current) => [entry, ...current.filter((item) => item.fileName !== entry.fileName)]);
      setSelectedReportName(entry.fileName); writeModuleChoice(module, { reportName: entry.fileName });
      setPinnedReport({ fileName: entry.fileName, snapshot: source.snapshot || displaySnapshot });
      setSelectedReportContent(String(saved.content || content || ""));
      setSelectedReportState({ status: "loaded", message: "" });
      setSaveState({ status: "saved", message: canSaveToServer ? `已保存到服务器：${saved.relativePath || saved.fileName}` : `已保存到本机：${saved.fileName}` });
    } catch (saveError) {
      setSaveState({ status: "error", message: `保存失败：${saveError.message}` });
    }
  };

  const slimExportSnapshot = (snapshot) => {
    const data = snapshot?.data;
    if (!data || typeof data !== "object") return null;
    const picked = {};
    ["iqcSplit", "ipqcSplit", "oqcSplit", "dqaSplit", "qmsSplit", "doamSplit"].forEach((key) => { if (data[key]) picked[key] = data[key]; });
    return Object.keys(picked).length ? { data: picked } : null;
  };
  const pageExportSnapshot = () => slimExportSnapshot(module === "QMS" || module === "DOAM" ? displaySnapshot : selectedReportSnapshot);
  const pageExportVisualSpec = (content, source = {}) => mergeModuleVisualSpec(source.visualSpec || extractReportVisualSpec(content || ""), module === "QMS" || module === "DOAM" ? displaySnapshot : (source.snapshot || selectedReportSnapshot), source.module || module, { ipqcAssembly: formalIpqcLayout, oqcShipment: formalOqcLayout, dqaRd: formalDqaLayout });
  const reportPdfPayload = (content, source = {}) => ({
    content,
    module: source.module || module,
    role: source.role || "",
    recipient: source.recipient || "",
    period: source.period && typeof source.period === "object" ? source.period : null,
    visualSpec: pageExportVisualSpec(content, source),
    snapshot: pageExportSnapshot(),
    fileName: source.fileName && !source.localOnly && !source.importedAt ? source.fileName : "",
    layoutProfileId: layoutSkillName,
  });
  const openPdfForPrint = (blob) => {
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener");
    if (!win) {
      URL.revokeObjectURL(url);
      throw new Error("浏览器拦截了打印窗口，请允许弹出窗口后重试");
    }
    window.setTimeout(() => { try { win.focus(); win.print(); } catch {} }, 800);
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  };
  const printReport = async (content, source = {}) => {
    if (!content) { setSaveState({ status: "error", message: "当前没有可打印的报告内容" }); return; }
    setSaveState({ status: "saving", message: "正在按发送版式生成打印文件…" });
    try {
      const { blob } = await fetchReportPdf(reportPdfPayload(content, source));
      openPdfForPrint(blob);
      setSaveState({ status: "saved", message: "已打开与发送相同的 PDF，请在新窗口打印" });
    } catch (printError) {
      setSaveState({ status: "error", message: `打印失败：${printError.message || printError}` });
    }
  };

  const prepareReportPdf = async (content, source = {}, signature = "") => {
    if (!content) { setPdfDownload({ signature, status: "error", blob: null, fileName: "", message: "当前没有可下载的报告内容" }); return; }
    const fallbackName = reportFileName({ ...source, module: source.module || module }, "pdf");
    setPdfDownload({ signature, status: "preparing", blob: null, fileName: fallbackName, message: "正在按发送版式生成 PDF…" });
    try {
      const { blob, fileName } = await fetchReportPdf(reportPdfPayload(content, source));
      setPdfDownload({ signature, status: "ready", blob, fileName: fileName || fallbackName, message: `PDF 已生成（${Math.max(1, Math.round(blob.size / 1024)).toLocaleString("zh-CN")} KB），点击保存` });
    } catch (pdfError) {
      setPdfDownload({ signature, status: "error", blob: null, fileName: fallbackName, message: `PDF 生成失败：${pdfError.message || pdfError}` });
    }
  };

  const savePreparedPdf = async () => {
    if (pdfDownload.status !== "ready" || !pdfDownload.blob) return;
    try {
      const savedBytes = await savePdfBlobWithPicker(pdfDownload.blob, pdfDownload.fileName);
      setSaveState({ status: "saved", message: `PDF 已保存并校验完成（${Math.max(1, Math.round(savedBytes / 1024)).toLocaleString("zh-CN")} KB）` });
      setDownloadTarget("");
    } catch (saveError) {
      if (saveError?.name === "AbortError") return;
      setSaveState({ status: "error", message: `PDF 保存失败：${saveError.message || saveError}` });
    }
  };

  const shareReport = async (content, source = {}) => {
    if (!content) return;
    const reportModule = source.module || module;
    const shareUrl = reportShareUrl(reportModule, source);
    try {
      if (!navigator.share) throw new Error("当前浏览器不支持调用微信分享面板");
      // Only pass the URL. WeChat otherwise prioritizes the text payload and
      // treats the operation as copied text instead of a link share.
      await navigator.share({ url: shareUrl });
      setSaveState({ status: "saved", message: `报告链接已交给微信分享：${shareUrl}` });
    } catch (shareError) {
      if (shareError?.name === "AbortError") return;
      setSaveState({ status: "error", message: `分享失败：${shareError.message || "请检查微信分享组件"}` });
    }
  };

  const downloadReportMarkdown = (content, source = {}) => {
    if (!content) return;
    downloadAgentReport({ ...source, module: source.module || module, content });
  };
  const downloadReportHtml = async (content, source = {}) => {
    if (!content) return;
    setDownloadTarget("");
    setSaveState({ status: "saving", message: "正在生成 HTML 网页…" });
    try {
      const { blob, fileName } = await fetchReportFile({ ...reportPdfPayload(content, source), format: "html" });
      downloadBlob(blob, fileName);
      setSaveState({ status: "saved", message: "HTML 已下载：" + fileName + "。用浏览器打开，页面连续显示，不会分页截断。" });
    } catch (htmlError) {
      setSaveState({ status: "error", message: "HTML 下载失败：" + (htmlError.message || htmlError) });
    }
  };

  const renderReportActions = ({ id, content, source = {}, reportRef }) => {
    if (!content) return null;
    const open = downloadTarget === id;
    const pdfSignature = `${id}:${layoutSkillName}:${source.updatedAt || source.importedAt || source.generatedAt || "current"}:${content.length}:${content.slice(-32)}`;
    const activePdf = pdfDownload.signature === pdfSignature ? pdfDownload : { status: "idle", message: "" };
    const toggleDownload = () => {
      if (open) { setDownloadTarget(""); return; }
      setDownloadTarget(id);
      if (activePdf.status !== "ready" && activePdf.status !== "preparing") prepareReportPdf(content, source, pdfSignature);
    };
    const handlePdfAction = () => {
      if (activePdf.status === "ready") savePreparedPdf();
      else if (activePdf.status !== "preparing") prepareReportPdf(content, source, pdfSignature);
    };
    return <div className="report-action-toolbar" aria-label="报告操作">
      <button type="button" className="report-action-button" title="调用系统分享，可选择企业微信、微信或钉钉" onClick={() => shareReport(content, source)}><ShareNetwork size={18}/><span>Share</span></button>
      <button type="button" className="report-action-button" title="打印当前网页报告" onClick={() => printReport(content, source)}><Printer size={18}/><span>Print</span></button>
      <div className="report-action-download"><button type="button" className="report-action-button" title="下载报告" aria-expanded={open} onClick={toggleDownload}><DownloadSimple size={18}/><span>Download</span></button>{open && <div className="report-action-menu" role="menu"><button type="button" role="menuitem" disabled={activePdf.status === "preparing"} onClick={handlePdfAction}><FilePdf size={16}/><span>{activePdf.status === "preparing" ? "正在生成 PDF…" : activePdf.status === "ready" ? "保存 PDF" : activePdf.status === "error" ? "重新生成 PDF" : "生成 PDF"}</span><small>{activePdf.message || "生成完成后弹出系统保存窗口"}</small></button><button type="button" role="menuitem" onClick={() => downloadReportHtml(content, source)}><FileHtml size={16}/><span>HTML 网页</span><small>连续页面，不会分页截断</small></button><button type="button" role="menuitem" onClick={() => { setDownloadTarget(""); downloadReportMarkdown(content, source); }}><DownloadSimple size={16}/><span>MD 文档</span></button></div>}</div>
      <button type="button" className="report-action-button is-save" title="保存当前报告到项目报告库" onClick={() => saveReportContent(content, source)} disabled={saveState.status === "saving"}><FloppyDisk size={18}/><span>{saveState.status === "saving" ? "Saving…" : "Save"}</span></button>
    </div>;
  };

  const removeSavedReport = async (fileName) => {
    if (!window.confirm("确定删除这份 Agent 项目报告吗？")) return;
    try {
      if (String(fileName).startsWith("本地-Agent报告-") || selectedReport?.localOnly) await deleteLocalAgentReport(fileName);
      else {
        if (!canSaveToServer) { setSaveState({ status: "error", message: "普通用户不能删除服务器报告" }); return; }
        await deleteAgentReport(fileName);
      }
      await refreshReports();
    } catch (deleteError) { setSaveState({ status: "error", message: `删除失败：${deleteError.message}` }); }
  };

  const importReport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
  try {
      if (/\.doc$/i.test(file.name)) throw new Error("暂不支持 .doc，请先另存为 .docx");
      const text = /\.docx$/i.test(file.name) ? await readDocxReport(file) : await file.text();
      const content = importedContentFromText(file.name, text).trim().slice(0, 120000);
      if (!content) throw new Error("报告内容为空");
      const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: file.name,
        content,
        importedAt: new Date().toISOString(),
      };
      const nextReports = [item, ...importedReports.filter((report) => report.fileName !== file.name)].slice(0, MAX_IMPORTED_REPORTS_PER_MODULE);
      const all = readImportedReports();
      all[module] = nextReports;
      saveImportedReports(all);
      setImportedReports(nextReports);
      setSelectedImportedId(item.id);
      setShowImportedReport(true);
      setSaveState({ status: "saved", message: `已导入：${file.name}` });
    } catch (importError) {
      setSaveState({ status: "error", message: `导入失败：${importError.message}` });
    }
  };

  const removeImportedReport = (id) => {
    const target = importedReports.find((item) => item.id === id);
    if (!target || !window.confirm(`确定删除导入报告“${target.fileName}”吗？`)) return;
    const nextReports = importedReports.filter((item) => item.id !== id);
    const all = readImportedReports();
    all[module] = nextReports;
    saveImportedReports(all);
    setImportedReports(nextReports);
    setShowImportedReport(false);
  };

  return <div className="qmdp-page quality-agent-page">
    <div className={`agent-generation-progress ${record.status === "error" ? "error" : workflowProgress.percent >= 100 ? "done" : ""}`} role="status" aria-live="polite"><div className="agent-generation-progress-head"><strong>{workflowProgress.phase}</strong><b>{Math.round(workflowProgress.percent || 0)}%</b></div><div className="agent-generation-progress-track"><i style={{ width: `${Math.max(0, Math.min(100, workflowProgress.percent || 0))}%` }} /></div><small className="agent-generation-progress-detail">{workflowProgress.detail}</small></div>
    <div className="quality-agent-hero"><div><span className="qmdp-eyebrow">QUALITY ANALYSIS AGENT / {module}</span><h2>{AGENT_TITLE} · {module}</h2><p>基于软件固定统计结果生成可审计的 {module} 质量复盘和改善行动。角色报告、发送任务与考试统计在独立 Agent 页面处理。</p></div><Brain size={42} weight="duotone" /></div>
    <section className="qmdp-card quality-agent-controls">
      <label>模块分析 Skill<select value={skillName} onChange={(event) => { const selected = skills.find((item) => item.name === event.target.value); setSkillName(event.target.value); setSkillContent(selected?.content || ""); writeModuleChoice(module, { skillName: event.target.value }); }}>{skills.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select><small>自动叠加 {CORE_SKILL_NAME}</small></label>
      <label>图表 Skill<select value={chartSkillName} onChange={(event) => { setChartSkillName(event.target.value); writeModuleChoice(module, { chartSkillName: event.target.value }); }} disabled={styleOwnsCharts}>{chartSkills.map((item) => <option key={item.id || item.name} value={item.name || item.id}>{item.name || item.id}</option>)}</select><small>{styleOwnsCharts ? "图型由当前网页风格规定，这里不生效" : "切换后立即重绘当前、历史和导入报告里的图表，不重新调用大模型"}</small></label>
      <label>网页呈现风格<select value={layoutSkillName} onChange={(event) => { const next = normalizeReportPresentationProfile(event.target.value); setLayoutSkillName(next); writeModuleChoice(module, { layoutSkillName: next }); }}>{layoutSkills.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>{reportLayoutLabel(layoutSkillName)} · 只改排版，不调用模型</small></label>
      <label>统计开始<input type="date" value={period.start2026 || ""} onChange={(event) => setPeriod((current) => { const next = { ...current, start2026: event.target.value }; writeModuleChoice(module, { start2026: next.start2026, end2026: next.end2026 || "" }); return next; })}/></label>
      <label>统计结束<input type="date" value={period.end2026 || ""} onChange={(event) => setPeriod((current) => { const next = { ...current, end2026: event.target.value }; writeModuleChoice(module, { start2026: next.start2026 || "", end2026: next.end2026 }); return next; })}/></label>
      <span>分析模块：{module} · 当前周期：{period.start2026}—{period.end2026}{sourceState.message ? ` · ${sourceState.message}` : ""}{snapshotCacheMessage ? ` · ${snapshotCacheMessage}` : ""}{auditSummary.grade && <em className={`quality-agent-audit-grade grade-${String(auditSummary.grade).toLowerCase()}`} title={auditDetail || "数据审计通过"}>数据可信度 {auditSummary.grade}</em>}</span>
      <div className={`quality-agent-snapshot-trace ${snapshotTrace.status}`}><b>{snapshotTrace.label}</b><span>{snapshotTrace.detail}</span><small>{snapshotTrace.meta}</small></div>
      <div className="quality-agent-report-toolbar">
        <label>项目报告<select value={selectedReportName} onChange={(event) => { const name = event.target.value; setSelectedReportName(name); writeModuleChoice(module, { reportName: name }); setPinnedReport((current) => current.fileName === name ? current : { fileName: "", snapshot: null }); }} disabled={!moduleReports.length}><option value="">{moduleReports.length ? "请选择已保存报告" : "暂无已保存报告"}</option>{moduleReports.map((item) => <option key={item.fileName} value={item.fileName}>{item.fileName} · {new Date(item.updatedAt).toLocaleString("zh-CN")}</option>)}</select></label>
        <button className="qmdp-secondary-btn" onClick={refreshReports}><ArrowsClockwise size={15}/>刷新报告库</button>
        
        {selectedReportName && <button className="qmdp-danger-btn" onClick={() => removeSavedReport(selectedReportName)}><Trash size={14}/>删除所选报告</button>}
        <input ref={importInputRef} type="file" accept=".docx,.md,.markdown,.txt,.json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain,application/json" onChange={importReport} hidden/>
        <button className="qmdp-secondary-btn" onClick={() => importInputRef.current?.click()}><FileArrowUp size={15}/>导入 Agent 报告</button>
        <label>外部报告<select value={selectedImportedId} onChange={(event) => { setSelectedImportedId(event.target.value); setShowImportedReport(Boolean(event.target.value)); writeModuleChoice(module, { importedId: event.target.value }); }} disabled={!importedReports.length}><option value="">暂无导入报告</option>{importedReports.map((item) => <option key={item.id} value={item.id}>{item.fileName} · {new Date(item.importedAt).toLocaleString("zh-CN")}</option>)}</select></label>
        {selectedImportedReport && <button className="qmdp-secondary-btn" onClick={() => setShowImportedReport((current) => !current)}><span>{showImportedReport ? <EyeSlash size={15}/> : <Eye size={15}/>}</span>{showImportedReport ? "取消显示外部报告" : "显示外部报告"}</button>}
      </div>
      <div className="quality-agent-analysis-actions">{record.status === "done" && record.content && record.status !== "running" && <button className="qmdp-secondary-btn" onClick={() => start({ force: true })} disabled={!canStart || record.status === "running"} title="重新调用大模型，覆盖当前运行缓存"><ArrowsClockwise size={16}/>重复分析</button>}<button className="qmdp-primary-btn" onClick={start} disabled={!canStart || record.status === "running"} title={!canStart ? "仅主管理员可以启动 Agent 分析" : "启动 Agent 分析"}><Brain size={16}/>{record.status === "error" ? "继续 Agent分析" : "启动 Agent分析"}</button><button className="qmdp-danger-btn" onClick={stop} disabled={record.status !== "running" && record.status !== "error"} title="停止当前模块这次分析，不影响其他模块和已保存报告"><WarningCircle size={16}/>停止分析</button><button type="button" className="qmdp-secondary-btn" onClick={() => setBackendOpen((current) => !current)}>{backendOpen ? "收起后台" : "查看后台"}</button></div>
    </section>
    {backendOpen && <section className="quality-agent-backend" aria-live="polite"><header><strong>后台过程</strong><small>{record.status === "running" ? "进行中" : record.status === "error" ? "已停止或失败" : record.status === "done" ? "已完成" : "尚未启动"}</small></header><pre ref={backendLogRef}>{(record.activityLog || []).length ? (record.activityLog || []).map((item) => formatBackendLogTime(item.at) + "  " + item.message).join("\n") : "还没有后台记录。启动分析后，这里会按时间写出每一步。"}{record.status === "running" && record.activityLog?.length ? "\n" + formatBackendLogTime(backendNow) + "  仍在等待上一步返回，已过去 " + backendWaitSeconds(record.activityLog, backendNow) + " 秒。这一步结束前不会有新的模型正文。" : ""}</pre></section>}
    {!formalReportLayout && record.actionLedger && <section className={`qmdp-card quality-agent-action-ledger ${record.actionLedger.status || "warning"}`}><header><button type="button" className="quality-agent-stage-toggle" onClick={() => setLedgerOpen((current) => !current)}><span>{record.actionLedger.status === "ready" ? <CheckCircle size={18} weight="fill"/> : <WarningCircle size={18} weight="fill"/>}</span><strong>改善行动台账</strong>{ledgerOpen ? <CaretDown size={16}/> : <CaretRight size={16}/>}</button><small>{record.actionLedger.message}</small></header>{ledgerOpen && <div className="quality-agent-ledger-body">{record.actionLedger.actions?.length ? <div className="agent-report-table-wrap"><table className="agent-report-table quality-agent-ledger-table"><thead><tr><th>行动</th><th>责任与期限</th><th>验收复查</th><th>状态</th></tr></thead><tbody>{record.actionLedger.actions.map((item) => <tr key={item.id}><td><b>{item.id} · {item.phase}</b><span>{item.action}</span><small>{item.conclusionId} · {item.evidenceIds?.join("、") || "证据待补"}</small></td><td><b>{item.owner}</b><span>{item.dueDate || "期限待定"}</span><small>{item.deliverable || "交付物待补"}</small></td><td><b>{actionMetricLabel(item)}</b><span>复查：{item.reviewDate || "待定"}</span><small>{item.statusReason}</small></td><td><em className={`quality-agent-action-status status-${item.status}`}>{ACTION_STATUS_LABELS[item.status] || item.status}</em>{item.status === "verification-ready" && <div className="quality-agent-close-action"><input value={closureEvidence[item.id] || ""} onChange={(event) => setClosureEvidence((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="关闭证据位置/编号"/><button type="button" className="qmdp-primary-btn" onClick={() => closeAction(item.id)}>核验关闭</button></div>}{item.closureEvidence && <small>关闭证据：{item.closureEvidence}</small>}</td></tr>)}</tbody></table></div> : <p className="quality-agent-save-state error">{record.actionLedger.message}</p>}</div>}</section>}
    {saveState.message && !selectedReportName && <p className={`quality-agent-save-state ${saveState.status}`}>{saveState.message}</p>}
    {selectedReportName && <section ref={savedReportRef} className={`qmdp-card quality-agent-saved-report ${activeReportLayoutClass}`}><header><div><strong>已保存报告 · {module}</strong><span>{selectedReport?.updatedAt ? new Date(selectedReport.updatedAt).toLocaleString("zh-CN") : ""}</span></div>{renderReportActions({ id: "saved", content: selectedReportContent, source: { ...(selectedReport || {}), module: selectedReport?.module || module }, reportRef: savedReportRef })}{canSaveToServer && <label className="report-direct-send"><EmployeeSearchSelect employees={employees} value={sendTarget} onChange={setSendTarget} disabled={sendNotice.status === "running"} /><select className="report-format-select" aria-label="发送格式" value={sendFormat} onChange={(event) => setSendFormat(event.target.value)} disabled={sendNotice.status === "running"}><option value="pdf">PDF</option><option value="html">HTML 网页</option></select><button type="button" className="qmdp-primary-btn" onClick={sendSavedToSelected} disabled={sendNotice.status === "running" || !sendTarget || !selectedReportContent}><PaperPlaneTilt size={15}/>指定发送</button>{sendNotice.message && <strong className={`report-send-status ${sendNotice.status}`}>{sendNotice.message}</strong>}</label>}{selectedReportState.status === "loading" && <small>读取中…</small>}</header>{selectedReportState.message && <p className={`quality-agent-save-state ${selectedReportState.status === "error" ? "error" : ""}`}>{selectedReportState.message}</p>}{selectedReportContent && <div className={`quality-agent-report-content ${activeReportLayoutClass}`} dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(selectedReportContent, { chartFirst: true, snapshot: module === "QMS" || module === "DOAM" ? displaySnapshot : selectedReportSnapshot, publisher: true, profileId: layoutSkillName, module, visualSpec: mergeModuleVisualSpec(selectedReport?.visualSpec || extractReportVisualSpec(selectedReportContent), module === "QMS" || module === "DOAM" ? displaySnapshot : selectedReportSnapshot, module, { ipqcAssembly: formalIpqcLayout, oqcShipment: formalOqcLayout, dqaRd: formalDqaLayout }), chartTheme, orgMappings }) }}/>}</section>}
    {showImportedReport && selectedImportedReport && <section ref={importedReportRef} className={`qmdp-card quality-agent-imported-report ${activeReportLayoutClass}`}><header><div><strong>外部导入报告 · {module}</strong><small>导入的报告独立保存，不覆盖在线分析和项目报告库</small></div>{renderReportActions({ id: "imported", content: selectedImportedReport.content, source: { ...selectedImportedReport, module }, reportRef: importedReportRef })}</header><div className="quality-agent-imported-report-toolbar"><span>{selectedImportedReport.fileName} · {new Date(selectedImportedReport.importedAt).toLocaleString("zh-CN")}</span><div><button className="qmdp-secondary-btn" onClick={() => setShowImportedReport(false)}><EyeSlash size={14}/>取消显示</button><button className="qmdp-danger-btn" onClick={() => removeImportedReport(selectedImportedReport.id)}><Trash size={14}/>删除导入报告</button></div></div><div className={`quality-agent-report-content ${activeReportLayoutClass}`} dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(selectedImportedReport.content, { chartFirst: true, publisher: true, profileId: layoutSkillName, module, chartTheme, orgMappings }) }}/></section>}
    {error && <div className="quality-agent-error-banner"><WarningCircle size={18}/>{error}</div>}
  </div>;
}


