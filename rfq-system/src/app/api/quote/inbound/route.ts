import { NextRequest, NextResponse } from 'next/server';
import { serverError } from '@/lib/api';
import { verifyInboundSignature, unwrapInbound } from '@/lib/inbound-email';
import { processInboundEmail } from '@/lib/quote-inbound';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Resend inbound webhook: a supplier replied to the RFQ invitation email.
// Verifies the Svix signature, then hands off to the shared inbound processor.
// The in-app Supplier Mailbox simulator calls that same processor directly.
// See REQUIREMENT_quote-via-email.md.
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    const ok = verifyInboundSignature(
      rawBody,
      {
        id: request.headers.get('svix-id'),
        timestamp: request.headers.get('svix-timestamp'),
        signature: request.headers.get('svix-signature'),
      },
      process.env.RESEND_INBOUND_SECRET
    );
    if (!ok) {
      return NextResponse.json({ error: 'bad signature' }, { status: 401 });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'bad payload' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const result = await processInboundEmail(unwrapInbound(json), appUrl);
    return NextResponse.json(result);
  } catch (error) {
    return serverError(error);
  }
}
