# PeerDash v2.0 Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           PeerDash Web Client (React + Vite)             │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ Auth Store (Zustand)                                │ │  │
│  │  │ - Current user & tokens                             │ │  │
│  │  │ - OAuth integration                                 │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ Encryption Layer (TweetNaCl.js)                     │ │  │
│  │  │ - Device keypair generation                         │ │  │
│  │  │ - File chunk encryption                             │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ P2P Transfer Engine (PeerJS + WebRTC)               │ │  │
│  │  │ - Direct peer connection                            │ │  │
│  │  │ - ICE candidate handling                            │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘ │
│                           │                                        │
└───────────────────────────┼────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
                    ▼               ▼
        ┌──────────────────┐  ┌──────────────────┐
        │  REST API        │  │  WebSocket       │
        │  (HTTP/HTTPS)    │  │  (Socket.io)     │
        └────────┬─────────┘  └────────┬─────────┘
                 │                     │
                 └─────────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │    PeerDash Signal Server        │
        │  (Node.js + Express + Socket.io) │
        │                                  │
        │  ┌────────────────────────────┐ │
        │  │ Authentication Module      │ │
        │  │ - OAuth2 (Google, Apple)   │ │
        │  │ - JWT token management     │ │
        │  │ - Passport.js integration  │ │
        │  └────────────────────────────┘ │
        │                                  │
        │  ┌────────────────────────────┐ │
        │  │ WebRTC Signaling           │ │
        │  │ - Room management          │ │
        │  │ - SDP/ICE relay            │ │
        │  │ - Fallback relaying        │ │
        │  └────────────────────────────┘ │
        │                                  │
        │  ┌────────────────────────────┐ │
        │  │ Subscription & Billing     │ │
        │  │ - Stripe integration       │ │
        │  │ - Quota enforcement        │ │
        │  │ - Usage tracking           │ │
        │  └────────────────────────────┘ │
        │                                  │
        │  ┌────────────────────────────┐ │
        │  │ Analytics & Logging        │ │
        │  │ - Event tracking           │ │
        │  │ - Error reporting (Sentry) │ │
        │  │ - Performance metrics      │ │
        │  └────────────────────────────┘ │
        └──────────────┬───────────────────┘
                       │
         ┌─────────────┼──────────────┐
         │             │              │
         ▼             ▼              ▼
    ┌─────────┐   ┌────────┐    ┌─────────┐
    │   PG    │   │ Redis  │    │ Secrets │
    │Database │   │ Cache  │    │ Manager │
    └─────────┘   └────────┘    └─────────┘
```

## Data Flow: File Transfer

### Sender Side
1. User selects files
2. Client generates symmetric encryption key
3. Client reads file chunks
4. Each chunk: encrypted with symmetric key
5. Symmetric key: encrypted with recipient's public key
6. Chunks sent via encrypted WebRTC datachannel
7. Metadata stored in database

### Receiver Side
1. Receives transfer initiation
2. Retrieves sender's public key from database
3. For each chunk:
   - Decrypts symmetric key
   - Decrypts file chunks
   - Assembles into file
4. Saves to local storage
5. Updates transfer status

## Security Model

```
┌─────────────────────────────────────────┐
│       Device Keypair (Generated Once)    │
│  ┌───────────────────────────────────┐  │
│  │ Public Key: Shared with server    │  │
│  │ Secret Key: Stored locally        │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│     Transfer Symmetric Key              │
│  (Generated per transfer, 256-bit)      │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
   Encrypt        Encrypt
   file           sym key
   chunks         (with
   (with          recipient
   sym key)       pub key)
        │             │
        └──────┬──────┘
               ▼
        Send over encrypted
        WebRTC datachannel
```

## Deployment Architecture

### Development
```
Docker Compose:
- PeerDash Server (Node.js)
- PostgreSQL
- Redis
```

### Staging
```
AWS:
- ECS Fargate (Server)
- RDS PostgreSQL
- ElastiCache Redis
- CloudFront CDN
```

### Production
```
Frontend:
- Vercel Edge Network (React SPA)
- Cloudflare CDN

Backend:
- AWS ECS Fargate (Auto-scaling)
- AWS RDS PostgreSQL (Multi-AZ)
- AWS ElastiCache Redis
- AWS S3 (Transfer metadata)
- Stripe (Billing)

Monitoring:
- Sentry (Error tracking)
- DataDog (APM)
- CloudWatch (Logs)
```

## API Architecture

### Authentication Flow
```
Browser → POST /api/auth/google
         ↓
Server: Verify with Google
         ↓
Server: Create/update user in DB
         ↓
Server: Generate JWT tokens
         ↓
Browser: Store tokens (localStorage/sessionStorage)
         ↓
Subsequent requests: Include Authorization header
```

### Transfer Flow
```
Sender:
  1. POST /api/transfers → Create transfer record
  2. GET room code
  3. Socket.io: Initiate WebRTC connection
  4. Send encrypted chunks via DataChannel
  5. PUT /api/transfers/{id} → Mark complete

Receiver:
  1. Join room with code
  2. Socket.io: Accept WebRTC connection
  3. Receive and decrypt chunks
  4. Save files locally
```

## Database Schema

### Users Table
- id (UUID)
- email, name, avatar
- oauth_provider, oauth_id
- subscription_tier
- quota_used_bytes, quota_limit_bytes
- created_at, updated_at

### Devices Table
- id (UUID)
- user_id (FK)
- name, device_key
- public_key, private_key_encrypted
- last_seen_at

### Transfers Table
- id (UUID)
- sender_id, receiver_id (FK)
- room_code
- status, total_bytes, transferred_bytes
- files_metadata (JSON)
- encrypted_key
- starts_at, completed_at

### Subscriptions Table
- id (UUID)
- user_id (unique FK)
- stripe_customer_id, stripe_subscription_id
- tier, status
- current_period_end, cancel_at_period_end

### AnalyticsEvents Table
- id (UUID)
- user_id (FK, nullable)
- event_name
- event_data (JSON)
- created_at

## Monitoring & Observability

### Metrics
- Transfer success rate
- Average transfer time
- File size distribution
- P95 latency
- Error rate by type
- User signup rate
- Subscription conversion

### Logging
- All API requests/responses
- Socket.io events
- Database queries
- Authentication events
- Errors and exceptions

### Alerting
- High error rate (>5%)
- Database connection failures
- Server down
- Unusual quota usage
- Payment processing failures

## Scaling Considerations

### Horizontal Scaling
- Run multiple server instances
- Use load balancer (ALB)
- Redis for session management
- Sticky sessions for WebSocket

### Vertical Scaling
- Increase CPU/RAM for compute-heavy operations
- Database query optimization with indexes
- Caching strategy for hot data

### Geographic Distribution
- CDN for static assets
- Multi-region deployment
- TURN server in multiple regions
- Database read replicas

## Security Best Practices

1. **Transport Security**
   - HTTPS/TLS for all connections
   - WSS for WebSocket
   - HSTS headers

2. **Authentication**
   - OAuth2 for third-party auth
   - JWT with short expiry (15m)
   - Refresh token rotation
   - Password-less by default

3. **Encryption**
   - E2E encryption for all transfers
   - Database encryption at rest
   - Secrets encryption in vault
   - TLS certificates auto-rotated

4. **Authorization**
   - Role-based access control (RBAC)
   - Rate limiting per user
   - Quota enforcement
   - Admin approval for enterprise

5. **Data Protection**
   - GDPR compliance
   - Data retention policies
   - Automatic deletion of old transfers
   - Audit logs
