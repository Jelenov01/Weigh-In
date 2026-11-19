# Weigh-In

An installable weight-loss tracker (PWA). Log daily weigh-ins, see a smoothed trend line, track progress toward a goal, and get a projected goal date. Works offline. All data stays on the device in IndexedDB.

## Run locally

```sh
npm install
npm run dev        # dev server with hot reload
npm run build      # type-check and build to dist/
npm run preview    # serve the build on your LAN (needed to test install + offline)
```

Icons are generated from `public/icon.svg` with `npm run icons`. Rerun it if you change the SVG.

## Install on your phone

Browsers only allow installing over HTTPS, so deploy it first. This repo includes a GitHub Pages workflow:

1. Push to a GitHub repo on the `main` branch.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open the published URL on your phone:
   - **iPhone (Safari):** Share → Add to Home Screen
   - **Android (Chrome):** menu → Install app

## Data

- Stored per device and per browser. Your phone and your computer keep separate logs.
- **Export CSV** saves a backup. **Import CSV** restores one; entries with the same date are replaced.
- CSV format: `date,weight_kg,note`

## Calories

The **Calories** tab looks up foods on [Open Food Facts](https://world.openfoodfacts.org), a free, open food database, and works out calories for an amount in servings, grams, ounces or ml.

- Any food you pick is saved on the device. Typing in the search box filters your saved foods instantly, including offline.
- Each saved food remembers the last amount and unit you used.
- If a food isn't in the database, add it yourself with calories per serving or per 100 g.
- Saved foods are not included in the CSV export.

## How the numbers work

- **Trend weight:** an exponentially smoothed average. Each weigh-in moves the trend 10% of the way toward it, which filters out daily water swings.
- **Rate per week:** least-squares slope of the trend over the last 28 days.
- **Projected goal date:** distance from trend to goal divided by the current rate.
