'use client';

import type { AttentionList, AttentionItem } from '@/lib/line-response-status';

const GROUP_LABEL: Record<AttentionItem['group'], string> = {
  'line-items': 'Line items',
  commercial: 'Commercial information',
  questionnaire: 'Quality questionnaire',
};

/**
 * The prominent, persistent list of mandatory fields with no value. Clicking an
 * entry scrolls the preview to that field and sets it as the chat context.
 * Submit stays blocked while this is non-empty.
 */
export function NeedsAttentionPanel({
  list,
  onJump,
}: {
  list: AttentionList;
  onJump: (item: AttentionItem) => void;
}) {
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
      <div className="flex items-center gap-2 px-3 py-2 border-b border-red-200">
        <span className="text-red-600" aria-hidden>
          ⚠
        </span>
        <p className="text-sm font-semibold text-red-800">
          {list.total} {list.total === 1 ? 'item needs' : 'items need'} your input
        </p>
      </div>
      <div className="px-3 py-2 space-y-2 max-h-56 overflow-y-auto">
        {groups.map((g) => (
          <div key={g}>
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
                    >
                      {it.label}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
