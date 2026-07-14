import { useState } from 'react';
import { useWorkbenchStore } from '../state/workbenchStore';
import { startDemoCase } from '../agui/client';

const DEFAULT_DISPUTE_TEXT =
  'I paid SGD 250 for an item, but I never received it. The merchant says the item was delivered, but I disagree.';

export function CaseIntakePanel() {
  const [disputeText, setDisputeText] = useState(DEFAULT_DISPUTE_TEXT);
  const caseId = useWorkbenchStore((state) => state.caseId);
  const connectionStatus = useWorkbenchStore((state) => state.connectionStatus);
  const busy = connectionStatus === 'connecting' || connectionStatus === 'streaming';

  return (
    <section className="flex h-full flex-col gap-3 border-b border-ledger-line bg-panel p-4 xl:border-b-0 xl:border-r">
      <div className="flex items-baseline justify-between border-b border-ledger-line pb-2">
        <h2 className="font-display text-xs font-medium uppercase tracking-[0.14em] text-ink/70">
          Case intake
        </h2>
        {caseId && <p className="font-mono text-[11px] text-ink/45">{caseId}</p>}
      </div>
      <label htmlFor="dispute-text" className="sr-only">
        Customer dispute description
      </label>
      <textarea
        id="dispute-text"
        aria-label="Customer dispute description"
        className="min-h-28 flex-1 resize-none rounded-[var(--radius-card)] border border-ledger-line bg-paper p-2.5 text-sm text-ink placeholder:text-ink/35"
        value={disputeText}
        onChange={(event) => setDisputeText(event.target.value)}
        disabled={busy}
      />
      <button
        type="button"
        className={
          caseId
            ? // A session already exists: Approve is the one solid button while a
              // decision is in flight, so re-submitting stays quiet.
              'rounded-[var(--radius-card)] border border-ink px-3 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink'
            : // No session yet: this is the app's only entry point, so it earns
              // the solid treatment — the "one solid button" rule holds within
              // any active session, which is where approval semantics matter.
              'rounded-[var(--radius-card)] bg-ink px-3 py-2 text-sm font-medium text-paper hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-40'
        }
        disabled={busy}
        onClick={() => startDemoCase(disputeText)}
      >
        Review Dispute
      </button>
    </section>
  );
}
