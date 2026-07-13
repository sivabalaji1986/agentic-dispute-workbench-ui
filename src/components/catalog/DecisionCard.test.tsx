import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { DecisionCard } from './DecisionCard';
import { renderA2uiComponents } from './testUtils';

describe('DecisionCard', () => {
  it('renders status, dispute type, evidence readiness, and recommended action', () => {
    renderA2uiComponents(
      [DecisionCard],
      [
        {
          id: 'root',
          component: 'DecisionCard',
          status: 'Needs More Evidence',
          disputeType: 'Goods Not Received',
          evidenceReadiness: '2 of 4 required items present',
          recommendedAction: 'Create evidence request task',
        },
      ],
    );

    expect(screen.getByText('Needs More Evidence')).toBeInTheDocument();
    expect(screen.getByText('Goods Not Received')).toBeInTheDocument();
    expect(screen.getByText('2 of 4 required items present')).toBeInTheDocument();
    expect(screen.getByText(/Create evidence request task/)).toBeInTheDocument();
  });
});
