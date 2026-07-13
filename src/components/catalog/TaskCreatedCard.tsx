import { createComponentImplementation } from '@a2ui/react/v0_9';
import { TaskCreatedCardApi } from './schemas';

export const TaskCreatedCard = createComponentImplementation(TaskCreatedCardApi, ({ props }) => {
  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg">
          ✅
        </span>
        <h3 className="text-base font-semibold text-emerald-900">Task created</h3>
      </div>
      <dl className="mt-3 space-y-1 text-sm text-slate-700">
        <div className="flex gap-2">
          <dt className="font-medium">Task ID</dt>
          <dd>{props.taskId}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Case status</dt>
          <dd>{props.caseStatus}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Audit entry</dt>
          <dd>{props.auditEntry}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Next owner</dt>
          <dd>{props.nextOwner}</dd>
        </div>
      </dl>
    </div>
  );
});
