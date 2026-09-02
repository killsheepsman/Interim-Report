import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const source = process.argv[2];
if (!source) throw new Error("请传入PDF样本路径");
process.env.QMS_DATABASE_URL = " ";
process.env.DATABASE_URL = " ";
const { createKnowledgeService } = await import("../server/knowledgeService.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "qms-pdf-service-"));
try {
  const bytes = await fs.readFile(source);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const originals = path.join(root, "knowledge-originals");
  await fs.mkdir(originals, { recursive: true });
  await fs.writeFile(path.join(originals, `${hash}.pdf`), bytes);
  const service = createKnowledgeService({ filePath: path.join(root, "knowledge.json"), originalDir: originals, scriptDir: path.resolve("scripts") });
  const result = await service.createDocument({
    name: path.basename(source), contentType: "pdf", fileHash: hash, sourceText: "PDF原件待解析", registerOnly: true,
    sourceLevel: "A", governanceStatus: "已登记", metadata: { originalStored: true, originalRelativePath: `${hash}.pdf`, reviewStatus: "pending" },
  });
  assert.equal(result.job?.jobType, "pdf_parse");
  let document = result.document;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    document = await service.getDocument(document.id);
    if (["completed", "review_required", "failed"].includes(document.status)) break;
  }
  assert.ok(["completed", "review_required"].includes(document.status), `PDF解析未完成：${document.status} ${document.errorMessage || ""}`);
  assert.ok(Number(document.clauseCount || 0) > 0, "PDF应生成证据片段");
  assert.equal(Number(document.metadata?.processedPageCount || 0), 1);
  console.log(`knowledge PDF service smoke passed: ${document.clauseCount} clauses, OCR ${document.metadata?.ocrPageCount || 0}`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
