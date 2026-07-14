import { describe, expect, it, vi } from 'vitest';
import {
  EventType,
  type AgentSubscriber,
  type CustomEvent,
  type RunFinishedEvent,
} from '@ag-ui/client';
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

  it('sets a retryable TRANSPORT error when the initial runAgent rejects', async () => {
    const agent: AguiLikeAgent = {
      threadId: 'fake',
      subscribe: () => ({ unsubscribe: () => {} }),
      runAgent: vi.fn().mockRejectedValue(new Error('network down')),
      abortRun: vi.fn(),
    };
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.start();
    await vi.waitFor(() => {
      expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
    });
    expect(useWorkbenchStore.getState().transportError?.code).toBe('TRANSPORT');
  });

  it("sets a retryable TRANSPORT error when retry()'s runAgent rejects", async () => {
    const agent: AguiLikeAgent = {
      threadId: 'fake',
      subscribe: () => ({ unsubscribe: () => {} }),
      runAgent: vi.fn().mockRejectedValue(new Error('network down')),
      abortRun: vi.fn(),
    };
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.retry();
    await vi.waitFor(() => {
      expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
    });
    expect(useWorkbenchStore.getState().transportError?.code).toBe('TRANSPORT');
  });

  it('retry() preserves the derived last-action-id so a resent cancellation is correctly reported as cancelled, not lost as a fresh review', () => {
    const agents: ReturnType<typeof fakeAgent>[] = [];
    const session = new WorkbenchSession('t-1', {
      agentFactory: () => {
        const created = fakeAgent();
        agents.push(created);
        return created.agent;
      },
    });
    session.start();
    session.dispatchAction({ name: 'cancel_task_creation' });

    session.retry();

    const subscriber = agents[agents.length - 1].subscribers[0];
    expect(subscriber).toBeDefined();

    const params = <E>(event: E) => ({
      event,
      messages: [],
      state: {},
      agent: {} as never,
      input: {} as never,
    });

    const createEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'a2ui',
      value: {
        version: 'v0.9',
        createSurface: {
          surfaceId: 'case-D-10291',
          catalogId: 'https://dispute-workbench.internal/catalogs/v1.json',
        },
      },
    };
    const updateEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'a2ui',
      value: {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'case-D-10291',
          components: [
            {
              id: 'root',
              component: 'DecisionCard',
              status: 'Open',
              disputeType: 'Non-delivery',
              evidenceReadiness: '0 of 2',
              recommendedAction: 'Review',
            },
          ],
        },
      },
    };
    subscriber.onCustomEvent?.(params(createEvent));
    subscriber.onCustomEvent?.(params(updateEvent));

    const finishedEvent: RunFinishedEvent = {
      type: EventType.RUN_FINISHED,
      threadId: 't-1',
      runId: 'run-2',
    };
    subscriber.onRunFinishedEvent?.({ ...params(finishedEvent), outcome: 'success' } as never);

    // Under B3, retry() re-issues lastRunInput as-is (the cancel_task_creation
    // action), so a successful RUN_FINISHED after retry() is genuinely a
    // completed cancellation — not a fresh review to be reported as 'idle'.
    expect(useWorkbenchStore.getState().connectionStatus).toBe('cancelled');
  });

  it('dispatchAction() catches a rejected runAgent and surfaces a retryable TRANSPORT error without an unhandled rejection', async () => {
    const agent: AguiLikeAgent = {
      threadId: 'fake',
      subscribe: () => ({ unsubscribe: () => {} }),
      runAgent: vi
        .fn()
        .mockResolvedValueOnce({ result: undefined }) // start()'s initial call succeeds
        .mockRejectedValueOnce(new Error('dispatch failed')), // the dispatched action fails
      abortRun: vi.fn(),
    };
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.start();
    session.dispatchAction({ name: 'approve_task_creation' });
    await vi.waitFor(() => {
      expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
    });
    expect(useWorkbenchStore.getState().transportError?.code).toBe('TRANSPORT');
    expect(useWorkbenchStore.getState().transportError?.retryable).toBe(true);
  });

  it('retry() re-sends the same dispatched action (not a fresh review) on the same threadId after a failure', async () => {
    const agents: ReturnType<typeof fakeAgent>[] = [];
    let callCount = 0;
    const session = new WorkbenchSession('t-1', {
      agentFactory: () => {
        const created = fakeAgent();
        created.agent.runAgent = vi.fn().mockImplementation(() => {
          callCount += 1;
          // Fail only the dispatched preview-run call (the 2nd runAgent call
          // overall); every other call (start()'s initial call, and the
          // retry) succeeds.
          return callCount === 2
            ? Promise.reject(new Error('preview run failed'))
            : Promise.resolve({ result: undefined });
        });
        agents.push(created);
        return created.agent;
      },
    });
    session.start();
    session.dispatchAction({ name: 'create_evidence_request_task' });
    await vi.waitFor(() => {
      expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
    });

    session.retry();

    const retryAgent = agents[agents.length - 1].agent;
    expect(retryAgent.runAgent).toHaveBeenCalledWith({
      forwardedProps: { a2uiAction: { name: 'create_evidence_request_task' } },
    });
    expect(session.threadId).toBe('t-1'); // same threadId — no new session/case
  });

  it('retry() re-runs a failed initial review without generating a new threadId when nothing was dispatched yet', async () => {
    const agent: AguiLikeAgent = {
      threadId: 'fake',
      subscribe: () => ({ unsubscribe: () => {} }),
      runAgent: vi.fn().mockRejectedValue(new Error('network down')),
      abortRun: vi.fn(),
    };
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.start();
    await vi.waitFor(() => {
      expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
    });

    session.retry();

    await vi.waitFor(() => {
      expect(agent.runAgent).toHaveBeenCalledTimes(2);
    });
    expect(agent.runAgent).toHaveBeenLastCalledWith({});
    expect(session.threadId).toBe('t-1');
  });

  it('dispose() aborts the in-flight run before unsubscribing', () => {
    const { agent, subscribers } = fakeAgent();
    const callOrder: string[] = [];
    agent.abortRun = vi.fn(() => callOrder.push('abort'));
    const originalSubscribe = agent.subscribe.bind(agent);
    agent.subscribe = (subscriber) => {
      const result = originalSubscribe(subscriber);
      return {
        unsubscribe: () => {
          callOrder.push('unsubscribe');
          result.unsubscribe();
        },
      };
    };
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.start();

    session.dispose();

    expect(agent.abortRun).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['abort', 'unsubscribe']);
    expect(subscribers).toHaveLength(0);
  });
});
