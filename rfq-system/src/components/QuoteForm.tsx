'use client';

import { useMemo } from 'react';
import { FormSchema, FormField, sortedFields } from '@/lib/form-schema';
import { Input, Textarea, Select } from '@/components/ui';

export interface LineItemInput {
  id: string;
  itemDescription: string;
  quantity: number;
  unit: string;
}

export interface QuoteFormValue {
  formData: Record<string, unknown>;
  lineItemPrices: Record<string, number>; // lineItemId -> unit price
  notes: string;
}

/**
 * The supplier-facing quote form: line-item pricing table (from RFQ line items)
 * plus the buyer-configured questionnaire / commercial fields. `aiNotes` holds
 * the assistant's fuller answer for a field when it had to be shortened to fit
 * the control (e.g. a paragraph mapped to a Yes/No dropdown).
 */
export function QuoteForm({
  schema,
  lineItems,
  value,
  onChange,
  disabled,
  aiNotes = {},
}: {
  schema: FormSchema;
  lineItems: LineItemInput[];
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
  function setPrice(id: string, v: number) {
    onChange({ ...value, lineItemPrices: { ...value.lineItemPrices, [id]: v } });
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
      {/* Line item pricing */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-2">Line item pricing</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 w-20">Qty</th>
                <th className="px-3 py-2 w-20">Unit</th>
                <th className="px-3 py-2 w-32">Unit price</th>
                <th className="px-3 py-2 w-32">Line total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => {
                const price = value.lineItemPrices[li.id] ?? 0;
                return (
                  <tr key={li.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-800">{li.itemDescription}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {li.quantity.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{li.unit}</td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={price || ''}
                        disabled={disabled}
                        onChange={(e) => setPrice(li.id, Number(e.target.value) || 0)}
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {(price * li.quantity).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {lineItems.some((li) => !value.lineItemPrices[li.id]) && (
          <p className="text-xs text-amber-600 mt-1">
            {lineItems.filter((li) => !value.lineItemPrices[li.id]).length} item(s)
            still need a unit price.
          </p>
        )}
      </div>

      {/* Field sections */}
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
