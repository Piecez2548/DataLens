// After a deploy, a tab still running the previous build can request a lazy
// chunk (the charts) whose hashed file no longer exists. Reloading picks up the
// new build; one reload per window keeps a genuinely broken chunk from looping.
const RELOAD_KEY = "datalens-stale-chunk-reload";
const RELOAD_WINDOW_MS = 30_000;

export function installStaleChunkReload(
  reload: () => void = () => window.location.reload(),
  storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage,
  now: () => number = Date.now,
): () => void {
  const onPreloadError = (event: Event) => {
    let last = 0;
    try { last = Number(storage.getItem(RELOAD_KEY)) || 0; } catch { /* Storage blocked: fall through once. */ }
    if (now() - last < RELOAD_WINDOW_MS) return;
    try { storage.setItem(RELOAD_KEY, String(now())); } catch { /* Best effort. */ }
    event.preventDefault();
    reload();
  };
  window.addEventListener("vite:preloadError", onPreloadError);
  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}
