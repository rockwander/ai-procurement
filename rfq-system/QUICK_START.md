# Quick Start - 5 Minutes to Running

## Prerequisites
- Node.js 18+
- Anthropic API key (sign up at https://console.anthropic.com)

## Setup (One-Time)

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.local.example .env.local

# 3. Add your Anthropic API key to .env.local
# ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# 4. Generate JWT secret and add to .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output to JWT_SECRET in .env.local

# 5. Setup database
npm run db:push

# 6. Add sample data
npm run db:seed
```

## Run

```bash
npm run dev
```

Visit: **http://localhost:3000**

Login: **admin@procurement.ai** / **admin123**

## Test Services

```bash
# Test email (optional)
npm run test:email

# Test AI (requires ANTHROPIC_API_KEY)
npm run test:anthropic
```

## What's Working

✅ **Backend (100%)**
- All 5 AI agents
- Email service
- PDF generation
- Database (SQLite local)
- Authentication

✅ **Frontend (Basic)**
- Login page
- Dashboard overview
- Home page

⏳ **To Be Completed**
- RFQ creation workflow UI
- Supplier management UI
- Quote submission UI
- Quote evaluation UI

## Next Steps

1. Try logging in
2. Explore the dashboard
3. Check `IMPLEMENTATION_STATUS.md` for details
4. Review `START_HERE.md` for full documentation

## Need Help?

- See `SERVICES_CHECKLIST.md` for API key setup
- See `README.md` for complete documentation
- Check `.env.local.example` for all environment variables
