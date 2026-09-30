import { appendConfirmedKnowledgeToReport } from "./roleKnowledgeEvidence.js";
import { keepActiveWeekChartRows, teamMemberSpecForRole } from "./roleSnapshotRegistry.js";
import { classifiedCategoryTop, peerRatesComparable, peerRatesDefined } from "./pmRoleEvidence.js";

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
const percentPointsText = (value) => {
  if (value === null || value === undefined || value === "") return "待核实";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "待核实";
  return `${numeric.toFixed(2)}%`;
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

const fillGreeting = (template, name, when, dept = "") => String(template || "")
  .replaceAll("{name}", name)
  .replaceAll("{when}", when)
  .replaceAll("{dept}", dept || "产品部");

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
    "{name}，您好。现将{dept}{when}质量情况汇报如下，供审阅。",
    "{name}，您好。{dept}{when}质量结果已经整理，呈上供查阅。",
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
    "{name}，您好。{dept}{when}质量整体可控，现将结果汇报如下，供审阅。",
    "{name}，您好。{dept}{when}质量情况稳定，结果如下，供查阅。",
    "{name}，您好。现将{dept}{when}质量结果汇报如下。本期整体可控。",
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
  if (["PM", "TPM", "产总", "产品部负责人"].includes(role)) {
    const eng = evidence.engineerMetrics || evidence.roleSnapshot?.dqaAgentMetrics || {};
    if (Number(eng.ecnCount ?? eng.ecn ?? 0) > 0 || Number(eng.nonBomCount ?? eng.nonBom ?? 0) > 0) return "attention";
    if ((role === "TPM" || role === "产总") && Number(evidence.oqcShipment?.low || 0) > 0) return "attention";
  }
  return "good";
};

const pickGreeting = (list = [], seed = "") => {
  if (!list.length) return "";
  let hash = 0;
  for (const char of String(seed)) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return list[hash % list.length];
};

export const buildReportSalutation = ({ role = "", recipient = "", period = {}, evidence = {} } = {}) => {
  const rawName = String(recipient || "同事").trim() || "同事";
  const name = role === "供应链经理" && /经理$/.test(rawName) ? rawName.replace(/经理$/, "") || rawName : rawName;
  const when = periodLabel(period);
  const key = greetingRoleKey(role);
  const status = roleQualityStatus({ role, evidence });
  const pool = status === "good" ? (GOOD_GREETINGS[key] || GOOD_GREETINGS.组装人员) : (ATTENTION_GREETINGS[key] || ATTENTION_GREETINGS.组装人员);
  const seed = [role, name, period._periodStart || period.start || "", period._periodEnd || period.end || "", status].join("|");
  const director = key === "产总";
  const titled = director && !/总$/.test(name) ? name + "总" : name;
  const dept = director ? directorDeptLabel(evidence) : "";
  return fillGreeting(pickGreeting(pool, seed), titled, when, dept);
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
  if (Array.isArray(evidence.teamMembers) && evidence.teamMembers.some((item) => Number(item.bad || item.issues || 0) > 0)) return true;
  if (role === "产总") {
    const eng = evidence.engineerMetrics || evidence.roleSnapshot?.dqaAgentMetrics || {};
    const oqc = evidence.oqcShipment || {};
    if (Number(eng.ecnCount || eng.ecn || eng.agentEcnLineCount || 0) > 0) return true;
    if (Number(eng.nonBomCount || eng.nonBom || eng.agentNonBomLineCount || 0) > 0) return true;
    if (Number(oqc.count || 0) > 0) return true;
  }
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
    const only = rows[0];
    const monthNo = only ? Number(String(only.label).slice(5)) : 0;
    const phrase = only
      ? (monthNo ? `${monthNo}月${unit} ${only.count}项。` : `本期${unit} ${only.count}项。`)
      : `本期${unit}以质量数据表为准。`;
    return { verdict: "single", keepOrPush: "", recentSum: only ? only.count : 0, prevSum: 0, recent: rows, previous: [], phrase };
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

export const judgePmIssueTrend = (monthlyRows = [], periodEnd = "") => {
  const rows = completeMonthRows(monthlyRows, periodEnd);
  const monthNo = (row) => Number(String(row.label).slice(5));
  const monthText = (row) => `${monthNo(row)}月问题 ${row.count}项`;
  if (rows.length < 2) {
    const only = rows[0];
    const phrase = only ? `${monthNo(only)}月问题 ${only.count}项。` : "本期问题以质量数据表为准。";
    return { verdict: "single", phrase, rows, recentSum: only ? only.count : 0, prevSum: 0 };
  }
  const recent = rows.length >= 6 ? rows.slice(-3) : rows.slice(-1);
  const previous = rows.length >= 6 ? rows.slice(-6, -3) : rows.slice(-2, -1);
  const recentSum = recent.reduce((sum, row) => sum + row.count, 0);
  const prevSum = previous.reduce((sum, row) => sum + row.count, 0);
  const direction = recentSum < prevSum ? "数量下降。" : recentSum > prevSum ? "数量上升。" : "数量没有下降。";
  const peak = rows.reduce((best, row) => (!best || row.count > best.count ? row : best), null);
  const peakText = peak && peak.count > 0 ? `尖峰在${monthNo(peak)}月 ${peak.count}项。` : "";
  const last = rows[rows.length - 1];
  const prior = rows[rows.length - 2];
  const rebound = last && prior && last.count > prior.count ? `${monthNo(last)}月相对${monthNo(prior)}月从${prior.count}项回到${last.count}项，本月反弹。` : "";
  const phrase = rows.length >= 6
    ? `近三个月问题是 ${recent.map(monthText).join("、")}，合计 ${recentSum}项；对照 ${previous.map(monthText).join("、")}，合计 ${prevSum}项。${direction}${peakText}${rebound}`
    : `最近一个月问题是 ${recent.map(monthText).join("、")}，合计 ${recentSum}项；对照 ${previous.map(monthText).join("、")}，合计 ${prevSum}项。${direction}${peakText}${rebound}`;
  return { verdict: recentSum < prevSum ? "better" : recentSum > prevSum ? "worse" : "flat", phrase, recentSum, prevSum, peak };
};

const finiteGap = (label, sum, header) => Number.isFinite(header) && sum !== header ? `${label}加总 ${sum}，表头 ${header}，差额 ${Math.abs(header - sum)}。` : "";
export const pmMaterialGap = (members = [], header = {}) => {
  const list = Array.isArray(members) ? members : [];
  const sumOf = (key) => list.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
  const has = (key) => list.some((item) => item[key] != null && item[key] !== "");
  return [
    finiteGap((header.memberLabel || "下属") + "ECN物料行", sumOf("ecnCount"), Number(header.ecn)),
    finiteGap("非BOM物料行", sumOf("nonBomCount"), Number(header.nonBom)),
    has("ecnMachinedCount") ? finiteGap((header.memberLabel || "下属") + "ECN加工件", sumOf("ecnMachinedCount"), Number(header.ecnMachined)) : "",
    has("nonBomMachinedCount") ? finiteGap("非BOM加工件", sumOf("nonBomMachinedCount"), Number(header.nonBomMachined)) : "",
  ].filter(Boolean).join("");
};
export const pmRateShiftNote = (monthly = []) => {
  const rows = (Array.isArray(monthly) ? monthly : []).filter((row) => row && row.label);
  const monthNo = (row) => Number(String(row.label).slice(5));
  const missing = rows.filter((row) => !(Number(row.bomDenominator) > 0));
  const parts = [];
  if (missing.length) parts.push(`${missing.map((row) => monthNo(row) + "月").join("、")}没有物料款数分母，不能记成 0%。`);
  const last = [...rows].reverse().find((row) => Number(row.bomDenominator) > 0);
  const prev = last ? [...rows].reverse().find((row) => row.label < last.label && Number(row.bomDenominator) > 0) : null;
  if (last && prev && Number(prev.bomDenominator) !== Number(last.bomDenominator)) {
    parts.push(`${monthNo(prev)}月ECN率 ${prev.ecnRate}%（${prev.ecnCount}/${prev.bomDenominator}），${monthNo(last)}月 ${last.ecnRate}%（${last.ecnCount}/${last.bomDenominator}）。分母从 ${prev.bomDenominator} 变为 ${last.bomDenominator}，率的变化不能只看成变更变少。`);
  }
  return parts.join("");
};

export const pmFlowEngineer = (members = []) => {
  const rows = (Array.isArray(members) ? members : []).filter((item) => (Number(item.ecnCount) || 0) > 0);
  if (!rows.length) return null;
  return [...rows].sort((a, b) => (Number(b.ecnCount) || 0) - (Number(a.ecnCount) || 0))[0];
};

export const pmParetoReasons = (reasons = []) => reasonRows(reasons).filter((row) => !isBatchOrderEcn(row.name));

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
  const lineCount = Number(eng.agentEcnLineCount);
  const nonBom = Number(eng.agentNonBomLineCount ?? eng.nonBomCount ?? eng.nonBom ?? 0) || 0;
  const nonBomMachined = Number(eng.nonBomMachinedCount ?? eng.nonBomMachined ?? 0) || 0;
  const parts = [];
  if (ecnCount > 0 && !reasons.length && !(lineCount > 0)) {
    parts.push("本期 ECN " + ecnCount + " 项，这是汇总表条数。物料行没有挂到所辖人员，变更原因拆不开，不能据此说没有可避免变更。");
  } else if (ecnCount > 0 || lineCount > 0) {
    const shown = lineCount > 0 ? lineCount : ecnCount;
    const avoidText = avoidable.length
      ? "可避免项：" + avoidable.map((row) => row.name + " " + row.count + "项").join("、") + "。请在下次 BOM 和图纸发布前拦住。"
      : (reasons.length ? "扣除分批下单后，未见 BOM 漏做或设计错误类可避免变更。" : "变更原因没有拆开，不能判断有没有可避免变更。");
    parts.push((lineCount > 0 ? "ECN物料行 " + lineCount + "。" : "本期 ECN " + ecnCount + " 项。") + (batchCount ? "分批下单 " + batchCount + " 项不作为异常。" : "") + avoidText);
  }
  if (nonBom > 0) {
    parts.push(nonBomMachined > 0
      ? "非BOM " + nonBom + " 项，其中加工件 " + nonBomMachined + " 项。加工件未进BOM就下单，请在下次设计输出把该料补进BOM或说明为何不能进。"
      : "非BOM " + nonBom + " 项。请确认能否提前进BOM，减少现场申请。");
  }
  return parts.join("");
};
export const rolePurposeLine = (role = "", { crossTeam = true } = {}) => ({
  组装人员: "我们的目的是送检前把装配缺陷拦住。",
  机长: "我们的目的是班组送检前把重复问题拦住。",
  交付经理: crossTeam ? "我们的目的是工坊交付前把跨班组重复问题拦住。" : "我们的目的是工坊交付前把重复问题拦住。",
  供应链经理: crossTeam ? "我们的目的是两地交付前把跨厂、跨交付线的重复问题拦住。" : "我们的目的是该厂交付前把跨交付线重复问题拦住。",
  PM: "我们的目的是项目发布前把设计问题拦住。",
  TPM: "我们的目的是把跨项目共性问题拦在设计阶段。",
  研发工程师: "我们的目的就是把问题拦在图纸上、发生之前。",
  产总: "我们的目的是产品部发布前把跨项目问题拦住。",
  产品部负责人: "我们的目的是产品部发布前把跨项目问题拦住。",
}[role] || "我们的目的是把问题拦在流出之前。");

export const roleNextCheckLine = (role = "") => ({
  组装人员: "下一批同类送检前，请按上面这几类当场核对对象和缺陷。",
  机长: "请带着班组在送检前按上面这几类当场核对；设备工装材料问题升级给交付经理。",
  交付经理: "请组织机长在交付前把上面这几类关闭；跨工坊事项升级给供应链经理。",
  供应链经理: "请组织交付经理关闭上面这几类；跨厂、缺标准、缺资源的由你拍板。",
  PM: "请要求所辖工程师在下一份设计输出发布前，按上面这几类核对间隙、干涉、孔位和防护。",
  TPM: "请把上面这几类做成所辖项目发布前必须核对的项。",
  研发工程师: "下一份相关设计输出发布前，请按上面这几类把间隙、避让、孔位和防护核对住，3D或实物确认后再发。",
}[role] || "请在下次同类作业前，按上面这几类当场核对。");

export const roleActionLead = (role, category, short) => ({
  组装人员: `下一批送检前，按「${category}」类当场核对：${short}`,
  机长: `带着班组送检前拦住「${category}」：${short}`,
  交付经理: `组织机长在交付前关闭「${category}」：${short}`,
  供应链经理: `组织交付经理关闭「${category}」：${short}`,
  PM: `要求所辖工程师发布前核对「${category}」：${short}`,
  TPM: `所辖项目发布前核对「${category}」：${short}`,
  研发工程师: `下一份设计输出发布前，按「${category}」类核对并验证：${short}`,
  产总: `请在产品部发布前核对「${category}」：${short}`,
  产品部负责人: `请在产品部发布前核对「${category}」：${short}`,
}[role] || `按「${category}」类核对：${short}`);

export const rdReviewPraise = ({ participation = 0, suggestions = 0 } = {}) => {
  const p = Number(participation || 0) || 0;
  const s = Number(suggestions || 0) || 0;
  if (s >= 1) return `设计评审你参与了 ${p} 次，提出有效改善 ${s} 条。这正是我们要的：把问题拦在图纸上、发生之前。`;
  if (p >= 1) return `设计评审你到场 ${p} 次，但有效改善项是 0。人到了，拦截还没有留下可关闭的意见。请在评审里把干涉、间隙、防护直接提出来。我们的目的就是把问题拦在发生之前。`;
  return "本期没有评审拦截记录。我们的目的就是把问题拦在图纸上、发生之前，这一块是空的，下次相关评审请留下改善项。";
};

const buildPmAnalysisMarkdown = ({ recipient = "", evidence = {}, nextReviewDate = "", period = {} } = {}) => {
  const eng = evidence.engineerMetrics || evidence.roleSnapshot?.dqaAgentMetrics || {};
  const rd = evidence.rdQualityIssues || evidence.roleSnapshot?.rdQualityIssues || {};
  const members = Array.isArray(evidence.teamMembers) ? evidence.teamMembers : [];
  const periodEnd = period._periodEnd || period.end || evidence.roleSnapshot?.period?.end || "";
  const judged = judgePmIssueTrend(rd.periodTrend?.month?.rows || evidence.periodTrend?.month?.rows || [], periodEnd);
  const flow = pmFlowEngineer(members);
  const gap = pmMaterialGap(members, { ecn: eng.agentEcnLineCount, nonBom: eng.agentNonBomLineCount, ecnMachined: eng.ecnMachinedCount ?? eng.ecnMachined, nonBomMachined: eng.nonBomMachinedCount ?? eng.nonBomMachined, memberLabel: "工程师" });
  const examples = (evidence.examples || rd.examples || []).filter((item) => item && (item.description || item.category));
  const categories = evidence.topCategoryStats?.length ? evidence.topCategoryStats : (rd.categories || []);
  const actionCats = classifiedCategoryTop(categories, 3);
  const reasons = reasonRows(eng.ecnReasons || eng.ecnByReason);
  const batchCount = reasons.filter((row) => isBatchOrderEcn(row.name)).reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const issuePeople = [...members].filter((item) => (Number(item.issues ?? item.bad) || 0) > 0).sort((a, b) => (Number(b.issues ?? b.bad) || 0) - (Number(a.issues ?? a.bad) || 0));
  const rateLine = [
    eng.ecnRate != null && eng.bomDenominator ? `ECN比例 ${numberText(eng.ecnCount ?? eng.ecn)}/${numberText(eng.bomDenominator)} = ${percentPointsText(eng.ecnRate)}` : "",
    eng.machinedEcnRate != null && eng.machinedBomDenominator ? `ECN加工件比例 ${numberText(eng.ecnMachinedCount ?? eng.ecnMachined)}/${numberText(eng.machinedBomDenominator)} = ${percentPointsText(eng.machinedEcnRate)}` : "",
    eng.nonBomMachinedRate != null && eng.machinedBomDenominator ? `非BOM加工件比例 ${numberText(eng.nonBomMachinedCount ?? eng.nonBomMachined)}/${numberText(eng.machinedBomDenominator)} = ${percentPointsText(eng.nonBomMachinedRate)}` : "",
  ].filter(Boolean).join("。");
  const catText = actionCats.map((item) => `${item.name} ${item.count}项`).join("、");
  const cited = actionCats.map((cat) => examples.find((item) => item.category === cat.name)).filter(Boolean)
    .map((item) => [item.date, item.engineer, item.description].filter(Boolean).join("，")).join("；");
  const conclusion = [
    [judged.phrase, rateLine ? `${rateLine}。` : "", pmRateShiftNote(eng.monthlyRates), rolePurposeLine("PM"), "跨项目事项升级给 TPM。"].filter(Boolean).join(""),
    [
      catText ? `研发问题主要集中在${catText}。` : "",
      issuePeople[0] ? `研发问题集中在${issuePeople[0].name} ${Number(issuePeople[0].issues ?? issuePeople[0].bad) || 0}项。` : "",
      flow ? `ECN物料行最多的是${flow.name} ${Number(flow.ecnCount) || 0}行。` : "",
      batchCount ? `分批下单 ${batchCount} 项不作为异常。` : "",
      cited ? `代表：${cited}。` : "",
      (() => {
        const reviewers = members.filter((item) => Number(item.reviewCount) > 0).map((item) => item.name);
        const participation = Number(eng.reviewParticipation || 0) || 0;
        const suggestions = Number(eng.reviewSuggestions || 0) || 0;
        if (!participation) return "";
        return `所辖工程师${reviewers.join("、")}参与评审 ${participation} 次，有效改善项 ${suggestions}。${suggestions ? "这正是我们要的：把问题拦在图纸上、发生之前。" : "人到了，没有留下改善项。"}`;
      })(),
      gap,
    ].filter(Boolean).join(""),
    "请先处理物料行最多的变更，再关闭已经定位的图纸缺陷。",
  ].join("\n\n");
  const due = nextReviewDate || "待核实";
  const rows = [];
  if (flow) {
    rows.push(`| 请${flow.name}拆开本期ECN物料行，设计错误单独列出 | ECN物料行 ${Number(flow.ecnCount) || 0}，为所辖最多。分批下单不作为异常 | ${flow.name} | ${due} | 下次报告列出设计错误项数，分批下单单列且不计入异常 |`);
  }
  actionCats.forEach((cat) => {
    const example = examples.find((item) => item.category === cat.name) || {};
    const engineer = example.engineer || issuePeople[0]?.name || recipient || "待核实";
    const short = String(example.description || cat.name).replace(/\|/g, "/").slice(0, 24);
    const problem = [`${cat.name} ${cat.count ?? 0}项`, example.date || "", engineer, String(example.description || "").replace(/\|/g, "/")].filter(Boolean).join("，");
    rows.push(`| 请${engineer}在下次图纸发布前关掉「${cat.name}」：${short} | ${problem} | ${engineer} | ${due} | 下次报告「${short}」已关闭，并出示改后图纸 |`);
  });
  if (!rows.length) return ["## 分析结论", "", conclusion, "", "## 本月措施", "", "本期无待办。"].join("\n");
  return ["## 分析结论", "", conclusion, "", "## 本月措施", "", "| 措施 | 针对的本人/下属问题（必须来自本期固定证据） | Owner | 完成日(YYYY-MM-DD) | 下次报告如何验收 |", "|---|---|---|---|---|", ...rows].join("\n");
};

export const directorDeptLabel = (evidence = {}) => {
  const fromRows = (Array.isArray(evidence.deptRows) ? evidence.deptRows : []).map((item) => String(item?.name || "").trim());
  const fromMembers = (Array.isArray(evidence.teamMembers) ? evidence.teamMembers : []).flatMap((item) => String(item?.dept || "").split(/[、,，]/));
  const names = [...new Set([...fromRows, ...fromMembers].map((item) => String(item || "").trim()).filter(Boolean))];
  return names.join("、") || "产品部";
};

const buildRdFamilyAnalysisMarkdown = ({ role = "", recipient = "", evidence = {}, nextReviewDate = "", period = {} } = {}) => {
  const eng = evidence.engineerMetrics || evidence.roleSnapshot?.dqaAgentMetrics || {};
  const rd = evidence.rdQualityIssues || evidence.roleSnapshot?.rdQualityIssues || {};
  const periodEnd = period._periodEnd || period.end || "";
  const judged = judgePmIssueTrend(rd.periodTrend?.month?.rows || evidence.periodTrend?.month?.rows || [], periodEnd);
  const examples = (evidence.examples || rd.examples || []).filter((item) => item && (item.description || item.category));
  const categories = evidence.topCategoryStats?.length ? evidence.topCategoryStats : (rd.categories || []);
  const rawCats = (Array.isArray(categories) ? categories : []).filter((item) => item && item.name && item.name !== "未分类");
  const derivedCats = rawCats.length ? rawCats : Object.entries(examples.reduce((map, item) => {
    const name = item.category || "未分类";
    map[name] = (map[name] || 0) + 1;
    return map;
  }, {})).map(([name, count]) => ({ name, count }));
  const useCats = classifiedCategoryTop(derivedCats, 3);
  const catText = useCats.map((item) => `${item.name} ${item.count}项`).join("、");
  const citedExamples = useCats.length ? useCats.map((cat) => examples.find((item) => item.category === cat.name)).filter(Boolean) : examples.slice(0, 3);
  const cited = citedExamples.map((item) => [item.date, item.description].filter(Boolean).join("，")).join("；");
  const note = role === "研发工程师" || role === "TPM" || role === "产总" ? rdEcnNonBomNote(eng) : "";
  const rateNote = pmRateShiftNote(eng.monthlyRates || []);
  const childFocus = (role === "TPM" || role === "产总")
    ? (Array.isArray(evidence.teamMembers) ? evidence.teamMembers : []).filter((item) => (Number(item.issues ?? item.bad) || 0) > 0).sort((a, b) => (Number(b.issues ?? b.bad) || 0) - (Number(a.issues ?? a.bad) || 0))
    : [];
  const pmLine = childFocus.slice(0, 3).map((item) => `${item.name} ${Number(item.issues ?? item.bad) || 0}项`).join("、");
  const directorReport = role === "产总" || role === "产品部负责人";
  const dept = directorReport ? directorDeptLabel(evidence) : "";
  const focusLine = directorReport
    ? (pmLine ? `问题集中在TPM ${pmLine}。` : "")
    : (pmLine ? `所辖PM集中在${pmLine}。` : "");
  const topChild = role === "产总" ? (childFocus[0]?.name || "") : "";
  const oqcLine = (role === "TPM" || role === "产总") && Number(evidence.oqcShipment?.count) > 0
    ? `出货 ${numberText(evidence.oqcShipment.count)} 台，平均分 ${numberText(evidence.oqcShipment.avg)}，5分比例 ${percentPointsText(evidence.oqcShipment.fiveRate)}，低分比例 ${percentPointsText(evidence.oqcShipment.lowRate)}。`
    : "";
  const reviewLine = role === "研发工程师"
    ? rdReviewPraise({ participation: eng.reviewParticipation, suggestions: eng.reviewSuggestions })
    : (Number(eng.reviewParticipation || 0) > 0 ? (directorReport ? `${dept}评审 ${Number(eng.reviewParticipation || 0)} 场，有效改善项 ${Number(eng.reviewSuggestions || 0)}。` : `所辖工程师参与评审 ${Number(eng.reviewParticipation || 0)} 次，有效改善项 ${Number(eng.reviewSuggestions || 0)}。`) : "");
  const close = role === "TPM"
    ? "请把上面这几类做成所辖项目发布前必须核对的项。项目节奏交给 PM，技术输出交给工程师。需要资源的升级给产总。"
    : (role === "产总" || role === "产品部负责人")
      ? (topChild && useCats[0] ? `上述问题仍有流出，主要集中在${childFocus.slice(0, 3).map((item) => item.name).join("、")}。` : `${dept}各TPM之间的问题见下面分类。`)
      : roleNextCheckLine("研发工程师");
  const conclusion = [
    [judged.phrase, rateNote, oqcLine, directorReport ? `就质量结果看，${dept}发布前仍有跨项目问题流出。` : rolePurposeLine(role)].filter(Boolean).join(""),
    [catText ? `研发问题主要集中在${catText}。` : "", focusLine, cited ? `代表：${cited}。` : "", reviewLine, note].filter(Boolean).join(""),
    close,
  ].join("\n\n");
  if (directorReport) {
    const bullets = useCats.map((cat) => {
      const example = examples.find((item) => item.category === cat.name) || {};
      const fact = [example.date, String(example.description || "").replace(/\|/g, "/")].filter(Boolean).join("，");
      return `- ${cat.name} ${cat.count ?? 0}项。${fact ? `其中：${fact}。` : ""}`;
    });
    const avoidable = reasonRows(eng.ecnReasons || eng.ecnByReason).filter((row) => isAvoidableEcnReason(row.name)).sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
    const lineOwner = (Array.isArray(evidence.teamMembers) ? evidence.teamMembers : []).slice().sort((a, b) => (Number(b.ecnCount) || 0) - (Number(a.ecnCount) || 0))[0]?.name || topChild;
    if (avoidable[0]) bullets.push(`- 可避免变更中，${avoidable[0].name} ${avoidable[0].count}项为最多${lineOwner ? `，物料行较多的是${lineOwner}` : ""}。分批下单未计入异常。`);
    return ["## 分析结论", "", conclusion, "", "## 重点关注事项", "", bullets.length ? bullets.join("\n") : "本期没有需要单列的事项。"].join("\n");
  }
  const due = nextReviewDate || "待核实";
  const owner = recipient || "待核实";
  const rows = useCats.map((cat) => {
    const example = examples.find((item) => item.category === cat.name) || {};
    const short = String(example.description || cat.name).replace(/\|/g, "/").slice(0, 24);
    const problem = [`${cat.name} ${cat.count ?? 0}项`, example.date || "", String(example.description || "").replace(/\|/g, "/")].filter(Boolean).join("，");
    const lead = roleActionLead(role, cat.name, short);
    const accept = role === "研发工程师" ? "出示对应图纸/3D证据，且该类问题下降" : "下次报告该类在所辖范围下降，并出示核对记录";
    return `| ${lead} | ${problem} | ${owner} | ${due} | ${accept} |`;
  });
  if (!useCats.length) {
    examples.slice(0, 3).forEach((example) => {
      const short = String(example.description || "问题").replace(/\|/g, "/").slice(0, 24);
      rows.push(`| ${roleActionLead(role, example.category || "问题", short)} | ${[example.date, example.description].filter(Boolean).join("，")} | ${owner} | ${due} | 出示对应证据，且该类问题下降 |`);
    });
  }
  if (role === "研发工程师") {
    const avoidable = reasonRows(eng.ecnReasons || eng.ecnByReason).filter((row) => isAvoidableEcnReason(row.name)).sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
    if (avoidable[0]) rows.push(`| 下次BOM/图纸发布前堵住「${avoidable[0].name}」 | ECN可避免：${avoidable[0].name} ${avoidable[0].count}项（分批下单不计入异常） | ${owner} | ${due} | 该类可避免ECN不再新增 |`);
    const nonBomMachined = Number(eng.nonBomMachinedCount ?? eng.nonBomMachined ?? 0) || 0;
    if (nonBomMachined > 0) rows.push(`| 下次设计输出把加工件补进BOM，或写明不能进的原因 | 非BOM加工件 ${nonBomMachined} 项 | ${owner} | ${due} | 新开加工件进BOM或有书面原因 |`);
  }
  if (!rows.length) return ["## 分析结论", "", conclusion, "", "## 本月措施", "", "本期无待办。"].join("\n");
  return ["## 分析结论", "", conclusion, "", "## 本月措施", "", "| 措施 | 针对的本人/下属问题（必须来自本期固定证据） | Owner | 完成日(YYYY-MM-DD) | 下次报告如何验收 |", "|---|---|---|---|---|", ...rows].join("\n");
};


export const buildDeterministicAnalysisMarkdown = ({ role = "", recipient = "", evidence = {}, nextReviewDate = "", period = {}, rankingRows = [] } = {}) => {
  if (role === "PM") return buildPmAnalysisMarkdown({ recipient, evidence, nextReviewDate, period });
  if (["研发工程师", "TPM", "产总", "产品部负责人"].includes(role)) return buildRdFamilyAnalysisMarkdown({ role, recipient, evidence, nextReviewDate, period });
  const examples = (evidence.examples || evidence.rdQualityIssues?.examples || []).filter((item) => item && (item.description || item.category));
  const categories = evidence.topCategoryStats || evidence.rdQualityIssues?.categories || [];
  const due = nextReviewDate || "待核实";
  const owner = recipient || "待核实";
  const top = examples.slice(0, 3);
  const eng = evidence.engineerMetrics || evidence.roleSnapshot?.dqaAgentMetrics || {};
  const rd = evidence.rdQualityIssues || evidence.roleSnapshot?.rdQualityIssues || {};
  if (role !== "研发工程师" && role !== "PM" && !top.length && !categories.length && Number(evidence.ipqcMetrics?.badRecords || evidence.roleSnapshot?.metrics?.bad || 0) <= 0) return defaultAnalysisMarkdown({ skipped: true });
  const periodEnd = period._periodEnd || period.end || evidence.roleSnapshot?.period?.end || "";
  const issueCount = Number(rd.count || 0);
  const ipqcBad = Number(evidence.ipqcMetrics?.badRecords || evidence.roleSnapshot?.metrics?.bad || 0);
  const qualityCount = role === "研发工程师" || role === "PM" ? (issueCount || Number(evidence.matchedRows || 0)) : (ipqcBad || issueCount || (top.length ? top.length : 0));
  const fullMonthRows = rd.periodTrend?.month?.rows || evidence.periodTrend?.month?.rows || [];
  const monthlyRows = role === "PM"
    ? fullMonthRows
    : selectedMonthRows(role === "研发工程师"
      ? fullMonthRows
      : (evidence.periodTrend?.month?.rows || fullMonthRows), period);
  const exampleLine = top.map((item) => [item.date, role === "PM" ? item.engineer : "", item.description].filter(Boolean).join("，")).filter(Boolean).join("；");
  const derivedCats = Object.entries((examples || []).reduce((map, item) => {
    const name = item.category || "未分类";
    map[name] = (map[name] || 0) + 1;
    return map;
  }, {})).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 3);
  const categoryTop = ((categories || []).length ? categories : derivedCats).slice(0, 3);
  const actionCats = role === "PM" ? classifiedCategoryTop(categories.length ? categories : derivedCats, 3) : categoryTop;
  const citedExamples = role === "PM"
    ? actionCats.map((cat) => examples.find((item) => item.category === cat.name)).filter(Boolean)
    : top;
  const citedLine = citedExamples.map((item) => [item.date, role === "PM" ? item.engineer : "", item.description].filter(Boolean).join("，")).filter(Boolean).join("；");
  const teamBad = (Array.isArray(evidence.teamMembers) ? evidence.teamMembers : []).filter((item) => Number(item.bad || 0) > 0);
  const siteBad = (evidence.siteStats || evidence.roleSnapshot?.siteStats || []).filter((item) => Number(item.bad || 0) > 0);
  const captainBad = (evidence.captainTop || evidence.roleSnapshot?.captainTop || []).filter((item) => Number(item.bad || 0) > 0);
  const crossSite = siteBad.length >= 2;
  const crossTeam = role === "供应链经理" ? crossSite : teamBad.length >= 2;
  const teamLine = teamBad.slice(0, 3).map((item) => `${item.name} ${item.bad}项`).join("、");
  const siteLine = siteBad.map((item) => `${item.name} ${item.bad}项（不良率 ${Number(item.badRate || 0).toFixed(2)}%）`).join("、");
  const captainLine = captainBad.slice(0, 3).map((item) => `${item.name}${item.manager ? "·" + item.manager : ""} ${item.bad}项`).join("、");
  const catText = (role === "PM" ? actionCats : categoryTop).map((item) => `${item.name} ${item.count}项`).join("、");
  const judged = judgeRdIssueTrend(monthlyRows, periodEnd, role === "研发工程师" || role === "PM" ? "问题" : "不良");
  const rank = (Array.isArray(rankingRows) ? rankingRows : []).find((row) => row.selected) || evidence.ranking || null;
  const rankText = role === "供应链经理" || role === "PM" ? "" : (rank?.rank && rank?.total
    ? `同口径第${rank.rank}/${rank.total}名，不良数量${rank.rank > rank.total / 2 ? "靠后" : "靠前"}。`
    : "");
  const weekHot = (evidence.periodTrend?.week?.rows || []).filter((row) => row.selected && (Number(row.bad || row.count || 0) > 0))
    .sort((a, b) => Number(b.bad || b.count || 0) - Number(a.bad || a.count || 0))
    .slice(0, 3)
    .map((row) => {
      const week = String(row.label || "").replace(/^\d{4}-/, "");
      return `${week} ${Number(row.bad || row.count || 0)}项`;
    });
  const weekText = weekHot.length ? `周度尖峰在${weekHot.join("、")}。` : "";
  const missingEvidence = role === "供应链经理"
    ? [!siteLine ? "厂区" : "", !catText ? "分类" : "", !teamLine ? "交付经理名单" : ""].filter(Boolean)
    : [!catText ? "分类" : "", role === "PM" ? (!teamLine ? "工程师名单" : "") : (!teamLine ? "机长名单" : "")].filter(Boolean);
  const outflow = qualityCount > 0
    ? (role === "供应链经理"
      ? [
        siteLine ? `厂区：${siteLine}。` : "",
        catText ? `主要集中在${catText}。` : "",
        teamLine ? (teamBad.length >= 2 ? `跨交付线集中在${teamLine}。` : `主要集中在交付经理${teamLine}。`) : "",
        captainLine ? `机长Top：${captainLine}。` : "",
        weekText,
        citedLine ? `代表：${citedLine}。` : "",
        (!siteLine || !teamLine) ? `本期固定摘要还没有${missingEvidence.join("/")}，不能把不良打包结案。` : "",
      ].filter(Boolean).join("")
      : [
      catText ? `主要集中在${catText}。` : `本期固定摘要还没有${missingEvidence.join("/")}，不能把不良打包结案。`,
      teamLine ? (role === "PM" ? `所辖工程师集中在${teamLine}。` : (crossTeam ? `跨班组集中在${teamLine}。` : `主要集中在${teamLine}。`)) : "",
      weekText,
      citedLine ? `代表：${citedLine}。` : "",
    ].filter(Boolean).join(""))
    : (role === "PM" && (Number(eng.ecnCount ?? eng.ecn ?? 0) > 0 || Number(eng.nonBomCount ?? eng.nonBom ?? 0) > 0)
      ? `本期没有归到所辖工程师的研发问题流出。ECN ${Number(eng.ecnCount ?? eng.ecn ?? 0)} 项，ECN比例 ${Number(eng.ecnRate ?? 0)}%；非BOM ${Number(eng.nonBomCount ?? eng.nonBom ?? 0)} 项。请盯加工件变更和临时下单。`
      : "本期没有流出的质量问题。请继续保持。");
  const namedClose = actionCats.map((item) => `「${item.name}」`).join("、");
  const closeLine = qualityCount <= 0
    ? (role === "PM" ? "请要求工程师发布前把加工件进BOM、能避免的ECN拦住；跨项目升级给TPM。" : "请继续按标准核对，别回潮。")
    : (role === "交付经理" && actionCats.length
      ? `请组织机长在交付前关闭${namedClose}；跨工坊事项升级给供应链经理。`
      : (role === "供应链经理" && actionCats.length
        ? `请组织交付经理关闭${namedClose}；跨厂、缺标准、缺资源的由你拍板。`
        : roleNextCheckLine(role)));
  const conclusion = role === "研发工程师"
    ? [
        judged.phrase,
        rdReviewPraise({ participation: eng.reviewParticipation, suggestions: eng.reviewSuggestions }),
        "",
        qualityCount > 0
          ? [
            catText ? `仍有问题流到现场，主要集中在${catText}。` : "本期固定摘要还没有分类名单，不能把问题打包结案。",
            citedLine ? `代表：${citedLine}。` : "具体现象请对照上面的问题分类和趋势图复盘。",
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
        role === "PM" ? rdReviewPraise({ participation: eng.reviewParticipation, suggestions: eng.reviewSuggestions }) : "",
        "",
        outflow,
        "",
        closeLine,
      ].filter((line) => line !== undefined).join("\n");
  const actionRowsFor = () => {
    if (role === "供应链经理") {
      const supplyRows = actionCats.map((cat, index) => {
        const example = examples.find((item) => item.category === cat.name) || examples[0] || {};
        const problem = `${cat.name} ${cat.count ?? ""}项${example.date ? `。代表：${example.date}｜${example.description || ""}` : ""}`.replace(/\|/g, "/");
        const mgr = teamBad[index] || teamBad[0];
        if (index === 0 && crossSite) {
          return `| 杭州、深圳都有「${cat.name}」，请统一标准后再交付 | ${problem} | ${owner} | ${due} | 两地该类不良下降 |`;
        }
        const actionOwner = mgr?.name || owner;
        const lead = mgr ? `请${mgr.name}把「${cat.name}」压下去` : roleActionLead(role, cat.name, String(example.description || cat.name).slice(0, 18));
        return `| ${lead} | ${problem} | ${actionOwner} | ${due} | 出示对应工坊关闭证据，且该类问题下降 |`;
      });
      if (supplyRows.length) return supplyRows;
      if (qualityCount > 0) return [`| 先补厂区和交付经理名单，再按线关闭 | 固定摘要不完整，不良 ${qualityCount} 项 | ${owner} | ${due} | 先补名单再按交付经理关闭 |`];
      return supplyRows;
    }
    const rows = actionCats.map((cat) => {
      const example = examples.find((item) => item.category === cat.name) || {};
      const short = String(example.description || cat.name).slice(0, 18);
      const engineer = role === "PM" ? (example.engineer || teamBad[0]?.name || owner) : owner;
      const problem = `${cat.name} ${cat.count ?? ""}项${example.date ? `。代表：${example.date}｜${example.engineer || ""}｜${example.description || ""}` : ""}`.replace(/\|/g, "/");
      const accept = role === "PM"
        ? `下次报告「${cat.name}」少于本期 ${cat.count ?? 0} 项`
        : (role === "研发工程师" ? "出示对应图纸/3D证据，且该类问题下降" : "出示对应批次/现场证据，且该类问题下降");
      const lead = role === "PM" ? `请${engineer}在下次图纸发布前关掉「${cat.name}」：${short}` : roleActionLead(role, cat.name, short);
      return `| ${lead} | ${problem} | ${engineer} | ${due} | ${accept} |`;
    });
    if (role !== "PM" && rows.length < 2) {
      examples.slice(0, 3).forEach((example) => {
        if (!example?.description || rows.some((line) => line.includes(example.description))) return;
        rows.push(`| ${roleActionLead(role, example.category || "问题", String(example.description).slice(0, 18))} | ${example.date || ""}｜${example.description} | ${owner} | ${due} | 出示对应证据，且该类问题下降 |`);
      });
    }
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
    if (role === "PM" && !rows.length && (Number(eng.ecnCount ?? eng.ecn ?? 0) > 0 || Number(eng.nonBomMachinedCount ?? eng.nonBomMachined ?? 0) > 0)) {
      if (Number(eng.ecnMachinedCount ?? eng.ecnMachined ?? 0) > 0) {
        rows.push(`| 下次BOM/图纸发布前把加工件ECN拦在设计侧 | ECN加工件 ${Number(eng.ecnMachinedCount ?? eng.ecnMachined ?? 0)} 项，ECN加工件比例 ${Number(eng.machinedEcnRate ?? 0)}% | ${owner} | ${due} | 加工件ECN比例下降 |`);
      }
      if (Number(eng.nonBomMachinedCount ?? eng.nonBomMachined ?? 0) > 0) {
        rows.push(`| 下次设计输出把加工件补进BOM，或写明不能进的原因 | 非BOM加工件 ${Number(eng.nonBomMachinedCount ?? eng.nonBomMachined ?? 0)} 项 | ${owner} | ${due} | 新开加工件进BOM或有书面原因 |`);
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

const DIRECTOR_SCOPE_RE = /你的辖区|你辖区|你辖内|你辖/g;
export const repairDirectorAnalysis = (analysis = "", fallback = "", evidence = {}) => {
  const dept = directorDeptLabel(evidence);
  const swapScope = (text) => String(text || "").replace(DIRECTOR_SCOPE_RE, dept);
  const fallbackFocus = String(fallback || "").match(/#{1,6}\s+[^\n]*重点关注事项[\s\S]*$/i)?.[0] || "## 重点关注事项\n\n本期没有需要单列的事项。";
  const fallbackConclusion = String(fallback || "").match(/#{1,6}\s+[^\n]*分析结论[\s\S]*?(?=\n#{1,6}\s|$)/i)?.[0] || "";
  const text = swapScope(analysis);
  const conclusion = text.match(/#{1,6}\s+[^\n]*分析结论[\s\S]*?(?=\n#{1,6}\s|$)/i)?.[0] || "";
  const focusPart = text.match(/#{1,6}\s+[^\n]*(?:重点关注事项|本月措施)[\s\S]*$/i)?.[0] || "";
  const badConclusion = !conclusion || recipientVoiceBroken(conclusion, "") || conclusionMissingNumbers(conclusion) || /由你拍板|请产总|你要求|本月措施|请您|我们一起|抓重点|请继续|方便您|\|\s*Owner\s*\|/.test(conclusion);
  const badFocus = !/重点关注事项/.test(focusPart) || /\|/.test(focusPart) || /Owner|完成日|你要求|请产总|由你拍板|本月措施|请您|我们一起|抓重点|请继续|方便您/.test(focusPart);
  return sanitizeRecipientAnalysis([swapScope(badConclusion ? fallbackConclusion : conclusion).trim(), swapScope(badFocus ? fallbackFocus : focusPart).trim()].filter(Boolean).join("\n\n"));
};

export const repairRoleAnalysis = (analysis = "", fallback = "", role = "", evidence = {}, recipient = "") => {
  if (role === "产总" || role === "产品部负责人") return repairDirectorAnalysis(analysis, fallback, evidence);
  let next = String(analysis || "");
  if (/月度不足/.test(next)) next = replaceAnalysisConclusion(next, fallback).replace(/月度不足，不判断趋势。?/g, "");
  next = ensureActionTable(next, fallback);
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
    const match = text.match(new RegExp(`(^#{1,6}\\s+[^\\n]*${title}[^\\n]*\\r?\\n)([\\s\\S]*?)(?=\\n#{1,6}\\s+|$(?![\\s\\S]))`, "mi"));
    return match ? `${match[1]}${match[2]}`.trim() : "";
  };
  const conclusion = pick("分析结论") || pick("个人质量判决");
  const actions = pick("重点关注事项") || pick("本月措施");
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
  if (role === "PM" || role === "TPM" || role === "产总") {
    const isDirector = role === "产总";
    const isTpm = role === "TPM";
    const superior = isDirector ? "" : isTpm ? (evidence.director || evidence.mapping?.[0]?.productionDirector || "") : (evidence.tpm || evidence.mapping?.[0]?.tpm || "");
    lines.push("| 指标 | 数值 |", "|---|---:|");
    const deptLabel = isDirector ? directorDeptLabel(evidence) : "";
    lines.push(`| ${isDirector ? deptLabel + "研发问题" : "所辖研发问题"} | ${numberText(rd.count ?? evidence.matchedRows)} |`);
    if (isDirector) {
      lines.push(`| ${deptLabel} TPM | ${numberText(evidence.tpmCount || (evidence.teamMembers || []).length)} |`);
      lines.push(`| ${deptLabel} PM | ${numberText(evidence.pmCount)} |`);
    } else {
      lines.push(`| 所辖${isTpm ? "PM" : "工程师"} | ${numberText((evidence.teamMembers || []).filter((item) => item.name !== "未填写创建人").length)} |`);
    }
    lines.push(`| 项目数 | ${numberText(eng.projectCount)} |`);
    lines.push(`| ECN条数 | ${numberText(eng.ecnCount ?? eng.ecn)} |`);
    if (eng.bomDenominator) lines.push(`| 物料款数 | ${numberText(eng.bomDenominator)} |`);
    if (eng.ecnRate != null) lines.push(`| ECN比例 | ${percentPointsText(eng.ecnRate)}（${numberText(eng.ecnCount ?? eng.ecn)}/${numberText(eng.bomDenominator)}） |`);
    if (eng.agentEcnLineCount != null) lines.push(`| ECN物料行 | ${numberText(eng.agentEcnLineCount)} |`);
    lines.push(`| ECN加工件 | ${numberText(eng.ecnMachinedCount ?? eng.ecnMachined)} / ${numberText(eng.machinedBomDenominator)} |`);
    if (eng.machinedEcnRate != null) lines.push(`| ECN加工件比例 | ${percentPointsText(eng.machinedEcnRate)}（${numberText(eng.ecnMachinedCount ?? eng.ecnMachined)}/${numberText(eng.machinedBomDenominator)}） |`);
    lines.push(`| 非BOM物料行 | ${numberText(eng.agentNonBomLineCount ?? eng.nonBomCount ?? eng.nonBom)} |`);
    lines.push(`| 非BOM加工件 | ${numberText(eng.nonBomMachinedCount ?? eng.nonBomMachined)} / ${numberText(eng.machinedBomDenominator)} |`);
    if (eng.nonBomMachinedRate != null) lines.push(`| 非BOM加工件比例 | ${percentPointsText(eng.nonBomMachinedRate)}（${numberText(eng.nonBomMachinedCount ?? eng.nonBomMachined)}/${numberText(eng.machinedBomDenominator)}） |`);
    lines.push(`| 设计评审场次 | ${numberText(eng.reviewParticipation || 0)} |`);
    lines.push(`| 有效改善项 | ${numberText(eng.reviewSuggestions || 0)}${Number(eng.reviewParticipation || 0) > 0 && Number(eng.reviewSuggestions || 0) === 0 ? (role === "产总" ? "（有评审到场，未留下改善项）" : "（人到了，没有留下改善项）") : ""} |`);
    if (superior) lines.push(`| ${isTpm ? "上级产总" : "上级TPM"} | ${superior} |`);
    if ((isTpm || isDirector) && evidence.oqcShipment) {
      const oqc = evidence.oqcShipment;
      lines.push(`| 出货机台 | ${numberText(oqc.count)} |`);
      lines.push(`| 平均分 | ${numberText(oqc.avg)} |`);
      if (Number(oqc.count) > 0) {
        lines.push(`| 5分比例 | ${percentPointsText(oqc.fiveRate)}（${numberText(oqc.five)}/${numberText(oqc.count)}） |`);
        lines.push(`| 低分比例 | ${percentPointsText(oqc.lowRate)}（${numberText(oqc.low)}/${numberText(oqc.count)}） |`);
      }
    }
  } else if (role === "研发工程师") {
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
  if (role === "供应链经理") {
    const sites = (evidence.siteStats || evidence.roleSnapshot?.siteStats || []).filter((item) => Number(item.total || 0) > 0 || Number(item.bad || 0) > 0);
    if (Array.isArray(sites) && sites.length) {
      lines.push("", "## 厂区对比", "", "| 厂区 | 送检记录 | 不良记录 | 合格记录 | 不良率 |", "|---|---:|---:|---:|---:|");
      sites.forEach((item) => lines.push(`| ${item.name} | ${numberText(item.total)} | ${numberText(item.bad)} | ${numberText(item.good)} | ${numberText(item.badRate, "%")} |`));
    }
  }
  if (role === "PM" || role === "TPM" || role === "产总") {
    const who = role === "产总" ? directorDeptLabel(evidence) + "的TPM" : role === "TPM" ? "所辖PM" : "本PM";
    lines.push("", "## 设计评审正向贡献", "", "| 指标 | 本周期数据 | 口径 |", "|---|---:|---|");
    lines.push(`| 参与评审 | ${numberText(eng.reviewParticipation || 0)} 场 | 一场评审只归组织它的PM${role === "PM" ? "" : "，再归到该PM的TPM"}，只计一次。名单里有PM就用这个PM；没有PM，就按到场工程师最常对应的PM。研发问题表里阶段写成评审的行不计入 |`);
    lines.push(`| 有效改善项 | ${numberText(eng.reviewSuggestions || 0)} 条 | 归到${who}的这场评审里，提出人按行计，不把到场人数当成改善项 |`);
    lines.push("", role === "产总" ? "评审参与和有效改善项单独列出，不并入研发问题、ECN和非BOM。" : "这是前置贡献，不计入研发问题、ECN、非BOM和排名。");
    if (role === "TPM" || role === "产总") {
      const peer = role === "产总" ? "产总" : "TPM";
      lines.push("", "## 5分比例月度趋势", "", "## 低分比例月度趋势", "", `## 各${peer} · 5分比例`, "", `## 各${peer} · 低分比例`, ...(role === "产总" ? ["", "## 各TPM · 5分比例", "", "## 各TPM · 低分比例"] : []), "", "## 各TPM · 平均分", "");
      lines.push("", role === "产总" ? "5分比例、低分比例列了产品部对照，也列了本产品部各TPM对照。平均分、ECN、研发问题和评审只列本产品部各TPM。5分取「2025年-2026年评分按月汇总」里的治具和自动化整机，满分是5。平均分 = 评分档位×数量 / 出货机台数。5分比例 = 5分机台数 / 出货机台数。低分比例 = 1到3分机台数 / 出货机台数。月度从当年1月列到所选结束月。" : `5分统计用「2025年-2026年评分按月汇总」。这张表只含治具和自动化整机，组件不进5分。平均分 = 评分档位×数量 / 出货机台数，满分是5。5分比例 = 5分机台数 / 出货机台数。低分比例 = 1到3分机台数 / 出货机台数。表内数字是所选周期；月度从当年1月画到所选结束月。和其他TPM比的是同一统计周期。`);
    }
  }
  if ((role === "PM" || role === "TPM" || role === "产总") && Array.isArray(evidence.teamMembers) && evidence.teamMembers.length) {
    const isDirector = role === "产总";
    const isTpm = role === "TPM";
    const peerWord = isDirector || isTpm ? "TPM" : "PM";
    lines.push("", isDirector ? "## " + directorDeptLabel(evidence) + " TPM" : isTpm ? "## 所辖PM" : "## 所辖工程师", "", isDirector
      ? "统计范围为本产品部组织映射中的TPM和PM。研发问题按这些PM列统计，阶段写成「评审」的不计入。评审场次和有效改善项只取评审表。一场评审只归组织评审的PM，再归到该PM的TPM，只计一次。名单里有PM就用这个PM；没有PM时，按到场工程师最常对应的PM。5分只统计评分月汇总中的整机。"
      : isTpm
      ? "范围只取研发组织映射里归到当前TPM的PM。研发问题按这些PM列统计，阶段写成「评审」的行不计入，也不计入评审次数。评审次数和有效改善项只来自每一份评审表单。ECN、非BOM物料行是各PM名下的行，相加应等于上面的物料行。"
      : "ECN、非BOM 这两列是本 PM 名下的物料行，不是上面的 ECN 条数。各工程师物料行相加，应等于本 PM 的 ECN物料行、非BOM物料行。研发问题只统计 PM 列就是当前 PM、且阶段不是「评审」的记录。阶段写成评审的行不计入研发问题，也不计入评审次数。评审次数和有效改善项只来自每一份评审表单。工程师交叉使用时，写成其他 PM 的问题归其他 PM。", "", isDirector ? "| TPM | 产品部 | 研发问题 | ECN物料行 | ECN加工件 | 非BOM物料行 | 非BOM加工件 | 评审次数 | 有效改善项 |" : isTpm ? "| PM | 研发问题 | ECN物料行 | ECN加工件 | 非BOM物料行 | 非BOM加工件 | 评审次数 | 有效改善项 |" : "| 工程师 | 研发问题 | ECN物料行 | ECN加工件 | 非BOM物料行 | 非BOM加工件 | 评审次数 | 有效改善项 |", isDirector ? "|---|---|---:|---:|---:|---:|---:|---:|---:|" : "|---|---:|---:|---:|---:|---:|---:|---:|");
    evidence.teamMembers.forEach((item) => {
      lines.push(isDirector ? `| ${item.name} | ${item.dept || ""} | ${numberText(item.issues ?? item.bad)} | ${numberText(item.ecnCount)} | ${numberText(item.ecnMachinedCount)} | ${numberText(item.nonBomCount)} | ${numberText(item.nonBomMachinedCount)} | ${numberText(item.reviewCount)} | ${numberText(item.suggestions)} |` : `| ${item.name} | ${numberText(item.issues ?? item.bad)} | ${numberText(item.ecnCount)} | ${numberText(item.ecnMachinedCount)} | ${numberText(item.nonBomCount)} | ${numberText(item.nonBomMachinedCount)} | ${numberText(item.reviewCount)} | ${numberText(item.suggestions)} |`);
    });
    const materialGap = pmMaterialGap(evidence.teamMembers, { ecn: eng.agentEcnLineCount, nonBom: eng.agentNonBomLineCount, ecnMachined: eng.ecnMachinedCount ?? eng.ecnMachined, nonBomMachined: eng.nonBomMachinedCount ?? eng.nonBomMachined, memberLabel: role === "产总" ? "TPM" : role === "TPM" ? "PM" : "工程师" });
    if (materialGap) lines.push("", materialGap);
    const batchCount = reasonRows(eng.ecnReasons || eng.ecnByReason).filter((row) => isBatchOrderEcn(row.name)).reduce((sum, row) => sum + (Number(row.count) || 0), 0);
    lines.push("", "## ECN变更活动", "");
    if (batchCount) lines.push(`分批下单 ${batchCount} 项不作为异常。`);
    lines.push("", "## 非BOM申请活动", "", "## ECN比例月度趋势", "", "## ECN加工件比例月度趋势", "", "## 非BOM加工件比例月度趋势", "", `## 各${peerWord} · ECN比例`, "");
    const peerRows = Array.isArray(evidence.pmPeerRows) ? evidence.pmPeerRows : [];
    if (peerRows.length >= 2 && !peerRatesDefined(peerRows, { valueKey: "ecnRate", denomKey: "ecnDenominator" })) lines.push("", role === "产总" ? "部分TPM物料款数为0，此项未作对照。" : "有人物料款数是0，本图不排名。");
    lines.push("", `## 各${peerWord} · ECN加工件比例`, "");
    if (peerRows.length >= 2 && !peerRatesComparable(peerRows, { valueKey: "machinedEcnRate", denomKey: "machinedDenominator" })) lines.push("", role === "产总" ? "分母不一致，未作对照。" : "分母不一致，本图不排名。");
    lines.push("", `## 各${peerWord} · 非BOM加工件比例`, "");
    if (peerRows.length >= 2 && !peerRatesComparable(peerRows, { valueKey: "nonBomMachinedRate", denomKey: "nonBomDenominator" })) lines.push("", role === "产总" ? "分母不一致，未作对照。" : "分母不一致，本图不排名。");
    lines.push("", `## 各${peerWord} · 研发问题数量`, "", `## 各${peerWord} · 设计评审次数`, "");
    if ((evidence.rdQualityIssues?.count || 0) > 0) {
      lines.push("", "## 研发问题月度趋势", "", "## 问题分类", "");
      const issueCats = evidence.rdQualityIssues?.categories || categories || [];
      if (issueCats.length) {
        lines.push("| 问题类型 | 数量 |", "|---|---:|");
        issueCats.slice(0, 8).forEach((item) => lines.push(`| ${item.name || "未分类"} | ${numberText(item.count)} |`));
      }
    }
  }
  if (role !== "研发工程师" && role !== "PM" && role !== "TPM" && role !== "产总") {
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
  if (role !== "PM" && role !== "TPM" && role !== "产总" && Array.isArray(evidence.teamMembers) && evidence.teamMembers.length) {
    const memberSpec = teamMemberSpecForRole(role) || { label: "人员", sectionId: "组内成员" };
    lines.push("", `## ${memberSpec.sectionId}`, "", `| ${memberSpec.label} | 送检记录 | 不良记录 | 合格记录 | 不良率 |`, "|---|---:|---:|---:|---:|");
    evidence.teamMembers.slice(0, 20).forEach((item) => {
      lines.push(`| ${item.name} | ${numberText(item.total)} | ${numberText(item.bad)} | ${numberText(item.good)} | ${numberText(item.badRate, "%")} |`);
    });
    if (evidence.teamMembers.length > 20) lines.push(`| 其余 ${evidence.teamMembers.length - 20} 人 | 见固定证据 | | | |`);
  }
  if (role === "供应链经理") {
    const captains = (evidence.captainTop || evidence.roleSnapshot?.captainTop || []).filter((item) => Number(item.bad || 0) > 0).slice(0, 8);
    if (captains.length) {
      lines.push("", "## 机长 Top", "", "| 机长 | 厂区 | 交付经理 | 送检记录 | 不良记录 | 不良率 |", "|---|---|---|---:|---:|---:|");
      captains.forEach((item) => lines.push(`| ${item.name} | ${item.site || ""} | ${item.manager || ""} | ${numberText(item.total)} | ${numberText(item.bad)} | ${numberText(item.badRate, "%")} |`));
    }
  }
  if (role === "产总") {
    // 向上汇报，不写排名说明。
  } else {
  lines.push("", "## 排名");
  if (role === "供应链经理") {
    lines.push("", "供应链经理不参与个人排名。请看厂区对比和交付经理。");
  } else if (role === "PM") {
    lines.push("", "PM不参与个人风险排名。下面是各PM管理范围横向对比，不是个人对错。");
  } else if (role === "TPM") {
    lines.push("", "TPM不按原始行数排名。下面是各TPM管理范围横向对比，不是个人对错。");
  } else {
    const focus = Array.isArray(rankingRows) ? rankingRows.find((row) => row.selected) : null;
    if (focus?.rank && focus?.total) lines.push("", `当前按同口径降序为 **第 ${focus.rank}/${focus.total} 名**，本人 ${numberText(focus.value)}。排名不是能力评价。`);
  }
  }
  return lines.join("\n").trim();
};

export const FIXED_CODE_MODEL = "fixed-code";
export const aiParticipationModel = (model = "") => `ai-${String(model || "model").replace(/^ai-/, "").replace(/[<>:"/\\|?*\s]/g, "").slice(0, 48) || "model"}`;
export const previousReportExcerpt = (markdown = "") => {
  const text = String(markdown || "");
  const pick = (title) => {
    const match = text.match(new RegExp(`(?:^|\\n)(#{1,6}\\s+[^\\n]*${title}[^\\n]*\\r?\\n)([\\s\\S]*?)(?=\\n#{1,6}\\s+|$)`, "i"));
    return match ? `${match[1]}${match[2]}`.trim() : "";
  };
  return [pick("分析结论"), pick("重点关注事项") || pick("本月措施")].filter(Boolean).join("\n\n").slice(0, 1200);
};
const reportWindow = (item = {}) => {
  const period = item.period || {};
  return {
    start: String(period._periodStart || period.start || "").slice(0, 10),
    end: String(period._periodEnd || period.end || "").slice(0, 10),
  };
};
export const selectPreviousRoleReport = (reports = [], { recipient = "", role = "", period = {} } = {}) => {
  const currentStart = String(period._periodStart || period.start || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(currentStart)) return null;
  const moduleName = role ? `角色报告-${role}` : "";
  return [...reports]
    .filter((item) => item && item.fileName && item.recipient === recipient)
    .filter((item) => !moduleName || item.role === role || String(item.module || moduleName) === moduleName)
    .map((item) => ({ item, ...reportWindow(item) }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.end) && row.end < currentStart)
    .sort((a, b) => b.end.localeCompare(a.end) || String(b.item.savedAt || b.item.updatedAt || "").localeCompare(String(a.item.savedAt || a.item.updatedAt || "")))[0]?.item || null;
};
const pmDirectiveEcho = (text = "") => String(text || "")
  .replace(/禁止[^。\n]{0,80}/g, "")
  .replace(/不要[^。\n]{0,40}/g, "")
  .replace(/[「“"][^」”"]{0,30}[」”"]/g, "");
const PM_FORBIDDEN = /请继续保持|还没到零|不良率\s*100|月度不足/;
const PM_PURPOSE = "我们的目的是项目发布前把设计问题拦住。";
const ROLE_OWNER = /^(工程师|PM|TPM|产总|产品部负责人|待核实|本人)$/;
const pmActionOwners = (markdown = "") => {
  const section = String(markdown || "").split(/本月措施/).slice(1).join("本月措施");
  return section.split(/\n/).map((line) => line.trim()).filter((line) => /^\|/.test(line) && !/^\|\s*:?-{3,}/.test(line) && !/^\|\s*措施\s*\|/.test(line)).map((line) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    return cells[2] || "";
  });
};
const pmOwnersBroken = (markdown = "") => {
  const owners = pmActionOwners(markdown);
  return !owners.length || owners.some((owner) => ROLE_OWNER.test(owner) || !/^[\u4e00-\u9fa5]{2,4}$/.test(owner));
};
export const pmAiAnalysisBroken = (markdown = "", { hasPrevious = false } = {}) => {
  const text = String(markdown || "");
  if (!/分析结论/.test(text) || !/本月措施/.test(text)) return true;
  if (PM_FORBIDDEN.test(pmDirectiveEcho(text))) return true;
  if (!hasPrevious && /对照上一份|上一份报告/.test(text)) return true;
  if (!text.includes(PM_PURPOSE)) return true;
  if (pmOwnersBroken(text)) return true;
  return actionTableRowCount(text) < 1;
};
const replacePmActions = (markdown = "", locked = "") => {
  const lockedActions = String(locked || "").match(/#{1,6}\s+[^\n]*本月措施[\s\S]*$/i)?.[0]?.trim() || "";
  if (!lockedActions) return markdown;
  if (/#{1,6}\s+[^\n]*本月措施/i.test(markdown)) return String(markdown).replace(/#{1,6}\s+[^\n]*本月措施[\s\S]*$/i, lockedActions);
  return `${String(markdown).trim()}\n\n${lockedActions}`;
};
export const pmDraftCopiesLocked = (draft = "", locked = "") => {
  const norm = (value) => String(value || "").replace(/\s+/g, "");
  const draftText = norm(draft);
  const lockedText = String(locked || "");
  const sentences = lockedText.split(/本月措施/)[0].split(/。/).map(norm).filter((item) => item.length >= 24);
  const hits = sentences.filter((item) => draftText.includes(item)).length;
  if (hits >= 2) return true;
  const leads = (markdown) => (String(markdown).split(/本月措施/)[1] || "").split(/\n/).map((line) => line.trim()).filter((line) => /^\|/.test(line) && !/^\|\s*措施\s*\|/.test(line) && !/^\|\s*:?-{3,}/.test(line)).map((line) => norm(line.split("|")[1] || "")).filter((item) => item.length >= 8);
  const lockedLeads = leads(lockedText);
  const draftLeads = leads(draft);
  return lockedLeads.length >= 2 && lockedLeads.every((item) => draftLeads.includes(item));
};
export const repairPmAiAnalysis = (markdown = "", locked = "", { hasPrevious = false } = {}) => {
  let text = String(markdown || "").trim();
  if (!/分析结论/.test(text)) return "";
  if (pmDraftCopiesLocked(text, locked)) return "";
  text = text.replace(/[^。\n]*?(?:请继续保持|还没到零|不良率\s*100|月度不足)[^。\n]*。?/g, (sentence) => (
    PM_FORBIDDEN.test(pmDirectiveEcho(sentence)) ? "" : sentence
  ));
  if (!hasPrevious) text = text.replace(/[^。\n]*?(?:对照上一份|上一份报告)[^。\n]*。?/g, "");
  const conclusionBody = (text.split(/分析结论/).slice(1).join("分析结论").split(/本月措施/)[0] || "").replace(/[#|\-\s]/g, "");
  if (conclusionBody.length < 24) return "";
  if (!text.includes(PM_PURPOSE)) {
    text = text.replace(/(#{1,6}\s+[^\n]*分析结论[^\n]*\r?\n)/, `$1\n${PM_PURPOSE}\n`);
  }
  if (!/本月措施/.test(text) || actionTableRowCount(text) < 1 || pmOwnersBroken(text)) text = replacePmActions(text, locked);
  const extracted = extractAnalysisMarkdown(text);
  return pmAiAnalysisBroken(extracted, { hasPrevious }) ? "" : extracted;
};
const pmSkillNote = (skill = "") => {
  const text = String(skill || "");
  const voice = (text.split(/##\s*出具口吻/)[1] || "").split(/\n##\s+/)[0].replace(/\s+/g, " ").trim().slice(0, 180);
  const lessons = (text.split(/##\s*验收打回/)[1] || "").split(/\n##\s+/)[0].replace(/\s+/g, " ").trim().slice(0, 360);
  return [voice, lessons].filter(Boolean).join(" ");
};
export const buildPmAiMessages = ({ skill = "", rules = "", recipient = "", period = {}, nextReviewDate = "", lockedAnalysis = "", previousExcerpt = "", acceptanceFailures = [] } = {}) => {
  const note = pmSkillNote(skill);
  const prior = String(previousExcerpt || "").slice(0, 180);
  const failures = Array.isArray(acceptanceFailures) ? acceptanceFailures.slice(0, 3).join("；") : "";
  return [
    { role: "system", content: `你是质量部，给 PM 本人写两段：## 分析结论 和 ## 本月措施。短句。数字不改。禁止照抄锁定原句。必须写：${"我们的目的是项目发布前把设计问题拦住。"} 分析必须写数量方向、尖峰月份、分母变化、分批下单不作为异常、本月反弹落在谁的哪个现象，以及评审有没有拦住。措施表必须包含物料行最多的工程师。验收列必须写下现象原词已关闭并出示改后图纸，禁止只写分类名。完成日不晚于 ${nextReviewDate || "下次报告日"}。${prior ? "" : "没有更早周期，禁止写对照上一份。"} ${note}` },
    { role: "user", content: `${recipient} ${period._periodStart || period.start || ""}—${period._periodEnd || period.end || ""}\n事实：\n${String(lockedAnalysis || "").slice(0, 800)}\n${prior ? `上期措施：\n${prior}\n` : ""}${failures ? `重写：${failures}\n` : ""}只写分析和措施。` },
  ];
};

export const pmAcceptanceGaps = (draft = "", locked = "") => {
  const gaps = [];
  const draftText = String(draft || "");
  const lockedText = String(locked || "");
  const conclusion = draftText.split(/##\s*本月措施/)[0];
  const measures = draftText.split(/##\s*本月措施/).slice(1).join("## 本月措施");
  const direction = lockedText.match(/数量(?:下降|上升|没有下降)/);
  if (direction && !conclusion.includes(direction[0])) gaps.push("分析没有写" + direction[0]);
  if (/尖峰在/.test(lockedText) && !/尖峰/.test(conclusion)) gaps.push("分析没有写尖峰月份");
  if (/分母从/.test(lockedText) && !/分母/.test(conclusion)) gaps.push("分析没有写分母变化");
  if (/加工件比例/.test(lockedText) && !/加工件比例/.test(conclusion)) gaps.push("分析没有写加工件比例");
  if (/非BOM加工件比例/.test(lockedText) && !/非BOM加工件比例/.test(conclusion)) gaps.push("分析没有写非BOM加工件比例");
  if (/不能记成\s*0%/.test(lockedText) && !/不能记成\s*0%/.test(conclusion) && !/1月没有/.test(conclusion)) gaps.push("分析没有写1月没有分母");
  if (/分批下单/.test(lockedText) && /不作为异常/.test(lockedText) && !(/分批下单/.test(draftText) && /不作为异常/.test(draftText))) gaps.push("没有写明分批下单不作为异常");
  const flow = lockedText.match(/物料行最多的是([\u4e00-\u9fa5]{2,4})\s*(\d+)\s*行/) || lockedText.match(/请([\u4e00-\u9fa5]{2,4})拆开本期ECN物料行/);
  if (flow && !conclusion.includes(flow[1])) gaps.push("分析结论没有写" + flow[1]);
  if (flow && !measures.includes(flow[1])) gaps.push("措施表没有" + flow[1]);
  const rows = measures.split(/\n/).map((line) => line.trim()).filter((line) => /^\|/.test(line) && !/^\|\s*措施\s*\|/.test(line) && !/^\|\s*:?-{3,}/.test(line)).map((line) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    return { action: cells[0] || "", problem: cells[1] || "", owner: cells[2] || "", accept: cells[4] || "" };
  });
  const owned = [...lockedText.matchAll(/请([\u4e00-\u9fa5]{2,4})在[^|\n]{0,40}关掉「[^」]+」：([^|\n]{2,24})/g)].map((item) => ({ person: item[1], phenomenon: item[2].trim() }));
  const seen = new Set();
  owned.forEach(({ person, phenomenon }) => {
    if (seen.has(phenomenon)) return;
    seen.add(phenomenon);
    const hit = rows.find((row) => `${row.action}${row.problem}${row.accept}`.includes(phenomenon));
    if (!hit) gaps.push("措施没有要求「" + phenomenon + "」已关闭");
    else if (hit.owner !== person) gaps.push("「" + phenomenon + "」写在" + (hit.owner || "空Owner") + "的验收里，应归" + person);
    else if (!hit.accept.includes(phenomenon)) gaps.push("「" + phenomenon + "」没有写进" + person + "的验收列");
    rows.forEach((row) => {
      if (row.owner !== person && row.accept.includes(phenomenon)) gaps.push("「" + phenomenon + "」不能写进" + row.owner + "的验收");
    });
  });
  return gaps.sort((a, b) => Number(!/措施|验收|应归|不能写进/.test(a)) - Number(!/措施|验收|应归|不能写进/.test(b))).slice(0, 6);
};

export const pmLessonFromGap = (gap = "") => {
  const text = String(gap || "");
  if (/数量(?:下降|上升|没有下降)/.test(text)) return "分析必须写数量下降、数量上升或数量没有下降。";
  if (/尖峰/.test(text)) return "分析必须写尖峰月份。";
  if (/分母/.test(text)) return "分析必须写分母变化，不能只比较百分数。";
  if (/分批下单/.test(text)) return "分批下单必须写明不作为异常。";
  if (/应归|不能写进/.test(text)) return "验收列只能关闭该行 Owner 自己的现象，不能把别人的问题写进这一行。";
  if (/加工件比例|非BOM|1月没有分母/.test(text)) return "分析必须写加工件比例、非BOM加工件比例，以及没有分母的月份不能记成0%。";
  if (/物料行最多|措施表没有|分析结论没有写/.test(text)) return "分析结论和措施表都必须写物料行最多的工程师。";
  if (/已关闭|现象/.test(text)) return "验收列必须写下锁定事实中的现象原词并要求已关闭，不能只写分类名。";
  return "";
};
export const pmLessonsFromGaps = (gaps = []) => [...new Set((Array.isArray(gaps) ? gaps : []).map(pmLessonFromGap).filter(Boolean))];

export const elonAcceptanceExcerpt = (skill = "") => {
  const text = String(skill || "");
  const cut = (start, end) => {
    const from = text.search(start);
    if (from < 0) return "";
    const rest = text.slice(from);
    const to = end ? rest.search(end) : -1;
    return (to > 0 ? rest.slice(0, to) : rest).trim();
  };
  const picked = [cut(/###\s*模型2[:：]/, /\n###\s*模型3/), cut(/##\s*决策启发式/, /\n##\s*表达DNA/)].filter(Boolean).join("\n\n").trim();
  if (picked) return picked.slice(0, 3500);
  return text.replace(/^---[\s\S]*?---\s*/, "").trim().slice(0, 6000);
};
export const buildElonAcceptanceMessages = ({ skill = "", skillName = "", role = "", recipient = "", period = {}, locked = "", draft = "", hasPrevious = false } = {}) => {
  const standard = elonAcceptanceExcerpt(skill);
  const name = String(skillName || String(skill || "").match(/^name:\s*([^\n|]+)/m)?.[1] || "验收技能").trim();
  const director = role === "产总" || role === "产品部负责人";
  const gate = director
    ? "产总报告是下级向上级汇报，只陈述事实，供审阅。第二段必须是重点关注事项。不得出现你辖区、你辖内、你辖、Owner、完成日、验收表、你要求、请产总、由你拍板、请您、我们一起、抓重点、请继续、方便您、我们的目的。这些都没有，且数字和锁定事实一致，必须 pass 为 true。与上面关于措施和 Owner 的标准冲突时，以这句为准。"
    : "不过：Owner 不是具体人名；验收列写了别人的现象；没有更早周期却写对照上一份；措施没有对象；只用分类名代替现象原词；缺数量方向、尖峰、分母、加工件比例或分批下单。";
  return [
    { role: "system", content: `你在这个项目里执行 ${name} 验收。不要扮演，不要另写报告，不要检索。只判断待验收的${director ? "分析结论和重点关注事项" : "分析结论和本月措施"}。数字必须和锁定事实一致。\n标准：\n${standard || "每条措施必须写上执行人的真名。删掉没有对象的空话。没有更早周期不得写对照上一份。"}\n${gate}\n只输出 JSON：{"pass":true} 或 {"pass":false,"failures":["一句话原因"]}` },
    { role: "user", content: `角色：${role}\n人员：${recipient}\n周期：${period._periodStart || period.start || ""}—${period._periodEnd || period.end || ""}\n有更早周期：${hasPrevious ? "有" : "没有"}\n锁定事实：\n${String(locked || "").slice(0, 1200)}\n待验收正文：\n${String(draft || "").slice(0, 1800)}` },
  ];
};

export const parseElonAcceptance = (raw = "") => {
  const text = String(raw || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { pass: false, failures: ["验收没有返回判断"] };
  try {
    const data = JSON.parse(text.slice(start, end + 1));
    const failures = Array.isArray(data.failures) ? data.failures.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5) : [];
    if (data.pass === true) return { pass: true, failures: [] };
    return { pass: false, failures: failures.length ? failures : ["验收未通过"] };
  } catch {
    return { pass: false, failures: ["验收结果无法读取"] };
  }
};

export const stitchRoleReportParts = ({ fixed = "", analysis = "", confirmedKnowledge, timeout = false, role = "" } = {}) => {
  let content = [String(fixed || "").trim(), String(analysis || "").trim()].filter(Boolean).join("\n\n");
  if (timeout) content = `${TIMEOUT_FALLBACK_MARKER}\n${content}`;
  if (Array.isArray(confirmedKnowledge)) content = appendConfirmedKnowledgeToReport(content, confirmedKnowledge, { role });
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
    qualityIssueCount: ["研发工程师", "PM", "TPM", "产总"].includes(role) ? Number(rd.count || evidence.matchedRows || 0) : (Number(ipqc.inspectedRecords || 0) > 0 ? Number(ipqc.badRecords || 0) : Number(snapshot.bad || 0)),
    categories: (["研发工程师", "PM", "TPM", "产总"].includes(role) ? classifiedCategoryTop(evidence.topCategoryStats || rd.categories || [], 8) : (evidence.topCategoryStats || rd.categories || [])).slice(0, 8),
    examples: (evidence.examples || rd.examples || evidence.roleSnapshot?.examples || []).slice(0, 8),
    stages: rd.stages || [],
    ranking: role === "PM" || role === "供应链经理" || role === "产总" ? null : (focus ? { rank: focus.rank, total: focus.total, value: focus.value } : null),
    ecn: ["研发工程师", "PM", "TPM", "产总"].includes(role) ? {
      count: eng.ecnCount ?? eng.ecn ?? 0,
      machined: eng.ecnMachinedCount ?? eng.ecnMachined ?? 0,
      reasons: (eng.ecnReasons || eng.ecnByReason || []).slice(0, 8),
      batchOrder: reasonRows(eng.ecnReasons || eng.ecnByReason).filter((row) => isBatchOrderEcn(row.name)).reduce((sum, row) => sum + (Number(row.count) || 0), 0),
      avoidable: reasonRows(eng.ecnReasons || eng.ecnByReason).filter((row) => isAvoidableEcnReason(row.name)),
      note: rdEcnNonBomNote(eng),
    } : undefined,
    nonBom: ["研发工程师", "PM", "TPM", "产总"].includes(role) ? { count: eng.nonBomCount ?? eng.nonBom ?? 0, machined: eng.nonBomMachinedCount ?? eng.nonBomMachined ?? 0, standard: eng.nonBomStandardCount ?? eng.nonBomStandard ?? 0, machinedRate: eng.nonBomMachinedRate } : undefined,
    monthTrend: (rd.periodTrend?.month?.rows || evidence.periodTrend?.month?.rows || []).map((row) => ({ label: row.label, count: monthCount(row), selected: Boolean(row.selected) })),
    trend: ["PM", "研发工程师", "TPM", "产总", "产品部负责人"].includes(role) ? judgePmIssueTrend(rd.periodTrend?.month?.rows || evidence.periodTrend?.month?.rows || [], period._periodEnd || period.end || evidence.roleSnapshot?.period?.end || "") : judgeRdIssueTrend(selectedMonthRows(rd.periodTrend?.month?.rows || evidence.periodTrend?.month?.rows || [], period), period._periodEnd || period.end || evidence.roleSnapshot?.period?.end || "", "不良"),
    purpose: rolePurposeLine(role, { crossTeam: role === "供应链经理"
      ? (evidence.siteStats || evidence.roleSnapshot?.siteStats || []).filter((item) => Number(item.bad || 0) > 0).length >= 2
      : (Array.isArray(evidence.teamMembers) ? evidence.teamMembers : []).filter((item) => Number(item.bad || 0) > 0).length >= 2 }),
    review: ["研发工程师", "PM", "TPM", "产总"].includes(role) ? { participation: eng.reviewParticipation || 0, suggestions: eng.reviewSuggestions || 0, praise: role === "研发工程师" || role === "PM" ? rdReviewPraise({ participation: eng.reviewParticipation, suggestions: eng.reviewSuggestions }) : "" } : undefined,
    rates: ["PM", "TPM", "产总"].includes(role) ? { ecnRate: eng.ecnRate, machinedEcnRate: eng.machinedEcnRate, nonBomMachinedRate: eng.nonBomMachinedRate, bomDenominator: eng.bomDenominator, machinedDenominator: eng.machinedBomDenominator } : undefined,
    oqc: (role === "TPM" || role === "产总") && evidence.oqcShipment ? { count: Number(evidence.oqcShipment.count || 0), avg: evidence.oqcShipment.avg, fiveRate: evidence.oqcShipment.fiveRate, lowRate: evidence.oqcShipment.lowRate } : undefined,
    productDept: role === "产总" || role === "产品部负责人" ? directorDeptLabel(evidence) : undefined,
    departments: role === "产总" ? (Array.isArray(evidence.deptRows) ? evidence.deptRows : []).slice(0, 6).map((item) => ({ name: item.name, issues: item.issues, shipment: item.count, fiveRate: item.fiveRate, lowRate: item.lowRate })) : undefined,
    tpm: role === "PM" ? (evidence.tpm || "") : undefined,
    teamTop: Array.isArray(evidence.teamMembers) ? evidence.teamMembers.slice(0, 5).map((item) => ({ name: item.name, bad: item.issues ?? item.bad, dept: item.dept || "" })) : [],
    sites: (evidence.siteStats || evidence.roleSnapshot?.siteStats || []).slice(0, 4).map((item) => ({ name: item.name, bad: item.bad, total: item.total, badRate: item.badRate })),
    captainTop: (evidence.captainTop || evidence.roleSnapshot?.captainTop || []).slice(0, 5).map((item) => ({ name: item.name, bad: item.bad, site: item.site, manager: item.manager })),
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
  role,
});
