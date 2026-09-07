import { NextRequest, NextResponse } from 'next/server';
import { badRequest, notFound, serverError } from '@/lib/api';
import { loadQuoteContext } from '@/lib/quote-access';
import { extractText, isSupportedDoc, SUPPORTED_DOC_EXTENSIONS } from '@/lib/doc-extract';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Public: a supplier uploads a document (quote, price list, certificate, any
// format we can read) and gets back the extracted text to feed the AI
// assistant. The binary is not stored.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const ctx = await loadQuoteContext(token);
    if (!ctx) return notFound('This quote link is invalid');
    if (ctx.invitation.status === 'submitted') {
      return badRequest('This quote has been submitted and can no longer be edited');
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return badRequest('file is required');
    if (!isSupportedDoc(file.name)) {
      return badRequest(`Unsupported file type. Allowed: ${SUPPORTED_DOC_EXTENSIONS.join(', ')}`);
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const extracted = await extractText(file.name, buf);
    if (!extracted.text) return badRequest('No text could be read from that file');

    return NextResponse.json({
      name: extracted.name,
      text: extracted.text,
      chars: extracted.text.length,
      truncated: extracted.truncated,
    });
  } catch (error) {
    return serverError(error);
  }
}
