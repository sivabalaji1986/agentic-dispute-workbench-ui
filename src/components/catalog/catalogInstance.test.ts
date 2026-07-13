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
