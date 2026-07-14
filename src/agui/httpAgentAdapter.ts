import { HttpAgent, type AgentSubscriber } from '@ag-ui/client';
import type { AguiLikeAgent } from './types';

/**
 * Wraps @ag-ui/client's HttpAgent to satisfy AguiLikeAgent exactly, so no
 * `as unknown as` cast is needed anywhere else in the app. Pinned against
 * @ag-ui/client 0.0.57 (see package.json) — if that version's HttpAgent
 * shape changes, this is the one file that needs to change.
 */
export class HttpAgentAdapter implements AguiLikeAgent {
  private readonly delegate: HttpAgent;

  constructor(params: { url: string; threadId: string }) {
    this.delegate = new HttpAgent(params);
  }

  get threadId(): string {
    return this.delegate.threadId;
  }

  subscribe(subscriber: AgentSubscriber): { unsubscribe: () => void } {
    return this.delegate.subscribe(subscriber);
  }

  runAgent(params?: { forwardedProps?: unknown }): Promise<unknown> {
    return this.delegate.runAgent(params);
  }

  abortRun(): void {
    this.delegate.abortRun();
  }
}
