'use client';

import { useMemo } from 'react';
import { FormSchema, FormField, sortedFields } from '@/lib/form-schema';
import { Input, Textarea, Select } from '@/components/ui';
import {
  LineItemResponse,
  RFQLineForResponse,
  QUOTE_UOM_OPTIONS,
  emptyLineResponse,
  normaliseLinePrice,
} from '@/lib/line-response';

export interface LineItemInput {
  id: string;
  itemDescription: string;
  quantity: number;
  unit: string;
}

export interface QuoteFormValue {
  formData: Record<string, unknown>;
  // rfq line-item id -> the FIXED per-line response
  lineResponses: Record<string, LineItemResponse>;
  notes: string;
}

/**
 * The supplier-facing quote form: a fixed per-line response grid (can-supply,
 * price, currency, UoM, available qty, lead time, MOQ) plus the buyer-configured
 * quote-level commercial fields and quality questionnaire. `aiNotes` holds the
 * assistant's fuller answer for a field when it had to be shortened to fit the
 * control.
 */
export function QuoteForm({
  schema,
  lineItems,
  rfqCurrency,
  value,
  onChange,
  disabled,
  aiNotes = {},
}: {
  schema: FormSchema;
  lineItems: LineItemInput[];
  rfqCurrency: string;
  value: QuoteFormValue;
  onChange: (v: QuoteFormValue) => void;
  disabled?: boolean;
  aiNotes?: Record<string, string>;
}) {
  const fields = useMemo(() => sortedFields(schema), [schema]);
  const sections = useMemo(
    () => [...schema.sections].sort((a, b) => a.orderIndex - b.orderIndex),
    [schema]
  );

  function setField(id: string, v: unknown) {
    onChange({ ...value, formData: { ...value.formData, [id]: v } });
  }

  function respFor(li: LineItemInput): LineItemResponse {
    return (
      value.lineResponses[li.id] ??
      emptyLineResponse(li as RFQLineForResponse, rfqCurrency)
    );
  }
  function patchResp(li: LineItemInput, patch: Partial<LineItemResponse>) {
    const current = respFor(li);
    onChange({
      ...value,
      lineResponses: {
        ...value.lineResponses,
        [li.id]: { ...current, ...patch, itemId: li.id },
      },
    });
  }

  const bySection = (sectionId: string | undefined) =>
    fields.filter((f) => (f.section ?? '') === (sectionId ?? ''));
  const looseFields = bySection(undefined).length
    ? bySection(undefined)
    : sections.length === 0
    ? fields
    : [];

  return (
    <div className="space-y-6">
      {/* Fixed per-line response grid */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-1">Line items</h3>
        <p className="text-xs text-gray-500 mb-2">
          For every line, say whether you can supply it and at what price. Leave
          the price blank on lines you are not quoting.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="px-2 py-2 min-w-[180px]">Item</th>
                <th className="px-2 py-2 w-24">Asked</th>
                <th className="px-2 py-2 w-32">Can supply?</th>
                <th className="px-2 py-2 w-24">Unit price</th>
                <th className="px-2 py-2 w-24">Currency</th>
                <th className="px-2 py-2 w-32">Priced per</th>
                <th className="px-2 py-2 w-24">Qty you can supply</th>
                <th className="px-2 py-2 w-24">Lead days</th>
                <th className="px-2 py-2 w-24">MOQ</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => {
                const r = respFor(li);
                const norm = normaliseLinePrice(r, rfqCurrency);
                return (
                  <tr key={li.id} className="border-t border-gray-100 align-top">
                    <td className="px-2 py-2 text-gray-800">
                      {li.itemDescription}
                    </td>
                    <td className="px-2 py-2 text-gray-600 whitespace-nowrap">
                      {li.quantity.toLocaleString()} {li.unit}
                    </td>
                    <td className="px-2 py-2">
                      <Select
                        value={r.canSupply}
                        disabled={disabled}
                        onChange={(e) =>
                          patchResp(li, {
                            canSupply: e.target.value as LineItemResponse['canSupply'],
                          })
                        }
                      >
                        <option value="full">Yes — full qty</option>
                        <option value="partial">Partial</option>
                        <option value="no">No</option>
                      </Select>
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.unitPrice ?? ''}
                        disabled={disabled || r.canSupply === 'no'}
                        onChange={(e) =>
                          patchResp(li, {
                            unitPrice:
                              e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                      {norm.currencyDiffers && r.unitPrice != null && (
                        <p className="text-[11px] text-amber-600 mt-0.5">
                          quoted in {r.currency}
                        </p>
                      )}
                      {norm.uomAmbiguous && (
                        <p className="text-[11px] text-amber-600 mt-0.5">
                          pack size unknown
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        value={r.currency}
                        disabled={disabled || r.canSupply === 'no'}
                        onChange={(e) =>
                          patchResp(li, { currency: e.target.value.toUpperCase() })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Select
                        value={r.quotedUom}
                        disabled={disabled || r.canSupply === 'no'}
                        onChange={(e) =>
                          patchResp(li, { quotedUom: e.target.value })
                        }
                      >
                        {QUOTE_UOM_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min="0"
                        placeholder={li.quantity.toString()}
                        value={r.availableQty ?? ''}
                        disabled={disabled || r.canSupply === 'no'}
                        onChange={(e) =>
                          patchResp(li, {
                            availableQty:
                              e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min="0"
                        value={r.leadTimeDays ?? ''}
                        disabled={disabled || r.canSupply === 'no'}
                        onChange={(e) =>
                          patchResp(li, {
                            leadTimeDays:
                              e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min="0"
                        value={r.moq ?? ''}
                        disabled={disabled || r.canSupply === 'no'}
                        onChange={(e) =>
                          patchResp(li, {
                            moq: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <LineCoverageHint lineItems={lineItems} value={value} rfqCurrency={rfqCurrency} />
      </div>

      {/* Field sections (quote-level commercial + questionnaire) */}
      {sections.map((sec) => {
        const secFields = bySection(sec.id);
        if (secFields.length === 0) return null;
        return (
          <div key={sec.id} className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900">{sec.title}</h3>
              {sec.description && (
                <p className="text-xs text-gray-500">{sec.description}</p>
              )}
            </div>
            {secFields.map((f) => (
              <FieldRow
                key={f.id}
                field={f}
                value={value.formData[f.id]}
                note={aiNotes[f.id]}
                disabled={disabled}
                onChange={(v) => setField(f.id, v)}
              />
            ))}
          </div>
        );
      })}

      {looseFields.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Additional information</h3>
          {looseFields.map((f) => (
            <FieldRow
              key={f.id}
              field={f}
              value={value.formData[f.id]}
              note={aiNotes[f.id]}
              disabled={disabled}
              onChange={(v) => setField(f.id, v)}
            />
          ))}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes (optional)
        </label>
        <Textarea
          rows={2}
          value={value.notes}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </div>
    </div>
  );
}

function LineCoverageHint({
  lineItems,
  value,
  rfqCurrency,
}: {
  lineItems: LineItemInput[];
  value: QuoteFormValue;
  rfqCurrency: string;
}) {
  const stats = useMemo(() => {
    let quoted = 0;
    let noBid = 0;
    let partial = 0;
    for (const li of lineItems) {
      const r =
        value.lineResponses[li.id] ??
        emptyLineResponse(li as RFQLineForResponse, rfqCurrency);
      if (r.canSupply === 'no') noBid++;
      else if (r.canSupply === 'partial') partial++;
      if (r.canSupply !== 'no' && r.unitPrice != null && r.unitPrice > 0) quoted++;
    }
    return { quoted, noBid, partial, total: lineItems.length };
  }, [lineItems, value, rfqCurrency]);

  return (
    <p className="text-xs text-gray-500 mt-1">
      Priced {stats.quoted} of {stats.total} lines
      {stats.partial > 0 && ` · ${stats.partial} partial`}
      {stats.noBid > 0 && ` · ${stats.noBid} no-bid`}.
    </p>
  );
}

function FieldRow({
  field,
  value,
  note,
  disabled,
  onChange,
}: {
  field: FormField;
  value: unknown;
  note?: string;
  disabled?: boolean;
  onChange: (v: unknown) => void;
}) {
  const strVal = value == null ? '' : String(value);
  // A note that isn't already reflected verbatim in the field value.
  const showNote = note && note.trim().toLowerCase() !== strVal.trim().toLowerCase();

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      {field.type === 'textarea' ? (
        <Textarea
          rows={3}
          placeholder={field.placeholder}
          value={strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === 'select' ? (
        <Select
          value={strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : field.type === 'number' ? (
        <Input
          type="number"
          placeholder={field.placeholder}
          value={strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      ) : (
        <Input
          type={field.type === 'file' ? 'text' : field.type}
          placeholder={field.placeholder}
          value={strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {showNote && (
        <p className="text-xs text-gray-500 mt-1">
          <span className="font-medium">From your document:</span> {note}
        </p>
      )}
    </div>
  );
}
