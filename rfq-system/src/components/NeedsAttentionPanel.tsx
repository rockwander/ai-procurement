'use client';

import { useState } from 'react';
import type { AttentionList, AttentionItem } from '@/lib/line-response-status';

const GROUP_LABEL: Record<AttentionItem['group'], string> = {
  'line-items': 'Line items',
  commercial: 'Commercial information',
  questionnaire: 'Quality questionnaire',
};

function shorten(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

/**
 * Persistent banner of mandatory fields with no value. Collapsed by default to
 * a count + "next" jump; expands to the full grouped list. Clicking an entry
 * scrolls the preview to that field and sets it as the chat context. Submit
 * stays blocked while this is non-empty.
 */
export function NeedsAttentionPanel({
  list,
  onJump,
}: {
  list: AttentionList;
  onJump: (item: AttentionItem) => void;
}) {
  const [open, setOpen] = useState(false);

  if (list.total === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        ✓ Everything mandatory is filled — you can submit.
      </div>
    );
  }

  const groups = (['line-items', 'commercial', 'questionnaire'] as const).filter(
    (g) => list.byGroup[g] > 0
  );

  return (
    <div className="rounded-lg border border-red-200 bg-red-50">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-red-600" aria-hidden>⚠</span>
        <p className="text-sm font-semibold text-red-800 flex-1">
          {list.total} {list.total === 1 ? 'item needs' : 'items need'} your input
        </p>
        <button
          type="button"
          onClick={() => onJump(list.items[0])}
          className="text-xs font-medium text-red-700 hover:text-red-900 underline"
        >
          Go to first
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-red-600 hover:text-red-900"
          aria-expanded={open}
        >
          {open ? 'Hide list ▲' : 'Show list ▼'}
        </button>
      </div>

      {open && (
        <div className="px-3 pb-2 pt-0 space-y-2 max-h-52 overflow-y-auto border-t border-red-200">
          {groups.map((g) => (
            <div key={g} className="pt-2">
              <p className="text-[11px] uppercase tracking-wide text-red-500 mb-1">
                {GROUP_LABEL[g]} ({list.byGroup[g]})
              </p>
              <ul className="space-y-0.5">
                {list.items
                  .filter((it) => it.group === g)
                  .map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => onJump(it)}
                        className="text-left text-sm text-red-700 hover:text-red-900 hover:underline"
                        title={it.label}
                      >
                        {shorten(it.label)}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
