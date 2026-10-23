import { loadQualityAgentSnapshotRegistry, requestAiChat, searchAiWeb } from "../dataStore.js";
import { wantsOutside } from "./aiEmployeeSkill.js";

const MODULES = ["IQC", "IPQC", "OQC", "DQA", "DOAM", "QMS"];
let cached = { at: 0, book: null };

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const percent = (value) => {
  const parsed = num(value);
  if (parsed == null) return null;
  return String(Math.round(parsed * 100) / 100) + "%";
};
const monthOf = (row) => {
  const numbered = num(row?.monthNumber);
  if (numbered >= 1 && numbered <= 12) return numbered;
  const key = String(row?.key || "");
  const fromKey = key.match(/^(20\d{2})-(\d{2})$/);
  if (fromKey) return Number(fromKey[2]);
  const text = String(row?.month ?? "").trim();
  const plain = text.match(/^(\d{1,2})$/);
  if (plain && Number(plain[1]) >= 1 && Number(plain[1]) <= 12) return Number(plain[1]);
  const labeled = text.match(/(\d{1,2})\s*月/);
  if (labeled && Number(labeled[1]) >= 1 && Number(labeled[1]) <= 12) return Number(labeled[1]);
  return 0;
};
const stamp = (year, month) => year + "-" + String(month).padStart(2, "0");
const bodyOf = (entry) => {
  const snap = entry?.snapshot && typeof entry.snapshot === "object" ? entry.snapshot : {};
  return snap.data && typeof snap.data === "object" ? snap.data : snap;
};
const yieldOf = (row) => {
  const inspected = num(row?.inspected);
  const bad = num(row?.bad);
  if (inspected > 0 && bad != null) return percent((inspected - bad) / inspected * 100);
  return null;
};

const monthRows = (module, body, year) => {
  if (module === "IQC") {
    return (body?.iqcSplit?.monthly || []).map((row) => {
      const month = monthOf(row);
      if (!month) return null;
      return { 月: stamp(year, month), 来料良率: yieldOf(row), 不合格率: percent(row.rate), 检验批次: row.inspected, 不合格批次: row.bad };
    }).filter(Boolean);
  }
  if (module === "IPQC") {
    return (body?.ipqcSplit?.monthly || []).map((row) => {
      const month = monthOf(row);
      if (!month) return null;
      return { 月: stamp(year, month), 异常密度: percent(row.rate), 检验数: row.inspected, 异常数: row.bad };
    }).filter(Boolean);
  }
  if (module === "OQC") {
    return (body?.oqcSplit?.monthly || []).map((row) => {
      const month = monthOf(row);
      if (!month) return null;
      return { 月: stamp(year, month), 五分率: percent(row.fiveRate), 低分率: percent(row.lowRate), 台数: row.count, 五分台数: row.five, 低分台数: row.low };
    }).filter(Boolean);
  }
  if (module === "DOAM") {
    return (body?.doamSplit?.monthly || []).map((row) => {
      const month = monthOf(row);
      if (!month) return null;
      return { 月: stamp(year, month), 告警次数: row.alarms, 班次: row.shifts, 班均告警: row.average };
    }).filter(Boolean);
  }
  if (module === "DQA") {
    const parts = new Map((body?.dqaSplit?.partMonthly || []).map((row) => [monthOf(row), row]));
    return (body?.dqaSplit?.monthFacts || []).map((row) => {
      const month = monthOf(row);
      const part = parts.get(month) || {};
      if (!month) return null;
      const issues = Array.isArray(row.issues) ? row.issues.reduce((sum, item) => sum + (num(item?.count) || 0), 0) : null;
      return { 月: stamp(year, month), 研发问题: issues, ECN加工件: part.ecn, 非BOM加工件: part.nonBom, ECN加工件比例: percent(part.ecnRate), 非BOM加工件比例: percent(part.nonBomRate) };
    }).filter(Boolean);
  }
  return [];
};

const extraOf = (module, body) => {
  if (module === "IQC") {
    return { 供应商汇总: (body?.iqcSplit?.suppliers || []).slice(0, 12).map((row) => ({ 名称: row.name, 地点: row.site, 检验批次: row.inspected, 不合格批次: row.bad, 不合格率: percent(row.rate), 来料良率: yieldOf(row) })) };
  }
  if (module === "IPQC") {
    return {
      工坊汇总: (body?.ipqcSplit?.workshops || []).slice(0, 12).map((row) => ({ 工坊: row.workshop, 地点: row.site, 检验数: row.inspected, 异常数: row.bad, 异常密度: percent(row.rate) })),
      单元汇总: (body?.ipqcSplit?.cells || []).slice(0, 12).map((row) => ({ 名称: row.name, 检验数: row.inspected, 异常数: row.bad, 异常密度: percent(row.rate) })),
    };
  }
  if (module === "OQC") {
    return { 产品部汇总: (body?.oqcSplit?.divisions || []).slice(0, 8).map((row) => ({ 名称: row.name, 台数: row.count, 五分率: percent(row.fiveRate), 低分率: percent(row.lowRate) })) };
  }
  if (module === "DQA") {
    return {
      TPM: (body?.dqaSplit?.tpms || []).slice(0, 12).map((row) => ({ 产品部: row.division, TPM: row.name, 研发问题: row.issues, ECN加工件比例: percent(row.ecnMachinedRate), 非BOM加工件比例: percent(row.nonBomMachinedRate) })),
      问题分类: (body?.dqaSplit?.categories || []).slice(0, 8).map((row) => ({ 名称: row.name, 数量: row.count })),
    };
  }
  if (module === "DOAM") {
    return { 告警分类: (body?.doamSplit?.categories || []).slice(0, 8).map((row) => ({ 名称: row.name, 次数: row.count })) };
  }
  if (module === "QMS") {
    const split = body?.qmsSplit || {};
    return {
      半年: (split.periods || []).map((row) => ({ 周期: row.name || row.period, 样本: row.samples, 平均分: row.avg, 低分条数: row.lowCount, 低分率: percent(row.lowRate) })),
      产品部: (split.divisions || []).map((row) => ({ 名称: row.name, 样本: row.samples, 平均分: row.avg, 低分率: percent(row.lowRate) })),
    };
  }
  return {};
};

export const compactEntry = (module, entry) => {
  const body = bodyOf(entry);
  const year = num(String(entry?.dateRange?.periodKey || "").slice(0, 4)) || new Date().getFullYear();
  const months = monthRows(module, body, year).sort((left, right) => left.月.localeCompare(right.月));
  const extra = extraOf(module, body);
  const hasExtra = Object.values(extra).some((item) => Array.isArray(item) && item.length);
  if (!months.length && !hasExtra) return null;
  return { 快照: entry?.dateRange?.periodKey || "", 月份: months, ...extra };
};

const candidates = (history, module) => (Array.isArray(history) ? history : [])
  .filter((entry) => entry?.module === module && entry?.id && (!entry.status || entry.status === "ready"))
  .filter((entry) => (entry?.dateRange?.granularity || entry?.granularity) === "month" && String(entry?.dateRange?.periodKey || "").startsWith("2026-"))
  .sort((left, right) => String(right.generatedAt || "").localeCompare(String(left.generatedAt || "")));

export const buildCompanyBook = async () => {
  if (cached.book && Date.now() - cached.at < 5 * 60 * 1000) return cached.book;
  const index = await loadQualityAgentSnapshotRegistry({ indexOnly: true });
  const history = index?.history || [];
  const book = {};
  for (const module of MODULES) {
    let packed = null;
    for (const meta of candidates(history, module).slice(0, 3)) {
      const loaded = await loadQualityAgentSnapshotRegistry({ entryId: meta.id });
      packed = compactEntry(module, loaded?.history?.[0] || meta);
      if (packed?.月份?.length) break;
    }
    book[module] = packed || { 月份: [], 说明: "这个模块没有读到可用月份数据" };
  }
  cached = { at: Date.now(), book };
  return book;
};

const mentioned = (question) => {
  const text = String(question || "");
  return {
    IQC: /来料|IQC|供应商|进料/.test(text),
    IPQC: /IPQC|组装|异常密度|过程|工坊|车间/.test(text),
    OQC: /OQC|出货|五分|5分|低分/.test(text),
    DQA: /DQA|研发|ECN|加工件|TPM|设计/.test(text),
    DOAM: /DOAM|告警|机台/.test(text),
    QMS: /QMS|客户|满意|投诉|半年/.test(text),
  };
};

export const viewForQuestion = (book, question) => {
  const flags = mentioned(question);
  const any = Object.values(flags).some(Boolean);
  const view = {};
  MODULES.forEach((module) => {
    const packed = book?.[module] || {};
    if (any && !flags[module]) return;
    const block = { 月份: packed.月份 || [] };
    if (flags[module]) {
      Object.entries(packed).forEach(([key, value]) => {
        if (key !== "月份" && key !== "快照") block[key] = value;
      });
    }
    view[module] = block;
  });
  return view;
};

const relatedWeb = (question, rows) => {
  const terms = String(question || "").replace(/\d+\s*月(份)?/g, "").split(/[的是多少吗？?，,。\s]+/).filter((item) => item.length >= 2 && !/^\d+$/.test(item));
  return (rows || []).filter((item) => terms.some((term) => (String(item.title || "") + String(item.snippet || "")).includes(term))).slice(0, 4);
};

const companyRules = (skill) => {
  const part = String(skill || "").split("## 本公司口径")[1] || "";
  return part.split("## ")[0].trim();
};

export const runEmployeeTurn = async ({ question, history = [], addedRules = [], skill = "" } = {}) => {
  const book = await buildCompanyBook();
  const view = viewForQuestion(book, question);
  let web = [];
  if (wantsOutside(question)) {
    const query = String(question || "").replace(/\d+\s*月(份)?/g, " ").replace(/是多少|为什么你读不到|再查一下/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    try {
      const found = await searchAiWeb(query || question);
      web = relatedWeb(query || question, found?.results || []);
    } catch {
      web = [];
    }
  }
  const rules = [companyRules(skill), ...(addedRules || []).map((line) => "- " + line)].filter(Boolean).join("\n");
  const system = [
    "你是质量总监的专属助手。回答前先用下面的公司数据，再作判断。",
    "数字只能来自公司数据。问哪个月，就读那一行。没有这一行才写未提供。不要用别的模块代替，也不要把抬头汇总数当成单月。",
    "来料良率是合格批次除以检验批次。IPQC异常密度是异常数除以检验数。OQC五分率、低分率是表里的百分比。DOAM班均告警不是客户不良。供应商、工坊、产品部、TPM这些汇总是整段快照，不是单月，除非表里按月分开。",
    rules ? "本公司口径：\n" + rules : "",
    web.length ? "下面如果附了网页，只能当作外部做法，要说明不是公司已经做的事，并写出标题。无关网页不要列。" : "这一问没有查网页。不要写链接，不要写这次没查到，也不要说不能联网。",
    "公司数据：\n" + JSON.stringify(view),
  ].filter(Boolean).join("\n");
  const turns = (history || []).slice(-6).map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: String(item.content || "").slice(0, 1500) })).filter((item) => item.content);
  const webText = web.length ? "\n\n外部网页：\n" + web.map((item, index) => (index + 1) + ". " + item.title + " " + item.url).join("\n") : "";
  const result = await requestAiChat([{ role: "system", content: system }, ...turns, { role: "user", content: String(question || "") + webText }], { max_tokens: 1200, agent: true, operation: "ai-employee-chat" });
  let content = String(result?.content || "").trim();
  if (!content) throw new Error("没有回答");
  content = content.replace(/\n+这一轮检索到的是下面几条[\s\S]*$/, "").replace(/\n+本次查到的网页：[\s\S]*$/, "").trim();
  return { content };
};

const defectText = (rows) => (rows || []).slice(0, 2).map((item) => String(item?.name || "") + (item?.count != null ? item.count + "批" : "")).filter(Boolean).join("、");

const showMonth = (row) => {
  if (!row || !row.月) return row;
  const match = String(row.月).match(/^\d{4}-0?(\d{1,2})$/);
  return match ? { ...row, 月: Number(match[1]) + "月" } : row;
};
const showMonths = (rows) => (rows || []).map(showMonth);

export const buildBriefFacts = async (period) => {
  const index = await loadQualityAgentSnapshotRegistry({ indexOnly: true });
  const history = index?.history || [];
  const load = async (module) => {
    for (const meta of candidates(history, module).slice(0, 3)) {
      const loaded = await loadQualityAgentSnapshotRegistry({ entryId: meta.id });
      const entry = loaded?.history?.[0] || meta;
      const packed = compactEntry(module, entry);
      if (packed?.月份?.length || module === "QMS") return { body: bodyOf(entry), packed };
    }
    return null;
  };
  const [iqc, ipqc, oqc, dqa, doam, qms] = await Promise.all(["IQC", "IPQC", "OQC", "DQA", "DOAM", "QMS"].map(load));
  const iqcBody = iqc?.body?.iqcSplit || {};
  const ipqcBody = ipqc?.body?.ipqcSplit || {};
  const oqcBody = oqc?.body?.oqcSplit || {};
  const dqaBody = dqa?.body?.dqaSplit || {};
  const doamBody = doam?.body?.doamSplit || {};
  const qmsBody = qms?.body?.qmsSplit || {};
  return JSON.stringify({
    统计月: period?.label || "",
    出货: {
      月份: showMonths(oqc?.packed?.月份),
      产品部: (oqcBody.divisions || []).map((row) => ({ 名称: row.name, 本月台数: row.count, 本月五分率: percent(row.fiveRate), 本月平均分: row.avg, 本月低分率: percent(row.lowRate), 上月台数: row.previousCount, 上月五分率: percent(row.previousFiveRate) })),
      低于标准的人: (oqcBody.focus || []).map((row) => ({ 姓名: row.name, 产品部: row.division, 台数: row.count, 五分率: percent(row.fiveRate), 平均分: row.avg, 低分率: percent(row.lowRate) })),
      治具和自动化: (oqcBody.machines || []).map((row) => ({ 类别: row.name, 台数: row.count, 五分台数: row.five, 五分率: percent(row.fiveRate), 平均分: row.avg, 低分率: percent(row.lowRate) })),
    },
    来料: {
      月份: showMonths(iqc?.packed?.月份),
      来源: (iqcBody.cells || []).map((row) => ({ 名称: row.name, 本月不合格率: percent(row.rate), 上月不合格率: percent(row.previousRate), 本月检验批次: row.inspected, 本月不合格批次: row.bad, 主要缺陷: defectText(row.defects) })),
      重复供应商: ((iqc?.body?.localPareto || {}).organizationPareto || []).slice(0, 3).map((row) => ({ 名称: row.name, 不合格批: row.value, 占比: percent(row.share), 累计占比: percent(row.cumulativeShare) })),
    },
    组装: {
      月份: showMonths(ipqc?.packed?.月份),
      工坊: (ipqcBody.cells || []).map((row) => ({ 名称: row.name, 本月异常密度: percent(row.rate), 上月异常密度: percent(row.previousRate), 检验数: row.inspected, 异常数: row.bad })),
      偏高的人: (ipqcBody.focus || []).slice(0, 5).map((row) => ({ 姓名: row.manager, 来源: row.source, 异常密度: percent(row.rate), 所在格: percent(row.cellRate), 检验数: row.inspected, 主要缺陷: defectText(row.topDefects) })),
    },
    研发: {
      问题条数: dqaBody.totals?.issues ?? null,
      上月问题条数: dqaBody.totals?.previousIssues ?? null,
      评审次数: dqaBody.totals?.reviews ?? null,
      最多的一类: (dqaBody.categories || [])[0] ? { 名称: dqaBody.categories[0].name, 数量: dqaBody.categories[0].count } : null,
      产品部: (dqaBody.divisions || []).map((row) => ({ 名称: row.name, 本月问题: row.issues, 上月问题: row.previousIssues, ECN条数比例: percent(row.ecnRate), 加工件ECN比例: percent(row.ecnMachinedRate), 非BOM加工件比例: percent(row.nonBomMachinedRate), 评审次数: row.reviews })),
      加工件月份: showMonths(dqa?.packed?.月份),
    },
    机台: {
      月份: showMonths(doam?.packed?.月份),
      人员: (doamBody.tpms || []).map((row) => ({ 姓名: row.name, 产品部: row.division, 班均告警: row.average })),
    },
    客户: qmsBody.periods ? (qms?.packed?.半年 || []) : [],
  });
};
