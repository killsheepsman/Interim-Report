import { readFileSync, writeFileSync } from "fs";
import { compactDoamDataset, expandDoamDataset } from "../src/doamCompact.js";

const path = "public/doam-default.json";
const raw = JSON.parse(readFileSync(path, "utf8"));
const expanded = expandDoamDataset(raw);
const compact = compactDoamDataset(expanded);
const roundtrip = expandDoamDataset(compact);
if (roundtrip.units.length !== expanded.units.length) throw new Error("unit count mismatch");
if (roundtrip.categories.length !== expanded.categories.length) throw new Error("category count mismatch");
writeFileSync(path, JSON.stringify(compact));
console.log("default compact bytes", Buffer.byteLength(JSON.stringify(compact)), "units", compact.unitCount);
