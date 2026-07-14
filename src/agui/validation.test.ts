import { describe, expect, it } from 'vitest';
import {
  MAX_COMPONENTS_PER_UPDATE,
  MAX_CHECKLIST_ITEMS,
  MAX_ACTIONS,
  MAX_PROGRESS_TEXT,
  validateProgressEventValue,
  validateA2uiMessage,
  validateStateSnapshot,
  validateStateDelta,
  validateForwardedAction,
} from './validation';

const SURFACE_ID = 'case-D-10291';
const CATALOG_ID = 'https://dispute-workbench.internal/catalogs/v1.json';

const decisionViewComponents = [
  {
    id: 'root',
    component: 'DecisionCard',
    status: 'Needs More Evidence',
    disputeType: 'Goods Not Received',
    evidenceReadiness: '2 of 4 required items present',
    recommendedAction: 'Create evidence request task',
    checklistId: 'evidence-checklist',
    actionsId: 'next-actions',
  },
  {
    id: 'evidence-checklist',
    component: 'EvidenceChecklist',
    items: [
      { label: 'Transaction record', present: true },
      { label: 'Merchant response', present: true },
      { label: 'Customer declaration', present: false },
      { label: 'Delivery / non-delivery proof', present: false },
    ],
  },
  {
    id: 'next-actions',
    component: 'NextActions',
    actions: [
      { id: 'create_evidence_request_task', label: 'Create Evidence Request Task' },
      { id: 'escalate_to_reviewer', label: 'Escalate to Reviewer' },
      { id: 'save_case_note', label: 'Save Case Note' },
    ],
  },
];

describe('validateProgressEventValue', () => {
  it('accepts a well-formed progress value', () => {
    const result = validateProgressEventValue({ source: 'case-review', text: 'Checking...' });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown source', () => {
    const result = validateProgressEventValue({ source: 'mystery-agent', text: 'hi' });
    expect(result.success).toBe(false);
  });

  it('rejects empty text', () => {
    const result = validateProgressEventValue({ source: 'orchestrator', text: '' });
    expect(result.success).toBe(false);
  });

  it(`rejects text longer than MAX_PROGRESS_TEXT (${MAX_PROGRESS_TEXT})`, () => {
    const result = validateProgressEventValue({
      source: 'orchestrator',
      text: 'x'.repeat(MAX_PROGRESS_TEXT + 1),
    });
    expect(result.success).toBe(false);
  });
});

describe('validateA2uiMessage', () => {
  it('accepts a real createSurface message', () => {
    const result = validateA2uiMessage({
      version: 'v0.9',
      createSurface: { surfaceId: SURFACE_ID, catalogId: CATALOG_ID, sendDataModel: false },
    });
    expect(result.success).toBe(true);
  });

  it('accepts the real three-entry canonical decision-view payload', () => {
    const result = validateA2uiMessage({
      version: 'v0.9',
      updateComponents: { surfaceId: SURFACE_ID, components: decisionViewComponents },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a wrong version string', () => {
    const result = validateA2uiMessage({
      version: 'v0.8',
      createSurface: { surfaceId: SURFACE_ID, catalogId: CATALOG_ID },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload carrying two message kinds at once', () => {
    const result = validateA2uiMessage({
      version: 'v0.9',
      createSurface: { surfaceId: SURFACE_ID, catalogId: CATALOG_ID },
      updateComponents: { surfaceId: SURFACE_ID, components: [] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a surfaceId with characters outside the allowed pattern', () => {
    const result = validateA2uiMessage({
      version: 'v0.9',
      createSurface: { surfaceId: 'case/D-10291', catalogId: CATALOG_ID },
    });
    expect(result.success).toBe(false);
  });

  it(`rejects an updateComponents payload with more than MAX_COMPONENTS_PER_UPDATE (${MAX_COMPONENTS_PER_UPDATE}) entries`, () => {
    const oversized = Array.from({ length: MAX_COMPONENTS_PER_UPDATE + 1 }, (_, index) => ({
      id: `c-${index}`,
      component: 'UnknownForTest',
    }));
    const result = validateA2uiMessage({
      version: 'v0.9',
      updateComponents: { surfaceId: SURFACE_ID, components: oversized },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a known component whose props fail its own catalog schema', () => {
    const result = validateA2uiMessage({
      version: 'v0.9',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{ id: 'root', component: 'TaskCreatedCard', taskId: 'x' }], // missing required props
      },
    });
    expect(result.success).toBe(false);
  });

  it(`rejects an EvidenceChecklist with more than MAX_CHECKLIST_ITEMS (${MAX_CHECKLIST_ITEMS}) items`, () => {
    const items = Array.from({ length: MAX_CHECKLIST_ITEMS + 1 }, (_, index) => ({
      label: `item-${index}`,
      present: false,
    }));
    const result = validateA2uiMessage({
      version: 'v0.9',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{ id: 'checklist', component: 'EvidenceChecklist', items }],
      },
    });
    expect(result.success).toBe(false);
  });

  it(`rejects a NextActions with more than MAX_ACTIONS (${MAX_ACTIONS}) actions`, () => {
    const actions = Array.from({ length: MAX_ACTIONS + 1 }, (_, index) => ({
      id: `action-${index}`,
      label: `Action ${index}`,
    }));
    const result = validateA2uiMessage({
      version: 'v0.9',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{ id: 'actions', component: 'NextActions', actions }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('passes an unrecognized component type through untouched (fallback renderer handles it downstream)', () => {
    const result = validateA2uiMessage({
      version: 'v0.9',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{ id: 'x', component: 'SomeFutureComponent', anything: 'goes' }],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('validateStateSnapshot / validateStateDelta', () => {
  it('accepts a plain object snapshot', () => {
    expect(validateStateSnapshot({ evidenceReadiness: null }).success).toBe(true);
  });

  it('rejects a non-object snapshot', () => {
    expect(validateStateSnapshot('not-an-object').success).toBe(false);
  });

  it('accepts a valid RFC 6902 replace op', () => {
    const result = validateStateDelta([
      { op: 'replace', path: '/evidenceReadiness', value: '2 of 4' },
    ]);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid op type', () => {
    const result = validateStateDelta([{ op: 'teleport', path: '/x', value: 1 }]);
    expect(result.success).toBe(false);
  });
});

describe('validateForwardedAction', () => {
  const valid = {
    name: 'approve_task_creation',
    surfaceId: SURFACE_ID,
    sourceComponentId: 'approve-btn',
    timestamp: '2026-07-13T10:40:00Z',
    context: {},
  };

  it('accepts a well-formed client action', () => {
    expect(validateForwardedAction(valid).success).toBe(true);
  });

  it('rejects an action missing sourceComponentId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sourceComponentId: _drop, ...rest } = valid;
    expect(validateForwardedAction(rest).success).toBe(false);
  });
});
