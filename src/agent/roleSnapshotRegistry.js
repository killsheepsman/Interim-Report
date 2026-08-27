export const QUALITY_ROLE_SNAPSHOT_REGISTRY_KEY = "quality-agent-role-snapshot-registry";
export const QUALITY_ROLE_SNAPSHOT_SCHEMA = "quality-agent-role-snapshot-v1";
// 8 roles x range/month/week periods exceed the old 240-entry global limit.
// Keep one complete annual set plus revisions; maintenance still archives
// superseded entries within each role/period group.
const ROLE_SNAPSHOT_HISTORY_LIMIT = 480;

const nowIso = () => new Date().toISOString();
const text = (value) => String(value ?? "").trim();
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
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
const rowDate = (row) => row?.日期 || row?.检验日期 || row?.发生日期 || row?.问题日期 || row?.创建时间 || row?.需求日期 || row?.申请日期 || row?.更新日期 || row?.更新时间 || "";
const inPeriod = (row, period = {}) => { const d = dateKey(rowDate(row)); return !d || (!period.start || d >= period.start) && (!period.end || d <= period.end); };
const issue = (row) => row?.__roleActivity === true ? 0 : (text(row?.不良内容) || text(row?.不良类型) || text(row?.问题类型) || text(row?.问题描述) ? 1 : 0);
const rowNames = (row, fields) => fields.flatMap((field) => text(row?.[field]).split(/[、,，;；/\\|]/).map(text)).filter(Boolean);
const sourceRows = (files, modules) => files.filter((file) => modules.includes(file.module)).flatMap((file) => file.rows || []);
const metric = (rows) => ({ total: rows.length, bad: rows.reduce((sum, row) => sum + issue(row), 0), good: rows.reduce((sum, row) => sum + (issue(row) ? 0 : 1), 0) });
const categoryStats = (rows) => {
  const map = new Map();
  rows.forEach((row) => { const key = text(row?.不良类型 || row?.问题类型 || row?.问题分类 || row?.类别 || row?.阶段) || "未分类"; map.set(key, (map.get(key) || 0) + 1); });
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
const rdIssuePeriodTrend = (rows, period, granularity) => {
  const end = text(period?.end);
  const year = (end || text(period?.start) || String(new Date().getFullYear())).slice(0, 4);
  const start = `${year}-01-01`;
  if (!end || end < start) return null;
  const groups = new Map();
  for (let cursor = new Date(`${start}T00:00:00Z`), to = new Date(`${end}T00:00:00Z`); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    const label = granularity === "month" ? date.slice(0, 7) : isoWeekKey(date);
    if (!groups.has(label)) groups.set(label, { label, count: 0 });
  }
  rows.forEach((row) => {
    const date = dateKey(rowDate(row));
    if (!date || date < start || date > end) return;
    const label = granularity === "month" ? date.slice(0, 7) : isoWeekKey(date);
    if (groups.has(label)) groups.get(label).count += 1;
  });
  const result = [...groups.values()];
  return result.length >= 2 ? { granularity, rows: result } : null;
};
const rdIssueEvidence = (files, recipient, period, selectedRows = null) => {
  const rows = selectedRows || rdIssueRows(files, recipient, period);
  return {
    count: rows.length,
    categories: categoryStats(rows).slice(0, 10),
    productDepts: unique(rows.map((row) => row?.产品部)),
    stages: unique(rows.map((row) => row?.阶段)),
    periodTrend: {
      month: rdIssuePeriodTrend(rows, period, "month"),
      week: rdIssuePeriodTrend(rows, period, "week"),
    },
    examples: rows.slice(0, 8).map((row) => ({
      date: dateKey(rowDate(row)),
      category: text(row?.问题分类 || row?.类别 || row?.问题类型) || "未分类",
      description: text(row?.问题描述),
    })),
  };
};
const trend = (rows, period) => {
  const map = new Map();
  rows.forEach((row) => { const d = dateKey(rowDate(row)); if (!d || !inPeriod(row, period)) return; const key = d.slice(0, 7); const item = map.get(key) || { period: key, total: 0, bad: 0 }; item.total += 1; item.bad += issue(row); map.set(key, item); });
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period)).map((item) => ({ ...item, rate: item.total ? Number((item.bad / item.total * 100).toFixed(2)) : 0 }));
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
  const rows = sourceRows(files, rule.modules).filter((row) => inPeriod(row, dateRange));
  const mappingRows = Array.isArray(mappings?.supplyMappings) ? mappings.supplyMappings.filter((item) => item.active !== false) : [];
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
        : rule.role === "PM" ? unique([...orgRows.flatMap((row) => rowNames(row, ["pm", "PM"])), ...agentNames])
          : rule.role === "TPM" ? unique([...orgRows.flatMap((row) => rowNames(row, ["tpm", "TPM"])), ...agentNames])
            : rule.role === "产总" ? unique(orgRows.flatMap((row) => rowNames(row, ["productionDirector", "产总"])))
              : rule.role === "研发工程师" ? unique([...rows.flatMap(rdRowNames), ...agentNames])
                : unique([...rows.flatMap((row) => rowNames(row, rule.fields)), ...agentNames]));
  const managerRowsFor = (recipient) => {
    if (rule.role === "供应链经理") return rows;
    if (rule.role === "机长") return rows.filter((row) => rowNames(row, ["机长", "组长", "班组长"]).includes(recipient));
    if (rule.role === "交付经理") {
      const mapped = mappingRows.filter((item) => rowNames(item, ["manager", "交付经理"]).includes(recipient));
      const leaders = new Set(mapped.flatMap((item) => rowNames(item, ["leader", "机长"])));
      const workshops = new Set(mapped.flatMap((item) => rowNames(item, ["workshop", "工坊"])));
      return rows.filter((row) => rowNames(row, ["交付经理", "供应商经理", "经理"]).includes(recipient) || rowNames(row, ["机长", "组长", "班组长"]).some((name) => leaders.has(name)) || rowNames(row, ["交付工坊", "工坊", "供应商"]).some((name) => workshops.has(name)));
    }
    if (rule.role === "PM" || rule.role === "TPM" || rule.role === "产总") {
      const mappingsFor = rule.role === "PM" ? orgRows.filter((item) => rowNames(item, ["pm", "PM"]).includes(recipient)) : rule.role === "TPM" ? orgRows.filter((item) => rowNames(item, ["tpm", "TPM"]).includes(recipient)) : orgRows.filter((item) => rowNames(item, ["productionDirector", "产总"]).includes(recipient));
      const pms = new Set(mappingsFor.flatMap((item) => rowNames(item, ["pm", "PM"])));
      const tpms = new Set(mappingsFor.flatMap((item) => rowNames(item, ["tpm", "TPM"])));
      if (rule.role === "PM") return rows.filter((row) => rowNames(row, ["PM", "项目经理", "项目负责人"]).includes(recipient));
      if (rule.role === "TPM") return rows.filter((row) => rowNames(row, ["TPM"]).includes(recipient) || rowNames(row, ["PM", "项目经理", "项目负责人"]).some((name) => pms.has(name)));
      return rows.filter((row) => rowNames(row, ["产总", "产品总监", "产品部负责人"]).includes(recipient) || rowNames(row, ["TPM"]).some((name) => tpms.has(name)) || rowNames(row, ["PM", "项目经理", "项目负责人"]).some((name) => pms.has(name)));
    }
    return rows.filter((row) => rowNames(row, rule.fields).includes(recipient));
  };
  const all = names.map((recipient) => {
    const matched = rule.manager ? managerRowsFor(recipient) : rows.filter((row) => rule.role === "研发工程师" ? rdRowNames(row).includes(recipient) : rowNames(row, rule.fields).includes(recipient));
    if (rule.role === "研发工程师") {
      const qualityRows = rdIssueRows(files, recipient, dateRange);
      const count = qualityRows.length;
      const issueEvidence = rdIssueEvidence(files, recipient, dateRange, qualityRows);
      const snapshot = {
        role, recipient, chain: rule.chain, modules: rule.modules,
        period: { start: dateRange.start || "", end: dateRange.end || "" },
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
    const snapshot = { role, recipient, chain: rule.chain, modules: rule.modules, period: { start: dateRange.start || "", end: dateRange.end || "" }, metrics: { ...base, badRate: base.total ? Number((base.bad / base.total * 100).toFixed(2)) : 0 }, categories: categoryStats(matched).slice(0, 12), trend: trend(matched, dateRange), mapping: mappings[recipient] || {}, sourceRows: matched.length, generatedAt: nowIso() };
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
    const org = role === "TPM" ? orgRows.filter((row) => rowNames(row, ["tpm", "TPM"]).includes(recipient)) : orgRows.filter((row) => rowNames(row, ["productionDirector", "产总"]).includes(recipient));
    const tpms = new Set(org.flatMap((row) => rowNames(row, ["tpm", "TPM"]))); const pms = new Set(org.flatMap((row) => rowNames(row, ["pm", "PM"])));
    return (raw.records || []).filter((row) => role === "TPM" ? row.tpm === recipient || pms.has(row.pm) : tpms.has(row.tpm) || pms.has(row.pm));
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
    return { ...item, snapshot: { ...item.snapshot, dqaAgentMetrics: { ...fixedMetrics, ...reviewContribution(item.recipient) } } };
  }) };
};
export const mergeRoleSnapshotRegistry = (registry, payload) => {
  const current = normalizeRoleSnapshotRegistry(registry);
  const key = payload.key || roleSnapshotKey(payload);
  const history = current.history.filter((entry) => entry.key !== key);
  return maintainRoleSnapshotHistory({ ...current, updatedAt: nowIso(), history: [{ ...payload, key, active: payload.active !== false, granularity: text(payload.granularity || payload.period?.granularity || "range"), generatedAt: payload.generatedAt || nowIso() }, ...history].slice(0, ROLE_SNAPSHOT_HISTORY_LIMIT) });
};
export const maintainRoleSnapshotHistory = (registry = {}) => {
  const current = normalizeRoleSnapshotRegistry(registry);
  if (current.maintenance?.enabled === false || current.maintenance?.autoArchive === false) return current;
  const retention = Math.max(1, Number(current.maintenance?.retention || 3));
  const groups = new Map();
  [...current.history].sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt))).forEach((entry) => {
    const key = `${entry.role}|${entry.skillName}|${entry.layoutProfileId}|${entry.period?.granularity || entry.granularity}|${entry.period?.periodKey || ""}`;
    const list = groups.get(key) || []; list.push(entry); groups.set(key, list);
  });
  const keep = new Set(); groups.forEach((list) => list.slice(0, retention).forEach((entry) => keep.add(entry.key)));
  return { ...current, history: current.history.map((entry) => keep.has(entry.key) ? { ...entry, active: true, status: "ready" } : { ...entry, active: false, status: "archived" }) };
};
export const pickRoleSnapshot = (registry, { role, recipient, period = {}, sourceSignature = "", mappingSignature = "", skillName = "", layoutProfileId = "" } = {}) => {
  const strictPeriodMatch = Object.prototype.hasOwnProperty.call(period, "granularity") || Object.prototype.hasOwnProperty.call(period, "periodKey");
  const rule = roleSnapshotRule(role);
  return normalizeRoleSnapshotRegistry(registry).history.find((entry) => entry.active !== false
    && entry.role === role
    && (!sourceSignature || entry.sourceSignature === sourceSignature)
    // Direct-responsibility snapshots do not use an organisation map. Skill and
    // presentation settings change AI narration only, never fixed statistics.
    && (!rule.manager || !mappingSignature || entry.mappingSignature === mappingSignature)
    && samePeriod(entry.period, period, strictPeriodMatch))?.snapshot?.people?.find((item) => item.recipient === recipient)?.snapshot || null;
};
