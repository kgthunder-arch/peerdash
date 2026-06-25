import cors from "cors";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { z } from "zod";
import Stripe from "stripe";
import { pino } from "pino";

import { generateAccessToken, generateRefreshToken, verifyToken, authMiddleware, optionalAuthMiddleware } from "./auth.js";
import { generateKeyPair } from "./encryption.js";
import { prisma, connectDB } from "./db.js";
import { connectRedis, cacheSet, cacheGet, cacheDel } from "./redis.js";
import { verifyGoogleAccessToken, verifyGoogleCode, verifyGoogleIdToken, verifyAppleIdToken } from "./oauth.js";

dotenv.config();

// ─── Required env-var validation (runs before Prisma initialises) ─────────────
(function validateEnv() {
  const REQUIRED: Record<string, string> = {
    DATABASE_URL: "Supabase/Postgres connection URL (postgresql://...)",
    JWT_SECRET:   "Random string ≥ 32 chars — generate with: openssl rand -base64 32",
  };

  const missing = Object.entries(REQUIRED).filter(([k]) => !process.env[k]);

  if (missing.length > 0) {
    console.error("\n╔══════════════════════════════════════════════════════════════╗");
    console.error("║  SERVER STARTUP ABORTED — missing environment variables      ║");
    console.error("╠══════════════════════════════════════════════════════════════╣");
    missing.forEach(([key, hint]) => {
      console.error(`║  ✗ ${key.padEnd(28)} │ ${hint.slice(0, 26)}`);
    });
    console.error("╠══════════════════════════════════════════════════════════════╣");
    console.error("║  Fix: Render dashboard → peerdash-api → Environment          ║");
    console.error("║       Add each missing key listed above.                     ║");
    console.error("╚══════════════════════════════════════════════════════════════╝\n");
    process.exit(1);
  }
})();

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" as any })
  : null;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",") || "*",
  credentials: true
}));

// Raw body for Stripe webhooks (must come before express.json)
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use("/api/", limiter);

// Structured request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info({ method: req.method, path: req.path }, "request");
  next();
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN?.split(",") || "*", credentials: true }
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "peerdash-signal", version: "2.0.0" });
});

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function upsertOAuthUser(oauthId: string, provider: string, email: string, name?: string, avatarUrl?: string) {
  return prisma.user.upsert({
    where: { oauthId },
    update: { name, avatarUrl, email },
    create: { oauthId, oauthProvider: provider, email, name, avatarUrl }
  });
}

function makeTokenPair(user: { id: string; email: string; oauthProvider: string }) {
  const payload = { userId: user.id, email: user.email, oauthProvider: user.oauthProvider };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload)
  };
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────

// Google — accepts either an authorization code OR an id_token (from @react-oauth/google)
app.post("/api/auth/google", async (req: Request, res: Response) => {
  try {
    const { code, idToken, accessToken } = req.body as { code?: string; idToken?: string; accessToken?: string };
    if (!code && !idToken && !accessToken) {
      return res.status(400).json({ error: "code, idToken, or accessToken required" }) as any;
    }

    let info: { sub: string; email: string; name?: string; picture?: string };
    if (idToken) {
      info = await verifyGoogleIdToken(idToken);
    } else if (accessToken) {
      info = await verifyGoogleAccessToken(accessToken);
    } else {
      info = await verifyGoogleCode(code!);
    }

    const user = await upsertOAuthUser(info.sub, "google", info.email, info.name, info.picture);
    const tokens = makeTokenPair(user);
    await cacheSet(`refresh:${user.id}`, tokens.refreshToken, 7 * 24 * 3600);
    res.json({ success: true, user, ...tokens });
  } catch (error) {
    logger.error({ error }, "Google auth failed");
    res.status(400).json({ error: "Google authentication failed" });
  }
});

// Apple
app.post("/api/auth/apple", async (req: Request, res: Response) => {
  try {
    const { idToken, email } = req.body as { idToken: string; email?: string };
    if (!idToken) return res.status(400).json({ error: "idToken required" }) as any;

    const info = await verifyAppleIdToken(idToken, email);
    const userEmail = info.email || email || `${info.sub}@privaterelay.appleid.com`;
    const user = await upsertOAuthUser(info.sub, "apple", userEmail);
    const tokens = makeTokenPair(user);
    await cacheSet(`refresh:${user.id}`, tokens.refreshToken, 7 * 24 * 3600);
    res.json({ success: true, user, ...tokens });
  } catch (error) {
    logger.error({ error }, "Apple auth failed");
    res.status(400).json({ error: "Apple authentication failed" });
  }
});

// Get current user
app.get("/api/auth/user", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" }) as any;
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Refresh access token
app.post("/api/auth/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    if (!refreshToken) return res.status(400).json({ error: "refreshToken required" }) as any;

    const payload = verifyToken(refreshToken);
    if (!payload) return res.status(401).json({ error: "Invalid refresh token" }) as any;

    // Validate against stored token
    const stored = await cacheGet<string>(`refresh:${payload.userId}`);
    if (stored && stored !== refreshToken) {
      return res.status(401).json({ error: "Refresh token reuse detected" }) as any;
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: "User not found" }) as any;

    const accessToken = generateAccessToken({ userId: user.id, email: user.email, oauthProvider: user.oauthProvider });
    res.json({ accessToken });
  } catch (error) {
    res.status(401).json({ error: "Token refresh failed" });
  }
});

// Logout — invalidate refresh token
app.post("/api/auth/logout", authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  await cacheDel(`refresh:${userId}`);
  res.json({ success: true });
});

// ─── Device Routes ────────────────────────────────────────────────────────────

app.post("/api/devices", authMiddleware, async (req: Request, res: Response) => {
  try {
    const schema = z.object({ name: z.string().min(1).max(255), deviceKey: z.string() });
    const { name, deviceKey } = schema.parse(req.body);
    const userId = (req as any).userId as string;
    const { publicKey } = generateKeyPair();

    const device = await prisma.device.upsert({
      where: { deviceKey },
      update: { name, lastSeenAt: new Date() },
      create: { userId, name, deviceKey, publicKey, lastSeenAt: new Date() }
    });
    res.json({ success: true, device });
  } catch (error) {
    res.status(400).json({ error: "Device registration failed" });
  }
});

app.get("/api/devices", authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const devices = await prisma.device.findMany({ where: { userId }, orderBy: { lastSeenAt: "desc" } });
  res.json({ devices });
});

app.delete("/api/devices/:id", authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const deviceId = req.params.id as string;
  await prisma.device.deleteMany({ where: { id: deviceId, userId } });
  res.json({ success: true });
});

// ─── Transfer Routes ──────────────────────────────────────────────────────────

app.get("/api/transfers", authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const transfers = await prisma.transfer.findMany({
    where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  res.json({ transfers });
});

app.post("/api/transfers", authMiddleware, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      receiverId: z.string(),
      files: z.array(z.object({ name: z.string(), size: z.number() })),
      totalBytes: z.number()
    });
    const { receiverId, files, totalBytes } = schema.parse(req.body);
    const senderId = (req as any).userId as string;
    const roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();

    const transfer = await prisma.transfer.create({
      data: {
        senderId,
        receiverId,
        roomCode,
        status: "pending",
        totalBytes: BigInt(totalBytes),
        fileCount: files.length,
        filesMetadata: files
      }
    });
    res.json({ success: true, transfer: { ...transfer, totalBytes: transfer.totalBytes.toString() } });
  } catch (error) {
    res.status(400).json({ error: "Transfer creation failed" });
  }
});

app.patch("/api/transfers/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      status: z.enum(["active", "completed", "failed"]).optional(),
      transferredBytes: z.number().optional()
    });
    const data = schema.parse(req.body);
    const userId = (req as any).userId as string;

    const transferId = req.params.id as string;
    const transfer = await prisma.transfer.findFirst({
      where: { id: transferId, OR: [{ senderId: userId }, { receiverId: userId }] }
    });
    if (!transfer) return res.status(404).json({ error: "Transfer not found" }) as any;

    const updated = await prisma.transfer.update({
      where: { id: transferId },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.transferredBytes !== undefined && { transferredBytes: BigInt(data.transferredBytes) }),
        ...(data.status === "completed" && { completedAt: new Date() }),
        ...(data.status === "active" && { startsAt: new Date() })
      }
    });

    // Update quota usage on completion
    if (data.status === "completed") {
      await prisma.user.update({
        where: { id: transfer.senderId },
        data: { quotaUsedBytes: { increment: transfer.totalBytes } }
      });
    }

    res.json({ success: true, transfer: { ...updated, totalBytes: updated.totalBytes.toString() } });
  } catch (error) {
    res.status(400).json({ error: "Transfer update failed" });
  }
});

// ─── Subscription Routes ──────────────────────────────────────────────────────

app.get("/api/subscription", authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true }
  });
  if (!user) return res.status(404).json({ error: "User not found" }) as any;

  res.json({
    subscription: {
      tier: user.subscriptionTier,
      quotaUsedBytes: user.quotaUsedBytes.toString(),
      quotaLimitBytes: user.quotaLimitBytes.toString(),
      currentPeriodEnd: user.subscription?.currentPeriodEnd,
      status: user.subscription?.status || "active"
    }
  });
});

app.post("/api/subscription/checkout", authMiddleware, async (req: Request, res: Response) => {
  if (!stripe) return res.status(503).json({ error: "Payments not configured" }) as any;

  try {
    const schema = z.object({ tier: z.enum(["pro", "enterprise"]) });
    const { tier } = schema.parse(req.body);
    const userId = (req as any).userId as string;
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { subscription: true } });
    if (!user) return res.status(404).json({ error: "User not found" }) as any;

    const PRICE_IDS: Record<string, string> = {
      pro: process.env.STRIPE_PRO_PRICE_ID || "",
      enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID || ""
    };

    let customerId = user.subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name || undefined });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: PRICE_IDS[tier], quantity: 1 }],
      success_url: `${process.env.CORS_ORIGIN?.split(",")[0]}/settings?checkout=success`,
      cancel_url: `${process.env.CORS_ORIGIN?.split(",")[0]}/settings?checkout=canceled`,
      metadata: { userId, tier }
    });

    res.json({ session: { url: session.url } });
  } catch (error) {
    logger.error({ error }, "Stripe checkout failed");
    res.status(500).json({ error: "Checkout session creation failed" });
  }
});

// Stripe webhook
app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
  if (!stripe) return res.status(503).json({ error: "Payments not configured" }) as any;

  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || "");
  } catch (err) {
    logger.error({ err }, "Stripe webhook signature verification failed");
    return res.status(400).json({ error: "Webhook signature invalid" }) as any;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const { userId, tier } = session.metadata || {};
      if (userId && tier) {
        const quotaMap: Record<string, bigint> = {
          pro: BigInt(53687091200),       // 50 GB
          enterprise: BigInt(Number.MAX_SAFE_INTEGER)
        };
        await prisma.user.update({
          where: { id: userId },
          data: { subscriptionTier: tier, quotaLimitBytes: quotaMap[tier] || BigInt(536870912) }
        });
        await prisma.subscription.upsert({
          where: { userId },
          update: { tier, status: "active", stripeCustomerId: session.customer as string },
          create: { userId, tier, status: "active", stripeCustomerId: session.customer as string, stripeSubscriptionId: session.subscription as string }
        });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: { status: "canceled" }
      });
      const dbSub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } });
      if (dbSub) {
        await prisma.user.update({
          where: { id: dbSub.userId },
          data: { subscriptionTier: "free", quotaLimitBytes: BigInt(536870912) }
        });
      }
    }
  } catch (error) {
    logger.error({ error }, "Stripe webhook processing failed");
  }

  res.json({ received: true });
});

// ─── Analytics ────────────────────────────────────────────────────────────────

app.post("/api/analytics/events", optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      eventName: z.string().max(100),
      eventData: z.record(z.unknown()).optional()
    });
    const { eventName, eventData } = schema.parse(req.body);
    const userId = (req as any).userId as string | undefined;

    await prisma.analyticsEvent.create({ data: { eventName, eventData: (eventData ?? null) as any, userId } });
    res.json({ success: true });
  } catch {
    res.json({ success: true }); // Never fail analytics
  }
});

// ─── TURN credentials (short-lived) ──────────────────────────────────────────

app.get("/api/turn-credentials", optionalAuthMiddleware, (_req: Request, res: Response) => {
  const turnUrl = process.env.TURN_SERVER_URL;
  if (!turnUrl) {
    return res.json({ iceServers: [] }) as any;
  }

  res.json({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:openrelay.metered.ca:80" },
      {
        urls: turnUrl,
        username: process.env.TURN_USERNAME || "openrelayproject",
        credential: process.env.TURN_PASSWORD || "openrelayproject"
      }
    ]
  });
});

// ─── WebSocket / Signaling ────────────────────────────────────────────────────

// Track rooms: roomCode → Set of socket IDs
const rooms = new Map<string, Set<string>>();
// Track socket → room mapping for cleanup
const socketRooms = new Map<string, string>();

io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "Socket connected");

  socket.on("create-room", ({ roomCode }: { roomCode: string }) => {
    socket.join(roomCode);
    if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
    rooms.get(roomCode)!.add(socket.id);
    socketRooms.set(socket.id, roomCode);
    socket.emit("room-created", { roomCode });
    logger.info({ roomCode, socketId: socket.id }, "Room created");
  });

  socket.on("join-room", ({ roomCode, peerName }: { roomCode: string; peerName: string }) => {
    const room = rooms.get(roomCode);
    if (!room || room.size === 0) {
      socket.emit("error", { message: "Room not found or expired" });
      return;
    }
    socket.join(roomCode);
    room.add(socket.id);
    socketRooms.set(socket.id, roomCode);
    socket.to(roomCode).emit("peer-joined", { roomCode, peerName, socketId: socket.id });
    socket.emit("ready", { roomCode, peerName });
    logger.info({ roomCode, socketId: socket.id, peerName }, "Peer joined room");
  });

  socket.on("signal", ({ roomCode, target, payload }: { roomCode: string; target?: string; payload: unknown }) => {
    if (target) {
      io.to(target).emit("signal", { payload, sender: socket.id });
    } else {
      socket.to(roomCode).emit("signal", { payload, sender: socket.id });
    }
  });

  socket.on("relay-data", ({ roomCode, target, data }: { roomCode: string; target?: string; data: unknown }) => {
    if (target) {
      io.to(target).emit("relay-data", { data, sender: socket.id });
    } else {
      socket.to(roomCode).emit("relay-data", { data, sender: socket.id });
    }
  });

  socket.on("relay-control", ({ roomCode, target, message }: { roomCode: string; target?: string; message: unknown }) => {
    if (target) {
      io.to(target).emit("relay-control", { message, sender: socket.id });
    } else {
      socket.to(roomCode).emit("relay-control", { message, sender: socket.id });
    }
  });

  // Chat message relay for shared rooms
  socket.on("chat-message", ({ roomCode, message }: { roomCode: string; message: unknown }) => {
    socket.to(roomCode).emit("chat-message", { message, sender: socket.id });
  });

  socket.on("disconnecting", () => {
    for (const roomCode of socket.rooms) {
      if (roomCode !== socket.id) {
        socket.to(roomCode).emit("peer-left");
        const room = rooms.get(roomCode);
        if (room) {
          room.delete(socket.id);
          if (room.size === 0) rooms.delete(roomCode);
        }
      }
    }
    socketRooms.delete(socket.id);
    logger.info({ socketId: socket.id }, "Socket disconnected");
  });
});

// ─── Error handler ────────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start() {
  httpServer.listen(PORT, "0.0.0.0", () => {
    logger.info(`PeerDash Server v2.0 listening on port ${PORT}`);
    logger.info("Signal server ready for WebRTC connections");
  });

  void connectDB();
  void connectRedis();

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received; shutting down");
    httpServer.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
