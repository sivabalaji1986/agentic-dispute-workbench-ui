import { createBinderlessComponentImplementation } from '@a2ui/react/v0_9';
import { NextActionsApi } from './schemas';

interface NextActionItem {
  id: string;
  label: string;
}

export const NextActions = createBinderlessComponentImplementation(
  NextActionsApi,
  ({ context }) => {
    const { actions } = context.componentModel.properties as { actions: NextActionItem[] };

    return (
      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => {
              void context.dispatchAction({ event: { name: action.id, context: {} } });
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    );
  },
);
