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

    expect(screen.getByText('Task created')).toBeInTheDocument();
    expect(screen.getByText('EVID-88421')).toBeInTheDocument();
  });
});
