'use client';

import { useState } from 'react';
import { Button, Input, Select } from '@/components/ui';
import { GROUP_LABEL, type OutlineGroup, type RFQOutline } from '@/lib/rfq-outline';
import {
  type RFQDocument,
  type RFQLineItemDoc,
  type CommercialField,
  type QuestionnaireItem,
  newLineItem,
  newCommercialField,
  newQuestion,
  renumber,
} from '@/lib/rfq-document';

/**
 * Renders a proposed RFQ outline inside the chat: two groups of sub-headings,
 * each ticked by default, each expandable. When expanded, the section's
 * drafted content is directly editable (line items, commercial fields,
 * questions, terms, header) — no AI call. "Confirm & apply" sends the ticked
 * section ids plus the edited document.
 */
export function OutlineReview({
  outline,
  applied,
  busy,
  onApply,
}: {
  outline: RFQOutline;
  applied: boolean;
  busy: boolean;
  onApply: (tickedIds: string[], editedDocument: RFQDocument) => void;
}) {
  const [ticks, setTicks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(outline.sections.map((s) => [s.id, s.ticked]))
  );
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [doc, setDoc] = useState<RFQDocument>(outline.document);

  const groups: OutlineGroup[] = ['supplier', 'buyer'];
  const tickedIds = outline.sections.filter((s) => ticks[s.id]).map((s) => s.id);

  // -- doc mutators (local only; applied on confirm) --
  const setLineItems = (items: RFQLineItemDoc[]) =>
    setDoc((d) => ({ ...d, lineItems: renumber(items) }));
  const setCF = (fields: CommercialField[]) =>
    setDoc((d) => ({ ...d, commercialFields: fields }));
  const setQ = (items: QuestionnaireItem[]) =>
    setDoc((d) => ({ ...d, questionnaire: items }));
  const setHeader = <K extends keyof RFQDocument['header']>(
    k: K,
    v: RFQDocument['header'][K]
  ) => setDoc((d) => ({ ...d, header: { ...d.header, [k]: v } }));
  const setTermAt = (i: number, v: string) =>
    setDoc((d) => ({
      ...d,
      termsAndConditions: d.termsAndConditions.map((t, j) => (j === i ? v : t)),
    }));
  const setSupportingDocsNote = (v: string) =>
    setDoc((d) => ({ ...d, supportingDocsNote: v }));

  return (
    <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-3 text-sm space-y-3">
      <p className="text-gray-700">
        Here&apos;s what will go into the RFQ. Untick anything you don&apos;t want, click
        a heading to open and edit its contents, then confirm.
      </p>

      {groups.map((g) => {
        const secs = outline.sections.filter((s) => s.group === g);
        if (secs.length === 0) return null;
        return (
          <div key={g}>
            <p className="font-semibold text-gray-900 mb-1">{GROUP_LABEL[g]}</p>
            <div className="space-y-1">
              {secs.map((s) => (
                <div key={s.id} className="rounded border border-gray-200 bg-white">
                  <div className="flex items-start gap-2 px-2 py-1.5">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!ticks[s.id]}
                      disabled={applied}
                      onChange={(e) =>
                        setTicks((t) => ({ ...t, [s.id]: e.target.checked }))
                      }
                    />
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}
                    >
                      <span
                        className={`font-medium ${
                          ticks[s.id] ? 'text-gray-900' : 'text-gray-400 line-through'
                        }`}
                      >
                        {s.heading}
                      </span>
                      <span className="text-blue-600 ml-1">{open[s.id] ? '▾' : '▸'}</span>
                    </button>
                  </div>
                  {open[s.id] && (
                    <div className="border-t border-gray-100 px-3 py-2 bg-gray-50">
                      <SectionEditor
                        kind={s.kind}
                        termIndex={s.termIndex}
                        doc={doc}
                        disabled={applied}
                        setLineItems={setLineItems}
                        setCF={setCF}
                        setQ={setQ}
                        setHeader={setHeader}
                        setTermAt={setTermAt}
                        setSupportingDocsNote={setSupportingDocsNote}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {applied ? (
        <p className="text-xs text-green-700 font-medium">✓ Applied to the RFQ.</p>
      ) : (
        <Button size="sm" disabled={busy} onClick={() => onApply(tickedIds, doc)}>
          {busy
            ? 'Applying…'
            : `Confirm & apply to RFQ (${tickedIds.length} section${tickedIds.length === 1 ? '' : 's'})`}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionEditor({
  kind,
  termIndex,
  doc,
  disabled,
  setLineItems,
  setCF,
  setQ,
  setHeader,
  setTermAt,
  setSupportingDocsNote,
}: {
  kind: string;
  termIndex?: number;
  doc: RFQDocument;
  disabled: boolean;
  setLineItems: (items: RFQLineItemDoc[]) => void;
  setCF: (fields: CommercialField[]) => void;
  setQ: (items: QuestionnaireItem[]) => void;
  setHeader: <K extends keyof RFQDocument['header']>(
    k: K,
    v: RFQDocument['header'][K]
  ) => void;
  setTermAt: (i: number, v: string) => void;
  setSupportingDocsNote: (v: string) => void;
}) {
  const fs = disabled ? { pointerEvents: 'none' as const, opacity: 0.6 } : undefined;

  if (kind === 'lineItems') {
    return (
      <div className="space-y-2" style={fs}>
        {doc.lineItems.map((li) => (
          <div key={li.id} className="grid grid-cols-12 gap-1.5 items-center">
            <Input
              className="col-span-4"
              placeholder="Item"
              value={li.item}
              onChange={(e) =>
                setLineItems(
                  doc.lineItems.map((x) => (x.id === li.id ? { ...x, item: e.target.value } : x))
                )
              }
            />
            <Input
              className="col-span-4"
              placeholder="Specification"
              value={li.specification}
              onChange={(e) =>
                setLineItems(
                  doc.lineItems.map((x) =>
                    x.id === li.id ? { ...x, specification: e.target.value } : x
                  )
                )
              }
            />
            <Input
              className="col-span-2"
              type="number"
              placeholder="Qty"
              value={li.quantity || ''}
              onChange={(e) =>
                setLineItems(
                  doc.lineItems.map((x) =>
                    x.id === li.id ? { ...x, quantity: Number(e.target.value) || 0 } : x
                  )
                )
              }
            />
            <Input
              className="col-span-1"
              placeholder="Unit"
              value={li.unit}
              onChange={(e) =>
                setLineItems(
                  doc.lineItems.map((x) => (x.id === li.id ? { ...x, unit: e.target.value } : x))
                )
              }
            />
            <button
              className="col-span-1 text-red-500 hover:text-red-700 text-sm"
              onClick={() => setLineItems(doc.lineItems.filter((x) => x.id !== li.id))}
              aria-label="Delete line item"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="text-xs text-blue-600 hover:underline"
          onClick={() => setLineItems([...doc.lineItems, newLineItem(doc.lineItems.length + 1)])}
        >
          + Add line item
        </button>
      </div>
    );
  }

  if (kind === 'commercialFields') {
    return (
      <div className="space-y-2" style={fs}>
        {doc.commercialFields.map((cf) => (
          <div key={cf.id} className="flex items-center gap-1.5">
            <Input
              className="flex-1"
              value={cf.label}
              placeholder="Field name"
              onChange={(e) =>
                setCF(
                  doc.commercialFields.map((x) =>
                    x.id === cf.id ? { ...x, label: e.target.value } : x
                  )
                )
              }
            />
            <Select
              className="w-24"
              value={cf.type}
              onChange={(e) =>
                setCF(
                  doc.commercialFields.map((x) =>
                    x.id === cf.id
                      ? { ...x, type: e.target.value as CommercialField['type'] }
                      : x
                  )
                )
              }
            >
              <option value="text">text</option>
              <option value="number">number</option>
              <option value="select">choice</option>
            </Select>
            <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
              <input
                type="checkbox"
                checked={cf.required}
                onChange={(e) =>
                  setCF(
                    doc.commercialFields.map((x) =>
                      x.id === cf.id ? { ...x, required: e.target.checked } : x
                    )
                  )
                }
              />
              req
            </label>
            <button
              className="text-red-500 hover:text-red-700 text-sm px-1"
              onClick={() => setCF(doc.commercialFields.filter((x) => x.id !== cf.id))}
              aria-label="Delete field"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="text-xs text-blue-600 hover:underline"
          onClick={() => setCF([...doc.commercialFields, newCommercialField()])}
        >
          + Add field
        </button>
      </div>
    );
  }

  if (kind === 'questionnaire') {
    return (
      <div className="space-y-2" style={fs}>
        {doc.questionnaire.map((q) => (
          <div key={q.id} className="flex items-center gap-1.5">
            <Input
              className="flex-1"
              value={q.question}
              placeholder="Question"
              onChange={(e) =>
                setQ(
                  doc.questionnaire.map((x) =>
                    x.id === q.id ? { ...x, question: e.target.value } : x
                  )
                )
              }
            />
            <Select
              className="w-28"
              value={q.responseType}
              onChange={(e) =>
                setQ(
                  doc.questionnaire.map((x) =>
                    x.id === q.id
                      ? { ...x, responseType: e.target.value as QuestionnaireItem['responseType'] }
                      : x
                  )
                )
              }
            >
              <option value="yesno">Yes / No</option>
              <option value="text">Free text</option>
              <option value="file">File</option>
            </Select>
            <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) =>
                  setQ(
                    doc.questionnaire.map((x) =>
                      x.id === q.id ? { ...x, required: e.target.checked } : x
                    )
                  )
                }
              />
              req
            </label>
            <button
              className="text-red-500 hover:text-red-700 text-sm px-1"
              onClick={() => setQ(doc.questionnaire.filter((x) => x.id !== q.id))}
              aria-label="Delete question"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="text-xs text-blue-600 hover:underline"
          onClick={() => setQ([...doc.questionnaire, newQuestion()])}
        >
          + Add question
        </button>
      </div>
    );
  }

  if (kind === 'supportingDocs') {
    return (
      <div style={fs}>
        <Input
          value={doc.supportingDocsNote}
          placeholder="e.g. Upload certificates / relevant documents."
          onChange={(e) => setSupportingDocsNote(e.target.value)}
        />
      </div>
    );
  }

  if (kind === 'header') {
    const fields: Array<[keyof RFQDocument['header'], string]> = [
      ['buyer', 'Buyer'],
      ['quoteDeadline', 'Quote deadline'],
      ['expectedDelivery', 'Expected delivery'],
      ['currency', 'Currency'],
      ['validity', 'Validity'],
    ];
    return (
      <div className="grid grid-cols-2 gap-2" style={fs}>
        {fields.map(([k, label]) => (
          <div key={k}>
            <label className="block text-[11px] text-gray-500 mb-0.5">{label}</label>
            <Input value={doc.header[k]} onChange={(e) => setHeader(k, e.target.value)} />
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'term' && termIndex != null) {
    return (
      <div style={fs}>
        <textarea
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          rows={2}
          value={doc.termsAndConditions[termIndex] ?? ''}
          onChange={(e) => setTermAt(termIndex, e.target.value)}
        />
      </div>
    );
  }

  return <p className="text-xs text-gray-400">(nothing to edit)</p>;
}
