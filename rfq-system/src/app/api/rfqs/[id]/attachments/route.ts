import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqs, rfqDraftMessages } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  getAuthUser,
  unauthorized,
  notFound,
  badRequest,
  serverError,
} from '@/lib/api';
import { extractText, isSupportedDoc, SUPPORTED_DOC_EXTENSIONS, sanitizeText } from '@/lib/doc-extract';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Attach a document to the create-RFQ chat. The file is parsed to text
 * server-side; only the text is stored (as an 'attachment' message). Accepts
 * a multipart upload (`file`) or a JSON body with `{ name, text }` for
 * paste-as-content.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id } = await params;

    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id));
    if (!rfq) return notFound('RFQ not found');
    if (rfq.status !== 'draft') {
      return badRequest('This RFQ has already been sent and can no longer be edited');
    }

    const contentType = request.headers.get('content-type') || '';
    let name = 'pasted-content.txt';
    let text = '';
    let truncated = false;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return badRequest('file is required');
      if (!isSupportedDoc(file.name)) {
        return badRequest(
          `Unsupported file type. Allowed: ${SUPPORTED_DOC_EXTENSIONS.join(', ')}`
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const extracted = await extractText(file.name, buf);
      name = extracted.name;
      text = extracted.text;
      truncated = extracted.truncated;
    } else {
      const body = await request.json();
      name = String(body.name || 'pasted-content.txt');
      text = sanitizeText(String(body.text || ''));
    }

    if (!text) return badRequest('No text could be extracted from the document');

    const [saved] = await db
      .insert(rfqDraftMessages)
      .values({
        rfqId: id,
        role: 'user',
        kind: 'attachment',
        content: text,
        attachmentName: name,
      })
      .returning();

    return NextResponse.json({
      attachment: {
        id: saved.id,
        name,
        chars: text.length,
        truncated,
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
