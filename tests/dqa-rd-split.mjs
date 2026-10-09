import { buildDqaRdSplit, resolveDqaTpm, shapeDqaRdSplit, sliceDqaRdSnapshotToWindow } from "../src/agent/dqaRdSplit.js";

const issue = (dept, tpm, pm, stage, category, date) => ({ 产品部: dept, TPM: tpm, PM: pm, 阶段: stage, 问题分类: category, 问题描述: category + "现象", 发生日期: date });
const files = [
  {
    module: "DQA",
    name: "2026年产品一部研发问题汇总.xlsx",
    rows: [
      issue("产品一部", "错写TPM", "申学梅", "生产", "尺寸错误", "2026-07-02"),
      issue("产品一部", "王辉", "别人", "评审", "不该计入", "2026-07-03"),
      issue("FPC事业部", "朱慧慧", "李四", "现场", "干涉", "2026-06-02"),
      issue("FPC事业部", "朱慧慧", "李四", "生产", "干涉", "2026-08-02"),
    ],
  },
  {
    module: "DQA",
    subKind: "DQA_ECN",
    name: "ECN.xlsx",
    rows: [
      { __sheet: "分子", 产品部: "FPC事业部", 申请日期: "2026-07-05", 变更原因: "分批下单" },
      { __sheet: "分子", 产品部: "FPC事业部", 申请日期: "2026-07-06", 变更原因: "设计干涉" },
      { __sheet: "分母", 产品部: "FPC事业部", 制单日期: "2026-07-01", 物料款数: 100 },
    ],
  },
  {
    module: "DQA",
    subKind: "DQA_MACHINED_PARTS",
    name: "加工件数量比例.xlsx",
    rows: [
      { __partKind: "ECN", 产品部: "加工件总数", 年份: 2026, 月份: 7, 数量: 200 },
      { __partKind: "ECN", 产品部: "FPC事业部", TPM: "朱慧慧", 年份: 2026, 月份: 7, 数量: 10 },
      { __partKind: "非BOM", 产品部: "加工件总数", 年份: 2026, 月份: 7, 数量: 50 },
      { __partKind: "非BOM", 产品部: "产品五部", TPM: "王辉", 年份: 2026, 月份: 7, 数量: 5 },
    ],
  },
  {
    module: "DQA",
    subKind: "DQA_ENGINEER_SUPPLEMENT",
    name: "研发评审.xlsx",
    supplement: { reviewRecords: [{ fileName: "FPC事业部设计评审.xlsx", updateDate: "2026-07-08", members: ["甲"], proposers: ["甲", "乙"] }] },
    rows: [],
  },
];
const mappings = [
  { productDept: "半导体&北美", projectGroup: "北美项目部", tpm: "王辉", pm: "申学梅", productionDirector: "黄敏", active: true },
];
const split = buildDqaRdSplit(files, { start2026: "2026-07-01", end2026: "2026-08-31" }, mappings);
const semi = split.divisions.find((item) => item.name === "半导体&北美");
const fpc = split.divisions.find((item) => item.name === "FPC事业部");
if (semi.issues !== 1) throw new Error("评审阶段不应计入研发问题，实际 " + semi.issues);
if (!split.tpms.some((item) => item.name === "王辉" && item.division === "半导体&北美")) throw new Error("应按PM追溯到组织映射里的TPM");
if (split.tpms.some((item) => item.name === "错写TPM")) throw new Error("组织映射里没有的TPM不能上榜");
if (split.reasons.some((item) => item.name.includes("分批"))) throw new Error("分批下单不能进入变更原因");
if (fpc.ecn !== 1 || fpc.ecnRate !== 1) throw new Error("FPC 7月 ECN 比例应为 1%，实际 " + fpc.ecn + "/" + fpc.ecnRate);
if (fpc.ecnMachinedRate !== 5) throw new Error("ECN加工件比例分母应为全公司，实际 " + fpc.ecnMachinedRate);
if (split.divisions.find((item) => item.name === "产品五部").nonBomMachinedRate !== 10) throw new Error("非BOM加工件比例不对");
if (fpc.reviews !== 1 || fpc.suggestions !== 2) throw new Error("评审表次数或改善项不对");
if (!split.divisionMonthly[0].rows.some((row) => row.month === "6月")) throw new Error("趋势应从1月画到截止月");
if (fpc.ytdIssues !== 2) throw new Error("累计应含6月和8月");
if (resolveDqaTpm("半导体&北美", "申学梅", "错写TPM", mappings) !== "王辉") throw new Error("PM追溯失败");
const snapshot = { module: "DQA", period: { start2026: "2026-01-01", end2026: "2026-08-31" }, data: { dqaSplit: buildDqaRdSplit(files, { start2026: "2026-01-01", end2026: "2026-08-31" }, mappings) } };
const sliced = sliceDqaRdSnapshotToWindow(snapshot, { start: "2026-07-01", end: "2026-07-31" }, snapshot.period);
if (sliced.data.dqaSplit.divisions.find((item) => item.name === "FPC事业部").issues !== 0) throw new Error("切到7月不应保留8月研发问题");
if (sliced.data.dqaSplit.divisionMonthly[0].rows.some((row) => row.month === "8月")) throw new Error("切到7月后趋势不应再画8月");
const zhu = split.tpms.find((item) => item.name === "朱慧慧");
if (!zhu || zhu.ecnMachined !== 10 || zhu.ecnMachinedRate !== 5) throw new Error("朱慧慧 ECN加工件应按全公司分母，实际 " + JSON.stringify(zhu));
const julyPart = split.partMonthly.find((row) => row.month === "7月");
if (!julyPart || julyPart.ecn !== 10 || julyPart.ecnRate !== 5 || julyPart.nonBom !== 5 || julyPart.nonBomRate !== 10) throw new Error("7月加工件趋势不对 " + JSON.stringify(julyPart));

const garbled = shapeDqaRdSplit({
  period: { start: "2026-07-01", end: "2026-07-30" },
  monthFacts: [{
    month: "7月", monthNumber: 7, key: "2026-07", year: 2026,
    issues: [],
    ecn: [
      { division: "半导体&北美", tpm: "赵佳池", pm: "马楠", reason: "稳定性/良率提升改善", count: 2, batch: false },
      { division: "\uFFFD\uFFFD导体&北美", tpm: "赵佳池", pm: "马楠", reason: "标准件禁用替换", count: 2, batch: false },
      { division: "FPC事业部", tpm: "李亚龙", pm: "胡威长", reason: "设计干涉", count: 89, batch: false },
    ],
    ecnDenominator: { "半导体&北美": 0, "产品五部": 0, "FPC事业部": 0 },
    ecnDenRows: [
      { division: "FPC事业部", tpm: "李亚龙", pm: "胡威长", count: 89 },
      { division: "FPC\uFFFD\uFFFD\uFFFD业部", tpm: "李亚龙", pm: "胡威长", count: 89 },
    ],
    partRows: [],
    parts: { ecn: { "半导体&北美": 0, "产品五部": 0, "FPC事业部": 0 }, nonBom: { "半导体&北美": 0, "产品五部": 0, "FPC事业部": 0 }, ecnDenominator: 100, nonBomDenominator: 100 },
    reviews: [],
  }],
}, []);
if (garbled.tpms.some((item) => /\uFFFD/.test(item.division))) throw new Error("乱码产品部不应单独成行");
const zhao = garbled.tpms.find((item) => item.name === "赵佳池");
const li = garbled.tpms.find((item) => item.name === "李亚龙");
if (!zhao || zhao.division !== "半导体&北美" || zhao.ecn !== 4) throw new Error("损坏的产品部应并回赵佳池，实际 " + JSON.stringify(zhao));
if (!li || li.division !== "FPC事业部" || li.ecn !== 89 || li.ecnRate !== 100) throw new Error("重复的损坏分母不能再加一次，实际 " + JSON.stringify(li));

console.log("dqa rd split ok", { semi: semi.issues, fpcEcn: fpc.ecnRate, reviews: fpc.reviews });
