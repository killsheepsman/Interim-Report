const AGENT_STORAGE_KEY = "qms-quality-agent-runs-v1";

export const QUALITY_AGENT_STAGES = [
  { id: "audit", label: "Agent数据审计", local: true, maxTokens: 900 },
  // These stages require tables, evidence grades, and action fields. The old
  // 1800-token cap caused compatible Responses gateways to end with an
  // incomplete message and no extractable assistant content.
  { id: "analysis", label: "Agent结果与二八分析", maxTokens: 4500 },
  { id: "actions", label: "Agent责任与改善行动", maxTokens: 3500 },
  { id: "report", label: "Agent正式复盘报告", maxTokens: 5000 },
];

const now = () => new Date().toISOString();
const safeJson = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};
// Agent snapshots are already produced from the fixed analytics cache. Keep a
// bounded compact payload so each stage does not resend a large pretty-printed
// object through the browser and upstream gateway.
const snapshotText = (snapshot) => JSON.stringify(snapshot).slice(0, 60000);
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

export const loadQualityAgentRuns = () => {
  if (typeof localStorage === "undefined") return {};
  const parsed = safeJson(localStorage.getItem(AGENT_STORAGE_KEY) || "{}", {});
  const recovered = Object.fromEntries(Object.entries(parsed || {}).map(([module, run]) => {
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
  if (JSON.stringify(recovered) !== JSON.stringify(parsed)) localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(recovered));
  return recovered;
};

export const saveQualityAgentRuns = (runs) => {
  if (typeof localStorage !== "undefined") localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(runs));
  return runs;
};

export const buildAgentAudit = (snapshot) => {
  const issues = [];
  const metrics = snapshot?.data?.metrics || {};
  if (!snapshot?.period?.start2026 || !snapshot?.period?.end2026) issues.push("统计周期未完整设置");
  if (!Object.keys(metrics).length) issues.push("当前模块没有可用指标");
  const requiredByModule = {
    IQC: ["batchYield2026", "supplierCount", "issueCount2026"],
    IPQC: ["issueDensity2026", "inspectedQuantity2026", "issueCount2026"],
    OQC: ["fiveRate2026", "sampleCount2026", "lowRate2026"],
    DQA: ["backendIssues2026", "reviewIssues2026", "totalIssues2026"],
    QMS: ["currentPeriod", "riskCount", "suggestionCount"],
  };
  const missing = (value) => value === undefined || value === null || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
  (requiredByModule[snapshot.module] || []).filter((key) => missing(metrics[key])).forEach((key) => issues.push(`${snapshot.module}缺少必备指标：${key}`));
  return JSON.stringify({
    title: "质量分析 Agent · 数据审计",
    status: issues.length ? "待核实" : "通过",
    issues,
    rules: snapshot.definitions,
    source: "固定统计引擎输出，不由模型重新计算",
  }, null, 2);
};

const systemPrompt = `你是质量分析 Agent，不是聊天助手。你只能解释输入的固定统计结果，不能修改、重算或臆造数据。所有结论必须引用输入中的组织、指标或证据；证据不足时写“待核实”。输出要服务于质量闭环，使用“结果—过程—根因—责任—行动”结构。不要输出“质量总监判断”这几个字。`;

const stagePrompt = ({ stage, snapshot, outputs, skillName, skillContent }) => {
  const completedOutputs = Object.fromEntries(Object.entries(outputs || {})
    .filter(([, value]) => value?.status === "done" && value.content)
    .map(([id, value]) => [id, { content: String(value.content).slice(0, stage === "report" ? 24000 : 18000) }]));
  const common = `技能：${skillName || "generate-quality-review-report"}\n技能内容：\n${String(skillContent || "").slice(0, 30000)}\n模块：${snapshot.module}\n模块专项规则：${snapshot.definitions?.moduleRule || "按固定快照分析"}\n模块分析作业要求：${modulePlaybooks[snapshot.module] || "按固定快照中的组织、指标和证据分析"}\n目标角色：${snapshot.target?.role || "公司级"}\n目标收件人：${snapshot.target?.recipient || "待指定"}\n周期：${JSON.stringify(snapshot.period)}\n固定数据快照：\n${snapshotText(snapshot)}\n已完成Agent阶段（仅引用，不重复计算）：\n${JSON.stringify(completedOutputs)}`;
  if (stage === "analysis") return `${common}\n请完成 Agent结果与二八分析：区分结果指标和问题暴露量，识别TOP组织、TOP机制、阶段分布和数据集中度。输出结构化 Markdown，重点内容使用清晰的小标题和表格。`;
  if (stage === "actions") return `${common}\n请完成 Agent责任与改善行动：按公司→产品部→TPM/PM/工程师层级拆解责任，给出风险等级、根因证据、30/60/90天行动、责任对象、完成期限、验证指标和关闭条件。没有个人字段时不得用上级字段代替。`;
  return `${common}\n请完成 Agent正式复盘报告：汇总审计、结果、过程、根因、责任和行动，输出管理层可直接审核的报告。所有数字必须来自固定快照或前序Agent结果，禁止添加未经证据支持的数字。`;
};

export const runQualityAgent = async ({ snapshot, skillName, skillContent, existing, requestChat, signal, onUpdate = () => {} } = {}) => {
  if (!snapshot) throw new Error("缺少质量分析 Agent 数据快照");
  const currentSnapshotHash = snapshotKey(snapshot);
  const legacySnapshotHash = currentSnapshotHash.slice(0, 80);
  const sameSnapshot = existing?.snapshotHash === currentSnapshotHash || existing?.snapshotHash === legacySnapshotHash;
  let record = sameSnapshot && existing?.workflowVersion === "quality-agent-v1" && existing?.skillName === skillName
    ? { ...existing, stages: { ...(existing.stages || {}) } }
    : { workflowVersion: "quality-agent-v1", snapshotHash: currentSnapshotHash, module: snapshot.module, skillName, snapshot, startedAt: now(), stages: {} };
  record.snapshot = snapshot;
  record.snapshotHash = currentSnapshotHash;
  record.status = "running";
  onUpdate(record);
  for (const stage of QUALITY_AGENT_STAGES) {
    if (record.stages?.[stage.id]?.status === "done" && record.stages[stage.id].content) continue;
    record.currentStage = stage.id;
    record.stages = { ...record.stages, [stage.id]: { status: "running", label: stage.label, startedAt: now() } };
    onUpdate(record);
    try {
      const content = stage.local
        ? buildAgentAudit(snapshot)
        : (await requestChat([{ role: "system", content: systemPrompt }, { role: "user", content: stagePrompt({ stage: stage.id, snapshot, outputs: record.stages, skillName, skillContent }) }], { max_tokens: stage.maxTokens, agent: true, signal })).content;
      if (!String(content || "").trim()) throw new Error(`${stage.label}未返回有效内容`);
      record.stages = { ...record.stages, [stage.id]: { status: "done", label: stage.label, content: String(content).trim(), completedAt: now() } };
      onUpdate(record);
    } catch (error) {
      record.status = "error";
      const stopped = error?.name === "AbortError" || signal?.aborted;
      record.error = stopped ? "已停止本次 Agent 分析，已完成阶段保留，可继续。" : error.message;
      record.stages = { ...record.stages, [stage.id]: { ...(record.stages[stage.id] || {}), status: "error", error: record.error } };
      onUpdate(record);
      return record;
    }
  }
  record.status = "done";
  record.currentStage = "";
  record.content = record.stages.report?.content || "";
  record.completedAt = now();
  onUpdate(record);
  return record;
};
