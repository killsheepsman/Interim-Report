import { canonicalProductDept, normalizeOrgRecord } from "../orgMappingParse.js";
export const pmPerson = (value) => String(value || "").replace(/\s+/g, " ").trim();
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : []).map(pmPerson).filter(Boolean))];
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const ratePercent = (numerator, denominator) => {
  const den = Number(denominator) || 0;
  if (den <= 0) return null;
  return Number(((Number(numerator) || 0) / den * 100).toFixed(2));
};
export const normalizeIssueDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value || "").trim();
  const iso = raw.match(/(20\d{2})[-/.年T](\d{1,2})[-/.月](\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const excel = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!Number.isNaN(excel.getTime())) return normalizeIssueDate(excel);
  }
  return "";
};
const inRange = (date, range = {}) => {
  const key = normalizeIssueDate(date);
  if (!key) return false;
  const start = normalizeIssueDate(range.start) || String(range.start || "").slice(0, 10);
  const end = normalizeIssueDate(range.end) || String(range.end || "").slice(0, 10);
  if (start && key < start) return false;
  if (end && key > end) return false;
  return true;
};
const dqaBusinessDateKey = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const date = [15, 16].includes(value.getUTCHours())
      ? new Date(value.getTime() + 8 * 60 * 60 * 1000 + 60 * 1000)
      : value;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  return normalizeIssueDate(value);
};
const inDqaDateRange = (date, range = {}) => {
  const key = dqaBusinessDateKey(date);
  if (!key) return false;
  const start = String(range.start || "").slice(0, 10);
  const end = String(range.end || "").slice(0, 10);
  if (start && key < start) return false;
  if (end && key > end) return false;
  return true;
};
const rowPm = (row = {}) => pmPerson(row.PM || row["项目经理"] || row.pm);
export const selectedRolePeriod = (range = {}) => {
  const start = String(range._periodStart || range.start || "").slice(0, 10);
  const end = String(range._periodEnd || range.end || "").slice(0, 10);
  return { ...range, start, end, _periodStart: start, _periodEnd: end };
};
const selectedMonthWindow = (range = {}) => {
  const selected = selectedRolePeriod(range);
  return { start: selected.start.slice(0, 7), end: selected.end.slice(0, 7) };
};
const rowDateValue = (row = {}) => row?.发生日期 || row?.日期 || row?.检验日期 || row?.问题日期 || row?.创建时间 || row?.申请日期 || row?.date || row?.__date || "";
const monthLabel = (date) => {
  const key = normalizeIssueDate(date);
  return key ? key.slice(0, 7) : "";
};
const issueEngineerNames = (row = {}) => unique([
  row["研发工程师"], row["工程师"], row["RD工程师"], row["工程师姓名"],
  row["责任人/处理人"], row["责任人\\处理人"], row["责任人"], row["申请人"], row["创建人"], row.__engineer,
]);

export const recordsForPm = (metrics = {}, pm = "") => {
  const name = pmPerson(pm);
  if (!name) return [];
  return (Array.isArray(metrics.records) ? metrics.records : []).filter((row) => pmPerson(row.pm) === name);
};

export const engineersFromRecords = (records = []) => unique((Array.isArray(records) ? records : []).map((row) => row.engineer));

const bomMapFromRecords = (records = [], projectBom = {}) => {
  const map = { ...(projectBom || {}) };
  (Array.isArray(records) ? records : []).forEach((row) => {
    const project = pmPerson(row.project);
    if (!project) return;
    const current = map[project] || { bomTotal: 0, bomMachinedTotal: 0 };
    map[project] = {
      bomTotal: Math.max(Number(current.bomTotal || 0), Number(row.bomTotal || 0)),
      bomMachinedTotal: Math.max(Number(current.bomMachinedTotal || 0), Number(row.bomMachinedTotal || 0)),
    };
  });
  return map;
};

export const metricsFromRecords = (records = [], projectBom = {}) => {
  const rows = Array.isArray(records) ? records : [];
  const ecn = rows.filter((row) => row.source === "ECN");
  const nonBom = rows.filter((row) => row.source === "非BOM");
  const bomMap = bomMapFromRecords(rows, projectBom);
  const projects = unique(ecn.map((row) => row.project));
  const bomTotal = projects.reduce((sum, project) => sum + Number(bomMap?.[project]?.bomTotal || 0), 0);
  const machinedBom = projects.reduce((sum, project) => sum + Number(bomMap?.[project]?.bomMachinedTotal || 0), 0);
  const ecnMachined = ecn.filter((row) => row.isMachined).length;
  const nonBomMachined = nonBom.filter((row) => row.isMachined).length;
  return {
    ecnCount: ecn.length,
    nonBomCount: nonBom.length,
    projectCount: projects.length,
    ecnMachinedCount: ecnMachined,
    ecnStandardCount: Math.max(0, ecn.length - ecnMachined),
    nonBomMachinedCount: nonBomMachined,
    nonBomStandardCount: Math.max(0, nonBom.length - nonBomMachined),
    bomDenominator: bomTotal,
    machinedBomDenominator: machinedBom,
    ecnRate: ratePercent(ecn.length, bomTotal),
    machinedEcnRate: ratePercent(ecnMachined, machinedBom),
    nonBomMachinedRate: ratePercent(nonBomMachined, machinedBom),
    ecnReasons: [...ecn.reduce((map, row) => {
      const name = pmPerson(row.reason) || "未填写原因";
      map.set(name, (map.get(name) || 0) + 1);
      return map;
    }, new Map()).entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
};

export const recordsInRange = (records = [], range = {}) => {
  if (!range?.start && !range?.end && !range?._periodStart && !range?._periodEnd) return Array.isArray(records) ? records : [];
  return (Array.isArray(records) ? records : []).filter((row) => dateInSelectedPeriod(row.date, range));
};

export const monthlyRateRows = (records = [], projectBom = {}, range = {}) => {
  const selectedEndRaw = String(range._periodEnd || range.end || range.end2026 || "").slice(0, 10);
  const selectedStartRaw = String(range._periodStart || range.start || range.start2026 || "").slice(0, 10);
  const end = selectedEndRaw;
  const year = (end || selectedStartRaw || String(new Date().getFullYear())).slice(0, 4);
  if (!/^\d{4}$/.test(year)) return [];
  const selectedStart = selectedStartRaw.slice(0, 7);
  const selectedEnd = selectedEndRaw.slice(0, 7);
  const lastMonth = selectedEnd && selectedEnd.startsWith(year) ? Number(selectedEnd.slice(5, 7)) : (end && end.startsWith(year) ? Number(end.slice(5, 7)) : 12);
  const rows = [];
  for (let month = 1; month <= Math.max(1, Math.min(12, lastMonth || 12)); month += 1) {
    const label = `${year}-${String(month).padStart(2, "0")}`;
    const monthRecords = (Array.isArray(records) ? records : []).filter((row) => monthLabel(row.date) === label);
    const metrics = metricsFromRecords(monthRecords, projectBom);
    rows.push({
      label,
      selected: Boolean(selectedStart && selectedEnd && label >= selectedStart && label <= selectedEnd),
      ecnCount: metrics.ecnCount,
      bomDenominator: metrics.bomDenominator,
      ecnRate: metrics.ecnRate,
      ecnMachinedCount: metrics.ecnMachinedCount,
      machinedBomDenominator: metrics.machinedBomDenominator,
      machinedEcnRate: metrics.machinedEcnRate,
      nonBomMachinedCount: metrics.nonBomMachinedCount,
      nonBomMachinedRate: metrics.nonBomMachinedRate,
    });
  }
  return rows;
};

export const reviewStatsForNames = (reviewRecords = [], names = [], range = {}) => {
  const set = new Set(unique(names));
  const sessions = (Array.isArray(reviewRecords) ? reviewRecords : []).filter((row) => {
    const date = row.updateDate || row.date || "";
    if (range.start || range.end) {
      const key = String(date || "").slice(0, 10);
      if (range.start && key && key < range.start) return false;
      if (range.end && key && key > range.end) return false;
    }
    return (row.members || []).some((name) => set.has(pmPerson(name)));
  });
  const suggestions = sessions.reduce((sum, row) => sum + (row.proposers || []).filter((name) => set.has(pmPerson(name))).length, 0);
  return { reviewCount: sessions.length, suggestions };
};

export const issuePmNames = (row = {}) => unique([row.PM, row["PM审核人"], row["项目经理"], row.pm]);
const dateInSelectedPeriod = (value, range = {}) => {
  if (!range?.start && !range?.end && !range?._periodStart && !range?._periodEnd) return true;
  const key = normalizeIssueDate(value);
  if (!key) return false;
  const start = String(range._periodStart || range.start || "").slice(0, 10);
  const end = String(range._periodEnd || range.end || "").slice(0, 10);
  if (start && key < start) return false;
  if (end && key > end) return false;
  return true;
};
const issueOwnerNames = (row = {}) => unique([
  row["研发工程师"], row["工程师"], row["RD工程师"], row["工程师姓名"],
  row["责任人/处理人"], row["责任人\\处理人"], row["责任人"],
]).filter((name) => name && !isPlaceholderOrgName(name));
const isReviewStageIssueRow = (row = {}) => String(row["阶段"] ?? "").trim() === "评审";
export const pmScopedEngineerNames = ({ dqaRows = [], records = [], pm = "", range = {} } = {}) => {
  const pmName = pmPerson(pm);
  const fromIssues = (Array.isArray(dqaRows) ? dqaRows : [])
    .filter((row) => !row.__roleActivity && String(row["问题描述"] || "").trim() && !isReviewStageIssueRow(row) && issuePmNames(row).includes(pmName) && dateInSelectedPeriod(rowDateValue(row), range))
    .flatMap(issueOwnerNames);
  const fromAgent = (Array.isArray(records) ? records : [])
    .filter((row) => pmPerson(row.pm) === pmName && dateInSelectedPeriod(row.date, range))
    .map((row) => pmPerson(row.engineer));
  return unique([...fromIssues, ...fromAgent]).filter((name) => name && name !== pmName);
};
export const rdIssuesForNames = (dqaRows = [], names = [], range = {}, pm = "") => {
  const set = new Set(unique(names));
  const pmName = pmPerson(pm);
  const all = (Array.isArray(dqaRows) ? dqaRows : []).filter((row) => {
    if (row.__roleActivity) return false;
    if (isReviewStageIssueRow(row)) return false;
    if (!String(row["问题描述"] || "").trim()) return false;
    if (!dateInSelectedPeriod(rowDateValue(row), range)) return false;
    const owners = issueOwnerNames(row);
    if (pmName && !issuePmNames(row).includes(pmName)) return false;
    if (set.size && !owners.some((name) => set.has(name))) return false;
    if (!pmName && set.size && !owners.some((name) => set.has(name))) return false;
    if (!pmName && !set.size) return false;
    return true;
  });
  const rows = all;
  const categories = new Map();
  rows.forEach((row) => {
    const name = String(row["问题分类"] || row["类别"] || row["问题类型"] || "未分类").trim() || "未分类";
    categories.set(name, (categories.get(name) || 0) + 1);
  });
  return {
    count: rows.length,
    categories: [...categories.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    rows,
  };
};


export const pickDiverseIssueExamples = (rows = [], limit = 8) => {
  const mapped = (Array.isArray(rows) ? rows : []).map((row) => ({
    date: normalizeIssueDate(row["发生日期"] || row["日期"] || row.date || ""),
    category: String(row["问题分类"] || row["类别"] || row["问题类型"] || "未分类").trim() || "未分类",
    description: String(row["问题描述"] || "").trim(),
    engineer: [row["责任人"], row["工程师"], row["研发工程师"], row.__engineer].map(pmPerson).find(Boolean) || "",
  })).filter((item) => item.description || item.category);
  const sorted = [...mapped].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.engineer).localeCompare(String(b.engineer), "zh-CN"));
  const picked = [];
  const seen = new Set();
  sorted.forEach((item) => {
    if (picked.length >= limit || seen.has(item.category)) return;
    seen.add(item.category);
    picked.push(item);
  });
  sorted.forEach((item) => {
    if (picked.length >= limit || picked.includes(item)) return;
    picked.push(item);
  });
  return picked.slice(0, limit);
};

export const classifiedCategoryTop = (categories = [], limit = 3) => (Array.isArray(categories) ? categories : [])
  .filter((item) => {
    const name = String(item?.name || item?.[0] || "").trim();
    return name && name !== "未分类";
  })
  .slice(0, limit);

export const countTrendFromDates = (dates = [], range = {}, grain = "month") => {
  const selectedEndRaw = String(range._periodEnd || range.end || range.end2026 || "").slice(0, 10);
  const selectedStartRaw = String(range._periodStart || range.start || range.start2026 || "").slice(0, 10);
  const end = selectedEndRaw;
  const year = (end || selectedStartRaw || "").slice(0, 4);
  if (!/^\d{4}$/.test(year)) return null;
  const selectedStart = selectedStartRaw.slice(0, 7);
  const selectedEnd = selectedEndRaw.slice(0, 7);
  const lastMonth = selectedEnd && selectedEnd.startsWith(year) ? Number(selectedEnd.slice(5, 7)) : (end && end.startsWith(year) ? Number(end.slice(5, 7)) : 12);
  const groups = new Map();
  if (grain === "month") {
    for (let month = 1; month <= Math.max(1, Math.min(12, lastMonth || 12)); month += 1) {
      const label = `${year}-${String(month).padStart(2, "0")}`;
      groups.set(label, { label, count: 0, bad: 0, total: 0, selected: Boolean(selectedStart && selectedEnd && label >= selectedStart && label <= selectedEnd) });
    }
  }
  (Array.isArray(dates) ? dates : []).forEach((value) => {
    const date = String(value || "").slice(0, 10);
    const label = grain === "month" ? date.slice(0, 7) : "";
    if (!label || !groups.has(label)) return;
    const item = groups.get(label);
    item.count += 1;
    item.bad += 1;
    item.total += 1;
  });
  const rows = [...groups.values()];
  return rows.length >= 2 ? { granularity: grain, rows } : null;
};

const personKey = (value) => pmPerson(value).normalize("NFKC").replace(/[（(][^)）]*[）)]/g, "").replace(/[\s\u00a0]/g, "");
export const engineerRowsForPm = ({ records = [], allRecords = null, pm = "", extraNames = [], projectBom = {}, dqaRows = [], reviewRecords = [], range = {} } = {}) => {
  const pmName = pmPerson(pm);
  const lookup = (Array.isArray(allRecords) && allRecords.length ? allRecords : records)
    .filter((row) => !pmName || pmPerson(row.pm) === pmName);
  const periodRecords = recordsInRange(lookup, range);
  const groups = new Map();
  const bucket = (name) => personKey(name) || "未填写创建人";
  for (const row of periodRecords) {
    const key = bucket(row.engineer);
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  for (const name of extraNames) {
    const key = personKey(name);
    if (key && key !== pmName && !groups.has(key)) groups.set(key, []);
  }
  return [...groups.entries()].map(([name, personRecords]) => {
    const metrics = metricsFromRecords(personRecords, projectBom);
    const issues = name === "未填写创建人" ? { count: 0 } : rdIssuesForNames(dqaRows, [name], range, pm);
    const review = name === "未填写创建人" ? { reviewCount: 0, suggestions: 0 } : reviewStatsForNames(reviewRecords, [name], range);
    return {
      name,
      bad: issues.count,
      total: issues.count,
      issues: issues.count,
      ecnCount: metrics.ecnCount,
      ecnMachinedCount: metrics.ecnMachinedCount,
      nonBomCount: metrics.nonBomCount,
      nonBomMachinedCount: metrics.nonBomMachinedCount,
      reviewCount: review.reviewCount,
      suggestions: review.suggestions,
      ecnRate: metrics.ecnRate,
      machinedEcnRate: metrics.machinedEcnRate,
      nonBomMachinedRate: metrics.nonBomMachinedRate,
    };
  }).sort((a, b) => b.issues - a.issues || b.ecnCount - a.ecnCount || a.name.localeCompare(b.name, "zh-CN"));
};

export const buildPmPeerRows = ({ metrics = {}, dqaRows = [], files = [], machinedParts = null, reviewRecords = [], range = {}, currentPm = "", allowedPms = [], mappings = [] } = {}) => {
  const records = Array.isArray(metrics.records) ? metrics.records : [];
  const dqaEcnRows = dqaEcnSummaryRows(files);
  const machinedTotals = mergeMachinedTotals(machinedTotalsFromAnalysis(machinedParts), machinedTotalsFromFiles(files));
  const selectedStart = String(range._periodStart || range.start || "").slice(0, 7);
  const selectedEnd = String(range._periodEnd || range.end || "").slice(0, 7);
  const periodMonths = monthKeysFromRange(range).filter((label) => !selectedStart || !selectedEnd || (label >= selectedStart && label <= selectedEnd));
  const machinedDen = periodMonths.reduce((sum, label) => sum + Number(machinedTotals.ecn?.[label] || 0), 0);
  const nonBomDen = periodMonths.reduce((sum, label) => sum + Number(machinedTotals.nonBom?.[label] || machinedTotals.ecn?.[label] || 0), 0);
  const pms = unique((Array.isArray(allowedPms) ? allowedPms : []).map(pmPerson).filter((name) => name && !isPlaceholderOrgName(name)));
  const attributedReviews = attributeReviewSessions({ reviewRecords, mappings, dqaRows, records, range });
  return pms.map((pm) => {
    const pmRecords = recordsInRange(records.filter((row) => pmPerson(row.pm) === pm), range);
    const engineers = engineersFromRecords(pmRecords);
    const stats = metricsFromRecords(pmRecords, metrics.projectBom || {});
    const dqa = dqaEcnSlice(dqaEcnRows, pm, range);
    const issues = rdIssuesForNames(dqaRows, [], range, pm);
    const review = reviewStatsForPm(attributedReviews, pm);
    return {
      name: pm,
      focus: pmPerson(pm) === pmPerson(currentPm),
      selected: pmPerson(pm) === pmPerson(currentPm),
      ecnRate: dqaEcnRows.length ? (dqa.ecnRate || 0) : (stats.ecnRate || 0),
      machinedEcnRate: machinedDen > 0 ? (ratePercent(stats.ecnMachinedCount, machinedDen) || 0) : (stats.machinedEcnRate || 0),
      nonBomMachinedRate: (nonBomDen || machinedDen) > 0 ? (ratePercent(stats.nonBomMachinedCount, nonBomDen || machinedDen) || 0) : (stats.nonBomMachinedRate || 0),
      issueCount: issues.count,
      reviewCount: review.reviewCount,
      engineerCount: engineers.length,
      projectCount: stats.projectCount,
      ecnCount: dqaEcnRows.length ? dqa.ecnCount : stats.ecnCount,
      nonBomCount: stats.nonBomCount,
      ecnDenominator: dqaEcnRows.length ? (Number(dqa.materialCount) || 0) : 0,
      machinedDenominator: machinedDen || 0,
      nonBomDenominator: (nonBomDen || machinedDen) || 0,
      ecnMachinedCount: stats.ecnMachinedCount,
      nonBomMachinedCount: stats.nonBomMachinedCount,
    };
  }).sort((a, b) => b.issueCount - a.issueCount || a.name.localeCompare(b.name, "zh-CN"));
};

export const peerRateRows = (rows = [], valueKey = "ecnRate") => (Array.isArray(rows) ? rows : []).filter((row) => (Number(row.ecnCount) || 0) > 0 || (Number(row[valueKey]) || 0) > 0);
export const peerRatesDefined = (rows = [], { valueKey = "ecnRate", denomKey = "ecnDenominator" } = {}) => {
  const active = peerRateRows(rows, valueKey);
  if (active.length < 2) return false;
  return active.every((row) => Number(row[denomKey] || 0) > 0);
};
export const peerRatesComparable = (rows = [], options = {}) => {
  if (!peerRatesDefined(rows, options)) return false;
  const denoms = peerRateRows(rows, options.valueKey || "ecnRate").map((row) => Number(row[options.denomKey || "ecnDenominator"] || 0));
  return denoms.every((value) => value === denoms[0]);
};

export const rankMetricRows = (rows = [], valueKey = "issueCount", currentPm = "", limit = 12) => {
  const axisLabel = (row) => pmPerson(row.chartLabel) || row.name;
  const source = (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    label: axisLabel(row),
    value: Number(row[valueKey] || 0),
    focus: Boolean(row.focus || pmPerson(row.name) === pmPerson(currentPm)),
  })).sort((a, b) => b.value - a.value || String(a.name).localeCompare(String(b.name), "zh-CN"));
  const ranked = source.map((row, index) => ({ ...row, rank: index + 1, rankTotal: source.length, total: source.length }));
  if (ranked.length <= limit) return ranked;
  const withRank = (row) => ({ ...row, label: `${axisLabel(row)} · 第${row.rank}/${row.rankTotal}名` });
  const focus = ranked.find((row) => row.focus);
  if (focus && focus.rank > limit) return [...ranked.slice(0, limit - 1), withRank(focus)];
  return ranked.slice(0, limit).map((row) => row.focus && row.rank ? withRank(row) : row);
};

export const isPlaceholderOrgName = (value) => /^(其他|其它|待配置|待定|未配置|未填写|无|\/|-|—)$/.test(pmPerson(value));
export const orgMappedPeople = (mappings = [], fields = ["pm", "PM"]) => unique(
  (Array.isArray(mappings) ? mappings : [])
    .filter((row) => row && row.active !== false)
    .flatMap((row) => fields.flatMap((field) => String(row?.[field] || "").split(/[、,，;；/\\|]/).map(pmPerson).filter(Boolean)))
    .filter((name) => !isPlaceholderOrgName(name))
);
export const tpmForPm = (mappings = [], pm = "") => {
  const name = pmPerson(pm);
  const row = (Array.isArray(mappings) ? mappings : []).find((item) => item && item.active !== false && orgMappedPeople([item], ["pm", "PM"]).includes(name));
  return orgMappedPeople([row || {}], ["tpm", "TPM"])[0] || "";
};

const isEcnDenomRow = (row = {}) => row["物料款数"] != null && row["物料款数"] !== "";
const isEcnNumerRow = (row = {}) => !isEcnDenomRow(row) && (row["申请日期"] != null || String(row.__sheet || "").includes("分子"));
const monthKeysFromRange = (range = {}) => {
  const endRaw = String(range._periodEnd || range.end || "").slice(0, 10);
  const startRaw = String(range._periodStart || range.start || "").slice(0, 10);
  const year = (endRaw || startRaw || String(new Date().getFullYear())).slice(0, 4);
  if (!/^\d{4}$/.test(year)) return [];
  const selectedEnd = (endRaw || "").slice(0, 7);
  const lastMonth = selectedEnd && selectedEnd.startsWith(year) ? Number(selectedEnd.slice(5, 7)) : 12;
  return Array.from({ length: Math.max(1, Math.min(12, lastMonth || 12)) }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
};

const isDqaEcnSummaryFile = (file = {}) => {
  const name = `${file.name || ""}${file.fileName || ""}`;
  if (/ECN查询导出|Agent原始/.test(name)) return false;
  if (/ECN汇总/.test(name)) return true;
  if (file.subKind !== "DQA_ECN" && file.module !== "DQA") return false;
  return (file.rows || []).some((row) => isEcnDenomRow(row) || /分子|分母/.test(String(row.__sheet || "")));
};

export const dqaEcnSummaryRows = (files = []) => (Array.isArray(files) ? files : [])
  .filter((file) => isDqaEcnSummaryFile(file))
  .flatMap((file) => file.rows || [])
  .filter((row) => isEcnNumerRow(row) || isEcnDenomRow(row));

export const machinedTotalsFromFiles = (files = []) => {
  const map = { ecn: {}, nonBom: {} };
  (Array.isArray(files) ? files : [])
    .filter((file) => file?.subKind === "DQA_MACHINED_PARTS" || /加工件数量比例/.test(`${file.name || ""}${file.fileName || ""}`))
    .flatMap((file) => file.rows || [])
    .filter((row) => /加工件总数/.test(String(row["产品部"] || row.__division || "")))
    .forEach((row) => {
      const year = Number(row.年份 || row.__year);
      const month = Number(row.月份 || row.__month);
      if (!year || !month) return;
      const label = `${year}-${String(month).padStart(2, "0")}`;
      const qty = Number(row.数量 || row.__quantity || 0);
      const kind = String(row.__partKind || "").includes("非BOM") ? "nonBom" : "ecn";
      map[kind][label] = qty;
    });
  return map;
};
export const machinedTotalsFromAnalysis = (machinedParts = {}) => {
  const map = { ecn: {}, nonBom: {} };
  ["ecn", "nonBom"].forEach((kind) => {
    (machinedParts?.[kind]?.monthly || []).forEach((row) => {
      const month = Number(row.month || String(row.name || "").replace(/\D/g, ""));
      if (!month) return;
      [2025, 2026].forEach((year) => {
        const qty = Number(row[`y${year}Qty`] || 0);
        if (!qty) return;
        map[kind][`${year}-${String(month).padStart(2, "0")}`] = qty;
      });
    });
  });
  return map;
};
const mergeMachinedTotals = (...sources) => {
  const map = { ecn: {}, nonBom: {} };
  sources.forEach((source) => {
    ["ecn", "nonBom"].forEach((kind) => {
      Object.entries(source?.[kind] || {}).forEach(([label, qty]) => {
        if (Number(qty) > 0) map[kind][label] = Number(qty);
      });
    });
  });
  return map;
};

export const dqaEcnSlice = (rows = [], pm = "", range = {}) => {
  const name = pmPerson(pm);
  const period = { start: range.start, end: range.end };
  const num = (Array.isArray(rows) ? rows : []).filter((row) => isEcnNumerRow(row) && (!name || rowPm(row) === name) && (!period.start && !period.end ? true : inDqaDateRange(row["申请日期"], period)));
  const den = (Array.isArray(rows) ? rows : []).filter((row) => isEcnDenomRow(row) && (!name || rowPm(row) === name) && (!period.start && !period.end ? true : inDqaDateRange(row["制单日期"], period)));
  const materialCount = den.reduce((sum, row) => sum + Number(row["物料款数"] || 0), 0);
  return { ecnCount: num.length, materialCount, ecnRate: ratePercent(num.length, materialCount) };
};

export const buildPmMonthlyDqaRates = ({ agentRecords = [], projectBom = {}, dqaEcnRows = [], machinedTotals = { ecn: {}, nonBom: {} }, pm = "", range = {} } = {}) => {
  const labels = monthKeysFromRange(range);
  const selectedStart = String(range._periodStart || range.start || "").slice(0, 7);
  const selectedEnd = String(range._periodEnd || range.end || "").slice(0, 7);
  return labels.map((label) => {
    const monthRange = { start: `${label}-01`, end: `${label}-31` };
    const dqa = dqaEcnSlice(dqaEcnRows, pm, monthRange);
    const monthAgent = (Array.isArray(agentRecords) ? agentRecords : []).filter((row) => monthLabel(row.date) === label);
    const agent = metricsFromRecords(monthAgent, projectBom);
    const ecnTotal = Number(machinedTotals.ecn?.[label] || 0);
    const nonBomTotal = Number(machinedTotals.nonBom?.[label] || machinedTotals.ecn?.[label] || 0);
    return {
      label,
      selected: Boolean(selectedStart && selectedEnd && label >= selectedStart && label <= selectedEnd),
      ecnCount: dqa.ecnCount,
      bomDenominator: dqa.materialCount,
      ecnRate: dqa.ecnRate,
      ecnMachinedCount: agent.ecnMachinedCount,
      machinedBomDenominator: ecnTotal,
      machinedEcnRate: ratePercent(agent.ecnMachinedCount, ecnTotal),
      nonBomMachinedCount: agent.nonBomMachinedCount,
      nonBomMachinedRate: ratePercent(agent.nonBomMachinedCount, nonBomTotal),
    };
  });
};

export const buildPmDqaMetrics = ({ agentRecords = [], projectBom = {}, files = [], machinedParts = null, pm = "", range = {} } = {}) => {
  const dqaEcnRows = dqaEcnSummaryRows(files);
  const machinedTotals = mergeMachinedTotals(machinedTotalsFromAnalysis(machinedParts), machinedTotalsFromFiles(files));
  const periodAgent = recordsInRange(agentRecords, range);
  const agent = metricsFromRecords(periodAgent, projectBom);
  const hasDqa = dqaEcnRows.length > 0;
  const dqa = dqaEcnSlice(dqaEcnRows, pm, range);
  const window = selectedMonthWindow(range);
  const periodMonths = monthKeysFromRange(range).filter((label) => !window.start || !window.end || (label >= window.start && label <= window.end));
  const machinedDen = periodMonths.reduce((sum, label) => sum + Number(machinedTotals.ecn?.[label] || 0), 0);
  const nonBomDen = periodMonths.reduce((sum, label) => sum + Number(machinedTotals.nonBom?.[label] || machinedTotals.ecn?.[label] || 0), 0);
  return {
    ...agent,
    agentEcnLineCount: agent.ecnCount,
    agentNonBomLineCount: agent.nonBomCount,
    ...(hasDqa ? { ecnCount: dqa.ecnCount, bomDenominator: dqa.materialCount, ecnRate: dqa.ecnRate } : {}),
    machinedBomDenominator: machinedDen || null,
    machinedEcnRate: machinedDen > 0 ? ratePercent(agent.ecnMachinedCount, machinedDen) : null,
    nonBomMachinedRate: (nonBomDen || machinedDen) > 0 ? ratePercent(agent.nonBomMachinedCount, nonBomDen || machinedDen) : null,
    monthlyRates: hasDqa || Object.keys(machinedTotals.ecn || {}).length
      ? buildPmMonthlyDqaRates({ agentRecords, projectBom, dqaEcnRows, machinedTotals, pm, range })
      : monthlyRateRows(agentRecords, projectBom, range),
    rateSource: hasDqa ? "dqa" : "agent",
  };
};

export const pmsForTpm = (mappings = [], tpm = "") => {
  const name = pmPerson(tpm);
  return unique((Array.isArray(mappings) ? mappings : [])
    .filter((row) => row && row.active !== false && orgMappedPeople([row], ["tpm", "TPM"]).includes(name))
    .flatMap((row) => orgMappedPeople([row], ["pm", "PM"])));
};
export const directorForTpm = (mappings = [], tpm = "") => {
  const name = pmPerson(tpm);
  const row = (Array.isArray(mappings) ? mappings : []).find((item) => item && item.active !== false && orgMappedPeople([item], ["tpm", "TPM"]).includes(name));
  return orgMappedPeople([row || {}], ["productionDirector", "产总"])[0] || "";
};

const reviewInRange = (row = {}, range = {}) => {
  if (!range?.start && !range?.end) return true;
  const key = String(row.updateDate || row.date || "").slice(0, 10);
  if (!key) return false;
  if (range.start && key < range.start) return false;
  if (range.end && key > range.end) return false;
  return true;
};
const engineerPmWeights = (dqaRows = [], records = []) => {
  const weights = new Map();
  const add = (engineer, pm) => {
    const person = pmPerson(engineer);
    const owner = pmPerson(pm);
    if (!person || !owner || person === owner || isPlaceholderOrgName(person) || isPlaceholderOrgName(owner)) return;
    if (!weights.has(person)) weights.set(person, new Map());
    const scores = weights.get(person);
    scores.set(owner, (scores.get(owner) || 0) + 1);
  };
  (Array.isArray(dqaRows) ? dqaRows : []).forEach((row) => {
    const owners = issuePmNames(row);
    issueOwnerNames(row).forEach((engineer) => owners.forEach((pm) => add(engineer, pm)));
  });
  (Array.isArray(records) ? records : []).forEach((row) => add(row.engineer, row.pm));
  return weights;
};
const bestScoredPm = (scores) => {
  let name = "";
  let best = 0;
  scores.forEach((score, pm) => { if (score > best) { name = pm; best = score; } });
  return name;
};
const inferReviewPm = (engineers, weights, allowed) => {
  const scores = new Map();
  unique(engineers).forEach((engineer) => {
    const inner = weights.get(pmPerson(engineer));
    if (!inner) return;
    const relevant = [...inner.entries()].filter(([pm]) => allowed.has(pm));
    const total = relevant.reduce((sum, [, count]) => sum + count, 0);
    if (!total) return;
    relevant.forEach(([pm, count]) => scores.set(pm, (scores.get(pm) || 0) + count / total));
  });
  return bestScoredPm(scores);
};
export const attributeReviewSessions = ({ reviewRecords = [], mappings = [], dqaRows = [], records = [], range = {} } = {}) => {
  const allowed = new Set(orgMappedPeople(mappings, ["pm", "PM"]));
  const weights = engineerPmWeights(dqaRows, records);
  return (Array.isArray(reviewRecords) ? reviewRecords : []).filter((row) => reviewInRange(row, range)).map((record) => {
    const members = unique(record.members || []);
    const named = members.filter((name) => allowed.has(pmPerson(name))).map(pmPerson);
    let pm = "";
    if (named.length === 1) pm = named[0];
    else if (named.length > 1) pm = inferReviewPm(members.filter((name) => !allowed.has(pmPerson(name))), weights, new Set(named)) || named[0];
    else pm = inferReviewPm(members, weights, allowed);
    const tpm = pm ? tpmForPm(mappings, pm) : "";
    const suggestions = unique(record.proposers || []).filter((name) => pmPerson(name) && !isPlaceholderOrgName(name)).length;
    return { pm, tpm, suggestions };
  }).filter((row) => row.pm);
};
const summarizeAttributedReviews = (rows = []) => ({
  reviewCount: rows.length,
  suggestions: rows.reduce((sum, row) => sum + (Number(row.suggestions) || 0), 0),
});
export const reviewStatsForPm = (sessions = [], pm = "") => summarizeAttributedReviews(sessions.filter((row) => row.pm === pmPerson(pm)));
export const reviewStatsForTpm = (sessions = [], tpm = "") => summarizeAttributedReviews(sessions.filter((row) => row.tpm === pmPerson(tpm)));
export const reviewStatsForPms = (sessions = [], pms = []) => {
  const set = new Set(unique(pms).map(pmPerson));
  return summarizeAttributedReviews(sessions.filter((row) => set.has(row.pm)));
};
const sumField = (rows = [], key = "") => rows.reduce((sum, row) => sum + (Number(row?.[key]) || 0), 0);
const mergeReasons = (groups = []) => [...groups.flat().reduce((map, item) => {
  const name = pmPerson(item?.name) || "未填写原因";
  map.set(name, (map.get(name) || 0) + (Number(item?.count) || 0));
  return map;
}, new Map()).entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
const issueCategoriesFromRows = (rows = []) => {
  const categories = new Map();
  rows.forEach((row) => {
    const name = String(row["问题分类"] || row["类别"] || row["问题类型"] || "未分类").trim() || "未分类";
    categories.set(name, (categories.get(name) || 0) + 1);
  });
  return [...categories.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
};
export const buildTpmPeerRows = ({ mappings = [], currentTpm = "", dqaRows = [], records = [], reviewRecords = [], range = {}, ...pmArgs } = {}) => {
  const tpms = orgMappedPeople(mappings, ["tpm", "TPM"]);
  const pmRows = buildPmPeerRows({ ...pmArgs, mappings, dqaRows, metrics: { records }, reviewRecords, range, currentPm: "", allowedPms: orgMappedPeople(mappings, ["pm", "PM"]) });
  return tpms.map((tpm) => {
    const names = new Set(pmsForTpm(mappings, tpm).map(pmPerson));
    const rows = pmRows.filter((row) => names.has(pmPerson(row.name)));
    const review = { reviewCount: sumField(rows, "reviewCount") };
    const ecnCount = sumField(rows, "ecnCount");
    const ecnDenominator = sumField(rows, "ecnDenominator");
    const ecnMachinedCount = sumField(rows, "ecnMachinedCount");
    const nonBomMachinedCount = sumField(rows, "nonBomMachinedCount");
    const machinedDenominator = Number(rows.find((row) => Number(row.machinedDenominator) > 0)?.machinedDenominator || 0);
    return {
      name: tpm,
      focus: pmPerson(tpm) === pmPerson(currentTpm),
      selected: pmPerson(tpm) === pmPerson(currentTpm),
      ecnCount,
      ecnDenominator,
      ecnRate: ratePercent(ecnCount, ecnDenominator) || 0,
      ecnMachinedCount,
      machinedDenominator,
      machinedEcnRate: ratePercent(ecnMachinedCount, machinedDenominator) || 0,
      nonBomMachinedCount,
      nonBomDenominator: machinedDenominator,
      nonBomMachinedRate: ratePercent(nonBomMachinedCount, machinedDenominator) || 0,
      issueCount: sumField(rows, "issueCount"),
      reviewCount: review.reviewCount,
    };
  }).sort((a, b) => b.issueCount - a.issueCount || a.name.localeCompare(b.name, "zh-CN"));
};
export const assembleTpmEvidence = ({ tpm = "", pms: pmsOverride = null, skipPeers = false, mappings = [], dqaRows = [], records = [], projectBom = {}, files = [], machinedParts = null, reviewRecords = [], range = {} } = {}) => {
  const pms = Array.isArray(pmsOverride) ? unique(pmsOverride.map(pmPerson)).filter(Boolean) : pmsForTpm(mappings, tpm);
  const attributedReviews = attributeReviewSessions({ reviewRecords, mappings, dqaRows, records, range });
  const knownTpm = orgMappedPeople(mappings, ["tpm", "TPM"]).includes(pmPerson(tpm));
  const yearStart = `${String(range.end || range.start || new Date().getFullYear()).slice(0, 4)}-01-01`;
  const yearRange = { start: yearStart, end: range.end || range._periodEnd || "" };
  const perPm = pms.map((pm) => {
    const pmRecords = recordsForPm({ records }, pm);
    const metrics = buildPmDqaMetrics({ agentRecords: pmRecords, projectBom, files, machinedParts, pm, range });
    const issues = rdIssuesForNames(dqaRows, [], range, pm);
    const names = pmScopedEngineerNames({ dqaRows, records, pm, range });
    const review = reviewStatsForPm(attributedReviews, pm);
    return {
      name: pm,
      issues: issues.count,
      bad: issues.count,
      ecnCount: Number(metrics.agentEcnLineCount ?? 0),
      ecnSummaryCount: Number(metrics.ecnCount || 0),
      ecnMachinedCount: Number(metrics.ecnMachinedCount || 0),
      nonBomCount: Number(metrics.agentNonBomLineCount ?? metrics.nonBomCount ?? 0),
      nonBomMachinedCount: Number(metrics.nonBomMachinedCount || 0),
      reviewCount: review.reviewCount,
      suggestions: review.suggestions,
      metrics,
      issueRows: issues.rows,
      names,
    };
  });
  const issueRows = perPm.flatMap((row) => row.issueRows);
  const yearRows = pms.flatMap((pm) => rdIssuesForNames(dqaRows, [], yearRange, pm).rows);
  const engineerNames = unique(perPm.flatMap((row) => row.names));
  const review = knownTpm ? reviewStatsForTpm(attributedReviews, tpm) : reviewStatsForPms(attributedReviews, pms);
  const machinedBomDenominator = perPm.map((row) => row.metrics.machinedBomDenominator).find((value) => Number(value) > 0) || null;
  const ecnCount = sumField(perPm, "ecnSummaryCount");
  const bomDenominator = sumField(perPm.map((row) => row.metrics), "bomDenominator");
  const ecnMachinedCount = sumField(perPm, "ecnMachinedCount");
  const nonBomMachinedCount = sumField(perPm, "nonBomMachinedCount");
  const monthlySource = perPm[0]?.metrics.monthlyRates || [];
  const monthlyRates = monthlySource.map((row) => {
    const slice = perPm.map((item) => (item.metrics.monthlyRates || []).find((month) => month.label === row.label)).filter(Boolean);
    const monthEcn = sumField(slice, "ecnCount");
    const monthBom = sumField(slice, "bomDenominator");
    const monthMachined = sumField(slice, "ecnMachinedCount");
    const monthNonBom = sumField(slice, "nonBomMachinedCount");
    const monthMachinedDen = Number(slice.find((item) => Number(item.machinedBomDenominator) > 0)?.machinedBomDenominator || 0);
    return {
      label: row.label,
      selected: Boolean(row.selected),
      ecnCount: monthEcn,
      bomDenominator: monthBom,
      ecnRate: ratePercent(monthEcn, monthBom),
      ecnMachinedCount: monthMachined,
      machinedBomDenominator: monthMachinedDen,
      machinedEcnRate: ratePercent(monthMachined, monthMachinedDen),
      nonBomMachinedCount: monthNonBom,
      nonBomMachinedRate: ratePercent(monthNonBom, monthMachinedDen),
    };
  });
  return {
    pms,
    director: directorForTpm(mappings, tpm),
    teamMembers: perPm.map(({ metrics, issueRows: _issueRows, names, ecnSummaryCount, ...row }) => row),
    issueRows,
    categories: issueCategoriesFromRows(issueRows),
    yearRows,
    yearStart,
    engineerNames,
    metrics: {
      projectCount: metricsFromRecords(recordsInRange(pms.flatMap((pm) => recordsForPm({ records }, pm)), range), projectBom).projectCount,
      ecnCount,
      bomDenominator,
      ecnRate: ratePercent(ecnCount, bomDenominator),
      agentEcnLineCount: sumField(perPm, "ecnCount"),
      agentNonBomLineCount: sumField(perPm, "nonBomCount"),
      ecnMachinedCount,
      ecnStandardCount: sumField(perPm.map((row) => row.metrics), "ecnStandardCount"),
      nonBomMachinedCount,
      nonBomStandardCount: sumField(perPm.map((row) => row.metrics), "nonBomStandardCount"),
      machinedBomDenominator,
      machinedEcnRate: ratePercent(ecnMachinedCount, machinedBomDenominator),
      nonBomMachinedRate: ratePercent(nonBomMachinedCount, machinedBomDenominator),
      ecnReasons: mergeReasons(perPm.map((row) => row.metrics.ecnReasons || [])),
      monthlyRates,
      reviewParticipation: review.reviewCount,
      reviewSuggestions: review.suggestions,
    },
    peerRows: skipPeers ? [] : buildTpmPeerRows({ mappings, currentTpm: tpm, dqaRows, records, reviewRecords, range, files, machinedParts }),
  };
};

const oqcDivisionName = (value = "") => {
  const dept = canonicalProductDept(pmPerson(value));
  return ["半导体&北美", "产品五部", "FPC事业部"].includes(dept) ? dept : "";
};
const oqcDateKey = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const adjusted = [15, 16].includes(value.getUTCHours()) ? new Date(value.getTime() + 8 * 60 * 60 * 1000 + 60 * 1000) : value;
    return `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, "0")}-${String(adjusted.getDate()).padStart(2, "0")}`;
  }
  return normalizeIssueDate(value);
};
const oqcScore = (rows = []) => {
  const count = rows.reduce((sum, row) => sum + row.qty, 0);
  const scoreTotal = rows.reduce((sum, row) => sum + row.score * row.qty, 0);
  const five = rows.filter((row) => row.score === 5).reduce((sum, row) => sum + row.qty, 0);
  const low = rows.filter((row) => row.score <= 3).reduce((sum, row) => sum + row.qty, 0);
  return {
    count,
    five,
    low,
    avg: count > 0 ? Number((scoreTotal / count).toFixed(2)) : null,
    fiveRate: count > 0 ? Number((five / count * 100).toFixed(1)) : null,
    lowRate: count > 0 ? Number((low / count * 100).toFixed(1)) : null,
  };
};
const oqcSummaryTpm = (value = "") => {
  const name = pmPerson(value);
  if (!name || name === "__总计__" || /总计|FPC汇总|^\/$/.test(name)) return "";
  return name;
};
export const oqcShipmentRecords = (files = []) => (Array.isArray(files) ? files : [])
  .filter((file) => file?.module === "OQC" && (file.kind === "OQC_MONTHLY_SUMMARY" || /评分按月汇总/.test(`${file.name || ""}${file.fileName || ""}`)))
  .flatMap((file) => file.rows || [])
  .filter((row) => row && row["评分档位"] != null && row["评分档位"] !== "" && row["最终评分"] == null)
  .map((row) => {
    const year = Number(row["年份"]);
    const month = Number(row["月份"]);
    return {
      date: year && month ? `${year}-${String(month).padStart(2, "0")}-01` : "",
      tpm: oqcSummaryTpm(row.TPM || row["TPM"]),
      division: canonicalProductDept(pmPerson(row["产品部"])) || pmPerson(row["产品部"]),
      qty: Number(row["数量"]) || 0,
      score: Number(row["评分档位"]),
    };
  })
  .filter((row) => row.date && row.tpm && row.division !== "__总计__" && row.qty > 0 && row.score >= 1 && row.score <= 5);
export const buildTpmOqc = ({ files = [], tpm = "", range = {} } = {}) => {
  const name = pmPerson(tpm);
  const records = oqcShipmentRecords(files);
  const period = records.filter((row) => dateInSelectedPeriod(row.date, range));
  const mine = oqcScore(period.filter((row) => row.tpm === name));
  const labels = monthKeysFromRange(range);
  const selectedStart = String(range._periodStart || range.start || "").slice(0, 7);
  const selectedEnd = String(range._periodEnd || range.end || "").slice(0, 7);
  const monthly = labels.map((label) => {
    const scored = oqcScore(records.filter((row) => row.tpm === name && row.date.slice(0, 7) === label));
    return { label, selected: Boolean(selectedStart && selectedEnd && label >= selectedStart && label <= selectedEnd), ...scored };
  });
  const peers = unique([...period.map((row) => row.tpm), name].filter((item) => item && item !== "未分类")).map((item) => {
    const scored = oqcScore(period.filter((row) => row.tpm === item));
    return { name: item, focus: item === name, selected: item === name, ...scored, avg: scored.avg || 0, fiveRate: scored.fiveRate || 0, lowRate: scored.lowRate || 0 };
  }).sort((a, b) => b.lowRate - a.lowRate || b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  return { ...mine, monthly, peers };
};

export const tpmsForDirector = (mappings = [], director = "") => {
  const name = pmPerson(director);
  return unique((Array.isArray(mappings) ? mappings : [])
    .filter((row) => row && row.active !== false && orgMappedPeople([row], ["productionDirector", "产总"]).includes(name))
    .flatMap((row) => orgMappedPeople([row], ["tpm", "TPM"])));
};
export const pmsForDirector = (mappings = [], director = "") => {
  const name = pmPerson(director);
  return unique((Array.isArray(mappings) ? mappings : [])
    .filter((row) => row && row.active !== false && orgMappedPeople([row], ["productionDirector", "产总"]).includes(name))
    .flatMap((row) => orgMappedPeople([row], ["pm", "PM"])));
};
export const pmsForDirectorTpm = (mappings = [], director = "", tpm = "") => {
  const directorName = pmPerson(director);
  const tpmName = pmPerson(tpm);
  return unique((Array.isArray(mappings) ? mappings : [])
    .filter((row) => row && row.active !== false && orgMappedPeople([row], ["productionDirector", "产总"]).includes(directorName) && orgMappedPeople([row], ["tpm", "TPM"]).includes(tpmName))
    .flatMap((row) => orgMappedPeople([row], ["pm", "PM"])));
};
export const deptsForDirector = (mappings = [], director = "") => unique((Array.isArray(mappings) ? mappings : [])
  .filter((row) => row && row.active !== false && orgMappedPeople([row], ["productionDirector", "产总"]).includes(pmPerson(director)))
  .map((row) => canonicalProductDept(normalizeOrgRecord(row).productDept || row["产品部"]))
  .filter((name) => name && !isPlaceholderOrgName(name)));
const deptsForDirectorTpm = (mappings = [], director = "", tpm = "") => unique((Array.isArray(mappings) ? mappings : [])
  .filter((row) => row && row.active !== false && orgMappedPeople([row], ["productionDirector", "产总"]).includes(pmPerson(director)) && orgMappedPeople([row], ["tpm", "TPM"]).includes(pmPerson(tpm)))
  .map((row) => canonicalProductDept(normalizeOrgRecord(row).productDept || row["产品部"]))
  .filter((name) => name && !isPlaceholderOrgName(name)));
const directorPeerFromPmRows = (mappings, directors, pmRows, dqaRows, records, reviewRecords, range) => directors.map((director) => {
  const names = new Set(pmsForDirector(mappings, director).map(pmPerson));
  const rows = pmRows.filter((row) => names.has(pmPerson(row.name)));
  const review = { reviewCount: sumField(rows, "reviewCount") };
  const ecnCount = sumField(rows, "ecnCount");
  const ecnDenominator = sumField(rows, "ecnDenominator");
  const ecnMachinedCount = sumField(rows, "ecnMachinedCount");
  const nonBomMachinedCount = sumField(rows, "nonBomMachinedCount");
  const machinedDenominator = Number(rows.find((row) => Number(row.machinedDenominator) > 0)?.machinedDenominator || 0);
  return {
    name: director,
    chartLabel: deptsForDirector(mappings, director).join("、"),
    ecnCount,
    ecnDenominator,
    ecnRate: ratePercent(ecnCount, ecnDenominator) || 0,
    ecnMachinedCount,
    machinedDenominator,
    machinedEcnRate: ratePercent(ecnMachinedCount, machinedDenominator) || 0,
    nonBomMachinedCount,
    nonBomDenominator: machinedDenominator,
    nonBomMachinedRate: ratePercent(nonBomMachinedCount, machinedDenominator) || 0,
    issueCount: sumField(rows, "issueCount"),
    reviewCount: review.reviewCount,
  };
});
export const assembleDirectorEvidence = ({ director = "", mappings = [], dqaRows = [], records = [], projectBom = {}, files = [], machinedParts = null, reviewRecords = [], range = {} } = {}) => {
  const name = pmPerson(director);
  const tpms = tpmsForDirector(mappings, name);
  const pms = pmsForDirector(mappings, name);
  const header = assembleTpmEvidence({ tpm: name, pms, skipPeers: true, mappings, dqaRows, records, projectBom, files, machinedParts, reviewRecords, range });
  const teamMembers = tpms.map((tpm) => {
    const one = assembleTpmEvidence({ tpm, pms: pmsForDirectorTpm(mappings, name, tpm), skipPeers: true, mappings, dqaRows, records, projectBom, files, machinedParts, reviewRecords, range });
    return {
      name: tpm,
      dept: deptsForDirectorTpm(mappings, name, tpm).join("、"),
      issues: one.issueRows.length,
      bad: one.issueRows.length,
      ecnCount: Number(one.metrics.agentEcnLineCount || 0),
      ecnMachinedCount: Number(one.metrics.ecnMachinedCount || 0),
      nonBomCount: Number(one.metrics.agentNonBomLineCount || 0),
      nonBomMachinedCount: Number(one.metrics.nonBomMachinedCount || 0),
      reviewCount: Number(one.metrics.reviewParticipation || 0),
      suggestions: Number(one.metrics.reviewSuggestions || 0),
    };
  }).sort((a, b) => b.issues - a.issues || b.ecnCount - a.ecnCount || a.name.localeCompare(b.name, "zh-CN"));
  const pmRows = buildPmPeerRows({ metrics: { records }, mappings, dqaRows, files, machinedParts, reviewRecords, range, currentPm: "", allowedPms: orgMappedPeople(mappings, ["pm", "PM"]) });
  const peerRows = tpms.map((tpm) => {
    const names = new Set(pmsForDirectorTpm(mappings, name, tpm).map(pmPerson));
    const rows = pmRows.filter((row) => names.has(pmPerson(row.name)));
    const ecnCount = sumField(rows, "ecnCount");
    const ecnDenominator = sumField(rows, "ecnDenominator");
    const ecnMachinedCount = sumField(rows, "ecnMachinedCount");
    const nonBomMachinedCount = sumField(rows, "nonBomMachinedCount");
    const machinedDenominator = Number(rows.find((row) => Number(row.machinedDenominator) > 0)?.machinedDenominator || 0);
    return {
      name: tpm,
      chartLabel: tpm,
      ecnCount,
      ecnDenominator,
      ecnRate: ratePercent(ecnCount, ecnDenominator) || 0,
      ecnMachinedCount,
      machinedDenominator,
      machinedEcnRate: ratePercent(ecnMachinedCount, machinedDenominator) || 0,
      nonBomMachinedCount,
      nonBomDenominator: machinedDenominator,
      nonBomMachinedRate: ratePercent(nonBomMachinedCount, machinedDenominator) || 0,
      issueCount: sumField(rows, "issueCount"),
      reviewCount: sumField(rows, "reviewCount"),
    };
  }).sort((a, b) => b.issueCount - a.issueCount || a.name.localeCompare(b.name, "zh-CN"));
  const periodRecords = oqcShipmentRecords(files).filter((row) => dateInSelectedPeriod(row.date, range));
  const deptNames = unique(tpms.flatMap((tpm) => deptsForDirectorTpm(mappings, name, tpm)));
  const deptRows = deptNames.map((dept) => {
    const deptTpms = tpms.filter((tpm) => deptsForDirectorTpm(mappings, name, tpm).includes(dept));
    const deptPms = unique(deptTpms.flatMap((tpm) => pmsForDirectorTpm(mappings, name, tpm)));
    const issues = deptPms.reduce((sum, pm) => sum + rdIssuesForNames(dqaRows, [], range, pm).count, 0);
    const scored = oqcScore(periodRecords.filter((row) => deptTpms.includes(row.tpm)));
    return { name: dept, issues, ...scored };
  }).filter((row) => row.issues > 0 || row.count > 0);
  return { ...header, pms, tpms, pmCount: pms.length, tpmCount: tpms.length, teamMembers, peerRows, deptRows };
};
export const buildDirectorOqc = ({ files = [], director = "", mappings = [], range = {} } = {}) => {
  const records = oqcShipmentRecords(files);
  const current = pmPerson(director);
  const names = new Set(tpmsForDirector(mappings, current));
  const period = records.filter((row) => dateInSelectedPeriod(row.date, range));
  const mine = oqcScore(period.filter((row) => names.has(row.tpm)));
  const labels = monthKeysFromRange(range);
  const selectedStart = String(range._periodStart || range.start || "").slice(0, 7);
  const selectedEnd = String(range._periodEnd || range.end || "").slice(0, 7);
  const monthly = labels.map((label) => {
    const scored = oqcScore(records.filter((row) => names.has(row.tpm) && row.date.slice(0, 7) === label));
    return { label, selected: Boolean(selectedStart && selectedEnd && label >= selectedStart && label <= selectedEnd), ...scored };
  });
  const peers = orgMappedPeople(mappings, ["productionDirector", "产总"]).map((item) => {
    const set = new Set(tpmsForDirector(mappings, item));
    const scored = oqcScore(period.filter((row) => set.has(row.tpm)));
    return { name: item, chartLabel: deptsForDirector(mappings, item).join("、"), focus: item === current, selected: item === current, ...scored, avg: scored.avg || 0, fiveRate: scored.fiveRate || 0, lowRate: scored.lowRate || 0 };
  }).sort((a, b) => b.lowRate - a.lowRate || b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  const tpmPeers = [...names].map((tpm) => {
    const scored = oqcScore(period.filter((row) => row.tpm === tpm));
    return { name: tpm, chartLabel: tpm, ...scored, avg: scored.avg || 0, fiveRate: scored.fiveRate || 0, lowRate: scored.lowRate || 0 };
  }).sort((a, b) => b.lowRate - a.lowRate || b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  return { ...mine, monthly, peers, tpmPeers };
};


const issueDateOf = (row = {}) => normalizeIssueDate(row["发生日期"] || row["日期"] || row.date || row.__date);
const categoryStatsFor = (categories = [], total = 0) => (Array.isArray(categories) ? categories : []).map((item) => ({ name: item.name, count: item.count, share: total ? Number((item.count / total * 100).toFixed(1)) : null }));
export const buildStoredRoleEvidence = ({ role = "", recipient = "", mappings = [], files = [], records = [], projectBom = {}, machinedParts = null, reviewRecords = [], range = {} } = {}) => {
  if (!["PM", "TPM", "产总"].includes(role) || !recipient) return null;
  const selected = selectedRolePeriod(range);
  const dqaRows = (Array.isArray(files) ? files : []).filter((file) => file.module === "DQA" && file.kind !== "IPQC_LEADER_MAP").flatMap((file) => file.rows || []);
  const yearStart = `${String(selected.end || selected.start || "").slice(0, 4)}-01-01`;
  const trendRange = { start: yearStart, end: selected.end, _periodStart: selected.start, _periodEnd: selected.end };
  const pack = (bundle, oqc) => {
    const issueRows = bundle.issueRows || [];
    const month = countTrendFromDates((bundle.yearRows || issueRows).map(issueDateOf), trendRange, "month");
    const examples = pickDiverseIssueExamples(issueRows, 8);
    const cats = categoryStatsFor(bundle.categories || [], issueRows.length);
    return {
      matchedRows: issueRows.length,
      pmCount: bundle.pmCount,
      tpmCount: bundle.tpmCount,
      director: role === "产总" ? "" : (bundle.director || ""),
      teamMembers: bundle.teamMembers || [],
      pmPeerRows: bundle.peerRows || [],
      deptRows: bundle.deptRows || [],
      engineerMetrics: bundle.metrics || {},
      examples,
      topCategoryStats: cats,
      topCategories: cats.map((item) => item.name),
      periodTrend: { month, week: null },
      rdQualityIssues: { count: issueRows.length, categories: bundle.categories || [], examples, periodTrend: { month, week: null } },
      oqcShipment: oqc || null,
    };
  };
  if (role === "产总") {
    const bundle = assembleDirectorEvidence({ director: recipient, mappings, dqaRows, records, projectBom, files, machinedParts, reviewRecords, range: selected });
    return pack(bundle, buildDirectorOqc({ files, director: recipient, mappings, range: selected }));
  }
  if (role === "TPM") {
    const bundle = assembleTpmEvidence({ tpm: recipient, mappings, dqaRows, records, projectBom, files, machinedParts, reviewRecords, range: selected });
    return pack(bundle, buildTpmOqc({ files, tpm: recipient, range: selected }));
  }
  const pmRecords = recordsInRange(recordsForPm({ records }, recipient), selected);
  const names = pmScopedEngineerNames({ dqaRows, records, pm: recipient, range: selected });
  const issues = rdIssuesForNames(dqaRows, [], selected, recipient);
  const yearIssues = rdIssuesForNames(dqaRows, [], { start: yearStart, end: selected.end }, recipient);
  const review = reviewStatsForPm(attributeReviewSessions({ reviewRecords, mappings, dqaRows, records, range: selected }), recipient);
  const metrics = { ...buildPmDqaMetrics({ agentRecords: recordsForPm({ records }, recipient), projectBom, files, machinedParts, pm: recipient, range: selected }), reviewParticipation: review.reviewCount, reviewSuggestions: review.suggestions };
  const month = countTrendFromDates(yearIssues.rows.map(issueDateOf), trendRange, "month");
  const examples = pickDiverseIssueExamples(issues.rows, 8);
  const cats = categoryStatsFor(issues.categories || [], issues.count);
  return {
    matchedRows: issues.count,
    tpm: tpmForPm(mappings, recipient),
    teamMembers: engineerRowsForPm({ records: pmRecords, allRecords: records, pm: recipient, extraNames: names, projectBom, dqaRows, reviewRecords, range: selected }),
    pmPeerRows: buildPmPeerRows({ metrics: { records }, dqaRows, files, machinedParts, reviewRecords, range: selected, currentPm: recipient, allowedPms: orgMappedPeople(mappings, ["pm", "PM"]), mappings }),
    engineerMetrics: metrics,
    examples,
    topCategoryStats: cats,
    topCategories: cats.map((item) => item.name),
    periodTrend: { month, week: null },
    rdQualityIssues: { count: issues.count, categories: issues.categories || [], examples, periodTrend: { month, week: null } },
    oqcShipment: null,
    deptRows: [],
  };
};

export const splitRoleLineCounts = ({ role = "", recipient = "", mappings = [], records = [] } = {}) => {
  const rows = Array.isArray(records) ? records : [];
  const org = (Array.isArray(mappings) ? mappings : []).filter((row) => row && row.active !== false);
  const countOf = (list) => {
    const metrics = metricsFromRecords(list);
    return { ecnCount: metrics.ecnCount, ecnMachinedCount: metrics.ecnMachinedCount, nonBomCount: metrics.nonBomCount, nonBomMachinedCount: metrics.nonBomMachinedCount, projectCount: metrics.projectCount };
  };
  if (role === "产总") {
    const mine = org.filter((row) => orgMappedPeople([row], ["productionDirector", "产总"]).includes(pmPerson(recipient)));
    return orgMappedPeople(mine, ["tpm", "TPM"]).map((tpm) => {
      const pms = new Set(orgMappedPeople(mine.filter((row) => orgMappedPeople([row], ["tpm", "TPM"]).includes(tpm)), ["pm", "PM"]));
      return { name: tpm, ...countOf(rows.filter((row) => pms.has(pmPerson(row.pm)))) };
    });
  }
  if (role === "TPM") {
    const mine = org.filter((row) => orgMappedPeople([row], ["tpm", "TPM"]).includes(pmPerson(recipient)));
    return orgMappedPeople(mine, ["pm", "PM"]).map((pm) => ({ name: pm, ...countOf(rows.filter((row) => pmPerson(row.pm) === pm)) }));
  }
  if (role === "PM") {
    const mine = rows.filter((row) => pmPerson(row.pm) === pmPerson(recipient));
    return unique(mine.map((row) => row.engineer)).map((engineer) => ({ name: engineer, ...countOf(mine.filter((row) => pmPerson(row.engineer) === engineer)) }));
  }
  return [];
};
