import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import os from "node:os";
import {
  deletePostgresKnowledgeJob,
  deletePostgresKnowledgeDocument,
  deletePostgresQualityIssue,
  listPostgresConfirmedKnowledgeMatches,
  listPostgresDistilledKnowledge,
  listPostgresKnowledgeClauses,
  listPostgresKnowledgeDocuments,
  listPostgresKnowledgeJobs,
  listPostgresKnowledgeMatches,
  listPostgresKnowledgeFeedbackRecords,
  listPostgresKnowledgeConflicts,
  listPostgresKnowledgeAuditLogs,
  listPostgresKnowledgeReviewSessions,
  listPostgresQualityIssues,
  listPostgresRecurrenceActions,
  searchPostgresKnowledgeCandidates,
  readPostgresKnowledgeDocument,
  replacePostgresKnowledgeMatches,
  replacePostgresDistilledKnowledge,
  updatePostgresDistilledKnowledge,
  replacePostgresKnowledgeClauses,
  reviewPostgresKnowledgeMatch,
  upsertPostgresQualityIssues,
  writePostgresRecurrenceAction,
  writePostgresKnowledgeDocument,
  writePostgresKnowledgeJob,
  writePostgresKnowledgeFeedbackRecord,
  writePostgresKnowledgeConflict,
  writePostgresKnowledgeAuditLog,
  writePostgresKnowledgeReviewSession,
} from "./postgresStore.mjs";

const emptyStore = () => ({ version: 5, documents: [], clauses: [], jobs: [], knowledge: [], issues: [], matches: [], recurrenceActions: [], reviewSessions: [], feedbackRecords: [], conflicts: [], auditLogs: [] });
const fallbackMutationLocks = new Map();
const nowIso = () => new Date().toISOString();
const cleanText = (value) => String(value || "").replace(/\u0000/g, "").replace(/\r/g, "").trim();
const clampProgress = (value) => Math.min(100, Math.max(0, Number(value || 0)));
const stableId = (prefix, value) => `${prefix}-${createHash("sha1").update(String(value)).digest("hex").slice(0, 20)}`;
const toArray = (value) => Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
const parseAiKnowledgePayload = (content) => {
  const text = cleanText(content).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let value;
  try { value = JSON.parse(text); }
  catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("模型没有返回可识别的知识JSON");
    try { value = JSON.parse(match[0]); } catch { throw new Error("模型返回的知识JSON格式无效"); }
  }
  const rows = Array.isArray(value) ? value : value?.knowledge || value?.items || [];
  if (!Array.isArray(rows)) throw new Error("模型返回的知识结果不是数组");
  return rows;
};
const deduplicateKnowledge = (items = []) => {
  const byKey = new Map();
  items.forEach((item) => {
    const key = `${cleanText(item.title)}::${cleanText(item.content)}`.toLowerCase();
    if (!key.replace(/[:]/g, "")) return;
    const previous = byKey.get(key);
    byKey.set(key, previous ? { ...previous, sourceCitations: [...(previous.sourceCitations || []), ...(item.sourceCitations || [])] } : item);
  });
  return [...byKey.values()];
};
const governanceStatuses = new Set(["待登记", "已登记", "待解析", "已解析", "候选知识", "待技术评审", "已发布", "待复审", "已废止"]);
const sourceLevels = new Set(["A", "B", "C"]);

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

const normalizedEvidenceText = (value) => cleanText(value).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
const evidenceMetadataLabels = new Set(["文件类型", "文档类型", "资料类型", "文件名称", "文档名称", "资料名称", "设计规范", "版本", "版本号", "作者", "编制", "审核", "批准", "日期", "发布日期", "生效日期", "目录", "封面"]);
const evidenceStructuralLabels = new Set(["机密等级", "内部公开", "维护部门", "研发中心", "生效日期", "文 件 会 签 表", "文件会签表", "部 门", "负 责 人 /日 期", "负责人/日期", "备注", "修订记录", "新增/更改 理由", "新增/更改理由", "新增/更改 主要点说明", "新增/更改主要点说明", "修订人", "修订时间", "引用文件及参考文献", "职责与权限", "区域名称", "区域定义", "可选择性", "推荐吸盘直径", "理论依据", "推荐吸嘴型号"]);
const isEvidenceMetadataLine = (value) => {
  const text = cleanText(value).replace(/[：:]$/, "");
  const normalized = normalizedEvidenceText(text);
  if (!normalized) return true;
  if (evidenceMetadataLabels.has(text)) return true;
  if (/^(?:文件|文档|资料)(?:类型|名称|编号|版本)$/.test(text)) return true;
  if (/^(?:文件类型|文档类型|资料类型)[：:]?(?:设计规范|企业标准|国家标准|教材|sop|作业指导书)$/i.test(cleanText(value))) return true;
  if (evidenceStructuralLabels.has(text)) return true;
  return false;
};
// Evidence must be independently understandable.  Parser output such as a
// column heading, unit, or lone numeric value is context, not evidence.
const evidenceValuePattern = /^(?:[\u03c6Φφ]?\s*[<>≤≥=]?\s*[+-]?\d+(?:\.\d+)?(?:\s*[a-zA-Zμ％%°Ω℃秒分钟天件个]+)?|min\s*\(|max\s*\(|[A-Za-z0-9_.-]+(?:-[A-Za-z0-9_.-]+)+)$/i;
const isEvidenceValueFragment = (value) => {
  const text = cleanText(value);
  return evidenceValuePattern.test(text) || (/^[\u03c6Φφ]?\s*[+-]?\d/.test(text) && text.length <= 32);
};
const isEvidenceCompleteCandidate = (value) => {
  const text = cleanText(value);
  const normalized = normalizedEvidenceText(text);
  if (!normalized || isEvidenceMetadataLine(text) || isEvidenceValueFragment(text)) return false;
  if (/^《[^》]+》$/.test(text)) return false;
  if (/(?:工程师|SE|ME|IPQC|DQA)$/.test(text) && !/[：。！？；?!]/.test(text)) return false;
  if (/^[-–—•●▪·\s\d.()（）]+$/.test(text)) return false;
  // A short noun label without a predicate is context, not evidence.
  if (normalized.length <= 12 && !/[。！？；?!;：:，,]/.test(text) && /(?:类型|名称|编号|版本|日期|区域|规范|标准|单位|参数|类别|章节|目录|封面|标题|说明)$/.test(text)) return false;
  if (normalized.length < 6 && !/[。！？；?!;：:，,]/.test(text)) return false;
  return true;
};
const evidenceHeadingPattern = /(?:选择|原则|场景|设计|规范|总结|如下|选型|说明|方法|要求|介绍|分析|内容|流程|权限|分类|清单)$/;
const isEvidenceHeadingFragment = (value) => {
  const text = cleanText(value);
  return text.length <= 28 && !/[。！？；?!;：:，,]$/.test(text) && evidenceHeadingPattern.test(text);
};
const normalizeOcrText = (value) => cleanText(value)
  .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, "$1")
  .replace(/\s+([，。；：！？、）】》])/g, "$1")
  .replace(/([（【《])\s+/g, "$1");

const evidenceSentenceParts = (value) => String(value || "")
  .split(/(?<=[。！？；?!;])\s*|\n+/)
  .map((item) => item.trim())
  .filter(Boolean);

// Evidence is a traceable semantic unit, not an arbitrary character slice.
// Keep headings attached to the first complete statement, merge OCR/line fragments,
// and only split long prose at real sentence or list boundaries.
export const splitEvidenceText = (value) => {
  const text = cleanText(value).replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n");
  if (!text) return [];
  const units = [];
  text.split(/\n{2,}/).forEach((paragraph) => {
    const lines = paragraph.split(/\n+/).map((item) => item.trim()).filter((item) => item && !isEvidenceMetadataLine(item));
    if (!lines.length) return;
    if (lines.length === 1 && !markerPattern.test(lines[0]) && !isHeading(lines[0])) {
      units.push(lines[0]);
      return;
    }
    let current = "";
    const flush = () => { if (current.trim()) units.push(current.trim()); current = ""; };
    lines.forEach((line) => {
      const numbered = markerPattern.test(line);
      const bullet = /^[-•●▪]\s*/.test(line);
      const heading = isHeading(line);
      // Standalone headings and very short labels are context for the next statement.
      if (heading || isEvidenceHeadingFragment(line) || (!numbered && !bullet && normalizedEvidenceText(line).length < 10 && !/[。！？；?!;]$/.test(line))) {
        current = current ? `${current}\n${line}` : line;
        return;
      }
      if (current && (numbered || bullet)) flush();
      const sentences = evidenceSentenceParts(line);
      sentences.forEach((sentence) => {
        if (!current) current = sentence;
        else if (normalizedEvidenceText(current).length < 24 || !/[。！？；?!;]$/.test(current)) current = `${current}${current.endsWith("\n") ? "" : " "}${sentence}`;
        else { flush(); current = sentence; }
      });
    });
    flush();
  });
  // Merge residual fragments; discard only decorative labels with no semantic statement.
  const merged = [];
  units.forEach((unit) => {
    const normalized = normalizedEvidenceText(unit);
    const looksLabel = normalized.length < 10 && !/[。！？；?!;：:]/.test(unit);
    if (looksLabel && merged.length) merged[merged.length - 1] = `${merged[merged.length - 1]} ${unit}`;
    else if (looksLabel && units.length > 1) return;
    else merged.push(unit);
  });
  return merged.filter(isEvidenceCompleteCandidate);
};

// Word/PDF text extraction commonly places cover metadata, revision tables and
// the table of contents before the first actual requirement. Those lines are
// useful document metadata but are not independently meaningful evidence.
const evidenceBodyStart = (lines = []) => {
  const index = lines.findIndex((line) => /^(?:目的|1[、.．\s]+目的)(?:[：:]|$)/.test(cleanText(line)));
  return index >= 0 ? index : 0;
};
const prepareQualityEvidenceLines = (sourceText) => {
  const raw = cleanText(sourceText).split(/\n+/).map((line) => line.replace(/[\t ]+/g, " ").trim()).filter(Boolean);
  const body = raw.slice(evidenceBodyStart(raw));
  return body.filter((line) => !isEvidenceMetadataLine(line));
};

export const buildPdfEvidenceClauses = (document = {}, pages = []) => {
  const clauses = [];
  const seen = new Map();
  pages.forEach((page) => {
    splitEvidenceText(page.text).forEach((clauseText, chunkIndex) => {
      const normalized = normalizedEvidenceText(clauseText);
      if (normalized.length < 8) return;
      const duplicateKey = createHash("sha1").update(normalized).digest("hex");
      const sourceLocation = {
        locatorType: "pdf-page",
        locator: `第${page.page}页${chunkIndex ? ` 片段${chunkIndex + 1}` : ""}`,
        page: Number(page.page || 0),
        chunk: chunkIndex + 1,
        cropBox: Array.isArray(page.cropBox) ? page.cropBox : [],
        mediaBox: Array.isArray(page.mediaBox) ? page.mediaBox : [],
        rotation: Number(page.rotation || 0),
        coordinatePrecision: "page",
      };
      if (seen.has(duplicateKey)) {
        const existing = seen.get(duplicateKey);
        existing.metadata.duplicateLocations = [...(existing.metadata.duplicateLocations || []), sourceLocation];
        return;
      }
      const ordinal = clauses.length + 1;
      clauses.push({
        id: stableId("clause", `${document.id}:${page.page}:${chunkIndex}:${clauseText}`),
        documentId: document.id,
        ordinal,
        sectionPath: `第 ${page.page} 页`,
        clauseNumber: "",
        title: clauseText.split("\n")[0] || `第 ${page.page} 页`,
        clauseText,
        searchText: clauseText,
        metadata: {
          evidenceKind: "semantic",
          sourceDocument: document.name,
          sourceHash: document.fileHash || "",
          version: document.version || "",
          sourceFormat: "pdf",
          sourceLocation,
          ocrStatus: page.ocrStatus || "native",
          reviewStatus: page.reviewStatus || (page.ocrStatus === "completed" ? "pending" : "not_required"),
          textQuality: page.nativeTextQuality || {},
          duplicateKey,
        },
        createdAt: nowIso(),
      });
      seen.set(duplicateKey, clauses[clauses.length - 1]);
    });
  });
  return clauses;
};

const rectUnion = (rects = []) => {
  const valid = rects.filter((rect) => Array.isArray(rect) && rect.length === 4).map((rect) => rect.map(Number));
  if (!valid.length) return [];
  const left = Math.min(...valid.map((rect) => rect[0]));
  const top = Math.min(...valid.map((rect) => rect[1]));
  const right = Math.max(...valid.map((rect) => rect[0] + rect[2]));
  const bottom = Math.max(...valid.map((rect) => rect[1] + rect[3]));
  return [left, top, right - left, bottom - top].map((value) => Math.round(value * 100) / 100);
};

export const buildImageEvidenceClauses = (document = {}, ocr = {}, baseLocation = {}) => {
  const lines = (Array.isArray(ocr.lines) ? ocr.lines : []).map((line) => ({
    text: normalizeOcrText(line.text || ""),
    cropBox: rectUnion((line.words || []).map((word) => word.boundingRect)),
  })).filter((line) => line.text);
  if (!lines.length && cleanText(ocr.text)) lines.push({ text: normalizeOcrText(ocr.text), cropBox: [0, 0, Number(ocr.width || 0), Number(ocr.height || 0)] });
  const groups = [];
  let current = [];
  let size = 0;
  lines.forEach((line) => {
    if (current.length && size + line.text.length > 900) { groups.push(current); current = []; size = 0; }
    current.push(line);
    size += line.text.length;
  });
  if (current.length) groups.push(current);
  return groups.flatMap((group, groupIndex) => {
    const rawText = group.map((line) => line.text).join("\n");
    const pieces = splitEvidenceText(rawText);
    return pieces.map((clauseText, index) => {
    const sourceLocation = {
      locatorType: baseLocation.locatorType || "image-region",
      locator: baseLocation.locator || `${document.name} 图片区域${index + 1}`,
      ...baseLocation,
      chunk: groupIndex + index + 1,
      cropBox: rectUnion(group.map((line) => line.cropBox)),
      coordinateUnit: baseLocation.coordinateUnit || "pixel",
      imageSize: [Number(ocr.width || 0), Number(ocr.height || 0)],
    };
    return {
      id: stableId("clause", `${document.id}:${sourceLocation.locator}:${groupIndex}:${index}:${clauseText}`),
      documentId: document.id,
      ordinal: 0,
      sectionPath: sourceLocation.locator,
      clauseNumber: "",
      title: clauseText.split("\n")[0] || `图片证据 ${index + 1}`,
      clauseText,
      searchText: clauseText,
      metadata: {
        evidenceKind: "image-region",
        sourceDocument: document.name,
        sourceHash: document.fileHash || "",
        version: document.version || "",
        sourceFormat: baseLocation.sourceFormat || "image",
        sourceLocation,
        ocrStatus: "completed",
        reviewStatus: "pending",
      },
      createdAt: nowIso(),
    };
    });
  });
};

export const buildTimedEvidenceClauses = (document = {}) => {
  const lines = cleanText(document.sourceText).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const locations = Array.isArray(document.metadata?.segmentMetadata) ? document.metadata.segmentMetadata : [];
  return lines.filter(isEvidenceCompleteCandidate).map((clauseText, index) => {
    const sourceLocation = locations[index] || { locatorType: "video-timestamp", locator: `字幕 ${index + 1}` };
    return {
      id: stableId("clause", `${document.id}:${index}:${clauseText}`),
      documentId: document.id,
      ordinal: index + 1,
      sectionPath: sourceLocation.locator || `字幕 ${index + 1}`,
      clauseNumber: "",
      title: clauseText,
      clauseText,
      searchText: clauseText,
      metadata: { evidenceKind: "video-transcript", sourceDocument: document.name, sourceHash: document.fileHash || "", version: document.version || "", sourceFormat: "video-transcript", sourceLocation, ocrStatus: "not_required", reviewStatus: "not_required" },
      createdAt: nowIso(),
    };
  });
};

export const buildPptTextEvidenceClauses = (document = {}, slides = []) => slides.flatMap((slide) => {
  const text = (Array.isArray(slide.texts) ? slide.texts : []).map(cleanText).filter(Boolean).join("\n");
  return splitEvidenceText(text).map((clauseText, chunkIndex) => {
    const slideNumber = Number(slide.slide || 0);
    const locator = `幻灯片 ${slideNumber}${chunkIndex ? ` · 片段 ${chunkIndex + 1}` : ""}`;
    return {
      id: stableId("clause", `${document.id}:slide:${slideNumber}:${chunkIndex}:${clauseText}`),
      documentId: document.id,
      ordinal: 0,
      sectionPath: `幻灯片 ${slideNumber}`,
      clauseNumber: "",
      title: clauseText.split("\n")[0] || locator,
      clauseText,
      searchText: clauseText,
      metadata: {
        evidenceKind: "semantic",
        sourceDocument: document.name,
        sourceHash: document.fileHash || "",
        version: document.version || "",
        sourceFormat: "pptx",
        sourceLocation: { locatorType: "ppt-slide", locator, slide: slideNumber, chunk: chunkIndex + 1 },
        ocrStatus: "not_required",
        reviewStatus: "not_required",
      },
      createdAt: nowIso(),
    };
  });
});

const runProcess = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true, ...options });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  child.once("error", reject);
  child.once("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${path.basename(command)} 执行失败（${code}）：${stderr || stdout}`.slice(0, 1200))));
});

export const splitQualityClauses = (document = {}) => {
  const rawLines = prepareQualityEvidenceLines(document.sourceText);
  const lines = rawLines;
  const sections = [];
  const clauses = [];
  let current = null;
  const flush = () => {
    if (!current?.text?.trim()) return;
    const sourceText = current.text.trim();
    const parts = splitEvidenceText(sourceText);
    (parts.length ? parts : [sourceText]).forEach((clauseText) => {
      const ordinal = clauses.length + 1;
      clauses.push({
        id: stableId("clause", `${document.id}:${ordinal}:${clauseText}`),
        documentId: document.id,
        ordinal,
        sectionPath: current.sectionPath || sections.filter(Boolean).join(" / "),
        clauseNumber: current.clauseNumber || "",
        title: current.title || clauseText.split("\n")[0],
        clauseText,
        searchText: `${current.sectionPath || ""} ${current.clauseNumber || ""} ${clauseText}`.trim(),
        metadata: {
          evidenceKind: "semantic",
          sourceDocument: document.name,
          sourceHash: document.fileHash || "",
          version: document.version || "",
          sourceFormat: document.contentType || "text",
          sourceLocation: document.metadata?.segmentMetadata?.[current.sourceSegmentIndex] || {
            locatorType: document.contentType === "excel" ? "sheet-row" : document.contentType === "ppt" ? "slide" : document.contentType === "word" ? "paragraph" : "text-line",
            locator: document.contentType === "excel" ? `第${(current.sourceSegmentIndex || 0) + 1}行` : `${(current.sourceSegmentIndex || 0) + 1}`,
          },
          ocrStatus: document.metadata?.healthStatus === "待OCR" ? "待OCR" : "not_required",
        },
        createdAt: nowIso(),
      });
    });
    current = null;
  };
  lines.forEach((line, sourceSegmentIndex) => {
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
      current = { clauseNumber: match[1], title: match[2], text: line, sectionPath: sections.filter(Boolean).join(" / "), sourceSegmentIndex, structured: true };
      return;
    }
    if (!match && isEvidenceHeadingFragment(line)) {
      if (!current) current = { clauseNumber: "", title: line, text: line, sectionPath: sections.filter(Boolean).join(" / "), sourceSegmentIndex, context: true };
      else if (current.context && !current.structured) current.text += `\n${line}`;
      else if (!current.structured) { flush(); current = { clauseNumber: "", title: line, text: line, sectionPath: sections.filter(Boolean).join(" / "), sourceSegmentIndex, context: true }; }
      return;
    }
    if (!current) current = { clauseNumber: "", title: line, text: line, sectionPath: sections.filter(Boolean).join(" / "), sourceSegmentIndex };
    else if (current.structured || current.context) current.text += `\n${line}`;
    else { flush(); current = { clauseNumber: "", title: line, text: line, sectionPath: sections.filter(Boolean).join(" / "), sourceSegmentIndex }; }
  });
  flush();
  const isValueFragment = (text) => {
    const value = cleanText(text);
    return /^(?:[\u03c6Φφ]?\s*[<>≤≥=]?\s*[+-]?\d+(?:\.\d+)?(?:\s*[a-zA-Zμ％%°Ω]+)?|min\s*\(|max\s*\(|[A-Za-z0-9_.-]+(?:-[A-Za-z0-9_.-]+)+)$/.test(value)
      || (/^[\u03c6Φφ]?\s*[+-]?\d/.test(value) && value.length <= 32);
  };
  const isLabelFragment = (text) => {
    const value = cleanText(text);
    return value.length > 1 && value.length <= 32 && !/[。！？；?!;]$/.test(value) && !isValueFragment(value) && !/^\d+(?:\.\d+)*$/.test(value);
  };
  const merged = [];
  for (let index = 0; index < clauses.length; index += 1) {
    const current = clauses[index];
    const next = clauses[index + 1];
    const currentText = cleanText(current.clauseText);
    const nextText = cleanText(next?.clauseText);
    // Table extraction often emits label and value as adjacent paragraphs.
    if (next && isLabelFragment(currentText) && isValueFragment(nextText)) {
      merged.push({ ...current, title: currentText, clauseText: `${currentText}：${nextText}`, searchText: `${current.searchText} ${next.searchText}`.trim(), metadata: { ...current.metadata, mergedSourceSegments: [current.metadata?.sourceLocation, next.metadata?.sourceLocation].filter(Boolean) } });
      index += 1;
      continue;
    }
    // If a numeric/formula fragment follows a short label that was separated by a heading,
    // attach it to the nearest preceding fragment rather than exposing it as evidence.
    if (isValueFragment(currentText) && merged.length && isLabelFragment(merged.at(-1).clauseText)) {
      const previous = merged.pop();
      merged.push({ ...previous, clauseText: `${previous.clauseText}：${currentText}`, searchText: `${previous.searchText} ${current.searchText}`.trim(), metadata: { ...previous.metadata, mergedSourceSegments: [previous.metadata?.sourceLocation, current.metadata?.sourceLocation].filter(Boolean) } });
      continue;
    }
    // Pure one-token / one-number evidence has no standalone semantic meaning.
    if (isEvidenceMetadataLine(currentText) || isValueFragment(currentText) || (/^\S{1,8}$/.test(currentText) && !/[\u4e00-\u9fff]{2,}/.test(currentText))) continue;
    merged.push(current);
  }
  return merged.filter((item) => isEvidenceCompleteCandidate(item.clauseText));
};

const knowledgePublicationStatuses = new Set(["candidate", "approved", "rejected", "conflict", "published", "superseded"]);
const knowledgeReviewActions = new Set(["accept", "reject", "conflict", "publish", "return"]);
const knowledgeAccessLevels = new Set(["internal", "restricted"]);
const semanticKnowledgeText = (value) => cleanText(value).replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n");
const semanticKnowledgeArray = (value) => [...new Set(toArray(value).map(semanticKnowledgeText).filter(Boolean))];
const editableKnowledgeTypes = new Set(["mandatory", "prohibited", "threshold", "evidence", "definition", "failure_mode", "exam_point", "review_point", "verification_method"]);
const applyKnowledgeReviewChanges = (current = {}, changes = {}) => {
  if (!changes || typeof changes !== "object") return current;
  const metadata = current.metadata || {};
  const changedMetadata = changes.metadata && typeof changes.metadata === "object" ? changes.metadata : {};
  return {
    ...current,
    type: editableKnowledgeTypes.has(String(changes.type || "")) ? String(changes.type) : current.type,
    title: changes.title === undefined ? current.title : semanticKnowledgeText(changes.title),
    content: changes.content === undefined ? current.content : semanticKnowledgeText(changes.content),
    applicableRoles: changes.applicableRoles === undefined ? current.applicableRoles : semanticKnowledgeArray(changes.applicableRoles),
    processes: changes.processes === undefined ? current.processes : semanticKnowledgeArray(changes.processes),
    issueTags: changes.issueTags === undefined ? current.issueTags : semanticKnowledgeArray(changes.issueTags),
    synonyms: changes.synonyms === undefined ? current.synonyms : semanticKnowledgeArray(changes.synonyms),
    metadata: {
      ...metadata,
      ...(changedMetadata.originalFact === undefined ? {} : { originalFact: semanticKnowledgeText(changedMetadata.originalFact) }),
      ...(changedMetadata.engineeringExplanation === undefined ? {} : { engineeringExplanation: semanticKnowledgeText(changedMetadata.engineeringExplanation) }),
      ...(changedMetadata.correctState === undefined ? {} : { correctState: semanticKnowledgeText(changedMetadata.correctState) }),
      ...(changedMetadata.violationBasis === undefined ? {} : { violationBasis: semanticKnowledgeArray(changedMetadata.violationBasis) }),
      ...(changedMetadata.applicableScope === undefined ? {} : { applicableScope: semanticKnowledgeArray(changedMetadata.applicableScope) }),
      ...(changedMetadata.notApplicableScope === undefined ? {} : { notApplicableScope: semanticKnowledgeArray(changedMetadata.notApplicableScope) }),
      ...(changedMetadata.reviewPoints === undefined ? {} : { reviewPoints: semanticKnowledgeArray(changedMetadata.reviewPoints) }),
      ...(changedMetadata.correctionActions === undefined ? {} : { correctionActions: semanticKnowledgeArray(changedMetadata.correctionActions) }),
      ...(changedMetadata.verification === undefined ? {} : { verification: semanticKnowledgeArray(changedMetadata.verification) }),
    },
  };
};
const normalizeKnowledge = (document = {}, skillId, items = []) => items.map((item, index) => {
  const citations = (Array.isArray(item.sourceCitations) ? item.sourceCitations : []).map((citation) => ({
    clauseId: String(citation.clauseId || ""),
    clauseNumber: String(citation.clauseNumber || ""),
    sectionPath: String(citation.sectionPath || ""),
    page: Number(citation.page || 0) || undefined,
    cropBox: Array.isArray(citation.cropBox) ? citation.cropBox : undefined,
    ocrStatus: cleanText(citation.ocrStatus),
    reviewStatus: cleanText(citation.reviewStatus),
    quote: semanticKnowledgeText(citation.quote),
  })).map((citation) => Object.fromEntries(Object.entries(citation).filter(([, value]) => value !== undefined))).filter((citation) => citation.clauseId && citation.quote);
  return {
    id: stableId("knowledge", `${document.id}:${skillId}:${item.title || ""}:${item.content || ""}:${index}`),
    documentId: document.id,
    clauseIds: [...new Set(citations.map((citation) => citation.clauseId))],
    type: ["mandatory", "prohibited", "threshold", "evidence", "definition", "failure_mode", "exam_point", "review_point", "verification_method"].includes(item.type) ? item.type : "mandatory",
    title: semanticKnowledgeText(item.title || "未命名知识点"),
    content: semanticKnowledgeText(item.content),
    applicableRoles: semanticKnowledgeArray(item.applicableRoles),
    processes: semanticKnowledgeArray(item.processes),
    issueTags: semanticKnowledgeArray(item.issueTags),
    synonyms: semanticKnowledgeArray(item.synonyms),
    sourceLevel: String(item.sourceLevel || document.sourceLevel || "C").toUpperCase(),
    version: cleanText(item.version || document.version),
    metadata: {
      originalFact: semanticKnowledgeText(item.originalFact),
      engineeringExplanation: semanticKnowledgeText(item.engineeringExplanation),
      inference: semanticKnowledgeText(item.inference),
      correctState: semanticKnowledgeText(item.correctState || item.metadata?.correctState),
      violationBasis: semanticKnowledgeArray(item.violationBasis || item.metadata?.violationBasis),
      commonViolations: Array.isArray(item.commonViolations || item.metadata?.commonViolations) ? (item.commonViolations || item.metadata.commonViolations).map((entry) => typeof entry === "string" ? { pattern: semanticKnowledgeText(entry), sourceType: "historical_issue", issueIds: [], frequency: 0, confidence: 0, status: "candidate" } : ({ pattern: semanticKnowledgeText(entry.pattern), sourceType: entry.sourceType === "historical_issue" ? "historical_issue" : "historical_issue", issueIds: Array.isArray(entry.issueIds) ? entry.issueIds.map(String) : [], frequency: Number(entry.frequency || 0), confidence: Number(entry.confidence || 0), status: ["candidate", "confirmed", "archived"].includes(entry.status) ? entry.status : "candidate" })).filter((entry) => entry.pattern) : [],
      applicableScope: semanticKnowledgeArray(item.applicableScope),
      notApplicableScope: semanticKnowledgeArray(item.notApplicableScope),
      method: semanticKnowledgeArray(item.method),
      reviewPoints: semanticKnowledgeArray(item.reviewPoints),
      correctionActions: semanticKnowledgeArray(item.correctionActions),
      verification: semanticKnowledgeArray(item.verification),
      projects: semanticKnowledgeArray(item.projects || item.project),
      projectStages: semanticKnowledgeArray(item.projectStages || item.projectStage || item.stage),
      brandModels: semanticKnowledgeArray(item.brandModels || item.brandModel || item.model),
      riskLevel: ["low", "medium", "high", "critical", "unknown"].includes(String(item.riskLevel || "").toLowerCase()) ? String(item.riskLevel).toLowerCase() : "unknown",
      mustReview: item.mustReview === true,
      warnings: semanticKnowledgeArray(item.warnings),
      experienceReference: String(item.sourceLevel || document.sourceLevel || "C").toUpperCase() === "C" || item.experienceReference === true,
    },
    confidence: Math.min(1, Math.max(0, Number(item.confidence ?? 0.8))),
    skillId,
    sourceCitations: citations,
    reviewStatus: ["approved", "rejected"].includes(String(item.reviewStatus)) ? String(item.reviewStatus) : "pending",
    publicationStatus: knowledgePublicationStatuses.has(String(item.publicationStatus)) ? String(item.publicationStatus) : "candidate",
    publicationNote: cleanText(item.publicationNote).slice(0, 2000),
    reviewedBy: cleanText(item.reviewedBy),
    reviewedAt: cleanText(item.reviewedAt),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}).filter((item) => item.content && item.sourceCitations.length);

const issueVocabulary = [
  "错装", "装反", "漏装", "少装", "松动", "划伤", "破损", "脏污", "异物", "压伤", "变形", "翘曲", "开裂", "虚焊", "漏焊", "短路", "断路", "接线", "标签", "螺丝", "扭矩", "首件", "点检", "巡检", "装配", "加工", "调试",
  "干涉", "碰撞", "空间不足", "尺寸", "公差", "图纸", "BOM", "物料", "选型", "设计", "评审", "验证", "测试", "ECN", "非BOM", "变更", "接口", "软件", "电气", "结构", "工艺", "资料", "缺失", "错误", "不一致", "可靠性", "安全",
];
const issueStopTerms = new Set(["问题", "异常", "要求", "进行", "需要", "相关", "情况", "现场", "人员", "产品", "设备", "公司", "一个", "没有", "不能", "以及", "当前", "记录", "处理", "出现", "发生"]);
const matchingTermGroups = {
  object: ["接线", "端子", "电控板", "线束", "吸嘴", "气缸", "螺丝", "工装", "BOM", "图纸", "物料", "接口", "标签", "阀", "传感器", "支架", "外壳"],
  defect: ["错装", "装反", "漏装", "松动", "短路", "断路", "虚焊", "漏焊", "干涉", "碰撞", "划伤", "破损", "变形", "不一致", "缺失", "错误"],
  action: ["接线", "安装", "装配", "组装", "焊接", "锁紧", "固定", "连接", "验证", "测试", "确认", "点检", "设计", "选型"],
};
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
const candidateText = (candidate) => `${candidate.title || ""} ${candidate.content || ""} ${(candidate.applicableRoles || []).join(" ")} ${(candidate.processes || []).join(" ")} ${(candidate.issueTags || []).join(" ")} ${(candidate.synonyms || []).join(" ")}`;
const issueText = (issue) => `${issue.issueType || ""} ${issue.issueText || ""} ${(issue.tags || []).join(" ")} ${JSON.stringify(issue.metadata || {})}`;
const candidateEligibility = (issue, candidate) => {
  const sourceStatus = String(candidate.effectiveStatus || "active").toLowerCase();
  const governanceStatus = String(candidate.governanceStatus || "");
  if (["inactive", "obsolete", "expired", "废止", "无效"].some((term) => sourceStatus.includes(term)) || governanceStatus === "已废止") return { eligible: false, reason: "来源已废止或失效" };
  if (Number(candidate.openConflictCount || 0) > 0) return { eligible: false, reason: "来源存在未关闭冲突评审" };
  if (candidate.reviewDue && dateTimestamp(candidate.reviewDue) < Date.now()) return { eligible: false, reason: "来源已超过复审日期" };
  if (["rejected", "conflict", "superseded"].includes(candidate.publicationStatus)) return { eligible: false, reason: `知识状态为${candidate.publicationStatus}` };
  const rawIssue = normalizeSearchText(issueText(issue));
  const sourceVersion = String(candidate.version || "").trim();
  const requestedVersion = String(issue.metadata?.version || issue.metadata?.sourceVersion || issue.metadata?.documentVersion || "").trim();
  if (requestedVersion && sourceVersion && requestedVersion !== sourceVersion) return { eligible: false, reason: `版本不匹配（问题${requestedVersion} / 来源${sourceVersion}）` };
  const notApplicable = Array.isArray(candidate.notApplicableScope) ? candidate.notApplicableScope : [];
  const excludedScope = notApplicable.find((scope) => scope && rawIssue.includes(normalizeSearchText(scope)));
  if (excludedScope) return { eligible: false, reason: `命中不适用范围：${excludedScope}` };
  const applicable = Array.isArray(candidate.applicableScope) ? candidate.applicableScope : [];
  const scopeStatus = !applicable.length ? "unknown" : applicable.some((scope) => rawIssue.includes(normalizeSearchText(scope))) ? "matched" : "unknown";
  const moduleTerms = issue.module === "IPQC" ? ["组装", "装配", "ipqc", "过程", "送检", "首件", "巡检"] : ["研发", "设计", "dqa", "评审", "ecn", "变更", "bom", "非bom"];
  const moduleMatched = moduleTerms.some((term) => normalizeSearchText(candidateText(candidate)).includes(normalizeSearchText(term))) || (candidate.sourceCategory || "").toUpperCase().includes(issue.module);
  if (!moduleMatched && candidate.candidateType === "knowledge") return { eligible: false, reason: `未命中${issue.module}模块范围` };
  return { eligible: true, scopeStatus, moduleMatched, sourceLevel: String(candidate.sourceLevel || "C").toUpperCase(), sourceKind: candidate.publicationStatus === "published" ? "已发布知识" : "原始条款候选" };
};
const candidateScore = (issue, candidate, eligibility = {}) => {
  const issueText = `${issue.issueType} ${issue.issueText} ${(issue.tags || []).join(" ")}`;
  const candidateBody = candidateText(candidate);
  const issueTerms = new Set(searchTerms(issueText));
  const candidateTerms = new Set(searchTerms(candidateBody));
  const sharedTerms = [...issueTerms].filter((term) => candidateTerms.has(term) && !issueStopTerms.has(term)).sort((left, right) => right.length - left.length).slice(0, 8);
  const normalizedCandidate = normalizeSearchText(candidateText(candidate));
  const matchedIssueTags = (issue.tags || []).filter((tag) => normalizedCandidate.includes(normalizeSearchText(tag))).slice(0, 6);
  const roleMatch = roleTermsForIssue(issue).some((term) => normalizeSearchText(`${(candidate.applicableRoles || []).join(" ")} ${candidateText(candidate)}`).includes(normalizeSearchText(term)));
  const processMatch = processTermsForIssue(issue).some((term) => normalizeSearchText(`${(candidate.processes || []).join(" ")} ${candidateText(candidate)}`).includes(normalizeSearchText(term)));
  const typeMatch = issue.issueType && issue.issueType !== "未分类" && normalizedCandidate.includes(normalizeSearchText(issue.issueType));
  const issueObjectTerms = matchingTermGroups.object.filter((term) => normalizeSearchText(issueText).includes(normalizeSearchText(term)));
  // Ignore incidental mentions inside long source quotations when detecting
  // the affected object; use explicit card metadata as the object anchor.
  const candidateObjectAnchor = normalizeSearchText(`${candidate.title || ""} ${(candidate.issueTags || []).join(" ")} ${(candidate.processes || []).join(" ")} ${(candidate.synonyms || []).join(" ")} ${(candidate.applicableRoles || []).join(" ")}`);
  const candidateObjectTerms = matchingTermGroups.object.filter((term) => candidateObjectAnchor.includes(normalizeSearchText(term)));
  const matchedObjects = issueObjectTerms.filter((term) => candidateObjectTerms.includes(term));
  const objectMismatch = issueObjectTerms.length > 0 && matchedObjects.length === 0;
  const issueDefectTerms = matchingTermGroups.defect.filter((term) => normalizeSearchText(issueText).includes(normalizeSearchText(term)));
  const matchedDefects = issueDefectTerms.filter((term) => normalizedCandidate.includes(normalizeSearchText(term)));
  let score = Math.min(44, matchedIssueTags.length * 22) + Math.min(28, sharedTerms.reduce((sum, term) => sum + (term.length >= 4 ? 7 : 4), 0));
  if (typeMatch) score += 14;
  if (roleMatch) score += 7;
  if (processMatch) score += 7;
  if (candidate.candidateType === "knowledge") score += Math.round(Number(candidate.confidence || 0.8) * 5);
  if (eligibility.scopeStatus === "matched") score += 10;
  if (eligibility.moduleMatched) score += 6;
  if (eligibility.sourceLevel === "A") score += 3;
  if (eligibility.sourceLevel === "C") score = Math.min(score, 62);
  if (objectMismatch) score = Math.min(score, 25);
  if (issueObjectTerms.length && matchedObjects.length) score += Math.min(24, matchedObjects.length * 12);
  if (issueDefectTerms.length && matchedDefects.length) score += Math.min(16, matchedDefects.length * 8);
  score = Math.min(100, score);
  return {
    score,
    evidence: {
      matchedIssueTags,
      sharedTerms,
      issueObjectTerms,
      matchedObjects,
      objectMismatch,
      issueDefectTerms,
      matchedDefects,
      roleMatch,
      processMatch,
      typeMatch,
      reason: [matchedIssueTags.length ? `问题标签：${matchedIssueTags.join("、")}` : "", sharedTerms.length ? `共同术语：${sharedTerms.join("、")}` : "", roleMatch ? "适用角色相符" : "", processMatch ? "过程阶段相符" : "", eligibility.moduleMatched ? `${issue.module}模块相符` : "", eligibility.scopeStatus === "matched" ? "适用范围相符" : "", eligibility.sourceLevel ? `来源${eligibility.sourceLevel}级` : "", eligibility.sourceKind || ""].filter(Boolean).join("；") || "仅有弱文本关联",
      scopeStatus: eligibility.scopeStatus || "unknown",
      sourceLevel: eligibility.sourceLevel || String(candidate.sourceLevel || "C").toUpperCase(),
      sourceKind: eligibility.sourceKind || "候选",
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

export const createKnowledgeService = ({ filePath, originalDir = path.join(path.dirname(filePath), "knowledge-originals"), scriptDir = path.resolve(path.dirname(filePath), "..", "scripts"), aiComplete = null, loadSkillContent = null }) => {
  let fallbackWrite = Promise.resolve();
  let queue = [];
  let queueRunning = false;
  const deletedJobIds = new Set();
  const distillationControllers = new Map();
  let corpusRevision = 0;
  let corpusCache = { expiresAt: 0, revision: -1, rows: [] };
  let documentIndexCache = { expiresAt: 0, rows: [] };
  const clausePageCache = new Map();
  const distilledPageCache = new Map();
  const retrievalCache = new Map();
  const retrievalMetrics = { queries: 0, cacheHits: 0, postgresQueries: 0, fallbackQueries: 0, totalElapsedMs: 0, maxElapsedMs: 0, last: null };
  const operationMetrics = new Map();
  let lastReadBenchmark = null;
  const invalidateDocumentIndexCache = () => { documentIndexCache = { expiresAt: 0, rows: [] }; };
  const invalidateCorpusCache = () => {
    corpusRevision += 1;
    corpusCache = { expiresAt: 0, revision: corpusRevision, rows: [] };
    invalidateDocumentIndexCache();
    clausePageCache.clear();
    distilledPageCache.clear();
    retrievalCache.clear();
  };
  const recordOperationMetric = (name, elapsedMs, cacheHit = false) => {
    const current = operationMetrics.get(name) || { count: 0, cacheHits: 0, totalElapsedMs: 0, maxElapsedMs: 0, lastElapsedMs: 0 };
    current.count += 1;
    if (cacheHit) current.cacheHits += 1;
    current.totalElapsedMs += elapsedMs;
    current.maxElapsedMs = Math.max(current.maxElapsedMs, elapsedMs);
    current.lastElapsedMs = elapsedMs;
    operationMetrics.set(name, current);
  };
  const operationMetricSnapshot = () => Object.fromEntries([...operationMetrics].map(([name, item]) => [name, { ...item, averageElapsedMs: item.count ? Number((item.totalElapsedMs / item.count).toFixed(1)) : 0, cacheHitRate: item.count ? Number((item.cacheHits / item.count).toFixed(3)) : 0 }]));
  const recordRetrievalMetric = (metric) => {
    retrievalMetrics.queries += 1;
    if (metric.cacheHit) retrievalMetrics.cacheHits += 1;
    if (metric.storage === "postgres") retrievalMetrics.postgresQueries += 1;
    else retrievalMetrics.fallbackQueries += 1;
    retrievalMetrics.totalElapsedMs += Number(metric.elapsedMs || 0);
    retrievalMetrics.maxElapsedMs = Math.max(retrievalMetrics.maxElapsedMs, Number(metric.elapsedMs || 0));
    retrievalMetrics.last = { ...metric, at: nowIso() };
  };
  const getSearchMetrics = () => ({ ...retrievalMetrics, averageElapsedMs: retrievalMetrics.queries ? Math.round(retrievalMetrics.totalElapsedMs / retrievalMetrics.queries) : 0, cacheHitRate: retrievalMetrics.queries ? Number((retrievalMetrics.cacheHits / retrievalMetrics.queries).toFixed(3)) : 0, corpusRevision });
  const getPerformanceMetrics = () => ({ operations: operationMetricSnapshot(), search: getSearchMetrics(), caches: { documentIndex: documentIndexCache.expiresAt > Date.now() ? 1 : 0, clausePages: clausePageCache.size, knowledgePages: distilledPageCache.size, retrievals: retrievalCache.size }, lastBenchmark: lastReadBenchmark, measuredAt: nowIso() });
  const durationSummary = (values = []) => {
    const sorted = values.slice().sort((left, right) => left - right);
    const percentile = (ratio) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] : 0;
    return { count: sorted.length, averageMs: sorted.length ? Number((sorted.reduce((sum, item) => sum + item, 0) / sorted.length).toFixed(1)) : 0, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: sorted.at(-1) || 0 };
  };

  const resolveOriginalPath = (document = {}) => {
    const relative = String(document.metadata?.originalRelativePath || "").replace(/\\/g, "/");
    if (!relative || relative.includes("..")) return "";
    const resolved = path.resolve(originalDir, relative);
    const root = path.resolve(originalDir) + path.sep;
    return resolved.startsWith(root) ? resolved : "";
  };
  const bundledPython = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
  const bundledPdfToPpm = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "poppler", "Library", "bin", "pdftoppm.exe");
  const pythonCommand = () => String(process.env.QMS_PYTHON || (process.platform === "win32" && existsSync(bundledPython) ? bundledPython : process.platform === "win32" ? "py" : "python3"));
  const pythonArgs = (script, args) => process.platform === "win32" && pythonCommand().toLowerCase() === "py" ? ["-3", script, ...args] : [script, ...args];
  const renderCommand = () => String(process.env.QMS_PDFTOPPM || (process.platform === "win32" && existsSync(bundledPdfToPpm) ? bundledPdfToPpm : "pdftoppm"));
  const ocrAvailable = () => process.platform === "win32";

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
      const temporary = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(store), "utf8");
      for (let attempt = 0; ; attempt += 1) {
        try { await fs.rename(temporary, filePath); break; }
        catch (error) {
          if (!["EPERM", "EBUSY", "EACCES"].includes(error?.code)) throw error;
          if (attempt >= 4) { await fs.copyFile(temporary, filePath); await fs.unlink(temporary).catch(() => {}); break; }
          await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
        }
      }
    });
    return fallbackWrite;
  };
  const mutateFallback = async (mutator) => {
    const previous = fallbackMutationLocks.get(filePath) || Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const store = await readFallback();
      const outcome = await mutator(store);
      await writeFallback(outcome?.store || store);
      return outcome?.value;
    });
    fallbackMutationLocks.set(filePath, operation);
    return operation;
  };
  const upsertFallback = (items, next, key = "id") => [next, ...items.filter((item) => item[key] !== next[key])];

  const persistDocument = async (document) => {
    await mutateFallback((store) => {
      store.documents = upsertFallback(store.documents, document);
      return { store };
    });
    await writePostgresKnowledgeDocument(document);
    invalidateDocumentIndexCache();
    return document;
  };
  const persistJob = async (job) => {
    await mutateFallback((store) => {
      store.jobs = upsertFallback(store.jobs, job);
      return { store };
    });
    await writePostgresKnowledgeJob(job);
    return job;
  };
  const updateDocument = async (id, patch) => {
    const document = await getDocument(id);
    if (!document) return null;
    const next = { ...document, ...patch };
    if (patch.governanceStatus != null && !governanceStatuses.has(String(patch.governanceStatus))) {
      throw new Error(`无效的知识文档状态：${patch.governanceStatus}`);
    }
    if (patch.sourceLevel != null && !sourceLevels.has(String(patch.sourceLevel).toUpperCase())) {
      throw new Error(`无效的资料等级：${patch.sourceLevel}`);
    }
    next.sourceLevel = String(next.sourceLevel || "C").toUpperCase();
    next.governanceStatus = governanceStatuses.has(String(next.governanceStatus)) ? String(next.governanceStatus) : "待登记";
    return persistDocument({ ...next, updatedAt: nowIso(), storage: undefined });
  };
  const updateJob = async (id, patch) => {
    const jobs = await listJobs();
    const current = jobs.find((job) => job.id === id);
    if (!current) return null;
    const next = await mutateFallback((store) => {
      const latest = store.jobs.find((job) => job.id === id) || current;
      const guardedPatch = ["paused", "cancelled"].includes(latest.status) && patch.status === "running" ? { ...patch, status: latest.status, message: latest.message, result: latest.result } : patch;
      const value = { ...latest, ...guardedPatch, progress: clampProgress(guardedPatch.progress ?? latest.progress), updatedAt: nowIso(), storage: undefined };
      store.jobs = upsertFallback(store.jobs, value);
      return { store, value };
    });
    await writePostgresKnowledgeJob(next);
    if (next.jobType === "distill") {
      const status = ["failed", "completed"].includes(next.status) ? "completed" : "distilling";
      await updateDocument(next.documentId, { status, progress: next.progress, message: next.message, errorMessage: next.errorMessage || "" });
    }
    return next;
  };

  const listDocuments = async () => {
    const startedAt = performance.now();
    if (documentIndexCache.expiresAt > Date.now()) {
      recordOperationMetric("document_index", Math.round(performance.now() - startedAt), true);
      return documentIndexCache.rows;
    }
    const postgres = await listPostgresKnowledgeDocuments();
    const storedDocuments = postgres.available && postgres.documents.length ? postgres.documents : (await readFallback()).documents.map(({ sourceText, ...item }) => ({ ...item, storage: "json" }));
    const documents = storedDocuments.filter((document) => {
      if (!document.metadata?.originalStored) return true;
      const originalPath = resolveOriginalPath(document);
      return Boolean(originalPath && existsSync(originalPath));
    });
    const rows = await Promise.all(documents.map(async (document) => {
      const knowledge = await listPostgresDistilledKnowledge(document.id, { limit: 10000, offset: 0 });
      const items = knowledge.available ? (knowledge.knowledge || []) : (await readFallback()).knowledge.filter((item) => item.documentId === document.id);
      const publishedKnowledgeCount = items.filter((item) => item.publicationStatus === "published").length;
      const pendingKnowledgeCount = items.filter((item) => ["candidate", "approved"].includes(item.publicationStatus)).length;
      return decorateDocumentGovernance({ ...document, distillationCount: items.length || Number(document.distillationCount || 0), metadata: { ...(document.metadata || {}), publishedKnowledgeCount, pendingKnowledgeCount } });
    }));
    documentIndexCache = { expiresAt: Date.now() + 5000, rows };
    recordOperationMetric("document_index", Math.round(performance.now() - startedAt), false);
    return rows;
  };
  const getDocument = async (id) => {
    const postgres = await readPostgresKnowledgeDocument(id);
    const document = postgres.available && postgres.found ? postgres.document : (await readFallback()).documents.find((item) => item.id === id) || null;
    return document ? decorateDocumentGovernance(document) : null;
  };
  const compactKnowledgeJob = (job) => {
    const batches = Array.isArray(job.result?.batches) ? job.result.batches : [];
    const batchSummary = { total: batches.length, pending: 0, running: 0, completed: 0, failed: 0 };
    batches.forEach((batch) => { if (batchSummary[batch.status] != null) batchSummary[batch.status] += 1; });
    return { ...job, result: { schemaVersion: job.result?.schemaVersion, model: job.result?.model || "", totalClauses: job.result?.totalClauses || 0, totalBatches: job.result?.totalBatches || batches.length, knowledgeCount: job.result?.knowledgeCount || 0, batchChars: job.result?.batchChars || 0, maxBatchClauses: job.result?.maxBatchClauses || 0, maxRetries: job.result?.maxRetries ?? 0, batchSummary, logs: (job.result?.logs || []).slice(-3) } };
  };
  const listJobs = async (documentId = "", options = {}) => {
    const postgres = await listPostgresKnowledgeJobs(documentId);
    const jobs = postgres.available && postgres.jobs.length ? postgres.jobs : (await readFallback()).jobs.filter((job) => !documentId || job.documentId === documentId);
    return options.compact ? jobs.map(compactKnowledgeJob) : jobs;
  };
  const getJob = async (id) => (await listJobs()).find((job) => job.id === id) || null;
  const deleteJob = async (id) => {
    const job = await getJob(id);
    if (!job) return false;
    if (job.status === "running") throw new Error("任务正在运行，请先停止任务再删除");
    const wasQueued = queue.some((item) => item.jobId === id);
    queue = queue.filter((item) => item.jobId !== id);
    if (wasQueued || job.status === "waiting") deletedJobIds.add(id);
    await mutateFallback((store) => {
      store.jobs = store.jobs.filter((item) => item.id !== id);
      return { store };
    });
    await deletePostgresKnowledgeJob(id);
    const document = await getDocument(job.documentId);
    if (document && ["waiting", "paused"].includes(job.status)) {
      await updateDocument(job.documentId, job.jobType === "distill"
        ? { status: "completed", progress: 100, message: "蒸馏任务已删除；原始证据和已有知识保留" }
        : { status: "registered", progress: 0, message: "后台解析任务已删除；原文件保留，可重新解析" });
    }
    return true;
  };

  const recordAudit = async (payload = {}) => {
    const createdAt = nowIso();
    const log = { id: cleanText(payload.id) || stableId("audit", `${createdAt}:${payload.action || "event"}:${payload.entityType || "knowledge"}:${payload.entityId || ""}:${randomUUID()}`), action: cleanText(payload.action || "event"), entityType: cleanText(payload.entityType || "knowledge"), entityId: cleanText(payload.entityId), actor: cleanText(payload.actor), actorIp: cleanText(payload.actorIp), summary: cleanText(payload.summary).slice(0, 1000), beforeState: payload.beforeState && typeof payload.beforeState === "object" ? payload.beforeState : {}, afterState: payload.afterState && typeof payload.afterState === "object" ? payload.afterState : {}, metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}, createdAt };
    await mutateFallback((store) => { store.auditLogs = [log, ...(store.auditLogs || []).filter((item) => item.id !== log.id)].slice(0, 5000); return { store }; });
    await writePostgresKnowledgeAuditLog(log);
    return log;
  };
  const listAuditLogs = async (options = {}) => {
    const postgres = await listPostgresKnowledgeAuditLogs(options);
    if (postgres.available) return postgres;
    const limit = Math.min(1000, Math.max(1, Number(options.limit || 200)));
    const logs = ((await readFallback()).auditLogs || []).filter((item) => (!options.entityType || item.entityType === options.entityType) && (!options.entityId || item.entityId === options.entityId) && (!options.action || item.action === options.action)).slice(0, limit);
    return { logs, storage: "json" };
  };
  const listConflicts = async (options = {}) => {
    const postgres = await listPostgresKnowledgeConflicts(options);
    if (postgres.available && postgres.conflicts.length) return postgres;
    const limit = Math.min(500, Math.max(1, Number(options.limit || 200)));
    const conflicts = ((await readFallback()).conflicts || []).filter((item) => !options.status || item.status === options.status).sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))).slice(0, limit);
    return { conflicts, storage: "json" };
  };

  const finishEvidenceJob = async ({ document, jobId, jobType, clauses, pages = [], reviewRequired = false, message }) => {
    const completedAt = nowIso();
    const ocrPages = pages.filter((page) => page.ocrStatus === "completed").length;
    const reviewPages = pages.filter((page) => page.reviewStatus === "pending" || page.reviewStatus === "required").length;
    const failedPages = pages.filter((page) => page.ocrStatus === "failed" || page.ocrStatus === "unavailable").length;
    const status = reviewRequired ? "review_required" : "completed";
    const metadata = {
      ...(document.metadata || {}),
      pageCount: Number(document.metadata?.pageCount || pages.length || 0),
      processedPageCount: pages.length,
      nativePageCount: pages.filter((page) => page.ocrStatus === "native").length,
      ocrPageCount: ocrPages,
      reviewPageCount: reviewPages,
      failedPageCount: failedPages,
      ocrPageNumbers: pages.filter((page) => page.ocrStatus === "completed").map((page) => page.page),
      reviewPageNumbers: pages.filter((page) => page.reviewStatus === "pending" || page.reviewStatus === "required").map((page) => page.page),
      failedPageNumbers: pages.filter((page) => page.ocrStatus === "failed" || page.ocrStatus === "unavailable").map((page) => page.page),
      reviewStatus: reviewRequired ? "required" : reviewPages ? "pending" : "not_required",
      evidenceSchemaVersion: document.contentType === "pdf" ? "qms-pdf-evidence-v1" : "qms-media-evidence-v1",
    };
    const completedDocument = {
      ...document,
      status,
      governanceStatus: reviewRequired ? "待解析" : "已解析",
      progress: reviewRequired ? 95 : 100,
      message,
      clauseCount: clauses.length,
      segmentCount: clauses.length,
      preview: clauses[0]?.clauseText?.slice(0, 1200) || document.preview,
      metadata,
      errorMessage: reviewRequired ? `${failedPages} 页未完成OCR，需要重试或人工处理` : "",
      updatedAt: completedAt,
    };
    const completedJob = {
      ...(await listJobs(document.id)).find((job) => job.id === jobId),
      id: jobId,
      documentId: document.id,
      jobType,
      status: reviewRequired ? "review_required" : "completed",
      progress: reviewRequired ? 95 : 100,
      message,
      skillId: "",
      result: { clauseCount: clauses.length, pageCount: pages.length, ocrPages, reviewPages, failedPages },
      errorMessage: reviewRequired ? `${failedPages} 页未完成OCR` : "",
      completedAt,
      updatedAt: completedAt,
    };
    const store = await readFallback();
    store.clauses = [...clauses, ...store.clauses.filter((clause) => clause.documentId !== document.id)];
    store.documents = upsertFallback(store.documents, completedDocument);
    store.jobs = upsertFallback(store.jobs, completedJob);
    await writeFallback(store);
    await writePostgresKnowledgeDocument(completedDocument);
    await replacePostgresKnowledgeClauses(completedDocument, clauses);
    await writePostgresKnowledgeJob(completedJob);
    invalidateCorpusCache();
    return { completedDocument, completedJob };
  };

  const runWindowsOcr = async (imagePath, workDir, outputName = "ocr") => {
    const outputPath = path.join(workDir, `${outputName}.ocr.json`);
    await runProcess("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptDir, "windows-knowledge-ocr.ps1"), "-ImagePath", imagePath, "-OutputPath", outputPath]);
    try {
      const payload = JSON.parse(await fs.readFile(outputPath, "utf8"));
      return { ...payload, text: normalizeOcrText(payload.text || "") };
    } finally {
      await fs.unlink(outputPath).catch(() => {});
    }
  };

  const runPdfOcr = async (document, page, workDir) => {
    const sourcePath = resolveOriginalPath(document);
    if (!sourcePath) throw new Error("PDF原文件路径无效");
    if (!ocrAvailable()) return { ...page, text: "", ocrStatus: "unavailable", reviewStatus: "required", errorMessage: "当前服务器不是Windows，无法调用Windows中文OCR" };
    const prefix = path.join(workDir, `page-${String(page.page).padStart(5, "0")}`);
    const imagePath = `${prefix}.png`;
    try {
      await runProcess(renderCommand(), ["-f", String(page.page), "-l", String(page.page), "-r", "180", "-png", "-singlefile", sourcePath, prefix]);
      const ocr = await runWindowsOcr(imagePath, workDir, `page-${page.page}`);
      const text = ocr.text;
      if (!text) return { ...page, text: "", ocrStatus: "failed", reviewStatus: "required", errorMessage: "OCR未识别出可用文字" };
      return { ...page, text, ocrStatus: "completed", reviewStatus: "pending", ocrPixelSize: [ocr.width, ocr.height], ocrLines: ocr.lines || [], errorMessage: "" };
    } catch (error) {
      return { ...page, text: "", ocrStatus: "failed", reviewStatus: "required", errorMessage: String(error?.message || error).slice(0, 500) };
    } finally {
      await fs.unlink(imagePath).catch(() => {});
    }
  };

  const processImageDocument = async (document, jobId) => {
    const sourcePath = resolveOriginalPath(document);
    if (!sourcePath) throw new Error("图片原文件未保存到服务端");
    await updateJob(jobId, { status: "running", progress: 10, message: "正在读取图片并准备中文OCR", startedAt: nowIso(), errorMessage: "" });
    await updateDocument(document.id, { status: "parsing", governanceStatus: "待解析", progress: 10, message: "正在读取图片并准备中文OCR", errorMessage: "" });
    if (!ocrAvailable()) {
      return finishEvidenceJob({ document, jobId, jobType: "image_parse", clauses: [], pages: [{ page: 1, ocrStatus: "unavailable", reviewStatus: "required" }], reviewRequired: true, message: "图片原件已保存；当前服务器无Windows中文OCR，需要Worker处理" });
    }
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "qms-image-"));
    try {
      const ocr = await runWindowsOcr(sourcePath, workDir, "image");
      await updateJob(jobId, { status: "running", progress: 80, message: "正在生成图片区域证据" });
      const clauses = buildImageEvidenceClauses(document, ocr, { locatorType: "image-region", locator: document.name, sourceFormat: "image" });
      const reviewRequired = clauses.length === 0;
      return finishEvidenceJob({ document, jobId, jobType: "image_parse", clauses, pages: [{ page: 1, ocrStatus: clauses.length ? "completed" : "failed", reviewStatus: clauses.length ? "pending" : "required" }], reviewRequired, message: reviewRequired ? "图片OCR未提取出可用文字，需人工复核" : `图片OCR完成：${clauses.length} 条区域证据，待人工复核` });
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  const processPptDocument = async (document, jobId) => {
    const sourcePath = resolveOriginalPath(document);
    if (!sourcePath) throw new Error("PPTX原文件未保存到服务端");
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "qms-pptx-"));
    const outputPath = path.join(workDir, "presentation.json");
    const mediaDir = path.join(workDir, "media");
    try {
      await updateJob(jobId, { status: "running", progress: 8, message: "正在提取幻灯片文字和嵌入图片", startedAt: nowIso(), errorMessage: "" });
      await updateDocument(document.id, { status: "parsing", governanceStatus: "待解析", progress: 8, message: "正在提取幻灯片文字和嵌入图片", errorMessage: "" });
      const script = path.join(scriptDir, "knowledge-pptx-extract.py");
      await runProcess(pythonCommand(), pythonArgs(script, [sourcePath, outputPath, mediaDir]));
      const extracted = JSON.parse(await fs.readFile(outputPath, "utf8"));
      const slides = Array.isArray(extracted.slides) ? extracted.slides : [];
      const images = slides.flatMap((slide) => (slide.images || []).map((image) => ({ ...image, slide: slide.slide })));
      const clauses = buildPptTextEvidenceClauses(document, slides);
      const imageStates = [];
      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        const extension = path.extname(image.path || "").toLowerCase();
        const baseState = { page: Number(image.slide || 0), slide: Number(image.slide || 0), mediaName: image.mediaName || "", cropBox: image.cropBox || [] };
        if (!ocrAvailable()) {
          imageStates.push({ ...baseState, ocrStatus: "unavailable", reviewStatus: "required", errorMessage: "当前服务器不是Windows，嵌入图片需Windows OCR Worker处理" });
          continue;
        }
        if (!new Set([".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff"]).has(extension)) {
          imageStates.push({ ...baseState, ocrStatus: "unavailable", reviewStatus: "required", errorMessage: `暂不支持${extension || "未知"}图片OCR` });
          continue;
        }
        try {
          const ocr = await runWindowsOcr(image.path, workDir, `slide-${image.slide}-image-${index + 1}`);
          const imageClauses = buildImageEvidenceClauses(document, ocr, {
            locatorType: "ppt-image",
            locator: `幻灯片 ${image.slide} · ${image.name || image.mediaName || `图片 ${index + 1}`}`,
            sourceFormat: "pptx-image",
            slide: Number(image.slide || 0),
            image: image.mediaName || "",
            slideCropBox: image.cropBox || [],
            slideSize: extracted.slideSize || [],
            slideCoordinateUnit: "EMU",
          });
          clauses.push(...imageClauses);
          imageStates.push({ ...baseState, ocrStatus: imageClauses.length ? "completed" : "failed", reviewStatus: imageClauses.length ? "pending" : "required", errorMessage: imageClauses.length ? "" : "OCR未识别出可用文字" });
        } catch (error) {
          imageStates.push({ ...baseState, ocrStatus: "failed", reviewStatus: "required", errorMessage: String(error?.message || error).slice(0, 500) });
        }
        const progress = Math.round(25 + (index + 1) / Math.max(1, images.length) * 60);
        await updateJob(jobId, { status: "running", progress, message: `正在处理幻灯片图片 ${index + 1}/${images.length}` });
      }
      clauses.forEach((clause, index) => { clause.ordinal = index + 1; });
      const failedImages = imageStates.filter((item) => ["failed", "unavailable"].includes(item.ocrStatus)).length;
      const reviewRequired = failedImages > 0 || clauses.length === 0;
      const message = reviewRequired
        ? `已提取 ${clauses.length} 条PPT证据；${failedImages} 张图片需Windows OCR或人工复核`
        : `PPT解析完成：${clauses.length} 条证据${images.length ? `，${images.length} 张图片OCR待人工复核` : ""}`;
      return finishEvidenceJob({
        document: { ...document, metadata: { ...(document.metadata || {}), slideCount: slides.length, pageCount: slides.length, embeddedImageCount: images.length, slideSize: extracted.slideSize || [] } },
        jobId,
        jobType: "ppt_parse",
        clauses,
        pages: imageStates,
        reviewRequired,
        message,
      });
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  const processPdfDocument = async (document, jobId) => {
    const sourcePath = resolveOriginalPath(document);
    if (!sourcePath) throw new Error("PDF原文件未保存到服务端，无法执行页面解析");
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "qms-pdf-"));
    const outputPath = path.join(workDir, "pages.json");
    try {
      await updateJob(jobId, { status: "running", progress: 5, message: "正在检查PDF原生文字层", startedAt: nowIso(), errorMessage: "" });
      await updateDocument(document.id, { status: "parsing", governanceStatus: "待解析", progress: 5, message: "正在检查PDF原生文字层", errorMessage: "" });
      const script = path.join(scriptDir, "knowledge-pdf-extract.py");
      await runProcess(pythonCommand(), pythonArgs(script, [sourcePath, outputPath]));
      const extracted = JSON.parse(await fs.readFile(outputPath, "utf8"));
      const pages = Array.isArray(extracted.pages) ? extracted.pages : [];
      await updateDocument(document.id, { progress: 20, message: `原生文字检查完成，共 ${extracted.pageCount || pages.length} 页`, metadata: { ...(document.metadata || {}), pageCount: Number(extracted.pageCount || pages.length) } });
      const processed = [];
      const ocrTargets = pages.filter((page) => page.needsOcr);
      let ocrDone = 0;
      for (const page of pages) {
        if (!page.needsOcr) {
          processed.push({ ...page, ocrStatus: "native", reviewStatus: "not_required" });
          continue;
        }
        processed.push(await runPdfOcr(document, page, workDir));
        ocrDone += 1;
        if (ocrDone === ocrTargets.length || ocrDone % 5 === 0) {
          const progress = Math.round(20 + ocrDone / Math.max(1, ocrTargets.length) * 60);
          const message = `正在执行Windows中文OCR ${ocrDone}/${ocrTargets.length} 页`;
          await updateJob(jobId, { status: "running", progress, message });
          await updateDocument(document.id, { status: "parsing", progress, message });
        }
      }
      await updateJob(jobId, { status: "running", progress: 85, message: "正在分块、合并并去除重复证据" });
      const clauses = buildPdfEvidenceClauses(document, processed);
      const unavailable = processed.filter((page) => ["failed", "unavailable"].includes(page.ocrStatus)).length;
      const ocrCompleted = processed.filter((page) => page.ocrStatus === "completed").length;
      const reviewRequired = unavailable > 0 || clauses.length === 0;
      const message = reviewRequired
        ? `已保存 ${clauses.length} 条证据；${unavailable} 页OCR未完成，需重试或人工复核`
        : `PDF解析完成：${clauses.length} 条证据，${ocrCompleted} 页OCR${ocrCompleted ? "待人工复核" : ""}`;
      await finishEvidenceJob({ document: { ...document, metadata: { ...(document.metadata || {}), pageCount: Number(extracted.pageCount || pages.length) } }, jobId, jobType: "pdf_parse", clauses, pages: processed, reviewRequired, message });
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  const distillationLog = (result = {}, message, level = "info") => ({
    ...result,
    logs: [...(Array.isArray(result.logs) ? result.logs : []), { at: nowIso(), level, message: cleanText(message).slice(0, 500) }].slice(-100),
  });
  const loadDistillationClauses = async (documentId) => {
    const maximum = Math.max(100, Number(process.env.QMS_KNOWLEDGE_DISTILL_MAX_CLAUSES || 5000));
    const clauses = [];
    let offset = 0;
    let total = 0;
    do {
      const page = await listClauses(documentId, { limit: 500, offset });
      total = Number(page.total || 0);
      clauses.push(...(page.clauses || []));
      offset += page.clauses?.length || 0;
      if (clauses.length > maximum) throw new Error(`条款数量 ${total} 超过单任务上限 ${maximum}，请拆分文档后蒸馏`);
    } while (offset < total);
    return clauses;
  };
  const createDistillationBatches = (clauses, options = {}) => {
    const batchChars = Math.min(20000, Math.max(3000, Number(options.batchChars || process.env.QMS_KNOWLEDGE_DISTILL_BATCH_CHARS || 12000)));
    const maxBatchClauses = Math.min(100, Math.max(5, Number(options.maxBatchClauses || process.env.QMS_KNOWLEDGE_DISTILL_BATCH_CLAUSES || 50)));
    const batches = [];
    let current = [];
    let size = 0;
    for (const clause of clauses) {
      const rowSize = String(clause.clauseText || "").length + 180;
      if (current.length && (size + rowSize > batchChars || current.length >= maxBatchClauses)) {
        batches.push(current);
        current = [];
        size = 0;
      }
      current.push(clause);
      size += rowSize;
    }
    if (current.length) batches.push(current);
    return { batchChars, maxBatchClauses, batches: batches.map((items, index) => ({ id: stableId("batch", items.map((item) => item.id).join("|")), index, clauseIds: items.map((item) => item.id), inputHash: createHash("sha256").update(JSON.stringify(items.map((item) => [item.id, item.clauseText]))).digest("hex"), status: "pending", attempts: 0, knowledge: [], errorMessage: "", startedAt: null, completedAt: null })) };
  };
  const processDistillationJobInner = async (document, jobId, controller) => {
    if (typeof aiComplete !== "function" || typeof loadSkillContent !== "function") throw new Error("服务端知识蒸馏尚未配置AI调用和Skill读取器");
    let job = (await listJobs(document.id)).find((item) => item.id === jobId);
    if (!job || ["paused", "cancelled", "completed"].includes(job.status)) return;
    const skillId = job.skillId || "quality-knowledge-distillation";
    const skillContent = await loadSkillContent(skillId);
    if (!skillContent) throw new Error(`未找到知识蒸馏Skill：${skillId}`);
    const clauses = await loadDistillationClauses(document.id);
    if (!clauses.length) throw new Error("没有可蒸馏的规范条款");
    const configured = createDistillationBatches(clauses, job.result || {});
    const existing = new Map((job.result?.batches || []).map((item) => [item.id, item]));
    const batches = configured.batches.map((item) => ({ ...item, ...(existing.get(item.id) || {}), status: existing.get(item.id)?.status === "running" ? "pending" : existing.get(item.id)?.status || "pending" }));
    const maxRetries = Math.min(5, Math.max(0, Number(job.result?.maxRetries ?? process.env.QMS_KNOWLEDGE_DISTILL_RETRIES ?? 2)));
    let result = distillationLog({ ...(job.result || {}), schemaVersion: "qms-distillation-job-v2", batchChars: configured.batchChars, maxBatchClauses: configured.maxBatchClauses, maxRetries, totalClauses: clauses.length, totalBatches: batches.length, batches }, `准备蒸馏 ${clauses.length} 条条款，共 ${batches.length} 批`);
    job = (await listJobs(document.id)).find((item) => item.id === jobId);
    if (!job || controller.signal.aborted || ["paused", "cancelled", "completed"].includes(job.status)) return;
    await updateJob(jobId, { status: "running", progress: Math.max(5, job.progress || 5), message: `准备蒸馏 ${clauses.length} 条条款，共 ${batches.length} 批`, result, startedAt: job.startedAt || nowIso(), errorMessage: "", completedAt: null });
    const clauseById = new Map(clauses.map((item) => [item.id, item]));
    for (let index = 0; index < batches.length; index += 1) {
      job = (await listJobs(document.id)).find((item) => item.id === jobId);
      if (!job || ["paused", "cancelled"].includes(job.status)) return;
      const batch = batches[index];
      if (batch.status === "completed") continue;
      const sourceRows = batch.clauseIds.map((id) => clauseById.get(id)).filter(Boolean).map((clause) => ({ clauseId: clause.id, clauseNumber: clause.clauseNumber || "", sectionPath: clause.sectionPath || "", text: clause.clauseText }));
      let completed = false;
      while (!completed && batch.attempts <= maxRetries) {
        batch.attempts += 1;
        batch.status = "running";
        batch.startedAt ||= nowIso();
        batch.errorMessage = "";
        result = distillationLog({ ...result, batches: [...batches] }, `第 ${index + 1}/${batches.length} 批开始，第 ${batch.attempts} 次尝试`);
        const progress = Math.round(8 + batches.filter((item) => item.status === "completed").length / Math.max(1, batches.length) * 82);
        await updateJob(jobId, { status: "running", progress, message: `正在蒸馏第 ${index + 1}/${batches.length} 批条款`, result });
        try {
          const ai = await aiComplete({ messages: [{ role: "system", content: `严格执行以下知识蒸馏Skill。只允许使用用户提供的公司规范条款；输出纯JSON。\n\n${skillContent.slice(0, 30000)}` }, { role: "user", content: `来源文档：${document.name}\n版本：${document.version || "未标注"}\n这是第 ${index + 1}/${batches.length} 批条款。按Skill输出 {"knowledge": [...]}。每个知识点必须引用本批次存在的clauseId，并逐字给出原文quote。\n\n条款：\n${JSON.stringify(sourceRows)}` }], maxTokens: 5000, signal: controller.signal, operation: "knowledge-distillation" });
          if (controller.signal.aborted) { const aborted = new Error("stopped"); aborted.name = "AbortError"; throw aborted; }
          batch.knowledge = parseAiKnowledgePayload(ai.content);
          batch.status = "completed";
          batch.completedAt = nowIso();
          batch.model = ai.model || "";
          batch.usage = ai.usage || null;
          completed = true;
          result = distillationLog({ ...result, model: ai.model || result.model || "", batches: [...batches] }, `第 ${index + 1}/${batches.length} 批完成，提取 ${batch.knowledge.length} 条知识点`);
          await updateJob(jobId, { status: "running", progress: Math.round(8 + batches.filter((item) => item.status === "completed").length / batches.length * 82), message: `已完成 ${batches.filter((item) => item.status === "completed").length}/${batches.length} 批`, result });
        } catch (error) {
          const latest = (await listJobs(document.id)).find((item) => item.id === jobId);
          if (latest?.status === "paused" || latest?.status === "cancelled") {
            batch.status = "pending";
            batch.errorMessage = "";
            result = distillationLog({ ...result, batches: [...batches] }, "任务已停止；当前批次将在继续后重新执行", "warning");
            await updateJob(jobId, { status: latest.status, progress: latest.progress, message: latest.message, result });
            return;
          }
          batch.errorMessage = String(error?.message || error).slice(0, 1000);
          batch.status = batch.attempts > maxRetries ? "failed" : "pending";
          result = distillationLog({ ...result, batches: [...batches] }, `第 ${index + 1}/${batches.length} 批失败：${batch.errorMessage}`, "error");
          await updateJob(jobId, { status: "running", message: batch.status === "failed" ? `第 ${index + 1} 批失败，继续处理其余批次` : `第 ${index + 1} 批失败，准备重试`, result, errorMessage: batch.errorMessage });
        }
      }
    }
    const failed = batches.filter((item) => item.status === "failed");
    if (failed.length) {
      result = distillationLog({ ...result, batches: [...batches] }, `${failed.length} 个批次失败；可只重试失败批次`, "error");
      await updateJob(jobId, { status: "failed", progress: Math.round(batches.filter((item) => item.status === "completed").length / batches.length * 90), message: `${failed.length} 个批次失败；已完成批次已保留`, result, errorMessage: failed.map((item) => `批次${item.index + 1}：${item.errorMessage}`).join("；").slice(0, 2000), completedAt: nowIso() });
      return;
    }
    const knowledge = deduplicateKnowledge(batches.flatMap((item) => item.knowledge || []));
    await updateJob(jobId, { status: "running", progress: 94, message: "正在校验逐字引用并写入知识库", result: distillationLog({ ...result, batches: [...batches] }, "全部批次完成，开始引用校验和入库") });
    await saveDistillation(document.id, { jobId, skillId, knowledge });
  };

  const processDistillationJob = async (document, jobId) => {
    const controller = new AbortController();
    distillationControllers.set(jobId, controller);
    try { return await processDistillationJobInner(document, jobId, controller); }
    finally {
      if (distillationControllers.get(jobId) === controller) distillationControllers.delete(jobId);
    }
  };

  const runQueue = async () => {
    if (queueRunning) return;
    queueRunning = true;
    while (queue.length) {
      const { documentId, jobId, jobType = "parse" } = queue.shift();
      if (deletedJobIds.delete(jobId)) continue;
      const document = await getDocument(documentId);
      if (!document || deletedJobIds.delete(jobId)) continue;
      try {
        if (jobType === "distill") {
          await processDistillationJob(document, jobId);
          continue;
        }
        if (jobType === "pdf_parse") {
          await processPdfDocument(document, jobId);
          continue;
        }
        if (jobType === "image_parse") {
          await processImageDocument(document, jobId);
          continue;
        }
        if (jobType === "ppt_parse") {
          await processPptDocument(document, jobId);
          continue;
        }
        const startedAt = nowIso();
        await persistJob({ ...(await listJobs(documentId)).find((job) => job.id === jobId), id: jobId, documentId, jobType: "parse", status: "running", progress: 15, message: "正在识别章节与条款编号", skillId: "", result: {}, errorMessage: "", createdAt: startedAt, startedAt, completedAt: null, updatedAt: startedAt });
        await updateDocument(documentId, { status: "parsing", governanceStatus: "待解析", progress: 15, message: "正在识别章节与条款编号", errorMessage: "" });
        const clauses = document.contentType === "video-transcript" ? buildTimedEvidenceClauses(document) : splitQualityClauses(document);
        await updateDocument(documentId, { status: "indexing", progress: 70, message: `正在建立 ${clauses.length} 条规范索引` });
        await finishEvidenceJob({ document, jobId, jobType: "parse", clauses, message: `已解析 ${clauses.length} 条规范条款` });
      } catch (error) {
        const message = String(error?.message || error || "条款解析失败").slice(0, 500);
        if (jobType === "distill") {
          const currentJob = (await listJobs(documentId)).find((job) => job.id === jobId);
          await updateJob(jobId, { status: "failed", progress: currentJob?.progress || 94, message: "知识蒸馏校验失败，可重新执行", errorMessage: message, completedAt: nowIso() });
          continue;
        }
        await updateDocument(documentId, { status: "failed", progress: 0, message: "条款解析失败，可重新尝试", errorMessage: message });
        await updateJob(jobId, { status: "failed", progress: 0, message: "条款解析失败，可重新尝试", errorMessage: message, completedAt: nowIso() });
      }
    }
    queueRunning = false;
  };
  const enqueueParse = async (documentId, existingJobId = "") => {
    const document = await getDocument(documentId);
    if (!document) throw new Error("知识文件不存在");
    const isPdf = document.contentType === "pdf" && Boolean(resolveOriginalPath(document));
    const isImage = document.contentType === "image" && Boolean(resolveOriginalPath(document));
    const isPpt = document.contentType === "ppt" && Boolean(resolveOriginalPath(document));
    const jobType = isPdf ? "pdf_parse" : isImage ? "image_parse" : isPpt ? "ppt_parse" : "parse";
    if (queue.some((item) => item.documentId === documentId)) return (await listJobs(documentId)).find((job) => job.jobType === jobType && ["waiting", "running"].includes(job.status));
    const job = { id: existingJobId || randomUUID(), documentId, jobType, status: "waiting", progress: 0, message: isPdf ? "等待PDF页面解析" : isImage ? "等待图片OCR解析" : isPpt ? "等待PPT幻灯片解析" : "等待条款解析", skillId: "", result: {}, errorMessage: "", createdAt: nowIso(), startedAt: null, completedAt: null, updatedAt: nowIso() };
    await persistJob(job);
    await updateDocument(documentId, { status: "waiting", governanceStatus: "待解析", progress: 0, message: job.message, errorMessage: "" });
    queue.push({ documentId, jobId: job.id, jobType });
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
    const inputMetadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
    const accessLevel = knowledgeAccessLevels.has(payload.accessLevel || inputMetadata.accessLevel) ? payload.accessLevel || inputMetadata.accessLevel : /客户|客诉|保密/.test(`${payload.category || ""} ${payload.name || ""}`) ? "restricted" : "internal";
    const metadata = { ...inputMetadata, accessLevel };
    const sourceLevel = String(payload.sourceLevel || metadata.sourceLevel || "C").trim().toUpperCase();
    if (!sourceLevels.has(sourceLevel)) throw new Error("资料等级必须为 A、B 或 C");
    const governanceStatus = String(payload.governanceStatus || metadata.governanceStatus || "待登记").trim();
    if (!governanceStatuses.has(governanceStatus)) throw new Error(`无效的知识文档状态：${governanceStatus}`);
    const document = {
      id: String(payload.id || randomUUID()),
      name: String(payload.name || "未命名规范").trim(),
      category: String(payload.category || "未分类"),
      contentType: String(payload.contentType || "text"),
      fileHash,
      version: String(payload.version || metadata.version || ""),
      sourceLevel,
      sourceCategory: String(payload.sourceCategory || metadata.sourceCategory || "").trim(),
      publisher: String(payload.publisher || metadata.publisher || "").trim(),
      edition: String(payload.edition || metadata.edition || "").trim(),
      effectiveStatus: String(payload.effectiveStatus || metadata.effectiveStatus || "active").trim(),
      applicableScope: String(payload.applicableScope || metadata.applicableScope || "").trim(),
      copyrightStatus: String(payload.copyrightStatus || metadata.copyrightStatus || "").trim(),
      owner: String(payload.owner || metadata.owner || "").trim(),
      reviewDue: String(payload.reviewDue || metadata.reviewDue || "").trim(),
      governanceStatus,
      status: payload.registerOnly ? "registered" : "waiting",
      progress: 0,
      message: payload.registerOnly ? String(metadata.parseAdvice || "文件已登记，等待后续解析") : "等待条款解析",
      segmentCount: Number(payload.segmentCount || payload.segments?.length || 0),
      clauseCount: 0,
      distillationCount: 0,
      size: Number(payload.size || 0),
      preview: sourceText.slice(0, 1200),
      sourceText,
      metadata,
      errorMessage: "",
      importedAt,
      updatedAt: importedAt,
    };
    await persistDocument(document);
    await recordAudit({ action: "import", entityType: "document", entityId: document.id, actor: payload.actor || metadata.uploadedBy || "", actorIp: payload.actorIp || "", summary: `导入知识文件：${document.name}`, afterState: { name: document.name, version: document.version, sourceLevel: document.sourceLevel, accessLevel } });
    invalidateCorpusCache();
    const job = payload.registerOnly && !(["pdf", "image", "ppt"].includes(document.contentType) && resolveOriginalPath(document))
      ? await persistJob({ id: randomUUID(), documentId: document.id, jobType: "ocr", status: "waiting", progress: 0, message: "等待后台OCR或页面级解析", skillId: "", result: {}, errorMessage: "", createdAt: nowIso(), startedAt: null, completedAt: null, updatedAt: nowIso() })
      : await enqueueParse(document.id);
    return { document: { ...document, sourceText: undefined }, job, duplicate: false };
  };

  const deleteDocument = async (id, audit = {}) => {
    queue = queue.filter((item) => item.documentId !== id);
    const existingDocument = await getDocument(id);
    const store = await readFallback();
    const deleted = store.documents.some((item) => item.id === id);
    store.documents = store.documents.filter((item) => item.id !== id);
    store.clauses = store.clauses.filter((item) => item.documentId !== id);
    store.jobs = store.jobs.filter((item) => item.documentId !== id);
    store.knowledge = store.knowledge.filter((item) => item.documentId !== id);
    store.matches = (store.matches || []).filter((item) => item.documentId !== id);
    await writeFallback(store);
    await deletePostgresKnowledgeDocument(id);
    if (existingDocument) await recordAudit({ action: "delete", entityType: "document", entityId: id, actor: audit.actor || "", actorIp: audit.actorIp || "", summary: `删除知识文件：${existingDocument.name}`, beforeState: { name: existingDocument.name, version: existingDocument.version, governanceStatus: existingDocument.governanceStatus } });
    invalidateCorpusCache();
    retrievalCache.clear();
    return deleted;
  };
  const reviewDocument = async (id, payload = {}) => {
    const document = await getDocument(id);
    if (!document) return null;
    const reviewStatus = String(payload.reviewStatus || "").trim();
    if (!["pending", "approved", "rejected"].includes(reviewStatus)) throw new Error("人工复核状态必须是pending、approved或rejected");
    if (reviewStatus === "approved" && !Number(document.clauseCount || 0)) throw new Error("当前文档没有可审核的证据片段");
    const reviewedAt = nowIso();
    const metadata = {
      ...(document.metadata || {}),
      reviewStatus,
      reviewedAt,
      reviewedBy: cleanText(payload.reviewer || ""),
      reviewNote: cleanText(payload.reviewNote || "").slice(0, 2000),
    };
    const next = await updateDocument(id, {
      metadata,
      status: reviewStatus === "approved" ? "completed" : reviewStatus === "rejected" ? "review_required" : document.status,
      progress: reviewStatus === "approved" ? 100 : document.progress,
      message: reviewStatus === "approved" ? "人工复核已通过，证据片段可用" : reviewStatus === "rejected" ? "人工复核未通过，请重新解析" : document.message,
    });
    await recordAudit({ action: reviewStatus === "approved" ? "review_approve" : reviewStatus === "rejected" ? "review_reject" : "review_pending", entityType: "document", entityId: id, actor: payload.reviewer || payload.actor || "", actorIp: payload.actorIp || "", summary: `${document.name}：${reviewStatus}`, beforeState: { reviewStatus: document.metadata?.reviewStatus || "" }, afterState: { reviewStatus } });
    invalidateCorpusCache();
    return next;
  };
  const updateDocumentMetadata = async (id, payload = {}) => {
    const document = await getDocument(id);
    if (!document) return null;
    const patch = {};
    ["version", "sourceCategory", "publisher", "edition", "applicableScope", "copyrightStatus", "owner", "reviewDue"].forEach((key) => {
      if (payload[key] !== undefined) patch[key] = cleanText(payload[key]).slice(0, 1000);
    });
    if (payload.sourceLevel !== undefined) patch.sourceLevel = String(payload.sourceLevel || "").trim().toUpperCase();
    if (payload.effectiveStatus !== undefined) patch.effectiveStatus = cleanText(payload.effectiveStatus).slice(0, 80);
    if (payload.accessLevel !== undefined || payload.replacesDocumentId !== undefined) patch.metadata = { ...(document.metadata || {}), ...(payload.accessLevel !== undefined ? { accessLevel: knowledgeAccessLevels.has(payload.accessLevel) ? payload.accessLevel : "internal" } : {}), ...(payload.replacesDocumentId !== undefined ? { replacesDocumentId: cleanText(payload.replacesDocumentId) } : {}) };
    const next = await updateDocument(id, patch);
    await recordAudit({ action: "modify", entityType: "document", entityId: id, actor: payload.actor || "", actorIp: payload.actorIp || "", summary: `修改知识文件信息：${document.name}`, beforeState: { version: document.version, owner: document.owner, reviewDue: document.reviewDue, accessLevel: document.accessLevel }, afterState: { version: next.version, owner: next.owner, reviewDue: next.reviewDue, accessLevel: next.accessLevel } });
    invalidateCorpusCache();
    return next;
  };
  const listClauses = async (documentId, options = {}) => {
    const startedAt = performance.now();
    const offset = Math.max(0, Number(options.offset || 0));
    const limit = Math.min(1000, Math.max(1, Number(options.limit || 100)));
    const query = cleanText(options.query).toLowerCase();
    const cacheKey = `${documentId}:${limit}:${offset}:${query}`;
    const cached = clausePageCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      recordOperationMetric("clause_page", Math.round(performance.now() - startedAt), true);
      return cached.value;
    }
    const postgres = await listPostgresKnowledgeClauses(documentId, options);
    let result = postgres;
    if (!postgres.available) {
      const all = (await readFallback()).clauses.filter((item) => item.documentId === documentId && (!query || item.searchText?.toLowerCase().includes(query))).sort((a, b) => a.ordinal - b.ordinal);
      result = { clauses: all.slice(offset, offset + limit).map((item) => ({ ...item, evidenceType: item.metadata?.sourceFormat || "text", sourceHash: item.metadata?.sourceHash || "", sourceLocation: item.metadata?.sourceLocation || {}, ocrStatus: item.metadata?.ocrStatus || "not_required" })), total: all.length, storage: "json" };
    }
    clausePageCache.set(cacheKey, { expiresAt: Date.now() + 30000, value: result });
    if (clausePageCache.size > 300) clausePageCache.delete(clausePageCache.keys().next().value);
    recordOperationMetric("clause_page", Math.round(performance.now() - startedAt), false);
    return result;
  };
  const queueDistillation = (documentId, jobId) => {
    if (!queue.some((item) => item.jobId === jobId)) queue.push({ documentId, jobId, jobType: "distill" });
    setImmediate(() => runQueue().catch((error) => console.error("Knowledge distillation queue failed", error)));
  };
  const startDistillation = async (documentId, skillId, options = {}) => {
    const document = await getDocument(documentId);
    if (!document || !document.clauseCount) throw new Error("请等待规范条款解析完成后再蒸馏");
    if (Number(document.metadata?.reviewPageCount || 0) > 0 && document.metadata?.reviewStatus !== "approved") throw new Error("OCR或媒体证据尚未完成人工复核，不能进入知识蒸馏");
    const active = (await listJobs(documentId)).find((item) => item.jobType === "distill" && ["waiting", "running", "paused"].includes(item.status));
    if (active) return active;
    const timestamp = nowIso();
    const job = { id: randomUUID(), documentId, jobType: "distill", status: "waiting", progress: 2, message: "等待服务端分批蒸馏", skillId: String(skillId || "quality-knowledge-distillation"), result: { schemaVersion: "qms-distillation-job-v2", batchChars: Number(options.batchChars || 0) || undefined, maxBatchClauses: Number(options.maxBatchClauses || 0) || undefined, maxRetries: Number(options.maxRetries ?? 2), batches: [], logs: [{ at: timestamp, level: "info", message: "任务已创建，等待服务端执行" }] }, errorMessage: "", createdAt: timestamp, startedAt: null, completedAt: null, updatedAt: timestamp };
    await persistJob(job);
    await updateDocument(documentId, { status: "distilling", progress: 2, message: "等待服务端分批蒸馏", errorMessage: "" });
    queueDistillation(documentId, job.id);
    return job;
  };
  const controlDistillationJob = async (jobId, action) => {
    const job = (await listJobs()).find((item) => item.id === jobId);
    if (!job || job.jobType !== "distill") throw new Error("知识蒸馏任务不存在");
    const normalizedAction = action === "stop" ? "pause" : cleanText(action);
    if (normalizedAction === "finalize") {
      const batches = job.result?.batches || [];
      if (!batches.length || batches.some((batch) => batch.status !== "completed")) throw new Error("只有全部AI批次已完成的任务才能离线重新校验入库");
      await saveDistillation(job.documentId, { jobId, skillId: job.skillId, knowledge: deduplicateKnowledge(batches.flatMap((batch) => batch.knowledge || [])) });
      return await getJob(jobId);
    }
    if (normalizedAction === "pause") {
      if (!["waiting", "running"].includes(job.status)) return job;
      const next = await updateJob(jobId, { status: "paused", message: "任务已停止；已完成批次保留，可继续执行", result: distillationLog(job.result, "管理员停止任务；已完成批次保留", "warning"), errorMessage: "", completedAt: null });
      distillationControllers.get(jobId)?.abort();
      for (let attempt = 0; attempt < 300 && distillationControllers.has(jobId); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return next;
    }
    if (!["resume", "retry_failed"].includes(normalizedAction)) throw new Error("不支持的蒸馏任务操作");
    const batches = (job.result?.batches || []).map((batch) => {
      if (normalizedAction === "retry_failed" && batch.status === "failed") return { ...batch, status: "pending", attempts: 0, errorMessage: "", startedAt: null, completedAt: null };
      if (normalizedAction === "resume" && batch.status === "running") return { ...batch, status: "pending", errorMessage: "" };
      return batch;
    });
    if (normalizedAction === "retry_failed" && !batches.some((item) => item.status === "pending")) throw new Error("当前任务没有失败批次需要重试");
    const result = distillationLog({ ...(job.result || {}), batches }, normalizedAction === "retry_failed" ? "只重试失败批次" : "继续执行未完成批次");
    const next = await updateJob(jobId, { status: "waiting", message: normalizedAction === "retry_failed" ? "失败批次已重新排队" : "未完成批次已重新排队", result, errorMessage: "", completedAt: null });
    queueDistillation(job.documentId, job.id);
    return next;
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
    const document = await getDocument(documentId);
    if (!document) throw new Error("知识文件不存在");
    const clauseById = new Map(clauseRows.map((clause) => [clause.id, clause]));
    const audit = { inputCount: Array.isArray(knowledge) ? knowledge.length : 0, acceptedCount: 0, rejectedCount: 0, issues: [] };
    const verified = (Array.isArray(knowledge) ? knowledge : []).map((item, index) => {
      const citations = Array.isArray(item.sourceCitations) ? item.sourceCitations : [];
      const validCitations = citations.map((citation) => {
        const clause = clauseById.get(String(citation.clauseId || ""));
        const quote = String(citation.quote || "").trim();
        if (!clause || !quote || !String(clause.clauseText || "").includes(quote)) return null;
        const location = clause.sourceLocation || clause.metadata?.sourceLocation || {};
        return { ...citation, clauseId: clause.id, clauseNumber: citation.clauseNumber || clause.clauseNumber || "", sectionPath: citation.sectionPath || clause.sectionPath || "", page: citation.page || location.page || undefined, cropBox: citation.cropBox || location.cropBox || undefined, ocrStatus: citation.ocrStatus || clause.ocrStatus || clause.metadata?.ocrStatus || "not_required", reviewStatus: citation.reviewStatus || clause.metadata?.reviewStatus || "not_required", quote };
      }).filter(Boolean);
      if (!validCitations.length || validCitations.length !== citations.length) {
        audit.rejectedCount += 1;
        audit.issues.push({ index: index + 1, title: cleanText(item.title).slice(0, 120) || `知识点${index + 1}`, reason: !citations.length ? "缺少sourceCitations" : "存在无效或非连续逐字引用" });
        return null;
      }
      audit.acceptedCount += 1;
      const ocrNeedsReview = validCitations.some((citation) => citation.ocrStatus === "completed" && citation.reviewStatus !== "approved");
      return { ...item, confidence: ocrNeedsReview ? Math.min(0.7, Number(item.confidence ?? 0.7)) : item.confidence, mustReview: item.mustReview === true || ocrNeedsReview, sourceCitations: validCitations };
    }).filter(Boolean);
    if (audit.rejectedCount && !verified.length) throw new Error(`逐字引用校验失败：${audit.rejectedCount} 条知识点未通过；${audit.issues.slice(0, 3).map((item) => `${item.title}（${item.reason}）`).join("、")}`);
    const normalized = normalizeKnowledge(document, skillId || "quality-knowledge-distillation", verified);
    if (!normalized.length) throw new Error("蒸馏结果没有通过原文引用校验，请重新生成或检查规范文本");
    const blockedByReview = normalized.some((item) => item.metadata?.mustReview);
    normalized.forEach((item) => { if (blockedByReview || item.metadata?.mustReview) item.publicationStatus = "candidate"; });
    const store = await readFallback();
    store.knowledge = [...normalized, ...store.knowledge.filter((item) => item.documentId !== documentId || item.skillId !== skillId)];
    const fallbackDocument = store.documents.find((item) => item.id === documentId);
    const completionMessage = `已蒸馏 ${normalized.length} 条知识点${audit.rejectedCount ? `，剔除 ${audit.rejectedCount} 条无效引用` : ""}，等待人工审核`;
    if (fallbackDocument) store.documents = upsertFallback(store.documents, { ...fallbackDocument, status: "completed", governanceStatus: "候选知识", progress: 100, message: completionMessage, distillationCount: normalized.length, errorMessage: "", updatedAt: nowIso() });
    await writeFallback(store);
    await replacePostgresDistilledKnowledge(documentId, skillId, normalized);
    invalidateCorpusCache();
    if (jobId) {
      const currentJob = (await listJobs(documentId)).find((item) => item.id === jobId);
      const compactBatches = (currentJob?.result?.batches || []).map(({ knowledge: batchKnowledge = [], ...batch }) => ({ ...batch, knowledgeCount: batchKnowledge.length, outputHash: batchKnowledge.length ? createHash("sha256").update(JSON.stringify(batchKnowledge)).digest("hex") : "" }));
      await updateJob(jobId, { status: "completed", progress: 100, message: completionMessage, result: distillationLog({ ...(currentJob?.result || {}), batches: compactBatches, knowledgeCount: normalized.length, citationAudit: audit }, audit.rejectedCount ? `引用校验完成，剔除 ${audit.rejectedCount} 条无效引用，其余知识已入库` : "引用校验和知识入库完成"), errorMessage: "", completedAt: nowIso() });
    }
    return normalized;
  };
  const listDistilled = async (documentId, options = {}) => {
    const startedAt = performance.now();
    const offset = Math.max(0, Number(options.offset || 0));
    const limit = Math.min(1000, Math.max(1, Number(options.limit || 100)));
    const cacheKey = `${documentId}:${limit}:${offset}`;
    const cached = distilledPageCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      recordOperationMetric("knowledge_page", Math.round(performance.now() - startedAt), true);
      return cached.value;
    }
    const postgres = await listPostgresDistilledKnowledge(documentId, options);
    let value = postgres;
    if (!postgres.available) {
      const all = (await readFallback()).knowledge.filter((item) => item.documentId === documentId);
      value = { knowledge: all.slice(offset, offset + limit), total: all.length, statusCounts: all.reduce((counts, item) => ({ ...counts, [item.publicationStatus || "candidate"]: Number(counts[item.publicationStatus || "candidate"] || 0) + 1 }), {}), storage: "json" };
    }
    distilledPageCache.set(cacheKey, { expiresAt: Date.now() + 30000, value });
    if (distilledPageCache.size > 300) distilledPageCache.delete(distilledPageCache.keys().next().value);
    recordOperationMetric("knowledge_page", Math.round(performance.now() - startedAt), false);
    return value;
  };

  const parseKnowledgeImport = (content, format = "json") => {
    const text = cleanText(content);
    if (!text) throw new Error("导入内容为空");
    if (format === "json") {
      let value;
      const jsonText = text.split("---QMS-MARKDOWN---")[0].trim();
      try { value = JSON.parse(jsonText); } catch {
        const match = jsonText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("知识JSON格式无效");
        try { value = JSON.parse(match[0]); } catch { throw new Error("知识JSON格式无效"); }
      }
      return Array.isArray(value) ? value : Array.isArray(value?.knowledge) ? value.knowledge : [];
    }
    const rows = [];
    const blocks = text.split(/(?=^##\s*知识点\s*\d*[:：])/m).filter((block) => /^##\s*知识点/m.test(block));
    blocks.forEach((block) => {
      const field = (label) => block.match(new RegExp(`^-\\s*${label}[：:]\\s*(.*)$`, "mi"))?.[1]?.trim() || "";
      const citations = [...block.matchAll(/^>\s*(?:[^｜|]*[｜|])?([^｜|\s]+)[｜|][^：:]*[：:](.+)$/gm)].map((match) => ({ clauseId: match[1].trim(), quote: match[2].trim() })).filter((item) => item.clauseId && item.quote);
      rows.push({ title: block.match(/^##\s*知识点\s*\d*[:：]\s*(.+)$/mi)?.[1]?.trim() || "", type: field("类型"), originalFact: field("原文事实"), engineeringExplanation: field("工程解释"), applicableScope: field("适用范围").split(/[、,，]/).map((item) => item.trim()).filter(Boolean), notApplicableScope: field("不适用范围").split(/[、,，]/).map((item) => item.trim()).filter(Boolean), reviewPoints: field("审查要点").split(/[、,，]/).map((item) => item.trim()).filter(Boolean), correctionActions: field("纠偏动作").split(/[、,，]/).map((item) => item.trim()).filter(Boolean), verification: field("验证证据").split(/[、,，]/).map((item) => item.trim()).filter(Boolean), content: field("规则") || field("内容") || field("原文事实"), sourceCitations: citations });
    });
    return rows;
  };

  const importDistillation = async (documentId, { content, format = "json", skillId = "quality-knowledge-distillation", jobId = "" } = {}) => {
    const document = await getDocument(documentId);
    if (!document) throw new Error("知识文件不存在");
    if (format === "json") {
      const jsonText = cleanText(content).split("---QMS-MARKDOWN---")[0].trim();
      let root = null;
      try { root = JSON.parse(jsonText); } catch { /* parseKnowledgeImport returns the detailed format error */ }
      if (root?.schemaVersion && root.schemaVersion !== "qms-knowledge-extraction-v1") throw new Error(`不支持的知识提取版本：${root.schemaVersion}`);
      if (root?.document?.documentId && root.document.documentId !== document.id) throw new Error("导入文件的documentId与当前知识文档不一致");
      if (root?.document?.fileHash && root.document.fileHash !== document.fileHash) throw new Error("导入文件的fileHash与当前原文件不一致");
      if (root?.document?.sourceLevel && String(root.document.sourceLevel).toUpperCase() !== String(document.sourceLevel || "C").toUpperCase()) throw new Error("导入文件的sourceLevel与当前知识文档不一致");
    }
    const knowledge = parseKnowledgeImport(content, format);
    if (!knowledge.length) throw new Error("未识别到知识点；JSON需包含knowledge数组，Markdown需使用“## 知识点”目录");
    return saveDistillation(documentId, { jobId, skillId, knowledge });
  };

  const reviewDistilledKnowledge = async (id, payload = {}) => {
    const action = String(payload.action || "").trim();
    if (!knowledgeReviewActions.has(action)) throw new Error("无效的知识审核动作");
    const all = (await readFallback()).knowledge || [];
    let current = all.find((item) => item.id === id);
    if (!current) {
      const postgres = await listPostgresDistilledKnowledge(String(payload.documentId || ""), { limit: 1000, offset: 0 });
      current = postgres.knowledge?.find((item) => item.id === id);
    }
    if (!current) return null;
    const document = await getDocument(current.documentId);
    if (!document) throw new Error("知识来源文档不存在");
    const reviewer = cleanText(payload.reviewer || "");
    const reviewedAt = nowIso();
    const changed = action === "return" ? applyKnowledgeReviewChanges(current, payload.changes) : current;
    if (!changed.title || !changed.content) throw new Error("知识标题和知识内容不能为空");
    const next = { ...changed, reviewStatus: action === "reject" || action === "return" ? "rejected" : action === "conflict" ? "rejected" : "approved", publicationStatus: action === "publish" ? "published" : action === "conflict" ? "conflict" : action === "reject" || action === "return" ? "rejected" : "approved", publicationNote: cleanText(payload.note || "").slice(0, 2000), reviewedBy: reviewer, reviewedAt, updatedAt: reviewedAt };
    // 发布是人工复核后的明确动作。资料完整性、来源等级和冲突等问题由“退回修改”处理，
    // 不在最后一步重复设置发布门禁，避免出现“能退回但永远不能发布”的断点。
    const store = await readFallback();
    store.knowledge = (store.knowledge || []).map((item) => item.id === id ? next : item);
    await writeFallback(store);
    await updatePostgresDistilledKnowledge(next);
    if (action === "publish") {
      const postgresKnowledge = await listPostgresDistilledKnowledge(document.id, { limit: 10000, offset: 0 });
      const documentKnowledge = postgresKnowledge.available ? (postgresKnowledge.knowledge || []) : (await readFallback()).knowledge.filter((item) => item.documentId === document.id);
      const publishedCount = documentKnowledge.filter((item) => item.publicationStatus === "published").length;
      const pendingCount = documentKnowledge.filter((item) => ["candidate", "approved"].includes(item.publicationStatus)).length;
      await updateDocument(document.id, { governanceStatus: publishedCount ? "已发布" : "候选知识", message: `知识已发布 ${publishedCount} 条${pendingCount ? `，待确认 ${pendingCount} 条` : ""}`, metadata: { ...(document.metadata || {}), publishedKnowledgeCount: publishedCount, pendingKnowledgeCount: pendingCount } });
    }
    else if (action === "accept") await updateDocument(document.id, { governanceStatus: "待技术评审", message: "候选知识已初审，等待发布审核" });
    await recordAudit({ action: action === "publish" ? "publish" : action === "accept" ? "review_approve" : action === "conflict" ? "conflict_mark" : "review_reject", entityType: "knowledge", entityId: id, actor: reviewer, actorIp: payload.actorIp || "", summary: `${next.title}：${action}`, beforeState: { publicationStatus: current.publicationStatus }, afterState: { publicationStatus: next.publicationStatus, note: next.publicationNote }, metadata: { documentId: document.id } });
    for (const key of distilledPageCache.keys()) if (key.startsWith(`${document.id}:`)) distilledPageCache.delete(key);
    invalidateCorpusCache();
    return next;
  };
  const setDocumentConflict = async (documentId, conflictId, open) => {
    if (!documentId) return null;
    const document = await getDocument(documentId);
    if (!document) throw new Error("冲突关联的知识文档不存在");
    const currentIds = documentOpenConflictIds(document);
    const openConflictIds = open ? [...new Set([...currentIds, conflictId])] : currentIds.filter((id) => id !== conflictId);
    const metadata = { ...(document.metadata || {}), openConflictIds };
    if (open && !currentIds.length) metadata.governanceBeforeConflict = document.governanceStatus || "待技术评审";
    const governanceStatus = openConflictIds.length ? "待技术评审" : metadata.governanceBeforeConflict || document.governanceStatus || "待技术评审";
    if (!openConflictIds.length) delete metadata.governanceBeforeConflict;
    return updateDocument(documentId, { metadata, governanceStatus, message: openConflictIds.length ? `存在 ${openConflictIds.length} 条未关闭冲突，暂停正式使用` : "冲突评审已关闭，可按当前有效状态使用" });
  };
  const saveConflict = async (payload = {}) => {
    const timestamp = nowIso();
    const id = cleanText(payload.id) || stableId("conflict", `${payload.leftDocumentId || ""}:${payload.rightDocumentId || ""}:${payload.scope || ""}:${timestamp}:${randomUUID()}`);
    const previous = (await listConflicts({ limit: 500 })).conflicts.find((item) => item.id === id);
    const leftDocumentId = cleanText(payload.leftDocumentId || previous?.leftDocumentId);
    const rightDocumentId = cleanText(payload.rightDocumentId || previous?.rightDocumentId);
    if (!leftDocumentId || !rightDocumentId || leftDocumentId === rightDocumentId) throw new Error("冲突评审必须选择两个不同的知识文档");
    const status = new Set(["open", "resolved", "withdrawn"]).has(payload.status) ? payload.status : previous?.status || "open";
    const scope = cleanText(payload.scope || previous?.scope).slice(0, 2000);
    const issue = cleanText(payload.issue || previous?.issue).slice(0, 4000);
    const temporaryMeasure = cleanText(payload.temporaryMeasure || previous?.temporaryMeasure).slice(0, 3000);
    const owner = cleanText(payload.owner || previous?.owner).slice(0, 200);
    const dueDate = cleanText(payload.dueDate || previous?.dueDate);
    if (!scope || !issue || !temporaryMeasure || !owner || !dueDate) throw new Error("冲突评审必须填写适用范围、冲突说明、临时措施、Owner和完成日期");
    const decision = cleanText(payload.decision || previous?.decision);
    const resolution = cleanText(payload.resolution || previous?.resolution).slice(0, 4000);
    const decidedBy = cleanText(payload.decidedBy || payload.actor || previous?.decidedBy).slice(0, 200);
    if (status === "resolved" && (!new Set(["left", "right", "both_scoped"]).has(decision) || !resolution || !decidedBy)) throw new Error("关闭冲突前必须选择采用结论、填写决定说明和决定人");
    const conflict = { id, leftDocumentId, rightDocumentId, leftKnowledgeId: cleanText(payload.leftKnowledgeId || previous?.leftKnowledgeId), rightKnowledgeId: cleanText(payload.rightKnowledgeId || previous?.rightKnowledgeId), scope, issue, temporaryMeasure, owner, dueDate, status, decision: status === "resolved" ? decision : "", resolution: status === "resolved" ? resolution : "", createdBy: previous?.createdBy || cleanText(payload.createdBy || payload.actor), decidedBy: status === "resolved" ? decidedBy : "", decidedAt: status === "resolved" ? previous?.decidedAt || timestamp : null, metadata: { ...(previous?.metadata || {}), ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}) }, createdAt: previous?.createdAt || timestamp, updatedAt: timestamp };
    await mutateFallback((store) => { store.conflicts = [conflict, ...(store.conflicts || []).filter((item) => item.id !== id)]; return { store }; });
    await writePostgresKnowledgeConflict(conflict);
    const open = status === "open";
    await setDocumentConflict(leftDocumentId, id, open);
    await setDocumentConflict(rightDocumentId, id, open);
    await recordAudit({ action: open ? "conflict_open" : status === "resolved" ? "conflict_resolve" : "conflict_withdraw", entityType: "conflict", entityId: id, actor: payload.actor || decidedBy || conflict.createdBy, actorIp: payload.actorIp || "", summary: open ? `建立冲突评审：${scope}` : `关闭冲突评审：${decision || "withdrawn"}`, beforeState: previous || {}, afterState: conflict });
    invalidateCorpusCache();
    return conflict;
  };
  const setDocumentKnowledgeStatus = async (documentId, publicationStatus, actor = "") => {
    const page = await listDistilled(documentId, { limit: 1000, offset: 0 });
    const timestamp = nowIso();
    const changed = (page.knowledge || []).filter((item) => item.publicationStatus === "published" || item.publicationStatus === "approved").map((item) => ({ ...item, publicationStatus, publicationNote: publicationStatus === "superseded" ? `由版本治理操作标记失效（${actor || "管理员"}）` : item.publicationNote, reviewedBy: actor || item.reviewedBy, reviewedAt: timestamp, updatedAt: timestamp }));
    if (!changed.length) return;
    await mutateFallback((store) => { const byId = new Map(changed.map((item) => [item.id, item])); store.knowledge = (store.knowledge || []).map((item) => byId.get(item.id) || item); return { store }; });
    for (const item of changed) await updatePostgresDistilledKnowledge(item);
  };
  const governDocument = async (id, payload = {}) => {
    const document = await getDocument(id);
    if (!document) throw new Error("知识文件不存在");
    const action = cleanText(payload.action);
    const reviewer = cleanText(payload.reviewer || payload.actor);
    if (!reviewer) throw new Error("治理操作必须记录审核人");
    let next;
    if (action === "publish_version") {
      const failures = [];
      if (document.sourceLevel === "C") failures.push("C级资料只能作为经验参考");
      if (!document.fileHash) failures.push("缺少原始文件哈希");
      if (!document.version) failures.push("缺少版本");
      if (!document.owner) failures.push("缺少Owner");
      if (!document.reviewDue) failures.push("缺少下次复审日期");
      if (document.reviewState === "overdue") failures.push("复审日期已过期");
      if (documentOpenConflictIds(document).length) failures.push("存在未关闭冲突");
      const knowledge = await listDistilled(id, { limit: 1000, offset: 0 });
      if (!(knowledge.knowledge || []).some((item) => item.publicationStatus === "published")) failures.push("没有已审核发布的知识卡");
      if (failures.length) throw new Error(`版本发布门禁未通过：${failures.join("；")}`);
      const replacesDocumentId = cleanText(payload.replacesDocumentId || document.metadata?.replacesDocumentId);
      if (replacesDocumentId && replacesDocumentId !== id) {
        const previous = await getDocument(replacesDocumentId);
        if (!previous) throw new Error("选择的被替代版本不存在");
        await setDocumentKnowledgeStatus(previous.id, "superseded", reviewer);
        await updateDocument(previous.id, { effectiveStatus: "superseded", governanceStatus: "已废止", metadata: { ...(previous.metadata || {}), supersededByDocumentId: id, supersededAt: nowIso(), supersededBy: reviewer }, message: `已被 ${document.name} ${document.version} 替代；历史证据保留` });
        await recordAudit({ action: "supersede", entityType: "document", entityId: previous.id, actor: reviewer, actorIp: payload.actorIp || "", summary: `${previous.name} ${previous.version} 被 ${document.version} 替代`, beforeState: { effectiveStatus: previous.effectiveStatus }, afterState: { effectiveStatus: "superseded", supersededByDocumentId: id } });
      }
      next = await updateDocument(id, { effectiveStatus: "active", governanceStatus: "已发布", metadata: { ...(document.metadata || {}), replacesDocumentId, publishedAt: nowIso(), publishedBy: reviewer }, message: replacesDocumentId ? `版本已发布，并替代旧版 ${replacesDocumentId}` : "版本已发布" });
    } else if (action === "request_review") {
      next = await updateDocument(id, { governanceStatus: "待复审", message: "已进入复审，复审完成前不新增正式应用" });
    } else if (action === "complete_review") {
      const reviewDue = cleanText(payload.reviewDue);
      if (!reviewDue || dateTimestamp(reviewDue) <= Date.now()) throw new Error("复审完成后必须设置未来的下次复审日期");
      if (!cleanText(payload.note)) throw new Error("复审完成必须填写复审结论");
      next = await updateDocument(id, { reviewDue, effectiveStatus: "active", governanceStatus: "已发布", metadata: { ...(document.metadata || {}), lastReviewedAt: nowIso(), lastReviewedBy: reviewer, lastReviewNote: cleanText(payload.note).slice(0, 2000) }, message: `复审通过，下次复审 ${reviewDue}` });
    } else if (action === "retire") {
      const reason = cleanText(payload.reason || payload.note);
      if (!reason) throw new Error("废止必须填写原因");
      await setDocumentKnowledgeStatus(id, "superseded", reviewer);
      next = await updateDocument(id, { effectiveStatus: "obsolete", governanceStatus: "已废止", metadata: { ...(document.metadata || {}), retiredAt: nowIso(), retiredBy: reviewer, retiredReason: reason }, message: "已逻辑废止；原件、证据和历史引用继续保留" });
    } else throw new Error("不支持的知识治理操作");
    await recordAudit({ action: action === "publish_version" ? "publish_version" : action === "retire" ? "retire" : action, entityType: "document", entityId: id, actor: reviewer, actorIp: payload.actorIp || "", summary: `${document.name}：${action}`, beforeState: { version: document.version, effectiveStatus: document.effectiveStatus, governanceStatus: document.governanceStatus, reviewDue: document.reviewDue }, afterState: { version: next.version, effectiveStatus: next.effectiveStatus, governanceStatus: next.governanceStatus, reviewDue: next.reviewDue } });
    invalidateCorpusCache();
    return next;
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
    const threshold = Number(options.threshold || 80);
    const confirmedIssueIds = new Set((store.matches || []).filter((item) => item.status === "confirmed").map((item) => item.issueId));
    const matchedIssueIds = new Set((store.matches || []).filter((item) => item.status === status).map((item) => item.issueId));
    const all = (store.issues || []).filter((item) => {
      if (module && item.module !== module) return false;
      if (personName && item.personName !== personName) return false;
      if (query && !`${item.issueText} ${item.issueType} ${item.personName}`.toLowerCase().includes(query)) return false;
      const issueMatches = (store.matches || []).filter((match) => match.issueId === item.id);
      const maxScore = issueMatches.reduce((max, match) => Math.max(max, Number(match.score || 0)), 0);
      if (status === "failed" && issueMatches.length) return false;
      if (status === "low_threshold" && maxScore >= threshold) return false;
      if (status === "rejected" && !issueMatches.some((match) => match.status === "rejected")) return false;
      if (status === "confirmed" && !confirmedIssueIds.has(item.id)) return false;
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
    if (corpusCache.revision === corpusRevision && corpusCache.expiresAt > Date.now()) return corpusCache.rows;
    const documents = await listDocuments();
    const rows = [];
    for (const document of documents) {
      let offset = 0;
      let total = Number(document.distillationCount || 0);
      do {
        const page = await listDistilled(document.id, { limit: 500, offset });
        total = Number(page.total || 0);
        rows.push(...(page.knowledge || []).filter((item) => ["published", "approved", "candidate"].includes(item.publicationStatus)).map((item) => ({
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
          sourceLevel: item.sourceLevel || document.sourceLevel || "C",
          sourceCategory: document.sourceCategory || "",
          version: item.version || document.version || "",
          effectiveStatus: item.effectiveStatus || document.effectiveStatus || "active",
          governanceStatus: document.governanceStatus || "",
          reviewDue: document.reviewDue || "",
          openConflictCount: document.openConflictCount || documentOpenConflictIds(document).length,
          applicableScope: item.metadata?.applicableScope || (document.applicableScope ? [document.applicableScope] : []),
          notApplicableScope: item.metadata?.notApplicableScope || [],
          publicationStatus: item.publicationStatus || "candidate",
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
          sourceLevel: document.sourceLevel || "C",
          sourceCategory: document.sourceCategory || "",
          version: document.version || "",
          effectiveStatus: document.effectiveStatus || "active",
          governanceStatus: document.governanceStatus || "",
          reviewDue: document.reviewDue || "",
          openConflictCount: document.openConflictCount || documentOpenConflictIds(document).length,
          applicableScope: document.applicableScope ? [document.applicableScope] : [],
          notApplicableScope: [],
          publicationStatus: "clause_candidate",
        })));
        offset += page.clauses?.length || 0;
      } while (offset < total && offset < 5000);
    }
    corpusCache = { expiresAt: Date.now() + 30000, revision: corpusRevision, rows };
    return rows;
  };
  const listReviewPoints = async (options = {}) => {
    const module = cleanText(options.module).toUpperCase();
    const processFilter = cleanText(options.process).toLowerCase();
    const riskFilter = cleanText(options.risk).toLowerCase();
    const projectFilter = cleanText(options.project).toLowerCase();
    const stageFilter = cleanText(options.projectStage).toLowerCase();
    const brandModelFilter = cleanText(options.brandModel).toLowerCase();
    const query = cleanText(options.query).toLowerCase();
    const documents = await listDocuments();
    const rows = [];
    const moduleTerms = module === "IPQC" ? ["ipqc", "组装", "装配", "过程"] : module === "DQA" ? ["dqa", "研发", "设计", "评审"] : [];
    for (const document of documents) {
      if (["obsolete", "superseded", "expired"].includes(String(document.effectiveStatus || "").toLowerCase()) || document.governanceStatus === "已废止" || document.openConflictCount > 0 || document.reviewState === "overdue") continue;
      let offset = 0;
      let total = Number(document.distillationCount || 0);
      do {
        const page = await listDistilled(document.id, { limit: 500, offset });
        total = Number(page.total || 0);
        for (const item of page.knowledge || []) {
          if (item.publicationStatus !== "published") continue;
          const metadata = item.metadata || {};
          const points = Array.isArray(metadata.reviewPoints) && metadata.reviewPoints.length ? metadata.reviewPoints : item.type === "review_point" ? [item.content] : [];
          const searchable = `${document.name} ${document.category || ""} ${item.title} ${item.content} ${(item.processes || []).join(" ")} ${(item.applicableRoles || []).join(" ")}`.toLowerCase();
          if (moduleTerms.length && !moduleTerms.some((term) => searchable.includes(term))) continue;
          if (processFilter && !(item.processes || []).some((value) => String(value).toLowerCase().includes(processFilter)) && !searchable.includes(processFilter)) continue;
          const riskLevel = String(metadata.riskLevel || "unknown").toLowerCase();
          if (riskFilter && riskLevel !== riskFilter) continue;
          const projects = toArray(metadata.projects);
          const projectStages = toArray(metadata.projectStages);
          const brandModels = toArray(metadata.brandModels);
          const applicableScope = toArray(metadata.applicableScope);
          const contextText = `${searchable} ${projects.join(" ")} ${projectStages.join(" ")} ${brandModels.join(" ")} ${applicableScope.join(" ")}`.toLowerCase();
          if (projectFilter && !contextText.includes(projectFilter)) continue;
          if (stageFilter && !contextText.includes(stageFilter)) continue;
          if (brandModelFilter && !contextText.includes(brandModelFilter)) continue;
          for (const point of points) {
            const text = typeof point === "string" ? point.trim() : cleanText(point?.text || point?.point || point?.title);
            if (!text || (query && !`${searchable} ${text}`.toLowerCase().includes(query))) continue;
            rows.push({ id: `${item.id}:${rows.length}`, knowledgeId: item.id, documentId: document.id, documentName: document.name, category: document.category || "", title: item.title, reviewPoint: text, processes: item.processes || [], applicableRoles: item.applicableRoles || [], sourceLevel: item.sourceLevel || document.sourceLevel || "C", version: item.version || document.version || "", riskLevel, applicableScope, projects, projectStages, brandModels, sourceCitations: item.sourceCitations || [], publicationStatus: item.publicationStatus });
          }
        }
        offset += page.knowledge?.length || 0;
      } while (offset < total && offset < 5000);
    }
    const sorted = rows.sort((left, right) => `${left.documentName}${left.title}${left.reviewPoint}`.localeCompare(`${right.documentName}${right.title}${right.reviewPoint}`, "zh-CN"));
    const offset = Math.max(0, Number(options.offset || 0));
    const limit = Math.min(200, Math.max(1, Number(options.limit || 50)));
    return { reviewPoints: sorted.slice(offset, offset + limit), total: sorted.length, storage: "knowledge" };
  };
  const listMatches = async (issueId) => {
    const documents = await listDocuments();
    const activeDocumentIds = new Set(documents.map((document) => document.id));
    const publishedKnowledgeIds = new Set();
    for (const document of documents) {
      let offset = 0;
      let total = 0;
      do {
        const page = await listDistilled(document.id, { limit: 500, offset });
        total = Number(page.total || 0);
        for (const item of page.knowledge || []) if (item.publicationStatus === "published") publishedKnowledgeIds.add(item.id);
        offset += page.knowledge?.length || 0;
      } while (offset < total && offset < 5000);
    }
    const isValidMatch = (item) => item.candidateType === "knowledge" && activeDocumentIds.has(item.documentId) && publishedKnowledgeIds.has(item.knowledgeId);
    const postgres = await listPostgresKnowledgeMatches(issueId);
    if (postgres.available) return { ...postgres, matches: postgres.matches.filter(isValidMatch) };
    return { matches: (await readFallback()).matches.filter((item) => item.issueId === issueId && isValidMatch(item)).sort((left, right) => (left.status === "confirmed" ? -1 : 0) - (right.status === "confirmed" ? -1 : 0) || right.score - left.score), storage: "json" };
  };
  const runReadBenchmark = async (options = {}) => {
    const concurrency = Math.min(20, Math.max(1, Number(options.concurrency || 5)));
    const rounds = Math.min(20, Math.max(1, Number(options.rounds || 3)));
    const documents = await listDocuments();
    const targets = documents.filter((item) => Number(item.clauseCount || 0) > 0 || Number(item.distillationCount || 0) > 0).slice(0, 12);
    const issues = (await listIssues({ limit: 12, offset: 0 })).issues || [];
    const durations = { documentIndex: [], clausePage: [], knowledgePage: [], candidateSearch: [] };
    const measure = async (name, task) => {
      const startedAt = performance.now();
      await task();
      durations[name].push(Math.round(performance.now() - startedAt));
    };
    const workers = Array.from({ length: concurrency }, (_, worker) => (async () => {
      for (let round = 0; round < rounds; round += 1) {
        await measure("documentIndex", () => listDocuments());
        if (issues.length) await measure("candidateSearch", () => retrieveCandidates(issues[(worker + round) % issues.length]));
        if (!targets.length) continue;
        const target = targets[(worker + round) % targets.length];
        if (Number(target.clauseCount || 0) > 0) await measure("clausePage", () => listClauses(target.id, { limit: 24, offset: 0 }));
        if (Number(target.distillationCount || 0) > 0) await measure("knowledgePage", () => listDistilled(target.id, { limit: 24, offset: 0 }));
      }
    })());
    const startedAt = performance.now();
    await Promise.all(workers);
    lastReadBenchmark = { mode: "read_only", concurrency, rounds, targetDocuments: targets.length, targetIssues: issues.length, totalElapsedMs: Math.round(performance.now() - startedAt), documentIndex: durationSummary(durations.documentIndex), clausePage: durationSummary(durations.clausePage), knowledgePage: durationSummary(durations.knowledgePage), candidateSearch: durationSummary(durations.candidateSearch), completedAt: nowIso() };
    return { ...lastReadBenchmark, metrics: getPerformanceMetrics() };
  };
  const retrieveCandidates = async (issue) => {
    const terms = [...new Set([...(issue.tags || []), issue.issueType, ...searchTerms(`${issue.issueType || ""} ${issue.issueText || ""}`)].map((item) => cleanText(item).toLowerCase()).filter((item) => item.length >= 2))].slice(0, 32);
    const requestedVersion = cleanText(issue.metadata?.version || issue.metadata?.sourceVersion || issue.metadata?.documentVersion);
    const cacheKey = `${corpusRevision}:${issue.module}:${requestedVersion}:${normalizeSearchText(`${issue.issueType || ""}${issue.issueText || ""}${terms.join("|")}`)}`;
    const activeDocumentIds = new Set((await listDocuments()).map((document) => document.id));
    const onlyPublishedKnowledge = (items = []) => items.filter((candidate) => candidate.candidateType === "knowledge" && activeDocumentIds.has(candidate.documentId) && candidate.publicationStatus === "published");
    const cached = retrievalCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      cached.candidates = onlyPublishedKnowledge(cached.candidates);
      const metric = { storage: cached.storage, elapsedMs: 0, cacheHit: true, retrievedCount: cached.candidates.length, termCount: terms.length, strategy: cached.strategy };
      recordRetrievalMetric(metric);
      return { ...cached, cacheHit: true, elapsedMs: 0, terms };
    }
    const startedAt = performance.now();
    const postgres = await searchPostgresKnowledgeCandidates({ terms, moduleTerms: issue.module === "IPQC" ? ["IPQC", "组装", "装配", "过程"] : ["DQA", "研发", "设计", "评审"], version: requestedVersion, limit: 240 });
    let candidates = postgres.available ? postgres.candidates : await loadCorpus();
    candidates = onlyPublishedKnowledge(candidates);
    let storage = postgres.available ? "postgres" : "json";
    let strategy = postgres.available ? "模块/版本/状态预过滤 → 标签/全文索引召回 → 规则评分" : "JSON索引缓存 → 模块/版本/状态过滤 → 规则评分";
    // PostgreSQL's simple Chinese text parser can legitimately return zero
    // rows for a valid issue even when the local evidence corpus has matches.
    // Use the already-built local corpus only for that empty-result case so
    // matching remains available without making every request expensive.
    if (postgres.available && !candidates.some((candidate) => candidate.candidateType === "knowledge")) {
      candidates = onlyPublishedKnowledge(await loadCorpus());
      storage = "postgres+json-fallback";
      strategy = "PostgreSQL索引未召回 → 本地证据索引回退 → 规则评分";
    }
    const elapsedMs = Math.round(performance.now() - startedAt);
    const entry = { candidates, storage, strategy, expiresAt: Date.now() + 60000 };
    retrievalCache.set(cacheKey, entry);
    if (retrievalCache.size > 200) retrievalCache.delete(retrievalCache.keys().next().value);
    recordRetrievalMetric({ storage, elapsedMs, cacheHit: false, retrievedCount: candidates.length, termCount: terms.length, strategy });
    return { ...entry, cacheHit: false, elapsedMs, terms };
  };
  const generateMatches = async (issueId) => {
    const store = await readFallback();
    const issue = (store.issues || []).find((item) => item.id === issueId);
    if (!issue) throw new Error("质量问题不存在，请先同步问题数据");
    const retrieval = await retrieveCandidates(issue);
    const activeDocumentIds = new Set((await listDocuments()).map((document) => document.id));
    let corpus = retrieval.candidates.filter((candidate) => candidate.candidateType === "knowledge" && activeDocumentIds.has(candidate.documentId) && candidate.publicationStatus === "published");
    if (!corpus.length) {
      corpusCache.expiresAt = 0;
      const indexedKnowledge = await loadCorpus();
      corpus = indexedKnowledge.filter((candidate) => candidate.candidateType === "knowledge" && activeDocumentIds.has(candidate.documentId) && candidate.publicationStatus === "published");
    }
    if (!corpus.length) throw new Error("知识库尚无可检索条款，请先导入并解析规范");
    const generatedAt = nowIso();
    const matches = corpus.map((candidate) => {
      const eligibility = candidateEligibility(issue, candidate);
      if (!eligibility.eligible) return null;
      const result = candidateScore(issue, candidate, eligibility);
      if (result.evidence.objectMismatch) return null;
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
          sourceLevel: eligibility.sourceLevel,
          version: candidate.version || "",
          effectiveStatus: candidate.effectiveStatus || "active",
          scopeStatus: eligibility.scopeStatus,
          sourceKind: eligibility.sourceKind,
        },
        status: "candidate",
        reviewer: "",
        reviewedAt: null,
        createdAt: generatedAt,
        updatedAt: generatedAt,
      };
    }).filter(Boolean).filter((item) => item.score >= 12).sort((left, right) => right.score - left.score || (left.candidateType === "knowledge" ? -1 : 1)).slice(0, 8);
    const validCandidateKeys = new Set(matches.map((item) => item.candidateKey));
    const previous = new Map((store.matches || []).filter((item) => item.issueId === issue.id && item.candidateType === "knowledge" && activeDocumentIds.has(item.documentId) && validCandidateKeys.has(item.candidateKey)).map((item) => [item.candidateKey, item]));
    const matchAudit = {
      generatedAt,
      corpusCount: corpus.length,
      eligibleCount: matches.length,
      candidateCount: matches.length,
      filteredCount: corpus.length - matches.length,
      storage: retrieval.storage,
      elapsedMs: retrieval.elapsedMs,
      cacheHit: retrieval.cacheHit,
      termCount: retrieval.terms.length,
      corpusRevision,
      rule: `${retrieval.strategy} → 人工确认`,
    };
    const nextForIssue = matches.map((item) => {
      const old = previous.get(item.candidateKey);
      return old && old.status !== "candidate" ? { ...item, status: old.status, reviewer: old.reviewer, reviewedAt: old.reviewedAt, createdAt: old.createdAt } : item;
    });
    matchAudit.candidateCount = nextForIssue.length;
    store.matches = [...nextForIssue, ...(store.matches || []).filter((item) => item.issueId !== issue.id)];
    await writeFallback(store);
    const postgres = await replacePostgresKnowledgeMatches(issue.id, matches);
    if (postgres.available) {
      const publishedIds = new Set(corpus.map((item) => item.knowledgeId));
      return { ...postgres, matches: postgres.matches.filter((item) => item.candidateType === "knowledge" && activeDocumentIds.has(item.documentId) && publishedIds.has(item.knowledgeId)), audit: matchAudit };
    }
    return { matches: nextForIssue, storage: "json", audit: matchAudit };
  };
  const reviewMatch = async (id, payload = {}) => {
    const allowed = new Set(["candidate", "confirmed", "rejected"]);
    const status = allowed.has(payload.status) ? payload.status : "candidate";
    const store = await readFallback();
    const current = (store.matches || []).find((item) => item.id === id);
    if (!current) return null;
    if (status === "confirmed") {
      if (current.candidateType !== "knowledge" || !current.knowledgeId) throw new Error("原始条款只能作为候选证据，必须先蒸馏、审核并发布知识卡后才能正式采用");
      const knowledge = (store.knowledge || []).find((item) => item.id === current.knowledgeId) || (await listDistilled(current.documentId, { limit: 1000, offset: 0 })).knowledge.find((item) => item.id === current.knowledgeId);
      const document = await getDocument(current.documentId);
      if (!knowledge || knowledge.publicationStatus !== "published") throw new Error("只有已发布知识卡可以进入正式纠偏");
      if (!document || ["obsolete", "superseded", "expired"].includes(String(document.effectiveStatus || "").toLowerCase()) || document.governanceStatus === "已废止") throw new Error("知识来源版本已失效");
      if (document.openConflictCount > 0) throw new Error("知识来源存在未关闭冲突，暂时不能正式采用");
      if (document.reviewState === "overdue") throw new Error("知识来源已超过复审日期，暂时不能正式采用");
    }
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
    const validDocuments = new Set((await listDocuments()).filter((document) => !["obsolete", "superseded", "expired"].includes(String(document.effectiveStatus || "").toLowerCase()) && document.governanceStatus !== "已废止" && document.openConflictCount === 0 && document.reviewState !== "overdue").map((document) => document.id));
    if (postgres.available) return { ...postgres, matches: postgres.matches.filter((item) => validDocuments.has(item.documentId)) };
    const store = await readFallback();
    const issueById = new Map((store.issues || []).map((item) => [item.id, item]));
    const matches = (store.matches || []).filter((item) => {
      if (item.status !== "confirmed") return false;
      const issue = issueById.get(item.issueId);
      return validDocuments.has(item.documentId) && issue && (!options.module || issue.module === options.module) && (!options.personName || issue.personName === options.personName);
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
      action: item.action ? { basis: item.action.basis || [], deviation: item.action.deviation || "", rootCause: item.action.rootCause || "", scope: item.action.scope || "", fallbackPlan: item.action.fallbackPlan || "", actionType: item.action.actionType, owner: item.action.owner, dueDate: item.action.dueDate, implementedAt: item.action.implementedAt, observationUntil: item.action.observationUntil, status: item.action.status, effectiveness: item.action.effectiveness, verificationEvidence: item.action.verificationEvidence } : null,
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
    const status = statuses.has(payload.status) ? payload.status : "open";
    const actionType = actionTypes.has(payload.actionType) ? payload.actionType : "mixed";
    const actionText = cleanText(payload.actionText).slice(0, 4000);
    const owner = cleanText(payload.owner).slice(0, 200);
    const dueDate = cleanText(payload.dueDate);
    const deviation = cleanText(payload.deviation).slice(0, 3000);
    const rootCause = cleanText(payload.rootCause).slice(0, 3000);
    const scope = cleanText(payload.scope).slice(0, 2000);
    const fallbackPlan = cleanText(payload.fallbackPlan).slice(0, 2000);
    const verificationMethod = cleanText(payload.verificationMethod).slice(0, 2000);
    const verificationEvidence = cleanText(payload.verificationEvidence).slice(0, 4000);
    const basis = Array.isArray(payload.basis) ? payload.basis.filter((item) => item && typeof item === "object").slice(0, 20) : [];
    if (status !== "open") {
      const confirmed = await listConfirmedMatches({ module, personName, limit: 10000 });
      if (!(confirmed.matches || []).some((item) => item.candidateKey === candidateKey)) throw new Error("当前规范已失效、复审逾期或存在未关闭冲突，不能进入正式改善闭环");
    }
    if (status !== "open" && (!actionText || !owner || !dueDate)) throw new Error("进入实施或验证阶段前，必须填写改善措施、责任人和计划完成日期");
    if (status === "closed" && (!deviation || !rootCause || !scope || !fallbackPlan)) throw new Error("关闭闭环前，必须补齐偏差、根因、覆盖范围和失效回退");
    if (status === "closed" && (actionType === "training" || !verificationEvidence || !verificationMethod || effectiveness !== "effective")) throw new Error("关闭闭环必须有非培训类控制、验证方法、验证证据，并判定为有效");
    const observationUntil = cleanText(payload.observationUntil);
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
      basis: basis.length ? basis : [{ type: "confirmed-match", candidateKey }],
      deviation,
      rootCause,
      scope,
      fallbackPlan,
      actionType,
      actionText,
      owner,
      dueDate,
      implementedAt: cleanText(payload.implementedAt),
      verificationMethod,
      verificationEvidence,
      observationUntil,
      status,
      effectiveness,
      metadata: {
        ...(previous?.metadata || {}),
        ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
        ...((previous?.status === "closed" || previous?.effectiveness === "effective") && status === "open"
          ? { reopenedAt: timestamp, reopenReason: cleanText(payload.metadata?.reopenReason || "观察期复核无效或措施后复发") }
          : {}),
      },
      createdAt: previous?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const store = await readFallback();
    store.recurrenceActions = [action, ...(store.recurrenceActions || []).filter((item) => item.recurrenceKey !== recurrenceKey)];
    await writeFallback(store);
    const postgres = await writePostgresRecurrenceAction(action);
    return postgres.available ? postgres.action : action;
  };
  const listReviewSessions = async (options = {}) => {
    const postgres = await listPostgresKnowledgeReviewSessions(options);
    if (postgres.available) {
      if (!postgres.sessions.length) {
        const fallback = (await readFallback()).reviewSessions || [];
        const matching = fallback.filter((item) => (!options.module || item.module === options.module) && (!options.status || item.status === options.status));
        for (const session of matching) await writePostgresKnowledgeReviewSession(session);
        if (matching.length) return await listPostgresKnowledgeReviewSessions(options);
      }
      return postgres;
    }
    const limit = Math.min(500, Math.max(1, Number(options.limit || 100)));
    const sessions = ((await readFallback()).reviewSessions || [])
      .filter((item) => (!options.module || item.module === options.module) && (!options.status || item.status === options.status))
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
      .slice(0, limit);
    return { sessions, storage: "json" };
  };
  const saveReviewSession = async (payload = {}) => {
    const statusValues = new Set(["draft", "in_review", "blocked", "completed"]);
    let status = statusValues.has(payload.status) ? payload.status : "draft";
    const timestamp = nowIso();
    const id = cleanText(payload.id) || stableId("review", `${payload.module || "DQA"}:${payload.project || ""}:${payload.title || ""}:${timestamp}:${randomUUID()}`);
    const previous = (await listReviewSessions({ limit: 500 })).sessions.find((item) => item.id === id);
    const reviewPoints = (Array.isArray(payload.reviewPoints) ? payload.reviewPoints : []).slice(0, 300).map((item, index) => ({
      reviewPointId: cleanText(item.reviewPointId || item.id) || `${id}:point:${index + 1}`,
      knowledgeId: cleanText(item.knowledgeId),
      documentId: cleanText(item.documentId),
      title: cleanText(item.title).slice(0, 500),
      reviewPoint: cleanText(item.reviewPoint).slice(0, 2000),
      result: new Set(["pending", "pass", "fail", "na"]).has(item.result) ? item.result : "pending",
      note: cleanText(item.note).slice(0, 3000),
      owner: cleanText(item.owner).slice(0, 200),
      dueDate: cleanText(item.dueDate),
      evidence: cleanText(item.evidence).slice(0, 4000),
      sourceLevel: sourceLevels.has(item.sourceLevel) ? item.sourceLevel : "C",
    }));
    const title = cleanText(payload.title).slice(0, 500);
    const owner = cleanText(payload.owner).slice(0, 200);
    const reviewer = cleanText(payload.reviewer).slice(0, 200);
    const conclusion = cleanText(payload.conclusion).slice(0, 4000);
    if (status !== "draft" && (!title || !owner || !reviewer || !reviewPoints.length)) throw new Error("开始评审前必须填写标题、Owner、Reviewer并选择至少一个评审点");
    const failed = reviewPoints.filter((item) => item.result === "fail");
    if (failed.some((item) => !item.note || !item.owner || !item.dueDate)) throw new Error("不通过项必须填写问题说明、责任人和完成期限");
    if (status === "completed" && reviewPoints.some((item) => item.result === "pending")) throw new Error("完成评审前，所有评审点必须给出通过、不通过或不适用结论");
    if (status === "completed" && failed.length) status = "blocked";
    if (status === "completed" && !conclusion) throw new Error("完成评审前必须填写评审结论");
    const session = {
      id,
      module: String(payload.module || previous?.module || "DQA").toUpperCase() === "IPQC" ? "IPQC" : "DQA",
      title,
      project: cleanText(payload.project).slice(0, 500),
      projectStage: cleanText(payload.projectStage).slice(0, 200),
      brandModel: cleanText(payload.brandModel).slice(0, 300),
      riskLevel: cleanText(payload.riskLevel) || "unknown",
      owner,
      collaborators: toArray(payload.collaborators).slice(0, 30),
      reviewer,
      status,
      conclusion,
      reviewPoints,
      sourceKnowledgeIds: [...new Set(reviewPoints.map((item) => item.knowledgeId).filter(Boolean))],
      metadata: { ...(previous?.metadata || {}), ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}) },
      completedAt: status === "completed" ? previous?.completedAt || timestamp : null,
      createdAt: previous?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const store = await readFallback();
    store.reviewSessions = [session, ...(store.reviewSessions || []).filter((item) => item.id !== id)];
    await writeFallback(store);
    const postgres = await writePostgresKnowledgeReviewSession(session);
    return postgres.available ? postgres.session : session;
  };
  const listFeedbackRecords = async (options = {}) => {
    const postgres = await listPostgresKnowledgeFeedbackRecords(options);
    if (postgres.available) {
      if (!postgres.records.length) {
        const fallback = (await readFallback()).feedbackRecords || [];
        const matching = fallback.filter((item) => (!options.targetType || item.targetType === options.targetType) && (!options.status || item.status === options.status));
        for (const record of matching) await writePostgresKnowledgeFeedbackRecord(record);
        if (matching.length) return await listPostgresKnowledgeFeedbackRecords(options);
      }
      return postgres;
    }
    const limit = Math.min(500, Math.max(1, Number(options.limit || 200)));
    const records = ((await readFallback()).feedbackRecords || [])
      .filter((item) => (!options.targetType || item.targetType === options.targetType) && (!options.status || item.status === options.status))
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
      .slice(0, limit);
    return { records, storage: "json" };
  };
  const saveFeedbackRecord = async (payload = {}) => {
    const sourceType = new Set(["recurrence", "review"]).has(payload.sourceType) ? payload.sourceType : "";
    const sourceId = cleanText(payload.sourceId);
    const targetType = new Set(["checklist", "dfmea", "question_bank", "design_rule"]).has(payload.targetType) ? payload.targetType : "";
    const status = new Set(["candidate", "approved", "rejected", "applied"]).has(payload.status) ? payload.status : "candidate";
    if (!sourceType || !sourceId || !targetType) throw new Error("反哺记录必须指定来源和目标类型");
    const store = await readFallback();
    let source = null;
    let sourceKnowledgeIds = [];
    let evidence = [];
    if (sourceType === "recurrence") {
      source = (store.recurrenceActions || []).find((item) => item.recurrenceKey === sourceId);
      if (!source || source.status !== "closed" || source.effectiveness !== "effective") throw new Error("只有已关闭且验证有效的纠偏闭环才能形成正式反哺候选");
      sourceKnowledgeIds = cleanText(source.candidateKey).startsWith("knowledge:") ? [source.candidateKey.slice("knowledge:".length)] : [];
      evidence = [{ type: "verification", value: source.verificationEvidence || "" }, ...(source.basis || [])];
    } else {
      source = (store.reviewSessions || []).find((item) => item.id === sourceId);
      if (!source || source.status !== "completed") throw new Error("只有已完成的评审会话才能形成正式反哺候选");
      sourceKnowledgeIds = source.sourceKnowledgeIds || [];
      evidence = source.reviewPoints.filter((item) => item.evidence || item.note).map((item) => ({ reviewPointId: item.reviewPointId, result: item.result, note: item.note, evidence: item.evidence }));
    }
    const sourceLevelsById = new Map((store.knowledge || []).map((item) => [item.id, item.sourceLevel || "C"]));
    const hasLevelC = sourceKnowledgeIds.some((id) => sourceLevelsById.get(id) === "C");
    const owner = cleanText(payload.owner).slice(0, 200);
    const reviewer = cleanText(payload.reviewer).slice(0, 200);
    const title = cleanText(payload.title).slice(0, 500);
    const content = cleanText(payload.content).slice(0, 6000);
    if (status === "applied" && (!owner || !reviewer || !title || !content)) throw new Error("标记已应用前，必须填写标题、内容、Owner和Reviewer");
    if (status === "applied" && hasLevelC) throw new Error("C级资料只能作经验参考，不能直接发布为正式规则");
    const timestamp = nowIso();
    const existing = (store.feedbackRecords || []).find((item) => item.sourceType === sourceType && item.sourceId === sourceId && item.targetType === targetType);
    const record = {
      id: existing?.id || stableId("feedback", `${sourceType}:${sourceId}:${targetType}`),
      sourceType,
      sourceId,
      module: cleanText(payload.module || source.module),
      targetType,
      title,
      content,
      owner,
      reviewer,
      status,
      sourceKnowledgeIds,
      evidence,
      metadata: { ...(existing?.metadata || {}), ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}), containsLevelC: hasLevelC },
      appliedAt: status === "applied" ? existing?.appliedAt || timestamp : null,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    store.feedbackRecords = [record, ...(store.feedbackRecords || []).filter((item) => item.id !== record.id)];
    await writeFallback(store);
    const postgres = await writePostgresKnowledgeFeedbackRecord(record);
    return postgres.available ? postgres.record : record;
  };
  const resume = async () => {
    const documents = await listDocuments();
    const jobs = await listJobs();
    for (const job of jobs.filter((item) => item.jobType === "distill" && item.status === "failed")) {
      const document = documents.find((item) => item.id === job.documentId);
      if (document?.status === "failed" && Number(document.clauseCount || 0) > 0) await updateDocument(document.id, { status: "completed", progress: 100, message: "规范条款可用，知识蒸馏等待重新执行" });
    }
    for (const document of documents.filter((item) => ["waiting", "parsing", "indexing"].includes(item.status))) {
      const expectedJobType = document.contentType === "pdf" && resolveOriginalPath(document) ? "pdf_parse" : document.contentType === "image" && resolveOriginalPath(document) ? "image_parse" : document.contentType === "ppt" && resolveOriginalPath(document) ? "ppt_parse" : "parse";
      const job = jobs.find((item) => item.documentId === document.id && item.jobType === expectedJobType && ["waiting", "running"].includes(item.status));
      await enqueueParse(document.id, job?.id || "");
    }
    for (const job of jobs.filter((item) => item.jobType === "distill" && ["waiting", "running"].includes(item.status))) {
      if (job.status === "running") {
        const batches = (job.result?.batches || []).map((batch) => batch.status === "running" ? { ...batch, status: "pending", errorMessage: "" } : batch);
        await updateJob(job.id, { status: "waiting", message: "服务重启后继续未完成批次", result: distillationLog({ ...(job.result || {}), batches }, "服务重启，未完成批次重新排队", "warning") });
      }
      queueDistillation(job.documentId, job.id);
    }
  };

  return { controlDistillationJob, createDocument, deleteDocument, deleteIssue, deleteJob, enqueueParse, generateMatches, getDocument, getJob, getPerformanceMetrics, getSearchMetrics, governDocument, importDistillation, listAuditLogs, listClauses, listConfirmedMatches, listConflicts, listDistilled, listDocuments, listFeedbackRecords, listIssues, listJobs, listMatches, listRecurrences, listReviewPoints, listReviewSessions, recordAudit, resume, reviewDistilledKnowledge, reviewDocument, reviewMatch, runReadBenchmark, saveConflict, saveDistillation, saveFeedbackRecord, saveRecurrenceAction, saveReviewSession, startDistillation, syncIssues, updateDocumentMetadata, updateJob };
};
const documentReviewState = (document = {}, now = Date.now()) => {
  const due = dateTimestamp(document.reviewDue);
  if (!due) return "unscheduled";
  if (due < now) return "overdue";
  if (due - now <= 30 * 86400000) return "due_soon";
  return "current";
};
const documentOpenConflictIds = (document = {}) => toArray(document.metadata?.openConflictIds);
const decorateDocumentGovernance = (document = {}) => ({ ...document, reviewState: documentReviewState(document), accessLevel: knowledgeAccessLevels.has(document.metadata?.accessLevel) ? document.metadata.accessLevel : "internal", openConflictCount: documentOpenConflictIds(document).length });
