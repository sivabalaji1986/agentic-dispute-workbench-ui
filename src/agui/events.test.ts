import { describe, expect, it } from 'vitest';
import { EventType, type CustomEvent } from '@ag-ui/client';
import { isA2uiCustomEvent, isProgressCustomEvent } from './events';

function customEvent(name: string, value: unknown): CustomEvent {
  return { type: EventType.CUSTOM, name, value } as CustomEvent;
}

describe('progress/a2ui CUSTOM event discrimination', () => {
  it('identifies a progress event by name', () => {
    const event = customEvent('progress', { source: 'orchestrator', text: 'hi' });
    expect(isProgressCustomEvent(event)).toBe(true);
    expect(isA2uiCustomEvent(event)).toBe(false);
  });

  it('identifies an a2ui event by name', () => {
    const event = customEvent('a2ui', {
      version: 'v0.9',
      updateComponents: { surfaceId: 's', components: [] },
    });
    expect(isA2uiCustomEvent(event)).toBe(true);
    expect(isProgressCustomEvent(event)).toBe(false);
  });

  it('does not misclassify an unrelated CUSTOM event', () => {
    const event = customEvent('something-else', {});
    expect(isProgressCustomEvent(event)).toBe(false);
    expect(isA2uiCustomEvent(event)).toBe(false);
  });
});
