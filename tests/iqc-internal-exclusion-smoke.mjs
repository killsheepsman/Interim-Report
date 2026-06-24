import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseFiles, analyzeImported } from "../src/dataEngine.js";

const dir = "C:\\Users\\77247\\Desktop\\半年报\\IQC";
const names = (await readdir(dir)).filter((name) => name.endsWith(".xlsx") && !name.startsWith("~$"));
const files = [];
for (const name of names) files.push(new File([await readFile(join(dir, name))], name));
const parsed = await parseFiles(files);
const result = analyzeImported(parsed, {
  start2025: "2025-01-01", end2025: "2025-06-30",
  start2026: "2026-01-01", end2026: "2026-06-30",
});
for (const site of ["深圳", "杭州"]) {
  const external = result.iqc.qualityModes.accepted.siteMonthly[site].reduce((sum, row) => sum + row.y2025Qty + row.y2026Qty, 0);
  const internal = result.iqc.internalModes.accepted[site].monthly.reduce((sum, row) => sum + row.y2025Qty + row.y2026Qty, 0);
  if (!internal) throw new Error(`${site} 未生成一楼自制独立数据`);
  if (result.iqc.mainSuppliers[site].some((row) => /一楼自制|内部加工/.test(row.supplier))) throw new Error(`${site} 外部供应商名单仍包含一楼自制`);
  console.log(`${site}: external=${external}, internal=${internal}`);
}
const hzMay = result.iqc.qualityModes.accepted.siteMonthly.杭州.find((row) => row.month === "5月");
if (hzMay.y2026Qty !== 4121) throw new Error(`杭州2026年5月外部供应商总数应为4121，实际${hzMay.y2026Qty}`);
