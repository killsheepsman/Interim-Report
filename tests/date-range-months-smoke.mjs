import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFiles, analyzeImported } from "../src/dataEngine.js";

const root = "C:\\Users\\77247\\Desktop\\半年报";
const sources = [
  join(root, "IQC", "2025-2026年深圳.xlsx"),
  join(root, "IPQC", "2025-2026年IPQC检验记录(深圳).xlsx"),
];
const files = [];
for (const path of sources) {
  const name = path.split("\\").at(-1);
  files.push(new File([await readFile(path)], name));
}
const parsed = await parseFiles(files);
const result = analyzeImported(parsed, {
  start2025: "2025-01-01", end2025: "2025-08-10",
  start2026: "2026-01-01", end2026: "2026-08-10",
});
const iqcMonths = result.iqc.siteMonthly.深圳.map((row) => row.month);
const ipqcMonths = result.ipqc.siteMonthly.深圳.map((row) => row.month);
if (iqcMonths.at(-1) !== "8月" || iqcMonths.length !== 8) throw new Error(`IQC month range failed: ${iqcMonths}`);
if (ipqcMonths.at(-1) !== "8月" || ipqcMonths.length !== 8) throw new Error(`IPQC month range failed: ${ipqcMonths}`);
console.log(JSON.stringify({ iqcMonths, ipqcMonths }, null, 2));
