'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { GROUP_LABEL, type OutlineGroup, type RFQOutline } from '@/lib/rfq-outline';

/**
 * Renders a proposed RFQ outline inside the chat: two groups of sub-headings,
 * each ticked by default, each expandable to show its already-drafted content.
 * "Confirm & apply" sends the ticked section ids back.
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
  onApply: (tickedIds: string[]) => void;
}) {
  const [ticks, setTicks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(outline.sections.map((s) => [s.id, s.ticked]))
  );
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const groups: OutlineGroup[] = ['supplier', 'buyer'];
  const tickedIds = outline.sections.filter((s) => ticks[s.id]).map((s) => s.id);

  return (
    <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-3 text-sm space-y-3">
      <p className="text-gray-700">
        Here&apos;s what will go into the RFQ. Untick anything you don&apos;t want, click
        a heading to see its contents, then confirm.
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
                      <span className="text-gray-400"> — {s.summary}</span>
                      <span className="text-blue-600 ml-1">{open[s.id] ? '▾' : '▸'}</span>
                    </button>
                  </div>
                  {open[s.id] && (
                    <div className="border-t border-gray-100 px-3 py-2 bg-gray-50">
                      {s.detail.length === 0 ? (
                        <p className="text-xs text-gray-400">(nothing drafted)</p>
                      ) : (
                        <ul className="text-xs text-gray-700 space-y-0.5 list-disc pl-4">
                          {s.detail.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      )}
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
        <Button size="sm" disabled={busy} onClick={() => onApply(tickedIds)}>
          {busy ? 'Applying…' : `Confirm & apply to RFQ (${tickedIds.length} section${tickedIds.length === 1 ? '' : 's'})`}
        </Button>
      )}
    </div>
  );
}
