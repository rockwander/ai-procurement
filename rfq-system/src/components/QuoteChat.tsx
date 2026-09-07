'use client';

import { useRef, useState } from 'react';
import { Button, Textarea } from '@/components/ui';
import { api } from '@/lib/fetcher';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * AI chat sidebar for the supplier form. The supplier can paste document text
 * (price lists, company profile) or ask questions; the agent replies and
 * returns suggested field values which are pushed to the form via onApply.
 */
export function QuoteChat({
  token,
  currentFormData,
  onApply,
  disabled,
}: {
  token: string;
  currentFormData: Record<string, unknown>;
  onApply: (updates: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        'Hi! Paste your price list or company details here and I\'ll fill the form for you, or ask me anything about this RFQ.',
    },
  ]);
  const [input, setInput] = useState('');
  const [docText, setDocText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function readFile(file: File) {
    const text = await file.text();
    setDocText((prev) => (prev ? prev + '\n\n' : '') + `--- ${file.name} ---\n` + text);
  }

  async function send() {
    if (busy || (!input.trim() && !docText.trim())) return;
    const userLine =
      input.trim() + (docText.trim() ? `\n\n[attached document text]` : '');
    setMessages((m) => [...m, { role: 'user', content: userLine }]);
    setBusy(true);
    const messageToSend = input;
    const docsToSend = docText.trim() ? [docText] : undefined;
    setInput('');
    setDocText('');
    try {
      const res = await api<{
        message: string;
        suggestedUpdates: Record<string, unknown>;
      }>(`/api/quote/${token}/chat`, {
        method: 'POST',
        body: JSON.stringify({
          message: messageToSend || undefined,
          documentTexts: docsToSend,
          currentFormData,
        }),
      });
      setMessages((m) => [...m, { role: 'assistant', content: res.message }]);
      if (res.suggestedUpdates && Object.keys(res.suggestedUpdates).length > 0) {
        onApply(res.suggestedUpdates);
      }
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `Error: ${e.message}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full border border-gray-200 rounded-lg bg-white">
      <div className="px-4 py-2 border-b border-gray-200 font-semibold text-gray-900 text-sm">
        AI assistant
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[500px]">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm ${
              m.role === 'user' ? 'text-right' : 'text-left'
            }`}
          >
            <span
              className={`inline-block px-3 py-2 rounded-lg whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {busy && (
          <div className="text-sm text-gray-400">assistant is typing…</div>
        )}
      </div>

      {!disabled && (
        <div className="border-t border-gray-200 p-3 space-y-2">
          {docText && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded p-2 flex justify-between">
              <span>{docText.length} chars of document text attached</span>
              <button onClick={() => setDocText('')} className="text-red-500">
                clear
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,.md"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f);
              e.target.value = '';
            }}
          />
          <Textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question or paste details…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              Attach .txt
            </Button>
            <Button size="sm" onClick={send} disabled={busy}>
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
