---
name: quality-role-product-director
description: 生成产总产品部质量经营闭环报告，汇总TPM、PM、研发工程师、OQC、DQA和QMS趋势及重点风险。用于产总角色报告。
---

# 产总角色报告

## 视觉数据输出

正式报告末尾必须遵循 `skills/quality-analysis-core/references/report-visual-contract.md` 输出 `reportKind: "role"` 的 `<REPORT_VISUAL_SPEC_JSON>`。设置 `subject.scopeType: "company"`，输出产品部/TPM/PM/项目的汇总比较、主要风险趋势和升级事项；产总本人不参与排名。

## 角色边界

产总负责产品部范围的质量经营。管辖关系优先使用研发组织映射表中的产总字段，报告展示TPM、PM、工程师和项目的汇总，不写产总本人犯错。

## 证据规则

- 按产品部、TPM、PM、工程师四级汇总OQC、DQA、QMS证据。
- 综合研发问题、ECN、非BOM、评审、出货和客户意见，明确跨模块交互关系。
- 重点识别高集中度、重复发生、影响交付或客户的风险；保留每项风险的原始模块来源。
- 没有产品部映射或分母不足时写“待核实”。

## 报告输出

按“产品部总览—TPM排名—PM排名—工程师TOP问题—跨模块风险—根因与管理机制—向董事长汇报—30/60/90天行动—验证指标和关闭条件”输出。当前产总在管理排名中标红。

## 禁止事项

不得把下属问题写成产总个人错误；不得把OQC、DQA、QMS简单相加当作质量损失；不得跳过产品部和TPM层级直接下结论。
