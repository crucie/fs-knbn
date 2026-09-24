import { EventEmitter } from "events";
import { getRedis, isRedisReady } from "../config/redis.js";

const localBus = new EventEmitter();
localBus.setMaxListeners(200);

const CHANNEL = "fs-knbn:team";

/** Publish a live team event to all SSE subscribers (Redis if available). */
export function publishTeamEvent(projectId, event) {
  const payload = { projectId, ...event, at: Date.now() };
  localBus.emit(`project:${projectId}`, payload);

  if (isRedisReady()) {
    try {
      getRedis().publish(CHANNEL, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }
}

export function subscribeTeamProject(projectId, handler) {
  const key = `project:${projectId}`;
  localBus.on(key, handler);
  return () => localBus.off(key, handler);
}

let redisSubStarted = false;

/** Fan-in Redis pub/sub into the local bus (multi-instance). */
export function startTeamRedisBridge() {
  if (redisSubStarted || !isRedisReady()) return;
  redisSubStarted = true;
  try {
    const sub = getRedis().duplicate();
    sub.subscribe(CHANNEL);
    sub.on("message", (_ch, raw) => {
      try {
        const payload = JSON.parse(raw);
        if (payload?.projectId) {
          localBus.emit(`project:${payload.projectId}`, payload);
        }
      } catch {
        /* ignore */
      }
    });
  } catch {
    redisSubStarted = false;
  }
}
