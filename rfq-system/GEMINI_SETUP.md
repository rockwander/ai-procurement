# Gemini AI Setup Guide

## Overview
This RFQ system uses **Google Gemini 2.5 Flash** for all AI-powered features, replacing the original Anthropic Claude integration.

## Why Gemini?
- **Free Tier**: Generous token limits with no upfront payment
- **Cost-Effective**: ~$0.15 per 1M tokens (averaged) for paid tier
- **Fast**: Optimized for speed with Flash model
- **Capable**: Supports up to 1M tokens input, 65K tokens output

## Setup Instructions

### 1. Get API Key
1. Visit: https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key (starts with `AQ.` or similar)

### 2. Configure Environment
Add your API key to `.env.local`:
```bash
GEMINI_API_KEY=your_api_key_here
```

### 3. Test Connection
```bash
npm run test:gemini
```

You should see:
```
✅ Success! Gemini API is working!
🎉 Your Gemini API key is configured correctly!
```

## AI Agents

All 5 AI agents now use Gemini 2.5 Flash:

1. **RFQ Drafting Agent** (`rfq-drafting.ts`)
   - Converts business requirements into structured RFQ documents
   - Ensures policy compliance
   - Temperature: 0.7

2. **Form Generation Agent** (`form-generation.ts`)
   - Creates dynamic quote submission forms
   - Generates fields based on line items
   - Temperature: 0.5

3. **Supplier Filtering Agent** (`supplier-filtering.ts`)
   - SQL-based filtering for speed
   - AI ranking and summarization
   - Temperature: 0.3

4. **Autofill Agent** (`autofill.ts`)
   - Extracts data from supplier documents
   - Chat-based assistance for form filling
   - Temperature: 0.5 (extraction), 0.7 (chat)

5. **Quote Evaluation Agent** (`quote-evaluation.ts`)
   - Applies procurement strategies
   - Awards line items to suppliers
   - Temperature: 0.3

## Cost Tracking

All AI operations are logged to the `ai_logs` table with:
- Input/output data
- Token usage (estimated)
- Cost in USD
- Duration in milliseconds
- Success/error status

## Troubleshooting

### API Key Invalid
- Verify key at: https://aistudio.google.com/apikey
- Check `.env.local` has correct format
- Ensure no extra spaces or quotes

### Model Not Found
- Current model: `gemini-2.5-flash`
- Run `npx tsx src/lib/list-models.ts` to see available models

### Rate Limits
- Free tier: Check your quota at Google AI Studio
- Paid tier: Contact Google Cloud support

## Migration from Claude

✅ **Completed:**
- Replaced `@anthropic-ai/sdk` with `@google/generative-ai`
- Updated all agent implementations
- Converted API calls to Gemini format
- Updated environment variables
- Added test utilities

The conversion maintains the same interfaces and functionality while using Gemini's API.
