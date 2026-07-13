# agentic-dispute-workbench-ui

The operations UI for a bank's Dispute Resolution Workbench. An ops analyst submits a
customer dispute, watches specialist agents work in real time via a live AG-UI progress
stream, and approves a write action through structured A2UI decision UI — a `DecisionCard`,
an `EvidenceChecklist`, a set of `NextActions`, an `ApprovalPreview` gate, and a final
`TaskCreatedCard` — before anything is committed. This is a workbench, not a chatbot:
there is no free-form conversation UI anywhere in this app.

This frontend is an **AG-UI protocol client** (via `@ag-ui/client`'s `HttpAgent`) and an
**A2UI protocol renderer host** (via the official `@a2ui/react` + `@a2ui/web_core`
packages, spec v0.9). The backend
([`agentic-dispute-workbench-platform`](../agentic-dispute-workbench-platform), Java/Spring)
does not exist yet; this repo is fully buildable, runnable, and demoable standalone via a
scripted mock mode, and the wire contract documented below is what that backend must
implement when it lands.

## Running in mock mode

Mock mode is the default and needs no backend.

```bash
npm install
npm run dev
```

Open the printed local URL, click **Review Dispute**, and the app replays the canonical
demo scenario: a live progress stream from the Orchestrator, Case Review Agent, and
Policy Agent, ending in a decision view. Click **Create Evidence Request Task** to see the
approval gate, then **Approve Task Creation** to see the task get created.

## Pointing at a real backend

Copy `.env.example` to `.env` and set:

```
VITE_MOCK=false
VITE_ORCHESTRATOR_URL=http://localhost:8080/agui
```

No code changes are required — `src/agui/client.ts` selects between the mock agent and a
real `HttpAgent` pointed at `VITE_ORCHESTRATOR_URL` based on `VITE_MOCK` alone.

## Wire contract

Full detail lives in
[`docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md`](docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md).
Summary:

- **AG-UI SSE stream** from `VITE_ORCHESTRATOR_URL`. Standard `RUN_STARTED` / `RUN_FINISHED`
  / `RUN_ERROR` / `STATE_SNAPSHOT` / `STATE_DELTA` events, plus `CUSTOM` events for two
  application-specific payloads:
  - **Progress lines** — `{"type":"CUSTOM","name":"progress","value":{"source":"case-review","text":"..."}}`,
    `source` one of `"orchestrator" | "case-review" | "policy"`. Carried as `CUSTOM`
    rather than `TEXT_MESSAGE_*` because typed `ag-ui-core` classes on the Java side have
    no passthrough-field mechanism; `CUSTOM.value` is untyped by design.
  - **A2UI payloads** — `{"type":"CUSTOM","name":"a2ui","value":<A2uiMessage>}`, where
    `value` is a real v0.9 `createSurface` / `updateComponents` / `updateDataModel` /
    `deleteSurface` message.
- **Session continuity** — one case session spans at least three AG-UI runs (review,
  preview, approval — plus an alternate cancel run). The client reuses one `threadId` for
  every run in a session and never calls `deleteSurface` between them; pending-approval
  state is owned server-side, keyed by `(threadId, surfaceId)`.
- **`createSurface`** is sent once per session; the client ignores a duplicate for an
  existing `surfaceId` rather than recreating it.
- **Client actions** (button clicks) are sent back by starting a **new** AG-UI run on the
  same `threadId` with `forwardedProps: { a2uiAction: <A2uiClientAction> } }`, since AG-UI
  SSE is server→client only.
- **`evidenceReadiness`** is two independent channels — AG-UI state (drives the status
  chip) and an A2UI `DecisionCard` prop (`updateComponents`) — both must be updated by the
  backend; they are not derived from each other.

## Catalog components

Closed catalog (catalog id `https://dispute-workbench.internal/catalogs/v1.json`); any
other `component` type is rendered as a safe fallback box with the raw JSON, never a
crash.

| Component           | Props                                                                                                                                          | Notes                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DecisionCard`      | `status`, `disputeType`, `evidenceReadiness`, `recommendedAction` (all dynamic strings); `checklistId`, `actionsId` (optional component ids)   | Always the surface root; nests `EvidenceChecklist`/`NextActions` via A2UI's `buildChild` composition — see design doc §4.1 addendum.                     |
| `EvidenceChecklist` | `items: { label: string, present: boolean }[]`                                                                                                 |                                                                                                                                                          |
| `NextActions`       | `actions: { id: string, label: string }[]`                                                                                                     | Each button dispatches an A2UI action named after the item's `id`.                                                                                       |
| `ApprovalPreview`   | `caseId`, `newCaseStatus`, `actionAfterApproval` (dynamic strings); `missingItems: string[]`; `onApprove`, `onEdit`, `onCancel` (A2UI actions) | The human-approval gate — visually distinguished, "nothing written yet." Cancel dispatches a real action (a cancel run), it does not revert client-side. |
| `TaskCreatedCard`   | `taskId`, `caseStatus`, `auditEntry`, `nextOwner` (all dynamic strings)                                                                        | Terminal success state.                                                                                                                                  |

**A2UI spec version:** pinned to **v0.9** (spec evolving) — `@a2ui/react@0.10.1` /
`@a2ui/web_core@0.10.4`.

## Development

```bash
npm run dev         # start the dev server (mock mode by default)
npm run build        # typecheck + production build
npm run test          # run the test suite once
npm run test:watch  # watch mode
npm run lint          # ESLint
npm run format        # Prettier, write mode
npm run typecheck    # tsc -b --noEmit
```
