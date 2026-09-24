import assert from "node:assert/strict";
import { roleSkillMatchesRole } from "../src/agent/roleSnapshotRegistry.js";

const skills = [
  { name: "quality-role-rd-engineer" },
  { name: "quality-role-rd-engineer-musk" },
  { name: "quality-role-assembly-person" },
  { name: "quality-role-assembly-person-musk" },
  { name: "quality-role-pm" },
  { name: "quality-role-product-director" },
];
const forRole = (roleId) => skills.filter((item) => roleSkillMatchesRole(item, roleId)).map((item) => item.name);
assert.deepEqual(forRole("quality-role-rd-engineer"), ["quality-role-rd-engineer", "quality-role-rd-engineer-musk"]);
assert.deepEqual(forRole("研发工程师"), ["quality-role-rd-engineer", "quality-role-rd-engineer-musk"]);
assert.deepEqual(forRole("quality-role-pm"), ["quality-role-pm"]);
assert.deepEqual(forRole("产总"), ["quality-role-product-director"]);
assert.equal(forRole("quality-role-assembly-person").includes("quality-role-rd-engineer"), false);
console.log("role skill filter smoke test passed");
