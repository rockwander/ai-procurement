import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, serverError } from '@/lib/api';
import { SAMPLE_RFQS } from '@/lib/sample-rfqs';

// List the available sample documents.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    return NextResponse.json({
      docs: SAMPLE_RFQS.map((r) => ({
        slug: r.slug,
        fileName: r.fileName,
        title: r.title,
        category: r.category,
        buyer: r.buyer.name,
        lineItems: r.lineItems.length,
        currency: r.currency,
      })),
    });
  } catch (error) {
    return serverError(error);
  }
}
