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
        source_level TEXT NOT NULL DEFAULT 'C',
        source_category TEXT NOT NULL DEFAULT '',
        publisher TEXT NOT NULL DEFAULT '',
        edition TEXT NOT NULL DEFAULT '',
        effective_status TEXT NOT NULL DEFAULT 'active',
        applicable_scope TEXT NOT NULL DEFAULT '',
        copyright_status TEXT NOT NULL DEFAULT '',
        owner TEXT NOT NULL DEFAULT '',
        review_due TEXT NOT NULL DEFAULT '',
        governance_status TEXT NOT NULL DEFAULT '待登记',
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
      ALTER TABLE qms_knowledge_documents ADD COLUMN IF NOT EXISTS source_level TEXT NOT NULL DEFAULT 'C';
      ALTER TABLE qms_knowledge_documents ADD COLUMN IF NOT EXISTS source_category TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_knowledge_documents ADD COLUMN IF NOT EXISTS publisher TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_knowledge_documents ADD COLUMN IF NOT EXISTS edition TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_knowledge_documents ADD COLUMN IF NOT EXISTS effective_status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE qms_knowledge_documents ADD COLUMN IF NOT EXISTS applicable_scope TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_knowledge_documents ADD COLUMN IF NOT EXISTS copyright_status TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_knowledge_documents ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_knowledge_documents ADD COLUMN IF NOT EXISTS review_due TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_knowledge_documents ADD COLUMN IF NOT EXISTS governance_status TEXT NOT NULL DEFAULT '待登记';
      CREATE INDEX IF NOT EXISTS qms_knowledge_documents_status_idx
        ON qms_knowledge_documents (status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS qms_knowledge_documents_governance_idx
        ON qms_knowledge_documents (effective_status, governance_status, source_level, version);
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
        evidence_type TEXT NOT NULL DEFAULT 'text',
        source_hash TEXT NOT NULL DEFAULT '',
        source_location JSONB NOT NULL DEFAULT '{}'::jsonb,
        ocr_status TEXT NOT NULL DEFAULT 'not_required',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE qms_knowledge_clauses ADD COLUMN IF NOT EXISTS evidence_type TEXT NOT NULL DEFAULT 'text';
      ALTER TABLE qms_knowledge_clauses ADD COLUMN IF NOT EXISTS source_hash TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_knowledge_clauses ADD COLUMN IF NOT EXISTS source_location JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE qms_knowledge_clauses ADD COLUMN IF NOT EXISTS ocr_status TEXT NOT NULL DEFAULT 'not_required';
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
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        publication_status TEXT NOT NULL DEFAULT 'candidate',
        publication_note TEXT NOT NULL DEFAULT '',
        reviewed_by TEXT NOT NULL DEFAULT '',
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE qms_distilled_knowledge ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE qms_distilled_knowledge ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'candidate';
      ALTER TABLE qms_distilled_knowledge ADD COLUMN IF NOT EXISTS publication_note TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_distilled_knowledge ADD COLUMN IF NOT EXISTS reviewed_by TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_distilled_knowledge ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS qms_distilled_knowledge_document_idx
        ON qms_distilled_knowledge (document_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS qms_distilled_knowledge_tags_idx
        ON qms_distilled_knowledge USING GIN (issue_tags);
      CREATE INDEX IF NOT EXISTS qms_distilled_knowledge_search_idx
        ON qms_distilled_knowledge USING GIN (to_tsvector('simple', title || ' ' || content));
      CREATE INDEX IF NOT EXISTS qms_distilled_knowledge_publication_idx
        ON qms_distilled_knowledge (publication_status, document_id, updated_at DESC);
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
        basis JSONB NOT NULL DEFAULT '[]'::jsonb,
        deviation TEXT NOT NULL DEFAULT '',
        root_cause TEXT NOT NULL DEFAULT '',
        scope TEXT NOT NULL DEFAULT '',
        fallback_plan TEXT NOT NULL DEFAULT '',
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
      ALTER TABLE qms_recurrence_actions ADD COLUMN IF NOT EXISTS basis JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE qms_recurrence_actions ADD COLUMN IF NOT EXISTS deviation TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_recurrence_actions ADD COLUMN IF NOT EXISTS root_cause TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_recurrence_actions ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT '';
      ALTER TABLE qms_recurrence_actions ADD COLUMN IF NOT EXISTS fallback_plan TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS qms_recurrence_actions_lookup_idx
        ON qms_recurrence_actions (module, person_name, updated_at DESC);
      CREATE TABLE IF NOT EXISTS qms_knowledge_review_sessions (
        id TEXT PRIMARY KEY,
        module TEXT NOT NULL DEFAULT 'DQA',
        title TEXT NOT NULL DEFAULT '',
        project TEXT NOT NULL DEFAULT '',
        project_stage TEXT NOT NULL DEFAULT '',
        brand_model TEXT NOT NULL DEFAULT '',
        risk_level TEXT NOT NULL DEFAULT 'unknown',
        owner TEXT NOT NULL DEFAULT '',
        collaborators JSONB NOT NULL DEFAULT '[]'::jsonb,
        reviewer TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        conclusion TEXT NOT NULL DEFAULT '',
        review_points JSONB NOT NULL DEFAULT '[]'::jsonb,
        source_knowledge_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS qms_knowledge_review_sessions_lookup_idx
        ON qms_knowledge_review_sessions (module, status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS qms_knowledge_feedback_records (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        module TEXT NOT NULL DEFAULT '',
        target_type TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        owner TEXT NOT NULL DEFAULT '',
        reviewer TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'candidate',
        source_knowledge_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        applied_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (source_type, source_id, target_type)
      );
      CREATE INDEX IF NOT EXISTS qms_knowledge_feedback_records_lookup_idx
        ON qms_knowledge_feedback_records (target_type, status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS qms_knowledge_conflicts (
        id TEXT PRIMARY KEY,
        left_document_id TEXT NOT NULL DEFAULT '',
        right_document_id TEXT NOT NULL DEFAULT '',
        left_knowledge_id TEXT NOT NULL DEFAULT '',
        right_knowledge_id TEXT NOT NULL DEFAULT '',
        scope TEXT NOT NULL DEFAULT '',
        issue TEXT NOT NULL DEFAULT '',
        temporary_measure TEXT NOT NULL DEFAULT '',
        owner TEXT NOT NULL DEFAULT '',
        due_date TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        decision TEXT NOT NULL DEFAULT '',
        resolution TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        decided_by TEXT NOT NULL DEFAULT '',
        decided_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS qms_knowledge_conflicts_lookup_idx
        ON qms_knowledge_conflicts (status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS qms_knowledge_audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL DEFAULT '',
        actor_ip TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
        after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS qms_knowledge_audit_logs_lookup_idx
        ON qms_knowledge_audit_logs (entity_type, entity_id, created_at DESC)
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
  sourceLevel: row.source_level || "C",
  sourceCategory: row.source_category || "",
  publisher: row.publisher || "",
  edition: row.edition || "",
  effectiveStatus: row.effective_status || "active",
  applicableScope: row.applicable_scope || "",
  copyrightStatus: row.copyright_status || "",
  owner: row.owner || "",
  reviewDue: row.review_due || "",
  governanceStatus: row.governance_status || "待登记",
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
        id, file_name, category, content_type, file_hash, version,
        source_level, source_category, publisher, edition, effective_status, applicable_scope,
        copyright_status, owner, review_due, governance_status, status, progress, message,
        segment_count, clause_count, distillation_count, file_size, source_preview, source_text,
        metadata, error_message, imported_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27,$28,$29)
      ON CONFLICT (id) DO UPDATE SET
        file_name=EXCLUDED.file_name, category=EXCLUDED.category, content_type=EXCLUDED.content_type,
        file_hash=EXCLUDED.file_hash, version=EXCLUDED.version,
        source_level=EXCLUDED.source_level, source_category=EXCLUDED.source_category,
        publisher=EXCLUDED.publisher, edition=EXCLUDED.edition, effective_status=EXCLUDED.effective_status,
        applicable_scope=EXCLUDED.applicable_scope, copyright_status=EXCLUDED.copyright_status,
        owner=EXCLUDED.owner, review_due=EXCLUDED.review_due, governance_status=EXCLUDED.governance_status,
        status=EXCLUDED.status,
        progress=EXCLUDED.progress, message=EXCLUDED.message, segment_count=EXCLUDED.segment_count,
        clause_count=EXCLUDED.clause_count, distillation_count=EXCLUDED.distillation_count,
        file_size=EXCLUDED.file_size, source_preview=EXCLUDED.source_preview,
        source_text=CASE WHEN EXCLUDED.source_text='' THEN qms_knowledge_documents.source_text ELSE EXCLUDED.source_text END,
        metadata=EXCLUDED.metadata, error_message=EXCLUDED.error_message, updated_at=EXCLUDED.updated_at
      RETURNING *
    `, [
      document.id, document.name, document.category || "", document.contentType || "text",
      document.fileHash || "", document.version || "", document.sourceLevel || "C",
      document.sourceCategory || "", document.publisher || "", document.edition || "",
      document.effectiveStatus || "active", document.applicableScope || "",
      document.copyrightStatus || "", document.owner || "", document.reviewDue || "",
      document.governanceStatus || "待登记", document.status || "waiting",
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
  const documentId = String(id || "");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM qms_knowledge_matches WHERE document_id=$1", [documentId]);
    const result = await client.query("DELETE FROM qms_knowledge_documents WHERE id=$1", [documentId]);
    await client.query("COMMIT");
    return { available: true, deleted: result.rowCount > 0 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, deleted: false };
  } finally { client.release();
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
          (id, document_id, ordinal, section_path, clause_number, title, clause_text, search_text,
           evidence_type, source_hash, source_location, ocr_status, metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb)
      `, [clause.id, document.id, clause.ordinal, clause.sectionPath || "", clause.clauseNumber || "", clause.title || "", clause.clauseText, clause.searchText || clause.clauseText, clause.metadata?.sourceFormat || "text", clause.metadata?.sourceHash || document.fileHash || "", JSON.stringify(clause.metadata?.sourceLocation || {}), clause.metadata?.ocrStatus || "not_required", JSON.stringify(clause.metadata || {})]);
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
    const rows = await pool.query(`SELECT id, document_id, ordinal, section_path, clause_number, title, clause_text, evidence_type, source_hash, source_location, ocr_status, metadata, created_at FROM qms_knowledge_clauses WHERE document_id=$1${search} ORDER BY ordinal LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return { available: true, total: Number(count.rows[0]?.total || 0), clauses: rows.rows.map((row) => ({ id: row.id, documentId: row.document_id, ordinal: Number(row.ordinal), sectionPath: row.section_path, clauseNumber: row.clause_number, title: row.title, clauseText: row.clause_text, evidenceType: row.evidence_type, sourceHash: row.source_hash, sourceLocation: jsonValue(row.source_location, {}), ocrStatus: row.ocr_status, metadata: jsonValue(row.metadata, {}), createdAt: isoValue(row.created_at) })) };
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

export const deletePostgresKnowledgeJob = async (id) => {
  if (!(await ensureReady())) return { available: false, deleted: false };
  try {
    const result = await pool.query("DELETE FROM qms_knowledge_jobs WHERE id=$1", [String(id || "")]);
    return { available: true, deleted: result.rowCount > 0 };
  } catch (error) { logFailure(error); return { available: false, deleted: false }; }
};

const distilledRow = (row = {}) => ({ id: row.id, documentId: row.document_id, clauseIds: jsonValue(row.clause_ids, []), type: row.knowledge_type, title: row.title, content: row.content, applicableRoles: jsonValue(row.applicable_roles, []), processes: jsonValue(row.processes, []), issueTags: jsonValue(row.issue_tags, []), synonyms: jsonValue(row.synonyms, []), sourceLevel: jsonValue(row.metadata, {}).sourceLevel || "C", version: jsonValue(row.metadata, {}).version || "", confidence: Number(row.confidence || 0), skillId: row.skill_id, sourceCitations: jsonValue(row.source_citations, []), reviewStatus: row.review_status, metadata: jsonValue(row.metadata, {}), publicationStatus: row.publication_status || "candidate", publicationNote: row.publication_note || "", reviewedBy: row.reviewed_by || "", reviewedAt: isoValue(row.reviewed_at), createdAt: isoValue(row.created_at), updatedAt: isoValue(row.updated_at), storage: "postgres" });
export const replacePostgresDistilledKnowledge = async (documentId, skillId, items = []) => {
  if (!(await ensureReady())) return { available: false };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM qms_distilled_knowledge WHERE document_id=$1 AND skill_id=$2", [documentId, skillId]);
    for (const item of items) await client.query(`INSERT INTO qms_distilled_knowledge (id,document_id,clause_ids,knowledge_type,title,content,applicable_roles,processes,issue_tags,synonyms,confidence,skill_id,source_citations,review_status,metadata,publication_status,publication_note,reviewed_by,reviewed_at,created_at,updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13::jsonb,$14,$15::jsonb,$16,$17,$18,$19,$20,$21)`, [item.id, documentId, JSON.stringify(item.clauseIds || []), item.type || "mandatory", item.title, item.content, JSON.stringify(item.applicableRoles || []), JSON.stringify(item.processes || []), JSON.stringify(item.issueTags || []), JSON.stringify(item.synonyms || []), Number(item.confidence || 0), skillId, JSON.stringify(item.sourceCitations || []), item.reviewStatus || "pending", JSON.stringify(item.metadata || {}), item.publicationStatus || "candidate", item.publicationNote || "", item.reviewedBy || "", item.reviewedAt || null, item.createdAt || new Date().toISOString(), item.updatedAt || new Date().toISOString()]);
    await client.query("UPDATE qms_knowledge_documents SET distillation_count=$2, status='completed', governance_status='候选知识', progress=100, message=$3, updated_at=NOW() WHERE id=$1", [documentId, items.length, `已蒸馏 ${items.length} 条知识点，等待人工审核`]);
    await client.query("COMMIT");
    return { available: true };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); logFailure(error); return { available: false }; } finally { client.release(); }
};

export const listPostgresDistilledKnowledge = async (documentId, { limit = 100, offset = 0 } = {}) => {
  if (!(await ensureReady())) return { available: false, knowledge: [], total: 0 };
  try {
    const count = await pool.query("SELECT publication_status, COUNT(*)::int AS total FROM qms_distilled_knowledge WHERE document_id=$1 GROUP BY publication_status", [documentId]);
    const result = await pool.query("SELECT * FROM qms_distilled_knowledge WHERE document_id=$1 ORDER BY created_at, id LIMIT $2 OFFSET $3", [documentId, Math.min(1000, Math.max(1, Number(limit || 100))), Math.max(0, Number(offset || 0))]);
    const statusCounts = Object.fromEntries(count.rows.map((row) => [row.publication_status || "candidate", Number(row.total || 0)]));
    return { available: true, total: Object.values(statusCounts).reduce((sum, value) => sum + value, 0), statusCounts, knowledge: result.rows.map(distilledRow) };
  } catch (error) { logFailure(error); return { available: false, knowledge: [], total: 0 }; }
};

export const searchPostgresKnowledgeCandidates = async ({ terms = [], moduleTerms = [], version = "", limit = 160 } = {}) => {
  const startedAt = performance.now();
  if (!(await ensureReady())) return { available: false, candidates: [], elapsedMs: 0, storage: "json" };
  const safeTerms = [...new Set(terms.map((item) => String(item || "").trim().toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "")).filter((item) => item.length >= 2))].slice(0, 32);
  if (!safeTerms.length) return { available: true, candidates: [], elapsedMs: Math.round(performance.now() - startedAt), storage: "postgres" };
  const termPatterns = safeTerms.map((item) => `%${item}%`);
  const modulePatterns = [...new Set(moduleTerms.map((item) => `%${String(item || "").trim().toLowerCase()}%`).filter((item) => item.length > 2))];
  const tsQuery = safeTerms.map((item) => `${item}:*`).join(" | ");
  const rowLimit = Math.min(500, Math.max(20, Number(limit || 160)));
  const values = [termPatterns, safeTerms, tsQuery, modulePatterns, String(version || "").trim(), rowLimit];
  const documentGate = `
    LOWER(d.effective_status) NOT IN ('obsolete','superseded','expired','inactive')
    AND d.governance_status <> '已废止'
    AND ($5 = '' OR d.version = $5)
    AND jsonb_array_length(CASE WHEN jsonb_typeof(d.metadata->'openConflictIds')='array' THEN d.metadata->'openConflictIds' ELSE '[]'::jsonb END)=0
  `;
  try {
    const [knowledgeResult, clauseResult] = await Promise.all([
      pool.query(`
        SELECT k.*, d.file_name AS document_name, d.category AS document_category,
          d.source_level AS document_source_level, d.source_category, d.version AS document_version,
          d.effective_status, d.governance_status, d.review_due, d.applicable_scope,
          (SELECT COUNT(*) FROM unnest($2::text[]) term WHERE LOWER(k.title || ' ' || k.content) LIKE '%' || term || '%') AS term_hits,
          ts_rank_cd(to_tsvector('simple', k.title || ' ' || k.content), to_tsquery('simple', $3)) AS text_rank
        FROM qms_distilled_knowledge k
        JOIN qms_knowledge_documents d ON d.id=k.document_id
        WHERE k.publication_status IN ('published','approved','candidate') AND ${documentGate}
          AND (cardinality($4::text[])=0 OR LOWER(d.file_name || ' ' || d.category || ' ' || d.source_category || ' ' || k.title || ' ' || k.content || ' ' || k.applicable_roles::text || ' ' || k.processes::text) LIKE ANY($4::text[]))
          AND (k.issue_tags ?| $2::text[] OR LOWER(k.title || ' ' || k.content) LIKE ANY($1::text[]) OR to_tsvector('simple', k.title || ' ' || k.content) @@ to_tsquery('simple', $3))
        ORDER BY (CASE WHEN k.issue_tags ?| $2::text[] THEN 3 ELSE 0 END) + (SELECT COUNT(*) FROM unnest($2::text[]) term WHERE LOWER(k.title || ' ' || k.content) LIKE '%' || term || '%') + ts_rank_cd(to_tsvector('simple', k.title || ' ' || k.content), to_tsquery('simple', $3)) DESC, k.updated_at DESC
        LIMIT $6
      `, values),
      pool.query(`
        SELECT c.*, d.file_name AS document_name, d.category AS document_category,
          d.source_level AS document_source_level, d.source_category, d.version AS document_version,
          d.effective_status, d.governance_status, d.review_due, d.applicable_scope,
          (SELECT COUNT(*) FROM unnest($2::text[]) term WHERE LOWER(c.search_text) LIKE '%' || term || '%') AS term_hits,
          ts_rank_cd(to_tsvector('simple', c.search_text), to_tsquery('simple', $3)) AS text_rank
        FROM qms_knowledge_clauses c
        JOIN qms_knowledge_documents d ON d.id=c.document_id
        WHERE ${documentGate}
          AND (cardinality($4::text[])=0 OR LOWER(d.file_name || ' ' || d.category || ' ' || d.source_category || ' ' || c.title || ' ' || c.search_text) LIKE ANY($4::text[]))
          AND (LOWER(c.search_text) LIKE ANY($1::text[]) OR to_tsvector('simple', c.search_text) @@ to_tsquery('simple', $3))
        ORDER BY (SELECT COUNT(*) FROM unnest($2::text[]) term WHERE LOWER(c.search_text) LIKE '%' || term || '%') + ts_rank_cd(to_tsvector('simple', c.search_text), to_tsquery('simple', $3)) DESC, c.ordinal
        LIMIT $6
      `, values),
    ]);
    const candidates = [
      ...knowledgeResult.rows.map((row) => {
        const metadata = jsonValue(row.metadata, {});
        const citations = jsonValue(row.source_citations, []);
        return { candidateType: "knowledge", candidateKey: `knowledge:${row.id}`, documentId: row.document_id, documentName: row.document_name, knowledgeId: row.id, clauseId: jsonValue(row.clause_ids, [])[0] || citations[0]?.clauseId || "", clauseNumber: citations[0]?.clauseNumber || "", sectionPath: citations[0]?.sectionPath || "", quote: citations[0]?.quote || row.content, title: row.title, content: row.content, applicableRoles: jsonValue(row.applicable_roles, []), processes: jsonValue(row.processes, []), issueTags: jsonValue(row.issue_tags, []), synonyms: jsonValue(row.synonyms, []), confidence: Number(row.confidence || 0), sourceCitations: citations, sourceLevel: metadata.sourceLevel || row.document_source_level || "C", sourceCategory: row.source_category || "", version: metadata.version || row.document_version || "", effectiveStatus: row.effective_status || "active", governanceStatus: row.governance_status || "", reviewDue: row.review_due || "", openConflictCount: 0, applicableScope: metadata.applicableScope || (row.applicable_scope ? [row.applicable_scope] : []), notApplicableScope: metadata.notApplicableScope || [], publicationStatus: row.publication_status || "published", retrievalRank: Number(row.term_hits || 0) + Number(row.text_rank || 0) };
      }),
      ...clauseResult.rows.map((row) => ({ candidateType: "clause", candidateKey: `clause:${row.id}`, documentId: row.document_id, documentName: row.document_name, knowledgeId: "", clauseId: row.id, clauseNumber: row.clause_number || "", sectionPath: row.section_path || "", quote: row.clause_text, title: row.title || String(row.clause_text || "").slice(0, 80), content: row.clause_text, applicableRoles: [], processes: [], issueTags: [], synonyms: [], confidence: 1, sourceCitations: [{ clauseId: row.id, clauseNumber: row.clause_number || "", sectionPath: row.section_path || "", quote: row.clause_text }], sourceLevel: row.document_source_level || "C", sourceCategory: row.source_category || "", version: row.document_version || "", effectiveStatus: row.effective_status || "active", governanceStatus: row.governance_status || "", reviewDue: row.review_due || "", openConflictCount: 0, applicableScope: row.applicable_scope ? [row.applicable_scope] : [], notApplicableScope: [], publicationStatus: "clause_candidate", retrievalRank: Number(row.term_hits || 0) + Number(row.text_rank || 0) })),
    ].sort((left, right) => right.retrievalRank - left.retrievalRank).slice(0, rowLimit);
    return { available: true, candidates, elapsedMs: Math.round(performance.now() - startedAt), storage: "postgres", scannedCount: knowledgeResult.rowCount + clauseResult.rowCount };
  } catch (error) {
    disabledUntil = Date.now() + retryAfterMs;
    logFailure(error);
    return { available: false, candidates: [], elapsedMs: Math.round(performance.now() - startedAt), storage: "json", error: String(error?.message || error) };
  }
};

export const updatePostgresDistilledKnowledge = async (item = {}) => {
  if (!(await ensureReady())) return { available: false, knowledge: null };
  try {
    const result = await pool.query(`UPDATE qms_distilled_knowledge SET review_status=$2, publication_status=$3, publication_note=$4, reviewed_by=$5, reviewed_at=$6, updated_at=NOW() WHERE id=$1 RETURNING *`, [item.id, item.reviewStatus || "pending", item.publicationStatus || "candidate", item.publicationNote || "", item.reviewedBy || "", item.reviewedAt || null]);
    return { available: true, knowledge: result.rows[0] ? distilledRow(result.rows[0]) : null };
  } catch (error) { disabledUntil = Date.now() + retryAfterMs; logFailure(error); return { available: false, knowledge: null }; }
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

export const listPostgresQualityIssues = async ({ module = "", personName = "", query = "", status = "", threshold = 80, limit = 30, offset = 0 } = {}) => {
  if (!(await ensureReady())) return { available: false, issues: [], total: 0 };
  try {
    const values = [];
    const where = [];
    if (module) { values.push(String(module)); where.push(`i.module=$${values.length}`); }
    if (personName) { values.push(String(personName)); where.push(`i.person_name=$${values.length}`); }
    if (query) { values.push(`%${String(query).trim()}%`); where.push(`(i.issue_text ILIKE $${values.length} OR i.issue_type ILIKE $${values.length} OR i.person_name ILIKE $${values.length})`); }
    if (status) {
      values.push(String(status));
      if (status === "unmatched" || status === "failed") where.push(`NOT EXISTS (SELECT 1 FROM qms_knowledge_matches m WHERE m.issue_id=i.id)`);
      else if (status === "low_threshold") { values.push(Number(threshold || 80)); where.push(`COALESCE((SELECT MAX(m.score) FROM qms_knowledge_matches m WHERE m.issue_id=i.id),0) < $${values.length}`); }
      else if (status === "rejected") where.push(`EXISTS (SELECT 1 FROM qms_knowledge_matches m WHERE m.issue_id=i.id AND m.status='rejected')`);
      else if (status === "confirmed") where.push(`EXISTS (SELECT 1 FROM qms_knowledge_matches m WHERE m.issue_id=i.id AND m.status='confirmed')`);
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
    // Regeneration is authoritative: remove stale confirmed/rejected rows too.
    // Otherwise an old clause match survives beside the new published-card set.
    await client.query("DELETE FROM qms_knowledge_matches WHERE issue_id=$1", [issueId]);
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
  basis: jsonValue(row.basis, []),
  deviation: row.deviation || "",
  rootCause: row.root_cause || "",
  scope: row.scope || "",
  fallbackPlan: row.fallback_plan || "",
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
        (recurrence_key,module,person_name,candidate_key,basis,deviation,root_cause,scope,fallback_plan,action_type,action_text,owner,due_date,implemented_at,verification_method,verification_evidence,observation_until,status,effectiveness,metadata,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22)
      ON CONFLICT (recurrence_key) DO UPDATE SET
        module=EXCLUDED.module, person_name=EXCLUDED.person_name, candidate_key=EXCLUDED.candidate_key,
        basis=EXCLUDED.basis, deviation=EXCLUDED.deviation, root_cause=EXCLUDED.root_cause,
        scope=EXCLUDED.scope, fallback_plan=EXCLUDED.fallback_plan,
        action_type=EXCLUDED.action_type, action_text=EXCLUDED.action_text, owner=EXCLUDED.owner,
        due_date=EXCLUDED.due_date, implemented_at=EXCLUDED.implemented_at,
        verification_method=EXCLUDED.verification_method, verification_evidence=EXCLUDED.verification_evidence,
        observation_until=EXCLUDED.observation_until, status=EXCLUDED.status,
        effectiveness=EXCLUDED.effectiveness, metadata=EXCLUDED.metadata, updated_at=EXCLUDED.updated_at
      RETURNING *
    `, [action.recurrenceKey, action.module, action.personName || "", action.candidateKey, JSON.stringify(action.basis || []), action.deviation || "", action.rootCause || "", action.scope || "", action.fallbackPlan || "", action.actionType || "mixed", action.actionText || "", action.owner || "", action.dueDate || "", action.implementedAt || "", action.verificationMethod || "", action.verificationEvidence || "", action.observationUntil || "", action.status || "open", action.effectiveness || "pending", JSON.stringify(action.metadata || {}), action.createdAt || new Date().toISOString(), action.updatedAt || new Date().toISOString()]);
    return { available: true, action: recurrenceActionRow(result.rows[0]) };
  } catch (error) { logFailure(error); return { available: false, action: null }; }
};

const reviewSessionRow = (row = {}) => ({ id: row.id, module: row.module, title: row.title, project: row.project, projectStage: row.project_stage, brandModel: row.brand_model, riskLevel: row.risk_level, owner: row.owner, collaborators: jsonValue(row.collaborators, []), reviewer: row.reviewer, status: row.status, conclusion: row.conclusion, reviewPoints: jsonValue(row.review_points, []), sourceKnowledgeIds: jsonValue(row.source_knowledge_ids, []), metadata: jsonValue(row.metadata, {}), completedAt: isoValue(row.completed_at), createdAt: isoValue(row.created_at), updatedAt: isoValue(row.updated_at), storage: "postgres" });
export const listPostgresKnowledgeReviewSessions = async ({ module = "", status = "", limit = 100 } = {}) => {
  if (!(await ensureReady())) return { available: false, sessions: [] };
  try {
    const values = [];
    const where = [];
    if (module) { values.push(String(module)); where.push(`module=$${values.length}`); }
    if (status) { values.push(String(status)); where.push(`status=$${values.length}`); }
    values.push(Math.min(500, Math.max(1, Number(limit || 100))));
    const result = await pool.query(`SELECT * FROM qms_knowledge_review_sessions ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT $${values.length}`, values);
    return { available: true, sessions: result.rows.map(reviewSessionRow) };
  } catch (error) { logFailure(error); return { available: false, sessions: [] }; }
};
export const writePostgresKnowledgeReviewSession = async (session = {}) => {
  if (!(await ensureReady())) return { available: false, session: null };
  try {
    const result = await pool.query(`INSERT INTO qms_knowledge_review_sessions (id,module,title,project,project_stage,brand_model,risk_level,owner,collaborators,reviewer,status,conclusion,review_points,source_knowledge_ids,metadata,completed_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,$17,$18) ON CONFLICT (id) DO UPDATE SET module=EXCLUDED.module,title=EXCLUDED.title,project=EXCLUDED.project,project_stage=EXCLUDED.project_stage,brand_model=EXCLUDED.brand_model,risk_level=EXCLUDED.risk_level,owner=EXCLUDED.owner,collaborators=EXCLUDED.collaborators,reviewer=EXCLUDED.reviewer,status=EXCLUDED.status,conclusion=EXCLUDED.conclusion,review_points=EXCLUDED.review_points,source_knowledge_ids=EXCLUDED.source_knowledge_ids,metadata=EXCLUDED.metadata,completed_at=EXCLUDED.completed_at,updated_at=EXCLUDED.updated_at RETURNING *`, [session.id, session.module || "DQA", session.title || "", session.project || "", session.projectStage || "", session.brandModel || "", session.riskLevel || "unknown", session.owner || "", JSON.stringify(session.collaborators || []), session.reviewer || "", session.status || "draft", session.conclusion || "", JSON.stringify(session.reviewPoints || []), JSON.stringify(session.sourceKnowledgeIds || []), JSON.stringify(session.metadata || {}), session.completedAt || null, session.createdAt || new Date().toISOString(), session.updatedAt || new Date().toISOString()]);
    return { available: true, session: reviewSessionRow(result.rows[0]) };
  } catch (error) { logFailure(error); return { available: false, session: null }; }
};

const feedbackRecordRow = (row = {}) => ({ id: row.id, sourceType: row.source_type, sourceId: row.source_id, module: row.module, targetType: row.target_type, title: row.title, content: row.content, owner: row.owner, reviewer: row.reviewer, status: row.status, sourceKnowledgeIds: jsonValue(row.source_knowledge_ids, []), evidence: jsonValue(row.evidence, []), metadata: jsonValue(row.metadata, {}), appliedAt: isoValue(row.applied_at), createdAt: isoValue(row.created_at), updatedAt: isoValue(row.updated_at), storage: "postgres" });
export const listPostgresKnowledgeFeedbackRecords = async ({ targetType = "", status = "", limit = 200 } = {}) => {
  if (!(await ensureReady())) return { available: false, records: [] };
  try {
    const values = [];
    const where = [];
    if (targetType) { values.push(String(targetType)); where.push(`target_type=$${values.length}`); }
    if (status) { values.push(String(status)); where.push(`status=$${values.length}`); }
    values.push(Math.min(500, Math.max(1, Number(limit || 200))));
    const result = await pool.query(`SELECT * FROM qms_knowledge_feedback_records ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT $${values.length}`, values);
    return { available: true, records: result.rows.map(feedbackRecordRow) };
  } catch (error) { logFailure(error); return { available: false, records: [] }; }
};
export const writePostgresKnowledgeFeedbackRecord = async (record = {}) => {
  if (!(await ensureReady())) return { available: false, record: null };
  try {
    const result = await pool.query(`INSERT INTO qms_knowledge_feedback_records (id,source_type,source_id,module,target_type,title,content,owner,reviewer,status,source_knowledge_ids,evidence,metadata,applied_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16) ON CONFLICT (source_type,source_id,target_type) DO UPDATE SET module=EXCLUDED.module,title=EXCLUDED.title,content=EXCLUDED.content,owner=EXCLUDED.owner,reviewer=EXCLUDED.reviewer,status=EXCLUDED.status,source_knowledge_ids=EXCLUDED.source_knowledge_ids,evidence=EXCLUDED.evidence,metadata=EXCLUDED.metadata,applied_at=EXCLUDED.applied_at,updated_at=EXCLUDED.updated_at RETURNING *`, [record.id, record.sourceType, record.sourceId, record.module || "", record.targetType, record.title || "", record.content || "", record.owner || "", record.reviewer || "", record.status || "candidate", JSON.stringify(record.sourceKnowledgeIds || []), JSON.stringify(record.evidence || []), JSON.stringify(record.metadata || {}), record.appliedAt || null, record.createdAt || new Date().toISOString(), record.updatedAt || new Date().toISOString()]);
    return { available: true, record: feedbackRecordRow(result.rows[0]) };
  } catch (error) { logFailure(error); return { available: false, record: null }; }
};

const knowledgeConflictRow = (row = {}) => ({ id: row.id, leftDocumentId: row.left_document_id || "", rightDocumentId: row.right_document_id || "", leftKnowledgeId: row.left_knowledge_id || "", rightKnowledgeId: row.right_knowledge_id || "", scope: row.scope || "", issue: row.issue || "", temporaryMeasure: row.temporary_measure || "", owner: row.owner || "", dueDate: row.due_date || "", status: row.status || "open", decision: row.decision || "", resolution: row.resolution || "", createdBy: row.created_by || "", decidedBy: row.decided_by || "", decidedAt: isoValue(row.decided_at), metadata: jsonValue(row.metadata, {}), createdAt: isoValue(row.created_at), updatedAt: isoValue(row.updated_at), storage: "postgres" });
export const listPostgresKnowledgeConflicts = async ({ status = "", limit = 200 } = {}) => {
  if (!(await ensureReady())) return { available: false, conflicts: [] };
  try {
    const values = [];
    const where = [];
    if (status) { values.push(String(status)); where.push(`status=$${values.length}`); }
    values.push(Math.min(500, Math.max(1, Number(limit || 200))));
    const result = await pool.query(`SELECT * FROM qms_knowledge_conflicts ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT $${values.length}`, values);
    return { available: true, conflicts: result.rows.map(knowledgeConflictRow) };
  } catch (error) { logFailure(error); return { available: false, conflicts: [] }; }
};
export const writePostgresKnowledgeConflict = async (conflict = {}) => {
  if (!(await ensureReady())) return { available: false, conflict: null };
  try {
    const result = await pool.query(`INSERT INTO qms_knowledge_conflicts (id,left_document_id,right_document_id,left_knowledge_id,right_knowledge_id,scope,issue,temporary_measure,owner,due_date,status,decision,resolution,created_by,decided_by,decided_at,metadata,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19) ON CONFLICT (id) DO UPDATE SET left_document_id=EXCLUDED.left_document_id,right_document_id=EXCLUDED.right_document_id,left_knowledge_id=EXCLUDED.left_knowledge_id,right_knowledge_id=EXCLUDED.right_knowledge_id,scope=EXCLUDED.scope,issue=EXCLUDED.issue,temporary_measure=EXCLUDED.temporary_measure,owner=EXCLUDED.owner,due_date=EXCLUDED.due_date,status=EXCLUDED.status,decision=EXCLUDED.decision,resolution=EXCLUDED.resolution,decided_by=EXCLUDED.decided_by,decided_at=EXCLUDED.decided_at,metadata=EXCLUDED.metadata,updated_at=EXCLUDED.updated_at RETURNING *`, [conflict.id, conflict.leftDocumentId || "", conflict.rightDocumentId || "", conflict.leftKnowledgeId || "", conflict.rightKnowledgeId || "", conflict.scope || "", conflict.issue || "", conflict.temporaryMeasure || "", conflict.owner || "", conflict.dueDate || "", conflict.status || "open", conflict.decision || "", conflict.resolution || "", conflict.createdBy || "", conflict.decidedBy || "", conflict.decidedAt || null, JSON.stringify(conflict.metadata || {}), conflict.createdAt || new Date().toISOString(), conflict.updatedAt || new Date().toISOString()]);
    return { available: true, conflict: knowledgeConflictRow(result.rows[0]) };
  } catch (error) { logFailure(error); return { available: false, conflict: null }; }
};

const knowledgeAuditRow = (row = {}) => ({ id: row.id, action: row.action, entityType: row.entity_type, entityId: row.entity_id || "", actor: row.actor || "", actorIp: row.actor_ip || "", summary: row.summary || "", beforeState: jsonValue(row.before_state, {}), afterState: jsonValue(row.after_state, {}), metadata: jsonValue(row.metadata, {}), createdAt: isoValue(row.created_at), storage: "postgres" });
export const listPostgresKnowledgeAuditLogs = async ({ entityType = "", entityId = "", action = "", limit = 200 } = {}) => {
  if (!(await ensureReady())) return { available: false, logs: [] };
  try {
    const values = [];
    const where = [];
    if (entityType) { values.push(String(entityType)); where.push(`entity_type=$${values.length}`); }
    if (entityId) { values.push(String(entityId)); where.push(`entity_id=$${values.length}`); }
    if (action) { values.push(String(action)); where.push(`action=$${values.length}`); }
    values.push(Math.min(1000, Math.max(1, Number(limit || 200))));
    const result = await pool.query(`SELECT * FROM qms_knowledge_audit_logs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT $${values.length}`, values);
    return { available: true, logs: result.rows.map(knowledgeAuditRow) };
  } catch (error) { logFailure(error); return { available: false, logs: [] }; }
};
export const writePostgresKnowledgeAuditLog = async (log = {}) => {
  if (!(await ensureReady())) return { available: false, log: null };
  try {
    const result = await pool.query(`INSERT INTO qms_knowledge_audit_logs (id,action,entity_type,entity_id,actor,actor_ip,summary,before_state,after_state,metadata,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11) ON CONFLICT (id) DO NOTHING RETURNING *`, [log.id, log.action, log.entityType, log.entityId || "", log.actor || "", log.actorIp || "", log.summary || "", JSON.stringify(log.beforeState || {}), JSON.stringify(log.afterState || {}), JSON.stringify(log.metadata || {}), log.createdAt || new Date().toISOString()]);
    return { available: true, log: result.rows[0] ? knowledgeAuditRow(result.rows[0]) : null };
  } catch (error) { logFailure(error); return { available: false, log: null }; }
};
