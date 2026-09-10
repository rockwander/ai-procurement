import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqInvitations, quoteComments } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from '@/lib/api';

/** The round a new comment belongs to: the current 'open' round, else the next. */
async function currentRound(invitationId: string): Promise<number> {
  const rows = await db
    .select({ round: quoteComments.round, status: quoteComments.status })
    .from(quoteComments)
    .where(eq(quoteComments.rfqInvitationId, invitationId));
  if (rows.length === 0) return 1;
  const open = rows.filter((r) => r.status === 'open').map((r) => r.round);
  if (open.length) return Math.max(...open);
  return Math.max(...rows.map((r) => r.round)) + 1;
}

// Add a comment on a submitted quote (stays 'open' until the buyer sends the round).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id, invitationId } = await params;

    const [inv] = await db
      .select()
      .from(rfqInvitations)
      .where(and(eq(rfqInvitations.id, invitationId), eq(rfqInvitations.rfqId, id)));
    if (!inv) return notFound('Invitation not found');

    const body = await request.json();
    const { fieldId, fieldLabel, quotedValue, comment } = body as {
      fieldId?: string;
      fieldLabel?: string;
      quotedValue?: string | null;
      comment?: string;
    };
    if (!fieldId || !fieldLabel) return badRequest('fieldId and fieldLabel are required');
    if (!comment || !comment.trim()) return badRequest('comment is required');

    const round = await currentRound(invitationId);

    const [saved] = await db
      .insert(quoteComments)
      .values({
        rfqInvitationId: invitationId,
        round,
        fieldId,
        fieldLabel,
        quotedValue: quotedValue ?? null,
        comment: comment.trim(),
        createdBy: user.userId,
      })
      .returning();

    return NextResponse.json({ comment: saved }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

// List comments for this invitation.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { invitationId } = await params;

    const comments = await db
      .select()
      .from(quoteComments)
      .where(eq(quoteComments.rfqInvitationId, invitationId))
      .orderBy(asc(quoteComments.createdAt));

    return NextResponse.json({ comments });
  } catch (error) {
    return serverError(error);
  }
}
