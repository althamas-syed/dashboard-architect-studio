# Dashboard Architect Studio QA — 2026-11-07

The app remains unpublished. All uploaded data processing remains client-side. No real Gemini key or live provider request was used.

## Exact commands and outcomes

- `bunx vitest run`: initial baseline **13/13 passed**, 3 files.
- First expanded run: **54 passed, 2 failed**, 5 files. Both failures were incorrect test assumptions that every example contained exact duplicate rows. Inspection confirmed healthcare has 14; education and logistics have 0. Assertions now check these concrete counts.
- Intermediate automatic typecheck reported 18 diagnostics after non-null assertions were removed. Added explicit validated column/stat guards; subsequent checks passed.
- Final `bunx vitest run`: **61/61 passed**, 5 files, 0 failures. Test distribution: analysis 8, Gemini 7, routing 1, QA regressions 37, React integration 8.
- `python3 /tmp/browser/qa/check_flow.py`: passed the asserted example, persona, PNG, invalid CSV, mocked Gemini and mobile checks. One exploratory tooltip probe targeted a hidden wrapper and printed false; it was superseded by the targeted chart interaction below.
- `python3 /tmp/browser/qa/check_upload_tooltips.py`: final run passed real XLSX file-picker upload, first-sheet notice, bar tooltip showing A / amount 40, CSV drag-and-drop, and invalid Excel/header-only CSV checks. Initial probe failed on an obsolete chart class selector; updated to the actual chart wrapper, without changing app logic.
- `python3 /tmp/browser/qa/check_latest.py`: confirmed five isolated education rate points, current heading geometry, and a real PNG download. Inspected screen and exported PNG visually, including export font/layout consistency.
- Automatic compilation/typechecking log: latest checked entry **build OK**, no current errors. Manual `bun run build`, `vite build`, and standalone typechecks were **not run**: this environment instructs the agent to rely on its automatic build/typecheck harness. This is not an independent production-host verification.

Temporary browser scripts and synthetic fixtures live under `/tmp/browser/qa`; maintained unit/integration tests live in `src/test`.

## Functional repairs

1. Strict file format/header/quote/field-count validation, preserving the existing dataset on errors. Excel signature validation prevents text renamed as XLSX from being silently accepted.
2. Concurrent file loads cannot overwrite a newer upload or a cleared dataset. All-missing-token records are preserved instead of silently discarded.
3. Invalid calendar dates are rejected rather than normalized into different dates. Genuine consecutive and low-cardinality numeric measures remain selectable.
4. Repeated named entity IDs are recognized even when uniqueness is low; tiny categorical groups are checked beyond the displayed top eight; zero-IQR outliers use the advertised fences.
5. Explicit Sum/Average selector overrides field-name hints. Missing groups remain unknown, absent calendar months remain gaps, and aggregates read supplied rows rather than unrelated profile totals.
6. Rate rankings consider all groups before truncation. Unknown rates are not zero. Donuts include remaining counts in Other; histograms retain extreme values; scatter samples cap at 400 points.
7. SQL identifiers, aliases and table names are escaped/quoted. Integer averages and histogram division use decimal arithmetic. Boolean expressions trim values and exclude unknown outcomes. Exact-row distinct counts are separate from distinct entity counts.
8. Tableau row count uses SUM(1), distinct-ID DAX excludes blanks, flag formulas share true/false vocabularies, guarded ratios avoid zero denominators, and MoM formulas share signed denominators with explicit complete-calendar prerequisites.
9. Operations data-health KPIs are visible. Isolated monthly observations render as dots. PNG canvas dimensions are stable, and the canvas uses system fonts both onscreen and in export to avoid font-substitution overlap.
10. Gemini cancellation remains cancellation, stale requests cannot replace current results, malformed transport responses are handled, and category labels embedded in caveats are excluded by default. Keys remain transient state and never enter request URLs or bodies.
11. Clipboard success is shown only after the copy succeeds; failed clipboard access offers manual text selection instead of fake success.
12. README and Power BI/Tableau instructions describe the actual data-cleaning and calendar prerequisites, rather than claiming executable raw-import equivalents.

## Browser coverage

- Three examples: healthcare **1,214 rows / 12 questions**, education **900 rows / 10 questions**, logistics **1,500 rows / 10 questions**.
- Profile, credibility, questions, SQL dialect switching, KPIs, dashboard and build instructions traversed.
- Executive, Analyst and Operations for each example: **9 real PNG downloads**, each **2240×1260**, checked for dimensions and nonblank contents. Representative PNGs were visually reviewed; a later targeted export confirmed the repaired heading and isolated monthly points.
- CSV upload via file input and drag/drop; XLSX through the actual file chooser; empty, header-only, malformed quote, duplicate header, unsupported PDF, empty XLSX and disguised XLSX rejected.
- Chart tooltip verified with synthetic A group totaling **40**.
- Gemini mocked quota and success in Chromium; nonexistent revenue question rejected; key sent in header only; no key in storage/cookies; disabling clears key. Unit/integration tests additionally cover 400, 403, 500, network failure, malformed JSON, empty candidates and aborts.
- Mobile 390×844: document width **390**, scroll width **390**, no document-level horizontal overflow. Canvas itself intentionally scrolls horizontally. Desktop checks used 1280×1800.
- Main browser flow recorded **0 page errors**.

## Unverified / limitations

- No real Gemini request, real quota, live CORS behavior or provider billing check.
- SQL was not executed against SQL Server/MySQL, and DAX/Tableau snippets were not run inside desktop products. They require a cleaned typed staging table, normalized flags and complete calendar where documented; MySQL 8+ for window functions.
- No separately invoked production build or deployed-production browser test. The application was not published.
- No Firefox/Safari, screen-reader, full keyboard-only audit, very large-file performance test, encrypted workbook, merged-cell/formula workbook, or legacy XLS end-to-end test.
- Goal/industry and column names are intentionally sent when Gemini is invoked; users must avoid putting sensitive narrative content there. Browser extensions/devtools can inspect a BYOK key while it is in memory.
- This is still a dashboard planning tool, not a SQL executor, BI project-file generator, or interactive BI filtering engine. Charts expose tooltips; no unimplemented cross-filtering is claimed.