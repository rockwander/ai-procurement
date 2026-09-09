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
import {
  LINE_FIELD_META,
  type LineField,
  lineFieldId,
  fieldState,
  lineFieldApplicable,
  coverageForLine,
  type FieldState,
  type ProvenanceMap,
} from '@/lib/line-response-status';

export interface LineItemInput {
  id: string;
  itemDescription: string;
  quantity: number;
  unit: string;
}

export interface QuoteFormValue {
  formData: Record<string, unknown>;
  lineResponses: Record<string, LineItemResponse>;
  notes: string;
}

export interface ActiveField {
  id: string;
  label: string;
}

/**
 * The supplier's quotation as a live document preview. Each field is a
 * colour-coded, clickable region that is also directly editable:
 *  - click the field   → set it as the chat context (activeField) + focus it
 *  - type into it       → direct edit, marks the value supplier-confirmed
 * Colour = confidence (see line-response-status.fieldState).
 */
export function QuotePreview({
  buyerTitle,
  schema,
  lineItems,
  rfqCurrency,
  value,
  provenance,
  activeFieldId,
  onChange,
  onConfirmField,
  onActivateField,
  disabled,
}: {
  buyerTitle: string;
  schema: FormSchema;
  lineItems: LineItemInput[];
  rfqCurrency: string;
  value: QuoteFormValue;
  provenance: ProvenanceMap;
  activeFieldId?: string | null;
  onChange: (v: QuoteFormValue) => void;
  /** mark a field as supplier-confirmed (they touched it directly) */
  onConfirmField: (targetId: string) => void;
  onActivateField: (f: ActiveField | null) => void;
  disabled?: boolean;
}) {
  const fields = useMemo(() => sortedFields(schema), [schema]);
  const sections = useMemo(
    () => [...schema.sections].sort((a, b) => a.orderIndex - b.orderIndex),
    [schema]
  );

  function respFor(li: LineItemInput): LineItemResponse {
    return (
      value.lineResponses[li.id] ??
      emptyLineResponse(li as RFQLineForResponse, rfqCurrency)
    );
  }
  function patchResp(li: LineItemInput, patch: Partial<LineItemResponse>) {
    onChange({
      ...value,
      lineResponses: {
        ...value.lineResponses,
        [li.id]: { ...respFor(li), ...patch, itemId: li.id },
      },
    });
  }
  function setFormField(id: string, v: unknown) {
    onChange({ ...value, formData: { ...value.formData, [id]: v } });
  }

  const bySection = (sectionId: string | undefined) =>
    fields.filter((f) => (f.section ?? '') === (sectionId ?? ''));

  return (
    <div className="space-y-6 text-sm">
      <header className="border-b border-gray-200 pb-3">
        <p className="text-xs uppercase tracking-wide text-gray-400">Your quotation for</p>
        <h2 className="text-lg font-semibold text-gray-900">{buyerTitle}</h2>
        <p className="text-xs text-gray-500 mt-1">
          Prices in {rfqCurrency} unless you say otherwise. Amber = the assistant
          filled this and isn&rsquo;t fully sure — click it to confirm or correct.
        </p>
      </header>

      {/* Line items — one card per line, document-style */}
      <section className="space-y-3">
        <h3 className="font-semibold text-gray-900">Line items</h3>
        {lineItems.map((li, i) => {
          const r = respFor(li);
          const cov = coverageForLine(r, li as RFQLineForResponse);
          const norm = normaliseLinePrice(r, rfqCurrency);
          const noBid = r.canSupply === 'no';
          return (
            <div
              key={li.id}
              className={`rounded-lg border p-3 ${
                noBid ? 'border-gray-200 bg-gray-50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium text-gray-900">
                  {i + 1}. {li.itemDescription}
                </p>
                <p className="text-xs text-gray-500 whitespace-nowrap">
                  asked {li.quantity.toLocaleString()} {li.unit}
                </p>
              </div>

              {/* Can supply — always shown */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <FieldCell
                  targetId={lineFieldId(li.id, 'canSupply')}
                  label="Can supply"
                  state={fieldState(r.canSupply, LINE_FIELD_META.canSupply, provenance[lineFieldId(li.id, 'canSupply')])}
                  rationale={provenance[lineFieldId(li.id, 'canSupply')]?.rationale}
                  activeFieldId={activeFieldId}
                  onActivate={() =>
                    onActivateField({ id: lineFieldId(li.id, 'canSupply'), label: `Line ${i + 1} — Can supply` })
                  }
                >
                  <Select
                    value={r.canSupply}
                    disabled={disabled}
                    onChange={(e) => {
                      patchResp(li, { canSupply: e.target.value as LineItemResponse['canSupply'] });
                      onConfirmField(lineFieldId(li.id, 'canSupply'));
                    }}
                    className="!w-auto"
                  >
                    <option value="full">Yes — full quantity</option>
                    <option value="partial">Partial</option>
                    <option value="no">No — not quoting</option>
                  </Select>
                </FieldCell>
              </div>

              {!noBid && (
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                  <LineNumberCell
                    li={li} idx={i} field="unitPrice" label="Unit price"
                    value={r.unitPrice} provenance={provenance} activeFieldId={activeFieldId}
                    resp={r} disabled={disabled}
                    onPatch={patchResp} onConfirm={onConfirmField} onActivate={onActivateField}
                    suffix={
                      norm.currencyDiffers && r.unitPrice != null ? ` ${r.currency}` : undefined
                    }
                    warn={norm.uomAmbiguous ? 'pack size unknown — can’t compare per-unit' : undefined}
                  />
                  <TextCellSelect
                    li={li} idx={i} field="quotedUom" label="Priced per"
                    value={r.quotedUom} options={QUOTE_UOM_OPTIONS as unknown as string[]}
                    provenance={provenance} activeFieldId={activeFieldId} resp={r} disabled={disabled}
                    onPatch={patchResp} onConfirm={onConfirmField} onActivate={onActivateField}
                  />
                  <TextCellInput
                    li={li} idx={i} field="currency" label="Currency" upper
                    value={r.currency} provenance={provenance} activeFieldId={activeFieldId}
                    resp={r} disabled={disabled}
                    onPatch={patchResp} onConfirm={onConfirmField} onActivate={onActivateField}
                  />
                  <LineNumberCell
                    li={li} idx={i} field="availableQty" label="Qty you can supply"
                    value={r.availableQty} provenance={provenance} activeFieldId={activeFieldId}
                    resp={r} disabled={disabled} placeholder={String(li.quantity)}
                    onPatch={patchResp} onConfirm={onConfirmField} onActivate={onActivateField}
                    warn={cov.partial ? `partial — ${cov.committed.toLocaleString()} of ${cov.asked.toLocaleString()}` : undefined}
                  />
                  <LineNumberCell
                    li={li} idx={i} field="leadTimeDays" label="Lead time (days)"
                    value={r.leadTimeDays} provenance={provenance} activeFieldId={activeFieldId}
                    resp={r} disabled={disabled}
                    onPatch={patchResp} onConfirm={onConfirmField} onActivate={onActivateField}
                  />
                  <LineNumberCell
                    li={li} idx={i} field="moq" label="MOQ"
                    value={r.moq} provenance={provenance} activeFieldId={activeFieldId}
                    resp={r} disabled={disabled}
                    onPatch={patchResp} onConfirm={onConfirmField} onActivate={onActivateField}
                  />
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Quote-level commercial + questionnaire */}
      {sections.map((sec) => {
        const secFields = bySection(sec.id);
        if (secFields.length === 0) return null;
        return (
          <section key={sec.id} className="space-y-3">
            <div>
              <h3 className="font-semibold text-gray-900">{sec.title}</h3>
              {sec.description && <p className="text-xs text-gray-500">{sec.description}</p>}
            </div>
            {secFields.map((f) => (
              <FormFieldRow
                key={f.id}
                field={f}
                value={value.formData[f.id]}
                state={fieldState(
                  value.formData[f.id],
                  { blocking: !!f.required },
                  provenance[f.id]
                )}
                rationale={provenance[f.id]?.rationale}
                activeFieldId={activeFieldId}
                disabled={disabled}
                onChange={(v) => {
                  setFormField(f.id, v);
                  onConfirmField(f.id);
                }}
                onActivate={() => onActivateField({ id: f.id, label: f.label })}
              />
            ))}
          </section>
        );
      })}

      {/* Notes */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-1">Notes for the buyer</h3>
        <p className="text-xs text-gray-500 mb-1">
          Caveats, exceptions, anything that doesn&rsquo;t fit a field above.
        </p>
        <Textarea
          rows={3}
          value={value.notes}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

const STATE_CLASS: Record<FieldState, string> = {
  confident: 'border-transparent',
  assumed: 'border-amber-300 bg-amber-50',
  uncertain: 'border-amber-300 bg-amber-50',
  empty: 'border-red-300 bg-red-50',
  'optional-empty': 'border-transparent',
};

/** A labelled, clickable, colour-coded wrapper around one editable field. */
function FieldCell({
  targetId,
  label,
  state,
  rationale,
  activeFieldId,
  onActivate,
  children,
}: {
  targetId: string;
  label: string;
  state: FieldState;
  rationale?: string;
  activeFieldId?: string | null;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  const active = activeFieldId === targetId;
  return (
    <div
      data-field={targetId}
      className={`rounded-md border px-2 py-1.5 transition-shadow ${STATE_CLASS[state]} ${
        active ? 'ring-2 ring-blue-400' : ''
      }`}
    >
      <button
        type="button"
        onClick={onActivate}
        className="block text-[11px] uppercase tracking-wide text-gray-400 hover:text-blue-600"
        title="Click to give the assistant more on this field"
      >
        {label}
        {state === 'empty' && <span className="text-red-500"> • needed</span>}
        {(state === 'assumed' || state === 'uncertain') && (
          <span className="text-amber-600"> • check</span>
        )}
      </button>
      <div className="mt-0.5">{children}</div>
      {rationale && (state === 'assumed' || state === 'uncertain') && (
        <p className="mt-0.5 text-[11px] text-amber-700">{rationale}</p>
      )}
    </div>
  );
}

type LineCellProps = {
  li: LineItemInput;
  idx: number;
  field: LineField;
  label: string;
  value: unknown;
  provenance: ProvenanceMap;
  activeFieldId?: string | null;
  resp: LineItemResponse;
  disabled?: boolean;
  placeholder?: string;
  suffix?: string;
  warn?: string;
  onPatch: (li: LineItemInput, patch: Partial<LineItemResponse>) => void;
  onConfirm: (targetId: string) => void;
  onActivate: (f: ActiveField | null) => void;
};

function useCellMeta(p: LineCellProps) {
  const targetId = lineFieldId(p.li.id, p.field);
  const meta = LINE_FIELD_META[p.field];
  const applicable = lineFieldApplicable(p.field, p.resp);
  const state = fieldState(p.value, meta, p.provenance[targetId], { applicable });
  return { targetId, meta, state, rationale: p.provenance[targetId]?.rationale };
}

function LineNumberCell(p: LineCellProps) {
  const { targetId, state, rationale } = useCellMeta(p);
  return (
    <FieldCell
      targetId={targetId}
      label={p.label}
      state={state}
      rationale={rationale}
      activeFieldId={p.activeFieldId}
      onActivate={() => p.onActivate({ id: targetId, label: `Line ${p.idx + 1} — ${p.label}` })}
    >
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder={p.placeholder}
          value={(p.value as number | null) ?? ''}
          disabled={p.disabled}
          onChange={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value);
            p.onPatch(p.li, { [p.field]: v } as Partial<LineItemResponse>);
            if (v != null) p.onConfirm(targetId);
          }}
          className="!w-24"
        />
        {p.suffix && <span className="text-xs text-gray-500">{p.suffix}</span>}
      </div>
      {p.warn && <p className="mt-0.5 text-[11px] text-amber-700">{p.warn}</p>}
    </FieldCell>
  );
}

function TextCellInput(p: LineCellProps & { upper?: boolean }) {
  const { targetId, state, rationale } = useCellMeta(p);
  return (
    <FieldCell
      targetId={targetId}
      label={p.label}
      state={state}
      rationale={rationale}
      activeFieldId={p.activeFieldId}
      onActivate={() => p.onActivate({ id: targetId, label: `Line ${p.idx + 1} — ${p.label}` })}
    >
      <Input
        value={(p.value as string) ?? ''}
        disabled={p.disabled}
        onChange={(e) => {
          const v = p.upper ? e.target.value.toUpperCase() : e.target.value;
          p.onPatch(p.li, { [p.field]: v } as Partial<LineItemResponse>);
          p.onConfirm(targetId);
        }}
        className="!w-20"
      />
    </FieldCell>
  );
}

function TextCellSelect(
  p: LineCellProps & { options: string[] }
) {
  const { targetId, state, rationale } = useCellMeta(p);
  return (
    <FieldCell
      targetId={targetId}
      label={p.label}
      state={state}
      rationale={rationale}
      activeFieldId={p.activeFieldId}
      onActivate={() => p.onActivate({ id: targetId, label: `Line ${p.idx + 1} — ${p.label}` })}
    >
      <Select
        value={(p.value as string) ?? ''}
        disabled={p.disabled}
        onChange={(e) => {
          p.onPatch(p.li, { [p.field]: e.target.value } as Partial<LineItemResponse>);
          p.onConfirm(targetId);
        }}
        className="!w-auto"
      >
        {p.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    </FieldCell>
  );
}

function FormFieldRow({
  field,
  value,
  state,
  rationale,
  activeFieldId,
  disabled,
  onChange,
  onActivate,
}: {
  field: FormField;
  value: unknown;
  state: FieldState;
  rationale?: string;
  activeFieldId?: string | null;
  disabled?: boolean;
  onChange: (v: unknown) => void;
  onActivate: () => void;
}) {
  const strVal = value == null ? '' : String(value);
  const active = activeFieldId === field.id;
  return (
    <div
      data-field={field.id}
      className={`rounded-md border px-2 py-1.5 ${STATE_CLASS[state]} ${
        active ? 'ring-2 ring-blue-400' : ''
      }`}
    >
      <button
        type="button"
        onClick={onActivate}
        className="block text-[11px] uppercase tracking-wide text-gray-400 hover:text-blue-600"
      >
        {field.label}
        {field.required && state === 'empty' && <span className="text-red-500"> • needed</span>}
        {(state === 'assumed' || state === 'uncertain') && (
          <span className="text-amber-600"> • check</span>
        )}
      </button>
      <div className="mt-0.5">
        {field.type === 'textarea' ? (
          <Textarea rows={2} value={strVal} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        ) : field.type === 'select' ? (
          <Select value={strVal} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="!w-auto">
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
            value={strVal}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            className="!w-32"
          />
        ) : (
          <Input value={strVal} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        )}
      </div>
      {rationale && (state === 'assumed' || state === 'uncertain') && (
        <p className="mt-0.5 text-[11px] text-amber-700">{rationale}</p>
      )}
    </div>
  );
}
