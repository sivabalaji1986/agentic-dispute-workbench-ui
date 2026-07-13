import { useState } from 'react';
import { createBinderlessComponentImplementation } from '@a2ui/react/v0_9';
import { NextActionsApi } from './schemas';

interface NextActionItem {
  id: string;
  label: string;
}

// Action ids with no backend continuation in the demo script. Clicking these
// must never dispatch — same client-side-interception pattern as ApprovalPreview's
// Edit button — otherwise MockAgent's runFor() has nothing to route them to and
// falls back to replaying the review run, which is exactly the bug this guards
// against.
const OUT_OF_SCOPE_LABELS: Record<string, string> = {
  escalate_to_reviewer: 'Escalate to Reviewer',
  save_case_note: 'Save Case Note',
};

export const NextActions = createBinderlessComponentImplementation(
  NextActionsApi,
  ({ context }) => {
    const { actions } = context.componentModel.properties as { actions: NextActionItem[] };
    const [scopeNotice, setScopeNotice] = useState<string | null>(null);

    return (
      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {actions.map((action) => {
          const outOfScopeLabel = OUT_OF_SCOPE_LABELS[action.id];
          return (
            <button
              key={action.id}
              type="button"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              onClick={() => {
                if (outOfScopeLabel) {
                  setScopeNotice(`${outOfScopeLabel} is not in demo scope`);
                  return;
                }
                void context.dispatchAction({ event: { name: action.id, context: {} } });
              }}
            >
              {action.label}
            </button>
          );
        })}
        {scopeNotice && <p className="basis-full text-xs text-slate-500">{scopeNotice}</p>}
      </div>
    );
  },
);
