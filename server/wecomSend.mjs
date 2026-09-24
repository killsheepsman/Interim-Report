import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { figureMatchesHeading, periodChartTitle, renderLieflatFigure } from "../src/agent/lieflatRoleCharts.js";

const CONFIG_VERSION = "qms-wecom-config-v1";

const personKey = (value) => String(value || "").normalize("NFKC").replace(/[\s\u00a0]/g, "");

export const publicWecomConfig = (config = {}) => ({
  corpId: String(config.corpId || ""),
  agentId: String(config.agentId || ""),
  hasSecret: Boolean(String(config.secret || "").trim()),
  secretHint: String(config.secret || "").trim() ? `${String(config.secret).slice(0, 4)}***` : "",
  employees: Array.isArray(config.employees) ? config.employees.map((row) => ({
    id: String(row.id || ""),
    name: String(row.name || ""),
    dept: String(row.dept || ""),
    role: String(row.role || ""),
    wecom: String(row.wecom || ""),
  })) : [],
  updatedAt: config.updatedAt || "",
});

export const loadWecomConfig = async (filePath) => {
  try {
    const value = JSON.parse(await fs.readFile(filePath, "utf8"));
    return value && typeof value === "object" ? value : { version: CONFIG_VERSION, corpId: "", agentId: "", secret: "", employees: [] };
  } catch {
    return { version: CONFIG_VERSION, corpId: "", agentId: "", secret: "", employees: [] };
  }
};

export const saveWecomConfig = async (filePath, next = {}, current = {}) => {
  const employees = Array.isArray(next.employees) ? next.employees : (current.employees || []);
  const saved = {
    version: CONFIG_VERSION,
    corpId: String(next.corpId ?? current.corpId ?? "").trim(),
    agentId: String(next.agentId ?? current.agentId ?? "").trim(),
    secret: String(next.secret || "").trim() || String(current.secret || "").trim(),
    employees: employees.map((row) => ({
      id: String(row.id || "").trim(),
      name: String(row.name || "").trim(),
      dept: String(row.dept || "").trim(),
      role: String(row.role || "").trim(),
      wecom: String(row.wecom || "").trim(),
    })),
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(saved, null, 2), "utf8");
  return saved;
};

export const matchEmployee = (employees = [], name = "") => {
  const key = personKey(name);
  if (!key) return { status: "missing", reason: "没有收件人姓名", matches: [] };
  const matches = (Array.isArray(employees) ? employees : []).filter((row) => personKey(row.name) === key);
  if (!matches.length) return { status: "missing", reason: `员工信息中没有「${name}」`, matches: [] };
  const withUser = matches.filter((row) => String(row.wecom || "").trim());
  if (!withUser.length) return { status: "no-userid", reason: `「${name}」还没有企业微信 userid`, matches };
  const userids = [...new Set(withUser.map((row) => String(row.wecom).trim()))];
  if (userids.length > 1) return { status: "duplicate", reason: `「${name}」对应多个 userid，请先在员工信息中确认`, matches: withUser };
  return { status: "ok", userid: userids[0], employee: withUser[0], matches: withUser };
};

const tokenCache = { value: "", expireAt: 0 };

export const getWecomToken = async (config) => {
  if (!config.corpId || !config.secret) throw new Error("请先在系统管理-企业微信中填写 CorpId 和 Secret");
  if (tokenCache.value && Date.now() < tokenCache.expireAt) return tokenCache.value;
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(config.corpId)}&corpsecret=${encodeURIComponent(config.secret)}`;
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!payload.access_token) throw new Error(wecomError(payload, "获取企业微信令牌失败"));
  tokenCache.value = payload.access_token;
  tokenCache.expireAt = Date.now() + Math.max(60, Number(payload.expires_in || 7200) - 200) * 1000;
  return tokenCache.value;
};

const wecomError = (payload, fallback) => {
  const code = Number(payload?.errcode || 0);
  const map = {
    40013: "CorpId 不正确",
    40001: "Secret 无效，请重新保存企业微信配置",
    40014: "应用令牌失效，请重试",
    60020: "当前应用没有发消息权限，请在企业微信管理后台给自建应用开通「发送消息」",
    81013: "userid 不存在或已离职，请核对员工信息",
    60111: "userid 不存在",
    45009: "发送过于频繁，请稍后再试",
    40058: "消息内容不合法",
    40004: "文件类型不支持",
    45001: "媒体文件为空",
  };
  return map[code] || payload?.errmsg || fallback || "企业微信接口失败";
};

export const uploadWecomFile = async (token, buffer, fileName) => {
  const form = new FormData();
  form.append("media", new File([buffer], fileName, { type: "application/pdf" }));
  const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(token)}&type=file`, { method: "POST", body: form });
  const payload = await response.json().catch(() => ({}));
  if (!payload.media_id) throw new Error(wecomError(payload, "上传 PDF 到企业微信失败"));
  return payload.media_id;
};

export const sendWecomText = async (config, { userid, text }) => {
  const token = await getWecomToken(config);
  const agentid = Number(config.agentId);
  if (!Number.isFinite(agentid) || !agentid) throw new Error("AgentId 必须是企业微信自建应用的数字 ID");
  const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ touser: userid, agentid, msgtype: "text", text: { content: text }, enable_duplicate_check: 0 }),
  });
  const payload = await response.json().catch(() => ({}));
  if (Number(payload.errcode) !== 0) throw new Error(wecomError(payload, "企业微信发送失败"));
  return payload;
};

export const sendWecomFile = async (config, { userid, mediaId, text }) => {
  const token = await getWecomToken(config);
  const agentid = Number(config.agentId);
  if (!Number.isFinite(agentid) || !agentid) throw new Error("AgentId 必须是企业微信自建应用的数字 ID");
  const send = async (body) => {
    const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ touser: userid, agentid, enable_duplicate_check: 1, duplicate_check_interval: 180, ...body }),
    });
    const payload = await response.json().catch(() => ({}));
    if (Number(payload.errcode) !== 0) throw new Error(wecomError(payload, "企业微信发送失败"));
    return payload;
  };
  if (text) await send({ msgtype: "text", text: { content: text } });
  return send({ msgtype: "file", file: { media_id: mediaId } });
};

const escapeHtml = (value) => String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));

export const markdownToHtml = (title, markdown, visualSpec = null) => {
  const figures = Array.isArray(visualSpec?.figures) ? visualSpec.figures.map((figure, index) => ({ ...figure, __key: String(figure.id || figure.title || index) })) : [];
  const used = new Set();
  const chartsFor = (heading) => figures.filter((figure) => !used.has(figure.__key) && figureMatchesHeading(figure, heading)).map((figure) => {
    used.add(figure.__key);
    return renderLieflatFigure(figure, { compact: false }) || "";
  }).filter(Boolean).join("");
  const headingLabel = (heading) => {
    const figure = figures.find((item) => figureMatchesHeading(item, heading));
    const labels = (figure?.categories || []).map((item) => String(typeof item === "object" ? (item.name || item.label || "") : item));
    return /趋势/.test(heading) ? periodChartTitle(heading, labels) : heading;
  };
  const skipLine = (line) => {
    const text = String(line || "").trim();
    if (!text) return true;
    if (/见图，不在此/.test(text) || /^见图/.test(text)) return true;
    if (/^<!--/.test(text) || /qms-agent-role-version/.test(text)) return true;
    if (/待核实：/.test(text) && /没有已确认的规范匹配|不得编造/.test(text)) return true;
    if (/不得编造条款/.test(text)) return true;
    if (/暂无已回传考试结果/.test(text)) return true;
    if (/完成则关闭；无对应证据或同类问题再现则失败/.test(text)) return true;
    if (/请先在知识库完成人工规范匹配/.test(text)) return true;
    return false;
  };
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inTable = false;
  let pendingHeading = "";
  let skipChartTable = false;
  const closeTable = () => { if (inTable) { html.push("</tbody></table>"); inTable = false; } };
  const flushHeading = () => {
    if (pendingHeading) {
      html.push(pendingHeading);
      pendingHeading = "";
    }
  };
  const queueHeading = (markup, charts, sectionTitle = "") => {
    const chartReplaced = /周度趋势|月度趋势|周度问题趋势|月度问题趋势|问题分类|排名/.test(sectionTitle || "");
    closeTable();
    skipChartTable = chartReplaced || Boolean(charts);
    if (charts || chartReplaced) {
      pendingHeading = "";
      html.push(markup + (charts || ""));
      return;
    }
    pendingHeading = markup;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (skipLine(line) && !/^\s*\|/.test(line)) continue;
    if (/^\s*\|/.test(line)) {
      if (skipChartTable) continue;
      const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      flushHeading();
      if (!inTable) { html.push("<table><tbody>"); inTable = true; }
      const tag = html.at(-1)?.includes("<tbody>") && !html.join("").includes("<td") ? "th" : "td";
      html.push(`<tr>${cells.map((cell) => `<${tag}>${inline(cell)}</${tag}>`).join("")}</tr>`);
      continue;
    }
    closeTable();
    if (/^###\s+/.test(line)) {
      const sectionTitle = line.replace(/^###\s+/, "");
      queueHeading(`<h3>${inline(headingLabel(sectionTitle))}</h3>`, chartsFor(sectionTitle), sectionTitle);
    } else if (/^##\s+/.test(line)) {
      const sectionTitle = line.replace(/^##\s+/, "");
      queueHeading(`<h2>${inline(headingLabel(sectionTitle))}</h2>`, chartsFor(sectionTitle), sectionTitle);
    } else if (/^#\s+/.test(line)) {
      continue;
    } else if (/^[-*]\s+/.test(line)) {
      flushHeading();
      html.push(`<p class="li">· ${inline(line.replace(/^[-*]\s+/, ""))}</p>`);
    } else {
      flushHeading();
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  closeTable();
  const leftover = figures.filter((figure) => !used.has(figure.__key)).map((figure) => renderLieflatFigure(figure, { compact: false }) || "").filter(Boolean).join("");
  if (leftover) html.push(leftover);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
@page{size:A4;margin:10mm 12mm}
html,body{margin:0;padding:0}
body{color:#17202a;background:#fff;font-family:Inter,ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.55;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pdf-role-sheet{--lieflat-font-scale:1.55;padding:8px 4px 16px}
.pdf-role-kicker{margin:0 0 10px;color:#087ea4;font-size:11px;font-weight:800;letter-spacing:.12em}
h1{margin:0 0 18px;padding-bottom:12px;border-bottom:3px solid #0f4c81;color:#132238;font-family:Georgia,"Songti SC","Microsoft YaHei",serif;font-size:26px;font-weight:500;line-height:1.2}
h2{margin:22px 0 10px;padding-bottom:6px;border-bottom:1px solid #d8e1eb;color:#071c31;font-family:Georgia,"Songti SC","Microsoft YaHei",serif;font-size:18px;font-weight:500;break-after:avoid;page-break-after:avoid}
h3{margin:16px 0 8px;color:#24577d;font-size:15px;break-after:avoid;page-break-after:avoid}
p{margin:0 0 8px;color:#17202a}
table{border-collapse:collapse;width:100%;margin:4px 0 14px;font-size:12px}
th,td{border:1px solid #dfe5e8;padding:6px 8px;text-align:left}th{background:#f3f6f7;color:#102a43}
.li{margin:0 0 4px}
.lieflat-card{margin:8px 0 18px;padding:18px 16px 12px;border-radius:18px;background:#F0EFEB;color:#58402E;break-inside:avoid;page-break-inside:avoid}
.lieflat-card h2{margin:0 0 4px;border:0;padding:0;color:#58402E;font-family:Inter,system-ui,"Microsoft YaHei",sans-serif;font-size:calc(16px * var(--lieflat-font-scale,1.55));font-weight:700}
.lieflat-badge{display:inline-block;margin-bottom:8px;padding:3px 10px;border:1px dashed #B0AFA9;border-radius:99px;color:#8F8E88;font-size:calc(10px * var(--lieflat-font-scale,1.55));font-weight:700;letter-spacing:.08em}
.lieflat-sub{margin:0 0 10px;color:rgba(88,64,46,.60);font-size:calc(12px * var(--lieflat-font-scale,1.55));line-height:1.45}
.lieflat-src{margin-top:8px;color:rgba(88,64,46,.32);font-size:calc(10px * var(--lieflat-font-scale,1.55))}
.lieflat-svg-wrap{overflow:visible;width:100%}
.lieflat-card svg{display:block;width:100%;height:auto;max-height:none;min-width:0}
.lieflat-card svg text{font-family:Inter,system-ui,"PingFang SC","Microsoft YaHei",sans-serif;font-size:calc(12px * var(--lieflat-font-scale,1.55))}
.lieflat-week-bands{display:block!important;width:100%}
.lieflat-week-band{display:block!important;width:100%;margin:0 0 16px;break-inside:avoid;page-break-inside:avoid}
.lieflat-week-band-caption{margin:0 0 6px;color:#5e6f7f;font-size:12px}
.lieflat-week-bands svg,.lieflat-week-band svg{display:block!important;width:100%!important;height:auto!important;max-width:100%!important;min-width:0!important}
</style></head><body><div class="pdf-role-sheet"><div class="pdf-role-kicker">QUALITY INTELLIGENCE · 角色报告</div><h1>${escapeHtml(title)}</h1>${html.join("")}</div></body></html>`;
};


const inline = (value) => escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

const edgeCandidates = () => [
  process.env.EDGE_PATH,
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

export const findPrintBrowser = () => edgeCandidates().find((item) => existsSync(item)) || "";

export const printHtmlToPdf = async (html, pdfPath) => {
  const browser = findPrintBrowser();
  if (!browser) throw new Error("本机没有找到 Edge 或 Chrome，无法生成 PDF。请安装 Microsoft Edge 后重试");
  await fs.mkdir(path.dirname(pdfPath), { recursive: true });
  try { await fs.unlink(pdfPath); } catch {}
  const htmlPath = `${pdfPath}.html`;
  await fs.writeFile(htmlPath, html, "utf8");
  const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
  await new Promise((resolve, reject) => {
    const child = spawn(browser, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, fileUrl], { windowsHide: true });
    const timer = setTimeout(() => { child.kill(); reject(new Error("生成 PDF 超时")); }, 60000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`生成 PDF 失败，退出码 ${code}`));
    });
  });
  let buffer = Buffer.alloc(0);
  for (let i = 0; i < 40; i += 1) {
    try {
      buffer = await fs.readFile(pdfPath);
      if (buffer.byteLength > 100) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!buffer.byteLength) throw new Error("生成的 PDF 是空文件");
  try { await fs.unlink(htmlPath); } catch {}
  return buffer;
};

export const reportPdfTitle = (report = {}) => {
  const period = report.period || {};
  const start = String(period.start || period._periodStart || "").slice(0, 7);
  const end = String(period.end || period._periodEnd || "").slice(0, 7);
  const when = start && end ? (start === end ? start : `${start}至${end}`) : "";
  return [report.recipient || "质量报告", report.role, when, "质量报告"].filter(Boolean).join("-");
};

export const sendOneReport = async ({ config, report, content, pdfDir }) => {
  const match = matchEmployee(config.employees, report.recipient);
  if (match.status !== "ok") return { ok: false, ...match, recipient: report.recipient, fileName: report.fileName };
  const title = reportPdfTitle(report);
  const html = markdownToHtml(title, content, visualSpecFromReport(report, content));
  const safe = String(title).replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
  const pdfPath = path.join(pdfDir, `${safe}-${Date.now()}.pdf`);
  const buffer = await printHtmlToPdf(html, pdfPath);
  const token = await getWecomToken(config);
  const mediaId = await uploadWecomFile(token, buffer, `${safe}.pdf`);
  const period = report.period || {};
  const text = [`您的质量报告已出具，请查收附件 PDF。`, `角色：${report.role || ""}`, `人员：${report.recipient || ""}`, period.start && period.end ? `周期：${period.start} 至 ${period.end}` : ""].filter(Boolean).join("\n");
  await sendWecomFile(config, { userid: match.userid, mediaId, text });
  try { await fs.unlink(pdfPath); } catch {}
  return { ok: true, status: "ok", recipient: report.recipient, userid: match.userid, fileName: report.fileName, title };
};

export const safePdfName = (title) => String(title || "质量报告").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "质量报告";

const visualSpecFromReport = (report = {}, content = "") => {
  if (report.visualSpec && Array.isArray(report.visualSpec.figures) && report.visualSpec.figures.length) return report.visualSpec;
  const match = String(content || "").match(/<REPORT_VISUAL_SPEC_JSON>([\s\S]*?)<\/REPORT_VISUAL_SPEC_JSON>/);
  if (!match) return report.visualSpec || null;
  try { return JSON.parse(match[1]); } catch { return report.visualSpec || null; }
};
export const exportOnePdf = async ({ report, content, batchDir }) => {
  const title = reportPdfTitle(report);
  const html = markdownToHtml(title, content, visualSpecFromReport(report, content));
  const person = safePdfName(report.recipient || "未署名");
  const personDir = path.join(batchDir, person);
  await fs.mkdir(personDir, { recursive: true });
  let pdfPath = path.join(personDir, `${safePdfName(title)}.pdf`);
  if (existsSync(pdfPath)) pdfPath = path.join(personDir, `${safePdfName(title)}-${Date.now()}.pdf`);
  await printHtmlToPdf(html, pdfPath);
  return { ok: true, fileName: report.fileName, recipient: report.recipient || "", role: report.role || "", pdfPath, pdfName: path.basename(pdfPath) };
};
