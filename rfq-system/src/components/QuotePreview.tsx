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
  type QuoteException,
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

export interface PassageRef {
  id: string; // `passage:<slug>`
  label: string;
  text: string;
}

function passageId(slug: string): string {
  return `passage:${slug}`;
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
  rfqTerms = [],
  rfqHeader,
  value,
  provenance,
  exceptions,
  activeFieldId,
  onChange,
  onConfirmField,
  onActivateField,
  onActivatePassage,
  onRemoveException,
  disabled,
  buyerComments = [],
}: {
  buyerTitle: string;
  schema: FormSchema;
  lineItems: LineItemInput[];
  rfqCurrency: string;
  rfqTerms?: string[];
  rfqHeader?: { buyer: string; expectedDelivery: string; validity: string };
  value: QuoteFormValue;
  provenance: ProvenanceMap;
  exceptions: QuoteException[];
  activeFieldId?: string | null;
  onChange: (v: QuoteFormValue) => void;
  onConfirmField: (targetId: string) => void;
  onActivateField: (f: ActiveField | null) => void;
  onActivatePassage: (p: PassageRef) => void;
  onRemoveException: (index: number) => void;
  disabled?: boolean;
  /** the buyer's review / negotiation notes, pinned to their field ids */
  buyerComments?: Array<{ fieldId: string; fieldLabel: string; comment: string }>;
}) {
  const fields = useMemo(() => sortedFields(schema), [schema]);
  const commentByField = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of buyerComments) {
      if (!m.has(c.fieldId)) m.set(c.fieldId, []);
      m.get(c.fieldId)!.push(c.comment);
    }
    return m;
  }, [buyerComments]);
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
  const cellCtx = { activeFieldId, disabled, onActivateField, onConfirmField, commentByField };

  const passageProps = { activeFieldId, disabled, onActivatePassage, exceptions };

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

      <Passage
        slug="intro"
        label="Opening / overall terms"
        text="We are pleased to submit our quotation as set out below. Unless noted against a line, all prices are quoted in the RFQ currency."
        as="p"
        className="mb-4"
        {...passageProps}
      >
        We are pleased to submit our quotation as set out below. Unless noted
        against a line, all prices are quoted in{' '}
        <span className="font-semibold">{rfqCurrency}</span>.
      </Passage>

      {/* Line items — a real table, plain-text cells */}
      <SectionHeading
        slug="pricing"
        label="Pricing section"
        text="1. Pricing"
        {...passageProps}
      >
        1. Pricing
      </SectionHeading>
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
            <SectionHeading slug="commercial" label="Commercial terms" text="2. Commercial terms" {...passageProps}>
              2. Commercial terms
            </SectionHeading>
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
            <SectionHeading slug="quality" label="Quality and capability" text="3. Quality & capability" {...passageProps}>
              3. Quality &amp; capability
            </SectionHeading>
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

      {/* The buyer's terms — read-only, each clause clickable to react to */}
      {(rfqTerms.length > 0 || rfqHeader) && (
        <>
          <SectionHeading
            slug="terms"
            label="The buyer's terms & conditions"
            text="4. The buyer's terms"
            {...passageProps}
          >
            4. The buyer&rsquo;s terms
          </SectionHeading>
          <p className="text-[13px] text-gray-500 mb-2 font-sans">
            From the RFQ. Click a clause to accept it as-is by saying so, or to
            raise a condition — I&rsquo;ll change a field if it maps to one, or
            note it for the buyer.
          </p>
          <ul className="space-y-1.5 list-disc pl-5">
            {rfqHeader?.expectedDelivery && (
              <TermClause
                slug="term-delivery"
                text={`Expected delivery: ${rfqHeader.expectedDelivery}`}
                {...passageProps}
              />
            )}
            {rfqHeader?.validity && (
              <TermClause
                slug="term-validity"
                text={`Quote validity: ${rfqHeader.validity}`}
                {...passageProps}
              />
            )}
            {rfqTerms.map((t, i) => (
              <TermClause key={i} slug={`term-${i}`} text={t} {...passageProps} />
            ))}
          </ul>
        </>
      )}

      {/* Exceptions the supplier has raised */}
      {exceptions.length > 0 && (
        <div className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="font-sans font-semibold text-amber-900 text-sm mb-2">
            Conditions & exceptions the buyer will see ({exceptions.length})
          </p>
          <ul className="space-y-2">
            {exceptions.map((e, i) => (
              <li key={i} className="text-[14px] flex items-start gap-2">
                <span className="flex-1">
                  <span className="font-medium">{e.re.replace(/[.:\s]+$/, '')} — </span>
                  {e.comment}
                </span>
                {!disabled && (
                  <button
                    onClick={() => onRemoveException(i)}
                    className="text-amber-600 hover:text-amber-900 text-sm shrink-0"
                    aria-label="Remove"
                    title="Remove this exception"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Free-form notes */}
      <SectionHeading
        slug="notes"
        label="Notes to the buyer"
        text="5. Notes to the buyer"
        {...passageProps}
      >
        5. Notes to the buyer
      </SectionHeading>
      <p className="text-[13px] text-gray-500 mb-1 font-sans">
        Anything else that doesn&rsquo;t belong in a line or a condition above.
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
// Clickable document passages (headings, intro, T&C clauses)
// ---------------------------------------------------------------------------

type PassageCtx = {
  activeFieldId?: string | null;
  disabled?: boolean;
  onActivatePassage: (p: PassageRef) => void;
  exceptions: QuoteException[];
};

function Passage({
  slug,
  label,
  text,
  as = 'span',
  className = '',
  children,
  activeFieldId,
  disabled,
  onActivatePassage,
  exceptions,
}: PassageCtx & {
  slug: string;
  label: string;
  text: string;
  as?: 'span' | 'p' | 'li';
  className?: string;
  children: React.ReactNode;
}) {
  const id = passageId(slug);
  const active = activeFieldId === id;
  const raised = exceptions.filter((e) => e.re.toLowerCase().includes(label.toLowerCase().split(' ')[0]));
  const Tag = as;
  return (
    <Tag
      data-field={id}
      onClick={() => !disabled && onActivatePassage({ id, label, text })}
      className={`${className} ${disabled ? '' : 'cursor-pointer hover:bg-blue-50/60 rounded'} ${
        active ? 'ring-2 ring-blue-300 rounded' : ''
      }`}
      title={disabled ? undefined : 'Click to comment on this to the assistant'}
    >
      {children}
      {raised.length > 0 && (
        <span className="ml-1 align-middle text-amber-600 text-[11px] font-sans">
          ⚠ {raised.length}
        </span>
      )}
    </Tag>
  );
}

function SectionHeading(
  p: PassageCtx & { slug: string; label: string; text: string; children: React.ReactNode }
) {
  return (
    <Passage
      {...p}
      as="span"
      className="font-sans font-semibold text-gray-900 mt-8 mb-2 block"
    >
      {p.children}
    </Passage>
  );
}

function TermClause(p: PassageCtx & { slug: string; text: string }) {
  return (
    <Passage {...p} label={p.text} as="li" className="marker:text-gray-400">
      {p.text}
    </Passage>
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
  commentByField?: Map<string, string[]>;
};

/** The buyer's review / negotiation note pinned to a field. */
function BuyerCommentMark({
  comments,
}: {
  comments?: string[];
}) {
  if (!comments || comments.length === 0) return null;
  return (
    <span
      className="ml-1 align-middle rounded bg-purple-100 px-1 text-[11px] text-purple-700 font-sans cursor-help"
      title={comments.join('\n\n')}
    >
      💬 buyer{comments.length > 1 ? ` ×${comments.length}` : ''}
    </span>
  );
}

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
  commentByField,
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
      <BuyerCommentMark comments={commentByField?.get(targetId)} />
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
      <BuyerCommentMark comments={p.commentByField?.get(p.targetId)} />
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
        onBlur={() => {
          // Opening the dropdown and closing it (even on the same value) counts
          // as confirming a system-inferred "not offered".
          p.onConfirmField(targetId);
          setOpen(false);
        }}
        className="bg-white border-b border-blue-400 outline-none text-[13px]"
      >
        <option value="full">can supply in full</option>
        <option value="partial">can supply partially</option>
        <option value="no">not quoting this line</option>
      </select>
    );
  }

  const csProv = p.provenance[targetId];
  const inferredNoBid = !!csProv?.inferredNoBid && !csProv?.confirmedBySupplier;

  let label: React.ReactNode;
  if (r.canSupply === 'no')
    label = (
      <span className={inferredNoBid ? 'italic text-amber-800 bg-amber-100/60 rounded px-0.5' : 'italic'}>
        not offered
      </span>
    );
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
      {inferredNoBid && (
        <span
          className="ml-1 align-middle text-amber-600 text-[11px] font-sans cursor-help"
          title={csProv?.rationale || "You didn't quote this line — confirm or correct it."}
        >
          ⓘ confirm
        </span>
      )}
      <BuyerCommentMark comments={p.commentByField?.get(targetId)} />
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
