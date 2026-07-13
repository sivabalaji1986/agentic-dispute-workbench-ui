import { useState } from 'react';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { ApprovalPreviewApi } from './schemas';

export const ApprovalPreview = createComponentImplementation(ApprovalPreviewApi, ({ props }) => {
  const [showEditNotice, setShowEditNotice] = useState(false);
  return (
    <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg">
          ⚠️
        </span>
        <h3 className="text-base font-semibold text-amber-900">
          Approval required — nothing written yet
        </h3>
      </div>
      <dl className="mt-3 space-y-1 text-sm text-slate-700">
        <div className="flex gap-2">
          <dt className="font-medium">Case</dt>
          <dd>{props.caseId}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">New status</dt>
          <dd>{props.newCaseStatus}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">On approval</dt>
          <dd>{props.actionAfterApproval}</dd>
        </div>
      </dl>
      {props.missingItems.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
          {props.missingItems.map((item: string, index: number) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          onClick={props.onApprove}
        >
          Approve Task Creation
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => setShowEditNotice(true)}
        >
          Edit
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
      {showEditNotice && (
        <p className="mt-2 text-xs text-amber-700">Edit flow not in demo scope</p>
      )}
    </div>
  );
});
