# Market Research Profile v1

This is an original adaptation of the information architecture commonly used by market-research report pages, informed by the supplied reference URL. The reference page was protected by an interstitial during inspection, so this note records only reusable topology and not copied branding, wording, imagery, or proprietary graphics.

## Layout zones

- Compact report masthead with a neutral product label and the selected module.
- Hero title followed by period, scope, confidence, and source metadata when present.
- Four short factual metrics in a horizontal strip; missing values are never invented.
- Two-column reading area: a narrow sticky section index and a wide article column.
- Exact lookup stays in tables; ranking and distribution tables may use audited charts under the existing visual contract.
- Footer carries module and report provenance only.

## Tokens and behavior

- Ink `#18212b`, muted text `#64748b`, rule `#dbe3ea`, accent `#0f5f78`, soft accent `#eef7f8`.
- 12px card radius, thin borders, restrained shadows, system Chinese sans-serif.
- Desktop index is sticky below the masthead. At 720px and below it becomes a horizontally scrollable row above the article.
- Tables use a minimum width and horizontal scrolling; no data is clipped.
- Print removes the index and action chrome, retaining metadata, article content, tables, and source notes.

## Content mapping

The deterministic Markdown renderer remains the source of truth. This profile changes only chrome and layout treatment; risk, action, evidence, confidence, and chart semantics are preserved.
