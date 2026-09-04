import assert from "node:assert/strict";
import fs from "node:fs";
import { splitQualityClauses } from "../server/knowledgeService.mjs";

const store = JSON.parse(fs.readFileSync(new URL("../data/knowledge-store.json", import.meta.url), "utf8"));
const targetNames = ["QS-QP08-RE18 标准气路设计规范--V2.0.docx", "吸嘴设计规范V1.0-20260123.docx"];
const documents = store.documents.filter((item) => targetNames.includes(item.name));
assert.equal(documents.length, 2, "真实样本必须包含当前两份规范");

const report = documents.map((document) => {
  const clauses = splitQualityClauses(document);
  const fragmentCount = clauses.filter((item) => {
    const text = String(item.clauseText || "").trim();
    return text.length < 8 || /^《[^》]+》$/.test(text) || /^[φΦ]?\s*[<>≤≥=]?\s*[+-]?\d+(?:\.\d+)?(?:\s*[a-zA-Zμ％%°Ω℃秒分钟天件个]+)?$/.test(text);
  }).length;
  const longCount = clauses.filter((item) => String(item.clauseText || "").length > 900).length;
  assert.ok(clauses.length >= 20, `${document.name} 解析出的有效证据过少`);
  assert.equal(fragmentCount, 0, `${document.name} 仍有孤立标题/数值证据`);
  assert.equal(longCount, 0, `${document.name} 仍有超长未分割证据`);
  assert.ok(clauses.every((item) => item.metadata?.evidenceKind === "semantic"), `${document.name} 缺少证据类型`);
  return { name: document.name, evidenceCount: clauses.length, averageLength: Math.round(clauses.reduce((sum, item) => sum + item.clauseText.length, 0) / clauses.length), fragmentCount, longCount };
});

console.log(JSON.stringify({ version: "evidence-v2", documents: report }, null, 2));
