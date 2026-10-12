export type CsvColumn = { key: string; label: string };
export type CsvRow = Record<string, string | number | null | undefined>;

// RFC4180: quote a field only when it contains a comma, a double quote, or
// a newline, doubling any internal quotes; CRLF row endings per spec. No
// dependency pulled in for this — flat-row CSV serialization is simple
// enough to hand-roll, matching this codebase's "no library where plain
// code suffices" convention.
export function toCsv(columns: CsvColumn[], rows: CsvRow[]): string {
  const escape = (v: string | number | null | undefined): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}
