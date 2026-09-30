const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export const canonicalProjectGroup = (value = "") => {
  const source = text(value);
  if (!source || source === "半导体&北美") return "";
  if (/IC载版|IC载板/i.test(source)) return "IC载版";
  if (/传感器/.test(source)) return "传感器产品部";
  if (source === "北美" || source === "北美项目部" || /北美项目部/.test(source)) return "北美项目部";
  return "";
};

export const canonicalProductDept = (value = "") => {
  const source = text(value);
  if (!source) return "";
  if (/产品三部/.test(source)) return "产品三部";
  if (/产品五部/.test(source)) return "产品五部";
  if (/FPC|FCP/i.test(source)) return "FPC事业部";
  if (/海外亚太|亚太开发/.test(source)) return "海外亚太项目开发部";
  if (canonicalProjectGroup(source) || /产品一部|半导体|北美|传感器|IC载版|IC载板/i.test(source)) return "半导体&北美";
  return source;
};

const projectGroupName = (dept, group) => canonicalProjectGroup(group) || canonicalProjectGroup(dept) || text(group);

export const normalizeOrgRecord = (record = {}) => {
  const dept = text(record.productDept);
  const group = text(record.projectGroup);
  const director = text(record.productionDirector);
  const productDept = canonicalProductDept(dept);
  const semi = director === "黄敏" || productDept === "半导体&北美";
  if (!semi) return { ...record, productDept: productDept || dept, projectGroup: group };
  return { ...record, productDept: "半导体&北美", projectGroup: projectGroupName(dept, group) };
};

export const parseOrgMappingMatrix = (matrix = []) => {
  const required = ["产品部", "产总", "TPM", "PM"];
  const headerIndex = matrix.findIndex((line) => required.every((header) => (line || []).some((value) => text(value) === header)));
  if (headerIndex < 0) return [];
  const header = matrix[headerIndex].map((value) => text(value));
  const groupIndex = ["项目组", "二级组织"].map((name) => header.indexOf(name)).find((index) => index >= 0) ?? -1;
  const cell = (values, name) => {
    const index = header.indexOf(name);
    return index >= 0 ? text(values[index]) : "";
  };
  let last = {};
  const records = [];
  matrix.slice(headerIndex + 1).forEach((values) => {
    const dept = cell(values, "产品部");
    const group = groupIndex >= 0 ? text(values[groupIndex]) : "";
    const director = cell(values, "产总");
    const tpm = cell(values, "TPM");
    const pm = cell(values, "PM");
    if (!dept && !group && !director && !tpm && !pm) return;
    if (dept) last = { ...last, productDept: dept, projectGroup: group };
    else if (group) last = { ...last, projectGroup: group };
    if (director) last = { ...last, productionDirector: director };
    if (tpm) last = { ...last, tpm };
    if (!last.productDept || !last.productionDirector || !last.tpm || !pm) return;
    records.push(normalizeOrgRecord({ ...last, pm, active: true }));
  });
  const unique = new Map();
  records.forEach((row) => unique.set([row.productDept, row.projectGroup, row.productionDirector, row.tpm, row.pm].join("::"), row));
  return [...unique.values()];
};