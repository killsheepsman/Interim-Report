import assert from "node:assert/strict";
import { judgeRdIssueTrend, rdReviewPraise, buildDeterministicAnalysisMarkdown, buildRoleAnalysisBrief, isAvoidableEcnReason, isBatchOrderEcn, rolePurposeLine, recipientVoiceBroken, sanitizeRecipientAnalysis } from "../src/agent/roleFixedEvidenceReport.js";
import { renderLieflatRungBars } from "../src/agent/lieflatRoleCharts.js";

const caiMonths = [
  { label: "2026-01", count: 0 },
  { label: "2026-02", count: 0 },
  { label: "2026-03", count: 2 },
  { label: "2026-04", count: 0 },
  { label: "2026-05", count: 4 },
  { label: "2026-06", count: 0 },
  { label: "2026-07", count: 0 },
  { label: "2026-08", count: 0 },
];
const trend = judgeRdIssueTrend(caiMonths, "2026-08-31");
assert.equal(trend.verdict, "better");
assert.equal(trend.recentSum, 0);
assert.equal(trend.prevSum, 6);
assert.match(trend.keepOrPush, /继续保持/);

const worse = judgeRdIssueTrend([
  { label: "2026-01", count: 0 },
  { label: "2026-02", count: 0 },
  { label: "2026-03", count: 1 },
  { label: "2026-04", count: 1 },
  { label: "2026-05", count: 1 },
  { label: "2026-06", count: 2 },
], "2026-06-30");
assert.equal(worse.verdict, "worse");
assert.match(worse.keepOrPush, /加油/);

assert.match(rdReviewPraise({ participation: 4, suggestions: 14 }), /14 条/);
assert.match(rdReviewPraise({ participation: 4, suggestions: 14 }), /拦在图纸上/);
assert.match(rdReviewPraise({ participation: 0, suggestions: 0 }), /我们的目的/);
assert.doesNotMatch(rdReviewPraise({ participation: 0, suggestions: 0 }), /质量部的目的/);
assert.doesNotMatch(rdReviewPraise({ participation: 4, suggestions: 0 }), /出席不等于贡献/);
assert.match(rdReviewPraise({ participation: 0, suggestions: 0 }), /空的/);

const md = buildDeterministicAnalysisMarkdown({
  role: "研发工程师",
  recipient: "蔡桂洪",
  nextReviewDate: "2026-10-22",
  period: { start: "2026-01-01", end: "2026-08-31" },
  evidence: {
    rdQualityIssues: {
      count: 6,
      periodTrend: { month: { rows: caiMonths } },
      examples: [
        { date: "2026-03-04", description: "盘定位模块进线与出线不方便维护" },
        { date: "2026-03-04", description: "485模块进线与下相机气管接头干涉" },
        { date: "2026-05-25", description: "取料拉动皮带没有防护板金罩" },
      ],
    },
    engineerMetrics: { reviewParticipation: 4, reviewSuggestions: 14 },
  },
});
assert.match(md, /继续保持/);
assert.match(md, /有效改善 14 条/);
assert.match(md, /拦在图纸上/);
assert.match(md, /盘定位模块/);
assert.doesNotMatch(md, /蔡桂洪本期/);
assert.doesNotMatch(md, /分类名/);
assert.doesNotMatch(md, /出席不等于贡献/);
assert.doesNotMatch(md, /失效机制/);

const brief = buildRoleAnalysisBrief("研发工程师", {
  rdQualityIssues: { count: 6, periodTrend: { month: { rows: caiMonths } }, examples: [] },
  engineerMetrics: { reviewParticipation: 4, reviewSuggestions: 14 },
}, [], { end: "2026-08-31" });
assert.equal(brief.trend.verdict, "better");
assert.match(brief.review.praise, /14 条/);

console.log("rd analysis rules smoke test passed");

assert.equal(isBatchOrderEcn("分批下单/多人协作下单"), true);
assert.equal(isAvoidableEcnReason("分批下单/多人协作下单"), false);
assert.equal(isAvoidableEcnReason("BOM漏做"), true);
const han = buildDeterministicAnalysisMarkdown({
  role: "研发工程师",
  recipient: "韩小东",
  nextReviewDate: "2026-10-23",
  period: { end: "2026-08-31" },
  evidence: {
    rdQualityIssues: {
      count: 195,
      categories: [
        { name: "设计问题", count: 65 },
        { name: "结构干涉", count: 40 },
        { name: "孔位问题", count: 32 },
      ],
      examples: [
        { date: "2026-01-26", category: "孔位问题", description: "电控门，气管无孔位固定" },
        { date: "2026-01-26", category: "设计问题", description: "对射光电 钣金太软，容易变形" },
        { date: "2026-01-26", category: "结构干涉", description: "Tray上下料吸嘴与流水线的定位有干涉" },
      ],
    },
    topCategoryStats: [
      { name: "设计问题", count: 65 },
      { name: "结构干涉", count: 40 },
      { name: "孔位问题", count: 32 },
    ],
    engineerMetrics: {
      reviewParticipation: 0,
      reviewSuggestions: 0,
      ecnCount: 145,
      ecnReasons: [
        { name: "分批下单/多人协作下单", count: 71 },
        { name: "已满足客户需求，设计功能优化", count: 52 },
        { name: "BOM漏做", count: 6 },
      ],
      nonBomCount: 46,
      nonBomMachinedCount: 12,
    },
  },
});
assert.match(han, /我们的目的/);
assert.doesNotMatch(han, /质量部的目的/);
assert.match(han, /设计问题 65项/);
assert.match(han, /结构干涉 40项/);
assert.match(han, /孔位问题 32项/);
assert.match(han, /分批下单 71 项不作为异常/);
assert.match(han, /BOM漏做/);
assert.match(han, /非BOM加工件 12/);
assert.doesNotMatch(han, /按「分批下单/);
assert.ok((han.match(/按「设计问题」类|按「结构干涉」类|按「孔位问题」类/g) || []).length >= 3);
const pareto = renderLieflatRungBars({
  title: "ECN变更原因 Pareto",
  rows: [
    { label: "分批下单/多人协作下单", value: 71 },
    { label: "已满足客户需求，设计功能优化", value: 52 },
    { label: "设计改善验证", value: 12 },
    { label: "BOM漏做", value: 6 },
    { label: "标准件禁用替换", value: 2 },
    { label: "客户原因", value: 2 },
  ],
});
assert.doesNotMatch(pareto, /rotate\(-90/);
assert.match(pareto, /tspan/);
assert.match(pareto, /分批下单/);
assert.match(pareto, /多人协作下单|协作下单/);
console.log("han + axis extra checks passed");

assert.match(rolePurposeLine("组装人员"), /送检前/);
assert.match(rolePurposeLine("机长"), /班组/);
assert.match(rolePurposeLine("交付经理"), /工坊/);
assert.match(rolePurposeLine("PM"), /项目发布前/);
assert.match(rolePurposeLine("TPM"), /跨项目/);
const assembly = buildDeterministicAnalysisMarkdown({
  role: "组装人员",
  recipient: "朱从军",
  nextReviewDate: "2026-10-23",
  period: { end: "2026-08-31" },
  evidence: {
    ipqcMetrics: { badRecords: 8 },
    periodTrend: { month: { rows: [
      { label: "2026-03", bad: 4 }, { label: "2026-04", bad: 2 }, { label: "2026-05", bad: 2 },
      { label: "2026-06", bad: 0 }, { label: "2026-07", bad: 0 }, { label: "2026-08", bad: 0 },
    ] } },
    topCategoryStats: [
      { name: "漏装", count: 5 },
      { name: "孔位偏移", count: 2 },
      { name: "划伤", count: 1 },
    ],
    examples: [
      { date: "2026-05-08", category: "漏装", description: "销钉漏装" },
      { date: "2026-05-09", category: "孔位偏移", description: "导柱孔偏" },
    ],
  },
});
assert.match(assembly, /我们的目的是送检前把装配缺陷拦住/);
assert.doesNotMatch(assembly, /朱从军本期/);
assert.doesNotMatch(assembly, /质量部的目的/);
assert.match(assembly, /漏装 5项/);
assert.match(assembly, /按「漏装」类当场核对/);
assert.match(assembly, /继续保持/);
const leader = buildDeterministicAnalysisMarkdown({
  role: "机长",
  recipient: "王亮",
  evidence: {
    ipqcMetrics: { badRecords: 10 },
    topCategoryStats: [{ name: "漏装", count: 6 }, { name: "干涉", count: 4 }],
    examples: [{ date: "2026-05-01", category: "漏装", description: "片针漏装" }],
    teamMembers: [{ name: "朱从军", bad: 6 }],
  },
});
assert.match(leader, /班组送检前/);
assert.match(leader, /主要集中在朱从军 6项/);
assert.match(leader, /带着班组送检前拦住「漏装」/);
console.log("role musk extras passed");

const noExamples = buildDeterministicAnalysisMarkdown({
  role: "交付经理",
  recipient: "韩瑞丽",
  period: { _periodStart: "2026-07-01", _periodEnd: "2026-08-31", end: "2026-08-31" },
  evidence: {
    ipqcMetrics: { inspectedRecords: 254, badRecords: 12 },
    periodTrend: { month: { rows: [
      { label: "2026-07", bad: 6, total: 120, selected: true },
      { label: "2026-08", bad: 6, total: 134, selected: true },
    ] } },
    examples: [],
  },
});
assert.doesNotMatch(noExamples, /不得编造/);
assert.doesNotMatch(noExamples, /明细不足/);
assert.doesNotMatch(noExamples, /具体对象待核实/);
assert.doesNotMatch(noExamples, /主要集中在待核实/);
assert.doesNotMatch(noExamples, /仍有问题流出。/);
assert.match(noExamples, /固定摘要还没有分类|固定摘要暂无分类|分类未入摘要/);
assert.doesNotMatch(noExamples, /本期无待办/);
assert.match(noExamples, /固定摘要暂无分类|分类未入摘要/);
assert.doesNotMatch(noExamples, /按本期不良逐条关闭/);
assert.equal(recipientVoiceBroken("代表：明细不足 3 条，具体对象待核实，不得编造。"), true);
assert.doesNotMatch(sanitizeRecipientAnalysis("仍有问题流出，主要集中在待核实。代表：明细不足 3 条，具体对象待核实，不得编造。"), /不得编造|明细不足|待核实/);
console.log("internal report speak blocked");
