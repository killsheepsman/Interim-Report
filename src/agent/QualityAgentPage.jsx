import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsClockwise, Brain, CaretDown, CaretRight, CheckCircle, DownloadSimple, FileArrowUp, FloppyDisk, Trash, WarningCircle } from "@phosphor-icons/react";
import { deleteAgentReport, deleteLocalAgentReport, loadAgentReport, loadAgentReports, loadLocalAgentReport, loadLocalAgentReports, loadAgentSkills, requestAiChat, saveAgentReportFile, saveLocalAgentReport } from "../dataStore.js";
import { buildQualityAgentSnapshot } from "./qualitySnapshot.js";
import { closeQualityAgentAction, loadQualityAgentRuns, qualityAgentSnapshotHash, QUALITY_AGENT_STAGES, runQualityAgent, saveQualityAgentRuns } from "./qualityAgent.js";
import { calloutToneClass, headingClass, isLayoutMarker, metricLine, sectionClass, tableToneClass } from "./reportLayout.js";

const AGENT_TITLE = "质量分析 Agent";
const CORE_SKILL_NAME = "quality-analysis-core";
const DEFAULT_CORE_SKILL = { id: CORE_SKILL_NAME, name: CORE_SKILL_NAME, description: "质量分析共通证据与闭环规则", content: "只解释固定统计快照，区分事实、推断和待验证假设，并用结果—过程—根因—责任—行动形成闭环。" };
const REPORT_LAYOUT_STORAGE_KEY = "qms-quality-agent-iqc-report-layout-v1";
const REPORT_LAYOUT_SKILLS = [
  { id: "quality-report-layout-apple", name: "quality-report-layout-apple", label: "Apple 排版", description: "结论优先、克制色彩和宽松留白", content: "使用单一主标题、结论优先、短段落、克制表格和宽松留白输出结构化 Markdown；不修改任何数字、证据和行动。" },
  { id: "quality-report-layout-notion", name: "quality-report-layout-notion", label: "Notion 排版", description: "知识库式层级、信息块和行动工作区", content: "使用稳定标题层级、可扫描列表、结构化表格和待办工作区输出 Markdown；不修改任何数字、证据和行动。" },
];
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
const reportLayoutClass = (layoutSkillName) => layoutSkillName === "quality-report-layout-apple"
  ? "report-layout-apple"
  : layoutSkillName === "quality-report-layout-notion" ? "report-layout-notion" : "report-layout-none";
const reportLayoutLabel = (layoutSkillName) => REPORT_LAYOUT_SKILLS.find((item) => item.name === layoutSkillName)?.label || "不使用排版 Skill";
const savedReportLayout = (report) => {
  const explicit = String(report?.layoutSkillName || "");
  if (REPORT_LAYOUT_SKILLS.some((item) => item.name === explicit)) return explicit;
  return REPORT_LAYOUT_SKILLS.find((item) => String(report?.fileName || "").includes(`-${item.name}-`))?.name || "";
};
const initialReportLayout = (module) => {
  if (module !== "IQC" || typeof localStorage === "undefined") return "";
  const saved = localStorage.getItem(REPORT_LAYOUT_STORAGE_KEY) || "";
  return REPORT_LAYOUT_SKILLS.some((item) => item.name === saved) ? saved : "";
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
const downloadAgentReport = (record) => {
  const blob = new Blob([record.content || "暂无报告"], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${AGENT_TITLE}-${record.module}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
  link.click();
  URL.revokeObjectURL(url);
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
const renderAgentMarkdown = (content, { chartFirst = false, snapshot = null, includeSnapshotCharts = false } = {}) => {
  const lines = String(content || "暂无报告").split(/\r?\n/);
  const output = [];
  const snapshotCharts = includeSnapshotCharts ? renderIqcSnapshotCharts(snapshot) : {};
  const insertedSnapshotCharts = new Set();
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
    output.push(`<div class="agent-report-inline-chart">${snapshotCharts[chartKey]}</div>`);
    insertedSnapshotCharts.add(chartKey);
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const raw = line.trim();
    if (isLayoutMarker(raw)) continue;
    if (isMarkdownTableLine(line)) {
      flushMetrics();
      const tableLines = [];
      while (index < lines.length && isMarkdownTableLine(lines[index])) tableLines.push(lines[index++]);
      const suppressSnapshotTable = (/月度趋势/i.test(sectionTitle) && insertedSnapshotCharts.has("monthly"))
        || (/物料类别.*良率/i.test(sectionTitle) && insertedSnapshotCharts.has("material"));
      output.push(renderMarkdownTable(tableLines, { chartFirst, sectionTitle, suppressIqcYieldTable: suppressSnapshotTable }));
      index -= 1;
      continue;
    }
    if (/^###\s/.test(raw)) { openSection(raw.replace(/^###\s/, ""), "h5"); insertSnapshotChartForSection(sectionTitle); continue; }
    if (/^##\s/.test(raw)) { openSection(raw.replace(/^##\s/, ""), "h4"); insertSnapshotChartForSection(sectionTitle); continue; }
    if (/^#\s/.test(raw)) { openSection(raw.replace(/^#\s/, ""), "h3"); insertSnapshotChartForSection(sectionTitle); continue; }
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
  return output.join("");
};

export function QualityAgentPage({ data, files = [], dateRange, module = "DQA", onEnsureAgentSources, canStart = false, canSaveToServer = false }) {
  const initialSkill = MODULE_DEFAULT_SKILLS[module] || MODULE_DEFAULT_SKILLS.DQA;
  const [skillName, setSkillName] = useState(initialSkill.name);
  const [skillContent, setSkillContent] = useState(initialSkill.content);
  const [coreSkillContent, setCoreSkillContent] = useState(DEFAULT_CORE_SKILL.content);
  const [skills, setSkills] = useState([initialSkill]);
  const [layoutSkills, setLayoutSkills] = useState(REPORT_LAYOUT_SKILLS);
  const [layoutSkillName, setLayoutSkillName] = useState(() => initialReportLayout(module));
  const [layoutSkillContent, setLayoutSkillContent] = useState(() => REPORT_LAYOUT_SKILLS.find((item) => item.name === initialReportLayout(module))?.content || "");
  const [runs, setRuns] = useState(() => loadQualityAgentRuns());
  const [stageOpen, setStageOpen] = useState({});
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [closureEvidence, setClosureEvidence] = useState({});
  const [savedReports, setSavedReports] = useState([]);
  const [selectedReportName, setSelectedReportName] = useState("");
  const [selectedReportContent, setSelectedReportContent] = useState("");
  const [selectedReportState, setSelectedReportState] = useState({ status: "idle", message: "" });
  const [importedReports, setImportedReports] = useState(() => readImportedReports()[module] || []);
  const [selectedImportedId, setSelectedImportedId] = useState("");
  const importInputRef = useRef(null);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState({ status: "idle", message: "" });
  const [agentFiles, setAgentFiles] = useState(files);
  const [sourceState, setSourceState] = useState({ status: "idle", message: "" });
  const abortRef = useRef(null);
  const sourceReady = useMemo(() => agentFiles.some((source) => source.module === module && Array.isArray(source.rows) && source.rows.length), [agentFiles, module]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
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
  const combinedSkillContent = useMemo(() => `模块 Skill：${skillName}\n${skillContent}\n\n核心 Skill：${CORE_SKILL_NAME}\n${coreSkillContent}`, [skillName, skillContent, coreSkillContent]);
  const record = runs[module] || {};
  const displaySnapshot = record.snapshot || snapshot;
  const activeReportLayoutClass = reportLayoutClass(module === "IQC" ? layoutSkillName : "");
  const reportLayoutChanged = module === "IQC" && Boolean(record.content) && String(record.layoutSkillName || "") !== layoutSkillName;
  const auditSummary = useMemo(() => {
    try { return JSON.parse(record.stages?.audit?.content || "{}"); } catch { return {}; }
  }, [record.stages?.audit?.content]);
  const auditDetail = [...(auditSummary.blockers || []), ...(auditSummary.materialIssues || []), ...(auditSummary.warnings || [])].join("；");
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
  const moduleReports = useMemo(
    () => savedReports.filter((item) => item.localOnly ? item.module === module : item.fileName.includes(`QMS-Agent报告-${module}-`)),
    [savedReports, module],
  );
  const selectedReport = moduleReports.find((item) => item.fileName === selectedReportName) || null;
  const selectedImportedReport = importedReports.find((item) => item.id === selectedImportedId) || null;

  useEffect(() => {
    const reports = readImportedReports()[module] || [];
    setImportedReports(Array.isArray(reports) ? reports : []);
    setSelectedImportedId("");
  }, [module]);

  useEffect(() => {
    if (!importedReports.length) {
      setSelectedImportedId("");
      return;
    }
    if (!importedReports.some((item) => item.id === selectedImportedId)) {
      setSelectedImportedId(importedReports[0].id);
    }
  }, [importedReports, selectedImportedId]);

  useEffect(() => {
    if (!moduleReports.length) {
      setSelectedReportName("");
      setSelectedReportContent("");
      return;
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
      setSelectedReportContent("");
      setSelectedReportState({ status: "error", message: `报告读取失败：${loadError.message}` });
    });
    return () => { active = false; };
  }, [selectedReportName, selectedReport]);
  useEffect(() => {
    if (module !== "IQC" || !selectedReportName) return;
    const restoredLayout = savedReportLayout(selectedReport);
    if (restoredLayout === layoutSkillName) return;
    setLayoutSkillName(restoredLayout);
    setLayoutSkillContent(layoutSkills.find((item) => item.name === restoredLayout)?.content || "");
  }, [module, selectedReportName, selectedReport?.layoutSkillName, selectedReport?.fileName]);
  useEffect(() => { saveQualityAgentRuns(runs); }, [runs]);
  useEffect(() => {
    if (module === "IQC") localStorage.setItem(REPORT_LAYOUT_STORAGE_KEY, layoutSkillName);
  }, [module, layoutSkillName]);
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
      if (module === "IQC") {
        const loadedLayouts = REPORT_LAYOUT_SKILLS.map((fallback) => {
          const loaded = next.find((item) => String(item.name || item.id || "") === fallback.name);
          return loaded ? { ...fallback, ...loaded, label: fallback.label } : fallback;
        });
        setLayoutSkills(loadedLayouts);
        const selectedLayout = loadedLayouts.find((item) => item.name === layoutSkillName);
        setLayoutSkillContent(selectedLayout?.content || "");
      } else {
        setLayoutSkillName("");
        setLayoutSkillContent("");
      }
    }).catch(() => {
      const fallback = MODULE_DEFAULT_SKILLS[module] || MODULE_DEFAULT_SKILLS.DQA;
      setSkills([fallback]);
      setSkillName(fallback.name);
      setSkillContent(fallback.content);
      setCoreSkillContent(DEFAULT_CORE_SKILL.content);
      setLayoutSkills(REPORT_LAYOUT_SKILLS);
      const selectedLayout = REPORT_LAYOUT_SKILLS.find((item) => item.name === layoutSkillName);
      setLayoutSkillContent(module === "IQC" ? selectedLayout?.content || "" : "");
    });
    refreshReports();
  }, [module]);

  const start = async () => {
    if (!canStart) {
      setError("当前账号没有“启动 Agent 分析”权限，请联系主管理员");
      return;
    }
    setSelectedReportName("");
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (!sourceReady && onEnsureAgentSources) {
        setSourceState({ status: "loading", message: "正在重新加载当前模块原始数据" });
        const nextSources = await onEnsureAgentSources([module], (progress) => {
          if (progress?.label) setSourceState({ status: "loading", message: progress.label });
        });
        const byKey = new Map();
        [...files.filter((source) => source.module === module), ...(nextSources || []).filter((source) => source.module === module)].forEach((source) => {
          const key = `${source.module}::${source.name}`;
          const previous = byKey.get(key);
          const previousRows = Array.isArray(previous?.rows) ? previous.rows.length : 0;
          const nextRows = Array.isArray(source.rows) ? source.rows.length : 0;
          if (!previous || nextRows >= previousRows) byKey.set(key, source);
        });
        setAgentFiles([...byKey.values()]);
        setSourceState({ status: "ready", message: "原始数据已重新加载，请再次点击启动 Agent 分析" });
        return;
      }
      const currentHash = qualityAgentSnapshotHash(snapshot);
      const sameSnapshot = record.snapshotHash === currentHash || record.snapshotHash === currentHash.slice(0, 80);
      const hasCompleteReport = record.status === "done" && Boolean(record.content);
      let existing = record;
      if (hasCompleteReport && sameSnapshot) {
        if (reportLayoutChanged && record.skillName === skillName) {
          if (!window.confirm(`报告排版已切换为“${reportLayoutLabel(layoutSkillName)}”。是否保留已完成的数据审计、二八分析和改善行动，只重新生成正式报告？`)) return;
        } else {
          if (!window.confirm("当前数据和统计周期均未变化，已生成报告。继续后会从头重新分析并覆盖当前运行缓存；如需保留当前版本，请先点击“保存到项目”。是否继续？")) return;
          existing = null;
        }
      }
      const next = await runQualityAgent({ snapshot, skillName, skillContent: combinedSkillContent, layoutSkillName: module === "IQC" ? layoutSkillName : "", layoutSkillContent: module === "IQC" ? layoutSkillContent : "", existing, requestChat: (messages, options = {}) => requestAiChat(messages, { ...options, operation: "quality-agent-start" }), signal: controller.signal, onUpdate: update });
      if (next.status === "error") setError(`${next.currentStage || "Agent分析"}：${next.error}`);
      else {
        // Keep the deterministic aggregate snapshot for rendering, but release raw Excel rows.
        update(next);
        setAgentFiles((current) => current
          .filter((source) => source.module === module)
          .map(({ rows, ...source }) => ({ ...source, rows: [] })));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

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

  const saveToProject = async () => {
    if (!record.content) return;
    setSaveState({ status: "saving", message: "正在保存导出内容到项目报告库…" });
    try {
      const saved = canSaveToServer
        ? await saveAgentReportFile({ module, skillName: record.skillName || skillName, layoutSkillName: record.layoutSkillName || "", period: snapshot.period, content: record.content })
        : await saveLocalAgentReport({ module, skillName: record.skillName || skillName, layoutSkillName: record.layoutSkillName || "", period: snapshot.period, content: record.content });
      await refreshReports();
      setSelectedReportName("");
      setSaveState({ status: "saved", message: canSaveToServer ? `已保存到服务器：${saved.relativePath || saved.fileName}` : `已保存到本机：${saved.fileName}` });
    } catch (saveError) {
      setSaveState({ status: "error", message: `保存失败：${saveError.message}` });
    }
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
  };

  return <div className="qmdp-page quality-agent-page">
    <div className={`agent-generation-progress ${record.status === "error" ? "error" : workflowProgress.percent >= 100 ? "done" : ""}`} role="status" aria-live="polite"><div className="agent-generation-progress-head"><strong>{workflowProgress.phase}</strong><b>{Math.round(workflowProgress.percent || 0)}%</b></div><div className="agent-generation-progress-track"><i style={{ width: `${Math.max(0, Math.min(100, workflowProgress.percent || 0))}%` }} /></div><small className="agent-generation-progress-detail">{workflowProgress.detail}</small></div>
    <div className="quality-agent-hero"><div><span className="qmdp-eyebrow">QUALITY ANALYSIS AGENT / {module}</span><h2>{AGENT_TITLE} · {module}</h2><p>基于软件固定统计结果生成可审计的 {module} 质量复盘和改善行动。角色报告、发送任务与考试统计在独立 Agent 页面处理。</p></div><div className="quality-agent-hero-actions">{record.content && <><button className="qmdp-secondary-btn" onClick={() => downloadAgentReport(record)}><DownloadSimple size={15}/>导出报告</button><button className="qmdp-primary-btn" onClick={saveToProject} disabled={saveState.status === "saving"}><FloppyDisk size={15}/>{saveState.status === "saving" ? "保存中…" : "保存到项目"}</button></>}<Brain size={42} weight="duotone" /></div></div>
    <section className="qmdp-card quality-agent-controls">
      <label>模块分析 Skill<select value={skillName} onChange={(event) => { const selected = skills.find((item) => item.name === event.target.value); setSkillName(event.target.value); setSkillContent(selected?.content || ""); }}>{skills.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select><small>自动叠加 {CORE_SKILL_NAME}</small></label>
      {module === "IQC" && <label>报告排版 Skill<select value={layoutSkillName} onChange={(event) => { const selectedName = event.target.value; const selected = layoutSkills.find((item) => item.name === selectedName); setLayoutSkillName(selectedName); setLayoutSkillContent(selected?.content || ""); }}><option value="">不使用排版 Skill</option>{layoutSkills.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</select><small>{layoutSkillName ? `${layoutSkillName} · 当前报告立即预览；重新生成时同步优化内容结构` : "保持现有报告结构"}</small></label>}
      <label>统计开始<input type="date" value={period.start2026 || ""} onChange={(event) => setPeriod((current) => ({ ...current, start2026: event.target.value }))}/></label>
      <label>统计结束<input type="date" value={period.end2026 || ""} onChange={(event) => setPeriod((current) => ({ ...current, end2026: event.target.value }))}/></label>
      <span>分析模块：{module} · 当前周期：{period.start2026}—{period.end2026}{sourceState.message ? ` · ${sourceState.message}` : ""}{auditSummary.grade && <em className={`quality-agent-audit-grade grade-${String(auditSummary.grade).toLowerCase()}`} title={auditDetail || "数据审计通过"}>数据可信度 {auditSummary.grade}</em>}</span>
      <div className="quality-agent-report-toolbar">
        <label>项目报告<select value={selectedReportName} onChange={(event) => setSelectedReportName(event.target.value)} disabled={!moduleReports.length}><option value="">{moduleReports.length ? "请选择已保存报告" : "暂无已保存报告"}</option>{moduleReports.map((item) => <option key={item.fileName} value={item.fileName}>{item.fileName} · {new Date(item.updatedAt).toLocaleString("zh-CN")}</option>)}</select></label>
        <button className="qmdp-secondary-btn" onClick={refreshReports}><ArrowsClockwise size={15}/>刷新报告库</button>
        {selectedReportName && <button className="qmdp-danger-btn" onClick={() => removeSavedReport(selectedReportName)}><Trash size={14}/>删除所选报告</button>}
        <input ref={importInputRef} type="file" accept=".docx,.md,.markdown,.txt,.json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain,application/json" onChange={importReport} hidden/>
        <button className="qmdp-secondary-btn" onClick={() => importInputRef.current?.click()}><FileArrowUp size={15}/>导入 Agent 报告</button>
        <label>外部报告<select value={selectedImportedId} onChange={(event) => setSelectedImportedId(event.target.value)} disabled={!importedReports.length}><option value="">暂无导入报告</option>{importedReports.map((item) => <option key={item.id} value={item.id}>{item.fileName} · {new Date(item.importedAt).toLocaleString("zh-CN")}</option>)}</select></label>
      </div>
      {record.status === "running" ? <button className="qmdp-danger-btn" onClick={stop}><WarningCircle size={16}/>停止 Agent分析</button> : <button className="qmdp-primary-btn" onClick={start} disabled={!canStart} title={!canStart ? "仅主管理员可以启动 Agent 分析" : "启动 Agent 分析"}><Brain size={16}/>{record.status === "error" ? "继续 Agent分析" : reportLayoutChanged ? "应用排版并重新生成报告" : "启动 Agent分析"}</button>}
    </section>
    <section className="quality-agent-collapsible-workflow">{QUALITY_AGENT_STAGES.filter((stage) => stage.id !== "audit").map((stage) => { const item = record.stages?.[stage.id] || {}; const open = Boolean(stageOpen[stage.id]); return <article className={`qmdp-card quality-agent-stage ${item.status || "pending"}`} key={stage.id}><header><button type="button" className="quality-agent-stage-toggle" onClick={() => setStageOpen((current) => ({ ...current, [stage.id]: !current[stage.id] }))}><span>{item.status === "done" ? <CheckCircle size={18} weight="fill"/> : item.status === "error" ? <WarningCircle size={18} weight="fill"/> : item.status === "running" ? <ArrowsClockwise size={18} className="spin"/> : stage.id === "analysis" ? "1" : stage.id === "actions" ? "2" : "3"}</span><strong>{stage.label}</strong>{open ? <CaretDown size={16}/> : <CaretRight size={16}/>}</button><small>{item.status === "done" ? "已完成" : item.status === "error" ? "失败，可继续" : item.status === "running" ? "执行中" : "等待执行"}</small></header>{open && item.content && <div className="quality-agent-stage-content" dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(item.content) }}/>} {open && item.error && <p className="quality-agent-error">{item.error}</p>}</article>; })}</section>
    {record.actionLedger && <section className={`qmdp-card quality-agent-action-ledger ${record.actionLedger.status || "warning"}`}><header><button type="button" className="quality-agent-stage-toggle" onClick={() => setLedgerOpen((current) => !current)}><span>{record.actionLedger.status === "ready" ? <CheckCircle size={18} weight="fill"/> : <WarningCircle size={18} weight="fill"/>}</span><strong>改善行动台账</strong>{ledgerOpen ? <CaretDown size={16}/> : <CaretRight size={16}/>}</button><small>{record.actionLedger.message}</small></header>{ledgerOpen && <div className="quality-agent-ledger-body">{record.actionLedger.actions?.length ? <div className="agent-report-table-wrap"><table className="agent-report-table quality-agent-ledger-table"><thead><tr><th>行动</th><th>责任与期限</th><th>验收复查</th><th>状态</th></tr></thead><tbody>{record.actionLedger.actions.map((item) => <tr key={item.id}><td><b>{item.id} · {item.phase}</b><span>{item.action}</span><small>{item.conclusionId} · {item.evidenceIds?.join("、") || "证据待补"}</small></td><td><b>{item.owner}</b><span>{item.dueDate || "期限待定"}</span><small>{item.deliverable || "交付物待补"}</small></td><td><b>{actionMetricLabel(item)}</b><span>复查：{item.reviewDate || "待定"}</span><small>{item.statusReason}</small></td><td><em className={`quality-agent-action-status status-${item.status}`}>{ACTION_STATUS_LABELS[item.status] || item.status}</em>{item.status === "verification-ready" && <div className="quality-agent-close-action"><input value={closureEvidence[item.id] || ""} onChange={(event) => setClosureEvidence((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="关闭证据位置/编号"/><button type="button" className="qmdp-primary-btn" onClick={() => closeAction(item.id)}>核验关闭</button></div>}{item.closureEvidence && <small>关闭证据：{item.closureEvidence}</small>}</td></tr>)}</tbody></table></div> : <p className="quality-agent-save-state error">{record.actionLedger.message}</p>}</div>}</section>}
    {record.content && <section className={`qmdp-card quality-agent-report quality-agent-final-report ${activeReportLayoutClass}`}><header><strong>{AGENT_TITLE}正式报告</strong><span>{module === "IQC" ? reportLayoutLabel(layoutSkillName) : "已生成内容"}</span></header><div className={`quality-agent-report-content ${activeReportLayoutClass}`} dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(record.content, { chartFirst: true, snapshot: displaySnapshot, includeSnapshotCharts: module === "IQC" }) }}/>{saveState.message && <p className={`quality-agent-save-state ${saveState.status}`}>{saveState.message}</p>}</section>}
    {selectedReportName && <section className={`qmdp-card quality-agent-saved-report ${activeReportLayoutClass}`}><header><div><strong>已保存报告 · {module}</strong><span>{selectedReport?.updatedAt ? new Date(selectedReport.updatedAt).toLocaleString("zh-CN") : ""}</span></div>{selectedReportState.status === "loading" && <small>读取中…</small>}</header>{selectedReportState.message && <p className={`quality-agent-save-state ${selectedReportState.status === "error" ? "error" : ""}`}>{selectedReportState.message}</p>}{selectedReportContent && <div className={`quality-agent-report-content ${activeReportLayoutClass}`} dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(selectedReportContent, { chartFirst: true }) }}/>}</section>}
    <section className={`qmdp-card quality-agent-imported-report ${activeReportLayoutClass}`}><header><div><strong>外部导入报告 · {module}</strong><small>导入的报告独立保存，不覆盖在线分析和项目报告库</small></div><div className="quality-agent-library-actions"><input ref={importInputRef} type="file" accept=".docx,.md,.markdown,.txt,.json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain,application/json" onChange={importReport} hidden/><button className="qmdp-secondary-btn" onClick={() => importInputRef.current?.click()}><FileArrowUp size={15}/>导入 Agent 报告</button><label>选择导入报告<select value={selectedImportedId} onChange={(event) => setSelectedImportedId(event.target.value)} disabled={!importedReports.length}><option value="">暂无导入报告</option>{importedReports.map((item) => <option key={item.id} value={item.id}>{item.fileName} · {new Date(item.importedAt).toLocaleString("zh-CN")}</option>)}</select></label></div></header>{selectedImportedReport && <div className="quality-agent-imported-report-toolbar"><span>{selectedImportedReport.fileName} · {new Date(selectedImportedReport.importedAt).toLocaleString("zh-CN")}</span><button className="qmdp-danger-btn" onClick={() => removeImportedReport(selectedImportedReport.id)}><Trash size={14}/>删除导入报告</button></div>}{selectedImportedReport && <div className={`quality-agent-report-content ${activeReportLayoutClass}`} dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(selectedImportedReport.content, { chartFirst: true }) }}/>}</section>
    {error && <div className="quality-agent-error-banner"><WarningCircle size={18}/>{error}</div>}
  </div>;
}
