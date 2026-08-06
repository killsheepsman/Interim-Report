// Deterministic report-layout execution helpers.
// The layout skills describe the contract; this module applies the contract
// after the model has returned Markdown so visual output does not depend on
// whether the upstream model followed every formatting instruction.

export const sectionTone = (value = "") => {
  const text = String(value || "").toLowerCase();
  if (/(风险|预警|高风险|严重|risk|warning)/i.test(text)) return "risk";
  if (/(待核实|证据缺口|发布限制|验证计划|待确认|pending|verify)/i.test(text)) return "pending";
  if (/(改善措施|改善行动|行动台账|待办|关闭条件|30\s*[\/／、-]?\s*60|action|owner)/i.test(text)) return "action";
  if (/(根因|原因|证据|数据审计|口径|二八|evidence|audit|root)/i.test(text)) return "evidence";
  if (/(排名|top|趋势|分布|pareto|同期|对比|ranking|trend)/i.test(text)) return "ranking";
  if (/(结果|结论|摘要|概览|指标|kpi|result|summary|overview)/i.test(text)) return "result";
  if (/(过程|责任|过程暴露|责任链|process|responsib)/i.test(text)) return "process";
  return "neutral";
};

export const headingClass = (title = "") => `agent-report-section-heading tone-${sectionTone(title)}`;
export const sectionClass = (title = "") => `agent-report-section tone-${sectionTone(title)}`;

export const metricLine = (line = "") => {
  const source = String(line || "").trim().replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "");
  const matched = source.match(/^(?:\*\*)?([^:：]{1,28})(?:\*\*)?\s*[:：]\s*(.+)$/);
  if (!matched) return null;
  const label = matched[1].replace(/[*`]/g, "").trim();
  const value = matched[2].replace(/[*`]/g, "").trim();
  if (!label || !value || value.length > 90) return null;
  // Only promote short factual fields to KPI cards. Long conclusions stay as
  // paragraphs so the renderer never changes the model's meaning.
  if (!/(数量|总数|记录|良率|不良率|密度|占比|等级|可信度|周期|更新时间|范围|批次|风险|指标|数量|rate|count|score|period)/i.test(label)) return null;
  return { label, value };
};

export const isLayoutMarker = (line = "") => /^<!--\s*qms-layout:/i.test(String(line || "").trim());

export const tableToneClass = (sectionTitle = "") => `agent-report-table-wrap tone-${sectionTone(sectionTitle)}`;
export const calloutToneClass = (value = "") => `agent-report-callout tone-${sectionTone(value)}`;

