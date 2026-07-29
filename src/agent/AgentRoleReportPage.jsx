import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsClockwise, Brain, FloppyDisk, PaperPlaneTilt, WarningCircle } from "@phosphor-icons/react";
import { ReportBarChart } from "../charts.jsx";
import { createExamSession, loadAgentReport, loadAgentReports, loadAgentSkills, requestAiChat, saveAgentDispatch, saveAgentReportFile, saveLocalAgentReport } from "../dataStore.js";
import { loadQualityAgentRuns } from "./qualityAgent.js";
import { loadImportedAgentReports } from "./agentReportStorage.js";

const ROLE_CACHE_KEY = "qms-agent-role-report-cache-v2";
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

const escapeHtml = (value) => String(value || "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
const inlineMarkdown = (value) => String(value || "")
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*([^*]+)\*/g, "<em>$1</em>");
const renderTable = (rows) => {
  const cells = rows
    .filter((line) => !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim()))
    .map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => inlineMarkdown(escapeHtml(cell.trim()))));
  if (!cells.length) return "";
  const [head, ...body] = cells;
  return `<div class="agent-report-table-wrap"><table class="agent-report-table"><thead><tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${head.map((_, index) => `<td>${row[index] || ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
};
const sectionHeading = (value) => {
  const text = String(value || "").replace(/^\s*#{1,6}\s*/, "").trim();
  const numbered = /^(?:第\s*[一二三四五六七八九十百\d]+\s*[章节、.)．]?\s*)|^(?:[一二三四五六七八九十百]+\s*[、．]\s*)|^(?:\d+\s*[、]\s*)/.test(text);
  const semantic = /^(?:\d+\s*[.)]\s*)?(?:结果|过程|根因|责任|行动|风险|排名|结论|改善|待办|汇总|复盘|证据|指标|问题|管理)/.test(text) && text.length < 100;
  return numbered || semantic || /^#{1,6}\s/.test(String(value || "").trim());
};
const rankingHeading = (value) => sectionHeading(value) && /(?:排名|名次|ranking)/i.test(String(value || ""));
const renderReportLines = (lines) => {
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (!raw) { output.push("<div class=\"agent-report-spacer\"></div>"); continue; }
    if (/^\|/.test(raw) && lines[index + 1] && /^\|/.test(lines[index + 1].trim())) {
      const table = [];
      while (index < lines.length && /^\|/.test(lines[index].trim())) table.push(lines[index++]);
      index -= 1;
      const tableText = table.join(" ");
      if (/(排名|名次|rank)/i.test(tableText) && /(姓名|人员|对象|name)/i.test(tableText)) continue;
      output.push(renderTable(table));
      continue;
    }
    const value = inlineMarkdown(escapeHtml(raw));
    if (/^###\s/.test(value)) output.push(`<h5>${value.replace(/^###\s/, "")}</h5>`);
    else if (/^##\s/.test(value)) output.push(`<h4>${value.replace(/^##\s/, "")}</h4>`);
    else if (/^#\s/.test(value)) output.push(`<h3>${value.replace(/^#\s/, "")}</h3>`);
    else if (sectionHeading(raw)) output.push(`<h4>${value.replace(/^#{1,6}\s*/, "")}</h4>`);
    else if (/^>\s?/.test(value)) output.push(`<div class="agent-report-callout">${value.replace(/^>\s?/, "")}</div>`);
    else if (/^(\-|\*)\s/.test(value)) output.push(`<div class="agent-report-bullet"><i></i><span>${value.replace(/^(\-|\*)\s/, "")}</span></div>`);
    else if (/^\d+[.)]\s/.test(value)) output.push(`<div class="agent-report-numbered"><b>${value.match(/^\d+[.)]/)?.[0] || ""}</b><span>${value.replace(/^\d+[.)]\s/, "")}</span></div>`);
    else if (/^---+$/.test(raw)) output.push("<hr class=\"agent-report-divider\">");
    else output.push(`<p>${value}</p>`);
  }
  return output.join("");
};
const reportParts = (content, splitForChart = true) => {
  const lines = String(content || "暂无报告").replace(REPORT_VERSION_MARKER, "").split(/\r?\n/);
  const cleanLines = [];
  let hasRanking = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (!rankingHeading(lines[index].trim())) {
      cleanLines.push(lines[index]);
      continue;
    }
    hasRanking = true;
    index += 1;
    while (index < lines.length && !sectionHeading(lines[index].trim())) index += 1;
    index -= 1;
  }
  if (!splitForChart) return { before: renderReportLines(cleanLines), after: "", hasRanking };
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
const RoleRankingChart = ({ rows = [], title = "排名", metric = "质量记录", role = "", recipient = "", period = {} }) => <section className="agent-role-ranking-chart"><header><strong>{title}</strong><span>{metric} · 当前对象以红色标识</span></header><ReportBarChart rows={rows.map((row) => ({ ...row, name: row.displayName || (row.site && row.site !== "多基地" ? `${row.site} · ${row.name}` : row.name), color: row.selected ? "#ef4f4f" : row.site === "深圳" ? "#2f7ee6" : row.site === "杭州" ? "#8b67c7" : "#64748b" }))} height={Math.max(280, rows.length * 34 + 110)} chartKey={`agent-role-ranking-${role}-${recipient}-${period._periodStart || ""}-${period._periodEnd || ""}`} unit=""/></section>;

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(ROLE_CACHE_KEY) || "{}"); } catch { return {}; }
};
const unique = (values) => [...new Set(values.map((value) => String(value || "").trim()).filter((value) => value && !["未填写", "未配置", "待配置"].includes(value)))];
const rowValues = (row, fields) => fields.flatMap((field) => String(row?.[field] || "").split(/[、,，;；/\\|]/).map((value) => value.trim()));
const sourceRows = (files = [], modules = []) => files.filter((file) => modules.includes(file.module) && file.kind !== "IPQC_LEADER_MAP").flatMap((file) => file.rows || []);
const configFromBrowser = () => {
  try { return JSON.parse(localStorage.getItem("qms-qmdp-system-config-v1") || "{}"); } catch { return {}; }
};
const roleDateValue = (row = {}) => row["日期"] || row["检验日期"] || row["发生日期"] || row["问题日期"] || row["创建时间"] || row["需求日期"] || row["申请日期"] || row["更新日期"] || row["更新时间"] || "";
const roleDateKey = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
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
const rolePeriodDefaults = (dateRange = {}, year = "2026") => ({
  year,
  start: dateRange[`start${year}`] || `${year}-01-01`,
  end: dateRange[`end${year}`] || `${year}-12-31`,
});

const roleRecipients = (role, data = {}, files = []) => {
  const config = configFromBrowser();
  const ipqc = data.ipqc?.leaderAnalysis?.bySite?.["全公司"] || {};
  const ipqcRows = sourceRows(files, ["IPQC"]);
  const rdRows = sourceRows(files, ["OQC", "DQA", "QMS"]);
  if (role === "组装人员") return unique(rowValues({}, []).concat(ipqcRows.flatMap((row) => rowValues(row, roleSpecs[role].fields))));
  if (role === "机长") return unique([...(ipqc.leaders || []).map((row) => row.name), ...(config.supplyMappings || []).map((row) => row.leader)]);
  if (role === "交付经理") return unique([...(ipqc.managers || []).map((row) => row.name), ...(config.supplyMappings || []).map((row) => row.manager)]);
  if (role === "供应链经理") return unique([
    ...ipqcRows.flatMap((row) => rowValues(row, roleSpecs[role].fields)),
    ...(config.supplyMappings || []).flatMap((row) => rowValues(row, ["supplierManager", "供应商经理", "供应链经理"])),
    ...(config.employees || []).filter((row) => /供应商|供应链|SQE|采购/i.test(`${row.dept || ""}${row.role || ""}`)).map((row) => row.name),
    "供应链经理",
  ]);
  if (role === "研发工程师") return unique(rdRows.flatMap((row) => rowValues(row, roleSpecs[role].fields)));
  if (role === "PM") return unique([
    ...rdRows.flatMap((row) => rowValues(row, roleSpecs[role].fields)),
    ...(config.orgMappings || []).flatMap((row) => rowValues(row, ["pm", "PM"])),
  ]);
  if (role === "TPM") return unique([
    ...(data.dqa?.tpmStages || []).map((row) => row.name),
    ...(data.oqc?.tpm || []).map((row) => row.name),
    Object.values(data.qms?.tpmByDivision || {}).flat().map((row) => row.name),
    ...rdRows.flatMap((row) => rowValues(row, ["TPM"])),
  ]);
  return unique([
    ...rdRows.flatMap((row) => rowValues(row, roleSpecs[role].fields)),
    ...(config.orgMappings || []).flatMap((row) => rowValues(row, ["productionDirector", "产总"])),
  ]);
};

const recipientEvidence = (role, recipient, data, files, dateRange = {}, roleRowIndex = null) => {
  const spec = roleSpecs[role];
  const config = configFromBrowser();
  const rows = sourceRows(files, spec.modules);
  const indexed = roleRowIndex?.get(recipient);
  const matched = (indexed?.rows || rows.filter((row) => rowValues(row, spec.fields).includes(recipient))).filter((row) => roleRowInPeriod(row, dateRange));
  const related = role === "机长" ? (data.ipqc?.leaderAnalysis?.bySite?.["全公司"]?.leaders || []).filter((row) => row.name === recipient)
    : role === "交付经理" || role === "供应链经理" ? (data.ipqc?.leaderAnalysis?.bySite?.["全公司"]?.managers || []).filter((row) => row.name === recipient)
      : role === "TPM" ? (data.dqa?.tpmStages || []).filter((row) => row.name === recipient)
        : role === "PM" ? (data.qms?.risks || []).filter((row) => row.pm === recipient).slice(0, 20) : [];
  const categories = {};
  matched.forEach((row) => {
    const category = String(row["不良类型"] || row["问题类型"] || row["问题分类"] || row["阶段"] || "未分类").trim();
    if (category) categories[category] = (categories[category] || 0) + 1;
  });
  const mapping = role === "组装人员" || role === "机长" || role === "交付经理" || role === "供应链经理"
    ? (config.supplyMappings || []).filter((row) => row.leader === recipient || row.manager === recipient || row.supplierManager === recipient || row.供应链经理 === recipient).slice(0, 30)
    : (config.orgMappings || []).filter((row) => row.pm === recipient || row.tpm === recipient || row.productionDirector === recipient || row.产总 === recipient).slice(0, 30);
  const supplement = files.find((file) => file.subKind === "DQA_ENGINEER_SUPPLEMENT")?.supplement;
  let engineerMetrics = null;
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
      reviewParticipation: reviews.filter((row) => (row.members || []).includes(recipient)).length,
      reviewSuggestions: reviews.reduce((sum, row) => sum + (row.proposers || []).filter((name) => name === recipient).length, 0),
      machinedDenominator: {
        ecn: data.dqa?.machinedParts?.ecn?.totals?.[2026]?.denominator ?? null,
        nonBom: data.dqa?.machinedParts?.nonBom?.totals?.[2026]?.denominator ?? null,
      },
    };
  }
  return { role, recipient, modules: spec.modules, matchedRows: matched.length, topCategories: Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 8), related: related.slice(0, 20), mapping, engineerMetrics };
};

const individualRoles = new Set(["组装人员", "研发工程师"]);
const nonRankingRoles = new Set(["供应链经理", "产总"]);
const REPORT_PROMPT_VERSION = "role-report-v5-role-skill-ranking-chart";
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
const roleIpqcIssue = (row = {}) => String(row["不良内容"] || "").trim() ? 1 : 0;
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
const buildRoleRanking = (role, recipientNames, selectedRecipient, data, files, dateRange = {}, roleRowIndex = null) => {
  const spec = roleSpecs[role] || roleSpecs.组装人员;
  const ipqc = data.ipqc?.leaderAnalysis?.bySite?.["全公司"] || {};
  const periodIpqcRows = sourceRows(files, ["IPQC"]).filter((row) => roleRowInPeriod(row, dateRange));
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
    const source = sourceRows(files, spec.modules);
    const supplement = files.find((file) => file.subKind === "DQA_ENGINEER_SUPPLEMENT")?.supplement;
    rows = recipientNames.map((name) => {
      const matched = (roleRowIndex?.get(name)?.rows || source.filter((row) => rowValues(row, spec.fields).includes(name))).filter((row) => roleRowInPeriod(row, dateRange));
      const categories = new Set(matched.map((row) => String(row["不良类型"] || row["问题类型"] || row["问题分类"] || "").trim()).filter(Boolean));
      if (role === "研发工程师" && supplement) {
        const inRange = (value) => roleValueInPeriod(value, dateRange);
        const ecn = (supplement.ecnRecords || []).filter((row) => row.engineer === name && inRange(row.date));
        const nonBom = (supplement.nonBomRecords || []).filter((row) => row.engineer === name && inRange(row.date));
        const reviews = (supplement.reviewRecords || []).filter((row) => inRange(row.updateDate) && (row.members?.includes(name) || row.proposers?.includes(name)));
        const issueValue = ecn.length + nonBom.length + reviews.reduce((sum, row) => sum + (row.proposers || []).filter((item) => item === name).length, 0);
        return { name, site: inferRankingSite(matched, files, spec.modules, spec.fields, name), value: issueValue, detail: `ECN ${ecn.length} / 非BOM ${nonBom.length} / 评审参与 ${reviews.filter((row) => row.members?.includes(name)).length} / 意见 ${reviews.reduce((sum, row) => sum + (row.proposers || []).filter((item) => item === name).length, 0)}` };
      }
      return { name, site: inferRankingSite(matched, files, spec.modules, spec.fields, name), value: matched.length, detail: `${role === "研发工程师" ? "研发质量记录" : "本人异常"} ${matched.length} 项${categories.size ? ` · ${[...categories].slice(0, 2).join("、")}` : ""}` };
    });
  }
  recipientNames.forEach((name) => {
    if (name && !rows.some((row) => row.name === name)) rows.push({ name, site: inferRankingSite([], files, spec.modules, spec.fields, name), value: 0, detail: "当前周期暂无直接记录" });
  });
  const sorted = rows.filter((row) => row.name).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "zh-CN"));
  const selected = sorted.find((row) => row.name === selectedRecipient);
  const limited = sorted.slice(0, 12);
  if (selected && !limited.some((row) => row.name === selected.name)) limited.push(selected);
  return limited.map((row, index) => ({ ...row, rank: sorted.findIndex((item) => item.name === row.name) + 1, selected: row.name === selectedRecipient }));
};

const QMDP_QUESTIONS_KEY = "qms-qmdp-question-bank-v1";
const QMDP_EXAM_SESSIONS_KEY = "qms-qmdp-exam-sessions-v1";
const examRoleForAgent = (role) => role === "组装人员" ? "操作员" : role === "研发工程师" ? "工程师" : "";
const readQuestionBank = () => {
  try { const value = JSON.parse(localStorage.getItem(QMDP_QUESTIONS_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
};
const questionSetForAgent = (role, evidence) => {
  const roleName = examRoleForAgent(role);
  if (!roleName) return [];
  const needles = [...new Set([...(evidence?.topCategories || []), role === "组装人员" ? "IPQC" : "研发", roleName].map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  const aliases = role === "组装人员" ? ["操作员", "ipqc", "过程检验", "组装"] : ["工程师", "研发", "r&d", "dqa"];
  const scored = readQuestionBank().map((question) => {
    const scope = `${question.roles || ""} ${question.applicableRoles || ""} ${question.categories || question.category || ""}`.toLowerCase();
    const text = `${question.stem || question.question || ""} ${question.categories || question.category || ""} ${question.knowledge || ""}`.toLowerCase();
    const roleMatch = !scope.trim() || aliases.some((alias) => scope.includes(alias)) || scope.includes(roleName.toLowerCase());
    const score = needles.reduce((sum, item) => sum + (text.includes(item) ? 3 : 0), 0) + (roleMatch ? 1 : 0);
    return { question, roleMatch, score };
  }).filter((item) => item.roleMatch).sort((a, b) => b.score - a.score);
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
const createAgentExamLink = async (role, recipient, evidence) => {
  const questions = questionSetForAgent(role, evidence);
  if (!questions.length) return { markdown: "\n\n> 知识考试：题库中暂无与本人问题匹配的题目。", questionCount: 0 };
  const roleName = examRoleForAgent(role);
  let token = "";
  let expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
  try {
    const result = await createExamSession({ roleName, recipientName: recipient, issueCategories: evidence?.topCategories || [], reportId: `AGENT-${Date.now()}`, questions, questionCount: questions.length, validDays: 14 });
    token = result.token;
    expiresAt = result.expiresAt || expiresAt;
  } catch {
    token = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const sessions = JSON.parse(localStorage.getItem(QMDP_EXAM_SESSIONS_KEY) || "[]");
      localStorage.setItem(QMDP_EXAM_SESSIONS_KEY, JSON.stringify([{ token, roleName, recipientName: recipient, issueCategories: evidence?.topCategories || [], questions, expiresAt, submittedAt: "", result: null }, ...sessions].slice(0, 100)));
    } catch {}
  }
  const url = new URL("/", window.location.origin);
  url.searchParams.set("examToken", token);
  return { markdown: `\n\n## 知识考试\n- [打开答题链接](${url.toString()})（${questions.length}题，有效期至 ${examDateText(expiresAt)}）`, questionCount: questions.length, url: url.toString() };
};

const baselineForRole = (reports, modules) => modules.flatMap((module) => {
  const candidates = reports.filter((item) => item.module === module || String(item.fileName || "").includes(`QMS-Agent报告-${module}-`));
  return candidates.sort((left, right) => String(right.updatedAt || right.updated_at || "").localeCompare(String(left.updatedAt || left.updated_at || ""))).slice(0, 1);
});
const baselineMatchesModule = (item, module) => item?.module === module || String(item?.fileName || "").includes(`QMS-Agent报告-${module}-`) || String(item?.fileName || "").includes(`外部导入-${module}-`);
const hasCompleteBaseline = (files, modules) => modules.every((module) => files.some((item) => baselineMatchesModule(item, module)));
const sanitizeFileSegment = (value) => String(value || "UNKNOWN").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 180) || "UNKNOWN";
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

export function AgentRoleReportPage({ initialRole = "组装人员", data = {}, files = [], dateRange = {}, canGenerate = false, canSaveToServer = false }) {
  const role = initialRole;
  const spec = roleSpecs[role] || roleSpecs.组装人员;
  const roleSkillId = roleSkillIds[role] || "quality-role-assembly-person";
  const roleFiles = useMemo(() => role === "研发工程师" ? files : files.filter((file) => file.subKind !== "DQA_ENGINEER_SUPPLEMENT"), [role, files]);
  const [period, setPeriod] = useState(() => rolePeriodDefaults(dateRange));
  const [projectReports, setProjectReports] = useState([]);
  const [baseline, setBaseline] = useState({ contents: {}, files: [] });
  const [cacheEntry, setCacheEntry] = useState(() => readCache()[role] || null);
  const [serverRoleContent, setServerRoleContent] = useState("");
  const [roleSkill, setRoleSkill] = useState(() => ({ name: roleSkillId, content: fallbackRoleSkill(role) }));
  const [roleSkills, setRoleSkills] = useState([]);
  const [recipient, setRecipient] = useState("");
  const [state, setState] = useState({ status: "idle", message: "" });
  const abortRef = useRef(null);
  const loadedServerRoleKeyRef = useRef("");
  const recipients = useMemo(() => roleRecipients(role, data, roleFiles), [role, data, roleFiles]);
  const roleRowIndex = useMemo(() => buildRoleRowIndex(sourceRows(roleFiles, spec.modules), spec.fields), [roleFiles, spec.modules, spec.fields]);
  const roleDateRange = useMemo(() => ({ ...dateRange, _periodYear: period.year, _periodStart: period.start, _periodEnd: period.end }), [dateRange, period]);
  const sourceRevision = useMemo(() => {
    const source = roleFiles.find((file) => file.subKind === "DQA_ENGINEER_SUPPLEMENT");
    return source ? `${source.importedAt || ""}:${source.rowCount || source.rows?.length || 0}` : "";
  }, [roleFiles]);
  const sourceSignature = useMemo(() => roleSourceSignature(role, spec, baseline.files, recipients, roleDateRange, sourceRevision, roleSkill.name, roleSkill.content), [role, spec, baseline.files, recipients, roleDateRange, sourceRevision, roleSkill]);
  const selectedContent = cacheEntry?.sourceSignature === sourceSignature
    ? (cacheEntry?.reports?.[recipient] || serverRoleContent)
    : serverRoleContent;
  const cachedComplete = cacheEntry?.sourceSignature === sourceSignature && recipients.length > 0 && recipients.every((name) => cacheEntry.reports?.[name]);

  const refresh = async () => {
    setState({ status: "running", message: "正在读取 Agent 基线报告…" });
    try {
      let next = [];
      let serverReadError = "";
      try {
        const value = await loadAgentReports();
        next = Array.isArray(value?.reports) ? value.reports : [];
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
      const loaded = await Promise.all(allRequired.map(async (item) => {
        if (item.content) return [item.fileName, item.content];
        if (item.module && localRuns[item.module]?.content) return [item.fileName, localRuns[item.module].content];
        try {
          return [item.fileName, (await loadAgentReport(item.fileName)).content || ""];
        } catch {
          return [item.fileName, ""];
        }
      }));
      setProjectReports(next);
      setBaseline({ files: allRequired, contents: Object.fromEntries(loaded) });
      loadedServerRoleKeyRef.current = "";
      setServerRoleContent("");
      const missing = spec.modules.filter((module) => !allRequired.some((item) => baselineMatchesModule(item, module)));
      setState({ status: missing.length ? "idle" : "done", message: missing.length ? `缺少基线：${missing.join("、")}${serverReadError ? "（项目报告库暂不可用，可使用外部导入或本地缓存）" : ""}` : `基线已就绪（支持项目保存、外部导入和本地缓存）${serverReadError ? " · 项目报告库暂不可用" : ""}` });
    } catch (error) { setState({ status: "error", message: `读取基线失败：${error.message}` }); }
  };
  useEffect(() => {
    let active = true;
    loadAgentSkills().then((value) => {
      const skills = Array.isArray(value?.skills) ? value.skills : [];
      if (!active) return;
      setRoleSkills(skills);
      const selected = skills.find((item) => item.id === roleSkillId || item.name === roleSkillId);
      if (selected) setRoleSkill({ name: selected.name || selected.id || roleSkillId, content: selected.content || fallbackRoleSkill(role) });
    }).catch(() => {});
    return () => { active = false; };
  }, [role, roleSkillId]);
  useEffect(() => {
    loadedServerRoleKeyRef.current = "";
    setServerRoleContent("");
    setCacheEntry(readCache()[role] || null);
    setRecipient("");
    refresh();
  }, [role]);
  useEffect(() => {
    const names = recipients;
    if (!recipient || !names.includes(recipient)) setRecipient(names[0] || "");
  }, [recipients, recipient]);
  useEffect(() => {
    setPeriod((current) => current.start && current.end ? current : rolePeriodDefaults(dateRange, current.year));
  }, [dateRange.start2025, dateRange.end2025, dateRange.start2026, dateRange.end2026]);
  useEffect(() => {
    if (!recipient || cacheEntry?.sourceSignature === sourceSignature && cacheEntry?.reports?.[recipient]) return;
    const segment = sanitizeFileSegment(recipient);
    const prefix = `QMS-Agent报告-角色报告-${role}-`;
    const candidate = projectReports
      .filter((item) => String(item.fileName || "").startsWith(prefix) && String(item.fileName || "").includes(`-${segment}-`))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
    if (!candidate) return;
    const key = `${role}:${recipient}:${candidate.fileName}:${candidate.updatedAt || ""}`;
    if (loadedServerRoleKeyRef.current === key) return;
    loadedServerRoleKeyRef.current = key;
    let active = true;
    loadAgentReport(candidate.fileName)
      .then((value) => { if (active) setServerRoleContent(value?.content || ""); })
      .catch(() => { if (active) setServerRoleContent(""); });
    return () => { active = false; };
  }, [projectReports, recipient, role, cacheEntry, sourceSignature]);

  const generateAll = async () => {
    if (!canGenerate) {
      setState({ status: "error", message: "当前账号没有“生成全部角色报告”权限，请联系主管理员" });
      return;
    }
    if (!period.start || !period.end || period.start > period.end) { setState({ status: "error", message: "请选择有效的统计年份和时间段" }); return; }
    if (!hasCompleteBaseline(baseline.files, spec.modules)) { setState({ status: "error", message: `请先在对应模块 Agent 中生成、保存或导入报告：${spec.modules.filter((module) => !baseline.files.some((item) => baselineMatchesModule(item, module))).join("、")}` }); return; }
    if (!recipients.length) { setState({ status: "error", message: "没有找到可用的人员名单，请先检查原始数据或映射表" }); return; }
    if (cachedComplete && !window.confirm("该角色的人员报告已经全部生成并缓存，是否继续重新生成？")) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const restart = cachedComplete;
    const reports = restart ? {} : (cacheEntry?.sourceSignature === sourceSignature ? { ...(cacheEntry.reports || {}) } : {});
    setState({ status: "running", message: `正在批量生成 ${role} 报告（${Object.keys(reports).length}/${recipients.length}）…` });
    try {
      let autoSaved = 0;
      let autoSaveError = "";
      const baselineText = spec.modules.map((module) => {
        const item = baseline.files.find((report) => report.module === module || report.fileName.includes(`QMS-Agent报告-${module}-`));
        return `\n===== ${module} Agent =====\n${baseline.contents[item?.fileName] || ""}`;
      }).join("\n").slice(0, 80000);
      for (let index = 0; index < recipients.length; index += 1) {
        if (controller.signal.aborted) throw new DOMException("aborted", "AbortError");
        const name = recipients[index];
        if (reports[name]) {
          setState({ status: "running", message: `正在使用缓存 ${role} 报告（${index + 1}/${recipients.length}）…` });
          continue;
        }
        const evidence = recipientEvidence(role, name, data, roleFiles, roleDateRange, roleRowIndex);
        const managerInstruction = individualRoles.has(role)
          ? "这是当事人报告，必须具体列出本人问题、问题类型、数量、证据和改善动作。"
          : "这是管理者报告，不要写管理者本人犯了什么问题，也不要虚构个人问题；只展示其管理范围、下属质量汇总、TOP责任单元、管理风险、需要向上级汇报的事项和管理动作。";
        const result = await requestAiChat([
          { role: "system", content: `你是质量分析 Agent 的角色闭环报告生成器。只能使用输入的固定 Agent报告和人员证据，不得新增数字，不得用上级数据冒充本人。${managerInstruction}报告必须包含：结果指标、过程暴露、根因证据/待核实、责任链汇报、改善措施、30/60/90天待办、验证指标和关闭条件。输出结构化 Markdown，使用一级/二级标题、表格和清晰列表；排名章节只输出章节标题，不要生成排名数据表，系统会在该标题下插入统一排名图表。必须严格执行角色 Skill，不得违反其中的角色边界、数据口径和禁止事项。\n\n角色 Skill：\n${roleSkill.content}` },
          { role: "user", content: `角色：${role}\n角色 Skill 名称：${roleSkill.name}\n责任链：${spec.chain}\n统计年份：${roleDateRange._periodYear}\n统计周期：${roleDateRange._periodStart}—${roleDateRange._periodEnd}\n当前人员：${name}\n本人员工证据摘要：${JSON.stringify(evidence)}\n排名图表数据（只可引用，不得重算）：${JSON.stringify(rankingRows)}\n基线 Agent 报告：${baselineText}\n${managerInstruction}\n请只输出该人员的 Markdown 报告；没有证据的部分写“待核实”，不得把下属问题写成管理者个人问题。` },
        ], { max_tokens: 3000, agent: true, operation: "agent-role-report-generate", signal: controller.signal });
        let reportContent = result.content || "暂无报告";
        if (individualRoles.has(role)) {
          const exam = await createAgentExamLink(role, name, evidence);
          reportContent += exam.markdown;
        }
        reportContent = `${reportContent.trim()}\n\n${REPORT_VERSION_MARKER}`;
        reports[name] = reportContent;
        try {
          const saved = canSaveToServer
            ? await saveAgentReportFile({ module: `角色报告-${role}`, role, recipient: name, skillName: roleSkill.name, period: roleDateRange, content: reportContent })
            : saveLocalAgentReport({ module: `角色报告-${role}`, role, recipient: name, skillName: roleSkill.name, period: roleDateRange, content: reportContent });
          autoSaved += 1;
          autoSaveError = saved.relativePath || saved.fileName || autoSaveError;
        } catch (error) {
          autoSaveError = error?.message || "项目报告库保存失败，已保留本地缓存";
        }
        setCacheEntry({ role, sourceSignature, generatedAt: new Date().toISOString(), reports });
        // Persist in batches. Serializing the complete report map for every person makes
        // large role lists quadratic and blocks the main thread.
        if (index % 10 === 9 || index === recipients.length - 1) {
          localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ ...readCache(), [role]: { role, sourceSignature, generatedAt: new Date().toISOString(), reports: { ...reports } } }));
        }
        setRecipient(name);
        setState({ status: "running", message: `正在批量生成 ${role} 报告（${index + 1}/${recipients.length}）…` });
      }
      setCacheEntry({ role, sourceSignature, generatedAt: new Date().toISOString(), reports });
      localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ ...readCache(), [role]: { role, sourceSignature, generatedAt: new Date().toISOString(), reports } }));
      setState({ status: "done", message: autoSaved === recipients.length ? `已生成、自动保存并缓存 ${recipients.length} 份 ${role} 报告 · ${autoSaveError}` : `已生成并缓存 ${recipients.length} 份 ${role} 报告；项目自动保存 ${autoSaved}/${recipients.length}，${autoSaveError || "其余报告保留在本地缓存"}` });
    } catch (error) {
      setState({ status: "error", message: error?.name === "AbortError" || controller.signal.aborted ? "已停止批量生成，已完成报告已缓存，可继续生成" : `批量生成失败：${error.message}` });
    } finally { if (abortRef.current === controller) abortRef.current = null; }
  };

  const stop = () => abortRef.current?.abort();
  const save = async () => {
    if (!selectedContent || !recipient) return;
    setState({ status: "running", message: "正在保存角色报告…" });
    try {
      const result = canSaveToServer
        ? await saveAgentReportFile({ module: `角色报告-${role}`, role, recipient, skillName: roleSkill.name, period: roleDateRange, content: selectedContent })
        : saveLocalAgentReport({ module: `角色报告-${role}`, role, recipient, skillName: roleSkill.name, period: roleDateRange, content: selectedContent });
      setState({ status: "done", message: canSaveToServer ? `已保存到服务器：${result.relativePath || result.fileName}` : `已保存到本机：${result.fileName}` });
      await refresh();
    } catch (error) { setState({ status: "error", message: `保存失败：${error.message}` }); }
  };
  const dispatch = async () => {
    if (!canSaveToServer) { setState({ status: "error", message: "普通用户不能创建服务器发送任务" }); return; }
    if (!selectedContent || !recipient) { setState({ status: "error", message: "请先生成并选择人员报告" }); return; }
    setState({ status: "running", message: "正在创建角色发送任务…" });
    try {
      const report = await saveAgentReportFile({ module: `角色报告-${role}`, role, recipient, skillName: roleSkill.name, period: roleDateRange, content: selectedContent });
      const task = await saveAgentDispatch({ feature: "qualityAgent", agentTitle: "质量分析 Agent", module: `角色报告-${role}`, role, recipient, skillName: roleSkill.name, reportFileName: report.fileName, reportPath: report.relativePath, period: roleDateRange });
      setState({ status: "done", message: `已创建待发送任务：${task.relativePath || task.fileName}` });
    } catch (error) { setState({ status: "error", message: `创建发送任务失败：${error.message}` }); }
  };
  const rankingRows = useMemo(() => nonRankingRoles.has(role) ? [] : buildRoleRanking(role, recipients, recipient, data, roleFiles, roleDateRange, roleRowIndex), [role, recipients, recipient, data, roleFiles, roleDateRange, roleRowIndex]);
  const rankingTitle = individualRoles.has(role) ? "个人问题排名" : "管理范围排名";
  const rankingMetric = individualRoles.has(role) ? "本人质量记录" : "管理范围异常";
  const reportContentParts = selectedContent ? reportParts(selectedContent, !nonRankingRoles.has(role)) : { before: "", after: "", hasRanking: false };
  const selectRoleSkill = (name) => {
    const selected = roleSkills.find((item) => (item.name || item.id) === name);
    if (selected) setRoleSkill({ name: selected.name || selected.id, content: selected.content || fallbackRoleSkill(role) });
  };

  return <div className="qmdp-page quality-agent-page">
    <div className="quality-agent-hero"><div><span className="qmdp-eyebrow">QUALITY ANALYSIS AGENT / ROLE REPORT</span><h2>Agent角色报告 · {role}</h2><p>按责任链批量生成并缓存人员报告，选择人员查看本人问题、上级汇报、改善行动和闭环待办。</p></div><Brain size={42} weight="duotone" /></div>
    <section className="qmdp-card quality-agent-controls">
      <label>角色链路<span className="quality-agent-inline-value">{spec.chain}</span></label><label>角色 Skill<select value={roleSkill.name} onChange={(event) => selectRoleSkill(event.target.value)} disabled={!roleSkills.length}><option value={roleSkill.name}>{roleSkill.name}</option>{roleSkills.filter((item) => (item.name || item.id) !== roleSkill.name).map((item) => <option key={item.id || item.name} value={item.name || item.id}>{item.name || item.id}</option>)}</select></label>
      <label className="quality-agent-period-year">统计年份<select value={period.year} onChange={(event) => setPeriod(rolePeriodDefaults(dateRange, event.target.value))}><option value="2026">2026</option><option value="2025">2025</option></select></label><label>开始日期<input type="date" value={period.start} onChange={(event) => setPeriod((current) => ({ ...current, start: event.target.value }))}/></label><label>结束日期<input type="date" value={period.end} onChange={(event) => setPeriod((current) => ({ ...current, end: event.target.value }))}/></label>
      <label>人员<select value={recipient} onChange={(event) => setRecipient(event.target.value)}><option value="">请选择人员</option>{recipients.map((name) => <option key={name}>{name}</option>)}</select></label>
      {period.start > period.end && <span className="quality-agent-period-invalid">日期范围无效</span>}
      <span>基线：{spec.modules.join(" + ")} · 缓存：{cachedComplete ? "已完成" : `${Object.keys(cacheEntry?.reports || {}).length}/${recipients.length}`}</span>
      <button className="qmdp-secondary-btn" onClick={refresh} disabled={state.status === "running"}><ArrowsClockwise size={15}/>刷新基线</button>
      {state.status === "running" && abortRef.current ? <button className="qmdp-danger-btn" onClick={stop}><WarningCircle size={15}/>停止批量生成</button> : <button className="qmdp-primary-btn" onClick={generateAll} disabled={!canGenerate} title={!canGenerate ? "仅主管理员可以生成全部角色报告" : "生成全部角色报告"}><Brain size={16}/>{cachedComplete ? "重新生成全部报告" : "生成全部角色报告"}</button>}
    </section>
    <section className="qmdp-card quality-agent-base-preview"><header><strong>角色报告基线</strong><span>{baseline.files.map((item) => `${item.module || spec.modules.find((module) => baselineMatchesModule(item, module))} · ${item.imported ? "外部导入" : item.fileName.startsWith("本地缓存-") ? "本地缓存" : "项目报告库"}`).join("、") || "尚未找到对应 Agent 报告"}</span></header><p>供应链角色只使用 IPQC Agent；研发角色同时使用 OQC、DQA、QMS Agent。个人证据不足时报告必须标记“待核实”。外部导入报告仅作为角色报告基线使用，不会覆盖项目报告库。</p></section>
    {selectedContent && <section className="qmdp-card quality-agent-report"><header><strong>{role} · {recipient}</strong><div><button className="qmdp-primary-btn" onClick={save}><FloppyDisk size={15}/>保存报告</button>{canSaveToServer && <button className="qmdp-primary-btn" onClick={dispatch}><PaperPlaneTilt size={15}/>创建发送任务</button>}</div></header><div className="quality-agent-report-content" dangerouslySetInnerHTML={{ __html: reportContentParts.before }}/>{rankingRows.length > 0 && <RoleRankingChart rows={rankingRows} title={rankingTitle} metric={rankingMetric} role={role} recipient={recipient} period={roleDateRange}/>}<div className="quality-agent-report-content" dangerouslySetInnerHTML={{ __html: reportContentParts.after }}/></section>}
    {!selectedContent && <section className="qmdp-card quality-agent-report"><header><strong>请选择人员查看报告</strong><span>{cachedComplete ? "缓存已完成" : "请先生成全部角色报告"}</span></header></section>}
    {state.message && <div className={`quality-agent-save-state ${state.status}`}><WarningCircle size={16}/>{state.message}</div>}
  </div>;
}
