import assert from "node:assert/strict";
import { isRoleChartSkill, chartThemeFromSkill, DEFAULT_ROLE_CHART_SKILL_ID, roleSkillMatchesRole } from "../src/agent/roleSnapshotRegistry.js";

assert.equal(DEFAULT_ROLE_CHART_SKILL_ID, "quality-role-charts-lieflat");
assert.equal(isRoleChartSkill({ id: "quality-role-charts-lieflat", name: "quality-role-charts-lieflat" }), true);
assert.equal(isRoleChartSkill({ id: "quality-role-charts-default" }), true);
assert.equal(isRoleChartSkill({ id: "quality-role-rd-engineer-musk" }), false);
assert.equal(chartThemeFromSkill({ id: "quality-role-charts-lieflat" }), "lieflat");
assert.equal(chartThemeFromSkill({ id: "quality-role-charts-default" }), "default");
assert.equal(roleSkillMatchesRole({ id: "quality-role-charts-lieflat" }, "quality-role-rd-engineer"), false);
console.log("role chart skill smoke test passed");
