import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { DecisionCard } from './DecisionCard';
import { EvidenceChecklist } from './EvidenceChecklist';
import { NextActions } from './NextActions';
import { renderA2uiComponents } from './testUtils';

describe('DecisionCard composition', () => {
  it('nests EvidenceChecklist and NextActions via checklistId/actionsId buildChild', () => {
    renderA2uiComponents(
      [DecisionCard, EvidenceChecklist, NextActions],
      [
        {
          id: 'root',
          component: 'DecisionCard',
          status: 'Needs More Evidence',
          disputeType: 'Goods Not Received',
          evidenceReadiness: '2 of 4 required items present',
          recommendedAction: 'Create evidence request task',
          checklistId: 'checklist-1',
          actionsId: 'actions-1',
        },
        {
          id: 'checklist-1',
          component: 'EvidenceChecklist',
          items: [{ label: 'Transaction record', present: true }],
        },
        {
          id: 'actions-1',
          component: 'NextActions',
          actions: [{ id: 'create_evidence_request_task', label: 'Create Evidence Request Task' }],
        },
      ],
    );

    expect(screen.getByText('Needs More Evidence')).toBeInTheDocument();
    expect(screen.getByText('Transaction record')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Evidence Request Task' }),
    ).toBeInTheDocument();
  });
});
