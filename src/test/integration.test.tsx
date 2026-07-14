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
    // otherwise identical to the sequential form the plan specifies.
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

    // Same sync-query pattern as the two `getByRole` swaps above, for the same
    // reason: by the time this final `Promise.all` resolves, the approval
    // run's DOM updates have already flushed, so a synchronous query is
    // sufficient and `findByText`'s own internal polling would otherwise also
    // stall under frozen fake timers absent concurrent advancement.
    expect(screen.getByText('Task created')).toBeInTheDocument();
    expect(screen.getByText('EVID-88421')).toBeInTheDocument();

    // The review run's opening line must appear exactly once across the whole
    // flow — regression guard for the mock-branching bug where an
    // unrecognized action id silently replayed the entire review run.
    expect(screen.getAllByText('Understanding dispute...')).toHaveLength(1);

    // Accessibility: the timeline is an ARIA live region so screen readers
    // announce new agent progress lines as they arrive.
    expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite');
  });

  it('does not replay the review run when an out-of-scope NextActions button is clicked', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await Promise.all([
      user.click(screen.getByRole('button', { name: 'Review Dispute' })),
      vi.advanceTimersByTimeAsync(20000),
    ]);

    const lineCountBefore = screen.getAllByTestId('progress-line').length;

    const escalateButton = screen.getByRole('button', { name: 'Escalate to Reviewer' });
    await Promise.all([user.click(escalateButton), vi.advanceTimersByTimeAsync(1000)]);

    expect(screen.getAllByTestId('progress-line')).toHaveLength(lineCountBefore);
    expect(screen.getByText('Escalate to Reviewer is not in demo scope')).toBeInTheDocument();
    expect(screen.getAllByText('Understanding dispute...')).toHaveLength(1);
  });
});
