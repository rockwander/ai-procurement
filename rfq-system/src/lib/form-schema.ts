// Shared form-schema shape used by the buyer's form builder and the supplier's
// public form renderer. Mirrors FormGenerationAgent output but is the canonical
// client type.

export type FieldType =
  | 'text'
  | 'number'
  | 'email'
  | 'tel'
  | 'textarea'
  | 'select'
  | 'date'
  | 'file';

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  validation?: { min?: number; max?: number; pattern?: string };
  orderIndex: number;
  section?: string;
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  orderIndex: number;
}

export interface FormSchema {
  sections: FormSection[];
  fields: FormField[];
}

export const FIELD_TYPES: FieldType[] = [
  'text',
  'number',
  'email',
  'tel',
  'textarea',
  'select',
  'date',
  'file',
];

export function emptySchema(): FormSchema {
  return {
    sections: [{ id: 'default', title: 'Quote Details', orderIndex: 0 }],
    fields: [],
  };
}

export function newField(orderIndex: number): FormField {
  return {
    id: `field_${Math.random().toString(36).slice(2, 9)}`,
    type: 'text',
    label: 'New Field',
    required: false,
    orderIndex,
  };
}

export function sortedFields(schema: FormSchema): FormField[] {
  return [...schema.fields].sort((a, b) => a.orderIndex - b.orderIndex);
}

/** Reindex fields 0..n after a reorder so orderIndex stays contiguous. */
export function reindex(fields: FormField[]): FormField[] {
  return fields.map((f, i) => ({ ...f, orderIndex: i }));
}
