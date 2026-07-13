import { createBinderlessComponentImplementation } from '@a2ui/react/v0_9';
import { UnknownComponentFallbackApi } from './schemas';

export const UnknownComponentFallback = createBinderlessComponentImplementation(
  UnknownComponentFallbackApi,
  ({ context }) => {
    const { originalType, raw } = context.componentModel.properties as {
      originalType: string;
      raw: string;
    };
    let pretty = raw;
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      // raw wasn't valid JSON; fall back to showing it verbatim.
    }
    return (
      <div className="rounded border-2 border-dashed border-amber-500 bg-amber-50 p-3 text-xs text-amber-900">
        <p className="font-semibold">Unknown component: {originalType}</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{pretty}</pre>
      </div>
    );
  },
);
