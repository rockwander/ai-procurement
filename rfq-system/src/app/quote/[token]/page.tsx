'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { QuoteForm, QuoteFormValue, LineItemInput } from '@/components/QuoteForm';
import { QuoteChat, ChatApplyPayload } from '@/components/QuoteChat';
import { Button, ErrorText } from '@/components/ui';
import { api } from '@/lib/fetcher';
import { FormSchema, emptySchema, sortedFields } from '@/lib/form-schema';
import {
  LineItemResponse,
  RFQLineForResponse,
  emptyLineResponse,
  normaliseLineResponse,
  committedQty,
} from '@/lib/line-response';

interface QuoteData {
  rfq: { title: string; summary: string; deadline: string | null; currency: string };
  supplier: { companyName: string };
  formSchema: FormSchema;
  lineItems: LineItemInput[];
  submitted: boolean;
  submission: { formData: any; lineItems: any[] } | null;
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
  // fieldId -> the assistant's fuller answer, when it had to be shortened to
  // fit the control. Shown as a hint under the field.
  const [aiNotes, setAiNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    api<QuoteData>(`/api/quote/${token}`)
      .then((d) => {
        setData(d);
        if (d.submission) {
          const byId = new Map(
            (d.submission.lineItems ?? []).map((li: any) => [String(li.itemId), li])
          );
          const lineResponses: Record<string, LineItemResponse> = {};
          for (const li of d.lineItems) {
            lineResponses[li.id] = normaliseLineResponse(
              byId.get(li.id),
              li as RFQLineForResponse,
              d.rfq.currency
            );
          }
          setValue({
            formData: d.submission.formData ?? {},
            lineResponses,
            notes: '',
          });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const schema = data?.formSchema?.fields ? data.formSchema : emptySchema();
  const locked = data?.submitted || justSubmitted;

  const missingRequired = useMemo(() => {
    if (!data) return [];
    const missing: string[] = [];
    for (const f of sortedFields(schema)) {
      if (f.required && !value.formData[f.id]) missing.push(f.label);
    }
    let pricedLines = 0;
    for (const li of data.lineItems) {
      const r =
        value.lineResponses[li.id] ??
        emptyLineResponse(li as RFQLineForResponse, data.rfq.currency);
      if (r.canSupply !== 'no') {
        if (r.unitPrice == null || r.unitPrice <= 0) {
          missing.push(`price for ${li.itemDescription}`);
        } else {
          pricedLines++;
        }
      }
    }
    if (pricedLines === 0) {
      missing.push('at least one line item priced');
    }
    return missing;
  }, [data, schema, value]);

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
          quantity: li.quantity, // asked qty
          canSupply: r.canSupply,
          unitPrice,
          currency: r.currency,
          quotedUom: r.quotedUom,
          availableQty: r.availableQty,
          committedQty: qty,
          leadTimeDays: r.leadTimeDays,
          moq: r.moq,
          // totalPrice at the committed qty in the quoted currency — a rough
          // headline only; the comparison normalises UoM/currency itself.
          totalPrice: unitPrice != null ? unitPrice * qty : null,
        };
      });
      await api(`/api/quote/${token}`, {
        method: 'POST',
        body: JSON.stringify({
          formData: value.formData,
          lineItems,
          notes: value.notes || undefined,
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
          <h1 className="text-xl font-bold text-gray-900">
            Request for Quotation
          </h1>
          <p className="text-sm text-gray-500">
            {data.supplier.companyName}
            {data.rfq.deadline &&
              ` · due ${new Date(data.rfq.deadline).toLocaleDateString()}`}
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-2">{data.rfq.title}</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {data.rfq.summary}
            </p>
          </div>

          {locked ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-5">
              <p className="font-semibold text-green-800 mb-2">
                Quote submitted
              </p>
              <p className="text-sm text-green-700">
                Your quote has been received and can no longer be changed. Thank
                you.
              </p>
            </div>
          ) : null}

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <QuoteForm
              schema={schema}
              lineItems={data.lineItems}
              rfqCurrency={data.rfq.currency}
              value={value}
              onChange={setValue}
              disabled={!!locked}
              aiNotes={aiNotes}
            />

            {!locked && (
              <div className="mt-6 border-t border-gray-200 pt-4">
                {error && <div className="mb-3"><ErrorText>{error}</ErrorText></div>}
                {missingRequired.length > 0 && (
                  <p className="text-xs text-gray-500 mb-2">
                    Still needed: {missingRequired.join(', ')}
                  </p>
                )}
                <Button
                  onClick={submit}
                  disabled={submitting || missingRequired.length > 0}
                >
                  {submitting ? 'Submitting…' : 'Submit quote (final)'}
                </Button>
                <p className="text-xs text-gray-400 mt-1">
                  You cannot edit the form after submitting.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-6">
            <QuoteChat
              token={token}
              currentFormData={value.formData}
              currentLinePrices={Object.fromEntries(
                Object.entries(value.lineResponses)
                  .filter(([, r]) => r.unitPrice != null)
                  .map(([id, r]) => [id, r.unitPrice as number])
              )}
              disabled={!!locked}
              onApply={(payload: ChatApplyPayload) => {
                setValue((prev) => {
                  // The AI assist fills unit prices; fold each into the fixed
                  // per-line response, leaving the supplier to confirm
                  // can-supply / UoM / available qty.
                  const lineResponses = { ...prev.lineResponses };
                  for (const [itemId, price] of Object.entries(payload.lineItemPrices)) {
                    const li = data.lineItems.find((x) => x.id === itemId);
                    if (!li) continue;
                    const current =
                      lineResponses[itemId] ??
                      emptyLineResponse(li as RFQLineForResponse, data.rfq.currency);
                    lineResponses[itemId] = { ...current, unitPrice: price, itemId };
                  }
                  return {
                    ...prev,
                    formData: { ...prev.formData, ...payload.fields },
                    lineResponses,
                  };
                });
                setAiNotes((prev) => ({ ...prev, ...payload.notes }));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
