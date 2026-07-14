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
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { createWorkbenchAgentSubscriber } from './bridge';
import { useWorkbenchStore } from '../state/workbenchStore';
import { disputeCatalog } from '../components/catalog/catalogInstance';
import type { ValidationFailure } from './validation';

function fakeParams<E>(event: E) {
  return { event, messages: [], state: {}, agent: {} as never, input: {} as never };
}

describe('createWorkbenchAgentSubscriber', () => {
  let processor: MessageProcessor<never>;
  let protocolErrors: ValidationFailure[];
  let lastDispatchedActionId: string | undefined;
  let workbenchAgentSubscriber: ReturnType<typeof createWorkbenchAgentSubscriber>;

  beforeEach(() => {
    processor = new MessageProcessor([disputeCatalog]) as never;
    protocolErrors = [];
    lastDispatchedActionId = undefined;
    workbenchAgentSubscriber = createWorkbenchAgentSubscriber(
      processor,
      (failure) => {
        protocolErrors.push(failure);
      },
      () => lastDispatchedActionId,
    );
    useWorkbenchStore.setState({
      caseId: 'D-10291',
      threadId: 't-1',
      runId: null,
      connectionStatus: 'idle',
      progressLines: [],
      evidenceReadiness: null,
      transportError: null,
      protocolError: null,
      processor: processor as never,
    });
  });

  function setRootComponent(surfaceId: string, component: string, props: Record<string, unknown>) {
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
          components: [{ id: 'root', component, ...props }],
        },
      },
    };
    workbenchAgentSubscriber.onCustomEvent?.(fakeParams(createEvent));
    workbenchAgentSubscriber.onCustomEvent?.(fakeParams(updateEvent));
  }

  it('sets connection status and runId on RUN_STARTED', () => {
    const event: RunStartedEvent = { type: EventType.RUN_STARTED, threadId: 't-1', runId: 'run-1' };
    workbenchAgentSubscriber.onRunStartedEvent?.(fakeParams(event));
    expect(useWorkbenchStore.getState().connectionStatus).toBe('streaming');
    expect(useWorkbenchStore.getState().runId).toBe('run-1');
  });

  function fireRunFinished(): void {
    const event: RunFinishedEvent = {
      type: EventType.RUN_FINISHED,
      threadId: 't-1',
      runId: 'run-1',
    };
    workbenchAgentSubscriber.onRunFinishedEvent?.({
      ...fakeParams(event),
      outcome: 'success',
    } as never);
  }

  it('derives awaiting-approval status when the finished run leaves ApprovalPreview as root', () => {
    setRootComponent('case-D-10291', 'ApprovalPreview', {
      caseId: 'D-10291',
      newCaseStatus: 'Pending Evidence',
      missingItems: [],
      actionAfterApproval: 'Create task.',
      onApprove: { event: { name: 'approve_task_creation', context: {} } },
      onEdit: { event: { name: 'edit_task_creation', context: {} } },
      onCancel: { event: { name: 'cancel_task_creation', context: {} } },
    });
    fireRunFinished();
    expect(useWorkbenchStore.getState().connectionStatus).toBe('awaiting-approval');
  });

  it('derives completed status when the finished run leaves TaskCreatedCard as root', () => {
    setRootComponent('case-D-10291', 'TaskCreatedCard', {
      taskId: 'EVID-1',
      caseStatus: 'x',
      auditEntry: 'y',
      nextOwner: 'z',
    });
    fireRunFinished();
    expect(useWorkbenchStore.getState().connectionStatus).toBe('completed');
  });

  it('derives cancelled status when getLastDispatchedActionId returns cancel_task_creation and root is DecisionCard', () => {
    setRootComponent('case-D-10291', 'DecisionCard', {
      status: 'Open',
      disputeType: 'Non-delivery',
      evidenceReadiness: '0 of 2',
      recommendedAction: 'Review',
    });
    lastDispatchedActionId = 'cancel_task_creation';
    fireRunFinished();
    expect(useWorkbenchStore.getState().connectionStatus).toBe('cancelled');
  });

  it('derives idle status when no action was dispatched and root is DecisionCard', () => {
    setRootComponent('case-D-10291', 'DecisionCard', {
      status: 'Open',
      disputeType: 'Non-delivery',
      evidenceReadiness: '0 of 2',
      recommendedAction: 'Review',
    });
    lastDispatchedActionId = undefined;
    fireRunFinished();
    expect(useWorkbenchStore.getState().connectionStatus).toBe('idle');
  });

  it('sets a retryable transport WorkbenchError and failed status on RUN_ERROR', () => {
    const event: RunErrorEvent = {
      type: EventType.RUN_ERROR,
      message: 'boom',
      code: 'x',
    } as RunErrorEvent;
    workbenchAgentSubscriber.onRunErrorEvent?.(fakeParams(event));
    expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
    expect(useWorkbenchStore.getState().transportError).toMatchObject({
      message: 'boom',
      retryable: true,
    });
  });

  it('sets a retryable transport WorkbenchError on onRunFailed', () => {
    workbenchAgentSubscriber.onRunFailed?.({
      error: new Error('stream dropped'),
      messages: [],
      state: {},
      agent: {} as never,
      input: {} as never,
    });
    expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
    expect(useWorkbenchStore.getState().transportError?.code).toBe('sse_interrupted');
  });

  it('sets a non-retryable protocol WorkbenchError on a malformed a2ui payload', () => {
    const event: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'a2ui',
      value: { version: 'v0.8', createSurface: { surfaceId: 'x', catalogId: 'y' } },
    };
    workbenchAgentSubscriber.onCustomEvent?.(fakeParams(event));
    expect(useWorkbenchStore.getState().protocolError).toMatchObject({ retryable: false });
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

  it('drops a malformed progress event instead of appending it, and reports it', () => {
    const event: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'progress',
      value: { source: 'not-a-real-agent', text: 'hi' },
    };
    expect(() => workbenchAgentSubscriber.onCustomEvent?.(fakeParams(event))).not.toThrow();
    expect(useWorkbenchStore.getState().progressLines).toHaveLength(0);
    expect(protocolErrors).toHaveLength(1);
    expect(protocolErrors[0]).toMatchObject({ eventType: 'progress' });
  });

  it('drops an a2ui message with the wrong version instead of touching the surface', () => {
    const event: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'a2ui',
      value: { version: 'v0.8', createSurface: { surfaceId: 'case-X', catalogId: 'x' } },
    };
    expect(() => workbenchAgentSubscriber.onCustomEvent?.(fakeParams(event))).not.toThrow();
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
