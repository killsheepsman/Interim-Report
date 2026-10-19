import { chartFamily, closingTitle } from "./reportSheetLayout.js";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
const BG = "rgb(247,242,235)";
const TXT = "rgb(8,31,92)";
const FAINT = "rgba(8,31,92,.32)";
const GRID = "rgba(8,31,92,.16)";
const DATA = "rgb(51,78,172)";
const HERO = "rgb(8,31,92)";
const LAB = "rgba(8,31,92,.72)";
const HEAT = ["rgb(51,78,172)", "rgb(112,150,209)", "rgb(186,214,235)"];
const CAT4 = ["rgb(8,31,92)", "rgb(51,78,172)", "rgb(112,150,209)"];
const textRole = (value, extra) => {
  const raw = String(value ?? "").trim();
  const weight = Number((String(extra).match(/font-weight="(\d+)"/) || [])[1] || 400);
  const declared = Number((String(extra).match(/font-size="([\d.]+)"/) || [])[1] || 18);
  if (declared >= 28) return "hero";
  const axis = /月$|^W\d/i.test(raw) || /^\d{4}-W\d{1,2}$/i.test(raw) || /^\d+(?:\.\d+)?%?$/.test(raw);
  const figure = weight >= 800 || /批$|项$|台$/.test(raw);
  if (figure && !/月$|^W\d/i.test(raw)) return "num";
  if (axis && raw.length <= 8) return "tick";
  return "txt";
};
const text = (x, y, value, extra = "") => {
  const role = textRole(value, extra);
  let attrs = String(extra || "").replace(/font-size="[\d.]+"/, "");
  attrs = /class="/.test(attrs) ? attrs.replace(/class="/, `class="${role} `) : attrs + ` class="${role}"`;
  return `<text x="${x}" y="${y}" ${attrs}>${escapeHtml(value)}</text>`;
};
const pinSubjectRows = (rows, limit = 8) => {
  const list = rows || [];
  if (list.length <= limit) return list;
  const focusAt = list.findIndex((row) => row?.focus || /第\d+\/\d+名/.test(String(row?.name || "")));
  if (focusAt < 0 || focusAt < limit) return list.slice(0, limit);
  return [...list.slice(0, limit - 1), list[focusAt]];
};
const showAxisLabel = (index, count, gap) => {
  if (count <= 2) return true;
  const step = Math.max(1, Math.ceil(72 / Math.max(Number(gap) || 1, 1)));
  return step <= 1 || index === 0 || index === count - 1 || index % step === 0;
};
const formatNum = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (Math.abs(number - Math.round(number)) < 0.05) return String(Math.round(number));
  return String(Math.round(number * 10) / 10);
};
const formatTick = (value) => {
  const number = Number(value);
  if (Math.abs(number - Math.round(number)) < 0.01) return String(Math.round(number));
  if (Math.abs(number * 10 - Math.round(number * 10)) < 0.05) return String(Math.round(number * 10) / 10);
  return number.toFixed(2);
};
const niceStep = (rough) => {
  if (!(rough > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / pow;
  const base = n <= 1.5 ? 1 : n <= 3 ? 2 : n <= 7 ? 5 : 10;
  return base * pow;
};
const tightScale = (values) => {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return { min: 0, max: 1, ticks: [0, 1] };
  const dataMin = Math.min(...nums);
  const dataMax = Math.max(...nums);
  const dataSpan = Math.max(dataMax - dataMin, Math.abs(dataMax) * 0.08, 0.4);
  const step = niceStep(dataSpan / 3);
  const min = dataMin >= 0
    ? Math.max(0, Math.floor((dataMin - dataSpan * 0.18) / step) * step)
    : Math.floor((dataMin - dataSpan * 0.18) / step) * step;
  let max = Math.ceil((dataMax + dataSpan * 0.28) / step) * step;
  if (max <= min) max = min + step;
  if (dataMin >= 0 && (max - min) > Math.max(dataSpan * 2.4, dataMax * 1.8, 1)) {
    max = Math.ceil((dataMax + dataSpan * 0.35) / step) * step;
  }
  const ticks = [];
  for (let value = min; value <= max + step * 0.001; value += step) ticks.push(Number(value.toFixed(6)));
  return { min, max: ticks[ticks.length - 1], ticks };
};
const countScale = (values) => {
  const max = Math.max(0, ...values.map(Number).filter(Number.isFinite));
  const step = niceStep((max || 1) / 4);
  const tickMax = Math.max(step, Math.ceil((max || step) / step) * step);
  const ticks = [];
  for (let value = 0; value <= tickMax + step * 0.001; value += step) ticks.push(Number(value.toFixed(6)));
  return { min: 0, max: tickMax, ticks };
};
const wrapLabel = (name, size = 6) => {
  const source = String(name || "");
  if (source.length <= size) return [source];
  const lines = [];
  for (let index = 0; index < source.length && lines.length < 2; index += size) lines.push(source.slice(index, index + size));
  if (source.length > size * 2) lines[1] = lines[1].slice(0, Math.max(0, size - 1)) + "…";
  return lines;
};
const categoryName = (item) => item && typeof item === "object" ? String(item.name || item.label || "") : String(item || "");
const mapY = (value, scale, top, bottom) => bottom - ((Number(value) - scale.min) / (scale.max - scale.min || 1)) * (bottom - top);

export const lineChart = (divisions, { unit = "%", label = "升降对照" } = {}) => {
  const items = (divisions || []).filter((item) => item && item.current != null && Number.isFinite(Number(item.current)));
  if (items.length < 2) return "";
  if (items.length > 8) {
    const bands = [];
    for (let index = 0; index < items.length; index += 8) bands.push(items.slice(index, index + 8));
    return '<div class="trend-bands">' + bands.map((band) => '<div class="trend-band"><div class="trend-caption">' + escapeHtml(band[0].name + " — " + band[band.length - 1].name) + "</div>" + lineChart(band, { unit, label }) + "</div>").join("") + "</div>";
  }
  const slot = 108;
  const width = Math.max(460, 78 + items.length * slot + 36);
  const height = 300;
  const plotTop = 36;
  const plotBottom = 214;
  const scale = tightScale(items.flatMap((item) => [item.current, item.previous].filter((value) => value != null)));
  const x = (index) => 70 + index * slot + slot / 2;
  const guides = scale.ticks.map((value) => `<line x1="46" y1="${mapY(value, scale, plotTop, plotBottom)}" x2="${width - 24}" y2="${mapY(value, scale, plotTop, plotBottom)}" stroke="${GRID}" stroke-width=".5"/>${text(40, mapY(value, scale, plotTop, plotBottom) + 4, formatTick(value), 'font-size="12" font-weight="700" fill="' + FAINT + '" text-anchor="end"')}`).join("");
  const currentPath = `<path d="M${items.map((item, index) => `${x(index)} ${mapY(item.current, scale, plotTop, plotBottom)}`).join(" L ")}" fill="none" stroke="${DATA}" stroke-width="2.4" class="draw" pathLength="1"/>`;
  const previousPoints = items.map((item, index) => item.previous == null ? null : `${x(index)} ${mapY(item.previous, scale, plotTop, plotBottom)}`).filter(Boolean);
  const previousPath = previousPoints.length > 1 ? `<path d="M${previousPoints.join(" L ")}" fill="none" stroke="${FAINT}" stroke-width="1.4" class="draw" pathLength="1"/>` : "";
  const dots = items.map((item, index) => {
    const y = mapY(item.current, scale, plotTop, plotBottom);
    const labelY = y < plotTop + 22 ? y + 20 : y - 12;
    const previous = item.previous == null ? "" : `<circle cx="${x(index)}" cy="${mapY(item.previous, scale, plotTop, plotBottom)}" r="4.2" class="dot" fill="${BG}" stroke="${FAINT}" stroke-width="1.6"><title>${escapeHtml(item.name)} 上期 ${formatNum(item.previous)}${unit}</title></circle>`;
    const name = showAxisLabel(index, items.length, slot) ? wrapLabel(item.name, 6).map((line, lineIndex) => text(x(index), 246 + lineIndex * 15, line, 'font-size="13" font-weight="700" fill="' + LAB + '" text-anchor="middle"')).join("") : "";
    return `${previous}<circle cx="${x(index)}" cy="${y}" r="5.2" class="dot" fill="${HERO}"><title>${escapeHtml(item.name)} 本期 ${formatNum(item.current)}${unit}</title></circle>${text(x(index), labelY, formatNum(item.current) + unit, 'font-size="15" font-weight="800" fill="' + TXT + '" text-anchor="middle"')}${name}`;
  }).join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}" data-ymax="${scale.max}"><line x1="46" y1="${plotBottom}" x2="${width - 24}" y2="${plotBottom}" stroke="${GRID}" stroke-width=".8"/>${guides}${previousPath}${currentPath}${dots}</svg>`;
};

export const heatChart = (divisions, options = {}) => {
  const items = divisions || [];
  const worstHigh = options.worst === "high";
  const cols = [
    { name: "上月", key: "previous" },
    { name: "本月", key: "current" },
    { name: "累计", key: "ytd" },
  ].filter((col) => items.some((item) => item[col.key] != null && Number.isFinite(Number(item[col.key]))));
  if (!cols.length || !items.length) return "";
  const rowH = 52;
  const width = Math.max(420, 150 + cols.length * 120);
  const height = 36 + items.length * rowH;
  const x = (index) => 156 + index * 120;
  const y = (index) => 58 + index * rowH;
  const headers = cols.map((col, index) => text(x(index), 34, col.name, 'font-size="13" font-weight="700" fill="rgba(8,31,92,.62)" text-anchor="middle"')).join("");
  const currentValues = items.map((item) => Number(item.current)).filter(Number.isFinite);
  const rankColor = worstHigh && currentValues.length > 0 && Math.max(...currentValues) < 30;
  const worst = items.reduce((best, item, index) => {
    const value = Number(item.current);
    if (!Number.isFinite(value)) return best;
    if (best.index < 0) return { value, index };
    const worse = worstHigh ? value > best.value : value < best.value;
    return worse ? { value, index } : best;
  }, { value: worstHigh ? -1 : 101, index: -1 });
  const shade = (value) => {
    const number = Number(value);
    if (rankColor) {
      const sorted = [...currentValues].sort((a, b) => a - b);
      const rank = Math.max(0, sorted.indexOf(number));
      const step = sorted.length <= 1 ? 1 : rank / (sorted.length - 1);
      return step > 0.66 ? HEAT[0] : step > 0.33 ? HEAT[1] : HEAT[2];
    }
    return number < 50 ? HEAT[0] : number < 70 ? HEAT[1] : HEAT[2];
  };
  const body = items.map((item, row) => {
    const lines = wrapLabel(item.name, 8);
    const label = lines.map((line, index) => text(140, y(row) + index * 15 - (lines.length - 1) * 7, line, 'font-size="13" font-weight="700" fill="' + LAB + '" text-anchor="end"')).join("");
    const dots = cols.map((col, column) => {
      const value = item[col.key];
      if (value == null || !Number.isFinite(Number(value))) return "";
      const radius = Math.max(8, Math.min(18, 7 + Math.sqrt(Number(value)) * 1.05));
      return `<circle cx="${x(column)}" cy="${y(row)}" r="${radius.toFixed(1)}" class="dot" fill="${shade(value)}"><title>${escapeHtml(item.name)} ${col.name} ${formatNum(value)}%</title></circle>${text(x(column), y(row) + 22, formatNum(value) + "%", 'font-size="16" font-weight="800" fill="' + TXT + '" text-anchor="middle"')}`;
    }).join("");
    return label + dots;
  }).join("");
  const currentColumn = cols.findIndex((col) => col.key === "current");
  const ring = worst.index >= 0 && currentColumn >= 0 ? `<circle cx="${x(currentColumn)}" cy="${y(worst.index)}" r="18" fill="none" stroke="${TXT}" stroke-width="1.2" stroke-dasharray="2 3"/>` : "";
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="比率对照">${headers}${body}${ring}</svg>`;
};

export const donutChart = (divisions, shipped) => {
  const items = (divisions || []).filter((item) => Number(item.count) > 0);
  if (!items.length) return "";
  const counts = items.map((item) => Number(item.count) || 0);
  const total = counts.reduce((sum, item) => sum + item, 0) || 1;
  const ticks = counts.map((item) => Math.round(item / total * 100));
  ticks[0] += 100 - ticks.reduce((sum, item) => sum + item, 0);
  const cx = 92;
  const cy = 96;
  const radius = 46;
  let cursor = 0;
  const marks = items.map((item, index) => {
    const count = Math.max(0, ticks[index] || 0);
    const shade = CAT4[index % 3];
    let lines = "";
    for (let step = 0; step < count; step += 1) {
      const angle = (cursor + step) * 3.6 - 90;
      const radians = angle * Math.PI / 180;
      const length = 7 + ((cursor + step) * 17) % 5;
      const x1 = cx + radius * Math.cos(radians);
      const y1 = cy + radius * Math.sin(radians);
      const x2 = cx + (radius + length) * Math.cos(radians);
      const y2 = cy + (radius + length) * Math.sin(radians);
      lines += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${shade}" stroke-width="1.8"/>`;
    }
    cursor += count;
    return lines;
  }).join("");
  const legend = items.map((item, index) => {
    const y = 36 + index * 28;
    return `<rect x="210" y="${y - 12}" width="14" height="14" fill="${CAT4[index % 3]}"/>${text(232, y, item.name + "  " + formatNum(item.count), 'font-size="16" font-weight="800" fill="' + TXT + '"')}`;
  }).join("");
  const height = Math.max(190, 28 + items.length * 28);
  return `<svg width="460" height="${height}" viewBox="0 0 460 ${height}" role="img" aria-label="构成">${marks}${text(cx, cy + 8, shipped || total, 'font-size="28" font-weight="800" fill="' + TXT + '" text-anchor="middle"')}${legend}</svg>`;
};

export const barChart = (rows, { unit = "", label = "对比" } = {}) => {
  const items = (rows || []).filter((row) => row && row.name && Number.isFinite(Number(row.value)));
  if (!items.length) return "";
  const max = Math.max(...items.map((row) => Number(row.value)), 0.0001);
  const rowH = 48;
  const width = 760;
  const labelW = 188;
  const height = 24 + items.length * rowH + 8;
  const plotW = width - labelW - 108;
  const body = items.map((row, index) => {
    const y = 16 + index * rowH;
    const value = Number(row.value);
    const bar = Math.max(2, (value / max) * plotW);
    const color = row.focus ? HERO : index < 3 ? HERO : DATA;
    const lines = wrapLabel(row.name, 8);
    const name = lines.map((line, lineIndex) => text(labelW - 10, y + 16 + lineIndex * 14, line, 'font-size="13" font-weight="700" fill="' + LAB + '" text-anchor="end"')).join("");
    const note = row.note ? "  " + row.note : "";
    return `<g><title>${escapeHtml(row.name)} ${formatNum(value)}${unit}${note}</title>${name}<line x1="${labelW}" y1="${y + 14}" x2="${(labelW + bar).toFixed(1)}" y2="${y + 14}" stroke="${color}" stroke-width="11" stroke-linecap="butt"/>${text(labelW + bar + 8, y + 18, formatNum(value) + unit + note, 'font-size="14" font-weight="800" fill="' + TXT + '"')}</g>`;
  }).join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}">${body}</svg>`;
};

export const comboChart = (chart) => {
  const names = chart.categories || [];
  const bars = chart.bars || [];
  if (names.length < 2 || bars.length < 2) return "";
  const line = Array.isArray(chart.line) ? chart.line : null;
  if (names.length > 8) {
    const bands = [];
    for (let index = 0; index < names.length; index += 8) {
      const end = index + 8;
      bands.push(comboChart({ ...chart, categories: names.slice(index, end), bars: bars.slice(index, end), line: line ? line.slice(index, end) : null, totals: chart.totals ? chart.totals.slice(index, end) : null, selected: chart.selected ? chart.selected.slice(index, end) : null }));
    }
    return '<div class="trend-bands">' + bands.map((svg, index) => '<div class="trend-band"><div class="trend-caption">' + escapeHtml(String(names[index * 8] || "") + " — " + String(names[Math.min(names.length, index * 8 + 8) - 1] || "")) + "</div>" + svg + "</div>").join("") + "</div>";
  }
  const slot = names.length > 10 ? 62 : 78;
  const left = 54;
  const right = line ? 58 : 28;
  const width = Math.max(560, left + right + names.length * slot);
  const height = line ? 348 : 320;
  const plotTop = 34;
  const plotBottom = 214;
  const barAxis = countScale(bars);
  const rateAxis = line ? tightScale(line.filter((value) => Number.isFinite(Number(value)))) : null;
  const x = (index) => left + index * slot + slot / 2;
  const yBar = (value) => plotBottom - (Number(value) / (barAxis.max || 1)) * (plotBottom - plotTop);
  const yLine = (value) => mapY(value, rateAxis, plotTop, plotBottom);
  const guides = barAxis.ticks.map((value) => `<line x1="${left - 8}" y1="${yBar(value)}" x2="${width - right}" y2="${yBar(value)}" stroke="${GRID}" stroke-width=".45"/>${text(left - 12, yBar(value) + 4, formatTick(value), 'font-size="11" font-weight="700" fill="' + FAINT + '" text-anchor="end"')}`).join("");
  const rateGuides = rateAxis ? rateAxis.ticks.map((value) => text(width - right + 8, yLine(value) + 4, formatTick(value), 'font-size="11" font-weight="700" fill="' + DATA + '"')).join("") : "";
  const columns = names.map((name, index) => {
    const value = Number(bars[index]) || 0;
    const top = yBar(value);
    const barWidth = Math.min(18, slot * 0.34);
    return `<rect x="${(x(index) - barWidth / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, plotBottom - top).toFixed(1)}" fill="${chart.selected?.[index] ? HERO : DATA}" opacity=".9"><title>${escapeHtml(name)} ${chart.barName || ""} ${formatNum(value)}</title></rect>${text(x(index), Math.max(plotTop + 12, top - 6), formatNum(value), 'font-size="12" font-weight="800" fill="' + TXT + '" text-anchor="middle"')}`;
  }).join("");
  const linePath = line ? `<path d="M${names.map((name, index) => `${x(index)} ${yLine(line[index] || 0)}`).join(" L ")}" fill="none" stroke="${HERO}" stroke-width="2.2" class="draw" pathLength="1"/>` : "";
  const lineDots = line ? names.map((name, index) => {
    const y = yLine(line[index] || 0);
    return `<circle cx="${x(index)}" cy="${y.toFixed(1)}" r="4.6" class="dot" fill="${BG}" stroke="${HERO}" stroke-width="2"><title>${escapeHtml(name)} ${chart.lineName || ""} ${formatNum(line[index])}%</title></circle>`;
  }).join("") : "";
  const labels = names.map((name, index) => {
    const lines = wrapLabel(String(name).replace(/^20\d{2}[-年]/, ""), 5);
    const total = chart.totals ? chart.totals[index] : null;
    const rate = line ? text(x(index), 232, formatNum(line[index]) + "%", 'font-size="13" font-weight="800" fill="' + HERO + '" text-anchor="middle"') : "";
    const nameY = line ? 250 : 236;
    const showName = showAxisLabel(index, names.length, slot);
    return rate + (showName ? lines.map((lineText, lineIndex) => text(x(index), nameY + lineIndex * 14, lineText, 'font-size="12" font-weight="700" fill="' + LAB + '" text-anchor="middle"')).join("") : "") + (total != null && showName ? text(x(index), nameY + lines.length * 14 + 2, "检" + formatNum(total), 'font-size="11" font-weight="700" fill="' + FAINT + '" text-anchor="middle"') : "");
  }).join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chart.title || "趋势")}" data-ymax="${rateAxis ? rateAxis.max : barAxis.max}">${guides}${rateGuides}<line x1="${left - 8}" y1="${plotBottom}" x2="${width - right}" y2="${plotBottom}" stroke="${GRID}"/>${columns}${linePath}${lineDots}${labels}</svg>`;
};

const figureUnit = (figure, series) => {
  if (series?.unit === "%" || /率|占比|比例/.test(series?.name || "")) return "%";
  if (String(figure?.unit || "").includes("%")) return "%";
  return "";
};
const isRateSeries = (series) => series?.axis === "right" || series?.unit === "%" || /率|占比|比例/.test(series?.name || "");
const valuesOf = (series) => (series?.values || []).map((value) => Number(value) || 0);
export const chartsFromFigure = (figure) => {
  if (!figure) return [];
  const names = (figure.categories || []).map(categoryName);
  const series = Array.isArray(figure.series) ? figure.series : [];
  if (names.filter(Boolean).length < 2 || !series.length) return [];
  const title = String(figure.title || "图表");
  const rate = series.find(isRateSeries);
  const counts = series.filter((item) => item !== rate);
  const selected = (figure.categories || []).map((item) => Boolean(item && typeof item === "object" && (item.selected || item.focus)));
  if (rate && counts.length) {
    const ranked = counts.slice().sort((left, right) => Math.max(...valuesOf(left)) - Math.max(...valuesOf(right)));
    const bars = ranked[0];
    const other = counts.find((item) => item !== bars);
    const barValues = valuesOf(bars);
    const lineValues = valuesOf(rate);
    if (barValues.every((value) => value === 0) && lineValues.every((value) => value === 0)) return [];
    return [{
      kind: "combo",
      title,
      claim: other
        ? `柱形是${bars.name || "数量"}，折线是${rate.name || "比率"}。${other.name || "另一组数量"}写在类别下面，避免两列相差太大把图撑得过高。左右轴都按这张图自己的数据缩放。`
        : `柱形是${bars.name || "数量"}，折线是${rate.name || "比率"}。纵轴按这张图的实际数据缩放，不固定到 100。`,
      categories: names,
      bars: barValues,
      barName: bars.name || "数量",
      line: lineValues,
      lineName: rate.name || "比率",
      totals: other ? valuesOf(other) : null,
      selected,
    }];
  }
  const only = counts[0] || series[0];
  const values = valuesOf(only);
  if (values.every((value) => value === 0)) return [];
  const intent = `${figure.intent || ""} ${figure.preferredChart || ""}`;
  if (/period-trend|dual-column-line|column-line|折线/.test(intent) && !/horizontal|ranking/.test(intent)) {
    return [{ kind: "combo", title, claim: `${only.name || "数量"}按实际数值画柱，纵轴跟最大值走。`, categories: names, bars: values, barName: only.name || "数量", line: null, selected }];
  }
  return [{
    kind: "bars",
    title,
    claim: `${only.name || title}。数字标在柱外。`,
    rows: names.map((name, index) => ({ name, value: values[index] || 0, focus: selected[index] })).filter((row) => row.name),
    unit: figureUnit(figure, only),
  }];
};

const monthlyCombo = (cell, year, barKey, rateKey, totalKey, barName, rateName) => {
  const rows = (cell?.rows || []).filter((row) => Number(row[totalKey] || row.inspected || row.count) > 0 || Number(row[barKey] || row.bad) > 0);
  if (rows.length < 2) return null;
  return {
    kind: "combo",
    title: (year ? year + "年" : "") + (cell.label || cell.name) + "月度趋势",
    claim: `柱形是${barName}，折线是${rateName}。折线纵轴按本图最低到最高留边，不拉到 100。类别下方的小数是${totalKey === "count" ? "出货" : "检验"}数。`,
    categories: rows.map((row) => row.month || row.label),
    bars: rows.map((row) => Number(row[barKey] ?? row.bad) || 0),
    barName,
    line: rows.map((row) => Number(row[rateKey] ?? row.rate) || 0),
    lineName: rateName,
    totals: rows.map((row) => Number(row[totalKey] ?? row.inspected ?? row.count) || 0),
  };
};
const iqcCharts = (split) => {
  const charts = [];
  const year = split?.trendYear || "";
  (split?.cellMonthly || []).forEach((cell) => {
    const chart = monthlyCombo(cell, year, "bad", "rate", "inspected", "不合格批次", "不合格率");
    if (chart) charts.push(chart);
  });
  const cells = (split?.cells || []).filter((cell) => cell.rate != null);
  if (cells.length >= 2) {
    charts.push({
      kind: "line",
      title: "四格不合格率",
      claim: "实心是本期，空心是上期。纵轴只覆盖这四格的实际不合格率。",
      points: cells.map((cell) => ({ name: cell.name, current: Number(cell.rate), previous: cell.previousRate == null ? null : Number(cell.previousRate) })),
    });
  }
  const defects = [];
  (split?.cells || []).forEach((cell) => (cell.defects || []).forEach((item) => {
    if (Number(item.count) > 0) defects.push({ name: cell.name + " · " + item.name, value: Number(item.count) });
  }));
  defects.sort((left, right) => right.value - left.value);
  if (defects.length) charts.push({ kind: "bars", title: "缺陷", claim: "柱长是不合格批次。同一格里只取快照已经汇总的主要缺陷。", rows: defects, unit: "批" });
  const suppliers = (split?.suppliers || []).filter((item) => Number(item.bad) > 0 || Number(item.inspected) > 0);
  if (suppliers.length) {
    charts.push({
      kind: "bars",
      title: "供应商",
      claim: "按不合格批次从高到低。比率写在数字后面，不和公司加工放在同一张图。",
      rows: suppliers.map((item) => ({ name: (item.site || "") + (item.name || ""), value: Number(item.bad) || 0, note: item.rate != null ? item.rate + "%" : "" })),
      unit: "批",
    });
  }
  const machining = split?.companyMachining || [];
  if (machining.length) {
    charts.push({
      kind: "bars",
      title: "公司加工",
      claim: "柱长是不合格率。检验批次和不合格批次写在数字后面。",
      rows: machining.map((item) => ({ name: item.site || item.name, value: Number(item.rate) || 0, note: "检" + (item.inspected ?? "") + " 不合格" + (item.bad ?? "") })),
      unit: "%",
    });
  }
  return charts;
};
const ipqcCharts = (split) => {
  const charts = [];
  const year = split?.trendYear || "";
  (split?.cellMonthly || []).forEach((cell) => {
    const chart = monthlyCombo(cell, year, "bad", "rate", "inspected", "异常数", "异常密度");
    if (chart) charts.push(chart);
  });
  const managers = (split?.managers || []).filter((item) => item.rate != null);
  if (managers.length >= 2) {
    charts.push({
      kind: "bars",
      title: "交付经理",
      claim: "按异常密度从高到低。",
      rows: managers.slice().sort((left, right) => Number(right.rate) - Number(left.rate)).map((item) => ({ name: (item.site || "") + (item.name || ""), value: Number(item.rate) || 0, note: "异常" + (item.bad ?? "") })),
      unit: "%",
    });
  }
  return charts;
};
const snapshotCharts = (snapshot) => {
  const data = snapshot?.data || {};
  return [...iqcCharts(data.iqcSplit), ...ipqcCharts(data.ipqcSplit)];
};

const CELL_NAMES = ["杭州供应商", "深圳供应商", "杭州公司加工", "深圳公司加工", "半导体&北美", "产品五部", "FPC事业部"];
const proseCharts = (source) => {
  const charts = [];
  const text = String(source || "");
  const cells = [];
  const ratePattern = /由\s*([\d.]+)%\s*(?:升至|降至)\s*([\d.]+)%/g;
  let match;
  while ((match = ratePattern.exec(text))) {
    const before = text.slice(Math.max(0, match.index - 40), match.index);
    const name = CELL_NAMES.find((item) => before.includes(item));
    if (!name || cells.some((item) => item.name === name)) continue;
    cells.push({ name, previous: Number(match[1]), current: Number(match[2]) });
  }
  if (cells.length >= 2) charts.push({ kind: "line", title: "四格不合格率", claim: "实心是本期，空心是上期。纵轴按这些实际比率缩放。", points: cells });
  const defects = [...text.matchAll(/(深圳供应商|杭州供应商|深圳公司加工|杭州公司加工)最多的是([^，。；\n]+)，\s*(\d+)\s*批/g)]
    .map((item) => ({ name: item[1] + " · " + item[2].trim(), value: Number(item[3]) }));
  if (defects.length >= 2) charts.push({ kind: "bars", title: "缺陷", claim: "柱长是报告里点出的不合格批次。", rows: defects, unit: "批" });
  const suppliers = [...text.matchAll(/([\u4e00-\u9fa5A-Za-z0-9（）()]{2,24})：送检\s*(\d+)\s*批，不合格\s*(\d+)\s*批，不合格率\s*([\d.]+)%/g)]
    .filter((item) => !/公司加工/.test(item[1]))
    .map((item) => ({ name: item[1], value: Number(item[3]), note: item[4] + "%" }));
  if (suppliers.length) charts.push({ kind: "bars", title: "供应商", claim: "只画报告点名的供应商。柱长是不合格批次。", rows: suppliers, unit: "批" });
  const machining = [...text.matchAll(/(深圳|杭州)公司加工：检验\s*(\d+)\s*批，不合格\s*(\d+)\s*批，不合格率\s*([\d.]+)%/g)]
    .map((item) => ({ name: item[1] + "公司加工", value: Number(item[4]), note: "检" + item[2] + " 不合格" + item[3] }));
  if (machining.length) charts.push({ kind: "bars", title: "公司加工", claim: "柱长是不合格率，检验和不合格批次写在数字后面。", rows: machining, unit: "%" });
  return charts;
};
const numberIn = (row) => {
  const match = String(row || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
const tableCharts = (source) => {
  const lines = String(source || "").split(/\r?\n/);
  const charts = [];
  let heading = "";
  for (let index = 0; index < lines.length; index += 1) {
    if (/^#{1,3}\s+/.test(lines[index])) heading = lines[index].replace(/^#{1,3}\s+/, "").replace(/^\d+[.、]\s*/, "").trim();
    if (!/^\|/.test(lines[index].trim())) continue;
    const block = [];
    while (index < lines.length && /^\|/.test(lines[index].trim())) {
      block.push(lines[index].trim());
      index += 1;
    }
    index -= 1;
    if (block.length < 3 || !/^[\s|:-]+$/.test(block[1])) continue;
    if (/要做|行动|措施|关闭|责任|完成时间/.test(heading)) continue;
    const cells = (row) => row.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    const header = cells(block[0]);
    const body = block.slice(2).map(cells).filter((row) => row.some(Boolean) && !/^[-:]+$/.test(row[0] || ""));
    if (body.length < 2) continue;
    const numeric = header.map((_, column) => body.filter((row) => numberIn(row[column]) != null).length >= Math.ceil(body.length * 0.7));
    const labelColumn = header.findIndex((_, column) => !numeric[column]);
    const valueColumn = numeric.findIndex(Boolean);
    if (labelColumn < 0 || valueColumn < 0) continue;
    const rows = body.map((row) => ({ name: row[labelColumn] || "未命名", value: numberIn(row[valueColumn]) || 0 })).filter((row) => row.name && !/合计|总计/.test(row.name));
    if (rows.length < 2) continue;
    const shown = rows;
    charts.push({
      kind: "bars",
      title: heading || header[valueColumn] || "数据",
      claim: "柱外数字是原表里的数值，不删行。",
      rows: shown,
      unit: /率|%/.test(header[valueColumn] || "") ? "%" : "",
    });
  }
  return charts;
};
const pushChart = (charts, chart) => {
  if (!chart || !chart.title) return;
  if (charts.some((item) => item.title === chart.title)) return;
  charts.push(chart);
};
const finite = (value) => Number.isFinite(Number(value));
const pointCount = (chart) => chart?.kind === "line" ? (chart.points || []).length : chart?.kind === "bars" ? (chart.rows || []).length : (chart?.categories || []).length;
const comparisonChart = (pool) => pool.find((chart) => chart.kind === "line" && pointCount(chart) >= 2 && pointCount(chart) <= 6 && (chart.points || []).some((point) => finite(point.previous)) && !/月度|周度/.test(chart.title));
const focusChart = (pool) => pool.find((chart) => chart.kind === "bars" && chart.title === "缺陷" && pointCount(chart) >= 2 && pointCount(chart) <= 6)
  || pool.find((chart) => chart.kind === "bars" && pointCount(chart) >= 2 && pointCount(chart) <= 6 && !/月度|周度|供应商|排名|额外|公司加工/.test(chart.title));
const moveClaim = (points, title) => {
  const upIsBad = /不合格|不良|低分|异常|密度/.test(title);
  const moved = points.filter((point) => finite(point.previous));
  const pick = [...(moved.length ? moved : points)].sort((a, b) => upIsBad ? Number(b.current) - Number(a.current) : Number(a.current) - Number(b.current))[0];
  if (!pick) return "";
  if (!finite(pick.previous)) return pick.name + "本期 " + formatNum(pick.current) + "%";
  const verb = Number(pick.current) > Number(pick.previous) ? "升到" : Number(pick.current) < Number(pick.previous) ? "降到" : "仍是";
  return "先看" + pick.name + "：由 " + formatNum(pick.previous) + "% " + verb + " " + formatNum(pick.current) + "%。同类型的月度图排在下面一组，不再拆成互不相干的单页。";
};
const compositionOf = (snapshot, text, names) => {
  if (names.length < 2) return null;
  const cells = snapshot?.data?.iqcSplit?.cells || snapshot?.data?.ipqcSplit?.cells || [];
  const take = (rows) => rows.length === names.length ? rows : null;
  const fromSnapshot = take(names.map((name) => {
    const cell = cells.find((item) => item.name === name);
    return cell && Number(cell.bad) > 0 ? { name, count: Number(cell.bad) } : null;
  }).filter(Boolean));
  if (fromSnapshot) return { claim: "圆圈按不合格批次，不按比率。每一格都有数才画，缺一格就不画。", rows: fromSnapshot };
  const fromText = take(names.map((name) => {
    const match = String(text || "").match(new RegExp(name + "[^。\\n]{0,48}?不合格\\s*(\\d+)\\s*批"));
    return match ? { name, count: Number(match[1]) } : null;
  }).filter(Boolean));
  return fromText ? { claim: "圆圈按报告写明的不合格批次。", rows: fromText } : null;
};
const grabNumber = (text, pattern) => {
  const match = String(text || "").match(pattern);
  return match ? match[1] : "";
};
const actionTitle = (line) => closingTitle(line);
const splitRow = (row) => row.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
const markdownTable = (lines) => {
  const at = lines.findIndex((line) => /^\s*\|/.test(line));
  if (at < 0 || !lines[at + 1] || !/^[\s|:-]+$/.test(lines[at + 1].trim())) return null;
  const rows = [];
  let index = at;
  while (index < lines.length && /^\s*\|/.test(lines[index])) rows.push(lines[index].trim()), index += 1;
  return {
    before: lines.slice(0, at),
    after: lines.slice(index),
    header: splitRow(rows[0]),
    body: rows.slice(2).map(splitRow).filter((row) => row.some(Boolean) && !/^[-:]+$/.test(row[0] || "")),
  };
};
const fieldValue = (text, labels) => {
  const pattern = "(?:" + labels.join("|") + ")" + "[\uFF1A:]\\s*([\\s\\S]*?)(?=\\s*(?:\u5BF9\u8C61|\u73B0\u8C61|\u7F3A\u9677|\u8DDF\u8FDB\u8303\u56F4|\u8DDF\u8FDB|\u6307\u6807|\u5B8C\u6210\u65F6\u95F4|\u5173\u95ED\u6761\u4EF6)[\uFF1A:]|$)";
  const match = text.match(new RegExp(pattern));
  return match ? match[1].replace(/[。；]\s*$/, "").trim() : "";
};
const proseChunks = (lines) => {
  const body = lines.join("\n").trim();
  const numbered = [...body.matchAll(/(?:^|\n)\s*\d+\.\s+([\s\S]*?)(?=\n\s*\d+\.\s+|$)/g)];
  if (numbered.length) return { lead: body.split(/\n\s*\d+\.\s+/)[0], chunks: numbered.map((item) => item[1]) };
  const bold = [...body.matchAll(/(?:^|\n)\*\*([^*]+)\*\*\s*([\s\S]*?)(?=\n\*\*[^*]+\*\*|$)/g)];
  if (bold.length) return { lead: body.split(/\n\*\*[^*]+\*\*/)[0], chunks: bold.map((item) => "对象：" + item[1].trim() + "\n" + item[2]) };
  return { lead: "", chunks: [] };
};
const watchTable = (header, body) => {
  if (!header.length || !body.length) return "";
  const head = "<thead><tr>" + header.map((cell) => "<th>" + escapeHtml(cell) + "</th>").join("") + "</tr></thead>";
  const rows = "<tbody>" + body.map((row) => "<tr>" + header.map((_, index) => (() => { const cell = Array.isArray(row) ? (row[index] || "") : (row[header[index]] || ""); const num = /^[\d,]+(?:\.\d+)?%?$/.test(String(cell).trim()); return "<td" + (num ? " class=\"num\"" : "") + ">" + escapeHtml(cell) + "</td>"; })()).join("") + "</tr>").join("") + "</tbody>";
  return '<table class="watch">' + head + rows + "</table>";
};
const actionHtml = (source) => {
  const lines = String(source || "").split(/\r?\n/);
  const at = lines.findIndex((line) => actionTitle(line));
  if (at < 0) return "";
  let end = lines.length;
  for (let index = at + 1; index < lines.length; index += 1) {
    if (/^#{1,3}\s+/.test(lines[index])) { end = index; break; }
  }
  const block = lines.slice(at + 1, end);
  const title = actionTitle(lines[at]);
  const table = markdownTable(block);
  let header = [];
  let body = [];
  let notes = [];
  if (table?.body.length) {
    header = table.header;
    body = table.body;
    notes = [...table.before, ...table.after].map((line) => line.trim()).filter((line) => line && !/^\s*\|/.test(line));
  } else {
    const prose = proseChunks(block);
    const parsed = prose.chunks.map((chunk) => {
      const flat = chunk.replace(/\s+/g, " ").trim();
      return {
        对象: fieldValue(flat, ["对象"]),
        现象: fieldValue(flat, ["现象", "缺陷", "指标"]),
        跟进: fieldValue(flat, ["跟进范围", "跟进"]),
        完成时间: fieldValue(flat, ["完成时间"]),
        关闭条件: fieldValue(flat, ["关闭条件"]),
      };
    }).filter((row) => row.对象 || row.现象 || row.关闭条件);
    if (parsed.length) {
      header = parsed.some((row) => row.跟进) ? ["对象", "现象", "跟进", "完成时间", "关闭条件"] : ["对象", "现象", "完成时间", "关闭条件"];
      body = parsed.map((row) => header.map((key) => row[key] || ""));
    }
    notes = (parsed.length ? [prose.lead] : block).map((line) => String(line || "").trim()).filter((line) => line && !/^\s*\|/.test(line) && !/^\*\*/.test(line) && !/^\d+\.\s+/.test(line));
  }
  const noteHtml = notes.length ? '<div class="prose">' + notes.map((line) => "<p>" + escapeHtml(line.replace(/^[-*]\s+/, "")) + "</p>").join("") + "</div>" : "";
  const grid = watchTable(header, body);
  if (!grid && !noteHtml) return "";
  return '<div class="secthead"><span class="line"></span><span class="t">' + escapeHtml(title) + "</span></div>" + noteHtml + grid;
};
const spineTitle = (title, module) => {
  if (String(module || "").startsWith("角色报告")) return String(title || "").trim() || "质量报告";
  const source = title + module;
  if (/出货评分|OQC/.test(source)) return "出货评分";
  if (/加工件|IQC/.test(source)) return "加工件质量";
  if (/组装|IPQC/.test(source)) return "组装质量";
  if (/研发|DQA|PM|TPM|产总/.test(source)) return "研发质量";
  if (/满意|QMS/.test(source)) return "客户满意";
  if (/机台|DOAM/.test(source)) return "机台稳定";
  return (title.replace(/\d{4}年\d{0,2}月?/g, "").replace(/报告/g, "").trim() || module || "质量报告").slice(0, 6);
};
const sectionHtml = (chart, first) => {
  const svg = chart.kind === "line" ? lineChart(chart.points || [], { label: chart.title }) : chart.kind === "combo" ? comboChart(chart) : barChart(chart.rows || [], { unit: chart.unit || "", label: chart.title });
  if (!svg) return "";
  return '<div class="secthead' + (first ? " first" : "") + '"><span class="line"></span><span class="t">' + escapeHtml(chart.title) + '</span></div><div class="claim">' + escapeHtml(chart.claim || "") + '</div><div class="fig">' + svg + "</div>";
};


const kpiHtml = (value, note, label) => '<div class="kpi"><div class="v">' + escapeHtml(value) + '</div><div class="r">' + escapeHtml(note || "") + '</div><div class="l">' + escapeHtml(label || "") + "</div></div>";
const labelParts = (name) => String(name || "").split(/\s*·\s*/).map((part) => part.trim()).filter(Boolean);
const tickRows = (items, unit = "", span = 1) => {
  const rows = pinSubjectRows((items || []).filter((item) => item && item.name && Number.isFinite(Number(item.value))), 8);
  if (rows.length < 2) return "";
  const max = Math.max(...rows.map((item) => Number(item.value)), 0.0001);
  const twoLine = rows.some((item) => labelParts(item.name).length > 1);
  const nameX = Math.max(168, ...rows.map((item) => Math.max(...labelParts(item.name).map((part) => part.length), 1) * 18 + 8));
  const plot = span <= 1 ? 460 : 300;
  const width = nameX + 20 + plot + 84;
  const rowH = twoLine ? 58 : 48;
  const height = 24 + rows.length * rowH;
  const axis0 = nameX + 16;
  const valueX = width - 14;
  const axis1 = valueX - 72;
  const tickCount = 24;
  const body = rows.map((item, index) => {
    const y = 28 + index * rowH;
    const ticks = Math.max(1, Math.round((Number(item.value) / max) * tickCount));
    const stepX = (axis1 - axis0) / tickCount;
    let marks = "";
    for (let step = 0; step < ticks; step += 1) {
      const x = axis0 + step * stepX;
      const h = 10 + (step % 4) * 3;
      marks += '<line x1="' + x.toFixed(1) + '" y1="' + (y + 8) + '" x2="' + x.toFixed(1) + '" y2="' + (y + 8 - h) + '" stroke="' + (index === 0 ? HERO : DATA) + '" stroke-width="2.2"/>';
    }
    const parts = labelParts(item.name);
    const name = parts.map((line, lineIndex) => text(nameX, y + lineIndex * 22 - (parts.length > 1 ? 6 : 0), line, 'font-size="18" font-weight="700" fill="' + LAB + '" text-anchor="end"')).join("");
    return name + '<line x1="' + axis0 + '" y1="' + (y + 8) + '" x2="' + axis1 + '" y2="' + (y + 8) + '" stroke="' + GRID + '" stroke-width=".7"/>' + marks + text(valueX, y + 4, formatNum(item.value) + unit, 'font-size="18" font-weight="800" fill="' + TXT + '" text-anchor="end"');
  }).join("");
  return '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="对照">' + body + "</svg>";
};
const headSlices = (rows, limit = 4) => {
  const sorted = (rows || []).filter((item) => Number(item.value || item.count) > 0).sort((a, b) => Number(b.value || b.count) - Number(a.value || a.count));
  if (sorted.length < 2) return [];
  const capped = sorted.length > limit ? sorted.slice(0, limit - 1) : sorted;
  const slices = capped.map((item) => ({ name: item.name, count: Number(item.value || item.count) }));
  if (sorted.length > limit) slices.push({ name: "其他", count: sorted.slice(limit - 1).reduce((sum, item) => sum + Number(item.value || item.count), 0) });
  return slices;
};
const seriesLine = (title, claim, names, values) => {
  const points = (names || []).map((name, index) => ({ name: String(name), current: Number(values?.[index]) || 0, previous: null })).filter((item) => item.name);
  return points.length >= 2 ? { title, claim, points } : null;
};
const pairLine = (title, claim, points) => (points || []).length >= 2 ? { title, claim, points } : null;
const heatOf = (points, worst) => (points || []).some((item) => finite(item.previous)) ? { worst, claim: "点下是比率。虚线圈圈出本期最差的一项。", items: points.map((item) => ({ name: item.name, previous: item.previous, current: item.current, ytd: item.ytd ?? null })) } : null;
const rankedOf = (items, unit, worstHigh) => {
  const sorted = [...(items || [])].filter((item) => item && item.name && Number.isFinite(Number(item.value ?? item.current))).sort((a, b) => worstHigh ? Number(b.value ?? b.current) - Number(a.value ?? a.current) : Number(a.value ?? a.current) - Number(b.value ?? b.current));
  const top = sorted.slice(0, 3);
  const focus = sorted.find((item) => item.focus || /第\d+\/\d+名/.test(String(item.name || "")));
  const picked = focus && !top.includes(focus) ? [...top, focus] : top;
  return picked.map((item) => ({ badge: formatNum(item.value ?? item.current) + unit, name: item.name, detail: item.detail || (finite(item.previous) ? "上期 " + formatNum(item.previous) + unit : "") }));
};
const kpisFrom = (list) => list.filter((item) => item && item.value != null && item.value !== "");
const firstTrend = (figures) => {
  const trends = figures.filter((chart) => /月度|周度|趋势/.test(chart.title));
  return [/问题/, /比例/, /不良/, /告警/, /密度/, /趋势/].map((pattern) => trends.find((chart) => pattern.test(chart.title))).find(Boolean) || trends[0] || null;
};
const asPoints = (chart) => {
  if (!chart) return [];
  if (chart.kind === "line") return chart.points || [];
  if (chart.line && (chart.categories || []).length >= 2) return chart.categories.map((name, index) => ({ name, current: Number(chart.line[index]) || 0, previous: null }));
  if (chart.kind === "combo") return (chart.categories || []).map((name, index) => ({ name, current: Number(chart.bars?.[index]) || 0, previous: null }));
  if (chart.kind === "bars") return (chart.rows || []).map((row) => ({ name: row.name, current: Number(row.value) || 0, previous: null }));
  return [];
};
const figurePool = (visualSpec) => (visualSpec?.figures || []).flatMap((figure) => chartsFromFigure(figure));
const slotsFromFigures = (source, visualSpec) => {
  const figures = figurePool(visualSpec);
  const trends = figures.filter((chart) => /月度|周度|趋势/.test(chart.title));
  const lines = trends.map((chart) => ({ title: chart.title, claim: "", points: asPoints(chart) })).filter((chart) => chart.points.length >= 2);
  const used = new Set(trends.map((chart) => chart.title));
  const compositions = figures.filter((chart) => !used.has(chart.title) && /构成|Pareto|帕累托|分类|原因/.test(chart.title));
  compositions.forEach((chart) => used.add(chart.title));
  const ranks = figures.filter((chart) => !used.has(chart.title) && chart.kind === "bars" && !/月度|周度/.test(chart.title));
  const donuts = compositions.map((chart) => {
    const items = chart.kind === "bars" ? chart.rows : (chart.categories || []).map((name, index) => ({ name, value: Number(chart.bars?.[index]) || 0 }));
    const rows = headSlices(items);
    return rows.length >= 2 ? { title: chart.title, claim: "同一类构成排在一起，只留最大的几块。", rows } : null;
  }).filter(Boolean);
  const rowSets = ranks.map((chart) => ({ title: chart.title, unit: chart.unit || "", items: pinSubjectRows(chart.rows || [], 8) })).filter((chart) => chart.items.length >= 2);
  const rate = grabNumber(source, /([\d.]+)%/);
  const rankItems = rowSets[0]?.items || [];
  return {
    layout: "role",
    line: null,
    lines,
    linesTitle: "走势",
    heat: null,
    donut: donuts[0] || null,
    donuts,
    kpis: kpisFrom([{ value: rate ? rate + "%" : "", note: "", label: "报告中的比率" }]),
    rows: rowSets[0] || null,
    rowSets,
    ranked: rankedOf(rankItems, rowSets[0]?.unit || "", true),
    rankedTitle: "最靠前的三项",
  };
};
const monthlyRateLines = (cells) => (cells || []).map((cell) => seriesLine(cell.label || cell.name, "", (cell.rows || []).map((row) => row.month), (cell.rows || []).map((row) => row.rate))).filter((item) => item && item.points.length >= 2);
const iqcSlots = (source, snapshot) => {
  const pool = [];
  snapshotCharts(snapshot).forEach((chart) => pushChart(pool, chart));
  proseCharts(source).forEach((chart) => pushChart(pool, chart));
  const comparison = comparisonChart(pool);
  const points = comparison?.points || [];
  if (points.length < 2) return null;
  const defects = pool.find((chart) => chart.title === "缺陷");
  const composition = compositionOf(snapshot, source, points.map((item) => item.name));
  const inspected = grabNumber(source, /检验\s*(\d+)\s*批/);
  const bad = grabNumber(source, /不合格\s*(\d+)\s*批/);
  const rate = grabNumber(source, /不合格率\s*([\d.]+)%/);
  const previous = grabNumber(source, /上月(?:不合格率)?为?\s*([\d.]+)%/);
  return {
    layout: "compare",
    lines: monthlyRateLines(snapshot?.data?.iqcSplit?.cellMonthly),
    linesTitle: "四格月度",
    line: { title: "四格不合格率", claim: moveClaim(points, "不合格率" + source), points },
    heat: heatOf(points, "high"),
    donut: composition ? { claim: composition.claim, rows: composition.rows } : null,
    kpis: kpisFrom([
      { value: inspected, note: bad ? "不合格 " + bad + " 批" : "", label: "检验批次" },
      { value: rate ? rate + "%" : "", note: previous ? "上期 " + previous + "%" : "", label: "不合格率" },
    ]),
    rows: defects ? { title: "点名缺陷", unit: "批", items: defects.rows } : null,
    ranked: rankedOf(points, "%", true),
    rankedTitle: "本期最高的三格",
  };
};
const ipqcSlots = (snapshot) => {
  const split = snapshot?.data?.ipqcSplit;
  if (!split) return null;
  const cells = (split.cells || []).filter((item) => item.rate != null);
  let line = null;
  let heat = null;
  if (cells.length >= 2) {
    const points = cells.map((item) => ({ name: item.name, current: Number(item.rate), previous: item.previousRate == null ? null : Number(item.previousRate) }));
    line = pairLine("四格异常密度", moveClaim(points, "异常密度"), points);
    heat = heatOf(points, "high");
  }
  const monthLines = monthlyRateLines(split.cellMonthly);
  const badRows = cells.filter((item) => Number(item.bad) > 0);
  const donut = badRows.length >= 2 && badRows.length === cells.length ? { claim: "圆圈按异常数，不按密度。", rows: badRows.map((item) => ({ name: item.name, count: Number(item.bad) })) } : null;
  const managers = (split.managers || []).filter((item) => item.rate != null).sort((a, b) => Number(b.rate) - Number(a.rate));
  if (!line && !monthLines.length && managers.length < 2) return null;
  return {
    layout: "compare",
    lines: monthLines,
    linesTitle: "四格月度",
    line, heat, donut,
    kpis: kpisFrom([{ value: split.totals?.inspected ?? "", note: split.totals?.bad != null ? "异常 " + split.totals.bad : "", label: "送检" }, { value: split.totals?.rate != null ? split.totals.rate + "%" : "", note: "", label: "异常密度" }]),
    rows: managers.length >= 2 ? { title: "交付经理", unit: "%", items: managers.slice(0, 6).map((item) => ({ name: item.name, value: Number(item.rate) })) } : null,
    ranked: rankedOf(managers.map((item) => ({ name: item.name, value: item.rate })), "%", true),
    rankedTitle: "异常密度最高",
  };
};
const monthLabel = (value) => {
  const text = String(value ?? "");
  if (/月/.test(text)) return text;
  const match = text.match(/(?:^|-)(\d{1,2})$/);
  return match ? Number(match[1]) + "月" : text;
};
const dqaSlots = (snapshot, visualSpec) => {
  const split = snapshot?.data?.dqaSplit;
  const monthly = (split?.partMonthly || []).filter((item) => item.ecnRate != null || item.nonBomRate != null);
  const ecnLine = monthly.filter((item) => item.ecnRate != null).length >= 2
    ? seriesLine("ECN加工件比例", "", monthly.map((item) => monthLabel(item.month)), monthly.map((item) => item.ecnRate))
    : null;
  const nonBomLine = monthly.filter((item) => item.nonBomRate != null).length >= 2
    ? seriesLine("非BOM加工件比例", "", monthly.map((item) => monthLabel(item.month)), monthly.map((item) => item.nonBomRate))
    : null;
  const figureLines = figurePool(visualSpec).filter((chart) => /月度|周度|趋势/.test(chart.title)).map((chart) => ({ title: chart.title, claim: "", points: asPoints(chart) })).filter((chart) => chart.points.length >= 2);
  const lines = [ecnLine, nonBomLine, ...figureLines].filter((chart, index, list) => chart && list.findIndex((item) => item.title === chart.title) === index);
  const categories = headSlices((split?.categories || []).map((item) => ({ name: item.name, value: item.count })));
  const reasons = headSlices((split?.reasons || []).map((item) => ({ name: item.name, value: item.count })));
  const donuts = [
    categories.length >= 2 ? { title: "问题分类", rows: categories } : null,
    reasons.length >= 2 ? { title: "ECN变更原因", rows: reasons } : null,
  ].filter(Boolean);
  const tpms = (split?.tpms || []).filter((item) => item.name);
  const tpmName = (item) => (item.division ? String(item.division).replace("事业部", "") + " · " : "") + item.name;
  const rowSets = [
    { title: "TPM ECN加工件比例", unit: "%", items: tpms.filter((item) => item.ecnMachinedRate != null).map((item) => ({ name: tpmName(item), value: item.ecnMachinedRate })) },
    { title: "TPM 非BOM加工件比例", unit: "%", items: tpms.filter((item) => item.nonBomMachinedRate != null).map((item) => ({ name: tpmName(item), value: item.nonBomMachinedRate })) },
    { title: "TPM 研发问题", unit: "", items: tpms.filter((item) => Number(item.issues) > 0).map((item) => ({ name: tpmName(item), value: item.issues })) },
  ].filter((item) => item.items.length >= 2);
  if (!lines.length && !donuts.length && !rowSets.length) return null;
  return {
    layout: "trend",
    line: null,
    lines,
    linesTitle: "走势",
    heat: null,
    donut: donuts[0] || null,
    donuts,
    kpis: kpisFrom([
      { value: split?.totals?.issues ?? "", note: split?.totals?.previousIssues != null ? "上期 " + split.totals.previousIssues : "", label: "研发问题" },
      { value: split?.totals?.reviews ?? "", note: split?.totals?.suggestions != null ? "有效项 " + split.totals.suggestions : "", label: "设计评审" },
      { value: split?.totals?.ecnRate != null ? split.totals.ecnRate + "%" : "", note: "", label: "ECN比例" },
    ]),
    rows: rowSets[0] || null,
    rowSets,
    ranked: [],
    rankedTitle: "",
  };
};
const qmsSlots = (snapshot) => {
  const split = snapshot?.data?.qmsSplit;
  if (!split) return null;
  const periods = (split.periods || []).filter((item) => item.lowRate != null || item.avg != null);
  const line = periods.length >= 2 ? seriesLine("低分率", "半年一个点。纵轴按低分率的实际高低。", periods.map((item) => item.label || item.name), periods.map((item) => item.lowRate)) : null;
  const divisions = (split.divisions || []).filter((item) => item.lowRate != null || item.avg != null);
  const points = divisions.map((item) => ({ name: item.name, current: Number(item.lowRate), previous: item.previousLowRate == null ? null : Number(item.previousLowRate) }));
  const themes = headSlices((split.themes || []).map((item) => ({ name: item.name, value: item.count })));
  if (!line && points.length < 2 && themes.length < 2) return null;
  return {
    layout: "survey",
    line: line || pairLine("产品部低分率", moveClaim(points, "低分率"), points),
    heat: heatOf(points, "high"),
    donut: themes.length >= 2 ? { claim: "客户意见只留最多的几类。", rows: themes } : null,
    kpis: kpisFrom([
      { value: split.current?.avg ?? "", note: "", label: "平均分" },
      { value: split.current?.lowRate != null ? split.current.lowRate + "%" : "", note: split.current?.lowCount != null ? "低分 " + split.current.lowCount : "", label: "低分率" },
      { value: split.current?.samples ?? "", note: "", label: "问卷" },
    ]),
    rows: divisions.length >= 2 ? { title: "产品部低分率", unit: "%", items: divisions.map((item) => ({ name: item.name, value: item.lowRate })) } : null,
    ranked: rankedOf(divisions.map((item) => ({ name: item.name, value: item.lowRate })), "%", true),
    rankedTitle: "低分率最高",
  };
};
const doamSlots = (snapshot) => {
  const split = snapshot?.data?.doamSplit;
  if (!split) return null;
  const monthly = (split.monthly || []).filter((item) => item.average != null);
  const line = monthly.length >= 2 ? seriesLine("次/班次", "一条线是次/班次。告警次数不拿来和它画在同一根轴上。", monthly.map((item) => item.month + "月"), monthly.map((item) => item.average)) : null;
  const categories = headSlices((split.categories || []).map((item) => ({ name: item.name, value: item.count })));
  const divisions = (split.divisions || []).filter((item) => item.average != null);
  if (!line && categories.length < 2 && divisions.length < 2) return null;
  return {
    layout: "trend",
    line, heat: null,
    donut: categories.length >= 2 ? { claim: "告警分类只留最多的几类。", rows: categories } : null,
    kpis: kpisFrom([
      { value: split.totals?.alarms ?? "", note: "", label: "告警次数" },
      { value: split.totals?.average ?? "", note: split.totals?.shifts != null ? "班次 " + split.totals.shifts : "", label: "次/班次" },
    ]),
    rows: divisions.length >= 2 ? { title: "产品部次/班次", unit: "", items: divisions.slice(0, 6).map((item) => ({ name: item.name, value: item.average })) } : null,
    ranked: rankedOf(divisions.map((item) => ({ name: item.name, value: item.average })), "", true),
    rankedTitle: "次/班次最高",
  };
};
const usefulSlots = (slots) => Boolean(slots && (slots.line || slots.donut || slots.heat || slots.rows || (slots.kpis || []).some((item) => item.value !== "" && item.value != null) || (slots.ranked || []).length));
const mergeFigures = (picked, figures) => {
  if (!picked) return figures;
  const titled = new Set([picked.line?.title, ...(picked.lines || []).map((item) => item.title), ...(picked.donuts || []).map((item) => item.title), picked.donut?.title, ...(picked.rowSets || []).map((item) => item.title), picked.rows?.title].filter(Boolean));
  const lines = [...(picked.lines || [])];
  const trendIdentity = (title) => String(title || "").replace(/\d{4}年/g, "").replace(/月度趋势|周度趋势/g, "").replace(/\s/g, "");
  const trendKeys = new Set(lines.map((item) => trendIdentity(item.title)).filter(Boolean));
  (figures.lines || []).forEach((item) => {
    const key = trendIdentity(item.title);
    if (!item?.title || titled.has(item.title) || (key && trendKeys.has(key))) return;
    lines.push(item);
    titled.add(item.title);
    if (key) trendKeys.add(key);
  });
  const donuts = [...(picked.donuts || []), ...(picked.donut && !picked.donuts ? [picked.donut] : [])];
  (figures.donuts || []).forEach((item) => { if (item?.title && !titled.has(item.title)) { donuts.push(item); titled.add(item.title); } });
  const rowSets = [...(picked.rowSets || []), ...(picked.rows && !(picked.rowSets || []).some((item) => item.title === picked.rows.title) ? [picked.rows] : [])];
  (figures.rowSets || []).forEach((item) => { if (item?.title && !titled.has(item.title)) { rowSets.push(item); titled.add(item.title); } });
  return { ...picked, lines, donuts, donut: donuts[0] || picked.donut || null, rowSets, rows: rowSets[0] || picked.rows || null };
};
const chooseSlots = (source, { module, snapshot, visualSpec }) => {
  const mod = String(module || "");
  const text = String(source || "");
  const figures = slotsFromFigures(text, visualSpec);
  const picked = mod === "IQC" || /四格结果|加工件来料/.test(text) ? iqcSlots(text, snapshot)
    : mod === "IPQC" ? ipqcSlots(snapshot)
    : mod === "DQA" ? dqaSlots(snapshot, visualSpec)
    : mod === "QMS" ? qmsSlots(snapshot)
    : mod === "DOAM" ? doamSlots(snapshot)
    : null;
  if (!usefulSlots(picked)) return figures;
  return mergeFigures(picked, figures);
};
const readerClaim = (text) => /纵轴|只画|不拉到|不固定|开方|柱顶|柱形是|折线是|实心是|空心是|点下是|虚线圈|圆圈按|一格|数字在点外|数字是原值|半年一个点|同一类|不再拆|不再逐张|发丝|次坐标|柱高|只留这一条|只留构成|只留最大|只比这几格|点下的数字/.test(text || "") ? "" : (text || "");
const block = (title, claim, body, note, first) => '<div class="secthead' + (first ? " first" : "") + '"><span class="line"></span><span class="t">' + escapeHtml(title) + '</span></div>' + (readerClaim(claim) ? '<div class="claim">' + escapeHtml(readerClaim(claim)) + "</div>" : "") + '<div class="fig">' + body + "</div>" + "";
const pair = (title, left, right) => {
  if (left && right) return '<div class="secthead"><span class="line"></span><span class="t">' + escapeHtml(title) + '</span></div><div class="duo"><div>' + left + "</div><div>" + right + "</div></div>";
  return left || right || "";
};
const side = (claim, body, note) => (readerClaim(claim) ? '<div class="claim">' + escapeHtml(readerClaim(claim)) + "</div>" : "") + body + "";
const statsBand = (slots, folded) => {
  const kpis = (slots.kpis || []).filter((item) => item && item.value !== "" && item.value != null);
  const left = kpis.slice(0, 3).map((item) => kpiHtml(item.value, item.note, item.label)).join("");
  const right = kpis.slice(3, 6).map((item) => kpiHtml(item.value, item.note, item.label)).join("");
  const shown = new Set([...(slots.rows?.items || []), ...((slots.rowSets || []).flatMap((item) => item.items || []))].map((item) => item?.name).filter(Boolean));
  const rankedItems = (slots.ranked || []).filter((item) => item?.name && !shown.has(item.name));
  const ranked = rankedItems.length ? '<div class="ranked"><h4>' + escapeHtml(slots.rankedTitle || "最靠前的三项") + "</h4>" + rankedItems.map((item) => '<div class="row"><div class="n">' + escapeHtml(item.badge) + '</div><div class="d"><b>' + escapeHtml(item.name) + "</b>" + (item.detail ? " —— " + escapeHtml(item.detail) : "") + "</div></div>").join("") + "</div>" : "";
  const chartCell = folded ? '<div class="band-chart"><h4>' + escapeHtml(folded.title) + "</h4>" + paint(folded, 2) + "</div>" : "";
  const cells = [];
  if (left) cells.push("<div>" + left + "</div>");
  if (right) cells.push("<div>" + right + "</div>");
  if (chartCell) cells.push(chartCell);
  if (ranked) cells.push(ranked);
  if (!cells.length) return "";
  return '<div class="secthead"><span class="line"></span><span class="t">值得记住的数字</span></div><div class="stats c' + Math.min(4, cells.length) + '">' + cells.join("") + "</div>";
};
const cards = (list, draw) => (list || []).map(draw).filter(Boolean);
const grid = (html) => html.length <= 1 ? (html[0] || "") : '<div class="chart-grid">' + html.join("") + "</div>";
const mini = (title, claim, body, note) => '<div><div class="claim">' + escapeHtml(title || "") + "</div>" + (readerClaim(claim) ? '<div class="claim">' + escapeHtml(readerClaim(claim)) + "</div>" : "") + body + "" + "</div>";
const maxName = (rows) => Math.max(0, ...(rows || []).map((row) => String(row?.name || "").length));
const addPorcelainItem = (items, title, svg, extra = {}) => {
  if (!title || !svg || items.some((item) => item.title === title)) return;
  items.push({
    title,
    svg,
    family: extra.family || chartFamily(title),
    count: extra.count || 0,
    nameLen: extra.nameLen || 0,
    boxWidth: extra.boxWidth || Number((String(svg).match(/viewBox="0 0 (\d+)/) || [])[1]) || 0,
    rowSize: extra.rowSize || 0,
    redraw: extra.redraw || null,
  });
};
const collectPorcelainItems = (slots) => {
  const items = [];
  if (slots.line?.points?.length >= 2) {
    addPorcelainItem(items, slots.line.title || "走势", lineChart(slots.line.points, { label: slots.line.title }), {
      family: "trend",
      count: slots.line.points.length,
      nameLen: maxName(slots.line.points),
      rowSize: 1,
    });
  }
  (slots.lines || []).forEach((chart) => {
    if (!chart?.points || chart.points.length < 2) return;
    addPorcelainItem(items, chart.title || "走势", lineChart(chart.points, { label: chart.title }), {
      family: "trend",
      count: chart.points.length,
      nameLen: maxName(chart.points),
    });
  });
  if (slots.heat?.items?.length) {
    const svg = heatChart(slots.heat.items, { worst: slots.heat.worst || "low" });
    addPorcelainItem(items, slots.heat.title || "比率对照", svg, {
      family: "rate",
      count: slots.heat.items.length,
      nameLen: maxName(slots.heat.items),
      rowSize: slots.heat.items.length > 4 ? 1 : 0,
    });
  }
  const donuts = slots.donuts?.length ? slots.donuts : (slots.donut ? [slots.donut] : []);
  donuts.forEach((item) => {
    const rows = item.rows || [];
    const total = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
    addPorcelainItem(items, item.title || "构成", donutChart(rows, total), {
      family: "compose",
      count: rows.length,
      nameLen: maxName(rows),
    });
  });
  const ranks = slots.rowSets?.length ? slots.rowSets : (slots.rows ? [slots.rows] : []);
  ranks.forEach((item) => {
    const draw = (span) => tickRows(item.items, item.unit || "", span);
    addPorcelainItem(items, item.title || "对照", draw(2), {
      family: chartFamily(item.title || "对照"),
      count: (item.items || []).length,
      nameLen: maxName(item.items),
      boxWidth: 460,
      redraw: draw,
    });
  });
  return items;
};
const paint = (item, count) => item.redraw ? item.redraw(count) : item.svg;
const wideTrend = (item) => item?.family === "trend" && (Number(item.count) || 0) > 5;
const composePorcelain = (items) => {
  const ready = (items || []).filter(Boolean);
  if (!ready.length) return { rows: [], folded: null };
  const rows = [{ size: 1, items: [ready[0]], hero: true }];
  const rest = ready.slice(1);
  let folded = null;
  if (rest.length && !wideTrend(rest[rest.length - 1]) && rest[rest.length - 1].title !== "点名缺陷") folded = rest.pop();
  const groups = [];
  const fullRow = (item) => item?.title === "点名缺陷" || (item?.nameLen || 0) > 10;
for (let index = 0; index < rest.length; index += 1) {
  if (fullRow(rest[index]) || !rest[index + 1] || fullRow(rest[index + 1])) { groups.push([rest[index]]); continue; }
  groups.push([rest[index], rest[index + 1]]);
  index += 1;
}
  if (groups.length && groups[groups.length - 1].length === 1 && groups[groups.length - 1][0].title !== "点名缺陷" && groups.length >= 2 && groups[groups.length - 2].length < 3) {
    groups[groups.length - 2].push(groups.pop()[0]);
  }
  groups.forEach((group) => rows.push({ size: group.length, items: group }));
  return { rows, folded };
};
const porcelainRow = (row, index) => {
  const count = row.items.length;
  if (count <= 1) {
    const item = row.items[0];
    return '<div class="secthead' + (index === 0 ? " first" : "") + '"><span class="line"></span><span class="t">' + escapeHtml(item.title) + '</span></div><div class="fig solo' + (index === 0 ? " hero" : "") + '">' + paint(item, 1) + "</div>";
  }
  return '<div class="chart-row c' + count + '">' + row.items.map((item) => '<div class="cell"><div class="claim">' + escapeHtml(item.title) + '</div><div class="fig">' + paint(item, count) + "</div></div>").join("") + "</div>";
};
const renderPoster = (source, options) => {
  const title = String(source || "").match(/^#\s+(.+)$/m)?.[1]?.trim() || options.module || "质量报告";
  const period = String(source || "").match(/统计(?:周期|区间)：([^\n]+)/)?.[1] || "";
  const slots = chooseSlots(source, options) || {};
  const composed = composePorcelain(collectPorcelainItems(slots));
  const charts = composed.rows.map(porcelainRow).join("");
  const stats = statsBand(slots, composed.folded);
  const actions = actionHtml(source);
  const personal = String(options.module || "").startsWith("角色报告");
  const spine = personal ? title : spineTitle(title, options.module);
  const spineSize = personal ? 18 : 28;
  const head = personal
    ? '<div class="tophead personal-title"><span class="site">' + escapeHtml(title) + "</span></div>"
    : '<div class="tophead"><span class="site">QMS</span><span class="sep">|</span><span class="tag">' + escapeHtml(period || options.module || "") + "</span></div>";
  return '<div class="porcelain-wrap report-publisher"><div class="sheet"><div class="spine"><div class="t' + (personal ? " is-personal" : "") + '" style="font-size:' + spineSize + 'px">' + escapeHtml(spine) + '</div><div class="b">QMS</div></div><div class="content">' + head + charts + stats + (actions ? '<div class="sheet-action">' + actions + "</div>" : "") + '<div class="foot"><span>' + escapeHtml(title) + "</span></div></div></div></div>";
};
export const renderDataSheet = (content, options = {}) => renderPoster(String(content || ""), options);
