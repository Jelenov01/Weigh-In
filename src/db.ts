import { openDB, type DBSchema } from "idb";

export type Unit = "lb" | "kg";

export interface Entry {
  date: string; // YYYY-MM-DD, local
  kg: number;
  note: string;
  at: number; // last-modified epoch ms
}

export interface Settings {
  unit: Unit;
  goalKg: number | null;
}

export type AmountUnit = "serving" | "g" | "oz" | "ml";

export interface Food {
  id: string; // Open Food Facts barcode, or "custom-<ts>" for foods entered by hand
  name: string;
  brand: string;
  kcal100: number | null; // per 100 g (or 100 ml for drinks)
  kcalServing: number | null;
  servingLabel: string; // as printed on the label, e.g. "1 cup (227 g)"
  servingGrams: number | null;
  source: "off" | "custom";
  lastAmount: number;
  lastUnit: AmountUnit;
  lastUsed: number;
  uses: number;
}

interface WeighInDB extends DBSchema {
  entries: { key: string; value: Entry };
  settings: { key: string; value: Settings };
  foods: { key: string; value: Food };
}

const DEFAULT_SETTINGS: Settings = { unit: "lb", goalKg: null };

const dbPromise = openDB<WeighInDB>("weigh-in", 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore("entries", { keyPath: "date" });
      db.createObjectStore("settings");
    }
    if (oldVersion < 2) db.createObjectStore("foods", { keyPath: "id" });
  },
});

// Ask the browser not to evict our data under storage pressure. Best effort.
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}

/** All entries, sorted by date ascending (the key order). */
export async function getEntries(): Promise<Entry[]> {
  return (await dbPromise).getAll("entries");
}

export async function putEntry(entry: Entry): Promise<void> {
  await (await dbPromise).put("entries", entry);
}

export async function putEntries(entries: Entry[]): Promise<void> {
  const tx = (await dbPromise).transaction("entries", "readwrite");
  await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done]);
}

export async function deleteEntry(date: string): Promise<void> {
  await (await dbPromise).delete("entries", date);
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await (await dbPromise).get("settings", "app")) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await dbPromise).put("settings", settings, "app");
}

/** Saved foods, most recently used first. */
export async function getFoods(): Promise<Food[]> {
  const foods = await (await dbPromise).getAll("foods");
  return foods.sort((a, b) => b.lastUsed - a.lastUsed);
}

export async function putFood(food: Food): Promise<void> {
  await (await dbPromise).put("foods", food);
}

export async function deleteFood(id: string): Promise<void> {
  await (await dbPromise).delete("foods", id);
}
