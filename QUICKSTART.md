# PeerDash v2.0 Quick Start Guide

## Installation & Setup (5 minutes)

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)
- Redis (or use Docker)

### Option 1: Quick Start with Docker Compose ⚡

```bash
# Clone repository
git clone https://github.com/yourusername/peerdash.git
cd peerdash

# Copy environment file
cp .env.example .env

# Start all services
docker-compose up -d

# Run database migrations
docker exec peerdash-server npx prisma migrate dev

# Open browser
open http://localhost:5173
open http://localhost:3001/health
```

**Services:**
- Client: http://localhost:5173
- Server: http://localhost:3001
- Database: localhost:5432
- Redis: localhost:6379

### Option 2: Manual Setup

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Setup PostgreSQL
```bash
# Create database
createdb peerdash

# Set DATABASE_URL
export DATABASE_URL="postgresql://user:password@localhost:5432/peerdash"
```

#### 3. Setup Redis
```bash
redis-server
```

#### 4. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

#### 5. Run Migrations
```bash
npx prisma migrate dev
```

#### 6. Start Development Servers
```bash
# Terminal 1: Server
npm run dev --workspace apps/server

# Terminal 2: Client
npm run dev --workspace apps/client
```

## First Transfer (Quick Demo)

1. **Open two browser windows:**
   - Window 1: http://localhost:5173
   - Window 2: http://localhost:5173 (different device)

2. **Window 1 (Sender):**
   - Click "Create Room"
   - Share the room code or QR code

3. **Window 2 (Receiver):**
   - Click "Join Room"
   - Enter the room code

4. **Window 1 (Sender):**
   - Click "Add files"
   - Select files to transfer
   - Click "Start transfer"

5. **Window 2 (Receiver):**
   - Files appear as they arrive
   - Click "Download Selected" when done

## Configuration

### Essential Environment Variables

```env
# Server
PORT=3001
NODE_ENV=development
JWT_SECRET=your-secret-key-min-32-chars

# Database
DATABASE_URL=postgresql://user:password@localhost/peerdash
REDIS_URL=redis://127.0.0.1:6379

# OAuth (Optional for now)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Stripe (Optional)
STRIPE_SECRET_KEY=sk_test_your-key
STRIPE_PUBLISHABLE_KEY=pk_test_your-key

# Client
VITE_SIGNAL_SERVER_URL=http://localhost:3001
VITE_API_URL=http://localhost:3001/api
```

## Common Tasks

### Build for Production
```bash
npm run build
```

### Run Tests
```bash
npm test
```

### View Database
```bash
npx prisma studio
```

### Generate TypeScript Types
```bash
npx prisma generate
```

### Reset Database
```bash
npx prisma migrate reset
```

## Deploy to Vercel

### Frontend Only
```bash
vercel deploy
```

### Full Stack (Server + Frontend)
```bash
# Push to GitHub
git push origin main

# Vercel connects and deploys automatically
```

## Deploy to Docker

### Build Image
```bash
docker build -t peerdash-server -f apps/server/Dockerfile .
```

### Run Container
```bash
docker run -e DATABASE_URL=... -p 3001:3001 peerdash-server
```

### Push to Registry
```bash
docker tag peerdash-server your-registry/peerdash-server:latest
docker push your-registry/peerdash-server:latest
```

## Troubleshooting

### "Cannot connect to database"
```bash
# Check DATABASE_URL
echo $DATABASE_URL

# Start PostgreSQL
brew services start postgresql

# Or with Docker:
docker run -d -p 5432:5432 postgres:16-alpine
```

### "Port 3001 already in use"
```bash
# Find process
lsof -i :3001

# Kill it
kill -9 <PID>

# Or change port
PORT=3002 npm run dev --workspace apps/server
```

### "Socket.io connection failed"
- Check CORS_ORIGIN in .env
- Ensure server is running on port 3001
- Clear browser cache and cookies

### "Files not encrypting"
- Verify TweetNaCl.js is installed
- Check browser console for errors
- Ensure both peers are on same version

## Monitoring

### View Logs
```bash
# Docker
docker-compose logs -f server
docker-compose logs -f postgres

# Local
npm run dev 
# (Errors appear in terminal)
```

### Database Status
```bash
# Check database
psql $DATABASE_URL -c "SELECT * FROM users;"

# Or use Prisma Studio
npx prisma studio
```

### Server Health
```bash
curl http://localhost:3001/health
```

## Next Steps

1. **Setup OAuth** - See IMPLEMENTATION_GUIDE.md
2. **Enable Encryption** - Already built-in, just verify in logs
3. **Add Stripe** - Follow IMPLEMENTATION_GUIDE.md
4. **Deploy** - See DEPLOYMENT.md
5. **Monitor** - Setup Sentry & DataDog

## Documentation

- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - Feature implementation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [PRODUCTION_ROADMAP.md](./PRODUCTION_ROADMAP.md) - Features & timeline
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment instructions

## Support

- Create GitHub Issues for bugs
- Discussions for features
- Email: support@peerdash.com

## License

MIT - See LICENSE file
