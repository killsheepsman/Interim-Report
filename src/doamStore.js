import { compactDoamDataset, expandDoamDataset } from "./doamCompact.js";
import { mergeDoamDatasets } from "./doamEngine.js";
import { fetchUploadedJson, loadImportedSources, saveImportedSources, uploadSourceFiles } from "./dataStore.js";

const LEGACY_DB = "qms-doam-v1";
let memoryPack = null;
let memoryDataset = null;

const csvItems = (sources = []) => (sources || [])
  .filter((item) => item.module === "DOAM" && item.kind !== "DOAM_COMPACT")
  .map((item) => ({
    name: item.name,
    importedAt: item.importedAt || 0,
    rowCount: item.rowCount || 0,
    serverFile: item.serverFile || "",
  }));

const compactNameFor = (name) => String(name || "doam.csv") + ".doam.json";
const parentNameOf = (source) => source.parentName || String(source.name || "").replace(/\.doam\.json$/i, "");

const readLegacyPack = async () => {
  if (typeof indexedDB === "undefined") return { items: [] };
  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(LEGACY_DB, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const pack = await new Promise((resolve) => {
      const tx = db.transaction("packs", "readonly");
      const request = tx.objectStore("packs").get("items");
      request.onsuccess = () => resolve(request.result || { items: [] });
      request.onerror = () => resolve({ items: [] });
    });
    db.close();
    return pack;
  } catch {
    return { items: [] };
  }
};

const dropLegacyPack = async () => {
  if (typeof indexedDB === "undefined") return;
  try { indexedDB.deleteDatabase(LEGACY_DB); } catch {}
};

const mergeDoamSources = (current, incoming) => {
  const drop = new Set(incoming.map((item) => item.module + "::" + item.name));
  incoming.forEach((item) => {
    if (item.parentName) drop.add("DOAM::" + compactNameFor(item.parentName));
  });
  return [...(current || []).filter((item) => !drop.has((item.module || "") + "::" + item.name)), ...incoming];
};

const persistSources = async (sources) => {
  memoryPack = null;
  memoryDataset = null;
  await saveImportedSources(sources);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("qms-doam-changed"));
  return sources;
};

export const loadDoamPackMeta = async () => {
  const sources = await loadImportedSources();
  return { items: csvItems(sources) };
};

export const loadDoamPack = async () => {
  if (memoryPack) return memoryPack;
  await migrateLegacyDoamPack();
  const sources = await loadImportedSources();
  const compactSources = (sources || []).filter((item) => item.module === "DOAM" && item.kind === "DOAM_COMPACT");
  const items = [];
  for (const source of compactSources) {
    const compact = source.doamCompact || (source.serverFile ? await fetchUploadedJson(source.serverFile) : null);
    if (!compact) continue;
    const expanded = expandDoamDataset(compact);
    items.push({
      ...expanded,
      name: parentNameOf(source),
      importedAt: source.importedAt,
      rowCount: source.rowCount || expanded.quality?.rowCount || 0,
      files: expanded.files?.length ? expanded.files : [parentNameOf(source)],
    });
  }
  memoryPack = { items };
  return memoryPack;
};

export const loadDoamDataset = async () => {
  if (memoryDataset) return memoryDataset;
  const pack = await loadDoamPack();
  const items = pack.items || [];
  if (!items.length) return null;
  memoryDataset = mergeDoamDatasets({ units: [], categories: [], quality: {}, files: [] }, items);
  return memoryDataset;
};

export const saveDoamPack = async (pack) => {
  const entries = (pack?.items || []).map((item) => ({
    dataset: item,
    file: new File([JSON.stringify(compactDoamDataset(item))], compactNameFor(item.name || "doam.csv"), { type: "application/json" }),
  }));
  return await upsertDoamFiles(entries.map((entry) => ({ dataset: entry.dataset, file: entry.file, originalName: entry.dataset.name })));
};

export const clearDoamPack = async () => {
  const sources = (await loadImportedSources()).filter((item) => item.module !== "DOAM");
  const next = await persistSources(sources);
  await dropLegacyPack();
  return { items: [], sources: next };
};

export const upsertDoamFiles = async (entries = []) => {
  const normalized = entries.map((entry) => {
    if (entry?.dataset && entry?.file) return entry;
    const name = entry?.files?.[0] || entry?.name || "doam.csv";
    return { dataset: entry, file: null, originalName: name };
  });
  const current = await loadImportedSources();
  const now = new Date().toISOString();
  const incoming = [];
  const rawFiles = [];
  for (const entry of normalized) {
    const dataset = entry.dataset || {};
    const originalName = entry.originalName || entry.file?.name || dataset.files?.[0] || "doam.csv";
    const compact = compactDoamDataset({ ...dataset, files: [originalName] });
    const compactFileName = compactNameFor(originalName);
    const compactFile = new File([JSON.stringify(compact)], compactFileName, { type: "application/json" });
    const csvSource = {
      module: "DOAM",
      name: originalName,
      kind: "DOAM_CSV",
      sheets: ["CSV"],
      rowCount: dataset.quality?.rowCount || 0,
      importedAt: now,
      rows: [],
    };
    const compactSource = {
      module: "DOAM",
      name: compactFileName,
      kind: "DOAM_COMPACT",
      parentName: originalName,
      sheets: ["compact"],
      rowCount: dataset.quality?.rowCount || 0,
      importedAt: now,
      rows: [],
    };
    if (entry.file) {
      incoming.push(csvSource);
      rawFiles.push(entry.file);
    }
    incoming.push(compactSource);
    rawFiles.push(compactFile);
  }
  const uploaded = await uploadSourceFiles(incoming, rawFiles);
  const uploadedByKey = new Map((uploaded || []).map((item) => [item.module + "::" + item.name, item]));
  let merged = mergeDoamSources(current, incoming.map((item) => uploadedByKey.get(item.module + "::" + item.name) || item));
  if (!(uploaded || []).some((item) => item.serverFile)) {
    merged = merged.map((item) => {
      if (item.module !== "DOAM" || item.kind !== "DOAM_COMPACT") return item;
      const match = normalized.find((entry) => compactNameFor(entry.originalName || entry.file?.name || "") === item.name);
      if (!match) return item;
      return { ...item, doamCompact: compactDoamDataset(match.dataset) };
    });
  }
  await persistSources(merged);
  return { items: csvItems(merged), sources: merged };
};

export const removeDoamFile = async (name) => {
  const compactName = compactNameFor(name);
  const sources = (await loadImportedSources()).filter((item) => !(item.module === "DOAM" && (item.name === name || item.name === compactName || item.parentName === name)));
  await persistSources(sources);
  await dropLegacyPack();
  return { items: csvItems(sources), sources };
};

export const migrateLegacyDoamPack = async () => {
  const current = await loadImportedSources();
  if ((current || []).some((item) => item.module === "DOAM")) return { migrated: false };
  const legacy = await readLegacyPack();
  const legacyItems = (legacy.items || []).filter((item) => (item.units || []).length);
  if (!legacyItems.length) return { migrated: false };
  await upsertDoamFiles(legacyItems.map((item) => ({ dataset: item, originalName: item.name || "migrated.csv" })));
  await dropLegacyPack();
  return { migrated: true, count: legacyItems.length };
};
