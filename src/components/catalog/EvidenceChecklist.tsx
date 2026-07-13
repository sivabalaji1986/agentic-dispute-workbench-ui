import { createComponentImplementation } from '@a2ui/react/v0_9';
import { EvidenceChecklistApi } from './schemas';

export const EvidenceChecklist = createComponentImplementation(
  EvidenceChecklistApi,
  ({ props }) => {
    return (
      <ul className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {props.items.map((item, index) => (
          <li key={index} className="flex items-center gap-2 py-1 text-sm">
            <span
              aria-hidden
              className={
                item.present
                  ? 'inline-flex h-4 w-4 items-center justify-center rounded-sm bg-emerald-600 text-xs text-white'
                  : 'inline-flex h-4 w-4 items-center justify-center rounded-sm border border-slate-300 text-xs'
              }
            >
              {item.present ? '✓' : ''}
            </span>
            <span className={item.present ? 'text-slate-900' : 'text-slate-500'}>{item.label}</span>
          </li>
        ))}
      </ul>
    );
  },
);
