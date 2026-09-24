export const knowledgePersonKey = (value) => String(value || "").normalize("NFKC").trim()
  .replace(/[（(][^)）]*[）)]/g, "")
  .replace(/[\s\u00a0]/g, "")
  .replace(/(?:等人|等)$/u, "");

export const knowledgeIssueDateKey = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const normalized = [15, 16].includes(value.getUTCHours())
      ? new Date(value.getTime() + 8 * 60 * 60 * 1000 + 60 * 1000)
      : value;
    return normalized.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && value > 20000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  }
  const raw = String(value || "").trim();
  const match = raw.match(/(20\d{2})[年\-/](\d{1,2})[月\-/](\d{1,2})/);
  if (match) return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

export const knowledgeIssueInPeriod = (issue = {}, period = {}) => {
  const key = knowledgeIssueDateKey(issue.issueDate || issue.date || issue.occurredAt || "");
  if (!key) return false;
  const start = String(period._periodStart || period.start || "").trim();
  const end = String(period._periodEnd || period.end || "").trim();
  if (start && key < start) return false;
  if (end && key > end) return false;
  return true;
};

export const groupConfirmedKnowledgeByRecipient = (matches = [], period = {}) => {
  const grouped = new Map();
  (Array.isArray(matches) ? matches : []).forEach((match) => {
    const issue = match?.issue || {};
    const key = knowledgePersonKey(issue.personName);
    if (!key || !knowledgeIssueInPeriod(issue, period)) return;
    grouped.set(key, [...(grouped.get(key) || []), match]);
  });
  return grouped;
};

export const confirmedKnowledgeForRecipient = (matches = [], recipient, period = {}) => {
  const wanted = knowledgePersonKey(recipient);
  if (!wanted) return [];
  return (Array.isArray(matches) ? matches : []).filter((match) => {
    const issue = match?.issue || {};
    return knowledgePersonKey(issue.personName) === wanted && knowledgeIssueInPeriod(issue, period);
  });
};


export const confirmedKnowledgeReportMarkdown = (items = []) => {
  const rows = (Array.isArray(items) ? items : []).filter((item) => item && (item.documentName || item.title || item.clauseNumber || item.correctState || item.issueText));
  if (!rows.length) return "";
  const lines = rows.slice(0, 8).map((item) => {
    const name = item.documentName || "规范";
    const clause = item.clauseNumber ? ` · ${item.clauseNumber}` : "";
    const title = item.title ? `：${item.title}` : "";
    const correct = item.correctState ? `；正确做法：${item.correctState}` : "";
    const issue = item.issueText ? `；对应问题：${item.issueText}` : "";
    return `- **${name}${clause}**${title}${correct}${issue}`;
  });
  return `\n\n## 已确认规范依据\n${lines.join("\n")}`;
};

export const appendConfirmedKnowledgeToReport = (content = "", confirmedKnowledge) => {
  if (!Array.isArray(confirmedKnowledge)) return String(content || "");
  const stripped = String(content || "").replace(/\n*##\s*已确认规范依据[\s\S]*?(?=\n##\s|$)/g, "").trim();
  const appendix = confirmedKnowledgeReportMarkdown(confirmedKnowledge);
  return appendix ? `${stripped}${appendix}` : stripped;
};

export const confirmedKnowledgePromptInstruction = (confirmedKnowledge) => {
  if (!Array.isArray(confirmedKnowledge)) return "规范名称、条款号和正确做法只能引用人员证据中的 confirmedKnowledge；没有则写待核实，不得编造条款。";
  if (!confirmedKnowledge.length) return "没有已确认规范依据。不要输出该章节，不得编造条款。";
  return `已确认规范依据（必须在正文引用，不得改写条款号和正确做法）：${JSON.stringify(confirmedKnowledge)}`;
};
