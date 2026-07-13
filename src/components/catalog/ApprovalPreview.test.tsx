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
