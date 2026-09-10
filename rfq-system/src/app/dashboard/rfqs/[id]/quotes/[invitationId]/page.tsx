'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Spinner, ErrorText, StatusBadge, Textarea } from '@/components/ui';
import { QuoteReviewDoc, type ReviewComment } from '@/components/QuoteReviewDoc';
import { api } from '@/lib/fetcher';
import type { FormSchema } from '@/lib/form-schema';

interface DetailData {
  rfq: {
    id: string;
    title: string;
    currency: string;
    formSchema: FormSchema;
  };
  invitation: { id: string; status: string; token: string };
  supplier: { id: string; companyName: string };
  lineItems: Array<{ id: string; itemDescription: string; quantity: number; unit: string }>;
  submission: {
    formData: Record<string, unknown>;
    lineItems: Array<Record<string, unknown>>;
    notes: string;
    exceptions: Array<{ re: string; comment: string }>;
    totalAmount: number;
    currency: string;
    revision: number;
    submittedAt: string;
    revisedAt: string | null;
  };
  comments: ReviewComment[];
}

export default function QuoteDetailPage() {
  const { id, invitationId } = useParams<{ id: string; invitationId: string }>();
  const router = useRouter();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  // the field a new comment is being written for
  const [draftFor, setDraftFor] = useState<
    { fieldId: string; fieldLabel: string; quotedValue: string | null } | null
  >(null);
  const [draftText, setDraftText] = useState('');

  const load = useCallback(() => {
    api<DetailData>(`/api/rfqs/${id}/quotes/${invitationId}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, invitationId]);

  useEffect(() => {
    load();
  }, [load]);

  const openComments = useMemo(
    () => (data?.comments ?? []).filter((c) => c.status === 'open'),
    [data]
  );
  const sentRounds = useMemo(() => {
    const rounds = new Map<number, ReviewComment[]>();
    for (const c of data?.comments ?? []) {
      if (c.status === 'open') continue;
      if (!rounds.has(c.round)) rounds.set(c.round, []);
      rounds.get(c.round)!.push(c);
    }
    return [...rounds.entries()].sort((a, b) => b[0] - a[0]);
  }, [data]);

  async function saveComment() {
    if (!draftFor || !draftText.trim()) return;
    try {
      await api(`/api/rfqs/${id}/quotes/${invitationId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ ...draftFor, comment: draftText.trim() }),
      });
      setDraftFor(null);
      setDraftText('');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function editComment(commentId: string, comment: string) {
    try {
      await api(`/api/rfqs/${id}/quotes/${invitationId}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ comment }),
      });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function deleteComment(commentId: string) {
    try {
      await api(`/api/rfqs/${id}/quotes/${invitationId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function send(intent: 'review' | 'negotiation') {
    setSending(true);
    setError('');
    try {
      await api(`/api/rfqs/${id}/quotes/${invitationId}/send`, {
        method: 'POST',
        body: JSON.stringify({ intent }),
      });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <Spinner label="Loading quote…" />
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell>
        <ErrorText>{error || 'Not found'}</ErrorText>
      </AppShell>
    );
  }

  const negotiating = data.invitation.status === 'negotiating';

  return (
    <AppShell>
      <div className="mb-1 flex items-center gap-3">
        <button
          onClick={() => router.push(`/dashboard/rfqs/${id}/quotes`)}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Compare
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {data.supplier.companyName}
        </h1>
        <StatusBadge status={data.invitation.status} />
        {data.submission.revision > 0 && (
          <span className="text-xs text-gray-500">
            revision {data.submission.revision}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-6">
        {data.rfq.title} · headline total{' '}
        {data.submission.currency}{' '}
        {data.submission.totalAmount.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })}
      </p>

      {error && (
        <div className="mb-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      {negotiating && (
        <Card className="p-3 mb-4 border-purple-200 bg-purple-50 text-sm text-purple-800">
          Sent back to the supplier for{' '}
          {data.comments.find((c) => c.status === 'sent')?.intent === 'negotiation'
            ? 'negotiation'
            : 'review'}
          . Waiting for a revised quotation. New comments will go in the next round.
        </Card>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        {/* Quote document */}
        <Card className="p-5 min-w-0">
          <QuoteReviewDoc
            supplierName={data.supplier.companyName}
            rfqTitle={data.rfq.title}
            rfqCurrency={data.rfq.currency}
            schema={data.rfq.formSchema}
            lineItems={data.lineItems}
            submission={data.submission}
            comments={data.comments}
            onAddComment={(c) => {
              setDraftFor(c);
              setDraftText('');
            }}
          />
        </Card>

        {/* Comment panel */}
        <div className="lg:sticky lg:top-6 space-y-4">
          {draftFor && (
            <Card className="p-4 border-blue-200">
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Comment on
              </p>
              <p className="text-sm font-medium text-gray-900">
                {draftFor.fieldLabel}
              </p>
              {draftFor.quotedValue != null && (
                <p className="text-xs text-gray-500 mb-2">
                  quoted: {draftFor.quotedValue}
                </p>
              )}
              <Textarea
                rows={3}
                autoFocus
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="e.g. Can you bring this to ₹95? / You left lead time blank here."
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={saveComment} disabled={!draftText.trim()}>
                  Add comment
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraftFor(null);
                    setDraftText('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <p className="text-xs font-medium text-gray-500 uppercase mb-3">
              This round ({openComments.length})
            </p>
            {openComments.length === 0 ? (
              <p className="text-sm text-gray-400">
                Click any value in the quotation to comment on it. Add all your
                points, then send for review or negotiation.
              </p>
            ) : (
              <ul className="space-y-3">
                {openComments.map((c) => (
                  <OpenCommentRow
                    key={c.id}
                    c={c}
                    onEdit={editComment}
                    onDelete={deleteComment}
                  />
                ))}
              </ul>
            )}

            {openComments.length > 0 && (
              <div className="mt-4 border-t border-gray-200 pt-3 space-y-2">
                <Button
                  className="w-full"
                  onClick={() => send('review')}
                  disabled={sending}
                >
                  {sending ? 'Sending…' : 'Send for Review'}
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => send('negotiation')}
                  disabled={sending}
                >
                  {sending ? 'Sending…' : 'Send for Negotiation'}
                </Button>
                <p className="text-[11px] text-gray-400">
                  Both email the supplier with these comments and reopen their
                  quotation for editing. The wording differs: “review” asks for
                  clarification/completion, “negotiation” asks to revise terms.
                </p>
              </div>
            )}
          </Card>

          {sentRounds.map(([round, cs]) => (
            <Card key={round} className="p-4">
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                Round {round} · {cs[0].intent} ·{' '}
                {cs.every((c) => c.status === 'addressed') ? 'addressed' : 'sent'}
              </p>
              <ul className="space-y-2">
                {cs.map((c) => (
                  <li key={c.id} className="text-sm">
                    <span className="font-medium text-gray-800">
                      {c.fieldLabel}
                    </span>
                    {c.quotedValue != null && (
                      <span className="text-gray-400"> ({c.quotedValue})</span>
                    )}
                    <p className="text-gray-600">{c.comment}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          <p className="text-xs text-gray-400">
            <Link
              href={`/dashboard/rfqs/${id}/quotes`}
              className="text-blue-600 hover:underline"
            >
              Back to comparison
            </Link>
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function OpenCommentRow({
  c,
  onEdit,
  onDelete,
}: {
  c: ReviewComment;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.comment);
  return (
    <li className="text-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-gray-800">{c.fieldLabel}</span>
        <span className="shrink-0 space-x-2 text-xs">
          <button
            onClick={() => setEditing((e) => !e)}
            className="text-blue-600 hover:underline"
          >
            {editing ? 'cancel' : 'edit'}
          </button>
          <button
            onClick={() => onDelete(c.id)}
            className="text-red-500 hover:underline"
          >
            remove
          </button>
        </span>
      </div>
      {c.quotedValue != null && (
        <p className="text-xs text-gray-400">quoted: {c.quotedValue}</p>
      )}
      {editing ? (
        <div className="mt-1">
          <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <button
            onClick={() => {
              onEdit(c.id, text);
              setEditing(false);
            }}
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            save
          </button>
        </div>
      ) : (
        <p className="text-gray-600">{c.comment}</p>
      )}
    </li>
  );
}
