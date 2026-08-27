import assert from "node:assert/strict";
import { buildDqaAgentRawMetrics } from "../src/dataEngine.js";

const metrics = buildDqaAgentRawMetrics({ ecnRecords: [
  { date: "2026-01-02", engineer: "邓海新", projectName: "P1", bomTotal: 100, bomMachinedTotal: 40, isMachined: true, reason: "加工件设计错误" },
  { date: "2026-01-03", engineer: "邓海新", projectName: "P1", bomTotal: 100, bomMachinedTotal: 40, isMachined: false, reason: "BOM漏做" },
] }, { start: "2026-01-01", end: "2026-06-30" }).byEngineer["邓海新"];

assert.equal(metrics.standardBomDenominator, 60);
assert.equal(metrics.machinedEcnRate, 1 / 40);
assert.equal(metrics.standardEcnRate, 1 / 60);
assert.equal(metrics.machinedToStandardEcnRateRatio, 1.5);
console.log("DQA Agent ECN derived metrics smoke test passed");
