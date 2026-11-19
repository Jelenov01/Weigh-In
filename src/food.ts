import type { AmountUnit, Food } from "./db";

const G_PER_OZ = 28.3495;
const KJ_PER_KCAL = 4.184;

export const UNIT_LABELS: Record<AmountUnit, string> = {
  serving: "servings",
  g: "grams",
  oz: "ounces",
  ml: "ml",
};

/** Units this food's label data can convert from. */
export function availableUnits(f: Food): AmountUnit[] {
  const byWeight = f.kcal100 !== null || (f.kcalServing !== null && f.servingGrams !== null);
  const byServing = f.kcalServing !== null || (f.servingGrams !== null && f.kcal100 !== null);
  return [...(byServing ? (["serving"] as const) : []), ...(byWeight ? (["g", "oz", "ml"] as const) : [])];
}

/** Calories for an amount, or null when the label data can't convert that unit. ml is treated as grams. */
export function calories(f: Food, amount: number, unit: AmountUnit): number | null {
  if (!(amount >= 0)) return null;
  if (unit === "serving") {
    if (f.kcalServing !== null) return f.kcalServing * amount;
    if (f.servingGrams !== null && f.kcal100 !== null) return (f.kcal100 * f.servingGrams * amount) / 100;
    return null;
  }
  const grams = unit === "oz" ? amount * G_PER_OZ : amount;
  if (f.kcal100 !== null) return (f.kcal100 * grams) / 100;
  if (f.kcalServing !== null && f.servingGrams) return (f.kcalServing / f.servingGrams) * grams;
  return null;
}

/** One line describing the label values, e.g. "53 kcal / 100 g · 90 kcal / serving (170 g)". */
export function describeFood(f: Food): string {
  const parts: string[] = [];
  if (f.kcal100 !== null) parts.push(`${Math.round(f.kcal100)} kcal / 100 g`);
  if (f.kcalServing !== null) parts.push(`${Math.round(f.kcalServing)} kcal / serving${f.servingLabel ? ` (${f.servingLabel})` : ""}`);
  else if (f.servingGrams !== null && f.kcal100 !== null) parts.push(`serving ${f.servingLabel || `${f.servingGrams} g`}`);
  return parts.join(" · ");
}

export function newFood(fields: Pick<Food, "id" | "name" | "brand" | "kcal100" | "kcalServing" | "servingLabel" | "servingGrams" | "source">): Food {
  const f: Food = { ...fields, lastAmount: 1, lastUnit: "serving", lastUsed: Date.now(), uses: 0 };
  if (!availableUnits(f).includes("serving")) {
    f.lastAmount = 100;
    f.lastUnit = "g";
  }
  return f;
}

// ---------- Open Food Facts ----------

type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, unknown>;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
};

function toFood(p: OffProduct): Food | null {
  const name = p.product_name?.trim();
  const n = p.nutriments ?? {};
  if (!name || !p.code) return null;
  const kj100 = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
  const kjServing = num(n["energy-kj_serving"]) ?? num(n["energy_serving"]);
  const kcal100 = num(n["energy-kcal_100g"]) ?? (kj100 !== null ? kj100 / KJ_PER_KCAL : null);
  const kcalServing = num(n["energy-kcal_serving"]) ?? (kjServing !== null ? kjServing / KJ_PER_KCAL : null);
  if (kcal100 === null && kcalServing === null) return null;
  const servingGrams = num(p.serving_quantity);
  return newFood({
    id: p.code,
    name,
    brand: (p.brands ?? "").split(",")[0].trim(),
    kcal100,
    kcalServing,
    servingLabel: p.serving_size?.trim() ?? "",
    servingGrams: servingGrams ? servingGrams : null,
    source: "off",
  });
}

/** Search Open Food Facts. Products whose brand matches `brand` are listed first. */
export async function searchFoods(name: string, brand: string, signal?: AbortSignal): Promise<Food[]> {
  const params = new URLSearchParams({
    search_terms: [name, brand].filter(Boolean).join(" "),
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "30",
    fields: "code,product_name,brands,serving_size,serving_quantity,nutriments",
  });
  const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, { signal });
  if (!res.ok) throw new Error(`Food search failed (HTTP ${res.status}). Try again in a moment.`);
  const data = (await res.json()) as { products?: OffProduct[] };

  const seen = new Set<string>();
  const foods = (data.products ?? []).map(toFood).filter((f): f is Food => f !== null && !seen.has(f.id) && !!seen.add(f.id));
  const b = brand.trim().toLowerCase();
  if (b) foods.sort((x, y) => Number(y.brand.toLowerCase().includes(b)) - Number(x.brand.toLowerCase().includes(b)));
  return foods;
}
