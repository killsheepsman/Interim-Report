import assert from "node:assert/strict";
import { addIsoDays, enforceRdEngineerReportFacts } from "../src/agent/rdEngineerReportContract.js";

const content = `# 个人报告

## 2. 质量结果、完整趋势和排名

当前按研发质量问题数量降序排列为 **第 50/344 名**，本人共 23 项；排名表示同口径风险位置，不等同于能力评价。

## 质量结果与完整趋势

| 月份 | 2026-01 | 2026-02 |
|---|---:|---:|
| 研发质量问题 | 23 | 0 |

## 3. 主导失效机制 Pareto 与典型证据

### 问题分类 Pareto

| 问题类型 | 数量 | 占比 | 本人证据 | 改善动作 |
|---|---:|---:|---|---|
| 设计问题 | 21 | 91.3% | 已有证据 | 已有动作 |

### 本人问题证据与待核实根因

| 问题日期 | 问题类型 | 本人问题证据 |
|---|---|---|
| 2026-01-02 | 设计问题 | 原始证据应保留 |

## ECN、非BOM与设计评审正向贡献

| 工程活动 | 固定统计 | 风险核验重点 |
|---|---:|---|
| ECN | 807 | 核验 |
| 设计评审参与 | 10 | 正向贡献 |
| 有效改善项 | 0 | 正向贡献 |

### ECN变更/申请活动

ECN正文。

### 周度问题趋势

| 周次 | 问题数 |
|---|---:|
| 2026-W01 | 99 |

## 研发质量问题排名

当前按研发质量问题数量降序排列为 **第 50/344 名**，本人共 23 项；排名表示同口径风险位置，不等同于能力评价。

## 6. 工程门禁及30/60/90天验证

发布前检出阈值：覆盖3个新项目或5个高风险设计输出，覆盖率100%。验证周期：2026-09-26至2026-11-25。后端再暴露阈值：0项。
`;

const evidence = { rdQualityIssues: {
  count: 23,
  categories: [{ name: "设计问题", count: 21 }, { name: "3D模型问题", count: 1 }, { name: "DFX", count: 1 }],
  periodTrend: {
    month: { rows: [{ label: "2026-01", count: 7 }, { label: "2026-02", count: 0 }] },
    week: { rows: [{ label: "2026-W01", count: 2 }, { label: "2026-W02", count: 3 }] },
  },
} };
const ranking = [{ selected: true, rank: 50, total: 344, value: 23 }];
const result = enforceRdEngineerReportFacts(content, evidence, ranking, { ecnCount: 807 });

assert.match(result, /\| 2026-01 \| 7 \|/);
assert.doesNotMatch(result, /\| 研发质量问题 \| 23 \| 0 \|/);
assert.equal((result.match(/周度问题趋势/g) || []).length, 1);
assert.match(result, /3D模型问题 \| 1 \| 4\.3%/);
assert.match(result, /DFX \| 1 \| 4\.3%/);
assert.match(result, /问题分类数量已覆盖全部 23 项/);
assert.doesNotMatch(result, /问题分类 Pareto/);
assert.equal((result.match(/### 问题类型分布/g) || []).length, 1);
assert.match(result, /原始证据应保留/);
assert.doesNotMatch(result, /典型证据与机制判断/);
assert.match(result, /## ECN与非BOM工程活动/);
assert.doesNotMatch(result.match(/## ECN与非BOM工程活动[\s\S]*?(?=\n## |$)/)?.[0] || "", /设计评审参与|有效改善项/);
assert.match(result, /### ECN变更活动/);
assert.match(result, /第 50\/344 名/);
assert.equal((result.match(/第 50\/344 名/g) || []).length, 1);
assert.match(result, /## 2\. 质量结果概览/);
assert.match(result, /发布前检出率=发布前发现问题数÷（发布前发现问题数\+后端再暴露问题数）/);
assert.match(result, /单项验证周期=提交验证至形成放行结论的工作日，试行目标≤5个工作日/);
assert.doesNotMatch(result, /验证周期：2026-09-26至2026-11-25/);
assert.equal(addIsoDays("2026-08-27", 30), "2026-09-26");
assert.equal(addIsoDays("2026-08-27", 60), "2026-10-26");
assert.equal(addIsoDays("2026-08-27", 90), "2026-11-25");

console.log("R&D engineer report contract smoke test passed");
