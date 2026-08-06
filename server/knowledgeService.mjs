import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  deletePostgresKnowledgeDocument,
  deletePostgresQualityIssue,
  listPostgresConfirmedKnowledgeMatches,
  listPostgresDistilledKnowledge,
  listPostgresKnowledgeClauses,
  listPostgresKnowledgeDocuments,
  listPostgresKnowledgeJobs,
  listPostgresKnowledgeMatches,
  listPostgresQualityIssues,
  listPostgresRecurrenceActions,
  readPostgresKnowledgeDocument,
  replacePostgresKnowledgeMatches,
  replacePostgresDistilledKnowledge,
  replacePostgresKnowledgeClauses,
  reviewPostgresKnowledgeMatch,
  upsertPostgresQualityIssues,
  writePostgresRecurrenceAction,
  writePostgresKnowledgeDocument,
  writePostgresKnowledgeJob,
} from "./postgresStore.mjs";

const emptyStore = () => ({ version: 3, documents: [], clauses: [], jobs: [], knowledge: [], issues: [], matches: [], recurrenceActions: [] });
const nowIso = () => new Date().toISOString();
const cleanText = (value) => String(value || "").replace(/\u0000/g, "").replace(/\r/g, "").trim();
const clampProgress = (value) => Math.min(100, Math.max(0, Number(value || 0)));
const stableId = (prefix, value) => `${prefix}-${createHash("sha1").update(String(value)).digest("hex").slice(0, 20)}`;
const toArray = (value) => Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];

const markerPattern = /^((?:\d+(?:\.\d+){0,5}|第[一二三四五六七八九十百千\d]+条|[一二三四五六七八九十]+|[（(][一二三四五六七八九十\d]+[）)]))[、.．:：)）\s]+(.+)$/;
const headingPattern = /^(第[一二三四五六七八九十百千\d]+[章节篇]|\d+(?:\.\d+){0,3}\s+\S+|[一二三四五六七八九十]+[、.．]\S+)/;
const isHeading = (line) => line.length <= 100 && headingPattern.test(line) && !/[。；;]$/.test(line);
const markerLevel = (marker) => {
  if (/^第.+章/.test(marker)) return 1;
  if (/^第.+节/.test(marker)) return 2;
  if (/^\d+(?:\.\d+)+$/.test(marker)) return Math.min(6, marker.split(".").length);
  if (/^\d+$/.test(marker) || /^[一二三四五六七八九十]+$/.test(marker)) return 1;
  return 3;
};

export const splitQualityClauses = (document = {}) => {
  const rawLines = cleanText(document.sourceText).split(/\n+/).map((line) => line.replace(/[\t ]+/g, " ").trim()).filter(Boolean);
  const lines = rawLines.flatMap((line) => line.length <= 1800 ? [line] : (line.match(/[\s\S]{1,1500}(?:[。；;]|$)/g) || [line]).map((part) => part.trim()).filter(Boolean));
  const sections = [];
  const clauses = [];
  let current = null;
  const flush = () => {
    if (!current?.text?.trim()) return;
    const ordinal = clauses.length + 1;
    const clauseText = current.text.trim();
    clauses.push({
      id: stableId("clause", `${document.id}:${ordinal}:${clauseText}`),
      documentId: document.id,
      ordinal,
      sectionPath: current.sectionPath || sections.filter(Boolean).join(" / "),
      clauseNumber: current.clauseNumber || "",
      title: current.title || clauseText.slice(0, 80),
      clauseText,
      searchText: `${current.sectionPath || ""} ${current.clauseNumber || ""} ${clauseText}`.trim(),
      metadata: { sourceDocument: document.name, version: document.version || "" },
      createdAt: nowIso(),
    });
    current = null;
  };
  lines.forEach((line) => {
    const match = line.match(markerPattern);
    if (isHeading(line)) {
      flush();
      const marker = match?.[1] || line.match(/^(第.+?[章节篇]|\d+(?:\.\d+){0,3}|[一二三四五六七八九十]+)/)?.[1] || "";
      const level = markerLevel(marker);
      sections[level - 1] = line;
      sections.splice(level);
      return;
    }
    if (match) {
      flush();
      current = { clauseNumber: match[1], title: match[2].slice(0, 80), text: line, sectionPath: sections.filter(Boolean).join(" / ") };
      return;
    }
    if (!current) current = { clauseNumber: "", title: line.slice(0, 80), text: line, sectionPath: sections.filter(Boolean).join(" / ") };
    else if (current.text.length < 1800) current.text += `\n${line}`;
    else { flush(); current = { clauseNumber: "", title: line.slice(0, 80), text: line, sectionPath: sections.filter(Boolean).join(" / ") }; }
  });
  flush();
  return clauses;
};

const normalizeKnowledge = (documentId, skillId, items = []) => items.map((item, index) => {
  const citations = (Array.isArray(item.sourceCitations) ? item.sourceCitations : []).map((citation) => ({
    clauseId: String(citation.clauseId || ""),
    clauseNumber: String(citation.clauseNumber || ""),
    sectionPath: String(citation.sectionPath || ""),
    quote: String(citation.quote || "").trim().slice(0, 1000),
  })).filter((citation) => citation.clauseId && citation.quote);
  return {
    id: stableId("knowledge", `${documentId}:${skillId}:${item.title || ""}:${item.content || ""}:${index}`),
    documentId,
    clauseIds: [...new Set(citations.map((citation) => citation.clauseId))],
    type: ["mandatory", "prohibited", "threshold", "evidence", "definition", "failure_mode", "exam_point"].includes(item.type) ? item.type : "mandatory",
    title: String(item.title || "未命名知识点").trim().slice(0, 160),
    content: String(item.content || "").trim().slice(0, 3000),
    applicableRoles: toArray(item.applicableRoles),
    processes: toArray(item.processes),
    issueTags: toArray(item.issueTags),
    synonyms: toArray(item.synonyms),
    confidence: Math.min(1, Math.max(0, Number(item.confidence ?? 0.8))),
    skillId,
    sourceCitations: citations,
    reviewStatus: "pending",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}).filter((item) => item.content && item.sourceCitations.length);

const issueVocabulary = [
  "错装", "装反", "漏装", "少装", "松动", "划伤", "破损", "脏污", "异物", "压伤", "变形", "翘曲", "开裂", "虚焊", "漏焊", "短路", "断路", "接线", "标签", "螺丝", "扭矩", "首件", "点检", "巡检", "装配", "加工", "调试",
  "干涉", "碰撞", "空间不足", "尺寸", "公差", "图纸", "BOM", "物料", "选型", "设计", "评审", "验证", "测试", "ECN", "非BOM", "变更", "接口", "软件", "电气", "结构", "工艺", "资料", "缺失", "错误", "不一致", "可靠性", "安全",
];
const issueStopTerms = new Set(["问题", "异常", "要求", "进行", "需要", "相关", "情况", "现场", "人员", "产品", "设备", "公司", "一个", "没有", "不能", "以及", "当前", "记录", "处理", "出现", "发生"]);
const normalizeSearchText = (value) => cleanText(value).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
const searchTerms = (value) => {
  const raw = cleanText(value).toLowerCase();
  const compact = normalizeSearchText(raw);
  const terms = new Set();
  issueVocabulary.forEach((term) => { if (compact.includes(term.toLowerCase())) terms.add(term.toLowerCase()); });
  (raw.match(/[a-z][a-z0-9_.-]{1,20}/gi) || []).forEach((term) => terms.add(term.toLowerCase()));
  (raw.match(/[\u4e00-\u9fff]{2,}/g) || []).forEach((segment) => {
    if (segment.length <= 10 && !issueStopTerms.has(segment)) terms.add(segment);
    for (let index = 0; index < Math.min(segment.length - 1, 30); index += 1) {
      const term = segment.slice(index, index + 2);
      if (!issueStopTerms.has(term)) terms.add(term);
    }
  });
  return [...terms].slice(0, 100);
};
const normalizedIssue = (payload = {}) => {
  const module = String(payload.module || "").toUpperCase() === "IPQC" ? "IPQC" : "DQA";
  const issueType = cleanText(payload.issueType || "未分类");
  const issueText = cleanText(payload.issueText || issueType);
  if (!issueText) return null;
  const personName = cleanText(payload.personName);
  const sourceFile = cleanText(payload.sourceFile);
  const sourceKey = cleanText(payload.sourceKey || `${module}:${sourceFile}:${personName}:${payload.issueDate || ""}:${issueType}:${issueText}`);
  const tags = [...new Set([...toArray(payload.tags), ...issueVocabulary.filter((term) => normalizeSearchText(`${issueType}${issueText}`).includes(term.toLowerCase()))])];
  const timestamp = nowIso();
  return {
    id: stableId("issue", sourceKey),
    module,
    issueKind: cleanText(payload.issueKind || (module === "IPQC" ? "组装过程问题" : "研发质量问题")),
    personName,
    issueDate: cleanText(payload.issueDate),
    issueType,
    issueText,
    normalizedText: normalizeSearchText(`${issueType}${issueText}`),
    tags,
    sourceFile,
    sourceKey,
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};
const roleTermsForIssue = (issue) => issue.module === "IPQC" ? ["组装", "操作员", "送检人", "ipqc", "过程检验"] : ["研发", "工程师", "dqa", "设计"];
const processTermsForIssue = (issue) => issue.module === "IPQC" ? ["装配", "组装", "首件", "过程", "巡检"] : ["研发", "设计", "评审", "ecn", "变更", "验证"];
const candidateScore = (issue, candidate) => {
  const issueText = `${issue.issueType} ${issue.issueText} ${(issue.tags || []).join(" ")}`;
  const candidateText = `${candidate.title || ""} ${candidate.content || ""} ${(candidate.issueTags || []).join(" ")} ${(candidate.synonyms || []).join(" ")}`;
  const issueTerms = new Set(searchTerms(issueText));
  const candidateTerms = new Set(searchTerms(candidateText));
  const sharedTerms = [...issueTerms].filter((term) => candidateTerms.has(term) && !issueStopTerms.has(term)).sort((left, right) => right.length - left.length).slice(0, 8);
  const normalizedCandidate = normalizeSearchText(candidateText);
  const matchedIssueTags = (issue.tags || []).filter((tag) => normalizedCandidate.includes(normalizeSearchText(tag))).slice(0, 6);
  const roleMatch = roleTermsForIssue(issue).some((term) => normalizeSearchText(`${(candidate.applicableRoles || []).join(" ")} ${candidateText}`).includes(normalizeSearchText(term)));
  const processMatch = processTermsForIssue(issue).some((term) => normalizeSearchText(`${(candidate.processes || []).join(" ")} ${candidateText}`).includes(normalizeSearchText(term)));
  const typeMatch = issue.issueType && issue.issueType !== "未分类" && normalizedCandidate.includes(normalizeSearchText(issue.issueType));
  let score = Math.min(44, matchedIssueTags.length * 22) + Math.min(28, sharedTerms.reduce((sum, term) => sum + (term.length >= 4 ? 7 : 4), 0));
  if (typeMatch) score += 14;
  if (roleMatch) score += 7;
  if (processMatch) score += 7;
  if (candidate.candidateType === "knowledge") score += Math.round(Number(candidate.confidence || 0.8) * 5);
  score = Math.min(100, score);
  return {
    score,
    evidence: {
      matchedIssueTags,
      sharedTerms,
      roleMatch,
      processMatch,
      typeMatch,
      reason: [matchedIssueTags.length ? `问题标签：${matchedIssueTags.join("、")}` : "", sharedTerms.length ? `共同术语：${sharedTerms.join("、")}` : "", roleMatch ? "适用角色相符" : "", processMatch ? "过程阶段相符" : ""].filter(Boolean).join("；") || "仅有弱文本关联",
    },
  };
};
const dateTimestamp = (value) => {
  const text = cleanText(value);
  if (!text) return 0;
  const normalized = text.replace(/[./]/g, "-");
  const direct = new Date(normalized).getTime();
  return Number.isFinite(direct) ? direct : 0;
};
const examPassed = (session = {}) => session.result?.isPassed === true || session.result?.passed === true;
const recurrenceStateLabel = (state) => ({ first: "首次发生", recurrent_open: "重复发生待改善", observing: "改善观察中", effective: "验证有效", ineffective: "措施无效", recurred_after_action: "措施后再次复发" }[state] || "待核实");

export const createKnowledgeService = ({ filePath }) => {
  let fallbackWrite = Promise.resolve();
  let queue = [];
  let queueRunning = false;
  let corpusCache = { expiresAt: 0, rows: [] };

  const readFallback = async () => {
    try {
      const value = JSON.parse(await fs.readFile(filePath, "utf8"));
      return { ...emptyStore(), ...(value && typeof value === "object" ? value : {}) };
    } catch (error) {
      if (error.code === "ENOENT") return emptyStore();
      throw error;
    }
  };
  const writeFallback = async (store) => {
    fallbackWrite = fallbackWrite.then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(store), "utf8");
      await fs.rename(temporary, filePath);
    });
    return fallbackWrite;
  };
  const upsertFallback = (items, next, key = "id") => [next, ...items.filter((item) => item[key] !== next[key])];

  const persistDocument = async (document) => {
    const store = await readFallback();
    store.documents = upsertFallback(store.documents, document);
    await writeFallback(store);
    await writePostgresKnowledgeDocument(document);
    return document;
  };
  const persistJob = async (job) => {
    const store = await readFallback();
    store.jobs = upsertFallback(store.jobs, job);
    await writeFallback(store);
    await writePostgresKnowledgeJob(job);
    return job;
  };
  const updateDocument = async (id, patch) => {
    const document = await getDocument(id);
    if (!document) return null;
    return persistDocument({ ...document, ...patch, updatedAt: nowIso(), storage: undefined });
  };
  const updateJob = async (id, patch) => {
    const jobs = await listJobs();
    const current = jobs.find((job) => job.id === id);
    if (!current) return null;
    const next = { ...current, ...patch, progress: clampProgress(patch.progress ?? current.progress), updatedAt: nowIso(), storage: undefined };
    await persistJob(next);
    if (next.jobType === "distill") {
      const status = next.status === "failed" ? "failed" : next.status === "completed" ? "completed" : "distilling";
      await updateDocument(next.documentId, { status, progress: next.progress, message: next.message, errorMessage: next.errorMessage || "" });
    }
    return next;
  };

  const listDocuments = async () => {
    const postgres = await listPostgresKnowledgeDocuments();
    if (postgres.available && postgres.documents.length) return postgres.documents;
    return (await readFallback()).documents.map(({ sourceText, ...item }) => ({ ...item, storage: "json" }));
  };
  const getDocument = async (id) => {
    const postgres = await readPostgresKnowledgeDocument(id);
    if (postgres.available && postgres.found) return postgres.document;
    return (await readFallback()).documents.find((item) => item.id === id) || null;
  };
  const listJobs = async (documentId = "") => {
    const postgres = await listPostgresKnowledgeJobs(documentId);
    if (postgres.available && postgres.jobs.length) return postgres.jobs;
    return (await readFallback()).jobs.filter((job) => !documentId || job.documentId === documentId);
  };

  const runQueue = async () => {
    if (queueRunning) return;
    queueRunning = true;
    while (queue.length) {
      const { documentId, jobId } = queue.shift();
      const document = await getDocument(documentId);
      if (!document) continue;
      try {
        const startedAt = nowIso();
        await persistJob({ ...(await listJobs(documentId)).find((job) => job.id === jobId), id: jobId, documentId, jobType: "parse", status: "running", progress: 15, message: "正在识别章节与条款编号", skillId: "", result: {}, errorMessage: "", createdAt: startedAt, startedAt, completedAt: null, updatedAt: startedAt });
        await updateDocument(documentId, { status: "parsing", progress: 15, message: "正在识别章节与条款编号", errorMessage: "" });
        const clauses = splitQualityClauses(document);
        await updateDocument(documentId, { status: "indexing", progress: 70, message: `正在建立 ${clauses.length} 条规范索引` });
        const store = await readFallback();
        store.clauses = [...clauses, ...store.clauses.filter((clause) => clause.documentId !== documentId)];
        const completedAt = nowIso();
        const completedDocument = { ...(store.documents.find((item) => item.id === documentId) || document), status: "completed", progress: 100, message: `条款解析完成，共 ${clauses.length} 条`, clauseCount: clauses.length, errorMessage: "", updatedAt: completedAt };
        store.documents = upsertFallback(store.documents, completedDocument);
        const currentJob = store.jobs.find((job) => job.id === jobId) || {};
        const completedJob = { ...currentJob, id: jobId, documentId, jobType: "parse", status: "completed", progress: 100, message: `已解析 ${clauses.length} 条规范条款`, skillId: "", result: { clauseCount: clauses.length }, errorMessage: "", completedAt, updatedAt: completedAt };
        store.jobs = upsertFallback(store.jobs, completedJob);
        await writeFallback(store);
        await writePostgresKnowledgeDocument(completedDocument);
        await replacePostgresKnowledgeClauses(completedDocument, clauses);
        await writePostgresKnowledgeJob(completedJob);
        corpusCache.expiresAt = 0;
      } catch (error) {
        const message = String(error?.message || error || "条款解析失败").slice(0, 500);
        await updateDocument(documentId, { status: "failed", progress: 0, message: "条款解析失败，可重新尝试", errorMessage: message });
        await updateJob(jobId, { status: "failed", progress: 0, message: "条款解析失败，可重新尝试", errorMessage: message, completedAt: nowIso() });
      }
    }
    queueRunning = false;
  };
  const enqueueParse = async (documentId, existingJobId = "") => {
    if (queue.some((item) => item.documentId === documentId)) return (await listJobs(documentId)).find((job) => job.jobType === "parse" && ["waiting", "running"].includes(job.status));
    const job = { id: existingJobId || randomUUID(), documentId, jobType: "parse", status: "waiting", progress: 0, message: "等待条款解析", skillId: "", result: {}, errorMessage: "", createdAt: nowIso(), startedAt: null, completedAt: null, updatedAt: nowIso() };
    await persistJob(job);
    await updateDocument(documentId, { status: "waiting", progress: 0, message: "等待条款解析", errorMessage: "" });
    queue.push({ documentId, jobId: job.id });
    setImmediate(() => runQueue().catch((error) => console.error("Knowledge parse queue failed", error)));
    return job;
  };

  const createDocument = async (payload = {}) => {
    const sourceText = cleanText(payload.sourceText || (Array.isArray(payload.segments) ? payload.segments.join("\n") : ""));
    if (!sourceText) throw new Error("知识文件没有可解析的文本");
    const fileHash = String(payload.fileHash || createHash("sha256").update(sourceText).digest("hex"));
    const existing = (await listDocuments()).find((item) => item.fileHash === fileHash);
    if (existing) return { document: existing, job: null, duplicate: true };
    const importedAt = nowIso();
    const document = { id: String(payload.id || randomUUID()), name: String(payload.name || "未命名规范").trim(), category: String(payload.category || "未分类"), contentType: String(payload.contentType || "text"), fileHash, version: String(payload.version || ""), status: "waiting", progress: 0, message: "等待条款解析", segmentCount: Number(payload.segmentCount || payload.segments?.length || 0), clauseCount: 0, distillationCount: 0, size: Number(payload.size || 0), preview: sourceText.slice(0, 1200), sourceText, metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}, errorMessage: "", importedAt, updatedAt: importedAt };
    await persistDocument(document);
    corpusCache.expiresAt = 0;
    const job = await enqueueParse(document.id);
    return { document: { ...document, sourceText: undefined }, job, duplicate: false };
  };

  const deleteDocument = async (id) => {
    queue = queue.filter((item) => item.documentId !== id);
    const store = await readFallback();
    const deleted = store.documents.some((item) => item.id === id);
    store.documents = store.documents.filter((item) => item.id !== id);
    store.clauses = store.clauses.filter((item) => item.documentId !== id);
    store.jobs = store.jobs.filter((item) => item.documentId !== id);
    store.knowledge = store.knowledge.filter((item) => item.documentId !== id);
    await writeFallback(store);
    await deletePostgresKnowledgeDocument(id);
    corpusCache.expiresAt = 0;
    return deleted;
  };
  const listClauses = async (documentId, options = {}) => {
    const postgres = await listPostgresKnowledgeClauses(documentId, options);
    if (postgres.available) return postgres;
    const all = (await readFallback()).clauses.filter((item) => item.documentId === documentId && (!options.query || item.searchText?.toLowerCase().includes(String(options.query).toLowerCase()))).sort((a, b) => a.ordinal - b.ordinal);
    const offset = Math.max(0, Number(options.offset || 0));
    const limit = Math.min(1000, Math.max(1, Number(options.limit || 100)));
    return { clauses: all.slice(offset, offset + limit), total: all.length, storage: "json" };
  };
  const startDistillation = async (documentId, skillId) => {
    const document = await getDocument(documentId);
    if (!document || !document.clauseCount) throw new Error("请等待规范条款解析完成后再蒸馏");
    const job = { id: randomUUID(), documentId, jobType: "distill", status: "running", progress: 5, message: "正在准备规范条款", skillId: String(skillId || "quality-knowledge-distillation"), result: {}, errorMessage: "", createdAt: nowIso(), startedAt: nowIso(), completedAt: null, updatedAt: nowIso() };
    await persistJob(job);
    await updateDocument(documentId, { status: "distilling", progress: 5, message: "正在准备规范条款", errorMessage: "" });
    return job;
  };
  const saveDistillation = async (documentId, { jobId, skillId, knowledge = [] } = {}) => {
    const clauseRows = [];
    let clauseOffset = 0;
    let clauseTotal = 0;
    do {
      const page = await listClauses(documentId, { limit: 500, offset: clauseOffset });
      clauseRows.push(...(page.clauses || []));
      clauseTotal = Number(page.total || 0);
      clauseOffset += page.clauses?.length || 0;
    } while (clauseOffset < clauseTotal && clauseOffset < 5000);
    const clauseById = new Map(clauseRows.map((clause) => [clause.id, cleanText(clause.clauseText).replace(/\s+/g, " ")]));
    const verified = (Array.isArray(knowledge) ? knowledge : []).map((item) => ({
      ...item,
      sourceCitations: (Array.isArray(item.sourceCitations) ? item.sourceCitations : []).filter((citation) => {
        const source = clauseById.get(String(citation.clauseId || ""));
        const quote = cleanText(citation.quote).replace(/\s+/g, " ");
        return Boolean(source && quote && source.includes(quote));
      }),
    }));
    const normalized = normalizeKnowledge(documentId, skillId || "quality-knowledge-distillation", verified);
    if (!normalized.length) throw new Error("蒸馏结果没有通过原文引用校验，请重新生成或检查规范文本");
    const store = await readFallback();
    store.knowledge = [...normalized, ...store.knowledge.filter((item) => item.documentId !== documentId || item.skillId !== skillId)];
    const document = store.documents.find((item) => item.id === documentId);
    if (document) store.documents = upsertFallback(store.documents, { ...document, status: "completed", progress: 100, message: `已蒸馏 ${normalized.length} 条知识点`, distillationCount: normalized.length, errorMessage: "", updatedAt: nowIso() });
    await writeFallback(store);
    await replacePostgresDistilledKnowledge(documentId, skillId, normalized);
    corpusCache.expiresAt = 0;
    if (jobId) await updateJob(jobId, { status: "completed", progress: 100, message: `已蒸馏 ${normalized.length} 条知识点`, result: { knowledgeCount: normalized.length }, errorMessage: "", completedAt: nowIso() });
    return normalized;
  };
  const listDistilled = async (documentId, options = {}) => {
    const postgres = await listPostgresDistilledKnowledge(documentId, options);
    if (postgres.available) return postgres;
    const all = (await readFallback()).knowledge.filter((item) => item.documentId === documentId);
    const offset = Math.max(0, Number(options.offset || 0));
    const limit = Math.min(1000, Math.max(1, Number(options.limit || 100)));
    return { knowledge: all.slice(offset, offset + limit), total: all.length, storage: "json" };
  };
  const syncIssues = async (payloads = []) => {
    const issues = (Array.isArray(payloads) ? payloads : []).map(normalizedIssue).filter(Boolean).slice(0, 2000);
    if (!issues.length) return { issues: [], total: 0 };
    const store = await readFallback();
    const bySource = new Map((store.issues || []).map((item) => [item.sourceKey, item]));
    issues.forEach((issue) => {
      const previous = bySource.get(issue.sourceKey);
      if (previous && (previous.normalizedText !== issue.normalizedText || previous.issueType !== issue.issueType || previous.issueText !== issue.issueText)) {
        store.matches = (store.matches || []).filter((item) => item.issueId !== previous.id || item.status !== "candidate").map((item) => item.issueId === previous.id && item.status === "confirmed" ? { ...item, status: "superseded", updatedAt: issue.updatedAt } : item);
      }
      bySource.set(issue.sourceKey, { ...previous, ...issue, id: previous?.id || issue.id, createdAt: previous?.createdAt || issue.createdAt });
    });
    store.issues = [...bySource.values()];
    await writeFallback(store);
    const postgres = await upsertPostgresQualityIssues(issues);
    return { issues: postgres.available ? postgres.issues : issues, total: issues.length, storage: postgres.available ? "postgres" : "json" };
  };
  const listIssues = async (options = {}) => {
    const postgres = await listPostgresQualityIssues(options);
    if (postgres.available) {
      if (!postgres.total) {
        const fallbackIssues = (await readFallback()).issues || [];
        if (fallbackIssues.length) {
          await upsertPostgresQualityIssues(fallbackIssues);
          return await listPostgresQualityIssues(options);
        }
      }
      return postgres;
    }
    const store = await readFallback();
    const module = String(options.module || "");
    const personName = String(options.personName || "");
    const query = String(options.query || "").trim().toLowerCase();
    const status = String(options.status || "");
    const confirmedIssueIds = new Set((store.matches || []).filter((item) => item.status === "confirmed").map((item) => item.issueId));
    const matchedIssueIds = new Set((store.matches || []).filter((item) => item.status === status).map((item) => item.issueId));
    const all = (store.issues || []).filter((item) => {
      if (module && item.module !== module) return false;
      if (personName && item.personName !== personName) return false;
      if (query && !`${item.issueText} ${item.issueType} ${item.personName}`.toLowerCase().includes(query)) return false;
      if (status === "unmatched" && confirmedIssueIds.has(item.id)) return false;
      if (status && status !== "unmatched" && !matchedIssueIds.has(item.id)) return false;
      return true;
    }).sort((left, right) => String(right.issueDate || right.updatedAt).localeCompare(String(left.issueDate || left.updatedAt)));
    const offset = Math.max(0, Number(options.offset || 0));
    const limit = Math.min(200, Math.max(1, Number(options.limit || 30)));
    const matchesByIssue = new Map();
    (store.matches || []).forEach((item) => {
      const current = matchesByIssue.get(item.issueId) || { matchCount: 0, confirmedCount: 0 };
      current.matchCount += 1;
      if (item.status === "confirmed") current.confirmedCount += 1;
      matchesByIssue.set(item.issueId, current);
    });
    return { total: all.length, issues: all.slice(offset, offset + limit).map((item) => ({ ...item, ...(matchesByIssue.get(item.id) || { matchCount: 0, confirmedCount: 0 }), storage: "json" })), storage: "json" };
  };
  const loadCorpus = async () => {
    if (corpusCache.expiresAt > Date.now()) return corpusCache.rows;
    const documents = await listDocuments();
    const rows = [];
    for (const document of documents) {
      let offset = 0;
      let total = Number(document.distillationCount || 0);
      do {
        const page = await listDistilled(document.id, { limit: 500, offset });
        total = Number(page.total || 0);
        rows.push(...(page.knowledge || []).map((item) => ({
          candidateType: "knowledge",
          candidateKey: `knowledge:${item.id}`,
          documentId: document.id,
          documentName: document.name,
          knowledgeId: item.id,
          clauseId: item.clauseIds?.[0] || item.sourceCitations?.[0]?.clauseId || "",
          clauseNumber: item.sourceCitations?.[0]?.clauseNumber || "",
          sectionPath: item.sourceCitations?.[0]?.sectionPath || "",
          quote: item.sourceCitations?.[0]?.quote || item.content,
          title: item.title,
          content: item.content,
          applicableRoles: item.applicableRoles || [],
          processes: item.processes || [],
          issueTags: item.issueTags || [],
          synonyms: item.synonyms || [],
          confidence: item.confidence,
          sourceCitations: item.sourceCitations || [],
        })));
        offset += page.knowledge?.length || 0;
      } while (offset < total && offset < 5000);
      offset = 0;
      total = Number(document.clauseCount || 0);
      do {
        const page = await listClauses(document.id, { limit: 500, offset });
        total = Number(page.total || 0);
        rows.push(...(page.clauses || []).map((item) => ({
          candidateType: "clause",
          candidateKey: `clause:${item.id}`,
          documentId: document.id,
          documentName: document.name,
          knowledgeId: "",
          clauseId: item.id,
          clauseNumber: item.clauseNumber || "",
          sectionPath: item.sectionPath || "",
          quote: item.clauseText,
          title: item.title || item.clauseText.slice(0, 80),
          content: item.clauseText,
          applicableRoles: [],
          processes: [],
          issueTags: [],
          synonyms: [],
          confidence: 1,
          sourceCitations: [{ clauseId: item.id, clauseNumber: item.clauseNumber || "", sectionPath: item.sectionPath || "", quote: item.clauseText }],
        })));
        offset += page.clauses?.length || 0;
      } while (offset < total && offset < 5000);
    }
    corpusCache = { expiresAt: Date.now() + 30000, rows };
    return rows;
  };
  const listMatches = async (issueId) => {
    const postgres = await listPostgresKnowledgeMatches(issueId);
    if (postgres.available) return postgres;
    return { matches: (await readFallback()).matches.filter((item) => item.issueId === issueId).sort((left, right) => (left.status === "confirmed" ? -1 : 0) - (right.status === "confirmed" ? -1 : 0) || right.score - left.score), storage: "json" };
  };
  const generateMatches = async (issueId) => {
    const store = await readFallback();
    const issue = (store.issues || []).find((item) => item.id === issueId);
    if (!issue) throw new Error("质量问题不存在，请先同步问题数据");
    const corpus = await loadCorpus();
    if (!corpus.length) throw new Error("知识库尚无可检索条款，请先导入并解析规范");
    const generatedAt = nowIso();
    const matches = corpus.map((candidate) => {
      const result = candidateScore(issue, candidate);
      return {
        id: stableId("match", `${issue.id}:${candidate.candidateKey}`),
        issueId: issue.id,
        candidateKey: candidate.candidateKey,
        candidateType: candidate.candidateType,
        documentId: candidate.documentId,
        knowledgeId: candidate.knowledgeId || "",
        clauseId: candidate.clauseId || "",
        score: result.score,
        evidence: {
          ...result.evidence,
          documentName: candidate.documentName,
          candidateTitle: candidate.title,
          candidateContent: candidate.content,
          clauseNumber: candidate.clauseNumber,
          sectionPath: candidate.sectionPath,
          quote: candidate.quote,
          sourceCitations: candidate.sourceCitations,
        },
        status: "candidate",
        reviewer: "",
        reviewedAt: null,
        createdAt: generatedAt,
        updatedAt: generatedAt,
      };
    }).filter((item) => item.score >= 12).sort((left, right) => right.score - left.score || (left.candidateType === "knowledge" ? -1 : 1)).slice(0, 8);
    const previous = new Map((store.matches || []).filter((item) => item.issueId === issue.id).map((item) => [item.candidateKey, item]));
    const nextForIssue = matches.map((item) => {
      const old = previous.get(item.candidateKey);
      return old && old.status !== "candidate" ? { ...item, status: old.status, reviewer: old.reviewer, reviewedAt: old.reviewedAt, createdAt: old.createdAt } : item;
    });
    previous.forEach((item, key) => { if (item.status !== "candidate" && !nextForIssue.some((row) => row.candidateKey === key)) nextForIssue.push(item); });
    store.matches = [...nextForIssue, ...(store.matches || []).filter((item) => item.issueId !== issue.id)];
    await writeFallback(store);
    const postgres = await replacePostgresKnowledgeMatches(issue.id, matches);
    return postgres.available ? postgres : { matches: nextForIssue, storage: "json" };
  };
  const reviewMatch = async (id, payload = {}) => {
    const allowed = new Set(["candidate", "confirmed", "rejected"]);
    const status = allowed.has(payload.status) ? payload.status : "candidate";
    const store = await readFallback();
    const current = (store.matches || []).find((item) => item.id === id);
    if (!current) return null;
    const reviewedAt = nowIso();
    if (status === "confirmed") store.matches = store.matches.map((item) => item.issueId === current.issueId && item.status === "confirmed" && item.id !== id ? { ...item, status: "superseded", updatedAt: reviewedAt } : item);
    const next = { ...current, status, reviewer: cleanText(payload.reviewer), reviewedAt, updatedAt: reviewedAt };
    store.matches = store.matches.map((item) => item.id === id ? next : item);
    await writeFallback(store);
    const postgres = await reviewPostgresKnowledgeMatch(id, { status, reviewer: next.reviewer });
    return postgres.available ? postgres.match : next;
  };
  const listConfirmedMatches = async (options = {}) => {
    const postgres = await listPostgresConfirmedKnowledgeMatches(options);
    if (postgres.available) return postgres;
    const store = await readFallback();
    const issueById = new Map((store.issues || []).map((item) => [item.id, item]));
    const matches = (store.matches || []).filter((item) => {
      if (item.status !== "confirmed") return false;
      const issue = issueById.get(item.issueId);
      return issue && (!options.module || issue.module === options.module) && (!options.personName || issue.personName === options.personName);
    }).slice(0, Math.min(10000, Math.max(1, Number(options.limit || 5000)))).map((item) => ({ ...item, issue: issueById.get(item.issueId), storage: "json" }));
    return { matches, storage: "json" };
  };
  const deleteIssue = async (id) => {
    const store = await readFallback();
    const deleted = (store.issues || []).some((item) => item.id === id);
    store.issues = (store.issues || []).filter((item) => item.id !== id);
    store.matches = (store.matches || []).filter((item) => item.issueId !== id);
    await writeFallback(store);
    const postgres = await deletePostgresQualityIssue(id);
    return postgres.available ? postgres.deleted : deleted;
  };
  const listRecurrenceActions = async (options = {}) => {
    const postgres = await listPostgresRecurrenceActions(options);
    if (postgres.available) {
      if (!postgres.actions.length) {
        const fallbackActions = (await readFallback()).recurrenceActions || [];
        const matching = fallbackActions.filter((item) => (!options.module || item.module === options.module) && (!options.personName || item.personName === options.personName));
        for (const action of matching) await writePostgresRecurrenceAction(action);
        if (matching.length) return await listPostgresRecurrenceActions(options);
      }
      return postgres;
    }
    const actions = ((await readFallback()).recurrenceActions || []).filter((item) => (!options.module || item.module === options.module) && (!options.personName || item.personName === options.personName));
    return { actions, storage: "json" };
  };
  const listRecurrences = async (options = {}, examSessions = []) => {
    const module = String(options.module || "IPQC").toUpperCase() === "DQA" ? "DQA" : "IPQC";
    const confirmed = await listConfirmedMatches({ module, limit: 10000 });
    const actions = await listRecurrenceActions({ module });
    const actionByKey = new Map((actions.actions || []).map((item) => [item.recurrenceKey, item]));
    const groups = new Map();
    (confirmed.matches || []).forEach((match) => {
      const issue = match.issue || {};
      const personName = cleanText(issue.personName);
      if (!personName || !match.candidateKey) return;
      const recurrenceKey = stableId("recurrence", `${module}:${personName}:${match.candidateKey}`);
      const group = groups.get(recurrenceKey) || {
        recurrenceKey,
        module,
        personName,
        candidateKey: match.candidateKey,
        documentId: match.documentId,
        documentName: match.evidence?.documentName || "",
        clauseNumber: match.evidence?.clauseNumber || "",
        knowledgeTitle: match.evidence?.candidateTitle || "已确认规范",
        quote: match.evidence?.quote || "",
        issueMap: new Map(),
        matchIds: [],
      };
      group.issueMap.set(issue.id || match.issueId, issue);
      group.matchIds.push(match.id);
      groups.set(recurrenceKey, group);
    });
    const roleName = module === "IPQC" ? "操作员" : "工程师";
    const now = Date.now();
    let rows = [...groups.values()].map((group) => {
      const issues = [...group.issueMap.values()].sort((left, right) => (dateTimestamp(left.issueDate) || dateTimestamp(left.updatedAt)) - (dateTimestamp(right.issueDate) || dateTimestamp(right.updatedAt)));
      const issueTerms = new Set(issues.flatMap((item) => [item.issueType, ...(item.tags || [])]).map((item) => cleanText(item).toLowerCase()).filter(Boolean));
      const relevantExams = (Array.isArray(examSessions) ? examSessions : []).filter((session) => {
        if (!session.submittedAt || session.recipientName !== group.personName || session.roleName !== roleName) return false;
        const exact = (session.knowledgeCandidateKeys || []).includes(group.candidateKey);
        const category = (session.issueCategories || []).some((item) => issueTerms.has(cleanText(item).toLowerCase()));
        return exact || category;
      }).sort((left, right) => dateTimestamp(right.submittedAt) - dateTimestamp(left.submittedAt));
      const latestExam = relevantExams[0] || null;
      const examEvidence = latestExam ? ((latestExam.knowledgeCandidateKeys || []).includes(group.candidateKey) ? "exact" : "category") : "none";
      const latestIssue = issues[issues.length - 1] || {};
      const firstIssue = issues[0] || {};
      const latestIssueAt = dateTimestamp(latestIssue.issueDate) || dateTimestamp(latestIssue.updatedAt);
      const action = actionByKey.get(group.recurrenceKey) || null;
      const implementedAt = dateTimestamp(action?.implementedAt);
      const observationUntil = dateTimestamp(action?.observationUntil);
      const recurredAfterAction = Boolean(implementedAt && issues.some((item) => (dateTimestamp(item.issueDate) || dateTimestamp(item.updatedAt)) > implementedAt));
      const recurredAfterExam = Boolean(latestExam && latestIssueAt > dateTimestamp(latestExam.submittedAt));
      let state = issues.length > 1 ? "recurrent_open" : "first";
      if (action?.effectiveness === "ineffective") state = "ineffective";
      else if (recurredAfterAction) state = "recurred_after_action";
      else if (action?.effectiveness === "effective" && action.verificationEvidence && observationUntil && observationUntil <= now) state = "effective";
      else if (action && ["implemented", "verifying", "closed"].includes(action.status)) state = "observing";
      return {
        recurrenceKey: group.recurrenceKey,
        module,
        personName: group.personName,
        candidateKey: group.candidateKey,
        documentId: group.documentId,
        documentName: group.documentName,
        clauseNumber: group.clauseNumber,
        knowledgeTitle: group.knowledgeTitle,
        quote: group.quote,
        occurrenceCount: issues.length,
        repeatCount: Math.max(0, issues.length - 1),
        firstOccurredAt: firstIssue.issueDate || firstIssue.updatedAt || "",
        latestOccurredAt: latestIssue.issueDate || latestIssue.updatedAt || "",
        issues,
        matchIds: group.matchIds,
        latestExam: latestExam ? { id: latestExam.id, submittedAt: latestExam.submittedAt, score: Number(latestExam.result?.score || 0), passed: examPassed(latestExam), evidence: examEvidence, issueCategories: latestExam.issueCategories || [] } : null,
        recurredAfterExam,
        recurredAfterAction,
        action,
        state,
        stateLabel: recurrenceStateLabel(state),
      };
    });
    const query = cleanText(options.query).toLowerCase();
    const state = cleanText(options.state);
    if (query) rows = rows.filter((item) => `${item.personName} ${item.knowledgeTitle} ${item.documentName} ${item.issues.map((issue) => `${issue.issueType} ${issue.issueText}`).join(" ")}`.toLowerCase().includes(query));
    if (state) rows = rows.filter((item) => item.state === state);
    const riskOrder = { recurred_after_action: 0, ineffective: 1, recurrent_open: 2, observing: 3, first: 4, effective: 5 };
    rows.sort((left, right) => (riskOrder[left.state] ?? 9) - (riskOrder[right.state] ?? 9) || right.repeatCount - left.repeatCount || String(right.latestOccurredAt).localeCompare(String(left.latestOccurredAt)));
    const offset = Math.max(0, Number(options.offset || 0));
    const limit = Math.min(options.compact ? 10000 : 100, Math.max(1, Number(options.limit || 20)));
    const pageRows = rows.slice(offset, offset + limit);
    const recurrences = options.compact ? pageRows.map((item) => ({
      recurrenceKey: item.recurrenceKey,
      module: item.module,
      personName: item.personName,
      candidateKey: item.candidateKey,
      documentName: item.documentName,
      clauseNumber: item.clauseNumber,
      knowledgeTitle: item.knowledgeTitle,
      occurrenceCount: item.occurrenceCount,
      repeatCount: item.repeatCount,
      firstOccurredAt: item.firstOccurredAt,
      latestOccurredAt: item.latestOccurredAt,
      issueTypes: [...new Set(item.issues.map((issue) => cleanText(issue.issueType)).filter(Boolean))].slice(0, 8),
      latestExam: item.latestExam,
      recurredAfterExam: item.recurredAfterExam,
      recurredAfterAction: item.recurredAfterAction,
      action: item.action ? { actionType: item.action.actionType, owner: item.action.owner, dueDate: item.action.dueDate, implementedAt: item.action.implementedAt, observationUntil: item.action.observationUntil, status: item.action.status, effectiveness: item.action.effectiveness, verificationEvidence: item.action.verificationEvidence } : null,
      state: item.state,
      stateLabel: item.stateLabel,
    })) : pageRows;
    return { recurrences, total: rows.length, summary: { total: rows.length, repeated: rows.filter((item) => item.repeatCount > 0).length, afterAction: rows.filter((item) => item.recurredAfterAction).length, effective: rows.filter((item) => item.state === "effective").length }, storage: confirmed.storage || actions.storage || "json" };
  };
  const saveRecurrenceAction = async (recurrenceKey, payload = {}) => {
    const module = String(payload.module || "IPQC").toUpperCase() === "DQA" ? "DQA" : "IPQC";
    const personName = cleanText(payload.personName);
    const candidateKey = cleanText(payload.candidateKey);
    if (!personName || !candidateKey || stableId("recurrence", `${module}:${personName}:${candidateKey}`) !== recurrenceKey) throw new Error("复发分组标识无效，请重新读取后再保存");
    const actionTypes = new Set(["physical", "logical", "measurement", "training", "mixed"]);
    const statuses = new Set(["open", "implemented", "verifying", "closed"]);
    const effectivenessValues = new Set(["pending", "effective", "ineffective"]);
    const effectiveness = effectivenessValues.has(payload.effectiveness) ? payload.effectiveness : "pending";
    const observationUntil = cleanText(payload.observationUntil);
    const verificationEvidence = cleanText(payload.verificationEvidence).slice(0, 4000);
    if (effectiveness === "effective") {
      if (!verificationEvidence || !observationUntil) throw new Error("判定措施有效前，必须填写验证证据和观察期截止日期");
      if (dateTimestamp(observationUntil) > Date.now()) throw new Error("观察期尚未结束，当前只能保存为待验证");
    }
    const previous = (await listRecurrenceActions({ module, personName })).actions.find((item) => item.recurrenceKey === recurrenceKey);
    const timestamp = nowIso();
    const action = {
      recurrenceKey,
      module,
      personName,
      candidateKey,
      actionType: actionTypes.has(payload.actionType) ? payload.actionType : "mixed",
      actionText: cleanText(payload.actionText).slice(0, 4000),
      owner: cleanText(payload.owner).slice(0, 200),
      dueDate: cleanText(payload.dueDate),
      implementedAt: cleanText(payload.implementedAt),
      verificationMethod: cleanText(payload.verificationMethod).slice(0, 2000),
      verificationEvidence,
      observationUntil,
      status: statuses.has(payload.status) ? payload.status : "open",
      effectiveness,
      metadata: { ...(previous?.metadata || {}), ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}) },
      createdAt: previous?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const store = await readFallback();
    store.recurrenceActions = [action, ...(store.recurrenceActions || []).filter((item) => item.recurrenceKey !== recurrenceKey)];
    await writeFallback(store);
    const postgres = await writePostgresRecurrenceAction(action);
    return postgres.available ? postgres.action : action;
  };
  const resume = async () => {
    const documents = await listDocuments();
    const jobs = await listJobs();
    for (const document of documents.filter((item) => ["waiting", "parsing", "indexing"].includes(item.status))) {
      const job = jobs.find((item) => item.documentId === document.id && item.jobType === "parse" && ["waiting", "running"].includes(item.status));
      await enqueueParse(document.id, job?.id || "");
    }
  };

  return { createDocument, deleteDocument, deleteIssue, enqueueParse, generateMatches, getDocument, listClauses, listConfirmedMatches, listDistilled, listDocuments, listIssues, listJobs, listMatches, listRecurrences, resume, reviewMatch, saveDistillation, saveRecurrenceAction, startDistillation, syncIssues, updateJob };
};
