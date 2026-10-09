import { canonicalProductDept } from "../orgMappingParse.js";

const DIVISIONS = ["半导体&北美", "产品五部", "FPC事业部"];
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const repairDivision = (value = "") => {
  const source = clean(value);
  if (!source || source === "未填写") return "";
  const direct = canonicalProductDept(source);
  if (DIVISIONS.includes(direct)) return direct;
  if (!source.includes("\uFFFD")) return "";
  const stripped = clean(source.replace(/\uFFFD/g, ""));
  const again = canonicalProductDept(stripped);
  if (DIVISIONS.includes(again)) return again;
  if (/五/.test(stripped)) return "产品五部";
  if (/FPC|FCP|事业/i.test(stripped)) return "FPC事业部";
  if (/半|导|北美|传感|载版|载板/.test(stripped)) return "半导体&北美";
  return "";
};
const shortHalf = (period = {}) => {
  if (!period.year || !period.half) return clean(period.period) || "";
  return String(period.year).slice(2) + (period.half === 1 ? "上" : "下");
};
const halfLabel = (year, half) => year && half ? year + "年" + (half === 1 ? "上半年" : "下半年") : "";
const metricOf = (bucket = {}) => ({
  samples: number(bucket.samples),
  avg: bucket.avg == null || bucket.avg === "" ? null : number(bucket.avg),
  lowCount: number(bucket.lowCount),
  lowRate: bucket.lowRate == null || bucket.lowRate === "" ? null : number(bucket.lowRate),
});


const SUGGESTION_TYPES = ["产品质量建议", "产品交付防护建议", "售后过程与异常处理建议", "其他建议"];
const DIMENSIONS = ["设备稳定性", "使用便捷性", "安全性能", "交付日期", "整机外观", "售后人力配置", "投诉/抱怨处理时效", "异常关闭及时率", "售后响应及时率", "SOP培训"];
const suggestionCategory = (value) => {
  const source = clean(value).toLowerCase().replace(/\s/g, "");
  if (!source) return "其他";
  const rules = [["设备稳定性", ["稳定", "故障", "异常", "宕机", "停机"]], ["交付", ["交付", "交货", "到货", "延期", "包装", "防护"]], ["售后响应", ["响应", "及时", "处理", "售后", "服务"]], ["培训", ["培训", "讲解", "sop", "原理", "指导"]], ["操作便捷性", ["操作", "便捷", "易用", "界面", "维护"]], ["备件", ["备件", "备品", "易损件", "零件"]], ["沟通", ["沟通", "对接", "协作", "反馈"]]];
  return rules.find(([, keys]) => keys.some((key) => source.includes(key)))?.[0] || "其他";
};
const metricsOfRows = (rows) => {
  const scored = rows.filter((row) => number(row["总体得分"]) > 0);
  const lowCount = scored.filter((row) => number(row["总体得分"]) < 4).length;
  return {
    samples: scored.length,
    avg: scored.length ? Number((scored.reduce((sum, row) => sum + number(row["总体得分"]), 0) / scored.length).toFixed(1)) : null,
    lowCount,
    lowRate: scored.length ? Number((lowCount / scored.length * 100).toFixed(1)) : null,
  };
};
const periodBounds = (year, half) => ({
  start: year + "-" + (half === 1 ? "01-01" : "07-01"),
  end: year + "-" + (half === 1 ? "06-30" : "12-31"),
});
const analysisFromRows = (rows) => {
  const scored = rows.filter((row) => number(row.__surveyYear) && number(row.__surveyHalf) && number(row["总体得分"]) > 0);
  const keys = [...new Set(scored.map((row) => row.__surveyYear + ":" + row.__surveyHalf))].sort();
  const periods = keys.map((key) => {
    const [year, half] = key.split(":").map(Number);
    const own = scored.filter((row) => row.__surveyYear === year && row.__surveyHalf === half);
    return { key: "p" + year + "h" + half, period: halfLabel(year, half), year, half, ...metricsOfRows(own) };
  });
  const divisionCompare = DIVISIONS.map((name) => ({
    name,
    periods: Object.fromEntries(periods.map((item) => [item.key, metricsOfRows(scored.filter((row) => row.__surveyYear === item.year && row.__surveyHalf === item.half && repairDivision(row["产品部"]) === name))])),
  }));
  const tpmByDivision = Object.fromEntries(DIVISIONS.map((division) => {
    const names = [...new Set(scored.filter((row) => repairDivision(row["产品部"]) === division).map((row) => clean(row.TPM)).filter(Boolean))];
    return [division, names.map((name) => ({
      name,
      periods: Object.fromEntries(periods.map((item) => [item.key, metricsOfRows(scored.filter((row) => row.__surveyYear === item.year && row.__surveyHalf === item.half && repairDivision(row["产品部"]) === division && clean(row.TPM) === name))])),
    }))];
  }));
  const risks = scored.map((row) => {
    const dimensions = Object.entries(row.__dimensions || {}).filter(([, value]) => number(value) > 0).sort((left, right) => left[1] - right[1]);
    return {
      period: halfLabel(row.__surveyYear, row.__surveyHalf),
      division: repairDivision(row["产品部"]),
      tpm: clean(row.TPM),
      customer: clean(row["客户名称"]),
      project: clean(row["项目名称"]),
      score: Number(number(row["总体得分"]).toFixed(1)),
      lowestDimension: dimensions[0]?.[0] || "",
      suggestion: SUGGESTION_TYPES.map((key) => clean(row[key])).filter(Boolean).join("；"),
    };
  });
  const suggestions = scored.flatMap((row) => SUGGESTION_TYPES.map((type) => ({
    period: halfLabel(row.__surveyYear, row.__surveyHalf),
    category: suggestionCategory(row[type]),
    content: clean(row[type]),
  })).filter((item) => item.content));
  const comparableDimensions = DIMENSIONS.map((name) => ({
    name,
    periods: Object.fromEntries(periods.map((item) => {
      const values = scored.filter((row) => row.__surveyYear === item.year && row.__surveyHalf === item.half).map((row) => number(row.__dimensions?.[name])).filter((value) => value > 0);
      return [item.key, values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null];
    })),
  }));
  return { thresholds: { low: 4 }, periods, divisionCompare, tpmByDivision, risks, suggestions, comparableDimensions };
};

export const buildQmsCustomerSplit = ({ qms = null, files = [], period = {} } = {}) => {
  const fileRows = (files || []).filter((file) => file?.module === "QMS").flatMap((file) => file.rows || []);
  const cachedHasSamples = (qms?.periods || []).some((item) => number(item?.samples) > 0);
  const source = fileRows.some((row) => number(row["总体得分"]) > 0) || !cachedHasSamples ? analysisFromRows(fileRows) : qms;
  const qmsView = source?.periods ? source : qms;
  const end = clean(period.end2026 || period.end2025);
  const start = clean(period.start2026 || period.start2025);
  const ranges = [[clean(period.start2025), clean(period.end2025)], [clean(period.start2026), clean(period.end2026)]].filter(([rangeStart, rangeEnd]) => rangeStart && rangeEnd);
  const periods = (qmsView?.periods || []).filter((item) => item && item.key && number(item.samples) > 0 && (!end || periodBounds(item.year, item.half).start <= end));
  if (!periods.length) return null;
  const overlaps = (item) => {
    const bounds = periodBounds(item.year, item.half);
    return ranges.some(([rangeStart, rangeEnd]) => bounds.start <= rangeEnd && bounds.end >= rangeStart);
  };
  const current = [...periods].reverse().find(overlaps) || [...periods].reverse().find((item) => !end || periodBounds(item.year, item.half).end <= end) || periods.at(-1);
  const selectedReady = Boolean(current);
  const currentKey = current?.key || "";
  const rows = periods.map((item) => ({ ...item, ...metricOf(item), label: shortHalf(item), name: item.period || halfLabel(item.year, item.half) }));
  const previous = current ? rows.filter((item) => item.year < current.year || (item.year === current.year && item.half < current.half)).at(-1) || null : null;
  const divisionRows = DIVISIONS.map((name) => {
    const source = (qmsView.divisionCompare || []).find((item) => repairDivision(item.name) === name || item.name === name);
    const now = metricOf(source?.periods?.[currentKey] || {});
    const before = metricOf(previous ? source?.periods?.[previous.key] || {} : {});
    return { name, ...now, previousAvg: before.avg, previousLowRate: before.lowRate };
  }).filter((item) => item.samples > 0 || item.previousAvg != null);
  const tpms = DIVISIONS.flatMap((division) => ((qmsView.tpmByDivision || {})[division] || []).map((item) => {
    const now = metricOf(item.periods?.[currentKey] || {});
    return { division, name: clean(item.name), ...now };
  })).filter((item) => item.name && item.name !== "未填写" && !item.name.includes("\uFFFD") && item.samples > 0)
    .sort((left, right) => left.division.localeCompare(right.division, "zh-CN") || (right.lowRate || 0) - (left.lowRate || 0) || right.samples - left.samples);
  const lowScores = (qmsView.risks || []).filter((item) => current && item.period === current.period && number(item.score) > 0 && number(item.score) < number(qmsView.thresholds?.low || 4))
    .map((item) => ({
      division: repairDivision(item.division) || clean(item.division),
      tpm: clean(item.tpm),
      customer: clean(item.customer),
      project: clean(item.project),
      score: number(item.score),
      lowestDimension: clean(item.lowestDimension),
      suggestion: clean(item.suggestion).slice(0, 48),
    })).filter((item) => item.division && !item.division.includes("\uFFFD"))
    .slice(0, 12);
  const suggestionRows = (qmsView.suggestions || []).filter((item) => current && item.period === current.period);
  const themeMap = new Map();
  suggestionRows.forEach((item) => {
    const name = clean(item.category) || "其他";
    themeMap.set(name, (themeMap.get(name) || 0) + 1);
  });
  const themes = [...themeMap.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN")).slice(0, 8);
  const dimensions = (qmsView.comparableDimensions || []).map((item) => ({ name: item.name, avg: item.periods?.[currentKey] == null ? null : number(item.periods[currentKey]) }))
    .filter((item) => item.avg != null)
    .sort((left, right) => left.avg - right.avg || left.name.localeCompare(right.name, "zh-CN"));
  return {
    rule: "客户满意度按半年统计，不按月拆。低分是总体得分低于4。平均分和低分率分开。趋势只列已导入且有问卷的半年。本期取所选日期覆盖到的最近一个有问卷的半年；下半年还没导入时，用已导入的上半年，并说明下半年问卷还没到。产品部只有半导体&北美、产品五部、FPC事业部。",
    selected: { year: current?.year || null, half: current?.half || null, label: current?.period || halfLabel(current?.year, current?.half), ready: selectedReady, coveredEnd: end, coveredStart: start },
    current: current ? { key: current.key, label: current.period, ...metricOf(current) } : null,
    previous: previous ? { key: previous.key, label: previous.name, ...metricOf(previous) } : null,
    periods: rows,
    divisions: divisionRows,
    tpms,
    lowScores,
    themes,
    dimensions: dimensions.slice(0, 8),
    suggestionCount: suggestionRows.length,
  };
};
