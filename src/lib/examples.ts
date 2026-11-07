// Original synthetic datasets, generated deterministically on demand (seeded PRNG).
// Imperfections (missing values, duplicates, outliers, label variants) are intentional so profiling has something to find.
import type { Row } from "./profile";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];
const day = (start: Date, offset: number) => new Date(start.getTime() + offset * 86400000).toISOString().slice(0, 10);

export interface Example { id: string; title: string; industry: string; goal: string; description: string; build: () => Row[] }

export const EXAMPLES: Example[] = [
  {
    id: "healthcare", title: "Clinic visits", industry: "Healthcare",
    goal: "Reduce emergency department wait times and 30-day readmissions",
    description: "1,200 synthetic outpatient & ED visits across 5 departments, 2024–2025.",
    build: () => {
      const r = rng(42); const rows: Row[] = [];
      const depts = ["Emergency", "Cardiology", "Orthopedics", "Pediatrics", "Oncology"];
      const ins = ["Public", "Private", "Self-pay"];
      for (let i = 0; i < 1200; i++) {
        const dept = pick(r, depts);
        const base = dept === "Emergency" ? 85 : 30;
        const wait = Math.round(base + r() * 60 + (r() < 0.02 ? 300 : 0));
        rows.push({
          visit_id: `V${String(100000 + i)}`,
          visit_date: day(new Date("2024-01-01"), Math.floor(r() * 730)),
          department: i % 97 === 0 ? dept.toLowerCase() : dept,
          patient_age: r() < 0.04 ? "" : String(Math.round(dept === "Pediatrics" ? r() * 17 : 18 + r() * 70)),
          insurance_type: r() < 0.08 ? "" : pick(r, ins),
          wait_minutes: String(wait),
          length_of_stay_days: String(dept === "Emergency" ? Math.round(r() * 3) : Math.round(r() * 8)),
          readmitted_30d: r() < (dept === "Cardiology" ? 0.18 : 0.09) ? "Yes" : "No",
          cost_usd: (400 + r() * 4000 + (dept === "Oncology" ? 3000 : 0)).toFixed(2),
        });
      }
      for (let i = 0; i < 14; i++) rows.push({ ...rows[i * 50] });
      return rows;
    },
  },
  {
    id: "education", title: "Student outcomes", industry: "Education",
    goal: "Identify which schools and subjects need attendance and tutoring support",
    description: "900 synthetic student-term records across 4 schools and 5 subjects.",
    build: () => {
      const r = rng(7); const rows: Row[] = [];
      const schools = ["Northside High", "Riverside High", "Lakeview Academy", "Hillcrest Middle"];
      const subjects = ["Math", "Science", "English", "History", "Computing"];
      const terms = ["2023-09-01", "2024-01-15", "2024-09-01", "2025-01-15", "2025-09-01"];
      for (let i = 0; i < 900; i++) {
        const school = pick(r, schools);
        const att = Math.min(1, 0.7 + r() * 0.3 - (school === "Riverside High" ? 0.08 : 0));
        rows.push({
          student_id: `S${String(5000 + (i % 300))}`,
          term_start: pick(r, terms),
          school,
          grade_level: String(school === "Hillcrest Middle" ? 6 + Math.floor(r() * 3) : 9 + Math.floor(r() * 4)),
          subject: pick(r, subjects),
          attendance_rate: r() < 0.06 ? "" : att.toFixed(3),
          test_score: r() < 0.1 ? "" : String(Math.round(Math.min(100, 40 + att * 45 + r() * 15))),
          free_lunch_eligible: r() < 0.35 ? "Y" : "N",
          tutoring_hours: String(Math.round(r() < 0.6 ? 0 : r() * 20)),
        });
      }
      return rows;
    },
  },
  {
    id: "logistics", title: "Freight shipments", industry: "Logistics",
    goal: "Improve on-time delivery rate while controlling freight cost per kg",
    description: "1,500 synthetic shipments across 4 hubs and 4 carriers, 2025.",
    build: () => {
      const r = rng(2025); const rows: Row[] = [];
      const hubs = ["Rotterdam", "Hamburg", "Antwerp", "Gdansk"];
      const carriers = ["NorthLine", "BlueRoute", "Cargonet", "SwiftHaul"];
      for (let i = 0; i < 1500; i++) {
        const carrier = pick(r, carriers);
        const dist = Math.round(150 + r() * 1800);
        const days = Math.max(1, Math.round(dist / 500 + r() * 2 + (carrier === "Cargonet" ? 1.2 : 0)));
        const w = Math.round(50 + r() * 2000);
        let d = Math.floor(r() * 365); if (d >= 212 && d < 243) d -= 31; // August intentionally empty
        rows.push({
          shipment_id: `SH-${String(700000 + i)}`,
          ship_date: day(new Date("2025-01-01"), d),
          origin_hub: pick(r, hubs),
          carrier: i % 211 === 0 ? `${carrier} ` : carrier,
          distance_km: String(dist),
          weight_kg: r() < 0.03 ? "" : String(w),
          delivery_days: String(days),
          on_time: days <= Math.ceil(dist / 500) + 1 ? "1" : "0",
          freight_cost_eur: (dist * 0.4 + w * 0.6 + (r() < 0.01 ? 9000 : 0)).toFixed(2),
        });
      }
      return rows;
    },
  },
];

export function rowsToCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const h = Object.keys(rows[0]);
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [h.join(","), ...rows.map((r) => h.map((k) => esc(r[k] ?? "")).join(","))].join("\n");
}