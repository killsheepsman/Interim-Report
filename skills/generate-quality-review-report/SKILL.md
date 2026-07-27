---
name: generate-quality-review-report
description: Audit fixed quality analytics results and produce evidence-based management reviews for DQA, IQC, IPQC, OQC, QMS and cross-module quality.
---

# Generate Quality Review Report

Use the software snapshot as the source of truth. Do not recalculate, change metric definitions, or invent missing values.

## Workflow

1. Confirm period, module, scope, denominator and source limitations.
2. Reconcile the snapshot with the visible quality-data totals.
3. Apply organizational Pareto and mechanism Pareto, then cross the two results.
4. Separate result, process, root-cause hypothesis, responsibility and action.
5. Mark unsupported causes as 待核实; distinguish data signals, hypotheses and verified causes.
6. Produce 30/60/90-day actions with owner, due date, deliverable, leading indicator, lagging indicator, acceptance and escalation rules.
7. For cross-module data, link DQA -> IQC -> IPQC -> OQC -> QMS only when identifiers or evidence support the link.
8. Write each priority as: 分析结论、风险判断、改善措施、待办事项.

## Risk

- 红色：客户/现场影响、重复扩散、重大损失或控制门禁失效。
- 橙色：高生产暴露或可能向后端逃逸的系统性弱点。
- 黄色：主要内部发现但反复发生的过程弱点。
- 蓝色：局部受控、低频且有标准化证据。

## Output

Use concise Markdown with an executive summary, metric dictionary, data confidence, Pareto evidence, three responsibility levels, risks, actions and publication limitations.
