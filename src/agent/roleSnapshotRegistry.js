export const QUALITY_ROLE_SNAPSHOT_REGISTRY_KEY = "quality-agent-role-snapshot-registry";
export const QUALITY_ROLE_SNAPSHOT_SCHEMA = "quality-agent-role-snapshot-v1";

const nowIso = () => new Date().toISOString();
const text = (value) => String(value ?? "").trim();
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const dateKey = (value) => {
  const raw = text(value);
  const m = raw.match(/(20\d{2})[年\-/](\d{1,2})[月\-/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const rowDate = (row) => row?.日期 || row?.检验日期 || row?.发生日期 || row?.问题日期 || row?.创建时间 || row?.需求日期 || row?.申请日期 || row?.更新日期 || row?.更新时间 || "";
const inPeriod = (row, period = {}) => { const d = dateKey(rowDate(row)); return !d || (!period.start || d >= period.start) && (!period.end || d <= period.end); };
const issue = (row) => text(row?.不良内容) || text(row?.不良类型) || text(row?.问题类型) || text(row?.问题描述) ? 1 : 0;
const rowNames = (row, fields) => fields.flatMap((field) => text(row?.[field]).split(/[、,，;；/\\|]/).map(text)).filter(Boolean);
const sourceRows = (files, modules) => files.filter((file) => modules.includes(file.module)).flatMap((file) => file.rows || []);
const metric = (rows) => ({ total: rows.length, bad: rows.reduce((sum, row) => sum + issue(row), 0), good: rows.reduce((sum, row) => sum + (issue(row) ? 0 : 1), 0) });
const categoryStats = (rows) => {
  const map = new Map();
  rows.forEach((row) => { const key = text(row?.不良类型 || row?.问题类型 || row?.问题分类 || row?.阶段) || "未分类"; map.set(key, (map.get(key) || 0) + 1); });
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
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
  { id: "rd-engineer", role: "研发工程师", chain: "研发工程师 → PM → TPM → 产总", modules: ["OQC", "DQA", "QMS"], fields: ["研发工程师", "工程师", "申请人", "创建人", "__engineer"] },
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
    ? source.history.filter((item) => item && item.role && (item.snapshot || Number.isFinite(Number(item.peopleCount)) || item.recipient)).map((item) => ({ ...item, batchId: text(item.batchId), peopleCount: Number(item.peopleCount ?? item.snapshot?.people?.length ?? 0), note: text(item.note) })).slice(0, 240)
    : [];
  return { schemaVersion: QUALITY_ROLE_SNAPSHOT_SCHEMA, updatedAt: text(source.updatedAt) || nowIso(), rules, history, maintenance: { ...base.maintenance, ...(source.maintenance || {}), retention: Math.max(1, Math.min(20, Number(source.maintenance?.retention || base.maintenance.retention))), taskHistory: Array.isArray(source.maintenance?.taskHistory) ? source.maintenance.taskHistory.slice(0, 50) : [] } };
};
export const updateRoleSnapshotRule = (registry, ruleId, patch = {}) => {
  const current = normalizeRoleSnapshotRegistry(registry);
  return { ...current, updatedAt: nowIso(), rules: current.rules.map((rule) => rule.id === ruleId ? { ...rule, ...patch, updatedAt: nowIso() } : rule) };
};
export const roleSnapshotSourceSignature = (files = []) => JSON.stringify(files.map((file) => ({ module: file.module, name: file.name, importedAt: file.importedAt, rows: file.rowCount || file.rows?.length || 0 })).sort((a, b) => `${a.module}${a.name}`.localeCompare(`${b.module}${b.name}`)));
export const roleSnapshotMappingSignature = (mappings = {}) => JSON.stringify({ supplyMappings: mappings.supplyMappings || [], orgMappings: mappings.orgMappings || [] });
export const roleSnapshotKey = ({ role, ruleId = "", period = {}, granularity = "", sourceSignature = "", mappingSignature = "", skillName = "", layoutProfileId = "" } = {}) => [role, ruleId, period.start || "", period.end || "", granularity || period.granularity || "range", period.periodKey || "", sourceSignature, mappingSignature, skillName, layoutProfileId].join("::");

export const buildRoleSnapshots = ({ role, files = [], dateRange = {}, mappings = {} } = {}) => {
  const rule = roleSnapshotRule(role);
  const rows = sourceRows(files, rule.modules).filter((row) => inPeriod(row, dateRange));
  const mappingRows = Array.isArray(mappings?.supplyMappings) ? mappings.supplyMappings.filter((item) => item.active !== false) : [];
  const orgRows = Array.isArray(mappings?.orgMappings) ? mappings.orgMappings.filter((item) => item.active !== false) : [];
  const names = rule.fixedRecipients || (rule.role === "供应链经理"
    ? ["供应链经理"]
    : rule.role === "机长" ? unique(rows.flatMap((row) => rowNames(row, rule.fields)))
      : rule.role === "交付经理" ? unique(rows.flatMap((row) => rowNames(row, rule.fields)).concat(mappingRows.flatMap((row) => rowNames(row, ["manager", "交付经理"]))))
        : rule.role === "PM" ? unique(orgRows.flatMap((row) => rowNames(row, ["pm", "PM"])))
          : rule.role === "TPM" ? unique(orgRows.flatMap((row) => rowNames(row, ["tpm", "TPM"])))
            : rule.role === "产总" ? unique(orgRows.flatMap((row) => rowNames(row, ["productionDirector", "产总"])))
              : unique(rows.flatMap((row) => rowNames(row, rule.fields))));
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
    const matched = rule.manager ? managerRowsFor(recipient) : rows.filter((row) => rowNames(row, rule.fields).includes(recipient));
    const base = metric(matched);
    const snapshot = { role, recipient, chain: rule.chain, modules: rule.modules, period: { start: dateRange.start || "", end: dateRange.end || "" }, metrics: { ...base, badRate: base.total ? Number((base.bad / base.total * 100).toFixed(2)) : 0 }, categories: categoryStats(matched).slice(0, 12), trend: trend(matched, dateRange), mapping: mappings[recipient] || {}, sourceRows: matched.length, generatedAt: nowIso() };
    return { recipient, snapshot };
  });
  const ranking = all.map(({ recipient, snapshot }) => ({ recipient, bad: snapshot.metrics.bad, total: snapshot.metrics.total, badRate: snapshot.metrics.badRate })).sort((a, b) => b.bad - a.bad || b.badRate - a.badRate);
  return { role, ruleId: rule.id, period: dateRange, sourceSignature: roleSnapshotSourceSignature(files), generatedAt: nowIso(), ranking, people: all };
};
export const mergeRoleSnapshotRegistry = (registry, payload) => {
  const current = normalizeRoleSnapshotRegistry(registry);
  const key = payload.key || roleSnapshotKey(payload);
  const history = current.history.filter((entry) => entry.key !== key);
  return { ...current, updatedAt: nowIso(), history: [{ ...payload, key, active: payload.active !== false, granularity: text(payload.granularity || payload.period?.granularity || "range"), generatedAt: payload.generatedAt || nowIso() }, ...history].slice(0, 240) };
};
export const pickRoleSnapshot = (registry, { role, recipient, period = {}, sourceSignature = "", mappingSignature = "", skillName = "", layoutProfileId = "" } = {}) => normalizeRoleSnapshotRegistry(registry).history.find((entry) => entry.active !== false && entry.role === role && entry.sourceSignature === sourceSignature && entry.mappingSignature === mappingSignature && entry.skillName === skillName && entry.layoutProfileId === layoutProfileId && entry.period?.start === period.start && entry.period?.end === period.end)?.snapshot?.people?.find((item) => item.recipient === recipient)?.snapshot || null;
