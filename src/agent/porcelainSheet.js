import { donutChart, heatChart, lineChart, renderDataSheet } from "./porcelainCharts.js";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
const grab = (text, pattern) => {
  const match = String(text || "").match(pattern);
  return match ? match[1] : "";
};
const numberAt = (text, pattern) => {
  const value = grab(text, pattern);
  return value === "" ? null : Number(value);
};
const monthCount = (slice) => {
  const match = String(slice || "").match(/本月(?:出货)?(\d+)台/);
  return match ? Number(match[1]) : null;
};
const ytdRate = (slice) => {
  const match = String(slice || "").match(/累计\d+台，5分率([\d.]+)%/);
  return match ? Number(match[1]) : null;
};
const ratePair = (slice) => {
  const match = String(slice || "").match(/5分率由(?:上月)?\s*([\d.]+)%\s*(?:降至|升至)\s*([\d.]+)%/);
  return match ? { previous: Number(match[1]), current: Number(match[2]) } : null;
};
const directedLow = (slice) => {
  const changed = String(slice || "").match(/低分率由\s*[\d.]+%?\s*(?:升至|降至)\s*([\d.]+)%/);
  if (changed) return Number(changed[1]);
  const plain = String(slice || "").match(/低分率\s*([\d.]+)%/);
  return plain ? Number(plain[1]) : null;
};
const windowsFor = (text, name) => {
  const found = [];
  let at = 0;
  while (at < text.length) {
    const hit = text.indexOf(name, at);
    if (hit < 0) break;
    let end = hit + 180;
    DIVISION_NAMES.forEach((other) => {
      if (other === name) return;
      const nextName = text.indexOf(other, hit + name.length);
      if (nextName >= 0 && nextName < end) end = nextName;
    });
    found.push(text.slice(hit, end));
    at = hit + name.length;
  }
  const bullet = text.indexOf("- " + name);
  if (bullet >= 0) found.push(text.slice(bullet, bullet + 240));
  return found;
};
const DIVISION_NAMES = ["半导体&北美", "产品五部", "FPC事业部"];
export const parseOqcPorcelain = (content) => {
  const text = String(content || "");
  if (!/出货评分/.test(text) || !/产品部/.test(text)) return null;
  const shipped = numberAt(text, /本月出货(\d+)台/);
  const fiveCount = numberAt(text, /5分(\d+)台/);
  const fiveRate = numberAt(text, /5分率([\d.]+)%/);
  const average = numberAt(text, /平均分([\d.]+)/);
  const lowCount = numberAt(text, /低分（[^）]*）(\d+)台/);
  const lowRateValue = numberAt(text, /低分率([\d.]+)%/);
  const ytdShipped = numberAt(text, /累计出货(\d+)台/);
  const ytdFive = numberAt(text, /累计出货\d+台，5分率([\d.]+)%/);
  const ytdAverage = numberAt(text, /累计出货\d+台，5分率[\d.]+%，平均分([\d.]+)/);
  const ytdLow = numberAt(text, /累计出货\d+台，5分率[\d.]+%，平均分[\d.]+，低分率([\d.]+)%/);
  if (shipped == null || fiveRate == null) return null;
  const divisions = DIVISION_NAMES.map((name) => {
    const windows = windowsFor(text, name);
    const rates = windows.map(ratePair).find(Boolean) || { previous: null, current: null };
    const count = windows.map(monthCount).find((value) => value != null) ?? null;
    const low = windows.map(directedLow).find((value) => value != null) ?? null;
    const ytd = windows.map(ytdRate).find((value) => value != null) ?? null;
    return { name, count, ...rates, ytd, low };
  }).filter((item) => item.current != null);
  if (divisions.length < 2) return null;
  const tableActions = [...text.matchAll(/^\|([^|\n]+)\|([^|\n]+)\|([^|\n]+)\|([^|\n]+)\|$/gm)]
    .map((row) => row.slice(1).map((cell) => cell.trim()))
    .filter((row) => row[0] && row[0] !== "对象" && !/^[-:]+$/.test(row[0]));
  const numberedActions = [...text.matchAll(/^\d+\.\s*([^\n]+)$/gm)].map((row) => {
    const line = row[1];
    const object = line.split(/[。]/)[0];
    const metric = (line.match(/指标：([^。]+)/) || [])[1] || "";
    const due = (line.match(/完成时间：([^。]+)/) || [])[1] || "";
    const close = (line.match(/关闭条件：([^。]+)/) || [])[1] || line;
    return [object, metric, due, close];
  });
  return {
    period: grab(text, /统计(?:周期|区间)：([^\n。]+)/) || "所选周期",
    shipped, fiveCount, fiveRate, average, lowCount, lowRate: lowRateValue,
    ytdShipped, ytdFive, ytdAverage, ytdLow, divisions,
    actions: tableActions.length ? tableActions : numberedActions,
    fixture: grab(text, /治具：?([^\n]+)/),
    auto: grab(text, /自动化：?([^\n]+)/),
  };
};

const BG = "rgb(247,242,235)";
const TXT = "rgb(8,31,92)";
const FAINT = "rgba(8,31,92,.32)";
const GRID = "rgba(8,31,92,.16)";
const DATA = "rgb(51,78,172)";
const HERO = "rgb(8,31,92)";
const LAB = "rgba(8,31,92,.72)";
const HEAT = ["rgb(51,78,172)", "rgb(112,150,209)", "rgb(186,214,235)"];
const CAT4 = ["rgb(8,31,92)", "rgb(51,78,172)", "rgb(112,150,209)"];
const text = (x, y, value, extra = "") => `<text x="${x}" y="${y}" ${extra}>${escapeHtml(value)}</text>`;
const rowChart = (data) => {
  const items = [{ name: "公司", value: data.lowRate }, ...data.divisions.map((item) => ({ name: item.name.replace("事业部", "").replace("&北美", ""), value: item.low }))].filter((item) => item.value != null);
  const marks = items.map((item, index) => {
    const y = 24 + index * 38;
    const ticks = Math.max(1, Math.round(item.value / 5));
    let bars = "";
    for (let step = 0; step < ticks; step += 1) {
      const x = 78 + step * 8 + 4;
      bars += `<line x1="${x}" y1="${y + 8}" x2="${x}" y2="${y + 8 - (8 + (step % 3) * 2)}" stroke="${index === 1 ? HERO : DATA}" stroke-width="1.8"/>`;
    }
    return `${text(70, y + 3, item.name, 'font-size="7.5" font-weight="700" fill="' + LAB + '" text-anchor="end"')}<line x1="78" y1="${y + 8}" x2="174" y2="${y + 8}" stroke="${GRID}" stroke-width=".6"/>${bars}${text(78 + ticks * 8 + 8, y + 3, item.value + "%", 'font-size="9" font-weight="800" fill="' + TXT + '"')}`;
  }).join("");
  return `<svg viewBox="0 0 260 190" role="img" aria-label="低分率">${marks}</svg>`;
};

const sheetCss = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Oswald:wght@500;600;700&family=Noto+Sans+SC:wght@400;500;700;900&display=swap");
.porcelain-wrap{background:rgb(247,242,235);color:rgb(8,31,92);font-family:Inter,"Noto Sans SC","Microsoft YaHei",sans-serif;padding:28px 12px 40px}
.porcelain-wrap .sheet{width:1080px;max-width:100%;margin:0 auto;display:grid;grid-template-columns:110px minmax(0,1fr)}
.porcelain-wrap .spine{position:relative;border-right:1px solid rgb(8,31,92);min-height:100%}
.porcelain-wrap{overflow:visible}.porcelain-wrap .sheet{overflow:visible}.porcelain-wrap .spine{overflow:visible}.porcelain-wrap .spine .t{position:absolute;top:0;left:14px;writing-mode:vertical-rl;font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;font-weight:900;font-size:46px;line-height:1.1;letter-spacing:.06em;white-space:nowrap}.porcelain-wrap .spine .t.is-personal{left:2px;width:96px;height:auto;white-space:normal;word-break:keep-all;line-height:1.15;letter-spacing:0;overflow:visible}.porcelain-wrap .tophead.personal-title{display:block}.porcelain-wrap .tophead.personal-title .site{font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;font-size:22px;font-weight:800;letter-spacing:0;line-height:1.4;white-space:normal}
.porcelain-wrap .spine .b{position:absolute;bottom:0;left:48px;writing-mode:vertical-rl;font-size:9px;font-weight:700;letter-spacing:.26em;color:rgba(8,31,92,.6)}
.porcelain-wrap .content{padding-left:40px;min-width:0}
.porcelain-wrap .tophead{display:flex;gap:18px;align-items:baseline;border-bottom:1px solid rgb(8,31,92);padding-bottom:10px;margin-bottom:40px}
.porcelain-wrap .tophead .site{font-family:Oswald,"Noto Sans SC",sans-serif;font-weight:600;font-size:13px;letter-spacing:.08em}
.porcelain-wrap .tophead .tag,.porcelain-wrap .srcline,.porcelain-wrap .foot{color:rgba(8,31,92,.45);font-size:9px;font-weight:600;letter-spacing:.1em}
.porcelain-wrap .secthead{display:flex;align-items:baseline;gap:14px;margin:44px 0 8px}
.porcelain-wrap .secthead.first{margin-top:0}
.porcelain-wrap .secthead .line{flex:1;border-top:1px solid rgb(8,31,92)}
.porcelain-wrap .secthead .t{font-weight:700;font-size:15px;letter-spacing:.2em}
.porcelain-wrap .claim{font-size:13px;font-weight:700;margin:4px 0 2px}
.porcelain-wrap svg{width:auto;max-width:100%;height:auto;max-height:220px;display:block;margin:0 auto;overflow:visible}
.porcelain-wrap .stats svg{max-height:none;width:100%}
.porcelain-wrap svg text{font-family:Inter,"Noto Sans SC","Microsoft YaHei",sans-serif}
.porcelain-wrap svg{cursor:pointer}
@keyframes porcelain-draw{to{stroke-dashoffset:0}}
@keyframes porcelain-pop{from{opacity:0}to{opacity:1}}
.porcelain-wrap svg.is-play path.draw{stroke-dasharray:1;stroke-dashoffset:1;animation:porcelain-draw .9s ease forwards}
.porcelain-wrap svg.is-play .dot{animation:porcelain-pop .4s ease both}
.porcelain-tip{position:fixed;z-index:40;max-width:280px;padding:6px 8px;background:rgb(247,242,235);color:rgb(8,31,92);border:1px solid rgb(8,31,92);font:700 14px/1.4 Inter,"Noto Sans SC","Microsoft YaHei",sans-serif;pointer-events:none}
.porcelain-wrap .duo{display:grid;grid-template-columns:1.25fr 1fr;gap:44px}
.porcelain-wrap .chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px 36px;align-items:start}
.porcelain-wrap .chart-row{display:grid;gap:28px 32px;align-items:start;margin-top:36px}
.porcelain-wrap .chart-row.c2{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.porcelain-wrap .chart-row.c3{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)}
.porcelain-wrap .chart-row .claim{font-size:15px;font-weight:700}
.porcelain-wrap .sheet-action{margin-top:8px}
.porcelain-wrap .chart-grid .claim{min-height:1.4em}
.porcelain-wrap .fig.solo svg{width:100%;max-width:100%;height:auto;max-height:240px;margin:0}
.porcelain-wrap .fig.hero svg{width:100%;max-width:100%;height:auto;max-height:520px;margin:0}
.porcelain-wrap .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:14px;border-top:1px solid rgb(8,31,92);align-items:start}
.porcelain-wrap .band-chart h4{font-size:12px;letter-spacing:.12em;margin-bottom:8px}
.porcelain-wrap .band-chart svg{max-height:168px;width:100%}
.porcelain-wrap .stats.c1{grid-template-columns:minmax(0,1fr)}
.porcelain-wrap .stats.c2{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}
.porcelain-wrap .stats.c3{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(220px,0.9fr)}
.porcelain-wrap .stats>div{padding:22px 20px 6px;border-right:1px dotted rgba(8,31,92,.32)}
.porcelain-wrap .stats>div:first-child{padding-left:0}
.porcelain-wrap .stats>div:last-child{border-right:0;padding-right:0}
.porcelain-wrap .kpi{margin-bottom:18px}
.porcelain-wrap .kpi .v{font-family:Oswald,"Noto Sans SC",sans-serif;font-weight:700;font-size:38px;line-height:1}
.porcelain-wrap .kpi .r{font-size:10px;font-weight:700;color:rgba(8,31,92,.6);margin-top:4px}
.porcelain-wrap .kpi .l{font-size:9.5px;font-weight:600;letter-spacing:.12em;color:rgba(8,31,92,.45);margin-top:3px}
.porcelain-wrap h4{font-size:12.5px;letter-spacing:.14em;margin-bottom:10px}
.porcelain-wrap .ranked .row{display:flex;gap:12px;align-items:baseline;padding:8px 0;border-bottom:1px dotted rgba(8,31,92,.32)}
.porcelain-wrap .ranked .n{font-family:Oswald,"Noto Sans SC",sans-serif;font-weight:700;font-size:24px;min-width:62px}
.porcelain-wrap .ranked .d{font-size:10px;line-height:1.7;color:rgba(8,31,92,.6)}
.porcelain-wrap .ranked .d b{color:rgb(8,31,92)}
.porcelain-wrap .watch{width:100%;border-collapse:collapse;margin-top:8px}
.porcelain-wrap .watch th,.porcelain-wrap .watch td{text-align:left;vertical-align:top;font-size:11px;line-height:1.65;padding:10px 12px 10px 0;border-bottom:1px dotted rgba(8,31,92,.32)}
.porcelain-wrap .watch th{font-size:9px;letter-spacing:.14em;color:rgba(8,31,92,.45);border-bottom:1px solid rgb(8,31,92)}
.porcelain-wrap .prose p,.porcelain-wrap .prose li{font-size:13px;line-height:1.75;margin:6px 0}
.porcelain-wrap .foot{margin-top:48px;border-top:1px solid rgb(8,31,92);padding-top:12px;display:flex;justify-content:space-between;gap:16px;color:rgba(8,31,92,.6)}
@media(max-width:900px){.porcelain-wrap .sheet{grid-template-columns:1fr}.porcelain-wrap .spine{display:none}.porcelain-wrap .content{padding-left:0}.porcelain-wrap .duo,.porcelain-wrap .stats,.porcelain-wrap .chart-row.c2,.porcelain-wrap .chart-row.c3{grid-template-columns:1fr}}
`;
const kpi = (value, note, label) => `<div class="kpi"><div class="v">${escapeHtml(value)}</div><div class="r">${escapeHtml(note)}</div><div class="l">${escapeHtml(label)}</div></div>`;

const oqcPoster = (data, module) => {
  const worst = [...data.divisions].sort((a, b) => a.current - b.current)[0];
  const claim = worst?.previous != null ? `落差在${worst.name}：5分率由上月${worst.previous}%降到本月${worst.current}%` : `本月5分率${data.fiveRate}%`;
  const watch = data.actions.length ? `<table class="watch"><thead><tr><th>对象</th><th>指标</th><th>完成时间</th><th>关闭条件</th></tr></thead><tbody>${data.actions.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "";
  const concerns = data.actions.slice(0, 3).map((row) => `<div class="row"><div class="n">${escapeHtml((row[1] || "").match(/[\d.]+%/)?.[0] || "关注")}</div><div class="d"><b>${escapeHtml(row[0])}</b> —— ${escapeHtml(row[1] || "")}</div></div>`).join("");
  return `<div class="porcelain-wrap report-publisher"><style>${sheetCss}</style><div class="sheet"><div class="spine"><div class="t">出货评分</div><div class="b">OQC · 2026</div></div><div class="content"><div class="tophead"><span class="site">QMS</span><span class="sep">|</span><span class="tag">${escapeHtml(data.period)} · 累计从当年1月起到截止日期 · 没有上月数就不写升降</span></div><div class="secthead first"><span class="line"></span><span class="t">产品部五分率</span></div><div class="claim">${escapeHtml(claim)}</div><div class="fig">${lineChart(data.divisions)}</div><div class="secthead"><span class="line"></span><span class="t">出货与低分</span></div><div class="duo"><div>${heatChart(data.divisions)}</div><div>${donutChart(data.divisions, data.shipped)}</div></div><div class="secthead"><span class="line"></span><span class="t">值得记住的数字</span></div><div class="stats c4"><div>${kpi(String(data.shipped), "5分 " + (data.fiveCount ?? "—") + "台", "本月出货")}${kpi((data.fiveRate ?? "—") + "%", "累计 " + (data.ytdFive ?? "—") + "%", "本月五分率")}${kpi(data.average ?? "—", "累计 " + (data.ytdAverage ?? "—"), "本月平均分")}</div><div>${kpi((data.lowRate ?? "—") + "%", "低分 " + (data.lowCount ?? "—") + "台 · 累计 " + (data.ytdLow ?? "—") + "%", "本月低分率")}${kpi(String(data.ytdShipped ?? "—"), "1月至截止日期", "累计出货")}</div><div><h4>低分率</h4>${rowChart(data)}</div><div class="ranked"><h4>本月要盯住</h4>${concerns || "<div class='row'><div class='d'>本月没有需要点名的对象</div></div>"}</div></div>${watch ? `<div class="secthead"><span class="line"></span><span class="t">本月要关注的事</span></div>${watch}` : ""}<div class="foot"><span>${escapeHtml(module)} · 青瓷经营网页风格</span><span>${escapeHtml([data.fixture ? "治具" + data.fixture : "", data.auto ? "自动化" + data.auto : ""].filter(Boolean).join(" · "))}</span></div></div></div></div>`;
};

export const renderPorcelainSheet = (content, { module = "质量分析", snapshot = null, visualSpec = null } = {}) => {
  const parsed = /角色报告/.test(String(module || "")) ? null : parseOqcPorcelain(content);
  if (parsed) return oqcPoster(parsed, module);
  const body = renderDataSheet(content, { module, snapshot, visualSpec });
  return body.replace('<div class="porcelain-wrap report-publisher">', '<div class="porcelain-wrap report-publisher"><style>' + sheetCss + '</style>');
};

const installPorcelainInteraction = () => {
  if (typeof document === "undefined" || document.documentElement.dataset.porcelainBound) return;
  document.documentElement.dataset.porcelainBound = "1";
  const tip = document.createElement("div");
  tip.className = "porcelain-tip";
  tip.hidden = true;
  document.body.appendChild(tip);
  const textOf = (target) => {
    const node = target?.closest?.("circle, rect, path, text, line");
    if (!node || !node.closest(".porcelain-wrap")) return "";
    return node.querySelector?.("title")?.textContent || "";
  };
  const place = (event, text) => {
    if (!text) { tip.hidden = true; return; }
    tip.textContent = text;
    tip.hidden = false;
    const width = tip.offsetWidth || 160;
    tip.style.left = Math.min(event.clientX + 14, window.innerWidth - width - 8) + "px";
    tip.style.top = Math.min(event.clientY + 16, window.innerHeight - 40) + "px";
  };
  const play = (svg) => {
    svg.classList.remove("is-play");
    void svg.getBoundingClientRect();
    svg.classList.add("is-play");
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      play(entry.target);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.4 });
  const watch = () => {
    document.querySelectorAll(".porcelain-wrap svg").forEach((svg) => {
      if (svg.dataset.watched) return;
      svg.dataset.watched = "1";
      io.observe(svg);
    });
  };
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
  watch();
  document.addEventListener("pointerover", (event) => place(event, textOf(event.target)));
  document.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget?.closest?.(".porcelain-wrap svg")) tip.hidden = true;
  });
  document.addEventListener("click", (event) => {
    const svg = event.target?.closest?.(".porcelain-wrap svg");
    if (!svg) { tip.hidden = true; return; }
    place(event, textOf(event.target));
    play(svg);
  });
};
if (typeof document !== "undefined") {
  const start = () => installPorcelainInteraction();
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
