import type { AgentSubscriber } from '@ag-ui/client';

export type AguiLikeAgent = {
  threadId: string;
  subscribe(subscriber: AgentSubscriber): { unsubscribe: () => void };
  runAgent(params?: { forwardedProps?: unknown }): Promise<unknown>;
  abortRun(): void;
};
