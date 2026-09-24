import assert from "node:assert/strict";
import { filterTeamMembersByMapping, pickNonEmptyTrend, trendHasCounts } from "../src/agent/roleSnapshotRegistry.js";

const members = [
  { name: "霍艺博", bad: 25, total: 356 },
  { name: "胡巧萍", bad: 22, total: 677 },
  { name: "洪妙文", bad: 0, total: 1 },
  { name: "刘能文", bad: 0, total: 1 },
];
const mappings = [
  { manager: "韩瑞丽", leader: "霍艺博", active: true },
  { manager: "韩瑞丽", leader: "胡巧萍", active: true },
  { manager: "别人", leader: "洪妙文", active: true },
];
const filtered = filterTeamMembersByMapping("交付经理", "韩瑞丽", members, mappings);
assert.deepEqual(filtered.map((item) => item.name), ["霍艺博", "胡巧萍"]);

const emptyLive = { granularity: "month", rows: [{ label: "2026-01", bad: 0, total: 0 }, { label: "2026-02", bad: 0, total: 0 }] };
const snapshot = { granularity: "month", rows: [{ label: "2026-02", bad: 12, total: 80 }, { label: "2026-03", bad: 20, total: 90 }] };
assert.equal(trendHasCounts(emptyLive), false);
assert.equal(pickNonEmptyTrend(emptyLive, snapshot), snapshot);
assert.equal(pickNonEmptyTrend(snapshot, emptyLive), snapshot);
console.log("delivery manager scope/trend smoke test passed");
