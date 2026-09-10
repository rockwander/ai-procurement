'use client';

import { useEffect, type ReactNode } from 'react';
import {
  RFQDocument,
  PER_LINE_RESPONSE_ITEMS,
} from '@/lib/rfq-document';

/**
 * Read-only rendering of the canonical RFQ document as a *document* — the buyer's
 * counterpart to the supplier's quotation preview (QuotePreview.tsx). It reads
 * like the RFQ a supplier will receive; there are no input controls.
 *
 * All changes to the form definition (rename a field, make it required, change a
 * type, add / remove / reorder) are made by talking to the assistant in the
 * create-RFQ conversation. Each field / question / line carries a
 * `data-field="<id>"` so an applied edit can scroll to and briefly highlight it.
 */
export function RFQDocumentPreview({
  doc,
  changedFieldIds = [],
}: {
  doc: RFQDocument;
  changedFieldIds?: string[];
}) {
  const changed = new Set(changedFieldIds);
  const h = doc.header;

  // Scroll the first field an AI edit just touched into view.
  useEffect(() => {
    if (changedFieldIds.length === 0) return;
    const el = document.querySelector(
      `[data-field="${CSS.escape(changedFieldIds[0])}"]`
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [changedFieldIds]);

  return (
    <div className="rfq-doc font-serif text-[15px] leading-relaxed text-gray-800">
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 font-sans text-[13px] text-blue-900">
        This is a preview of the RFQ. To change it — rename a field, make one
        required, change a type, add or remove a field or question — just ask in
        the chat.
      </div>

      {/* Letterhead */}
      <div className="border-b-2 border-gray-800 pb-3 mb-5">
        <h2 className="font-sans text-xl font-bold tracking-tight text-gray-900">
          Request for Quotation
        </h2>
        <div className="font-sans text-sm text-gray-500 mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5">
          <span><span className="text-gray-400">Buyer:</span> {h.buyer || '—'}</span>
          <span><span className="text-gray-400">RFQ ID:</span> {h.rfqId}</span>
          <span><span className="text-gray-400">Quote deadline:</span> {h.quoteDeadline || '—'}</span>
          <span><span className="text-gray-400">Expected delivery:</span> {h.expectedDelivery || '—'}</span>
          <span><span className="text-gray-400">Currency:</span> {h.currency || '—'}</span>
          <span><span className="text-gray-400">Validity:</span> {h.validity || '—'}</span>
        </div>
      </div>

      {/* 1. Line items */}
      <SectionHeading>1. Line items</SectionHeading>
      {doc.lineItems.length === 0 ? (
        <p className="text-gray-400 mb-4">No line items.</p>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5 mb-4">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-y border-gray-300 text-left align-bottom font-sans text-gray-500">
                <th className="py-1.5 pr-3 font-medium w-6">#</th>
                <th className="py-1.5 pr-3 font-medium">Item</th>
                <th className="py-1.5 pr-3 font-medium">Specification</th>
                <th className="py-1.5 pr-3 font-medium text-right">Qty</th>
                <th className="py-1.5 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {doc.lineItems.map((li) => (
                <tr
                  key={li.id}
                  data-field={li.id}
                  className={`border-b border-gray-100 align-top ${hl(changed.has(li.id))}`}
                >
                  <td className="py-2 pr-3 text-gray-400">{li.line}</td>
                  <td className="py-2 pr-3">{li.item || <Gap />}</td>
                  <td className="py-2 pr-3 text-gray-600">{li.specification || '—'}</td>
                  <td className="py-2 pr-3 text-right">{li.quantity.toLocaleString()}</td>
                  <td className="py-2">{li.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. Commercial information requested */}
      <SectionHeading>2. Commercial information requested</SectionHeading>
      <p className="text-[13px] text-gray-500 mb-1 font-sans">
        For every line item, the supplier provides:
      </p>
      <ul className="list-disc pl-5 mb-3 text-[14px] text-gray-700 space-y-0.5">
        {PER_LINE_RESPONSE_ITEMS.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      {doc.commercialFields.length > 0 && (
        <>
          <p className="text-[13px] text-gray-500 mb-1 font-sans">
            Once for the whole quote:
          </p>
          <ul className="space-y-1.5 list-disc pl-5 mb-4">
            {doc.commercialFields.map((cf) => (
              <li
                key={cf.id}
                data-field={cf.id}
                className={`rounded ${hl(changed.has(cf.id))}`}
              >
                <span className="font-medium">{cf.label || <Gap />}</span>
                <FieldMeta
                  type={cf.type}
                  required={cf.required}
                  options={cf.options}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 3. Quality questionnaire */}
      <SectionHeading>3. Quality questionnaire</SectionHeading>
      {doc.questionnaire.length === 0 ? (
        <p className="text-gray-400 mb-3">No questions.</p>
      ) : (
        <dl className="space-y-2.5 mb-3">
          {doc.questionnaire.map((q) => (
            <div
              key={q.id}
              data-field={q.id}
              className={`rounded ${hl(changed.has(q.id))}`}
            >
              <dt className="text-gray-800">
                {q.question || <Gap />}
                <FieldMeta
                  type={q.responseType === 'yesno' ? 'Yes / No' : q.responseType}
                  required={q.required}
                />
              </dt>
            </div>
          ))}
        </dl>
      )}
      <p className="text-[13px] text-gray-500 font-sans mb-4">
        <span className="text-gray-400">Supporting documents: </span>
        {doc.supportingDocsNote || '—'}
      </p>

      {/* 4. Terms & conditions */}
      <SectionHeading>4. Terms &amp; conditions</SectionHeading>
      {doc.termsAndConditions.length === 0 ? (
        <p className="text-gray-400">No terms.</p>
      ) : (
        <ul className="list-disc pl-5 text-[14px] text-gray-700 space-y-0.5">
          {doc.termsAndConditions.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-sans font-semibold text-gray-900 mt-6 mb-2">{children}</h3>
  );
}

/** " — text, required" style meta shown after a field label. */
function FieldMeta({
  type,
  required,
  options,
}: {
  type: string;
  required: boolean;
  options?: string[];
}) {
  return (
    <span className="font-sans text-[12px] text-gray-500">
      {' — '}
      {type}
      {required && <span className="text-red-500 font-medium"> · required</span>}
      {options && options.length > 0 && (
        <span className="text-gray-400">
          {' '}
          ({options.join(' / ')})
        </span>
      )}
    </span>
  );
}

function Gap() {
  return (
    <span className="text-red-400 border-b border-red-300 border-dashed px-4">
      &nbsp;
    </span>
  );
}

/** Brief highlight for a field an AI edit just changed. */
function hl(on: boolean): string {
  return on ? 'bg-amber-100 ring-1 ring-amber-300 transition-colors' : '';
}
