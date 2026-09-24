import assert from "node:assert/strict";
import {
  confirmedKnowledgeForRecipient,
  groupConfirmedKnowledgeByRecipient,
  knowledgePersonKey,
} from "../src/agent/roleKnowledgeEvidence.js";

assert.equal(knowledgePersonKey(" 张三（组装） "), "张三");
assert.equal(knowledgePersonKey("陈焜等人"), "陈焜");
assert.equal(knowledgePersonKey("陈 焜"), "陈焜");

const period = { start: "2026-01-01", end: "2026-08-31" };
const matches = [
  {
    id: "in-period-assembly",
    issue: { personName: "张三（组装）", issueDate: "2026/03/12", issueType: "漏装", issueText: "螺丝漏装" },
    evidence: { documentName: "组装作业指导书", clauseNumber: "5.1" },
  },
  {
    id: "out-of-period-assembly",
    issue: { personName: "张三", issueDate: "2025-12-20", issueType: "漏装", issueText: "去年漏装" },
    evidence: { documentName: "组装作业指导书", clauseNumber: "5.1" },
  },
  {
    id: "other-person",
    issue: { personName: "李四", issueDate: "2026-04-01", issueType: "划伤", issueText: "外观划伤" },
    evidence: { documentName: "外观标准", clauseNumber: "3.2" },
  },
  {
    id: "in-period-rd",
    issue: { personName: "陈焜（研发）", issueDate: "2026-06-08", issueType: "设计问题", issueText: "干涉" },
    evidence: { documentName: "设计规范", clauseNumber: "4.2" },
  },
  {
    id: "missing-date",
    issue: { personName: "陈焜", issueDate: "", issueType: "设计问题", issueText: "无日期" },
    evidence: { documentName: "设计规范", clauseNumber: "4.2" },
  },
];

const grouped = groupConfirmedKnowledgeByRecipient(matches, period);
assert.deepEqual((grouped.get("张三") || []).map((item) => item.id), ["in-period-assembly"]);
assert.deepEqual((grouped.get("陈焜") || []).map((item) => item.id), ["in-period-rd"]);
assert.equal((grouped.get("李四") || []).length, 1);

const zhang = confirmedKnowledgeForRecipient(matches, "张三", period);
assert.equal(zhang.length, 1);
assert.equal(zhang[0].id, "in-period-assembly");

const chen = confirmedKnowledgeForRecipient(matches, "陈焜", period);
assert.equal(chen.length, 1);
assert.equal(chen[0].id, "in-period-rd");

const outOfPeriod = confirmedKnowledgeForRecipient(matches, "张三", { start: "2026-01-01", end: "2026-02-28" });
assert.equal(outOfPeriod.length, 0, "周期外的已确认知识卡片不得进入报告");

console.log("role knowledge period smoke test passed");
