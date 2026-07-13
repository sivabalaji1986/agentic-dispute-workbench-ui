import { createComponentImplementation } from '@a2ui/react/v0_9';
import { EvidenceChecklistApi } from './schemas';

export const EvidenceChecklist = createComponentImplementation(
  EvidenceChecklistApi,
  ({ props }) => {
    return (
      <ul className="space-y-1.5 border-t border-ledger-line pt-3">
        {props.items.map((item, index) => (
          <li key={index} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`w-3 font-mono ${item.present ? 'text-committed' : 'text-ink/30'}`}
            >
              {item.present ? '✓' : '·'}
            </span>
            <span
              className={
                item.present
                  ? 'text-ink'
                  : 'text-ink/45 underline decoration-dotted decoration-ink/30 underline-offset-4'
              }
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    );
  },
);
