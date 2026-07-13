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
    <section className="flex h-full flex-col gap-4 bg-paper p-4">
      <h2 className="border-b border-ledger-line pb-2 font-display text-xs font-medium uppercase tracking-[0.14em] text-ink/70">
        Decision panel
      </h2>
      {surface ? (
        <A2uiSurface surface={surface} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <DocumentOutline />
          <p className="text-sm text-ink/40">No decision yet — review a dispute to begin.</p>
        </div>
      )}
    </section>
  );
}

function DocumentOutline() {
  return (
    <svg
      aria-hidden
      width="64"
      height="80"
      viewBox="0 0 64 80"
      className="text-ink/15"
    >
      <rect x="1" y="1" width="62" height="78" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="20" x2="52" y2="20" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="32" x2="52" y2="32" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="44" x2="40" y2="44" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="60" x2="34" y2="60" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
