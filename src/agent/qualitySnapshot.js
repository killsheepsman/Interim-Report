const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const AUDIT_DATE_FIELDS = {
  IQC: ["检验开始时间"],
  IPQC: ["日期", "检验日期", "发生日期"],
  OQC: ["发货时间", "日期", "评分日期"],
  DQA: ["发生日期", "下单日期", "时间", "日期", "申请日期", "制单日期", "更新日期"],
  QMS: ["__periodStart"],
};
const EMPTY_ORG_NAMES = new Set(["", "未填写", "未分类", "未配置", "未覆盖", "待核实", "未知"]);
const sourceRowCount = (file) => Array.isArray(file?.rows) && file.rows.length ? file.rows.length : number(file?.rowCount);
const auditDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const dateFromAuditRow = (row, module) => {
  const field = (AUDIT_DATE_FIELDS[module] || []).find((name) => clean(row?.[name]));
  return field ? auditDate(row[field]) : null;
};
const buildMappingAudit = (data, module) => {
  if (module === "IPQC") {
    const summary = data?.ipqc?.leaderAnalysis?.bySite?.["全公司"]?.summary || {};
    const total = number(summary.leaderCount);
    const mapped = number(summary.mappedCount);
    return { dimension: "机长→工坊→交付经理", total, mapped, unmapped: number(summary.unmappedCount), rate: total ? Number((mapped / total * 100).toFixed(1)) : null };
  }
  const candidates = module === "DQA"
    ? (Array.isArray(data?.dqa?.tpmStages) ? data.dqa.tpmStages : []).map((row) => [row.name, row.division])
    : module === "OQC"
      ? (data?.oqc?.shipmentDetail?.tpmRows || data?.oqc?.tpm || []).map((row) => [row.name, row.division])
      : module === "QMS"
        ? flattenRows(data?.qms?.tpmByDivision).map((row) => [row.name, row.division])
        : module === "IQC"
          ? flattenRows(data?.iqc?.suppliers || data?.iqc?.mainSuppliers).map((row) => [row.supplier || row.name])
          : [];
  const total = candidates.length;
  const mapped = candidates.filter((fields) => fields.every((field) => !EMPTY_ORG_NAMES.has(clean(field)))).length;
  return { dimension: module === "IQC" ? "供应商" : "组织责任归属", total, mapped, unmapped: Math.max(total - mapped, 0), rate: total ? Number((mapped / total * 100).toFixed(1)) : null };
};
const buildSourceAudit = (data, files, module, period) => {
  const moduleFiles = files.filter((file) => file.module === module);
  const dataFiles = moduleFiles.filter((file) => file.kind !== "IPQC_LEADER_MAP");
  const manifest = moduleFiles.map((file) => ({
    name: clean(file.name),
    kind: clean(file.kind) || "STANDARD",
    size: number(file.size),
    rowCount: sourceRowCount(file),
    importedAt: clean(file.importedAt || file.updatedAt || file.updated_at),
  }));
  const signatureGroups = new Map();
  manifest.forEach((file) => {
    const key = `${file.name.toLowerCase()}::${file.kind}::${file.size}::${file.rowCount}`;
    if (!signatureGroups.has(key)) signatureGroups.set(key, []);
    signatureGroups.get(key).push(file);
  });
  const duplicateFiles = [...signatureGroups.values()].filter((group) => group.length > 1).map((group) => ({ name: group[0].name, count: group.length, rowCount: group[0].rowCount }));
  const dateRows = dataFiles
    .filter((file) => file.subKind !== "DQA_ENGINEER_SUPPLEMENT")
    .flatMap((file) => Array.isArray(file.rows) ? file.rows : [])
    .map((row) => dateFromAuditRow(row, module));
  const validDates = dateRows.filter(Boolean).sort((left, right) => left - right);
  return {
    sourceFileCount: dataFiles.length,
    mappingFileCount: moduleFiles.length - dataFiles.length,
    totalRows: dataFiles.reduce((total, file) => total + sourceRowCount(file), 0),
    loadedRows: dataFiles.reduce((total, file) => total + (Array.isArray(file.rows) ? file.rows.length : 0), 0),
    emptyFiles: manifest.filter((file) => file.kind !== "IPQC_LEADER_MAP" && file.rowCount === 0).map((file) => file.name),
    duplicateFiles,
    dateCoverage: {
      available: dateRows.length > 0,
      rowsChecked: dateRows.length,
      rowsWithDate: validDates.length,
      missingDateRows: Math.max(dateRows.length - validDates.length, 0),
      rate: dateRows.length ? Number((validDates.length / dateRows.length * 100).toFixed(1)) : null,
      earliest: validDates[0]?.toISOString().slice(0, 10) || "",
      latest: validDates.at(-1)?.toISOString().slice(0, 10) || "",
    },
    period,
    mapping: buildMappingAudit(data, module),
    files: manifest.slice(0, 40),
  };
};

const PARETO_RULES = {
  IQC: [
    ["尺寸/公差", /尺寸|公差|超差|厚度|长度|宽度|高度/],
    ["孔位/孔径", /孔位|孔径|漏孔|沉孔|销孔/],
    ["螺纹/牙", /螺纹|攻牙|牙孔|滑牙/],
    ["外观/损伤", /划伤|碰伤|压伤|外观|脏污|生锈|变形/],
    ["毛刺/锐边", /毛刺|披锋|锐边|倒角/],
    ["漏加工/错加工", /漏加工|少加工|加工错|漏做|做错/],
    ["表面处理", /氧化|电镀|喷粉|发黑|表面处理|喷漆/],
  ],
  IPQC: [
    ["接线/线缆", /接线|线序|线缆|端子|插头|走线/],
    ["螺丝/紧固", /螺丝|螺钉|螺母|漏锁|松动|紧固/],
    ["漏装/错装/反装", /漏装|少装|错装|反装|未装|装反/],
    ["结构干涉/空间", /干涉|碰撞|摩擦|挤压|空间/],
    ["研发设计/资料", /设计|研发|图纸|3d|bom|资料/i],
    ["气路/管路", /气管|气路|漏气|真空|压力/],
  ],
  OQC: [
    ["功能/测试/稳定性", /测试|功能|运行|动作|稳定|失效|故障/],
    ["机械结构/干涉", /干涉|机构|钣金|气缸|皮带|卡住/],
    ["电气接线/元件", /接线|线路|电源|端子|传感器|继电器/],
    ["软件/程序/通讯", /软件|程序|plc|上位机|通讯|报错/i],
    ["针模/探针/排线", /针模|探针|断针|排线|片针/],
    ["卡料/上下料", /卡料|卡盘|上料|下料|吸嘴|分盘/],
  ],
  DQA: [
    ["BOM错误/漏项", /bom|少下|漏下|漏做物料/i],
    ["结构干涉/空间", /干涉|碰撞|空间不足|挤压|摩擦/],
    ["尺寸/公差错误", /尺寸|公差|长度|宽度|高度|厚度/],
    ["孔位/安装/配合", /孔位|孔径|安装不上|装不上|配合/],
    ["结构设计/机构优化", /避位|导向|压板|支撑柱|限位|机构/],
    ["电气接线/原理", /接线|线序|端子|电源|传感器|线路/],
    ["PLC/控制逻辑", /plc|逻辑|运控|点位|io|控制/i],
  ],
};
const normalizeParetoMechanism = (module, value, fallback = "未分类") => {
  const source = clean(value);
  if (!source) return fallback;
  const matched = (PARETO_RULES[module] || []).find(([, pattern]) => pattern.test(source));
  return matched?.[0] || source.slice(0, 32);
};
const displayParetoDivision = (value) => {
  const source = clean(value);
  if (/产品五/.test(source)) return "产品五部";
  if (/FPC/i.test(source)) return "FPC事业部";
  if (/半导体|北美|IC载板|传感器|产品一/.test(source)) return "半导体&北美";
  return source || "未分类";
};
const paretoRows = (map, total, limit = 8) => {
  const sorted = [...map.entries()].map(([name, value]) => ({ name, value: Number(value) }))
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name, "zh-CN"));
  const selected = sorted.slice(0, limit);
  const otherValue = sorted.slice(limit).reduce((sumValue, row) => sumValue + row.value, 0);
  if (otherValue > 0) selected.push({ name: "其他项", value: otherValue, isOther: true });
  let cumulative = 0;
  return selected.map((row, index) => {
    cumulative += row.value;
    return { rank: row.isOther ? null : index + 1, ...row, share: total ? Number((row.value / total * 100).toFixed(1)) : 0, cumulativeShare: total ? Number((cumulative / total * 100).toFixed(1)) : 0 };
  });
};
const paretoCrossRows = (map, total, limit = 10) => [...map.entries()]
  .map(([key, value]) => {
    const [organization, mechanism] = key.split("\u0001");
    return { organization, mechanism, value: Number(value) };
  })
  .filter((row) => row.value > 0)
  .sort((left, right) => right.value - left.value || `${left.organization}${left.mechanism}`.localeCompare(`${right.organization}${right.mechanism}`, "zh-CN"))
  .slice(0, limit)
  .map((row, index) => ({ rank: index + 1, ...row, share: total ? Number((row.value / total * 100).toFixed(1)) : 0 }));
const paretoPeriodContains = (row, module, period) => {
  const date = dateFromAuditRow(row, module);
  const start = auditDate(period?.start2026);
  const end = auditDate(period?.end2026);
  if (!date || !start || !end) return false;
  return date >= start && date <= new Date(end.getTime() + 86399999);
};
const addParetoEvent = (state, organization, mechanism, weight = 1) => {
  const org = clean(organization) || "未分类";
  const cause = clean(mechanism) || "未分类";
  const value = Math.max(0, number(weight));
  if (!value) return;
  state.eventCount += 1;
  state.totalWeight += value;
  state.organization.set(org, (state.organization.get(org) || 0) + value);
  state.mechanism.set(cause, (state.mechanism.get(cause) || 0) + value);
  const crossKey = `${org}\u0001${cause}`;
  state.cross.set(crossKey, (state.cross.get(crossKey) || 0) + value);
};
const buildLocalPareto = (data, files, module, period) => {
  const state = { eventCount: 0, totalWeight: 0, organization: new Map(), mechanism: new Map(), cross: new Map(), rowsChecked: 0, rowsInPeriod: 0, missingDateRows: 0 };
  const moduleFiles = files.filter((file) => file.module === module && file.kind !== "IPQC_LEADER_MAP" && file.subKind !== "DQA_ENGINEER_SUPPLEMENT" && file.kind !== "DQA_MACHINED_PARTS");
  if (module === "QMS") {
    const currentPeriod = clean(data?.qms?.current?.period);
    (data?.qms?.risks || []).filter((row) => !currentPeriod || clean(row.period) === currentPeriod).forEach((row) => {
      state.rowsChecked += 1;
      const hasSuggestion = Boolean(clean(row.suggestion));
      if (!(number(row.score) <= 4 || hasSuggestion)) return;
      state.rowsInPeriod += 1;
      const mechanism = row.lowestDimension && row.lowestDimension !== "无" ? `低分维度/${row.lowestDimension}` : hasSuggestion ? "客户意见" : "低分评价";
      addParetoEvent(state, displayParetoDivision(row.division), mechanism, 1);
    });
  } else {
    moduleFiles.forEach((file) => (file.rows || []).forEach((row) => {
      state.rowsChecked += 1;
      if (!paretoPeriodContains(row, module, period)) {
        if (!dateFromAuditRow(row, module)) state.missingDateRows += 1;
        return;
      }
      state.rowsInPeriod += 1;
      if (module === "IQC") {
        if (/一楼自制|内部加工/i.test(clean(row["供应商"])) || clean(row["质检结果"]) !== "不合格") return;
        const site = clean(file.name).includes("杭州") ? "杭州" : "深圳";
        const supplier = clean(row["供应商"]) || "未填写供应商";
        const description = row["异常原因"] ?? row["质检说明"] ?? row["异常描述"];
        addParetoEvent(state, `${site}·${supplier}`, normalizeParetoMechanism(module, description), 1);
      } else if (module === "IPQC") {
        if (!clean(row["不良内容"])) return;
        const site = clean(file.name).includes("杭州") ? "杭州" : "深圳";
        const workshop = clean(row["产品工坊"] || row["工坊"]) || "未分工坊";
        const mechanism = normalizeParetoMechanism(module, row["不良类型"] || row["不良内容"]);
        addParetoEvent(state, `${site}·${workshop}`, mechanism, 1);
      } else if (module === "OQC") {
        const score = number(row["最终评分"] || row["售后设备评分"] || row["设备评分"]);
        const quantity = Math.max(1, number(row["机台数量"]) || 1);
        const issueText = clean(row["问题"] || row["问题描述"] || row["问题内容"]);
        if (score > 0 && score <= 3) addParetoEvent(state, displayParetoDivision(row["产品部"]), `${score}分低评分`, quantity);
        else if (issueText && /现场|售后/.test(clean(row["问题类型"] || row["阶段"]))) addParetoEvent(state, displayParetoDivision(row["产品部"]), normalizeParetoMechanism(module, issueText), 1);
      } else if (module === "DQA") {
        const isReviewSummary = number(row["评审问题数"]) > 0;
        const description = clean(row["问题描述"]);
        const weight = isReviewSummary ? number(row["评审问题数"]) : description ? 1 : 0;
        if (!weight) return;
        const stage = clean(row["阶段"] || row["问题发生地"] || row["问题反馈部门"]);
        const mechanism = isReviewSummary || /评审/.test(stage) ? "评审问题" : normalizeParetoMechanism(module, row["问题分类"] || row["类别"] || description);
        addParetoEvent(state, displayParetoDivision(row["产品部"] || file.name), mechanism, weight);
      }
    }));
  }
  return {
    engine: "本地固定统计引擎",
    definition: "问题贡献集中度，不等同于人员或组织绩效排名",
    unit: { IQC: "不合格批次", IPQC: "异常记录", OQC: "低评分机台/现场问题项", DQA: "研发/评审问题项", QMS: "低分或带意见评价" }[module] || "问题项",
    period: { start: period?.start2026 || "", end: period?.end2026 || "" },
    eventCount: state.eventCount,
    totalWeight: state.totalWeight,
    organizationPareto: paretoRows(state.organization, state.totalWeight),
    mechanismPareto: paretoRows(state.mechanism, state.totalWeight),
    crossThemes: paretoCrossRows(state.cross, state.totalWeight),
    coverage: { sourceFiles: moduleFiles.length, rowsChecked: state.rowsChecked, rowsInPeriod: state.rowsInPeriod, missingDateRows: state.missingDateRows },
    limitations: state.totalWeight ? [] : ["当前周期没有形成可用于问题贡献Pareto的事件；不得由模型自行补排。"],
  };
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
  const tpms = Array.isArray(data.dqa?.tpmStages) ? data.dqa.tpmStages : (Array.isArray(data.oqc?.tpm) ? data.oqc.tpm : []);
  return {
    supplyChain: {
      operators: aggregatePeople(ipqcRows, ["送检人"]),
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
  // Historical imports and partially refreshed caches may omit these lists or
  // retain an object-shaped value. A snapshot must stay readable in either case.
  const allDivisions = Array.isArray(dqa.divisions) ? dqa.divisions : [];
  const allTpmStages = Array.isArray(dqa.tpmStages) ? dqa.tpmStages : [];
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
      categories: Array.isArray(dqa.categories) ? dqa.categories.slice(0, 12) : [],
      disciplines: Array.isArray(dqa.yearCompare?.disciplineValues) ? dqa.yearCompare.disciplineValues.slice(0, 12) : [],
      ecnReasons: Array.isArray(dqa.ecn?.reasonValues) ? dqa.ecn.reasonValues.slice(0, 12) : [],
      ecnByDivision: Array.isArray(dqa.ecn?.divisions) ? dqa.ecn.divisions.slice(0, 12) : [],
      nonBomByDivision: Array.isArray(parts.nonBom?.divisions) ? parts.nonBom.divisions.slice(0, 12) : [],
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

const aggregateIqcComparisonRows = (rows, labelKey) => {
  const grouped = new Map();
  (rows || []).forEach((row) => {
    const name = clean(row?.[labelKey]) || "未分类";
    const current = grouped.get(name) || {
      [labelKey]: name,
      y2025Qty: 0,
      y2025Bad: 0,
      y2026Qty: 0,
      y2026Bad: 0,
    };
    [2025, 2026].forEach((year) => {
      const qty = number(row?.[`y${year}Qty`]);
      const explicitBad = Number(row?.[`y${year}Bad`]);
      const rate = number(row?.[`y${year}Rate`]);
      current[`y${year}Qty`] += qty;
      current[`y${year}Bad`] += Number.isFinite(explicitBad)
        ? explicitBad
        : qty * Math.max(0, 100 - rate) / 100;
    });
    grouped.set(name, current);
  });
  return [...grouped.values()].map((row) => {
    const result = { ...row };
    [2025, 2026].forEach((year) => {
      const qty = result[`y${year}Qty`];
      const bad = result[`y${year}Bad`];
      result[`y${year}Rate`] = qty ? Number(((qty - bad) / qty * 100).toFixed(1)) : 0;
      result[`y${year}Bad`] = Number(bad.toFixed(1));
    });
    return result;
  });
};

const genericSnapshot = (data = {}, module, files = []) => {
  const source = data[module.toLowerCase()] || {};
  if (module === "IQC") {
    const suppliers = [...flattenRows(source.mainSuppliers), ...flattenRows(source.supplierCandidates), ...flattenRows(source.suppliers)];
    const monthly = companyRows(source.siteMonthly);
    const companyMonthly = aggregateIqcComparisonRows(monthly, "month")
      .sort((a, b) => number(String(a.month).match(/\d+/)?.[0]) - number(String(b.month).match(/\d+/)?.[0]));
    const companyMaterials = aggregateIqcComparisonRows(companyRows(source.materialBySite), "name")
      .filter((row) => row.y2025Qty + row.y2026Qty > 0)
      .sort((a, b) => b.y2026Qty - a.y2026Qty)
      .slice(0, 12);
    const issues = companyRows(source.issueBySite);
    return {
      metrics: {
        batchYield2026: kpiValue(data, "iqc"),
        supplierCount: new Set(suppliers.map((row) => clean(row.supplier)).filter(Boolean)).size,
        inspectedBatches2026: totalBy(monthly, "y2026Qty"),
        issueCount2026: totalBy(monthly, "y2026Bad") || totalBy(issues, "y2026Count"),
      },
      organization: { sites: Object.keys(source.siteMonthly || {}), divisions: [], owners: topRows(suppliers, (row) => number(row.y2026Bad || row.y2026Qty * (100 - row.y2026Rate) / 100), 12) },
      evidence: {
        categories: companyMaterials.length ? companyMaterials : [...(source.material || []), ...issues].slice(0, 24),
        trends: companyMonthly.length ? companyMonthly : monthly.slice(0, 24),
        suppliers: suppliers.slice(0, 24),
      },
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

const METRIC_LABELS = {
  IQC: { batchYield2026: ["2026批次良率", "%"], supplierCount: ["供应商数量", "家"], inspectedBatches2026: ["2026检验批次", "批"], issueCount2026: ["2026不良批次", "批"] },
  IPQC: { issueDensity2026: ["2026异常密度", "%"], inspectedQuantity2026: ["2026送检数量", "件/套"], issueCount2026: ["2026异常记录", "条"], workshopCount: ["工坊数量", "个"] },
  OQC: { overall2026: ["2026出货质量总体", "组合指标"], fiveRate2026: ["2026五分率", "%"], sampleCount2026: ["2026评价样本量", "台"], lowRate2026: ["2026低分率", "%"] },
  DQA: { backendIssues2026: ["2026生产及现场问题", "项"], reviewIssues2026: ["2026评审问题", "项"], totalIssues2026: ["2026研发问题总数", "项"], ecn2026: ["2026 ECN数量", "项"], ecnRate2026: ["2026 ECN加工件比例", "%"], nonBomQuantity2026: ["2026非BOM数量", "项"] },
  QMS: { currentPeriod: ["当前客户满意度周期", "周期指标"], riskCount: ["客户风险记录", "条"], suggestionCount: ["客户意见数量", "条"] },
};
const evidenceDisplayValue = (value) => {
  if (value && typeof value === "object" && "value" in value) return `${value.value}${value.unit || ""}`;
  if (value && typeof value === "object") return JSON.stringify(value).slice(0, 260);
  return value;
};
const evidenceId = (prefix, module, index) => `${prefix}-${module}-${String(index + 1).padStart(3, "0")}`;
const buildEvidenceCatalog = (module, period, metrics, sourceAudit, localPareto) => {
  const sourceEntries = [{
    id: evidenceId("S", module, 0), type: "来源审计", level: "已证实事实", subject: module,
    statement: `${sourceAudit.sourceFileCount || 0}个数据文件、${sourceAudit.totalRows || 0}条来源记录；日期覆盖率${sourceAudit.dateCoverage?.rate ?? "待核实"}%；${sourceAudit.mapping?.dimension || "组织"}映射率${sourceAudit.mapping?.rate ?? "待核实"}%`,
    value: sourceAudit.totalRows || 0, unit: "条来源记录", period, source: "本地来源清单与映射审计",
  }];
  const metricEntries = Object.entries(metrics || {}).slice(0, 12).map(([key, value], index) => {
    const [label, unit] = METRIC_LABELS[module]?.[key] || [key, ""];
    return { id: evidenceId("M", module, index), type: "固定指标", level: "已证实事实", subject: label, statement: `${label}：${evidenceDisplayValue(value)}`, value: evidenceDisplayValue(value), unit, period, source: "软件固定统计快照" };
  });
  const organizationEntries = (localPareto.organizationPareto || []).filter((row) => !row.isOther).slice(0, 8).map((row, index) => ({
    id: evidenceId("O", module, index), type: "组织Pareto", level: "已证实事实", subject: row.name, statement: `${row.name}贡献${row.value}${localPareto.unit || "项"}，占${row.share}%，累计${row.cumulativeShare}%`, value: row.value, unit: localPareto.unit, share: row.share, period, source: "本地固定Pareto",
  }));
  const mechanismEntries = (localPareto.mechanismPareto || []).filter((row) => !row.isOther).slice(0, 8).map((row, index) => ({
    id: evidenceId("C", module, index), type: "机制Pareto", level: "已证实事实", subject: row.name, statement: `${row.name}贡献${row.value}${localPareto.unit || "项"}，占${row.share}%，累计${row.cumulativeShare}%`, value: row.value, unit: localPareto.unit, share: row.share, period, source: "本地固定Pareto",
  }));
  const crossEntries = (localPareto.crossThemes || []).slice(0, 10).map((row, index) => ({
    id: evidenceId("X", module, index), type: "组织×机制", level: "已证实事实", subject: `${row.organization}×${row.mechanism}`, statement: `${row.organization}的${row.mechanism}贡献${row.value}${localPareto.unit || "项"}，占${row.share}%`, value: row.value, unit: localPareto.unit, share: row.share, period, source: "本地固定交叉Pareto",
  }));
  const entries = [...sourceEntries, ...metricEntries, ...organizationEntries, ...mechanismEntries, ...crossEntries];
  return {
    schemaVersion: "quality-evidence-catalog-v1",
    rule: "事实结论必须引用本目录中的证据编号；推断和假设必须另列验证方法、验证角色和期限。",
    counts: { source: sourceEntries.length, metric: metricEntries.length, organization: organizationEntries.length, mechanism: mechanismEntries.length, cross: crossEntries.length },
    entries,
  };
};

export const QUALITY_AGENT_MODULES = ["IQC", "IPQC", "OQC", "DQA", "QMS"];

export const buildQualityAgentSnapshot = ({ data = {}, files = [], dateRange = {}, module = "DQA", role = "公司级", recipient = "" } = {}) => {
  const period = {
    start2025: dateRange.start2025 || "",
    end2025: dateRange.end2025 || "",
    start2026: dateRange.start2026 || "",
    end2026: dateRange.end2026 || "",
  };
  const base = module === "DQA" ? dqaSnapshot(data, { role, recipient }, files) : genericSnapshot(data, module, files);
  const sourceAudit = buildSourceAudit(data, files, module, period);
  const localPareto = buildLocalPareto(data, files, module, { start2026: period.start2026, end2026: period.end2026 });
  return {
    schemaVersion: "quality-agent-snapshot-v3",
    agentTitle: "质量分析 Agent",
    module,
    moduleLabel: moduleLabels[module] || module,
    target: { role, recipient: clean(recipient) },
    generatedAt: new Date().toISOString(),
    period,
    definitions: {
      source: "软件固定统计引擎",
      aiRule: "AI只解释已计算结果，不重新计算指标；缺少证据时必须标记待核实。",
      moduleRule: moduleRules[module] || "按固定快照中的组织、指标和证据进行分析。",
    },
    data: { ...base, sourceAudit, localPareto, evidenceCatalog: buildEvidenceCatalog(module, period, base.metrics || {}, sourceAudit, localPareto) },
  };
};
