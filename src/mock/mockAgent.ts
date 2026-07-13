import { EventType, type AgentSubscriber, type BaseEvent } from '@ag-ui/client';
import {
  reviewRun,
  previewRun,
  approvalRun,
  cancelRun,
  THREAD_ID,
  type DemoRun,
} from './demoScript';

interface MockRunParams {
  forwardedProps?: { a2uiAction?: { name?: string } };
}

function runFor(actionName: string | undefined): DemoRun {
  switch (actionName) {
    case 'create_evidence_request_task':
      return previewRun;
    case 'approve_task_creation':
      return approvalRun;
    case 'cancel_task_creation':
      return cancelRun;
    default:
      return reviewRun;
  }
}

function dispatchToSubscriber(subscriber: AgentSubscriber, event: BaseEvent): void {
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

/**
 * A structurally AG-UI-compatible agent that replays `demoScript.ts` on
 * timers instead of connecting over SSE. Used when VITE_MOCK is not "false".
 */
export class MockAgent {
  threadId = THREAD_ID;
  private subscribers: AgentSubscriber[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];

  subscribe(subscriber: AgentSubscriber): { unsubscribe: () => void } {
    this.subscribers.push(subscriber);
    return {
      unsubscribe: () => {
        this.subscribers = this.subscribers.filter((s) => s !== subscriber);
      },
    };
  }

  async runAgent(params: MockRunParams = {}): Promise<{ result: undefined }> {
    const run = runFor(params.forwardedProps?.a2uiAction?.name);
    let cumulativeDelay = 0;
    for (const scripted of run.events) {
      cumulativeDelay += scripted.delayMs;
      const timer = setTimeout(() => this.dispatch(scripted.event), cumulativeDelay);
      this.timers.push(timer);
    }
    return { result: undefined };
  }

  abortRun(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private dispatch(event: BaseEvent): void {
    for (const subscriber of this.subscribers) {
      dispatchToSubscriber(subscriber, event);
    }
  }
}
