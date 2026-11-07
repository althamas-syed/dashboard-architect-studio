import Papa from "papaparse";
import type { Row } from "./profile";

export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_ROWS = 250_000;
export interface UploadedDataset { rows: Row[]; headers: string[]; notice: string | null }

export function validateTable(matrix: unknown[][]): UploadedDataset {
  const [first, ...body] = matrix;
  if (!first?.length) throw new Error("No header row found. The first row must contain column names.");
  const headers = first.map((value) => String(value ?? "").trim());
  if (headers.some((h) => !h)) throw new Error("Every column needs a non-empty header. No data was replaced.");
  if (new Set(headers).size !== headers.length) throw new Error("Column names repeat. Give every column a unique name before importing.");
  const nonempty = body.filter((r) => r.some((value) => String(value ?? "").trim() !== ""));
  if (!nonempty.length) throw new Error("No data rows found. Include a header row and at least one non-empty data row.");
  const bad = nonempty.findIndex((r) => r.length > headers.length);
  if (bad >= 0) throw new Error(`Data row ${bad + 1} has more fields than the header. Check delimiters and quotes.`);
  const rows = nonempty.slice(0, MAX_ROWS).map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? "")])));
  const short = nonempty.filter((r) => r.length < headers.length).length;
  const notices = [
    ...(nonempty.length > MAX_ROWS ? [`Only the first ${MAX_ROWS.toLocaleString()} rows were loaded.`] : []),
    ...(short ? [`${short} short row(s) were padded with missing values.`] : []),
  ];
  return { rows, headers, notice: notices.join(" ") || null };
}

export function parseDelimited(text: string): UploadedDataset {
  if (!text.trim()) throw new Error("The file is empty. Include a header row and data.");
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  // UndetectableDelimiter is benign for a legitimate single-column file.
  const error = result.errors.find((e) => e.code !== "UndetectableDelimiter");
  if (error) throw new Error(`Could not parse CSV: ${error.message}${error.row === undefined ? "" : ` (row ${error.row + 1})`}.`);
  return validateTable(result.data);
}

export async function readDataset(file: File): Promise<UploadedDataset> {
  if (!/\.(csv|tsv|txt|xlsx|xls)$/i.test(file.name)) throw new Error("Unsupported file type. Choose CSV, TSV, TXT, XLSX or XLS.");
  if (!file.size) throw new Error(`"${file.name}" is empty. Include a header row and data.`);
  if (file.size > MAX_BYTES) throw new Error("File is larger than 50 MB. Sample or aggregate it first.");
  if (!/\.(xlsx|xls)$/i.test(file.name)) return parseDelimited(await file.text());
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (!zip && !ole) throw new Error("This is not a valid Excel workbook. Export it as CSV or XLSX and try again.");
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { cellDates: true });
  const name = wb.SheetNames[0];
  const sheet = name ? wb.Sheets[name] : undefined;
  if (!sheet) throw new Error("Workbook contains no readable worksheet.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false, dateNF: "yyyy-mm-dd" });
  const result = validateTable(matrix);
  if (wb.SheetNames.length > 1) result.notice = [`Workbook has ${wb.SheetNames.length} sheets; only "${name}" was loaded.`, result.notice].filter(Boolean).join(" ");
  return result;
}