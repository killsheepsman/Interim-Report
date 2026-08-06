import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.QMS_DATABASE_URL = "";
process.env.DATABASE_URL = "";
process.env.PGHOST = "";
process.env.PGDATABASE = "";

const { createKnowledgeService } = await import("../server/knowledgeService.mjs");
const directory = await mkdtemp(path.join(os.tmpdir(), "qms-recurrence-"));
const filePath = path.join(directory, "knowledge-store.json");
const candidateKey = "clause:test-standard:4.2";
const issue = (id, issueDate) => ({ id, module: "IPQC", personName: "测试人员", issueDate, issueType: "装配错误", issueText: `测试问题 ${id}`, sourceFile: "隔离测试.xlsx", sourceKey: id, updatedAt: `${issueDate}T08:00:00.000Z` });
const match = (id, issueId) => ({ id, issueId, candidateKey, documentId: "doc-test", status: "confirmed", score: 100, evidence: { documentName: "测试规范", candidateTitle: "装配防错要求", clauseNumber: "4.2", quote: "装配前必须校验物料与工位。" } });

try {
  await writeFile(filePath, JSON.stringify({ version: 3, documents: [], clauses: [], jobs: [], knowledge: [], recurrenceActions: [], issues: [issue("issue-1", "2026-01-10"), issue("issue-2", "2026-02-10")], matches: [match("match-1", "issue-1"), match("match-2", "issue-2")] }, null, 2), "utf8");
  const service = createKnowledgeService({ filePath });

  const initial = await service.listRecurrences({ module: "IPQC" }, []);
  assert.equal(initial.total, 1);
  assert.equal(initial.recurrences[0].repeatCount, 1);
  assert.equal(initial.recurrences[0].state, "recurrent_open");

  const recurrenceKey = initial.recurrences[0].recurrenceKey;
  await assert.rejects(() => service.saveRecurrenceAction(recurrenceKey, { module: "IPQC", personName: "测试人员", candidateKey, effectiveness: "effective", verificationEvidence: "测试证据", observationUntil: "2099-12-31" }), /观察期尚未结束/);

  await service.saveRecurrenceAction(recurrenceKey, { module: "IPQC", personName: "测试人员", candidateKey, actionType: "logical", actionText: "增加物料与工位自动校验", owner: "测试责任人", implementedAt: "2026-03-01", observationUntil: "2026-04-01", verificationMethod: "检查系统拦截记录", verificationEvidence: "观察期内无同类问题", status: "closed", effectiveness: "effective" });
  const effective = await service.listRecurrences({ module: "IPQC", compact: true, limit: 10000 }, []);
  assert.equal(effective.recurrences[0].state, "effective");
  assert.equal(Object.hasOwn(effective.recurrences[0], "issues"), false);

  const store = JSON.parse(await readFile(filePath, "utf8"));
  store.issues.push(issue("issue-3", "2026-05-10"));
  store.matches.push(match("match-3", "issue-3"));
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
  const recurred = await service.listRecurrences({ module: "IPQC" }, []);
  assert.equal(recurred.recurrences[0].repeatCount, 2);
  assert.equal(recurred.recurrences[0].state, "recurred_after_action");
  console.log("knowledge recurrence smoke: ok");
} finally {
  await rm(directory, { recursive: true, force: true });
}
