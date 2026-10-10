const porcelainProfile = {
  id: "porcelain-sheet-v1",
  label: "青瓷经营网页风格",
  description: "青瓷底、左侧书脊、发丝折线和底部大数。选择后按这个版式出页。",
  renderer: "porcelainSheet",
  riskPalette: { red: "#081F5C", orange: "#334EAC", yellow: "#7096D1", blue: "#081F5C" },
  tablePolicy: "chart-first",
};
const fallbackProfile = {
  id: "research-briefing-v1",
  label: "研究简报网页风格",
  description: "结论优先、章节内图表、证据注释与宽松阅读节奏",
  renderer: "researchBriefing",
  riskPalette: { red: "#B53A36", orange: "#A66214", yellow: "#8A6A00", blue: "#087EA4" },
  tablePolicy: "chart-first",
};


const basicsProfile = {
  id: "basics-sheet-v1",
  label: "基础对照网页风格",
  description: "比率用哑铃，可数排名用刻度条。按各模块数据选图，不套同一页。",
  renderer: "basicsSheet",
  riskPalette: { red: "#1C1C1A", orange: "#5E5D57", yellow: "#8F8E88", blue: "#1C1C1A" },
  tablePolicy: "chart-first",
};
export const REPORT_PRESENTATION_PROFILES = [fallbackProfile, porcelainProfile, basicsProfile];
export const DEFAULT_REPORT_PRESENTATION_PROFILE = fallbackProfile.id;

export const normalizeReportPresentationProfile = (value) => REPORT_PRESENTATION_PROFILES.some((profile) => profile.id === value)
  ? value
  : DEFAULT_REPORT_PRESENTATION_PROFILE;
export const getReportPresentationProfile = (value) => REPORT_PRESENTATION_PROFILES.find((profile) => profile.id === normalizeReportPresentationProfile(value)) || fallbackProfile;
export const presentationOwnsCharts = (value) => getReportPresentationProfile(value).renderer !== "researchBriefing";
export const reportPresentationClass = (value) => `report-profile-${normalizeReportPresentationProfile(value)}`;
