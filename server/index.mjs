import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "dist");
const dataDir = process.env.QMS_DATA_DIR || path.join(rootDir, "data");
const dataFile = path.join(dataDir, "shared-state.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const maxBodyBytes = Number(process.env.MAX_BODY_MB || 1024) * 1024 * 1024;
const allowedKeys = new Set(["imported-sources", "analysis-cache", "active-date-range"]);

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

const loadState = async () => {
  try {
    return JSON.parse(await fs.readFile(dataFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
};

const saveState = async (state) => {
  await fs.mkdir(dataDir, { recursive: true });
  const tempFile = `${dataFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tempFile, dataFile);
};

const handleApi = async (req, res) => {
  const match = req.url.match(/^\/api\/state\/([^/?#]+)/);
  const key = match?.[1];
  if (!key || !allowedKeys.has(key)) return sendJson(res, 404, { error: "Unknown state key" });

  if (req.method === "GET") {
    const state = await loadState();
    return sendJson(res, 200, { key, value: state[key] ?? [] });
  }

  if (req.method === "PUT") {
    const payload = JSON.parse(await readBody(req) || "{}");
    const state = await loadState();
    state[key] = payload.value;
    state.updatedAt = new Date().toISOString();
    await saveState(state);
    return sendJson(res, 200, { key, value: state[key], updatedAt: state.updatedAt });
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

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=31536000, immutable",
  });
  createReadStream(filePath).pipe(res);
};

const server = createServer(async (req, res) => {
  try {
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
