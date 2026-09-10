import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { quoteComments } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from '@/lib/api';

// Edit a still-open comment's text.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { commentId } = await params;

    const body = await request.json();
    const { comment } = body as { comment?: string };
    if (!comment || !comment.trim()) return badRequest('comment is required');

    const [existing] = await db
      .select()
      .from(quoteComments)
      .where(eq(quoteComments.id, commentId));
    if (!existing) return notFound('Comment not found');
    if (existing.status !== 'open') {
      return badRequest('This comment has already been sent and cannot be edited');
    }

    const [updated] = await db
      .update(quoteComments)
      .set({ comment: comment.trim() })
      .where(eq(quoteComments.id, commentId))
      .returning();

    return NextResponse.json({ comment: updated });
  } catch (error) {
    return serverError(error);
  }
}

// Delete a still-open comment.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { commentId } = await params;

    const res = await db
      .delete(quoteComments)
      .where(and(eq(quoteComments.id, commentId), eq(quoteComments.status, 'open')))
      .returning();

    if (res.length === 0) {
      return badRequest('Comment not found or already sent');
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
