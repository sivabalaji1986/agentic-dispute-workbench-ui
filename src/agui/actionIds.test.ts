import { describe, expect, it } from 'vitest';
import { DISPATCHABLE_ACTION_IDS, isDispatchableActionId } from './actionIds';

describe('isDispatchableActionId', () => {
  it('accepts every id in the frozen allow-list', () => {
    for (const id of DISPATCHABLE_ACTION_IDS) {
      expect(isDispatchableActionId(id)).toBe(true);
    }
  });

  it('rejects an id outside the allow-list', () => {
    expect(isDispatchableActionId('delete_everything')).toBe(false);
  });
});
