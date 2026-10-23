import { useEffect, useMemo, useState } from "react";
import { PaperPlaneTilt, ArrowsClockwise, FileHtml, FilePdf, FolderOpen } from "@phosphor-icons/react";
import { exportWecomPdfs, loadAgentReports, openWecomPdfFolder, previewWecomSend, sendWecomReports } from "../dataStore.js";
import { EmployeeSearchSelect } from "./EmployeeSearchSelect.jsx";

const reportDisplayName = (fileName = "") => String(fileName || "").replace(/\.md$/i, "");
const monthKey = (value) => /^\d{4}-\d{2}/.test(String(value || "")) ? String(value).slice(0, 7) : "";
const monthTitle = (ym) => {
  if (!ym) return "未标月份";
  const [year, month] = String(ym).split("-");
  return year + "年" + Number(month) + "月";
};
const selectedWindow = (period = {}) => {
  if (period._periodStart || period._periodEnd) return { start: period._periodStart || "", end: period._periodEnd || "" };
  if (period.start2026 || period.end2026) return { start: period.start2026 || "", end: period.end2026 || "" };
  return { start: period.start || "", end: period.end || "" };
};
const reportEndMonth = (row) => monthKey(selectedWindow(row.period || {}).end);
const periodText = (period = {}) => {
  const window = selectedWindow(period);
  const start = monthKey(window.start);
  const end = monthKey(window.end);
  if (!start && !end) return "未标月份";
  if (start && end && start.slice(0, 4) === end.slice(0, 4)) {
    if (start === end) return monthTitle(end);
    return start.slice(0, 4) + "年" + Number(start.slice(5)) + "月至" + Number(end.slice(5)) + "月";
  }
  return [start, end].filter(Boolean).map(monthTitle).join("至");
};
const sendLayouts = [
  ["research-briefing-v1", "研究简报"],
  ["porcelain-sheet-v1", "青瓷经营"],
  ["basics-sheet-v1", "基础对照"],
];

const roleReportNames = ["组装人员", "机长", "交付经理", "供应链经理", "研发工程师", "PM", "TPM", "产总"];
const isRoleReport = (row) => String(row.module || "").includes("角色报告") || roleReportNames.includes(row.role);
const qualityModules = ["IQC", "IPQC", "OQC", "DQA", "QMS", "DOAM"];
const isQualityReport = (row) => !String(row.module || "").includes("角色报告") && qualityModules.includes(String(row.module || ""));

export function WecomReportSendPanel({ role = "", recipient = "", currentFileName = "", canSend = true, roleReportsOnly = false, qualityReportsOnly = false, employees = [] }) {
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState([]);
  const [roleFilter, setRoleFilter] = useState(role || "全部");
  const [keyword, setKeyword] = useState(recipient || "");
  const [month, setMonth] = useState("latest");
  const [sendLayout, setSendLayout] = useState("research-briefing-v1");
  const [receiver, setReceiver] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFolder, setExportFolder] = useState("");
  const [fileFormat, setFileFormat] = useState("pdf");
  const [latestOnly, setLatestOnly] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = await loadAgentReports({ limit: 500, latest: latestOnly ? 1 : 0 });
      const rows = Array.isArray(payload.reports) ? payload.reports : [];
      setReports(rows);
      setSelected((current) => {
        if (currentFileName && rows.some((row) => row.fileName === currentFileName)) return [currentFileName];
        const allowed = new Set(rows.map((row) => row.fileName));
        return current.filter((name) => allowed.has(name));
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "读取已保存报告失败" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [latestOnly]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    let timer = 0;
    const onChanged = () => { window.clearTimeout(timer); timer = window.setTimeout(() => refresh(), 400); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("qms-agent-reports-changed", onChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(timer);
      window.removeEventListener("qms-agent-reports-changed", onChanged);
    };
  }, [latestOnly]);
  useEffect(() => { if (role) setRoleFilter(role); }, [role]);
  useEffect(() => { if (recipient) setKeyword(recipient); }, [recipient]);

  const scoped = roleReportsOnly ? reports.filter(isRoleReport) : qualityReportsOnly ? reports.filter(isQualityReport) : reports;
  const listed = useMemo(() => {
    const map = new Map();
    scoped.forEach((row) => {
      const period = row.period || {};
      const window = selectedWindow(period);
      const key = (qualityReportsOnly ? [row.module || "", window.start, window.end] : [row.role || "", row.recipient || "", window.start, window.end]).join("|");
      const current = map.get(key);
      if (!current || String(row.updatedAt || row.savedAt || "") > String(current.updatedAt || current.savedAt || "")) map.set(key, row);
    });
    return [...map.values()];
  }, [scoped]);
  const months = useMemo(() => [...new Set(listed.map(reportEndMonth).filter(Boolean))].sort((a, b) => b.localeCompare(a)), [listed]);
  const activeMonth = month === "all" ? "" : month === "latest" ? (months[0] || "") : month;
  const nameOptions = useMemo(() => {
    const names = new Set();
    listed.forEach((row) => {
      if (roleFilter !== "全部" && (qualityReportsOnly ? row.module : row.role) !== roleFilter) return;
      if (activeMonth && reportEndMonth(row) !== activeMonth) return;
      const name = String(row.recipient || "").trim();
      if (name) names.add(name);
    });
    return [...names].sort((a, b) => a.localeCompare(b, "zh-CN")).map((name) => ({ name }));
  }, [listed, roleFilter, activeMonth]);
  const visible = listed.filter((row) => {
    if (roleFilter !== "全部" && (qualityReportsOnly ? row.module : row.role) !== roleFilter) return false;
    if (activeMonth && reportEndMonth(row) !== activeMonth) return false;
    if (keyword && String(row.recipient || "").trim() !== keyword) return false;
    return true;
  }).sort((a, b) => (roleReportNames.indexOf(a.role) - roleReportNames.indexOf(b.role)) || String(a.recipient || "").localeCompare(String(b.recipient || ""), "zh-CN"));
  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.includes(row.fileName));
  const selectedRows = reports.filter((row) => selected.includes(row.fileName));

  const toggle = (fileName) => setSelected((current) => current.includes(fileName) ? current.filter((item) => item !== fileName) : [...current, fileName]);
  const toggleVisible = () => setSelected(allVisibleSelected ? selected.filter((item) => !visible.some((row) => row.fileName === item)) : [...new Set([...selected, ...visible.map((row) => row.fileName)])]);

  const runPreview = async () => {
    if (!selectedRows.length) { setStatus({ type: "error", message: "请先勾选要发送的报告" }); return; }
    setStatus({ type: "", message: "正在核对姓名和发送地址…" });
    try {
      const payload = await previewWecomSend(selectedRows.map((row) => ({ fileName: row.fileName, recipient: receiver || row.recipient, role: row.role })));
      setPreview(payload);
      const blocked = (payload.rows || []).filter((row) => row.status !== "ok");
      setStatus({ type: blocked.length ? "warn" : "ok", message: payload.configured ? `可发送 ${(payload.rows || []).filter((row) => row.status === "ok").length} 份，需处理 ${blocked.length} 份` : "还没有可发送的地址。请到系统管理-员工信息填写企业微信 userid" });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "预览失败" });
    }
  };

  const send = async () => {
    if (!canSend) { setStatus({ type: "error", message: "只有主管理员可以发送企业微信" }); return; }
    const ready = (preview?.rows || []).filter((row) => row.status === "ok").map((row) => row.fileName).filter(Boolean);
    const names = receiver ? selected : (ready.length ? ready : selected);
    if (!names.length) { setStatus({ type: "error", message: "没有可发送的报告" }); return; }
    setSending(true);
    const formatLabel = fileFormat === "html" ? "HTML 网页" : "PDF";
    const who = receiver ? receiver : "报告当事人";
    setStatus({ type: "", message: `正在把 ${names.length} 份${formatLabel}发给${who}…` });
    try {
      const payload = await sendWecomReports(names, receiver, { format: fileFormat, layoutProfileId: sendLayout });
      const failed = (payload.results || []).filter((row) => !row.ok);
      setStatus({ type: failed.length ? "warn" : "ok", message: `已发送 ${payload.sent || 0} 份，失败 ${payload.failed || 0} 份${failed[0]?.reason ? `。例如：${failed[0].reason}` : ""}` });
      setPreview({ configured: true, rows: payload.results || [] });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "发送失败" });
    } finally {
      setSending(false);
    }
  };

  const exportPdfs = async () => {
    if (!selected.length) { setStatus({ type: "error", message: "请先勾选要导出的报告" }); return; }
    setExporting(true);
    const formatLabel = fileFormat === "html" ? "HTML 网页" : "PDF";
    setStatus({ type: "", message: `正在生成 ${selected.length} 份${formatLabel}，请稍候…` });
    try {
      const payload = await exportWecomPdfs(selected, { format: fileFormat, layoutProfileId: sendLayout });
      setExportFolder(payload.folder || "");
      const failed = (payload.results || []).filter((row) => !row.ok);
      setStatus({ type: failed.length ? "warn" : "ok", message: `已导出 ${payload.exported || 0} 份到文件夹${payload.folder ? `：${payload.folder}` : ""}${failed[0]?.reason ? `。失败例：${failed[0].reason}` : ""}。按人员分了子文件夹，可直接发给对应的人。` });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "导出失败" });
    } finally {
      setExporting(false);
    }
  };
  const openFolder = async () => {
    if (!exportFolder) return;
    try { await openWecomPdfFolder(exportFolder); } catch (error) { setStatus({ type: "error", message: error.message || "无法打开文件夹" }); }
  };
  const matchLabel = (row) => row.status === "ok" && row.channel === "webhook" ? "发到群" : ({ ok: "可发送", missing: "缺人员", "no-userid": "缺地址", "bad-webhook": "地址不对", duplicate: "重名", error: "失败" }[row.status] || row.status || "");

  return <>
    <section className="qmdp-card quality-agent-controls quality-agent-role-controls">
      <label className="role-field year">月份<select value={activeMonth || "all"} onChange={(event) => setMonth(event.target.value)}><option value="all">全部月份</option>{months.map((item) => <option key={item} value={item}>{monthTitle(item)}</option>)}</select></label>
      <label className="role-field year">{qualityReportsOnly ? "模块" : "岗位"}<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="全部">{qualityReportsOnly ? "全部模块" : "全部岗位"}</option>{(qualityReportsOnly ? qualityModules : roleReportNames).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      {!qualityReportsOnly && <label className="role-field layout">姓名<EmployeeSearchSelect employees={nameOptions} value={keyword} onChange={setKeyword} placeholder="选择或输入姓名" emptyText="当前筛选下没有人员"/></label>}
      <label className="role-field person">报告接收人<EmployeeSearchSelect employees={employees} value={receiver} onChange={(name) => { setReceiver(name); setPreview(null); }} disabled={sending || exporting}/><small>{receiver ? `勾选的报告都发给${receiver}` : (qualityReportsOnly ? "请选择接收人。这些报告一般没有当事人" : "不选则发给报告当事人")}</small></label>
      <label className="role-field year">文件格式<select value={fileFormat} onChange={(event) => setFileFormat(event.target.value)} disabled={sending || exporting}><option value="pdf">PDF</option><option value="html">HTML 网页</option></select></label>
      <label className="role-field layout">发送版式<select value={sendLayout} onChange={(event) => setSendLayout(event.target.value)} disabled={sending || exporting}>{sendLayouts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="wecom-send-actions">
        <div className="wecom-send-tools">
          <label className="wecom-send-check"><input type="checkbox" checked={latestOnly} onChange={(event) => setLatestOnly(event.target.checked)}/>只看每人最新</label>
          <label className="wecom-send-check"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible}/>全选当前列表（{visible.length}）</label>
          <span>{activeMonth ? monthTitle(activeMonth) : "全部月份"} · {roleFilter === "全部" ? (qualityReportsOnly ? "全部模块" : "全部岗位") : roleFilter} · 显示 {visible.length} 份 / 共 {listed.length} 份</span>
        </div>
        <button className="qmdp-secondary-btn" onClick={refresh} disabled={loading}><ArrowsClockwise size={14}/>刷新报告</button>
        <button className="qmdp-secondary-btn" onClick={exportPdfs} disabled={!selected.length || sending || exporting}>{fileFormat === "html" ? <FileHtml size={14}/> : <FilePdf size={14}/>}{exporting ? "正在导出…" : `导出已选 ${selected.length}`}</button>
        {exportFolder && <button className="qmdp-secondary-btn" onClick={openFolder}><FolderOpen size={14}/>打开文件夹</button>}
        <button className="qmdp-secondary-btn" onClick={runPreview} disabled={!selected.length || sending || exporting}>核对已选 {selected.length}</button>
        <button className="qmdp-primary-btn" onClick={send} disabled={!canSend || sending || !selected.length}><PaperPlaneTilt size={15}/>{sending ? "发送中…" : `发送已选 ${selected.length} 份`}</button>
      </div>
    </section>
    {status.message && <p className={`wecom-send-status ${status.type}`}>{status.message}</p>}
    <div className="qmdp-admin-table wecom-send-table">
      <div className="qmdp-admin-row head"><span></span><span>{qualityReportsOnly ? "模块" : "人员"}</span><span>{qualityReportsOnly ? "范围" : "岗位"}</span><span>周期</span><span>报告名称</span><span>保存时间</span><span>匹配</span></div>
      {visible.map((row) => {
        const match = preview?.rows?.find((item) => item.fileName === row.fileName);
        return <div className={`qmdp-admin-row ${selected.includes(row.fileName) ? "is-selected" : ""}`} key={row.fileName}>
          <span><input type="checkbox" checked={selected.includes(row.fileName)} onChange={() => toggle(row.fileName)}/></span>
          <strong>{qualityReportsOnly ? (row.module || "未标注") : (row.recipient || "未署名")}{row.latest ? " · 最新" : ""}</strong>
          <span>{qualityReportsOnly ? (row.recipient || "—") : (row.role || row.module || "")}</span>
          <span>{periodText(row.period)}</span>
          <span className="wecom-report-name" title={row.fileName}>{(qualityReportsOnly ? [row.module, periodText(row.period)] : [row.recipient, row.role, periodText(row.period)]).filter(Boolean).join(" · ") || reportDisplayName(row.fileName)}</span>
          <span>{String(row.updatedAt || row.savedAt || "").replace("T", " ").slice(0, 16)}</span>
          <span className={`wecom-match ${match?.status || ""}`}>{match ? matchLabel(match) : "未核对"}{match?.reason ? ` · ${match.reason}` : ""}</span>
        </div>;
      })}
      {!visible.length && <div className="qmdp-empty compact">{loading ? "正在读取已保存报告…" : "没有符合筛选的已保存报告。请先在角色报告页保存。"}</div>}
    </div>
  </>;
}

export function RoleReportBatchSendPage({ canSend = false, employees = [] }) {
  return <div className="qmdp-page quality-agent-page">
    <div className="quality-agent-hero"><div><span className="qmdp-eyebrow">QUALITY ANALYSIS AGENT / ROLE REPORT</span><h2>批量发送</h2><p>先按月份和岗位筛选。不选接收人就发给报告当事人。发送时再选版式。</p></div><PaperPlaneTilt size={42} weight="duotone" /></div>
    <WecomReportSendPanel canSend={canSend} roleReportsOnly employees={employees} />
  </div>;
}

export function QualityReportBatchSendPage({ canSend = false, employees = [] }) {
  return <div className="qmdp-page quality-agent-page">
    <div className="quality-agent-hero"><div><span className="qmdp-eyebrow">QUALITY ANALYSIS AGENT</span><h2>批量发送</h2><p>先按月份和模块筛选已保存的质量分析报告。请选择接收人，这些报告一般没有当事人。发送时再选版式。</p></div><PaperPlaneTilt size={42} weight="duotone" /></div>
    <WecomReportSendPanel canSend={canSend} qualityReportsOnly employees={employees} />
  </div>;
}
