import { describe, expect, it } from "vitest";
import { aggregate, usesAverage } from "@/lib/aggregate";
import { assessCredibility, profileColumn, profileDataset, toDate, type Row } from "@/lib/profile";
import { generateQuestions, pickRoles, q, recommendKpis, type Roles } from "@/lib/analysis";
import { parseDelimited, readDataset, validateTable } from "@/lib/upload";
import { EXAMPLES, rowsToCsv } from "@/lib/examples";
import { buildSummary } from "@/lib/gemini";
import * as XLSX from "xlsx";

describe("upload validation", () => {
  it("loads CSV and quoted commas without changing data", () => {
    const result = parseDelimited('name,amount\n"East, clinic",10\nWest,20');
    expect(result.rows).toEqual([{ name: "East, clinic", amount: "10" }, { name: "West", amount: "20" }]);
  });
  it("loads TSV and single-column CSV", () => {
    expect(parseDelimited("a\tb\n1\t2").headers).toEqual(["a", "b"]);
    expect(parseDelimited("name\nAlice\nBob").rows).toHaveLength(2);
  });
  it.each(["", "   ", "a,b\n", "a,a\n1,2", ",b\n1,2", 'a,b\n"unclosed,2', "a,b\n1,2,3"])("rejects invalid input %j", (text) => {
    expect(() => parseDelimited(text)).toThrow();
  });
  it("pads short rows instead of inventing values", () => {
    expect(parseDelimited("a,b\n1,2\n3").rows[1]).toEqual({ a: "3", b: "" });
  });
  it("preserves records whose fields are missing-value tokens", () => {
    expect(parseDelimited("a,b\nN/A,NULL").rows).toEqual([{ a: "N/A", b: "NULL" }]);
  });
  it("rejects unsupported types and empty files", async () => {
    await expect(readDataset(new File(["x"], "data.pdf"))).rejects.toThrow("Unsupported");
    await expect(readDataset(new File([], "data.csv"))).rejects.toThrow("empty");
  });
  it("reads an actual two-sheet XLSX and first-sheet notice", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["date", "value"], ["2024-01-01", 12]]), "First");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["ignore"], [42]]), "Second");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], "data.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
    const result = await readDataset(file);
    expect(result.rows).toEqual([{ date: "2024-01-01", value: "12" }]);
    expect(result.notice).toContain('only "First"');
  });
  it("rejects disguised Excel text", async () => {
    const file = new File(["not a workbook"], "data.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("not a workbook").buffer });
    await expect(readDataset(file)).rejects.toThrow("not a valid Excel");
  });
  it("rejects duplicate Excel headers", () => {
    expect(() => validateTable([["value", "value"], [1, 2]])).toThrow("unique");
  });
});

describe("schema and credibility regressions", () => {
  it.each(["2024-02-31", "2024-13-01", "31/01/2024", "2023-02-29"])("rejects invalid calendar date %s", (date) => {
    expect(toDate(date)).toBeNull();
  });
  it("accepts leap days and UTC timestamp", () => {
    expect(toDate("2024-02-29")?.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(toDate("2024-02-29 12:30")?.toISOString()).toBe("2024-02-29T12:30:00.000Z");
  });
  it("retains legitimate consecutive and low-cardinality measures", () => {
    expect(profileColumn("temperature", Array.from({ length: 30 }, (_, i) => String(i + 10))).type).toBe("integer");
    expect(profileDataset([{ amount: "10" }, { amount: "20" }]).measures).toContain("amount");
    expect(profileDataset([{ amount: "10" }, { amount: "10" }]).measures).toContain("amount");
  });
  it("finds zero-IQR outliers", () => {
    expect(profileColumn("amount", ["10", "10", "10", "10", "100"]).numeric?.outliers).toBe(1);
  });
  it("detects repeated entity identifiers without confusing them with measures", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ student_id: `S${i % 10}`, score: String(i + 10) }));
    const p = profileDataset(rows);
    expect(p.ids).toEqual(["student_id"]);
    expect(p.duplicateIdValues).toBe(20);
    expect(p.measures).toContain("score");
  });
  it("checks tiny categories outside the top eight", () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ category: `group${Math.floor(i / 10)}` }));
    rows.push({ category: "singleton" });
    expect(assessCredibility(profileDataset(rows)).items.find((i) => i.area === "Possible bias")?.evidence.join(" ")).toContain("singleton");
  });
});

describe("real aggregates", () => {
  const rows: Row[] = [
    { date: "2024-01-01", amount: "10", group: "A", flag: "t" },
    { date: "2024-01-02", amount: "20", group: "A", flag: "N/A" },
    { date: "2024-03-01", amount: "", group: "B", flag: "f" },
  ];
  const roles: Roles = { table: "test", measure: "amount", date: "date", dim1: "group", flag: "flag" };
  const p = profileDataset(rows);
  it("preserves unknown groups and missing months, without zero values", () => {
    const a = aggregate(rows, p, roles);
    expect(a.trend).toEqual([
      { month: "2024-01", value: 30, count: 2, rate: 1 },
      { month: "2024-02", value: null, count: 0, rate: null },
      { month: "2024-03", value: null, count: 1, rate: 0 },
    ]);
    expect(a.byDim1.find((g) => g.name === "B")?.value).toBeNull();
    expect(a.flagRate).toBe(0.5);
  });
  it("recomputes totals from supplied rows and respects explicit average", () => {
    expect(aggregate(rows.slice(0, 1), p, roles).measureValue).toBe(10);
    expect(aggregate(rows, p, { ...roles, aggregation: "average" }).measureValue).toBe(15);
    expect(usesAverage("postage")).toBe(false);
  });
  it("keeps all groups for rate ranking and donut counts include Other", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ group: `g${i}`, amount: String(i + 1), flag: i === 0 ? "true" : "false" }));
    const a = aggregate(many, profileDataset(many), { ...roles, dim2: "group" });
    expect(a.byDim1).toHaveLength(20);
    expect(a.byDim1.find((g) => g.name === "g0")?.rate).toBe(1);
    expect(a.byDim2.reduce((s, g) => s + g.count, 0)).toBe(20);
  });
  it("histogram preserves extreme values and limits scatter to 400", () => {
    const many = Array.from({ length: 799 }, (_, i) => ({ amount: String(i === 798 ? 100000 : i), weight: String(i + 1) }));
    const a = aggregate(many, profileDataset(many), { table: "test", measure: "amount", measure2: "weight" });
    expect(a.histogram.reduce((s, b) => s + b.count, 0)).toBe(799);
    expect(a.histogram.at(-1)?.count).toBe(1);
    expect(a.scatter.length).toBeLessThanOrEqual(400);
  });
});

describe("SQL and BI consistency", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ "Sales Amount": String(i), date: "2024-01-01", region: i % 2 ? "East" : "West", flag: i % 2 ? "t" : "f" }));
  const p = profileDataset(rows), roles: Roles = { table: "order", measure: "Sales Amount", dim1: "region", date: "date", flag: "flag" };
  it("escapes identifier delimiters", () => {
    expect(q("sqlserver", "a]b")).toBe("[a]]b]");
    expect(q("mysql", "a`b")).toBe("`a``b`");
  });
  it.each(["sqlserver", "mysql"] as const)("quotes aliases and decimalizes integer averages in %s", (dialect) => {
    const queries = generateQuestions(p, roles, dialect, "").map((q) => q.sql).join("\n");
    expect(queries).toContain(q(dialect, "total_Sales Amount"));
    expect(queries).toContain(q(dialect, "order"));
    expect(queries).toContain("AS DECIMAL(28, 8)");
    expect(queries).toContain("ELSE NULL END");
  });
  it("row count includes missing fields and flag vocabularies match", () => {
    const k = recommendKpis(p, roles);
    expect(k.find((x) => x.name === "Record count")?.tableau).toContain("SUM(1)");
    expect(k.find((x) => x.name === "flag rate")?.tableau).toContain('"t"');
    expect(k.find((x) => x.name === "flag rate")?.dax).toContain("BLANK()");
    expect(k.find((x) => x.name.includes("month-over"))?.tableau).not.toMatch(/ABS\(|ZN\(/);
  });
  it("duplicate count is exact-row distinct, not just entity count", () => {
    const duplicated = profileDataset([...rows, rows[0]]);
    expect(generateQuestions(duplicated, roles, "sqlserver", "").find((x) => x.sql.includes("exact_distinct_rows"))?.sql).toContain("SELECT DISTINCT");
  });
});

describe("examples and summary privacy", () => {
  it.each(EXAMPLES)("round-trips $id through CSV and all analytics", (ex) => {
    const rows = parseDelimited(rowsToCsv(ex.build())).rows;
    const p = profileDataset(rows), roles = pickRoles(p, ex.goal, `${ex.id}.csv`);
    expect(p.rowCount).toBe(ex.build().length);
    expect(p.duplicateRows).toBe(ex.id === "healthcare" ? 14 : 0);
    expect(generateQuestions(p, roles, "sqlserver", ex.goal).length).toBeGreaterThanOrEqual(8);
    expect(aggregate(rows, p, roles).count).toBe(rows.length);
    expect(recommendKpis(p, roles).filter((k) => k.feasible).length).toBeGreaterThan(2);
  });
  it("excludes labels embedded in caveats unless opted in", () => {
    const p = profileDataset([{ region: "PRIVATE", amount: "1" }, { region: "private", amount: "2" }]);
    const roles = pickRoles(p, "", "data.csv");
    expect(JSON.stringify(buildSummary(p, roles, "", "", false))).not.toMatch(/PRIVATE|private/);
    expect(JSON.stringify(buildSummary(p, roles, "", "", true))).toContain("PRIVATE");
  });
});