import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/agent/AgentRoleReportPage.jsx", import.meta.url), "utf8");
const protocol = await readFile(new URL("../skills/skill-upgrade-protocol/SKILL.md", import.meta.url), "utf8");
const roleContract = await readFile(new URL("../skills/skill-upgrade-protocol/references/role-skill-iteration.md", import.meta.url), "utf8");

assert.doesNotMatch(page, /agent-role-report-repair|自动验收修复|buildTargetedRepairPrompt/);
assert.match(protocol, /only when Codex is upgrading a Skill/);
assert.match(protocol, /role-skill-iteration\.md/);
assert.match(roleContract, /QMS 页面生成角色报告时不得执行本契约/);
assert.match(roleContract, /最多进行三轮/);
assert.match(roleContract, /组装人员/);
assert.match(roleContract, /研发工程师/);
assert.match(roleContract, /机长、交付经理、供应链经理/);
assert.match(roleContract, /PM、TPM、产总/);

console.log("role Skill upgrade/runtime boundary smoke passed");
