import assert from "node:assert/strict";
import { matchEmployee, markdownToHtml, publicWecomConfig, reportPdfTitle, safePdfName } from "../server/wecomSend.mjs";
import { chartLayoutRules } from "../src/agent/lieflatRoleCharts.js";

const employees = [
  { name: "朱从军", wecom: "zhucongjun" },
  { name: "王亮", wecom: "wangliang1" },
  { name: "王亮", wecom: "wangliang2" },
  { name: "邓海新", wecom: "" },
];
assert.equal(matchEmployee(employees, "朱从军").status, "ok");
assert.equal(matchEmployee(employees, "朱 从军").userid, "zhucongjun");
assert.equal(matchEmployee(employees, "王亮").status, "duplicate");
assert.equal(matchEmployee(employees, "邓海新").status, "no-userid");
assert.equal(matchEmployee(employees, "不存在").status, "missing");
assert.equal(publicWecomConfig({ secret: "abcd1234", corpId: "ww" }).hasSecret, true);
assert.equal(publicWecomConfig({ secret: "abcd1234" }).secret, undefined);
assert.match(markdownToHtml("标题", "| A | B |\n|---|---|\n| 1 | 2 |"), /<table>/);
assert.match(reportPdfTitle({ recipient: "朱从军", role: "组装人员", period: { start: "2026-08-01", end: "2026-08-31" } }), /朱从军/);
assert.equal(safePdfName("朱从军/组装人员:8月"), "朱从军-组装人员-8月");
const chartHtml = markdownToHtml("邓海新-8月质量报告", "## 周度问题趋势\n\n见图，不在此重复月/周数字。\n\n## 月度问题趋势\n\n见图，不在此重复月/周数字。\n\n## 已确认规范依据\n\n待核实：当前人员在本报告周期内没有已确认的规范匹配，不得编造条款。\n\n## ECN变更活动\n\n| 指标 | 数值 |\n|---|---:|\n| ECN数量 | 4 |", {
  figures: [{
    id: "rd-quality-week-trend",
    sectionId: "周度问题趋势",
    title: "研发质量问题周度趋势",
    preferredChart: "clustered-bar",
    categories: ["2026-W10", "2026-W11"],
    series: [{ name: "问题数量", values: [2, 4] }],
  }],
});
assert.match(chartHtml, /lieflat-card/);
assert.equal(chartLayoutRules.padTop, 20);
assert.match(chartHtml, /pdf-role-sheet/);
assert.doesNotMatch(chartHtml, /lieflat-compact/);
const topY = Math.min(...[...chartHtml.matchAll(/y1="([\d.]+)"/g)].map((item) => Number(item[1])).filter((value) => value > 0));
assert.ok(Math.abs(topY - chartLayoutRules.screen.padTop) < 2, `highest mark should sit ${chartLayoutRules.screen.padTop}px from top, got ${topY}`);
assert.match(chartHtml, /周度问题趋势/);
assert.match(chartHtml, /ECN变更活动/);
assert.doesNotMatch(chartHtml, /见图，不在此/);
assert.match(chartHtml, /lieflat-badge/);
assert.doesNotMatch(chartHtml, /ONE RUNG/);
assert.doesNotMatch(chartHtml, /已确认规范依据/);
assert.doesNotMatch(chartHtml, /空段落/);
const dropped = markdownToHtml("标题", "# 重复大标题\n\n## 空段落\n\n## 有内容\n\n正文");
assert.doesNotMatch(dropped, /空段落/);
assert.doesNotMatch(dropped, /重复大标题/);
assert.match(dropped, /有内容/);
const weekPdf = markdownToHtml("韩瑞丽-7至8月质量报告", "## 周度趋势\n\n| 周次 | 不良记录 |\n|---|---:|\n| 2026-W03 | 0 |\n", {
  figures: [{
    id: "direct-week-trend",
    sectionId: "周度趋势",
    title: "周度趋势",
    intent: "period-trend",
    preferredChart: "dual-column-line",
    categories: Array.from({ length: 33 }, (_, index) => ({ name: `2026-W${String(index + 3).padStart(2, "0")}`, selected: index >= 24 })),
    series: [
      { name: "不良数量", values: Array.from({ length: 33 }, () => 1) },
      { name: "总数量", values: Array.from({ length: 33 }, () => 20) },
      { name: "不良率", values: Array.from({ length: 33 }, () => 5) },
    ],
  }],
});
assert.match(weekPdf, /lieflat-week-bands/);
assert.match(weekPdf, /lieflat-week-band-caption/);
assert.ok((weekPdf.match(/<svg /g) || []).length >= 3, "PDF 周趋势也要拆成多段");
assert.match(weekPdf, />W24</);
assert.match(weekPdf, /周度趋势（2026年）/);
assert.doesNotMatch(weekPdf, /2026-W03<\/td>/);
console.log("week table dropped in pdf");
console.log("week band pdf smoke passed");
console.log("wecom send smoke test passed");
