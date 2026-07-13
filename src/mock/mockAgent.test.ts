import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventType, type AgentSubscriber } from '@ag-ui/client';
import { MockAgent } from './mockAgent';

describe('MockAgent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays the review run by default and dispatches RUN_STARTED then RUN_FINISHED in order', async () => {
    const agent = new MockAgent();
    const seen: string[] = [];
    const subscriber: AgentSubscriber = {
      onRunStartedEvent: () => {
        seen.push('RUN_STARTED');
      },
      onRunFinishedEvent: () => {
        seen.push('RUN_FINISHED');
      },
      onCustomEvent: ({ event }) => {
        if (event.type === EventType.CUSTOM) seen.push(`CUSTOM:${event.name}`);
      },
    };
    agent.subscribe(subscriber);

    await agent.runAgent({});
    await vi.advanceTimersByTimeAsync(20000);

    expect(seen[0]).toBe('RUN_STARTED');
    expect(seen[seen.length - 1]).toBe('RUN_FINISHED');
    expect(seen).toContain('CUSTOM:progress');
    expect(seen).toContain('CUSTOM:a2ui');
  });

  it('plays the approval run when forwardedProps.a2uiAction.name is approve_task_creation', async () => {
    const agent = new MockAgent();
    const seen: string[] = [];
    agent.subscribe({
      onRunFinishedEvent: () => {
        seen.push('RUN_FINISHED');
      },
    } as never);

    await agent.runAgent({ forwardedProps: { a2uiAction: { name: 'approve_task_creation' } } });
    await vi.advanceTimersByTimeAsync(10000);

    expect(seen).toEqual(['RUN_FINISHED']);
  });
});
