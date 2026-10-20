import { loadAgentReport, loadAgentReports, loadQualityAgentRoleSnapshotRegistry, notifyWecomText, sendWecomReports } from "../dataStore.js";
import { normalizeRoleSnapshotRegistry, pickRoleSnapshotEntry, snapshotMatchesPeriod } from "./roleSnapshotRegistry.js";

export const AI_EMPLOYEE_EVENT = "qms-ai-employee-config";
export const ROLE_NAMES = ["组装人员", "机长", "交付经理", "供应链经理", "研发工程师", "PM", "TPM", "产总"];
const SAVED_KEY = "qms-ai-employee-config-v1";
const DRAFT_KEY = "qms-ai-employee-draft-v1";
const LOG_KEY = "qms-ai-employee-log-v1";
const RUN_KEY = "qms-ai-employee-run-v1";
const LEGACY_PEOPLE_KEY = "qms-role-auto-people-v1";
const RETRY_MS = 30 * 60 * 1000;

export const AI_EMPLOYEE_DELIVERIES = [
  { key: "alarmOnly", label: "不合格只报警，不发送" },
  { key: "sendSelf", label: "合格报告发给员工本人" },
  { key: "sendNamed", label: "合格报告发给指定人" },
  { key: "alarmNamed", label: "报警发给指定人" },
];

const emptyDelivery = () => ({ alarmOnly: true, sendSelf: false, sendNamed: false, alarmNamed: false, named: "" });
const emptyQualify = () => ({
  mustTitle: "分析结论",
  actionTitle: "本月措施",
  directorTitle: "重点关注事项",
  banned: "数据审计\n已证实事实\n证据等级\n合理推断\nqms-agent-role-version",
});

const legacyPeople = () => {
  try {
    const value = JSON.parse(localStorage.getItem(LEGACY_PEOPLE_KEY) || "[]");
    return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
};
const cleanPeople = (value) => [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || "").trim()).filter(Boolean))];
const asInt = (value) => {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isInteger(number) ? number : "";
};

export const blankAiEmployeeConfig = () => ({
  people: legacyPeople(),
  period: { day: 8, monthsBack: 1 },
  qualify: emptyQualify(),
  delivery: emptyDelivery(),
  confirmed: false,
  savedAt: "",
});

export const normalizeAiEmployeeConfig = (value = {}) => {
  const base = blankAiEmployeeConfig();
  const period = value.period || {};
  const qualify = value.qualify || {};
  const delivery = value.delivery || {};
  return {
    people: cleanPeople(value.people ?? base.people),
    period: { day: asInt(period.day ?? base.period.day), monthsBack: asInt(period.monthsBack ?? base.period.monthsBack) },
    qualify: {
      mustTitle: String(qualify.mustTitle ?? base.qualify.mustTitle).trim(),
      actionTitle: String(qualify.actionTitle ?? base.qualify.actionTitle).trim(),
      directorTitle: String(qualify.directorTitle ?? base.qualify.directorTitle).trim(),
      banned: String(qualify.banned ?? base.qualify.banned),
    },
    delivery: {
      alarmOnly: delivery.alarmOnly !== false,
      sendSelf: delivery.sendSelf === true,
      sendNamed: delivery.sendNamed === true,
      alarmNamed: delivery.alarmNamed === true,
      named: String(delivery.named || "").trim(),
    },
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
  if (!config?.people?.length) gaps.push("还没有勾选人员");
  if (!Number.isInteger(day) || day < 1 || day > 28) gaps.push("启动日要填 1 到 28 的整数");
  if (!Number.isInteger(back) || back < 0 || back > 12) gaps.push("往前几个月要填 0 到 12 的整数");
  if (!config?.qualify?.mustTitle || !config?.qualify?.actionTitle || !config?.qualify?.directorTitle) gaps.push("合格标准里的标题还没填全");
  const delivery = config?.delivery || {};
  if (!delivery.alarmOnly && !delivery.sendSelf && !delivery.sendNamed && !delivery.alarmNamed) gaps.push("发给谁至少要选一项");
  if ((delivery.sendNamed || delivery.alarmNamed) && !delivery.named) gaps.push("选了指定人，还没有选出是谁");
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

export const readAiEmployeeLog = () => readJson(LOG_KEY) || { phase: "等待配置", summary: "", alarms: [], passes: [], updatedAt: "" };
const readRun = () => readJson(RUN_KEY) || { buckets: {}, sent: [] };
const sameList = (left = [], right = []) => JSON.stringify(left) === JSON.stringify(right);
const publishLog = (next) => {
  const prev = readAiEmployeeLog();
  if (prev.phase === next.phase && prev.summary === next.summary && sameList(prev.alarms, next.alarms) && sameList(prev.passes, next.passes)) return prev;
  const value = { ...next, updatedAt: new Date().toISOString() };
  localStorage.setItem(LOG_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(AI_EMPLOYEE_EVENT));
  return value;
};
export const matchEmployeeRole = (row = {}) => {
  const post = String(row.post || "").trim();
  return ROLE_NAMES.find((role) => role.toLowerCase() === post.toLowerCase()) || "";
};
const bannedWords = (text) => String(text || "").split(/[\n,，、]/).map((item) => item.trim()).filter(Boolean);
const qualifyContent = ({ role, content, rules }) => {
  const fails = [];
  const actionTitle = role === "产总" ? rules.directorTitle : rules.actionTitle;
  if (rules.mustTitle && !String(content).includes(rules.mustTitle)) fails.push("没有「" + rules.mustTitle + "」");
  if (actionTitle && !String(content).includes(actionTitle)) fails.push("没有「" + actionTitle + "」");
  bannedWords(rules.banned).forEach((word) => { if (String(content).includes(word)) fails.push("出现了「" + word + "」"); });
  return fails;
};
const reportWindow = (report) => {
  const period = report?.period || {};
  return { start: period._periodStart || period.start || "", end: period._periodEnd || period.end || "" };
};
const useridOf = (row) => String(row?.wecom || row?.id || "").trim();
let cycleLock = false;

export const runAiEmployeeCycle = async (employees = [], now = new Date()) => {
  if (cycleLock) return readAiEmployeeLog();
  const saved = readAiEmployeeSaved();
  if (!saved) return publishLog({ phase: "等待配置", summary: "配置还没保存。保存之前不会自己开工。", alarms: [], passes: [] });
  const gaps = configGaps(saved);
  if (gaps.length) return publishLog({ phase: "等待配置", summary: gaps.join("；"), alarms: [], passes: [] });
  const schedule = scheduleOf(saved, now);
  if (!shouldRun(saved, now, schedule)) {
    const next = nextTriggerDate(now, Number(saved.period.day));
    return publishLog({ phase: "未到日期", summary: previewSchedule(saved, now) + (now >= schedule.triggerDate ? "。已经错过的那一轮不补做。" : "。"), alarms: readAiEmployeeLog().alarms || [], passes: readAiEmployeeLog().passes || [] });
  }
  if (!employees.length) return publishLog({ phase: "正在处理", summary: "员工名单还没读到，这一轮先等一下。", alarms: readAiEmployeeLog().alarms || [], passes: readAiEmployeeLog().passes || [] });
  const runState = readRun();
  const bucketKey = schedule.triggerKey + "|" + saved.savedAt;
  const bucket = runState.buckets[bucketKey] || { people: {} };
  const alarms = [];
  const passes = [];
  const chosen = [];
  saved.people.forEach((name) => {
    const previous = bucket.people[name];
    if (previous && (previous.status === "sent" || previous.status === "pass")) return;
    if (previous?.status === "alarm" && Date.now() - Number(previous.at || 0) < RETRY_MS) return;
    const row = employees.find((item) => String(item?.name || "").trim() === name);
    if (!row) { alarms.push({ name, detail: "员工名单里没有这个人" }); return; }
    chosen.push({ ...row, name, roleName: matchEmployeeRole(row) });
  });
  if (!chosen.length && !alarms.length) {
    const doneAlarms = Object.entries(bucket.people).filter(([, row]) => row.status === "alarm").map(([name, row]) => ({ name, detail: row.detail }));
    const donePasses = Object.entries(bucket.people).filter(([, row]) => row.status !== "alarm").map(([name, row]) => ({ name, detail: row.detail }));
    return publishLog({ phase: "本轮已核对", summary: schedule.period.label + " 这一轮已经按配置处理过。", alarms: doneAlarms, passes: donePasses });
  }
  cycleLock = true;
  publishLog({ phase: "正在处理", summary: "正在处理 " + schedule.period.label + "，这一轮 " + (chosen.length + alarms.length) + " 人。", alarms: readAiEmployeeLog().alarms || [], passes: readAiEmployeeLog().passes || [] });
  try {
    const byRole = new Map();
    chosen.forEach((row) => {
      if (!row.roleName) alarms.push({ name: row.name, detail: "员工信息里看不出岗位" });
      else byRole.set(row.roleName, [...(byRole.get(row.roleName) || []), row]);
    });
    for (const [role, people] of byRole) {
      let registry = null;
      try { registry = normalizeRoleSnapshotRegistry(await loadQualityAgentRoleSnapshotRegistry({ role, period: schedule.period })); }
      catch (error) {
        people.forEach((row) => alarms.push({ name: row.name, detail: role + " 的快照没有读到：" + (error?.message || "请检查项目服务") }));
        continue;
      }
      for (const row of people) {
        const entry = pickRoleSnapshotEntry(registry, { role, recipient: row.name, period: schedule.period });
        const ready = entry && (snapshotMatchesPeriod(entry, schedule.period) || entry.matchLevel === "coverage");
        if (!ready) { alarms.push({ name: row.name, detail: schedule.period.label + "没有可用快照，这一轮停下，没有改已有报告" }); continue; }
        let match = null;
        try {
          const listed = await loadAgentReports({ role, recipient: row.name, limit: 40 });
          match = (listed?.reports || []).filter((item) => { const window = reportWindow(item); return window.start === schedule.period.start && window.end === schedule.period.end; }).sort((a, b) => String(b.updatedAt || b.savedAt || "").localeCompare(String(a.updatedAt || a.savedAt || "")))[0] || null;
        } catch (error) { alarms.push({ name: row.name, detail: "报告没有读到：" + (error?.message || "请检查项目服务") }); continue; }
        if (!match?.fileName) { alarms.push({ name: row.name, detail: schedule.period.label + "还没有对上的报告正文，这一轮不发送" }); continue; }
        let content = "";
        try { content = String((await loadAgentReport(match.fileName))?.content || ""); }
        catch (error) { alarms.push({ name: row.name, detail: "报告正文没有读到：" + (error?.message || "请检查项目服务") }); continue; }
        const fails = qualifyContent({ role, content, rules: saved.qualify });
        if (fails.length) { alarms.push({ name: row.name, detail: fails.join("；") }); continue; }
        const targets = [];
        if (saved.delivery.sendSelf) targets.push(row.name);
        if (saved.delivery.sendNamed && saved.delivery.named) targets.push(saved.delivery.named);
        const sentTo = [];
        let sendError = "";
        for (const target of targets) {
          const sentKey = schedule.triggerKey + "|" + match.fileName + "|" + target;
          if (runState.sent.includes(sentKey)) { sentTo.push(target); continue; }
          try {
            const result = await sendWecomReports([match.fileName], target, { format: "html" });
            if (!result?.ok) throw new Error(result?.results?.find((item) => !item.ok)?.reason || "发送失败");
            runState.sent.push(sentKey);
            sentTo.push(target);
          } catch (error) { sendError = error?.message || "发送失败"; }
        }
        if (sendError) alarms.push({ name: row.name, detail: "报告合格，但没有发出去：" + sendError });
        else if (sentTo.length) passes.push({ name: row.name, detail: schedule.period.label + "合格，已发给 " + sentTo.join("、") });
        else passes.push({ name: row.name, detail: schedule.period.label + "合格。这一项没有勾选发送，所以没有发。" });
      }
    }
    const nowMs = Date.now();
    alarms.forEach((item) => { bucket.people[item.name] = { ...(bucket.people[item.name] || {}), status: "alarm", detail: item.detail, at: nowMs }; });
    passes.forEach((item) => { bucket.people[item.name] = { status: item.detail.includes("已发给") ? "sent" : "pass", detail: item.detail, at: nowMs }; });
    if (saved.delivery.alarmNamed && alarms.length) {
      const named = employees.find((row) => String(row?.name || "").trim() === saved.delivery.named);
      const userid = useridOf(named);
      const fresh = alarms.filter((item) => !bucket.people[item.name]?.notified);
      if (!userid) alarms.push({ name: saved.delivery.named || "指定人", detail: "指定人没有工号，企业微信报警没有发出去" });
      else if (fresh.length) {
        try {
          const text = ["AI员工报警 " + schedule.period.label, ...fresh.map((item) => item.name + "：" + item.detail)].join("\n").slice(0, 1500);
          await notifyWecomText(userid, text);
          fresh.forEach((item) => { if (bucket.people[item.name]) bucket.people[item.name].notified = true; });
        } catch (error) { alarms.push({ name: saved.delivery.named, detail: "企业微信报警没有发出去：" + (error?.message || "发送失败") }); }
      }
    }
    if (alarms.some((item) => item.detail.includes("没有工号") || item.detail.includes("企业微信报警"))) {
      alarms.filter((item) => item.detail.includes("没有工号") || item.detail.includes("企业微信报警")).forEach((item) => { bucket.people[item.name] = { ...(bucket.people[item.name] || {}), status: "alarm", detail: item.detail, at: nowMs }; });
    }
    runState.buckets[bucketKey] = bucket;
    localStorage.setItem(RUN_KEY, JSON.stringify(runState));
    const allAlarms = Object.entries(bucket.people).filter(([, row]) => row.status === "alarm").map(([name, row]) => ({ name, detail: row.detail }));
    const allPasses = Object.entries(bucket.people).filter(([, row]) => row.status !== "alarm").map(([name, row]) => ({ name, detail: row.detail }));
    return publishLog({ phase: "本轮已核对", summary: describeSchedule(saved, now) + "。不合格 " + allAlarms.length + " 人，通过 " + allPasses.length + " 人。", alarms: allAlarms, passes: allPasses });
  } catch (error) {
    return publishLog({ phase: "本轮已核对", summary: "这一轮没有做完：" + (error?.message || "请检查项目服务"), alarms, passes });
  } finally { cycleLock = false; }
};
