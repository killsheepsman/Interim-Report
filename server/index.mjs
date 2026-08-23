import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { buildOqcRuleDimensionChartCache } from "../src/dataEngine.js";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { deletePostgresAgentReport, initPostgres, listPostgresAgentReports, readPostgresAgentReport, readPostgresState, writePostgresAgentReport, writePostgresState } from "./postgresStore.mjs";
import { createKnowledgeService } from "./knowledgeService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gzipAsync = promisify(gzip);
const rootDir = path.resolve(__dirname, "..");
// Node 20+ can load the project-local .env without adding a runtime package.
// Existing shell variables keep precedence, while .env remains ignored by Git.
try { process.loadEnvFile(path.join(rootDir, ".env")); } catch {}
const publicDir = path.join(rootDir, "dist");
const dataDir = process.env.QMS_DATA_DIR || path.join(rootDir, "data");
const dataFile = path.join(dataDir, "shared-state.json");
const stateDir = path.join(dataDir, "state");
const uploadDir = path.join(dataDir, "uploads");
const aiReportDir = path.resolve(rootDir, "..", "outputs", "ai_saved_reports");
const agentSkillDir = path.join(rootDir, "skills");
const aiConfigFile = path.join(dataDir, "ai-config.json");
const adminIpsFile = path.join(dataDir, "admin-ips.json");
const permissionFile = path.join(dataDir, "permission-config.json");
const examSessionsFile = path.join(dataDir, "exam-sessions.json");
const knowledgeStoreFile = path.join(dataDir, "knowledge-store.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const trustProxy = process.env.TRUST_PROXY === "true";
const maxBodyBytes = Number(process.env.MAX_BODY_MB || 1024) * 1024 * 1024;
const OQC_EQUIPMENT_RULE_CACHE_KEY = "oqc-equipment-rule-cache";
const QUALITY_AGENT_RUNS_KEY = "quality-agent-runs";
const QUALITY_SNAPSHOT_REGISTRY_KEY = "quality-agent-snapshot-registry";
const QUALITY_ROLE_SNAPSHOT_REGISTRY_KEY = "quality-agent-role-snapshot-registry";
const oqcRuleDimensionKeys = ["client", "customerProductCategory", "series", "businessCategory", "productForm", "detailCategory", "process"];
const allowedKeys = new Set(["imported-sources", "analysis-cache", "applied-date-range", "dqa-engineer-supplement", "project-name-mapping", OQC_EQUIPMENT_RULE_CACHE_KEY, QUALITY_AGENT_RUNS_KEY, QUALITY_SNAPSHOT_REGISTRY_KEY, QUALITY_ROLE_SNAPSHOT_REGISTRY_KEY]);
const defaultSnapshotRegistry = () => ({ schemaVersion: "quality-agent-snapshot-registry-v1", updatedAt: new Date().toISOString(), selectedRuleId: "iqc", rules: [], history: [] });
const defaultValueFor = (key) => key === "analysis-cache" || key === "applied-date-range" || key === "dqa-engineer-supplement" ? null : key === "project-name-mapping" ? { rules: {}, mappings: [] } : key === OQC_EQUIPMENT_RULE_CACHE_KEY ? { ready: false, results: {} } : key === QUALITY_AGENT_RUNS_KEY ? {} : key === QUALITY_SNAPSHOT_REGISTRY_KEY ? defaultSnapshotRegistry() : key === QUALITY_ROLE_SNAPSHOT_REGISTRY_KEY ? { schemaVersion: "quality-agent-role-snapshot-v1", updatedAt: new Date().toISOString(), history: [] } : [];

const migrateAgentReportFilesToPostgres = async () => {
  await fs.mkdir(aiReportDir, { recursive: true });
  const names = (await fs.readdir(aiReportDir)).filter((name) => /^QMS-Agent报告-.+\.md$/i.test(name));
  if (!names.length) return { migrated: 0, total: 0 };
  const known = new Set();
  let offset = 0;
  while (true) {
    const page = await listPostgresAgentReports({ limit: 200, offset });
    if (!page.available) return { migrated: 0, total: names.length };
    page.reports.forEach((item) => known.add(item.fileName));
    offset += page.reports.length;
    if (!page.reports.length || offset >= page.total) break;
  }
  let migrated = 0;
  for (const name of names.filter((item) => !known.has(item))) {
    const filePath = path.join(aiReportDir, name);
    let metadata = {};
    try { metadata = JSON.parse(await fs.readFile(`${filePath}.json`, "utf8")); } catch {}
    const stat = await fs.stat(filePath);
    const savedAt = metadata.savedAt || stat.birthtime.toISOString();
    const updatedAt = metadata.updatedAt || stat.mtime.toISOString();
    const result = await writePostgresAgentReport({
      ...metadata,
      fileName: name,
      module: metadata.module || "质量分析",
      content: await fs.readFile(filePath, "utf8"),
      savedAt,
      updatedAt,
    });
    if (!result.available) break;
    migrated += 1;
  }
  return { migrated, total: names.length };
};
// TEMP: 本机权限验证用。上传 GitHub 前必须删除这行临时管理员 IP。
// TEMP: 本机权限验证用。上传 GitHub 前必须删除这行临时管理员 IP。
const TEMP_LOCAL_ADMIN_IPS = ["192.168.188.57", "127.0.0.1"];


const defaultPermissionConfig = {
  deputyAdmins: [],
  ordinaryUsers: [],
  allowIntranetUsers: false,
  features: {
    dataImport: { public: false, deputy: true, label: "数据导入" },
    workspace: { public: false, deputy: true, label: "质量工作台" },
    annotationEdit: { public: false, deputy: true, label: "分析改善措施" },
    annotationView: { public: false, deputy: true, label: "分析显示" },
    exportReport: { public: true, deputy: true, label: "保存报告" },
    dateTemporaryRefresh: { public: true, deputy: true, label: "临时刷新日期" },
    aiAnalysis: { public: false, deputy: true, label: "AI分析" },
    aiInterface: { public: false, deputy: true, label: "AI接口" },
    qualityAgent: { public: true, deputy: true, label: "质量分析 Agent" },
    qualityAgentStart: { public: false, deputy: false, label: "启动 Agent 分析" },
    agentRoleReportGenerate: { public: false, deputy: false, label: "生成全部角色报告" },
  },
  apis: {
    "POST /api/uploads": { public: false, deputy: true, label: "上传原始Excel" },
    "PUT /api/state/imported-sources": { public: false, deputy: true, label: "保存数据源清单" },
    "PUT /api/state/analysis-cache": { public: false, deputy: true, label: "保存分析结果" },
    "PUT /api/state/applied-date-range": { public: false, deputy: true, label: "保存默认日期" },
    "PUT /api/permissions": { public: false, deputy: false, label: "保存权限设置" },
    "GET /api/state/analysis-cache": { public: true, deputy: true, label: "读取分析结果" },
    "GET /api/state/imported-sources": { public: true, deputy: true, label: "读取数据源清单" },
    "GET /api/state/applied-date-range": { public: true, deputy: true, label: "读取默认日期" },
    "GET /api/uploads/*": { public: true, deputy: true, label: "读取原始Excel" },
    "POST /api/exam-sessions": { public: false, deputy: true, label: "生成知识考试链接" },
    "GET /api/exam-sessions/*": { public: true, deputy: true, label: "读取知识考试" },
    "POST /api/exam-sessions/*/submit": { public: true, deputy: true, label: "提交知识考试" },
    "GET /api/exam-results": { public: true, deputy: true, label: "读取知识考试结果" },
    "GET /api/me": { public: true, deputy: true, label: "读取当前权限" },
    "GET /api/permissions": { public: true, deputy: true, label: "读取权限配置" },
    "GET /api/knowledge/*": { public: true, deputy: true, label: "读取知识库" },
    "POST /api/knowledge/*": { public: false, deputy: true, label: "维护知识库" },
    "PUT /api/knowledge/*": { public: false, deputy: true, label: "更新知识任务" },
    "DELETE /api/knowledge/*": { public: false, deputy: true, label: "删除知识文件" },
  },
};

defaultPermissionConfig.apis["PUT /api/state/dqa-engineer-supplement"] = { public: false, deputy: true, label: "研发· ECN/非BOM/评审" };
defaultPermissionConfig.apis["GET /api/state/dqa-engineer-supplement"] = { public: true, deputy: true, label: "研发· ECN/非BOM/评审" };
defaultPermissionConfig.apis["PUT /api/state/project-name-mapping"] = { public: false, deputy: true, label: "项目名称映射" };
defaultPermissionConfig.apis["GET /api/state/project-name-mapping"] = { public: true, deputy: true, label: "项目名称映射" };

defaultPermissionConfig.apis["GET /api/state/oqc-equipment-rule-cache"] = { public: true, deputy: true, label: "OQC equipment rule cache" };
defaultPermissionConfig.apis["GET /api/state/quality-agent-runs"] = { public: true, deputy: true, label: "Quality Agent run history" };
defaultPermissionConfig.apis["PUT /api/state/quality-agent-runs"] = { public: false, deputy: false, label: "Save Quality Agent run history" };
defaultPermissionConfig.apis["GET /api/state/quality-agent-snapshot-registry"] = { public: true, deputy: true, label: "后台快照注册表" };
defaultPermissionConfig.apis["PUT /api/state/quality-agent-snapshot-registry"] = { public: false, deputy: true, label: "保存后台快照注册表" };
defaultPermissionConfig.apis["GET /api/state/quality-agent-role-snapshot-registry"] = { public: true, deputy: true, label: "角色快照注册表" };
defaultPermissionConfig.apis["PUT /api/state/quality-agent-role-snapshot-registry"] = { public: false, deputy: true, label: "保存角色快照注册表" };

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".gz": "application/gzip",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const sendJson = async (res, status, body) => {
  const payload = Buffer.from(JSON.stringify(body));
  const acceptsGzip = /\bgzip\b/i.test(String(res.req?.headers?.["accept-encoding"] || ""));
  if (acceptsGzip && payload.length >= 1024) {
    const compressed = await gzipAsync(payload, { level: 6 });
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "gzip",
      "Vary": "Accept-Encoding",
      "Content-Length": compressed.length,
    });
    res.end(compressed);
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": payload.length });
  res.end(payload);
};

const defaultAiConfig = { baseUrl: "https://new.ahei.asia/v1", model: "", apiKey: "" };
const aiModelCatalog = new Map();
const normalizeAiBaseUrl = (value = defaultAiConfig.baseUrl) => {
  const url = new URL(String(value || defaultAiConfig.baseUrl).trim());
  const localHost = ["127.0.0.1", "localhost", "::1"].includes(url.hostname.toLowerCase());
  if (url.username || url.password || url.search || url.hash) throw new Error("AI request address cannot contain credentials, query parameters, or fragments");
  if (url.protocol !== "https:" && !(localHost && url.protocol === "http:")) throw new Error("AI request address must use HTTPS; HTTP is only allowed for localhost/127.0.0.1");
  const pathname = url.pathname.replace(/\/+$/, "") || "/v1";
  url.pathname = pathname;
  return url.toString().replace(/\/$/, "");
};
const loadAiConfig = async () => {
  try {
    const saved = JSON.parse(await fs.readFile(aiConfigFile, "utf8"));
    return { baseUrl: normalizeAiBaseUrl(saved.baseUrl), model: String(saved.model || "").trim(), apiKey: String(saved.apiKey || "").trim() };
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Failed to load shared AI config", error);
    return { ...defaultAiConfig };
  }
};
const saveAiConfig = async (config) => {
  const current = await loadAiConfig();
  const next = {
    baseUrl: normalizeAiBaseUrl(config.baseUrl || current.baseUrl || defaultAiConfig.baseUrl),
    model: String(config.model || current.model || "").trim(),
    apiKey: String(config.apiKey || "").trim() || current.apiKey,
  };
  await fs.mkdir(dataDir, { recursive: true });
  const temporary = `${aiConfigFile}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, aiConfigFile);
  return next;
};
const publicAiConfig = (config) => ({ baseUrl: config.baseUrl, model: config.model, hasApiKey: !!config.apiKey, apiKeyHint: config.apiKey ? `••••${config.apiKey.slice(-4)}` : "" });
const configFromPayload = async (payload = {}) => {
  const supplied = payload && payload.config && typeof payload.config === "object" ? payload.config : null;
  // No local override means use the administrator's shared default config.
  if (!supplied) return await loadAiConfig();
  return {
    baseUrl: normalizeAiBaseUrl(supplied.baseUrl || defaultAiConfig.baseUrl),
    model: String(supplied.model || "").trim(),
    apiKey: String(supplied.apiKey || "").trim(),
  };
};
const usesArkPlanResponses = (config) => /\/api\/plan\/v3\/?$/i.test(config.baseUrl || "");
const aiCatalogKey = (config) => `${config.baseUrl}|${config.apiKey.slice(-8)}`;
const assertKnownAiModel = (config) => {
  const catalog = aiModelCatalog.get(aiCatalogKey(config));
  if (catalog?.models?.length && !catalog.models.includes(config.model)) {
    throw new Error(`模型 ${config.model} 不在当前 API 密钥可用模型列表中，请重新读取模型并选择可用模型`);
  }
};
const extractAiText = (value) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractAiText).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  if (typeof value.text === "string") return value.text;
  if (typeof value.value === "string") return value.value;
  if (typeof value.content === "string") return value.content;
  if (value.content) return extractAiText(value.content);
  return "";
};

const extractAiContent = (result = {}) => {
  const chatContent = extractAiText(result?.choices?.[0]?.message?.content)
    || extractAiText(result?.choices?.[0]?.delta?.content);
  if (chatContent) return chatContent;
  if (typeof result?.output_text === "string" && result.output_text.trim()) return result.output_text;
  const responseContent = extractAiText(result?.content);
  if (responseContent) return responseContent;
  const outputContent = (Array.isArray(result?.output) ? result.output : [])
    .map((item) => extractAiText(item?.content) || extractAiText(item?.text) || extractAiText(item?.message))
    .filter(Boolean)
    .join("\n");
  if (outputContent) return outputContent;
  // Some compatible gateways wrap the assistant message one level deeper.
  return extractAiText(result?.message);
};
// Compatible gateways may return Server-Sent Events when stream=true. Keep
// the public QMS endpoint JSON-based, but fold streamed chat/responses chunks
// back into the same shape consumed by extractAiContent(). Non-stream JSON is
// returned unchanged, so older providers remain compatible.
const parseAiStream = (text) => {
  const lines = String(text || "").split(/\r?\n/).filter((line) => /^data:\s*/i.test(line));
  if (!lines.length) return null;
  let chatText = "";
  let responseText = "";
  lines.forEach((line) => {
    const payload = line.replace(/^data:\s*/i, "").trim();
    if (!payload || payload === "[DONE]") return;
    let item;
    try { item = JSON.parse(payload); } catch { return; }
    const delta = extractAiText(item?.choices?.[0]?.delta?.content);
    if (delta) chatText += delta;
    const responseDelta = item?.type === "response.output_text.delta"
      ? extractAiText(item?.delta)
      : extractAiText(item?.output_text?.delta);
    if (responseDelta) responseText += responseDelta;
  });
  if (!chatText && !responseText) return null;
  return chatText
    ? { choices: [{ message: { content: chatText } }] }
    : { output_text: responseText };
};
const requestAi = async (config, pathname, options = {}) => {
  if (!config.apiKey) throw new Error("Please configure the API key first");
  const { signal: callerSignal, ...requestOptions } = options;
  const controller = new AbortController();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 300000);
  let timedOut = false;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const requestHeaders = { Authorization: `Bearer ${config.apiKey}`, ...(requestOptions.body ? { "Content-Type": "application/json" } : {}), ...(requestOptions.headers || {}) };
    Object.keys(requestHeaders).forEach((key) => requestHeaders[key] == null && delete requestHeaders[key]);
    const response = await fetch(`${config.baseUrl}${pathname}`, {
      ...requestOptions,
      signal: controller.signal,
      headers: requestHeaders,
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: { message: text.slice(0, 500) || "Invalid AI response" } }; }
    if (!response.ok) {
      if (response.status === 504) throw new Error("AI上游网关超时（504）：请使用更快的模型或缩短当前阶段请求；已完成阶段不会丢失");
      const upstreamMessage = body?.error?.message || body?.message || text.slice(0, 500) || "No error detail returned";
      if (response.status === 404 && /model.+not supported|no available channel/i.test(upstreamMessage)) {
        throw new Error(`当前 API 密钥/分组不支持模型 ${config.model}，请在“AI接口”重新读取模型并选择可用模型；当前请求通道：${pathname}`);
      }
      throw new Error(`AI上游返回 ${response.status}：${upstreamMessage}`);
    }
    return requestOptions.stream ? (parseAiStream(text) || body) : body;
  } catch (error) {
    if (controller.signal.aborted && callerSignal?.aborted && !timedOut) {
      const abortError = new Error("客户端已停止本次 AI 分析");
      abortError.name = "AbortError";
      throw abortError;
    }
    if (error?.name === "AbortError") throw new Error(`AI分析超过${Math.round(timeoutMs / 1000)}秒，已停止本次请求；已完成阶段不会丢失`);
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
};

const normalizeIp = (value = "") => String(value)
  .split(",")[0]
  .trim()
  .replace(/^::ffff:/, "")
  .replace(/^::1$/, "127.0.0.1");

const clientIp = (req) => normalizeIp(trustProxy
  ? req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket.remoteAddress || ""
  : req.socket.remoteAddress || "");

const uniqueStrings = (items = []) => [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];

const normalizeMembers = (items = []) => {
  const byIp = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const ip = normalizeIp(typeof item === "string" ? item : item?.ip);
    if (!ip) return;
    byIp.set(ip, { ip, name: String(typeof item === "string" ? "" : item?.name || "").trim() });
  });
  return [...byIp.values()];
};

const isPrivateNetworkIp = (value) => {
  const ip = normalizeIp(value).toLowerCase();
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 169 && parts[1] === 254)
    || parts[0] === 127;
};

const mergePermissionConfig = (config = {}) => {
  const deputyAdmins = normalizeMembers(config.deputyAdmins);
  const deputyIps = new Set(deputyAdmins.map((member) => member.ip));
  const merged = {
    deputyAdmins,
    ordinaryUsers: normalizeMembers(config.ordinaryUsers).filter((member) => !deputyIps.has(member.ip)),
    allowIntranetUsers: config.allowIntranetUsers === true,
    menus: {},
    features: {},
    apis: {},
  };
  for (const [key, value] of Object.entries(defaultPermissionConfig.menus || {})) {
    const source = config.menus?.[key] || {};
    const children = {};
    for (const [childKey, childValue] of Object.entries(value.children || {})) {
      children[childKey] = { ...childValue, ...(source.children?.[childKey] || {}) };
    }
    merged.menus[key] = { ...value, ...source, children };
  }
  Object.entries(config.menus || {}).forEach(([key, value]) => {
    if (!merged.menus[key]) merged.menus[key] = { public: true, deputy: true, ...value, children: value?.children || {} };
  });
  Object.entries(defaultPermissionConfig.features).forEach(([key, value]) => {
    merged.features[key] = { ...value, ...(config.features?.[key] || {}), label: value.label };
  });
  Object.entries(defaultPermissionConfig.apis).forEach(([key, value]) => {
    merged.apis[key] = { ...value, ...(config.apis?.[key] || {}) };
  });
  Object.entries(config.features || {}).forEach(([key, value]) => {
    if (!merged.features[key]) merged.features[key] = { label: key, public: false, deputy: true, ...value };
  });
  Object.entries(config.apis || {}).forEach(([key, value]) => {
    if (!merged.apis[key]) merged.apis[key] = { label: key, public: false, deputy: true, ...value };
  });
  return merged;
};

const loadAdminIps = async () => {
  try {
    const parsed = await readJsonFile(adminIpsFile);
    if (Array.isArray(parsed)) return uniqueStrings([...TEMP_LOCAL_ADMIN_IPS, ...parsed]);
    if (Array.isArray(parsed?.adminIps)) return uniqueStrings([...TEMP_LOCAL_ADMIN_IPS, ...parsed.adminIps]);
  } catch (error) {
    console.error("Failed to load admin-ips.json", error);
  }
  return uniqueStrings(TEMP_LOCAL_ADMIN_IPS);
};

const loadPermissionConfig = async () => {
  try {
    const parsed = await readJsonFile(permissionFile);
    return mergePermissionConfig(parsed || {});
  } catch (error) {
    await backupCorruptFile(permissionFile, error);
    return mergePermissionConfig({});
  }
};

const savePermissionConfig = async (config) => {
  const merged = mergePermissionConfig(config || {});
  await fs.mkdir(dataDir, { recursive: true });
  const tempFile = `${permissionFile}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(merged, null, 2), "utf8");
  await fs.rename(tempFile, permissionFile);
  return merged;
};

const currentUser = async (req) => {
  const ip = clientIp(req);
  const [adminIps, permissions] = await Promise.all([loadAdminIps(), loadPermissionConfig()]);
  const isAdmin = adminIps.includes(ip);
  const deputy = permissions.deputyAdmins.find((member) => member.ip === ip);
  const ordinary = permissions.ordinaryUsers.find((member) => member.ip === ip);
  const isIntranetUser = permissions.allowIntranetUsers && isPrivateNetworkIp(ip);
  const isDeputy = !!deputy;
  const isOrdinary = !!ordinary || isIntranetUser;
  const isAuthorized = isAdmin || isDeputy || isOrdinary;
  return {
    ip,
    name: deputy?.name || ordinary?.name || (isAdmin ? "主管理员" : isIntranetUser ? "公司内网用户" : ""),
    isAdmin,
    isDeputy,
    isOrdinary,
    isIntranetUser,
    isAuthorized,
    role: isAdmin ? "admin" : isDeputy ? "deputy" : isOrdinary ? "public" : "unauthorized",
    permissions,
  };
};

const routeKey = (req) => {
  const pathname = new URL(req.url, "http://local").pathname;
  if (pathname.startsWith("/api/knowledge")) return `${req.method} /api/knowledge/*`;
  if (req.method === "GET" && pathname.startsWith("/api/uploads/")) return "GET /api/uploads/*";
  if (req.method === "GET" && /^\/api\/exam-sessions\/[^/]+$/.test(pathname)) return "GET /api/exam-sessions/*";
  if (req.method === "POST" && /^\/api\/exam-sessions\/[^/]+\/submit$/.test(pathname)) return "POST /api/exam-sessions/*/submit";
  if (pathname.startsWith("/api/state/")) return `${req.method} ${pathname}`;
  return `${req.method} ${pathname}`;
};

const knowledgeService = createKnowledgeService({ filePath: knowledgeStoreFile });

const handleKnowledge = async (req, res) => {
  const user = await ensureApiAllowed(req, res);
  if (!user) return;
  const requestUrl = new URL(req.url, "http://local");
  const pathname = requestUrl.pathname;
  const jsonBody = async () => JSON.parse(await readBody(req) || "{}");
  try {
    if (pathname === "/api/knowledge/documents" && req.method === "GET") {
      const documents = await knowledgeService.listDocuments();
      return sendJson(res, 200, { documents, updatedAt: new Date().toISOString() });
    }
    if (pathname === "/api/knowledge/documents" && req.method === "POST") {
      const result = await knowledgeService.createDocument(await jsonBody());
      return sendJson(res, result.duplicate ? 200 : 202, result);
    }
    if (pathname === "/api/knowledge/jobs" && req.method === "GET") {
      const jobs = await knowledgeService.listJobs(String(requestUrl.searchParams.get("documentId") || ""));
      return sendJson(res, 200, { jobs });
    }
    if (pathname === "/api/knowledge/issues" && req.method === "GET") {
      const result = await knowledgeService.listIssues({
        module: requestUrl.searchParams.get("module") || "",
        personName: requestUrl.searchParams.get("personName") || "",
        query: requestUrl.searchParams.get("query") || "",
        status: requestUrl.searchParams.get("status") || "",
        limit: requestUrl.searchParams.get("limit"),
        offset: requestUrl.searchParams.get("offset"),
      });
      return sendJson(res, 200, result);
    }
    if (pathname === "/api/knowledge/issues" && req.method === "POST") {
      const payload = await jsonBody();
      const result = await knowledgeService.syncIssues(payload.issues || []);
      return sendJson(res, 200, result);
    }
    const issueRecordMatch = pathname.match(/^\/api\/knowledge\/issues\/([^/]+)$/);
    if (issueRecordMatch && req.method === "DELETE") {
      const deleted = await knowledgeService.deleteIssue(decodeURIComponent(issueRecordMatch[1]));
      return deleted ? sendJson(res, 200, { deleted: true }) : sendJson(res, 404, { error: "质量问题不存在" });
    }
    if (pathname === "/api/knowledge/matches/confirmed" && req.method === "GET") {
      const result = await knowledgeService.listConfirmedMatches({ module: requestUrl.searchParams.get("module") || "", personName: requestUrl.searchParams.get("personName") || "", limit: requestUrl.searchParams.get("limit") });
      return sendJson(res, 200, result);
    }
    if (pathname === "/api/knowledge/recurrences" && req.method === "GET") {
      const result = await knowledgeService.listRecurrences({ module: requestUrl.searchParams.get("module") || "", query: requestUrl.searchParams.get("query") || "", state: requestUrl.searchParams.get("state") || "", limit: requestUrl.searchParams.get("limit"), offset: requestUrl.searchParams.get("offset"), compact: requestUrl.searchParams.get("compact") === "true" }, await loadExamSessions());
      return sendJson(res, 200, result);
    }
    const recurrenceActionMatch = pathname.match(/^\/api\/knowledge\/recurrences\/([^/]+)\/action$/);
    if (recurrenceActionMatch && req.method === "PUT") {
      const payload = await jsonBody();
      const action = await knowledgeService.saveRecurrenceAction(decodeURIComponent(recurrenceActionMatch[1]), { ...payload, metadata: { ...(payload.metadata || {}), reviewer: user.name || user.ip || "" } });
      return sendJson(res, 200, { action });
    }
    const issueMatchesMatch = pathname.match(/^\/api\/knowledge\/issues\/([^/]+)\/matches$/);
    if (issueMatchesMatch && req.method === "GET") {
      const result = await knowledgeService.listMatches(decodeURIComponent(issueMatchesMatch[1]));
      return sendJson(res, 200, result);
    }
    if (issueMatchesMatch && req.method === "POST") {
      const result = await knowledgeService.generateMatches(decodeURIComponent(issueMatchesMatch[1]));
      return sendJson(res, 200, result);
    }
    const matchRecordMatch = pathname.match(/^\/api\/knowledge\/matches\/([^/]+)$/);
    if (matchRecordMatch && req.method === "PUT") {
      const payload = await jsonBody();
      const match = await knowledgeService.reviewMatch(decodeURIComponent(matchRecordMatch[1]), { ...payload, reviewer: payload.reviewer || user.name || user.ip || "" });
      return match ? sendJson(res, 200, { match }) : sendJson(res, 404, { error: "知识匹配记录不存在" });
    }
    const jobMatch = pathname.match(/^\/api\/knowledge\/jobs\/([^/]+)$/);
    if (jobMatch && req.method === "PUT") {
      const job = await knowledgeService.updateJob(decodeURIComponent(jobMatch[1]), await jsonBody());
      return job ? sendJson(res, 200, { job }) : sendJson(res, 404, { error: "知识任务不存在" });
    }
    const documentMatch = pathname.match(/^\/api\/knowledge\/documents\/([^/]+)$/);
    if (documentMatch && req.method === "GET") {
      const document = await knowledgeService.getDocument(decodeURIComponent(documentMatch[1]));
      return document ? sendJson(res, 200, { document: { ...document, sourceText: undefined } }) : sendJson(res, 404, { error: "知识文件不存在" });
    }
    if (documentMatch && req.method === "DELETE") {
      const deleted = await knowledgeService.deleteDocument(decodeURIComponent(documentMatch[1]));
      return sendJson(res, 200, { deleted });
    }
    const parseMatch = pathname.match(/^\/api\/knowledge\/documents\/([^/]+)\/parse$/);
    if (parseMatch && req.method === "POST") {
      const job = await knowledgeService.enqueueParse(decodeURIComponent(parseMatch[1]));
      return sendJson(res, 202, { job });
    }
    const clauseMatch = pathname.match(/^\/api\/knowledge\/documents\/([^/]+)\/clauses$/);
    if (clauseMatch && req.method === "GET") {
      const result = await knowledgeService.listClauses(decodeURIComponent(clauseMatch[1]), { limit: requestUrl.searchParams.get("limit"), offset: requestUrl.searchParams.get("offset"), query: requestUrl.searchParams.get("query") });
      return sendJson(res, 200, result);
    }
    const knowledgeMatch = pathname.match(/^\/api\/knowledge\/documents\/([^/]+)\/distillations$/);
    if (knowledgeMatch && req.method === "GET") {
      const result = await knowledgeService.listDistilled(decodeURIComponent(knowledgeMatch[1]), { limit: requestUrl.searchParams.get("limit"), offset: requestUrl.searchParams.get("offset") });
      return sendJson(res, 200, result);
    }
    if (knowledgeMatch && req.method === "POST") {
      const knowledge = await knowledgeService.saveDistillation(decodeURIComponent(knowledgeMatch[1]), await jsonBody());
      return sendJson(res, 200, { knowledge, total: knowledge.length });
    }
    const distillJobMatch = pathname.match(/^\/api\/knowledge\/documents\/([^/]+)\/distillation-jobs$/);
    if (distillJobMatch && req.method === "POST") {
      const payload = await jsonBody();
      const job = await knowledgeService.startDistillation(decodeURIComponent(distillJobMatch[1]), payload.skillId);
      return sendJson(res, 202, { job });
    }
    return sendJson(res, 404, { error: "未知知识库接口" });
  } catch (error) {
    return sendJson(res, 400, { error: String(error?.message || error || "知识库操作失败").slice(0, 800) });
  }
};

const ensureApiAllowed = async (req, res) => {
  const user = await currentUser(req);
  if (user.isAdmin) return user;
  if (!user.isAuthorized) {
    sendJson(res, 403, { error: "Access denied: IP is not registered", ip: user.ip, role: user.role });
    return null;
  }
  const rule = user.permissions.apis[routeKey(req)];
  const allowed = user.isDeputy ? rule?.deputy !== false : rule?.public === true;
  if (!allowed) {
    sendJson(res, 403, { error: "Forbidden", ip: user.ip, role: user.role });
    return null;
  }
  return user;
};

const readBody = (req) => new Promise((resolve, reject) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > maxBodyBytes) {
      reject(new Error("Request body is too large"));
      req.destroy();
    }
  });
  req.on("end", () => resolve(body));
  req.on("error", reject);
});

const readBufferBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > maxBodyBytes) {
      reject(new Error("Request body is too large"));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

const sanitizeSegment = (value) => String(value || "UNKNOWN")
  .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 180) || "UNKNOWN";

const sanitizeHumanReportContent = (content = "") => String(content || "")
  .replace(/质量总监(?:综合)?判断/g, "质量复盘摘要")
  .replace(/^\s*#{1,6}\s*质量复盘摘要\s*$/gmi, "# 质量复盘摘要")
  .replace(/^\s*#{1,6}\s*(?:REPORT_VISUAL_SPEC_JSON|ACTION_LEDGER_JSON)\s*$/gmi, "")
  .replace(/<REPORT_VISUAL_SPEC_JSON>[\s\S]*?(?:<\/REPORT_VISUAL_SPEC_JSON>|$)|<ACTION_LEDGER_JSON>[\s\S]*?(?:<\/ACTION_LEDGER_JSON>|$)/gi, "")
  .replace(/^\s*(?:[-*]|\d+[.)])?\s*证据(?:编号)?\s*[:：][^\n\r]*[SMOCX]-[A-Z0-9]+-\d{3}[^\n\r]*$/gmi, "")
  .replace(/\s*[（(]?\s*证据(?:编号)?\s*[:：][^)）\n\r]*[SMOCX]-[A-Z0-9]+-\d{3}[^)）\n\r]*[)）]?/g, "")
  .replace(/[ \t]+$/gm, "")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const splitBuffer = (buffer, delimiter) => {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(delimiter, start);
  while (index !== -1) {
    parts.push(buffer.subarray(start, index));
    start = index + delimiter.length;
    index = buffer.indexOf(delimiter, start);
  }
  parts.push(buffer.subarray(start));
  return parts;
};

const parseMultipart = (buffer, contentType = "") => {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) throw new Error("Missing multipart boundary");
  const delimiter = Buffer.from(`--${boundary}`);
  const headerDelimiter = Buffer.from("\r\n\r\n");
  const fields = {};
  const files = [];
  splitBuffer(buffer, delimiter).forEach((rawPart) => {
    let part = rawPart;
    if (!part.length || part.equals(Buffer.from("--\r\n")) || part.equals(Buffer.from("--"))) return;
    if (part.subarray(0, 2).toString() === "\r\n") part = part.subarray(2);
    if (part.subarray(part.length - 2).toString() === "\r\n") part = part.subarray(0, part.length - 2);
    if (part.subarray(part.length - 2).toString() === "--") part = part.subarray(0, part.length - 2);
    const headerEnd = part.indexOf(headerDelimiter);
    if (headerEnd < 0) return;
    const headers = part.subarray(0, headerEnd).toString("utf8");
    const content = part.subarray(headerEnd + headerDelimiter.length);
    const disposition = headers.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || "";
    const name = disposition.match(/name="([^"]+)"/)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/)?.[1];
    if (!name) return;
    if (filename) files.push({ fieldName: name, filename, content });
    else fields[name] = content.toString("utf8");
  });
  return { fields, files };
};

const handleUpload = async (req, res) => {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  const user = await ensureApiAllowed(req, res);
  if (!user) return;
  const body = await readBufferBody(req);
  const { fields, files } = parseMultipart(body, req.headers["content-type"] || "");
  const manifest = JSON.parse(fields.manifest || "[]");
  const metaByName = new Map(manifest.map((item) => [`${item.module || "UNKNOWN"}::${item.name}`, item]));
  const saved = [];
  await fs.mkdir(uploadDir, { recursive: true });
  for (const file of files) {
    const candidates = manifest.filter((item) => item.name === file.filename);
    const declared = candidates[0] || {};
    const moduleName = sanitizeSegment(declared.module || "UNKNOWN");
    const targetDir = path.join(uploadDir, moduleName);
    await fs.mkdir(targetDir, { recursive: true });
    const safeName = sanitizeSegment(file.filename);
    const targetPath = path.join(targetDir, safeName);
    await fs.writeFile(targetPath, file.content);
    const manifestItem = metaByName.get(`${declared.module || moduleName}::${file.filename}`) || declared;
    saved.push({
      ...manifestItem,
      name: file.filename,
      module: declared.module || moduleName,
      size: file.content.length,
      serverFile: `/api/uploads/${encodeURIComponent(moduleName)}/${encodeURIComponent(safeName)}`,
      uploadedAt: new Date().toISOString(),
    });
  }
  return sendJson(res, 200, { files: saved });
};

const handleUploadedFile = async (req, res) => {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
  const user = await ensureApiAllowed(req, res);
  if (!user) return;
  const match = req.url.match(/^\/api\/uploads\/([^/]+)\/([^?#]+)/);
  if (!match) return sendJson(res, 404, { error: "Upload not found" });
  const moduleName = sanitizeSegment(decodeURIComponent(match[1]));
  const fileName = sanitizeSegment(decodeURIComponent(match[2]));
  const filePath = path.normalize(path.join(uploadDir, moduleName, fileName));
  if (!filePath.startsWith(path.join(uploadDir, moduleName))) return sendJson(res, 403, { error: "Forbidden" });
  try {
    await fs.stat(filePath);
  } catch {
    return sendJson(res, 404, { error: "Upload not found" });
  }
  res.writeHead(200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(res);
};

const safeKeyPath = (key) => {
  if (!allowedKeys.has(key)) return null;
  return path.join(stateDir, `${key}.json`);
};

const readJsonFile = async (filePath) => {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

const backupCorruptFile = async (filePath, error) => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${filePath}.corrupt-${stamp}`;
    await fs.rename(filePath, backupPath);
    console.error(`Corrupt JSON backed up: ${backupPath}`, error);
  } catch (backupError) {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = `${filePath}.corrupt-copy-${stamp}`;
      await fs.copyFile(filePath, backupPath);
      console.error(`Corrupt JSON copied: ${backupPath}`, error);
    } catch (copyError) {
      console.error("Failed to backup corrupt JSON", backupError, copyError);
    }
  }
};

const loadLegacyStateValue = async (key) => {
  try {
    const legacy = await readJsonFile(dataFile);
    return legacy && Object.prototype.hasOwnProperty.call(legacy, key) ? legacy[key] : defaultValueFor(key);
  } catch (error) {
    await backupCorruptFile(dataFile, error);
    return defaultValueFor(key);
  }
};

const loadStateValue = async (key) => {
  const filePath = safeKeyPath(key);
  if (!filePath) return defaultValueFor(key);
  const database = await readPostgresState(key);
  if (database.available && database.found) return database.value;
  try {
    const value = await readJsonFile(filePath);
    if (value !== null) {
      // First read after enabling PostgreSQL migrates the existing JSON cache
      // without requiring a separate deployment script.
      if (database.available && !database.found) await writePostgresState(key, value);
      return value;
    }
  } catch (error) {
    await backupCorruptFile(filePath, error);
    return defaultValueFor(key);
  }
  return await loadLegacyStateValue(key);
};

const writeQueues = new Map();
let oqcRuleCacheTimer = null;
let oqcRuleCacheBuild = null;
let oqcRuleCacheRebuildPending = false;

const oqcRuleCacheSignature = (analysisCache, projectMapping) => JSON.stringify({
  sourceSignature: analysisCache?.sourceSignature || "",
  dateRange: analysisCache?.dateRange || {},
  mappingImportedAt: projectMapping?.rules?.importedAt || "",
  overrides: (projectMapping?.overrides || []).map(({ sourceName, values, updatedAt }) => ({ sourceName, values, updatedAt })),
});

const rebuildOqcEquipmentRuleCache = async () => {
  const [analysisCache, projectMapping, existing] = await Promise.all([
    loadStateValue("analysis-cache"),
    loadStateValue("project-name-mapping"),
    loadStateValue(OQC_EQUIPMENT_RULE_CACHE_KEY),
  ]);
  const dispersion = analysisCache?.data?.oqc?.equipmentDispersion;
  const cacheKey = oqcRuleCacheSignature(analysisCache, projectMapping);
  if (!Array.isArray(dispersion?.sourceRecords) || !dispersion.sourceRecords.length) {
    return await saveStateValue(OQC_EQUIPMENT_RULE_CACHE_KEY, {
      version: 1, ready: false, cacheKey, generatedAt: new Date().toISOString(), results: {},
    });
  }
  if (existing?.ready && existing.cacheKey === cacheKey && existing.results) return existing;
  await saveStateValue(OQC_EQUIPMENT_RULE_CACHE_KEY, {
    version: 1, ready: false, cacheKey, generatedAt: new Date().toISOString(), results: {},
  });
  const results = buildOqcRuleDimensionChartCache(dispersion, projectMapping || {}, oqcRuleDimensionKeys);
  return await saveStateValue(OQC_EQUIPMENT_RULE_CACHE_KEY, {
    version: 1,
    ready: true,
    cacheKey,
    sourceSignature: analysisCache?.sourceSignature || "",
    dateRange: analysisCache?.dateRange || {},
    mappingImportedAt: projectMapping?.rules?.importedAt || "",
    generatedAt: new Date().toISOString(),
    results,
  });
};

const queueOqcEquipmentRuleCacheRebuild = () => {
  if (oqcRuleCacheTimer) clearTimeout(oqcRuleCacheTimer);
  oqcRuleCacheTimer = setTimeout(() => {
    oqcRuleCacheTimer = null;
    if (oqcRuleCacheBuild) {
      oqcRuleCacheRebuildPending = true;
      return;
    }
    oqcRuleCacheBuild = rebuildOqcEquipmentRuleCache()
      .catch((error) => console.error("[oqc-cache] Failed to build equipment rule cache", error))
      .finally(() => {
        oqcRuleCacheBuild = null;
        if (oqcRuleCacheRebuildPending) {
          oqcRuleCacheRebuildPending = false;
          queueOqcEquipmentRuleCacheRebuild();
        }
      });
  }, 200);
};

const saveStateValue = async (key, value) => {
  const filePath = safeKeyPath(key);
  if (!filePath) return value;
  const previous = writeQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const database = await writePostgresState(key, value);
    await fs.mkdir(stateDir, { recursive: true });
    const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(value, null, 2), "utf8");
    await fs.rename(tempFile, filePath);
    await fs.writeFile(path.join(stateDir, "updatedAt.json"), JSON.stringify({ updatedAt: new Date().toISOString(), key }, null, 2), "utf8");
    if (!database.available) console.warn(`[storage] Saved ${key} to JSON fallback`);
    return value;
  });
  writeQueues.set(key, next);
  const saved = await next;
  if (key === "analysis-cache" || key === "project-name-mapping") queueOqcEquipmentRuleCacheRebuild();
  return saved;
};

const loadExamSessions = async () => {
  const value = await readJsonFile(examSessionsFile);
  return Array.isArray(value) ? value : [];
};

const saveExamSessions = async (sessions) => {
  await fs.mkdir(dataDir, { recursive: true });
  const tempFile = `${examSessionsFile}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(sessions.slice(-500), null, 2), "utf8");
  await fs.rename(tempFile, examSessionsFile);
};

const examQuestionForClient = (question) => ({
  questionId: String(question.questionId || question.id || ""),
  questionText: String(question.questionText || question.stem || ""),
  type: String(question.type || "SingleChoice"),
  options: Array.isArray(question.options) ? question.options.map((item) => String(item || "")) : [],
  category: String(question.category || question.categories || ""),
});

const examQuestionMatches = (question, answer) => {
  const type = String(question.type || "").toLowerCase();
  if (type.includes("short")) {
    const expected = String(question.answerText || question.correctAnswer || "").trim().replace(/\s+/g, "").toLowerCase();
    return !!expected && expected === String(answer?.textAnswer || "").trim().replace(/\s+/g, "").toLowerCase();
  }
  const expected = (Array.isArray(question.correctAnswers) && question.correctAnswers.length ? question.correctAnswers : [question.answer]).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const actual = Array.isArray(answer?.selectedOptionIndexes) ? answer.selectedOptionIndexes : [answer?.selectedOptionIndex];
  const selected = actual.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  return expected.length > 0 && expected.length === selected.length && expected.every((item, index) => item === selected[index]);
};

const handleExamSessions = async (req, res) => {
  const requestUrl = new URL(req.url, "http://local");
  const pathname = requestUrl.pathname;
  if (pathname === "/api/exam-results" && req.method === "GET") {
    const user = await ensureApiAllowed(req, res);
    if (!user) return;
    const roleName = String(requestUrl.searchParams.get("roleName") || "").trim();
    const recipientName = String(requestUrl.searchParams.get("recipientName") || "").trim();
    const includePending = requestUrl.searchParams.get("includePending") === "true";
    const limit = Math.min(1000, Math.max(1, Number(requestUrl.searchParams.get("limit")) || 300));
    const now = Date.now();
    const records = (await loadExamSessions())
      .filter((session) => (!roleName || session.roleName === roleName) && (!recipientName || session.recipientName === recipientName))
      .map((session) => {
        const result = session.result || {};
        const expired = !session.submittedAt && new Date(session.expiresAt || 0).getTime() < now;
        return {
          id: session.id,
          token: session.token,
          roleName: session.roleName,
          recipientName: session.recipientName,
          issueCategories: session.issueCategories || [],
          knowledgeCandidateKeys: session.knowledgeCandidateKeys || [],
          knowledgeDocumentIds: session.knowledgeDocumentIds || [],
          issueIds: session.issueIds || [],
          reportId: session.reportId || "",
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          submittedAt: session.submittedAt || "",
          status: session.submittedAt ? "completed" : expired ? "expired" : "pending",
          total: Number(result.totalQuestions ?? session.questions?.length ?? 0),
          correct: Number(result.correctAnswers ?? 0),
          score: Number(result.score ?? 0),
          passed: result.isPassed === true,
        };
      })
      .filter((record) => includePending || record.status === "completed")
      .sort((left, right) => String(right.submittedAt || right.createdAt || "").localeCompare(String(left.submittedAt || left.createdAt || "")))
      .slice(0, limit);
    return sendJson(res, 200, { records, updatedAt: new Date().toISOString() });
  }
  if (pathname === "/api/exam-sessions" && req.method === "POST") {
    const user = await ensureApiAllowed(req, res);
    if (!user) return;
    const payload = JSON.parse(await readBody(req) || "{}");
    const questions = (Array.isArray(payload.questions) ? payload.questions : []).map((question) => ({
      questionId: String(question.questionId || question.id || randomUUID()),
      questionText: String(question.questionText || question.stem || "").trim(),
      type: String(question.type || "SingleChoice"),
      options: Array.isArray(question.options) ? question.options.slice(0, 8).map((item) => String(item || "")) : [],
      category: String(question.category || question.categories || ""),
      correctAnswers: Array.isArray(question.correctAnswers) ? question.correctAnswers.map(Number).filter(Number.isFinite) : (Number.isFinite(Number(question.answer)) ? [Number(question.answer)] : []),
      answerText: String(question.answerText || question.correctAnswer || ""),
    })).filter((question) => question.questionText);
    if (!questions.length) return sendJson(res, 400, { error: "没有可关联的考试题目" });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(1, Number(payload.validDays) || 14) * 86400000);
    const session = { id: randomUUID(), token: randomUUID().replaceAll("-", ""), roleName: String(payload.roleName || ""), recipientName: String(payload.recipientName || ""), issueCategories: Array.isArray(payload.issueCategories) ? payload.issueCategories.map(String).slice(0, 20) : [], knowledgeCandidateKeys: Array.isArray(payload.knowledgeCandidateKeys) ? [...new Set(payload.knowledgeCandidateKeys.map(String).filter(Boolean))].slice(0, 50) : [], knowledgeDocumentIds: Array.isArray(payload.knowledgeDocumentIds) ? [...new Set(payload.knowledgeDocumentIds.map(String).filter(Boolean))].slice(0, 50) : [], issueIds: Array.isArray(payload.issueIds) ? [...new Set(payload.issueIds.map(String).filter(Boolean))].slice(0, 200) : [], reportId: String(payload.reportId || ""), createdAt: now.toISOString(), expiresAt: expiresAt.toISOString(), questions, submittedAt: null, result: null };
    const sessions = await loadExamSessions();
    sessions.push(session);
    await saveExamSessions(sessions);
    return sendJson(res, 200, { token: session.token, expiresAt: session.expiresAt, questionCount: questions.length });
  }
  const match = pathname.match(/^\/api\/exam-sessions\/([^/]+)$/);
  if (match && req.method === "GET") {
    const user = await ensureApiAllowed(req, res);
    if (!user) return;
    const session = (await loadExamSessions()).find((item) => item.token === decodeURIComponent(match[1]));
    if (!session || new Date(session.expiresAt).getTime() < Date.now() && !session.submittedAt) return sendJson(res, 404, { error: "答题链接不存在或已失效" });
    return sendJson(res, 200, { id: session.id, token: session.token, roleName: session.roleName, recipientName: session.recipientName, issueCategories: session.issueCategories, knowledgeCandidateKeys: session.knowledgeCandidateKeys || [], knowledgeDocumentIds: session.knowledgeDocumentIds || [], issueIds: session.issueIds || [], expiresAt: session.expiresAt, isSubmitted: !!session.submittedAt, result: session.result, questions: session.submittedAt ? [] : session.questions.map(examQuestionForClient) });
  }
  const submitMatch = pathname.match(/^\/api\/exam-sessions\/([^/]+)\/submit$/);
  if (submitMatch && req.method === "POST") {
    const user = await ensureApiAllowed(req, res);
    if (!user) return;
    const token = decodeURIComponent(submitMatch[1]);
    const sessions = await loadExamSessions();
    const session = sessions.find((item) => item.token === token);
    if (!session) return sendJson(res, 404, { error: "答题链接不存在或已失效" });
    if (session.submittedAt) return sendJson(res, 200, { ...session.result, alreadySubmitted: true });
    if (new Date(session.expiresAt).getTime() < Date.now()) return sendJson(res, 200, { isExpired: true });
    const payload = JSON.parse(await readBody(req) || "{}");
    const answers = Array.isArray(payload.answers) ? payload.answers : [];
    const correct = session.questions.filter((question) => examQuestionMatches(question, answers.find((answer) => String(answer?.questionId) === question.questionId))).length;
    const result = { totalQuestions: session.questions.length, correctAnswers: correct, score: Number((correct / Math.max(session.questions.length, 1) * 100).toFixed(1)), isPassed: correct / Math.max(session.questions.length, 1) >= 0.8, isExpired: false, alreadySubmitted: false, submittedAt: new Date().toISOString() };
    session.submittedAt = result.submittedAt;
    session.result = result;
    session.answers = answers;
    await saveExamSessions(sessions);
    return sendJson(res, 200, result);
  }
  return sendJson(res, 405, { error: "Method not allowed" });
};

const handleApi = async (req, res) => {
  const match = req.url.match(/^\/api\/state\/([^/?#]+)/);
  const key = match?.[1];
  if (!key || !allowedKeys.has(key)) return sendJson(res, 404, { error: "Unknown state key" });
  const user = await ensureApiAllowed(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const value = await loadStateValue(key);
    const view = new URL(req.url, "http://local").searchParams.get("view");
    if (view === "index" && value && typeof value === "object") {
      const index = { ...value, history: Array.isArray(value.history) ? value.history.map((entry) => {
        const { snapshot, ...meta } = entry || {};
        return { ...meta, summary: entry?.summary || {}, peopleCount: Array.isArray(snapshot?.people) ? snapshot.people.length : Number(snapshot?.peopleCount || 0) };
      }) : [] };
      return sendJson(res, 200, { key, value: index });
    }
    return sendJson(res, 200, { key, value: value ?? defaultValueFor(key) });
  }

  if (req.method === "PUT") {
    const payload = JSON.parse(await readBody(req) || "{}");
    const value = await saveStateValue(key, payload.value ?? defaultValueFor(key));
    return sendJson(res, 200, { key, value, updatedAt: new Date().toISOString() });
  }

  return sendJson(res, 405, { error: "Method not allowed" });
};

const handleMe = async (req, res) => {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
  const user = await currentUser(req);
  return sendJson(res, 200, {
    ip: user.ip,
    name: user.name,
    role: user.role,
    isAdmin: user.isAdmin,
    isDeputy: user.isDeputy,
    isOrdinary: user.isOrdinary,
    isIntranetUser: user.isIntranetUser,
    isAuthorized: user.isAuthorized,
    features: user.permissions.features,
  });
};

const handlePermissions = async (req, res) => {
  if (req.method === "GET") {
    const user = await ensureApiAllowed(req, res);
    if (!user) return;
    return sendJson(res, 200, {
      ip: user.ip,
      name: user.name,
      role: user.role,
      isAdmin: user.isAdmin,
      isDeputy: user.isDeputy,
      isOrdinary: user.isOrdinary,
      isAuthorized: user.isAuthorized,
      permissions: user.permissions,
    });
  }
  if (req.method === "PUT") {
    const user = await ensureApiAllowed(req, res);
    if (!user) return;
    if (!user.isAdmin) return sendJson(res, 403, { error: "Only primary admin can edit permissions" });
    const payload = JSON.parse(await readBody(req) || "{}");
    const permissions = await savePermissionConfig(payload.permissions || payload);
    return sendJson(res, 200, { permissions, updatedAt: new Date().toISOString() });
  }
  return sendJson(res, 405, { error: "Method not allowed" });
};

const handleAi = async (req, res) => {
  const user = await currentUser(req);
  const rawPathname = new URL(req.url, "http://local").pathname;
  const legacyChatAlias = rawPathname === "/api/chat";
  const pathname = legacyChatAlias ? "/api/ai/chat" : rawPathname;
  let requestPayload = null;
  const getPayload = async () => {
    if (requestPayload === null) requestPayload = JSON.parse(await readBody(req) || "{}");
    return requestPayload;
  };
  const preliminaryPayload = ["/api/ai/chat", "/api/ai/reports", "/api/ai/agent-dispatch", "/api/ai/agent-reports", "/api/ai/models", "/api/ai/test", "/api/ai/config"].includes(pathname)
    ? (req.method === "POST" ? await getPayload() : {}) : {};
  const isQualityAgentRequest = preliminaryPayload?.feature === "qualityAgent" || preliminaryPayload?.agentTitle === "质量分析 Agent" || preliminaryPayload?.agent === true;
  const operationFeatureKey = preliminaryPayload?.operation === "quality-agent-start"
    ? "qualityAgentStart"
    : preliminaryPayload?.operation === "agent-role-report-generate"
      ? "agentRoleReportGenerate"
      : "";
  const featureKey = operationFeatureKey || (legacyChatAlias ? "aiInterface" : (isQualityAgentRequest || pathname === "/api/ai/skills" || pathname === "/api/ai/agent-dispatch" || pathname.startsWith("/api/ai/agent-reports") ? "qualityAgent" : (["/api/ai/config", "/api/ai/models", "/api/ai/test"].includes(pathname) ? "aiInterface" : "aiAnalysis")));
  const featureRule = user.permissions?.features?.[featureKey] || {};
  const featureAllowed = user.isAdmin || (user.isDeputy ? featureRule.deputy !== false : featureRule.public === true);
  if (!featureAllowed) {
    const featureLabel = { aiInterface: "AI接口", aiAnalysis: "AI分析", qualityAgent: "质量分析 Agent", qualityAgentStart: "启动 Agent 分析", agentRoleReportGenerate: "生成全部角色报告" }[featureKey] || featureKey;
    return sendJson(res, 403, { error: `${featureLabel}权限未开启` });
  }
  if (pathname === "/api/ai/config" && req.method === "GET") return sendJson(res, 200, publicAiConfig(await loadAiConfig()));
  if (pathname === "/api/ai/config" && req.method === "PUT") {
    if (!user.isAdmin) return sendJson(res, 403, { error: "只有主管理员可以更新服务器默认 AI 接口" });
    const payload = await getPayload();
    const config = await configFromPayload(payload);
    if (!config.apiKey || !config.model) return sendJson(res, 400, { error: "服务器默认 AI 接口需要 API 密钥和模型" });
    return sendJson(res, 200, publicAiConfig(await saveAiConfig(config)));
  }
  if (pathname === "/api/ai/reports" && req.method === "POST") {
    if (!user.isAdmin) return sendJson(res, 403, { error: "只有主管理员可以保存报告到服务器" });
    const payload = await getPayload();
    const hasSingleReport = typeof payload.content === "string" && payload.content.trim();
    const hasReportPackage = payload.reports && typeof payload.reports === "object" && !Array.isArray(payload.reports);
    if (!hasSingleReport && !hasReportPackage) return sendJson(res, 400, { error: "报告内容为空，无法保存" });
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const stamp = local.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\.(\d{3})Z$/, "-$1");
    const moduleName = sanitizeSegment(payload.module || (hasReportPackage ? "全部报告包" : "AI分析"));
    const skillName = String(payload.skillName || payload.selectedSkill || "").trim();
    const fileName = "QMS-AI分析-" + moduleName + (skillName ? "-" + sanitizeSegment(skillName) : "") + "-" + stamp + ".json";
    const savedPayload = { ...payload, content: hasSingleReport ? sanitizeHumanReportContent(payload.content.trim()) : payload.content, savedAt: now.toISOString() };
    await fs.mkdir(aiReportDir, { recursive: true });
    await fs.writeFile(path.join(aiReportDir, fileName), JSON.stringify(savedPayload, null, 2), "utf8");
    return sendJson(res, 200, { ok: true, fileName, savedAt: savedPayload.savedAt, relativePath: `outputs/ai_saved_reports/${fileName}` });
  }
  if (pathname === "/api/ai/agent-dispatch" && req.method === "POST") {
    if (!user.isAdmin) return sendJson(res, 403, { error: "只有主管理员可以创建服务器发送任务" });
    const payload = await getPayload();
    if (!payload.reportFileName || !payload.role || !payload.recipient) return sendJson(res, 400, { error: "Agent发送任务缺少报告文件、角色或收件人" });
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const stamp = local.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\.(\d{3})Z$/, "-$1");
    const fileName = `QMS-Agent发送任务-${sanitizeSegment(payload.module || "质量分析")}-${stamp}.json`;
    const savedPayload = { schemaVersion: "quality-agent-dispatch-v1", ...payload, status: "待发送", createdAt: now.toISOString() };
    await fs.mkdir(aiReportDir, { recursive: true });
    await fs.writeFile(path.join(aiReportDir, fileName), JSON.stringify(savedPayload, null, 2), "utf8");
    return sendJson(res, 200, { ok: true, fileName, savedAt: savedPayload.createdAt, relativePath: `outputs/ai_saved_reports/${fileName}`, status: savedPayload.status });
  }
  if (pathname === "/api/ai/agent-dispatch" && req.method === "GET") {
    await fs.mkdir(aiReportDir, { recursive: true });
    const names = await fs.readdir(aiReportDir);
    const tasks = [];
    for (const name of names.filter((item) => /^QMS-Agent.+\.json$/i.test(item))) {
      try {
        const value = JSON.parse(await fs.readFile(path.join(aiReportDir, name), "utf8"));
        tasks.push({ ...value, fileName: name, relativePath: `outputs/ai_saved_reports/${name}` });
      } catch (error) {
        console.warn(`Skip unreadable Agent dispatch file: ${name}`, error);
      }
    }
    tasks.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    return sendJson(res, 200, { tasks: tasks.slice(0, 200) });
  }
  if (pathname === "/api/ai/skills" && req.method === "GET") {
    const skills = [];
    try {
      const entries = await fs.readdir(agentSkillDir, { withFileTypes: true });
      for (const entry of entries.filter((item) => item.isDirectory())) {
        const filePath = path.join(agentSkillDir, entry.name, "SKILL.md");
        try {
          const text = await fs.readFile(filePath, "utf8");
          const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim() || entry.name;
          const description = text.match(/^description:\s*(.+)$/m)?.[1]?.trim() || "项目 Agent 技能";
          skills.push({ id: entry.name, name, description, content: text.slice(0, 60000) });
        } catch {}
      }
    } catch {}
    return sendJson(res, 200, { skills: skills.sort((left, right) => left.name.localeCompare(right.name, "zh-CN")) });
  }
  if (pathname === "/api/ai/agent-reports" && req.method === "POST") {
    if (!user.isAdmin) return sendJson(res, 403, { error: "只有主管理员可以保存 Agent 报告到服务器" });
    const payload = await getPayload();
    const content = sanitizeHumanReportContent(payload.content || "");
    if (!content.trim()) return sendJson(res, 400, { error: "Agent报告内容为空，无法保存" });
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const stamp = local.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\.(\d{3})Z$/, "-$1");
    const layoutProfileId = String(payload.layoutProfileId || payload.layoutSkillName || "research-briefing-v1").trim();
    const safeLayoutProfileId = /^[a-z0-9][a-z0-9-]{0,80}$/i.test(layoutProfileId) ? layoutProfileId : "research-briefing-v1";
    const fileSegments = [payload.module || "质量分析", String(payload.skillName || "").trim(), safeLayoutProfileId, payload.role, payload.recipient].filter(Boolean).map((value) => sanitizeSegment(value));
    const fileName = `QMS-Agent报告-${fileSegments.join("-")}-${stamp}.md`;
    {
    const originalFileName = fileName;
    const modelName = String(payload.model || "").trim();
    const creatorIp = String(user.ip || "").trim();
    const finalFileName = `${originalFileName.slice(0, -3)}-model-${sanitizeSegment(modelName || "unknown")}-ip-${sanitizeSegment(creatorIp || "unknown")}.md`;
    await fs.mkdir(aiReportDir, { recursive: true });
    const filePath = path.join(aiReportDir, finalFileName);
    const metadata = { fileName: finalFileName, module: String(payload.module || "质量分析"), role: String(payload.role || ""), recipient: String(payload.recipient || ""), skillName: String(payload.skillName || ""), layoutProfileId: safeLayoutProfileId, layoutSkillName: safeLayoutProfileId, period: payload.period && typeof payload.period === "object" ? payload.period : {}, visualSpec: payload.visualSpec && typeof payload.visualSpec === "object" ? payload.visualSpec : null, savedAt: now.toISOString(), updatedAt: now.toISOString(), relativePath: `outputs/ai_saved_reports/${finalFileName}` };
    metadata.model = modelName;
    metadata.creatorIp = creatorIp;
    await fs.writeFile(filePath, content, "utf8");
    await fs.writeFile(`${filePath}.json`, JSON.stringify(metadata, null, 2), "utf8");
    const database = await writePostgresAgentReport({ ...metadata, content });
    return sendJson(res, 200, { ok: true, ...metadata, storage: database.available ? "postgres+file" : "file" });
    }
  }
  if (pathname === "/api/ai/agent-reports" && req.method === "GET") {
    await fs.mkdir(aiReportDir, { recursive: true });
    const query = new URL(req.url, "http://local").searchParams;
    const requestedModule = String(query.get("module") || "").trim();
    const requestedRole = String(query.get("role") || "").trim();
    const requestedRecipient = String(query.get("recipient") || "").trim();
    const limit = Math.min(200, Math.max(1, Number(query.get("limit") || 200)));
    const offset = Math.max(0, Number(query.get("offset") || 0));
    const database = await listPostgresAgentReports({ module: requestedModule, role: requestedRole, recipient: requestedRecipient, limit, offset });
    if (database.available) {
      return sendJson(res, 200, {
        reports: database.reports.map((item) => ({ ...item, relativePath: `outputs/ai_saved_reports/${item.fileName}` })),
        total: database.total,
        limit,
        offset,
        storage: "postgres",
      });
    }
    const names = await fs.readdir(aiReportDir);
    const reports = [];
    for (const name of names.filter((item) => /^QMS-Agent报告-.+\.md$/i.test(item))) {
      const filePath = path.join(aiReportDir, name);
      const stat = await fs.stat(filePath);
      let metadata = {};
      try { metadata = JSON.parse(await fs.readFile(`${filePath}.json`, "utf8")); } catch {}
      const layoutProfileId = metadata.layoutProfileId || metadata.layoutSkillName || (name.match(/-(research-briefing-v1)-/)?.[1] || "research-briefing-v1");
      const fallbackModuleMatch = !requestedModule || name.startsWith(`QMS-Agent报告-${sanitizeSegment(requestedModule)}-`);
      const fallbackRoleMatch = !requestedRole || name.includes(`-${sanitizeSegment(requestedRole)}-`);
      const fallbackRecipientMatch = !requestedRecipient || name.includes(`-${sanitizeSegment(requestedRecipient)}-`);
      if (requestedModule && (metadata.module ? metadata.module !== requestedModule : !fallbackModuleMatch)) continue;
      if (requestedRole && (metadata.role ? metadata.role !== requestedRole : !fallbackRoleMatch)) continue;
      if (requestedRecipient && (metadata.recipient ? metadata.recipient !== requestedRecipient : !fallbackRecipientMatch)) continue;
      reports.push({ ...metadata, fileName: name, layoutProfileId, layoutSkillName: layoutProfileId, relativePath: `outputs/ai_saved_reports/${name}`, size: stat.size, updatedAt: metadata.updatedAt || stat.mtime.toISOString() });
    }
    reports.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    return sendJson(res, 200, { reports: reports.slice(offset, offset + limit), total: reports.length, limit, offset, storage: "file" });
  }
  const agentReportMatch = pathname.match(/^\/api\/ai\/agent-reports\/([^/]+)$/);
  if (agentReportMatch) {
    const fileName = decodeURIComponent(agentReportMatch[1]);
    if (!/^QMS-Agent报告-.+\.md$/i.test(fileName) || fileName.includes("..")) return sendJson(res, 400, { error: "无效的 Agent 报告文件" });
    const filePath = path.join(aiReportDir, fileName);
    if (req.method === "GET") {
      // The report is always written to the project report directory when it
      // is saved. Read that file first so a slow/unavailable PostgreSQL pool
      // cannot leave history-report requests hanging indefinitely. PostgreSQL
      // remains the fallback for reports that were stored before file export
      // was enabled.
      try {
        const layoutProfileId = fileName.match(/-(research-briefing-v1)-/)?.[1] || "research-briefing-v1";
        let metadata = {};
        try { metadata = JSON.parse(await fs.readFile(`${filePath}.json`, "utf8")); } catch {}
        const content = await fs.readFile(filePath, "utf8");
        return sendJson(res, 200, { ...metadata, fileName, layoutProfileId: metadata.layoutProfileId || metadata.layoutSkillName || layoutProfileId, layoutSkillName: metadata.layoutProfileId || metadata.layoutSkillName || layoutProfileId, content });
      } catch {}
      const database = await readPostgresAgentReport(fileName);
      if (database.available && database.found) {
        return sendJson(res, 200, { ...database.report, relativePath: `outputs/ai_saved_reports/${fileName}` });
      }
      return sendJson(res, 404, { error: "Agent 报告不存在" });
    }
    if (req.method === "DELETE") {
      if (!user.isAdmin) return sendJson(res, 403, { error: "只有主管理员可以删除服务器 Agent 报告" });
      const database = await deletePostgresAgentReport(fileName);
      let fileDeleted = false;
      try { await fs.unlink(filePath); fileDeleted = true; } catch {}
      await fs.unlink(`${filePath}.json`).catch(() => {});
      if (database.deleted || fileDeleted) return sendJson(res, 200, { ok: true, fileName });
      return sendJson(res, 404, { error: "Agent 报告不存在" });
    }
  }
  if (pathname === "/api/ai/models" && (req.method === "GET" || req.method === "POST")) {
    const config = req.method === "POST" ? await configFromPayload(await getPayload()) : await loadAiConfig();
    if (usesArkPlanResponses(config)) return sendJson(res, 200, { models: ["ark-code-latest"], configuredModel: config.model, manualOnly: true });
    const result = await requestAi(config, "/models", { method: "GET", headers: { "Content-Type": undefined } });
    const models = (Array.isArray(result?.data) ? result.data : []).map((item) => String(item?.id || "").trim()).filter(Boolean).sort();
    aiModelCatalog.set(aiCatalogKey(config), { models, updatedAt: Date.now() });
    return sendJson(res, 200, { models, configuredModel: config.model });
  }
  if (pathname === "/api/ai/test" && req.method === "POST") {
    const payload = await getPayload();
    const config = await configFromPayload(payload);
    if (!config.model) return sendJson(res, 400, { error: "Please select or enter a model" });
    assertKnownAiModel(config);
    // Keep the connectivity probe minimal: some compatible gateways reject optional sampling fields.
    const arkPlan = usesArkPlanResponses(config);
    const result = await requestAi(config, arkPlan ? "/responses" : "/chat/completions", { method: "POST", body: JSON.stringify(arkPlan ? { model: config.model, input: [{ role: "user", content: "Reply with exactly: QMS AI OK" }], max_output_tokens: 20 } : { model: config.model, messages: [{ role: "user", content: "Reply with exactly: QMS AI OK" }] }) });
    const content = extractAiContent(result);
    return sendJson(res, 200, { ok: true, model: config.model, response: String(content).slice(0, 200) });
  }
  if (pathname === "/api/ai/chat" && req.method === "POST") {
    const payload = await getPayload();
    const config = await configFromPayload(payload);
    if (!config.model) return sendJson(res, 400, { error: "AI model is not configured" });
    assertKnownAiModel(config);
    const messages = Array.isArray(payload.messages)
      ? payload.messages.slice(-20).map((item) => ({ role: ["system", "assistant", "user"].includes(item?.role) ? item.role : "user", content: String(item?.content || "").slice(0, 120000) }))
      : (legacyChatAlias && [payload.prompt, payload.message, payload.content].some((value) => String(value || "").trim())
        ? [{ role: "user", content: String(payload.prompt || payload.message || payload.content).slice(0, 120000) }]
        : []);
    if (!messages.length) return sendJson(res, 400, { error: "messages is required" });
    const requestedMaxTokens = Number(payload.max_tokens);
    const maxTokens = Number.isFinite(requestedMaxTokens) ? Math.min(12000, Math.max(256, Math.round(requestedMaxTokens))) : null;
    const arkPlan = usesArkPlanResponses(config);
    const stream = payload.stream === true;
    const responsesApi = arkPlan || payload.responses === true;
    const requestBody = responsesApi ? { model: config.model, input: messages } : { model: config.model, messages, response_format: payload.response_format };
    if (stream) requestBody.stream = true;
    if (maxTokens) {
      if (responsesApi) requestBody.max_output_tokens = maxTokens;
      // GPT-5/o-series compatible gateways use max_completion_tokens; legacy models use max_tokens.
      else if (/^(gpt-5|o[1-9]|codex)/i.test(config.model)) requestBody.max_completion_tokens = maxTokens;
      else requestBody.max_tokens = maxTokens;
    }
    if (!responsesApi && Number.isFinite(Number(payload.temperature))) requestBody.temperature = Number(payload.temperature);
    const clientController = new AbortController();
    const abortForDisconnect = () => {
      if (!res.writableEnded && !clientController.signal.aborted) clientController.abort();
    };
    req.once("aborted", abortForDisconnect);
    res.once("close", abortForDisconnect);
    let result;
    try {
      result = await requestAi(config, responsesApi ? "/responses" : "/chat/completions", { method: "POST", body: JSON.stringify(requestBody), stream, signal: clientController.signal });
    } finally {
      req.removeListener("aborted", abortForDisconnect);
      res.removeListener("close", abortForDisconnect);
    }
    return sendJson(res, 200, { model: config.model, content: extractAiContent(result), usage: result?.usage || null });
  }
  return sendJson(res, 404, { error: "Unknown AI endpoint" });
};

const staticPathFor = (url) => {
  const pathname = decodeURIComponent(new URL(url, "http://local").pathname);
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) return null;
  return filePath;
};

const serveStatic = async (req, res) => {
  let filePath = staticPathFor(req.url);
  if (!filePath) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(publicDir, "index.html");
  }

  if (/^default(?:Analysis|Sources|QmsSources)\.json(?:\.gz)?$/i.test(path.basename(filePath))) {
    const user = await currentUser(req);
    if (!user.isAuthorized) return sendJson(res, 403, { error: "Access denied: IP is not registered", ip: user.ip });
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=31536000, immutable",
  });
  createReadStream(filePath).pipe(res);
};

const server = createServer(async (req, res) => {
  try {
    if (req.url === "/api/me") return await handleMe(req, res);
    if (req.url === "/api/permissions") return await handlePermissions(req, res);
    if (req.url.startsWith("/api/knowledge")) return await handleKnowledge(req, res);
    if (req.url.startsWith("/api/ai/") || new URL(req.url, "http://local").pathname === "/api/chat") return await handleAi(req, res);
    if (req.url.startsWith("/api/exam-sessions") || req.url.startsWith("/api/exam-results")) return await handleExamSessions(req, res);
    if (req.url.startsWith("/api/uploads/")) return await handleUploadedFile(req, res);
    if (req.url === "/api/uploads") return await handleUpload(req, res);
    if (req.url.startsWith("/api/")) return await handleApi(req, res);
    return await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    if (error?.name === "AbortError" || res.destroyed || res.writableEnded) return;
    if (req.url.startsWith("/api/ai/")) {
      return sendJson(res, 502, { error: String(error?.message || "AI接口调用失败").slice(0, 1000) });
    }
    return sendJson(res, 500, { error: "Internal server error" });
  }
});

const startServer = async () => {
  const storage = await initPostgres();
  console.log(`[storage] PostgreSQL ${storage.available ? "enabled" : (storage.configured ? "unavailable; using JSON fallback" : "not configured; using JSON")}`);
  if (storage.available) {
    const migration = await migrateAgentReportFilesToPostgres();
    console.log(`[storage] Agent reports ready in PostgreSQL (${migration.migrated} migrated / ${migration.total} files)`);
  }
  await knowledgeService.resume();
  queueOqcEquipmentRuleCacheRebuild();
  server.listen(port, host, () => {
    console.log(`QMS server listening on http://${host}:${port}`);
  });
};
startServer().catch((error) => {
  console.error("Failed to initialize QMS server", error);
  server.listen(port, host, () => console.log(`QMS server listening on http://${host}:${port}`));
});
