import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.QMS_DATABASE_URL = " ";
process.env.DATABASE_URL = " ";
const { createKnowledgeService } = await import("../server/knowledgeService.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "qms-knowledge-pipeline-gate-"));

try {
  const filePath = path.join(root, "knowledge.json");
  const document = { id: "doc-evidence-only", name: "证据阶段规范", category: "组装工艺", sourceLevel: "B", effectiveStatus: "active", governanceStatus: "已解析", status: "completed", clauseCount: 1, distillationCount: 1, metadata: {} };
  const clause = { id: "clause-1", documentId: document.id, ordinal: 1, clauseText: "接线端子必须锁紧。", searchText: "接线端子必须锁紧。", metadata: {} };
  const issue = { id: "issue-1", module: "IPQC", issueKind: "组装问题", issueType: "接线", issueText: "接线端子未锁紧", normalizedText: "接线端子未锁紧", tags: ["接线", "端子"], sourceKey: "test:1", metadata: {} };
  const candidate = { id: "knowledge-candidate", documentId: document.id, title: "端子锁紧", content: "接线端子必须锁紧。", publicationStatus: "candidate", sourceCitations: [{ clauseId: clause.id, quote: clause.clauseText }], metadata: {} };
  await fs.writeFile(filePath, JSON.stringify({ version: 5, documents: [document], clauses: [clause], jobs: [], knowledge: [candidate], issues: [issue], matches: [] }), "utf8");
  const service = createKnowledgeService({ filePath });
  await assert.rejects(
    service.generateMatches(issue.id),
    /尚无已发布知识卡片.*先完成证据生成、知识蒸馏并发布知识/,
    "证据和未发布知识卡不得直接进入问题匹配",
  );
  console.log("knowledge pipeline gate smoke passed");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
