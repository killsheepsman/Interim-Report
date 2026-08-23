import { DEFAULT_REPORT_PRESENTATION_PROFILE, normalizeReportPresentationProfile, REPORT_PRESENTATION_PROFILES } from "./reportPresentationProfiles.js";

export const QUALITY_SNAPSHOT_REGISTRY_KEY = "quality-agent-snapshot-registry";
export const QUALITY_SNAPSHOT_REGISTRY_SCHEMA = "quality-agent-snapshot-registry-v1";
export const QUALITY_SNAPSHOT_MODULES = ["IQC", "IPQC", "OQC", "DQA", "QMS"];

const DEFAULT_SKILL_BY_MODULE = {
  IQC: "quality-analysis-iqc",
  IPQC: "quality-analysis-ipqc",
  OQC: "quality-analysis-oqc",
  DQA: "quality-analysis-dqa",
  QMS: "quality-analysis-qms",
};

const RULE_LIBRARY = {
  IQC: { id: "iqc", module: "IQC", label: "IQC 来料快照", description: "供应商、批次、特采、合格率、趋势、Pareto", sourceModules: ["IQC"], sourceKinds: ["来料检验", "供应商来料"], focus: ["来料合格率", "特采占比", "重点供应商", "趋势", "Pareto"] },
  IPQC: { id: "ipqc", module: "IPQC", label: "IPQC 过程快照", description: "送检量、异常密度、工坊/机长、重复问题、过程拦截", sourceModules: ["IPQC"], sourceKinds: ["过程送检", "工坊稽核"], focus: ["送检量", "异常密度", "工坊", "交付经理", "重复问题"] },
  OQC: { id: "oqc", module: "OQC", label: "OQC 出货快照", description: "出货数量、评分、项目离散、机台分布、治具/自动化", sourceModules: ["OQC"], sourceKinds: ["出货汇总", "出货明细"], focus: ["项目数量", "机台数量", "离散度", "评分", "项目分类"] },
  DQA: { id: "dqa", module: "DQA", label: "DQA 研发快照", description: "研发问题、ECN、非BOM、评审、工程师责任和闭环", sourceModules: ["DQA"], sourceKinds: ["研发问题", "ECN", "非BOM", "评审"], focus: ["研发问题", "ECN", "非BOM", "评审", "工程师"] },
  QMS: { id: "qms", module: "QMS", label: "QMS 客诉快照", description: "客户意见、分公司/事业部、严重度、复发、整改动作", sourceModules: ["QMS"], sourceKinds: ["客户意见", "质量反馈"], focus: ["客户意见", "严重度", "复发", "整改", "趋势"] },
};

const nowIso = () => new Date().toISOString();
const normalizeDateRange = (value = {}) => ({
  start2025: String(value.start2025 || ""),
  end2025: String(value.end2025 || ""),
  start2026: String(value.start2026 || ""),
  end2026: String(value.end2026 || ""),
  granularity: String(value.granularity || "range"),
  periodKey: String(value.periodKey || ""),
});

const dateOnly = (value) => { const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null; };
const isoDate = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; };
const splitYearPeriods = (start, end, granularity) => {
  const first = dateOnly(start); const last = dateOnly(end); if (!first || !last || first > last) return [];
  const result = [];
  if (granularity === "month") {
    let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    while (cursor <= last) { const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)); const from = cursor < first ? first : cursor; const to = monthEnd > last ? last : monthEnd; result.push({ start: isoDate(from), end: isoDate(to), granularity, periodKey: isoDate(cursor).slice(0, 7) }); cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)); }
  } else {
    let cursor = first; while (cursor <= last) { const to = addDays(cursor, 6) > last ? last : addDays(cursor, 6); result.push({ start: isoDate(cursor), end: isoDate(to), granularity, periodKey: `${isoDate(cursor)}_${isoDate(to)}` }); cursor = addDays(to, 1); }
  }
  return result;
};
export const buildSnapshotPeriods = (dateRange = {}) => {
  const periods = [{ ...normalizeDateRange(dateRange), granularity: "range", periodKey: "range" }];
  [["2025", dateRange.start2025, dateRange.end2025], ["2026", dateRange.start2026, dateRange.end2026]].forEach(([year, start, end]) => {
    if (!start || !end) return;
    splitYearPeriods(start, end, "month").forEach((item) => periods.push({ start2025: year === "2025" ? item.start : "", end2025: year === "2025" ? item.end : "", start2026: year === "2026" ? item.start : "", end2026: year === "2026" ? item.end : "", granularity: item.granularity, periodKey: item.periodKey }));
    splitYearPeriods(start, end, "week").forEach((item) => periods.push({ start2025: year === "2025" ? item.start : "", end2025: year === "2025" ? item.end : "", start2026: year === "2026" ? item.start : "", end2026: year === "2026" ? item.end : "", granularity: item.granularity, periodKey: item.periodKey }));
  });
  return periods;
};
const normalizeLayoutProfileId = (value) => normalizeReportPresentationProfile(String(value || DEFAULT_REPORT_PRESENTATION_PROFILE));
const normalizeSkillName = (value, module) => String(value || "").trim() || DEFAULT_SKILL_BY_MODULE[module] || `quality-analysis-${String(module || "dqa").toLowerCase()}`;
const normalizeJson = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const normalizeRule = (rule = {}, fallback = {}) => {
  const module = String(rule.module || fallback.module || "DQA");
  return {
    id: String(rule.id || fallback.id || module.toLowerCase()),
    module,
    label: String(rule.label || fallback.label || `${module} 快照`),
    description: String(rule.description || fallback.description || ""),
    enabled: rule.enabled !== false,
    defaultSkill: normalizeSkillName(rule.defaultSkill || fallback.defaultSkill, module),
    selectedSkill: normalizeSkillName(rule.selectedSkill || rule.defaultSkill || fallback.defaultSkill, module),
    layoutProfileId: normalizeLayoutProfileId(rule.layoutProfileId || fallback.layoutProfileId),
    sourceModules: Array.isArray(rule.sourceModules) && rule.sourceModules.length ? rule.sourceModules.map(String) : (fallback.sourceModules || [module]),
    sourceKinds: Array.isArray(rule.sourceKinds) ? rule.sourceKinds.map(String) : (fallback.sourceKinds || []),
    focus: Array.isArray(rule.focus) ? rule.focus.map(String) : (fallback.focus || []),
    note: String(rule.note || fallback.note || ""),
    createdAt: String(rule.createdAt || fallback.createdAt || nowIso()),
    updatedAt: String(rule.updatedAt || fallback.updatedAt || nowIso()),
  };
};

const normalizeHistoryEntry = (entry = {}) => ({
  id: String(entry.id || `${String(entry.module || "DQA")}-${String(entry.generatedAt || nowIso()).replace(/[:.]/g, "-")}`),
  ruleId: String(entry.ruleId || entry.ruleKey || String(entry.module || "DQA").toLowerCase()),
  module: String(entry.module || "DQA"),
  moduleLabel: String(entry.moduleLabel || entry.module || "DQA"),
  ruleLabel: String(entry.ruleLabel || entry.ruleName || entry.module || "DQA"),
  skillName: normalizeSkillName(entry.skillName, String(entry.module || "DQA")),
  skillSignature: String(entry.skillSignature || ""),
  layoutProfileId: normalizeLayoutProfileId(entry.layoutProfileId),
  dateRange: normalizeDateRange(entry.dateRange),
  sourceSignature: String(entry.sourceSignature || ""),
  sourceSummary: normalizeJson(entry.sourceSummary),
  generatedAt: String(entry.generatedAt || nowIso()),
  generatedBy: String(entry.generatedBy || ""),
  batchId: String(entry.batchId || ""),
  note: String(entry.note || ""),
  status: String(entry.status || "ready"),
  active: entry.active !== false,
  summary: normalizeJson(entry.summary),
  snapshot: normalizeJson(entry.snapshot),
  peopleCount: Number(entry.peopleCount || entry.snapshot?.people?.length || 0),
});

export const createDefaultQualitySnapshotRegistry = () => {
  const rules = QUALITY_SNAPSHOT_MODULES.map((module) => normalizeRule(RULE_LIBRARY[module], { layoutProfileId: DEFAULT_REPORT_PRESENTATION_PROFILE }));
  return { schemaVersion: QUALITY_SNAPSHOT_REGISTRY_SCHEMA, updatedAt: nowIso(), selectedRuleId: rules[0]?.id || "iqc", rules, history: [], maintenance: { enabled: true, retention: 3, autoArchive: true, taskHistory: [] } };
};

export const normalizeQualitySnapshotRegistry = (value) => {
  const source = normalizeJson(value);
  const base = createDefaultQualitySnapshotRegistry();
  const rulesByModule = new Map(base.rules.map((rule) => [rule.module, rule]));
  (Array.isArray(source.rules) ? source.rules : []).forEach((rule) => {
    const module = String(rule?.module || "").toUpperCase();
    if (rulesByModule.has(module)) rulesByModule.set(module, normalizeRule(rule, rulesByModule.get(module)));
  });
  const rules = QUALITY_SNAPSHOT_MODULES.map((module) => rulesByModule.get(module) || normalizeRule(RULE_LIBRARY[module], {}));
  const history = [...new Map((Array.isArray(source.history) ? source.history : []).map((entry) => {
    const normalized = normalizeHistoryEntry(entry);
    return [normalized.id, normalized];
  })).values()]
    .sort((left, right) => String(right.generatedAt || "").localeCompare(String(left.generatedAt || "")))
    .slice(0, 240);
  const selectedRuleId = rules.some((rule) => rule.id === source.selectedRuleId) ? String(source.selectedRuleId) : (rules.find((rule) => rule.enabled)?.id || rules[0]?.id || "iqc");
  return { schemaVersion: String(source.schemaVersion || QUALITY_SNAPSHOT_REGISTRY_SCHEMA), updatedAt: String(source.updatedAt || nowIso()), selectedRuleId, rules, history, maintenance: { ...base.maintenance, ...(source.maintenance || {}), retention: Math.max(1, Math.min(20, Number(source.maintenance?.retention || base.maintenance.retention))), taskHistory: Array.isArray(source.maintenance?.taskHistory) ? source.maintenance.taskHistory.slice(0, 50) : [] } };
};

export const getQualitySnapshotRulePreview = (rule = {}) => ({
  title: String(rule.label || ""),
  description: String(rule.description || ""),
  focus: Array.isArray(rule.focus) ? rule.focus : [],
  sourceKinds: Array.isArray(rule.sourceKinds) ? rule.sourceKinds : [],
  sourceModules: Array.isArray(rule.sourceModules) ? rule.sourceModules : [],
  skillName: normalizeSkillName(rule.selectedSkill || rule.defaultSkill, rule.module),
  layoutProfileId: normalizeLayoutProfileId(rule.layoutProfileId),
});

export const buildQualitySnapshotKey = ({ module = "", dateRange = {}, sourceSignature = "", skillName = "", skillSignature = "", layoutProfileId = "" } = {}) => [
  String(module || ""),
  normalizeDateRange(dateRange).start2025,
  normalizeDateRange(dateRange).end2025,
  normalizeDateRange(dateRange).start2026,
  normalizeDateRange(dateRange).end2026,
  String(sourceSignature || ""),
  String(skillName || ""),
  String(skillSignature || ""),
  normalizeDateRange(dateRange).granularity,
  normalizeDateRange(dateRange).periodKey,
  normalizeLayoutProfileId(layoutProfileId),
].join("::");

export const summarizeQualitySnapshot = (snapshot = {}) => {
  const data = normalizeJson(snapshot.data);
  const sourceAudit = normalizeJson(data.sourceAudit);
  const localPareto = normalizeJson(data.localPareto);
  const evidenceCatalog = normalizeJson(data.evidenceCatalog);
  const counts = normalizeJson(evidenceCatalog.counts);
  return {
    module: String(snapshot.module || ""),
    moduleLabel: String(snapshot.moduleLabel || ""),
    period: normalizeJson(snapshot.period),
    sourceRows: Number(sourceAudit.rowsChecked || sourceAudit.loadedRows || 0),
    sourceFiles: Number(sourceAudit.sourceFileCount || 0),
    dateCoverageRate: sourceAudit.dateCoverage?.rate ?? null,
    evidenceCount: Number(counts.source || 0) + Number(counts.metric || 0) + Number(counts.organization || 0) + Number(counts.mechanism || 0) + Number(counts.cross || 0),
    organizationRows: Number(Array.isArray(localPareto.organizationPareto) ? localPareto.organizationPareto.length : 0),
    mechanismRows: Number(Array.isArray(localPareto.mechanismPareto) ? localPareto.mechanismPareto.length : 0),
    crossRows: Number(Array.isArray(localPareto.crossThemes) ? localPareto.crossThemes.length : 0),
    generatedAt: String(snapshot.generatedAt || ""),
  };
};

export const buildQualitySnapshotHistoryEntry = ({ rule = {}, snapshot = {}, sourceSignature = "", sourceSummary = {}, dateRange = {}, generatedBy = "", batchId = "", skillName = "", skillSignature = "", layoutProfileId = "", status = "ready" } = {}) => {
  const normalizedRule = normalizeRule(rule, RULE_LIBRARY[rule.module] || {});
  const normalizedSnapshot = normalizeJson(snapshot);
  const module = String(normalizedRule.module || normalizedSnapshot.module || "DQA");
  const entry = {
    id: buildQualitySnapshotKey({ module, dateRange: dateRange || normalizedSnapshot.period || {}, sourceSignature, skillName: skillName || normalizedRule.selectedSkill, skillSignature, layoutProfileId: layoutProfileId || normalizedRule.layoutProfileId }),
    ruleId: normalizedRule.id,
    module,
    moduleLabel: normalizedRule.label,
    ruleLabel: normalizedRule.label,
    skillName: skillName || normalizedRule.selectedSkill,
    skillSignature,
    layoutProfileId: layoutProfileId || normalizedRule.layoutProfileId,
    dateRange: normalizeDateRange(dateRange || normalizedSnapshot.period || {}),
    granularity: normalizeDateRange(dateRange || normalizedSnapshot.period || {}).granularity,
    sourceSignature,
    sourceSummary: normalizeJson(sourceSummary),
    generatedAt: String(normalizedSnapshot.generatedAt || nowIso()),
    generatedBy: String(generatedBy || ""),
    batchId: String(batchId || ""),
    status,
    summary: summarizeQualitySnapshot(normalizedSnapshot),
    snapshot: normalizedSnapshot,
  };
  return normalizeHistoryEntry(entry);
};

export const mergeQualitySnapshotHistory = (registry = {}, entry = {}) => {
  const normalizedRegistry = normalizeQualitySnapshotRegistry(registry);
  const normalizedEntry = buildQualitySnapshotHistoryEntry(entry);
  const history = [normalizedEntry, ...normalizedRegistry.history.filter((item) => item.id !== normalizedEntry.id)]
    .sort((left, right) => String(right.generatedAt || "").localeCompare(String(left.generatedAt || "")))
    .slice(0, 240);
  return { ...normalizedRegistry, selectedRuleId: normalizedRegistry.rules.some((rule) => rule.id === normalizedRegistry.selectedRuleId) ? normalizedRegistry.selectedRuleId : (normalizedRegistry.rules.find((rule) => rule.enabled)?.id || normalizedRegistry.rules[0]?.id || "iqc"), updatedAt: nowIso(), history };
};

export const pickLatestQualitySnapshot = (registry = {}, query = {}) => {
  const normalizedRegistry = normalizeQualitySnapshotRegistry(registry);
  const range = normalizeDateRange(query.dateRange || {});
  const candidates = normalizedRegistry.history.filter((entry) => {
    if (entry.active === false) return false;
    if (query.module && entry.module !== query.module) return false;
    if (query.ruleId && entry.ruleId !== query.ruleId) return false;
    if (query.skillName && entry.skillName !== query.skillName) return false;
    if (query.layoutProfileId && entry.layoutProfileId !== normalizeLayoutProfileId(query.layoutProfileId)) return false;
    if (query.sourceSignature && entry.sourceSignature !== query.sourceSignature) return false;
    if (range.start2025 && entry.dateRange.start2025 !== range.start2025) return false;
    if (range.end2025 && entry.dateRange.end2025 !== range.end2025) return false;
    if (range.start2026 && entry.dateRange.start2026 !== range.start2026) return false;
    if (range.end2026 && entry.dateRange.end2026 !== range.end2026) return false;
    return true;
  });
  if (candidates[0]) return candidates[0];
  const hasRestrictiveQuery = Boolean(query.ruleId || query.skillName || query.layoutProfileId || query.sourceSignature
    || range.start2025 || range.end2025 || range.start2026 || range.end2026);
  return hasRestrictiveQuery ? null : (normalizedRegistry.history.find((entry) => entry.active !== false && (!query.module || entry.module === query.module)) || null);
};

export const updateQualitySnapshotRule = (registry = {}, ruleId = "", patch = {}) => {
  const normalizedRegistry = normalizeQualitySnapshotRegistry(registry);
  const rules = normalizedRegistry.rules.map((rule) => rule.id === ruleId ? normalizeRule({ ...rule, ...patch }, rule) : rule);
  const selectedRuleId = rules.some((rule) => rule.id === normalizedRegistry.selectedRuleId) ? normalizedRegistry.selectedRuleId : (rules.find((rule) => rule.enabled)?.id || rules[0]?.id || "iqc");
  return { ...normalizedRegistry, rules, selectedRuleId, updatedAt: nowIso() };
};

export const moduleAnalysisSkillOptions = (skills = []) => {
  const items = (Array.isArray(skills) ? skills : []).map((skill) => {
    const id = String(skill?.name || skill?.id || "").trim();
    if (!id || !/^quality-analysis-/i.test(id)) return null;
    return { id, label: String(skill?.label || skill?.title || skill?.name || skill?.id || id), content: String(skill?.content || "") };
  }).filter(Boolean);
  const unique = new Map();
  items.forEach((item) => { if (!unique.has(item.id)) unique.set(item.id, item); });
  return [...unique.values()].sort((left, right) => String(left.label).localeCompare(String(right.label), "zh-CN"));
};

export const qualitySnapshotPresentationOptions = REPORT_PRESENTATION_PROFILES.map((profile) => ({
  id: profile.id,
  label: profile.label,
  description: profile.description,
}));
