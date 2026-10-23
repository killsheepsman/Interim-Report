const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
const num = (value) => {
  const parsed = Number(String(value ?? "").replace(/[%台,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const tablesOf = (text) => {
  const tables = [];
  const lines = String(text || "").split(/\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*\|/.test(lines[index])) continue;
    const block = [];
    while (index < lines.length && /^\s*\|/.test(lines[index])) { block.push(lines[index].trim()); index += 1; }
    index -= 1;
    if (block.length < 2) continue;
    const cells = (row) => row.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    const header = cells(block[0]);
    const rows = block.slice(1).map(cells).filter((row) => row.some(Boolean) && !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
    const following = [];
    for (let look = index + 1; look < lines.length; look += 1) {
      const line = String(lines[look] || "").trim();
      if (!line) continue;
      if (/^\s*\|/.test(line) || /^#{1,3}\s/.test(line) || /^(结论|出货|来料和组装|研发|已经走通的做法|要完成的事)$/.test(line) || /^[-*]\s/.test(line)) break;
      following.push(line);
      if (following.length >= 2) break;
    }
    if (rows.length) tables.push({ header, rows, note: following.join("") });
  }
  return tables;
};
const sectionText = (text, title) => {
  const lines = String(text || "").split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp("^(?:#{1,3}\\s*)?" + title + "\\s*$").test(line.trim()));
  if (start < 0) return "";
  const picked = [];
  for (const line of lines.slice(start + 1)) {
    if (/^(?:#{1,3}\s*)?(结论|出货|来料和组装|研发|已经走通的做法|要完成的事)\s*$/.test(line.trim())) break;
    picked.push(line);
  }
  return picked.join("\n");
};
const cleanName = (name) => String(name || "").replace(/^(?:是|和|与|的)/, "");
const column = (table, pattern) => table.header.findIndex((cell) => pattern.test(cell));
const DIVISIONS = [["FPC事业部", "FPC"], ["产品五部", "产品五部"], ["半导体&北美", "半导体"]];
const notPerson = (name) => /事业|产品|公司|供应|自制|出货|平均|低分|半导|北美|自动|治具|项目|载版|报警|检验|不合格|加工|深圳|杭州|模块|客户|问卷|设计|评审|标准|累计|上一|机台|班次/.test(name);

const monthlyFromText = (text) => {
  const rows = [];
  const seen = new Set();
  const source = String(text || "");
  for (const match of source.matchAll(/(\d{1,2})月\s*(\d+)\s*台[^。\n]{0,48}?5分率\s*([\d.]+)\s*%?/g)) {
    const key = Number(match[1]);
    if (seen.has(key)) continue;
    const before = source.slice(Math.max(0, match.index - 1), match.index);
    if (before === "上" || before === "累") continue;
    seen.add(key);
    rows.push({ month: key + "月", count: Number(match[2]), rate: Number(match[3]) });
  }
  return rows.sort((a, b) => parseInt(a.month, 10) - parseInt(b.month, 10));
};
const divisionsFromText = (text) => DIVISIONS.map(([full, name]) => {
  const at = String(text).indexOf(full);
  if (at < 0) return null;
  const slice = String(text).slice(at, at + 480);
  const current = slice.match(/(\d+)\s*台[^。]{0,100}?5分率\s*([\d.]+)\s*%?/);
  if (!current) return null;
  const average = slice.match(/平均分\s*([\d.]+)/);
  const previous = slice.match(/上一月[^。]{0,70}?(\d+)\s*台[^。]{0,70}?5分率\s*([\d.]+)\s*%?/);
  return { name, full, count: Number(current[1]), rate: Number(current[2]), average: average ? Number(average[1]) : null, previousCount: previous ? Number(previous[1]) : null, previousRate: previous ? Number(previous[2]) : null };
}).filter(Boolean);
const peopleFromText = (text) => {
  const found = [];
  const add = (name, count, rate) => {
    const person = cleanName(name);
    if (!person || notPerson(person) || !Number.isFinite(count) || !Number.isFinite(rate) || found.some((item) => item.name === person)) return;
    const gap = Math.round((count * 0.6 - count * rate / 100) * 10) / 10;
    if (gap <= 0) return;
    found.push({ name: person, count, rate, gap });
  };
  const source = String(text || "");
  for (const match of source.matchAll(/([\u4e00-\u9fa5]{2,4})(?:（传感器）)?[（(]\s*(\d+)\s*台[^。\n]{0,40}?5分率\s*([\d.]+)\s*%?/g)) add(match[1], Number(match[2]), Number(match[3]));
  for (const match of source.matchAll(/([\u4e00-\u9fa5]{2,4})（传感器）\s*(\d+)\s*台[^。\n]{0,30}?5分率\s*([\d.]+)\s*%?/g)) add(match[1], Number(match[2]), Number(match[3]));
  for (const match of source.matchAll(/([\u4e00-\u9fa5]{2,4})\s*(\d+)\s*台[^。\n]{0,36}?5分率\s*([\d.]+)\s*%?/g)) add(match[1], Number(match[2]), Number(match[3]));
  for (const match of source.matchAll(/产品五部\s*(\d+)\s*台就是([\u4e00-\u9fa5]{2,4})[^。]{0,70}?5分率\s*([\d.]+)\s*%?/g)) add(match[2], Number(match[1]), Number(match[3]));
  return found.sort((a, b) => b.gap - a.gap).slice(0, 5);
};
const passersFromText = (text) => {
  const found = [];
  for (const match of String(text || "").matchAll(/([\u4e00-\u9fa5]{2,4})\s*(\d+)\s*台[^。\n]{0,40}?5分率\s*([\d.]+)\s*%?/g)) {
    const name = match[1];
    const rate = Number(match[3]);
    if (notPerson(name) || rate < 60 || found.some((item) => item.name === name)) continue;
    found.push({ name, count: Number(match[2]), rate });
  }
  return found.slice(0, 3);
};
const fixturesFromText = (text) => ["治具", "自动化"].map((name) => {
  const match = String(text || "").match(new RegExp(name + "(?:是大盘)?[：:\\s]*(\\d+)\\s*台[^。]{0,48}?5分率\\s*([\\d.]+)\\s*%?"));
  return match ? { name, count: Number(match[1]), rate: Number(match[2]) } : null;
}).filter(Boolean);
const machinesFromText = (text) => {
  const found = [];
  const add = (name, value) => {
    const person = cleanName(name);
    if (!person || notPerson(person) || found.some((item) => item.name === person)) return;
    found.push({ name: person, value: Number(value) });
  };
  const source = String(text || "");
  for (const match of source.matchAll(/([\u4e00-\u9fa5]{2,4})报警条数最高，[^。]{0,60}?均值\s*([\d.]+)/g)) add(match[1], match[2]);
  for (const match of source.matchAll(/([\u4e00-\u9fa5]{2,4})([\d.]+)（\d+条/g)) add(match[1], match[2]);
  for (const match of source.matchAll(/([\u4e00-\u9fa5]{2,4})([\d.]+)，高于/g)) add(match[1], match[2]);
  return found.sort((a, b) => b.value - a.value).slice(0, 5);
};
const CELLS = [["杭州供应商", "杭州供应"], ["深圳供应商", "深圳供应"], ["深圳公司加工", "深圳加工"], ["杭州公司加工", "杭州加工"]];
const incomingFromText = (text) => CELLS.map(([full, name]) => {
  const at = String(text).indexOf(full);
  if (at < 0) return null;
  const slice = String(text).slice(at, at + 220);
  const current = slice.match(/不合格率\s*([\d.]+)\s*%/);
  if (!current) return null;
  const previous = slice.match(/7月[^\d%]{0,12}([\d.]+)\s*%/);
  return { name, full, rate: Number(current[1]), previous: previous ? Number(previous[1]) : null };
}).filter(Boolean);
const assemblyFromText = (text) => {
  const found = [];
  for (const match of String(text || "").matchAll(/(周久来|杨飞|杭州自制|深圳自制)\s*([\d.]+)\s*%/g)) {
    if (found.some((item) => item.name === match[1])) continue;
    found.push({ name: match[1], rate: Number(match[2]) });
  }
  return found;
};
const shortLines = (text, pattern) => String(text || "").split(/。|\n/).map((item) => item.replace(/^[-*\d、.\s]+/, "").trim()).filter((item) => item && item.length <= 72 && pattern.test(item)).slice(0, 4);

const fromTables = (tables) => {
  const monthTable = tables.find((table) => /^月/.test(table.header[0] || "") && column(table, /^台数$/) >= 0 && column(table, /5分率/) >= 0);
  const divisionTable = tables.find((table) => /产品部/.test(table.header[0] || "") && /5分率/.test(table.header.join("")));
  const peopleTable = tables.find((table) => /姓名/.test(table.header[0] || "") && /5分率/.test(table.header.join("")) && !/每班/.test(table.header.join("")));
  const fixtureTable = tables.find((table) => /类别/.test(table.header[0] || "") && /5分率/.test(table.header.join("")));
  const machineTable = tables.find((table) => /每班/.test(table.header.join("")));
  const incomingTable = tables.find((table) => /来源/.test(table.header[0] || "") && /不合格/.test(table.header.join("")));
  const assemblyTable = tables.find((table) => /异常密度/.test(table.header.join("")));
  const actions = tables.find((table) => /关闭条件/.test(table.header.join(""))) || tables.find((table) => /要完成的事/.test(table.header.join("")) && table.header.length >= 4);
  return { monthTable, divisionTable, peopleTable, fixtureTable, machineTable, incomingTable, assemblyTable, actions };
};

export const parseCompanyBrief = (content) => {
  const text = String(content || "");
  const tables = fromTables(tablesOf(text));
  const ship = sectionText(text, "出货") || text;
  const material = sectionText(text, "来料和组装") || text;
  const monthly = tables.monthTable
    ? tables.monthTable.rows.map((row) => ({ month: row[0], count: num(row[column(tables.monthTable, /^台数$/)]), rate: num(row[column(tables.monthTable, /5分率/)]) })).filter((row) => row.count != null && row.rate != null)
    : monthlyFromText(ship);
  const divisions = tables.divisionTable
    ? tables.divisionTable.rows.map((row) => ({ name: row[0].replace("事业部", "").replace("半导体&北美", "半导体"), full: row[0], previousCount: num(row[1]), previousRate: num(row[2]), count: num(row[3]), rate: num(row[4]), average: num(row[5]) })).filter((row) => row.rate != null)
    : divisionsFromText(ship);
  const people = tables.peopleTable
    ? tables.peopleTable.rows.map((row) => {
      const count = num(row[1]);
      const rate = num(row[2]);
      const gap = count == null || rate == null ? null : Math.round((count * 0.6 - count * rate / 100) * 10) / 10;
      return { name: row[0], count, rate, gap };
    }).filter((row) => row.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 5)
    : peopleFromText(ship);
  const passers = passersFromText(ship);
  const fixtures = tables.fixtureTable
    ? tables.fixtureTable.rows.map((row) => ({ name: row[0], count: num(row[1]), rate: num(row[2]) })).filter((row) => row.rate != null)
    : fixturesFromText(ship);
  const machines = tables.machineTable
    ? tables.machineTable.rows.map((row) => ({ name: row[0], value: num(row[1]) })).filter((row) => row.value != null).sort((a, b) => b.value - a.value).slice(0, 5)
    : machinesFromText(ship);
  const incoming = tables.incomingTable
    ? tables.incomingTable.rows.map((row) => ({ name: row[0], full: row[0], previous: num(row[1]), rate: num(row[2]) })).filter((row) => row.rate != null)
    : incomingFromText(material);
  const assembly = tables.assemblyTable
    ? tables.assemblyTable.rows.map((row) => ({ name: row[0], rate: num(row[1]) })).filter((row) => row.rate != null)
    : assemblyFromText(text);
  const company = ship.match(/公司\s*(\d{1,2})月\s*(\d+)\s*台[^。]{0,40}?5分\s*(\d+)[^。]{0,24}?5分率\s*([\d.]+)\s*%?/);
  const lead = company ? Number(company[4]) : (monthly.at(-1)?.rate ?? null);
  const shipped = company ? Number(company[2]) : (monthly.at(-1)?.count ?? null);
  const five = company ? Number(company[3]) : null;
  const month = company ? company[1] + "月" : (monthly.at(-1)?.month || "");
  const statedAverage = ship.match(/公司平均分\s*([\d.]+)/);
  let average = statedAverage ? Number(statedAverage[1]) : null;
  if (average == null) {
    const ready = divisions.filter((item) => item.average != null && item.count);
    const total = ready.reduce((sum, item) => sum + item.count, 0);
    if (ready.length >= 2 && total) average = Math.round(ready.reduce((sum, item) => sum + item.average * item.count, 0) / total * 100) / 100;
  }
  const year = (text.match(/20\d{2}/) || [])[0] || "";
  const below = divisions.filter((item) => item.rate < 60).map((item) => item.name);
  const claim = lead == null || !shipped ? "" : month.replace("月", "") + "月要管的是出货5分率。" + shipped + "台里5分只有" + (five ?? "—") + "台" + (below.length ? "，" + below.join("和") + "都低于60%。" : "。");
  let caption = "";
  if (monthly.length >= 2) {
    const previous = monthly[monthly.length - 2];
    const current = monthly[monthly.length - 1];
    const volume = current.count >= previous.count ? "放到" : "收到";
    const direction = current.rate < previous.rate ? "降到" : "升到";
    caption = "量从" + previous.month + previous.count + "台" + volume + current.month + current.count + "台，5分率从" + previous.rate + "%再" + direction + current.rate + "%。";
    if (previous.rate < 60 && current.rate < 60) caption += "已经连续两个月低于60%。";
  }
  const passed = divisions.filter((item) => item.rate >= 60).map((item) => item.name + item.count + "台、5分率" + item.rate + "%");
  let passedNote = passed.length ? "过线的是" + passed.join("，") + "。" : "";
  let passerNote = passers.map((item) => item.name + item.count + "台，5分率" + item.rate + "%。").join("");
  const worst = people[0];
  const worstMachine = worst && machines.find((item) => item.name === worst.name);
  let machineNote = worstMachine && machines[0] && worstMachine.value < machines[0].value ? worst.name + "出货最差，机台不是他的问题。" : "";
  const hangzhou = incoming.find((item) => /杭州供应/.test(item.full || item.name));
  let incomingNote = hangzhou ? "要盯的是杭州供应商，不合格率" + hangzhou.rate + "%" + (hangzhou.previous != null ? "，上月是" + hangzhou.previous + "%。" : "。") : "";
  const own = assembly.find((item) => item.name === "杭州自制");
  const named = assembly.filter((item) => item.name !== "杭州自制");
  let assemblyNote = named.length ? named.map((item) => item.name + item.rate + "%").join("、") + (own ? "，杭州自制" + own.rate + "%。" : "。") : (own ? "杭州自制" + own.rate + "%。" : "");
  const said = (table) => String(table?.note || "").trim();
  if (said(tables.monthTable)) caption = said(tables.monthTable);
  if (said(tables.divisionTable)) passedNote = said(tables.divisionTable);
  if (said(tables.peopleTable)) passerNote = said(tables.peopleTable);
  if (said(tables.machineTable)) machineNote = said(tables.machineTable);
  if (said(tables.incomingTable)) incomingNote = said(tables.incomingTable);
  if (said(tables.assemblyTable)) assemblyNote = said(tables.assemblyTable);
  const fixtureNote = said(tables.fixtureTable);
  const rd = shortLines(sectionText(text, "研发") || sectionText(text, "结论"), /评审|加工件|问题数|ECN|程序/);
  const practices = shortLines(sectionText(text, "已经走通的做法"), /.{8,}/);
  const focus = people.slice(0, 4).map((item) => item.name + "，5分率" + item.rate + "%，少" + item.gap + "台");
  return {
    spine: year && month ? year + "年" + month : (month || "公司简报"),
    lead, shipped, five, average, month, claim, caption, passedNote, passerNote, machineNote, incomingNote, assemblyNote, fixtureNote,
    monthly, divisions, people, fixtures, machines, incoming, assembly, rd, practices, focus,
    actions: tables.actions || null,
  };
};

const combo = (monthly) => {
  if (monthly.length < 2) return "";
  const width = 900;
  const height = 360;
  const bottom = 300;
  const top = 36;
  const maxCount = Math.max(...monthly.map((item) => item.count), 1);
  const x = (index) => 70 + ((760) * (index + 0.5)) / monthly.length;
  const yCount = (value) => bottom - (value / maxCount) * (bottom - top);
  const yRate = (value) => bottom - ((Math.min(80, Math.max(50, value)) - 50) / 30) * (bottom - top);
  const bars = monthly.map((item, index) => {
    const cx = x(index);
    const y = yCount(item.count);
    return `<g><title>${esc(item.month)} ${item.count}台，5分率${item.rate}%</title><rect x="${(cx - 22).toFixed(1)}" y="${y.toFixed(1)}" width="44" height="${(bottom - y).toFixed(1)}" fill="rgb(51,78,172)"/><text class="num" x="${cx.toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle">${item.count}</text><text class="tick" x="${cx.toFixed(1)}" y="332" text-anchor="middle">${esc(item.month)}</text></g>`;
  }).join("");
  const path = monthly.map((item, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${yRate(item.rate).toFixed(1)}`).join(" ");
  const dots = monthly.map((item, index) => `<g><title>${esc(item.month)} 5分率${item.rate}%</title><circle cx="${x(index).toFixed(1)}" cy="${yRate(item.rate).toFixed(1)}" r="6" fill="rgb(247,242,235)" stroke="rgb(8,31,92)" stroke-width="2.5"/><text class="num" x="${(x(index) + 14).toFixed(1)}" y="${(yRate(item.rate) - 12).toFixed(1)}">${item.rate}%</text></g>`).join("");
  const grids = [0, 0.25, 0.5, 0.75, 1].map((step) => {
    const y = bottom - step * (bottom - top);
    return `<line x1="56" y1="${y}" x2="830" y2="${y}" stroke="rgba(8,31,92,.16)"/><text class="tick" x="48" y="${y + 6}" text-anchor="end">${Math.round(maxCount * step)}</text>`;
  }).join("");
  const rateTicks = [50, 60, 70, 80].map((value) => `<text class="tick" x="848" y="${yRate(value) + 6}" text-anchor="start">${value}</text>`).join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${grids}<line x1="56" y1="${yRate(60).toFixed(1)}" x2="830" y2="${yRate(60).toFixed(1)}" stroke="rgba(8,31,92,.45)" stroke-dasharray="5 4"/><text class="txt" x="56" y="22">台数</text><text class="txt" x="848" y="22">5分率</text>${rateTicks}${bars}<path d="${path}" fill="none" stroke="rgb(8,31,92)" stroke-width="2.5"/>${dots}</svg>`;
};
const dumbbell = (rows, mark) => {
  const ready = rows.filter((item) => item.previous != null && item.current != null && Number.isFinite(Number(item.previous)) && Number.isFinite(Number(item.current)));
  if (!ready.length) return "";
  const values = ready.flatMap((item) => [Number(item.previous), Number(item.current)]);
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (mark != null && Number.isFinite(Number(mark)) && Number(mark) >= low - 15 && Number(mark) <= high + 15) values.push(Number(mark));
  low = Math.min(...values);
  high = Math.max(...values);
  const pad = Math.max((high - low) * 0.22, 0.8);
  let min = Math.max(0, low - pad);
  let max = Math.min(100, high + pad);
  if (max - min < 6) {
    const mid = (low + high) / 2;
    min = Math.max(0, mid - 3);
    max = Math.min(100, mid + 3);
  }
  const left = 210;
  const right = 520;
  const xOf = (rate) => left + ((Number(rate) - min) / Math.max(max - min, 0.1)) * (right - left);
  const body = ready.map((item, index) => {
    const y = 54 + index * 92;
    const x0 = xOf(item.previous);
    const x1 = xOf(item.current);
    return `<g><title>${esc(item.name)} \u4e0a\u6708${item.previous}%\uff0c\u672c\u6708${item.current}%</title><text class="txt" x="196" y="${y + 6}" text-anchor="end">${esc(item.name)}</text><line x1="${x0.toFixed(1)}" y1="${y}" x2="${x1.toFixed(1)}" y2="${y}" stroke="rgb(8,31,92)" stroke-width="2"/><circle cx="${x0.toFixed(1)}" cy="${y}" r="7" fill="rgb(247,242,235)" stroke="rgb(8,31,92)" stroke-width="2"/><circle cx="${x1.toFixed(1)}" cy="${y}" r="7" fill="rgb(51,78,172)"/><text class="num" x="${x0.toFixed(1)}" y="${y - 18}" text-anchor="middle">${item.previous}%</text><text class="num" x="${x1.toFixed(1)}" y="${y + 32}" text-anchor="middle">${item.current}%</text></g>`;
  }).join("");
  const height = ready.length * 92 + 64;
  const guide = mark != null && Number(mark) >= min && Number(mark) <= max ? `<line x1="${xOf(mark).toFixed(1)}" y1="16" x2="${xOf(mark).toFixed(1)}" y2="${ready.length * 92 + 8}" stroke="rgba(8,31,92,.45)" stroke-dasharray="4 4"/><text class="tick" x="${(xOf(mark) - 6).toFixed(1)}" y="22" text-anchor="end">${mark}%</text>` : "";
  return `<svg width="620" height="${height}" viewBox="0 0 620 ${height}" role="img">${guide}${body}<circle cx="210" cy="${height - 16}" r="6" fill="rgb(247,242,235)" stroke="rgb(8,31,92)" stroke-width="2"/><text class="txt" x="222" y="${height - 11}">\u7a7a\u5fc3 \u4e0a\u6708</text><circle cx="360" cy="${height - 16}" r="6" fill="rgb(51,78,172)"/><text class="txt" x="372" y="${height - 11}">\u5b9e\u5fc3 \u672c\u6708</text></svg>`;
};
const hBars = (rows, valueOf, unit, tip) => {
  if (!rows.length) return "";
  const max = Math.max(...rows.map(valueOf), 0.1);
  const body = rows.map((item, index) => {
    const y = 28 + index * 52;
    const x2 = 132 + (valueOf(item) / max) * 200;
    return `<g><title>${esc(tip(item))}</title><text class="txt" x="120" y="${y + 6}" text-anchor="end">${esc(item.name)}</text><line x1="132" y1="${y}" x2="${x2.toFixed(1)}" y2="${y}" stroke="rgb(51,78,172)" stroke-width="14"/><text class="num" x="${(x2 + 8).toFixed(1)}" y="${y + 6}">${valueOf(item)}${unit}</text></g>`;
  }).join("");
  return `<svg width="460" height="${rows.length * 52 + 12}" viewBox="0 0 460 ${rows.length * 52 + 12}" role="img">${body}</svg>`;
};
const rateCols = (rows) => {
  if (rows.length < 2) return "";
  const body = rows.map((item, index) => {
    const x = 120 + index * 160;
    const height = Math.max(8, item.rate * 1.5);
    const y = 180 - height;
    return `<g><title>${esc(item.name)} ${item.count || ""}台，5分率${item.rate}%</title><rect x="${x}" y="${y}" width="46" height="${height}" fill="rgb(51,78,172)"/><text class="num" x="${x + 23}" y="${y - 8}" text-anchor="middle">${item.rate}%</text><text class="tick" x="${x + 23}" y="204" text-anchor="middle">${esc(item.name)}</text></g>`;
  }).join("");
  return `<svg width="460" height="230" viewBox="0 0 460 230" role="img"><line x1="40" y1="180" x2="420" y2="180" stroke="rgb(8,31,92)"/>${body}</svg>`;
};
const actionTable = (table) => {
  if (!table) return "";
  const rows = [table.header, ...table.rows];
  return `<div class="secthead"><span class="line"></span><span class="t">要完成的事</span></div><table class="watch"><tbody>${rows.map((row, index) => "<tr>" + row.map((cell) => `<${index === 0 ? "th" : "td"}>${esc(cell)}</${index === 0 ? "th" : "td"}>`).join("") + "</tr>").join("")}</tbody></table>`;
};
const block = (title, inner) => inner ? `<div><div class="claim">${title}</div>${inner}</div>` : "";

export const renderCompanyBriefBody = (content) => {
  const data = content && typeof content === "object" && !Array.isArray(content) ? content : parseCompanyBrief(content);
  const lead = data.lead == null ? "" : `<div class="leadnum"><b>${data.lead}%</b><span>${esc((data.month || "") + "5分率，标准60%。")}${data.five != null && data.shipped ? esc(data.five + "台 / " + data.shipped + "台") : ""}${data.average != null ? esc("，平均分" + data.average) : ""}</span></div>`;
  const chart = combo(data.monthly);
  const range = data.monthly.length >= 2 ? data.monthly[0].month + "至" + data.monthly.at(-1).month + "出货台数和5分率" : "";
  const pair = dumbbell(data.divisions.map((item) => ({ name: item.name, previous: item.previousRate, current: item.rate })), 60);
  const gaps = hBars(data.people, (item) => item.gap, "台", (item) => item.name + " " + item.count + "台，5分率" + item.rate + "%，少" + item.gap + "台");
  const fixture = rateCols(data.fixtures) + (data.fixtureNote ? `<p>${esc(data.fixtureNote)}</p>` : "");
  const machine = hBars(data.machines, (item) => item.value, "", (item) => item.name + " 每班" + item.value);
  const incoming = dumbbell(data.incoming.map((item) => ({ name: item.name, previous: item.previous, current: item.rate })), null);
  const assembly = hBars(data.assembly, (item) => item.rate, "%", (item) => item.name + " " + item.rate + "%");
  const kpis = [
    data.average != null ? `<div class="kpi"><div class="v">${data.average}</div><div class="r">标准4.2</div><div class="l">本月平均分</div></div>` : "",
    data.incoming.find((item) => /杭州供应/.test(item.full || item.name)) ? `<div class="kpi"><div class="v">${data.incoming.find((item) => /杭州供应/.test(item.full || item.name)).rate}%</div><div class="r">${esc(data.incoming.find((item) => /杭州供应/.test(item.full || item.name)).previous != null ? "上月" + data.incoming.find((item) => /杭州供应/.test(item.full || item.name)).previous + "%" : "")}</div><div class="l">杭州供应商不合格率</div></div>` : "",
    data.lead != null ? `<div class="kpi"><div class="v">${data.lead}%</div><div class="r">标准60%</div><div class="l">本月5分率</div></div>` : "",
  ].filter(Boolean).join("");
  const rd = data.rd.length ? `<div class="secthead"><span class="line"></span><span class="t">研发</span></div><ul class="watchlist">${data.rd.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
  const practices = data.practices.length ? `<div class="secthead"><span class="line"></span><span class="t">已经走通的做法</span></div><ul class="watchlist">${data.practices.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
  const focus = data.focus.length ? `<div class="claim">关注这个月</div><ul class="watchlist">${data.focus.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
  return `<div class="secthead first"><span class="line"></span><span class="t">出货</span></div>${lead}<div class="claim">${esc(data.claim)}</div>${chart ? `<div class="claim">${esc(range)}</div><div class="fig hero">${chart}</div>` : ""}${data.caption ? `<p>${esc(data.caption)}</p>` : ""}<div class="chart-row c2">${block("三个产品部的5分率", pair)}${block("少掉的5分台数", gaps ? gaps + "<p>少掉的台数＝出货台数×60%－实际5分台数。</p>" : "")}</div>${data.passedNote ? `<p>${esc(data.passedNote)}</p>` : ""}${data.passerNote ? `<p>${esc(data.passerNote)}</p>` : ""}<div class="chart-row c2">${block("治具和自动化的5分率", fixture)}${block("机台每班", machine)}</div>${data.machineNote ? `<p>${esc(data.machineNote)}</p>` : ""}<div class="secthead"><span class="line"></span><span class="t">来料和组装</span></div>${data.incomingNote ? `<div class="claim">${esc(data.incomingNote)}</div>` : ""}<div class="chart-row c2">${block("加工件不合格率", incoming)}${block("自制异常密度", assembly)}</div>${data.assemblyNote ? `<p>${esc(data.assemblyNote)}</p>` : ""}${rd}${practices}${kpis ? `<div class="secthead"><span class="line"></span><span class="t">要记住的数</span></div><div class="brief-kpis">${kpis}</div>` : ""}${focus}${actionTable(data.actions)}`;
};
