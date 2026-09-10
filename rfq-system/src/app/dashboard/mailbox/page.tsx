'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, Button, Textarea, Spinner, ErrorText, PaperclipIcon } from '@/components/ui';
import { api } from '@/lib/fetcher';
import { SUPPORTED_DOC_EXTENSIONS } from '@/lib/doc-types';

interface MailboxEmail {
  id: string;
  recipientEmail: string;
  subject: string;
  type:
    | 'rfq_invitation'
    | 'reminder'
    | 'purchase_order'
    | 'quote_ack'
    | 'quote_review'
    | 'quote_negotiation'
    | 'quote_revised';
  status: string;
  errorMessage: string | null;
  bodyHtml: string | null;
  attachments: Array<{ filename: string; bytes: number }> | null;
  sentAt: string;
  rfqInvitationId: string | null;
  rfqTitle: string | null;
  supplierName: string | null;
  supplierEmail: string | null;
  invitationStatus: string | null;
  canReply: boolean;
  fromSupplier: boolean;
}

const TYPE_LABEL: Record<MailboxEmail['type'], string> = {
  rfq_invitation: 'Invitation',
  reminder: 'Reminder',
  purchase_order: 'Purchase order',
  quote_ack: 'Quote reply / ack',
  quote_review: 'Review request',
  quote_negotiation: 'Negotiation request',
  quote_revised: 'Revised quote',
};

export default function MailboxPage() {
  const [emails, setEmails] = useState<MailboxEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MailboxEmail | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const load = useCallback(() => {
    return api<{ emails: MailboxEmail[] }>('/api/mailbox')
      .then((d) => setEmails(d.emails))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function open(e: MailboxEmail) {
    setSelected(e);
    setReplyBody('');
    setReplyFiles([]);
    setError('');
    setFlash('');
  }

  async function sendReply() {
    if (!selected) return;
    setSending(true);
    setError('');
    setFlash('');
    try {
      const fd = new FormData();
      fd.append('emailLogId', selected.id);
      fd.append('body', replyBody);
      for (const f of replyFiles) fd.append('files', f);
      const raw = await fetch('/api/mailbox/reply', { method: 'POST', body: fd });
      const res = (await raw.json()) as { result: { status: string }; skipped: string[]; error?: string };
      if (!raw.ok) throw new Error(res.error || `Request failed (${raw.status})`);
      const outcome: Record<string, string> = {
        submitted: 'Quotation auto-submitted — everything was present and confident.',
        'draft-blocked': 'Saved as a draft — required fields are still missing. See the ack email.',
        'draft-verify': 'Saved as a draft — some values need verifying. See the ack email.',
        'sender-mismatch': 'Rejected — sender did not match the supplier contact.',
        'no-ref': 'Rejected — no RFQ reference in the subject.',
        'already-submitted': 'Rejected — a quotation was already submitted for this RFQ.',
        'unknown-token': 'Rejected — the reference did not match any invitation.',
      };
      setFlash(
        (outcome[res.result.status] ?? res.result.status) +
          (res.skipped.length ? ` (couldn't read: ${res.skipped.join(', ')})` : '')
      );
      setReplyBody('');
      setReplyFiles([]);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Supplier Mailbox</h1>
        <button onClick={load} className="text-sm text-blue-600 hover:underline">
          Refresh
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Every email the system has sent. Open an invitation and{' '}
        <strong>reply as the supplier</strong> — attach a quote or type prices — to
        test accepting quotations by email. This is a POC stand-in for a real inbox.
      </p>

      {loading ? (
        <Spinner label="Loading mailbox…" />
      ) : (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* List — hidden on mobile once an email is open (detail takes over) */}
          <div className={`lg:col-span-2 ${selected ? 'hidden lg:block' : ''}`}>
            <Card className="divide-y divide-gray-100 overflow-hidden">
              {emails.length === 0 && (
                <div className="p-6 text-sm text-gray-500">
                  No emails yet. Send an RFQ to a supplier first.
                </div>
              )}
              {emails.map((e) => (
                <button
                  key={e.id}
                  onClick={() => open(e)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                    selected?.id === e.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge>
                      {e.fromSupplier ? '← from supplier' : TYPE_LABEL[e.type]}
                    </Badge>
                    {e.status === 'failed' && !e.fromSupplier && (
                      <span className="text-xs text-amber-600">not delivered (no mail domain)</span>
                    )}
                    {e.canReply && (
                      <span className="text-xs text-green-700">reply as supplier ↩</span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {e.subject.replace(/\s*\[ref:[^\]]+\]\s*/, ' ')}
                  </div>
                  <div className="text-xs text-gray-500">
                    {e.fromSupplier
                      ? `${e.supplierName ?? 'Supplier'} → procurement`
                      : `to ${e.recipientEmail}${e.supplierName ? ` · ${e.supplierName}` : ''}`}{' '}
                    · {new Date(e.sentAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </Card>
          </div>

          {/* Reader + reply — hidden on mobile until an email is open */}
          <div className={`lg:col-span-3 ${selected ? '' : 'hidden lg:block'}`}>
            {!selected ? (
              <Card className="p-8 text-center text-gray-400">
                Select an email to read it.
              </Card>
            ) : (
              <Card className="p-4 sm:p-5 space-y-4">
                <button
                  onClick={() => setSelected(null)}
                  className="lg:hidden text-sm text-blue-600 hover:underline -mb-1"
                >
                  ← Back to mailbox
                </button>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge>{TYPE_LABEL[selected.type]}</Badge>
                    {selected.invitationStatus && (
                      <span className="text-xs text-gray-500">
                        invitation: {selected.invitationStatus}
                      </span>
                    )}
                  </div>
                  <h2 className="font-semibold text-gray-900">{selected.subject}</h2>
                  <p className="text-xs text-gray-500">
                    to {selected.recipientEmail}
                    {selected.rfqTitle ? ` · RFQ: ${selected.rfqTitle}` : ''}
                  </p>
                </div>

                {selected.attachments && selected.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selected.attachments.map((a, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded px-2 py-1 text-gray-600"
                      >
                        <PaperclipIcon className="w-3 h-3" />
                        {a.filename}
                      </span>
                    ))}
                  </div>
                )}

                <div
                  className="border border-gray-200 rounded-lg p-3 sm:p-4 bg-white max-h-[60vh] lg:max-h-[420px] overflow-auto text-sm [&_a]:text-blue-600 [&_a]:underline [&_a]:break-words [&_h1]:text-lg [&_h1]:font-bold [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full [&_table]:block [&_table]:overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: sanitizeBody(selected.bodyHtml) }}
                />

                {/* Reply as supplier */}
                {selected.canReply ? (
                  <div className="border-t border-gray-200 pt-4 space-y-3">
                    <div className="text-sm font-medium text-gray-900">
                      Reply as {selected.supplierName || 'the supplier'}
                    </div>
                    <p className="text-xs text-gray-500 break-words">
                      From: <span className="font-mono break-all">{selected.supplierEmail}</span> ·
                      subject kept as “Re: …” so the reference matches.
                    </p>
                    <Textarea
                      rows={4}
                      placeholder="e.g. Our price is ₹42 per piece on line 1, ₹38 on line 2. Lead time 3 weeks."
                      value={replyBody}
                      onChange={(ev) => setReplyBody(ev.target.value)}
                    />
                    <label className="inline-flex items-center gap-2 text-sm text-blue-600 cursor-pointer">
                      <PaperclipIcon />
                      Attach documents
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        accept={SUPPORTED_DOC_EXTENSIONS.join(',')}
                        onChange={(ev) =>
                          setReplyFiles(Array.from(ev.target.files ?? []))
                        }
                      />
                    </label>
                    {replyFiles.length > 0 && (
                      <div className="text-xs text-gray-600">
                        {replyFiles.map((f) => f.name).join(', ')}
                      </div>
                    )}
                    {error && <ErrorText>{error}</ErrorText>}
                    {flash && (
                      <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
                        {flash}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        onClick={sendReply}
                        disabled={sending || (!replyBody.trim() && replyFiles.length === 0)}
                      >
                        {sending ? 'Sending…' : 'Send reply'}
                      </Button>
                      {selected.rfqInvitationId && (
                        <a
                          href={`/quote/${''}`}
                          onClick={(ev) => {
                            ev.preventDefault();
                            // open the supplier link so the buyer can see the pre-filled preview
                            openSupplierLink(selected);
                          }}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Open the supplier link →
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 border-t border-gray-200 pt-4">
                    This email can't be replied to (no RFQ reference / not tied to a supplier).
                  </p>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

// Stored email bodies are full HTML documents with their own <style> block
// (max-width:600px containers, coloured headers…). Injected via innerHTML that
// style leaks into the whole page, so strip <head>/<style>/<script> and keep
// just the body markup.
function sanitizeBody(html: string | null): string {
  if (!html) return '<p style="color:#9ca3af;">(no stored body)</p>';
  let s = html
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(s);
  if (body) s = body[1];
  return s.replace(/<\/?(html|body)[^>]*>/gi, '');
}

// The mailbox list doesn't carry the token (it's not in email_logs). Pull it
// from the subject marker instead.
function openSupplierLink(email: MailboxEmail) {
  const m = /\[ref:\s*[0-9a-fA-F-]+\s*\/\s*([0-9a-f]{16,})\s*\]/.exec(email.subject);
  if (m) window.open(`/quote/${m[1]}`, '_blank');
}
