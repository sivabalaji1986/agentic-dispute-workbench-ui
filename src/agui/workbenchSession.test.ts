import { describe, expect, it, vi } from 'vitest';
import { EventType, type AgentSubscriber } from '@ag-ui/client';
import { WorkbenchSession } from './workbenchSession';
import { useWorkbenchStore } from '../state/workbenchStore';
import type { AguiLikeAgent } from './types';

function fakeAgent(): { agent: AguiLikeAgent; subscribers: AgentSubscriber[] } {
  const subscribers: AgentSubscriber[] = [];
  const agent: AguiLikeAgent = {
    threadId: 'fake-thread',
    subscribe(subscriber) {
      subscribers.push(subscriber);
      return {
        unsubscribe: () => {
          const index = subscribers.indexOf(subscriber);
          if (index >= 0) subscribers.splice(index, 1);
        },
      };
    },
    runAgent: vi.fn().mockResolvedValue({ result: undefined }),
    abortRun: vi.fn(),
  };
  return { agent, subscribers };
}

describe('WorkbenchSession', () => {
  it('gives each session its own MessageProcessor, distinct from the previous session', () => {
    const first = new WorkbenchSession('t-1', { agentFactory: () => fakeAgent().agent });
    first.start();
    const firstProcessor = useWorkbenchStore.getState().processor;

    const second = new WorkbenchSession('t-2', { agentFactory: () => fakeAgent().agent });
    second.start();
    const secondProcessor = useWorkbenchStore.getState().processor;

    expect(secondProcessor).not.toBe(firstProcessor);
  });

  it('dispose() unsubscribes from the agent so a disposed session no longer reacts to events', () => {
    const { agent, subscribers } = fakeAgent();
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.start();
    expect(subscribers).toHaveLength(1);

    session.dispose();
    expect(subscribers).toHaveLength(0);
  });

  it('a disposed session leaves the run-started status change unaffected by later events', () => {
    const { agent, subscribers } = fakeAgent();
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.start();
    useWorkbenchStore.setState({ connectionStatus: 'connecting' });
    session.dispose();

    // Simulate a stray late event arriving after dispose — it must not
    // reach any subscriber, since dispose() already unsubscribed.
    expect(subscribers).toHaveLength(0);
    subscribers.forEach((s) =>
      s.onRunStartedEvent?.({
        event: { type: EventType.RUN_STARTED, threadId: 't-1', runId: 'run-1' },
        messages: [],
        state: {},
        agent: {} as never,
        input: {} as never,
      }),
    );
    expect(useWorkbenchStore.getState().connectionStatus).toBe('connecting');
  });

  it('calls runAgent({}) on start()', () => {
    const { agent } = fakeAgent();
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.start();
    expect(agent.runAgent).toHaveBeenCalledWith({});
  });

  it('dispatchAction forwards forwardedProps.a2uiAction to runAgent', () => {
    const { agent } = fakeAgent();
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.start();
    session.dispatchAction({ name: 'approve_task_creation' });
    expect(agent.runAgent).toHaveBeenCalledWith({
      forwardedProps: { a2uiAction: { name: 'approve_task_creation' } },
    });
  });
});
