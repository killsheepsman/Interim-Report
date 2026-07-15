import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "dist");
const dataDir = process.env.QMS_DATA_DIR || path.join(rootDir, "data");
const dataFile = path.join(dataDir, "shared-state.json");
const stateDir = path.join(dataDir, "state");
const uploadDir = path.join(dataDir, "uploads");
const adminIpsFile = path.join(dataDir, "admin-ips.json");
const permissionFile = path.join(dataDir, "permission-config.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const trustProxy = process.env.TRUST_PROXY === "true";
const maxBodyBytes = Number(process.env.MAX_BODY_MB || 1024) * 1024 * 1024;
const allowedKeys = new Set(["imported-sources", "analysis-cache", "applied-date-range"]);
const defaultValueFor = (key) => key === "analysis-cache" || key === "applied-date-range" ? null : [];
const defaultPermissionConfig = {
  deputyAdmins: [],
  ordinaryUsers: [],
  allowIntranetUsers: false,
  features: {
    dataImport: { public: false, deputy: true, label: "数据导入" },
    workspace: { public: false, deputy: true, label: "质量工作台" },
    annotationEdit: { public: false, deputy: true, label: "分析改善措施" },
    annotationView: { public: false, deputy: true, label: "分析显示" },
    exportReport: { public: true, deputy: true, label: "导出报告" },
    dateTemporaryRefresh: { public: true, deputy: true, label: "临时刷新日期" },
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
    "GET /api/me": { public: true, deputy: true, label: "读取当前权限" },
    "GET /api/permissions": { public: true, deputy: true, label: "读取权限配置" },
  },
};

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
    features: {},
    apis: {},
  };
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
    if (Array.isArray(parsed)) return uniqueStrings(parsed);
    if (Array.isArray(parsed?.adminIps)) return uniqueStrings(parsed.adminIps);
  } catch (error) {
    console.error("Failed to load admin-ips.json", error);
  }
  return [];
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
  if (req.method === "GET" && pathname.startsWith("/api/uploads/")) return "GET /api/uploads/*";
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
    if (req.url.startsWith("/api/uploads/")) return await handleUploadedFile(req, res);
    if (req.url === "/api/uploads") return await handleUpload(req, res);
    if (req.url.startsWith("/api/")) return await handleApi(req, res);
    return await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(port, host, () => {
  console.log(`QMS server listening on http://${host}:${port}`);
});
