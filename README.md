# Dashboard Architect Studio

A browser-only planning tool for beginners building Power BI or Tableau dashboards. Upload a CSV or Excel file, and the studio profiles the data, flags credibility issues, proposes grounded business questions with example SQL, recommends KPIs (with DAX and Tableau calculated fields), and draws a 16:9 dashboard mockup from real aggregates that you can export as PNG.

## Setup

Requires [Bun](https://bun.sh) (or Node 20+ with npm).

```bash
bun install
bun run dev        # http://localhost:8080
bun run test       # Vitest unit tests
bun run build      # production build
```

Stack: TanStack Start (React 19, TypeScript), Tailwind CSS v4, shadcn/ui, PapaParse, SheetJS (`xlsx`), Recharts, html-to-image.

## Features

- **Upload**: CSV/TSV/TXT via PapaParse; `.xlsx`/`.xls` via SheetJS (first sheet only, loaded on demand). Limits: 50 MB, 250,000 rows. Unsupported formats, empty files, duplicate/blank headers, extra fields and malformed quotes are rejected without replacing the current dataset. Short rows are padded with missing cells. Excel files must have a ZIP/OLE workbook signature.
- **Examples**: three original synthetic datasets (healthcare clinic visits, education student outcomes, logistics freight). They contain deliberate flaws (missing values, duplicates, outliers, label variants, an empty month) so the checks have something to find. Downloadable as CSV.
- **Profiling**: type detection (integer, number, date, boolean, category, text, identifier), missing values (incl. `NA`, `null`, `-`…), exact duplicate rows, repeated identifier values, IQR outliers, date range and empty months, cardinality, label case/whitespace variants, and plain-language caveats.
- **Credibility panel**: completeness, duplicates, coverage, consistency and possible bias, each with the evidence. Confidence (High/Medium/Low) comes from published rules, not a hidden score.
- **Business questions**: 8–12 when the fields allow it, ranked by a heuristic "decision value" that boosts columns matching your goal. Each has a rationale, method, expected chart and example SQL in **SQL Server** or **MySQL**. SQL is never executed.
- **KPIs**: formulas, DAX measures and Tableau calculated fields for feasible KPIs; infeasible ones (for example revenue when no money column exists) are listed as not feasible.
- **Dashboard mockup**: Executive, Analyst and Operations personas built with Recharts from real aggregates; PNG export; chart-by-chart Power BI and Tableau build steps. Choose Sum or Average in field roles to override the initial field-name hint. Missing measures remain unknown, missing calendar months remain gaps, all donut counts are retained in an Other bucket, and rate rankings are limited only after sorting by rate. The 1120×630 canvas scrolls horizontally on phones; PNGs are 2240×1260.
- **Optional Gemini assistant (bring your own key)**: see the privacy section below.

## Privacy

- All parsing and analysis runs in the browser. No server receives or stores your data, and nothing is written to localStorage, sessionStorage or cookies.
- The Gemini key is held only in React component state. Disabling the assistant or reloading the page clears it. It is never logged or persisted.
- Gemini requests go **directly from the browser** to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, with the key in the `x-goog-api-key` header. Anyone with access to the browser (devtools, extensions) can see the key, so use a restricted key you can revoke.
- Only a computed summary is sent: column names, types, stats and caveats, plus your entered industry and goal. Raw rows are never sent. Category labels, including label examples inside caveats, are excluded unless you opt in. The exact payload can be previewed before sending. Disabling, clearing the key, changing context or leaving the AI tab aborts an in-flight request; stale answers are not shown.
- Gemini keys are not automatically free or unlimited. HTTP 429 is reported as a quota/rate-limit error; 400 (invalid key), 401 and 403 are reported as key problems.
- AI output is parsed as JSON and validated. Items that reference columns not in your file are rejected and listed, and accepted items are labelled "AI suggestion · unverified".

## Limitations

- Type detection is heuristic. Ambiguous dates such as `03/04/2025` are read as month/day; invalid calendar dates are rejected. Field-role selectors choose detected columns, not arbitrary type overrides. Numeric identifiers can still need manual data cleaning.
- Only exact duplicate rows are detected, not fuzzy duplicates.
- The bias checks only look at group imbalance and missingness. They cannot see how the data was collected.
- Generated SQL assumes a cleaned, typed table named after the file and has not been run against any database. Use SQL Server or MySQL 8+: parse formatted numeric/date values, map all missing tokens to NULL, and normalize outcomes to 1/0/NULL before running the queries. Aliases and identifiers are quoted; decimal casts preserve fractional integer averages. Rates exclude unknown outcomes.
- DAX and Tableau snippets have not been executed in either desktop product. Record counts use COUNTROWS/SUM(1), distinct IDs exclude blanks, and flag rates use matching true/false vocabularies. Import flag fields as text or normalize them first. DAX month-over-month needs a marked related Date table; Tableau needs a complete calendar scaffold and month-directed table calculation. Both preserve unknown periods and use the signed prior-period denominator.
- The PNG export uses system fonts instead of the web fonts, because the fonts are served from another domain and cannot be embedded.
- Excel: only the first sheet is read, and formulas are read as their displayed values.
- Large files (>100k rows) can make the browser slow.

## Tests

`bunx vitest run` runs profiling, upload validation (including a real two-sheet XLSX), calculations, SQL/formula regressions, CSV round-trips of all examples, React upload/clear integration and mocked Gemini success/errors/privacy/cancellation. No real API key is used. See [QA_REPORT.md](QA_REPORT.md) for exact outcomes, browser coverage and remaining unverified workflows.