const CATEGORY_RULES = [
  ["真空/吸附", ["真空", "吸盘", "吸附", "负压"]],
  ["测试/NG", ["ng", "测试", "不良", "测量"]],
  ["通讯/扫码", ["通讯", "通信", "扫码", "扫描", "二维码", "条码", "ora-", "mpe"]],
  ["取料/丢料", ["取料", "取放", "丢料", "掉料", "吸取", "上料", "下料"]],
  ["气缸/磁开关", ["气缸", "磁开关", "气阀", "电磁"]],
  ["传感器/遮挡", ["传感器", "感应", "遮挡", "光电"]],
  ["定位/视觉", ["定位", "视觉", "相机", "偏移", "对位"]],
  ["上传/图片", ["上传", "图片", "图像", "截图"]],
  ["驱动器/轴", ["驱动器", "伺服", "电机", "轴", "运动"]],
];

const clean = (value) => String(value ?? "").trim();
const normalizeHeader = (value) => clean(value).replace(/^\ufeff/, "");
const numberValue = (value) => {
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const formatDateKey = (date) => {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
};

export const classifyDoamAlarm = (value) => {
  const text = clean(value).toLowerCase();
  for (const [name, words] of CATEGORY_RULES) if (words.some((word) => text.includes(word))) return name;
  return "其他";
};

export const parseDoamDate = (value) => {
  const text = clean(value);
  if (!text) return null;
  const slash = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (slash) {
    const date = new Date(Number(slash[1]), Number(slash[2]) - 1, Number(slash[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const parseCsvText = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
};

const headerIndex = (headers, names) => {
  const index = headers.findIndex((item) => names.includes(normalizeHeader(item)));
  return index >= 0 ? index : -1;
};

export const parseDoamCsvText = (text, fileName = "导入文件.csv") => {
  const rows = parseCsvText(text);
  const headers = rows.shift()?.map(normalizeHeader) || [];
  const indexes = {
    product: headerIndex(headers, ["产品部"]), customer: headerIndex(headers, ["客户"]),
    deviceType: headerIndex(headers, ["设备类型"]), tpm: headerIndex(headers, ["TPM"]),
    machine: headerIndex(headers, ["机台编号"]), date: headerIndex(headers, ["班次日期"]),
    shift: headerIndex(headers, ["班次"]), alarmCount: headerIndex(headers, ["告警次数"]),
    alarmInfo: headerIndex(headers, ["告警信息"]),
  };
  const get = (cells, key) => indexes[key] >= 0 ? clean(cells[indexes[key]]) : "";
  const result = [];
  rows.forEach((cells) => {
    if (!cells.length) return;
    const date = parseDoamDate(get(cells, "date"));
    result.push({ product: get(cells, "product"), customer: get(cells, "customer"), deviceType: get(cells, "deviceType"), tpm: get(cells, "tpm"), machine: get(cells, "machine"), date, dateKey: formatDateKey(date), shift: get(cells, "shift"), alarmCount: numberValue(get(cells, "alarmCount")), alarmInfo: get(cells, "alarmInfo"), category: classifyDoamAlarm(get(cells, "alarmInfo")), fileName });
  });
  return { rows: result, headers, missingShift: indexes.shift < 0 };
};

export const decodeDoamFile = async (file) => {
  const buffer = await file.arrayBuffer();
  let text = "";
  try { text = new TextDecoder("gb18030").decode(buffer); } catch { text = new TextDecoder("utf-8").decode(buffer); }
  return parseDoamCsvText(text, file.name);
};

const summarizeRows = (rows) => {
  const units = new Map();
  const categories = new Map();
  rows.forEach((row) => {
    const year = row.date?.getFullYear();
    const month = row.date ? row.date.getMonth() + 1 : null;
    if (!year || !row.dateKey || !row.shift || !row.machine) return;
    const machineKey = `${row.deviceType}||${row.machine}`;
    const key = `${year}|${row.dateKey}|${row.shift}|${machineKey}`;
    const current = units.get(key) || { d: row.dateKey, s: row.shift, m: machineKey, t: row.tpm, e: row.deviceType, p: row.product, k: row.customer, y: year, o: month, a: 0 };
    current.a += row.alarmCount ?? 0;
    units.set(key, current);
    const categoryKey = `${year}|${row.tpm}|${row.category}|${row.deviceType}`;
    const currentCategory = categories.get(categoryKey) || { y: year, t: row.tpm, c: row.category, e: row.deviceType, a: 0, ms: new Set(), ds: new Set() };
    currentCategory.a += row.alarmCount ?? 0;
    currentCategory.ms.add(machineKey);
    currentCategory.ds.add(row.dateKey);
    categories.set(categoryKey, currentCategory);
  });
  return {
    units: [...units.values()],
    categories: [...categories.values()].map((row) => ({ y: row.y, t: row.t, c: row.c, e: row.e, a: row.a, ms: [...row.ms], ds: [...row.ds] })),
  };
};

export const buildDoamQuality = (rows, files = []) => {
  const dates = rows.map((row) => row.date).filter(Boolean);
  const years = {};
  rows.forEach((row) => { const year = row.date?.getFullYear(); if (year) years[year] = (years[year] || 0) + 1; });
  return {
    rowCount: rows.length, dateMin: dates.length ? formatDateKey(dates.reduce((min, date) => date < min ? date : min)) : "", dateMax: dates.length ? formatDateKey(dates.reduce((max, date) => date > max ? date : max)) : "",
    blankDate: rows.filter((row) => !row.date).length, blankMachine: rows.filter((row) => !row.machine).length, blankShift: rows.filter((row) => !row.shift).length,
    invalidAlarm: rows.filter((row) => row.alarmCount == null).length, blankInfo: rows.filter((row) => !row.alarmInfo).length, yearRows: years,
    machineCount: new Set(rows.filter((row) => row.machine).map((row) => `${row.deviceType}||${row.machine}`)).size, tpmCount: new Set(rows.filter((row) => row.tpm).map((row) => row.tpm)).size, deviceTypeCount: new Set(rows.filter((row) => row.deviceType).map((row) => row.deviceType)).size,
    alarmTotal: rows.reduce((sum, row) => sum + (row.alarmCount || 0), 0), files,
  };
};

export const buildDoamDataset = (rows, files = []) => ({ ...summarizeRows(rows), quality: buildDoamQuality(rows, files), files });

export const hydrateDoamDefault = (payload) => ({ units: payload?.units || [], categories: payload?.categories || [], quality: { ...(payload?.quality || {}), files: payload?.quality?.files || payload?.files || [] }, files: payload?.files || [] });

export const mergeDoamDatasets = (base, additions = []) => {
  const units = new Map();
  [...(base?.units || []), ...additions.flatMap((item) => item.units || [])].forEach((row) => {
    const key = `${row.y}|${row.d}|${row.s}|${row.e || ""}||${row.m}`;
    const current = units.get(key) || { ...row, a: 0 };
    current.a += Number(row.a || 0);
    units.set(key, current);
  });
  const categoryMap = new Map();
  [...(base?.categories || []), ...additions.flatMap((item) => item.categories || [])].forEach((row) => {
    const key = `${row.y}|${row.t}|${row.c}|${row.e || ""}`;
    const current = categoryMap.get(key) || { y: row.y, t: row.t, c: row.c, e: row.e, a: 0, ms: new Set(), ds: new Set() };
    current.a += Number(row.a || 0);
    (row.ms || []).forEach((machine) => current.ms.add(machine));
    (row.ds || []).forEach((date) => current.ds.add(date));
    categoryMap.set(key, current);
  });
  const files = [...new Set([...(base?.files || []), ...additions.flatMap((item) => item.files || [])])];
  const qualities = [base?.quality || {}, ...additions.map((item) => item.quality || {})];
  const yearRows = {};
  qualities.forEach((item) => Object.entries(item.yearRows || {}).forEach(([year, count]) => { yearRows[year] = (yearRows[year] || 0) + Number(count || 0); }));
  const unitRows = [...units.values()];
  const dateValues = unitRows.map((row) => row.d).filter(Boolean).sort();
  const quality = {
    rowCount: qualities.reduce((sum, item) => sum + Number(item.rowCount || 0), 0),
    dateMin: qualities.map((item) => item.dateMin).filter(Boolean).sort()[0] || dateValues[0] || "",
    dateMax: qualities.map((item) => item.dateMax).filter(Boolean).sort().at(-1) || dateValues.at(-1) || "",
    blankDate: qualities.reduce((sum, item) => sum + Number(item.blankDate || 0), 0),
    blankMachine: qualities.reduce((sum, item) => sum + Number(item.blankMachine || 0), 0),
    blankShift: qualities.reduce((sum, item) => sum + Number(item.blankShift || 0), 0),
    invalidAlarm: qualities.reduce((sum, item) => sum + Number(item.invalidAlarm || 0), 0),
    blankInfo: qualities.reduce((sum, item) => sum + Number(item.blankInfo || 0), 0),
    yearRows, machineCount: new Set(unitRows.map((row) => row.m)).size, tpmCount: new Set(unitRows.map((row) => row.t)).size,
    deviceTypeCount: new Set(unitRows.map((row) => row.e)).size, alarmTotal: unitRows.reduce((sum, row) => sum + Number(row.a || 0), 0), files,
  };
  return { units: unitRows, categories: [...categoryMap.values()].map((row) => ({ y: row.y, t: row.t, c: row.c, e: row.e, a: row.a, ms: [...row.ms], ds: [...row.ds] })), quality, files };
};

const fieldValue = (row, field) => row?.[field] || "未填写";

const filteredUnits = (units, filter = {}, except) => (units || []).filter((row) => {
  if (except !== "t" && filter.tpm && fieldValue(row, "t") !== filter.tpm) return false;
  if (except !== "e" && filter.device && fieldValue(row, "e") !== filter.device) return false;
  if (except !== "k" && filter.customer && fieldValue(row, "k") !== filter.customer) return false;
  if (except !== "p" && filter.product && fieldValue(row, "p") !== filter.product) return false;
  if (except !== "month" && filter.month && Number(row.o) !== Number(filter.month)) return false;
  return true;
});

const meanTypeAverages = (rows) => {
  const types = new Map();
  rows.forEach((row) => {
    const type = row.e || "未填写";
    const current = types.get(type) || { total: 0, shifts: 0 };
    current.total += Number(row.a || 0);
    current.shifts += 1;
    types.set(type, current);
  });
  if (!types.size) return null;
  let sum = 0;
  let count = 0;
  types.forEach((type) => {
    if (!type.shifts) return;
    sum += type.total / type.shifts;
    count += 1;
  });
  return count ? Number((sum / count).toFixed(2)) : null;
};

const typeAverage = (rows) => {
  if (!rows?.length) return null;
  const total = rows.reduce((sum, row) => sum + Number(row.a || 0), 0);
  return Number((total / rows.length).toFixed(2));
};

export const doamMonthlyTrend = (units, filter) => {
  const groups = new Map();
  filteredUnits(units, filter, "month").forEach((row) => {
    const key = `${row.y}|${row.o}`;
    const current = groups.get(key) || { year: row.y, month: row.o, rows: [], machines: new Set() };
    current.rows.push(row);
    current.machines.add(row.m);
    groups.set(key, current);
  });
  return [2025, 2026].map((year) => Array.from({ length: 12 }, (_, index) => {
    const row = groups.get(`${year}|${index + 1}`);
    if (!row) return { alarm: null, machines: null, shifts: 0, average: null };
    const average = meanTypeAverages(row.rows);
    const alarm = row.rows.reduce((sum, item) => sum + Number(item.a || 0), 0);
    return { alarm: Number(alarm.toFixed(2)), machines: row.machines.size, shifts: new Set(row.rows.map((item) => item.d)).size, average };
  }));
};

export const doamYearSplitAverages = (units, filter, field, except) => {
  const groups = new Map();
  filteredUnits(units, filter, except || field).forEach((row) => {
    const name = fieldValue(row, field);
    const current = groups.get(name) || { name, y2025: [], y2026: [] };
    if (row.y === 2025) current.y2025.push(row);
    if (row.y === 2026) current.y2026.push(row);
    groups.set(name, current);
  });
  return [...groups.values()].map((row) => ({
    name: row.name,
    y2025: meanTypeAverages(row.y2025),
    y2026: meanTypeAverages(row.y2026),
  })).sort((a, b) => (b.y2026 || 0) - (a.y2026 || 0) || (b.y2025 || 0) - (a.y2025 || 0) || String(a.name).localeCompare(String(b.name), "zh"));
};

export const doamTpmAverages = (units, filter) => doamYearSplitAverages(units, filter, "t", "t");
export const doamCustomerAverages = (units, filter) => doamYearSplitAverages(units, filter, "k", "k");
export const doamProductAverages = (units, filter) => doamYearSplitAverages(units, filter, "p", "p");

export const doamDeviceAverages = (units, filter) => {
  const groups = new Map();
  filteredUnits(units, filter, "e").forEach((row) => {
    const name = fieldValue(row, "e");
    const current = groups.get(name) || { name, y2025: [], y2026: [] };
    if (row.y === 2025) current.y2025.push(row);
    if (row.y === 2026) current.y2026.push(row);
    groups.set(name, current);
  });
  return [...groups.values()].map((row) => ({
    name: row.name,
    y2025: typeAverage(row.y2025),
    y2026: typeAverage(row.y2026),
  })).sort((a, b) => ((b.y2026 || 0) + (b.y2025 || 0)) - ((a.y2026 || 0) + (a.y2025 || 0)) || String(a.name).localeCompare(String(b.name), "zh"));
};

export const doamCategoryTop = (categories, filter = {}, units = []) => {
  const categoryFilter = { tpm: filter.tpm, device: filter.device };
  const scopedUnits = filteredUnits(units, categoryFilter);
  const typeShifts = new Map();
  scopedUnits.forEach((row) => {
    const typeKey = `${row.y}|${row.e || "未填写"}`;
    typeShifts.set(typeKey, (typeShifts.get(typeKey) || 0) + 1);
  });
  const catType = new Map();
  (categories || []).filter((row) => {
    if (filter.tpm && fieldValue(row, "t") !== filter.tpm) return false;
    if (filter.device && fieldValue(row, "e") !== filter.device) return false;
    return true;
  }).forEach((row) => {
    const type = row.e || "未填写";
    const key = `${row.c}|${row.y}|${type}`;
    catType.set(key, (catType.get(key) || 0) + Number(row.a || 0));
  });
  const names = [...new Set([...catType.keys()].map((key) => key.split("|")[0]))];
  const averageOf = (name, year) => {
    const prefix = `${name}|${year}|`;
    const types = [...new Set([...catType.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)))];
    const values = types.map((type) => {
      const shifts = typeShifts.get(`${year}|${type}`);
      const alarms = catType.get(`${name}|${year}|${type}`) || 0;
      return shifts ? alarms / shifts : null;
    }).filter((value) => value != null);
    return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;
  };
  return names.map((name) => {
    const y2025 = averageOf(name, 2025);
    const y2026 = averageOf(name, 2026);
    return { name, y2025, y2026, rank: (y2025 || 0) + (y2026 || 0) };
  }).sort((a, b) => b.rank - a.rank).slice(0, 10).map((row) => ({ name: row.name, y2025: row.y2025, y2026: row.y2026 }));
};

export const doamKeyWords = CATEGORY_RULES.map(([name, words]) => ({ name, words: words.join("、") }));
