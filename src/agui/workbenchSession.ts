import { MessageProcessor } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { MockAgent } from '../mock/mockAgent';
import { HttpAgentAdapter } from './httpAgentAdapter';
import { createWorkbenchAgentSubscriber } from './bridge';
import { useWorkbenchStore } from '../state/workbenchStore';
import { disputeCatalog } from '../components/catalog/catalogInstance';
import { validateForwardedAction, logValidationFailure } from './validation';
import type { AguiLikeAgent } from './types';

const isMock = import.meta.env.VITE_MOCK !== 'false';
const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL ?? 'http://localhost:8080/agui';

function defaultAgentFactory(threadId: string): AguiLikeAgent {
  return isMock ? new MockAgent() : new HttpAgentAdapter({ url: orchestratorUrl, threadId });
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
  private lastDispatchedActionId: string | undefined;

  constructor(threadId: string, opts: { agentFactory?: () => AguiLikeAgent } = {}) {
    this.threadId = threadId;
    this.processor = new MessageProcessor<ReactComponentImplementation>([disputeCatalog]);
    this.createAgent = opts.agentFactory ?? (() => defaultAgentFactory(threadId));
    this.agent = this.createAgent();
  }

  private subscribeAgent(): void {
    // logValidationFailure only logs; createWorkbenchAgentSubscriber's own
    // reportProtocolError (bridge.ts) is the single place that writes
    // WorkbenchError into the store, so there is exactly one owner of that
    // classification logic rather than two copies to keep in sync.
    const subscriber = createWorkbenchAgentSubscriber(
      this.processor,
      logValidationFailure,
      () => this.lastDispatchedActionId,
    );
    this.agentSubscription = this.agent.subscribe(subscriber);
  }

  start(): void {
    useWorkbenchStore.getState().setProcessor(this.processor);
    this.subscribeAgent();
    this.actionSubscription = this.processor.model.onAction.subscribe((action) => {
      const validated = validateForwardedAction(action);
      if (!validated.success) {
        logValidationFailure(validated.failure);
        return;
      }
      this.dispatchAction(validated.data);
    });
    this.runInitial();
  }

  /**
   * Issues the initial (non-forwarded) runAgent({}) call shared by start()
   * and reconnect(): resets lastDispatchedActionId so a stale action from a
   * prior run can't leak into this run's status derivation, and surfaces a
   * 'backend_unreachable' transport error (with a 'failed' connection
   * status) if the backend never responds.
   */
  private runInitial(): void {
    this.lastDispatchedActionId = undefined;
    this.agent.runAgent({}).catch((error: Error) => {
      useWorkbenchStore.getState().setTransportError({
        code: 'backend_unreachable',
        title: 'Could not reach the orchestrator',
        message: error.message || 'The backend did not respond to the initial request.',
        retryable: true,
      });
      useWorkbenchStore.getState().setConnectionStatus('failed');
    });
  }

  dispatchAction(a2uiAction: unknown): void {
    this.lastDispatchedActionId =
      typeof a2uiAction === 'object' && a2uiAction !== null && 'name' in a2uiAction
        ? String((a2uiAction as { name: unknown }).name)
        : undefined;
    void this.agent.runAgent({ forwardedProps: { a2uiAction } });
  }

  reconnect(): void {
    this.agentSubscription?.unsubscribe();
    this.agent = this.createAgent();
    this.subscribeAgent();
    useWorkbenchStore.getState().setConnectionStatus('connecting');
    this.runInitial();
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
