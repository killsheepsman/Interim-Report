import assert from "node:assert/strict";
import {
  appendConfirmedKnowledgeToReport,
  confirmedKnowledgePromptInstruction,
  confirmedKnowledgeReportMarkdown,
} from "../src/agent/roleKnowledgeEvidence.js";

const cards = [
  {
    documentName: "组装作业指导书",
    clauseNumber: "5.1",
    title: "螺丝必须打紧",
    correctState: "按扭矩打紧后点检",
    issueText: "螺丝漏装",
  },
];

const withCards = confirmedKnowledgeReportMarkdown(cards, { role: "组装人员" });
assert.ok(withCards.includes("组装作业指导书"));
assert.ok(withCards.includes("5.1"));
assert.ok(withCards.includes("按扭矩打紧后点检"));
assert.equal(withCards.includes("待核实"), false);
assert.match(withCards, /下一批同类作业前，请按规范当场核对后再送检/);
assert.match(confirmedKnowledgeReportMarkdown(cards, { role: "研发工程师" }), /下一批同类作业前，请按规范当场核对后再送检/);
assert.doesNotMatch(confirmedKnowledgeReportMarkdown(cards, { role: "交付经理" }), /下一批同类作业前，请按规范当场核对后再送检/);
assert.doesNotMatch(confirmedKnowledgeReportMarkdown(cards, { role: "机长" }), /下一批同类作业前，请按规范当场核对后再送检/);

const missing = confirmedKnowledgeReportMarkdown([]);
assert.equal(missing, "");

const promptWith = confirmedKnowledgePromptInstruction(cards);
assert.ok(promptWith.includes("组装作业指导书"));
assert.ok(promptWith.includes("必须在正文引用"));

const promptMissing = confirmedKnowledgePromptInstruction([]);
assert.ok(promptMissing.includes("不要输出"));
assert.ok(promptMissing.includes("不得编造"));

const llmForgot = appendConfirmedKnowledgeToReport("# 个人报告\n\n结论先写在前面。", cards, { role: "组装人员" });
assert.ok(llmForgot.includes("组装作业指导书 · 5.1"));

const llmInvented = appendConfirmedKnowledgeToReport("# 个人报告\n\n## 已确认规范依据\n- 编造规范 · 99.9：不存在的条款\n\n## 改善措施\n- 培训", []);
assert.equal(llmInvented.includes("待核实"), false);
assert.equal(llmInvented.includes("编造规范"), false);
assert.ok(llmInvented.includes("改善措施"));
assert.equal(llmInvented.includes("已确认规范依据"), false);

const skipped = appendConfirmedKnowledgeToReport("原始正文", undefined);
assert.equal(skipped, "原始正文");

console.log("role knowledge report cite smoke test passed");
