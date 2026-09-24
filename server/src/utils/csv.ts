import { parse } from "csv-parse/sync";
import { HttpError } from "./http";

export function parseCsv(text: string, maxRows = 1000): Record<string, string>[] {
  let rows: Record<string, string>[];
  try {
    rows = parse(text, { columns: (h: string[]) => h.map((x) => x.trim()), skip_empty_lines: true, trim: true, bom: true });
  } catch (e) {
    throw new HttpError(400, `Could not read CSV: ${(e as Error).message}`);
  }
  if (rows.length === 0) throw new HttpError(400, "CSV has no data rows");
  if (rows.length > maxRows) throw new HttpError(400, `CSV has ${rows.length} rows; the limit is ${maxRows}`);
  return rows;
}
