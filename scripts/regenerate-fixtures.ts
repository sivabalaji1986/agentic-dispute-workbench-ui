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
