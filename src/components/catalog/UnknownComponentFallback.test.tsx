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
