import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { figureMatchesHeading, periodChartTitle, renderLieflatFigure } from "../src/agent/lieflatRoleCharts.js";
import { getReportPresentationProfile } from "../src/agent/reportPresentationProfiles.js";
import { sanitizeHumanReportContent } from "../src/reportSanitizer.js";
import { renderPorcelainSheet } from "../src/agent/porcelainSheet.js";
import { renderBasicsSheet } from "../src/agent/basicsSheet.js";

const CONFIG_VERSION = "qms-wecom-config-v1";

const personKey = (value) => String(value || "").normalize("NFKC").replace(/[\s\u00a0]/g, "");

export const normalizeWebhook = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const keyed = text.match(/[?&]key=([A-Za-z0-9-]{8,})/);
  const key = keyed?.[1] || (/^[A-Za-z0-9-]{16,}$/.test(text) ? text : "");
  return key ? `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${key}` : "";
};

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
    webhook: String(row.webhook || ""),
    post: String(row.post || "").trim(),
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
      webhook: normalizeWebhook(row.webhook) || String(row.webhook || "").trim(),
      post: String(row.post || "").trim(),
    })),
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(saved, null, 2), "utf8");
  return saved;
};

const sendTarget = (row = {}) => {
  const rawWebhook = String(row.webhook || "").trim();
  const webhook = normalizeWebhook(rawWebhook);
  const userid = String(row.wecom || "").trim();
  if (webhook) return { channel: "webhook", webhook, userid };
  if (rawWebhook) return { channel: "bad-webhook", webhook: "", userid };
  if (userid) return { channel: "app", webhook: "", userid };
  return null;
};

export const matchEmployee = (employees = [], name = "") => {
  const key = personKey(name);
  if (!key) return { status: "missing", reason: "没有收件人姓名", channel: "", matches: [] };
  const matches = (Array.isArray(employees) ? employees : []).filter((row) => personKey(row.name) === key);
  if (!matches.length) return { status: "missing", reason: `员工信息中没有「${name}」`, channel: "", matches: [] };
  const targeted = matches.map((row) => ({ row, target: sendTarget(row) })).filter((item) => item.target);
  if (!targeted.length) return { status: "no-userid", reason: `「${name}」还不能发送。请在员工信息填写群机器人 Webhook`, channel: "", matches };
  if (targeted.some((item) => item.target.channel === "bad-webhook") && !targeted.some((item) => item.target.channel === "webhook" || item.target.channel === "app")) {
    return { status: "bad-webhook", reason: `「${name}」的群机器人 Webhook 格式不对，请粘贴完整地址`, channel: "", matches };
  }
  const usable = targeted.filter((item) => item.target.channel === "webhook" || item.target.channel === "app");
  const identities = [...new Set(usable.map((item) => item.target.channel === "webhook" ? `webhook:${item.target.webhook}` : `app:${item.target.userid}`))];
  if (identities.length > 1) return { status: "duplicate", reason: `「${name}」对应多个发送地址，请先在员工信息中确认`, channel: "", matches: usable.map((item) => item.row) };
  const chosen = usable[0];
  return { status: "ok", channel: chosen.target.channel, userid: chosen.target.userid, webhook: chosen.target.webhook, employee: chosen.row, matches: usable.map((item) => item.row) };
};

export const publicEmployeeMatch = (match = {}) => ({
  status: match.status || "",
  reason: match.reason || "",
  channel: match.channel || "",
  userid: match.channel === "app" ? String(match.userid || "") : "",
});

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
    60020: "调用企业微信的出口 IP 不在企业可信 IP 里，自建应用发不出去。请改用群机器人 Webhook",
    93000: "群机器人 Webhook 无效或已被删除",
    81013: "userid 不存在或已离职，请核对员工信息",
    60111: "userid 不存在",
    45009: "发送过于频繁，请稍后再试",
    40058: "消息内容不合法",
    40004: "文件类型不支持",
    45001: "媒体文件为空",
  };
  return map[code] || payload?.errmsg || fallback || "企业微信接口失败";
};

export const uploadWecomFile = async (token, buffer, fileName, mime = "application/octet-stream") => {
  const form = new FormData();
  form.append("media", new File([buffer], fileName, { type: mime || "application/octet-stream" }));
  const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(token)}&type=file`, { method: "POST", body: form });
  const payload = await response.json().catch(() => ({}));
  if (!payload.media_id) throw new Error(wecomError(payload, "上传文件到企业微信失败"));
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

export const markdownToHtml = (title, markdown, visualSpec = null, options = {}) => {
  const analysis = options.kind === "analysis";
  const kicker = options.kicker || (analysis ? "QUALITY ANALYSIS AGENT" : "QUALITY INTELLIGENCE · 角色报告");
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
    } else if (analysis && line.trim().replace(/^\*\*|\*\*$/g, "").trim() === kicker) {
      continue;
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
</style></head><body><div class="pdf-role-sheet"><div class="pdf-role-kicker">${escapeHtml(kicker)}</div><h1>${escapeHtml(title)}</h1>${html.join("")}</div></body></html>`;
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
    const child = spawn(browser, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--window-size=1280,1800", "--virtual-time-budget=1200", `--print-to-pdf=${pdfPath}`, fileUrl], { windowsHide: true });
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

const ROLE_NAMES = new Set(["组装人员", "机长", "交付经理", "供应链经理", "研发工程师", "PM", "TPM", "产总"]);
export const isRoleReport = (report = {}) => /^角色报告/.test(String(report.module || "")) || ROLE_NAMES.has(String(report.role || ""));
const plainMarkdown = (value = "") => String(value || "").replace(/[*_`]/g, "").trim();
export const markdownHeading = (markdown = "") => plainMarkdown(String(markdown).match(/^#\s+(.+)$/m)?.[1] || "");
export const markdownKicker = (markdown = "") => {
  const line = String(markdown).split(/\r?\n/).map((item) => item.trim()).find((item) => /^\*\*.+\*\*$/.test(item));
  return line ? line.replace(/^\*\*|\*\*$/g, "").trim() : "";
};
export const reportPdfTitle = (report = {}, content = "") => {
  if (!isRoleReport(report)) return markdownHeading(content) || `${report.module || "质量分析"}质量报告`;
  const period = report.period || {};
  const start = String(period.start || period._periodStart || "").slice(0, 7);
  const end = String(period.end || period._periodEnd || "").slice(0, 7);
  const when = start && end ? (start === end ? start : `${start}至${end}`) : "";
  return [report.recipient || "质量报告", report.role, when, "质量报告"].filter(Boolean).join("-");
};

const webhookPace = new Map();
const waitForWebhook = async (key) => {
  const wait = 7000 - (Date.now() - (webhookPace.get(key) || 0));
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  webhookPace.set(key, Date.now());
};

const postWebhook = async (key, body) => {
  const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (Number(payload.errcode) !== 0) throw new Error(wecomError(payload, "群机器人发送失败"));
  return payload;
};

export const sendWebhookReport = async (webhook, { text: notice, fileName, buffer }) => {
  const key = normalizeWebhook(webhook).split("key=")[1] || "";
  if (!key) throw new Error("群机器人 Webhook 不正确，请粘贴完整地址");
  await waitForWebhook(key);
  if (text) await postWebhook(key, { msgtype: "text", text: { content: String(text).slice(0, 1800) } });
  const form = new FormData();
  form.append("media", new File([buffer], fileName, { type: "application/pdf" }));
  const uploadedResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=${encodeURIComponent(key)}&type=file`, { method: "POST", body: form });
  const uploaded = await uploadedResponse.json().catch(() => ({}));
  if (!uploaded.media_id) throw new Error(wecomError(uploaded, "群机器人上传文件失败"));
  return postWebhook(key, { msgtype: "file", file: { media_id: uploaded.media_id } });
};

const printDocument = (title, body) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head><body>${body}<style>
@page{size:A4;margin:8mm}
html,body{margin:0;padding:0;background:#fff}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
svg{max-width:100%;height:auto}
.basics-wrap svg .fade,.porcelain-wrap .fade{animation:none !important;opacity:1 !important}
.porcelain-wrap .sheet{width:100% !important;max-width:100% !important;grid-template-columns:92px minmax(0,1fr) !important}
.porcelain-wrap .spine{display:block !important;overflow:visible !important;position:relative !important}
.porcelain-wrap .spine .t{position:static !important;display:block !important;writing-mode:vertical-rl;font-size:28px !important;line-height:1.2 !important;white-space:normal !important;word-break:keep-all;overflow:visible !important;left:auto !important;width:auto !important;height:auto !important}
.porcelain-wrap .spine .b{position:static !important;display:block !important;margin-top:16px;writing-mode:vertical-rl}
</style></body></html>`;
const frameReportScreen = (html) => {
  const css = "<style>html,body{margin:0;background:#e6e1d8 !important} .pdf-role-sheet,.porcelain-wrap,.basics-wrap{width:auto !important;max-width:1080px !important;margin:28px auto !important;box-sizing:border-box !important;overflow:hidden} .pdf-role-sheet{padding:28px 32px 40px !important} .porcelain-wrap .sheet,.basics-wrap .page{width:100% !important;max-width:100% !important;box-sizing:border-box !important} .porcelain-wrap svg,.basics-wrap svg{max-width:100% !important;height:auto !important}</style>";
  return html.includes("</body>") ? html.replace("</body>", css + "</body>") : html + css;
};
const screenDocument = (title, body) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`;
export const buildReportHtml = ({ report = {}, content = "", screen = false } = {}) => {
  const profile = getReportPresentationProfile(report.layoutProfileId || report.layoutSkillName || "");
  const visualSpec = visualSpecFromReport(report, content);
  content = sanitizeHumanReportContent(content);
  const analysis = !isRoleReport(report);
  const title = reportPdfTitle(report, content);
  const view = { module: report.module || "质量分析", snapshot: report.snapshot || null, visualSpec };
  let html;
  if (profile.renderer === "porcelainSheet") html = (screen ? screenDocument : printDocument)(title, renderPorcelainSheet(content, view));
  else if (profile.renderer === "basicsSheet") html = (screen ? screenDocument : printDocument)(title, renderBasicsSheet(content, view));
  else {
    const kicker = analysis ? (markdownKicker(content) || `QUALITY ANALYSIS AGENT / ${report.module || "质量分析"}`) : "QUALITY INTELLIGENCE · 角色报告";
    html = markdownToHtml(title, content, visualSpec, { kind: analysis ? "analysis" : "role", kicker });
  }
  const safe = String(title).replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "质量报告";
  if (screen) html = frameReportScreen(html);
  return { html, title, fileName: `${safe}.html`, analysis };
};
export const buildReportPdf = async ({ report = {}, content = "", pdfDir }) => {
  const built = buildReportHtml({ report, content });
  const pdfName = built.fileName.replace(/\.html$/i, ".pdf");
  const pdfPath = path.join(pdfDir, `${pdfName.replace(/\.pdf$/i, "")}-${Date.now()}.pdf`);
  const buffer = await printHtmlToPdf(built.html, pdfPath);
  try { await fs.unlink(pdfPath); } catch {}
  return { buffer, title: built.title, fileName: pdfName, analysis: built.analysis };
};

export const sendOneReport = async ({ config, report, content, pdfDir, deliverTo = "", format = "pdf" }) => {
  const targetName = String(deliverTo || report.recipient || "").trim();
  const match = matchEmployee(config.employees, targetName);
  if (match.status !== "ok") return { ok: false, status: match.status, reason: match.reason, channel: match.channel || "", recipient: report.recipient, fileName: report.fileName };
  const htmlFile = String(format || "").toLowerCase() === "html";
  const built = htmlFile ? buildReportHtml({ report, content, screen: true }) : await buildReportPdf({ report, content, pdfDir });
  const buffer = htmlFile ? Buffer.from(built.html, "utf8") : built.buffer;
  const { title, fileName: pdfName, analysis } = built;
  const mime = htmlFile ? "text/html" : "application/pdf";
  const period = report.period || {};
  const notice = analysis
    ? [htmlFile ? "质量报告已出具，请用浏览器打开附件 HTML。页面连续显示，不会分页截断。" : "质量报告已出具，请查收附件 PDF。", `发给：${targetName}`, `报告：${title}`].join("\n")
    : [htmlFile ? "质量报告已出具，请用浏览器打开附件 HTML。页面连续显示，不会分页截断。" : "质量报告已出具，请查收附件 PDF。", `发给：${targetName}`, report.role ? `角色：${report.role}` : "", report.recipient ? `报告：${report.recipient}` : "", period.start && period.end ? `周期：${period.start} 至 ${period.end}` : ""].filter(Boolean).join("\n");
  if (match.channel === "webhook") await sendWebhookReport(match.webhook, { text: notice, fileName: pdfName, buffer, mime });
    else {
      if (!config.corpId || !config.secret || !config.agentId) throw new Error("自建应用还没配齐，而且当前出口 IP 需要管理员放行。请改填群机器人 Webhook");
      const token = await getWecomToken(config);
      const mediaId = await uploadWecomFile(token, buffer, pdfName, mime);
      await sendWecomFile(config, { userid: match.userid, mediaId, text: notice });
    }
  return { ok: true, status: "ok", channel: match.channel, recipient: report.recipient, userid: match.channel === "app" ? match.userid : "", fileName: report.fileName, title };
};

export const safePdfName = (title) => String(title || "质量报告").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "质量报告";

const visualSpecFromReport = (report = {}, content = "") => {
  if (report.visualSpec && Array.isArray(report.visualSpec.figures) && report.visualSpec.figures.length) return report.visualSpec;
  const match = String(content || "").match(/<REPORT_VISUAL_SPEC_JSON>([\s\S]*?)<\/REPORT_VISUAL_SPEC_JSON>/);
  if (!match) return report.visualSpec || null;
  try { return JSON.parse(match[1]); } catch { return report.visualSpec || null; }
};
export const exportOnePdf = async ({ report, content, batchDir, format = "pdf" }) => {
  const htmlFile = String(format || "").toLowerCase() === "html";
  const built = buildReportHtml({ report, content, screen: htmlFile });
  const person = safePdfName(built.analysis ? (report.module || "质量分析") : (report.recipient || "未署名"));
  const personDir = path.join(batchDir, person);
  await fs.mkdir(personDir, { recursive: true });
  const ext = htmlFile ? ".html" : ".pdf";
  const baseName = safePdfName(built.title);
  let filePath = path.join(personDir, baseName + ext);
  if (existsSync(filePath)) filePath = path.join(personDir, baseName + "-" + Date.now() + ext);
  if (htmlFile) await fs.writeFile(filePath, built.html, "utf8");
  else await printHtmlToPdf(built.html, filePath);
  return { ok: true, fileName: report.fileName, recipient: report.recipient || "", role: report.role || "", pdfPath: filePath, pdfName: path.basename(filePath), format: htmlFile ? "html" : "pdf" };
};
