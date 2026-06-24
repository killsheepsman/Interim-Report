import { readFile } from "node:fs/promises";
import { parseFiles, analyzeImported } from "../src/dataEngine.js";

const url = new URL("../../IPQC/2025-2026年IPQC检验记录(杭州).xlsx", import.meta.url);
const bytes = await readFile(url);
const parsed = await parseFiles([new File([bytes], "2025-2026年IPQC检验记录(杭州).xlsx")]);
const rows = parsed[0].rows;
const num = (value) => Number(value) || 0;
const byJsMonth = rows.filter((row) => row["日期"] instanceof Date && row["日期"].getFullYear() === 2026 && row["日期"].getMonth() === 4);
const byIso = rows.filter((row) => String(row["日期"]?.toISOString?.()).startsWith("2026-05"));
const sum = (source) => ({
  rows: source.length,
  qty: source.reduce((total, row) => total + num(row["送检数"]), 0),
  bad: source.reduce((total, row) => total + num(row["不良数"]), 0),
});
const result = analyzeImported(parsed, {
  start2025: "2025-01-01", end2025: "2025-06-30",
  start2026: "2026-01-01", end2026: "2026-06-30",
});
const expectedMay = { y2025Qty: 1886, y2025Bad: 624, y2026Qty: 3366, y2026Bad: 635 };
for (const [key, value] of Object.entries(expectedMay)) {
  if (result.ipqc.siteMonthly.杭州[4][key] !== value) throw new Error(`杭州5月 ${key} expected ${value}, got ${result.ipqc.siteMonthly.杭州[4][key]}`);
}
console.log(JSON.stringify({
  jsMonth: sum(byJsMonth),
  isoMonth: sum(byIso),
  firstDates: rows.slice(-1800, -1750).map((row) => [row["日期"], row["送检数"], row["不良数"]]).slice(0, 10),
  engineMay: result.ipqc.siteMonthly.杭州[4],
}, null, 2));
