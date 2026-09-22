import { randomUUID } from "crypto";

const DEFAULT_COLUMNS = [
  { name: "To Do", position: 0, color: "#888888" },
  { name: "In Progress", position: 1, color: "#aab4ff" },
  { name: "Done", position: 2, color: "#88cc88" },
];

/**
 * Migrates legacy Task.status enum boards to BoardColumn + Task.columnId.
 * Safe to run on every startup.
 */
export async function bootstrapBoardColumns(prisma) {
  // Ensure usernameSet exists for profile / onboarding flow
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "usernameSet" BOOLEAN NOT NULL DEFAULT true;
    `);
  } catch {
    /* ignore */
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BoardColumn" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "position" INTEGER NOT NULL,
      "color" TEXT NOT NULL DEFAULT '#888888',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "projectId" TEXT NOT NULL
    );
  `);

  // FK / index (ignore if already present)
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "BoardColumn"
      ADD CONSTRAINT "BoardColumn_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    `);
  } catch {
    /* already exists */
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "BoardColumn_projectId_position_idx"
      ON "BoardColumn"("projectId", "position");
    `);
  } catch {
    /* ignore */
  }

  const hasStatus = await prisma.$queryRawUnsafe(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Task' AND column_name = 'status'
    LIMIT 1;
  `);

  const hasColumnId = await prisma.$queryRawUnsafe(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Task' AND column_name = 'columnId'
    LIMIT 1;
  `);

  if (!hasColumnId.length) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN "columnId" TEXT;`);
  }

  const projects = await prisma.$queryRawUnsafe(`SELECT id FROM "Project"`);

  for (const project of projects) {
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id, name, position FROM "BoardColumn" WHERE "projectId" = $1 ORDER BY position ASC`,
      project.id
    );

    if (!existing.length) {
      for (const col of DEFAULT_COLUMNS) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "BoardColumn" (id, name, position, color, "createdAt", "projectId")
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)`,
          randomUUID(),
          col.name,
          col.position,
          col.color,
          project.id
        );
      }
    }

    const cols = await prisma.$queryRawUnsafe(
      `SELECT id, name, position FROM "BoardColumn" WHERE "projectId" = $1 ORDER BY position ASC`,
      project.id
    );

    if (hasStatus.length) {
      const byPos = Object.fromEntries(cols.map((c) => [c.position, c.id]));
      const todo = byPos[0] || cols[0]?.id;
      const inprog = byPos[1] || cols[1]?.id || todo;
      const done = byPos[2] || cols[2]?.id || todo;

      await prisma.$executeRawUnsafe(
        `UPDATE "Task" SET "columnId" = CASE status::text
           WHEN 'TODO' THEN $1
           WHEN 'IN_PROGRESS' THEN $2
           WHEN 'DONE' THEN $3
           ELSE $1
         END
         WHERE "projectId" = $4 AND ("columnId" IS NULL OR "columnId" = '')`,
        todo,
        inprog,
        done,
        project.id
      );
    } else {
      // Any orphan tasks without column → first column
      if (cols[0]) {
        await prisma.$executeRawUnsafe(
          `UPDATE "Task" SET "columnId" = $1
           WHERE "projectId" = $2 AND ("columnId" IS NULL OR "columnId" = '')`,
          cols[0].id,
          project.id
        );
      }
    }
  }

  // Drop legacy status + enum if present
  if (hasStatus.length) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" DROP COLUMN "status";`);
    } catch {
      /* ignore */
    }
    try {
      await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "TaskStatus";`);
    } catch {
      /* ignore */
    }
  }

  // Enforce NOT NULL + FK on columnId when possible
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ALTER COLUMN "columnId" SET NOT NULL;`);
  } catch {
    /* still nulls somehow */
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Task"
      ADD CONSTRAINT "Task_columnId_fkey"
      FOREIGN KEY ("columnId") REFERENCES "BoardColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    `);
  } catch {
    /* already exists */
  }

  console.log("[fs-knbn] Board columns ready.");
}

export async function createDefaultColumns(tx, projectId) {
  for (const col of DEFAULT_COLUMNS) {
    await tx.boardColumn.create({
      data: {
        projectId,
        name: col.name,
        position: col.position,
        color: col.color,
      },
    });
  }
}

export { DEFAULT_COLUMNS };
