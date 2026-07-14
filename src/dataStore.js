const DB_NAME = "qms-quality-analytics";
const DB_VERSION = 1;
const STORE_NAME = "app-state";
const SOURCES_KEY = "imported-sources-v20260625-dqa-refresh";
const REMOTE_SOURCES_KEY = "imported-sources";
const ANALYSIS_CACHE_KEY = "analysis-cache-v1";
const REMOTE_ANALYSIS_CACHE_KEY = "analysis-cache";
const REMOTE_APPLIED_DATE_RANGE_KEY = "applied-date-range";

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
  return Array.isArray(remoteSaved) ? remoteSaved : remoteSources;
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
  return remoteSaved && typeof remoteSaved === "object" ? remoteSaved : cache;
};

export const loadAppliedDateRange = async () => {
  const remoteRange = await loadRemoteState(REMOTE_APPLIED_DATE_RANGE_KEY);
  return remoteRange && typeof remoteRange === "object" && !Array.isArray(remoteRange) ? remoteRange : null;
};

export const saveAppliedDateRange = async (range) => {
  const payload = { ...range, savedAt: new Date().toISOString() };
  const remoteSaved = await saveRemoteState(REMOTE_APPLIED_DATE_RANGE_KEY, payload);
  return remoteSaved && typeof remoteSaved === "object" ? remoteSaved : payload;
};

export const loadCurrentUser = async () => {
  try {
    const response = await requestSharedApi("/me", { method: "GET", cache: "no-store" });
    if (!response) return { ip: "", role: "public", isAdmin: false, isDeputy: false, features: {} };
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return { ip: "", role: "public", isAdmin: false, isDeputy: false, features: {} };
    return await response.json();
  } catch {
    return { ip: "", role: "public", isAdmin: false, isDeputy: false, features: {} };
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
