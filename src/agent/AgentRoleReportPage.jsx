import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowsClockwise, Brain, DownloadSimple, FloppyDisk, PaperPlaneTilt, WarningCircle } from "@phosphor-icons/react";
import { createExamSession, loadAgentReport, loadAgentReports, loadAgentSkills, loadConfirmedKnowledgeMatches, loadCurrentUser, loadDqaAgentRaw, loadExamResults, loadKnowledgeRecurrences, loadLocalAgentReport, loadLocalAgentReports, loadReportQualityRules, requestAiChat, saveAgentDispatch, saveAgentReportFile, saveLocalAgentReport } from "../dataStore.js";
import { buildDqaAgentRawMetrics } from "../dataEngine.js";
import { loadQualityAgentRuns } from "./qualityAgent.js";
import { renderAgentMarkdown, reportFileName } from "./QualityAgentPage.jsx";
import { loadImportedAgentReports } from "./agentReportStorage.js";
import { calloutToneClass, headingClass, isLayoutMarker, isMachineMetadataLine, metricLine, sectionClass, tableToneClass } from "./reportLayout.js";
import { DEFAULT_REPORT_PRESENTATION_PROFILE, getReportPresentationProfile, normalizeReportPresentationProfile, REPORT_PRESENTATION_PROFILES, reportPresentationClass } from "./reportPresentationProfiles.js";
import { extractReportVisualSpec, sanitizeHumanReportContent } from "../reportSanitizer.js";
import { loadQualityAgentRoleSnapshotRegistry } from "../dataStore.js";
import { normalizeRoleSnapshotRegistry, pickRoleSnapshot } from "./roleSnapshotRegistry.js";
import { DEFAULT_REPORT_QUALITY_RULES, reportQualityAdvice, validateReportQuality } from "./reportQualityRules.js";
import { addIsoDays, enforceRdEngineerReportFacts } from "./rdEngineerReportContract.js";

const ROLE_CACHE_KEY = "qms-agent-role-report-cache-v2";
const ROLE_LAYOUT_STORAGE_KEY = "qms-agent-role-report-layout-v1";
const MAX_ROLE_CACHE_REPORTS = 240;
const ROLE_RECIPIENT_CACHE = new Map();
const ROLE_HISTORY_DETAIL_CACHE = new Map();
const roleHistoryDetailKey = (entry = {}) => `${entry.localOnly ? "local" : "server"}:${entry.fileName || ""}:${entry.updatedAt || entry.savedAt || ""}`;
const loadRoleHistoryDetail = (entry = {}) => {
  const key = roleHistoryDetailKey(entry);
  const cached = ROLE_HISTORY_DETAIL_CACHE.get(key);
  if (cached) return cached instanceof Promise ? cached : Promise.resolve(cached);
  const request = (entry.localOnly ? loadLocalAgentReport(entry.fileName) : loadAgentReport(entry.fileName))
    .then((value) => {
      ROLE_HISTORY_DETAIL_CACHE.delete(key);
      ROLE_HISTORY_DETAIL_CACHE.set(key, value || null);
      while (ROLE_HISTORY_DETAIL_CACHE.size > 16) ROLE_HISTORY_DETAIL_CACHE.delete(ROLE_HISTORY_DETAIL_CACHE.keys().next().value);
      return value || null;
    })
    .catch((error) => {
      ROLE_HISTORY_DETAIL_CACHE.delete(key);
      throw error;
    });
  ROLE_HISTORY_DETAIL_CACHE.set(key, request);
  return request;
};
const RecipientSelectionChip = memo(function RecipientSelectionChip({ name, checked, onToggle }) {
  return <label className={`quality-agent-recipient-chip${checked ? " active" : ""}`}><input type="checkbox" checked={checked} onChange={() => onToggle(name)}/><span>{name}</span></label>;
});
const exportRoleReport = ({ role, recipient, content, model, creatorIp, skillName }) => {
  const fileName = reportFileName({
    module: "角色报告",
    skillName,
    role,
    recipient,
    model,
    creatorIp,
  }, "md");
  const blob = new Blob([sanitizeHumanReportContent(content || "")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
const reportLayoutClass = (layoutProfileId) => reportPresentationClass(layoutProfileId);
const reportLayoutLabel = (layoutProfileId) => getReportPresentationProfile(layoutProfileId)?.label || "研究简报网页风格";
const initialRoleLayout = () => {
  if (typeof localStorage === "undefined") return DEFAULT_REPORT_PRESENTATION_PROFILE;
  return normalizeReportPresentationProfile(localStorage.getItem(ROLE_LAYOUT_STORAGE_KEY) || "");
};
const roleSpecs = {
  组装人员: { chain: "组装人员 → 机长 → 交付经理 → 供应链经理", modules: ["IPQC"], fields: ["送检人"] },
  机长: { chain: "组装人员 → 机长 → 交付经理 → 供应链经理", modules: ["IPQC"], fields: ["机长"] },
  交付经理: { chain: "组装人员 → 机长 → 交付经理 → 供应链经理", modules: ["IPQC"], fields: ["交付经理"] },
  供应链经理: { chain: "组装人员 → 机长 → 交付经理 → 供应链经理", modules: ["IPQC"], fields: ["供应商经理", "供应商负责人", "供应链经理", "SQE", "采购负责人"] },
  研发工程师: { chain: "研发工程师 → PM → TPM → 产总", modules: ["OQC", "DQA", "QMS"], fields: ["__engineer", "研发工程师", "工程师", "RD工程师", "工程师姓名", "责任人/处理人", "责任人\\处理人", "责任人", "申请人", "创建人"] },
  PM: { chain: "研发工程师 → PM → TPM → 产总", modules: ["OQC", "DQA", "QMS"], fields: ["PM", "项目经理", "项目负责人"] },
  TPM: { chain: "研发工程师 → PM → TPM → 产总", modules: ["OQC", "DQA", "QMS"], fields: ["TPM"] },
  产总: { chain: "研发工程师 → PM → TPM → 产总", modules: ["OQC", "DQA", "QMS"], fields: ["产总", "产品总监", "产品部负责人"] },
};
const roleSkillIds = {
  组装人员: "quality-role-assembly-person",
  机长: "quality-role-machine-leader",
  交付经理: "quality-role-delivery-manager",
  供应链经理: "quality-role-supply-chain-manager",
  研发工程师: "quality-role-rd-engineer",
  PM: "quality-role-pm",
  TPM: "quality-role-tpm",
  产总: "quality-role-product-director",
};
const fallbackRoleSkill = (role) => `角色：${role}\n严格区分本人问题与管理范围汇总。所有数字必须来自固定统计或明细证据；证据不足写“待核实”。输出结果、过程、根因、责任、行动、验证和关闭条件。`;
const retryableRoleAgentError = (error) => /\b(?:429|502|503|504|524)\b|too many requests|rate limit|网关超时|gateway timeout|timed? ?out|service unavailable|bad gateway/i.test(String(error?.message || error || ""));
const waitForRoleAgentRetry = (delay, signal) => new Promise((resolve, reject) => {
  const timer = window.setTimeout(resolve, delay);
  if (!signal) return;
  signal.addEventListener("abort", () => {
    window.clearTimeout(timer);
    reject(new DOMException("aborted", "AbortError"));
  }, { once: true });
});
const compactRolePromptValue = (value, depth = 3, arrayLimit = 10) => {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (depth <= 0) return Array.isArray(value) ? value.slice(0, arrayLimit) : Object.fromEntries(Object.entries(value).filter(([, item]) => item === null || typeof item !== "object").slice(0, 24));
  if (Array.isArray(value)) return value.slice(0, arrayLimit).map((item) => compactRolePromptValue(item, depth - 1, arrayLimit));
  return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [key, compactRolePromptValue(item, depth - 1, arrayLimit)]));
};
const compactRoleBaselineContent = (value, limit = 4200) => {
  const clean = sanitizeHumanReportContent(value || "")
    .replace(/<REPORT_VISUAL_SPEC_JSON>[\s\S]*?<\/REPORT_VISUAL_SPEC_JSON>/gi, "")
    .replace(/<!--\s*qms-agent-[\s\S]*?-->/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (clean.length <= limit) return clean;
  const head = Math.round(limit * 0.58);
  const tail = limit - head;
  return `${clean.slice(0, head)}\n\n[中间详细正文已由固定统计快照替代，不再重复传输]\n\n${clean.slice(-tail)}`;
};
const roleBaselineBrief = (baseline, modules, retry = false) => modules.map((module) => {
  const item = baseline.files.find((report) => report.module === module || report.fileName.includes(`QMS-Agent报告-${module}-`));
  return `\n===== ${module} Agent 基线摘要 =====\n${compactRoleBaselineContent(baseline.contents[item?.fileName] || "", retry ? 2200 : 4200)}`;
}).join("\n");
const reviewContributionMarkdown = (evidence = {}, content = "") => {
  const metrics = evidence.roleSnapshot?.dqaAgentMetrics || evidence.engineerMetrics || {};
  const participation = Number(metrics.reviewParticipation || 0);
  const suggestions = Number(metrics.reviewSuggestions || 0);
  if (!participation && !suggestions) return "";
  if (/^#{1,6}\s*(?:[一二三四五六七八九十\d.、\s-]*)?(?:正向贡献|设计评审(?:正向)?贡献)/m.test(String(content))) return "";
  return `\n\n## 设计评审正向贡献\n\n| 指标 | 本周期数据 | 口径 |\n| --- | ---: | --- |\n| 参与评审 | ${participation} 次 | 每份评审表中本人作为评审成员计 1 次 |\n| 有效改善项 | ${suggestions} 条 | 本人作为提出人，每行计 1 条 |\n\n该部分是前置评审参与和改善贡献，不计入研发问题、ECN、非BOM数量、风险排名或质量风险分。\n`;
};
const withDerivedEcnMetrics = (value = {}) => {
  const number = (item) => item !== null && item !== undefined && item !== "" && Number.isFinite(Number(item)) ? Number(item) : null;
  const totalBom = number(value.bomDenominator); const machinedBom = number(value.machinedBomDenominator ?? value.machinedDenominator?.ecn);
  const totalCount = number(value.ecnCount ?? value.ecn); const machinedCount = number(value.ecnMachinedCount ?? value.ecnMachined); const standardCount = number(value.ecnStandardCount ?? value.ecnStandard) ?? (totalCount != null && machinedCount != null ? Math.max(0, totalCount - machinedCount) : null);
  const standardBom = number(value.standardBomDenominator) ?? (totalBom != null && machinedBom != null ? Math.max(0, totalBom - machinedBom) : null);
  const machinedRate = number(value.machinedEcnRate) ?? (machinedBom ? (machinedCount || 0) / machinedBom : null);
  const standardRate = number(value.standardEcnRate) ?? (standardBom ? (standardCount || 0) / standardBom : null);
  return { ...value, standardBomDenominator: standardBom, machinedEcnRate: machinedRate, standardEcnRate: standardRate, machinedToStandardEcnRateRatio: number(value.machinedToStandardEcnRateRatio) ?? (machinedRate != null && standardRate ? machinedRate / standardRate : null) };
};

const escapeHtml = (value) => String(value || "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
const inlineMarkdown = (value) => String(value || "")
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*([^*]+)\*/g, "<em>$1</em>");
const renderTable = (rows, sectionTitle = "") => {
  const cells = rows
    .filter((line) => !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim()))
    .map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => inlineMarkdown(escapeHtml(cell.trim()))));
  if (!cells.length) return "";
  const [head, ...body] = cells;
  return `<div class="${tableToneClass(sectionTitle)}"><table class="agent-report-table"><thead><tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${head.map((_, index) => `<td>${row[index] || ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
};
const sectionHeading = (value) => {
  const text = String(value || "").replace(/^\s*#{1,6}\s*/, "").trim();
  const numbered = /^(?:第\s*[一二三四五六七八九十百\d]+\s*[章节、.)．]?\s*)|^(?:[一二三四五六七八九十百]+\s*[、．]\s*)|^(?:\d+\s*[、]\s*)/.test(text);
  const semantic = /^(?:\d+\s*[.)]\s*)?(?:结果|过程|根因|责任|行动|风险|排名|结论|改善|待办|汇总|复盘|证据|指标|问题|管理)/.test(text) && text.length < 100;
  return numbered || semantic || /^#{1,6}\s/.test(String(value || "").trim());
};
const rankingHeading = (value) => sectionHeading(value) && /(?:排名|名次|ranking)/i.test(String(value || ""));
const renderReportLines = (lines) => {
  lines = sanitizeHumanReportContent(lines || "").split(/\r?\n/);
  const output = [];
  const metricBuffer = [];
  let activeSection = "";
  let sectionOpen = false;
  const flushMetrics = () => {
    if (!metricBuffer.length) return;
    output.push(`<div class="agent-report-kpi-grid">${metricBuffer.splice(0).map((item) => `<article class="agent-report-kpi"><span>${inlineMarkdown(escapeHtml(item.label))}</span><strong>${inlineMarkdown(escapeHtml(item.value))}</strong></article>`).join("")}</div>`);
  };
  const closeSection = () => {
    flushMetrics();
    if (sectionOpen) output.push("</section>");
    sectionOpen = false;
  };
  const openSection = (title, tag) => {
    closeSection();
    activeSection = title;
    output.push(`<section class="${sectionClass(title)}"><${tag} class="${headingClass(title)}">${inlineMarkdown(escapeHtml(title))}</${tag}>`);
    sectionOpen = true;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (isLayoutMarker(raw)) continue;
    if (isMachineMetadataLine(raw)) continue;
    if (!raw) { flushMetrics(); output.push("<div class=\"agent-report-spacer\"></div>"); continue; }
    if (/^\|/.test(raw) && lines[index + 1] && /^\|/.test(lines[index + 1].trim())) {
      flushMetrics();
      const table = [];
      while (index < lines.length && /^\|/.test(lines[index].trim())) table.push(lines[index++]);
      index -= 1;
      const tableText = table.join(" ");
      if (/(排名|名次|rank)/i.test(tableText) && /(姓名|人员|对象|name)/i.test(tableText)) continue;
      output.push(renderTable(table, activeSection));
      continue;
    }
    if (/^###\s/.test(raw)) { openSection(raw.replace(/^###\s/, ""), "h5"); continue; }
    if (/^##\s/.test(raw)) { openSection(raw.replace(/^##\s/, ""), "h4"); continue; }
    if (/^#\s/.test(raw)) { openSection(raw.replace(/^#\s/, ""), "h3"); continue; }
    if (sectionHeading(raw)) { openSection(raw.replace(/^#{1,6}\s*/, ""), "h4"); continue; }
    const metric = metricLine(raw);
    if (metric) { metricBuffer.push(metric); continue; }
    flushMetrics();
    const value = inlineMarkdown(escapeHtml(raw));
    if (/^>\s?/.test(raw)) output.push(`<div class="${calloutToneClass(raw)}">${inlineMarkdown(escapeHtml(raw.replace(/^>\s?/, "")))}</div>`);
    else if (/^(\-|\*)\s/.test(raw)) output.push(`<div class="agent-report-bullet"><i></i><span>${inlineMarkdown(escapeHtml(raw.replace(/^(\-|\*)\s/, "")))}</span></div>`);
    else if (/^\d+[.)]\s/.test(raw)) output.push(`<div class="agent-report-numbered"><b>${escapeHtml(raw.match(/^\d+[.)]/)?.[0] || "")}</b><span>${inlineMarkdown(escapeHtml(raw.replace(/^\d+[.)]\s/, "")))}</span></div>`);
    else if (/^---+$/.test(raw)) output.push("<hr class=\"agent-report-divider\">");
    else output.push(`<p>${value}</p>`);
  }
  closeSection();
  return output.join("");
};
const reportParts = (content, splitForChart = true) => {
  const lines = sanitizeHumanReportContent(content || "暂无报告")
    .replace(REPORT_VERSION_MARKER, "")
    .split(/\r?\n/);
  const cleanLines = [];
  let hasRanking = false;
  let rankingInsertIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (!rankingHeading(lines[index].trim())) {
      cleanLines.push(lines[index]);
      continue;
    }
    hasRanking = true;
    if (rankingInsertIndex < 0) rankingInsertIndex = cleanLines.length;
    index += 1;
    while (index < lines.length && !sectionHeading(lines[index].trim())) index += 1;
    index -= 1;
  }
  if (!splitForChart) return { before: renderReportLines(cleanLines), after: "", hasRanking };
  if (rankingInsertIndex >= 0) return {
    before: renderReportLines(cleanLines.slice(0, rankingInsertIndex)),
    after: renderReportLines(cleanLines.slice(rankingInsertIndex)),
    hasRanking,
  };
  const headings = cleanLines.map((line, index) => sectionHeading(line.trim()) ? index : -1).filter((index) => index >= 0);
  const splitIndex = headings.length > 1 ? headings[Math.ceil(headings.length / 2)] : Math.max(1, Math.floor(cleanLines.length / 2));
  return {
    before: renderReportLines(cleanLines.slice(0, splitIndex)),
    after: renderReportLines(cleanLines.slice(splitIndex)),
    hasRanking,
  };
};
const renderReport = (content) => {
  const parts = reportParts(content);
  return parts.before + parts.after;
};
const compactRoleCacheEntry = (entry = {}) => {
  const reports = Object.fromEntries(Object.entries(entry.reports || {})
    .slice(-MAX_ROLE_CACHE_REPORTS)
    .map(([name]) => [name, true]));
  return { role: entry.role, sourceSignature: entry.sourceSignature, generatedAt: entry.generatedAt, layoutSkillName: entry.layoutSkillName || "", reports };
};
const readCache = () => {
  try {
    const value = JSON.parse(localStorage.getItem(ROLE_CACHE_KEY) || "{}");
    const normalized = Object.fromEntries(Object.entries(value || {}).map(([role, entry]) => [role, compactRoleCacheEntry(entry)]));
    if (JSON.stringify(normalized) !== JSON.stringify(value)) localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch { return {}; }
};
const writeRoleCache = (role, entry) => {
  try {
    const next = { ...readCache(), [role]: compactRoleCacheEntry(entry) };
    localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(next));
  } catch {}
};
const nameCollator = new Intl.Collator("zh-Hans-CN-u-co-pinyin", { sensitivity: "base", numeric: true });
const unique = (values) => [...new Set(values.map((value) => String(value || "").trim()).filter((value) => value && !["未填写", "未配置", "待配置"].includes(value)))].sort((left, right) => nameCollator.compare(left, right));
const rowValues = (row, fields) => fields.flatMap((field) => String(row?.[field] || "").split(/[、,，;；/\\|]/).map((value) => value.trim()));
// 研发原始表会混入工号、括号说明、末尾“等”及乱码。角色名单只保留可作为
// 单个人员匹配的完整中文姓名；无法恢复的乱码不参与快照或报告生成。
const normalizeRdPersonName = (value) => {
  const candidate = String(value || "").normalize("NFKC").trim()
    .replace(/[（(][^)）]*[）)]/g, "")
    .replace(/[\s\u00a0]/g, "")
    .replace(/(?:等人|等)$/u, "");
  return /^[\u4e00-\u9fff·]{2,6}$/u.test(candidate) ? candidate : "";
};
const isChinesePersonName = (value) => Boolean(normalizeRdPersonName(value));
const sourceRows = (files = [], modules = []) => files.filter((file) => modules.includes(file.module) && file.kind !== "IPQC_LEADER_MAP").flatMap((file) => file.rows || []);
const configFromBrowser = () => {
  try { return JSON.parse(localStorage.getItem("qms-qmdp-system-config-v1") || "{}"); } catch { return {}; }
};
const roleDateValue = (row = {}) => row["日期"] || row["检验日期"] || row["发生日期"] || row["问题日期"] || row["创建时间"] || row["需求日期"] || row["申请日期"] || row["更新日期"] || row["更新时间"] || "";
const roleDateKey = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const normalized = [15, 16].includes(value.getUTCHours())
      ? new Date(value.getTime() + 8 * 60 * 60 * 1000 + 60 * 1000)
      : value;
    return normalized.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && value > 20000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  const text = String(value || "").trim();
  const match = text.match(/(20\d{2})[年\-/](\d{1,2})[月\-/](\d{1,2})/);
  if (match) return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};
const roleValueInPeriod = (value, period = {}) => {
  const key = roleDateKey(value);
  if (!key) return true;
  const year = String(period._periodYear || "2026");
  return key.startsWith(`${year}-`) && (!period._periodStart || key >= period._periodStart) && (!period._periodEnd || key <= period._periodEnd);
};
const roleRowInPeriod = (row, period) => roleValueInPeriod(roleDateValue(row), period);
const periodSpanMonths = (start, end) => {
  const left = new Date(`${start}T00:00:00`); const right = new Date(`${end}T00:00:00`);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return 0;
  return (right.getFullYear() - left.getFullYear()) * 12 + right.getMonth() - left.getMonth() + 1;
};
const isoWeekKey = (dateKey) => {
  const date = new Date(`${dateKey}T00:00:00Z`); if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};
const buildRolePeriodTrend = (rows = [], period = {}) => {
  const year = String(period._periodYear || period.year || "2026");
  const start = year + "-01-01";
  const end = period._periodEnd || period.end || period.end2026 || period.end2025 || (year + "-12-31");
  const makeTrend = (granularity) => {
    const groups = new Map();
    const from = new Date(start + "T00:00:00Z"); const to = new Date(end + "T00:00:00Z");
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null;
    if (granularity === "month") {
      for (let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); cursor <= to; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
        const label = cursor.toISOString().slice(0, 7); groups.set(label, { label, bad: 0, total: 0 });
      }
    } else {
      for (let cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        const label = isoWeekKey(cursor.toISOString().slice(0, 10)); if (label && !groups.has(label)) groups.set(label, { label, bad: 0, total: 0 });
      }
    }
    rows.forEach((row) => {
      const dateKey = roleDateKey(roleDateValue(row)); if (!dateKey || dateKey < start || dateKey > end) return;
      const label = granularity === "month" ? dateKey.slice(0, 7) : isoWeekKey(dateKey); if (!label) return;
      const item = groups.get(label) || { label, bad: 0, total: 0 };
      item.total += 1;
      if (String(row["不良内容"] || "").trim() || String(row["不良类型"] || "").trim()) item.bad += 1;
      groups.set(label, item);
    });
    const ordered = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
    return ordered.length >= 2 ? { granularity, rows: ordered.map((item) => ({ ...item, rate: item.total ? Number((item.bad / item.total * 100).toFixed(2)) : 0 })) } : null;
  };
  return { month: makeTrend("month"), week: makeTrend("week") };
};
const rolePeriodDefaults = (dateRange = {}, year = "2026") => ({
  year,
  start: dateRange[`start${year}`] || `${year}-01-01`,
  end: dateRange[`end${year}`] || `${year}-12-31`,
});

const roleRecipients = (role, data = {}, files = [], preparedRows = {}, preparedIndex = null) => {
  const config = configFromBrowser();
  const orgMappings = (config.orgMappings || []).filter((row) => row.active !== false);
  const ipqc = data.ipqc?.leaderAnalysis?.bySite?.["全公司"] || {};
  const ipqcRows = preparedRows.IPQC || sourceRows(files, ["IPQC"]);
  const rdRows = preparedRows.RD || sourceRows(files, ["OQC", "DQA", "QMS"]);
  const indexedNames = preparedIndex ? [...preparedIndex.keys()] : null;
  if (role === "组装人员") return unique(indexedNames || ipqcRows.flatMap((row) => rowValues(row, roleSpecs[role].fields)));
  if (role === "机长") return unique([...(ipqc.leaders || []).map((row) => row.name), ...(config.supplyMappings || []).map((row) => row.leader)]);
  if (role === "交付经理") return unique([...(ipqc.managers || []).map((row) => row.name), ...(config.supplyMappings || []).map((row) => row.manager)]);
  if (role === "供应链经理") return unique([
    ...ipqcRows.flatMap((row) => rowValues(row, roleSpecs[role].fields)),
    ...(config.supplyMappings || []).flatMap((row) => rowValues(row, ["supplierManager", "供应商经理", "供应链经理"])),
    ...(config.employees || []).filter((row) => /供应商|供应链|SQE|采购/i.test(`${row.dept || ""}${row.role || ""}`)).map((row) => row.name),
    "供应链经理",
  ]);
  if (role === "研发工程师") return unique((indexedNames || rdRows.flatMap((row) => rowValues(row, roleSpecs[role].fields))).map(normalizeRdPersonName).filter(Boolean));
  if (role === "PM") return unique([
    ...orgMappings.flatMap((row) => rowValues(row, ["pm", "PM"])),
  ]);
  if (role === "TPM") return unique([
    ...orgMappings.flatMap((row) => rowValues(row, ["tpm", "TPM"])),
  ]);
  return unique([
    ...orgMappings.flatMap((row) => rowValues(row, ["productionDirector", "产总"])),
  ]);
};

const rdIssueOwnerNames = (row = {}) => ["责任人", "工程师", "研发工程师", "工程师姓名", "责任人/处理人", "责任人\\处理人"]
  .flatMap((field) => rowValues(row, [field]))
  .map(normalizeRdPersonName)
  .filter(Boolean);
const rdIssueEvidenceForRecipient = (recipient, files = [], dateRange = {}) => {
  const rows = sourceRows(files, ["DQA"])
    .filter((row) => String(row["问题描述"] || "").trim())
    .filter((row) => rdIssueOwnerNames(row).includes(recipient))
    .filter((row) => roleRowInPeriod(row, dateRange));
  const categories = new Map();
  rows.forEach((row) => {
    const name = String(row["问题分类"] || row["类别"] || row["问题类型"] || "未分类").trim() || "未分类";
    categories.set(name, (categories.get(name) || 0) + 1);
  });
  return {
    count: rows.length,
    categories: [...categories.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    productDepts: unique(rows.map((row) => row["产品部"])),
    stages: unique(rows.map((row) => row["阶段"])),
    examples: rows.slice(0, 8).map((row) => ({ date: roleDateKey(roleDateValue(row)), category: String(row["问题分类"] || row["类别"] || "未分类").trim(), description: String(row["问题描述"] || "").trim() })),
  };
};

const recipientEvidence = (role, recipient, data, files, dateRange = {}, roleRowIndex = null, dqaAgentMetrics = null) => {
  const spec = roleSpecs[role];
  const config = configFromBrowser();
  const rows = sourceRows(files, spec.modules);
  const indexed = roleRowIndex?.get(recipient);
  const matched = (indexed?.rows || rows.filter((row) => rowValues(row, spec.fields).includes(recipient))).filter((row) => roleRowInPeriod(row, dateRange));
  const ipqcBadRows = spec.modules.includes("IPQC")
    ? matched.filter((row) => String(row["不良内容"] || "").trim() || String(row["不良类型"] || "").trim())
    : [];
  const ipqcMetrics = spec.modules.includes("IPQC") ? {
    inspectedRecords: matched.length,
    badRecords: ipqcBadRows.length,
    goodRecords: matched.length - ipqcBadRows.length,
    issueRecords: ipqcBadRows.length,
    issueRecordDefinition: "IPQC中不良内容或不良类型任一非空的送检记录，每条只计1条问题记录",
    badRate: matched.length ? Number((ipqcBadRows.length / matched.length * 100).toFixed(2)) : 0,
  } : null;
  const yearTrendRows = spec.modules.includes("IPQC")
    ? rows.filter((row) => roleValueInPeriod(roleDateValue(row), { start: String(dateRange._periodYear || "2026") + "-01-01", end: String(dateRange._periodEnd || dateRange.end || dateRange.end2026 || dateRange.end2025 || (String(dateRange._periodYear || "2026") + "-12-31")) }))
    : matched;
  const periodTrend = spec.modules.includes("IPQC") ? buildRolePeriodTrend(yearTrendRows, dateRange) : null;
  const related = role === "机长" ? (data.ipqc?.leaderAnalysis?.bySite?.["全公司"]?.leaders || []).filter((row) => row.name === recipient)
    : role === "交付经理" || role === "供应链经理" ? (data.ipqc?.leaderAnalysis?.bySite?.["全公司"]?.managers || []).filter((row) => row.name === recipient)
      : role === "TPM" ? (data.dqa?.tpmStages || []).filter((row) => row.name === recipient)
        : role === "PM" ? (data.qms?.risks || []).filter((row) => row.pm === recipient).slice(0, 20) : [];
  const categories = {};
  (spec.modules.includes("IPQC") ? ipqcBadRows : role === "研发工程师" ? matched.filter((row) => String(row["问题描述"] || "").trim()) : matched).forEach((row) => {
    const category = String(row["不良类型"] || row["问题类型"] || row["问题分类"] || row["阶段"] || "未分类").trim();
    if (category) categories[category] = (categories[category] || 0) + 1;
  });
  const directResponsibility = spec.modules.includes("IPQC") ? {
    workshops: unique(matched.flatMap((row) => rowValues(row, ["交付工坊", "工坊", "供应商"]))),
    leaders: unique(matched.flatMap((row) => rowValues(row, ["机长", "组长", "班组长"]))),
    deliveryManagers: unique(matched.flatMap((row) => rowValues(row, ["交付经理", "供应商经理", "经理"]))),
  } : null;
  const mapping = role === "组装人员" || role === "机长" || role === "交付经理" || role === "供应链经理"
    ? (config.supplyMappings || []).filter((row) => row.leader === recipient || row.manager === recipient || row.supplierManager === recipient || row.供应链经理 === recipient
      || directResponsibility?.leaders.includes(row.leader) || directResponsibility?.workshops.includes(row.workshop)).slice(0, 30)
    : (config.orgMappings || []).filter((row) => row.pm === recipient || row.tpm === recipient || row.productionDirector === recipient || row.产总 === recipient).slice(0, 30);
  const supplement = files.find((file) => file.subKind === "DQA_ENGINEER_SUPPLEMENT")?.supplement;
  let engineerMetrics = null;
  const rdQualityIssues = role === "研发工程师" ? rdIssueEvidenceForRecipient(recipient, files, dateRange) : null;
  if (role === "研发工程师" && supplement) {
    const inRange = (value) => roleValueInPeriod(value, dateRange);
    const ecn = (supplement.ecnRecords || []).filter((row) => row.engineer === recipient && inRange(row.date));
    const nonBom = (supplement.nonBomRecords || []).filter((row) => row.engineer === recipient && inRange(row.date));
    const reviews = (supplement.reviewRecords || []).filter((row) => inRange(row.updateDate));
    engineerMetrics = {
      ecn: ecn.length,
      ecnMachined: ecn.filter((row) => row.isMachined).length,
      ecnByReason: Object.entries(ecn.reduce((map, row) => { const key = row.reason || row.changeType || "未填写"; map[key] = (map[key] || 0) + 1; return map; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8),
      nonBom: nonBom.length,
      nonBomMachined: nonBom.filter((row) => row.isMachined).length,
      nonBomStandard: nonBom.filter((row) => !row.isMachined).length,
      reviewParticipation: reviews.filter((row) => (row.members || []).includes(recipient)).length,
      reviewSuggestions: reviews.reduce((sum, row) => sum + (row.proposers || []).filter((name) => name === recipient).length, 0),
      machinedDenominator: {
        ecn: data.dqa?.machinedParts?.ecn?.totals?.[2026]?.denominator ?? null,
        nonBom: data.dqa?.machinedParts?.nonBom?.totals?.[2026]?.denominator ?? null,
      },
    };
  }
  // The new ECN/nonBOM import is an Agent-only source. Prefer it for the
  // corresponding fixed indicators without changing legacy DQA statistics.
  if (role === "研发工程师" && dqaAgentMetrics?.byEngineer?.[recipient]) {
    const metrics = dqaAgentMetrics.byEngineer[recipient];
    engineerMetrics = {
      ...(engineerMetrics || {}),
      ecn: metrics.ecnCount,
      ecnMachined: metrics.ecnMachinedCount,
      ecnStandard: metrics.ecnStandardCount,
      ecnByReason: metrics.ecnReasons || [],
      nonBom: metrics.nonBomCount,
      nonBomMachined: metrics.nonBomMachinedCount,
      nonBomStandard: metrics.nonBomStandardCount,
      projectCount: metrics.projectCount,
      bomDenominator: metrics.bomDenominator,
      machinedBomDenominator: metrics.machinedBomDenominator,
      ecnRate: metrics.ecnRate,
      machinedEcnRate: metrics.machinedEcnRate,
      standardEcnRate: metrics.standardEcnRate,
      machinedToStandardEcnRateRatio: metrics.machinedToStandardEcnRateRatio,
      standardBomDenominator: metrics.standardBomDenominator,
      machinedDenominator: { ecn: metrics.machinedBomDenominator ?? null, nonBom: null },
    };
  }
  const topCategoryStats = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count, share: ipqcBadRows.length ? Number((count / ipqcBadRows.length * 100).toFixed(1)) : null }));
  return { role, recipient, modules: spec.modules, matchedRows: role === "研发工程师" ? rdQualityIssues.count : matched.length, ipqcMetrics, periodTrend, topCategories: topCategoryStats.map((item) => item.name), topCategoryStats, related: related.slice(0, 20), directResponsibility, mapping, rdQualityIssues, engineerMetrics };
};

const recurrenceEvidenceForRecipient = (role, recipient, recurrences = [], files = [], dateRange = {}) => {
  const config = configFromBrowser();
  const isSupplyRole = ["组装人员", "机长", "交付经理", "供应链经理"].includes(role);
  const personFields = isSupplyRole ? roleSpecs.组装人员.fields : roleSpecs.研发工程师.fields;
  const rows = sourceRows(files, isSupplyRole ? ["IPQC"] : ["OQC", "DQA", "QMS"]);
  const activeSupplyMappings = (config.supplyMappings || []).filter((row) => row.active !== false);
  const activeOrgMappings = (config.orgMappings || []).filter((row) => row.active !== false);
  const scoped = recurrences.filter((item) => {
    if (!roleValueInPeriod(item.latestOccurredAt, dateRange)) return false;
    if (individualRoles.has(role)) return item.personName === recipient;
    if (role === "供应链经理") return true;
    const personRows = rows.filter((row) => rowValues(row, personFields).includes(item.personName));
    if (role === "机长") return personRows.some((row) => rowValues(row, ["机长", "组长", "班组长"]).includes(recipient));
    if (role === "交付经理") {
      const mappedLeaders = new Set(activeSupplyMappings.filter((row) => row.manager === recipient).map((row) => row.leader).filter(Boolean));
      const mappedWorkshops = new Set(activeSupplyMappings.filter((row) => row.manager === recipient).map((row) => row.workshop).filter(Boolean));
      return personRows.some((row) => rowValues(row, ["交付经理", "供应商经理", "经理"]).includes(recipient)
        || rowValues(row, ["机长", "组长", "班组长"]).some((name) => mappedLeaders.has(name))
        || rowValues(row, ["交付工坊", "工坊", "供应商"]).some((name) => mappedWorkshops.has(name)));
    }
    if (role === "PM") return personRows.some((row) => rowValues(row, ["PM", "项目经理", "项目负责人"]).includes(recipient));
    if (role === "TPM") {
      const mappedPms = new Set(activeOrgMappings.filter((row) => rowValues(row, ["tpm", "TPM"]).includes(recipient)).flatMap((row) => rowValues(row, ["pm", "PM"])));
      return personRows.some((row) => rowValues(row, ["TPM"]).includes(recipient) || rowValues(row, ["PM", "项目经理", "项目负责人"]).some((name) => mappedPms.has(name)));
    }
    if (role === "产总") {
      const mappings = activeOrgMappings.filter((row) => rowValues(row, ["productionDirector", "产总"]).includes(recipient));
      const mappedTpms = new Set(mappings.flatMap((row) => rowValues(row, ["tpm", "TPM"])));
      const mappedPms = new Set(mappings.flatMap((row) => rowValues(row, ["pm", "PM"])));
      return personRows.some((row) => rowValues(row, ["产总", "产品总监", "产品部负责人"]).includes(recipient)
        || rowValues(row, ["TPM"]).some((name) => mappedTpms.has(name))
        || rowValues(row, ["PM", "项目经理", "项目负责人"]).some((name) => mappedPms.has(name)));
    }
    return false;
  });
  const riskOrder = { recurred_after_action: 0, ineffective: 1, recurrent_open: 2, observing: 3, first: 4, effective: 5 };
  const recurrenceGroups = [...scoped]
    .sort((left, right) => (riskOrder[left.state] ?? 9) - (riskOrder[right.state] ?? 9) || Number(right.repeatCount || 0) - Number(left.repeatCount || 0))
    .slice(0, 20)
    .map((item) => ({ personName: item.personName, knowledgeTitle: item.knowledgeTitle, documentName: item.documentName, clauseNumber: item.clauseNumber, occurrenceCount: item.occurrenceCount, repeatCount: item.repeatCount, issueTypes: item.issueTypes || [], latestOccurredAt: item.latestOccurredAt, recurredAfterExam: item.recurredAfterExam, recurredAfterAction: item.recurredAfterAction, state: item.state, stateLabel: item.stateLabel, latestExam: item.latestExam ? { score: item.latestExam.score, passed: item.latestExam.passed, submittedAt: item.latestExam.submittedAt, evidence: item.latestExam.evidence } : null, action: item.action ? { actionType: item.action.actionType, owner: item.action.owner, dueDate: item.action.dueDate, status: item.action.status, effectiveness: item.action.effectiveness, observationUntil: item.action.observationUntil } : null }));
  return {
    evidenceBasis: "仅统计同一人员与同一人工确认规范形成的确定性复发分组",
    scopeType: individualRoles.has(role) ? "本人" : "管理范围下属汇总",
    subordinateCount: new Set(scoped.map((item) => item.personName)).size,
    recurrenceGroupCount: scoped.length,
    recurrenceCount: scoped.reduce((sum, item) => sum + Number(item.repeatCount || 0), 0),
    postExamRecurrenceCount: scoped.filter((item) => item.recurredAfterExam).length,
    afterActionRecurrenceCount: scoped.filter((item) => item.recurredAfterAction).length,
    ineffectiveActionCount: scoped.filter((item) => item.state === "ineffective").length,
    effectiveGroupCount: scoped.filter((item) => item.state === "effective").length,
    recurrenceGroups,
  };
};

const individualRoles = new Set(["组装人员", "研发工程师"]);
const nonRankingRoles = new Set(["供应链经理", "产总"]);
const REPORT_PROMPT_VERSION = "role-report-v8-rd-quality-contract";
const REPORT_VERSION_MARKER = `<!-- qms-agent-role-version:${REPORT_PROMPT_VERSION} -->`;
const reportNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const siteFromValue = (value) => {
  const text = String(value || "");
  if (text.includes("深圳")) return "深圳";
  if (text.includes("杭州")) return "杭州";
  return "";
};
const inferRankingSite = (rows = [], files = [], modules = [], fields = [], recipient = "") => {
  const rowSites = rows.flatMap((row) => [row.__ipqcSite, row.site, row["厂区"], row["基地"], row["区域"]].map(siteFromValue)).filter(Boolean);
  const fileSites = files
    .filter((file) => modules.includes(file.module) && (file.rows || []).some((row) => rowValues(row, fields).includes(recipient)))
    .flatMap((file) => [file.name, file.fileName, file.sourceName].map(siteFromValue)).filter(Boolean);
  const sites = [...new Set([...rowSites, ...fileSites])];
  return sites.length === 1 ? sites[0] : sites.length > 1 ? "多基地" : "";
};
const roleIpqcIssue = (row = {}) => String(row["不良内容"] || "").trim() || String(row["不良类型"] || "").trim() ? 1 : 0;
const roleIpqcQuantity = (row = {}) => Number(row["送检数"] ?? row["治具数量"] ?? 0) || 0;
const roleIpqcManager = (row = {}) => String(row["交付经理"] || row["供应商经理"] || row["经理"] || "").trim();
const aggregateByName = (rows, valueOf) => {
  const grouped = new Map();
  rows.forEach((row) => {
    const name = String(row.name || row.manager || "").trim();
    if (!name) return;
    const current = grouped.get(name) || { name, value: 0, detail: "", sites: new Set() };
    current.value += Math.max(0, reportNumber(valueOf(row)));
    current.detail = row.detail || current.detail;
    const site = siteFromValue(row.site);
    if (site) current.sites.add(site);
    grouped.set(name, current);
  });
  return [...grouped.values()].map(({ sites, ...row }) => ({ ...row, site: sites.size === 1 ? [...sites][0] : sites.size > 1 ? "多基地" : "" }));
};
const buildRoleRanking = (role, recipientNames, selectedRecipient, data, files, dateRange = {}, roleRowIndex = null, preparedRows = null) => {
  const spec = roleSpecs[role] || roleSpecs.组装人员;
  const ipqc = data.ipqc?.leaderAnalysis?.bySite?.["全公司"] || {};
  const periodIpqcRows = (preparedRows || sourceRows(files, ["IPQC"])).filter((row) => roleRowInPeriod(row, dateRange));
  let rows = [];
  if (role === "机长") {
    const grouped = new Map();
    periodIpqcRows.forEach((row) => {
      const name = String(row["机长"] || "").trim();
      if (!name) return;
      const current = grouped.get(name) || { name, issues: 0, qty: 0 };
      current.issues += roleIpqcIssue(row);
      current.qty += roleIpqcQuantity(row);
      grouped.set(name, current);
    });
    rows = grouped.size ? [...grouped.values()].map((row) => ({ ...row, site: inferRankingSite(periodIpqcRows.filter((item) => String(item["机长"] || "").trim() === row.name), files, ["IPQC"], ["机长"], row.name), value: row.issues, detail: `异常 ${row.issues} 项 · 异常率 ${(row.issues / Math.max(row.qty, 1) * 100).toFixed(2)}%` })) : (ipqc.leaders || []).map((row) => ({ name: row.name, site: row.site, value: reportNumber(row.issues), detail: `异常 ${reportNumber(row.issues)} 项 · 异常率 ${reportNumber(row.density).toFixed(2)}%` }));
  } else if (role === "交付经理" || role === "供应链经理") {
    const grouped = new Map();
    periodIpqcRows.forEach((row) => {
      const name = roleIpqcManager(row);
      if (!name) return;
      const current = grouped.get(name) || { name, value: 0, rows: [] };
      current.value += roleIpqcIssue(row);
      current.rows.push(row);
      grouped.set(name, current);
    });
    rows = grouped.size ? [...grouped.values()].map((row) => ({ name: row.name, site: inferRankingSite(row.rows, files, ["IPQC"], ["交付经理", "供应商经理"], row.name), value: row.value, detail: `管理工坊异常 ${row.value} 项` })) : aggregateByName(ipqc.managers || [], (row) => row.y2026Bad ?? row.issues).map((row) => ({ ...row, detail: `管理工坊异常 ${row.value} 项` }));
  } else {
    const source = preparedRows || sourceRows(files, spec.modules);
    rows = recipientNames.map((name) => {
      const matched = (roleRowIndex?.get(name)?.rows || source.filter((row) => rowValues(row, spec.fields).includes(name))).filter((row) => roleRowInPeriod(row, dateRange));
      const categories = new Set(matched.map((row) => String(row["不良类型"] || row["问题类型"] || row["问题分类"] || "").trim()).filter(Boolean));
      if (role === "研发工程师") {
        const qualityRows = matched.filter((row) => String(row["问题描述"] || "").trim());
        return { name, site: inferRankingSite(qualityRows, files, spec.modules, spec.fields, name), value: qualityRows.length, detail: `研发质量问题 ${qualityRows.length} 项` };
      }
      if (role === "组装人员") {
        const issues = matched.reduce((sum, row) => sum + roleIpqcIssue(row), 0);
        return { name, site: inferRankingSite(matched, files, spec.modules, spec.fields, name), value: issues, detail: `送检记录 ${matched.length} 条 / 不良 ${issues} 条 / 合格 ${matched.length - issues} 条${categories.size ? ` · ${[...categories].slice(0, 2).join("、")}` : ""}` };
      }
      return { name, site: inferRankingSite(matched, files, spec.modules, spec.fields, name), value: matched.length, detail: `研发质量记录 ${matched.length} 项${categories.size ? ` · ${[...categories].slice(0, 2).join("、")}` : ""}` };
    });
  }
  recipientNames.forEach((name) => {
    if (name && !rows.some((row) => row.name === name)) rows.push({ name, site: inferRankingSite([], files, spec.modules, spec.fields, name), value: 0, detail: "当前周期暂无直接记录" });
  });
  const sorted = rows.filter((row) => row.name).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "zh-CN"));
  const selected = sorted.find((row) => row.name === selectedRecipient);
  const limited = sorted.slice(0, 12);
  if (selected && !limited.some((row) => row.name === selected.name)) limited.push(selected);
  return limited.map((row) => ({ ...row, rank: sorted.findIndex((item) => item.name === row.name) + 1, total: sorted.length, selected: row.name === selectedRecipient }));
};
const buildSnapshotRankingRows = (ranking = [], selectedRecipient, role) => {
  const rows = Array.isArray(ranking) ? ranking.filter((row) => row?.recipient) : [];
  const limited = rows.slice(0, 12);
  const selected = rows.find((row) => row.recipient === selectedRecipient);
  if (selected && !limited.some((row) => row.recipient === selectedRecipient)) limited.push(selected);
  return limited.map((row) => {
    const rank = rows.findIndex((item) => item.recipient === row.recipient) + 1;
    const rd = role === "研发工程师";
    return {
      name: row.recipient,
      value: Number(row.bad || 0),
      detail: rd ? `研发质量问题 ${Number(row.bad || 0)} 项` : `不良 ${Number(row.bad || 0)} 条 / 总数 ${Number(row.total || 0)} 条 / 不良率 ${Number(row.badRate || 0)}%`,
      rank,
      total: rows.length,
      selected: row.recipient === selectedRecipient,
    };
  });
};

// The model writes the management narrative.  The deterministic statistics and
// visual contract are created here so a skipped JSON block can never remove a
// chart or turn a known count into “待核实”.
const buildRoleVisualSpec = (role, recipient, evidence = {}, rankingRows = []) => {
  const stats = Array.isArray(evidence.topCategoryStats) ? evidence.topCategoryStats : [];
  const total = Number(evidence.ipqcMetrics?.badRecords || 0);
  let cumulative = 0;
  const figures = [];
  const rdMetrics = withDerivedEcnMetrics(evidence.roleSnapshot?.dqaAgentMetrics || evidence.engineerMetrics || {});
  if (["研发工程师", "PM", "TPM", "产总"].includes(role) && Object.keys(rdMetrics).length) {
    const rate = (value) => value != null && Number.isFinite(Number(value)) ? Number((Number(value) * 100).toFixed(2)) : 0;
    figures.push({ id: "rd-ecn-composition", sectionId: "ECN变更活动", intent: "comparison", preferredChart: "clustered-horizontal-bar", title: "ECN物料属性构成", unit: "项", categories: ["加工件", "标准件"], series: [{ name: "ECN", values: [rdMetrics.ecnMachinedCount ?? rdMetrics.ecnMachined ?? 0, rdMetrics.ecnStandardCount ?? 0], axis: "left" }], coverage: "complete", tablePolicy: "replace", accessibilitySummary: `ECN共 ${rdMetrics.ecnCount ?? rdMetrics.ecn ?? 0} 项，其中加工件 ${rdMetrics.ecnMachinedCount ?? rdMetrics.ecnMachined ?? 0} 项、标准件 ${rdMetrics.ecnStandardCount ?? 0} 项；涉及项目 ${rdMetrics.projectCount ?? 0} 个，ECN比例 ${rate(rdMetrics.ecnRate)}%，加工件ECN比例 ${rate(rdMetrics.machinedEcnRate)}%，标准件ECN比例 ${rate(rdMetrics.standardEcnRate)}%。` });
    figures.push({ id: "rd-nonbom-composition", sectionId: "非BOM申请活动", intent: "comparison", preferredChart: "clustered-horizontal-bar", title: "非BOM物料属性构成", unit: "项", categories: ["加工件", "标准件"], series: [{ name: "非BOM", values: [rdMetrics.nonBomMachinedCount ?? rdMetrics.nonBomMachined ?? 0, rdMetrics.nonBomStandardCount ?? rdMetrics.nonBomStandard ?? 0], axis: "left" }], coverage: "complete", tablePolicy: "replace", accessibilitySummary: `非BOM共 ${rdMetrics.nonBomCount ?? rdMetrics.nonBom ?? 0} 项，其中加工件 ${rdMetrics.nonBomMachinedCount ?? rdMetrics.nonBomMachined ?? 0} 项、标准件 ${rdMetrics.nonBomStandardCount ?? rdMetrics.nonBomStandard ?? 0} 项。` });
    const reasons = (rdMetrics.ecnReasons || []).slice(0, 8);
    if (reasons.length) {
      let totalReasons = 0;
      figures.push({ id: "rd-ecn-reason-pareto", sectionId: "ECN变更活动", intent: "pareto", preferredChart: "pareto-column-line", title: "ECN变更原因 Pareto", unit: "项", categories: reasons.map((item) => item.name), series: [{ name: "ECN数量", values: reasons.map((item) => item.count), axis: "left" }, { name: "累计占比", values: reasons.map((item) => { totalReasons += Number(item.count || 0); const total = reasons.reduce((sum, row) => sum + Number(row.count || 0), 0); return total ? Number((totalReasons / total * 100).toFixed(1)) : 0; }), axis: "right", unit: "%" }], coverage: "complete", tablePolicy: "replace", accessibilitySummary: "按变更原因统计ECN数量及累计占比。" });
    }
  }
  if (role === "研发工程师" && evidence.rdQualityIssues) {
    const issues = evidence.rdQualityIssues.categories || [];
    if (issues.length) {
      let accumulated = 0; const total = Number(evidence.rdQualityIssues.count || 0);
      figures.push({ id: "rd-quality-issue-pareto", sectionId: "问题类型分布", intent: "pareto", preferredChart: "pareto-column-line", title: "研发质量问题分类 Pareto", unit: "问题", categories: issues.map((item) => item.name), series: [{ name: "问题数量", values: issues.map((item) => item.count), axis: "left" }, { name: "累计占比", values: issues.map((item) => { accumulated += Number(item.count || 0); return total ? Number((accumulated / total * 100).toFixed(1)) : 0; }), axis: "right", unit: "%" }], coverage: "complete", tablePolicy: "replace", accessibilitySummary: `当前工程师研发质量问题 ${total} 项，按问题分类进行 Pareto 展示；问题分类不等同于已证实根因。` });
    }
    [evidence.rdQualityIssues.periodTrend?.month, evidence.rdQualityIssues.periodTrend?.week].filter(Boolean).forEach((item) => {
      const isMonth = item.granularity === "month";
      figures.push({ id: `rd-quality-${item.granularity}-trend`, sectionId: isMonth ? "月度问题趋势" : "周度问题趋势", intent: "single-series-trend", preferredChart: "line", title: `研发质量问题${isMonth ? "月度" : "周度"}趋势`, unit: "问题", categories: item.rows.map((row) => row.label), series: [{ name: "问题数量", values: item.rows.map((row) => Number(row.count || 0)), axis: "left" }], coverage: "complete", tablePolicy: "replace", accessibilitySummary: `从当年首个${isMonth ? "月" : "周"}到报告截止日，连续展示本人研发质量问题数量；无有效设计输出总量分母，不生成不良率。` });
    });
  }
  if (role === "研发工程师" && rdMetrics && (rdMetrics.reviewParticipation || rdMetrics.reviewSuggestions)) {
    figures.push({ id: "rd-review-contribution", sectionId: "设计评审正向贡献", intent: "positive-contribution", preferredChart: "clustered-horizontal-bar", title: "设计评审正向贡献", unit: "次", categories: ["参与评审", "有效改善项"], series: [{ name: "贡献次数", values: [rdMetrics.reviewParticipation || 0, rdMetrics.reviewSuggestions || 0], axis: "left" }], coverage: "complete", tablePolicy: "replace", accessibilitySummary: `设计评审参与 ${rdMetrics.reviewParticipation || 0} 次，有效改善项 ${rdMetrics.reviewSuggestions || 0} 条；该指标为正向贡献，不与质量问题合并。` });
  }
  if (stats.length && role !== "研发工程师") {
    const values = stats.map((item) => Number(item.count) || 0);
    const accumulated = values.map((value) => { cumulative += value; return total ? Number((cumulative / total * 100).toFixed(1)) : 0; });
    figures.push({ id: "direct-category-pareto", sectionId: "三", intent: "pareto", preferredChart: "pareto-column-line", title: "问题类型 Pareto", unit: "不良记录", categories: stats.map((item) => item.name), series: [{ name: "不良记录", values, axis: "left" }, { name: "累计占比", values: accumulated, axis: "right", unit: "%" }], coverage: "complete", tablePolicy: "replace", accessibilitySummary: `TOP问题类型覆盖 ${total} 条本人不良记录。` });
  }
  [evidence.periodTrend?.month, evidence.periodTrend?.week].filter(Boolean).forEach((trend) => {
    const isMonth = trend.granularity === "month";
    figures.push({ id: `direct-${trend.granularity}-trend`, sectionId: "二", intent: "period-trend", preferredChart: "dual-column-line", title: isMonth ? "月度趋势" : "周度趋势", unit: "记录", categories: trend.rows.map((item) => item.label), series: [{ name: "不良数量", values: trend.rows.map((item) => item.bad), axis: "left" }, { name: "总数量", values: trend.rows.map((item) => item.total), axis: "left" }, { name: "不良率", values: trend.rows.map((item) => item.rate), axis: "right", unit: "%" }], coverage: "complete", tablePolicy: "replace", accessibilitySummary: `${isMonth ? "月度" : "周度"}不良数量、总数量与不良率趋势。` });
  });
  if (rankingRows.length) {
    const metric = role === "研发工程师" ? "研发质量问题" : "不良记录";
    const focus = rankingRows.find((row) => row.selected);
    figures.push({ id: "direct-ranking", sectionId: "排名", intent: "ranking", preferredChart: "clustered-horizontal-bar", title: "个人风险排名", unit: metric, categories: rankingRows.map((row) => ({ name: row.selected && row.rank ? `${row.name} · 第${row.rank}/${row.total}` : row.name, focus: row.selected, site: row.site || "", rank: row.rank, rankTotal: row.total })), series: [{ name: metric, values: rankingRows.map((row) => Number(row.value) || 0), axis: "left" }], coverage: "complete", tablePolicy: "replace", accessibilitySummary: focus ? `${recipient}按${metric}降序排列为第${focus.rank}/${focus.total}名。` : `${recipient}在当前统计周期内按${metric}进行同口径比较。` });
  }
  return { version: "1.0", layoutProfile: "research-briefing-v1", reportKind: "role", subject: { role, name: recipient, scopeType: "direct" }, figures, sourceLimitations: [] };
};
const assertRoleVisualConsistency = (role, evidence = {}, visualSpec = {}) => {
  if (role !== "研发工程师") return;
  const metrics = evidence.roleSnapshot?.dqaAgentMetrics || evidence.engineerMetrics || {};
  const sumFigure = (id) => (visualSpec.figures?.find((figure) => figure.id === id)?.series?.[0]?.values || []).reduce((sum, value) => sum + Number(value || 0), 0);
  const expectedEcn = Number(metrics.ecnCount ?? metrics.ecn ?? 0);
  const expectedNonBom = Number(metrics.nonBomCount ?? metrics.nonBom ?? 0);
  if (sumFigure("rd-ecn-composition") !== expectedEcn || sumFigure("rd-nonbom-composition") !== expectedNonBom) {
    throw new Error("研发工程师报告图表与固定快照口径不一致，请重新生成角色快照");
  }
};
const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const enforceRoleReportFacts = (content = "", evidence = {}, role = "", rankingRows = []) => {
  let next = String(content || "")
    .replace(/^\s*#{1,6}\s*章节标题\s*$/gmi, "")
    .replace(/^\s*-\s*当前排名图表数据：\s*(?:空|暂无排名数据\/待补充)\s*$/gmi, "");
  if (role === "研发工程师") {
    const metrics = withDerivedEcnMetrics(evidence.roleSnapshot?.dqaAgentMetrics || evidence.engineerMetrics || {});
    next = enforceRdEngineerReportFacts(next, evidence, rankingRows, metrics);
  }
  const metrics = evidence.ipqcMetrics;
  if (!metrics) return next;
  next = next.replace(/(\|\s*问题记录数\s*\|\s*)待核实(\s*\|)/gi, `$1${metrics.issueRecords}$2`);
  (evidence.topCategoryStats || []).forEach(({ name, count, share }) => {
    if (!name || !Number.isFinite(Number(share))) return;
    const pattern = new RegExp(`(\\|\\s*${escapeRegExp(name)}\\s*\\|\\s*${Number(count)}\\s*\\|\\s*)待核实(\\s*\\|)`, "g");
    next = next.replace(pattern, `$1${share}%$2`);
  });
  return next;
};

const QMDP_QUESTIONS_KEY = "qms-qmdp-question-bank-v1";
const QMDP_EXAM_SESSIONS_KEY = "qms-qmdp-exam-sessions-v1";
const QMDP_EXAM_RECORDS_KEY = "qms-qmdp-exam-records-v1";
const examRoleForAgent = (role) => role === "组装人员" ? "操作员" : role === "研发工程师" ? "工程师" : "";
const readQuestionBank = () => {
  try { const value = JSON.parse(localStorage.getItem(QMDP_QUESTIONS_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
};
const questionSetForAgent = (role, evidence, confirmedMatches = null) => {
  const roleName = examRoleForAgent(role);
  if (!roleName) return [];
  if (Array.isArray(confirmedMatches) && !confirmedMatches.length) return [];
  const confirmedTerms = (confirmedMatches || []).flatMap((match) => [match.issue?.issueType, match.issue?.issueText, ...(match.issue?.tags || []), ...(match.evidence?.matchedIssueTags || []), ...(match.evidence?.sharedTerms || [])]);
  const confirmedDocumentIds = new Set((confirmedMatches || []).map((match) => String(match.documentId || "")).filter(Boolean));
  const confirmedDocumentNames = new Set((confirmedMatches || []).map((match) => String(match.evidence?.documentName || "").trim()).filter(Boolean));
  const needles = [...new Set([...(evidence?.topCategories || []), ...confirmedTerms, role === "组装人员" ? "IPQC" : "研发", roleName].map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  const aliases = role === "组装人员" ? ["操作员", "ipqc", "过程检验", "组装"] : ["工程师", "研发", "r&d", "dqa"];
  const scored = readQuestionBank().map((question) => {
    const scope = `${question.roles || ""} ${question.applicableRoles || ""} ${question.categories || question.category || ""}`.toLowerCase();
    const text = `${question.stem || question.question || ""} ${question.categories || question.category || ""} ${question.knowledge || ""}`.toLowerCase();
    const roleMatch = !scope.trim() || aliases.some((alias) => scope.includes(alias)) || scope.includes(roleName.toLowerCase());
    const sourceMatch = confirmedMatches == null || confirmedDocumentIds.has(String(question.sourceKnowledgeId || "")) || confirmedDocumentNames.has(String(question.sourceFileName || "").trim());
    const score = needles.reduce((sum, item) => sum + (text.includes(item) ? 3 : 0), 0) + (roleMatch ? 1 : 0) + (sourceMatch && confirmedMatches != null ? 8 : 0);
    return { question, roleMatch, sourceMatch, score };
  }).filter((item) => item.roleMatch && item.sourceMatch).sort((a, b) => b.score - a.score);
  const selected = scored.filter((item) => item.score > 1).slice(0, 3);
  return (selected.length ? selected : scored.slice(0, 3)).map(({ question }) => ({
    questionId: question.id,
    questionText: question.stem || question.question || "",
    stem: question.stem || question.question || "",
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
const examDateText = (value) => { try { return new Date(value).toLocaleString("zh-CN"); } catch { return ""; } };
const readLocalExamResults = (roleName) => {
  try {
    const records = JSON.parse(localStorage.getItem(QMDP_EXAM_RECORDS_KEY) || "[]");
    return (Array.isArray(records) ? records : []).filter((item) => !roleName || item.roleName === roleName);
  } catch { return []; }
};
const latestCompletedExamResults = (records = []) => {
  const byRecipient = new Map();
  [...records]
    .filter((item) => item?.recipientName && (item.status === "completed" || item.submittedAt))
    .sort((left, right) => String(right.submittedAt || "").localeCompare(String(left.submittedAt || "")))
    .forEach((item) => { if (!byRecipient.has(item.recipientName)) byRecipient.set(item.recipientName, item); });
  return byRecipient;
};
const previousExamResultMarkdown = (result) => {
  if (!result) return "\n\n## 上次知识考试结果\n- 暂无已回传考试结果。";
  const total = Number(result.total ?? result.totalQuestions ?? 0);
  const correct = Number(result.correct ?? result.correctAnswers ?? 0);
  const score = Number(result.score ?? 0);
  const passed = result.passed === true || result.isPassed === true;
  const categories = Array.isArray(result.issueCategories) ? result.issueCategories.filter(Boolean).join("、") : "";
  return `\n\n## 上次知识考试结果\n- 上次得分：${score} 分\n- 状态：${passed ? "已通过" : "未通过"}\n- 正确题数：${correct}/${total}\n- 提交时间：${examDateText(result.submittedAt) || "待核实"}${categories ? `\n- 对应问题分类：${categories}` : ""}`;
};
const confirmedKnowledgeMarkdown = (matches = []) => {
  if (!matches.length) return "\n\n## 已确认规范依据\n- 当前问题尚未完成人工规范匹配，暂不推送考试题目。";
  const rows = matches.slice(0, 5).map((match) => `- **${match.evidence?.documentName || "规范"}${match.evidence?.clauseNumber ? ` · ${match.evidence.clauseNumber}` : ""}**：${match.evidence?.candidateTitle || match.evidence?.quote || "已确认条款"}`);
  return `\n\n## 已确认规范依据\n${rows.join("\n")}`;
};
const createAgentExamLink = async (role, recipient, evidence, confirmedMatches = null) => {
  const knowledgeMarkdown = Array.isArray(confirmedMatches) ? confirmedKnowledgeMarkdown(confirmedMatches) : "";
  const questions = questionSetForAgent(role, evidence, confirmedMatches);
  if (!questions.length) return { markdown: `${knowledgeMarkdown}\n\n> 知识考试：${Array.isArray(confirmedMatches) && !confirmedMatches.length ? "请先在知识库完成人工规范匹配。" : "已确认规范对应的题库中暂无可用题目。"}`, questionCount: 0 };
  const roleName = examRoleForAgent(role);
  let token = "";
  let expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
  try {
    const result = await createExamSession({ roleName, recipientName: recipient, issueCategories: evidence?.topCategories || [], knowledgeCandidateKeys: (confirmedMatches || []).map((match) => match.candidateKey).filter(Boolean), knowledgeDocumentIds: (confirmedMatches || []).map((match) => match.documentId).filter(Boolean), issueIds: (confirmedMatches || []).map((match) => match.issue?.id || match.issueId).filter(Boolean), reportId: `AGENT-${Date.now()}`, questions, questionCount: questions.length, validDays: 14 });
    token = result.token;
    expiresAt = result.expiresAt || expiresAt;
  } catch {
    token = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const sessions = JSON.parse(localStorage.getItem(QMDP_EXAM_SESSIONS_KEY) || "[]");
      localStorage.setItem(QMDP_EXAM_SESSIONS_KEY, JSON.stringify([{ token, roleName, recipientName: recipient, issueCategories: evidence?.topCategories || [], knowledgeCandidateKeys: (confirmedMatches || []).map((match) => match.candidateKey).filter(Boolean), knowledgeDocumentIds: (confirmedMatches || []).map((match) => match.documentId).filter(Boolean), issueIds: (confirmedMatches || []).map((match) => match.issue?.id || match.issueId).filter(Boolean), questions, expiresAt, submittedAt: "", result: null }, ...sessions].slice(0, 100)));
    } catch {}
  }
  const url = new URL("/", window.location.origin);
  url.searchParams.set("examToken", token);
  return { markdown: `${knowledgeMarkdown}\n\n## 本次知识考试\n- [打开答题链接](${url.toString()})（${questions.length}题，有效期至 ${examDateText(expiresAt)}）`, questionCount: questions.length, url: url.toString() };
};

const baselineForRole = (reports, modules) => modules.flatMap((module) => {
  const candidates = reports.filter((item) => item.module === module || String(item.fileName || "").includes(`QMS-Agent报告-${module}-`));
  return candidates.sort((left, right) => String(right.updatedAt || right.updated_at || "").localeCompare(String(left.updatedAt || left.updated_at || ""))).slice(0, 1);
});
const baselineMatchesModule = (item, module) => item?.module === module || String(item?.fileName || "").includes(`QMS-Agent报告-${module}-`) || String(item?.fileName || "").includes(`外部导入-${module}-`);
const hasCompleteBaseline = (files, modules) => modules.every((module) => files.some((item) => baselineMatchesModule(item, module)));
const reportRecipientFromFile = (fileName, role) => {
  const prefix = `QMS-Agent报告-角色报告-${role}-`;
  const value = String(fileName || "");
  if (!value.startsWith(prefix)) return "";
  return value.slice(prefix.length)
    .replace(/-\d{8}-\d{6}-\d{3}\.md$/i, "")
    .replace(/^quality-report-layout-(?:apple|notion)-/, "")
    .replace(new RegExp(`^${String(role).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-`), "")
    .trim();
};
const roleReportTimeLabel = (value) => {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const roleReportPeriodLabel = (period = {}) => {
  const start = period._periodStart || period.start || "";
  const end = period._periodEnd || period.end || "";
  return start && end ? `${start}—${end}` : "周期未记录";
};
const roleHistoryLabel = (item) => `${item.localOnly ? "本机" : "服务器"} · ${item.fileName || "未命名报告"}${item.updatedAt || item.savedAt ? ` · ${roleReportTimeLabel(item.updatedAt || item.savedAt)}` : ""}`;
const roleRecipientCacheKey = (role, files = []) => JSON.stringify({
  version: "rd-name-clean-v2",
  role,
  files: (files || []).map((file) => ({
    module: file.module,
    name: file.name,
    subKind: file.subKind || "",
    rows: Array.isArray(file.rows) ? file.rows.length : 0,
    importedAt: file.importedAt || file.updatedAt || file.updated_at || "",
  })),
});
const renderRoleRankingChartMarkup = ({ rows = [], title = "排名", metric = "质量记录", role = "", recipient = "", period = {} }) => {
  const selected = rows.find((row) => row.selected);
  const visibleRows = rows.length <= 20 ? rows : [...rows.slice(0, 19), ...(selected && !rows.slice(0, 19).includes(selected) ? [selected] : [])];
  if (!visibleRows.length) return "";
  const max = Math.max(...visibleRows.map((row) => Number(row.value) || 0), 1);
  const bars = visibleRows.map((row) => {
    const width = Math.max(4, Math.round(((Number(row.value) || 0) / max) * 100));
    const color = row.selected ? "#ef4f4f" : row.site === "深圳" ? "#2f7ee6" : row.site === "杭州" ? "#8b67c7" : "#64748b";
    const name = row.displayName || (row.site && row.site !== "多基地" ? `${row.site} · ${row.name}` : row.name);
    return `<div class="agent-role-ranking-row"><strong>${escapeHtml(String(row.rank || ""))}</strong><span>${escapeHtml(name || "未命名")}</span><div class="agent-role-ranking-bar"><i style="width:${width}%;background:${color}"></i></div><b>${escapeHtml(String(row.value ?? ""))}</b></div>`;
  }).join("");
  return `<section class="agent-role-ranking-chart"><header><strong>${escapeHtml(title)}</strong><span>${escapeHtml(metric)} · 当前对象以红色标识${rows.length > visibleRows.length ? ` · 共 ${rows.length} 条，图表显示重点 ${visibleRows.length} 条` : ""}</span></header><div class="agent-role-ranking-shell">${bars}</div></section>`;
};
const injectRoleRankingChart = (html = "", chartHtml = "") => {
  if (!chartHtml) return html;
  // Publisher mode adds an id before class, so class cannot be the first
  // attribute. Insert directly below the ranking heading and retain any
  // explanatory text the model produced below the chart.
  const pattern = /(<section\b(?=[^>]*\bclass="[^"]*agent-report-section[^"]*")[^>]*>\s*<(?:h4|h5)[^>]*>[^<]*排名[^<]*<\/(?:h4|h5)>)/i;
  if (pattern.test(html)) return html.replace(pattern, `$1${chartHtml}`);
  return `${html}${chartHtml}`;
};
const buildRoleRowIndex = (rows, fields) => {
  const index = new Map();
  rows.forEach((row) => {
    unique(rowValues(row, fields)).forEach((name) => {
      const entry = index.get(name) || { rows: [], categories: new Map() };
      entry.rows.push(row);
      const category = String(row["不良类型"] || row["问题类型"] || row["问题分类"] || row["阶段"] || "未分类").trim();
      if (category) entry.categories.set(category, (entry.categories.get(category) || 0) + 1);
      index.set(name, entry);
    });
  });
  return index;
};
const roleSourceSignature = (role, spec, baselineFiles, recipients, dateRange, sourceRevision = "", skillName = "", skillContent = "") => JSON.stringify({ version: REPORT_PROMPT_VERSION, role, modules: spec.modules, baseline: baselineFiles.map((item) => ({ fileName: item.fileName, updatedAt: item.updatedAt || item.updated_at || "", imported: Boolean(item.imported) })), recipients, period: dateRange, sourceRevision, skillName, skillContent });

export function AgentRoleReportPage({ initialRole = "组装人员", data = {}, files = [], dateRange = {}, onEnsureAgentSources, canGenerate = false, canSaveToServer = false, creatorIp = "" }) {
  const role = initialRole;
  const spec = roleSpecs[role] || roleSpecs.组装人员;
  const roleSkillId = roleSkillIds[role] || "quality-role-assembly-person";
  const [agentFiles, setAgentFiles] = useState(files);
  const roleFiles = useMemo(() => role === "研发工程师" ? agentFiles : agentFiles.filter((file) => file.subKind !== "DQA_ENGINEER_SUPPLEMENT"), [role, agentFiles]);
  const [period, setPeriod] = useState(() => rolePeriodDefaults(dateRange));
  const [projectReports, setProjectReports] = useState([]);
  const [baseline, setBaseline] = useState({ contents: {}, files: [] });
  const [cacheEntry, setCacheEntry] = useState(() => readCache()[role] || null);
  const [savedRoleReports, setSavedRoleReports] = useState([]);
  const [selectedHistoryKey, setSelectedHistoryKey] = useState("current");
  const [savedRoleContent, setSavedRoleContent] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const [localReportRecipients, setLocalReportRecipients] = useState([]);
  const [historyState, setHistoryState] = useState({ status: "idle", message: "" });
  const [roleSkill, setRoleSkill] = useState(() => ({ name: roleSkillId, content: fallbackRoleSkill(role) }));
  const [roleSkills, setRoleSkills] = useState([]);
  const [layoutSkills] = useState(REPORT_PRESENTATION_PROFILES);
  const [layoutSkillName, setLayoutSkillName] = useState(initialRoleLayout);
  const [recipient, setRecipient] = useState("");
  const [recipientPickerQuery, setRecipientPickerQuery] = useState("");
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientRenderLimit, setRecipientRenderLimit] = useState(120);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [recipientSelectionTouched, setRecipientSelectionTouched] = useState(false);
  const [lastGeneratedModel, setLastGeneratedModel] = useState("");
  const [resolvedCreatorIp, setResolvedCreatorIp] = useState("");
  const [state, setState] = useState({ status: "idle", message: "" });
  const [sourceState, setSourceState] = useState({ status: "idle", message: "" });
  const [roleSnapshotRegistry, setRoleSnapshotRegistry] = useState(null);
  const [dqaAgentRaw, setDqaAgentRaw] = useState(null);
  const [qualityRules, setQualityRules] = useState(DEFAULT_REPORT_QUALITY_RULES);
  const [showQualityDetails, setShowQualityDetails] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ visible: false, recipientNames: [], completedNames: [], currentName: "", total: 0, phase: "", detail: "" });
  const abortRef = useRef(null);
  const historyRequestIdRef = useRef(0);
  // The role snapshot registry can contain hundreds of full person snapshots.
  // Keep only its index on first paint; the full payload is required only by
  // an explicit report-generation request.
  const recipientManualClearRef = useRef(false);
  const deferredRecipientSearch = useDeferredValue(recipientSearch);
  const selectRecipient = useCallback((name) => {
    // Unmount the previous report in the same event as the person switch.
    // Otherwise React briefly renders the old report against the new person,
    // which makes consecutive selections much slower than the first one.
    historyRequestIdRef.current += 1;
    setSelectedHistoryKey("current");
    setSavedRoleContent("");
    setSavedRoleReports([]);
    setHistoryState({ status: name ? "loading" : "idle", message: name ? "正在读取历史报告…" : "" });
    setRecipient(name);
  }, []);
  useEffect(() => { loadCurrentUser().then((user) => setResolvedCreatorIp(String(user?.ip || ""))).catch(() => {}); }, []);
  useEffect(() => { let active = true; loadQualityAgentRoleSnapshotRegistry({ indexOnly: true }).then((value) => { if (active) setRoleSnapshotRegistry(normalizeRoleSnapshotRegistry(value || null)); }).catch(() => {}); return () => { active = false; }; }, [role]);
  // DQA ECN/non-BOM detail is about 70k rows. It is evidence for generating
  // R&D reports, not data needed to draw this page shell, so never fetch it
  // during navigation.
  useEffect(() => { let active = true; loadReportQualityRules().then((value) => { if (active && Array.isArray(value?.rules)) setQualityRules(value.rules); }).catch(() => {}); return () => { active = false; }; }, []);
  useEffect(() => {
    setAgentFiles((current) => {
      const keep = (source) => spec.modules.includes(source.module) || (role === "研发工程师" && source.subKind === "DQA_ENGINEER_SUPPLEMENT");
      const byKey = new Map();
      [...files.filter(keep), ...current.filter(keep)].forEach((source) => {
        const key = `${source.module}::${source.name}`;
        const previous = byKey.get(key);
        const previousRows = Array.isArray(previous?.rows) ? previous.rows.length : 0;
        const nextRows = Array.isArray(source.rows) ? source.rows.length : 0;
        if (!previous || nextRows >= previousRows) byKey.set(key, source);
      });
      return [...byKey.values()];
    });
  }, [files, role, spec.modules]);
  useEffect(() => {
    setSourceState({ status: "ready", message: canGenerate ? "原始数据将在生成时加载" : "当前账号仅读取已保存报告" });
  }, [role, canGenerate]);
  const snapshotRecipients = useMemo(() => unique((roleSnapshotRegistry?.history || [])
    .filter((entry) => entry.role === role && entry.active !== false)
    .flatMap((entry) => Array.isArray(entry.recipients) ? entry.recipients : [])), [roleSnapshotRegistry, role]);
  const currentCacheContent = typeof cacheEntry?.reports?.[recipient] === "string" ? cacheEntry.reports[recipient] : "";
  const recipientCacheKey = useMemo(() => roleRecipientCacheKey(role, roleFiles), [role, roleFiles]);
  const viewingHistoricalReport = selectedHistoryKey !== "current";
  const needsRecipientDiscovery = !snapshotRecipients.length && !ROLE_RECIPIENT_CACHE.has(recipientCacheKey);
  const shouldHydrateRoleRows = needsRecipientDiscovery || (!viewingHistoricalReport && Boolean(currentCacheContent));
  // A saved history report already contains its fixed statistics and visual
  // contract. Never flatten DQA/OQC/QMS raw rows merely to display that report.
  const roleRows = useMemo(() => shouldHydrateRoleRows ? sourceRows(roleFiles, spec.modules) : [], [shouldHydrateRoleRows, roleFiles, spec.modules]);
  const sourceReady = useMemo(() => spec.modules.every((module) => roleFiles.some((file) => file.module === module
    && file.kind !== "IPQC_LEADER_MAP"
    && Array.isArray(file.rows)
    && file.rows.length)), [roleFiles, spec.modules]);
  const preparedRows = useMemo(() => (spec.modules.includes("IPQC") ? { IPQC: roleRows } : { RD: roleRows }), [spec.modules, roleRows]);
  // Manager pages do not need a recipient index to render the initial shell.
  // Individual pages also defer this potentially large map until a report is
  // actually selected; the picker can list names directly from source rows.
  const roleRowIndex = useMemo(() => individualRoles.has(role) && shouldHydrateRoleRows
    ? buildRoleRowIndex(roleRows, spec.fields)
    : null, [role, shouldHydrateRoleRows, roleRows, spec.fields]);
  const sourceRecipients = useMemo(() => {
    if (snapshotRecipients.length) return snapshotRecipients;
    const cached = ROLE_RECIPIENT_CACHE.get(recipientCacheKey);
    if (cached) return cached;
    const value = roleRecipients(role, data, roleFiles, preparedRows, roleRowIndex);
    ROLE_RECIPIENT_CACHE.set(recipientCacheKey, value);
    return value;
  }, [snapshotRecipients, recipientCacheKey, role, data, roleFiles, preparedRows, roleRowIndex]);
  const reportRecipients = useMemo(() => unique([
    ...Object.keys(cacheEntry?.reports || {}),
    ...projectReports.map((item) => item.recipient || reportRecipientFromFile(item.fileName, role)),
    ...localReportRecipients.filter((item) => item.module === `角色报告-${role}`).map((item) => item.recipient),
  ]), [cacheEntry, projectReports, role, historyRevision, localReportRecipients]);
  const dqaAgentMetrics = useMemo(() => dqaAgentRaw && ["研发工程师", "PM", "TPM", "产总"].includes(role)
    ? buildDqaAgentRawMetrics(dqaAgentRaw, { start: period.start, end: period.end }) : null, [dqaAgentRaw, role, period.start, period.end]);
  const rawRecipients = useMemo(() => {
    if (!dqaAgentMetrics) return [];
    if (role === "研发工程师") return Object.keys(dqaAgentMetrics.byEngineer || {}).map(normalizeRdPersonName).filter(Boolean);
    if (role === "PM") return unique(dqaAgentMetrics.records.map((row) => row.pm));
    if (role === "TPM") return unique(dqaAgentMetrics.records.map((row) => row.tpm));
    return [];
  }, [dqaAgentMetrics, role]);
  const recipients = useMemo(() => unique([...(sourceRecipients.length ? sourceRecipients : reportRecipients), ...rawRecipients]
    .map((name) => role === "研发工程师" ? normalizeRdPersonName(name) : name).filter(Boolean)), [sourceRecipients, reportRecipients, rawRecipients, role]);
  const visibleRecipientNames = useMemo(() => {
    const keyword = deferredRecipientSearch.trim().toLocaleLowerCase();
    const filtered = keyword
      ? recipients.filter((name) => String(name).toLocaleLowerCase().includes(keyword))
      : recipients;
    return filtered.slice(0, Math.min(filtered.length, recipientRenderLimit));
  }, [recipients, deferredRecipientSearch, recipientRenderLimit]);
  // Native select options are kept complete so every person remains directly
  // selectable; only the checkbox chip grid is windowed for first paint.
  const recipientSelectNames = recipients;
  const recipientPickerOptions = useMemo(() => {
    const keyword = recipientPickerQuery.trim().toLocaleLowerCase();
    const filtered = keyword
      ? recipientSelectNames.filter((name) => String(name).toLocaleLowerCase().includes(keyword))
      : recipientSelectNames;
    return filtered;
  }, [recipientPickerQuery, recipientSelectNames]);
  const selectedRecipientSet = useMemo(() => new Set(selectedRecipients), [selectedRecipients]);
  const generationRecipients = useMemo(() => recipients.filter((name) => selectedRecipientSet.has(name)), [recipients, selectedRecipientSet]);
  const roleDateRange = useMemo(() => ({ ...dateRange, _periodYear: period.year, _periodStart: period.start, _periodEnd: period.end }), [dateRange, period]);
  const roleRule = roleSnapshotRegistry?.rules?.find((item) => item.role === role);
  // The first-page registry is intentionally index-only and has no snapshot
  // bodies. Validity therefore comes from its role/period/person index; the
  // single full snapshot is fetched only when generation starts.
  const selectedRoleSnapshotIndex = useMemo(() => (roleSnapshotRegistry?.history || [])
    .filter((entry) => entry.active !== false && entry.role === role && entry.period?.start === period.start && entry.period?.end === period.end)
    .filter((entry) => !recipient || (entry.recipients || []).includes(recipient))
    .sort((left, right) => String(right.generatedAt || "").localeCompare(String(left.generatedAt || "")))[0] || null, [roleSnapshotRegistry, role, recipient, period.start, period.end]);
  const selectedRoleSnapshot = selectedRoleSnapshotIndex;
  const roleSnapshotTrace = roleSnapshotRegistry
    ? (selectedRoleSnapshot
      ? { status: "matched", label: "已命中有效角色快照", detail: `${role} · ${selectedRoleSnapshotIndex?.period?.granularity === "range" ? "总周期" : selectedRoleSnapshotIndex?.period?.periodKey || "当前周期"}`, meta: `当前人员：${recipient} · 固定数据已就绪` }
      : { status: "missing", label: recipient ? "未命中有效角色快照" : "等待选择人员", detail: recipient ? "当前人员或统计周期没有有效快照" : "选择人员后显示快照匹配状态", meta: recipient ? "本次生成将回退到确定性人员证据" : "" })
    : { status: "loading", label: "正在读取角色快照注册表", detail: "尚未完成角色快照匹配", meta: "" };
  const sourceRevision = useMemo(() => {
    const source = roleFiles.find((file) => file.subKind === "DQA_ENGINEER_SUPPLEMENT");
    const legacy = source ? `${source.importedAt || ""}:${source.rowCount || source.rows?.length || 0}` : "";
    const raw = (dqaAgentRaw?.files || []).map((file) => `${file.sourceId || file.name}:${file.importedAt || ""}:${file.rowCount || 0}`).sort().join("|");
    return `${legacy}|${raw}`;
  }, [roleFiles, dqaAgentRaw]);
  const sourceSignature = useMemo(() => roleSourceSignature(role, spec, baseline.files, recipients, roleDateRange, sourceRevision, roleSkill.name, roleSkill.content), [role, spec, baseline.files, recipients, roleDateRange, sourceRevision, roleSkill]);
  const selectedHistoryReport = savedRoleReports.find((item) => item.historyKey === selectedHistoryKey) || null;
  const selectedContent = selectedHistoryKey === "current" ? currentCacheContent : savedRoleContent;
  const reportLayoutChanged = false;
  const cachedComplete = !reportLayoutChanged && cacheEntry?.sourceSignature === sourceSignature && recipients.length > 0 && recipients.every((name) => cacheEntry.reports?.[name]);
  const selectedCachedComplete = !reportLayoutChanged && cacheEntry?.sourceSignature === sourceSignature && generationRecipients.length > 0 && generationRecipients.every((name) => cacheEntry.reports?.[name]);
  const activeReportLayoutClass = reportLayoutClass(layoutSkillName);
  const generationScopeLabel = generationRecipients.length === recipients.length && recipients.length
    ? "全部人员"
    : `已选 ${generationRecipients.length}/${recipients.length || 0} 人`;

  // Saving a report succeeds before the next report-library poll. Merge that
  // authoritative response immediately so the current page, selector and
  // history list never require a manual browser refresh.
  const registerSavedRoleReport = (saved = {}, content = "", recipientName = "", updateLibrary = true) => {
    const entry = {
      ...saved,
      module: saved.module || `角色报告-${role}`,
      role: saved.role || role,
      recipient: saved.recipient || recipientName,
      content: String(content || saved.content || ""),
      visualSpec: saved.visualSpec || extractReportVisualSpec(content || ""),
      updatedAt: saved.updatedAt || saved.savedAt || new Date().toISOString(),
      savedAt: saved.savedAt || new Date().toISOString(),
      localOnly: saved.localOnly === true || !canSaveToServer,
    };
    if (!entry.fileName) return;
    if (entry.localOnly) {
      const metadata = { ...entry };
      delete metadata.content;
      if (updateLibrary) setLocalReportRecipients((current) => [metadata, ...current.filter((item) => item.fileName !== entry.fileName)]);
    } else if (updateLibrary) {
      const metadata = { ...entry };
      delete metadata.content;
      setProjectReports((current) => [metadata, ...current.filter((item) => item.fileName !== entry.fileName)]);
    }
    if (entry.recipient === recipient) {
      const historyEntry = { ...entry, historyKey: `${entry.localOnly ? "local" : "server"}:${entry.fileName}` };
      setSavedRoleReports((current) => [historyEntry, ...current.filter((item) => item.historyKey !== historyEntry.historyKey && item.fileName !== entry.fileName)]);
      setSavedRoleContent(entry.content);
      setSelectedHistoryKey(historyEntry.historyKey);
      setHistoryState({ status: "done", message: "已生成并加载最新报告" });
    }
  };

  const refresh = async ({ loadContents = false, silent = false } = {}) => {
    if (!silent) setState({ status: "running", message: loadContents ? "正在读取 Agent 基线报告…" : "正在读取角色报告索引…" });
    try {
      let next = [];
      let serverReadError = "";
      try {
        // Only fetch this role's baseline modules and history. Fetching the
        // entire report library made every role page slower as reports grew.
        const moduleRequests = spec.modules.map((module) => loadAgentReports({ module }));
        const roleRequest = loadAgentReports({ module: `角色报告-${role}`, role });
        const values = await Promise.all([...moduleRequests, roleRequest]);
        const merged = values.flatMap((value) => Array.isArray(value?.reports) ? value.reports : []);
        next = [...new Map(merged.map((item) => [item.fileName, item])).values()];
      } catch (error) {
        serverReadError = error?.message || "项目报告库暂不可用";
      }
      const required = baselineForRole(next, spec.modules);
      const imported = loadImportedAgentReports();
      const importedFiles = spec.modules.flatMap((module) => {
        const reports = Array.isArray(imported?.[module]) ? imported[module] : [];
        const latest = [...reports].sort((a, b) => String(b.importedAt || "").localeCompare(String(a.importedAt || "")))[0];
        return latest?.content
          ? [{ module, fileName: `外部导入-${module}-${latest.fileName || "Agent报告"}`, content: latest.content, imported: true, updatedAt: latest.importedAt || "" }]
          : [];
      });
      const localRuns = loadQualityAgentRuns();
      const localFiles = spec.modules.filter((module) => !required.some((item) => item.fileName.includes(`QMS-Agent报告-${module}-`)) && localRuns[module]?.content)
        .map((module) => ({ fileName: `本地缓存-${module}-Agent报告.md`, module }));
      const allRequired = [...importedFiles, ...required, ...localFiles];
      // Listing reports is cheap. Their Markdown bodies are intentionally
      // deferred until the user starts a generation, otherwise every role
      // page downloads all of its baseline reports during navigation.
      const loaded = loadContents ? await Promise.all(allRequired.map(async (item) => {
        if (item.content) return [item.fileName, item.content];
        if (item.module && localRuns[item.module]?.content) return [item.fileName, localRuns[item.module].content];
        try {
          return [item.fileName, (await loadAgentReport(item.fileName)).content || ""];
        } catch {
          return [item.fileName, ""];
        }
      })) : [];
      setProjectReports(next);
      const nextBaseline = { files: allRequired, contents: loadContents ? Object.fromEntries(loaded) : {} };
      setBaseline(nextBaseline);
      const missing = spec.modules.filter((module) => !allRequired.some((item) => baselineMatchesModule(item, module)));
      if (!silent) setState({ status: missing.length ? "idle" : "done", message: missing.length ? `缺少基线：${missing.join("、")}${serverReadError ? "（项目报告库暂不可用，可使用外部导入或本地缓存）" : ""}` : loadContents ? `基线已就绪（支持项目保存、外部导入和本地缓存）${serverReadError ? " · 项目报告库暂不可用" : ""}` : "角色页索引已就绪，原始数据与报告正文将在生成时读取" });
      return nextBaseline;
    } catch (error) { if (!silent) setState({ status: "error", message: `读取基线失败：${error.message}` }); return null; }
  };
  useEffect(() => {
    let active = true;
    loadAgentSkills().then((value) => {
      const skills = Array.isArray(value?.skills) ? value.skills : [];
      if (!active) return;
      const roleOnly = skills.filter((item) => String(item.name || item.id || "").startsWith("quality-role-"));
      setRoleSkills(roleOnly);
      const selected = roleOnly.find((item) => item.id === roleSkillId || item.name === roleSkillId);
      if (selected) setRoleSkill({ name: selected.name || selected.id || roleSkillId, content: selected.content || fallbackRoleSkill(role) });
    }).catch(() => {});
    return () => { active = false; };
  }, [role, roleSkillId]);
  useEffect(() => {
    localStorage.setItem(ROLE_LAYOUT_STORAGE_KEY, layoutSkillName);
  }, [layoutSkillName]);
  useEffect(() => {
    setSavedRoleReports([]);
    setSavedRoleContent("");
    setSelectedHistoryKey("current");
    setCacheEntry(readCache()[role] || null);
    setRecipient("");
    recipientManualClearRef.current = false;
    setRecipientPickerQuery("");
    setRecipientPickerOpen(false);
    setRecipientSearch("");
    setRecipientRenderLimit(120);
    setSelectedRecipients([]);
    setRecipientSelectionTouched(false);
    refresh({ loadContents: false });
  }, [role]);
  useEffect(() => {
    setSelectedRecipients((current) => {
      const next = recipientSelectionTouched ? current.filter((name) => recipients.includes(name)) : recipients;
      return next.length === current.length && next.every((name, index) => name === current[index]) ? current : next;
    });
  }, [recipients, recipientSelectionTouched]);
  useEffect(() => {
    let active = true;
    loadLocalAgentReports().then((items) => { if (active) setLocalReportRecipients(Array.isArray(items) ? items : []); }).catch(() => { if (active) setLocalReportRecipients([]); });
    return () => { active = false; };
  }, [role, historyRevision]);
  useEffect(() => {
    const names = recipients;
    if (recipient && !names.includes(recipient)) {
      recipientManualClearRef.current = false;
      setRecipient(names[0] || "");
    } else if (!recipient && !recipientManualClearRef.current) {
      setRecipient(names[0] || "");
    }
  // Default-select only on initial load or when a selected person disappears.
  // A deliberate clear must remain blank for both individual-role pages.
  }, [recipients]);
  useEffect(() => { setRecipientPickerQuery(recipient || ""); }, [recipient]);
  useEffect(() => {
    // Changing a person must never implicitly download and render the latest
    // saved report. Keep the selector on its lightweight "current" entry
    // until the user explicitly picks a history version.
    historyRequestIdRef.current += 1;
    setSelectedHistoryKey("current");
    setSavedRoleContent("");
  }, [role, recipient]);
  useEffect(() => {
    setPeriod((current) => current.start && current.end ? current : rolePeriodDefaults(dateRange, current.year));
  }, [dateRange.start2025, dateRange.end2025, dateRange.start2026, dateRange.end2026]);
  useEffect(() => {
    let active = true;
    if (!recipient) {
      setSavedRoleReports([]);
      setSavedRoleContent("");
      setSelectedHistoryKey("current");
      setHistoryState({ status: "idle", message: "" });
      return () => { active = false; };
    }
    setHistoryState({ status: "loading", message: "正在读取历史报告…" });
    // refresh() and the local-index effect already loaded the report indexes.
    // Filter those arrays in memory instead of hitting the server and IndexedDB
    // on every person selection.
    const local = localReportRecipients
      .filter((item) => item.module === `角色报告-${role}` && item.recipient === recipient)
      .map((item) => ({ ...item, localOnly: true, historyKey: `local:${item.fileName}` }));
    const server = projectReports
      .filter((item) => item.module === `角色报告-${role}` && item.role === role && item.recipient === recipient)
      .map((item) => ({ ...item, localOnly: false, historyKey: `server:${item.fileName}` }));
    const merged = [...local, ...server]
      .sort((left, right) => String(right.updatedAt || right.savedAt || "").localeCompare(String(left.updatedAt || left.savedAt || "")));
    setSavedRoleReports(merged);
    if (!merged.length) {
      setSelectedHistoryKey("current");
      setSavedRoleContent("");
      setHistoryState({ status: "done", message: "暂无历史报告" });
      return () => { active = false; };
    }
    const latest = merged[0];
    const requestId = ++historyRequestIdRef.current;
    setSelectedHistoryKey(latest.historyKey);
    setHistoryState({ status: "loading", message: "正在加载最新报告…" });
    loadRoleHistoryDetail(latest)
      .then((value) => {
        if (!active || historyRequestIdRef.current !== requestId) return;
        const content = String(value?.content || "");
        if (!content.trim()) {
          setSavedRoleContent("");
          setHistoryState({ status: "error", message: "最新历史报告内容为空" });
          return;
        }
        setSavedRoleReports((current) => current.map((item) => item.historyKey === latest.historyKey
          ? { ...item, visualSpec: value?.visualSpec || item.visualSpec, period: value?.period || item.period, model: value?.model || item.model, layoutProfileId: value?.layoutProfileId || item.layoutProfileId }
          : item));
        setSavedRoleContent(content);
        setHistoryState({ status: "done", message: `已加载最新报告 · 共 ${merged.length} 份` });
      })
      .catch((error) => {
        if (!active || historyRequestIdRef.current !== requestId) return;
        setSavedRoleContent("");
        setHistoryState({ status: "error", message: `最新报告加载失败：${error.message}` });
      });
    return () => { active = false; };
  }, [role, recipient, historyRevision, projectReports, localReportRecipients]);
  const openHistoryReport = useCallback((historyKey) => {
    const requestId = ++historyRequestIdRef.current;
    setSelectedHistoryKey(historyKey);
    if (historyKey === "current") {
      setSavedRoleContent("");
      return;
    }
    const selected = savedRoleReports.find((item) => item.historyKey === historyKey);
    if (!selected) {
      setSavedRoleContent("");
      setHistoryState({ status: "error", message: "所选历史报告索引已更新，请重新选择" });
      return;
    }
    if (selected.content) {
      setSavedRoleContent(selected.content);
      setHistoryState({ status: "done", message: `已加载 ${roleReportTimeLabel(selected.updatedAt)}` });
      return;
    }
    setSavedRoleContent("");
    setHistoryState((current) => ({ ...current, status: "loading", message: "正在加载所选历史报告…" }));
    loadRoleHistoryDetail(selected)
      .then((value) => {
        if (historyRequestIdRef.current !== requestId) return;
        const content = String(value?.content || "");
        if (!content.trim()) {
          setSavedRoleContent("");
          setHistoryState({ status: "error", message: "历史报告内容为空，可能是服务器报告文件不完整" });
          return;
        }
        setSavedRoleReports((current) => current.map((item) => item.historyKey === selected.historyKey
          ? { ...item, visualSpec: value?.visualSpec || item.visualSpec, period: value?.period || item.period, model: value?.model || item.model, layoutProfileId: value?.layoutProfileId || item.layoutProfileId }
          : item));
        setSavedRoleContent(content);
        setHistoryState({ status: "done", message: `已加载 ${roleReportTimeLabel(selected.updatedAt)}` });
      })
      .catch((error) => {
        if (historyRequestIdRef.current !== requestId) return;
        setSavedRoleContent("");
        setHistoryState({ status: "error", message: `历史报告加载失败：${error.message}` });
      });
  }, [savedRoleReports]);

  const toggleGenerationRecipient = useCallback((name) => {
    setRecipientSelectionTouched(true);
    setSelectedRecipients((current) => current.includes(name)
      ? current.filter((item) => item !== name)
      : [...current, name]);
  }, []);
  const selectAllGenerationRecipients = () => {
    setRecipientSelectionTouched(true);
    setSelectedRecipients(recipients);
  };
  const clearGenerationRecipients = () => {
    setRecipientSelectionTouched(true);
    setSelectedRecipients([]);
  };
  const selectCurrentGenerationRecipient = () => {
    if (!recipient) return;
    setRecipientSelectionTouched(true);
    setSelectedRecipients([recipient]);
  };

  const generateAll = async () => {
    const targetRecipients = generationRecipients;
    if (sourceState.status === "loading") return;
    if (!canGenerate) {
      setState({ status: "error", message: "当前账号没有“生成全部角色报告”权限，请联系主管理员" });
      return;
    }
    if (!period.start || !period.end || period.start > period.end) { setState({ status: "error", message: "请选择有效的统计年份和时间段" }); return; }
    // First paint only loads metadata. Fetch the few Markdown baselines and,
    // for R&D roles, detailed ECN/non-BOM evidence only after an explicit
    // generation command. This keeps role navigation independent of data size.
    setState({ status: "running", message: "正在按需读取本次生成所需的报告基线…" });
    const generationBaseline = await refresh({ loadContents: true, silent: true });
    if (!generationBaseline) { setState({ status: "error", message: "读取报告基线失败，请检查项目服务后重试" }); return; }
    if (!hasCompleteBaseline(generationBaseline.files, spec.modules)) { setState({ status: "error", message: `请先在对应模块 Agent 中生成、保存或导入报告：${spec.modules.filter((module) => !generationBaseline.files.some((item) => baselineMatchesModule(item, module))).join("、")}` }); return; }
    // Ask the server for one role/period snapshot, not the entire snapshot
    // registry. The server can read PostgreSQL/JSON state; the browser only
    // receives the fixed evidence needed for this one generation request.
    let generationRoleSnapshotRegistry = null;
    try {
      const snapshotRegistry = await loadQualityAgentRoleSnapshotRegistry({ role, period: { start: period.start, end: period.end } });
      generationRoleSnapshotRegistry = normalizeRoleSnapshotRegistry(snapshotRegistry || null);
    } catch {
      generationRoleSnapshotRegistry = null;
    }
    const snapshotFor = (name) => {
      const snapshot = pickRoleSnapshot(generationRoleSnapshotRegistry, { role, recipient: name, period: { start: period.start, end: period.end } });
      // Snapshots created before R&D issue evidence was persisted cannot prove
      // a zero count. Treat them as stale so the generation path loads source
      // rows or waits for a newly generated role snapshot.
      if (role === "研发工程师" && snapshot && (!snapshot.rdQualityIssues || snapshot.metricContract !== "rd-quality-only-v1")) return null;
      return snapshot;
    };
    const snapshotReady = targetRecipients.length > 0 && targetRecipients.every((name) => snapshotFor(name));
    let generationDqaAgentMetrics = dqaAgentMetrics;
    let generationRaw = dqaAgentRaw;
    if (!snapshotReady && ["研发工程师", "PM", "TPM", "产总"].includes(role) && !dqaAgentRaw) {
      setGenerationProgress({ visible: true, recipientNames: [...targetRecipients], completedNames: [], currentName: "", total: targetRecipients.length, phase: "读取研发明细", detail: "正在读取 ECN、非BOM 与项目映射固定数据" });
      try {
        const raw = await loadDqaAgentRaw();
        generationRaw = raw || null;
        setDqaAgentRaw(raw || null);
        generationDqaAgentMetrics = raw ? buildDqaAgentRawMetrics(raw, { start: period.start, end: period.end }) : null;
      } catch {
        generationDqaAgentMetrics = null;
      }
    }
    const generationSourceRevision = `${roleFiles.find((file) => file.subKind === "DQA_ENGINEER_SUPPLEMENT")?.importedAt || ""}|${(generationRaw?.files || []).map((file) => `${file.sourceId || file.name}:${file.importedAt || ""}:${file.rowCount || 0}`).sort().join("|")}`;
    const generationSourceSignature = roleSourceSignature(role, spec, generationBaseline.files, recipients, roleDateRange, generationSourceRevision, roleSkill.name, roleSkill.content);
    if (!snapshotReady && !sourceReady && onEnsureAgentSources) {
      setGenerationProgress({ visible: true, recipientNames: [...targetRecipients], completedNames: Object.keys(cacheEntry?.reports || {}).filter((name) => targetRecipients.includes(name)), currentName: "", total: targetRecipients.length, phase: "数据准备", detail: "正在加载本次生成所需的原始数据" });
      setSourceState({ status: "loading", message: "正在加载本次生成所需的原始数据" });
      setState({ status: "running", message: "首次生成需要解析角色数据，当前页面不会自动加载" });
      try {
        const next = await onEnsureAgentSources(spec.modules, (progress) => {
          if (progress?.label) {
            setSourceState({ status: "loading", message: progress.label });
            setGenerationProgress((current) => ({ ...current, visible: true, phase: "数据准备", detail: progress.label }));
          }
        });
        const keep = (source) => spec.modules.includes(source.module) || (role === "研发工程师" && source.subKind === "DQA_ENGINEER_SUPPLEMENT");
        const byKey = new Map();
        [...files.filter(keep), ...(next || []).filter(keep)].forEach((source) => {
          const key = `${source.module}::${source.name}`;
          const previous = byKey.get(key);
          const previousRows = Array.isArray(previous?.rows) ? previous.rows.length : 0;
          const nextRows = Array.isArray(source.rows) ? source.rows.length : 0;
          if (!previous || nextRows >= previousRows) byKey.set(key, source);
        });
        setAgentFiles([...byKey.values()]);
        setGenerationProgress((current) => ({ ...current, visible: true, recipientNames: [...targetRecipients], currentName: "", total: targetRecipients.length, phase: "数据准备", detail: "原始数据已加载，请再次点击生成报告" }));
        setSourceState({ status: "ready", message: "角色数据已加载，请再次点击生成" });
        setState({ status: "done", message: "角色原始数据已加载，确认后再次点击生成报告" });
      } catch (loadError) {
        setGenerationProgress((current) => ({ ...current, visible: true, phase: "数据准备失败", detail: loadError.message || String(loadError) }));
        setSourceState({ status: "error", message: `角色数据加载失败：${loadError.message || loadError}` });
        setState({ status: "error", message: `角色数据加载失败：${loadError.message || loadError}` });
      }
      return;
    }
    if (!targetRecipients.length) { setState({ status: "error", message: "请先勾选需要生成报告的人员" }); return; }
    if (!recipients.length) { setState({ status: "error", message: "没有找到可用的人员名单，请先检查原始数据或映射表" }); return; }
    if (!reportLayoutChanged && selectedCachedComplete && !window.confirm(`当前勾选的 ${targetRecipients.length} 人报告已经生成并缓存，是否继续重新生成？`)) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const reports = cacheEntry?.sourceSignature === generationSourceSignature ? { ...(cacheEntry.reports || {}) } : {};
    if (selectedCachedComplete) targetRecipients.forEach((name) => { delete reports[name]; });
    const completedTargetNames = Object.keys(reports).filter((name) => targetRecipients.includes(name));
    setGenerationProgress({ visible: true, recipientNames: [...targetRecipients], completedNames: completedTargetNames, currentName: "", total: targetRecipients.length, phase: "准备生成", detail: `正在检查 ${role} 报告基线` });
    setState({ status: "running", message: `正在批量生成 ${role} 报告（${completedTargetNames.length}/${targetRecipients.length}）…` });
    try {
      // Build the per-person row index only after the user starts generation;
      // this keeps initial navigation and name selection responsive while
      // retaining O(1) evidence lookup during a batch.
      const generationRoleRows = roleRows.length ? roleRows : sourceRows(roleFiles, spec.modules);
      const generationRoleRowIndex = roleRowIndex || (individualRoles.has(role) ? buildRoleRowIndex(generationRoleRows, spec.fields) : null);
      let autoSaved = 0;
      let autoSaveError = "";
      let previousExamByRecipient = new Map();
      let confirmedKnowledgeByRecipient = null;
      let recurrenceRows = [];
      try {
        setGenerationProgress((current) => ({ ...current, phase: "读取闭环", detail: "正在读取人工确认后的重复问题、考试和措施有效性" }));
        const recurrenceModule = ["组装人员", "机长", "交付经理", "供应链经理"].includes(role) ? "IPQC" : "DQA";
        const response = await loadKnowledgeRecurrences({ module: recurrenceModule, limit: 10000, compact: true });
        recurrenceRows = response.recurrences || [];
      } catch {
        recurrenceRows = [];
      }
      if (individualRoles.has(role)) {
        const roleName = examRoleForAgent(role);
        const localResults = readLocalExamResults(roleName);
        try {
          const response = await loadExamResults({ roleName, includePending: false, limit: 1000 });
          previousExamByRecipient = latestCompletedExamResults([...(response.records || []), ...localResults]);
        } catch {
          previousExamByRecipient = latestCompletedExamResults(localResults);
        }
        try {
          const response = await loadConfirmedKnowledgeMatches({ module: role === "组装人员" ? "IPQC" : "DQA", limit: 10000 });
          confirmedKnowledgeByRecipient = new Map();
          (response.matches || []).forEach((match) => {
            const personName = String(match.issue?.personName || "").trim();
            if (!personName) return;
            confirmedKnowledgeByRecipient.set(personName, [...(confirmedKnowledgeByRecipient.get(personName) || []), match]);
          });
        } catch {
          // Older/offline servers keep the previous deterministic text matching as a compatibility fallback.
          confirmedKnowledgeByRecipient = null;
        }
      }
      const baselineText = roleBaselineBrief(generationBaseline, spec.modules);
      setGenerationProgress((current) => ({ ...current, phase: "准备生成", detail: `已整理 ${spec.modules.join("、")} Agent 基线，准备逐人生成` }));
      for (let index = 0; index < targetRecipients.length; index += 1) {
        if (controller.signal.aborted) throw new DOMException("aborted", "AbortError");
        const name = targetRecipients[index];
        if (reports[name]) {
          setGenerationProgress((current) => ({ ...current, visible: true, completedNames: [...new Set([...(current.completedNames || []), name])], currentName: "", phase: "读取缓存", detail: `已跳过 ${name}，完成 ${index + 1}/${targetRecipients.length} 份` }));
          setState({ status: "running", message: `正在使用缓存 ${role} 报告（${index + 1}/${targetRecipients.length}）…` });
          continue;
        }
        setGenerationProgress((current) => ({ ...current, visible: true, currentName: name, phase: "生成报告", detail: `正在调用大模型生成 ${name} 的报告（${index + 1}/${targetRecipients.length}）` }));
        const deterministicRoleSnapshot = snapshotFor(name);
        const liveEvidence = recipientEvidence(role, name, data, roleFiles, roleDateRange, generationRoleRowIndex, generationDqaAgentMetrics);
        const evidence = {
          ...liveEvidence,
          ...(deterministicRoleSnapshot ? {
            roleSnapshot: deterministicRoleSnapshot,
            // Snapshot generation owns deterministic R&D issue counting. When
            // the browser intentionally keeps source rows unloaded for speed,
            // never replace that fixed evidence with an empty live recount.
            rdQualityIssues: deterministicRoleSnapshot.rdQualityIssues || liveEvidence.rdQualityIssues,
            ...(role === "研发工程师" ? {
              matchedRows: deterministicRoleSnapshot.rdQualityIssues?.count ?? deterministicRoleSnapshot.metrics?.total ?? 0,
              engineerMetrics: deterministicRoleSnapshot.dqaAgentMetrics || liveEvidence.engineerMetrics,
              periodTrend: null,
              topCategories: (deterministicRoleSnapshot.rdQualityIssues?.categories || []).map((item) => item.name),
              topCategoryStats: (deterministicRoleSnapshot.rdQualityIssues?.categories || []).map((item) => ({ name: item.name, count: item.count, share: deterministicRoleSnapshot.rdQualityIssues?.count ? Number((item.count / deterministicRoleSnapshot.rdQualityIssues.count * 100).toFixed(1)) : null })),
            } : {}),
          } : {}),
          recurrence: recurrenceEvidenceForRecipient(role, name, recurrenceRows, roleFiles, roleDateRange),
        };
        if (role === "研发工程师") {
          const fixedMetrics = withDerivedEcnMetrics(evidence.roleSnapshot?.dqaAgentMetrics || evidence.engineerMetrics || {});
          evidence.engineerMetrics = fixedMetrics;
          if (evidence.roleSnapshot) evidence.roleSnapshot = { ...evidence.roleSnapshot, dqaAgentMetrics: fixedMetrics };
        }
        const snapshotRanking = generationRoleSnapshotRegistry?.history?.find((entry) => entry.active !== false
          && entry.role === role
          && entry.period?.start === period.start
          && entry.period?.end === period.end)?.snapshot?.ranking || [];
        const personRankingRows = nonRankingRoles.has(role)
          ? []
          : snapshotReady && snapshotRanking.length
            ? buildSnapshotRankingRows(snapshotRanking, name, role)
            : buildRoleRanking(role, recipients, name, data, roleFiles, roleDateRange, generationRoleRowIndex, generationRoleRows);
        const deterministicVisualSpec = buildRoleVisualSpec(role, name, evidence, personRankingRows);
        assertRoleVisualConsistency(role, evidence, deterministicVisualSpec);
        const previousExamResult = previousExamByRecipient.get(name) || null;
        const ipqcCountingInstruction = role === "组装人员"
          ? "IPQC口径必须严格执行：matchedRows和ipqcMetrics.inspectedRecords均为送检记录数；不良内容或不良类型至少一项非空才计1条不良；两项同时为空计为合格，不得写成数据缺失、未分类或异常。报告必须分别写明送检记录、不良记录、合格记录和不良率。"
          : "";
        const managerInstruction = individualRoles.has(role)
          ? "这是当事人报告，必须具体列出本人问题、问题类型、数量、证据和改善动作。"
          : "这是管理者报告，不要写管理者本人犯了什么问题，也不要虚构个人问题；只展示其管理范围、下属质量汇总、TOP责任单元、管理风险、需要向上级汇报的事项和管理动作。";
        const rdHardContract = role === "研发工程师"
          ? "研发工程师硬口径：研发质量问题是唯一质量结果数量；ECN、非BOM和设计评审分别属于工程活动与正向贡献，禁止进入质量问题总数、分母、趋势或排名。没有设计输出总量分母时，禁止计算或展示不良率。正文和图表必须只使用人员证据中的engineerMetrics权威对象。阶段数组只表示出现过的阶段，禁止写成全部问题都在这些阶段暴露。问题分类Pareto不是根因Pareto。排名结论只在独立的研发质量问题排名章节出现一次。工程行动只保留一张表：每项只有一个Owner，协同人另列，截止日期必须是YYYY-MM-DD；不得再重复30/60/90天待办列表。样本覆盖率目标100%；发布前检出率=发布前发现问题数÷（发布前发现问题数+后端再暴露问题数），分母为0时标记不适用，目标100%；单项验证周期=提交验证至放行结论，试行目标≤5个工作日；后端再暴露数目标0项。"
          : "";
        const fixedRdTrend = role === "研发工程师" ? `\n确定性研发问题趋势（必须分析）：${JSON.stringify(evidence.rdQualityIssues?.periodTrend || null)}` : "";
        const reportDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
        const rdMilestones = role === "研发工程师" ? `30天=${addIsoDays(reportDate, 30)}，60天=${addIsoDays(reportDate, 60)}，90天=${addIsoDays(reportDate, 90)}` : "";
        const requestRoleReport = async (retry = false) => requestAiChat([
          { role: "system", content: `你是质量分析 Agent 的角色闭环报告生成器。只能使用输入的固定 Agent报告和人员证据，不得新增数字，不得用上级数据冒充本人。${managerInstruction}${ipqcCountingInstruction}${rdHardContract}报告必须包含：结果指标、过程暴露、根因证据/待核实、责任链汇报、改善措施、30/60/90天待办、验证指标和关闭条件。输出结构化 Markdown，使用一级/二级标题、表格和清晰列表；排名章节只输出章节标题，系统会在该标题下插入统一排名图表。禁止输出“章节标题”、模板占位词或空白排名结论。已提供的确定性统计必须原样引用；仅缺失的字段才写“待核实”。研发工程师报告必须严格分组：研发质量问题是问题指标；ECN与非BOM是变更/申请活动，不能自动写成质量问题；非BOM必须分别说明加工件与标准件；设计评审参与和有效改善项是正向贡献，单独成节，不能与问题、ECN或非BOM相加或混排。趋势不得截断：跨月半年周期必须完整列出每个自然月，跨周周期必须列出统计起止日期之间的全部连续周。责任链姓名只能取人员证据中的 directResponsibility 或 mapping，不得把当前人员姓名推断为其交付经理。必须严格执行角色 Skill，不得违反其中的角色边界、数据口径和禁止事项。复发判断只能引用人员证据摘要中 recurrence 的系统确定性结果；考试通过不能单独证明问题关闭。组装人员和研发工程师的考试结果由系统确定性追加，不要自行输出考试章节。不要输出 REPORT_VISUAL_SPEC_JSON，系统会使用固定统计生成视觉契约。${retry ? "本次为网关超时后的精简重试：只输出最关键结论、行动和验证项，最多6个二级章节。" : ""}\n\n角色 Skill：\n${String(roleSkill.content || "").slice(0, retry ? 2000 : 3600)}\n\n当前网页呈现风格 Profile：${layoutSkillName}` },
          { role: "user", content: `角色：${role}\n角色 Skill 名称：${roleSkill.name}\n网页呈现风格 Profile：${layoutSkillName}\n报告生成日期：${reportDate}\n${rdMilestones ? `研发行动里程碑日期（必须逐项原样写入）：${rdMilestones}\n最小验证必须明确采用“3个新项目或5个高风险设计输出”，并给出发布前检出、验证周期、后端再暴露的数值阈值。\n` : ""}责任链：${spec.chain}\n统计年份：${roleDateRange._periodYear}\n统计周期：${roleDateRange._periodStart}—${roleDateRange._periodEnd}\n当前人员：${name}\n本人员工证据摘要（固定统计，不得重算）：${JSON.stringify(compactRolePromptValue(evidence, retry ? 2 : 3, retry ? 5 : 10))}${fixedRdTrend}\n上次知识考试结果（只可引用，不得重算）：${JSON.stringify(compactRolePromptValue(previousExamResult, 2, 4))}\n排名图表数据（只可引用，不得重算）：${JSON.stringify(personRankingRows.slice(0, retry ? 12 : 24))}\n基线 Agent 报告摘要：${retry ? roleBaselineBrief(generationBaseline, spec.modules, true) : baselineText}\n${managerInstruction}\n${ipqcCountingInstruction}\n请只输出该人员的 Markdown 报告；没有证据的部分写“待核实”，不得把下属问题写成管理者个人问题。` },
        ], { max_tokens: retry ? 1800 : 2400, agent: true, operation: "agent-role-report-generate", signal: controller.signal });
        let result;
        try {
          result = await requestRoleReport(false);
        } catch (firstError) {
          if (!retryableRoleAgentError(firstError) || controller.signal.aborted) throw firstError;
          setGenerationProgress((current) => ({ ...current, visible: true, currentName: name, phase: "精简重试", detail: `${name} 的上游请求超时，正在使用固定摘要重新生成` }));
          setState({ status: "running", message: `${name} 请求超时，正在精简上下文重试…` });
          await waitForRoleAgentRetry(1200, controller.signal);
          result = await requestRoleReport(true);
        }
        const reportModel = String(result.model || "");
        if (reportModel) setLastGeneratedModel(reportModel);
        let reportContent = enforceRoleReportFacts(sanitizeHumanReportContent(result.content || "暂无报告"), evidence, role, personRankingRows);
        if (role === "研发工程师") reportContent += reviewContributionMarkdown(evidence, reportContent);
        if (individualRoles.has(role)) {
          const confirmedMatches = confirmedKnowledgeByRecipient == null ? null : (confirmedKnowledgeByRecipient.get(name) || []);
          const exam = await createAgentExamLink(role, name, evidence, confirmedMatches);
          reportContent += previousExamResultMarkdown(previousExamResult);
          reportContent += exam.markdown;
        }
        reportContent = `${reportContent.trim()}\n\n<REPORT_VISUAL_SPEC_JSON>${JSON.stringify(deterministicVisualSpec)}</REPORT_VISUAL_SPEC_JSON>\n\n${REPORT_VERSION_MARKER}`;
        reports[name] = reportContent;
        setGenerationProgress((current) => ({ ...current, visible: true, currentName: name, phase: "保存报告", detail: `正在保存 ${name} 的报告（${index + 1}/${targetRecipients.length}）` }));
        let savedOk = false;
        try {
          const saved = canSaveToServer
            ? await saveAgentReportFile({ module: `角色报告-${role}`, role, recipient: name, skillName: roleSkill.name, layoutProfileId: layoutSkillName, period: roleDateRange, model: reportModel, creatorIp: creatorIp || resolvedCreatorIp, content: reportContent, visualSpec: deterministicVisualSpec })
            : await saveLocalAgentReport({ module: `角色报告-${role}`, role, recipient: name, skillName: roleSkill.name, layoutProfileId: layoutSkillName, layoutSkillName, period: roleDateRange, model: reportModel, creatorIp: creatorIp || resolvedCreatorIp, content: reportContent, visualSpec: deterministicVisualSpec });
          // Updating the complete report-library state after every person makes
          // a 200-person R&D run repeatedly re-render the page. The selected
          // recipient stays live; the rest are indexed once after completion.
          registerSavedRoleReport(saved, reportContent, name, name === recipient);
          autoSaved += 1;
          savedOk = true;
          autoSaveError = saved.relativePath || saved.fileName || autoSaveError;
        } catch (error) {
          autoSaveError = error?.message || "报告保存失败，未写入报告库";
        }
        if (savedOk) reports[name] = true;
        else delete reports[name];
        // Persist in batches. Serializing the complete report map for every person makes
        // large role lists quadratic and blocks the main thread.
        if (index % 10 === 9 || index === targetRecipients.length - 1) {
          const cacheUpdate = compactRoleCacheEntry({ role, sourceSignature: generationSourceSignature, generatedAt: new Date().toISOString(), layoutSkillName, reports });
          setCacheEntry(cacheUpdate);
          writeRoleCache(role, cacheUpdate);
        }
        setGenerationProgress((current) => ({ ...current, visible: true, completedNames: [...new Set([...(current.completedNames || []), name])], currentName: "", phase: "保存缓存", detail: `已完成 ${index + 1}/${targetRecipients.length} 份报告` }));
        setState({ status: "running", message: `正在批量生成 ${role} 报告（${index + 1}/${targetRecipients.length}）…` });
      }
      setCacheEntry(compactRoleCacheEntry({ role, sourceSignature: generationSourceSignature, generatedAt: new Date().toISOString(), layoutSkillName, reports }));
      writeRoleCache(role, { role, sourceSignature: generationSourceSignature, generatedAt: new Date().toISOString(), layoutSkillName, reports });
      setGenerationProgress({ visible: true, recipientNames: [...targetRecipients], completedNames: targetRecipients, currentName: "", total: targetRecipients.length, phase: "已完成", detail: `已生成并保存 ${targetRecipients.length} 份 ${role} 报告` });
      setHistoryRevision((current) => current + 1);
      // Reload metadata once, after the whole batch is persisted.
      refresh().catch(() => {});
      setState({ status: "done", message: autoSaved === targetRecipients.length ? `已生成、自动保存并缓存 ${targetRecipients.length} 份 ${role} 报告 · ${autoSaveError}` : `已生成并缓存 ${targetRecipients.length} 份 ${role} 报告；项目自动保存 ${autoSaved}/${targetRecipients.length}，${autoSaveError || "其余报告保留在本地缓存"}` });
    } catch (error) {
      setGenerationProgress((current) => ({ ...current, visible: true, phase: error?.name === "AbortError" || controller.signal.aborted ? "已停止" : "生成失败", detail: error?.name === "AbortError" || controller.signal.aborted ? "已保留已完成报告，可继续生成" : (error.message || String(error)) }));
      setState({ status: "error", message: error?.name === "AbortError" || controller.signal.aborted ? "已停止批量生成，已完成报告已缓存，可继续生成" : `批量生成失败：${error.message}` });
    } finally { if (abortRef.current === controller) abortRef.current = null; }
  };

  const stop = () => abortRef.current?.abort();
  const download = () => {
    if (!selectedContent || !recipient) return;
    exportRoleReport({
      role,
      recipient,
      content: selectedContent,
      visualSpec: selectedVisualSpec,
      skillName: selectedHistoryReport?.skillName || roleSkill.name,
      model: selectedHistoryReport?.model || lastGeneratedModel,
      creatorIp: selectedHistoryReport?.creatorIp || creatorIp || resolvedCreatorIp,
    });
  };
  const save = async () => {
    if (!selectedContent || !recipient) return;
    setState({ status: "running", message: "正在保存角色报告…" });
    try {
      const result = canSaveToServer
        ? await saveAgentReportFile({ module: `角色报告-${role}`, role, recipient, skillName: roleSkill.name, layoutProfileId: layoutSkillName, period: roleDateRange, model: selectedHistoryReport?.model || lastGeneratedModel, creatorIp: creatorIp || resolvedCreatorIp, content: selectedContent, visualSpec: selectedVisualSpec })
        : await saveLocalAgentReport({ module: `角色报告-${role}`, role, recipient, skillName: roleSkill.name, layoutProfileId: layoutSkillName, layoutSkillName, period: roleDateRange, model: selectedHistoryReport?.model || lastGeneratedModel, creatorIp: creatorIp || resolvedCreatorIp, content: selectedContent, visualSpec: selectedVisualSpec });
      registerSavedRoleReport(result, selectedContent, recipient);
      setState({ status: "done", message: canSaveToServer ? `已保存到服务器：${result.relativePath || result.fileName}` : `已保存到本机：${result.fileName}` });
      setHistoryRevision((current) => current + 1);
      await refresh();
    } catch (error) { setState({ status: "error", message: `保存失败：${error.message}` }); }
  };
  const dispatch = async () => {
    if (!canSaveToServer) { setState({ status: "error", message: "普通用户不能创建服务器发送任务" }); return; }
    if (!selectedContent || !recipient) { setState({ status: "error", message: "请先生成并选择人员报告" }); return; }
    setState({ status: "running", message: "正在创建角色发送任务…" });
    try {
      const report = await saveAgentReportFile({ module: `角色报告-${role}`, role, recipient, skillName: roleSkill.name, layoutProfileId: layoutSkillName, period: roleDateRange, model: selectedHistoryReport?.model || lastGeneratedModel, creatorIp: creatorIp || resolvedCreatorIp, content: selectedContent, visualSpec: selectedVisualSpec });
      const task = await saveAgentDispatch({ feature: "qualityAgent", agentTitle: "质量分析 Agent", module: `角色报告-${role}`, role, recipient, skillName: roleSkill.name, layoutProfileId: layoutSkillName, layoutSkillName, reportFileName: report.fileName, reportPath: report.relativePath, period: roleDateRange });
      setHistoryRevision((current) => current + 1);
      setState({ status: "done", message: `已创建待发送任务：${task.relativePath || task.fileName}` });
    } catch (error) { setState({ status: "error", message: `创建发送任务失败：${error.message}` }); }
  };
  const isBulkGenerating = state.status === "running" && Boolean(abortRef.current);
  const displayedPeriod = useMemo(() => selectedHistoryKey === "current" || !selectedHistoryReport?.period ? roleDateRange : { ...roleDateRange, ...selectedHistoryReport.period }, [selectedHistoryKey, selectedHistoryReport?.period, roleDateRange]);
  const renderedReportContent = isBulkGenerating ? "" : selectedContent;
  const rankingTitle = individualRoles.has(role) ? "个人问题排名" : "管理范围排名";
  const rankingMetric = individualRoles.has(role) ? "本人质量记录" : "管理范围异常";
  const selectedVisualSpec = useMemo(() => selectedHistoryReport?.visualSpec || extractReportVisualSpec(renderedReportContent || ""), [selectedHistoryReport?.visualSpec, renderedReportContent]);
  const roleQuality = useMemo(() => {
    if (!renderedReportContent) return { status: "pending", label: "待校验", failed: [] };
    const result = validateReportQuality(renderedReportContent, { rules: qualityRules, hasSnapshot: Boolean(selectedRoleSnapshot), hasVisuals: Boolean(selectedVisualSpec?.figures?.length) });
    const failed = [...result.failed];
    if (role === "组装人员" || role === "研发工程师") {
      if (!/(个人问题|本人问题|问题明细|问题类型)/.test(renderedReportContent)) failed.push({ label: "缺少个人问题明细", severity: "warn" });
    } else if (!/(下属|管理范围|汇总|管理动作)/.test(renderedReportContent)) {
      failed.push({ label: "缺少管理范围汇总", severity: "warn" });
    }
    const status = failed.some((item) => item.severity === "block") ? "error" : failed.length ? "warning" : "ok";
    return { status, label: status === "ok" ? "校验通过" : status === "error" ? `校验失败 · ${failed.length} 项` : `需复核 · ${failed.length} 项`, failed, checks: result.checks };
  }, [renderedReportContent, qualityRules, selectedRoleSnapshot, selectedVisualSpec, role]);
  const hasContractRanking = Array.isArray(selectedVisualSpec?.figures)
    ? selectedVisualSpec.figures.some((figure) => /ranking|排名/i.test(`${figure.intent || ""} ${figure.preferredChart || ""} ${figure.title || ""}`))
    : false;
  // Historical reports are immutable saved artifacts. Their visual contract is
  // rendered directly; reopening one must not rescan raw rows or rebuild a
  // company-wide ranking on the browser main thread.
  const rankingRows = useMemo(() => !renderedReportContent || nonRankingRoles.has(role) || selectedHistoryKey !== "current" || hasContractRanking
    ? []
    : buildRoleRanking(role, recipients, recipient, data, roleFiles, displayedPeriod, roleRowIndex, roleRows), [renderedReportContent, role, selectedHistoryKey, hasContractRanking, recipients, recipient, data, roleFiles, displayedPeriod, roleRowIndex, roleRows]);
  // Markdown-to-HTML conversion is deliberately expensive because it builds
  // report tables and chart placeholders. Selection checkboxes must not rerun
  // it: their state is unrelated to the report currently being viewed.
  const reportContentParts = useMemo(() => renderedReportContent
    ? { before: renderAgentMarkdown(renderedReportContent, { chartFirst: true, publisher: true, profileId: layoutSkillName, module: "角色报告-" + role, visualSpec: selectedVisualSpec }), after: "", hasRanking: false }
    : { before: "", after: "", hasRanking: false }, [renderedReportContent, layoutSkillName, role, selectedVisualSpec]);
  const rankedReportHtml = useMemo(() => renderedReportContent
    && selectedHistoryKey === "current"
    && !hasContractRanking
    && rankingRows.length
    ? injectRoleRankingChart(reportContentParts.before, renderRoleRankingChartMarkup({ rows: rankingRows, title: rankingTitle, metric: rankingMetric, role, recipient, period: displayedPeriod }))
    : reportContentParts.before, [renderedReportContent, selectedHistoryKey, hasContractRanking, reportContentParts.before, rankingRows, rankingTitle, rankingMetric, role, recipient, displayedPeriod]);
  const selectRoleSkill = (name) => {
    const selected = roleSkills.find((item) => (item.name || item.id) === name);
    if (selected) setRoleSkill({ name: selected.name || selected.id, content: selected.content || fallbackRoleSkill(role) });
  };
  const selectLayoutSkill = (name) => {
    setLayoutSkillName(normalizeReportPresentationProfile(name));
  };
  const completedNameSet = new Set(generationProgress.completedNames || []);
  const progressRecipientNames = generationProgress.recipientNames?.length
    ? generationProgress.recipientNames
    : recipients.slice(0, generationProgress.total || recipients.length);
  const progressTotal = progressRecipientNames.length;
  const progressDone = progressRecipientNames.filter((name) => completedNameSet.has(name)).length;

  return <div className="qmdp-page quality-agent-page">
    <div className="quality-agent-hero"><div><span className="qmdp-eyebrow">QUALITY ANALYSIS AGENT / ROLE REPORT</span><h2>Agent角色报告 · {role}</h2><p>按责任链批量生成并缓存人员报告，选择人员查看本人问题、上级汇报、改善行动和闭环待办。</p></div><Brain size={42} weight="duotone" /></div>
    <section className="qmdp-card quality-agent-controls">
      <label>角色链路<span className="quality-agent-inline-value">{spec.chain}</span></label><label>角色 Skill<select value={roleSkill.name} onChange={(event) => selectRoleSkill(event.target.value)} disabled={!roleSkills.length}><option value={roleSkill.name}>{roleSkill.name}</option>{roleSkills.filter((item) => (item.name || item.id) !== roleSkill.name).map((item) => <option key={item.id || item.name} value={item.name || item.id}>{item.name || item.id}</option>)}</select></label><label>网页呈现风格<select value={layoutSkillName} onChange={(event) => selectLayoutSkill(event.target.value)}>{layoutSkills.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>{reportLayoutLabel(layoutSkillName)} · 切换后立即重绘当前、历史报告，不重新调用大模型</small></label>
      <label className="quality-agent-period-year">统计年份<select value={period.year} onChange={(event) => setPeriod(rolePeriodDefaults(dateRange, event.target.value))}><option value="2026">2026</option><option value="2025">2025</option></select></label><label>开始日期<input type="date" value={period.start} onChange={(event) => setPeriod((current) => ({ ...current, start: event.target.value }))}/></label><label>结束日期<input type="date" value={period.end} onChange={(event) => setPeriod((current) => ({ ...current, end: event.target.value }))}/></label>
      <label>人员{individualRoles.has(role) ? <><div className="quality-agent-recipient-combobox"><input className="quality-agent-recipient-input" value={recipientPickerQuery} onFocus={() => setRecipientPickerOpen(true)} onChange={(event) => { setRecipientPickerQuery(event.target.value); setRecipientPickerOpen(true); }} onKeyDown={(event) => { if (event.key === "Enter" && recipientPickerOptions[0]) { event.preventDefault(); recipientManualClearRef.current = false; selectRecipient(recipientPickerOptions[0]); setRecipientPickerQuery(recipientPickerOptions[0]); setRecipientPickerOpen(false); } if (event.key === "Escape") setRecipientPickerOpen(false); }} placeholder="输入姓名或关键字" autoComplete="off"/><button type="button" className="quality-agent-recipient-clear" aria-label="清除人员" onMouseDown={(event) => event.preventDefault()} onClick={() => { recipientManualClearRef.current = true; selectRecipient(""); setRecipientPickerQuery(""); setRecipientPickerOpen(true); }}>×</button>{recipientPickerOpen && <div className="quality-agent-recipient-options" role="listbox">{recipientPickerOptions.map((name) => <button type="button" role="option" aria-selected={name === recipient} key={name} onMouseDown={(event) => event.preventDefault()} onClick={() => { recipientManualClearRef.current = false; selectRecipient(name); setRecipientPickerQuery(name); setRecipientPickerOpen(false); }}>{name}</button>)}{!recipientPickerOptions.length && <span>没有匹配的人员</span>}{recipientSelectNames.length > recipientPickerOptions.length && <small>已显示 {recipientPickerOptions.length} 人，请继续输入姓名缩小范围</small>}</div>}</div><small>共 {recipientSelectNames.length} 人，可输入姓名筛选</small></> : <select value={recipient} onChange={(event) => selectRecipient(event.target.value)}><option value="">请选择人员</option>{recipientSelectNames.map((name) => <option key={name}>{name}</option>)}</select>}</label><label>历史报告<select value={selectedHistoryKey} onChange={(event) => openHistoryReport(event.target.value)} disabled={!recipient}><option value="current" disabled={!currentCacheContent}>当前缓存{currentCacheContent ? ` · ${roleReportTimeLabel(cacheEntry?.generatedAt)}` : "（暂无）"}</option>{savedRoleReports.map((item) => <option key={item.historyKey} value={item.historyKey}>{roleHistoryLabel(item)}</option>)}</select><small>{historyState.message || "选择人员后读取历史版本"}</small></label>
      {period.start > period.end && <span className="quality-agent-period-invalid">日期范围无效</span>}
      <div className="quality-agent-recipient-picker">
        <div className="quality-agent-recipient-picker-head">
          <div><strong>生成范围</strong><span>只有勾选的人会生成或重算角色报告 · {generationScopeLabel}</span></div>
          <div className="quality-agent-recipient-picker-actions">
            <button type="button" className="qmdp-secondary-btn" onClick={selectAllGenerationRecipients} disabled={!recipients.length}>全选</button>
            <button type="button" className="qmdp-secondary-btn" onClick={clearGenerationRecipients} disabled={!selectedRecipients.length}>清空</button>
            <button type="button" className="qmdp-secondary-btn" onClick={selectCurrentGenerationRecipient} disabled={!recipient}>只选当前人</button>
          </div>
        </div>
        <div className="quality-agent-recipient-picker-search">
          <input value={recipientSearch} onChange={(event) => setRecipientSearch(event.target.value)} placeholder="输入姓名搜索后选择" aria-label="搜索生成对象" />
          <small>共 {recipients.length} 人 · 当前显示 {visibleRecipientNames.length} 人 · 已选 {selectedRecipients.length} 人</small>
          {visibleRecipientNames.length < recipients.length && <button type="button" className="qmdp-secondary-btn" onClick={() => setRecipientRenderLimit(recipients.length)}>显示全部</button>}
        </div>
        <div className="quality-agent-recipient-chip-grid" onScroll={(event) => {
          const target = event.currentTarget;
          if (target.scrollTop + target.clientHeight >= target.scrollHeight - 36 && visibleRecipientNames.length < recipients.length) {
            setRecipientRenderLimit((current) => Math.min(recipients.length, current + 120));
          }
        }}>
          {visibleRecipientNames.map((name) => <RecipientSelectionChip key={name} name={name} checked={selectedRecipientSet.has(name)} onToggle={toggleGenerationRecipient}/>)}
          {!recipients.length && <span className="quality-agent-recipient-empty">当前角色还没有可选择的人员</span>}
          {recipients.length > visibleRecipientNames.length && <span className="quality-agent-recipient-empty">已限制首屏显示数量，请输入姓名搜索其余人员</span>}
        </div>
      </div>
      <span>基线：{spec.modules.join(" + ")} · 网页风格：{reportLayoutLabel(layoutSkillName)} · 缓存：{cachedComplete ? "全量已完成" : `${Object.keys(cacheEntry?.reports || {}).length}/${recipients.length}`} · 当前范围：{generationScopeLabel}{sourceState.message ? ` · ${sourceState.message}` : ""}{selectedCachedComplete ? " · 已命中选中人员缓存，生成时将跳过已完成项" : ""}</span>
      <div className={`quality-agent-snapshot-trace ${roleSnapshotTrace.status}`}><b>{roleSnapshotTrace.label}</b><span>{roleSnapshotTrace.detail}</span><small>{roleSnapshotTrace.meta}</small></div>
      <button className="qmdp-secondary-btn" onClick={refresh} disabled={state.status === "running"}><ArrowsClockwise size={15}/>刷新基线</button>
      {state.status === "running" && abortRef.current ? <button className="qmdp-danger-btn" onClick={stop}><WarningCircle size={15}/>停止批量生成</button> : <button className="qmdp-primary-btn" onClick={generateAll} disabled={!canGenerate || sourceState.status === "loading" || !generationRecipients.length} title={!canGenerate ? "仅主管理员可以生成全部角色报告" : sourceState.status === "loading" ? "正在加载角色数据" : !generationRecipients.length ? "请先勾选人员" : "只生成当前勾选的人员"}><Brain size={16}/>{reportLayoutChanged ? "应用排版并重新生成" : selectedCachedComplete ? `重新生成已选 ${generationRecipients.length} 人报告` : generationRecipients.length === recipients.length ? "生成全部角色报告" : `生成已选 ${generationRecipients.length} 人报告`}</button>}
    </section>
    {generationProgress.visible && <div className={`agent-generation-progress agent-generation-grid-progress ${state.status === "error" ? "error" : progressTotal > 0 && progressDone >= progressTotal ? "done" : ""}`} role="status" aria-live="polite"><div className="agent-generation-progress-head"><strong>{generationProgress.phase || "正在生成"}</strong><b>{progressDone}/{progressTotal}</b></div><div className="agent-generation-progress-cells" role="img" aria-label={`已完成 ${progressDone} 份，共 ${progressTotal} 份`}>{progressRecipientNames.map((name) => <i key={name} className={`${completedNameSet.has(name) ? "is-complete" : ""} ${generationProgress.currentName === name ? "is-current" : ""}`} title={`${name} · ${completedNameSet.has(name) ? "已完成" : generationProgress.currentName === name ? "正在生成" : "待生成"}`} />)}</div><small className="agent-generation-progress-detail">{generationProgress.detail}</small></div>}
    <section className="qmdp-card quality-agent-base-preview"><header><strong>角色报告基线</strong><span>{baseline.files.map((item) => `${item.module || spec.modules.find((module) => baselineMatchesModule(item, module))} · ${item.imported ? "外部导入" : item.fileName.startsWith("本地缓存-") ? "本地缓存" : "项目报告库"}`).join("、") || "尚未找到对应 Agent 报告"}</span></header><p>供应链角色只使用 IPQC Agent；研发角色同时使用 OQC、DQA、QMS Agent。个人证据不足时报告必须标记“待核实”。外部导入报告仅作为角色报告基线使用，不会覆盖项目报告库。</p></section>
    {isBulkGenerating && <section className="qmdp-card quality-agent-report"><header><strong>正在批量生成报告</strong><span>报告内容和全员排名将在全部任务完成后按需加载，避免研发大数据量导致页面卡顿。</span></header></section>}
    {renderedReportContent && <section className={`qmdp-card quality-agent-report quality-agent-role-report ${activeReportLayoutClass}`}><header><strong>{role} · {recipient}</strong><span>{selectedHistoryKey === "current" ? `当前缓存 · ${reportLayoutLabel(layoutSkillName)}` : `${roleHistoryLabel(selectedHistoryReport || {})} · ${reportLayoutLabel(layoutSkillName)}`} <em className={`quality-agent-report-check ${roleQuality.status}`} title={roleQuality.failed.map((item) => item.label).join("；")}>报告质量：{roleQuality.label}</em> <button className="qmdp-text-btn" onClick={() => setShowQualityDetails((value) => !value)}>{showQualityDetails ? "收起校验" : "查看校验详情"}</button></span><div><button className="qmdp-secondary-btn" onClick={download}><DownloadSimple size={15}/>导出报告</button><button className="qmdp-primary-btn" onClick={save}><FloppyDisk size={15}/>保存报告</button>{canSaveToServer && <button className="qmdp-primary-btn" onClick={dispatch}><PaperPlaneTilt size={15}/>创建发送任务</button>}</div></header>{showQualityDetails && <div className="quality-agent-quality-details"><div><b>通过 {roleQuality.checks?.filter((item) => item.passed).length || 0}</b><b className="warn">警告 {roleQuality.failed.filter((item) => item.severity !== "block").length}</b><b className="error">阻断 {roleQuality.failed.filter((item) => item.severity === "block").length}</b></div>{roleQuality.failed.map((item, index) => <p key={`${item.id || item.label}-${index}`}><strong>{item.label}</strong><span>{reportQualityAdvice(item)}</span></p>)}</div>}<div className={`quality-agent-report-content ${activeReportLayoutClass}`}><div dangerouslySetInnerHTML={{ __html: rankedReportHtml }}/></div></section>}
    {!renderedReportContent && !isBulkGenerating && <section className="qmdp-card quality-agent-report"><header><strong>请选择人员查看报告</strong><span>{cachedComplete ? "缓存已完成" : "请先生成全部角色报告"}</span></header></section>}
    {state.message && <div className={`quality-agent-save-state ${state.status}`}><WarningCircle size={16}/>{state.message}</div>}
  </div>;
}
