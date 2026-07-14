# agentic-dispute-workbench-ui — Final Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The final frontend pass before platform work begins: restructure the README to be narrative-first (a first-time reader understands the user journey before hitting any protocol name), and harden seven small robustness gaps (B1–B7) — unhandled promise rejections on dispatch, unguarded JSON Patch application, retry-the-operation instead of restart-the-workflow, one required spec amendment for approval idempotency, dispose-time abort, a progress-history cap, and light CI tightening.

**Architecture:** No new features, no visual changes, no new catalog components, no new action IDs. Every file touched already exists from the prior hardening pass except the new spec-doc section and README sections this plan adds.

**Tech Stack:** Same as the hardening pass — React 19 + TypeScript 5.9 strict + Vite 8 + Vitest 4 + Zod 3 + `fast-json-patch` 3.1.1 + Zustand 5. No new dependencies.

## Global Constraints

- No new user-facing capabilities beyond what B1–B7 describe; no visual redesign; no new catalog components; no new action IDs.
- Exactly one spec-doc contract change is authorized: **B4 (approval idempotency)**, in design doc §3.3, with a dated changelog entry prepended above the existing changelog blockquote. No other section of the design doc changes.
- New caps/constants (B6's `MAX_PROGRESS_LINES`) live alongside the existing hardening-pass caps in `src/agui/validation.ts` — one place for all such constants, per that file's existing convention.
- `npm run lint`, `npm run format:check` (this failed once already during the prior pass because it wasn't run explicitly — **every task in this plan must run `npm run format:check` in its own verification steps, not just lint/typecheck**), `npm run build`, and `npm run test` must all be green after every task.
- README growth from section A should stay ≤ 50 lines net; condense the existing "protocols" section's scene-setting sentences where A1/A3 now cover that ground, rather than skipping any of A1–A4.
- The final deliverable includes, for the controller (not committed as a file): the README diff summary and the spec-doc diff, shown before finishing — required by the original request.

## Section A: README restructure (Task 7 below)

## Section B: Code robustness (Tasks 1–6 below)

---

### Task 1: B2 — JSON Patch safety

**Files:**
- Modify: `src/agui/bridge.ts`
- Modify: `src/agui/bridge.test.ts`

**Interfaces:**
- No signature changes. `onStateDeltaEvent`'s body gains a try/catch around `applyPatch`.

Today, `onStateDeltaEvent` validates the delta's *shape* with `validateStateDelta` (Zod: each op has the right structural fields), but `applyPatch(stateDoc, ops, true, false)` can still throw at runtime for a structurally-valid-but-inapplicable patch — e.g. `replace`/`remove` against a path that doesn't exist in `stateDoc`, or a failed `test` op. Nothing catches that throw today, so it propagates out of the AG-UI event handler uncaught. This task wraps it and routes the failure through the same `reportProtocolError` path Task 2 of the hardening pass already built (log redacted, `protocolError` store field set, state document left unchanged).

- [ ] **Step 1: Write the failing test**

Add to `src/agui/bridge.test.ts`, inside the existing `describe('createWorkbenchAgentSubscriber', ...)` block (reuse the file's existing `beforeEach`-built `processor`/`protocolErrors`/`workbenchAgentSubscriber` — see the file's current setup):

```ts
it('drops an inapplicable STATE_DELTA patch instead of throwing, leaving state unchanged', () => {
  const snapshot: StateSnapshotEvent = {
    type: EventType.STATE_SNAPSHOT,
    snapshot: { evidenceReadiness: null },
  };
  const badDelta: StateDeltaEvent = {
    type: EventType.STATE_DELTA,
    // Structurally valid per Zod (op/path/value all present), but
    // inapplicable: /nonexistent/deep/path doesn't exist in stateDoc, so
    // fast-json-patch's applyPatch throws at runtime, not at Zod-validation
    // time — this is exactly the gap Task 1 (B2) closes.
    delta: [{ op: 'replace', path: '/nonexistent/deep/path', value: 'x' }],
  };
  workbenchAgentSubscriber.onStateSnapshotEvent?.(fakeParams(snapshot));
  expect(() => workbenchAgentSubscriber.onStateDeltaEvent?.(fakeParams(badDelta))).not.toThrow();
  expect(useWorkbenchStore.getState().evidenceReadiness).toBeNull();
  expect(protocolErrors).toHaveLength(1);
  expect(protocolErrors[0]).toMatchObject({ eventType: 'state_delta' });
});
```

(Match whatever the current `bridge.test.ts` actually names its `protocolErrors` capture array and `fakeParams` helper — read the file first; these names were established in the hardening pass's Task 5/7 rewrites and should already be present. If the file's current shape differs from this sketch in a minor way — e.g. a different variable name — adapt the test to the real current file rather than the sketch.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/agui/bridge.test.ts`
Expected: FAIL — the current code throws inside `applyPatch`, which either crashes the test synchronously or surfaces as an uncaught exception, not a clean `protocolErrors` entry.

- [ ] **Step 3: Wrap the patch application**

In `src/agui/bridge.ts`, change `onStateDeltaEvent`:

```ts
    onStateDeltaEvent({ event }) {
      const validated = validateStateDelta(event.delta);
      if (!validated.success) {
        reportProtocolError(validated.failure);
        return;
      }
      try {
        const result = applyPatch(stateDoc, validated.data as Operation[], true, false);
        stateDoc = result.newDocument;
      } catch {
        // Structurally valid per Zod, but inapplicable at runtime (e.g. a
        // replace/remove against a path that doesn't exist, or a failed
        // test op) — fast-json-patch throws for this, Zod can't catch it
        // ahead of time. Same protocol-error path as a shape failure;
        // stateDoc is left exactly as it was (the failed applyPatch call
        // never touched it, since mutateDocument is false).
        reportProtocolError({ eventType: 'state_delta', issuePath: '(patch application)' });
        return;
      }
      syncEvidenceReadiness();
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/agui/bridge.test.ts`
Expected: PASS, including all pre-existing tests in the file (unchanged behavior for valid/structurally-invalid patches).

- [ ] **Step 5: Full verification and commit**

Run: `npm run test && npm run typecheck && npm run lint && npm run format:check`
Expected: all clean.

```bash
git add src/agui/bridge.ts src/agui/bridge.test.ts
git commit -m "fix: wrap STATE_DELTA patch application so an inapplicable patch surfaces as a protocol error instead of throwing"
```

---

### Task 2: B1 + B3 + B5 — dispatch-failure handling, retry-the-operation, abort-on-dispose

**Files:**
- Modify: `src/agui/workbenchSession.ts`
- Modify: `src/agui/workbenchSession.test.ts`
- Modify: `src/agui/client.ts`
- Modify: `src/components/LiveProgressPanel.tsx`

**Interfaces:**
- `WorkbenchSession` gains: private `lastRunInput: { forwardedProps?: { a2uiAction: unknown } }` (replaces the standalone `lastDispatchedActionId` field — derived from `lastRunInput` instead, see below); private `issueRun(input)` (replaces `runInitial()`); public `retry()` (replaces `reconnect()`); `dispose()` gains `this.agent.abortRun()` as its first statement.
- `src/agui/client.ts` renames its exported `reconnect()` to `retry()`, with a documented fallback: if no session exists (defensive — see rationale below), it re-starts a case with the store's last submitted `disputeText` rather than doing nothing.
- `LiveProgressPanel.tsx` imports `retry` instead of `reconnect`; the failed-state button text changes from "Reconnect" to "Retry".

This task combines three brief items (B1, B3, B5) because all three touch the same handful of lines in `WorkbenchSession` — implementing them as three separate diffs on the same file would mean each supersedes the last for no benefit. Read the current `src/agui/workbenchSession.ts` and `src/agui/workbenchSession.test.ts` in full before starting (both were built in the prior hardening pass; this task's diff replaces `runInitial()`/`reconnect()`/the `lastDispatchedActionId` field with the design below, so understand what's there first).

**Design rationale (read before implementing):**

- **B1** wants `dispatchAction()` (currently `void this.agent.runAgent({...})` — no `.catch`, a real unhandled-rejection bug) and the session's initial run to both catch `runAgent()` rejections and map them to a retryable `WorkbenchError` with `code: 'TRANSPORT'`. The brief's literal wording names both `dispatchAction()` and `startCase()` (i.e. `WorkbenchSession.start()`, which today calls a private `runInitial()` using the hardening pass's `'backend_unreachable'` code) as needing the `'TRANSPORT'` code — this is a deliberate simplification superseding the hardening pass's more granular `'backend_unreachable'` string for this specific case (the design doc never froze that literal string in §3.7's normative text, only the *cases* that produce transport errors, so this is safe to change). `'sse_interrupted'` (from `onRunFailed`) and `'run_error'` (from a `RUN_ERROR` event) are untouched — B1 is specifically about `runAgent()`'s own promise rejecting, a different failure mode from those two.
- **B3** wants a retry to re-send the *same* `runAgent` input (empty for the initial review, or `{forwardedProps: {a2uiAction}}` for a dispatched action) rather than always restarting as a fresh review. The cleanest implementation: track one `lastRunInput` field, set every time a run is issued (by the new shared `issueRun()` helper both `start()` and `dispatchAction()` call), and have `retry()` re-issue that same value with a fresh agent/subscription on the same `threadId`. This also lets `getLastDispatchedActionId` (used by `bridge.ts`'s status-derivation table) become a *derived* getter off `lastRunInput` instead of a separately-maintained field — one source of truth instead of two fields that could drift.
- **Button label:** the brief says the failed-state action should read "Retry" and "fall back to 'Start over' only if no last input exists." In this codebase, `lastRunInput` is *always* set (defaults to `{}` in the constructor, meaning "retry the review") — the only case where there's truly no session to retry at all is if `client.ts`'s `currentSession` is `null`, which the failed-state UI can't actually reach in normal use (the button only renders once `connectionStatus === 'failed'`, which requires a session to have started). Rather than build a rarely-reachable label switch, this task keeps the button label a single, honest "Retry" and gives `client.retry()` a defensive fallback (start a new case with the last submitted dispute text) for the `currentSession === null` case, so the *behavior* matches "falls back to starting over" even though the *label* doesn't visually branch. This is a deliberate scope-trim — flag it in your report rather than silently deciding, but implement it as described unless you find a concrete reason the fallback is actually reachable in this codebase (it currently is not).
- **B5** wants `dispose()` to abort the in-flight run before unsubscribing. One line, added to the existing `dispose()`.

- [ ] **Step 1: Write the failing tests**

Add to `src/agui/workbenchSession.test.ts`. First, **update the two existing tests** that assert `transportError?.code).toBe('backend_unreachable')` (the "sets a retryable backend_unreachable transport error when the initial runAgent rejects" test and the "...when reconnect()'s runAgent rejects" test) to expect `'TRANSPORT'` instead, and rename the second one's `reconnect()` call to `retry()` and its description to match. Then **update** the "reconnect() resets lastDispatchedActionId..." test: rename the method call to `.retry()` and the test description to `'retry() resets the derived last-action-id so a fresh review run is not mistaken for a cancellation'` (keep its body's logic — it should still pass once `retry()`'s `issueRun({})` call correctly makes `lastRunInput = {}`, from which the derived `lastDispatchedActionId` getter returns `undefined`).

Then add these new tests:

```ts
it('dispatchAction() catches a rejected runAgent and surfaces a retryable TRANSPORT error without an unhandled rejection', async () => {
  const agent: AguiLikeAgent = {
    threadId: 'fake',
    subscribe: () => ({ unsubscribe: () => {} }),
    runAgent: vi
      .fn()
      .mockResolvedValueOnce({ result: undefined }) // start()'s initial call succeeds
      .mockRejectedValueOnce(new Error('dispatch failed')), // the dispatched action fails
    abortRun: vi.fn(),
  };
  const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
  session.start();
  session.dispatchAction({ name: 'approve_task_creation' });
  await vi.waitFor(() => {
    expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
  });
  expect(useWorkbenchStore.getState().transportError?.code).toBe('TRANSPORT');
  expect(useWorkbenchStore.getState().transportError?.retryable).toBe(true);
});

it('retry() re-sends the same dispatched action (not a fresh review) on the same threadId after a failure', async () => {
  const agents: ReturnType<typeof fakeAgent>[] = [];
  let callCount = 0;
  const session = new WorkbenchSession('t-1', {
    agentFactory: () => {
      const created = fakeAgent();
      created.agent.runAgent = vi.fn().mockImplementation(() => {
        callCount += 1;
        // Fail only the dispatched preview-run call (the 2nd runAgent call
        // overall); every other call (start()'s initial call, and the
        // retry) succeeds.
        return callCount === 2
          ? Promise.reject(new Error('preview run failed'))
          : Promise.resolve({ result: undefined });
      });
      agents.push(created);
      return created.agent;
    },
  });
  session.start();
  session.dispatchAction({ name: 'create_evidence_request_task' });
  await vi.waitFor(() => {
    expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
  });

  session.retry();

  const retryAgent = agents[agents.length - 1].agent;
  expect(retryAgent.runAgent).toHaveBeenCalledWith({
    forwardedProps: { a2uiAction: { name: 'create_evidence_request_task' } },
  });
  expect(session.threadId).toBe('t-1'); // same threadId — no new session/case
});

it('retry() re-runs a failed initial review without generating a new threadId when nothing was dispatched yet', async () => {
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

  session.retry();

  await vi.waitFor(() => {
    expect(agent.runAgent).toHaveBeenCalledTimes(2);
  });
  expect(agent.runAgent).toHaveBeenLastCalledWith({});
  expect(session.threadId).toBe('t-1');
});

it('dispose() aborts the in-flight run before unsubscribing', () => {
  const { agent, subscribers } = fakeAgent();
  const callOrder: string[] = [];
  agent.abortRun = vi.fn(() => callOrder.push('abort'));
  const originalSubscribe = agent.subscribe.bind(agent);
  agent.subscribe = (subscriber) => {
    const result = originalSubscribe(subscriber);
    return {
      unsubscribe: () => {
        callOrder.push('unsubscribe');
        result.unsubscribe();
      },
    };
  };
  const session = new WorkbenchSession('t-1', { agentFactory: () => agent });
  session.start();

  session.dispose();

  expect(agent.abortRun).toHaveBeenCalledTimes(1);
  expect(callOrder).toEqual(['abort', 'unsubscribe']);
  expect(subscribers).toHaveLength(0);
});
```

Note: the second test above (`retry() re-sends the same dispatched action...`) relies on `agents[agents.length - 1].agent` being the SAME object as `retryAgent` — since `retry()` calls `this.createAgent()` to get a fresh agent, and the `agentFactory` in this test pushes a new `fakeAgent()` onto `agents` each time it's called, the array's last entry after `retry()` is the new agent `retry()` is using. Wire this the same way the existing "reconnect() resets lastDispatchedActionId" test already does (read that test's `agents.push(created)` pattern before writing this one — reuse it, don't reinvent it).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/agui/workbenchSession.test.ts`
Expected: FAIL — `retry()` doesn't exist yet (only `reconnect()`), `dispatchAction()` has no `.catch`, `dispose()` doesn't call `abortRun()`.

- [ ] **Step 3: Rewrite `workbenchSession.ts`**

```ts
// src/agui/workbenchSession.ts
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

type RunInput = { forwardedProps?: { a2uiAction: unknown } };

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
  // The single source of truth for "what was the last thing we asked the
  // agent to do" — both the status-derivation table (via the getter below)
  // and retry() (B3) read this instead of maintaining a separate field.
  private lastRunInput: RunInput = {};

  constructor(threadId: string, opts: { agentFactory?: () => AguiLikeAgent } = {}) {
    this.threadId = threadId;
    this.processor = new MessageProcessor<ReactComponentImplementation>([disputeCatalog]);
    this.createAgent = opts.agentFactory ?? (() => defaultAgentFactory(threadId));
    this.agent = this.createAgent();
  }

  private get lastDispatchedActionId(): string | undefined {
    const action = this.lastRunInput.forwardedProps?.a2uiAction;
    return typeof action === 'object' && action !== null && 'name' in action
      ? String((action as { name: unknown }).name)
      : undefined;
  }

  private subscribeAgent(): void {
    const subscriber = createWorkbenchAgentSubscriber(
      this.processor,
      logValidationFailure,
      () => this.lastDispatchedActionId,
    );
    this.agentSubscription = this.agent.subscribe(subscriber);
  }

  start(): void {
    useWorkbenchStore.getState().setProcessor(this.processor);
    this.subscribeAgent();
    this.actionSubscription = this.processor.model.onAction.subscribe((action) => {
      const validated = validateForwardedAction(action);
      if (!validated.success) {
        logValidationFailure(validated.failure);
        return;
      }
      this.dispatchAction(validated.data);
    });
    this.issueRun({});
  }

  /**
   * Sends one AG-UI run and remembers its input so a later retry() (B3) can
   * re-issue the SAME operation instead of restarting the case. Any
   * rejection (B1) becomes a retryable WorkbenchError, never an unhandled
   * promise rejection.
   */
  private issueRun(input: RunInput): void {
    this.lastRunInput = input;
    this.agent.runAgent(input).catch((error: Error) => {
      useWorkbenchStore.getState().setTransportError({
        code: 'TRANSPORT',
        title: input.forwardedProps ? 'Action failed' : 'Could not reach the orchestrator',
        message: error.message || 'The request could not be completed.',
        retryable: true,
      });
      useWorkbenchStore.getState().setConnectionStatus('failed');
    });
  }

  dispatchAction(a2uiAction: unknown): void {
    this.issueRun({ forwardedProps: { a2uiAction } });
  }

  /**
   * Re-issues the last runAgent input (review, preview, approval, or
   * cancel) on the SAME threadId with a fresh agent/subscription — never a
   * new review, per B3. Since lastRunInput defaults to {} until an action
   * is dispatched, retrying before any action was ever sent correctly
   * re-runs the review.
   */
  retry(): void {
    this.agentSubscription?.unsubscribe();
    this.agent = this.createAgent();
    this.subscribeAgent();
    useWorkbenchStore.getState().setConnectionStatus('connecting');
    this.issueRun(this.lastRunInput);
  }

  abort(): void {
    this.agent.abortRun();
  }

  dispose(): void {
    // B5: abort whatever's in flight before tearing down subscriptions, so
    // a stray late event from an about-to-be-replaced agent can't sneak
    // through in the gap between "still subscribed" and "unsubscribed."
    this.agent.abortRun();
    this.agentSubscription?.unsubscribe();
    this.agentSubscription = null;
    this.actionSubscription?.unsubscribe();
    this.actionSubscription = null;
  }
}
```

- [ ] **Step 4: Update `client.ts`**

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

/**
 * Re-issues the last failed operation on the same case (B3) — not a fresh
 * review. Falls back to starting a new case with the last submitted dispute
 * text only if no session exists at all, which the failed-state UI can't
 * actually reach today (it only renders once a session's connectionStatus
 * is 'failed', which requires a session to have started) — kept as a
 * defensive fallback rather than an assumption.
 */
export function retry(): void {
  if (currentSession) {
    currentSession.retry();
    return;
  }
  startDemoCase(useWorkbenchStore.getState().disputeText);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    currentSession?.dispose();
  });
}
```

- [ ] **Step 5: Update `LiveProgressPanel.tsx`**

Change the import and the button:

```tsx
import { retry } from '../agui/client';
```

```tsx
        {error?.retryable !== false && (
          <button
            type="button"
            onClick={retry}
            className="font-medium text-pending underline decoration-pending/40 underline-offset-2 hover:decoration-pending"
          >
            Retry
          </button>
        )}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/agui/workbenchSession.test.ts`
Expected: PASS, all new and updated tests green.

Run: `npm run test`
Expected: full suite green, including `src/test/integration.test.tsx` (dispatched actions during the mock-mode replay still work — `create_evidence_request_task`/`approve_task_creation`/`cancel_task_creation` all go through `dispatchAction` → `issueRun`, unchanged in outward behavior for the success path) and `src/test/fixtures/contract.test.ts` (uses `createWorkbenchAgentSubscriber` directly, unaffected by this task).

- [ ] **Step 7: Typecheck, lint, format, build, commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm run build
git add src/agui/workbenchSession.ts src/agui/workbenchSession.test.ts src/agui/client.ts src/components/LiveProgressPanel.tsx
git commit -m "feat: catch dispatch/initial-run rejections (B1), retry the failed operation instead of restarting (B3), abort in-flight runs on dispose (B5)"
```

---

### Task 3: B4 — approval idempotency spec amendment

**Files:**
- Modify: `docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md`
- Modify: `README.md`

This is the one authorized contract change in this pass. It exists because Task 2's `retry()` can now re-send an `approve_task_creation` action that already executed (e.g., the approval run's `RUN_FINISHED` never arrived due to a transport failure, but the backend had already written the task before the connection dropped) — without server-side idempotency, that retry would double-write.

- [ ] **Step 1: Prepend the changelog entry**

In `docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md`, add a new blockquote **above** the existing four (newest first — this becomes the fifth):

```markdown
> **2026-07-14 amendment (final pass):** New §3.3 item 4 documents that
> approval execution is idempotent server-side, keyed by the same
> `(threadId, surfaceId)` pending-approval state as item 3 — required now
> that the frontend's retry affordance (`WorkbenchSession.retry()`) can
> resend the same `approve_task_creation` action after a transport failure.
```

- [ ] **Step 2: Add §3.3 item 4**

Find §3.3's numbered list (it currently ends with item 3, "Pending-approval state is held server-side, keyed by `(threadId, surfaceId)`..."). Add a new item 4 immediately after it, before the `### 3.4` heading:

```markdown
4. **Approval execution is idempotent server-side, keyed by that same
   `(threadId, surfaceId)` pending-approval state.** **[convention — frozen]**
   If an `approve_task_creation` action arrives for an approval that has
   already executed — for example, a client retry after a mid-run transport
   failure, where the write completed but the client never saw
   `RUN_FINISHED` — the backend must not write again. It re-emits the
   current terminal state (`TaskCreatedCard`, via `updateComponents` on the
   existing surface) for that surface instead. This is what makes the
   frontend's "retry the last operation, not the whole workflow" behavior
   safe: a duplicate approve is a no-op observation, not a duplicate write.
```

- [ ] **Step 3: Mirror one line into the README**

In `README.md`'s "Contract notes for backend implementers" bullet list, add one bullet after the existing "Cancel is a real, server-driven run" bullet:

```markdown
- **Approval execution is idempotent server-side** (§3.3, keyed by the same
  `(threadId, surfaceId)` pending-approval state) — a retried
  `approve_task_creation` after a transport failure must not double-write;
  the backend re-emits the current terminal state instead.
```

- [ ] **Step 4: Verify and commit**

Run: `npm run format:check` (docs are Prettier-formatted in this repo too — confirm the two files stay clean).

```bash
git add docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md README.md
git commit -m "docs: amend design doc with approval idempotency contract (B4)"
```

---

### Task 4: B6 — cap progress history

**Files:**
- Modify: `src/agui/validation.ts`
- Modify: `src/state/workbenchStore.ts`
- Modify: `src/state/workbenchStore.test.ts`
- Modify: `src/components/LiveProgressPanel.tsx`

**Interfaces:**
- Produces (`validation.ts`): `export const MAX_PROGRESS_LINES = 1000;` (alongside the existing caps).
- `ProgressLine.source` becomes `AgentSource | null` — `null` marks the one non-agent "earlier entries trimmed" ledger row.

- [ ] **Step 1: Add the constant**

In `src/agui/validation.ts`, add to the existing caps block:

```ts
export const MAX_COMPONENTS_PER_UPDATE = 20;
export const MAX_CHECKLIST_ITEMS = 20;
export const MAX_ACTIONS = 10;
export const MAX_PROGRESS_TEXT = 500;
export const MAX_PROGRESS_LINES = 1000;
```

- [ ] **Step 2: Write the failing store test**

Add to `src/state/workbenchStore.test.ts`:

```ts
it('appendProgressLine keeps at most MAX_PROGRESS_LINES real entries, prepending one trim marker once the cap is exceeded', () => {
  for (let i = 0; i < 1005; i += 1) {
    useWorkbenchStore.getState().appendProgressLine('orchestrator', `line ${i}`);
  }
  const lines = useWorkbenchStore.getState().progressLines;
  expect(lines).toHaveLength(1001); // 1000 retained real entries + 1 trim marker
  expect(lines[0].source).toBeNull();
  expect(lines[1].text).toBe('line 5'); // entries 0-4 were trimmed
  expect(lines[lines.length - 1].text).toBe('line 1004');
  expect(lines.slice(1).every((line) => line.source !== null)).toBe(true);
});
```

Add `MAX_PROGRESS_LINES` to the test file's imports if the test needs the literal number rather than hardcoding `1005`/`1000` — hardcoding is fine here for readability, matching this file's existing style (its other tests use literal values, not imported constants).

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- src/state/workbenchStore.test.ts`
Expected: FAIL — no trimming exists yet, `progressLines` would have 1005 entries with no marker.

- [ ] **Step 4: Implement trimming in the store**

```ts
// src/state/workbenchStore.ts
import { MAX_PROGRESS_LINES } from '../agui/validation';

// ...

export interface ProgressLine {
  id: string;
  source: AgentSource | null; // null marks the one non-agent trim-marker row
  text: string;
  timestamp: number;
}

const TRIM_MARKER_TEXT = '— earlier entries trimmed —';

// ...inside the store body, replace appendProgressLine:

  appendProgressLine: (source, text) =>
    set((state) => {
      const nextLine: ProgressLine = {
        id: `line-${++progressLineCounter}`,
        source,
        text,
        timestamp: Date.now(),
      };
      const hasMarker = state.progressLines[0]?.source === null;
      const realLines = hasMarker ? state.progressLines.slice(1) : state.progressLines;
      const nextReal = [...realLines, nextLine];

      if (nextReal.length <= MAX_PROGRESS_LINES) {
        const marker = hasMarker ? [state.progressLines[0]] : [];
        return { progressLines: [...marker, ...nextReal] };
      }

      const trimmedReal = nextReal.slice(nextReal.length - MAX_PROGRESS_LINES);
      const marker: ProgressLine = {
        id: 'trim-marker',
        source: null,
        text: TRIM_MARKER_TEXT,
        timestamp: 0,
      };
      return { progressLines: [marker, ...trimmedReal] };
    }),
```

(Add the `MAX_PROGRESS_LINES` import at the top of the file alongside the existing imports; `TRIM_MARKER_TEXT` is a small local constant, not exported — nothing else needs it.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/state/workbenchStore.test.ts`
Expected: PASS.

- [ ] **Step 6: Render the trim marker**

In `src/components/LiveProgressPanel.tsx`, the `progressLines.map(...)` needs a branch for `source === null`. Replace:

```tsx
              {progressLines.map((line) => (
                <div
                  key={line.id}
                  data-testid="progress-line"
                  className="relative animate-ledger-in pl-6"
                >
```

with a conditional that renders the marker row separately and skips the rest of that entry's normal body:

```tsx
              {progressLines.map((line) =>
                line.source === null ? (
                  <div
                    key={line.id}
                    aria-hidden
                    data-testid="progress-trim-marker"
                    className="pl-6 font-mono text-[10px] italic text-ink/30"
                  >
                    {line.text}
                  </div>
                ) : (
                  <div
                    key={line.id}
                    data-testid="progress-line"
                    className="relative animate-ledger-in pl-6"
                  >
```

Close the added ternary's parenthesis correctly around the existing entry body (the marker branch above, the existing per-agent JSX below, both ending the `.map()` callback with `),`  ` )}` as appropriate — read the current file's exact JSX structure before editing so the braces/parens balance; this is a structural edit, not a text replace, so verify it compiles rather than trusting the snippet's exact whitespace).

`aria-hidden` on the marker matches the brief's "aria-hidden marker row, not announced" requirement — it's decorative ledger furniture, not new information a screen reader user needs (the timeline's `role="log"`/`aria-live="polite"` from the hardening pass already announces real entries; a "some old stuff got trimmed" row isn't actionable).

- [ ] **Step 7: Full verification and commit**

Run: `npm run test && npm run typecheck && npm run lint && npm run format:check && npm run build`
Expected: all clean.

```bash
git add src/agui/validation.ts src/state/workbenchStore.ts src/state/workbenchStore.test.ts src/components/LiveProgressPanel.tsx
git commit -m "feat: cap progress-line history at MAX_PROGRESS_LINES with a single trim-marker row (B6)"
```

---

### Task 5: B7 — CI tightening

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Read the current file, then apply the three additions**

Read `.github/workflows/ci.yml` in full first (it has drifted slightly from earlier — action versions may differ from what's in earlier plan documents; use the file's real current content as the base for this edit, not any older version referenced elsewhere).

Add `permissions` at the workflow level (top, after `on:` and before `jobs:`) and `concurrency` + `timeout-minutes` at the job level:

```yaml
permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      # ...unchanged steps below, including the existing non-blocking
      # `npm audit --audit-level=high` step — leave that exactly as-is.
```

Every existing step (`checkout`, `setup-node`, `npm ci`, `npm audit` with `continue-on-error: true`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run test`) stays unchanged — this task only adds the three new top-level/job-level keys.

- [ ] **Step 2: Validate YAML and commit**

There's no local CI runner to test this against; sanity-check the YAML parses with a quick `node -e "require('js-yaml') ? null : null"`-style check isn't available without adding a dependency — instead, visually verify indentation matches the existing file's 2-space style exactly, and that `permissions`/`concurrency` are workflow-level keys (same indentation as `on:`/`jobs:`), not nested under `jobs:`.

```bash
git add .github/workflows/ci.yml
git commit -m "chore: tighten CI — read-only permissions, concurrency cancellation, 15-minute timeout (B7)"
```

---

### Task 6: Verify Task 2's rename didn't leave stale references

**Files:** none new — this is a verification-only task, not a code task.

- [ ] **Step 1: Grep for the old name**

```bash
grep -rn "\breconnect\b" src/ README.md docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md
```

Expected: no hits (or only in this plan document / historical commit messages, which don't count). If the design doc or README's "Session and surface model" / "Error states" prose mentions "Reconnect" as a UI-affordance name anywhere (check `README.md`'s "Error states" section, added in the hardening pass — it may say "a Reconnect affordance"), update that wording to "Retry" to match Task 2's rename. Fix any hits found; if there are none, note that in your report and skip the commit.

```bash
git add -A  # only if Step 1 found something to fix
git commit -m "docs: rename Reconnect to Retry in prose to match the renamed UI affordance"  # only if there was something to commit
```

---

### Task 7: Section A — README restructure

**Files:**
- Modify: `README.md`

Read the full current `README.md` before starting (it should be ~301 lines as of the end of Task 3, after B4's one-line mirror addition — confirm with `wc -l README.md`). This task inserts two new sections and reorders two existing ones; it does not move the existing hero image / quick-start / status table (those stay exactly where they are, immediately after the title and badges, before `## What this is` — the A1 instruction to place the new section "immediately after 'What this is'" is unambiguous about that anchor point, and no other step in this task asks to relocate the hero/quick-start content).

- [ ] **Step 1: Insert "How the workbench works" and "Why not a chatbot?" immediately after "## What this is"**

Find the end of the `## What this is` section (it ends right before `## The protocols, and where you see each one`). Insert these two new sections there, in this exact order, verbatim:

```markdown
## How the workbench works

Picture a dispute ops analyst. A customer reports: "I paid SGD 250 for an
item, but I never received it. The merchant says it was delivered."

1. **Submit** — the analyst pastes in the dispute and clicks one button.
2. **Watch, don't wait** — progress starts streaming immediately. No
   spinner; a growing list of what's actually happening.
3. **Two specialists work in parallel** — one checks the transaction and
   what's on file; the other checks which policy applies and what evidence
   it requires.
4. **Their findings are merged** — what's present versus what's required,
   reconciled into one picture.
5. **A decision view appears** — status, an evidence checklist, a
   recommended next action. Not a paragraph to parse — a structure to scan.
6. **The analyst clicks "Create Evidence Request Task."** Nothing is
   written yet.
7. **A preview appears** — the exact task about to be created, plainly
   stated.
8. **Only after approval** is the task created, the case status updated,
   and the audit entry written.

The analyst never waits behind a spinner, never receives a wall of text to
parse, and stays in control of every write. [The flow](#the-flow) below is
the same journey, annotated with the protocol names and wire mechanics that
make it real.

## Why not a chatbot?

A chatbot answers a question. This workbench runs an operations workflow:
it shows the work happening in real time, coordinates two specialists in
parallel, renders the outcome as structured decision UI instead of prose,
and refuses to write anything until a human approves it. Free-form
conversation would hide all four of those — there is no chat interface
here, and there isn't meant to be one.

The same system, as an architecture diagram (per the platform spec — the
two write/read paths from the specialists are deliberately separate, not
merged into one generic "backend call"):

```
            React UI  (this repo)
               │
               │  AG-UI (SSE) — progress, state, A2UI payloads
               ▼
        Orchestrator Agent ──────────────┐
               │                          │ MCP (approval-gated write)
               │  A2A (parallel fan-out)  ▼
     ┌─────────┴─────────┐          Case system
     ▼                   ▼          (task + audit)
Case Review Agent   Policy Agent
     │                   │
     │ MCP (reads)       │ RAG
     ▼                   ▼
Claims / Case DB    Policy document index
```
```

(The ASCII diagram is given verbatim in the brief and must not be altered — reproduce it exactly, including spacing, inside a fenced code block as shown.)

- [ ] **Step 2: Condense the protocols section's scene-setting to stay within the line budget**

In `## The protocols, and where you see each one` (now positioned after the two new sections), the opening line "Two protocols are visible in this UI; two more happen entirely behind it." is now redundant with A2's "why not a chatbot" framing and A3's diagram. Trim it to a single shorter line that doesn't restate what A1–A3 just covered:

```markdown
## The protocols, and where you see each one
```

—delete the "Two protocols are visible..." sentence entirely (the section's first `**AG-UI is...**` paragraph starts immediately after the heading). This alone removes 2 lines (the sentence + its blank line) toward the ≤50-line budget.

- [ ] **Step 3: Add the intro line to "The flow"**

Find `## The flow`. Immediately after the heading, before the existing "Eight steps, each naming which AG-UI run it happens in..." sentence, add:

```markdown
The same journey as [How the workbench works](#how-the-workbench-works)
above, but annotated with what happens on the wire.
```

- [ ] **Step 4: Verify heading anchors still resolve**

List every internal `[...](#...)` link in the file and confirm each target heading still exists with matching GitHub-slug text (lowercase, spaces to hyphens, no punctuation other than hyphens):

```bash
grep -n '\](#' README.md
grep -n '^#' README.md
```

Cross-check by hand: `#the-flow`, `#session-and-surface-model`, `#running-it`, `#contract-notes-for-backend-implementers`, `#how-the-workbench-works` (new, added in Step 3) all need a matching heading. Nothing in this task renames an existing heading, so this should already hold — this step is a verification, not expected to require changes, but do it and note the result in your report.

- [ ] **Step 5: Check the line budget**

```bash
wc -l README.md
```

Compare against the count from before this task started (recorded at the top of this task's instructions). If net growth exceeds 50 lines, condense further — the "What this is" paragraph's second half (from "This repo is the frontend only..." onward) is the next-best candidate to trim, since A1 now carries some of that context narratively. Only trim if actually over budget; do not cut for its own sake.

- [ ] **Step 6: Full verification and commit**

Run: `npm run test && npm run typecheck && npm run lint && npm run format:check && npm run build` (README changes shouldn't affect any of these, but confirm nothing else broke and that Prettier is happy with the new markdown).

```bash
git add README.md
git commit -m "docs: restructure README narrative-first — add How the workbench works, Why not a chatbot?, and an architecture diagram ahead of the protocol details"
```

---

## Final Steps (controller, not a dispatched task)

After Task 7's review passes:

1. Run the final whole-branch review (superpowers:requesting-code-review's code-reviewer, most capable available model) against the full branch diff from `main`.
2. Produce and show the user: `git diff main -- README.md` (summarized, not the raw 100+ line diff, given the acceptance criteria's "README diff summary") and `git diff main -- docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md` (the spec diff — should contain only the B4 amendment + changelog line, per the acceptance criteria; verify this explicitly, since it's a hard constraint, not a soft one).
3. Use superpowers:finishing-a-development-branch to merge, PR, or hold, per the user's choice.
