import { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";

const blue = "#2f7ee6";
const cyan = "#19a9d5";
const orange = "#f5822a";
const green = "#50ad68";
const red = "#ef4f4f";
const displayLabel = (value) => value === "产品一部" ? "半导体&北美" : value;

const fontScales = { small: .86, standard: 1, large: 1.22, xlarge: 1.4 };
const appleChartPalette = ["#0A84FF", "#FF9F0A", "#34C759", "#AF52DE", "#5AC8FA", "#FF375F", "#8E8E93", "#B8860B", "#64D2FF", "#30D158"];
const isAppleTheme = () => (document.documentElement.dataset.uiTheme || localStorage.getItem("qms-ui-theme") || "classic") === "apple";
const scaleOptionFonts = (value, scale, key = "") => {
  if (key === "fontSize" && typeof value === "number") return Math.round(value * scale);
  if (Array.isArray(value)) return value.map((item) => scaleOptionFonts(item, scale));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, scaleOptionFonts(childValue, scale, childKey)]));
  }
  return value;
};
const useChartFontScale = () => {
  const current = () => fontScales[document.documentElement.dataset.fontSize] || 1;
  const [scale, setScale] = useState(current);
  useEffect(() => {
    const update = () => setScale(current());
    window.addEventListener("qms-font-size", update);
    return () => window.removeEventListener("qms-font-size", update);
  }, []);
  return scale;
};
function ScaledChart({ option, ...props }) {
  const scale = useChartFontScale();
  const themedOption = isAppleTheme() ? applyAppleChartTheme(option) : option;
  return <ReactECharts {...props} notMerge lazyUpdate option={{ textStyle: { fontSize: Math.round(12 * scale), color: isAppleTheme() ? "#526174" : undefined, fontFamily: "PingFang SC, Microsoft YaHei, sans-serif" }, ...scaleOptionFonts(themedOption, scale) }} />;
}
const asArray = (value) => Array.isArray(value) ? value : value ? [value] : [];
const themeAxis = (axis) => ({
  ...axis,
  nameTextStyle: { color: "#7C8A9E", fontWeight: 700, ...(axis?.nameTextStyle || {}) },
  axisLabel: { color: "#526174", fontWeight: 600, ...(axis?.axisLabel || {}) },
  axisLine: { ...(axis?.axisLine || {}), lineStyle: { color: "#D8E2EE", ...(axis?.axisLine?.lineStyle || {}) } },
  axisTick: { show: false, ...(axis?.axisTick || {}) },
  splitLine: axis?.splitLine?.show === false ? axis?.splitLine : { show: true, lineStyle: { color: "#EEF3F9", type: "dashed", ...(axis?.splitLine?.lineStyle || {}) }, ...(axis?.splitLine || {}) },
});
const themeSeries = (series, index) => {
  const color = appleChartPalette[index % appleChartPalette.length];
  const next = { ...series };
  if (next.type === "bar") {
    const originalColor = next.itemStyle?.color;
    const themedColor = typeof originalColor === "function" ? originalColor : color;
    next.barMaxWidth = next.barMaxWidth || 22;
    next.itemStyle = { ...(next.itemStyle || {}), borderRadius: next.stack ? [0, 0, 0, 0] : [8, 8, 0, 0], color: themedColor, shadowBlur: 7, shadowColor: "rgba(15,23,42,.08)" };
  }
  if (next.type === "line") {
    next.symbolSize = next.symbolSize || 8;
    next.lineStyle = { ...(next.lineStyle || {}), width: 3, color, shadowBlur: 8, shadowColor: "rgba(10,132,255,.18)" };
    next.itemStyle = { ...(next.itemStyle || {}), color, borderColor: "#fff", borderWidth: 2 };
  }
  if (next.type === "pie") {
    next.itemStyle = { borderColor: "#fff", borderWidth: 2, ...(next.itemStyle || {}) };
  }
  if (next.label?.show) {
    next.label = { ...(next.label || {}), color: "#1F2937", fontWeight: 800, backgroundColor: "rgba(255,255,255,.94)", borderRadius: 8, padding: [2, 5], textBorderWidth: 0 };
  }
  return next;
};
const themeGrid = (grid, legend) => {
  if (!grid) return grid;
  const top = Number(grid.top ?? 0);
  const legendAtTop = legend && (legend.top == null || legend.top === 0 || legend.top === "top");
  return { ...grid, top: legendAtTop ? Math.max(top || 0, 72) : grid.top };
};
const applyAppleChartTheme = (option) => ({
  color: option.color || appleChartPalette,
  ...option,
  tooltip: { trigger: "axis", ...(option.tooltip || {}), backgroundColor: "rgba(255,255,255,.96)", borderColor: "#E2E8F0", borderWidth: 1, textStyle: { color: "#1F2937", ...(option.tooltip?.textStyle || {}) }, extraCssText: `box-shadow:0 12px 30px rgba(16,24,40,.12);border-radius:12px;${option.tooltip?.extraCssText || ""}` },
  legend: option.legend ? { itemWidth: 13, itemHeight: 8, ...(option.legend || {}), textStyle: { color: "#526174", fontWeight: 700, fontSize: 12, ...(option.legend?.textStyle || {}) } } : option.legend,
  grid: option.grid ? { containLabel: true, ...themeGrid(option.grid || {}, option.legend) } : option.grid,
  xAxis: Array.isArray(option.xAxis) ? option.xAxis.map(themeAxis) : option.xAxis ? themeAxis(option.xAxis) : option.xAxis,
  yAxis: Array.isArray(option.yAxis) ? option.yAxis.map(themeAxis) : option.yAxis ? themeAxis(option.yAxis) : option.yAxis,
  visualMap: option.visualMap ? { ...(option.visualMap || {}), inRange: { color: ["#EFF6FF", "#BFDBFE", "#FDBA74", "#FB7185"], ...(option.visualMap?.inRange || {}) } } : option.visualMap,
  series: asArray(option.series).map(themeSeries),
});

const safeParse = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};
const storageKey = (type, key) => `qms-chart-label-position:${type}:${key}`;
const axisStorageKey = (type, key) => `qms-chart-axis-range:${type}:${key}`;
const usePersistentPositions = (type, key, defaults) => {
  const [positions, setPositions] = useState(() => ({
    ...defaults,
    ...safeParse(localStorage.getItem(storageKey(type, key)), {}),
  }));
  useEffect(() => {
    setPositions((current) => {
      const next = { ...defaults, ...current };
      localStorage.setItem(storageKey(type, key), JSON.stringify(next));
      return next;
    });
  }, [type, key, JSON.stringify(defaults)]);
  useEffect(() => { localStorage.setItem(storageKey(type, key), JSON.stringify(positions)); }, [type, key, positions]);
  return [positions, setPositions];
};
const usePersistentAxisRange = (type, key, defaults) => {
  const [range, setRange] = useState(() => ({
    ...defaults,
    ...safeParse(localStorage.getItem(axisStorageKey(type, key)), {}),
  }));
  useEffect(() => {
    const next = { ...defaults, ...range };
    localStorage.setItem(axisStorageKey(type, key), JSON.stringify(next));
  }, [type, key, range.min, range.max, JSON.stringify(defaults)]);
  return [range, setRange];
};
const useLabelControlsVisible = () => {
  const [visible, setVisible] = useState(() => localStorage.getItem("qms-chart-label-controls-visible-v2") === "true");
  useEffect(() => {
    const update = (event) => setVisible(event.detail);
    window.addEventListener("qms-chart-label-controls", update);
    return () => window.removeEventListener("qms-chart-label-controls", update);
  }, []);
  return visible;
};
const positionLabels = {
  top: "上方", bottom: "下方", left: "左侧", right: "右侧",
  inside: "内部", insideLeft: "内部左侧", insideRight: "内部右侧", outside: "外侧", none: "隐藏",
};
function LabelPositionControl({ positions, onChange, options = ["top", "bottom", "inside", "left", "right", "none"] }) {
  const visible = useLabelControlsVisible();
  if (!visible) return null;
  return <div className="chart-label-position-control"><span>数值位置</span>{Object.entries(positions).map(([name, value]) => <label key={name}>{name}<select value={value} onChange={(event) => onChange(name, event.target.value)}>{options.map((option) => <option key={option} value={option}>{positionLabels[option]}</option>)}</select></label>)}</div>;
}
const labelPosition = (value) => value === "none" ? "top" : value;
const labelVisible = (value) => value !== "none";
const topLegend = (right = 8) => isAppleTheme()
  ? { type: "scroll", left: 8, right: 8, top: 0 }
  : { right, top: 0 };
const bottomLegend = () => isAppleTheme()
  ? { type: "scroll", left: 8, right: 8, bottom: 0 }
  : { type: "scroll", bottom: 0, left: 8, right: 8 };

export function LineCompare({ data, height = 300, chartKey = data.series.map((item) => item.name).join("-") }) {
  const defaults = Object.fromEntries(data.series.map((item, index) => [item.name, index ? "bottom" : "top"]));
  const [positions, setPositions] = usePersistentPositions("line", chartKey, defaults);
  const [rateAxis, setRateAxis] = usePersistentAxisRange("line", chartKey, { min: 75, max: 100 });
  const changePosition = (name, value) => setPositions((current) => ({ ...current, [name]: value }));
  return <div className="chart-config-wrap"><div className="chart-control-row"><RateAxisControl range={rateAxis} onChange={setRateAxis}/><LabelPositionControl positions={positions} onChange={changePosition}/></div><ScaledChart style={{ height }} option={{
    tooltip: { trigger: "axis" },
    legend: topLegend(8),
    grid: { left: 42, right: 18, top: 42, bottom: 30 },
    xAxis: { type: "category", data: data.labels, axisLine: { lineStyle: { color: "#d5dbe5" } } },
    yAxis: { type: "value", min: Number(rateAxis.min) || 0, max: Math.max(Number(rateAxis.max) || 100, (Number(rateAxis.min) || 0) + 0.1), axisLabel: { formatter: "{value}%" }, splitLine: { lineStyle: { color: "#eef1f5" } } },
    series: data.series.map((s, i) => ({ name: s.name, type: "line", smooth: true, symbolSize: 7, data: s.data, label: { show: labelVisible(positions[s.name]), position: labelPosition(positions[s.name]), formatter: "{c}", fontSize: 9 }, labelLayout: { hideOverlap: false, moveOverlap: "shiftY" }, lineStyle: { width: 3 }, itemStyle: { color: i ? cyan : blue }, areaStyle: i === 0 ? { color: "rgba(47,126,230,.07)" } : undefined })),
  }} /></div>;
}
export function BarCompare({ labels, first, second, names = ["2025", "2026"], percent = true, height = 310, chartKey = names.join("-"), rateAxisOverride = null, hideRateAxisControl = false }) {
  const [positions, setPositions] = usePersistentPositions("bar", chartKey, { [names[0]]: "top", [names[1]]: "top" });
  const [rateAxis, setRateAxis] = usePersistentAxisRange("bar", chartKey, { min: 0, max: 100 });
  const effectiveRateAxis = rateAxisOverride || rateAxis;
  const changePosition = (name, value) => setPositions((current) => ({ ...current, [name]: value }));
  return <div className="chart-config-wrap"><div className="chart-control-row">{percent && !hideRateAxisControl && <RateAxisControl range={rateAxis} onChange={setRateAxis}/>}<LabelPositionControl positions={positions} onChange={changePosition}/></div><ScaledChart style={{ height }} option={{
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => percent ? `${v}%` : v },
    legend: topLegend(6),
    grid: { left: 46, right: 18, top: 42, bottom: 54 },
    xAxis: { type: "category", data: labels, axisLabel: { interval: 0, rotate: labels.length > 7 ? 25 : 0, color: "#596273" }, axisLine: { lineStyle: { color: "#d8dee7" } } },
    yAxis: { type: "value", min: percent ? Number(effectiveRateAxis.min) || 0 : undefined, max: percent ? Math.max(Number(effectiveRateAxis.max) || 100, (Number(effectiveRateAxis.min) || 0) + 0.1) : undefined, axisLabel: { formatter: percent ? "{value}%" : "{value}" }, splitLine: { lineStyle: { color: "#edf0f4" } } },
    series: [
      { name: names[0], type: "bar", data: first, barMaxWidth: 28, itemStyle: { color: blue, borderRadius: [4, 4, 0, 0] }, label: { show: labelVisible(positions[names[0]]), position: labelPosition(positions[names[0]]), formatter: percent ? "{c}%" : "{c}", fontSize: 10 }, labelLayout: { hideOverlap: false } },
      { name: names[1], type: "bar", data: second, barMaxWidth: 28, itemStyle: { color: orange, borderRadius: [4, 4, 0, 0] }, label: { show: labelVisible(positions[names[1]]), position: labelPosition(positions[names[1]]), formatter: percent ? "{c}%" : "{c}", fontSize: 10 }, labelLayout: { hideOverlap: false } },
    ],
  }} /></div>;
}

export function HorizontalRank({ rows, height = 330, chartKey = "five-rate-rank" }) {
  const data = [...rows].sort((a, b) => a.fiveRate - b.fiveRate);
  const [positions, setPositions] = usePersistentPositions("horizontal-rank", chartKey, { "5分率": "right" });
  const [rateAxis, setRateAxis] = usePersistentAxisRange("horizontal-rank", chartKey, { min: 0, max: 100 });
  const position = positions["5分率"];
  return <div className="chart-config-wrap"><div className="chart-control-row"><RateAxisControl range={rateAxis} onChange={setRateAxis}/><LabelPositionControl positions={positions} onChange={(name, value) => setPositions((current) => ({ ...current, [name]: value }))} options={["right", "left", "inside", "none"]}/></div><ScaledChart style={{ height }} option={{
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (p) => `${p[0].name}<br/>5分率：${p[0].value}%` },
    grid: { left: 72, right: 48, top: 8, bottom: 18 },
    xAxis: { type: "value", min: Number(rateAxis.min) || 0, max: Math.max(Number(rateAxis.max) || 100, (Number(rateAxis.min) || 0) + 0.1), axisLabel: { formatter: "{value}%" }, splitLine: { lineStyle: { color: "#eef1f5" } } },
    yAxis: { type: "category", data: data.map((x) => x.name), axisTick: { show: false }, axisLine: { show: false } },
    series: [{ type: "bar", data: data.map((x) => x.fiveRate), barWidth: 17, itemStyle: { color: (p) => p.value < 40 ? red : p.value < 70 ? orange : green, borderRadius: [0, 6, 6, 0] }, label: { show: labelVisible(position), position: labelPosition(position), formatter: "{c}%" }, labelLayout: { hideOverlap: false } }],
  }} /></div>;
}

export function StackedStage({ rows, height = 330, chartKey = "stage-distribution" }) {
  const totals = rows.map((x) => Math.max(x.review + x.production + x.onsite, 1));
  const [positions, setPositions] = usePersistentPositions("stacked-stage", chartKey, { "评审问题": "inside", "生产问题": "inside", "现场问题": "inside" });
  const [rateAxis, setRateAxis] = usePersistentAxisRange("stacked-stage", chartKey, { min: 0, max: 100 });
  const changePosition = (name, value) => setPositions((current) => ({ ...current, [name]: value }));
  const stageData = (key) => rows.map((row, index) => ({
    value: +(row[key] / totals[index] * 100).toFixed(1),
    count: row[key] || 0,
  }));
  const stageLabel = (name) => ({
    show: labelVisible(positions[name]),
    position: labelPosition(positions[name]),
    color: "#fff",
    fontSize: 9,
    lineHeight: 12,
    formatter: (p) => Number(p.data.count || 0) ? `${Number(p.data.count || 0).toLocaleString()}/${p.value}%` : "",
  });
  return <div className="chart-config-wrap"><div className="chart-control-row"><RateAxisControl range={rateAxis} onChange={setRateAxis}/><LabelPositionControl positions={positions} onChange={changePosition} options={["inside", "insideLeft", "insideRight", "left", "right", "none"]}/></div><ScaledChart style={{ height }} option={{
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => `${params[0]?.axisValue || ""}<br/>${params.map((item) => `${item.marker}${item.seriesName}：${item.data.count}（${item.value}%）`).join("<br/>")}`,
    },
    legend: topLegend(0),
    grid: { left: 92, right: 24, top: 40, bottom: 18 },
    xAxis: { type: "value", min: Number(rateAxis.min) || 0, max: Math.max(Number(rateAxis.max) || 100, (Number(rateAxis.min) || 0) + 0.1), axisLabel: { formatter: "{value}%" }, splitLine: { show: false } },
    yAxis: { type: "category", data: rows.map((x) => x.name), axisTick: { show: false }, axisLine: { show: false } },
    series: [
      { name: "评审问题", type: "bar", stack: "total", data: stageData("review"), itemStyle: { color: blue }, label: stageLabel("评审问题"), labelLayout: { hideOverlap: false } },
      { name: "生产问题", type: "bar", stack: "total", data: stageData("production"), itemStyle: { color: orange }, label: stageLabel("生产问题"), labelLayout: { hideOverlap: false } },
      { name: "现场问题", type: "bar", stack: "total", data: stageData("onsite"), itemStyle: { color: green }, label: stageLabel("现场问题"), labelLayout: { hideOverlap: false } },
    ],
  }} /></div>;
}

export function Donut({ rows, height = 270, chartKey = "donut" }) {
  const [positions, setPositions] = usePersistentPositions("donut", chartKey, { 分类数值: "outside" });
  const position = positions.分类数值;
  return <div className="chart-config-wrap"><LabelPositionControl positions={positions} onChange={(name, value) => setPositions((current) => ({ ...current, [name]: value }))} options={["outside", "inside", "none"]}/><ScaledChart style={{ height }} option={{
    tooltip: { trigger: "item", formatter: "{b}<br/>{c} 路 {d}%" },
    legend: bottomLegend(),
    series: [{ type: "pie", radius: ["45%", "68%"], center: ["50%", "43%"], data: rows.map((x) => ({ name: x.name, value: x.count })), label: { show: labelVisible(position), position: labelPosition(position), formatter: "{b}\n{d}%", fontSize: 10 }, labelLayout: { hideOverlap: false, moveOverlap: "shiftY" }, itemStyle: { borderColor: "#fff", borderWidth: 2 } }],
  }} /></div>;
}

export function Pareto({ rows, height = 315, chartKey = "pareto" }) {
  const total = rows.reduce((s, x) => s + x.count, 0);
  let sum = 0;
  const cumulative = rows.map((x) => { sum += x.count; return +(sum / Math.max(total, 1) * 100).toFixed(1); });
  const [positions, setPositions] = usePersistentPositions("pareto", chartKey, { 问题数: "top", 累计占比: "bottom" });
  const [rateAxis, setRateAxis] = usePersistentAxisRange("pareto", chartKey, { min: 0, max: 100 });
  const changePosition = (name, value) => setPositions((current) => ({ ...current, [name]: value }));
  return <div className="chart-config-wrap"><div className="chart-control-row"><RateAxisControl range={rateAxis} onChange={setRateAxis}/><LabelPositionControl positions={positions} onChange={changePosition}/></div><ScaledChart style={{ height }} option={{
    tooltip: { trigger: "axis" },
    legend: topLegend(0),
    grid: { left: 48, right: 48, top: 42, bottom: 62 },
    xAxis: { type: "category", data: rows.map((x) => x.name), axisLabel: { rotate: 28, interval: 0 } },
    yAxis: [{ type: "value", splitLine: { lineStyle: { color: "#eef1f5" } } }, { type: "value", min: Number(rateAxis.min) || 0, max: Math.max(Number(rateAxis.max) || 100, (Number(rateAxis.min) || 0) + 0.1), axisLabel: { formatter: "{value}%" }, splitLine: { show: false } }],
    series: [
      { name: "问题数", type: "bar", data: rows.map((x) => x.count), itemStyle: { color: blue, borderRadius: [5, 5, 0, 0] }, barMaxWidth: 32, label: { show: labelVisible(positions.问题数), position: labelPosition(positions.问题数), formatter: "{c}", fontSize: 9 }, labelLayout: { hideOverlap: false } },
      { name: "累计占比", type: "line", yAxisIndex: 1, data: cumulative, smooth: true, itemStyle: { color: orange }, label: { show: labelVisible(positions.累计占比), position: labelPosition(positions.累计占比), formatter: "{c}%", fontSize: 9 }, labelLayout: { hideOverlap: false, moveOverlap: "shiftY" } },
    ],
  }} /></div>;
}

export function QuantityRateCombo({
  rows,
  labelKey = "name",
  qty2025 = "y2025Qty",
  qty2026 = "y2026Qty",
  bad2025 = "y2025Bad",
  bad2026 = "y2026Bad",
  rate2025 = "y2025Rate",
  rate2026 = "y2026Rate",
  rateLabel = "良率",
  qtyLabel = "批次数量",
  badLabel = "不合格",
  showBad = true,
  height = 340,
  chartKey = `${labelKey}-${qtyLabel}-${rateLabel}-${badLabel}-${showBad}`,
  theme = "auto",
  rateAxisOverride = null,
  hideRateAxisControl = false,
}) {
  const resolvedTheme = theme === "auto" ? (document.documentElement.dataset.uiTheme || localStorage.getItem("qms-ui-theme") || "classic") : theme;
  const apple = resolvedTheme === "apple";
  const applePalette = {
    qty25: "#9CC7F3",
    bad25: "#F2A3A8",
    qty26: "#FDBA74",
    bad26: "#D85A67",
    rate25: "#0A84FF",
    rate26: "#FF9F0A",
    grid: "#EEF3F9",
    axis: "#D8E2EE",
    text: "#526174",
    muted: "#7C8A9E",
  };
  const appleGradient = (from, to) => ({
    type: "linear",
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: from },
      { offset: 1, color: to },
    ],
  });
  const appleBarColor = (name) => {
    if (name === "2025总数") return appleGradient("#B8D8FA", applePalette.qty25);
    if (name === "2026总数") return appleGradient("#FFD3A4", applePalette.qty26);
    if (name.startsWith("2025")) return appleGradient("#F7C2C6", applePalette.bad25);
    if (name.startsWith("2026")) return appleGradient("#EC7A84", applePalette.bad26);
    return applePalette.qty25;
  };
  const [axisAngle, setAxisAngle] = useState(0);
  const seriesNames = [
    "2025总数", ...(showBad ? [`2025${badLabel}`] : []), "2026总数", ...(showBad ? [`2026${badLabel}`] : []),
    `2025${rateLabel}`, `2026${rateLabel}`,
  ];
  const defaultPositions = Object.fromEntries(seriesNames.map((name) => [
    name, name.startsWith("2026") && name.includes(rateLabel) ? "bottom" : "top",
  ]));
  const [positions, setPositions] = usePersistentPositions("quantity-rate", chartKey, defaultPositions);
  const [rateAxis, setRateAxis] = usePersistentAxisRange("quantity-rate", chartKey, { min: 0, max: 100 });
  const effectiveRateAxis = rateAxisOverride || rateAxis;
  const changePosition = (name, value) => setPositions((current) => ({ ...current, [name]: value }));
  const appleLabelVisible = (name) => apple ? positions[name] !== "none" : labelVisible(positions[name]);
  const appleLabelDistance = (distance) => apple ? Math.max(18, distance + 8) : distance;
  const labels = rows.map((x) => x[labelKey]);
  const axisBottom = axisAngle ? Math.min(170, Math.max(92, Math.max(...labels.map((label) => String(label).length)) * (axisAngle === 90 ? 12 : 8))) : 48;
  const numberLabel = (name, distance, color = apple ? "#1F2937" : "#596273") => ({
    show: appleLabelVisible(name), position: labelPosition(positions[name]), distance: appleLabelDistance(distance), color: apple ? "#1F2937" : color, fontSize: apple ? 10 : 9, fontWeight: apple ? 700 : undefined,
    backgroundColor: apple ? "rgba(255,255,255,.96)" : undefined,
    borderRadius: apple ? 7 : undefined,
    padding: apple ? [2, 5] : undefined,
    borderColor: apple ? "rgba(226,232,240,.92)" : undefined,
    borderWidth: apple ? 1 : undefined,
    formatter: ({ value }) => value ? Number(value).toLocaleString() : "",
  });
  const ratePointLabel = (name, color) => ({
    show: appleLabelVisible(name), position: labelPosition(positions[name]), distance: apple ? 22 : 14, color: apple ? "#1F2937" : color, fontSize: apple ? 10 : 9, fontWeight: apple ? 800 : 600,
    backgroundColor: apple ? "rgba(255,255,255,.94)" : "rgba(255,255,255,.88)", borderRadius: apple ? 8 : 2, padding: apple ? [3, 6] : [1, 3],
    borderColor: apple ? "rgba(226,232,240,.9)" : undefined,
    borderWidth: apple ? 1 : undefined,
    formatter: ({ value }) => `${value}%`,
  });
  const rateData = (key, year) => rows.map((row, index) => {
    const labelName = `${year}${rateLabel}`;
    const selectedPosition = positions[labelName];
    const value = row[key] || 0;
    const low = value <= 12;
    return {
      value,
      label: {
        ...(apple ? { position: labelPosition(selectedPosition) } : {}),
        distance: apple ? 22 : (low ? 20 : 10),
        offset: apple
          ? (selectedPosition === "top" ? [year === 2025 ? -14 : 14, index % 2 ? -4 : -10] : undefined)
          : year === 2025
            ? [index % 2 ? -12 : -18, low ? -8 : -2]
            : [index % 2 ? 18 : 12, low ? 10 : 5],
      },
    };
  });
  const labelLayout = { hideOverlap: false, moveOverlap: "shiftY" };
  const badValue = (row, badKey, qtyKey, rateKey) => {
    if (row[badKey] != null) return row[badKey];
    return Math.max(0, Math.round((row[qtyKey] || 0) * (100 - (row[rateKey] || 0)) / 100));
  };
  const barSeries = [
    { name: "2025总数", type: "bar", data: rows.map((x) => x[qty2025] || 0), barMaxWidth: 22, barGap: "12%", label: numberLabel("2025总数", 5), labelLayout, itemStyle: { color: "#8db9ed", borderRadius: [3,3,0,0] } },
    ...(showBad ? [{ name: `2025${badLabel}`, type: "bar", data: rows.map((x) => badValue(x, bad2025, qty2025, rate2025)), barMaxWidth: 22, label: numberLabel(`2025${badLabel}`, 17, "#a43d48"), labelLayout, itemStyle: { color: "#dc6b73", borderRadius: [3,3,0,0] } }] : []),
    { name: "2026总数", type: "bar", data: rows.map((x) => x[qty2026] || 0), barMaxWidth: 22, label: numberLabel("2026总数", 5), labelLayout, itemStyle: { color: "#f6ad72", borderRadius: [3,3,0,0] } },
    ...(showBad ? [{ name: `2026${badLabel}`, type: "bar", data: rows.map((x) => badValue(x, bad2026, qty2026, rate2026)), barMaxWidth: 22, label: numberLabel(`2026${badLabel}`, 17, "#8f3440"), labelLayout, itemStyle: { color: "#b84d58", borderRadius: [3,3,0,0] } }] : []),
  ];
  const themedBarSeries = apple ? barSeries.map((series, index) => ({
    ...series,
    barMaxWidth: 16,
    barGap: index === 0 ? "18%" : series.barGap,
    barCategoryGap: "42%",
    itemStyle: {
      ...series.itemStyle,
      color: appleBarColor(series.name),
      borderRadius: [9, 9, 0, 0],
      shadowBlur: 8,
      shadowColor: "rgba(15,23,42,.08)",
    },
    emphasis: { focus: "series", itemStyle: { shadowBlur: 14, shadowColor: "rgba(10,132,255,.18)" } },
  })) : barSeries;
  return <div className={`combo-chart-wrap${apple ? " apple-combo-chart" : ""}`}>
    <div className="chart-control-row"><div className="axis-angle-control"><span>横坐标文字</span>{[0,45,90].map((angle) => <button key={angle} className={axisAngle === angle ? "active" : ""} onClick={() => setAxisAngle(angle)}>{angle}°</button>)}</div>{!hideRateAxisControl && <RateAxisControl range={rateAxis} onChange={setRateAxis}/>}<LabelPositionControl positions={positions} onChange={changePosition}/></div>
    <ScaledChart style={{ height }} option={{
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      backgroundColor: apple ? "rgba(255,255,255,.96)" : undefined,
      borderColor: apple ? "#E2E8F0" : undefined,
      borderWidth: apple ? 1 : undefined,
      textStyle: apple ? { color: "#1F2937" } : undefined,
      extraCssText: apple ? "box-shadow:0 12px 30px rgba(16,24,40,.12);border-radius:12px;" : undefined,
      valueFormatter: (value) => typeof value === "number" ? value.toLocaleString() : value,
    },
    legend: apple ? { type: "scroll", left: 8, right: 8, top: 0, itemWidth: 13, itemHeight: 8, borderRadius: 6, textStyle: { color: applePalette.text, fontWeight: 700, fontSize: 12 } } : { top: 0, right: 8 },
    grid: { left: apple ? 64 : 58, right: apple ? 64 : 58, top: apple ? 82 : 78, bottom: axisBottom, containLabel: true },
    xAxis: {
      type: "category", data: labels,
      axisLabel: { interval: 0, rotate: axisAngle, margin: axisAngle ? 12 : 8, color: apple ? applePalette.text : "#596273", fontWeight: apple ? 600 : undefined, hideOverlap: axisAngle === 0 },
      axisLine: { lineStyle: { color: apple ? applePalette.axis : "#d8dee7" } },
      axisTick: { show: !apple },
    },
    yAxis: [
      { type: "value", name: qtyLabel, nameTextStyle: { color: apple ? applePalette.muted : "#718096", fontWeight: apple ? 700 : undefined }, axisLabel: { color: apple ? applePalette.muted : undefined }, splitLine: { lineStyle: { color: apple ? applePalette.grid : "#eef1f5", type: apple ? "dashed" : "solid" } } },
      { type: "value", name: rateLabel, min: Number(effectiveRateAxis.min) || 0, max: Math.max(Number(effectiveRateAxis.max) || 100, (Number(effectiveRateAxis.min) || 0) + 0.1), nameTextStyle: apple ? { color: applePalette.muted, fontWeight: 700 } : undefined, axisLabel: { formatter: "{value}%", color: apple ? applePalette.muted : undefined }, splitLine: { show: false } },
    ],
    series: [
      ...themedBarSeries,
      { name: `2025${rateLabel}`, type: "line", yAxisIndex: 1, data: rateData(rate2025, 2025), label: ratePointLabel(`2025${rateLabel}`, apple ? applePalette.rate25 : blue), labelLayout, smooth: true, symbolSize: apple ? 9 : 7, lineStyle: { width: apple ? 3.4 : 2.5, color: apple ? applePalette.rate25 : blue, shadowBlur: apple ? 10 : 0, shadowColor: apple ? "rgba(10,132,255,.26)" : undefined }, itemStyle: { color: apple ? applePalette.rate25 : blue, borderColor: "#fff", borderWidth: apple ? 2.5 : 0 } },
      { name: `2026${rateLabel}`, type: "line", yAxisIndex: 1, data: rateData(rate2026, 2026), label: ratePointLabel(`2026${rateLabel}`, apple ? applePalette.rate26 : orange), labelLayout, smooth: true, symbolSize: apple ? 9 : 7, lineStyle: { width: apple ? 3.4 : 2.5, color: apple ? applePalette.rate26 : orange, shadowBlur: apple ? 10 : 0, shadowColor: apple ? "rgba(255,159,10,.28)" : undefined }, itemStyle: { color: apple ? applePalette.rate26 : orange, borderColor: "#fff", borderWidth: apple ? 2.5 : 0 } },
    ],
    }} />
  </div>;
}
function RateAxisControl({ range, onChange, label = "比例轴" }) {
  const visible = useLabelControlsVisible();
  if (!visible) return null;
  const min = Number(range.min);
  const max = Number(range.max);
  const safeMax = Math.max(0.1, Number.isFinite(max) ? max : 100);
  const safeMin = Math.min(safeMax - 0.1, Math.max(0, Number.isFinite(min) ? min : 0));
  return <div className="axis-angle-control rate-axis-control"><span>{label}</span><label>最小<input type="number" min="0" step="0.1" value={range.min} onChange={(event) => onChange({ ...range, min: event.target.value })} onBlur={() => onChange({ ...range, min: safeMin })}/></label><label>最大<input type="number" min="0.1" step="0.1" value={range.max} onChange={(event) => onChange({ ...range, max: event.target.value })} onBlur={() => onChange({ ...range, max: safeMax })}/></label></div>;
}

export function MachinedTpmCompareChart({
  rows,
  labelKey = "name",
  minRate = 0,
  maxRate = 5,
  height = 420,
  chartKey = "machined-tpm-compare",
  rateAxisOverride = null,
  hideRateAxisControl = false,
}) {
  const names = ["2025数量", "2026数量", "2025比例", "2026比例"];
  const defaultPositions = { "2025数量": "top", "2026数量": "top", "2025比例": "top", "2026比例": "bottom" };
  const [positions, setPositions] = usePersistentPositions("machined-tpm", chartKey, defaultPositions);
  const changePosition = (name, value) => setPositions((current) => ({ ...current, [name]: value }));
  const [rateAxis, setRateAxis] = usePersistentAxisRange("machined-tpm", chartKey, { min: minRate, max: maxRate });
  const effectiveRateAxis = rateAxisOverride || rateAxis;
  const [axisAngle, setAxisAngle] = useState(0);
  const labels = rows.map((row) => row[labelKey] ?? row.label ?? row.name ?? "");
  const axisBottom = axisAngle ? Math.min(170, Math.max(82, Math.max(0, ...labels.map((label) => String(label).length)) * (axisAngle === 90 ? 10 : 7))) : 48;
  const valueLabel = (name, color) => ({
    show: labelVisible(positions[name]),
    position: labelPosition(positions[name]),
    color,
    fontSize: 9,
    backgroundColor: "rgba(255,255,255,.9)",
    borderRadius: 3,
    padding: [1, 3],
    formatter: ({ value }) => value == null ? "" : Number(value).toLocaleString(),
  });
  const rateLabel = (name, color) => ({
    show: labelVisible(positions[name]),
    position: labelPosition(positions[name]),
    distance: isAppleTheme() ? 20 : 14,
    color,
    fontSize: 9,
    fontWeight: 700,
    backgroundColor: "rgba(255,255,255,.92)",
    borderRadius: 6,
    padding: [2, 5],
    formatter: ({ value }) => `${value}%`,
  });
  return <div className="chart-config-wrap">
    <div className="chart-control-row"><div className="axis-angle-control"><span>横坐标文字</span>{[0,45,90].map((angle) => <button key={angle} className={axisAngle === angle ? "active" : ""} onClick={() => setAxisAngle(angle)}>{angle}°</button>)}</div>{!hideRateAxisControl && <RateAxisControl range={rateAxis} onChange={setRateAxis}/>}<LabelPositionControl positions={positions} onChange={changePosition}/></div>
    <ScaledChart style={{ height }} option={{
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        valueFormatter: (value) => typeof value === "number" ? value.toLocaleString() : value,
      },
      legend: topLegend(8),
      grid: { left: 58, right: 68, top: isAppleTheme() ? 92 : 82, bottom: axisBottom, containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { interval: 0, rotate: axisAngle, color: "#596273", hideOverlap: axisAngle === 0 },
        axisLine: { lineStyle: { color: "#d8dee7" } },
      },
      yAxis: [
        { type: "value", name: "加工件数量", splitLine: { lineStyle: { color: "#eef1f5" } } },
        { type: "value", name: "加工件占比", min: Number(effectiveRateAxis.min) || 0, max: Math.max(Number(effectiveRateAxis.max) || maxRate || 5, (Number(effectiveRateAxis.min) || 0) + 0.1), axisLabel: { formatter: "{value}%" }, splitLine: { show: false } },
      ],
      series: [
        { name: "2025数量", type: "bar", data: rows.map((row) => row.y2025Bad || 0), barMaxWidth: 22, itemStyle: { color: "#8db9ed", borderRadius: [4,4,0,0] }, label: valueLabel("2025数量", "#365d84"), labelLayout: { hideOverlap: false, moveOverlap: "shiftY" } },
        { name: "2026数量", type: "bar", data: rows.map((row) => row.y2026Bad || 0), barMaxWidth: 22, itemStyle: { color: "#f6ad72", borderRadius: [4,4,0,0] }, label: valueLabel("2026数量", "#8f4d19"), labelLayout: { hideOverlap: false, moveOverlap: "shiftY" } },
        { name: "2025比例", type: "line", yAxisIndex: 1, data: rows.map((row) => row.y2025Rate || 0), smooth: true, symbolSize: 7, lineStyle: { width: 2.6, color: blue }, itemStyle: { color: blue }, label: rateLabel("2025比例", blue), labelLayout: { hideOverlap: false, moveOverlap: "shiftY" } },
        { name: "2026比例", type: "line", yAxisIndex: 1, data: rows.map((row) => row.y2026Rate || 0), smooth: true, symbolSize: 7, lineStyle: { width: 2.6, color: orange }, itemStyle: { color: orange }, label: rateLabel("2026比例", orange), labelLayout: { hideOverlap: false, moveOverlap: "shiftY" } },
      ],
    }} />
  </div>;
}

export function WorkshopCategoryHeatmap({ data, height = 400, chartKey = "workshop-category" }) {
  const categories = data?.categories || [];
  const rows = data?.rows || [];
  const values = rows.flatMap((row, y) => row.values.map((value, x) => [x, y, value]));
  const max = Math.max(1, ...values.map((item) => item[2]));
  const [positions, setPositions] = usePersistentPositions("heatmap", chartKey, { 问题数量: "inside" });
  const position = positions.问题数量;
  return <div className="chart-config-wrap"><LabelPositionControl positions={positions} onChange={(name, value) => setPositions((current) => ({ ...current, [name]: value }))} options={["inside", "top", "bottom", "none"]}/><ScaledChart style={{ height }} option={{
    tooltip: { formatter: ({ value }) => `${rows[value[1]]?.name}<br/>${categories[value[0]]}：${value[2]}` },
    grid: { left: 105, right: 30, top: 18, bottom: 90, containLabel: true },
    xAxis: { type: "category", data: categories, splitArea: { show: true }, axisLabel: { interval: 0, rotate: 45, fontSize: 10 } },
    yAxis: { type: "category", data: rows.map((row) => row.name), splitArea: { show: true }, axisLabel: { fontSize: 10 } },
    visualMap: { min: 0, max, calculable: true, orient: "horizontal", left: "center", bottom: 5, inRange: { color: ["#eef6ff", "#83b9ec", "#f6bd6f", "#e85c55"] } },
    series: [{ type: "heatmap", data: values, label: { show: labelVisible(position), position: labelPosition(position), formatter: ({ value }) => value[2] || "", fontSize: 9 }, labelLayout: { hideOverlap: false }, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,.25)" } } }],
  }} /></div>;
}

export function ScoreYearCompare({ rows, metric, label, percent = false, max, height = 330, chartKey = `${metric}-${label}` }) {
  const suffix = percent ? "%" : "";
  const [positions, setPositions] = usePersistentPositions("score-year", chartKey, { "2025同期": "top", "2026本期": "top" });
  const changePosition = (name, value) => setPositions((current) => ({ ...current, [name]: value }));
  return <div className="chart-config-wrap"><LabelPositionControl positions={positions} onChange={changePosition}/><ScaledChart style={{ height }} option={{
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (value) => `${value}${suffix}` },
    legend: topLegend(8),
    grid: { left: 52, right: 24, top: isAppleTheme() ? 76 : 56, bottom: 48, containLabel: true },
    xAxis: { type: "category", data: rows.map((row) => displayLabel(row.name)), axisLabel: { interval: 0 } },
    yAxis: { type: "value", name: label, max, axisLabel: { formatter: `{value}${suffix}` }, splitLine: { lineStyle: { color: "#eef1f5" } } },
    series: [
      { name: "2025同期", type: "bar", data: rows.map((row) => row[`y2025${metric}`] || 0), barMaxWidth: 32, label: { show: labelVisible(positions["2025同期"]), position: labelPosition(positions["2025同期"]), distance: isAppleTheme() ? 8 : undefined, formatter: `{c}${suffix}`, fontSize: 10 }, labelLayout: { hideOverlap: false, moveOverlap: "shiftY" }, itemStyle: { color: "#78aee8", borderRadius: [4,4,0,0] } },
      { name: "2026本期", type: "bar", data: rows.map((row) => row[`y2026${metric}`] || 0), barMaxWidth: 32, label: { show: labelVisible(positions["2026本期"]), position: labelPosition(positions["2026本期"]), distance: isAppleTheme() ? 8 : undefined, formatter: `{c}${suffix}`, fontSize: 10 }, labelLayout: { hideOverlap: false, moveOverlap: "shiftY" }, itemStyle: { color: "#f39a50", borderRadius: [4,4,0,0] } },
    ],
  }} /></div>;
}

export function ScoreMonthlyTrend({ rows, metric, label, percent = false, max, height = 320, chartKey = `${metric}-${label}` }) {
  const suffix = percent ? "%" : "";
  const [positions, setPositions] = usePersistentPositions("score-monthly-trend", chartKey, { "2025同期": "top", "2026本期": "bottom" });
  const changePosition = (name, value) => setPositions((current) => ({ ...current, [name]: value }));
  return <div className="chart-config-wrap"><LabelPositionControl positions={positions} onChange={changePosition}/><ScaledChart style={{ height }} option={{
    tooltip: { trigger: "axis", valueFormatter: (value) => `${value}${suffix}` },
    legend: topLegend(8),
    grid: { left: 52, right: 25, top: 48, bottom: 38, containLabel: true },
    xAxis: { type: "category", data: rows.map((row) => row.month), axisLine: { lineStyle: { color: "#d8dee7" } } },
    yAxis: { type: "value", name: label, max, axisLabel: { formatter: `{value}${suffix}` }, splitLine: { lineStyle: { color: "#eef1f5" } } },
    series: [
      { name: "2025同期", type: "line", smooth: true, symbolSize: 7, data: rows.map((row) => row[`y2025${metric}`] || 0), label: { show: labelVisible(positions["2025同期"]), position: labelPosition(positions["2025同期"]), formatter: `{c}${suffix}`, fontSize: 9 }, labelLayout: { hideOverlap: false, moveOverlap: "shiftY" }, lineStyle: { width: 2.5 }, itemStyle: { color: blue } },
      { name: "2026本期", type: "line", smooth: true, symbolSize: 7, data: rows.map((row) => row[`y2026${metric}`] || 0), label: { show: labelVisible(positions["2026本期"]), position: labelPosition(positions["2026本期"]), formatter: `{c}${suffix}`, fontSize: 9 }, labelLayout: { hideOverlap: false, moveOverlap: "shiftY" }, lineStyle: { width: 2.5 }, itemStyle: { color: orange } },
    ],
  }} /></div>;
}

export function ScoreMonthlyCombo({ rows, metric, label, numeratorKey, numeratorName, denominatorName = "评分总数量", percent = false, max, height = 340, chartKey = `${metric}-${label}-${numeratorName}`, rateAxisOverride = null, hideRateAxisControl = false }) {
  const suffix = percent ? "%" : "";
  const names = [`2025${numeratorName}`, `2025${denominatorName}`, `2026${numeratorName}`, `2026${denominatorName}`, `2025${label}`, `2026${label}`];
  const defaultPositions = Object.fromEntries(names.map((name, index) => [name, index === 5 ? "bottom" : "top"]));
  const [positions, setPositions] = usePersistentPositions("score-monthly-combo", chartKey, defaultPositions);
  const [rateAxis, setRateAxis] = usePersistentAxisRange("score-monthly-combo", chartKey, { min: 0, max: max || 100 });
  const effectiveRateAxis = rateAxisOverride || rateAxis;
  const changePosition = (name, value) => setPositions((current) => ({ ...current, [name]: value }));
  const values = (year) => {
    const denominator = rows.map((row) => row[`y${year}Count`] ?? 0);
    const rates = rows.map((row) => row[`y${year}${metric}`] ?? 0);
    const numerator = rows.map((row, index) => {
      const exact = row[`y${year}${numeratorKey}`];
      if (exact != null) return exact;
      return metric === "Avg"
        ? Math.round(rates[index] * denominator[index])
        : Math.round(rates[index] * denominator[index] / 100);
    });
    return { numerator, denominator, rates };
  };
  const y25 = values(2025);
  const y26 = values(2026);
  const valueLabel = (name, color) => ({ show: labelVisible(positions[name]), position: labelPosition(positions[name]), distance: 4, color, fontSize: 8, formatter: ({ value }) => value ? value.toLocaleString() : "" });
  return <div className="score-combo-wrap">
    <div className="chart-control-row">{!hideRateAxisControl && <RateAxisControl range={rateAxis} onChange={setRateAxis}/>}<LabelPositionControl positions={positions} onChange={changePosition}/></div>
    <ScaledChart style={{ height }} option={{
      tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
      legend: isAppleTheme() ? { top: 0, left: 8, right: 8, type: "scroll" } : { top: 0, left: 8, right: 8 },
      grid: { left: 58, right: 58, top: 62, bottom: 42, containLabel: true },
      xAxis: { type: "category", data: rows.map((row) => row.month), axisLine: { lineStyle: { color: "#d8dee7" } } },
      yAxis: [
        { type: "value", name: "数量", splitLine: { lineStyle: { color: "#eef1f5" } } },
        { type: "value", name: label, min: Number(effectiveRateAxis.min) || 0, max: Math.max(Number(effectiveRateAxis.max) || max || 100, (Number(effectiveRateAxis.min) || 0) + 0.1), axisLabel: { formatter: `{value}${suffix}` }, splitLine: { show: false } },
      ],
      series: [
        { name: `2025${numeratorName}`, type: "bar", data: y25.numerator, barWidth: 9, barGap: "18%", label: valueLabel(`2025${numeratorName}`, "#9a5a22"), labelLayout: { hideOverlap: false, moveOverlap: "shiftY" }, itemStyle: { color: "#f3b778", borderRadius: [3,3,0,0] } },
        { name: `2025${denominatorName}`, type: "bar", data: y25.denominator, barWidth: 9, barGap: "18%", label: valueLabel(`2025${denominatorName}`, "#41678c"), labelLayout: { hideOverlap: false, moveOverlap: "shiftY" }, itemStyle: { color: "#9fc5eb", borderRadius: [3,3,0,0] } },
        { name: `2026${numeratorName}`, type: "bar", data: y26.numerator, barWidth: 9, barGap: "18%", label: valueLabel(`2026${numeratorName}`, "#91400f"), labelLayout: { hideOverlap: false, moveOverlap: "shiftY" }, itemStyle: { color: "#e8752e", borderRadius: [3,3,0,0] } },
        { name: `2026${denominatorName}`, type: "bar", data: y26.denominator, barWidth: 9, barGap: "18%", label: valueLabel(`2026${denominatorName}`, "#174f84"), labelLayout: { hideOverlap: false, moveOverlap: "shiftY" }, itemStyle: { color: "#438fd8", borderRadius: [3,3,0,0] } },
        { name: `2025${label}`, type: "line", yAxisIndex: 1, data: y25.rates, smooth: true, symbolSize: 7, label: { show: labelVisible(positions[`2025${label}`]), position: labelPosition(positions[`2025${label}`]), formatter: `{c}${suffix}`, fontSize: 9, backgroundColor: "rgba(255,255,255,.88)", padding: [1,3] }, labelLayout: { hideOverlap: false, moveOverlap: "shiftY" }, lineStyle: { width: 2.4 }, itemStyle: { color: "#6f63c4" } },
        { name: `2026${label}`, type: "line", yAxisIndex: 1, data: y26.rates, smooth: true, symbolSize: 7, label: { show: labelVisible(positions[`2026${label}`]), position: labelPosition(positions[`2026${label}`]), formatter: `{c}${suffix}`, fontSize: 9, backgroundColor: "rgba(255,255,255,.88)", padding: [1,3] }, labelLayout: { hideOverlap: false, moveOverlap: "shiftY" }, lineStyle: { width: 2.6 }, itemStyle: { color: green } },
      ],
    }} />
  </div>;
}

const stackedPalette = ["#2f7ee6", "#f5822a", "#50ad68", "#8b67c7", "#19a9d5", "#e05d8c", "#9a7b4f", "#6b7f91"];
export function YearStackedCompare({ rows, values, height = 380, chartKey = values.join("-"), topToBottom = false, rateAxisOverride = null, hideRateAxisControl = false }) {
  // ECharts renders the first horizontal-category item at the bottom.
  // Keep 2025 visually above 2026 by feeding each entity in reverse year order.
  const axisRows = rows.flatMap((row) => [...row.years]
    .sort((a, b) => topToBottom ? a.year - b.year : b.year - a.year)
    .map((year) => ({ entity: row.name, ...year })));
  const defaultPositions = Object.fromEntries(values.map((value) => [value, "inside"]));
  const [positions, setPositions] = usePersistentPositions("year-stacked", chartKey, defaultPositions);
  const [rateAxis, setRateAxis] = usePersistentAxisRange("year-stacked", chartKey, { min: 0, max: 100 });
  const effectiveRateAxis = rateAxisOverride || rateAxis;
  const changePosition = (name, value) => setPositions((current) => ({ ...current, [name]: value }));
  return <div className="chart-config-wrap"><div className="chart-control-row">{!hideRateAxisControl && <RateAxisControl range={rateAxis} onChange={setRateAxis}/>}<LabelPositionControl positions={positions} onChange={changePosition} options={["inside", "insideLeft", "insideRight", "left", "right", "none"]}/></div><ScaledChart style={{ height }} option={{
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (params) => {
        const current = axisRows[params[0]?.dataIndex] || {};
        const details = params.filter((item) => item.value > 0).map((item) => `${item.marker}${item.seriesName}：${current.counts?.[item.seriesName] || 0}（${item.value}%）`).join("<br/>");
        return `${current.entity} · ${current.year}<br/>总数：${current.total || 0}<br/>${details}`;
      },
    },
    legend: isAppleTheme() ? { type: "scroll", top: 0, left: 8, right: 8 } : { type: "scroll", top: 0, left: 8, right: 8 },
    grid: { left: 130, right: 28, top: 48, bottom: 28, containLabel: true },
    xAxis: { type: "value", min: Number(effectiveRateAxis.min) || 0, max: Math.max(Number(effectiveRateAxis.max) || 100, (Number(effectiveRateAxis.min) || 0) + 0.1), axisLabel: { formatter: "{value}%" }, splitLine: { lineStyle: { color: "#eef1f5" } } },
    yAxis: {
      type: "category",
      data: axisRows.map((row) => `${row.entity}  ${row.year}`),
      inverse: topToBottom,
      axisTick: { show: false }, axisLine: { show: false },
    },
    series: values.map((value, index) => ({
      name: value, type: "bar", stack: "total", barMaxWidth: 20,
      data: axisRows.map((row) => {
        const count = row.counts?.[value] || 0;
        const share = Number((count / Math.max(row.total, 1) * 100).toFixed(1));
        return { value: share, count, share, total: row.total || 0 };
      }),
      itemStyle: { color: stackedPalette[index % stackedPalette.length] },
      label: {
        show: labelVisible(positions[value]),
        position: labelPosition(positions[value]),
        formatter: ({ data }) => {
          const share = Number(data?.share || 0);
          const count = Number(data?.count || 0);
          if (!count) return "";
          return `${count.toLocaleString()}/${share}%`;
        },
        fontSize: 9,
        lineHeight: 12,
        color: "#fff",
        textBorderColor: "rgba(0,0,0,.18)",
        textBorderWidth: 2,
      },
      labelLayout: { hideOverlap: false, moveOverlap: "shiftY" },
    })),
  }} /></div>;
}
