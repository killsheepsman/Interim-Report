import { buildQualityAgentSnapshot, pickOqcAnalysisSnapshot, sliceOqcSnapshotToWindow } from "../src/agent/qualitySnapshot.js";
import { oqcFiveTarget, oqcTpmHeatmap } from "../src/agent/oqcShipmentSplit.js";
import { renderLieflatMatrixHeat, renderOqcTargetMatrix } from "../src/agent/lieflatRoleCharts.js";

const summary = (dept, tpm, year, month, score, count) => ({ 产品部: dept, TPM: tpm, 年份: year, 月份: month, 评分档位: score, 数量: count });
const machine = (date, category, qty, score) => ({ 日期: date, 机台分类: category, 机台数量: qty, 最终评分: score, 产品部: "产品一部", TPM: "甲" });
const files = [
  {
    module: "OQC",
    kind: "OQC_MONTHLY_SUMMARY",
    name: "2025年-2026年评分按月汇总.xlsx",
    rows: [
      summary("产品一部", "甲", 2026, 6, 3, 2),
      summary("产品一部", "乙", 2026, 6, 5, 10),
      summary("产品一部", "丁", 2026, 6, 4, 1),
      summary("产品一部", "乙", 2026, 5, 5, 8),
      summary("FPC事业部", "丙", 2026, 7, 5, 4),
      summary("组件部", "不应出现", 2026, 6, 1, 20),
    ],
  },
  {
    module: "OQC",
    kind: "OQC_SHIPMENT_DETAIL",
    name: "出货汇总.xlsx",
    rows: [
      machine("2026-06-10", "治具", 4, 5),
      machine("2026-06-11", "自动化", 1, 2),
      machine("2026-06-12", "组件", 9, 1),
    ],
  },
];
const period = { start2026: "2026-06-01", end2026: "2026-08-31" };
const snapshot = buildQualityAgentSnapshot({ data: { kpis: [], oqc: {} }, files, dateRange: period, module: "OQC" });
const split = snapshot.data.oqcSplit;
const semi = split.divisions.find((item) => item.name === "半导体&北美");
if (semi.count !== 13) throw new Error("半导体出货应为13，实际 " + semi.count);
if (semi.fiveRate !== 76.9) throw new Error("5分率应为76.9，实际 " + semi.fiveRate);
if (semi.lowRate !== 15.4) throw new Error("低分率应为15.4，实际 " + semi.lowRate);
if (semi.ytdCount !== 21 || semi.ytdFiveRate !== 85.7 || semi.ytdAvg !== 4.76 || semi.ytdLowRate !== 9.5) throw new Error("半导体年度累计不对 " + JSON.stringify({ count: semi.ytdCount, five: semi.ytdFiveRate, avg: semi.ytdAvg, low: semi.ytdLowRate }));
const yi = split.tpms.find((item) => item.name === "乙");
if (!yi || yi.ytdCount !== 18 || yi.ytdFiveRate !== 100) throw new Error("乙的年度累计应含 5 月");
if (!split.focus.some((item) => item.name === "丁" && item.count === 1)) throw new Error("出货1台也要进入关注");
if (split.focus.some((item) => item.name === "乙")) throw new Error("乙不低于本产品部，不应点名");
if (split.tpms.some((item) => item.name === "不应出现")) throw new Error("非产品部不应进入 TPM");
const fixture = split.machines.find((item) => item.name === "治具");
const auto = split.machines.find((item) => item.name === "自动化");
if (fixture.count !== 4 || fixture.share !== 80) throw new Error("治具数量或比例不对");
if (auto.count !== 1 || auto.lowRate !== 100) throw new Error("自动化低分不对");
if (split.machines.some((item) => item.name === "组件")) throw new Error("组件不应进入整机");
const sliced = sliceOqcSnapshotToWindow(snapshot, { start: "2026-07-01", end: "2026-07-31" }, period);
const slicedFpc = sliced.data.oqcSplit.divisions.find((item) => item.name === "FPC事业部");
const slicedSemi = sliced.data.oqcSplit.divisions.find((item) => item.name === "半导体&北美");
if (slicedFpc.count !== 4) throw new Error("7月只应保留 FPC");
if (slicedSemi.count !== 0) throw new Error("7月不应保留 6月半导体");
if (slicedSemi.previousFiveRate !== 76.9) throw new Error("上月应取 6月");
const picked = pickOqcAnalysisSnapshot([{ active: true, module: "OQC", snapshot, dateRange: period, generatedAt: "2026-10-08" }], { start2026: "2026-07-01", end2026: "2026-07-31" });
if (picked?.matchLevel !== "coverage") throw new Error("覆盖快照没有命中");

const heat = oqcTpmHeatmap(split, "半导体&北美");
const june = heat.columns.indexOf("6月");
const may = heat.columns.indexOf("5月");
const yiRow = heat.rows.find((row) => row.label === "乙");
const jiaRow = heat.rows.find((row) => row.label === "甲");
if (!heat.columns.includes("8月") || heat.columns.includes("9月")) throw new Error("热力图应从 1 月画到所选截止月");
if (!yiRow || yiRow.cells[may].value !== 100 || yiRow.cells[june].value !== 100) throw new Error("乙的 5 月和 6 月应为 100");
if (yiRow.cells[heat.columns.indexOf("1月")].count !== 0) throw new Error("没有出货不能写成 0 分率");
if (!jiaRow || jiaRow.cells[june].value !== 0 || jiaRow.cells[june].count !== 2) throw new Error("甲 6 月出货但不是 5 分，应显示 0 而不是空点");
const html = renderLieflatMatrixHeat({ title: "半导体&北美 · 各TPM 5分率", columns: heat.columns, rows: heat.rows });
if (!html.includes("lieflat-heat") || !html.includes("乙") || !html.includes(">100<") || !html.includes("没有出货")) throw new Error("热力图没有按 L16 画出");
const july = oqcTpmHeatmap(sliced.data.oqcSplit, "半导体&北美");
if (july.columns.includes("8月") || !july.columns.includes("7月")) throw new Error("切到 7 月后热力图不应再画 8 月");
const fpc = oqcTpmHeatmap(sliced.data.oqcSplit, "FPC事业部");
const bing = fpc.rows.find((row) => row.label === "丙");
if (!bing || bing.cells[fpc.columns.indexOf("7月")].value !== 100) throw new Error("丙的 7 月 5分率应为 100");

const mappings = [
  { productDept: "北美项目部", projectGroup: "北美项目部", productionDirector: "黄敏", tpm: "乙", pm: "甲", active: true },
  { productDept: "传感器产品部", projectGroup: "传感器产品部", productionDirector: "黄敏", tpm: "甲", pm: "甲", active: true },
];
if (oqcFiveTarget("FPC事业部", "") !== 60 || oqcFiveTarget("半导体&北美", "北美项目部") !== 65 || oqcFiveTarget("半导体&北美", "IC载版") !== 70 || oqcFiveTarget("半导体&北美", "") !== null) throw new Error("5分达标线不对");
const scored = oqcTpmHeatmap(split, "半导体&北美", mappings);
const yiScored = scored.rows.find((row) => row.name === "乙");
const jiaScored = scored.rows.find((row) => row.name === "甲");
if (!yiScored || yiScored.target !== 65 || yiScored.cells[june].avg !== 5 || yiScored.cells[june].lowRate !== 0) throw new Error("乙应按北美项目部 65%，平均分 5");
if (!jiaScored || jiaScored.target !== 70 || jiaScored.cells[june].avg !== 3 || jiaScored.cells[june].lowRate !== 100) throw new Error("甲应按传感器 70%，6月平均分 3、低分率 100");
const card = renderOqcTargetMatrix({ title: "半导体&北美 · 各TPM", columns: scored.columns, rows: scored.rows, division: "半导体&北美" });
if (!card.includes("#1F7A45") || !card.includes("#C4473A") || !card.includes(">100%<") || !card.includes(">3<") || !card.includes("100%")) throw new Error("达标矩阵没有画出红绿和三个数字");
if (!card.includes("stroke=\"#FFFFFF\"") && !card.includes('stroke="#FFFFFF"')) throw new Error("底色冲突时没有白色字边");
if (scored.columns.at(-1) !== "累计") throw new Error("达标矩阵最后一列应为累计");
const yiTotal = yiScored.cells.at(-1);
if (!yiTotal || yiTotal.count !== 18 || yiTotal.value !== 100 || yiTotal.avg !== 5) throw new Error("乙的累计应含5月和6月，5分率100，平均分5");
console.log("oqc shipment snapshot ok", { semi: semi.count + "/" + semi.fiveRate, focus: split.focus.map((item) => item.name).join("、") });
