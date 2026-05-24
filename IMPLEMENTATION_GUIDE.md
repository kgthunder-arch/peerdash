# PeerDash v2.0 Implementation Guide

## Complete Feature Set

### 1. Authentication System ✅

#### Setup Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project "PeerDash"
3. Enable "Google+ API"
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URIs:
   - `http://localhost:3001/api/auth/google/callback`
   - `https://yourdomain.com/api/auth/google/callback`

6. Update `.env`:
```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

#### Setup Apple Sign-In (Enterprise)
1. Go to [Apple Developer](https://developer.apple.com/)
2. Create "Sign in with Apple" capability
3. Create service ID and key
4. Download private key

```
APPLE_CLIENT_ID=com.peerdash.signin
APPLE_TEAM_ID=XXXXXXX
APPLE_KEY_ID=XXXXXXX
```

### 2. Database Setup

#### PostgreSQL locally:
```bash
docker run -d \
  --name peerdash-postgres \
  -e POSTGRES_DB=peerdash \
  -e POSTGRES_PASSWORD=power \
  -p 5432:5432 \
  postgres:16-alpine
```

#### Configure DATABASE_URL:
```
DATABASE_URL="postgresql://postgres:power@localhost:5432/peerdash"
```

#### Run migrations:
```bash
npx prisma migrate dev --name init
```

### 3. Server API Implementation

#### Authentication Routes
- `POST /api/auth/google` - OAuth callback
- `POST /api/auth/apple` - Apple sign-in
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/user` - Get current user
- `POST /api/auth/logout` - Logout

#### Device Management
- `POST /api/devices` - Register new device
- `GET /api/devices` - List devices
- `DELETE /api/devices/:id` - Unregister device

#### Transfer API
- `POST /api/transfers` - Create transfer record
- `GET /api/transfers` - Transfer history
- `PUT /api/transfers/:id` - Update transfer status
- `DELETE /api/transfers/:id` - Delete transfer record

#### Subscription API
- `GET /api/subscription` - Current subscription
- `POST /api/subscription/checkout` - Stripe checkout session
- `POST /api/subscription/webhook` - Stripe webhook receiver

### 4. E2E Encryption

All file transfers are encrypted end-to-end using TweetNaCl.js:

#### Client Flow:
1. Sender generates symmetric key
2. Sender encrypts file chunks with symmetric key
3. Sender encrypts symmetric key with recipient's public key
4. Recipient decrypts symmetric key with their private key
5. Recipient decrypts file chunks with symmetric key

#### Implementation:
```typescript
// Sender
const symmetricKey = generateSymmetricKey();
const { ciphertext, nonce } = encryptFileChunk(chunk, symmetricKey);

// Recipient
const decryptedChunk = decryptFileChunk(ciphertext, nonce, symmetricKey);
```

### 5. Monetization System

#### Free Tier (500MB/month)
- Basic P2P transfers
- 1 device pairing
- 30-day history

#### Pro Tier ($4.99/month)
- 50GB/month transfers
- 5 device pairings
- Unlimited history
- Priority relay servers
- Group transfers (up to 5 peers)

#### Enterprise (Custom)
- Unlimited transfers
- Unlimited devices
- Admin dashboard
- SSO (SAML)
- Dedicated support

#### Stripe Integration:
1. Create Stripe account
2. Setup products/plans
3. Add webhooks to handle events:
```
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

### 6. TURN/STUN Relay Servers

For users behind restrictive NAT, configure TURN servers:

```env
TURN_SERVER_URL=turn:turnserver.example.com:3478
TURN_USERNAME=username
TURN_PASSWORD=password
```

The app automatically falls back to relay if direct P2P fails.

### 7. Notifications System

Desktop notifications on transfer completion:

```typescript
if (Notification.permission === 'granted') {
  new Notification('Transfer Complete', {
    body: 'Your files have been transferred successfully',
    icon: '/icon.png'
  });
}
```

### 8. Analytics & Monitoring

#### Track Events:
```typescript
await apiClient.post('/analytics/events', {
  eventName: 'transfer_completed',
  eventData: {
    fileCount: 3,
    totalBytes: 104857600,
    duration: 45
  }
});
```

#### Setup Sentry:
```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});
```

### 9. Development Setup

#### Install Dependencies:
```bash
npm install
```

#### Start Dev Environment:
```bash
# With Docker Compose:
docker-compose up

# Or locally:
npm run dev
```

#### Build for Production:
```bash
npm run build
```

### 10. Deployment

#### Vercel (Client)
1. Connect GitHub repository
2. Set environment variables
3. Deploy automatically on push

#### AWS ECS (Server)
1. Build Docker image: `docker build -t peerdash-server .`
2. Push to ECR
3. Create ECS task definition
4. Deploy to Fargate

#### Database (AWS RDS)
- PostgreSQL 16
- Multi-AZ deployment
- Automated backups
- SSL encryption

#### Redis (AWS ElastiCache)
- Redis 7
- Multi-AZ failover
- Encryption at rest

### 11. Security Checklist

- [ ] HTTPS enforced
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] JWT token rotation implemented
- [ ] Database encrypted
- [ ] Secrets stored in environment variables
- [ ] Input validation on all endpoints
- [ ] OWASP Top 10 vulnerabilities addressed
- [ ] Penetration testing completed
- [ ] Regular security audits scheduled

### 12. Performance Optimization

- Cache frequently accessed data with Redis
- Use CDN for static assets
- Implement database query optimization
- Enable gzip compression
- Use lazy loading for UI components
- Optimize images (WebP format)
- Enable browser caching

### 13. Monitoring & Logging

#### Setup Datadog:
```bash
npm install @datadog/browser-rum
```

#### Monitor Key Metrics:
- Page load time
- Transfer success rate
- Server response time
- Error rate
- User activity
- Conversion rate

### 14. Feature Flags

Control feature rollout with environment variables:

```env
FEATURE_E2E_ENCRYPTION=true
FEATURE_GROUP_TRANSFERS=true
FEATURE_CHAT=true
FEATURE_LAN_DISCOVERY=false
```

### 15. Next Steps

1. Implement additional OAuth providers (Apple, Microsoft)
2. Add group transfers (send to multiple peers)
3. Implement chat in shared rooms
4. Add LAN discovery for offline transfers
5. Build mobile apps (React Native/Flutter)
6. Create admin dashboard
7. Implement SSO for enterprise
8. Add custom branding for white-label
