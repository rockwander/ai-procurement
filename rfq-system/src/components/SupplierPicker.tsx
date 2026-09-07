'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input, Badge, Spinner, ErrorText } from '@/components/ui';
import { api } from '@/lib/fetcher';

interface RankedSupplier {
  id: string;
  companyName: string;
  contactEmail: string;
  rating: number;
  matchScore: number;
  aiSummary: string;
  pastOrdersCount: number;
  flags: string[];
  categories: string[];
}

/**
 * Pre-filtering agent UI: pick categories, run the agent, review the ranked
 * list with AI summaries, select suppliers, and send the RFQ.
 */
export function SupplierPicker({
  rfqId,
  onSent,
  alreadyInvited,
}: {
  rfqId: string;
  onSent: () => void;
  alreadyInvited: Set<string>;
}) {
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [minRating, setMinRating] = useState('');
  const [excludeFlagged, setExcludeFlagged] = useState(false);

  const [ranked, setRanked] = useState<RankedSupplier[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filtering, setFiltering] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sendResults, setSendResults] = useState<any[] | null>(null);

  useEffect(() => {
    api<{ categories: string[] }>('/api/suppliers')
      .then((d) => setAllCategories(d.categories))
      .catch(() => {});
  }, []);

  function toggleCategory(c: string) {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  async function runFilter() {
    setError('');
    setFiltering(true);
    setSendResults(null);
    try {
      const res = await api<{ suppliers: RankedSupplier[] }>(
        '/api/suppliers/filter',
        {
          method: 'POST',
          body: JSON.stringify({
            categories,
            minRating: minRating ? Number(minRating) : undefined,
            excludeFlags: excludeFlagged
              ? ['quality_concerns', 'slow_response', 'higher_pricing']
              : undefined,
            rfqId,
          }),
        }
      );
      setRanked(res.suppliers);
      setSelected(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFiltering(false);
    }
  }

  async function send() {
    setError('');
    setSending(true);
    try {
      const res = await api<{ results: any[] }>(`/api/rfqs/${rfqId}/send`, {
        method: 'POST',
        body: JSON.stringify({ supplierIds: [...selected] }),
      });
      setSendResults(res.results);
      onSent();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-semibold text-gray-900">Find & invite suppliers</h2>

      {error && <ErrorText>{error}</ErrorText>}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Categories to supply
        </label>
        <div className="flex flex-wrap gap-2">
          {allCategories.map((c) => (
            <button
              key={c}
              onClick={() => toggleCategory(c)}
              className={`px-2.5 py-1 rounded-full text-xs border ${
                categories.includes(c)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-4">
        <div className="w-32">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min rating
          </label>
          <Input
            type="number"
            step="0.1"
            min="0"
            max="5"
            value={minRating}
            onChange={(e) => setMinRating(e.target.value)}
            placeholder="e.g. 4"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 pb-2">
          <input
            type="checkbox"
            checked={excludeFlagged}
            onChange={(e) => setExcludeFlagged(e.target.checked)}
          />
          Exclude flagged suppliers
        </label>
        <Button
          onClick={runFilter}
          disabled={filtering || categories.length === 0}
          className="ml-auto"
        >
          {filtering ? 'Filtering…' : 'Run pre-filtering agent'}
        </Button>
      </div>

      {filtering && <Spinner label="Ranking suppliers by fit…" />}

      {ranked && (
        <div className="space-y-2">
          {ranked.length === 0 && (
            <p className="text-sm text-gray-500">
              No suppliers matched those categories.
            </p>
          )}
          {ranked.map((s) => {
            const invited = alreadyInvited.has(s.id);
            return (
              <div
                key={s.id}
                className={`border rounded-lg p-3 flex gap-3 ${
                  invited ? 'bg-gray-50 border-gray-200' : 'border-gray-200'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={invited}
                  checked={selected.has(s.id)}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      e.target.checked ? next.add(s.id) : next.delete(s.id);
                      return next;
                    })
                  }
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">
                      {s.companyName}
                    </span>
                    <Badge color="blue">fit {s.matchScore}</Badge>
                    <Badge color="gray">★ {s.rating.toFixed(1)}</Badge>
                    <Badge color="gray">{s.pastOrdersCount} orders</Badge>
                    {s.flags.map((f) => (
                      <Badge key={f} color="red">
                        {f}
                      </Badge>
                    ))}
                    {invited && <Badge color="green">invited</Badge>}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{s.aiSummary}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.categories.join(' · ')} — {s.contactEmail}
                  </p>
                </div>
              </div>
            );
          })}

          {selected.size > 0 && (
            <Button onClick={send} disabled={sending}>
              {sending
                ? 'Sending…'
                : `Send RFQ to ${selected.size} supplier${selected.size > 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      )}

      {sendResults && (
        <div className="border border-green-200 bg-green-50 rounded-lg p-3 text-sm space-y-1">
          <p className="font-medium text-green-800">RFQ sent</p>
          {sendResults.map((r, i) => (
            <div key={i} className="text-green-700">
              {r.supplier} — {r.sent ? 'email sent' : `failed: ${r.error}`}
              <div className="text-xs text-gray-500 break-all">{r.formLink}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
