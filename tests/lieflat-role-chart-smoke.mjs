import assert from "node:assert/strict";
import { fitParetoAxisLabels, pinFocusChartRows, renderLieflatFigure, renderLieflatHairline, renderLieflatPairedTrend, renderLieflatRungBars } from "../src/agent/lieflatRoleCharts.js";

const line = renderLieflatHairline({
  title: "周度趋势",
  grain: "week",
  rows: [
    { label: "2026-W02", value: 0, total: 8, rate: 0, hollow: true },
    { label: "2026-W03", value: 1, total: 35, rate: 2.86 },
    { label: "2026-W06", value: 4, total: 4, rate: 100 },
    { label: "2026-W13", value: 5, total: 35, rate: 14.29 },
    { label: "2026-W28", value: 3, total: 3, rate: 100 },
  ],
});
assert.match(line, /lieflat-card/);
assert.match(line, /HAIRLINE LINE/);
assert.match(line, />5</);
assert.doesNotMatch(line, /combo-bar/);

const trend = renderLieflatPairedTrend({
  title: "周度趋势",
  rows: [
    { label: "2026-W02", bad: 0, total: 8, rate: 0 },
    { label: "2026-W03", bad: 1, total: 35, rate: 2.86 },
    { label: "2026-W06", bad: 4, total: 4, rate: 100 },
    { label: "2026-W13", bad: 5, total: 35, rate: 14.29 },
  ],
});
assert.match(trend, /PAIRED RUNGS/);
assert.match(trend, /<line /);
assert.match(trend, />35</);
assert.match(trend, />5</);
assert.match(trend, /100%/);
assert.match(trend, /viewBox="0 0 /);

const bars = renderLieflatRungBars({
  title: "问题类型",
  rows: [
    { label: "漏装", value: 8 },
    { label: "错装", value: 5 },
    { label: "划伤", value: 3 },
  ],
});
assert.match(bars, /RUNG BARS/);
assert.match(bars, />8</);

const ranking = pinFocusChartRows([
  ...Array.from({ length: 14 }, (_, index) => ({ label: `第${index + 1}名`, name: `第${index + 1}名`, value: 100 - index })),
  { label: "当事人", name: "当事人", value: 35, focus: true, rank: 15, rankTotal: 546 },
], 12);
assert.equal(ranking.length, 12);
assert.equal(ranking[11].focus, true);
assert.match(ranking[11].label, /当事人/);
assert.match(ranking[11].label, /第15\/546名/);
assert.equal(ranking.some((row) => row.label === "第12名"), false);

const chart = renderLieflatRungBars({ title: "个人风险排名", rows: ranking, valueLabel: "不良记录" });
assert.match(chart, /第15\/546名/);
assert.match(chart, /当事人/);

const huge = renderLieflatPairedTrend({
  title: "月度趋势",
  grain: "month",
  rows: [
    { label: "2026-07", bad: 160, total: 2658, rate: 6.02 },
    { label: "2026-08", bad: 186, total: 3889, rate: 4.78 },
  ],
});
assert.match(huge, />186</);
assert.match(huge, />3889</);
assert.match(huge, /开方压缩/);
const hugeH = Number((huge.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/) || [])[1]);
assert.ok(hugeH > 0 && hugeH < 340, "高低差大的柱高要压缩，不能把图画得过高: " + hugeH);

console.log("lieflat role chart smoke test passed");

const manyWeeks = renderLieflatPairedTrend({
  title: "周度趋势",
  grain: "week",
  rows: Array.from({ length: 33 }, (_, index) => ({
    label: `2026-W${String(index + 3).padStart(2, "0")}`,
    bad: index === 26 ? 6 : 1,
    total: 20,
    rate: 5,
    selected: index >= 24,
  })),
});
assert.match(manyWeeks, /lieflat-week-bands/);
assert.match(manyWeeks, /每12周分段/);
assert.match(manyWeeks, /2026年/);
assert.match(manyWeeks, />W27</);
assert.doesNotMatch(manyWeeks, /rotate\(-32/);
assert.doesNotMatch(manyWeeks, />2026-W27</);
assert.match(manyWeeks, /lieflat-selected-start/);
assert.ok((manyWeeks.match(/<svg /g) || []).length >= 3, "全年周趋势要拆成多段，方便 PDF 一页看清");
console.log("week band chart smoke passed");

const compactWeeks = renderLieflatPairedTrend({
  title: "周度趋势",
  grain: "week",
  compact: true,
  rows: Array.from({ length: 33 }, (_, index) => ({
    label: `2026-W${String(index + 3).padStart(2, "0")}`,
    bad: 1,
    total: 20,
    rate: 5,
    selected: index >= 24,
  })),
});
assert.match(compactWeeks, /lieflat-week-bands/);
assert.match(compactWeeks, /lieflat-week-band-caption/);
assert.match(compactWeeks, />W27</);
assert.doesNotMatch(compactWeeks, /rotate\(-32/);
console.log("compact week band chart smoke passed");

const monthTrend = renderLieflatPairedTrend({
  title: "月度趋势",
  grain: "month",
  rows: [
    { label: "2026-01", bad: 1, total: 10, rate: 10 },
    { label: "2026-02", bad: 2, total: 20, rate: 10 },
  ],
});
assert.doesNotMatch(monthTrend, /light=/);
assert.doesNotMatch(manyWeeks, /light=/);
assert.doesNotMatch(manyWeeks, /ONE RUNG|ONE DOT/);
const weekSvg = manyWeeks.match(/<svg[\s\S]*?>W12<[\s\S]*?<\/svg>/);
assert.ok(weekSvg, "first week band svg exists");
const axisY = Number((weekSvg[0].match(/y="([\d.]+)"[^>]*>W12</) || [])[1]);
const chartH = Number((weekSvg[0].match(/viewBox="0 0 [\d.]+ ([\d.]+)"/) || [])[1]);
assert.ok(axisY > 0 && chartH > axisY, "横坐标要画在图内");
assert.ok(chartH - axisY >= 10, "横坐标下方至少留 10px，避免和图例重叠");
console.log("legend must sit below axis labels");

const supplyCombo = renderLieflatFigure({
  id: "supply-site-compare",
  sectionId: "厂区对比",
  preferredChart: "combo-bar-line",
  title: "厂区对比",
  categories: ["深圳", "杭州"],
  series: [
    { name: "不良数量", values: [200, 146] },
    { name: "送检数量", values: [4000, 2547] },
    { name: "不良率", values: [5, 5.73], unit: "%" },
  ],
});
assert.match(supplyCombo, /PAIRED RUNGS/);
assert.match(supplyCombo, />200</);
assert.match(supplyCombo, />4000</);
assert.match(supplyCombo, /5%/);
assert.match(supplyCombo, /深圳/);
assert.match(supplyCombo, /杭州/);
console.log("supply combo figure passed");

const layered = renderLieflatPairedTrend({
  title: "下属交付经理不良记录",
  grain: "category",
  rows: [
    { label: "陈经伟", bad: 69, total: 641, rate: 11 },
    { label: "周久来", bad: 58, total: 836, rate: 6.9 },
    { label: "冯红宾", bad: 56, total: 1114, rate: 5 },
  ],
});
const yOf = (svg, label) => Number((svg.match(new RegExp('y="([\\d.]+)"[^>]*>' + label + '<')) || [])[1]);
const rateY11 = yOf(layered, "11%");
const barY69 = yOf(layered, "69");
const barY641 = yOf(layered, "641");
const viewH = Number((layered.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/) || [])[1]);
assert.ok(rateY11 > 0 && barY69 > 0, "分层坐标应能读到: " + rateY11 + " / " + barY69);
assert.ok(rateY11 < barY69 - 12, "折线百分比要在柱顶数字上方分层: " + rateY11 + " vs " + barY69);
assert.ok(rateY11 < barY641 - 8, "折线百分比也要避开送检柱顶数字: " + rateY11 + " vs " + barY641);
assert.ok(rateY11 < viewH * 0.45, "不良率应占用图的上半层: " + rateY11 + " / " + viewH);
assert.match(layered, /15%/);
assert.match(layered, /折线在上层/);
console.log("split-band rate/bar layering passed");

assert.doesNotMatch(layered, /rgba\(212,160,23/);
assert.doesNotMatch(layered, /lineBandFill/);
console.log("line band fill removed");

const weekCombo = renderLieflatFigure({
  id: "direct-week-trend",
  sectionId: "周度趋势",
  preferredChart: "combo-bar-line",
  title: "周度趋势",
  categories: Array.from({ length: 24 }, (_, index) => ({ name: `2026-W${String(index + 1).padStart(2, "0")}` })),
  series: [
    { name: "不良数量", values: Array.from({ length: 24 }, () => 2) },
    { name: "送检数量", values: Array.from({ length: 24 }, () => 20) },
    { name: "不良率", values: Array.from({ length: 24 }, () => 10), unit: "%" },
  ],
});
assert.match(weekCombo, /lieflat-week-bands/);
assert.match(weekCombo, />W12</);
console.log("supply week combo still bands");

const crowded = renderLieflatRungBars({
  title: "ECN变更原因 Pareto",
  rows: [
    { label: "BOM漏做加工件", value: 104, rate: 22 },
    { label: "设计错误", value: 86, rate: 39 },
    { label: "分批下单", value: 85, rate: 57 },
    { label: "已满足客户需求", value: 77, rate: 73 },
    { label: "设计干涉", value: 50, rate: 83 },
    { label: "BOM引用版本图号错误", value: 31, rate: 90 },
    { label: "客户原因", value: 26, rate: 95 },
    { label: "设计改善验证", value: 24, rate: 100 },
  ],
  valueLabel: "ECN数量",
});
assert.match(crowded, /lieflat-axis/);
assert.match(crowded, /<tspan /);
assert.ok((crowded.match(/<tspan /g) || []).length >= 8, "重叠的横坐标要换行");
const fitted = fitParetoAxisLabels(["BOM漏做加工件", "BOM引用版本图号错误", "已满足客户需求"], 72);
assert.ok(fitted.fontSize <= 8);
assert.ok(fitted.wrapLines >= 1);
assert.ok(fitted.wrapLines >= 2, "长标签要换行");
assert.ok(fitted.wrapped.every((lines) => Math.max(...lines.map((line) => Array.from(line).length)) < 10));
console.log("pareto axis overlap wrap passed");
