import assert from "node:assert/strict";
import { keepActiveWeekChartRows } from "../src/agent/roleSnapshotRegistry.js";
import { buildFixedDataRoleReport } from "../src/agent/roleFixedEvidenceReport.js";

const kept = keepActiveWeekChartRows([
  { label: "2026-W01", bad: 0, total: 0, rate: 0 },
  { label: "2026-W02", bad: 0, total: 8, rate: 0 },
  { label: "2026-W03", bad: 2, total: 10, rate: 20 },
  { label: "2026-W04", count: 0 },
  { label: "2026-W05", count: 3 },
]);
assert.deepEqual(kept.map((row) => row.label), ["2026-W02", "2026-W03", "2026-W05"]);

const report = buildFixedDataRoleReport({
  role: "组装人员",
  recipient: "朱从军",
  period: { start: "2026-01-01", end: "2026-08-31" },
  evidence: {
    ipqcMetrics: { inspectedRecords: 18, badRecords: 2, goodRecords: 16, badRate: 11.11 },
    periodTrend: {
      week: {
        granularity: "week",
        rows: [
          { label: "2026-W01", bad: 0, total: 0, rate: 0 },
          { label: "2026-W02", bad: 0, total: 8, rate: 0 },
          { label: "2026-W03", bad: 2, total: 10, rate: 20 },
        ],
      },
    },
  },
});
assert.equal(report.includes("2026-W01"), false, "empty week must leave the table");
assert.equal(report.includes("2026-W02"), true, "zero-defect week with inspections must stay");
assert.equal(report.includes("2026-W03"), true);

console.log("role week chart filter smoke test passed");
