import assert from "node:assert/strict";
import { snapshotBatchOutcome } from "../src/agent/snapshotRegistry.js";
import { createDefaultRoleSnapshotRegistry, mergeRoleSnapshotRegistry } from "../src/agent/roleSnapshotRegistry.js";

const weeks = [
  { start: "2026-01-05", end: "2026-01-11", granularity: "week", periodKey: "2026-01-05_2026-01-11" },
  { start: "2026-01-12", end: "2026-01-18", granularity: "week", periodKey: "2026-01-12_2026-01-18" },
  { start: "2026-01-19", end: "2026-01-25", granularity: "week", periodKey: "2026-01-19_2026-01-25" },
];
const snapshot = () => ({ people: [{ recipient: "张三", snapshot: { metrics: { total: 1 } } }], peopleCount: 1 });

let registry = createDefaultRoleSnapshotRegistry();
const failedItems = [];
weeks.forEach((period, index) => {
  try {
    if (index === 1) throw new Error("模拟第2周生成失败");
    registry = mergeRoleSnapshotRegistry(registry, {
      role: "组装人员",
      ruleId: "assembler",
      period,
      granularity: period.granularity,
      snapshot: snapshot(),
      batchId: "role-batch-fail-test",
      skillName: "quality-role-assembler",
      layoutProfileId: "research-briefing-v1",
      generatedAt: new Date(Date.parse("2026-09-20T10:00:00Z") + index * 1000).toISOString(),
    });
  } catch (error) {
    failedItems.push({ role: "组装人员", periodKey: period.periodKey, error: error.message });
  }
});

const outcome = snapshotBatchOutcome({ failedItems, kind: "角色快照" });
assert.equal(outcome.status, "failed");
assert.equal(outcome.failed, 1);
assert.ok(outcome.message.includes("部分失败"));
assert.ok(outcome.message.includes("2026-01-12_2026-01-18"));
assert.ok(outcome.message.includes("其余周期已保存"));

const savedKeys = registry.history.filter((entry) => entry.role === "组装人员").map((entry) => entry.period?.periodKey);
assert.deepEqual(savedKeys.sort(), ["2026-01-05_2026-01-11", "2026-01-19_2026-01-25"]);
assert.equal(savedKeys.includes("2026-01-12_2026-01-18"), false);

const success = snapshotBatchOutcome({ failedItems: [], skippedItems: [], kind: "角色快照" });
assert.equal(success.status, "completed");
assert.equal(success.message, "角色快照已完成");

console.log("role snapshot batch failure smoke test passed");
