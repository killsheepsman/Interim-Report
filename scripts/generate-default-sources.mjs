import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

const projectRoot = path.resolve(process.cwd());
const sourceRoot = path.resolve(projectRoot, "..");
const sourceDirs = ["DQA", "IPQC", "IQC", "OQC"].map((name) => path.join(sourceRoot, name));
const { analyzeImported, parseFiles } = await import(pathToFileURL(path.join(projectRoot, "src", "dataEngine.js")).href);
const gzipAsync = promisify(gzip);

const writeGzipJson = async (filePath, value) => {
  const json = JSON.stringify(value);
  await fs.writeFile(filePath, json, "utf8");
  const gz = await gzipAsync(Buffer.from(json, "utf8"), { level: 9 });
  await fs.writeFile(`${filePath}.gz`, gz);
  return { rawBytes: Buffer.byteLength(json), gzBytes: gz.byteLength };
};

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
const sourcesOutput = path.join(projectRoot, "public", "defaultSources.json");
const sourcesSize = await writeGzipJson(sourcesOutput, parsed);
const defaultDateRange = {
  start2025: "2025-01-01",
  end2025: "2025-05-31",
  start2026: "2026-01-01",
  end2026: "2026-05-31",
};
const metaFiles = parsed.map(({ rows, ...file }) => ({ ...file, rows: [] }));
const analysis = analyzeImported(parsed, defaultDateRange);
const analysisOutput = path.join(projectRoot, "public", "defaultAnalysis.json");
const analysisSize = await writeGzipJson(analysisOutput, {
  generatedAt: new Date().toISOString(),
  dateRange: defaultDateRange,
  files: metaFiles,
  data: analysis,
});

const summary = parsed.reduce((acc, file) => {
  acc[file.module] = (acc[file.module] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  files: parsed.length,
  summary,
  output: `${sourcesOutput}.gz`,
  analysisOutput: `${analysisOutput}.gz`,
  compression: {
    sources: sourcesSize,
    analysis: analysisSize,
  },
}, null, 2));
