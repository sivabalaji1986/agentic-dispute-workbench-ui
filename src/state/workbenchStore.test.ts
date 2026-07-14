import { describe, expect, it, beforeEach } from 'vitest';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { useWorkbenchStore } from './workbenchStore';
import { disputeCatalog } from '../components/catalog/catalogInstance';

describe('useWorkbenchStore', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      caseId: null,
      disputeText: '',
      threadId: null,
      runId: null,
      connectionStatus: 'idle',
      progressLines: [],
      evidenceReadiness: null,
      transportError: null,
      protocolError: null,
    });
  });

  it('startCase sets case metadata and resets run-scoped state', () => {
    useWorkbenchStore
      .getState()
      .startCase({ caseId: 'D-10291', threadId: 't-1', disputeText: 'I paid...' });
    const state = useWorkbenchStore.getState();
    expect(state.caseId).toBe('D-10291');
    expect(state.threadId).toBe('t-1');
    expect(state.connectionStatus).toBe('connecting');
    expect(state.progressLines).toEqual([]);
  });

  it('appendProgressLine appends in call order with source and text preserved', () => {
    useWorkbenchStore.getState().appendProgressLine('orchestrator', 'Understanding dispute...');
    useWorkbenchStore
      .getState()
      .appendProgressLine('case-review', 'Checking transaction status...');
    const lines = useWorkbenchStore.getState().progressLines;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ source: 'orchestrator', text: 'Understanding dispute...' });
    expect(lines[1]).toMatchObject({
      source: 'case-review',
      text: 'Checking transaction status...',
    });
  });

  it('setEvidenceReadiness updates the status-chip value independently', () => {
    useWorkbenchStore.getState().setEvidenceReadiness('2 of 4 required items present');
    expect(useWorkbenchStore.getState().evidenceReadiness).toBe('2 of 4 required items present');
  });

  it('exposes a stable MessageProcessor instance built from the dispute catalog', () => {
    const processor = useWorkbenchStore.getState().processor;
    expect(processor).toBeDefined();
    expect(useWorkbenchStore.getState().processor).toBe(processor);
  });

  it('setProcessor swaps the processor instance the store exposes', () => {
    const first = useWorkbenchStore.getState().processor;
    const second = new MessageProcessor([disputeCatalog]);
    useWorkbenchStore.getState().setProcessor(second);
    expect(useWorkbenchStore.getState().processor).toBe(second);
    expect(useWorkbenchStore.getState().processor).not.toBe(first);
  });

  it('setTransportError / setProtocolError update independently', () => {
    const transportError = {
      code: 'sse_interrupted',
      title: 'Connection lost',
      message: 'The stream was interrupted. Try reconnecting.',
      retryable: true,
    };
    useWorkbenchStore.getState().setTransportError(transportError);
    expect(useWorkbenchStore.getState().transportError).toEqual(transportError);
    expect(useWorkbenchStore.getState().protocolError).toBeNull();
  });

  it('startCase clears any prior transport/protocol error', () => {
    useWorkbenchStore.getState().setTransportError({
      code: 'x',
      title: 'x',
      message: 'x',
      retryable: false,
    });
    useWorkbenchStore.getState().startCase({ caseId: 'D-2', threadId: 't-2', disputeText: 'x' });
    expect(useWorkbenchStore.getState().transportError).toBeNull();
  });
});
