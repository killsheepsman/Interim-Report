# 报告视觉数据契约

所有质量分析 Agent 和角色报告 Agent 在正式 Markdown 报告末尾追加一个机器可读取的数据块。网页或导出器读取该数据块生成图表；正文仍是管理层可读的事实、判断和行动。

```text
<REPORT_VISUAL_SPEC_JSON>{...}</REPORT_VISUAL_SPEC_JSON>
```

## 基本规则

- 只使用已审计快照、已在正文出现的数值和真实证据编号。
- `riskLevel` 只能为 `red`、`orange`、`yellow`、`blue` 或 `unknown`。Agent 不输出色号，渲染器负责颜色和字体。
- 每张图必须包含标题、章节、单位、数据、证据编号、数据覆盖状态和无障碍摘要。
- 数据不全时使用 `coverage: "partial"`，说明缺失范围；不补造序列，不把片段数据伪装成完整趋势。
- 需要逐项核对的行动、责任、期限、证据、根因与审计口径保留为表格，不强制图表化。
- 图表替换同源的排名、趋势、分布、构成或比较表；`tablePolicy` 为 `replace` 时，网页正文不重复显示该原始数据表。

## JSON 结构

```json
{
  "version": "1.0",
  "layoutProfile": "research-briefing-v1",
  "reportKind": "module|role|cross-module",
  "subject": {
    "role": "研发工程师",
    "name": "仅角色报告填写",
    "scopeType": "direct|manager|company"
  },
  "riskHighlights": [
    {
      "id": "K-IQC-001",
      "riskLevel": "red",
      "title": "高风险主题",
      "statement": "已证实事实或明确标记为待验证假设",
      "evidenceIds": ["X-IQC-001"],
      "sectionId": "5.1"
    }
  ],
  "figures": [
    {
      "id": "fig-iqc-supplier-pareto",
      "sectionId": "4.1",
      "intent": "pareto",
      "preferredChart": "pareto-column-line",
      "title": "供应商不合格批次 Pareto",
      "unit": "批",
      "categories": ["供应商 A", "供应商 B"],
      "series": [
        {"name": "不合格批次", "values": [278, 166], "axis": "left"},
        {"name": "累计占比", "values": [7.5, 12.0], "axis": "right", "unit": "%"}
      ],
      "coverage": "complete",
      "sourceEvidenceIds": ["O-IQC-001", "O-IQC-002"],
      "accessibilitySummary": "前两家供应商累计贡献 12.0% 的不合格批次。",
      "tablePolicy": "replace"
    }
  ],
  "tableFallbacks": [],
  "sourceLimitations": []
}
```

## 图表选择

| intent | preferredChart | 使用条件 |
|---|---|---|
| `comparison` | `slope` 或 `dumbbell` | 两期或少量对象的同口径比较 |
| `trend` | `column-line` | 数量与比率都有完整时间序列 |
| `period-trend` | `dual-column-line` | 跨月或跨周的个人/组织趋势；必须覆盖起止范围内全部自然月/自然周（含 0 值周期）；两组柱形分别为不良数量、总数量，折线为不良率 |
| `rate-trend` | `line` | 只有比率序列，必须标注覆盖月份 |
| `pareto` | `pareto-column-line` | 排序后的数量和逐项累计占比 |
| `ranking` | `clustered-horizontal-bar` | 人员、组织或项目排名 |
| `distribution` | `lollipop` 或 `horizontal-bar` | 多类别质量、良率或分布对比 |
| `relationship` | `heatmap` | 两个离散维度的交叉问题 |
| `timeline` | `milestone-timeline` | 行动、期限和验证节点 |

不要为了图表多样性随机换图。图表形式必须服务于数据关系和管理问题。

### 跨周期趋势图契约

当模块、角色或组织报告统计周期跨越两个或以上自然月，输出一张月度趋势图；当周期跨越两个或以上自然周，输出一张周度趋势图。周期粒度必须由实际起止日期判定，不能凭报告标题猜测。每张图必须使用同一对象、同一筛选范围和同一口径的三条序列：

- 柱形一：不良数量（分子）；
- 柱形二：总数量/送检数量（分母）；
- 折线：不良率 = 不良数量 / 总数量 × 100%。

两组柱形共用左轴，折线使用右侧百分比轴；不得只画不良数量而省略总数量，也不得把不良数量误当成总数量。月份使用 `YYYY-MM` 或 `N月`，周使用自然周 `YYYY-Www`，缺失周期不补零并标记 `coverage: "partial"`。

## 角色报告补充

- 直接责任角色（组装人员、研发工程师）输出本人具体问题、本人排名、知识考试匹配数据和 `subject` 标记。
- 管理角色（机长、交付经理、供应链经理、PM、TPM、产总）输出汇总范围、下级排名或单位对比、下级 TOP 风险；不把下属问题改写成管理者个人问题。
- 排名图必须把报告对象标记为 `focus: true`。渲染器将其使用红色五角星和红色数据条，其他条形保持中性蓝；深圳和杭州标签可由 `site` 字段区分。
- 供应链经理和产总为范围汇总，不输出本人排名图。

## 版式 Profile 接口

默认 `layoutProfile` 为 `research-briefing-v1`。发布器依据该 ID 读取布局配置；后续可增加新的 Profile，例如 `editorial-v2` 或 `minimal-data-v1`。

新增 Profile 时，先对获得授权的参考网页做桌面、移动端、交互和设计 Token 侦察，只提炼阅读顺序、网格、留白、字体层级、图表位置和交互规则。不得复制品牌、标志、文本、图片或受保护图形。
