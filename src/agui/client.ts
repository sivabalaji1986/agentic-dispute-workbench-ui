import { HttpAgent, type AgentSubscriber } from '@ag-ui/client';
import { MockAgent } from '../mock/mockAgent';
import { workbenchAgentSubscriber, resetBridgeState } from './bridge';
import { useWorkbenchStore } from '../state/workbenchStore';

const isMock = import.meta.env.VITE_MOCK !== 'false';
const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL ?? 'http://localhost:8080/agui';

export type AguiLikeAgent = {
  threadId: string;
  subscribe(subscriber: AgentSubscriber): { unsubscribe: () => void };
  runAgent(params?: { forwardedProps?: unknown }): Promise<unknown>;
  abortRun(): void;
};

let agent: AguiLikeAgent | null = null;
let currentThreadId: string | null = null;

// The processor is a single, stable instance for the app's lifetime (one case
// per page load), so its action listener is wired exactly once here rather
// than per-run. Every A2UI button click becomes a new AG-UI run on the same
// threadId, per design doc §3.4.
useWorkbenchStore.getState().processor.model.onAction.subscribe((action) => {
  void agent?.runAgent({ forwardedProps: { a2uiAction: action } });
});

function createAgent(threadId: string): AguiLikeAgent {
  return isMock
    ? new MockAgent()
    : (new HttpAgent({ url: orchestratorUrl, threadId }) as unknown as AguiLikeAgent);
}

export function startDemoCase(disputeText: string): void {
  const caseId = 'D-10291';
  currentThreadId = `thread-${caseId}-${Date.now()}`;

  resetBridgeState();
  useWorkbenchStore.getState().startCase({ caseId, threadId: currentThreadId, disputeText });

  agent = createAgent(currentThreadId);
  agent.subscribe(workbenchAgentSubscriber);
  void agent.runAgent({});
}

export function reconnect(): void {
  if (!currentThreadId) return;
  agent = createAgent(currentThreadId);
  agent.subscribe(workbenchAgentSubscriber);
  useWorkbenchStore.getState().setConnectionStatus('connecting');
  void agent.runAgent({});
}
