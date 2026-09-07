'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { QuoteForm, QuoteFormValue, LineItemInput } from '@/components/QuoteForm';
import { QuoteChat, ChatApplyPayload } from '@/components/QuoteChat';
import { Button, ErrorText } from '@/components/ui';
import { api } from '@/lib/fetcher';
import { FormSchema, emptySchema, sortedFields } from '@/lib/form-schema';

interface QuoteData {
  rfq: { title: string; summary: string; deadline: string | null };
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
    lineItemPrices: {},
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
          const prices: Record<string, number> = {};
          for (const li of d.submission.lineItems ?? []) {
            prices[String(li.itemId)] = Number(li.unitPrice);
          }
          setValue({
            formData: d.submission.formData ?? {},
            lineItemPrices: prices,
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
    for (const li of data.lineItems) {
      if (!value.lineItemPrices[li.id] || value.lineItemPrices[li.id] <= 0) {
        missing.push(`price for ${li.itemDescription}`);
      }
    }
    return missing;
  }, [data, schema, value]);

  async function submit() {
    if (!data) return;
    setError('');
    setSubmitting(true);
    try {
      const lineItems = data.lineItems.map((li) => {
        const unitPrice = value.lineItemPrices[li.id] ?? 0;
        return {
          itemId: li.id,
          itemDescription: li.itemDescription,
          quantity: li.quantity,
          unitPrice,
          totalPrice: unitPrice * li.quantity,
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
          <QuoteChat
            token={token}
            currentFormData={value.formData}
            currentLinePrices={value.lineItemPrices}
            disabled={!!locked}
            onApply={(payload: ChatApplyPayload) => {
              setValue((prev) => ({
                ...prev,
                formData: { ...prev.formData, ...payload.fields },
                lineItemPrices: { ...prev.lineItemPrices, ...payload.lineItemPrices },
              }));
              setAiNotes((prev) => ({ ...prev, ...payload.notes }));
            }}
          />
        </div>
      </div>
    </div>
  );
}
