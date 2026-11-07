import { useMemo, useRef, useState } from "react";
import { readDataset } from "@/lib/upload";
import { AlertTriangle, BookOpen, CheckCircle2, Copy, Database, Download, FileUp, Gauge, LayoutDashboard, ListChecks, Loader2, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assessCredibility, profileDataset, type Row } from "@/lib/profile";
import { generateQuestions, pickRoles, recommendKpis, type Dialect, type Roles } from "@/lib/analysis";
import { aggregate } from "@/lib/aggregate";
import { EXAMPLES, rowsToCsv } from "@/lib/examples";
import { DashboardMockup, type Persona } from "./DashboardMockup";
import { AiAssistant } from "./AiAssistant";

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  const [failed, setFailed] = useState(false);
  return <Button variant="ghost" size="sm" aria-label="Copy to clipboard" onClick={async () => {
    setFailed(false);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200);
    } catch { setFailed(true); }
  }}><Copy />{failed ? "Select text" : ok ? "Copied" : "Copy"}</Button>;
}
function Code({ children }: { children: string }) {
  return <div className="relative"><pre className="overflow-x-auto rounded-md bg-foreground p-3 pr-20 font-mono text-xs leading-relaxed text-background">{children}</pre><div className="absolute right-1 top-1 [&_button]:text-background"><CopyBtn text={children} /></div></div>;
}

export function Studio() {
  const importId = useRef(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [industry, setIndustry] = useState("");
  const [goal, setGoal] = useState("");
  const [dialect, setDialect] = useState<Dialect>("sqlserver");
  const [persona, setPersona] = useState<Persona>("Executive");
  const [override, setOverride] = useState<Partial<Roles>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState("guide");

  const profile = useMemo(() => (rows ? profileDataset(rows, headers) : null), [rows, headers]);
  const cred = useMemo(() => (profile ? assessCredibility(profile) : null), [profile]);
  const roles = useMemo<Roles | null>(() => (profile ? { ...pickRoles(profile, goal, fileName), ...override } : null), [profile, goal, fileName, override]);
  const questions = useMemo(() => (profile && roles ? generateQuestions(profile, roles, dialect, goal) : []), [profile, roles, dialect, goal]);
  const kpis = useMemo(() => (profile && roles ? recommendKpis(profile, roles) : []), [profile, roles]);
  const agg = useMemo(() => (rows && profile && roles ? aggregate(rows, profile, roles) : null), [rows, profile, roles]);

  function load(data: Row[], hdrs: string[], name: string) {
    setRows(data); setHeaders(hdrs); setFileName(name); setOverride({}); setTab("profile");
  }

  async function onFile(file?: File) {
    if (!file) return;
    const id = ++importId.current;
    setError(null); setNotice(null); setLoading(true);
    try {
      const data = await readDataset(file);
      if (id !== importId.current) return;
      setNotice(data.notice);
      load(data.rows, data.headers, file.name);
    } catch (e) {
      if (id === importId.current) setError(`Could not read file: ${(e as Error).message}`);
    } finally { if (id === importId.current) setLoading(false); }
  }

  function loadExample(id: string) {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    ++importId.current; setLoading(false);
    const data = ex.build();
    setError(null); setNotice(null); setIndustry(ex.industry); setGoal(ex.goal);
    load(data, Object.keys(data[0]), `${ex.id}_synthetic.csv`);
  }
  function downloadExample(id: string) {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    const blob = new Blob([rowsToCsv(ex.build())], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${ex.id}_synthetic.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  const levelIcon = { good: <CheckCircle2 className="size-4 text-success" />, watch: <AlertTriangle className="size-4 text-warning" />, risk: <XCircle className="size-4 text-destructive" /> };
  const roleSelect = (k: keyof Roles, label: string, opts: string[]) => (
    <div className="space-y-1"><Label htmlFor={`role-${k}`} className="text-xs">{label}</Label>
      <select id={`role-${k}`} className={sel} value={roles?.[k] ?? ""} onChange={(e) => setOverride((o) => ({ ...o, [k]: e.target.value || undefined }))}>
        <option value="">(none)</option>{opts.map((o) => <option key={o}>{o}</option>)}</select></div>
  );

  return (
    <div className="min-h-screen blueprint">
      <header className="border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><LayoutDashboard className="size-5" /></div>
            <div><h1 className="text-xl font-extrabold leading-tight break-words">Dashboard Architect Studio</h1><p className="text-xs text-muted-foreground">Plan Power BI & Tableau dashboards from your own data · runs entirely in your browser</p></div>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-within:ring-2 focus-within:ring-ring">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Upload CSV / Excel
            <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section aria-label="Context" className="grid min-w-0 gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-[200px_1fr_180px]">
          <div className="space-y-1"><Label htmlFor="industry">Industry</Label><Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Healthcare" /></div>
          <div className="space-y-1"><Label htmlFor="goal">Business goal</Label><Input id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Reduce delivery delays in Q3" /></div>
          <div className="space-y-1"><Label htmlFor="dialect">SQL dialect</Label><select id="dialect" className={sel} value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}><option value="sqlserver">SQL Server</option><option value="mysql">MySQL</option></select></div>
        </section>

        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive bg-card p-4 text-sm text-destructive"><XCircle className="mt-0.5 size-4 shrink-0" />{error}</div>}
        {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-warning bg-card p-4 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />{notice}</div>}

        {!profile && (
          <section aria-label="Get started" className="space-y-4">
            <div className="rounded-lg border-2 border-dashed border-primary/40 bg-card p-8 text-center"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files[0]); }}>
              <Database className="mx-auto size-10 text-primary" />
              <h2 className="mt-3 text-2xl font-bold">Drop a CSV or Excel file here</h2>
              <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">Your file is read in this browser tab only. Nothing is uploaded to a server. Or start with one of the synthetic examples below.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {EXAMPLES.map((ex) => (
                <div key={ex.id} className="flex flex-col rounded-lg border border-border bg-card p-4">
                  <p className="font-mono text-xs uppercase tracking-widest text-primary">{ex.industry}</p>
                  <h3 className="mt-1 text-lg font-bold">{ex.title}</h3>
                  <p className="mt-1 flex-1 text-sm text-muted-foreground">{ex.description}</p>
                  <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => loadExample(ex.id)}>Load example</Button><Button size="sm" variant="outline" onClick={() => downloadExample(ex.id)}><Download /> CSV</Button></div>
                </div>
              ))}
            </div>
          </section>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="guide"><BookOpen /> Guide</TabsTrigger>
            <TabsTrigger value="profile" disabled={!profile}><Database /> Profile</TabsTrigger>
            <TabsTrigger value="cred" disabled={!profile}><ShieldCheck /> Credibility</TabsTrigger>
            <TabsTrigger value="questions" disabled={!profile}><ListChecks /> Questions</TabsTrigger>
            <TabsTrigger value="kpis" disabled={!profile}><Gauge /> KPIs</TabsTrigger>
            <TabsTrigger value="dash" disabled={!profile}><LayoutDashboard /> Dashboard</TabsTrigger>
            <TabsTrigger value="ai" disabled={!profile}><Sparkles /> AI (optional)</TabsTrigger>
          </TabsList>

          <TabsContent value="guide" className="mt-4"><Guide /></TabsContent>

          {profile && roles && cred && agg && (<>
            <TabsContent value="profile" className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[["File", fileName], ["Rows", profile.rowCount.toLocaleString()], ["Columns", profile.columnCount], ["Duplicate rows", profile.duplicateRows], ["Missing cells", `${(profile.overallMissingPct * 100).toFixed(1)}%`]].map(([k, v]) => (
                  <div key={String(k)} className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="truncate font-display text-xl font-bold">{v}</p></div>
                ))}
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-lg font-bold">Field roles</h2>
                <p className="mb-3 text-sm text-muted-foreground">Auto-detected from types and your goal. Change them if they are wrong; everything downstream updates.</p>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {roleSelect("measure", "Primary measure", profile.measures)}
                  <div className="space-y-1"><Label htmlFor="aggregation" className="text-xs">Aggregation</Label><select id="aggregation" className={sel} value={roles.aggregation ?? "auto"} onChange={(e) => setOverride((o) => ({ ...o, aggregation: e.target.value === "auto" ? undefined : e.target.value as "sum" | "average" }))}><option value="auto">Auto (field-name hint)</option><option value="sum">Sum</option><option value="average">Average</option></select></div>{roleSelect("measure2", "Second measure", profile.measures)}
                  {roleSelect("dim1", "Main dimension", profile.dimensions)}{roleSelect("dim2", "Second dimension", profile.dimensions)}
                  {roleSelect("date", "Date", profile.dates)}{roleSelect("flag", "Yes/No outcome", profile.booleans)}
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <caption className="sr-only">Column profile</caption>
                  <thead className="bg-muted text-left text-xs text-muted-foreground"><tr>{["Column", "Type", "Missing", "Distinct", "Summary", "Flags"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{profile.columns.map((c) => (
                    <tr key={c.name} className="border-t border-border align-top">
                      <td className="px-3 py-2 font-mono text-xs">{c.name}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{c.type}</Badge></td>
                      <td className="px-3 py-2">{c.missing} <span className="text-muted-foreground">({(c.missingPct * 100).toFixed(1)}%)</span></td>
                      <td className="px-3 py-2">{c.distinct} <span className="text-muted-foreground">({(c.cardinalityRatio * 100).toFixed(0)}% unique)</span></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {c.numeric && <>min {c.numeric.min} · median {c.numeric.median.toFixed(2)} · mean {c.numeric.mean.toFixed(2)} · max {c.numeric.max}</>}
                        {c.date && <>{c.date.min} → {c.date.max} · {c.date.monthsCovered}/{c.date.monthsExpected} months</>}
                        {!c.numeric && !c.date && c.topValues.slice(0, 4).map((t) => `${t.value} (${t.count})`).join(" · ")}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {c.suspiciousId && <Badge variant="secondary" title={c.idReason}>identifier</Badge>}
                          {!!c.numeric?.outliers && <Badge variant="secondary">{c.numeric.outliers} outliers</Badge>}
                          {c.parseFailures > 0 && <Badge variant="destructive">{c.parseFailures} type mismatches</Badge>}
                          {c.caseVariants.length > 0 && <Badge variant="secondary">label variants</Badge>}
                          {c.constant && <Badge variant="secondary">constant</Badge>}
                          {c.distinct > 50 && c.type === "category" && <Badge variant="secondary">high cardinality</Badge>}
                        </div>
                      </td>
                    </tr>))}</tbody>
                </table>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-lg font-bold">Caveats ({profile.caveats.length})</h2>
                {profile.caveats.length ? <ul className="ml-5 mt-2 list-disc space-y-1 text-sm">{profile.caveats.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No automatic caveats triggered. That does not guarantee the data is correct.</p>}
              </div>
            </TabsContent>

            <TabsContent value="cred" className="mt-4 space-y-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">Overall confidence (rule-based, from the evidence below)</p>
                <p className="font-display text-3xl font-extrabold">{cred.confidence}</p>
                <ul className="mt-1 text-xs text-muted-foreground">{cred.confidenceReasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {cred.items.map((i) => (
                  <div key={i.area} className="rounded-lg border border-border bg-card p-4">
                    <p className="flex items-center gap-2 font-semibold">{levelIcon[i.level]} {i.area} <span className="text-xs font-normal uppercase text-muted-foreground">{i.level}</span></p>
                    <ul className="ml-5 mt-2 list-disc space-y-1 text-sm text-muted-foreground">{i.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">These checks cannot see how the data was collected. Ask the data owner about sampling, definitions and known gaps before presenting conclusions.</p>
            </TabsContent>

            <TabsContent value="questions" className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">{questions.length} questions ranked by decision value for your goal. SQL is an <strong>example to run yourself</strong>; it has not been executed. First import into a typed table: parse numbers/dates, convert all missing tokens to NULL, and normalize outcomes to 1/0/NULL. MySQL 8+ is required. Table name assumed: <code className="font-mono">{roles.table}</code>.</p>
              {questions.length < 8 && <p role="status" className="text-sm text-warning">Only {questions.length} questions are feasible with the detected fields. Adding a date, a numeric measure or a category column would unlock more.</p>}
              {questions.map((qq, i) => (
                <article key={qq.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-lg font-bold"><span className="mr-2 font-mono text-sm text-primary">#{i + 1}</span>{qq.question}</h3>
                    <div className="flex gap-1"><Badge>{qq.chart}</Badge><Badge variant="outline">value {qq.value.toFixed(1)}</Badge></div>
                  </div>
                  <p className="mt-2 text-sm"><strong>Why it matters:</strong> {qq.rationale}</p>
                  <p className="mt-1 text-sm text-muted-foreground"><strong>Method:</strong> {qq.methodology}</p>
                  <div className="mt-3"><Code>{qq.sql}</Code></div>
                </article>
              ))}
            </TabsContent>

            <TabsContent value="kpis" className="mt-4 grid gap-4 md:grid-cols-2">
              {kpis.map((k) => (
                <article key={k.name} className={`rounded-lg border bg-card p-4 ${k.feasible ? "border-border" : "border-dashed border-muted-foreground/40 opacity-80"}`}>
                  <div className="flex items-center justify-between"><h3 className="font-bold">{k.name}</h3><Badge variant={k.feasible ? "default" : "outline"}>{k.feasible ? "feasible" : "not feasible"}</Badge></div>
                  {k.feasible && <p className="mt-1 font-mono text-xs text-muted-foreground">{k.formula}</p>}
                  {k.dax && <div className="mt-3 space-y-2"><p className="font-mono text-xs text-primary">DAX</p><Code>{k.dax}</Code><p className="font-mono text-xs text-chart-4">TABLEAU CALCULATED FIELD</p><Code>{k.tableau}</Code></div>}
                  {k.caveats.length > 0 && <ul className="ml-5 mt-3 list-disc space-y-1 text-sm text-muted-foreground">{k.caveats.map((c) => <li key={c}>{c}</li>)}</ul>}
                </article>
              ))}
            </TabsContent>

            <TabsContent value="dash" className="mt-4 space-y-4">
              <div role="radiogroup" aria-label="Design persona" className="flex flex-wrap gap-2">
                {(["Executive", "Analyst", "Operations"] as Persona[]).map((p) => (
                  <Button key={p} role="radio" aria-checked={persona === p} variant={persona === p ? "default" : "outline"} onClick={() => setPersona(p)}>{p}</Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{persona === "Executive" ? "Few headline numbers and one clear trend: for leaders deciding direction." : persona === "Analyst" ? "Distributions and relationships: for people investigating why." : "Group-level status and data health: for teams acting day to day."}</p>
              <DashboardMockup agg={agg} roles={roles} persona={persona} industry={industry || "General"} goal={goal} />
            </TabsContent>

            <TabsContent value="ai" className="mt-4"><AiAssistant profile={profile} roles={roles} goal={goal} industry={industry} /></TabsContent>
          </>)}
        </Tabs>

        {profile && <div className="flex justify-end"><Button variant="outline" onClick={() => { ++importId.current; setLoading(false); setError(null); setRows(null); setHeaders([]); setFileName(""); setTab("guide"); setNotice(null); }}>Clear data</Button></div>}
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">Open-source friendly · No accounts · No server storage · Examples are synthetic</footer>
    </div>
  );
}

function Guide() {
  const steps = [
    ["Upload", "Drop a CSV or the first sheet of an Excel file. Parsing happens in your browser; close the tab and the data is gone."],
    ["Set context", "Type your industry and business goal. Goal words steer which measure and questions rank first."],
    ["Profile", "Check detected types, missing values, duplicates, identifiers, outliers and date coverage. Fix field roles if needed."],
    ["Credibility", "Read the evidence for completeness, duplicates, coverage, consistency and bias before trusting any chart."],
    ["Questions", "8–12 questions built only from fields that exist, each with example SQL (SQL Server or MySQL), the expected chart and method."],
    ["KPIs", "Formulas with DAX and Tableau calculated fields. KPIs your data cannot support are marked not feasible."],
    ["Dashboard", "A 16:9 mockup using real aggregates in three personas, with a PNG download and step-by-step build notes."],
    ["AI (optional)", "Bring your own Gemini key for extra question ideas. Only a summary is sent, results are validated and labelled."],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl font-bold">How to use the studio</h2>
        <ol className="mt-4 space-y-3">{steps.map(([t, d], i) => <li key={t} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary font-mono text-xs text-primary-foreground">{i + 1}</span><div><p className="font-semibold">{t}</p><p className="text-sm text-muted-foreground">{d}</p></div></li>)}</ol>
      </div>
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 font-bold"><ShieldCheck className="size-4 text-primary" /> Privacy</h3>
          <ul className="ml-5 mt-2 list-disc space-y-1 text-sm text-muted-foreground">
            <li>No server, database or analytics on your data.</li>
            <li>Nothing is saved to local storage or cookies.</li>
            <li>The optional AI tab sends a summary to Google only when you click the button.</li>
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-bold">What this tool will not do</h3>
          <ul className="ml-5 mt-2 list-disc space-y-1 text-sm text-muted-foreground">
            <li>Invent insights, scores or values not computed from your file.</li>
            <li>Claim any SQL was executed.</li>
            <li>Require an API key for core features.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}