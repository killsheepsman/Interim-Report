const PALM = {
  BG: "#F0EFEB",
  TXT: "#58402E",
  MUT: "rgba(88,64,46,.60)",
  FAINT: "rgba(88,64,46,.32)",
  FLOOR: "rgba(88,64,46,.24)",
  GRID: "rgba(88,64,46,.16)",
  DATA: "#43593B",
  HERO: "#D4A017",
  FAINTDATA: "#ACAD79",
  RAMP6: ["#43593B", "#5A7049", "#77835A", "#929960", "#ACAD79", "#F2D17E"],
};

const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
const rnd = (i, k) => Math.abs(((i * 73856093) ^ (k * 19349663)) % 1000) / 1000;
const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const rungUnit = (max) => {
  if (max <= 40) return 1;
  if (max <= 80) return 2;
  if (max <= 160) return 5;
  if (max <= 400) return 10;
  return 20;
};
const READABLE_RUNG_CAP = 22;
const compressedRungs = (values = [], { cap = 16, spanAt = 4 } = {}) => {
  const nums = (Array.isArray(values) ? values : []).map((value) => Math.max(0, Number(value) || 0));
  const max = Math.max(...nums, 1);
  const minPos = Math.min(...nums.filter((value) => value > 0), max);
  const span = max / Math.max(minPos, 1);
  const useCompress = span >= spanAt;
  const linearUnit = rungUnit(max);
  const linearRungs = Math.max(1, Math.round(max / linearUnit));
  const heightCapped = !useCompress && linearRungs > READABLE_RUNG_CAP;
  const visual = (value) => {
    if (value <= 0) return 0;
    return useCompress ? Math.sqrt(value) : value;
  };
  const visualMax = visual(max) || 1;
  const unit = useCompress ? visualMax / cap : (heightCapped ? max / READABLE_RUNG_CAP : linearUnit);
  const rungsFor = (value) => {
    if (value <= 0) return 0;
    if (useCompress) return Math.max(1, Math.round((visual(value) / visualMax) * cap));
    if (heightCapped) return Math.max(1, Math.round((value / max) * READABLE_RUNG_CAP));
    return Math.max(1, Math.round(value / linearUnit));
  };
  return { useCompress, heightCapped, max, unit: heightCapped ? Math.max(1, Math.round(unit)) : unit, maxRungs: Math.max(...nums.map(rungsFor), 1), rungsFor, mode: heightCapped ? "capped" : (useCompress ? "sqrt" : "linear") };
};
const attr = (attrs) => Object.entries(attrs)
  .filter(([, value]) => value !== undefined && value !== null && value !== false)
  .map(([key, value]) => `${key}="${String(value).replace(/"/g, "&quot;")}"`)
  .join(" ");
const node = (tag, attrs, inner) => inner == null || inner === ""
  ? `<${tag} ${attr(attrs)}/>`
  : `<${tag} ${attr(attrs)}>${inner}</${tag}>`;
const titleNode = (text) => `<title>${escapeHtml(text)}</title>`;
const CHART_RULES = {
  padTop: 20,
  padBottom: 22,
  padBottomRank: 34,
  padX: 28,
  valueLabelGap: 10,
  axisLabelOffset: 20,
  axisClearance: 12,
  legendGap: 16,
  legendSize: 12,
  compact: { rungStep: 3.2, rungHalfWidth: 8, columnGap: 48, pairedGap: 40, minWidth: 640, linePlot: 48, axisLabelOffset: 18, axisClearance: 10 },
  screen: { padTop: 36, padBottom: 86, rungStep: 5.6, rungHalfWidth: 14, columnGap: 72, pairedGap: 78, minWidth: 640, linePlot: 180, axisLabelOffset: 20, axisClearance: 12, valueFont: 14, axisFont: 12 },
};
export const chartLayoutRules = CHART_RULES;
const yearFromLabel = (label) => {
  const match = String(label || "").match(/(?:19|20)\d{2}/);
  return match ? match[0] : "";
};
const yearsFromLabels = (labels = []) => [...new Set(labels.map((item) => yearFromLabel(item)).filter(Boolean))];
export const periodChartTitle = (title, labels = []) => {
  const years = yearsFromLabels(labels);
  const text = String(title || "").trim();
  if (!text || !years.length) return text;
  const stamp = years.length === 1 ? `${years[0]}年` : `${years[0]}-${years.at(-1)}年`;
  if (text.includes(stamp) || years.every((year) => text.includes(`${year}年`) || text.includes(year))) return text;
  return `${text}（${stamp}）`;
};
const shortPeriodLabel = (label, grain = "") => {
  const text = String(label || "");
  const week = text.match(/W(\d{1,2})$/i);
  if (week) return `W${String(week[1]).padStart(2, "0")}`;
  const month = text.match(/(?:19|20)\d{2}[-/.年]?(0?[1-9]|1[0-2])$/);
  if (month || grain === "month") {
    const value = month ? month[1] : text.match(/(0?[1-9]|1[0-2])$/)?.[1];
    if (value) return `${Number(value)}月`;
  }
  return text.replace(/^(?:19|20)\d{2}-/, "");
};
const chartBox = (compact, { maxRungs = 1, hasRankLabel = false, kind = "bar", count = 2, minSlot = 0 } = {}) => {
  const skin = compact ? CHART_RULES.compact : CHART_RULES.screen;
  const padTop = compact ? CHART_RULES.padTop : skin.padTop;
  const axisLabelOffset = skin.axisLabelOffset || CHART_RULES.axisLabelOffset;
  const axisClearance = skin.axisClearance || CHART_RULES.axisClearance;
  const padBottom = compact
    ? (kind === "paired" ? axisLabelOffset + axisClearance + 6 : kind === "line" ? axisLabelOffset + axisClearance : (hasRankLabel ? CHART_RULES.padBottomRank : CHART_RULES.padBottom))
    : (kind === "paired" ? axisLabelOffset + axisClearance + 8 : kind === "line" ? axisLabelOffset + axisClearance : skin.padBottom);
  const step = skin.rungStep;
  const plot = kind === "line" ? skin.linePlot : Math.max(0, (maxRungs - 1) * step);
  const base = padTop + plot;
  const gap = Math.max(minSlot || 0, kind === "paired" ? skin.pairedGap : skin.columnGap);
  const width = Math.max(skin.minWidth, CHART_RULES.padX * 2 + Math.max(count, 1) * gap);
  return { padTop, padBottom, step, hw: skin.rungHalfWidth, gap, width, base, height: base + padBottom, plot, padX: CHART_RULES.padX, valueLabelGap: CHART_RULES.valueLabelGap, axisLabelOffset, axisClearance };
};

const wrapCard = ({ badge, title, sub, src, svg, wide = false, compact = false, scroll = false }) => {
  const extra = `${wide ? " lieflat-wide" : ""}${scroll ? " lieflat-scroll" : ""}`;
  return compact
    ? `<figure class="agent-report-auto-chart lieflat-card lieflat-compact${extra}"><div class="lieflat-svg-wrap">${svg}</div></figure>`
    : `<figure class="agent-report-auto-chart lieflat-card${extra}">
  <span class="lieflat-badge">${escapeHtml(badge)}</span>
  <h2>${escapeHtml(title)}</h2>
  <div class="lieflat-sub">${escapeHtml(sub)}</div>
  <div class="lieflat-svg-wrap">${svg}</div>
  <div class="lieflat-src">${escapeHtml(src)}</div>
</figure>`;
};
const svgRoot = (width, height, inner) => node("svg", {
  viewBox: `0 0 ${width} ${height}`,
  width,
  height,
  preserveAspectRatio: "xMidYMid meet",
  "aria-hidden": "true",
  style: "width:100%;height:auto;display:block;",
}, inner);


const drawRungs = ({ x, count, color, hw, base, step, seed }) => {
  const lines = [];
  for (let k = 0; k < count; k += 1) {
    const y = base - k * step;
    const w = hw - 1.2 + rnd(k + 1, seed + 2) * 2.4;
    lines.push(node("line", {
      x1: (x - w).toFixed(1), y1: y.toFixed(1), x2: (x + w).toFixed(1), y2: y.toFixed(1),
      stroke: color, "stroke-width": 1.8, opacity: (0.85 + rnd(k + 2, seed + 4) * 0.15).toFixed(3),
    }));
    if (k % 5 === 4) lines.push(node("circle", { cx: (x + hw + 4).toFixed(1), cy: y.toFixed(1), r: 0.8, fill: PALM.FAINT }));
  }
  return { lines: lines.join(""), topY: count ? base - (count - 1) * step : base };
};

export const pinFocusChartRows = (rows = [], limit = 12) => {
  const source = (Array.isArray(rows) ? rows : []).filter(Boolean);
  if (source.length <= limit) return source;
  const focusIndex = source.findIndex((row) => row.focus);
  if (focusIndex < 0) return source.slice(0, limit);
  if (focusIndex < limit) return source.slice(0, limit);
  const focus = source[focusIndex];
  const name = String(focus.name || focus.label || "本人").replace(/\s*·\s*第\d+\/\d+名?$/, "");
  const rankTotal = focus.rankTotal || focus.total;
  const label = focus.rank && rankTotal ? `${name} · 第${focus.rank}/${rankTotal}名` : name;
  return [...source.slice(0, limit - 1), { ...focus, label, focus: true }];
};

const wrapAxisLines = (text, maxChars, maxLines = 4) => {
  const raw = String(text || "").trim();
  const limit = Math.max(2, Number(maxChars) || 2);
  const parts = raw.split(/[/／，,、]+/).map((item) => item.trim()).filter(Boolean);
  const lines = [];
  for (const part of (parts.length ? parts : [raw])) {
    const chars = Array.from(part);
    if (chars.length <= limit) lines.push(part);
    else {
      for (let i = 0; i < chars.length; i += limit) lines.push(chars.slice(i, i + limit).join(""));
    }
  }
  return (lines.length ? lines : [raw]).slice(0, Math.max(2, Number(maxLines) || 4));
};
const measureAxisLine = (line, fontSize) => Array.from(String(line || "")).reduce((width, char) => width + (/[\u4e00-\u9fff]/.test(char) ? fontSize : fontSize * 0.58), 0);
const axisLinesOverlap = (wrapped, fontSize, slot) => wrapped.some((lines) => Math.max(...lines.map((line) => measureAxisLine(line, fontSize)), 0) > slot - 6);
export const fitParetoAxisLabels = (labels = [], slot = 72) => {
  const names = (Array.isArray(labels) ? labels : []).map((item) => String(item || "").trim() || "未命名");
  let fontSize = 8;
  let wrapped = names.map((name) => [name]);
  for (const size of [8, 7, 6, 5]) {
    const maxChars = Math.max(2, Math.floor((slot - 6) / Math.max(size * 0.92, 4)));
    wrapped = names.map((name) => wrapAxisLines(name, maxChars, 4));
    fontSize = size;
    if (!axisLinesOverlap(wrapped, size, slot)) break;
  }
  return { wrapped, fontSize, wrapLines: Math.max(...wrapped.map((lines) => lines.length), 1) };
};

export const renderLieflatRungBars = ({ title, rows = [], valueLabel = "数量", compact = false } = {}) => {
  const source = pinFocusChartRows((rows || [])
    .map((row) => ({
      label: String(row.label || row.name || "未命名"),
      name: row.name || row.label,
      value: Math.max(0, finite(row.value)),
      rate: row.rate == null || row.rate === "" ? null : finite(row.rate),
      detail: row.detail || "",
      focus: Boolean(row.focus),
      selected: Boolean(row.selected),
      rank: row.rank,
      rankTotal: row.rankTotal || row.total,
    }))
    .filter((row) => row.label), 12);
  if (source.length < 2) return "";
  const scale = compressedRungs(source.map((row) => row.value));
  const { unit, maxRungs, rungsFor, useCompress } = scale;
  const hasRankLabel = source.some((row) => row.focus && /第\d+\/\d+名/.test(String(row.label)));
  const box = chartBox(compact, { maxRungs, hasRankLabel, kind: "bar", count: source.length });
  const { width, step, hw, base, padX, valueLabelGap, padBottom } = box;
  const slot = (width - padX * 2) / source.length;
  const x0 = (index) => padX + slot * (index + 0.5);
  const isRanking = /排名/.test(title) || source.some((row) => row.rank || /第\d+\/\d+名/.test(String(row.label)));
  const isPareto = /Pareto|变更原因/.test(title);
  const periodish = !isRanking && !isPareto && source.every((row) => /(?:19|20)\d{2}-W\d+|(?:19|20)\d{2}-(0[1-9]|1[0-2])/.test(row.label));
  const chartTitle = periodish ? periodChartTitle(title, source.map((row) => row.label)) : title;
  const axisNames = source.map((row) => periodish ? shortPeriodLabel(row.label) : row.label);
  const fitted = isRanking ? null : fitParetoAxisLabels(axisNames, slot);
  const wrapped = source.map((row, index) => (fitted ? fitted.wrapped[index] : [axisNames[index]]));
  const wrapLines = fitted ? fitted.wrapLines : 1;
  const axisFont = fitted ? fitted.fontSize : 8;
  const labelPad = Math.max(padBottom, 16 + wrapLines * (axisFont + 4));
  const height = base + labelPad;
  const rungs = source.map((row, index) => {
    const x = x0(index);
    const count = rungsFor(row.value);
    const color = row.focus ? PALM.HERO : PALM.RAMP6[Math.min(index, PALM.RAMP6.length - 1)];
    const drawn = drawRungs({ x, count, color, hw, base, step, seed: index });
    const tip = `${row.label}：${valueLabel} ${row.value}${row.rate != null ? `；比例 ${row.rate}%` : ""}${row.detail ? `；${row.detail}` : ""}`;
    const rankMatch = String(row.label).match(/^(.*?)(?:\s*·\s*)?(第\d+\/\d+名)$/);
    const axisY = base + (compact ? 16 : 22);
    const fill = row.focus ? PALM.TXT : PALM.MUT;
    const selectedClass = undefined;
    let axis = "";
    if (isRanking && row.focus && rankMatch) {
      axis = `${node("text", { x: x.toFixed(1), y: base + 18, "font-size": 8, "font-weight": 800, fill: PALM.TXT, "text-anchor": "middle" }, escapeHtml(rankMatch[1].trim() || row.name || "本人"))}${node("text", { x: x.toFixed(1), y: base + 32, "font-size": 8, "font-weight": 700, fill: PALM.HERO, "text-anchor": "middle" }, escapeHtml(rankMatch[2]))}`;
    } else {
      const lines = wrapped[index];
      axis = node("text", { class: "lieflat-axis", x: x.toFixed(1), y: axisY, "font-size": axisFont, "font-weight": 700, fill, style: undefined, "text-anchor": "middle" },
        lines.map((line, lineIndex) => `<tspan x="${x.toFixed(1)}" dy="${lineIndex === 0 ? 0 : axisFont + 3}">${escapeHtml(line)}</tspan>`).join(""));
    }
    return `<g>${titleNode(tip)}${drawn.lines}${node("text", { class: selectedClass, x: x.toFixed(1), y: (drawn.topY - valueLabelGap).toFixed(1), "font-size": 14, "font-weight": 800, fill: PALM.TXT, style: undefined, "text-anchor": "middle" }, row.value)}${axis}</g>`;
  }).join("");
  const hasRate = source.some((row) => row.rate != null);
  const plot = Math.max(1, (maxRungs - 1) * step);
  const rateY = (rate) => base - (Math.max(0, Math.min(100, Number(rate) || 0)) / 100) * plot;
  const ratePath = hasRate ? `M${source.map((row, index) => `${x0(index).toFixed(1)} ${rateY(row.rate || 0).toFixed(1)}`).join(" L ")}` : "";
  const rateDots = hasRate ? source.map((row, index) => `<g>${node("circle", {
    cx: x0(index).toFixed(1), cy: rateY(row.rate || 0).toFixed(1), r: 3.2,
    fill: PALM.HERO, stroke: PALM.BG, "stroke-width": 1.2,
  })}${node("text", {
    x: x0(index).toFixed(1), y: (rateY(row.rate || 0) - 10).toFixed(1),
    "font-size": 8, "font-weight": 800, fill: PALM.TXT, "text-anchor": "middle",
    style: `fill:${PALM.TXT};paint-order:stroke;stroke:${PALM.BG};stroke-width:3px`,
  }, row.rate == null ? "" : `${Number(Number(row.rate).toFixed(Number(row.rate) >= 10 ? 0 : 1))}%`)}</g>`).join("") : "";
  const svg = svgRoot(width, height,
    `${rungs}${node("line", { x1: padX, y1: base + 4, x2: width - padX, y2: base + 4, stroke: PALM.GRID, "stroke-width": 0.8 })}${hasRate ? node("path", { d: ratePath, fill: "none", stroke: PALM.HERO, "stroke-width": 2 }) + rateDots : ""}`);
  return wrapCard({
    badge: hasRate ? "LUPI 基础型 · 柱 + 折线" : "LUPI 基础型 · 柱状",
    title: chartTitle,
    sub: hasRate
      ? `柱=${valueLabel}，折线=比例 · 柱顶为真实数量${useCompress ? " · 柱高已开方压缩" : ""}`
      : `柱顶为真实数量${scale.heightCapped ? ` · 柱高已限在${READABLE_RUNG_CAP}档内，字号不缩小` : (useCompress ? " · 柱高已开方压缩，避免大数把小数压没" : ` · 一档 = ${unit}条${valueLabel}`)}`,
    src: "RUNG BARS · PALM · 质量",
    svg,
    wide: source.length > 6,
    compact,
  });
};

export const renderLieflatHairline = ({ title, rows = [], valueLabel = "数量", grain = "week", compact = false } = {}) => {
  const source = (rows || [])
    .map((row) => ({
      label: String(row.label || ""),
      value: Math.max(0, finite(row.value)),
      total: row.total == null ? null : finite(row.total),
      rate: row.rate == null ? null : finite(row.rate),
      hollow: Boolean(row.hollow),
      selected: Boolean(row.selected),
    }))
    .filter((row) => row.label);
  if (source.length < 2) return "";
  const box = chartBox(compact, { kind: "line", count: source.length });
  const { width, height, base, plot, padX, valueLabelGap } = box;
  const left = padX;
  const right = width - padX;
  const max = Math.max(...source.map((row) => row.value), 1);
  const x = (index) => left + (source.length === 1 ? 0 : index * ((right - left) / (source.length - 1)));
  const y = (value) => base - (value / max) * plot;
  const ticks = source.map((row, index) => node("line", {
    x1: x(index).toFixed(1), y1: base, x2: x(index).toFixed(1), y2: base - 7,
    stroke: PALM.FLOOR, "stroke-width": 0.6,
  })).join("");
  const path = `M${source.map((row, index) => `${x(index).toFixed(1)} ${y(row.value).toFixed(1)}`).join(" L ")}`;
  const dots = source.map((row, index) => {
    const tip = row.total == null
      ? `${row.label}：${valueLabel} ${row.value}`
      : `${row.label}：${valueLabel} ${row.value}；总数 ${row.total}；不良率 ${row.rate ?? 0}%`;
    return `<g>${titleNode(tip)}${node("circle", {
      cx: x(index).toFixed(1), cy: y(row.value).toFixed(1), r: 3.4,
      fill: row.hollow ? PALM.BG : PALM.DATA,
      stroke: PALM.DATA,
      "stroke-width": row.hollow ? 1.4 : 0,
    })}${node("text", {
      x: x(index).toFixed(1), y: (y(row.value) - valueLabelGap).toFixed(1),
      "font-size": 8.5, "font-weight": 800, fill: PALM.TXT, "text-anchor": "middle",
      style: `paint-order:stroke;stroke:${PALM.BG};stroke-width:3px`,
    }, String(row.value))}</g>`;
  }).join("");
  const chartTitle = periodChartTitle(title, source.map((row) => row.label));
  const anchors = source.map((row, index) => node("text", {
    x: x(index).toFixed(1), y: base + box.axisLabelOffset, "font-size": compact ? 10 : 9, "font-weight": 600,
    fill: PALM.MUT, "text-anchor": "middle",
  }, escapeHtml(shortPeriodLabel(row.label, grain)))).join("");
  const svg = svgRoot(width, height,
    `${ticks}${node("line", { x1: 24, y1: base, x2: width - 24, y2: base, stroke: PALM.GRID, "stroke-width": 0.8 })}${node("path", { d: path, fill: "none", stroke: PALM.DATA, "stroke-width": 2.2 })}${dots}${anchors}`);
  return wrapCard({
    badge: "LUPI 基础型 · 折线",
    title: chartTitle,
    sub: grain === "month" ? "一点一月 · 实心为有不良 · 空心为送检无不良 · 每月数值已标出" : "一点一周 · 实心为有不良 · 空心为送检无不良 · 每周数值已标出",
    src: "HAIRLINE LINE · PALM · 质量",
    svg,
    wide: true,
    compact,
  });
};

const niceRateMax = (maxRate) => {
  const n = Math.max(0, Number(maxRate) || 0);
  if (n <= 0) return 10;
  if (n <= 10) return Math.max(2, Math.ceil(n / 2) * 2);
  if (n <= 20) return Math.ceil(n / 5) * 5;
  if (n <= 50) return Math.ceil(n / 10) * 10;
  return 100;
};
const formatRateLabel = (rate) => {
  const n = Number(rate) || 0;
  const text = n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
  return `${text}%`;
};

export const renderLieflatPairedTrend = ({ title, rows = [], barLabels = ["不良数量", "总数量"], lineLabel = "不良率", grain = "week", compact = false } = {}) => {
  const source = (rows || [])
    .map((row) => ({
      label: String(row.label || ""),
      bad: Math.max(0, finite(row.bad ?? row.value)),
      total: Math.max(0, finite(row.total)),
      rate: Math.max(0, finite(row.rate)),
      selected: Boolean(row.selected),
    }))
    .filter((row) => row.label);
  if (grain === "category" ? !source.length : source.length < 2) return "";
  const scale = compressedRungs(source.flatMap((row) => [row.bad, row.total]));
  const { maxRungs, rungsFor, useCompress } = scale;
  const rateMax = niceRateMax(Math.max(...source.map((row) => row.rate), 0));
  const bandSize = grain === "week" && source.length > 12 ? 12 : source.length;
  const bands = [];
  for (let index = 0; index < source.length; index += bandSize) bands.push(source.slice(index, index + bandSize));
  const firstSelected = source.findIndex((item) => item.selected);
  const chartTitle = periodChartTitle(title, source.map((row) => row.label));
  const renderBand = (band, bandIndex) => {
    const box = chartBox(compact, { maxRungs, kind: "paired", count: band.length, minSlot: grain === "week" ? 72 : grain === "category" ? 104 : 64 });
    const { gap, step, hw, padX, plot } = box;
    const linePadTop = compact ? 16 : 20;
    const linePlot = compact ? 48 : 70;
    const splitGap = compact ? 14 : 22;
    const lineBase = linePadTop + linePlot;
    const base = lineBase + splitGap + plot;
    const rateAxisPad = 36;
    const width = box.width + rateAxisPad;
    const axisNames = band.map((row) => grain === "category" ? row.label : shortPeriodLabel(row.label, grain));
    const fittedAxis = fitParetoAxisLabels(axisNames, gap);
    const height = base + box.padBottom + Math.max(0, (fittedAxis.wrapLines - 1) * (fittedAxis.fontSize + 4));
    const x0 = (index) => padX + 8 + gap * 0.5 + index * gap;
    const pairOffset = grain === "category" ? 20 : 14;
    const rateY = (rate) => lineBase - (Math.max(0, Math.min(rateMax, Number(rate) || 0)) / Math.max(rateMax, 1)) * linePlot;
    const groups = band.map((row, index) => {
      const absolute = bandIndex * bandSize + index;
      const center = x0(index);
      const xa = center - pairOffset;
      const xb = center + pairOffset;
      const faint = drawRungs({ x: xa, count: rungsFor(row.total), color: PALM.FAINTDATA, hw, base, step, seed: absolute + 11 });
      const solid = drawRungs({ x: xb, count: rungsFor(row.bad), color: PALM.DATA, hw, base, step, seed: absolute + 31 });
      const tip = `${row.label}：${barLabels[0]} ${row.bad}；${barLabels[1]} ${row.total}；${lineLabel} ${row.rate}%`;
      const selectedClass = undefined;
      const groupClass = row.selected ? "lieflat-selected-group" : "";
      const groupId = absolute === firstSelected ? "lieflat-selected-start" : undefined;
      const axisLines = fittedAxis.wrapped[index] || [shortPeriodLabel(row.label, grain)];
      const axisY = base + box.axisLabelOffset;
      const axisText = node("text", { class: "lieflat-axis", x: center.toFixed(1), y: axisY, "font-size": fittedAxis.fontSize, "font-weight": 700, fill: PALM.MUT, style: undefined, "text-anchor": "middle" }, axisLines.map((line, lineIndex) => `<tspan x="${center.toFixed(1)}" dy="${lineIndex === 0 ? 0 : fittedAxis.fontSize + 3}">${escapeHtml(line)}</tspan>`).join(""));
      return `<g${groupClass ? ` class="${groupClass}"` : ""}${groupId ? ` id="${groupId}"` : ""}>${titleNode(tip)}${faint.lines}${solid.lines}${node("text", { class: selectedClass, x: xa.toFixed(1), y: (faint.topY - 8).toFixed(1), "font-size": compact ? 10 : 8, "font-weight": 700, fill: PALM.FAINTDATA, style: undefined, "text-anchor": "middle" }, row.total)}${node("text", { class: selectedClass, x: xb.toFixed(1), y: (solid.topY - 8).toFixed(1), "font-size": compact ? 11 : 9, "font-weight": 800, fill: PALM.TXT, style: undefined, "text-anchor": "middle" }, row.bad)}${axisText}</g>`;
    }).join("");
    const ratePath = `M${band.map((row, index) => `${x0(index).toFixed(1)} ${rateY(row.rate).toFixed(1)}`).join(" L ")}`;
    const rateDots = band.map((row, index) => `<g>${node("circle", {
      cx: x0(index).toFixed(1), cy: rateY(row.rate).toFixed(1), r: 3.2,
      fill: PALM.HERO, stroke: PALM.BG, "stroke-width": 1.2,
    })}${node("text", {
      x: x0(index).toFixed(1), y: (rateY(row.rate) - 10).toFixed(1),
      "font-size": compact ? 9 : 8, "font-weight": 800, fill: PALM.HERO, "text-anchor": "middle",
      style: `fill:${PALM.HERO};paint-order:stroke;stroke:${PALM.BG};stroke-width:3px`,
    }, formatRateLabel(row.rate))}</g>`).join("");
    const rateTicks = [0, rateMax / 2, rateMax];
    const rateAxis = rateTicks.map((tick) => {
      const y = rateY(tick);
      return `${node("line", { x1: padX, y1: y.toFixed(1), x2: (width - rateAxisPad + 8).toFixed(1), y2: y.toFixed(1), stroke: PALM.GRID, "stroke-width": 0.6 })}${node("text", { x: (width - 4).toFixed(1), y: (y + 3).toFixed(1), "font-size": 8, "font-weight": 700, fill: PALM.MUT, "text-anchor": "end" }, formatRateLabel(tick))}`;
    }).join("");
    const splitLine = node("line", { x1: padX, y1: (lineBase + splitGap / 2).toFixed(1), x2: (width - rateAxisPad + 8).toFixed(1), y2: (lineBase + splitGap / 2).toFixed(1), stroke: PALM.FLOOR, "stroke-width": 0.8, "stroke-dasharray": "3 4" });
    return svgRoot(width, height,
      `${rateAxis}${splitLine}${groups}${node("line", { x1: 28, y1: base + 4, x2: width - rateAxisPad, y2: base + 4, stroke: PALM.GRID, "stroke-width": 0.8 })}${node("path", { d: ratePath, fill: "none", stroke: PALM.HERO, "stroke-width": 2 })}${rateDots}`);
  };
  const paged = bands.length > 1;
  const svg = paged
    ? `<div class="lieflat-week-bands">${bands.map((band, index) => `<div class="lieflat-week-band">${paged ? `<div class="lieflat-week-band-caption">${escapeHtml(shortPeriodLabel(band[0].label, grain))} — ${escapeHtml(shortPeriodLabel(band.at(-1).label, grain))}</div>` : ""}${renderBand(band, index)}</div>`).join("")}</div>`
    : renderBand(bands[0], 0);
  return wrapCard({
    badge: "LUPI 基础型 · 柱 + 折线",
    title: chartTitle,
    sub: paged
      ? `浅柱=${barLabels[1] || "送检"}，深柱=${barLabels[0] || "不良"}，折线=${lineLabel || "不良率"} · 折线在上层、柱在下层 · 次坐标按实际比例缩放 · 按每12周分段`
      : `浅柱=${barLabels[1] || "送检"}，深柱=${barLabels[0] || "不良"}，折线=${lineLabel || "不良率"} · 折线在上层、柱在下层 · 次坐标按实际比例缩放 · 柱顶为真实数量${useCompress ? " · 柱高已开方压缩" : ""}`,
    src: "PAIRED RUNGS · PALM · 质量",
    svg,
    wide: true,
    compact,
    scroll: false,
  });
};

const keepActiveWeek = (rows = []) => (Array.isArray(rows) ? rows : []).filter((row) => (Number(row.bad ?? row.count ?? row.value ?? 0) || 0) !== 0 || (Number(row.total ?? 0) || 0) !== 0);
const isWeekContext = (...values) => /周|week/i.test(values.map((item) => String(item || "")).join(" "));

export const figureMatchesHeading = (figure = {}, heading = "") => {
  const norm = (value) => String(value || "").replace(/[.)、]/g, "").trim().toLowerCase();
  const title = norm(heading);
  const sectionId = norm(figure.sectionId);
  const figureTitle = norm(figure.title);
  if (sectionId && (title === sectionId || title.includes(sectionId) || sectionId.includes(title))) return true;
  if (figureTitle && title && (title === figureTitle || figureTitle.includes(title) || title.includes(figureTitle))) return true;
  return false;
};

export const renderLieflatFigure = (figure = {}, { compact = false } = {}) => {
  const categories = Array.isArray(figure.categories) ? figure.categories : [];
  const series = Array.isArray(figure.series) ? figure.series : [];
  const title = figure.title || figure.sectionId || "图表";
  const intent = String(figure.intent || figure.preferredChart || "").toLowerCase();
  const week = isWeekContext(figure.id, figure.sectionId, title);
  const grainKey = `${figure.id || ""} ${figure.sectionId || ""} ${title}`;
  const grain = isWeekContext(grainKey) ? "week" : /month|月/i.test(grainKey) ? "month" : "week";
  const isRdCountTrend = /rd-quality-(week|month)-trend|周度问题趋势|月度问题趋势|研发质量问题(?:周度|月度)趋势/.test(grainKey);
  if (isRdCountTrend) {
    let rdRows = categories.map((label, index) => ({ label: String(typeof label === "object" ? (label.name || label.label) : label), value: Number(series[0]?.values?.[index]) || 0, count: Number(series[0]?.values?.[index]) || 0, selected: Boolean(typeof label === "object" && label.selected) }));
    if (week) rdRows = keepActiveWeek(rdRows);
    return renderLieflatRungBars({ title, rows: rdRows, valueLabel: series[0]?.name || "问题数量", compact });
  }
  const comboPaired = String(figure.preferredChart || "").toLowerCase() === "combo-bar-line" && series.length >= 3;
  if (comboPaired || intent.includes("period-trend") || intent.includes("dual-column") || String(figure.preferredChart || "").toLowerCase() === "line") {
    let rows = categories.map((label, index) => {
      const bad = Number(series[0]?.values?.[index]);
      const total = Number(series[1]?.values?.[index]);
      const rate = Number(series[2]?.values?.[index]);
      return { label: String(typeof label === "object" ? (label.name || label.label) : label), value: bad, bad, total: Number.isFinite(total) ? total : null, rate: Number.isFinite(rate) ? rate : null, hollow: Number.isFinite(total) && total > 0 && bad === 0, count: bad, selected: Boolean(typeof label === "object" && label.selected) };
    }).filter((row) => Number.isFinite(row.value));
    if (week && !comboPaired) rows = keepActiveWeek(rows);
    const comboGrain = isWeekContext(grainKey) ? "week" : /month|月/i.test(grainKey) ? "month" : "category";
    if (rows.some((row) => row.total != null)) return renderLieflatPairedTrend({ title, rows, barLabels: [series[0]?.name || "不良数量", series[1]?.name || "送检数量"], lineLabel: series[2]?.name || "不良率", grain: comboPaired ? comboGrain : grain, compact });
    return renderLieflatHairline({ title, rows, valueLabel: series[0]?.name || "不良数量", grain, compact });
  }
  const rateSeries = series.find((item) => item?.unit === "%" || /率|占比/.test(String(item?.name || "")));
  const valueSeries = series.find((item) => item !== rateSeries) || series[0];
  const values = categories.map((label, index) => {
    const item = typeof label === "object" && label ? label : { name: label };
    const rate = rateSeries ? Number(rateSeries.values?.[index]) : null;
    return { label: item.name || item.label || "未命名", name: item.name || item.label, value: Number(valueSeries?.values?.[index]) || 0, rate: Number.isFinite(rate) ? rate : null, focus: Boolean(item.focus), rank: item.rank, rankTotal: item.rankTotal || item.total };
  });
  return renderLieflatRungBars({ title, rows: values, valueLabel: valueSeries?.name || figure.unit || "数量", compact });
};
