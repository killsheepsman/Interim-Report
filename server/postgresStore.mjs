import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(moduleDir, "..", ".env")); } catch {}

const { Pool } = pg;
const connectionString = String(process.env.QMS_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const configured = Boolean(connectionString || process.env.PGHOST || process.env.PGDATABASE);
const retryAfterMs = 30000;
let pool = null;
let readyPromise = null;
let disabledUntil = 0;
let lastError = "";

const logFailure = (error) => {
  lastError = String(error?.message || error || "PostgreSQL connection failed").slice(0, 300);
  console.warn(`[storage] PostgreSQL unavailable; JSON fallback remains active: ${lastError}`);
};

const createPool = () => new Pool({
  ...(connectionString ? { connectionString } : {}),
  ...(process.env.PGHOST ? { host: process.env.PGHOST } : {}),
  ...(process.env.PGPORT ? { port: Number(process.env.PGPORT) } : {}),
  ...(process.env.PGDATABASE ? { database: process.env.PGDATABASE } : {}),
  ...(process.env.PGUSER ? { user: process.env.PGUSER } : {}),
  ...(process.env.PGPASSWORD ? { password: process.env.PGPASSWORD } : {}),
  max: Math.max(2, Number(process.env.QMS_PG_POOL_MAX || 10)),
  idleTimeoutMillis: Math.max(1000, Number(process.env.QMS_PG_IDLE_TIMEOUT_MS || 30000)),
  connectionTimeoutMillis: Math.max(1000, Number(process.env.QMS_PG_CONNECT_TIMEOUT_MS || 5000)),
});

const ensureReady = async () => {
  if (!configured || Date.now() < disabledUntil) return false;
  if (!readyPromise) {
    if (!pool) pool = createPool();
    readyPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS qms_state (
        state_key TEXT PRIMARY KEY,
        state_value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS qms_agent_reports (
        file_name TEXT PRIMARY KEY,
        module TEXT NOT NULL,
        role_name TEXT NOT NULL DEFAULT '',
        recipient TEXT NOT NULL DEFAULT '',
        skill_name TEXT NOT NULL DEFAULT '',
        layout_skill_name TEXT NOT NULL DEFAULT '',
        visual_spec JSONB,
        model_name TEXT NOT NULL DEFAULT '',
        creator_ip TEXT NOT NULL DEFAULT '',
        period JSONB NOT NULL DEFAULT '{}'::jsonb,
        content TEXT NOT NULL,
        saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE qms_agent_reports ADD COLUMN IF NOT EXISTS model_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_agent_reports ADD COLUMN IF NOT EXISTS creator_ip TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_agent_reports ADD COLUMN IF NOT EXISTS visual_spec JSONB;
      CREATE INDEX IF NOT EXISTS qms_agent_reports_lookup_idx
        ON qms_agent_reports (module, role_name, recipient, updated_at DESC);
      CREATE INDEX IF NOT EXISTS qms_agent_reports_updated_idx
        ON qms_agent_reports (updated_at DESC);
      CREATE TABLE IF NOT EXISTS qms_knowledge_documents (
        id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        content_type TEXT NOT NULL DEFAULT 'text',
        file_hash TEXT NOT NULL DEFAULT '',
        version TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'waiting',
        progress INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL DEFAULT '',
        segment_count INTEGER NOT NULL DEFAULT 0,
        clause_count INTEGER NOT NULL DEFAULT 0,
        distillation_count INTEGER NOT NULL DEFAULT 0,
        file_size BIGINT NOT NULL DEFAULT 0,
        source_preview TEXT NOT NULL DEFAULT '',
        source_text TEXT NOT NULL DEFAULT '',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        error_message TEXT NOT NULL DEFAULT '',
        imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS qms_knowledge_documents_status_idx
        ON qms_knowledge_documents (status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS qms_knowledge_documents_hash_idx
        ON qms_knowledge_documents (file_hash);
      CREATE TABLE IF NOT EXISTS qms_knowledge_clauses (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES qms_knowledge_documents(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        section_path TEXT NOT NULL DEFAULT '',
        clause_number TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        clause_text TEXT NOT NULL,
        search_text TEXT NOT NULL DEFAULT '',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS qms_knowledge_clauses_document_idx
        ON qms_knowledge_clauses (document_id, ordinal);
      CREATE INDEX IF NOT EXISTS qms_knowledge_clauses_search_idx
        ON qms_knowledge_clauses USING GIN (to_tsvector('simple', search_text));
      CREATE TABLE IF NOT EXISTS qms_knowledge_jobs (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES qms_knowledge_documents(id) ON DELETE CASCADE,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        progress INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL DEFAULT '',
        skill_id TEXT NOT NULL DEFAULT '',
        result JSONB NOT NULL DEFAULT '{}'::jsonb,
        error_message TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS qms_knowledge_jobs_status_idx
        ON qms_knowledge_jobs (status, created_at);
      CREATE INDEX IF NOT EXISTS qms_knowledge_jobs_document_idx
        ON qms_knowledge_jobs (document_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS qms_distilled_knowledge (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES qms_knowledge_documents(id) ON DELETE CASCADE,
        clause_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        knowledge_type TEXT NOT NULL DEFAULT 'mandatory',
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        applicable_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
        processes JSONB NOT NULL DEFAULT '[]'::jsonb,
        issue_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        synonyms JSONB NOT NULL DEFAULT '[]'::jsonb,
        confidence NUMERIC(4,3) NOT NULL DEFAULT 1,
        skill_id TEXT NOT NULL DEFAULT '',
        source_citations JSONB NOT NULL DEFAULT '[]'::jsonb,
        review_status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS qms_distilled_knowledge_document_idx
        ON qms_distilled_knowledge (document_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS qms_distilled_knowledge_tags_idx
        ON qms_distilled_knowledge USING GIN (issue_tags);
      CREATE TABLE IF NOT EXISTS qms_quality_issues (
        id TEXT PRIMARY KEY,
        module TEXT NOT NULL,
        issue_kind TEXT NOT NULL DEFAULT '',
        person_name TEXT NOT NULL DEFAULT '',
        issue_date TEXT NOT NULL DEFAULT '',
        issue_type TEXT NOT NULL DEFAULT '',
        issue_text TEXT NOT NULL,
        normalized_text TEXT NOT NULL DEFAULT '',
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        source_file TEXT NOT NULL DEFAULT '',
        source_key TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS qms_quality_issues_source_key_idx
        ON qms_quality_issues (source_key);
      CREATE INDEX IF NOT EXISTS qms_quality_issues_lookup_idx
        ON qms_quality_issues (module, person_name, updated_at DESC);
      CREATE TABLE IF NOT EXISTS qms_knowledge_matches (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL REFERENCES qms_quality_issues(id) ON DELETE CASCADE,
        candidate_key TEXT NOT NULL,
        candidate_type TEXT NOT NULL,
        document_id TEXT NOT NULL DEFAULT '',
        knowledge_id TEXT NOT NULL DEFAULT '',
        clause_id TEXT NOT NULL DEFAULT '',
        score NUMERIC(6,2) NOT NULL DEFAULT 0,
        evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'candidate',
        reviewer TEXT NOT NULL DEFAULT '',
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (issue_id, candidate_key)
      );
      CREATE INDEX IF NOT EXISTS qms_knowledge_matches_issue_idx
        ON qms_knowledge_matches (issue_id, status, score DESC);
      CREATE INDEX IF NOT EXISTS qms_knowledge_matches_confirmed_idx
        ON qms_knowledge_matches (status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS qms_recurrence_actions (
        recurrence_key TEXT PRIMARY KEY,
        module TEXT NOT NULL,
        person_name TEXT NOT NULL DEFAULT '',
        candidate_key TEXT NOT NULL,
        action_type TEXT NOT NULL DEFAULT 'mixed',
        action_text TEXT NOT NULL DEFAULT '',
        owner TEXT NOT NULL DEFAULT '',
        due_date TEXT NOT NULL DEFAULT '',
        implemented_at TEXT NOT NULL DEFAULT '',
        verification_method TEXT NOT NULL DEFAULT '',
        verification_evidence TEXT NOT NULL DEFAULT '',
        observation_until TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        effectiveness TEXT NOT NULL DEFAULT 'pending',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS qms_recurrence_actions_lookup_idx
        ON qms_recurrence_actions (module, person_name, updated_at DESC)
    `).then(() => true).catch((error) => {
      disabledUntil = Date.now() + retryAfterMs;
      logFailure(error);
      return false;
    }).finally(() => { readyPromise = null; });
  }
  return await readyPromise;
};

export const initPostgres = async () => ({
  configured,
  available: await ensureReady(),
  lastError,
});

export const readPostgresState = async (key) => {
  if (!(await ensureReady())) return { available: false, found: false, value: null };
  try {
    const result = await pool.query("SELECT state_value FROM qms_state WHERE state_key = $1", [key]);
    if (!result.rows.length) return { available: true, found: false, value: null };
    return { available: true, found: true, value: result.rows[0].state_value };
  } catch (error) {
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, found: false, value: null };
  }
};

export const writePostgresState = async (key, value) => {
  if (!(await ensureReady())) return { available: false, value };
  try {
    await pool.query(`
      INSERT INTO qms_state (state_key, state_value, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (state_key) DO UPDATE SET state_value = EXCLUDED.state_value, updated_at = NOW()
    `, [key, JSON.stringify(value)]);
    return { available: true, value };
  } catch (error) {
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, value };
  }
};

const reportRow = (row = {}) => ({
  fileName: row.file_name,
  module: row.module,
  role: row.role_name,
  recipient: row.recipient,
  skillName: row.skill_name,
  layoutSkillName: row.layout_skill_name,
  layoutProfileId: row.layout_skill_name,
  visualSpec: row.visual_spec && typeof row.visual_spec === "object" ? row.visual_spec : null,
  model: row.model_name,
  creatorIp: row.creator_ip,
  period: row.period && typeof row.period === "object" ? row.period : {},
  savedAt: row.saved_at instanceof Date ? row.saved_at.toISOString() : String(row.saved_at || ""),
  updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || ""),
});

export const writePostgresAgentReport = async (report = {}) => {
  if (!(await ensureReady())) return { available: false, report: null };
  try {
    const result = await pool.query(`
      INSERT INTO qms_agent_reports (
        file_name, module, role_name, recipient, skill_name,
        layout_skill_name, visual_spec, model_name, creator_ip, period, content, saved_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11, $12, $13)
      ON CONFLICT (file_name) DO UPDATE SET
        module = EXCLUDED.module,
        role_name = EXCLUDED.role_name,
        recipient = EXCLUDED.recipient,
        skill_name = EXCLUDED.skill_name,
        layout_skill_name = EXCLUDED.layout_skill_name,
        visual_spec = EXCLUDED.visual_spec,
        model_name = EXCLUDED.model_name,
        creator_ip = EXCLUDED.creator_ip,
        period = EXCLUDED.period,
        content = EXCLUDED.content,
        saved_at = EXCLUDED.saved_at,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      String(report.fileName || ""),
      String(report.module || "质量分析"),
      String(report.role || ""),
      String(report.recipient || ""),
      String(report.skillName || ""),
      String(report.layoutSkillName || ""),
      JSON.stringify(report.visualSpec && typeof report.visualSpec === "object" ? report.visualSpec : null),
      String(report.model || ""),
      String(report.creatorIp || ""),
      JSON.stringify(report.period && typeof report.period === "object" ? report.period : {}),
      String(report.content || ""),
      report.savedAt || new Date().toISOString(),
      report.updatedAt || new Date().toISOString(),
    ]);
    return { available: true, report: reportRow(result.rows[0]) };
  } catch (error) {
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, report: null };
  }
};

export const listPostgresAgentReports = async (filters = {}) => {
  if (!(await ensureReady())) return { available: false, reports: [], total: 0 };
  try {
    const where = [];
    const values = [];
    const add = (column, value) => {
      if (value == null || !String(value).trim()) return;
      values.push(String(value).trim());
      where.push(`${column} = $${values.length}`);
    };
    add("module", filters.module);
    add("role_name", filters.role);
    add("recipient", filters.recipient);
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.min(200, Math.max(1, Number(filters.limit || 50)));
    const offset = Math.max(0, Number(filters.offset || 0));
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM qms_agent_reports ${clause}`, values);
    const rows = await pool.query(`
      SELECT file_name, module, role_name, recipient, skill_name, layout_skill_name, visual_spec, model_name, creator_ip, period, saved_at, updated_at,
             OCTET_LENGTH(content) AS size
      FROM qms_agent_reports
      ${clause}
      ORDER BY updated_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `, [...values, limit, offset]);
    return {
      available: true,
      reports: rows.rows.map((row) => ({ ...reportRow(row), size: Number(row.size || 0), storage: "postgres" })),
      total: Number(count.rows[0]?.total || 0),
    };
  } catch (error) {
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, reports: [], total: 0 };
  }
};

export const readPostgresAgentReport = async (fileName) => {
  if (!(await ensureReady())) return { available: false, found: false, report: null };
  try {
    const result = await pool.query("SELECT * FROM qms_agent_reports WHERE file_name = $1", [String(fileName || "")]);
    if (!result.rows.length) return { available: true, found: false, report: null };
    return { available: true, found: true, report: { ...reportRow(result.rows[0]), content: String(result.rows[0].content || ""), storage: "postgres" } };
  } catch (error) {
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, found: false, report: null };
  }
};

export const deletePostgresAgentReport = async (fileName) => {
  if (!(await ensureReady())) return { available: false, deleted: false };
  try {
    const result = await pool.query("DELETE FROM qms_agent_reports WHERE file_name = $1", [String(fileName || "")]);
    return { available: true, deleted: result.rowCount > 0 };
  } catch (error) {
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, deleted: false };
  }
};

export const postgresStatus = () => ({
  configured,
  available: configured && Date.now() >= disabledUntil && Boolean(pool),
  lastError,
});

const isoValue = (value) => value instanceof Date ? value.toISOString() : String(value || "");
const jsonValue = (value, fallback) => value && typeof value === "object" ? value : fallback;
const knowledgeDocumentRow = (row = {}, includeSource = false) => ({
  id: row.id,
  name: row.file_name,
  category: row.category,
  contentType: row.content_type,
  fileHash: row.file_hash,
  version: row.version,
  status: row.status,
  progress: Number(row.progress || 0),
  message: row.message,
  segmentCount: Number(row.segment_count || 0),
  clauseCount: Number(row.clause_count || 0),
  distillationCount: Number(row.distillation_count || 0),
  size: Number(row.file_size || 0),
  preview: row.source_preview,
  metadata: jsonValue(row.metadata, {}),
  errorMessage: row.error_message,
  importedAt: isoValue(row.imported_at),
  updatedAt: isoValue(row.updated_at),
  ...(includeSource ? { sourceText: String(row.source_text || "") } : {}),
  storage: "postgres",
});

export const writePostgresKnowledgeDocument = async (document = {}) => {
  if (!(await ensureReady())) return { available: false, document: null };
  try {
    const result = await pool.query(`
      INSERT INTO qms_knowledge_documents (
        id, file_name, category, content_type, file_hash, version, status, progress, message,
        segment_count, clause_count, distillation_count, file_size, source_preview, source_text,
        metadata, error_message, imported_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19)
      ON CONFLICT (id) DO UPDATE SET
        file_name=EXCLUDED.file_name, category=EXCLUDED.category, content_type=EXCLUDED.content_type,
        file_hash=EXCLUDED.file_hash, version=EXCLUDED.version, status=EXCLUDED.status,
        progress=EXCLUDED.progress, message=EXCLUDED.message, segment_count=EXCLUDED.segment_count,
        clause_count=EXCLUDED.clause_count, distillation_count=EXCLUDED.distillation_count,
        file_size=EXCLUDED.file_size, source_preview=EXCLUDED.source_preview,
        source_text=CASE WHEN EXCLUDED.source_text='' THEN qms_knowledge_documents.source_text ELSE EXCLUDED.source_text END,
        metadata=EXCLUDED.metadata, error_message=EXCLUDED.error_message, updated_at=EXCLUDED.updated_at
      RETURNING *
    `, [
      document.id, document.name, document.category || "", document.contentType || "text",
      document.fileHash || "", document.version || "", document.status || "waiting",
      Number(document.progress || 0), document.message || "", Number(document.segmentCount || 0),
      Number(document.clauseCount || 0), Number(document.distillationCount || 0), Number(document.size || 0),
      String(document.preview || "").slice(0, 2000), String(document.sourceText || ""),
      JSON.stringify(document.metadata || {}), document.errorMessage || "",
      document.importedAt || new Date().toISOString(), document.updatedAt || new Date().toISOString(),
    ]);
    return { available: true, document: knowledgeDocumentRow(result.rows[0], true) };
  } catch (error) {
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, document: null };
  }
};

export const listPostgresKnowledgeDocuments = async () => {
  if (!(await ensureReady())) return { available: false, documents: [] };
  try {
    const result = await pool.query("SELECT * FROM qms_knowledge_documents ORDER BY imported_at DESC, file_name");
    return { available: true, documents: result.rows.map((row) => knowledgeDocumentRow(row, false)) };
  } catch (error) {
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, documents: [] };
  }
};

export const readPostgresKnowledgeDocument = async (id) => {
  if (!(await ensureReady())) return { available: false, found: false, document: null };
  try {
    const result = await pool.query("SELECT * FROM qms_knowledge_documents WHERE id=$1", [String(id || "")]);
    return { available: true, found: result.rows.length > 0, document: result.rows[0] ? knowledgeDocumentRow(result.rows[0], true) : null };
  } catch (error) {
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, found: false, document: null };
  }
};

export const deletePostgresKnowledgeDocument = async (id) => {
  if (!(await ensureReady())) return { available: false, deleted: false };
  try {
    const result = await pool.query("DELETE FROM qms_knowledge_documents WHERE id=$1", [String(id || "")]);
    return { available: true, deleted: result.rowCount > 0 };
  } catch (error) {
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, deleted: false };
  }
};

export const replacePostgresKnowledgeClauses = async (document, clauses = []) => {
  if (!(await ensureReady())) return { available: false };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM qms_knowledge_clauses WHERE document_id=$1", [document.id]);
    for (const clause of clauses) {
      await client.query(`
        INSERT INTO qms_knowledge_clauses
          (id, document_id, ordinal, section_path, clause_number, title, clause_text, search_text, metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      `, [clause.id, document.id, clause.ordinal, clause.sectionPath || "", clause.clauseNumber || "", clause.title || "", clause.clauseText, clause.searchText || clause.clauseText, JSON.stringify(clause.metadata || {})]);
    }
    await client.query(`UPDATE qms_knowledge_documents SET status=$2, progress=$3, message=$4, clause_count=$5, error_message='', updated_at=NOW() WHERE id=$1`, [document.id, document.status, document.progress, document.message, clauses.length]);
    await client.query("COMMIT");
    return { available: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logFailure(error);
    return { available: false };
  } finally { client.release(); }
};

export const listPostgresKnowledgeClauses = async (documentId, { limit = 100, offset = 0, query = "" } = {}) => {
  if (!(await ensureReady())) return { available: false, clauses: [], total: 0 };
  try {
    const values = [String(documentId || "")];
    let search = "";
    if (String(query || "").trim()) { values.push(`%${String(query).trim()}%`); search = ` AND search_text ILIKE $${values.length}`; }
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM qms_knowledge_clauses WHERE document_id=$1${search}`, values);
    values.push(Math.min(1000, Math.max(1, Number(limit || 100))), Math.max(0, Number(offset || 0)));
    const rows = await pool.query(`SELECT id, document_id, ordinal, section_path, clause_number, title, clause_text, metadata, created_at FROM qms_knowledge_clauses WHERE document_id=$1${search} ORDER BY ordinal LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return { available: true, total: Number(count.rows[0]?.total || 0), clauses: rows.rows.map((row) => ({ id: row.id, documentId: row.document_id, ordinal: Number(row.ordinal), sectionPath: row.section_path, clauseNumber: row.clause_number, title: row.title, clauseText: row.clause_text, metadata: jsonValue(row.metadata, {}), createdAt: isoValue(row.created_at) })) };
  } catch (error) {
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, clauses: [], total: 0 };
  }
};

const knowledgeJobRow = (row = {}) => ({ id: row.id, documentId: row.document_id, jobType: row.job_type, status: row.status, progress: Number(row.progress || 0), message: row.message, skillId: row.skill_id, result: jsonValue(row.result, {}), errorMessage: row.error_message, createdAt: isoValue(row.created_at), startedAt: isoValue(row.started_at), completedAt: isoValue(row.completed_at), updatedAt: isoValue(row.updated_at), storage: "postgres" });
export const writePostgresKnowledgeJob = async (job = {}) => {
  if (!(await ensureReady())) return { available: false, job: null };
  try {
    const result = await pool.query(`
      INSERT INTO qms_knowledge_jobs (id,document_id,job_type,status,progress,message,skill_id,result,error_message,created_at,started_at,completed_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, progress=EXCLUDED.progress, message=EXCLUDED.message,
        skill_id=EXCLUDED.skill_id, result=EXCLUDED.result, error_message=EXCLUDED.error_message,
        started_at=EXCLUDED.started_at, completed_at=EXCLUDED.completed_at, updated_at=EXCLUDED.updated_at
      RETURNING *
    `, [job.id, job.documentId, job.jobType, job.status || "waiting", Number(job.progress || 0), job.message || "", job.skillId || "", JSON.stringify(job.result || {}), job.errorMessage || "", job.createdAt || new Date().toISOString(), job.startedAt || null, job.completedAt || null, job.updatedAt || new Date().toISOString()]);
    return { available: true, job: knowledgeJobRow(result.rows[0]) };
  } catch (error) { logFailure(error); return { available: false, job: null }; }
};

export const listPostgresKnowledgeJobs = async (documentId = "") => {
  if (!(await ensureReady())) return { available: false, jobs: [] };
  try {
    const result = documentId ? await pool.query("SELECT * FROM qms_knowledge_jobs WHERE document_id=$1 ORDER BY created_at DESC", [documentId]) : await pool.query("SELECT * FROM qms_knowledge_jobs ORDER BY created_at DESC LIMIT 500");
    return { available: true, jobs: result.rows.map(knowledgeJobRow) };
  } catch (error) { logFailure(error); return { available: false, jobs: [] }; }
};

const distilledRow = (row = {}) => ({ id: row.id, documentId: row.document_id, clauseIds: jsonValue(row.clause_ids, []), type: row.knowledge_type, title: row.title, content: row.content, applicableRoles: jsonValue(row.applicable_roles, []), processes: jsonValue(row.processes, []), issueTags: jsonValue(row.issue_tags, []), synonyms: jsonValue(row.synonyms, []), confidence: Number(row.confidence || 0), skillId: row.skill_id, sourceCitations: jsonValue(row.source_citations, []), reviewStatus: row.review_status, createdAt: isoValue(row.created_at), updatedAt: isoValue(row.updated_at), storage: "postgres" });
export const replacePostgresDistilledKnowledge = async (documentId, skillId, items = []) => {
  if (!(await ensureReady())) return { available: false };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM qms_distilled_knowledge WHERE document_id=$1 AND skill_id=$2", [documentId, skillId]);
    for (const item of items) await client.query(`INSERT INTO qms_distilled_knowledge (id,document_id,clause_ids,knowledge_type,title,content,applicable_roles,processes,issue_tags,synonyms,confidence,skill_id,source_citations,review_status,created_at,updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13::jsonb,$14,$15,$16)`, [item.id, documentId, JSON.stringify(item.clauseIds || []), item.type || "mandatory", item.title, item.content, JSON.stringify(item.applicableRoles || []), JSON.stringify(item.processes || []), JSON.stringify(item.issueTags || []), JSON.stringify(item.synonyms || []), Number(item.confidence || 0), skillId, JSON.stringify(item.sourceCitations || []), item.reviewStatus || "pending", item.createdAt || new Date().toISOString(), item.updatedAt || new Date().toISOString()]);
    await client.query("UPDATE qms_knowledge_documents SET distillation_count=$2, status='completed', progress=100, message=$3, updated_at=NOW() WHERE id=$1", [documentId, items.length, `已蒸馏 ${items.length} 条知识点`]);
    await client.query("COMMIT");
    return { available: true };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); logFailure(error); return { available: false }; } finally { client.release(); }
};

export const listPostgresDistilledKnowledge = async (documentId, { limit = 100, offset = 0 } = {}) => {
  if (!(await ensureReady())) return { available: false, knowledge: [], total: 0 };
  try {
    const count = await pool.query("SELECT COUNT(*)::int AS total FROM qms_distilled_knowledge WHERE document_id=$1", [documentId]);
    const result = await pool.query("SELECT * FROM qms_distilled_knowledge WHERE document_id=$1 ORDER BY created_at, id LIMIT $2 OFFSET $3", [documentId, Math.min(1000, Math.max(1, Number(limit || 100))), Math.max(0, Number(offset || 0))]);
    return { available: true, total: Number(count.rows[0]?.total || 0), knowledge: result.rows.map(distilledRow) };
  } catch (error) { logFailure(error); return { available: false, knowledge: [], total: 0 }; }
};

const qualityIssueRow = (row = {}) => ({
  id: row.id,
  module: row.module,
  issueKind: row.issue_kind,
  personName: row.person_name,
  issueDate: row.issue_date,
  issueType: row.issue_type,
  issueText: row.issue_text,
  normalizedText: row.normalized_text,
  tags: jsonValue(row.tags, []),
  sourceFile: row.source_file,
  sourceKey: row.source_key,
  metadata: jsonValue(row.metadata, {}),
  createdAt: isoValue(row.created_at),
  updatedAt: isoValue(row.updated_at),
  storage: "postgres",
});

const knowledgeMatchRow = (row = {}) => ({
  id: row.id,
  issueId: row.issue_id,
  candidateKey: row.candidate_key,
  candidateType: row.candidate_type,
  documentId: row.document_id,
  knowledgeId: row.knowledge_id,
  clauseId: row.clause_id,
  score: Number(row.score || 0),
  evidence: jsonValue(row.evidence, {}),
  status: row.status,
  reviewer: row.reviewer,
  reviewedAt: isoValue(row.reviewed_at),
  createdAt: isoValue(row.created_at),
  updatedAt: isoValue(row.updated_at),
  storage: "postgres",
});

export const upsertPostgresQualityIssues = async (issues = []) => {
  if (!(await ensureReady())) return { available: false, issues: [] };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saved = [];
    for (const issue of issues) {
      const previous = await client.query("SELECT id, issue_type, issue_text, normalized_text FROM qms_quality_issues WHERE source_key=$1", [issue.sourceKey]);
      if (previous.rows.length && (previous.rows[0].normalized_text !== issue.normalizedText || previous.rows[0].issue_type !== issue.issueType || previous.rows[0].issue_text !== issue.issueText)) {
        await client.query("UPDATE qms_knowledge_matches SET status='superseded', updated_at=NOW() WHERE issue_id=$1 AND status='confirmed'", [previous.rows[0].id]);
        await client.query("DELETE FROM qms_knowledge_matches WHERE issue_id=$1 AND status='candidate'", [previous.rows[0].id]);
      }
      const result = await client.query(`
        INSERT INTO qms_quality_issues
          (id,module,issue_kind,person_name,issue_date,issue_type,issue_text,normalized_text,tags,source_file,source_key,metadata,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13,$14)
        ON CONFLICT (source_key) DO UPDATE SET
          module=EXCLUDED.module, issue_kind=EXCLUDED.issue_kind, person_name=EXCLUDED.person_name,
          issue_date=EXCLUDED.issue_date, issue_type=EXCLUDED.issue_type, issue_text=EXCLUDED.issue_text,
          normalized_text=EXCLUDED.normalized_text, tags=EXCLUDED.tags, source_file=EXCLUDED.source_file,
          metadata=EXCLUDED.metadata, updated_at=EXCLUDED.updated_at
        RETURNING *
      `, [issue.id, issue.module, issue.issueKind || "", issue.personName || "", issue.issueDate || "", issue.issueType || "", issue.issueText, issue.normalizedText || "", JSON.stringify(issue.tags || []), issue.sourceFile || "", issue.sourceKey, JSON.stringify(issue.metadata || {}), issue.createdAt || new Date().toISOString(), issue.updatedAt || new Date().toISOString()]);
      saved.push(qualityIssueRow(result.rows[0]));
    }
    await client.query("COMMIT");
    return { available: true, issues: saved };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logFailure(error);
    return { available: false, issues: [] };
  } finally { client.release(); }
};

export const listPostgresQualityIssues = async ({ module = "", personName = "", query = "", status = "", limit = 30, offset = 0 } = {}) => {
  if (!(await ensureReady())) return { available: false, issues: [], total: 0 };
  try {
    const values = [];
    const where = [];
    if (module) { values.push(String(module)); where.push(`i.module=$${values.length}`); }
    if (personName) { values.push(String(personName)); where.push(`i.person_name=$${values.length}`); }
    if (query) { values.push(`%${String(query).trim()}%`); where.push(`(i.issue_text ILIKE $${values.length} OR i.issue_type ILIKE $${values.length} OR i.person_name ILIKE $${values.length})`); }
    if (status) {
      values.push(String(status));
      if (status === "unmatched") where.push(`NOT EXISTS (SELECT 1 FROM qms_knowledge_matches m WHERE m.issue_id=i.id AND m.status='confirmed')`);
      else where.push(`EXISTS (SELECT 1 FROM qms_knowledge_matches m WHERE m.issue_id=i.id AND m.status=$${values.length})`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM qms_quality_issues i ${clause}`, values);
    values.push(Math.min(200, Math.max(1, Number(limit || 30))), Math.max(0, Number(offset || 0)));
    const result = await pool.query(`
      SELECT i.*,
        COUNT(m.id)::int AS match_count,
        COUNT(m.id) FILTER (WHERE m.status='confirmed')::int AS confirmed_count
      FROM qms_quality_issues i
      LEFT JOIN qms_knowledge_matches m ON m.issue_id=i.id
      ${clause}
      GROUP BY i.id
      ORDER BY i.issue_date DESC, i.updated_at DESC, i.id
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);
    return { available: true, total: Number(count.rows[0]?.total || 0), issues: result.rows.map((row) => ({ ...qualityIssueRow(row), matchCount: Number(row.match_count || 0), confirmedCount: Number(row.confirmed_count || 0) })) };
  } catch (error) { logFailure(error); return { available: false, issues: [], total: 0 }; }
};

export const replacePostgresKnowledgeMatches = async (issueId, matches = []) => {
  if (!(await ensureReady())) return { available: false, matches: [] };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM qms_knowledge_matches WHERE issue_id=$1 AND status='candidate'", [issueId]);
    for (const match of matches) {
      await client.query(`
        INSERT INTO qms_knowledge_matches
          (id,issue_id,candidate_key,candidate_type,document_id,knowledge_id,clause_id,score,evidence,status,reviewer,reviewed_at,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14)
        ON CONFLICT (issue_id,candidate_key) DO UPDATE SET
          score=EXCLUDED.score, evidence=EXCLUDED.evidence, updated_at=EXCLUDED.updated_at
      `, [match.id, issueId, match.candidateKey, match.candidateType, match.documentId || "", match.knowledgeId || "", match.clauseId || "", Number(match.score || 0), JSON.stringify(match.evidence || {}), match.status || "candidate", match.reviewer || "", match.reviewedAt || null, match.createdAt || new Date().toISOString(), match.updatedAt || new Date().toISOString()]);
    }
    await client.query("COMMIT");
    return await listPostgresKnowledgeMatches(issueId);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logFailure(error);
    return { available: false, matches: [] };
  } finally { client.release(); }
};

export const listPostgresKnowledgeMatches = async (issueId) => {
  if (!(await ensureReady())) return { available: false, matches: [] };
  try {
    const result = await pool.query("SELECT * FROM qms_knowledge_matches WHERE issue_id=$1 ORDER BY CASE status WHEN 'confirmed' THEN 0 WHEN 'candidate' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END, score DESC, updated_at DESC", [String(issueId || "")]);
    return { available: true, matches: result.rows.map(knowledgeMatchRow) };
  } catch (error) { logFailure(error); return { available: false, matches: [] }; }
};

export const reviewPostgresKnowledgeMatch = async (id, { status, reviewer = "" } = {}) => {
  if (!(await ensureReady())) return { available: false, match: null };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM qms_knowledge_matches WHERE id=$1 FOR UPDATE", [String(id || "")]);
    if (!current.rows.length) { await client.query("ROLLBACK"); return { available: true, match: null }; }
    const issueId = current.rows[0].issue_id;
    if (status === "confirmed") await client.query("UPDATE qms_knowledge_matches SET status='superseded', updated_at=NOW() WHERE issue_id=$1 AND status='confirmed' AND id<>$2", [issueId, id]);
    const result = await client.query("UPDATE qms_knowledge_matches SET status=$2, reviewer=$3, reviewed_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *", [id, status, reviewer]);
    await client.query("COMMIT");
    return { available: true, match: knowledgeMatchRow(result.rows[0]) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logFailure(error);
    return { available: false, match: null };
  } finally { client.release(); }
};

export const listPostgresConfirmedKnowledgeMatches = async ({ module = "", personName = "", limit = 5000 } = {}) => {
  if (!(await ensureReady())) return { available: false, matches: [] };
  try {
    const values = [];
    const where = ["m.status='confirmed'"];
    if (module) { values.push(String(module)); where.push(`i.module=$${values.length}`); }
    if (personName) { values.push(String(personName)); where.push(`i.person_name=$${values.length}`); }
    values.push(Math.min(10000, Math.max(1, Number(limit || 5000))));
    const result = await pool.query(`
      SELECT m.*, i.module, i.issue_kind, i.person_name, i.issue_date, i.issue_type, i.issue_text, i.tags AS issue_tags, i.source_key, i.updated_at AS issue_updated_at
      FROM qms_knowledge_matches m
      JOIN qms_quality_issues i ON i.id=m.issue_id
      WHERE ${where.join(" AND ")}
      ORDER BY i.person_name, i.issue_date DESC, m.updated_at DESC
      LIMIT $${values.length}
    `, values);
    return { available: true, matches: result.rows.map((row) => ({ ...knowledgeMatchRow(row), issue: { id: row.issue_id, module: row.module, issueKind: row.issue_kind, personName: row.person_name, issueDate: row.issue_date, issueType: row.issue_type, issueText: row.issue_text, tags: jsonValue(row.issue_tags, []), sourceKey: row.source_key, updatedAt: isoValue(row.issue_updated_at) } })) };
  } catch (error) { logFailure(error); return { available: false, matches: [] }; }
};

export const deletePostgresQualityIssue = async (id) => {
  if (!(await ensureReady())) return { available: false, deleted: false };
  try {
    const result = await pool.query("DELETE FROM qms_quality_issues WHERE id=$1", [String(id || "")]);
    return { available: true, deleted: result.rowCount > 0 };
  } catch (error) { logFailure(error); return { available: false, deleted: false }; }
};

const recurrenceActionRow = (row = {}) => ({
  recurrenceKey: row.recurrence_key,
  module: row.module,
  personName: row.person_name,
  candidateKey: row.candidate_key,
  actionType: row.action_type,
  actionText: row.action_text,
  owner: row.owner,
  dueDate: row.due_date,
  implementedAt: row.implemented_at,
  verificationMethod: row.verification_method,
  verificationEvidence: row.verification_evidence,
  observationUntil: row.observation_until,
  status: row.status,
  effectiveness: row.effectiveness,
  metadata: jsonValue(row.metadata, {}),
  createdAt: isoValue(row.created_at),
  updatedAt: isoValue(row.updated_at),
  storage: "postgres",
});

export const listPostgresRecurrenceActions = async ({ module = "", personName = "" } = {}) => {
  if (!(await ensureReady())) return { available: false, actions: [] };
  try {
    const values = [];
    const where = [];
    if (module) { values.push(String(module)); where.push(`module=$${values.length}`); }
    if (personName) { values.push(String(personName)); where.push(`person_name=$${values.length}`); }
    const result = await pool.query(`SELECT * FROM qms_recurrence_actions ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC`, values);
    return { available: true, actions: result.rows.map(recurrenceActionRow) };
  } catch (error) { logFailure(error); return { available: false, actions: [] }; }
};

export const writePostgresRecurrenceAction = async (action = {}) => {
  if (!(await ensureReady())) return { available: false, action: null };
  try {
    const result = await pool.query(`
      INSERT INTO qms_recurrence_actions
        (recurrence_key,module,person_name,candidate_key,action_type,action_text,owner,due_date,implemented_at,verification_method,verification_evidence,observation_until,status,effectiveness,metadata,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17)
      ON CONFLICT (recurrence_key) DO UPDATE SET
        module=EXCLUDED.module, person_name=EXCLUDED.person_name, candidate_key=EXCLUDED.candidate_key,
        action_type=EXCLUDED.action_type, action_text=EXCLUDED.action_text, owner=EXCLUDED.owner,
        due_date=EXCLUDED.due_date, implemented_at=EXCLUDED.implemented_at,
        verification_method=EXCLUDED.verification_method, verification_evidence=EXCLUDED.verification_evidence,
        observation_until=EXCLUDED.observation_until, status=EXCLUDED.status,
        effectiveness=EXCLUDED.effectiveness, metadata=EXCLUDED.metadata, updated_at=EXCLUDED.updated_at
      RETURNING *
    `, [action.recurrenceKey, action.module, action.personName || "", action.candidateKey, action.actionType || "mixed", action.actionText || "", action.owner || "", action.dueDate || "", action.implementedAt || "", action.verificationMethod || "", action.verificationEvidence || "", action.observationUntil || "", action.status || "open", action.effectiveness || "pending", JSON.stringify(action.metadata || {}), action.createdAt || new Date().toISOString(), action.updatedAt || new Date().toISOString()]);
    return { available: true, action: recurrenceActionRow(result.rows[0]) };
  } catch (error) { logFailure(error); return { available: false, action: null }; }
};
