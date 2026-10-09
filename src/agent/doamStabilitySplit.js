import { canonicalProductDept } from "../orgMappingParse.js";

const DIVISIONS = ["半导体&北美", "产品五部", "FPC事业部"];
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
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
  if (/FPC|FCP|事业/i.test(stripped)) return "FPC事业部";
  if (/半|导|北美|传感|载版|载板/.test(stripped)) return "半导体&北美";
  return "";
};
const personName = (value) => {
  const name = clean(value) || "未填写";
  return name.includes("\uFFFD") ? "未填写" : name;
};
const average = (alarms, shifts) => shifts ? Number((alarms / shifts).toFixed(2)) : null;

export const buildDoamStabilitySplit = (dataset = {}, period = {}) => {
  const units = Array.isArray(dataset?.units) ? dataset.units : [];
  if (!units.length) return null;
  const end = clean(period.end2026);
  const start = clean(period.start2026);
  const trendYear = Number(end.slice(0, 4)) || Number(start.slice(0, 4)) || 2026;
  const endMonth = Number(end.slice(5, 7)) || 12;
  const monthly = [];
  for (let month = 1; month <= endMonth; month += 1) {
    const rows = units.filter((row) => number(row.y) === trendYear && number(row.o) === month);
    const shifts = rows.length;
    const alarms = rows.reduce((sum, row) => sum + number(row.a), 0);
    if (!shifts && !alarms) continue;
    monthly.push({ month: String(month).padStart(2, "0"), alarms: Number(alarms.toFixed(0)), shifts, average: average(alarms, shifts) });
  }
  const inWindow = (row) => {
    if (number(row.y) !== trendYear) return false;
    const date = clean(row.d);
    if (start && date && date < start) return false;
    if (end && date && date > end) return false;
    return true;
  };
  const windowRows = units.filter(inWindow);
  const alarms = windowRows.reduce((sum, row) => sum + number(row.a), 0);
  const shifts = windowRows.length;
  const group = (field, divisionField = false) => {
    const map = new Map();
    windowRows.forEach((row) => {
      const name = divisionField ? (repairDivision(row[field]) || "未归类") : personName(row[field]);
      const current = map.get(name) || { name, alarms: 0, shifts: 0 };
      current.alarms += number(row.a);
      current.shifts += 1;
      map.set(name, current);
    });
    return [...map.values()].map((item) => ({ ...item, alarms: Number(item.alarms.toFixed(0)), average: average(item.alarms, item.shifts) }))
      .filter((item) => item.shifts > 0)
      .sort((left, right) => (right.average || 0) - (left.average || 0) || right.alarms - left.alarms || left.name.localeCompare(right.name, "zh-CN"));
  };
  const tpmDivision = new Map();
  windowRows.forEach((row) => {
    const name = personName(row.t);
    const division = repairDivision(row.p);
    if (!name || name === "未填写" || !division) return;
    tpmDivision.set(name, division);
  });
  const tpms = group("t").filter((item) => item.name !== "未填写").slice(0, 15).map((item) => ({ ...item, division: tpmDivision.get(item.name) || "" }));
  const categories = (() => {
    const map = new Map();
    (dataset.categories || []).forEach((row) => {
      if (number(row.y) !== trendYear) return;
      const dates = (row.ds || []).map((item) => clean(item)).filter(Boolean);
      const inside = dates.filter((item) => item.slice(0, 4) === String(trendYear) && (!start || item >= start) && (!end || item <= end));
      const share = dates.length ? inside.length / dates.length : 1;
      if (dates.length && !inside.length) return;
      const name = clean(row.c) || "其他";
      map.set(name, (map.get(name) || 0) + number(row.a) * share);
    });
    return [...map.entries()].map(([name, count]) => ({ name, count: Number(count.toFixed(0)) })).filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN"));
  })();
  const currentMonth = monthly.filter((item) => item.month === String(endMonth).padStart(2, "0"))[0] || monthly.at(-1) || null;
  const previousMonth = currentMonth ? monthly[monthly.indexOf(currentMonth) - 1] || null : null;
  return {
    rule: "DOAM按月上传。月度趋势从当年1月画到所选截止月，没有告警也没有班次的月份不画。本期告警、班次和次/班次只统计所选起止日期。告警次数不是客户不良。分类名不是已验证失效。",
    trendYear,
    endMonth,
    monthly,
    currentMonth,
    previousMonth,
    totals: { alarms: Number(alarms.toFixed(0)), shifts, average: average(alarms, shifts) },
    divisions: group("p", true).filter((item) => item.name !== "未归类" || item.alarms > 0),
    tpms,
    customers: group("k").filter((item) => item.name !== "未填写").slice(0, 8),
    categories,
  };
};
