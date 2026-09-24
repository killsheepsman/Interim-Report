import assert from "node:assert/strict";
import { pinFocusChartRows, renderLieflatHairline, renderLieflatPairedTrend, renderLieflatRungBars } from "../src/agent/lieflatRoleCharts.js";

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
