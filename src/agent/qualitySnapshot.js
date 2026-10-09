import { buildDoamAgentSnapshotData } from "../doamEngine.js";
import { buildIpqcAssemblySplit, ipqcSnapshotReady, pickIpqcAnalysisSnapshot, sliceIpqcSnapshotToWindow } from "./ipqcAssemblySplit.js";
import { buildOqcShipmentSplit, oqcSnapshotReady, pickOqcAnalysisSnapshot, sliceOqcSnapshotToWindow } from "./oqcShipmentSplit.js";
import { buildDqaRdSplit, sliceDqaRdSnapshotToWindow } from "./dqaRdSplit.js";
import { buildQmsCustomerSplit } from "./qmsCustomerSplit.js";
import { buildDoamStabilitySplit } from "./doamStabilitySplit.js";
export { ipqcSnapshotReady, pickIpqcAnalysisSnapshot, sliceIpqcSnapshotToWindow, oqcSnapshotReady, pickOqcAnalysisSnapshot, sliceOqcSnapshotToWindow, sliceDqaRdSnapshotToWindow };
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
  if (module === "DOAM") {
    const quality = data?.doam?.quality || {};
    const fileNames = (quality.files || data?.doam?.files || []).map((item) => typeof item === "string" ? item : item?.name).filter(Boolean);
    const manifest = fileNames.map((name) => ({ name, kind: "DOAM_CSV", size: 0, rowCount: number(quality.rowCount), importedAt: "" }));
    const dateMin = quality.dateMin || data?.doam?.metrics?.dateMin || "";
    const dateMax = quality.dateMax || data?.doam?.metrics?.dateMax || "";
    return {
      sourceFileCount: manifest.length,
      mappingFileCount: 0,
      totalRows: number(quality.rowCount),
      loadedRows: number(data?.doam?.metrics?.shifts2025) + number(data?.doam?.metrics?.shifts2026),
      emptyFiles: [],
      duplicateFiles: [],
      dateCoverage: {
        available: Boolean(dateMin || dateMax),
        rowsChecked: number(quality.rowCount),
        rowsWithDate: Math.max(number(quality.rowCount) - number(quality.blankDate), 0),
        missingDateRows: number(quality.blankDate),
        rate: quality.rowCount ? Number(((Math.max(number(quality.rowCount) - number(quality.blankDate), 0) / number(quality.rowCount)) * 100).toFixed(1)) : null,
        earliest: dateMin,
        latest: dateMax,
      },
      period,
      mapping: { dimension: "TPM/设备类型/客户/产品部", total: number(quality.tpmCount) + number(quality.deviceTypeCount), mapped: number(quality.tpmCount) + number(quality.deviceTypeCount), unmapped: 0, rate: (quality.tpmCount || quality.deviceTypeCount) ? 100 : null },
      files: manifest.slice(0, 40),
    };
  }
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
  if (module === "DOAM") {
    const metrics = data?.doam?.metrics || {};
    const evidence = data?.doam?.evidence || {};
    const companyAlarms = number(metrics.alarms2026);
    const orgRows = evidence.organizationAlarmTotals || [];
    const mechRows = evidence.mechanismAlarmTotals || [];
    const crossRows = evidence.crossThemes || [];
    if (!orgRows.length && !mechRows.length && crossRows.length) {
      crossRows.forEach((row) => {
        const alarms = number(row.value || row.a);
        if (!alarms) return;
        addParetoEvent(state, clean(row.organization || "未填写TPM"), clean(row.mechanism || "其他"), alarms);
      });
    } else {
    orgRows.forEach((row) => {
      const alarms = number(row.value);
      if (!alarms) return;
      state.organization.set(clean(row.name || "未填写TPM"), (state.organization.get(clean(row.name || "未填写TPM")) || 0) + alarms);
    });
    mechRows.forEach((row) => {
      const alarms = number(row.value);
      if (!alarms) return;
      state.mechanism.set(clean(row.name || "其他"), (state.mechanism.get(clean(row.name || "其他")) || 0) + alarms);
    });
    crossRows.forEach((row) => {
      const alarms = number(row.value || row.a);
      if (!alarms) return;
      state.rowsChecked += 1;
      state.rowsInPeriod += 1;
      const org = clean(row.organization || "未填写TPM");
      const cause = clean(row.mechanism || "其他");
      state.cross.set(org + "\u0001" + cause, (state.cross.get(org + "\u0001" + cause) || 0) + alarms);
    });
    const orgSum = [...state.organization.values()].reduce((sum, value) => sum + Number(value || 0), 0);
    const mechSum = [...state.mechanism.values()].reduce((sum, value) => sum + Number(value || 0), 0);
    state.totalWeight = companyAlarms || Math.max(orgSum, mechSum);
    state.eventCount = crossRows.length || orgRows.length || mechRows.length;
    state.rowsChecked = number(metrics.shifts2026) || state.rowsChecked;
    state.rowsInPeriod = number(metrics.shifts2026) || state.rowsInPeriod;
    }
  } else if (module === "QMS") {
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
  const coverageRate = module === "DOAM" && state.totalWeight
    ? Number((Math.min(
      [...state.organization.values()].reduce((sum, value) => sum + Number(value || 0), 0),
      [...state.mechanism.values()].reduce((sum, value) => sum + Number(value || 0), 0),
      state.totalWeight
    ) / state.totalWeight * 100).toFixed(1))
    : null;
  return {
    engine: "本地固定统计引擎",
    definition: module === "DOAM" ? "问题贡献集中度，不等同于人员或组织绩效排名；分母为2026告警总次数" : "问题贡献集中度，不等同于人员或组织绩效排名",
    unit: { IQC: "不合格批次", IPQC: "异常记录", OQC: "低评分机台/现场问题项", DQA: "研发/评审问题项", QMS: "低分或带意见评价", DOAM: "告警次数" }[module] || "问题项",
    period: { start: period?.start2026 || "", end: period?.end2026 || "" },
    eventCount: state.eventCount,
    totalWeight: state.totalWeight,
    organizationPareto: paretoRows(state.organization, state.totalWeight),
    mechanismPareto: paretoRows(state.mechanism, state.totalWeight),
    crossThemes: paretoCrossRows(state.cross, state.totalWeight),
    coverage: { sourceFiles: module === "DOAM" ? 1 : moduleFiles.length, rowsChecked: state.rowsChecked, rowsInPeriod: state.rowsInPeriod, missingDateRows: state.missingDateRows, sourceAlarms: module === "DOAM" ? state.totalWeight : undefined, rate: coverageRate },
    limitations: state.totalWeight ? (module === "DOAM" && coverageRate != null && coverageRate < 95 ? ["Pareto组织/机制加总与2026告警总次数覆盖率" + coverageRate + "%，不得把截断交叉当作全量"] : []) : ["当前周期没有形成可用于问题贡献Pareto的事件；不得由模型自行补排。"],
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
  DOAM: "机台稳定性",
};
const moduleRules = {
  IQC: "以供应商/厂区为组织主线，分析来料良率、批次暴露、缺陷类型、供应商集中度和供应商改善闭环；不得把来料批次不良直接等同于生产损失。",
  IPQC: "以基地→工坊→机长/交付责任为组织主线，分析送检量、异常密度、异常类型、外包与内部差异及过程拦截能力；区分发现量增加与过程恶化。",
  OQC: "以产品部→TPM/项目为组织主线，分析出货样本量、5分率、低分率、趋势、客户/现场风险和发货门禁；样本不足时不得进行强排名。",
  DQA: "以产品部→TPM为组织主线，综合研发问题、设计评审、ECN和非BOM证据，区分研发源头、后端暴露和责任闭环。",
  QMS: "以客户声音→产品部→TPM/项目为组织主线，分析总体得分、低分率、客户意见主题、严重度、重复性、责任归属和关闭证据；客户文字意见不能被平均分替代。",
  DOAM: "以产品部→客户→TPM→设备类型为组织主线。先报有数月份和重叠月份，再解释2026窗口结构；重叠不足3个月不得把总体同比写成年度改善或恶化。必须同时看等权、加权、班次分母、新机型和剔除局部后的加权。",
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
const badBatchesFromRows = (rows, year) => (rows || []).reduce((sum, row) => {
  const qty = number(row?.[`y${year}Qty`]);
  const explicit = Number(row?.[`y${year}Bad`]);
  const rate = Number(row?.[`y${year}Rate`]);
  if (Number.isFinite(explicit) && (explicit > 0 || !Number.isFinite(rate))) return sum + explicit;
  if (qty > 0 && Number.isFinite(rate)) return sum + qty * Math.max(0, 100 - rate) / 100;
  return sum;
}, 0);

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
        inspectedBatches2026: totalBy(companyMonthly.length ? companyMonthly : monthly, "y2026Qty"),
        issueCount2026: Math.round(badBatchesFromRows(companyMonthly.length ? companyMonthly : monthly, 2026)),
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
  if (module === "DOAM") {
    const view = data.doam?.metrics ? data.doam : buildDoamAgentSnapshotData(data.doam || {}, {});
    return {
      metrics: view.metrics || {},
      organization: view.organization || { sites: [], divisions: [], owners: [] },
      evidence: view.evidence || {},
      quality: view.quality || {},
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
  DOAM: { average2026: ["2026等权机型平均报警", "次/班次"], volumeAverage2026: ["2026加权平均报警", "次/班次"], shifts2026: ["2026班次数", "班次"], alarms2026: ["2026告警总次数", "次"], types2026: ["2026设备类型数", "类"], average2025: ["2025等权机型平均报警", "次/班次"], volumeAverage2025: ["2025加权平均报警", "次/班次"], overlapMonths: ["两年重叠月份", "月"], comparableVolume2026: ["重叠月份2026加权平均", "次/班次"], residualVolumeExcludeTopTpm: ["剔除TOP TPM后加权平均", "次/班次"], residualVolumeExcludeNewTypes: ["剔除新机型后加权平均", "次/班次"], otherShare2026: ["其他分类占比", "%"] },
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

export const QUALITY_AGENT_MODULES = ["IQC", "IPQC", "OQC", "DQA", "QMS", "DOAM"];


const iqcIsCompanyMachining = (row) => /一楼自制|内部加工/i.test(clean(row?.["供应商"]));
const iqcFileSite = (fileName) => clean(fileName).includes("杭州") ? "杭州" : "深圳";
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
const rateOf = (bad, inspected) => inspected ? Number((bad / inspected * 100).toFixed(1)) : null;
const emptyIqcCell = () => ({ inspected: 0, bad: 0, defects: new Map(), previousInspected: 0, previousBad: 0 });
const finishIqcCell = (cell) => {
  const defects = [...cell.defects.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN")).slice(0, 5);
  return {
    inspected: cell.inspected,
    bad: cell.bad,
    rate: rateOf(cell.bad, cell.inspected),
    previousInspected: cell.previousInspected,
    previousBad: cell.previousBad,
    previousRate: rateOf(cell.previousBad, cell.previousInspected),
    defects,
  };
};
const iqcNamedMonth = (fileName) => {
  const match = clean(fileName).match(/(?:^|\D)(\d{1,2})\s*月份/);
  const month = match ? Number(match[1]) : 0;
  return month >= 1 && month <= 12 ? month : 0;
};
const iqcRowMonth = (row) => {
  const date = dateFromAuditRow(row, "IQC");
  if (!date) return null;
  const adjusted = row?.["检验开始时间"] instanceof Date && [15, 16].includes(date.getUTCHours())
    ? new Date(date.getTime() + 8 * 60 * 60 * 1000 + 60 * 1000)
    : date;
  return { year: adjusted.getUTCFullYear(), month: adjusted.getUTCMonth() + 1 };
};
const buildIqcMonthlyTrend = (files, period) => {
  const end = auditDate(period?.end2026);
  if (!end) return { year: 0, rows: [] };
  const year = end.getUTCFullYear();
  const endMonth = end.getUTCMonth() + 1;
  const standard = (files || []).filter((file) => file.module === "IQC" && file.kind !== "IQC_FOCUS_PROJECT" && file.subKind !== "IQC_FOCUS_PROJECT");
  const covered = new Set(standard.map((file) => iqcNamedMonth(file.name)).filter(Boolean));
  const cellNames = ["深圳供应商", "杭州供应商", "深圳公司加工", "杭州公司加工"];
  const buckets = Array.from({ length: endMonth }, (_, index) => ({ month: `${index + 1}月`, inspected: 0, bad: 0 }));
  const cellBuckets = Object.fromEntries(cellNames.map((name) => [name, Array.from({ length: endMonth }, (_, index) => ({ month: `${index + 1}月`, inspected: 0, bad: 0 }))]));
  standard.forEach((file) => {
    const namedMonth = iqcNamedMonth(file.name);
    (file.rows || []).forEach((row) => {
      const point = iqcRowMonth(row);
      if (!point || point.year !== year || point.month < 1 || point.month > endMonth) return;
      if (namedMonth && namedMonth !== point.month) return;
      if (!namedMonth && covered.has(point.month)) return;
      const bucket = buckets[point.month - 1];
      const company = iqcIsCompanyMachining(row);
      const cellName = iqcFileSite(file.name) + (company ? "公司加工" : "供应商");
      const cellBucket = cellBuckets[cellName]?.[point.month - 1];
      const bad = clean(row["质检结果"]) === "不合格";
      bucket.inspected += 1;
      if (cellBucket) cellBucket.inspected += 1;
      if (bad) {
        bucket.bad += 1;
        if (cellBucket) cellBucket.bad += 1;
      }
    });
  });
  const finish = (row) => ({ ...row, rate: rateOf(row.bad, row.inspected) ?? 0 });
  return {
    year,
    rows: buckets.map(finish),
    cells: cellNames.map((name) => ({ name, label: name.replace("公司加工", "机加"), rows: cellBuckets[name].map(finish) })),
  };
};

const buildIqcQualitySplit = (files, period) => {
  const current = monthWindow(period?.start2026, period?.end2026);
  const previous = previousMonthWindow(period);
  const cellNames = ["深圳供应商", "杭州供应商", "深圳公司加工", "杭州公司加工"];
  const cells = Object.fromEntries(cellNames.map((name) => [name, emptyIqcCell()]));
  const parties = new Map();
  (files || []).filter((file) => file.module === "IQC" && file.kind !== "IQC_FOCUS_PROJECT" && file.subKind !== "IQC_FOCUS_PROJECT").forEach((file) => {
    const site = iqcFileSite(file.name);
    (file.rows || []).forEach((row) => {
      const date = dateFromAuditRow(row, "IQC");
      const now = inWindow(date, current);
      const before = inWindow(date, previous);
      if (!now && !before) return;
      const company = iqcIsCompanyMachining(row);
      const cellName = site + (company ? "公司加工" : "供应商");
      const cell = cells[cellName];
      const bad = clean(row["质检结果"]) === "不合格";
      if (now) {
        cell.inspected += 1;
        if (bad) {
          cell.bad += 1;
          const defect = normalizeParetoMechanism("IQC", row["异常原因"] ?? row["质检说明"] ?? row["异常描述"]);
          cell.defects.set(defect, (cell.defects.get(defect) || 0) + 1);
        }
        const partyName = company ? site + "公司加工" : clean(row["供应商"]) || "未填写供应商";
        const key = site + "\u0001" + (company ? "公司加工" : "供应商") + "\u0001" + partyName;
        const party = parties.get(key) || { site, source: company ? "公司加工" : "供应商", name: partyName, inspected: 0, bad: 0, defects: new Map() };
        party.inspected += 1;
        if (bad) {
          party.bad += 1;
          const defect = normalizeParetoMechanism("IQC", row["异常原因"] ?? row["质检说明"] ?? row["异常描述"]);
          party.defects.set(defect, (party.defects.get(defect) || 0) + 1);
        }
        parties.set(key, party);
      } else if (cell) {
        cell.previousInspected += 1;
        if (bad) cell.previousBad += 1;
      }
    });
  });
  const list = (source) => [...parties.values()].filter((item) => item.source === source && item.inspected > 0).map((item) => ({
    site: item.site,
    name: item.name,
    inspected: item.inspected,
    bad: item.bad,
    rate: rateOf(item.bad, item.inspected),
    topDefects: [...item.defects.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 3),
  })).sort((a, b) => (b.rate || 0) - (a.rate || 0) || b.bad - a.bad || a.name.localeCompare(b.name, "zh-CN")).slice(0, 8);
  const monthlyTrend = buildIqcMonthlyTrend(files, period);
  return {
    rule: "导入记录均视为加工件。供应商名称含一楼自制或内部加工的归公司加工，其余归供应商。文件名含杭州归杭州，其余归深圳。趋势从当年1月计到所选截止日期；某月已有“N月份”文件时，只用该文件，避免和全年文件重复计算。",
    period: { start: period?.start2026 || "", end: period?.end2026 || "" },
    previousPeriod: previous?.label || "",
    cells: cellNames.map((name) => ({ name, ...finishIqcCell(cells[name]) })),
    suppliers: list("供应商"),
    companyMachining: list("公司加工"),
    trendYear: monthlyTrend.year,
    monthly: monthlyTrend.rows,
    cellMonthly: monthlyTrend.cells,
  };
};

const iqcTrendQuantity = (row) => {
  const count = Number(row?.y2026Qty ?? row?.total ?? row?.inspected);
  return Number.isFinite(count) && count > 0 ? count : 0;
};
const iqcTrendBad = (row, count) => {
  const explicit = Number(row?.y2026Bad ?? row?.bad);
  const rate = Number(row?.y2026Rate ?? row?.rate);
  if (Number.isFinite(explicit) && (explicit > 0 || !Number.isFinite(rate))) return explicit;
  if (Number.isFinite(rate)) return count * Math.max(0, 100 - rate) / 100;
  return 0;
};
export const alignIqcYieldMetrics = (snapshot) => {
  // 驾驶舱良率含标准件。这里改用加工件趋势的检验批次和不合格批次。
  if (snapshot?.module !== "IQC") return snapshot;
  const trends = snapshot.data?.evidence?.trends;
  if (!Array.isArray(trends) || !trends.length) return snapshot;
  let qty = 0;
  let bad = 0;
  trends.forEach((row) => {
    const count = iqcTrendQuantity(row);
    if (!count) return;
    qty += count;
    bad += iqcTrendBad(row, count);
  });
  if (!qty) return snapshot;
  const inspected = Math.round(qty);
  const issues = Math.round(bad);
  const yieldValue = Number(((qty - bad) / qty * 100).toFixed(1));
  const metrics = {
    ...(snapshot.data.metrics || {}),
    inspectedBatches2026: inspected,
    issueCount2026: issues,
    batchYield2026: { value: yieldValue, unit: "%" },
  };
  const catalog = snapshot.data.evidenceCatalog;
  const replacements = {
    "2026批次良率": { statement: "2026批次良率：" + yieldValue + "%", value: yieldValue + "%", unit: "%" },
    "2026检验批次": { statement: "2026检验批次：" + inspected + "批", value: String(inspected), unit: "批" },
    "2026不良批次": { statement: "2026不良批次：" + issues + "批", value: String(issues), unit: "批" },
  };
  const entries = Array.isArray(catalog?.entries)
    ? catalog.entries.map((entry) => replacements[entry?.subject] ? { ...entry, ...replacements[entry.subject] } : entry)
    : catalog?.entries;
  return {
    ...snapshot,
    data: {
      ...snapshot.data,
      metrics,
      evidenceCatalog: catalog ? { ...catalog, entries } : catalog,
    },
  };
};

export const buildQualityAgentSnapshot = ({ data = {}, files = [], dateRange = {}, module = "DQA", role = "公司级", recipient = "", orgMappings = [], agentRaw = null } = {}) => {
  const period = {
    start2025: dateRange.start2025 || "",
    end2025: dateRange.end2025 || "",
    start2026: dateRange.start2026 || "",
    end2026: dateRange.end2026 || "",
  };
  const doamView = module === "DOAM" ? buildDoamAgentSnapshotData(data.doam || {}, period) : null;
  const snapshotData = module === "DOAM" ? { ...data, doam: doamView } : data;
  const base = module === "DQA" ? dqaSnapshot(data, { role, recipient }, files) : genericSnapshot(snapshotData, module, files);
  const sourceAudit = buildSourceAudit(snapshotData, files, module, period);
  const localPareto = buildLocalPareto(snapshotData, files, module, { start2026: period.start2026, end2026: period.end2026 });
  const iqcSplit = module === "IQC" ? buildIqcQualitySplit(files, period) : null;
  const ipqcSplit = module === "IPQC" ? buildIpqcAssemblySplit(files, period) : null;
  const oqcSplit = module === "OQC" ? buildOqcShipmentSplit(files, period) : null;
  const dqaSplit = module === "DQA" ? buildDqaRdSplit(files, period, orgMappings, agentRaw) : null;
  const qmsSplit = module === "QMS" ? buildQmsCustomerSplit({ qms: data.qms, files, period }) : null;
  const doamSplit = module === "DOAM" ? buildDoamStabilitySplit(data.doam || {}, period) : null;
  const iqcTrendReady = Boolean(iqcSplit?.monthly?.some((row) => row.inspected > 0));
  const ipqcTrendReady = Boolean(ipqcSplit?.monthly?.some((row) => row.inspected > 0));
  let snapshotBase = base;
  if (iqcTrendReady) {
    snapshotBase = {
      ...base,
      periodTrend: {
        year: iqcSplit.trendYear,
        start: `${iqcSplit.trendYear}-01-01`,
        end: period.end2026 || "",
        rows: iqcSplit.monthly.map((row) => ({ label: row.month, bad: row.bad, total: row.inspected, rate: row.rate ?? 0 })),
      },
      evidence: {
        ...(base.evidence || {}),
        trends: iqcSplit.monthly.map((row) => ({
          month: row.month,
          y2026Qty: row.inspected,
          y2026Bad: row.bad,
          y2026Rate: row.inspected ? Number(((row.inspected - row.bad) / row.inspected * 100).toFixed(1)) : 0,
        })),
      },
    };
  }
  if (ipqcTrendReady) {
    const density = ipqcSplit.totals?.rate;
    const metrics = { ...(snapshotBase.metrics || {}) };
    metrics.inspectedQuantity2026 = ipqcSplit.totals.inspected;
    metrics.issueCount2026 = ipqcSplit.totals.bad;
    metrics.issueDensity2026 = metrics.issueDensity2026 && typeof metrics.issueDensity2026 === "object"
      ? { ...metrics.issueDensity2026, value: density, unit: "%" }
      : { value: density, unit: "%" };
    snapshotBase = {
      ...snapshotBase,
      metrics,
      periodTrend: {
        year: ipqcSplit.trendYear,
        start: `${ipqcSplit.trendYear}-01-01`,
        end: period.end2026 || "",
        rows: ipqcSplit.monthly.map((row) => ({ label: row.month, bad: row.bad, total: row.inspected, rate: row.rate ?? 0 })),
      },
      evidence: {
        ...(snapshotBase.evidence || {}),
        trends: ipqcSplit.monthly.map((row) => ({ month: row.month, y2026Qty: row.inspected, y2026Bad: row.bad, y2026Rate: row.rate ?? 0 })),
      },
    };
  }
  if (oqcSplit?.totals?.count > 0) {
    const metrics = { ...(snapshotBase.metrics || {}) };
    metrics.sampleCount2026 = oqcSplit.totals.count;
    metrics.fiveRate2026 = oqcSplit.totals.fiveRate;
    metrics.lowRate2026 = oqcSplit.totals.lowRate;
    metrics.overall2026 = { ...(metrics.overall2026 && typeof metrics.overall2026 === "object" ? metrics.overall2026 : {}), count: oqcSplit.totals.count, avg: oqcSplit.totals.avg, fiveRate: oqcSplit.totals.fiveRate, lowRate: oqcSplit.totals.lowRate };
    snapshotBase = {
      ...snapshotBase,
      metrics,
      periodTrend: {
        year: oqcSplit.trendYear,
        start: `${oqcSplit.trendYear}-01-01`,
        end: period.end2026 || "",
        rows: oqcSplit.monthly.map((row) => ({ label: row.month, bad: row.five, total: row.count, rate: row.fiveRate ?? 0 })),
      },
      evidence: {
        ...(snapshotBase.evidence || {}),
        trends: oqcSplit.monthly.map((row) => ({ month: row.month, y2026Qty: row.count, y2026Bad: row.low, y2026Rate: row.fiveRate ?? 0 })),
      },
    };
  }
  const built = {
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
    data: { ...snapshotBase, sourceAudit, localPareto, ...(iqcSplit ? { iqcSplit } : {}), ...(ipqcSplit ? { ipqcSplit } : {}), ...(oqcSplit ? { oqcSplit } : {}), ...(dqaSplit ? { dqaSplit } : {}), ...(qmsSplit ? { qmsSplit } : {}), ...(doamSplit ? { doamSplit } : {}), evidenceCatalog: buildEvidenceCatalog(module, period, snapshotBase.metrics || {}, sourceAudit, localPareto) },
  };
  return alignIqcYieldMetrics(built);
};



const iqcMonthBounds = (year, label) => {
  const match = String(label || "").match(/(\d{1,2})\s*月/);
  const month = match ? Number(match[1]) : 0;
  if (!year || month < 1 || month > 12) return null;
  const start = year + "-" + String(month).padStart(2, "0") + "-01";
  const end = year + "-" + String(month).padStart(2, "0") + "-" + String(new Date(Date.UTC(Number(year), month, 0)).getUTCDate()).padStart(2, "0");
  return { month, start, end };
};
const iqcRangesOverlap = (start, end, otherStart, otherEnd) => Boolean(start && end && otherStart && otherEnd && start <= otherEnd && end >= otherStart);
const iqcEntryReady = (entry) => {
  const cells = entry?.snapshot?.data?.iqcSplit?.cellMonthly;
  return Number(entry?.snapshot?.data?.sourceAudit?.totalRows || 0) > 0 && Array.isArray(cells) && cells.some((cell) => (cell.rows || []).some((row) => Number(row.inspected) > 0));
};
export const pickIqcAnalysisSnapshot = (history = [], period = {}) => {
  const start = period.start2026 || "";
  const end = period.end2026 || "";
  const ready = (history || []).filter((entry) => entry?.active !== false && entry?.module === "IQC" && iqcEntryReady(entry));
  if (!start || !end || !ready.length) return null;
  const span = (entry) => Date.parse(entry.dateRange?.end2026 + "T00:00:00Z") - Date.parse(entry.dateRange?.start2026 + "T00:00:00Z");
  const exact = ready.filter((entry) => entry.dateRange?.start2026 === start && entry.dateRange?.end2026 === end).sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
  if (exact[0]) return { ...exact[0], matchLevel: "exact-2026" };
  const covering = ready.filter((entry) => entry.dateRange?.start2026 && entry.dateRange?.end2026 && entry.dateRange.start2026 <= start && entry.dateRange.end2026 >= end).sort((a, b) => span(a) - span(b) || String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
  if (!covering[0]) return null;
  return { ...covering[0], matchLevel: "coverage", selectedWindow: { start, end }, coverage: { start: covering[0].dateRange.start2026, end: covering[0].dateRange.end2026 } };
};
export const sliceIqcSnapshotToWindow = (snapshot, window = {}, sourcePeriod = null) => {
  if (!snapshot || snapshot.module !== "IQC") return snapshot;
  const start = window.start || "";
  const end = window.end || "";
  if (!start || !end) return snapshot;
  const ownStart = sourcePeriod?.start2026 || snapshot.period?.start2026 || "";
  const ownEnd = sourcePeriod?.end2026 || snapshot.period?.end2026 || "";
  if (ownStart === start && ownEnd === end) return snapshot;
  const split = snapshot.data?.iqcSplit;
  const monthly = split?.cellMonthly || [];
  if (!monthly.length) return snapshot;
  const year = start.slice(0, 4);
  const endMonth = Number(end.slice(5, 7)) || 12;
  const inWindow = (label) => {
    const bounds = iqcMonthBounds(year, label);
    return Boolean(bounds && iqcRangesOverlap(bounds.start, bounds.end, start, end));
  };
  const throughEnd = (label) => {
    const bounds = iqcMonthBounds(year, label);
    return Boolean(bounds && bounds.month <= endMonth);
  };
  const sumRows = (rows) => (rows || []).reduce((acc, row) => ({ inspected: acc.inspected + Number(row.inspected || 0), bad: acc.bad + Number(row.bad || 0) }), { inspected: 0, bad: 0 });
  const previousMonth = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 2, 1)).getUTCMonth() + 1;
  const sameMonth = ownStart.slice(0, 7) && ownStart.slice(0, 7) === start.slice(0, 7) && ownEnd.slice(0, 7) === end.slice(0, 7);
  const chartCells = monthly.map((cell) => ({ ...cell, rows: (cell.rows || []).filter((row) => throughEnd(row.month)) }));
  const windowCells = monthly.map((cell) => ({ ...cell, rows: (cell.rows || []).filter((row) => inWindow(row.month)) }));
  const cells = windowCells.map((cell, index) => {
    const totals = sumRows(cell.rows);
    const original = (split.cells || [])[index] || {};
    const prev = (cell.rows.length ? monthly[index]?.rows : monthly[index]?.rows || []).find((row) => iqcMonthBounds(year, row.month)?.month === previousMonth);
    const rate = totals.inspected ? Number((totals.bad / totals.inspected * 100).toFixed(1)) : null;
    return {
      ...original,
      name: original.name || cell.name,
      inspected: totals.inspected,
      bad: totals.bad,
      rate,
      previousInspected: Number(prev?.inspected || 0),
      previousBad: Number(prev?.bad || 0),
      previousRate: prev?.inspected ? Number((Number(prev.bad || 0) / Number(prev.inspected) * 100).toFixed(1)) : null,
      defects: sameMonth ? (original.defects || []) : [],
    };
  });
  const monthLabels = chartCells[0]?.rows || [];
  const monthlyRows = monthLabels.map((row, rowIndex) => {
    const inspected = chartCells.reduce((sum, cell) => sum + Number(cell.rows?.[rowIndex]?.inspected || 0), 0);
    const bad = chartCells.reduce((sum, cell) => sum + Number(cell.rows?.[rowIndex]?.bad || 0), 0);
    return { month: row.month, inspected, bad, rate: inspected ? Number((bad / inspected * 100).toFixed(1)) : 0 };
  });
  const selectedLabels = new Set((windowCells[0]?.rows || []).map((row) => row.month));
  const trends = monthlyRows.filter((row) => selectedLabels.has(row.month)).map((row) => ({ month: row.month, y2026Qty: row.inspected, y2026Bad: row.bad, y2026Rate: row.rate }));
  return {
    ...snapshot,
    period: { ...(snapshot.period || {}), start2026: start, end2026: end },
    selectedWindow: { start, end },
    data: {
      ...snapshot.data,
      periodTrend: snapshot.data?.periodTrend ? { ...snapshot.data.periodTrend, end, rows: monthlyRows.map((row) => ({ label: row.month, bad: row.bad, total: row.inspected, rate: row.rate })) } : snapshot.data?.periodTrend,
      evidence: { ...(snapshot.data?.evidence || {}), trends },
      iqcSplit: { ...split, cells, cellMonthly: chartCells, monthly: monthlyRows, suppliers: sameMonth ? split.suppliers : [], companyMachining: sameMonth ? split.companyMachining : [] },
    },
  };
};

const qualityMonthStart = (label, fallbackYear) => {
  const textLabel = String(label || "");
  const iso = textLabel.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-01`;
  const month = textLabel.match(/(\d{1,2})\s*月/);
  if (!month || !fallbackYear) return "";
  return `${fallbackYear}-${String(month[1]).padStart(2, "0")}-01`;
};
const qualityMonthEnd = (start) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "";
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  return `${start.slice(0, 7)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
};
export const applyQualitySnapshotWindow = (snapshot, window = {}) => {
  const start = String(window.start || "");
  const end = String(window.end || "");
  if (!snapshot || !start || !end) return snapshot;
  const trends = Array.isArray(snapshot.data?.evidence?.trends) ? snapshot.data.evidence.trends : [];
  const year = start.slice(0, 4);
  const marked = trends.map((row) => {
    const monthStart = qualityMonthStart(row.month || row.label, year);
    const monthEnd = qualityMonthEnd(monthStart);
    const selected = Boolean(monthStart) && monthStart <= end && monthEnd >= start;
    return { ...row, selected };
  }).filter((row) => {
    const monthStart = qualityMonthStart(row.month || row.label, year);
    return !monthStart || monthStart <= end;
  });
  const selectedRows = marked.filter((row) => row.selected);
  if (!selectedRows.length) return { ...snapshot, selectedWindow: { start, end }, windowResolution: "unsliceable" };
  const qty = selectedRows.reduce((sum, row) => sum + Number(row.y2026Qty || row.total || 0), 0);
  const bad = selectedRows.reduce((sum, row) => sum + Number(row.y2026Bad || row.bad || 0), 0);
  const metrics = { ...(snapshot.data?.metrics || {}) };
  if ("inspectedBatches2026" in metrics) metrics.inspectedBatches2026 = Math.round(qty);
  if ("inspectedQuantity2026" in metrics) metrics.inspectedQuantity2026 = Math.round(qty);
  if ("issueCount2026" in metrics) metrics.issueCount2026 = Math.round(bad);
  if ("issueDensity2026" in metrics) {
    const density = qty ? Number((bad / qty * 100).toFixed(2)) : null;
    metrics.issueDensity2026 = metrics.issueDensity2026 && typeof metrics.issueDensity2026 === "object" ? { ...metrics.issueDensity2026, value: density } : density;
  }
  if (metrics.batchYield2026 && qty) metrics.batchYield2026 = { ...(typeof metrics.batchYield2026 === "object" ? metrics.batchYield2026 : { value: metrics.batchYield2026 }), value: Number(((qty - bad) / qty * 100).toFixed(1)) };
  return {
    ...snapshot,
    period: { ...(snapshot.period || {}), start2026: start, end2026: end },
    selectedWindow: { start, end },
    windowResolution: "month",
    data: { ...(snapshot.data || {}), metrics, evidence: { ...(snapshot.data?.evidence || {}), trends: marked } },
  };
};
