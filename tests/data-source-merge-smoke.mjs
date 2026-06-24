import { mergeImportedSources } from "../src/dataStore.js";

const current = [
  { module: "IQC", name: "2025-2026年深圳.xlsx", rows: [{ old: true }] },
  { module: "IPQC", name: "IPQC深圳.xlsx", rows: [{ keep: true }] },
];
const incoming = [
  { module: "IQC", name: "2025-2026年深圳.xlsx", rows: [{ replacement: true }] },
  { module: "OQC", name: "评分汇总.xlsx", rows: [{ added: true }] },
];
const result = mergeImportedSources(current, incoming);
if (result.sources.length !== 3) throw new Error("替换后数据源数量错误");
if (!result.sources.find((item) => item.module === "IQC").rows[0].replacement) throw new Error("同名IQC数据源未替换");
if (result.replaced.length !== 1 || result.added.length !== 1) throw new Error("新增/替换结果错误");
console.log(JSON.stringify(result, null, 2));
