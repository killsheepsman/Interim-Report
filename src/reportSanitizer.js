const MACHINE_BLOCKS = /<REPORT_VISUAL_SPEC_JSON>[\s\S]*?(?:<\/REPORT_VISUAL_SPEC_JSON>|$)|<ACTION_LEDGER_JSON>[\s\S]*?(?:<\/ACTION_LEDGER_JSON>|$)/gi;
const MACHINE_HEADINGS = /^\s*#{1,6}\s*(?:\d+[.)、]\s*)?(?:REPORT_VISUAL_SPEC_JSON|ACTION_LEDGER_JSON)\s*$/gmi;
const MACHINE_FENCED_BLOCKS = /^\s*#{1,6}\s*(?:\d+[.)、]\s*)?(?:REPORT_VISUAL_SPEC_JSON|ACTION_LEDGER_JSON)\s*\r?\n\s*\r?\n```(?:json)?\s*\r?\n[\s\S]*?\r?\n```\s*$/gmi;
const EVIDENCE_LINE = /^\s*(?:[-*]|\d+[.)])?\s*证据(?:编号)?\s*[:：][^\n\r]*[SMOCX]-[A-Z0-9]+-\d{3}[^\n\r]*$/gmi;
const INLINE_EVIDENCE = /\s*[（(]?\s*证据(?:编号)?\s*[:：][^)）\n\r]*[SMOCX]-[A-Z0-9]+-\d{3}[^)）\n\r]*[)）]?/g;
const stripTrailingMachineJson = (text = "") => {
  const value = String(text || "").trimEnd();
  const marker = value.lastIndexOf('\n{');
  if (marker < 0) return value;
  const tail = value.slice(marker + 1).trimStart();
  if (/^\{[\s\S]*"reportKind"\s*:/i.test(tail) && /"charts"\s*:/i.test(tail)) return value.slice(0, marker).trimEnd();
  if (/^\{[\s\S]*"actionId"\s*:/i.test(tail) && /"deliverable"\s*:/i.test(tail)) return value.slice(0, marker).trimEnd();
  return value;
};

export const extractReportVisualSpec = (content = "") => {
  const text = String(content || "");
  const tagged = text.match(/<REPORT_VISUAL_SPEC_JSON>([\s\S]*?)<\/REPORT_VISUAL_SPEC_JSON>/i)?.[1]?.trim();
  const tryParse = (value) => {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && (parsed.figures || parsed.riskHighlights || parsed.reportKind) ? parsed : null;
    } catch {
      return null;
    }
  };
  if (tagged) return tryParse(tagged);
  const fenced = text.match(/^\s*#{1,6}\s*(?:\d+[.)、]\s*)?REPORT_VISUAL_SPEC_JSON\s*\r?\n\s*\r?\n```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/gmi)?.at(-1);
  if (fenced) {
    const json = fenced.replace(/^\s*#{1,6}\s*(?:\d+[.)、]\s*)?REPORT_VISUAL_SPEC_JSON\s*\r?\n\s*\r?\n```(?:json)?\s*\r?\n/i, "").replace(/\r?\n```\s*$/, "");
    const parsed = tryParse(json);
    if (parsed) return parsed;
  }
  const tailMatch = text.match(/(?:^|\n)(\{[\s\S]*\n\s*\}\s*)\s*$/);
  if (tailMatch) {
    const parsed = tryParse(tailMatch[1]);
    if (parsed) return parsed;
  }
  const lastBrace = text.lastIndexOf("{");
  if (lastBrace >= 0) {
    const parsed = tryParse(text.slice(lastBrace));
    if (parsed) return parsed;
  }
  return null;
};

export const sanitizeHumanReportContent = (content = "") => stripTrailingMachineJson(String(content || "")
  .replace(/质量总监(?:综合)?判断/g, "质量复盘摘要")
  .replace(/^\s*#{1,6}\s*质量复盘摘要\s*$/gmi, "# 质量复盘摘要")
  .replace(MACHINE_FENCED_BLOCKS, "")
  .replace(MACHINE_HEADINGS, "")
  .replace(MACHINE_BLOCKS, "")
  .replace(EVIDENCE_LINE, "")
  .replace(INLINE_EVIDENCE, "")
  .replace(/[ \t]+$/gm, "")
  .replace(/\n{3,}/g, "\n\n")
  .trim()
  .replace(/\n{2,}$/g, "")
  .replace(/\uFEFF/g, ""));
