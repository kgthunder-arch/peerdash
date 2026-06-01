import { PrismaClient } from "@prisma/client";
import { pino } from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

export async function connectDB() {
  const timeoutMs = Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000);

  try {
    await withTimeout(prisma.$connect(), timeoutMs, "Database connection");
    logger.info("Database connected");
    return true;
  } catch (error) {
    logger.error({ error }, "Database connection failed; API will keep running in degraded mode");
    return false;
  }
}

export async function disconnectDB() {
  await prisma.$disconnect();
  logger.info("Database disconnected");
}
