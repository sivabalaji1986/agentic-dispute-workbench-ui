import { describe, expect, it, vi } from 'vitest';
import { HttpAgentAdapter } from './httpAgentAdapter';

const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() });
const mockRunAgent = vi.fn().mockResolvedValue({ result: undefined });
const mockAbortRun = vi.fn();

vi.mock('@ag-ui/client', () => {
  class MockHttpAgent {
    threadId: string;
    subscribe = mockSubscribe;
    runAgent = mockRunAgent;
    abortRun = mockAbortRun;

    constructor(params: { url: string; threadId: string }) {
      this.threadId = params.threadId;
    }
  }

  return {
    HttpAgent: MockHttpAgent,
  };
});

describe('HttpAgentAdapter', () => {
  it('exposes threadId from the underlying HttpAgent', () => {
    const adapter = new HttpAgentAdapter({ url: 'http://localhost:8080/agui', threadId: 't-1' });
    expect(adapter.threadId).toBe('t-1');
  });

  it('forwards subscribe() to the underlying HttpAgent', () => {
    const adapter = new HttpAgentAdapter({ url: 'http://localhost:8080/agui', threadId: 't-1' });
    const subscriber = {};
    adapter.subscribe(subscriber as never);
    expect(mockSubscribe).toHaveBeenCalledWith(subscriber);
  });

  it('forwards runAgent() params to the underlying HttpAgent', () => {
    const adapter = new HttpAgentAdapter({ url: 'http://localhost:8080/agui', threadId: 't-1' });
    void adapter.runAgent({ forwardedProps: { a2uiAction: { name: 'x' } } });
    expect(mockRunAgent).toHaveBeenCalledWith({ forwardedProps: { a2uiAction: { name: 'x' } } });
  });

  it('forwards abortRun() to the underlying HttpAgent', () => {
    const adapter = new HttpAgentAdapter({ url: 'http://localhost:8080/agui', threadId: 't-1' });
    adapter.abortRun();
    expect(mockAbortRun).toHaveBeenCalled();
  });
});
