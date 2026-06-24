import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseFiles, analyzeImported } from "../src/dataEngine.js";

const dir = "C:\\Users\\77247\\Desktop\\半年报\\OQC";
const names = await readdir(dir);
const name = names.find((item) => item.includes("按月汇总") && !item.startsWith("~$"));
const bytes = await readFile(join(dir, name));
const parsed = await parseFiles([new File([bytes], name)]);
const result = analyzeImported(parsed, {
  start2025: "2025-01-01", end2025: "2025-05-31",
  start2026: "2026-01-01", end2026: "2026-05-31",
});

if (parsed[0].kind !== "OQC_MONTHLY_SUMMARY") throw new Error("OQC monthly summary kind not detected");
if (!result.oqc.monthlySummary?.divisions?.length) throw new Error("OQC division summary missing");
if (result.oqc.monthlySummary.fpcTpm.length !== 5) throw new Error("FPC TPM count should be 5");

console.log(JSON.stringify({
  parsed: { kind: parsed[0].kind, rows: parsed[0].rows.length, first: parsed[0].rows[0] },
  divisions: result.oqc.monthlySummary.divisions,
  fpcTpm: result.oqc.monthlySummary.fpcTpm,
  divisionMonthly: result.oqc.monthlySummary.divisionMonthly,
  fpcMonthly: result.oqc.monthlySummary.fpcMonthly,
  kpi: result.kpis[2],
}, null, 2));
