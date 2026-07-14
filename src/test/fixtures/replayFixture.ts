import { readFileSync } from 'node:fs';
import type { AgentSubscriber, BaseEvent } from '@ag-ui/client';
import { dispatchToSubscriber } from '../../agui/dispatchToSubscriber';

interface RunFailureMarker {
  __runFailed: true;
  message: string;
}

function isRunFailureMarker(value: unknown): value is RunFailureMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __runFailed?: unknown }).__runFailed === true
  );
}

/**
 * Feeds a captured NDJSON fixture through the exact same dispatch helper the
 * live and mock agents use, so a fixture exercises the real bridge +
 * validation code path, not a test-only stand-in. One line is one AG-UI
 * event, except a `{"__runFailed": true, "message": "..."}` marker line,
 * which stands in for a transport-level `onRunFailed` callback — there is no
 * wire representation for a dropped connection (see this directory's
 * README.md).
 */
export function replayFixture(path: string, subscriber: AgentSubscriber): void {
  const lines = readFileSync(path, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const parsed: unknown = JSON.parse(line);
    if (isRunFailureMarker(parsed)) {
      void subscriber.onRunFailed?.({
        error: new Error(parsed.message),
        messages: [],
        state: {},
        agent: {} as never,
        input: {} as never,
      });
      continue;
    }
    dispatchToSubscriber(subscriber, parsed as BaseEvent);
  }
}
