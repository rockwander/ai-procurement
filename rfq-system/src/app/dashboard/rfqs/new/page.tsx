'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { RFQDocumentBuilder } from '@/components/RFQDocumentBuilder';
import { OutlineReview } from '@/components/OutlineReview';
import { Button, Card, Spinner, ErrorText } from '@/components/ui';
import { api } from '@/lib/fetcher';
import type { RFQDocument } from '@/lib/rfq-document';
import type { RFQOutline } from '@/lib/rfq-outline';
import { SUPPORTED_DOC_EXTENSIONS } from '@/lib/doc-types';

type MsgKind = 'message' | 'update' | 'attachment' | 'outline' | 'apply';
interface DraftMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  kind: MsgKind;
  content: string;
  attachmentName: string | null;
}

type View = 'pdf' | 'builder';

export default function NewRFQPage() {
  const router = useRouter();

  const [rfqId, setRfqId] = useState<string | null>(null);

  const [messages, setMessages] = useState<DraftMessage[]>([]);
  const [doc, setDoc] = useState<RFQDocument | null>(null);
  const [hasContent, setHasContent] = useState(false);
  // The current un-applied outline (null once applied or none proposed).
  const [pendingOutline, setPendingOutline] = useState<RFQOutline | null>(null);
  // id of the outline message that has been applied (so its review renders read-only)
  const [appliedOutlineMsgId, setAppliedOutlineMsgId] = useState<string | null>(null);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('pdf');
  const [pdfNonce, setPdfNonce] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pendingOutline]);

  // Create the draft RFQ immediately — no policy-picker gate.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      setError('');
      try {
        const res = await api<{ rfq: { id: string; rfqDocument: RFQDocument } }>(
          '/api/rfqs',
          { method: 'POST', body: JSON.stringify({}) }
        );
        setRfqId(res.rfq.id);
        setDoc(res.rfq.rfqDocument);
        setMessages([
          {
            id: 'seed',
            role: 'assistant',
            kind: 'message',
            content:
              'Attach your business requirements, policy or spec documents (or paste content) and describe what you need. When you\'re ready, hit "Build / update RFQ" and I\'ll propose an outline for you to confirm.',
            attachmentName: null,
          },
        ]);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  async function send(action: 'message' | 'outline') {
    if (!rfqId || busy) return;
    const text = input.trim();
    if (action === 'message' && !text) return;
    setBusy(true);
    setError('');
    setMessages((m) => [
      ...m,
      {
        id: `tmp-${Date.now()}`,
        role: 'user',
        kind: action === 'outline' ? 'update' : 'message',
        content: text || '(build the RFQ)',
        attachmentName: null,
      },
    ]);
    setInput('');
    try {
      const res = await api<{
        assistant: DraftMessage;
        outline?: boolean;
        pendingOutline?: RFQOutline | null;
      }>(`/api/rfqs/${rfqId}/draft-chat`, {
        method: 'POST',
        body: JSON.stringify({ message: text || undefined, action }),
      });
      setMessages((m) => [...m, res.assistant]);
      if (res.outline && res.pendingOutline) {
        setPendingOutline(res.pendingOutline);
        setAppliedOutlineMsgId(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function apply(tickedIds: string[]) {
    if (!rfqId || applying) return;
    setApplying(true);
    setError('');
    try {
      const res = await api<{
        assistant: DraftMessage;
        applied: boolean;
        rfqDocument: RFQDocument;
      }>(`/api/rfqs/${rfqId}/draft-chat`, {
        method: 'POST',
        body: JSON.stringify({ action: 'apply', tickedSectionIds: tickedIds }),
      });
      // mark the outline message that produced this outline as applied
      const lastOutlineMsg = [...messages].reverse().find((m) => m.kind === 'outline');
      if (lastOutlineMsg) setAppliedOutlineMsgId(lastOutlineMsg.id);
      setMessages((m) => [...m, res.assistant]);
      setPendingOutline(null);
      setDoc(res.rfqDocument);
      setHasContent(true);
      setView('pdf');
      setPdfNonce((n) => n + 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  }

  async function upload(file: File) {
    if (!rfqId) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/rfqs/${rfqId}/attachments`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMessages((m) => [
        ...m,
        {
          id: data.attachment.id,
          role: 'user',
          kind: 'attachment',
          content: `Attached ${data.attachment.name} (${data.attachment.chars.toLocaleString()} chars${
            data.attachment.truncated ? ', truncated' : ''
          })`,
          attachmentName: data.attachment.name,
        },
      ]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onDocEdit(next: RFQDocument) {
    setDoc(next);
    if (!rfqId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSavingDoc(true);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await api<{ rfqDocument: RFQDocument }>(`/api/rfqs/${rfqId}`, {
          method: 'PATCH',
          body: JSON.stringify({ rfqDocument: next }),
        });
        setDoc(res.rfqDocument);
        setHasContent(true);
        setPdfNonce((n) => n + 1);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSavingDoc(false);
      }
    }, 800);
  }

  function saveAndOpen() {
    if (rfqId) router.push(`/dashboard/rfqs/${rfqId}`);
  }

  // ---------- render ----------

  if (!rfqId) {
    return (
      <AppShell>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Create RFQ</h1>
        {error ? (
          <ErrorText>{error}</ErrorText>
        ) : (
          <Spinner label="Starting a new RFQ…" />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Create RFQ</h1>
        <div className="flex items-center gap-2">
          {savingDoc && <span className="text-xs text-gray-400">saving…</span>}
          <Button variant="secondary" onClick={saveAndOpen}>
            {hasContent ? 'Done — open RFQ' : 'Save & exit'}
          </Button>
        </div>
      </div>

      {error && <div className="mb-4"><ErrorText>{error}</ErrorText></div>}

      <div className="grid lg:grid-cols-2 gap-6" style={{ minHeight: '70vh' }}>
        {/* Chat */}
        <Card className="p-0 flex flex-col">
          <div className="px-4 py-2 border-b border-gray-200 font-semibold text-gray-900 text-sm">
            Conversation
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[60vh]">
            {messages.map((m) => {
              if (m.kind === 'outline') {
                const isApplied = appliedOutlineMsgId === m.id;
                // Show the interactive review only for the newest, un-applied outline.
                const isLatest =
                  pendingOutline != null &&
                  m.id === [...messages].reverse().find((x) => x.kind === 'outline')?.id;
                if (isLatest && pendingOutline) {
                  return (
                    <div key={m.id} className="text-left">
                      <OutlineReview
                        outline={pendingOutline}
                        applied={false}
                        busy={applying}
                        onApply={apply}
                      />
                    </div>
                  );
                }
                // Older / applied outline → plain text summary
                return (
                  <div key={m.id} className="text-left">
                    <span className="inline-block px-3 py-2 rounded-lg whitespace-pre-wrap max-w-[92%] bg-gray-100 text-gray-600 text-xs">
                      {isApplied ? '✓ ' : ''}
                      {m.content}
                    </span>
                  </div>
                );
              }
              return (
                <div
                  key={m.id}
                  className={`text-sm ${m.role === 'user' ? 'text-right' : 'text-left'}`}
                >
                  <span
                    className={`inline-block px-3 py-2 rounded-lg whitespace-pre-wrap max-w-[90%] ${
                      m.kind === 'attachment'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : m.kind === 'update'
                        ? 'bg-blue-100 text-blue-800 font-medium'
                        : m.kind === 'apply'
                        ? 'bg-green-50 text-green-800 border border-green-200'
                        : m.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {m.kind === 'attachment' ? `📎 ${m.content}` : m.content}
                  </span>
                </div>
              );
            })}
            {busy && <div className="text-sm text-gray-400">working…</div>}
          </div>

          <div className="border-t border-gray-200 p-3 space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept={SUPPORTED_DOC_EXTENSIONS.join(',')}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = '';
              }}
            />
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the need, paste content, or ask for a change…"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send('message');
              }}
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Reading…' : 'Attach document'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => send('message')} disabled={busy}>
                Send
              </Button>
              <Button size="sm" onClick={() => send('outline')} disabled={busy}>
                {hasContent || pendingOutline ? 'Rebuild outline' : 'Build / update RFQ'}
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              Accepts {SUPPORTED_DOC_EXTENSIONS.join(', ')}. I propose an outline from
              the whole conversation — you confirm before the RFQ is written.
            </p>
          </div>
        </Card>

        {/* RFQ views */}
        <Card className="p-0 flex flex-col">
          <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
            <div className="flex gap-1 text-sm">
              <button
                onClick={() => setView('pdf')}
                className={`px-3 py-1 rounded ${
                  view === 'pdf' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                PDF document
              </button>
              <button
                onClick={() => setView('builder')}
                className={`px-3 py-1 rounded ${
                  view === 'builder'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Form builder
              </button>
            </div>
            {hasContent && (
              <a
                href={`/api/rfqs/${rfqId}/pdf?v=${pdfNonce}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                open in new tab
              </a>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!hasContent ? (
              <div className="p-8 text-center text-sm text-gray-400">
                No RFQ yet. Add details in the conversation, press{' '}
                <span className="font-medium">Build / update RFQ</span>, then confirm the
                outline.
              </div>
            ) : view === 'pdf' ? (
              <iframe
                key={pdfNonce}
                src={`/api/rfqs/${rfqId}/pdf?v=${pdfNonce}`}
                className="w-full h-[65vh] border-0"
                title="RFQ PDF"
              />
            ) : doc ? (
              <div className="p-4">
                <RFQDocumentBuilder doc={doc} onChange={onDocEdit} />
              </div>
            ) : (
              <Spinner label="Loading…" />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
