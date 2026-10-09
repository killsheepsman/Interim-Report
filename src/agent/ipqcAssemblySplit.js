import { isIpqcExcludedBadType, normalizeIpqcLeaderMapRows, normalizeIpqcWorkshop } from "../dataEngine.js";

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const clean = (value) => String(value ?? "").trim();
const CELL_NAMES = ["深圳自制", "杭州自制", "深圳外包", "杭州外包"];

const auditDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const rowDate = (row) => {
  const field = ["日期", "检验日期", "发生日期"].find((name) => clean(row?.[name]));
  const date = field ? auditDate(row[field]) : null;
  if (!date) return null;
  const raw = row?.[field];
  if (raw instanceof Date && [15, 16].includes(date.getUTCHours())) return new Date(date.getTime() + 8 * 60 * 60 * 1000 + 60 * 1000);
  return date;
};
const monthWindow = (start, end) => {
  const from = auditDate(start);
  const to = auditDate(end);
  if (!from || !to) return null;
  return { start: from, end: new Date(to.getTime() + 86399999) };
};
const previousMonthWindow = (period) => {
  const start = auditDate(period?.start2026);
  if (!start) return null;
  const from = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0, 23, 59, 59, 999));
  return { start: from, end: to, label: from.toISOString().slice(0, 7) };
};
const inWindow = (date, window) => Boolean(date && window && date >= window.start && date <= window.end);
const densityOf = (bad, inspected) => inspected ? Number((bad / inspected * 100).toFixed(2)) : null;
const siteOf = (fileName, row) => {
  const file = clean(fileName);
  if (file.includes("杭州")) return "杭州";
  if (file.includes("深圳")) return "深圳";
  const workshop = clean(row?.["产品工坊"] || row?.["工坊"] || row?.["厂区"]);
  if (workshop.includes("杭州")) return "杭州";
  if (workshop.includes("深圳")) return "深圳";
  return "深圳";
};
const outsourcedOf = (row, fileName) => (clean(fileName) + clean(row?.["产品工坊"] || row?.["工坊"])).replace(/\s/g, "").includes("外包");
const qtyOf = (row) => number(row?.["送检数"]);
const badOf = (row) => clean(row?.["不良类型"]) && !isIpqcExcludedBadType(row) ? 1 : 0;
const defectOf = (row) => clean(row?.["不良类型"]).replace(/\s/g, "") || "未分类";
const topDefects = (defects, limit = 5) => Object.entries(defects || {})
  .map(([name, count]) => ({ name, count: number(count) }))
  .filter((item) => item.count > 0)
  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))
  .slice(0, limit);
const mergeDict = (target, source) => {
  Object.entries(source || {}).forEach(([name, count]) => {
    if (!count) return;
    target[name] = number(target[name]) + number(count);
  });
};
const blankCells = () => Object.fromEntries(CELL_NAMES.map((name) => [name, { inspected: 0, bad: 0, defects: {}, workshops: {} }]));
const blankBag = () => ({ cells: blankCells(), managers: new Map() });
const crossWorkshop = (workshops) => {
  const counts = new Map();
  Object.entries(workshops || {}).forEach(([workshop, defects]) => {
    Object.entries(defects || {}).forEach(([name, count]) => {
      if (!count) return;
      const item = counts.get(name) || { name, count: 0, workshops: [] };
      item.count += number(count);
      if (!item.workshops.includes(workshop)) item.workshops.push(workshop);
      counts.set(name, item);
    });
  });
  return [...counts.values()].filter((item) => item.workshops.length >= 2).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN")).slice(0, 8);
};
const addPoint = (bag, point) => {
  const cell = bag.cells[point.cellName];
  if (!cell) return;
  cell.inspected += point.qty;
  cell.bad += point.bad;
  if (point.bad && point.defect) {
    cell.defects[point.defect] = number(cell.defects[point.defect]) + point.bad;
    const shop = cell.workshops[point.workshop] || (cell.workshops[point.workshop] = {});
    shop[point.defect] = number(shop[point.defect]) + point.bad;
  }
  const key = point.site + "\u0001" + point.source + "\u0001" + point.manager;
  const manager = bag.managers.get(key) || { site: point.site, source: point.source, name: point.manager, inspected: 0, bad: 0, defects: {}, leaders: new Map() };
  manager.inspected += point.qty;
  manager.bad += point.bad;
  if (point.bad && point.defect) manager.defects[point.defect] = number(manager.defects[point.defect]) + point.bad;
  if (point.leader) {
    const leader = manager.leaders.get(point.leader) || { name: point.leader, inspected: 0, bad: 0, defects: {} };
    leader.inspected += point.qty;
    leader.bad += point.bad;
    if (point.bad && point.defect) leader.defects[point.defect] = number(leader.defects[point.defect]) + point.bad;
    manager.leaders.set(point.leader, leader);
  }
  bag.managers.set(key, manager);
};
const addCellOnly = (cells, point) => {
  const cell = cells[point.cellName];
  if (!cell) return;
  cell.inspected += point.qty;
  cell.bad += point.bad;
};
const managerView = (manager) => {
  const leaders = [...manager.leaders.values()].map((leader) => ({
    name: leader.name,
    inspected: leader.inspected,
    bad: leader.bad,
    rate: densityOf(leader.bad, leader.inspected),
    topDefects: topDefects(leader.defects, 3),
    defects: leader.defects,
  })).filter((leader) => leader.inspected > 0 || leader.bad > 0);
  return {
    site: manager.site,
    source: manager.source,
    name: manager.name,
    inspected: manager.inspected,
    bad: manager.bad,
    rate: densityOf(manager.bad, manager.inspected),
    topDefects: topDefects(manager.defects, 3),
    defects: manager.defects,
    leaders,
  };
};
const finishScope = (bag) => {
  const cells = CELL_NAMES.map((name) => {
    const cell = bag.cells[name] || { inspected: 0, bad: 0, defects: {}, workshops: {} };
    return {
      name,
      inspected: cell.inspected,
      bad: cell.bad,
      rate: densityOf(cell.bad, cell.inspected),
      defects: topDefects(cell.defects, 5),
      crossWorkshop: crossWorkshop(cell.workshops),
    };
  });
  const managers = [...bag.managers.values()].map(managerView).filter((item) => item.inspected > 0 || item.bad > 0)
    .sort((a, b) => (b.rate || 0) - (a.rate || 0) || a.name.localeCompare(b.name, "zh-CN"));
  const focus = [];
  cells.forEach((cell) => {
    managers.filter((item) => item.site + item.source === cell.name && item.inspected > 0).forEach((item) => {
      const repeated = Object.entries(item.defects || {}).map(([name, count]) => ({ name, count: number(count) })).filter((defect) => defect.count >= 2)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
      const peers = managers.filter((other) => other !== item && other.site + other.source === cell.name && other.inspected > 0);
      const peerInspected = peers.reduce((sum, other) => sum + other.inspected, 0);
      const peerBad = peers.reduce((sum, other) => sum + other.bad, 0);
      const peerRate = peerInspected ? peerBad / peerInspected * 100 : null;
      const higherThanPeers = peerRate == null || item.rate > peerRate;
      if (!repeated.length || !higherThanPeers) return;
      const owners = new Map();
      item.leaders.forEach((leader) => {
        Object.entries(leader.defects || {}).forEach(([name, count]) => {
          if (!count) return;
          const list = owners.get(name) || [];
          list.push({ leader: leader.name, count: number(count) });
          owners.set(name, list);
        });
      });
      const standardDefects = [];
      const leaderDefects = [];
      repeated.forEach((defect) => {
        const found = owners.get(defect.name) || [];
        if (found.length >= 2) standardDefects.push({ name: defect.name, count: defect.count, leaders: found.map((row) => row.leader) });
        else if (found.length === 1) leaderDefects.push({ name: defect.name, count: found[0].count, leader: found[0].leader });
        else standardDefects.push({ name: defect.name, count: defect.count, leaders: [] });
      });
      focus.push({
        site: item.site,
        source: item.source,
        manager: item.name,
        inspected: item.inspected,
        bad: item.bad,
        rate: item.rate,
        cellRate: cell.rate,
        topDefects: repeated.slice(0, 3),
        standardDefects,
        leaderDefects,
        leaders: item.leaders.filter((leader) => leader.bad > 0).sort((a, b) => (b.rate || 0) - (a.rate || 0) || b.bad - a.bad).slice(0, 12).map(({ defects, ...leader }) => leader),
      });
    });
  });
  return {
    cells,
    managers: managers.map(({ defects, leaders, ...item }) => item),
    focus,
  };
};
const serialFact = (bag) => ({
  cells: Object.fromEntries(CELL_NAMES.map((name) => {
    const cell = bag.cells[name];
    return [name, { inspected: cell.inspected, bad: cell.bad, defects: cell.defects, workshops: cell.workshops }];
  })),
  managers: [...bag.managers.values()].map((manager) => ({
    site: manager.site,
    source: manager.source,
    name: manager.name,
    inspected: manager.inspected,
    bad: manager.bad,
    defects: manager.defects,
    leaders: [...manager.leaders.values()].map((leader) => ({ name: leader.name, inspected: leader.inspected, bad: leader.bad, defects: leader.defects })),
  })),
});
const bagFromFact = (fact) => {
  const bag = blankBag();
  CELL_NAMES.forEach((name) => {
    const cell = fact?.cells?.[name] || {};
    bag.cells[name] = {
      inspected: number(cell.inspected),
      bad: number(cell.bad),
      defects: { ...(cell.defects || {}) },
      workshops: Object.fromEntries(Object.entries(cell.workshops || {}).map(([workshop, defects]) => [workshop, { ...defects }])),
    };
  });
  (fact?.managers || []).forEach((manager) => {
    const key = manager.site + "\u0001" + manager.source + "\u0001" + manager.name;
    const leaders = new Map();
    (manager.leaders || []).forEach((leader) => leaders.set(leader.name, { name: leader.name, inspected: number(leader.inspected), bad: number(leader.bad), defects: { ...(leader.defects || {}) } }));
    bag.managers.set(key, { site: manager.site, source: manager.source, name: manager.name, inspected: number(manager.inspected), bad: number(manager.bad), defects: { ...(manager.defects || {}) }, leaders });
  });
  return bag;
};
const mergeBags = (facts) => {
  const bag = blankBag();
  facts.forEach((fact) => {
    const source = bagFromFact(fact);
    CELL_NAMES.forEach((name) => {
      const from = source.cells[name];
      const to = bag.cells[name];
      to.inspected += from.inspected;
      to.bad += from.bad;
      mergeDict(to.defects, from.defects);
      Object.entries(from.workshops).forEach(([workshop, defects]) => {
        to.workshops[workshop] = to.workshops[workshop] || {};
        mergeDict(to.workshops[workshop], defects);
      });
    });
    source.managers.forEach((manager, key) => {
      const current = bag.managers.get(key) || { site: manager.site, source: manager.source, name: manager.name, inspected: 0, bad: 0, defects: {}, leaders: new Map() };
      current.inspected += manager.inspected;
      current.bad += manager.bad;
      mergeDict(current.defects, manager.defects);
      manager.leaders.forEach((leader, leaderName) => {
        const target = current.leaders.get(leaderName) || { name: leaderName, inspected: 0, bad: 0, defects: {} };
        target.inspected += leader.inspected;
        target.bad += leader.bad;
        mergeDict(target.defects, leader.defects);
        current.leaders.set(leaderName, target);
      });
      bag.managers.set(key, current);
    });
  });
  return bag;
};
const monthLabel = (month) => month + "月";
const monthBounds = (year, label) => {
  const match = String(label || "").match(/(\d{1,2})\s*月/);
  const month = match ? Number(match[1]) : 0;
  if (!year || month < 1 || month > 12) return null;
  const start = year + "-" + String(month).padStart(2, "0") + "-01";
  const end = year + "-" + String(month).padStart(2, "0") + "-" + String(new Date(Date.UTC(Number(year), month, 0)).getUTCDate()).padStart(2, "0");
  return { month, start, end };
};
const overlaps = (start, end, otherStart, otherEnd) => Boolean(start && end && otherStart && otherEnd && start <= otherEnd && end >= otherStart);
const monthlyFromFacts = (facts) => CELL_NAMES.map((name) => ({
  name,
  label: name,
  rows: facts.map((fact) => {
    const cell = fact.cells?.[name] || {};
    const inspected = number(cell.inspected);
    const bad = number(cell.bad);
    return { month: fact.month, inspected, bad, rate: densityOf(bad, inspected) };
  }),
}));
const companyMonthly = (cellMonthly) => (cellMonthly[0]?.rows || []).map((row, index) => {
  const inspected = cellMonthly.reduce((sum, cell) => sum + number(cell.rows?.[index]?.inspected), 0);
  const bad = cellMonthly.reduce((sum, cell) => sum + number(cell.rows?.[index]?.bad), 0);
  return { month: row.month, inspected, bad, rate: densityOf(bad, inspected) ?? 0 };
});
const mappingOf = (files) => {
  const rows = (files || []).filter((file) => file.module === "IPQC" && file.kind === "IPQC_LEADER_MAP").flatMap((file) => file.rows || []);
  const leaderMap = new Map();
  const workshopManagers = new Map();
  normalizeIpqcLeaderMapRows(rows).forEach((row) => {
    const site = clean(row.site).includes("杭州") ? "杭州" : "深圳";
    const workshop = normalizeIpqcWorkshop(row.workshop);
    if (row.leader) leaderMap.set(site + "::" + clean(row.leader), row.manager || "");
    if (workshop && row.manager && !workshopManagers.has(site + "::" + workshop)) workshopManagers.set(site + "::" + workshop, row.manager);
  });
  return { leaderMap, workshopManagers };
};
const pointFromRow = (file, row, maps) => {
  const site = siteOf(file.name, row);
  const source = outsourcedOf(row, file.name) ? "外包" : "自制";
  const workshop = normalizeIpqcWorkshop(row?.["产品工坊"] || row?.["工坊"]);
  const leader = clean(row?.["机长"]);
  const manager = (leader && maps.leaderMap.get(site + "::" + leader)) || maps.workshopManagers.get(site + "::" + workshop) || clean(row?.["交付经理"]) || "未配置交付经理";
  const bad = badOf(row);
  return { site, source, cellName: site + source, workshop, leader, manager, qty: qtyOf(row), bad, defect: bad ? defectOf(row) : "" };
};

export const buildIpqcAssemblySplit = (files, period) => {
  const end = auditDate(period?.end2026);
  const trendYear = end ? end.getUTCFullYear() : 0;
  const endMonth = end ? end.getUTCMonth() + 1 : 0;
  const currentWindow = monthWindow(period?.start2026, period?.end2026);
  const previous = previousMonthWindow(period);
  const maps = mappingOf(files);
  const current = blankBag();
  const previousCells = blankCells();
  const monthBags = Array.from({ length: endMonth }, () => blankBag());
  (files || []).filter((file) => file.module === "IPQC" && file.kind !== "IPQC_LEADER_MAP").forEach((file) => {
    (file.rows || []).forEach((row) => {
      const date = rowDate(row);
      if (!date) return;
      const point = pointFromRow(file, row, maps);
      if (!point.qty && !point.bad) return;
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      if (year === trendYear && month >= 1 && month <= endMonth) addPoint(monthBags[month - 1], point);
      if (inWindow(date, currentWindow)) addPoint(current, point);
      if (inWindow(date, previous)) addCellOnly(previousCells, point);
    });
  });
  const scope = finishScope(current);
  const cells = scope.cells.map((cell) => ({
    ...cell,
    previousInspected: previousCells[cell.name]?.inspected || 0,
    previousBad: previousCells[cell.name]?.bad || 0,
    previousRate: densityOf(previousCells[cell.name]?.bad || 0, previousCells[cell.name]?.inspected || 0),
  }));
  const monthFacts = monthBags.map((bag, index) => ({ month: monthLabel(index + 1), key: trendYear + "-" + String(index + 1).padStart(2, "0"), ...serialFact(bag) }));
  const cellMonthly = monthlyFromFacts(monthFacts);
  const monthly = companyMonthly(cellMonthly);
  const totals = cells.reduce((sum, cell) => ({ inspected: sum.inspected + cell.inspected, bad: sum.bad + cell.bad }), { inspected: 0, bad: 0 });
  return {
    rule: "异常密度=异常数/送检数。产品工坊去掉空格后含“外包”的是外包，其余是自制。文件名或产品工坊含杭州归杭州，含深圳归深圳，都没有时归深圳。3D问题、研发问题、设计问题、资料问题、来料问题、仓库发料问题不计入异常，送检数仍计入。趋势从当年1月到所选截止日期。某月送检为0时密度留空，不用0去比。交付经理按映射表把名下工坊合成一笔。只点同一格里密度高于其他交付经理、且同一缺陷至少重复2次的人；这一格只有他时，缺陷重复就点他。同一缺陷出现在该交付经理两名及以上机长身上，由交付经理关；只出现在一名机长身上，由该机长关。",
    period: { start: period?.start2026 || "", end: period?.end2026 || "" },
    previousPeriod: previous?.label || "",
    trendYear,
    cells,
    managers: scope.managers,
    focus: scope.focus,
    monthly,
    cellMonthly,
    monthFacts,
    totals: { ...totals, rate: densityOf(totals.bad, totals.inspected) },
  };
};

export const ipqcSnapshotReady = (snapshot) => {
  const cells = snapshot?.data?.ipqcSplit?.cellMonthly;
  return Array.isArray(cells) && cells.some((cell) => (cell.rows || []).some((row) => number(row.inspected) > 0));
};

export const pickIpqcAnalysisSnapshot = (history = [], period = {}) => {
  const start = period.start2026 || "";
  const end = period.end2026 || "";
  const ready = (history || []).filter((entry) => entry?.active !== false && entry?.module === "IPQC" && ipqcSnapshotReady(entry.snapshot));
  if (!start || !end || !ready.length) return null;
  const span = (entry) => Date.parse(entry.dateRange?.end2026 + "T00:00:00Z") - Date.parse(entry.dateRange?.start2026 + "T00:00:00Z");
  const exact = ready.filter((entry) => entry.dateRange?.start2026 === start && entry.dateRange?.end2026 === end).sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
  if (exact[0]) return { ...exact[0], matchLevel: "exact-2026" };
  const covering = ready.filter((entry) => entry.dateRange?.start2026 && entry.dateRange?.end2026 && entry.dateRange.start2026 <= start && entry.dateRange.end2026 >= end).sort((a, b) => span(a) - span(b) || String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
  if (!covering[0]) return null;
  return { ...covering[0], matchLevel: "coverage", selectedWindow: { start, end }, coverage: { start: covering[0].dateRange.start2026, end: covering[0].dateRange.end2026 } };
};

const densityMetric = (current, bad, inspected) => {
  const value = densityOf(bad, inspected);
  return current && typeof current === "object" ? { ...current, value, unit: current.unit || "%" } : value;
};

export const sliceIpqcSnapshotToWindow = (snapshot, window = {}, sourcePeriod = null) => {
  if (!snapshot || snapshot.module !== "IPQC") return snapshot;
  const start = window.start || "";
  const end = window.end || "";
  if (!start || !end) return snapshot;
  const ownStart = sourcePeriod?.start2026 || snapshot.period?.start2026 || "";
  const ownEnd = sourcePeriod?.end2026 || snapshot.period?.end2026 || "";
  if (ownStart === start && ownEnd === end) return snapshot;
  const split = snapshot.data?.ipqcSplit;
  const facts = split?.monthFacts || [];
  if (!facts.length) return snapshot;
  const year = start.slice(0, 4);
  const endMonth = Number(end.slice(5, 7)) || 12;
  const inSelected = (label) => {
    const bounds = monthBounds(year, label);
    return Boolean(bounds && overlaps(bounds.start, bounds.end, start, end));
  };
  const throughEnd = (label) => {
    const bounds = monthBounds(year, label);
    return Boolean(bounds && bounds.month <= endMonth);
  };
  const chartFacts = facts.filter((fact) => throughEnd(fact.month));
  const windowFacts = facts.filter((fact) => inSelected(fact.month));
  const scope = finishScope(mergeBags(windowFacts));
  const previousKey = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const previousFact = facts.find((fact) => fact.key === previousKey);
  const previousBag = previousFact ? bagFromFact(previousFact) : null;
  const cells = scope.cells.map((cell) => ({
    ...cell,
    previousInspected: previousBag?.cells?.[cell.name]?.inspected || 0,
    previousBad: previousBag?.cells?.[cell.name]?.bad || 0,
    previousRate: densityOf(previousBag?.cells?.[cell.name]?.bad || 0, previousBag?.cells?.[cell.name]?.inspected || 0),
  }));
  const cellMonthly = monthlyFromFacts(chartFacts);
  const monthly = companyMonthly(cellMonthly);
  const totals = cells.reduce((sum, cell) => ({ inspected: sum.inspected + cell.inspected, bad: sum.bad + cell.bad }), { inspected: 0, bad: 0 });
  const metrics = { ...(snapshot.data?.metrics || {}) };
  if ("inspectedQuantity2026" in metrics) metrics.inspectedQuantity2026 = totals.inspected;
  if ("issueCount2026" in metrics) metrics.issueCount2026 = totals.bad;
  if ("issueDensity2026" in metrics) metrics.issueDensity2026 = densityMetric(metrics.issueDensity2026, totals.bad, totals.inspected);
  const trends = monthly.map((row) => ({ month: row.month, y2026Qty: row.inspected, y2026Bad: row.bad, y2026Rate: row.rate || 0 }));
  return {
    ...snapshot,
    period: { ...(snapshot.period || {}), start2026: start, end2026: end },
    selectedWindow: { start, end },
    windowResolution: "month",
    data: {
      ...snapshot.data,
      metrics,
      periodTrend: { year: Number(year) || split.trendYear || 0, start: year + "-01-01", end, rows: monthly.map((row) => ({ label: row.month, bad: row.bad, total: row.inspected, rate: row.rate || 0 })) },
      evidence: { ...(snapshot.data?.evidence || {}), trends },
      ipqcSplit: { ...split, period: { start, end }, previousPeriod: previousFact?.key || "", cells, managers: scope.managers, focus: scope.focus, cellMonthly, monthly, totals: { ...totals, rate: densityOf(totals.bad, totals.inspected) } },
    },
  };
};
