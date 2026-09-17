import { doamUnitsByCategory, doamTpmAverages, doamCategoryTop } from "../src/doamEngine.js";

const units = [
  { d: "2026-08-01", s: "白班", m: "A1", t: "王辉", e: "共同机型", p: "FPC事业部", k: "太原富士康", y: 2026, o: 8, a: 100 },
  { d: "2026-08-02", s: "白班", m: "A1", t: "王辉", e: "共同机型", p: "FPC事业部", k: "太原富士康", y: 2026, o: 8, a: 50 },
  { d: "2026-08-01", s: "白班", m: "B1", t: "林秋秋", e: "真空机", p: "产品五部", k: "苏州维信", y: 2026, o: 8, a: 80 },
];
const categories = [
  { y: 2026, t: "王辉", c: "取料/丢料", e: "共同机型", a: 90, ms: ["A1"], ds: ["2026-08-01", "2026-08-02"] },
  { y: 2026, t: "林秋秋", c: "真空/吸附", e: "真空机", a: 80, ms: ["B1"], ds: ["2026-08-01"] },
];

const pickupUnits = doamUnitsByCategory(units, categories, "取料/丢料");
if (pickupUnits.length !== 2) throw new Error("pickup should keep 王辉 two shifts, got " + pickupUnits.length);
if (pickupUnits.some((row) => row.t === "林秋秋")) throw new Error("pickup drill should drop 林秋秋 machines");
const pickupAlarms = pickupUnits.reduce((sum, row) => sum + row.a, 0);
if (Math.abs(pickupAlarms - 90) > 0.01) throw new Error("allocated alarms should equal category total 90, got " + pickupAlarms);

const tpm = doamTpmAverages(pickupUnits, {});
if (tpm.length !== 1 || tpm[0].name !== "王辉") throw new Error("TPM chart should only show 王辉 after category drill");

const allCats = doamCategoryTop(categories, {}, units);
if (!allCats.some((row) => row.name === "取料/丢料") || !allCats.some((row) => row.name === "真空/吸附")) throw new Error("category chart itself should still list both categories");

const filteredByTpm = doamCategoryTop(categories, { tpm: "王辉" }, units);
if (filteredByTpm.some((row) => row.name === "真空/吸附")) throw new Error("category chart should follow TPM filter");

console.log("doam category drill smoke: ok");
