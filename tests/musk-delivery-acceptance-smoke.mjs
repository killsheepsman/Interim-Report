import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fillSnapshotWindowDetails, overlaySelectedWindowOnSnapshot, overlayWindowDetailsOntoEvidence, pickRoleSnapshot, pickRoleSnapshotEntry, rankPeopleInSelectedWindow, rolePeriodHistoryWithWeeks } from "../src/agent/roleSnapshotRegistry.js";
import { buildDeterministicAnalysisMarkdown, buildFixedDataRoleReport, repairRoleAnalysis, stitchRoleReportParts } from "../src/agent/roleFixedEvidenceReport.js";

const registryPath = new URL("../data/state/quality-agent-role-snapshot-registry.json", import.meta.url);
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const period = { start: "2026-07-01", end: "2026-08-31", _periodStart: "2026-07-01", _periodEnd: "2026-08-31" };
const raw = pickRoleSnapshot(registry, { role: "交付经理", recipient: "韩瑞丽", period });
assert.ok(raw, "韩瑞丽 range snapshot exists");
const snapshot = fillSnapshotWindowDetails(overlaySelectedWindowOnSnapshot(raw, period), registry, { role: "交付经理", recipient: "韩瑞丽", period });
assert.ok(snapshot.coveringWindow, "7-8月是覆盖窗口，必须合并周快照");
assert.ok(snapshot.categories.some((item) => item.name === "接线问题" && Number(item.count) >= 6), JSON.stringify(snapshot.categories));
assert.ok(snapshot.teamMembers.some((item) => item.name === "霍艺博" && item.bad > 0));
assert.ok(snapshot.teamMembers.some((item) => item.name === "胡巧萍" && item.bad > 0));

const rangeOnly = { ...registry, history: [pickRoleSnapshotEntry(registry, { role: "交付经理", recipient: "韩瑞丽", period })].filter(Boolean) };
const rangeOnlyFilled = fillSnapshotWindowDetails(overlaySelectedWindowOnSnapshot(pickRoleSnapshot(rangeOnly, { role: "交付经理", recipient: "韩瑞丽", period }), period), rangeOnly, { role: "交付经理", recipient: "韩瑞丽", period });
assert.ok(!(rangeOnlyFilled?.categories || []).some((item) => item.name === "接线问题" && Number(item.count) >= 6), "只返回1-8月总快照时，不能假装已经有7-8月分类");

const periodPayload = { ...registry, history: rolePeriodHistoryWithWeeks(registry, { role: "交付经理", period }) };
assert.ok(periodPayload.history.some((entry) => (entry.period?.granularity || entry.granularity) === "week"), "role-period 必须带上重叠的周快照");
const periodFilled = fillSnapshotWindowDetails(overlaySelectedWindowOnSnapshot(pickRoleSnapshot(periodPayload, { role: "交付经理", recipient: "韩瑞丽", period }), period), periodPayload, { role: "交付经理", recipient: "韩瑞丽", period });
assert.ok(periodFilled.categories.some((item) => item.name === "接线问题" && Number(item.count) >= 6), JSON.stringify(periodFilled.categories));
assert.ok(periodFilled.teamMembers.some((item) => item.name === "霍艺博" && item.bad > 0));

const rankingEntry = pickRoleSnapshotEntry(registry, { role: "交付经理", period });
const rankingRows = rankPeopleInSelectedWindow(rankingEntry?.snapshot?.people || [], period, "韩瑞丽");
assert.equal(rankingRows.find((row) => row.selected)?.rank, 8);
assert.equal(rankingRows.find((row) => row.selected)?.total, 9);
assert.equal(rankingRows.find((row) => row.selected)?.value, 12);

const trapped = overlayWindowDetailsOntoEvidence({
  matchedRows: 254,
  ipqcMetrics: { inspectedRecords: 254, badRecords: 12, goodRecords: 242, badRate: 4.72 },
  topCategoryStats: [],
  topCategories: [],
  examples: [{ date: "2026-02-18", category: "旧例", description: "2月旧数据不能当7-8月证据" }],
  teamMembers: [],
  periodTrend: snapshot.trend,
}, snapshot);
assert.ok(trapped.topCategoryStats.some((item) => item.name === "接线问题"));
assert.ok(trapped.teamMembers.some((item) => item.name === "霍艺博" && item.bad > 0));
assert.ok(trapped.examples.some((item) => String(item.date || "") >= "2026-07-01"));

const fallback = buildDeterministicAnalysisMarkdown({
  role: "交付经理",
  recipient: "韩瑞丽",
  period,
  nextReviewDate: "2026-10-24",
  rankingRows,
  evidence: trapped,
});

const fakeModel = `## 分析结论
本期7月不良 6项（不良率 5.00%）、8月不良 6项（不良率 4.48%），合计 12项。数量没有下降，不良率略降。同口径第8/9名，不良数量靠后。
我们的目的是工坊交付前把重复问题拦住。

仍有问题流出。周度尖峰在W27 3项、W33 3项、W28 2项。

请组织机长在交付前把上面这几类关闭；跨工坊事项升级给供应链经理。

## 本月措施
| 措施 | 针对的本人/下属问题（必须来自本期固定证据） | Owner | 完成日(YYYY-MM-DD) | 下次报告如何验收 |
|---|---|---|---|---|
| 组织机长在交付前关闭「W27」：对到班组关闭 | W27 不良 3 项 | 韩瑞丽 | 2026-10-24 | 出示对应班组关闭证据，且该类/该周下降 |
| 组织机长在交付前关闭「W33」：对到班组关闭 | W33 不良 3 项 | 韩瑞丽 | 2026-10-24 | 出示对应班组关闭证据，且该类/该周下降 |
| 组织机长在交付前关闭「W28」：对到班组关闭 | W28 不良 2 项 | 韩瑞丽 | 2026-10-24 | 出示对应班组关闭证据，且该类/该周下降 |
`;

const analysis = repairRoleAnalysis(fakeModel, fallback, "交付经理", trapped, "韩瑞丽");
const fixed = buildFixedDataRoleReport({
  role: "交付经理",
  recipient: "韩瑞丽",
  period,
  evidence: trapped,
  rankingRows,
});
const full = stitchRoleReportParts({ fixed, analysis });
const outDir = path.resolve("C:/Users/77247/Desktop/半年报/outputs");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "musk-delivery-hanruili-7-8-acceptance.md");
fs.writeFileSync(outFile, full, "utf8");

assert.match(full, /## 问题分类\s+\| 问题类型 \| 数量 \|/);
assert.match(full, /\| 接线问题 \|/);
assert.match(full, /\| 装配问题 \|/);
assert.match(full, /霍艺博/);
assert.match(full, /胡巧萍/);
assert.match(full, /跨班组集中在霍艺博 10项、胡巧萍 2项/);
assert.match(full, /7月不良 6/);
assert.match(full, /8月不良 6/);
assert.match(full, /不良数量靠后/);
assert.match(full, /接线问题 6项/);
assert.match(full, /装配问题 5项/);
assert.match(full, /关闭「接线问题」/);
assert.match(full, /关闭「装配问题」/);
assert.doesNotMatch(full, /关闭「W27」/);
assert.doesNotMatch(full, /关闭「W33」/);
assert.doesNotMatch(full, /仍有问题流出。/);
assert.doesNotMatch(full, /本期无待办/);
assert.doesNotMatch(full, /按本期不良逐条关闭/);
assert.doesNotMatch(full, /排名低|这把火在你身上/);
assert.doesNotMatch(full, /不得编造|明细不足/);
console.log("musk delivery acceptance passed");
console.log(outFile);