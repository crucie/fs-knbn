import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let client = null;
let available = false;

export function getRedis() {
  return client;
}

export function isRedisReady() {
  return available && !!client;
}

export async function connectRedis() {
  if (client) {
    try {
      client.removeAllListeners();
      client.disconnect();
    } catch {
      /* ignore */
    }
    client = null;
    available = false;
  }

  client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 2,
    connectTimeout: 4000,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 6) return null;
      return Math.min(200 * times, 2000);
    },
  });

  client.on("ready", () => {
    available = true;
  });
  client.on("close", () => {
    available = false;
  });
  client.on("end", () => {
    available = false;
  });
  client.on("error", (err) => {
    available = false;
    if (process.env.NODE_ENV !== "production") {
      // keep quiet after first warn — errors spam otherwise
      if (!client.__warned) {
        client.__warned = true;
        console.warn("[fs-knbn] Redis error:", err.message);
      }
    }
  });

  try {
    await client.connect();
    const pong = await client.ping();
    if (pong === "PONG") {
      available = true;
      console.log("[fs-knbn] Redis connected.");
    }
  } catch (err) {
    available = false;
    console.warn("[fs-knbn] Redis unavailable — using memory cache:", err.message);
  }

  return client;
}

export async function disconnectRedis() {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
  }
  client = null;
  available = false;
}
