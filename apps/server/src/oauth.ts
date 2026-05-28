/**
 * OAuth helpers — Google and Apple sign-in token verification.
 * Uses the official Google token-info endpoint and Apple's public key endpoint
 * so we don't need to run a Passport strategy (simpler for a stateless JWT API).
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import axios from "axios";
import { pino } from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

// ─── Google ──────────────────────────────────────────────────────────────────

interface GoogleTokenInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

/**
 * Exchange a Google authorization code for user info.
 * The client sends the raw `code` from the OAuth redirect.
 */
export async function verifyGoogleCode(code: string): Promise<GoogleTokenInfo> {
  // Step 1: Exchange code for tokens
  const tokenRes = await axios.post<{
    access_token: string;
    id_token: string;
  }>(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || `${process.env.API_BASE_URL}/api/auth/google/callback`,
      grant_type: "authorization_code"
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const { access_token } = tokenRes.data;

  // Step 2: Fetch user info with the access token
  const userRes = await axios.get<GoogleTokenInfo>(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  return userRes.data;
}

/**
 * Verify a Google ID token (used when the client sends an id_token directly,
 * e.g. from @react-oauth/google's credential response).
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenInfo> {
  const res = await axios.get<GoogleTokenInfo>(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
  );
  return res.data;
}

/**
 * Verify a Google access token from the OAuth popup flow.
 * This is the token returned by @react-oauth/google's useGoogleLogin hook.
 */
export async function verifyGoogleAccessToken(accessToken: string): Promise<GoogleTokenInfo> {
  const res = await axios.get<GoogleTokenInfo>(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return res.data;
}

// ─── Apple ───────────────────────────────────────────────────────────────────

interface AppleTokenInfo {
  sub: string;
  email?: string;
}

const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys")
);

/**
 * Verify an Apple identity token (JWT) sent from the client.
 */
export async function verifyAppleIdToken(
  idToken: string,
  userEmail?: string
): Promise<AppleTokenInfo> {
  const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: process.env.APPLE_CLIENT_ID
  });

  return {
    sub: payload.sub as string,
    email: (payload.email as string | undefined) || userEmail
  };
}
