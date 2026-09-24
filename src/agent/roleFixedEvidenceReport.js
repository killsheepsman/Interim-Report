import { appendConfirmedKnowledgeToReport } from "./roleKnowledgeEvidence.js";
import { keepActiveWeekChartRows, teamMemberSpecForRole } from "./roleSnapshotRegistry.js";

export const TIMEOUT_FALLBACK_MARKER = "<!-- qms-role-timeout-fallback -->";
export const TIMEOUT_FALLBACK_NOTE = "模型超时，本页仅保存固定证据，不含模型分析正文。";

const numberText = (value, suffix = "") => {
  if (value === null || value === undefined || value === "") return "待核实";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric}${suffix}` : String(value);
};
const percentText = (value) => {
  if (value === null || value === undefined || value === "") return "待核实";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "待核实";
  return `${numeric > 1 ? numeric.toFixed(2) : (numeric * 100).toFixed(2)}%`;
};
const reasonRows = (value) => (Array.isArray(value) ? value : []).map((item) => (Array.isArray(item) ? { name: item[0], count: item[1] } : item)).filter((item) => item && (item.name || item.count));

export const hasTimeoutFallbackMarker = (content = "") => String(content || "").includes("qms-role-timeout-fallback");

const roleDutyLabel = (role = "") => ({
  组装人员: "组装",
  研发工程师: "设计",
  机长: "班组",
  交付经理: "交付",
  供应链经理: "供应链",
  TPM: "技术",
  PM: "项目",
  产品部负责人: "产品部",
}[role] || "质量");

export const periodLabel = (period = {}) => {
  const start = String(period._periodStart || period.start || "").trim();
  const end = String(period._periodEnd || period.end || "").trim();
  const parse = (value) => {
    const match = String(value || "").match(/(20\d{2})-(\d{1,2})(?:-(\d{1,2}))?/);
    return match ? { year: match[1], month: String(Number(match[2])) } : null;
  };
  const from = parse(start);
  const to = parse(end);
  if (!from && !to) return "本期";
  if (from && to && from.year === to.year && from.month === to.month) return `${from.year}年${from.month}月`;
  if (from && to && from.year === to.year) return `${from.year}年${from.month}月至${to.month}月`;
  if (from && to) return `${from.year}年${from.month}月至${to.year}年${to.month}月`;
  return from ? `${from.year}年${from.month}月以来` : "本期";
};

export const reportTitlePeriod = (period = {}) => {
  const start = String(period._periodStart || period.start || "").trim();
  const end = String(period._periodEnd || period.end || "").trim();
  const parse = (value) => {
    const match = String(value || "").match(/(20\d{2})-(\d{1,2})(?:-(\d{1,2}))?/);
    return match ? { year: match[1], month: String(Number(match[2])) } : null;
  };
  const from = parse(start);
  const to = parse(end);
  if (!from && !to) return "";
  if (from && to && from.year === to.year && from.month === to.month) return `${from.month}月`;
  if (from && to && from.year === to.year) return `${from.month}至${to.month}月`;
  if (from && to) return `${from.year}年${from.month}月至${to.year}年${to.month}月`;
  return from ? `${from.month}月` : "";
};

const fillGreeting = (template, name, when) => String(template || "")
  .replaceAll("{name}", name)
  .replaceAll("{when}", when);

const ATTENTION_GREETINGS = {
  组装人员: [
    "亲爱的同事{name}，您好。感谢您在{when}一线组装的付出。现将您本期组装质量结果如实汇总，请认真复盘。有问题不可怕，把重复的拦住，就是对公司最大的帮助。",
    "{name}，您好。{when}您一直在岗位上交付，这份报告只对您本人的质量结果，方便您对照改进。后面数据不回避，也请相信：改得过来。",
    "{name}，谢谢{when}的辛苦作业。质量部把您本期组装结果摊开给您看，不是定您的对错，是帮您看清下次送检前该盯哪几步。",
    "亲爱的同事{name}，您好。{when}您做了不少台，质量数字有好有差，我们都按事实写。请收下这份复盘，咱们一起把问题关在您手里。",
  ],
  机长: [
    "{name}机长，您好。感谢您在{when}带班。这份报告看的是班组质量，不是给您个人扣分。请带着组员一起看，把重复问题拦住。",
    "{name}，您好。{when}班组走下来不容易。下面是组内质量事实，请您组织复盘。班组有短板不可怕，怕的是看不见。",
    "{name}机长，谢谢您{when}盯现场。质量部把班组结果如实给您，方便您带人改。改到位了，就是对交付最大的支持。",
    "{name}，您好。{when}您的班组质量结果如下。请先看人、再看问题，带着大家把能当场拦住的拦住。",
  ],
  交付经理: [
    "{name}经理，您好。感谢您在{when}扛交付。这份报告看管辖范围的质量结果，请您组织机长复盘。压力大也要把事实看清。",
    "{name}，您好。{when}交付不容易。下面不回避质量数字，也请您放心：质量部是来帮您把风险提前拦住的。",
    "{name}经理，谢谢{when}的统筹。请对照管辖范围内的质量结果，带着机长把重复问题压下去。",
    "{name}，您好。{when}您这边的交付质量如实汇总如下。请认真看，和班组一起把流出风险关住。",
  ],
  供应链经理: [
    "{name}经理，您好。感谢您在{when}抓供应链质量。这份报告看各交付线的结果，请您带着经理们复盘。数字不好也先看清，再一起改。",
    "{name}，您好。{when}供应链压力不小。下面是质量事实，不藏也不夸。请组织各交付线把重复问题压住。",
    "{name}经理，谢谢{when}的统筹。质量部把供应链质量摊开给您，方便您抓重点、带团队改。",
    "{name}，您好。{when}您管辖范围的质量结果如下。请认真复盘，我们一起把系统性问题拦住。",
  ],
  研发工程师: [
    "亲爱的同事{name}，您好。感谢您在{when}的设计付出。现将您本期设计质量结果如实汇总。问题写在纸上，是为了下一份输出不再踩同样的坑。",
    "{name}，您好。{when}您做了不少设计。这份报告只对您本人的质量结果，不回避，也不否定您的贡献。请对照后，在下一份发布前把关。",
    "{name}，谢谢{when}的投入。质量部把您本期设计问题摊开，方便您改。改在图纸上，比改在现场便宜得多。",
    "亲爱的同事{name}，您好。{when}设计质量结果如下。请认真复盘，我们一起把问题挡在发布前。",
  ],
  PM: [
    "{name}，您好。感谢您在{when}把项目往前推。这份报告看项目质量结果，请带着工程师复盘。进度紧也不能把问题留给现场。",
    "{name} PM，您好。{when}项目不容易。下面是质量事实，请组织责任工程师改到位。",
    "{name}，谢谢{when}的协调。质量部把项目质量摊开给您，方便您排优先级、盯关闭。",
    "{name}，您好。{when}您负责项目的质量结果如下。请认真看，带着研发把风险关在设计侧。",
  ],
  TPM: [
    "{name}，您好。感谢您在{when}抓技术质量。这份报告看跨项目的质量结果，请带着工程师和 PM 复盘。机制改对了，大家都会轻松。",
    "{name} TPM，您好。{when}技术线压力不小。下面不回避质量事实，请您抓重复问题和共性问题。",
    "{name}，谢谢{when}的把关。质量部把技术质量摊开给您，方便您推动可复用的改法。",
    "{name}，您好。{when}跨项目质量结果如下。请认真复盘，我们一起把共性问题一次改掉。",
  ],
  产总: [
    "{name}，谢谢{when}的决策支持。质量部把产品线质量摊开给您，方便您抓重点、给资源。",
    "{name}，您好。{when}产品部质量结果如下。请先查阅，我们一起把质量当成产品竞争力来抓。",
  ],
};

const GOOD_GREETINGS = {
  组装人员: [
    "亲爱的同事{name}，您好。感谢您在{when}的稳定作业。本期组装质量整体可控，请继续保持，把好的做法坚持下去。",
    "{name}，您好。{when}您的组装结果比较扎实，质量部看在眼里。请再接再厉，别让小问题溜过去。",
    "亲爱的同事{name}，谢谢{when}的认真。本期质量状态不错，请继续守住，下一批同样按标准来。",
  ],
  机长: [
    "{name}机长，您好。感谢您在{when}把班组质量稳住了。请继续带着大家守标准，好成绩也要盯着，别回潮。",
    "{name}，您好。{when}班组质量整体可控，这是您带出来的。请再接再厉，把好的现场习惯留住。",
    "{name}机长，谢谢{when}的盯守。本期班组结果不错，请继续带人把关，不让重复问题冒头。",
  ],
  交付经理: [
    "{name}经理，您好。感谢您在{when}把交付质量稳住了。请继续带着机长守住，好局面也要复盘。",
    "{name}，您好。{when}管辖范围质量整体可控。请再接再厉，别让个别问题变成批量。",
    "{name}经理，谢谢{when}的统筹。本期交付质量不错，请继续抓关闭、抓预防。",
  ],
  供应链经理: [
    "{name}经理，您好。感谢您在{when}把供应链质量稳住了。请继续带着各交付线守住，好成绩也要盯反复。",
    "{name}，您好。{when}供应链质量整体可控。请再接再厉，把共性问题继续往下压。",
    "{name}经理，谢谢{when}的抓法。本期质量状态不错，请继续给各线撑腰、把标准守住。",
  ],
  研发工程师: [
    "亲爱的同事{name}，您好。感谢您在{when}的设计把关。本期设计质量整体可控，请继续在发布前守住，好习惯比一次好运更值钱。",
    "{name}，您好。{when}您的设计输出比较干净，质量部看在眼里。请再接再厉，下一份同样按标准验证。",
    "{name}，谢谢{when}的认真。本期设计质量不错，请继续把问题挡在图纸上。",
  ],
  PM: [
    "{name}，您好。感谢您在{when}把项目质量稳住了。请继续带着工程师守发布关，进度和质量可以一起要。",
    "{name} PM，您好。{when}项目质量整体可控。请再接再厉，别让赶工把关口松开。",
    "{name}，谢谢{when}的协调。本期项目质量不错，请继续盯关闭、盯验证。",
  ],
  TPM: [
    "{name}，您好。感谢您在{when}把技术质量稳住了。请继续抓共性问题，好机制要复用，不要只守这一季。",
    "{name} TPM，您好。{when}跨项目质量整体可控。请再接再厉，把有效改法推广开。",
    "{name}，谢谢{when}的把关。本期技术质量不错，请继续把重复风险压住。",
  ],
  产总: [
    "{name}，您好。感谢您在{when}给产品线质量撑了腰。本期质量整体可控，请继续把质量当竞争力来抓。",
    "{name}，谢谢{when}的决策支持。产品线质量状态不错，请继续给资源和优先级，别松。",
    "{name}，您好。{when}产品部质量整体可控。请先查阅，带着团队把好的做法坚持下去。",
  ],
};

const greetingRoleKey = (role = "") => (role === "产品部负责人" ? "产总" : role);

export const roleQualityStatus = ({ role = "", evidence = {} } = {}) => {
  if (role === "研发工程师") return Number(evidence.rdQualityIssues?.count || evidence.roleSnapshot?.rdQualityIssues?.count || 0) > 0 ? "attention" : "good";
  const ipqc = evidence.ipqcMetrics || {};
  const snapshot = evidence.roleSnapshot?.metrics || {};
  const bad = Number(ipqc.inspectedRecords || 0) > 0 ? Number(ipqc.badRecords || 0) : Number(snapshot.bad || 0);
  if (bad > 0) return "attention";
  if (Array.isArray(evidence.teamMembers) && evidence.teamMembers.some((item) => Number(item.bad || 0) > 0)) return "attention";
  if (["PM", "TPM", "产总", "产品部负责人"].includes(role) && Number(evidence.matchedRows || evidence.rdQualityIssues?.count || 0) > 0) return "attention";
  return "good";
};

const pickGreeting = (list = [], seed = "") => {
  if (!list.length) return "";
  let hash = 0;
  for (const char of String(seed)) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return list[hash % list.length];
};

export const buildReportSalutation = ({ role = "", recipient = "", period = {}, evidence = {} } = {}) => {
  const name = String(recipient || "同事").trim() || "同事";
  const when = periodLabel(period);
  const key = greetingRoleKey(role);
  const status = roleQualityStatus({ role, evidence });
  const pool = status === "good" ? (GOOD_GREETINGS[key] || GOOD_GREETINGS.组装人员) : (ATTENTION_GREETINGS[key] || ATTENTION_GREETINGS.组装人员);
  const seed = [role, name, period._periodStart || period.start || "", period._periodEnd || period.end || "", status].join("|");
  return fillGreeting(pickGreeting(pool, seed), name, when);
};

const analysisSectionBody = (markdown = "", title = "分析结论") => {
  const match = String(markdown || "").match(new RegExp(`#{1,6}\\s+[^\\n]*${title}[^\\n]*\\r?\\n([\\s\\S]*?)(?=\\n#{1,6}\\s|$)`, "i"));
  return String(match?.[1] || "").replace(/[#|*_\-`\s]/g, "").length >= 8;
};

export const INTERNAL_REPORT_SPEAK_RE = /不得编造|明细不足\s*\d*\s*条|具体对象待核实|不许编|不要输出该章节/;
export const hasInternalReportSpeak = (markdown = "") => INTERNAL_REPORT_SPEAK_RE.test(String(markdown || ""));
export const sanitizeRecipientAnalysis = (markdown = "") => String(markdown || "")
  .replace(/代表：[^。\n]*(?:明细不足|待核实|不得编造)[^。\n]*。?/g, "")
  .replace(/主要集中在待核实。?/g, "")
  .replace(/[^。\n]*(?:不得编造|明细不足\s*\d*\s*条|具体对象待核实|不许编)[^。\n]*。?/g, "")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
export const conclusionMissingNumbers = (markdown = "") => {
  const section = String(markdown || "").match(/#{1,6}\s+[^\n]*分析结论[\s\S]*?(?=\n#{1,6}\s|$)/i)?.[0] || "";
  return Boolean(section) && !/\d+\s*项/.test(section);
};
export const recipientVoiceBroken = (markdown = "", recipient = "") => {
  const text = String(markdown || "");
  if (recipient && text.includes(`${recipient}本期`)) return true;
  if (/质量部的目的|质量部要求/.test(text)) return true;
  if (/根因不是.{0,12}分类名|不是用.{0,8}四个字|最关键的失效机制|出席不等于贡献/.test(text)) return true;
  if (hasInternalReportSpeak(text)) return true;
  return false;
};

export const replaceAnalysisConclusion = (analysis = "", fallback = "") => {
  const fallbackConclusion = String(fallback || "").match(/#{1,6}\s+[^\n]*分析结论[\s\S]*?(?=\n#{1,6}\s|$)/i)?.[0] || "";
  const actions = String(analysis || "").match(/#{1,6}\s+[^\n]*本月措施[\s\S]*$/i)?.[0]
    || String(fallback || "").match(/#{1,6}\s+[^\n]*本月措施[\s\S]*$/i)?.[0]
    || "";
  return [fallbackConclusion.trim(), actions.trim()].filter(Boolean).join("\n\n") || fallback;
};

export const ensureAnalysisConclusion = (analysis = "", fallback = "") => {
  if (analysisSectionBody(analysis, "分析结论") || analysisSectionBody(analysis, "个人质量判决")) return analysis;
  const fallbackConclusion = String(fallback || "").match(/#{1,6}\s+[^\n]*分析结论[\s\S]*?(?=\n#{1,6}\s|$)/i)?.[0] || "";
  const rest = String(analysis || "").replace(/^[\s\S]*?(?=\n#{1,6}\s+[^\n]*本月措施)/i, "") || String(fallback || "").replace(/^[\s\S]*?(?=#{1,6}\s+[^\n]*本月措施)/i, "");
  return [fallbackConclusion.trim(), rest.trim()].filter(Boolean).join("\n\n") || fallback;
};

export const needsRoleModelAnalysis = (role = "", evidence = {}) => {
  if (role === "研发工程师") {
    const issues = Number(evidence.rdQualityIssues?.count || evidence.roleSnapshot?.rdQualityIssues?.count || 0);
    const eng = evidence.engineerMetrics || evidence.roleSnapshot?.dqaAgentMetrics || {};
    return issues > 0 || Number(eng.reviewParticipation || 0) > 0 || Number(eng.reviewSuggestions || 0) > 0;
  }
  const ipqc = evidence.ipqcMetrics || {};
  const snapshot = evidence.roleSnapshot?.metrics || {};
  const bad = Number(ipqc.inspectedRecords || 0) > 0 ? Number(ipqc.badRecords || 0) : Number(snapshot.bad || 0);
  if (bad > 0) return true;
  if (Array.isArray(evidence.teamMembers) && evidence.teamMembers.some((item) => Number(item.bad || 0) > 0)) return true;
  return Number(evidence.matchedRows || 0) > 0 && !evidence.ipqcMetrics && role !== "研发工程师";
};

export const defaultAnalysisMarkdown = ({ timeout = false, skipped = false } = {}) => {
  if (skipped) {
    return [
      "## 分析结论",
      "",
      "本期无质量问题。请继续保持。",
      "",
      "## 本月措施",
      "",
      "本期无待办。",
    ].join("\n");
  }
  return [
    "## 分析结论",
    "",
    "- 待核实：模型超时，未生成分析正文。",
    "",
    "## 本月措施",
    "",
    "| 措施 | 针对的本人/下属问题（必须来自本期固定证据） | Owner | 完成日(YYYY-MM-DD，≤下次报告复核日) | 下次报告如何验收 |",
    "|---|---|---|---|---|",
    "| 待核实：模型超时，未生成改善动作。 | 待核实 | 待核实 | 待核实 | 待核实 |",
    "",
  ].join("\n");
};

export const actionTableRowCount = (markdown = "") => {
  const section = String(markdown || "").match(/本月措施[\s\S]*?(?=\n#{1,6}\s|$)/i)?.[0] || "";
  return section.split(/\n/).filter((line) => {
    const text = line.trim();
    return /^\|/.test(text) && !/^\|\s*:?-{3,}/.test(text) && !/措施/.test(text);
  }).length;
};


const monthCount = (row = {}) => Number(row.count ?? row.bad ?? row.value ?? 0) || 0;
const selectedMonthRows = (rows = [], period = {}) => {
  const source = Array.isArray(rows) ? rows : [];
  const flagged = source.filter((row) => row && row.selected);
  if (flagged.length) return flagged;
  const start = String(period._periodStart || period.start || "").slice(0, 7);
  const end = String(period._periodEnd || period.end || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end)) return source;
  return source.filter((row) => {
    const label = String(row.label || row.name || row.month || "").slice(0, 7);
    return label >= start && label <= end;
  });
};

const completeMonthRows = (rows = [], periodEnd = "") => {
  const source = (Array.isArray(rows) ? rows : []).map((row) => {
    const count = monthCount(row);
    const total = Number(row.total || 0) || 0;
    const rate = Number.isFinite(Number(row.rate)) ? Number(row.rate) : (total ? Number((count / total * 100).toFixed(2)) : null);
    return { label: String(row.label || row.name || row.month || "").slice(0, 7), count, total, rate };
  }).filter((row) => /^\d{4}-\d{2}$/.test(row.label));
  const end = String(periodEnd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return source;
  const lastDay = new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0)).getUTCDate();
  if (Number(end.slice(8, 10)) >= lastDay) return source;
  return source.filter((row) => row.label !== end.slice(0, 7));
};

export const judgeRdIssueTrend = (monthlyRows = [], periodEnd = "", metricLabel = "问题") => {
  const rows = completeMonthRows(monthlyRows, periodEnd);
  const unit = metricLabel || "问题";
  if (rows.length < 2) {
    return { verdict: "insufficient", keepOrPush: "", recentSum: 0, prevSum: 0, recent: rows, previous: [], phrase: "月度不足，不判断趋势。" };
  }
  const recent = rows.length >= 6 ? rows.slice(-3) : rows.slice(-1);
  const previous = rows.length >= 6 ? rows.slice(-6, -3) : rows.slice(-2, -1);
  const recentSum = recent.reduce((sum, row) => sum + row.count, 0);
  const prevSum = previous.reduce((sum, row) => sum + row.count, 0);
  const rateOf = (list) => {
    const total = list.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const count = list.reduce((sum, row) => sum + row.count, 0);
    return total ? Number((count / total * 100).toFixed(2)) : null;
  };
  const recentRate = rateOf(recent);
  const prevRate = rateOf(previous);
  let verdict = "flat-open";
  let keepOrPush = `${unit}没有下降，要加油。`;
  if (recentSum < prevSum) {
    verdict = "better";
    keepOrPush = recentSum === 0 ? "请继续保持，别回潮。" : "请继续保持；还没到零，剩余项发布前要堵住。";
  } else if (recentSum > prevSum) {
    verdict = "worse";
    keepOrPush = `${unit}在上升，要加油。`;
  } else if (recentSum === 0) {
    verdict = "stable-zero";
    keepOrPush = "请继续保持。";
  } else if (recentRate != null && prevRate != null && recentRate < prevRate) {
    keepOrPush = "数量没有下降，不良率略降。";
  } else if (recentRate != null && prevRate != null && recentRate > prevRate) {
    keepOrPush = "数量没有下降，不良率上升，要加油。";
  }
  const monthText = (row) => {
    const rate = row.rate == null ? "" : `（不良率 ${Number(row.rate).toFixed(2)}%）`;
    return `${Number(String(row.label).slice(5))}月${unit} ${row.count}项${rate}`;
  };
  const recentText = recent.map(monthText).join("、");
  const prevText = previous.map(monthText).join("、");
  const phrase = rows.length === 2
    ? `本期${[...previous, ...recent].map(monthText).join("、")}，合计 ${recentSum + prevSum}项。${keepOrPush}`
    : rows.length >= 6
      ? `近三个月${unit}是 ${recentText}，合计 ${recentSum}项；对照 ${prevText}，合计 ${prevSum}项。${keepOrPush}`
      : `最近一个月${unit}是 ${recentText}，合计 ${recentSum}项；对照 ${prevText}，合计 ${prevSum}项。${keepOrPush}`;
  return { verdict, keepOrPush, recentSum, prevSum, recent, previous, recentRate, prevRate, phrase, windowLabel: rows.length >= 6 ? "近三个月" : "最近一个月" };
};

export const isBatchOrderEcn = (name = "") => /分批下单/.test(String(name || ""));
export const isAvoidableEcnReason = (name = "") => {
  const text = String(name || "");
  if (isBatchOrderEcn(text) || /客户原因|已满足客户需求/.test(text)) return false;
  return /BOM漏做|设计错误|漏做|漏项|图纸错误|3D错误|加工件设计/.test(text);
};

export const rdEcnNonBomNote = (eng = {}) => {
  const reasons = reasonRows(eng.ecnReasons || eng.ecnByReason);
  const batchCount = reasons.filter((row) => isBatchOrderEcn(row.name)).reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const avoidable = reasons.filter((row) => isAvoidableEcnReason(row.name));
  const ecnCount = Number(eng.ecnCount ?? eng.ecn ?? 0) || 0;
  const nonBom = Number(eng.nonBomCount ?? eng.nonBom ?? 0) || 0;
  const nonBomMachined = Number(eng.nonBomMachinedCount ?? eng.nonBomMachined ?? 0) || 0;
  const parts = [];
  if (ecnCount > 0) {
    const avoidText = avoidable.length
      ? `可避免项：${avoidable.map((row) => `${row.name} ${row.count}项`).join("、")}。请在下次 BOM 和图纸发布前拦住。`
      : "扣除分批下单后，未见 BOM 漏做或设计错误类可避免变更。";
    parts.push(`本期 ECN ${ecnCount} 项。${batchCount ? `分批下单 ${batchCount} 项不作为异常。` : ""}${avoidText}`);
  }
  if (nonBom > 0) {
    parts.push(nonBomMachined > 0
      ? `非BOM ${nonBom} 项，其中加工件 ${nonBomMachined} 项。加工件未进BOM就下单，请在下次设计输出把该料补进BOM或说明为何不能进。`
      : `非BOM ${nonBom} 项。请确认能否提前进BOM，减少现场申请。`);
  }
  return parts.join("");
};

export const rolePurposeLine = (role = "", { crossTeam = true } = {}) => ({
  组装人员: "我们的目的是送检前把装配缺陷拦住。",
  机长: "我们的目的是班组送检前把重复问题拦住。",
  交付经理: crossTeam ? "我们的目的是工坊交付前把跨班组重复问题拦住。" : "我们的目的是工坊交付前把重复问题拦住。",
  PM: "我们的目的是项目发布前把设计问题拦住。",
  TPM: "我们的目的是把跨项目共性问题拦在设计阶段。",
  研发工程师: "我们的目的就是把问题拦在图纸上、发生之前。",
}[role] || "我们的目的是把问题拦在流出之前。");

export const roleNextCheckLine = (role = "") => ({
  组装人员: "下一批同类送检前，请按上面这几类当场核对对象和缺陷。",
  机长: "请带着班组在送检前按上面这几类当场核对；设备工装材料问题升级给交付经理。",
  交付经理: "请组织机长在交付前把上面这几类关闭；跨工坊事项升级给供应链经理。",
  PM: "请要求所辖工程师在下一份设计输出发布前，按上面这几类核对间隙、干涉、孔位和防护。",
  TPM: "请把上面这几类做成所辖项目发布前必须核对的项。",
  研发工程师: "下一份相关设计输出发布前，请按上面这几类把间隙、避让、孔位和防护核对住，3D或实物确认后再发。",
}[role] || "请在下次同类作业前，按上面这几类当场核对。");

export const roleActionLead = (role, category, short) => ({
  组装人员: `下一批送检前，按「${category}」类当场核对：${short}`,
  机长: `带着班组送检前拦住「${category}」：${short}`,
  交付经理: `组织机长在交付前关闭「${category}」：${short}`,
  PM: `要求所辖工程师发布前核对「${category}」：${short}`,
  TPM: `所辖项目发布前核对「${category}」：${short}`,
  研发工程师: `下一份设计输出发布前，按「${category}」类核对并验证：${short}`,
}[role] || `按「${category}」类核对：${short}`);

export const rdReviewPraise = ({ participation = 0, suggestions = 0 } = {}) => {
  const p = Number(participation || 0) || 0;
  const s = Number(suggestions || 0) || 0;
  if (s >= 1) return `设计评审你参与了 ${p} 次，提出有效改善 ${s} 条。这正是我们要的：把问题拦在图纸上、发生之前。`;
  if (p >= 1) return `设计评审你到场 ${p} 次，但有效改善项是 0。人到了，拦截还没有留下可关闭的意见。请在评审里把干涉、间隙、防护直接提出来。我们的目的就是把问题拦在发生之前。`;
  return "本期没有评审拦截记录。我们的目的就是把问题拦在图纸上、发生之前，这一块是空的，下次相关评审请留下改善项。";
};

export const buildDeterministicAnalysisMarkdown = ({ role = "", recipient = "", evidence = {}, nextReviewDate = "", period = {}, rankingRows = [] } = {}) => {
  const examples = (evidence.examples || evidence.rdQualityIssues?.examples || []).filter((item) => item && (item.description || item.category));
  const categories = evidence.topCategoryStats || evidence.rdQualityIssues?.categories || [];
  const due = nextReviewDate || "待核实";
  const owner = recipient || "待核实";
  const top = examples.slice(0, 3);
  const eng = evidence.engineerMetrics || evidence.roleSnapshot?.dqaAgentMetrics || {};
  const rd = evidence.rdQualityIssues || evidence.roleSnapshot?.rdQualityIssues || {};
  if (role !== "研发工程师" && !top.length && !categories.length && Number(evidence.ipqcMetrics?.badRecords || evidence.roleSnapshot?.metrics?.bad || 0) <= 0) return defaultAnalysisMarkdown({ skipped: true });
  const periodEnd = period._periodEnd || period.end || evidence.roleSnapshot?.period?.end || "";
  const issueCount = Number(rd.count || 0);
  const ipqcBad = Number(evidence.ipqcMetrics?.badRecords || evidence.roleSnapshot?.metrics?.bad || 0);
  const qualityCount = role === "研发工程师" ? issueCount : (ipqcBad || issueCount || (top.length ? top.length : 0));
  const monthlyRows = selectedMonthRows(role === "研发工程师"
    ? (rd.periodTrend?.month?.rows || evidence.periodTrend?.month?.rows || [])
    : (evidence.periodTrend?.month?.rows || rd.periodTrend?.month?.rows || []), period);
  const exampleLine = top.map((item) => [item.date, item.description].filter(Boolean).join("，")).filter(Boolean).join("；");
  const derivedCats = Object.entries((examples || []).reduce((map, item) => {
    const name = item.category || "未分类";
    map[name] = (map[name] || 0) + 1;
    return map;
  }, {})).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 3);
  const categoryTop = ((categories || []).length ? categories : derivedCats).slice(0, 3);
  const actionCats = categoryTop;
  const teamBad = (Array.isArray(evidence.teamMembers) ? evidence.teamMembers : []).filter((item) => Number(item.bad || 0) > 0);
  const crossTeam = teamBad.length >= 2;
  const teamLine = teamBad.slice(0, 3).map((item) => `${item.name} ${item.bad}项`).join("、");
  const catText = categoryTop.map((item) => `${item.name} ${item.count}项`).join("、");
  const judged = judgeRdIssueTrend(monthlyRows, periodEnd, role === "研发工程师" ? "问题" : "不良");
  const rank = (Array.isArray(rankingRows) ? rankingRows : []).find((row) => row.selected) || evidence.ranking || null;
  const rankText = rank?.rank && rank?.total
    ? `同口径第${rank.rank}/${rank.total}名，不良数量${rank.rank > rank.total / 2 ? "靠后" : "靠前"}。`
    : "";
  const weekHot = (evidence.periodTrend?.week?.rows || []).filter((row) => row.selected && (Number(row.bad || row.count || 0) > 0))
    .sort((a, b) => Number(b.bad || b.count || 0) - Number(a.bad || a.count || 0))
    .slice(0, 3)
    .map((row) => {
      const week = String(row.label || "").replace(/^\d{4}-/, "");
      return `${week} ${Number(row.bad || row.count || 0)}项`;
    });
  const weekText = weekHot.length ? `周度尖峰在${weekHot.join("、")}。` : "";
  const missingEvidence = [!catText ? "分类" : "", !teamLine ? "机长名单" : ""].filter(Boolean);
  const outflow = qualityCount > 0
    ? [
      catText ? `主要集中在${catText}。` : `本期固定摘要还没有${missingEvidence.join("/")}，不能把不良打包结案。`,
      teamLine ? (crossTeam ? `跨班组集中在${teamLine}。` : `主要集中在${teamLine}。`) : "",
      weekText,
      exampleLine ? `代表：${exampleLine}。` : "",
    ].filter(Boolean).join("")
    : "本期没有流出的质量问题。请继续保持。";
  const namedClose = actionCats.map((item) => `「${item.name}」`).join("、");
  const closeLine = qualityCount <= 0
    ? "请继续按标准核对，别回潮。"
    : (role === "交付经理" && actionCats.length
      ? `请组织机长在交付前关闭${namedClose}；跨工坊事项升级给供应链经理。`
      : roleNextCheckLine(role));
  const conclusion = role === "研发工程师"
    ? [
        judged.phrase,
        rdReviewPraise({ participation: eng.reviewParticipation, suggestions: eng.reviewSuggestions }),
        "",
        qualityCount > 0
          ? [
            catText ? `仍有问题流到现场，主要集中在${catText}。` : "本期固定摘要还没有分类名单，不能把问题打包结案。",
            exampleLine ? `代表：${exampleLine}。` : "具体现象请对照上面的问题分类和趋势图复盘。",
          ].join("")
          : "本期没有流到现场的研发质量问题。请继续把评审里的改善落到图纸上。",
        "",
        [
          qualityCount > 0 ? roleNextCheckLine(role) : "请继续在发布前守住走线、干涉、防护这些检查。",
          rdEcnNonBomNote(eng),
        ].filter(Boolean).join(""),
      ].join("\n")
    : [
        `${judged.phrase}${rankText}`,
        rolePurposeLine(role, { crossTeam }),
        "",
        outflow,
        "",
        closeLine,
      ].join("\n");
  const actionRowsFor = () => {
    const rows = actionCats.map((cat) => {
      const example = examples.find((item) => item.category === cat.name) || examples[0] || {};
      const short = String(example.description || cat.name).slice(0, 18);
      const problem = `${cat.name} ${cat.count ?? ""}项${example.date ? `。代表：${example.date}｜${example.description || ""}` : ""}`.replace(/\|/g, "/");
      const accept = role === "研发工程师" ? "出示对应图纸/3D证据，且该类问题下降" : "出示对应批次/现场证据，且该类问题下降";
      return `| ${roleActionLead(role, cat.name, short)} | ${problem} | ${owner} | ${due} | ${accept} |`;
    });
    if (role === "研发工程师") {
      const avoidable = reasonRows(eng.ecnReasons || eng.ecnByReason).filter((row) => isAvoidableEcnReason(row.name)).sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
      if (avoidable[0]) {
        const topReason = avoidable[0];
        rows.push(`| 下次BOM/图纸发布前堵住「${topReason.name}」 | ECN可避免：${topReason.name} ${topReason.count}项（分批下单不计入异常） | ${owner} | ${due} | 该类可避免ECN不再新增 |`);
      }
      const nonBomMachined = Number(eng.nonBomMachinedCount ?? eng.nonBomMachined ?? 0) || 0;
      if (nonBomMachined > 0) {
        rows.push(`| 下次设计输出把加工件补进BOM，或写明不能进的原因 | 非BOM加工件 ${nonBomMachined} 项 | ${owner} | ${due} | 新开加工件进BOM或有书面原因 |`);
      }
    }
    if (!rows.length && qualityCount > 0) {
      const weekRows = (evidence.periodTrend?.week?.rows || []).filter((row) => row.selected && Number(row.bad || row.count || 0) > 0)
        .sort((a, b) => Number(b.bad || b.count || 0) - Number(a.bad || a.count || 0))
        .slice(0, 3);
      if (weekRows.length) {
        weekRows.forEach((row) => {
          const week = String(row.label || "").replace(/^\d{4}-/, "");
          const count = Number(row.bad || row.count || 0);
          rows.push(`| ${roleActionLead(role, week, "对到班组关闭")} | ${week} 不良 ${count} 项 | ${owner} | ${due} | 出示对应班组关闭证据，且该类/该周下降 |`);
        });
      } else {
        rows.push(`| ${roleActionLead(role, "分类未入摘要", "按机组分清单关闭")} | 固定摘要暂无分类，不良 ${qualityCount} 项 | ${owner} | ${due} | 先补分类和机长名单，再按类关闭 |`);
      }
    }
    return rows;
  };
  const rows = actionRowsFor();
  if (!rows.length) {
    return ["## 分析结论", "", conclusion, "", "## 本月措施", "", "本期无待办。", ""].join("\n");
  }
  return [
    "## 分析结论",
    "",
    conclusion,
    "",
    "## 本月措施",
    "",
    "| 措施 | 针对的本人/下属问题（必须来自本期固定证据） | Owner | 完成日(YYYY-MM-DD) | 下次报告如何验收 |",
    "|---|---|---|---|---|",
    ...rows,
    "",
  ].filter((line) => line !== "").join("\n");
};

export const analysisMissesCategoryEvidence = (analysis = "", evidence = {}) => {
  const text = String(analysis || "");
  const cats = (evidence.topCategoryStats || evidence.rdQualityIssues?.categories || evidence.roleSnapshot?.categories || [])
    .filter((item) => String(item?.name || "").trim() && Number(item.count || item[1] || 0) > 0)
    .slice(0, 3);
  if (/仍有问题流出。/.test(text) && !/主要集中在/.test(text)) return true;
  if (!cats.length) return false;
  const named = cats.filter((cat) => text.includes(cat.name)).length;
  return named < 1 || /关闭「W\d+|关闭「20\d{2}-W/.test(text);
};

export const repairRoleAnalysis = (analysis = "", fallback = "", role = "", evidence = {}, recipient = "") => {
  let next = ensureActionTable(analysis, fallback);
  next = ensureAnalysisConclusion(next, fallback);
  if (recipientVoiceBroken(next, recipient) || conclusionMissingNumbers(next) || analysisMissesCategoryEvidence(next, evidence)) {
    next = replaceAnalysisConclusion(next, fallback);
  }
  next = ensureRdCategoryActions(next, fallback, role, evidence);
  return sanitizeRecipientAnalysis(next);
};

export const ensureRdCategoryActions = (analysis = "", fallback = "", role = "", evidence = {}) => {
  const cats = (evidence.topCategoryStats || evidence.rdQualityIssues?.categories || evidence.roleSnapshot?.categories || [])
    .filter((item) => String(item?.name || "").trim())
    .slice(0, 3);
  const eng = evidence.engineerMetrics || evidence.roleSnapshot?.dqaAgentMetrics || {};
  const note = rdEcnNonBomNote(eng);
  let next = String(analysis || "");
  const actions = next.match(/#{1,6}\s+[^\n]*本月措施[\s\S]*$/i)?.[0] || "";
  const covered = cats.filter((cat) => actions.includes(cat.name)).length;
  const weekOnly = /关闭「W\d+|关闭「20\d{2}-W|W\d{2}\s*不良/.test(actions);
  if (cats.length && (weekOnly || covered < Math.min(2, cats.length))) {
    const fallbackActions = String(fallback || "").match(/#{1,6}\s+[^\n]*本月措施[\s\S]*$/i)?.[0] || "";
    const conclusion = next.match(/#{1,6}\s+[^\n]*分析结论[\s\S]*?(?=\n#{1,6}\s|$)/i)?.[0] || "";
    next = [conclusion.trim(), fallbackActions.trim()].filter(Boolean).join("\n\n") || next;
  }
  if (role === "研发工程师" && note && !/ECN|非BOM/.test(next.match(/#{1,6}\s+[^\n]*分析结论[\s\S]*?(?=\n#{1,6}\s|$)/i)?.[0] || "")) {
    next = next.replace(/(#{1,6}\s+[^\n]*本月措施)/i, `${note}\n\n$1`);
  }
  return next;
};

export const ensureActionTable = (analysis = "", fallback = "") => {
  if (actionTableRowCount(analysis) >= 1) return analysis;
  const text = String(analysis || "");
  if (!text.trim() || /待核实：模型超时/.test(text)) return fallback || defaultAnalysisMarkdown({ timeout: true });
  const conclusion = text.match(/#{1,6}\s+[^\n]*分析结论[\s\S]*?(?=\n#{1,6}\s|$)/i)?.[0] || "";
  const rest = String(fallback || "").replace(/^[\s\S]*?(?=#{1,6}\s+[^\n]*本月措施)/i, "") || fallback;
  return [conclusion.trim(), rest.trim()].filter(Boolean).join("\n\n") || fallback;
};

export const extractAnalysisMarkdown = (content = "") => {
  const text = String(content || "").trim();
  if (!text) return "";
  const pick = (title) => {
    const match = text.match(new RegExp(`(^#{1,6}\\s+[^\\n]*${title}[^\\n]*\\r?\\n)([\\s\\S]*?)(?=^#{1,6}\\s+|$)`, "mi"));
    return match ? `${match[1]}${match[2]}`.trim() : "";
  };
  const conclusion = pick("分析结论") || pick("个人质量判决");
  const actions = pick("本月措施");
  const parts = [conclusion, actions].filter(Boolean);
  if (parts.length) return parts.join("\n\n");
  return text.slice(0, 1800);
};

export const buildFixedDataRoleReport = ({ role = "", recipient = "", period = {}, evidence = {}, rankingRows = [] } = {}) => {
  const start = period._periodStart || period.start || "";
  const end = period._periodEnd || period.end || "";
  const snapshotMetrics = evidence.roleSnapshot?.metrics || {};
  const ipqc = evidence.ipqcMetrics || {};
  const rd = evidence.rdQualityIssues || evidence.roleSnapshot?.rdQualityIssues || {};
  const eng = evidence.engineerMetrics || evidence.roleSnapshot?.dqaAgentMetrics || {};
  const categories = evidence.topCategoryStats?.length ? evidence.topCategoryStats : (rd.categories || evidence.roleSnapshot?.categories || []);
  const liveHasCounts = Number(ipqc.inspectedRecords || 0) > 0;
  const inspected = liveHasCounts ? Number(ipqc.inspectedRecords || 0) : Number(snapshotMetrics.total || 0);
  const bad = liveHasCounts ? Number(ipqc.badRecords || 0) : Number(snapshotMetrics.bad || 0);
  const good = liveHasCounts ? Number(ipqc.goodRecords || 0) : Number(snapshotMetrics.good ?? Math.max(0, inspected - bad));
  const badRate = liveHasCounts ? ipqc.badRate : snapshotMetrics.badRate;
  const lines = [
    `# ${recipient}-${reportTitlePeriod(period) || "本期"}质量报告`,
    "",
    `角色：${role}`,
    `统计周期：${start || "待核实"}—${end || "待核实"}`,
    "",
    buildReportSalutation({ role, recipient, period, evidence }),
    "",
    "## 质量数据",
    "",
  ];
  if (role === "研发工程师") {
    lines.push("| 指标 | 数值 |", "|---|---:|");
    lines.push(`| 研发质量问题 | ${numberText(rd.count ?? evidence.matchedRows)} |`);
    lines.push(`| ECN | ${numberText(eng.ecnCount ?? eng.ecn)} |`);
    lines.push(`| 非BOM | ${numberText(eng.nonBomCount ?? eng.nonBom)} |`);
    lines.push(`| 设计评审参与 | ${numberText(eng.reviewParticipation || 0)} |`);
    lines.push(`| 有效改善项 | ${numberText(eng.reviewSuggestions || 0)} |`);
  } else if (evidence.ipqcMetrics || snapshotMetrics.total) {
    lines.push("| 指标 | 数值 |", "|---|---:|");
    lines.push(`| 送检记录 | ${numberText(inspected)} |`);
    lines.push(`| 不良记录 | ${numberText(bad)} |`);
    lines.push(`| 合格记录 | ${numberText(good)} |`);
    lines.push(`| 不良率 | ${numberText(badRate, "%")} |`);
  } else {
    lines.push(`- 质量记录：${numberText(evidence.matchedRows)}`);
  }
  if (role !== "研发工程师") {
    const weekRows = keepActiveWeekChartRows(evidence.periodTrend?.week?.rows || []);
    lines.push("", "## 问题分类", "");
    if (Array.isArray(categories) && categories.length) {
      lines.push("| 问题类型 | 数量 |", "|---|---:|");
      categories.slice(0, 8).forEach((item) => {
        const name = item.name || item[0] || "未分类";
        const count = item.count ?? item[1];
        lines.push(`| ${name} | ${numberText(count)} |`);
      });
    }
    lines.push("", "## 周度趋势", "");
    if (weekRows.length) {
      lines.push("| 周次 | 不良记录 | 送检记录 |", "|---|---:|---:|");
      weekRows.slice(0, 24).forEach((row) => lines.push(`| ${row.label} | ${numberText(row.bad ?? row.count)} | ${numberText(row.total)} |`));
      if (weekRows.length > 24) lines.push(`| 其余 ${weekRows.length - 24} 周 | 见图 | 见图 |`);
    }
    lines.push("", "## 月度趋势", "");
  }
  if (role === "研发工程师" && Array.isArray(categories) && categories.length) {
    lines.push("", "## 问题类型分布", "", "| 问题类型 | 数量 |", "|---|---:|");
    categories.slice(0, 8).forEach((item) => {
      const name = item.name || item[0] || "未分类";
      const count = item.count ?? item[1];
      lines.push(`| ${name} | ${numberText(count)} |`);
    });
  }
  const examples = (evidence.examples || rd.examples || []).filter((item) => item && (item.description || item.category));
  if (examples.length) {
    lines.push("", "## 主要问题列表", "");
    examples.slice(0, 8).forEach((item) => {
      lines.push(`- ${item.date || "日期待核实"}｜${item.category || "未分类"}：${item.description || "待核实"}`);
    });
  }
  if (role === "研发工程师") {
    lines.push("", "### 周度问题趋势", "", "### 月度问题趋势", "");
    lines.push("", "## ECN变更活动", "", "| 指标 | 数值 |", "|---|---:|");
    lines.push(`| ECN数量 | ${numberText(eng.ecnCount ?? eng.ecn)} |`);
    lines.push(`| 加工件ECN | ${numberText(eng.ecnMachinedCount ?? eng.ecnMachined)} |`);
    lines.push(`| 标准件ECN | ${numberText(eng.ecnStandardCount ?? eng.ecnStandard)} |`);
    if (eng.ecnRate != null) lines.push(`| ECN比例 | ${percentText(eng.ecnRate)} |`);
    const reasons = reasonRows(eng.ecnReasons || eng.ecnByReason).slice(0, 6);
    if (reasons.length) {
      lines.push("", "| 变更原因 | 数量 |", "|---|---:|");
      reasons.forEach((item) => lines.push(`| ${item.name || "未填写"} | ${numberText(item.count)} |`));
    }
    lines.push("", "## 非BOM申请活动", "", "| 指标 | 数值 |", "|---|---:|");
    lines.push(`| 非BOM数量 | ${numberText(eng.nonBomCount ?? eng.nonBom)} |`);
    lines.push(`| 加工件 | ${numberText(eng.nonBomMachinedCount ?? eng.nonBomMachined)} |`);
    lines.push(`| 标准件 | ${numberText(eng.nonBomStandardCount ?? eng.nonBomStandard)} |`);
    lines.push("", "## 设计评审正向贡献", "", "| 指标 | 本周期数据 | 口径 |", "|---|---:|---|");
    lines.push(`| 参与评审 | ${numberText(eng.reviewParticipation || 0)} 次 | 每份评审表中本人作为评审成员计 1 次 |`);
    lines.push(`| 有效改善项 | ${numberText(eng.reviewSuggestions || 0)} 条 | 本人作为提出人，每行计 1 条 |`);
    lines.push("", "该部分是前置评审参与和改善贡献，不计入研发问题、ECN、非BOM数量或风险排名。");
  }
  if (Array.isArray(evidence.teamMembers) && evidence.teamMembers.length) {
    const memberSpec = teamMemberSpecForRole(role) || { label: "人员", sectionId: "组内成员" };
    lines.push("", `## ${memberSpec.sectionId}`, "", `| ${memberSpec.label} | 送检记录 | 不良记录 | 合格记录 | 不良率 |`, "|---|---:|---:|---:|---:|");
    evidence.teamMembers.slice(0, 20).forEach((item) => {
      lines.push(`| ${item.name} | ${numberText(item.total)} | ${numberText(item.bad)} | ${numberText(item.good)} | ${numberText(item.badRate, "%")} |`);
    });
    if (evidence.teamMembers.length > 20) lines.push(`| 其余 ${evidence.teamMembers.length - 20} 人 | 见固定证据 | | | |`);
  }
  lines.push("", "## 排名");
  const focus = Array.isArray(rankingRows) ? rankingRows.find((row) => row.selected) : null;
  if (focus?.rank && focus?.total) lines.push("", `当前按同口径降序为 **第 ${focus.rank}/${focus.total} 名**，本人 ${numberText(focus.value)}。排名不是能力评价。`);
  return lines.join("\n").trim();
};

export const stitchRoleReportParts = ({ fixed = "", analysis = "", confirmedKnowledge, timeout = false } = {}) => {
  let content = [String(fixed || "").trim(), String(analysis || "").trim()].filter(Boolean).join("\n\n");
  if (timeout) content = `${TIMEOUT_FALLBACK_MARKER}\n${content}`;
  if (Array.isArray(confirmedKnowledge)) content = appendConfirmedKnowledgeToReport(content, confirmedKnowledge);
  return content;
};


export const buildRoleAnalysisBrief = (role = "", evidence = {}, rankingRows = [], period = {}) => {
  const rd = evidence.rdQualityIssues || evidence.roleSnapshot?.rdQualityIssues || {};
  const ipqc = evidence.ipqcMetrics || {};
  const snapshot = evidence.roleSnapshot?.metrics || {};
  const eng = evidence.engineerMetrics || evidence.roleSnapshot?.dqaAgentMetrics || {};
  const focus = Array.isArray(rankingRows) ? rankingRows.find((row) => row.selected) : null;
  const knowledge = (evidence.confirmedKnowledge || []).slice(0, 5).map((item) => ({
    documentName: item.documentName,
    clauseNumber: item.clauseNumber,
    title: item.title,
    correctState: item.correctState,
    issueText: item.issueText,
  }));
  return {
    role,
    qualityIssueCount: role === "研发工程师" ? Number(rd.count || 0) : (Number(ipqc.inspectedRecords || 0) > 0 ? Number(ipqc.badRecords || 0) : Number(snapshot.bad || 0)),
    categories: (evidence.topCategoryStats || rd.categories || []).slice(0, 8),
    examples: (evidence.examples || rd.examples || evidence.roleSnapshot?.examples || []).slice(0, 8),
    stages: rd.stages || [],
    ranking: focus ? { rank: focus.rank, total: focus.total, value: focus.value } : null,
    ecn: role === "研发工程师" ? {
      count: eng.ecnCount ?? eng.ecn ?? 0,
      machined: eng.ecnMachinedCount ?? eng.ecnMachined ?? 0,
      reasons: (eng.ecnReasons || eng.ecnByReason || []).slice(0, 8),
      batchOrder: reasonRows(eng.ecnReasons || eng.ecnByReason).filter((row) => isBatchOrderEcn(row.name)).reduce((sum, row) => sum + (Number(row.count) || 0), 0),
      avoidable: reasonRows(eng.ecnReasons || eng.ecnByReason).filter((row) => isAvoidableEcnReason(row.name)),
      note: rdEcnNonBomNote(eng),
    } : undefined,
    nonBom: role === "研发工程师" ? { count: eng.nonBomCount ?? eng.nonBom ?? 0, machined: eng.nonBomMachinedCount ?? eng.nonBomMachined ?? 0, standard: eng.nonBomStandardCount ?? eng.nonBomStandard ?? 0 } : undefined,
    monthTrend: (rd.periodTrend?.month?.rows || evidence.periodTrend?.month?.rows || []).map((row) => ({ label: row.label, count: monthCount(row), selected: Boolean(row.selected) })),
    trend: judgeRdIssueTrend(selectedMonthRows(rd.periodTrend?.month?.rows || evidence.periodTrend?.month?.rows || [], period), period._periodEnd || period.end || evidence.roleSnapshot?.period?.end || "", role === "研发工程师" ? "问题" : "不良"),
    purpose: rolePurposeLine(role, { crossTeam: (Array.isArray(evidence.teamMembers) ? evidence.teamMembers : []).filter((item) => Number(item.bad || 0) > 0).length >= 2 }),
    review: role === "研发工程师" ? { participation: eng.reviewParticipation || 0, suggestions: eng.reviewSuggestions || 0, praise: rdReviewPraise({ participation: eng.reviewParticipation, suggestions: eng.reviewSuggestions }) } : undefined,
    teamTop: Array.isArray(evidence.teamMembers) ? evidence.teamMembers.slice(0, 5).map((item) => ({ name: item.name, bad: item.bad })) : [],
    weekHot: (evidence.periodTrend?.week?.rows || []).filter((row) => row.selected && Number(row.bad || row.count || 0) > 0)
      .sort((a, b) => Number(b.bad || b.count || 0) - Number(a.bad || a.count || 0))
      .slice(0, 3)
      .map((row) => ({ label: String(row.label || "").replace(/^\d{4}-/, ""), bad: Number(row.bad || row.count || 0), total: Number(row.total || 0) })),
    knowledge,
  };
};

export const buildFixedEvidenceRoleReport = ({ role = "", recipient = "", period = {}, evidence = {}, rankingRows = [] } = {}) => stitchRoleReportParts({
  fixed: buildFixedDataRoleReport({ role, recipient, period, evidence, rankingRows }),
  analysis: defaultAnalysisMarkdown({ timeout: true }),
  confirmedKnowledge: evidence.confirmedKnowledge,
  timeout: true,
});
