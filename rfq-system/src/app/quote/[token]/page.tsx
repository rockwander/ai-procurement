'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  QuotePreview,
  QuoteFormValue,
  LineItemInput,
  ActiveField,
} from '@/components/QuotePreview';
import { NeedsAttentionPanel } from '@/components/NeedsAttentionPanel';
import { QuoteChat, ChatApplyPayload, ChatScope } from '@/components/QuoteChat';
import { Button, ErrorText } from '@/components/ui';
import { api } from '@/lib/fetcher';
import { FormSchema, emptySchema } from '@/lib/form-schema';
import {
  LineItemResponse,
  RFQLineForResponse,
  emptyLineResponse,
  normaliseLineResponse,
  committedQty,
} from '@/lib/line-response';
import {
  missingMandatory,
  type ProvenanceMap,
  type AttentionItem,
  type QuoteException,
} from '@/lib/line-response-status';

interface QuoteData {
  rfq: {
    title: string;
    summary: string;
    deadline: string | null;
    currency: string;
    terms: string[];
    header: { buyer: string; expectedDelivery: string; validity: string };
  };
  supplier: { companyName: string };
  formSchema: FormSchema;
  lineItems: LineItemInput[];
  submitted: boolean;
  submission: { formData: any; lineItems: any[]; exceptions?: QuoteException[] } | null;
}

export default function SupplierQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const [value, setValue] = useState<QuoteFormValue>({
    formData: {},
    lineResponses: {},
    notes: '',
  });
  // target id -> confidence + rationale for values the AI wrote / defaulted.
  const [provenance, setProvenance] = useState<ProvenanceMap>({});
  const [activeField, setActiveField] = useState<ChatScope | null>(null);
  // caveats the supplier raised against a passage (heading / T&C / intro)
  const [exceptions, setExceptions] = useState<QuoteException[]>([]);

  useEffect(() => {
    api<QuoteData>(`/api/quote/${token}`)
      .then((d) => {
        setData(d);
        const lineResponses: Record<string, LineItemResponse> = {};
        const byId = new Map(
          (d.submission?.lineItems ?? []).map((li: any) => [String(li.itemId), li])
        );
        for (const li of d.lineItems) {
          lineResponses[li.id] = d.submission
            ? normaliseLineResponse(byId.get(li.id), li as RFQLineForResponse, d.rfq.currency)
            : emptyLineResponse(li as RFQLineForResponse, d.rfq.currency);
        }
        setValue({
          formData: d.submission?.formData ?? {},
          lineResponses,
          notes: '',
        });
        if (d.submission?.exceptions?.length) setExceptions(d.submission.exceptions);
        // Seed provenance: system-inferred defaults start as "assumed" (amber)
        // so the supplier is nudged to confirm currency / UoM etc.
        if (!d.submission) {
          const prov: ProvenanceMap = {};
          for (const li of d.lineItems) {
            prov[`line:${li.id}:currency`] = { isDefault: true, rationale: `Assumed ${d.rfq.currency} — the RFQ currency` };
            prov[`line:${li.id}:quotedUom`] = { isDefault: true, rationale: `Assumed from the asked unit "${li.unit}"` };
          }
          setProvenance(prov);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const schema = data?.formSchema?.fields ? data.formSchema : emptySchema();
  const locked = data?.submitted || justSubmitted;

  const attention = useMemo(() => {
    if (!data) return { items: [], byGroup: { 'line-items': 0, commercial: 0, questionnaire: 0 }, total: 0 };
    return missingMandatory(
      data.lineItems as RFQLineForResponse[],
      value.lineResponses,
      schema,
      value.formData
    );
  }, [data, schema, value]);

  const confirmField = useCallback((targetId: string) => {
    setProvenance((prev) => ({
      ...prev,
      [targetId]: { ...prev[targetId], confirmedBySupplier: true, isDefault: false },
    }));
  }, []);

  const jumpToField = useCallback((item: AttentionItem | ActiveField) => {
    setActiveField({ id: item.id, label: item.label });
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-field="${CSS.escape(item.id)}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  // The supplier clicked a document passage (heading / T&C / intro) to comment.
  const activatePassage = useCallback((p: { id: string; label: string; text: string }) => {
    setActiveField({ id: p.id, label: p.label, text: p.text });
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-field="${CSS.escape(p.id)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  async function submit() {
    if (!data) return;
    setError('');
    setSubmitting(true);
    try {
      const lineItems = data.lineItems.map((li) => {
        const r =
          value.lineResponses[li.id] ??
          emptyLineResponse(li as RFQLineForResponse, data.rfq.currency);
        const qty = committedQty(r, li.quantity);
        const unitPrice = r.canSupply === 'no' ? null : r.unitPrice;
        return {
          itemId: li.id,
          itemDescription: li.itemDescription,
          quantity: li.quantity,
          canSupply: r.canSupply,
          unitPrice,
          currency: r.currency,
          quotedUom: r.quotedUom,
          availableQty: r.availableQty,
          committedQty: qty,
          leadTimeDays: r.leadTimeDays,
          moq: r.moq,
          totalPrice: unitPrice != null ? unitPrice * qty : null,
        };
      });
      await api(`/api/quote/${token}`, {
        method: 'POST',
        body: JSON.stringify({
          formData: value.formData,
          lineItems,
          notes: value.notes || undefined,
          exceptions,
        }),
      });
      setJustSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <ErrorText>{error || 'This quote link is invalid.'}</ErrorText>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">Your quotation</h1>
          <p className="text-sm text-gray-500">
            {data.supplier.companyName} · responding to {data.rfq.title}
            {data.rfq.deadline &&
              ` · due ${new Date(data.rfq.deadline).toLocaleDateString()}`}
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-5 gap-6">
        {/* Left — chat */}
        <div className="lg:col-span-2 order-2 lg:order-1">
          <div className="lg:sticky lg:top-6 space-y-4">
            <QuoteChat
              token={token}
              activeField={activeField}
              onClearActiveField={() => setActiveField(null)}
              disabled={!!locked}
              onApply={(payload: ChatApplyPayload) => {
                setValue((prev) => {
                  const lineResponses = { ...prev.lineResponses };
                  for (const [itemId, patch] of Object.entries(payload.linePatches)) {
                    const li = data.lineItems.find((x) => x.id === itemId);
                    if (!li) continue;
                    const current =
                      lineResponses[itemId] ??
                      emptyLineResponse(li as RFQLineForResponse, data.rfq.currency);
                    lineResponses[itemId] = { ...current, ...patch, itemId };
                  }
                  return {
                    ...prev,
                    formData: { ...prev.formData, ...payload.formPatches },
                    lineResponses,
                  };
                });
                setProvenance((prev) => {
                  const next: ProvenanceMap = { ...prev };
                  for (const [id, p] of Object.entries(payload.provenance)) {
                    next[id] = { ...next[id], ...p, isDefault: false };
                  }
                  return next;
                });
                if (payload.exceptions.length) {
                  setExceptions((prev) => [...prev, ...payload.exceptions]);
                }
              }}
            />
          </div>
        </div>

        {/* Right — preview */}
        <div className="lg:col-span-3 order-1 lg:order-2 space-y-4">
          <details className="bg-white rounded-lg border border-gray-200 p-4 text-sm">
            <summary className="font-semibold text-gray-900 cursor-pointer">
              What the buyer is asking for
            </summary>
            <p className="text-gray-600 whitespace-pre-wrap mt-2">
              {data.rfq.summary}
            </p>
          </details>

          {locked ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-5">
              <p className="font-semibold text-green-800 mb-1">Quote submitted</p>
              <p className="text-sm text-green-700">
                Your quote has been received and can no longer be changed. Thank you.
              </p>
            </div>
          ) : (
            <NeedsAttentionPanel list={attention} onJump={jumpToField} />
          )}

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <QuotePreview
              buyerTitle={data.rfq.title}
              schema={schema}
              lineItems={data.lineItems}
              rfqCurrency={data.rfq.currency}
              rfqTerms={data.rfq.terms}
              rfqHeader={data.rfq.header}
              value={value}
              provenance={provenance}
              exceptions={exceptions}
              activeFieldId={activeField?.id}
              onChange={setValue}
              onConfirmField={confirmField}
              onActivateField={(f) => (f ? jumpToField(f) : setActiveField(null))}
              onActivatePassage={activatePassage}
              onRemoveException={(i) =>
                setExceptions((prev) => prev.filter((_, j) => j !== i))
              }
              disabled={!!locked}
            />

            {!locked && (
              <div className="mt-6 border-t border-gray-200 pt-4">
                {error && <div className="mb-3"><ErrorText>{error}</ErrorText></div>}
                {attention.total > 0 && (
                  <p className="text-xs text-red-600 mb-2">
                    {attention.total} mandatory {attention.total === 1 ? 'field is' : 'fields are'} still
                    empty — clear the list above to submit.
                  </p>
                )}
                <Button
                  onClick={submit}
                  disabled={submitting || attention.total > 0}
                >
                  {submitting ? 'Submitting…' : 'Submit quote (final)'}
                </Button>
                <p className="text-xs text-gray-400 mt-1">
                  You cannot edit the quote after submitting.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
