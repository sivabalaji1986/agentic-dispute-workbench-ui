import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { EvidenceChecklist } from './EvidenceChecklist';
import { renderA2uiComponents } from './testUtils';

describe('EvidenceChecklist', () => {
  it('renders each item with its checked/unchecked state', () => {
    renderA2uiComponents(
      [EvidenceChecklist],
      [
        {
          id: 'root',
          component: 'EvidenceChecklist',
          items: [
            { label: 'Transaction record', present: true },
            { label: 'Customer declaration', present: false },
          ],
        },
      ],
    );

    const present = screen.getByText('Transaction record');
    const missing = screen.getByText('Customer declaration');
    expect(present).toBeInTheDocument();
    expect(missing).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
