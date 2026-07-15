import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = 4197;
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "qms-permission-"));
await fs.writeFile(path.join(dataDir, "permission-config.json"), JSON.stringify({
  deputyAdmins: ["10.0.0.2"],
  ordinaryUsers: [{ ip: "10.0.0.3", name: "普通用户甲" }],
  allowIntranetUsers: true,
}, null, 2));

const child = spawn(process.execPath, ["server/index.mjs"], {
  cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", QMS_DATA_DIR: dataDir, TRUST_PROXY: "true" },
  stdio: ["ignore", "pipe", "pipe"],
});

const request = (pathname, ip) => fetch(`http://127.0.0.1:${port}${pathname}`, { headers: { "X-Forwarded-For": ip } });

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server startup timed out")), 5000);
    child.stdout.on("data", (chunk) => {
      if (!String(chunk).includes("QMS server listening")) return;
      clearTimeout(timer);
      resolve();
    });
    child.once("exit", (code) => reject(new Error(`Server exited with code ${code}`)));
  });

  const intranetMe = await (await request("/api/me", "10.0.0.9")).json();
  assert.equal(intranetMe.isAuthorized, true);
  assert.equal(intranetMe.isIntranetUser, true);
  assert.equal((await request("/api/state/analysis-cache", "10.0.0.9")).status, 200);

  const outsiderMe = await (await request("/api/me", "8.8.8.8")).json();
  assert.equal(outsiderMe.isAuthorized, false);
  assert.equal((await request("/api/state/analysis-cache", "8.8.8.8")).status, 403);
  assert.equal((await request("/defaultAnalysis.json.gz", "8.8.8.8")).status, 403);

  const ordinaryMe = await (await request("/api/me", "10.0.0.3")).json();
  assert.equal(ordinaryMe.role, "public");
  assert.equal(ordinaryMe.name, "普通用户甲");
  assert.equal((await request("/api/state/analysis-cache", "10.0.0.3")).status, 200);

  const deputyMe = await (await request("/api/me", "10.0.0.2")).json();
  assert.equal(deputyMe.role, "deputy");
  assert.equal(deputyMe.isAuthorized, true);

  console.log(JSON.stringify({ outsider: outsiderMe.role, intranet: intranetMe.role, ordinary: ordinaryMe.role, deputy: deputyMe.role }, null, 2));
} finally {
  child.kill();
  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (path.resolve(dataDir).startsWith(tempRoot)) await fs.rm(dataDir, { recursive: true, force: true });
}
