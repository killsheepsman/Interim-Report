import { useEffect, useMemo, useState } from "react";
import { PaperPlaneTilt, ArrowsClockwise, FilePdf, FolderOpen } from "@phosphor-icons/react";
import { exportWecomPdfs, loadAgentReports, openWecomPdfFolder, previewWecomSend, sendWecomReports } from "../dataStore.js";

const reportDisplayName = (fileName = "") => String(fileName || "").replace(/\.md$/i, "");
const periodText = (period = {}) => {
  const start = period.start || period._periodStart || "";
  const end = period.end || period._periodEnd || "";
  return start && end ? `${start} 至 ${end}` : "周期未标注";
};

export function WecomReportSendPanel({ role = "", recipient = "", currentFileName = "", canSend = true }) {
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState([]);
  const [roleFilter, setRoleFilter] = useState(role || "全部");
  const [keyword, setKeyword] = useState(recipient || "");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFolder, setExportFolder] = useState("");
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

  const roles = useMemo(() => ["全部", ...[...new Set(reports.map((row) => row.role).filter(Boolean))]], [reports]);
  const visible = reports.filter((row) => (roleFilter === "全部" || row.role === roleFilter) && (!keyword || `${row.recipient} ${row.role} ${row.fileName}`.includes(keyword.trim())));
  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.includes(row.fileName));
  const selectedRows = reports.filter((row) => selected.includes(row.fileName));

  const toggle = (fileName) => setSelected((current) => current.includes(fileName) ? current.filter((item) => item !== fileName) : [...current, fileName]);
  const toggleVisible = () => setSelected(allVisibleSelected ? selected.filter((item) => !visible.some((row) => row.fileName === item)) : [...new Set([...selected, ...visible.map((row) => row.fileName)])]);

  const runPreview = async () => {
    if (!selectedRows.length) { setStatus({ type: "error", message: "请先勾选要发送的报告" }); return; }
    setStatus({ type: "", message: "正在核对姓名和 userid…" });
    try {
      const payload = await previewWecomSend(selectedRows.map((row) => ({ fileName: row.fileName, recipient: row.recipient, role: row.role })));
      setPreview(payload);
      const blocked = (payload.rows || []).filter((row) => row.status !== "ok");
      setStatus({ type: blocked.length ? "warn" : "ok", message: payload.configured ? `可发送 ${(payload.rows || []).filter((row) => row.status === "ok").length} 份，需处理 ${blocked.length} 份` : "企业微信配置还不完整，请先到系统管理-企业微信保存 CorpId / AgentId / Secret" });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "预览失败" });
    }
  };

  const send = async () => {
    if (!canSend) { setStatus({ type: "error", message: "只有主管理员可以发送企业微信" }); return; }
    const ready = (preview?.rows || []).filter((row) => row.status === "ok").map((row) => row.fileName).filter(Boolean);
    const names = ready.length ? ready : selected;
    if (!names.length) { setStatus({ type: "error", message: "没有可发送的报告" }); return; }
    setSending(true);
    setStatus({ type: "", message: `正在发送 ${names.length} 份 PDF…` });
    try {
      const payload = await sendWecomReports(names);
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
    setStatus({ type: "", message: `正在生成 ${selected.length} 份 PDF，请稍候…` });
    try {
      const payload = await exportWecomPdfs(selected);
      setExportFolder(payload.folder || "");
      const failed = (payload.results || []).filter((row) => !row.ok);
      setStatus({ type: failed.length ? "warn" : "ok", message: `已导出 ${payload.exported || 0} 份到文件夹${payload.folder ? `：${payload.folder}` : ""}${failed[0]?.reason ? `。失败例：${failed[0].reason}` : ""}。按人员分了子文件夹，可直接发给对应的人。` });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "导出 PDF 失败" });
    } finally {
      setExporting(false);
    }
  };
  const openFolder = async () => {
    if (!exportFolder) return;
    try { await openWecomPdfFolder(exportFolder); } catch (error) { setStatus({ type: "error", message: error.message || "无法打开文件夹" }); }
  };
  const matchLabel = (row) => ({ ok: "可发送", missing: "缺人员", "no-userid": "缺userid", duplicate: "重名", error: "失败" }[row.status] || row.status || "");

  return <section className="qmdp-card wecom-send-panel">
    <header>
      <div><strong>企业微信发送</strong><span>角色报告保存后会自动出现在这里。导出 PDF 按勾选的那一份，不会改成别的月份。</span></div>
      <div>
        <button className="qmdp-secondary-btn" onClick={refresh} disabled={loading}><ArrowsClockwise size={14}/>刷新报告</button>
        <button className="qmdp-secondary-btn" onClick={exportPdfs} disabled={!selected.length || sending || exporting}><FilePdf size={14}/>{exporting ? "正在导出…" : `导出已选 PDF ${selected.length}`}</button>
        {exportFolder && <button className="qmdp-secondary-btn" onClick={openFolder}><FolderOpen size={14}/>打开导出文件夹</button>}
        <button className="qmdp-secondary-btn" onClick={runPreview} disabled={!selected.length || sending || exporting}>核对已选 {selected.length}</button>
        <button className="qmdp-primary-btn" onClick={send} disabled={!canSend || sending || !selected.length}><PaperPlaneTilt size={15}/>{sending ? "发送中…" : `发送已选 ${selected.length} 份`}</button>
      </div>
    </header>
    <div className="qmdp-toolbar">
      <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>{roles.map((item) => <option key={item}>{item}</option>)}</select>
      <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按姓名筛选"/>
      <label className="wecom-send-check"><input type="checkbox" checked={latestOnly} onChange={(event) => setLatestOnly(event.target.checked)}/>只看每人最新</label>
      <label className="wecom-send-check"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible}/>全选当前列表（{visible.length}）</label>
      <span>已保存 {reports.length} 份 · 当前显示 {visible.length} 份{latestOnly ? " · 已按人员+周期同步最新" : ""}</span>
    </div>
    {status.message && <p className={`wecom-send-status ${status.type}`}>{status.message}</p>}
    <div className="qmdp-admin-table wecom-send-table">
      <div className="qmdp-admin-row head"><span></span><span>人员</span><span>角色</span><span>周期</span><span>报告名称</span><span>保存时间</span><span>匹配</span></div>
      {visible.map((row) => {
        const match = preview?.rows?.find((item) => item.fileName === row.fileName);
        return <div className={`qmdp-admin-row ${selected.includes(row.fileName) ? "is-selected" : ""}`} key={row.fileName}>
          <span><input type="checkbox" checked={selected.includes(row.fileName)} onChange={() => toggle(row.fileName)}/></span>
          <strong>{row.recipient || "未署名"}{row.latest ? " · 最新" : ""}</strong>
          <span>{row.role || row.module || ""}</span>
          <span>{periodText(row.period)}</span>
          <span className="wecom-report-name" title={row.fileName}>{reportDisplayName(row.fileName)}</span>
          <span>{String(row.updatedAt || row.savedAt || "").replace("T", " ").slice(0, 16)}</span>
          <span className={`wecom-match ${match?.status || ""}`}>{match ? matchLabel(match) : "未核对"}{match?.reason ? ` · ${match.reason}` : ""}</span>
        </div>;
      })}
      {!visible.length && <div className="qmdp-empty compact">{loading ? "正在读取已保存报告…" : "没有符合筛选的已保存报告。请先在角色报告页保存。"}</div>}
    </div>
  </section>;
}
