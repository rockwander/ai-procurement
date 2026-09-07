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

export function emptySchema(): FormSchema {
  return {
    sections: [{ id: 'default', title: 'Quote Details', orderIndex: 0 }],
    fields: [],
  };
}

export function sortedFields(schema: FormSchema): FormField[] {
  return [...schema.fields].sort((a, b) => a.orderIndex - b.orderIndex);
}

// ---------------------------------------------------------------------------
// Derive the supplier-facing FormSchema from the canonical RFQ document.
// The RFQDocument (header / line items / commercial fields / questionnaire) is
// the source of truth; the supplier form renderer and the quote-comparison
// table consume this derived schema.
// ---------------------------------------------------------------------------

import type { RFQDocument } from '@/lib/rfq-document';

const COMMERCIAL_SECTION = 'commercial';
const QUESTIONNAIRE_SECTION = 'questionnaire';

export function rfqDocumentToFormSchema(doc: RFQDocument): FormSchema {
  const sections: FormSection[] = [
    {
      id: COMMERCIAL_SECTION,
      title: 'Commercial information (per line item)',
      description:
        'Provide these for each line item. Unit price is captured in the pricing table above.',
      orderIndex: 0,
    },
    {
      id: QUESTIONNAIRE_SECTION,
      title: 'Quality questionnaire',
      orderIndex: 1,
    },
  ];

  const fields: FormField[] = [];
  let order = 0;

  for (const cf of doc.commercialFields) {
    // Unit price is handled by the pricing table, not as a free field.
    if (/^unit\s*price$/i.test(cf.label.trim())) continue;
    fields.push({
      id: cf.id,
      type: cf.type === 'number' ? 'number' : cf.type === 'select' ? 'select' : 'text',
      label: cf.label,
      required: cf.required,
      options: cf.options,
      orderIndex: order++,
      section: COMMERCIAL_SECTION,
    });
  }

  for (const q of doc.questionnaire) {
    fields.push({
      id: q.id,
      type: q.responseType === 'yesno' ? 'select' : q.responseType === 'file' ? 'file' : 'textarea',
      label: q.question,
      required: q.required,
      options: q.responseType === 'yesno' ? ['Yes', 'No'] : undefined,
      orderIndex: order++,
      section: QUESTIONNAIRE_SECTION,
    });
  }

  return { sections, fields };
}
