# agentic-dispute-workbench-ui — Design

## 1. Purpose

A React/TypeScript frontend for a bank's Dispute Resolution Workbench: an ops analyst
submits a customer dispute, watches specialist agents work via a live AG-UI progress
stream, and approves a write action through structured A2UI decision UI before anything
is committed. This is a workbench, not a chatbot — no free-form conversation UI.

The backend (`agentic-dispute-workbench-platform`, Java/Spring) does not exist yet. The
UI must be fully demoable standalone in a scripted mock mode, and the wire contract
documented here is what that backend must implement.

## 2. Package architecture

| Concern              | Package          | Version  | Role                                                  |
| -------------------- | ---------------- | -------- | ----------------------------------------------------- |
| AG-UI protocol types | `@ag-ui/core`    | `0.0.57` | Event/schema types (pinned exact)                     |
| AG-UI SSE client     | `@ag-ui/client`  | `0.0.57` | `HttpAgent` — headless, subscriber-pattern SSE client |
| A2UI protocol core   | `@a2ui/web_core` | `0.10.4` | `Catalog`, `MessageProcessor`, schemas (v0.9)         |
| A2UI React renderer  | `@a2ui/react`    | `0.10.1` | `A2uiSurface`, `createComponentImplementation`        |

**Explicitly not used:** `@copilotkit/react-core`, `@copilotkit/a2ui-renderer`,
`CopilotSidebar`/`CopilotChat`. Investigation of the current (2026-07) CopilotKit A2UI
integration found it built around `createA2UIMessageRenderer` intercepting JSONL inside
a `CopilotSidebar`/`CopilotChat` surface, backed by a `CopilotRuntime`. Its custom-catalog
extension API is undocumented beyond a `theme` option. This conflicts with the
no-chat-UI requirement and carries unverified extensibility risk.

Instead we use the two real upstream protocol libraries directly:

- `@ag-ui/client`'s `HttpAgent` **is** "the AG-UI client" (published by the same
  CopilotKit/ag-ui-protocol org, protocol-only, no chat UI attached).
- `@a2ui/react` + `@a2ui/web_core` **is** the official A2UI project's own React
  renderer (not CopilotKit's wrapper). Verified against its real source
  (`renderers/react/src/v0_9/`, `renderers/web_core/src/v0_9/`) on
  `github.com/a2ui-project/a2ui`: it has a fully documented, working extension API —
  `Catalog`, `createComponentImplementation`, `MessageProcessor` — built exactly for
  registering a closed set of named business components with Zod schemas. This is a
  stronger, verified fit than guessing at CopilotKit's undocumented catalog hook.

Both are genuine, current (published within the last two weeks as of 2026-07-13)
packages pinned to exact versions in `package.json`.

## 3. Wire contract (what the Java backend must implement)

This section is the authoritative contract. It mixes verified upstream protocol shapes
(marked **[spec]**) with conventions we are defining ourselves because no backend exists
yet (marked **[convention — frozen]**).

### 3.1 AG-UI event stream

SSE stream from `VITE_ORCHESTRATOR_URL` (default `http://localhost:8080/agui`),
`@ag-ui/core` `EventType` values, one JSON event per SSE message:

- `RUN_STARTED` **[spec]** — `{type, threadId, runId, parentRunId?, input?}`
- `RUN_FINISHED` **[spec]**
- `RUN_ERROR` **[spec]**
- `CUSTOM` **[spec]** — `{type:"CUSTOM", name: string, value: any}`. Used for both A2UI
  payloads and progress lines (see below) — this is the one AG-UI-native escape hatch
  for application-specific data, and its `value` field is untyped by design (`z.any()`
  / equivalent `Object`/`JsonNode` on the Java side), so it does not fight typed
  event classes the way extending `TEXT_MESSAGE_*` would.
- `STATE_SNAPSHOT` **[spec]** — `{type, snapshot: any}`. **[convention — frozen]** The
  backend must emit one `STATE_SNAPSHOT` (e.g. `{"evidenceReadiness": null}`) at the
  start of the run that first touches state, before any `STATE_DELTA` targeting that
  run's state. RFC 6902 `replace` against a path that doesn't yet exist is an error;
  the snapshot establishes the path so later patches can use `replace` safely.
- `STATE_DELTA` **[spec]** — `{type, delta: JsonPatchOp[]}`, applied via RFC 6902 JSON
  Patch semantics, for `evidenceReadiness` status-chip updates.

**`evidenceReadiness` is two independent channels, not one** — it appears both as AG-UI
state (`STATE_SNAPSHOT`/`STATE_DELTA`, drives the status chip) and as a `DecisionCard`
prop delivered via A2UI `updateComponents` (§4). These are deliberately separate; the
backend must update both when readiness changes. Do not collapse them into a single
source later — the chip needs to update independently of, and often before, the
decision panel's A2UI surface exists.

**Progress lines — [convention — frozen]:** carried as `CUSTOM` events, not
`TEXT_MESSAGE_*`:

```json
{
  "type": "CUSTOM",
  "name": "progress",
  "value": { "source": "case-review", "text": "Checking transaction status..." }
}
```

`source` is one of `"orchestrator" | "case-review" | "policy"`.

**Why not `TEXT_MESSAGE_START/CONTENT/END` with a `source` field appended:** the
TypeScript `@ag-ui/core` schemas are `.passthrough()`, so an extra field is legal
client-side — but the Java backend will emit events via typed `ag-ui-core` classes
(fixed fields, no passthrough equivalent for a hand-rolled POJO without custom Jackson
work). Routing progress lines through `CUSTOM` (already required for A2UI payloads)
means the backend only has to solve "serialize an arbitrary value into one event type"
once, not twice. This is the frozen decision — do not reintroduce a `source`-on-
`TEXT_MESSAGE_*` path without updating this doc.

### 3.2 A2UI payloads over AG-UI

**[convention — frozen]** A2UI server→client messages ride inside `CUSTOM` events:

```json
{"type": "CUSTOM", "name": "a2ui", "value": {"version": "v0.9", "updateComponents": {...}}}
```

`value` is a verified v0.9 `A2uiMessage` **[spec]** (`createSurface` |
`updateComponents` | `updateDataModel` | `deleteSurface`, from
`@a2ui/web_core/v0_9` schemas — see §4 for exact shapes and real examples).

### 3.3 Session continuity: threadId, surfaceId, and multi-run sessions

SSE is server→client only, so the only way a client-side click reaches the backend is by
starting a new AG-UI run (§3.4). A case session is therefore **at least three runs**:
a **review run** (progress lines → `DecisionCard`/`EvidenceChecklist`/`NextActions`),
a **preview run** (triggered by a `NextActions` click, renders `ApprovalPreview`), and
an **approval run** (triggered by "Approve Task Creation", executes the write, renders
`TaskCreatedCard`) — plus a possible **cancel run** in place of the approval run (§3.4.1).
No run is ever left open waiting on a UI click; each run ends in its own `RUN_FINISHED`.
This has consequences the backend must honor:

1. **`threadId` is reused across every run in a case session.** The client generates
   (or receives, in `RUN_STARTED.threadId`) one `threadId` when the case is first
   submitted and passes that same `threadId` on every subsequent `runAgent()` call for
   that case (action clicks, retries after reconnect). The Java orchestrator uses
   `threadId` as the session correlation key.
2. **The A2UI `surfaceId` persists across runs within a session.** The decision panel's
   surface (e.g. `surfaceId: "case-D-10291"`) is created once — by whichever run first
   has UI to show (§3.5) — and is **updated** (`updateComponents`/`updateDataModel`),
   never torn down and recreated, by every later run in the same session, including the
   preview and approval runs. The client does not call `deleteSurface` on run
   boundaries.
3. **Pending-approval state is held server-side, keyed by `(threadId, surfaceId)`.**
   When the orchestrator renders `ApprovalPreview` (end of the preview run), the fact
   that this case is awaiting approval is state it owns, keyed on that pair — not
   something the client tracks or re-derives. The click that arrives on the next run
   (`forwardedProps.a2uiAction`, carrying `sourceComponentId` and the originating
   `surfaceId`) is how the backend correlates "this approval-or-cancel" with "the
   preview I showed."

### 3.4 A2UI client actions (button clicks)

**[spec]** shape (`@a2ui/web_core/v0_9` `client-to-server.ts`):

```json
{
  "version": "v0.9",
  "action": {
    "name": "approve_task_creation",
    "surfaceId": "case-D-10291",
    "sourceComponentId": "approve-btn",
    "timestamp": "2026-07-13T10:40:00Z",
    "context": {}
  }
}
```

**[convention — frozen]** Transport: A2UI itself assumes a persistent bidirectional
channel, which a discrete-run AG-UI SSE model doesn't have. We send the action by
starting a **new** AG-UI run on the **same `threadId`**:

```ts
agent.runAgent({ threadId, forwardedProps: { a2uiAction: <A2uiClientAction> } })
```

`forwardedProps: any` is a verified field on `RunAgentInput` **[spec]**, the standard
AG-UI escape hatch for client→agent app-specific data.

#### 3.4.1 Cancel and Edit

**[convention — frozen]** "Cancel" on `ApprovalPreview` dispatches a real action
(`name: "cancel_task_creation"`) exactly like Approve, starting a **cancel run** on the
same `threadId`/`surfaceId`. This is the resolution to the gap where §3.3's server-owned
pending-approval state would otherwise go stale after a client-only cancel: the cancel
run's job is to clear that server-side pending state and re-render the surface back to
the decision view (re-issuing `DecisionCard`/`EvidenceChecklist`/`NextActions` via
`updateComponents` on the existing surface), then `RUN_FINISHED`. The client does not
locally revert the view on Cancel; it waits for the cancel run's `updateComponents`,
consistent with every other state change being server-driven.

"Edit" is the one client-only exception: it is intercepted before any action is
dispatched (per the original scope note, "Edit flow not in demo scope") and never
reaches the backend. If Edit becomes real in a future iteration, it should follow the
same dispatched-action pattern as Cancel, not stay client-local.

### 3.5 `createSurface` lifecycle

**[convention — frozen]** The backend sends `createSurface` for a given `surfaceId`
**once per case session** (on the first run that has UI to show — not necessarily the
very first run, since early runs are progress-line-only). The client is idempotent on
this: if a `createSurface` arrives for a `surfaceId` that already exists in the local
`MessageProcessor`, it is ignored (logged, not treated as an error) rather than
recreating the surface. This matters because the preview, approval, and cancel runs all
continue the same surface (§3.3) — none of them should resend `createSurface`, but the
client tolerates it defensively if one does.

## 4. A2UI catalog

Catalog id: `https://dispute-workbench.internal/catalogs/v1.json` (our own — not
fetched, just an identifier string per the `catalogId` field's contract).

Built with the real `@a2ui/web_core/v0_9` `Catalog` class and
`@a2ui/react/v0_9` `createComponentImplementation`, matching the verified flat
`updateComponents` component shape:

```json
{
  "id": "decision-1",
  "component": "DecisionCard",
  "status": "Needs More Evidence",
  "disputeType": "Goods Not Received",
  "evidenceReadiness": "2 of 4 required items present",
  "recommendedAction": "Create evidence request task"
}
```

(Structurally identical to the official `07_task-card.json` example's flat
`{id, component, ...props}` shape — this is what "A2UI-v0.9-conformant, not merely
plausible" means in practice.)

### 4.1 Components (exactly these five)

| Component           | Props                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `DecisionCard`      | `status`, `disputeType`, `evidenceReadiness`, `recommendedAction` (all `DynamicString`)                                                    |
| `EvidenceChecklist` | `items: {label: DynamicString, present: DynamicBoolean}[]`                                                                                 |
| `NextActions`       | `actions: {id: string, label: DynamicString}[]`, each dispatches `Action` (`event.name = action.id`)                                       |
| `ApprovalPreview`   | `caseId`, `newCaseStatus`, `missingItems: DynamicString[]`, `actionAfterApproval`; three `Action` props: `onApprove`, `onEdit`, `onCancel` |
| `TaskCreatedCard`   | `taskId`, `caseStatus`, `auditEntry`, `nextOwner` (all `DynamicString`)                                                                    |

`ApprovalPreview` is visually distinguished (border + icon) as the human-approval gate
— "nothing has been written yet."

**Addendum — composing three simultaneous cards under one A2UI root:**
`A2uiSurface` renders exactly one root component per surface (`id: "root"`), but the
decision view needs `DecisionCard`, `EvidenceChecklist`, and `NextActions` visible at
once. Since the catalog is closed (no generic `Column`/layout component allowed),
`DecisionCard` carries two extra plumbing props — `checklistId: ComponentId` and
`actionsId: ComponentId` (both optional) — and calls A2UI's real child-composition
mechanism (`buildChild`) to nest the components those ids point to. `DecisionCard` is
always `root`; `EvidenceChecklist` and `NextActions` are separate entries in the same
`updateComponents.components` array, referenced only through those two ids — not
independently reachable. This is composition via the protocol's own mechanism, not a
new catalog entry, and it doesn't change §3's session/surface/createSurface contract:
still one surface, same id, same lifecycle. `ApprovalPreview` and `TaskCreatedCard`
remain standalone roots (no children) since they're single-card states.

### 4.2 Closed catalog / unknown-component fallback

`@a2ui/react`'s built-in behavior for an unrecognized `component` type is a plain "Unknown
component: X" red `<div>` — it does not include the raw JSON the spec requires. We keep
this inside the real rendering pipeline rather than forking `A2uiSurface`: a
pre-processing step rewrites any `updateComponents` entry whose `component` isn't one of
the five names above into
`{id, component: "UnknownComponentFallback", originalType, raw: JSON.stringify(original)}`,
where `UnknownComponentFallback` is a sixth catalog entry registered purely as the
safety net (not counted among "the five"). It renders a bordered box with the original
type name and pretty-printed JSON. Never throws.

## 5. Screens & layout

Three-zone single page (Tailwind, light theme, dense enterprise-console aesthetic):

1. **Case intake** — textarea (pre-filled with the demo dispute text), "Review Dispute"
   button, case ID display once a run starts.
2. **Live agent progress** — timeline of progress-line `CUSTOM` events, each labeled
   with `source` (distinct color/badge per Orchestrator / Case Review Agent / Policy
   Agent), strict arrival order, timestamped, auto-scroll with pause-on-hover.
3. **Decision panel** — `A2uiSurface` for the session's one surface.

Connection states: connecting → streaming → disconnected mid-run (reconnect button, no
silent infinite retry) → finished.

## 6. State management

Zustand store (`src/state/`) holding: `threadId`, `runId`, connection status, ordered
progress-line list (each `{source, text, timestamp}`), the `MessageProcessor` instance
and its current surface, and case metadata (case ID, submitted dispute text). All
in-memory — no localStorage/sessionStorage.

## 7. Mock mode

`VITE_MOCK=true` (dev default). `src/mock/demoScript.ts` is a single fixtures file
whose events are real, fully-typed AG-UI events (`CustomEvent`, `RunStartedEvent`, etc.
from `@ag-ui/core`) — including the `CUSTOM`/`progress`, `CUSTOM`/`a2ui`, and
`forwardedProps.a2uiAction` shapes from §3 — replayed on a timer (~300–800ms apart) by
a scripted agent that satisfies the same subscriber interface `HttpAgent` does. Swapping
to a live backend is a `VITE_ORCHESTRATOR_URL` change, not a code change. The mock
reuses one `threadId` for the whole session and sends exactly one `createSurface`, on
the review run (later runs reuse the surface, per §3.3/§3.5). Three runs, matching §3.3:

1. **Review run** — `RUN_STARTED` → progress lines → `STATE_SNAPSHOT` → merge progress
   lines → `STATE_DELTA` → `createSurface` + `DecisionCard`/`EvidenceChecklist`/
   `NextActions` → `RUN_FINISHED`.
2. **Preview run** — triggered by the `NextActions` "Create Evidence Request Task"
   click (`forwardedProps.a2uiAction`) → `RUN_STARTED` → `updateComponents` swaps the
   surface to `ApprovalPreview` → `RUN_FINISHED`.
3. **Approval run** — triggered by "Approve Task Creation" → `RUN_STARTED` → the
   "Creating evidence request task..." progress lines → `updateComponents` swaps the
   surface to `TaskCreatedCard` → `RUN_FINISHED`.

Cancel (from `ApprovalPreview`) triggers an alternate **cancel run** in place of the
approval run — `RUN_STARTED` → `updateComponents` reverts the surface to the decision
view → `RUN_FINISHED` — per §3.4.1; the client does not revert the view itself. Edit
is intercepted client-side before dispatch and shows a toast, "Edit flow not in demo
scope," never starting a run.

## 8. Testing

Vitest + React Testing Library. Component tests for all five catalog components plus
`UnknownComponentFallback`, rendered from A2UI-v0.9-conformant fixture JSON — structural
shape checked against the real official examples pulled from
`specification/v0_9/catalogs/basic/examples/` (`07_task-card.json`,
`00_interactive-button.json`), not hand-guessed JSON. One integration test replays
`demoScript.ts` end-to-end and asserts the final DOM contains `TaskCreatedCard`.

## 9. Non-goals

- No chat/free-form conversation UI.
- No components beyond the five (plus the internal `UnknownComponentFallback` safety net).
- No decision logic (readiness calculation, missing-evidence derivation) in the
  frontend — arrives entirely via the stream.
- No localStorage/sessionStorage/persistence.
