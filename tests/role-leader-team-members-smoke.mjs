import assert from "node:assert/strict";
import { teamMemberSpecForRole, teamMemberStats } from "../src/agent/roleSnapshotRegistry.js";
import { buildFixedEvidenceRoleReport } from "../src/agent/roleFixedEvidenceReport.js";

const rows = [
  { 送检人: "张三", 不良类型: "装配问题", 不良内容: "漏装" },
  { 送检人: "张三", 不良类型: "", 不良内容: "" },
  { 送检人: "李四", 不良类型: "螺丝问题", 不良内容: "松动" },
  { 送检人: "李四", 不良类型: "装配问题", 不良内容: "反装" },
];
const members = teamMemberStats(rows, ["送检人"]);
assert.equal(members[0].name, "李四");
assert.equal(members[0].bad, 2);
assert.equal(members[0].total, 2);
assert.equal(members[1].name, "张三");
assert.equal(members[1].bad, 1);
assert.equal(members[1].total, 2);
assert.equal(members[1].good, 1);

const report = buildFixedEvidenceRoleReport({
  role: "机长",
  recipient: "蔡青",
  period: { start: "2026-01-01", end: "2026-08-31" },
  evidence: {
    ipqcMetrics: { inspectedRecords: 4, badRecords: 3, goodRecords: 1, badRate: 75 },
    teamMembers: members,
  },
});
assert.ok(report.includes("组内成员"));
assert.ok(report.includes("李四"));
assert.ok(report.includes("张三"));

assert.equal(teamMemberSpecForRole("交付经理").label, "机长");
assert.equal(teamMemberSpecForRole("供应链经理").label, "交付经理");

const leaderRows = [
  { 机长: "蔡青", 交付经理: "冯红宾", 不良类型: "装配问题", 不良内容: "漏装" },
  { 机长: "蔡青", 交付经理: "冯红宾", 不良类型: "", 不良内容: "" },
  { 机长: "王飞龙", 交付经理: "冯红宾", 不良类型: "螺丝问题", 不良内容: "松动" },
];
const leaders = teamMemberStats(leaderRows, teamMemberSpecForRole("交付经理").fields);
assert.equal(leaders[0].name, "蔡青");
assert.equal(leaders.find((item) => item.name === "王飞龙").bad, 1);

const managers = teamMemberStats(leaderRows, teamMemberSpecForRole("供应链经理").fields);
assert.equal(managers[0].name, "冯红宾");
assert.equal(managers[0].total, 3);

const managerReport = buildFixedEvidenceRoleReport({
  role: "交付经理",
  recipient: "冯红宾",
  period: { start: "2026-01-01", end: "2026-08-31" },
  evidence: { ipqcMetrics: { inspectedRecords: 3, badRecords: 2, goodRecords: 1, badRate: 66.67 }, teamMembers: leaders },
});
assert.ok(managerReport.includes("下属机长"));
assert.ok(managerReport.includes("蔡青"));

console.log("role leader team members smoke test passed");
