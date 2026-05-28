# PeerDash Production Deliverables

This document tracks what is implemented in the local productionized PeerDash app and what still requires provider credentials or infrastructure.

## Implemented in code

- Authentication shell with Google OAuth, Apple Sign-In entry point, anonymous mode, JWT access/refresh tokens, and persisted auth state.
- Account-linked backend models for users, devices, transfers, subscriptions, and analytics events using Prisma/Postgres.
- Persistent device registration APIs and transfer history APIs.
- WebRTC peer transfer with STUN/TURN configuration, PeerJS cloud signaling fallback, and Socket.IO signaling/relay server.
- Application-layer file chunk encryption using NaCl secretbox in addition to browser DTLS.
- Security indicators via encryption badge and transfer status copy.
- Shared room chat messages.
- Drag-and-drop file selection, QR join, camera scan flow, mobile-first layout, onboarding, animations, toasts, browser notifications, cancel/leave controls, and PWA install/offline shell.
- Stripe subscription checkout/webhook hooks for monetization.
- Server hardening with Helmet, rate limiting, CORS configuration, structured Pino logs, typed validation with Zod, and production JWT secret enforcement.

## Requires production credentials/infrastructure

- Google OAuth client ID/secret and allowed web origins.
- Apple Services ID, team ID, key ID, private key, and verified domain setup.
- Managed Postgres database and Prisma migration deployment.
- Managed Redis for refresh-token cache and scalable coordination.
- Dedicated TURN service such as Metered, Twilio, or coturn.
- Stripe live products/prices and webhook endpoint.
- Error monitoring DSN such as Sentry and analytics/log drain configuration.

## Deployment topology

- Frontend: Vercel or Netlify static deployment from `apps/client/dist`.
- Backend: Render, Railway, Fly.io, AWS ECS, Cloud Run, or another long-running Node host. Do not deploy Socket.IO signaling as a normal Vercel serverless function.
- Database: managed Postgres.
- Cache: managed Redis.
- TURN: dedicated global TURN provider for hard NAT/firewall fallback.

## Verification checklist

1. `npm install`
2. Fill `.env` from `.env.production.example`.
3. Run `npm run build --workspace client`.
4. Run `npm run build --workspace server`.
5. Run Prisma migrations against production Postgres.
6. Start backend and verify `/health`.
7. Set frontend env vars and deploy frontend.
8. Test anonymous transfer: create room, join room, encrypted badge visible, send file, cancel, leave room.
9. Test Google OAuth login and server transfer history.
10. Test TURN fallback from two different networks or behind a VPN.
11. Test PWA install and offline shell after first load.

## Native mobile roadmap

- Phase 1: Capacitor Android hardening using the existing `apps/client/android` project.
- Phase 2: Capacitor iOS project with Apple Sign-In and background transfer permission review.
- Phase 3: Native WebRTC bridge if browser WebRTC limits become a blocker.
- Phase 4: Optional React Native or Flutter rewrite using the same backend APIs and signaling protocol.

## Known limitations

- Pure web apps cannot perform true cross-device LAN discovery without a browser-visible discovery service, native helper, or local-network permission support. The current BroadcastChannel LAN discovery is useful for same-origin tabs and browser contexts, while real LAN discovery belongs in native apps or a local helper.
- Minimum transfer speed cannot be guaranteed. TURN relay, weak mobile networks, VPNs, public Wi-Fi, and browser throttling can reduce throughput.
- Apple Sign-In requires real Apple developer configuration before it can be fully verified.
