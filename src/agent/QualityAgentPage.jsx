import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsClockwise, Brain, CaretDown, CaretRight, CheckCircle, DownloadSimple, Eye, EyeSlash, FileArrowUp, FilePdf, FloppyDisk, Printer, ShareNetwork, Trash, WarningCircle } from "@phosphor-icons/react";
import { deleteAgentReport, deleteLocalAgentReport, loadAgentReport, loadAgentReports, loadCurrentUser, loadLocalAgentReport, loadLocalAgentReports, loadAgentSkills, loadQualityAgentSnapshotRegistry, requestAiChat, saveAgentReportFile, saveLocalAgentReport } from "../dataStore.js";
import { loadQualityAgentRunsFromServer, saveQualityAgentRunsToServer } from "../dataStore.js";
import { buildQualityAgentSnapshot } from "./qualitySnapshot.js";
import { closeQualityAgentAction, loadQualityAgentRuns, qualityAgentSnapshotHash, QUALITY_AGENT_STAGES, runQualityAgent, saveQualityAgentRuns } from "./qualityAgent.js";
import { calloutToneClass, headingClass, isLayoutMarker, isMachineMetadataLine, metricLine, sectionClass, tableToneClass } from "./reportLayout.js";
import { DEFAULT_REPORT_PRESENTATION_PROFILE, getReportPresentationProfile, normalizeReportPresentationProfile, REPORT_PRESENTATION_PROFILES, reportPresentationClass } from "./reportPresentationProfiles.js";
import { normalizeQualitySnapshotRegistry, pickLatestQualitySnapshot } from "./snapshotRegistry.js";
import { extractReportVisualSpec, sanitizeHumanReportContent } from "../reportSanitizer.js";

const AGENT_TITLE = "质量分析 Agent";
const CORE_SKILL_NAME = "quality-analysis-core";
const DEFAULT_CORE_SKILL = { id: CORE_SKILL_NAME, name: CORE_SKILL_NAME, description: "质量分析共通证据与闭环规则", content: "只解释固定统计快照，区分事实、推断和待验证假设，并用结果—过程—根因—责任—行动形成闭环。" };
const REPORT_PRESENTATION_STORAGE_KEY = "qms-quality-agent-report-presentation-v1";
const MODULE_DEFAULT_SKILLS = {
  IQC: { id: "quality-analysis-iqc", name: "quality-analysis-iqc", description: "IQC来料质量分析", content: "按公司、基地/厂区和供应商分析来料质量。" },
  IPQC: { id: "quality-analysis-ipqc", name: "quality-analysis-ipqc", description: "IPQC过程质量分析", content: "按公司、基地、工坊和交付经理分析过程质量。" },
  OQC: { id: "quality-analysis-oqc", name: "quality-analysis-oqc", description: "OQC出货质量分析", content: "按公司、产品部、TPM和项目分析出货质量。" },
  DQA: { id: "quality-analysis-dqa", name: "quality-analysis-dqa", description: "DQA研发质量分析", content: "综合研发问题、设计评审、ECN和非BOM分析研发质量。" },
  QMS: { id: "quality-analysis-qms", name: "quality-analysis-qms", description: "QMS客户质量分析", content: "综合客户评分、低分率和客户意见分析客户质量。" },
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
const inlineReportMarkdown = (value) => escapeHtml(value)
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*([^*]+)\*/g, "<em>$1</em>");
const isMarkdownTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);
const isMarkdownTableSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const reportNumber = (value) => {
  const text = String(value || "").replace(/[,*_`，]/g, "").trim();
  if (!text || /(?:S|M|O|C|X)-(?:IQC|IPQC|OQC|DQA|QMS)-\d{3}/i.test(text)) return null;
  const matched = text.match(/[-+]?\d+(?:\.\d+)?/);
  if (!matched) return null;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const chartText = (value, limit = 12) => {
  const text = String(value || "未命名").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};
const niceChartMax = (value) => {
  const source = Math.max(1, Number(value) || 1);
  const magnitude = 10 ** Math.floor(Math.log10(source));
  const normalized = source / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
};
const renderComboChart = ({ title, subtitle, rows, barLabel, lineLabel, lineMin = 0, lineMax = 100, lineClass = "rate" }) => {
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
    return `<g><title>${escapeHtml(row.label)}：${barLabel} ${row.bar.toLocaleString("zh-CN")}；${lineLabel} ${row.line}%</title><rect x="${(center - barWidth / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, margin.top + plotHeight - y).toFixed(1)}" rx="5" class="combo-bar"/><text x="${center.toFixed(1)}" y="${Math.max(margin.top + 11, y - 7).toFixed(1)}" text-anchor="middle" class="combo-value">${escapeHtml(row.bar.toLocaleString("zh-CN"))}</text><text x="${center.toFixed(1)}" y="${margin.top + plotHeight + 20}" text-anchor="end" transform="rotate(-32 ${center.toFixed(1)} ${margin.top + plotHeight + 20})" class="combo-x-label">${label}</text></g>`;
  }).join("");
  const pointsMarkup = sourceRows.map((row, index) => {
    const x = margin.left + step * (index + .5);
    const y = lineY(row.line);
    return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" class="combo-line-point"/><text x="${x.toFixed(1)}" y="${Math.max(margin.top + 10, y - 10).toFixed(1)}" text-anchor="middle" class="combo-rate-value">${Number(row.line.toFixed(1))}%</text></g>`;
  }).join("");
  const eightyLine = rateMin < 80 && rateMax >= 80
    ? `<line x1="${margin.left}" y1="${lineY(80)}" x2="${width - margin.right}" y2="${lineY(80)}" class="combo-threshold"/><text x="${width - margin.right - 4}" y="${lineY(80) - 5}" text-anchor="end" class="combo-threshold-label">80%</text>`
    : "";
  return `<figure class="agent-report-auto-chart agent-report-combo-chart combo-${lineClass}" role="img" aria-label="${escapeHtml(title)}，柱形为${escapeHtml(barLabel)}，折线为${escapeHtml(lineLabel)}"><figcaption><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></figcaption><div class="agent-report-combo-legend"><span><i class="bar"></i>${escapeHtml(barLabel)}</span><span><i class="line"></i>${escapeHtml(lineLabel)}</span></div><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${leftTicks}${rightTicks}${eightyLine}<line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" class="combo-axis"/>${bars}<polyline points="${points}" class="combo-line"/>${pointsMarkup}</svg></figure>`;
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
  return `<figure class="agent-report-auto-chart agent-report-combo-chart combo-year-compare" role="img" aria-label="${escapeHtml(title)}，柱形为2025和2026检验批次，折线为2025和2026批次良率"><figcaption><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></figcaption><div class="agent-report-combo-legend"><span><i class="bar bar-2025"></i>2025检验批次</span><span><i class="bar bar-2026"></i>2026检验批次</span><span><i class="line line-2025"></i>2025良率</span><span><i class="line line-2026"></i>2026良率</span></div><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${leftTicks}${rightTicks}<line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" class="combo-axis"/>${bars}${seriesMarkup}</svg></figure>`;
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
const buildModulePeriodTrendFigure = ({ module, rows, title, badLabel = "不良数量", totalLabel = "总数量", sectionId = "趋势分析" }) => {
  const source = (rows || []).map((row) => {
    const label = String(row.label || row.month || row.period || "").trim();
    const bad = Number(row.bad);
    const total = Number(row.total);
    if (!label || !Number.isFinite(bad) || !Number.isFinite(total) || total <= 0) return null;
    return { label, bad: Math.max(0, bad), total: Math.max(0, total), rate: Number((Math.max(0, bad) / total * 100).toFixed(2)) };
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
      { name: "不良率", values: source.map((row) => row.rate), axis: "right", unit: "%" },
    ],
    coverage: "complete",
    sourceEvidenceIds: [],
    accessibilitySummary: `${title}使用两组柱形表示${badLabel}和${totalLabel}，折线表示不良率。`,
    tablePolicy: "replace",
  };
};

const buildModuleVisualSpec = (snapshot, module) => {
  const evidence = snapshot?.data?.evidence || {};
  const trends = Array.isArray(evidence.trends) ? evidence.trends : [];
  let rows = [];
  let title = "周期质量趋势";
  let badLabel = "不良数量";
  let totalLabel = "总数量";
  if (module === "IPQC") {
    rows = trends.map((row) => ({ label: row.month || row.period, bad: Number(row.y2026Bad), total: Number(row.y2026Qty) }));
    title = "送检量与异常密度趋势";
    badLabel = "异常数量";
    totalLabel = "送检数量";
  } else if (module === "IQC") {
    rows = trends.map((row) => ({ label: row.month || row.period, bad: Number(row.y2026Bad), total: Number(row.y2026Qty) }));
    title = "检验批次与不良批次趋势";
    badLabel = "不良批次";
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
    rows = trends.map((row) => ({ label: row.period || row.month, bad: Number(row.lowCount), total: Number(row.samples) }));
    title = "客户低分样本与有效样本趋势";
    badLabel = "低分样本";
    totalLabel = "有效样本";
  }
  const figure = buildModulePeriodTrendFigure({ module, rows, title, badLabel, totalLabel });
  return figure ? { version: "1.0", layoutProfile: DEFAULT_REPORT_PRESENTATION_PROFILE, reportKind: "module", subject: { scopeType: "company" }, figures: [figure], tableFallbacks: [], sourceLimitations: [] } : null;
};
const mergeModuleVisualSpec = (baseSpec, snapshot, module) => {
  const moduleSpec = buildModuleVisualSpec(snapshot, module);
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
  if (/(?:行动|措施|责任|期限|关闭|验证|根因|结论|风险判断|状态|交付物|待办)/i.test(sectionTitle)) return null;
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
  return `<figure class="agent-report-auto-chart series-count-${chart.series.length}" role="img" aria-label="${title}，共${displayedBody.length}个项目、${chart.series.length}组数值"><figcaption><strong>${displayTitle}</strong><span>图表优先展示 · 数值来自当前报告</span></figcaption>${legend}<div class="agent-report-chart-body">${rows}</div></figure>`;
};
const renderDualColumnLineChart = ({ title, subtitle, rows, barLabels = ["不良数量", "总数量"], lineLabel = "不良率" }) => {
  const sourceRows = (rows || []).filter((row) => Number.isFinite(row.bad) && Number.isFinite(row.total) && Number.isFinite(row.rate)).slice(0, 24);
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
    return `<g><title>${escapeHtml(row.label)}：${barLabels[0]} ${row.bad.toLocaleString("zh-CN")}；${barLabels[1]} ${row.total.toLocaleString("zh-CN")}；${lineLabel} ${row.rate}%</title><rect x="${xBad.toFixed(1)}" y="${badY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, margin.top + plotHeight - badY).toFixed(1)}" rx="4" class="combo-bar combo-bar-bad"/><rect x="${xTotal.toFixed(1)}" y="${totalY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, margin.top + plotHeight - totalY).toFixed(1)}" rx="4" class="combo-bar combo-bar-total"/><text x="${center.toFixed(1)}" y="${margin.top + plotHeight + 21}" text-anchor="end" transform="rotate(-32 ${center.toFixed(1)} ${margin.top + plotHeight + 21})" class="combo-x-label">${label}</text></g>`;
  }).join("");
  const pointsMarkup = sourceRows.map((row, index) => { const x = margin.left + step * (index + .5); const y = lineY(row.rate); return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" class="combo-line-point"/><text x="${x.toFixed(1)}" y="${Math.max(margin.top + 10, y - 10).toFixed(1)}" text-anchor="middle" class="combo-rate-value">${row.rate}%</text></g>`; }).join("");
  return `<figure class="agent-report-auto-chart agent-report-combo-chart combo-period-trend" role="img" aria-label="${escapeHtml(title)}，两组柱形为${escapeHtml(barLabels.join("和"))}，折线为${escapeHtml(lineLabel)}"><figcaption><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></figcaption><div class="agent-report-combo-legend"><span><i class="bar bar-bad"></i>${escapeHtml(barLabels[0])}</span><span><i class="bar bar-total"></i>${escapeHtml(barLabels[1])}</span><span><i class="line"></i>${escapeHtml(lineLabel)}</span></div><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${grid}${rightTicks}<line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" class="combo-axis"/>${bars}<polyline points="${points}" class="combo-line"/>${pointsMarkup}</svg></figure>`;
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
  if (sectionId && title.replace(/[.)、]/g, "").includes(sectionId)) return true;
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
const renderVisualSpecFigure = (figure) => {
  const categories = Array.isArray(figure.categories) ? figure.categories : [];
  const series = Array.isArray(figure.series) ? figure.series : [];
  const intent = String(figure.intent || figure.preferredChart || "comparison").toLowerCase();
  const title = String(figure.title || "数据图表");
  if (!categories.length && !Array.isArray(figure.data)) return `<figure class="agent-report-auto-chart agent-report-visual-empty"><figcaption><strong>${escapeHtml(title)}</strong><span>数据覆盖：${escapeHtml(figure.coverage || figure.status || "partial")}</span></figcaption><p>${escapeHtml(figure.data?.note || figure.accessibilitySummary || "当前缺少完整可视化分母，保留为待补数据，不生成误导性图表。")}</p></figure>`;
  const makeRows = (barIndex = 0, lineIndex = 1) => categories.map((label, index) => ({ label: String(label), bar: Number(series[barIndex]?.values?.[index]), line: Number(series[lineIndex]?.values?.[index]) })).filter((row) => Number.isFinite(row.bar) && Number.isFinite(row.line));
  if (intent.includes("pareto") || String(figure.preferredChart).includes("pareto")) return renderComboChart({ title, subtitle: `${figure.unit || "数量"}柱形 + 累计占比折线`, rows: makeRows(0, 1), barLabel: series[0]?.name || "数量", lineLabel: series[1]?.name || "累计占比", lineMin: 0, lineMax: 100, lineClass: "pareto" });
  if (intent.includes("period-trend") || intent.includes("dual-column-line") || String(figure.preferredChart).includes("dual-column-line")) {
    const rows = categories.map((label, index) => ({ label: String(label), bad: Number(series[0]?.values?.[index]), total: Number(series[1]?.values?.[index]), rate: Number(series[2]?.values?.[index]) })).filter((row) => [row.bad, row.total, row.rate].every(Number.isFinite));
    return renderDualColumnLineChart({ title, subtitle: "柱形表示不良数量与总数量，折线表示不良率", rows, barLabels: [series[0]?.name || "不良数量", series[1]?.name || "总数量"], lineLabel: series[2]?.name || "不良率" });
  }
  if (intent.includes("trend") || String(figure.preferredChart).includes("column-line")) return renderComboChart({ title, subtitle: `${series[0]?.name || "数量"}柱形 + ${series[1]?.name || "比率"}折线`, rows: makeRows(0, 1), barLabel: series[0]?.name || "数量", lineLabel: series[1]?.name || "比率", lineMin: 0, lineMax: 100, lineClass: "yield" });
  if (intent.includes("relationship") || intent.includes("heatmap") || String(figure.preferredChart).includes("heatmap")) {
    const rows = Array.isArray(figure.data) ? figure.data : categories.map((label, index) => ({ name: label, value: Number(series[0]?.values?.[index]) || 0 }));
    const max = Math.max(1, ...rows.map((row) => Number(row.value) || 0));
    return `<figure class="agent-report-auto-chart agent-report-visual-heatmap"><figcaption><strong>${escapeHtml(title)}</strong><span>颜色深浅表示问题集中度</span></figcaption><div class="agent-report-heatmap-grid">${rows.map((row) => `<div class="agent-report-heat-cell" style="--heat:${Math.max(.08, (Number(row.value) || 0) / max)}"><b>${escapeHtml(row.organization || row.name || row.category || "未命名")} × ${escapeHtml(row.mechanism || "")}</b><strong>${(Number(row.value) || 0).toLocaleString("zh-CN")}</strong></div>`).join("")}</div></figure>`;
  }
  const rows = categories.map((label, index) => {
    const category = label && typeof label === "object" ? label : { name: label };
    return { label: String(category.name || category.label || "未命名"), focus: Boolean(category.focus), site: String(category.site || ""), values: series.map((item) => Number(item?.values?.[index]) || 0) };
  });
  const max = Math.max(1, ...rows.flatMap((row) => row.values));
  const ranking = intent.includes("ranking") || String(figure.preferredChart).includes("horizontal");
  return `<figure class="agent-report-auto-chart agent-report-visual-bars ${ranking ? "agent-report-visual-ranking" : ""}"><figcaption><strong>${escapeHtml(title)}</strong><span>图表优先展示 · ${escapeHtml(figure.unit || "")}</span></figcaption><div class="agent-report-visual-legend">${series.map((item, index) => `<span><i class="series-${index + 1}"></i>${escapeHtml(item.name || `指标${index + 1}`)}</span>`).join("")}</div><div class="agent-report-visual-bars-body">${rows.map((row) => `<div class="agent-report-visual-bar-row ${row.focus ? "is-focus" : ""}"><b>${row.focus ? "★ " : ""}${escapeHtml(chartText(row.label, 22))}</b><div>${row.values.map((value, index) => `<i class="series-${index + 1}" style="width:${Math.max(2, value / max * 100).toFixed(2)}%"><span>${value.toLocaleString("zh-CN")}</span></i>`).join("")}</div></div>`).join("")}</div></figure>`;
};
const renderMarkdownTable = (lines, { chartFirst = false, sectionTitle = "", suppressIqcYieldTable = false } = {}) => {
  const rows = lines.map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  if (!rows.length) return "";
  const hasSeparator = rows.length > 1 && isMarkdownTableSeparator(lines[1]);
  const header = rows[0];
  const body = hasSeparator ? rows.slice(2) : rows.slice(1);
  if (suppressIqcYieldTable && /(?:物料类别.*良率|月度趋势)/i.test(`${sectionTitle} ${header.join(" ")}`)) return "";
  const chart = chartFirst ? chartableReportTable(header, body, sectionTitle) : null;
  if (chart) return renderReportChart(header, body, sectionTitle, chart);
  return `<div class="${tableToneClass(sectionTitle)}"><table class="agent-report-table"><thead><tr>${header.map((cell) => `<th scope="col">${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${header.map((_, index) => `<td>${escapeHtml(row[index] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
};
const reportPublisherChrome = (content, fragment, profileId, module = "质量分析") => {
  const source = sanitizeHumanReportContent(content);
  const title = source.match(/^#\s+(.+)$/m)?.[1]?.trim() || `${module} 质量分析报告`;
  const headings = [...source.matchAll(/^#{2,3}\s+(.+)$/gm)].map((match) => match[1].trim()).filter(Boolean).slice(0, 12);
  const metricItems = source.split(/\r?\n/).map((line) => metricLine(line.trim())).filter(Boolean).slice(0, 4);
  const toc = headings.length ? `<nav class="report-publisher-toc"><p>REPORT SECTIONS</p>${headings.map((heading, index) => `<a href="#report-section-${index + 1}">${escapeHtml(heading.replace(/^\d+[.)、]\s*/, ""))}</a>`).join("")}</nav>` : "";
  const quick = metricItems.length ? `<section class="report-publisher-quick"><div class="report-publisher-quick-grid">${metricItems.map((item) => `<div class="report-publisher-quick-item"><b>${inlineReportMarkdown(item.value)}</b><p>${inlineReportMarkdown(item.label)}</p></div>`).join("")}</div></section>` : "";
  const sectionedFragment = String(fragment || "").replace(/<section class="agent-report-section/g, (match, offset, whole) => {
    const before = whole.slice(0, offset);
    const sectionNumber = (before.match(/report-section-/g) || []).length + 1;
    return `<section id="report-section-${sectionNumber}" class="agent-report-section`;
  });
  return `<div class="report-publisher report-publisher-${escapeHtml(profileId || "research-briefing-v1")}"><div class="report-publisher-masthead"></div><header class="report-publisher-header"><strong>QUALITY <span>INTELLIGENCE</span></strong><small>${escapeHtml(reportLayoutLabel(profileId))}</small></header><section class="report-publisher-hero"><div><span class="report-publisher-eyebrow">QUALITY ANALYSIS AGENT / ${escapeHtml(module)}</span><h1>${inlineReportMarkdown(escapeHtml(title))}</h1><p>固定统计结果、证据卡和改善行动的管理复盘。</p></div></section>${quick}<div class="report-publisher-layout">${toc}<article class="report-publisher-article">${sectionedFragment}</article></div><footer class="report-publisher-footer">${escapeHtml(module)} · Agent 正式报告</footer></div>`;
};
export const renderAgentMarkdown = (content, { chartFirst = false, snapshot = null, includeSnapshotCharts = false, publisher = false, profileId = DEFAULT_REPORT_PRESENTATION_PROFILE, module = "质量分析", visualSpec = null } = {}) => {
  // The visual contract is machine-readable metadata, never report prose.
  const visualFigures = visualFigureList(visualSpec || extractReportVisualSpec(content || ""));
  const reportText = sanitizeHumanReportContent(content || "暂无报告");
  const lines = reportText.split(/\r?\n/);
  const output = [];
  const snapshotCharts = includeSnapshotCharts ? renderIqcSnapshotCharts(snapshot) : {};
  const insertedSnapshotCharts = new Set();
  const insertedVisualFigures = new Set();
  const metricBuffer = [];
  let sectionTitle = "";
  let sectionOpen = false;
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
    output.push(`<section class="${sectionClass(title)}"><${tag} class="${headingClass(title)}">${inlineReportMarkdown(title)}</${tag}>`);
    sectionOpen = true;
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
      const markup = renderVisualSpecFigure(figure);
      if (markup) {
        output.push(`<div class="agent-report-inline-chart" data-figure-id="${escapeHtml(figure.__key)}">${markup}</div>`);
        insertedVisualFigures.add(figure.__key);
      }
    });
  };
  let skippedDocumentTitle = false;
  for (let index = 0; index < lines.length; index += 1) {
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
      if (!replacingFigure) output.push(renderMarkdownTable(tableLines, { chartFirst, sectionTitle, suppressIqcYieldTable: suppressSnapshotTable }));
      index -= 1;
      continue;
    }
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
    output.push(`<section class="agent-report-section agent-report-visual-appendix"><h4 class="agent-report-section-heading">图表附录</h4>${remainingFigures.map((figure) => { insertedVisualFigures.add(figure.__key); return `<div class="agent-report-inline-chart" data-figure-id="${escapeHtml(figure.__key)}">${renderVisualSpecFigure(figure)}</div>`; }).join("")}</section>`);
  }
  const fragment = output.join("");
  return publisher ? reportPublisherChrome(reportText, fragment, profileId, module) : fragment;
};

export function QualityAgentPage({ data, files = [], dateRange, module = "DQA", onEnsureAgentSources, canStart = false, canSaveToServer = false, creatorIp = "" }) {
  const initialSkill = MODULE_DEFAULT_SKILLS[module] || MODULE_DEFAULT_SKILLS.DQA;
  const [skillName, setSkillName] = useState(initialSkill.name);
  const [skillContent, setSkillContent] = useState(initialSkill.content);
  const [coreSkillContent, setCoreSkillContent] = useState(DEFAULT_CORE_SKILL.content);
  const [skills, setSkills] = useState([initialSkill]);
  const [layoutSkills] = useState(REPORT_PRESENTATION_PROFILES);
  const [layoutSkillName, setLayoutSkillName] = useState(initialReportLayout);
  const [runs, setRuns] = useState(() => loadQualityAgentRuns());
  const [serverRunsReady, setServerRunsReady] = useState(() => !canSaveToServer);
  const [stageOpen, setStageOpen] = useState({});
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [closureEvidence, setClosureEvidence] = useState({});
  const [savedReports, setSavedReports] = useState([]);
  const [selectedReportName, setSelectedReportName] = useState("");
  const [selectedReportContent, setSelectedReportContent] = useState("");
  const [selectedReportState, setSelectedReportState] = useState({ status: "idle", message: "" });
  const [importedReports, setImportedReports] = useState(() => readImportedReports()[module] || []);
  const [selectedImportedId, setSelectedImportedId] = useState("");
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
  const sourceReady = useMemo(() => agentFiles.some((source) => source.module === module && Array.isArray(source.rows) && source.rows.length), [agentFiles, module]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  useEffect(() => { loadCurrentUser().then((user) => setResolvedCreatorIp(String(user?.ip || ""))).catch(() => {}); }, []);
  useEffect(() => {
    let active = true;
    loadQualityAgentSnapshotRegistry().then((value) => {
      if (active) setSnapshotRegistry(normalizeQualitySnapshotRegistry(value || null));
    }).catch(() => {}).finally(() => {});
    return () => { active = false; };
  }, []);
  const [period, setPeriod] = useState(() => ({ ...dateRange }));
  useEffect(() => {
    setPeriod((current) => current.start2026 === dateRange.start2026 && current.end2026 === dateRange.end2026
      ? current
      : { ...current, ...dateRange });
  }, [dateRange.start2026, dateRange.end2026, dateRange.start2025, dateRange.end2025]);
  useEffect(() => {
    setAgentFiles((current) => {
      const byKey = new Map();
      [...files.filter((source) => source.module === module), ...current.filter((source) => source.module === module)].forEach((source) => {
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
    let active = true;
    if (!onEnsureAgentSources || !canStart) {
      setSourceState({ status: "ready", message: canStart ? "Agent 数据已就绪" : "当前账号仅读取已保存报告" });
      return undefined;
    }
    setSourceState({ status: "loading", message: "正在按模块加载 Agent 原始数据" });
    onEnsureAgentSources([module], (progress) => {
      if (active && progress?.label) setSourceState({ status: "loading", message: progress.label });
    }).then((next) => {
      if (!active) return;
      const byKey = new Map();
      [...files.filter((source) => source.module === module), ...(next || []).filter((source) => source.module === module)].forEach((source) => {
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
  const snapshot = useMemo(() => buildQualityAgentSnapshot({ data, files: agentFiles, dateRange: period, module }), [data, agentFiles, period, module]);
  const sourceSignature = useMemo(() => createSourcesSignature(agentFiles.filter((source) => source.module === module)), [agentFiles, module]);
  const matchedSnapshotEntry = useMemo(() => snapshotRegistry ? pickLatestQualitySnapshot(snapshotRegistry, { module, dateRange: period, sourceSignature, skillName, layoutProfileId: layoutSkillName }) : null, [snapshotRegistry, module, period, sourceSignature, skillName, layoutSkillName]);
  const combinedSkillContent = useMemo(() => `模块 Skill：${skillName}\n${skillContent}\n\n核心 Skill：${CORE_SKILL_NAME}\n${coreSkillContent}`, [skillName, skillContent, coreSkillContent]);
  const record = runs[module] || {};
  const displaySnapshot = record.snapshot || matchedSnapshotEntry?.snapshot || snapshot;
  const moduleVisualSpec = useMemo(() => {
    const embedded = record.visualSpec || extractReportVisualSpec(record.content || "");
    return mergeModuleVisualSpec(embedded, displaySnapshot, module);
  }, [record.visualSpec, record.content, displaySnapshot, module]);
  const activeReportLayoutClass = reportLayoutClass(layoutSkillName);
  const finalReportHtml = useMemo(() => record.content
    ? renderAgentMarkdown(record.content, { chartFirst: true, snapshot: displaySnapshot, includeSnapshotCharts: module === "IQC", publisher: true, profileId: layoutSkillName, module, visualSpec: moduleVisualSpec })
    : "", [record.content, displaySnapshot, module, layoutSkillName, moduleVisualSpec]);
  // Presentation profiles are deterministic browser rendering. Switching one
  // must never invalidate the completed analysis or trigger another AI call.
  const reportLayoutChanged = false;
  const auditSummary = useMemo(() => {
    try { return JSON.parse(record.stages?.audit?.content || "{}"); } catch { return {}; }
  }, [record.stages?.audit?.content]);
  const auditDetail = [...(auditSummary.blockers || []), ...(auditSummary.materialIssues || []), ...(auditSummary.warnings || [])].join("；");
  const snapshotTrace = matchedSnapshotEntry
    ? { status: "matched", label: "已命中有效快照", detail: `${matchedSnapshotEntry.moduleLabel || module} · ${matchedSnapshotEntry.skillName || skillName} · ${matchedSnapshotEntry.layoutProfileId || layoutSkillName}`, meta: `生成于 ${new Date(matchedSnapshotEntry.generatedAt).toLocaleString("zh-CN")} · 来源版本已匹配` }
    : snapshotRegistry
      ? { status: "missing", label: "未命中有效快照", detail: "当前周期、来源版本、Skill 或 Profile 没有完全匹配的有效快照", meta: "本次分析将使用当前确定性统计结果；请管理员检查后台快照" }
      : { status: "loading", label: "正在读取快照注册表", detail: "尚未完成快照匹配", meta: "" };
  const workflowProgress = record.progress || { percent: record.status === "done" ? 100 : 0, phase: record.status === "running" ? "正在准备分析" : "等待启动", detail: record.status === "done" ? "报告已生成，可直接查看或保存" : "点击“启动 Agent 分析”后开始" };
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
  const selectedImportedReport = importedReports.find((item) => item.id === selectedImportedId) || null;

  useEffect(() => {
    const reports = readImportedReports()[module] || [];
    setImportedReports(Array.isArray(reports) ? reports : []);
    setSelectedImportedId("");
    setShowImportedReport(false);
  }, [module]);

  useEffect(() => {
    if (!importedReports.length) {
      setSelectedImportedId("");
      setShowImportedReport(false);
      return;
    }
    if (!importedReports.some((item) => item.id === selectedImportedId)) {
      setSelectedImportedId(importedReports[0].id);
    }
  }, [importedReports, selectedImportedId]);

  useEffect(() => {
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
    if (selectedReportName && !moduleReports.some((item) => item.fileName === selectedReportName)) setSelectedReportName("");
  }, [moduleReports, selectedReportName]);

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
  useEffect(() => {
    loadAgentSkills().then((value) => {
      const next = Array.isArray(value?.skills)
        ? value.skills.filter((item) => !String(item.id || item.name || "").startsWith("quality-role-"))
        : [];
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
      const selected = available.find((item) => (item.name || item.id) === defaultSkill.name) || available[0];
      if (selected) { setSkillName(selected.name); setSkillContent(selected.content || ""); }
    }).catch(() => {
      const fallback = MODULE_DEFAULT_SKILLS[module] || MODULE_DEFAULT_SKILLS.DQA;
      setSkills([fallback]);
      setSkillName(fallback.name);
      setSkillContent(fallback.content);
      setCoreSkillContent(DEFAULT_CORE_SKILL.content);
    });
    refreshReports();
  }, [module]);

  const start = async ({ force = false } = {}) => {
    if (!canStart) {
      setError("当前账号没有“启动 Agent 分析”权限，请联系主管理员");
      return;
    }
    if (force && !window.confirm("确定重复分析当前模块吗？系统将重新调用大模型，并覆盖当前运行缓存；已保存到项目的历史报告不会删除。")) return;
    setSelectedReportName("");
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
      const canUseStoredSnapshot = Boolean(matchedSnapshotEntry?.snapshot)
        && !auditFailed
        && (!sourceReady || !sourceSignature || !matchedSnapshotEntry.sourceSignature || matchedSnapshotEntry.sourceSignature === sourceSignature);
      let snapshotForRun = canUseStoredSnapshot
        ? matchedSnapshotEntry.snapshot
        : (sourceReady ? snapshot : (record.snapshot || snapshot));
      if ((!sourceReady || auditFailed) && !canUseStoredSnapshot && onEnsureAgentSources) {
        setSourceState({ status: "loading", message: "正在重新加载当前模块原始数据" });
        const nextSources = await onEnsureAgentSources([module], (progress) => {
          if (progress?.label) setSourceState({ status: "loading", message: progress.label });
        });
        throwIfStopped();
        const byKey = new Map();
        [...files.filter((source) => source.module === module), ...(nextSources || []).filter((source) => source.module === module)].forEach((source) => {
          const key = `${source.module}::${source.name}`;
          const previous = byKey.get(key);
          const previousRows = Array.isArray(previous?.rows) ? previous.rows.length : 0;
          const nextRows = Array.isArray(source.rows) ? source.rows.length : 0;
          if (!previous || nextRows >= previousRows) byKey.set(key, source);
        });
        const refreshedFiles = [...byKey.values()];
        setAgentFiles(refreshedFiles);
        snapshotForRun = buildQualityAgentSnapshot({ data, files: refreshedFiles, dateRange: period, module });
        setSourceState({ status: "ready", message: "原始数据已重新加载，正在继续 Agent 分析" });
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
      const next = await runQualityAgent({ snapshot: snapshotForRun, skillName, skillContent: combinedSkillContent, layoutProfileId: layoutSkillName, existing, requestChat: (messages, options = {}) => requestAiChat(messages, { ...options, operation: "quality-agent-start" }), signal: controller.signal, onUpdate: update });
      if (next.status === "error") setError(`${next.currentStage || "Agent分析"}：${next.error}`);
      else {
        // Keep the deterministic aggregate snapshot for rendering, but release raw Excel rows.
        update({ ...next, visualSpec: mergeModuleVisualSpec(next.visualSpec || extractReportVisualSpec(next.content || ""), snapshotForRun, module) });
        setAgentFiles((current) => current
          .filter((source) => source.module === module)
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
    const message = controller
      ? "正在停止本次 Agent 分析；已完成阶段将保留。"
      : "已停止页面中的中断状态；已完成阶段将保留。";
    setError(message);
    setSourceState((current) => ({ ...current, status: "ready", message }));
    setRuns((current) => {
      const active = current[module] || {};
      if (active.status !== "running") return current;
      const stageId = active.currentStage || "audit";
      return {
        ...current,
        [module]: {
          ...active,
          status: "error",
          error: "已停止本次 Agent 分析，已完成阶段保留，可继续。",
          stages: {
            ...(active.stages || {}),
            [stageId]: {
              ...(active.stages?.[stageId] || {}),
              status: "error",
              error: "已停止本次 Agent 分析，已完成阶段保留，可继续。",
            },
          },
          progress: {
            ...(active.progress || {}),
            phase: "正在停止",
            detail: message,
          },
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

  const saveReportContent = async (content, source = {}) => {
    if (!content) return;
    setSaveState({ status: "saving", message: "正在保存导出内容到项目报告库…" });
    try {
      const saved = canSaveToServer
        ? await saveAgentReportFile({ module: source.module || module, skillName: source.skillName || skillName, layoutProfileId: source.layoutProfileId || layoutSkillName, period: source.period || snapshot.period || period, model: source.model || "", creatorIp: source.creatorIp || creatorIp || resolvedCreatorIp, content, visualSpec: mergeModuleVisualSpec(source.visualSpec || extractReportVisualSpec(content), source.snapshot || displaySnapshot, source.module || module) })
        : await saveLocalAgentReport({ module: source.module || module, skillName: source.skillName || skillName, layoutProfileId: source.layoutProfileId || layoutSkillName, layoutSkillName: source.layoutSkillName || source.layoutProfileId || layoutSkillName, period: source.period || snapshot.period || period, model: source.model || "", creatorIp: source.creatorIp || creatorIp || resolvedCreatorIp, content, visualSpec: mergeModuleVisualSpec(source.visualSpec || extractReportVisualSpec(content), source.snapshot || displaySnapshot, source.module || module) });
      const entry = { ...saved, module: saved.module || module, localOnly: saved.localOnly === true || !canSaveToServer };
      await refreshReports().catch(() => {});
      // Always merge the save response into the current list. This covers
      // IndexedDB/local-only saves and PostgreSQL responses that arrive before
      // the report-list refresh is visible to the browser.
      setSavedReports((current) => [entry, ...current.filter((item) => item.fileName !== entry.fileName)]);
      setSelectedReportName(entry.fileName);
      setSelectedReportContent(String(saved.content || content || ""));
      setSelectedReportState({ status: "loaded", message: "" });
      setSaveState({ status: "saved", message: canSaveToServer ? `已保存到服务器：${saved.relativePath || saved.fileName}` : `已保存到本机：${saved.fileName}` });
    } catch (saveError) {
      setSaveState({ status: "error", message: `保存失败：${saveError.message}` });
    }
  };

  const printReport = (reportRef) => {
    try {
      const root = reportRef?.current;
      printAgentReport(root?.querySelector(".report-publisher") || root);
    } catch (printError) {
      setSaveState({ status: "error", message: `打印失败：${printError.message}` });
    }
  };

  const prepareReportPdf = async (reportRef, source = {}, signature = "") => {
    if (!reportRef?.current) { setPdfDownload({ signature, status: "error", blob: null, fileName: "", message: "当前没有可下载的报告内容" }); return; }
    const pdfFileName = reportFileName({ ...source, module: source.module || module }, "pdf");
    setPdfDownload({ signature, status: "preparing", blob: null, fileName: pdfFileName, message: "正在生成 PDF…" });
    try {
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      if (document.fonts?.ready) await document.fonts.ready;
      // The preparing state can redraw dangerouslySetInnerHTML and replace the
      // publisher node. Reacquire it after React has committed that redraw.
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      const reportNode = reportRef.current?.querySelector(".report-publisher") || reportRef.current;
      if (!reportNode?.isConnected) throw new Error("报告页面尚未稳定，请重新生成 PDF");
      const canvas = await html2canvas(reportNode, { scale: 1.5, useCORS: true, backgroundColor: "#ffffff", logging: false, windowWidth: Math.max(1000, reportNode.scrollWidth) });
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pageHeightPx = Math.max(1, Math.floor(canvas.width * pageHeight / pageWidth));
      const reportRect = reportNode.getBoundingClientRect();
      const canvasScaleY = canvas.height / Math.max(1, reportNode.scrollHeight);
      const breakSelectors = [
        ".report-publisher-masthead",
        ".report-publisher-header",
        ".report-publisher-hero",
        ".report-publisher-quick",
        ".report-publisher-layout",
        ".report-publisher-article > *",
        ".agent-report-section > *",
        ".agent-report-section-heading",
        "h1", "h2", "h3", "h4", "h5",
        "p",
        ".agent-report-bullet",
        ".agent-report-numbered",
        ".agent-report-callout",
        ".agent-report-auto-chart",
        ".agent-report-table-wrap",
        "figure",
      ].join(",");
      const breakBlocks = Array.from(reportNode.querySelectorAll(breakSelectors))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const top = Math.round((rect.top - reportRect.top) * canvasScaleY);
          const bottom = Math.round((rect.bottom - reportRect.top) * canvasScaleY);
          return { top, bottom };
        })
        .filter(({ top, bottom }) => Number.isFinite(top) && Number.isFinite(bottom) && top > 0 && top < canvas.height)
        .sort((a, b) => a.top - b.top || a.bottom - b.bottom);
      const candidateBreaks = breakBlocks
        .flatMap(({ top, bottom }) => {
          // A block taller than one page must be allowed to split internally.
          // Its bottom remains useful as a clean boundary for the next page.
          return bottom - top > pageHeightPx ? [top, bottom] : [top];
        })
        .filter((value) => value > 0 && value < canvas.height)
        .sort((a, b) => a - b)
        .filter((value, index, values) => index === 0 || value - values[index - 1] > 3);
      let offset = 0;
      let page = 0;
      while (offset < canvas.height) {
        const target = Math.min(canvas.height, offset + pageHeightPx);
        // Keep enough content on each page, but prefer a clean block boundary
        // over a fuller page when a heading or paragraph is about to be cut.
        const minimumUsefulPage = offset + Math.round(pageHeightPx * 0.35);
        const containingBlock = breakBlocks
          .filter(({ top, bottom }) => top > offset + 40 && top < target - 2 && bottom > target && bottom - top <= pageHeightPx * 1.1)
          .sort((a, b) => a.top - b.top)[0];
        const latestBoundary = candidateBreaks.findLast((value) => value >= minimumUsefulPage && value <= target - 8);
        const nextOffset = target >= canvas.height
          ? canvas.height
          : Math.max(offset + 1, containingBlock?.top || latestBoundary || target);
        const sliceHeight = nextOffset - offset;
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceHeight;
        slice.getContext("2d")?.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidth, sliceHeight * pageWidth / canvas.width, undefined, "FAST");
        offset = nextOffset;
        page += 1;
      }
      const pdfBuffer = pdf.output("arraybuffer");
      const pdfBytes = new Uint8Array(pdfBuffer);
      if (!pdfBytes.byteLength) throw new Error("PDF 字节流为空");
      const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
      if (!pdfBlob.size) throw new Error("PDF 文件为空");
      setPdfDownload({ signature, status: "ready", blob: pdfBlob, fileName: pdfFileName, message: `PDF 已生成（${Math.max(1, Math.round(pdfBlob.size / 1024)).toLocaleString("zh-CN")} KB），点击保存` });
    } catch (pdfError) {
      setPdfDownload({ signature, status: "error", blob: null, fileName: pdfFileName, message: `PDF 生成失败：${pdfError.message || pdfError}` });
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

  const renderReportActions = ({ id, content, source = {}, reportRef }) => {
    if (!content) return null;
    const open = downloadTarget === id;
    const pdfSignature = `${id}:${layoutSkillName}:${source.updatedAt || source.importedAt || source.generatedAt || "current"}:${content.length}:${content.slice(-32)}`;
    const activePdf = pdfDownload.signature === pdfSignature ? pdfDownload : { status: "idle", message: "" };
    const toggleDownload = () => {
      if (open) { setDownloadTarget(""); return; }
      setDownloadTarget(id);
      if (activePdf.status !== "ready" && activePdf.status !== "preparing") prepareReportPdf(reportRef, source, pdfSignature);
    };
    const handlePdfAction = () => {
      if (activePdf.status === "ready") savePreparedPdf();
      else if (activePdf.status !== "preparing") prepareReportPdf(reportRef, source, pdfSignature);
    };
    return <div className="report-action-toolbar" aria-label="报告操作">
      <button type="button" className="report-action-button" title="调用系统分享，可选择企业微信、微信或钉钉" onClick={() => shareReport(content, source)}><ShareNetwork size={18}/><span>Share</span></button>
      <button type="button" className="report-action-button" title="打印当前网页报告" onClick={() => printReport(reportRef)}><Printer size={18}/><span>Print</span></button>
      <div className="report-action-download"><button type="button" className="report-action-button" title="下载报告" aria-expanded={open} onClick={toggleDownload}><DownloadSimple size={18}/><span>Download</span></button>{open && <div className="report-action-menu" role="menu"><button type="button" role="menuitem" disabled={activePdf.status === "preparing"} onClick={handlePdfAction}><FilePdf size={16}/><span>{activePdf.status === "preparing" ? "正在生成 PDF…" : activePdf.status === "ready" ? "保存 PDF" : activePdf.status === "error" ? "重新生成 PDF" : "生成 PDF"}</span><small>{activePdf.message || "生成完成后弹出系统保存窗口"}</small></button><button type="button" role="menuitem" onClick={() => { setDownloadTarget(""); downloadReportMarkdown(content, source); }}><DownloadSimple size={16}/><span>MD 文档</span></button></div>}</div>
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
      <label>模块分析 Skill<select value={skillName} onChange={(event) => { const selected = skills.find((item) => item.name === event.target.value); setSkillName(event.target.value); setSkillContent(selected?.content || ""); }}>{skills.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select><small>自动叠加 {CORE_SKILL_NAME}</small></label>
      <label>网页呈现风格<select value={layoutSkillName} onChange={(event) => setLayoutSkillName(normalizeReportPresentationProfile(event.target.value))}>{layoutSkills.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>{reportLayoutLabel(layoutSkillName)} · 切换后立即重绘当前、历史和导入报告，不重新调用大模型</small></label>
      <label>统计开始<input type="date" value={period.start2026 || ""} onChange={(event) => setPeriod((current) => ({ ...current, start2026: event.target.value }))}/></label>
      <label>统计结束<input type="date" value={period.end2026 || ""} onChange={(event) => setPeriod((current) => ({ ...current, end2026: event.target.value }))}/></label>
      <span>分析模块：{module} · 当前周期：{period.start2026}—{period.end2026}{sourceState.message ? ` · ${sourceState.message}` : ""}{auditSummary.grade && <em className={`quality-agent-audit-grade grade-${String(auditSummary.grade).toLowerCase()}`} title={auditDetail || "数据审计通过"}>数据可信度 {auditSummary.grade}</em>}</span>
      <div className={`quality-agent-snapshot-trace ${snapshotTrace.status}`}><b>{snapshotTrace.label}</b><span>{snapshotTrace.detail}</span><small>{snapshotTrace.meta}</small></div>
      <div className="quality-agent-report-toolbar">
        <label>项目报告<select value={selectedReportName} onChange={(event) => setSelectedReportName(event.target.value)} disabled={!moduleReports.length}><option value="">{moduleReports.length ? "请选择已保存报告" : "暂无已保存报告"}</option>{moduleReports.map((item) => <option key={item.fileName} value={item.fileName}>{item.fileName} · {new Date(item.updatedAt).toLocaleString("zh-CN")}</option>)}</select></label>
        <button className="qmdp-secondary-btn" onClick={refreshReports}><ArrowsClockwise size={15}/>刷新报告库</button>
        {selectedReportName && <button className="qmdp-danger-btn" onClick={() => removeSavedReport(selectedReportName)}><Trash size={14}/>删除所选报告</button>}
        <input ref={importInputRef} type="file" accept=".docx,.md,.markdown,.txt,.json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain,application/json" onChange={importReport} hidden/>
        <button className="qmdp-secondary-btn" onClick={() => importInputRef.current?.click()}><FileArrowUp size={15}/>导入 Agent 报告</button>
        <label>外部报告<select value={selectedImportedId} onChange={(event) => { setSelectedImportedId(event.target.value); setShowImportedReport(Boolean(event.target.value)); }} disabled={!importedReports.length}><option value="">暂无导入报告</option>{importedReports.map((item) => <option key={item.id} value={item.id}>{item.fileName} · {new Date(item.importedAt).toLocaleString("zh-CN")}</option>)}</select></label>
        {selectedImportedReport && <button className="qmdp-secondary-btn" onClick={() => setShowImportedReport((current) => !current)}><span>{showImportedReport ? <EyeSlash size={15}/> : <Eye size={15}/>}</span>{showImportedReport ? "取消显示外部报告" : "显示外部报告"}</button>}
      </div>
      {record.status === "running" ? <button className="qmdp-danger-btn" onClick={stop}><WarningCircle size={16}/>停止 Agent分析</button> : <div className="quality-agent-analysis-actions">{record.status === "done" && record.content && <button className="qmdp-secondary-btn" onClick={() => start({ force: true })} disabled={!canStart} title="重新调用大模型，覆盖当前运行缓存"><ArrowsClockwise size={16}/>重复分析</button>}<button className="qmdp-primary-btn" onClick={start} disabled={!canStart} title={!canStart ? "仅主管理员可以启动 Agent 分析" : "启动 Agent 分析"}><Brain size={16}/>{record.status === "error" ? "继续 Agent分析" : "启动 Agent分析"}</button></div>}
    </section>
    <section className="quality-agent-collapsible-workflow">{QUALITY_AGENT_STAGES.filter((stage) => stage.id !== "audit").map((stage) => { const item = record.stages?.[stage.id] || {}; const open = Boolean(stageOpen[stage.id]); return <article className={`qmdp-card quality-agent-stage ${item.status || "pending"}`} key={stage.id}><header><button type="button" className="quality-agent-stage-toggle" onClick={() => setStageOpen((current) => ({ ...current, [stage.id]: !current[stage.id] }))}><span>{item.status === "done" ? <CheckCircle size={18} weight="fill"/> : item.status === "error" ? <WarningCircle size={18} weight="fill"/> : item.status === "running" ? <ArrowsClockwise size={18} className="spin"/> : stage.id === "analysis" ? "1" : stage.id === "actions" ? "2" : "3"}</span><strong>{stage.label}</strong>{open ? <CaretDown size={16}/> : <CaretRight size={16}/>}</button><small>{item.status === "done" ? "已完成" : item.status === "error" ? "失败，可继续" : item.status === "running" ? "执行中" : "等待执行"}</small></header>{open && item.content && <div className="quality-agent-stage-content" dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(item.content) }}/>} {open && item.error && <p className="quality-agent-error">{item.error}</p>}</article>; })}</section>
    {record.actionLedger && <section className={`qmdp-card quality-agent-action-ledger ${record.actionLedger.status || "warning"}`}><header><button type="button" className="quality-agent-stage-toggle" onClick={() => setLedgerOpen((current) => !current)}><span>{record.actionLedger.status === "ready" ? <CheckCircle size={18} weight="fill"/> : <WarningCircle size={18} weight="fill"/>}</span><strong>改善行动台账</strong>{ledgerOpen ? <CaretDown size={16}/> : <CaretRight size={16}/>}</button><small>{record.actionLedger.message}</small></header>{ledgerOpen && <div className="quality-agent-ledger-body">{record.actionLedger.actions?.length ? <div className="agent-report-table-wrap"><table className="agent-report-table quality-agent-ledger-table"><thead><tr><th>行动</th><th>责任与期限</th><th>验收复查</th><th>状态</th></tr></thead><tbody>{record.actionLedger.actions.map((item) => <tr key={item.id}><td><b>{item.id} · {item.phase}</b><span>{item.action}</span><small>{item.conclusionId} · {item.evidenceIds?.join("、") || "证据待补"}</small></td><td><b>{item.owner}</b><span>{item.dueDate || "期限待定"}</span><small>{item.deliverable || "交付物待补"}</small></td><td><b>{actionMetricLabel(item)}</b><span>复查：{item.reviewDate || "待定"}</span><small>{item.statusReason}</small></td><td><em className={`quality-agent-action-status status-${item.status}`}>{ACTION_STATUS_LABELS[item.status] || item.status}</em>{item.status === "verification-ready" && <div className="quality-agent-close-action"><input value={closureEvidence[item.id] || ""} onChange={(event) => setClosureEvidence((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="关闭证据位置/编号"/><button type="button" className="qmdp-primary-btn" onClick={() => closeAction(item.id)}>核验关闭</button></div>}{item.closureEvidence && <small>关闭证据：{item.closureEvidence}</small>}</td></tr>)}</tbody></table></div> : <p className="quality-agent-save-state error">{record.actionLedger.message}</p>}</div>}</section>}
    {record.content && <section ref={finalReportRef} className={`qmdp-card quality-agent-report quality-agent-final-report ${activeReportLayoutClass}`}><header><div><strong>{AGENT_TITLE}正式报告</strong><span>{reportLayoutLabel(layoutSkillName)}</span></div>{renderReportActions({ id: "current", content: record.content, source: record, reportRef: finalReportRef })}</header><div className={`quality-agent-report-content ${activeReportLayoutClass}`} dangerouslySetInnerHTML={{ __html: finalReportHtml }}/>{saveState.message && <p className={`quality-agent-save-state ${saveState.status}`}>{saveState.message}</p>}</section>}
    {selectedReportName && <section ref={savedReportRef} className={`qmdp-card quality-agent-saved-report ${activeReportLayoutClass}`}><header><div><strong>已保存报告 · {module}</strong><span>{selectedReport?.updatedAt ? new Date(selectedReport.updatedAt).toLocaleString("zh-CN") : ""}</span></div>{renderReportActions({ id: "saved", content: selectedReportContent, source: { ...(selectedReport || {}), module: selectedReport?.module || module }, reportRef: savedReportRef })}{selectedReportState.status === "loading" && <small>读取中…</small>}</header>{selectedReportState.message && <p className={`quality-agent-save-state ${selectedReportState.status === "error" ? "error" : ""}`}>{selectedReportState.message}</p>}{selectedReportContent && <div className={`quality-agent-report-content ${activeReportLayoutClass}`} dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(selectedReportContent, { chartFirst: true, publisher: true, profileId: layoutSkillName, module, visualSpec: selectedReport?.visualSpec || extractReportVisualSpec(selectedReportContent) }) }}/>}</section>}
    {showImportedReport && selectedImportedReport && <section ref={importedReportRef} className={`qmdp-card quality-agent-imported-report ${activeReportLayoutClass}`}><header><div><strong>外部导入报告 · {module}</strong><small>导入的报告独立保存，不覆盖在线分析和项目报告库</small></div>{renderReportActions({ id: "imported", content: selectedImportedReport.content, source: { ...selectedImportedReport, module }, reportRef: importedReportRef })}</header><div className="quality-agent-imported-report-toolbar"><span>{selectedImportedReport.fileName} · {new Date(selectedImportedReport.importedAt).toLocaleString("zh-CN")}</span><div><button className="qmdp-secondary-btn" onClick={() => setShowImportedReport(false)}><EyeSlash size={14}/>取消显示</button><button className="qmdp-danger-btn" onClick={() => removeImportedReport(selectedImportedReport.id)}><Trash size={14}/>删除导入报告</button></div></div><div className={`quality-agent-report-content ${activeReportLayoutClass}`} dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(selectedImportedReport.content, { chartFirst: true, publisher: true, profileId: layoutSkillName, module }) }}/></section>}
    {error && <div className="quality-agent-error-banner"><WarningCircle size={18}/>{error}</div>}
  </div>;
}
