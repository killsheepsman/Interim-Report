import { readFile } from "node:fs/promises";
import { parseFiles, analyzeImported } from "../src/dataEngine.js";

const sources = [
  ["../../IQC/2025-2026年深圳.xlsx", "IQC"],
  ["../../IPQC/2025-2026年IPQC检验记录(深圳).xlsx", "IPQC"],
  ["../../IPQC/2025-2026年IPQC检验记录(杭州).xlsx", "IPQC"],
  ["../../OQC/2025年-2026年评分按月汇总.xlsx", "OQC"],
  ["../../DQA/2026年产品五部部研发问题汇总.xlsx", "DQA"],
];

const files = [];
for (const [relative, expected] of sources) {
  const url = new URL(relative, import.meta.url);
  const bytes = await readFile(url);
  const name = decodeURIComponent(url.pathname.split("/").pop());
  const file = new File([bytes], name);
  files.push(file);
}

const parsed = await parseFiles(files);
for (let i = 0; i < parsed.length; i += 1) {
  if (parsed[i].module !== sources[i][1]) {
    throw new Error(`${parsed[i].name} expected ${sources[i][1]}, got ${parsed[i].module}`);
  }
}

const result = analyzeImported(parsed);
if (!result.kpis.every((item) => Number.isFinite(item.value))) {
  throw new Error("Imported KPI calculation returned a non-finite value");
}
const filtered = analyzeImported(parsed, {
  start2025: "2025-01-01", end2025: "2025-03-31",
  start2026: "2026-01-01", end2026: "2026-03-31",
});
if (!filtered.kpis.every((item) => Number.isFinite(item.value))) {
  throw new Error("Date-filtered KPI calculation returned a non-finite value");
}

console.log(JSON.stringify({
  modules: parsed.map((file) => ({ name: file.name, module: file.module, rows: file.rows.length })),
  kpis: result.kpis.map((item) => ({ label: item.label, value: item.value })),
  filteredPeriod: filtered.period,
  filteredKpis: filtered.kpis.map((item) => ({ label: item.label, value: item.value })),
  ipqcSites: Object.fromEntries(Object.entries(filtered.ipqc.siteMonthly || {}).map(([site, rows]) => [site, {
    components: rows.reduce((sum, row) => sum + row.y2025Qty + row.y2026Qty, 0),
    issues: rows.reduce((sum, row) => sum + row.y2025Bad + row.y2026Bad, 0),
    workshops: filtered.ipqc.workshopsBySite?.[site]?.length || 0,
    categories: filtered.ipqc.contentTypesBySite?.[site]?.length || 0,
  }])),
}, null, 2));
