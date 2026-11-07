import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmt, usesAverage, type Aggregates } from "@/lib/aggregate";
import type { ChartKind, Roles } from "@/lib/analysis";
import { chartGuide } from "@/lib/guides";

export type Persona = "Executive" | "Analyst" | "Operations";
const C = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)", "var(--color-muted-foreground)"];
const axis = { fontSize: 10, fill: "var(--color-muted-foreground)" };

interface Tile { title: string; kind: ChartKind; x?: string; y?: string; legend?: string; agg?: string; node: React.ReactNode; span: string }

export function DashboardMockup({ agg, roles, persona, industry, goal }: { agg: Aggregates; roles: Roles; persona: Persona; industry: string; goal: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const avgWord = usesAverage(roles.measure, roles.aggregation) ? "Average" : "Sum";
  const m = roles.measure ?? "Record Count";
  const measureName = roles.measure ? `${usesAverage(roles.measure, roles.aggregation) ? "Average" : "Total"} ${roles.measure}` : "Record Count";
  const metricAgg = roles.measure ? avgWord : "Count";

  const kpis: { label: string; value: string }[] = [
    { label: "Records", value: fmt(agg.count, 0) },
    ...(roles.measure ? [{ label: agg.measureLabel, value: fmt(agg.measureValue) }, { label: `Median ${roles.measure}`, value: fmt(agg.median) }] : []),
    ...(agg.flagRate !== null ? [{ label: `${roles.flag} rate`, value: `${(agg.flagRate * 100).toFixed(1)}%` }] : []),
    
  ].slice(0, persona === "Analyst" ? 3 : 4);

  const trend: Tile | null = agg.trend.length > 1 ? {
    title: `${roles.measure ? `${avgWord} ${m}` : "Records"} by month`, kind: "line", x: roles.date, y: m, agg: metricAgg, span: persona === "Executive" ? "col-span-8" : "col-span-6",
    node: <ResponsiveContainer><LineChart data={agg.trend} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}><CartesianGrid stroke="var(--color-border)" vertical={false} /><XAxis dataKey="month" tick={axis} /><YAxis tick={axis} tickFormatter={(v) => fmt(v, 0)} /><Tooltip /><Line dataKey="value" name={m} stroke={C[0]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} /></LineChart></ResponsiveContainer>,
  } : null;
  const rateTrend: Tile | null = agg.trend.length > 1 && roles.flag ? {
    title: `${roles.flag} rate by month`, kind: "line", x: roles.date, y: `${roles.flag} Rate`, agg: "Measure", span: "col-span-6",
    node: <ResponsiveContainer><LineChart data={agg.trend.map((t) => ({ ...t, pct: t.rate === null ? null : +(t.rate * 100).toFixed(1) }))} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}><CartesianGrid stroke="var(--color-border)" vertical={false} /><XAxis dataKey="month" tick={axis} /><YAxis tick={axis} unit="%" /><Tooltip /><Line dataKey="pct" name="rate %" stroke={C[3]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} /></LineChart></ResponsiveContainer>,
  } : null;
  const bar = (useRate: boolean): Tile | null => agg.byDim1.length ? {
    title: useRate && roles.flag ? `${roles.flag} rate by ${roles.dim1}` : `${roles.measure ? `${avgWord} ${m}` : "Records"} by ${roles.dim1}`, kind: "bar", x: roles.dim1, y: useRate ? `${roles.flag} Rate` : m, agg: useRate ? "Measure" : metricAgg, span: persona === "Executive" ? "col-span-4" : "col-span-6",
    node: <ResponsiveContainer><BarChart layout="vertical" data={useRate ? agg.byDim1.map((d) => ({ ...d, value: d.rate === null ? null : +(d.rate * 100).toFixed(1) })).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)).slice(0, 12) : agg.byDim1.slice(0, 12)} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}><CartesianGrid stroke="var(--color-border)" horizontal={false} /><XAxis type="number" tick={axis} tickFormatter={(v) => fmt(v, 0)} /><YAxis type="category" dataKey="name" tick={axis} width={120} /><Tooltip /><Bar dataKey="value" name={useRate ? "rate %" : m} fill={useRate ? C[3] : C[0]} radius={[0, 3, 3, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer>,
  } : null;
  const donut: Tile | null = agg.byDim2.length ? {
    title: `Records by ${roles.dim2}`, kind: "donut", legend: roles.dim2, span: "col-span-4",
    node: <ResponsiveContainer><PieChart><Pie data={agg.byDim2} dataKey="count" nameKey="name" innerRadius="50%" outerRadius="80%" isAnimationActive={false} label={({ name }) => String(name).slice(0, 12)} labelLine={false} fontSize={10}>{agg.byDim2.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>,
  } : null;
  const hist: Tile | null = agg.histogram.length ? {
    title: `Distribution of ${m}`, kind: "histogram", y: m, span: "col-span-6",
    node: <ResponsiveContainer><BarChart data={agg.histogram} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}><CartesianGrid stroke="var(--color-border)" vertical={false} /><XAxis dataKey="bin" tick={axis} /><YAxis tick={axis} /><Tooltip /><Bar dataKey="count" fill={C[2]} isAnimationActive={false} /></BarChart></ResponsiveContainer>,
  } : null;
  const scatter: Tile | null = agg.scatter.length ? {
    title: `${m} vs ${roles.measure2}`, kind: "scatter", x: roles.measure2, y: m, span: "col-span-6",
    node: <ResponsiveContainer><ScatterChart margin={{ top: 4, right: 8, left: -10, bottom: 0 }}><CartesianGrid stroke="var(--color-border)" /><XAxis dataKey="x" type="number" name={roles.measure2} tick={axis} tickFormatter={(v) => fmt(v, 0)} /><YAxis dataKey="y" type="number" name={m} tick={axis} tickFormatter={(v) => fmt(v, 0)} /><Tooltip /><Scatter data={agg.scatter} fill={C[0]} fillOpacity={0.45} isAnimationActive={false} /></ScatterChart></ResponsiveContainer>,
  } : null;
  const table: Tile | null = agg.byDim1.length ? {
    title: `Top ${roles.dim1} by ${roles.measure ? m : "records"}`, kind: "table", x: roles.dim1, y: m, span: "col-span-6",
    node: <table className="w-full text-[11px]"><thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">{roles.dim1}</th><th className="text-right font-medium">Rows</th><th className="text-right font-medium">{roles.measure ? `${avgWord} ${m}` : ""}</th>{roles.flag && <th className="text-right font-medium">{roles.flag} %</th>}</tr></thead><tbody>{agg.byDim1.slice(0, 7).map((d) => <tr key={d.name} className="border-t border-border"><td className="py-1">{d.name}</td><td className="text-right font-mono">{d.count}</td><td className="text-right font-mono">{roles.measure ? fmt(d.value) : ""}</td>{roles.flag && <td className="text-right font-mono">{d.rate === null ? "—" : (d.rate * 100).toFixed(1)}</td>}</tr>)}</tbody></table>,
  } : null;

  if (persona === "Operations") kpis.splice(2, 2, { label: "Outliers", value: fmt(agg.outliers, 0) }, { label: "Missing cells", value: fmt(agg.missingCells, 0) });

  const tiles = (persona === "Executive" ? [trend, bar(false), donut] : persona === "Analyst" ? [trend, hist, scatter ?? rateTrend, bar(false)] : [bar(!!roles.flag), table, rateTrend ?? trend]).filter(Boolean) as Tile[];
  if (persona === "Executive" && tiles.length === 3) { tiles[1].span = "col-span-6"; tiles[2].span = "col-span-6"; tiles[0].span = "col-span-12"; }
  if (tiles.length % 2 === 1 && persona !== "Executive") tiles[tiles.length - 1].span = "col-span-12";

  async function exportPng() {
    if (!ref.current) return;
    setBusy(true); setErr(null);
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true, skipFonts: true });
      const a = document.createElement("a"); a.href = url; a.download = `dashboard-${persona.toLowerCase()}.png`; a.click();
    } catch (e) { setErr(`PNG export failed: ${(e as Error).message ?? "unknown error"}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Mockup uses real aggregates from your file. It is a design sketch, not a finished report.</p>
        <Button onClick={exportPng} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Download />} Download PNG</Button>
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <div className="max-w-full overflow-x-auto rounded-lg border border-border">
        <div ref={ref} className="dashboard-canvas aspect-video w-[1120px] shrink-0 bg-card p-5 flex flex-col gap-3" role="img" aria-label={`${persona} dashboard mockup for ${industry}`}>
          <div className="flex min-w-0 shrink-0 items-end justify-between gap-4 border-b border-border pb-2">
            <div className="min-w-0 max-w-[850px]"><p className="font-mono text-[10px] uppercase tracking-widest text-primary">{industry} · {persona} view</p><h3 className="break-words text-lg font-bold">{goal || "Dashboard"}</h3></div>
            <p className="font-mono text-[10px] text-muted-foreground">n = {agg.count.toLocaleString()} rows</p>
          </div>
          <div className="grid shrink-0 gap-3" style={{ gridTemplateColumns: `repeat(${kpis.length}, minmax(0,1fr))` }}>
            {kpis.map((k) => <div key={k.label} className="rounded-md border border-border bg-background px-3 py-2"><p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p><p className="font-display text-2xl font-bold text-foreground">{k.value}</p></div>)}
          </div>
          <div className="grid flex-1 grid-cols-12 gap-3 min-h-0" style={{ gridAutoRows: "1fr" }}>
            {tiles.map((t) => <div key={t.title} className={`${t.span} flex min-h-0 flex-col rounded-md border border-border bg-background p-2`}><p className="mb-1 text-xs font-semibold">{t.title}</p><div className="min-h-0 flex-1 overflow-hidden">{t.node}</div></div>)}
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-bold">Chart-by-chart build instructions</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {[{ title: "KPI cards", kind: "kpi" as ChartKind }, ...tiles].map((t) => {
            const g = chartGuide(t.kind, { ...t, y: t.kind === "line" || t.kind === "bar" || t.kind === "table" ? ((t as Tile).y?.endsWith(" Rate") ? (t as Tile).y : measureName) : (t as Tile).y });
            return (
              <div key={t.title} className="rounded-lg border border-border bg-card p-4">
                <p className="font-semibold">{t.title}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 text-sm">
                  <div className="min-w-0"><p className="font-mono text-xs text-primary">POWER BI</p><ol className="ml-4 list-decimal space-y-1 text-muted-foreground">{g.powerbi.map((s) => <li key={s}>{s}</li>)}</ol></div>
                  <div className="min-w-0"><p className="font-mono text-xs text-chart-4">TABLEAU</p><ol className="ml-4 list-decimal space-y-1 text-muted-foreground">{g.tableau.map((s) => <li key={s}>{s}</li>)}</ol></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}