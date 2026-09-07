'use client';

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
 * Single-column form builder for the canonical RFQ document. Edits apply
 * immediately (the parent debounces a PATCH to persist + re-render the PDF).
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

  // ---- questionnaire ----
  function setQ(items: QuestionnaireItem[]) {
    onChange({ ...doc, questionnaire: items });
  }
  function patchQ(id: string, patch: Partial<QuestionnaireItem>) {
    setQ(doc.questionnaire.map((q) => (q.id === id ? { ...q, ...patch } : q)));
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
        <div className="space-y-2">
          {doc.lineItems.map((li, i) => (
            <div
              key={li.id}
              className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2"
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col pt-1">
                  <button
                    onClick={() => moveLine(i, -1)}
                    disabled={i === 0}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveLine(i, 1)}
                    disabled={i === doc.lineItems.length - 1}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs"
                  >
                    ▼
                  </button>
                </div>
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
            2. Commercial information requested (per line item)
          </h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCF([...doc.commercialFields, newCommercialField()])}
          >
            + Add field
          </Button>
        </div>
        <div className="space-y-2">
          {doc.commercialFields.map((cf) => (
            <div key={cf.id} className="flex items-center gap-2">
              <Input
                className="flex-1"
                value={cf.label}
                onChange={(e) => patchCF(cf.id, { label: e.target.value })}
              />
              <Select
                className="w-28"
                value={cf.type}
                onChange={(e) =>
                  patchCF(cf.id, { type: e.target.value as CommercialField['type'] })
                }
              >
                <option value="text">text</option>
                <option value="number">number</option>
                <option value="select">select</option>
              </Select>
              <label className="flex items-center gap-1 text-sm text-gray-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={cf.required}
                  onChange={(e) => patchCF(cf.id, { required: e.target.checked })}
                />
                Required
              </label>
              <button
                onClick={() => setCF(doc.commercialFields.filter((x) => x.id !== cf.id))}
                className="text-red-500 hover:text-red-700 text-sm px-1"
              >
                ✕
              </button>
            </div>
          ))}
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
        <div className="space-y-2">
          {doc.questionnaire.map((q) => (
            <div key={q.id} className="flex items-center gap-2">
              <Input
                className="flex-1"
                value={q.question}
                onChange={(e) => patchQ(q.id, { question: e.target.value })}
              />
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
                <option value="file">File</option>
              </Select>
              <label className="flex items-center gap-1 text-sm text-gray-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => patchQ(q.id, { required: e.target.checked })}
                />
                Required
              </label>
              <button
                onClick={() => setQ(doc.questionnaire.filter((x) => x.id !== q.id))}
                className="text-red-500 hover:text-red-700 text-sm px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2">
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
