'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Badge, Spinner, ErrorText } from '@/components/ui';
import { api } from '@/lib/fetcher';

interface Supplier {
  id: string;
  companyName: string;
  contactEmail: string;
  rating: number;
  pastOrdersCount: number;
  flags: string[] | null;
  categories: string[];
  performanceSummary: string | null;
}

// AI annotations layered onto a supplier after the optional ranking run.
interface AIRank {
  matchScore: number;
  aiSummary: string;
}

const FLAG_VALUES = ['quality_concerns', 'slow_response', 'higher_pricing'];

/**
 * Find & invite suppliers. Shows every supplier up front; the buyer can filter
 * (category / rating / flags / text), multi-select, and send the RFQ directly.
 * Running the AI pre-filtering agent is optional — it ranks and annotates the
 * same list rather than gating it.
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
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [allCategories, setAllCategories] = useState<string[]>([]);

  // filters
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [minRating, setMinRating] = useState('');
  const [excludeFlagged, setExcludeFlagged] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aiRanks, setAiRanks] = useState<Map<string, AIRank> | null>(null);

  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sendResults, setSendResults] = useState<any[] | null>(null);

  useEffect(() => {
    api<{ suppliers: Supplier[]; categories: string[] }>('/api/suppliers')
      .then((d) => {
        setSuppliers(d.suppliers);
        setAllCategories(d.categories);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function toggleCategory(c: string) {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  const filtered = useMemo(() => {
    if (!suppliers) return [];
    const needle = search.toLowerCase().trim();
    const min = minRating ? Number(minRating) : null;
    const list = suppliers.filter((s) => {
      if (needle) {
        const hay = `${s.companyName} ${s.contactEmail} ${(s.categories ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (categories.length && !(s.categories ?? []).some((c) => categories.includes(c)))
        return false;
      if (min !== null && (s.rating ?? 0) < min) return false;
      if (excludeFlagged && (s.flags ?? []).length > 0) return false;
      return true;
    });
    if (aiRanks) {
      list.sort(
        (a, b) => (aiRanks.get(b.id)?.matchScore ?? -1) - (aiRanks.get(a.id)?.matchScore ?? -1)
      );
    } else {
      list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    return list;
  }, [suppliers, search, categories, minRating, excludeFlagged, aiRanks]);

  const selectableIds = filtered.filter((s) => !alreadyInvited.has(s.id)).map((s) => s.id);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function runRanking() {
    setError('');
    setRanking(true);
    setSendResults(null);
    try {
      const res = await api<{ suppliers: Array<Supplier & AIRank> }>(
        '/api/suppliers/filter',
        {
          method: 'POST',
          body: JSON.stringify({
            categories: categories.length ? categories : allCategories,
            minRating: minRating ? Number(minRating) : undefined,
            excludeFlags: excludeFlagged ? FLAG_VALUES : undefined,
            rfqId,
          }),
        }
      );
      setAiRanks(
        new Map(
          res.suppliers.map((s) => [
            s.id,
            { matchScore: s.matchScore, aiSummary: s.aiSummary },
          ])
        )
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRanking(false);
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
      setSelected(new Set());
      onSent();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Find &amp; invite suppliers</h2>
        <Button variant="secondary" size="sm" onClick={runRanking} disabled={ranking || loading}>
          {ranking ? 'Ranking…' : aiRanks ? 'Re-rank with AI' : 'Rank by fit with AI'}
        </Button>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      {/* Filters */}
      <div className="space-y-3">
        <Input
          placeholder="Search name, email or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {allCategories.length > 0 && (
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
        )}
        <div className="flex items-end gap-4">
          <div className="w-32">
            <label className="block text-xs font-medium text-gray-600 mb-1">
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
            Exclude flagged
          </label>
          {(categories.length > 0 || minRating || excludeFlagged || search) && (
            <button
              onClick={() => {
                setCategories([]);
                setMinRating('');
                setExcludeFlagged(false);
                setSearch('');
              }}
              className="text-xs text-gray-500 hover:text-gray-800 pb-2 ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading suppliers…" />
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-gray-600">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                disabled={selectableIds.length === 0}
              />
              Select all ({filtered.length} shown
              {suppliers && filtered.length !== suppliers.length
                ? ` of ${suppliers.length}`
                : ''}
              )
            </label>
            {selected.size > 0 && (
              <span className="text-gray-500">{selected.size} selected</span>
            )}
          </div>

          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm text-gray-500">No suppliers match those filters.</p>
            )}
            {filtered.map((s) => {
              const invited = alreadyInvited.has(s.id);
              const rank = aiRanks?.get(s.id);
              return (
                <label
                  key={s.id}
                  className={`border rounded-lg p-3 flex gap-3 cursor-pointer ${
                    invited
                      ? 'bg-gray-50 border-gray-200 cursor-default'
                      : selected.has(s.id)
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
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
                        if (e.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        return next;
                      })
                    }
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{s.companyName}</span>
                      {rank && <Badge color="blue">fit {rank.matchScore}</Badge>}
                      <Badge color="gray">★ {(s.rating ?? 0).toFixed(1)}</Badge>
                      <Badge color="gray">{s.pastOrdersCount ?? 0} orders</Badge>
                      {(s.flags ?? []).map((f) => (
                        <Badge key={f} color="red">
                          {f}
                        </Badge>
                      ))}
                      {invited && <Badge color="green">invited</Badge>}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {rank?.aiSummary ?? s.performanceSummary}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {(s.categories ?? []).join(' · ')} — {s.contactEmail}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          {selected.size > 0 && (
            <Button onClick={send} disabled={sending}>
              {sending
                ? 'Sending…'
                : `Send RFQ to ${selected.size} supplier${selected.size > 1 ? 's' : ''}`}
            </Button>
          )}
        </>
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
