export const QUALITY_ROLE_SNAPSHOT_REGISTRY_KEY = "quality-agent-role-snapshot-registry";
import { isIpqcExcludedBadType, normalizeIpqcLeaderMapRows } from "../dataEngine.js";
import { canonicalProductDept } from "../orgMappingParse.js";
export const QUALITY_ROLE_SNAPSHOT_SCHEMA = "quality-agent-role-snapshot-v1";
// 8 roles x range/month/week periods exceed the old 240-entry global limit.
// Keep one complete annual set plus revisions; maintenance still archives
// superseded entries within each role/period group.
const ROLE_SNAPSHOT_HISTORY_LIMIT = 480;

const nowIso = () => new Date().toISOString();
const text = (value) => String(value ?? "").trim();
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const isPlaceholderPerson = (value) => /^(其他|其它|待配置|待定|未配置|未填写|无|\/|-|—)$/.test(text(value));
const RD_ENGINEER_FIELDS = ["研发工程师", "工程师", "RD工程师", "工程师姓名", "责任人/处理人", "责任人\\处理人", "责任人", "申请人", "创建人", "__engineer"];
const rdPerson = (value) => {
  const candidate = text(value).normalize("NFKC").replace(/[（(][^)）]*[）)]/g, "").replace(/[\s\u00a0]/g, "").replace(/(?:等人|等)$/u, "");
  return /^[\u4e00-\u9fff·]{2,6}$/u.test(candidate) ? candidate : "";
};
const dateKey = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // SheetJS can expose China-midnight cells as 15:59:xx UTC on the prior
    // day. Apply the same business-date correction used by dataEngine.
    const normalized = [15, 16].includes(value.getUTCHours())
      ? new Date(value.getTime() + 8 * 60 * 60 * 1000 + 60 * 1000)
      : value;
    return normalized.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && value > 20000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  const raw = text(value);
  const m = raw.match(/(20\d{2})[年\-/](\d{1,2})[月\-/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const normalizePeriod = (period = {}) => ({
  start: text(period.start),
  end: text(period.end),
  granularity: text(period.granularity || "range") || "range",
  periodKey: text(period.periodKey || "range") || "range",
});
const samePeriod = (left = {}, right = {}, strict = false) => {
  const a = normalizePeriod(left);
  const b = normalizePeriod(right);
  return a.start === b.start && a.end === b.end && (!strict || (a.granularity === b.granularity && a.periodKey === b.periodKey));
};
const rowDate = (row) => row?.日期 || row?.检验日期 || row?.送检日期 || row?.发生日期 || row?.问题日期 || row?.创建时间 || row?.需求日期 || row?.申请日期 || row?.更新日期 || row?.更新时间 || row?.时间 || "";
const inPeriod = (row, period = {}) => { const d = dateKey(rowDate(row)); return !d || (!period.start || d >= period.start) && (!period.end || d <= period.end); };
export const selectedPeriodOf = (period = {}) => ({
  start: text(period._periodStart || period.selectedStart || period.start || period.start2026),
  end: text(period._periodEnd || period.selectedEnd || period.end || period.end2026),
});
export const yearToEndPeriodOf = (period = {}) => {
  const selected = selectedPeriodOf(period);
  const year = (selected.end || selected.start || String(new Date().getFullYear())).slice(0, 4);
  return { start: `${year}-01-01`, end: selected.end };
};
export const snapshotMatchesPeriod = (entry = {}, period = {}) => {
  const left = entry.period || entry;
  const needed = selectedPeriodOf(period);
  return text(left.start) === needed.start && text(left.end) === needed.end;
};
const lastDayOfMonth = (label) => {
  const year = Number(String(label).slice(0, 4));
  const month = Number(String(label).slice(5, 7));
  if (!year || !month) return "";
  return `${String(label).slice(0, 7)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
};
const isoWeekBounds = (label) => {
  const match = String(label || "").match(/^(\d{4})-W(\d{2})$/i);
  if (!match) return { from: "", to: "" };
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (day - 1) + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
};
export const highlightPeriodOf = (period = {}) => ({
  start: text(period._periodStart || period.selectedStart || period.start || ""),
  end: text(period._periodEnd || period.selectedEnd || period.end || ""),
});
export const trendBucketSelected = (label, granularity, period = {}) => {
  const { start, end } = highlightPeriodOf(period);
  if (!start || !end) return false;
  const textLabel = text(label);
  if (granularity === "month" || /^\d{4}-\d{2}$/.test(textLabel)) {
    const monthStart = `${textLabel}-01`;
    const monthEnd = lastDayOfMonth(textLabel);
    return Boolean(monthEnd) && monthStart <= end && monthEnd >= start;
  }
  const bounds = isoWeekBounds(textLabel);
  return Boolean(bounds.from) && bounds.from <= end && bounds.to >= start;
};
export const applySelectedWindowToTrend = (trend, period = {}) => {
  if (!trend) return trend;
  const granularity = trend.granularity || (String(trend.rows?.[0]?.label || "").includes("-W") ? "week" : "month");
  const rows = Array.isArray(trend.rows) ? trend.rows.map((row) => ({
    ...row,
    selected: trendBucketSelected(row.label, granularity, period),
  })) : [];
  return { ...trend, granularity, rows };
};
const examplesInSelectedWindow = (examples = [], period = {}) => {
  const { start, end } = selectedPeriodOf(period);
  return (Array.isArray(examples) ? examples : []).filter((item) => {
    const key = text(item?.date);
    return !key || ((!start || key >= start) && (!end || key <= end));
  });
};
export const selectedWindowTotalsFromTrend = (trend, period = {}) => {
  const marked = applySelectedWindowToTrend(trend, period);
  const rows = (marked?.rows || []).filter((row) => row.selected);
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const bad = rows.reduce((sum, row) => sum + Number(row.bad ?? row.count ?? 0), 0);
  return { total, bad, good: Math.max(0, total - bad), badRate: total ? Number((bad / total * 100).toFixed(2)) : 0 };
};
export const rankPeopleInSelectedWindow = (people = [], period = {}, selectedRecipient = "") => {
  const rows = (Array.isArray(people) ? people : []).map((item) => {
    const snapshot = item?.snapshot || item || {};
    const name = text(item?.recipient || snapshot.recipient);
    if (!name) return null;
    const sliced = selectedWindowTotalsFromTrend(snapshot.trend?.month, period);
    const bad = sliced ? Number(sliced.bad || 0) : Number(snapshot.metrics?.bad || 0);
    const inspected = sliced ? Number(sliced.total || 0) : Number(snapshot.metrics?.total || 0);
    return { name, value: bad, inspected, detail: `管理工坊异常 ${bad} 项` };
  }).filter(Boolean);
  const sorted = rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "zh-CN"));
  const selected = sorted.find((row) => row.name === selectedRecipient);
  const limited = sorted.slice(0, 12);
  if (selected && !limited.some((row) => row.name === selected.name)) limited.push(selected);
  return limited.map((row) => ({ ...row, rank: sorted.findIndex((item) => item.name === row.name) + 1, total: sorted.length, selected: row.name === selectedRecipient }));
};
const categoriesFromExamples = (examples = []) => {
  const map = new Map();
  (Array.isArray(examples) ? examples : []).forEach((item) => {
    const name = text(item?.category) || "未分类";
    map.set(name, (map.get(name) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
};
const exampleMemberName = (item = {}, role = "") => {
  if (role === "机长" || role === "组装人员") return text(item.inspector);
  if (role === "供应链经理") return text(item.manager);
  return text(item.leader);
};
const teamMembersFromExamples = (examples = [], role = "") => {
  const map = new Map();
  (Array.isArray(examples) ? examples : []).forEach((item) => {
    const name = exampleMemberName(item, role);
    if (!name) return;
    const current = map.get(name) || { name, total: 0, bad: 0 };
    current.bad += 1;
    current.total += 1;
    map.set(name, current);
  });
  return [...map.values()]
    .map((item) => ({ ...item, good: Math.max(0, item.total - item.bad), badRate: item.total ? Number((item.bad / item.total * 100).toFixed(2)) : 0 }))
    .sort((a, b) => b.bad - a.bad || a.name.localeCompare(b.name, "zh-CN"));
};
export const overlaySelectedWindowOnSnapshot = (snapshot, period = {}) => {
  if (!snapshot) return snapshot;
  const month = applySelectedWindowToTrend(snapshot.trend?.month || (Array.isArray(snapshot.trend) ? { granularity: "month", rows: snapshot.trend } : null), period);
  const week = applySelectedWindowToTrend(snapshot.trend?.week, period);
  const exact = snapshotMatchesPeriod(snapshot, period);
  const sliced = selectedWindowTotalsFromTrend(month, period);
  const windowExamples = exact ? snapshot.examples : examplesInSelectedWindow(snapshot.examples, period);
  const windowCategories = exact ? snapshot.categories : categoriesFromExamples(windowExamples);
  const exampleTeam = exact ? [] : teamMembersFromExamples(windowExamples, snapshot.role);
  const windowTeam = exact ? snapshot.teamMembers : (exampleTeam.some((item) => Number(item.bad || 0) > 0) ? exampleTeam : snapshot.teamMembers);
  const rdIssues = snapshot.rdQualityIssues ? {
    ...snapshot.rdQualityIssues,
    periodTrend: {
      month: applySelectedWindowToTrend(snapshot.rdQualityIssues.periodTrend?.month, period),
      week: applySelectedWindowToTrend(snapshot.rdQualityIssues.periodTrend?.week, period),
    },
    examples: exact ? snapshot.rdQualityIssues.examples : examplesInSelectedWindow(snapshot.rdQualityIssues.examples, period),
  } : snapshot.rdQualityIssues;
  return {
    ...snapshot,
    coveringWindow: !exact,
    selectedWindow: selectedPeriodOf(period),
    trend: { month, week },
    metrics: sliced ? { ...snapshot.metrics, ...sliced } : snapshot.metrics,
    categories: windowCategories,
    examples: windowExamples,
    teamMembers: windowTeam,
    siteStats: exact ? snapshot.siteStats : [],
    captainTop: exact ? snapshot.captainTop : [],
    rdQualityIssues: rdIssues,
  };
};

const issue = (row) => row?.__roleActivity === true || isIpqcExcludedBadType(row) ? 0 : (text(row?.不良内容) || text(row?.不良类型) || text(row?.问题类型) || text(row?.问题描述) ? 1 : 0);
const rowNames = (row, fields) => fields.flatMap((field) => text(row?.[field]).split(/[、,，;；/\\|]/).map(text)).filter(Boolean);
const ipqcSiteFromFileName = (name = "") => (/杭州/.test(String(name || "")) ? "杭州" : /深圳/.test(String(name || "")) ? "深圳" : "");
const sourceRows = (files, modules) => files.filter((file) => modules.includes(file.module) && file.kind !== "IPQC_LEADER_MAP" && file.subKind !== "IPQC_LEADER_MAP").flatMap((file) => {
  const site = file.module === "IPQC" ? (ipqcSiteFromFileName(`${file.name || ""} ${file.fileName || ""}`) || "深圳") : "";
  return (file.rows || []).map((row) => (row.__ipqcSite || !site ? row : { ...row, __ipqcSite: site, __sourceFile: file.name || file.fileName || "" }));
});
export const TEAM_MEMBER_SPEC = {
  机长: { fields: ["送检人"], label: "组装人员", sectionId: "组内成员", chartTitle: "组内成员不良记录" },
  交付经理: { fields: ["机长", "组长", "班组长"], label: "机长", sectionId: "下属机长", chartTitle: "下属机长不良记录" },
  供应链经理: { fields: ["交付经理", "供应商经理"], label: "交付经理", sectionId: "下属交付经理", chartTitle: "下属交付经理不良记录" },
};
export const siteFromValue = (value = "") => {
  const raw = text(value);
  if (/深圳/.test(raw)) return "深圳";
  if (/杭州/.test(raw)) return "杭州";
  return "";
};
export const siteFromRow = (row = {}) => siteFromValue(row.__ipqcSite || row.__reportSite || row.site || row["厂区"] || row["基地"] || row["区域"] || row["地点"] || row["车间"]);
export const siteStatsFromRows = (rows = []) => {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const site = siteFromRow(row);
    if (!site) return;
    const current = map.get(site) || { name: site, total: 0, bad: 0 };
    current.total += 1;
    current.bad += issue(row);
    map.set(site, current);
  });
  const ordered = ["深圳", "杭州"].map((name) => map.get(name)).filter(Boolean);
  const extra = [...map.values()].filter((item) => item.name !== "深圳" && item.name !== "杭州");
  return [...ordered, ...extra]
    .map((item) => ({ ...item, good: Math.max(0, item.total - item.bad), badRate: item.total ? Number((item.bad / item.total * 100).toFixed(2)) : 0 }))
    .filter((item) => Number(item.total || 0) > 0 || Number(item.bad || 0) > 0);
};
export const supplyChainTeamFromRows = (rows = [], mappings = []) => {
  const leaderToManager = new Map();
  (Array.isArray(mappings) ? mappings : []).forEach((row) => {
    const leader = text(row.leader || row.机长);
    const manager = text(row.manager || row.交付经理);
    if (leader && manager) leaderToManager.set(leader, manager);
  });
  const stats = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const mapped = rowNames(row, ["机长", "组长", "班组长"]).map((leader) => leaderToManager.get(leader)).filter(Boolean);
    const names = [...new Set(mapped.length ? mapped : [text(row["交付经理"] || row["供应商经理"])].filter(Boolean))];
    if (!names.length) return;
    const bad = issue(row);
    names.forEach((name) => {
      const current = stats.get(name) || { name, total: 0, bad: 0 };
      current.total += 1;
      current.bad += bad;
      stats.set(name, current);
    });
  });
  return [...stats.values()]
    .map((item) => ({ ...item, good: Math.max(0, item.total - item.bad), badRate: item.total ? Number((item.bad / item.total * 100).toFixed(2)) : 0 }))
    .sort((a, b) => b.bad - a.bad || a.name.localeCompare(b.name, "zh-CN"));
};
export const captainTopFromRows = (rows = [], mappings = [], limit = 8) => {
  const mapRows = Array.isArray(mappings) ? mappings : [];
  return teamMemberStats(rows, ["机长", "组长", "班组长"])
    .filter((item) => Number(item.bad || 0) > 0)
    .slice(0, limit)
    .map((item) => {
      const mapped = mapRows.find((row) => text(row.leader || row.机长) === item.name) || {};
      const sample = (Array.isArray(rows) ? rows : []).find((row) => rowNames(row, ["机长", "组长", "班组长"]).includes(item.name));
      return {
        ...item,
        site: siteFromValue(mapped.site) || siteFromRow(sample) || "",
        manager: text(mapped.manager || mapped.交付经理 || sample?.["交付经理"] || ""),
      };
    });
};
export const teamMemberSpecForRole = (role) => TEAM_MEMBER_SPEC[role] || null;
export const resolveSupplyMappings = (configMappings = [], files = []) => {
  const fromConfig = (Array.isArray(configMappings) ? configMappings : []).filter((row) => row && row.active !== false && (row.leader || row.机长) && (row.manager || row.交付经理));
  if (fromConfig.length) return fromConfig;
  const fileRows = (Array.isArray(files) ? files : [])
    .filter((file) => file?.kind === "IPQC_LEADER_MAP" || file?.subKind === "IPQC_LEADER_MAP" || /工坊交付经理机长映射表/.test(`${file?.name || ""} ${file?.fileName || ""}`))
    .flatMap((file) => file.rows || []);
  return normalizeIpqcLeaderMapRows(fileRows).map((row) => ({
    site: row.site, workshop: row.workshop, manager: row.manager, leader: row.leader,
    交付经理: row.manager, 机长: row.leader, active: true,
  }));
};
export const mappedLeaderNames = (role, recipient, mappings = []) => {
  const rows = (Array.isArray(mappings) ? mappings : []).filter((row) => row && row.active !== false);
  if (role === "交付经理") return new Set(rows.filter((row) => [row.manager, row.交付经理].filter(Boolean).includes(recipient)).map((row) => text(row.leader || row.机长)).filter(Boolean));
  if (role === "供应链经理") return new Set(rows.filter((row) => [row.supplierManager, row.供应链经理, row.供应商经理].filter(Boolean).includes(recipient)).map((row) => text(row.manager || row.交付经理)).filter(Boolean));
  return new Set();
};
export const filterTeamMembersByMapping = (role, recipient, members = [], mappings = []) => {
  const allowed = mappedLeaderNames(role, recipient, mappings);
  if (!allowed.size) return members;
  const stats = new Map((Array.isArray(members) ? members : []).map((item) => [text(item.name), item]));
  const resolved = [...allowed].map((name) => stats.get(name) || { name, total: 0, bad: 0, good: 0, badRate: 0 })
    .sort((a, b) => b.bad - a.bad || b.total - a.total || a.name.localeCompare(b.name, "zh-CN"));
  if (!resolved.some((item) => Number(item.total || 0) > 0 || Number(item.bad || 0) > 0)) {
    return (Array.isArray(members) ? members : []).filter((item) => allowed.has(text(item.name)));
  }
  return resolved;
};
export const applyMappedTeamMembersToVisualSpec = (visualSpec, role, recipient, mappings = [], members = []) => {
  if (!visualSpec?.figures) return visualSpec;
  const spec = teamMemberSpecForRole(role);
  const allowed = mappedLeaderNames(role, recipient, mappings);
  if (!spec || !allowed.size) return visualSpec;
  return {
    ...visualSpec,
    figures: visualSpec.figures.map((figure) => {
      if (figure.id !== "leader-team-members" && figure.sectionId !== spec.sectionId) return figure;
      const categories = Array.isArray(figure.categories) ? figure.categories : [];
      const rateLike = (item) => item?.unit === "%" || /率|占比/.test(String(item?.name || ""));
      const oldBad = Array.isArray(figure.series?.[0]?.values) ? figure.series[0].values : [];
      const totalSeries = figure.series?.find((item, index) => index > 0 && !rateLike(item));
      const rateSeries = figure.series?.find((item) => rateLike(item));
      const oldTotal = Array.isArray(totalSeries?.values) ? totalSeries.values : [];
      const oldRate = Array.isArray(rateSeries?.values) ? rateSeries.values : [];
      const byMember = new Map(categories.map((item, index) => {
        const name = text(typeof item === "string" ? item : item?.name);
        const total = Number(oldTotal[index] || 0);
        const bad = Number(oldBad[index] || 0);
        return [name, { name, total, bad, badRate: Number(oldRate[index] || (total ? Number((bad / total * 100).toFixed(2)) : 0)) }];
      }));
      (Array.isArray(members) ? members : []).forEach((item) => byMember.set(text(item.name), item));
      const names = [...allowed];
      const resolved = names.map((name) => {
        const item = byMember.get(name) || { name, total: 0, bad: 0, badRate: 0 };
        const total = Number(item.total || 0);
        const bad = Number(item.bad || 0);
        return { name, total, bad, badRate: Number(item.badRate || (total ? Number((bad / total * 100).toFixed(2)) : 0)) };
      });
      if (resolved.every((item) => item.bad === 0 && item.total === 0) && !(Array.isArray(members) && members.some((item) => Number(item.bad || item.total || 0) > 0))) {
        return null;
      }
      return {
        ...figure,
        intent: "comparison",
        preferredChart: "combo-bar-line",
        categories: names,
        series: [
          { name: "不良数量", values: resolved.map((item) => item.bad), axis: "left" },
          { name: "送检数量", values: resolved.map((item) => item.total), axis: "left" },
          { name: "不良率", values: resolved.map((item) => item.badRate), axis: "right", unit: "%" },
        ],
      };
    }).filter(Boolean),
  };
};
export const filterTeamTableInMarkdown = (markdown, role, recipient, mappings = []) => {
  const spec = teamMemberSpecForRole(role);
  const allowed = mappedLeaderNames(role, recipient, mappings);
  if (!spec || !allowed.size) return markdown;
  const lines = String(markdown || "").split(/\r?\n/);
  let inSection = false;
  return lines.filter((line) => {
    if (/^##\s+/.test(line)) {
      inSection = line.replace(/^##\s+/, "").includes(spec.sectionId);
      return true;
    }
    if (!inSection || !/^\s*\|/.test(line)) return true;
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    if (!cells[0] || cells[0] === spec.label || /^-{3,}/.test(cells.join("").replace(/\|/g, ""))) return true;
    return allowed.has(cells[0]);
  }).join("\n");
};
export const trendHasCounts = (trend) => Array.isArray(trend?.rows) && trend.rows.some((row) => Number(row.bad ?? row.count ?? 0) > 0 || Number(row.total ?? 0) > 0);
export const pickNonEmptyTrend = (live, snapshot) => (trendHasCounts(live) ? live : (trendHasCounts(snapshot) ? snapshot : live || snapshot || null));
export const teamMemberStats = (rows = [], fields = ["送检人"]) => {
  const map = new Map();
  rows.forEach((row) => {
    const names = rowNames(row, fields);
    if (!names.length) return;
    names.forEach((name) => {
      const current = map.get(name) || { name, total: 0, bad: 0 };
      current.total += 1;
      current.bad += issue(row);
      map.set(name, current);
    });
  });
  return [...map.values()]
    .map((item) => ({ ...item, good: Math.max(0, item.total - item.bad), badRate: item.total ? Number((item.bad / item.total * 100).toFixed(2)) : 0 }))
    .sort((a, b) => b.bad - a.bad || b.total - a.total || a.name.localeCompare(b.name, "zh-CN"));
};
const metric = (rows) => ({ total: rows.length, bad: rows.reduce((sum, row) => sum + issue(row), 0), good: rows.reduce((sum, row) => sum + (issue(row) ? 0 : 1), 0) });
const categoryStats = (rows, issuesOnly = false) => {
  const source = issuesOnly ? rows.filter((row) => issue(row)) : rows;
  const map = new Map();
  source.forEach((row) => { const key = text(row?.不良类型 || row?.问题类型 || row?.问题分类 || row?.类别 || row?.阶段) || "未分类"; map.set(key, (map.get(key) || 0) + 1); });
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
};
const rdRowNames = (row) => rowNames(row, RD_ENGINEER_FIELDS).map(rdPerson).filter(Boolean);
const rdIssueRows = (files, recipient, period) => sourceRows(files, ["DQA"])
    .filter((row) => inPeriod(row, period))
    .filter((row) => text(row?.问题描述))
    .filter((row) => rdRowNames(row).includes(recipient));
const isoWeekKey = (value) => {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return `${date.getUTCFullYear()}-W${String(Math.ceil((((date - yearStart) / 86400000) + 1) / 7)).padStart(2, "0")}`;
};
export const isEmptyWeekChartRow = (row = {}) => {
  const numerator = Number(row.bad ?? row.count ?? 0) || 0;
  const denominator = Number(row.total ?? 0) || 0;
  return numerator === 0 && denominator === 0;
};
export const keepActiveWeekChartRows = (rows = []) => (Array.isArray(rows) ? rows : []).filter((row) => !isEmptyWeekChartRow(row));
const rdIssuePeriodTrend = (rows, period, granularity) => {
  const end = text(period?.end || period?._periodEnd);
  const year = (end || text(period?.start || period?._periodStart) || String(new Date().getFullYear())).slice(0, 4);
  const start = `${year}-01-01`;
  if (!end || end < start) return null;
  const groups = new Map();
  for (let cursor = new Date(`${start}T00:00:00Z`), to = new Date(`${end}T00:00:00Z`); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    const label = granularity === "month" ? date.slice(0, 7) : isoWeekKey(date);
    if (!label) continue;
    const item = groups.get(label) || { label, count: 0, selected: false };
    if (trendBucketSelected(label, granularity, period)) item.selected = true;
    groups.set(label, item);
  }
  rows.forEach((row) => {
    const date = dateKey(rowDate(row));
    if (!date || date < start || date > end) return;
    const label = granularity === "month" ? date.slice(0, 7) : isoWeekKey(date);
    if (!label) return;
    const item = groups.get(label) || { label, count: 0, selected: trendBucketSelected(label, granularity, period) };
    item.count += 1;
    groups.set(label, item);
  });
  const result = [...groups.values()];
  return result.length >= 2 ? { granularity, rows: result } : null;
};
const issueExamples = (rows = []) => (Array.isArray(rows) ? rows : []).filter((row) => issue(row))
  .sort((left, right) => {
    const a = text(dateKey(rowDate(left)));
    const b = text(dateKey(rowDate(right)));
    if (a && b) return b.localeCompare(a);
    if (b) return 1;
    if (a) return -1;
    return 0;
  }).slice(0, 200).map((row) => ({
  date: dateKey(rowDate(row)),
  category: text(row?.不良类型 || row?.问题类型 || row?.问题分类 || row?.类别) || "未分类",
  description: text(row?.不良内容 || row?.问题描述),
  leader: text(row?.机长 || row?.组长 || row?.班组长),
  inspector: text(row?.送检人),
  manager: text(row?.交付经理 || row?.供应商经理 || row?.经理),
}));
const rdIssueEvidence = (files, recipient, period, selectedRows = null, yearRows = null) => {
  const rows = selectedRows || rdIssueRows(files, recipient, period);
  const trendRows = yearRows || rows;
  return {
    count: rows.length,
    categories: categoryStats(rows).slice(0, 10),
    productDepts: unique(rows.map((row) => canonicalProductDept(row?.产品部))),
    stages: unique(rows.map((row) => row?.阶段)),
    periodTrend: {
      month: rdIssuePeriodTrend(trendRows, period, "month"),
      week: rdIssuePeriodTrend(trendRows, period, "week"),
    },
    examples: [...rows].sort((left, right) => text(dateKey(rowDate(right))).localeCompare(text(dateKey(rowDate(left))))).slice(0, 8).map((row) => ({
      date: dateKey(rowDate(row)),
      category: text(row?.问题分类 || row?.类别 || row?.问题类型) || "未分类",
      description: text(row?.问题描述),
    })),
  };
};
export const periodTrendFromRows = (rows, period, granularity) => {
  const end = text(period?.end || period?._periodEnd);
  const year = (end || text(period?.start || period?._periodStart) || String(new Date().getFullYear())).slice(0, 4);
  const start = `${year}-01-01`;
  if (!end || end < start) return null;
  const groups = new Map();
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null;
  if (granularity === "month") {
    for (let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); cursor <= to; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
      const label = cursor.toISOString().slice(0, 7);
      groups.set(label, { label, bad: 0, total: 0, selected: trendBucketSelected(label, "month", period) });
    }
  } else {
    for (let cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      const label = isoWeekKey(date);
      if (!label) continue;
      const item = groups.get(label) || { label, bad: 0, total: 0, selected: false };
      if (trendBucketSelected(label, "week", period)) item.selected = true;
      groups.set(label, item);
    }
  }
  rows.forEach((row) => {
    const d = dateKey(rowDate(row));
    if (!d || d < start || d > end) return;
    const label = granularity === "month" ? d.slice(0, 7) : isoWeekKey(d);
    if (!label) return;
    const item = groups.get(label) || { label, bad: 0, total: 0, selected: trendBucketSelected(label, granularity, period) };
    item.total += 1;
    item.bad += issue(row);
    groups.set(label, item);
  });
  const ordered = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  return ordered.length >= 2 ? { granularity, rows: ordered.map((item) => ({ ...item, rate: item.total ? Number((item.bad / item.total * 100).toFixed(2)) : 0 })) } : null;
};
const trend = (rows, period) => ({ month: periodTrendFromRows(rows, period, "month"), week: periodTrendFromRows(rows, period, "week") });
export const periodTrendFromRoleSnapshot = (snapshot = {}) => {
  const value = snapshot?.trend;
  const normalize = (item, granularity) => {
    if (!item) return null;
    if (Array.isArray(item.rows) && item.rows.length) return { granularity: item.granularity || granularity, rows: item.rows };
    if (!Array.isArray(item) || !item.length) return null;
    return { granularity, rows: item.map((row) => ({ label: row.label || row.period, bad: Number(row.bad || row.count || 0), total: Number(row.total || row.count || 0), rate: Number(row.rate || 0) })) };
  };
  if (value && (value.month || value.week)) return { month: normalize(value.month, "month"), week: normalize(value.week, "week") };
  if (Array.isArray(value) && value.length) return { month: normalize(value, "month"), week: null };
  return null;
};
export const issueCategoriesFromRoleSnapshot = (snapshot = {}) => {
  const rows = Array.isArray(snapshot.categories) ? snapshot.categories : [];
  const bad = Number(snapshot.metrics?.bad || 0);
  const sum = rows.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const filtered = bad > 0 && sum > bad * 1.05 ? rows.filter((item) => item.name !== "未分类") : rows;
  return filtered.map((item) => ({ name: item.name, count: item.count, share: bad ? Number((item.count / bad * 100).toFixed(1)) : null }));
};

export const ROLE_SNAPSHOT_TYPES = [
  { id: "assembly-person", role: "组装人员", chain: "组装人员 → 机长 → 交付经理 → 供应链经理", modules: ["IPQC"], fields: ["送检人"] },
  { id: "machine-leader", role: "机长", chain: "组装人员 → 机长 → 交付经理 → 供应链经理", modules: ["IPQC"], fields: ["机长", "组长", "班组长"], manager: true },
  { id: "delivery-manager", role: "交付经理", chain: "组装人员 → 机长 → 交付经理 → 供应链经理", modules: ["IPQC"], fields: ["交付经理", "供应商经理", "经理"], manager: true },
  { id: "supply-chain-manager", role: "供应链经理", chain: "组装人员 → 机长 → 交付经理 → 供应链经理", modules: ["IPQC"], fields: [], fixedRecipients: ["供应链经理"], manager: true },
  // Personal fixed evidence comes from DQA issue rows plus the separate
  // ECN/non-BOM/review stores. OQC/DQA/QMS Agent reports remain narrative
  // baselines on the role-report page and do not need raw-row rehydration here.
  { id: "rd-engineer", role: "研发工程师", chain: "研发工程师 → PM → TPM → 产总", modules: ["DQA"], fields: RD_ENGINEER_FIELDS },
  { id: "pm", role: "PM", chain: "研发工程师 → PM → TPM → 产总", modules: ["OQC", "DQA", "QMS"], fields: ["PM", "项目经理", "项目负责人"], manager: true },
  { id: "tpm", role: "TPM", chain: "研发工程师 → PM → TPM → 产总", modules: ["OQC", "DQA", "QMS"], fields: ["TPM"], manager: true },
  { id: "product-director", role: "产总", chain: "研发工程师 → PM → TPM → 产总", modules: ["OQC", "DQA", "QMS"], fields: ["产总", "产品总监", "产品部负责人"], manager: true },
];
export const roleSnapshotRule = (roleOrId) => ROLE_SNAPSHOT_TYPES.find((item) => item.role === roleOrId || item.id === roleOrId) || ROLE_SNAPSHOT_TYPES[0];

const roleDefaultSkill = (role) => `quality-role-${roleSnapshotRule(role).id}`;
export const DEFAULT_ROLE_CHART_SKILL_ID = "quality-role-charts-lieflat";
export const DEFAULT_ACCEPTANCE_SKILL_ID = "elon-musk-perspective";
export const isAcceptanceSkill = (item) => /^(elon-musk-perspective|quality-consultant|zeng-shiqiang-perspective|acceptance-)/i.test(String(item?.id || item?.name || "").trim());
export const isRoleChartSkill = (item) => /quality-role-charts|图表生成|lieflat-charts|role-charts/i.test(`${item?.id || ""} ${item?.name || ""} ${item?.description || ""}`);
export const chartThemeFromSkill = (item) => {
  const key = `${item?.id || ""} ${item?.name || ""}`;
  if (/quality-role-charts-default|原生组合|系统组合/i.test(key) && !/lieflat/i.test(key)) return "default";
  return "lieflat";
};
export const roleSkillMatchesRole = (item, roleOrSkillId) => {
  const key = String(item?.id || item?.name || "").trim();
  const id = String(roleOrSkillId || "").startsWith("quality-role-") ? String(roleOrSkillId) : roleDefaultSkill(roleOrSkillId);
  return Boolean(id) && (key === id || key.startsWith(`${id}-`));
};
export const createDefaultRoleSnapshotRegistry = () => ({ schemaVersion: QUALITY_ROLE_SNAPSHOT_SCHEMA, updatedAt: nowIso(), rules: ROLE_SNAPSHOT_TYPES.map((rule) => ({ id: rule.id, role: rule.role, enabled: true, defaultSkill: roleDefaultSkill(rule.role), selectedSkill: roleDefaultSkill(rule.role), layoutProfileId: "research-briefing-v1" })), history: [], maintenance: { enabled: true, retention: 3, autoArchive: true, taskHistory: [] } });
export const normalizeRoleSnapshotRegistry = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const base = createDefaultRoleSnapshotRegistry();
  const sourceRules = new Map((Array.isArray(source.rules) ? source.rules : []).map((rule) => [String(rule.id || rule.role), rule]));
  const rules = base.rules.map((rule) => {
    const saved = sourceRules.get(rule.id) || sourceRules.get(rule.role) || {};
    return { ...rule, ...saved, id: rule.id, role: rule.role, enabled: saved.enabled !== false, defaultSkill: text(saved.defaultSkill) || rule.defaultSkill, selectedSkill: text(saved.selectedSkill) || text(saved.defaultSkill) || rule.defaultSkill, layoutProfileId: text(saved.layoutProfileId) || rule.layoutProfileId };
  });
  const history = Array.isArray(source.history)
    ? source.history.filter((item) => item && item.role && (item.snapshot || Number.isFinite(Number(item.peopleCount)) || item.recipient)).map((item) => ({ ...item, batchId: text(item.batchId), peopleCount: Number(item.peopleCount ?? item.snapshot?.people?.length ?? 0), note: text(item.note) })).slice(0, ROLE_SNAPSHOT_HISTORY_LIMIT)
    : [];
  return { schemaVersion: QUALITY_ROLE_SNAPSHOT_SCHEMA, updatedAt: text(source.updatedAt) || nowIso(), rules, history, maintenance: { ...base.maintenance, ...(source.maintenance || {}), retention: Math.max(1, Math.min(20, Number(source.maintenance?.retention || base.maintenance.retention))), taskHistory: Array.isArray(source.maintenance?.taskHistory) ? source.maintenance.taskHistory.slice(0, 50) : [] } };
};
export const updateRoleSnapshotRule = (registry, ruleId, patch = {}) => {
  const current = normalizeRoleSnapshotRegistry(registry);
  return { ...current, updatedAt: nowIso(), rules: current.rules.map((rule) => rule.id === ruleId ? { ...rule, ...patch, updatedAt: nowIso() } : rule) };
};
// Agent-only ECN/nonBOM sources are separate from the legacy DQA import.  They
// still participate in the snapshot version so a newly imported detail file
// cannot accidentally reuse an older role snapshot.
export const roleSnapshotSourceSignature = (files = [], agentRaw = null) => JSON.stringify({
  files: files.map((file) => ({ module: file.module, name: file.name, importedAt: file.importedAt, rows: file.rowCount || file.rows?.length || 0 })).sort((a, b) => `${a.module}${a.name}`.localeCompare(`${b.module}${b.name}`)),
  dqaAgentRaw: (agentRaw?.files || []).map((file) => ({ sourceId: file.sourceId, name: file.name || file.sourceName, kind: file.kind, importedAt: file.importedAt, rows: file.rowCount || 0 })).sort((a, b) => `${a.kind}${a.name}`.localeCompare(`${b.kind}${b.name}`)),
});
export const roleSnapshotMappingSignature = (mappings = {}) => JSON.stringify({ supplyMappings: mappings.supplyMappings || [], orgMappings: mappings.orgMappings || [] });
export const roleSnapshotKey = ({ role, ruleId = "", period = {}, granularity = "", sourceSignature = "", mappingSignature = "", skillName = "", layoutProfileId = "" } = {}) => [role, ruleId, period.start || "", period.end || "", granularity || period.granularity || "range", period.periodKey || "", sourceSignature, mappingSignature, skillName, layoutProfileId].join("::");

export const buildRoleSnapshots = ({ role, files = [], dateRange = {}, mappings = {}, agentRaw = null } = {}) => {
  const rule = roleSnapshotRule(role);
  const selectedRange = { start: text(dateRange.start || dateRange._periodStart || dateRange.start2026), end: text(dateRange.end || dateRange._periodEnd || dateRange.end2026) };
  const yearRange = yearToEndPeriodOf(selectedRange);
  const allModuleRows = sourceRows(files, rule.modules);
  const rows = allModuleRows.filter((row) => inPeriod(row, selectedRange));
  const yearRows = allModuleRows.filter((row) => inPeriod(row, yearRange));
  const mappingRows = resolveSupplyMappings(mappings?.supplyMappings, files);
  const orgRows = Array.isArray(mappings?.orgMappings) ? mappings.orgMappings.filter((item) => item.active !== false) : [];
  const rawInPeriod = (row) => { const d = dateKey(row?.date); return Boolean(d) && (!dateRange.start || d >= dateRange.start) && (!dateRange.end || d <= dateRange.end); };
  const rawEcn = (Array.isArray(agentRaw?.ecnRecords) ? agentRaw.ecnRecords : []).filter(rawInPeriod);
  const rawNonBom = (Array.isArray(agentRaw?.nonBomRecords) ? agentRaw.nonBomRecords : []).filter(rawInPeriod);
  const rawProjects = Array.isArray(agentRaw?.projectMappings) ? agentRaw.projectMappings : [];
  const agentNames = rule.role === "研发工程师" ? unique([...rawEcn.map((row) => rdPerson(row.engineer)), ...rawNonBom.map((row) => rdPerson(row.engineer))])
    : rule.role === "PM" ? unique([...rawEcn.map((row) => rdPerson(row.pm)), ...rawProjects.map((row) => rdPerson(row.pm))])
      : rule.role === "TPM" ? unique(rawProjects.map((row) => rdPerson(row.tpm)))
        : [];
  const names = rule.fixedRecipients || (rule.role === "供应链经理"
    ? ["供应链经理"]
    : rule.role === "机长" ? unique(rows.flatMap((row) => rowNames(row, rule.fields)))
      : rule.role === "交付经理" ? unique(rows.flatMap((row) => rowNames(row, rule.fields)).concat(mappingRows.flatMap((row) => rowNames(row, ["manager", "交付经理"]))))
        : rule.role === "PM" ? unique(orgRows.flatMap((row) => rowNames(row, ["pm", "PM"]))).filter((name) => !isPlaceholderPerson(name))
          : rule.role === "TPM" ? unique(orgRows.flatMap((row) => rowNames(row, ["tpm", "TPM"]))).filter((name) => !isPlaceholderPerson(name))
            : rule.role === "产总" ? unique(orgRows.flatMap((row) => rowNames(row, ["productionDirector", "产总"]))).filter((name) => !isPlaceholderPerson(name))
              : rule.role === "研发工程师" ? unique([...rows.flatMap(rdRowNames), ...agentNames])
                : unique([...rows.flatMap((row) => rowNames(row, rule.fields)), ...agentNames]));
  const managerRowsFor = (recipient, pool = rows) => {
    if (rule.role === "供应链经理") return pool;
    if (rule.role === "机长") return pool.filter((row) => rowNames(row, ["机长", "组长", "班组长"]).includes(recipient));
    if (rule.role === "交付经理") {
      const mapped = mappingRows.filter((item) => rowNames(item, ["manager", "交付经理"]).includes(recipient));
      const leaders = new Set(mapped.flatMap((item) => rowNames(item, ["leader", "机长"])));
      const workshops = new Set(mapped.flatMap((item) => rowNames(item, ["workshop", "工坊"])));
      return pool.filter((row) => rowNames(row, ["交付经理", "供应商经理", "经理"]).includes(recipient) || rowNames(row, ["机长", "组长", "班组长"]).some((name) => leaders.has(name)) || rowNames(row, ["交付工坊", "工坊", "供应商"]).some((name) => workshops.has(name)));
    }
    if (rule.role === "PM" || rule.role === "TPM" || rule.role === "产总") {
      const mappingsFor = rule.role === "PM" ? orgRows.filter((item) => rowNames(item, ["pm", "PM"]).includes(recipient)) : rule.role === "TPM" ? orgRows.filter((item) => rowNames(item, ["tpm", "TPM"]).includes(recipient)) : orgRows.filter((item) => rowNames(item, ["productionDirector", "产总"]).includes(recipient));
      const pms = new Set(mappingsFor.flatMap((item) => rowNames(item, ["pm", "PM"])));
      const tpms = new Set(mappingsFor.flatMap((item) => rowNames(item, ["tpm", "TPM"])));
      if (rule.role === "PM") return pool.filter((row) => rowNames(row, ["PM", "项目经理", "项目负责人"]).includes(recipient));
      if (rule.role === "TPM") return pool.filter((row) => rowNames(row, ["TPM"]).includes(recipient) || rowNames(row, ["PM", "项目经理", "项目负责人"]).some((name) => pms.has(name)));
      return pool.filter((row) => rowNames(row, ["产总", "产品总监", "产品部负责人"]).includes(recipient) || rowNames(row, ["TPM"]).some((name) => tpms.has(name)) || rowNames(row, ["PM", "项目经理", "项目负责人"]).some((name) => pms.has(name)));
    }
    return pool.filter((row) => rowNames(row, rule.fields).includes(recipient));
  };
  const all = names.map((recipient) => {
    const matched = rule.manager ? managerRowsFor(recipient) : rows.filter((row) => rule.role === "研发工程师" ? rdRowNames(row).includes(recipient) : rowNames(row, rule.fields).includes(recipient));
    const yearMatched = rule.manager ? managerRowsFor(recipient, yearRows) : yearRows.filter((row) => rule.role === "研发工程师" ? rdRowNames(row).includes(recipient) : rowNames(row, rule.fields).includes(recipient));
    if (rule.role === "研发工程师") {
      const qualityRows = rdIssueRows(files, recipient, selectedRange);
      const yearQualityRows = rdIssueRows(files, recipient, yearRange);
      const count = qualityRows.length;
      const issueEvidence = rdIssueEvidence(files, recipient, selectedRange, qualityRows, yearQualityRows);
      const snapshot = {
        role, recipient, chain: rule.chain, modules: rule.modules,
        period: { start: selectedRange.start || "", end: selectedRange.end || "" },
        metricContract: "rd-quality-only-v1",
        metrics: { total: count, bad: count, good: null, badRate: null, rateAvailable: false, metricLabel: "研发质量问题" },
        categories: categoryStats(qualityRows).slice(0, 12),
        trend: issueEvidence.periodTrend,
        mapping: mappings[recipient] || {},
        sourceRows: count,
        rdQualityIssues: issueEvidence,
        generatedAt: nowIso(),
      };
      return { recipient, snapshot };
    }
    const base = metric(matched);
    const snapshot = { role, recipient, chain: rule.chain, modules: rule.modules, period: { start: selectedRange.start, end: selectedRange.end }, metricContract: rule.modules.includes("IPQC") ? "ipqc-exclude-upstream-v1" : "", metrics: { ...base, badRate: base.total ? Number((base.bad / base.total * 100).toFixed(2)) : 0 }, categories: categoryStats(matched, true).slice(0, 12), examples: issueExamples(matched), trend: trend(yearMatched, { start: selectedRange.start, end: selectedRange.end, _periodStart: selectedRange.start, _periodEnd: selectedRange.end }), teamMembers: rule.role === "供应链经理" ? filterTeamMembersByMapping(rule.role, recipient, supplyChainTeamFromRows(matched, mappingRows), mappingRows) : (teamMemberSpecForRole(rule.role) ? filterTeamMembersByMapping(rule.role, recipient, teamMemberStats(matched, teamMemberSpecForRole(rule.role).fields), mappingRows) : []), siteStats: rule.role === "供应链经理" ? siteStatsFromRows(matched) : [], captainTop: rule.role === "供应链经理" ? captainTopFromRows(matched, mappingRows) : [], mapping: mappings[recipient] || {}, sourceRows: matched.length, generatedAt: nowIso() };
    return { recipient, snapshot };
  });
  const ranking = all.map(({ recipient, snapshot }) => ({ recipient, bad: snapshot.metrics.bad, total: snapshot.metrics.total, badRate: snapshot.metrics.badRate, metricLabel: snapshot.metrics.metricLabel || "不良记录" })).sort((a, b) => b.bad - a.bad || Number(b.badRate || 0) - Number(a.badRate || 0));
  return { role, ruleId: rule.id, period: dateRange, sourceSignature: roleSnapshotSourceSignature(files, agentRaw), generatedAt: nowIso(), ranking, people: all };
};
export const attachDqaAgentRawMetrics = (payload, rawMetrics, mappings = {}, reviewRecords = []) => {
  if (!payload?.people?.length) return payload;
  const raw = rawMetrics && typeof rawMetrics === "object" ? rawMetrics : {};
  const orgRows = Array.isArray(mappings.orgMappings) ? mappings.orgMappings.filter((row) => row.active !== false) : [];
  const scopeFor = (role, recipient) => {
    if (role === "研发工程师") return (raw.records || []).filter((row) => row.engineer === recipient);
    if (role === "PM") return (raw.records || []).filter((row) => row.pm === recipient);
    if (role === "TPM") {
      const org = orgRows.filter((row) => rowNames(row, ["tpm", "TPM"]).includes(recipient));
      const pms = new Set(org.flatMap((row) => rowNames(row, ["pm", "PM"])));
      return (raw.records || []).filter((row) => row.tpm === recipient || pms.has(row.pm));
    }
    if (role === "产总") {
      const org = orgRows.filter((row) => rowNames(row, ["productionDirector", "产总"]).includes(recipient));
      const pms = new Set(org.flatMap((row) => rowNames(row, ["pm", "PM"])));
      return (raw.records || []).filter((row) => pms.has(row.pm));
    }
    return [];
  };
  const summarize = (records) => {
    const ecn = records.filter((row) => row.source === "ECN"); const nonBom = records.filter((row) => row.source === "非BOM"); const projects = [...new Set(ecn.map((row) => row.project).filter(Boolean))];
    const denominator = new Map(); ecn.forEach((row) => { if (row.project && !denominator.has(row.project)) denominator.set(row.project, raw.projectBom?.[row.project] || {}); });
    const bomTotal = [...denominator.values()].reduce((sum, row) => sum + Number(row.bomTotal || 0), 0); const bomMachinedTotal = [...denominator.values()].reduce((sum, row) => sum + Number(row.bomMachinedTotal || 0), 0); const machined = ecn.filter((row) => row.isMachined).length;
    const standard = ecn.length - machined; const standardBomTotal = Math.max(0, bomTotal - bomMachinedTotal); const machinedRate = bomMachinedTotal ? machined / bomMachinedTotal : null; const standardRate = standardBomTotal ? standard / standardBomTotal : null;
    const reasons = new Map(); ecn.forEach((row) => { const name = text(row.reason) || "未填写原因"; reasons.set(name, (reasons.get(name) || 0) + 1); });
    return { ecnCount: ecn.length, nonBomCount: nonBom.length, projectCount: projects.length, ecnMachinedCount: machined, ecnStandardCount: standard, nonBomMachinedCount: nonBom.filter((row) => row.isMachined).length, nonBomStandardCount: nonBom.filter((row) => !row.isMachined).length, bomDenominator: bomTotal, machinedBomDenominator: bomMachinedTotal, standardBomDenominator: standardBomTotal, ecnRate: bomTotal ? ecn.length / bomTotal : null, machinedEcnRate: machinedRate, standardEcnRate: standardRate, machinedToStandardEcnRateRatio: machinedRate != null && standardRate ? machinedRate / standardRate : null, ecnReasons: [...reasons.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) };
  };
  const reviewInPeriod = (row) => {
    const date = dateKey(row?.updateDate || row?.date || "");
    return Boolean(date) && (!payload.period?.start || date >= payload.period.start) && (!payload.period?.end || date <= payload.period.end);
  };
  const reviewContribution = (recipient) => {
    if (payload.role !== "研发工程师") return { reviewParticipation: 0, reviewSuggestions: 0 };
    const records = (Array.isArray(reviewRecords) ? reviewRecords : []).filter(reviewInPeriod);
    return {
      reviewParticipation: records.filter((row) => unique(row.members || []).includes(recipient)).length,
      reviewSuggestions: records.reduce((sum, row) => sum + (row.proposers || []).filter((name) => text(name) === recipient).length, 0),
    };
  };
  return { ...payload, people: payload.people.map((item) => {
    // buildDqaAgentRawMetrics already groups all 70k+ ECN/non-BOM rows by
    // engineer. Reuse that index instead of rescanning every record once for
    // every person and every range/month/week snapshot.
    const fixedMetrics = payload.role === "研发工程师"
      ? (raw.byEngineer?.[item.recipient] || summarize([]))
      : summarize(scopeFor(payload.role, item.recipient));
    const countOnly = (records) => {
      const metrics = summarize(records);
      return { ecnCount: metrics.ecnCount, ecnMachinedCount: metrics.ecnMachinedCount, nonBomCount: metrics.nonBomCount, nonBomMachinedCount: metrics.nonBomMachinedCount, projectCount: metrics.projectCount };
    };
    const childLines = (() => {
      if (payload.role === "产总") {
        const org = orgRows.filter((row) => rowNames(row, ["productionDirector", "产总"]).includes(item.recipient));
        return unique(org.flatMap((row) => rowNames(row, ["tpm", "TPM"]))).map((tpm) => {
          const pms = new Set(org.filter((row) => rowNames(row, ["tpm", "TPM"]).includes(tpm)).flatMap((row) => rowNames(row, ["pm", "PM"])));
          return { name: tpm, ...countOnly((raw.records || []).filter((row) => pms.has(row.pm))) };
        });
      }
      if (payload.role === "TPM") {
        const org = orgRows.filter((row) => rowNames(row, ["tpm", "TPM"]).includes(item.recipient));
        return unique(org.flatMap((row) => rowNames(row, ["pm", "PM"]))).map((pm) => ({ name: pm, ...countOnly((raw.records || []).filter((row) => row.pm === pm)) }));
      }
      if (payload.role === "PM") {
        const records = scopeFor(payload.role, item.recipient);
        return unique(records.map((row) => row.engineer)).map((engineer) => ({ name: engineer, ...countOnly(records.filter((row) => row.engineer === engineer)) }));
      }
      return [];
    })();
    return { ...item, snapshot: { ...item.snapshot, dqaAgentMetrics: { ...fixedMetrics, agentEcnLineCount: fixedMetrics.ecnCount, agentNonBomLineCount: fixedMetrics.nonBomCount, childLines, ...reviewContribution(item.recipient) } } };
  }) };
};
export const mergeRoleSnapshotRegistry = (registry, payload) => {
  const current = normalizeRoleSnapshotRegistry(registry);
  const key = payload.key || roleSnapshotKey(payload);
  const history = current.history.filter((entry) => entry.key !== key);
  return maintainRoleSnapshotHistory({ ...current, updatedAt: nowIso(), history: [{ ...payload, key, active: payload.active !== false, granularity: text(payload.granularity || payload.period?.granularity || "range"), generatedAt: payload.generatedAt || nowIso() }, ...history].slice(0, ROLE_SNAPSHOT_HISTORY_LIMIT) });
};
export const snapshotPeriodIdentity = (entry = {}) => {
  const period = entry.period || entry.dateRange || {};
  return {
    start: text(period.start || period.start2026 || period.start2025),
    end: text(period.end || period.end2026 || period.end2025),
    granularity: text(period.granularity || entry.granularity || "range") || "range",
    periodKey: text(period.periodKey),
  };
};
export const isSupersededSnapshot = (entry = {}, history = [], idOf = (item) => item?.id || item?.key || "") => {
  const entryId = idOf(entry);
  const owner = text(entry.role || entry.ruleId);
  const generatedAt = Date.parse(entry.generatedAt || "") || 0;
  if (!owner || !entryId) return false;
  return (Array.isArray(history) ? history : []).some((candidate) => {
    if (idOf(candidate) === entryId) return false;
    if (text(candidate.role || candidate.ruleId) !== owner) return false;
    if (candidate.active === false) return false;
    const left = snapshotPeriodIdentity(candidate);
    const right = snapshotPeriodIdentity(entry);
    if (left.start !== right.start || left.end !== right.end || left.granularity !== right.granularity || left.periodKey !== right.periodKey) return false;
    return (Date.parse(candidate.generatedAt || "") || 0) > generatedAt;
  });
};
export const maintainRoleSnapshotHistory = (registry = {}) => {
  const current = normalizeRoleSnapshotRegistry(registry);
  if (current.maintenance?.enabled === false || current.maintenance?.autoArchive === false) return current;
  const retention = Math.max(1, Number(current.maintenance?.retention || 3));
  const groups = new Map();
  [...current.history].sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt))).forEach((entry) => {
    const period = snapshotPeriodIdentity(entry);
    const key = `${entry.role}|${entry.skillName}|${entry.layoutProfileId}|${period.granularity}|${period.periodKey}|${period.start}|${period.end}`;
    const list = groups.get(key) || []; list.push(entry); groups.set(key, list);
  });
  const keep = new Set(); groups.forEach((list) => list.slice(0, retention).forEach((entry) => keep.add(entry.key)));
  return { ...current, history: current.history.map((entry) => keep.has(entry.key) ? { ...entry, active: true, status: "ready" } : { ...entry, active: false, status: "archived" }) };
};
const periodCovers = (entryPeriod = {}, needed = {}) => {
  const start = text(needed.start);
  const end = text(needed.end);
  if (!start || !end) return false;
  return text(entryPeriod.start) && text(entryPeriod.end) && text(entryPeriod.start) <= start && text(entryPeriod.end) >= end;
};
const snapshotRecipients = (entry = {}) => {
  if (Array.isArray(entry.recipients) && entry.recipients.length) return entry.recipients.map(text).filter(Boolean);
  return (entry.snapshot?.people || []).map((item) => text(item?.recipient)).filter(Boolean);
};
export const rankRoleSnapshotEntries = (registry, { role, recipient = "", period = {}, sourceSignature = "", mappingSignature = "", skillName = "", layoutProfileId = "" } = {}) => {
  const needed = { start: text(period.start), end: text(period.end) };
  const wantedRecipient = text(recipient);
  const rule = roleSnapshotRule(role);
  const history = normalizeRoleSnapshotRegistry(registry).history.filter((entry) => {
    if (entry.active === false || entry.role !== role) return false;
    if (sourceSignature && entry.sourceSignature && entry.sourceSignature !== sourceSignature) return false;
    if (rule.manager && mappingSignature && entry.mappingSignature && entry.mappingSignature !== mappingSignature) return false;
    if (skillName && entry.skillName && entry.skillName !== skillName) return false;
    if (layoutProfileId && entry.layoutProfileId && entry.layoutProfileId !== layoutProfileId) return false;
    const recipients = snapshotRecipients(entry);
    if (wantedRecipient && recipients.length && !recipients.includes(wantedRecipient)) return false;
    return true;
  });
  return history
    .filter((entry) => {
      const entryPeriod = entry.period || {};
      const exact = text(entryPeriod.start) === needed.start && text(entryPeriod.end) === needed.end;
      const covering = (entryPeriod.granularity || entry.granularity) === "range" && periodCovers(entryPeriod, needed);
      return Boolean(needed.start && needed.end && (exact || covering));
    })
    .sort((left, right) => {
      const leftExact = text(left.period?.start) === needed.start && text(left.period?.end) === needed.end ? 1 : 0;
      const rightExact = text(right.period?.start) === needed.start && text(right.period?.end) === needed.end ? 1 : 0;
      if (rightExact !== leftExact) return rightExact - leftExact;
      const leftRange = (left.period?.granularity || left.granularity) === "range" ? 1 : 0;
      const rightRange = (right.period?.granularity || right.granularity) === "range" ? 1 : 0;
      if (rightRange !== leftRange) return rightRange - leftRange;
      return String(right.generatedAt || "").localeCompare(String(left.generatedAt || ""));
    });
};
export const fillSnapshotWindowDetails = (snapshot, registry, { role = "", recipient = "", period = {} } = {}) => {
  if (!snapshot) return snapshot;
  const hasCats = Array.isArray(snapshot.categories) && snapshot.categories.some((item) => Number(item.count || 0) > 0);
  const hasExamples = Array.isArray(snapshot.examples) && snapshot.examples.length > 0;
  if (!snapshot.coveringWindow && hasCats && hasExamples) return snapshot;
  const { start, end } = selectedPeriodOf(period);
  if (!start || !end) return snapshot;
  const cats = new Map();
  const team = new Map();
  const sites = new Map();
  const captains = new Map();
  const examples = [];
  normalizeRoleSnapshotRegistry(registry).history.forEach((entry) => {
    if (entry.active === false || entry.role !== role) return;
    const piece = entry.period || {};
    const granularity = piece.granularity || entry.granularity;
    if (granularity !== "week" || !piece.start || !piece.end) return;
    if (piece.end < start || piece.start > end) return;
    const person = (entry.snapshot?.people || []).find((item) => text(item?.recipient) === text(recipient))?.snapshot;
    if (!person) return;
    (person.categories || []).forEach((item) => cats.set(item.name, (cats.get(item.name) || 0) + Number(item.count || 0)));
    (person.teamMembers || []).forEach((item) => {
      const current = team.get(item.name) || { name: item.name, total: 0, bad: 0 };
      current.total += Number(item.total || 0);
      current.bad += Number(item.bad || 0);
      team.set(item.name, current);
    });
    (person.siteStats || []).forEach((item) => {
      const current = sites.get(item.name) || { name: item.name, total: 0, bad: 0 };
      current.total += Number(item.total || 0);
      current.bad += Number(item.bad || 0);
      sites.set(item.name, current);
    });
    (person.captainTop || []).forEach((item) => {
      const current = captains.get(item.name) || { name: item.name, total: 0, bad: 0, site: item.site || "", manager: item.manager || "" };
      current.total += Number(item.total || 0);
      current.bad += Number(item.bad || 0);
      current.site = current.site || item.site || "";
      current.manager = current.manager || item.manager || "";
      captains.set(item.name, current);
    });
    examples.push(...(person.examples || []));
  });
  const categories = [...cats.entries()].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  const teamMembers = [...team.values()]
    .map((item) => ({ ...item, good: Math.max(0, item.total - item.bad), badRate: item.total ? Number((item.bad / item.total * 100).toFixed(2)) : 0 }))
    .sort((a, b) => b.bad - a.bad || a.name.localeCompare(b.name, "zh-CN"));
  const seen = new Set();
  const mergedExamples = examples
    .sort((a, b) => text(b?.date).localeCompare(text(a?.date)))
    .filter((item) => {
      const key = [item?.date, item?.category, item?.description].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return Boolean(item?.date || item?.description);
    });
  return {
    ...snapshot,
    categories: categories.length ? categories : snapshot.categories,
    examples: mergedExamples.length ? mergedExamples.slice(0, 200) : snapshot.examples,
    teamMembers: teamMembers.some((item) => item.bad > 0) ? teamMembers : snapshot.teamMembers,
    siteStats: [...sites.values()].some((item) => item.bad > 0 || item.total > 0)
      ? [...sites.values()].map((item) => ({ ...item, good: Math.max(0, item.total - item.bad), badRate: item.total ? Number((item.bad / item.total * 100).toFixed(2)) : 0 }))
      : snapshot.siteStats,
    captainTop: [...captains.values()].some((item) => item.bad > 0)
      ? [...captains.values()].map((item) => ({ ...item, good: Math.max(0, item.total - item.bad), badRate: item.total ? Number((item.bad / item.total * 100).toFixed(2)) : 0 })).sort((a, b) => b.bad - a.bad).slice(0, 8)
      : snapshot.captainTop,
  };
};
export const overlayWindowDetailsOntoEvidence = (evidence = {}, snapshot = null) => {
  if (!snapshot) return evidence;
  const next = { ...evidence, roleSnapshot: snapshot };
  const covering = Boolean(snapshot.coveringWindow);
  const period = snapshot.selectedWindow || {};
  const start = String(period.start || "");
  const end = String(period.end || "");
  const namedCats = (rows = []) => (Array.isArray(rows) ? rows : []).filter((item) => String(item?.name || "").trim() && Number(item.count || 0) > 0);
  const catSum = (rows = []) => namedCats(rows).reduce((sum, item) => sum + Number(item.count || 0), 0);
  const examplesOutside = (rows = []) => {
    if (!Array.isArray(rows) || !rows.length) return true;
    if (!start || !end) return false;
    return rows.every((item) => {
      const key = String(item?.date || "").trim();
      return key && (key < start || key > end);
    });
  };
  const snapshotCats = issueCategoriesFromRoleSnapshot(snapshot).filter((item) => String(item?.name || "").trim() && Number(item.count || 0) > 0);
  const liveSum = catSum(next.topCategoryStats);
  const bad = Number(next.ipqcMetrics?.badRecords || snapshot.metrics?.bad || 0);
  const liveCatsWeak = !namedCats(next.topCategoryStats).length || (covering && bad > 0 && liveSum + 0.5 < bad * 0.5);
  if (snapshotCats.length && liveCatsWeak) {
    next.topCategoryStats = snapshotCats;
    next.topCategories = snapshotCats.map((item) => item.name);
  }
  const liveTeamWeak = !Array.isArray(next.teamMembers) || !next.teamMembers.some((item) => Number(item.bad || 0) > 0);
  if (Array.isArray(snapshot.teamMembers) && snapshot.teamMembers.some((item) => Number(item.bad || 0) > 0) && (covering || liveTeamWeak)) {
    next.teamMembers = snapshot.teamMembers;
  }
  const liveExamplesWeak = !Array.isArray(next.examples) || !next.examples.length || (covering && examplesOutside(next.examples));
  if (Array.isArray(snapshot.examples) && snapshot.examples.length && liveExamplesWeak) {
    next.examples = snapshot.examples;
  }
  const liveSitesWeak = !Array.isArray(next.siteStats) || !next.siteStats.some((item) => Number(item.bad || 0) > 0 || Number(item.total || 0) > 0);
  if (Array.isArray(snapshot.siteStats) && snapshot.siteStats.some((item) => Number(item.bad || 0) > 0) && (covering || liveSitesWeak)) {
    next.siteStats = snapshot.siteStats;
  }
  const liveCaptainsWeak = !Array.isArray(next.captainTop) || !next.captainTop.some((item) => Number(item.bad || 0) > 0);
  if (Array.isArray(snapshot.captainTop) && snapshot.captainTop.some((item) => Number(item.bad || 0) > 0) && (covering || liveCaptainsWeak)) {
    next.captainTop = snapshot.captainTop;
  }
  return next;
};
export const rolePeriodHistoryWithWeeks = (registry, { role = "", period = {}, skillName = "", layoutProfileId = "" } = {}) => {
  const { start, end } = selectedPeriodOf(period);
  const entry = pickRoleSnapshotEntry(registry, { role, period: { start, end }, skillName, layoutProfileId });
  const history = [];
  if (entry) history.push(entry);
  normalizeRoleSnapshotRegistry(registry).history.forEach((item) => {
    if (item?.active === false || item.role !== role) return;
    const piece = item.period || {};
    const granularity = piece.granularity || item.granularity;
    if (granularity !== "week" || !piece.start || !piece.end) return;
    if (!start || !end || piece.end < start || piece.start > end) return;
    if (skillName && item.skillName && item.skillName !== skillName) return;
    if (layoutProfileId && item.layoutProfileId && item.layoutProfileId !== layoutProfileId) return;
    if (history.some((kept) => (kept.id && kept.id === item.id) || kept.key === item.key)) return;
    history.push(item);
  });
  return history;
};
export const pickRoleSnapshotEntry = (registry, query = {}) => rankRoleSnapshotEntries(registry, query)[0] || null;
export const pickRoleSnapshot = (registry, query = {}) => {
  const people = pickRoleSnapshotEntry(registry, query)?.snapshot?.people || [];
  return people.find((item) => item.recipient === query.recipient)?.snapshot || null;
};
