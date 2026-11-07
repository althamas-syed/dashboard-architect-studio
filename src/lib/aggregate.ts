// Real aggregates for the dashboard mockup, computed from uploaded rows.
import type { Roles } from "./analysis";
import { isMissing, monthKey, toDate, toNumber, booleanValue, type DatasetProfile, type Row } from "./profile";

const AVG_HINT = /(^|[^a-z])(minutes?|days?|score|rate|age|hours?|percent|pct|duration|time|wait)([^a-z]|$)/i;
export const usesAverage = (m?: string, aggregation?: "sum" | "average") => aggregation ? aggregation === "average" : !!m && AVG_HINT.test(m.replace(/_/g, " "));

export interface Aggregates {
  count: number; measureLabel: string; measureValue: number | null; median: number | null; flagRate: number | null;
  trend: { month: string; value: number | null; count: number; rate: number | null }[];
  byDim1: { name: string; value: number | null; count: number; rate: number | null }[];
  byDim2: { name: string; count: number }[];
  scatter: { x: number; y: number }[];
  histogram: { bin: string; count: number }[];
  outliers: number; missingCells: number;
}

export function aggregate(rows: Row[], p: DatasetProfile, r: Roles): Aggregates {
  const avg = usesAverage(r.measure, r.aggregation);
  const num = (row: Row, c?: string) => (c && !isMissing(row[c]) ? toNumber(row[c]) : null);
  const mcol = p.columns.find((c) => c.name === r.measure);
  const flag = r.flag;
  const flagVals = flag ? rows.map((x) => booleanValue(x[flag])).filter((v) => v !== null) : [];
  const flagRate = flagVals.length ? flagVals.reduce<number>((sum, v) => sum + Number(v), 0) / flagVals.length : null;

  const groupBy = (key: (row: Row) => string | null) => {
    const g = new Map<string, { sum: number; n: number; count: number; t: number; f: number }>();
    for (const row of rows) {
      const k = key(row); if (k === null) continue;
      const e = g.get(k) ?? { sum: 0, n: 0, count: 0, t: 0, f: 0 };
      e.count++; const v = num(row, r.measure); if (v !== null) { e.sum += v; e.n++; }
      const outcome = flag ? booleanValue(row[flag]) : null;
      if (outcome !== null) { e.f++; if (outcome) e.t++; }
      g.set(k, e);
    }
    return g;
  };
  const val = (e: { sum: number; n: number; count: number }) => r.measure ? (e.n ? (avg ? e.sum / e.n : e.sum) : null) : e.count;
  const round = (v: number | null) => v === null ? null : +v.toFixed(2);
  const date = r.date, dim1 = r.dim1, dim2 = r.dim2;
  const trend: Aggregates["trend"] = [];
  if (date) {
    const groups = groupBy((row) => { const d = toDate(row[date] ?? ""); return d ? monthKey(d) : null; });
    const keys = [...groups.keys()].sort();
    if (keys.length) {
      const cur = toDate(keys[0]);
      const end = keys[keys.length - 1];
      while (cur && monthKey(cur) <= end && trend.length < 6000) {
        const month = monthKey(cur), e = groups.get(month);
        trend.push({ month, value: e ? round(val(e)) : null, count: e?.count ?? 0, rate: e?.f ? e.t / e.f : null });
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
    }
  }
  const dimensionKey = (row: Row, key: string) => isMissing(row[key]) ? "(missing)" : row[key].trim();
  const byDim1 = dim1 ? [...groupBy((row) => dimensionKey(row, dim1)).entries()]
    .map(([name, e]) => ({ name, value: round(val(e)), count: e.count, rate: e.f ? e.t / e.f : null }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)) : [];
  const allDim2 = dim2 ? [...groupBy((row) => dimensionKey(row, dim2)).entries()]
    .map(([name, e]) => ({ name, count: e.count })).sort((a, b) => b.count - a.count) : [];
  const byDim2 = allDim2.length > 5 ? [...allDim2.slice(0, 5), { name: "Other (remaining groups)", count: allDim2.slice(5).reduce((sum, e) => sum + e.count, 0) }] : allDim2;

  const scatter: Aggregates["scatter"] = [];
  if (r.measure && r.measure2) {
    const step = Math.max(1, Math.ceil(rows.length / 400));
    for (let i = 0; i < rows.length; i += step) { const x = num(rows[i], r.measure2), y = num(rows[i], r.measure); if (x !== null && y !== null) scatter.push({ x, y }); }
  }
  const histogram: Aggregates["histogram"] = [];
  if (mcol?.numeric) {
    const { min, max } = mcol.numeric;
    const bins = min === max ? 1 : 12, w = (max - min) / bins || 1;
    const counts = new Array<number>(bins).fill(0);
    for (const row of rows) {
      const v = num(row, r.measure); if (v === null) continue;
      counts[Math.min(bins - 1, Math.max(0, Math.floor((v - min) / w)))]++;
    }
    counts.forEach((count, i) => histogram.push({ bin: `${fmt(min + i * w, 2)}–${fmt(min === max ? max : min + (i + 1) * w, 2)}`, count }));
  }
  return {
    count: rows.length,
    measureLabel: r.measure ? `${avg ? "Avg" : "Total"} ${r.measure}` : "Records",
    measureValue: r.measure ? val(groupBy(() => "all").get("all") ?? { sum: 0, n: 0, count: 0 }) : null,
    median: mcol?.numeric?.median ?? null, flagRate, trend, byDim1, byDim2, scatter, histogram,
    outliers: mcol?.numeric?.outliers ?? 0, missingCells: p.columns.reduce((a, c) => a + c.missing, 0),
  };
}

export const fmt = (v: number | null | undefined, digits = 1) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(digits)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(digits)}K`;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(digits);
};