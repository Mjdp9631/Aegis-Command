// Keep rapid UI refresh signals from turning into duplicate Supabase downloads.
// This is an in-memory, per-tab snapshot only: it never writes application data
// to localStorage and is invalidated whenever Aegis announces a data change.
(() => {
  const snapshots = new Map();
  // Whole-page views share broad datasets. A one-and-a-half-second cache was
  // effectively no cache at all once Realtime and local mutation events began
  // firing. Keep settled snapshots for a short working window and coalesce
  // invalidations instead of downloading every dataset again for every event.
  const DEFAULT_TTL_MS = 120000;
  const MIN_REFETCH_INTERVAL_MS = 30000;

  function run(key, loader, { ttl = DEFAULT_TTL_MS } = {}) {
    const existing = snapshots.get(key);
    const now = Date.now();
    if (existing?.promise) return existing.promise;
    const hasValue = existing && Object.prototype.hasOwnProperty.call(existing, "value");
    const fresh = hasValue && now - existing.loadedAt < ttl;
    const recentlyFetched = hasValue && now - existing.loadedAt < MIN_REFETCH_INTERVAL_MS;
    if (fresh && (!existing.invalidatedAt || recentlyFetched)) {
      return Promise.resolve(existing.value);
    }

    const promise = Promise.resolve()
      .then(loader)
      .then((value) => {
        snapshots.set(key, { value, loadedAt: Date.now(), invalidatedAt: 0 });
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
    const mark = (snapshot) => {
      if (snapshot) snapshot.invalidatedAt = Date.now();
    };
    if (key) {
      mark(snapshots.get(key));
      return;
    }
    snapshots.forEach(mark);
  }

  window.AEGIS_DATA_GUARD = { run, invalidate };

  // Feature modules still schedule their normal UI refresh after a change.
  // Marking rather than deleting their snapshots means one operation write
  // cannot turn into a fan-out of repeated whole-database downloads.
  ["aegis:data-changed", "aegis:missions-changed", "aegis:operations-changed", "aegis:mastery-changed", "aegis:accounts-changed"].forEach((eventName) => {
    window.addEventListener(eventName, () => invalidate());
  });
  window.addEventListener("online", () => invalidate());
})();
