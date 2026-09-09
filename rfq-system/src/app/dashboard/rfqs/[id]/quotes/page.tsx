'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Input, Select, Spinner, ErrorText, StatusBadge } from '@/components/ui';
import { QuoteCompareChat } from '@/components/QuoteCompareChat';
import { api } from '@/lib/fetcher';
import {
  QuoteRow,
  ColumnDef,
  ColumnTab,
  Filter,
  buildColumns,
  columnsForTab,
  applyFilters,
  sortRows,
} from '@/lib/quote-columns';

const TABS: { key: ColumnTab; label: string }[] = [
  { key: 'lineitems', label: 'Line items' },
  { key: 'questionnaire', label: 'Questionnaire + Notes' },
];

export default function QuoteComparisonPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{
    rfq: any;
    lineItems: any[];
    quotes: QuoteRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState<ColumnTab>('lineitems');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sortKey, setSortKey] = useState<string | null>('totalAmount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [awarding, setAwarding] = useState(false);
  const [awardResults, setAwardResults] = useState<any[] | null>(null);

  useEffect(() => {
    api<any>(`/api/rfqs/${id}/quotes`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const columns: ColumnDef[] = useMemo(
    () =>
      data
        ? buildColumns(data.rfq.formSchema, data.lineItems, data.rfq.currency)
        : [],
    [data]
  );

  const tabColumns = useMemo(
    () => columnsForTab(columns, tab),
    [columns, tab]
  );
  const visibleColumns = tabColumns.filter((c) => !hidden.has(c.key));

  const submittedRows = useMemo(
    () => (data?.quotes ?? []).filter((q) => q.status === 'submitted'),
    [data]
  );

  const displayedRows = useMemo(() => {
    let rows = applyFilters(submittedRows, columns, filters);
    rows = sortRows(rows, columns, sortKey, sortDir);
    return rows;
  }, [submittedRows, columns, filters, sortKey, sortDir]);

  // Notes for the Questionnaire tab: rendered as flagged bullets, not a column.
  const notesByRow = useMemo(
    () =>
      displayedRows
        .map((r) => ({
          supplier: r.supplierName,
          bullets: splitNotes(r.notes),
        }))
        .filter((n) => n.bullets.length > 0),
    [displayedRows]
  );

  // Compact text of what's on screen, for the assistant to reason over.
  const visibleRowsText = useMemo(() => {
    const cols = columnsForTab(columns, 'lineitems').filter((c) => !hidden.has(c.key));
    const lines = displayedRows.map((row) => {
      const cells = cols.map((c) => {
        const v = c.accessor(row);
        return `${c.label}=${v == null ? '—' : v}`;
      });
      const notes = splitNotes(row.notes);
      if (notes.length) cells.push(`flagged: ${notes.join(' | ')}`);
      return `- ${cells.join(', ')}`;
    });
    return lines.join('\n') || '(no rows visible)';
  }, [displayedRows, columns, hidden]);

  function toggleColumn(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function addFilter() {
    const firstCol = columns[0];
    if (!firstCol) return;
    setFilters((prev) => [
      ...prev,
      { columnKey: firstCol.key, op: firstCol.numeric ? 'lt' : 'contains', value: '' },
    ]);
  }

  function applyChatFilters(next: Filter[]) {
    setFilters(next);
    // jump to whichever tab the first filtered column lives on
    const first = next[0] && columns.find((c) => c.key === next[0].columnKey);
    if (first) setTab(first.group === 'questionnaire' ? 'questionnaire' : 'lineitems');
  }

  async function confirmAward(evaluation: any, strategy: string) {
    if (!evaluation) return;
    setAwarding(true);
    setError('');
    try {
      const res = await api<{ results: any[] }>(`/api/rfqs/${id}/award`, {
        method: 'POST',
        body: JSON.stringify({
          awards: evaluation.awards,
          strategy: strategy || evaluation.__strategy || 'Awarded via assistant',
          reasoning: evaluation.reasoning,
        }),
      });
      setAwardResults(res.results);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAwarding(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <Spinner label="Loading quotes…" />
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

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">
          Compare quotes — {data.rfq.title}
        </h1>
        <StatusBadge status={data.rfq.status} />
      </div>
      <p className="text-sm text-gray-500 mb-6">
        {submittedRows.length} submitted ·{' '}
        {data.quotes.length - submittedRows.length} pending
      </p>

      {error && (
        <div className="mb-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      {awardResults && (
        <Card className="p-4 mb-6 border-green-200 bg-green-50">
          <p className="font-semibold text-green-800 mb-1">Purchase orders sent</p>
          {awardResults.map((r, i) => (
            <p key={i} className="text-sm text-green-700">
              {r.poNumber} → {r.supplier} —{' '}
              {r.emailSent ? 'email sent' : `failed: ${r.error}`}
            </p>
          ))}
        </Card>
      )}

      {submittedRows.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          No quotes submitted yet.
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          {/* LEFT — tabbed table */}
          <div className="min-w-0">
            {/* tab bar */}
            <div className="flex items-center justify-between border-b border-gray-200 mb-4">
              <div className="flex gap-1">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                      tab === t.key
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowColumnMenu((v) => !v)}
                >
                  Columns ▾
                </Button>
                {showColumnMenu && (
                  <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                    <p className="text-[11px] font-medium text-gray-400 uppercase px-1 pb-1">
                      {tab === 'questionnaire' ? 'Questionnaire' : 'Line items'} columns
                    </p>
                    <div className="max-h-64 overflow-y-auto space-y-0.5">
                      {tabColumns.map((c) => (
                        <label
                          key={c.key}
                          className="flex items-center gap-2 px-1 py-1 text-xs text-gray-700 rounded hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={!hidden.has(c.key)}
                            onChange={() => toggleColumn(c.key)}
                          />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* filters */}
            <Card className="p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase">
                  Filters
                </p>
                <div className="flex gap-2">
                  {filters.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilters([])}
                    >
                      Clear
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={addFilter}>
                    + Add
                  </Button>
                </div>
              </div>
              {filters.length === 0 && (
                <p className="text-sm text-gray-400">
                  No filters. Add one here, or ask the assistant (“hide quotes
                  over 500k”).
                </p>
              )}
              <div className="space-y-2">
                {filters.map((f, i) => {
                  const col = columns.find((c) => c.key === f.columnKey);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <Select
                        value={f.columnKey}
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, columnKey: e.target.value } : x
                            )
                          )
                        }
                        className="w-56"
                      >
                        {columns.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={f.op}
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, op: e.target.value as any } : x
                            )
                          )
                        }
                        className="w-28"
                      >
                        {col?.numeric ? (
                          <>
                            <option value="lt">&lt;</option>
                            <option value="gt">&gt;</option>
                            <option value="eq">=</option>
                          </>
                        ) : (
                          <>
                            <option value="contains">contains</option>
                            <option value="eq">equals</option>
                          </>
                        )}
                      </Select>
                      <Input
                        value={f.value}
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, value: e.target.value } : x
                            )
                          )
                        }
                        className="w-40"
                        placeholder="value"
                      />
                      <button
                        onClick={() =>
                          setFilters((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="text-red-500 text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* table */}
            <Card className="mb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    {visibleColumns.map((c) => (
                      <th
                        key={c.key}
                        className="px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none"
                        onClick={() => {
                          if (sortKey === c.key) {
                            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortKey(c.key);
                            setSortDir('asc');
                          }
                        }}
                      >
                        {c.label}
                        {sortKey === c.key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row) => (
                    <tr
                      key={row.invitationId}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      {visibleColumns.map((c) => {
                        const v = c.accessor(row);
                        return (
                          <td
                            key={c.key}
                            className="px-3 py-2 whitespace-nowrap"
                          >
                            {v == null
                              ? '—'
                              : c.numeric
                              ? Number(v).toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })
                              : String(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {displayedRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={visibleColumns.length}
                        className="px-3 py-6 text-center text-gray-400"
                      >
                        No rows match the filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            {/* Notes as flagged bullets — Questionnaire tab only */}
            {tab === 'questionnaire' && (
              <Card className="p-4">
                <p className="text-xs font-medium text-gray-500 uppercase mb-3">
                  Supplier-flagged notes & exceptions
                </p>
                {notesByRow.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No supplier flagged anything on their quote.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {notesByRow.map((n) => (
                      <div key={n.supplier}>
                        <p className="text-sm font-medium text-gray-900">
                          {n.supplier}
                        </p>
                        <ul className="mt-1 list-disc pl-5 text-sm text-gray-700 space-y-0.5">
                          {n.bullets.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* RIGHT — persistent assistant */}
          <div className="lg:sticky lg:top-6">
            <QuoteCompareChat
              rfqId={id}
              columns={columns}
              rfqCurrency={data.rfq.currency}
              visibleRowsText={visibleRowsText}
              onApplyFilters={applyChatFilters}
              awarding={awarding}
              onConfirmAward={confirmAward}
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}

/** Break a supplier's free-text notes into discrete bullets. Suppliers flag
 *  exceptions one per line / sentence when filling the quote form. */
function splitNotes(notes: string | null | undefined): string[] {
  if (!notes) return [];
  return notes
    .split(/\r?\n|(?<=[.;])\s+(?=[A-Z0-9])/)
    .map((s) => s.replace(/^[-•*\s]+/, '').trim())
    .filter((s) => s.length > 1);
}
