import api from "./api";

const STORAGE_KEY = "fs-knbn:qc";
const store = new Map();
const inflight = new Map();
const DEFAULT_TTL = 60_000;
const STALE_TTL = 5 * 60_000;

function hydrate() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw);
    const now = Date.now();
    for (const [k, v] of entries) {
      if (v?.staleUntil && now < v.staleUntil) store.set(k, v);
    }
  } catch {
    /* ignore corrupt cache */
  }
}

function persist() {
  try {
    const now = Date.now();
    const entries = [];
    for (const [k, v] of store) {
      if (v?.staleUntil && now < v.staleUntil) entries.push([k, v]);
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 40)));
  } catch {
    /* quota / private mode */
  }
}

hydrate();

function readEntry(key) {
  return store.get(key) || null;
}

export function cachePeek(key) {
  const hit = readEntry(key);
  if (!hit) return null;
  return hit.data;
}

export function cacheSet(key, data, ttl = DEFAULT_TTL) {
  store.set(key, {
    data,
    freshUntil: Date.now() + ttl,
    staleUntil: Date.now() + STALE_TTL,
  });
  persist();
}

export function cacheInvalidate(prefix = "") {
  if (!prefix) {
    store.clear();
  } else {
    for (const k of store.keys()) {
      if (k.startsWith(prefix)) store.delete(k);
    }
  }
  persist();
}

function cacheKey(url, params) {
  return params ? `${url}?${JSON.stringify(params)}` : url;
}

/**
 * Stale-while-revalidate GET:
 * - returns cached data immediately when present
 * - refreshes in background when stale/expired
 */
export async function cachedGet(url, { ttl = DEFAULT_TTL, params, force = false } = {}) {
  const key = cacheKey(url, params);
  const hit = readEntry(key);
  const now = Date.now();

  if (!force && hit && now < hit.freshUntil) {
    return hit.data;
  }

  if (!force && hit && now < hit.staleUntil) {
    if (!inflight.has(key)) {
      const bg = api
        .get(url, { params })
        .then((res) => {
          cacheSet(key, res, ttl);
          inflight.delete(key);
          return res;
        })
        .catch((err) => {
          inflight.delete(key);
          throw err;
        });
      inflight.set(key, bg);
    }
    return hit.data;
  }

  if (inflight.has(key)) return inflight.get(key);

  const req = api
    .get(url, { params })
    .then((res) => {
      cacheSet(key, res, ttl);
      inflight.delete(key);
      return res;
    })
    .catch((err) => {
      inflight.delete(key);
      if (hit) return hit.data;
      throw err;
    });

  inflight.set(key, req);
  return req;
}

export function prefetchProject(projectId) {
  if (!projectId || !localStorage.getItem("token")) return;
  cachedGet(`/projects/${projectId}`, { ttl: 45_000 })
    .then(() => prefetchTeam(projectId))
    .catch(() => {});
}

/** Prefetch Team channels + default channel messages into client cache (Redis-backed API). */
export function prefetchTeam(projectId) {
  if (!projectId || !localStorage.getItem("token")) return;
  cachedGet(`/projects/${projectId}/channels`, { ttl: 120_000 })
    .then((res) => {
      const list = res?.data?.data || [];
      list
        .filter((c) => !c.isDm)
        .slice(0, 6)
        .forEach((c) => {
          cachedGet(`/projects/${projectId}/channels/${c.id}/messages`, {
            ttl: 90_000,
          }).catch(() => {});
        });
    })
    .catch(() => {});
}

export function warmCache() {
  if (!localStorage.getItem("token")) return;
  cachedGet("/projects", { ttl: 45_000 })
    .then(({ data }) => {
      const list = data?.data || [];
      list.slice(0, 6).forEach((p) => prefetchProject(p.id));
    })
    .catch(() => {});
}
