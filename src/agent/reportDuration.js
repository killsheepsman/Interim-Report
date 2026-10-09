export const REPORT_DURATION_KEY = "qms-report-duration-v1";
const FALLBACK_SECONDS = 180;

export const readReportDuration = (key) => {
  try {
    const all = JSON.parse(localStorage.getItem(REPORT_DURATION_KEY) || "{}");
    const seconds = Number(all?.[key]?.seconds);
    return Number.isFinite(seconds) && seconds >= 5 ? Math.round(seconds) : 0;
  } catch {
    return 0;
  }
};

export const writeReportDuration = (key, seconds, minSeconds = 15) => {
  const value = Math.round(Number(seconds) || 0);
  if (!key || value < minSeconds) return;
  try {
    const all = JSON.parse(localStorage.getItem(REPORT_DURATION_KEY) || "{}");
    all[key] = { seconds: value, at: new Date().toISOString() };
    localStorage.setItem(REPORT_DURATION_KEY, JSON.stringify(all));
  } catch {}
};

export const referenceSecondsFor = (key) => readReportDuration(key) || FALLBACK_SECONDS;

export const durationProgressDetail = (elapsed) => `已用 ${elapsed} 秒`;
