// Client-side dataset profiling. Pure functions, no network, no invented values.
export type Row = Record<string, string>;
export type ColumnType = "integer" | "number" | "date" | "boolean" | "category" | "text" | "id";

export interface NumericStats {
  min: number; max: number; mean: number; median: number; q1: number; q3: number;
  sum: number; outliers: number; lowerFence: number; upperFence: number; negatives: number;
}
export interface DateStats {
  min: string; max: string; spanDays: number; monthsCovered: number; monthsExpected: number; missingMonths: string[];
}
export interface ColumnProfile {
  name: string;
  type: ColumnType;
  missing: number;
  missingPct: number;
  distinct: number;
  cardinalityRatio: number;
  parseFailures: number; // non-missing values that do not fit the detected type
  smallGroups: { value: string; count: number }[];
  topValues: { value: string; count: number }[];
  caseVariants: string[]; // e.g. "North" vs "north "
  numeric?: NumericStats;
  date?: DateStats;
  suspiciousId: boolean;
  idReason?: string;
  constant: boolean;
}
export interface DatasetProfile {
  rowCount: number;
  columnCount: number;
  duplicateRows: number;
  duplicateIdValues: number;
  columns: ColumnProfile[];
  measures: string[];
  dimensions: string[];
  dates: string[];
  ids: string[];
  booleans: string[];
  overallMissingPct: number;
  caveats: string[];
}

const MISSING = new Set(["", "na", "n/a", "null", "none", "nan", "-", "--", "?", "undefined", "#n/a"]);
export const isMissing = (v: unknown) => v === null || v === undefined || MISSING.has(String(v).trim().toLowerCase());

export function toNumber(v: string): number | null {
  const s = String(v).trim().replace(/[$€£,\s]/g, "").replace(/%$/, "");
  if (s === "" || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const DATE_RE = /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?Z?)?|\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}-\d{2})$/;
export function toDate(v: string): Date | null {
  const s = String(v).trim();
  if (!DATE_RE.test(s)) return null;
  const iso = /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s.replace(/\//g, "-");
  const parts = /^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/.exec(iso);
  const mdy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(iso);
  if (!parts && !mdy) return null;
  const year = Number(parts ? parts[1] : mdy?.[3]);
  const month = Number(parts ? parts[2] : mdy?.[1]);
  const day = Number(parts ? parts[3] : mdy?.[2]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  const d = parts?.[4] ? new Date(`${parts[1]}-${parts[2].padStart(2, "0")}-${parts[3].padStart(2, "0")}${parts[4]}${parts[4].endsWith("Z") ? "" : "Z"}`) : calendar;
  return Number.isNaN(d.getTime()) ? null : d;
}
export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export function booleanValue(v: unknown): boolean | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "yes", "y", "t", "1"].includes(s)) return true;
  if (["false", "no", "n", "f", "0"].includes(s)) return false;
  return null;
}

const BOOL = new Set(["true", "false", "yes", "no", "y", "n", "t", "f", "0", "1"]);
const ID_NAME = /(^id$|_id$|id$|^id_|uuid|guid|code$|number$|^no$|_no$|key$)/i;

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function profileColumn(name: string, raw: string[]): ColumnProfile {
  const n = raw.length;
  const vals = raw.filter((v) => !isMissing(v)).map((v) => String(v).trim());
  const missing = n - vals.length;
  const counts = new Map<string, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const distinct = counts.size;
  const smallGroups = [...counts.entries()].filter(([, count]) => count < 10).map(([value, count]) => ({ value, count }));
  const ratio = vals.length ? distinct / vals.length : 0;
  const topValues = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count }));

  const nums = vals.map(toNumber);
  const numOk = nums.filter((x) => x !== null).length;
  const dates = vals.map(toDate);
  const dateOk = dates.filter((x) => x !== null).length;
  const lowerDistinct = new Set(vals.map((v) => v.toLowerCase()));
  const isBool = vals.length > 0 && distinct <= 2 && [...lowerDistinct].every((v) => BOOL.has(v));

  let type: ColumnType = "text";
  let parseFailures = 0;
  if (vals.length === 0) type = "text";
  else if (isBool) type = "boolean";
  else if (dateOk / vals.length >= 0.9 && numOk / vals.length < 0.9) { type = "date"; parseFailures = vals.length - dateOk; }
  else if (numOk / vals.length >= 0.9) {
    const allInt = nums.every((x) => x === null || Number.isInteger(x));
    type = allInt ? "integer" : "number";
    parseFailures = vals.length - numOk;
  } else if (distinct <= Math.max(25, Math.min(60, vals.length * 0.05))) type = "category";

  // Suspicious identifiers: values that look like keys rather than measures/dimensions.
  let suspiciousId = false, idReason: string | undefined;
  if (vals.length >= 10) {
    if (ID_NAME.test(name) && distinct > 1) { suspiciousId = true; idReason = `name "${name}" looks like an identifier; ${Math.round(ratio * 100)}% of values are unique (repeated keys may represent multiple events)`; }
    else if ((type === "text") && ratio > 0.95) { suspiciousId = true; idReason = `${Math.round(ratio * 100)}% of text values are unique`; }

  }
  if (suspiciousId && type !== "date") type = "id";

  const col: ColumnProfile = {
    name, type, missing, missingPct: n ? missing / n : 0, distinct, cardinalityRatio: ratio,
    parseFailures, smallGroups, topValues, caseVariants: [], suspiciousId, idReason, constant: distinct === 1 && vals.length > 1,
  };

  if (type === "category" || type === "text") {
    const groups = new Map<string, Set<string>>();
    for (const v of counts.keys()) {
      const k = v.toLowerCase().replace(/\s+/g, " ").trim();
      if (!groups.has(k)) groups.set(k, new Set());
      groups.get(k)?.add(v);
    }
    col.caseVariants = [...groups.values()].filter((s) => s.size > 1).map((s) => [...s].map((x) => `"${x}"`).join(" / ")).slice(0, 5);
  }

  if (type === "integer" || type === "number") {
    const s = (nums.filter((x) => x !== null) as number[]).sort((a, b) => a - b);
    const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1;
    const lf = q1 - 1.5 * iqr, uf = q3 + 1.5 * iqr;
    const sum = s.reduce((a, b) => a + b, 0);
    col.numeric = {
      min: s[0], max: s[s.length - 1], mean: sum / s.length, median: quantile(s, 0.5), q1, q3, sum,
      outliers: s.filter((x) => x < lf || x > uf).length, lowerFence: lf, upperFence: uf,
      negatives: s.filter((x) => x < 0).length,
    };
  }
  if (type === "date") {
    const ds = (dates.filter(Boolean) as Date[]).map((d) => d.getTime()).sort((a, b) => a - b);
    const min = new Date(ds[0]), max = new Date(ds[ds.length - 1]);
    const months = new Set((dates.filter(Boolean) as Date[]).map(monthKey));
    const expected: string[] = [];
    const cur = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1));
    while (cur <= max && expected.length < 600) { expected.push(monthKey(cur)); cur.setUTCMonth(cur.getUTCMonth() + 1); }
    col.date = {
      min: min.toISOString().slice(0, 10), max: max.toISOString().slice(0, 10),
      spanDays: Math.round((ds[ds.length - 1] - ds[0]) / 86400000), monthsCovered: months.size,
      monthsExpected: expected.length, missingMonths: expected.filter((m) => !months.has(m)),
    };
  }
  return col;
}

export function profileDataset(rows: Row[], headers?: string[]): DatasetProfile {
  const cols = headers ?? (rows[0] ? Object.keys(rows[0]) : []);
  const columns = cols.map((c) => profileColumn(c, rows.map((r) => r[c] ?? "")));
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const r of rows) {
    const k = JSON.stringify(cols.map((c) => String(r[c] ?? "").trim()));
    if (seen.has(k)) duplicateRows++; else seen.add(k);
  }
  const ids = columns.filter((c) => c.type === "id").map((c) => c.name);
  let duplicateIdValues = 0;
  if (ids[0]) {
    const c = columns.find((x) => x.name === ids[0]);
    duplicateIdValues = c ? rows.length - c.missing - c.distinct : 0;
  }
  const measures = columns.filter((c) => (c.type === "number" || c.type === "integer") ).map((c) => c.name);
  const dimensions = columns.filter((c) => (c.type === "category" || c.type === "boolean") && c.distinct >= 2).map((c) => c.name);
  const dates = columns.filter((c) => c.type === "date").map((c) => c.name);
  const booleans = columns.filter((c) => c.type === "boolean").map((c) => c.name);
  const totalCells = rows.length * cols.length || 1;
  const overallMissingPct = columns.reduce((a, c) => a + c.missing, 0) / totalCells;

  const caveats: string[] = [];
  if (rows.length < 30) caveats.push(`Only ${rows.length} rows: patterns are anecdotal, not statistically reliable.`);
  else if (rows.length < 200) caveats.push(`${rows.length} rows is a small sample: segment-level comparisons may be noisy.`);
  if (duplicateRows) caveats.push(`${duplicateRows} exact duplicate rows found; totals will be inflated unless deduplicated.`);
  if (duplicateIdValues > 0) caveats.push(`Identifier "${ids[0]}" repeats ${duplicateIdValues} times; confirm the grain (one row per what?).`);
  for (const c of columns) {
    if (c.missingPct > 0.2) caveats.push(`"${c.name}" is ${(c.missingPct * 100).toFixed(0)}% missing; metrics using it describe only the non-missing subset.`);
    if (c.parseFailures > 0) caveats.push(`"${c.name}" has ${c.parseFailures} values that do not parse as ${c.type}.`);
    if (c.caseVariants.length) caveats.push(`"${c.name}" has inconsistent labels: ${c.caseVariants.slice(0, 2).join("; ")}.`);
    if (c.date?.missingMonths.length) caveats.push(`"${c.name}" has ${c.date.missingMonths.length} month(s) with no records inside its range; trends may show false dips.`);
    if (c.numeric?.negatives && /cost|price|amount|age|days|minutes|weight|distance|score|rate/i.test(c.name)) caveats.push(`"${c.name}" contains ${c.numeric.negatives} negative values, which is unusual for this field.`);
  }
  if (!dates.length) caveats.push("No date column detected: trend analysis is not possible.");
  if (!measures.length) caveats.push("No numeric measure detected: KPIs are limited to counts.");
  return { rowCount: rows.length, columnCount: cols.length, duplicateRows, duplicateIdValues, columns, measures, dimensions, dates, ids, booleans, overallMissingPct, caveats };
}

export interface CredibilityItem { area: string; level: "good" | "watch" | "risk"; evidence: string[] }
export interface Credibility { items: CredibilityItem[]; confidence: "High" | "Medium" | "Low"; confidenceReasons: string[] }

export function assessCredibility(p: DatasetProfile): Credibility {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const items: CredibilityItem[] = [];
  const heavy = p.columns.filter((c) => c.missingPct > 0.2);
  items.push({
    area: "Completeness",
    level: p.overallMissingPct > 0.15 || heavy.length > 1 ? "risk" : p.overallMissingPct > 0.03 || heavy.length ? "watch" : "good",
    evidence: [`${pct(p.overallMissingPct)} of all cells are missing.`, ...p.columns.filter((c) => c.missing).slice(0, 6).map((c) => `"${c.name}": ${c.missing} missing (${pct(c.missingPct)})`)],
  });
  const dupPct = p.rowCount ? p.duplicateRows / p.rowCount : 0;
  items.push({
    area: "Duplicates",
    level: dupPct > 0.02 ? "risk" : p.duplicateRows || p.duplicateIdValues ? "watch" : "good",
    evidence: [`${p.duplicateRows} exact duplicate rows (${pct(dupPct)}).`, p.ids[0] ? `Identifier "${p.ids[0]}" repeated values: ${p.duplicateIdValues}.` : "No identifier column detected to check key uniqueness."],
  });
  const d = p.columns.find((c) => c.date)?.date;
  items.push({
    area: "Coverage",
    level: !d ? "watch" : d.missingMonths.length > 0 || d.monthsExpected < 6 ? "watch" : "good",
    evidence: d ? [`${d.min} → ${d.max} (${d.spanDays} days, ${d.monthsCovered} of ${d.monthsExpected} months have data).`, d.missingMonths.length ? `Empty months: ${d.missingMonths.slice(0, 6).join(", ")}${d.missingMonths.length > 6 ? "…" : ""}` : "No empty months inside the range.", `Sample size: ${p.rowCount} rows.`] : ["No date column, so time coverage cannot be verified.", `Sample size: ${p.rowCount} rows.`],
  });
  const inconsistent = p.columns.filter((c) => c.parseFailures || c.caseVariants.length);
  items.push({
    area: "Consistency",
    level: inconsistent.length > 2 ? "risk" : inconsistent.length ? "watch" : "good",
    evidence: inconsistent.length ? inconsistent.slice(0, 6).map((c) => `"${c.name}": ${c.parseFailures ? `${c.parseFailures} type mismatches` : ""}${c.parseFailures && c.caseVariants.length ? "; " : ""}${c.caseVariants.length ? `label variants ${c.caseVariants[0]}` : ""}`) : ["All values match their detected types; no label variants found."],
  });
  const bias: string[] = [];
  for (const name of p.dimensions) {
    const c = p.columns.find((x) => x.name === name);
    if (!c) continue;
    const nonMissing = p.rowCount - c.missing;
    const top = c.topValues[0];
    if (top && nonMissing && top.count / nonMissing > 0.7) bias.push(`"${name}" is dominated by "${top.value}" (${pct(top.count / nonMissing)}); other groups are thinly represented.`);
    const small = c.smallGroups;
    if (small.length && c.distinct <= 25) bias.push(`"${name}" has ${small.length} group(s) with fewer than 10 rows (e.g. "${small[0].value}").`);
  }
  for (const c of p.columns) if (c.missingPct > 0.2) bias.push(`Missingness in "${c.name}" may not be random; check whether specific groups skip it.`);
  items.push({ area: "Possible bias", level: bias.length > 2 ? "risk" : bias.length ? "watch" : "good", evidence: bias.length ? bias.slice(0, 6) : ["No dominant or tiny groups detected in categorical fields. This does not rule out sampling bias in how the data was collected."] });

  const risks = items.filter((i) => i.level === "risk").length;
  const watches = items.filter((i) => i.level === "watch").length;
  const reasons = [`${risks} risk area(s), ${watches} watch area(s) out of ${items.length}.`];
  let confidence: Credibility["confidence"] = "High";
  if (risks >= 2 || p.rowCount < 30) confidence = "Low";
  else if (risks === 1 || watches >= 2 || p.rowCount < 200) confidence = "Medium";
  if (p.rowCount < 30) reasons.push("Fewer than 30 rows caps confidence at Low.");
  else if (p.rowCount < 200) reasons.push("Fewer than 200 rows caps confidence at Medium.");
  reasons.push("Rule: High = no risks and ≤1 watch; Medium = 1 risk or ≥2 watches; Low = ≥2 risks.");
  return { items, confidence, confidenceReasons: reasons };
}