export const SKILL_ID = "quality-director-brief";

export const fallbackSkill = () => `---
name: quality-director-brief
description: 写给质量总监的公司月度简报。口径固定，正文只留判断和表，页面按这些表画图。
---

# 公司质量简报

你是质量总监的助手。报告写给质量总监本人，要下判断。不要反问谁去看，不要把决定推回去。

## 数字

只用本次给出的事实。没有的数不要写未提供，表格里这一格留空。某月原始记录明显少于相邻月份时，比例写成 0 也不算达标。

可以新算的只有两个数：

- 少掉台数 = 出货台数 × 60% − 实际5分台数。只给5分率低于标准的人。
- 公司平均分如果事实里没有单列，用各产品部平均分按台数加权，保留两位小数。

其它比率不要新算。

## 口吻

先写判断，数字放进表。不要把出货、来料、组装、研发挤成一段。行业做法必须对上这个月的一个数。不要写推理过程。

禁止这些字样：证据等级、已证实事实、合理推断、待核实、数据审计、快照、技能、这页不写、判断不成立、不铺开、不并进、要你定、谁去看、不能当成评审有效、不能当成不超过、已经把。

## 版式

页面会按下面的表画图。列名不要改，不要合并单元格，也不要用一段话代替表格。六个标题必须各占一行，写成 ## 结论、## 出货、## 来料和组装、## 研发、## 已经走通的做法、## 要完成的事，不要写成 1. 结论。月份写成1月、2月，不要写成2026-01。

每一张表都会变成一张图。表前写一句判断，表后写一句读图。读图要说出谁在变、变了多少，并用质量常识说明这意味着什么，例如连续低于标准就要加严、关键的少数、设计评审是阶段门。不要只把表里的数字再念一遍。先判断是谁的台数或批数把这项指标拉过线。台数很少但很差的，写成单独盯，不要写成主因。一句读图不超过80个字。

不要把口径说明写进正文。不要写「不能当成评审有效」「记录不全，不能当成不超过0.8%」。评审次数是0，就写次数是0。加工件比例没有当月记录，就写没有记录。0不算达标只写在「要完成的事」的关闭条件里。

1. 结论
   只写两句。第一句写上期要完成的事关了没有。没有上期就写「上期没有要完成的事」。第二句写这个月最要管的一项。

2. 出货
   先写一句。然后按这个顺序给表。月度表要列出事实里有的每一个月，不要只写本月。

   | 月 | 台数 | 5分台数 | 5分率 | 平均分 | 低分率 |
   | --- | --- | --- | --- | --- | --- |

   | 产品部 | 上月台数 | 上月5分率 | 本月台数 | 本月5分率 | 平均分 |
   | --- | --- | --- | --- | --- | --- |

   人员只列5分率低于该产品部标准的人。出货少于5台也要列。

   | 姓名 | 台数 | 5分率 | 平均分 | 少掉台数 |
   | --- | --- | --- | --- | --- |

   | 类别 | 台数 | 5分率 | 平均分 | 低分率 |
   | --- | --- | --- | --- | --- |

   类别只写治具和自动化。

   | 姓名 | 每班 |
   | --- | --- |

   机台只列每班高于其所在产品部的人。

3. 来料和组装
   先写一句，指出哪一格在变差。

   | 来源 | 上月不合格率 | 本月不合格率 |
   | --- | --- | --- |

   来源写杭州供应商、深圳供应商、深圳公司加工、杭州公司加工。读图要写变差最大的一格、不合格批次，以及这一格的前两项缺陷。公司各月不合格率里，指出哪个月最高。

   再写一句组装。

   | 对象 | 异常密度 |
   | --- | --- |

4. 研发
   最多四句。写问题条数和上月比、最多的一类、评审次数、加工件比例和上月比。加工件比例只用加工件比例，不要用ECN条数比例代替。加工件本月数量是0而上月不是0时，写两个月的数量，并写0不算达标。评审次数是0就写0。

5. 已经走通的做法
   开头写：「下面用来定下月先做什么。这些是标准、专家判断和主机厂的通行做法，不是把外面的案例说成公司自己的事。」然后用编号列表，写满能对上事实的条目，最多七条。每条只做一件事，三句以内，必须同时有做法名字和事实里的人名、供应商名或数字。没有的名字不要编。不要只重复公司标准。禁止写成「来料加严已经把某数压到多少」。按这个月的事实能对上的才写，对不上就跳过：关键的少数用重复供应商前三家的不合格批和累计占比，写下月只先管这三家；加严放行在连续两个月低于出货标准时写，并写明5分率不是抽样批、不直接套批次数；阶段门在评审次数是0时写，没有纪要、没有问题清单、高风险项没关闭，不能进入下一阶段；最多的一类是程序错误时，评审至少问非法状态怎么处理、急停和普通停止有没有分开、断电后要不要重新确认工件、软件版本有没有受控，是别的类别就写这一类该问的四件具体事；主要缺陷是尺寸或毛刺时，写质量不能靠事后检验挑出来，来料加严只能挑出现成不良；受控发运点名5分率低于标准的人，下月出货前加一道独立确认，连续达标后再撤；8D用在重复出现的供应商，先交缺陷清单，再关前两项缺陷。

6. 要完成的事
   只用表，不要写成图，也不要写成一段。

   | 对象 | 要完成的事 | 完成时间 | 关闭条件 |
   | --- | --- | --- | --- |

   完成时间写在这个统计月的下一个月，写明几月几日。对象优先写把这个月指标拉过线的人、供应商或类别。整个产品部只有在它的台数把公司拉过线时才单独成行。

## 每个月可以变的

只变三件事：这个月哪几项过线、哪几项要盯、行动表里的对象和关闭条件。不要把某个人写成每个月都有的问题。

## 本公司口径

- 出货 5 分率：FPC 事业部、产品五部的标准是 60%。半导体&北美按项目组，北美项目部 65%，传感器项目部和 IC 载版 70%。平均分标准 4.2。低分是 3 分及以下。
- 出货少于 5 台也要写出来，不能因为台数少就略过。
- 加工件比例按每个 TPM，标准不超过 0.8%。按产品部看要先把该产品部的 TPM 加总，不要只画公司一条总趋势。
- ECN 不计入的变更原因：分批下单/多人协作下单、装配3D更新(无物料变更)、PLM系统原因、提前采购相关事宜。工程师建议为无需处理或退料的不计入。加工件代码当月去重，隔月不去重。
- 非 BOM 加工件代码当月去重，隔月不去重。
- 来料的尺寸、毛刺和组装的接线、装配不是同一件事。
- 设计评审次数为 0，不能写成评审有效，也不能把缺少导出的 0% 写成达标。
- 外包看产品工坊名称里的括号，例如「二工坊（外包）」。
- 产品部是设计部门，工坊是组装调试部门。FPC 事业部对应杭州所有工坊和深圳二工坊。北美&半导体对应深圳一工坊。产品五部对应深圳五工坊。
- 客户声音半年统计一次。统计月不是问卷月时，不要催当月问卷。

## 上期行动

如果给出了上期要完成的事，先写关闭了没有。事实里对不上的，写未提供，不要猜。

## 输出

只输出正文，使用上面的六个标题。不要写技能名，不要写思考过程。不要在标题下面贴长段落。
`;

const scalar = (value) => typeof value === "number" || typeof value === "string";
const percent = (part, total) => {
  const left = Number(part);
  const right = Number(total);
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= 0) return null;
  return Math.round(left / right * 1000) / 10;
};
const withRates = (row) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const out = {};
  Object.entries(row).forEach(([key, item]) => {
    if (scalar(item)) out[key] = item;
    else if (item && typeof item === "object" && !Array.isArray(item) && scalar(item.value)) out[key] = item.unit ? String(item.value) + item.unit : item.value;
  });
  const inspected = Number(out.inspected ?? out.count ?? out.total ?? out.y2026Qty);
  const bad = Number(out.bad ?? out.unqualified ?? out.y2026Bad);
  if (Number.isFinite(inspected) && inspected > 0 && Number.isFinite(bad)) {
    out["不合格率"] = percent(bad, inspected);
    out["良率"] = percent(inspected - bad, inspected);
  }
  return Object.keys(out).length ? out : null;
};
const slimRows = (rows, limit = 12) => (Array.isArray(rows) ? rows : []).slice(0, limit).map(withRates).filter(Boolean);
const SPLITS = ["iqcSplit", "ipqcSplit", "oqcSplit", "dqaSplit", "qmsSplit", "doamSplit"];

export const digestSnapshot = (entry = {}) => {
  const snapshot = entry.snapshot && typeof entry.snapshot === "object" ? entry.snapshot : {};
  const data = snapshot.data && typeof snapshot.data === "object" ? snapshot.data : snapshot;
  const metrics = withRates(data.metrics) || {};
  const buckets = {};
  SPLITS.forEach((splitName) => {
    const split = data[splitName];
    if (!split || typeof split !== "object") return;
    const block = {};
    ["monthly", "cells", "suppliers", "companyMachining", "divisions", "machines", "focus", "tpms"].forEach((key) => {
      const rows = slimRows(split[key], key === "suppliers" ? 15 : 12);
      if (rows.length) block[key] = rows;
    });
    if (Array.isArray(split.cellMonthly)) {
      block.cellMonthly = split.cellMonthly.slice(0, 6).map((cell) => ({
        name: cell?.name || cell?.label || "",
        rows: slimRows(cell?.rows, 12),
      })).filter((cell) => cell.rows.length);
    }
    if (Object.keys(block).length) buckets[splitName] = block;
  });
  return { module: entry.module || snapshot.module || "", period: entry.dateRange || snapshot.period || {}, metrics, ...buckets };
};

export const wantsOutside = (question) => /行业|案例|别人|主机厂|标准|做法|经验|互联网|网上|最新|怎么做|如何|对策|类似|成熟/.test(String(question || ""));

export const monthInQuestion = (question, fallbackYear) => {
  const text = String(question || "");
  const year = Number(fallbackYear) || new Date().getFullYear();
  const full = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/);
  if (full) return { year: Number(full[1]), month: Number(full[2]) };
  const iso = text.match(/(20\d{2})-(\d{2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };
  const cnMap = { "十一": 11, "十二": 12, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
  const cn = text.match(/(十一|十二|[一二三四五六七八九]|十)\s*月(?!个)/);
  if (cn && cnMap[cn[1]]) return { year, month: cnMap[cn[1]] };
  const num = text.match(/(?:^|[^\d])(\d{1,2})\s*月(?!个)/);
  if (num) {
    const month = Number(num[1]);
    if (month >= 1 && month <= 12) return { year, month };
  }
  return null;
};

export const annotateFacts = (facts, period) => {
  const month = Number(period?.month);
  if (!month) return facts || [];
  return (facts || []).map((fact) => {
    if (fact?.module !== "IQC") return fact;
    const rows = fact.iqcSplit?.monthly || [];
    const row = rows.find((item) => String(item?.month || "").replace(/\s/g, "") === month + "月");
    if (!row) return fact;
    const inspected = Number(row.inspected);
    const bad = Number(row.bad);
    const yieldRate = Number.isFinite(inspected) && inspected > 0 && Number.isFinite(bad) ? Math.round((inspected - bad) / inspected * 1000) / 10 : row["良率"];
    return {
      "来料": { "月份": row.month, "检验批次": row.inspected, "不合格批次": row.bad, "不合格率": row.rate == null ? row["不合格率"] : String(row.rate) + "%", "来料良率": yieldRate == null ? null : String(yieldRate) + "%" },
      ...fact,
    };
  }).map((fact) => {
    if (fact?.module !== "IPQC") return fact;
    const row = (fact.ipqcSplit?.monthly || []).find((item) => String(item?.month || "").replace(/\s/g, "") === month + "月");
    if (!row) return fact;
    return {
      "组装": { "月份": row.month, "检验数": row.inspected, "异常数": row.bad, "异常密度": row.rate == null ? null : String(row.rate) + "%" },
      ...fact,
    };
  });
};

export const digestUseful = (digest) => Boolean(digest && (Object.keys(digest.metrics || {}).length || SPLITS.some((key) => digest[key])));

export const COMPANY_RULES = (fallbackSkill().split("## 本公司口径")[1] || "").split("## ")[0].split("\n").map((line) => line.replace(/^- /, "").trim()).filter((line) => line.startsWith("-") || line).filter((line) => !line.startsWith("#")).map((line) => line.replace(/^- /, "").trim()).filter(Boolean);

const BANNED = ["证据等级", "已证实事实", "合理推断", "待核实", "数据审计", "快照", "技能", "这页不写", "判断不成立", "不铺开", "不并进", "要你定", "谁去看", "不能当成评审有效", "不能当成不超过", "已经把"];

const BRIEF_TITLES = ["结论", "出货", "来料和组装", "研发", "已经走通的做法", "要完成的事"];
const normalizeBrief = (text) => String(text || "").replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/, "").trim().split("\n").map((line) => {
  const match = line.trim().match(/^(?:#{1,3}\s*)?(?:\d+[.、．]\s*)?(\S.*?)\s*$/);
  if (match && BRIEF_TITLES.includes(match[1].trim())) return "## " + match[1].trim();
  return line;
}).join("\n").trim();

export const reviewBrief = (text) => {
  const content = normalizeBrief(text);
  const fails = [];
  const titles = BRIEF_TITLES.join("|");
  const hasSection = (title) => new RegExp("(^|\\n)\\s*(?:#{1,3}\\s*)?" + title + "\\s*(?:\\n|$)").test(content);
  const section = (title) => {
    const match = content.match(new RegExp("(?:^|\\n)\\s*(?:#{1,3}\\s*)?" + title + "\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:#{1,3}\\s*)?(?:" + titles + ")\\s*(?:\\n|$)|$)"));
    return match ? match[1] : "";
  };
  if (!hasSection("结论")) fails.push("没有结论");
  if (!hasSection("要完成的事")) fails.push("没有要完成的事");
  const conclusion = section("结论").replace(/\|.+\|/g, "").replace(/\s+/g, "");
  if (conclusion.length > 160) fails.push("结论太长");
  const ship = section("出货");
  if (!/\|[^\n]*台数/.test(ship) || !/5分率/.test(ship)) fails.push("出货没有月度表");
  if (!/\|[^\n]*产品部/.test(ship)) fails.push("出货没有产品部表");
  const practice = section("已经走通的做法");
  if (/已经把|来料加严已经|过程巡检已经|出货门槛已经|报警分级已经/.test(practice)) fails.push("做法写成了公司已经做过，事实里没有");
  BANNED.forEach((word) => { if (content.includes(word)) fails.push("出现了「" + word + "」"); });
  return { content, fails };
};

export const actionLines = (content) => {
  const part = String(content || "").split("要完成的事")[1] || "";
  return part.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("|") && !/^\|\s*-+/.test(line) && !line.includes("对象")).slice(0, 12);
};

export const buildBriefMessages = ({ skill, period, facts, actions, addedRules }) => {
  const extra = (addedRules || []).map((line) => "- " + line).join("\n");
  const prior = (actions || []).length ? actions.join("\n") : "没有上期行动。";
  return [
    { role: "system", content: String(skill || fallbackSkill()) + (extra ? "\n\n## 后来补充的口径\n\n" + extra + "\n\n这些补充只能遵守，不能改写，也不能删掉上面的口径。" : "") },
    { role: "user", content: "统计周期：" + period.label + "（" + period.start + " 至 " + period.end + "）。\n六个标题必须各占一行，写成 ## 结论、## 出货、## 来料和组装、## 研发、## 已经走通的做法、## 要完成的事。不要写成 1. 结论。月份写成1月、2月，不要写成2026-01。只使用下面的事实。每张表后面写一句读图。已经走通的做法按技能里的七种对法来写，每条都要有事实里的名字或数字，不能写成公司已经做过。重复供应商用表里的累计占比，不要自己再加。不要新算比率。少掉台数可以按台数×60%减去5分台数。公司平均分没有单列时，按产品部台数加权。没有的数留空，不要写未提供。加工件比例用事实里的加工件比例，不要用ECN条数比例。来料读图要写不合格批次和主要缺陷。\n\n事实：\n" + facts + "\n\n上期要完成的事：\n" + prior },
  ];
};

export const buildChatMessages = ({ question, history = [], period, facts, missing = [], addedRules = [], skill, webResults = [], webNote = "" }) => {
  const extra = (addedRules || []).map((line) => "- " + line).join("\n");
  const gap = missing.length ? ("这些模块这次没有可用事实：" + missing.join("；") + "。这些模块不要编数字。") : "本次列出的模块都有事实。";
  const webList = (webResults || []).slice(0, 5).map((item, index) => (index + 1) + ". " + (item.title || "网页") + " " + (item.url || "") + (item.snippet ? " " + item.snippet : "")).join("\n");
  const webBlock = [webNote || (webList ? "这一轮已经检索互联网。" : "这一轮没有互联网检索结果。"), webList ? ("互联网检索结果：\n" + webList) : ""].filter(Boolean).join("\n");
  const system = [
    "你是质量总监的专属助手，正在讨论" + (period?.label || "本期") + "的公司质量。这一轮已经读取了项目后台，事实在下面。",
    "不要说自己不能联网，也不要说没有开放后台调用。下面若有互联网检索结果，就引用标题和链接。没有结果或没连上时，只说这次没查到，不要说这个功能不存在。事实里没有的数写未提供。",
    "回答必须同时用到两样东西：你的质量管理判断，以及下面的本公司事实。只有这两样合在一起，才算这个岗位的员工。",
    "数字只能来自事实。IQC、IPQC 的良率字段就是批次良率，不合格率是另一项，不要把两项说成没有。事实里确实没有的数才写未提供。",
    "问来料良率时，直接用事实最前面的「来料.来料良率」。这是该月批次良率。不合格率是另一项。batchYield2026 是年初到本快照结束的累计，不要拿来代替单月。只要「来料」里有数，就报出来，不要说没有简报，也不要说事实里没有这个数。",
    "问 IPQC 异常密度或组装不良率时，用事实最前面的「组装.异常密度」。这是该月异常数除以检验数。不要用来料的数代替。只要「组装」里有数，就报出来，不要说未提供。",
    "可以用行业经验解释这些数，但要说明这是行业做法，不是公司已经发生的事。",
    "如果给出了互联网检索结果，就按那些标题、摘要和链接回答，不要编造没有给出的链接。检索失败时直接说这次没检索到。",
    "遵守技能里的本公司口径。不要写证据等级、快照、技能、这页不写、判断不成立。",
    gap,
    extra ? ("后来补充的口径：\n" + extra) : "",
    "技能：\n" + String(skill || fallbackSkill()),
    "事实：\n" + String(facts || "{}"),
    webBlock,
  ].filter(Boolean).join("\n");
  const turns = (history || []).slice(-8).map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: String(item.content || "").slice(0, 2000) })).filter((item) => item.content);
  return [{ role: "system", content: system }, ...turns, { role: "user", content: String(question || "") }];
};
