import assert from "node:assert/strict";
import { classifyDqaRdImportKind, extractAgentPerson, keepFirstSheetHeaders, pruneEngineerSupplementToReviews, repairCorruptedEngineers } from "../src/dataEngine.js";

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

assert.equal(extractAgentPerson("刘洋(0104547(Disabled))"), "刘洋");
assert.equal(extractAgentPerson("0104547(Disabled)(刘洋)"), "刘洋");
assert.equal(extractAgentPerson("赵彪(0107819(Disabled))"), "赵彪");
assert.equal(extractAgentPerson("韩志强(0106050)"), "韩志强");
assert.deepEqual(keepFirstSheetHeaders(["创建人", "PM审核人", "申请人", "PM审核人", "TPM"]), ["创建人", "PM审核人", "申请人", "", "TPM"]);
console.log("agent person and first PM column passed");

const repaired = repairCorruptedEngineers([
  { ecnNo: "ECN1", engineer: "张乐" },
  { ecnNo: "ECN1", engineer: "张\uFFFD\uFFFD\uFFFD" },
  { ecnNo: "ECN2", engineer: "李越" },
  { ecnNo: "ECN2", engineer: "肖国明" },
  { ecnNo: "ECN2", engineer: "李\uFFFD" },
]);
if (repaired[1].engineer !== "张乐") throw new Error("corrupted creator should follow the same ECN");
if (repaired[4].engineer === "李越" || repaired[4].engineer === "肖国明") throw new Error("mixed ECN must not guess a creator");
console.log("corrupted creator repaired from the same ECN");
