type Listener = () => void;

const listeners = new Set<Listener>();
let queued = false;
let loadRequest: boolean | null = null;

function readLoadRequest() {
  if (loadRequest !== null) return;
  if (typeof window === "undefined") {
    loadRequest = false;
    return;
  }
  const url = new URL(window.location.href);
  loadRequest = url.searchParams.get("autoscan") === "1";
  if (!loadRequest) return;
  url.searchParams.delete("autoscan");
  const query = url.searchParams.toString();
  const hash = url.hash || "#map";
  window.history.replaceState(null, "", `${url.pathname}${query ? `?${query}` : ""}${hash}`);
}

/** This page load asked to fly to an unscanned area. Stays true until cleared. */
export function peekAutoscanOnLoad() {
  readLoadRequest();
  return loadRequest === true;
}

export function clearAutoscanOnLoad() {
  loadRequest = false;
}

/** Ask the map to fly to an unscanned area and scan it. Queues if the map is not mounted yet. */
export function requestAutoScan() {
  if (listeners.size === 0) {
    queued = true;
    return;
  }
  for (const listener of listeners) listener();
}

export function consumeQueuedAutoScan() {
  const was = queued;
  queued = false;
  return was;
}

export function onAutoScan(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
