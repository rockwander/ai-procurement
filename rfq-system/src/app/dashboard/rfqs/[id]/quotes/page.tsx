'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Input, Select, Spinner, ErrorText, Badge, StatusBadge } from '@/components/ui';
import { api } from '@/lib/fetcher';
import {
  QuoteRow,
  ColumnDef,
  Filter,
  buildColumns,
  applyFilters,
  sortRows,
} from '@/lib/quote-columns';

const STRATEGY_PRESETS = [
  'Lowest total cost — award everything to the single supplier with the lowest overall cost',
  'Lowest unit price — award each line item to the cheapest supplier for that item',
  'Split award — distribute line items across suppliers to balance cost and delivery risk',
  'Single-source award — give the entire requirement to the best-fit supplier',
  'Quality-first — only consider suppliers meeting mandatory quality criteria, then lowest cost',
  'Weighted score — 60% price, 25% delivery speed, 15% past performance',
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

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sortKey, setSortKey] = useState<string | null>('totalAmount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [strategy, setStrategy] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(null);
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
        ? buildColumns(data.rfq.formSchema, data.lineItems)
        : [],
    [data]
  );

  const visibleColumns = columns.filter((c) => !hidden.has(c.key));

  const submittedRows = useMemo(
    () => (data?.quotes ?? []).filter((q) => q.status === 'submitted'),
    [data]
  );

  const displayedRows = useMemo(() => {
    let rows = applyFilters(submittedRows, columns, filters);
    rows = sortRows(rows, columns, sortKey, sortDir);
    return rows;
  }, [submittedRows, columns, filters, sortKey, sortDir]);

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

  async function runStrategy() {
    setError('');
    setEvaluating(true);
    setAwardResults(null);
    try {
      const res = await api<any>(`/api/rfqs/${id}/evaluate`, {
        method: 'POST',
        body: JSON.stringify({ strategy }),
      });
      setEvaluation(res.evaluation);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEvaluating(false);
    }
  }

  async function confirmAward() {
    if (!evaluation) return;
    setAwarding(true);
    setError('');
    try {
      const res = await api<{ results: any[] }>(`/api/rfqs/${id}/award`, {
        method: 'POST',
        body: JSON.stringify({
          awards: evaluation.awards,
          strategy,
          reasoning: evaluation.reasoning,
        }),
      });
      setAwardResults(res.results);
      setEvaluation(null);
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
        {(data.quotes.length - submittedRows.length)} pending
      </p>

      {error && <div className="mb-4"><ErrorText>{error}</ErrorText></div>}

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
        <>
          {/* Column show/hide */}
          <Card className="p-4 mb-4">
            <p className="text-xs font-medium text-gray-500 uppercase mb-2">
              Columns
            </p>
            <div className="flex flex-wrap gap-2">
              {columns.map((c) => (
                <button
                  key={c.key}
                  onClick={() => toggleColumn(c.key)}
                  className={`px-2 py-1 rounded text-xs border ${
                    hidden.has(c.key)
                      ? 'bg-white text-gray-400 border-gray-200 line-through'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </Card>

          {/* Filters */}
          <Card className="p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500 uppercase">
                Filters (parent & child fields)
              </p>
              <Button variant="secondary" size="sm" onClick={addFilter}>
                + Add filter
              </Button>
            </div>
            {filters.length === 0 && (
              <p className="text-sm text-gray-400">
                No filters. Add one to filter by e.g. a line-item unit price or a
                questionnaire answer.
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

          {/* Table */}
          <Card className="mb-6 overflow-x-auto">
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
                        <td key={c.key} className="px-3 py-2 whitespace-nowrap">
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

          {/* Strategy */}
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Apply procurement strategy</h2>
            <div className="flex flex-wrap gap-2">
              {STRATEGY_PRESETS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 text-left"
                >
                  {s.split(' — ')[0]}
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              placeholder="Describe your award strategy in plain English…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
            <Button
              onClick={runStrategy}
              disabled={evaluating || strategy.trim().length < 3}
            >
              {evaluating ? 'Evaluating…' : 'Preview award'}
            </Button>
            {evaluating && (
              <Spinner label="Quote evaluation agent applying strategy…" />
            )}

            {evaluation && (
              <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                <p className="text-sm text-gray-700">{evaluation.reasoning}</p>
                <p className="text-sm font-medium">
                  Total: ${evaluation.totalCost?.toLocaleString()}
                  {evaluation.savings ? (
                    <span className="text-green-600">
                      {' '}
                      (saves ${evaluation.savings.toLocaleString()})
                    </span>
                  ) : null}
                </p>
                {(evaluation.warnings ?? []).map((w: string, i: number) => (
                  <p key={i} className="text-xs text-yellow-700">
                    ⚠ {w}
                  </p>
                ))}
                {evaluation.awards.map((a: any) => (
                  <div key={a.supplierId} className="bg-white rounded p-3 border border-gray-200">
                    <p className="font-medium text-gray-900 mb-1">
                      {a.supplierName} — ${a.totalAmount.toLocaleString()}
                    </p>
                    <ul className="text-sm text-gray-600 list-disc pl-5">
                      {a.lineItems.map((li: any, i: number) => (
                        <li key={i}>
                          {li.itemDescription}: {li.quantity} × $
                          {li.unitPrice} = ${li.totalPrice.toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button onClick={confirmAward} disabled={awarding}>
                    {awarding ? 'Sending POs…' : 'Confirm & send purchase orders'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setEvaluation(null)}
                    disabled={awarding}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
