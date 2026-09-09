'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Spinner, SendIcon } from '@/components/ui';
import { api } from '@/lib/fetcher';
import type { ColumnDef } from '@/lib/quote-columns';
import { columnTab } from '@/lib/quote-columns';
import type { ChatFilter } from '@/lib/agents/quote-chat';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** an award proposal returned with this assistant turn (carries __strategy) */
  evaluation?: any;
  /** filters this turn applied, for display */
  filters?: ChatFilter[];
}

const SUGGESTIONS = [
  'Who is cheapest overall?',
  'Which suppliers can’t cover the full quantity?',
  'Hide quotes with any foreign-currency line',
  'Split each line to the lowest unit price',
];

/**
 * The buyer's assistant beside the quote-comparison table. Persistent across
 * tab switches (its state lives here, the table tabs are just a view toggle).
 * One turn is a question, a filter request, or an award strategy — the server
 * classifies and this component acts on the result:
 *  - filter  -> pushes filters into the table via onApplyFilters
 *  - award   -> renders a confirm-and-send card inline in the chat stream
 */
export function QuoteCompareChat({
  rfqId,
  columns,
  rfqCurrency,
  visibleRowsText,
  onApplyFilters,
  awarding,
  onConfirmAward,
}: {
  rfqId: string;
  columns: ColumnDef[];
  rfqCurrency: string;
  /** compact text of the rows currently visible in the table */
  visibleRowsText: string;
  onApplyFilters: (filters: ChatFilter[]) => void;
  awarding: boolean;
  onConfirmAward: (evaluation: any, strategy: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setError('');
    setInput('');
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setBusy(true);
    try {
      const res = await api<any>(`/api/rfqs/${rfqId}/quotes/chat`, {
        method: 'POST',
        body: JSON.stringify({
          message: msg,
          history,
          columns: columns.map((c) => ({
            key: c.key,
            label: c.label,
            numeric: c.numeric,
            tab: columnTab(c),
          })),
          rowsText: visibleRowsText,
        }),
      });

      const assistant: Message = {
        role: 'assistant',
        content: res.message ?? 'Done.',
      };
      if (res.type === 'filter' && Array.isArray(res.filters)) {
        assistant.filters = res.filters;
        onApplyFilters(res.filters);
      }
      if (res.type === 'award' && res.evaluation) {
        assistant.evaluation = {
          ...res.evaluation,
          __strategy: res.strategy ?? msg,
        };
      }
      setMessages((prev) => [...prev, assistant]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] rounded-xl border border-gray-200 bg-white">
      <div className="px-4 py-3 border-b border-gray-200">
        <p className="font-semibold text-gray-900 text-sm">Assistant</p>
        <p className="text-xs text-gray-500">
          Ask about the quotes, filter the table, or key in an award strategy.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">Try:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full text-left px-3 py-2 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i}>
            <div
              className={
                m.role === 'user'
                  ? 'ml-6 rounded-lg bg-blue-600 text-white px-3 py-2 text-sm whitespace-pre-wrap'
                  : 'mr-2 rounded-lg bg-gray-100 text-gray-800 px-3 py-2 text-sm whitespace-pre-wrap'
              }
            >
              {m.content}
            </div>

            {m.filters && m.filters.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {m.filters.map((f, j) => (
                  <span
                    key={j}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"
                  >
                    {f.columnKey} {f.op} {f.value}
                  </span>
                ))}
              </div>
            )}

            {m.evaluation && (
              <AwardCard
                evaluation={m.evaluation}
                currency={rfqCurrency}
                awarding={awarding}
                onConfirm={() =>
                  onConfirmAward(m.evaluation, m.evaluation.__strategy ?? '')
                }
              />
            )}
          </div>
        ))}

        {busy && <Spinner label="Thinking…" />}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-gray-200 p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="Ask a question, or describe how to award…"
            className="flex-1 resize-none px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <Button type="submit" disabled={busy || input.trim().length < 2}>
            <SendIcon />
          </Button>
        </div>
      </form>
    </div>
  );
}

function AwardCard({
  evaluation,
  currency,
  awarding,
  onConfirm,
}: {
  evaluation: any;
  currency: string;
  awarding: boolean;
  onConfirm: () => void;
}) {
  const fmt = (n: number) =>
    `${currency} ${Number(n ?? 0).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })}`;
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-700 uppercase">
        Proposed award
      </p>
      {evaluation.reasoning && (
        <p className="text-xs text-gray-600">{evaluation.reasoning}</p>
      )}
      <p className="text-sm font-medium">
        Total: {fmt(evaluation.totalCost)}
        {evaluation.savings ? (
          <span className="text-green-600"> (saves {fmt(evaluation.savings)})</span>
        ) : null}
      </p>
      {(evaluation.warnings ?? []).map((w: string, i: number) => (
        <p key={i} className="text-[11px] text-yellow-700">
          ⚠ {w}
        </p>
      ))}
      {(evaluation.awards ?? []).map((a: any) => (
        <div
          key={a.supplierId}
          className="rounded bg-white border border-gray-200 p-2"
        >
          <p className="text-sm font-medium text-gray-900">
            {a.supplierName} — {fmt(a.totalAmount)}
          </p>
          <ul className="text-xs text-gray-600 list-disc pl-4">
            {(a.lineItems ?? []).map((li: any, i: number) => (
              <li key={i}>
                {li.itemDescription}: {li.quantity} × {li.unitPrice} ={' '}
                {fmt(li.totalPrice)}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <Button size="sm" onClick={onConfirm} disabled={awarding}>
        {awarding ? 'Sending POs…' : 'Confirm & send purchase orders'}
      </Button>
    </div>
  );
}
