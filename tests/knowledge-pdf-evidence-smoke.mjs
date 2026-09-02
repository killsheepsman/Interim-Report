import assert from "node:assert/strict";
import { buildPdfEvidenceClauses, splitEvidenceText, splitQualityClauses } from "../server/knowledgeService.mjs";

const firstMeaning = "定位基准应稳定可重复。".repeat(260);
const secondMeaning = "公差必须结合检验方法验证。".repeat(80);
const chunks = splitEvidenceText(`${firstMeaning}\n\n${secondMeaning}`);
assert.deepEqual(chunks, [firstMeaning, secondMeaning], "证据只能按语义段落切分，不能按固定字符截断");
const textClauses = splitQualityClauses({ id: "semantic-doc", name: "语义测试", contentType: "word", sourceText: `${firstMeaning}\n${secondMeaning}`, fileHash: "semantic" });
assert.equal(textClauses.length, 2, "无编号段落应各自保留为完整语义证据");
assert.equal(textClauses[0].clauseText, firstMeaning, "证据正文不能被固定长度截断");

const document = { id: "doc-1", name: "测试手册.pdf", fileHash: "abc", contentType: "pdf" };
const clauses = buildPdfEvidenceClauses(document, [
  { page: 1, text: "第一页有效设计要求。", cropBox: [0, 0, 595, 842], ocrStatus: "native", nativeTextQuality: { score: 92 } },
  { page: 2, text: "第一页有效设计要求。", cropBox: [0, 0, 595, 842], ocrStatus: "completed", nativeTextQuality: { score: 0 } },
]);
assert.equal(clauses.length, 1, "重复证据片段应去重");
assert.equal(clauses[0].metadata.sourceLocation.page, 1);
assert.equal(clauses[0].metadata.duplicateLocations[0].page, 2, "去重后应保留后续页位置");
assert.equal(clauses[0].metadata.sourceHash, "abc");
console.log("knowledge PDF evidence smoke passed");
