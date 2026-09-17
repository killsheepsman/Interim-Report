const UNIT_STRIDE = 10;

const dictMaker = () => {
  const index = new Map();
  const list = [];
  const id = (value) => {
    const key = String(value ?? "");
    if (index.has(key)) return index.get(key);
    const next = list.length;
    index.set(key, next);
    list.push(key);
    return next;
  };
  return { list, id };
};

const isCompactPayload = (payload) => Boolean(payload && payload.v === 2 && payload.dicts && Array.isArray(payload.units));

export const compactDoamDataset = (dataset = {}) => {
  const t = dictMaker();
  const e = dictMaker();
  const p = dictMaker();
  const k = dictMaker();
  const m = dictMaker();
  const s = dictMaker();
  const d = dictMaker();
  const c = dictMaker();
  const units = [];
  (dataset.units || []).forEach((row) => {
    units.push(
      d.id(row.d),
      s.id(row.s),
      m.id(row.m),
      t.id(row.t),
      e.id(row.e),
      p.id(row.p),
      k.id(row.k),
      Number(row.y) || 0,
      Number(row.o) || 0,
      Number(row.a || 0)
    );
  });
  const categories = (dataset.categories || []).map((row) => [
    Number(row.y) || 0,
    t.id(row.t),
    c.id(row.c),
    e.id(row.e),
    Number(row.a || 0),
    (row.ms || []).map((item) => m.id(item)),
    (row.ds || []).map((item) => d.id(item)),
  ]);
  return {
    v: 2,
    schema: "doam-compact-v2",
    files: dataset.files || dataset.quality?.files || [],
    quality: dataset.quality || {},
    dicts: { t: t.list, e: e.list, p: p.list, k: k.list, m: m.list, s: s.list, d: d.list, c: c.list },
    unitCount: (dataset.units || []).length,
    units,
    categories,
  };
};

export const expandDoamDataset = (payload = {}) => {
  if (!payload || typeof payload !== "object") return { units: [], categories: [], quality: {}, files: [] };
  if (!isCompactPayload(payload)) {
    return {
      units: payload.units || [],
      categories: payload.categories || [],
      quality: { ...(payload.quality || {}), files: payload.quality?.files || payload.files || [] },
      files: payload.files || payload.quality?.files || [],
    };
  }
  const dicts = payload.dicts || {};
  const take = (list, index) => (list && list[index] != null ? list[index] : "");
  const units = [];
  const raw = payload.units || [];
  const count = payload.unitCount || Math.floor(raw.length / UNIT_STRIDE);
  for (let index = 0; index < count; index += 1) {
    const offset = index * UNIT_STRIDE;
    const date = take(dicts.d, raw[offset]);
    units.push({
      d: date,
      s: take(dicts.s, raw[offset + 1]),
      m: take(dicts.m, raw[offset + 2]),
      t: take(dicts.t, raw[offset + 3]),
      e: take(dicts.e, raw[offset + 4]),
      p: take(dicts.p, raw[offset + 5]),
      k: take(dicts.k, raw[offset + 6]),
      y: raw[offset + 7],
      o: raw[offset + 8],
      a: raw[offset + 9],
    });
  }
  const categories = (payload.categories || []).map((row) => ({
    y: row[0],
    t: take(dicts.t, row[1]),
    c: take(dicts.c, row[2]),
    e: take(dicts.e, row[3]),
    a: row[4],
    ms: (row[5] || []).map((index) => take(dicts.m, index)),
    ds: (row[6] || []).map((index) => take(dicts.d, index)),
  }));
  return {
    units,
    categories,
    quality: { ...(payload.quality || {}), files: payload.quality?.files || payload.files || [] },
    files: payload.files || payload.quality?.files || [],
  };
};

export const gzipJson = async (value) => {
  const text = JSON.stringify(value);
  if (typeof CompressionStream !== "function") return { encoding: "json", compact: value, bytes: text.length };
  const bytes = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  return { encoding: "gzip", data: bytes, bytes: bytes.length };
};

export const gunzipJson = async (item) => {
  if (!item) return null;
  if (item.encoding === "json" && item.compact) return item.compact;
  if (item.v === 2 && item.dicts) return item;
  if (item.encoding === "gzip" && item.data && typeof DecompressionStream === "function") {
    const text = await new Response(new Blob([item.data]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    return JSON.parse(text);
  }
  return item;
};
