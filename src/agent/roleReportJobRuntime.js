const jobs = new Map();
const listeners = new Set();

export const ROLE_PERIOD_STORAGE_KEY = "qms-agent-role-report-period-v1";
export const emptyRoleReportProgress = () => ({ visible: false, recipientNames: [], completedNames: [], currentName: "", total: 0, phase: "", detail: "" });

export const readRoleReportPeriod = (dateRange = {}, fallbackYear = "2026") => {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(ROLE_PERIOD_STORAGE_KEY) || "null");
    if (saved?.start && saved?.end) {
      return {
        year: saved.year || String(saved.start).slice(0, 4) || fallbackYear,
        start: saved.start,
        end: saved.end,
      };
    }
  } catch {
    // Ignore unreadable localStorage and fall back to the page default.
  }
  return {
    year: fallbackYear,
    start: dateRange[`start${fallbackYear}`] || `${fallbackYear}-01-01`,
    end: dateRange[`end${fallbackYear}`] || `${fallbackYear}-12-31`,
  };
};

export const writeRoleReportPeriod = (period = {}) => {
  if (!period?.start || !period?.end) return;
  try {
    globalThis.localStorage?.setItem(ROLE_PERIOD_STORAGE_KEY, JSON.stringify({
      year: period.year || String(period.start).slice(0, 4),
      start: period.start,
      end: period.end,
    }));
  } catch {
    // Private mode can block localStorage; generation still uses in-memory period.
  }
};

export const getRoleReportJob = (role = "") => jobs.get(role) || null;

export const patchRoleReportJob = (role, patch = {}) => {
  const current = jobs.get(role) || { role, progress: emptyRoleReportProgress(), state: { status: "idle", message: "" } };
  const next = { ...current, ...patch, role };
  jobs.set(role, next);
  listeners.forEach((listener) => {
    try { listener(next); } catch { /* a closed page must not break other listeners */ }
  });
  return next;
};

export const subscribeRoleReportJob = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const isRoleReportJobRunning = (job) => Boolean(job?.state?.status === "running" && job.controller && !job.controller.signal.aborted);

export const hasRunningRoleReportJobs = () => [...jobs.values()].some(isRoleReportJobRunning);

export const clearRoleReportJobsForTests = () => {
  jobs.clear();
};