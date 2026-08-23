import { runQualityAgent, validateQualityAgentStageGate } from "../src/agent/qualityAgent.js";

const snapshot = {
  module: "IQC",
  data: {
    evidenceCatalog: { entries: [{ id: "M-IQC-001" }] },
  },
};

const badAnalysis = validateQualityAgentStageGate({
  stage: "analysis",
  record: { stages: {} },
  snapshot,
  content: "K-IQC-001：存在高风险供应商。",
});
if (!badAnalysis.blocked) throw new Error("Analysis without an evidence reference must be blocked");

const analysis = validateQualityAgentStageGate({
  stage: "analysis",
  record: { stages: {} },
  snapshot,
  content: "K-IQC-001：存在高风险供应商，依据 M-IQC-001。",
});
if (analysis.blocked || analysis.evidenceValidation.status !== "pass") throw new Error("Analysis with a conclusion and valid evidence must pass");

const actionRecord = {
  stages: { analysis: { status: "done", evidenceValidation: analysis.evidenceValidation } },
  actionLedger: { status: "ready" },
};
const actions = validateQualityAgentStageGate({ stage: "actions", record: actionRecord, snapshot, content: "行动依据 M-IQC-001。" });
if (actions.blocked) throw new Error("A complete action ledger with verified analysis must pass");

const reportRecord = {
  ...actionRecord,
  stages: { ...actionRecord.stages, actions: { status: "done", evidenceValidation: actions.evidenceValidation } },
};
const report = validateQualityAgentStageGate({ stage: "report", record: reportRecord, snapshot, content: "正式报告引用 M-IQC-001。" });
if (report.blocked) throw new Error("Report must pass after verified analysis and actions");

const cancellableSnapshot = {
  module: "IQC",
  period: { start2026: "2026-01-01", end2026: "2026-01-31" },
  data: {
    metrics: { batchYield2026: 95, supplierCount: 1, issueCount2026: 1 },
    sourceAudit: { sourceFileCount: 1, totalRows: 1, dateCoverage: { available: true, rate: 100 }, mapping: { total: 1, rate: 100 } },
    localPareto: { totalWeight: 0 },
    evidenceCatalog: { entries: [{ id: "M-IQC-001" }] },
  },
};
const abortController = new AbortController();
let requestCount = 0;
const pendingRequest = new Promise((resolve, reject) => {
  const timer = setTimeout(() => resolve({ content: "K-IQC-001 依据 M-IQC-001。" }), 5000);
  abortController.signal.addEventListener("abort", () => {
    clearTimeout(timer);
    const error = new Error("aborted");
    error.name = "AbortError";
    reject(error);
  }, { once: true });
});
const stoppedRunPromise = runQualityAgent({
  snapshot: cancellableSnapshot,
  skillName: "quality-analysis-iqc",
  skillContent: "test",
  signal: abortController.signal,
  requestChat: async () => { requestCount += 1; return pendingRequest; },
});
setTimeout(() => abortController.abort(), 20);
const stoppedRun = await stoppedRunPromise;
if (stoppedRun.status !== "error" || !/已停止/.test(stoppedRun.error || "") || requestCount !== 1) {
  throw new Error("Agent stop signal did not preserve completed stages and stop the active request");
}

console.log("quality agent gate smoke: ok");
