# Design QA

## Comparison targets

### Executive view

- Source visual truth: `C:\Users\77247\.codex\generated_images\019ee88a-42b2-7742-85db-a7417219b98e\ig_08cc650935cbe741016a388573d07881989b5233b159a330b5.png`
- Implementation screenshot: `C:\Users\77247\Desktop\半年报\quality-analytics-web\executive-screenshot.png`
- Combined comparison: `C:\Users\77247\Desktop\半年报\quality-analytics-web\executive-comparison.png`
- Viewport: 1440 × 1024
- State: sample half-year data, executive overview

### Analyst workspace

- Source visual truth: `C:\Users\77247\.codex\generated_images\019ee88a-42b2-7742-85db-a7417219b98e\ig_08cc650935cbe741016a3885ce764c819896f138ea9dd9c7fd.png`
- Implementation screenshot: `C:\Users\77247\Desktop\半年报\quality-analytics-web\workspace-viewport.png`
- Combined comparison: `C:\Users\77247\Desktop\半年报\quality-analytics-web\workspace-comparison.png`
- Viewport: 1440 × 1024
- State: sample half-year data, analyst overview

## Full-view comparison evidence

- Executive view preserves the navy sidebar, white management canvas, four KPI blocks, wide trend panel, risk table, heatmap, and stage distribution hierarchy.
- Workspace view preserves the dark horizontal navigation, filter strip, dataset status row, primary comparison chart, insight rail, and three lower analysis panels.
- The workspace extends below the source first screen with the selected action-board and IPD-gate concepts. This is intentional and visible in `workspace-actions.png`.

## Focused region comparison evidence

- KPI typography, sidebar spacing, table density, chart colors, filter controls, status chips, and panel radii were reviewed at full 1440 × 1024 scale. No additional crop was required because these details are readable in the combined comparisons.
- The lower workspace action board and IPD matrix were separately checked in `workspace-actions.png`.

## Findings

- No actionable P0, P1, or P2 visual mismatches remain.
- P3: The executive source shows a 12-month trend while the implementation uses the confirmed half-year period and therefore shows six months. This is an intentional data-period difference.
- P3: ECharts tooltips can remain visible in screenshots when the cursor rests on a chart. This does not affect normal use.
- P3: The implementation uses Microsoft YaHei UI / PingFang SC system fallbacks instead of an externally downloaded font so the prototype remains fully local.

## Required fidelity surfaces

- Fonts and typography: passed. Chinese system typography has matching weight, density, and hierarchy.
- Spacing and layout rhythm: passed. Primary grid proportions and panel spacing match both visual targets.
- Colors and visual tokens: passed. Navy executive palette and charcoal/emerald workspace palette are faithful.
- Image and asset quality: passed. The references contain no illustrative image assets; icons use the Phosphor icon library and charts are native ECharts.
- Copy and content: passed. Labels are adapted to the user's actual IQC/IPQC/OQC/DQA data and reporting vocabulary.

## Interaction verification

- View switching: passed.
- Executive module navigation: passed.
- Import modal and module-recognition states: passed.
- Saved template confirmation: passed.
- Add improvement action: passed.
- Workspace navigation and collapsible filters: passed.
- Console errors: none observed.
- Real Excel import smoke test: passed with one current IQC, IPQC, OQC, and DQA source file; all four modules were identified and recalculated.

## Patches made during QA

- Added functional workspace section navigation.
- Added collapsible filter strip.
- Added template-management page and reuse flow.
- Added improvement action creation feedback.
- Added local-only data privacy copy and unrecognized-file safeguards.

## Follow-up polish

- Optional future optimization: split the ECharts and XLSX bundles into lazy-loaded chunks to reduce first-load JavaScript size.

## IQC supplier machining extension

- Added Shenzhen / Hangzhou switching for supplier machining analysis.
- Added year-over-year monthly combo charts using total-quantity and nonconforming-quantity bars plus yield-rate lines; all series display value labels.
- Added anomaly-type comparison using quantity bars and anomaly-share lines, because an anomaly category itself has no independent yield denominator.
- Added material-attribute comparison using quantity bars and yield-rate lines.
- Added separate Shenzhen and Hangzhou main-supplier charts and tables, grouped by machining type and aligned to 2025 / 2026 quantity, defect quantity, yield, and year-over-year change.
- Updated the main-supplier names from the latest report outline, while retaining alias matching for abbreviated names in source data.
- Added default-all supplier checkboxes; deselected suppliers are removed from both chart and table.
- Added clickable sortable headers for every supplier comparison column.
- Added a global start/end date filter to the executive and analyst interfaces. Imported IQC, IPQC, OQC, and DQA rows are filtered before KPI, chart, ranking, category-share, and table calculations.
- Date-field mapping covers IQC `检验开始时间`, IPQC `日期`, OQC `发货时间`, and DQA `发生日期` / `下单日期` / `时间`.
- Rebuilt the IPQC module as a Shenzhen / Hangzhou comparison workspace with monthly component volume, issue count, and issue-density trends.
- Added workshop checkbox filtering and sortable year-over-year tables, raw `不良类型` analysis, reclassification from `不良内容`, workshop-category heatmaps, and TOP targeted actions.
- IPQC issue density is consistently calculated as `异常问题数量 ÷ 检查组件数量 × 100%`.
- Verified both current IPQC source files: Shenzhen and Hangzhou are separated from file names and recalculate independently under the dual-period date filter.
- Updated the IPQC business formula to `异常密度 = 问题数量 ÷ 送检数`; `问题数量` means non-empty `不良内容` record rows, with each row counted once. The source `不良数` represents defective-machine quantity and is not used as this numerator.
- Fixed XLSX China-midnight timezone drift that moved each month's first-day records into the previous month. Verified Hangzhou May 2026 as `193 / 3366 = 5.73%`.
- Removed reclassification from `不良内容`; the heatmap and TOP analysis now use the source `不良类型` field.
- Low-percentage combo-chart labels are moved into open plot space, offset by year, and connected with guide lines so they do not cover the horizontal-axis labels.
- Added global small / standard / large font controls to both application views. The setting persists locally and scales all ECharts text plus tables and detail grids across IQC, IPQC, OQC, DQA, overview, and action pages.
- Added a dedicated parser for `2025年-2026年评分按月汇总.xlsx`, including its two vertically separated year blocks and merged product-division cells.
- OQC comparisons use January–May for both years. Average score is quantity-weighted, 5-score rate is score-5 count / total count, and low-score rate is score-1-to-3 count / total count.
- Product-one includes 赵佳池 and 赵佳池（传感器）; product-five includes 周超; FPC includes 刘波、王辉、罗超、林秋秋、朱慧慧. Summary rows are excluded.
- Added three-division summary charts, monthly division switching, FPC TPM charts, and sortable detail tables. Real workbook calculations and browser interactions passed.
- Reworked OQC monthly trends into direct year-over-year numerator/denominator combo charts. Each month has a separate 2025 group and 2026 group; within each year, the denominator is a wide blue bar and the numerator is a narrow orange overlay. Two lines compare the annual metric.
- Real IQC import recalculation, production build, and import smoke tests passed; no browser console errors were observed.

## DQA dual-year comparison

- Added the “三大产品部总体对比” module with stage, source abnormal-category, and discipline shares. Every product division displays separate 2025 and 2026 100% stacked bars.
- Added the “各产品部TPM对比” module with division switching and the same stage, abnormal-category, and discipline comparison structure for TPMs.
- Added a detail table below every DQA chart with object, year, total count, category count, and percentage.
- Review totals use the 2025 dedicated review workbooks' quantity field and the 2026 R&D detail rows whose stage is review. Production and field issues count source detail rows.
- Abnormal-category and discipline comparisons intentionally include only production and field issues, because the 2025 review workbooks contain totals without category or discipline detail.
- Added a DQA year-over-year overview with four stage KPI cards, a three-division risk table, and data-driven conclusions that update with the date filter.
- All DQA horizontal comparison charts place 2025 above 2026.
- Changed the global comparison-date workflow to draft dates plus an explicit “刷新数据” action. Imported data, charts, KPIs, and detail tables recalculate only after the user confirms the new range.
- Fixed a hard-coded month-axis defect: IQC, IPQC, and OQC monthly datasets now generate months from the selected comparison ranges instead of stopping at month 6 (or month 5 for OQC).
- Refresh no longer reports success when the page only has built-in sample data and no imported source files; it displays “请先导入数据” instead.
- Added a real-file smoke test confirming that a January–August selection produces January through August rows for both IQC and IPQC.
- Added an IQC “特采计为不合格” checkbox. Unchecked treats special acceptance as qualified; checked moves the same batches into the nonconforming count and recalculates monthly, material, and supplier yields.
- Kept ordinary IQC abnormal-type analysis limited to `质检结果=不合格`, preventing special-acceptance batches from being counted twice.
- Added a special-acceptance risk section with monthly trend, material distribution, supplier TOP, evidence classification, and traceable source descriptions.
- “疑似过度设计” is explicitly an evidence lead, not an automatic conclusion. High evidence requires a specification deviation plus a source note confirming no impact on assembly/function; medium evidence requires a material, hardness, tolerance, or surface-specification deviation that was still released by special acceptance.
- Real-file validation passed for Shenzhen and Hangzhou. Under the current January–June range, Hangzhou 2026 has 1,143 suspected-overdesign special-acceptance records (42.3%), while Shenzhen has 42 (2.2%), supporting site-specific rather than blanket conclusions.
- Renamed the IQC checkbox to “计入特采”.
- Moved the special-acceptance section to the end of the IQC page and made it collapsed by default.
- Fixed the special-acceptance monthly chart to use the `month` field, eliminating undefined horizontal-axis labels.
- Audited IQC internal-processing scope. “一楼自制” appears as one exact supplier name in both source files (61,275 Shenzhen rows and 43,609 Hangzhou rows across the full files).
- Excluded internal-processing rows from all external-supplier IQC calculations, including the top KPI, material summary, supplier risk pool, monthly external yield, supplier candidates, rankings, and special-acceptance analysis.
- Added a separate collapsed “内部加工（一楼自制）专项分析” section with monthly yield, source abnormal-type distribution, and material quality performance. Its yield follows the same “计入特采” switch.
- Fixed the external-supplier monthly total scope. The overall supplier trend now excludes only internal processing; it no longer incorrectly drops standard parts, PCB, electronics, or electrical-material rows. Processing-type, material, and main-supplier analyses retain their machining-specific scope.
- Reconciled the current Hangzhou workbook for May 2026: 7,052 total rows − 2,931 “一楼自制” rows = 4,121 external-supplier rows. The former chart value 3,796 omitted 296 standard-part rows and 29 PCB rows.

## Local persistence and desktop delivery

- Added IndexedDB persistence for parsed imported sources. The application restores saved sources and recalculates the dashboard automatically after restart.
- Added a dedicated data-source management page with separate IQC, IPQC, OQC, and DQA import/replace entry points.
- Same-module, same-filename imports replace the stored source. Different filenames are added. Every stored source has an explicit delete action.
- Module-specific imports reject files recognized as another module, preventing accidental cross-module mixing.
- Added an Electron-based Windows desktop wrapper and a reproducible portable packaging script.
- Generated and launch-tested `release/QMS质量分析平台-免安装版.zip`; the recipient only needs to extract the complete folder and run `QMS质量分析平台.exe`.
- Follow-up audit found that the PowerShell 5 portable-packaging script decoded UTF-8 Chinese output paths incorrectly, creating both normal and mojibake release directories. This makes it possible to run a stale package while assuming it is current.
- Desktop persistence of the full real dataset has not yet passed an import-close-reopen acceptance test. The desktop `file://` IndexedDB origin is separate from the browser development origin, and the two IQC specialty panels do not render when restored data falls back to sample data.
- Packaging is paused until final development is complete. See `桌面版打包问题记录.md` for root-cause evidence and the required final-release checklist.

## Executive overview refresh

- Replaced the overview IQC sample line chart with two real-data supplier combo charts: Shenzhen and Hangzhou. Both show 2025/2026 inspection quantities, nonconforming quantities, yield lines, and value labels.
- Replaced automatic TOP-risk supplier ranking with a manual supplier picker. Users explicitly add or remove Shenzhen/Hangzhou suppliers, and the selected list persists locally.
- Recalculated the four overview KPI values and year-over-year changes from the currently imported and date-filtered data. DQA stage distribution now also comes from the imported 2026 product-division stage data.
- Confirmed that the former product-division/module risk matrix was hard-coded sample data. Because current IQC and IPQC sources have no product-division field, the fake numeric scores were removed and replaced with “待映射/待确认” states pending an approved mapping and scoring formula.

## Web launcher reliability

- Fixed the `The service is no longer running` Vite overlay caused by a stale Vite process whose esbuild child process had exited.
- Development mode now uses Vite's runner config loader and no longer uses the warmup transform that contributed to the dead esbuild service state.
- Replaced the UTF-8 Chinese batch-script body with an ASCII launcher and a PowerShell helper. It stops the stale Node listener on port 4173, starts a fresh server, waits until `src/App.jsx` returns HTTP 200, and only then opens the browser.
- Enabled strict port behavior so the launcher cannot silently move to 4174/4175 while opening the wrong URL.
- Moved the font-size control into the shared filter area so it is available on every executive module and workspace section. Added a “特大” option; scaling is limited to chart text, tables, detail grids, and small readouts, while page headings and already-large KPI values remain fixed.
- Normalized “产品一部” to the display name “半导体&北美” throughout the relevant interface.
- Verified all six chart/table groups, product-division switching, production build, nine-file DQA import calculations, and browser console output.

final result: passed
