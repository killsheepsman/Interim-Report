import assert from "node:assert/strict";
import { pickRoleSnapshot, pickRoleSnapshotEntry } from "../src/agent/roleSnapshotRegistry.js";

const person = (name, extra = {}) => ({ recipient: name, snapshot: { metrics: { total: 1 }, ...extra } });
const janToAug = { start: "2026-01-01", end: "2026-08-31" };
const lastWeek = { start: "2026-08-25", end: "2026-08-31" };

const registry = {
  history: [
    {
      role: "组装人员",
      active: true,
      period: { start: "2026-08-25", end: "2026-08-31", granularity: "week", periodKey: "2026-08-25_2026-08-31" },
      generatedAt: "2026-09-20T12:00:00.000Z",
      peopleCount: 1,
      recipients: ["张三"],
      snapshot: { people: [person("张三", { kind: "week" })] },
    },
    {
      role: "组装人员",
      active: true,
      period: { start: "2026-08-01", end: "2026-08-31", granularity: "month", periodKey: "2026-08" },
      generatedAt: "2026-09-20T11:00:00.000Z",
      peopleCount: 1,
      recipients: ["张三"],
      snapshot: { people: [person("张三", { kind: "month" })] },
    },
    {
      role: "组装人员",
      active: true,
      period: { start: "2026-01-01", end: "2026-12-31", granularity: "range", periodKey: "range" },
      generatedAt: "2026-09-20T10:00:00.000Z",
      peopleCount: 8,
      recipients: [],
      snapshot: { people: [person("张三", { kind: "range" })] },
    },
  ],
};

const covering = pickRoleSnapshotEntry(registry, { role: "组装人员", recipient: "张三", period: janToAug });
assert.equal(covering?.period?.granularity, "range", "1-8月报告必须命中1-12月总周期");
assert.equal(covering?.period?.end, "2026-12-31");
assert.equal(pickRoleSnapshot(registry, { role: "组装人员", recipient: "张三", period: janToAug })?.kind, "range");

const evenLastWeek = pickRoleSnapshotEntry(registry, { role: "组装人员", recipient: "张三", period: lastWeek });
assert.equal(evenLastWeek?.period?.granularity, "week", "所选周期有精确快照时，优先用精确快照，不用全年覆盖快照");

const indexOnly = {
  history: [
    {
      role: "组装人员",
      active: true,
      period: { start: "2026-01-01", end: "2026-12-31", granularity: "range", periodKey: "range" },
      generatedAt: "2026-09-20T10:00:00.000Z",
      peopleCount: 8,
      recipients: [],
    },
    {
      role: "组装人员",
      active: true,
      period: { start: "2026-08-25", end: "2026-08-31", granularity: "week", periodKey: "2026-08-25_2026-08-31" },
      generatedAt: "2026-09-20T12:00:00.000Z",
      peopleCount: 1,
      recipients: ["张三"],
    },
  ],
};
const indexHit = pickRoleSnapshotEntry(indexOnly, { role: "组装人员", recipient: "张三", period: janToAug });
assert.equal(indexHit?.period?.granularity, "range", "总周期索引没有人员名单时，不能误判为未命中");

const weekOnly = { history: [registry.history[0]] };
assert.equal(
  pickRoleSnapshotEntry(weekOnly, { role: "组装人员", recipient: "张三", period: lastWeek })?.period?.granularity,
  "week",
  "没有总周期时，精确匹配的周快照仍可使用"
);

console.log("role snapshot covering range smoke test passed");
