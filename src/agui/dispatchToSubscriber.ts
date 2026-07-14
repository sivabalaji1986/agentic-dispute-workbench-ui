import { EventType, type AgentSubscriber, type BaseEvent } from '@ag-ui/client';

/**
 * Feeds one AG-UI event into a subscriber's typed handler, exactly the way a
 * real `HttpAgent` would. Shared by MockAgent (scripted replay) and
 * replayFixture (captured-stream contract tests) so there is one dispatch
 * implementation, not two that can drift apart.
 */
export function dispatchToSubscriber(subscriber: AgentSubscriber, event: BaseEvent): void {
  const params = { event, messages: [], state: {}, agent: {} as never, input: {} as never };
  switch (event.type) {
    case EventType.RUN_STARTED:
      subscriber.onRunStartedEvent?.(params as never);
      break;
    case EventType.RUN_FINISHED:
      subscriber.onRunFinishedEvent?.({ ...params, outcome: 'success' } as never);
      break;
    case EventType.RUN_ERROR:
      subscriber.onRunErrorEvent?.(params as never);
      break;
    case EventType.STATE_SNAPSHOT:
      subscriber.onStateSnapshotEvent?.(params as never);
      break;
    case EventType.STATE_DELTA:
      subscriber.onStateDeltaEvent?.(params as never);
      break;
    case EventType.CUSTOM:
      subscriber.onCustomEvent?.(params as never);
      break;
    default:
      break;
  }
}
