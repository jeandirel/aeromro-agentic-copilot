/**
 * CSV export of data already returned by the API. Cells that a spreadsheet could interpret as a
 * formula are neutralised (CSV injection), and the file starts with a BOM so Excel reads UTF-8.
 */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const quote = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    const safe = /^[=+\-@\t\r]/.test(text) && !/^-?[0-9.,]+$/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return `\ufeff${columns.join(";")}\r\n${rows.map((r) => columns.map((c) => quote(r[c])).join(";")).join("\r\n")}`;
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns: string[]): void {
  const blob = new Blob([toCsv(rows, columns)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
