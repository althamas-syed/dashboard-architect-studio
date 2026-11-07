// Business questions, SQL, KPIs, DAX and Tableau snippets derived only from the computed profile.
import { usesAverage } from "./aggregate";
import type { DatasetProfile } from "./profile";

export type Dialect = "sqlserver" | "mysql";
export type ChartKind = "line" | "bar" | "donut" | "scatter" | "histogram" | "table" | "heatmap" | "kpi";

export interface Roles {
  aggregation?: "sum" | "average"; table: string; measure?: string; measure2?: string; dim1?: string; dim2?: string; date?: string; flag?: string; id?: string;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
const HINT = /cost|revenue|sales|amount|price|score|minutes|days|wait|weight|distance|hours|rate|value|spend/i;

function rankByGoal(cols: string[], goal: string) {
  const g = new Set(words(goal));
  return [...cols].sort((a, b) => score(b) - score(a));
  function score(c: string) { return words(c.replace(/_/g, " ")).filter((w) => [...g].some((x) => x.startsWith(w.slice(0, 4)) || w.startsWith(x.slice(0, 4)))).length * 2 + (HINT.test(c) ? 1 : 0); }
}

export function pickRoles(p: DatasetProfile, goal: string, fileName: string): Roles {
  const ms = rankByGoal(p.measures, goal);
  const dims = rankByGoal(p.dimensions.filter((d) => !p.booleans.includes(d)), goal);
  const flags = rankByGoal(p.booleans, goal);
  const table = (fileName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "t_$1") || "dataset").toLowerCase();
  return { table, measure: ms[0], measure2: ms[1], dim1: dims[0], dim2: dims[1], date: p.dates[0], flag: flags[0], id: p.ids[0] };
}

export const q = (d: Dialect, c: string) => (d === "sqlserver" ? `[${c.replace(/]/g, "]]")}]` : `\`${c.replace(/`/g, "``")}\``);
const monthExpr = (d: Dialect, c: string) => (d === "sqlserver" ? `DATEFROMPARTS(YEAR(${q(d, c)}), MONTH(${q(d, c)}), 1)` : `DATE_FORMAT(${q(d, c)}, '%Y-%m-01')`);
const top = (d: Dialect, n: number, body: string) => (d === "sqlserver" ? body.replace(/^SELECT /, `SELECT TOP ${n} `) : `${body}\nLIMIT ${n}`);
const flagExpr = (d: Dialect, c: string) => {
  const normalized = `LOWER(LTRIM(RTRIM(CAST(${q(d, c)} AS ${d === "sqlserver" ? "VARCHAR(20)" : "CHAR(20)"}))))`;
  return `CASE WHEN ${normalized} IN ('1','yes','y','true','t') THEN 1.0 WHEN ${normalized} IN ('0','no','n','false','f') THEN 0.0 ELSE NULL END`;
};

export interface Question {
  id: string; question: string; rationale: string; chart: ChartKind; methodology: string; sql: string; columns: string[]; value: number; ai?: boolean;
}

export function generateQuestions(p: DatasetProfile, r: Roles, d: Dialect, goal: string): Question[] {
  const T = d === "sqlserver" ? `dbo.${q(d, r.table)}` : q(d, r.table);
  const out: Question[] = [];
  const { measure: m, measure2: m2, dim1, dim2, date, flag, id } = r;
  const col = (n?: string) => {
    const c = p.columns.find((c) => c.name === n);
    if (!c) throw new Error(`Unknown column: ${n}`);
    return c;
  };
  const numeric = (n: string) => { const stats = col(n).numeric; if (!stats) throw new Error(`Not a numeric column: ${n}`); return stats; };
  const dateStats = (n: string) => { const stats = col(n).date; if (!stats) throw new Error(`Not a date column: ${n}`); return stats; };
  const notNull = (c: string) => `${q(d, c)} IS NOT NULL`;
  const add = (x: Omit<Question, "id" | "sql"> & { sql: string }) => out.push({ ...x, id: `q${out.length + 1}` });
  const goalHit = (cols: string[]) => cols.filter(Boolean).some((c) => rankByGoal([c, "__"], goal)[0] === c && words(goal).some((w) => c.toLowerCase().includes(w.slice(0, 4)))) ? 2 : 0;

  if (flag && dim1) add({
    question: `Which ${dim1} has the highest ${flag} rate?`, columns: [flag, dim1], chart: "bar", value: 9 + goalHit([flag]),
    rationale: `"${flag}" is a yes/no outcome; comparing its rate across ${col(dim1).distinct} ${dim1} groups shows where intervention would move the outcome most.`,
    methodology: `Rate = rows where ${flag} is true ÷ all rows with ${flag} recorded, per ${dim1}. Show group size next to each rate; ignore groups under ~30 rows.`,
    sql: `SELECT ${q(d, dim1)},\n       COUNT(*) AS rows_n,\n       AVG(${flagExpr(d, flag)}) AS ${q(d, `${flag}_rate`)}\nFROM ${T}\nWHERE ${notNull(flag)}\nGROUP BY ${q(d, dim1)}\nORDER BY ${q(d, `${flag}_rate`)} DESC;`,
  });
  if (m && date) add({
    question: `How has ${m} trended month over month?`, columns: [m, date], chart: "line", value: 9 + goalHit([m]),
    rationale: `A monthly trend shows whether ${m} is improving or deteriorating. Data covers ${dateStats(date).min} to ${dateStats(date).max}.`,
    methodology: `Truncate ${date} to month, aggregate ${m} (SUM for volumes, AVG for per-record measures). ${dateStats(date).missingMonths.length ? `Note: ${dateStats(date).missingMonths.length} empty month(s) will appear as gaps.` : "No empty months detected."}`,
    sql: `SELECT ${monthExpr(d, date)} AS month_start,\n       COUNT(*) AS rows_n,\n       SUM(${q(d, m)}) AS ${q(d, `total_${m}`)},\n       AVG(CAST(${q(d, m)} AS DECIMAL(28, 8))) AS ${q(d, `avg_${m}`)}\nFROM ${T}\nWHERE ${notNull(date)}\nGROUP BY ${monthExpr(d, date)}\nORDER BY month_start;`,
  });
  if (m && dim1) add({
    question: `Which ${dim1} contributes most to ${m}, and how does the average compare?`, columns: [m, dim1], chart: "bar", value: 8.5 + goalHit([m, dim1]),
    rationale: `Ranking ${dim1} by total and average ${m} separates "big because of volume" from "big per record".`,
    methodology: `Group by ${dim1}; compute SUM, AVG and COUNT of ${m}. Sort descending. Use a horizontal bar chart for readability.`,
    sql: `SELECT ${q(d, dim1)},\n       COUNT(${q(d, m)}) AS rows_n,\n       SUM(${q(d, m)}) AS ${q(d, `total_${m}`)},\n       AVG(CAST(${q(d, m)} AS DECIMAL(28, 8))) AS ${q(d, `avg_${m}`)}\nFROM ${T}\nGROUP BY ${q(d, dim1)}\nORDER BY ${q(d, `total_${m}`)} DESC;`,
  });
  if (flag && date) add({
    question: `Is the ${flag} rate changing over time?`, columns: [flag, date], chart: "line", value: 8 + goalHit([flag]),
    rationale: `Tracks whether the outcome is getting better, which matters for judging past initiatives.`,
    methodology: `Monthly rate of ${flag}; display the monthly row count as context because small months swing widely.`,
    sql: `SELECT ${monthExpr(d, date)} AS month_start,\n       COUNT(*) AS rows_n,\n       AVG(${flagExpr(d, flag)}) AS ${q(d, `${flag}_rate`)}\nFROM ${T}\nGROUP BY ${monthExpr(d, date)}\nORDER BY month_start;`,
  });
  if (m && dim1 && dim2) add({
    question: `How does average ${m} vary across ${dim1} × ${dim2}?`, columns: [m, dim1, dim2], chart: "heatmap", value: 7.5,
    rationale: `Cross-tabulating two dimensions reveals combinations that a single breakdown hides.`,
    methodology: `Matrix / highlight table: rows ${dim1}, columns ${dim2}, value AVG(${m}). Grey out cells with small counts.`,
    sql: `SELECT ${q(d, dim1)}, ${q(d, dim2)},\n       COUNT(*) AS rows_n,\n       AVG(CAST(${q(d, m)} AS DECIMAL(28, 8))) AS ${q(d, `avg_${m}`)}\nFROM ${T}\nGROUP BY ${q(d, dim1)}, ${q(d, dim2)}\nORDER BY ${q(d, dim1)}, ${q(d, dim2)};`,
  });
  if (m && numeric(m).outliers) add({
    question: `Which records have unusually high or low ${m}?`, columns: [m, ...(id ? [id] : [])], chart: "table", value: 7 + goalHit([m]),
    rationale: `${numeric(m).outliers} values fall outside the IQR fences (${numeric(m).lowerFence.toFixed(1)} – ${numeric(m).upperFence.toFixed(1)}). They may be data errors or genuine exceptions worth reviewing.`,
    methodology: `Flag values beyond Q1 − 1.5×IQR or Q3 + 1.5×IQR. Validate with the data owner before excluding anything.`,
    sql: top(d, 50, `SELECT ${id ? `${q(d, id)}, ` : ""}${q(d, m)}${dim1 ? `, ${q(d, dim1)}` : ""}\nFROM ${T}\nWHERE ${q(d, m)} > ${numeric(m).upperFence.toFixed(2)} OR ${q(d, m)} < ${numeric(m).lowerFence.toFixed(2)}\nORDER BY ${q(d, m)} DESC`) + (d === "sqlserver" ? ";" : ";"),
  });
  if (m && m2) add({
    question: `Is ${m} related to ${m2}?`, columns: [m, m2], chart: "scatter", value: 6.5,
    rationale: `If ${m2} explains ${m}, it becomes a lever or a planning input. Correlation is not causation.`,
    methodology: `Scatter plot of ${m2} (x) vs ${m} (y), optionally coloured by ${dim1 ?? "a category"}. Add a trend line; report r only with sufficient rows.`,
    sql: `SELECT ${q(d, m2)}, ${q(d, m)}${dim1 ? `, ${q(d, dim1)}` : ""}\nFROM ${T}\nWHERE ${notNull(m)} AND ${notNull(m2)};`,
  });
  if (dim2) add({
    question: `How is volume distributed across ${dim2}?`, columns: [dim2], chart: "donut", value: 6,
    rationale: `Understanding the mix tells you which segments dominate totals and which are too small to compare.`,
    methodology: `Count rows per ${dim2} and share of total. Prefer a bar chart if there are more than 5 categories.`,
    sql: `SELECT ${q(d, dim2)},\n       COUNT(*) AS rows_n,\n       100.0 * COUNT(*) / SUM(COUNT(*)) OVER () AS pct_of_total\nFROM ${T}\nGROUP BY ${q(d, dim2)}\nORDER BY rows_n DESC;`,
  });
  if (m) add({
    question: `What does the distribution of ${m} look like?`, columns: [m], chart: "histogram", value: 5.5,
    rationale: `Median ${numeric(m).median.toFixed(1)} vs mean ${numeric(m).mean.toFixed(1)}: a gap signals skew, so averages may mislead.`,
    methodology: `Histogram with ~10–20 bins. Report the median alongside the mean.`,
    sql: `SELECT FLOOR(CAST(${q(d, m)} AS DECIMAL(28, 8)) / ${binWidth(numeric(m))}) * ${binWidth(numeric(m))} AS bin_start,\n       COUNT(*) AS rows_n\nFROM ${T}\nWHERE ${notNull(m)}\nGROUP BY FLOOR(CAST(${q(d, m)} AS DECIMAL(28, 8)) / ${binWidth(numeric(m))}) * ${binWidth(numeric(m))}\nORDER BY bin_start;`,
  });
  if (m && dim1) add({
    question: `Top 10 ${dim2 ?? dim1} values by total ${m}`, columns: [m, dim2 ?? dim1], chart: "table", value: 5,
    rationale: `A focused ranking supports operational follow-up on the largest contributors.`,
    methodology: `Group by ${dim2 ?? dim1}, SUM(${m}), keep top 10.`,
    sql: top(d, 10, `SELECT ${q(d, dim2 ?? dim1)}, SUM(${q(d, m)}) AS ${q(d, `total_${m}`)}\nFROM ${T}\nGROUP BY ${q(d, dim2 ?? dim1)}\nORDER BY ${q(d, `total_${m}`)} DESC`) + ";",
  });
  const heavy = p.columns.filter((c) => c.missingPct > 0.03).sort((a, b) => b.missingPct - a.missingPct)[0];
  if (heavy && dim1) add({
    question: `Is missing ${heavy.name} concentrated in particular ${dim1} groups?`, columns: [heavy.name, dim1], chart: "bar", value: 4.5,
    rationale: `${heavy.missing} rows (${(heavy.missingPct * 100).toFixed(1)}%) lack ${heavy.name}. If missingness clusters in one group, comparisons are biased.`,
    methodology: `Missing rate of ${heavy.name} per ${dim1}. This is a data-quality check before publishing the dashboard.`,
    sql: `SELECT ${q(d, dim1)},\n       COUNT(*) AS rows_n,\n       AVG(CASE WHEN ${q(d, heavy.name)} IS NULL THEN 1.0 ELSE 0.0 END) AS missing_rate\nFROM ${T}\nGROUP BY ${q(d, dim1)}\nORDER BY missing_rate DESC;`,
  });
  if (p.duplicateRows || p.duplicateIdValues) add({
    question: `How many exact distinct records remain, and are entity keys repeated?`, columns: p.columns.map((c) => c.name), chart: "kpi", value: 4,
    rationale: `${p.duplicateRows} exact duplicates${p.duplicateIdValues ? ` and ${p.duplicateIdValues} repeated ${id} values` : ""} were detected; every KPI depends on the correct grain.`,
    methodology: `Count exact distinct rows separately from distinct entity keys. Repeated keys are not necessarily duplicate events; decide grain with the data owner.`,
    sql: `SELECT COUNT(*) AS all_rows,
       (SELECT COUNT(*) FROM (SELECT DISTINCT ${p.columns.map((c) => q(d, c.name)).join(", ")} FROM ${T}) AS deduplicated) AS exact_distinct_rows${id ? `,\n       COUNT(DISTINCT ${q(d, id)}) AS ${q(d, `distinct_${id}`)}` : ""}\nFROM ${T};`,
  });
  if (dim1 && !m) add({
    question: `How many records fall in each ${dim1}?`, columns: [dim1], chart: "bar", value: 6,
    rationale: `With no numeric measure, counts per group are the most reliable starting point.`,
    methodology: `COUNT(*) per ${dim1}.`, sql: `SELECT ${q(d, dim1)}, COUNT(*) AS rows_n\nFROM ${T}\nGROUP BY ${q(d, dim1)}\nORDER BY rows_n DESC;`,
  });
  return out.sort((a, b) => b.value - a.value).slice(0, 12).map((x, i) => ({ ...x, id: `q${i + 1}` }));
}

function binWidth(n: { min: number; max: number }) {
  const raw = (n.max - n.min) / 15 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((k) => k * mag).find((k) => k >= raw) ?? raw;
}

export interface Kpi { name: string; formula: string; dax: string; tableau: string; caveats: string[]; feasible: boolean }

export function recommendKpis(p: DatasetProfile, r: Roles): Kpi[] {
  const t = `'${r.table.replace(/'/g, "''")}'`;
  const field = (name: string) => `[${name.replace(/]/g, "]]")}]`;
  const col = (n?: string) => p.columns.find((c) => c.name === n);
  const miss = (n?: string) => { const c = col(n); return c && c.missing ? [`${c.missing} rows (${(c.missingPct * 100).toFixed(1)}%) have no ${n}; aggregates ignore them.`] : []; };
  const k: Kpi[] = [];
  k.push({ name: "Record count", formula: "COUNT(rows)", dax: `Record Count = COUNTROWS(${t})`, tableau: `// Record Count\nSUM(1)`, caveats: p.duplicateRows ? [`Includes ${p.duplicateRows} duplicate rows unless removed in Power Query / Tableau Prep.`] : [], feasible: true });
  if (r.id) k.push({ name: `Distinct ${r.id}`, formula: `COUNT DISTINCT(${r.id})`, dax: `Distinct ${r.id} = DISTINCTCOUNTNOBLANK(${t}${field(r.id)})`, tableau: `COUNTD(${field(r.id)})`, caveats: p.duplicateIdValues ? [`${r.id} repeats ${p.duplicateIdValues} times; confirm whether this is one row per entity or per event.`] : [], feasible: true });
  if (r.measure) {
    const m = r.measure;
    k.push({ name: `Total ${m}`, formula: `SUM(${m})`, dax: `Total ${m} = SUM(${t}${field(m)})`, tableau: `SUM(${field(m)})`, caveats: [...miss(m), ...(col(m)?.numeric?.outliers ? [`${col(m)?.numeric?.outliers} outliers can dominate the total.`] : [])], feasible: true });
    k.push({ name: `Average ${m}`, formula: `AVG(${m})`, dax: `Average ${m} = AVERAGE(${t}${field(m)})`, tableau: `AVG(${field(m)})`, caveats: miss(m), feasible: true });
    k.push({ name: `Median ${m}`, formula: `MEDIAN(${m})`, dax: `Median ${m} = MEDIAN(${t}${field(m)})`, tableau: `MEDIAN(${field(m)})`, caveats: ["Median is more robust than average when outliers are present."], feasible: true });
    if (r.measure2 && /weight|kg|units|qty|quantity|hours|distance|km/i.test(r.measure2)) k.push({ name: `${m} per ${r.measure2}`, formula: `SUM(${m}) / SUM(${r.measure2})`, dax: `${m} per ${r.measure2} = DIVIDE(SUM(${t}${field(m)}), SUM(${t}${field(r.measure2)}))`, tableau: `IF SUM(${field(r.measure2)}) != 0 THEN SUM(${field(m)}) / SUM(${field(r.measure2)}) END`, caveats: [...miss(r.measure2), "Ratio of sums, not average of ratios."], feasible: true });
  }
  if (r.flag) {
    const f = r.flag;
    const normal = `LOWER(TRIM(${t}${field(f)} & ""))`;
    k.push({ name: `${f} rate`, formula: `recognized true / recognized true-or-false`,
      dax: `${f} Rate = AVERAGEX(${t}, VAR V = ${normal} RETURN SWITCH(TRUE(), V IN {"1","yes","y","true","t"}, 1.0, V IN {"0","no","n","false","f"}, 0.0, BLANK()))`,
      tableau: `AVG(IF LOWER(TRIM(STR(${field(f)}))) IN ("1","yes","y","true","t") THEN 1.0 ELSEIF LOWER(TRIM(STR(${field(f)}))) IN ("0","no","n","false","f") THEN 0.0 END)`,
      caveats: [...miss(f), "Only recognized true/false values enter the denominator. Import this field as text, or normalize it to 1/0/NULL before using these formulas."], feasible: true });
  }
  if (r.measure && r.date) {
    const operation = usesAverage(r.measure, r.aggregation) ? "AVERAGE" : "SUM";
    const tableauOperation = operation === "AVERAGE" ? "AVG" : "SUM";
    k.push({ name: `${r.measure} month-over-month %`, formula: "(this month − prior calendar month) / prior month",
      dax: `${r.measure} MoM % =\nVAR Cur = ${operation}(${t}${field(r.measure)})\nVAR Prev = CALCULATE(${operation}(${t}${field(r.measure)}), DATEADD('Date'[Date], -1, MONTH))\nRETURN IF(ISBLANK(Cur) || ISBLANK(Prev), BLANK(), DIVIDE(Cur - Prev, Prev))`,
      tableau: `// Complete monthly calendar required; compute along MONTH(${field(r.date)})\nIF NOT ISNULL(LOOKUP(${tableauOperation}(${field(r.measure)}), -1)) AND LOOKUP(${tableauOperation}(${field(r.measure)}), -1) != 0 THEN\n(${tableauOperation}(${field(r.measure)}) - LOOKUP(${tableauOperation}(${field(r.measure)}), -1)) / LOOKUP(${tableauOperation}(${field(r.measure)}), -1) END`,
      caveats: ["Use a complete monthly calendar scaffold in Tableau (including empty months) and a marked related Date table in Power BI. Missing or zero prior months return blank."], feasible: true });
  }
  // Infeasible-but-commonly-wanted KPIs, stated honestly.
  if (!r.date) k.push({ name: "Trend / growth KPIs", formula: "n/a", dax: "", tableau: "", caveats: ["Not feasible: no date column detected."], feasible: false });
  if (!/revenue|sales|price|amount/i.test(p.columns.map((c) => c.name).join(" "))) k.push({ name: "Revenue / margin", formula: "n/a", dax: "", tableau: "", caveats: ["Not feasible: no revenue, price or amount field present. Do not estimate it."], feasible: false });
  if (!r.measure) k.push({ name: "Numeric totals / averages", formula: "n/a", dax: "", tableau: "", caveats: ["Not feasible: no numeric measure detected."], feasible: false });
  return k;
}