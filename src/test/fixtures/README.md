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
