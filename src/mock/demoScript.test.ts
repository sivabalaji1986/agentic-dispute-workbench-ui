import { describe, expect, it } from 'vitest';
import { EventType } from '@ag-ui/client';
import { reviewRun, previewRun, approvalRun, cancelRun } from './demoScript';

describe('demoScript runs', () => {
  it.each([
    ['reviewRun', reviewRun],
    ['previewRun', previewRun],
    ['approvalRun', approvalRun],
    ['cancelRun', cancelRun],
  ])('%s starts with RUN_STARTED and ends with RUN_FINISHED', (_name, run) => {
    expect(run.events[0].event.type).toBe(EventType.RUN_STARTED);
    expect(run.events[run.events.length - 1].event.type).toBe(EventType.RUN_FINISHED);
  });

  it('reviewRun includes interleaved case-review and policy progress lines in arrival order', () => {
    type LooseEvent = { type: string; name?: string; value?: { source?: string } };
    const sources = reviewRun.events
      .map((scripted) => scripted.event as LooseEvent)
      .filter((event) => event.type === EventType.CUSTOM && event.name === 'progress')
      .map((event) => event.value?.source);

    expect(sources).toContain('case-review');
    expect(sources).toContain('policy');
    expect(sources.indexOf('case-review')).toBeLessThan(sources.lastIndexOf('policy'));
  });

  it('reviewRun creates the surface and renders the decision view (DecisionCard as root)', () => {
    type LooseEvent = { type: string; name?: string; value?: Record<string, unknown> };
    const a2uiValues = reviewRun.events
      .map((scripted) => scripted.event as LooseEvent)
      .filter((event) => event.type === EventType.CUSTOM && event.name === 'a2ui')
      .map((event) => event.value as Record<string, unknown>);

    expect(a2uiValues.some((value) => 'createSurface' in value)).toBe(true);
    const updateComponents = a2uiValues.find((value) => 'updateComponents' in value) as
      { updateComponents: { components: Array<{ id: string; component: string }> } } | undefined;
    expect(updateComponents).toBeDefined();
    expect(updateComponents?.updateComponents.components[0]).toMatchObject({
      id: 'root',
      component: 'DecisionCard',
    });
  });

  it('approvalRun ends on TaskCreatedCard and cancelRun reverts to DecisionCard', () => {
    type LooseEvent = { type: string; name?: string; value?: Record<string, unknown> };
    const lastComponents = (run: typeof approvalRun) =>
      run.events
        .map((scripted) => scripted.event as LooseEvent)
        .filter((event) => event.type === EventType.CUSTOM && event.name === 'a2ui')
        .map((event) => event.value as Record<string, unknown>)
        .filter((value) => 'updateComponents' in value)
        .pop() as { updateComponents: { components: Array<{ component: string }> } };

    expect(lastComponents(approvalRun).updateComponents.components[0].component).toBe(
      'TaskCreatedCard',
    );
    expect(lastComponents(cancelRun).updateComponents.components[0].component).toBe('DecisionCard');
  });
});
