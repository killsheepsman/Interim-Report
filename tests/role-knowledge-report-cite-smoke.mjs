import assert from "node:assert/strict";
import {
  appendConfirmedKnowledgeToReport,
  confirmedKnowledgePromptInstruction,
  confirmedKnowledgeReportMarkdown,
  parseConfirmedKnowledgeSection,
} from "../src/agent/roleKnowledgeEvidence.js";
import { renderDataSheet } from "../src/agent/porcelainCharts.js";
import { renderBasicsSheet } from "../src/agent/basicsSheet.js";

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

const knowledgeMarkdown = "# 成强报告\n\n## 本月措施\n\n| 措施 | Owner |\n| --- | --- |\n| 核对端子 | 成强 |\n\n## 已确认规范依据\n- **QS-QP07-EN06 气路走线通用规范--V3.0.docx**：气管两端要有标签；对应问题：气管缺少标签\n\n以上条款已对应您本期问题。下一批同类作业前，请按规范当场核对后再送检。\n";
const parsedKnowledge = parseConfirmedKnowledgeSection(knowledgeMarkdown);
assert.equal(parsedKnowledge.items.length, 1);
assert.match(parsedKnowledge.items[0], /气路走线通用规范/);
assert.equal(parseConfirmedKnowledgeSection("## 已确认规范依据\n\n待核实：不得编造条款。\n"), null);
for (const html of [renderDataSheet(knowledgeMarkdown, { module: "角色报告-组装人员" }), renderBasicsSheet(knowledgeMarkdown, { module: "角色报告-组装人员" })]) {
  assert.match(html, /已确认规范依据/);
  assert.match(html, /气路走线通用规范/);
  assert.ok(html.indexOf("本月措施") < html.indexOf("已确认规范依据"));
}

console.log("role knowledge report cite smoke test passed");
