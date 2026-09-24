import assert from "node:assert/strict";
import { createDefaultRoleSnapshotRegistry, isSupersededSnapshot, mergeRoleSnapshotRegistry } from "../src/agent/roleSnapshotRegistry.js";

const idOf = (entry) => entry.id || entry.key || "";
const weeks = [
  { start: "2026-01-05", end: "2026-01-11", granularity: "week", periodKey: "2026-01-05_2026-01-11" },
  { start: "2026-01-12", end: "2026-01-18", granularity: "week", periodKey: "2026-01-12_2026-01-18" },
  { start: "2026-01-19", end: "2026-01-25", granularity: "week", periodKey: "2026-01-19_2026-01-25" },
];
const snapshot = (count = 1) => ({ people: [{ recipient: "张三", snapshot: { metrics: { total: count } } }], peopleCount: count });

let registry = createDefaultRoleSnapshotRegistry();
const t0 = Date.parse("2026-09-20T10:00:00Z");
weeks.forEach((period, index) => {
  registry = mergeRoleSnapshotRegistry(registry, {
    role: "组装人员",
    ruleId: "assembler",
    period,
    granularity: period.granularity,
    snapshot: snapshot(1),
    batchId: "role-batch-1",
    skillName: "quality-role-assembler",
    layoutProfileId: "research-briefing-v1",
    generatedAt: new Date(t0 + index * 1000).toISOString(),
  });
});

const batch = registry.history.filter((entry) => entry.role === "组装人员");
assert.equal(batch.length, 3);
assert.ok(batch.every((entry) => entry.active !== false), "同一批三周都必须保持有效");
assert.ok(batch.every((entry) => !isSupersededSnapshot(entry, registry.history, idOf)), "同一批三周都不得显示旧版本");

registry = mergeRoleSnapshotRegistry(registry, {
  role: "组装人员",
  ruleId: "assembler",
  period: weeks[1],
  granularity: weeks[1].granularity,
  snapshot: snapshot(2),
  batchId: "role-batch-2",
  skillName: "quality-role-assembler",
  layoutProfileId: "research-briefing-v1",
  sourceSignature: "updated-source",
  generatedAt: new Date(t0 + 60000).toISOString(),
});

const byWeek = (periodKey) => registry.history.filter((entry) => entry.period?.periodKey === periodKey).sort((left, right) => String(left.generatedAt).localeCompare(String(right.generatedAt)));
const week1 = byWeek(weeks[0].periodKey)[0];
const week3 = byWeek(weeks[2].periodKey)[0];
const week2Versions = byWeek(weeks[1].periodKey);
assert.equal(week2Versions.length, 2, "重做同一周时应保留旧版本记录");
assert.equal(isSupersededSnapshot(week1, registry.history, idOf), false, "未重做的周不得被标成旧版本");
assert.equal(isSupersededSnapshot(week3, registry.history, idOf), false, "未重做的周不得被标成旧版本");
assert.equal(isSupersededSnapshot(week2Versions[1], registry.history, idOf), false, "新生成的同一周应有效");
assert.equal(isSupersededSnapshot(week2Versions[0], registry.history, idOf), true, "被同一周新快照替换的才是旧版本");
assert.ok(week1.active !== false && week3.active !== false, "重做一周不得把其它周停用");

const moduleHistory = [
  { id: "m1", ruleId: "ipqc", dateRange: { start2026: "2026-01-05", end2026: "2026-01-11", granularity: "week", periodKey: "2026-01-05_2026-01-11" }, generatedAt: "2026-09-20T10:00:00.000Z", active: true },
  { id: "m2", ruleId: "ipqc", dateRange: { start2026: "2026-01-12", end2026: "2026-01-18", granularity: "week", periodKey: "2026-01-12_2026-01-18" }, generatedAt: "2026-09-20T10:00:01.000Z", active: true },
  { id: "m3", ruleId: "ipqc", dateRange: { start2026: "2026-01-19", end2026: "2026-01-25", granularity: "week", periodKey: "2026-01-19_2026-01-25" }, generatedAt: "2026-09-20T10:00:02.000Z", active: true },
];
assert.ok(moduleHistory.every((entry) => !isSupersededSnapshot(entry, moduleHistory, (item) => item.id)), "模块周快照即使没有 period 字段，也不能因为生成时间更晚就把前面的周标成旧版本");

console.log("role snapshot batch active smoke test passed");
