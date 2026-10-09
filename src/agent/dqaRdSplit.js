import { canonicalProductDept, normalizeOrgRecord } from "../orgMappingParse.js";
import { buildDqaAgentRawMetrics, excludeEcnMachinedRow } from "../dataEngine.js";

const DIVISIONS = ["半导体&北美", "产品五部", "FPC事业部"];
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const repairDivision = (value = "") => {
  const source = clean(value);
  if (!source) return "";
  const direct = canonicalProductDept(source);
  if (DIVISIONS.includes(direct)) return direct;
  if (!source.includes("\uFFFD")) return "";
  const stripped = clean(source.replace(/\uFFFD/g, ""));
  const again = canonicalProductDept(stripped);
  if (DIVISIONS.includes(again)) return again;
  if (/五/.test(stripped)) return "产品五部";
  if (/FPC|FCP|事业/i.test(source) || /FPC|FCP|事业/i.test(stripped)) return "FPC事业部";
  if (/半|导|北美|传感|载版|载板/.test(stripped)) return "半导体&北美";
  return "";
};
const divisionOf = (value, fileName = "") => repairDivision(value) || repairDivision(fileName);
const rowSignature = (field, row, division) => [field, division, clean(row.tpm), clean(row.pm), clean(row.reason), clean(row.category), clean(row.kind), String(row.count ?? row.quantity ?? "")].join("\u0001");
const normalizeDqaFacts = (facts = []) => facts.map((fact) => {
  const copyList = (field) => {
    const rows = fact[field] || [];
    const cleanKeys = new Set();
    const kept = [];
    rows.forEach((row) => {
      const original = clean(row.division);
      if (original && DIVISIONS.includes(original)) {
        cleanKeys.add(rowSignature(field, row, original));
        kept.push(row);
      }
    });
    rows.forEach((row) => {
      const original = clean(row.division);
      if (!original) {
        kept.push(row);
        return;
      }
      if (DIVISIONS.includes(original)) return;
      const division = repairDivision(original);
      if (!division) return;
      const signature = rowSignature(field, row, division);
      if (cleanKeys.has(signature)) return;
      cleanKeys.add(signature);
      kept.push({ ...row, division });
    });
    return kept;
  };
  return { ...fact, issues: copyList("issues"), ecn: copyList("ecn"), ecnDenRows: copyList("ecnDenRows"), partRows: copyList("partRows"), reviews: copyList("reviews") };
});
const monthKey = (year, month) => `${year}-${String(month).padStart(2, "0")}`;
const inSpan = (year, month, start, end) => {
  if (!start || !end || !year || !month) return false;
  const key = monthKey(year, month);
  return key >= start.slice(0, 7) && key <= end.slice(0, 7);
};
const pointOf = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const adjusted = [15, 16].includes(value.getUTCHours()) ? new Date(value.getTime() + 8 * 60 * 60 * 1000 + 60 * 1000) : value;
    return { year: adjusted.getUTCFullYear(), month: adjusted.getUTCMonth() + 1 };
  }
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  }
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) return null;
  return { year: parsed.getUTCFullYear(), month: parsed.getUTCMonth() + 1 };
};
const batchOrder = (reason) => /分批/.test(clean(reason));
const reviewStage = (row) => /评审/.test(clean(row["阶段"] || row["问题发生地"] || row["问题反馈部门"]));
const rate = (part, total) => total ? Number((part / total * 100).toFixed(1)) : null;
const blankMonth = () => ({
  issues: [],
  ecn: [],
  ecnDenominator: Object.fromEntries(DIVISIONS.map((name) => [name, 0])),
  ecnDenRows: [],
  partRows: [],
  parts: { ecn: Object.fromEntries(DIVISIONS.map((name) => [name, 0])), nonBom: Object.fromEntries(DIVISIONS.map((name) => [name, 0])), ecnDenominator: 0, nonBomDenominator: 0 },
  reviews: [],
});

const issueFiles = (files) => (files || []).filter((file) => file.module === "DQA"
  && file.subKind !== "DQA_ECN"
  && file.subKind !== "DQA_ENGINEER_SUPPLEMENT"
  && file.subKind !== "DQA_MACHINED_PARTS"
  && file.kind !== "DQA_MACHINED_PARTS");
const ecnFiles = (files) => (files || []).filter((file) => file.module === "DQA" && (file.subKind === "DQA_ECN" || (!file.subKind && clean(file.name).includes("ECN") && !clean(file.name).includes("非BOM"))));
const partFiles = (files) => (files || []).filter((file) => file.module === "DQA" && (file.subKind === "DQA_MACHINED_PARTS" || file.kind === "DQA_MACHINED_PARTS"));
const supplementOf = (files) => (files || []).find((file) => file.subKind === "DQA_ENGINEER_SUPPLEMENT")?.supplement || {};

const addCount = (list, key, extra) => {
  const current = list.find((item) => item.key === key);
  if (current) current.count += 1;
  else list.push({ key, count: 1, ...extra });
};

const divisionFromPm = (pm, mappings = []) => {
  const name = clean(pm);
  if (!name) return "";
  const hits = (mappings || []).map((row) => normalizeOrgRecord(row)).filter((row) => row.active !== false && clean(row.pm) === name);
  const counts = new Map();
  hits.forEach((row) => {
    const division = canonicalProductDept(row.productDept);
    if (DIVISIONS.includes(division)) counts.set(division, (counts.get(division) || 0) + 1);
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
};
const monthBag = (list, month) => {
  const found = (list || []).find((item) => Number(item.monthNumber) === month);
  if (found) return found;
  const indexed = list?.[month - 1];
  return indexed && !indexed.monthNumber ? indexed : null;
};
const fillPmMachinedRows = (list, agentRaw, mappings, year, endMonth) => {
  const owned = buildDqaAgentRawMetrics(agentRaw, { start: year + "-01-01", end: year + "-12-31" }).records || [];
  const seen = new Set();
  owned.forEach((row) => {
    if (!row.isMachined) return;
    const kind = row.source === "非BOM" ? "非BOM" : "ECN";
    if (kind === "ECN" && excludeEcnMachinedRow(row)) return;
    const point = pointOf(row.date);
    if (!point || point.year !== year || point.month < 1 || point.month > endMonth) return;
    const code = clean(row.materialCode);
    const pm = clean(row.pm);
    if (!code || !pm) return;
    const dedupeKey = kind + "|" + point.year + "-" + point.month + "|" + pm + "|" + code;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const bag = monthBag(list, point.month);
    if (!bag?.parts) return;
    const division = divisionFromPm(pm, mappings) || divisionOf(row.productDept || "");
    if (!division) return;
    if (kind === "ECN") bag.parts.ecn[division] += 1;
    else bag.parts.nonBom[division] += 1;
    bag.partRows.push({ division, tpm: clean(row.tpm), pm, kind, quantity: 1, materialCode: code });
  });
};

export const resolveDqaTpm = (division, pm, tpm, mappings = []) => {
  const rows = (mappings || []).map((row) => normalizeOrgRecord(row)).filter((row) => row.active !== false && canonicalProductDept(row.productDept) === division && clean(row.tpm));
  if (!rows.length) return tpm || "";
  if (pm) {
    const hits = rows.filter((row) => clean(row.pm) === pm);
    if (hits.length) {
      const counts = new Map();
      hits.forEach((row) => counts.set(row.tpm, (counts.get(row.tpm) || 0) + 1));
      return [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0];
    }
  }
  return tpm && rows.some((row) => row.tpm === tpm) ? tpm : "";
};

const finish = (sourceFacts, start, end, mappings = []) => {
  const facts = normalizeDqaFacts(sourceFacts);
  const selected = facts.filter((fact) => inSpan(fact.year, fact.monthNumber, start, end));
  const previousDate = start ? new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 2, 1)) : null;
  const previousKey = previousDate ? previousDate.toISOString().slice(0, 7) : "";
  const previous = facts.filter((fact) => fact.key === previousKey);
  const countIssues = (rows) => rows.reduce((sum, fact) => sum + fact.issues.reduce((inner, item) => inner + item.count, 0), 0);
  const divisionCount = (rows, name) => rows.reduce((sum, fact) => sum + fact.issues.filter((item) => item.division === name).reduce((inner, item) => inner + item.count, 0), 0);
  const divisions = DIVISIONS.map((name) => {
    const issues = divisionCount(selected, name);
    const previousIssues = divisionCount(previous, name);
    const ytdIssues = divisionCount(facts, name);
    const ecn = selected.reduce((sum, fact) => sum + fact.ecn.filter((item) => item.division === name && !item.batch).reduce((inner, item) => inner + item.count, 0), 0);
    const ecnDenominator = selected.reduce((sum, fact) => sum + number(fact.ecnDenominator[name]), 0);
    const ecnMachined = selected.reduce((sum, fact) => sum + number(fact.parts.ecn[name]), 0);
    const nonBomMachined = selected.reduce((sum, fact) => sum + number(fact.parts.nonBom[name]), 0);
    const ecnPartDenominator = selected.reduce((sum, fact) => sum + number(fact.parts.ecnDenominator), 0);
    const nonBomPartDenominator = selected.reduce((sum, fact) => sum + number(fact.parts.nonBomDenominator), 0);
    const reviews = selected.reduce((sum, fact) => sum + fact.reviews.filter((item) => item.division === name).reduce((inner, item) => inner + item.count, 0), 0);
    const suggestions = selected.reduce((sum, fact) => sum + fact.reviews.filter((item) => item.division === name).reduce((inner, item) => inner + item.suggestions, 0), 0);
    return {
      name,
      issues,
      previousIssues,
      ytdIssues,
      ecn,
      ecnDenominator,
      ecnRate: rate(ecn, ecnDenominator),
      ecnMachined,
      ecnMachinedRate: rate(ecnMachined, ecnPartDenominator),
      nonBomMachined,
      nonBomMachinedRate: rate(nonBomMachined, nonBomPartDenominator),
      reviews,
      suggestions,
    };
  });
  const tpmMap = new Map();
  const ensureTpm = (division, pm, tpm) => {
    const name = resolveDqaTpm(division, pm, tpm, mappings);
    if (!name) return null;
    const key = division + "\u0001" + name;
    const current = tpmMap.get(key) || { division, name, issues: 0, categories: new Map(), ecn: 0, ecnDenominator: 0, ecnMachined: 0, nonBomMachined: 0, reviews: 0, suggestions: 0 };
    tpmMap.set(key, current);
    return current;
  };
  const companyPartDenominator = (rows, kind) => rows.reduce((sum, fact) => sum + number(kind === "ECN" ? fact.parts.ecnDenominator : fact.parts.nonBomDenominator), 0);
  const ecnPartDenominator = companyPartDenominator(selected, "ECN");
  const nonBomPartDenominator = companyPartDenominator(selected, "非BOM");
  selected.forEach((fact) => {
    fact.issues.forEach((item) => {
      const current = ensureTpm(item.division, item.pm, item.tpm);
      if (!current) return;
      current.issues += item.count;
      current.categories.set(item.category, (current.categories.get(item.category) || 0) + item.count);
    });
    fact.ecn.forEach((item) => {
      if (item.batch) return;
      const current = ensureTpm(item.division, item.pm, item.tpm);
      if (!current) return;
      current.ecn += item.count;
    });
    (fact.ecnDenRows || []).forEach((item) => {
      const current = ensureTpm(item.division, item.pm, item.tpm);
      if (!current) return;
      current.ecnDenominator += item.count;
    });
    (fact.partRows || []).forEach((item) => {
      const current = ensureTpm(item.division, item.pm, item.tpm);
      if (!current) return;
      if (item.kind === "ECN") current.ecnMachined += item.quantity;
      else current.nonBomMachined += item.quantity;
    });
    fact.reviews.forEach((item) => {
      const seen = new Set();
      (item.members || []).forEach((member) => {
        const current = ensureTpm(item.division, "", member);
        if (!current || seen.has(current.name)) return;
        seen.add(current.name);
        current.reviews += item.count;
      });
      (item.proposers || []).forEach((member) => {
        const current = ensureTpm(item.division, "", member);
        if (!current) return;
        current.suggestions += 1;
      });
    });
  });
  const tpms = [...tpmMap.values()].map((item) => ({
    division: item.division,
    name: item.name,
    issues: item.issues,
    topCategory: [...item.categories.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"))[0]?.[0] || "",
    ecn: item.ecn,
    ecnRate: rate(item.ecn, item.ecnDenominator),
    ecnMachined: item.ecnMachined,
    ecnMachinedRate: rate(item.ecnMachined, ecnPartDenominator),
    nonBomMachined: item.nonBomMachined,
    nonBomMachinedRate: rate(item.nonBomMachined, nonBomPartDenominator),
    reviews: item.reviews,
    suggestions: item.suggestions,
    reviewEffect: item.reviews ? rate(item.suggestions, item.reviews) : null,
  })).sort((left, right) => right.issues - left.issues || right.ecnMachined - left.ecnMachined || left.name.localeCompare(right.name, "zh-CN"));
  const categoryMap = new Map();
  const reasonMap = new Map();
  selected.forEach((fact) => {
    fact.issues.forEach((item) => categoryMap.set(item.category, (categoryMap.get(item.category) || 0) + item.count));
    fact.ecn.forEach((item) => {
      if (item.batch) return;
      reasonMap.set(item.reason, (reasonMap.get(item.reason) || 0) + item.count);
    });
  });
  const categories = [...categoryMap.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN")).slice(0, 8);
  const reasons = [...reasonMap.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN")).slice(0, 8);
  const divisionMonthly = DIVISIONS.map((name) => ({
    name,
    rows: facts.map((fact) => ({ month: fact.month, count: fact.issues.filter((item) => item.division === name).reduce((sum, item) => sum + item.count, 0) })),
  }));
  const partMonthly = facts.map((fact) => {
    const ecn = DIVISIONS.reduce((sum, name) => sum + number(fact.parts.ecn[name]), 0);
    const nonBom = DIVISIONS.reduce((sum, name) => sum + number(fact.parts.nonBom[name]), 0);
    return {
      month: fact.month,
      ecn,
      nonBom,
      ecnRate: rate(ecn, fact.parts.ecnDenominator),
      nonBomRate: rate(nonBom, fact.parts.nonBomDenominator),
    };
  });
  const tpmPartMonthly = (() => {
    const series = new Map();
    facts.forEach((fact, index) => {
      const grouped = new Map();
      (fact.partRows || []).forEach((item) => {
        const name = resolveDqaTpm(item.division, item.pm, item.tpm, mappings);
        if (!name) return;
        const key = item.division + "\u0001" + name;
        const current = grouped.get(key) || { division: item.division, name, ecn: 0, nonBom: 0 };
        if (item.kind === "ECN") current.ecn += item.quantity;
        else current.nonBom += item.quantity;
        grouped.set(key, current);
      });
      grouped.forEach((item, key) => {
        const row = series.get(key) || { division: item.division, name: item.name, ecnRate: facts.map(() => null), nonBomRate: facts.map(() => null) };
        row.ecnRate[index] = rate(item.ecn, fact.parts.ecnDenominator);
        row.nonBomRate[index] = rate(item.nonBom, fact.parts.nonBomDenominator);
        series.set(key, row);
      });
    });
    return { months: facts.map((fact) => fact.month), target: 0.8, series: [...series.values()] };
  })();
  const reviews = selected.reduce((sum, fact) => sum + fact.reviews.reduce((inner, item) => inner + item.count, 0), 0);
  const suggestions = selected.reduce((sum, fact) => sum + fact.reviews.reduce((inner, item) => inner + item.suggestions, 0), 0);
  const batchExcluded = facts.reduce((sum, fact) => sum + fact.ecn.filter((item) => item.batch).reduce((inner, item) => inner + item.count, 0), 0);
  return {
    period: { start, end },
    previousPeriod: previousKey,
    divisions,
    tpms,
    categories,
    reasons,
    divisionMonthly,
    partMonthly,
    tpmPartMonthly,
    machinedTarget: 0.8,
    totals: {
      issues: countIssues(selected),
      previousIssues: countIssues(previous),
      ytdIssues: countIssues(facts),
      reviews,
      suggestions,
      batchExcluded,
    },
  };
};

export const buildDqaRdSplit = (files, period, mappings = [], agentRaw = null) => {
  const useAgentRows = Boolean((agentRaw?.ecnRecords || []).length || (agentRaw?.nonBomRecords || []).length);
  const start = period?.start2026 || "";
  const end = period?.end2026 || "";
  const endMonth = Number(String(end).slice(5, 7)) || 0;
  const trendYear = Number(String(end).slice(0, 4)) || 0;
  const months = Array.from({ length: endMonth }, (_, index) => blankMonth());
  const touch = (year, month) => year === trendYear && month >= 1 && month <= endMonth ? months[month - 1] : null;
  issueFiles(files).forEach((file) => {
    (file.rows || []).forEach((row) => {
      if (!clean(row["问题描述"]) || reviewStage(row)) return;
      const point = pointOf(row["发生日期"] || row["下单日期"] || row["时间"] || row["日期"]);
      const division = divisionOf(row["产品部"], file.name);
      const bag = point ? touch(point.year, point.month) : null;
      if (!division || !bag) return;
      addCount(bag.issues, [division, clean(row.PM), clean(row.TPM), clean(row["问题分类"] || row["类别"]) || "未分类"].join("\u0001"), {
        division,
        pm: clean(row.PM),
        tpm: clean(row.TPM),
        category: clean(row["问题分类"] || row["类别"]) || "未分类",
      });
    });
  });
  ecnFiles(files).forEach((file) => {
    (file.rows || []).forEach((row) => {
      const sheet = clean(row.__sheet);
      const numerator = sheet.includes("分子") || row["申请日期"] != null;
      const denominator = sheet.includes("分母") || row["制单日期"] != null;
      const point = pointOf(numerator ? row["申请日期"] : row["制单日期"]);
      const division = divisionOf(row["产品部"], file.name);
      const bag = point ? touch(point.year, point.month) : null;
      if (!division || !bag) return;
      if (numerator && !denominator) {
        const reason = clean(row["变更原因"]) || "未填写";
        addCount(bag.ecn, [division, clean(row.TPM), clean(row.PM), reason].join("\u0001"), { division, tpm: clean(row.TPM), pm: clean(row.PM), reason, batch: batchOrder(reason) });
      } else if (denominator) {
        const materialCount = number(row["物料款数"]);
        bag.ecnDenominator[division] += materialCount;
        if (materialCount) bag.ecnDenRows.push({ division, tpm: clean(row.TPM), pm: clean(row.PM), count: materialCount });
      }
    });
  });
  partFiles(files).forEach((file) => {
    (file.rows || []).forEach((row) => {
      const kind = clean(row.__partKind);
      if (kind !== "ECN" && kind !== "非BOM") return;
      const year = number(row["年份"] || row.__year);
      const month = number(row["月份"] || row.__month);
      const bag = touch(year, month);
      if (!bag) return;
      const quantity = number(row["数量"] ?? row.__quantity);
      const divisionLabel = clean(row["产品部"] || row.__division);
      const tpmLabel = clean(row.TPM || row.__tpm);
      if (divisionLabel.includes("加工件总数")) {
        const shared = quantity || bag.parts.ecnDenominator || bag.parts.nonBomDenominator;
        if (shared > 0 && !bag.parts.ecnDenominator) bag.parts.ecnDenominator = shared;
        bag.parts.nonBomDenominator = bag.parts.ecnDenominator || shared;
        return;
      }
      if (/总计/.test(divisionLabel) || /总计/.test(tpmLabel) || useAgentRows) return;
      const division = divisionOf(row["产品部"] || row.__division, file.name);
      if (!division) return;
      if (kind === "ECN") bag.parts.ecn[division] += quantity;
      else bag.parts.nonBom[division] += quantity;
      bag.partRows.push({ division, tpm: clean(row.TPM), pm: clean(row.PM), kind, quantity });
    });
  });
  (supplementOf(files).reviewRecords || []).forEach((record) => {
    const point = pointOf(record.updateDate);
    const bag = point ? touch(point.year, point.month) : null;
    if (!bag) return;
    const division = divisionOf(record.fileName) || "";
    bag.reviews.push({ division, count: 1, suggestions: Array.isArray(record.proposers) ? record.proposers.length : 0, members: record.members || [], proposers: record.proposers || [] });
  });
  if (useAgentRows) fillPmMachinedRows(months, agentRaw, mappings, trendYear, endMonth);
  const monthFacts = months.map((bag, index) => ({
    month: `${index + 1}月`,
    monthNumber: index + 1,
    key: monthKey(trendYear, index + 1),
    year: trendYear,
    ...bag,
  }));
  return {
    rule: "研发问题取问题描述，阶段含评审的不计入。评审次数和有效改善项只取评审表。ECN分批下单不计入异常。ECN比例=变更项/物料款数。ECN加工件剔除变更原因为分批下单/多人协作下单、装配3D更新(无物料变更)、PLM系统原因、提前采购相关事宜的行，并剔除工程师建议为无需处理或退料的行。ECN和非BOM加工件都按同一PM、同一月份、同一物料代码只计一次，隔月不去重。分母都是当月全公司加工件总数。产品部只有半导体&北美、产品五部、FPC事业部。TPM只认研发组织映射，并只在本产品部内比较。趋势从当年1月到所选截止月。",
    trendYear,
    monthFacts,
    ...finish(monthFacts, start, end, mappings),
  };
};


export const applyDqaPmMachined = (split, agentRaw, mappings = []) => {
  if (!split?.monthFacts?.length) return split;
  const ready = Boolean((agentRaw?.ecnRecords || []).length || (agentRaw?.nonBomRecords || []).length);
  if (!ready) return shapeDqaRdSplit(split, mappings);
  const year = Number(split.trendYear) || Number(String(split.period?.end || split.period?.start || "").slice(0, 4)) || 0;
  const facts = split.monthFacts.map((fact) => {
    const shared = number(fact.parts?.ecnDenominator) || number(fact.parts?.nonBomDenominator);
    return {
      ...fact,
      partRows: [],
      parts: {
        ecn: Object.fromEntries(DIVISIONS.map((name) => [name, 0])),
        nonBom: Object.fromEntries(DIVISIONS.map((name) => [name, 0])),
        ecnDenominator: shared,
        nonBomDenominator: shared,
      },
    };
  });
  const endMonth = Math.max(...facts.map((fact) => Number(fact.monthNumber) || 0), 0);
  fillPmMachinedRows(facts, agentRaw, mappings, year, endMonth);
  return shapeDqaRdSplit({ ...split, monthFacts: facts, partSource: "pm-rows" }, mappings);
};
export const shapeDqaRdSplit = (split, mappings = []) => {
  if (!split?.monthFacts) return split;
  const shaped = finish(split.monthFacts, split.period?.start || "", split.period?.end || "", mappings);
  return { ...split, ...shaped, monthFacts: split.monthFacts };
};

const monthBounds = (year, label) => {
  const match = String(label || "").match(/(\d{1,2})\s*月/);
  const month = match ? Number(match[1]) : 0;
  if (!year || month < 1 || month > 12) return null;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(Number(year), month, 0)).getUTCDate()).padStart(2, "0")}`;
  return { month, start, end };
};

export const dqaRdSnapshotReady = (snapshot) => Array.isArray(snapshot?.data?.dqaSplit?.monthFacts) && snapshot.data.dqaSplit.monthFacts.some((fact) => (fact.issues || []).length || (fact.ecn || []).length || (fact.reviews || []).length);

export const sliceDqaRdSnapshotToWindow = (snapshot, window = {}, sourcePeriod = null) => {
  if (!snapshot || snapshot.module !== "DQA" || !snapshot.data?.dqaSplit?.monthFacts) return snapshot;
  const start = window.start || "";
  const end = window.end || "";
  if (!start || !end) return snapshot;
  const ownStart = sourcePeriod?.start2026 || snapshot.period?.start2026 || "";
  const ownEnd = sourcePeriod?.end2026 || snapshot.period?.end2026 || "";
  if (ownStart === start && ownEnd === end) return snapshot;
  const year = start.slice(0, 4);
  const endMonth = Number(end.slice(5, 7)) || 12;
  const facts = snapshot.data.dqaSplit.monthFacts.filter((fact) => {
    const bounds = monthBounds(year, fact.month);
    return Boolean(bounds && bounds.month <= endMonth);
  });
  const shaped = finish(facts, start, end);
  return {
    ...snapshot,
    period: { ...(snapshot.period || {}), start2026: start, end2026: end },
    selectedWindow: { start, end },
    data: { ...snapshot.data, dqaSplit: { ...snapshot.data.dqaSplit, monthFacts: facts, ...shaped, period: { start, end } } },
  };
};
