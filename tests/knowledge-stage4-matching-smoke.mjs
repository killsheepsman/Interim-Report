import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.QMS_DATABASE_URL = " ";
process.env.DATABASE_URL = " ";
const { createKnowledgeService } = await import("../server/knowledgeService.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "qms-knowledge-stage4-"));
try {
  const filePath = path.join(root, "knowledge.json");
  const documents = [
    { id: "doc-ipqc", name: "装配首件规范", category: "组装工艺", contentType: "text", sourceLevel: "B", version: "1.0", effectiveStatus: "active", governanceStatus: "已解析", status: "completed", clauseCount: 1, distillationCount: 0, sourceText: "首件检验确认合格后方可批量生产。", metadata: {} },
    { id: "doc-wrong-module", name: "研发评审规范", category: "研发设计规范", contentType: "text", sourceLevel: "A", version: "1.0", effectiveStatus: "active", governanceStatus: "已解析", status: "completed", clauseCount: 1, distillationCount: 0, sourceText: "评审必须保留验证记录。", metadata: {} },
    { id: "doc-obsolete", name: "旧装配规范", category: "组装工艺", contentType: "text", sourceLevel: "A", version: "0.9", effectiveStatus: "obsolete", governanceStatus: "已解析", status: "completed", clauseCount: 1, distillationCount: 0, sourceText: "首件检验确认合格后方可批量生产。", metadata: {} },
  ];
  const clauses = documents.map((document) => ({ id: `${document.id}-clause`, documentId: document.id, ordinal: 1, sectionPath: "首件", clauseNumber: "1.1", title: document.sourceText, clauseText: document.sourceText, searchText: document.sourceText, metadata: { sourceFormat: "text", sourceLocation: { locatorType: "text-line", locator: "1" }, ocrStatus: "not_required" }, createdAt: new Date().toISOString() }));
  const issues = [{ id: "issue-1", module: "IPQC", issueKind: "组装过程问题", personName: "测试人员", issueDate: "2026-08-29", issueType: "首件", issueText: "组装首件未确认", normalizedText: "组装首件未确认", tags: ["首件"], sourceFile: "test.xlsx", sourceKey: "test:1", metadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
  const knowledge = [
    { id: "knowledge-ipqc", documentId: "doc-ipqc", clauseIds: ["doc-ipqc-clause"], type: "mandatory", title: "首件确认", content: "组装首件检验确认合格后方可批量生产。", applicableRoles: ["组装人员"], processes: ["首件检验"], issueTags: ["首件"], synonyms: ["首件确认"], sourceLevel: "B", version: "1.0", confidence: 0.95, skillId: "quality-knowledge-distillation", sourceCitations: [{ clauseId: "doc-ipqc-clause", clauseNumber: "1.1", sectionPath: "首件", quote: "首件检验确认合格后方可批量生产。" }], reviewStatus: "approved", publicationStatus: "published", metadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "knowledge-wrong-module", documentId: "doc-wrong-module", clauseIds: ["doc-wrong-module-clause"], type: "mandatory", title: "评审记录", content: "评审必须保留验证记录。", applicableRoles: ["研发工程师"], processes: ["设计评审"], issueTags: ["评审"], synonyms: [], sourceLevel: "A", version: "1.0", confidence: 0.95, sourceCitations: [{ clauseId: "doc-wrong-module-clause", clauseNumber: "1.1", sectionPath: "评审", quote: "评审必须保留验证记录。" }], reviewStatus: "approved", publicationStatus: "published", metadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "knowledge-obsolete", documentId: "doc-obsolete", clauseIds: ["doc-obsolete-clause"], type: "mandatory", title: "旧首件确认", content: "首件检验确认合格后方可批量生产。", applicableRoles: ["组装人员"], processes: ["首件检验"], issueTags: ["首件"], synonyms: [], sourceLevel: "A", version: "0.9", confidence: 0.95, sourceCitations: [{ clauseId: "doc-obsolete-clause", clauseNumber: "1.1", sectionPath: "首件", quote: "首件检验确认合格后方可批量生产。" }], reviewStatus: "approved", publicationStatus: "published", metadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  await fs.writeFile(filePath, JSON.stringify({ version: 3, documents, clauses, jobs: [], knowledge, issues, matches: [], recurrenceActions: [] }), "utf8");
  const service = createKnowledgeService({ filePath });
  const result = await service.generateMatches("issue-1");
  assert.ok(result.matches.length > 0, "应生成至少一个候选");
  assert.ok(result.matches.every((item) => item.evidence.sourceLevel === "B"), "应过滤研发和失效来源");
  assert.equal(result.audit.filteredCount, 1, "失效来源应在语料构建前排除，并记录模块过滤数量");
  assert.match(result.matches[0].evidence.reason, /IPQC模块相符/);
  assert.match(result.matches[0].evidence.reason, /问题标签：首件/);
  assert.equal(result.matches[0].candidateType, "knowledge");
  assert.equal(result.matches[0].evidence.scopeStatus, "unknown");
  console.log("knowledge stage4 matching smoke passed");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
