import { PrismaClient } from "@prisma/client";
import { pino } from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

// Singleton Prisma client
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function connectDB() {
  try {
    await prisma.$connect();
    logger.info("✅ Database connected");
  } catch (error) {
    logger.error({ error }, "❌ Database connection failed");
    process.exit(1);
  }
}

export async function disconnectDB() {
  await prisma.$disconnect();
  logger.info("Database disconnected");
}
