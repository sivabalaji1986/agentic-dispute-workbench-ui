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

// Approve Task Creation is the one solid button in the whole app (see
// ApprovalPreview) — every button here stays quiet so that stays true.
const PRIMARY_ACTION_ID = 'create_evidence_request_task';

export const NextActions = createBinderlessComponentImplementation(
  NextActionsApi,
  ({ context }) => {
    const { actions } = context.componentModel.properties as { actions: NextActionItem[] };
    const [scopeNotice, setScopeNotice] = useState<string | null>(null);

    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ledger-line pt-3">
        {actions.map((action) => {
          const outOfScopeLabel = OUT_OF_SCOPE_LABELS[action.id];
          const isPrimary = action.id === PRIMARY_ACTION_ID;
          return (
            <button
              key={action.id}
              type="button"
              className={
                isPrimary
                  ? 'rounded-[var(--radius-card)] border border-ink px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-paper'
                  : 'text-sm text-ink/60 underline decoration-ink/25 underline-offset-2 hover:text-ink hover:decoration-ink/50'
              }
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
        {scopeNotice && <p className="basis-full text-xs text-ink/45">{scopeNotice}</p>}
      </div>
    );
  },
);
