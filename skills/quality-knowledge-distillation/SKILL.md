---
name: quality-knowledge-distillation
description: Distill company quality standards, SOPs, work instructions, design rules, and lessons learned into structured, traceable knowledge points. Use when QMS needs to convert locally supplied clauses into searchable rules for assembly or R&D issue matching, role reports, recurrence prevention, or exam generation while preserving exact source citations and never inventing requirements beyond the source.
---

# Quality Knowledge Distillation

## Objective

Transform company-controlled documents into concise quality knowledge without changing the authority of the original clauses. Treat the original document as the sole source of truth; treat distilled content only as a retrieval and application aid.

## Workflow

1. Verify that every input clause includes a stable clause ID, source document name, version when available, section path, clause number, and exact text.
2. Classify each clause before synthesizing it. Preserve mandatory, prohibited, threshold, evidence, definition, failure-mode, and exam-point semantics.
3. Extract only statements supported by the supplied clauses. Do not browse the web, use general industry knowledge to fill gaps, or silently resolve contradictions.
4. Merge semantically equivalent statements only when their conditions and scope are consistent. Keep separate knowledge points when roles, products, processes, thresholds, or exceptions differ.
5. Attach at least one exact citation to every knowledge point. Prefer the shortest quote that still proves the statement.
6. Compress by removing repetition, filler, duplicated background and decorative wording—not by cutting at a fixed character or byte count. Every evidence statement and knowledge point must remain a complete semantic unit with its subject, action or rule, conditions, thresholds, exceptions and responsibility boundary intact.
7. Mark uncertainty and conflicts explicitly. Return no knowledge point when the source is too vague to support one.
8. Run the quality checks before returning JSON.

## Extraction Schema

For each knowledge point, populate:

- `type`: one of `mandatory`, `prohibited`, `threshold`, `recommendation`, `evidence`, `definition`, `failure_mode`, `exam_point`. Use `recommendation` for advice or preferred practice that is not an explicit mandatory/prohibited requirement.
- Classification priority: determine `atomicRule.ruleType` from the source first, then derive `type`; never let a generic model label such as `mandatory` override `RECOMMENDATION`, `PERMISSION`, `DEFINITION`, or `EVIDENCE`. `PERMISSION` is normally `recommendation` unless the source explicitly establishes a required condition; `RESTRICTION` is `threshold` only when it contains a measurable limit, otherwise `mandatory` or `failure_mode` according to the source meaning.
- `atomicRule`: extract this structure during knowledge distillation from the cited evidence text; do not expect it to be precomputed by the evidence parser. Use `ruleType` (`REQUIREMENT|PROHIBITION|RESTRICTION|TIME_LIMIT|PERMISSION|EXCEPTION|RESPONSIBILITY|PENALTY|APPLICABILITY|RECOMMENDATION|DEFINITION|EVIDENCE`). `topic`, `subject`, `action`, and `object` are required; if the source cannot support one, do not create the card. Also populate `condition`, `timeLimit`, `requirements`, `restrictions`, `exceptions`, and `consequences` when applicable.
- `title`: a short operational title, not a slogan.
- `content`: one testable rule or knowledge statement. Preserve numeric values, units, conditions, exceptions, and responsibility boundaries.
- `applicableRoles`: only roles explicitly named or unambiguously implied by the clause.
- `processes`: controlled process stages such as incoming inspection, assembly, debugging, design review, ECN, release, or customer feedback.
- `issueTags`: normalized defect or risk terms useful for assembly and R&D issue matching.
- `synonyms`: equivalent terms found in the local source text; do not invent a broad external taxonomy.
- `confidence`: `1.0` for explicit rules, `0.8` for direct operational implications, and at most `0.6` for context-dependent interpretations.
- `sourceCitations`: one or more objects containing `clauseId`, `clauseNumber`, `sectionPath`, and an exact `quote`.
- `originalFact`: 原文明确事实；没有则留空。
- `correctState`: 根据原文总结“符合规范时应呈现的正确操作或设计状态”，必须能由引用原文直接证明。
- `violationBasis`: 用于后续问题比对的判定条件，只表达偏离规范的客观条件，不生成纠正措施或责任待办。
- For `mandatory`, `prohibited`, `threshold`, `recommendation`, and `failure_mode`, provide at least one objective `violationBasis`; definitions and pure reference facts may leave it empty.
- `commonViolations`: 导入规范时必须返回空数组。该字段只能在真实问题与知识卡完成匹配并经人工确认后，由历史问题归纳生成。
- `engineeringExplanation`: 兼容旧数据；新知识卡默认留空，不作为知识卡主体内容。
- `inference`: 待核实推断；不得当作正式规则。
- `applicableScope` / `notApplicableScope`: 仅填写原文明确的适用和不适用范围。
- `method` / `reviewPoints` / `correctionActions` / `verification`: 兼容旧数据；新知识卡必须返回空数组。评审、纠偏和闭环验证属于问题复盘及当事人待办，不属于规范知识。
- `riskLevel`: `low|medium|high|critical|unknown`；`mustReview`: OCR、公式、数值或适用范围不确定时必须为 `true`。

## Output Contract

Return pure JSON without Markdown fences or surrounding commentary:

```json
{
  "knowledge": [
    {
      "type": "mandatory",
      "title": "首件确认后方可批量生产",
      "content": "首件检验确认合格后，方可进入批量生产。",
      "applicableRoles": ["组装人员", "机长", "IPQC"],
      "processes": ["首件检验", "批量生产"],
      "issueTags": ["未做首件", "首件不合格"],
      "synonyms": ["首件确认"],
      "originalFact": "首件检验确认合格后方可批量生产",
      "engineeringExplanation": "",
      "correctState": "首件检验确认合格后进入批量生产",
      "violationBasis": ["未完成首件检验确认即进入批量生产", "首件检验未判定合格但已进入批量生产"],
      "commonViolations": [],
      "inference": "",
      "applicableScope": ["批量生产前"],
      "notApplicableScope": [],
      "method": [],
      "reviewPoints": [],
      "correctionActions": [],
      "verification": [],
      "riskLevel": "high",
      "mustReview": false,
      "confidence": 1.0,
      "sourceCitations": [
        {
          "clauseId": "clause-id",
          "clauseNumber": "4.2.1",
          "sectionPath": "生产准备/首件确认",
          "quote": "首件检验确认合格后方可批量生产"
        }
      ]
    }
  ]
}
```

Use empty arrays instead of guessed values. Keep every string concise and suitable for QMS search, reports, and later exam generation.

## Quality Gates

Before returning:

- Reject every statement that lacks an exact source citation.
- Confirm that quoted text appears verbatim in the supplied clause.
- Confirm that thresholds retain their number, unit, comparison direction, and applicable condition.
- Confirm that mandatory and prohibited language has not been weakened.
- Confirm that exceptions and role boundaries have not been widened.
- Confirm that no field ends mid-sentence or loses a condition because of a fixed length limit. Split only at a genuine semantic boundary; when no safe boundary exists, keep the complete statement.
- Separate conflicting clauses and identify the conflict in `content`; never choose a winner without version or approval evidence.
- Remove duplicate knowledge points while retaining all supporting citations.
- Keep every imported knowledge point in `candidate` status until a human reviewer accepts it.
- Source level, completeness, OCR and `mustReview` remain provenance flags for users and problem matching; they do not create a second publication gate. The explicit human “发布知识” action controls publication.
- `quote` must be a continuous verbatim substring of the cited clause; do not normalize whitespace, rewrite or concatenate text to pass the check.
- Keep original clauses unchanged and never claim that distilled knowledge replaces the controlled document.

## Failure Handling

If input is incomplete, return `{"knowledge":[]}` rather than fabricate content. If a clause is unreadable, ambiguous, or missing provenance, exclude it and let the calling system flag it for manual review. Process large documents in bounded batches and preserve completed batches so retrying does not restart the document.
