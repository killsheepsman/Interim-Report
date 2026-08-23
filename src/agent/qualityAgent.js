const AGENT_STORAGE_KEY = "qms-quality-agent-runs-v1";
const WORKFLOW_VERSION = "quality-agent-v2";

export const QUALITY_AGENT_STAGES = [
  { id: "audit", label: "Agent数据审计", local: true, maxTokens: 900 },
  { id: "analysis", label: "Agent结果与二八分析", maxTokens: 1600 },
  { id: "actions", label: "Agent责任与改善行动", maxTokens: 1800 },
  { id: "report", label: "Agent正式复盘报告", maxTokens: 2400 },
];

const now = () => new Date().toISOString();
const textSignature = (value) => {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}-${(hash >>> 0).toString(16)}`;
};
const MAX_STORED_STAGE_CHARS = 18000;
const MAX_STORED_REPORT_CHARS = 24000;
const safeJson = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};
const compactStoredRun = (run = {}) => {
  const stages = Object.fromEntries(Object.entries(run.stages || {}).map(([id, stage]) => [id, {
    status: stage?.status,
    label: stage?.label,
    startedAt: stage?.startedAt,
    completedAt: stage?.completedAt,
    retrying: stage?.retrying,
    retryReason: stage?.retryReason,
    error: stage?.error,
    evidenceValidation: stage?.evidenceValidation,
    content: String(stage?.content || "").slice(0, MAX_STORED_STAGE_CHARS),
  }]));
  return {
    workflowVersion: run.workflowVersion || WORKFLOW_VERSION,
    module: run.module,
    skillName: run.skillName,
    skillSignature: run.skillSignature,
    // Kept alongside the legacy fields so cached reports from older versions
    // remain readable. A presentation profile never changes analysis output.
    layoutProfileId: run.layoutProfileId || run.layoutSkillName || "research-briefing-v1",
    layoutSkillName: run.layoutSkillName || run.layoutProfileId || "research-briefing-v1",
    layoutSkillSignature: run.layoutSkillSignature || "",
    snapshotHash: run.snapshotHash,
    status: run.status,
    currentStage: run.currentStage,
    progress: run.progress,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    error: run.error,
    // The full deterministic snapshot is rebuilt from the current app data
    // before continuing. Never persist it in browser storage.
    snapshot: undefined,
    stages,
    actionLedger: run.actionLedger ? {
      ...run.actionLedger,
      actions: (run.actionLedger.actions || []).slice(0, 20).map((item) => ({ ...item })),
    } : undefined,
    content: String(run.content || "").slice(0, MAX_STORED_REPORT_CHARS),
  };
};
// The fixed snapshot is already aggregated locally. Keep only the fields that
// support an auditable conclusion and cap nested arrays before sending them to
// the upstream gateway. This is deliberately deterministic and never changes
// the local snapshot used for hashes or reports.
const compactValue = (value, depth = 3, limit = 12) => {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (depth <= 0) return Array.isArray(value) ? value.slice(0, limit) : Object.fromEntries(Object.entries(value).filter(([, item]) => item === null || typeof item !== "object").slice(0, 24));
  if (Array.isArray(value)) return value.slice(0, limit).map((item) => compactValue(item, depth - 1, limit));
  return Object.fromEntries(Object.entries(value).slice(0, 48).map(([key, item]) => [key, compactValue(item, depth - 1, limit)]));
};
const compactEvidenceCatalog = (catalog, limit = 20) => {
  const entries = Array.isArray(catalog?.entries) ? catalog.entries : [];
  const quotas = limit >= 24
    ? { S: 1, M: 6, O: 6, C: 6, X: 5 }
    : limit >= 20
      ? { S: 1, M: 5, O: 4, C: 4, X: 6 }
      : { S: 1, M: 2, O: 2, C: 2, X: 3 };
  const selected = [];
  const selectedIds = new Set();
  Object.entries(quotas).forEach(([prefix, quota]) => {
    entries.filter((item) => String(item?.id || "").startsWith(`${prefix}-`)).slice(0, quota).forEach((item) => {
      selected.push(item);
      selectedIds.add(item.id);
    });
  });
  entries.filter((item) => !selectedIds.has(item?.id)).slice(0, Math.max(limit - selected.length, 0)).forEach((item) => selected.push(item));
  return { ...catalog, entries: selected.slice(0, limit) };
};
const compactSnapshot = (snapshot, retry = false) => {
  const data = snapshot?.data || {};
  const compact = {
    schemaVersion: snapshot?.schemaVersion,
    module: snapshot?.module,
    moduleLabel: snapshot?.moduleLabel,
    target: snapshot?.target,
    period: snapshot?.period,
    definitions: { aiRule: snapshot?.definitions?.aiRule, moduleRule: snapshot?.definitions?.moduleRule },
    data: {
      metrics: data.metrics || {},
      localPareto: compactValue(data.localPareto, 3, retry ? 8 : 16),
      evidenceCatalog: compactValue(compactEvidenceCatalog(data.evidenceCatalog, retry ? 10 : 24), 3, retry ? 10 : 24),
      sourceAudit: compactValue(data.sourceAudit, 3, retry ? 8 : 16),
      organization: compactValue(data.organization, 3, retry ? 6 : 12),
      evidence: compactValue(data.evidence, 3, retry ? 6 : 12),
      roleEvidence: compactValue(data.roleEvidence, 3, retry ? 6 : 12),
      scope: data.scope || null,
    },
  };
  return JSON.stringify(compact).slice(0, retry ? 12000 : 24000);
};
const snapshotText = (snapshot, retry = false) => compactSnapshot(snapshot, retry);
const analysisSeed = (snapshot, retry = false) => {
  const data = snapshot?.data || {};
  const seed = {
    module: snapshot?.module,
    period: snapshot?.period,
    target: snapshot?.target,
    moduleRule: snapshot?.definitions?.moduleRule,
    metrics: data.metrics || {},
    localPareto: compactValue(data.localPareto, 3, retry ? 6 : 12),
    evidenceCatalog: compactValue(compactEvidenceCatalog(data.evidenceCatalog, retry ? 10 : 20), 3, retry ? 10 : 20),
    sourceAudit: compactValue(data.sourceAudit, 2, retry ? 6 : 12),
    organization: compactValue(data.organization, 2, retry ? 4 : 8),
    evidence: compactValue(data.evidence, 2, retry ? 4 : 8),
    scope: data.scope || null,
  };
  return JSON.stringify(seed).slice(0, retry ? 8000 : 16000);
};
// Keep the complete deterministic snapshot in the reuse key. A short prefix can
// remain unchanged after an import and incorrectly reuse an older report.
const snapshotKey = (snapshot) => JSON.stringify({ ...snapshot, generatedAt: undefined });
export const qualityAgentSnapshotHash = (snapshot) => snapshotKey(snapshot);

const modulePlaybooks = {
  IQC: "必须覆盖供应商/厂区、来料批次分母、缺陷类型和供应商改善闭环；以不良批次或不良数量解释风险，不把来料不良直接当作制程损失。重点输出高暴露供应商、集中缺陷和供应商整改证据。",
  IPQC: "必须覆盖基地、工坊、送检量、异常数、异常密度、异常类型及外包/自制差异；先判断异常密度是否恶化，再解释异常发现量变化。重点输出工坊过程拦截和重复问题的责任动作。",
  OQC: "必须覆盖产品部、TPM/项目、样本量、平均分、5分率、低分率和发货门禁；样本不足时标记待核实，不以小样本强行排名。重点输出低分客户/现场风险和出货前控制动作。",
  DQA: "必须并列分析研发问题、设计评审、ECN、非BOM及产品部/TPM责任；区分源头设计缺陷、后端暴露和变更执行问题，不能只按问题数量排名。",
  QMS: "必须覆盖客户满意度总体指标、低分率、客户意见主题、严重度、重复性、产品部和TPM归属；客户意见文字是独立证据，必须给出关闭证据和客户反馈回路。",
};

const moduleResponsibilityChains = {
  IQC: "公司→基地/厂区→供应商→采购/SQE责任对象（仅在映射存在时）",
  IPQC: "公司→深圳/杭州基地→工坊/交付经理；机长和送检人作为下钻证据",
  OQC: "公司→产品部→TPM→项目/客户",
  DQA: "公司→产品部→TPM→PM→研发工程师；无个人字段时不得下钻",
  QMS: "客户声音→公司→产品部→TPM/项目→责任对象（仅在映射存在时）",
};

export const loadQualityAgentRuns = () => {
  if (typeof localStorage === "undefined") return {};
  const parsed = safeJson(localStorage.getItem(AGENT_STORAGE_KEY) || "{}", {});
  const recovered = Object.fromEntries(Object.entries(parsed || {}).map(([module, rawRun]) => {
    const run = compactStoredRun(rawRun || {});
    const currentStage = run?.currentStage || "analysis";
    const staleStage = run?.stages?.[currentStage]?.status === "running";
    if (!run || (run.status !== "running" && !staleStage)) return [module, run];
    const stages = { ...(run.stages || {}) };
    if (stages[currentStage]?.status === "running") {
      stages[currentStage] = {
        ...stages[currentStage],
        status: "error",
        error: "上次页面关闭或连接中断，未继续执行；请点击继续 Agent 分析。",
      };
    }
    return [module, {
      ...run,
      status: "error",
      error: "上次 Agent 请求在页面刷新或连接中断时停止，已完成阶段保留，可继续分析。",
      currentStage,
      stages,
    }];
  }));
  const serialized = JSON.stringify(recovered);
  if (serialized !== JSON.stringify(parsed)) localStorage.setItem(AGENT_STORAGE_KEY, serialized);
  return recovered;
};

export const saveQualityAgentRuns = (runs) => {
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(runs || {}).map(([module, run]) => [module, compactStoredRun(run)])))); } catch {}
  }
  return runs;
};

const auditMetricValue = (value) => Number(value && typeof value === "object" && "value" in value ? value.value : value);
const validNumber = (value) => Number.isFinite(auditMetricValue(value));
const periodDate = (value) => {
  const parsed = new Date(`${value || ""}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const auditReconciliation = (module, metrics) => {
  const checks = [];
  if (module === "IQC" && numberForAudit(metrics.inspectedBatches2026) > 0 && validNumber(metrics.batchYield2026)) {
    const denominator = numberForAudit(metrics.inspectedBatches2026);
    const expected = Number(((denominator - numberForAudit(metrics.issueCount2026)) / denominator * 100).toFixed(1));
    const actual = auditMetricValue(metrics.batchYield2026);
    checks.push({ name: "IQC批次良率内部对账", expected, actual, difference: Number(Math.abs(expected - actual).toFixed(2)), tolerance: 0.2 });
  }
  if (module === "IPQC" && numberForAudit(metrics.inspectedQuantity2026) > 0 && validNumber(metrics.issueDensity2026)) {
    const expected = Number((numberForAudit(metrics.issueCount2026) / numberForAudit(metrics.inspectedQuantity2026) * 100).toFixed(2));
    const actual = auditMetricValue(metrics.issueDensity2026);
    checks.push({ name: "IPQC异常密度内部对账", expected, actual, difference: Number(Math.abs(expected - actual).toFixed(3)), tolerance: 0.03 });
  }
  if (module === "DQA" && [metrics.backendIssues2026, metrics.reviewIssues2026, metrics.totalIssues2026].every(validNumber)) {
    const expected = numberForAudit(metrics.backendIssues2026) + numberForAudit(metrics.reviewIssues2026);
    const actual = numberForAudit(metrics.totalIssues2026);
    checks.push({ name: "DQA问题总数内部对账", expected, actual, difference: Math.abs(expected - actual), tolerance: 0 });
  }
  return checks.map((check) => ({ ...check, status: check.difference <= check.tolerance ? "通过" : "不一致" }));
};
const numberForAudit = (value) => {
  const parsed = auditMetricValue(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const buildAgentAuditResult = (snapshot) => {
  const blockers = [];
  const materialIssues = [];
  const warnings = [];
  const metrics = snapshot?.data?.metrics || {};
  const sourceAudit = snapshot?.data?.sourceAudit || {};
  const start2026 = periodDate(snapshot?.period?.start2026);
  const end2026 = periodDate(snapshot?.period?.end2026);
  if (!start2026 || !end2026) blockers.push("2026统计周期未完整设置或日期无效");
  else if (start2026 > end2026) blockers.push("2026统计开始日期晚于结束日期");
  const start2025 = snapshot?.period?.start2025 ? periodDate(snapshot.period.start2025) : null;
  const end2025 = snapshot?.period?.end2025 ? periodDate(snapshot.period.end2025) : null;
  if (Boolean(start2025) !== Boolean(end2025)) materialIssues.push("2025同期日期只设置了开始或结束日期，不能进行同期比较");
  else if (start2025 && start2025 > end2025) blockers.push("2025统计开始日期晚于结束日期");
  if (!Object.keys(metrics).length) blockers.push("当前模块没有可用指标");
  if (!sourceAudit.sourceFileCount) blockers.push(`${snapshot.module}没有真实来源文件，禁止使用示例数据生成正式报告`);
  if (!sourceAudit.totalRows) blockers.push(`${snapshot.module}来源文件没有可用记录`);
  const requiredByModule = {
    IQC: ["batchYield2026", "supplierCount", "issueCount2026"],
    IPQC: ["issueDensity2026", "inspectedQuantity2026", "issueCount2026"],
    OQC: ["fiveRate2026", "sampleCount2026", "lowRate2026"],
    DQA: ["backendIssues2026", "reviewIssues2026", "totalIssues2026"],
    QMS: ["currentPeriod", "riskCount", "suggestionCount"],
  };
  const missing = (value) => value === undefined || value === null || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
  (requiredByModule[snapshot.module] || []).filter((key) => missing(metrics[key])).forEach((key) => blockers.push(`${snapshot.module}缺少必备指标：${key}`));
  if (sourceAudit.emptyFiles?.length) warnings.push(`存在空文件：${sourceAudit.emptyFiles.join("、")}`);
  if (sourceAudit.duplicateFiles?.length) materialIssues.push(`发现疑似重复导入文件：${sourceAudit.duplicateFiles.map((item) => `${item.name}×${item.count}`).join("、")}`);
  const dateCoverage = sourceAudit.dateCoverage || {};
  if (!dateCoverage.available) warnings.push("当前来源未加载可核查的日期字段，日期覆盖范围只能依赖固定统计引擎");
  else if (dateCoverage.rate < 80) materialIssues.push(`有效日期覆盖率仅${dateCoverage.rate}%，周期结论受限`);
  else if (dateCoverage.rate < 95) warnings.push(`有效日期覆盖率为${dateCoverage.rate}%，存在缺失日期记录`);
  const mapping = sourceAudit.mapping || {};
  if (mapping.total > 0 && mapping.rate < 80) materialIssues.push(`${mapping.dimension}映射完整率仅${mapping.rate}%`);
  else if (mapping.total > 0 && mapping.rate < 95) warnings.push(`${mapping.dimension}映射完整率为${mapping.rate}%`);
  else if (!mapping.total) warnings.push(`${mapping.dimension || "组织"}没有可核查的映射对象`);
  const reconciliation = auditReconciliation(snapshot.module, metrics);
  reconciliation.filter((item) => item.status === "不一致").forEach((item) => blockers.push(`${item.name}不一致：快照=${item.actual}，按固定分子分母核对=${item.expected}`));
  if (snapshot.module === "OQC") {
    if (numberForAudit(metrics.sampleCount2026) <= 0) blockers.push("OQC样本量为0，不能分析评分和比例");
    ["fiveRate2026", "lowRate2026"].forEach((key) => {
      const value = auditMetricValue(metrics[key]);
      if (Number.isFinite(value) && (value < 0 || value > 100)) blockers.push(`OQC指标${key}超出0—100%范围`);
    });
  }
  const localPareto = snapshot?.data?.localPareto || {};
  const expectedProblemCount = snapshot.module === "IQC" || snapshot.module === "IPQC"
    ? numberForAudit(metrics.issueCount2026)
    : snapshot.module === "DQA" ? numberForAudit(metrics.totalIssues2026) : null;
  if (expectedProblemCount > 0 && !numberForAudit(localPareto.totalWeight)) materialIssues.push("固定快照存在问题数量，但本地Pareto没有形成事件；二八结论不可用");
  if (localPareto.coverage?.missingDateRows > 0) warnings.push(`本地Pareto有${localPareto.coverage.missingDateRows}条记录缺少日期，未纳入当前周期`);
  const grade = blockers.length ? "D" : materialIssues.length ? "C" : warnings.length ? "B" : "A";
  return {
    title: "质量分析 Agent · 数据审计",
    grade,
    status: grade === "D" ? "阻止分析" : grade === "C" ? "有限使用" : "通过",
    blocked: grade === "D",
    blockers,
    materialIssues,
    warnings,
    sourceSummary: {
      sourceFileCount: sourceAudit.sourceFileCount || 0,
      mappingFileCount: sourceAudit.mappingFileCount || 0,
      totalRows: sourceAudit.totalRows || 0,
      loadedRows: sourceAudit.loadedRows || 0,
      dateCoverage,
      mapping,
    },
    reconciliation,
    paretoSummary: {
      engine: localPareto.engine || "未生成",
      unit: localPareto.unit || "",
      eventCount: localPareto.eventCount || 0,
      totalWeight: localPareto.totalWeight || 0,
      organizationCount: localPareto.organizationPareto?.length || 0,
      mechanismCount: localPareto.mechanismPareto?.length || 0,
      crossThemeCount: localPareto.crossThemes?.length || 0,
    },
    metricKeys: Object.keys(metrics),
    rules: snapshot.definitions,
    source: "固定统计引擎输出，不由模型重新计算",
  };
};
export const buildAgentAudit = (snapshot) => JSON.stringify(buildAgentAuditResult(snapshot), null, 2);

const systemPrompt = `你是质量分析 Agent，不是聊天助手。你只能解释输入的固定统计结果，不能修改、重算或臆造数据。事实结论必须引用 evidenceCatalog 中真实存在的证据编号；合理推断和待验证假设必须与事实分开，并写验证方法、验证角色和期限。输出要服务于质量闭环，使用“结果—过程—根因—责任—行动”结构，不添加以管理者身份命名的判断标签。`;

const validateEvidenceReferences = (content, snapshot, stage) => {
  if (stage === "audit") return { status: "not-required", references: [], invalid: [], message: "本地审计无需模型引用" };
  const allowed = new Set((snapshot?.data?.evidenceCatalog?.entries || []).map((item) => item.id));
  const pattern = /(?:S|M|O|C|X)-(?:IQC|IPQC|OQC|DQA|QMS)-\d{3}/g;
  const references = [...new Set(String(content || "").match(pattern) || [])];
  const invalid = references.filter((id) => !allowed.has(id));
  if (!allowed.size) return { status: "warning", references, invalid, message: "当前快照没有本地证据目录" };
  if (!references.length) return { status: "warning", references, invalid, message: "本阶段没有引用本地证据编号" };
  if (invalid.length) return { status: "warning", references, invalid, message: `引用了不存在的证据编号：${invalid.join("、")}` };
  return { status: "pass", references, invalid: [], message: `已核验${references.length}个证据编号` };
};

export const validateQualityAgentStageGate = ({ stage, record, snapshot, content }) => {
  const evidenceValidation = validateEvidenceReferences(content, snapshot, stage);
  const issues = [];
  if (stage === "analysis") {
    const conclusions = [...new Set(String(content || "").match(new RegExp(`K-${snapshot.module}-\\d{3}`, "g")) || [])];
    if (evidenceValidation.status !== "pass") issues.push(evidenceValidation.message);
    if (!conclusions.length) issues.push("二八分析缺少 K-模块-序号 结论编号");
    return { blocked: issues.length > 0, message: issues.join("；"), evidenceValidation, conclusions };
  }
  if (stage === "actions") {
    const analysis = record?.stages?.analysis;
    if (analysis?.status !== "done") issues.push("二八分析未完成");
    if (analysis?.evidenceValidation?.status !== "pass") issues.push("二八分析证据未通过校验");
    if (record?.actionLedger?.status !== "ready") issues.push(record?.actionLedger?.message || "行动台账不可复查");
    if (evidenceValidation.status !== "pass") issues.push(evidenceValidation.message);
    return { blocked: issues.length > 0, message: issues.join("；"), evidenceValidation };
  }
  if (stage === "report") {
    const analysis = record?.stages?.analysis;
    const actions = record?.stages?.actions;
    if (analysis?.status !== "done" || analysis?.evidenceValidation?.status !== "pass") issues.push("二八分析证据门禁未通过");
    if (actions?.status !== "done" || record?.actionLedger?.status !== "ready") issues.push("责任与改善行动门禁未通过");
    if (evidenceValidation.status !== "pass") issues.push(evidenceValidation.message);
    return { blocked: issues.length > 0, message: issues.join("；"), evidenceValidation };
  }
  return { blocked: false, message: "", evidenceValidation };
};

const actionMetricValue = (value) => {
  const parsed = Number(value && typeof value === "object" && "value" in value ? value.value : value);
  return Number.isFinite(parsed) ? parsed : null;
};
const actionDate = (value) => {
  const parsed = new Date(`${String(value || "").slice(0, 10)}T23:59:59`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const targetReached = (value, target, direction) => value !== null && target !== null && (direction === "gte" ? value >= target : value <= target);
const reopenReached = (value, threshold, direction) => value !== null && threshold !== null && (direction === "gte" ? value < threshold : value > threshold);
const retryableAiError = (error) => /\b(?:429|502|503|504)\b|too many requests|rate limit|网关超时|gateway timeout|timed? ?out|service unavailable|bad gateway/i.test(String(error?.message || error || ""));
const retryDelayMs = (error) => /\b429\b|too many requests|rate limit/i.test(String(error?.message || error || "")) ? 300000 : 1200;
const waitForRetry = (delay, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, delay);
  if (!signal) return;
  signal.addEventListener("abort", () => {
    clearTimeout(timer);
    reject(new DOMException("Aborted", "AbortError"));
  }, { once: true });
});
const throwIfAborted = (signal) => {
  if (!signal?.aborted) return;
  const error = new Error("已停止本次 Agent 分析");
  error.name = "AbortError";
  throw error;
};
const extractActionLedger = (content, snapshot, previousLedger) => {
  const pattern = /<ACTION_LEDGER_JSON>\s*([\s\S]*?)\s*<\/ACTION_LEDGER_JSON>/i;
  const matched = String(content || "").match(pattern);
  const cleanContent = String(content || "").replace(pattern, "").trim();
  if (!matched) return { content: cleanContent, ledger: { schemaVersion: "quality-action-ledger-v1", status: "warning", message: "模型未返回结构化行动台账", generatedAt: now(), actions: [] } };
  try {
    const parsed = JSON.parse(matched[1]);
    const sourceActions = Array.isArray(parsed) ? parsed : parsed?.actions;
    if (!Array.isArray(sourceActions) || !sourceActions.length) throw new Error("行动数组为空");
    const metrics = snapshot?.data?.metrics || {};
    const metricKeys = new Set(Object.keys(metrics));
    const evidenceIds = new Set((snapshot?.data?.evidenceCatalog?.entries || []).map((item) => item.id));
    const previousById = new Map((previousLedger?.actions || []).map((item) => [item.id, item]));
    const actions = sourceActions.slice(0, 20).map((raw, index) => {
      const id = new RegExp(`^A-${snapshot.module}-\\d{3}$`).test(String(raw?.id || "")) ? String(raw.id) : `A-${snapshot.module}-${String(index + 1).padStart(3, "0")}`;
      const metricKey = metricKeys.has(String(raw?.metricKey || "")) ? String(raw.metricKey) : "";
      const currentValue = metricKey ? actionMetricValue(metrics[metricKey]) : null;
      const target = actionMetricValue(raw?.target);
      const reopenThreshold = actionMetricValue(raw?.reopenThreshold);
      const direction = raw?.direction === "gte" ? "gte" : "lte";
      const action = String(raw?.action || raw?.measure || "").trim().slice(0, 500);
      const conclusionId = String(raw?.conclusionId || "").trim().slice(0, 40);
      const identitySignature = textSignature(`${conclusionId}::${action}::${metricKey}`);
      const previous = previousById.get(id);
      const samePrevious = previous?.identitySignature === identitySignature;
      const previousClosed = previous?.status === "closed" && samePrevious;
      const reopened = previousClosed && reopenReached(currentValue, reopenThreshold, direction);
      const met = targetReached(currentValue, target, direction);
      const overdue = Boolean(actionDate(raw?.reviewDate || raw?.dueDate) && actionDate(raw?.reviewDate || raw?.dueDate) < new Date());
      const status = reopened ? "reopened" : previousClosed ? "closed" : met ? "verification-ready" : overdue ? "overdue" : "in-progress";
      const rawReferences = Array.isArray(raw?.evidenceIds) ? raw.evidenceIds : String(raw?.evidenceIds || "").match(/(?:S|M|O|C|X)-(?:IQC|IPQC|OQC|DQA|QMS)-\d{3}/g) || [];
      return {
        id, conclusionId, identitySignature,
        riskLevel: String(raw?.riskLevel || "待核实").slice(0, 20),
        phase: String(raw?.phase || "待安排").slice(0, 20),
        action,
        mechanism: String(raw?.mechanism || "").trim().slice(0, 500),
        owner: String(raw?.owner || "待指定").trim().slice(0, 120),
        collaborators: String(raw?.collaborators || "").trim().slice(0, 160),
        dueDate: String(raw?.dueDate || "").slice(0, 10),
        reviewDate: String(raw?.reviewDate || raw?.dueDate || "").slice(0, 10),
        deliverable: String(raw?.deliverable || "").trim().slice(0, 300),
        evidenceLocation: String(raw?.evidenceLocation || "").trim().slice(0, 300),
        evidenceIds: [...new Set(rawReferences.filter((idValue) => evidenceIds.has(idValue)))],
        metricKey,
        baseline: samePrevious ? previous.baseline : currentValue,
        currentValue,
        target,
        direction,
        reopenThreshold,
        closeCriteria: String(raw?.closeCriteria || "").trim().slice(0, 500),
        fallback: String(raw?.fallback || "").trim().slice(0, 300),
        status,
        statusReason: reopened ? "关闭后指标触发重开阈值" : previousClosed ? "已人工核验关闭，等待后续周期复查" : met ? "指标达到阈值，仍需核验关闭证据" : overdue ? "已到复查日期但未达到阈值" : "按计划执行并等待复查",
        closureEvidence: previousClosed ? previous.closureEvidence : "",
        closedAt: previousClosed ? previous.closedAt : "",
      };
    });
    const incomplete = actions.filter((item) => !item.action || !item.conclusionId || !item.owner || !item.reviewDate || !item.closeCriteria || !item.evidenceIds.length).map((item) => item.id);
    const status = incomplete.length ? "warning" : "ready";
    const message = incomplete.length ? `行动台账字段不完整：${incomplete.join("、")}` : `已生成${actions.length}项可复查行动`;
    return { content: cleanContent, ledger: { schemaVersion: "quality-action-ledger-v1", status, message, generatedAt: now(), lastReviewedAt: now(), actions } };
  } catch (error) {
    return { content: cleanContent, ledger: { schemaVersion: "quality-action-ledger-v1", status: "warning", message: `结构化行动台账解析失败：${error.message}`, generatedAt: now(), actions: [] } };
  }
};

export const closeQualityAgentAction = (run, actionId, closureEvidence) => {
  const evidence = String(closureEvidence || "").trim();
  if (!evidence) throw new Error("必须填写关闭证据位置或编号");
  const actions = (run?.actionLedger?.actions || []).map((item) => {
    if (item.id !== actionId) return item;
    if (item.status !== "verification-ready") throw new Error("当前指标尚未达到验收阈值，不能关闭");
    return { ...item, status: "closed", statusReason: "已人工核验指标与关闭证据", closureEvidence: evidence.slice(0, 500), closedAt: now() };
  });
  if (!actions.some((item) => item.id === actionId)) throw new Error("未找到对应行动");
  return { ...run, actionLedger: { ...run.actionLedger, lastReviewedAt: now(), actions } };
};

const stagePrompt = ({ stage, snapshot, outputs, skillName, skillContent, retry = false }) => {
  const completedOutputs = Object.fromEntries(Object.entries(outputs || {})
    .filter(([, value]) => value?.status === "done" && value.content)
    .map(([id, value]) => [id, { content: String(value.content).slice(0, stage === "report" ? (retry ? 9000 : 14000) : (retry ? 6000 : 9000)) }]));
  const isAnalysis = stage === "analysis";
  const dataText = isAnalysis ? analysisSeed(snapshot, retry) : snapshotText(snapshot, retry);
  const skillText = String(skillContent || "").slice(0, isAnalysis ? (retry ? 2800 : 5500) : (retry ? 7000 : 12000));
  const common = `模块技能：${skillName || "quality-analysis-core"}\n核心与模块规则：\n${skillText}\n模块：${snapshot.module}\n模块专项规则：${snapshot.definitions?.moduleRule || "按固定快照分析"}\n模块分析作业要求：${modulePlaybooks[snapshot.module] || "按固定快照中的组织、指标和证据分析"}\n模块责任链：${moduleResponsibilityChains[snapshot.module] || "按输入中的有效组织映射分层"}\n证据卡规则：事实必须引用 evidenceCatalog 的 S/M/O/C/X 编号；合理推断和待验证假设不得伪装成事实，必须写验证方法、验证角色和期限。\n目标角色：${snapshot.target?.role || "公司级"}\n目标收件人：${snapshot.target?.recipient || "待指定"}\n周期：${JSON.stringify(snapshot.period)}\n${isAnalysis ? "首次分析数据摘要" : "固定数据摘要"}（由本地统计引擎生成，不要重新计算）：\n${dataText}\n已完成Agent阶段摘要（仅引用，不重复计算）：\n${JSON.stringify(completedOutputs)}`;
  if (stage === "analysis") return `${common}\n请完成 Agent结果与二八分析：直接引用固定数据摘要中的 localPareto，区分结果指标和问题暴露量，解释TOP组织、TOP机制及其交叉主题。不得根据截断数组重新排序、重算占比或改变名次；localPareto没有事件时明确写“无法形成Pareto”。Pareto表示问题贡献集中度，不等同于绩效排名。形成3—5张证据卡，每张包含：结论ID（K-${snapshot.module}-三位序号）、证据等级、证据编号、事实、合理推断/待验证假设、验证方法、验证角色、验证期限。输出结构化 Markdown。`;
  if (stage === "actions") return `${common}\n请完成 Agent责任与改善行动：沿用前序K结论ID和证据编号，严格按上述模块责任链拆解责任，给出风险等级、根因证据、30/60/90天行动、责任对象、完成期限、验证指标和关闭条件。没有人员字段或映射证据时不得用上级字段替代，必须写待核实。正文之后必须追加一个且仅一个 <ACTION_LEDGER_JSON>{"actions":[...]}</ACTION_LEDGER_JSON> 数据块；每项包含 id（A-${snapshot.module}-三位序号）、conclusionId、riskLevel、phase、action、mechanism、owner、collaborators、dueDate、reviewDate、deliverable、evidenceLocation、evidenceIds、metricKey、target、direction（lte或gte）、reopenThreshold、closeCriteria、fallback。metricKey只能从固定快照 metrics 的真实键中选择，无法对应时留空；不要把培训、会议或提醒单独作为永久措施。`;
  return `${common}\n请完成 Agent正式复盘报告：汇总审计、结果、过程、根因、责任和行动，输出管理层可直接审核的报告。正文保留K结论ID和证据等级，但不要逐条展示 S/M/O/C/X 证据编号，不要出现“证据编号：...”列表，不要写“REPORT_VISUAL_SPEC_JSON”标题；若需要机器图表契约，只能在全文最后直接追加标签数据块供系统读取。把“过程断点与根因证据”写成“数据表现→过程判断→具体动作→验证口径”，少用“推断/假设”字样；无法证实的内容改写为“待现场核验项”，并同时给出验证动作、责任人和期限。所有数字必须来自固定快照或前序Agent结果，禁止添加未经证据支持的数字。`;
};

export const runQualityAgent = async ({ snapshot, skillName, skillContent, layoutProfileId = "research-briefing-v1", existing, requestChat, signal, onUpdate = () => {} } = {}) => {
  if (!snapshot) throw new Error("缺少质量分析 Agent 数据快照");
  throwIfAborted(signal);
  const currentSnapshotHash = snapshotKey(snapshot);
  const currentSkillSignature = textSignature(`${skillName || ""}::${String(skillContent || "")}`);
  const legacySnapshotHash = currentSnapshotHash.slice(0, 80);
  const sameSnapshot = existing?.snapshotHash === currentSnapshotHash || existing?.snapshotHash === legacySnapshotHash;
  const previousActionLedger = existing?.actionLedger;
  const canReuseAnalysis = sameSnapshot && existing?.workflowVersion === WORKFLOW_VERSION && existing?.skillName === skillName && existing?.skillSignature === currentSkillSignature;
  let record = canReuseAnalysis
    ? { ...existing, stages: { ...(existing.stages || {}) } }
    : { workflowVersion: WORKFLOW_VERSION, snapshotHash: currentSnapshotHash, module: snapshot.module, skillName, skillSignature: currentSkillSignature, snapshot, startedAt: now(), stages: {} };
  record.snapshot = snapshot;
  record.snapshotHash = currentSnapshotHash;
  record.skillSignature = currentSkillSignature;
  record.layoutProfileId = layoutProfileId || "research-briefing-v1";
  record.layoutSkillName = record.layoutProfileId;
  record.layoutSkillSignature = "";
  record.status = "running";
  record.progress = record.progress || { percent: 0, phase: "准备分析", detail: "正在准备固定数据快照" };
  onUpdate(record);
  for (const [stageIndex, stage] of QUALITY_AGENT_STAGES.entries()) {
    throwIfAborted(signal);
    if (record.stages?.[stage.id]?.status === "done" && record.stages[stage.id].content) continue;
    record.currentStage = stage.id;
    record.progress = { percent: Math.round((stageIndex / QUALITY_AGENT_STAGES.length) * 100), phase: stage.label, detail: `正在执行：${stage.label}` };
    record.stages = { ...record.stages, [stage.id]: { status: "running", label: stage.label, startedAt: now() } };
    onUpdate(record);
    try {
      let content;
      let requestTrace = {};
      if (stage.local) {
        const auditResult = buildAgentAuditResult(snapshot);
        content = JSON.stringify(auditResult, null, 2);
        if (auditResult.blocked) {
          record.stages = { ...record.stages, [stage.id]: { ...record.stages[stage.id], content } };
          throw new Error(`数据审计为D级，已阻止在线分析：${auditResult.blockers.join("；")}`);
        }
      } else {
        const requestStage = async (retry = false, stream = false, responses = false) => {
          throwIfAborted(signal);
          const prompt = stagePrompt({ stage: stage.id, snapshot, outputs: record.stages, skillName, skillContent, retry });
          const response = await requestChat([
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ], { max_tokens: retry ? Math.min(stage.maxTokens, 1600) : stage.maxTokens, agent: true, stream, responses, signal });
          if (response?.model) record.model = String(response.model);
          requestTrace = { promptFingerprint: textSignature(`${systemPrompt}\n${prompt}`), retry, stream, responses, usage: response?.usage || null };
          return response.content;
        };
        try {
          content = await requestStage(false);
        } catch (firstError) {
          const upstreamTimeout = retryableAiError(firstError);
          if (!upstreamTimeout || signal?.aborted) throw firstError;
          const firstDelay = retryDelayMs(firstError);
          record.stages = { ...record.stages, [stage.id]: { ...record.stages[stage.id], retrying: true, retryReason: `上游暂不可用，${Math.round(firstDelay / 1000)} 秒后压缩请求重试` } };
          onUpdate(record);
          await waitForRetry(firstDelay, signal);
          try {
            content = await requestStage(true);
          } catch (secondError) {
            const secondTimeout = retryableAiError(secondError);
            if (!secondTimeout || signal?.aborted) throw secondError;
            const secondDelay = retryDelayMs(secondError);
            record.stages = { ...record.stages, [stage.id]: { ...record.stages[stage.id], retrying: true, retryReason: `上游仍不可用，${Math.round(secondDelay / 1000)} 秒后改用流式输出重试` } };
            onUpdate(record);
            await waitForRetry(secondDelay, signal);
            try {
              content = await requestStage(true, true, true);
            } catch (thirdError) {
              // If this gateway does not expose /responses, retain the useful
              // upstream timeout instead of replacing it with a fallback 404.
              const unsupportedResponses = /404|not supported|unknown endpoint|不存在|不支持/i.test(String(thirdError?.message || ""));
              throw unsupportedResponses ? secondError : thirdError;
            }
          }
        }
      }
      if (!String(content || "").trim()) throw new Error(`${stage.label}未返回有效内容`);
      if (stage.id === "actions") {
        const extracted = extractActionLedger(content, snapshot, previousActionLedger);
        content = extracted.content;
        record.actionLedger = extracted.ledger;
      }
      const gate = validateQualityAgentStageGate({ stage: stage.id, record, snapshot, content });
      const evidenceValidation = gate.evidenceValidation;
      if (gate.blocked) {
        record.status = "error";
        record.error = `${stage.label}门禁未通过：${gate.message}`;
        record.stages = { ...record.stages, [stage.id]: { ...record.stages[stage.id], status: "error", label: stage.label, content: String(content).trim(), completedAt: now(), evidenceValidation, gate, trace: { snapshotFingerprint: textSignature(currentSnapshotHash), skillFingerprint: currentSkillSignature, outputFingerprint: textSignature(content), ...requestTrace } } };
        record.progress = { ...record.progress, phase: `${stage.label}门禁未通过`, detail: record.error };
        onUpdate(record);
        return record;
      }
      if (stage.id === "report") {
        const restrictions = [];
        if (evidenceValidation.status === "warning") restrictions.push(`证据引用完整性待复核：${evidenceValidation.message}。本报告在补齐并核验本地证据编号前，不得把相关推断作为已证实事实发布。`);
        if (record.actionLedger?.status !== "ready") restrictions.push(`行动台账不可自动复查：${record.actionLedger?.message || "尚未生成结构化行动台账"}。需补齐责任、指标、阈值、复查日期和重开条件。`);
        if (restrictions.length) content = `${String(content).trim()}\n\n## 发布限制\n\n${restrictions.map((item) => `- ${item}`).join("\n")}`;
      }
      record.stages = { ...record.stages, [stage.id]: { status: "done", label: stage.label, content: String(content).trim(), completedAt: now(), evidenceValidation, gate, trace: { snapshotFingerprint: textSignature(currentSnapshotHash), skillFingerprint: currentSkillSignature, outputFingerprint: textSignature(content), ...requestTrace } } };
      record.progress = { percent: Math.round(((stageIndex + 1) / QUALITY_AGENT_STAGES.length) * 100), phase: stage.label, detail: `${stage.label}已完成，准备进入下一阶段` };
      onUpdate(record);
    } catch (error) {
      record.status = "error";
      const stopped = error?.name === "AbortError" || signal?.aborted;
      record.error = stopped ? "已停止本次 Agent 分析，已完成阶段保留，可继续。" : error.message;
      record.stages = { ...record.stages, [stage.id]: { ...(record.stages[stage.id] || {}), status: "error", error: record.error } };
      record.progress = { ...record.progress, phase: `${stage.label}失败`, detail: record.error };
      onUpdate(record);
      return record;
    }
  }
  record.status = "done";
  record.currentStage = "";
  record.content = record.stages.report?.content || "";
  record.completedAt = now();
  record.progress = { percent: 100, phase: "已完成", detail: "质量分析 Agent 报告已生成并保存到本地缓存" };
  onUpdate(record);
  return record;
};
