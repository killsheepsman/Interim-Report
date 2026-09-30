import { promises as fs } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { parseOrgMappingMatrix } from "../src/orgMappingParse.js";

export const orgMappingFilePath = (rootDir) => path.resolve(rootDir, "..", "半年报数据", "1-8月数据", "DQA", "研发组织映射表.xlsx");

export const readLinkedOrgMapping = async (filePath) => {
  const stat = await fs.stat(filePath);
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const rows = workbook.SheetNames.flatMap((name) => parseOrgMappingMatrix(XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", blankrows: false })));
  if (!rows.length) throw new Error("研发组织映射表没有读到产品部、项目组、产总、TPM、PM");
  return { path: filePath, fileName: path.basename(filePath), mtimeMs: stat.mtimeMs, count: rows.length, rows };
};
