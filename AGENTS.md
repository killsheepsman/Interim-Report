# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Confirmed product direction

- Build two reusable views backed by one analysis engine:
  - Executive view: 经营驾驶舱, matching the navy-sidebar management dashboard concept.
  - Analyst view: 质量工作台 as the main direction, blended with the action board and IPD gate controls from 质量作战室.
- Users import IQC, IPQC, OQC, and DQA Excel files locally in the browser.
- Preserve the existing quality-analysis formulas and raw-text classification approach.
- The product must support reusable templates, interactive charts, saved views, exported analysis data, and improvement action tracking.
