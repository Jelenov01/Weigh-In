import type { Entry, Unit } from "./db";

export const DAY = 86_400_000;
const LB_PER_KG = 2.20462;

export interface TrendRow {
  date: string;
  kg: number;
  note: string;
  trend: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => dateStr(new Date());

export function toTs(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export const toUnit = (kg: number, unit: Unit) => (unit === "lb" ? kg * LB_PER_KG : kg);
export const fromUnit = (v: number, unit: Unit) => (unit === "lb" ? v / LB_PER_KG : v);

/**
 * Exponentially smoothed trend: each reading moves the trend 10% of the way
 * toward it, which filters out day-to-day water and sodium swings.
 */
export function withTrend(entries: Pick<Entry, "date" | "kg" | "note">[]): TrendRow[] {
  let t: number | null = null;
  return entries.map((e) => {
    t = t === null ? e.kg : t + 0.1 * (e.kg - t);
    return { date: e.date, kg: e.kg, note: e.note, trend: t };
  });
}

/** Least-squares slope of the trend over the last 28 days, in kg per week. */
export function weeklyRate(rows: TrendRow[]): number | null {
  if (rows.length < 2) return null;
  const end = toTs(rows[rows.length - 1].date);
  const pts = rows.filter((r) => end - toTs(r.date) <= 28 * DAY);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => toTs(p.date) / DAY);
  const ys = pts.map((p) => p.trend);
  if (xs[xs.length - 1] - xs[0] < 3) return null;
  const mx = xs.reduce((a, b) => a + b) / xs.length;
  const my = ys.reduce((a, b) => a + b) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my);
    den += (x - mx) ** 2;
  });
  return den ? (num / den) * 7 : null;
}

/** A made-up 10-week series shown before the first real weigh-in. */
export function exampleData(): Pick<Entry, "date" | "kg" | "note">[] {
  const out: Pick<Entry, "date" | "kg" | "note">[] = [];
  const start = toTs(todayStr()) - 70 * DAY;
  for (let i = 0; i <= 70; i++) {
    if (i % 3 === 2 && i % 2) continue; // a few skipped days
    const kg = 88 - i * 0.07 + Math.sin(i * 1.7) * 0.6 + Math.cos(i * 0.9) * 0.35;
    out.push({ date: dateStr(new Date(start + i * DAY)), kg, note: "" });
  }
  return out;
}
