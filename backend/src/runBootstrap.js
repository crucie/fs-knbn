import "dotenv/config";
import prisma from "./config/prisma.js";
import { bootstrapBoardColumns } from "./db/bootstrapColumns.js";

await prisma.$connect();
await bootstrapBoardColumns(prisma);
await prisma.$disconnect();
