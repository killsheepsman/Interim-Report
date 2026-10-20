import { useEffect, useMemo, useRef, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { AI_EMPLOYEE_DELIVERIES, AI_EMPLOYEE_EVENT, configBody, configGaps, describeSchedule, previewSchedule, matchEmployeeRole, readAiEmployeeDraft, readAiEmployeeLog, readAiEmployeeSaved, ROLE_NAMES, runAiEmployeeCycle, writeAiEmployeeDraft, writeAiEmployeeSaved } from "./roleAutoReport.js";

const personKey = (row, index) => String(row.id || row.wecom || row.name || "row") + "-" + index;

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
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [namedQuery, setNamedQuery] = useState(() => readAiEmployeeDraft().delivery.named || "");
  useEffect(() => {
    const sync = () => { setSavedBody(configBody(readAiEmployeeSaved() || {})); setLog(readAiEmployeeLog()); };
    window.addEventListener(AI_EMPLOYEE_EVENT, sync);
    return () => window.removeEventListener(AI_EMPLOYEE_EVENT, sync);
  }, []);
  const selected = useMemo(() => new Set(draft.people), [draft.people]);
  const gaps = configGaps(draft);
  const saved = readAiEmployeeSaved();
  const pending = !saved || configBody(draft) !== savedBody;
  const depts = useMemo(() => [...new Set(employees.map((row) => String(row.dept || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")), [employees]);
  const rows = useMemo(() => employees.map((row, index) => ({ ...row, key: personKey(row, index), roleName: matchEmployeeRole(row), name: String(row.name || "").trim() })).filter((row) => row.name), [employees]);
  const visible = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (roleFilter === "未填岗位" && row.roleName) return false;
      if (roleFilter && roleFilter !== "未填岗位" && row.roleName !== roleFilter) return false;
      if (deptFilter && row.dept !== deptFilter) return false;
      if (!text) return true;
      return [row.name, row.dept, row.role, row.roleName, row.id].join(" ").toLowerCase().includes(text);
    });
  }, [rows, keyword, roleFilter, deptFilter]);
  const namedOptions = useMemo(() => {
    const text = namedQuery.trim().toLowerCase();
    return rows.filter((row) => !text || row.name.toLowerCase().includes(text)).slice(0, 40);
  }, [rows, namedQuery]);
  const change = (next) => { const normalized = writeAiEmployeeDraft(next); setDraft(normalized); };
  const toggle = (name) => change({ ...draft, people: selected.has(name) ? draft.people.filter((item) => item !== name) : [...draft.people, name] });
  const selectVisible = () => change({ ...draft, people: [...new Set([...draft.people, ...visible.map((row) => row.name)])] });
  const clearVisible = () => { const hide = new Set(visible.map((row) => row.name)); change({ ...draft, people: draft.people.filter((name) => !hide.has(name)) }); };
  const save = () => { if (gaps.length) return; const next = writeAiEmployeeSaved(draft); setDraft(next); setSavedBody(configBody(next)); };
  return <div className="qmdp-page">
    <header className="qmdp-page-header"><div><span className="qmdp-eyebrow">岗位角色报告</span><h2>AI员工</h2><p>先把下面四项配好并保存。保存之后不用再按开始，到了设定日期，只要这个网页还开着，AI员工就按勾选自己核对、发送或报警。</p></div></header>
    <section className="qmdp-card" style={{padding:16, marginBottom:12}}>
      <strong>{log.phase || "等待配置"}</strong>
      <p style={{margin:"8px 0 0"}}>{log.summary || "还没有保存配置。"}</p>
      {pending && <p style={{margin:"8px 0 0"}}>当前修改还没保存。没保存之前，AI员工仍按上一次的配置做；如果从来没保存过，就不会开工。</p>}
    </section>
    <section className="qmdp-card" style={{display:"grid", gap:16, padding:16}}>
      <div>
        <h3>1. 授权</h3>
        <p>只处理勾选的人。没勾选的人不做。</p>
        <div style={{display:"flex", gap:12, flexWrap:"wrap", alignItems:"end"}}>
          <label>查找<input value={keyword} placeholder="姓名、部门、岗位" onChange={(event) => setKeyword(event.target.value)} /></label>
          <label>岗位<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">全部</option>{ROLE_NAMES.map((role) => <option key={role}>{role}</option>)}<option value="未填岗位">未填岗位</option></select></label>
          <label>部门<select value={deptFilter} onChange={(event) => setDeptFilter(event.target.value)}><option value="">全部</option>{depts.map((dept) => <option key={dept}>{dept}</option>)}</select></label>
        </div>
        <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginTop:8}}>
          <button type="button" className="qmdp-secondary-btn" onClick={selectVisible}>勾选当前筛选</button>
          <button type="button" className="qmdp-secondary-btn" onClick={clearVisible}>取消当前筛选</button>
          <span>员工 {rows.length} 人，当前显示 {visible.length} 人，已选 {selected.size} 人</span>
        </div>
        <p style={{margin:"8px 0 0", color:"#71859a"}}>第一项是岗位，后面是职位和部门。岗位在系统管理的员工信息里导入。</p>
        <div style={{maxHeight:280, overflow:"auto", border:"1px solid #d7e2ed", borderRadius:8, padding:8, marginTop:8}}>
          {visible.map((row) => <label key={row.key} style={{display:"flex", gap:8, alignItems:"center", padding:"4px 2px"}}><input type="checkbox" checked={selected.has(row.name)} onChange={() => toggle(row.name)} /><span>{row.name}</span><small style={{color:"#71859a"}}>{row.post || "未填岗位"}{row.role ? " · " + row.role : ""}{row.dept ? " · " + row.dept : ""}</small></label>)}
          {!visible.length && <div className="qmdp-empty compact">没有符合筛选的人</div>}
        </div>
      </div>
      <div>
        <h3>2. 周期</h3>
        <p>填数字。到了这一天，按整月统计，从 1 日到月末。</p>
        <div style={{display:"flex", gap:16, flexWrap:"wrap"}}>
          <label>每月第几日启动<input type="number" min="1" max="28" value={draft.period.day} onChange={(event) => change({ ...draft, period: { ...draft.period, day: event.target.value === "" ? "" : Number(event.target.value) } })} /></label>
          <label>统计往前几个月<input type="number" min="0" max="12" value={draft.period.monthsBack} onChange={(event) => change({ ...draft, period: { ...draft.period, monthsBack: event.target.value === "" ? "" : Number(event.target.value) } })} /></label>
        </div>
        <p>{previewSchedule(draft)}。填 0 表示当月，填 1 表示上一个自然月。</p>
      </div>
      <div>
        <h3>3. 合格</h3>
        <p>按这里填的字核对报告。产总看最后一个标题，其他岗位看本月措施那一行。没有这个月的快照，也算不合格。</p>
        <div style={{display:"grid", gap:8, maxWidth:520}}>
          <label>报告里必须有的标题<input value={draft.qualify.mustTitle} onChange={(event) => change({ ...draft, qualify: { ...draft.qualify, mustTitle: event.target.value } })} /></label>
          <label>措施标题<input value={draft.qualify.actionTitle} onChange={(event) => change({ ...draft, qualify: { ...draft.qualify, actionTitle: event.target.value } })} /></label>
          <label>产总用的标题<input value={draft.qualify.directorTitle} onChange={(event) => change({ ...draft, qualify: { ...draft.qualify, directorTitle: event.target.value } })} /></label>
          <label>不能出现的词，一行一个<textarea rows={4} value={draft.qualify.banned} onChange={(event) => change({ ...draft, qualify: { ...draft.qualify, banned: event.target.value } })} /></label>
        </div>
      </div>
      <div>
        <h3>4. 发给谁</h3>
        <p>勾选哪几条，到点就做哪几条。没勾选的不做。</p>
        <div style={{display:"grid", gap:6}}>
          {AI_EMPLOYEE_DELIVERIES.map((item) => <label key={item.key} style={{display:"flex", gap:8, alignItems:"center"}}><input type="checkbox" checked={draft.delivery[item.key] === true} onChange={(event) => change({ ...draft, delivery: { ...draft.delivery, [item.key]: event.target.checked } })} />{item.label}</label>)}
        </div>
        <div style={{display:"flex", gap:12, flexWrap:"wrap", marginTop:8, alignItems:"end"}}>
          <label>指定人<input value={namedQuery} placeholder="输入姓名筛选" onChange={(event) => setNamedQuery(event.target.value)} /></label>
          <label>选中<select value={draft.delivery.named} onChange={(event) => { change({ ...draft, delivery: { ...draft.delivery, named: event.target.value } }); setNamedQuery(event.target.value); }}><option value="">请选择</option>{namedOptions.map((row) => <option key={row.key} value={row.name}>{row.name}</option>)}</select></label>
        </div>
      </div>
      {!!gaps.length && <p>还不能保存：{gaps.join("；")}</p>}
      <button type="button" className="qmdp-primary-btn" disabled={!!gaps.length} onClick={save}>保存配置</button>
    </section>
    {!!log.alarms?.length && <section className="qmdp-card" style={{padding:16, marginTop:12}}>
      <h3 style={{display:"flex", gap:8, alignItems:"center"}}><WarningCircle size={18}/>报警 {log.alarms.length} 条</h3>
      {log.alarms.map((item) => <p key={item.name + item.detail} style={{margin:"8px 0"}}><strong>{item.name}</strong>{"　"}{item.detail}</p>)}
    </section>}
    {!!log.passes?.length && <section className="qmdp-card" style={{padding:16, marginTop:12}}>
      <h3>通过 {log.passes.length} 人</h3>
      {log.passes.map((item) => <p key={item.name + item.detail} style={{margin:"8px 0"}}><strong>{item.name}</strong>{"　"}{item.detail}</p>)}
    </section>}
  </div>;
}
