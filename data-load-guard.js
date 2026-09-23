// Keep rapid UI refresh signals from turning into duplicate Supabase downloads.
// This is an in-memory, per-tab snapshot only: it never writes application data
// to localStorage and is invalidated whenever Aegis announces a data change.
(() => {
  const snapshots = new Map();
  // Whole-page views share broad datasets. Keep settled snapshots for a
  // working window and coalesce invalidations instead of downloading every
  // dataset again for every Realtime, local, or auth refresh signal.
  const DEFAULT_TTL_MS = 300000;
  const MIN_REFETCH_INTERVAL_MS = 60000;
  const FAILURE_COOLDOWN_MS = 120000;

  function run(key, loader, { ttl = DEFAULT_TTL_MS } = {}) {
    const existing = snapshots.get(key);
    const now = Date.now();
    if (existing?.promise) return existing.promise;
    const hasValue = existing && Object.prototype.hasOwnProperty.call(existing, "value");
    // A transient Supabase/network error must not turn every mounted module
    // into an immediate retry loop. Preserve the last known-good view where
    // possible; otherwise fail fast until this short cooldown expires.
    if (existing?.retryAfter && now < existing.retryAfter) {
      if (hasValue) return Promise.resolve(existing.value);
      return Promise.reject(new Error("Cloud refresh is cooling down after a failed request. Please try again shortly."));
    }
    const fresh = hasValue && now - existing.loadedAt < ttl;
    const recentlyFetched = hasValue && now - existing.loadedAt < MIN_REFETCH_INTERVAL_MS;
    if (fresh && (!existing.invalidatedAt || recentlyFetched)) {
      return Promise.resolve(existing.value);
    }

    const staleValue = hasValue ? existing.value : undefined;
    const promise = Promise.resolve()
      .then(loader)
      .then((value) => {
        snapshots.set(key, { value, loadedAt: Date.now(), invalidatedAt: 0 });
        return value;
      })
      .catch((error) => {
        snapshots.set(key, {
          ...(hasValue ? { value: staleValue, loadedAt: existing.loadedAt, invalidatedAt: existing.invalidatedAt || now } : {}),
          retryAfter: Date.now() + FAILURE_COOLDOWN_MS,
        });
        throw error;
      });
    snapshots.set(key, { ...(hasValue ? existing : {}), promise });
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
