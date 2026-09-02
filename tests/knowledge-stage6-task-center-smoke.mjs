import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.QMS_DATABASE_URL = " ";
process.env.DATABASE_URL = " ";
const { createKnowledgeService } = await import("../server/knowledgeService.mjs");

const root = await fs.mkdtemp(path.join(os.tmpdir(), "qms-knowledge-stage6-"));
const filePath = path.join(root, "knowledge.json");
const documentId = "stage6-document";
const clauses = Array.from({ length: 6 }, (_, index) => ({ id: `clause-${index + 1}`, documentId, ordinal: index + 1, clauseNumber: `6.${index + 1}`, sectionPath: "阶段6测试", title: `测试条款${index + 1}`, clauseText: `测试条款${index + 1}：${"必须保留原文证据。".repeat(180)}`, searchText: `测试条款${index + 1}`, metadata: { sourceHash: "stage6-hash", sourceLocation: { page: index + 1 }, ocrStatus: "not_required", reviewStatus: "not_required" }, createdAt: new Date().toISOString() }));
const document = { id: documentId, name: "阶段6后台蒸馏测试规范", category: "研发设计规范", contentType: "text", sourceLevel: "A", version: "1.0", effectiveStatus: "active", governanceStatus: "已解析", status: "completed", progress: 100, clauseCount: clauses.length, distillationCount: 0, metadata: { reviewStatus: "not_required" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
await fs.writeFile(filePath, JSON.stringify({ version: 4, documents: [document], clauses, jobs: [], knowledge: [], issues: [], matches: [], recurrenceActions: [], reviewSessions: [], feedbackRecords: [] }), "utf8");

const calls = new Map();
let failedOnce = false;
const aiComplete = async ({ messages, signal }) => {
  const marker = "条款：\n";
  const content = messages[1].content;
  const rows = JSON.parse(content.slice(content.indexOf(marker) + marker.length));
  const clause = rows[0];
  calls.set(clause.clauseId, (calls.get(clause.clauseId) || 0) + 1);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 25);
    signal?.addEventListener("abort", () => { clearTimeout(timer); const error = new Error("stopped"); error.name = "AbortError"; reject(error); }, { once: true });
  });
  if (clause.clauseId === "clause-3" && !failedOnce) { failedOnce = true; throw new Error("模拟第三批上游失败"); }
  return { model: "stage6-mock-model", usage: { input_tokens: 100, output_tokens: 50 }, content: JSON.stringify({ knowledge: [{ type: "mandatory", title: `${clause.clauseId}控制要求`, content: clause.text.slice(0, 50), applicableRoles: [], processes: [], issueTags: [], synonyms: [], confidence: 1, sourceCitations: [{ clauseId: clause.clauseId, clauseNumber: clause.clauseNumber, sectionPath: clause.sectionPath, quote: clause.text.slice(0, 20) }] }] }) };
};
const loadSkillContent = async () => "只根据输入条款生成带逐字引用的JSON知识点。";
const waitFor = async (service, jobId, statuses, timeout = 10000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const job = await service.getJob(jobId);
    if (job && statuses.includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`等待任务状态超时：${statuses.join("/")}`);
};

try {
  const firstService = createKnowledgeService({ filePath, aiComplete, loadSkillContent });
  const started = await firstService.startDistillation(documentId, "quality-knowledge-distillation", { batchChars: 3000, maxBatchClauses: 5, maxRetries: 0 });
  await firstService.controlDistillationJob(started.id, "pause");
  const paused = await waitFor(firstService, started.id, ["paused"]);
  assert.equal(paused.status, "paused");
  assert.ok((paused.result.logs || []).some((item) => item.message.includes("停止")), "停止任务应留下日志");

  const restartedService = createKnowledgeService({ filePath, aiComplete, loadSkillContent });
  await restartedService.controlDistillationJob(started.id, "resume");
  const failed = await waitFor(restartedService, started.id, ["failed"]);
  assert.equal(failed.result.batches.filter((item) => item.status === "failed").length, 1, "应仅有模拟的第三批失败");
  assert.equal(failed.result.batches.filter((item) => item.status === "completed").length, 5, "其它批次应继续完成并保留");
  const completedCallsBeforeRetry = new Map(calls);

  await restartedService.controlDistillationJob(started.id, "retry_failed");
  const completed = await waitFor(restartedService, started.id, ["completed"]);
  assert.equal(completed.progress, 100);
  assert.equal(completed.result.model, "stage6-mock-model");
  assert.equal(completed.result.batches.filter((item) => item.status === "completed").length, 6);
  assert.equal(calls.get("clause-3"), 2, "失败批次应单独重试一次");
  for (const clause of clauses.filter((item) => item.id !== "clause-3")) assert.equal(calls.get(clause.id), completedCallsBeforeRetry.get(clause.id), `已完成批次 ${clause.id} 不应重复调用`);
  const distilled = await restartedService.listDistilled(documentId, { limit: 20 });
  assert.equal(distilled.total, 6, "重试完成后应保存全部6条知识点");
  const compact = await restartedService.listJobs("", { compact: true });
  const compactJob = compact.find((item) => item.id === started.id);
  assert.equal(compactJob.result.batchSummary.completed, 6);
  assert.equal(compactJob.result.batches, undefined, "任务索引不能携带批次正文");
  const stored = JSON.parse(await fs.readFile(filePath, "utf8"));
  stored.jobs.push({ id: "running-job", documentId, jobType: "distill", status: "running", progress: 50, message: "模拟运行任务", skillId: "quality-knowledge-distillation", result: {}, errorMessage: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  stored.jobs.push({ id: "failed-job", documentId, jobType: "distill", status: "failed", progress: 50, message: "模拟失效任务", skillId: "quality-knowledge-distillation", result: {}, errorMessage: "模拟失败", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await fs.writeFile(filePath, JSON.stringify(stored), "utf8");
  await assert.rejects(() => restartedService.deleteJob("running-job"), /请先停止任务/);
  assert.equal(await restartedService.deleteJob("failed-job"), true, "失败任务应允许删除");
  assert.equal(await restartedService.getJob("failed-job"), null, "删除后不应再读取到失效任务");
  assert.equal(await restartedService.deleteJob(started.id), true, "完成任务记录也应允许删除");
  assert.equal((await restartedService.listDistilled(documentId, { limit: 20 })).total, 6, "删除任务不能删除已生成知识卡");
  console.log("knowledge stage6 task center smoke passed");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
