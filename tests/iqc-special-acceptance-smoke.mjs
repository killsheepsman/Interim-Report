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
  const accepted = result.iqc.qualityModes.accepted.siteMonthly[site];
  const rejected = result.iqc.qualityModes.rejected.siteMonthly[site];
  const acceptedBad = accepted.reduce((sum, row) => sum + row.y2026Bad, 0);
  const rejectedBad = rejected.reduce((sum, row) => sum + row.y2026Bad, 0);
  const special = result.iqc.specialAnalysis[site].monthly.reduce((sum, row) => sum + row.y2026Bad, 0);
  if (rejectedBad - acceptedBad !== special) throw new Error(`${site} 特采口径差额不等于特采数量: ${rejectedBad}-${acceptedBad} != ${special}`);
  if (!result.iqc.specialAnalysis[site].evidence.length) throw new Error(`${site} 缺少特采证据分类`);
}
console.log(JSON.stringify(Object.fromEntries(["深圳", "杭州"].map((site) => {
  const special = result.iqc.specialAnalysis[site];
  return [site, {
    acceptedRate: result.iqc.qualityModes.accepted.siteMonthly[site].map((row) => row.y2026Rate),
    rejectedRate: result.iqc.qualityModes.rejected.siteMonthly[site].map((row) => row.y2026Rate),
    evidence: special.evidence,
    designEvidenceRows: special.designEvidence.length,
  }];
})), null, 2));
