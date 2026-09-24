/**
 * 现场问题三要素：对象 / 缺陷 / 过程。
 * 匹配和蒸馏都先走这一层，不拿原始口语去撞规范全文。
 */
const unique = (items = []) => [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))];

const OBJECT_GROUPS = [
  { canonical: "销钉", aliases: ["销钉", "销子", "定位销"] },
  { canonical: "片针", aliases: ["片针", "针模", "穿针"] },
  { canonical: "吸嘴", aliases: ["吸嘴", "吸杆", "吸嘴头"] },
  { canonical: "调速阀", aliases: ["调速阀"] },
  { canonical: "气路", aliases: ["气路", "气管"] },
  { canonical: "气缸", aliases: ["气缸"] },
  { canonical: "螺丝", aliases: ["螺丝", "螺钉", "螺栓"] },
  { canonical: "接线", aliases: ["接线", "散线", "地线", "PE地线", "PE线", "接地线", "接地"] },
  { canonical: "端子", aliases: ["端子", "接插件"] },
  { canonical: "线束", aliases: ["线束"] },
  { canonical: "电控板", aliases: ["电控板", "继电器"] },
  { canonical: "工装", aliases: ["工装", "治具"] },
  { canonical: "BOM", aliases: ["BOM", "物料清单"] },
  { canonical: "图纸", aliases: ["图纸", "图纸标注"] },
  { canonical: "物料", aliases: ["物料"] },
  { canonical: "接口", aliases: ["接口"] },
  { canonical: "标签", aliases: ["标签"] },
  { canonical: "传感器", aliases: ["传感器"] },
  { canonical: "支架", aliases: ["支架"] },
  { canonical: "外壳", aliases: ["外壳"] },
  { canonical: "垫片", aliases: ["垫片"] },
  { canonical: "扎带", aliases: ["扎带", "束带", "绑带"] },
];

const DEFECT_GROUPS = [
  { canonical: "过打", aliases: ["敲过头", "打过头", "过打", "过定位", "敲过"] },
  { canonical: "错装", aliases: ["错装", "穿错", "装错", "装反", "穿错针"] },
  { canonical: "漏装", aliases: ["漏装", "少装", "没装", "漏打"] },
  { canonical: "不到位", aliases: ["不到位", "没到位", "未到位", "没打紧", "锁不紧"] },
  { canonical: "未剪平", aliases: ["未剪平", "没剪平", "剪不平", "尖角"] },
  { canonical: "不出针", aliases: ["不出针", "卡针"] },
  { canonical: "松动", aliases: ["松动", "没锁紧", "漏锁"] },
  { canonical: "短路", aliases: ["短路"] },
  { canonical: "断路", aliases: ["断路"] },
  { canonical: "虚焊", aliases: ["虚焊"] },
  { canonical: "漏焊", aliases: ["漏焊"] },
  { canonical: "干涉", aliases: ["干涉", "碰撞"] },
  { canonical: "划伤", aliases: ["划伤", "破损", "变形"] },
  { canonical: "缺失", aliases: ["缺失", "未做", "未确认"] },
  { canonical: "不一致", aliases: ["不一致"] },
];

const PROCESS_GROUPS = [
  { canonical: "装配", aliases: ["装配", "组装", "安装"] },
  { canonical: "首件", aliases: ["首件"] },
  { canonical: "巡检", aliases: ["巡检", "点检"] },
  { canonical: "设计", aliases: ["设计", "选型"] },
  { canonical: "评审", aliases: ["评审"] },
  { canonical: "变更", aliases: ["ECN", "变更", "非BOM"] },
  { canonical: "验证", aliases: ["验证", "测试"] },
];

const FIELD_LANGUAGE = {
  销钉: { issueTags: ["敲过头", "过打", "过定位", "不到位"], synonyms: ["销子", "销钉打过头", "销子敲过头"] },
  片针: { issueTags: ["穿错", "错装", "不出针"], synonyms: ["针模", "穿错针", "针模穿错"] },
  吸嘴: { issueTags: ["漏装", "取料异常", "吸不住"], synonyms: ["吸杆", "吸嘴掉", "不出真空"] },
  调速阀: { issueTags: ["装反", "漏装", "不到位"], synonyms: ["气阀"] },
  气路: { issueTags: ["漏气", "接反", "不到位"], synonyms: ["气管"] },
  气缸: { issueTags: ["漏气", "不到位", "卡滞"], synonyms: ["气缸安装"] },
  螺丝: { issueTags: ["松动", "漏锁", "不到位", "没锁紧"], synonyms: ["螺丝没打紧", "锁不紧", "漏打螺丝"] },
  接线: { issueTags: ["接错", "漏接", "虚接"], synonyms: ["散线", "接线错误"] },
  端子: { issueTags: ["压接不良", "漏压", "接反"], synonyms: ["接插件"] },
  线束: { issueTags: ["接错", "漏装", "破损"], synonyms: ["线束接错"] },
  BOM: { issueTags: ["漏物料", "物料错误", "不一致"], synonyms: ["物料清单"] },
  图纸: { issueTags: ["漏标注", "图纸错误", "不一致"], synonyms: ["图纸标注"] },
  首件: { issueTags: ["未做首件", "首件不合格"], synonyms: ["首件确认"] },
};

export const GENERIC_DEFECTS = new Set(["不一致", "缺失"]);
export const isGenericDefect = (value) => GENERIC_DEFECTS.has(String(value || "").trim());
export const GENERIC_MATCH_TERMS = new Set([
  "装", "气", "线", "料", "针", "阀",
  "问题", "异常", "要求", "确认", "规范", "规定", "进行", "需要", "相关",
  "现场", "人员", "产品", "设备", "公司", "记录", "处理", "出现", "发生",
  "设计", "装配", "组装", "过程", "研发", "评审", "质量", "标准", "应当", "必须",
  "一个", "没有", "不能", "以及", "当前",
]);

const byLongest = (left, right) => right.length - left.length || left.localeCompare(right);

const normalizeMatchText = (value) => String(value || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

const collectText = (...parts) => normalizeMatchText(parts.flat().map((item) => String(item || "")).join(" "));

const findGroups = (text, groups) => {
  const compact = normalizeMatchText(text);
  if (!compact) return [];
  const ranked = groups.slice().sort((left, right) => Math.max(...right.aliases.map((item) => item.length)) - Math.max(...left.aliases.map((item) => item.length)));
  const hits = [];
  const claimed = [];
  for (const group of ranked) {
    const matched = unique(group.aliases.filter((alias) => compact.includes(normalizeMatchText(alias)))).sort(byLongest);
    if (!matched.length) continue;
    const longest = matched[0];
    if (claimed.some((term) => term.includes(longest) && term !== longest)) continue;
    hits.push({ canonical: group.canonical, aliases: group.aliases, matched });
    claimed.push(...matched);
  }
  return hits;
};

const defaultProcess = (module) => (String(module || "").toUpperCase() === "DQA"
  ? { canonical: "设计", aliases: ["设计", "评审"], matched: [], explicit: false }
  : { canonical: "装配", aliases: ["装配", "组装", "安装"], matched: [], explicit: false });

export const ISSUE_VOCABULARY = unique([
  ...OBJECT_GROUPS.flatMap((item) => item.aliases),
  ...DEFECT_GROUPS.flatMap((item) => item.aliases),
  ...PROCESS_GROUPS.flatMap((item) => item.aliases),
  ...Object.values(FIELD_LANGUAGE).flatMap((item) => [...(item.issueTags || []), ...(item.synonyms || [])]),
]);

export const extractIssueTriple = (issue = {}) => {
  const raw = `${issue.issueType || ""} ${issue.issueText || ""} ${(issue.tags || []).join(" ")}`;
  const objects = findGroups(raw, OBJECT_GROUPS);
  const defects = findGroups(raw, DEFECT_GROUPS);
  const explicitProcesses = findGroups(raw, PROCESS_GROUPS).map((item) => ({ ...item, explicit: true }));
  const processes = explicitProcesses.length ? explicitProcesses : [defaultProcess(issue.module)];
  const tags = unique([
    ...objects.flatMap((item) => item.matched),
    ...defects.flatMap((item) => item.matched),
    ...explicitProcesses.flatMap((item) => item.matched),
  ]);
  const display = {
    object: unique(objects.flatMap((item) => item.matched)).join("、") || "",
    defect: unique(defects.flatMap((item) => item.canonical === "过打" ? item.matched.concat(item.canonical) : [item.canonical])).join("、") || "",
    process: unique(processes.map((item) => item.canonical)).join("、") || "",
  };
  if (objects.some((item) => item.canonical === "销钉") && defects.some((item) => item.canonical === "过打")) {
    display.defect = "过打/过定位";
  }
  if (objects.some((item) => item.canonical === "片针")) {
    display.object = unique(["片针", "针模"].filter((item) => collectText(raw).includes(normalizeMatchText(item)))).join("、") || "片针/针模";
  }
  return { objects, defects, processes, tags, display, raw };
};

const cardAnchorText = (card = {}) => [
  card.title,
  card.atomicRule?.object,
  card.metadata?.atomicRule?.object,
  ...(card.issueTags || []),
  ...(card.synonyms || []),
  ...(card.processes || []),
].join(" ");

export const extractCardTriple = (card = {}) => {
  const anchor = cardAnchorText(card);
  const objects = findGroups(anchor, OBJECT_GROUPS);
  const defects = findGroups(`${anchor} ${(card.issueTags || []).join(" ")} ${(card.synonyms || []).join(" ")}`, DEFECT_GROUPS);
  const processes = findGroups(`${anchor} ${(card.processes || []).join(" ")}`, PROCESS_GROUPS).map((item) => ({ ...item, explicit: true }));
  return {
    objects,
    defects,
    processes,
    display: {
      object: unique(objects.map((item) => item.canonical)).join("、"),
      defect: unique(defects.map((item) => item.canonical)).join("、"),
      process: unique(processes.map((item) => item.canonical)).join("、"),
    },
  };
};

const canonicalSet = (items = []) => new Set(items.map((item) => item.canonical));

export const objectsOverlap = (issueTriple, cardTriple) => {
  const left = canonicalSet(issueTriple?.objects);
  const right = canonicalSet(cardTriple?.objects);
  return [...left].some((item) => right.has(item));
};

export const defectsOverlap = (issueTriple, cardTriple) => {
  const left = canonicalSet(issueTriple?.defects);
  const right = canonicalSet(cardTriple?.defects);
  return [...left].some((item) => right.has(item));
};

export const processesOverlap = (issueTriple, cardTriple) => {
  const left = (issueTriple?.processes || []).filter((item) => item.explicit);
  const right = cardTriple?.processes || [];
  const rightSet = canonicalSet(right);
  return left.some((item) => rightSet.has(item.canonical));
};

export const isObjectMismatch = (issueTriple, cardTriple) => {
  const issueObjects = issueTriple?.objects || [];
  const cardObjects = cardTriple?.objects || [];
  if (!issueObjects.length) return false;
  if (!cardObjects.length) return true;
  return !objectsOverlap(issueTriple, cardTriple);
};

export const retrievalTerms = (issue = {}) => {
  const triple = extractIssueTriple(issue);
  return unique([
    ...triple.objects.flatMap((item) => item.matched.concat(item.canonical)),
    ...triple.defects.flatMap((item) => item.matched.concat(item.canonical)),
    ...triple.processes.filter((item) => item.explicit).flatMap((item) => item.matched.concat(item.canonical)),
    issue.issueType,
    ...(issue.tags || []),
  ]).filter((term) => String(term).length >= 2 && !GENERIC_MATCH_TERMS.has(term));
};

export const enrichKnowledgeFieldLanguage = (card = {}) => {
  const triple = extractCardTriple(card);
  const issueTags = new Set(Array.isArray(card.issueTags) ? card.issueTags : []);
  const synonyms = new Set(Array.isArray(card.synonyms) ? card.synonyms : []);
  const object = card.atomicRule?.object || card.metadata?.atomicRule?.object || triple.display.object;
  const packs = [];
  for (const item of triple.objects) if (FIELD_LANGUAGE[item.canonical]) packs.push(FIELD_LANGUAGE[item.canonical]);
  const objectText = collectText(object);
  for (const [canonical, pack] of Object.entries(FIELD_LANGUAGE)) {
    if (objectText.includes(normalizeMatchText(canonical))) packs.push(pack);
  }
  if (collectText(card.processes, card.title).includes("首件") && FIELD_LANGUAGE["首件"]) packs.push(FIELD_LANGUAGE["首件"]);
  for (const pack of packs) {
    (pack.issueTags || []).forEach((item) => issueTags.add(item));
    (pack.synonyms || []).forEach((item) => synonyms.add(item));
  }
  triple.objects.forEach((item) => item.aliases.forEach((alias) => synonyms.add(alias)));
  return {
    ...card,
    issueTags: unique([...issueTags]),
    synonyms: unique([...synonyms]),
  };
};

export const formatIssueTriple = (triple) => {
  const display = triple?.display || triple || {};
  const object = display.object || "待识别";
  const defect = display.defect || "待识别";
  const process = display.process || "待识别";
  return `对象：${object}；缺陷：${defect}；过程：${process}`;
};
