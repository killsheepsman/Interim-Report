import { buildQmsCustomerSplit } from "../src/agent/qmsCustomerSplit.js";
import { buildDoamStabilitySplit } from "../src/agent/doamStabilitySplit.js";

const qms = {
  thresholds: { low: 4 },
  periods: [
    { key: "p2026h1", period: "2026年上半年", year: 2026, half: 1, samples: 10, avg: 4.6, lowCount: 1, lowRate: 10 },
    { key: "p2026h2", period: "2026年下半年", year: 2026, half: 2, samples: 0, avg: null, lowCount: 0, lowRate: null },
  ],
  divisionCompare: [
    { name: "FPC事业部", periods: { p2026h1: { samples: 10, avg: 4.6, lowCount: 1, lowRate: 10 } } },
  ],
  tpmByDivision: {
    FPC事业部: [
      { name: "李亚龙", periods: { p2026h1: { samples: 4, avg: 4.2, lowCount: 1, lowRate: 25 } } },
      { name: "罗\uFFFD", periods: { p2026h1: { samples: 3, avg: 4, lowCount: 1, lowRate: 33 } } },
    ],
  },
  risks: [{ period: "2026年上半年", division: "FPC\uFFFD\uFFFD\uFFFD业部", tpm: "李亚龙", customer: "甲", project: "项目", score: 3.5, lowestDimension: "设备稳定性", suggestion: "故障多" }],
  suggestions: [{ period: "2026年上半年", category: "设备稳定性" }, { period: "2026年上半年", category: "设备稳定性" }],
  comparableDimensions: [{ name: "设备稳定性", periods: { p2026h1: 4.1 } }],
};
const first = buildQmsCustomerSplit({ qms, period: { end2026: "2026-06-30" } });
if (!first.selected.ready || first.current.label !== "2026年上半年") throw new Error("上半年应作为本期");
if (first.tpms.some((item) => item.name.includes("\uFFFD"))) throw new Error("乱码 TPM 不应出现");
if (first.lowScores[0]?.division !== "FPC事业部") throw new Error("损坏的产品部应归回 FPC，实际 " + first.lowScores[0]?.division);
if (first.themes[0]?.count !== 2) throw new Error("意见主题应合并");
const second = buildQmsCustomerSplit({ qms, period: { start2026: "2026-01-01", end2026: "2026-08-31" } });
if (!second.current || second.current.label !== "2026年上半年") throw new Error("下半年还没导入时，本期应回到已覆盖的上半年，实际 " + second.current?.label);
if (second.periods.some((item) => !item.samples)) throw new Error("没有问卷的半年不要放进趋势");
const fromFiles = buildQmsCustomerSplit({
  qms: { periods: [{ key: "p2026h1", year: 2026, half: 1, samples: 0, period: "2026年上半年" }] },
  files: [{ module: "QMS", rows: [{ "总体得分": 4.5, "产品部": "北美项目部", TPM: "赵佳池", "客户名称": "甲", "项目名称": "P", __surveyYear: 2026, __surveyHalf: 1, __dimensions: { "设备稳定性": 4 }, "产品质量建议": "故障多" }] }],
  period: { start2026: "2026-01-01", end2026: "2026-08-31" },
});
if (!fromFiles || fromFiles.current.samples !== 1 || fromFiles.divisions[0]?.name !== "半导体&北美") throw new Error("空缓存时必须改读问卷行，实际 " + JSON.stringify(fromFiles?.current));

const doam = buildDoamStabilitySplit({
  units: [
    { y: 2026, o: 1, d: "2026-01-15", a: 10, t: "王辉", p: "FPC事业部", k: "客户甲" },
    { y: 2026, o: 1, d: "2026-01-16", a: 2, t: "王辉", p: "FPC事业部", k: "客户甲" },
    { y: 2026, o: 8, d: "2026-08-02", a: 6, t: "赵佳池", p: "\uFFFD\uFFFD导体&北美", k: "客户乙" },
  ],
  categories: [{ y: 2026, c: "取料/丢料", a: 12, ds: ["2026-01-15", "2026-08-02"] }],
}, { start2026: "2026-08-01", end2026: "2026-08-31" });
if (doam.monthly.map((item) => item.month).join(",") !== "01,08") throw new Error("2月到7月没有数据，不应画成 0，实际 " + doam.monthly.map((item) => item.month).join(","));
if (doam.totals.alarms !== 6 || doam.totals.shifts !== 1) throw new Error("本期只统计所选日期，实际 " + JSON.stringify(doam.totals));
if (doam.divisions.some((item) => /\uFFFD/.test(item.name))) throw new Error("乱码产品部不应出现");
if (!doam.divisions.some((item) => item.name === "半导体&北美" && item.alarms === 6)) throw new Error("损坏产品部应归入半导体&北美 " + JSON.stringify(doam.divisions));
if (doam.categories[0]?.count !== 6) throw new Error("分类应按截止日期内的日期占比计入，实际 " + JSON.stringify(doam.categories));
console.log("qms doam split ok", { qmsHalf: first.current.avg, doamMonths: doam.monthly.length, august: doam.totals.average });
