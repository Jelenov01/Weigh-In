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
  kcalTarget: number | null;
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

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

/** One food eaten on one day. Name and calories are copied in, so deleting a saved food leaves the log intact. */
export interface LogItem {
  id: string;
  date: string; // YYYY-MM-DD, local
  meal: Meal;
  foodId: string;
  name: string;
  brand: string;
  amount: number;
  unit: AmountUnit;
  kcal: number;
  at: number;
}

interface WeighInDB extends DBSchema {
  entries: { key: string; value: Entry };
  settings: { key: string; value: Settings };
  foods: { key: string; value: Food };
  foodLog: { key: string; value: LogItem; indexes: { date: string } };
}

const DEFAULT_SETTINGS: Settings = { unit: "lb", goalKg: null, kcalTarget: null };

const dbPromise = openDB<WeighInDB>("weigh-in", 3, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore("entries", { keyPath: "date" });
      db.createObjectStore("settings");
    }
    if (oldVersion < 2) db.createObjectStore("foods", { keyPath: "id" });
    if (oldVersion < 3) db.createObjectStore("foodLog", { keyPath: "id" }).createIndex("date", "date");
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

/** Merge changes into the stored settings, so each tab only writes the fields it owns. */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const tx = (await dbPromise).transaction("settings", "readwrite");
  const next = { ...DEFAULT_SETTINGS, ...(await tx.store.get("app")), ...patch };
  await Promise.all([tx.store.put(next, "app"), tx.done]);
  return next;
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

/** Log items for dates from `from` to `to` inclusive, in the order they were added. */
export async function getLog(from: string, to: string = from): Promise<LogItem[]> {
  const items = await (await dbPromise).getAllFromIndex("foodLog", "date", IDBKeyRange.bound(from, to));
  return items.sort((a, b) => a.at - b.at);
}

export async function putLogItem(item: LogItem): Promise<void> {
  await (await dbPromise).put("foodLog", item);
}

export async function deleteLogItem(id: string): Promise<void> {
  await (await dbPromise).delete("foodLog", id);
}
