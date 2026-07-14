// src/agui/client.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { EventEmitter, A2uiClientAction } from '@a2ui/web_core/v0_9';
import { startDemoCase } from './client';
import { useWorkbenchStore } from '../state/workbenchStore';

// There is no clean public seam to inject a malformed action: `onAction` is
// typed as the subscribe-only `EventSource` view, and the A2UI library's own
// dispatch path (`SurfaceModel.dispatchAction`, see
// node_modules/@a2ui/web_core/src/v0_9/state/surface-model.js) already
// validates a payload against `A2uiClientActionSchema` before it ever emits
// an action, so a real click can never produce a malformed one to observe.
// At runtime, though, `SurfaceGroupModel` assigns the concrete `EventEmitter`
// instance (which does expose `.emit(...)`) to the public `onAction` field
// (see .../state/surface-group-model.js) — the same object WorkbenchSession
// wires its onAction subscription to inside `start()` (see
// src/agui/workbenchSession.ts). We reach for that same runtime object here,
// bypassing only the TypeScript view (not the library's actual wiring), to
// simulate what would happen if a future catalog/protocol change ever let a
// malformed action through.
//
// `startDemoCase` is the real public entry point (client.ts) that creates a
// WorkbenchSession and calls `.start()`, wiring the onAction subscription
// against the session's own processor and swapping it into the store via
// `setProcessor` — so this exercises the actual production wiring, not a
// hand-built stand-in. Fake timers keep the mock agent's scripted
// `setTimeout`-based events from firing in the background during the test.
describe('onAction forwarding', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    startDemoCase('test dispute text');
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('drops a malformed action (missing sourceComponentId) and logs a redacted warning instead of forwarding it', async () => {
    const processor = useWorkbenchStore.getState().processor;
    const emitter = processor.model.onAction as unknown as EventEmitter<A2uiClientAction>;
    const malformed = {
      name: 'approve_task_creation',
      surfaceId: 'case-X',
      // sourceComponentId missing
      timestamp: '2026-07-13T10:40:00Z',
      context: {},
    };

    await emitter.emit(malformed as unknown as A2uiClientAction);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[protocol] rejected forwarded_action payload'),
    );
  });

  it('does not log a rejection for a well-formed action', async () => {
    const processor = useWorkbenchStore.getState().processor;
    const emitter = processor.model.onAction as unknown as EventEmitter<A2uiClientAction>;
    const valid: A2uiClientAction = {
      name: 'approve_task_creation',
      surfaceId: 'case-X',
      sourceComponentId: 'approve-btn',
      timestamp: '2026-07-13T10:40:00Z',
      context: {},
    };

    await emitter.emit(valid);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
