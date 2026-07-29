const IMPORTED_REPORTS_KEY = "qms-quality-agent-imported-reports-v1";

export const loadImportedAgentReports = () => {
  if (typeof localStorage === "undefined") return {};
  try {
    const value = JSON.parse(localStorage.getItem(IMPORTED_REPORTS_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
};

export const saveImportedAgentReports = (value) => {
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(IMPORTED_REPORTS_KEY, JSON.stringify(value || {})); } catch {}
  }
};
