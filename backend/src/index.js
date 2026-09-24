import "dotenv/config";
import app from "./app.js";
import prisma from "./config/prisma.js";
import { bootstrapBoardColumns } from "./db/bootstrapColumns.js";
import { bootstrapSpecDomain } from "./db/bootstrapSpecDomain.js";
import { connectRedis } from "./config/redis.js";
import { startTeamRedisBridge } from "./utils/teamBus.js";
import { startGithubSyncCron } from "./services/githubSync.service.js";

const PORT = process.env.PORT || 3000;

function requireEnv(name) {
  if (!process.env[name]) {
    console.error(`[fs-knbn] Missing required env: ${name}`);
    process.exit(1);
  }
}

requireEnv("DATABASE_URL");
requireEnv("JWT_SECRET");
if (process.env.NODE_ENV === "production") {
  requireEnv("GOOGLE_CLIENT_ID");
}

prisma
  .$connect()
  .then(() => bootstrapBoardColumns(prisma))
  .then(() => bootstrapSpecDomain(prisma))
  .then(() => connectRedis())
  .then(() => {
    startTeamRedisBridge();
    startGithubSyncCron();
    console.log("[fs-knbn] Database connected.");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[fs-knbn] Server running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[fs-knbn] Database connection failed:", err.message);
    process.exit(1);
  });
