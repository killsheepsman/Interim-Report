import { loadAgentSkills, loadQualityAgentSnapshotRegistry, notifyWecomText, requestAiChat, saveAgentReportFile, saveLocalAgentReport, searchAiWeb, sendWecomReports } from "../dataStore.js";
import { actionLines, annotateFacts, buildBriefMessages, buildChatMessages, digestSnapshot, digestUseful, fallbackSkill, monthInQuestion, reviewBrief, SKILL_ID } from "./aiEmployeeSkill.js";
import { buildBriefFacts, runEmployeeTurn } from "./aiEmployeeAgent.js";
import { normalizeReportPresentationProfile } from "./reportPresentationProfiles.js";

export const AI_EMPLOYEE_EVENT = "qms-ai-employee-config";
export const ROLE_NAMES = ["组装人员", "机长", "交付经理", "供应链经理", "研发工程师", "PM", "TPM", "产总"];
const SAVED_KEY = "qms-ai-employee-config-v2";
const DRAFT_KEY = "qms-ai-employee-draft-v2";
const LOG_KEY = "qms-ai-employee-log-v2";
const RUN_KEY = "qms-ai-employee-run-v2";
const RETRY_MS = 30 * 60 * 1000;
const REQUIRED = ["IQC", "IPQC", "OQC", "DQA", "DOAM"];

const asInt = (value) => {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isInteger(number) ? number : "";
};
const cleanRules = (value) => [...new Set((Array.isArray(value) ? value : String(value || "").split("\n")).map((item) => String(item || "").replace(/\s+/g, " ").trim()).filter((item) => item && item.length <= 200))].slice(0, 20);

export const blankAiEmployeeConfig = () => ({
  period: { day: 8, monthsBack: 1 },
  job: { brief: true, alarmMissing: true },
  recipient: "",
  addedRules: [],
  confirmed: false,
  savedAt: "",
});

export const normalizeAiEmployeeConfig = (value = {}) => {
  const base = blankAiEmployeeConfig();
  const period = value.period || {};
  const job = value.job || {};
  return {
    period: { day: asInt(period.day ?? base.period.day), monthsBack: asInt(period.monthsBack ?? base.period.monthsBack) },
    job: { brief: job.brief !== false, alarmMissing: job.alarmMissing !== false },
    recipient: String(value.recipient || "").trim(),
    skillId: String(value.skillId || "quality-director-brief").trim() || "quality-director-brief",
    layoutProfileId: normalizeReportPresentationProfile(value.layoutProfileId || "porcelain-sheet-v1"),
    addedRules: cleanRules(value.addedRules),
    confirmed: value.confirmed === true,
    savedAt: String(value.savedAt || ""),
  };
};

const readJson = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
};

export const readAiEmployeeDraft = () => normalizeAiEmployeeConfig(readJson(DRAFT_KEY) || readJson(SAVED_KEY) || {});
export const readAiEmployeeSaved = () => {
  const saved = readJson(SAVED_KEY);
  return saved?.confirmed === true ? normalizeAiEmployeeConfig(saved) : null;
};
export const writeAiEmployeeDraft = (config) => {
  const next = normalizeAiEmployeeConfig({ ...config, confirmed: false });
  localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  return next;
};
export const writeAiEmployeeSaved = (config) => {
  const next = normalizeAiEmployeeConfig({ ...config, confirmed: true, savedAt: new Date().toISOString() });
  localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(AI_EMPLOYEE_EVENT));
  return next;
};
export const configBody = (config) => JSON.stringify(normalizeAiEmployeeConfig(config || {}), (key, value) => (key === "confirmed" || key === "savedAt" ? undefined : value));
export const configGaps = (config) => {
  const gaps = [];
  const day = config?.period?.day;
  const back = config?.period?.monthsBack;
  if (!Number.isInteger(day) || day < 1 || day > 28) gaps.push("每月第几日要填 1 到 28");
  if (!Number.isInteger(back) || back < 0 || back > 12) gaps.push("往前几个月要填 0 到 12");
  if (!config?.job?.brief && !config?.job?.alarmMissing) gaps.push("至少勾选一件到点要做的事");
  if (!String(config?.recipient || "").trim()) gaps.push("要选接收人");
  return gaps;
};

export const monthPeriod = (yearMonth) => {
  const match = String(yearMonth || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return { year, month, start: year + "-" + mm + "-01", end: year + "-" + mm + "-" + String(last).padStart(2, "0"), label: year + "年" + month + "月" };
};
const shiftMonth = (year, month, back) => {
  const date = new Date(year, month - 1 - back, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
};
export const triggerMonth = (now, day) => (now.getDate() >= day ? { year: now.getFullYear(), month: now.getMonth() + 1 } : shiftMonth(now.getFullYear(), now.getMonth() + 1, 1));
export const nextTriggerDate = (now, day) => {
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), day);
  return now < thisMonth ? thisMonth : new Date(now.getFullYear(), now.getMonth() + 1, day);
};
export const scheduleOf = (config, now = new Date()) => {
  const day = Number(config?.period?.day);
  const back = Number(config?.period?.monthsBack);
  if (!Number.isInteger(day) || day < 1 || day > 28 || !Number.isInteger(back) || back < 0) return null;
  const trigger = triggerMonth(now, day);
  const stats = shiftMonth(trigger.year, trigger.month, back);
  const period = monthPeriod(stats.year + "-" + String(stats.month).padStart(2, "0"));
  if (!period) return null;
  return { day, back, trigger, triggerKey: trigger.year + "-" + String(trigger.month).padStart(2, "0"), triggerDate: new Date(trigger.year, trigger.month - 1, day), period };
};
export const describeSchedule = (config, now = new Date()) => {
  const schedule = scheduleOf(config, now);
  if (!schedule) return "周期还没填完整";
  const backText = schedule.back === 0 ? "当月" : schedule.back === 1 ? "上一个自然月" : "往前 " + schedule.back + " 个月";
  return "每月 " + schedule.day + " 日启动，统计" + backText + "：" + schedule.period.label + "（" + schedule.period.start + " 至 " + schedule.period.end + "）";
};
const shouldRun = (config, now, schedule) => {
  if (!config?.confirmed || !schedule) return false;
  const savedAt = new Date(config.savedAt);
  if (Number.isNaN(savedAt.getTime())) return false;
  const end = new Date(schedule.trigger.year, schedule.trigger.month - 1, schedule.day, 23, 59, 59);
  if (savedAt > end) return false;
  return now >= schedule.triggerDate;
};
const dateText = (date) => date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日";
export const previewSchedule = (config, now = new Date()) => {
  const day = Number(config?.period?.day);
  const back = Number(config?.period?.monthsBack);
  if (!Number.isInteger(day) || day < 1 || day > 28 || !Number.isInteger(back) || back < 0 || back > 12) return "周期还没填完整";
  const next = nextTriggerDate(now, day);
  const stats = shiftMonth(next.getFullYear(), next.getMonth() + 1, back);
  const period = monthPeriod(stats.year + "-" + String(stats.month).padStart(2, "0"));
  if (!period) return "周期还没填完整";
  return "下一次是 " + dateText(next) + "，统计 " + period.label + "（" + period.start + " 至 " + period.end + "）";
};

const emptyLog = () => ({ phase: "等待配置", summary: "", alarms: [], passes: [], actions: [], brief: "", progress: 0, activity: [], updatedAt: "" });
export const readAiEmployeeLog = () => ({ ...emptyLog(), ...(readJson(LOG_KEY) || {}) });
const readRun = () => readJson(RUN_KEY) || { buckets: {} };
const sameList = (left = [], right = []) => JSON.stringify(left) === JSON.stringify(right);
const publishLog = (next) => {
  const prev = readAiEmployeeLog();
  const keep = next.report === false;
  const value = {
    phase: keep ? (prev.phase || "") : (next.phase || ""),
    summary: keep ? (prev.summary || "") : (next.summary || ""),
    alarms: keep ? (prev.alarms || []) : (next.alarms || []),
    passes: keep ? (prev.passes || []) : (next.passes || []),
    actions: next.actions || prev.actions || [],
    brief: next.brief == null ? (prev.brief || "") : next.brief,
    fileName: keep ? (prev.fileName || "") : String(next.fileName || ""),
    savedPath: keep ? (prev.savedPath || "") : String(next.savedPath || ""),
    recipient: keep ? (prev.recipient || "") : String(next.recipient || ""),
    resultPhase: keep ? (prev.resultPhase || "") : (next.phase || ""),
    resultSummary: keep ? (prev.resultSummary || "") : (next.summary || ""),
    resultAt: keep ? (prev.resultAt || "") : new Date().toISOString(),
    progress: next.progress == null ? (prev.progress || 0) : next.progress,
    activity: Array.isArray(next.activity) ? next.activity : (prev.activity || []),
    updatedAt: new Date().toISOString(),
  };
  if (prev.phase === value.phase && prev.summary === value.summary && sameList(prev.alarms, value.alarms) && sameList(prev.passes, value.passes) && prev.brief === value.brief && prev.fileName === value.fileName && prev.savedPath === value.savedPath && prev.progress === value.progress && (prev.activity || []).length === (value.activity || []).length) return prev;
  localStorage.setItem(LOG_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(AI_EMPLOYEE_EVENT));
  return value;
};
const useridOf = (row) => String(row?.wecom || row?.id || "").trim();
const covers = (entry, period) => {
  const range = entry?.dateRange || {};
  const key = period.year + "-" + String(period.month).padStart(2, "0");
  if (String(range.periodKey || "") === key) return true;
  const start = range.start2026 || range.start || "";
  const end = range.end2026 || range.end || "";
  return Boolean(start && end && start <= period.start && end >= period.end);
};
const pickEntries = (history, period) => {
  const best = new Map();
  (Array.isArray(history) ? history : []).forEach((entry) => {
    const module = String(entry?.module || "");
    if (![...REQUIRED, "QMS"].includes(module) || !covers(entry, period)) return;
    if (entry?.status && entry.status !== "ready") return;
    const score = (entry?.dateRange?.granularity || entry?.granularity) === "month" ? 2 : 1;
    const current = best.get(module);
    const prev = current ? ((current.dateRange?.granularity || current.granularity) === "month" ? 2 : 1) : -1;
    if (!current || score > prev || (score === prev && String(entry.generatedAt || "") > String(current.generatedAt || ""))) best.set(module, entry);
  });
  return best;
};
const loadSkillText = async (skillId = SKILL_ID) => {
  const id = String(skillId || SKILL_ID).trim() || SKILL_ID;
  try {
    const payload = await loadAgentSkills([id]);
    const text = payload?.skills?.find((item) => item.id === id)?.content || "";
    if (text.trim()) return text;
  } catch {}
  if (id === SKILL_ID) return fallbackSkill();
  throw new Error("没有读到所选简报技能");
};
const notifyPerson = async (employees, name, text) => {
  const row = (employees || []).find((item) => String(item?.name || "").trim() === name);
  const userid = useridOf(row);
  if (!userid) return name + "没有工号，消息没有发出去";
  await notifyWecomText(userid, text);
  return "";
};

const monthCandidates = (history, module, period) => {
  const key = period.year + "-" + String(period.month).padStart(2, "0");
  return (Array.isArray(history) ? history : [])
    .filter((entry) => String(entry?.module || "") === module && (!entry?.status || entry.status === "ready") && entry?.id)
    .filter((entry) => (entry?.dateRange?.granularity || entry?.granularity) === "month" && String(entry?.dateRange?.periodKey || "").startsWith(String(period.year) + "-"))
    .sort((left, right) => {
      const leftExact = String(left?.dateRange?.periodKey || "") === key ? 1 : 0;
      const rightExact = String(right?.dateRange?.periodKey || "") === key ? 1 : 0;
      if (leftExact !== rightExact) return rightExact - leftExact;
      return String(right.generatedAt || "").localeCompare(String(left.generatedAt || ""));
    });
};
const hasMonthRow = (digest, period) => {
  const label = String(period.month) + "月";
  return Object.values(digest || {}).some((item) => Array.isArray(item?.monthly) && item.monthly.some((row) => String(row?.month || "").replace(/\s/g, "") === label));
};
export const collectCompanyFacts = async (period) => {
  const index = await loadQualityAgentSnapshotRegistry({ indexOnly: true });
  if (!index) return { facts: [], missing: ["没有连上数据服务，已经保存的快照这次没有读到"] };
  const history = index?.history || [];
  const missing = [];
  const facts = [];
  for (const module of [...REQUIRED, "QMS"]) {
    const candidates = monthCandidates(history, module, period);
    if (!candidates.length) {
      if (REQUIRED.includes(module)) missing.push(module + " 没有盖住 " + period.label + " 的快照");
      continue;
    }
    let chosen = null;
    let fallback = null;
    for (const meta of candidates.slice(0, 4)) {
      const loaded = await loadQualityAgentSnapshotRegistry({ entryId: meta.id });
      const entry = loaded?.history?.[0] || meta;
      const digest = digestSnapshot(entry);
      if (!digestUseful(digest)) continue;
      if (hasMonthRow(digest, period)) { chosen = digest; break; }
      if (!fallback) fallback = digest;
    }
    const digest = chosen || fallback;
    if (!digest) {
      if (REQUIRED.includes(module)) missing.push(module + " 快照里没有可用指标");
      continue;
    }
    facts.push(digest);
  }
  return { facts, missing };
};

let cycleLock = false;

export const runAiEmployeeCycle = async (employees = [], now = new Date()) => {
  if (cycleLock) return readAiEmployeeLog();
  const saved = readAiEmployeeSaved();
  if (!saved) return publishLog({ phase: "等待配置", summary: "配置还没保存。保存之前不会自己开工。", alarms: [], passes: [], report: false });
  const gaps = configGaps(saved);
  if (gaps.length) return publishLog({ phase: "等待配置", summary: gaps.join("；"), alarms: [], passes: [], report: false });
  const schedule = scheduleOf(saved, now);
  if (!shouldRun(saved, now, schedule)) {
    const log = readAiEmployeeLog();
    return publishLog({ phase: "未到日期", summary: previewSchedule(saved, now) + (schedule && now >= schedule.triggerDate ? "。已经错过的那一轮不补做。" : "。"), alarms: log.alarms || [], passes: log.passes || [], actions: log.actions, brief: log.brief, report: false });
  }
  const runState = readRun();
  const bucketKey = schedule.triggerKey + "|" + saved.savedAt;
  const bucket = runState.buckets[bucketKey] || { attempts: 0, notified: false };
  if (bucket.status === "sent" || bucket.status === "pass") {
    return publishLog({ phase: "本轮已完成", summary: schedule.period.label + "的公司简报已经处理过。", alarms: [], passes: [{ name: "公司简报", detail: bucket.detail || "已完成" }], actions: bucket.actions || [], brief: bucket.brief || "", report: false });
  }
  if (bucket.status === "alarm" && Date.now() - Number(bucket.at || 0) < RETRY_MS) return readAiEmployeeLog();
  if (bucket.status === "fail" && Number(bucket.attempts || 0) >= 2) {
    return publishLog({ phase: "本轮已停下", summary: schedule.period.label + "写了两次仍不合格，这一轮停下。", alarms: [{ name: "公司简报", detail: bucket.detail || "不合格" }], passes: [], actions: bucket.actions || [], brief: bucket.brief || "" });
  }
  cycleLock = true;
  publishLog({ phase: "正在处理", summary: "正在核对 " + schedule.period.label + " 的快照。", alarms: [], passes: [] });
  try {
    const { facts, missing: realMissing } = await collectCompanyFacts(schedule.period);
    const nowMs = Date.now();
    if (realMissing.length) {
      bucket.status = "alarm";
      bucket.at = nowMs;
      bucket.detail = realMissing.join("；");
      let notifyError = "";
      if (saved.job.alarmMissing && !bucket.notified) {
        try { notifyError = await notifyPerson(employees, saved.recipient, ["公司简报缺数据 " + schedule.period.label, ...realMissing].join("\n").slice(0, 1500)); }
        catch (error) { notifyError = error?.message || "报警没有发出去"; }
        if (!notifyError) bucket.notified = true;
      }
      runState.buckets[bucketKey] = bucket;
      localStorage.setItem(RUN_KEY, JSON.stringify(runState));
      const alarms = [{ name: "公司简报", detail: bucket.detail }];
      if (notifyError) alarms.push({ name: saved.recipient, detail: notifyError });
      return publishLog({ phase: realMissing[0].startsWith("没有连上") ? "没有连上" : "缺数据", summary: realMissing[0].startsWith("没有连上") ? realMissing[0] : schedule.period.label + "还不能写简报：" + realMissing.join("；"), alarms, passes: [] });
    }
    if (!saved.job.brief) {
      bucket.status = "pass";
      bucket.at = nowMs;
      bucket.detail = schedule.period.label + " 快照齐全。这一项没有勾选出简报。";
      runState.buckets[bucketKey] = bucket;
      localStorage.setItem(RUN_KEY, JSON.stringify(runState));
      return publishLog({ phase: "本轮已完成", summary: bucket.detail, alarms: [], passes: [{ name: "公司简报", detail: bucket.detail }] });
    }
    const skill = await loadSkillText(saved.skillId);
    const prior = readAiEmployeeLog().actions || [];
    const result = await requestAiChat(buildBriefMessages({ skill, period: schedule.period, facts: (await buildBriefFacts(schedule.period)) || JSON.stringify(facts).slice(0, 18000), actions: prior, addedRules: saved.addedRules }), { max_tokens: 8000, agent: true, operation: "ai-employee-brief" });
    const reviewed = reviewBrief(result?.content || "");
    if (reviewed.fails.length) {
      bucket.attempts = Number(bucket.attempts || 0) + 1;
      bucket.status = bucket.attempts >= 2 ? "fail" : "alarm";
      bucket.at = nowMs;
      bucket.detail = reviewed.fails.join("；");
      bucket.brief = reviewed.content.slice(0, 8000);
      runState.buckets[bucketKey] = bucket;
      localStorage.setItem(RUN_KEY, JSON.stringify(runState));
      return publishLog({ phase: bucket.status === "fail" ? "本轮已停下" : "简报不合格", summary: schedule.period.label + " 的简报没有发出去。", alarms: [{ name: "公司简报", detail: bucket.detail }], passes: [], brief: bucket.brief });
    }
    const actions = actionLines(reviewed.content);
    let fileName = "";
    let saveError = "";
    try {
      const stored = await saveAgentReportFile({ module: "公司", skillName: saved.skillId || SKILL_ID, layoutProfileId: saved.layoutProfileId, period: { start: schedule.period.start, end: schedule.period.end, label: schedule.period.label }, model: result?.model || "", content: reviewed.content });
      fileName = stored?.fileName || "";
    } catch (error) {
      saveError = error?.message || "没有存进报告库";
      try { await saveLocalAgentReport({ module: "公司", skillName: saved.skillId || SKILL_ID, layoutProfileId: saved.layoutProfileId, period: { start: schedule.period.start, end: schedule.period.end, label: schedule.period.label }, model: result?.model || "", content: reviewed.content }); } catch {}
    }
    let sendError = "";
    if (fileName) {
      try {
        const sent = await sendWecomReports([fileName], saved.recipient, { format: "html", layoutProfileId: saved.layoutProfileId });
        if (!sent?.ok) throw new Error(sent?.results?.find((item) => !item.ok)?.reason || "发送失败");
      } catch (error) { sendError = error?.message || "发送失败"; }
    } else {
      try {
        const note = await notifyPerson(employees, saved.recipient, (schedule.period.label + "公司简报\n" + reviewed.content).slice(0, 1500));
        sendError = note;
      } catch (error) { sendError = error?.message || "发送失败"; }
    }
    bucket.status = sendError ? "alarm" : "sent";
    bucket.at = nowMs;
    bucket.detail = sendError ? "简报已写好，但没有发给" + saved.recipient + "：" + sendError : schedule.period.label + "已发给 " + saved.recipient;
    bucket.actions = actions;
    bucket.brief = reviewed.content.slice(0, 8000);
    bucket.fileName = fileName;
    runState.buckets[bucketKey] = bucket;
    localStorage.setItem(RUN_KEY, JSON.stringify(runState));
    const alarms = sendError ? [{ name: "公司简报", detail: bucket.detail }] : [];
    const passes = sendError ? [] : [{ name: "公司简报", detail: bucket.detail }];
    return publishLog({ phase: sendError ? "已写好未发出" : "本轮已完成", summary: bucket.detail, alarms, passes, actions, brief: bucket.brief });
  } catch (error) {
    const message = error?.message || "请检查项目服务";
    try {
      const runState = readRun();
      const schedule = scheduleOf(readAiEmployeeSaved(), new Date());
      const saved = readAiEmployeeSaved();
      if (schedule && saved) {
        const bucketKey = schedule.triggerKey + "|" + saved.savedAt;
        const bucket = runState.buckets[bucketKey] || { attempts: 0, notified: false };
        bucket.status = "alarm";
        bucket.at = Date.now();
        bucket.detail = message;
        runState.buckets[bucketKey] = bucket;
        localStorage.setItem(RUN_KEY, JSON.stringify(runState));
      }
    } catch {}
    return publishLog({ phase: "本轮未完成", summary: message, alarms: [{ name: "公司简报", detail: message }], passes: [] });
  } finally { cycleLock = false; }
};

export const runAiEmployeeNow = async (employees = [], config, yearMonth = "", options = {}) => {
  if (cycleLock) throw new Error("正在生成，请稍等");
  const saved = normalizeAiEmployeeConfig(config || readAiEmployeeSaved() || readAiEmployeeDraft());
  const picked = monthPeriod(yearMonth);
  const schedule = picked ? { period: picked } : scheduleOf(saved);
  if (!schedule?.period) throw new Error("请选择要生成的月份");
  cycleLock = true;
  const activity = [];
  const step = (progress, message) => {
    activity.push({ at: new Date().toISOString(), message });
    return publishLog({ phase: "正在生成", summary: message, progress, activity: activity.slice(), alarms: [], passes: [] });
  };
  step(8, "开始按 " + schedule.period.label + " 写公司简报。");
  try {
    step(18, "正在读取各模块快照。");
    const { facts, missing } = await collectCompanyFacts(schedule.period);
    if (missing.length) {
      step(100, "快照没对上：" + missing.join("；"));
      return publishLog({ phase: missing[0].startsWith("没有连上") ? "没有连上" : "缺数据", summary: missing[0].startsWith("没有连上") ? missing[0] : schedule.period.label + "还不能写简报：" + missing.join("；"), progress: 100, activity: activity.slice(), alarms: [{ name: "公司简报", detail: missing.join("；") }], passes: [] });
    }
    step(36, "六个模块的快照都对上了。");
    step(44, "正在读取简报技能。");
    const skill = await loadSkillText(saved.skillId);
    const prior = readAiEmployeeLog().actions || [];
    step(58, "正在让模型写简报。这一步最久，结束前不会有新正文。");
    const result = await requestAiChat(buildBriefMessages({ skill, period: schedule.period, facts: (await buildBriefFacts(schedule.period)) || JSON.stringify(facts).slice(0, 18000), actions: prior, addedRules: saved.addedRules }), { max_tokens: 8000, agent: true, operation: "ai-employee-brief" });
    step(82, "模型已返回，正在检查版式。");
    const reviewed = reviewBrief(result?.content || "");
    if (reviewed.fails.length) {
      const headings = (reviewed.content.match(/^(?:#{1,3}\s*)?\S.{0,24}$/gm) || []).slice(0, 8).join("、");
      const detail = reviewed.fails.join("；") + (headings ? "。看到的标题：" + headings : "。模型没有写出标题。");
      step(100, "检查没通过：" + detail);
      return publishLog({ phase: "简报不合格", summary: detail, progress: 100, activity: activity.slice(), alarms: [{ name: "公司简报", detail }], passes: [], brief: reviewed.content.slice(0, 8000) });
    }
    const actions = actionLines(reviewed.content);
    let fileName = "";
    let savedPath = "";
    const reportBody = { module: "公司", skillName: saved.skillId || SKILL_ID, layoutProfileId: saved.layoutProfileId, recipient: saved.recipient || "", period: { start: schedule.period.start, end: schedule.period.end, label: schedule.period.label }, model: result?.model || "", content: reviewed.content };
    try {
      const stored = await saveAgentReportFile(reportBody);
      fileName = stored?.fileName || "";
      savedPath = stored?.relativePath || (fileName ? ("outputs/ai_saved_reports/" + fileName) : "");
    } catch {
      try {
        const local = await saveLocalAgentReport(reportBody);
        fileName = local?.fileName || "";
        savedPath = fileName ? ("本机浏览器里的报告，" + fileName) : "";
      } catch {}
    }
    let sendError = "";
    if (options.send && saved.recipient && !fileName) sendError = "报告没有存进报告库，发不出去";
    else if (options.send && saved.recipient) {
      try {
        const sent = await sendWecomReports([fileName], saved.recipient, { format: "html", layoutProfileId: saved.layoutProfileId });
        if (!sent?.ok) throw new Error(sent?.results?.find((item) => !item.ok)?.reason || "发送失败");
      } catch (error) { sendError = error?.message || "发送失败"; }
    }
    const where = savedPath ? ("报告保存在 " + savedPath) : "报告没有存下来";
    const detail = !options.send
      ? (schedule.period.label + "已写好，还没有发送。" + where)
      : (!saved.recipient
        ? (schedule.period.label + "已写好，没有接收人，所以没有发送。" + where)
        : (sendError ? ("没有发给" + saved.recipient + "：" + sendError + "。" + where) : (schedule.period.label + "已发给 " + saved.recipient + "。" + where)));
    const phase = !fileName ? "没有保存" : (!options.send || !saved.recipient || sendError ? "已写好未发出" : "已发送");
    const log = publishLog({ phase, summary: detail, progress: 100, activity: activity.slice(), fileName, savedPath, recipient: saved.recipient || "", alarms: (saved.recipient && sendError) ? [{ name: "公司简报", detail }] : [], passes: (saved.recipient && sendError) ? [] : [{ name: "公司简报", detail }], actions, brief: "" });
    return log;
  } catch (error) {
    const message = error?.message || "没有生成";
    step(100, message);
    return publishLog({ phase: "没有生成", summary: message, progress: 100, activity: activity.slice(), alarms: [{ name: "公司简报", detail: message }], passes: [] });
  } finally { cycleLock = false; }
};

export const sendAiEmployeeReport = async (recipient, fileName, layoutProfileId) => {
  const name = String(recipient || "").trim();
  const file = String(fileName || "").trim();
  if (!name) throw new Error("请先选择接收人");
  if (!file) throw new Error("请先选择一份已保存的简报");
  const sent = await sendWecomReports([file], name, { format: "html", layoutProfileId });
  if (!sent?.ok) throw new Error(sent?.results?.find((item) => !item.ok)?.reason || "发送失败");
  return publishLog({ phase: "已发送", summary: "已发给 " + name + "。", fileName: file, savedPath: "outputs/ai_saved_reports/" + file, recipient: name, alarms: [], passes: [{ name: "公司简报", detail: "已发给 " + name }], progress: 100 });
};

export const askAiEmployee = async ({ question, history = [], addedRules = [], yearMonth = "" } = {}) => {
  const saved = readAiEmployeeSaved() || readAiEmployeeDraft();
  const skill = await loadSkillText(saved.skillId);
  const answer = await runEmployeeTurn({ question, history, addedRules: addedRules.length ? addedRules : saved.addedRules, skill });
  return { content: answer.content, period: yearMonth || "" };
};
