import { useEffect, useRef, useState } from "react";
import { FolderOpen, WarningCircle } from "@phosphor-icons/react";
import { fetchReportFile, loadAgentReport, loadAgentReports, loadAgentSkills, openReportLibraryFolder } from "../dataStore.js";
import { EmployeeSearchSelect } from "./EmployeeSearchSelect.jsx";
import { renderAgentMarkdown } from "./QualityAgentPage.jsx";
import { REPORT_PRESENTATION_PROFILES } from "./reportPresentationProfiles.js";
import { AI_EMPLOYEE_EVENT, askAiEmployee, configBody, configGaps, previewSchedule, readAiEmployeeDraft, readAiEmployeeLog, readAiEmployeeSaved, runAiEmployeeCycle, runAiEmployeeNow, sendAiEmployeeReport, scheduleOf, writeAiEmployeeDraft, writeAiEmployeeSaved } from "./roleAutoReport.js";

export function AiEmployeeWatcher({ employees = [], enabled = false }) {
  const peopleRef = useRef(employees);
  peopleRef.current = employees;
  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => { runAiEmployeeCycle(peopleRef.current).catch(() => {}); };
    tick();
    const timer = window.setInterval(tick, 60000);
    window.addEventListener(AI_EMPLOYEE_EVENT, tick);
    return () => { window.clearInterval(timer); window.removeEventListener(AI_EMPLOYEE_EVENT, tick); };
  }, [enabled]);
  return null;
}

export function RoleAutoReportPage({ employees = [] }) {
  const [draft, setDraft] = useState(() => readAiEmployeeDraft());
  const [savedBody, setSavedBody] = useState(() => configBody(readAiEmployeeSaved() || {}));
  const [log, setLog] = useState(() => readAiEmployeeLog());
  const [ruleText, setRuleText] = useState("");
  const [manualMonth, setManualMonth] = useState(() => {
    const scheduled = scheduleOf(readAiEmployeeDraft());
    if (!scheduled) return "";
    return scheduled.period.year + "-" + String(scheduled.period.month).padStart(2, "0");
  });
  const [busy, setBusy] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [libraryPath, setLibraryPath] = useState("");
  const [skills, setSkills] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedName, setSelectedName] = useState("");
  const [selectedContent, setSelectedContent] = useState("");
  const [talk, setTalk] = useState("");
  const chatRef = useRef(null);
  const [chat, setChat] = useState(() => { try { return JSON.parse(localStorage.getItem("qms-ai-employee-chat-v1") || "[]"); } catch { return []; } });
  const [folderNote, setFolderNote] = useState("");
  const processRef = useRef(null);
  useEffect(() => {
    const node = chatRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chat, busy]);
  useEffect(() => {
    const sync = () => { setSavedBody(configBody(readAiEmployeeSaved() || {})); setLog(readAiEmployeeLog()); };
    window.addEventListener(AI_EMPLOYEE_EVENT, sync);
    return () => window.removeEventListener(AI_EMPLOYEE_EVENT, sync);
  }, []);
  useEffect(() => {
    if (busy !== "正在生成") return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (busy === "正在生成" && processRef.current) processRef.current.open = true;
  }, [busy]);
  useEffect(() => {
    let stop = false;
    loadAgentReports({ module: "公司", limit: "30" }).then((payload) => {
      if (stop) return;
      const rows = (payload?.reports || []).filter((row) => row.module === "公司" || String(row.fileName || "").includes("quality-director-brief"));
      rows.sort((left, right) => String(right.savedAt || right.updatedAt || "").localeCompare(String(left.savedAt || left.updatedAt || "")));
      setLibraryPath(rows[0]?.relativePath || "");
      setReports(rows);
      setSelectedName((current) => (log.fileName && rows.some((item) => item.fileName === log.fileName) ? log.fileName : current || rows[0]?.fileName || ""));
    }).catch(() => {});
    return () => { stop = true; };
  }, [log.updatedAt, log.fileName]);
  useEffect(() => {
    let stop = false;
    loadAgentSkills().then((payload) => {
      if (stop) return;
      const rows = (payload?.skills || []).filter((item) => String(item.id || item.name || "").startsWith("quality-director"));
      setSkills(rows);
    }).catch(() => {});
    return () => { stop = true; };
  }, []);
  useEffect(() => {
    if (!selectedName) { setSelectedContent(""); return undefined; }
    let stop = false;
    loadAgentReport(selectedName).then((value) => { if (!stop) setSelectedContent(String(value?.content || "")); }).catch(() => { if (!stop) setSelectedContent(""); });
    return () => { stop = true; };
  }, [selectedName]);
  const gaps = configGaps(draft);
  const saved = readAiEmployeeSaved();
  const pending = !saved || configBody(draft) !== savedBody;
  const change = (next) => setDraft(writeAiEmployeeDraft(next));
  const addRule = () => {
    const line = ruleText.replace(/\s+/g, " ").trim();
    if (!line) return;
    change({ ...draft, addedRules: [...draft.addedRules, line] });
    setRuleText("");
  };
  const save = () => { if (gaps.length) return; const next = writeAiEmployeeSaved(draft); setDraft(next); setSavedBody(configBody(next)); };
  const generateNow = async () => {
    if (busy) return;
    setBusy("正在生成");
    try {
      const result = await runAiEmployeeNow(employees, draft, manualMonth);
      setLog(result || readAiEmployeeLog());
      const file = result?.download;
      if (!file) return;
      try {
        const saved = await fetchReportFile({ fileName: file.fileName, content: file.content, module: "公司", format: "html", layoutProfileId: draft.layoutProfileId || "porcelain-sheet-v1", period: file.period });
        const url = URL.createObjectURL(saved.blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = saved.fileName || "公司质量简报.html";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        setLog((current) => ({ ...current, phase: "已写好未下载", summary: (current.summary || "报告已写好") + "。浏览器没有开始下载：" + (error?.message || "下载失败") }));
      }
    } catch (error) {
      setLog({ phase: "没有生成", summary: error?.message || "没有生成", alarms: [{ name: "公司简报", detail: error?.message || "没有生成" }], passes: [], fileName: "", savedPath: "", recipient: "", updatedAt: new Date().toISOString() });
    } finally { setBusy(""); }
  };
  const sendNow = async () => {
    const fileName = selectedName || log.fileName;
    if (busy || !draft.recipient || !fileName) return;
    setBusy("正在发送");
    try {
      const result = await sendAiEmployeeReport(draft.recipient, fileName, draft.layoutProfileId || "porcelain-sheet-v1");
      setLog(result || readAiEmployeeLog());
    } catch (error) {
      setLog((current) => ({ ...current, resultPhase: "已写好未发出", resultSummary: "没有发给" + draft.recipient + "：" + (error?.message || "发送失败"), resultAt: new Date().toISOString() }));
    } finally { setBusy(""); }
  };
  const sendTalk = async () => {
    const question = talk.trim();
    if (!question || busy) return;
    const next = [...chat, { role: "user", content: question }].slice(-20);
    setChat(next);
    setTalk("");
    localStorage.setItem("qms-ai-employee-chat-v1", JSON.stringify(next));
    setBusy("正在回答");
    try {
      const answer = await askAiEmployee({ question, history: chat, addedRules: draft.addedRules, yearMonth: manualMonth });
      const done = [...next, { role: "assistant", content: answer.content }].slice(-20);
      setChat(done);
      localStorage.setItem("qms-ai-employee-chat-v1", JSON.stringify(done));
    } catch (error) {
      const done = [...next, { role: "assistant", content: error?.message || "没有回答" }];
      setChat(done);
    } finally { setBusy(""); }
  };
  const openLibrary = async () => {
    setFolderNote("");
    try { await openReportLibraryFolder(); }
    catch (error) { setFolderNote(error?.message || "没有打开文件夹"); }
  };
  return <div className="qmdp-page quality-agent-page">
    <div className="quality-agent-hero"><div><span className="qmdp-eyebrow">岗位角色报告</span><h2>AI员工</h2><p>到了设定日期，按所选简报技能写一份公司简报。每个月只判断该盯谁。</p></div></div>
    <section className="qmdp-card quality-agent-controls quality-agent-role-controls ai-employee-controls">
      <label className="role-field ai-top">每月第几日<input type="number" min="1" max="28" value={draft.period.day} onChange={(event) => change({ ...draft, period: { ...draft.period, day: event.target.value === "" ? "" : Number(event.target.value) } })} /></label>
      <label className="role-field ai-top">往前几个月<input type="number" min="0" max="12" value={draft.period.monthsBack} onChange={(event) => change({ ...draft, period: { ...draft.period, monthsBack: event.target.value === "" ? "" : Number(event.target.value) } })} /></label>
            <label className="role-field ai-top">简报 Skill<select value={draft.skillId || "quality-director-brief"} onChange={(event) => change({ ...draft, skillId: event.target.value })}>{(skills.length ? skills : [{ id: "quality-director-brief", name: "quality-director-brief" }]).map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></label>
      <label className="role-field ai-top">网页呈现风格<select value={draft.layoutProfileId || "porcelain-sheet-v1"} onChange={(event) => change({ ...draft, layoutProfileId: event.target.value })}>{REPORT_PRESENTATION_PROFILES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label className="role-field ai-half">已保存简报<select value={selectedName} onChange={(event) => setSelectedName(event.target.value)}><option value="">{reports.length ? "请选择简报" : "还没有简报"}</option>{reports.map((item) => <option key={item.fileName} value={item.fileName}>{(item.period && item.period.label) || "简报"} · {item.savedAt || item.updatedAt ? new Date(item.savedAt || item.updatedAt).toLocaleString("zh-CN") : item.fileName}</option>)}</select></label>
      <label className="role-field ai-half">接收人<EmployeeSearchSelect employees={employees} value={draft.recipient} onChange={(name) => change({ ...draft, recipient: name })} placeholder="选择或输入姓名" /></label>
      <div className="ai-employee-jobs">
        <label className="wecom-send-check"><input type="checkbox" checked={draft.job.brief} onChange={(event) => change({ ...draft, job: { ...draft.job, brief: event.target.checked } })} />写出简报并发出</label>
        <label className="wecom-send-check"><input type="checkbox" checked={draft.job.alarmMissing} onChange={(event) => change({ ...draft, job: { ...draft.job, alarmMissing: event.target.checked } })} />缺快照就报警</label>
      </div>
      <label className="role-field ai-month">生成月份<input type="month" value={manualMonth} onChange={(event) => setManualMonth(event.target.value)} /></label>
      <div className="ai-employee-actions">
      <button type="button" className="qmdp-primary-btn" disabled={!!gaps.length || !!busy} onClick={save}>保存配置</button>
      <button type="button" className="qmdp-secondary-btn" disabled={!!busy || !manualMonth} onClick={generateNow}>{busy === "正在生成" ? "正在生成…" : "现在生成"}</button>
      <button type="button" className="qmdp-secondary-btn ai-employee-send" disabled={!!busy || !draft.recipient || !(selectedName || log.fileName)} onClick={sendNow}>{busy === "正在发送" ? "正在发送…" : "发送给接收人"}</button>
      </div>
      <span>{previewSchedule(draft)}。填 0 是当月，填 1 是上一个自然月。{pending ? "当前修改还没保存，不影响这次结果。" : ""}</span>
      {!!gaps.length && <span>还不能保存：{gaps.join("；")}</span>}
    </section>
    {(busy === "正在生成" || (log.progress > 0 && log.progress < 100)) && <div className="date-refresh-progress" style={{width:"100%", maxWidth:640, margin:"4px 0 12px"}}><span>{log.summary || "正在生成"}</span><b>{Math.round(log.progress || 8)}%</b><i style={{width: Math.max(3, Math.min(100, log.progress || 8)) + "%"}} /></div>}
    <details className="qmdp-card ai-employee-fold" ref={processRef}>
      <summary>后台过程</summary>
      <pre>{(log.activity || []).length ? (log.activity || []).map((item) => new Date(item.at).toLocaleTimeString("zh-CN", { hour12: false }) + "  " + item.message).join("\n") : "点「现在生成」后，这里会按时间写出每一步。"}{busy === "正在生成" && (log.activity || []).length ? "\n" + new Date(clock).toLocaleTimeString("zh-CN", { hour12: false }) + "  仍在等待上一步，已过去 " + Math.max(0, Math.round((clock - new Date((log.activity || []).at(-1)?.at || clock).getTime()) / 1000)) + " 秒。" : ""}</pre>
    </details>
    <section className="qmdp-card ai-employee-result" style={{padding:16}}>
      <div className="ai-employee-result-head">
        <h3>这次结果</h3>
        <button type="button" className="qmdp-secondary-btn" onClick={openLibrary}><FolderOpen size={14}/>打开文件夹</button>
      </div>
      {!!folderNote && <p style={{margin:"8px 0"}}>{folderNote}</p>}
      {!log.resultAt && !libraryPath && <p style={{margin:"8px 0"}}>还没有生成。结束后这里会写明有没有发出，以及报告保存在哪里。</p>}
      {!!log.resultAt && <>
        <p style={{margin:"8px 0"}}><strong>{log.resultPhase || "已结束"}</strong>{"　"}{new Date(log.resultAt).toLocaleString("zh-CN")}</p>
        <p style={{margin:"8px 0"}}>{log.resultSummary}</p>
        {!!log.brief && log.resultPhase === "简报不合格" && <pre style={{margin:"8px 0 0", whiteSpace:"pre-wrap", fontFamily:"Microsoft YaHei, sans-serif", fontSize:14, lineHeight:1.7}}>{log.brief.slice(0, 2000)}</pre>}
        {!!log.savedPath && <p style={{margin:"8px 0"}}>保存位置：{log.savedPath}</p>}
      </>}
      {!log.resultAt && !!libraryPath && <>
        <p style={{margin:"8px 0"}}><strong>已保存，没有发送</strong></p>
        <p style={{margin:"8px 0"}}>最近一份简报已经在报告库里。这次没有接收人，所以没有发到企业微信。</p>
        <p style={{margin:"8px 0"}}>保存位置：{libraryPath}</p>
      </>}
    </section>
    {!!selectedContent && <details className="qmdp-card ai-employee-fold quality-agent-saved-report">
      <summary>简报{(reports.find((item) => item.fileName === selectedName)?.period || {}).label ? " · " + (reports.find((item) => item.fileName === selectedName)?.period || {}).label : ""}</summary>
      <div className="quality-agent-report-content" dangerouslySetInnerHTML={{ __html: renderAgentMarkdown(selectedContent, { publisher: true, profileId: draft.layoutProfileId || "porcelain-sheet-v1", module: "公司", lede: "公司质量简报。" }) }} />
    </details>}
    {!!log.alarms?.length && <section className="qmdp-card" style={{padding:16}}>
      <h3 style={{display:"flex", gap:8, alignItems:"center"}}><WarningCircle size={18}/>报警 {log.alarms.length} 条</h3>
      {log.alarms.map((item) => <p key={item.name + item.detail} style={{margin:"8px 0"}}><strong>{item.name}</strong>{"　"}{item.detail}</p>)}
    </section>}
    {!!log.passes?.length && <section className="qmdp-card" style={{padding:16}}>
      <h3>完成</h3>
      {log.passes.map((item) => <p key={item.name + item.detail} style={{margin:"8px 0"}}><strong>{item.name}</strong>{"　"}{item.detail}</p>)}
    </section>}
    <section className="qmdp-card ai-employee-chat">
      <h3>对话</h3>
      <p>对话会先查公司各模块已经生成的月份数据，再回答。问行业做法或外部案例时，才另外查网页。</p>
      <div className="ai-employee-chat-log" ref={chatRef}>
        {chat.map((item, index) => <div key={index} className={"bubble " + item.role}><p>{item.content}</p></div>)}
        {!chat.length && <div className="bubble assistant"><p>可以直接问这个月哪里过线、该盯谁、上期行动有没有用。</p></div>}
      </div>
      <div className="ai-employee-chat-ask">
        <textarea value={talk} placeholder="输入要讨论的问题" onChange={(event) => setTalk(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendTalk(); } }} />
        <button type="button" className="qmdp-primary-btn" disabled={!!busy || !talk.trim()} onClick={sendTalk}>{busy === "正在回答" ? "正在回答…" : "发送"}</button>
      </div>
    </section>
  </div>;
}
