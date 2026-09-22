import { randomUUID } from "crypto";

/**
 * Migrates legacy schema → Workspace / new Role / TaskAssignee / etc.
 * Safe to run on every startup (idempotent where possible).
 */
export async function bootstrapSpecDomain(prisma) {
  // Role enum migration is handled once via ops script / db push.
  // Avoid creating leftover Role_new types on every boot.

  // --- ProjectType enum ---
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "ProjectType" AS ENUM ('GENERIC', 'GITHUB_LINKED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  } catch {
    /* ignore */
  }

  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  } catch {
    /* ignore */
  }

  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "BountyStatus" AS ENUM (
          'DRAFT','FUNDED','CLAIMED','IN_REVIEW','APPROVED','DISPUTED','RELEASED','REFUNDED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  } catch {
    /* ignore */
  }

  // --- User columns ---
  await safeAlter(prisma, `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT`);
  await safeAlter(prisma, `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "walletAddress" TEXT`);

  // --- Workspace tables ---
  await safeAlter(
    prisma,
    `
    CREATE TABLE IF NOT EXISTS "Workspace" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "planTier" "PlanTier" NOT NULL DEFAULT 'FREE',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE
    )
  `
  );
  await safeAlter(
    prisma,
    `
    CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
      "id" TEXT PRIMARY KEY,
      "role" "Role" NOT NULL DEFAULT 'CONTRIBUTOR',
      "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      UNIQUE ("userId", "workspaceId")
    )
  `
  );

  // --- Project workspace / type / createdBy ---
  await safeAlter(prisma, `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT`);
  await safeAlter(
    prisma,
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "type" "ProjectType" NOT NULL DEFAULT 'GENERIC'`
  );
  await safeAlter(prisma, `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "createdById" TEXT`);

  // Backfill workspaces for projects missing workspaceId
  const orphanProjects = await prisma.$queryRawUnsafe(`
    SELECT p."id", p."title"
    FROM "Project" p
    WHERE p."workspaceId" IS NULL
  `);

  for (const p of orphanProjects || []) {
    const admin = await prisma.$queryRawUnsafe(
      `
      SELECT "userId" FROM "ProjectMember"
      WHERE "projectId" = $1 AND ("role"::text = 'OWNER' OR "role"::text = 'ADMIN')
      ORDER BY "joinedAt" ASC LIMIT 1
    `,
      p.id
    );
    let ownerId = admin?.[0]?.userId;
    if (!ownerId) {
      const any = await prisma.$queryRawUnsafe(
        `SELECT "userId" FROM "ProjectMember" WHERE "projectId" = $1 LIMIT 1`,
        p.id
      );
      ownerId = any?.[0]?.userId;
    }
    if (!ownerId) continue;

    const wsId = randomUUID();
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "Workspace" ("id", "name", "planTier", "createdAt", "ownerId")
      VALUES ($1, $2, 'FREE', CURRENT_TIMESTAMP, $3)
    `,
      wsId,
      "Personal",
      ownerId
    );
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "WorkspaceMember" ("id", "role", "joinedAt", "workspaceId", "userId")
      VALUES ($1, 'OWNER', CURRENT_TIMESTAMP, $2, $3)
      ON CONFLICT DO NOTHING
    `,
      randomUUID(),
      wsId,
      ownerId
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "Project" SET "workspaceId" = $1, "createdById" = COALESCE("createdById", $2) WHERE "id" = $3`,
      wsId,
      ownerId,
      p.id
    );
  }

  // Ensure every user has at least one personal workspace
  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  for (const u of users) {
    const existing = await prisma.workspace.findFirst({ where: { ownerId: u.id } });
    if (existing) continue;
    await prisma.workspace.create({
      data: {
        name: "Personal",
        ownerId: u.id,
        members: { create: { userId: u.id, role: "OWNER" } },
      },
    });
  }

  // FK for Project.workspaceId (after backfill)
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Project" ALTER COLUMN "workspaceId" SET NOT NULL
    `);
  } catch {
    /* may already be set or still nulls */
  }
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Project"
          ADD CONSTRAINT "Project_workspaceId_fkey"
          FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  } catch {
    /* ignore */
  }

  // --- BoardColumn.isLocked ---
  await safeAlter(
    prisma,
    `ALTER TABLE "BoardColumn" ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false`
  );

  // --- Task: externalLink, updatedAt, githubClosedPending; migrate assignees ---
  await safeAlter(prisma, `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "externalLink" JSONB`);
  await safeAlter(
    prisma,
    `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "githubClosedPending" BOOLEAN NOT NULL DEFAULT false`
  );
  await safeAlter(
    prisma,
    `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`
  );

  await safeAlter(
    prisma,
    `
    CREATE TABLE IF NOT EXISTS "TaskAssignee" (
      "taskId" TEXT NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      PRIMARY KEY ("taskId", "userId")
    )
  `
  );

  // Migrate assignedToId → TaskAssignee
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "TaskAssignee" ("taskId", "userId")
      SELECT "id", "assignedToId" FROM "Task"
      WHERE "assignedToId" IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
  } catch {
    /* column may already be dropped */
  }

  // Drop legacy assignedToId if present
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_assignedToId_fkey"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Task" DROP COLUMN IF EXISTS "assignedToId"`);
  } catch {
    /* ignore */
  }

  // --- Github tables ---
  await safeAlter(
    prisma,
    `
    CREATE TABLE IF NOT EXISTS "GithubIdentity" (
      "id" TEXT PRIMARY KEY,
      "githubUserId" TEXT NOT NULL,
      "githubLogin" TEXT NOT NULL,
      "accessTokenEnc" TEXT NOT NULL,
      "refreshTokenEnc" TEXT,
      "tokenExpiresAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE
    )
  `
  );
  await safeAlter(
    prisma,
    `
    CREATE TABLE IF NOT EXISTS "GithubConnection" (
      "id" TEXT PRIMARY KEY,
      "installationId" TEXT NOT NULL,
      "repoOwner" TEXT NOT NULL,
      "repoName" TEXT NOT NULL,
      "syncIssues" BOOLEAN NOT NULL DEFAULT true,
      "syncProjectsV2" BOOLEAN NOT NULL DEFAULT false,
      "lastSyncedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "projectId" TEXT NOT NULL UNIQUE REFERENCES "Project"("id") ON DELETE CASCADE
    )
  `
  );

  // --- Bounty + ledger ---
  await safeAlter(
    prisma,
    `
    CREATE TABLE IF NOT EXISTS "Bounty" (
      "id" TEXT PRIMARY KEY,
      "amount" DECIMAL(18,8) NOT NULL,
      "tokenSymbol" TEXT NOT NULL DEFAULT 'USD',
      "chain" TEXT NOT NULL DEFAULT 'CUSTODIAL',
      "status" "BountyStatus" NOT NULL DEFAULT 'DRAFT',
      "escrowContractAddress" TEXT,
      "fundTxHash" TEXT,
      "releaseTxHash" TEXT,
      "submission" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "cardId" TEXT NOT NULL UNIQUE REFERENCES "Task"("id") ON DELETE CASCADE,
      "funderId" TEXT NOT NULL REFERENCES "User"("id"),
      "claimantId" TEXT REFERENCES "User"("id") ON DELETE SET NULL
    )
  `
  );
  await safeAlter(
    prisma,
    `
    CREATE TABLE IF NOT EXISTS "BountyEvent" (
      "id" TEXT PRIMARY KEY,
      "type" TEXT NOT NULL,
      "txHash" TEXT,
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "bountyId" TEXT NOT NULL REFERENCES "Bounty"("id") ON DELETE CASCADE,
      "actorId" TEXT NOT NULL REFERENCES "User"("id")
    )
  `
  );
  await safeAlter(
    prisma,
    `
    CREATE TABLE IF NOT EXISTS "LedgerEntry" (
      "id" TEXT PRIMARY KEY,
      "amount" DECIMAL(18,8) NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'USD',
      "refType" TEXT NOT NULL,
      "refId" TEXT,
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE
    )
  `
  );

  console.log("[fs-knbn] Spec domain bootstrap ready.");
}

async function safeAlter(prisma, sql) {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (err) {
    // ignore already-exists / type conflicts during iterative bootstraps
    if (!/already exists|duplicate/i.test(err.message)) {
      console.warn("[fs-knbn] bootstrap SQL:", err.message.slice(0, 160));
    }
  }
}
