import { useEffect, useRef, useState } from 'react';
import { useWorkbenchStore } from '../state/workbenchStore';
import type { AgentSource } from '../agui/events';
import { reconnect } from '../agui/client';

const SOURCE_STYLES: Record<AgentSource, string> = {
  orchestrator: 'bg-slate-700 text-white',
  'case-review': 'bg-blue-600 text-white',
  policy: 'bg-purple-600 text-white',
};

const SOURCE_LABELS: Record<AgentSource, string> = {
  orchestrator: 'Orchestrator',
  'case-review': 'Case Review Agent',
  policy: 'Policy Agent',
};

export function LiveProgressPanel() {
  const progressLines = useWorkbenchStore((state) => state.progressLines);
  const connectionStatus = useWorkbenchStore((state) => state.connectionStatus);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [progressLines, paused]);

  return (
    <section className="flex h-full flex-col border-r border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Live agent progress
        </h2>
        <span className="text-xs font-medium text-slate-500">{statusLabel(connectionStatus)}</span>
      </div>
      {connectionStatus === 'disconnected' && (
        <button
          type="button"
          className="mb-2 self-start rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
          onClick={reconnect}
        >
          Reconnect
        </button>
      )}
      <div
        ref={containerRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="flex-1 space-y-1.5 overflow-y-auto"
      >
        {progressLines.map((line) => (
          <div key={line.id} className="flex items-start gap-2 text-sm">
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${SOURCE_STYLES[line.source]}`}
            >
              {SOURCE_LABELS[line.source]}
            </span>
            <span className="text-slate-700">{line.text}</span>
            <span className="ml-auto shrink-0 text-xs text-slate-400">
              {new Date(line.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'connecting':
      return 'Connecting…';
    case 'streaming':
      return 'Streaming';
    case 'finished':
      return 'Finished';
    default:
      return 'Disconnected';
  }
}
