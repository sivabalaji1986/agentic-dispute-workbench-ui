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
