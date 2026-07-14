import { HttpAgent } from '@ag-ui/client';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { MockAgent } from '../mock/mockAgent';
import { createWorkbenchAgentSubscriber } from './bridge';
import { useWorkbenchStore } from '../state/workbenchStore';
import { disputeCatalog } from '../components/catalog/catalogInstance';
import { validateForwardedAction, logValidationFailure } from './validation';
import type { AguiLikeAgent } from './types';

const isMock = import.meta.env.VITE_MOCK !== 'false';
const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL ?? 'http://localhost:8080/agui';

function defaultAgentFactory(threadId: string): AguiLikeAgent {
  return isMock
    ? new MockAgent()
    : (new HttpAgent({ url: orchestratorUrl, threadId }) as unknown as AguiLikeAgent);
}

/**
 * Owns everything a single case session needs: the agent handle, the
 * threadId, a dedicated MessageProcessor + its subscription, and the AG-UI
 * subscription. A fresh session is created per "Review Dispute" click
 * (see client.ts) so nothing from a prior case can leak into the next one.
 */
export class WorkbenchSession {
  readonly threadId: string;
  private readonly processor: MessageProcessor<ReactComponentImplementation>;
  private agent: AguiLikeAgent;
  private agentSubscription: { unsubscribe: () => void } | null = null;
  private actionSubscription: { unsubscribe: () => void } | null = null;
  private readonly createAgent: () => AguiLikeAgent;

  constructor(threadId: string, opts: { agentFactory?: () => AguiLikeAgent } = {}) {
    this.threadId = threadId;
    this.processor = new MessageProcessor<ReactComponentImplementation>([disputeCatalog]);
    this.createAgent = opts.agentFactory ?? (() => defaultAgentFactory(threadId));
    this.agent = this.createAgent();
  }

  start(): void {
    useWorkbenchStore.getState().setProcessor(this.processor);
    const subscriber = createWorkbenchAgentSubscriber(this.processor);
    this.agentSubscription = this.agent.subscribe(subscriber);
    this.actionSubscription = this.processor.model.onAction.subscribe((action) => {
      const validated = validateForwardedAction(action);
      if (!validated.success) {
        logValidationFailure(validated.failure);
        return;
      }
      this.dispatchAction(validated.data);
    });
    void this.agent.runAgent({});
  }

  dispatchAction(a2uiAction: unknown): void {
    void this.agent.runAgent({ forwardedProps: { a2uiAction } });
  }

  reconnect(): void {
    this.agentSubscription?.unsubscribe();
    this.agent = this.createAgent();
    const subscriber = createWorkbenchAgentSubscriber(this.processor);
    this.agentSubscription = this.agent.subscribe(subscriber);
    useWorkbenchStore.getState().setConnectionStatus('connecting');
    void this.agent.runAgent({});
  }

  abort(): void {
    this.agent.abortRun();
  }

  dispose(): void {
    this.agentSubscription?.unsubscribe();
    this.agentSubscription = null;
    this.actionSubscription?.unsubscribe();
    this.actionSubscription = null;
  }
}
