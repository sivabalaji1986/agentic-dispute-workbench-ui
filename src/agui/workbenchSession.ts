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

type RunInput = { forwardedProps?: { a2uiAction: unknown } };

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
  // The single source of truth for "what was the last thing we asked the
  // agent to do" — both the status-derivation table (via the getter below)
  // and retry() (B3) read this instead of maintaining a separate field.
  private lastRunInput: RunInput = {};

  constructor(threadId: string, opts: { agentFactory?: () => AguiLikeAgent } = {}) {
    this.threadId = threadId;
    this.processor = new MessageProcessor<ReactComponentImplementation>([disputeCatalog]);
    this.createAgent = opts.agentFactory ?? (() => defaultAgentFactory(threadId));
    this.agent = this.createAgent();
  }

  private get lastDispatchedActionId(): string | undefined {
    const action = this.lastRunInput.forwardedProps?.a2uiAction;
    return typeof action === 'object' && action !== null && 'name' in action
      ? String((action as { name: unknown }).name)
      : undefined;
  }

  private subscribeAgent(): void {
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
    this.issueRun({});
  }

  /**
   * Sends one AG-UI run and remembers its input so a later retry() (B3) can
   * re-issue the SAME operation instead of restarting the case. Any
   * rejection (B1) becomes a retryable WorkbenchError, never an unhandled
   * promise rejection.
   */
  private issueRun(input: RunInput): void {
    this.lastRunInput = input;
    this.agent.runAgent(input).catch((error: Error) => {
      useWorkbenchStore.getState().setTransportError({
        code: 'TRANSPORT',
        title: input.forwardedProps ? 'Action failed' : 'Could not reach the orchestrator',
        message: error.message || 'The request could not be completed.',
        retryable: true,
      });
      useWorkbenchStore.getState().setConnectionStatus('failed');
    });
  }

  dispatchAction(a2uiAction: unknown): void {
    this.issueRun({ forwardedProps: { a2uiAction } });
  }

  /**
   * Re-issues the last runAgent input (review, preview, approval, or
   * cancel) on the SAME threadId with a fresh agent/subscription — never a
   * new review, per B3. Since lastRunInput defaults to {} until an action
   * is dispatched, retrying before any action was ever sent correctly
   * re-runs the review.
   *
   * Aborts the outgoing agent's in-flight run FIRST, before replacing it —
   * same ordering as dispose() (B5). With a real HttpAgent/SSE connection,
   * the old request can still be executing after the UI has moved on; on
   * approval specifically, an unaborted old request plus the retry both
   * reaching the backend would rely entirely on server-side idempotency
   * (§3.3 item 4) to avoid a double-write. Aborting here removes that
   * reliance rather than depending on it.
   */
  retry(): void {
    this.agent.abortRun();
    this.agentSubscription?.unsubscribe();
    this.agent = this.createAgent();
    this.subscribeAgent();
    useWorkbenchStore.getState().setConnectionStatus('connecting');
    this.issueRun(this.lastRunInput);
  }

  abort(): void {
    this.agent.abortRun();
  }

  dispose(): void {
    // B5: abort whatever's in flight before tearing down subscriptions, so
    // a stray late event from an about-to-be-replaced agent can't sneak
    // through in the gap between "still subscribed" and "unsubscribed."
    this.agent.abortRun();
    this.agentSubscription?.unsubscribe();
    this.agentSubscription = null;
    this.actionSubscription?.unsubscribe();
    this.actionSubscription = null;
  }
}
