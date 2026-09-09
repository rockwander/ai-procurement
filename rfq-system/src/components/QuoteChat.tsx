'use client';

import { useRef, useState } from 'react';
import { PaperclipIcon, SendIcon } from '@/components/ui';
import { api } from '@/lib/fetcher';
import { SUPPORTED_DOC_EXTENSIONS } from '@/lib/doc-types';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

import type { LineItemResponse } from '@/lib/line-response';
import type { FieldProvenance } from '@/lib/line-response-status';

import type { QuoteException } from '@/lib/line-response-status';

export interface ChatScope {
  /** a `line:<id>:<field>` id, a form field id, or `passage:<slug>` */
  id: string;
  label: string;
  /** when set, this is a document passage (heading / T&C / intro), not a field */
  text?: string;
}

export interface ChatApplyPayload {
  /** buyer-defined quote-level / questionnaire field id -> value */
  formPatches: Record<string, string | number>;
  /** rfq line id -> partial fixed-response to merge */
  linePatches: Record<string, Partial<LineItemResponse>>;
  /** target id -> provenance (confidence + rationale) for each written value */
  provenance: Record<string, FieldProvenance>;
  /** caveats the supplier raised against a passage — recorded for the buyer */
  exceptions: QuoteException[];
}

interface Attachment {
  name: string;
  text: string;
  chars: number;
  truncated: boolean;
}

/**
 * AI assistant for the supplier form. The supplier can attach documents in any
 * readable format (PDF, DOCX, XLSX-as-CSV, TXT) or paste content, or just chat;
 * the assistant maps what it finds onto the fixed form and returns form-ready
 * updates (fields + line-item prices) plus notes for anything it had to shorten
 * and a list of what still needs manual entry.
 */
export function QuoteChat({
  token,
  activeField,
  onClearActiveField,
  onApply,
  disabled,
}: {
  token: string;
  /** the field or passage the supplier is discussing */
  activeField?: ChatScope | null;
  onClearActiveField?: () => void;
  onApply: (payload: ChatApplyPayload) => void;
  disabled?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        'Attach your quotation, price list, rate card or certificates (PDF, Word, CSV) or paste the details here. I\'ll read them into your quote and tell you what still needs your input. Click any value to correct it, or click a heading / terms clause to raise a caveat — I\'ll change what I can and note the rest for the buyer.',
    },
  ]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    for (const file of list) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/quote/${token}/extract`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Could not read ${file.name}`);
        setAttachments((a) => [...a, data as Attachment]);
      } catch (e: any) {
        setMessages((m) => [...m, { role: 'assistant', content: `Error: ${e.message}` }]);
      }
    }
    setUploading(false);
  }

  async function send() {
    if (busy || (!input.trim() && attachments.length === 0)) return;
    const userLine =
      (input.trim() || '(sent documents)') +
      (attachments.length ? `\n\n📎 ${attachments.map((a) => a.name).join(', ')}` : '');
    setMessages((m) => [...m, { role: 'user', content: userLine }]);
    setBusy(true);

    const messageToSend = input.trim();
    const docsToSend = attachments.map(
      (a) => `--- ${a.name} ---\n${a.text}`
    );
    setInput('');
    setAttachments([]);

    try {
      const res = await api<{
        message: string;
        formPatches: Record<string, string | number>;
        linePatches: Record<string, Partial<LineItemResponse>>;
        provenance: Record<string, FieldProvenance>;
        exceptions: QuoteException[];
      }>(`/api/quote/${token}/chat`, {
        method: 'POST',
        body: JSON.stringify({
          message: messageToSend || undefined,
          documentTexts: docsToSend.length ? docsToSend : undefined,
          // a passage carries `text`; a field is scoped by id only
          activeField: activeField && !activeField.text ? activeField.id : undefined,
          activePassage: activeField?.text
            ? { label: activeField.label, text: activeField.text }
            : undefined,
        }),
      });
      setMessages((m) => [...m, { role: 'assistant', content: res.message }]);
      const hasUpdates =
        Object.keys(res.formPatches ?? {}).length > 0 ||
        Object.keys(res.linePatches ?? {}).length > 0 ||
        (res.exceptions ?? []).length > 0;
      if (hasUpdates) {
        onApply({
          formPatches: res.formPatches ?? {},
          linePatches: res.linePatches ?? {},
          provenance: res.provenance ?? {},
          exceptions: res.exceptions ?? [],
        });
      }
      onClearActiveField?.();
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full border border-gray-200 rounded-lg bg-white">
      <div className="px-4 py-2 border-b border-gray-200 font-semibold text-gray-900 text-sm">
        AI assistant
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[520px]">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
            <span
              className={`inline-block px-3 py-2 rounded-lg whitespace-pre-wrap max-w-[92%] ${
                m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {busy && <div className="text-sm text-gray-400">working…</div>}
      </div>

      {!disabled && (
        <div className="border-t border-gray-200 p-3 space-y-2">
          {activeField && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 pl-2 pr-1 py-0.5 max-w-[240px]">
                <span className="truncate">
                  {activeField.text ? 're: ' : '↳ '}
                  {activeField.label}
                </span>
                <button
                  onClick={onClearActiveField}
                  className="text-blue-500 hover:text-blue-800 leading-none px-0.5 shrink-0"
                  aria-label="Clear focus"
                >
                  ×
                </button>
              </span>
              <span className="text-gray-400">
                {activeField.text
                  ? 'your comment is about this passage'
                  : 'your next message fills this field'}
              </span>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-xs text-gray-700 bg-gray-100 rounded-full pl-2 pr-1 py-0.5"
                >
                  <PaperclipIcon className="w-3 h-3 text-gray-400" />
                  <span className="max-w-[140px] truncate">{a.name}</span>
                  {a.truncated && <span className="text-gray-400">(clipped)</span>}
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-600 text-sm leading-none px-0.5"
                    aria-label={`Remove ${a.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={SUPPORTED_DOC_EXTENSIONS.join(',')}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <div
            className={`relative rounded-lg border ${
              dragOver ? 'border-blue-400 bg-blue-50/40' : 'border-gray-300'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
          >
            <textarea
              className="w-full resize-none bg-transparent px-3 pt-2 pb-9 text-sm focus:outline-none"
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question or paste details…  Attach docs with the clip."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
              }}
            />
            <div className="absolute inset-x-2 bottom-1.5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="Attach documents"
                className="flex items-center gap-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              >
                <PaperclipIcon className="w-4 h-4" />
                {uploading && <span className="text-xs">reading…</span>}
              </button>
              <button
                type="button"
                onClick={send}
                disabled={busy || (!input.trim() && attachments.length === 0)}
                title="Send (Cmd/Ctrl+Enter)"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
              >
                <SendIcon />
              </button>
            </div>
          </div>

          <p className="text-[11px] text-gray-400">
            Accepts {SUPPORTED_DOC_EXTENSIONS.join(', ')} — multiple at once. Nothing is
            stored except the text.
          </p>
        </div>
      )}
    </div>
  );
}
