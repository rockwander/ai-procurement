# AI Procurement - Agentic RFQ System

## Project Location

The active project is in the **`rfq-system/`** directory.

## Quick Start

```bash
cd rfq-system
npm install
cp .env.local.example .env.local
# Add your ANTHROPIC_API_KEY and JWT_SECRET to .env.local
npm run db:push
npm run db:seed
npm run dev
```

Visit: http://localhost:3000

## Documentation

All documentation is in the `rfq-system/` directory:

- **START_HERE.md** - Overview and getting started
- **QUICK_START.md** - 5-minute setup guide
- **README.md** - Complete documentation
- **SERVICES_CHECKLIST.md** - API key signup guide
- **IMPLEMENTATION_STATUS.md** - What's complete vs. todo

## Architecture

**Hybrid Database**: SQLite (local) + Vercel Postgres (production)

**AI Provider**: Anthropic Claude 3.5 Sonnet

**Email**: Resend

**Hosting**: Vercel

## Services Needed

1. Anthropic (AI) - https://console.anthropic.com
2. Resend (Email) - https://resend.com
3. Vercel (Hosting) - https://vercel.com

See `rfq-system/SERVICES_CHECKLIST.md` for detailed signup instructions.

## What's Built

✅ **Complete Backend** (All AI agents, email, PDF, auth)
✅ **Basic Frontend** (Login, dashboard, home)
⏳ **Remaining** (Full UI workflow pages)

Progress: **~45% complete**

---

**Note**: The `/packages/` directory contains the old architecture and is not used. This project is a fresh implementation optimized for the RFQ use case.
