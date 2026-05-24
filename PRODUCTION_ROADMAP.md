# PeerDash Production Roadmap

## Phase 1: Foundation (Weeks 1-2)
- [ ] Authentication system (OAuth2 + JWT)
- [ ] Database schema (MongoDB/PostgreSQL)
- [ ] User management & sessions
- [ ] Basic API structure

## Phase 2: Security & Reliability (Weeks 3-4)
- [ ] E2E Encryption (TweetNaCl.js)
- [ ] TURN/STUN server integration
- [ ] Transfer resumption logic
- [ ] LAN discovery with mDNS

## Phase 3: Enhanced Features (Weeks 5-6)
- [ ] Transfer history persistence
- [ ] Device pairing system
- [ ] Group transfers
- [ ] Shared rooms with chat
- [ ] Notifications system

## Phase 4: UI/UX Polish (Weeks 7-8)
- [ ] Onboarding tutorial
- [ ] Mobile-first responsive design
- [ ] Error boundary components
- [ ] Loading states & animations
- [ ] Accessibility audit

## Phase 5: Monetization (Weeks 9-10)
- [ ] Stripe integration
- [ ] Quota management
- [ ] Subscription tiers
- [ ] Admin dashboard
- [ ] Analytics integration

## Phase 6: Deployment & Scaling (Weeks 11-12)
- [ ] Docker containerization
- [ ] Kubernetes orchestration
- [ ] Monitoring & logging (Sentry, DataDog)
- [ ] CDN configuration
- [ ] Performance optimization

---

## Technology Stack

### Frontend
- React 19 + TypeScript
- Vite (build tool)
- TailwindCSS (UI)
- TweetNaCl.js (encryption)
- Socket.io-client (signaling)
- React Query (state management)
- Zustand (local state)

### Backend
- Node.js + Express
- PostgreSQL + Prisma ORM
- Redis (sessions, caching)
- Socket.io (WebSocket)
- Passport.js (OAuth)
- TweetNaCl.js (encryption)
- Stripe API (payments)

### Infrastructure
- Docker + Docker Compose
- Kubernetes
- Vercel/Netlify (frontend)
- AWS/GCP (backend)
- Cloudflare CDN
- Sentry (error tracking)
- Posthog (analytics)

---

## API Endpoints

### Authentication
- `POST /api/auth/google` - Google OAuth callback
- `POST /api/auth/apple` - Apple OAuth callback
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh tokens
- `GET /api/auth/user` - Current user

### Users & Devices
- `GET /api/users/me` - Current user profile
- `POST /api/users/me` - Update profile
- `GET /api/devices` - List paired devices
- `POST /api/devices` - Pair new device
- `DELETE /api/devices/:id` - Unpair device

### Transfers
- `GET /api/transfers` - Transfer history
- `POST /api/transfers` - Create transfer metadata
- `GET /api/transfers/:id` - Transfer details
- `PUT /api/transfers/:id` - Update transfer status
- `DELETE /api/transfers/:id` - Delete transfer

### Subscription
- `GET /api/subscription` - Current plan
- `POST /api/subscription/plans` - List plans
- `POST /api/subscription/checkout` - Create checkout session
- `POST /api/subscription/webhook` - Stripe webhooks

### Analytics
- `POST /api/analytics/events` - Track events
- `GET /api/analytics` - User analytics

---

## Database Schema

### Users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  avatar_url VARCHAR(512),
  oauth_provider ENUM('google', 'apple'),
  oauth_id VARCHAR(255) UNIQUE,
  subscription_tier ENUM('free', 'pro', 'enterprise'),
  quota_used_bytes BIGINT DEFAULT 0,
  quota_limit_bytes BIGINT DEFAULT 536870912 -- 500MB free tier
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE devices (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name VARCHAR(255),
  device_key VARCHAR(255) UNIQUE,
  public_key TEXT,
  private_key_encrypted TEXT,
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE transfers (
  id UUID PRIMARY KEY,
  sender_id UUID REFERENCES users(id),
  receiver_id UUID REFERENCES users(id),
  room_code VARCHAR(6),
  status ENUM('pending', 'active', 'completed', 'failed'),
  total_bytes BIGINT,
  transferred_bytes BIGINT DEFAULT 0,
  file_count INT,
  files_metadata JSONB,
  encrypted_key TEXT,
  starts_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  tier ENUM('free', 'pro', 'enterprise'),
  status ENUM('active', 'canceled', 'past_due'),
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE analytics_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  event_name VARCHAR(255),
  event_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Security Considerations

1. **Encryption**: TweetNaCl.js for E2E, all transfers encrypted
2. **HTTPS**: Force secure connections
3. **CORS**: Strict origin validation
4. **Rate Limiting**: Prevent abuse (100 transfers/hour per user)
5. **Input Validation**: Sanitize all inputs
6. **JWT Tokens**: 15min expiry, refresh token rotation
7. **OWASP**: Follow OWASP Top 10

---

## Monetization Strategy

### Free Tier (500MB/month)
- Basic P2P transfers
- 1 device pairing
- 30-day history

### Pro Tier ($4.99/month)
- 50GB/month transfers
- 5 device pairings
- Unlimited history
- Priority relay servers
- Group transfers (up to 5 peers)

### Enterprise (Custom)
- Unlimited transfers
- Unlimited devices
- Admin dashboard
- SSO integration (SAML)
- Dedicated support
- Custom branding

---

## Performance Targets

- Page load: < 2s (P90)
- Time to transfer: < 500ms handshake
- P2P throughput: 10Mbps+ (with direct connection)
- Server response: < 100ms (P95)
- Uptime: 99.9%

---

## Monitoring & Observability

- **Logs**: CloudWatch / Stackdriver
- **Metrics**: Prometheus + Grafana
- **Errors**: Sentry
- **Analytics**: PostHog
- **APM**: Datadog

---

## Deployment

### Development
```bash
docker-compose up
```

### Staging
- Deployed to staging.peerdash.com
- Same as prod, used for testing

### Production
- Frontend: Vercel CDN
- Backend: AWS ECS on Fargate
- Database: AWS RDS (managed PostgreSQL)
- Cache: AWS ElastiCache (Redis)
