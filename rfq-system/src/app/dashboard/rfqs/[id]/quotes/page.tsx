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
  applyFilters,
} from '@/lib/quote-columns';
import {
  buildLineMatrix,
  buildQuestionnaireMatrix,
} from '@/lib/quote-matrix';

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
  // suppliers (by invitationId) the buyer has manually hidden
  const [hiddenSuppliers, setHiddenSuppliers] = useState<Set<string>>(new Set());
  // line-item field groups the buyer has hidden
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [filters, setFilters] = useState<Filter[]>([]);

  const [awarding, setAwarding] = useState(false);
  const [awardResults, setAwardResults] = useState<any[] | null>(null);

  useEffect(() => {
    api<any>(`/api/rfqs/${id}/quotes`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Chat + filter-field vocabulary — the per-supplier column model.
  const columns: ColumnDef[] = useMemo(
    () =>
      data
        ? buildColumns(data.rfq.formSchema, data.lineItems, data.rfq.currency)
        : [],
    [data]
  );

  const submittedRows = useMemo(
    () => (data?.quotes ?? []).filter((q) => q.status === 'submitted'),
    [data]
  );

  // Filters + manual hide decide which suppliers appear as columns.
  const visibleSuppliers = useMemo(() => {
    const passFilter = applyFilters(submittedRows, columns, filters);
    return passFilter.filter((r) => !hiddenSuppliers.has(r.invitationId));
  }, [submittedRows, columns, filters, hiddenSuppliers]);

  const rfqCurrency = data?.rfq.currency ?? 'INR';

  const lineMatrix = useMemo(
    () =>
      data
        ? buildLineMatrix(data.lineItems, visibleSuppliers, rfqCurrency)
        : null,
    [data, visibleSuppliers, rfqCurrency]
  );

  const questionnaireMatrix = useMemo(
    () =>
      data
        ? buildQuestionnaireMatrix(data.rfq.formSchema, visibleSuppliers)
        : null,
    [data, visibleSuppliers]
  );

  const visibleGroups = useMemo(
    () => (lineMatrix?.groups ?? []).filter((g) => !hiddenGroups.has(g.key)),
    [lineMatrix, hiddenGroups]
  );

  // Notes for the Questionnaire tab: rendered as flagged bullets.
  const notesByRow = useMemo(
    () =>
      visibleSuppliers
        .map((r) => ({ supplier: r.supplierName, bullets: splitNotes(r.notes) }))
        .filter((n) => n.bullets.length > 0),
    [visibleSuppliers]
  );

  // Compact text of what's on screen, for the assistant to reason over.
  const visibleRowsText = useMemo(() => {
    if (!lineMatrix || !questionnaireMatrix) return '(no quotes)';
    const s = lineMatrix.suppliers;
    if (s.length === 0) return '(no suppliers match the filters)';

    const out: string[] = [];
    out.push(`Suppliers in view: ${s.map((x) => x.supplierName).join(', ')}`);

    out.push('\nLine items (value per supplier, in the order above):');
    for (const row of lineMatrix.rows) {
      const parts = visibleGroups.map((g) => {
        const vals = s
          .map((sc) => {
            const sup = visibleSuppliers.find(
              (v) => v.invitationId === sc.invitationId
            )!;
            return g.format(g.value(row.lineId, sup));
          })
          .join(' / ');
        return `${g.label}: ${vals}`;
      });
      out.push(`- ${row.itemDescription} (asked ${row.askedQuantity} ${row.unit}) — ${parts.join('; ')}`);
    }

    if (questionnaireMatrix.rows.length) {
      out.push('\nQuestionnaire (answer per supplier, in the order above):');
      for (const q of questionnaireMatrix.rows) {
        const vals = s
          .map((sc) => {
            const sup = visibleSuppliers.find(
              (v) => v.invitationId === sc.invitationId
            )!;
            const v = q.value(sup);
            return v == null || v === '' ? '—' : String(v);
          })
          .join(' / ');
        out.push(`- ${q.label}: ${vals}`);
      }
    }

    for (const n of notesByRow) {
      out.push(`\nFlagged by ${n.supplier}: ${n.bullets.join(' | ')}`);
    }
    return out.join('\n');
  }, [lineMatrix, questionnaireMatrix, visibleGroups, visibleSuppliers, notesByRow]);

  function toggleSupplier(invitationId: string) {
    setHiddenSuppliers((prev) => {
      const next = new Set(prev);
      next.has(invitationId) ? next.delete(invitationId) : next.add(invitationId);
      return next;
    });
  }

  function toggleGroup(key: string) {
    setHiddenGroups((prev) => {
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

  const allSuppliers = submittedRows;

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
        {visibleSuppliers.length !== submittedRows.length && (
          <> · {visibleSuppliers.length} shown</>
        )}
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
          {/* LEFT — transposed comparison grid */}
          <div className="min-w-0">
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
                  Show / hide ▾
                </Button>
                {showColumnMenu && (
                  <div className="absolute right-0 z-10 mt-1 w-60 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                    <p className="text-[11px] font-medium text-gray-400 uppercase px-1 pb-1">
                      Suppliers
                    </p>
                    <div className="space-y-0.5">
                      {allSuppliers.map((s) => {
                        const filteredOut = !applyFilters(
                          [s],
                          columns,
                          filters
                        ).length;
                        return (
                          <label
                            key={s.invitationId}
                            className={`flex items-center gap-2 px-1 py-1 text-xs rounded hover:bg-gray-50 ${
                              filteredOut
                                ? 'text-gray-300'
                                : 'text-gray-700 cursor-pointer'
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={filteredOut}
                              checked={
                                !hiddenSuppliers.has(s.invitationId) && !filteredOut
                              }
                              onChange={() => toggleSupplier(s.invitationId)}
                            />
                            {s.supplierName}
                            {filteredOut && ' (filtered out)'}
                          </label>
                        );
                      })}
                    </div>
                    {tab === 'lineitems' && (
                      <>
                        <p className="text-[11px] font-medium text-gray-400 uppercase px-1 pt-2 pb-1">
                          Line fields
                        </p>
                        <div className="space-y-0.5">
                          {(lineMatrix?.groups ?? []).map((g) => (
                            <label
                              key={g.key}
                              className="flex items-center gap-2 px-1 py-1 text-xs text-gray-700 rounded hover:bg-gray-50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={!hiddenGroups.has(g.key)}
                                onChange={() => toggleGroup(g.key)}
                              />
                              {g.label}
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* filters */}
            <Card className="p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase">
                  Filter suppliers
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
                  No filters. Drop a supplier column with a rule here, or ask the
                  assistant (“hide quotes over 500k”).
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

            {visibleSuppliers.length === 0 ? (
              <Card className="p-8 text-center text-gray-400">
                No suppliers match the filters.
              </Card>
            ) : tab === 'lineitems' ? (
              <LineGrid
                matrix={lineMatrix!}
                groups={visibleGroups}
                suppliers={visibleSuppliers}
              />
            ) : (
              <>
                <QuestionnaireGrid
                  matrix={questionnaireMatrix!}
                  suppliers={visibleSuppliers}
                />
                <Card className="p-4 mt-4">
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
              </>
            )}
          </div>

          {/* RIGHT — persistent assistant */}
          <div className="lg:sticky lg:top-6">
            <QuoteCompareChat
              rfqId={id}
              columns={columns}
              rfqCurrency={rfqCurrency}
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

/* ── Line-items grid ─────────────────────────────────────────────────────────
 * Row per RFQ line item. Column groups are per-line fields; under each, one
 * sub-column per supplier. Line-item column + first group are sticky so the
 * comparison stays readable while scrolling right through the field groups. */
function LineGrid({
  matrix,
  groups,
  suppliers,
}: {
  matrix: ReturnType<typeof buildLineMatrix>;
  groups: ReturnType<typeof buildLineMatrix>['groups'];
  suppliers: QuoteRow[];
}) {
  return (
    <Card className="overflow-x-auto">
      <table className="text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th
              rowSpan={2}
              className="sticky left-0 z-20 bg-white px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap border-r border-gray-200 min-w-[220px]"
            >
              Line item
            </th>
            {groups.map((g) => (
              <th
                key={g.key}
                colSpan={suppliers.length}
                className="px-3 py-2 text-center font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200"
              >
                {g.label}
              </th>
            ))}
          </tr>
          <tr className="border-b border-gray-200 text-gray-500">
            {groups.map((g) =>
              suppliers.map((s, i) => (
                <th
                  key={g.key + s.invitationId}
                  className={`px-3 py-1.5 font-medium whitespace-nowrap ${
                    g.numeric ? 'text-right' : 'text-left'
                  } ${i === suppliers.length - 1 ? 'border-r border-gray-200' : ''}`}
                >
                  {s.supplierName}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.lineId} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="sticky left-0 z-10 bg-white px-3 py-2 whitespace-nowrap border-r border-gray-200">
                <span className="font-medium text-gray-900">
                  {row.itemDescription}
                </span>
                <span className="block text-xs text-gray-400">
                  asked {row.askedQuantity.toLocaleString()} {row.unit}
                </span>
              </td>
              {groups.map((g) =>
                suppliers.map((s, i) => {
                  const raw = g.value(row.lineId, s);
                  const txt = g.format(raw);
                  const muted = txt === '—' || raw === 'no-bid';
                  return (
                    <td
                      key={g.key + s.invitationId}
                      className={`px-3 py-2 whitespace-nowrap ${
                        g.numeric ? 'text-right tabular-nums' : 'text-left'
                      } ${muted ? 'text-gray-300' : 'text-gray-800'} ${
                        i === suppliers.length - 1 ? 'border-r border-gray-200' : ''
                      }`}
                    >
                      {txt}
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ── Questionnaire grid ──────────────────────────────────────────────────────
 * Row per question, one column per supplier. */
function QuestionnaireGrid({
  matrix,
  suppliers,
}: {
  matrix: ReturnType<typeof buildQuestionnaireMatrix>;
  suppliers: QuoteRow[];
}) {
  if (matrix.rows.length === 0) {
    return (
      <Card className="p-8 text-center text-gray-400">
        This RFQ has no questionnaire.
      </Card>
    );
  }
  return (
    <Card className="overflow-x-auto">
      <table className="text-sm border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium whitespace-nowrap border-r border-gray-200 min-w-[240px]">
              Question
            </th>
            {suppliers.map((s) => (
              <th
                key={s.invitationId}
                className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap min-w-[200px]"
              >
                {s.supplierName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((q) => (
            <tr key={q.fieldId} className="border-b border-gray-100 align-top hover:bg-gray-50">
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-gray-900 border-r border-gray-200">
                {q.label}
              </td>
              {suppliers.map((s) => {
                const v = q.value(s);
                const empty = v == null || v === '';
                return (
                  <td
                    key={s.invitationId}
                    className={`px-3 py-2 ${
                      q.numeric ? 'tabular-nums' : ''
                    } ${empty ? 'text-gray-300' : 'text-gray-800'}`}
                  >
                    {empty
                      ? '—'
                      : q.numeric
                      ? Number(v).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })
                      : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
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
