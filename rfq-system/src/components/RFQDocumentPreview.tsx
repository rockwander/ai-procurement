'use client';

import { useEffect, type ReactNode } from 'react';
import {
  RFQDocument,
  PER_LINE_RESPONSE_ITEMS,
} from '@/lib/rfq-document';

export interface PreviewScope {
  /** stable id — a field/question/line id, or `section:<slug>` / `term:<i>` */
  id: string;
  /** human label shown in the chat's "re: …" chip */
  label: string;
  /** the passage text the buyer is commenting on */
  text: string;
}

/**
 * Read-only rendering of the canonical RFQ document as a *document* — the buyer's
 * counterpart to the supplier's quotation preview (QuotePreview.tsx). It reads
 * like the RFQ a supplier will receive; there are no input controls.
 *
 * Any heading, field, question or term is **clickable**: clicking it rings the
 * passage and scopes the create-RFQ chat to it ("re: …"), so the buyer's next
 * message is feedback about that passage. The assistant applies a change if the
 * feedback implies one. Applied edits briefly highlight the affected rows
 * (`changedFieldIds`) via the same `data-field` hooks.
 */
export function RFQDocumentPreview({
  doc,
  changedFieldIds = [],
  activeScopeId,
  onScope,
}: {
  doc: RFQDocument;
  changedFieldIds?: string[];
  activeScopeId?: string | null;
  onScope?: (scope: PreviewScope) => void;
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

  const p = { activeScopeId, onScope };

  return (
    <div className="rfq-doc font-serif text-[15px] leading-relaxed text-gray-800">
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 font-sans text-[13px] text-blue-900">
        This is a preview of the RFQ. Click any heading, field, question or term
        to comment on it in the chat — or just type a change (rename a field,
        make one required, change a type, add or remove a field).
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
      <Passage
        {...p}
        id="section:line-items"
        label="Line items (section)"
        text="Section 1 — Line items: the items the supplier must quote."
        as="h3"
        className="font-sans font-semibold text-gray-900 mt-6 mb-2"
      >
        1. Line items
      </Passage>
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
                <PassageRow
                  {...p}
                  key={li.id}
                  id={li.id}
                  label={`Line ${li.line} — ${li.item || 'item'}`}
                  text={`${li.line}. ${li.item} — ${li.specification || 'no spec'} — ${li.quantity} ${li.unit}`}
                  highlighted={changed.has(li.id)}
                >
                  <td className="py-2 pr-3 text-gray-400">{li.line}</td>
                  <td className="py-2 pr-3">{li.item || <Gap />}</td>
                  <td className="py-2 pr-3 text-gray-600">{li.specification || '—'}</td>
                  <td className="py-2 pr-3 text-right">{li.quantity.toLocaleString()}</td>
                  <td className="py-2">{li.unit}</td>
                </PassageRow>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. Commercial information requested */}
      <Passage
        {...p}
        id="section:commercial"
        label="Commercial information (section)"
        text="Section 2 — Commercial information requested: the fixed per-line response grid plus the quote-level commercial fields."
        as="h3"
        className="font-sans font-semibold text-gray-900 mt-6 mb-2"
      >
        2. Commercial information requested
      </Passage>
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
              <Passage
                {...p}
                key={cf.id}
                id={cf.id}
                label={`Field: ${cf.label || 'unnamed'}`}
                text={`Commercial field "${cf.label}" (${cf.type}${cf.required ? ', required' : ''}${cf.options?.length ? `; options: ${cf.options.join(', ')}` : ''})`}
                as="li"
                highlighted={changed.has(cf.id)}
              >
                <span className="font-medium">{cf.label || <Gap />}</span>
                <FieldMeta
                  type={cf.type}
                  required={cf.required}
                  options={cf.options}
                />
              </Passage>
            ))}
          </ul>
        </>
      )}

      {/* 3. Quality questionnaire */}
      <Passage
        {...p}
        id="section:questionnaire"
        label="Quality questionnaire (section)"
        text="Section 3 — Quality questionnaire: capability / quality questions the supplier answers once."
        as="h3"
        className="font-sans font-semibold text-gray-900 mt-6 mb-2"
      >
        3. Quality questionnaire
      </Passage>
      {doc.questionnaire.length === 0 ? (
        <p className="text-gray-400 mb-3">No questions.</p>
      ) : (
        <dl className="space-y-2.5 mb-3">
          {doc.questionnaire.map((q) => (
            <Passage
              {...p}
              key={q.id}
              id={q.id}
              label={`Question: ${(q.question || 'unnamed').slice(0, 40)}`}
              text={`Questionnaire question "${q.question}" (${q.responseType}${q.required ? ', required' : ''})`}
              as="div"
              highlighted={changed.has(q.id)}
            >
              <dt className="text-gray-800">
                {q.question || <Gap />}
                <FieldMeta
                  type={q.responseType === 'yesno' ? 'Yes / No' : q.responseType}
                  required={q.required}
                />
              </dt>
            </Passage>
          ))}
        </dl>
      )}
      <Passage
        {...p}
        id="section:supporting-docs"
        label="Supporting documents note"
        text={`Supporting documents ask: ${doc.supportingDocsNote || '(none)'}`}
        as="p"
        className="text-[13px] text-gray-500 font-sans mb-4"
      >
        <span className="text-gray-400">Supporting documents: </span>
        {doc.supportingDocsNote || '—'}
      </Passage>

      {/* 4. Terms & conditions */}
      <Passage
        {...p}
        id="section:terms"
        label="Terms & conditions (section)"
        text="Section 4 — Terms & conditions: the buyer's terms the supplier must accept or raise exceptions against."
        as="h3"
        className="font-sans font-semibold text-gray-900 mt-6 mb-2"
      >
        4. Terms &amp; conditions
      </Passage>
      {doc.termsAndConditions.length === 0 ? (
        <p className="text-gray-400">No terms.</p>
      ) : (
        <ul className="list-disc pl-5 text-[14px] text-gray-700 space-y-0.5">
          {doc.termsAndConditions.map((t, i) => (
            <Passage
              {...p}
              key={i}
              id={`term:${i}`}
              label={`Term: ${t.slice(0, 40)}`}
              text={`Term / condition: ${t}`}
              as="li"
            >
              {t}
            </Passage>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type ScopeCtx = {
  activeScopeId?: string | null;
  onScope?: (scope: PreviewScope) => void;
};

/**
 * A clickable passage in the RFQ preview. Clicking rings it and scopes the chat
 * to it. Renders as the given tag; when it's a `<tr>` use `PassageRow` instead
 * so the cells stay valid table markup.
 */
function Passage({
  activeScopeId,
  onScope,
  id,
  label,
  text,
  as: Tag = 'span',
  className = '',
  highlighted = false,
  children,
}: ScopeCtx & {
  id: string;
  label: string;
  text: string;
  as?: 'span' | 'p' | 'li' | 'div' | 'h3';
  className?: string;
  highlighted?: boolean;
  children: ReactNode;
}) {
  const active = activeScopeId === id;
  const clickable = !!onScope;
  return (
    <Tag
      data-field={id}
      onClick={clickable ? () => onScope!({ id, label, text }) : undefined}
      title={clickable ? 'Click to comment on this in the chat' : undefined}
      className={`${className} rounded ${
        clickable ? 'cursor-pointer hover:bg-blue-50/70' : ''
      } ${active ? 'ring-2 ring-blue-300 bg-blue-50/70' : ''} ${
        highlighted ? 'bg-amber-100 ring-1 ring-amber-300 transition-colors' : ''
      }`}
    >
      {children}
    </Tag>
  );
}

/** Same as Passage but for a table row (children are <td> cells). */
function PassageRow({
  activeScopeId,
  onScope,
  id,
  label,
  text,
  highlighted = false,
  children,
}: ScopeCtx & {
  id: string;
  label: string;
  text: string;
  highlighted?: boolean;
  children: ReactNode;
}) {
  const active = activeScopeId === id;
  const clickable = !!onScope;
  return (
    <tr
      data-field={id}
      onClick={clickable ? () => onScope!({ id, label, text }) : undefined}
      title={clickable ? 'Click to comment on this in the chat' : undefined}
      className={`border-b border-gray-100 align-top ${
        clickable ? 'cursor-pointer hover:bg-blue-50/70' : ''
      } ${active ? 'ring-2 ring-blue-300 bg-blue-50/70' : ''} ${
        highlighted ? 'bg-amber-100' : ''
      }`}
    >
      {children}
    </tr>
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
