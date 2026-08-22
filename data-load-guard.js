// Keep rapid UI refresh signals from turning into duplicate Supabase downloads.
// This is an in-memory, per-tab snapshot only: it never writes application data
// to localStorage and is invalidated whenever Aegis announces a data change.
(() => {
  const snapshots = new Map();
  const DEFAULT_TTL_MS = 1500;

  function run(key, loader, { ttl = DEFAULT_TTL_MS } = {}) {
    const existing = snapshots.get(key);
    const now = Date.now();
    if (existing?.promise) return existing.promise;
    if (existing && Object.prototype.hasOwnProperty.call(existing, "value") && now - existing.loadedAt < ttl) {
      return Promise.resolve(existing.value);
    }

    const promise = Promise.resolve()
      .then(loader)
      .then((value) => {
        snapshots.set(key, { value, loadedAt: Date.now() });
        return value;
      })
      .catch((error) => {
        snapshots.delete(key);
        throw error;
      });
    snapshots.set(key, { promise });
    return promise;
  }

  function invalidate(key) {
    if (key) snapshots.delete(key);
    else snapshots.clear();
  }

  window.AEGIS_DATA_GUARD = { run, invalidate };

  // Mutations and remote relays must always fetch a fresh snapshot. These
  // listeners are registered before feature modules, so their scheduled reloads
  // cannot accidentally reuse data from before the event.
  ["aegis:data-changed", "aegis:missions-changed", "aegis:operations-changed", "aegis:mastery-changed", "aegis:accounts-changed"].forEach((eventName) => {
    window.addEventListener(eventName, () => invalidate());
  });
  window.addEventListener("online", () => invalidate());
})();
