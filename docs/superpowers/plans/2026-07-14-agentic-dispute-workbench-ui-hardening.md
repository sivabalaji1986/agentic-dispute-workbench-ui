# agentic-dispute-workbench-ui — Hardening Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the protocol boundary resilient before the Java backend exists: runtime-validate every inbound/outbound payload, close the action-ID surface to a frozen allow-list, remove module-level mutable state in favor of an owned `WorkbenchSession`, kill the `HttpAgent` type cast, surface structured errors instead of silent drops, add captured-stream contract fixtures, wire up accessibility roles and a mode badge, add light dependency hygiene, and give the README a scannable top section. This is a hardening pass, not a feature pass.

**Architecture:** No new catalog components, no new action IDs, no visual redesign. Every module touched already exists (`src/agui/`, `src/state/`, `src/components/`) except the new files this plan creates. Validation reuses the real `@a2ui/web_core/v0_9` protocol schemas (`A2uiMessageSchema`, `A2uiClientActionSchema`) and the existing per-component catalog schemas (`src/components/catalog/schemas.ts`) rather than re-deriving shapes by hand — confirmed present in `node_modules/@a2ui/web_core/src/v0_9/schema/{server-to-client,client-to-server}.d.ts`.

**Tech Stack:** React 19 + TypeScript 5.9 strict + Vite 8 + Vitest 4 + Zod 3.25.76 (already a dependency) + `fast-json-patch` 3.1.1 (already a dependency) + Zustand 5. No new runtime dependencies are needed for validation — Zod and the protocol schemas are already present.

## Global Constraints

- No new user-facing capabilities beyond error/status surfaces; no visual redesign; no new catalog components; no new action IDs.
- Any change to what the client accepts or emits on the wire is a contract change and MUST be reflected in `docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md` as a `[convention — frozen]` amendment, with a dated changelog entry prepended to the existing changelog blockquote at the top of that file (do not replace the 2026-07-14 entry already there — add a new one above it, newest first).
- Defensive caps live as named constants in exactly one module (`src/agui/validation.ts`): `MAX_COMPONENTS_PER_UPDATE = 20`, `MAX_CHECKLIST_ITEMS = 20`, `MAX_ACTIONS = 10`, `MAX_PROGRESS_TEXT = 500`. No magic numbers duplicated elsewhere.
- Inbound flow is always: parse → on success process normally; on failure log a redacted summary (event type + first Zod issue path only — never the payload) and surface a structured error. Never throw into React. Never silently drop without a trace.
- The mock path and the live path share the exact same validation code (the validation call sites live in `src/agui/bridge.ts`, which both `MockAgent` and `HttpAgentAdapter` feed through identically).
- Reuse existing schemas — do not redefine shapes that already exist. Specifically: reuse `A2uiMessageSchema` and `A2uiClientActionSchema` from `@a2ui/web_core/v0_9`, and reuse `DecisionCardApi.schema` / `EvidenceChecklistApi.schema` / `EvidenceItemSchema` / `NextActionsApi.schema` / `NextActionItemSchema` / `ApprovalPreviewApi.schema` / `TaskCreatedCardApi.schema` from `src/components/catalog/schemas.ts`.
- Keep `npm run lint`, `npm run format:check`, `npm run build` (which runs `tsc -b`), and `npm run test` green after every task.
- Before the final task is considered done, produce (for the controller, not committed as a file): the spec-doc diff (`git diff` on the design doc) and a `src/test/fixtures/` directory listing, per the acceptance criteria below.

## Acceptance

- All existing tests pass; new tests cover: every schema's accept/reject case, unknown-action-id disables and does not dispatch, session isolation (two sequential `WorkbenchSession`s don't leak listeners), `HttpAgentAdapter` satisfies `AguiLikeAgent` against a stubbed `HttpAgent`, each fixture replays to the expected end state, and the timeline's ARIA roles are present.
- `npm run build`, `npm run lint`, `npm run typecheck` all clean.
- `docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md` has new dated changelog entries for: inbound validation & caps, the action-ID allow-list, error-event handling, and the status model. No other spec changes.

---

### Task 1: Validation schemas + caps module

**Files:**

- Create: `src/agui/validation.ts`
- Create: `src/agui/validation.test.ts`

**Interfaces:**

- Produces: `MAX_COMPONENTS_PER_UPDATE`, `MAX_CHECKLIST_ITEMS`, `MAX_ACTIONS`, `MAX_PROGRESS_TEXT` (number constants); `AgentSourceSchema` (Zod enum); `ProgressEventValueSchema`, `StateSnapshotSchema`, `StateDeltaSchema` (Zod schemas); `type ValidationFailure = { eventType: string; issuePath: string }`; `type ValidationResult<T> = { success: true; data: T } | { success: false; failure: ValidationFailure }`; functions `validateProgressEventValue(value: unknown): ValidationResult<...>`, `validateA2uiMessage(value: unknown): ValidationResult<A2uiMessage>`, `validateStateSnapshot(value: unknown)`, `validateStateDelta(value: unknown)`, `validateForwardedAction(value: unknown): ValidationResult<A2uiClientAction>`, and `logValidationFailure(failure: ValidationFailure): void`.
- Consumes: `A2uiMessageSchema`, `A2uiClientActionSchema` from `@a2ui/web_core/v0_9`; `DecisionCardApi`, `EvidenceChecklistApi`, `EvidenceItemSchema`, `NextActionsApi`, `NextActionItemSchema`, `ApprovalPreviewApi`, `TaskCreatedCardApi` from `../components/catalog/schemas`.

This task builds the module standalone — nothing wires it into `bridge.ts` yet (that's Task 2). `A2uiMessageSchema` is a Zod union of four **strict** objects (`{version, createSurface}` / `{version, updateComponents}` / `{version, updateDataModel}` / `{version, deleteSurface}` — verified in `node_modules/@a2ui/web_core/src/v0_9/schema/server-to-client.d.ts`), so parsing against it already enforces "version is the literal `'v0.9'`" and "exactly one of the four message kinds" for free — a payload carrying two message keys fails every branch of the union because each branch's `strict()` mode rejects the extra key. Do not hand-roll that logic.

- [ ] **Step 1: Write the failing tests**

```ts
// src/agui/validation.test.ts
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
    const { sourceComponentId: _drop, ...rest } = valid;
    expect(validateForwardedAction(rest).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/agui/validation.test.ts`
Expected: FAIL — `./validation` has no exported members (module doesn't exist yet).

- [ ] **Step 3: Implement the module**

```ts
// src/agui/validation.ts
import { z } from 'zod';
import { A2uiMessageSchema, A2uiClientActionSchema } from '@a2ui/web_core/v0_9';
import {
  DecisionCardApi,
  EvidenceChecklistApi,
  EvidenceItemSchema,
  NextActionsApi,
  NextActionItemSchema,
  ApprovalPreviewApi,
  TaskCreatedCardApi,
} from '../components/catalog/schemas';

/**
 * Defensive caps on inbound protocol payloads — the load-bearing limits the
 * backend must respect. See the design doc's "Inbound payload validation"
 * amendment. Named here, nowhere else, so there is exactly one place to
 * change them.
 */
export const MAX_COMPONENTS_PER_UPDATE = 20;
export const MAX_CHECKLIST_ITEMS = 20;
export const MAX_ACTIONS = 10;
export const MAX_PROGRESS_TEXT = 500;

export const AgentSourceSchema = z.enum(['orchestrator', 'case-review', 'policy']);

export const ProgressEventValueSchema = z.object({
  source: AgentSourceSchema,
  text: z.string().min(1).max(MAX_PROGRESS_TEXT),
});

const SURFACE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

type A2uiMessage = z.infer<typeof A2uiMessageSchema>;

function surfaceIdOf(message: A2uiMessage): string {
  if ('createSurface' in message) return message.createSurface.surfaceId;
  if ('updateComponents' in message) return message.updateComponents.surfaceId;
  if ('updateDataModel' in message) return message.updateDataModel.surfaceId;
  return message.deleteSurface.surfaceId;
}

// One source of truth per known component: the same schema the catalog
// itself renders against (src/components/catalog/schemas.ts), extended only
// with the array caps above. A component type outside this map is not
// rejected here — it falls through to preprocessUnknownComponents' fallback
// renderer (design doc §4.2), so validation must not block that path.
const KNOWN_COMPONENT_PROPS_SCHEMAS: Record<string, z.ZodTypeAny> = {
  DecisionCard: DecisionCardApi.schema,
  EvidenceChecklist: EvidenceChecklistApi.schema.extend({
    items: z.array(EvidenceItemSchema).max(MAX_CHECKLIST_ITEMS),
  }),
  NextActions: NextActionsApi.schema.extend({
    actions: z.array(NextActionItemSchema).max(MAX_ACTIONS),
  }),
  ApprovalPreview: ApprovalPreviewApi.schema,
  TaskCreatedCard: TaskCreatedCardApi.schema,
};

export interface ValidationFailure {
  eventType: string;
  issuePath: string;
}

export type ValidationResult<T> =
  { success: true; data: T } | { success: false; failure: ValidationFailure };

function firstIssuePath(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return '(unknown)';
  return issue.path.length > 0 ? issue.path.join('.') : '(root)';
}

export function validateProgressEventValue(
  value: unknown,
): ValidationResult<z.infer<typeof ProgressEventValueSchema>> {
  const result = ProgressEventValueSchema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    failure: { eventType: 'progress', issuePath: firstIssuePath(result.error) },
  };
}

export function validateA2uiMessage(value: unknown): ValidationResult<A2uiMessage> {
  const base = A2uiMessageSchema.safeParse(value);
  if (!base.success) {
    return {
      success: false,
      failure: { eventType: 'a2ui', issuePath: firstIssuePath(base.error) },
    };
  }
  const message = base.data;

  if (!SURFACE_ID_PATTERN.test(surfaceIdOf(message))) {
    return { success: false, failure: { eventType: 'a2ui', issuePath: 'surfaceId' } };
  }

  if ('updateComponents' in message) {
    const { components } = message.updateComponents;
    if (components.length > MAX_COMPONENTS_PER_UPDATE) {
      return {
        success: false,
        failure: { eventType: 'a2ui', issuePath: 'updateComponents.components' },
      };
    }
    for (const component of components) {
      const propsSchema = KNOWN_COMPONENT_PROPS_SCHEMAS[component.component];
      if (!propsSchema) continue; // unknown type: handled by the fallback renderer downstream
      const { component: _type, id: _id, weight: _weight, ...props } = component;
      const propsResult = propsSchema.safeParse(props);
      if (!propsResult.success) {
        return {
          success: false,
          failure: {
            eventType: 'a2ui',
            issuePath: `updateComponents.components[${component.component}].${firstIssuePath(propsResult.error)}`,
          },
        };
      }
    }
  }

  return { success: true, data: message };
}

const JsonPatchOpSchema = z.union([
  z.object({ op: z.enum(['add', 'replace', 'test']), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal('remove'), path: z.string() }),
  z.object({ op: z.enum(['move', 'copy']), path: z.string(), from: z.string() }),
]);

export const StateSnapshotSchema = z.record(z.unknown());
export const StateDeltaSchema = z.array(JsonPatchOpSchema);

export function validateStateSnapshot(
  value: unknown,
): ValidationResult<z.infer<typeof StateSnapshotSchema>> {
  const result = StateSnapshotSchema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    failure: { eventType: 'state_snapshot', issuePath: firstIssuePath(result.error) },
  };
}

export function validateStateDelta(
  value: unknown,
): ValidationResult<z.infer<typeof StateDeltaSchema>> {
  const result = StateDeltaSchema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    failure: { eventType: 'state_delta', issuePath: firstIssuePath(result.error) },
  };
}

export function validateForwardedAction(
  value: unknown,
): ValidationResult<z.infer<typeof A2uiClientActionSchema>> {
  const result = A2uiClientActionSchema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    failure: { eventType: 'forwarded_action', issuePath: firstIssuePath(result.error) },
  };
}

/**
 * Redacted by design: only the event type and the first offending Zod issue
 * path are logged, never the payload itself — see the design doc's "Inbound
 * payload validation" amendment.
 */
export function logValidationFailure(failure: ValidationFailure): void {
  console.warn(`[protocol] rejected ${failure.eventType} payload at ${failure.issuePath}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/agui/validation.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/agui/validation.ts src/agui/validation.test.ts
git commit -m "feat: add Zod validation schemas for inbound/outbound protocol payloads"
```

---

### Task 2: Wire inbound validation into the bridge + redacted logging

**Files:**

- Modify: `src/agui/bridge.ts`
- Modify: `src/agui/bridge.test.ts`

**Interfaces:**

- Consumes: `validateProgressEventValue`, `validateA2uiMessage`, `validateStateSnapshot`, `validateStateDelta`, `logValidationFailure` from `./validation` (Task 1).
- Produces: `bridge.ts`'s `applyA2uiMessage` and the `onCustomEvent`/`onStateSnapshotEvent`/`onStateDeltaEvent` handlers now validate before acting. No public export signature changes in this task (the `createWorkbenchAgentSubscriber` factory refactor is Task 5) — keep the existing `workbenchAgentSubscriber` singleton and `resetBridgeState()` export for now so this task stays isolated to validation wiring.

This task does not add the structured `WorkbenchError` UI (Task 7) yet — for now, a validation failure is logged (redacted) and the message is dropped without mutating state, which already satisfies "never throw into React, never silently drop without a trace" (the trace is the console warning). Task 7 upgrades this to a visible panel notice by adding a store call at the same call sites.

- [ ] **Step 1: Write the failing tests**

Add to `src/agui/bridge.test.ts` (after the existing tests, same file, same `describe` block or a new one):

```ts
import { validateA2uiMessage } from './validation'; // only if needed for assertions; otherwise omit

// ...inside describe('workbenchAgentSubscriber', ...):

it('drops a malformed progress event instead of appending it, without throwing', () => {
  const event: CustomEvent = {
    type: EventType.CUSTOM,
    name: 'progress',
    value: { source: 'not-a-real-agent', text: 'hi' },
  };
  expect(() => workbenchAgentSubscriber.onCustomEvent?.(fakeParams(event))).not.toThrow();
  expect(useWorkbenchStore.getState().progressLines).toHaveLength(0);
});

it('drops an a2ui message with the wrong version instead of touching the surface', () => {
  const event: CustomEvent = {
    type: EventType.CUSTOM,
    name: 'a2ui',
    value: { version: 'v0.8', createSurface: { surfaceId: 'case-X', catalogId: 'x' } },
  };
  expect(() => workbenchAgentSubscriber.onCustomEvent?.(fakeParams(event))).not.toThrow();
  const processor = useWorkbenchStore.getState().processor;
  expect(processor.model.getSurface('case-X')).toBeUndefined();
});

it('drops an oversized updateComponents payload instead of applying it', () => {
  const surfaceId = 'case-D-10291';
  const createEvent: CustomEvent = {
    type: EventType.CUSTOM,
    name: 'a2ui',
    value: {
      version: 'v0.9',
      createSurface: {
        surfaceId,
        catalogId: 'https://dispute-workbench.internal/catalogs/v1.json',
      },
    },
  };
  const oversized = Array.from({ length: 21 }, (_, index) => ({
    id: `c-${index}`,
    component: 'UnknownForTest',
  }));
  const updateEvent: CustomEvent = {
    type: EventType.CUSTOM,
    name: 'a2ui',
    value: { version: 'v0.9', updateComponents: { surfaceId, components: oversized } },
  };
  workbenchAgentSubscriber.onCustomEvent?.(fakeParams(createEvent));
  expect(() => workbenchAgentSubscriber.onCustomEvent?.(fakeParams(updateEvent))).not.toThrow();
});

it('drops a STATE_DELTA with an invalid op instead of applying it', () => {
  const snapshot: StateSnapshotEvent = {
    type: EventType.STATE_SNAPSHOT,
    snapshot: { evidenceReadiness: null },
  };
  const badDelta = {
    type: EventType.STATE_DELTA,
    delta: [{ op: 'teleport', path: '/evidenceReadiness', value: 'x' }],
  } as unknown as StateDeltaEvent;
  workbenchAgentSubscriber.onStateSnapshotEvent?.(fakeParams(snapshot));
  expect(() => workbenchAgentSubscriber.onStateDeltaEvent?.(fakeParams(badDelta))).not.toThrow();
  expect(useWorkbenchStore.getState().evidenceReadiness).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/agui/bridge.test.ts`
Expected: FAIL — the malformed events currently get processed (no validation exists yet), so e.g. the progress line IS appended, or the STATE_DELTA IS applied.

- [ ] **Step 3: Wire validation into bridge.ts**

```ts
// src/agui/bridge.ts
import { applyPatch, type Operation } from 'fast-json-patch';
import type { AgentSubscriber } from '@ag-ui/client';
import { isA2uiCustomEvent, isProgressCustomEvent } from './events';
import {
  validateProgressEventValue,
  validateA2uiMessage,
  validateStateSnapshot,
  validateStateDelta,
  logValidationFailure,
} from './validation';
import { useWorkbenchStore } from '../state/workbenchStore';
import { preprocessUnknownComponents } from '../components/catalog/catalogInstance';

let stateDoc: Record<string, unknown> = {};

export function resetBridgeState(): void {
  stateDoc = {};
}

function syncEvidenceReadiness(): void {
  const value = stateDoc.evidenceReadiness;
  useWorkbenchStore.getState().setEvidenceReadiness(typeof value === 'string' ? value : null);
}

function applyA2uiMessage(rawValue: unknown): void {
  const validated = validateA2uiMessage(rawValue);
  if (!validated.success) {
    logValidationFailure(validated.failure);
    return;
  }
  const message = validated.data;
  const processor = useWorkbenchStore.getState().processor;

  if ('createSurface' in message) {
    const surfaceId = message.createSurface.surfaceId;
    if (processor.model.getSurface(surfaceId)) {
      console.warn(`A2UI: ignoring duplicate createSurface for existing surface ${surfaceId}`);
      return;
    }
    processor.processMessages([message]);
    return;
  }

  if ('updateComponents' in message) {
    processor.processMessages([
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: message.updateComponents.surfaceId,
          components: preprocessUnknownComponents(message.updateComponents.components as never),
        },
      },
    ]);
    return;
  }

  processor.processMessages([message]);
}

export const workbenchAgentSubscriber: AgentSubscriber = {
  onRunStartedEvent({ event }) {
    useWorkbenchStore.getState().setRunId(event.runId);
    useWorkbenchStore.getState().setConnectionStatus('streaming');
  },
  onRunFinishedEvent() {
    useWorkbenchStore.getState().setConnectionStatus('finished');
  },
  onRunErrorEvent() {
    useWorkbenchStore.getState().setConnectionStatus('disconnected');
  },
  onStateSnapshotEvent({ event }) {
    const validated = validateStateSnapshot(event.snapshot);
    if (!validated.success) {
      logValidationFailure(validated.failure);
      return;
    }
    stateDoc = validated.data;
    syncEvidenceReadiness();
  },
  onStateDeltaEvent({ event }) {
    const validated = validateStateDelta(event.delta);
    if (!validated.success) {
      logValidationFailure(validated.failure);
      return;
    }
    const result = applyPatch(stateDoc, validated.data as Operation[], true, false);
    stateDoc = result.newDocument;
    syncEvidenceReadiness();
  },
  onCustomEvent({ event }) {
    if (isProgressCustomEvent(event)) {
      const validated = validateProgressEventValue(event.value);
      if (!validated.success) {
        logValidationFailure(validated.failure);
        return;
      }
      useWorkbenchStore.getState().appendProgressLine(validated.data.source, validated.data.text);
      return;
    }
    if (isA2uiCustomEvent(event)) {
      applyA2uiMessage(event.value);
    }
  },
};
```

Note: `preprocessUnknownComponents` currently types its parameter as `A2uiComponentJson[]` (`{id: string; component: string; ...}`), while the validated `message.updateComponents.components` entries type as the library's own component shape (`id` optional, `weight` optional, passthrough). The `as never` cast on that one call keeps this task scoped to validation wiring only — Task 5 or a follow-up may tighten `A2uiComponentJson` to match the library type, but that is out of scope here since it does not affect runtime behavior (the library allows `id` to be optional but every real payload always supplies one).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/agui/bridge.test.ts`
Expected: PASS, including the four new reject-path tests and all prior accept-path tests (unchanged behavior for valid payloads).

- [ ] **Step 5: Run the full suite, typecheck, and commit**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: all clean — this task must not change behavior for any existing valid-payload test (mock replay, integration test, all catalog component tests).

```bash
git add src/agui/bridge.ts src/agui/bridge.test.ts
git commit -m "feat: validate inbound progress/a2ui/state events before processing"
```

- [ ] **Step 6: Amend the design doc**

Open `docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md`. Prepend a new changelog entry **above** the existing 2026-07-14 blockquote (same blockquote style, newest first):

```markdown
> **2026-07-14 amendment (hardening pass):** New §3.6 "Inbound payload
> validation" documents that the client validates every inbound `progress`,
> `a2ui`, `STATE_SNAPSHOT`, and `STATE_DELTA` payload against Zod schemas
> before acting on it, with fixed caps (`MAX_COMPONENTS_PER_UPDATE=20`,
> `MAX_CHECKLIST_ITEMS=20`, `MAX_ACTIONS=10`, `MAX_PROGRESS_TEXT=500`). These
> limits are load-bearing — a backend payload that exceeds them is rejected,
> not truncated.
```

Then add a new `### 3.6 Inbound payload validation` subsection after `### 3.5 createSurface lifecycle` (before `## 4. A2UI catalog`):

```markdown
### 3.6 Inbound payload validation

**[convention — frozen]** Every inbound `progress` and `a2ui` `CUSTOM` event
value, and every `STATE_SNAPSHOT`/`STATE_DELTA` payload, is validated against
a Zod schema (`src/agui/validation.ts`) before the client acts on it —
including in mock mode, which runs through the identical validation code as
the live path. A payload that fails validation is dropped (never applied,
never thrown into React) and logged as a redacted summary (event type + the
first Zod issue path only — never the raw payload). The backend must respect
these fixed caps:

| Cap                         | Value | Applies to                                      |
| --------------------------- | ----- | ----------------------------------------------- |
| `MAX_COMPONENTS_PER_UPDATE` | 20    | `updateComponents.components.length`            |
| `MAX_CHECKLIST_ITEMS`       | 20    | `EvidenceChecklist.items.length`                |
| `MAX_ACTIONS`               | 10    | `NextActions.actions.length`                    |
| `MAX_PROGRESS_TEXT`         | 500   | `progress.text.length` (also must be non-empty) |

`surfaceId` must match `^[a-zA-Z0-9_-]{1,64}$` on every message that carries
one. `progress.source` must be one of `orchestrator`/`case-review`/`policy` —
an unrecognized source is rejected, not passed through. Component props for
the five catalog types are validated against the same schemas the catalog
itself renders against (`src/components/catalog/schemas.ts`); a component
type outside the closed catalog is _not_ rejected here — it is intentionally
left to the existing `UnknownComponentFallback` safety net (§4.2).
```

```bash
git add docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md
git commit -m "docs: amend design doc with inbound payload validation contract"
```

---

### Task 3: Outbound `ForwardedActionSchema` validation before dispatch

**Files:**

- Modify: `src/agui/client.ts`
- Modify: (new) `src/agui/client.test.ts` if one does not already exist — check first; if the file doesn't exist, create it.

**Interfaces:**

- Consumes: `validateForwardedAction`, `logValidationFailure` from `./validation`.

Currently `client.ts` subscribes to `processor.model.onAction` and forwards every action verbatim: `useWorkbenchStore.getState().processor.model.onAction.subscribe((action) => { void agent?.runAgent({ forwardedProps: { a2uiAction: action } }); });`. This task validates `action` before forwarding it. In practice this action always comes from the A2UI library's own internal dispatch machinery (already shaped as `A2uiClientAction`), so this is defense-in-depth, not a behavior change for any currently-passing path — but it closes the gap where a future catalog change could otherwise forward a malformed action to the backend unnoticed.

- [ ] **Step 1: Write the failing test**

Check whether `src/agui/client.test.ts` exists (`ls src/agui/`). If not, create it:

```ts
// src/agui/client.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useWorkbenchStore } from '../state/workbenchStore';

describe('onAction forwarding', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('does not forward a malformed action (missing sourceComponentId) to runAgent', async () => {
    // Import fresh so the module-level onAction subscription (wired at
    // import time — see client.ts) attaches to a clean processor.
    await import('./client');
    const processor = useWorkbenchStore.getState().processor;
    const malformed = {
      name: 'approve_task_creation',
      surfaceId: 'case-X',
      // sourceComponentId missing
      timestamp: '2026-07-13T10:40:00Z',
      context: {},
    };
    // No agent is connected yet (no case started), so runAgent would throw
    // if reached with a bad action — this only verifies no exception surfaces
    // and no console error beyond the expected redacted warning.
    expect(() => processor.model.onAction.publish(malformed as never)).not.toThrow();
  });
});
```

If `SurfaceGroupModel`/`EventSource` does not expose a `.publish(...)` method for tests to simulate an action (check `node_modules/@a2ui/web_core/src/v0_9/common/events.d.ts` for the `EventSource`/`Subscription` API), adapt the test to instead call the subscriber callback directly by capturing it: refactor this single test to invoke the same validation path client.ts uses by unit-testing that `client.ts`'s internal handler — since the handler itself isn't exported, the simplest reliable test is to assert `validateForwardedAction` (Task 1, already covered) rejects the malformed shape, and add one integration-level assertion here that a real click never dispatches with a manufactured bad shape. If constructing a realistic failing case through the public API proves impractical, keep this test minimal: assert that importing `client.ts` does not throw, and rely on `validation.test.ts`'s existing reject-case coverage for the schema itself — note this trade-off in the task report rather than forcing a brittle test.

- [ ] **Step 2: Run test to verify current behavior**

Run: `npm run test -- src/agui/client.test.ts`
Expected: passes or fails depending on which variant above was written — resolve before moving on; this step exists to confirm the test harness can actually exercise `client.ts`'s onAction subscription at all before changing its implementation.

- [ ] **Step 3: Wire validation into the onAction subscription**

```ts
// src/agui/client.ts — replace the top-level subscription
import { HttpAgent, type AgentSubscriber } from '@ag-ui/client';
import { MockAgent } from '../mock/mockAgent';
import { workbenchAgentSubscriber, resetBridgeState } from './bridge';
import { useWorkbenchStore } from '../state/workbenchStore';
import { validateForwardedAction, logValidationFailure } from './validation';

const isMock = import.meta.env.VITE_MOCK !== 'false';
const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL ?? 'http://localhost:8080/agui';

export type AguiLikeAgent = {
  threadId: string;
  subscribe(subscriber: AgentSubscriber): { unsubscribe: () => void };
  runAgent(params?: { forwardedProps?: unknown }): Promise<unknown>;
  abortRun(): void;
};

let agent: AguiLikeAgent | null = null;
let currentThreadId: string | null = null;

useWorkbenchStore.getState().processor.model.onAction.subscribe((action) => {
  const validated = validateForwardedAction(action);
  if (!validated.success) {
    logValidationFailure(validated.failure);
    return;
  }
  void agent?.runAgent({ forwardedProps: { a2uiAction: validated.data } });
});

function createAgent(threadId: string): AguiLikeAgent {
  return isMock
    ? new MockAgent()
    : (new HttpAgent({ url: orchestratorUrl, threadId }) as unknown as AguiLikeAgent);
}

export function startDemoCase(disputeText: string): void {
  const caseId = 'D-10291';
  currentThreadId = `thread-${caseId}-${Date.now()}`;

  resetBridgeState();
  useWorkbenchStore.getState().startCase({ caseId, threadId: currentThreadId, disputeText });

  agent = createAgent(currentThreadId);
  agent.subscribe(workbenchAgentSubscriber);
  void agent.runAgent({});
}

export function reconnect(): void {
  if (!currentThreadId) return;
  agent = createAgent(currentThreadId);
  agent.subscribe(workbenchAgentSubscriber);
  useWorkbenchStore.getState().setConnectionStatus('connecting');
  void agent.runAgent({});
}
```

(This is intentionally the _minimal_ diff for this task — Task 5 replaces this whole module's shape with `WorkbenchSession`. Keep the diff here scoped to validation only so Task 5's diff stays reviewable.)

- [ ] **Step 4: Run the full suite and existing integration test**

Run: `npm run test`
Expected: all pass, including `src/test/integration.test.tsx`'s full mock-mode replay (proves real dispatched actions — `create_evidence_request_task`, `approve_task_creation`, `cancel_task_creation` — still validate successfully and reach the mock agent unchanged).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/agui/client.ts src/agui/client.test.ts
git commit -m "feat: validate outbound A2UI client actions before forwarding to the agent"
```

---

### Task 4: Action-ID allow-list

**Files:**

- Create: `src/agui/actionIds.ts`
- Create: `src/agui/actionIds.test.ts`
- Modify: `src/components/catalog/NextActions.tsx`
- Modify: `src/components/catalog/NextActions.test.tsx`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md`

**Interfaces:**

- Produces: `DISPATCHABLE_ACTION_IDS` (readonly tuple), `type DispatchableActionId`, `isDispatchableActionId(id: string): id is DispatchableActionId`.
- Consumes (in `NextActions.tsx`): `isDispatchableActionId` from `../../agui/actionIds`.

`ApprovalPreview`'s `onApprove`/`onCancel` are pre-bound `Action` callbacks assembled by the A2UI library itself from the schema (`CommonSchemas.Action`), not a raw id the component chooses — there is no dynamic action-id surface to gate there. This task's allow-list check applies to `NextActions`, the one place the client resolves a raw `action.id` string into a dispatch.

- [ ] **Step 1: Write the failing tests**

```ts
// src/agui/actionIds.test.ts
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
```

```tsx
// src/components/catalog/NextActions.test.tsx — add to the existing file
it('renders a disabled button for an action id outside the allow-list and does not dispatch it', async () => {
  const onAction = vi.fn();
  render(
    <NextActionsHarness
      actions={[{ id: 'delete_everything', label: 'Delete Everything' }]}
      onAction={onAction}
    />,
  );
  const button = screen.getByRole('button', { name: 'Delete Everything' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('title', 'Unknown action — not dispatchable');
  await userEvent.click(button);
  expect(onAction).not.toHaveBeenCalled();
});
```

Read the existing `src/components/catalog/NextActions.test.tsx` and `src/components/catalog/testUtils.tsx` first to match the exact harness/render helper already used by the other tests in that file (there is already a pattern rendering `NextActions` with a given `actions` array and an `onAction`/`dispatchAction` spy — reuse it verbatim rather than inventing a new one).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/agui/actionIds.test.ts src/components/catalog/NextActions.test.tsx`
Expected: FAIL — `./actionIds` doesn't exist; the new NextActions test fails because the button isn't disabled yet.

- [ ] **Step 3: Implement the allow-list module**

```ts
// src/agui/actionIds.ts
/**
 * The frozen set of action ids the client will ever dispatch. Labels are
 * display-only and never gate dispatch — only the id does. See the design
 * doc's "Action-ID allow-list" amendment: the backend may not invent new
 * action ids without a spec change.
 */
export const DISPATCHABLE_ACTION_IDS = [
  'create_evidence_request_task',
  'approve_task_creation',
  'cancel_task_creation',
  'escalate_to_reviewer',
  'save_case_note',
] as const;

export type DispatchableActionId = (typeof DISPATCHABLE_ACTION_IDS)[number];

export function isDispatchableActionId(id: string): id is DispatchableActionId {
  return (DISPATCHABLE_ACTION_IDS as readonly string[]).includes(id);
}
```

- [ ] **Step 4: Wire the allow-list into NextActions**

```tsx
// src/components/catalog/NextActions.tsx
import { useState } from 'react';
import { createBinderlessComponentImplementation } from '@a2ui/react/v0_9';
import { NextActionsApi } from './schemas';
import { isDispatchableActionId } from '../../agui/actionIds';

interface NextActionItem {
  id: string;
  label: string;
}

const OUT_OF_SCOPE_LABELS: Record<string, string> = {
  escalate_to_reviewer: 'Escalate to Reviewer',
  save_case_note: 'Save Case Note',
};

const PRIMARY_ACTION_ID = 'create_evidence_request_task';

export const NextActions = createBinderlessComponentImplementation(
  NextActionsApi,
  ({ context }) => {
    const { actions } = context.componentModel.properties as { actions: NextActionItem[] };
    const [scopeNotice, setScopeNotice] = useState<string | null>(null);

    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ledger-line pt-3">
        {actions.map((action) => {
          const outOfScopeLabel = OUT_OF_SCOPE_LABELS[action.id];
          const isPrimary = action.id === PRIMARY_ACTION_ID;
          const dispatchable = isDispatchableActionId(action.id);

          if (!dispatchable) {
            return (
              <button
                key={action.id}
                type="button"
                disabled
                title="Unknown action — not dispatchable"
                className="cursor-not-allowed text-sm text-ink/30 underline decoration-ink/15 underline-offset-2"
              >
                {action.label}
              </button>
            );
          }

          return (
            <button
              key={action.id}
              type="button"
              className={
                isPrimary
                  ? 'rounded-[var(--radius-card)] border border-ink px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-paper'
                  : 'text-sm text-ink/60 underline decoration-ink/25 underline-offset-2 hover:text-ink hover:decoration-ink/50'
              }
              onClick={() => {
                if (outOfScopeLabel) {
                  setScopeNotice(`${outOfScopeLabel} is not in demo scope`);
                  return;
                }
                void context.dispatchAction({ event: { name: action.id, context: {} } });
              }}
            >
              {action.label}
            </button>
          );
        })}
        {scopeNotice && <p className="basis-full text-xs text-ink/45">{scopeNotice}</p>}
      </div>
    );
  },
);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/agui/actionIds.test.ts src/components/catalog/NextActions.test.tsx`
Expected: PASS.

Run: `npm run test`
Expected: full suite still green (the demo script's real action ids are all in the allow-list, so the integration test is unaffected).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/agui/actionIds.ts src/agui/actionIds.test.ts src/components/catalog/NextActions.tsx src/components/catalog/NextActions.test.tsx
git commit -m "feat: gate NextActions dispatch behind a frozen action-id allow-list"
```

- [ ] **Step 7: Amend the design doc and README**

Prepend to the design doc's changelog blockquote (above the existing entries):

```markdown
> **2026-07-14 amendment (hardening pass):** New note in §4.1 documents the
> frozen action-id allow-list (`src/agui/actionIds.ts`): the backend may only
> ever expect `create_evidence_request_task`, `approve_task_creation`,
> `cancel_task_creation`, `escalate_to_reviewer`, or `save_case_note` to be
> dispatched by `NextActions`. Any other id renders disabled and is never
> sent.
```

Add to `docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md` §4.1, immediately after the existing "Two `NextActions` ids never dispatch" paragraph:

```markdown
**[convention — frozen] Action-ID allow-list:** dispatch is keyed by id, never
by label — `NextActions.actions[].label` is display-only. The client
maintains a single frozen list of dispatchable ids
(`src/agui/actionIds.ts`): `create_evidence_request_task`,
`approve_task_creation`, `cancel_task_creation`, `escalate_to_reviewer`,
`save_case_note`. Any `NextActions` entry whose `id` is outside this list
renders as a disabled button ("Unknown action — not dispatchable") and is
never dispatched, regardless of its `label`. Adding a new dispatchable action
id is a contract change and requires updating this list and this section, not
just the backend payload.
```

In `README.md`, find the "Contract notes for backend implementers" section (around line 206) and add one bullet consistent with the existing list style there:

```markdown
- **Action ids are allow-listed.** The client only ever dispatches
  `create_evidence_request_task`, `approve_task_creation`,
  `cancel_task_creation`, `escalate_to_reviewer`, or `save_case_note` from
  `NextActions`. An action id outside that list renders disabled and never
  reaches the backend — adding a new action id means updating
  `src/agui/actionIds.ts` and the design doc, not just the payload.
```

```bash
git add docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md README.md
git commit -m "docs: document the frozen action-id allow-list in the spec and README"
```

---

### Task 5: `WorkbenchSession` controller (remove module-level mutable state)

**Files:**

- Create: `src/agui/types.ts`
- Create: `src/agui/workbenchSession.ts`
- Create: `src/agui/workbenchSession.test.ts`
- Modify: `src/agui/bridge.ts`
- Modify: `src/agui/bridge.test.ts`
- Modify: `src/agui/client.ts`
- Modify: `src/state/workbenchStore.ts`
- Modify: `src/state/workbenchStore.test.ts`

**Interfaces:**

- Produces (`src/agui/types.ts`): `export type AguiLikeAgent = { threadId: string; subscribe(...): {unsubscribe: () => void}; runAgent(params?: {forwardedProps?: unknown}): Promise<unknown>; abortRun(): void }` (moved verbatim out of `client.ts`, no shape change).
- Produces (`src/agui/bridge.ts`): `export function createWorkbenchAgentSubscriber(processor: MessageProcessor<ReactComponentImplementation>, onProtocolError: (failure: ValidationFailure) => void): AgentSubscriber` — replaces the module-level `workbenchAgentSubscriber` singleton and `resetBridgeState()`. `stateDoc` becomes a closure variable local to each call, not module state.
- Produces (`src/agui/workbenchSession.ts`): `export class WorkbenchSession { readonly threadId: string; constructor(threadId: string, opts?: { agentFactory?: () => AguiLikeAgent }); start(): void; dispatchAction(a2uiAction: unknown): void; reconnect(): void; abort(): void; dispose(): void }`.
- Produces (`src/state/workbenchStore.ts`): new action `setProcessor(processor: MessageProcessor<ReactComponentImplementation>): void`.
- Consumes: `MockAgent` from `../mock/mockAgent`; `validateForwardedAction`, `logValidationFailure` from `./validation`; `disputeCatalog` from `../components/catalog/catalogInstance`; `MessageProcessor` from `@a2ui/web_core/v0_9`.

This is the largest single task in the plan. Read `src/agui/client.ts`, `src/agui/bridge.ts`, and `src/state/workbenchStore.ts` in full before starting — this task rewrites all three.

**Design:** `WorkbenchSession` owns everything that used to be module-level `let` state: the `agent` handle, the `threadId`, its own `MessageProcessor` instance (a _fresh_ processor per session — this is what makes "two sequential sessions don't leak" true even though today only one case can ever be started), the RFC-6902 `stateDoc`, and both subscription handles (`agent.subscribe(...)` and `processor.model.onAction.subscribe(...)`). `dispose()` unsubscribes both. The Zustand store keeps holding UI-facing state (`progressLines`, `evidenceReadiness`, `connectionStatus`, `caseId`, etc. — these remain legitimate global projections of "whatever the current session is doing"), plus a `processor` field that mirrors the session's own processor so `DecisionPanel.tsx` keeps working unchanged (it already reacts to `processor` changing — see its `useEffect` dependency array).

- [ ] **Step 1: Extract `AguiLikeAgent` into its own module**

```ts
// src/agui/types.ts
import type { AgentSubscriber } from '@ag-ui/client';

export type AguiLikeAgent = {
  threadId: string;
  subscribe(subscriber: AgentSubscriber): { unsubscribe: () => void };
  runAgent(params?: { forwardedProps?: unknown }): Promise<unknown>;
  abortRun(): void;
};
```

- [ ] **Step 2: Add `setProcessor` to the store**

In `src/state/workbenchStore.ts`, add to the `WorkbenchState` interface and the store body:

```ts
  setProcessor: (processor: MessageProcessor<ReactComponentImplementation>) => void;
```

```ts
  setProcessor: (processor) => set({ processor }),
```

Add this test to `src/state/workbenchStore.test.ts`:

```ts
it('setProcessor swaps the processor instance the store exposes', () => {
  const first = useWorkbenchStore.getState().processor;
  const second = new MessageProcessor([disputeCatalog]);
  useWorkbenchStore.getState().setProcessor(second);
  expect(useWorkbenchStore.getState().processor).toBe(second);
  expect(useWorkbenchStore.getState().processor).not.toBe(first);
});
```

(Add the needed imports — `MessageProcessor` from `@a2ui/web_core/v0_9`, `disputeCatalog` from `../components/catalog/catalogInstance` — at the top of the test file alongside the existing ones.)

Run: `npm run test -- src/state/workbenchStore.test.ts` → expect PASS once implemented (this one is additive and should pass immediately after Step 2; no separate red/green needed beyond confirming it fails before the `setProcessor` action exists).

- [ ] **Step 3: Rewrite `bridge.ts` as a subscriber factory**

```ts
// src/agui/bridge.ts
import { applyPatch, type Operation } from 'fast-json-patch';
import type { AgentSubscriber } from '@ag-ui/client';
import type { MessageProcessor } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { isA2uiCustomEvent, isProgressCustomEvent } from './events';
import {
  validateProgressEventValue,
  validateA2uiMessage,
  validateStateSnapshot,
  validateStateDelta,
  logValidationFailure,
  type ValidationFailure,
} from './validation';
import { useWorkbenchStore } from '../state/workbenchStore';
import { preprocessUnknownComponents } from '../components/catalog/catalogInstance';

/**
 * Builds a fresh AG-UI subscriber bound to one session's own MessageProcessor
 * and RFC-6902 state document — both are closed over here, not module-level,
 * so two WorkbenchSessions never share state (see workbenchSession.ts).
 */
export function createWorkbenchAgentSubscriber(
  processor: MessageProcessor<ReactComponentImplementation>,
  onProtocolError: (failure: ValidationFailure) => void = logValidationFailure,
): AgentSubscriber {
  let stateDoc: Record<string, unknown> = {};

  function syncEvidenceReadiness(): void {
    const value = stateDoc.evidenceReadiness;
    useWorkbenchStore.getState().setEvidenceReadiness(typeof value === 'string' ? value : null);
  }

  function applyA2uiMessage(rawValue: unknown): void {
    const validated = validateA2uiMessage(rawValue);
    if (!validated.success) {
      onProtocolError(validated.failure);
      return;
    }
    const message = validated.data;

    if ('createSurface' in message) {
      const surfaceId = message.createSurface.surfaceId;
      if (processor.model.getSurface(surfaceId)) {
        console.warn(`A2UI: ignoring duplicate createSurface for existing surface ${surfaceId}`);
        return;
      }
      processor.processMessages([message]);
      return;
    }

    if ('updateComponents' in message) {
      processor.processMessages([
        {
          version: 'v0.9',
          updateComponents: {
            surfaceId: message.updateComponents.surfaceId,
            components: preprocessUnknownComponents(message.updateComponents.components as never),
          },
        },
      ]);
      return;
    }

    processor.processMessages([message]);
  }

  return {
    onRunStartedEvent({ event }) {
      useWorkbenchStore.getState().setRunId(event.runId);
      useWorkbenchStore.getState().setConnectionStatus('streaming');
    },
    onRunFinishedEvent() {
      useWorkbenchStore.getState().setConnectionStatus('finished');
    },
    onRunErrorEvent() {
      useWorkbenchStore.getState().setConnectionStatus('disconnected');
    },
    onRunFailed() {
      useWorkbenchStore.getState().setConnectionStatus('disconnected');
    },
    onStateSnapshotEvent({ event }) {
      const validated = validateStateSnapshot(event.snapshot);
      if (!validated.success) {
        onProtocolError(validated.failure);
        return;
      }
      stateDoc = validated.data;
      syncEvidenceReadiness();
    },
    onStateDeltaEvent({ event }) {
      const validated = validateStateDelta(event.delta);
      if (!validated.success) {
        onProtocolError(validated.failure);
        return;
      }
      const result = applyPatch(stateDoc, validated.data as Operation[], true, false);
      stateDoc = result.newDocument;
      syncEvidenceReadiness();
    },
    onCustomEvent({ event }) {
      if (isProgressCustomEvent(event)) {
        const validated = validateProgressEventValue(event.value);
        if (!validated.success) {
          onProtocolError(validated.failure);
          return;
        }
        useWorkbenchStore.getState().appendProgressLine(validated.data.source, validated.data.text);
        return;
      }
      if (isA2uiCustomEvent(event)) {
        applyA2uiMessage(event.value);
      }
    },
  };
}
```

(`onRunFailed` is added here with the same minimal behavior `onRunErrorEvent` already had — Task 7 gives both hooks distinct, structured error handling. Adding the hook now, even minimally, means Task 7's diff only changes behavior, not shape.)

- [ ] **Step 4: Rewrite `bridge.test.ts` for the factory shape**

Replace the file's setup so each test builds its own processor and subscriber instead of relying on the store's shared one and `resetBridgeState()`:

```ts
// src/agui/bridge.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { EventType } from '@ag-ui/client';
import type {
  CustomEvent,
  RunStartedEvent,
  RunFinishedEvent,
  RunErrorEvent,
  StateSnapshotEvent,
  StateDeltaEvent,
} from '@ag-ui/client';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { createWorkbenchAgentSubscriber } from './bridge';
import { useWorkbenchStore } from '../state/workbenchStore';
import { disputeCatalog } from '../components/catalog/catalogInstance';
import type { ValidationFailure } from './validation';

function fakeParams<E>(event: E) {
  return { event, messages: [], state: {}, agent: {} as never, input: {} as never };
}

describe('createWorkbenchAgentSubscriber', () => {
  let processor: MessageProcessor<never>;
  let protocolErrors: ValidationFailure[];
  let workbenchAgentSubscriber: ReturnType<typeof createWorkbenchAgentSubscriber>;

  beforeEach(() => {
    processor = new MessageProcessor([disputeCatalog]) as never;
    protocolErrors = [];
    workbenchAgentSubscriber = createWorkbenchAgentSubscriber(processor, (failure) => {
      protocolErrors.push(failure);
    });
    useWorkbenchStore.setState({
      caseId: 'D-10291',
      threadId: 't-1',
      runId: null,
      connectionStatus: 'idle',
      progressLines: [],
      evidenceReadiness: null,
      processor: processor as never,
    });
  });

  // ... keep every existing test from the current file, unchanged in
  // assertions, but each now uses the locally built `workbenchAgentSubscriber`
  // and `processor` instead of the imported singleton and
  // `useWorkbenchStore.getState().processor`.

  it('drops a malformed progress event instead of appending it, and reports it', () => {
    const event: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'progress',
      value: { source: 'not-a-real-agent', text: 'hi' },
    };
    expect(() => workbenchAgentSubscriber.onCustomEvent?.(fakeParams(event))).not.toThrow();
    expect(useWorkbenchStore.getState().progressLines).toHaveLength(0);
    expect(protocolErrors).toHaveLength(1);
    expect(protocolErrors[0]).toMatchObject({ eventType: 'progress' });
  });
});
```

Port over every test body from the current `bridge.test.ts` (RUN_STARTED, RUN_FINISHED, RUN_ERROR, progress append, a2ui feed, duplicate createSurface, STATE_SNAPSHOT+STATE_DELTA, and the four reject-path tests added in Task 2) into this new `describe` block, replacing `workbenchAgentSubscriber` (formerly the import) with the locally-built one from `beforeEach`, and `useWorkbenchStore.getState().processor` with the local `processor` variable where the old tests read it.

- [ ] **Step 5: Write `WorkbenchSession`**

```ts
// src/agui/workbenchSession.ts
import { HttpAgent } from '@ag-ui/client';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { MockAgent } from '../mock/mockAgent';
import { createWorkbenchAgentSubscriber } from './bridge';
import { useWorkbenchStore } from '../state/workbenchStore';
import { disputeCatalog } from '../components/catalog/catalogInstance';
import { validateForwardedAction, logValidationFailure } from './validation';
import type { AguiLikeAgent } from './types';

const isMock = import.meta.env.VITE_MOCK !== 'false';
const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL ?? 'http://localhost:8080/agui';

function defaultAgentFactory(threadId: string): AguiLikeAgent {
  return isMock
    ? new MockAgent()
    : (new HttpAgent({ url: orchestratorUrl, threadId }) as unknown as AguiLikeAgent);
}

/**
 * Owns everything a single case session needs: the agent handle, the
 * threadId, a dedicated MessageProcessor + its subscription, and the AG-UI
 * subscription. A fresh session is created per "Review Dispute" click
 * (see client.ts) so nothing from a prior case can leak into the next one.
 */
export class WorkbenchSession {
  readonly threadId: string;
  private readonly processor: MessageProcessor<ReactComponentImplementation>;
  private agent: AguiLikeAgent;
  private agentSubscription: { unsubscribe: () => void } | null = null;
  private actionSubscription: { unsubscribe: () => void } | null = null;
  private readonly createAgent: () => AguiLikeAgent;

  constructor(threadId: string, opts: { agentFactory?: () => AguiLikeAgent } = {}) {
    this.threadId = threadId;
    this.processor = new MessageProcessor<ReactComponentImplementation>([disputeCatalog]);
    this.createAgent = opts.agentFactory ?? (() => defaultAgentFactory(threadId));
    this.agent = this.createAgent();
  }

  start(): void {
    useWorkbenchStore.getState().setProcessor(this.processor);
    const subscriber = createWorkbenchAgentSubscriber(this.processor);
    this.agentSubscription = this.agent.subscribe(subscriber);
    this.actionSubscription = this.processor.model.onAction.subscribe((action) => {
      const validated = validateForwardedAction(action);
      if (!validated.success) {
        logValidationFailure(validated.failure);
        return;
      }
      this.dispatchAction(validated.data);
    });
    void this.agent.runAgent({});
  }

  dispatchAction(a2uiAction: unknown): void {
    void this.agent.runAgent({ forwardedProps: { a2uiAction } });
  }

  reconnect(): void {
    this.agentSubscription?.unsubscribe();
    this.agent = this.createAgent();
    const subscriber = createWorkbenchAgentSubscriber(this.processor);
    this.agentSubscription = this.agent.subscribe(subscriber);
    useWorkbenchStore.getState().setConnectionStatus('connecting');
    void this.agent.runAgent({});
  }

  abort(): void {
    this.agent.abortRun();
  }

  dispose(): void {
    this.agentSubscription?.unsubscribe();
    this.agentSubscription = null;
    this.actionSubscription?.unsubscribe();
    this.actionSubscription = null;
  }
}
```

- [ ] **Step 6: Write `workbenchSession.test.ts`**

```ts
// src/agui/workbenchSession.test.ts
import { describe, expect, it, vi } from 'vitest';
import { EventType, type AgentSubscriber } from '@ag-ui/client';
import { WorkbenchSession } from './workbenchSession';
import { useWorkbenchStore } from '../state/workbenchStore';
import type { AguiLikeAgent } from './types';

function fakeAgent(): { agent: AguiLikeAgent; subscribers: AgentSubscriber[] } {
  const subscribers: AgentSubscriber[] = [];
  const agent: AguiLikeAgent = {
    threadId: 'fake-thread',
    subscribe(subscriber) {
      subscribers.push(subscriber);
      return {
        unsubscribe: () => {
          const index = subscribers.indexOf(subscriber);
          if (index >= 0) subscribers.splice(index, 1);
        },
      };
    },
    runAgent: vi.fn().mockResolvedValue({ result: undefined }),
    abortRun: vi.fn(),
  };
  return { agent, subscribers };
}

describe('WorkbenchSession', () => {
  it('gives each session its own MessageProcessor, distinct from the previous session', () => {
    const first = new WorkbenchSession('t-1', { agentFactory: () => fakeAgent().agent });
    first.start();
    const firstProcessor = useWorkbenchStore.getState().processor;

    const second = new WorkbenchSession('t-2', { agentFactory: () => fakeAgent().agent });
    second.start();
    const secondProcessor = useWorkbenchStore.getState().processor;

    expect(secondProcessor).not.toBe(firstProcessor);
  });

  it('dispose() unsubscribes from the agent so a disposed session no longer reacts to events', () => {
    const { agent, subscribers } = fakeAgent();
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.start();
    expect(subscribers).toHaveLength(1);

    session.dispose();
    expect(subscribers).toHaveLength(0);
  });

  it('a disposed session leaves the run-started status change unaffected by later events', () => {
    const { agent, subscribers } = fakeAgent();
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.start();
    useWorkbenchStore.setState({ connectionStatus: 'connecting' });
    session.dispose();

    // Simulate a stray late event arriving after dispose — it must not
    // reach any subscriber, since dispose() already unsubscribed.
    expect(subscribers).toHaveLength(0);
    subscribers.forEach((s) =>
      s.onRunStartedEvent?.({
        event: { type: EventType.RUN_STARTED, threadId: 't-1', runId: 'run-1' },
        messages: [],
        state: {},
        agent: {} as never,
        input: {} as never,
      }),
    );
    expect(useWorkbenchStore.getState().connectionStatus).toBe('connecting');
  });

  it('calls runAgent({}) on start()', () => {
    const { agent } = fakeAgent();
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.start();
    expect(agent.runAgent).toHaveBeenCalledWith({});
  });

  it('dispatchAction forwards forwardedProps.a2uiAction to runAgent', () => {
    const { agent } = fakeAgent();
    const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
    session.start();
    session.dispatchAction({ name: 'approve_task_creation' });
    expect(agent.runAgent).toHaveBeenCalledWith({
      forwardedProps: { a2uiAction: { name: 'approve_task_creation' } },
    });
  });
});
```

- [ ] **Step 7: Rewrite `client.ts` as a thin wrapper around `WorkbenchSession`**

```ts
// src/agui/client.ts
import { useWorkbenchStore } from '../state/workbenchStore';
import { WorkbenchSession } from './workbenchSession';

let currentSession: WorkbenchSession | null = null;

export function startDemoCase(disputeText: string): void {
  const caseId = 'D-10291';
  const threadId = `thread-${caseId}-${Date.now()}`;

  currentSession?.dispose();
  useWorkbenchStore.getState().startCase({ caseId, threadId, disputeText });

  currentSession = new WorkbenchSession(threadId);
  currentSession.start();
}

export function reconnect(): void {
  currentSession?.reconnect();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    currentSession?.dispose();
  });
}
```

Delete the now-unused `AguiLikeAgent` export from `client.ts` — it lives in `src/agui/types.ts` now. Any other file that imported `AguiLikeAgent` from `./client` (check with `grep -rn "from '.*client'" src/agui src/mock` and `grep -rn "AguiLikeAgent" src`) must be updated to import from `./types` instead.

- [ ] **Step 8: Run the full suite**

Run: `npm run test`
Expected: all tests pass, including `src/test/integration.test.tsx` (the mock-mode end-to-end replay and the out-of-scope-action regression test), and the new `workbenchSession.test.ts`.

- [ ] **Step 9: Typecheck, lint, build, commit**

```bash
npm run typecheck && npm run lint && npm run build
git add src/agui/types.ts src/agui/workbenchSession.ts src/agui/workbenchSession.test.ts src/agui/bridge.ts src/agui/bridge.test.ts src/agui/client.ts src/state/workbenchStore.ts src/state/workbenchStore.test.ts
git commit -m "refactor: replace module-level agent/threadId/stateDoc with a WorkbenchSession controller"
```

---

### Task 6: `HttpAgentAdapter` (remove the `as unknown as` cast)

**Files:**

- Create: `src/agui/httpAgentAdapter.ts`
- Create: `src/agui/httpAgentAdapter.test.ts`
- Modify: `src/agui/workbenchSession.ts`

**Interfaces:**

- Produces: `export class HttpAgentAdapter implements AguiLikeAgent` — constructor `(params: { url: string; threadId: string })`.
- Consumes: `HttpAgent` from `@ag-ui/client`; `AguiLikeAgent` from `./types`.

`HttpAgent`'s real shape (confirmed in `node_modules/@ag-ui/client/dist/index.d.ts`) already satisfies `AguiLikeAgent` structurally: `threadId: string`, `subscribe(subscriber: AgentSubscriber): {unsubscribe(): void}`, `runAgent(parameters?: RunHttpAgentConfig, subscriber?: AgentSubscriber): Promise<RunAgentResult>` where `RunHttpAgentConfig extends RunAgentParameters extends Partial<Pick<RunAgentInput, 'runId'|'tools'|'context'|'forwardedProps'>>`, and `abortRun(): void`. The adapter class exists so every SDK-shape assumption lives in one file with a version-pinned comment, and so no `as unknown as` cast is needed anywhere in application code.

- [ ] **Step 1: Write the failing test**

```ts
// src/agui/httpAgentAdapter.test.ts
import { describe, expect, it, vi } from 'vitest';
import { HttpAgentAdapter } from './httpAgentAdapter';

const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() });
const mockRunAgent = vi.fn().mockResolvedValue({ result: undefined });
const mockAbortRun = vi.fn();

vi.mock('@ag-ui/client', () => ({
  HttpAgent: vi.fn().mockImplementation((params: { url: string; threadId: string }) => ({
    threadId: params.threadId,
    subscribe: mockSubscribe,
    runAgent: mockRunAgent,
    abortRun: mockAbortRun,
  })),
}));

describe('HttpAgentAdapter', () => {
  it('exposes threadId from the underlying HttpAgent', () => {
    const adapter = new HttpAgentAdapter({ url: 'http://localhost:8080/agui', threadId: 't-1' });
    expect(adapter.threadId).toBe('t-1');
  });

  it('forwards subscribe() to the underlying HttpAgent', () => {
    const adapter = new HttpAgentAdapter({ url: 'http://localhost:8080/agui', threadId: 't-1' });
    const subscriber = {};
    adapter.subscribe(subscriber as never);
    expect(mockSubscribe).toHaveBeenCalledWith(subscriber);
  });

  it('forwards runAgent() params to the underlying HttpAgent', () => {
    const adapter = new HttpAgentAdapter({ url: 'http://localhost:8080/agui', threadId: 't-1' });
    void adapter.runAgent({ forwardedProps: { a2uiAction: { name: 'x' } } });
    expect(mockRunAgent).toHaveBeenCalledWith({ forwardedProps: { a2uiAction: { name: 'x' } } });
  });

  it('forwards abortRun() to the underlying HttpAgent', () => {
    const adapter = new HttpAgentAdapter({ url: 'http://localhost:8080/agui', threadId: 't-1' });
    adapter.abortRun();
    expect(mockAbortRun).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/agui/httpAgentAdapter.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the adapter**

```ts
// src/agui/httpAgentAdapter.ts
import { HttpAgent, type AgentSubscriber } from '@ag-ui/client';
import type { AguiLikeAgent } from './types';

/**
 * Wraps @ag-ui/client's HttpAgent to satisfy AguiLikeAgent exactly, so no
 * `as unknown as` cast is needed anywhere else in the app. Pinned against
 * @ag-ui/client 0.0.57 (see package.json) — if that version's HttpAgent
 * shape changes, this is the one file that needs to change.
 */
export class HttpAgentAdapter implements AguiLikeAgent {
  private readonly delegate: HttpAgent;

  constructor(params: { url: string; threadId: string }) {
    this.delegate = new HttpAgent(params);
  }

  get threadId(): string {
    return this.delegate.threadId;
  }

  subscribe(subscriber: AgentSubscriber): { unsubscribe: () => void } {
    return this.delegate.subscribe(subscriber);
  }

  runAgent(params?: { forwardedProps?: unknown }): Promise<unknown> {
    return this.delegate.runAgent(params);
  }

  abortRun(): void {
    this.delegate.abortRun();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/agui/httpAgentAdapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Swap `workbenchSession.ts` to use it, removing the cast**

```ts
// src/agui/workbenchSession.ts — replace the import and defaultAgentFactory
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { MockAgent } from '../mock/mockAgent';
import { HttpAgentAdapter } from './httpAgentAdapter';
import { createWorkbenchAgentSubscriber } from './bridge';
import { useWorkbenchStore } from '../state/workbenchStore';
import { disputeCatalog } from '../components/catalog/catalogInstance';
import { validateForwardedAction, logValidationFailure } from './validation';
import type { AguiLikeAgent } from './types';

const isMock = import.meta.env.VITE_MOCK !== 'false';
const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL ?? 'http://localhost:8080/agui';

function defaultAgentFactory(threadId: string): AguiLikeAgent {
  return isMock ? new MockAgent() : new HttpAgentAdapter({ url: orchestratorUrl, threadId });
}
```

(Remove the old `HttpAgent` import from `@ag-ui/client` in this file — it's no longer referenced directly here.) The rest of `workbenchSession.ts` is unchanged from Task 5.

- [ ] **Step 6: Run the full suite, typecheck, lint, build**

Run: `npm run test && npm run typecheck && npm run lint && npm run build`
Expected: all clean. Confirm with `grep -rn "as unknown as" src/` that no cast remains anywhere in `src/`.

- [ ] **Step 7: Commit**

```bash
git add src/agui/httpAgentAdapter.ts src/agui/httpAgentAdapter.test.ts src/agui/workbenchSession.ts
git commit -m "refactor: introduce HttpAgentAdapter, removing the last 'as unknown as' cast"
```

---

### Task 7: Visible, structured error states + status model

**Files:**

- Modify: `src/state/workbenchStore.ts`
- Modify: `src/state/workbenchStore.test.ts`
- Modify: `src/agui/bridge.ts`
- Modify: `src/agui/bridge.test.ts`
- Modify: `src/agui/workbenchSession.ts`
- Modify: `src/agui/workbenchSession.test.ts`
- Modify: `src/components/LiveProgressPanel.tsx`
- Modify: `src/components/DecisionPanel.tsx`
- Modify: `docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md`

**Interfaces:**

- Produces (`workbenchStore.ts`): `export interface WorkbenchError { code: string; title: string; message: string; retryable: boolean; runId?: string }`; store fields `transportError: WorkbenchError | null`, `protocolError: WorkbenchError | null`; actions `setTransportError(error: WorkbenchError | null): void`, `setProtocolError(error: WorkbenchError | null): void`; `ConnectionStatus` becomes `'idle' | 'connecting' | 'streaming' | 'awaiting-approval' | 'completed' | 'cancelled' | 'failed'` (removes `'disconnected'` and `'finished'`).

This task changes `ConnectionStatus`'s value set — every call site that reads or writes `'disconnected'`/`'finished'` must move to the new values. Grep first: `grep -rn "'disconnected'\|'finished'\|\"disconnected\"\|\"finished\"" src/` and update every hit as part of this task.

**Status derivation table** (add to the spec doc in this task — see Step 6): on `RUN_FINISHED`, the new status is derived from (a) the surface's current root component and (b) which action, if any, was dispatched to start the run that just finished:

| Root component after finish | Last dispatched action id     | New status          |
| --------------------------- | ----------------------------- | ------------------- |
| `ApprovalPreview`           | (any)                         | `awaiting-approval` |
| `TaskCreatedCard`           | (any)                         | `completed`         |
| `DecisionCard`              | `cancel_task_creation`        | `cancelled`         |
| `DecisionCard`              | none (the initial review run) | `idle`              |

- [ ] **Step 1: Extend the store — types and state**

```ts
// src/state/workbenchStore.ts — add near the top, after ConnectionStatus
export type ConnectionStatus =
  'idle' | 'connecting' | 'streaming' | 'awaiting-approval' | 'completed' | 'cancelled' | 'failed';

export interface WorkbenchError {
  code: string;
  title: string;
  message: string;
  retryable: boolean;
  runId?: string;
}
```

Add to `WorkbenchState`:

```ts
  transportError: WorkbenchError | null;
  protocolError: WorkbenchError | null;
  setTransportError: (error: WorkbenchError | null) => void;
  setProtocolError: (error: WorkbenchError | null) => void;
```

Add to the store body's initial state and actions:

```ts
  transportError: null,
  protocolError: null,
  setTransportError: (error) => set({ transportError: error }),
  setProtocolError: (error) => set({ protocolError: error }),
```

Also update `startCase` to clear both error fields (a new case should start clean):

```ts
  startCase: ({ caseId, threadId, disputeText }) =>
    set({
      caseId,
      threadId,
      disputeText,
      runId: null,
      connectionStatus: 'connecting',
      progressLines: [],
      evidenceReadiness: null,
      transportError: null,
      protocolError: null,
    }),
```

- [ ] **Step 2: Write the failing store tests**

```ts
// src/state/workbenchStore.test.ts — add
it('setTransportError / setProtocolError update independently', () => {
  const transportError = {
    code: 'sse_interrupted',
    title: 'Connection lost',
    message: 'The stream was interrupted. Try reconnecting.',
    retryable: true,
  };
  useWorkbenchStore.getState().setTransportError(transportError);
  expect(useWorkbenchStore.getState().transportError).toEqual(transportError);
  expect(useWorkbenchStore.getState().protocolError).toBeNull();
});

it('startCase clears any prior transport/protocol error', () => {
  useWorkbenchStore.getState().setTransportError({
    code: 'x',
    title: 'x',
    message: 'x',
    retryable: false,
  });
  useWorkbenchStore.getState().startCase({ caseId: 'D-2', threadId: 't-2', disputeText: 'x' });
  expect(useWorkbenchStore.getState().transportError).toBeNull();
});
```

Update the file's `beforeEach` reset block to include `transportError: null, protocolError: null,`.

Run: `npm run test -- src/state/workbenchStore.test.ts` → expect FAIL (fields don't exist), then implement Step 1, then PASS.

- [ ] **Step 3: Wire error population into `bridge.ts`**

Change `createWorkbenchAgentSubscriber`'s signature to accept two callbacks instead of one, replacing `onProtocolError` with a richer pair (transport errors are set by `WorkbenchSession`, not the bridge, since `onRunFailed`/`RUN_ERROR` carry transport semantics best handled next to where runs are dispatched — see Step 4). Keep the protocol-error callback as-is but change its default caller (Task 5 wired `logValidationFailure` as the default parameter) to also set the store field:

```ts
// src/agui/bridge.ts — only the onRunErrorEvent/onRunFailed handlers and the
// createWorkbenchAgentSubscriber call sites for protocol errors change;
// everything else from Task 5 is unchanged.

export function createWorkbenchAgentSubscriber(
  processor: MessageProcessor<ReactComponentImplementation>,
  onProtocolError: (failure: ValidationFailure) => void = logValidationFailure,
): AgentSubscriber {
  // ...(same closures as Task 5)...

  return {
    onRunStartedEvent({ event }) {
      useWorkbenchStore.getState().setRunId(event.runId);
      useWorkbenchStore.getState().setConnectionStatus('streaming');
    },
    onRunFinishedEvent() {
      const surface = processor.model.surfacesMap.values().next().value;
      const rootType = surface?.componentsModel.getComponent('root')?.model.type;
      const status =
        rootType === 'ApprovalPreview'
          ? 'awaiting-approval'
          : rootType === 'TaskCreatedCard'
            ? 'completed'
            : 'idle'; // WorkbenchSession overrides this to 'cancelled' when the
      // just-finished run was a cancel — see workbenchSession.ts.
      useWorkbenchStore.getState().setConnectionStatus(status);
    },
    onRunErrorEvent({ event }) {
      useWorkbenchStore.getState().setTransportError({
        code: event.code ?? 'run_error',
        title: 'Run failed',
        message: event.message,
        retryable: true,
        runId: useWorkbenchStore.getState().runId ?? undefined,
      });
      useWorkbenchStore.getState().setConnectionStatus('failed');
    },
    onRunFailed({ error }) {
      useWorkbenchStore.getState().setTransportError({
        code: 'sse_interrupted',
        title: 'Connection interrupted',
        message: error.message || 'The connection to the orchestrator was interrupted.',
        retryable: true,
      });
      useWorkbenchStore.getState().setConnectionStatus('failed');
    },
    // ...onStateSnapshotEvent/onStateDeltaEvent/onCustomEvent unchanged from
    // Task 5, except their validation-failure branches now do:
    //   onProtocolError(validated.failure);
    //   useWorkbenchStore.getState().setProtocolError({
    //     code: validated.failure.issuePath.startsWith('version')
    //       ? 'unsupported_a2ui_version'
    //       : 'protocol_error',
    //     title: 'Protocol error',
    //     message: 'The server sent a payload this client could not understand.',
    //     retryable: false,
    //   });
    //   return;
  };
}
```

First check `node_modules/@a2ui/web_core/src/v0_9/state/surface-components-model.d.ts` and `node_modules/@a2ui/web_core/src/v0_9/state/surface-group-model.d.ts` for the real accessor names (`surfacesMap`, `getComponent`, `.model.type` are inferred from the library's naming conventions seen elsewhere in this codebase — `DecisionPanel.tsx` already uses `processor.model.surfacesMap.values().next().value` to get the current surface, confirming `surfacesMap` is real; verify the per-component `type`/`component` accessor by reading `surface-components-model.d.ts` and `component-model.d.ts` before writing this code, and adjust the property path to whatever those files actually expose). If the "current root component's type" cannot be read directly off the processor/surface model cleanly, an equivalent and equally valid approach is: have `applyA2uiMessage` (already in this closure) record `lastRootComponentType` in a closure variable whenever it processes an `updateComponents` message with an entry `id === 'root'`, and have `onRunFinishedEvent` read that closure variable instead of reaching into the library's internal model. Prefer whichever is less brittle after reading the actual type files — document the choice in the task report.

Write the actual `onProtocolError` inline logic (the commented sketch above) out in full in the real diff — do not leave a comment in the shipped code; the comment above is plan guidance for the implementer, not a placeholder to commit.

- [ ] **Step 4: Handle the `cancelled` status and `backend unreachable` case in `WorkbenchSession`**

```ts
// src/agui/workbenchSession.ts — track the last dispatched action, and catch
// startCase-time transport failures.

export class WorkbenchSession {
  // ...existing fields from Tasks 5/6...
  private lastDispatchedActionId: string | undefined;

  start(): void {
    useWorkbenchStore.getState().setProcessor(this.processor);
    const subscriber = createWorkbenchAgentSubscriber(this.processor, (failure) => {
      logValidationFailure(failure);
      useWorkbenchStore.getState().setProtocolError({
        code:
          failure.eventType === 'a2ui' && failure.issuePath === 'version'
            ? 'unsupported_a2ui_version'
            : 'protocol_error',
        title: 'Protocol error',
        message: 'The server sent a payload this client could not understand.',
        retryable: false,
      });
    });
    this.agentSubscription = this.agent.subscribe(subscriber);
    this.actionSubscription = this.processor.model.onAction.subscribe((action) => {
      const validated = validateForwardedAction(action);
      if (!validated.success) {
        logValidationFailure(validated.failure);
        return;
      }
      this.dispatchAction(validated.data);
    });
    this.runInitial();
  }

  private runInitial(): void {
    this.lastDispatchedActionId = undefined;
    this.agent.runAgent({}).catch((error: Error) => {
      useWorkbenchStore.getState().setTransportError({
        code: 'backend_unreachable',
        title: 'Could not reach the orchestrator',
        message: error.message || 'The backend did not respond to the initial request.',
        retryable: true,
      });
      useWorkbenchStore.getState().setConnectionStatus('failed');
    });
  }

  dispatchAction(a2uiAction: unknown): void {
    this.lastDispatchedActionId =
      typeof a2uiAction === 'object' && a2uiAction !== null && 'name' in a2uiAction
        ? String((a2uiAction as { name: unknown }).name)
        : undefined;
    void this.agent.runAgent({ forwardedProps: { a2uiAction } });
  }

  // ...reconnect/abort/dispose unchanged...
}
```

Then, back in `bridge.ts`'s `onRunFinishedEvent`, the `'idle'` fallback needs to become `'cancelled'` specifically when the just-finished run followed a `cancel_task_creation` dispatch. Since `bridge.ts`'s subscriber factory doesn't know about dispatched actions (that's session-level knowledge), thread it through: change `createWorkbenchAgentSubscriber`'s signature to also accept a `getLastDispatchedActionId: () => string | undefined` callback, called only in the `DecisionCard`-root branch of `onRunFinishedEvent`:

```ts
const status =
  rootType === 'ApprovalPreview'
    ? 'awaiting-approval'
    : rootType === 'TaskCreatedCard'
      ? 'completed'
      : getLastDispatchedActionId() === 'cancel_task_creation'
        ? 'cancelled'
        : 'idle';
```

And in `WorkbenchSession.start()`/`reconnect()`, pass `() => this.lastDispatchedActionId` as that third argument when constructing the subscriber.

- [ ] **Step 5: Write the failing tests, then implement, then pass**

Add to `bridge.test.ts`:

```ts
it('derives awaiting-approval status when the finished run leaves ApprovalPreview as root', () => {
  // build processor, createSurface + updateComponents with ApprovalPreview
  // root, then fire onRunFinishedEvent; assert connectionStatus ===
  // 'awaiting-approval'. Follow the existing 'feeds a CUSTOM/a2ui event'
  // test's setup pattern in this file for constructing the createSurface +
  // updateComponents events.
});

it('derives completed status when the finished run leaves TaskCreatedCard as root', () => {
  // same pattern, TaskCreatedCard root
});

it('derives cancelled status when getLastDispatchedActionId returns cancel_task_creation and root is DecisionCard', () => {
  // pass a getLastDispatchedActionId returning 'cancel_task_creation'
});

it('derives idle status when no action was dispatched and root is DecisionCard', () => {
  // pass a getLastDispatchedActionId returning undefined
});

it('sets a retryable transport WorkbenchError and failed status on RUN_ERROR', () => {
  const event: RunErrorEvent = {
    type: EventType.RUN_ERROR,
    message: 'boom',
    code: 'x',
  } as RunErrorEvent;
  workbenchAgentSubscriber.onRunErrorEvent?.(fakeParams(event));
  expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
  expect(useWorkbenchStore.getState().transportError).toMatchObject({
    message: 'boom',
    retryable: true,
  });
});

it('sets a retryable transport WorkbenchError on onRunFailed', () => {
  workbenchAgentSubscriber.onRunFailed?.({
    error: new Error('stream dropped'),
    messages: [],
    state: {},
    agent: {} as never,
    input: {} as never,
  });
  expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
  expect(useWorkbenchStore.getState().transportError?.code).toBe('sse_interrupted');
});

it('sets a non-retryable protocol WorkbenchError on a malformed a2ui payload', () => {
  const event: CustomEvent = {
    type: EventType.CUSTOM,
    name: 'a2ui',
    value: { version: 'v0.8', createSurface: { surfaceId: 'x', catalogId: 'y' } },
  };
  workbenchAgentSubscriber.onCustomEvent?.(fakeParams(event));
  expect(useWorkbenchStore.getState().protocolError).toMatchObject({ retryable: false });
});
```

Add to `workbenchSession.test.ts`:

```ts
it('sets a retryable backend_unreachable transport error when the initial runAgent rejects', async () => {
  const agent: AguiLikeAgent = {
    threadId: 'fake',
    subscribe: () => ({ unsubscribe: () => {} }),
    runAgent: vi.fn().mockRejectedValue(new Error('network down')),
    abortRun: vi.fn(),
  };
  const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
  session.start();
  await vi.waitFor(() => {
    expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
  });
  expect(useWorkbenchStore.getState().transportError?.code).toBe('backend_unreachable');
});
```

Run: `npm run test -- src/agui/bridge.test.ts src/agui/workbenchSession.test.ts` iteratively until green.

- [ ] **Step 6: Render the two error surfaces**

`src/components/LiveProgressPanel.tsx` — replace the `'disconnected'` branch of `ConnectionStrip` with `'failed'`, sourcing its message from the store's `transportError`:

```tsx
// LiveProgressPanel.tsx — inside the component, add:
const transportError = useWorkbenchStore((state) => state.transportError);

// ...pass transportError and reconnect down to ConnectionStrip, and change:
function ConnectionStrip({
  status,
  error,
}: {
  status: string;
  error: { message: string; retryable: boolean } | null;
}) {
  if (status === 'connecting') {
    /* unchanged */
  }
  if (status === 'failed') {
    return (
      <div className="mt-1.5 -mx-4 flex items-center justify-between bg-pending-surface px-4 py-1.5 text-xs">
        <span className="text-pending">{error?.message ?? 'Disconnected'}</span>
        {error?.retryable !== false && (
          <button
            type="button"
            onClick={reconnect}
            className="font-medium text-pending underline decoration-pending/40 underline-offset-2 hover:decoration-pending"
          >
            Reconnect
          </button>
        )}
      </div>
    );
  }
  if (status === 'completed')
    return <p className="mt-1.5 font-mono text-[11px] text-ink/40">Run complete</p>;
  if (status === 'awaiting-approval')
    return <p className="mt-1.5 text-xs text-ink/50">Awaiting approval</p>;
  if (status === 'streaming') return <p className="mt-1.5 text-xs text-ink/50">Streaming</p>;
  return null;
}
```

Update the `ConnectionStrip` call site to pass `error={transportError}`.

`src/components/DecisionPanel.tsx` — render `protocolError` as a notice above the surface/empty-state:

```tsx
// DecisionPanel.tsx
const protocolError = useWorkbenchStore((state) => state.protocolError);

// ...inside the returned JSX, after the <h2> heading, before the surface/empty-state branch:
{
  protocolError && (
    <div className="rounded-[var(--radius-card)] border border-ledger-line border-l-4 border-l-pending bg-pending-surface p-3 text-sm text-pending">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.1em]">
        {protocolError.title}
      </p>
      <p className="mt-1">{protocolError.message}</p>
    </div>
  );
}
```

Update `CaseIntakePanel.tsx`'s `busy` check — it currently reads `connectionStatus === 'connecting' || connectionStatus === 'streaming'`; leave as-is (still correct under the new status set — busy should be false for `awaiting-approval`/`completed`/`cancelled`/`failed`/`idle`, matching current behavior for the equivalent old states).

- [ ] **Step 7: Run everything**

Run: `npm run test && npm run typecheck && npm run lint && npm run build`
Expected: all clean. Pay special attention to `src/test/integration.test.tsx` — its final assertions check DOM text, not `connectionStatus` directly, so they should be unaffected, but re-run it explicitly and read the output to confirm no status-string assumption broke silently elsewhere (e.g. a component test asserting on the literal string `'finished'` or `'disconnected'` that this task's grep in Step 0 above may have missed — search once more with `grep -rn "disconnected\|'finished'" src/ docs/superpowers/specs docs/images README.md` before committing).

- [ ] **Step 8: Commit**

```bash
git add src/state/workbenchStore.ts src/state/workbenchStore.test.ts src/agui/bridge.ts src/agui/bridge.test.ts src/agui/workbenchSession.ts src/agui/workbenchSession.test.ts src/components/LiveProgressPanel.tsx src/components/DecisionPanel.tsx
git commit -m "feat: structured WorkbenchError states and a finer-grained connection status model"
```

- [ ] **Step 9: Amend the design doc**

Prepend to the changelog blockquote:

```markdown
> **2026-07-14 amendment (hardening pass):** New §3.7 "Error handling and
> status model" documents `WorkbenchError` and the connection-status enum
> change (`disconnected`/`finished` replaced by `awaiting-approval` /
> `completed` / `cancelled` / `failed`, derived client-side from the current
> surface root and the last dispatched action — nothing new for the backend
> to send).
```

Add `### 3.7 Error handling and status model` after §3.6:

```markdown
### 3.7 Error handling and status model

**[convention — frozen]** Errors are two independent, client-only signals —
the backend does not need to send anything new to produce them:

- **Transport errors** (`{code, title, message, retryable, runId?}`, shown in
  the timeline header strip): backend unreachable when a case starts, an SSE
  connection interrupted mid-run (`onRunFailed`), or a `RUN_ERROR` event
  (its `message`/`code` are preserved verbatim).
- **Protocol errors** (same shape, shown as a decision-panel notice): any
  payload rejected by §3.6's inbound validation. `unsupported_a2ui_version`
  is used specifically when the rejection is on the `version` field;
  everything else is the generic `protocol_error` code with generic wording
  — the raw payload is never shown in the UI.

**[convention — frozen]** `connectionStatus` is
`idle | connecting | streaming | awaiting-approval | completed | cancelled |
failed` — this replaces the previous `disconnected`/`finished` pair. On
`RUN_FINISHED`, the client derives the new status from the surface's current
root component and which action (if any) it just dispatched:

| Root component after finish | Last dispatched action id     | New status          |
| --------------------------- | ----------------------------- | ------------------- |
| `ApprovalPreview`           | (any)                         | `awaiting-approval` |
| `TaskCreatedCard`           | (any)                         | `completed`         |
| `DecisionCard`              | `cancel_task_creation`        | `cancelled`         |
| `DecisionCard`              | none (the initial review run) | `idle`              |

This is entirely inferred client-side — the backend does not send a status
field.
```

```bash
git add docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md
git commit -m "docs: amend design doc with error handling and status model contract"
```

---

### Task 8: Captured-stream contract fixtures

**Files:**

- Create: `src/agui/dispatchToSubscriber.ts`
- Modify: `src/mock/mockAgent.ts`
- Create: `src/test/fixtures/replayFixture.ts`
- Create: `src/test/fixtures/review-success.ndjson` (generated, not hand-written — see Step 4)
- Create: `src/test/fixtures/preview-success.ndjson` (generated)
- Create: `src/test/fixtures/approval-success.ndjson` (generated)
- Create: `src/test/fixtures/cancel-success.ndjson` (generated)
- Create: `src/test/fixtures/invalid-a2ui-payload.ndjson` (hand-authored)
- Create: `src/test/fixtures/disconnected-midrun.ndjson` (hand-authored)
- Create: `src/test/fixtures/partial-agent-failure.ndjson` (empty placeholder)
- Create: `src/test/fixtures/README.md`
- Create: `scripts/regenerate-fixtures.ts`
- Create: `vitest.fixtures.config.ts`
- Create: `src/test/fixtures/contract.test.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**

- Produces (`dispatchToSubscriber.ts`): `export function dispatchToSubscriber(subscriber: AgentSubscriber, event: BaseEvent): void` — extracted verbatim from `mockAgent.ts`'s existing private function of the same name, so it has exactly one implementation shared by `MockAgent` and `replayFixture`.
- Produces (`replayFixture.ts`): `export function replayFixture(path: string, subscriber: AgentSubscriber): void`.

Note: `npm run fixtures:regen` does not run as part of `npm test` — verified empirically that Vitest's default `include` glob (`**/*.{test,spec}.*`) does not pick up a file passed as an explicit CLI path unless its name also matches that glob, so the regenerator lives in its own vitest config with its own `include`, invoked only by its own npm script.

- [ ] **Step 1: Extract the shared event-dispatch helper**

```ts
// src/agui/dispatchToSubscriber.ts
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
```

In `src/mock/mockAgent.ts`, delete the private `dispatchToSubscriber` function and import the shared one instead: `import { dispatchToSubscriber } from '../agui/dispatchToSubscriber';`. No other change to `mockAgent.ts`.

Run: `npm run test -- src/mock/mockAgent.test.ts` → expect PASS unchanged (pure extraction, no behavior change).

- [ ] **Step 2: Write `replayFixture`**

```ts
// src/test/fixtures/replayFixture.ts
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
```

- [ ] **Step 3: Hand-author the two non-derivable fixtures and the deferred placeholder**

```

```

`src/test/fixtures/invalid-a2ui-payload.ndjson`:

```
{"type":"RUN_STARTED","threadId":"fixture-thread","runId":"run-fixture-invalid"}
{"type":"CUSTOM","name":"a2ui","value":{"version":"v0.8","createSurface":{"surfaceId":"case-fixture","catalogId":"https://dispute-workbench.internal/catalogs/v1.json"}}}
{"type":"RUN_FINISHED","threadId":"fixture-thread","runId":"run-fixture-invalid"}
```

`src/test/fixtures/disconnected-midrun.ndjson`:

```
{"type":"RUN_STARTED","threadId":"fixture-thread","runId":"run-fixture-disconnect"}
{"type":"CUSTOM","name":"progress","value":{"source":"orchestrator","text":"Understanding dispute..."}}
{"type":"CUSTOM","name":"progress","value":{"source":"orchestrator","text":"Calling Case Review Agent..."}}
{"__runFailed":true,"message":"stream interrupted"}
```

`src/test/fixtures/partial-agent-failure.ndjson` (empty on purpose — reserved slot):

```

```

(An empty file. Its purpose is documented in `src/test/fixtures/README.md`, not in its own contents, since NDJSON has no comment syntax.)

- [ ] **Step 4: Write the fixtures README**

```markdown
// src/test/fixtures/README.md

# Captured-stream contract fixtures

Each `.ndjson` file is one AG-UI event per line, exactly as it would appear
on the wire, replayed through `replayFixture.ts` — the same dispatch and
bridge/validation code path the live and mock agents use. This is the
cross-language contract test: once the Java backend exists, a captured real
SSE stream dropped in here becomes a fixture the same way.

- `review-success.ndjson`, `preview-success.ndjson`, `approval-success.ndjson`,
  `cancel-success.ndjson` — generated FROM `src/mock/demoScript.ts`, the
  single source of truth for what a successful run looks like. Never hand-edit
  these. Run `npm run fixtures:regen` after changing `demoScript.ts` to
  regenerate them.
- `invalid-a2ui-payload.ndjson` — hand-authored. A `CUSTOM`/`a2ui` event with
  `version: "v0.8"`, which §3.6 of the design doc requires the client to
  reject. Asserts a protocol error surfaces and no surface is created.
- `disconnected-midrun.ndjson` — hand-authored. Ends with a
  `{"__runFailed": true, "message": "..."}` marker line instead of
  `RUN_FINISHED` — there is no wire representation for a transport-level
  disconnect, so this marker is `replayFixture`'s own convention for
  simulating the `onRunFailed` subscriber callback a real dropped SSE
  connection would trigger. Asserts a retryable transport error surfaces.
- `partial-agent-failure.ndjson` — empty. Reserved for when partial
  specialist-agent failure / retry-one-agent UX is in scope (currently
  `// deferred to platform spec` — see design doc §3.3). Not replayed by any
  test yet.
```

- [ ] **Step 5: Regeneration script and its own vitest config**

```ts
// vitest.fixtures.config.ts
import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts's `test` block: this config's
// only job is to let `npm run fixtures:regen` run scripts/regenerate-fixtures.ts
// as a one-off script, without that file being swept into the normal `npm
// test` run (Vitest's default include glob only matches *.test.*/*.spec.*
// filenames — verified this file's name alone would be silently skipped by
// `vitest run <path>` without a dedicated include here).
export default defineConfig({
  test: {
    include: ['scripts/regenerate-fixtures.ts'],
  },
});
```

```ts
// scripts/regenerate-fixtures.ts
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  reviewRun,
  previewRun,
  approvalRun,
  cancelRun,
  type DemoRun,
} from '../src/mock/demoScript';

const FIXTURES_DIR = fileURLToPath(new URL('../src/test/fixtures/', import.meta.url));

function writeNdjson(filename: string, run: DemoRun): void {
  const lines = run.events.map((scripted) => JSON.stringify(scripted.event));
  writeFileSync(`${FIXTURES_DIR}${filename}`, lines.join('\n') + '\n', 'utf-8');
}

describe('fixture regeneration', () => {
  it('writes the four success fixtures from demoScript.ts, the single source of truth', () => {
    writeNdjson('review-success.ndjson', reviewRun);
    writeNdjson('preview-success.ndjson', previewRun);
    writeNdjson('approval-success.ndjson', approvalRun);
    writeNdjson('cancel-success.ndjson', cancelRun);
    expect(true).toBe(true);
  });
});
```

In `package.json`, add to `"scripts"`:

```json
    "fixtures:regen": "vitest run --config vitest.fixtures.config.ts",
```

Run: `npm run fixtures:regen`
Expected: writes `review-success.ndjson`, `preview-success.ndjson`, `approval-success.ndjson`, `cancel-success.ndjson` into `src/test/fixtures/`. Confirm with `ls src/test/fixtures/` and spot-check one file's contents (`cat src/test/fixtures/review-success.ndjson | head -3`) — each line must be valid JSON (`cat src/test/fixtures/review-success.ndjson | while read -r line; do echo "$line" | node -e "JSON.parse(require('fs').readFileSync(0,'utf-8'))" || echo "BAD LINE: $line"; done` as a manual sanity check, not a committed script).

- [ ] **Step 6: Write the contract tests**

```ts
// src/test/fixtures/contract.test.ts
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { createWorkbenchAgentSubscriber } from '../../agui/bridge';
import { useWorkbenchStore } from '../../state/workbenchStore';
import { disputeCatalog } from '../../components/catalog/catalogInstance';
import { replayFixture } from './replayFixture';

function fixturePath(name: string): string {
  return fileURLToPath(new URL(name, import.meta.url));
}

describe('captured-stream contract fixtures', () => {
  it('review-success.ndjson ends with the three-entry decision view and no error', () => {
    const processor = new MessageProcessor([disputeCatalog]);
    useWorkbenchStore.setState({ progressLines: [], transportError: null, protocolError: null });
    const subscriber = createWorkbenchAgentSubscriber(processor);
    replayFixture(fixturePath('review-success.ndjson'), subscriber);
    const surface = processor.model.surfacesMap.values().next().value;
    expect(surface).toBeDefined();
    expect(useWorkbenchStore.getState().transportError).toBeNull();
    expect(useWorkbenchStore.getState().protocolError).toBeNull();
    expect(useWorkbenchStore.getState().progressLines.length).toBeGreaterThan(0);
  });

  it('preview-success.ndjson swaps the surface to ApprovalPreview', () => {
    const processor = new MessageProcessor([disputeCatalog]);
    useWorkbenchStore.setState({ transportError: null, protocolError: null });
    const subscriber = createWorkbenchAgentSubscriber(processor);
    // preview-success.ndjson only updates an existing surface — createSurface
    // must have already happened, same as a real session (§3.3/§3.5).
    replayFixture(fixturePath('review-success.ndjson'), subscriber);
    replayFixture(fixturePath('preview-success.ndjson'), subscriber);
    // Assert the surface's root component is ApprovalPreview — inspect
    // via processor.model.surfacesMap / the surface's componentsModel,
    // following the same accessor pattern used in bridge.ts's own
    // onRunFinishedEvent (Task 7) for reading the current root type.
  });

  it('approval-success.ndjson ends with TaskCreatedCard', () => {
    // same layered-replay pattern: review-success then approval-success
  });

  it('cancel-success.ndjson reverts to the decision view', () => {
    // same layered-replay pattern: review-success then cancel-success
  });

  it('invalid-a2ui-payload.ndjson surfaces a protocol error and creates no surface', () => {
    const processor = new MessageProcessor([disputeCatalog]);
    useWorkbenchStore.setState({ transportError: null, protocolError: null });
    const subscriber = createWorkbenchAgentSubscriber(processor);
    replayFixture(fixturePath('invalid-a2ui-payload.ndjson'), subscriber);
    expect(processor.model.surfacesMap.size).toBe(0);
  });

  it('disconnected-midrun.ndjson surfaces a retryable transport error', () => {
    const processor = new MessageProcessor([disputeCatalog]);
    useWorkbenchStore.setState({
      transportError: null,
      protocolError: null,
      connectionStatus: 'idle',
    });
    const subscriber = createWorkbenchAgentSubscriber(processor);
    replayFixture(fixturePath('disconnected-midrun.ndjson'), subscriber);
    expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
    expect(useWorkbenchStore.getState().transportError?.retryable).toBe(true);
  });
});
```

Fill in the two commented-out assertion bodies (preview/approval root-type checks) using whichever accessor Task 7 settled on for reading a surface's current root component type — reuse it here rather than inventing a second way to read the same thing.

- [ ] **Step 7: Run everything**

Run: `npm run test`
Expected: all pass, including the new `contract.test.ts` (note: this file matches the default `*.test.ts` glob, so it runs as part of `npm test` normally — only `scripts/regenerate-fixtures.ts` is special-cased out).

- [ ] **Step 8: Typecheck, lint, build, commit**

```bash
npm run typecheck && npm run lint && npm run build
git add src/agui/dispatchToSubscriber.ts src/mock/mockAgent.ts src/test/fixtures/ scripts/regenerate-fixtures.ts vitest.fixtures.config.ts package.json
git commit -m "test: add captured-stream contract fixtures replayed through the real bridge"
```

- [ ] **Step 9: README note**

Add a short subsection to `README.md` (near "Contract notes for backend implementers" or "Running it" — match existing structure) explaining fixtures and `npm run fixtures:regen`, per Task 11's overall README budget (keep this addition to 4-6 lines; Task 11 handles the rest of the README restructuring and enforces the total-growth budget).

```bash
git add README.md
git commit -m "docs: document captured-stream fixtures in the README"
```

---

### Task 9: Accessibility + mode badge

**Files:**

- Modify: `src/components/LiveProgressPanel.tsx`
- Create: `src/components/ModeBadge.tsx`
- Create: `src/components/ModeBadge.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/test/integration.test.tsx`

**Interfaces:**

- Produces: `export function ModeBadge()` — reads `import.meta.env.VITE_MOCK` directly (same source `client.ts`/`workbenchSession.ts` already use) and the store's `connectionStatus` to decide visibility.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/ModeBadge.test.tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModeBadge } from './ModeBadge';
import { useWorkbenchStore } from '../state/workbenchStore';

describe('ModeBadge', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({ connectionStatus: 'idle' });
  });

  it('shows a DEMO MODE badge in mock mode once idle (VITE_MOCK defaults true in tests)', () => {
    render(<ModeBadge />);
    expect(screen.getByText(/DEMO MODE/i)).toBeInTheDocument();
  });

  it('renders nothing while connecting', () => {
    useWorkbenchStore.setState({ connectionStatus: 'connecting' });
    render(<ModeBadge />);
    expect(screen.queryByText(/DEMO MODE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/LIVE/i)).not.toBeInTheDocument();
  });
});
```

Add to `LiveProgressPanel`'s existing tests (find or create `src/components/LiveProgressPanel.test.tsx` — check first whether one exists; if not, add these assertions to `src/test/integration.test.tsx` instead, appended to the existing `'ends with TaskCreatedCard...'` test, since that test already drives a full run):

```tsx
// Accessibility assertions, appended to the existing full-replay integration test:
expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/components/ModeBadge.test.tsx`
Expected: FAIL — module doesn't exist. The `role="log"` assertion also fails against the current markup.

- [ ] **Step 3: Implement `ModeBadge`**

```tsx
// src/components/ModeBadge.tsx
import { useWorkbenchStore } from '../state/workbenchStore';

const isMock = import.meta.env.VITE_MOCK !== 'false';

export function ModeBadge() {
  const connectionStatus = useWorkbenchStore((state) => state.connectionStatus);
  if (connectionStatus === 'connecting' || connectionStatus === 'idle') return null;

  return (
    <div className="fixed bottom-3 right-3 rounded-[var(--radius-card)] border border-ledger-line bg-panel px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink/40 shadow-card">
      {isMock ? 'Demo mode — scripted agent events' : 'Live — orchestrator connected'}
    </div>
  );
}
```

Add `<ModeBadge />` to `src/App.tsx`, rendered once alongside the three panels (outside the grid, as a fixed-position overlay — it does not participate in the 12-col layout).

- [ ] **Step 4: Add ARIA roles to the timeline**

In `src/components/LiveProgressPanel.tsx`, update the scrollable timeline container and its contents:

```tsx
      <div
        ref={containerRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="relative flex-1 overflow-y-auto px-4 py-3"
      >
```

Each entry's accessible name should be the full agent name, not the visual tag — add a visually-hidden full name and mark the visual tag/timestamp/marker `aria-hidden`:

```tsx
const AGENT_FULL_NAME: Record<AgentSource, string> = {
  orchestrator: 'Orchestrator',
  'case-review': 'Case Review Agent',
  policy: 'Policy Agent',
};

// ...inside the map:
{
  progressLines.map((line) => (
    <div key={line.id} data-testid="progress-line" className="relative animate-ledger-in pl-6">
      <span
        aria-hidden
        className={`absolute left-[4px] top-1.5 h-2 w-2 ${MARKER_COLOR[line.source]}`}
      />
      <div className="flex items-baseline justify-between gap-3">
        <span
          aria-hidden
          className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${TAG_COLOR[line.source]}`}
        >
          {TAG_LABEL[line.source]}
        </span>
        <span aria-hidden className="shrink-0 font-mono text-[10px] tabular-nums text-ink/35">
          {new Date(line.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <p className="mt-0.5 text-sm leading-snug text-ink">
        <span className="sr-only">{AGENT_FULL_NAME[line.source]}: </span>
        {line.text}
      </p>
    </div>
  ));
}
```

The readiness chip in the header already exists (`evidenceReadiness && <span>...</span>`) — give it `aria-live="polite"` so a change is announced without re-announcing on every unrelated re-render (it already only changes when `evidenceReadiness` itself changes, so no extra guarding is needed beyond the attribute):

```tsx
<span
  aria-live="polite"
  className="rounded bg-ledger-line px-1.5 py-0.5 font-mono text-[11px] text-ink/70"
>
  {evidenceReadiness}
</span>
```

Verify the disabled unknown-action button from Task 4 remains keyboard-focusable and its tooltip is reachable — a native `disabled` HTML button is _not_ keyboard-focusable and strips `title` from the accessibility tree in most screen readers. Since the task brief for Task 4 requires the button to "remain focusable with the tooltip readable via `aria-describedby`," revisit `NextActions.tsx` in this task and change the unknown-action branch from a truly `disabled` button to an `aria-disabled="true"` button (not disabled, so it stays in the tab order) that no-ops on click and exposes the tooltip via `aria-describedby` pointing at a visually-present-but-quiet `<span>`:

```tsx
if (!dispatchable) {
  const describedById = `unknown-action-${action.id}`;
  return (
    <span key={action.id} className="inline-flex flex-col items-start">
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={describedById}
        onClick={(event) => event.preventDefault()}
        className="cursor-not-allowed text-sm text-ink/30 underline decoration-ink/15 underline-offset-2"
      >
        {action.label}
      </button>
      <span id={describedById} className="sr-only">
        Unknown action — not dispatchable
      </span>
    </span>
  );
}
```

Update Task 4's `NextActions.test.tsx` assertion for this button: it is no longer literally `.toBeDisabled()` (that DOM API checks the `disabled` HTML attribute) — change the test to assert `getByRole('button', {name: 'Delete Everything'})` has `aria-disabled="true"`, and that clicking it still does not call `onAction`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test`
Expected: all pass, including the updated Task 4 test for `aria-disabled`.

- [ ] **Step 6: Typecheck, lint, build, commit**

```bash
npm run typecheck && npm run lint && npm run build
git add src/components/LiveProgressPanel.tsx src/components/ModeBadge.tsx src/components/ModeBadge.test.tsx src/components/catalog/NextActions.tsx src/components/catalog/NextActions.test.tsx src/App.tsx src/test/integration.test.tsx
git commit -m "feat: accessible timeline roles, keyboard-reachable disabled actions, and a mode badge"
```

---

### Task 10: Dependency hygiene

**Files:**

- Create: `.github/dependabot.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add Dependabot config**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      minor-and-patch:
        update-types:
          - minor
          - patch
```

- [ ] **Step 2: Add a non-blocking `npm audit` step to CI**

```yaml
# .github/workflows/ci.yml — add after the existing `npm ci` step
- run: npm audit --audit-level=high
  continue-on-error: true
```

Read the current `.github/workflows/ci.yml` first and insert this step in a sensible place (right after `npm ci`, before `npm run lint`), preserving every existing step unchanged.

- [ ] **Step 3: Verify and commit**

Run: `npm audit --audit-level=high` locally to see current output (informational only — this step is `continue-on-error: true` by design, per the plan's brief: "pinned exact versions make failures likely noise; revisit after backend integration").

```bash
git add .github/dependabot.yml .github/workflows/ci.yml
git commit -m "chore: add Dependabot config and a non-blocking npm audit CI step"
```

Do not add CodeQL, SBOM generation, or a dependency-review action — explicitly out of scope for this task.

---

### Task 11: README top-matter

**Files:**

- Modify: `README.md`

Read the full current `README.md` before starting (241 lines as of the last commit; check its current line count with `wc -l README.md` since Tasks 4 and 8 already added a few lines to it). The total growth from this task, combined with Tasks 4/8's additions, must stay under +60 lines from the pre-hardening-pass baseline — if the hero/quick-start/status-table addition pushes over budget, condense the existing "What this is" paragraph rather than skipping any of the three new pieces.

- [ ] **Step 1: Add the hero, quick start, and status table**

Insert immediately after the `# agentic-dispute-workbench-ui` title (line 1) and before the existing "What this is" section:

````markdown
![Three specialist agents streaming progress in parallel, mid-review](docs/images/three-zone-parallel-phase.png)

**Quick start:**

```bash
git clone <this-repo> && cd agentic-dispute-workbench-ui
npm install
npm run dev
# open http://localhost:5173, click "Review Dispute"
```
````

| Frontend (this repo)                           | Backend (`agentic-dispute-workbench-platform`) |
| ---------------------------------------------- | ---------------------------------------------- |
| ✓ React workbench, mock + live modes           | ○ Java orchestrator — in progress              |
| ✓ AG-UI client, inbound/outbound validation    | ○ Specialist A2A agents — in progress          |
| ✓ A2UI closed catalog + approval gate          | ○ MCP case-system server — in progress         |
| ✓ Tests, CI, captured-stream contract fixtures |                                                |

````

Verify the screenshot path `docs/images/three-zone-parallel-phase.png` actually exists (`ls docs/images/`) before committing — it was captured during the visual-redesign pass; if the filename differs slightly, use the real one.

- [ ] **Step 2: Sweep for stale "does not exist yet" phrasing**

Run: `grep -n "does not exist" README.md`. For each hit outside the sections this task is not meant to touch (protocols/flow/session model/catalog reference/contract notes stay conceptually the same — the backend still doesn't exist as of this pass), replace phrasing that reads as uncertain about the frontend's own completeness with phrasing consistent with the new status table (the backend not existing yet is still true and should stay stated plainly — only reword sentences that could make a reader think the *frontend* itself is unfinished).

- [ ] **Step 3: Add the small subsections for new pieces**

Per Task 4/8's own steps, the action allow-list bullet and fixtures paragraph should already be present in "Contract notes for backend implementers" and near "Running it" respectively — confirm both are there (`grep -n "allow-list\|fixtures:regen" README.md`); if either was skipped, add it now rather than duplicating Task 4/8's exact wording from this plan.

Add one short subsection under "Running it" (or wherever fits the existing structure) for inbound validation + caps and for error states, each 3-5 lines, matching the terse, factual tone of the rest of the README:

```markdown
### Inbound validation

Every event from the agent — progress lines, A2UI payloads, state
snapshots/deltas — is validated against Zod schemas before the client acts
on it, with fixed caps (20 components per update, 20 checklist items, 10
actions, 500-character progress text). A payload that fails validation is
dropped and logged, never applied and never thrown into the UI. See
`src/agui/validation.ts` and the design doc's §3.6.

### Error states

Two kinds of error surface independently: a transport error (backend
unreachable, a dropped connection, a `RUN_ERROR` event) shows in the
timeline header with a Reconnect affordance when retryable; a protocol error
(a payload that failed inbound validation) shows as a decision-panel notice.
See the design doc's §3.7 for the exact status-derivation rules.
````

- [ ] **Step 4: Verify the line budget and commit**

```bash
wc -l README.md
```

Compare against the pre-Task-4 line count (check `git log --oneline -- README.md` and `git show <commit-before-task-4>:README.md | wc -l` if needed). If over +60 lines total across Tasks 4/8/11, condense: the "What this is" section and the "The flow" ASCII diagram are the two most compressible without losing information, per the original README-rewrite's own structure.

```bash
git add README.md
git commit -m "docs: add README hero, quick start, and status table"
```

---

## Final Steps (controller, not a dispatched task)

After Task 11's review passes:

1. Run the final whole-branch review (superpowers:requesting-code-review's code-reviewer, most capable available model) against the full branch diff from `main`.
2. Produce and show the user: `git diff main -- docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md` (the spec-doc diff) and `ls src/test/fixtures/` (the fixtures directory listing) — required by the original request before finishing.
3. Use superpowers:finishing-a-development-branch to merge, PR, or hold, per the user's choice.
