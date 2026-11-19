import "./style.css";
import { deleteEntry, getEntries, getSettings, putEntries, putEntry, requestPersistence, saveSettings, type Entry, type Settings } from "./db";
import { drawChart } from "./chart";
import { initCalories } from "./calories";
import { toCsv, fromCsv } from "./csv";
import { DAY, exampleData, fromUnit, toTs, todayStr, toUnit, weeklyRate, withTrend, type TrendRow } from "./stats";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const state: { entries: Entry[]; settings: Settings; range: number } = {
  entries: [],
  settings: { unit: "lb", goalKg: null },
  range: 90,
};

const unit = () => state.settings.unit;
const fmtW = (kg: number | null | undefined) => (kg == null || Number.isNaN(kg) ? "—" : toUnit(kg, unit()).toFixed(1));
const fmtDate = (s: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(toTs(s)).toLocaleDateString(undefined, opts);
const roundKg = (kg: number) => Math.round(kg * 1000) / 1000;

function flash(msg: string) {
  $("formMsg").textContent = msg;
}

// ---------- rendering ----------

function render() {
  const real = state.entries.length > 0;
  const rows = withTrend(real ? state.entries : exampleData());
  const chartGoal = real ? state.settings.goalKg : 80;

  $("exampleTag").hidden = real;
  $("emptyNote").hidden = real;
  $("goalLegend").hidden = chartGoal === null;
  document.querySelectorAll(".unitLbl").forEach((e) => (e.textContent = unit()));
  document.querySelectorAll<HTMLButtonElement>("[data-unit]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.unit === unit())));
  document.querySelectorAll<HTMLButtonElement>("[data-range]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.range) === state.range)));

  renderReadout(real ? rows : []);
  renderStats(real ? rows : []);
  renderHistory(real ? rows : []);
  drawChart($<HTMLElement>("chart") as unknown as SVGSVGElement, rows, chartGoal, unit(), state.range);
}

function renderReadout(rows: TrendRow[]) {
  const pill = $("deltaPill");
  if (!rows.length) {
    $("trendVal").textContent = "—";
    $("trendSub").textContent = "Your smoothed weight appears after your first weigh-in.";
    pill.hidden = true;
    return;
  }
  const last = rows[rows.length - 1];
  $("trendVal").textContent = fmtW(last.trend);
  $("trendSub").textContent = `Last weigh-in ${fmtW(last.kg)} ${unit()} on ${fmtDate(last.date, { weekday: "short", month: "short", day: "numeric" })}`;
  const rate = weeklyRate(rows);
  pill.hidden = rate === null;
  if (rate !== null) {
    pill.className = "delta" + (rate > 0.02 ? " up" : "");
    pill.textContent = `${rate <= 0 ? "▼" : "▲"} ${Math.abs(toUnit(rate, unit())).toFixed(2)} ${unit()}/week`;
  }
}

function renderStats(rows: TrendRow[]) {
  const dl = $("stats");
  dl.replaceChildren();
  const add = (label: string, value: string, extra?: HTMLElement) => {
    const row = document.createElement("div");
    row.className = "stat";
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    row.append(dt, dd);
    dl.append(row);
    if (extra) dl.append(extra);
  };

  const goalKg = state.settings.goalKg;
  const first = rows[0];
  const last = rows[rows.length - 1];
  add("Starting weight", first ? `${fmtW(first.kg)} ${unit()}` : "—");
  add("Current trend", last ? `${fmtW(last.trend)} ${unit()}` : "—");
  const change = first && last ? last.trend - first.kg : null;
  add("Total change", change === null ? "—" : `${change <= 0 ? "−" : "+"}${Math.abs(toUnit(change, unit())).toFixed(1)} ${unit()}`);

  if (goalKg === null) {
    add("Goal", "Not set");
  } else {
    add("Goal", `${fmtW(goalKg)} ${unit()}`);
    if (first && last) {
      const toGo = last.trend - goalKg;
      const span = first.kg - goalKg;
      const pct = span > 0 ? Math.max(0, Math.min(100, ((first.kg - last.trend) / span) * 100)) : toGo <= 0 ? 100 : 0;
      const bar = document.createElement("div");
      bar.className = "progress";
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", "100");
      bar.setAttribute("aria-valuenow", String(Math.round(pct)));
      const fill = document.createElement("span");
      fill.style.width = `${pct}%`;
      bar.append(fill);
      add("Left to go", toGo <= 0 ? "Goal reached" : `${toUnit(toGo, unit()).toFixed(1)} ${unit()} · ${Math.round(pct)}%`, bar);

      const rate = weeklyRate(rows);
      let eta = "—";
      if (toGo <= 0) eta = "Reached";
      else if (rate !== null && rate < -0.01) {
        const days = Math.round((toGo / -rate) * 7);
        eta = days > 730 ? "Over 2 years" : new Date(Date.now() + days * DAY).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      } else if (rate !== null) eta = "Not trending down yet";
      add("Projected goal date", eta);
    }
  }
  add("Weigh-ins logged", String(rows.length));
}

function renderHistory(rows: TrendRow[]) {
  const tbody = $("histBody");
  tbody.replaceChildren();
  $("histEmpty").hidden = rows.length > 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    const prev = rows[i - 1];
    const tr = document.createElement("tr");
    const td = (cls: string, text: string) => {
      const c = document.createElement("td");
      c.className = cls;
      c.textContent = text;
      tr.append(c);
      return c;
    };
    td("", fmtDate(r.date, { month: "short", day: "numeric", year: "2-digit" }));
    td("w", fmtW(r.kg));
    if (prev) {
      const ch = toUnit(r.kg, unit()) - toUnit(prev.kg, unit());
      const sign = ch > 0.05 ? "+" : ch < -0.05 ? "−" : "±";
      td(`c ${ch < -0.05 ? "down" : ch > 0.05 ? "up" : ""}`, sign + Math.abs(ch).toFixed(1));
    } else td("c", "start");
    td("note", r.note);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost danger";
    del.textContent = "Delete";
    del.addEventListener("click", () => onDelete(r.date, del));
    td("act", "").append(del);
    tbody.append(tr);
  }
}

// ---------- actions ----------

async function reload() {
  state.entries = await getEntries();
  render();
}

async function onDelete(date: string, btn: HTMLButtonElement) {
  if (!btn.classList.contains("armed")) {
    btn.classList.add("armed");
    btn.textContent = "Confirm";
    setTimeout(() => {
      btn.classList.remove("armed");
      btn.textContent = "Delete";
    }, 3000);
    return;
  }
  await deleteEntry(date);
  flash(`Deleted the entry for ${fmtDate(date)}.`);
  await reload();
}

$<HTMLFormElement>("logForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const date = $<HTMLInputElement>("fDate").value;
  const w = parseFloat($<HTMLInputElement>("fWeight").value);
  const note = $<HTMLInputElement>("fNote").value.trim();
  if (!date || !(w > 0)) return flash("Enter a date and a weight.");
  const existed = state.entries.some((e) => e.date === date);
  await putEntry({ date, kg: roundKg(fromUnit(w, unit())), note, at: Date.now() });
  flash(`${existed ? "Updated" : "Logged"} ${w.toFixed(1)} ${unit()} for ${fmtDate(date)}.`);
  $<HTMLInputElement>("fWeight").value = "";
  $<HTMLInputElement>("fNote").value = "";
  await reload();
});

$<HTMLFormElement>("settingsForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const raw = $<HTMLInputElement>("gWeight").value.trim();
  const goalKg = raw === "" ? null : roundKg(fromUnit(parseFloat(raw), unit()));
  if (goalKg !== null && !(goalKg > 0)) return;
  state.settings = { ...state.settings, goalKg };
  await saveSettings(state.settings);
  flash(goalKg === null ? "Goal cleared." : `Goal set to ${raw} ${unit()}.`);
  render();
});

document.querySelectorAll<HTMLButtonElement>("[data-unit]").forEach((b) =>
  b.addEventListener("click", async () => {
    const u = b.dataset.unit as Settings["unit"];
    if (u === unit()) return;
    state.settings = { ...state.settings, unit: u };
    syncGoalInput();
    await saveSettings(state.settings);
    render();
  }),
);

document.querySelectorAll<HTMLButtonElement>("[data-range]").forEach((b) =>
  b.addEventListener("click", () => {
    state.range = Number(b.dataset.range);
    try {
      localStorage.setItem("weigh-in-range", String(state.range));
    } catch {
      /* storage blocked */
    }
    render();
  }),
);

$("exportBtn").addEventListener("click", () => {
  if (!state.entries.length) return flash("Nothing to export yet.");
  const blob = new Blob([toCsv(state.entries)], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `weigh-in-${todayStr()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$<HTMLInputElement>("importFile").addEventListener("change", async (ev) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const entries = fromCsv(await file.text());
    await putEntries(entries);
    flash(`Imported ${entries.length} weigh-ins. Entries with the same date were replaced.`);
    await reload();
  } catch (e) {
    flash(e instanceof Error ? e.message : "Couldn't read that file.");
  }
});

function syncGoalInput() {
  const g = state.settings.goalKg;
  $<HTMLInputElement>("gWeight").value = g === null ? "" : toUnit(g, unit()).toFixed(1);
}

// ---------- tabs ----------

const TABS = ["weight", "calories"] as const;

function showTab(tab: string) {
  const active = TABS.includes(tab as (typeof TABS)[number]) ? tab : "weight";
  for (const t of TABS) $(`view-${t}`).hidden = t !== active;
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === active)));
}

document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) =>
  b.addEventListener("click", () => {
    history.replaceState(null, "", `#${b.dataset.tab}`);
    showTab(b.dataset.tab!);
  }),
);
window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

// ---------- start ----------

async function init() {
  showTab(location.hash.slice(1));
  initCalories().catch(() => ($("foodMsg").textContent = "Saved foods couldn't be loaded from this browser's storage."));
  const dateInput = $<HTMLInputElement>("fDate");
  dateInput.value = todayStr();
  dateInput.max = todayStr();
  try {
    const r = localStorage.getItem("weigh-in-range");
    if (r !== null) state.range = Number(r);
  } catch {
    /* storage blocked */
  }

  state.settings = await getSettings();
  syncGoalInput();
  await reload();
  requestPersistence();

  let frame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }).observe($("chart"));
}

init().catch(() => flash("This browser blocked local storage, so weigh-ins can't be saved. Try a non-private window."));
