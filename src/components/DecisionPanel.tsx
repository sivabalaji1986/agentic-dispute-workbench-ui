import { useEffect, useState } from 'react';
import type { SurfaceModel } from '@a2ui/web_core/v0_9';
import { A2uiSurface, type ReactComponentImplementation } from '@a2ui/react/v0_9';
import { useWorkbenchStore } from '../state/workbenchStore';

export function DecisionPanel() {
  const processor = useWorkbenchStore((state) => state.processor);
  const [surface, setSurface] = useState<SurfaceModel<ReactComponentImplementation> | undefined>(
    () => processor.model.surfacesMap.values().next().value,
  );

  useEffect(() => {
    const createdSub = processor.onSurfaceCreated((created) => setSurface(created));
    const deletedSub = processor.onSurfaceDeleted(() => setSurface(undefined));
    return () => {
      createdSub.unsubscribe();
      deletedSub.unsubscribe();
    };
  }, [processor]);

  return (
    <section className="flex h-full flex-col gap-3 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Decision panel
      </h2>
      {surface ? (
        <A2uiSurface surface={surface} />
      ) : (
        <p className="text-sm text-slate-400">Awaiting decision from the orchestrator…</p>
      )}
    </section>
  );
}
