import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { TaskCreatedCard } from './TaskCreatedCard';
import { renderA2uiComponents } from './testUtils';

describe('TaskCreatedCard', () => {
  it('renders taskId, caseStatus, auditEntry, and nextOwner', () => {
    renderA2uiComponents(
      [TaskCreatedCard],
      [
        {
          id: 'root',
          component: 'TaskCreatedCard',
          taskId: 'EVID-88421',
          caseStatus: 'Pending Evidence',
          auditEntry: 'Created',
          nextOwner: 'Dispute Operations Queue',
        },
      ],
    );

    expect(screen.getByText('EVID-88421')).toBeInTheDocument();
    expect(screen.getByText('Pending Evidence')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Dispute Operations Queue')).toBeInTheDocument();
  });
});
