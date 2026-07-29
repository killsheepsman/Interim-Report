import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsClockwise, Brain, CaretDown, CaretRight, CheckCircle, DownloadSimple, FileArrowUp, FloppyDisk, Trash, WarningCircle } from "@phosphor-icons/react";
import { deleteAgentReport, deleteLocalAgentReport, loadAgentReport, loadAgentReports, loadLocalAgentReports, loadAgentSkills, requestAiChat, saveAgentReportFile, saveLocalAgentReport } from "../dataStore.js";
import { buildQualityAgentSnapshot } from "./qualitySnapshot.js";
import { loadQualityAgentRuns, qualityAgentSnapshotHash, QUALITY_AGENT_STAGES, runQualityAgent, saveQualityAgentRuns } from "./qualityAgent.js";

const AGENT_TITLE = "质量分析 Agent";
const DEFAULT_SKILLS = [{ id: "generate-quality-review-report", name: "generate-quality-review-report", description: "质量复盘与跨模块分析", content: "Use the fixed quality snapshot as the source of truth." }];
const IMPORTED_REPORTS_KEY = "qms-quality-agent-imported-reports-v1";

const readImportedReports = () => {
  try {
    const value = JSON.parse(localStorage.getItem(IMPORTED_REPORTS_KEY) || "{}");
    if (!value || typeof value !== "object") return {};
    const normalized = Object.fromEntries(Object.entries(value).map(([module, reports]) => [module, (Array.isArray(reports) ? reports : [])
      .map((report) => ({ ...report, content: String(report?.content || "").slice(0, 120000) }))
      .filter((report) => report.content && !(/\.docx?$/i.test(report.fileName || "") && (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(report.content) || (report.content.match(/\ufffd/g) || []).length > 10)))]));
    if (JSON.stringify(normalized) !== JSON.stringify(value)) localStorage.setItem(IMPORTED_REPORTS_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return {};
  }
};

const saveImportedReports = (value) => {
  try { localStorage.setItem(IMPORTED_REPORTS_KEY, JSON.stringify(value)); } catch {}
};

const readDocxReport = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("无法读取 DOCX 压缩包");
  const entries = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  let cursor = centralOffset;
  let documentEntry = null;
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder("utf-8").decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength));
    if (name === "word/document.xml") documentEntry = { method, compressedSize, localHeaderOffset };
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  if (!documentEntry) throw new Error("DOCX 中未找到正文内容");
  const local = documentEntry.localHeaderOffset;
  const localNameLength = view.getUint16(local + 26, true);
  const localExtraLength = view.getUint16(local + 28, true);
  const dataStart = local + 30 + localNameLength + localExtraLength;
  const compressed = bytes.slice(dataStart, dataStart + documentEntry.compressedSize);
  let xmlBytes = compressed;
  if (documentEntry.method === 8) {
    if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持 DOCX 解压，请使用新版 Chrome/Edge");
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (documentEntry.method !== 0) {
    throw new Error("DOCX 使用了暂不支持的压缩方式");
  }
  const xml = new DOMParser().parseFromString(new TextDecoder("utf-8").decode(xmlBytes), "application/xml");
  const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paragraphs = [...xml.getElementsByTagNameNS(namespace, "p")]
    .map((paragraph) => [...paragraph.getElementsByTagNameNS(namespace, "t")].map((item) => item.textContent || "").join("").trim())
    .filter(Boolean);
  if (!paragraphs.length) throw new Error("DOCX 中没有可提取的正文文本");
  return paragraphs.join("\n").slice(0, 120000);
};

const importedContentFromText = (fileName, text) => {
  if (!/\.json$/i.test(fileName)) return text;
  try {
    const value = JSON.parse(text);
    if (typeof value?.content === "string") return value.content;
    if (typeof value?.report === "string") return value.report;
    if (value?.reports && typeof value.reports === "object") {
      return Object.entries(value.reports).map(([name, content]) => `## ${name}\n${typeof content === "string" ? content : JSON.stringify(content, null, 2)}`).join("\n\n");
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return text;
  }
};

// This is intentionally the same Markdown payload used by the download action.
const downloadAgentReport = (record) => {
  const blob = new Blob([record.content || "暂无报告"], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${AGENT_TITLE}-${record.module}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
  link.click();
  URL.revokeObjectURL(url);
};

const escapeHtml = (value) => String(value || "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
const isMarkdownTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);
const isMarkdownTableSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const renderMarkdownTable = (lines) => {
  const rows = lines.map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => escapeHtml(cell.trim())));
  if (!rows.length) return "";
  const hasSeparator = rows.length > 1 && isMarkdownTableSeparator(lines[1]);
  const header = rows[0];
  const body = hasSeparator ? rows.slice(2) : rows.slice(1);
  return `<div class="agent-report-table-wrap"><table class="agent-report-table"><thead><tr>${header.map((cell) => `<th scope="col">${cell}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${header.map((_, index) => `<td>${row[index] || ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
};
const renderAgentMarkdown = (content) => {
  const lines = String(content || "暂无报告").split(/\r?\n/);
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isMarkdownTableLine(line)) {
      const tableLines = [];
      while (index < lines.length && isMarkdownTableLine(lines[index])) tableLines.push(lines[index++]);
      output.push(renderMarkdownTable(tableLines));
      index -= 1;
      continue;
    }
    const value = escapeHtml(line.trim());
    if (!value) output.push("<div class=\"agent-report-spacer\"></div>");
    else if (/^###\s/.test(value)) output.push(`<h5>${value.replace(/^###\s/, "")}</h5>`);
    else if (/^##\s/.test(value)) output.push(`<h4>${value.replace(/^##\s/, "")}</h4>`);
    else if (/^#\s/.test(value)) output.push(`<h3>${value.replace(/^#\s/, "")}</h3>`);
    else if (/^(\-|\*)\s/.test(value)) output.push(`<div class=\"agent-report-bullet\"><i></i><span>${value.replace(/^(\-|\*)\s/, "")}</span></div>`);
    else if (/^\d+\.\s/.test(value)) output.push(`<div class=\"agent-report-numbered\">${value}</div>`);
    else output.push(`<p>${value}</p>`);
  }
  return output.join("");
};

export function QualityAgentPage({ data, files = [], dateRange, module = "DQA", canStart = false, canSaveToServer = false }) {
  const [skillName, setSkillName] = useState("generate-quality-review-report");
  const [skillContent, setSkillContent] = useState(DEFAULT_SKILLS[0].content);
  const [skills, setSkills] = useState(DEFAULT_SKILLS);
  const [runs, setRuns] = useState(() => loadQualityAgentRuns());
  const [stageOpen, setStageOpen] = useState({});
  const [savedReports, setSavedReports] = useState([]);
  const [selectedReportName, setSelectedReportName] = useState("");
  const [selectedReportContent, setSelectedReportContent] = useState("");
  const [selectedReportState, setSelectedReportState] = useState({ status: "idle", message: "" });
  const [importedReports, setImportedReports] = useState(() => readImportedReports()[module] || []);
  const [selectedImportedId, setSelectedImportedId] = useState("");
  const importInputRef = useRef(null);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState({ status: "idle", message: "" });
  const abortRef = useRef(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  const [period, setPeriod] = useState(() => ({ ...dateRange }));
  useEffect(() => {
    setPeriod((current) => current.start2026 === dateRange.start2026 && current.end2026 === dateRange.end2026
      ? current
      : { ...current, ...dateRange });
  }, [dateRange.start2026, dateRange.end2026, dateRange.start2025, dateRange.end2025]);
  const snapshot = useMemo(() => buildQualityAgentSnapshot({ data, files, dateRange: period, module }), [data, files, period, module]);
  const record = runs[module] || {};
  const update = (next) => setRuns((current) => {
    const value = { ...current, [module]: next };
    saveQualityAgentRuns(value);
    return value;
  });

  const refreshReports = async () => {
    try {
      const value = await loadAgentReports();
      const reports = Array.isArray(value?.reports) ? value.reports : [];
      const localReports = loadLocalAgentReports().filter((item) => item.module === module);
      const merged = [...localReports, ...reports];
      setSavedReports(merged);
      return merged;
    } catch {
      const localReports = loadLocalAgentReports().filter((item) => item.module === module);
      setSavedReports(localReports);
      return localReports;
    }
  };
  const moduleReports = useMemo(
    () => savedReports.filter((item) => item.localOnly ? item.module === module : item.fileName.includes(`QMS-Agent报告-${module}-`)),
    [savedReports, module],
  );
  const selectedReport = moduleReports.find((item) => item.fileName === selectedReportName) || null;
  const selectedImportedReport = importedReports.find((item) => item.id === selectedImportedId) || null;

  useEffect(() => {
    const reports = readImportedReports()[module] || [];
    setImportedReports(Array.isArray(reports) ? reports : []);
    setSelectedImportedId("");
  }, [module]);

  useEffect(() => {
    if (!importedReports.length) {
      setSelectedImportedId("");
      return;
    }
    if (!importedReports.some((item) => item.id === selectedImportedId)) {
      setSelectedImportedId(importedReports[0].id);
    }
  }, [importedReports, selectedImportedId]);

  useEffect(() => {
    if (!moduleReports.length) {
      setSelectedReportName("");
      setSelectedReportContent("");
      return;
    }
    if (!moduleReports.some((item) => item.fileName === selectedReportName)) {
      setSelectedReportName(moduleReports[0].fileName);
    }
  }, [moduleReports, selectedReportName]);

  useEffect(() => {
    let active = true;
    if (!selectedReportName) {
      setSelectedReportContent("");
      setSelectedReportState({ status: "idle", message: "" });
      return () => { active = false; };
    }
    if (selectedReport?.localOnly) {
      setSelectedReportContent(String(selectedReport.content || ""));
      setSelectedReportState({ status: "loaded", message: "" });
      return () => { active = false; };
    }
    setSelectedReportState({ status: "loading", message: "正在读取已保存报告…" });
    loadAgentReport(selectedReportName).then((value) => {
      if (!active) return;
      setSelectedReportContent(String(value?.content || ""));
      setSelectedReportState({ status: "loaded", message: "" });
    }).catch((loadError) => {
      if (!active) return;
      setSelectedReportContent("");
      setSelectedReportState({ status: "error", message: `报告读取失败：${loadError.message}` });
    });
    return () => { active = false; };
  }, [selectedReportName, selectedReport]);
  useEffect(() => { saveQualityAgentRuns(runs); }, [runs]);
  useEffect(() => {
    loadAgentSkills().then((value) => {
      const next = Array.isArray(value?.skills)
        ? value.skills.filter((item) => !String(item.id || item.name || "").startsWith("quality-role-"))
        : [];
      const available = next.length ? next : DEFAULT_SKILLS;
      setSkills(available);
      const selected = available.find((item) => item.name === skillName) || available[0];
      if (selected) { setSkillName(selected.name); setSkillContent(selected.content || ""); }
    }).catch(() => setSkills(DEFAULT_SKILLS));
    refreshReports();
  }, []);

  const start = async () => {
    if (!canStart) {
      setError("当前账号没有“启动 Agent 分析”权限，请联系主管理员");
      return;
    }
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const currentHash = qualityAgentSnapshotHash(snapshot);
      const sameSnapshot = record.snapshotHash === currentHash || record.snapshotHash === currentHash.slice(0, 80);
      const hasCompleteReport = record.status === "done" && Boolean(record.content);
      if (hasCompleteReport && sameSnapshot && !window.confirm("当前数据和统计周期均未变化，已生成报告。是否继续重新分析？")) return;
      const next = await runQualityAgent({ snapshot, skillName, skillContent, existing: hasCompleteReport && sameSnapshot ? null : record, requestChat: (messages, options = {}) => requestAiChat(messages, { ...options, operation: "quality-agent-start" }), signal: controller.signal, onUpdate: update });
      if (next.status === "error") setError(`${next.currentStage || "Agent分析"}：${next.error}`);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const saveToProject = async () => {
    if (!record.content) return;
    setSaveState({ status: "saving", message: "正在保存导出内容到项目报告库…" });
    try {
      const saved = canSaveToServer
        ? await saveAgentReportFile({ module, skillName: record.skillName || skillName, period: snapshot.period, content: record.content })
        : saveLocalAgentReport({ module, skillName: record.skillName || skillName, period: snapshot.period, content: record.content });
      const reports = await refreshReports();
      setSelectedReportName(saved.fileName || reports[0]?.fileName || "");
      setSaveState({ status: "saved", message: canSaveToServer ? `已保存到服务器：${saved.relativePath || saved.fileName}` : `已保存到本机：${saved.fileName}` });
    } catch (saveError) {
      setSaveState({ status: "error", message: `保存失败：${saveError.message}` });
    }
  };

  const removeSavedReport = async (fileName) => {
    if (!window.confirm("确定删除这份 Agent 项目报告吗？")) return;
    try {
      if (String(fileName).startsWith("本地-Agent报告-") || selectedReport?.localOnly) deleteLocalAgentReport(fileName);
      else {
        if (!canSaveToServer) { setSaveState({ status: "error", message: "普通用户不能删除服务器报告" }); return; }
        await deleteAgentReport(fileName);
      }
      await refreshReports();
    } catch (deleteError) { setSaveState({ status: "error", message: `删除失败：${deleteError.message}` }); }
  };

  const importReport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
  try {
      if (/\.doc$/i.test(file.name)) throw new Error("暂不支持 .doc，请先另存为 .docx");
      const text = /\.docx$/i.test(file.name) ? await readDocxReport(file) : await file.text();
      const content = importedContentFromText(file.name, text).trim().slice(0, 120000);
      if (!content) throw new Error("报告内容为空");
      const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: file.name,
        content,
        importedAt: new Date().toISOString(),
      };
      const nextReports = [item, ...importedReports.filter((report) => report.fileName !== file.name)].slice(0, 30);
      const all = readImportedReports();
      all[module] = nextReports;
      saveImportedReports(all);
      setImportedReports(nextReports);
      setSelectedImportedId(item.id);
      setSaveState({ status: "saved", message: `已导入：${file.name}` });
    } catch (importError) {
      setSaveState({ status: "error", message: `导入失败：${importError.message}` });
    }
  };

  const removeImportedReport = (id) => {
    const target = importedReports.find((item) => item.id === id);
    if (!target || !window.confirm(`确定删除导入报告“${target.fileName}”吗？`)) return;
    const nextReports = importedReports.filter((item) => item.id !== id);
    const all = readImportedReports();
    all[module] = nextReports;
    saveImportedReports(all);
    setImportedReports(nextReports);
  };

  return <div className="qmdp-page quality-agent-page">
    <div className="quality-agent-hero"><div><span className="qmdp-eyebrow">QUALITY ANALYSIS AGENT / {module}</span><h2>{AGENT_TITLE} · {module}</h2><p>基于软件固定统计结果生成可审计的 {module} 质量复盘和改善行动。角色报告、发送任务与考试统计在独立 Agent 页面处理。</p></div><div className="quality-agent-hero-actions">{record.content && <><button className="qmdp-secondary-btn" onClick={() => downloadAgentReport(record)}><DownloadSimple size={15}/>导出报告</button><button className="qmdp-primary-btn" onClick={saveToProject} disabled={saveState.status === "saving"}><FloppyDisk size={15}/>{saveState.status === "saving" ? "保存中…" : "保存到项目"}</button></>}<Brain size={42} weight="duotone" /></div></div>
    <section className="qmdp-card quality-agent-controls">
      <label>分析 Skill<select value={skillName} onChange={(event) => { const selected = skills.find((item) => item.name === event.target.value); setSkillName(event.target.value); setSkillContent(selected?.content || ""); }}>{skills.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
      <label>统计开始<input type="date" value={period.start2026 || ""} onChange={(event) => setPeriod((current) => ({ ...current, start2026: event.target.value }))}/></label>
      <label>统计结束<input type="date" value={period.end2026 || ""} onChange={(event) => setPeriod((current) => ({ ...current, end2026: event.target.value }))}/></label>
      <span>分析模块：{module} · 当前周期：{period.start2026}—{period.end2026}</span>
      <div className="quality-agent-report-toolbar">
        <label>项目报告<select value={selectedReportName} onChange={(event) => setSelectedReportName(event.target.value)} disabled={!moduleReports.length}><option value="">暂无已保存报告</option>{moduleReports.map((item) => <option key={item.fileName} value={item.fileName}>{item.fileName} · {new Date(item.updatedAt).toLocaleString("zh-CN")}</option>)}</select></label>
        <button className="qmdp-secondary-btn" onClick={refreshReports}><ArrowsClockwise size={15}/>刷新报告库</button>
        <input ref={importInputRef} type="file" accept=".docx,.md,.markdown,.txt,.json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain,application/json" onChange={importReport} hidden/>
        <button className="qmdp-secondary-btn" onClick={() => importInputRef.current?.click()}><FileArrowUp size={15}/>导入 Agent 报告</button>
        <label>外部报告<select value={selectedImportedId} onChange={(event) => setSelectedImportedId(event.target.value)} disabled={!importedReports.length}><option value="">暂无导入报告</option>{importedReports.map((item) => <option key={item.id} value={item.id}>{item.fileName} · {new Date(item.importedAt).toLocaleString("zh-CN")}</option>)}</select></label>
      </div>
      {record.status === "running" ? <button className="qmdp-danger-btn" onClick={stop}><WarningCircle size={16}/>停止 Agent分析</button> : <button className="qmdp-primary-btn" onClick={start} disabled={!canStart} title={!canStart ? "仅主管理员可以启动 Agent 分析" : "启动 Agent 分析"}><Brain size={16}/>{record.status === "error" ? "继续 Agent分析" : "启动 Agent分析"}</button>}
    </section>
    <section className="quality-agent-collapsible-workflow">{QUALITY_AGENT_STAGES.filter((stage) => stage.id !== "audit").map((stage) => { const item = record.stages?.[stage.id] || {}; const open = Boolean(stageOpen[stage.id]); return <article className={`qmdp-card quality-agent-stage ${item.status || "pending"}`} key={stage.id}><header><button type="button" className="quality-agent-stage-toggle" onClick={() => setStageOpen((current) => ({ ...current, [stage.id]: !current[stage.id] }))}><span>{item.status === "done" ? <CheckCircle size={18} weight="fill"/> : item.status === "error" ? <WarningCircle size={18} weight="fill"/> : item.status === "running" ? <ArrowsClockwise size={18} className="spin"/> : stage.id === "analysis" ? "1" : stage.id === "actions" ? "2" : "3"}</span><strong>{stage.label}</strong>{open ? <CaretDown size={16}/> : <CaretRight size={16}/>}</button><small>{item.status === "done" ? "已完成" : item.status === "error" ? "失败，可继续" : item.status === "running" ? "执行中" : "等待执行"}</small></header>{open && item.content && <div className="quality-agent-stage-content" dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(item.content) }}/>} {open && item.error && <p className="quality-agent-error">{item.error}</p>}</article>; })}</section>
    <section className="quality-agent-workflow">{QUALITY_AGENT_STAGES.filter((stage) => stage.id !== "audit").map((stage) => { const item = record.stages?.[stage.id] || {}; return <article className={`qmdp-card quality-agent-stage ${item.status || "pending"}`} key={stage.id}><header><div><span>{item.status === "done" ? <CheckCircle size={18} weight="fill"/> : item.status === "error" ? <WarningCircle size={18} weight="fill"/> : item.status === "running" ? <ArrowsClockwise size={18} className="spin"/> : stage.id === "analysis" ? "1" : stage.id === "actions" ? "2" : "3"}</span><strong>{stage.label}</strong></div><small>{item.status === "done" ? "已完成" : item.status === "error" ? "失败，可继续" : item.status === "running" ? "执行中" : "等待执行"}</small></header>{item.content && <div className="quality-agent-stage-content" dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(item.content) }}/>} {item.error && <p className="quality-agent-error">{item.error}</p>}</article>; })}</section>
    {record.content && <section className="qmdp-card quality-agent-report quality-agent-final-report"><header><strong>{AGENT_TITLE}正式报告</strong><span>已生成内容</span></header><div className="quality-agent-report-content" dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(record.content) }}/>{saveState.message && <p className={`quality-agent-save-state ${saveState.status}`}>{saveState.message}</p>}</section>}
    <section className="qmdp-card quality-agent-library"><header><div><strong>Agent项目报告库 · {module}</strong><small>选择已保存的 {module} 报告查看，也可在“Agent角色报告”中选择作为角色报告基线</small></div><div className="quality-agent-library-actions"><label>选择报告<select value={selectedReportName} onChange={(event) => setSelectedReportName(event.target.value)} disabled={!moduleReports.length}><option value="">暂无已保存报告</option>{moduleReports.map((item) => <option key={item.fileName} value={item.fileName}>{item.fileName} · {new Date(item.updatedAt).toLocaleString("zh-CN")}</option>)}</select></label><button className="qmdp-secondary-btn" onClick={refreshReports}><ArrowsClockwise size={15}/>刷新</button></div></header>{moduleReports.map((item) => <div className={`quality-agent-library-row${item.fileName === selectedReportName ? " selected" : ""}`} key={item.fileName}><div><b>{item.fileName}</b><span>{item.relativePath} · {new Date(item.updatedAt).toLocaleString("zh-CN")}</span></div><button className="qmdp-danger-btn" onClick={() => removeSavedReport(item.fileName)}><Trash size={14}/>删除</button></div>)}{!moduleReports.length && <p className="quality-agent-save-state">暂无已保存 {module} Agent 报告。</p>}</section>
    {selectedReportName && <section className="qmdp-card quality-agent-saved-report"><header><div><strong>已保存报告 · {module}</strong><span>{selectedReport?.updatedAt ? new Date(selectedReport.updatedAt).toLocaleString("zh-CN") : ""}</span></div>{selectedReportState.status === "loading" && <small>读取中…</small>}</header>{selectedReportState.message && <p className={`quality-agent-save-state ${selectedReportState.status === "error" ? "error" : ""}`}>{selectedReportState.message}</p>}{selectedReportContent && <div className="quality-agent-report-content" dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(selectedReportContent) }}/>}</section>}
    <section className="qmdp-card quality-agent-imported-report"><header><div><strong>外部导入报告 · {module}</strong><small>导入的报告独立保存，不覆盖在线分析和项目报告库</small></div><div className="quality-agent-library-actions"><input ref={importInputRef} type="file" accept=".docx,.md,.markdown,.txt,.json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain,application/json" onChange={importReport} hidden/><button className="qmdp-secondary-btn" onClick={() => importInputRef.current?.click()}><FileArrowUp size={15}/>导入 Agent 报告</button><label>选择导入报告<select value={selectedImportedId} onChange={(event) => setSelectedImportedId(event.target.value)} disabled={!importedReports.length}><option value="">暂无导入报告</option>{importedReports.map((item) => <option key={item.id} value={item.id}>{item.fileName} · {new Date(item.importedAt).toLocaleString("zh-CN")}</option>)}</select></label></div></header>{selectedImportedReport && <div className="quality-agent-imported-report-toolbar"><span>{selectedImportedReport.fileName} · {new Date(selectedImportedReport.importedAt).toLocaleString("zh-CN")}</span><button className="qmdp-danger-btn" onClick={() => removeImportedReport(selectedImportedReport.id)}><Trash size={14}/>删除导入报告</button></div>}{selectedImportedReport && <div className="quality-agent-report-content" dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(selectedImportedReport.content) }}/>}</section>
    {error && <div className="quality-agent-error-banner"><WarningCircle size={18}/>{error}</div>}
  </div>;
}
