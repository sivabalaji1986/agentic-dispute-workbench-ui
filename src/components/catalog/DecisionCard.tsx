import { createComponentImplementation } from '@a2ui/react/v0_9';
import { DecisionCardApi } from './schemas';

// Presentational only: the backend already computed readiness (e.g. "2 of 4
// required items present") — this just extracts the two numbers already in
// that string to draw a segment bar. If the string doesn't match the
// "N of M" shape, the bar is simply omitted; the raw text still renders.
function parseReadiness(text: string): { count: number; total: number } | null {
  const match = /(\d+)\D+(\d+)/.exec(text);
  if (!match) return null;
  return { count: Number(match[1]), total: Number(match[2]) };
}

export const DecisionCard = createComponentImplementation(
  DecisionCardApi,
  ({ props, buildChild }) => {
    const readiness = parseReadiness(props.evidenceReadiness);

    return (
      <div className="rounded-[var(--radius-card)] border border-ledger-line bg-panel p-5 shadow-card">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink/50">
          {props.disputeType}
        </p>
        <h3 className="mt-1 font-display text-2xl font-medium leading-tight text-ink">
          {props.status}
        </h3>

        <div className="mt-3 flex items-center gap-3">
          {readiness && (
            <div className="flex shrink-0 gap-0.5" aria-hidden>
              {Array.from({ length: readiness.total }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-5 ${i < readiness.count ? 'bg-ink' : 'bg-ledger-line'}`}
                />
              ))}
            </div>
          )}
          <p className="font-mono text-xs text-ink/60">{props.evidenceReadiness}</p>
        </div>

        <p className="mt-3 border-t border-ledger-line pt-3 text-sm text-ink">
          <span className="text-ink/50">Recommended —</span> {props.recommendedAction}
        </p>

        {props.checklistId && <div className="mt-4">{buildChild(props.checklistId)}</div>}
        {props.actionsId && <div className="mt-4">{buildChild(props.actionsId)}</div>}
      </div>
    );
  },
);
