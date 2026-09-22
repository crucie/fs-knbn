import { getRedis, isRedisReady } from "../config/redis.js";

const DEFAULT_TTL = Number(process.env.REDIS_TTL_SECONDS || 45);

/** In-process fallback when Redis is down (dev / Docker Desktop flaps). */
const memory = new Map();

function memGet(k) {
  const hit = memory.get(k);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memory.delete(k);
    return null;
  }
  return hit.value;
}

function memSet(k, value, ttlSeconds) {
  memory.set(k, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  if (memory.size > 500) {
    const first = memory.keys().next().value;
    memory.delete(first);
  }
}

function memDel(...keys) {
  for (const k of keys) memory.delete(k);
}

function key(...parts) {
  return ["fs-knbn", ...parts].join(":");
}

export const cacheKeys = {
  userProjects: (userId) => key("projects", "user", userId),
  project: (projectId) => key("project", projectId),
  projectMembers: (projectId) => key("project", projectId, "members"),
  teamChannels: (projectId, userId) => key("team", projectId, "channels", userId),
  teamMessages: (channelId) => key("team", "messages", channelId),
};

export async function invalidateTeamChannels(projectId) {
  await cacheDelPattern(key("team", projectId, "channels", "*"));
}

export async function invalidateTeam(projectId, channelIds = []) {
  await invalidateTeamChannels(projectId);
  if (channelIds.length) {
    await cacheDel(...channelIds.map((id) => cacheKeys.teamMessages(id)));
  }
}

export async function cacheGet(k) {
  if (isRedisReady()) {
    try {
      const raw = await getRedis().get(k);
      if (raw) return JSON.parse(raw);
    } catch {
      /* fall through to memory */
    }
  }
  return memGet(k);
}

export async function cacheSet(k, value, ttlSeconds = DEFAULT_TTL) {
  memSet(k, value, ttlSeconds);
  if (!isRedisReady()) return false;
  try {
    await getRedis().set(k, JSON.stringify(value), "EX", ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function cacheDel(...keys) {
  memDel(...keys);
  if (!isRedisReady() || !keys.length) return;
  try {
    await getRedis().del(...keys);
  } catch {
    /* ignore */
  }
}

export async function cacheDelPattern(pattern) {
  const re = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
  for (const k of [...memory.keys()]) {
    if (re.test(k)) memory.delete(k);
  }
  if (!isRedisReady()) return;
  const redis = getRedis();
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
  } catch {
    /* ignore */
  }
}

/** Invalidate project board + all member project lists. */
export async function invalidateProject(projectId, memberUserIds = []) {
  const keys = [cacheKeys.project(projectId), cacheKeys.projectMembers(projectId)];
  for (const id of memberUserIds) keys.push(cacheKeys.userProjects(id));
  await cacheDel(...keys);
  if (!memberUserIds.length) {
    await cacheDelPattern(key("projects", "user", "*"));
  }
}

export async function invalidateUserProjects(userId) {
  await cacheDel(cacheKeys.userProjects(userId));
}
