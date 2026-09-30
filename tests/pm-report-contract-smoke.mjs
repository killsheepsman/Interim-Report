import fs from "node:fs";
import assert from "node:assert/strict";
import { buildDeterministicAnalysisMarkdown, buildFixedDataRoleReport, buildElonAcceptanceMessages, buildPmAiMessages, elonAcceptanceExcerpt, judgePmIssueTrend, parseElonAcceptance, judgeRdIssueTrend, pmAiAnalysisBroken, pmMaterialGap, pmParetoReasons, pmAcceptanceGaps, pmLessonsFromGaps, pmDraftCopiesLocked, repairPmAiAnalysis, selectPreviousRoleReport, stitchRoleReportParts } from "../src/agent/roleFixedEvidenceReport.js";

const months = ["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07"].map((label) => ({
  label, count: label === "2026-07" ? 42 : label === "2026-06" ? 20 : 8, selected: label === "2026-07",
}));
const judged = judgeRdIssueTrend(months, "2026-07-31", "问题");
assert.equal(judged.phrase.includes("月度不足"), false);
assert.match(judged.phrase, /7月/);

const evidence = {
  tpm: "王辉",
  teamMembers: [
    { name: "江冬林", bad: 36, issues: 36, ecnCount: 12, ecnMachinedCount: 8, nonBomCount: 2, nonBomMachinedCount: 1, reviewCount: 0, suggestions: 0 },
    { name: "张高雄", bad: 5, issues: 5, ecnCount: 3, ecnMachinedCount: 1, nonBomCount: 1, nonBomMachinedCount: 0, reviewCount: 1, suggestions: 0 },
  ],
  engineerMetrics: {
    ecnCount: 301, bomDenominator: 18705, ecnRate: 1.61,
    agentEcnLineCount: 15, agentNonBomLineCount: 3,
    ecnMachinedCount: 9, machinedBomDenominator: 15059, machinedEcnRate: 0.06,
    nonBomCount: 3, nonBomMachinedCount: 1, nonBomMachinedRate: 0.01,
    reviewParticipation: 1, reviewSuggestions: 0, projectCount: 14,
  },
  rdQualityIssues: {
    count: 42,
    categories: [{ name: "结构干涉", count: 14 }, { name: "设计缺陷", count: 9 }, { name: "基本尺寸错误(3D)", count: 6 }],
    examples: [
      { date: "2026-07-13", category: "结构干涉", description: "线体NG盘固定钣金需要开凹槽", engineer: "江冬林" },
      { date: "2026-07-20", category: "设计缺陷", description: "相机扫码范围不够", engineer: "张高雄" },
      { date: "2026-07-08", category: "基本尺寸错误(3D)", description: "导入行程不足", engineer: "江冬林" },
    ],
    periodTrend: { month: { rows: months } },
  },
  examples: [
    { date: "2026-07-13", category: "结构干涉", description: "线体NG盘固定钣金需要开凹槽", engineer: "江冬林" },
    { date: "2026-07-20", category: "设计缺陷", description: "相机扫码范围不够", engineer: "张高雄" },
    { date: "2026-07-08", category: "基本尺寸错误(3D)", description: "导入行程不足", engineer: "江冬林" },
  ],
  periodTrend: { month: { rows: months } },
};
const fixed = buildFixedDataRoleReport({ role: "PM", recipient: "申学梅", period: { _periodStart: "2026-07-01", _periodEnd: "2026-07-31" }, evidence });
assert.match(fixed, /301\/18,705|301\/18705/);
assert.match(fixed, /ECN物料行/);
assert.match(fixed, /人到了，没有留下改善项/);
assert.match(fixed, /不是上面的 ECN 条数/);
const analysis = buildDeterministicAnalysisMarkdown({ role: "PM", recipient: "申学梅", evidence, nextReviewDate: "2026-10-28", period: { _periodStart: "2026-07-01", _periodEnd: "2026-07-31" } });
assert.equal(analysis.includes("月度不足"), false);
assert.match(analysis, /江冬林/);
assert.match(analysis, /张高雄/);
assert.match(analysis, /结构干涉/);
assert.match(analysis, /设计缺陷/);
assert.doesNotMatch(analysis, /少于本期/);
assert.match(analysis, /数量上升/);
assert.match(analysis, /参与评审 1 次/);
assert.doesNotMatch(analysis, /你到场/);
assert.doesNotMatch(analysis, /请继续保持|还没到零|不良率/);

const shenMonths = [7, 1, 29, 7, 5, 2, 5].map((count, index) => ({ label: "2026-" + String(index + 1).padStart(2, "0"), count, bad: count, total: count, rate: 100 }));
const shenJudged = judgePmIssueTrend(shenMonths, "2026-07-31");
assert.equal(shenJudged.recentSum, 12);
assert.equal(shenJudged.prevSum, 37);
assert.match(shenJudged.phrase, /数量下降/);
assert.match(shenJudged.phrase, /尖峰在3月 29项/);
assert.match(shenJudged.phrase, /本月反弹/);
assert.doesNotMatch(shenJudged.phrase, /不良率|请继续保持|还没到零/);

const shenMembers = [
  ["张高雄", 5, 0, 31], ["张乐", 0, 221, 5], ["李越", 0, 68, 0], ["曾鑫", 0, 59, 0], ["肖国明", 0, 27, 37],
  ["韩志强", 0, 26, 0], ["魏嘉", 0, 24, 0], ["郭少杰", 0, 22, 0], ["陆佳伟", 0, 9, 0], ["汪海晨", 0, 4, 3],
  ["马鑫龙", 0, 1, 15], ["蒿德风", 0, 0, 1], ["江冬林", 0, 0, 3], ["姜红山", 0, 0, 29], ["苗建周", 0, 0, 1], ["唐宁先", 0, 0, 2],
].map(([name, issues, ecnCount, nonBomCount]) => ({ name, issues, bad: issues, ecnCount, nonBomCount }));
const shenEvidence = {
  tpm: "王辉",
  teamMembers: shenMembers,
  pmPeerRows: [
    { name: "申学梅", ecnCount: 301, ecnRate: 1.61, ecnDenominator: 18705 },
    { name: "王鹏", ecnCount: 20, ecnRate: 20, ecnDenominator: 100 },
  ],
  engineerMetrics: {
    ecnCount: 301, bomDenominator: 18705, ecnRate: 1.61,
    agentEcnLineCount: 485, agentNonBomLineCount: 144,
    ecnMachinedCount: 284, machinedBomDenominator: 15059, machinedEcnRate: 1.89,
    nonBomMachinedCount: 82, nonBomMachinedRate: 0.54,
    reviewParticipation: 1, reviewSuggestions: 0, projectCount: 14,
    ecnReasons: [{ name: "分批下单/多人协作下单", count: 85 }, { name: "BOM漏做", count: 103 }],
  },
  rdQualityIssues: {
    count: 5,
    categories: [{ name: "基本尺寸错误(3D)", count: 3 }, { name: "结构干涉", count: 2 }],
    examples: [
      { date: "2026-07-01", category: "基本尺寸错误(3D)", description: "针模模芯底部间隙大", engineer: "张高雄" },
      { date: "2026-07-01", category: "结构干涉", description: "压块避位加大", engineer: "张高雄" },
    ],
    periodTrend: { month: { rows: shenMonths } },
  },
};
shenMembers[0].reviewCount = 1;
shenEvidence.engineerMetrics.monthlyRates = [
  { label: "2026-01", ecnCount: 0, bomDenominator: 0, ecnRate: null },
  { label: "2026-06", ecnCount: 527, bomDenominator: 6616, ecnRate: 7.97 },
  { label: "2026-07", ecnCount: 301, bomDenominator: 18705, ecnRate: 1.61 },
];
const shenAnalysis = buildDeterministicAnalysisMarkdown({ role: "PM", recipient: "申学梅", evidence: shenEvidence, nextReviewDate: "2026-10-29", period: { _periodStart: "2026-07-01", _periodEnd: "2026-07-31" } });
const shenFixed = buildFixedDataRoleReport({ role: "PM", recipient: "申学梅", period: { _periodStart: "2026-07-01", _periodEnd: "2026-07-31" }, evidence: shenEvidence });
const shenReport = stitchRoleReportParts({ fixed: shenFixed, analysis: shenAnalysis, role: "PM" });
for (const forbidden of ["请继续保持", "还没到零", "不良率 100", "少于本期"]) assert.equal(shenReport.includes(forbidden), false, forbidden);
assert.match(shenAnalysis, /数量下降/);
assert.match(shenAnalysis, /尖峰在3月 29项/);
assert.match(shenAnalysis, /本月反弹/);
assert.match(shenAnalysis, /张乐/);
assert.match(shenAnalysis, /张高雄/);
assert.match(shenAnalysis, /差额 24/);
assert.match(shenAnalysis, /差额 17/);
assert.match(shenAnalysis, /分批下单 85 项不作为异常/);
assert.match(shenAnalysis, /所辖工程师张高雄参与评审 1 次/);
assert.doesNotMatch(shenAnalysis, /你到场/);
assert.match(shenAnalysis, /1月没有物料款数分母，不能记成 0%/);
assert.match(shenAnalysis, /分母从 6616 变为 18705/);
assert.match(pmMaterialGap([{ ecnCount: 1, ecnMachinedCount: 260, nonBomCount: 1, nonBomMachinedCount: 76 }], { ecn: 1, nonBom: 1, ecnMachined: 284, nonBomMachined: 82 }), /工程师ECN加工件加总 260，表头 284，差额 24/);
assert.match(pmMaterialGap([{ ecnCount: 1, ecnMachinedCount: 260, nonBomCount: 1, nonBomMachinedCount: 76 }], { ecn: 1, nonBom: 1, ecnMachined: 284, nonBomMachined: 82 }), /非BOM加工件加总 76，表头 82，差额 6/);
const actions = shenAnalysis.split("## 本月措施")[1] || "";
assert.ok(actions.indexOf("张乐") >= 0 && actions.indexOf("张乐") < actions.indexOf("张高雄"));
assert.doesNotMatch(actions, /请张乐[\s\S]{0,40}分批下单」/);
assert.deepEqual(pmParetoReasons(shenEvidence.engineerMetrics.ecnReasons).map((row) => row.name), ["BOM漏做"]);
assert.match(shenFixed, /分母不一致，本图不排名/);
assert.match(shenFixed, /差额 24/);
const quoted = "## 分析结论\n\n近三个月问题下降。不要写「请继续保持」。尖峰在3月，本月反弹，物料行集中在张乐。我们的目的是项目发布前把设计问题拦住。\n\n## 本月措施\n\n| 措施 | 针对的问题 | Owner | 完成日 | 验收 |\n|---|---|---|---|---|\n| 核对张乐的变更 | 张乐物料行最多 | 张乐 | 2026-10-29 | 出示清单 |\n";
assert.equal(pmAiAnalysisBroken(quoted), false);
assert.equal(pmAiAnalysisBroken("## 分析结论\n\n数量下降，请继续保持。尖峰在3月，本月仍有问题要处理。\n\n## 本月措施\n\n| 措施 | 问题 |\n|---|---|\n| 核对图纸 | 张乐物料行 |\n"), true);
const prose = "## 分析结论\n\n近三个月问题从37项降到12项，数量下降。尖峰在3月。本月相对上月反弹。物料行集中在张乐，图纸缺陷在张高雄。\n\n## 本月措施\n\n先处理张乐。";
const repaired = repairPmAiAnalysis(prose, shenAnalysis);
assert.match(repaired, /数量下降/);
assert.match(repaired, /张乐/);
assert.equal(pmAiAnalysisBroken(repaired), false);
const messages = buildPmAiMessages({ skill: "结论由固定函数写出，模型不得另起判断。\n正常生成和超时回退使用同一份结论。禁止另写一套判断。\n分批下单不作为异常。", recipient: "申学梅", period: { _periodStart: "2026-07-01", _periodEnd: "2026-07-31" }, nextReviewDate: "2026-10-29", lockedAnalysis: shenAnalysis });
assert.equal(messages[0].content.includes("不得另起判断"), false);
assert.match(messages[0].content, /禁止照抄锁定原句/);
assert.match(messages[0].content, /我们的目的是项目发布前把设计问题拦住/);
assert.match(messages[0].content, /物料行最多的工程师/);
assert.equal(messages[0].content.includes("Owner 写工程师或 PM"), false);
assert.match(messages[0].content, /没有更早周期/);
const named = repairPmAiAnalysis("## 分析结论\n\n近三个月从37项降到12项，数量下降。尖峰在3月，本月反弹。对照上一份，结构干涉未关闭。\n\n## 本月措施\n\n| 措施 | 针对的问题 | Owner | 完成日 | 验收 |\n|---|---|---|---|---|\n| 拆开物料行 | 张乐 221 行 | 工程师 | 2026-10-29 | 出示清单 |\n", shenAnalysis, { hasPrevious: false });
assert.match(named, /我们的目的是项目发布前把设计问题拦住/);
assert.equal(named.includes("对照上一份"), false);
assert.match(named, /\| 张乐 \|/);
assert.equal(/\| 工程师 \|/.test(named), false);
const earlier = selectPreviousRoleReport([
  { fileName: "same.md", recipient: "申学梅", role: "PM", module: "角色报告-PM", period: { _periodStart: "2026-07-01", _periodEnd: "2026-07-31" }, model: "fixed-code", savedAt: "2026-09-29T11:14:00" },
  { fileName: "june.md", recipient: "申学梅", role: "PM", module: "角色报告-PM", period: { _periodStart: "2026-06-01", _periodEnd: "2026-06-30" }, model: "ai-grok", savedAt: "2026-07-02T00:00:00" },
  { fileName: "other.md", recipient: "别人", role: "PM", module: "角色报告-PM", period: { _periodEnd: "2026-05-31" }, savedAt: "2026-06-02T00:00:00" },
], { recipient: "申学梅", role: "PM", period: { _periodStart: "2026-07-01", _periodEnd: "2026-07-31" } });
assert.equal(earlier.fileName, "june.md");
const skillText = fs.readFileSync(new URL("../src/agent/standards/elon-musk-perspective.md", import.meta.url), "utf8");
const excerpt = elonAcceptanceExcerpt(skillText);
assert.match(excerpt, /五步算法/);
assert.match(excerpt, /每条需求必须附上提出者的名字/);
assert.doesNotMatch(excerpt, /必须使用工具/);
const judgeMessages = buildElonAcceptanceMessages({ skill: skillText, role: "PM", recipient: "申学梅", period: { _periodStart: "2026-07-01", _periodEnd: "2026-07-31" }, locked: "张乐 221 行", draft: named, hasPrevious: false });
assert.match(judgeMessages[0].content, /elon-musk-perspective/);
const consultant = fs.readFileSync(new URL("../src/agent/standards/quality-consultant.md", import.meta.url), "utf8");
assert.match(elonAcceptanceExcerpt(consultant), /质量/);
const consultantMessages = buildElonAcceptanceMessages({ skill: consultant, skillName: "quality-consultant", role: "PM", recipient: "申学梅", draft: "正文", hasPrevious: false });
assert.match(consultantMessages[0].content, /quality-consultant/);
assert.doesNotMatch(consultantMessages[0].content, /elon-musk-perspective/);
assert.match(judgeMessages[0].content, /只输出 JSON/);
assert.equal(parseElonAcceptance('结论：{"pass":true}').pass, true);
assert.deepEqual(parseElonAcceptance('{"pass":false,"failures":["Owner 不是人名"]}').failures, ["Owner 不是人名"]);
const retryMessages = buildPmAiMessages({ recipient: "申学梅", period: { _periodStart: "2026-07-01" }, lockedAnalysis: "锁定", acceptanceFailures: ["Owner 写成了工程师"] });
assert.match(retryMessages[1].content, /重写/);
assert.match(retryMessages[1].content, /Owner 写成了工程师/);
assert.equal(pmDraftCopiesLocked(shenAnalysis, shenAnalysis), true);
assert.equal(repairPmAiAnalysis(shenAnalysis, shenAnalysis, { hasPrevious: false }), "");
const fresh = repairPmAiAnalysis("## 分析结论\n\n7月从6月的2项回到5项，反弹落在张高雄的针模模芯底部间隙大和压块避位加大。评审到场1次，改善项0，这两项图纸没有被拦住。张乐221行还没拆开设计错误。\n\n## 本月措施\n\n先关这两项。", shenAnalysis, { hasPrevious: false });
assert.match(fresh, /针模模芯底部间隙大/);
assert.match(fresh, /没有被拦住/);
assert.equal(fresh.includes("近三个月问题是"), false);
assert.deepEqual(pmAcceptanceGaps(shenAnalysis, shenAnalysis), []);
const thin = "## 分析结论\n\n7月5项，6月2项，本月反弹。反弹落在张高雄的基本尺寸错误(3D)和结构干涉。评审到场，却没有改善项。\n\n## 本月措施\n\n| 措施 | 针对的问题 | Owner | 完成日 | 验收 |\n|---|---|---|---|---|\n| 盯张高雄改尺寸 | 基本尺寸错误(3D) | 张高雄 | 2026-10-29 | 基本尺寸错误(3D)已关闭，并出示改后图纸 |\n| 盯张高雄消干涉 | 结构干涉 | 张高雄 | 2026-10-29 | 结构干涉已关闭，并出示改后图纸 |\n";
const gaps = pmAcceptanceGaps(thin, shenAnalysis);
assert.ok(gaps.some((item) => item.includes("张乐")));
assert.ok(gaps.some((item) => item.includes("针模模芯底部间隙大")));
const lessons = pmLessonsFromGaps(gaps);
assert.ok(lessons.some((item) => item.includes("现象原词")));
assert.ok(lessons.some((item) => item.includes("物料行最多")));
console.log("pm report contract passed");

