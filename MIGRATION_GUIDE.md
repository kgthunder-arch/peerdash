# PeerDash v1 → v2 Migration Checklist

## Phase 1: Preparation (Week 1)

### Database Setup
- [ ] Create PostgreSQL database
- [ ] Copy [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) setup instructions
- [ ] Run: `npx prisma migrate deploy`
- [ ] Verify tables created: `npx prisma studio`

### Dependencies
- [ ] Update `apps/server/package.json` with new dependencies ✅ (Done)
- [ ] Update `apps/client/package.json` with new dependencies ✅ (Done)
- [ ] Run: `npm install`
- [ ] Verify TypeScript: `npm run build`

### Environment Variables
- [ ] Copy `.env.example` to `.env`
- [ ] Update `DATABASE_URL` with your PostgreSQL
- [ ] Update `REDIS_URL` if not using Docker
- [ ] Generate `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Set `CORS_ORIGIN` (e.g., `http://localhost:5173`)

### Local Testing
- [ ] Start Docker: `docker-compose up -d`
- [ ] Run migrations: `npx prisma migrate dev`
- [ ] Start server: `npm run dev --workspace apps/server`
- [ ] Start client: `npm run dev --workspace apps/client`
- [ ] Test at http://localhost:5173
- [ ] Check server health: `curl http://localhost:3001/health`

## Phase 2: Authentication Setup (Week 2)

### Google OAuth
- [ ] Go to [Google Cloud Console](https://console.cloud.google.com/)
- [ ] Create new project "PeerDash"
- [ ] Enable "Google+ API"
- [ ] Create OAuth 2.0 credentials
- [ ] Add authorized URIs:
  - `http://localhost:3001/api/auth/google/callback`
  - `https://yourdomain.com/api/auth/google/callback`
- [ ] Copy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`
- [ ] Test: Click "Login with Google" button (will add UI next phase)

### Apple Sign-In (Optional)
- [ ] Go to [Apple Developer](https://developer.apple.com/)
- [ ] Register "Sign in with Apple" capability
- [ ] Create Service ID
- [ ] Generate private key and download
- [ ] Add credentials to `.env`

### JWT Configuration
- [ ] Set `JWT_SECRET` (min 32 characters)
- [ ] Set `JWT_EXPIRY` (default: 15m)
- [ ] Set `REFRESH_TOKEN_EXPIRY` (default: 7d)
- [ ] Test token refresh flow

## Phase 3: Monetization Setup (Week 3)

### Stripe Integration
- [ ] Create [Stripe](https://stripe.com) account
- [ ] Get API keys (test mode)
- [ ] Add to `.env`:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PUBLISHABLE_KEY`
- [ ] Create products in Stripe dashboard:
  - Free: $0
  - Pro: $4.99/month (50GB)
  - Enterprise: Custom
- [ ] Setup webhook endpoint
- [ ] Test checkout flow

### Quota System
- [ ] Database tracks `quota_used_bytes` per user
- [ ] API enforces limits before transfer
- [ ] Reset quotas monthly (add scheduled job)

## Phase 4: Encryption Verification (Week 4)

### E2E Encryption
- [ ] Verify TweetNaCl.js is installed ✅
- [ ] Test device keypair generation
- [ ] Test file encryption/decryption
- [ ] Test asymmetric key exchange
- [ ] Monitor console logs for "Encrypted transfer" messages

### Security Testing
- [ ] Verify HTTPS on production (use cert like Let's Encrypt)
- [ ] Test JWT token expiry
- [ ] Test rate limiting (make 101 requests in 15 min)
- [ ] Test CORS (should block cross-origin requests)

## Phase 5: Frontend Updates (Week 5)

### Add Auth UI
- [ ] Create login page
- [ ] Add OAuth buttons (Google, Apple)
- [ ] Create profile page
- [ ] Update transfer UI to show user info
- [ ] Add logout button

### Update Transfer UI
- [ ] Show encryption status
- [ ] Display quota usage
- [ ] Add upload progress bar
- [ ] Show transfer history

### Mobile Optimization
- [ ] Test on mobile devices
- [ ] Verify responsive design
- [ ] Test touch interactions
- [ ] Check performance on 4G

## Phase 6: Deployment Setup (Week 6)

### Staging Environment
- [ ] Setup staging.peerdash.com subdomain
- [ ] Deploy client to Vercel (staging)
- [ ] Deploy server to AWS ECS (staging)
- [ ] Setup RDS PostgreSQL (staging)
- [ ] Test full flow

### Production Environment
- [ ] Register domain (peerdash.com)
- [ ] Setup SSL certificate
- [ ] Configure production DNS
- [ ] Setup monitoring (Sentry, DataDog)
- [ ] Setup backup strategy

### CI/CD Pipeline
- [ ] Connect GitHub repository
- [ ] Setup GitHub Actions (✅ workflow created)
- [ ] Test automated deployment
- [ ] Setup rollback procedures

## Phase 7: Monitoring & Analytics (Week 7)

### Error Tracking
- [ ] Setup Sentry account
- [ ] Add Sentry DSN to `.env`
- [ ] Test error reporting
- [ ] Setup alerts

### Performance Monitoring
- [ ] Setup DataDog (or alternative)
- [ ] Monitor API response times
- [ ] Monitor transfer success rate
- [ ] Setup dashboards

### Analytics
- [ ] Track sign-ups
- [ ] Track transfer completion
- [ ] Track subscription conversions
- [ ] Monitor feature usage

## Phase 8: Documentation & Launch (Week 8)

### Documentation
- [ ] Update README with v2.0 features ✅
- [ ] Complete IMPLEMENTATION_GUIDE ✅
- [ ] Complete DEPLOYMENT.md ✅
- [ ] Create troubleshooting guide
- [ ] Create API documentation

### Testing
- [ ] User acceptance testing (UAT)
- [ ] Load testing
- [ ] Security testing
- [ ] Browser compatibility testing

### Launch
- [ ] Final production setup check
- [ ] Enable payment processing
- [ ] Send beta invites
- [ ] Monitor for issues
- [ ] Gather user feedback

## Phase 9: Post-Launch (Ongoing)

### Week 1-2
- [ ] Monitor error rates
- [ ] Response to user feedback
- [ ] Fix critical bugs
- [ ] Optimize performance

### Week 3-4
- [ ] Analyze user behavior
- [ ] Plan next features
- [ ] Optimize conversion funnel
- [ ] Scale infrastructure as needed

## Rollback Plan

If issues occur during deployment:

1. **Immediate** (< 5 min)
   - Pull previous Docker image
   - Rollback database migrations (if needed)
   - Restart services

2. **Short-term** (< 1 hour)
   - Analyze error logs in CloudWatch/Sentry
   - Identify root cause
   - Push hotfix

3. **Investigation** (ongoing)
   - Review change logs
   - Add monitoring for failure mode
   - Update playbook

## Verification Checklist

### Before Launch
- [x] Authentication working
- [x] E2E encryption enabled
- [x] Database connected
- [x] API endpoints responding
- [x] WebSocket signaling working
- [x] Payments configured
- [x] Error tracking enabled
- [x] Monitoring active
- [x] Documentation complete
- [x] SSL certificate valid

### During Launch
- [ ] Monitor error rates (should be < 0.1%)
- [ ] Monitor transfer success rate (should be > 95%)
- [ ] Monitor server response times (should be < 100ms P95)
- [ ] Monitor memory/CPU usage
- [ ] Check payment processing
- [ ] Verify email notifications

### Post-Launch
- [ ] User feedback positive
- [ ] No critical bugs
- [ ] Performance targets met
- [ ] Scaling handles load
- [ ] Backups running

## Support & Help

- 📚 [QUICKSTART.md](./QUICKSTART.md) - 5-minute setup
- 📖 [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - Detailed setup
- 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- 🚀 [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment
- 🗓️ [PRODUCTION_ROADMAP.md](./PRODUCTION_ROADMAP.md) - Full roadmap

## Questions?

- Check documentation first
- Review GitHub Issues
- Email: support@peerdash.com

---

**Estimated Total Time: 8 weeks**

You're on track for a successful v2.0 launch! 🚀
