// Optional BYOK Gemini assistant. The key lives only in React state; it is never stored or logged.
// Requests go directly from the browser to Google, so the key is visible to this browser session (devtools, extensions).
import type { Roles } from "./analysis";
import type { DatasetProfile } from "./profile";

export const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"];
const CHARTS = ["line", "bar", "donut", "scatter", "histogram", "table", "heatmap", "kpi"];

export function buildSummary(p: DatasetProfile, r: Roles, goal: string, industry: string, includeLabels: boolean) {
  return {
    industry, business_goal: goal, rows: p.rowCount, duplicate_rows: p.duplicateRows,
    roles: r,
    columns: p.columns.map((c) => ({
      name: c.name, type: c.type, missing_pct: +(c.missingPct * 100).toFixed(1), distinct: c.distinct,
      ...(c.numeric ? { min: c.numeric.min, median: +c.numeric.median.toFixed(2), mean: +c.numeric.mean.toFixed(2), max: c.numeric.max, outliers: c.numeric.outliers } : {}),
      ...(c.date ? { date_min: c.date.min, date_max: c.date.max, empty_months: c.date.missingMonths.length } : {}),
      ...(includeLabels && (c.type === "category" || c.type === "boolean") ? { top_labels: c.topValues.slice(0, 5).map((v) => `${v.value} (${v.count})`) } : {}),
    })),
    caveats: includeLabels ? p.caveats : p.caveats.filter((c) => !c.includes("inconsistent labels:")),
  };
}

export class GeminiError extends Error { constructor(msg: string, public kind: "quota" | "auth" | "bad" | "network" | "format") { super(msg); } }

export async function callGemini(key: string, model: string, prompt: string, signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: "application/json" } }),
    });
  } catch (e) { if (signal?.aborted) throw e; throw new GeminiError("Could not reach Gemini. Check your connection or browser extensions blocking the request.", "network"); }
  if (!res.ok) {
    let detail = ""; try { detail = (await res.json())?.error?.message ?? ""; } catch { /* ignore */ }
    if (res.status === 429) throw new GeminiError("Quota or rate limit reached for this key. Free-tier keys have strict per-minute and daily limits; wait or check billing in Google AI Studio.", "quota");
    // Google returns 400 (API_KEY_INVALID) for malformed/invalid keys, 401/403 for restricted ones.
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key|api_key/i.test(detail))) throw new GeminiError("The key was rejected (invalid, restricted, or API not enabled).", "auth");
    throw new GeminiError(`Gemini returned ${res.status}. ${detail.slice(0, 200)}`, "bad");
  }
  let j;
  try { j = await res.json(); } catch { throw new GeminiError("Gemini response was not valid JSON.", "format"); }
  const text = j?.candidates?.[0]?.content?.parts?.map((x: { text?: string }) => x.text ?? "").join("") ?? "";
  if (!text) throw new GeminiError("Gemini returned an empty response (possibly blocked by safety filters).", "format");
  return text;
}

export function questionPrompt(summary: unknown) {
  return `You help beginners plan Power BI/Tableau dashboards. Use ONLY the dataset summary below. Do not invent columns, values, trends or findings; you have not seen the data rows and no query has been run.
Return JSON: {"questions":[{"question":string,"rationale":string,"chart":one of ${JSON.stringify(CHARTS)},"columns_used":string[]}],"explanation":string}
Give 3-6 business questions tied to the goal, using exact column names. "explanation": 2-4 sentences explaining for a beginner which caveats most limit conclusions.
SUMMARY:
${JSON.stringify(summary)}`;
}

export interface AiQuestion { question: string; rationale: string; chart: string; columns_used: string[] }
export interface AiResult { questions: AiQuestion[]; rejected: { item: string; reason: string }[]; explanation: string }

export function validateAiOutput(text: string, columnNames: string[]): AiResult {
  let data: unknown;
  try { data = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim()); } catch { throw new GeminiError("AI response was not valid JSON; nothing was shown.", "format"); }
  const obj = (data ?? {}) as { questions?: unknown; explanation?: unknown };
  const names = new Set(columnNames);
  const out: AiResult = { questions: [], rejected: [], explanation: typeof obj.explanation === "string" ? obj.explanation.slice(0, 1200) : "" };
  for (const raw of Array.isArray(obj.questions) ? obj.questions.slice(0, 8) : []) {
    const q = raw as Partial<AiQuestion>;
    const label = typeof q?.question === "string" ? q.question.slice(0, 120) : "(malformed item)";
    if (typeof q?.question !== "string" || typeof q.rationale !== "string" || !Array.isArray(q.columns_used)) { out.rejected.push({ item: label, reason: "missing required fields" }); continue; }
    const unknown = q.columns_used.filter((c) => typeof c !== "string" || !names.has(c));
    if (!q.columns_used.length || unknown.length) { out.rejected.push({ item: label, reason: unknown.length ? `references unknown column(s): ${unknown.join(", ")}` : "no columns referenced" }); continue; }
    out.questions.push({ question: q.question.slice(0, 300), rationale: q.rationale.slice(0, 600), chart: CHARTS.includes(String(q.chart)) ? String(q.chart) : "bar", columns_used: q.columns_used as string[] });
  }
  return out;
}