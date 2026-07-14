import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModeBadge } from './ModeBadge';
import { useWorkbenchStore } from '../state/workbenchStore';

describe('ModeBadge', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({ connectionStatus: 'idle' });
  });

  it('shows a DEMO MODE badge in mock mode once idle (VITE_MOCK defaults true in tests)', () => {
    render(<ModeBadge />);
    expect(screen.getByText(/DEMO MODE/i)).toBeInTheDocument();
  });

  it('renders nothing while connecting', () => {
    useWorkbenchStore.setState({ connectionStatus: 'connecting' });
    render(<ModeBadge />);
    expect(screen.queryByText(/DEMO MODE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/LIVE/i)).not.toBeInTheDocument();
  });
});
