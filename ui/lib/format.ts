const LOCALE = "fr-FR";

const nf0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct0 = new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "medium" });
const dateOnly = new Intl.DateTimeFormat(LOCALE, { dateStyle: "long" });
const timeOnly = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

const DASH = "—";

export function int(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? DASH : nf0.format(value);
}

/** RUL values come from the API rounded to 0.1 cycle; they are shown with that precision. */
export function cycles(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? DASH : nf1.format(value);
}

export function decimal2(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? DASH : nf2.format(value);
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? DASH : pct0.format(value);
}

export function interval(low: number, high: number): string {
  return `${cycles(low)} – ${cycles(high)}`;
}

export function unitLabel(unit: number): string {
  return String(unit).padStart(3, "0");
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateTime.format(d) : DASH;
}

export function formatDate(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateOnly.format(d) : DASH;
}

export function formatTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  return d ? timeOnly.format(d) : DASH;
}

export function timeAgo(value: number | null | undefined, now = Date.now()): string {
  if (!value) return DASH;
  const seconds = Math.round((value - now) / 1000);
  if (Math.abs(seconds) < 45) return "à l’instant";
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  return relative.format(Math.round(minutes / 60), "hour");
}

export function milliseconds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return value >= 1000 ? `${nf1.format(value / 1000)} s` : `${nf0.format(value)} ms`;
}

export function plural(count: number, one: string, many: string): string {
  return `${int(count)} ${count === 1 ? one : many}`;
}
