const sectionPattern = (titlePattern) => new RegExp(`(^#{2,6}\\s+[^\\n]*(?:${titlePattern})[^\\n]*\\r?\\n)([\\s\\S]*?)(?=^#{2,6}\\s+|(?![\\s\\S]))`, "gmi");

const replaceSectionBody = (content, titlePattern, body) => content.replace(sectionPattern(titlePattern), `$1\n${body.trim()}\n\n`);
const removeSections = (content, titlePattern) => content.replace(sectionPattern(titlePattern), "");
const rewriteSectionBody = (content, titlePattern, transform) => content.replace(sectionPattern(titlePattern), (_, heading, body) => `${heading}\n${transform(body).trim()}\n\n`);
const trendTable = (rows = [], firstLabel = "周期") => [
  `| ${firstLabel} | 研发质量问题数量 |`,
  "|---|---:|",
  ...rows.map((row) => `| ${row.label} | ${Number(row.count || 0)} |`),
].join("\n");

const issueSectionBody = (categories, total) => {
  const table = [
    "| 问题类型 | 数量 | 占比 |",
    "|---|---:|---:|",
    ...categories.map((item) => `| ${item.name} | ${Number(item.count || 0)} | ${total ? (Number(item.count || 0) / total * 100).toFixed(1) : "0.0"}% |`),
  ].join("\n");
  return `问题分类数量已覆盖全部 ${total} 项；分类用于 Pareto 集中度分析，不等同于根因。\n\n${table}`;
};

const ACTION_METRIC_CONTRACT = "样本覆盖率=完成门禁验证样本数÷计划样本数，目标100%；发布前检出率=发布前发现问题数÷（发布前发现问题数+后端再暴露问题数），分母为0时标记不适用，目标100%；单项验证周期=提交验证至形成放行结论的工作日，试行目标≤5个工作日；后端再暴露数目标为0项。";

export const addIsoDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const enforceRdEngineerReportFacts = (content = "", evidence = {}, rankingRows = [], metrics = {}) => {
  const rdIssues = Number(evidence.rdQualityIssues?.count || 0);
  const categories = evidence.rdQualityIssues?.categories || [];
  const monthly = evidence.rdQualityIssues?.periodTrend?.month?.rows || [];
  const weekly = evidence.rdQualityIssues?.periodTrend?.week?.rows || [];
  let next = String(content || "")
    .replace(/^\s*\|\s*综合问题口径\s*\|.*$/gmi, "")
    .replace(/全部暴露于\*{0,2}生产、售后\*{0,2}阶段/g, "问题记录涵盖**生产、售后**阶段")
    .replace(/人员证据中的`directResponsibility`[^。\n]*`mapping`[^。\n]*。?/g, "当前固定组织映射未提供PM、TPM或产总姓名，因此不推断具体管理者。")
    .replace(/^###\s+(?:30|60|90)天待办[^\n]*\r?\n[\s\S]*?(?=^#{2,3}\s+|(?![\s\S]))/gmi, "")
    .replace(/人员证据匹配记录\s*\d+\s*条/g, `研发质量问题记录${rdIssues}条`)
    .replace(/不良\s*\d+\s*条\s*[／/]\s*总数\s*\d+\s*条\s*[／/]\s*不良率\s*\d+(?:\.\d+)?%/g, `研发质量问题 ${rdIssues} 条（无有效分母，不计算不良率）`)
    .replace(/不良率\s*[:：]?\s*\d+(?:\.\d+)?%/g, "不良率：不适用（缺少设计输出总量分母）")
    .replace(/^##\s+[^\n]*ECN[^\n]*非BOM[^\n]*设计评审[^\n]*$/gmi, "## ECN与非BOM工程活动")
    .replace(/^(#{2,6})\s+(\d+[.、]\s*)?质量结果[、，与和]+完整趋势[、，与和]+排名\s*$/gmi, "$1 $2质量结果概览")
    .replace(/^(#{2,6})\s+问题分类\s*Pareto\s*$/gmi, "$1 问题类型分布")
    .replace(/^(#{2,6})\s+ECN变更(?:\s*[/／·、-]\s*申请)?活动\s*$/gmi, "$1 ECN变更活动")
    .replace(/^当前按研发质量问题数量降序排列为\s*\*\*第\s*\d+\/\d+\s*名\*\*[^\n]*$/gmi, "")
    .replace(/发布前检出阈值：[^。\n]*。验证周期：[^。\n]*。后端再暴露阈值：[^。\n]*。/g, ACTION_METRIC_CONTRACT);

  const replaceMetric = (label, value) => {
    if (!Number.isFinite(Number(value))) return;
    next = next.replace(new RegExp(`(\\|\\s*(?:${label})\\s*\\|\\s*)[^|\\n]*(\\s*\\|)`, "gi"), `$1${Number(value)}$2`);
  };
  const replaceMetricText = (label, value) => {
    if (!value) return;
    next = next.replace(new RegExp(`(\\|\\s*(?:${label})\\s*\\|\\s*)[^|\\n]*(\\s*\\|)`, "gi"), `$1${value}$2`);
  };
  replaceMetric("ECN(?:总数|数量)", metrics.ecnCount ?? metrics.ecn);
  replaceMetric("ECN加工件", metrics.ecnMachinedCount ?? metrics.ecnMachined);
  replaceMetric("非BOM(?:申请)?总数", metrics.nonBomCount ?? metrics.nonBom);
  replaceMetric("非BOM加工件", metrics.nonBomMachinedCount ?? metrics.nonBomMachined);
  replaceMetric("非BOM标准件", metrics.nonBomStandardCount ?? metrics.nonBomStandard);
  replaceMetricText("标准件ECN比例", metrics.standardEcnRate != null ? `${(Number(metrics.standardEcnRate) * 100).toFixed(2)}%` : "");
  replaceMetricText("加工件与标准件ECN比例倍数", metrics.machinedToStandardEcnRateRatio != null ? `${Number(metrics.machinedToStandardEcnRateRatio).toFixed(2)}倍` : "");
  if (metrics.standardEcnRate != null && metrics.machinedToStandardEcnRateRatio != null) {
    next = next.replace(/标准件ECN比例及与加工件比例的倍数[^。\n]*(?:待核实|重算)[^。\n]*。?/g, `标准件ECN比例为${(Number(metrics.standardEcnRate) * 100).toFixed(2)}%，加工件ECN比例约为标准件的${Number(metrics.machinedToStandardEcnRateRatio).toFixed(2)}倍。`);
  }

  next = rewriteSectionBody(next, "ECN与非BOM工程活动", (body) => body.split(/\r?\n/)
    .filter((line) => !/^\|\s*(?:设计评审参与|参与评审|有效改善项|评审意见)\s*\|/.test(line.trim()))
    .join("\n"));

  next = removeSections(next, "(?:月度|周度)问题趋势");
  const trendBody = [
    `**研发质量问题：${rdIssues} 项。** 问题趋势只展示数量，不展示不良率。`,
    monthly.length ? `### 月度问题趋势\n\n${trendTable(monthly, "自然月")}` : "",
    weekly.length ? `### 周度问题趋势\n\n${trendTable(weekly, "自然周")}` : "",
  ].filter(Boolean).join("\n\n");
  if (trendBody) {
    const replaced = replaceSectionBody(next, "质量结果与完整趋势", trendBody);
    next = replaced === next
      ? next.replace(/^##\s+[^\n]*(?:问题分类|失效机制)[^\n]*$/mi, `## 质量结果与完整趋势\n\n${trendBody}\n\n$&`)
      : replaced;
  }

  const categoryTotal = categories.reduce((sum, item) => sum + Number(item.count || 0), 0);
  if (categories.length && categoryTotal === rdIssues) next = rewriteSectionBody(next, "问题类型分布", () => issueSectionBody(categories, rdIssues));

  const focus = rankingRows.find((row) => row.selected);
  if (focus?.rank && focus?.total) {
    const body = `当前按研发质量问题数量降序排列为 **第 ${focus.rank}/${focus.total} 名**，本人共 ${Number(focus.value || 0)} 项；排名表示同口径风险位置，不等同于能力评价。`;
    const replaced = replaceSectionBody(next, "(?:研发质量问题|个人问题|个人风险|质量风险)排名", body);
    next = replaced === next ? `${next.trim()}\n\n## 研发质量问题排名\n\n${body}\n` : replaced;
  }
  if (!/发布前检出率\s*=.*单项验证周期\s*=.*后端再暴露/s.test(next)) next = rewriteSectionBody(next, "工程门禁[^\n]*(?:30|60|90)", (body) => `**验证指标统一口径：**${ACTION_METRIC_CONTRACT}\n\n${body}`);
  return next.replace(/\n{3,}/g, "\n\n").trim();
};
