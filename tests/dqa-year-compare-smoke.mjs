import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseFiles, analyzeImported } from "../src/dataEngine.js";

const dir = "C:\\Users\\77247\\Desktop\\半年报\\DQA";
const names = (await readdir(dir)).filter((name) => name.endsWith(".xlsx") && !name.startsWith("~$"));
const files = [];
for (const name of names) files.push(new File([await readFile(join(dir, name))], name));
const parsed = await parseFiles(files);
if (parsed.some((file) => file.module !== "DQA")) throw new Error("Some DQA files were not detected");
const result = analyzeImported(parsed, {
  start2025: "2025-01-01", end2025: "2025-12-31",
  start2026: "2026-01-01", end2026: "2026-06-30",
});
const compare = result.dqa.yearCompare;
if (!compare || compare.divisionNames[0] !== "半导体&北美") throw new Error("Division display mapping failed");
for (const division of compare.divisionNames) {
  if (!compare.byTpm[division]) throw new Error(`TPM comparison missing for ${division}`);
}
console.log(JSON.stringify({
  files: parsed.map((file) => ({ name: file.name, rows: file.rows.length })),
  divisions: compare.byDivision.stages,
  tpmsByDivision: compare.tpmsByDivision,
  categories: compare.categoryValues,
  disciplines: compare.disciplineValues,
}, null, 2));
