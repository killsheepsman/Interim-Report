import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.QMS_DATABASE_URL = " ";
process.env.DATABASE_URL = " ";
const { createKnowledgeService } = await import("../server/knowledgeService.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "qms-knowledge-stage7-"));

const waitForDocument = async (service, id) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const document = await service.getDocument(id);
    if (["completed", "failed"].includes(document.status)) return document;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("知识文档解析超时");
};

const createPublishedDocument = async (service, { name, version, sourceText, accessLevel = "internal" }) => {
  const created = await service.createDocument({ name, contentType: "text", sourceText, sourceLevel: "A", version, owner: "质量部", reviewDue: "2099-12-31", accessLevel, actor: "阶段7测试" });
  const document = await waitForDocument(service, created.document.id);
  const clause = (await service.listClauses(document.id, { limit: 10 })).clauses[0];
  const knowledge = await service.saveDistillation(document.id, { skillId: "stage7-test", knowledge: [{ type: "mandatory", title: `${name}规则`, content: sourceText, originalFact: sourceText, confidence: 1, sourceCitations: [{ clauseId: clause.id, quote: sourceText }] }] });
  await service.reviewDistilledKnowledge(knowledge[0].id, { action: "accept", reviewer: "阶段7审核人" });
  await service.reviewDistilledKnowledge(knowledge[0].id, { action: "publish", reviewer: "阶段7审核人" });
  return { document: await service.getDocument(document.id), knowledgeId: knowledge[0].id };
};

try {
  const service = createKnowledgeService({ filePath: path.join(root, "knowledge.json") });
  const oldVersion = await createPublishedDocument(service, { name: "装配规范V1.md", version: "1.0", sourceText: "装配完成后必须执行首件确认。" });
  const newVersion = await createPublishedDocument(service, { name: "装配规范V2.md", version: "2.0", sourceText: "装配完成后必须执行首件确认并保留记录。", accessLevel: "restricted" });

  await service.governDocument(oldVersion.document.id, { action: "publish_version", reviewer: "治理管理员" });
  await service.governDocument(newVersion.document.id, { action: "publish_version", reviewer: "治理管理员", replacesDocumentId: oldVersion.document.id });
  const retiredOld = await service.getDocument(oldVersion.document.id);
  const activeNew = await service.getDocument(newVersion.document.id);
  assert.equal(retiredOld.effectiveStatus, "superseded");
  assert.equal(retiredOld.governanceStatus, "已废止");
  assert.equal(activeNew.effectiveStatus, "active");
  assert.equal(activeNew.governanceStatus, "已发布");
  assert.equal(activeNew.accessLevel, "restricted");
  assert.equal((await service.listDistilled(oldVersion.document.id, { limit: 10 })).knowledge[0].publicationStatus, "superseded");

  const processRule = await createPublishedDocument(service, { name: "工艺参数规范.md", version: "1.0", sourceText: "工艺参数变更后必须重新验证。" });
  const conflict = await service.saveConflict({ leftDocumentId: newVersion.document.id, rightDocumentId: processRule.document.id, scope: "装配首件与参数变更", issue: "两份规范对重新验证的触发条件描述不一致", temporaryMeasure: "冲突关闭前执行更严格的双重确认", owner: "质量经理", dueDate: "2099-11-30", actor: "治理管理员" });
  assert.equal(conflict.status, "open");
  assert.equal((await service.getDocument(newVersion.document.id)).openConflictCount, 1);
  await assert.rejects(() => service.governDocument(newVersion.document.id, { action: "publish_version", reviewer: "治理管理员" }), /存在未关闭冲突/);

  const resolved = await service.saveConflict({ ...conflict, status: "resolved", decision: "both_scoped", resolution: "首件规范用于装配放行，参数规范用于参数变更，分别按范围执行。", decidedBy: "质量总监", actor: "质量总监" });
  assert.equal(resolved.status, "resolved");
  assert.equal((await service.getDocument(newVersion.document.id)).openConflictCount, 0);

  const overdueCreated = await service.createDocument({ name: "过期规范.md", contentType: "text", sourceText: "过期规范不得作为正式纠偏依据。", sourceLevel: "A", version: "1.0", owner: "质量部", reviewDue: "2020-01-01", actor: "阶段7测试" });
  const overdue = await waitForDocument(service, overdueCreated.document.id);
  const overdueClause = (await service.listClauses(overdue.id, { limit: 10 })).clauses[0];
  const overdueKnowledge = await service.saveDistillation(overdue.id, { skillId: "stage7-test", knowledge: [{ title: "过期规则", content: "过期规范不得作为正式纠偏依据。", sourceCitations: [{ clauseId: overdueClause.id, quote: "过期规范不得作为正式纠偏依据。" }] }] });
  await service.reviewDistilledKnowledge(overdueKnowledge[0].id, { action: "accept", reviewer: "阶段7审核人" });
  const overduePublished = await service.reviewDistilledKnowledge(overdueKnowledge[0].id, { action: "publish", reviewer: "阶段7审核人" });
  assert.equal(overduePublished.publicationStatus, "published", "发布知识是人工明确动作，不再重复执行资料门禁");

  const cCreated = await service.createDocument({ name: "现场经验.md", contentType: "text", sourceText: "该内容仅用于经验参考。", sourceLevel: "C", version: "1.0", owner: "现场班组", reviewDue: "2099-12-31", actor: "阶段7测试" });
  const cDocument = await waitForDocument(service, cCreated.document.id);
  await assert.rejects(() => service.governDocument(cDocument.id, { action: "publish_version", reviewer: "治理管理员" }), /C级资料/);

  await service.governDocument(processRule.document.id, { action: "retire", reviewer: "治理管理员", reason: "工艺路线已取消" });
  const logicallyRetired = await service.getDocument(processRule.document.id);
  assert.equal(logicallyRetired.effectiveStatus, "obsolete");
  assert.equal(logicallyRetired.governanceStatus, "已废止");
  assert.ok((await service.listClauses(processRule.document.id, { limit: 10 })).total > 0, "逻辑废止必须保留原始证据");
  assert.ok((await service.listDistilled(processRule.document.id, { limit: 10 })).total > 0, "逻辑废止必须保留知识卡历史");

  const actions = new Set((await service.listAuditLogs({ limit: 500 })).logs.map((item) => item.action));
  for (const action of ["import", "publish_version", "supersede", "conflict_open", "conflict_resolve", "retire"]) assert.ok(actions.has(action), `缺少审计动作：${action}`);
  console.log("knowledge stage7 governance smoke passed");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
