# Services Sign-Up Checklist

Complete this checklist before running the application.

---

## Required Services: 3

### ✅ Service 1: Anthropic (AI Provider)

**Why**: Powers all AI agents (RFQ drafting, supplier filtering, quote evaluation, auto-fill)

**Signup URL**: https://console.anthropic.com

**Steps**:
1. [ ] Sign up with email
2. [ ] Verify email address
3. [ ] Go to **API Keys** section
4. [ ] Click **"Create Key"**
   - Name: `ai-procurement-poc`
5. [ ] **COPY KEY IMMEDIATELY** (shown only once)
   ```
   Format: sk-ant-api03-xxxxxxxxxxxxxxxxx
   ```
6. [ ] Go to **Settings** → **Billing**
7. [ ] Add payment method (credit card required)
8. [ ] Set spending limit: **$50/month**
9. [ ] Set notification alert: **$25**

**Cost**: ~$20-50/month (pay-as-you-go)

**Add to `.env.local`**:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

---

### ✅ Service 2: Resend (Email Service)

**Why**: Sends RFQ invitations, reminders, and purchase orders

**Signup URL**: https://resend.com

**Steps**:
1. [ ] Sign up with email or GitHub
2. [ ] Verify email
3. [ ] Go to **API Keys** in sidebar
4. [ ] Click **"Create API Key"**
   - Name: `ai-procurement-poc`
   - Permission: **Sending access**
5. [ ] **COPY KEY**
   ```
   Format: re_xxxxxxxxxxxxxxxxx
   ```

**Optional - Custom Domain** (recommended for production, skip for POC):
1. [ ] Go to **Domains** → **Add Domain**
2. [ ] Enter your domain (e.g., `yourdomain.com`)
3. [ ] Add DNS records provided by Resend (SPF, DKIM, DMARC)
4. [ ] Wait for verification (5-60 minutes)
5. [ ] Use `noreply@yourdomain.com` as sender

**For POC**: Use default sender `onboarding@resend.dev` (may go to spam)

**Cost**: $0 (free tier: 3,000 emails/month)

**Add to `.env.local`**:
```bash
RESEND_API_KEY=re_your-key-here
EMAIL_FROM=onboarding@resend.dev
# Or if using custom domain:
# EMAIL_FROM=noreply@yourdomain.com
```

---

### ✅ Service 3: Vercel (Hosting)

**Why**: Deploys the application and provides Postgres database

**Signup URL**: https://vercel.com

**Steps**:
1. [ ] Sign up with **GitHub account** (required for easy deployment)
2. [ ] Authorize Vercel to access your repositories
3. [ ] Install Vercel GitHub App

**Vercel Postgres Setup** (do this AFTER deploying):
1. [ ] Deploy your project to Vercel first (see README.md)
2. [ ] Go to project dashboard
3. [ ] Click **Storage** tab
4. [ ] Click **Create Database**
5. [ ] Select **Postgres**
6. [ ] Click **Create** (free tier auto-selected)
7. [ ] Environment variables auto-populate ✨

**Optional - Vercel CLI**:
```bash
npm i -g vercel
vercel login
```

**Cost**: $0 (free tier: 256MB database, 100GB bandwidth)

**Environment Variables** (add in Vercel dashboard after deployment):
```bash
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=onboarding@resend.dev
JWT_SECRET=your-generated-secret
NEXT_PUBLIC_APP_URL=https://your-project.vercel.app
```

---

## Local Development Setup

### Generate JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output to `.env.local`:

```bash
JWT_SECRET=<paste-generated-secret-here>
```

### Complete `.env.local` File

Create file: `rfq-system/.env.local`

```bash
# Database (SQLite for local, auto-switches to Postgres on Vercel)
DATABASE_URL=file:./data/local.db

# Anthropic AI
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# Resend Email
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=onboarding@resend.dev

# JWT Secret (generate with command above)
JWT_SECRET=your-generated-secret-paste-here

# App Config
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

---

## Verification Tests

### Test Anthropic API

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hi"}]
  }'
```

**Expected**: JSON response with AI message

### Test Resend API

```bash
curl -X POST 'https://api.resend.com/emails' \
  -H "Authorization: Bearer YOUR_RESEND_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "onboarding@resend.dev",
    "to": "your-email@example.com",
    "subject": "Test Email",
    "html": "<p>It works!</p>"
  }'
```

**Expected**: JSON response with email ID

### Or Use Built-in Tests

```bash
# After installing npm packages
npm run test:anthropic
npm run test:email
```

---

## Final Checklist

Before running `npm run dev`:

- [ ] Node.js 18+ installed
- [ ] Anthropic account created
- [ ] Anthropic API key obtained and added to `.env.local`
- [ ] Spending limit set on Anthropic account
- [ ] Resend account created
- [ ] Resend API key obtained and added to `.env.local`
- [ ] JWT secret generated and added to `.env.local`
- [ ] `.env.local` file created with all variables
- [ ] Ran `npm install`
- [ ] Ran `npm run db:push` (creates database tables)
- [ ] Ran `npm run db:seed` (populates sample data)

---

## Cost Summary

| Service | Setup | Monthly Cost | Notes |
|---------|-------|--------------|-------|
| **Anthropic** | 5 min | $20-50 | Pay-as-you-go, set spending limit |
| **Resend** | 3 min | $0 | Free tier: 3k emails/month |
| **Vercel** | 2 min | $0 | Free tier: 256MB DB, 100GB bandwidth |
| **Total** | **10 min** | **$20-50** | Only AI costs |

---

## Support Links

- **Anthropic Console**: https://console.anthropic.com
- **Anthropic Docs**: https://docs.anthropic.com
- **Resend Dashboard**: https://resend.com/overview
- **Resend Docs**: https://resend.com/docs
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Vercel Docs**: https://vercel.com/docs

---

## Next Steps

1. ✅ Complete all checkboxes above
2. ✅ Create `.env.local` with all API keys
3. ✅ Run the application:
   ```bash
   cd rfq-system
   npm install
   npm run db:push
   npm run db:seed
   npm run dev
   ```
4. ✅ Visit: http://localhost:3000
5. ✅ Login: admin@procurement.ai / admin123

---

## Troubleshooting

### "Invalid API key" errors
- Check key format matches examples above
- Ensure no extra spaces in `.env.local`
- Anthropic keys start with `sk-ant-api03-`
- Resend keys start with `re_`

### "Cannot connect to database"
- Ensure `npm run db:push` completed successfully
- Check `/data` directory was created
- Try deleting `/data` folder and run `npm run db:push` again

### "Module not found" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### Email delivery issues
- Check Resend dashboard logs
- Verify sender email matches `.env.local`
- Check recipient spam folder
- For custom domain: ensure DNS records verified

---

**Ready to start building!** 🚀
