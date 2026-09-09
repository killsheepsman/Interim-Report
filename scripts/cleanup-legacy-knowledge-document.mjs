import { promises as fs } from "node:fs";
import path from "node:path";

const [fileName, documentId] = process.argv.slice(2);
if (!fileName || !documentId) throw new Error("Usage: node cleanup-legacy-knowledge-document.mjs <store.json> <document-id>");

const resolved = path.resolve(fileName);
const source = await fs.readFile(resolved, "utf8");
const store = JSON.parse(source);
const before = {};
const keys = ["documents", "clauses", "jobs", "knowledge", "matches"];
for (const key of keys) {
  const rows = Array.isArray(store[key]) ? store[key] : [];
  before[key] = rows.length;
  store[key] = rows.filter((item) => item?.id !== documentId && item?.documentId !== documentId);
}
const backup = `${resolved}.before-delete-${documentId.slice(0, 8)}.bak`;
const temporary = `${resolved}.${process.pid}.tmp`;
await fs.copyFile(resolved, backup);
await fs.writeFile(temporary, JSON.stringify(store), "utf8");
await fs.rename(temporary, resolved);
const removed = Object.fromEntries(keys.map((key) => [key, before[key] - store[key].length]));
console.log(JSON.stringify({ documentId, removed, backup, sizeBefore: Buffer.byteLength(source), sizeAfter: (await fs.stat(resolved)).size }));
