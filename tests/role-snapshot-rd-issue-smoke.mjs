import assert from "node:assert/strict";
import { buildRoleSnapshots } from "../src/agent/roleSnapshotRegistry.js";

const issueRows = Array.from({ length: 29 }, (_, index) => ({
  "发生日期": index === 0 ? new Date("2026-03-16T15:59:17.000Z") : index < 27 ? "2026/3/17" : "2026/6/29",
  "问题描述": `研发问题 ${index + 1}`,
  "产品部": "产品五部",
  "类别": index < 20 ? "设计问题" : "BOM问题",
  "责任人": "陈焜",
  "阶段": "生产",
}));
const files = [{ module: "DQA", name: "研发问题汇总.xlsx", rows: [
  ...issueRows,
  { "发生日期": "2026/4/20", "问题描述": "描述中提及陈焜但责任人是其他人", "责任人": "吴天鹏", "类别": "BOM问题" },
  { __roleActivity: true, "日期": "2026/5/1", "研发工程师": "陈焜", "问题类型": "ECN", "问题来源": "ECN" },
]}];

const result = buildRoleSnapshots({ role: "研发工程师", files, dateRange: { start: "2026-01-01", end: "2026-06-30" } });
const chen = result.people.find((item) => item.recipient === "陈焜")?.snapshot;

assert.ok(chen, "责任人列中的研发工程师必须进入角色快照");
assert.equal(chen.rdQualityIssues.count, 29, "研发问题只按责任人和问题描述计数");
assert.equal(chen.rdQualityIssues.categories.reduce((sum, item) => sum + item.count, 0), 29);
assert.equal(chen.rdQualityIssues.examples[0].date, "2026-03-17", "Excel中国午夜日期不能偏移到前一天");
assert.equal(chen.metrics.bad, 29, "ECN等角色活动不能计入质量问题");
assert.equal(chen.metrics.total, 29, "研发质量总数只能使用研发问题，不能混入工程活动");
assert.equal(chen.metrics.badRate, null, "没有设计输出总量分母时不得生成研发不良率");
assert.equal(chen.metrics.rateAvailable, false);
assert.equal(chen.metricContract, "rd-quality-only-v1");
assert.equal(chen.trend.month.rows.reduce((sum, row) => sum + row.count, 0), 29);
assert.ok(chen.trend.month.rows.every((row) => !("rate" in row)), "研发趋势不得生成伪不良率");
assert.deepEqual(chen.rdQualityIssues.periodTrend.month.rows.map((row) => [row.label, row.count]), [
  ["2026-01", 0], ["2026-02", 0], ["2026-03", 27], ["2026-04", 0], ["2026-05", 0], ["2026-06", 2],
], "月度趋势必须连续且只统计研发问题");

console.log("role snapshot R&D issue smoke test passed");
