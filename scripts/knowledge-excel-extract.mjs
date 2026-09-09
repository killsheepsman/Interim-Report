import fs from "node:fs";
import XLSX from "xlsx";

const [source, target] = process.argv.slice(2);
const workbook = XLSX.readFile(source, { cellDates: true });
const segments = [];
let embeddedImageCount = 0;
for (const sheet of workbook.SheetNames) {
  const ws = workbook.Sheets[sheet];
  if (Array.isArray(ws?.['!images'])) embeddedImageCount += ws['!images'].length;
}
for (const sheet of workbook.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: "", blankrows: false });
  rows.forEach((row, index) => {
    const values = row.map((cell) => String(cell ?? "").trim()).filter(Boolean);
    if (values.length) segments.push({ text: `${sheet} | ${values.join(" | ")}`, metadata: { locatorType: "sheet-row", locator: `${sheet}!第${index + 1}行`, sheet, row: index + 1 } });
  });
}
fs.writeFileSync(target, JSON.stringify({ segments, embeddedImageCount, imageExtraction: embeddedImageCount ? "detected_not_decoded" : "none_detected" }), "utf8");
