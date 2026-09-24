import assert from "node:assert/strict";
import { applySelectedWindowToTrend, buildRoleSnapshots, overlaySelectedWindowOnSnapshot, periodTrendFromRows, pickRoleSnapshotEntry, rankPeopleInSelectedWindow, snapshotMatchesPeriod, trendBucketSelected } from "../src/agent/roleSnapshotRegistry.js";
import { renderLieflatPairedTrend } from "../src/agent/lieflatRoleCharts.js";
import { buildDeterministicAnalysisMarkdown, judgeRdIssueTrend } from "../src/agent/roleFixedEvidenceReport.js";

const period = { start: "2026-07-01", end: "2026-08-31", _periodStart: "2026-07-01", _periodEnd: "2026-08-31" };
const files = [{
  module: "IPQC",
  rows: [
    { 日期: "2026-02-26", 交付经理: "韩瑞丽", 机长: "霍艺博", 不良类型: "装配问题", 不良内容: "真空管打折" },
    { 日期: "2026-03-24", 交付经理: "韩瑞丽", 机长: "胡巧萍", 不良类型: "旧机问题", 不良内容: "载板磕伤" },
    { 日期: "2026-07-08", 交付经理: "韩瑞丽", 机长: "霍艺博", 不良类型: "接线问题", 不良内容: "线束干涉" },
    { 日期: "2026-07-08", 交付经理: "韩瑞丽", 机长: "霍艺博", 不良类型: "", 不良内容: "" },
    { 日期: "2026-08-12", 交付经理: "韩瑞丽", 机长: "胡巧萍", 不良类型: "螺丝问题", 不良内容: "螺丝未锁" },
    { 日期: "2026-08-12", 交付经理: "韩瑞丽", 机长: "胡巧萍", 不良类型: "", 不良内容: "" },
    { 日期: "2026-08-15", 交付经理: "韩瑞丽", 机长: "洪妙文", 不良类型: "", 不良内容: "" },
    { 日期: "2026-08-20", 交付经理: "周久来", 机长: "洪妙文", 不良类型: "装配问题", 不良内容: "漏装" },
  ],
}, {
  module: "IPQC",
  kind: "IPQC_LEADER_MAP",
  name: "工坊交付经理机长映射表.xlsx",
  rows: [
    { 厂区: "深圳", 工坊: "深圳二工坊", 交付经理: "韩瑞丽", 机长: "霍艺博" },
    { 厂区: "深圳", 工坊: "深圳二工坊", 交付经理: "韩瑞丽", 机长: "胡巧萍" },
    { 厂区: "杭州", 工坊: "杭州二工坊", 交付经理: "周久来", 机长: "洪妙文" },
  ],
}];

const payload = buildRoleSnapshots({ role: "交付经理", files, dateRange: period, mappings: {} });
const person = payload.people.find((item) => item.recipient === "韩瑞丽")?.snapshot;
assert.ok(person, "韩瑞丽 snapshot exists");
assert.equal(person.metrics.total, 5, "selected window inspected records");
assert.equal(person.metrics.bad, 2, "selected window bad records");
assert.deepEqual(person.examples.map((item) => item.date).sort(), ["2026-07-08", "2026-08-12"]);
assert.deepEqual(person.teamMembers.map((item) => item.name).sort(), ["胡巧萍", "霍艺博"].sort());
assert.equal(person.teamMembers.some((item) => item.name === "洪妙文"), false);

const month = person.trend.month.rows;
assert.equal(month[0].label, "2026-01");
assert.ok(month.some((row) => row.label === "2026-02" && row.bad > 0), "year trend still counts February");
assert.equal(month.find((row) => row.label === "2026-02").selected, false);
assert.equal(month.find((row) => row.label === "2026-07").selected, true);
assert.equal(month.find((row) => row.label === "2026-08").selected, true);

const covering = overlaySelectedWindowOnSnapshot({
  period: { start: "2026-01-01", end: "2026-08-31" },
  role: "交付经理",
  metrics: { total: 100, bad: 20 },
  examples: [
    { date: "2026-02-26", category: "装配问题", description: "年初问题", leader: "霍艺博" },
    { date: "2026-07-08", category: "接线问题", description: "本期问题", leader: "霍艺博" },
    { date: "2026-08-12", category: "螺丝问题", description: "螺丝未锁", leader: "胡巧萍" },
  ],
  trend: { month: { granularity: "month", rows: month } },
}, period);
assert.equal(covering.coveringWindow, true);
assert.equal(covering.metrics.total, 5);
assert.equal(covering.metrics.bad, 2);
assert.deepEqual(covering.examples.map((item) => item.date).sort(), ["2026-07-08", "2026-08-12"]);
assert.ok(covering.categories.some((item) => item.name === "接线问题"), "covering window must keep selected-window categories");
assert.ok(covering.teamMembers.some((item) => item.name === "霍艺博"), "covering window must keep captains from selected examples");
assert.ok(covering.teamMembers.some((item) => item.name === "胡巧萍"));
assert.equal(snapshotMatchesPeriod({ period: { start: "2026-07-01", end: "2026-08-31" } }, period), true);

const registry = {
  history: [
    { role: "交付经理", active: true, period: { start: "2026-01-01", end: "2026-08-31", granularity: "range" }, generatedAt: "2026-09-23T10:00:00.000Z", recipients: ["韩瑞丽"], snapshot: { people: [{ recipient: "韩瑞丽" }] } },
    { role: "交付经理", active: true, period: { start: "2026-07-01", end: "2026-08-31", granularity: "range" }, generatedAt: "2026-09-23T09:00:00.000Z", recipients: ["韩瑞丽"], snapshot: { people: [{ recipient: "韩瑞丽" }] } },
  ],
};
assert.equal(pickRoleSnapshotEntry(registry, { role: "交付经理", recipient: "韩瑞丽", period })?.period?.start, "2026-07-01");

assert.equal(trendBucketSelected("2026-07", "month", period), true);
assert.equal(trendBucketSelected("2026-06", "month", period), false);
assert.equal(trendBucketSelected("2026-W27", "week", period), true);

const html = renderLieflatPairedTrend({
  title: "月度趋势",
  grain: "month",
  rows: [
    { label: "2026-06", bad: 5, total: 40, rate: 12.5, selected: false },
    { label: "2026-07", bad: 6, total: 20, rate: 30, selected: true },
    { label: "2026-08", bad: 6, total: 18, rate: 33.3, selected: true },
  ],
});
assert.doesNotMatch(html, /#002FA7/, "趋势图不再用克莱因蓝标选中月份");
assert.match(html, />7月</);
assert.match(html, /2026年/);
assert.match(html, /#58402E|#ACAD79|rgba\(88,64,46/);
const julyChunk = html.slice(html.indexOf(">7月<") - 500, html.indexOf(">7月<") + 40);
assert.doesNotMatch(julyChunk, /#002FA7/);
assert.doesNotMatch(html, /rotate\(-32/);
assert.doesNotMatch(html, />2026-07</);

const judged = judgeRdIssueTrend([
  { label: "2026-07", count: 6 },
  { label: "2026-08", count: 6 },
], "2026-08-31", "不良");
assert.match(judged.phrase, /7月不良 6/);
assert.match(judged.phrase, /不良没有下降/);
assert.doesNotMatch(judged.phrase, /数量没下来/);
assert.doesNotMatch(judged.phrase, /254/);
const judgedRate = judgeRdIssueTrend([
  { label: "2026-07", count: 6, bad: 6, total: 120, rate: 5 },
  { label: "2026-08", count: 6, bad: 6, total: 134, rate: 4.48 },
], "2026-08-31", "不良");
assert.match(judgedRate.phrase, /不良率 5/);
assert.match(judgedRate.phrase, /不良率 4.48/);
assert.match(judgedRate.phrase, /数量没有下降，不良率略降/);
const analysis = buildDeterministicAnalysisMarkdown({
  role: "交付经理",
  recipient: "韩瑞丽",
  period,
  nextReviewDate: "2026-10-24",
  rankingRows: [{ name: "韩瑞丽", rank: 8, total: 9, value: 12, selected: true }],
  evidence: {
    ipqcMetrics: { inspectedRecords: 254, badRecords: 12, goodRecords: 242, badRate: 4.72 },
    topCategoryStats: [{ name: "接线问题", count: 1 }, { name: "螺丝问题", count: 1 }],
    examples: covering.examples,
    teamMembers: covering.teamMembers,
    periodTrend: { month: covering.trend.month, week: { granularity: "week", rows: [{ label: "2026-W27", bad: 3, total: 7, rate: 42.86, selected: true }] } },
  },
});
assert.match(analysis, /7月不良/);
assert.match(analysis, /第8\/9名/);
assert.match(analysis, /跨班组/);
assert.match(analysis, /W27/);
assert.doesNotMatch(analysis, /本期无待办/);
assert.doesNotMatch(analysis, /按本期不良逐条关闭/);
assert.doesNotMatch(analysis, /这把火在你身上/);
assert.doesNotMatch(analysis, /排名低/);
assert.match(analysis, /组织机长在交付前关闭/);
const singleTeam = buildDeterministicAnalysisMarkdown({
  role: "交付经理",
  recipient: "韩瑞丽",
  period,
  rankingRows: [{ name: "韩瑞丽", rank: 8, total: 9, value: 12, selected: true }],
  evidence: {
    ipqcMetrics: { inspectedRecords: 254, badRecords: 12 },
    topCategoryStats: [{ name: "接线问题", count: 12 }],
    examples: [{ date: "2026-07-08", category: "接线问题", description: "线束干涉", leader: "霍艺博" }],
    teamMembers: [{ name: "霍艺博", bad: 12, total: 12 }],
    periodTrend: { month: covering.trend.month },
  },
});
assert.doesNotMatch(singleTeam, /跨班组/);
assert.match(singleTeam, /工坊交付前把重复问题拦住/);

const yearFlagged = {
  granularity: "month",
  rows: [
    { label: "2026-01", bad: 0, total: 27, selected: true },
    { label: "2026-06", bad: 5, total: 75, selected: true },
    { label: "2026-07", bad: 6, total: 120, selected: true },
    { label: "2026-08", bad: 6, total: 134, selected: true },
  ],
};
const recomputed = applySelectedWindowToTrend(yearFlagged, period);
assert.equal(recomputed.rows.find((row) => row.label === "2026-06").selected, false);
assert.equal(recomputed.rows.find((row) => row.label === "2026-07").selected, true);
const ranking = rankPeopleInSelectedWindow([
  { recipient: "韩瑞丽", snapshot: { trend: { month: yearFlagged }, metrics: { bad: 47, total: 1035 } } },
  { recipient: "周久来", snapshot: { trend: { month: { granularity: "month", rows: [{ label: "2026-07", bad: 20, total: 80, selected: true }, { label: "2026-08", bad: 10, total: 40, selected: true }] } }, metrics: { bad: 80, total: 400 } } },
], period, "韩瑞丽");
assert.ok(ranking.length >= 2);
assert.equal(ranking.find((row) => row.name === "韩瑞丽").value, 12);
assert.equal(ranking.find((row) => row.name === "周久来").value, 30);
assert.equal(ranking.find((row) => row.name === "周久来").rank, 1);
assert.equal(ranking.find((row) => row.name === "韩瑞丽").rank, 2);

const fromRows = periodTrendFromRows(files[0].rows.filter((row) => row.交付经理 === "韩瑞丽"), period, "month");
assert.equal(fromRows.rows.find((row) => row.label === "2026-02").bad, 1);
assert.equal(fromRows.rows.find((row) => row.label === "2026-07").selected, true);
assert.equal(trendBucketSelected("2026-01", "month", period), false);
assert.equal(trendBucketSelected("2026-06", "month", period), false);
assert.equal(trendBucketSelected("2026-07", "month", period), true);
assert.equal(trendBucketSelected("2026-08", "month", period), true);

console.log("role selected window smoke test passed");
