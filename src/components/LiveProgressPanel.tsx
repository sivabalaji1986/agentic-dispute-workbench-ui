import { useEffect, useRef, useState } from 'react';
import { useWorkbenchStore } from '../state/workbenchStore';
import type { AgentSource } from '../agui/events';
import { reconnect } from '../agui/client';

const MARKER_COLOR: Record<AgentSource, string> = {
  orchestrator: 'bg-orchestrator',
  'case-review': 'bg-case-review',
  policy: 'bg-policy',
};

const TAG_COLOR: Record<AgentSource, string> = {
  orchestrator: 'text-orchestrator',
  'case-review': 'text-case-review',
  policy: 'text-policy',
};

const TAG_LABEL: Record<AgentSource, string> = {
  orchestrator: 'ORCH',
  'case-review': 'CASE REVIEW',
  policy: 'POLICY',
};

export function LiveProgressPanel() {
  const progressLines = useWorkbenchStore((state) => state.progressLines);
  const connectionStatus = useWorkbenchStore((state) => state.connectionStatus);
  const evidenceReadiness = useWorkbenchStore((state) => state.evidenceReadiness);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [progressLines, paused]);

  return (
    <section className="flex h-full flex-col border-r border-ledger-line bg-panel">
      <div className="border-b border-ledger-line px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xs font-medium uppercase tracking-[0.14em] text-ink/70">
            Live agent progress
          </h2>
          {evidenceReadiness && (
            <span className="rounded bg-ledger-line px-1.5 py-0.5 font-mono text-[11px] text-ink/70">
              {evidenceReadiness}
            </span>
          )}
        </div>
        <ConnectionStrip status={connectionStatus} />
      </div>
      <div
        ref={containerRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="relative flex-1 overflow-y-auto px-4 py-3"
      >
        {progressLines.length === 0 ? (
          <p className="pt-2 text-sm text-ink/40">Awaiting case submission.</p>
        ) : (
          <div className="relative">
            <div aria-hidden className="absolute bottom-0 left-[7px] top-0 w-px bg-ledger-line" />
            <div className="space-y-3">
              {progressLines.map((line) => (
                <div
                  key={line.id}
                  data-testid="progress-line"
                  className="relative animate-ledger-in pl-6"
                >
                  <span
                    aria-hidden
                    className={`absolute left-[4px] top-1.5 h-2 w-2 ${MARKER_COLOR[line.source]}`}
                  />
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${TAG_COLOR[line.source]}`}
                    >
                      {TAG_LABEL[line.source]}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink/35">
                      {new Date(line.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm leading-snug text-ink">{line.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ConnectionStrip({ status }: { status: string }) {
  if (status === 'connecting') {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink/50">
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink/50" />
        Connecting…
      </p>
    );
  }
  if (status === 'disconnected') {
    return (
      <div className="mt-1.5 -mx-4 flex items-center justify-between bg-pending-surface px-4 py-1.5 text-xs">
        <span className="text-pending">Disconnected</span>
        <button
          type="button"
          onClick={reconnect}
          className="font-medium text-pending underline decoration-pending/40 underline-offset-2 hover:decoration-pending"
        >
          Reconnect
        </button>
      </div>
    );
  }
  if (status === 'finished') {
    return <p className="mt-1.5 font-mono text-[11px] text-ink/40">Run complete</p>;
  }
  if (status === 'streaming') {
    return <p className="mt-1.5 text-xs text-ink/50">Streaming</p>;
  }
  return null;
}
