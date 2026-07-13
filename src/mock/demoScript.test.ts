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

  // Regression guard for the design doc §4/§4.1 amendment: updateComponents must
  // carry three distinct flat sibling entries (never an inlined/nested child
  // object), with DecisionCard's checklistId/actionsId resolving to the other
  // two entries' own ids.
  it('the decision view payload is exactly three flat entries with resolving composition references', () => {
    const components = lastUpdateComponents(reviewRun);
    expect(components).toHaveLength(3);

    const [decisionCard, checklist, actions] = components as Array<Record<string, unknown>>;
    expect(decisionCard).toMatchObject({ id: 'root', component: 'DecisionCard' });
    expect(checklist).toMatchObject({ component: 'EvidenceChecklist' });
    expect(actions).toMatchObject({ component: 'NextActions' });

    // Composition is by id reference only — never nested objects.
    expect(decisionCard.checklistId).toBe(checklist.id);
    expect(decisionCard.actionsId).toBe(actions.id);
    expect(typeof decisionCard.checklistId).toBe('string');
    expect(typeof decisionCard.actionsId).toBe('string');
  });

  it('previewRun and approvalRun render ApprovalPreview/TaskCreatedCard as standalone single-entry roots', () => {
    const previewComponents = lastUpdateComponents(previewRun);
    expect(previewComponents).toHaveLength(1);
    expect(previewComponents[0]).toMatchObject({ id: 'root', component: 'ApprovalPreview' });
    expect(previewComponents[0]).not.toHaveProperty('checklistId');
    expect(previewComponents[0]).not.toHaveProperty('actionsId');

    const approvalComponents = lastUpdateComponents(approvalRun);
    expect(approvalComponents).toHaveLength(1);
    expect(approvalComponents[0]).toMatchObject({ id: 'root', component: 'TaskCreatedCard' });
  });

  it('cancelRun reverts to the same three-entry decision view as reviewRun', () => {
    const components = lastUpdateComponents(cancelRun);
    expect(components).toHaveLength(3);
    expect(components[0]).toMatchObject({ id: 'root', component: 'DecisionCard' });
  });
});

type LooseEvent = { type: string; name?: string; value?: Record<string, unknown> };

function lastUpdateComponents(run: typeof reviewRun): unknown[] {
  const payload = run.events
    .map((scripted) => scripted.event as LooseEvent)
    .filter((event) => event.type === EventType.CUSTOM && event.name === 'a2ui')
    .map((event) => event.value as Record<string, unknown>)
    .filter((value) => 'updateComponents' in value)
    .pop() as { updateComponents: { components: unknown[] } } | undefined;
  if (!payload) throw new Error('run has no updateComponents event');
  return payload.updateComponents.components;
}
