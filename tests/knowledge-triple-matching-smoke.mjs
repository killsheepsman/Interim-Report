import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractIssueTriple, extractCardTriple, isObjectMismatch, enrichKnowledgeFieldLanguage, formatIssueTriple } from "../server/issueTriple.mjs";

const pin = extractIssueTriple({ module: "IPQC", issueText: "销钉敲过头" });
assert.equal(pin.display.object, "销钉");
assert.equal(pin.display.defect, "过打/过定位");
assert.equal(pin.display.process, "装配");
assert.match(formatIssueTriple(pin), /对象：销钉/);

const needle = extractIssueTriple({ module: "IPQC", issueText: "针模一片针穿错针" });
assert.equal(needle.display.object, "片针、针模");
assert.equal(needle.display.defect, "错装");
assert.equal(needle.display.process, "装配");

const valveCard = extractCardTriple({ title: "气路调速阀安装", issueTags: ["气路", "调速阀"], synonyms: [] });
const pinCard = extractCardTriple({ title: "销钉过打规范", issueTags: ["敲过头", "过打"], synonyms: ["销子"] });
const vagueCard = extractCardTriple({ title: "应按规定锁紧", issueTags: [], synonyms: [] });
assert.equal(isObjectMismatch(pin, valveCard), true);
assert.equal(isObjectMismatch(pin, pinCard), false);
assert.equal(isObjectMismatch(pin, vagueCard), true);

const enriched = enrichKnowledgeFieldLanguage({
  title: "销钉安装",
  atomicRule: { object: "销钉", action: "安装", topic: "销钉", subject: "操作员" },
  issueTags: [],
  synonyms: [],
});
assert.ok(enriched.issueTags.includes("敲过头"));
assert.ok(enriched.synonyms.includes("销子"));

process.env.QMS_DATABASE_URL = " ";
process.env.DATABASE_URL = " ";
const { createKnowledgeService } = await import("../server/knowledgeService.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "qms-triple-match-"));
try {
  const filePath = path.join(root, "knowledge.json");
  const now = new Date().toISOString();
  const documents = [
    { id: "doc-pin", name: "销钉规范", category: "组装工艺", contentType: "text", sourceLevel: "B", version: "1.0", effectiveStatus: "active", governanceStatus: "已解析", status: "completed", clauseCount: 1, distillationCount: 0, sourceText: "销钉不得过打。", metadata: {} },
    { id: "doc-valve", name: "气路规范", category: "组装工艺", contentType: "text", sourceLevel: "B", version: "1.0", effectiveStatus: "active", governanceStatus: "已解析", status: "completed", clauseCount: 1, distillationCount: 0, sourceText: "调速阀安装方向正确。", metadata: {} },
    { id: "doc-vague", name: "通用锁紧", category: "组装工艺", contentType: "text", sourceLevel: "B", version: "1.0", effectiveStatus: "active", governanceStatus: "已解析", status: "completed", clauseCount: 1, distillationCount: 0, sourceText: "应按规定锁紧。", metadata: {} },
    { id: "doc-screw", name: "螺钉规范", category: "组装工艺", contentType: "text", sourceLevel: "B", version: "1.0", effectiveStatus: "active", governanceStatus: "已解析", status: "completed", clauseCount: 1, distillationCount: 0, sourceText: "相同位置同类型螺钉长度一致。", metadata: {} },
    { id: "doc-first", name: "装配首件规范", category: "组装工艺", contentType: "text", sourceLevel: "B", version: "1.0", effectiveStatus: "active", governanceStatus: "已解析", status: "completed", clauseCount: 1, distillationCount: 0, sourceText: "首件检验确认合格后方可批量生产。", metadata: {} },
  ];
  const clauses = documents.map((document) => ({ id: `${document.id}-clause`, documentId: document.id, ordinal: 1, sectionPath: "条款", clauseNumber: "1.1", title: document.sourceText, clauseText: document.sourceText, searchText: document.sourceText, metadata: {}, createdAt: now }));
  const knowledge = [
    { id: "knowledge-pin", documentId: "doc-pin", clauseIds: ["doc-pin-clause"], type: "mandatory", title: "销钉不得过打", content: "销钉装配时不得过打、过定位。", applicableRoles: ["组装人员"], processes: ["装配"], issueTags: ["敲过头", "过打"], synonyms: ["销子"], sourceLevel: "B", version: "1.0", confidence: 0.95, skillId: "quality-knowledge-distillation", sourceCitations: [{ clauseId: "doc-pin-clause", clauseNumber: "1.1", sectionPath: "条款", quote: "销钉不得过打。" }], reviewStatus: "approved", publicationStatus: "published", metadata: { atomicRule: { object: "销钉", action: "过打", topic: "销钉", subject: "组装人员" } }, createdAt: now, updatedAt: now },
    { id: "knowledge-valve", documentId: "doc-valve", clauseIds: ["doc-valve-clause"], type: "mandatory", title: "气路调速阀安装方向", content: "调速阀安装方向应正确。", applicableRoles: ["组装人员"], processes: ["装配"], issueTags: ["调速阀"], synonyms: ["气路"], sourceLevel: "B", version: "1.0", confidence: 0.95, skillId: "quality-knowledge-distillation", sourceCitations: [{ clauseId: "doc-valve-clause", clauseNumber: "1.1", sectionPath: "条款", quote: "调速阀安装方向正确。" }], reviewStatus: "approved", publicationStatus: "published", metadata: { atomicRule: { object: "调速阀", action: "安装", topic: "调速阀", subject: "组装人员" } }, createdAt: now, updatedAt: now },
    { id: "knowledge-vague", documentId: "doc-vague", clauseIds: ["doc-vague-clause"], type: "mandatory", title: "应按规定锁紧", content: "应按规定锁紧。", applicableRoles: ["组装人员"], processes: ["装配"], issueTags: [], synonyms: [], sourceLevel: "B", version: "1.0", confidence: 0.95, skillId: "quality-knowledge-distillation", sourceCitations: [{ clauseId: "doc-vague-clause", clauseNumber: "1.1", sectionPath: "条款", quote: "应按规定锁紧。" }], reviewStatus: "approved", publicationStatus: "published", metadata: { atomicRule: { object: "零件", action: "锁紧", topic: "锁紧", subject: "组装人员" } }, createdAt: now, updatedAt: now },
    { id: "knowledge-screw", documentId: "doc-screw", clauseIds: ["doc-screw-clause"], type: "mandatory", title: "相同位置同类型螺钉长度一致", content: "相同位置、相同类型的螺钉长度要一致。", applicableRoles: ["组装人员"], processes: ["装配"], issueTags: ["不一致", "一致"], synonyms: ["螺钉"], sourceLevel: "B", version: "1.0", confidence: 0.95, skillId: "quality-knowledge-distillation", sourceCitations: [{ clauseId: "doc-screw-clause", clauseNumber: "1.1", sectionPath: "条款", quote: "相同位置同类型螺钉长度一致。" }], reviewStatus: "approved", publicationStatus: "published", metadata: { atomicRule: { object: "螺钉", action: "长度一致", topic: "螺钉", subject: "组装人员" } }, createdAt: now, updatedAt: now },
    { id: "knowledge-first", documentId: "doc-first", clauseIds: ["doc-first-clause"], type: "mandatory", title: "首件确认", content: "组装首件检验确认合格后方可批量生产。", applicableRoles: ["组装人员"], processes: ["首件检验"], issueTags: ["首件"], synonyms: ["首件确认"], sourceLevel: "B", version: "1.0", confidence: 0.95, skillId: "quality-knowledge-distillation", sourceCitations: [{ clauseId: "doc-first-clause", clauseNumber: "1.1", sectionPath: "条款", quote: "首件检验确认合格后方可批量生产。" }], reviewStatus: "approved", publicationStatus: "published", metadata: {}, createdAt: now, updatedAt: now },
  ];
  const issues = [
    { id: "issue-pin", module: "IPQC", issueKind: "组装过程问题", personName: "测试", issueDate: "2026-09-20", issueType: "装配", issueText: "销钉敲过头", normalizedText: "销钉敲过头", tags: ["销钉", "敲过头"], sourceFile: "test.xlsx", sourceKey: "pin", metadata: {}, createdAt: now, updatedAt: now },
    { id: "issue-needle", module: "IPQC", issueKind: "组装过程问题", personName: "测试", issueDate: "2026-09-20", issueType: "装配", issueText: "针模一片针穿错针", normalizedText: "针模一片针穿错针", tags: ["针模", "片针", "穿错"], sourceFile: "test.xlsx", sourceKey: "needle", metadata: {}, createdAt: now, updatedAt: now },
    { id: "issue-wire", module: "IPQC", issueKind: "组装过程问题", personName: "杨孟岩", issueDate: "2026-09-12", issueType: "接线问题", issueText: "PE地线型号规格不一致", normalizedText: "pe地线型号规格不一致", tags: ["不一致"], sourceFile: "IPQC匹配验证.xlsx", sourceKey: "wire", metadata: {}, createdAt: now, updatedAt: now },
    { id: "issue-first", module: "IPQC", issueKind: "组装过程问题", personName: "测试人员", issueDate: "2026-08-29", issueType: "首件", issueText: "组装首件未确认", normalizedText: "组装首件未确认", tags: ["首件"], sourceFile: "test.xlsx", sourceKey: "first", metadata: {}, createdAt: now, updatedAt: now },
  ];
  await fs.writeFile(filePath, JSON.stringify({ version: 5, documents, clauses, jobs: [], knowledge, issues, matches: [], recurrenceActions: [] }), "utf8");
  const service = createKnowledgeService({ filePath });

  const pinMatches = await service.generateMatches("issue-pin");
  assert.equal(pinMatches.matches.length, 1, "销钉问题只应配到销钉卡");
  assert.equal(pinMatches.matches[0].knowledgeId, "knowledge-pin");
  assert.equal(pinMatches.matches.some((item) => item.knowledgeId === "knowledge-valve"), false, "销钉不能配调速阀");
  assert.equal(pinMatches.matches.some((item) => item.knowledgeId === "knowledge-vague"), false, "套话卡应保持无匹配");

  const needleMatches = await service.generateMatches("issue-needle");
  assert.equal(needleMatches.matches.length, 0, "没有片针卡时允许无匹配");

  const firstMatches = await service.generateMatches("issue-first");
  assert.ok(firstMatches.matches.some((item) => item.knowledgeId === "knowledge-first"), "首件问题仍应配到首件卡");

  const wire = extractIssueTriple({ module: "IPQC", issueType: "接线问题", issueText: "PE地线型号规格不一致" });
  assert.ok(wire.objects.some((item) => item.canonical === "接线"), "接线/地线应识别为对象");
  const wireMatches = await service.generateMatches("issue-wire");
  assert.equal(wireMatches.matches.some((item) => item.knowledgeId === "knowledge-screw"), false, "接线问题不能配到螺钉卡");
  const listed = await service.listMatches("issue-wire");
  assert.equal(listed.matches.some((item) => item.knowledgeId === "knowledge-screw"), false, "已保存的对象不符匹配不能出现在候选列表");

  console.log("knowledge triple matching smoke passed");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
