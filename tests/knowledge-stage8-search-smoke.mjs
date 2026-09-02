import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.QMS_DATABASE_URL = " ";
process.env.DATABASE_URL = " ";
const { createKnowledgeService } = await import("../server/knowledgeService.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "qms-knowledge-stage8-"));

try {
  const filePath = path.join(root, "knowledge.json");
  const document = { id: "doc-stage8", name: "装配首件规范", category: "组装工艺", contentType: "text", fileHash: "stage8-hash", sourceLevel: "B", version: "1.0", owner: "质量部", reviewDue: "2099-12-31", effectiveStatus: "active", governanceStatus: "已发布", status: "completed", clauseCount: 120, distillationCount: 1, sourceText: "这是只允许详情接口读取的完整原文。", metadata: {} };
  const clauses = Array.from({ length: 120 }, (_, index) => ({ id: `clause-${index + 1}`, documentId: document.id, ordinal: index + 1, sectionPath: "首件", clauseNumber: `1.${index + 1}`, title: "首件确认", clauseText: index === 0 ? "组装首件检验确认合格后方可批量生产。" : `装配证据条款${index + 1}。`, searchText: index === 0 ? "组装 首件 检验 确认 合格 批量生产" : `装配证据条款${index + 1}`, metadata: { sourceFormat: "text", sourceLocation: { locator: String(index + 1) }, ocrStatus: "not_required" }, createdAt: new Date().toISOString() }));
  const knowledge = [{ id: "knowledge-stage8", documentId: document.id, clauseIds: [clauses[0].id], type: "mandatory", title: "首件确认", content: "组装首件检验确认合格后方可批量生产。", applicableRoles: ["组装人员"], processes: ["首件检验"], issueTags: ["首件"], synonyms: ["首件确认"], sourceLevel: "B", version: "1.0", confidence: 0.98, skillId: "quality-knowledge-distillation", sourceCitations: [{ clauseId: clauses[0].id, quote: clauses[0].clauseText }], reviewStatus: "approved", publicationStatus: "published", metadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
  const issue = { id: "issue-stage8", module: "IPQC", issueKind: "组装过程问题", personName: "测试人员", issueDate: "2026-08-31", issueType: "首件", issueText: "组装首件未确认", normalizedText: "组装首件未确认", tags: ["首件"], sourceFile: "stage8.xlsx", sourceKey: "stage8:1", metadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await fs.writeFile(filePath, JSON.stringify({ version: 5, documents: [document], clauses, jobs: [], knowledge, issues: [issue], matches: [], recurrenceActions: [], reviewSessions: [], feedbackRecords: [], conflicts: [], auditLogs: [] }), "utf8");

  const service = createKnowledgeService({ filePath });
  const index = await service.listDocuments();
  assert.equal(index.length, 1);
  assert.equal(index[0].sourceText, undefined, "文档列表只能返回轻量索引");
  assert.equal((await service.getDocument(document.id)).sourceText, document.sourceText, "详情接口应按需读取原文");
  const page = await service.listClauses(document.id, { limit: 10, offset: 20 });
  assert.equal(page.clauses.length, 10);
  assert.equal(page.total, 120);

  const first = await service.generateMatches(issue.id);
  const second = await service.generateMatches(issue.id);
  assert.equal(first.audit.cacheHit, false);
  assert.equal(second.audit.cacheHit, true);
  assert.ok(Number.isFinite(first.audit.elapsedMs));
  assert.ok(first.matches.some((item) => item.candidateType === "knowledge"));
  const beforeInvalidation = service.getSearchMetrics();
  assert.equal(beforeInvalidation.queries, 2);
  assert.equal(beforeInvalidation.cacheHits, 1);

  await service.updateDocumentMetadata(document.id, { owner: "装配质量部", actor: "阶段8测试" });
  const third = await service.generateMatches(issue.id);
  assert.equal(third.audit.cacheHit, false, "知识版本或治理元数据变化后必须准确失效");
  assert.ok(service.getSearchMetrics().corpusRevision > beforeInvalidation.corpusRevision);
  const benchmark = await service.runReadBenchmark({ concurrency: 5, rounds: 2 });
  assert.equal(benchmark.mode, "read_only");
  assert.equal(benchmark.concurrency, 5);
  assert.equal(benchmark.rounds, 2);
  assert.equal(benchmark.targetDocuments, 1);
  assert.ok(benchmark.documentIndex.count > 0);
  assert.ok(benchmark.clausePage.count > 0);
  assert.ok(benchmark.knowledgePage.count > 0);
  assert.ok(benchmark.candidateSearch.count > 0);
  assert.ok(benchmark.documentIndex.p95Ms >= 0);
  console.log("knowledge stage8 search smoke passed");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
