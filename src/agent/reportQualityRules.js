export const REPORT_QUALITY_RULES_KEY = "quality-agent-report-quality-rules";

export const DEFAULT_REPORT_QUALITY_RULES = [
  { id: "period", label: "统计周期一致", group: "数据一致性", severity: "block", enabled: true },
  { id: "source", label: "数字来自固定快照", group: "数据一致性", severity: "warn", enabled: true },
  { id: "trend", label: "趋势覆盖完整周期", group: "图表要求", severity: "warn", enabled: true },
  { id: "chart", label: "多维对比使用图表", group: "图表要求", severity: "warn", enabled: true },
  { id: "closure", label: "包含改善、验证和关闭条件", group: "质量闭环", severity: "block", enabled: true },
  { id: "machine", label: "清理内部机器标记", group: "内容清理", severity: "block", enabled: true },
];

export const validateReportQuality = (content = "", { rules = DEFAULT_REPORT_QUALITY_RULES, hasSnapshot = false, hasVisuals = false } = {}) => {
  const text = String(content || "");
  const checks = rules.filter((rule) => rule.enabled !== false).map((rule) => {
    let passed = true;
    if (rule.id === "source") passed = hasSnapshot;
    if (rule.id === "chart") passed = hasVisuals || !/(对比|排名|趋势|Pareto|分布)/i.test(text);
    if (rule.id === "trend") passed = !/(趋势|月度|周度)/i.test(text) || /202\d[-年]/.test(text);
    if (rule.id === "closure") passed = /(改善|措施)/.test(text) && /(验证|关闭)/.test(text);
    if (rule.id === "machine") passed = !/REPORT_VISUAL_SPEC_JSON|S-[A-Z]+-\d+|证据等级\s*[：:]?\s*A[^\n]*证据等级/i.test(text);
    return { ...rule, passed };
  });
  const failed = checks.filter((item) => !item.passed);
  return { checks, failed, status: failed.some((item) => item.severity === "block") ? "error" : failed.length ? "warning" : "ok" };
};

export const reportQualityAdvice = (rule = {}) => {
  if (rule.id === "source") return "先生成并启用与当前周期、来源版本和 Skill/Profile 匹配的快照。";
  if (rule.id === "chart") return "补充对应的簇状条形图、趋势图或 Pareto 图，并放入对应章节。";
  if (rule.id === "trend") return "检查报告起始月份/周次到截至日期是否连续覆盖，不能只取最近周期。";
  if (rule.id === "closure") return "补充责任人、改善措施、验证指标和关闭条件。";
  if (rule.id === "machine") return "删除内部证据编号、机器标记和重复的证据等级文本。";
  if (rule.id === "period") return "检查报告正文、快照和选择的统计周期是否完全一致。";
  return "请根据规则说明补充或修正报告内容。";
};
