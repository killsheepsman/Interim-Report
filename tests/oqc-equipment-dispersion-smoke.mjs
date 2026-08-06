import { buildOqcEquipmentDispersion, buildOqcStandardCategoryBreakdown, buildOqcRuleDimensionDispersion, buildOqcRuleDimensionDispersions, remapOqcEquipmentDispersion } from "../src/dataEngine.js";
import { buildOqcRuleDimensionChartCache } from "../src/dataEngine.js";

const qualified = { "产品部": "FPC事业部", "最终评分": 5 };
const shipmentRows = [
  { ...qualified, "日期": "2025-01-05", "治具名称": "项目A", "机台分类": "治具", "机台数量": 1, "SN码": "A-01" },
  { ...qualified, "日期": "2025-01-05", "治具名称": "项目A", "机台分类": "治具", "机台数量": 1, "SN码": "A-01" },
  { ...qualified, "日期": "2025-01-06", "治具名称": "项目A", "机台分类": "治具", "机台数量": 2, "SN码": "A-02" },
  { ...qualified, "日期": "2025-02-06", "治具名称": "项目B", "机台分类": "自动化", "机台数量": 4, "SN码": "B-01" },
  { ...qualified, "日期": "2026-01-08", "治具名称": "项目A", "机台分类": "治具", "机台数量": 2, "SN码": "A-26" },
  { ...qualified, "日期": "2026-02-08", "治具名称": "项目C", "机台分类": "自动化", "机台数量": 1, "SN码": "C-26" },
];
const data = buildOqcEquipmentDispersion(shipmentRows);

const overall = data.scopes.find((item) => item.key === "overall");
const fixture = data.scopes.find((item) => item.key === "fixture");
const automation = data.scopes.find((item) => item.key === "automation");

if (data.sourceRecordCount !== 6) throw new Error(`Expected all qualifying shipment rows to be retained, got ${data.sourceRecordCount}`);
if (overall.y2025.projectCount !== 2 || overall.y2025.machineCount !== 8) throw new Error("2025 overall project aggregation failed");
if (overall.y2026.projectCount !== 2 || overall.y2026.machineCount !== 3) throw new Error("2026 overall project aggregation failed");
if (fixture.y2025.machineCount !== 4 || fixture.y2026.machineCount !== 2) throw new Error("Fixture scope aggregation failed");
if (automation.y2025.machineCount !== 4 || automation.y2026.machineCount !== 1) throw new Error("Automation scope aggregation failed");
if (JSON.stringify(overall.y2025.quantityDistribution) !== JSON.stringify([{ quantity: 4, projects: 2 }])) throw new Error("Actual equipment quantity distribution failed");
if (JSON.stringify(overall.y2026.quantityDistribution) !== JSON.stringify([{ quantity: 1, projects: 1 }, { quantity: 2, projects: 1 }])) throw new Error("2026 equipment quantity distribution failed");
if (overall.continuedProjectCount !== 1 || overall.newProjectCount !== 1 || overall.discontinuedProjectCount !== 1) throw new Error("Cross-year project continuity calculation failed");
if (overall.sameProjectRows[0]?.name !== "项目A" || overall.sameProjectRows[0]?.deltaQuantity !== -2) throw new Error("Same-name project delta calculation failed");

const mapped = buildOqcEquipmentDispersion(shipmentRows, {
  projectNameResolver: (name) => name === "项目A" || name === "项目B" ? "标准项目AB" : name,
});
const mappedOverall = mapped.scopes.find((item) => item.key === "overall");
if (mappedOverall.y2025.projectCount !== 1 || mappedOverall.y2025.machineCount !== 8) throw new Error("Standard project mapping must merge only confirmed source names");
if (mappedOverall.y2026.projectCount !== 2 || mappedOverall.y2026.machineCount !== 3) throw new Error("Unmapped project names must remain independent");

const savedMapping = [{ standardName: "标准项目AB", sourceNames: ["项目A", "项目B"], key: { client: "YM", customerProductCategory: "消费电子", series: "MFS", businessCategory: "OEM", productForm: "双工位", detailCategory: "功能", process: "OQC" }, bindings: [{ sourceName: "项目A", key: { client: "YM", customerProductCategory: "消费电子", series: "MFS", businessCategory: "OEM", productForm: "双工位", detailCategory: "功能", process: "OQC" } }, { sourceName: "项目B", key: { client: "YM", customerProductCategory: "消费电子", series: "MFS", businessCategory: "OEM", productForm: "双工位", detailCategory: "功能", process: "OQC" } }] }];
const remapped = remapOqcEquipmentDispersion(data, savedMapping);
const remappedOverall = remapped.scopes.find((item) => item.key === "overall");
if (remappedOverall.y2025.machineCount !== overall.y2025.machineCount || remappedOverall.y2026.machineCount !== overall.y2026.machineCount) throw new Error("Remapped view must reuse the exact original record set");
const fixtureBreakdown = buildOqcStandardCategoryBreakdown(data, savedMapping).find((item) => item.key === "fixture");
if (fixtureBreakdown.groups[0]?.classificationKey !== "YM / 消费电子 / MFS / OEM / 双工位 / 功能 / OQC") throw new Error("Seven-field standard category breakdown failed");

const classified = buildOqcRuleDimensionDispersion({ sourceRecords: [
  { year: 2025, division: "FPC事业部", sourceProjectName: "YMSZ MFS W2 A DOS 双工位治具 RF", machineCategory: "治具", quantity: 2, score: 5 },
  { year: 2025, division: "FPC事业部", sourceProjectName: "历史项目-未编码", machineCategory: "治具", quantity: 3, score: 5 },
] }, { rules: { fields: {
  client: [{ code: "MFS", name: "Mflex" }], customerProductCategory: [{ code: "MOB", name: "消费电子" }], series: [{ code: "W2", name: "W2系列" }], businessCategory: [{ code: "OEM", name: "OEM" }], productForm: [{ code: "DOS", name: "双工位" }], detailCategory: [{ code: "DWS", name: "双工位治具" }], process: [{ code: "RF", name: "射频" }],
} } }, "client");
const classifiedOverall = classified.dispersion.scopes.find((item) => item.key === "overall");
if (classifiedOverall.y2025.machineCount !== 5 || classifiedOverall.y2025.projectRows.reduce((sum, row) => sum + row.quantity, 0) !== 5) throw new Error("Rule-dimension classification must retain unknown records and total machines");
if (classified.unknownRecordCount !== 1) throw new Error("Unrecognized rule records must be retained as an explicit bucket");

const newDimensions = ["client", "customerProductCategory", "series", "businessCategory", "productForm", "detailCategory", "process"];
const newRuleMapping = { rules: { fields: {
  client: [{ code: "MFS", name: "Mflex" }],
  customerProductCategory: [{ code: "MOB", name: "Mobile" }],
  series: [{ code: "W2", name: "W2 Series" }],
  businessCategory: [{ code: "OEM", name: "OEM" }],
  productForm: [{ code: "AUTO", name: "Automation" }],
  detailCategory: [{ code: "DWS", name: "Dual Station" }],
  process: [{ code: "RF", name: "RF" }],
} } };
const newDimensionSource = { sourceRecords: [
  { year: 2025, division: "FPC", sourceProjectName: "MFS MOB W2 OEM AUTO DWS RF", machineCategory: "fixture", quantity: 6, score: 5 },
  { year: 2025, division: "FPC", sourceProjectName: "legacy-unmatched", machineCategory: "fixture", quantity: 4, score: 5 },
] };
newDimensions.forEach((dimension) => {
  const result = buildOqcRuleDimensionDispersion(newDimensionSource, newRuleMapping, dimension);
  const total = result.dispersion.scopes.find((item) => item.key === "overall").y2025.projectRows.reduce((sum, row) => sum + row.quantity, 0);
  if (total !== 10 || result.unknownRecordCount !== 1) throw new Error(`${dimension} classification must retain every machine in an explicit unknown bucket`);
});
const batchedResults = buildOqcRuleDimensionDispersions(newDimensionSource, newRuleMapping, newDimensions);
newDimensions.forEach((dimension) => {
  const total = batchedResults[dimension].dispersion.scopes.find((item) => item.key === "overall").y2025.projectRows.reduce((sum, row) => sum + row.quantity, 0);
  if (total !== 10 || batchedResults[dimension].unknownRecordCount !== 1) throw new Error(`${dimension} batched classification must preserve the single-dimension result`);
});

const compactCache = buildOqcRuleDimensionChartCache(newDimensionSource, newRuleMapping, newDimensions);
newDimensions.forEach((dimension) => {
  const total = compactCache[dimension].y2025.reduce((sum, row) => sum + row.quantity, 0);
  if (total !== 10) throw new Error(`${dimension} compact rule cache must retain the complete machine total`);
});

console.log("OQC equipment dispersion smoke test passed");
