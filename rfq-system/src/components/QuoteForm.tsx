'use client';

import { useMemo, useState } from 'react';
import { FormSchema, sortedFields } from '@/lib/form-schema';
import { Button, Input, Textarea, Select } from '@/components/ui';

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
 * plus the buyer-configured questionnaire fields.
 */
export function QuoteForm({
  schema,
  lineItems,
  value,
  onChange,
  disabled,
}: {
  schema: FormSchema;
  lineItems: LineItemInput[];
  value: QuoteFormValue;
  onChange: (v: QuoteFormValue) => void;
  disabled?: boolean;
}) {
  const fields = useMemo(() => sortedFields(schema), [schema]);

  function setField(id: string, v: unknown) {
    onChange({ ...value, formData: { ...value.formData, [id]: v } });
  }
  function setPrice(id: string, v: number) {
    onChange({ ...value, lineItemPrices: { ...value.lineItemPrices, [id]: v } });
  }

  return (
    <div className="space-y-6">
      {/* Line item pricing */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-2">Line item pricing</h3>
        <table className="w-full text-sm border border-gray-200 rounded">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 w-20">Qty</th>
              <th className="px-3 py-2 w-24">Unit</th>
              <th className="px-3 py-2 w-32">Unit price ($)</th>
              <th className="px-3 py-2 w-32">Line total</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li) => {
              const price = value.lineItemPrices[li.id] ?? 0;
              return (
                <tr key={li.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-800">{li.itemDescription}</td>
                  <td className="px-3 py-2 text-gray-600">{li.quantity}</td>
                  <td className="px-3 py-2 text-gray-600">{li.unit}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={price || ''}
                      disabled={disabled}
                      onChange={(e) => setPrice(li.id, Number(e.target.value))}
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    ${(price * li.quantity).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Questionnaire fields */}
      {fields.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Additional information</h3>
          {fields.map((field) => {
            const v = value.formData[field.id];
            const common = {
              value: (v as string) ?? '',
              disabled,
              onChange: (e: React.ChangeEvent<any>) =>
                setField(field.id, e.target.value),
            };
            return (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                  {field.required && <span className="text-red-500"> *</span>}
                </label>
                {field.type === 'textarea' ? (
                  <Textarea rows={3} placeholder={field.placeholder} {...common} />
                ) : field.type === 'select' ? (
                  <Select {...common}>
                    <option value="">Select…</option>
                    {(field.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    type={
                      field.type === 'file' ? 'text' : field.type
                    }
                    placeholder={field.placeholder}
                    {...common}
                  />
                )}
              </div>
            );
          })}
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
