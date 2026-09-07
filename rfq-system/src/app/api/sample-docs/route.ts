import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, serverError } from '@/lib/api';
import { listSampleDocs } from '@/lib/sample-docs';

// List the available sample documents.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    return NextResponse.json({ docs: listSampleDocs() });
  } catch (error) {
    return serverError(error);
  }
}
