import { deleteFood, getFoods, putFood, type AmountUnit, type Food } from "./db";
import { availableUnits, calories, describeFood, newFood, searchFoods, UNIT_LABELS } from "./food";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let saved: Food[] = [];
let results: Food[] = [];
let selected: Food | null = null;
let searchAbort: AbortController | null = null;
let saveTimer = 0;

const msg = (text: string) => ($("foodMsg").textContent = text);

/** True when every word of the query appears in the food's name or brand. */
function matches(f: Food, query: string): boolean {
  const hay = `${f.name} ${f.brand}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

// ---------- rendering ----------

function foodItem(f: Food, onPick: () => void, extra?: HTMLElement): HTMLLIElement {
  const li = document.createElement("li");
  li.classList.toggle("active", selected?.id === f.id);
  const pick = document.createElement("button");
  pick.type = "button";
  pick.className = "food-pick";
  const name = document.createElement("span");
  name.className = "food-name";
  name.textContent = f.name;
  const meta = document.createElement("span");
  meta.className = "food-meta";
  meta.textContent = [f.brand, describeFood(f)].filter(Boolean).join(" · ");
  pick.append(name, meta);
  pick.addEventListener("click", onPick);
  li.append(pick);
  if (extra) li.append(extra);
  return li;
}

function renderSaved() {
  const query = `${$<HTMLInputElement>("qName").value} ${$<HTMLInputElement>("qBrand").value}`.trim();
  const list = query ? saved.filter((f) => matches(f, query)) : saved;
  $("savedList").replaceChildren(
    ...list.map((f) => {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "ghost danger";
      del.textContent = "Delete";
      del.addEventListener("click", () => onDelete(f, del));
      return foodItem(f, () => select(f), del);
    }),
  );
  const empty = $("savedEmpty");
  empty.hidden = list.length > 0;
  empty.textContent = saved.length && query ? "No saved foods match. Search online to find it." : "Foods you look up are saved here so you can find them again quickly.";
}

function renderResults() {
  $("resultList").replaceChildren(...results.map((f) => foodItem(f, () => select(f))));
  $("resultsEmpty").hidden = results.length > 0;
}

function renderCalc() {
  $("calcEmpty").hidden = selected !== null;
  $("calcBody").hidden = selected === null;
  if (!selected) return;

  $("cName").textContent = selected.name;
  $("cBrand").textContent = selected.brand || (selected.source === "custom" ? "Added by you" : "");
  $("cBasis").textContent = `Label: ${describeFood(selected)}`;

  const unitSel = $<HTMLSelectElement>("cUnit");
  const units = availableUnits(selected);
  unitSel.replaceChildren(...units.map((u) => new Option(UNIT_LABELS[u], u)));
  unitSel.value = selected.lastUnit;
  $<HTMLInputElement>("cAmount").value = String(selected.lastAmount);
  updateResult();
}

function updateResult() {
  if (!selected) return;
  const amount = parseFloat($<HTMLInputElement>("cAmount").value);
  const unit = $<HTMLSelectElement>("cUnit").value as AmountUnit;
  const kcal = calories(selected, amount, unit);
  $("cResult").textContent = kcal === null ? "—" : String(Math.round(kcal));
  $("cNote").textContent =
    unit === "ml" ? "For drinks the label is per 100 ml. For other foods, 1 ml is counted as 1 g." : unit === "serving" && selected.servingLabel ? `1 serving = ${selected.servingLabel}` : "";
}

// ---------- actions ----------

async function reloadSaved() {
  saved = await getFoods();
  renderSaved();
}

/** Select a food for the calculator. Picking a food saves it (or bumps it to the top of the saved list). */
async function select(f: Food) {
  const existing = saved.find((s) => s.id === f.id);
  const food: Food = { ...(existing ?? f), lastUsed: Date.now(), uses: (existing?.uses ?? 0) + 1 };
  if (!availableUnits(food).includes(food.lastUnit)) food.lastUnit = availableUnits(food)[0];
  selected = food;
  renderCalc();
  renderResults();
  await putFood(food);
  await reloadSaved();
  if (window.matchMedia("(max-width: 720px)").matches) $("calcCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Remember the last amount and unit for this food, once typing pauses. */
function rememberAmount() {
  if (!selected) return;
  const amount = parseFloat($<HTMLInputElement>("cAmount").value);
  if (!(amount >= 0)) return;
  selected = { ...selected, lastAmount: amount, lastUnit: $<HTMLSelectElement>("cUnit").value as AmountUnit };
  const food = selected;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    await putFood(food);
    saved = saved.map((s) => (s.id === food.id ? food : s));
  }, 600);
}

async function onDelete(f: Food, btn: HTMLButtonElement) {
  if (!btn.classList.contains("armed")) {
    btn.classList.add("armed");
    btn.textContent = "Confirm";
    setTimeout(() => {
      btn.classList.remove("armed");
      btn.textContent = "Delete";
    }, 3000);
    return;
  }
  await deleteFood(f.id);
  if (selected?.id === f.id) {
    selected = null;
    renderCalc();
  }
  msg(`Removed ${f.name} from saved foods.`);
  await reloadSaved();
}

async function onSearch(ev: SubmitEvent) {
  ev.preventDefault();
  const name = $<HTMLInputElement>("qName").value.trim();
  const brand = $<HTMLInputElement>("qBrand").value.trim();
  if (!name) return;
  if (!navigator.onLine) return msg("You're offline. Your saved foods still work; online search needs a connection.");

  searchAbort?.abort();
  searchAbort = new AbortController();
  const btn = $<HTMLButtonElement>("searchBtn");
  btn.disabled = true;
  msg("Searching Open Food Facts…");
  try {
    results = await searchFoods(name, brand, searchAbort.signal);
    $("resultsTitle").textContent = `Search results (${results.length})`;
    msg(results.length ? "Pick a result to see its calories. It's saved for next time." : "No matches. Try fewer words or a different spelling, or add the food yourself.");
    renderResults();
  } catch (e) {
    if ((e as Error).name !== "AbortError") msg(e instanceof TypeError ? "Couldn't reach Open Food Facts. Check your connection and try again." : (e as Error).message);
  } finally {
    btn.disabled = false;
  }
}

async function onManual(ev: SubmitEvent) {
  ev.preventDefault();
  const kcal = parseFloat($<HTMLInputElement>("mKcal").value);
  const grams = parseFloat($<HTMLInputElement>("mGrams").value);
  const perServing = $<HTMLSelectElement>("mPer").value === "serving";
  if (!(kcal >= 0)) return;
  const food = newFood({
    id: `custom-${Date.now()}`,
    name: $<HTMLInputElement>("mName").value.trim(),
    brand: $<HTMLInputElement>("mBrand").value.trim(),
    kcal100: perServing ? null : kcal,
    kcalServing: perServing ? kcal : null,
    servingLabel: grams > 0 ? `${grams} g` : "",
    servingGrams: grams > 0 ? grams : null,
    source: "custom",
  });
  ($("manualForm") as HTMLFormElement).reset();
  msg(`Saved ${food.name}.`);
  await select(food);
}

export async function initCalories(): Promise<void> {
  $<HTMLFormElement>("foodForm").addEventListener("submit", onSearch);
  $<HTMLFormElement>("manualForm").addEventListener("submit", onManual);
  $("qName").addEventListener("input", renderSaved);
  $("qBrand").addEventListener("input", renderSaved);
  $("cAmount").addEventListener("input", () => {
    updateResult();
    rememberAmount();
  });
  $("cUnit").addEventListener("change", () => {
    // Switching units resets to a typical amount (1 serving, or one serving's weight) rather than reusing a number that meant something else.
    const unit = $<HTMLSelectElement>("cUnit").value as AmountUnit;
    const grams = selected?.servingGrams ?? 100;
    $<HTMLInputElement>("cAmount").value = String(unit === "serving" ? 1 : unit === "oz" ? Math.round((grams / 28.3495) * 10) / 10 : grams);
    updateResult();
    rememberAmount();
  });
  renderResults();
  renderCalc();
  await reloadSaved();
}
