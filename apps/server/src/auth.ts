import jwt, { SignOptions } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

interface JWTPayload {
  userId: string;
  email: string;
  oauthProvider: string;
}

const JWT_SECRET = process.env.JWT_SECRET || "default-not-secure";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "15m";

export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
    algorithm: "HS256"
  } as any);
}

export function generateRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
    algorithm: "HS256"
  } as any);
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid token" });
  }

  (req as any).userId = payload.userId;
  (req as any).user = payload;
  next();
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      (req as any).userId = payload.userId;
      (req as any).user = payload;
    }
  }
  
  next();
}
