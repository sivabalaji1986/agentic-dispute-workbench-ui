import { useWorkbenchStore } from '../state/workbenchStore';
import { WorkbenchSession } from './workbenchSession';

let currentSession: WorkbenchSession | null = null;

export function startDemoCase(disputeText: string): void {
  const caseId = 'D-10291';
  const threadId = `thread-${caseId}-${Date.now()}`;

  currentSession?.dispose();
  useWorkbenchStore.getState().startCase({ caseId, threadId, disputeText });

  currentSession = new WorkbenchSession(threadId);
  currentSession.start();
}

export function reconnect(): void {
  currentSession?.reconnect();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    currentSession?.dispose();
  });
}
