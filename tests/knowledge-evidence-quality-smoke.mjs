import assert from "node:assert/strict";
import { splitEvidenceText, splitQualityClauses } from "../server/knowledgeService.mjs";

const input = [
  "文件类型",
  "设计规范",
  "5.5",
  "φ20",
  "吸附区域",
  "吸附区域：应避开禁选区域并完成强度确认。",
  "首件确认后方可批量组装。",
].join("\n");

const evidence = splitEvidenceText(input);
assert.equal(evidence.includes("文件类型"), false);
assert.equal(evidence.includes("设计规范"), false);
assert.equal(evidence.includes("5.5"), false);
assert.equal(evidence.includes("φ20"), false);
assert.ok(evidence.some((item) => item.includes("首件确认后方可批量组装")));
assert.ok(evidence.some((item) => item.includes("吸附区域：应避开禁选区域")));

const clauses = splitQualityClauses({
  id: "quality-doc",
  name: "质量规范.docx",
  contentType: "word",
  sourceText: input,
});
assert.ok(clauses.every((item) => !["文件类型", "设计规范", "5.5", "φ20"].includes(item.clauseText)));
assert.ok(clauses.every((item) => item.metadata.evidenceKind === "semantic"));
console.log("knowledge evidence quality smoke passed");
