import { registerSW } from "virtual:pwa-register";

// A new version applies immediately if it arrives within this long of the app opening or
// coming back to the foreground. Later than that, the person may be mid-task, so we ask first.
const FRESH_MS = 15_000;
const HOURLY = 60 * 60 * 1000;

let shownAt = Date.now();
let pending = false;

const isTyping = () => {
  const a = document.activeElement;
  return a instanceof HTMLInputElement || a instanceof HTMLSelectElement || a instanceof HTMLTextAreaElement;
};

export function initPwa(): void {
  if (!("serviceWorker" in navigator)) return;
  const bar = document.getElementById("updateBar")!;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true;
      if (Date.now() - shownAt < FRESH_MS && !isTyping()) updateSW(true);
      else bar.hidden = false;
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => reg.update().catch(() => {});
      // Installed apps are often resumed rather than relaunched, so check on every return to the foreground.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        shownAt = Date.now();
        if (pending && !isTyping()) updateSW(true);
        else check();
      });
      setInterval(check, HOURLY);
    },
  });

  document.getElementById("updateBtn")!.addEventListener("click", () => updateSW(true));
}
