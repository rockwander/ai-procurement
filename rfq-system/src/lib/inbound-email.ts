// Parse and validate an inbound supplier email (Resend inbound webhook) into
// the pieces the quote-via-email flow needs. See REQUIREMENT_quote-via-email.md
// §2.

import { createHmac, timingSafeEqual } from 'crypto';
import { parseRefMarker } from '@/lib/email';
import { extractText, isSupportedDoc } from '@/lib/doc-extract';

// ---------------------------------------------------------------------------
// Webhook signature
// ---------------------------------------------------------------------------

/**
 * Resend signs webhook payloads (Svix-style headers: svix-id, svix-timestamp,
 * svix-signature). We verify with the shared secret in RESEND_INBOUND_SECRET.
 * The secret is base64 after a "whsec_" prefix.
 */
export function verifyInboundSignature(
  rawBody: string,
  headers: {
    id?: string | null;
    timestamp?: string | null;
    signature?: string | null;
  },
  secret: string | undefined
): boolean {
  if (!secret) {
    // No secret configured — refuse in production, allow in dev for local test.
    return process.env.NODE_ENV !== 'production';
  }
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', key).update(signedContent).digest('base64');

  // svix-signature is a space-separated list of "v1,<sig>"
  for (const part of signature.split(' ')) {
    const sig = part.includes(',') ? part.split(',')[1] : part;
    try {
      const a = Buffer.from(sig, 'base64');
      const b = Buffer.from(expected, 'base64');
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      // malformed segment — keep checking the rest
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Payload shape (Resend inbound)
// ---------------------------------------------------------------------------

export interface InboundAttachment {
  filename?: string;
  /** base64 content */
  content?: string;
  contentType?: string;
}

export interface InboundEmailPayload {
  from?: string | { address?: string; name?: string };
  to?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  attachments?: InboundAttachment[];
}

/** Resend wraps the message as { type, data: {...} }; tolerate both. */
export function unwrapInbound(body: unknown): InboundEmailPayload {
  const b = body as Record<string, unknown>;
  if (b && typeof b === 'object' && 'data' in b && b.data && typeof b.data === 'object') {
    return b.data as InboundEmailPayload;
  }
  return (b ?? {}) as InboundEmailPayload;
}

export function senderAddress(from: InboundEmailPayload['from']): string {
  if (!from) return '';
  if (typeof from === 'string') {
    const m = /<([^>]+)>/.exec(from);
    return (m ? m[1] : from).trim().toLowerCase();
  }
  return (from.address ?? '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Body & attachments → documentTexts for the Autofill agent
// ---------------------------------------------------------------------------

const SIG_SPLIT_RE = /^(--\s*$|__+\s*$|sent from my |on .+ wrote:|-----original message-----)/im;

/** Plain-text body, HTML stripped to text if that's all there is. */
export function bodyText(payload: InboundEmailPayload): string {
  if (payload.text && payload.text.trim()) return payload.text.trim();
  if (payload.html && payload.html.trim()) {
    return payload.html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return '';
}

/** Drop an obvious quoted trailer / signature so the agent sees just the message. */
export function trimQuotedTrailer(text: string): string {
  const idx = text.search(SIG_SPLIT_RE);
  if (idx > 40) return text.slice(0, idx).trim();
  return text;
}

export interface ParsedInbound {
  ref: { rfqId: string; token: string } | null;
  sender: string;
  subject: string;
  body: string;
  documentTexts: string[];
  unreadableAttachments: string[];
}

export async function parseInboundEmail(
  payload: InboundEmailPayload
): Promise<ParsedInbound> {
  const subject = payload.subject ?? '';
  const ref = parseRefMarker(subject);
  const sender = senderAddress(payload.from);

  const rawBody = bodyText(payload);
  const body = trimQuotedTrailer(rawBody);

  const documentTexts: string[] = [];
  const unreadableAttachments: string[] = [];

  if (body.trim()) documentTexts.push(`Email from the supplier:\n\n${body}`);

  for (const att of payload.attachments ?? []) {
    const name = att.filename || 'attachment';
    if (!att.content || !isSupportedDoc(name)) {
      unreadableAttachments.push(name);
      continue;
    }
    try {
      const buf = Buffer.from(att.content, 'base64');
      const extracted = await extractText(name, buf);
      if (extracted.text.trim()) {
        documentTexts.push(`Attachment "${name}":\n\n${extracted.text}`);
      } else {
        unreadableAttachments.push(name);
      }
    } catch {
      unreadableAttachments.push(name);
    }
  }

  return { ref, sender, subject, body, documentTexts, unreadableAttachments };
}
