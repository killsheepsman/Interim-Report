import assert from "node:assert/strict";
import {
  classifiedCategoryTop,
  engineerRowsForPm,
  metricsFromRecords,
  monthlyRateRows,
  rankMetricRows,
  recordsForPm,
  reviewStatsForNames,
  rdIssuesForNames,
  buildPmDqaMetrics,
  buildPmPeerRows,
  dqaEcnSlice,
  dqaEcnSummaryRows,
  orgMappedPeople,
  isPlaceholderOrgName,
  machinedTotalsFromFiles,
  selectedRolePeriod,
  pmScopedEngineerNames,
  countTrendFromDates,
  peerRatesComparable,
  assembleTpmEvidence,
  buildTpmOqc,
  assembleDirectorEvidence,
  buildDirectorOqc,
} from "../src/agent/pmRoleEvidence.js";
import { buildDeterministicAnalysisMarkdown, buildFixedDataRoleReport, needsRoleModelAnalysis } from "../src/agent/roleFixedEvidenceReport.js";

const records = [
  { source: "ECN", pm: "申学梅", engineer: "韩小东", project: "A", date: "2026-07-10", isMachined: true, bomTotal: 100, bomMachinedTotal: 40, reason: "尺寸" },
  { source: "ECN", pm: "申学梅", engineer: "韩小东", project: "A", date: "2026-08-02", isMachined: false, bomTotal: 100, bomMachinedTotal: 40, reason: "分批下单" },
  { source: "非BOM", pm: "申学梅", engineer: "邓海新", project: "A", date: "2026-08-15", isMachined: true },
  { source: "ECN", pm: "别人", engineer: "张三", project: "B", date: "2026-08-01", isMachined: true, bomTotal: 50, bomMachinedTotal: 20 },
];
const mine = recordsForPm({ records }, "申学梅");
assert.equal(mine.length, 3);
const metrics = metricsFromRecords(mine);
assert.equal(metrics.ecnCount, 2);
assert.equal(metrics.ecnRate, 2);
assert.equal(metrics.machinedEcnRate, 2.5);
assert.equal(metrics.nonBomMachinedRate, 2.5);

const monthly = monthlyRateRows(mine, {}, { start: "2026-07-01", end: "2026-08-31", _periodStart: "2026-07-01", _periodEnd: "2026-08-31" });
assert.equal(monthly.length, 8);
assert.equal(monthly[6].label, "2026-07");
assert.equal(monthly[6].selected, true);
assert.equal(monthly[6].ecnCount, 1);
assert.equal(monthly[7].label, "2026-08");
assert.equal(monthly[7].selected, true);
assert.equal(monthly[0].selected, false);

const issues = rdIssuesForNames([
  { 工程师: "韩小东", 问题描述: "干涉", 问题分类: "结构干涉", 日期: "2026-08-03" },
  { 工程师: "韩小东", 问题描述: "缺孔", 问题分类: "未分类", 日期: "2026-08-04" },
  { 工程师: "张三", 问题描述: "别人的", 问题分类: "设计缺陷", 日期: "2026-08-04" },
], ["韩小东"], { start: "2026-07-01", end: "2026-08-31" });
assert.equal(issues.count, 2);
assert.deepEqual(classifiedCategoryTop(issues.categories).map((item) => item.name), ["结构干涉"]);

const engineers = engineerRowsForPm({ records: mine, dqaRows: [{ 工程师: "韩小东", 问题描述: "干涉", 问题分类: "结构干涉", 日期: "2026-08-03" }], range: { start: "2026-07-01", end: "2026-08-31" } });
assert.equal(engineers.length, 2);
assert.equal(engineers[0].name, "韩小东");
assert.equal(engineers[0].issues, 1);

const review = reviewStatsForNames([
  { updateDate: "2026-08-01", members: ["韩小东", "邓海新"], proposers: ["韩小东"] },
  { updateDate: "2026-08-20", members: ["韩小东"], proposers: [] },
  { updateDate: "2026-08-20", members: ["张三"], proposers: ["张三"] },
], ["韩小东", "邓海新"], { start: "2026-07-01", end: "2026-08-31" });
assert.equal(review.reviewCount, 2);
assert.equal(review.suggestions, 1);

const ranked = rankMetricRows([
  ...Array.from({ length: 14 }, (_, index) => ({ name: `PM${index + 1}`, issueCount: 20 - index })),
  { name: "申学梅", issueCount: 3, focus: true },
], "issueCount", "申学梅", 12);
assert.equal(ranked.length, 12);
assert.equal(ranked.at(-1).name, "申学梅");
assert.match(ranked.at(-1).label, /第15\/15名/);

console.log("pm role evidence smoke passed");

const dqaLike = [
  { 发生日期: new Date("2026-07-01T15:59:17.000Z"), 问题描述: "针模模芯底部间隙大", 问题分类: "基本尺寸错误(3D)", 责任人: "张高雄", PM: "申学梅", TPM: "王辉" },
  { 发生日期: new Date("2026-08-10T15:59:17.000Z"), 问题描述: "干涉", 类别: "结构干涉", 责任人: "张乐", PM: "申学梅", TPM: "王辉" },
  { 发生日期: new Date("2026-02-01T15:59:17.000Z"), 问题描述: "不在周期", 问题分类: "设计缺陷", 责任人: "张乐", PM: "申学梅", TPM: "王辉" },
  { 发生日期: new Date("2026-07-15T15:59:17.000Z"), 问题描述: "别人的", 问题分类: "设计缺陷", 责任人: "廖旗", PM: "梁凯乐", TPM: "王辉" },
];
const shenIssues = rdIssuesForNames(dqaLike, [], { start: "2026-07-01", end: "2026-08-31" }, "申学梅");
assert.equal(shenIssues.count, 2);
assert.equal(shenIssues.categories.some((item) => item.name === "结构干涉"), true);
console.log("dqa PM-column issue matching passed");

const dqaFiles = [{
  module: "DQA",
  subKind: "DQA_ECN",
  name: "2025-2026年ECN汇总 - 1~8月份.xlsx",
  rows: [
    ...Array.from({ length: 301 }, () => ({ __sheet: "ECN（分子）", 申请日期: "2026-07-10", PM: "申学梅" })),
    ...Array.from({ length: 294 }, () => ({ __sheet: "ECN（分子）", 申请日期: "2026-08-10", PM: "申学梅" })),
    { __sheet: "ECN（分母）", 制单日期: "2026-07-10", PM: "申学梅", 物料款数: 18705 },
    { __sheet: "ECN（分母）", 制单日期: "2026-08-10", PM: "申学梅", 物料款数: 9096 },
    { __sheet: "ECN（分子）", 申请日期: "2026-07-10", PM: "别人" },
    { __sheet: "ECN（分母）", 制单日期: "2026-07-10", PM: "别人", 物料款数: 1000 },
  ],
}, {
  module: "DQA",
  subKind: "DQA_ECN",
  name: "ECN查询导出 (原始数据).xlsx",
  rows: Array.from({ length: 50 }, () => ({ 申请日期: "2026-07-01", PM: "申学梅" })),
}, {
  module: "DQA",
  subKind: "DQA_MACHINED_PARTS",
  name: "2026年加工件数量比例 - 1~8月份.xlsx",
  rows: [
    { 产品部: "加工件总数", 年份: 2026, 月份: 7, 数量: 15059, __partKind: "ECN" },
    { 产品部: "加工件总数", 年份: 2026, 月份: 8, 数量: 17899, __partKind: "ECN" },
    { 产品部: "加工件总数", 年份: 2026, 月份: 7, 数量: 15059, __partKind: "非BOM" },
    { 产品部: "加工件总数", 年份: 2026, 月份: 8, 数量: 17899, __partKind: "非BOM" },
  ],
}];
const queryExportOnly = dqaEcnSummaryRows(dqaFiles.filter((file) => /查询导出/.test(file.name)));
assert.equal(queryExportOnly.length, 0);

const july = dqaEcnSlice(dqaEcnSummaryRows(dqaFiles), "申学梅", { start: "2026-07-01", end: "2026-07-31" });
assert.equal(july.ecnCount, 301);
assert.equal(july.materialCount, 18705);
assert.equal(july.ecnRate, 1.61);

const period = { start: "2026-07-01", end: "2026-08-31", _periodStart: "2026-07-01", _periodEnd: "2026-08-31" };
const dqaMetrics = buildPmDqaMetrics({
  agentRecords: [
    { source: "ECN", pm: "申学梅", engineer: "韩小东", project: "A", date: "2026-07-10", isMachined: true, bomTotal: 19661, bomMachinedTotal: 9163 },
    { source: "ECN", pm: "申学梅", engineer: "韩小东", project: "A", date: "2026-08-02", isMachined: true, bomTotal: 19661, bomMachinedTotal: 9163 },
    { source: "非BOM", pm: "申学梅", engineer: "邓海新", project: "A", date: "2026-08-15", isMachined: true },
  ],
  files: dqaFiles,
  pm: "申学梅",
  range: period,
});
assert.equal(dqaMetrics.rateSource, "dqa");
assert.equal(dqaMetrics.ecnCount, 595);
assert.equal(dqaMetrics.bomDenominator, 27801);
assert.equal(dqaMetrics.ecnRate, 2.14);
assert.equal(dqaMetrics.machinedBomDenominator, 32958);
assert.equal(dqaMetrics.machinedEcnRate, Number(((2 / 32958) * 100).toFixed(2)));
assert.equal(dqaMetrics.monthlyRates.length, 8);
assert.equal(dqaMetrics.monthlyRates[0].label, "2026-01");
assert.equal(dqaMetrics.monthlyRates[0].selected, false);
assert.equal(dqaMetrics.monthlyRates[6].label, "2026-07");
assert.equal(dqaMetrics.monthlyRates[6].selected, true);
assert.equal(dqaMetrics.monthlyRates[6].ecnCount, 301);
assert.equal(dqaMetrics.monthlyRates[6].bomDenominator, 18705);
assert.equal(dqaMetrics.monthlyRates[6].ecnRate, 1.61);
assert.equal(dqaMetrics.monthlyRates[7].ecnCount, 294);
assert.equal(dqaMetrics.monthlyRates[7].bomDenominator, 9096);
assert.equal(dqaMetrics.monthlyRates[7].ecnRate, 3.23);

const excelJuly = dqaEcnSlice([
  { __sheet: "ECN（分子）", 申请日期: new Date(Date.UTC(2026, 5, 30, 15, 59, 17)), PM: "申学梅" },
  { __sheet: "ECN（分母）", 制单日期: new Date(Date.UTC(2026, 5, 30, 15, 59, 17)), PM: "申学梅", 物料款数: 100 },
], "申学梅", { start: "2026-07-01", end: "2026-07-31" });
assert.equal(excelJuly.ecnCount, 1);
assert.equal(excelJuly.materialCount, 100);

const peers = buildPmPeerRows({
  metrics: { records: [{ source: "ECN", pm: "申学梅", engineer: "韩小东", date: "2026-07-10", isMachined: true }] },
  files: dqaFiles,
  range: period,
  currentPm: "申学梅",
  allowedPms: ["申学梅"],
});
const shen = peers.find((row) => row.name === "申学梅");
assert.equal(shen.ecnCount, 595);
assert.equal(shen.ecnRate, 2.14);
console.log("dqa formula uses 物料款数 and 加工件总数 passed");

assert.equal(isPlaceholderOrgName("其他"), true);
assert.equal(isPlaceholderOrgName("待配置"), true);
assert.equal(isPlaceholderOrgName("申学梅"), false);
const mapped = orgMappedPeople([
  { pm: "申学梅", tpm: "王辉", active: true },
  { pm: "胡威长", tpm: "王辉", active: true },
  { pm: "其他", tpm: "王辉", active: true },
  { pm: "陈泉福", tpm: "王辉", active: false },
  { pm: "罗超", tpm: "王辉", active: true },
], ["pm", "PM"]);
assert.deepEqual([...mapped].sort(), ["申学梅", "胡威长", "罗超"].sort());
assert.equal(mapped.includes("陈泉福"), false);

const mappedPeers = buildPmPeerRows({
  metrics: { records: [{ source: "ECN", pm: "别人", engineer: "韩小东", date: "2026-07-10", isMachined: true }] },
  files: dqaFiles,
  range: period,
  currentPm: "申学梅",
  allowedPms: mapped,
});
assert.equal(mappedPeers.some((row) => row.name === "别人"), false);
assert.equal(mappedPeers.some((row) => row.name === "陈泉福"), false);
const shenPeer = mappedPeers.find((row) => row.name === "申学梅");
assert.equal(shenPeer.ecnCount, 595);
assert.equal(shenPeer.ecnRate, 2.14);
assert.ok(mappedPeers.every((row) => row.ecnRate == null || row.ecnRate < 15));
console.log("org mapping filters miswritten PM names");

const companyOnly = buildPmDqaMetrics({
  agentRecords: [
    { source: "ECN", pm: "申学梅", engineer: "韩小东", project: "A", date: "2026-08-02", isMachined: true, bomTotal: 19661, bomMachinedTotal: 1265 },
  ],
  files: dqaFiles.filter((file) => file.subKind === "DQA_ECN"),
  machinedParts: {
    ecn: { monthly: [{ name: "7月", month: 7, y2026Qty: 15059 }, { name: "8月", month: 8, y2026Qty: 17899 }] },
    nonBom: { monthly: [{ name: "7月", month: 7, y2026Qty: 15059 }, { name: "8月", month: 8, y2026Qty: 17899 }] },
  },
  pm: "申学梅",
  range: period,
});
assert.equal(companyOnly.machinedBomDenominator, 32958);
assert.equal(companyOnly.machinedEcnRate, Number(((1 / 32958) * 100).toFixed(2)));
assert.notEqual(companyOnly.machinedEcnRate, Number(((1 / 1265) * 100).toFixed(2)));

const hiddenTotals = machinedTotalsFromFiles([{
  module: "DQA",
  subKind: "DQA_MACHINED_PARTS",
  name: "2026年加工件数量比例.xlsx",
  rows: [{ __division: "加工件总数", __year: 2026, __month: 8, __quantity: 17899, __partKind: "ECN" }],
}]);
assert.equal(hiddenTotals.ecn["2026-08"], 17899);

const team = engineerRowsForPm({
  records: [{ source: "ECN", pm: "申学梅", engineer: "魏嘉", date: "2026-08-02", isMachined: true }],
  allRecords: [
    { source: "ECN", pm: "申学梅", engineer: "魏嘉", date: "2026-08-02", isMachined: true },
    { source: "ECN", pm: "申学梅", engineer: "江冬林", date: "2026-08-10", isMachined: true },
    { source: "ECN", pm: "别人", engineer: "刘连付", date: "2026-08-10", isMachined: true },
  ],
  pm: "申学梅",
  extraNames: ["刘连付", "魏嘉"],
  range: { start: "2026-08-01", end: "2026-08-31" },
});
assert.equal(team.find((row) => row.name === "刘连付").ecnCount, 0);
assert.equal(team.find((row) => row.name === "魏嘉").ecnCount, 1);
assert.equal(team.find((row) => row.name === "江冬林").ecnCount, 1);
assert.equal(team.reduce((sum, row) => sum + row.ecnCount, 0), 2);
console.log("engineer ECN stays inside this PM");

const mixed = selectedRolePeriod({ start: "2026-01-01", end: "2026-08-31", _periodStart: "2026-08-01", _periodEnd: "2026-08-31" });
assert.equal(mixed.start, "2026-08-01");
assert.equal(mixed.end, "2026-08-31");
const augustOnly = buildPmDqaMetrics({
  agentRecords: [
    { source: "ECN", pm: "申学梅", engineer: "韩小东", project: "A", date: "2026-08-02", isMachined: true, bomTotal: 19661, bomMachinedTotal: 1265 },
  ],
  files: dqaFiles,
  pm: "申学梅",
  range: mixed,
});
assert.equal(augustOnly.ecnCount, 294);
assert.equal(augustOnly.bomDenominator, 9096);
assert.equal(augustOnly.ecnRate, 3.23);
assert.equal(augustOnly.machinedBomDenominator, 17899);
assert.equal(augustOnly.machinedEcnRate, Number(((1 / 17899) * 100).toFixed(2)));
assert.notEqual(augustOnly.machinedEcnRate, Number(((1 / 1265) * 100).toFixed(2)));
console.log("selectedRolePeriod prefers role picker dates");

const julyRoster = { start: "2026-07-01", end: "2026-07-31", _periodStart: "2026-07-01", _periodEnd: "2026-07-31" };
const expected = ["肖国明","张乐","张高雄","汪海晨","江冬林","赵彪","唐宁先","马鑫龙","蒿德风","苗建周","姜红山","刘洋","李越","曾鑫","魏嘉","郭少杰"];
const issueRows = [
  { 问题描述: "干涉", 问题分类: "结构干涉", 发生日期: "2026-07-13", PM: "申学梅", 责任人: "江冬林" },
  { 问题描述: "尺寸", 问题分类: "基本尺寸错误(3D)", 发生日期: "2026-07-02", PM: "申学梅", 责任人: "张高雄" },
  { 问题描述: "别人的", 问题分类: "设计缺陷", 发生日期: "2026-07-02", PM: "别人", 责任人: "蓝承超" },
  { 问题描述: "没有日期", 问题分类: "设计缺陷", PM: "申学梅", 责任人: "郭妙龙" },
  { 问题描述: "上个月", 问题分类: "设计缺陷", 发生日期: "2026-06-30", PM: "申学梅", 责任人: "刘健" },
];
const agentRows = expected.map((name) => ({ source: "ECN", pm: "申学梅", engineer: name, date: "2026-07-10" }));
agentRows.push({ source: "ECN", pm: "别人", engineer: "蓝承超", date: "2026-07-10" });
agentRows.push({ source: "ECN", pm: "申学梅", engineer: "郭妙龙", date: "" });
const roster = pmScopedEngineerNames({ dqaRows: issueRows, records: agentRows, pm: "申学梅", range: julyRoster });
assert.deepEqual([...roster].sort(), [...expected].sort());
const scopedIssues = rdIssuesForNames(issueRows, [], julyRoster, "申学梅");
assert.equal(scopedIssues.count, 2);
const personIssues = rdIssuesForNames(issueRows, ["江冬林"], julyRoster, "申学梅");
assert.equal(personIssues.count, 1);
const crossed = rdIssuesForNames([
  ...issueRows,
  { 问题描述: "交叉使用", 问题分类: "结构干涉", 发生日期: "2026-07-15", PM: "梁凯乐", 责任人: "江冬林" },
], ["江冬林"], julyRoster, "申学梅");
assert.equal(crossed.count, 1);
console.log("issues written to another PM stay with that PM");

const reviewStageRows = [
  { 问题描述: "生产问题", 问题分类: "结构干涉", 发生日期: "2026-07-02", PM: "申学梅", 责任人: "张高雄", 阶段: "生产" },
  { 问题描述: "评审里记的", 问题分类: "结构干涉", 发生日期: "2026-07-03", PM: "申学梅", 责任人: "只在评审阶段", 阶段: "评审" },
  { 问题描述: "公司内部", 问题分类: "设计缺陷", 发生日期: "2026-07-04", PM: "申学梅", 责任人: "张乐", 阶段: "公司内部" },
  { 问题描述: "售后问题", 问题分类: "设计缺陷", 发生日期: "2026-07-05", PM: "申学梅", 责任人: "江冬林", 阶段: "售后" },
];
const withoutReviewStage = rdIssuesForNames(reviewStageRows, [], julyRoster, "申学梅");
assert.equal(withoutReviewStage.count, 3);
assert.equal(withoutReviewStage.rows.some((row) => row["责任人"] === "只在评审阶段"), false);
const reviewStageRoster = pmScopedEngineerNames({ dqaRows: reviewStageRows, records: [], pm: "申学梅", range: julyRoster });
assert.equal(reviewStageRoster.includes("只在评审阶段"), false);
assert.deepEqual([...reviewStageRoster].sort(), ["张乐", "张高雄", "江冬林"].sort());
const reviewTeam = engineerRowsForPm({
  records: [
    { source: "ECN", pm: "申学梅", engineer: "张高雄", date: "2026-07-10", isMachined: false },
    { source: "ECN", pm: "申学梅", engineer: "只在评审阶段", date: "2026-07-10", isMachined: false },
  ],
  pm: "申学梅",
  dqaRows: reviewStageRows,
  reviewRecords: [{ updateDate: "2026-07-08", members: ["张高雄"], proposers: ["张高雄"] }],
  range: julyRoster,
});
assert.equal(reviewTeam.find((row) => row.name === "只在评审阶段").issues, 0);
assert.equal(reviewTeam.find((row) => row.name === "张高雄").issues, 1);
assert.equal(reviewTeam.find((row) => row.name === "张高雄").reviewCount, 1);
assert.equal(reviewTeam.find((row) => row.name === "只在评审阶段").reviewCount, 0);
const reviewPeers = buildPmPeerRows({
  metrics: { records: [] },
  dqaRows: reviewStageRows,
  range: julyRoster,
  currentPm: "申学梅",
  allowedPms: ["申学梅"],
});
assert.equal(reviewPeers[0].issueCount, 3);
console.log("review-stage rows stay out of PM issue counts");

const yearRows = [
  { 问题描述: "三月", 问题分类: "结构干涉", 发生日期: "2026-03-10", PM: "申学梅", 责任人: "张高雄" },
  { 问题描述: "七月", 问题分类: "结构干涉", 发生日期: "2026-07-02", PM: "申学梅", 责任人: "张高雄" },
  { 问题描述: "别人的三月", 问题分类: "结构干涉", 发生日期: "2026-03-10", PM: "梁凯乐", 责任人: "江冬林" },
];
const yearIssues = rdIssuesForNames(yearRows, [], { start: "2026-01-01", end: "2026-07-31" }, "申学梅");
assert.equal(yearIssues.count, 2);
const trend = countTrendFromDates(yearIssues.rows.map((row) => row["发生日期"]), { start: "2026-01-01", end: "2026-07-31", _periodStart: "2026-07-01", _periodEnd: "2026-07-31" }, "month");
assert.equal(trend.rows.find((row) => row.label === "2026-03").count, 1);
assert.equal(trend.rows.find((row) => row.label === "2026-01").count, 0);
assert.equal(trend.rows.find((row) => row.label === "2026-07").count, 1);
assert.equal(trend.rows.find((row) => row.label === "2026-07").selected, true);
assert.equal(trend.rows.find((row) => row.label === "2026-03").selected, false);
console.log("year trend keeps earlier months");

assert.equal(peerRatesComparable([
  { ecnCount: 301, ecnRate: 1.61, ecnDenominator: 18705 },
  { ecnCount: 20, ecnRate: 20, ecnDenominator: 100 },
], { valueKey: "ecnRate", denomKey: "ecnDenominator" }), false);
assert.equal(peerRatesComparable([
  { ecnCount: 301, ecnRate: 1.61, ecnDenominator: 18705 },
  { ecnCount: 20, ecnRate: 0.11, ecnDenominator: 18705 },
], { valueKey: "ecnRate", denomKey: "ecnDenominator" }), true);
console.log("peer denominator guard passed");

const unnamed = engineerRowsForPm({
  records: [
    { source: "ECN", pm: "申学梅", engineer: "张乐", date: "2026-07-10", isMachined: true },
    { source: "ECN", pm: "申学梅", engineer: "", date: "2026-07-11", isMachined: true },
    { source: "ECN", pm: "申学梅", engineer: "张乐(0101)", date: "2026-07-12", isMachined: false },
  ],
  pm: "申学梅",
  range: { start: "2026-07-01", end: "2026-07-31", _periodStart: "2026-07-01", _periodEnd: "2026-07-31" },
});
assert.equal(unnamed.find((row) => row.name === "张乐").ecnCount, 2);
assert.equal(unnamed.find((row) => row.name === "未填写创建人").ecnCount, 1);
assert.equal(unnamed.reduce((sum, row) => sum + row.ecnCount, 0), 3);
console.log("blank creator stays in the engineer total");

const tpmMappings = [
  { active: true, tpm: "朱慧慧", pm: "李纯杰", productionDirector: "李光明" },
  { active: true, tpm: "朱慧慧", pm: "田毅", productionDirector: "李光明" },
  { active: true, tpm: "王辉", pm: "申学梅", productionDirector: "李光明" },
];
const tpmIssues = [
  { 问题描述: "间隙", 问题分类: "结构干涉", 发生日期: "2026-07-02", PM: "李纯杰", 阶段: "生产" },
  { 问题描述: "评审意见", 问题分类: "结构干涉", 发生日期: "2026-07-03", PM: "李纯杰", 阶段: "评审" },
  { 问题描述: "别人的", 问题分类: "设计缺陷", 发生日期: "2026-07-04", PM: "申学梅", TPM: "朱慧慧", 阶段: "生产" },
];
const tpmRecords = [
  { source: "ECN", pm: "李纯杰", engineer: "甲", project: "A", date: "2026-07-10", isMachined: true, reason: "尺寸" },
  { source: "ECN", pm: "田毅", engineer: "乙", project: "B", date: "2026-07-11", isMachined: false, reason: "分批下单" },
  { source: "ECN", pm: "申学梅", engineer: "丙", project: "C", date: "2026-07-12", isMachined: true, reason: "尺寸" },
];
const tpmFiles = [{
  module: "DQA", subKind: "DQA_ECN", name: "2025-2026年ECN汇总 - 1~8月份.xlsx",
  rows: [
    { __sheet: "ECN（分子）", 申请日期: "2026-07-10", PM: "李纯杰" },
    { __sheet: "ECN（分子）", 申请日期: "2026-07-10", PM: "田毅" },
    { __sheet: "ECN（分子）", 申请日期: "2026-07-10", PM: "申学梅" },
    { __sheet: "ECN（分母）", 制单日期: "2026-07-10", PM: "李纯杰", 物料款数: 1000 },
    { __sheet: "ECN（分母）", 制单日期: "2026-07-10", PM: "田毅", 物料款数: 2000 },
    { __sheet: "ECN（分母）", 制单日期: "2026-07-10", PM: "申学梅", 物料款数: 18705 },
  ],
}, {
  module: "DQA", subKind: "DQA_MACHINED_PARTS", name: "2026年加工件数量比例 - 1~8月份.xlsx",
  rows: [{ 产品部: "加工件总数", 年份: 2026, 月份: 7, 数量: 15059, __partKind: "ECN" }],
}];
const tpmRange = { start: "2026-07-01", end: "2026-07-31", _periodStart: "2026-07-01", _periodEnd: "2026-07-31" };
const tpmBundle = assembleTpmEvidence({
  tpm: "朱慧慧", mappings: tpmMappings, dqaRows: tpmIssues, records: tpmRecords, files: tpmFiles,
  reviewRecords: [{ updateDate: "2026-07-08", members: ["甲"], proposers: ["甲"] }], range: tpmRange,
});
assert.equal(tpmBundle.issueRows.length, 1);
assert.equal(tpmBundle.issueRows[0]["问题描述"], "间隙");
assert.deepEqual([...tpmBundle.pms].sort(), ["李纯杰", "田毅"].sort());
assert.equal(tpmBundle.metrics.ecnCount, 2);
assert.equal(tpmBundle.metrics.bomDenominator, 3000);
assert.equal(tpmBundle.metrics.ecnMachinedCount, 1);
assert.equal(tpmBundle.metrics.machinedBomDenominator, 15059);
assert.equal(tpmBundle.director, "李光明");
assert.equal(tpmBundle.metrics.reviewParticipation, 1);
assert.equal(tpmBundle.peerRows.find((row) => row.name === "朱慧慧").issueCount, 1);
assert.equal(tpmBundle.peerRows.find((row) => row.name === "朱慧慧").machinedDenominator, 15059);
assert.equal(tpmBundle.peerRows.find((row) => row.name === "王辉").issueCount, 1);
console.log("tpm scope follows mapped PMs");

const oqcFiles = [{
  module: "OQC",
  kind: "OQC_MONTHLY_SUMMARY",
  name: "2025年-2026年评分按月汇总.xlsx",
  rows: [
    { 年份: 2026, 月份: 7, 产品部: "FPC事业部", TPM: "朱慧慧", 评分档位: 5, 数量: 2 },
    { 年份: 2026, 月份: 7, 产品部: "FPC事业部", TPM: "朱慧慧", 评分档位: 3, 数量: 1 },
    { 年份: 2026, 月份: 3, 产品部: "FPC事业部", TPM: "朱慧慧", 评分档位: 5, 数量: 1 },
    { 年份: 2026, 月份: 7, 产品部: "产品五部", TPM: "王辉", 评分档位: 4, 数量: 1 },
    { 年份: 2026, 月份: 7, 产品部: "__总计__", TPM: "__总计__", 评分档位: 5, 数量: 9 },
  ],
}, {
  module: "OQC",
  kind: "OQC_SHIPMENT_DETAIL",
  rows: [
    { 日期: "2026-07-12", 产品部: "FPC事业部", TPM: "朱慧慧", 机台分类: "组件", 机台数量: 1, 最终评分: 10 },
  ],
}];
const oqc = buildTpmOqc({ files: oqcFiles, tpm: "朱慧慧", range: { start: "2026-07-01", end: "2026-07-31", _periodStart: "2026-07-01", _periodEnd: "2026-07-31" } });
assert.equal(oqc.count, 3);
assert.equal(oqc.five, 2);
assert.equal(oqc.low, 1);
assert.equal(oqc.avg, 4.33);
assert.equal(oqc.fiveRate, 66.7);
assert.equal(oqc.lowRate, 33.3);
assert.equal(oqc.monthly.find((row) => row.label === "2026-03").count, 1);
assert.equal(oqc.monthly.find((row) => row.label === "2026-03").selected, false);
assert.equal(oqc.monthly.find((row) => row.label === "2026-07").selected, true);
assert.equal(oqc.monthly.find((row) => row.label === "2026-01").count, 0);
assert.equal(oqc.peers.find((row) => row.name === "王辉").fiveRate, 0);
assert.equal(oqc.peers.find((row) => row.name === "王辉").avg, 4);
console.log("tpm oqc shipment");

const earlierMachined = assembleTpmEvidence({
  tpm: "朱慧慧",
  mappings: [{ active: true, tpm: "朱慧慧", pm: "李纯杰", productionDirector: "李光明" }],
  dqaRows: [],
  records: [
    { source: "ECN", pm: "李纯杰", engineer: "甲", project: "A", date: "2026-03-10", isMachined: true, reason: "尺寸" },
    { source: "ECN", pm: "李纯杰", engineer: "甲", project: "A", date: "2026-07-10", isMachined: true, reason: "尺寸" },
    { source: "ECN", pm: "李纯杰", engineer: "甲", project: "A", date: "2026-07-12", isMachined: false, reason: "尺寸" },
    { source: "非BOM", pm: "李纯杰", engineer: "甲", project: "A", date: "2026-03-12", isMachined: true },
    { source: "非BOM", pm: "李纯杰", engineer: "甲", project: "A", date: "2026-07-11", isMachined: false },
  ],
  files: [{
    module: "DQA", subKind: "DQA_MACHINED_PARTS", name: "2026年加工件数量比例.xlsx",
    rows: [
      { 产品部: "加工件总数", 年份: 2026, 月份: 3, 数量: 100, __partKind: "ECN" },
      { 产品部: "加工件总数", 年份: 2026, 月份: 7, 数量: 200, __partKind: "ECN" },
    ],
  }],
  range: { start: "2026-07-01", end: "2026-07-31", _periodStart: "2026-07-01", _periodEnd: "2026-07-31" },
});
assert.equal(earlierMachined.metrics.ecnMachinedCount, 1);
assert.equal(earlierMachined.metrics.ecnStandardCount, 1);
assert.equal(earlierMachined.metrics.nonBomStandardCount, 1);
assert.equal(earlierMachined.metrics.monthlyRates.find((row) => row.label === "2026-03").ecnMachinedCount, 1);
assert.equal(earlierMachined.metrics.monthlyRates.find((row) => row.label === "2026-03").nonBomMachinedCount, 1);
assert.notEqual(earlierMachined.metrics.monthlyRates.find((row) => row.label === "2026-03").machinedEcnRate, 0);
console.log("tpm monthly machined keeps earlier months");

const capped = buildTpmOqc({
  files: [{ module: "OQC", kind: "OQC_MONTHLY_SUMMARY", name: "2025年-2026年评分按月汇总.xlsx", rows: [
    { 年份: 2026, 月份: 7, 产品部: "FPC事业部", TPM: "王辉", 评分档位: 5, 数量: 1 },
    { 年份: 2026, 月份: 7, 产品部: "FPC事业部", TPM: "王辉", 评分档位: 4, 数量: 1 },
  ]}, {
    module: "OQC", kind: "OQC_SHIPMENT_DETAIL", rows: [
      { 日期: "2026-07-12", 产品部: "FPC事业部", TPM: "王辉", 机台分类: "组件", 机台数量: 1, 最终评分: 10 },
    ],
  }],
  tpm: "王辉",
  range: { start: "2026-07-01", end: "2026-07-31", _periodStart: "2026-07-01", _periodEnd: "2026-07-31" },
});
assert.equal(capped.count, 2);
assert.equal(capped.avg, 4.5);
assert.ok(capped.avg <= 5);
console.log("score above 5 is not a score");


const directorMappings = [
  { active: true, productDept: "FPC事业部", tpm: "王辉", pm: "申学梅", productionDirector: "李光明" },
  { active: true, productDept: "FPC事业部", tpm: "朱慧慧", pm: "李纯杰", productionDirector: "李光明" },
  { active: true, productDept: "产品五部", tpm: "郑昊翔", pm: "别人", productionDirector: "陈中成" },
];
const directorIssues = [
  { 问题描述: "间隙", 问题分类: "结构干涉", 发生日期: "2026-07-02", PM: "申学梅", 阶段: "生产" },
  { 问题描述: "导柱不到位", 问题分类: "装配干涉", 发生日期: "2026-07-06", PM: "李纯杰", 阶段: "生产" },
  { 问题描述: "评审意见", 问题分类: "结构干涉", 发生日期: "2026-07-03", PM: "李纯杰", 阶段: "评审" },
  { 问题描述: "别人的问题", 问题分类: "设计缺陷", 发生日期: "2026-07-04", PM: "别人", 阶段: "生产" },
];
const directorRange = { start: "2026-07-01", end: "2026-07-31", _periodStart: "2026-07-01", _periodEnd: "2026-07-31" };
const directorOqcFiles = [{
  module: "OQC",
  kind: "OQC_MONTHLY_SUMMARY",
  name: "2025年-2026年评分按月汇总.xlsx",
  rows: [
    { 年份: 2026, 月份: 7, 产品部: "FPC事业部", TPM: "王辉", 评分档位: 5, 数量: 2 },
    { 年份: 2026, 月份: 7, 产品部: "FPC事业部", TPM: "王辉", 评分档位: 4, 数量: 1 },
    { 年份: 2026, 月份: 3, 产品部: "FPC事业部", TPM: "王辉", 评分档位: 5, 数量: 1 },
    { 年份: 2026, 月份: 7, 产品部: "FPC事业部", TPM: "朱慧慧", 评分档位: 5, 数量: 1 },
    { 年份: 2026, 月份: 7, 产品部: "产品五部", TPM: "郑昊翔", 评分档位: 3, 数量: 2 },
    { 年份: 2026, 月份: 7, 产品部: "__总计__", TPM: "__总计__", 评分档位: 5, 数量: 9 },
  ],
}, {
  module: "OQC",
  kind: "OQC_SHIPMENT_DETAIL",
  rows: [{ 日期: "2026-07-12", 产品部: "FPC事业部", TPM: "王辉", 机台分类: "组件", 机台数量: 1, 最终评分: 10 }],
}];
const li = assembleDirectorEvidence({
  director: "李光明",
  mappings: directorMappings,
  dqaRows: directorIssues,
  records: [],
  files: directorOqcFiles,
  range: directorRange,
});
assert.equal(li.teamMembers.length, 2);
assert.deepEqual(li.teamMembers.map((row) => row.name).sort(), ["王辉", "朱慧慧"].sort());
assert.equal(li.issueRows.some((row) => String(row["问题描述"]).includes("别人")), false);
assert.equal(li.issueRows.some((row) => row["阶段"] === "评审"), false);
assert.equal(li.issueRows.length, 2);
assert.deepEqual(li.peerRows.map((row) => row.name).sort(), ["王辉", "朱慧慧"].sort());
assert.equal(li.peerRows.some((row) => row.name === "陈中成"), false);
const liOqc = buildDirectorOqc({ files: directorOqcFiles, director: "李光明", mappings: directorMappings, range: directorRange });
assert.equal(liOqc.count, 4);
assert.equal(liOqc.five, 3);
assert.equal(liOqc.avg, 4.75);
assert.equal(liOqc.monthly.find((row) => row.label === "2026-03").count, 1);
assert.equal(liOqc.monthly.find((row) => row.label === "2026-03").selected, false);
assert.equal(liOqc.monthly.find((row) => row.label === "2026-07").selected, true);
assert.ok(liOqc.avg <= 5);

const leaked = assembleDirectorEvidence({
  director: "李光明",
  mappings: [...directorMappings, { active: true, productDept: "产品五部", tpm: "王辉", pm: "漏进来", productionDirector: "陈中成" }],
  dqaRows: [...directorIssues, { 问题描述: "不该进李光明", 问题分类: "设计缺陷", 发生日期: "2026-07-08", PM: "漏进来", 阶段: "生产" }],
  records: [],
  files: [],
  range: directorRange,
});
assert.equal(leaked.issueRows.some((row) => String(row["问题描述"]).includes("不该进李光明")), false);
assert.equal(leaked.teamMembers.find((row) => row.name === "王辉").issues, 1);

const directorEvidence = {
  ...li,
  matchedRows: li.issueRows.length,
  rdQualityIssues: { count: li.issueRows.length, categories: li.categories, examples: li.issueRows.slice(0, 3).map((row) => ({ date: "2026-07-02", category: row["问题分类"], description: row["问题描述"] })), periodTrend: { month: { rows: [{ label: "2026-07", count: 2, selected: true }] } } },
  engineerMetrics: { ...li.metrics, ecnReasons: [{ name: "BOM漏做", count: 2 }] },
  pmPeerRows: li.peerRows,
  oqcShipment: liOqc,
};
const directorMd = buildFixedDataRoleReport({ role: "产总", recipient: "李光明", period: directorRange, evidence: directorEvidence });
assert.match(directorMd, /## FPC事业部 TPM/);
assert.doesNotMatch(directorMd, /产总不参与产品部横向排名/);
assert.doesNotMatch(directorMd, /\n## 排名/);
assert.match(directorMd, /## 各TPM · 研发问题数量/);
assert.match(directorMd, /## 5分比例月度趋势/);
assert.doesNotMatch(directorMd, /## 周度趋势/);
assert.doesNotMatch(directorMd, /## 组内成员/);
const directorAnalysis = buildDeterministicAnalysisMarkdown({ role: "产总", recipient: "李光明", nextReviewDate: "2026-10-30", period: directorRange, evidence: directorEvidence });
assert.match(directorAnalysis, /问题集中在TPM/);
assert.match(directorAnalysis, /就质量结果看，FPC事业部发布前仍有跨项目问题流出/);
assert.doesNotMatch(directorAnalysis, /我们的目的|请您|我们一起|抓重点/);
assert.match(directorAnalysis, /5分比例/);
assert.match(directorAnalysis, /## 重点关注事项/);
assert.doesNotMatch(directorAnalysis, /出示核对记录/);
assert.doesNotMatch(directorAnalysis, /这项现象已关闭/);
assert.doesNotMatch(directorAnalysis, /你辖/);
assert.doesNotMatch(directorAnalysis, /由你拍板/);
assert.doesNotMatch(directorAnalysis, /本月措施/);
assert.doesNotMatch(directorAnalysis, /\| 李光明 \|/);
assert.equal(needsRoleModelAnalysis("产总", { rdQualityIssues: { count: 0 }, matchedRows: 0, ipqcMetrics: null, engineerMetrics: { ecnCount: 3 } }), true);
assert.equal(needsRoleModelAnalysis("产总", { rdQualityIssues: { count: 0 }, matchedRows: 0, ipqcMetrics: null, oqcShipment: { count: 4 } }), true);
assert.equal(needsRoleModelAnalysis("产总", { rdQualityIssues: { count: 0 }, matchedRows: 0, ipqcMetrics: null, engineerMetrics: {}, oqcShipment: { count: 0 } }), false);
const directorRank = rankMetricRows(liOqc.peers, "count", "李光明", 12);
assert.equal(directorRank.find((row) => row.name === "李光明").label, "FPC事业部");
assert.equal(directorRank.find((row) => row.name === "陈中成").label, "产品五部");
assert.equal(directorRank.some((row) => /李光明|陈中成/.test(row.label)), false);
assert.equal(liOqc.peers.find((row) => row.name === "李光明").chartLabel, "FPC事业部");
const oqcRank = rankMetricRows(liOqc.peers, "lowRate", "李光明", 12);
assert.equal(oqcRank.some((row) => /李光明|陈中成/.test(row.label)), false);
const overflowDirector = rankMetricRows([
  ...Array.from({ length: 14 }, (_, index) => ({ name: "产总" + index, chartLabel: "产品部" + index, issueCount: 30 - index })),
  { name: "王立亮", chartLabel: "海外亚太、产品五部", issueCount: 1, focus: true },
], "issueCount", "王立亮", 12);
assert.equal(overflowDirector.at(-1).name, "王立亮");
assert.match(overflowDirector.at(-1).label, /^海外亚太、产品五部 · 第15\/15名$/);
assert.doesNotMatch(overflowDirector.at(-1).label, /王立亮/);
console.log("director scope follows mapped TPMs");
