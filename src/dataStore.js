const DB_NAME = "qms-quality-analytics";
const DB_VERSION = 1;
const STORE_NAME = "app-state";
const SOURCES_KEY = "imported-sources-v20260625-dqa-refresh";
const REMOTE_SOURCES_KEY = "imported-sources";
const ANALYSIS_CACHE_KEY = "analysis-cache-v1";
const REMOTE_ANALYSIS_CACHE_KEY = "analysis-cache";
const REMOTE_APPLIED_DATE_RANGE_KEY = "applied-date-range";
const DQA_ENGINEER_SUPPLEMENT_KEY = "dqa-engineer-supplement";
const LOCAL_AI_CONFIG_KEY = "qms-ai-config-local-v1";
const LOCAL_AGENT_REPORTS_KEY = "qms-local-agent-reports-v1";
const LOCAL_AGENT_REPORTS_INDEX_KEY = "qms-local-agent-reports-index-v2";
const LOCAL_AGENT_REPORT_CONTENT_PREFIX = "qms-local-agent-report-content-v2:";
const LOCAL_AI_REPORTS_KEY = "qms-local-ai-reports-v1";

const defaultLocalAiConfig = { baseUrl: "https://new.ahei.asia/v1", model: "", apiKey: "" };
const readLocalAiConfig = () => {
  if (typeof localStorage === "undefined") return { ...defaultLocalAiConfig };
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_AI_CONFIG_KEY) || "{}");
    return { ...defaultLocalAiConfig, ...(value && typeof value === "object" ? value : {}) };
  } catch { return { ...defaultLocalAiConfig }; }
};
const publicLocalAiConfig = (config) => ({
  baseUrl: String(config.baseUrl || defaultLocalAiConfig.baseUrl),
  model: String(config.model || ""),
  hasApiKey: Boolean(config.apiKey),
  apiKeyHint: config.apiKey ? `••••${String(config.apiKey).slice(-4)}` : "",
  apiKey: "",
});
const fullLocalAiConfig = (config = {}) => {
  const current = readLocalAiConfig();
  return {
    baseUrl: String(config.baseUrl || current.baseUrl || defaultLocalAiConfig.baseUrl),
    model: String(config.model ?? current.model ?? ""),
    apiKey: String(config.apiKey || current.apiKey || ""),
  };
};
const localAiRequestConfig = (config = {}) => {
  const next = fullLocalAiConfig(config);
  return next.apiKey ? next : null;
};

const readLegacyLocalAgentReports = () => {
  if (typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_AGENT_REPORTS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
};
const readLocalAgentReportIndex = () => {
  if (typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_AGENT_REPORTS_INDEX_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
};
const writeLocalAgentReportIndex = (reports) => {
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(LOCAL_AGENT_REPORTS_INDEX_KEY, JSON.stringify(reports.slice(0, 300))); } catch {}
  }
};
let localAgentReportStorePromise = null;
const readLocalAiReports = () => {
  if (typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_AI_REPORTS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
};
const writeLocalAiReports = (reports) => {
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(LOCAL_AI_REPORTS_KEY, JSON.stringify(reports.slice(0, 100))); } catch {}
  }
};

const sharedApiBase = () => {
  if (typeof window === "undefined") return "";
  const configured = import.meta.env.VITE_API_BASE?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (!/^https?:$/.test(window.location.protocol)) return "";
  return `${window.location.origin}/api`;
};

const requestSharedState = async (key, options = {}) => {
  const base = sharedApiBase();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/state/${key}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

const loadRemoteState = async (key) => {
  const payload = await requestSharedState(key, { method: "GET" });
  return payload?.value ?? null;
};

const saveRemoteState = async (key, value) => {
  const payload = await requestSharedState(key, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
  return payload?.value ?? null;
};

const requestSharedApi = async (path, options = {}) => {
  const base = sharedApiBase();
  if (!base) return null;
  try {
    const response = await fetch(`${base}${path}`, options);
    if (!response.ok) return null;
    return response;
  } catch {
    return null;
  }
};

const openDatabase = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const transaction = async (mode, action) => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
};

const loadImportedSourcesLocal = async () => {
  try {
    return await transaction("readonly", (store) => store.get(SOURCES_KEY)) || [];
  } catch {
    return [];
  }
};

const saveImportedSourcesLocal = async (sources) => {
  await transaction("readwrite", (store) => store.put(sources, SOURCES_KEY));
};

const loadAnalysisCacheLocal = async () => {
  try {
    return await transaction("readonly", (store) => store.get(ANALYSIS_CACHE_KEY)) || null;
  } catch {
    return null;
  }
};

const saveAnalysisCacheLocal = async (cache) => {
  await transaction("readwrite", (store) => store.put(cache, ANALYSIS_CACHE_KEY));
};

const stableHash = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const sourceRowCount = (source) => Array.isArray(source?.rows) ? source.rows.length : Number(source?.rowCount || 0);

export const createSourcesSignature = (sources = []) => {
  const payload = sources
    .map((source) => ({
      module: source.module || "",
      name: String(source.name || "").trim().toLowerCase(),
      size: Number(source.size || 0),
      kind: source.kind || "",
      subKind: source.subKind || "",
      projectName: source.projectName || "",
      importedAt: source.importedAt || "",
      rowCount: sourceRowCount(source),
      sheets: Array.isArray(source.sheets) ? source.sheets : [],
    }))
    .sort((a, b) => `${a.module}::${a.name}::${a.kind}`.localeCompare(`${b.module}::${b.name}::${b.kind}`));
  return `sources-v1:${stableHash(JSON.stringify(payload))}`;
};

export const summarizeSources = (sources = []) => sources.map(({ rows, ...source }) => ({
  ...source,
  rowCount: sourceRowCount({ rows, ...source }),
  rows: [],
}));

export const uploadSourceFiles = async (sources = [], rawFiles = []) => {
  const sourceByName = new Map(sources.map((source) => [source.name, source]));
  const filesToUpload = rawFiles.filter((file) => sourceByName.has(file.name));
  if (!filesToUpload.length) return sources;
  const formData = new FormData();
  formData.append("manifest", JSON.stringify(sources.map((source) => ({
    ...summarizeSources([source])[0],
    rows: undefined,
  }))));
  filesToUpload.forEach((file) => formData.append("files", file, file.name));
  const response = await requestSharedApi("/uploads", { method: "POST", body: formData });
  if (!response) return sources;
  const payload = await response.json();
  const uploadedByKey = new Map((payload.files || []).map((file) => [`${file.module}::${file.name}`, file]));
  return sources.map((source) => {
    const uploaded = uploadedByKey.get(`${source.module}::${source.name}`);
    return uploaded ? { ...source, ...uploaded } : source;
  });
};

const ensureLocalAgentReportStore = async () => {
  if (localAgentReportStorePromise) return localAgentReportStorePromise;
  localAgentReportStorePromise = (async () => {
    const currentIndex = readLocalAgentReportIndex();
    const legacy = readLegacyLocalAgentReports();
    if (!currentIndex.length && legacy.length) {
      const index = legacy.map(({ content, ...metadata }) => ({ ...metadata, localOnly: true }));
      await transaction("readwrite", (store) => {
        legacy.forEach((item) => store.put(item, `${LOCAL_AGENT_REPORT_CONTENT_PREFIX}${item.fileName}`));
        return store.put(index, LOCAL_AGENT_REPORTS_INDEX_KEY);
      });
      writeLocalAgentReportIndex(index);
      try { localStorage.removeItem(LOCAL_AGENT_REPORTS_KEY); } catch {}
    } else if (!currentIndex.length) {
      await transaction("readwrite", (store) => store.put([], LOCAL_AGENT_REPORTS_INDEX_KEY));
      writeLocalAgentReportIndex([]);
    }
    return true;
  })().catch((error) => {
    localAgentReportStorePromise = null;
    throw error;
  });
  return localAgentReportStorePromise;
};

export const loadImportedSources = async () => {
  const localSources = await loadImportedSourcesLocal();
  const remoteSources = await loadRemoteState(REMOTE_SOURCES_KEY);
  if (Array.isArray(remoteSources)) {
    if (remoteSources.length) {
      saveImportedSourcesLocal(remoteSources).catch(() => {});
    }
    return remoteSources;
  }
  return localSources;
};

export const loadDefaultSources = async () => {
  try {
    return await loadDefaultJson("defaultSources.json") || [];
  } catch {
    return [];
  }
};

export const loadDefaultQmsSources = async () => {
  try {
    return await loadDefaultJson("defaultQmsSources.json") || [];
  } catch {
    return [];
  }
};

export const loadDefaultAnalysis = async () => {
  try {
    return await loadDefaultJson("defaultAnalysis.json");
  } catch {
    return null;
  }
};

export const loadDefaultAnnotations = async () => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL || "./"}defaultAnnotations.json`, { cache: "no-store" });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
};

const loadDefaultJson = async (fileName) => {
  const base = import.meta.env.BASE_URL || "./";
  const compressed = await fetchJsonGzip(`${base}${fileName}.gz`);
  if (compressed != null) return compressed;
  const response = await fetch(`${base}${fileName}`, { cache: "no-store" });
  if (!response.ok) return null;
  return await response.json();
};

const fetchJsonGzip = async (url) => {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok || !response.body) return null;
    try {
      return await response.clone().json();
    } catch {
      if (typeof DecompressionStream === "undefined") return null;
      const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
      return await new Response(stream).json();
    }
  } catch {
    return null;
  }
};

export const saveImportedSources = async (sources) => {
  await saveImportedSourcesLocal(sources);
  const remoteSources = summarizeSources(sources);
  const remoteSaved = await saveRemoteState(REMOTE_SOURCES_KEY, remoteSources);
  if (!sharedApiBase()) return remoteSources;
  return Array.isArray(remoteSaved) ? remoteSaved : null;
};

export const downloadSourceFiles = async (sources = []) => {
  const files = [];
  for (const source of sources) {
    if (!source.serverFile) continue;
    const path = source.serverFile.startsWith("/api") ? source.serverFile.slice(4) : source.serverFile;
    const response = await requestSharedApi(path, { method: "GET", cache: "no-store" });
    if (!response) continue;
    const blob = await response.blob();
    files.push(new File([blob], source.name, { type: blob.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }
  return files;
};

export const loadCachedAnalysis = async () => {
  const localCache = await loadAnalysisCacheLocal();
  const remoteCache = await loadRemoteState(REMOTE_ANALYSIS_CACHE_KEY);
  if (remoteCache && typeof remoteCache === "object" && remoteCache.data) {
    saveAnalysisCacheLocal(remoteCache).catch(() => {});
    return remoteCache;
  }
  if (Array.isArray(remoteCache)) return null;
  return localCache;
};

export const saveCachedAnalysis = async (cache) => {
  await saveAnalysisCacheLocal(cache);
  const remoteSaved = await saveRemoteState(REMOTE_ANALYSIS_CACHE_KEY, cache);
  if (!sharedApiBase()) return cache;
  return remoteSaved && typeof remoteSaved === "object" ? remoteSaved : null;
};

export const loadAppliedDateRange = async () => {
  const remoteRange = await loadRemoteState(REMOTE_APPLIED_DATE_RANGE_KEY);
  return remoteRange && typeof remoteRange === "object" && !Array.isArray(remoteRange) ? remoteRange : null;
};

export const saveAppliedDateRange = async (range) => {
  const payload = { ...range, savedAt: new Date().toISOString() };
  const remoteSaved = await saveRemoteState(REMOTE_APPLIED_DATE_RANGE_KEY, payload);
  if (!sharedApiBase()) return payload;
  return remoteSaved && typeof remoteSaved === "object" ? remoteSaved : null;
};

export const loadDqaEngineerSupplement = async () => {
  const local = await transaction("readonly", (store) => store.get(DQA_ENGINEER_SUPPLEMENT_KEY)).catch(() => null);
  const remote = await loadRemoteState(DQA_ENGINEER_SUPPLEMENT_KEY);
  if (remote && typeof remote === "object") {
    transaction("readwrite", (store) => store.put(remote, DQA_ENGINEER_SUPPLEMENT_KEY)).catch(() => {});
    return remote;
  }
  return local && typeof local === "object" ? local : null;
};

export const saveDqaEngineerSupplement = async (value) => {
  await transaction("readwrite", (store) => store.put(value, DQA_ENGINEER_SUPPLEMENT_KEY));
  return await saveRemoteState(DQA_ENGINEER_SUPPLEMENT_KEY, value);
};

export const clearDqaEngineerSupplement = async () => {
  await transaction("readwrite", (store) => store.delete(DQA_ENGINEER_SUPPLEMENT_KEY));
  return await saveRemoteState(DQA_ENGINEER_SUPPLEMENT_KEY, null);
};

export const loadCurrentUser = async () => {
  const localAccess = { ip: "local", name: "本机用户", role: "local", isAdmin: false, isDeputy: false, isOrdinary: true, isAuthorized: true, features: {} };
  try {
    if (!sharedApiBase()) return localAccess;
    const response = await requestSharedApi("/me", { method: "GET", cache: "no-store" });
    if (!response) return { ip: "", name: "", role: "unauthorized", isAdmin: false, isDeputy: false, isOrdinary: false, isAuthorized: false, features: {} };
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return { ip: "", name: "", role: "unauthorized", isAdmin: false, isDeputy: false, isOrdinary: false, isAuthorized: false, features: {} };
    return await response.json();
  } catch {
    return { ip: "", name: "", role: "unauthorized", isAdmin: false, isDeputy: false, isOrdinary: false, isAuthorized: false, features: {} };
  }
};

export const loadPermissionConfig = async () => {
  try {
    const response = await requestSharedApi("/permissions", { method: "GET", cache: "no-store" });
    if (!response) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const savePermissionConfig = async (permissions) => {
  const response = await requestSharedApi("/permissions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions }),
  });
  if (!response) return null;
  return await response.json();
};

const aiApiJson = async (path, options = {}) => {
  const base = sharedApiBase();
  if (!base) throw new Error("当前页面未连接QMS后端，请通过项目服务地址打开");
  let response;
  try { response = await fetch(`${base}${path}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options }); }
  catch { throw new Error("无法连接本机QMS后端，请先启动或重启项目服务"); }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 404) throw new Error("当前QMS后端版本过旧，请重启项目服务后再试");
  if (!response.ok) throw new Error(payload?.error || `AI接口请求失败（${response.status}）`);
  return payload;
};

export const loadAiConfig = async () => {
  const local = readLocalAiConfig();
  const localConfigured = Boolean(local.apiKey);
  let remote = {};
  try { remote = await aiApiJson("/ai/config", { method: "GET", cache: "no-store" }); } catch {}
  return localConfigured
    ? { ...remote, ...publicLocalAiConfig(local) }
    : { baseUrl: remote.baseUrl || defaultLocalAiConfig.baseUrl, model: remote.model || "", hasApiKey: Boolean(remote.hasApiKey), apiKeyHint: remote.apiKeyHint || "", apiKey: "" };
};
export const saveAiConfig = async (config, options = {}) => {
  const next = fullLocalAiConfig(config);
  if (typeof localStorage !== "undefined") localStorage.setItem(LOCAL_AI_CONFIG_KEY, JSON.stringify(next));
  if (options.saveToServer && next.apiKey) {
    return await aiApiJson("/ai/config", { method: "PUT", body: JSON.stringify({ config: next }) });
  }
  return publicLocalAiConfig(next);
};
export const loadAiModels = async (config = {}) => {
  const local = localAiRequestConfig(config);
  return await aiApiJson("/ai/models", { method: "POST", body: JSON.stringify(local ? { config: local } : {}) });
};
export const testAiConfig = async (config) => {
  const next = localAiRequestConfig(config);
  if (next && typeof localStorage !== "undefined") localStorage.setItem(LOCAL_AI_CONFIG_KEY, JSON.stringify(next));
  return await aiApiJson("/ai/test", { method: "POST", body: JSON.stringify(next ? { config: next } : {}) });
};
export const requestAiChat = async (messages, options = {}) => {
  const { signal, config, ...payload } = options || {};
  const local = localAiRequestConfig(config || {});
  return await aiApiJson("/ai/chat", { method: "POST", body: JSON.stringify({ messages, ...payload, ...(local ? { config: local } : {}) }), signal });
};
export const saveAiReport = async (report) => await aiApiJson("/ai/reports", { method: "POST", body: JSON.stringify(report) });
export const saveAgentDispatch = async (dispatch) => await aiApiJson("/ai/agent-dispatch", { method: "POST", body: JSON.stringify(dispatch) });
export const loadAgentDispatches = async () => await aiApiJson("/ai/agent-dispatch", { method: "GET", cache: "no-store" });
export const loadAgentSkills = async () => await aiApiJson("/ai/skills", { method: "GET", cache: "no-store" });
export const loadAgentReports = async (filters = {}) => {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && String(value).trim()).map(([key, value]) => [key, String(value)]));
  return await aiApiJson(`/ai/agent-reports${query.size ? `?${query.toString()}` : ""}`, { method: "GET", cache: "no-store" });
};
export const loadAgentReport = async (fileName) => await aiApiJson(`/ai/agent-reports/${encodeURIComponent(fileName)}`, { method: "GET", cache: "no-store" });
export const saveAgentReportFile = async (report) => await aiApiJson("/ai/agent-reports", { method: "POST", body: JSON.stringify({ ...report, feature: "qualityAgent" }) });
export const deleteAgentReport = async (fileName) => await aiApiJson(`/ai/agent-reports/${encodeURIComponent(fileName)}`, { method: "DELETE" });

export const loadLocalAgentReports = async () => {
  try {
    await ensureLocalAgentReportStore();
    return readLocalAgentReportIndex();
  } catch {
    return readLegacyLocalAgentReports().map(({ content, ...metadata }) => ({ ...metadata, localOnly: true }));
  }
};
export const loadLocalAgentReport = async (fileName) => {
  try {
    await ensureLocalAgentReportStore();
    const value = await transaction("readonly", (store) => store.get(`${LOCAL_AGENT_REPORT_CONTENT_PREFIX}${fileName}`));
    return value || null;
  } catch {
    return readLegacyLocalAgentReports().find((item) => item.fileName === fileName) || null;
  }
};
export const saveLocalAgentReport = async (report = {}) => {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const safe = String(report.module || "AI分析").replace(/[\\/:*?"<>|]/g, "-");
  const fileName = report.fileName || `本地-Agent报告-${safe}-${stamp}.md`;
  const item = { ...report, fileName, localOnly: true, updatedAt: now.toISOString(), savedAt: now.toISOString() };
  try {
    await ensureLocalAgentReportStore();
    const reports = [item, ...readLocalAgentReportIndex().filter((entry) => entry.fileName !== fileName)].slice(0, 300);
    const metadata = reports.map(({ content, ...entry }) => ({ ...entry, localOnly: true }));
    await transaction("readwrite", (store) => {
      store.put(item, `${LOCAL_AGENT_REPORT_CONTENT_PREFIX}${fileName}`);
      return store.put(metadata, LOCAL_AGENT_REPORTS_INDEX_KEY);
    });
    writeLocalAgentReportIndex(metadata);
  } catch {
    const reports = [item, ...readLegacyLocalAgentReports().filter((entry) => entry.fileName !== fileName)];
    try { localStorage.setItem(LOCAL_AGENT_REPORTS_KEY, JSON.stringify(reports.slice(0, 30))); } catch {}
  }
  return item;
};
export const deleteLocalAgentReport = async (fileName) => {
  try {
    await ensureLocalAgentReportStore();
    const reports = readLocalAgentReportIndex().filter((entry) => entry.fileName !== fileName);
    await transaction("readwrite", (store) => {
      store.delete(`${LOCAL_AGENT_REPORT_CONTENT_PREFIX}${fileName}`);
      return store.put(reports, LOCAL_AGENT_REPORTS_INDEX_KEY);
    });
    writeLocalAgentReportIndex(reports);
  } catch {
    const reports = readLegacyLocalAgentReports().filter((entry) => entry.fileName !== fileName);
    try { localStorage.setItem(LOCAL_AGENT_REPORTS_KEY, JSON.stringify(reports.slice(0, 30))); } catch {}
  }
  return { ok: true, fileName };
};
export const saveLocalAiReport = (report = {}) => {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const safe = String(report.module || "AI分析").replace(/[\\/:*?"<>|]/g, "-");
  const item = { ...report, fileName: report.fileName || `本地-AI分析-${safe}-${stamp}.json`, localOnly: true, savedAt: now.toISOString() };
  writeLocalAiReports([item, ...readLocalAiReports().filter((entry) => entry.fileName !== item.fileName)]);
  return item;
};
export const loadLocalAiReports = () => readLocalAiReports();

const knowledgeApiJson = async (path, options = {}) => {
  const base = sharedApiBase();
  if (!base) throw new Error("当前页面未连接QMS后端，请通过项目服务地址打开");
  let response;
  try { response = await fetch(`${base}${path}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options }); }
  catch { throw new Error("无法连接QMS知识库服务，请先启动或重启项目服务"); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `知识库请求失败（${response.status}）`);
  return payload;
};

export const loadKnowledgeDocuments = async () => knowledgeApiJson("/knowledge/documents", { method: "GET", cache: "no-store" });
export const createKnowledgeDocument = async (document) => knowledgeApiJson("/knowledge/documents", { method: "POST", body: JSON.stringify(document) });
export const deleteKnowledgeDocument = async (documentId) => knowledgeApiJson(`/knowledge/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
export const reparseKnowledgeDocument = async (documentId) => knowledgeApiJson(`/knowledge/documents/${encodeURIComponent(documentId)}/parse`, { method: "POST" });
export const loadKnowledgeClauses = async (documentId, { limit = 100, offset = 0, query = "" } = {}) => {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (query) params.set("query", query);
  return knowledgeApiJson(`/knowledge/documents/${encodeURIComponent(documentId)}/clauses?${params.toString()}`, { method: "GET", cache: "no-store" });
};
export const startKnowledgeDistillation = async (documentId, skillId) => knowledgeApiJson(`/knowledge/documents/${encodeURIComponent(documentId)}/distillation-jobs`, { method: "POST", body: JSON.stringify({ skillId }) });
export const updateKnowledgeJob = async (jobId, patch) => knowledgeApiJson(`/knowledge/jobs/${encodeURIComponent(jobId)}`, { method: "PUT", body: JSON.stringify(patch) });
export const saveKnowledgeDistillation = async (documentId, payload) => knowledgeApiJson(`/knowledge/documents/${encodeURIComponent(documentId)}/distillations`, { method: "POST", body: JSON.stringify(payload) });
export const loadDistilledKnowledge = async (documentId, { limit = 100, offset = 0 } = {}) => knowledgeApiJson(`/knowledge/documents/${encodeURIComponent(documentId)}/distillations?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`, { method: "GET", cache: "no-store" });
export const syncKnowledgeIssues = async (issues) => knowledgeApiJson("/knowledge/issues", { method: "POST", body: JSON.stringify({ issues }) });
export const loadKnowledgeIssues = async ({ module = "", personName = "", query = "", status = "", limit = 30, offset = 0 } = {}) => {
  const params = new URLSearchParams({ module, personName, query, status, limit: String(limit), offset: String(offset) });
  return knowledgeApiJson(`/knowledge/issues?${params.toString()}`, { method: "GET", cache: "no-store" });
};
export const generateKnowledgeMatches = async (issueId) => knowledgeApiJson(`/knowledge/issues/${encodeURIComponent(issueId)}/matches`, { method: "POST", body: "{}" });
export const loadKnowledgeMatches = async (issueId) => knowledgeApiJson(`/knowledge/issues/${encodeURIComponent(issueId)}/matches`, { method: "GET", cache: "no-store" });
export const reviewKnowledgeMatch = async (matchId, status) => knowledgeApiJson(`/knowledge/matches/${encodeURIComponent(matchId)}`, { method: "PUT", body: JSON.stringify({ status }) });
export const loadConfirmedKnowledgeMatches = async ({ module = "", personName = "", limit = 5000 } = {}) => {
  const params = new URLSearchParams({ module, personName, limit: String(limit) });
  return knowledgeApiJson(`/knowledge/matches/confirmed?${params.toString()}`, { method: "GET", cache: "no-store" });
};
export const loadKnowledgeRecurrences = async ({ module = "IPQC", query = "", state = "", limit = 20, offset = 0, compact = false } = {}) => {
  const params = new URLSearchParams({ module, query, state, limit: String(limit), offset: String(offset), compact: compact ? "true" : "false" });
  return knowledgeApiJson(`/knowledge/recurrences?${params.toString()}`, { method: "GET", cache: "no-store" });
};
export const saveKnowledgeRecurrenceAction = async (recurrenceKey, action) => knowledgeApiJson(`/knowledge/recurrences/${encodeURIComponent(recurrenceKey)}/action`, { method: "PUT", body: JSON.stringify(action) });

const examApiJson = async (path, options = {}) => {
  const base = sharedApiBase();
  if (!base) throw new Error("当前页面未连接QMS后端，请通过项目服务地址打开");
  let response;
  try { response = await fetch(`${base}${path}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options }); }
  catch { throw new Error("无法连接QMS后端，考试链接暂不可用"); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `考试服务请求失败（${response.status}）`);
  return payload;
};

export const createExamSession = async (payload) => examApiJson("/exam-sessions", { method: "POST", body: JSON.stringify(payload) });
export const loadExamSession = async (token) => examApiJson(`/exam-sessions/${encodeURIComponent(token)}`, { method: "GET", cache: "no-store" });
export const submitExamSession = async (token, answers) => examApiJson(`/exam-sessions/${encodeURIComponent(token)}/submit`, { method: "POST", body: JSON.stringify({ answers }) });
export const loadExamResults = async ({ roleName = "", recipientName = "", includePending = false, limit = 300 } = {}) => {
  const params = new URLSearchParams();
  if (roleName) params.set("roleName", roleName);
  if (recipientName) params.set("recipientName", recipientName);
  if (includePending) params.set("includePending", "true");
  params.set("limit", String(Math.min(1000, Math.max(1, Number(limit) || 300))));
  return examApiJson(`/exam-results?${params.toString()}`, { method: "GET", cache: "no-store" });
};

export const clearImportedSources = async () => {
  await transaction("readwrite", (store) => store.delete(SOURCES_KEY));
};

export const sourceIdentity = (source) => `${source.module}::${source.name.trim().toLowerCase()}`;

export const mergeImportedSources = (current, incoming) => {
  const next = [...current];
  const replaced = [];
  const added = [];
  incoming.forEach((source) => {
    const identity = sourceIdentity(source);
    const index = next.findIndex((item) => sourceIdentity(item) === identity);
    if (index >= 0) {
      next[index] = source;
      replaced.push(source.name);
    } else {
      next.push(source);
      added.push(source.name);
    }
  });
  return { sources: next, replaced, added };
};
