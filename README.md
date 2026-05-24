# PeerDash

Production-ready peer-to-peer file transfer. No cloud storage, no size limits — files move directly between devices over an encrypted WebRTC channel.

## Features

| Feature | Status |
|---|---|
| WebRTC P2P file transfer | ✅ |
| TURN/STUN relay fallback | ✅ |
| End-to-end encryption (NaCl secretbox) | ✅ |
| Google OAuth login | ✅ |
| Apple Sign-In | ✅ (native/Safari) |
| Anonymous (no-account) mode | ✅ |
| JWT auth + token refresh | ✅ |
| PostgreSQL via Prisma | ✅ |
| Redis session cache | ✅ |
| Stripe subscriptions (Free/Pro/Enterprise) | ✅ |
| Transfer history (local + server) | ✅ |
| Pause / resume / cancel per file | ✅ |
| Drag-and-drop upload | ✅ |
| QR code room join | ✅ |
| LAN discovery (BroadcastChannel) | ✅ |
| Room chat | ✅ |
| Onboarding tutorial | ✅ |
| Toast + browser notifications | ✅ |
| Dark / light theme | ✅ |
| PWA installable | ✅ |
| Capacitor Android app | ✅ |
| Structured logging (pino) | ✅ |
| Rate limiting + helmet security | ✅ |

---

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for Postgres + Redis)
- A Google Cloud project with OAuth 2.0 credentials

### 1. Clone and install

```bash
git clone https://github.com/your-org/peerdash.git
cd peerdash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
DATABASE_URL="postgresql://peerdash:dev@localhost:5432/peerdash"
REDIS_URL="redis://127.0.0.1:6379"
JWT_SECRET="change-me-min-32-chars-random-string"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
VITE_GOOGLE_CLIENT_ID="your-google-client-id"   # same value, for the browser
CORS_ORIGIN="http://localhost:5173"
```

### 3. Start infrastructure

```bash
docker-compose up -d postgres redis
```

### 4. Run database migrations

```bash
cd apps/server
npx prisma migrate dev --name init
npx prisma generate
cd ../..
```

### 5. Start development servers

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

---

## Architecture

```
peerdash/
├── apps/
│   ├── client/          React 19 + Vite SPA
│   │   └── src/
│   │       ├── App.tsx              Main app (WebRTC, signaling, UI)
│   │       ├── components/          LoginScreen, UserHeader, Chat, Toasts…
│   │       ├── lib/                 Encryption, LAN discovery, storage
│   │       └── store/               Zustand: auth, subscription
│   └── server/          Node.js + Express + Socket.io
│       └── src/
│           ├── index.ts             All routes + WebSocket signaling
│           ├── auth.ts              JWT helpers + middleware
│           ├── db.ts                Prisma singleton
│           ├── redis.ts             Redis cache helpers
│           └── oauth.ts             Google + Apple token verification
├── docker-compose.yml
└── .env.example
```

### Transfer flow

1. Sender creates a room → gets a 6-char code + QR
2. Receiver joins with the code → Socket.io signals both peers
3. PeerJS establishes a direct WebRTC DataChannel (DTLS encrypted)
4. Sender generates a NaCl secretbox session key, sends it via the control channel
5. Each file chunk is encrypted with the session key before transmission
6. Receiver decrypts each chunk and reassembles the file
7. If direct P2P fails, traffic falls back through the Socket.io relay

---

## Deployment

### Frontend (Vercel)

```bash
# vercel.json is already configured
vercel --prod
```

Set environment variables in the Vercel dashboard:
- `VITE_SIGNAL_SERVER_URL` → your backend URL
- `VITE_API_URL` → your backend URL + `/api`
- `VITE_GOOGLE_CLIENT_ID`

### Backend (Railway / Render / Fly.io)

```bash
cd apps/server
npm run build
npm start
```

Required environment variables (see `.env.example` for full list):
- `DATABASE_URL`, `REDIS_URL`
- `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `CORS_ORIGIN` (comma-separated list of allowed frontend origins)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (optional, for billing)
- `TURN_SERVER_URL`, `TURN_USERNAME`, `TURN_PASSWORD` (optional, for relay)

### Docker (self-hosted)

```bash
docker-compose up --build
```

---

## Stripe Setup

1. Create products in the Stripe dashboard: **Pro** ($4.99/mo) and **Enterprise** (custom)
2. Copy the price IDs into `.env`:
   ```env
   STRIPE_PRO_PRICE_ID="price_xxx"
   STRIPE_ENTERPRISE_PRICE_ID="price_yyy"
   ```
3. Set up a webhook pointing to `https://your-api.com/api/stripe/webhook`
4. Add the webhook secret to `STRIPE_WEBHOOK_SECRET`

---

## TURN Server

For production reliability, use a dedicated TURN server (e.g. [Metered](https://www.metered.ca/), [Twilio](https://www.twilio.com/stun-turn), or self-hosted [coturn](https://github.com/coturn/coturn)):

```env
TURN_SERVER_URL="turn:your-turn-server.com:3478"
TURN_USERNAME="your-username"
TURN_PASSWORD="your-password"
```

The frontend fetches credentials from `/api/turn-credentials` on startup.

---

## Mobile Roadmap

### Android (current)
The Capacitor Android project is in `apps/client/android/`. Build with:
```bash
cd apps/client
npm run build
npx cap sync android
npx cap open android   # opens Android Studio
```

### iOS (planned)
```bash
npm install @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios
```

### React Native (future)
A React Native port would share the business logic from `apps/client/src/lib/` and `apps/client/src/store/` while replacing the WebRTC layer with `react-native-webrtc`.

### Flutter (alternative)
A Flutter port would use `flutter_webrtc` for the P2P layer and `dio` for the REST API. The signaling server is framework-agnostic.

---

## Security

- All WebRTC DataChannels are DTLS-encrypted by the browser
- An additional NaCl secretbox layer encrypts each file chunk at the application level
- JWTs use HS256 with a configurable secret; access tokens expire in 15 minutes
- Refresh tokens are stored in Redis and validated on each use (rotation detection)
- Helmet.js sets security headers; rate limiting is applied to all `/api/` routes
- Input validation via Zod on all POST endpoints

---

## License

MIT
