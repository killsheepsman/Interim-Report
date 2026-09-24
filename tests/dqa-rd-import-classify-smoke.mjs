import assert from "node:assert/strict";
import { classifyDqaRdImportKind, pruneEngineerSupplementToReviews } from "../src/dataEngine.js";

assert.equal(classifyDqaRdImportKind({ fileName: "ECN查询导出新系统1-7.xlsx", headers: ["ECN编号", "创建人"] }), "ecn");
assert.equal(classifyDqaRdImportKind({ fileName: "非BOM查询导出新系统1-7.xlsx", headers: ["申请人", "物料代码"] }), "nonbom");
assert.equal(classifyDqaRdImportKind({ fileName: "项目映射表.xlsx", headers: ["成本对象", "PM", "TPM"] }), "mapping");
assert.equal(classifyDqaRdImportKind({ fileName: "67dock分站项目启动会20260518.xlsx", headers: ["提出人"], reviewHint: true }), "review");
assert.equal(classifyDqaRdImportKind({ fileName: "设计评审Checklist.xlsx", reviewHint: true }), "review");
assert.equal(classifyDqaRdImportKind({ fileName: "unknown.csv", headers: [] }), "");

const pruned = pruneEngineerSupplementToReviews({
  kind: "DQA_ENGINEER_SUPPLEMENT",
  files: [
    { kind: "ECN", name: "old.xlsx" },
    { kind: "研发评审", name: "review.xlsx" },
  ],
  ecnRecords: [{ engineer: "张三" }],
  nonBomRecords: [{ engineer: "张三" }],
  reviewRecords: [{ projectName: "A" }],
});
assert.equal(pruned.ecnRecords.length, 0);
assert.equal(pruned.nonBomRecords.length, 0);
assert.equal(pruned.files.length, 1);
assert.equal(pruned.files[0].kind, "研发评审");
assert.equal(pruned.reviewRecords.length, 1);
assert.equal(pruneEngineerSupplementToReviews({ files: [{ kind: "ECN" }], ecnRecords: [{}], reviewRecords: [] }), null);

console.log("DQA RD import classify smoke test passed");
