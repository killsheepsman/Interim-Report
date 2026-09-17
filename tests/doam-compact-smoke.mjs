import { compactDoamDataset, expandDoamDataset } from "../src/doamCompact.js";

const dataset = {
  units: [
    { d: "2026-08-01", s: "白班", m: "A||M1", t: "王辉", e: "A", p: "FPC事业部", k: "太原富士康", y: 2026, o: 8, a: 12 },
    { d: "2026-08-02", s: "晚班", m: "A||M1", t: "王辉", e: "A", p: "FPC事业部", k: "太原富士康", y: 2026, o: 8, a: 8 },
  ],
  categories: [{ y: 2026, t: "王辉", c: "取料/丢料", e: "A", a: 20, ms: ["A||M1"], ds: ["2026-08-01", "2026-08-02"] }],
  quality: { rowCount: 100, files: ["a.csv"] },
  files: ["a.csv"],
};
const compact = compactDoamDataset(dataset);
if (compact.v !== 2 || compact.unitCount !== 2) throw new Error("compact shape");
const expanded = expandDoamDataset(compact);
if (expanded.units.length !== 2) throw new Error("expand units");
if (expanded.units[0].t !== "王辉" || expanded.units[1].a !== 8) throw new Error("expand values");
if (expanded.categories[0].ms[0] !== "A||M1") throw new Error("expand machines");
const legacy = expandDoamDataset(dataset);
if (legacy.units[0].d !== "2026-08-01") throw new Error("legacy passthrough");
console.log("doam compact smoke: ok");
