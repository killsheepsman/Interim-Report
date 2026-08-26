// Vite provides import.meta.glob in the browser build; the Node server only
// needs the fallback profile and must not evaluate the Vite-only helper.
const profileModules = typeof import.meta.glob === "function"
  ? import.meta.glob("../../skills/report-web-publisher/profiles/*.json", { eager: true, import: "default" })
  : {};

const fallbackProfile = {
  id: "research-briefing-v1",
  label: "研究简报网页风格",
  description: "结论优先、章节内图表、证据注释与宽松阅读节奏",
  renderer: "researchBriefing",
  riskPalette: { red: "#B53A36", orange: "#A66214", yellow: "#8A6A00", blue: "#087EA4" },
  tablePolicy: "chart-first",
};

const loadedProfiles = Object.values(profileModules)
  .filter((profile) => profile && typeof profile === "object" && /^[a-z0-9][a-z0-9-]{0,80}$/i.test(String(profile.id || "")))
  .map((profile) => ({ ...fallbackProfile, ...profile }));

export const REPORT_PRESENTATION_PROFILES = (loadedProfiles.length ? loadedProfiles : [fallbackProfile])
  .sort((left, right) => String(left.label).localeCompare(String(right.label), "zh-CN"));
export const DEFAULT_REPORT_PRESENTATION_PROFILE = REPORT_PRESENTATION_PROFILES.find((item) => item.id === fallbackProfile.id)?.id
  || REPORT_PRESENTATION_PROFILES[0].id;

export const normalizeReportPresentationProfile = (value) => REPORT_PRESENTATION_PROFILES.some((item) => item.id === value)
  ? value
  : DEFAULT_REPORT_PRESENTATION_PROFILE;
export const getReportPresentationProfile = (value) => REPORT_PRESENTATION_PROFILES.find((item) => item.id === normalizeReportPresentationProfile(value));
export const reportPresentationClass = (value) => `report-profile-${normalizeReportPresentationProfile(value)}`;
