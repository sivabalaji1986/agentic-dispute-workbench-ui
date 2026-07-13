import { describe, expect, it, beforeEach } from 'vitest';
import { useWorkbenchStore } from './workbenchStore';

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
});
