import { deleteLogItem, getLog, getSettings, putLogItem, saveSettings, type AmountUnit, type Food, type LogItem, type Meal } from "./db";
import { DAY, dateStr, todayStr, toTs } from "./stats";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const MEALS: { id: Meal; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snack", label: "Snacks" },
];

let day = todayStr();
let items: LogItem[] = [];
let target: number | null = null;
let avg: { kcal: number; days: number } | null = null;

const shiftDay = (d: string, n: number) => dateStr(new Date(toTs(d) + n * DAY + 12 * 3_600_000)); // noon avoids DST edge cases
const kcalStr = (n: number) => Math.round(n).toLocaleString();

/** The day the log is showing, as YYYY-MM-DD. */
export const viewedDay = () => day;

/** "today", "yesterday", or a short date like "Mon, Nov 17". */
export function dayLabel(d: string = day): string {
  if (d === todayStr()) return "today";
  if (d === shiftDay(todayStr(), -1)) return "yesterday";
  return new Date(toTs(d)).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** A sensible meal for the current time of day. */
export function defaultMeal(): Meal {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 17 ? "snack" : h < 21 ? "dinner" : "snack";
}

export function formatAmount(amount: number, unit: AmountUnit): string {
  const n = Number(amount.toFixed(2)).toString();
  return unit === "serving" ? `${n} serving${amount === 1 ? "" : "s"}` : `${n} ${unit}`;
}

export async function addToLog(food: Food, amount: number, unit: AmountUnit, kcal: number, meal: Meal): Promise<void> {
  await putLogItem({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: day,
    meal,
    foodId: food.id,
    name: food.name,
    brand: food.brand,
    amount,
    unit,
    kcal: Math.round(kcal),
    at: Date.now(),
  });
  await load();
}

// ---------- rendering ----------

function render() {
  const isToday = day === todayStr();
  const label = dayLabel();
  $("logDay").textContent = label[0].toUpperCase() + label.slice(1);
  $<HTMLButtonElement>("dayNext").disabled = isToday;
  $("dayToday").hidden = isToday;

  const total = items.reduce((s, i) => s + i.kcal, 0);
  $("logTotal").textContent = kcalStr(total);

  const bar = $("logBar");
  const left = $("logLeft");
  if (target) {
    const remaining = target - total;
    $("logTarget").textContent = `of ${kcalStr(target)} kcal target`;
    left.hidden = false;
    left.classList.toggle("over", remaining < 0);
    left.textContent = remaining >= 0 ? `${kcalStr(remaining)} left` : `${kcalStr(-remaining)} over`;
    bar.hidden = false;
    bar.classList.toggle("over", remaining < 0);
    (bar.firstElementChild as HTMLElement).style.width = `${Math.min(100, (total / target) * 100)}%`;
  } else {
    $("logTarget").textContent = "Set a daily target below to see what's left.";
    left.hidden = true;
    bar.hidden = true;
  }

  $("logAvg").hidden = avg === null;
  if (avg) $("logAvg").textContent = `Average over the previous 7 days: ${kcalStr(avg.kcal)} kcal (${avg.days} day${avg.days === 1 ? "" : "s"} logged)`;

  const meals = $("logMeals");
  meals.replaceChildren();
  for (const meal of MEALS) {
    const mine = items.filter((i) => i.meal === meal.id);
    if (!mine.length) continue;
    const group = document.createElement("div");
    group.className = "meal";
    const head = document.createElement("div");
    head.className = "meal-head";
    const h = document.createElement("h3");
    h.textContent = meal.label;
    const sub = document.createElement("span");
    sub.className = "num";
    sub.textContent = `${kcalStr(mine.reduce((s, i) => s + i.kcal, 0))} kcal`;
    head.append(h, sub);
    group.append(head);

    for (const item of mine) {
      const row = document.createElement("div");
      row.className = "log-row";
      const what = document.createElement("div");
      what.className = "log-what";
      const name = document.createElement("span");
      name.className = "food-name";
      name.textContent = item.name;
      const meta = document.createElement("span");
      meta.className = "food-meta";
      meta.textContent = [item.brand, formatAmount(item.amount, item.unit)].filter(Boolean).join(" · ");
      what.append(name, meta);
      const kcal = document.createElement("span");
      kcal.className = "log-kcal num";
      kcal.textContent = kcalStr(item.kcal);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "ghost danger";
      del.textContent = "Delete";
      del.addEventListener("click", () => onDelete(item, del));
      row.append(what, kcal, del);
      group.append(row);
    }
    meals.append(group);
  }
  const empty = $("logEmpty");
  empty.hidden = items.length > 0;
  empty.textContent = `Nothing logged for ${label}. Find a food below, then tap Add.`;
}

// ---------- actions ----------

async function load() {
  items = await getLog(day);
  const before = await getLog(shiftDay(day, -7), shiftDay(day, -1));
  const perDay = new Map<string, number>();
  for (const i of before) perDay.set(i.date, (perDay.get(i.date) ?? 0) + i.kcal);
  avg = perDay.size ? { kcal: [...perDay.values()].reduce((a, b) => a + b) / perDay.size, days: perDay.size } : null;
  render();
}

async function goTo(d: string) {
  day = d > todayStr() ? todayStr() : d;
  await load();
  document.dispatchEvent(new CustomEvent("logdaychange"));
}

async function onDelete(item: LogItem, btn: HTMLButtonElement) {
  if (!btn.classList.contains("armed")) {
    btn.classList.add("armed");
    btn.textContent = "Confirm";
    setTimeout(() => {
      btn.classList.remove("armed");
      btn.textContent = "Delete";
    }, 3000);
    return;
  }
  await deleteLogItem(item.id);
  await load();
}

export async function initFoodLog(): Promise<void> {
  $("dayPrev").addEventListener("click", () => goTo(shiftDay(day, -1)));
  $("dayNext").addEventListener("click", () => goTo(shiftDay(day, 1)));
  $("dayToday").addEventListener("click", () => goTo(todayStr()));

  // Coming back to the app on a later day should open on the new today.
  let lastToday = todayStr();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && todayStr() !== lastToday) {
      if (day === lastToday) goTo(todayStr());
      lastToday = todayStr();
    }
  });

  $<HTMLFormElement>("targetForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const raw = $<HTMLInputElement>("tKcal").value.trim();
    const value = raw === "" ? null : Math.round(parseFloat(raw));
    if (value !== null && !(value > 0)) return;
    target = (await saveSettings({ kcalTarget: value })).kcalTarget;
    render();
  });

  target = (await getSettings()).kcalTarget;
  $<HTMLInputElement>("tKcal").value = target === null ? "" : String(target);
  await load();
}
