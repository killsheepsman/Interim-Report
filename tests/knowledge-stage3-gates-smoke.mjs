import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.QMS_DATABASE_URL = " ";
process.env.DATABASE_URL = " ";
const { createKnowledgeService } = await import("../server/knowledgeService.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "qms-knowledge-stage3-"));

const waitForDocument = async (service, id) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const document = await service.getDocument(id);
    if (["completed", "failed"].includes(document.status)) return document;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("知识文档解析超时");
};

try {
  const service = createKnowledgeService({ filePath: path.join(root, "knowledge.json") });
  const cCreated = await service.createDocument({ name: "经验案例.md", contentType: "text", sourceText: "首件检验确认合格后方可批量生产。", sourceLevel: "C", version: "1.0", owner: "质量部" });
  const cDocument = await waitForDocument(service, cCreated.document.id);
  const cClauses = await service.listClauses(cDocument.id, { limit: 10 });
  const clause = cClauses.clauses[0];
  const packageJson = `${JSON.stringify({ schemaVersion: "qms-knowledge-extraction-v1", document: { documentId: cDocument.id, fileHash: cDocument.fileHash, sourceLevel: "C" }, knowledge: [{ type: "mandatory", title: "首件放行", content: "首件确认后方可批量生产。", originalFact: "首件检验确认合格后方可批量生产。", applicableScope: ["批量生产前"], riskLevel: "high", confidence: 1, sourceCitations: [{ clauseId: clause.id, quote: "首件检验确认合格后方可批量生产。" }] }] })}\n---QMS-MARKDOWN---\n# 人工阅读版`;
  const imported = await service.importDistillation(cDocument.id, { content: packageJson, format: "json", skillId: "free-ai-test" });
  assert.equal(imported.length, 1);
  assert.equal(imported[0].publicationStatus, "candidate");
  const accepted = await service.reviewDistilledKnowledge(imported[0].id, { action: "accept", reviewer: "测试审核人" });
  assert.equal(accepted.publicationStatus, "approved");
  const markdown = `# 文档名称：知识提取结果\n\n## 知识点 1：首件放行\n\n- 类型：mandatory\n- 规则：首件检验确认合格后方可批量生产。\n\n### 原文证据\n\n> 第1页｜${clause.id}｜OCR状态：首件检验确认合格后方可批量生产。`;
  const markdownImported = await service.importDistillation(cDocument.id, { content: markdown, format: "markdown", skillId: "markdown-test" });
  assert.equal(markdownImported.length, 1);
  await assert.rejects(() => service.reviewDistilledKnowledge(imported[0].id, { action: "publish", reviewer: "测试审核人" }), /C级资料/);
  await assert.rejects(() => service.saveDistillation(cDocument.id, { skillId: "invalid-quote", knowledge: [{ title: "错误引用", content: "错误", sourceCitations: [{ clauseId: clause.id, quote: "原文中不存在的句子" }] }] }), /逐字引用校验失败/);
  const partial = await service.saveDistillation(cDocument.id, { skillId: "partial-quote", knowledge: [{ title: "有效引用", content: "首件检验确认合格后方可批量生产。", sourceCitations: [{ clauseId: clause.id, quote: "首件检验确认合格后方可批量生产。" }] }, { title: "错误引用", content: "错误", sourceCitations: [{ clauseId: clause.id, quote: "原文中不存在的句子" }] }] });
  assert.equal(partial.length, 1);
  assert.equal(partial[0].title, "有效引用");
  await assert.rejects(() => service.importDistillation(cDocument.id, { content: JSON.stringify({ schemaVersion: "qms-knowledge-extraction-v1", document: { fileHash: "wrong" }, knowledge: [] }), format: "json" }), /fileHash/);

  const aCreated = await service.createDocument({ name: "正式规范.md", contentType: "text", sourceText: "参数变更后必须重新验证。", sourceLevel: "A", version: "2.0", owner: "研发部", reviewDue: "2099-12-31" });
  const aDocument = await waitForDocument(service, aCreated.document.id);
  const aClause = (await service.listClauses(aDocument.id, { limit: 10 })).clauses[0];
  const aKnowledge = await service.saveDistillation(aDocument.id, { skillId: "stage3-test", knowledge: [{ type: "verification_method", title: "变更后验证", content: "参数变更后必须重新验证。", verification: ["保留验证记录"], confidence: 1, sourceCitations: [{ clauseId: aClause.id, quote: "参数变更后必须重新验证。" }] }] });
  await service.reviewDistilledKnowledge(aKnowledge[0].id, { action: "accept", reviewer: "测试审核人" });
  const published = await service.reviewDistilledKnowledge(aKnowledge[0].id, { action: "publish", reviewer: "测试审核人" });
  assert.equal(published.publicationStatus, "published");
  const longRule = "当参数变更影响安全条件时，必须重新验证并保留完整记录。".repeat(80);
  const longCreated = await service.createDocument({ name: "完整语义规范.md", contentType: "text", sourceText: longRule, sourceLevel: "B", version: "1.0", owner: "研发部" });
  const longDocument = await waitForDocument(service, longCreated.document.id);
  const longClause = (await service.listClauses(longDocument.id, { limit: 10 })).clauses[0];
  const longKnowledge = await service.saveDistillation(longDocument.id, { skillId: "semantic-test", knowledge: [{ title: "完整语义规则", content: longRule, confidence: 1, sourceCitations: [{ clauseId: longClause.id, quote: longRule }] }] });
  assert.equal(longKnowledge[0].content, longRule, "知识点不能按固定字符截断");
  assert.equal(longKnowledge[0].sourceCitations[0].quote, longRule, "原文引用不能按固定字符截断");
  console.log("knowledge stage3 gates smoke passed");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
