import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const listen = (server, port) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});
const close = (server) => new Promise((resolve) => server.close(resolve));
const json = async (url, options = {}) => {
  const response = await fetch(url, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${body.error || JSON.stringify(body)}`);
  return body;
};
const waitFor = async (fn, timeoutMs = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("等待集成测试任务完成超时");
};

const fakePort = 4198;
const qmsPort = 4199;
const dataDir = await mkdtemp(path.join(os.tmpdir(), "qms-knowledge-ai-"));
const fakeAi = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || "{}");
  const messages = body.messages || body.input || [];
  const prompt = String(messages.at(-1)?.content || "");
  let payload = { knowledge: [] };
  const marker = prompt.indexOf("条款：\n");
  if (marker >= 0) {
    const rows = JSON.parse(prompt.slice(marker + 4));
    const row = rows[0];
    const quote = String(row.text || "").slice(0, 120);
    payload = { knowledge: [{ type: "mandatory", title: "测试知识点", content: quote, sourceCitations: [{ clauseId: row.clauseId, quote }] }, { type: "mandatory", title: "无效引用", content: "应被剔除", sourceCitations: [{ clauseId: row.clauseId, quote: "原文不存在" }] }] };
  }
  const event = JSON.stringify({ choices: [{ delta: { content: JSON.stringify(payload) } }] });
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(`data: ${event}\n\ndata: [DONE]\n\n`);
});

await listen(fakeAi, fakePort);
const child = spawn(process.execPath, ["server/index.mjs"], {
  cwd: path.resolve("."),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(qmsPort), QMS_DATA_DIR: dataDir, QMS_DATABASE_URL: " ", DATABASE_URL: " ", AI_TIMEOUT_MS: "10000" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let childOutput = "";
child.stdout.on("data", (chunk) => { childOutput += chunk; });
child.stderr.on("data", (chunk) => { childOutput += chunk; });

try {
  const base = `http://127.0.0.1:${qmsPort}`;
  await waitFor(async () => fetch(`${base}/api/me`).then((response) => response.ok).catch(() => false));
  const sourceText = Array.from({ length: 154 }, (_, index) => `${index + 1}. 吸嘴测试规范第${index + 1}条，安装前必须检查密封面。`).join("\n");
  const created = await json(`${base}/api/knowledge/documents`, { method: "POST", body: JSON.stringify({ name: "蒸馏链路测试.txt", category: "测试", contentType: "text", sourceText, sourceLevel: "A" }) });
  const documentId = created.document.id;
  await waitFor(async () => {
    const result = await json(`${base}/api/knowledge/documents`);
    return result.documents.find((item) => item.id === documentId)?.status === "completed";
  });
  const config = { baseUrl: `http://127.0.0.1:${fakePort}/v1`, model: "gpt-5.6-terra", apiKey: "test-key" };
  await json(`${base}/api/ai/chat`, { method: "POST", body: JSON.stringify({ agent: true, messages: [{ role: "user", content: "Agent链路测试" }], config }) });
  const started = await json(`${base}/api/knowledge/documents/${documentId}/distillation-jobs`, { method: "POST", body: JSON.stringify({ skillId: "quality-knowledge-distillation" }) });
  const completed = await waitFor(async () => {
    const result = await json(`${base}/api/knowledge/jobs/${started.job.id}`);
    if (result.job.status === "failed") throw new Error(result.job.errorMessage || "蒸馏任务失败");
    return result.job.status === "completed" ? result.job : null;
  });
  const cards = await json(`${base}/api/knowledge/documents/${documentId}/distillations?limit=20&offset=0`);
  const savedConfig = JSON.parse(await readFile(path.join(dataDir, "ai-config.json"), "utf8"));
  if (completed.result?.totalClauses !== 154 || completed.result?.totalBatches !== 4 || completed.result?.knowledgeCount !== 4 || cards.total !== 4) throw new Error("154条/4批次知识卡没有完整入库");
  if (completed.result?.citationAudit?.rejectedCount !== 1) throw new Error("无效逐字引用没有被剔除");
  if (savedConfig.baseUrl !== `http://127.0.0.1:${fakePort}/v1` || savedConfig.model !== "gpt-5.6-terra") throw new Error("管理员有效AI配置没有同步给后台任务");
  console.log("knowledge AI config handoff smoke passed");
} catch (error) {
  console.error(childOutput);
  throw error;
} finally {
  child.kill();
  await close(fakeAi);
  await rm(dataDir, { recursive: true, force: true });
}
