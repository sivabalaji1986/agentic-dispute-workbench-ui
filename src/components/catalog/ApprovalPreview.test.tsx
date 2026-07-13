import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalPreview } from './ApprovalPreview';
import { renderA2uiComponents } from './testUtils';

describe('ApprovalPreview', () => {
  it('renders case details, missing items, and dispatches approve/cancel actions', async () => {
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

  it('intercepts Edit client-side and never dispatches an action', async () => {
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
          missingItems: [],
          actionAfterApproval: 'Create task in case system and update case status.',
          onApprove: { event: { name: 'approve_task_creation', context: {} } },
          onEdit: { event: { name: 'edit_task_creation', context: {} } },
          onCancel: { event: { name: 'cancel_task_creation', context: {} } },
        },
      ],
      { onAction },
    );

    expect(screen.queryByText('Edit flow not in demo scope')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByText('Edit flow not in demo scope')).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });
});
