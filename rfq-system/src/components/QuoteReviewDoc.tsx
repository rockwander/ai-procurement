'use client';

import { useMemo, useState } from 'react';
import { FormSchema, sortedFields } from '@/lib/form-schema';
import {
  normaliseLineResponse,
  normaliseLinePrice,
  committedQty,
  type RFQLineForResponse,
} from '@/lib/line-response';
import { lineFieldId, type LineField } from '@/lib/line-response-status';

export interface ReviewComment {
  id: string;
  fieldId: string;
  fieldLabel: string;
  quotedValue: string | null;
  comment: string;
  intent: 'review' | 'negotiation';
  status: 'open' | 'sent' | 'addressed';
  round: number;
}

interface LineItemInput {
  id: string;
  itemDescription: string;
  quantity: number;
  unit: string;
}

/**
 * The buyer's read-only view of one supplier's submitted quotation. Every
 * value is a target the buyer can click to attach a comment (for a review or
 * negotiation round). Comments already on a field show as a 💬 marker.
 * See REQUIREMENT_quote-negotiation.md.
 */
export function QuoteReviewDoc({
  supplierName,
  rfqTitle,
  rfqCurrency,
  schema,
  lineItems,
  submission,
  comments,
  disabled,
  onAddComment,
}: {
  supplierName: string;
  rfqTitle: string;
  rfqCurrency: string;
  schema: FormSchema;
  lineItems: LineItemInput[];
  submission: {
    formData: Record<string, unknown>;
    lineItems: Array<Record<string, unknown>>;
    notes: string;
    exceptions: Array<{ re: string; comment: string }>;
  };
  comments: ReviewComment[];
  disabled?: boolean;
  onAddComment: (c: { fieldId: string; fieldLabel: string; quotedValue: string | null }) => void;
}) {
  const fields = useMemo(() => sortedFields(schema), [schema]);
  const commByField = useMemo(() => {
    const m = new Map<string, ReviewComment[]>();
    for (const c of comments) {
      if (!m.has(c.fieldId)) m.set(c.fieldId, []);
      m.get(c.fieldId)!.push(c);
    }
    return m;
  }, [comments]);

  const respById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof normaliseLineResponse>>();
    for (const li of lineItems) {
      const match = submission.lineItems.find((x) => String(x.itemId) === li.id);
      m.set(li.id, normaliseLineResponse(match, li as RFQLineForResponse, rfqCurrency));
    }
    return m;
  }, [lineItems, submission.lineItems, rfqCurrency]);

  function Cell({
    fieldId,
    label,
    value,
    display,
    align = 'left',
  }: {
    fieldId: string;
    label: string;
    value: string | number | null | undefined;
    display?: string;
    align?: 'left' | 'right';
  }) {
    const shown = display ?? (value == null || value === '' ? '—' : String(value));
    const cs = commByField.get(fieldId) ?? [];
    return (
      <span
        data-field={fieldId}
        onClick={() =>
          !disabled &&
          onAddComment({
            fieldId,
            fieldLabel: label,
            quotedValue: value == null || value === '' ? null : String(value),
          })
        }
        className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''} ${
          disabled
            ? ''
            : 'cursor-pointer rounded px-0.5 hover:bg-blue-50 hover:underline decoration-dotted underline-offset-2'
        }`}
        title={disabled ? undefined : 'Click to comment on this value'}
      >
        {shown}
        {cs.length > 0 && (
          <span
            className="text-[11px] text-amber-600"
            title={cs.map((c) => c.comment).join('\n')}
          >
            💬{cs.length > 1 ? cs.length : ''}
          </span>
        )}
      </span>
    );
  }

  const commercialFields = fields.filter((f) => f.section && f.section !== 'questionnaire');
  const questionnaireFields = fields.filter((f) => f.section === 'questionnaire');

  return (
    <div className="font-serif text-[15px] leading-relaxed text-gray-800">
      <div className="border-b-2 border-gray-800 pb-3 mb-5">
        <h2 className="font-sans text-xl font-bold text-gray-900">
          {supplierName} — Quotation
        </h2>
        <p className="font-sans text-sm text-gray-500">in response to {rfqTitle}</p>
      </div>

      {/* Pricing */}
      <p className="font-sans font-semibold text-gray-900 mb-2">1. Pricing</p>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-y border-gray-300 text-left align-bottom font-sans text-gray-500">
              <th className="py-1.5 pr-3 w-6">#</th>
              <th className="py-1.5 pr-3">Item</th>
              <th className="py-1.5 pr-3">Supply</th>
              <th className="py-1.5 pr-3 text-right">Unit price</th>
              <th className="py-1.5 pr-3">per</th>
              <th className="py-1.5 pr-3 text-right">Committed</th>
              <th className="py-1.5 pr-3 text-right">Lead</th>
              <th className="py-1.5 text-right">MOQ</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, i) => {
              const r = respById.get(li.id)!;
              const noBid = r.canSupply === 'no';
              const norm = normaliseLinePrice(r, rfqCurrency);
              const qty = committedQty(r, li.quantity);
              const lf = (f: LineField) => lineFieldId(li.id, f);
              return (
                <tr key={li.id} className={`border-b border-gray-100 align-top ${noBid ? 'text-gray-400' : ''}`}>
                  <td className="py-2 pr-3 text-gray-400">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <span className={noBid ? 'line-through' : ''}>{li.itemDescription}</span>
                    <div className="font-sans text-[12px] text-gray-400">
                      asked {li.quantity.toLocaleString()} {li.unit}
                    </div>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <Cell
                      fieldId={lf('canSupply')}
                      label={`Line ${i + 1} — can supply`}
                      value={r.canSupply}
                      display={
                        noBid ? 'not offered' : r.canSupply === 'partial' ? 'partial' : 'full'
                      }
                    />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {noBid ? (
                      '—'
                    ) : (
                      <Cell
                        fieldId={lf('unitPrice')}
                        label={`Line ${i + 1} — unit price`}
                        value={r.unitPrice}
                        display={
                          r.unitPrice == null
                            ? '—'
                            : `${r.unitPrice.toLocaleString()}${
                                norm.currencyDiffers ? ' ' + r.currency : ''
                              }`
                        }
                        align="right"
                      />
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {noBid ? null : (
                      <Cell
                        fieldId={lf('quotedUom')}
                        label={`Line ${i + 1} — unit of measure`}
                        value={r.quotedUom}
                        display={r.quotedUom.replace(/^per /, '')}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {noBid ? '0' : `${qty.toLocaleString()} / ${li.quantity.toLocaleString()}`}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {noBid ? null : (
                      <Cell
                        fieldId={lf('leadTimeDays')}
                        label={`Line ${i + 1} — lead time (days)`}
                        value={r.leadTimeDays}
                        align="right"
                      />
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {noBid ? null : (
                      <Cell
                        fieldId={lf('moq')}
                        label={`Line ${i + 1} — MOQ`}
                        value={r.moq}
                        align="right"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Commercial terms */}
      {commercialFields.length > 0 && (
        <>
          <p className="font-sans font-semibold text-gray-900 mt-8 mb-2">2. Commercial terms</p>
          <ul className="space-y-1.5 list-disc pl-5">
            {commercialFields.map((f) => (
              <li key={f.id}>
                <span className="font-medium">{f.label}: </span>
                <Cell fieldId={f.id} label={f.label} value={submission.formData[f.id] as any} />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Questionnaire */}
      {questionnaireFields.length > 0 && (
        <>
          <p className="font-sans font-semibold text-gray-900 mt-8 mb-2">3. Quality &amp; capability</p>
          <dl className="space-y-3">
            {questionnaireFields.map((f) => (
              <div key={f.id}>
                <dt className="text-gray-700">{f.label}</dt>
                <dd className="pl-4">
                  <Cell fieldId={f.id} label={f.label} value={submission.formData[f.id] as any} />
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {/* Supplier notes & exceptions */}
      {(submission.notes || submission.exceptions.length > 0) && (
        <>
          <p className="font-sans font-semibold text-gray-900 mt-8 mb-2">
            4. Supplier notes &amp; conditions
          </p>
          {submission.exceptions.length > 0 && (
            <ul className="space-y-1 list-disc pl-5 mb-2">
              {submission.exceptions.map((e, i) => (
                <li key={i}>
                  <span className="font-medium">{e.re.replace(/[.:\s]+$/, '')} — </span>
                  {e.comment}
                </li>
              ))}
            </ul>
          )}
          {submission.notes && (
            <p className="whitespace-pre-wrap text-[14px] text-gray-700">{submission.notes}</p>
          )}
        </>
      )}

      {/* Comment on the quote overall */}
      <div className="mt-6 border-t border-gray-200 pt-3">
        <Cell
          fieldId="__quote"
          label="Overall quotation"
          value={null}
          display={disabled ? 'Overall comments' : '+ Comment on the quotation overall'}
        />
      </div>
    </div>
  );
}
