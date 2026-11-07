import type { ChartKind } from "./analysis";

export function chartGuide(kind: ChartKind, f: { x?: string; y?: string; legend?: string; agg?: string }) {
  const agg = f.agg ?? "Sum";
  const builtMeasure = agg === "Measure" || agg === "Count";
  const value = builtMeasure ? `${f.y} (use the calculated KPI from the KPIs tab; do not average percentages)` : `${f.y} (${agg})`;
  const g: Record<ChartKind, { powerbi: string[]; tableau: string[] }> = {
    line: {
      powerbi: ["Insert a Line chart.", `X-axis: ${f.x} → right-click → use Date Hierarchy, keep Year & Month (or a Month column from a Date table).`, `Y-axis: ${value}.`, "Format → X-axis type: Continuous; add a data label on the last point only."],
      tableau: [`Drag ${f.x} to Columns, right-click → choose continuous MONTH.`, `Drag the calculated KPI ${f.y} to Rows; preserve its aggregation.`, "Marks: Line. Analytics pane → add Trend Line if useful."],
    },
    bar: {
      powerbi: ["Insert a Clustered bar chart (horizontal).", `Y-axis: ${f.x}.`, `X-axis: ${value}.`, "Sort by the value descending; turn on data labels."],
      tableau: [`Drag ${f.x} to Rows and the calculated KPI ${f.y} to Columns.`, "Toolbar → Sort descending.", "Drag the measure to Label."],
    },
    donut: {
      powerbi: ["Insert a Donut chart.", `Legend: ${f.legend ?? f.x}; Values: Count of rows.`, "Limit to ≤5 slices; group the rest as Other."],
      tableau: [`Marks: Pie. Color: ${f.legend ?? f.x}; Angle: SUM(1) row-count calculated field.`, "Optional donut: dual-axis with a smaller white circle."],
    },
    scatter: {
      powerbi: ["Insert a Scatter chart.", `X: ${f.x}, Y: ${f.y} — add a unique row identifier to Details to preserve individual points.`, f.legend ? `Legend: ${f.legend}.` : "Use a unique row identifier in Details; verify duplicates are preserved.", "Analytics pane → Trend line."],
      tableau: ["Analysis → uncheck Aggregate Measures.", `${f.x} to Columns, ${f.y} to Rows.`, "Analytics → Trend Line."],
    },
    histogram: {
      powerbi: [`Right-click ${f.y} → New group → Bin type: Size of bins.`, `Insert a Clustered column chart; X-axis: ${f.y} (bins); Y-axis: Record Count (COUNTROWS measure).`],
      tableau: [`Right-click ${f.y} → Create → Bins.`, "Bins to Columns, SUM(1) row-count field to Rows."],
    },
    table: {
      powerbi: ["Insert a Table visual.", `Add ${[f.x, f.y].filter(Boolean).join(", ")}.`, "Top N filter in the Filters pane; conditional formatting → data bars."],
      tableau: [`${f.x} to Rows, ${f.y} to Text.`, "Filter → Top → By field → Top 10."],
    },
    heatmap: {
      powerbi: ["Insert a Matrix.", `Rows: ${f.x}; Columns: ${f.legend}; Values: ${f.y} (Average).`, "Conditional formatting → Background color scale."],
      tableau: [`${f.x} to Rows, ${f.legend} to Columns.`, `Marks: Square; AVG(${f.y}) to Color and Label.`],
    },
    kpi: {
      powerbi: ["Insert a Card (new) visual.", "Drop the DAX measure into Data.", "Add a reference label for the comparison period."],
      tableau: ["Create a sheet with the measure on Text.", "Format font large; use it as a tile on the dashboard."],
    },
  };
  return g[kind];
}