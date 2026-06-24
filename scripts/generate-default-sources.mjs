import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = path.resolve(process.cwd());
const sourceRoot = path.resolve(projectRoot, "..");
const sourceDirs = ["DQA", "IPQC", "IQC", "OQC"].map((name) => path.join(sourceRoot, name));
const { analyzeImported, parseFiles } = await import(pathToFileURL(path.join(projectRoot, "src", "dataEngine.js")).href);

const workbooks = [];
for (const dir of sourceDirs) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith("~$") || !/\.xlsx?$/i.test(entry.name)) continue;
      workbooks.push(path.join(dir, entry.name));
    }
  } catch {
    console.warn(`跳过不存在的数据目录：${dir}`);
  }
}

workbooks.sort((a, b) => a.localeCompare(b, "zh-CN"));

const fileLikes = await Promise.all(workbooks.map(async (fullPath) => {
  const buffer = await fs.readFile(fullPath);
  return {
    name: path.basename(fullPath),
    size: buffer.byteLength,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}));

const parsed = await parseFiles(fileLikes);
for (const source of parsed) {
  const original = workbooks.find((item) => path.basename(item) === source.name);
  source.defaultSource = true;
  source.sourceFolder = original ? path.basename(path.dirname(original)) : "";
  source.importedAt = new Date().toISOString();
}

await fs.mkdir(path.join(projectRoot, "public"), { recursive: true });
await fs.writeFile(path.join(projectRoot, "public", "defaultSources.json"), JSON.stringify(parsed), "utf8");
const defaultDateRange = {
  start2025: "2025-01-01",
  end2025: "2025-05-31",
  start2026: "2026-01-01",
  end2026: "2026-06-30",
};
const metaFiles = parsed.map(({ rows, ...file }) => ({ ...file, rows: [] }));
const analysis = analyzeImported(parsed, defaultDateRange);
await fs.writeFile(path.join(projectRoot, "public", "defaultAnalysis.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  dateRange: defaultDateRange,
  files: metaFiles,
  data: analysis,
}), "utf8");

const summary = parsed.reduce((acc, file) => {
  acc[file.module] = (acc[file.module] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  files: parsed.length,
  summary,
  output: path.join(projectRoot, "public", "defaultSources.json"),
  analysisOutput: path.join(projectRoot, "public", "defaultAnalysis.json"),
}, null, 2));
