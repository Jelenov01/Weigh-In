import type { Unit } from "./db";
import { DAY, toTs, toUnit, type TrendRow } from "./stats";

const NS = "http://www.w3.org/2000/svg";

export function drawChart(svg: SVGSVGElement, allRows: TrendRow[], goalKg: number | null, unit: Unit, rangeDays: number): void {
  const W = svg.clientWidth || 600;
  const H = svg.clientHeight || 280;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();

  const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    svg.append(e);
    return e;
  };

  let rows = allRows;
  if (rangeDays && rows.length) {
    const end = toTs(rows[rows.length - 1].date);
    rows = rows.filter((r) => end - toTs(r.date) <= rangeDays * DAY);
  }
  if (!rows.length) return;

  const m = { l: 48, r: 14, t: 14, b: 28 };
  const vals = rows.flatMap((r) => [toUnit(r.kg, unit), toUnit(r.trend, unit)]);
  if (goalKg !== null) vals.push(toUnit(goalKg, unit));
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 2) {
    lo -= 1;
    hi += 1;
  }
  const step = [0.5, 1, 2, 5, 10, 20, 50].find((s) => (hi - lo) / s <= 6) ?? 100;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const x0 = toTs(rows[0].date);
  const x1 = Math.max(toTs(rows[rows.length - 1].date), x0 + DAY);
  const XT = (ts: number) => m.l + ((ts - x0) / (x1 - x0)) * (W - m.l - m.r);
  const X = (s: string) => XT(toTs(s));
  const Y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);

  // Grid and y labels
  for (let v = lo; v <= hi + 1e-9; v += step) {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: "grid" });
    el("text", { x: m.l - 8, y: Y(v) + 4, "text-anchor": "end" }).textContent = step < 1 ? v.toFixed(1) : String(Math.round(v));
  }

  // X labels, evenly spaced across the range
  const n = Math.max(2, Math.min(5, Math.floor((W - m.l - m.r) / 110)));
  for (let i = 0; i < n; i++) {
    const ts = x0 + ((x1 - x0) * i) / (n - 1);
    const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
    el("text", { x: XT(ts), y: H - 8, "text-anchor": anchor }).textContent = new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  if (goalKg !== null) {
    const gy = Y(toUnit(goalKg, unit));
    el("line", { x1: m.l, x2: W - m.r, y1: gy, y2: gy, class: "goal" });
    el("text", { x: W - m.r, y: gy - 6, "text-anchor": "end", class: "goal-label" }).textContent = `goal ${toUnit(goalKg, unit).toFixed(1)}`;
  }

  const pts = rows.map((r) => [X(r.date), Y(toUnit(r.trend, unit))] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  if (pts.length > 1) {
    const base = H - m.b;
    el("path", { d: `${line} L${pts[pts.length - 1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z`, class: "area" });
  }

  // Each weigh-in, with a "sinker" line showing its distance from the trend
  for (const r of rows) {
    const x = X(r.date);
    el("line", { x1: x, x2: x, y1: Y(toUnit(r.kg, unit)), y2: Y(toUnit(r.trend, unit)), class: "sinker" });
    el("circle", { cx: x, cy: Y(toUnit(r.kg, unit)), r: 2.6, class: "raw" });
  }

  el("path", { d: line, class: "trend" });
  const last = pts[pts.length - 1];
  el("circle", { cx: last[0], cy: last[1], r: 5, class: "endpoint" });
}
