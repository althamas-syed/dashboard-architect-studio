import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSummary, callGemini, GeminiError } from "@/lib/gemini";
import { profileDataset } from "@/lib/profile";
import { pickRoles } from "@/lib/analysis";

const mockFetch = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
afterEach(() => vi.unstubAllGlobals());

describe("Gemini client (mocked, no real key)", () => {
  it("sends key in header, not URL", async () => {
    mockFetch(200, { candidates: [{ content: { parts: [{ text: "{}" }] } }] });
    await callGemini("FAKE", "gemini-2.5-flash", "hi");
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("FAKE");
  });
  it("maps 429 to quota", async () => {
    mockFetch(429, { error: { message: "x" } });
    await expect(callGemini("FAKE", "m", "p")).rejects.toMatchObject({ kind: "quota" });
  });
  it("maps 400 invalid key to auth", async () => {
    mockFetch(400, { error: { message: "API key not valid. Please pass a valid API key." } });
    await expect(callGemini("FAKE", "m", "p")).rejects.toBeInstanceOf(GeminiError);
    await expect(callGemini("FAKE", "m", "p")).rejects.toMatchObject({ kind: "auth" });
  });
  it("preserves cancellation instead of reporting a network error", async () => {
    const controller = new AbortController(); controller.abort();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("Aborted", "AbortError"); }));
    await expect(callGemini("FAKE", "m", "p", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("reports network failure without exposing key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("private transport info"); }));
    await expect(callGemini("FAKE", "m", "p")).rejects.toMatchObject({ kind: "network" });
  });
  it("rejects malformed transport JSON and empty candidates", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not JSON", { status: 200 })));
    await expect(callGemini("FAKE", "m", "p")).rejects.toMatchObject({ kind: "format" });
    mockFetch(200, { candidates: [] });
    await expect(callGemini("FAKE", "m", "p")).rejects.toMatchObject({ kind: "format" });
  });
  it("summary excludes rows and labels by default", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: `SECRET${i}`, region: i % 2 ? "East" : "West", v: String(i) }));
    const p = profileDataset(rows);
    const s = JSON.stringify(buildSummary(p, pickRoles(p, "", "f.csv"), "", "", false));
    expect(s).not.toContain("SECRET");
    expect(s).not.toContain("East");
  });
});