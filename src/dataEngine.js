import * as XLSX from "xlsx";
import { sampleData } from "./sampleData.js";

const text = (v) => (v == null ? "" : String(v).trim());
const number = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const ipqcQty = (row) => number(row["送检数"] ?? row["治具数量"]);
// IPQC异常按“不良内容”记录行数统计：内容非空的一行计1条。
const ipqcBad = (row) => text(row["不良内容"]) ? 1 : 0;
const businessDate = (value) => {
  const raw = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(raw.getTime())) return null;
  // XLSX cellDates may expose China-midnight values as 15:59:xx UTC on the prior day.
  if (value instanceof Date && [15, 16].includes(raw.getUTCHours())) {
    return new Date(raw.getTime() + 8 * 60 * 60 * 1000 + 60 * 1000);
  }
  return raw;
};

const classify = (value, rules) => {
  const source = text(value).toLowerCase().replace(/\s/g, "");
  if (!source) return "无描述";
  for (const [label, keys] of rules) {
    if (keys.some((key) => source.includes(key))) return label;
  }
  return "其他";
};

const rules = {
  iqc: [
    ["尺寸/公差", ["尺寸", "公差", "超差", "实测", "厚度", "长度", "宽度", "高度"]],
    ["孔位/孔径", ["孔位", "孔径", "漏孔", "沉孔", "销孔"]],
    ["螺纹/牙", ["螺纹", "攻牙", "牙孔", "滑牙"]],
    ["外观/损伤", ["划伤", "碰伤", "压伤", "外观", "脏污"]],
    ["毛刺/锐边", ["毛刺", "披锋", "锐边", "倒角"]],
    ["漏加工/错加工", ["漏加工", "少加工", "加工错", "漏做", "做错"]],
    ["表面处理", ["氧化", "镀", "喷粉", "发黑", "表面处理"]],
  ],
  ipqc: [
    ["接线/线缆", ["接线", "线序", "线缆", "端子", "插头", "走线"]],
    ["螺丝/紧固", ["螺丝", "螺钉", "螺母", "漏锁", "松动", "紧固"]],
    ["漏装/错装/反装", ["漏装", "少装", "错装", "反装", "未装", "装反"]],
    ["结构干涉/空间", ["干涉", "碰撞", "摩擦", "挤压", "空间"]],
    ["研发设计/资料", ["设计", "研发", "图纸", "3d", "bom", "资料"]],
    ["气路/管路", ["气管", "气路", "漏气", "真空", "压力"]],
  ],
  oqc: [
    ["功能/测试/稳定性", ["测试", "功能", "运行", "动作", "稳定", "ng", "失效"]],
    ["机械结构/干涉", ["干涉", "机构", "钣金", "气缸", "皮带", "卡住"]],
    ["电气接线/元件", ["接线", "线路", "电源", "端子", "传感器", "继电器"]],
    ["软件/程序/通讯", ["软件", "程序", "plc", "上位机", "通讯", "报错"]],
    ["针模/探针/排线", ["针模", "探针", "断针", "排线", "片针"]],
    ["卡料/上下料", ["卡料", "卡盘", "上料", "下料", "吸嘴", "分盘"]],
  ],
  dqa: [
    ["BOM错误/漏项", ["bom", "少下", "漏下", "漏做物料"]],
    ["结构干涉/空间", ["干涉", "碰撞", "空间不足", "挤压", "摩擦"]],
    ["尺寸/公差错误", ["尺寸", "公差", "长度", "宽度", "高度", "厚度"]],
    ["孔位/安装/配合", ["孔位", "孔径", "安装不上", "装不上", "配合"]],
    ["结构设计/机构优化", ["避位", "导向", "压板", "支撑柱", "限位", "机构"]],
    ["电气接线/原理", ["接线", "线序", "端子", "电源", "传感器", "线路"]],
    ["PLC/控制逻辑", ["plc", "逻辑", "运控", "点位", "io", "控制"]],
    ["软件/通讯/界面", ["软件", "程序", "上位机", "下位机", "通讯", "界面"]],
    ["功能/性能/稳定性", ["功能", "测试", "性能", "稳定", "运行", "故障", "报警"]],
  ],
};

const findHeader = (rows) => {
  for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
    const cells = rows[i].map(text);
    if (cells.some((c) => ["供应商", "日期", "发生日期", "UUID", "问题", "产品部", "评审问题数"].includes(c))) return i;
  }
  return 0;
};

const sheetRows = (workbook) => {
  const rows = [];
  workbook.SheetNames.forEach((name) => {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" });
    const headerIndex = findHeader(matrix);
    const headers = matrix[headerIndex].map(text);
    matrix.slice(headerIndex + 1).forEach((values) => {
      if (!values.some((v) => text(v))) return;
      const row = {};
      headers.forEach((h, i) => { if (h) row[h] = values[i]; });
      rows.push(row);
    });
  });
  return rows;
};

const ecnRows = (workbook) => {
  const rows = [];
  workbook.SheetNames.forEach((name) => {
    if (!name.includes("分子") && !name.includes("分母")) return;
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" });
    const headerIndex = findHeader(matrix);
    const headers = matrix[headerIndex].map(text);
    matrix.slice(headerIndex + 1).forEach((values) => {
      if (!values.some((v) => text(v))) return;
      const row = { __sheet: name };
      headers.forEach((h, i) => { if (h) row[h] = values[i]; });
      rows.push(row);
    });
  });
  return rows;
};

const oqcMonthlySummaryRows = (workbook) => {
  const rows = [];
  workbook.SheetNames.forEach((name) => {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" });
    const blocks = [
      { year: 2025, monthRow: 1, scoreRow: 2, startRow: 3, endRow: 13 },
      { year: 2026, monthRow: 18, scoreRow: 19, startRow: 20, endRow: 30 },
    ];
    blocks.forEach((block) => {
      let division = "";
      for (let rowIndex = block.startRow; rowIndex <= block.endRow && rowIndex < matrix.length; rowIndex += 1) {
        const source = matrix[rowIndex] || [];
        if (text(source[0])) division = text(source[0]);
        const tpm = text(source[1]);
        if (!tpm || ["FPC汇总", "总计", "/"].includes(tpm) || division === "总计") continue;
        for (let col = 2; col < source.length; col += 1) {
          let month = text(matrix[block.monthRow]?.[col]);
          if (!month) {
            for (let left = col - 1; left >= 2 && !month; left -= 1) month = text(matrix[block.monthRow]?.[left]);
          }
          const scoreText = text(matrix[block.scoreRow]?.[col]);
          const monthNumber = Number(month.replace("月", ""));
          const score = Number(scoreText.replace("分", ""));
          const count = number(source[col]);
          if (!monthNumber || monthNumber > 5 || !score || count <= 0) continue;
          rows.push({
            产品部: division, TPM: tpm, 年份: block.year, 月份: monthNumber,
            评分档位: score, 数量: count, 日期: new Date(block.year, monthNumber - 1, 1),
          });
        }
      }
    });
  });
  return rows;
};

const isMachinedPartsWorkbook = (fileName, workbook) => fileName.includes("加工件数量比例")
  || workbook.SheetNames.some((name) => name.includes("加工件统计"));

const machinedPartRows = (workbook, fileName) => {
  const rows = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheetKind = sheetName.includes("非BOM") ? "非BOM" : sheetName.includes("ECN") ? "ECN" : "";
    if (!sheetKind) return;
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
    const firstRow = matrix[0] || [];
    const secondRow = matrix[1] || [];
    let currentDivision = "";
    matrix.slice(2).forEach((values) => {
      if (!values.some((v) => text(v))) return;
      const rawDivisionCell = text(values[0]);
      if (rawDivisionCell) currentDivision = rawDivisionCell;
      const rawDivision = rawDivisionCell || currentDivision;
      const tpm = text(values[1]);
      if (!rawDivision && !tpm) return;
      for (let col = 2; col < values.length; col += 2) {
        let monthHeader = text(firstRow[col]);
        if (!monthHeader) {
          for (let left = col - 1; left >= 2 && !monthHeader; left -= 1) monthHeader = text(firstRow[left]);
        }
        const monthMatch = monthHeader.match(/(20\d{2})年(\d{1,2})月份/);
        if (!monthMatch) continue;
        const year = Number(monthMatch[1]);
        const month = Number(monthMatch[2]);
        const quantity = number(values[col]);
        const ratio = number(values[col + 1]);
        if (quantity <= 0 && ratio <= 0) continue;
        rows.push({
          __sheet: sheetName,
          __partKind: sheetKind,
          __sourceFile: fileName,
          日期: new Date(year, month - 1, 1),
          年份: year,
          月份: month,
          产品部: rawDivision,
          TPM: tpm,
          数量: quantity,
          比例: ratio,
        });
      }
    });
  });
  return rows;
};



const iqcProjectName = (fileName) => text(fileName)
  .replace(/\.xlsx?$/i, "")
  .replace(/\u9879\u76ee\u8d28\u68c0\u7edf\u8ba1|\u9879\u76ee\u7edf\u8ba1|\u8d28\u68c0\u7edf\u8ba1|\u7edf\u8ba1/g, "")
  .trim();

const isIqcProjectWorkbook = (workbook) => {
  if (workbook.SheetNames.length < 3) return false;
  const firstMatrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
  const firstHeaderIndex = findHeader(firstMatrix);
  const firstHeaders = new Set((firstMatrix[firstHeaderIndex] || []).map(text));
  const firstName = text(workbook.SheetNames[0]);
  const firstLooksSummary = firstName.includes("\u6c47\u603b") || (firstHeaders.has("\u5e74\u4efd") && firstHeaders.has("\u6765\u6599\u6279\u6b21"));
  if (!firstLooksSummary) return false;
  return workbook.SheetNames.slice(1, 3).some((sheetName) => {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
    const headerIndex = findHeader(matrix);
    const headers = new Set((matrix[headerIndex] || []).map(text));
    return headers.has("\u4f9b\u5e94\u5546") && headers.has("\u8d28\u68c0\u7ed3\u679c") && headers.has("\u68c0\u9a8c\u5f00\u59cb\u65f6\u95f4");
  });
};

const iqcProjectRows = (workbook, fileName) => {
  const rows = [];
  const project = iqcProjectName(fileName);
  workbook.SheetNames.slice(1, 3).forEach((sheetName) => {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
    const headerIndex = findHeader(matrix);
    const headers = matrix[headerIndex].map(text);
    if (!headers.includes("\u4f9b\u5e94\u5546") || !headers.includes("\u8d28\u68c0\u7ed3\u679c")) return;
    const sheetYear = sheetName.includes("2026") || sheetName.includes("26") ? 2026 : sheetName.includes("2025") || sheetName.includes("25") ? 2025 : null;
    matrix.slice(headerIndex + 1).forEach((values) => {
      if (!values.some((v) => text(v))) return;
      const row = { __project: project, __sourceSheet: sheetName, __projectYear: sheetYear };
      headers.forEach((h, i) => { if (h) row[h] = values[i]; });
      if (text(row["\u4f9b\u5e94\u5546"])) rows.push(row);
    });
  });
  return rows;
};

const detectModule = (fileName, rows) => {
  const columns = new Set(Object.keys(rows[0] || {}));
  if (columns.has("供应商") && columns.has("质检结果")) return "IQC";
  if ((columns.has("治具数量") || columns.has("送检数")) && (columns.has("异常问题数量") || columns.has("不良治具数量") || columns.has("不良数"))) return "IPQC";
  if (columns.has("UUID") || (columns.has("设备评分") && columns.has("售后设备评分")) || fileName.includes("评分")) return "OQC";
  if (fileName.includes("加工件数量比例") || columns.has("__partKind")) return "DQA";
  if (columns.has("问题描述") || columns.has("评审问题数") || fileName.includes("研发问题") || fileName.includes("评审问题") || fileName.includes("ECN")) return "DQA";
  return "UNKNOWN";
};

export async function parseFiles(files) {
  const parsed = [];
  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    const isOqcMonthlySummary = file.name.includes("评分按月汇总");
    const isMachinedParts = isMachinedPartsWorkbook(file.name, workbook);
    const isEcnSummary = !isMachinedParts && file.name.includes("ECN");
    const isIqcProject = !isEcnSummary && !isOqcMonthlySummary && isIqcProjectWorkbook(workbook);
    const rows = isOqcMonthlySummary ? oqcMonthlySummaryRows(workbook) : isMachinedParts ? machinedPartRows(workbook, file.name) : isEcnSummary ? ecnRows(workbook) : isIqcProject ? iqcProjectRows(workbook, file.name) : sheetRows(workbook);
    rows.forEach((row) => {
      if (row["治具数量"] == null && row["送检数"] != null) row["治具数量"] = row["送检数"];
      if (row["异常问题数量"] == null && row["不良数"] != null) row["异常问题数量"] = row["不良数"];
      if (row["治具类型"] == null && row["组件类型"] != null) row["治具类型"] = row["组件类型"];
      if (file.name.includes("评审问题") && row["评审问题数"] == null && row["数量"] != null) row["评审问题数"] = row["数量"];
      if (file.name.includes("评审问题") && row["下单日期"] == null && row["时间"] != null) row["下单日期"] = row["时间"];
    });
    parsed.push({
      name: file.name,
      size: file.size,
      module: detectModule(file.name, rows),
      rows,
      sheets: workbook.SheetNames,
      kind: isOqcMonthlySummary ? "OQC_MONTHLY_SUMMARY" : isMachinedParts ? "DQA_MACHINED_PARTS" : isIqcProject ? "IQC_FOCUS_PROJECT" : "STANDARD",
      subKind: isMachinedParts ? "DQA_MACHINED_PARTS" : isEcnSummary ? "DQA_ECN" : isIqcProject ? "IQC_FOCUS_PROJECT" : undefined,
      projectName: isIqcProject ? iqcProjectName(file.name) : undefined,
      importedAt: new Date().toISOString(),
    });
  }
  return parsed;
}

const groupCount = (items, getter) => {
  const map = new Map();
  items.forEach((item) => {
    const key = getter(item);
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
};

const yearOf = (value) => {
  const d = businessDate(value);
  return d ? d.getFullYear() : null;
};

const monthOf = (value) => {
  const d = businessDate(value);
  return d ? d.getMonth() + 1 : null;
};

const comparisonMonths = (dateRange) => {
  const ranges = [
    [dateRange?.start2025, dateRange?.end2025],
    [dateRange?.start2026, dateRange?.end2026],
  ];
  const months = new Set();
  ranges.forEach(([start, end]) => {
    if (!start || !end) return;
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const finish = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (cursor <= finish) {
      months.add(cursor.getMonth() + 1);
      cursor.setMonth(cursor.getMonth() + 1);
    }
  });
  return months.size ? [...months].sort((a, b) => a - b) : Array.from({ length: 12 }, (_, index) => index + 1);
};

const MODULE_DATE_FIELDS = {
  IQC: ["检验开始时间"],
  IPQC: ["日期", "检验日期", "发生日期"],
  OQC: ["发货时间", "日期", "评分日期"],
  DQA: ["发生日期", "下单日期", "时间", "日期", "申请日期", "制单日期"],
};

const dateOfRow = (row, module) => {
  const field = (MODULE_DATE_FIELDS[module] || []).find((name) => row[name] != null && text(row[name]));
  if (!field) return null;
  const value = row[field];
  return businessDate(value);
};

const filterFilesByDate = (files, dateRange) => {
  const periods = [
    [dateRange?.start2025, dateRange?.end2025],
    [dateRange?.start2026, dateRange?.end2026],
  ].filter(([start, end]) => start && end).map(([start, end]) => ({
    start: new Date(`${start}T00:00:00`),
    end: new Date(`${end}T23:59:59.999`),
  }));
  if (!periods.length) return files;
  return files.map((file) => ({
    ...file,
    rows: file.rows.filter((row) => {
      let date = dateOfRow(row, file.module);
      if (date && file.module === "DQA" && file.name.startsWith("25年评审问题")) {
        date = new Date(2025, date.getMonth(), date.getDate());
      }
      return date && periods.some((period) => date >= period.start && date <= period.end);
    }),
  }));
};

const IQC_MAIN_SUPPLIERS = {
  深圳: { 金盛金属: "大板", 海易鸿: "铜块", 睿辉: "针模", 鑫科拓威: "非金属", 晟鑫: "非金属", "铭耀（钣金）": "钣金", "明安信（三乐）": "铝件", 兴日鑫: "铝件", 奋为: "针模" },
  杭州: { 多加: "钣金", 鑫科拓威: "铝件非金属", 品盈: "铝件", 棋康: "车床件", 睿辉: "针模", 新翼: "小钣金", "博之旭（昆山）": "铝件", 昶晟: "钣金、机柜", 鸿潞: "车床件", "优之达（原新达NT）": "钢件", 锌傲翔: "大板", "上龛（苏州）": "铝件" },
};

const supplierBaseName = (value) => text(value).replace(/[（(].*?[）)]/g, "").trim();

const iqcSite = (fileName) => fileName.includes("杭州") ? "杭州" : "深圳";

const matchesProcessingType = (row, type) => {
  const category = text(row["材质分类"]);
  const material = text(row["材质"]);
  if (type === "大板" || type === "钢件") return category.includes("钢件");
  if (type === "铜块") return category.includes("铜");
  if (type === "针模") return /非金属|针模|PEEK|PAI/i.test(category);
  if (type === "非金属") return /非金属|PEEK|PAI|POM|PEI|FR4/i.test(category);
  if (["钣金", "小钣金", "钣金、机柜"].includes(type)) return material.toUpperCase().includes("Q235");
  if (type === "铝件") return category.includes("铝");
  if (type === "铝件非金属") return /铝|非金属|PEEK|PAI|POM|PEI|FR4/i.test(category);
  if (type === "车床件") return category.includes("车床");
  return true;
};

const iqcIssueText = (row) => row["异常原因"] ?? row["质检说明"] ?? row["异常描述"] ?? "";
const ipqcSite = (fileName) => fileName.includes("杭州") ? "杭州" : "深圳";

const iqcResult = (row) => text(row["质检结果"]);
const iqcIsInternal = (row) => /一楼自制|内部加工/i.test(text(row["供应商"]));
const iqcIsGood = (row, specialAsBad = false) => iqcResult(row) === "合格" || (!specialAsBad && iqcResult(row) === "特采");
const iqcSpecialEvidence = (row) => {
  const reason = text(row["异常原因"]);
  const note = text(row["质检说明"]);
  const source = `${reason} ${note}`;
  const spec = /图纸|要求|公差|尺寸|硬度|材质|粗糙度|表面处理|喷漆|镀|丝印|颜色|厚度|平面度|垂直度|同轴度|位置度/i.test(source);
  const explicitGap = /图纸要求|要求.{0,12}(实测|实际|来料)|实测.{0,12}(低于|高于|为)|材质(错误|不符)|尺寸.{0,8}(超差|不符)|公差/i.test(source);
  const acceptedUse = /不影响|可用|可接受|不影响装配|不影响功能|功能正常|组装正常|急用|让步|特采|放行/i.test(note);
  const documentIssue = /图纸(错误|有误|漏标|未标|标注)|BOM|版本|资料(错误|有误|不一致)/i.test(source);
  const manufacturing = /划伤|磕碰|生锈|变形|毛刺|漏(印|漆|镀|加工)|喷漆不均|破损|脏污|加工错误|孔位错误|少孔|多孔/i.test(source);
  if (documentIssue) return { category: "设计资料问题", level: "高", evidence: "图纸/BOM/版本信息存在错误或不一致" };
  if (spec && acceptedUse) return { category: "疑似过度设计", level: "高", evidence: "偏离设计规格但质检说明确认不影响装配/功能并放行" };
  if (spec && explicitGap) return { category: "疑似过度设计", level: "中", evidence: "偏离材质、硬度、公差或表面要求后仍被特采放行" };
  if (manufacturing) return { category: "供应商制造偏差", level: "高", evidence: "原因指向加工、外观或防护过程偏差" };
  return { category: "证据不足/其他", level: "低", evidence: "现有描述不足以区分设计要求与制造偏差" };
};

const buildIqcDetails = (iqcFiles, dateRange, specialAsBad = false) => {
  const siteRows = { 深圳: [], 杭州: [] };
  iqcFiles.forEach((file) => {
    const site = iqcSite(file.name);
    file.rows.forEach((row) => {
      if (iqcIsInternal(row)) return;
      siteRows[site].push(row);
    });
  });

  const siteMonthly = {};
  const issueBySite = {};
  const materialBySite = {};
  const mainSuppliers = {};
  const supplierCandidates = {};

  Object.entries(siteRows).forEach(([site, rows]) => {
    const processingRows = rows.filter((row) => !/PCB|标准件|电子|电气/i.test(text(row["材质分类"])));
    siteMonthly[site] = comparisonMonths(dateRange).map((month) => {
      const stats = {};
      [2025, 2026].forEach((year) => {
        const filtered = rows.filter((row) => yearOf(row["检验开始时间"]) === year && monthOf(row["检验开始时间"]) === month);
        const good = filtered.filter((row) => iqcIsGood(row, specialAsBad)).length;
        stats[`y${year}Qty`] = filtered.length;
        stats[`y${year}Bad`] = filtered.length - good;
        stats[`y${year}Rate`] = filtered.length ? Number((good / filtered.length * 100).toFixed(1)) : 0;
      });
      return { month: `${month}月`, ...stats };
    });

    const issueCounts = { 2025: new Map(), 2026: new Map() };
    processingRows.filter((row) => iqcResult(row) === "不合格").forEach((row) => {
      const year = yearOf(row["检验开始时间"]);
      if (!issueCounts[year]) return;
      const category = classify(iqcIssueText(row), rules.iqc);
      issueCounts[year].set(category, (issueCounts[year].get(category) || 0) + 1);
    });
    const allIssues = [...new Set([...issueCounts[2025].keys(), ...issueCounts[2026].keys()])];
    const totals = { 2025: [...issueCounts[2025].values()].reduce((a, b) => a + b, 0), 2026: [...issueCounts[2026].values()].reduce((a, b) => a + b, 0) };
    issueBySite[site] = allIssues.map((name) => ({
      name,
      y2025Count: issueCounts[2025].get(name) || 0,
      y2026Count: issueCounts[2026].get(name) || 0,
      y2025Share: Number(((issueCounts[2025].get(name) || 0) / Math.max(totals[2025], 1) * 100).toFixed(1)),
      y2026Share: Number(((issueCounts[2026].get(name) || 0) / Math.max(totals[2026], 1) * 100).toFixed(1)),
    })).sort((a, b) => b.y2026Count - a.y2026Count).slice(0, 10);

    const materials = [...new Set(processingRows.map((row) => text(row["材质分类"]) || "未分类"))];
    materialBySite[site] = materials.map((name) => {
      const result = { name };
      [2025, 2026].forEach((year) => {
        const filtered = processingRows.filter((row) => yearOf(row["检验开始时间"]) === year && (text(row["材质分类"]) || "未分类") === name);
        const good = filtered.filter((row) => iqcIsGood(row, specialAsBad)).length;
        result[`y${year}Qty`] = filtered.length;
        result[`y${year}Bad`] = filtered.length - good;
        result[`y${year}Rate`] = filtered.length ? Number((good / filtered.length * 100).toFixed(1)) : 0;
      });
      return result;
    }).filter((x) => x.y2025Qty + x.y2026Qty >= 50).sort((a, b) => b.y2026Qty - a.y2026Qty).slice(0, 12);

    const supplierStats = (supplier, type, useTypeFilter = true) => {
      const supplierRows = processingRows.filter((row) => supplierBaseName(row["供应商"]) === supplierBaseName(supplier));
      const matched = useTypeFilter ? supplierRows.filter((row) => matchesProcessingType(row, type)) : [];
      const source = matched.length ? matched : supplierRows;
      const result = { supplier, type };
      [2025, 2026].forEach((year) => {
        const filtered = source.filter((row) => yearOf(row["检验开始时间"]) === year);
        const good = filtered.filter((row) => iqcIsGood(row, specialAsBad)).length;
        result[`y${year}Qty`] = filtered.length;
        result[`y${year}Bad`] = filtered.length - good;
        result[`y${year}Rate`] = filtered.length ? Number((good / filtered.length * 100).toFixed(1)) : 0;
      });
      return result;
    };

    mainSuppliers[site] = Object.entries(IQC_MAIN_SUPPLIERS[site]).map(([supplier, type]) => supplierStats(supplier, type));
    const mainNames = new Set(mainSuppliers[site].map((row) => supplierBaseName(row.supplier)));
    const supplierNames = [...new Set(processingRows.map((row) => text(row["供应商"])).filter(Boolean))];
    supplierCandidates[site] = supplierNames
      .filter((supplier) => !mainNames.has(supplierBaseName(supplier)))
      .map((supplier) => {
        const supplierRows = processingRows.filter((row) => text(row["供应商"]) === supplier);
        const typeCounts = new Map();
        supplierRows.forEach((row) => {
          const type = text(row["材质分类"]) || "未分类";
          typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
        });
        const type = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "未分类";
        return supplierStats(supplier, type, false);
      })
      .filter((row) => row.y2025Qty + row.y2026Qty > 0)
      .sort((a, b) => (b.y2025Qty + b.y2026Qty) - (a.y2025Qty + a.y2026Qty));
  });
  return { siteMonthly, issueBySite, materialBySite, mainSuppliers, supplierCandidates };
};



const iqcProjectIssueCategory = (row) => {
  const source = text(row["\u8d28\u68c0\u8bf4\u660e"]).toLowerCase().replace(/\s/g, "");
  if (!source) return "\u65e0\u8bf4\u660e";
  if (/\u5212\u75d5|\u522e\u82b1|\u78d5|\u78b0|\u4fee\u8865|\u7f3a\u5c11|\u7834\u635f|\u538b\u4f24|\u810f\u6c61/.test(source)) return "\u5916\u89c2/\u78d5\u78b0\u5212\u4f24";
  if (/\u5c3a\u5bf8|\u516c\u5dee|\u5b9e\u6d4b|\u539a\u5ea6|\u957f\u5ea6|\u5bbd\u5ea6|\u9ad8\u5ea6|\u8d85\u5dee/.test(source)) return "\u5c3a\u5bf8/\u516c\u5dee\u5f02\u5e38";
  if (/\u5b54|\u7259\u7eb9|\u87ba\u7eb9|m\d+|\u03c6|\u76f4\u5f84|\u62e7\u4e0d\u52a8/.test(source)) return "\u5b54\u4f4d/\u7259\u7eb9\u5f02\u5e38";
  if (/\u6c27\u5316|\u989c\u8272|\u53d1\u9ed1|\u55b7|\u9540|\u8868\u9762\u5904\u7406|\u62db\u5149|\u955c\u9762/.test(source)) return "\u8868\u9762\u5904\u7406\u5f02\u5e38";
  if (/\u53d8\u5f62|\u6bdb\u523a|\u62ab\u950b|\u9510\u8fb9|\u5012\u89d2/.test(source)) return "\u53d8\u5f62/\u6bdb\u523a\u9510\u8fb9";
  return "\u5176\u5b83\u5f02\u5e38";
};

const buildIqcFocusProjects = (projectFiles, dateRange) => {
  const projectMap = new Map();
  projectFiles.forEach((file) => {
    const project = file.projectName || file.rows[0]?.__project || iqcProjectName(file.name);
    if (!projectMap.has(project)) projectMap.set(project, []);
    projectMap.get(project).push(...file.rows.map((row) => ({ ...row, __project: project })));
  });
  const years = [2025, 2026];
  const yearStats = (rows, predicate = () => true) => {
    const result = {};
    years.forEach((year) => {
      const source = rows.filter((row) => predicate(row) && (yearOf(row["\u68c0\u9a8c\u5f00\u59cb\u65f6\u95f4"]) || row.__projectYear) === year);
      const qualified = source.filter((row) => text(row["\u8d28\u68c0\u7ed3\u679c"]) === "\u5408\u683c").length;
      const special = source.filter((row) => text(row["\u8d28\u68c0\u7ed3\u679c"]) === "\u7279\u91c7").length;
      const rejected = source.filter((row) => text(row["\u8d28\u68c0\u7ed3\u679c"]) === "\u4e0d\u5408\u683c").length;
      const abnormal = source.length - qualified;
      result[year] = { total: source.length, qualified, rejected, special, abnormal, rate: Number((qualified / Math.max(source.length, 1) * 100).toFixed(1)), specialShare: Number((special / Math.max(abnormal, 1) * 100).toFixed(1)) };
    });
    return result;
  };
  const projectRows = [...projectMap.entries()].map(([name, rows]) => {
    const stats = yearStats(rows);
    return { name, y2025Qty: stats[2025].total, y2025Bad: stats[2025].abnormal, y2025Rate: stats[2025].rate, y2026Qty: stats[2026].total, y2026Bad: stats[2026].abnormal, y2026Rate: stats[2026].rate, y2025Special: stats[2025].special, y2026Special: stats[2026].special, y2025SpecialShare: stats[2025].specialShare, y2026SpecialShare: stats[2026].specialShare, delta: Number((stats[2026].rate - stats[2025].rate).toFixed(1)) };
  }).sort((a, b) => b.y2026Qty - a.y2026Qty);
  const byProject = Object.fromEntries([...projectMap.entries()].map(([project, rows]) => {
    const supplierNames = [...new Set(rows.map((row) => text(row["\u4f9b\u5e94\u5546"])).filter(Boolean))];
    const suppliers = supplierNames.map((supplier) => {
      const stats = yearStats(rows, (row) => text(row["\u4f9b\u5e94\u5546"]) === supplier);
      const materialCounts = new Map();
      rows.filter((row) => text(row["\u4f9b\u5e94\u5546"]) === supplier).forEach((row) => {
        const material = text(row["\u6750\u8d28\u5206\u7c7b"]) || "\u672a\u5206\u7c7b";
        materialCounts.set(material, (materialCounts.get(material) || 0) + 1);
      });
      const type = [...materialCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "\u672a\u5206\u7c7b";
      return { supplier, type, y2025Qty: stats[2025].total, y2025Bad: stats[2025].abnormal, y2025Rate: stats[2025].rate, y2026Qty: stats[2026].total, y2026Bad: stats[2026].abnormal, y2026Rate: stats[2026].rate, delta: Number((stats[2026].rate - stats[2025].rate).toFixed(1)) };
    }).filter((row) => row.y2025Qty + row.y2026Qty > 0).sort((a, b) => b.y2026Qty - a.y2026Qty);
    const issueCounts = { 2025: new Map(), 2026: new Map() };
    rows.filter((row) => text(row["\u8d28\u68c0\u7ed3\u679c"]) !== "\u5408\u683c").forEach((row) => {
      const year = yearOf(row["\u68c0\u9a8c\u5f00\u59cb\u65f6\u95f4"]) || row.__projectYear;
      if (!issueCounts[year]) return;
      const category = iqcProjectIssueCategory(row);
      issueCounts[year].set(category, (issueCounts[year].get(category) || 0) + 1);
    });
    const issueNames = [...new Set([...issueCounts[2025].keys(), ...issueCounts[2026].keys()])];
    const totals = { 2025: [...issueCounts[2025].values()].reduce((sum, value) => sum + value, 0), 2026: [...issueCounts[2026].values()].reduce((sum, value) => sum + value, 0) };
    const issues = issueNames.map((name) => ({ name, y2025Count: issueCounts[2025].get(name) || 0, y2026Count: issueCounts[2026].get(name) || 0, y2025Share: Number(((issueCounts[2025].get(name) || 0) / Math.max(totals[2025], 1) * 100).toFixed(1)), y2026Share: Number(((issueCounts[2026].get(name) || 0) / Math.max(totals[2026], 1) * 100).toFixed(1)) })).sort((a, b) => b.y2026Count - a.y2026Count);
    return [project, { suppliers, issues }];
  }));
  return { projects: projectRows, byProject };
};

const buildIqcSpecialAnalysis = (iqcFiles, dateRange) => {
  const siteRows = { 深圳: [], 杭州: [] };
  const allSiteRows = { 深圳: [], 杭州: [] };
  iqcFiles.forEach((file) => {
    const site = iqcSite(file.name);
    file.rows.forEach((row) => {
      if (iqcIsInternal(row)) return;
      allSiteRows[site].push(row);
      if (iqcResult(row) === "特采") siteRows[site].push(row);
    });
  });
  const bySite = {};
  Object.entries(siteRows).forEach(([site, rows]) => {
    const monthly = comparisonMonths(dateRange).map((month) => {
      const result = { month: `${month}月` };
      [2025, 2026].forEach((year) => {
        const allRows = allSiteRows[site].filter((row) => yearOf(row["检验开始时间"]) === year && monthOf(row["检验开始时间"]) === month);
        const special = rows.filter((row) => yearOf(row["检验开始时间"]) === year && monthOf(row["检验开始时间"]) === month).length;
        result[`y${year}Qty`] = allRows.length;
        result[`y${year}Bad`] = special;
        result[`y${year}Rate`] = Number((special / Math.max(allRows.length, 1) * 100).toFixed(2));
      });
      return result;
    });
    const dimension = (getter, limit = 12) => {
      const names = [...new Set(rows.map(getter).filter(Boolean))];
      return names.map((name) => {
        const result = { name };
        [2025, 2026].forEach((year) => {
          const count = rows.filter((row) => yearOf(row["检验开始时间"]) === year && getter(row) === name).length;
          const total = rows.filter((row) => yearOf(row["检验开始时间"]) === year).length;
          result[`y${year}Count`] = count;
          result[`y${year}Share`] = Number((count / Math.max(total, 1) * 100).toFixed(1));
        });
        return result;
      }).sort((a, b) => b.y2026Count - a.y2026Count).slice(0, limit);
    };
    const materials = dimension((row) => text(row["材质分类"]) || "未分类");
    const suppliers = dimension((row) => text(row["供应商"]) || "未填写", 15).map((item) => {
      [2025, 2026].forEach((year) => {
        const supplierAll = allSiteRows[site].filter((row) => yearOf(row["检验开始时间"]) === year && text(row["供应商"]) === item.name).length;
        item[`y${year}Rate`] = Number((item[`y${year}Count`] / Math.max(supplierAll, 1) * 100).toFixed(2));
      });
      return item;
    });
    const evidenceRows = rows.map((row) => {
      const result = iqcSpecialEvidence(row);
      return {
        year: yearOf(row["检验开始时间"]), supplier: text(row["供应商"]) || "未填写",
        material: text(row["材质分类"]) || "未分类", reason: text(row["异常原因"]) || "未填写",
        note: text(row["质检说明"]) || "未填写", ...result,
      };
    });
    const evidenceValues = ["疑似过度设计", "设计资料问题", "供应商制造偏差", "证据不足/其他"];
    const evidence = evidenceValues.map((name) => {
      const result = { name };
      [2025, 2026].forEach((year) => {
        const count = evidenceRows.filter((row) => row.year === year && row.category === name).length;
        const total = evidenceRows.filter((row) => row.year === year).length;
        result[`y${year}Count`] = count;
        result[`y${year}Share`] = Number((count / Math.max(total, 1) * 100).toFixed(1));
      });
      return result;
    });
    const allDesignEvidence = evidenceRows.filter((row) => row.category === "疑似过度设计");
    const designEvidence = [...allDesignEvidence]
      .sort((a, b) => Number(b.level === "高") - Number(a.level === "高")).slice(0, 50);
    bySite[site] = {
      monthly, materials, suppliers, evidence, designEvidence,
      designEvidenceTotal: allDesignEvidence.length,
      highDesignEvidenceTotal: allDesignEvidence.filter((row) => row.level === "高").length,
    };
  });
  return bySite;
};

const buildIqcInternalAnalysis = (iqcFiles, dateRange, specialAsBad = false) => {
  const bySite = {};
  ["深圳", "杭州"].forEach((site) => {
    const rows = iqcFiles.filter((file) => iqcSite(file.name) === site).flatMap((file) => file.rows)
      .filter((row) => iqcIsInternal(row));
    const monthly = comparisonMonths(dateRange).map((month) => {
      const result = { month: `${month}月` };
      [2025, 2026].forEach((year) => {
        const source = rows.filter((row) => yearOf(row["检验开始时间"]) === year && monthOf(row["检验开始时间"]) === month);
        const good = source.filter((row) => iqcIsGood(row, specialAsBad)).length;
        result[`y${year}Qty`] = source.length;
        result[`y${year}Bad`] = source.length - good;
        result[`y${year}Rate`] = Number((good / Math.max(source.length, 1) * 100).toFixed(1));
      });
      return result;
    });
    const issueMaps = { 2025: new Map(), 2026: new Map() };
    rows.filter((row) => iqcResult(row) === "不合格").forEach((row) => {
      const year = yearOf(row["检验开始时间"]);
      if (!issueMaps[year]) return;
      const name = classify(iqcIssueText(row), rules.iqc);
      issueMaps[year].set(name, (issueMaps[year].get(name) || 0) + 1);
    });
    const issueTotals = Object.fromEntries([2025, 2026].map((year) => [year, [...issueMaps[year].values()].reduce((a, b) => a + b, 0)]));
    const issues = [...new Set([...issueMaps[2025].keys(), ...issueMaps[2026].keys()])].map((name) => ({
      name,
      y2025Count: issueMaps[2025].get(name) || 0,
      y2026Count: issueMaps[2026].get(name) || 0,
      y2025Share: Number(((issueMaps[2025].get(name) || 0) / Math.max(issueTotals[2025], 1) * 100).toFixed(1)),
      y2026Share: Number(((issueMaps[2026].get(name) || 0) / Math.max(issueTotals[2026], 1) * 100).toFixed(1)),
    })).sort((a, b) => b.y2026Count - a.y2026Count).slice(0, 10);
    const materialNames = [...new Set(rows.map((row) => text(row["材质分类"]) || "未分类"))];
    const materials = materialNames.map((name) => {
      const result = { name };
      [2025, 2026].forEach((year) => {
        const source = rows.filter((row) => yearOf(row["检验开始时间"]) === year && (text(row["材质分类"]) || "未分类") === name);
        const good = source.filter((row) => iqcIsGood(row, specialAsBad)).length;
        result[`y${year}Qty`] = source.length;
        result[`y${year}Bad`] = source.length - good;
        result[`y${year}Rate`] = Number((good / Math.max(source.length, 1) * 100).toFixed(1));
      });
      return result;
    }).filter((row) => row.y2025Qty + row.y2026Qty > 0).sort((a, b) => b.y2026Qty - a.y2026Qty);
    bySite[site] = { monthly, issues, materials };
  });
  return bySite;
};

const buildIpqcDetails = (ipqcFiles, dateRange) => {
  const siteRows = { 深圳: [], 杭州: [] };
  ipqcFiles.forEach((file) => {
    const site = ipqcSite(file.name);
    file.rows.forEach((row) => siteRows[site].push(row));
  });
  const siteMonthly = {};
  const workshopsBySite = {};
  const rawTypesBySite = {};
  const heatmapBySite = {};
  const improvementsBySite = {};

  Object.entries(siteRows).forEach(([site, rows]) => {
    const summarize = (source, year) => {
      const filtered = source.filter((row) => yearOf(row["日期"]) === year);
      const qty = filtered.reduce((sum, row) => sum + ipqcQty(row), 0);
      const issues = filtered.reduce((sum, row) => sum + ipqcBad(row), 0);
      return { qty, issues, rate: Number((issues / Math.max(qty, 1) * 100).toFixed(2)) };
    };
    siteMonthly[site] = comparisonMonths(dateRange).map((month) => {
      const result = { month: `${month}月` };
      [2025, 2026].forEach((year) => {
        const stats = summarize(rows.filter((row) => monthOf(row["日期"]) === month), year);
        result[`y${year}Qty`] = stats.qty;
        result[`y${year}Bad`] = stats.issues;
        result[`y${year}Rate`] = stats.rate;
      });
      return result;
    });

    const workshopNames = [...new Set(rows.map((row) => text(row["产品工坊"]) || "未分类"))];
    workshopsBySite[site] = workshopNames.map((name) => {
      const result = { name };
      [2025, 2026].forEach((year) => {
        const stats = summarize(rows.filter((row) => (text(row["产品工坊"]) || "未分类") === name), year);
        result[`y${year}Qty`] = stats.qty;
        result[`y${year}Bad`] = stats.issues;
        result[`y${year}Rate`] = stats.rate;
      });
      return result;
    }).filter((row) => row.y2025Qty + row.y2026Qty > 0)
      .sort((a, b) => b.y2026Bad - a.y2026Bad);

    const categoryRows = (getter) => {
      const maps = { 2025: new Map(), 2026: new Map() };
      rows.forEach((row) => {
        const year = yearOf(row["日期"]);
        const issues = ipqcBad(row);
        if (!maps[year] || issues <= 0) return;
        const name = getter(row);
        maps[year].set(name, (maps[year].get(name) || 0) + issues);
      });
      const totals = {
        2025: [...maps[2025].values()].reduce((a, b) => a + b, 0),
        2026: [...maps[2026].values()].reduce((a, b) => a + b, 0),
      };
      return [...new Set([...maps[2025].keys(), ...maps[2026].keys()])].map((name) => ({
        name,
        y2025Count: maps[2025].get(name) || 0,
        y2026Count: maps[2026].get(name) || 0,
        y2025Share: Number(((maps[2025].get(name) || 0) / Math.max(totals[2025], 1) * 100).toFixed(1)),
        y2026Share: Number(((maps[2026].get(name) || 0) / Math.max(totals[2026], 1) * 100).toFixed(1)),
      })).sort((a, b) => b.y2026Count - a.y2026Count);
    };
    rawTypesBySite[site] = categoryRows((row) => text(row["不良类型"]) || "未分类").slice(0, 12);
    const categories = rawTypesBySite[site].slice(0, 8).map((row) => row.name);
    heatmapBySite[site] = {
      categories,
      rows: workshopNames.map((workshop) => ({
        name: workshop,
        values: categories.map((category) => rows.reduce((sum, row) => {
          if ((text(row["产品工坊"]) || "未分类") !== workshop || (text(row["不良类型"]) || "未分类") !== category) return sum;
          return sum + ipqcBad(row);
        }, 0)),
      })).filter((row) => row.values.some((value) => value > 0)),
    };

    const actionMap = {
      "螺丝问题": ["生产工艺/IPQC", "建立扭矩标准、关键螺丝点检清单和防松标识；首件及巡检复核扭矩。"],
      "接线问题": ["电气装配/工艺", "发布端子与线序图册，实施首件接线互检、拉力抽检和通电前点对点检查。"],
      "装配问题": ["工坊主管/IPQC", "增加装配齐套清单、标准照片和完工自检签字；高频错误导入工位防错。"],
      "来料问题": ["IQC/SQE", "建立来料问题清单和供应商闭环机制，对重复异常执行加严检验与供应商改善。"],
      "设计问题": ["研发/项目", "在开工前完成3D干涉、装配可达性和资料齐套检查，问题反向纳入设计评审。"],
      "研发问题": ["研发/项目", "冻结图纸与BOM版本，变更必须通过ECN并同步生产现场。"],
      "螺丝/紧固": ["生产工艺/IPQC", "建立扭矩标准、关键螺丝点检清单和防松标识；首件及巡检复核扭矩。"],
      "接线/线缆": ["电气装配/工艺", "发布端子与线序图册，实施首件接线互检、拉力抽检和通电前点对点检查。"],
      "漏装/错装/反装": ["工坊主管/IPQC", "增加齐套清单、工位防错照片和完工自检签字；高频物料导入扫码防错。"],
      "结构干涉/空间": ["研发机构/工艺", "在装配前执行3D干涉检查与首台试装，问题反向纳入设计评审检查表。"],
      "研发设计/资料": ["研发/项目", "冻结图纸与BOM版本，开工前核对资料齐套性，变更必须通过ECN并通知现场。"],
      "气路/管路": ["装配工艺/IPQC", "统一管路走向与接头锁紧标准，增加保压、漏气和弯折半径检查。"],
      "其他": ["IPQC/工坊", "复核原始描述并补充分类字典，对重复问题建立专项检查项。"],
      "无描述": ["IPQC", "强制填写问题现象、位置、责任工序和照片，避免无法闭环。"],
    };
    improvementsBySite[site] = rawTypesBySite[site].slice(0, 6).map((row, index) => {
      const [owner, action] = actionMap[row.name] || actionMap.其他;
      const mainWorkshop = heatmapBySite[site].rows
        .map((item) => ({ name: item.name, count: item.values[categories.indexOf(row.name)] || 0 }))
        .sort((a, b) => b.count - a.count)[0];
      return {
        rank: index + 1, category: row.name, count: row.y2026Count, share: row.y2026Share,
        delta: row.y2026Count - row.y2025Count, workshop: mainWorkshop?.name || "—", owner, action,
      };
    });
  });
  return { siteMonthly, workshopsBySite, rawTypesBySite, heatmapBySite, improvementsBySite };
};

const buildOqcMonthlySummary = (rows, dateRange) => {
  const allowedDivisions = ["产品一部", "产品五部", "FPC事业部"];
  const fpcTpms = ["刘波", "王辉", "罗超", "林秋秋", "朱慧慧"];
  const metrics = (source) => {
    const count = source.reduce((sum, row) => sum + number(row["数量"]), 0);
    const scoreTotal = source.reduce((sum, row) => sum + number(row["评分档位"]) * number(row["数量"]), 0);
    const five = source.filter((row) => number(row["评分档位"]) === 5).reduce((sum, row) => sum + number(row["数量"]), 0);
    const low = source.filter((row) => number(row["评分档位"]) <= 3).reduce((sum, row) => sum + number(row["数量"]), 0);
    return {
      count,
      scoreTotal,
      five,
      low,
      avg: Number((scoreTotal / Math.max(count, 1)).toFixed(2)),
      fiveRate: Number((five / Math.max(count, 1) * 100).toFixed(1)),
      lowRate: Number((low / Math.max(count, 1) * 100).toFixed(1)),
    };
  };
  const compareRows = (names, field) => names.map((name) => {
    const result = { name };
    [2025, 2026].forEach((year) => {
      const value = metrics(rows.filter((row) => text(row[field]) === name && number(row["年份"]) === year));
      result[`y${year}Count`] = value.count;
      result[`y${year}ScoreTotal`] = value.scoreTotal;
      result[`y${year}Five`] = value.five;
      result[`y${year}Low`] = value.low;
      result[`y${year}Avg`] = value.avg;
      result[`y${year}FiveRate`] = value.fiveRate;
      result[`y${year}LowRate`] = value.lowRate;
    });
    return result;
  });
  const monthly = (filter) => comparisonMonths(dateRange).map((month) => {
    const result = { month: `${month}月` };
    [2025, 2026].forEach((year) => {
      const value = metrics(rows.filter((row) => filter(row) && number(row["年份"]) === year && number(row["月份"]) === month));
      result[`y${year}Count`] = value.count;
      result[`y${year}ScoreTotal`] = value.scoreTotal;
      result[`y${year}Five`] = value.five;
      result[`y${year}Low`] = value.low;
      result[`y${year}Avg`] = value.avg;
      result[`y${year}FiveRate`] = value.fiveRate;
      result[`y${year}LowRate`] = value.lowRate;
    });
    return result;
  });
  const divisions = compareRows(allowedDivisions, "产品部");
  const fpcTpm = compareRows(fpcTpms, "TPM");
  return {
    divisions,
    fpcTpm,
    divisionMonthly: Object.fromEntries(allowedDivisions.map((division) => [division, monthly((row) => text(row["产品部"]) === division)])),
    fpcMonthly: monthly((row) => text(row["产品部"]) === "FPC事业部"),
  };
};

const displayDivision = (value, fileName = "") => {
  const source = `${text(value)} ${fileName}`;
  if (/产品一部|北美|传感器|半导体|IC载板/i.test(source)) return "半导体&北美";
  if (/产品五部/i.test(source)) return "产品五部";
  if (/FPC/i.test(source)) return "FPC事业部";
  return text(value) || "未分类";
};

const buildDqaDetails = (dqaFiles) => {
  const divisionNames = ["半导体&北美", "产品五部", "FPC事业部"];
  const events = [];
  dqaFiles.forEach((file) => {
    const fileYear = file.name.startsWith("2025") || file.name.startsWith("25年") ? 2025 : file.name.startsWith("2026") ? 2026 : null;
    file.rows.forEach((row) => {
      const isReviewSummary = row["评审问题数"] != null && number(row["评审问题数"]) > 0;
      const dateValue = row["发生日期"] ?? row["下单日期"] ?? row["时间"];
      const year = isReviewSummary && fileYear ? fileYear : yearOf(dateValue) || fileYear;
      if (![2025, 2026].includes(year)) return;
      const division = displayDivision(row["产品部"], file.name);
      if (!divisionNames.includes(division)) return;
      const rawTpm = text(row["TPM"]);
      let tpm = rawTpm && rawTpm !== "/" ? rawTpm : (division === "半导体&北美" ? text(row["产品部"]) || "未分类" : "未分类");
      if (division === "半导体&北美" && /传感器/.test(tpm)) tpm = "传感器产品部";
      if (division === "半导体&北美" && /北美/.test(tpm)) tpm = "北美项目部";
      const stageText = text(row["阶段"] || row["问题发生地"] || row["问题反馈部门"]);
      // 2025 review totals come exclusively from the dedicated review-summary
      // workbooks. Some 2025 detail rows also carry 阶段=评审 and would otherwise
      // duplicate those totals. In 2026, each detailed review row counts once.
      if (!isReviewSummary && year === 2025 && /评审/.test(stageText)) return;
      const stage = isReviewSummary || /评审/.test(stageText)
        ? "评审"
        : /售后|现场/i.test(stageText) ? "现场" : "生产";
      const count = isReviewSummary ? number(row["评审问题数"]) : text(row["问题描述"]) ? 1 : 0;
      if (!count) return;
      events.push({
        year, division, tpm, stage, count,
        category: stage === "评审" ? "" : text(row["问题分类"] || row["类别"]) || "未分类",
        discipline: stage === "评审" ? "" : text(row["学科"]) || "未分类",
      });
    });
  });

  const dimensionRows = (entities, entityKey, dimension, values, baseFilter = () => true) => entities.map((entity) => ({
    name: entity,
    years: [2025, 2026].map((year) => {
      const source = events.filter((event) => baseFilter(event) && event[entityKey] === entity && event.year === year);
      const counts = Object.fromEntries(values.map((value) => [
        value,
        source.filter((event) => event[dimension] === value).reduce((sum, event) => sum + event.count, 0),
      ]));
      return { year, counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
    }),
  }));
  const topValues = (dimension, limit = 8) => {
    const map = new Map();
    events.filter((event) => event[dimension]).forEach((event) => map.set(event[dimension], (map.get(event[dimension]) || 0) + event.count));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name]) => name);
  };
  const stageValues = ["评审", "生产", "现场"];
  const categoryValues = topValues("category", 8);
  const disciplineValues = topValues("discipline", 8);
  const tpmsByDivision = Object.fromEntries(divisionNames.map((division) => [
    division,
    [...new Set(events.filter((event) => event.division === division).map((event) => event.tpm))].filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-CN")),
  ]));
  const byDivision = {
    stages: dimensionRows(divisionNames, "division", "stage", stageValues),
    categories: dimensionRows(divisionNames, "division", "category", categoryValues),
    disciplines: dimensionRows(divisionNames, "division", "discipline", disciplineValues),
  };
  const byTpm = Object.fromEntries(divisionNames.map((division) => {
    const tpms = tpmsByDivision[division];
    return [division, {
      stages: dimensionRows(tpms, "tpm", "stage", stageValues, (event) => event.division === division),
      categories: dimensionRows(tpms, "tpm", "category", categoryValues, (event) => event.division === division),
      disciplines: dimensionRows(tpms, "tpm", "discipline", disciplineValues, (event) => event.division === division),
    }];
  }));
  return { divisionNames, stageValues, categoryValues, disciplineValues, tpmsByDivision, byDivision, byTpm };
};

const ECN_DIVISIONS = ["半导体&北美", "产品五部", "FPC事业部"];
const ECN_TPMS = ["赵佳池", "田乐清", "谢作林", "郑昊翔", "周超", "李亚龙", "王辉", "罗超", "林秋秋", "朱慧慧"];
const ECN_RAW_DIVISIONS = ["IC载板产品部", "北美项目部", "传感器产品部", "产品五部", "FPC事业部"];

const ecnRawDivision = (value) => {
  const source = text(value);
  if (/IC载板/i.test(source)) return "IC载板产品部";
  if (/北美/i.test(source)) return "北美项目部";
  if (/传感器/i.test(source)) return "传感器产品部";
  if (/产品五部/i.test(source)) return "产品五部";
  if (/FPC/i.test(source)) return "FPC事业部";
  return source || "未分类";
};

const ecnMergedDivision = (rawDivision) => ["IC载板产品部", "北美项目部", "传感器产品部"].includes(rawDivision)
  ? "半导体&北美"
  : rawDivision;

const ecnDateRange = (dateRange) => {
  return {
    start2025: dateRange?.start2025 || "2025-01-01",
    end2025: dateRange?.end2025 || "2025-05-31",
    start2026: dateRange?.start2026 || "2026-01-01",
    end2026: dateRange?.end2026 || "2026-05-31",
  };
};

const inEcnPeriod = (date, range) => {
  if (!date) return false;
  const year = date.getFullYear();
  const start = range[`start${year}`];
  const end = range[`end${year}`];
  if (!start || !end) return false;
  return date >= new Date(`${start}T00:00:00`) && date <= new Date(`${end}T23:59:59.999`);
};

const ecnMonths = (range) => {
  const months = new Set();
  [[range.start2025, range.end2025], [range.start2026, range.end2026]].forEach(([start, end]) => {
    if (!start || !end) return;
    const cursor = new Date(`${start}T00:00:00`);
    const finish = new Date(`${end}T00:00:00`);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(finish.getTime())) return;
    const monthCursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthFinish = new Date(finish.getFullYear(), finish.getMonth(), 1);
    while (monthCursor <= monthFinish) {
      months.add(monthCursor.getMonth() + 1);
      monthCursor.setMonth(monthCursor.getMonth() + 1);
    }
  });
  return months.size ? [...months].sort((a, b) => a - b) : [1, 2, 3, 4, 5];
};

const ecnRate = (numerator, denominator) => Number((numerator / Math.max(denominator, 1) * 100).toFixed(2));

const buildEcnDimensionRows = (entities, years, numeratorRows, denominatorRows, entityGetter) => entities.map((entity) => {
  const name = typeof entity === "string" ? entity : entity.name;
  return {
    name,
    division: entity.division,
    tpm: entity.tpm,
    years: years.map((year) => {
      const numerator = numeratorRows.filter((row) => row.year === year && entityGetter(row) === name).length;
      const denominator = denominatorRows.filter((row) => row.year === year && entityGetter(row) === name).reduce((sum, row) => sum + row.materialCount, 0);
      return { year, numerator, denominator, rate: ecnRate(numerator, denominator) };
    }),
  };
});

const buildEcnReasonRows = (entities, values, years, numeratorRows, entityGetter) => entities.map((entity) => {
  const name = typeof entity === "string" ? entity : entity.name;
  return {
    name,
    division: entity.division,
    tpm: entity.tpm,
    years: years.map((year) => {
      const source = numeratorRows.filter((row) => row.year === year && entityGetter(row) === name);
      const counts = Object.fromEntries(values.map((value) => [value, source.filter((row) => row.reason === value).length]));
      return { year, counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
    }),
  };
});

const buildDqaEcn = (dqaFiles, dateRange) => {
  const ecnFiles = dqaFiles.filter((file) => file.subKind === "DQA_ECN" || file.name.includes("ECN") || file.sheets?.some((sheet) => sheet.includes("ECN")));
  if (!ecnFiles.length) return null;
  const range = ecnDateRange(dateRange);
  const numeratorRows = [];
  const denominatorRows = [];
  let blankDenominatorRows = 0;
  ecnFiles.forEach((file) => {
    file.rows.forEach((row) => {
      const sheet = text(row.__sheet);
      const isNumerator = sheet.includes("分子") || row["申请日期"] != null;
      const isDenominator = sheet.includes("分母") || row["制单日期"] != null;
      const date = businessDate(isNumerator ? row["申请日期"] : row["制单日期"]);
      if (!inEcnPeriod(date, range)) return;
      const rawDivision = ecnRawDivision(row["产品部"]);
      const division = ecnMergedDivision(rawDivision);
      if (!ECN_DIVISIONS.includes(division)) return;
      const tpm = text(row["TPM"]);
      const tpmKey = ECN_TPMS.includes(tpm) ? `${rawDivision}\n${tpm}` : "";
      if (isNumerator) {
        numeratorRows.push({
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          division,
          rawDivision,
          tpm,
          tpmKey,
          reason: text(row["变更原因"]) || "未填写",
          attr: text(row["ECN属性"]) || "未填写",
        });
      } else if (isDenominator) {
        const materialCount = number(row["物料款数"]);
        if (materialCount > 0) {
          denominatorRows.push({
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            division,
            rawDivision,
            tpm,
            tpmKey,
            materialCount,
          });
        } else {
          blankDenominatorRows += 1;
        }
      }
    });
  });
  const years = [2025, 2026];
  const months = ecnMonths(range);
  const denominatorByDivision = denominatorRows;
  const denominatorAll = denominatorRows;
  const numeratorByTpm = numeratorRows.filter((row) => row.tpmKey);
  const denominatorByTpm = denominatorRows.filter((row) => row.tpmKey);
  const monthly = months.map((month) => {
    const result = { name: `${month}月` };
    years.forEach((year) => {
      const numerator = numeratorRows.filter((row) => row.year === year && row.month === month).length;
      const denominator = denominatorRows.filter((row) => row.year === year && row.month === month).reduce((sum, row) => sum + row.materialCount, 0);
      result[`y${year}Qty`] = denominator;
      result[`y${year}Bad`] = numerator;
      result[`y${year}Rate`] = ecnRate(numerator, denominator);
    });
    result.delta = Number((result.y2026Rate - result.y2025Rate).toFixed(2));
    return result;
  });
  const divisionRows = buildEcnDimensionRows(ECN_DIVISIONS, years, numeratorRows, denominatorByDivision, (row) => row.division);
  const tpmEntities = ECN_RAW_DIVISIONS.flatMap((division) => ECN_TPMS
    .filter((tpm) => numeratorRows.some((row) => row.rawDivision === division && row.tpm === tpm) || denominatorRows.some((row) => row.rawDivision === division && row.tpm === tpm))
    .map((tpm) => ({ name: `${division}\n${tpm}`, division, tpm })));
  const tpmRows = buildEcnDimensionRows(tpmEntities, years, numeratorByTpm, denominatorByTpm, (row) => row.tpmKey);
  const topReasons = (rows, limit = 10) => {
    const map = new Map();
    rows.forEach((row) => map.set(row.reason, (map.get(row.reason) || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name]) => name);
  };
  const divisionReasonValues = topReasons(numeratorRows, 10);
  const tpmReasonValues = topReasons(numeratorByTpm, 10);
  const totals = years.reduce((result, year) => {
    const numerator = numeratorRows.filter((row) => row.year === year).length;
    const denominator = denominatorAll.filter((row) => row.year === year).reduce((sum, row) => sum + row.materialCount, 0);
    result[year] = { numerator, denominator, rate: ecnRate(numerator, denominator) };
    return result;
  }, {});
  return {
    period: range,
    totals,
    monthly,
    divisions: divisionRows,
    tpms: tpmRows,
    reasonValues: divisionReasonValues,
    tpmReasonValues,
    divisionReasons: buildEcnReasonRows(ECN_DIVISIONS, divisionReasonValues, years, numeratorRows, (row) => row.division),
    tpmReasons: buildEcnReasonRows(tpmEntities, tpmReasonValues, years, numeratorByTpm, (row) => row.tpmKey),
    blankDenominatorRows,
    allReasonValues: topReasons(numeratorRows, 100),
    source: { numeratorRows, denominatorRows, years, months, divisions: ECN_DIVISIONS, tpmEntities },
  };
};

const MACHINED_KIND_KEYS = [
  { key: "ecn", label: "ECN" },
  { key: "nonBom", label: "非BOM" },
];

const machinedDivision = (rawDivision, tpm) => {
  const source = `${text(rawDivision)} ${text(tpm)}`;
  if (!source.trim() || /海外亚太|技术中心|总计|加工件总数/.test(source)) return "";
  if (/产品一部|IC载板|北美|半导体|传感器/.test(source)) return "半导体&北美";
  if (/产品五部/.test(source)) return "产品五部";
  if (/FPC|FCP/.test(source)) return "FPC事业部";
  return "";
};

const machinedTpmName = (row) => {
  const tpm = text(row.TPM);
  const rawDivision = text(row["产品部"]);
  if (tpm) return tpm;
  return rawDivision || "未填写";
};

const machinedRate = (quantity, denominator) => Number((quantity / Math.max(denominator, 1) * 100).toFixed(2));

const sumMachinedDenominator = (denominatorRows, kind, year, month) => denominatorRows
  .filter((row) => row.__partKind === kind && row.年份 === year && (month == null || row.月份 === month))
  .reduce((sum, row) => sum + number(row.数量), 0);

const sumMachinedQuantity = (rows, kind, year, getter, entity, month) => rows
  .filter((row) => row.__partKind === kind && row.年份 === year && (month == null || row.月份 === month) && (!getter || getter(row) === entity))
  .reduce((sum, row) => sum + number(row.数量), 0);

const sumMachinedSummary = (rows, kind, year, summaryName, month) => rows
  .filter((row) => row.__partKind === kind && row.年份 === year && text(row["产品部"]) === summaryName && (month == null || row.月份 === month))
  .reduce((sum, row) => sum + number(row.数量), 0);

const sumMachinedDivisionQuantity = (rows, sourceRows, kind, year, division, month) => {
  const detail = sumMachinedQuantity(sourceRows, kind, year, (row) => row.division, division, month);
  if (division === "FPC事业部") {
    const summary = sumMachinedSummary(rows, kind, year, "FPC事业部总计", month);
    return detail > 0 ? detail : summary;
  }
  return detail;
};

const sumMachinedTotalQuantity = (rows, sourceRows, kind, year, month) => {
  return ECN_DIVISIONS.reduce((sum, division) => sum + sumMachinedDivisionQuantity(rows, sourceRows, kind, year, division, month), 0);
};

const buildMachinedDivisionRows = (entities, rows, sourceRows, denominatorRows, kind) => entities.map((entity) => ({
  name: entity,
  years: [2025, 2026].map((year) => {
    const numerator = sumMachinedDivisionQuantity(rows, sourceRows, kind, year, entity);
    const denominator = sumMachinedDenominator(denominatorRows, kind, year);
    return { year, numerator, denominator, rate: machinedRate(numerator, denominator) };
  }),
}));

const buildMachinedTpmRows = (entities, rows, denominatorRows, kind, entityGetter) => entities.map((entity) => {
  const name = typeof entity === "string" ? entity : entity.name;
  return {
    name,
    division: entity.division,
    tpm: entity.tpm,
    years: [2025, 2026].map((year) => {
      const numerator = sumMachinedQuantity(rows, kind, year, entityGetter, name);
      const denominator = sumMachinedDenominator(denominatorRows, kind, year);
      return { year, numerator, denominator, rate: machinedRate(numerator, denominator) };
    }),
  };
});

const buildMachinedTpmMonthly = (entities, rows, denominatorRows, kind, months) => entities.map((entity) => ({
  name: entity.name,
  division: entity.division,
  tpm: entity.tpm,
  months: months.map((month) => {
    const result = { name: `${month}月`, month };
    [2025, 2026].forEach((year) => {
      const denominator = sumMachinedDenominator(denominatorRows, kind, year, month);
      const numerator = sumMachinedQuantity(rows, kind, year, (row) => `${row.division}\n${row.tpmName}`, entity.name, month);
      result[`y${year}Qty`] = denominator;
      result[`y${year}Bad`] = numerator;
      result[`y${year}Rate`] = machinedRate(numerator, denominator);
    });
    return result;
  }),
}));

const buildDqaMachinedParts = (dqaFiles) => {
  const partRows = dqaFiles.filter((file) => file.subKind === "DQA_MACHINED_PARTS").flatMap((file) => file.rows || []);
  if (!partRows.length) return null;
  const denominatorRows = partRows.filter((row) => text(row["产品部"]) === "加工件总数");
  const sourceRows = partRows.map((row) => ({
    ...row,
    division: machinedDivision(row["产品部"], row.TPM),
    tpmName: machinedTpmName(row),
  })).filter((row) => row.division);
  const months = [...new Set(partRows.map((row) => number(row.月份)).filter(Boolean))].sort((a, b) => a - b);
  const buildKind = (kind) => {
    const monthly = months.map((month) => {
      const result = { name: `${month}月` };
      [2025, 2026].forEach((year) => {
        const denominator = sumMachinedDenominator(denominatorRows, kind, year, month);
        const numerator = sumMachinedTotalQuantity(partRows, sourceRows, kind, year, month);
        result[`y${year}Qty`] = denominator;
        result[`y${year}Bad`] = numerator;
        result[`y${year}Rate`] = machinedRate(numerator, denominator);
      });
      result.delta = Number((result.y2026Rate - result.y2025Rate).toFixed(2));
      return result;
    });
    const totals = [2025, 2026].reduce((result, year) => {
      const denominator = sumMachinedDenominator(denominatorRows, kind, year);
      const numerator = sumMachinedTotalQuantity(partRows, sourceRows, kind, year);
      result[year] = { numerator, denominator, rate: machinedRate(numerator, denominator) };
      return result;
    }, {});
    const tpmEntities = [...new Map(sourceRows
      .filter((row) => row.__partKind === kind)
      .map((row) => [`${row.division}\n${row.tpmName}`, { name: `${row.division}\n${row.tpmName}`, division: row.division, tpm: row.tpmName }])).values()]
      .sort((a, b) => ECN_DIVISIONS.indexOf(a.division) - ECN_DIVISIONS.indexOf(b.division) || a.tpm.localeCompare(b.tpm, "zh-Hans-CN"));
    return {
      totals,
      monthly,
      divisions: buildMachinedDivisionRows(ECN_DIVISIONS, partRows, sourceRows, denominatorRows, kind),
      tpms: buildMachinedTpmRows(tpmEntities, sourceRows, denominatorRows, kind, (row) => `${row.division}\n${row.tpmName}`),
      tpmMonthly: buildMachinedTpmMonthly(tpmEntities, sourceRows, denominatorRows, kind, months),
    };
  };
  return {
    kinds: MACHINED_KIND_KEYS,
    ecn: buildKind("ECN"),
    nonBom: buildKind("非BOM"),
  };
};

export function analyzeImported(files, dateRange) {
  if (!files.length) return sampleData;
  files = filterFilesByDate(files, dateRange);
  const next = structuredClone(sampleData);
  next.appliedDateRange = { ...dateRange };
  const byModule = (module) => files.filter((f) => f.module === module).flatMap((f) => f.rows);

  const iqcFiles = files.filter((f) => f.module === "IQC");
  const iqcProjectFiles = iqcFiles.filter((f) => f.subKind === "IQC_FOCUS_PROJECT");
  const standardIqcFiles = iqcFiles.filter((f) => f.subKind !== "IQC_FOCUS_PROJECT");
  const iqc = standardIqcFiles.flatMap((f) => f.rows);
  if (iqcProjectFiles.length) {
    next.iqc.focusProjects = buildIqcFocusProjects(iqcProjectFiles, dateRange);
  }
  if (iqc.length) {
    const process = iqc.filter((r) => !iqcIsInternal(r));
    const good = process.filter((r) => iqcIsGood(r, false)).length;
    next.kpis[0].value = Number(((good / Math.max(process.length, 1)) * 100).toFixed(1));
    const bad = process.filter((r) => iqcResult(r) === "不合格");
    next.iqc.material = groupCount(bad, (r) => text(r["材质分类"]) || "未分类").slice(0, 8)
      .map((x) => ({ name: x.name, value: Number((100 - (x.count / Math.max(process.length, 1)) * 100).toFixed(1)) }));
    const suppliers = new Map();
    process.forEach((r) => {
      const supplier = text(r["供应商"]) || "未填写";
      const y = yearOf(r["检验开始时间"]);
      if (!suppliers.has(supplier)) suppliers.set(supplier, { supplier, site: "导入数据", type: text(r["材质分类"]), y2025: 0, y2026: 0, b25: 0, b26: 0, g25: 0, g26: 0 });
      const s = suppliers.get(supplier);
      if (y === 2025) { s.b25 += 1; if (iqcIsGood(r, false)) s.g25 += 1; }
      if (y === 2026) { s.b26 += 1; if (iqcIsGood(r, false)) s.g26 += 1; }
    });
    next.iqc.suppliers = [...suppliers.values()].filter((s) => s.b25 + s.b26 > 10).map((s) => ({
      ...s,
      y2025: Number((s.g25 / Math.max(s.b25, 1) * 100).toFixed(1)),
      y2026: Number((s.g26 / Math.max(s.b26, 1) * 100).toFixed(1)),
      batches: s.b26,
      risk: s.g26 / Math.max(s.b26, 1) < .9 ? "高" : "中",
      issue: classify(iqc.find((r) => text(r["供应商"]) === s.supplier)?.["异常原因"], rules.iqc),
    })).sort((a, b) => a.y2026 - b.y2026).slice(0, 12);
    const acceptedMode = buildIqcDetails(standardIqcFiles, dateRange, false);
    const rejectedMode = buildIqcDetails(standardIqcFiles, dateRange, true);
    Object.assign(next.iqc, acceptedMode);
    const iqcYearTotals = (year) => Object.values(acceptedMode.siteMonthly).flat()
      .reduce((result, row) => ({
        qty: result.qty + (row[`y${year}Qty`] || 0),
        good: result.good + (row[`y${year}Qty`] || 0) * (row[`y${year}Rate`] || 0) / 100,
      }), { qty: 0, good: 0 });
    const iqc25 = iqcYearTotals(2025);
    const iqc26 = iqcYearTotals(2026);
    const iqcRate25 = Number((iqc25.good / Math.max(iqc25.qty, 1) * 100).toFixed(1));
    const iqcRate26 = Number((iqc26.good / Math.max(iqc26.qty, 1) * 100).toFixed(1));
    next.kpis[0].value = iqcRate26;
    next.kpis[0].delta = Number((iqcRate26 - iqcRate25).toFixed(1));
    next.iqc.qualityModes = { accepted: acceptedMode, rejected: rejectedMode };
    next.iqc.specialAnalysis = buildIqcSpecialAnalysis(standardIqcFiles, dateRange);
    next.iqc.internalModes = {
      accepted: buildIqcInternalAnalysis(standardIqcFiles, dateRange, false),
      rejected: buildIqcInternalAnalysis(standardIqcFiles, dateRange, true),
    };
  }

  const ipqc = byModule("IPQC");
  if (ipqc.length) {
    const tools = ipqc.reduce((sum, r) => sum + ipqcQty(r), 0);
    const issues = ipqc.reduce((sum, r) => sum + ipqcBad(r), 0);
    next.kpis[1].value = Number((issues / Math.max(tools, 1) * 100).toFixed(2));
    const workshops = new Map();
    ipqc.forEach((r) => {
      const key = text(r["产品工坊"]) || "未分类";
      const item = workshops.get(key) || { name: key, tools: 0, issues: 0 };
      item.tools += ipqcQty(r);
      item.issues += ipqcBad(r);
      workshops.set(key, item);
    });
    next.ipqc.workshops = [...workshops.values()].map((w) => ({
      name: w.name, y2025: 0, y2026: Number((w.issues / Math.max(w.tools, 1) * 100).toFixed(2)), issues: w.issues,
    })).sort((a, b) => b.y2026 - a.y2026).slice(0, 12);
    const categoryCounts = groupCount(ipqc.filter((r) => ipqcBad(r) > 0), (r) => classify(r["不良内容"], rules.ipqc));
    const total = categoryCounts.reduce((s, x) => s + x.count, 0);
    next.ipqc.categories = categoryCounts.slice(0, 10).map((x) => ({ name: x.name, shenzhen: Number((x.count / total * 100).toFixed(1)), hangzhou: 0 }));
    Object.assign(next.ipqc, buildIpqcDetails(files.filter((file) => file.module === "IPQC"), dateRange));
    const ipqcYearTotals = (year) => Object.values(next.ipqc.siteMonthly).flat().reduce((result, row) => ({
      qty: result.qty + (row[`y${year}Qty`] || 0),
      issues: result.issues + (row[`y${year}Bad`] || 0),
    }), { qty: 0, issues: 0 });
    const ipqc25 = ipqcYearTotals(2025);
    const ipqc26 = ipqcYearTotals(2026);
    const ipqcRate25 = Number((ipqc25.issues / Math.max(ipqc25.qty, 1) * 100).toFixed(2));
    const ipqcRate26 = Number((ipqc26.issues / Math.max(ipqc26.qty, 1) * 100).toFixed(2));
    next.kpis[1].value = ipqcRate26;
    next.kpis[1].delta = Number((ipqcRate26 - ipqcRate25).toFixed(2));
  }

  const oqc = byModule("OQC");
  if (oqc.length) {
    const monthlySummaryRows = files.filter((file) => file.module === "OQC" && file.kind === "OQC_MONTHLY_SUMMARY").flatMap((file) => file.rows);
    if (monthlySummaryRows.length) {
      next.oqc.monthlySummary = buildOqcMonthlySummary(monthlySummaryRows, dateRange);
      const all2026 = next.oqc.monthlySummary.divisions.reduce((sum, row) => sum + row.y2026Count, 0);
      const all2025 = next.oqc.monthlySummary.divisions.reduce((sum, row) => sum + row.y2025Count, 0);
      const five2025 = next.oqc.monthlySummary.divisions.reduce((sum, row) => sum + row.y2025Five, 0);
      const five2026 = monthlySummaryRows.filter((row) => ["产品一部", "产品五部", "FPC事业部"].includes(text(row["产品部"])) && number(row["年份"]) === 2026 && number(row["评分档位"]) === 5)
        .reduce((sum, row) => sum + number(row["数量"]), 0);
      const oqcRate25 = Number((five2025 / Math.max(all2025, 1) * 100).toFixed(1));
      const oqcRate26 = Number((five2026 / Math.max(all2026, 1) * 100).toFixed(1));
      next.kpis[2].value = oqcRate26;
      next.kpis[2].delta = Number((oqcRate26 - oqcRate25).toFixed(1));
    }
    const unique = new Map();
    const detailRows = oqc.filter((row) => row["评分档位"] == null);
    detailRows.forEach((r) => {
      const id = text(r["UUID"]) || `${text(r["SN"])}-${text(r["PM"])}-${text(r["发货时间"])}`;
      if (!unique.has(id)) unique.set(id, r);
    });
    const devices = [...unique.values()];
    if (!devices.length) {
      next.updatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
    } else {
    const five = devices.filter((r) => number(r["售后设备评分"] || r["设备评分"]) === 5).length;
    next.kpis[2].value = Number((five / Math.max(devices.length, 1) * 100).toFixed(1));
    const tpm = new Map();
    devices.forEach((r) => {
      const name = text(r["PM"]) || "未分类";
      const score = number(r["售后设备评分"] || r["设备评分"]);
      const item = tpm.get(name) || { name, devices: 0, score: 0, five: 0, low: 0 };
      item.devices += 1; item.score += score; if (score === 5) item.five += 1; if (score <= 3) item.low += 1;
      tpm.set(name, item);
    });
    next.oqc.tpm = [...tpm.values()].map((x) => ({
      name: x.name, devices: x.devices, avg: Number((x.score / x.devices).toFixed(2)),
      fiveRate: Number((x.five / x.devices * 100).toFixed(1)), lowRate: Number((x.low / x.devices * 100).toFixed(1)),
    })).sort((a, b) => b.fiveRate - a.fiveRate);
    const onsite = oqc.filter((r) => text(r["问题类型"]) === "现场问题");
    const categories = groupCount(onsite, (r) => classify(r["问题"], rules.oqc));
    const total = categories.reduce((s, x) => s + x.count, 0);
    next.oqc.onsite = categories.slice(0, 10).map((x) => ({ ...x, share: Number((x.count / Math.max(total, 1) * 100).toFixed(1)) }));
    }
  }

  const dqa = byModule("DQA");
  if (dqa.length) {
    const dqaFiles = files.filter((file) => file.module === "DQA");
    next.dqa.ecn = buildDqaEcn(dqaFiles, dateRange);
    next.dqa.machinedParts = buildDqaMachinedParts(dqaFiles);
    const issueRows = dqa.filter((r) => r["问题描述"]);
    const stageName = (r) => text(r["阶段"] || r["问题发生地"] || r["问题反馈部门"]);
    const stageMap = { "评审": "review", "公司内部": "production", "生产": "production", "售后": "onsite" };
    const tpm = new Map();
    issueRows.forEach((r) => {
      const name = text(r["TPM"]) || text(r["产品部"]) || "未分类";
      const division = text(r["产品部"]) || "未分类";
      const item = tpm.get(`${division}-${name}`) || { name, division, review: 0, production: 0, onsite: 0 };
      const stage = stageMap[stageName(r)] || "production";
      item[stage] += 1;
      tpm.set(`${division}-${name}`, item);
    });
    next.dqa.tpmStages = [...tpm.values()];
    const categories = groupCount(issueRows, (r) => classify(r["问题描述"], rules.dqa));
    next.dqa.categories = categories.slice(0, 10).map((x) => ({ name: x.name, review: 0, production: x.count, onsite: 0 }));
    const totalBack = next.dqa.tpmStages.reduce((s, x) => s + x.production + x.onsite, 0);
    next.kpis[3].value = totalBack;
    next.dqa.yearCompare = buildDqaDetails(dqaFiles.filter((file) => file.subKind !== "DQA_ECN" && file.subKind !== "DQA_MACHINED_PARTS"));
    const stageRows = next.dqa.yearCompare.byDivision.stages;
    const stageYear = (row, year) => row.years.find((item) => item.year === year) || { counts: {} };
    const backEnd = (year) => stageRows.reduce((sum, row) => {
      const current = stageYear(row, year);
      return sum + (current.counts.生产 || 0) + (current.counts.现场 || 0);
    }, 0);
    const back25 = backEnd(2025);
    const back26 = backEnd(2026);
    next.kpis[3].value = back26;
    next.kpis[3].delta = Number(((back26 - back25) / Math.max(back25, 1) * 100).toFixed(1));
    next.dqa.divisions = stageRows.map((row) => {
      const current = stageYear(row, 2026);
      return {
        name: row.name,
        review: current.counts.评审 || 0,
        production: current.counts.生产 || 0,
        onsite: current.counts.现场 || 0,
      };
    });
  }

  next.updatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  if (dateRange?.start2025 && dateRange?.end2025 && dateRange?.start2026 && dateRange?.end2026) {
    next.period = `2025同期 ${dateRange.start2025}—${dateRange.end2025} / 2026本期 ${dateRange.start2026}—${dateRange.end2026}`;
  }
  return next;
}

export function downloadJson(data, name = "质量分析数据.json") {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
