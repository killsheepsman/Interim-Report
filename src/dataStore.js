const DB_NAME = "qms-quality-analytics";
const DB_VERSION = 1;
const STORE_NAME = "app-state";
const SOURCES_KEY = "imported-sources-v20260625-dqa-refresh";

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

export const loadImportedSources = async () => {
  try {
    return await transaction("readonly", (store) => store.get(SOURCES_KEY)) || [];
  } catch {
    return [];
  }
};

export const loadDefaultSources = async () => {
  try {
    return await loadDefaultJson("defaultSources.json") || [];
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
  if (typeof DecompressionStream === "undefined") return null;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok || !response.body) return null;
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).json();
};

export const saveImportedSources = async (sources) => {
  await transaction("readwrite", (store) => store.put(sources, SOURCES_KEY));
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
