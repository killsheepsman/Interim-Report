import { useMemo, useState } from "react";
import { ArrowsClockwise, ChartBar, CheckCircle, WarningCircle } from "@phosphor-icons/react";

const EXAM_RECORDS_KEY = "qms-qmdp-exam-records-v1";
const readRecords = () => {
  try { const value = JSON.parse(localStorage.getItem(EXAM_RECORDS_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
};

export function AgentExamStatsPage() {
  const [records, setRecords] = useState(readRecords);
  const passed = useMemo(() => records.filter((item) => item.passed).length, [records]);
  const average = useMemo(() => records.length ? (records.reduce((sum, item) => sum + Number(item.score || 0), 0) / records.length).toFixed(1) : "0.0", [records]);
  return <div className="qmdp-page quality-agent-page">
    <div className="quality-agent-hero"><div><span className="qmdp-eyebrow">QUALITY ANALYSIS AGENT / EXAM</span><h2>Agent考试统计</h2><p>独立查看 Agent角色报告关联考试的回传结果，不与角色报告生成和发送混在一起。</p></div><ChartBar size={42} weight="duotone" /></div>
    <section className="qmdp-card quality-agent-controls"><button className="qmdp-secondary-btn" onClick={() => setRecords(readRecords)}><ArrowsClockwise size={15}/>刷新考试结果</button></section>
    <div className="qmdp-stat-strip"><div><strong>{records.length}</strong><span>考试总数</span></div><div><strong>{passed}</strong><span>通过人数</span></div><div><strong>{average}</strong><span>平均分</span></div></div>
    <section className="qmdp-card quality-agent-library"><header><strong>Agent考试结果</strong><span>{records.length} 条</span></header>{records.map((item) => <div className="quality-agent-library-row" key={item.id}><div><b>{item.recipientName || "未指定人员"} · {item.roleName || "未指定角色"}</b><span>{item.score ?? 0} 分 · {item.correct ?? 0}/{item.total ?? 0} 题 · {item.submittedAt ? new Date(item.submittedAt).toLocaleString("zh-CN") : ""}</span></div>{item.passed ? <CheckCircle size={20} weight="fill" color="#16834a"/> : <WarningCircle size={20} weight="fill" color="#b42318"/>}</div>)}{!records.length && <p className="quality-agent-save-state">暂无 Agent考试结果。</p>}</section>
  </div>;
}
