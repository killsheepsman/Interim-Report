const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sum = (rows = [], getter) => rows.reduce((total, row) => total + number(getter(row)), 0);
const topRows = (rows = [], getter, limit = 10) => [...rows]
  .sort((left, right) => getter(right) - getter(left))
  .slice(0, limit);
const clean = (value) => String(value ?? "").trim();
const splitNames = (value) => clean(value).split(/[、,，;；/\\|]/).map((item) => item.trim()).filter(Boolean);
const firstField = (row, fields) => fields.map((field) => clean(row?.[field])).find(Boolean) || "";
const sumFields = (row, fields) => fields.reduce((total, field) => total + number(row?.[field]), 0);
const sourceRows = (files = [], modules = []) => files.filter((file) => modules.includes(file.module) && file.kind !== "IPQC_LEADER_MAP").flatMap((file) => file.rows || []);
const aggregatePeople = (rows, fields) => {
  const map = new Map();
  rows.forEach((row) => splitNames(firstField(row, fields)).forEach((name) => {
    const current = map.get(name) || { name, rows: 0, quantity: 0, issues: 0, categories: {} };
    current.rows += 1;
    current.quantity += sumFields(row, ["送检数量", "送检量", "检验数量", "送检件数", "数量"]);
    current.issues += sumFields(row, ["不良数量", "异常数量", "异常数", "不良数"]);
    const category = firstField(row, ["不良类型", "问题类型", "问题分类", "阶段"]);
    if (category) current.categories[category] = (current.categories[category] || 0) + 1;
    map.set(name, current);
  }));
  return [...map.values()].map((row) => ({ ...row, topCategories: Object.entries(row.categories).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })) })).sort((a, b) => b.issues - a.issues || b.rows - a.rows).slice(0, 200);
};
const buildRoleEvidence = (data = {}, files = []) => {
  const ipqcRows = sourceRows(files, ["IPQC"]);
  const researchRows = sourceRows(files, ["OQC", "DQA", "QMS"]);
  const leaders = data.ipqc?.leaderAnalysis?.bySite?.["全公司"]?.leaders || [];
  const managers = data.ipqc?.leaderAnalysis?.bySite?.["全公司"]?.managers || [];
  const tpms = data.dqa?.tpmStages || data.oqc?.tpm || [];
  return {
    supplyChain: {
      operators: aggregatePeople(ipqcRows, ["送检人", "送检人员", "组装人员", "操作者", "责任人", "检验人", "检验员"]),
      leaders: leaders.slice(0, 200),
      deliveryManagers: managers.slice(0, 200),
    },
    research: {
      engineers: aggregatePeople(researchRows, ["研发工程师", "工程师", "RD工程师", "工程师姓名", "责任人/处理人", "责任人\\处理人", "责任人"]),
      pms: aggregatePeople(researchRows, ["PM", "项目经理", "项目负责人"]),
      tpms: tpms.slice(0, 200),
      productionDirectors: aggregatePeople(researchRows, ["产总", "产品总监", "产品部负责人"]),
    },
  };
};

const moduleLabels = {
  IQC: "来料质量",
  IPQC: "过程质量",
  OQC: "出货质量",
  DQA: "研发质量",
  QMS: "客户质量",
};
const moduleRules = {
  IQC: "以供应商/厂区为组织主线，分析来料良率、批次暴露、缺陷类型、供应商集中度和供应商改善闭环；不得把来料批次不良直接等同于生产损失。",
  IPQC: "以基地→工坊→机长/交付责任为组织主线，分析送检量、异常密度、异常类型、外包与内部差异及过程拦截能力；区分发现量增加与过程恶化。",
  OQC: "以产品部→TPM/项目为组织主线，分析出货样本量、5分率、低分率、趋势、客户/现场风险和发货门禁；样本不足时不得进行强排名。",
  DQA: "以产品部→TPM为组织主线，综合研发问题、设计评审、ECN和非BOM证据，区分研发源头、后端暴露和责任闭环。",
  QMS: "以客户声音→产品部→TPM/项目为组织主线，分析总体得分、低分率、客户意见主题、严重度、重复性、责任归属和关闭证据；客户文字意见不能被平均分替代。",
};

const dqaSnapshot = (data = {}, target = {}, files = []) => {
  const dqa = data.dqa || {};
  const allDivisions = dqa.divisions || [];
  const allTpmStages = dqa.tpmStages || [];
  const role = clean(target.role) || "公司级";
  const recipient = clean(target.recipient);
  const isScoped = role !== "公司级" && Boolean(recipient);
  const selectedDivisionNames = role === "产品部" && recipient
    ? allDivisions.filter((row) => clean(row.name) === recipient || clean(row.name).includes(recipient) || recipient.includes(clean(row.name))).map((row) => clean(row.name))
    : [];
  const divisions = isScoped && role === "产品部"
    ? allDivisions.filter((row) => selectedDivisionNames.includes(clean(row.name)))
    : isScoped && role === "TPM"
      ? allDivisions.filter((row) => allTpmStages.some((stage) => clean(stage.name) === recipient && clean(stage.division) === clean(row.name)))
      : isScoped
        ? []
      : allDivisions;
  const tpmStages = isScoped
    ? allTpmStages.filter((row) => role === "产品部" ? selectedDivisionNames.includes(clean(row.division)) : role === "TPM" && clean(row.name) === recipient)
    : allTpmStages;
  const ecnTotals = dqa.ecn?.totals || {};
  const parts = dqa.machinedParts || {};
  const scopedIssueTotal = sum(divisions, (row) => row.review + row.production + row.onsite);
  return {
    metrics: {
      backendIssues2026: sum(divisions, (row) => row.production + row.onsite),
      reviewIssues2026: sum(divisions, (row) => row.review),
      totalIssues2026: scopedIssueTotal,
      ecn2026: isScoped ? null : number(ecnTotals[2026]?.numerator),
      ecnRate2026: isScoped ? null : number(ecnTotals[2026]?.rate),
      nonBomQuantity2026: isScoped ? null : number(parts.nonBom?.totals?.[2026]?.numerator),
    },
    organization: {
      divisions: topRows(divisions, (row) => number(row.production) + number(row.onsite) + number(row.review)).map((row) => ({
        name: clean(row.name), review: number(row.review), production: number(row.production), onsite: number(row.onsite),
      })),
      tpms: topRows(tpmStages, (row) => number(row.production) + number(row.onsite) + number(row.review)).map((row) => ({
        name: clean(row.name), division: clean(row.division), review: number(row.review), production: number(row.production), onsite: number(row.onsite),
      })),
    },
    evidence: {
      categories: (dqa.categories || []).slice(0, 12),
      disciplines: dqa.yearCompare?.disciplineValues?.slice(0, 12) || [],
      ecnReasons: dqa.ecn?.reasonValues?.slice(0, 12) || [],
      ecnByDivision: (dqa.ecn?.divisions || []).slice(0, 12),
      nonBomByDivision: (parts.nonBom?.divisions || []).slice(0, 12),
    },
    roleEvidence: buildRoleEvidence(data, files).research,
    scope: {
      status: !isScoped ? "公司级固定快照" : (divisions.length || tpmStages.length ? "已按DQA产品部/TPM字段过滤" : "未找到对应组织字段，待核实"),
      role,
      recipient: recipient || "公司级",
      unscopedMetrics: isScoped ? ["ECN", "非BOM"] : [],
    },
  };
};

const flattenRows = (value) => Array.isArray(value) ? value : Object.values(value || {}).flatMap((rows) => Array.isArray(rows) ? rows : []);
const companyRows = (value) => {
  if (Array.isArray(value)) return value;
  const entries = Object.entries(value || {});
  const company = entries.find(([name]) => name === "全公司")?.[1];
  if (Array.isArray(company)) return company;
  return entries.filter(([name]) => name !== "全公司").flatMap(([, rows]) => Array.isArray(rows) ? rows : []);
};
const kpiValue = (data, key) => {
  const item = (data.kpis || []).find((row) => row.key === key);
  return item ? { value: number(item.value), delta: number(item.delta), unit: clean(item.unit) } : null;
};
const totalBy = (rows, field) => rows.reduce((total, row) => total + number(row?.[field]), 0);

const genericSnapshot = (data = {}, module, files = []) => {
  const source = data[module.toLowerCase()] || {};
  if (module === "IQC") {
    const suppliers = [...flattenRows(source.mainSuppliers), ...flattenRows(source.supplierCandidates), ...flattenRows(source.suppliers)];
    const monthly = companyRows(source.siteMonthly);
    const issues = companyRows(source.issueBySite);
    return {
      metrics: {
        batchYield2026: kpiValue(data, "iqc"),
        supplierCount: new Set(suppliers.map((row) => clean(row.supplier)).filter(Boolean)).size,
        inspectedBatches2026: totalBy(monthly, "y2026Qty"),
        issueCount2026: totalBy(monthly, "y2026Bad") || totalBy(issues, "y2026Count"),
      },
      organization: { sites: Object.keys(source.siteMonthly || {}), divisions: [], owners: topRows(suppliers, (row) => number(row.y2026Bad || row.y2026Qty * (100 - row.y2026Rate) / 100), 12) },
      evidence: { categories: [...(source.material || []), ...issues].slice(0, 24), trends: monthly.slice(0, 24), suppliers: suppliers.slice(0, 24) },
      roleEvidence: { supplyChain: buildRoleEvidence(data, files).supplyChain },
    };
  }
  if (module === "IPQC") {
    const monthly = companyRows(source.siteMonthly);
    const workshops = Array.isArray(source.workshopsBySite?.["全公司"])
      ? source.workshopsBySite["全公司"]
      : flattenRows(source.workshopsBySite || source.workshops);
    const types = Array.isArray(source.rawTypesBySite?.["全公司"])
      ? source.rawTypesBySite["全公司"]
      : flattenRows(source.rawTypesBySite || source.contentTypesBySite || source.categories);
    return {
      metrics: {
        issueDensity2026: kpiValue(data, "ipqc"),
        inspectedQuantity2026: totalBy(monthly, "y2026Qty"),
        issueCount2026: totalBy(monthly, "y2026Bad") || totalBy(types, "y2026Count"),
        workshopCount: new Set(workshops.map((row) => clean(row.name)).filter(Boolean)).size,
      },
      organization: { sites: Object.keys(source.siteMonthly || {}), divisions: workshops.slice(0, 24), owners: flattenRows(source.leaderAnalysis?.bySite || source.tpmRows).slice(0, 24) },
      evidence: { categories: types.slice(0, 24), trends: monthly.slice(0, 24), workshops: workshops.slice(0, 24) },
      roleEvidence: { supplyChain: buildRoleEvidence(data, files).supplyChain },
    };
  }
  if (module === "OQC") {
    const divisions = source.monthlySummary?.divisions || source.shipmentDetail?.divisionRows || [];
    const owners = source.shipmentDetail?.tpmRows || source.tpm || [];
    const reportedOverall = source.shipmentDetail?.overall?.y2026 || {};
    const overall = Object.keys(reportedOverall).length ? reportedOverall : (() => {
      const count = totalBy(divisions, "y2026Count");
      const scoreTotal = totalBy(divisions, "y2026ScoreTotal");
      const five = divisions.reduce((total, row) => total + number(row.y2026Count) * number(row.y2026FiveRate) / 100, 0);
      const low = divisions.reduce((total, row) => total + number(row.y2026Count) * number(row.y2026LowRate) / 100, 0);
      return {
        count,
        scoreTotal,
        avg: count ? Number((scoreTotal / count).toFixed(2)) : 0,
        fiveRate: count ? Number((five / count * 100).toFixed(1)) : 0,
        lowRate: count ? Number((low / count * 100).toFixed(1)) : 0,
      };
    })();
    return {
      metrics: { overall2026: overall, fiveRate2026: number(overall.fiveRate ?? overall.fiveRate2026 ?? data.kpis?.find((row) => row.key === "oqc")?.value), sampleCount2026: number(overall.count) || totalBy(divisions, "y2026Count"), lowRate2026: number(overall.lowRate ?? overall.lowRate2026) },
      organization: { sites: [], divisions: divisions.slice(0, 24), owners: owners.slice(0, 24) },
      evidence: { categories: (source.onsite || []).slice(0, 24), trends: (source.monthlySummary?.divisionMonthly ? flattenRows(source.monthlySummary.divisionMonthly) : []).slice(0, 24), tpm: owners.slice(0, 24) },
      roleEvidence: { research: buildRoleEvidence(data, files).research },
    };
  }
  if (module === "QMS") {
    const current = source.current || [...(source.periods || [])].filter((row) => row.year === 2026).sort((a, b) => (b.half || 0) - (a.half || 0))[0] || null;
    return {
      metrics: { currentPeriod: current, riskCount: (source.risks || []).length, suggestionCount: (source.suggestions || []).length },
      organization: { sites: [], divisions: (source.divisionCompare || []).slice(0, 12), owners: flattenRows(source.tpmByDivision).slice(0, 24) },
      evidence: { categories: (source.completeDimensions || source.comparableDimensions || []).slice(0, 24), trends: source.periods || [], risks: (source.risks || []).slice(0, 24), customerSuggestions: (source.suggestions || []).slice(0, 24) },
      roleEvidence: { research: buildRoleEvidence(data, files).research },
    };
  }
  return {
    metrics: source.metrics || data.kpis || {},
    organization: { sites: source.siteMonthly ? Object.keys(source.siteMonthly) : [], divisions: source.divisionCompare || source.divisions || [], owners: source.tpm || source.tpmRows || source.suppliers || [] },
    evidence: { categories: source.categories || source.rawTypesBySite || source.onsite || [], trends: source.monthly || source.siteMonthly || [] },
  };
};

export const QUALITY_AGENT_MODULES = ["IQC", "IPQC", "OQC", "DQA", "QMS"];

export const buildQualityAgentSnapshot = ({ data = {}, files = [], dateRange = {}, module = "DQA", role = "公司级", recipient = "" } = {}) => ({
  schemaVersion: "quality-agent-snapshot-v1",
  agentTitle: "质量分析 Agent",
  module,
  moduleLabel: moduleLabels[module] || module,
  target: { role, recipient: clean(recipient) },
  generatedAt: new Date().toISOString(),
  period: {
    start2025: dateRange.start2025 || "",
    end2025: dateRange.end2025 || "",
    start2026: dateRange.start2026 || "",
    end2026: dateRange.end2026 || "",
  },
  definitions: {
    source: "软件固定统计引擎",
    aiRule: "AI只解释已计算结果，不重新计算指标；缺少证据时必须标记待核实。",
    moduleRule: moduleRules[module] || "按固定快照中的组织、指标和证据进行分析。",
  },
  data: module === "DQA" ? dqaSnapshot(data, { role, recipient }, files) : genericSnapshot(data, module, files),
});
