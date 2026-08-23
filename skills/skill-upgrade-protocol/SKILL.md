---
name: skill-upgrade-protocol
description: Use when Codex must upgrade or redesign a quality-analysis Skill from a real report, source data, fixed metric definitions, and an optional perspective Skill. It performs a gap audit first, converts findings into an executable analysis and output contract, updates the target Skill, and forward-tests it against the source artifact before promotion.
---

# Skill Upgrade Protocol

## Overview

Use this protocol to turn a perspective or review request into a reproducible Skill upgrade. Separate the reasoning lens from quality-analysis rules, preserve trusted data definitions, and require a real-artifact validation pass before accepting the upgraded Skill.

## Activation Contract

Activate this Skill when the request asks Codex to:

- upgrade, improve, redesign, merge, or apply a perspective to an existing quality Skill;
- make a Skill produce more decision-ready, closed-loop, or management-grade reports;
- reconcile a Skill with an existing report or real data.

Do not use it for a simple wording correction, a pure layout-only change, or a request to analyze data without changing a Skill.

## Inputs and Resolution

Resolve inputs in this order and record the resolved paths in the work log:

1. **Target Skill**: use the explicit path supplied by the user. If omitted, locate the closest project Skill by module and name; never silently edit a different Skill.
2. **Source artifact**: use the latest real report, Markdown, DOCX, HTML, workbook, CSV, or saved Agent report named by the user. Prefer the artifact that exposed the problem.
3. **Source data**: use the original workbook/CSV or the project's normalized cache used to generate the source artifact. Preserve the project's existing formulas and field mappings.
4. **Perspective Skill**: use the explicit perspective path. Treat it as a reasoning lens, not as a replacement for domain rules.
5. **Output/layout Skill**: load only when the request concerns presentation. Keep visual rules separate from analytical rules.

If a required input is missing, inspect the workspace for an unambiguous candidate. If none exists, state the missing input and ask one focused question; do not invent data or rewrite a Skill from memory.

## Non-Negotiable Boundaries

Preserve unless the user explicitly authorizes a change:

- original data files and import history;
- existing metric definitions, denominators, date filters, mappings, and rounding rules;
- module boundaries and field names already used by the project;
- administrator/local-save/privacy behavior;
- existing Skills unrelated to the requested target.

Never turn an inference into a fact. Mark unsupported claims as `待验证` and identify the evidence needed to verify them.

## Two-Pass Workflow

### Pass 1: Diagnose before editing

Read the complete target Skill and the complete source artifact before proposing changes. Build an internal gap matrix with these columns:

| Existing rule/output | Observed defect or missing behavior | Required rule/output | Evidence/source | Exact Skill section |
|---|---|---|---|---|

Perform these checks:

1. **Data audit**: list source files, relevant sheets/columns, date scope, row counts, deduplication keys, and formulas. Recalculate critical totals independently when practical.
2. **Report audit**: mark which conclusions, charts, tables, risks, owners, and actions are present, missing, duplicated, or inconsistent with the data.
3. **Perspective audit**: translate the requested perspective into explicit behaviors, such as challenging assumptions, quantifying the bottleneck, or choosing the smallest decisive experiment. Do not copy slogans or imitate personality.
4. **Decision audit**: check whether the report answers what happened, why it matters, what must be decided now, who owns it, how it will be verified, and when it closes.
5. **Regression audit**: identify existing behavior that must remain unchanged.

Do not modify files during Pass 1. Distinguish rules that should be retained, strengthened, added, or rejected because the data cannot support them.

### Pass 2: Implement and forward-test

After diagnosis (or immediately when the user supplied a complete brief), update only the target Skill and its directly required references. Use `apply_patch` for manual edits. Do not change application code, raw data, or unrelated Skills unless explicitly requested.

Run the upgraded Skill on the same source artifact and data boundary. Compare the result with the acceptance checklist below. If a check fails, revise the Skill and rerun it; do not declare success based on the text of `SKILL.md` alone.

## Required Analysis Contract

Every upgraded quality-analysis Skill must define, as applicable to its module:

1. **Scope and metric dictionary**: date range, population, numerator, denominator, exclusions, missing-value handling, and rounding.
2. **Fact layer**: auditable totals and trends tied to source fields.
3. **Risk layer**: severity, exposure, trend, escape/stage impact, and a ranked Top list. Use Pareto where the data supports it.
4. **Root-cause layer**: hypotheses separated from verified causes, with the minimum evidence or experiment required for verification.
5. **Decision layer**: the one to three decisions that should be made now, including the cost or business impact of delay where measurable.
6. **Action layer**: one accountable Owner per action, due date, deliverable, acceptance metric, escalation trigger, and closure evidence.
7. **Communication layer**: what must be reported upward, what is specific to the person/team, and what must not be duplicated at higher levels.
8. **Presentation layer**: charts replace repeated tables when a chart communicates the same comparison more directly; tables remain for detailed evidence or action tracking.

For role Skills, distinguish individual evidence from management aggregation. Do not assign personal rankings or personal defects to a manager unless the source mapping explicitly supports that attribution.

## Core Rule Inheritance

Every project quality-analysis or role-report Skill upgrade must read and inherit `skills/quality-analysis-core/SKILL.md` before editing the target Skill. The target Skill may define its own fields, organizational chain and specialist controls, but must not weaken the core rules for:

- fixed-statistics priority and the boundary of `待核实`;
- source-backed responsibility mapping;
- model versus Agent ownership of chart data and visual contracts;
- chart placement and replacement of duplicate data tables;
- removal of placeholders, machine metadata and rendering residue;
- post-generation fact, contract and placement validation.

During the Pass 1 gap matrix, add one explicit row for each applicable core rule. During forward-testing, verify that the tested report contains no template placeholders, no inferred responsibility chain, no known metric labelled `待核实`, and no chart appended outside its target section.

## Applying a Perspective Skill

Use the perspective in four controlled passes:

1. **Assumption challenge**: identify unproven assumptions and metric illusions.
2. **Bottleneck selection**: choose the smallest set of constraints explaining most impact; avoid broad generic recommendations.
3. **First-principles action**: convert each priority into a minimum viable validation experiment or process change.
4. **Execution pressure**: require an owner, deadline, acceptance gate, and escalation path.

The perspective may change prioritization, questions, and language. It must not change verified facts, formulas, access rules, or source mappings.

## Evidence and Failure Rules

- Missing column, unmapped person, empty category, or conflicting total: report the exact field and mark the affected conclusion as constrained.
- Conflicting source totals: show both values, identify the selected canonical source, and explain why; never silently pick a number.
- No evidence for a root cause: write a testable hypothesis plus the minimum validation request.
- Insufficient sample size or changed date scope: downgrade confidence and avoid causal claims.
- AI/API failure: preserve completed stages, record the failed stage and request size, and allow a deterministic non-AI fallback when the task supports one.
- Layout failure: preserve analytical content and emit a clear rendering limitation rather than flattening the report into unreadable prose.

## Acceptance Checklist

Before accepting the upgrade, verify:

- [ ] All key figures in the new report reconcile to the source data and stated formulas.
- [ ] Date scope, denominator, exclusions, and missing-value rules are explicit.
- [ ] Every major conclusion has an evidence reference or is marked `待验证`.
- [ ] The report identifies the true Top risks using the requested prioritization method.
- [ ] Recommendations are specific actions, not generic advice.
- [ ] Each priority action has exactly one Owner, deadline, acceptance metric, and closure evidence.
- [ ] Management summaries aggregate lower-level facts without copying personal detail incorrectly.
- [ ] Charts replace duplicate comparison tables where appropriate.
- [ ] Fixed statistics are not downgraded to `待核实`; only missing evidence is labelled that way.
- [ ] Responsibility names come from source fields or confirmed mappings, not narrative inference.
- [ ] Visual contract is generated by the correct owner, parses successfully, and charts appear in their target sections.
- [ ] No `章节标题`、`TODO`、example/template residue, machine JSON or UI/CSS text appears in the formal report.
- [ ] Existing project behavior outside the target Skill is unchanged.
- [ ] A forward-test was run against the original artifact after the edit.

If any mandatory item fails, label the result `未通过验收`, list the failed checks, and do not promote the Skill to the default version.

## Versioning and Handoff

Save the upgraded Skill as a versioned copy when the project has an existing production Skill, for example `quality-analysis-iqc-v2` or `quality-analysis-iqc-musk-v2`. Keep the original untouched until the acceptance checklist passes. In the final handoff, report:

- target Skill and version;
- source artifact/data scope used;
- changes made;
- checks passed and failed;
- remaining assumptions;
- whether it is safe to promote as the default.

## Short Invocation

When this Skill is available, the user should only need to say:

```text
使用Skill升级协议升级 [目标Skill]，视角为 [视角Skill]，用最近报告回跑验证。
```

If the user says only “升级这个Skill”, infer the target from the current file or link, but still locate a real source artifact and perform the two-pass workflow.
