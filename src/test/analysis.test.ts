import { describe, expect, it } from "vitest";
import { assessCredibility, profileColumn, profileDataset } from "@/lib/profile";
import { generateQuestions, pickRoles, q } from "@/lib/analysis";
import { validateAiOutput } from "@/lib/gemini";
import { EXAMPLES } from "@/lib/examples";

describe("profiling", () => {
  it("detects types and missing tokens", () => {
    expect(profileColumn("amount", ["1.5", "2", "", "N/A", "3"]).type).toBe("number");
    expect(profileColumn("amount", ["1.5", "2", "", "N/A", "3"]).missing).toBe(2);
    expect(profileColumn("d", ["2024-01-01", "2024-03-05", "2024-02-01"]).type).toBe("date");
    expect(profileColumn("flag", ["Yes", "No", "Yes"]).type).toBe("boolean");
  });
  it("flags identifier columns", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `C${i}`);
    expect(profileColumn("customer_id", ids).suspiciousId).toBe(true);
  });
  it("counts exact duplicate rows and IQR outliers", () => {
    const rows = [...Array.from({ length: 20 }, (_, i) => ({ a: String(10 + (i % 3)), b: `x${i}` })), { a: "1000", b: "y" }, { a: "1000", b: "y" }];
    const p = profileDataset(rows);
    expect(p.duplicateRows).toBe(1);
    expect(p.columns[0].numeric!.outliers).toBe(2);
  });
  it("finds empty months in date coverage", () => {
    const c = profileColumn("d", ["2024-01-10", "2024-03-10", "2024-04-02"]);
    expect(c.date!.missingMonths).toEqual(["2024-02"]);
  });
  it("caps confidence at Low below 30 rows", () => {
    expect(assessCredibility(profileDataset([{ a: "1" }, { a: "2" }])).confidence).toBe("Low");
  });
});

describe("questions & SQL", () => {
  it("quotes by dialect and uses TOP vs LIMIT", () => {
    expect(q("sqlserver", "x")).toBe("[x]");
    expect(q("mysql", "x")).toBe("`x`");
    const ex = EXAMPLES[0]; const rows = ex.build(); const p = profileDataset(rows); const r = pickRoles(p, ex.goal, "visits.csv");
    const ss = generateQuestions(p, r, "sqlserver", ex.goal), my = generateQuestions(p, r, "mysql", ex.goal);
    expect(ss.length).toBeGreaterThanOrEqual(8);
    expect(ss.length).toBeLessThanOrEqual(12);
    expect(ss.some((x) => x.sql.includes("SELECT TOP"))).toBe(true);
    expect(my.some((x) => x.sql.includes("LIMIT"))).toBe(true);
  });
});

describe("AI output validation", () => {
  it("rejects questions referencing unknown columns", () => {
    const out = validateAiOutput(JSON.stringify({ questions: [
      { question: "ok", rationale: "r", chart: "bar", columns_used: ["a"] },
      { question: "bad", rationale: "r", chart: "bar", columns_used: ["revenue"] },
    ], explanation: "e" }), ["a"]);
    expect(out.questions).toHaveLength(1);
    expect(out.rejected[0].reason).toContain("revenue");
  });
  it("throws on non-JSON", () => {
    expect(() => validateAiOutput("hello", ["a"])).toThrow();
  });
});