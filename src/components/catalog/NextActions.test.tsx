import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextActions } from './NextActions';
import { renderA2uiComponents } from './testUtils';

const ALL_ACTIONS = [
  { id: 'create_evidence_request_task', label: 'Create Evidence Request Task' },
  { id: 'escalate_to_reviewer', label: 'Escalate to Reviewer' },
  { id: 'save_case_note', label: 'Save Case Note' },
];

describe('NextActions', () => {
  it('renders one button per action and dispatches the action id as the event name on click', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();

    renderA2uiComponents(
      [NextActions],
      [{ id: 'root', component: 'NextActions', actions: ALL_ACTIONS }],
      { onAction },
    );

    expect(screen.getByRole('button', { name: 'Escalate to Reviewer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create Evidence Request Task' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'create_evidence_request_task', sourceComponentId: 'root' }),
    );
  });

  it('intercepts Escalate to Reviewer client-side: no dispatch, shows a scope notice', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();

    renderA2uiComponents(
      [NextActions],
      [{ id: 'root', component: 'NextActions', actions: ALL_ACTIONS }],
      { onAction },
    );

    await user.click(screen.getByRole('button', { name: 'Escalate to Reviewer' }));

    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText('Escalate to Reviewer is not in demo scope')).toBeInTheDocument();
  });

  it('intercepts Save Case Note client-side: no dispatch, shows a scope notice', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();

    renderA2uiComponents(
      [NextActions],
      [{ id: 'root', component: 'NextActions', actions: ALL_ACTIONS }],
      { onAction },
    );

    await user.click(screen.getByRole('button', { name: 'Save Case Note' }));

    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText('Save Case Note is not in demo scope')).toBeInTheDocument();
  });

  it('renders a keyboard-focusable aria-disabled button for an action id outside the allow-list and does not dispatch it', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();

    renderA2uiComponents(
      [NextActions],
      [{ id: 'root', component: 'NextActions', actions: [{ id: 'delete_everything', label: 'Delete Everything' }] }],
      { onAction },
    );

    const button = screen.getByRole('button', { name: 'Delete Everything' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(onAction).not.toHaveBeenCalled();
  });
});
