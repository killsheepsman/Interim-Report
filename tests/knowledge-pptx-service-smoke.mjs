import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const source = process.argv[2];
if (!source) throw new Error("请传入PPTX样本路径");
process.env.QMS_DATABASE_URL = " ";
process.env.DATABASE_URL = " ";
const { createKnowledgeService } = await import("../server/knowledgeService.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "qms-pptx-service-"));
try {
  const bytes = await fs.readFile(source);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const originals = path.join(root, "knowledge-originals");
  await fs.mkdir(originals, { recursive: true });
  await fs.writeFile(path.join(originals, `${hash}.pptx`), bytes);
  const service = createKnowledgeService({ filePath: path.join(root, "knowledge.json"), originalDir: originals, scriptDir: path.resolve("scripts") });
  const result = await service.createDocument({
    name: path.basename(source), contentType: "ppt", fileHash: hash, sourceText: "PPTX原件待解析", registerOnly: true,
    sourceLevel: "C", governanceStatus: "已登记", metadata: { originalStored: true, originalRelativePath: `${hash}.pptx`, reviewStatus: "pending" },
  });
  assert.equal(result.job?.jobType, "ppt_parse", `应进入PPT后台队列，实际为 ${result.job?.jobType || "none"}`);
  let document = result.document;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    document = await service.getDocument(document.id);
    if (["completed", "review_required", "failed"].includes(document.status)) break;
  }
  assert.ok(["completed", "review_required"].includes(document.status), `PPT解析未完成：${document.status} ${document.errorMessage || ""}`);
  assert.ok(Number(document.metadata?.slideCount || 0) > 0, "应保存幻灯片数量");
  assert.ok(Number(document.clauseCount || 0) > 0, "应生成PPT文字或图片证据");
  const clauses = await service.listClauses(document.id, { limit: 1000 });
  assert.ok(clauses.clauses.some((item) => item.sourceLocation?.slide > 0), "证据应包含幻灯片定位");
  console.log(`knowledge PPTX service smoke passed: ${document.metadata.slideCount} slides, ${document.clauseCount} clauses`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
