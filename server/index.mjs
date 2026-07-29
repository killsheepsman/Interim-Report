import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "dist");
const dataDir = process.env.QMS_DATA_DIR || path.join(rootDir, "data");
const dataFile = path.join(dataDir, "shared-state.json");
const stateDir = path.join(dataDir, "state");
const uploadDir = path.join(dataDir, "uploads");
const aiReportDir = path.resolve(rootDir, "..", "outputs", "ai_saved_reports");
const agentSkillDir = path.join(rootDir, "skills");
const adminIpsFile = path.join(dataDir, "admin-ips.json");
const permissionFile = path.join(dataDir, "permission-config.json");
const aiConfigFile = path.join(dataDir, "ai-config.json");
const examSessionsFile = path.join(dataDir, "exam-sessions.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const trustProxy = process.env.TRUST_PROXY === "true";
const maxBodyBytes = Number(process.env.MAX_BODY_MB || 1024) * 1024 * 1024;
const allowedKeys = new Set(["imported-sources", "analysis-cache", "applied-date-range", "dqa-engineer-supplement"]);
const defaultValueFor = (key) => key === "analysis-cache" || key === "applied-date-range" || key === "dqa-engineer-supplement" ? null : [];
// Local temporary admin entries remain only in the local worktree.
const TEMP_LOCAL_ADMIN_IPS = [];


const defaultPermissionConfig = {
  deputyAdmins: [],
  ordinaryUsers: [],
  allowIntranetUsers: false,
  features: {
    dataImport: { public: false, deputy: true, label: "????" },
    workspace: { public: false, deputy: true, label: "?????" },
    annotationEdit: { public: false, deputy: true, label: "??????" },
    annotationView: { public: false, deputy: true, label: "????" },
    exportReport: { public: true, deputy: true, label: "????" },
    dateTemporaryRefresh: { public: true, deputy: true, label: "??????" },
    aiAnalysis: { public: false, deputy: true, label: "AI??" },
    aiInterface: { public: false, deputy: true, label: "AI??" },
    qualityAgent: { public: true, deputy: true, label: "???? Agent" },
  },
  apis: {
    "POST /api/uploads": { public: false, deputy: true, label: "????Excel" },
    "PUT /api/state/imported-sources": { public: false, deputy: true, label: "???????" },
    "PUT /api/state/analysis-cache": { public: false, deputy: true, label: "??????" },
    "PUT /api/state/applied-date-range": { public: false, deputy: true, label: "??????" },
    "PUT /api/permissions": { public: false, deputy: false, label: "??????" },
    "GET /api/state/analysis-cache": { public: true, deputy: true, label: "??????" },
    "GET /api/state/imported-sources": { public: true, deputy: true, label: "???????" },
    "GET /api/state/applied-date-range": { public: true, deputy: true, label: "??????" },
    "GET /api/uploads/*": { public: true, deputy: true, label: "????Excel" },
    "POST /api/exam-sessions": { public: false, deputy: true, label: "????????" },
    "GET /api/exam-sessions/*": { public: true, deputy: true, label: "??????" },
    "POST /api/exam-sessions/*/submit": { public: true, deputy: true, label: "??????" },
    "GET /api/me": { public: true, deputy: true, label: "??????" },
    "GET /api/permissions": { public: true, deputy: true, label: "??????" },
  },
};

defaultPermissionConfig.apis["PUT /api/state/dqa-engineer-supplement"] = { public: false, deputy: true, label: "??? ECN/?BOM/??" };
defaultPermissionConfig.apis["GET /api/state/dqa-engineer-supplement"] = { public: true, deputy: true, label: "??? ECN/?BOM/??" };

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

const sendJson = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
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
    if (error.code !== "ENOENT") console.error("Failed to load AI config", error);
    return { ...defaultAiConfig };
  }
};
const saveAiConfig = async (config) => {
  const current = await loadAiConfig();
  const next = {
    baseUrl: normalizeAiBaseUrl(config.baseUrl || current.baseUrl),
    model: String(config.model ?? current.model ?? "").trim(),
    apiKey: String(config.apiKey || "").trim() || current.apiKey,
  };
  await fs.mkdir(dataDir, { recursive: true });
  const temporary = `${aiConfigFile}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, aiConfigFile);
  return next;
};
const publicAiConfig = (config) => ({ baseUrl: config.baseUrl, model: config.model, hasApiKey: !!config.apiKey, apiKeyHint: config.apiKey ? `????${config.apiKey.slice(-4)}` : "" });
const usesArkPlanResponses = (config) => /\/api\/plan\/v3\/?$/i.test(config.baseUrl || "");
const aiCatalogKey = (config) => `${config.baseUrl}|${config.apiKey.slice(-8)}`;
const assertKnownAiModel = (config) => {
  const catalog = aiModelCatalog.get(aiCatalogKey(config));
  if (catalog?.models?.length && !catalog.models.includes(config.model)) {
    throw new Error(`?? ${config.model} ???? API ????????????????????????`);
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
const requestAi = async (config, pathname, options = {}) => {
  if (!config.apiKey) throw new Error("Please configure the API key first");
  const controller = new AbortController();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 300000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requestHeaders = { Authorization: `Bearer ${config.apiKey}`, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) };
    Object.keys(requestHeaders).forEach((key) => requestHeaders[key] == null && delete requestHeaders[key]);
    const response = await fetch(`${config.baseUrl}${pathname}`, {
      ...options,
      signal: controller.signal,
      headers: requestHeaders,
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: { message: text.slice(0, 500) || "Invalid AI response" } }; }
    if (!response.ok) {
      if (response.status === 504) throw new Error("AI???????504?????????????????????????????");
      const upstreamMessage = body?.error?.message || body?.message || text.slice(0, 500) || "No error detail returned";
      if (response.status === 404 && /model.+not supported|no available channel/i.test(upstreamMessage)) {
        throw new Error(`?? API ??/??????? ${config.model}????AI????????????????????????${pathname}`);
      }
      throw new Error(`AI???? ${response.status}?${upstreamMessage}`);
    }
    return body;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`AI????${Math.round(timeoutMs / 1000)}???????????????????`);
    throw error;
  } finally {
    clearTimeout(timeout);
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
    merged.features[key] = { ...value, ...(config.features?.[key] || {}) };
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
    name: deputy?.name || ordinary?.name || (isAdmin ? "????" : isIntranetUser ? "??????" : ""),
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
  if (req.method === "GET" && pathname.startsWith("/api/uploads/")) return "GET /api/uploads/*";
  if (req.method === "GET" && /^\/api\/exam-sessions\/[^/]+$/.test(pathname)) return "GET /api/exam-sessions/*";
  if (req.method === "POST" && /^\/api\/exam-sessions\/[^/]+\/submit$/.test(pathname)) return "POST /api/exam-sessions/*/submit";
  if (pathname.startsWith("/api/state/")) return `${req.method} ${pathname}`;
  return `${req.method} ${pathname}`;
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
  try {
    const value = await readJsonFile(filePath);
    if (value !== null) return value;
  } catch (error) {
    await backupCorruptFile(filePath, error);
    return defaultValueFor(key);
  }
  return await loadLegacyStateValue(key);
};

const writeQueues = new Map();
const saveStateValue = async (key, value) => {
  const filePath = safeKeyPath(key);
  if (!filePath) return value;
  const previous = writeQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    await fs.mkdir(stateDir, { recursive: true });
    const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(value, null, 2), "utf8");
    await fs.rename(tempFile, filePath);
    await fs.writeFile(path.join(stateDir, "updatedAt.json"), JSON.stringify({ updatedAt: new Date().toISOString(), key }, null, 2), "utf8");
    return value;
  });
  writeQueues.set(key, next);
  return await next;
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
  const pathname = new URL(req.url, "http://local").pathname;
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
    if (!questions.length) return sendJson(res, 400, { error: "??????????" });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(1, Number(payload.validDays) || 14) * 86400000);
    const session = { id: randomUUID(), token: randomUUID().replaceAll("-", ""), roleName: String(payload.roleName || ""), recipientName: String(payload.recipientName || ""), issueCategories: Array.isArray(payload.issueCategories) ? payload.issueCategories.map(String).slice(0, 20) : [], reportId: String(payload.reportId || ""), createdAt: now.toISOString(), expiresAt: expiresAt.toISOString(), questions, submittedAt: null, result: null };
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
    if (!session || new Date(session.expiresAt).getTime() < Date.now() && !session.submittedAt) return sendJson(res, 404, { error: "???????????" });
    return sendJson(res, 200, { id: session.id, token: session.token, roleName: session.roleName, recipientName: session.recipientName, issueCategories: session.issueCategories, expiresAt: session.expiresAt, isSubmitted: !!session.submittedAt, result: session.result, questions: session.submittedAt ? [] : session.questions.map(examQuestionForClient) });
  }
  const submitMatch = pathname.match(/^\/api\/exam-sessions\/([^/]+)\/submit$/);
  if (submitMatch && req.method === "POST") {
    const user = await ensureApiAllowed(req, res);
    if (!user) return;
    const token = decodeURIComponent(submitMatch[1]);
    const sessions = await loadExamSessions();
    const session = sessions.find((item) => item.token === token);
    if (!session) return sendJson(res, 404, { error: "???????????" });
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
  const pathname = new URL(req.url, "http://local").pathname;
  let requestPayload = null;
  const getPayload = async () => {
    if (requestPayload === null) requestPayload = JSON.parse(await readBody(req) || "{}");
    return requestPayload;
  };
  const preliminaryPayload = pathname === "/api/ai/chat" || pathname === "/api/ai/reports" || pathname === "/api/ai/agent-dispatch" || pathname === "/api/ai/agent-reports"
    ? (req.method === "POST" ? await getPayload() : {}) : {};
  const isQualityAgentRequest = preliminaryPayload?.feature === "qualityAgent" || preliminaryPayload?.agentTitle === "???? Agent" || preliminaryPayload?.agent === true;
  const featureKey = isQualityAgentRequest || pathname === "/api/ai/skills" || pathname === "/api/ai/agent-dispatch" || pathname.startsWith("/api/ai/agent-reports") ? "qualityAgent" : (["/api/ai/config", "/api/ai/models", "/api/ai/test"].includes(pathname) ? "aiInterface" : "aiAnalysis");
  const featureRule = user.permissions?.features?.[featureKey] || {};
  const featureAllowed = user.isAdmin || (user.isDeputy ? featureRule.deputy !== false : featureRule.public === true);
  if (!featureAllowed) return sendJson(res, 403, { error: `${featureKey === "aiInterface" ? "AI??" : featureKey === "qualityAgent" ? "???? Agent" : "AI??"}?????` });
  if (pathname === "/api/ai/config" && req.method === "GET") return sendJson(res, 200, publicAiConfig(await loadAiConfig()));
  if (pathname === "/api/ai/config" && req.method === "PUT") {
    const payload = await getPayload();
    return sendJson(res, 200, publicAiConfig(await saveAiConfig(payload)));
  }
  if (pathname === "/api/ai/reports" && req.method === "POST") {
    const payload = await getPayload();
    const hasSingleReport = typeof payload.content === "string" && payload.content.trim();
    const hasReportPackage = payload.reports && typeof payload.reports === "object" && !Array.isArray(payload.reports);
    if (!hasSingleReport && !hasReportPackage) return sendJson(res, 400, { error: "???????????" });
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const stamp = local.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\.(\d{3})Z$/, "-$1");
    const moduleName = sanitizeSegment(payload.module || (hasReportPackage ? "?????" : "AI??"));
    const fileName = `QMS-AI??-${moduleName}-${stamp}.json`;
    const savedPayload = { ...payload, content: hasSingleReport ? payload.content.trim() : payload.content, savedAt: now.toISOString() };
    await fs.mkdir(aiReportDir, { recursive: true });
    await fs.writeFile(path.join(aiReportDir, fileName), JSON.stringify(savedPayload, null, 2), "utf8");
    return sendJson(res, 200, { ok: true, fileName, savedAt: savedPayload.savedAt, relativePath: `outputs/ai_saved_reports/${fileName}` });
  }
  if (pathname === "/api/ai/agent-dispatch" && req.method === "POST") {
    const payload = await getPayload();
    if (!payload.reportFileName || !payload.role || !payload.recipient) return sendJson(res, 400, { error: "Agent?????????????????" });
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const stamp = local.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\.(\d{3})Z$/, "-$1");
    const fileName = `QMS-Agent????-${sanitizeSegment(payload.module || "????")}-${stamp}.json`;
    const savedPayload = { schemaVersion: "quality-agent-dispatch-v1", ...payload, status: "???", createdAt: now.toISOString() };
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
          const description = text.match(/^description:\s*(.+)$/m)?.[1]?.trim() || "?? Agent ??";
          skills.push({ id: entry.name, name, description, content: text.slice(0, 60000) });
        } catch {}
      }
    } catch {}
    return sendJson(res, 200, { skills: skills.sort((left, right) => left.name.localeCompare(right.name, "zh-CN")) });
  }
  if (pathname === "/api/ai/agent-reports" && req.method === "POST") {
    const payload = await getPayload();
    const content = String(payload.content || "");
    if (!content.trim()) return sendJson(res, 400, { error: "Agent???????????" });
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const stamp = local.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\.(\d{3})Z$/, "-$1");
    const fileSegments = [payload.module || "????", payload.role, payload.recipient].filter(Boolean).map((value) => sanitizeSegment(value));
    const fileName = `QMS-Agent??-${fileSegments.join("-")}-${stamp}.md`;
    await fs.mkdir(aiReportDir, { recursive: true });
    await fs.writeFile(path.join(aiReportDir, fileName), content, "utf8");
    return sendJson(res, 200, { ok: true, fileName, savedAt: now.toISOString(), relativePath: `outputs/ai_saved_reports/${fileName}` });
  }
  if (pathname === "/api/ai/agent-reports" && req.method === "GET") {
    await fs.mkdir(aiReportDir, { recursive: true });
    const names = await fs.readdir(aiReportDir);
    const reports = [];
    for (const name of names.filter((item) => /^QMS-Agent??-.+\.md$/i.test(item))) {
      const stat = await fs.stat(path.join(aiReportDir, name));
      reports.push({ fileName: name, relativePath: `outputs/ai_saved_reports/${name}`, size: stat.size, updatedAt: stat.mtime.toISOString() });
    }
    reports.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    return sendJson(res, 200, { reports: reports.slice(0, 200) });
  }
  const agentReportMatch = pathname.match(/^\/api\/ai\/agent-reports\/([^/]+)$/);
  if (agentReportMatch) {
    const fileName = decodeURIComponent(agentReportMatch[1]);
    if (!/^QMS-Agent??-.+\.md$/i.test(fileName) || fileName.includes("..")) return sendJson(res, 400, { error: "??? Agent ????" });
    const filePath = path.join(aiReportDir, fileName);
    if (req.method === "GET") {
      try { return sendJson(res, 200, { fileName, content: await fs.readFile(filePath, "utf8") }); }
      catch { return sendJson(res, 404, { error: "Agent ?????" }); }
    }
    if (req.method === "DELETE") {
      try { await fs.unlink(filePath); return sendJson(res, 200, { ok: true, fileName }); }
      catch { return sendJson(res, 404, { error: "Agent ?????" }); }
    }
  }
  if (pathname === "/api/ai/models" && req.method === "GET") {
    const config = await loadAiConfig();
    if (usesArkPlanResponses(config)) return sendJson(res, 200, { models: ["ark-code-latest"], configuredModel: config.model, manualOnly: true });
    const result = await requestAi(config, "/models", { method: "GET", headers: { "Content-Type": undefined } });
    const models = (Array.isArray(result?.data) ? result.data : []).map((item) => String(item?.id || "").trim()).filter(Boolean).sort();
    aiModelCatalog.set(aiCatalogKey(config), { models, updatedAt: Date.now() });
    return sendJson(res, 200, { models, configuredModel: config.model });
  }
  if (pathname === "/api/ai/test" && req.method === "POST") {
    const payload = await getPayload();
    const config = await saveAiConfig(payload);
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
    const config = await loadAiConfig();
    if (!config.model) return sendJson(res, 400, { error: "AI model is not configured" });
    assertKnownAiModel(config);
    const messages = Array.isArray(payload.messages) ? payload.messages.slice(-20).map((item) => ({ role: ["system", "assistant", "user"].includes(item?.role) ? item.role : "user", content: String(item?.content || "").slice(0, 120000) })) : [];
    if (!messages.length) return sendJson(res, 400, { error: "messages is required" });
    const requestedMaxTokens = Number(payload.max_tokens);
    const maxTokens = Number.isFinite(requestedMaxTokens) ? Math.min(12000, Math.max(256, Math.round(requestedMaxTokens))) : null;
    const arkPlan = usesArkPlanResponses(config);
    const requestBody = arkPlan ? { model: config.model, input: messages } : { model: config.model, messages, response_format: payload.response_format };
    if (maxTokens) {
      if (arkPlan) requestBody.max_output_tokens = maxTokens;
      // GPT-5/o-series compatible gateways use max_completion_tokens; legacy models use max_tokens.
      else if (/^(gpt-5|o[1-9]|codex)/i.test(config.model)) requestBody.max_completion_tokens = maxTokens;
      else requestBody.max_tokens = maxTokens;
    }
    if (!arkPlan && Number.isFinite(Number(payload.temperature))) requestBody.temperature = Number(payload.temperature);
    const result = await requestAi(config, arkPlan ? "/responses" : "/chat/completions", { method: "POST", body: JSON.stringify(requestBody) });
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
    if (req.url.startsWith("/api/ai/")) return await handleAi(req, res);
    if (req.url.startsWith("/api/exam-sessions")) return await handleExamSessions(req, res);
    if (req.url.startsWith("/api/uploads/")) return await handleUploadedFile(req, res);
    if (req.url === "/api/uploads") return await handleUpload(req, res);
    if (req.url.startsWith("/api/")) return await handleApi(req, res);
    return await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    if (req.url.startsWith("/api/ai/")) {
      return sendJson(res, 502, { error: String(error?.message || "AI??????").slice(0, 1000) });
    }
    return sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(port, host, () => {
  console.log(`QMS server listening on http://${host}:${port}`);
});

