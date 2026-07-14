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

/**
 * Re-issues the last failed operation on the same case (B3) — not a fresh
 * review. Falls back to starting a new case with the last submitted dispute
 * text only if no session exists at all, which the failed-state UI can't
 * actually reach today (it only renders once a session's connectionStatus
 * is 'failed', which requires a session to have started) — kept as a
 * defensive fallback rather than an assumption.
 */
export function retry(): void {
  if (currentSession) {
    currentSession.retry();
    return;
  }
  startDemoCase(useWorkbenchStore.getState().disputeText);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    currentSession?.dispose();
  });
}
