import { canonicalProductDept, canonicalProjectGroup, normalizeOrgRecord } from "../orgMappingParse.js";

const DIVISIONS = ["半导体&北美", "产品五部", "FPC事业部"];
const MACHINES = ["治具", "自动化"];
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const clean = (value) => String(value ?? "").trim();
const deptOf = (value) => {
  const name = canonicalProductDept(value);
  return DIVISIONS.includes(name) ? name : "";
};
const monthKey = (year, month) => `${year}-${String(month).padStart(2, "0")}`;
const inSpan = (year, month, start, end) => {
  if (!start || !end || !year || !month) return false;
  const key = monthKey(year, month);
  return key >= start.slice(0, 7) && key <= end.slice(0, 7);
};
const pointMonth = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const adjusted = [15, 16].includes(value.getUTCHours()) ? new Date(value.getTime() + 8 * 60 * 60 * 1000 + 60 * 1000) : value;
    return { year: adjusted.getUTCFullYear(), month: adjusted.getUTCMonth() + 1 };
  }
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return { year: parsed.getUTCFullYear(), month: parsed.getUTCMonth() + 1 };
};
const blankScore = () => ({ count: 0, scoreTotal: 0, five: 0, low: 0 });
const addScore = (bucket, score, count) => {
  if (!count || !score) return;
  bucket.count += count;
  bucket.scoreTotal += score * count;
  if (score === 5) bucket.five += count;
  if (score <= 3) bucket.low += count;
};
const finishScore = (bucket) => ({
  count: bucket.count,
  five: bucket.five,
  low: bucket.low,
  avg: bucket.count ? Number((bucket.scoreTotal / bucket.count).toFixed(2)) : null,
  fiveRate: bucket.count ? Number((bucket.five / bucket.count * 100).toFixed(1)) : null,
  lowRate: bucket.count ? Number((bucket.low / bucket.count * 100).toFixed(1)) : null,
});
const blankBag = () => ({
  divisions: Object.fromEntries(DIVISIONS.map((name) => [name, blankScore()])),
  tpms: new Map(),
  machines: Object.fromEntries(MACHINES.map((name) => [name, blankScore()])),
});
const addDivision = (bag, division, score, count, tpm) => {
  addScore(bag.divisions[division], score, count);
  if (!tpm || tpm === "__总计__" || tpm === "总计") return;
  const key = division + "\u0001" + tpm;
  const current = bag.tpms.get(key) || { division, name: tpm, ...blankScore() };
  addScore(current, score, count);
  bag.tpms.set(key, current);
};
const addMachine = (bag, name, score, count) => {
  if (!bag.machines[name]) return;
  addScore(bag.machines[name], score, count);
};
const serialBag = (bag) => ({
  divisions: Object.fromEntries(DIVISIONS.map((name) => [name, { ...bag.divisions[name] }])),
  tpms: [...bag.tpms.values()].map((item) => ({ division: item.division, name: item.name, count: item.count, scoreTotal: item.scoreTotal, five: item.five, low: item.low })),
  machines: Object.fromEntries(MACHINES.map((name) => [name, { ...bag.machines[name] }])),
});
const bagFromFact = (fact) => {
  const bag = blankBag();
  DIVISIONS.forEach((name) => {
    const source = fact?.divisions?.[name] || {};
    bag.divisions[name] = { count: number(source.count), scoreTotal: number(source.scoreTotal), five: number(source.five), low: number(source.low) };
  });
  (fact?.tpms || []).forEach((item) => {
    bag.tpms.set(item.division + "\u0001" + item.name, { division: item.division, name: item.name, count: number(item.count), scoreTotal: number(item.scoreTotal), five: number(item.five), low: number(item.low) });
  });
  MACHINES.forEach((name) => {
    const source = fact?.machines?.[name] || {};
    bag.machines[name] = { count: number(source.count), scoreTotal: number(source.scoreTotal), five: number(source.five), low: number(source.low) };
  });
  return bag;
};
const mergeBags = (facts) => {
  const bag = blankBag();
  facts.forEach((fact) => {
    const source = bagFromFact(fact);
    DIVISIONS.forEach((name) => {
      const from = source.divisions[name];
      const to = bag.divisions[name];
      to.count += from.count;
      to.scoreTotal += from.scoreTotal;
      to.five += from.five;
      to.low += from.low;
    });
    source.tpms.forEach((item, key) => {
      const current = bag.tpms.get(key) || { division: item.division, name: item.name, ...blankScore() };
      current.count += item.count;
      current.scoreTotal += item.scoreTotal;
      current.five += item.five;
      current.low += item.low;
      bag.tpms.set(key, current);
    });
    MACHINES.forEach((name) => {
      const from = source.machines[name];
      const to = bag.machines[name];
      to.count += from.count;
      to.scoreTotal += from.scoreTotal;
      to.five += from.five;
      to.low += from.low;
    });
  });
  return bag;
};
const machineRows = (bag) => {
  const rows = MACHINES.map((name) => ({ name, ...finishScore(bag.machines[name]) }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows.map((row) => ({ ...row, share: total ? Number((row.count / total * 100).toFixed(1)) : null }));
};
const finishScope = (bag, previousBag = null) => {
  const divisions = DIVISIONS.map((name) => {
    const current = finishScore(bag.divisions[name]);
    const previous = finishScore(previousBag?.divisions?.[name] || blankScore());
    return {
      name,
      ...current,
      previousCount: previous.count,
      previousAvg: previous.avg,
      previousFiveRate: previous.fiveRate,
      previousLowRate: previous.lowRate,
    };
  });
  const tpms = [...bag.tpms.values()].map((item) => ({ division: item.division, name: item.name, ...finishScore(item) }))
    .filter((item) => item.count > 0)
    .sort((a, b) => (a.fiveRate ?? 999) - (b.fiveRate ?? 999) || (b.lowRate ?? 0) - (a.lowRate ?? 0) || a.name.localeCompare(b.name, "zh-CN"));
  const focus = [];
  divisions.forEach((division) => {
    tpms.filter((item) => item.division === division.name).forEach((item) => {
      const worseFive = division.fiveRate != null && item.fiveRate != null && item.fiveRate < division.fiveRate;
      const worseLow = division.lowRate != null && item.lowRate != null && item.lowRate > division.lowRate;
      if (!worseFive && !worseLow) return;
      focus.push({ division: item.division, name: item.name, count: item.count, avg: item.avg, fiveRate: item.fiveRate, lowRate: item.lowRate, divisionFiveRate: division.fiveRate, divisionLowRate: division.lowRate, worseFive, worseLow });
    });
  });
  const totals = finishScore(DIVISIONS.reduce((sum, name) => {
    const source = bag.divisions[name];
    sum.count += source.count;
    sum.scoreTotal += source.scoreTotal;
    sum.five += source.five;
    sum.low += source.low;
    return sum;
  }, blankScore()));
  return { divisions, tpms, focus, machines: machineRows(bag), totals };
};

const ytdFields = (score = {}) => ({
  ytdCount: number(score.count),
  ytdAvg: score.avg ?? null,
  ytdFiveRate: score.fiveRate ?? null,
  ytdLowRate: score.lowRate ?? null,
});
const withYearToDate = (scope, facts) => {
  const ytd = finishScope(mergeBags(facts || []));
  const divisions = new Map(ytd.divisions.map((item) => [item.name, item]));
  const tpms = new Map(ytd.tpms.map((item) => [item.division + "\u0001" + item.name, item]));
  const machines = new Map(ytd.machines.map((item) => [item.name, item]));
  const rows = new Map(scope.tpms.map((item) => [item.division + "\u0001" + item.name, item]));
  ytd.tpms.forEach((item) => {
    const key = item.division + "\u0001" + item.name;
    if (!rows.has(key)) rows.set(key, { division: item.division, name: item.name, count: 0, five: 0, low: 0, avg: null, fiveRate: null, lowRate: null });
  });
  return {
    ...scope,
    divisions: scope.divisions.map((item) => ({ ...item, ...ytdFields(divisions.get(item.name)) })),
    tpms: [...rows.values()].map((item) => ({ ...item, ...ytdFields(tpms.get(item.division + "\u0001" + item.name)) }))
      .sort((a, b) => (a.fiveRate ?? 999) - (b.fiveRate ?? 999) || (b.lowRate ?? 0) - (a.lowRate ?? 0) || String(a.division).localeCompare(String(b.division), "zh-CN") || String(a.name).localeCompare(String(b.name), "zh-CN")),
    machines: scope.machines.map((item) => {
      const source = machines.get(item.name) || {};
      return { ...item, ...ytdFields(source), ytdShare: source.share ?? null };
    }),
    totals: { ...scope.totals, ...ytdFields(ytd.totals) },
  };
};
const monthlyFromFacts = (facts) => DIVISIONS.map((name) => ({
  name,
  label: name,
  rows: facts.map((fact) => {
    const score = finishScore(fact.divisions?.[name] || {});
    return { month: fact.month, count: score.count, five: score.five, avg: score.avg, fiveRate: score.fiveRate, low: score.low, lowRate: score.lowRate };
  }),
}));

export const buildOqcShipmentSplit = (files, period) => {
  const start = period?.start2026 || "";
  const end = period?.end2026 || "";
  const endMonth = Number(String(end).slice(5, 7)) || 0;
  const trendYear = Number(String(end).slice(0, 4)) || 0;
  const previousDate = start ? new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 2, 1)) : null;
  const previousKey = previousDate ? previousDate.toISOString().slice(0, 7) : "";
  const current = blankBag();
  const previous = blankBag();
  const monthBags = Array.from({ length: endMonth }, () => blankBag());
  (files || []).filter((file) => file.module === "OQC" && file.kind === "OQC_MONTHLY_SUMMARY").forEach((file) => {
    (file.rows || []).forEach((row) => {
      const division = deptOf(row["产品部"]);
      const year = number(row["年份"]);
      const month = number(row["月份"]);
      const score = number(row["评分档位"]);
      const count = number(row["数量"]);
      if (!division || !year || !month || !score || !count) return;
      if (year === trendYear && month >= 1 && month <= endMonth) addDivision(monthBags[month - 1], division, score, count, clean(row.TPM));
      if (inSpan(year, month, start, end)) addDivision(current, division, score, count, clean(row.TPM));
      if (previousKey && monthKey(year, month) === previousKey) addDivision(previous, division, score, count, clean(row.TPM));
    });
  });
  (files || []).filter((file) => file.module === "OQC" && file.kind === "OQC_SHIPMENT_DETAIL").forEach((file) => {
    (file.rows || []).forEach((row) => {
      const machine = clean(row["机台分类"]);
      if (!MACHINES.includes(machine)) return;
      const point = pointMonth(row["日期"]);
      if (!point) return;
      const score = number(row["最终评分"]);
      const count = Math.max(0, number(row["机台数量"]) || 1);
      if (!score || !count) return;
      if (point.year === trendYear && point.month >= 1 && point.month <= endMonth) addMachine(monthBags[point.month - 1], machine, score, count);
      if (inSpan(point.year, point.month, start, end)) addMachine(current, machine, score, count);
    });
  });
  const monthFacts = monthBags.map((bag, index) => ({ month: `${index + 1}月`, key: monthKey(trendYear, index + 1), ...serialBag(bag) }));
  const scope = withYearToDate(finishScope(current, previous), monthFacts);
  const divisionMonthly = monthlyFromFacts(monthFacts);
  const monthly = (divisionMonthly[0]?.rows || []).map((row, index) => {
    const count = divisionMonthly.reduce((sum, item) => sum + number(item.rows?.[index]?.count), 0);
    const five = divisionMonthly.reduce((sum, item) => sum + number(item.rows?.[index]?.five), 0);
    const low = divisionMonthly.reduce((sum, item) => sum + number(item.rows?.[index]?.low), 0);
    return { month: row.month, count, five, low, fiveRate: count ? Number((five / count * 100).toFixed(1)) : 0, lowRate: count ? Number((low / count * 100).toFixed(1)) : 0 };
  });
  return {
    rule: "5分率、平均分、低分率取评分按月汇总。低分是3分及以下。5分率=5分台数/出货台数，平均分=评分档位乘数量后除以出货台数。产品部只保留半导体&北美、产品五部、FPC事业部。TPM只在本产品部内比较，出货少于5台也参加排名。5分率低于本产品部，或低分率高于本产品部，就点名。治具和自动化取出发明细里机台分类为治具或自动化的整机，组件不计入。趋势从当年1月到所选截止日期。某月没有出货时比率留空，不用0去比。",
    period: { start, end },
    previousPeriod: previousKey,
    trendYear,
    divisions: scope.divisions,
    tpms: scope.tpms,
    focus: scope.focus,
    machines: scope.machines,
    monthly,
    divisionMonthly,
    monthFacts,
    totals: scope.totals,
  };
};


const shortProjectGroup = (group) => group === "北美项目部" ? "北美" : group === "传感器产品部" ? "传感器" : group === "IC载版" ? "IC载版" : "";
export const oqcFiveTarget = (division, projectGroup) => {
  if (division !== "半导体&北美") return 60;
  const group = canonicalProjectGroup(projectGroup);
  if (group === "北美项目部") return 65;
  if (group === "传感器产品部" || group === "IC载版") return 70;
  return null;
};
const groupForTpm = (mappings, division, name) => {
  const counts = new Map();
  (mappings || []).forEach((row) => {
    const item = normalizeOrgRecord(row);
    if (item.active === false || clean(item.tpm) !== name) return;
    if (canonicalProductDept(item.productDept) !== division) return;
    const group = canonicalProjectGroup(item.projectGroup);
    if (!group) return;
    counts.set(group, (counts.get(group) || 0) + 1);
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
};
const scoreCell = (count, five, low, scoreTotal, target) => {
  if (!count) return { value: null, count: 0, five: 0, low: 0, scoreTotal: 0, target };
  const fiveRate = Number((five / count * 100).toFixed(1));
  return {
    value: fiveRate,
    fiveRate,
    avg: Number((scoreTotal / count).toFixed(2)),
    lowRate: Number((low / count * 100).toFixed(1)),
    count,
    five,
    low,
    scoreTotal,
    target,
  };
};
export const oqcTpmHeatmap = (split, divisionName, mappings = []) => {
  const endMonth = Number(String(split?.period?.end || "").slice(5, 7)) || 0;
  const facts = (split?.monthFacts || []).filter((fact) => {
    const month = Number(String(fact?.month || "").match(/(\d{1,2})/)?.[1] || 0);
    return month >= 1 && (!endMonth || month <= endMonth);
  });
  const columns = facts.map((fact) => fact.month);
  const names = [];
  (split?.tpms || []).forEach((item) => {
    if (item?.division === divisionName && item.name && !names.includes(item.name)) names.push(item.name);
  });
  facts.forEach((fact) => {
    (fact.tpms || []).forEach((item) => {
      if (item?.division === divisionName && item.name && number(item.count) > 0 && !names.includes(item.name)) names.push(item.name);
    });
  });
  const rows = names.map((name) => {
    const group = groupForTpm(mappings, divisionName, name);
    const target = oqcFiveTarget(divisionName, group);
    const short = shortProjectGroup(group);
    return {
      label: short ? name + "·" + short : name,
      name,
      group,
      target,
      cells: facts.map((fact) => {
        const item = (fact.tpms || []).find((row) => row.division === divisionName && row.name === name);
        return scoreCell(number(item?.count), number(item?.five), number(item?.low), number(item?.scoreTotal), target);
      }),
    };
  }).map((row) => {
    const total = row.cells.reduce((bag, cell) => {
      bag.count += number(cell.count);
      bag.five += number(cell.five);
      bag.low += number(cell.low);
      bag.scoreTotal += number(cell.scoreTotal);
      return bag;
    }, { count: 0, five: 0, low: 0, scoreTotal: 0 });
    return { ...row, cells: [...row.cells, scoreCell(total.count, total.five, total.low, total.scoreTotal, row.target)] };
  }).filter((row) => row.cells.some((cell) => cell.count > 0));
  return { columns: columns.length ? [...columns, "累计"] : columns, rows };
};
export const oqcSnapshotReady = (snapshot) => {
  const rows = snapshot?.data?.oqcSplit?.divisionMonthly;
  return Array.isArray(rows) && rows.some((cell) => (cell.rows || []).some((row) => number(row.count) > 0));
};

export const pickOqcAnalysisSnapshot = (history = [], period = {}) => {
  const start = period.start2026 || "";
  const end = period.end2026 || "";
  const ready = (history || []).filter((entry) => entry?.active !== false && entry?.module === "OQC" && oqcSnapshotReady(entry.snapshot));
  if (!start || !end || !ready.length) return null;
  const span = (entry) => Date.parse(entry.dateRange?.end2026 + "T00:00:00Z") - Date.parse(entry.dateRange?.start2026 + "T00:00:00Z");
  const exact = ready.filter((entry) => entry.dateRange?.start2026 === start && entry.dateRange?.end2026 === end).sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
  if (exact[0]) return { ...exact[0], matchLevel: "exact-2026" };
  const covering = ready.filter((entry) => entry.dateRange?.start2026 && entry.dateRange?.end2026 && entry.dateRange.start2026 <= start && entry.dateRange.end2026 >= end).sort((a, b) => span(a) - span(b) || String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
  if (!covering[0]) return null;
  return { ...covering[0], matchLevel: "coverage", selectedWindow: { start, end }, coverage: { start: covering[0].dateRange.start2026, end: covering[0].dateRange.end2026 } };
};

const monthBounds = (year, label) => {
  const match = String(label || "").match(/(\d{1,2})\s*月/);
  const month = match ? Number(match[1]) : 0;
  if (!year || month < 1 || month > 12) return null;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(Number(year), month, 0)).getUTCDate()).padStart(2, "0")}`;
  return { month, start, end };
};
const overlaps = (start, end, otherStart, otherEnd) => Boolean(start && end && otherStart && otherEnd && start <= otherEnd && end >= otherStart);

export const sliceOqcSnapshotToWindow = (snapshot, window = {}, sourcePeriod = null) => {
  if (!snapshot || snapshot.module !== "OQC") return snapshot;
  const start = window.start || "";
  const end = window.end || "";
  if (!start || !end) return snapshot;
  const ownStart = sourcePeriod?.start2026 || snapshot.period?.start2026 || "";
  const ownEnd = sourcePeriod?.end2026 || snapshot.period?.end2026 || "";
  if (ownStart === start && ownEnd === end) return snapshot;
  const facts = snapshot.data?.oqcSplit?.monthFacts || [];
  if (!facts.length) return snapshot;
  const year = start.slice(0, 4);
  const endMonth = Number(end.slice(5, 7)) || 12;
  const throughEnd = (label) => {
    const bounds = monthBounds(year, label);
    return Boolean(bounds && bounds.month <= endMonth);
  };
  const inSelected = (label) => {
    const bounds = monthBounds(year, label);
    return Boolean(bounds && overlaps(bounds.start, bounds.end, start, end));
  };
  const previousKey = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const chartFacts = facts.filter((fact) => throughEnd(fact.month));
  const windowFacts = facts.filter((fact) => inSelected(fact.month));
  const previousFact = facts.find((fact) => fact.key === previousKey);
  const scope = withYearToDate(finishScope(mergeBags(windowFacts), previousFact ? bagFromFact(previousFact) : null), chartFacts);
  const divisionMonthly = monthlyFromFacts(chartFacts);
  const monthly = (divisionMonthly[0]?.rows || []).map((row, index) => {
    const count = divisionMonthly.reduce((sum, item) => sum + number(item.rows?.[index]?.count), 0);
    const five = divisionMonthly.reduce((sum, item) => sum + number(item.rows?.[index]?.five), 0);
    const low = divisionMonthly.reduce((sum, item) => sum + number(item.rows?.[index]?.low), 0);
    return { month: row.month, count, five, low, fiveRate: count ? Number((five / count * 100).toFixed(1)) : 0, lowRate: count ? Number((low / count * 100).toFixed(1)) : 0 };
  });
  const metrics = { ...(snapshot.data?.metrics || {}) };
  if ("sampleCount2026" in metrics) metrics.sampleCount2026 = scope.totals.count;
  if ("fiveRate2026" in metrics) metrics.fiveRate2026 = scope.totals.fiveRate;
  if ("lowRate2026" in metrics) metrics.lowRate2026 = scope.totals.lowRate;
  return {
    ...snapshot,
    period: { ...(snapshot.period || {}), start2026: start, end2026: end },
    selectedWindow: { start, end },
    windowResolution: "month",
    data: {
      ...snapshot.data,
      metrics,
      periodTrend: { year: Number(year) || snapshot.data?.oqcSplit?.trendYear || 0, start: `${year}-01-01`, end, rows: monthly.map((row) => ({ label: row.month, bad: row.five, total: row.count, rate: row.fiveRate || 0 })) },
      evidence: { ...(snapshot.data?.evidence || {}), trends: monthly.map((row) => ({ month: row.month, y2026Qty: row.count, y2026Bad: row.low, y2026Rate: row.fiveRate || 0 })) },
      oqcSplit: { ...snapshot.data.oqcSplit, period: { start, end }, previousPeriod: previousKey, divisions: scope.divisions, tpms: scope.tpms, focus: scope.focus, machines: scope.machines, divisionMonthly, monthly, totals: scope.totals },
    },
  };
};

