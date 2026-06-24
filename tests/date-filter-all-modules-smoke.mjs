import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseFiles, analyzeImported } from "../src/dataEngine.js";

const root = "C:\\Users\\77247\\Desktop\\半年报";
const moduleDirs = ["IQC", "IPQC", "OQC", "DQA"];
const input = [];

for (const module of moduleDirs) {
  const dir = join(root, module);
  for (const name of await readdir(dir)) {
    if (!/\.xlsx?$/i.test(name) || name.startsWith("~$")) continue;
    const bytes = await readFile(join(dir, name));
    input.push(new File([bytes], name));
  }
}

const parsed = await parseFiles(input);
const range = (month) => ({
  start2025: "2025-01-01",
  end2025: `2025-${String(month).padStart(2, "0")}-${new Date(2025, month, 0).getDate()}`,
  start2026: "2026-01-01",
  end2026: `2026-${String(month).padStart(2, "0")}-${new Date(2026, month, 0).getDate()}`,
});
const march = analyzeImported(parsed, range(3));
const june = analyzeImported(parsed, range(6));
const sumIpqc = (data) => Object.values(data.ipqc.siteMonthly || {}).flat().reduce((sum, row) => sum + row.y2025Qty + row.y2026Qty, 0);
const sumOqc = (data) => (data.oqc.monthlySummary?.divisions || []).reduce((sum, row) => sum + row.y2025Count + row.y2026Count, 0);
const sumDqa = (data) => (data.dqa.divisions || []).reduce((sum, row) => sum + (row.review || 0) + (row.production || 0) + (row.field || 0), 0);

const checks = {
  iqc: [march.kpis[0].detail, june.kpis[0].detail],
  ipqc: [sumIpqc(march), sumIpqc(june)],
  oqc: [sumOqc(march), sumOqc(june)],
  dqa: [sumDqa(march), sumDqa(june)],
};

if (!(checks.ipqc[1] > checks.ipqc[0])) throw new Error(`IPQC日期筛选未更新: ${checks.ipqc.join(" -> ")}`);
if (!(checks.oqc[1] > checks.oqc[0])) throw new Error(`OQC日期筛选未更新: ${checks.oqc.join(" -> ")}`);
if (!(checks.dqa[1] >= checks.dqa[0])) throw new Error(`DQA日期筛选异常: ${checks.dqa.join(" -> ")}`);
if (june.ipqc.siteMonthly.杭州.length !== 6) throw new Error("IPQC 1—6月横轴应为6个月");
if (march.ipqc.siteMonthly.杭州.length !== 3) throw new Error("IPQC 1—3月横轴应为3个月");
if (march.appliedDateRange?.end2026 !== "2026-03-31") throw new Error("分析结果未记录已应用日期");

console.log(JSON.stringify(checks, null, 2));
