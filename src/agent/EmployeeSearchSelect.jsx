import { useMemo, useState } from "react";
import { employeeChoices } from "../dataStore.js";

export function EmployeeSearchSelect({ employees = [], value = "", onChange, disabled = false, placeholder = "", emptyText = "" }) {
  const choices = useMemo(() => employeeChoices(employees), [employees]);
  const selected = choices.find((item) => item.name === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const keyword = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => {
    const rows = keyword
      ? choices.filter((item) => item.name.toLocaleLowerCase().includes(keyword) || item.label.toLocaleLowerCase().includes(keyword))
      : choices;
    return rows.slice(0, 40);
  }, [choices, keyword]);
  const display = open ? query : (selected?.label || "");
  return <div className="quality-agent-recipient-combobox report-employee-search" onBlur={(event) => { if (event.currentTarget.contains(event.relatedTarget)) return; setOpen(false); setQuery(""); }}>
    <input className="quality-agent-recipient-input" value={display} disabled={disabled} placeholder={choices.length ? (placeholder || "输入姓名搜索") : (emptyText || placeholder || "员工信息暂无名单")} autoComplete="off" aria-label="指定收件人" onFocus={() => { if (disabled) return; setOpen(true); setQuery(""); }} onChange={(event) => { setQuery(event.target.value); setOpen(true); if (!event.target.value.trim()) onChange(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (filtered[0]) { onChange(filtered[0].name); setQuery(""); setOpen(false); } } if (event.key === "Escape") { setOpen(false); setQuery(""); } }} />
    {value && !disabled && <button type="button" className="quality-agent-recipient-clear" aria-label="清除收件人" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(""); setQuery(""); setOpen(false); }}>×</button>}
    {open && !disabled && <div className="quality-agent-recipient-options" role="listbox">{filtered.map((item) => <button type="button" role="option" aria-selected={item.name === value} key={item.name} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(item.name); setQuery(""); setOpen(false); }}>{item.label}</button>)}{!filtered.length && <span>没有匹配的人员</span>}{choices.length > filtered.length && <small>{keyword ? "请继续输入，缩小范围" : `共 ${choices.length} 人，输入姓名后筛选`}</small>}</div>}
  </div>;
}
