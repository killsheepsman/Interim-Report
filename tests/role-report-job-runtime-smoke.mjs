import assert from "node:assert/strict";
import {
  clearRoleReportJobsForTests,
  emptyRoleReportProgress,
  getRoleReportJob,
  hasRunningRoleReportJobs,
  isRoleReportJobRunning,
  patchRoleReportJob,
  readRoleReportPeriod,
  ROLE_PERIOD_STORAGE_KEY,
  subscribeRoleReportJob,
  writeRoleReportPeriod,
} from "../src/agent/roleReportJobRuntime.js";

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
};

writeRoleReportPeriod({ year: "2026", start: "2026-01-01", end: "2026-09-30" });
assert.equal(JSON.parse(memory.get(ROLE_PERIOD_STORAGE_KEY)).end, "2026-09-30");
assert.deepEqual(readRoleReportPeriod({ start2026: "2026-01-01", end2026: "2026-08-31" }), {
  year: "2026",
  start: "2026-01-01",
  end: "2026-09-30",
});

clearRoleReportJobsForTests();
const controller = new AbortController();
const seen = [];
const stop = subscribeRoleReportJob((job) => seen.push(job.state.status));
patchRoleReportJob("交付经理", {
  controller,
  progress: { ...emptyRoleReportProgress(), visible: true, phase: "准备生成", total: 2 },
  state: { status: "running", message: "正在生成" },
});
assert.equal(isRoleReportJobRunning(getRoleReportJob("交付经理")), true);
assert.equal(hasRunningRoleReportJobs(), true);
assert.equal(getRoleReportJob("组装人员"), null);
controller.abort();
patchRoleReportJob("交付经理", { controller: null, state: { status: "error", message: "已停止批量生成，已完成报告已缓存，可继续生成" } });
assert.equal(hasRunningRoleReportJobs(), false);
assert.ok(seen.includes("running"));
stop();
clearRoleReportJobsForTests();
console.log("role report job runtime smoke passed");