import assert from "node:assert/strict";
import { applyQualitySnapshotWindow } from "../src/agent/qualitySnapshot.js";
import { overlaySelectedWindowOnSnapshot } from "../src/agent/roleSnapshotRegistry.js";

const quality = applyQualitySnapshotWindow({
  period: { start2026: "2026-01-01", end2026: "2026-08-31" },
  data: {
    metrics: { inspectedBatches2026: 1000, issueCount2026: 100, batchYield2026: { value: 90, unit: "%" } },
    evidence: { trends: [
      { month: "1月", y2026Qty: 100, y2026Bad: 10 },
      { month: "2月", y2026Qty: 200, y2026Bad: 20 },
      { month: "3月", y2026Qty: 300, y2026Bad: 30 },
    ] },
  },
}, { start: "2026-02-10", end: "2026-03-02" });
assert.equal(quality.windowResolution, "month");
assert.equal(quality.data.metrics.inspectedBatches2026, 500);
assert.equal(quality.data.metrics.issueCount2026, 50);
assert.equal(quality.period.start2026, "2026-02-10");
assert.equal(quality.data.evidence.trends.filter((row) => row.selected).map((row) => row.month).join(","), "2月,3月");

const role = overlaySelectedWindowOnSnapshot({
  period: { start: "2026-01-01", end: "2026-08-31" },
  role: "交付经理",
  metrics: { total: 100, bad: 20 },
  examples: [{ date: "2026-03-16", category: "装配问题", description: "窗内", leader: "甲" }],
  trend: {
    month: { granularity: "month", rows: [{ label: "2026-03", bad: 10, total: 40 }] },
    week: { granularity: "week", rows: [
      { label: "2026-W11", bad: 1, total: 4 },
      { label: "2026-W12", bad: 2, total: 6 },
    ] },
  },
}, { start: "2026-03-15", end: "2026-03-20", _periodStart: "2026-03-15", _periodEnd: "2026-03-20" });
assert.equal(role.windowResolution, "week");
assert.equal(role.metrics.bad, 3);
assert.equal(role.metrics.total, 10);

console.log("window slice smoke: ok");
