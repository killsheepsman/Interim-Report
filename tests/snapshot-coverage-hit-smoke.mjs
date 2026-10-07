import assert from "node:assert/strict";
import fs from "fs";
import { pickLatestQualitySnapshot } from "../src/agent/snapshotRegistry.js";
import { pickRoleSnapshotEntry } from "../src/agent/roleSnapshotRegistry.js";

const registry = JSON.parse(fs.readFileSync("data/state/quality-agent-snapshot-registry.json", "utf8"));
const august = pickLatestQualitySnapshot(registry, {
  module: "IQC",
  dateRange: { start2025: "2025-01-01", end2025: "2025-08-31", start2026: "2026-08-01", end2026: "2026-08-31" },
  skillName: "quality-analysis-iqc",
  layoutProfileId: "research-briefing-v1",
  sourceSignature: "different-source",
  allowPeriodFallback: true,
});
assert.equal(august?.matchLevel, "coverage");
assert.equal(august?.dateRange?.periodKey, "range");
assert.equal(august?.dateRange?.start2026, "2026-01-01");
assert.equal(august?.dateRange?.end2026, "2026-08-31");
assert.deepEqual(august?.selectedWindow, { start: "2026-08-01", end: "2026-08-31" });

const exact = pickLatestQualitySnapshot(registry, {
  module: "IQC",
  dateRange: { start2025: "2025-01-01", end2025: "2025-08-31", start2026: "2026-01-01", end2026: "2026-08-31" },
  skillName: "quality-analysis-iqc-musk",
  layoutProfileId: "research-briefing-v1",
  sourceSignature: august.sourceSignature,
});
assert.equal(exact?.dateRange?.periodKey, "range");
assert.notEqual(exact?.matchLevel, "coverage");

const weekOnly = {
  history: [
    { role: "PM", active: true, period: { start: "2026-08-01", end: "2026-08-07", granularity: "week" }, generatedAt: "2026-09-01T00:00:00.000Z", recipients: ["申学梅"], snapshot: { people: [{ recipient: "申学梅", snapshot: { metrics: { bad: 1 } } }] } },
    { role: "PM", active: true, period: { start: "2026-08-25", end: "2026-08-31", granularity: "week" }, generatedAt: "2026-09-02T00:00:00.000Z", recipients: ["申学梅"], snapshot: { people: [{ recipient: "申学梅", snapshot: { metrics: { bad: 2 } } }] } },
  ],
};
const pm = pickRoleSnapshotEntry(weekOnly, { role: "PM", recipient: "申学梅", period: { start: "2026-08-01", end: "2026-08-31" } });
assert.equal(pm?.matchLevel, "coverage");
assert.equal(pm?.period?.start, "2026-08-25");
assert.equal(pm?.coverage?.start, "2026-08-01");
assert.equal(pm?.coverage?.end, "2026-08-31");

console.log("snapshot coverage hit smoke: ok");
