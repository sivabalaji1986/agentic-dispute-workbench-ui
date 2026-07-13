# Agentic Dispute Workbench UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React/TypeScript frontend for the bank's Dispute Resolution Workbench — an AG-UI client and A2UI renderer host with a scripted mock mode, per `docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md`.

**Architecture:** Vite + React 19 + TypeScript strict, Tailwind v4. `@ag-ui/client`'s `HttpAgent` (or a structurally-compatible `MockAgent`) drives a subscriber that both updates a Zustand store (progress lines, connection status, evidence readiness) and feeds A2UI `CUSTOM` events into an `@a2ui/web_core` `MessageProcessor` backed by our own 5-component (+1 fallback) catalog, rendered via `@a2ui/react`'s `A2uiSurface`. Three panels (`CaseIntakePanel`, `LiveProgressPanel`, `DecisionPanel`) read the store and processor.

**Tech Stack:** React 19.2.7, TypeScript 5.9.3, Vite 8.1.4, Tailwind CSS 4.3.2, Zustand 5.0.14, Zod 3.25.76, `@ag-ui/client`/`@ag-ui/core` 0.0.57, `@a2ui/react` 0.10.1, `@a2ui/web_core` 0.10.4, `fast-json-patch` 3.1.1, Vitest 4.1.10 + React Testing Library 16.3.2.

## Global Constraints

- All dependency versions below are **pinned exact** (no `^`/`~`) in `package.json`, per the spec.
- `zod` MUST be `3.25.76` (v3 line) — `@a2ui/react`'s peer dependency requires `zod: ^3.25.76`; zod v4 breaks its `ComponentApi`/`Catalog` generics.
- `react`/`react-dom` MUST be `19.2.7` — `@a2ui/react`'s peer dependency is `^19.2.7` (not just "18+" as loosely stated in the original brief; this is a hard requirement of the official A2UI renderer we're using).
- `typescript` is pinned to `5.9.3`, not the latest `7.0.2` — `@typescript-eslint/parser@8.63.0`'s peer range is `>=4.8.4 <6.1.0`, and no stable typescript-eslint release supports TS 7 yet.
- No `localStorage`/`sessionStorage` — all state in memory (Zustand + `MessageProcessor`).
- No components beyond the five catalog components (`DecisionCard`, `EvidenceChecklist`, `NextActions`, `ApprovalPreview`, `TaskCreatedCard`) plus the internal `UnknownComponentFallback` safety net.
- No decision logic (readiness calculation, missing-evidence derivation) in the frontend.
- `VITE_MOCK` defaults to mock mode when unset (`import.meta.env.VITE_MOCK !== 'false'`); `VITE_ORCHESTRATOR_URL` defaults to `http://localhost:8080/agui`.
- Node engines: `^20.19.0 || >=22.12.0` (required by Vite 8).
- Catalog id: `https://dispute-workbench.internal/catalogs/v1.json`.
- Agent-source values: `"orchestrator" | "case-review" | "policy"`.
- Progress lines and A2UI payloads both ride AG-UI `CUSTOM` events (`name: "progress"` / `name: "a2ui"`) — see design doc §3.1/§3.2. Do not reintroduce a `source` field on `TEXT_MESSAGE_*` events.
- All wire-format code must match the verified real A2UI v0.9 schemas and `@ag-ui/core` event shapes documented in the design doc — not invented/"plausible" JSON.

---

## Task 1: Project scaffold

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`
- Create: `.gitignore`
- Create: `.env.example`

**Interfaces:**

- Produces: an installable, buildable Vite + React 19 + TS strict project. `npm run build`, `npm run dev`, `npm run test`, `npm run lint`, `npm run typecheck` scripts exist (test/lint will only have real work to check starting Task 2/3).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "agentic-dispute-workbench-ui",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "@a2ui/react": "0.10.1",
    "@a2ui/web_core": "0.10.4",
    "@ag-ui/client": "0.0.57",
    "@ag-ui/core": "0.0.57",
    "fast-json-patch": "3.1.1",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "zod": "3.25.76",
    "zustand": "5.0.14"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@tailwindcss/vite": "4.3.2",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/node": "22.20.1",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@typescript-eslint/eslint-plugin": "8.63.0",
    "@typescript-eslint/parser": "8.63.0",
    "@vitejs/plugin-react": "6.0.3",
    "eslint": "10.7.0",
    "eslint-plugin-react-hooks": "7.1.1",
    "eslint-plugin-react-refresh": "0.5.3",
    "jsdom": "29.1.1",
    "prettier": "3.9.5",
    "tailwindcss": "4.3.2",
    "typescript": "5.9.3",
    "vite": "8.1.4",
    "vitest": "4.1.10"
  },
  "engines": {
    "node": "^20.19.0 || >=22.12.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Dispute Resolution Workbench</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `src/index.css`**

```css
@import 'tailwindcss';
```

- [ ] **Step 8: Create `src/App.tsx` (placeholder — replaced fully in Task 13)**

```tsx
export default function App() {
  return (
    <main className="flex h-screen items-center justify-center bg-slate-50 text-slate-900">
      <h1 className="text-xl font-semibold">Dispute Resolution Workbench</h1>
    </main>
  );
}
```

- [ ] **Step 9: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 10: Create `.gitignore`**

```
node_modules
dist
dist-ssr
*.local
.env
.env.*.local
*.tsbuildinfo
```

- [ ] **Step 11: Create `.env.example`**

```
VITE_MOCK=true
VITE_ORCHESTRATOR_URL=http://localhost:8080/agui
```

- [ ] **Step 12: Install and verify the build**

Run: `npm install`
Expected: installs without peer-dependency errors (React 19.2.7 and zod 3.25.76 satisfy `@a2ui/react`'s peer requirements).

Run: `npm run build`
Expected: succeeds, producing a `dist/` directory with no TypeScript errors.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html src/main.tsx src/App.tsx src/index.css .gitignore .env.example
git commit -m "Scaffold Vite + React 19 + TypeScript strict + Tailwind v4 project"
```

---

## Task 2: Lint and format tooling

**Files:**

- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`

**Interfaces:**

- Produces: `npm run lint` and `npm run format:check` as clean, working commands for every later task.

- [ ] **Step 1: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // TypeScript resolves global identifiers (document, window, ...) itself;
      // no-undef produces false positives without a globals list and typescript-eslint's
      // own guidance is to turn it off for TS files rather than adding a globals package.
      'no-undef': 'off',
    },
  },
];
```

- [ ] **Step 2: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
dist
node_modules
```

- [ ] **Step 4: Format and lint the existing scaffold**

Run: `npm run format`
Expected: reformats any files that don't match Prettier's style (exits 0).

Run: `npm run lint`
Expected: `0 errors, 0 warnings` (or only the expected `react-refresh` warning categories, none present yet since `App.tsx` only default-exports a component).

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js .prettierrc.json .prettierignore src/App.tsx src/main.tsx
git commit -m "Add ESLint flat config and Prettier formatting"
```

---

## Task 3: AG-UI/A2UI package smoke test

**Files:**

- Create: `src/test/setup.ts`
- Create: `src/test/smoke.test.ts`

**Interfaces:**

- Produces: confirmation that `@ag-ui/client`, `@ag-ui/core`, `@a2ui/web_core/v0_9`, and `@a2ui/react/v0_9` all resolve correctly under Vite/Vitest's ESM + subpath-export resolution, before any real feature code is built on top.

- [ ] **Step 1: Create `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Write the smoke test**

```ts
// src/test/smoke.test.ts
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
```

- [ ] **Step 3: Run the test and verify it passes**

Run: `npm run test`
Expected: `2 passed`. If module resolution fails here, it means a package/subpath-export mismatch — fix the import path or version pin before proceeding to any later task.

- [ ] **Step 4: Commit**

```bash
git add src/test/setup.ts src/test/smoke.test.ts
git commit -m "Add AG-UI/A2UI package resolution smoke test"
```

---

## Task 4: AG-UI event contract types

**Files:**

- Create: `src/agui/events.ts`
- Test: `src/agui/events.test.ts`

**Interfaces:**

- Produces: `AgentSource` type, `ProgressEventValue` interface, `isProgressCustomEvent()`, `isA2uiCustomEvent()` — used by Task 10 (bridge) and Task 11 (mock).

- [ ] **Step 1: Write the failing test**

```ts
// src/agui/events.test.ts
import { describe, expect, it } from 'vitest';
import { EventType, type CustomEvent } from '@ag-ui/client';
import { isA2uiCustomEvent, isProgressCustomEvent } from './events';

function customEvent(name: string, value: unknown): CustomEvent {
  return { type: EventType.CUSTOM, name, value } as CustomEvent;
}

describe('progress/a2ui CUSTOM event discrimination', () => {
  it('identifies a progress event by name', () => {
    const event = customEvent('progress', { source: 'orchestrator', text: 'hi' });
    expect(isProgressCustomEvent(event)).toBe(true);
    expect(isA2uiCustomEvent(event)).toBe(false);
  });

  it('identifies an a2ui event by name', () => {
    const event = customEvent('a2ui', {
      version: 'v0.9',
      updateComponents: { surfaceId: 's', components: [] },
    });
    expect(isA2uiCustomEvent(event)).toBe(true);
    expect(isProgressCustomEvent(event)).toBe(false);
  });

  it('does not misclassify an unrelated CUSTOM event', () => {
    const event = customEvent('something-else', {});
    expect(isProgressCustomEvent(event)).toBe(false);
    expect(isA2uiCustomEvent(event)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/agui/events.test.ts`
Expected: FAIL — `Cannot find module './events'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/agui/events.ts
import type { CustomEvent as AguiCustomEvent } from '@ag-ui/client';
import type { A2uiMessage } from '@a2ui/web_core/v0_9';

export type AgentSource = 'orchestrator' | 'case-review' | 'policy';

export interface ProgressEventValue {
  source: AgentSource;
  text: string;
}

export function isProgressCustomEvent(
  event: AguiCustomEvent,
): event is AguiCustomEvent & { value: ProgressEventValue } {
  return event.name === 'progress';
}

export function isA2uiCustomEvent(
  event: AguiCustomEvent,
): event is AguiCustomEvent & { value: A2uiMessage } {
  return event.name === 'a2ui';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/agui/events.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/agui/events.ts src/agui/events.test.ts
git commit -m "Add AG-UI CUSTOM event discrimination for progress/a2ui payloads"
```

---

## Task 5: A2UI catalog foundations

**Files:**

- Create: `src/components/catalog/types.ts`
- Create: `src/components/catalog/schemas.ts`
- Create: `src/components/catalog/testUtils.tsx`
- Create: `src/components/catalog/UnknownComponentFallback.tsx`
- Test: `src/components/catalog/UnknownComponentFallback.test.tsx`

**Interfaces:**

- Consumes: nothing outside `@a2ui/react/v0_9` and `@a2ui/web_core/v0_9`.
- Produces: `A2uiComponentJson` type; `DecisionCardApi`, `EvidenceChecklistApi`, `NextActionsApi`, `ApprovalPreviewApi`, `TaskCreatedCardApi`, `UnknownComponentFallbackApi` (all `{name, schema}` `ComponentApi` objects); `renderA2uiComponents(catalogComponents, components, options?)` test helper; `UnknownComponentFallback` (a `ReactComponentImplementation`). Tasks 6–8 consume all of these.

- [ ] **Step 1: Create `src/components/catalog/types.ts`**

```ts
/** The flat, JSON-serializable shape of one entry in an A2UI `updateComponents.components` array. */
export type A2uiComponentJson = { id: string; component: string; [key: string]: unknown };
```

- [ ] **Step 2: Create `src/components/catalog/schemas.ts`**

```ts
import { z } from 'zod';
import { CommonSchemas } from '@a2ui/web_core/v0_9';

export const DecisionCardApi = {
  name: 'DecisionCard',
  schema: z.object({
    status: CommonSchemas.DynamicString,
    disputeType: CommonSchemas.DynamicString,
    evidenceReadiness: CommonSchemas.DynamicString,
    recommendedAction: CommonSchemas.DynamicString,
    // Composition plumbing (design doc §4.1 addendum): DecisionCard is always
    // the surface root, and nests EvidenceChecklist/NextActions via A2UI's own
    // buildChild mechanism rather than a new layout component in the catalog.
    checklistId: z.string().optional(),
    actionsId: z.string().optional(),
  }),
};

export const EvidenceItemSchema = z.object({
  label: z.string(),
  present: z.boolean(),
});

export const EvidenceChecklistApi = {
  name: 'EvidenceChecklist',
  schema: z.object({
    items: z.array(EvidenceItemSchema),
  }),
};

export const NextActionItemSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export const NextActionsApi = {
  name: 'NextActions',
  schema: z.object({
    actions: z.array(NextActionItemSchema),
  }),
};

export const ApprovalPreviewApi = {
  name: 'ApprovalPreview',
  schema: z.object({
    caseId: CommonSchemas.DynamicString,
    newCaseStatus: CommonSchemas.DynamicString,
    missingItems: z.array(z.string()),
    actionAfterApproval: CommonSchemas.DynamicString,
    onApprove: CommonSchemas.Action,
    onEdit: CommonSchemas.Action,
    onCancel: CommonSchemas.Action,
  }),
};

export const TaskCreatedCardApi = {
  name: 'TaskCreatedCard',
  schema: z.object({
    taskId: CommonSchemas.DynamicString,
    caseStatus: CommonSchemas.DynamicString,
    auditEntry: CommonSchemas.DynamicString,
    nextOwner: CommonSchemas.DynamicString,
  }),
};

export const UnknownComponentFallbackApi = {
  name: 'UnknownComponentFallback',
  schema: z.object({
    originalType: z.string(),
    raw: z.string(),
  }),
};
```

- [ ] **Step 3: Create the test helper `src/components/catalog/testUtils.tsx`**

This renders through the _real_ A2UI pipeline (`Catalog` + `MessageProcessor` + `A2uiSurface`), not by calling components directly, so tests exercise the same binder/dispatch path production code uses.

```tsx
import { render } from '@testing-library/react';
import { Catalog, MessageProcessor, type ActionListener } from '@a2ui/web_core/v0_9';
import type { A2uiMessage } from '@a2ui/web_core/v0_9';
import { A2uiSurface, type ReactComponentImplementation } from '@a2ui/react/v0_9';
import type { A2uiComponentJson } from './types';

let surfaceCounter = 0;

/**
 * Renders a component tree through the real A2UI pipeline. `components[0].id`
 * must be `'root'` — `A2uiSurface` always renders from the id `'root'`.
 */
export function renderA2uiComponents(
  catalogComponents: ReactComponentImplementation[],
  components: A2uiComponentJson[],
  options: { dataModel?: Record<string, unknown>; onAction?: ActionListener } = {},
) {
  const surfaceId = `test-surface-${++surfaceCounter}`;
  const catalog = new Catalog<ReactComponentImplementation>(
    'https://dispute-workbench.internal/catalogs/test.json',
    catalogComponents,
  );
  const processor = new MessageProcessor<ReactComponentImplementation>([catalog], options.onAction);

  const messages: A2uiMessage[] = [
    { version: 'v0.9', createSurface: { surfaceId, catalogId: catalog.id } },
    {
      version: 'v0.9',
      updateComponents: { surfaceId, components },
    } as A2uiMessage,
  ];
  if (options.dataModel) {
    messages.push({
      version: 'v0.9',
      updateDataModel: { surfaceId, value: options.dataModel },
    } as A2uiMessage);
  }

  processor.processMessages(messages);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) {
    throw new Error('Surface was not created');
  }

  return render(<A2uiSurface surface={surface} />);
}
```

- [ ] **Step 4: Write the failing test for `UnknownComponentFallback`**

```tsx
// src/components/catalog/UnknownComponentFallback.test.tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { UnknownComponentFallback } from './UnknownComponentFallback';
import { renderA2uiComponents } from './testUtils';

describe('UnknownComponentFallback', () => {
  it('renders unknown component types as a safe fallback with raw JSON, never crashing', () => {
    renderA2uiComponents(
      [UnknownComponentFallback],
      [
        {
          id: 'root',
          component: 'UnknownComponentFallback',
          originalType: 'SomeUnimaginedWidget',
          raw: JSON.stringify({ title: 'hello', nested: { a: 1 } }),
        },
      ],
    );

    expect(screen.getByText(/Unknown component: SomeUnimaginedWidget/)).toBeInTheDocument();
    expect(screen.getByText(/"title": "hello"/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm run test -- src/components/catalog/UnknownComponentFallback.test.tsx`
Expected: FAIL — `Cannot find module './UnknownComponentFallback'`.

- [ ] **Step 6: Implement `UnknownComponentFallback.tsx`**

```tsx
import { createBinderlessComponentImplementation } from '@a2ui/react/v0_9';
import { UnknownComponentFallbackApi } from './schemas';

export const UnknownComponentFallback = createBinderlessComponentImplementation(
  UnknownComponentFallbackApi,
  ({ context }) => {
    const { originalType, raw } = context.componentModel.properties as {
      originalType: string;
      raw: string;
    };
    let pretty = raw;
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      // raw wasn't valid JSON; fall back to showing it verbatim.
    }
    return (
      <div className="rounded border-2 border-dashed border-amber-500 bg-amber-50 p-3 text-xs text-amber-900">
        <p className="font-semibold">Unknown component: {originalType}</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{pretty}</pre>
      </div>
    );
  },
);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test -- src/components/catalog/UnknownComponentFallback.test.tsx`
Expected: `1 passed`.

- [ ] **Step 8: Commit**

```bash
git add src/components/catalog/types.ts src/components/catalog/schemas.ts src/components/catalog/testUtils.tsx src/components/catalog/UnknownComponentFallback.tsx src/components/catalog/UnknownComponentFallback.test.tsx
git commit -m "Add A2UI catalog foundations: schemas, test harness, unknown-component fallback"
```

---

## Task 6: DecisionCard and EvidenceChecklist components

**Files:**

- Create: `src/components/catalog/DecisionCard.tsx`
- Create: `src/components/catalog/EvidenceChecklist.tsx`
- Test: `src/components/catalog/DecisionCard.test.tsx`
- Test: `src/components/catalog/EvidenceChecklist.test.tsx`

**Interfaces:**

- Consumes: `DecisionCardApi`, `EvidenceChecklistApi` (Task 5), `renderA2uiComponents` (Task 5).
- Produces: `DecisionCard`, `EvidenceChecklist` (`ReactComponentImplementation`s) — consumed by Task 7's composition test and Task 8's catalog assembly.

- [ ] **Step 1: Write the failing test for `DecisionCard`**

```tsx
// src/components/catalog/DecisionCard.test.tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { DecisionCard } from './DecisionCard';
import { renderA2uiComponents } from './testUtils';

describe('DecisionCard', () => {
  it('renders status, dispute type, evidence readiness, and recommended action', () => {
    renderA2uiComponents(
      [DecisionCard],
      [
        {
          id: 'root',
          component: 'DecisionCard',
          status: 'Needs More Evidence',
          disputeType: 'Goods Not Received',
          evidenceReadiness: '2 of 4 required items present',
          recommendedAction: 'Create evidence request task',
        },
      ],
    );

    expect(screen.getByText('Needs More Evidence')).toBeInTheDocument();
    expect(screen.getByText('Goods Not Received')).toBeInTheDocument();
    expect(screen.getByText('2 of 4 required items present')).toBeInTheDocument();
    expect(screen.getByText(/Create evidence request task/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/catalog/DecisionCard.test.tsx`
Expected: FAIL — `Cannot find module './DecisionCard'`.

- [ ] **Step 3: Implement `DecisionCard.tsx`**

```tsx
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { DecisionCardApi } from './schemas';

export const DecisionCard = createComponentImplementation(
  DecisionCardApi,
  ({ props, buildChild }) => {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {props.disputeType}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">{props.status}</h3>
        <p className="mt-2 text-sm text-slate-600">{props.evidenceReadiness}</p>
        <p className="mt-3 text-sm font-medium text-blue-700">
          Recommended: {props.recommendedAction}
        </p>
        {props.checklistId && <div className="mt-4">{buildChild(props.checklistId)}</div>}
        {props.actionsId && <div className="mt-4">{buildChild(props.actionsId)}</div>}
      </div>
    );
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/catalog/DecisionCard.test.tsx`
Expected: `1 passed`.

- [ ] **Step 5: Write the failing test for `EvidenceChecklist`**

```tsx
// src/components/catalog/EvidenceChecklist.test.tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { EvidenceChecklist } from './EvidenceChecklist';
import { renderA2uiComponents } from './testUtils';

describe('EvidenceChecklist', () => {
  it('renders each item with its checked/unchecked state', () => {
    renderA2uiComponents(
      [EvidenceChecklist],
      [
        {
          id: 'root',
          component: 'EvidenceChecklist',
          items: [
            { label: 'Transaction record', present: true },
            { label: 'Customer declaration', present: false },
          ],
        },
      ],
    );

    const present = screen.getByText('Transaction record');
    const missing = screen.getByText('Customer declaration');
    expect(present).toBeInTheDocument();
    expect(missing).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -- src/components/catalog/EvidenceChecklist.test.tsx`
Expected: FAIL — `Cannot find module './EvidenceChecklist'`.

- [ ] **Step 7: Implement `EvidenceChecklist.tsx`**

```tsx
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { EvidenceChecklistApi } from './schemas';

export const EvidenceChecklist = createComponentImplementation(
  EvidenceChecklistApi,
  ({ props }) => {
    return (
      <ul className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {props.items.map((item, index) => (
          <li key={index} className="flex items-center gap-2 py-1 text-sm">
            <span
              aria-hidden
              className={
                item.present
                  ? 'inline-flex h-4 w-4 items-center justify-center rounded-sm bg-emerald-600 text-xs text-white'
                  : 'inline-flex h-4 w-4 items-center justify-center rounded-sm border border-slate-300 text-xs'
              }
            >
              {item.present ? '✓' : ''}
            </span>
            <span className={item.present ? 'text-slate-900' : 'text-slate-500'}>{item.label}</span>
          </li>
        ))}
      </ul>
    );
  },
);
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test -- src/components/catalog/EvidenceChecklist.test.tsx`
Expected: `1 passed`.

- [ ] **Step 9: Commit**

```bash
git add src/components/catalog/DecisionCard.tsx src/components/catalog/DecisionCard.test.tsx src/components/catalog/EvidenceChecklist.tsx src/components/catalog/EvidenceChecklist.test.tsx
git commit -m "Add DecisionCard and EvidenceChecklist catalog components"
```

---

## Task 7: NextActions, ApprovalPreview, TaskCreatedCard, and composition

**Files:**

- Create: `src/components/catalog/NextActions.tsx`
- Create: `src/components/catalog/ApprovalPreview.tsx`
- Create: `src/components/catalog/TaskCreatedCard.tsx`
- Test: `src/components/catalog/NextActions.test.tsx`
- Test: `src/components/catalog/ApprovalPreview.test.tsx`
- Test: `src/components/catalog/TaskCreatedCard.test.tsx`
- Test: `src/components/catalog/composition.test.tsx`

**Interfaces:**

- Consumes: `NextActionsApi`, `ApprovalPreviewApi`, `TaskCreatedCardApi` (Task 5), `renderA2uiComponents` (Task 5), `DecisionCard`/`EvidenceChecklist` (Task 6).
- Produces: `NextActions`, `ApprovalPreview`, `TaskCreatedCard` — consumed by Task 8's catalog assembly.

- [ ] **Step 1: Write the failing test for `NextActions`**

```tsx
// src/components/catalog/NextActions.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextActions } from './NextActions';
import { renderA2uiComponents } from './testUtils';

describe('NextActions', () => {
  it('renders one button per action and dispatches the action id as the event name on click', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();

    renderA2uiComponents(
      [NextActions],
      [
        {
          id: 'root',
          component: 'NextActions',
          actions: [
            { id: 'create_evidence_request_task', label: 'Create Evidence Request Task' },
            { id: 'escalate_to_reviewer', label: 'Escalate to Reviewer' },
          ],
        },
      ],
      { onAction },
    );

    expect(screen.getByRole('button', { name: 'Escalate to Reviewer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create Evidence Request Task' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'create_evidence_request_task', sourceComponentId: 'root' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/catalog/NextActions.test.tsx`
Expected: FAIL — `Cannot find module './NextActions'`.

- [ ] **Step 3: Implement `NextActions.tsx`**

This uses `createBinderlessComponentImplementation` and dispatches manually via `context.dispatchAction`, since the actions array is dynamic-length (not a fixed set of top-level `Action` props like `ApprovalPreview`'s).

```tsx
import { createBinderlessComponentImplementation } from '@a2ui/react/v0_9';
import { NextActionsApi } from './schemas';

interface NextActionItem {
  id: string;
  label: string;
}

export const NextActions = createBinderlessComponentImplementation(
  NextActionsApi,
  ({ context }) => {
    const { actions } = context.componentModel.properties as { actions: NextActionItem[] };

    return (
      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => {
              void context.dispatchAction({ event: { name: action.id, context: {} } });
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    );
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/catalog/NextActions.test.tsx`
Expected: `1 passed`.

- [ ] **Step 5: Write the failing test for `ApprovalPreview`**

```tsx
// src/components/catalog/ApprovalPreview.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalPreview } from './ApprovalPreview';
import { renderA2uiComponents } from './testUtils';

describe('ApprovalPreview', () => {
  it('renders case details, missing items, and dispatches approve/edit/cancel actions', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();

    renderA2uiComponents(
      [ApprovalPreview],
      [
        {
          id: 'root',
          component: 'ApprovalPreview',
          caseId: 'D-10291',
          newCaseStatus: 'Pending Evidence',
          missingItems: ['Missing customer declaration', 'Missing delivery / non-delivery proof'],
          actionAfterApproval: 'Create task in case system and update case status.',
          onApprove: { event: { name: 'approve_task_creation', context: {} } },
          onEdit: { event: { name: 'edit_task_creation', context: {} } },
          onCancel: { event: { name: 'cancel_task_creation', context: {} } },
        },
      ],
      { onAction },
    );

    expect(screen.getByText('D-10291')).toBeInTheDocument();
    expect(screen.getByText('Pending Evidence')).toBeInTheDocument();
    expect(screen.getByText('Missing customer declaration')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve Task Creation' }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'approve_task_creation' }),
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cancel_task_creation' }),
    );
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -- src/components/catalog/ApprovalPreview.test.tsx`
Expected: FAIL — `Cannot find module './ApprovalPreview'`.

- [ ] **Step 7: Implement `ApprovalPreview.tsx`**

```tsx
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { ApprovalPreviewApi } from './schemas';

export const ApprovalPreview = createComponentImplementation(ApprovalPreviewApi, ({ props }) => {
  return (
    <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg">
          ⚠️
        </span>
        <h3 className="text-base font-semibold text-amber-900">
          Approval required — nothing written yet
        </h3>
      </div>
      <dl className="mt-3 space-y-1 text-sm text-slate-700">
        <div className="flex gap-2">
          <dt className="font-medium">Case</dt>
          <dd>{props.caseId}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">New status</dt>
          <dd>{props.newCaseStatus}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">On approval</dt>
          <dd>{props.actionAfterApproval}</dd>
        </div>
      </dl>
      {props.missingItems.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
          {props.missingItems.map((item: string, index: number) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          onClick={props.onApprove}
        >
          Approve Task Creation
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={props.onEdit}
        >
          Edit
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test -- src/components/catalog/ApprovalPreview.test.tsx`
Expected: `1 passed`.

- [ ] **Step 9: Write the failing test for `TaskCreatedCard`**

```tsx
// src/components/catalog/TaskCreatedCard.test.tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { TaskCreatedCard } from './TaskCreatedCard';
import { renderA2uiComponents } from './testUtils';

describe('TaskCreatedCard', () => {
  it('renders taskId, caseStatus, auditEntry, and nextOwner', () => {
    renderA2uiComponents(
      [TaskCreatedCard],
      [
        {
          id: 'root',
          component: 'TaskCreatedCard',
          taskId: 'EVID-88421',
          caseStatus: 'Pending Evidence',
          auditEntry: 'Created',
          nextOwner: 'Dispute Operations Queue',
        },
      ],
    );

    expect(screen.getByText('EVID-88421')).toBeInTheDocument();
    expect(screen.getByText('Pending Evidence')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Dispute Operations Queue')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm run test -- src/components/catalog/TaskCreatedCard.test.tsx`
Expected: FAIL — `Cannot find module './TaskCreatedCard'`.

- [ ] **Step 11: Implement `TaskCreatedCard.tsx`**

```tsx
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { TaskCreatedCardApi } from './schemas';

export const TaskCreatedCard = createComponentImplementation(TaskCreatedCardApi, ({ props }) => {
  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg">
          ✅
        </span>
        <h3 className="text-base font-semibold text-emerald-900">Task created</h3>
      </div>
      <dl className="mt-3 space-y-1 text-sm text-slate-700">
        <div className="flex gap-2">
          <dt className="font-medium">Task ID</dt>
          <dd>{props.taskId}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Case status</dt>
          <dd>{props.caseStatus}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Audit entry</dt>
          <dd>{props.auditEntry}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Next owner</dt>
          <dd>{props.nextOwner}</dd>
        </div>
      </dl>
    </div>
  );
});
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm run test -- src/components/catalog/TaskCreatedCard.test.tsx`
Expected: `1 passed`.

- [ ] **Step 13: Write the composition test (DecisionCard + EvidenceChecklist + NextActions together)**

```tsx
// src/components/catalog/composition.test.tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { DecisionCard } from './DecisionCard';
import { EvidenceChecklist } from './EvidenceChecklist';
import { NextActions } from './NextActions';
import { renderA2uiComponents } from './testUtils';

describe('DecisionCard composition', () => {
  it('nests EvidenceChecklist and NextActions via checklistId/actionsId buildChild', () => {
    renderA2uiComponents(
      [DecisionCard, EvidenceChecklist, NextActions],
      [
        {
          id: 'root',
          component: 'DecisionCard',
          status: 'Needs More Evidence',
          disputeType: 'Goods Not Received',
          evidenceReadiness: '2 of 4 required items present',
          recommendedAction: 'Create evidence request task',
          checklistId: 'checklist-1',
          actionsId: 'actions-1',
        },
        {
          id: 'checklist-1',
          component: 'EvidenceChecklist',
          items: [{ label: 'Transaction record', present: true }],
        },
        {
          id: 'actions-1',
          component: 'NextActions',
          actions: [{ id: 'create_evidence_request_task', label: 'Create Evidence Request Task' }],
        },
      ],
    );

    expect(screen.getByText('Needs More Evidence')).toBeInTheDocument();
    expect(screen.getByText('Transaction record')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Evidence Request Task' }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 14: Run all catalog tests to verify they pass**

Run: `npm run test -- src/components/catalog`
Expected: all catalog test files pass, including `composition.test.tsx`.

- [ ] **Step 15: Commit**

```bash
git add src/components/catalog/NextActions.tsx src/components/catalog/NextActions.test.tsx src/components/catalog/ApprovalPreview.tsx src/components/catalog/ApprovalPreview.test.tsx src/components/catalog/TaskCreatedCard.tsx src/components/catalog/TaskCreatedCard.test.tsx src/components/catalog/composition.test.tsx
git commit -m "Add NextActions, ApprovalPreview, TaskCreatedCard, and composition test"
```

---

## Task 8: Catalog assembly

**Files:**

- Create: `src/components/catalog/catalogInstance.ts`
- Test: `src/components/catalog/catalogInstance.test.ts`

**Interfaces:**

- Consumes: `DecisionCard`, `EvidenceChecklist`, `NextActions`, `ApprovalPreview`, `TaskCreatedCard`, `UnknownComponentFallback` (Tasks 5–7), `A2uiComponentJson` (Task 5).
- Produces: `disputeCatalog` (a `Catalog<ReactComponentImplementation>`), `DISPUTE_CATALOG_ID`, `KNOWN_COMPONENT_TYPES`, `preprocessUnknownComponents(components)` — consumed by Task 9 (store) and Task 10 (bridge).

- [ ] **Step 1: Write the failing test**

```ts
// src/components/catalog/catalogInstance.test.ts
import { describe, expect, it } from 'vitest';
import {
  disputeCatalog,
  KNOWN_COMPONENT_TYPES,
  preprocessUnknownComponents,
} from './catalogInstance';

describe('disputeCatalog', () => {
  it('registers exactly the five business components plus the fallback', () => {
    const names = Array.from(disputeCatalog.components.keys()).sort();
    expect(names).toEqual([...KNOWN_COMPONENT_TYPES, 'UnknownComponentFallback'].sort());
  });
});

describe('preprocessUnknownComponents', () => {
  it('passes through known component types unchanged', () => {
    const input = [{ id: 'root', component: 'DecisionCard', status: 'x' }];
    expect(preprocessUnknownComponents(input)).toEqual(input);
  });

  it('rewrites unknown component types into the fallback with raw JSON preserved', () => {
    const input = [{ id: 'root', component: 'MysteryWidget', foo: 'bar' }];
    const [result] = preprocessUnknownComponents(input);
    expect(result.component).toBe('UnknownComponentFallback');
    expect(result.originalType).toBe('MysteryWidget');
    expect(JSON.parse(result.raw as string)).toEqual(input[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/catalog/catalogInstance.test.ts`
Expected: FAIL — `Cannot find module './catalogInstance'`.

- [ ] **Step 3: Implement `catalogInstance.ts`**

```ts
import { Catalog } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import type { A2uiComponentJson } from './types';
import { DecisionCard } from './DecisionCard';
import { EvidenceChecklist } from './EvidenceChecklist';
import { NextActions } from './NextActions';
import { ApprovalPreview } from './ApprovalPreview';
import { TaskCreatedCard } from './TaskCreatedCard';
import { UnknownComponentFallback } from './UnknownComponentFallback';

export const DISPUTE_CATALOG_ID = 'https://dispute-workbench.internal/catalogs/v1.json';

export const KNOWN_COMPONENT_TYPES = [
  'DecisionCard',
  'EvidenceChecklist',
  'NextActions',
  'ApprovalPreview',
  'TaskCreatedCard',
] as const;

export const disputeCatalog = new Catalog<ReactComponentImplementation>(DISPUTE_CATALOG_ID, [
  DecisionCard,
  EvidenceChecklist,
  NextActions,
  ApprovalPreview,
  TaskCreatedCard,
  UnknownComponentFallback,
]);

/**
 * Rewrites any component whose type isn't in the closed catalog into the
 * UnknownComponentFallback safety net, so an unrecognized A2UI payload never
 * crashes the renderer. See design doc §4.2.
 */
export function preprocessUnknownComponents(components: A2uiComponentJson[]): A2uiComponentJson[] {
  return components.map((component) => {
    if ((KNOWN_COMPONENT_TYPES as readonly string[]).includes(component.component)) {
      return component;
    }
    return {
      id: component.id,
      component: 'UnknownComponentFallback',
      originalType: component.component,
      raw: JSON.stringify(component),
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/catalog/catalogInstance.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/components/catalog/catalogInstance.ts src/components/catalog/catalogInstance.test.ts
git commit -m "Assemble the closed dispute-workbench A2UI catalog"
```

---

## Task 9: Zustand store

**Files:**

- Create: `src/state/workbenchStore.ts`
- Test: `src/state/workbenchStore.test.ts`

**Interfaces:**

- Consumes: `disputeCatalog` (Task 8), `AgentSource` (Task 4).
- Produces: `useWorkbenchStore` (Zustand hook/store) with state `{caseId, disputeText, threadId, runId, connectionStatus, progressLines, evidenceReadiness, processor}` and actions `startCase`, `setRunId`, `setConnectionStatus`, `appendProgressLine`, `setEvidenceReadiness`. Consumed by Tasks 10, 12, 13.

- [ ] **Step 1: Write the failing test**

```ts
// src/state/workbenchStore.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { useWorkbenchStore } from './workbenchStore';

describe('useWorkbenchStore', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      caseId: null,
      disputeText: '',
      threadId: null,
      runId: null,
      connectionStatus: 'idle',
      progressLines: [],
      evidenceReadiness: null,
    });
  });

  it('startCase sets case metadata and resets run-scoped state', () => {
    useWorkbenchStore
      .getState()
      .startCase({ caseId: 'D-10291', threadId: 't-1', disputeText: 'I paid...' });
    const state = useWorkbenchStore.getState();
    expect(state.caseId).toBe('D-10291');
    expect(state.threadId).toBe('t-1');
    expect(state.connectionStatus).toBe('connecting');
    expect(state.progressLines).toEqual([]);
  });

  it('appendProgressLine appends in call order with source and text preserved', () => {
    useWorkbenchStore.getState().appendProgressLine('orchestrator', 'Understanding dispute...');
    useWorkbenchStore
      .getState()
      .appendProgressLine('case-review', 'Checking transaction status...');
    const lines = useWorkbenchStore.getState().progressLines;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ source: 'orchestrator', text: 'Understanding dispute...' });
    expect(lines[1]).toMatchObject({
      source: 'case-review',
      text: 'Checking transaction status...',
    });
  });

  it('setEvidenceReadiness updates the status-chip value independently', () => {
    useWorkbenchStore.getState().setEvidenceReadiness('2 of 4 required items present');
    expect(useWorkbenchStore.getState().evidenceReadiness).toBe('2 of 4 required items present');
  });

  it('exposes a stable MessageProcessor instance built from the dispute catalog', () => {
    const processor = useWorkbenchStore.getState().processor;
    expect(processor).toBeDefined();
    expect(useWorkbenchStore.getState().processor).toBe(processor);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/state/workbenchStore.test.ts`
Expected: FAIL — `Cannot find module './workbenchStore'`.

- [ ] **Step 3: Implement `workbenchStore.ts`**

```ts
import { create } from 'zustand';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import type { AgentSource } from '../agui/events';
import { disputeCatalog } from '../components/catalog/catalogInstance';

export type ConnectionStatus = 'idle' | 'connecting' | 'streaming' | 'disconnected' | 'finished';

export interface ProgressLine {
  id: string;
  source: AgentSource;
  text: string;
  timestamp: number;
}

interface WorkbenchState {
  caseId: string | null;
  disputeText: string;
  threadId: string | null;
  runId: string | null;
  connectionStatus: ConnectionStatus;
  progressLines: ProgressLine[];
  evidenceReadiness: string | null;
  processor: MessageProcessor<ReactComponentImplementation>;
  startCase: (params: { caseId: string; threadId: string; disputeText: string }) => void;
  setRunId: (runId: string) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  appendProgressLine: (source: AgentSource, text: string) => void;
  setEvidenceReadiness: (value: string | null) => void;
}

let progressLineCounter = 0;

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  caseId: null,
  disputeText: '',
  threadId: null,
  runId: null,
  connectionStatus: 'idle',
  progressLines: [],
  evidenceReadiness: null,
  processor: new MessageProcessor<ReactComponentImplementation>([disputeCatalog]),

  startCase: ({ caseId, threadId, disputeText }) =>
    set({
      caseId,
      threadId,
      disputeText,
      runId: null,
      connectionStatus: 'connecting',
      progressLines: [],
      evidenceReadiness: null,
    }),

  setRunId: (runId) => set({ runId }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  appendProgressLine: (source, text) =>
    set((state) => ({
      progressLines: [
        ...state.progressLines,
        { id: `line-${++progressLineCounter}`, source, text, timestamp: Date.now() },
      ],
    })),

  setEvidenceReadiness: (value) => set({ evidenceReadiness: value }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/state/workbenchStore.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/state/workbenchStore.ts src/state/workbenchStore.test.ts
git commit -m "Add Zustand workbench store"
```

---

## Task 10: AG-UI bridge

**Files:**

- Create: `src/agui/bridge.ts`
- Test: `src/agui/bridge.test.ts`

**Interfaces:**

- Consumes: `isProgressCustomEvent`, `isA2uiCustomEvent` (Task 4), `useWorkbenchStore` (Task 9), `preprocessUnknownComponents` (Task 8).
- Produces: `workbenchAgentSubscriber` (an `AgentSubscriber`), `resetBridgeState()` — consumed by Task 11 (mock) and Task 12 (client).

- [ ] **Step 1: Write the failing test**

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
import { resetBridgeState, workbenchAgentSubscriber } from './bridge';
import { useWorkbenchStore } from '../state/workbenchStore';

function fakeParams<E>(event: E) {
  return { event, messages: [], state: {}, agent: {} as never, input: {} as never };
}

describe('workbenchAgentSubscriber', () => {
  beforeEach(() => {
    resetBridgeState();
    useWorkbenchStore.setState({
      caseId: 'D-10291',
      threadId: 't-1',
      runId: null,
      connectionStatus: 'idle',
      progressLines: [],
      evidenceReadiness: null,
    });
  });

  it('sets connection status and runId on RUN_STARTED', () => {
    const event: RunStartedEvent = { type: EventType.RUN_STARTED, threadId: 't-1', runId: 'run-1' };
    workbenchAgentSubscriber.onRunStartedEvent?.(fakeParams(event));
    expect(useWorkbenchStore.getState().connectionStatus).toBe('streaming');
    expect(useWorkbenchStore.getState().runId).toBe('run-1');
  });

  it('sets connection status to finished on RUN_FINISHED', () => {
    const event: RunFinishedEvent = {
      type: EventType.RUN_FINISHED,
      threadId: 't-1',
      runId: 'run-1',
    };
    workbenchAgentSubscriber.onRunFinishedEvent?.({
      ...fakeParams(event),
      outcome: 'success',
    } as never);
    expect(useWorkbenchStore.getState().connectionStatus).toBe('finished');
  });

  it('sets connection status to disconnected on RUN_ERROR', () => {
    const event: RunErrorEvent = { type: EventType.RUN_ERROR, message: 'boom' } as RunErrorEvent;
    workbenchAgentSubscriber.onRunErrorEvent?.(fakeParams(event));
    expect(useWorkbenchStore.getState().connectionStatus).toBe('disconnected');
  });

  it('appends a progress line from a CUSTOM/progress event', () => {
    const event: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'progress',
      value: { source: 'case-review', text: 'Checking transaction status...' },
    };
    workbenchAgentSubscriber.onCustomEvent?.(fakeParams(event));
    const lines = useWorkbenchStore.getState().progressLines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      source: 'case-review',
      text: 'Checking transaction status...',
    });
  });

  it('feeds a CUSTOM/a2ui event into the MessageProcessor', () => {
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
    const updateEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: 'a2ui',
      value: {
        version: 'v0.9',
        updateComponents: {
          surfaceId,
          components: [
            {
              id: 'root',
              component: 'TaskCreatedCard',
              taskId: 'EVID-1',
              caseStatus: 'x',
              auditEntry: 'y',
              nextOwner: 'z',
            },
          ],
        },
      },
    };
    workbenchAgentSubscriber.onCustomEvent?.(fakeParams(createEvent));
    workbenchAgentSubscriber.onCustomEvent?.(fakeParams(updateEvent));

    const processor = useWorkbenchStore.getState().processor;
    expect(processor.model.getSurface(surfaceId)).toBeDefined();
  });

  it('ignores a duplicate createSurface for an existing surfaceId instead of throwing', () => {
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
    workbenchAgentSubscriber.onCustomEvent?.(fakeParams(createEvent));
    expect(() => workbenchAgentSubscriber.onCustomEvent?.(fakeParams(createEvent))).not.toThrow();
  });

  it('applies STATE_SNAPSHOT then STATE_DELTA and syncs evidenceReadiness independently', () => {
    const snapshot: StateSnapshotEvent = {
      type: EventType.STATE_SNAPSHOT,
      snapshot: { evidenceReadiness: null },
    };
    const delta: StateDeltaEvent = {
      type: EventType.STATE_DELTA,
      delta: [
        { op: 'replace', path: '/evidenceReadiness', value: '2 of 4 required items present' },
      ],
    };
    workbenchAgentSubscriber.onStateSnapshotEvent?.(fakeParams(snapshot));
    workbenchAgentSubscriber.onStateDeltaEvent?.(fakeParams(delta));
    expect(useWorkbenchStore.getState().evidenceReadiness).toBe('2 of 4 required items present');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/agui/bridge.test.ts`
Expected: FAIL — `Cannot find module './bridge'`.

- [ ] **Step 3: Implement `bridge.ts`**

```ts
import { applyPatch, type Operation } from 'fast-json-patch';
import type { AgentSubscriber } from '@ag-ui/client';
import { isA2uiCustomEvent, isProgressCustomEvent } from './events';
import { useWorkbenchStore } from '../state/workbenchStore';
import { preprocessUnknownComponents } from '../components/catalog/catalogInstance';
import type { A2uiComponentJson } from '../components/catalog/types';

let stateDoc: Record<string, unknown> = {};

export function resetBridgeState(): void {
  stateDoc = {};
}

function syncEvidenceReadiness(): void {
  const value = stateDoc.evidenceReadiness;
  useWorkbenchStore.getState().setEvidenceReadiness(typeof value === 'string' ? value : null);
}

function applyA2uiMessage(message: { version: 'v0.9'; [key: string]: unknown }): void {
  const processor = useWorkbenchStore.getState().processor;

  if ('createSurface' in message) {
    const surfaceId = (message.createSurface as { surfaceId: string }).surfaceId;
    if (processor.model.getSurface(surfaceId)) {
      console.warn(`A2UI: ignoring duplicate createSurface for existing surface ${surfaceId}`);
      return;
    }
    processor.processMessages([message as never]);
    return;
  }

  if ('updateComponents' in message) {
    const payload = message.updateComponents as {
      surfaceId: string;
      components: A2uiComponentJson[];
    };
    processor.processMessages([
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: payload.surfaceId,
          components: preprocessUnknownComponents(payload.components),
        },
      } as never,
    ]);
    return;
  }

  processor.processMessages([message as never]);
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
    stateDoc = (event.snapshot as Record<string, unknown>) ?? {};
    syncEvidenceReadiness();
  },
  onStateDeltaEvent({ event }) {
    const result = applyPatch(stateDoc, event.delta as Operation[], true, false);
    stateDoc = result.newDocument;
    syncEvidenceReadiness();
  },
  onCustomEvent({ event }) {
    if (isProgressCustomEvent(event)) {
      useWorkbenchStore.getState().appendProgressLine(event.value.source, event.value.text);
      return;
    }
    if (isA2uiCustomEvent(event)) {
      applyA2uiMessage(event.value as { version: 'v0.9'; [key: string]: unknown });
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/agui/bridge.test.ts`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/agui/bridge.ts src/agui/bridge.test.ts
git commit -m "Add AG-UI to store/A2UI bridge with idempotent createSurface handling"
```

---

## Task 11: Mock demo script and mock agent

**Files:**

- Create: `src/mock/demoScript.ts`
- Create: `src/mock/mockAgent.ts`
- Test: `src/mock/demoScript.test.ts`
- Test: `src/mock/mockAgent.test.ts`

**Interfaces:**

- Consumes: `DISPUTE_CATALOG_ID` (Task 8), `AgentSource` (Task 4).
- Produces: `CASE_ID`, `THREAD_ID`, `SURFACE_ID`, `reviewRun`, `previewRun`, `approvalRun`, `cancelRun` (each a `DemoRun`); `MockAgent` class. Consumed by Task 12 (client).

- [ ] **Step 1: Write the failing structural test for `demoScript.ts`**

```ts
// src/mock/demoScript.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/mock/demoScript.test.ts`
Expected: FAIL — `Cannot find module './demoScript'`.

- [ ] **Step 3: Implement `demoScript.ts`**

```ts
import { EventType } from '@ag-ui/client';
import type { BaseEvent, CustomEvent } from '@ag-ui/client';
import type { AgentSource } from '../agui/events';
import { DISPUTE_CATALOG_ID } from '../components/catalog/catalogInstance';
import type { A2uiComponentJson } from '../components/catalog/types';

export interface ScriptedEvent {
  delayMs: number;
  event: BaseEvent;
}

export interface DemoRun {
  events: ScriptedEvent[];
}

export const CASE_ID = 'D-10291';
export const THREAD_ID = 'demo-thread-d-10291';
export const SURFACE_ID = `case-${CASE_ID}`;

function progress(source: AgentSource, text: string): CustomEvent {
  return { type: EventType.CUSTOM, name: 'progress', value: { source, text } };
}

function a2ui(message: { version: 'v0.9'; [key: string]: unknown }): CustomEvent {
  return { type: EventType.CUSTOM, name: 'a2ui', value: message };
}

const decisionViewComponents: A2uiComponentJson[] = [
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

const approvalPreviewComponents: A2uiComponentJson[] = [
  {
    id: 'root',
    component: 'ApprovalPreview',
    caseId: CASE_ID,
    newCaseStatus: 'Pending Evidence',
    missingItems: ['Missing customer declaration', 'Missing delivery / non-delivery proof'],
    actionAfterApproval: 'Create task in case system and update case status.',
    onApprove: { event: { name: 'approve_task_creation', context: {} } },
    onEdit: { event: { name: 'edit_task_creation', context: {} } },
    onCancel: { event: { name: 'cancel_task_creation', context: {} } },
  },
];

const taskCreatedComponents: A2uiComponentJson[] = [
  {
    id: 'root',
    component: 'TaskCreatedCard',
    taskId: 'EVID-88421',
    caseStatus: 'Pending Evidence',
    auditEntry: 'Created',
    nextOwner: 'Dispute Operations Queue',
  },
];

export const reviewRun: DemoRun = {
  events: [
    {
      delayMs: 0,
      event: { type: EventType.RUN_STARTED, threadId: THREAD_ID, runId: 'run-review' },
    },
    { delayMs: 400, event: progress('orchestrator', 'Understanding dispute...') },
    { delayMs: 400, event: progress('orchestrator', 'Dispute type detected: Goods Not Received') },
    { delayMs: 400, event: progress('orchestrator', 'Preparing specialist review...') },
    { delayMs: 400, event: progress('orchestrator', 'Calling Case Review Agent...') },
    { delayMs: 300, event: progress('orchestrator', 'Calling Policy Agent...') },
    { delayMs: 500, event: progress('case-review', 'Checking transaction status...') },
    { delayMs: 350, event: progress('policy', 'Searching policy document...') },
    { delayMs: 500, event: progress('case-review', 'Transaction found for SGD 250') },
    { delayMs: 400, event: progress('policy', 'Goods Not Received policy section found') },
    { delayMs: 450, event: progress('case-review', 'Merchant response available') },
    { delayMs: 400, event: progress('policy', 'Interpreting policy requirements') },
    { delayMs: 450, event: progress('case-review', 'Case file contains transaction record') },
    { delayMs: 400, event: progress('policy', 'Required evidence list identified') },
    { delayMs: 450, event: progress('case-review', 'Case file contains merchant response') },
    {
      delayMs: 500,
      event: progress('case-review', 'No additional customer documents found in case file'),
    },
    {
      delayMs: 500,
      event: progress('orchestrator', 'Merging case facts with policy requirements...'),
    },
    {
      delayMs: 400,
      event: progress('orchestrator', 'Comparing available documents against required evidence...'),
    },
    { delayMs: 400, event: progress('orchestrator', 'Missing customer declaration') },
    { delayMs: 400, event: progress('orchestrator', 'Missing delivery / non-delivery proof') },
    { delayMs: 400, event: progress('orchestrator', 'Calculating evidence readiness...') },
    {
      delayMs: 0,
      event: { type: EventType.STATE_SNAPSHOT, snapshot: { evidenceReadiness: null } },
    },
    {
      delayMs: 300,
      event: {
        type: EventType.STATE_DELTA,
        delta: [
          { op: 'replace', path: '/evidenceReadiness', value: '2 of 4 required items present' },
        ],
      },
    },
    { delayMs: 400, event: progress('orchestrator', 'Preparing decision view...') },
    {
      delayMs: 400,
      event: a2ui({
        version: 'v0.9',
        createSurface: {
          surfaceId: SURFACE_ID,
          catalogId: DISPUTE_CATALOG_ID,
          sendDataModel: false,
        },
      }),
    },
    {
      delayMs: 300,
      event: a2ui({
        version: 'v0.9',
        updateComponents: { surfaceId: SURFACE_ID, components: decisionViewComponents },
      }),
    },
    {
      delayMs: 0,
      event: { type: EventType.RUN_FINISHED, threadId: THREAD_ID, runId: 'run-review' },
    },
  ],
};

export const previewRun: DemoRun = {
  events: [
    {
      delayMs: 0,
      event: { type: EventType.RUN_STARTED, threadId: THREAD_ID, runId: 'run-preview' },
    },
    {
      delayMs: 400,
      event: a2ui({
        version: 'v0.9',
        updateComponents: { surfaceId: SURFACE_ID, components: approvalPreviewComponents },
      }),
    },
    {
      delayMs: 0,
      event: { type: EventType.RUN_FINISHED, threadId: THREAD_ID, runId: 'run-preview' },
    },
  ],
};

export const approvalRun: DemoRun = {
  events: [
    {
      delayMs: 0,
      event: { type: EventType.RUN_STARTED, threadId: THREAD_ID, runId: 'run-approval' },
    },
    { delayMs: 400, event: progress('orchestrator', 'Creating evidence request task...') },
    {
      delayMs: 400,
      event: progress('orchestrator', 'Updating case status to Pending Evidence...'),
    },
    { delayMs: 400, event: progress('orchestrator', 'Creating audit entry...') },
    { delayMs: 400, event: progress('orchestrator', 'Task created successfully.') },
    {
      delayMs: 300,
      event: a2ui({
        version: 'v0.9',
        updateComponents: { surfaceId: SURFACE_ID, components: taskCreatedComponents },
      }),
    },
    {
      delayMs: 0,
      event: { type: EventType.RUN_FINISHED, threadId: THREAD_ID, runId: 'run-approval' },
    },
  ],
};

export const cancelRun: DemoRun = {
  events: [
    {
      delayMs: 0,
      event: { type: EventType.RUN_STARTED, threadId: THREAD_ID, runId: 'run-cancel' },
    },
    {
      delayMs: 300,
      event: a2ui({
        version: 'v0.9',
        updateComponents: { surfaceId: SURFACE_ID, components: decisionViewComponents },
      }),
    },
    {
      delayMs: 0,
      event: { type: EventType.RUN_FINISHED, threadId: THREAD_ID, runId: 'run-cancel' },
    },
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/mock/demoScript.test.ts`
Expected: `7 passed` (4 from `it.each` + 3 more).

- [ ] **Step 5: Write the failing test for `MockAgent`**

```ts
// src/mock/mockAgent.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventType } from '@ag-ui/client';
import { MockAgent } from './mockAgent';

describe('MockAgent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays the review run by default and dispatches RUN_STARTED then RUN_FINISHED in order', async () => {
    const agent = new MockAgent();
    const seen: string[] = [];
    agent.subscribe({
      onRunStartedEvent: () => {
        seen.push('RUN_STARTED');
      },
      onRunFinishedEvent: () => {
        seen.push('RUN_FINISHED');
      },
      onCustomEvent: ({ event }) => {
        if (event.type === EventType.CUSTOM) seen.push(`CUSTOM:${event.name}`);
      },
    } as never);

    await agent.runAgent({});
    await vi.advanceTimersByTimeAsync(20000);

    expect(seen[0]).toBe('RUN_STARTED');
    expect(seen[seen.length - 1]).toBe('RUN_FINISHED');
    expect(seen).toContain('CUSTOM:progress');
    expect(seen).toContain('CUSTOM:a2ui');
  });

  it('plays the approval run when forwardedProps.a2uiAction.name is approve_task_creation', async () => {
    const agent = new MockAgent();
    const seen: string[] = [];
    agent.subscribe({
      onRunFinishedEvent: () => {
        seen.push('RUN_FINISHED');
      },
    } as never);

    await agent.runAgent({ forwardedProps: { a2uiAction: { name: 'approve_task_creation' } } });
    await vi.advanceTimersByTimeAsync(10000);

    expect(seen).toEqual(['RUN_FINISHED']);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -- src/mock/mockAgent.test.ts`
Expected: FAIL — `Cannot find module './mockAgent'`.

- [ ] **Step 7: Implement `mockAgent.ts`**

```ts
import { EventType, type AgentSubscriber, type BaseEvent } from '@ag-ui/client';
import {
  reviewRun,
  previewRun,
  approvalRun,
  cancelRun,
  THREAD_ID,
  type DemoRun,
} from './demoScript';

interface MockRunParams {
  forwardedProps?: { a2uiAction?: { name?: string } };
}

function runFor(actionName: string | undefined): DemoRun {
  switch (actionName) {
    case 'create_evidence_request_task':
      return previewRun;
    case 'approve_task_creation':
      return approvalRun;
    case 'cancel_task_creation':
      return cancelRun;
    default:
      return reviewRun;
  }
}

function dispatchToSubscriber(subscriber: AgentSubscriber, event: BaseEvent): void {
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

/**
 * A structurally AG-UI-compatible agent that replays `demoScript.ts` on
 * timers instead of connecting over SSE. Used when VITE_MOCK is not "false".
 */
export class MockAgent {
  threadId = THREAD_ID;
  private subscribers: AgentSubscriber[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];

  subscribe(subscriber: AgentSubscriber): { unsubscribe: () => void } {
    this.subscribers.push(subscriber);
    return {
      unsubscribe: () => {
        this.subscribers = this.subscribers.filter((s) => s !== subscriber);
      },
    };
  }

  async runAgent(params: MockRunParams = {}): Promise<{ result: undefined }> {
    const run = runFor(params.forwardedProps?.a2uiAction?.name);
    let cumulativeDelay = 0;
    for (const scripted of run.events) {
      cumulativeDelay += scripted.delayMs;
      const timer = setTimeout(() => this.dispatch(scripted.event), cumulativeDelay);
      this.timers.push(timer);
    }
    return { result: undefined };
  }

  abortRun(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private dispatch(event: BaseEvent): void {
    for (const subscriber of this.subscribers) {
      dispatchToSubscriber(subscriber, event);
    }
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test -- src/mock/mockAgent.test.ts`
Expected: `2 passed`.

- [ ] **Step 9: Commit**

```bash
git add src/mock/demoScript.ts src/mock/demoScript.test.ts src/mock/mockAgent.ts src/mock/mockAgent.test.ts
git commit -m "Add mock demo script (four runs) and MockAgent replay engine"
```

---

## Task 12: Live/mock client wiring

**Files:**

- Create: `src/vite-env.d.ts`
- Create: `src/agui/client.ts`

**Interfaces:**

- Consumes: `workbenchAgentSubscriber`, `resetBridgeState` (Task 10), `MockAgent` (Task 11), `useWorkbenchStore` (Task 9).
- Produces: `startDemoCase(disputeText: string)`, `reconnect()` — consumed by Task 13 (panels).

- [ ] **Step 0: Create `src/vite-env.d.ts`**

Task 1's scaffold omitted Vite's standard triple-slash reference that types
`import.meta.env`, and no task needed it until this one — this is the
standard Vite scaffold file, not a workaround:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 1: Implement `client.ts`**

No new automated test in this task — it is exercised end-to-end by Task 14's integration test. Manual verification is in Step 2.

```ts
import { HttpAgent, type AgentSubscriber } from '@ag-ui/client';
import { MockAgent } from '../mock/mockAgent';
import { workbenchAgentSubscriber, resetBridgeState } from './bridge';
import { useWorkbenchStore } from '../state/workbenchStore';

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

// The processor is a single, stable instance for the app's lifetime (one case
// per page load), so its action listener is wired exactly once here rather
// than per-run. Every A2UI button click becomes a new AG-UI run on the same
// threadId, per design doc §3.4.
useWorkbenchStore.getState().processor.model.onAction.subscribe((action) => {
  void agent?.runAgent({ forwardedProps: { a2uiAction: action } });
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

- [ ] **Step 2: Verify the module compiles cleanly**

Run: `npm run typecheck`
Expected: no errors from `src/agui/client.ts`. If `HttpAgent`'s constructor or `runAgent` signature doesn't structurally satisfy `AguiLikeAgent`, adjust the cast or the interface to match `@ag-ui/client`'s actual `.d.ts` — do not weaken this to `any`.

- [ ] **Step 3: Commit**

```bash
git add src/agui/client.ts
git commit -m "Wire live/mock AG-UI agent selection and action-forwarding"
```

---

## Task 13: UI panels and app layout

**Files:**

- Create: `src/components/CaseIntakePanel.tsx`
- Create: `src/components/LiveProgressPanel.tsx`
- Create: `src/components/DecisionPanel.tsx`
- Modify: `src/App.tsx` (replace the Task 1 placeholder)

**Interfaces:**

- Consumes: `useWorkbenchStore` (Task 9), `startDemoCase`/`reconnect` (Task 12), `AgentSource` (Task 4), `A2uiSurface` (`@a2ui/react/v0_9`).
- Produces: the full three-zone workbench UI, consumed by Task 14's integration test.

- [ ] **Step 1: Implement `CaseIntakePanel.tsx`**

```tsx
import { useState } from 'react';
import { useWorkbenchStore } from '../state/workbenchStore';
import { startDemoCase } from '../agui/client';

const DEFAULT_DISPUTE_TEXT =
  'I paid SGD 250 for an item, but I never received it. The merchant says the item was delivered, but I disagree.';

export function CaseIntakePanel() {
  const [disputeText, setDisputeText] = useState(DEFAULT_DISPUTE_TEXT);
  const caseId = useWorkbenchStore((state) => state.caseId);
  const connectionStatus = useWorkbenchStore((state) => state.connectionStatus);
  const busy = connectionStatus === 'connecting' || connectionStatus === 'streaming';

  return (
    <section className="flex h-full flex-col gap-3 border-r border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Case intake</h2>
      <textarea
        className="min-h-32 flex-1 resize-none rounded-md border border-slate-300 p-2 text-sm"
        value={disputeText}
        onChange={(event) => setDisputeText(event.target.value)}
        disabled={busy}
      />
      <button
        type="button"
        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={busy}
        onClick={() => startDemoCase(disputeText)}
      >
        Review Dispute
      </button>
      {caseId && <p className="text-xs text-slate-500">Case {caseId}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Implement `LiveProgressPanel.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useWorkbenchStore } from '../state/workbenchStore';
import type { AgentSource } from '../agui/events';
import { reconnect } from '../agui/client';

const SOURCE_STYLES: Record<AgentSource, string> = {
  orchestrator: 'bg-slate-700 text-white',
  'case-review': 'bg-blue-600 text-white',
  policy: 'bg-purple-600 text-white',
};

const SOURCE_LABELS: Record<AgentSource, string> = {
  orchestrator: 'Orchestrator',
  'case-review': 'Case Review Agent',
  policy: 'Policy Agent',
};

export function LiveProgressPanel() {
  const progressLines = useWorkbenchStore((state) => state.progressLines);
  const connectionStatus = useWorkbenchStore((state) => state.connectionStatus);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [progressLines, paused]);

  return (
    <section className="flex h-full flex-col border-r border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Live agent progress
        </h2>
        <span className="text-xs font-medium text-slate-500">{statusLabel(connectionStatus)}</span>
      </div>
      {connectionStatus === 'disconnected' && (
        <button
          type="button"
          className="mb-2 self-start rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
          onClick={reconnect}
        >
          Reconnect
        </button>
      )}
      <div
        ref={containerRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="flex-1 space-y-1.5 overflow-y-auto"
      >
        {progressLines.map((line) => (
          <div key={line.id} className="flex items-start gap-2 text-sm">
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${SOURCE_STYLES[line.source]}`}
            >
              {SOURCE_LABELS[line.source]}
            </span>
            <span className="text-slate-700">{line.text}</span>
            <span className="ml-auto shrink-0 text-xs text-slate-400">
              {new Date(line.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'connecting':
      return 'Connecting…';
    case 'streaming':
      return 'Streaming';
    case 'finished':
      return 'Finished';
    default:
      return 'Disconnected';
  }
}
```

- [ ] **Step 3: Implement `DecisionPanel.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { SurfaceModel } from '@a2ui/web_core/v0_9';
import { A2uiSurface, type ReactComponentImplementation } from '@a2ui/react/v0_9';
import { useWorkbenchStore } from '../state/workbenchStore';

export function DecisionPanel() {
  const processor = useWorkbenchStore((state) => state.processor);
  const [surface, setSurface] = useState<SurfaceModel<ReactComponentImplementation> | undefined>(
    () => processor.model.surfacesMap.values().next().value,
  );

  useEffect(() => {
    const createdSub = processor.onSurfaceCreated((created) => setSurface(created));
    const deletedSub = processor.onSurfaceDeleted(() => setSurface(undefined));
    return () => {
      createdSub.unsubscribe();
      deletedSub.unsubscribe();
    };
  }, [processor]);

  return (
    <section className="flex h-full flex-col gap-3 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Decision panel
      </h2>
      {surface ? (
        <A2uiSurface surface={surface} />
      ) : (
        <p className="text-sm text-slate-400">Awaiting decision from the orchestrator…</p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Replace `src/App.tsx`**

```tsx
import { CaseIntakePanel } from './components/CaseIntakePanel';
import { LiveProgressPanel } from './components/LiveProgressPanel';
import { DecisionPanel } from './components/DecisionPanel';

export default function App() {
  return (
    <div className="grid h-screen grid-cols-[320px_1fr_1fr] bg-slate-100 text-slate-900">
      <CaseIntakePanel />
      <LiveProgressPanel />
      <DecisionPanel />
    </div>
  );
}
```

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev`
Expected: dev server starts. Open the printed local URL. Click "Review Dispute" and confirm progress lines stream into the center panel with colored source badges, ending with a DecisionCard (containing a nested checklist and action buttons) in the right panel. Click "Create Evidence Request Task", confirm an `ApprovalPreview` appears; click "Approve Task Creation", confirm progress lines stream again and a `TaskCreatedCard` appears.

- [ ] **Step 6: Run the full test suite to confirm nothing regressed**

Run: `npm run test`
Expected: all prior tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/CaseIntakePanel.tsx src/components/LiveProgressPanel.tsx src/components/DecisionPanel.tsx src/App.tsx
git commit -m "Add three-zone workbench layout and wire it to the store/client"
```

---

## Task 14: End-to-end mock replay integration test

**Files:**

- Test: `src/test/integration.test.tsx`

**Interfaces:**

- Consumes: `App` (Task 13), the full mock stack (Tasks 9–12).
- Produces: one integration test asserting the complete demo script (review → preview → approval) ends with `TaskCreatedCard` visible in the DOM.

- [ ] **Step 1: Write the test**

```tsx
// src/test/integration.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

describe('full demo script replay (mock mode)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends with TaskCreatedCard after the review, preview, and approval runs', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    // NOTE: `await user.click(...)` followed by a separate `await
    // vi.advanceTimersByTimeAsync(...)` deadlocks here: userEvent v14's click
    // implementation awaits a step that only resolves once fake timers are
    // advanced, so awaiting the click to completion before advancing timers
    // never returns. Firing both concurrently (below) lets
    // advanceTimersByTimeAsync pump the timer queue while userEvent's click
    // is in flight, which unblocks it. This is a userEvent+fake-timers
    // interaction workaround only; the click and the awaited timer window are
    // otherwise identical to the sequential form described above.
    await Promise.all([
      user.click(screen.getByRole('button', { name: 'Review Dispute' })),
      vi.advanceTimersByTimeAsync(20000),
    ]);

    const createTaskButton = screen.getByRole('button', {
      name: 'Create Evidence Request Task',
    });
    await Promise.all([user.click(createTaskButton), vi.advanceTimersByTimeAsync(5000)]);

    const approveButton = screen.getByRole('button', { name: 'Approve Task Creation' });
    await Promise.all([user.click(approveButton), vi.advanceTimersByTimeAsync(10000)]);

    expect(screen.getByText('Task created')).toBeInTheDocument();
    expect(screen.getByText('EVID-88421')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify it passes**

Run: `npm run test -- src/test/integration.test.tsx`
Expected: `1 passed`. If a `findByRole`/`findByText` call times out, increase the corresponding `advanceTimersByTimeAsync` duration to exceed that run's total scripted delay (sum each run's `delayMs` values in `demoScript.ts`) rather than adding retries or `waitFor` polling loops.

- [ ] **Step 3: Run the entire test suite one more time**

Run: `npm run test`
Expected: all tests across every task pass together.

- [ ] **Step 4: Commit**

```bash
git add src/test/integration.test.tsx
git commit -m "Add end-to-end mock-script replay integration test"
```

---

## Task 15: README

**Files:**

- Create: `README.md`

**Interfaces:**

- Produces: the project's documentation — what it is, how to run mock mode, how to point at a real backend, the agent-source labeling contract, the catalog component schema table, and the pinned A2UI spec version note.

- [ ] **Step 1: Write `README.md`**

````markdown
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
````

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

- [ ] **Step 2: Verify the README's code fences and links are accurate**

Manually confirm every file path referenced in the README (`docs/superpowers/specs/2026-07-13-agentic-dispute-workbench-ui-design.md`, `src/agui/client.ts`, `.env.example`) exists in the repo at that exact path.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Add README: mock mode, backend wiring, wire contract, catalog schema table"
```

---

## Task 16: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full clean install and build**

Run: `rm -rf node_modules dist && npm install && npm run build`
Expected: succeeds with zero TypeScript errors.

- [ ] **Step 2: Lint clean**

Run: `npm run lint`
Expected: `0 errors, 0 warnings`.

- [ ] **Step 3: Format check**

Run: `npm run format:check`
Expected: no files need reformatting.

- [ ] **Step 4: Full test suite**

Run: `npm run test`
Expected: every test file across all 16 tasks passes.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Manual smoke test of the built app**

Run: `npm run preview`
Expected: open the printed URL, replay the full demo (Review Dispute → Create Evidence Request Task → Approve Task Creation) and confirm the `TaskCreatedCard` appears, matching Task 13 Step 5's manual check but against the production build.

- [ ] **Step 7: Commit any final fixes**

```bash
git add -A
git commit -m "Final verification pass: build, lint, format, typecheck, and test all clean"
```

(Skip this commit if Steps 1–6 required no changes.)
