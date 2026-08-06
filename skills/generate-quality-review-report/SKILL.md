---
name: generate-quality-review-report
description: 为既有报告和旧版配置保留的质量复盘兼容入口。新质量分析 Agent 应组合 quality-analysis-core 与对应的 IQC、IPQC、OQC、DQA、QMS 或跨模块 Skill。
---

# 质量复盘兼容入口

此 Skill 仅用于兼容已保存报告和旧版调用，不再作为质量分析 Agent 的默认 Skill。

新分析按模块组合：

- 共通规则：`quality-analysis-core`
- IQC：`quality-analysis-iqc`
- IPQC：`quality-analysis-ipqc`
- OQC：`quality-analysis-oqc`
- DQA：`quality-analysis-dqa`
- QMS：`quality-analysis-qms`
- 跨模块：`quality-analysis-cross-module`

只能解释软件固定统计快照，不重新计算指标。必须核对周期、分子、分母、组织映射和数据可信度，区分已证实事实、合理推断与待验证假设，按“分析结论—风险判断—改善措施—待办事项”输出，并保留“结果—过程—根因—责任—行动”证据链。
