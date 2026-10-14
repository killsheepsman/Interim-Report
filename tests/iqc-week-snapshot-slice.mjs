import { buildQualityAgentSnapshot, sliceIqcSnapshotToWindow } from "../src/agent/qualitySnapshot.js";

const row = (date, supplier, result, reason) => ({ 检验开始时间: date, 供应商: supplier, 质检结果: result, 异常原因: reason });
const file = (name, rows) => ({ module: "IQC", name, rows });
const files = [
  file("IQC 8月份杭州.xlsx", [
    row("2026-08-02", "杭州供应商甲", "不合格", "尺寸超差"),
    row("2026-08-03", "杭州供应商甲", "合格", ""),
    row("2026-08-04", "一楼自制", "不合格", "毛刺"),
  ]),
  file("IQC 8月份深圳.xlsx", [
    row("2026-08-06", "深圳供应商乙", "不合格", "碰伤"),
    row("2026-08-07", "内部加工", "不合格", "漏加工"),
  ]),
  file("IQC 7月份深圳.xlsx", [
    row("2026-07-11", "七月供应商", "不合格", "氧化"),
  ]),
];
const weekEntry = (start, end) => {
  const snapshot = buildQualityAgentSnapshot({ data: { kpis: [], iqc: {} }, files, dateRange: { start2026: start, end2026: end }, module: "IQC" });
  return { active: true, module: "IQC", dateRange: { start2026: start, end2026: end, granularity: "week", periodKey: start + "_" + end }, snapshot };
};
const range = buildQualityAgentSnapshot({ data: { kpis: [], iqc: {} }, files, dateRange: { start2026: "2026-01-01", end2026: "2026-08-31" }, module: "IQC" });
delete range.data.iqcSplit.monthFacts;
range.data.iqcSplit.suppliers = [{ site: "深圳", name: "七月供应商", inspected: 1, bad: 1, rate: 100, topDefects: [{ name: "氧化", count: 1 }] }];
const history = [weekEntry("2026-07-30", "2026-08-05"), weekEntry("2026-08-06", "2026-08-12"), weekEntry("2026-07-09", "2026-07-15")];
const sliced = sliceIqcSnapshotToWindow(range, { start: "2026-08-01", end: "2026-08-08" }, { start2026: "2026-01-01", end2026: "2026-08-31" }, history);
const split = sliced.data.iqcSplit;
const names = (split.suppliers || []).map((item) => item.name);
if (names.includes("七月供应商")) throw new Error("周快照不应把7月供应商算进8月1日至8日");
if (!names.includes("杭州供应商甲") || !names.includes("深圳供应商乙")) throw new Error("重叠周快照里的供应商没有拼上：" + names.join("、"));
const hangzhou = split.cells.find((cell) => cell.name === "杭州供应商");
if (!hangzhou?.defects?.some((item) => item.name === "尺寸/公差")) throw new Error("杭州供应商缺陷没有从周快照拼上");
const companySites = (split.companyMachining || []).map((item) => item.site);
if (!companySites.includes("杭州") || !companySites.includes("深圳")) throw new Error("公司加工没有从周快照拼上：" + companySites.join("、"));
const withoutWeeks = sliceIqcSnapshotToWindow(range, { start: "2026-08-01", end: "2026-08-08" }, { start2026: "2026-01-01", end2026: "2026-08-31" }, []);
if ((withoutWeeks.data.iqcSplit.suppliers || []).some((item) => item.name === "七月供应商")) throw new Error("没有周快照时不能拿总周期供应商充数");
console.log("iqc week snapshot slice ok", { suppliers: names.join("、"), company: companySites.join("、") });
