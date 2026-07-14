import { useWorkbenchStore } from '../state/workbenchStore';

const isMock = import.meta.env.VITE_MOCK !== 'false';

export function ModeBadge() {
  const connectionStatus = useWorkbenchStore((state) => state.connectionStatus);
  // Hidden only while a connection attempt is in flight, to avoid a flash of
  // mode text right before the timeline takes over; visible at rest (idle,
  // before any case is started) and throughout the run.
  if (connectionStatus === 'connecting') return null;

  return (
    <div className="fixed bottom-3 right-3 rounded-[var(--radius-card)] border border-ledger-line bg-panel px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink/40 shadow-card">
      {isMock ? 'Demo mode — scripted agent events' : 'Live — orchestrator connected'}
    </div>
  );
}
