import { describe, expect, it, beforeEach } from 'vitest';
import { EventType } from '@ag-ui/client';
import type {
  CustomEvent,
  RunStartedEvent,
  RunFinishedEvent,
  RunErrorEvent,
  StateSnapshotEvent,
  StateDeltaEvent,
} from '@ag-ui/client';
import { resetBridgeState, workbenchAgentSubscriber } from './bridge';
import { useWorkbenchStore } from '../state/workbenchStore';

function fakeParams<E>(event: E) {
  return { event, messages: [], state: {}, agent: {} as never, input: {} as never };
}

describe('workbenchAgentSubscriber', () => {
  beforeEach(() => {
    resetBridgeState();
    useWorkbenchStore.setState({
      caseId: 'D-10291',
      threadId: 't-1',
      runId: null,
      connectionStatus: 'idle',
      progressLines: [],
      evidenceReadiness: null,
    });
  });

  it('sets connection status and runId on RUN_STARTED', () => {
    const event: RunStartedEvent = { type: EventType.RUN_STARTED, threadId: 't-1', runId: 'run-1' };
    workbenchAgentSubscriber.onRunStartedEvent?.(fakeParams(event));
    expect(useWorkbenchStore.getState().connectionStatus).toBe('streaming');
    expect(useWorkbenchStore.getState().runId).toBe('run-1');
  });

  it('sets connection status to finished on RUN_FINISHED', () => {
    const event: RunFinishedEvent = {
      type: EventType.RUN_FINISHED,
      threadId: 't-1',
      runId: 'run-1',
    };
    workbenchAgentSubscriber.onRunFinishedEvent?.({
      ...fakeParams(event),
      outcome: 'success',
    } as never);
    expect(useWorkbenchStore.getState().connectionStatus).toBe('finished');
  });

  it('sets connection status to disconnected on RUN_ERROR', () => {
    const event: RunErrorEvent = { type: EventType.RUN_ERROR, message: 'boom' } as RunErrorEvent;
    workbenchAgentSubscriber.onRunErrorEvent?.(fakeParams(event));
    expect(useWorkbenchStore.getState().connectionStatus).toBe('disconnected');
  });

  it('appends a progress line from a CUSTOM/progress event', () => {
    const event: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'progress',
      value: { source: 'case-review', text: 'Checking transaction status...' },
    };
    workbenchAgentSubscriber.onCustomEvent?.(fakeParams(event));
    const lines = useWorkbenchStore.getState().progressLines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      source: 'case-review',
      text: 'Checking transaction status...',
    });
  });

  it('feeds a CUSTOM/a2ui event into the MessageProcessor', () => {
    const surfaceId = 'case-D-10291';
    const createEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'a2ui',
      value: {
        version: 'v0.9',
        createSurface: {
          surfaceId,
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
          surfaceId,
          components: [
            {
              id: 'root',
              component: 'TaskCreatedCard',
              taskId: 'EVID-1',
              caseStatus: 'x',
              auditEntry: 'y',
              nextOwner: 'z',
            },
          ],
        },
      },
    };
    workbenchAgentSubscriber.onCustomEvent?.(fakeParams(createEvent));
    workbenchAgentSubscriber.onCustomEvent?.(fakeParams(updateEvent));

    const processor = useWorkbenchStore.getState().processor;
    expect(processor.model.getSurface(surfaceId)).toBeDefined();
  });

  it('ignores a duplicate createSurface for an existing surfaceId instead of throwing', () => {
    const surfaceId = 'case-D-10291';
    const createEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'a2ui',
      value: {
        version: 'v0.9',
        createSurface: {
          surfaceId,
          catalogId: 'https://dispute-workbench.internal/catalogs/v1.json',
        },
      },
    };
    workbenchAgentSubscriber.onCustomEvent?.(fakeParams(createEvent));
    expect(() => workbenchAgentSubscriber.onCustomEvent?.(fakeParams(createEvent))).not.toThrow();
  });

  it('applies STATE_SNAPSHOT then STATE_DELTA and syncs evidenceReadiness independently', () => {
    const snapshot: StateSnapshotEvent = {
      type: EventType.STATE_SNAPSHOT,
      snapshot: { evidenceReadiness: null },
    };
    const delta: StateDeltaEvent = {
      type: EventType.STATE_DELTA,
      delta: [
        { op: 'replace', path: '/evidenceReadiness', value: '2 of 4 required items present' },
      ],
    };
    workbenchAgentSubscriber.onStateSnapshotEvent?.(fakeParams(snapshot));
    workbenchAgentSubscriber.onStateDeltaEvent?.(fakeParams(delta));
    expect(useWorkbenchStore.getState().evidenceReadiness).toBe('2 of 4 required items present');
  });

  it('drops a malformed progress event instead of appending it, without throwing', () => {
    const event: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'progress',
      value: { source: 'not-a-real-agent', text: 'hi' },
    };
    expect(() => workbenchAgentSubscriber.onCustomEvent?.(fakeParams(event))).not.toThrow();
    expect(useWorkbenchStore.getState().progressLines).toHaveLength(0);
  });

  it('drops an a2ui message with the wrong version instead of touching the surface', () => {
    const event: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'a2ui',
      value: { version: 'v0.8', createSurface: { surfaceId: 'case-X', catalogId: 'x' } },
    };
    expect(() => workbenchAgentSubscriber.onCustomEvent?.(fakeParams(event))).not.toThrow();
    const processor = useWorkbenchStore.getState().processor;
    expect(processor.model.getSurface('case-X')).toBeUndefined();
  });

  it('drops an oversized updateComponents payload instead of applying it', () => {
    const surfaceId = 'case-D-10291';
    const createEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'a2ui',
      value: {
        version: 'v0.9',
        createSurface: {
          surfaceId,
          catalogId: 'https://dispute-workbench.internal/catalogs/v1.json',
        },
      },
    };
    const oversized = Array.from({ length: 21 }, (_, index) => ({
      id: `c-${index}`,
      component: 'UnknownForTest',
    }));
    const updateEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'a2ui',
      value: { version: 'v0.9', updateComponents: { surfaceId, components: oversized } },
    };
    workbenchAgentSubscriber.onCustomEvent?.(fakeParams(createEvent));
    expect(() => workbenchAgentSubscriber.onCustomEvent?.(fakeParams(updateEvent))).not.toThrow();
  });

  it('drops a STATE_DELTA with an invalid op instead of applying it', () => {
    const snapshot: StateSnapshotEvent = {
      type: EventType.STATE_SNAPSHOT,
      snapshot: { evidenceReadiness: null },
    };
    const badDelta = {
      type: EventType.STATE_DELTA,
      delta: [{ op: 'teleport', path: '/evidenceReadiness', value: 'x' }],
    } as unknown as StateDeltaEvent;
    workbenchAgentSubscriber.onStateSnapshotEvent?.(fakeParams(snapshot));
    expect(() => workbenchAgentSubscriber.onStateDeltaEvent?.(fakeParams(badDelta))).not.toThrow();
    expect(useWorkbenchStore.getState().evidenceReadiness).toBeNull();
  });
});
