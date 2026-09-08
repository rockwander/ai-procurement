'use client';

import type { ReactNode } from 'react';
import {
  RFQDocument,
  RFQLineItemDoc,
  CommercialField,
  QuestionnaireItem,
  newLineItem,
  newCommercialField,
  newQuestion,
  renumber,
} from '@/lib/rfq-document';
import { Button, Input, Select } from '@/components/ui';

/**
 * Single-column *form builder* for the canonical RFQ document. This defines the
 * response form suppliers receive by email (alongside a copy of the PDF) — it is
 * NOT a form for entering quote data. Each questionnaire / commercial field is
 * shown as a design row: an editable field name, the response type, a mandatory
 * toggle, and a greyed preview of the control the supplier will actually see.
 *
 * Edits apply immediately (the parent debounces a PATCH to persist + re-render
 * the PDF).
 */
export function RFQDocumentBuilder({
  doc,
  onChange,
  disabled,
}: {
  doc: RFQDocument;
  onChange: (next: RFQDocument) => void;
  disabled?: boolean;
}) {
  function setHeader<K extends keyof RFQDocument['header']>(
    key: K,
    value: RFQDocument['header'][K]
  ) {
    onChange({ ...doc, header: { ...doc.header, [key]: value } });
  }

  // ---- line items ----
  function setLineItems(items: RFQLineItemDoc[]) {
    onChange({ ...doc, lineItems: renumber(items) });
  }
  function patchLine(id: string, patch: Partial<RFQLineItemDoc>) {
    setLineItems(doc.lineItems.map((li) => (li.id === id ? { ...li, ...patch } : li)));
  }
  function moveLine(idx: number, dir: -1 | 1) {
    const t = idx + dir;
    if (t < 0 || t >= doc.lineItems.length) return;
    const copy = [...doc.lineItems];
    [copy[idx], copy[t]] = [copy[t], copy[idx]];
    setLineItems(copy);
  }

  // ---- commercial fields ----
  function setCF(fields: CommercialField[]) {
    onChange({ ...doc, commercialFields: fields });
  }
  function patchCF(id: string, patch: Partial<CommercialField>) {
    setCF(doc.commercialFields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function moveCF(idx: number, dir: -1 | 1) {
    const t = idx + dir;
    if (t < 0 || t >= doc.commercialFields.length) return;
    const copy = [...doc.commercialFields];
    [copy[idx], copy[t]] = [copy[t], copy[idx]];
    setCF(copy);
  }

  // ---- questionnaire ----
  function setQ(items: QuestionnaireItem[]) {
    onChange({ ...doc, questionnaire: items });
  }
  function patchQ(id: string, patch: Partial<QuestionnaireItem>) {
    setQ(doc.questionnaire.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }
  function moveQ(idx: number, dir: -1 | 1) {
    const t = idx + dir;
    if (t < 0 || t >= doc.questionnaire.length) return;
    const copy = [...doc.questionnaire];
    [copy[idx], copy[t]] = [copy[t], copy[idx]];
    setQ(copy);
  }

  // ---- terms ----
  function setTerms(text: string) {
    onChange({
      ...doc,
      termsAndConditions: text.split('\n').map((s) => s.trim()).filter(Boolean),
    });
  }

  const fs = disabled ? { pointerEvents: 'none' as const, opacity: 0.6 } : undefined;

  return (
    <div className="space-y-8" style={fs}>
      {/* What this view is */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-medium">You’re designing the supplier response form.</p>
        <p className="mt-1 text-blue-800">
          Suppliers receive this form by email with a copy of the RFQ PDF for
          reference. Set which fields they must answer and how — you are not
          entering quote data here.
        </p>
      </div>

      {/* Header */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Header</h3>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ['buyer', 'Buyer'],
              ['quoteDeadline', 'Quote deadline'],
              ['expectedDelivery', 'Expected delivery'],
              ['currency', 'Currency'],
              ['validity', 'Validity'],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <Input
                value={doc.header[k]}
                onChange={(e) => setHeader(k, e.target.value)}
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-500 mb-1">RFQ ID</label>
            <Input value={doc.header.rfqId} disabled />
          </div>
        </div>
      </section>

      {/* Line items */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">
            1. Line items ({doc.lineItems.length})
          </h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLineItems([...doc.lineItems, newLineItem(doc.lineItems.length + 1)])}
          >
            + Add line
          </Button>
        </div>
        <p className="text-xs text-gray-500 mb-2">
          Items to be quoted. Suppliers enter a unit price against each of these
          in a pricing table.
        </p>
        <div className="space-y-2">
          {doc.lineItems.map((li, i) => (
            <div
              key={li.id}
              className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2"
            >
              <div className="flex items-start gap-2">
                <ReorderButtons
                  onUp={() => moveLine(i, -1)}
                  onDown={() => moveLine(i, 1)}
                  isFirst={i === 0}
                  isLast={i === doc.lineItems.length - 1}
                />
                <span className="text-xs text-gray-400 pt-2 w-5">{li.line}</span>
                <div className="flex-1 grid grid-cols-12 gap-2">
                  <Input
                    className="col-span-5"
                    placeholder="Item"
                    value={li.item}
                    onChange={(e) => patchLine(li.id, { item: e.target.value })}
                  />
                  <Input
                    className="col-span-4"
                    placeholder="Specification"
                    value={li.specification}
                    onChange={(e) => patchLine(li.id, { specification: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    placeholder="Qty"
                    value={li.quantity || ''}
                    onChange={(e) =>
                      patchLine(li.id, { quantity: Number(e.target.value) || 0 })
                    }
                  />
                  <Input
                    className="col-span-1"
                    placeholder="Unit"
                    value={li.unit}
                    onChange={(e) => patchLine(li.id, { unit: e.target.value })}
                  />
                </div>
                <button
                  onClick={() => setLineItems(doc.lineItems.filter((x) => x.id !== li.id))}
                  className="text-red-500 hover:text-red-700 text-sm pt-1"
                  aria-label="Delete line item"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {doc.lineItems.length === 0 && (
            <p className="text-sm text-gray-400">No line items yet.</p>
          )}
        </div>
      </section>

      {/* Commercial fields */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">
            2. Commercial information requested
          </h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCF([...doc.commercialFields, newCommercialField()])}
          >
            + Add quote-level field
          </Button>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-3 text-xs text-gray-600">
          <p className="font-medium text-gray-700 mb-1">
            Per line item (fixed — always asked, not editable):
          </p>
          <p>
            Can-supply (full / partial / no), unit price, currency, unit of
            measure, quantity available, lead time, MOQ. Captured in the
            supplier's line-item table so the comparison can normalise and rank
            them.
          </p>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Below: extra commercial fields the supplier answers{' '}
          <strong>once for the whole quote</strong> (tooling charges, rebate
          tiers, price validity…). The name is the label they see; the type sets
          the control.
        </p>
        <div className="space-y-3">
          {doc.commercialFields.map((cf, i) => (
            <FieldDesignRow
              key={cf.id}
              name={cf.label}
              onName={(v) => patchCF(cf.id, { label: v })}
              namePlaceholder="Field name (e.g. Lead time)"
              required={cf.required}
              onRequired={(v) => patchCF(cf.id, { required: v })}
              onUp={() => moveCF(i, -1)}
              onDown={() => moveCF(i, 1)}
              isFirst={i === 0}
              isLast={i === doc.commercialFields.length - 1}
              onDelete={() => setCF(doc.commercialFields.filter((x) => x.id !== cf.id))}
              typeControl={
                <Select
                  className="w-28"
                  value={cf.type}
                  onChange={(e) =>
                    patchCF(cf.id, { type: e.target.value as CommercialField['type'] })
                  }
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="select">Choice</option>
                </Select>
              }
              optionsEditor={
                cf.type === 'select' ? (
                  <Input
                    value={(cf.options ?? []).join(', ')}
                    placeholder="Choices, comma-separated"
                    onChange={(e) =>
                      patchCF(cf.id, {
                        options: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                ) : null
              }
              preview={previewControl(
                cf.type === 'number' ? 'number' : cf.type === 'select' ? 'select' : 'text',
                cf.options
              )}
            />
          ))}
          {doc.commercialFields.length === 0 && (
            <p className="text-sm text-gray-400">No commercial fields.</p>
          )}
        </div>
      </section>

      {/* Questionnaire */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">
            3. Quality questionnaire ({doc.questionnaire.length})
          </h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setQ([...doc.questionnaire, newQuestion()])}
          >
            + Add question
          </Button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Capability / quality questions the supplier answers once for the whole
          quote.
        </p>
        <div className="space-y-3">
          {doc.questionnaire.map((q, i) => (
            <FieldDesignRow
              key={q.id}
              name={q.question}
              onName={(v) => patchQ(q.id, { question: v })}
              namePlaceholder="Question (e.g. Do you hold ISO 9001?)"
              required={q.required}
              onRequired={(v) => patchQ(q.id, { required: v })}
              onUp={() => moveQ(i, -1)}
              onDown={() => moveQ(i, 1)}
              isFirst={i === 0}
              isLast={i === doc.questionnaire.length - 1}
              onDelete={() => setQ(doc.questionnaire.filter((x) => x.id !== q.id))}
              typeControl={
                <Select
                  className="w-28"
                  value={q.responseType}
                  onChange={(e) =>
                    patchQ(q.id, {
                      responseType: e.target.value as QuestionnaireItem['responseType'],
                    })
                  }
                >
                  <option value="yesno">Yes / No</option>
                  <option value="text">Free text</option>
                  <option value="file">File upload</option>
                </Select>
              }
              preview={previewControl(
                q.responseType === 'yesno'
                  ? 'select'
                  : q.responseType === 'file'
                  ? 'file'
                  : 'textarea',
                q.responseType === 'yesno' ? ['Yes', 'No'] : undefined
              )}
            />
          ))}
          {doc.questionnaire.length === 0 && (
            <p className="text-sm text-gray-400">No questions.</p>
          )}
        </div>
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1">
            Supporting documents note
          </label>
          <Input
            value={doc.supportingDocsNote}
            onChange={(e) => onChange({ ...doc, supportingDocsNote: e.target.value })}
          />
        </div>
      </section>

      {/* Terms */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">4. Terms &amp; conditions</h3>
        <textarea
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
          rows={Math.max(4, doc.termsAndConditions.length + 1)}
          value={doc.termsAndConditions.join('\n')}
          onChange={(e) => setTerms(e.target.value)}
        />
        <p className="text-xs text-gray-400 mt-1">One term per line.</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReorderButtons({
  onUp,
  onDown,
  isFirst,
  isLast,
}: {
  onUp: () => void;
  onDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex flex-col pt-1">
      <button
        onClick={onUp}
        disabled={isFirst}
        className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none"
        aria-label="Move up"
      >
        ▲
      </button>
      <button
        onClick={onDown}
        disabled={isLast}
        className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none"
        aria-label="Move down"
      >
        ▼
      </button>
    </div>
  );
}

/**
 * One field/question in the builder: name + type + mandatory toggle on a
 * toolbar row, then a greyed preview of what the supplier will see.
 */
function FieldDesignRow({
  name,
  onName,
  namePlaceholder,
  required,
  onRequired,
  typeControl,
  optionsEditor,
  preview,
  onUp,
  onDown,
  isFirst,
  isLast,
  onDelete,
}: {
  name: string;
  onName: (v: string) => void;
  namePlaceholder: string;
  required: boolean;
  onRequired: (v: boolean) => void;
  typeControl: ReactNode;
  optionsEditor?: ReactNode;
  preview: ReactNode;
  onUp: () => void;
  onDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  onDelete: () => void;
}) {
  const unnamed = name.trim().length === 0;
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex items-center gap-2">
        <ReorderButtons onUp={onUp} onDown={onDown} isFirst={isFirst} isLast={isLast} />
        <Input
          className={`flex-1 font-medium ${unnamed ? 'border-red-300' : ''}`}
          value={name}
          placeholder={namePlaceholder}
          onChange={(e) => onName(e.target.value)}
        />
        {typeControl}
        <label className="flex items-center gap-1 text-sm text-gray-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => onRequired(e.target.checked)}
          />
          Required
        </label>
        <button
          onClick={onDelete}
          className="text-red-500 hover:text-red-700 text-sm px-1"
          aria-label="Delete"
        >
          ✕
        </button>
      </div>

      {optionsEditor}

      <div className="pl-6">
        <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
          Supplier sees
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {name.trim() || namePlaceholder}
            {required && <span className="text-red-400"> *</span>}
          </span>
        </div>
        <div className="mt-1 max-w-xs opacity-70 pointer-events-none">{preview}</div>
      </div>
    </div>
  );
}

/** A disabled control mirroring what the supplier form renders for this type. */
function previewControl(
  type: 'text' | 'number' | 'select' | 'textarea' | 'file',
  options?: string[]
): ReactNode {
  switch (type) {
    case 'textarea':
      return (
        <textarea
          disabled
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
          placeholder="Supplier’s answer…"
        />
      );
    case 'select':
      return (
        <Select disabled value="">
          <option value="">Select…</option>
          {(options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    case 'file':
      return (
        <div className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg bg-white text-sm text-gray-400">
          Choose file…
        </div>
      );
    case 'number':
      return <Input disabled type="number" placeholder="0" />;
    default:
      return <Input disabled placeholder="Supplier’s answer…" />;
  }
}
