import { cardMeta, chartFamily, closingTitle, packBasicsRows } from "./reportSheetLayout.js";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
const finite = (value) => Number.isFinite(Number(value));
const num = (value) => finite(value) ? Number(value) : null;
const rateLabel = (value) => num(value) == null ? "" : String(num(value)).replace(/\.0$/, "") + "%";
const worseHigh = (title) => !/5分|五分|平均分|达标/.test(String(title || ""));

const css = `
.basics-wrap{background:#F0EFEB;color:#1C1C1A;font-family:Inter,"Noto Sans SC","Microsoft YaHei",sans-serif;padding:28px 8px 48px}
.basics-wrap .page{max-width:1100px;margin:0 auto}
.basics-wrap h1{font-size:22px;font-weight:800;letter-spacing:-.02em}
.basics-wrap .sub{margin-top:6px;font-size:13px;line-height:1.7;color:#8F8E88}
.basics-wrap .judge{margin-top:10px;font-size:16px;font-weight:700;line-height:1.6}
.basics-wrap .rows{display:flex;flex-direction:column;gap:22px;margin-top:22px}
.basics-wrap .row{display:grid;gap:22px;align-items:stretch}
.basics-wrap .row.c1{grid-template-columns:minmax(0,1fr)}
.basics-wrap .row.c2{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.basics-wrap .row.c3{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)}
.basics-wrap .card{border-radius:24px;padding:24px 22px 18px;min-width:0}
.basics-wrap h2{font-size:16.5px;font-weight:700;letter-spacing:-.02em;margin-bottom:14px}
.basics-wrap svg{width:100%;height:auto;max-width:100%;max-height:300px;display:block;margin:0 auto;cursor:pointer}
.basics-wrap .row.c1 svg{max-height:360px}
.basics-wrap .row.c2 svg{max-height:280px}
.basics-wrap .row.c3 svg{max-height:210px}
.basics-wrap svg text{font-family:Inter,"Noto Sans SC","Microsoft YaHei",sans-serif}
.basics-wrap .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.basics-wrap .kpis b{display:block;font-size:28px;font-weight:800;letter-spacing:-.03em;line-height:1}
.basics-wrap .kpis span{display:block;margin-top:8px;font-size:12px;color:#8F8E88}
.basics-wrap .note{margin-top:12px;font-size:12px;line-height:1.7;color:#8F8E88}
.basics-wrap table{width:100%;border-collapse:collapse}
.basics-wrap th,.basics-wrap td{text-align:left;vertical-align:top;font-size:13px;line-height:1.65;padding:10px 14px 10px 0;border-bottom:1px solid #DEDDD6}
.basics-wrap th{font-size:12px;color:#8F8E88;font-weight:700}
.basics-wrap svg .fade{animation:basicsFade .7s ease both}
@keyframes basicsFade{from{opacity:0}}
.basics-tip{position:fixed;z-index:8;max-width:280px;padding:6px 8px;background:#F0EFEB;color:#1C1C1A;border:1px solid #1C1C1A;font:700 14px/1.4 Inter,"Noto Sans SC","Microsoft YaHei",sans-serif;pointer-events:none}
@media(max-width:800px){.basics-wrap .row.c2,.basics-wrap .row.c3,.basics-wrap .kpis{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.basics-wrap svg .fade{animation:none}}
`;

const card = (title, body, cols = 0, meta = {}) => {
  const hint = cols === true ? 1 : cols === false ? 2 : (cols === 2 || cols === 3 ? cols : (cols === 1 ? 1 : 0));
  const family = meta.family || chartFamily(title);
  const count = Number(meta.count) || 0;
  const nameLen = Number(meta.nameLen) || 0;
  const kind = meta.kind || "chart";
  return `<div class="card" data-kind="${kind}" data-family="${family}" data-hint="${hint}" data-count="${count}" data-namelen="${nameLen}"><h2>${escapeHtml(title)}</h2>${body}</div>`;
};
const packChartRows = (htmlCards) => {
  const seen = new Set();
  const charts = [];
  const totals = [];
  htmlCards.filter(Boolean).forEach((html) => {
    if (/data-kind="kpi"/.test(html)) totals.push(html);
    else charts.push(html);
  });
  const items = charts.map(cardMeta).filter((item) => {
    const key = item.title || item.html.slice(0, 48);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rows = packBasicsRows(items).map((row, index) => `<div class="row c${Math.min(3, Math.max(1, row.items.length))}${index === 0 ? " hero" : ""}">${row.items.map((item) => item.html).join("")}</div>`).join("");
  const kpi = totals.length ? `<div class="row c1 kpi">${totals.join("")}</div>` : "";
  return rows + kpi;
};
const svgOpen = (width, height, label) => `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}">`;
const text = (x, y, value, extra = "") => `<text x="${x}" y="${y}" ${extra}>${escapeHtml(value)}</text>`;
const tip = (value) => `<title>${escapeHtml(value)}</title>`;

const axisOf = (values) => {
  const nums = values.map(num).filter((value) => value != null);
  if (!nums.length) return { min: 0, max: 1 };
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  const pad = Math.max(high - low < 0.05 ? 0.2 : (high - low) * 0.18, high <= 20 ? 0.3 : 1);
  let min = low - pad;
  let max = high + pad;
  if (low >= 0 && min < 0) min = 0;
  if (high <= 100 && low >= 40 && max > 100) max = 100;
  return { min: Number(min.toFixed(2)), max: Number(max.toFixed(2)) };
};
const ticksOf = (min, max) => {
  const span = max - min || 1;
  const step = span <= 6 ? 1 : span <= 16 ? 2 : span <= 40 ? 5 : 10;
  const ticks = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step / 10; value += step) ticks.push(Number(value.toFixed(1)));
  return ticks.length >= 2 ? ticks : [Number(min.toFixed(1)), Number(max.toFixed(1))];
};

const dumbbell = (rows, { unit = "%", higherWorse = true } = {}) => {
  const ready = rows.filter((row) => row.name && num(row.after) != null).slice().sort((a, b) => higherWorse ? num(b.after) - num(a.after) : num(a.after) - num(b.after));
  if (ready.length < 2) return "";
  const values = ready.flatMap((row) => [row.before, row.after]).filter((value) => num(value) != null);
  const axis = axisOf(values);
  const nameW = Math.min(220, Math.max(108, ...ready.map((row) => String(row.name).length * 14)));
  const plot = 420;
  const x0 = nameW + 12;
  const x1 = x0 + plot;
  const width = x1 + 20;
  const top = 36;
  const step = 40;
  const height = top + ready.length * step + 36;
  const map = (value) => x0 + (num(value) - axis.min) / (axis.max - axis.min || 1) * (x1 - x0);
  const body = ready.map((row) => {
    const y = top + ready.indexOf(row) * step;
    const afterX = map(row.after);
    const beforeX = num(row.before) == null ? null : map(row.before);
    const afterText = unit === "%" ? rateLabel(row.after) : String(row.after);
    const beforeText = num(row.before) == null ? "" : (unit === "%" ? rateLabel(row.before) : String(row.before));
    const close = beforeX != null && Math.abs(afterX - beforeX) < 72;
    const labels = close
      ? text((beforeX + afterX) / 2, y - 12, beforeText + "→" + afterText, 'font-size="13" font-weight="800" text-anchor="middle" class="fade"')
      : text(afterX, y - 12, afterText, 'font-size="15" font-weight="800" text-anchor="middle" class="fade"') + (beforeX == null ? "" : text(beforeX, y - 12, beforeText, 'font-size="12" font-weight="700" fill="#8F8E88" text-anchor="middle" class="fade"'));
    const link = beforeX == null ? "" : `<line x1="${beforeX}" y1="${y}" x2="${afterX}" y2="${y}" stroke="#1C1C1A" stroke-width="1.2" class="fade"/>`;
    const hollow = beforeX == null ? "" : `<circle cx="${beforeX}" cy="${y}" r="5" fill="#F0EFEB" stroke="#1C1C1A" stroke-width="1.5" class="fade">${tip(row.name + " 上期 " + beforeText)}</circle>`;
    return text(x0 - 12, y + 4, row.name, 'font-size="14" font-weight="700" fill="#6A6963" text-anchor="end" class="fade"')
      + `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#E3E2DB" stroke-width=".8"/>`
      + link + hollow
      + `<circle cx="${afterX}" cy="${y}" r="5.6" fill="#1C1C1A" class="fade">${tip(row.name + " 本期 " + afterText)}</circle>`
      + labels;
  }).join("");
  const axisY = top + ready.length * step + 8;
  const ticks = ticksOf(axis.min, axis.max).map((tick) => {
    const x = map(tick);
    const label = unit === "%" ? tick + "%" : String(tick);
    return `<line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 5}" stroke="#DEDDD6"/>${text(x, axisY + 20, label, 'font-size="12" font-weight="600" fill="#8F8E88" text-anchor="middle"')}`;
  }).join("");
  return svgOpen(width, height, "对照") + body + `<line x1="${x0}" y1="${axisY}" x2="${x1}" y2="${axisY}" stroke="#DEDDD6"/>` + ticks + "</svg>";
};

const tickRows = (rows) => {
  const ready = rows.filter((row) => row.name && num(row.value) > 0).sort((a, b) => num(b.value) - num(a.value));
  if (ready.length < 2 || Math.max(...ready.map((row) => num(row.value))) > 80) return "";
  const x0 = 176;
  const px = Math.min(6, Math.max(3.2, 280 / Math.max(...ready.map((row) => num(row.value)))));
  const step = ready.length > 4 ? 32 : 52;
  const height = 24 + ready.length * step;
  const body = ready.map((row, index) => {
    const y = 28 + index * step;
    const count = num(row.value);
    let marks = "";
    for (let k = 0; k < count; k += 1) {
      const x = x0 + k * px + px / 2;
      const h = 8 + ((k * 17 + index * 13) % 5);
      marks += `<line x1="${x}" y1="${y + 8}" x2="${x}" y2="${y + 8 - h}" stroke="#1C1C1A" stroke-width=".9" opacity="${(0.55 + ((k + 2) % 5) / 10).toFixed(2)}" class="fade">${k === count - 1 ? tip(row.name + " " + count) : ""}</line>`;
    }
    return text(x0 - 12, y + 4, row.name, 'font-size="13" font-weight="700" fill="#6A6963" text-anchor="end" class="fade"') + marks + text(x0 + count * px + 8, y + 4, String(count), 'font-size="16" font-weight="800" class="fade"');
  }).join("");
  return svgOpen(520, height, "排名") + body + "</svg>";
};

const countBars = (rows, label) => {
  const ready = rows.filter((row) => row.name && num(row.value) != null).sort((a, b) => num(b.value) - num(a.value)).slice(0, 8);
  if (ready.length < 2) return "";
  const max = Math.max(...ready.map((row) => num(row.value)), 1);
  const x0 = Math.min(300, Math.max(150, ...ready.map((row) => String(row.name).length * 14))) + 16;
  const x1 = x0 + 340;
  const width = x1 + 72;
  const step = 40;
  const height = 28 + ready.length * step + 28;
  const map = (value) => x0 + num(value) / max * (x1 - x0);
  const body = ready.map((row, index) => {
    const y = 32 + index * step;
    return text(x0 - 12, y + 4, row.name, 'font-size="14" font-weight="700" fill="#6A6963" text-anchor="end" class="fade"')
      + `<line x1="${x0}" y1="${y}" x2="${map(row.value)}" y2="${y}" stroke="#1C1C1A" stroke-width="8" class="fade">${tip(row.name + " " + row.value + (label || ""))}</line>`
      + text(map(row.value) + 10, y + 4, String(row.value), 'font-size="16" font-weight="800" class="fade"');
  }).join("");
  return svgOpen(width, height, "数量") + body + "</svg>";
};

const pairedRungs = (rows) => {
  const ready = rows.filter((row) => row.name && num(row.left) > 0 && num(row.left) <= 8 && num(row.right) >= 0);
  if (!ready.length) return "";
  const height = 20 + ready.length * 96;
  const body = ready.map((row, index) => {
    const y = 28 + index * 96;
    const lines = [["送检", row.left, "#B0AFA9"], ["不合格", row.right, "#1C1C1A"]].map(([name, count, color], side) => {
      const rowY = y + 28 + side * 32;
      let marks = "";
      for (let k = 0; k < num(count); k += 1) {
        const x = 210 + k * 42;
        marks += `<line x1="${x}" y1="${rowY}" x2="${x + 28}" y2="${rowY}" stroke="${color}" stroke-width="2.2" class="fade">${tip(row.name + " " + name + " " + count + "批")}</line>`;
      }
      return text(188, rowY + 4, name, 'font-size="13" font-weight="700" fill="#6A6963" text-anchor="end" class="fade"') + marks + text(210 + num(count) * 42 + 6, rowY + 4, String(count), `font-size="16" font-weight="800" fill="${color}" class="fade"`);
    }).join("");
    return text(24, y, row.name, 'font-size="15" font-weight="800" class="fade"') + text(736, y, row.rate || "", 'font-size="18" font-weight="800" text-anchor="end" class="fade"') + lines;
  }).join("");
  return svgOpen(760, height, "对照") + body + "</svg>";
};

const hairline = (points, unit = "%") => {
  const ready = points.filter((item) => item.name && num(item.current) != null);
  if (ready.length < 2) return "";
  const axis = axisOf(ready.map((item) => item.current));
  const width = 760;
  const x0 = 48;
  const x1 = 720;
  const top = 28;
  const base = 168;
  const mapX = (index) => x0 + index * ((x1 - x0) / (ready.length - 1));
  const mapY = (value) => base - (num(value) - axis.min) / (axis.max - axis.min || 1) * (base - top);
  const path = ready.map((item, index) => (index ? "L" : "M") + mapX(index) + " " + mapY(item.current)).join(" ");
  const gap = (x1 - x0) / (ready.length - 1);
  const dots = ready.map((item, index) => {
    const x = mapX(index);
    const y = mapY(item.current);
    const show = gap >= 46 || index === 0 || index === ready.length - 1 || num(item.current) === Math.max(...ready.map((row) => num(row.current)));
    return `<circle cx="${x}" cy="${y}" r="4.2" fill="#1C1C1A" class="fade">${tip(item.name + " " + (unit === "%" ? rateLabel(item.current) : item.current))}</circle>`
      + (show ? text(x, base + 22, item.name, 'font-size="12" font-weight="700" fill="#6A6963" text-anchor="middle"') : "");
  }).join("");
  const guides = ticksOf(axis.min, axis.max).map((tick) => {
    const y = mapY(tick);
    return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#DEDDD6"/>${text(x0 - 8, y + 4, unit === "%" ? tick + "%" : String(tick), 'font-size="12" font-weight="600" fill="#8F8E88" text-anchor="end"')}`;
  }).join("");
  return svgOpen(width, 210, "走势") + guides + `<path d="${path}" fill="none" stroke="#1C1C1A" stroke-width="1.6" class="fade"/>` + dots + "</svg>";
};

const multiLine = (series) => {
  const ready = (series || []).map((item) => ({
    name: item.name,
    points: (item.points || []).filter((point) => point.name && num(point.current) != null),
  })).filter((item) => item.points.length >= 2);
  if (!ready.length) return "";
  const months = ready[0].points.map((point) => point.name);
  const values = ready.flatMap((item) => item.points.map((point) => num(point.current)));
  const max = Math.max(...values, 1);
  const width = 760;
  const x0 = 56;
  const x1 = 640;
  const top = 24;
  const base = 168;
  const mapX = (index) => months.length === 1 ? (x0 + x1) / 2 : x0 + index * ((x1 - x0) / (months.length - 1));
  const mapY = (value) => base - num(value) / (max * 1.12) * (base - top);
  const shades = ["#1C1C1A", "#5E5D57", "#8F8E88"];
  const gap = months.length > 1 ? (x1 - x0) / (months.length - 1) : 80;
  const guides = ticksOf(0, max * 1.12).map((tick) => {
    const y = mapY(tick);
    return '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '" stroke="#DEDDD6"/>' + text(x0 - 8, y + 4, String(Math.round(tick)), 'font-size="12" font-weight="600" fill="#8F8E88" text-anchor="end"');
  }).join("");
  const lines = ready.map((item, seriesIndex) => {
    const path = item.points.map((point, index) => (index ? "L" : "M") + mapX(index) + " " + mapY(point.current)).join(" ");
    const last = item.points[item.points.length - 1];
    const shade = shades[seriesIndex % shades.length];
    const dots = item.points.map((point, index) => '<circle cx="' + mapX(index) + '" cy="' + mapY(point.current) + '" r="3.6" fill="' + shade + '" class="fade">' + tip(item.name + " " + point.name + " " + point.current + "项") + "</circle>").join("");
    return '<path d="' + path + '" fill="none" stroke="' + shade + '" stroke-width="' + (seriesIndex === 0 ? 2 : 1.4) + '" class="fade"/>' + dots + text(mapX(item.points.length - 1) + 8, mapY(last.current) + 4, item.name, 'font-size="12" font-weight="700" fill="' + shade + '" class="fade"');
  }).join("");
  const labels = months.map((name, index) => gap >= 42 || index === 0 || index === months.length - 1 ? text(mapX(index), base + 22, name, 'font-size="12" font-weight="700" fill="#6A6963" text-anchor="middle"') : "").join("");
  return svgOpen(width, 210, "研发问题月度") + guides + lines + labels + "</svg>";
};

const monthPoints = (rows, key) => (rows || []).filter((row) => num(row[key]) != null && num(row.count ?? row.inspected ?? row.total ?? 1) !== 0).map((row) => ({ name: monthName(row.month || row.label), current: row[key] }));
const pushMonthly = (cards, cells, key, unit, suffix) => {
  const drawn = [];
  (cells || []).forEach((cell) => {
    const svg = hairline(monthPoints(cell.rows, key), unit);
    if (svg) drawn.push(String(cell.label || cell.name) + suffix + "\0" + svg);
  });
  const span = drawn.length === 3 || drawn.length === 6 ? 3 : drawn.length === 1 ? 1 : 2;
  drawn.forEach((item, index) => {
    const split = item.split("\0");
    const alone = span === 2 && drawn.length % 2 === 1 && index === drawn.length - 1;
    cards.push(card(split[0], split[1], alone ? 1 : span, { family: "trend" }));
  });
};

const kpis = (items) => {
  const ready = items.filter((item) => item && item.value != null && item.value !== "").slice(0, 4);
  if (!ready.length) return "";
  return card("本月合计", `<div class="kpis">${ready.map((item) => `<div><b>${escapeHtml(item.value)}</b><span>${escapeHtml(item.label || "")}</span></div>`).join("")}</div>`, 1, { kind: "kpi" });
};

const actionTitle = (line) => closingTitle(line);
const splitRow = (row) => row.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
const actionHtml = (source) => {
  const lines = String(source || "").split(/\r?\n/);
  const at = lines.findIndex((line) => actionTitle(line));
  if (at < 0) return "";
  let end = lines.length;
  for (let index = at + 1; index < lines.length; index += 1) if (/^#{1,3}\s+/.test(lines[index])) { end = index; break; }
  const block = lines.slice(at + 1, end);
  const title = actionTitle(lines[at]);
  const tableAt = block.findIndex((line) => /^\s*\|/.test(line));
  let header = [];
  let body = [];
  let notes = [];
  if (tableAt >= 0 && block[tableAt + 1] && /^[\s|:-]+$/.test(block[tableAt + 1].trim())) {
    const rows = [];
    let index = tableAt;
    while (index < block.length && /^\s*\|/.test(block[index])) rows.push(block[index].trim()), index += 1;
    header = splitRow(rows[0]);
    body = rows.slice(2).map(splitRow).filter((row) => row.some(Boolean) && !/^[-:]+$/.test(row[0] || ""));
    notes = [...block.slice(0, tableAt), ...block.slice(index)].map((line) => line.trim()).filter((line) => line && !/^\|/.test(line));
  } else {
    notes = block.map((line) => line.trim()).filter(Boolean);
  }
  const table = header.length && body.length
    ? `<table><thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${header.map((_, index) => `<td>${escapeHtml(row[index] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : "";
  const note = notes.length ? notes.map((line) => `<p class="note">${escapeHtml(line)}</p>`).join("") : "";
  if (!table && !note) return "";
  return card(title, note + table, true);
};

const ratePairsFromText = (text, names) => {
  const rows = [];
  const pattern = /由\s*([\d.]+)%\s*(?:升至|降至|到)\s*([\d.]+)%/g;
  let match;
  while ((match = pattern.exec(text))) {
    const before = text.slice(Math.max(0, match.index - 48), match.index);
    const name = names.find((item) => before.includes(item));
    if (!name || rows.some((row) => row.name === name)) continue;
    rows.push({ name, before: Number(match[1]), after: Number(match[2]) });
  }
  return rows;
};
const countPairsFromText = (text, names) => {
  const rows = [];
  const pattern = /由\s*(\d+)\s*批\s*(?:增至|降至|到)\s*(\d+)\s*批/g;
  let match;
  while ((match = pattern.exec(text))) {
    const before = text.slice(Math.max(0, match.index - 48), match.index);
    const name = names.find((item) => before.includes(item));
    if (!name || rows.some((row) => row.name === name)) continue;
    rows.push({ name, before: Number(match[1]), after: Number(match[2]) });
  }
  return rows;
};

const IQC_NAMES = ["杭州供应商", "深圳供应商", "深圳公司加工", "杭州公司加工"];
const iqcCards = (text, split) => {
  const cards = [];
  const cells = (split?.cells || []).filter((cell) => num(cell.rate) != null);
  const rateRows = cells.length >= 2
    ? cells.map((cell) => ({ name: cell.name, before: cell.previousRate, after: cell.rate }))
    : ratePairsFromText(text, IQC_NAMES);
  const rate = dumbbell(rateRows, { higherWorse: true });
  if (rate) cards.push(card("四格不合格率", rate, true));
  const badRows = cells.length >= 2
    ? cells.filter((cell) => num(cell.previousBad) != null).map((cell) => ({ name: cell.name, before: cell.previousBad, after: cell.bad }))
    : countPairsFromText(text, IQC_NAMES);
  const bad = dumbbell(badRows, { unit: "", higherWorse: true });
  if (bad) cards.push(card("不合格批次", bad, true));
  const defectRows = [];
  cells.forEach((cell) => (cell.defects || []).slice(0, cell.name.includes("公司") ? 3 : 1).forEach((item) => defectRows.push({ name: cell.name.replace("公司加工", "加工").replace("供应商", "") + " · " + item.name, value: item.count, company: /公司|加工/.test(cell.name) })));
  if (!defectRows.length) {
    [...text.matchAll(/(深圳供应商|杭州供应商|深圳公司加工|杭州公司加工)[：:]\s*([^，。；\n]+)，\s*(\d+)\s*批/g)].forEach((item) => defectRows.push({ name: item[1].replace("公司加工", "加工").replace("供应商", "") + " · " + item[2].trim(), value: Number(item[3]), company: /公司/.test(item[1]) }));
    [...text.matchAll(/(深圳|杭州)公司加工[\s\S]{0,40}主要缺陷是([^。\n]+)/g)].forEach((item) => {
      [...item[2].matchAll(/([^、，]+)(\d+)\s*批/g)].forEach((part) => defectRows.push({ name: item[1] + " · " + part[1].trim(), value: Number(part[2]), company: true }));
    });
  }
  const supplierTicks = tickRows(defectRows.filter((row) => !row.company));
  const companyTicks = tickRows(defectRows.filter((row) => row.company));
  if (supplierTicks) cards.push(card("供应商缺陷", supplierTicks));
  if (companyTicks) cards.push(card("公司加工缺陷", companyTicks));
  const vendors = (split?.suppliers || []).filter((item) => num(item.inspected) >= 3 && num(item.inspected) <= 8 && num(item.bad) >= 2)
    .map((item) => ({ name: item.name + (item.site ? "（" + item.site + "）" : ""), left: item.inspected, right: item.bad, rate: item.inspected ? rateLabel(item.bad / item.inspected * 100) : "" }));
  if (!vendors.length) {
    [...text.matchAll(/([\u4e00-\u9fa5A-Za-z0-9（）()]{2,24})：送检\s*(\d+)\s*批，不合格\s*(\d+)\s*批，不合格率\s*([\d.]+)%/g)]
      .filter((item) => Number(item[2]) <= 8 && Number(item[3]) >= 2)
      .forEach((item) => vendors.push({ name: item[1], left: Number(item[2]), right: Number(item[3]), rate: item[4] + "%" }));
  }
  const vendorSvg = pairedRungs(vendors.slice(0, 4));
  if (vendorSvg) cards.push(card("供应商", vendorSvg, true));
  const inspected = cells.reduce((sum, cell) => sum + (num(cell.inspected) || 0), 0) || (text.match(/检验\s*(\d+)\s*批/) || [])[1];
  const badTotal = cells.reduce((sum, cell) => sum + (num(cell.bad) || 0), 0) || (text.match(/不合格\s*(\d+)\s*批/) || [])[1];
  const rateText = (text.match(/不合格率\s*([\d.]+)%/) || [])[1];
  const worst = rateRows.slice().sort((a, b) => num(b.after) - num(a.after))[0];
  cards.push(kpis([
    { value: inspected || "", label: "检验批次" },
    { value: badTotal || "", label: "不合格批次" },
    { value: rateText ? rateText + "%" : "", label: "不合格率" },
    worst ? { value: rateLabel(worst.after), label: worst.name } : null,
  ].filter(Boolean)));
    pushMonthly(cards, split?.cellMonthly, "rate", "%", "不合格率");
  const supplierRank = dumbbell((split?.suppliers || []).filter((item) => num(item.inspected) >= 10 && num(item.rate) != null).slice(0, 8).map((item) => ({ name: item.name, after: item.rate })), { higherWorse: true });
  if (supplierRank) cards.push(card("供应商不合格率", supplierRank, 2));
  const shopRank = dumbbell((split?.companyMachining || []).filter((item) => num(item.rate) != null).map((item) => ({ name: (item.site || "") + (item.name || "公司加工"), after: item.rate })), { higherWorse: true });
  if (shopRank) cards.push(card("公司加工不合格率", shopRank, 2));
return cards.filter(Boolean);
};

const ipqcCards = (split) => {
  const cells = (split?.cells || []).filter((item) => num(item.rate) != null);
  const cards = [];
  const rate = dumbbell(cells.map((item) => ({ name: item.name, before: item.previousRate, after: item.rate })), { higherWorse: true });
  if (rate) cards.push(card("四格异常密度", rate, true));
  const managers = (split?.managers || []).filter((item) => num(item.rate) != null).slice(0, 8);
  const managerChart = dumbbell(managers.map((item) => ({ name: item.name, after: item.rate })), { higherWorse: true });
  if (managerChart) cards.push(card("交付经理异常密度", managerChart, 2));
    pushMonthly(cards, split?.cellMonthly, "rate", "%", "异常密度");
  const defects = (split?.cells || []).flatMap((cell) => (cell.defects || []).map((item) => ({ name: cell.name + " · " + (item.name || item), value: item.count || item.value })));
  const defectChart = tickRows(defects) || countBars(defects, "项");
  if (defectChart) cards.push(card("缺陷", defectChart, true));
  const shops = dumbbell((split?.workshops || []).filter((item) => num(item.rate) != null).slice(0, 8).map((item) => ({ name: (item.site || "") + (item.workshop || ""), after: item.rate })), { higherWorse: true });
  if (shops) cards.push(card("工坊异常密度", shops, 2));
return cards;
};

const oqcCards = (split) => {
  const divisions = (split?.divisions || []).filter((item) => num(item.fiveRate) != null);
  const cards = [];
  const five = dumbbell(divisions.map((item) => ({ name: item.name, before: item.previousFiveRate, after: item.fiveRate })), { higherWorse: false });
  if (five) cards.push(card("产品部5分率", five, true));
  const low = dumbbell(divisions.filter((item) => num(item.lowRate) != null).map((item) => ({ name: item.name, before: item.previousLowRate, after: item.lowRate })), { higherWorse: true });
  if (low) cards.push(card("产品部低分率", low, 2));
  
    pushMonthly(cards, split?.divisionMonthly, "fiveRate", "%", "5分率");
  pushMonthly(cards, split?.divisionMonthly, "lowRate", "%", "低分率");
  const byDivision = new Map();
  (split?.tpms || []).forEach((item) => {
    if (num(item.fiveRate) == null || !item.division) return;
    const list = byDivision.get(item.division) || [];
    list.push(item);
    byDivision.set(item.division, list);
  });
  byDivision.forEach((list, name) => {
    const svg = dumbbell(list.map((item) => ({ name: item.name, after: item.fiveRate })), { higherWorse: false });
    if (svg) cards.push(card(name + " TPM 5分率", svg));
  });
  const machines = (split?.machines || []).filter((item) => num(item.count) > 0);
  const machineRate = dumbbell(machines.filter((item) => num(item.fiveRate) != null).map((item) => ({ name: item.name, after: item.fiveRate })), { higherWorse: false });
  if (machineRate) cards.push(card("治具与自动化5分率", machineRate, 2));
  const machineCount = countBars(machines.map((item) => ({ name: item.name, value: item.count })), "台");
  if (machineCount) cards.push(card("治具与自动化数量", machineCount, 2));
return cards;
};

const monthName = (value) => {
  const label = String(value || "");
  return /月$/.test(label) ? label : label + "月";
};
const markdownTable = (source, heading) => {
  const lines = String(source || "").split(/\r?\n/);
  const at = lines.findIndex((line) => /^#{1,3}\s+/.test(line) && line.includes(heading));
  if (at < 0) return null;
  let index = at + 1;
  while (index < lines.length && !/^\s*\|/.test(lines[index])) index += 1;
  if (!/^\s*\|/.test(lines[index] || "")) return null;
  const rows = [];
  while (index < lines.length && /^\s*\|/.test(lines[index])) rows.push(lines[index].trim()), index += 1;
  if (rows.length < 3) return null;
  const cells = (row) => row.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  return { header: cells(rows[0]), body: rows.slice(2).map(cells).filter((row) => row.some(Boolean) && !/^[-:]+$/.test(row[0] || "")) };
};
const columnOf = (header, pattern) => header.findIndex((cell) => pattern.test(cell));
const percentOf = (value) => {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
const dqaFromText = (source) => {
  const divisions = [];
  const pattern = /(FPC事业部|产品五部|半导体&北美)：([\s\S]{0,180}?)ECN加工件比例\s*([\d.]+)%([\s\S]{0,80}?)非BOM加工件比例\s*([\d.]+)%/g;
  let match;
  while ((match = pattern.exec(source))) divisions.push({ name: match[1], ecnMachinedRate: Number(match[3]), nonBomMachinedRate: Number(match[5]) });
  const table = markdownTable(source, "TPM");
  const tpms = [];
  if (table) {
    const nameCol = columnOf(table.header, /^TPM$/);
    const divCol = columnOf(table.header, /产品部/);
    const issueCol = columnOf(table.header, /研发问题/);
    const ecnCol = columnOf(table.header, /ECN加工件比例/);
    const nonBomCol = columnOf(table.header, /非BOM加工件比例/);
    table.body.forEach((row) => {
      const name = row[nameCol] || "";
      if (!name || name === "TPM") return;
      tpms.push({
        name,
        division: row[divCol] || "",
        issues: percentOf(row[issueCol]),
        ecnMachinedRate: percentOf(row[ecnCol]),
        nonBomMachinedRate: percentOf(row[nonBomCol]),
      });
    });
  }
  return { divisions, tpms };
};
const rankedPhrase = (source, label) => {
  const match = String(source || "").match(new RegExp(label + "居前的是：([^。\\n]+)"));
  if (!match) return [];
  return [...match[1].matchAll(/([^，。；\n]{2,40}?)(\d+)\s*项/g)].map((item) => ({ name: item[1].replace(/^[、\s]+/, ""), value: Number(item[2]) })).filter((item) => item.name && item.value > 0);
};
const dqaCards = (source, split) => {
  const parsed = dqaFromText(source);
  const divisions = (split?.divisions || []).some((item) => num(item.ecnMachinedRate) != null) ? split.divisions : parsed.divisions;
  const tpms = (split?.tpms || []).some((item) => num(item.ecnMachinedRate) != null) ? split.tpms : parsed.tpms;
  const cards = [];
  const ecnPart = dumbbell(divisions.filter((item) => num(item.ecnMachinedRate) != null).map((item) => ({ name: item.name, after: item.ecnMachinedRate })), { higherWorse: true });
  if (ecnPart) cards.push(card("产品部 ECN加工件比例", ecnPart, 2));
  const nonBom = dumbbell(divisions.filter((item) => num(item.nonBomMachinedRate) != null).map((item) => ({ name: item.name, after: item.nonBomMachinedRate })), { higherWorse: true });
  if (nonBom) cards.push(card("产品部 非BOM加工件比例", nonBom, 2));
  const issueSeries = (split?.divisionMonthly || []).map((item) => ({
    name: String(item.name || "").replace("事业部", ""),
    points: (item.rows || []).map((row) => ({ name: monthName(row.month), current: row.count })),
  })).filter((item) => item.points.some((point) => num(point.current) > 0));
  const issueLine = multiLine(issueSeries);
  if (issueLine) cards.unshift(card("研发问题月度", issueLine, 1));
  const categories = (split?.categories || []).length ? split.categories.map((item) => ({ name: item.name, value: item.count })) : rankedPhrase(source, "研发问题分类");
  const reasons = (split?.reasons || []).length ? split.reasons.map((item) => ({ name: item.name, value: item.count })) : rankedPhrase(source, "ECN变更原因");
  const categoryChart = countBars(categories, "项");
  const reasonChart = countBars(reasons, "项");
  if (categoryChart) cards.push(card("问题分类", categoryChart, 2));
  if (reasonChart) cards.push(card("ECN变更原因", reasonChart, 2));
  const monthly = (split?.partMonthly || []).filter((item) => num(item.ecnRate) != null || num(item.nonBomRate) != null);
  const ecnLine = hairline(monthly.filter((item) => num(item.ecnRate) != null).map((item) => ({ name: monthName(item.month), current: item.ecnRate })));
  if (ecnLine) cards.push(card("ECN加工件比例", ecnLine, 2));
  const nonBomLine = hairline(monthly.filter((item) => num(item.nonBomRate) != null).map((item) => ({ name: monthName(item.month), current: item.nonBomRate })));
  if (nonBomLine) cards.push(card("非BOM加工件比例", nonBomLine, 2));
  const tpmName = (item) => (item.division ? String(item.division).replace("事业部", "") + " · " : "") + item.name;
  const tpmEcn = dumbbell(tpms.filter((item) => num(item.ecnMachinedRate) != null).map((item) => ({ name: tpmName(item), after: item.ecnMachinedRate })), { higherWorse: true });
  if (tpmEcn) cards.push(card("TPM ECN加工件比例", tpmEcn, 1));
  const tpmNonBom = dumbbell(tpms.filter((item) => num(item.nonBomMachinedRate) != null).map((item) => ({ name: tpmName(item), after: item.nonBomMachinedRate })), { higherWorse: true });
  if (tpmNonBom) cards.push(card("TPM 非BOM加工件比例", tpmNonBom, 1));
  const issues = countBars(tpms.filter((item) => num(item.issues) != null).map((item) => ({ name: tpmName(item), value: item.issues })), "项");
  if (issues) cards.push(card("研发问题数量", issues, true));
  return cards;
};

const qmsCards = (split) => {
  const divisions = (split?.divisions || []).filter((item) => num(item.lowRate) != null);
  const cards = [];
  const low = dumbbell(divisions.map((item) => ({ name: item.name, before: item.previousLowRate, after: item.lowRate })), { higherWorse: true });
  if (low) cards.push(card("产品部低分率", low, true));
  const themes = tickRows((split?.themes || []).map((item) => ({ name: item.name, value: item.count })));
  if (themes) cards.push(card("客户意见", themes));
    const periods = (split?.periods || []).filter((item) => num(item.lowRate) != null || num(item.avg) != null);
  const lowLine = hairline(periods.filter((item) => num(item.lowRate) != null).map((item) => ({ name: item.label || item.name, current: item.lowRate })));
  if (lowLine) cards.push(card("半年低分率", lowLine, 1));
  const avgLine = hairline(periods.filter((item) => num(item.avg) != null).map((item) => ({ name: item.label || item.name, current: item.avg })));
  if (avgLine) cards.push(card("半年平均分", avgLine, 2));
  const dimensions = dumbbell((split?.dimensions || []).filter((item) => num(item.avg) != null).map((item) => ({ name: item.name, after: item.avg })), { higherWorse: false });
  if (dimensions) cards.push(card("维度平均分", dimensions, true));
return cards;
};

const doamCards = (split) => {
  const cards = [];
  const monthly = (split?.monthly || []).filter((item) => num(item.average) != null);
  const line = hairline(monthly.map((item) => ({ name: item.month + "月", current: item.average })), "");
  if (line) cards.push(card("次/班次", line, true));
  const divisions = (split?.divisions || []).filter((item) => num(item.average) != null);
  const rank = dumbbell(divisions.map((item) => ({ name: item.name, after: item.average })), { unit: "", higherWorse: true });
  if (rank) cards.push(card("产品部次/班次", rank, true));
    const categories = countBars((split?.categories || []).map((item) => ({ name: item.name, value: item.count })), "次");
  if (categories) cards.push(card("告警分类", categories, 2));
  const tpms = dumbbell((split?.tpms || []).filter((item) => num(item.average) != null).slice(0, 8).map((item) => ({ name: (item.division ? item.division.replace("事业部", "") + " · " : "") + item.name, after: item.average })), { unit: "", higherWorse: true });
  if (tpms) cards.push(card("TPM 次/班次", tpms, 2));
  const customers = dumbbell((split?.customers || []).filter((item) => num(item.average) != null).slice(0, 8).map((item) => ({ name: item.name, after: item.average })), { unit: "", higherWorse: true });
  if (customers) cards.push(card("客户次/班次", customers, 2));
return cards;
};

const figureCards = (visualSpec) => {
  const figures = visualSpec?.figures || [];
  const cards = [];
  figures.forEach((figure) => {
    const names = (figure.categories || []).map((item) => typeof item === "string" ? item : item?.label || item?.name || "").filter(Boolean);
    const series = Array.isArray(figure.series) ? figure.series : [];
    const rate = series.find((item) => item?.unit === "%" || /率|比例|密度/.test(item?.name || ""));
    const chosen = rate || series[0];
    if (!chosen || names.length < 2) return;
    const values = (chosen.values || []).map(num);
    const title = String(figure.title || chosen.name || "对照");
    const monthly = names.every((name) => /月|W\d|周/.test(name));
    const chart = monthly
      ? hairline(names.map((name, index) => ({ name, current: values[index] })), rate ? "%" : "")
      : (rate ? dumbbell(names.map((name, index) => ({ name, after: values[index] })), { higherWorse: worseHigh(title) }) : (Math.max(...values.filter((value) => value != null), 0) <= 80 ? tickRows(names.map((name, index) => ({ name, value: values[index] }))) : countBars(names.map((name, index) => ({ name, value: values[index] })))));
    if (chart) cards.push(card(title, chart, 0, { count: names.length, nameLen: names.reduce((max, name) => Math.max(max, String(name).length), 0) }));
  });
  return cards;
};

const judgeOf = (text) => {
  const line = String(text || "").split(/\r?\n/).map((item) => item.trim()).find((item) => item && !item.startsWith("#") && !item.startsWith("|") && !item.startsWith("-") && /上升|下降|最高|最低|不在/.test(item) && item.length <= 48);
  return line || "";
};

const cardsFor = (text, module, snapshot, visualSpec) => {
  const mod = String(module || "");
  const data = snapshot?.data || {};
  const title = (String(text || "").match(/^#\s+(.+)$/m) || [])[1] || "";
  if (/角色报告/.test(mod)) return figureCards(visualSpec);
  if (mod === "DQA") return dqaCards(text, data.dqaSplit);
  if (mod === "IQC") return iqcCards(text, data.iqcSplit);
  if (mod === "IPQC") return ipqcCards(data.ipqcSplit).concat(figureCards(visualSpec));
  if (mod === "OQC") return oqcCards(data.oqcSplit).concat(figureCards(visualSpec));
  if (mod === "QMS") return qmsCards(data.qmsSplit).concat(figureCards(visualSpec));
  if (mod === "DOAM") return doamCards(data.doamSplit).concat(figureCards(visualSpec));
  if (/研发质量/.test(title)) return dqaCards(text, data.dqaSplit);
  if (/加工件质量|IQC/.test(title)) return iqcCards(text, data.iqcSplit);
  if (/组装质量|IPQC/.test(title)) return ipqcCards(data.ipqcSplit).concat(figureCards(visualSpec));
  if (/出货评分|OQC/.test(title)) return oqcCards(data.oqcSplit).concat(figureCards(visualSpec));
  if (/客户满意|QMS/.test(title)) return qmsCards(data.qmsSplit).concat(figureCards(visualSpec));
  if (/机台|DOAM/.test(title)) return doamCards(data.doamSplit).concat(figureCards(visualSpec));
  const genericRates = ratePairsFromText(text, [...IQC_NAMES, "半导体&北美", "产品五部", "FPC事业部"]);
  const generic = dumbbell(genericRates, { higherWorse: worseHigh(text) });
  return [generic ? card("比率对照", generic, true) : "", ...figureCards(visualSpec)].filter(Boolean);
};

export const renderBasicsSheet = (content, { module = "质量分析", snapshot = null, visualSpec = null } = {}) => {
  const source = String(content || "");
  const title = source.match(/^#\s+(.+)$/m)?.[1]?.trim() || module || "质量报告";
  const period = (source.match(/统计(?:周期|区间)：([^\n]+)/) || [])[1] || "";
  const judge = judgeOf(source);
  const cards = cardsFor(source, module, snapshot, visualSpec);
  const actions = actionHtml(source);
  return `<div class="basics-wrap report-publisher"><style>${css}</style><div class="page"><h1>${escapeHtml(title)}</h1>${period ? `<p class="sub">${escapeHtml(period)}</p>` : ""}${judge ? `<p class="judge">${escapeHtml(judge)}</p>` : ""}<div class="rows">${packChartRows(cards)}${actions ? `<div class="row c1 action">${actions}</div>` : ""}</div></div></div>`;
};

export const installBasicsInteraction = () => {
  if (typeof document === "undefined" || document.documentElement.dataset.basicsBound) return;
  if (!document.body) return;
  document.documentElement.dataset.basicsBound = "1";
  const tipBox = document.createElement("div");
  tipBox.className = "basics-tip";
  tipBox.hidden = true;
  document.body.appendChild(tipBox);
  const textOf = (target) => target?.closest?.("circle, line")?.querySelector?.("title")?.textContent || "";
  document.addEventListener("click", (event) => {
    const svg = event.target?.closest?.(".basics-wrap svg");
    if (!svg) return;
    svg.querySelectorAll(".fade").forEach((node) => {
      node.style.animation = "none";
      void node.getBoundingClientRect();
      node.style.animation = "";
    });
  });
  document.addEventListener("pointerover", (event) => {
    const value = textOf(event.target);
    if (!value || !event.target?.closest?.(".basics-wrap")) { tipBox.hidden = true; return; }
    tipBox.textContent = value;
    tipBox.hidden = false;
    tipBox.style.left = Math.min(event.clientX + 14, window.innerWidth - 300) + "px";
    tipBox.style.top = Math.min(event.clientY + 16, window.innerHeight - 48) + "px";
  });
  document.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget?.closest?.(".basics-wrap svg")) tipBox.hidden = true;
  });
};
if (typeof document !== "undefined") installBasicsInteraction();
