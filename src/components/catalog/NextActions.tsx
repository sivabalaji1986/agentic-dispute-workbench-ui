import { useState } from 'react';
import { createBinderlessComponentImplementation } from '@a2ui/react/v0_9';
import { NextActionsApi } from './schemas';
import { isDispatchableActionId } from '../../agui/actionIds';

interface NextActionItem {
  id: string;
  label: string;
}

const OUT_OF_SCOPE_LABELS: Record<string, string> = {
  escalate_to_reviewer: 'Escalate to Reviewer',
  save_case_note: 'Save Case Note',
};

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
          const dispatchable = isDispatchableActionId(action.id);

          if (!dispatchable) {
            return (
              <button
                key={action.id}
                type="button"
                disabled
                title="Unknown action — not dispatchable"
                className="cursor-not-allowed text-sm text-ink/30 underline decoration-ink/15 underline-offset-2"
              >
                {action.label}
              </button>
            );
          }

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
