import assert from "node:assert/strict";
import { issueCategoriesFromRoleSnapshot, periodTrendFromRoleSnapshot } from "../src/agent/roleSnapshotRegistry.js";

const snapshot = {
  metrics: { total: 449, bad: 48, good: 401, badRate: 10.69 },
  categories: [
    { name: "未分类", count: 403 },
    { name: "装配问题", count: 30 },
    { name: "3D问题", count: 7 },
    { name: "设计问题", count: 5 },
    { name: "螺丝问题", count: 5 },
    { name: "来料问题", count: 1 },
  ],
  trend: [
    { period: "2026-01", total: 75, bad: 4, rate: 5.33 },
    { period: "2026-08", total: 157, bad: 20, rate: 12.74 },
  ],
};

const categories = issueCategoriesFromRoleSnapshot(snapshot);
assert.equal(categories.some((item) => item.name === "未分类"), false, "合格记录形成的未分类不得进入不良 Pareto");
assert.equal(categories[0].name, "装配问题");
assert.equal(categories.reduce((sum, item) => sum + item.count, 0), 48);

const trend = periodTrendFromRoleSnapshot(snapshot);
assert.equal(trend.month.rows[0].label, "2026-01");
assert.equal(trend.month.rows[0].bad, 4);
assert.equal(trend.month.rows[0].total, 75);
assert.equal(trend.week, null);

const nested = periodTrendFromRoleSnapshot({
  trend: {
    month: { granularity: "month", rows: [{ label: "2026-01", bad: 4, total: 75, rate: 5.33 }] },
    week: { granularity: "week", rows: [{ label: "2026-W01", bad: 1, total: 10, rate: 10 }] },
  },
});
assert.equal(nested.week.rows[0].label, "2026-W01");

console.log("role snapshot chart evidence smoke test passed");
