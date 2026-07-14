import { useState } from 'react';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { ApprovalPreviewApi } from './schemas';

export const ApprovalPreview = createComponentImplementation(ApprovalPreviewApi, ({ props }) => {
  const [showEditNotice, setShowEditNotice] = useState(false);
  return (
    <div className="rounded-[var(--radius-card)] border border-ledger-line border-l-4 border-l-pending bg-panel p-5 shadow-card">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-pending">
        Pending — nothing has been written
      </p>
      <h3 className="mt-1 font-display text-2xl font-medium leading-tight text-ink">
        Approval required
      </h3>

      <dl className="mt-3 space-y-1 border-t border-ledger-line pt-3 text-sm">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-ink/50">Case</dt>
          <dd className="font-mono text-ink">{props.caseId}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-ink/50">New status</dt>
          <dd className="text-ink">{props.newCaseStatus}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-ink/50">On approval</dt>
          <dd className="text-ink">{props.actionAfterApproval}</dd>
        </div>
      </dl>

      {props.missingItems.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {props.missingItems.map((item: string, index: number) => (
            <li key={index} className="flex items-center gap-2">
              <span aria-hidden className="w-3 font-mono text-ink/30">
                ·
              </span>
              <span className="text-ink/70">{item}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          className="rounded-[var(--radius-card)] bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/85"
          onClick={props.onApprove}
        >
          Approve Task Creation
        </button>
        <button
          type="button"
          className="text-sm text-ink/60 underline decoration-ink/25 underline-offset-2 hover:text-ink hover:decoration-ink/50"
          onClick={() => setShowEditNotice(true)}
        >
          Edit
        </button>
        <button
          type="button"
          className="text-sm text-ink/60 underline decoration-ink/25 underline-offset-2 hover:text-ink hover:decoration-ink/50"
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
      {showEditNotice && <p className="mt-2 text-xs text-ink/45">Edit flow not in demo scope</p>}
    </div>
  );
});
