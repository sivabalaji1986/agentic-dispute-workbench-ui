import { createComponentImplementation } from '@a2ui/react/v0_9';
import { TaskCreatedCardApi } from './schemas';

export const TaskCreatedCard = createComponentImplementation(TaskCreatedCardApi, ({ props }) => {
  return (
    <div className="rounded-[var(--radius-card)] border border-ledger-line border-l-4 border-l-committed bg-panel p-5 shadow-card">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-committed">
        Committed
      </p>
      <h3 className="mt-1 font-display text-2xl font-medium leading-tight text-ink">
        Task created
      </h3>
      <dl className="mt-3 space-y-1 border-t border-ledger-line pt-3 text-sm">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-ink/50">Task ID</dt>
          <dd className="font-mono text-ink">{props.taskId}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-ink/50">Case status</dt>
          <dd className="text-ink">{props.caseStatus}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-ink/50">Audit entry</dt>
          <dd className="text-ink">{props.auditEntry}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-ink/50">Next owner</dt>
          <dd className="text-ink">{props.nextOwner}</dd>
        </div>
      </dl>
    </div>
  );
});
