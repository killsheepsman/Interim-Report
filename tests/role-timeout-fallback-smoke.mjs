import assert from "node:assert/strict";
import {
  TIMEOUT_FALLBACK_NOTE,
  buildFixedDataRoleReport,
  buildFixedEvidenceRoleReport,
  defaultAnalysisMarkdown,
  extractAnalysisMarkdown,
  hasTimeoutFallbackMarker,
  needsRoleModelAnalysis,
  stitchRoleReportParts,
  actionTableRowCount,
  buildDeterministicAnalysisMarkdown,
  buildRoleAnalysisBrief,
  ensureActionTable,
  ensureAnalysisConclusion,
  roleQualityStatus,
  buildReportSalutation,
} from "../src/agent/roleFixedEvidenceReport.js";

const report = buildFixedEvidenceRoleReport({
  role: "组装人员",
  recipient: "朱从军",
  period: { start: "2026-01-01", end: "2026-08-31" },
  evidence: {
    matchedRows: 12,
    ipqcMetrics: { inspectedRecords: 12, badRecords: 3, goodRecords: 9, badRate: 25 },
    topCategoryStats: [{ name: "漏装", count: 2 }],
    confirmedKnowledge: [{ documentName: "组装作业指导书", clauseNumber: "5.1", title: "螺丝必须打紧", correctState: "按扭矩打紧后点检" }],
  },
});

assert.equal(hasTimeoutFallbackMarker(report), true);
assert.ok(report.includes("朱从军"));
assert.ok(report.includes("送检记录"));
assert.ok(report.includes("12"));
assert.ok(report.includes("组装作业指导书"));
assert.ok(report.includes("待核实：模型超时，未生成分析正文。"));
assert.ok(report.includes("本月措施"));
assert.equal(report.includes("30/60/90"), false);
assert.equal(report.includes("模型分析认为"), false);
assert.ok(TIMEOUT_FALLBACK_NOTE.includes("固定证据"));

const rd = buildFixedEvidenceRoleReport({
  role: "研发工程师",
  recipient: "陈焜",
  period: { _periodStart: "2026-01-01", _periodEnd: "2026-08-31" },
  evidence: { matchedRows: 23, rdQualityIssues: { count: 23, categories: [{ name: "设计问题", count: 21 }] }, engineerMetrics: { ecn: 8, nonBom: 2 } },
});
assert.ok(rd.includes("研发质量问题"));
assert.ok(rd.includes("23"));
assert.ok(hasTimeoutFallbackMarker(rd));
assert.ok(rd.includes("ECN变更活动"));
assert.ok(rd.includes("设计评审正向贡献"));

const live = buildFixedDataRoleReport({
  role: "组装人员",
  recipient: "朱从军",
  period: { start: "2026-01-01", end: "2026-08-31" },
  evidence: { ipqcMetrics: { inspectedRecords: 12, badRecords: 3, goodRecords: 9, badRate: 25 } },
});
assert.equal(hasTimeoutFallbackMarker(live), false);
assert.ok(live.includes("月度趋势"));
assert.ok(live.includes("质量数据"));
assert.ok(live.includes("朱从军-1至8月质量报告"));
assert.ok(live.includes("朱从军"));
assert.ok(/您好|谢谢/.test(live));
assert.equal(live.includes("见图，不在此"), false);
assert.ok(live.indexOf("问题分类") < live.indexOf("周度趋势"));
assert.ok(live.indexOf("周度趋势") < live.indexOf("月度趋势"));
assert.ok(live.includes("问题分类"));

assert.equal(needsRoleModelAnalysis("研发工程师", { rdQualityIssues: { count: 0 } }), false);
assert.equal(needsRoleModelAnalysis("研发工程师", { rdQualityIssues: { count: 23 } }), true);
assert.equal(needsRoleModelAnalysis("组装人员", { ipqcMetrics: { inspectedRecords: 12, badRecords: 0 } }), false);
assert.equal(needsRoleModelAnalysis("组装人员", { ipqcMetrics: { inspectedRecords: 12, badRecords: 3 } }), true);

const extracted = extractAnalysisMarkdown(`# 假报告
## 固定结果
| 指标 | 1 |
## 分析结论
端子漏标。
## 本月措施
| 措施 | 问题 | Owner | 完成日 | 验收 |
| 补孔位 | 销钉孔 | 邓海新 | 2026-09-26 | 漏标=0 |
## 下次报告复核点
- 复核孔位
## ECN变更活动
不要这段`);
assert.match(extracted, /分析结论/);
assert.match(extracted, /本月措施/);
assert.doesNotMatch(extracted, /ECN变更活动/);
assert.doesNotMatch(extracted, /固定结果/);

const stitched = stitchRoleReportParts({
  fixed: live,
  analysis: defaultAnalysisMarkdown({ skipped: true }),
  confirmedKnowledge: [{ documentName: "组装作业指导书", clauseNumber: "5.1" }],
});
assert.equal(hasTimeoutFallbackMarker(stitched), false);
assert.ok(stitched.includes("本期无质量问题。请继续保持。"));
assert.ok(stitched.includes("组装作业指导书"));

const fromSnapshot = buildFixedEvidenceRoleReport({
  role: "组装人员",
  recipient: "朱从军",
  period: { start: "2026-01-01", end: "2026-08-31" },
  evidence: {
    ipqcMetrics: { inspectedRecords: 0, badRecords: 0, goodRecords: 0, badRate: 0 },
    roleSnapshot: { metrics: { total: 449, bad: 48, good: 401, badRate: 10.69 }, categories: [{ name: "装配问题", count: 20 }] },
  },
});
assert.ok(fromSnapshot.includes("449"), "空的现场计数必须回退到角色快照");
assert.ok(fromSnapshot.includes("48"));
assert.ok(fromSnapshot.includes("装配问题"));

const retryable = (error) => /(?:429|502|503|504|524)|too many requests|rate limit|网关超时|gateway timeout|timed? ?out|service unavailable|bad gateway|network|failed to fetch/i.test(`${error?.message || ""} ${error || ""}`);
assert.equal(retryable(new Error("AI上游网关超时（524）：模型在网关等待时间内未返回。系统将使用精简上下文重试；已完成报告不会丢失。")), true);
assert.equal(retryable(new Error("已停止本次请求")), false);

assert.equal(actionTableRowCount(`## 本月措施
| 措施 | 针对的本人/下属问题（必须来自本期固定证据） | Owner | 完成日(YYYY-MM-DD) | 下次报告如何验收 |
`), 0);
assert.equal(actionTableRowCount(`## 本月措施
| 措施 | 问题 | Owner | 完成日 | 验收 |
|---|---|---|---|---|
| 补销钉孔标注 | ANT8铜块漏标 | 邓海新 | 2026-10-20 | 漏标=0 |
`), 1);
const brief = buildRoleAnalysisBrief("组装人员", {
  ipqcMetrics: { inspectedRecords: 12, badRecords: 3 },
  examples: [{ date: "2026-01-02", category: "装配问题", description: "漏装螺丝" }],
});
assert.equal(brief.examples[0].description, "漏装螺丝");
const filled = buildDeterministicAnalysisMarkdown({
  role: "组装人员",
  recipient: "朱从军",
  nextReviewDate: "2026-10-20",
  evidence: { examples: [
    { date: "2026-03-25", category: "装配问题", description: "漏装片针" },
    { date: "2026-03-26", category: "装配问题", description: "销钉敲过头" },
  ] },
});
assert.ok(actionTableRowCount(filled) >= 2);
assert.match(filled, /漏装片针/);
const kept = ensureActionTable(`## 分析结论\n针模装配缺当场确认。\n## 本月措施\n| 措施 | 问题 | Owner | 完成日 | 验收 |\n`, filled);
assert.match(kept, /针模装配缺当场确认/);
assert.ok(actionTableRowCount(kept) >= 2);
const fromTimeout = ensureActionTable("## 分析结论\n- 待核实：模型超时，未生成分析正文。", filled);
assert.doesNotMatch(fromTimeout, /模型超时/);
assert.equal(roleQualityStatus({ role: "组装人员", evidence: { ipqcMetrics: { inspectedRecords: 12, badRecords: 0 } } }), "good");
assert.equal(roleQualityStatus({ role: "组装人员", evidence: { ipqcMetrics: { inspectedRecords: 12, badRecords: 3 } } }), "attention");
const goodHi = buildReportSalutation({ role: "组装人员", recipient: "测试员", period: { start: "2026-08-01", end: "2026-08-31" }, evidence: { ipqcMetrics: { inspectedRecords: 10, badRecords: 0 } } });
assert.match(goodHi, /继续|再接再厉|不错|可控/);
const chanHi = buildReportSalutation({ role: "产总", recipient: "张总", period: { start: "2026-08-01", end: "2026-08-31" }, evidence: { matchedRows: 4 } });
assert.match(chanHi, /汇报|供审阅|供查阅/);
assert.doesNotMatch(chanHi, /请先查阅|抓重点|我们一起|请继续|给产品线质量撑了腰/);
assert.equal(chanHi.includes("张总总"), false);
console.log("role timeout fallback smoke test passed");
