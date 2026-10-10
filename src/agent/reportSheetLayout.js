export const chartFamily = (title) => {
  const text = String(title || "");
  if (/月度|周度|趋势/.test(text)) return "trend";
  if (/构成|Pareto|帕累托|分类|原因|意见/.test(text)) return "compose";
  if (/四格|不合格率|异常密度|5分|低分|比例|次\/班次|平均分/.test(text)) return "rate";
  return "rank";
};

const boxLimit = (item) => {
  const width = Number(item?.boxWidth) || 0;
  if (width > 780) return 1;
  if (width > 520) return 2;
  return 3;
};

const smallEnough = (item) => {
  const count = Number(item?.count) || 0;
  const nameLen = Number(item?.nameLen) || 0;
  if (!count || count > 4) return false;
  if (nameLen > 6) return false;
  return item?.family !== "trend";
};

const alone = (item) => {
  if (!item) return true;
  if (item.rowSize === 1) return true;
  if (/四格/.test(item.title || "")) return true;
  if ((Number(item.count) || 0) > 8) return true;
  if ((Number(item.nameLen) || 0) > 12) return true;
  return boxLimit(item) === 1;
};

const chunk = (band, size) => {
  const rows = [];
  const width = Math.min(size, ...band.map(boxLimit));
  const takeSize = width === 1 ? 1 : width;
  let index = 0;
  while (index < band.length) {
    const left = band.length - index;
    const take = left >= takeSize ? takeSize : left === 2 && takeSize === 3 ? 2 : left;
    const items = band.slice(index, index + take);
    rows.push({ size: items.length, items });
    index += take;
  }
  return rows;
};

const sameBand = (left, right) => {
  if (alone(left) || alone(right)) return false;
  return (left.family === "trend") === (right.family === "trend");
};
export const packSheetRows = (items) => {
  const ready = (items || []).filter(Boolean);
  if (!ready.length) return [];
  const rows = [{ size: 1, items: [ready[0]], hero: true }];
  let index = 1;
  while (index < ready.length) {
    if (alone(ready[index])) {
      rows.push({ size: 1, items: [ready[index]] });
      index += 1;
      continue;
    }
    const band = [ready[index]];
    index += 1;
    while (index < ready.length && sameBand(band[0], ready[index]) && band.length < 6) {
      band.push(ready[index]);
      index += 1;
    }
    const hints = band.map((item) => item.rowSize).filter((size) => size === 2 || size === 3);
    const hinted = hints.length === band.length && new Set(hints).size === 1 ? hints[0] : 0;
    const size = hinted || (band.length >= 3 && band.every(smallEnough) ? 3 : 2);
    rows.push(...chunk(band, size));
  }
  return rows;
};

export const closingTitle = (line) => {
  const match = String(line || "").match(/^#{1,3}\s+(.+)$/);
  if (!match) return "";
  const title = match[1].replace(/^\d+[.、]\s*/, "").replace(/^[一二三四五六七八九十]+[、.]\s*/, "").trim();
  return /要做的事|要关注的事|本月措施|重点关注事项/.test(title) ? title : "";
};

export const cardMeta = (html) => {
  const source = String(html || "");
  const title = (source.match(/<h2>(.*?)<\/h2>/) || [])[1] || "";
  const hint = Number((source.match(/data-hint="(\d+)"/) || [])[1]) || 0;
  return {
    title,
    html: source,
    family: (source.match(/data-family="([^"]*)"/) || [])[1] || chartFamily(title),
    count: Number((source.match(/data-count="(\d+)"/) || [])[1]) || 0,
    nameLen: Number((source.match(/data-namelen="(\d+)"/) || [])[1]) || 0,
    boxWidth: Number((source.match(/viewBox="0 0 (\d+)/) || [])[1]) || 0,
    rowSize: hint === 1 || hint === 2 || hint === 3 ? hint : 0,
  };
};

const fitsThree = (item) => {
  const width = Number(item?.boxWidth) || 0;
  const count = Number(item?.count) || 0;
  const nameLen = Number(item?.nameLen) || 0;
  if (width > 560) return false;
  if (count > 6) return false;
  if (nameLen > 8) return false;
  return true;
};
const nextBasicsTake = (prev, left, upcoming) => {
  if (left <= prev) return left;
  if (prev === 1 && left <= 3) return left;
  const grown = Math.min(3, prev + 1);
  const remain = left - grown;
  const canGrow = grown > prev && (remain === 0 || remain >= grown) && upcoming.slice(0, grown).every((item) => grown < 3 || fitsThree(item));
  if (canGrow) return grown;
  return Math.min(prev, left);
};
export const packBasicsRows = (items) => {
  const ready = (items || []).filter(Boolean);
  if (!ready.length) return [];
  const rows = [{ size: 1, items: [ready[0]], hero: true }];
  let index = 1;
  let prev = 1;
  while (index < ready.length) {
    const left = ready.length - index;
    const take = nextBasicsTake(prev, left, ready.slice(index));
    const itemsInRow = ready.slice(index, index + take);
    rows.push({ size: itemsInRow.length, items: itemsInRow });
    prev = itemsInRow.length;
    index += itemsInRow.length;
  }
  return rows;
};
