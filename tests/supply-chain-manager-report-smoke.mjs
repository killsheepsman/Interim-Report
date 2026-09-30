import assert from "node:assert/strict";
import { buildDeterministicAnalysisMarkdown, buildFixedDataRoleReport, stitchRoleReportParts } from "../src/agent/roleFixedEvidenceReport.js";
import { siteStatsFromRows, captainTopFromRows, supplyChainTeamFromRows } from "../src/agent/roleSnapshotRegistry.js";

const rows = [
  { __ipqcSite: "深圳", 不良类型: "接线问题", 不良内容: "端子脱落", 交付经理: "韩瑞丽", 机长: "霍艺博" },
  { __ipqcSite: "深圳", 不良类型: "接线问题", 不良内容: "标签缺失", 交付经理: "韩瑞丽", 机长: "霍艺博" },
  { __ipqcSite: "杭州", 不良类型: "装配问题", 不良内容: "护盖装反", 交付经理: "周久来", 机长: "张三" },
];
const sites = siteStatsFromRows(rows);
assert.equal(sites.find((item) => item.name === "深圳").bad, 2);
assert.equal(sites.find((item) => item.name === "杭州").bad, 1);
const captains = captainTopFromRows(rows, [{ leader: "霍艺博", manager: "韩瑞丽", site: "深圳" }, { leader: "张三", manager: "周久来", site: "杭州" }]);
assert.ok(captains.some((item) => item.name === "霍艺博" && item.manager === "韩瑞丽"));

const period = { start: "2026-07-01", end: "2026-08-31", _periodStart: "2026-07-01", _periodEnd: "2026-08-31" };
const evidence = {
  ipqcMetrics: { inspectedRecords: 6547, badRecords: 346, goodRecords: 6201, badRate: 5.28 },
  topCategoryStats: [{ name: "装配问题", count: 220 }, { name: "接线问题", count: 217 }, { name: "螺丝问题", count: 90 }],
  examples: [{ date: "2026-08-31", category: "装配问题", description: "急停保护盖装反" }],
  teamMembers: [{ name: "韩瑞丽", total: 254, bad: 12, good: 242, badRate: 4.72 }, { name: "周久来", total: 400, bad: 30, good: 370, badRate: 7.5 }],
  siteStats: [
    { name: "深圳", total: 4000, bad: 200, good: 3800, badRate: 5 },
    { name: "杭州", total: 2547, bad: 146, good: 2401, badRate: 5.73 },
  ],
  captainTop: [{ name: "霍艺博", bad: 10, total: 146, badRate: 6.85, site: "深圳", manager: "韩瑞丽" }],
  periodTrend: {
    month: { granularity: "month", rows: [
      { label: "2026-07", bad: 160, total: 2658, rate: 6.02, selected: true },
      { label: "2026-08", bad: 186, total: 3889, rate: 4.78, selected: true },
    ] },
    week: { granularity: "week", rows: [{ label: "2026-W34", bad: 71, total: 200, selected: true }] },
  },
};
const analysis = buildDeterministicAnalysisMarkdown({
  role: "供应链经理",
  recipient: "供应链经理",
  period,
  nextReviewDate: "2026-10-26",
  evidence,
});
const fixed = buildFixedDataRoleReport({ role: "供应链经理", recipient: "供应链经理", period, evidence, rankingRows: [] });
const full = stitchRoleReportParts({ fixed, analysis, role: "供应链经理" });
assert.match(full, /## 厂区对比/);
assert.match(full, /\| 深圳 \|/);
assert.match(full, /\| 杭州 \|/);
assert.match(full, /下属交付经理/);
assert.match(full, /韩瑞丽/);
assert.match(full, /周久来/);
assert.match(full, /机长 Top/);
assert.match(full, /霍艺博/);
assert.match(full, /不参与个人排名/);
assert.match(full, /跨厂、跨交付线/);
assert.match(full, /组织交付经理关闭/);
assert.match(full, /请韩瑞丽把「装配问题」压下去|统一标准后再交付/);
assert.doesNotMatch(full, /当场核对/);
assert.doesNotMatch(full, /第 \d+\/\d+ 名/);
assert.doesNotMatch(analysis, /同口径第/);

assert.deepEqual(siteStatsFromRows([]), []);
const mappedOnly = [
  { 机长: "霍艺博", 不良类型: "接线问题", 不良内容: "脱落" },
  { 机长: "张三", 不良类型: "装配问题", 不良内容: "装反" },
];
const mappedTeam = supplyChainTeamFromRows(mappedOnly, [{ leader: "霍艺博", manager: "韩瑞丽", site: "深圳" }, { leader: "张三", manager: "周久来", site: "杭州" }]);
assert.ok(mappedTeam.some((item) => item.name === "韩瑞丽" && item.bad === 1));
assert.ok(mappedTeam.some((item) => item.name === "周久来" && item.bad === 1));
const emptySitesReport = buildFixedDataRoleReport({
  role: "供应链经理",
  recipient: "供应链经理",
  period,
  evidence: { ipqcMetrics: { inspectedRecords: 10, badRecords: 1, goodRecords: 9, badRate: 10 }, siteStats: [{ name: "深圳", total: 0, bad: 0, good: 0, badRate: 0 }, { name: "杭州", total: 0, bad: 0, good: 0, badRate: 0 }] },
  rankingRows: [],
});
assert.doesNotMatch(emptySitesReport, /## 厂区对比/);

console.log("supply chain manager report smoke passed");