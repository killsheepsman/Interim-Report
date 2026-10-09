import { buildQualityAgentSnapshot, pickIpqcAnalysisSnapshot, sliceIpqcSnapshotToWindow } from "../src/agent/qualitySnapshot.js";
import { buildAgentAuditResult } from "../src/agent/qualityAgent.js";

const row = (date, workshop, qty, type, leader) => ({ 日期: date, 产品工坊: workshop, 送检数: qty, 不良类型: type, 机长: leader });
const files = [
  {
    module: "IPQC",
    kind: "IPQC_LEADER_MAP",
    name: "工坊交付经理机长映射表.xlsx",
    rows: [
      { 厂区: "杭州", 工坊: "二工坊", 交付经理: "韩瑞丽", 机长: "霍艺博" },
      { 厂区: "杭州", 工坊: "二工坊", 交付经理: "韩瑞丽", 机长: "胡巧萍" },
      { 厂区: "杭州", 工坊: "一工坊", 交付经理: "安换丽", 机长: "成强" },
      { 厂区: "深圳", 工坊: "一工坊", 交付经理: "深圳经理", 机长: "深圳机长" },
    ],
  },
  {
    module: "IPQC",
    name: "IPQC 2026年1-6月检验记录（杭州）-二工坊（外包）.xlsx",
    rows: [
      row("2026-06-10", "二工坊", 20, "漏装", "霍艺博"),
      row("2026-07-10", "二工坊", 10, "漏装", "霍艺博"),
      row("2026-07-11", "二工坊", 10, "漏装", "胡巧萍"),
      row("2026-07-12", "二工坊", 5, "研发问题", "霍艺博"),
      row("2026-08-02", "二工坊", 8, "错装", "霍艺博"),
    ],
  },
  {
    module: "IPQC",
    name: "IPQC 2026年检验记录（杭州）-一工坊.xlsx",
    rows: [
      row("2026-07-08", "一工坊", 100, "", "成强"),
      row("2026-07-09", "一工坊", 40, "划伤", "成强"),
      row("2026-01-15", "一工坊", 30, "", "成强"),
    ],
  },
  {
    module: "IPQC",
    name: "IPQC 2026年检验记录（深圳）.xlsx",
    rows: [row("2026-07-03", "一工坊", 50, "", "深圳机长")],
  },
];
const period = { start2026: "2026-01-01", end2026: "2026-08-31" };
const snapshot = buildQualityAgentSnapshot({ data: { kpis: [], ipqc: {} }, files, dateRange: period, module: "IPQC" });
const split = snapshot.data.ipqcSplit;
const cell = (name) => split.cells.find((item) => item.name === name);
const hangzhouOut = cell("杭州外包");
const hangzhouIn = cell("杭州自制");
if (hangzhouOut.inspected !== 53) throw new Error("杭州外包送检应为53，实际 " + hangzhouOut.inspected);
if (hangzhouOut.bad !== 4) throw new Error("研发问题不应计入异常，杭州外包异常应为4，实际 " + hangzhouOut.bad);
if (!hangzhouOut.defects.some((item) => item.name === "漏装" && item.count === 3)) throw new Error("漏装应有3条");
if (hangzhouOut.defects.some((item) => item.name.includes("研发"))) throw new Error("研发问题进入了缺陷");
const han = split.focus.find((item) => item.manager === "韩瑞丽");
if (!han) throw new Error("韩瑞丽密度更高且漏装重复，应该被点名");
if (!han.standardDefects.some((item) => item.name === "漏装")) throw new Error("漏装出现在两名机长身上，应由交付经理关");
if (split.focus.some((item) => item.manager === "安换丽")) throw new Error("安换丽只有一条划伤，缺陷没有重复，不应点名");
if (split.managers.some((item) => item.name === "洪妙文" || item.name === "刘能文")) throw new Error("映射表以外的人不应出现");
const july = hangzhouIn && split.cellMonthly.find((item) => item.name === "杭州自制").rows.find((item) => item.month === "1月");
if (!july || july.inspected !== 30) throw new Error("1月自制应计入趋势");
const sliced = sliceIpqcSnapshotToWindow(snapshot, { start: "2026-07-01", end: "2026-07-31" }, period);
const slicedOut = sliced.data.ipqcSplit.cells.find((item) => item.name === "杭州外包");
if (slicedOut.inspected !== 25) throw new Error("切到7月后外包送检应为25，实际 " + slicedOut.inspected);
if (slicedOut.bad !== 2) throw new Error("切到7月后外包异常应为2，实际 " + slicedOut.bad);
if (slicedOut.previousRate == null) throw new Error("6月有送检，7月应能对比上月");
if (sliced.data.ipqcSplit.cellMonthly[0].rows.some((item) => item.month === "8月")) throw new Error("趋势不应超过所选截止月");
if (sliced.data.ipqcSplit.cellMonthly[0].rows.some((item) => item.month === "1月") === false) throw new Error("趋势应从1月开始");
const picked = pickIpqcAnalysisSnapshot([{ active: true, module: "IPQC", snapshot, dateRange: period, generatedAt: "2026-10-07" }], { start2026: "2026-07-01", end2026: "2026-07-31" });
if (picked?.matchLevel !== "coverage") throw new Error("覆盖快照没有命中");
const audit = buildAgentAuditResult(snapshot);
if (audit.grade === "D" || (audit.blockers || []).length) throw new Error("审计被拦：" + JSON.stringify(audit.blockers));
console.log("ipqc assembly snapshot ok", { out: hangzhouOut.inspected + "/" + hangzhouOut.bad, focus: split.focus.map((item) => item.manager).join("、") });
