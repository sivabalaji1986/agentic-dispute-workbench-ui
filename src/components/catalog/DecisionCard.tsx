import { createComponentImplementation } from '@a2ui/react/v0_9';
import { DecisionCardApi } from './schemas';

export const DecisionCard = createComponentImplementation(
  DecisionCardApi,
  ({ props, buildChild }) => {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {props.disputeType}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">{props.status}</h3>
        <p className="mt-2 text-sm text-slate-600">{props.evidenceReadiness}</p>
        <p className="mt-3 text-sm font-medium text-blue-700">
          Recommended: {props.recommendedAction}
        </p>
        {props.checklistId && <div className="mt-4">{buildChild(props.checklistId)}</div>}
        {props.actionsId && <div className="mt-4">{buildChild(props.actionsId)}</div>}
      </div>
    );
  },
);
