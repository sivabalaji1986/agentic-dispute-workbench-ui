import { describe, expect, it } from 'vitest';
import { HttpAgent, EventType } from '@ag-ui/client';
import { Catalog, MessageProcessor } from '@a2ui/web_core/v0_9';
import { A2uiSurface, createComponentImplementation } from '@a2ui/react/v0_9';

describe('AG-UI / A2UI package resolution', () => {
  it('resolves the AG-UI client and core exports', () => {
    expect(HttpAgent).toBeDefined();
    expect(EventType.CUSTOM).toBe('CUSTOM');
    expect(EventType.RUN_STARTED).toBe('RUN_STARTED');
    expect(EventType.STATE_DELTA).toBe('STATE_DELTA');
  });

  it('resolves the A2UI web_core and react exports', () => {
    expect(Catalog).toBeDefined();
    expect(MessageProcessor).toBeDefined();
    expect(A2uiSurface).toBeDefined();
    expect(createComponentImplementation).toBeDefined();
  });
});
