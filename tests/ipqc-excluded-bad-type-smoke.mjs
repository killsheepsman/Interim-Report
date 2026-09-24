import assert from "node:assert/strict";
import { isIpqcExcludedBadType, IPQC_EXCLUDED_BAD_TYPES } from "../src/dataEngine.js";

assert.deepEqual(IPQC_EXCLUDED_BAD_TYPES, ["3D问题", "研发问题", "设计问题", "资料问题", "来料问题", "仓库发料问题"]);
assert.equal(isIpqcExcludedBadType({ 不良类型: "3D问题" }), true);
assert.equal(isIpqcExcludedBadType({ 不良类型: "设计问题" }), true);
assert.equal(isIpqcExcludedBadType({ 不良类型: "来料问题" }), true);
assert.equal(isIpqcExcludedBadType({ 不良类型: "仓库发料问题" }), true);
assert.equal(isIpqcExcludedBadType({ 不良类型: "装配问题" }), false);
assert.equal(isIpqcExcludedBadType({ 不良类型: "螺丝问题" }), false);
assert.equal(isIpqcExcludedBadType({ 不良类型: "设计问题-结构" }), true);
console.log("IPQC excluded bad type smoke test passed");
