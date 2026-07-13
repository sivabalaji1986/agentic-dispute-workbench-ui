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
