'use client';

import { useMemo } from 'react';
import {
  FormSchema,
  FormField,
  FIELD_TYPES,
  newField,
  reindex,
  sortedFields,
} from '@/lib/form-schema';
import { Button, Input, Select } from '@/components/ui';

/**
 * Buyer-facing form builder. Edit field labels, type, mandatory flag, options,
 * order; add/delete fields. Line-item pricing is rendered by the supplier form
 * from the RFQ line items, so the builder only manages the questionnaire fields.
 */
export function FormBuilder({
  schema,
  onChange,
}: {
  schema: FormSchema;
  onChange: (next: FormSchema) => void;
}) {
  const fields = useMemo(() => sortedFields(schema), [schema]);

  function update(next: FormField[]) {
    onChange({ ...schema, fields: reindex(next) });
  }

  function patchField(id: string, patch: Partial<FormField>) {
    update(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function move(id: string, dir: -1 | 1) {
    const idx = fields.findIndex((f) => f.id === id);
    const target = idx + dir;
    if (target < 0 || target >= fields.length) return;
    const copy = [...fields];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    update(copy);
  }

  function remove(id: string) {
    update(fields.filter((f) => f.id !== id));
  }

  function add() {
    update([...fields, newField(fields.length)]);
  }

  return (
    <div className="space-y-3">
      {fields.length === 0 && (
        <p className="text-sm text-gray-500">
          No custom fields yet. The supplier form will still show the line-item
          pricing table. Add questionnaire fields below.
        </p>
      )}

      {fields.map((field, i) => (
        <div
          key={field.id}
          className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2"
        >
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <button
                onClick={() => move(field.id, -1)}
                disabled={i === 0}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none"
                aria-label="Move up"
              >
                ▲
              </button>
              <button
                onClick={() => move(field.id, 1)}
                disabled={i === fields.length - 1}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none"
                aria-label="Move down"
              >
                ▼
              </button>
            </div>

            <Input
              value={field.label}
              onChange={(e) => patchField(field.id, { label: e.target.value })}
              placeholder="Field label"
              className="flex-1"
            />

            <Select
              value={field.type}
              onChange={(e) =>
                patchField(field.id, { type: e.target.value as FormField['type'] })
              }
              className="w-32"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>

            <label className="flex items-center gap-1 text-sm text-gray-600 whitespace-nowrap">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) =>
                  patchField(field.id, { required: e.target.checked })
                }
              />
              Required
            </label>

            <button
              onClick={() => remove(field.id)}
              className="text-red-500 hover:text-red-700 text-sm px-2"
              aria-label="Delete field"
            >
              ✕
            </button>
          </div>

          {field.type === 'select' && (
            <Input
              value={(field.options ?? []).join(', ')}
              onChange={(e) =>
                patchField(field.id, {
                  options: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Options, comma-separated"
            />
          )}
        </div>
      ))}

      <Button variant="secondary" size="sm" onClick={add}>
        + Add field
      </Button>
    </div>
  );
}
