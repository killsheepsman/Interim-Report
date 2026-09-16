import { useEffect, useMemo, useRef, useState } from "react";
import { ScaledChart } from "./charts.jsx";
import { ArrowsClockwise, FileCsv, Funnel, UploadSimple, X } from "@phosphor-icons/react";
import { buildDoamDataset, decodeDoamFile, doamCategoryTop, doamCustomerAverages, doamDeviceAverages, doamMonthlyTrend, doamProductAverages, doamTpmAverages, doamKeyWords, hydrateDoamDefault, mergeDoamDatasets } from "./doamEngine.js";

const palettes = {
  classic: { blue: "#2f7ee6", orange: "#f5822a", blueSoft: "#8ec5f3", orangeSoft: "#f8b27e", blueDeep: "#245eae", orangeDeep: "#b85d15", axis: "#d8e2ee", split: "#eef3f9", label: "#526174" },
  apple: { blue: "#0a84ff", orange: "#f5822a", blueSoft: "#9cc9ff", orangeSoft: "#f8b27e", blueDeep: "#0759b8", orangeDeep: "#b85d15", axis: "#e4ebf5", split: "#eef2f7", label: "#667085" },
};
const axisFrom = (c) => ({ axisLine: { lineStyle: { color: c.axis } }, axisTick: { show: false }, axisLabel: { color: c.label, fontSize: 11 }, splitLine: { lineStyle: { color: c.split, type: "dashed" } } });
const axis = axisFrom(palettes.classic);
const fmt = (value) => Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const yoy = (base, next) => (base && next != null ? `${((next - base) / base * 100).toFixed(1)}%` : "—");
const months = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
const emptyFilter = () => ({ tpm: null, device: null, customer: null, product: null, year: null, month: null });
const hasFilter = (filter) => Boolean(filter.tpm || filter.device || filter.customer || filter.product || filter.month);
const num = (row, key) => Number(row?.[key]) || 0;

function DoamChart({ option, height = 320, onEvents }) {
  return <div className={`doam-chart combo-chart-wrap${isDoamApple() ? " apple-combo-chart" : ""}`}><ScaledChart option={option} style={{ height: `${height}px`, width: "100%" }} onEvents={onEvents} /></div>;
}

function SortBar({ value, onChange, items }) {
  return <div className="doam-sort">{items.map((item) => <button key={item.key} type="button" className={value === item.key ? "active" : ""} onClick={() => onChange(item.key)}>{item.label}</button>)}</div>;
}

function DataQuality({ quality }) {
  const checks = [
    ["导入文件数", (quality.files || []).length], ["数据行数", fmt(quality.rowCount)], ["日期范围", quality.dateMin && quality.dateMax ? `${quality.dateMin} 至 ${quality.dateMax}` : "—"],
    ["2025 行数", fmt(quality.yearRows?.[2025] || quality.yearRows?.["2025"] || 0)], ["2026 行数", fmt(quality.yearRows?.[2026] || quality.yearRows?.["2026"] || 0)], ["空日期", quality.blankDate || 0],
    ["空机台编号", quality.blankMachine || 0], ["空班次", quality.blankShift || 0], ["告警次数无法解析", quality.invalidAlarm || 0], ["告警信息为空", quality.blankInfo || 0],
  ];
  return <section className="doam-quality-card"><header><div><strong>数据质量检查</strong><span>先确认分母和字段完整，再解读趋势</span></div></header><div className="doam-quality-grid">{checks.map(([label, value]) => <div key={label}><small>{label}</small><b className={Number(value) > 0 && ["空日期", "空机台编号", "空班次", "告警次数无法解析", "告警信息为空"].includes(label) ? "warn" : ""}>{value}</b></div>)}</div>{quality.blankShift > 0 && <p className="doam-warning">缺失“班次”字段会导致每班次平均报警次数无法可靠计算，请补齐字段后重新导入。</p>}</section>;
}

function FilterPills({ filter, onClear, onClearAll }) {
  const items = [
    filter.tpm && { key: "tpm", label: "TPM", value: filter.tpm },
    filter.device && { key: "device", label: "设备类型", value: filter.device },
    filter.customer && { key: "customer", label: "客户", value: filter.customer },
    filter.product && { key: "product", label: "产品部", value: filter.product },
    filter.month && { key: "month", label: "月份", value: `${filter.year ? `${filter.year}年` : ""}${filter.month}月` },
  ].filter(Boolean);
  if (!items.length) return null;
  return <div className="doam-filter-pills">{items.map((item) => <button key={item.key} className="doam-filter-pill" onClick={() => onClear(item.key)}><Funnel size={13}/>{item.label}：{item.value}<X size={13}/></button>)}<button className="doam-filter-clear" onClick={onClearAll}>清除全部</button></div>;
}

function isDoamApple() {
  return (document.documentElement.dataset.uiTheme || (typeof localStorage !== "undefined" && localStorage.getItem("qms-ui-theme")) || "classic") === "apple";
}
function barStyle(base, faded, selected, name, radius) {
  const active = selected && name === selected;
  const dim = selected && name !== selected;
  return { color: dim ? faded : base, borderRadius: radius, opacity: dim ? 0.28 : 1, borderColor: active ? "#1f3852" : "transparent", borderWidth: active ? 1 : 0 };
}

function sortSplitRows(rows, key) {
  const list = [...(rows || [])];
  if (key === "name") return list.sort((a, b) => String(a.name).localeCompare(String(b.name), "zh"));
  if (key === "y2025") return list.sort((a, b) => num(b, "y2025") - num(a, "y2025") || num(b, "y2026") - num(a, "y2026"));
  if (key === "change") return list.sort((a, b) => (num(b, "y2026") - num(b, "y2025")) - (num(a, "y2026") - num(a, "y2025")));
  return list.sort((a, b) => num(b, "y2026") - num(a, "y2026") || num(b, "y2025") - num(a, "y2025"));
}

function sortValueRows(rows, key, valueKey) {
  const list = [...(rows || [])];
  if (key === "name") return list.sort((a, b) => String(a.name).localeCompare(String(b.name), "zh"));
  if (key === "asc") return list.sort((a, b) => num(a, valueKey) - num(b, valueKey));
  return list.sort((a, b) => num(b, valueKey) - num(a, valueKey));
}

function butterflyOption(rows, selectedName, c = palettes.classic) {
  const names = rows.map((row) => row.name);
  const maxVal = Math.max(1, ...rows.flatMap((row) => [Number(row.y2025) || 0, Number(row.y2026) || 0]));
  const axisValue = { type: "value", min: 0, max: maxVal, axisLabel: { color: c.label, fontSize: 10, formatter: (value) => fmt(value) }, axisLine: { lineStyle: { color: c.axis } }, axisTick: { show: false }, splitLine: { lineStyle: { color: c.split, type: "dashed" } } };
  const hiddenCat = { type: "category", inverse: true, data: names, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { show: false } };
  return {
    color: [c.blue, c.orange],
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (params) => `${params?.[0]?.name || ""}${params.map((item) => `<br/>${item.marker}${item.seriesName}：${item.value == null ? "—" : fmt(item.value)} 次/机台/班`).join("")}` },
    legend: { bottom: 2, data: [{ name: "2025", itemStyle: { color: c.blue } }, { name: "2026", itemStyle: { color: c.orange } }], textStyle: { color: "#526174", fontWeight: 700 } },
    grid: [
      { left: "4%", right: "55%", top: 1, bottom: 50, containLabel: false },
      { left: "50%", right: "42%", top: 1, bottom: 50, containLabel: false },
      { left: "54%", right: "4%", top: 1, bottom: 50, containLabel: false },
    ],
    xAxis: [
      { ...axisValue, inverse: true, gridIndex: 0 },
      { type: "value", min: 0, max: 1, show: false, gridIndex: 1 },
      { ...axisValue, gridIndex: 2 },
    ],
    yAxis: [
      { ...hiddenCat, gridIndex: 0, triggerEvent: true },
      { type: "category", inverse: true, data: names, gridIndex: 1, triggerEvent: true, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: "#314b63", fontSize: 12, interval: 0, align: "center", overflow: "truncate", width: 108 } },
      { ...hiddenCat, gridIndex: 2, triggerEvent: true },
    ],
    series: [
      { name: "2025", type: "bar", xAxisIndex: 0, yAxisIndex: 0, color: c.blue, barMaxWidth: 16, itemStyle: { color: c.blue, borderRadius: [4, 0, 0, 4] }, data: rows.map((row) => ({ name: row.name, value: row.y2025, itemStyle: barStyle(c.blue, c.blueSoft, selectedName, row.name, [4, 0, 0, 4]) })), label: { show: true, position: "left", color: c.blueDeep, fontSize: 10, formatter: ({ value }) => value == null ? "" : fmt(value) } },
      { name: "2026", type: "bar", xAxisIndex: 2, yAxisIndex: 2, color: c.orange, barMaxWidth: 16, itemStyle: { color: c.orange, borderRadius: [0, 4, 4, 0] }, data: rows.map((row) => ({ name: row.name, value: row.y2026, itemStyle: barStyle(c.orange, c.orangeSoft, selectedName, row.name, [0, 4, 4, 0]) })), label: { show: true, position: "right", color: c.orangeDeep, fontSize: 10, formatter: ({ value }) => value == null ? "" : fmt(value) } },
    ],
  };
}

function rankOption(rows, valueKey, color, faded, selectedName, c = palettes.classic) {
  const axis = axisFrom(c);
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (params) => `${params?.[0]?.name || ""}<br/>${params?.[0]?.marker || ""}${params?.[0]?.value == null ? "—" : `${fmt(params[0].value)} 次/机台/班`}` },
    grid: { left: 16, right: 58, top: 12, bottom: 20, containLabel: true },
    xAxis: { type: "value", min: 0, name: "次/机台/班", ...axis },
    yAxis: { type: "category", inverse: true, data: rows.map((row) => row.name), triggerEvent: true, axisLabel: { color: selectedName ? "#1f3852" : "#526174", fontSize: 11, fontWeight: 700, formatter: (value) => selectedName && value === selectedName ? `{hl|${value}}` : value, rich: { hl: { color: "#b42318", fontWeight: 800, fontSize: 11 } } }, axisLine: { lineStyle: { color: "#d8e2ee" } }, axisTick: { show: false } },
    series: [{ name: valueKey === "y2026" ? "2026" : "2025", type: "bar", color, barMaxWidth: 18, itemStyle: { color }, data: rows.map((row) => ({ name: row.name, value: row[valueKey], itemStyle: barStyle(color, faded, selectedName, row.name, [0, 4, 4, 0]) })), label: { show: true, position: "right", color: "#314b63", fontSize: 10, fontWeight: 700, formatter: ({ value }) => value == null ? "" : fmt(value) } }],
  };
}

function clickName(params) {
  if (params?.componentType === "yAxis") return params.value || "";
  if (params?.componentType === "series") return params.name || "";
  return "";
}

const splitSortItems = [
  { key: "y2026", label: "2026高→低" },
  { key: "y2025", label: "2025高→低" },
  { key: "change", label: "变化" },
  { key: "name", label: "名称" },
];
const valueSortItems = [
  { key: "desc", label: "高→低" },
  { key: "asc", label: "低→高" },
  { key: "name", label: "名称" },
];
const trendSortItems = [
  { key: "month", label: "按月份" },
  { key: "y2026", label: "2026平均" },
  { key: "y2025", label: "2025平均" },
  { key: "machines", label: "机台数" },
];

export function DoamPage() {
  const c = palettes.classic;
  const axis = axisFrom(c);
  const [dataset, setDataset] = useState(null);
  const [filter, setFilter] = useState(emptyFilter);
  const [sorts, setSorts] = useState({ trend: "month", tpm: "y2026", device2025: "desc", device2026: "desc", customer: "y2026", product: "y2026", category: "y2026" });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const inputRef = useRef(null);
  const setSort = (key, value) => setSorts((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL || "./"}doam-default.json`, { cache: "no-store" }).then((response) => response.json()).then((payload) => { if (alive) { setDataset(hydrateDoamDefault(payload)); setLoading(false); } }).catch(() => { if (alive) { setDataset({ units: [], categories: [], quality: {}, files: [] }); setLoading(false); setNotice("默认数据加载失败，请导入 CSV 文件"); } });
    return () => { alive = false; };
  }, []);

  const tpmRows = useMemo(() => sortSplitRows(dataset ? doamTpmAverages(dataset.units, filter) : [], sorts.tpm), [dataset, filter, sorts.tpm]);
  const deviceAll = useMemo(() => dataset ? doamDeviceAverages(dataset.units, filter) : [], [dataset, filter]);
  const deviceRows2025 = useMemo(() => sortValueRows(deviceAll.filter((row) => row.y2025 != null), sorts.device2025, "y2025"), [deviceAll, sorts.device2025]);
  const deviceRows2026 = useMemo(() => sortValueRows(deviceAll.filter((row) => row.y2026 != null), sorts.device2026, "y2026"), [deviceAll, sorts.device2026]);
  const customerRows = useMemo(() => sortSplitRows(dataset ? doamCustomerAverages(dataset.units, filter) : [], sorts.customer), [dataset, filter, sorts.customer]);
  const productRows = useMemo(() => sortSplitRows(dataset ? doamProductAverages(dataset.units, filter) : [], sorts.product), [dataset, filter, sorts.product]);
  const trend = useMemo(() => dataset ? doamMonthlyTrend(dataset.units, filter) : [[], []], [dataset, filter]);
  const categoryRows = useMemo(() => sortSplitRows(dataset ? doamCategoryTop(dataset.categories, filter, dataset.units) : [], sorts.category), [dataset, filter, sorts.category]);
  const tpmNames = useMemo(() => tpmRows.map((row) => row.name).filter(Boolean), [tpmRows]);
  const monthOrder = useMemo(() => {
    const order = Array.from({ length: 12 }, (_, index) => index);
    if (sorts.trend === "y2026") order.sort((a, b) => (trend[1]?.[b]?.average || 0) - (trend[1]?.[a]?.average || 0));
    else if (sorts.trend === "y2025") order.sort((a, b) => (trend[0]?.[b]?.average || 0) - (trend[0]?.[a]?.average || 0));
    else if (sorts.trend === "machines") order.sort((a, b) => ((trend[1]?.[b]?.machines || 0) + (trend[0]?.[b]?.machines || 0)) - ((trend[1]?.[a]?.machines || 0) + (trend[0]?.[a]?.machines || 0)));
    return order;
  }, [trend, sorts.trend]);
  const monthLabels = monthOrder.map((index) => months[index]);

  const toggleFilter = (key, value, extra = {}) => {
    if (!value) return;
    setFilter((prev) => {
      if (key === "month") {
        if (prev.month === value && prev.year === extra.year) return { ...prev, month: null, year: null };
        return { ...prev, month: value, year: extra.year || null };
      }
      return { ...prev, [key]: prev[key] === value ? null : value };
    });
  };
  const clearKey = (key) => setFilter((prev) => key === "month" ? { ...prev, month: null, year: null } : { ...prev, [key]: null });
  const clearAll = () => setFilter(emptyFilter());

  const importFiles = async (files) => {
    const selected = [...files];
    if (!selected.length) return;
    const duplicateNames = selected.map((file) => file.name).filter((name, index, all) => all.indexOf(name) !== index);
    setImporting(true); setNotice(duplicateNames.length ? `检测到重复文件名：${[...new Set(duplicateNames)].join("、")}，重复项将合并计算。` : "正在解析 CSV 并按日期、班次、机台聚合…");
    try {
      const parsed = await Promise.all(selected.map((file) => decodeDoamFile(file).then((result) => ({ ...buildDoamDataset(result.rows, [file.name]), files: [file.name], missingShift: result.missingShift }))));
      const merged = mergeDoamDatasets({ units: [], categories: [], quality: {}, files: [] }, parsed);
      setDataset(merged); setFilter(emptyFilter());
      const missingShift = parsed.some((item) => item.missingShift);
      setNotice(`已导入 ${selected.length} 个文件，共 ${fmt(merged.quality.rowCount)} 行${missingShift ? "；存在缺失班次字段" : ""}。`);
    } catch (error) { setNotice(`导入失败：${error?.message || "CSV 格式无法解析"}`); }
    finally { setImporting(false); }
  };

  const monthStyle = (year, month, fill, active) => ({
    ...(isDoamApple() ? {} : { color: filter.month === month ? active : fill }),
    opacity: filter.month && filter.month !== month ? 0.35 : 1,
    borderRadius: [4, 4, 0, 0],
  });
  const trendOption = {
    color: [c.blue, c.orange, "#16a085", "#8e5ad7"],
    tooltip: { trigger: "axis", axisPointer: { type: "cross" }, formatter: (params) => { const lines = [`${params?.[0]?.axisValue || ""}`]; params.forEach((item) => { if (item.value == null || item.value === "") return; lines.push(`${item.marker}${item.seriesName}：${fmt(item.value)}${item.seriesName.includes("平均") ? " 次/机台/班" : " 台"}`); }); return lines.join("<br/>"); } },
    legend: { bottom: 2, data: ["2025 机台数量", "2026 机台数量", "2025 平均报警次数", "2026 平均报警次数"], textStyle: { color: "#526174", fontWeight: 700 } },
    grid: { left: 54, right: 66, top: 30, bottom: 58, containLabel: true },
    xAxis: { type: "category", data: monthLabels, triggerEvent: true, ...axis },
    yAxis: [{ type: "value", name: "机台数量", nameTextStyle: { color: "#7c8a9e", fontWeight: 700 }, ...axis }, { type: "value", name: "平均报警次数", nameTextStyle: { color: "#7c8a9e", fontWeight: 700 }, ...axis }],
    series: [
      { name: "2025 机台数量", type: "bar", yAxisIndex: 0, data: monthOrder.map((index) => { const row = trend[0]?.[index] || {}; return { value: row.machines, itemStyle: monthStyle(2025, index + 1, c.blueSoft, c.blue) }; }), barMaxWidth: 18, label: { show: true, position: "top", color: c.blue, fontSize: 9, formatter: ({ value }) => value ? fmt(value) : "" } },
      { name: "2026 机台数量", type: "bar", yAxisIndex: 0, data: monthOrder.map((index) => { const row = trend[1]?.[index] || {}; return { value: row.machines, itemStyle: monthStyle(2026, index + 1, c.orangeSoft, c.orange) }; }), barMaxWidth: 18, label: { show: true, position: "top", color: c.orangeDeep, fontSize: 9, formatter: ({ value }) => value ? fmt(value) : "" } },
      { name: "2025 平均报警次数", type: "line", yAxisIndex: 1, data: monthOrder.map((index) => trend[0]?.[index]?.average ?? null), connectNulls: true, symbol: "circle", symbolSize: 7, lineStyle: { width: 3, color: c.blue }, itemStyle: { color: c.blue, borderColor: "#fff", borderWidth: 2 }, label: { show: true, position: "top", color: c.blueDeep, fontSize: 10, formatter: ({ value }) => value == null ? "" : fmt(value) } },
      { name: "2026 平均报警次数", type: "line", yAxisIndex: 1, data: monthOrder.map((index) => trend[1]?.[index]?.average ?? null), connectNulls: true, symbol: "circle", symbolSize: 7, lineStyle: { width: 3, color: c.orange }, itemStyle: { color: c.orange, borderColor: "#fff", borderWidth: 2 }, label: { show: true, position: "top", color: c.orangeDeep, fontSize: 10, formatter: ({ value }) => value == null ? "" : fmt(value) } },
    ],
  };
  const tpmOption = butterflyOption(tpmRows, filter.tpm, c);
  const deviceOption2025 = rankOption(deviceRows2025, "y2025", c.blue, c.blueSoft, filter.device, c);
  const deviceOption2026 = rankOption(deviceRows2026, "y2026", c.orange, c.orangeSoft, filter.device, c);
  const customerOption = butterflyOption(customerRows, filter.customer, c);
  const productOption = butterflyOption(productRows, filter.product, c);
  const categoryOption = {
    color: [c.blue, c.orange],
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (value) => value == null ? "—" : `${fmt(value)} 次/机台/班` },
    legend: { bottom: 2, data: ["2025 平均报警", "2026 平均报警"], textStyle: { color: "#526174", fontWeight: 700 } },
    grid: { left: 48, right: 22, top: 22, bottom: 52, containLabel: true },
    xAxis: { type: "category", data: categoryRows.map((row) => row.name), axisLabel: { ...axis.axisLabel, rotate: 25 }, ...axis },
    yAxis: { type: "value", name: "平均报警次数", ...axis },
    series: [
      { name: "2025 平均报警", type: "bar", data: categoryRows.map((row) => row.y2025), barMaxWidth: 22, itemStyle: { color: c.blue, borderRadius: [5, 5, 0, 0] }, label: { show: true, position: "top", color: c.blueDeep, fontSize: 9, formatter: ({ value }) => value == null ? "" : fmt(value) } },
      { name: "2026 平均报警", type: "bar", data: categoryRows.map((row) => row.y2026), barMaxWidth: 22, itemStyle: { color: c.orange, borderRadius: [5, 5, 0, 0] }, label: { show: true, position: "top", color: c.orangeDeep, fontSize: 9, formatter: ({ value }) => value == null ? "" : fmt(value) } },
    ],
  };

  const onTrendClick = (params) => {
    const label = params?.componentType === "xAxis" ? params.value : monthLabels[params?.dataIndex];
    const month = months.indexOf(label) + 1;
    if (month < 1) return;
    const year = String(params?.seriesName || "").includes("2026") ? 2026 : String(params?.seriesName || "").includes("2025") ? 2025 : filter.year;
    toggleFilter("month", month, { year });
  };
  const onCategoryClick = () => setNotice("告警分类不能下钻到其他图。一条机台记录里会混有多种告警，无法按单个分类反查 TPM、设备、客户或产品部。");

  if (loading) return <div className="qmdp-page doam-page"><div className="qmdp-empty">正在加载 DOAM 默认数据…</div></div>;
  return <div className="qmdp-page doam-page">
    <header className="qmdp-page-header doam-page-header"><div className="qmdp-page-title"><small>质量数据 / DOAM</small><h2>DOAM 告警质量分析</h2><p>按各机台真实班次计算平均告警次数，定位 TPM、设备类型和告警机制的真实瓶颈。</p></div><div className="doam-header-actions"><button className="qmdp-secondary-btn" onClick={() => inputRef.current?.click()} disabled={importing}><UploadSimple size={16}/>{importing ? "正在解析" : "导入 CSV"}</button><button className="qmdp-secondary-btn" onClick={() => { setDataset(null); setFilter(emptyFilter()); setLoading(true); fetch(`${import.meta.env.BASE_URL || "./"}doam-default.json`, { cache: "no-store" }).then((response) => response.json()).then((payload) => { setDataset(hydrateDoamDefault(payload)); setLoading(false); setNotice("已恢复默认数据"); }); }} disabled={loading}><ArrowsClockwise size={16}/>恢复默认</button><input ref={inputRef} type="file" accept=".csv,text/csv" multiple hidden onChange={(event) => { importFiles(event.target.files); event.target.value = ""; }}/></div></header>
    <DataQuality quality={dataset?.quality || {}}/>
    <section className="doam-filter-bar">
      <div><Funnel size={16}/><strong>{hasFilter(filter) ? "当前已下钻筛选" : "当前筛选：全部"}</strong><span>点击图表下钻，再点一次取消该项。本图自己不筛自己，方便换选项。</span></div>
      <FilterPills filter={filter} onClear={clearKey} onClearAll={clearAll}/>
      <div className="doam-tpm-chips"><button className={!filter.tpm ? "active" : ""} onClick={() => clearKey("tpm")}>全部 TPM</button>{tpmNames.map((name) => <button key={name} className={filter.tpm === name ? "active" : ""} onClick={() => toggleFilter("tpm", name)}>{name}</button>)}</div>
    </section>
    <div className="doam-chart-grid">
      <section className="doam-panel panel wide"><header><div className="doam-heading"><span className="section-number">1</span><div><strong>平均报警数量月度趋势</strong><span>柱形为当月去重机台数量；折线为各类型平均报警再平均。点击月份后，其他图只看该月，本图保持全年并高亮选中月。</span></div></div><div className="doam-panel-tools"><em>点击月份下钻</em><SortBar value={sorts.trend} onChange={(value) => setSort("trend", value)} items={trendSortItems}/></div></header><DoamChart option={trendOption} height={380} onEvents={{ click: onTrendClick }}/></section>
      <section className="doam-panel panel wide"><header><div className="doam-heading"><span className="section-number">2</span><div><strong>TPM 负责项目</strong><span>左 2025、右 2026，同一 TPM 对齐在同一行。该 TPM 下先算各类型平均，再对类型取平均</span></div></div><div className="doam-panel-tools"><em>点击名称下钻</em><SortBar value={sorts.tpm} onChange={(value) => setSort("tpm", value)} items={splitSortItems}/></div></header>{tpmRows.length ? <DoamChart option={tpmOption} height={Math.max(360, tpmRows.length * 38)} onEvents={{ click: (params) => toggleFilter("tpm", clickName(params)) }}/> : <div className="doam-empty">暂无 TPM 数据</div>}</section>
      <section className="doam-panel panel"><header><div className="doam-heading"><span className="section-number">3.1</span><div><strong>设备类型问题 · 2025</strong><span>{filter.tpm ? `${filter.tpm} 负责范围` : "全部 TPM"} · 隐藏当年无数据的类型。点名称后两张图同时高亮</span></div></div><div className="doam-panel-tools"><em>点击名称下钻</em><SortBar value={sorts.device2025} onChange={(value) => setSort("device2025", value)} items={valueSortItems}/></div></header>{deviceRows2025.length ? <DoamChart option={deviceOption2025} height={Math.max(320, Math.min(720, deviceRows2025.length * 34))} onEvents={{ click: (params) => toggleFilter("device", clickName(params)) }}/> : <div className="doam-empty">2025 无设备类型数据</div>}</section>
      <section className="doam-panel panel"><header><div className="doam-heading"><span className="section-number">3.2</span><div><strong>设备类型问题 · 2026</strong><span>{filter.tpm ? `${filter.tpm} 负责范围` : "全部 TPM"} · 隐藏当年无数据的类型。点名称后两张图同时高亮</span></div></div><div className="doam-panel-tools"><em>点击名称下钻</em><SortBar value={sorts.device2026} onChange={(value) => setSort("device2026", value)} items={valueSortItems}/></div></header>{deviceRows2026.length ? <DoamChart option={deviceOption2026} height={Math.max(320, Math.min(720, deviceRows2026.length * 34))} onEvents={{ click: (params) => toggleFilter("device", clickName(params)) }}/> : <div className="doam-empty">2026 无设备类型数据</div>}</section>
      <section className="doam-panel panel wide"><header><div className="doam-heading"><span className="section-number">4</span><div><strong>客户维度平均报警</strong><span>左 2025、右 2026，同一客户对齐在同一行。该客户下先算各类型平均，再对类型取平均</span></div></div><div className="doam-panel-tools"><em>点击名称下钻</em><SortBar value={sorts.customer} onChange={(value) => setSort("customer", value)} items={splitSortItems}/></div></header>{customerRows.length ? <DoamChart option={customerOption} height={Math.max(320, customerRows.length * 38)} onEvents={{ click: (params) => toggleFilter("customer", clickName(params)) }}/> : <div className="doam-empty">当前筛选无客户数据</div>}</section>
      <section className="doam-panel panel wide"><header><div className="doam-heading"><span className="section-number">5</span><div><strong>产品部维度平均报警</strong><span>左 2025、右 2026，同一产品部对齐在同一行。该产品部下先算各类型平均，再对类型取平均</span></div></div><div className="doam-panel-tools"><em>点击名称下钻</em><SortBar value={sorts.product} onChange={(value) => setSort("product", value)} items={splitSortItems}/></div></header>{productRows.length ? <DoamChart option={productOption} height={Math.max(300, productRows.length * 42)} onEvents={{ click: (params) => toggleFilter("product", clickName(params)) }}/> : <div className="doam-empty">当前筛选无产品部数据</div>}</section>
      <section className="doam-panel panel wide"><header><div className="doam-heading"><span className="section-number">6</span><div><strong>告警分类 Top</strong><span>先按类型用全部班次做分母，再对出现过该分类的类型取平均。可随 TPM、设备类型筛选；不能随月份、客户、产品部下钻，点击分类也不能反查其他图。</span></div></div><div className="doam-panel-tools"><em>仅被 TPM / 设备类型筛选</em><SortBar value={sorts.category} onChange={(value) => setSort("category", value)} items={splitSortItems}/></div></header>{categoryRows.length ? <DoamChart option={categoryOption} height={360} onEvents={{ click: onCategoryClick }}/> : <div className="doam-empty">当前筛选无告警分类数据</div>}<div className="doam-category-table"><div className="head"><span>分类</span><span>2025 平均报警</span><span>2026 平均报警</span><span>同比</span></div>{categoryRows.map((row) => <div key={row.name}><strong>{row.name}</strong><span>{row.y2025 == null ? "—" : fmt(row.y2025)}</span><span>{row.y2026 == null ? "—" : fmt(row.y2026)}</span><span>{yoy(row.y2025, row.y2026)}</span></div>)}</div></section>
    </div>
    <section className="doam-rules"><header><div><strong>告警分类关键词规则</strong><span>规则按从上到下匹配，后续可直接调整关键词和优先级</span></div><FileCsv size={22}/></header><div className="doam-rule-grid">{doamKeyWords.map((rule) => <div key={rule.name}><b>{rule.name}</b><span>{rule.words}</span></div>)}<div><b>其他</b><span>未命中以上关键词的告警信息</span></div></div><p>统计原则：告警总次数为「告警次数」列求和，不是一行算一次。同一机台、同一日期、同一班次的多行明细先合并，算 1 个班次。单类型平均报警 = 该类型告警总次数 ÷ 该类型机台班次之和。月度趋势、TPM、客户、产品部、告警分类再把各类型平均相加后，除以实际出现过的设备类型数。设备类型图只展示当年有数据的类型。蝴蝶图同一名称左右对齐并靠拢；某年没有该名称时该侧留空。</p></section>
    {notice && <div className="doam-notice" role="status">{notice}</div>}
  </div>;
}
