import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
const children = [];
let stopping = false;

const stopAll = (exitCode = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(exitCode);
};

const backend = spawn(process.execPath, ["server/index.mjs"], {
  cwd: rootDir,
  env: { ...process.env, PORT: "4174", HOST: "127.0.0.1" },
  stdio: "inherit",
  windowsHide: true,
});
children.push(backend);

const vite = spawn(process.execPath, [viteBin, "--config", "vite.config.mjs", "--configLoader", "native", "--host", "127.0.0.1", ...process.argv.slice(2)], {
  cwd: rootDir,
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});
children.push(vite);

backend.once("exit", (code) => {
  if (!stopping) {
    console.error(`本地接口服务已退出（code=${code ?? "unknown"}）。`);
    stopAll(1);
  }
});
vite.once("exit", (code) => {
  if (!stopping) stopAll(code ?? 0);
});

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
process.on("SIGBREAK", () => stopAll(0));
