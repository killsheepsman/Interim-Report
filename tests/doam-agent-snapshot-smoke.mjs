import { buildDoamAgentSnapshotData } from "../src/doamEngine.js";
import { buildQualityAgentSnapshot } from "../src/agent/qualitySnapshot.js";
import { buildAgentAuditResult } from "../src/agent/qualityAgent.js";

const unit = (overrides) => ({ d: "2026-01-10", s: "白班", m: "M1", t: "王辉", e: "共同机型", p: "FPC事业部", k: "太原富士康", y: 2026, o: 1, a: 10, ...overrides });

const units = [
  unit({ d: "2025-08-25", y: 2025, o: 8, m: "A1", e: "共同机型", t: "王辉", a: 40 }),
  unit({ d: "2025-08-26", y: 2025, o: 8, m: "A2", e: "共同机型", t: "王辉", a: 40 }),
  unit({ d: "2025-08-27", y: 2025, o: 8, m: "B1", e: "旧机型", t: "林秋秋", a: 80 }),
  unit({ d: "2026-01-10", y: 2026, o: 1, m: "N1", e: "新机型", t: "郑昊翔", a: 120 }),
  unit({ d: "2026-01-11", y: 2026, o: 1, m: "N2", e: "新机型", t: "郑昊翔", a: 80 }),
  unit({ d: "2026-08-10", y: 2026, o: 8, m: "A1", e: "共同机型", t: "王辉", a: 30 }),
  unit({ d: "2026-08-11", y: 2026, o: 8, m: "A2", e: "共同机型", t: "王辉", a: 20 }),
];

const categories = [
  { y: 2025, t: "王辉", c: "取料/丢料", e: "共同机型", a: 80 },
  { y: 2025, t: "林秋秋", c: "真空/吸附", e: "旧机型", a: 80 },
  { y: 2026, t: "郑昊翔", c: "其他", e: "新机型", a: 200 },
  { y: 2026, t: "王辉", c: "取料/丢料", e: "共同机型", a: 50 },
];

const dataset = {
  units,
  categories,
  quality: { rowCount: 20, dateMin: "2025-08-25", dateMax: "2026-08-11", blankDate: 0, tpmCount: 3, deviceTypeCount: 3, files: ["doam.csv"] },
  files: ["doam.csv"],
};

const view = buildDoamAgentSnapshotData(dataset, { start2025: "2025-01-01", end2025: "2025-08-31", start2026: "2026-01-01", end2026: "2026-08-31" });
if (!view.metrics.overlapMonths.includes(8) || view.metrics.overlapMonths.length !== 1) throw new Error(`overlapMonths should be [8], got ${JSON.stringify(view.metrics.overlapMonths)}`);
if (!view.metrics.monthlyTrend.some((row) => row.label === "2025-08" && row.alarm === 160)) throw new Error("labeled 2025-08 trend missing");
if (!view.metrics.monthlyTrend.some((row) => row.label === "2026-01")) throw new Error("labeled 2026-01 trend missing");
if (view.metrics.monthlyTrend.some((row) => !row.label)) throw new Error("trend points must have YYYY-MM labels");
if (view.metrics.alarms2026 !== 250) throw new Error(`alarms2026 expected 250, got ${view.metrics.alarms2026}`);
if (view.metrics.otherShare2026 !== 80) throw new Error(`otherShare2026 expected 80, got ${view.metrics.otherShare2026}`);
const newType = view.evidence.newTypes2026.find((row) => row.name === "新机型");
if (!newType || newType.shifts2026 !== 2 || newType.alarms2026 !== 200) throw new Error(`new type denominator missing: ${JSON.stringify(newType)}`);
if (view.metrics.residualVolumeExcludeTopTpm == null) throw new Error("residual after top TPM missing");
if (view.metrics.comparableVolume2026 == null) throw new Error("comparable overlap volume missing");

const snapshot = buildQualityAgentSnapshot({
  data: { doam: dataset },
  files: [],
  dateRange: { start2025: "2025-01-01", end2025: "2025-08-31", start2026: "2026-01-01", end2026: "2026-08-31" },
  module: "DOAM",
});
if (snapshot.data.localPareto.totalWeight !== 250) throw new Error(`Pareto denominator should be 2026 alarms 250, got ${snapshot.data.localPareto.totalWeight}`);
const orgTop = snapshot.data.localPareto.organizationPareto[0];
if (orgTop?.name !== "郑昊翔") throw new Error(`TPM pareto top should be 郑昊翔, got ${orgTop?.name}`);
const mechOther = snapshot.data.localPareto.mechanismPareto.find((row) => row.name === "其他");
if (!mechOther || mechOther.share !== 80) throw new Error(`mechanism other share should be 80, got ${JSON.stringify(mechOther)}`);

const audit = buildAgentAuditResult(snapshot);
if (!audit.materialIssues.some((item) => /重叠月份/.test(item))) throw new Error(`audit should flag short overlap, got ${JSON.stringify(audit.materialIssues)}`);
if (audit.grade === "D") throw new Error(`audit should not be blocked, got ${audit.grade}: ${audit.blockers}`);

console.log("doam agent snapshot smoke: ok");
