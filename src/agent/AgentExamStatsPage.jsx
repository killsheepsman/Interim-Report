import { useEffect, useMemo, useState } from "react";
import { ArrowsClockwise, ChartBar, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { loadExamResults } from "../dataStore.js";

const EXAM_RECORDS_KEY = "qms-qmdp-exam-records-v1";
const readRecords = () => {
  try { const value = JSON.parse(localStorage.getItem(EXAM_RECORDS_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
};
const normalizeRecord = (item = {}) => ({
  ...item,
  id: item.id || item.token || item.examToken || `EXAM-${item.submittedAt || item.createdAt || Date.now()}`,
  status: item.status || (item.submittedAt ? "completed" : "pending"),
  total: Number(item.total ?? item.totalQuestions ?? 0),
  correct: Number(item.correct ?? item.correctAnswers ?? 0),
  score: Number(item.score ?? 0),
  passed: item.passed === true || item.isPassed === true,
});
const mergeRecords = (remote = [], local = []) => {
  const map = new Map();
  [...local, ...remote].forEach((item) => {
    const record = normalizeRecord(item);
    map.set(record.token || record.id, { ...(map.get(record.token || record.id) || {}), ...record });
  });
  return [...map.values()].sort((left, right) => String(right.submittedAt || right.createdAt || "").localeCompare(String(left.submittedAt || left.createdAt || "")));
};

export function AgentExamStatsPage() {
  const [records, setRecords] = useState(() => mergeRecords([], readRecords()));
  const [state, setState] = useState({ status: "loading", message: "正在读取服务器考试结果…" });
  const refresh = async () => {
    setState({ status: "loading", message: "正在读取服务器考试结果…" });
    try {
      const response = await loadExamResults({ includePending: true, limit: 1000 });
      setRecords(mergeRecords(response.records || [], readRecords()));
      setState({ status: "done", message: `已同步 ${new Date(response.updatedAt || Date.now()).toLocaleString("zh-CN")}` });
    } catch (error) {
      setRecords(mergeRecords([], readRecords()));
      setState({ status: "error", message: `${error?.message || "服务器结果读取失败"}；当前显示本机回退记录` });
    }
  };
  useEffect(() => { refresh(); }, []);
  const passed = useMemo(() => records.filter((item) => item.passed).length, [records]);
  const completed = useMemo(() => records.filter((item) => item.status === "completed"), [records]);
  const average = useMemo(() => completed.length ? (completed.reduce((sum, item) => sum + Number(item.score || 0), 0) / completed.length).toFixed(1) : "0.0", [completed]);
  return <div className="qmdp-page quality-agent-page">
    <div className="quality-agent-hero"><div><span className="qmdp-eyebrow">QUALITY ANALYSIS AGENT / EXAM</span><h2>Agent考试统计</h2><p>独立查看 Agent角色报告关联考试的回传结果，不与角色报告生成和发送混在一起。</p></div><ChartBar size={42} weight="duotone" /></div>
    <section className="qmdp-card quality-agent-controls"><button className="qmdp-secondary-btn" onClick={refresh} disabled={state.status === "loading"}><ArrowsClockwise size={15}/>刷新考试结果</button><span>{state.message}</span></section>
    <div className="qmdp-stat-strip"><div><strong>{completed.length}</strong><span>已提交考试</span></div><div><strong>{passed}</strong><span>通过人数</span></div><div><strong>{average}</strong><span>平均分</span></div><div><strong>{records.filter((item) => item.status === "pending").length}</strong><span>待完成</span></div></div>
    <section className="qmdp-card quality-agent-library"><header><strong>Agent考试结果</strong><span>{records.length} 条（服务器结果优先）</span></header>{records.map((item) => <div className="quality-agent-library-row" key={item.token || item.id}><div><b>{item.recipientName || "未指定人员"} · {item.roleName || "未指定角色"}</b><span>{item.status === "completed" ? `${item.score} 分 · ${item.correct}/${item.total} 题 · ${item.passed ? "已通过" : "未通过"}` : item.status === "pending" ? `待完成 · ${item.total} 题` : "已过期"} · {item.submittedAt || item.createdAt ? new Date(item.submittedAt || item.createdAt).toLocaleString("zh-CN") : ""}</span></div>{item.status === "completed" && item.passed ? <CheckCircle size={20} weight="fill" color="#16834a"/> : <WarningCircle size={20} weight="fill" color="#b42318"/>}</div>)}{!records.length && <p className="quality-agent-save-state">暂无 Agent考试结果。</p>}</section>
  </div>;
}
