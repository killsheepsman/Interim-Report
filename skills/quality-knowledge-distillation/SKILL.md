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
6. Mark uncertainty and conflicts explicitly. Return no knowledge point when the source is too vague to support one.
7. Run the quality checks before returning JSON.

## Extraction Schema

For each knowledge point, populate:

- `type`: one of `mandatory`, `prohibited`, `threshold`, `evidence`, `definition`, `failure_mode`, `exam_point`.
- `title`: a short operational title, not a slogan.
- `content`: one testable rule or knowledge statement. Preserve numeric values, units, conditions, exceptions, and responsibility boundaries.
- `applicableRoles`: only roles explicitly named or unambiguously implied by the clause.
- `processes`: controlled process stages such as incoming inspection, assembly, debugging, design review, ECN, release, or customer feedback.
- `issueTags`: normalized defect or risk terms useful for assembly and R&D issue matching.
- `synonyms`: equivalent terms found in the local source text; do not invent a broad external taxonomy.
- `confidence`: `1.0` for explicit rules, `0.8` for direct operational implications, and at most `0.6` for context-dependent interpretations.
- `sourceCitations`: one or more objects containing `clauseId`, `clauseNumber`, `sectionPath`, and an exact `quote`.

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
- Separate conflicting clauses and identify the conflict in `content`; never choose a winner without version or approval evidence.
- Remove duplicate knowledge points while retaining all supporting citations.
- Keep original clauses unchanged and never claim that distilled knowledge replaces the controlled document.

## Failure Handling

If input is incomplete, return `{"knowledge":[]}` rather than fabricate content. If a clause is unreadable, ambiguous, or missing provenance, exclude it and let the calling system flag it for manual review. Process large documents in bounded batches and preserve completed batches so retrying does not restart the document.
