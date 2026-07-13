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
    <section className="flex h-full flex-col gap-3 border-r border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Case intake</h2>
      <textarea
        className="min-h-32 flex-1 resize-none rounded-md border border-slate-300 p-2 text-sm"
        value={disputeText}
        onChange={(event) => setDisputeText(event.target.value)}
        disabled={busy}
      />
      <button
        type="button"
        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={busy}
        onClick={() => startDemoCase(disputeText)}
      >
        Review Dispute
      </button>
      {caseId && <p className="text-xs text-slate-500">Case {caseId}</p>}
    </section>
  );
}
