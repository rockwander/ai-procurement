'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { FormSchema, FormField, sortedFields } from '@/lib/form-schema';
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
 * The supplier's quotation rendered as a DOCUMENT they are drafting — a
 * quotation letter in response to the RFQ, not a form. Values are plain text
 * that becomes a bare inline input on click; nothing has a form-field border.
 *  - amber text  = the assistant filled this and isn't fully sure (rationale
 *                  shown inline). Click to confirm or correct.
 *  - a red gap "________" = a mandatory value is missing — reads like an
 *                  unfinished sentence.
 * Clicking any value also sets it as the chat context.
 * The captured data (fixed table) is unchanged — this is only the surface.
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

  const bySection = (id: string | undefined) =>
    fields.filter((f) => (f.section ?? '') === (id ?? ''));

  // shared props for the inline value cells
  const cellCtx = { activeFieldId, disabled, onActivateField, onConfirmField };

  return (
    <div className="quote-doc font-serif text-[15px] leading-relaxed text-gray-800">
      {/* Letterhead */}
      <div className="border-b-2 border-gray-800 pb-3 mb-5">
        <h2 className="font-sans text-xl font-bold tracking-tight text-gray-900">
          Quotation
        </h2>
        <p className="font-sans text-sm text-gray-500">
          in response to {buyerTitle}
        </p>
      </div>

      <p className="mb-4">
        We are pleased to submit our quotation as set out below. Unless noted
        against a line, all prices are quoted in{' '}
        <span className="font-semibold">{rfqCurrency}</span>.
      </p>

      {/* Line items — a real table, plain-text cells */}
      <h3 className="font-sans font-semibold text-gray-900 mt-6 mb-2">
        1. Pricing
      </h3>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-y border-gray-300 text-left align-bottom">
              <th className="py-1.5 pr-3 font-sans font-medium text-gray-500 w-6">#</th>
              <th className="py-1.5 pr-3 font-sans font-medium text-gray-500">Item</th>
              <th className="py-1.5 pr-3 font-sans font-medium text-gray-500">Supply</th>
              <th className="py-1.5 pr-3 font-sans font-medium text-gray-500 text-right">Unit price</th>
              <th className="py-1.5 pr-3 font-sans font-medium text-gray-500">per</th>
              <th className="py-1.5 pr-3 font-sans font-medium text-gray-500 text-right">Lead</th>
              <th className="py-1.5 font-sans font-medium text-gray-500 text-right">MOQ</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, i) => {
              const r = respFor(li);
              const cov = coverageForLine(r, li as RFQLineForResponse);
              const norm = normaliseLinePrice(r, rfqCurrency);
              const noBid = r.canSupply === 'no';
              return (
                <tr
                  key={li.id}
                  className={`border-b border-gray-100 align-top ${noBid ? 'text-gray-400' : ''}`}
                >
                  <td className="py-2 pr-3 text-gray-400">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <span className={noBid ? 'line-through' : ''}>{li.itemDescription}</span>
                    <div className="font-sans text-[12px] text-gray-400">
                      asked {li.quantity.toLocaleString()} {li.unit}
                    </div>
                  </td>

                  {/* Supply */}
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <SupplyCell
                      li={li} idx={i} resp={r} cov={cov}
                      provenance={provenance}
                      onPatch={patchResp}
                      {...cellCtx}
                    />
                  </td>

                  {/* Unit price */}
                  <td className="py-2 pr-3 text-right">
                    {noBid ? (
                      <span>—</span>
                    ) : (
                      <>
                        <InlineNumber
                          targetId={lineFieldId(li.id, 'unitPrice')}
                          fieldLabel={`Line ${i + 1} — unit price`}
                          value={r.unitPrice}
                          state={fieldState(
                            r.unitPrice,
                            LINE_FIELD_META.unitPrice,
                            provenance[lineFieldId(li.id, 'unitPrice')]
                          )}
                          rationale={provenance[lineFieldId(li.id, 'unitPrice')]?.rationale}
                          onCommit={(n) => {
                            patchResp(li, { unitPrice: n });
                            if (n != null) onConfirmField(lineFieldId(li.id, 'unitPrice'));
                          }}
                          {...cellCtx}
                        />
                        {norm.currencyDiffers && r.unitPrice != null && (
                          <span className="text-amber-700 text-[12px]"> {r.currency}</span>
                        )}
                      </>
                    )}
                  </td>

                  {/* per (UoM) */}
                  <td className="py-2 pr-3">
                    {noBid ? null : (
                      <InlineSelect
                        targetId={lineFieldId(li.id, 'quotedUom')}
                        fieldLabel={`Line ${i + 1} — unit of measure`}
                        value={r.quotedUom}
                        display={r.quotedUom.replace(/^per /, '')}
                        options={QUOTE_UOM_OPTIONS as unknown as string[]}
                        state={fieldState(
                          r.quotedUom,
                          LINE_FIELD_META.quotedUom,
                          provenance[lineFieldId(li.id, 'quotedUom')]
                        )}
                        rationale={provenance[lineFieldId(li.id, 'quotedUom')]?.rationale}
                        onCommit={(v) => {
                          patchResp(li, { quotedUom: v });
                          onConfirmField(lineFieldId(li.id, 'quotedUom'));
                        }}
                        {...cellCtx}
                      />
                    )}
                    {!noBid && norm.uomAmbiguous && (
                      <div className="text-amber-700 text-[12px]">pack size?</div>
                    )}
                  </td>

                  {/* Lead */}
                  <td className="py-2 pr-3 text-right">
                    {noBid ? null : (
                      <InlineNumber
                        targetId={lineFieldId(li.id, 'leadTimeDays')}
                        fieldLabel={`Line ${i + 1} — lead time (days)`}
                        value={r.leadTimeDays}
                        suffix=" d"
                        state={fieldState(
                          r.leadTimeDays,
                          LINE_FIELD_META.leadTimeDays,
                          provenance[lineFieldId(li.id, 'leadTimeDays')]
                        )}
                        rationale={provenance[lineFieldId(li.id, 'leadTimeDays')]?.rationale}
                        onCommit={(n) => {
                          patchResp(li, { leadTimeDays: n });
                          if (n != null) onConfirmField(lineFieldId(li.id, 'leadTimeDays'));
                        }}
                        {...cellCtx}
                      />
                    )}
                  </td>

                  {/* MOQ */}
                  <td className="py-2 text-right">
                    {noBid ? null : (
                      <InlineNumber
                        targetId={lineFieldId(li.id, 'moq')}
                        fieldLabel={`Line ${i + 1} — MOQ`}
                        value={r.moq}
                        state={fieldState(
                          r.moq,
                          LINE_FIELD_META.moq,
                          provenance[lineFieldId(li.id, 'moq')]
                        )}
                        rationale={provenance[lineFieldId(li.id, 'moq')]?.rationale}
                        onCommit={(n) => {
                          patchResp(li, { moq: n });
                          if (n != null) onConfirmField(lineFieldId(li.id, 'moq'));
                        }}
                        {...cellCtx}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Currency note per line, only where it differs */}
      {lineItems.some((li) => normaliseLinePrice(respFor(li), rfqCurrency).currencyDiffers) && (
        <p className="mt-2 text-[13px] text-amber-700">
          Some lines are quoted in a currency other than {rfqCurrency} (shown next
          to the price). These are not converted — the buyer will see them as
          quoted.
        </p>
      )}

      {/* Commercial terms — as prose */}
      {(() => {
        const commFields = fields.filter((f) => f.section && f.section !== 'questionnaire');
        if (commFields.length === 0) return null;
        return (
          <>
            <h3 className="font-sans font-semibold text-gray-900 mt-8 mb-2">
              2. Commercial terms
            </h3>
            <ul className="space-y-1.5 list-disc pl-5">
              {commFields.map((f) => (
                <li key={f.id}>
                  <span className="font-medium">{f.label}: </span>
                  <ProseField
                    field={f}
                    value={value.formData[f.id]}
                    state={fieldState(value.formData[f.id], { blocking: !!f.required }, provenance[f.id])}
                    rationale={provenance[f.id]?.rationale}
                    onCommit={(v) => {
                      setFormField(f.id, v);
                      onConfirmField(f.id);
                    }}
                    {...cellCtx}
                  />
                </li>
              ))}
            </ul>
          </>
        );
      })()}

      {/* Questionnaire — Q & A */}
      {(() => {
        const qFields = fields.filter((f) => f.section === 'questionnaire');
        if (qFields.length === 0) return null;
        return (
          <>
            <h3 className="font-sans font-semibold text-gray-900 mt-8 mb-2">
              3. Quality &amp; capability
            </h3>
            <dl className="space-y-3">
              {qFields.map((f) => (
                <div key={f.id}>
                  <dt className="text-gray-700">
                    {f.label}
                    {f.required && <span className="text-red-500"> *</span>}
                  </dt>
                  <dd className="pl-4">
                    <ProseField
                      field={f}
                      value={value.formData[f.id]}
                      state={fieldState(value.formData[f.id], { blocking: !!f.required }, provenance[f.id])}
                      rationale={provenance[f.id]?.rationale}
                      onCommit={(v) => {
                        setFormField(f.id, v);
                        onConfirmField(f.id);
                      }}
                      {...cellCtx}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </>
        );
      })()}

      {/* Notes */}
      <h3 className="font-sans font-semibold text-gray-900 mt-8 mb-2">
        4. Notes to the buyer
      </h3>
      <p className="text-[13px] text-gray-500 mb-1 font-sans">
        Caveats, exceptions, anything that doesn&rsquo;t belong in a line above.
      </p>
      <textarea
        className="w-full border border-gray-200 rounded p-2 text-[14px] font-serif"
        rows={3}
        value={value.notes}
        disabled={disabled}
        placeholder="e.g. Prices firm for 6 months, then index-linked; sample kit sent separately."
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline-editable value primitives — text that becomes a bare input on click
// ---------------------------------------------------------------------------

type CellCtx = {
  activeFieldId?: string | null;
  disabled?: boolean;
  onActivateField: (f: ActiveField | null) => void;
  onConfirmField: (targetId: string) => void;
};

const STATE_TEXT: Record<FieldState, string> = {
  confident: 'text-gray-900',
  assumed: 'text-amber-800 bg-amber-100/60 rounded px-0.5',
  uncertain: 'text-amber-800 bg-amber-100/60 rounded px-0.5',
  empty: 'text-red-500',
  'optional-empty': 'text-gray-400',
};

function Gap() {
  return <span className="text-red-400 border-b border-red-300 border-dashed px-3">&nbsp;</span>;
}

/** A value shown as text; click → bare input; commit on blur / Enter. */
function InlineText({
  targetId,
  fieldLabel,
  display,
  editValue,
  state,
  rationale,
  inputType = 'text',
  suffix,
  activeFieldId,
  disabled,
  onActivateField,
  onEditStart,
  onCommit,
}: CellCtx & {
  targetId: string;
  fieldLabel: string;
  display: string | null;
  editValue: string;
  state: FieldState;
  rationale?: string;
  inputType?: 'text' | 'number';
  suffix?: string;
  onEditStart?: () => void;
  onCommit: (raw: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editValue);
  const ref = useRef<HTMLInputElement>(null);
  const active = activeFieldId === targetId;

  useEffect(() => {
    if (editing) {
      setDraft(editValue);
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  function open() {
    if (disabled) return;
    onActivateField({ id: targetId, label: fieldLabel });
    onEditStart?.();
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    if (draft !== editValue) onCommit(draft);
  }

  if (editing) {
    return (
      <input
        ref={ref}
        type={inputType}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="min-w-[3ch] max-w-[22ch] bg-white border-b border-blue-400 outline-none px-0.5 text-[inherit] font-[inherit]"
        style={{ width: `${Math.max(draft.length + 1, 3)}ch` }}
      />
    );
  }

  return (
    <span
      data-field={targetId}
      onClick={open}
      className={`cursor-text ${STATE_TEXT[state]} ${
        active ? 'ring-2 ring-blue-300 rounded' : ''
      } ${disabled ? 'cursor-default' : 'hover:underline decoration-dotted underline-offset-2'}`}
      title={disabled ? undefined : 'Click to edit or tell the assistant about this'}
    >
      {display == null || display === '' ? <Gap /> : display}
      {display != null && display !== '' && suffix}
      {rationale && (state === 'assumed' || state === 'uncertain') && (
        <span
          className="ml-1 align-middle text-amber-600 text-[11px] font-sans cursor-help"
          title={rationale}
        >
          ⓘ
        </span>
      )}
    </span>
  );
}

function InlineNumber(
  p: CellCtx & {
    targetId: string;
    fieldLabel: string;
    value: number | null;
    state: FieldState;
    rationale?: string;
    suffix?: string;
    onCommit: (n: number | null) => void;
  }
) {
  return (
    <InlineText
      {...p}
      display={p.value == null ? null : p.value.toLocaleString()}
      editValue={p.value == null ? '' : String(p.value)}
      inputType="number"
      suffix={p.suffix}
      onCommit={(raw) => {
        const t = raw.trim();
        p.onCommit(t === '' ? null : Number(t.replace(/[, ]/g, '')));
      }}
    />
  );
}

function InlineSelect(
  p: CellCtx & {
    targetId: string;
    fieldLabel: string;
    value: string;
    display: string;
    options: string[];
    state: FieldState;
    rationale?: string;
    onCommit: (v: string) => void;
  }
) {
  const [open, setOpen] = useState(false);
  const active = p.activeFieldId === p.targetId;
  if (open) {
    return (
      <select
        autoFocus
        value={p.value}
        onChange={(e) => {
          p.onCommit(e.target.value);
          setOpen(false);
        }}
        onBlur={() => setOpen(false)}
        className="bg-white border-b border-blue-400 outline-none text-[inherit] font-[inherit]"
      >
        {p.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <span
      data-field={p.targetId}
      onClick={() => {
        if (p.disabled) return;
        p.onActivateField({ id: p.targetId, label: p.fieldLabel });
        setOpen(true);
      }}
      className={`cursor-text ${STATE_TEXT[p.state]} ${active ? 'ring-2 ring-blue-300 rounded' : ''} ${
        p.disabled ? 'cursor-default' : 'hover:underline decoration-dotted underline-offset-2'
      }`}
      title={p.disabled ? undefined : 'Click to change'}
    >
      {p.display}
      {p.rationale && (p.state === 'assumed' || p.state === 'uncertain') && (
        <span
          className="ml-1 text-amber-600 text-[11px] font-sans cursor-help"
          title={p.rationale}
        >
          ⓘ
        </span>
      )}
    </span>
  );
}

/** The "can supply" cell — ✓ full / ⚠ partial (n of m) / ✗ not offered. */
function SupplyCell(
  p: CellCtx & {
    li: LineItemInput;
    idx: number;
    resp: LineItemResponse;
    cov: ReturnType<typeof coverageForLine>;
    provenance: ProvenanceMap;
    onPatch: (li: LineItemInput, patch: Partial<LineItemResponse>) => void;
  }
) {
  const [open, setOpen] = useState(false);
  const targetId = lineFieldId(p.li.id, 'canSupply');
  const active = p.activeFieldId === targetId;
  const r = p.resp;

  if (open) {
    return (
      <select
        autoFocus
        value={r.canSupply}
        onChange={(e) => {
          p.onPatch(p.li, { canSupply: e.target.value as LineItemResponse['canSupply'] });
          p.onConfirmField(targetId);
          setOpen(false);
        }}
        onBlur={() => setOpen(false)}
        className="bg-white border-b border-blue-400 outline-none text-[13px]"
      >
        <option value="full">can supply in full</option>
        <option value="partial">can supply partially</option>
        <option value="no">not quoting this line</option>
      </select>
    );
  }

  let label: React.ReactNode;
  if (r.canSupply === 'no') label = <span className="italic">not offered</span>;
  else if (p.cov.partial)
    label = (
      <span className="text-amber-800">
        ⚠ {p.cov.committed.toLocaleString()} of {p.cov.asked.toLocaleString()}
      </span>
    );
  else label = <span className="text-green-700">✓ full</span>;

  return (
    <span
      data-field={targetId}
      onClick={() => {
        if (p.disabled) return;
        p.onActivateField({ id: targetId, label: `Line ${p.idx + 1} — can supply` });
        setOpen(true);
      }}
      className={`cursor-text text-[13px] ${active ? 'ring-2 ring-blue-300 rounded' : ''} ${
        p.disabled ? 'cursor-default' : 'hover:underline decoration-dotted underline-offset-2'
      }`}
    >
      {label}
    </span>
  );
}

/** A form field rendered inline in prose (commercial term / questionnaire answer). */
function ProseField(
  p: CellCtx & {
    field: FormField;
    value: unknown;
    state: FieldState;
    rationale?: string;
    onCommit: (v: unknown) => void;
  }
) {
  const f = p.field;
  const str = p.value == null ? '' : String(p.value);

  if (f.type === 'select') {
    return (
      <InlineSelect
        targetId={f.id}
        fieldLabel={f.label}
        value={str}
        display={str || '—'}
        options={['', ...(f.options ?? [])]}
        state={p.state}
        rationale={p.rationale}
        onCommit={(v) => p.onCommit(v)}
        activeFieldId={p.activeFieldId}
        disabled={p.disabled}
        onActivateField={p.onActivateField}
        onConfirmField={p.onConfirmField}
      />
    );
  }

  return (
    <InlineText
      targetId={f.id}
      fieldLabel={f.label}
      display={str || null}
      editValue={str}
      inputType={f.type === 'number' ? 'number' : 'text'}
      state={p.state}
      rationale={p.rationale}
      activeFieldId={p.activeFieldId}
      disabled={p.disabled}
      onActivateField={p.onActivateField}
      onConfirmField={p.onConfirmField}
      onCommit={(raw) => p.onCommit(f.type === 'number' ? (raw === '' ? '' : Number(raw)) : raw)}
    />
  );
}
