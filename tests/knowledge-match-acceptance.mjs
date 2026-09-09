import fs from "node:fs";
import assert from "node:assert/strict";
import pg from "pg";

const store = JSON.parse(fs.readFileSync(new URL("../data/knowledge-store.json", import.meta.url), "utf8"));
const issues = Array.isArray(store.issues) ? store.issues : [];
let matches = Array.isArray(store.matches) ? store.matches : [];
let knowledgeById = new Map((store.knowledge || []).map((item) => [item.id, item]));
let storage = "json";
try {
  try { process.loadEnvFile(new URL("../.env", import.meta.url)); } catch {}
  const connectionString = String(process.env.QMS_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (connectionString) {
    const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2500 });
    const [matchResult, knowledgeResult] = await Promise.all([
      pool.query("SELECT id,issue_id AS \"issueId\",score,status,knowledge_id AS \"knowledgeId\",document_id AS \"documentId\",evidence FROM qms_knowledge_matches"),
      pool.query("SELECT id,title,content,publication_status AS \"publicationStatus\",document_id AS \"documentId\" FROM qms_distilled_knowledge"),
    ]);
    await pool.end();
    matches = matchResult.rows.map((item) => ({ ...item, evidence: typeof item.evidence === "string" ? JSON.parse(item.evidence) : item.evidence }));
    knowledgeById = new Map(knowledgeResult.rows.map((item) => [item.id, item]));
    storage = "postgres";
  }
} catch { /* PostgreSQL unavailable: evaluate the JSON fallback instead. */ }

// These are deliberately broad representative buckets. They are not ground truth;
// expectedKnowledgeIds remains empty until a reviewer confirms the sample.
const buckets = [
  { id: "wiring", label: "接线", terms: ["接线", "继电器标签", "接线表", "线束", "散线"] },
  { id: "nozzle", label: "吸嘴", terms: ["吸嘴", "吸杆", "取料异常", "吸附", "取料掉料"] },
  { id: "pneumatic", label: "气路", terms: ["气路", "气缸", "真空吸气管", "调速阀", "气管"] },
  { id: "screw", label: "螺丝", terms: ["螺丝", "锁紧", "垫片", "螺纹"] },
  { id: "bom-drawing", label: "BOM/图纸", terms: ["BOM", "图纸", "漏标注", "物料"] },
  { id: "terminal-harness", label: "端子/线束", terms: ["端子", "线束", "压接", "接插件"] },
];

const issueText = (item) => `${item.issueType || ""} ${item.issueText || ""} ${(item.tags || []).join(" ")}`.trim();
const candidateText = (item) => `${item.evidence?.candidateTitle || ""} ${item.evidence?.candidateContent || ""}`.trim();
const matchRows = new Map();
for (const match of matches) {
  if (!match.issueId) continue;
  const list = matchRows.get(match.issueId) || [];
  list.push(match);
  matchRows.set(match.issueId, list);
}

const objectTerms = {
  wiring: ["接线", "线束", "继电器", "接插件", "端子"],
  nozzle: ["吸嘴", "吸杆", "吸附", "取料"],
  pneumatic: ["气路", "气缸", "真空", "气管", "调速阀"],
  screw: ["螺丝", "螺纹", "锁紧", "垫片"],
  "bom-drawing": ["BOM", "图纸", "物料", "标注"],
  "terminal-harness": ["端子", "线束", "压接", "接插件"],
};
const inferBucket = (text) => {
  const hits = Object.entries(objectTerms).map(([id, terms]) => ({ id, hits: terms.filter((term) => text.includes(term)).length }));
  hits.sort((a, b) => b.hits - a.hits);
  return hits[0]?.hits ? hits[0].id : "unknown";
};

const samples = [];
for (const bucket of buckets) {
  const seen = new Set();
  const rows = issues.filter((item) => bucket.terms.some((term) => issueText(item).includes(term)));
  for (const issue of rows) {
    const signature = issueText(issue);
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    const candidates = (matchRows.get(issue.id) || []).slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    const top = candidates[0];
    samples.push({
      issueId: issue.id,
      module: issue.module,
      bucket: bucket.id,
      expectedObject: bucket.label,
      issueText: issueText(issue),
      currentTop1: top ? { matchId: top.id, score: Number(top.score || 0), status: top.status, knowledgeId: top.knowledgeId || "", documentName: top.evidence?.documentName || "", title: top.evidence?.candidateTitle || "" } : null,
      candidateCount: candidates.length,
      potentialCrossObject: Boolean(top && inferBucket(candidateText(top)) !== bucket.id && inferBucket(candidateText(top)) !== "unknown"),
      expectedKnowledgeIds: [],
      allowNoMatch: false,
      reviewStatus: "pending",
    });
    if (samples.filter((item) => item.bucket === bucket.id).length >= 5) break;
  }
}

assert.ok(samples.length >= 30, `验收样本不足：${samples.length}`);
const report = {
  generatedAt: new Date().toISOString(),
  note: "系统自动抽样，仅供人工确认；expectedKnowledgeIds 和 allowNoMatch 未预设为正确答案。",
  sourceIssueCount: issues.length,
  storage,
  sampleCount: samples.length,
  samples,
  metrics: {
    top1Available: samples.filter((item) => item.currentTop1).length,
    noMatchRate: Number((samples.filter((item) => !item.currentTop1).length / samples.length).toFixed(3)),
    potentialCrossObjectRate: Number((samples.filter((item) => item.potentialCrossObject).length / samples.length).toFixed(3)),
    top1HitRate: null,
    top3HitRate: null,
  },
};
console.log(JSON.stringify(report, null, 2));
