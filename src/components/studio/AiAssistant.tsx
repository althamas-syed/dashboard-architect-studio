import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, KeyRound, Loader2, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Roles } from "@/lib/analysis";
import type { DatasetProfile } from "@/lib/profile";
import { buildSummary, callGemini, GEMINI_MODELS, GeminiError, questionPrompt, validateAiOutput, type AiResult } from "@/lib/gemini";

export function AiAssistant({ profile, roles, goal, industry }: { profile: DatasetProfile; roles: Roles; goal: string; industry: string }) {
  const [enabled, setEnabled] = useState(false);
  const [key, setKey] = useState(""); // session memory only: never persisted or logged
  const [model, setModel] = useState(GEMINI_MODELS[0]);
  const [labels, setLabels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult | null>(null);
  const [showPayload, setShowPayload] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const summary = useMemo(() => buildSummary(profile, roles, goal, industry, labels), [profile, roles, goal, industry, labels]);

  useEffect(() => () => { abort.current?.abort(); }, []);
  useEffect(() => { abort.current?.abort(); setResult(null); setError(null); }, [summary]);

  function disable(v: boolean) {
    setEnabled(v);
    if (!v) { abort.current?.abort(); setBusy(false); setKey(""); setResult(null); setError(null); }
  }
  async function run() {
    setBusy(true); setError(null); setResult(null);
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    try {
      const text = await callGemini(key.trim(), model, questionPrompt(summary), controller.signal);
      if (!controller.signal.aborted && abort.current === controller) setResult(validateAiOutput(text, profile.columns.map((c) => c.name)));
    } catch (e) {
      if (controller.signal.aborted || abort.current !== controller || (e as Error).name === "AbortError") return;
      setError(e instanceof GeminiError ? e.message : "Unexpected error while calling Gemini.");
    } finally { if (abort.current === controller) setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-warning bg-accent/20 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold"><ShieldAlert className="size-4" /> Optional, bring-your-own-key. Read before enabling.</p>
        <ul className="ml-5 mt-2 list-disc space-y-1 text-muted-foreground">
          <li>Every feature outside this tab works without a key.</li>
          <li>Your key is kept only in this tab's memory. It is not saved, logged or sent to us; reloading or disabling clears it.</li>
          <li>Requests go <strong>directly from your browser to Google</strong>, so the key is visible to this browser (devtools, extensions). Use a restricted key you can revoke.</li>
          <li>Gemini keys are not automatically free or unlimited. Free tiers have rate and daily limits; paid usage may be billed by Google.</li>
          <li>Only a computed summary (column names, types, stats, caveats) is sent, never your rows. Category labels are excluded unless you opt in.</li>
        </ul>
      </div>
      <div className="flex items-center gap-3"><Switch id="ai-on" checked={enabled} onCheckedChange={disable} /><Label htmlFor="ai-on">Enable Gemini assistant</Label></div>
      {enabled && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <div className="space-y-1"><Label htmlFor="gkey" className="flex items-center gap-1"><KeyRound className="size-3.5" /> Gemini API key</Label>
              <div className="flex gap-2"><Input id="gkey" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => { abort.current?.abort(); setKey(e.target.value); setResult(null); setError(null); }} placeholder="Paste your key from Google AI Studio" />
                <Button variant="outline" size="icon" aria-label="Clear key" onClick={() => { abort.current?.abort(); setKey(""); setResult(null); setError(null); }}><Trash2 /></Button></div></div>
            <div className="space-y-1"><Label htmlFor="gmodel">Model</Label>
              <select id="gmodel" value={model} onChange={(e) => setModel(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{GEMINI_MODELS.map((m) => <option key={m}>{m}</option>)}</select></div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Include top category labels in summary</label>
            <Button variant="link" className="h-auto p-0" onClick={() => setShowPayload((s) => !s)}>{showPayload ? "Hide" : "Preview"} exactly what will be sent</Button>
          </div>
          {showPayload && <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{JSON.stringify(summary, null, 2)}</pre>}
          <Button onClick={run} disabled={!key.trim() || busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Suggest questions & explain caveats</Button>
          {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
          {result && (
            <div className="space-y-3" aria-live="polite">
              {result.explanation && <div className="rounded-lg border border-border bg-card p-4"><Badge variant="secondary" className="mb-2"><Bot /> AI suggestion · unverified</Badge><p className="text-sm">{result.explanation}</p></div>}
              {result.questions.map((q, i) => (
                <div key={i} className="rounded-lg border border-dashed border-primary bg-card p-4">
                  <Badge variant="secondary" className="mb-2"><Bot /> AI suggestion · {q.chart}</Badge>
                  <p className="font-semibold">{q.question}</p><p className="mt-1 text-sm text-muted-foreground">{q.rationale}</p>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">columns: {q.columns_used.join(", ")}</p>
                </div>
              ))}
              {!result.questions.length && <p className="text-sm text-muted-foreground">The AI returned no questions that passed validation.</p>}
              {result.rejected.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{result.rejected.length} AI item(s) rejected by validation</summary><ul className="ml-5 mt-1 list-disc">{result.rejected.map((r, i) => <li key={i}>{r.item}: {r.reason}</li>)}</ul></details>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}