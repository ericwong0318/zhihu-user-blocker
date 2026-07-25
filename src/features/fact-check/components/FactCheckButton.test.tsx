import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { FactCheckButton } from './FactCheckButton';
import { useFactCheckAction } from '../hooks/useFactCheckAction';

// Mock the useFactCheckAction hook
vi.mock('../hooks/useFactCheckAction', () => ({
  useFactCheckAction: vi.fn(),
}));

describe('FactCheckButton', () => {
  const mockOnFactCheck = vi.fn();
  const mockHandleClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';

    // Default mock for useFactCheckAction
    (useFactCheckAction as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      loading: false,
      result: null,
      provider: null,
      error: null,
      thinkingText: '',
      handleClick: mockHandleClick,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('should render Fact Check button when enabled', () => {
    render(<FactCheckButton enabled={true} text="Test claim" onFactCheck={mockOnFactCheck} />);

    expect(screen.getByRole('button', { name: /fact check/i })).toBeInTheDocument();
  });

  it('should render Fact Check button when disabled', () => {
    render(<FactCheckButton enabled={false} text="Test claim" onFactCheck={mockOnFactCheck} />);

    const button = screen.getByRole('button', { name: /fact check/i });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it('should show tooltip with correct aria-label when enabled', () => {
    render(<FactCheckButton enabled={true} text="Test claim" onFactCheck={mockOnFactCheck} />);

    const tooltip = screen.getByLabelText('AI fact-check this answer');
    expect(tooltip).toBeInTheDocument();
  });

  it('should show tooltip with correct aria-label when disabled', () => {
    render(<FactCheckButton enabled={false} text="Test claim" onFactCheck={mockOnFactCheck} />);

    const tooltip = screen.getByLabelText('Configure a provider in Options');
    expect(tooltip).toBeInTheDocument();
  });

  it('should call handleClick when button is clicked', async () => {
    // Use a fresh render for each test to avoid portal cleanup issues
    const { unmount } = render(<FactCheckButton enabled={true} text="Test claim" onFactCheck={mockOnFactCheck} />);

    await act(async () => {
      screen.getByRole('button', { name: /fact check/i }).click();
    });

    expect(mockHandleClick).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('should have correct button variant and size', () => {
    const { container, unmount } = render(<FactCheckButton enabled={true} text="Test claim" onFactCheck={mockOnFactCheck} />);

    const button = container.querySelector('button');
    // MUI applies variant and size as CSS classes
    expect(button).toHaveClass('MuiButton-outlined');
    expect(button).toHaveClass('MuiButton-sizeSmall');

    unmount();
  });

  it('should have FactCheckIcon as startIcon', () => {
    const { container, unmount } = render(<FactCheckButton enabled={true} text="Test claim" onFactCheck={mockOnFactCheck} />);

    const button = container.querySelector('button');
    expect(button?.querySelector('svg')).toBeInTheDocument();

    unmount();
  });

  it('should pass enabled prop to handleClick', async () => {
    const { unmount } = render(<FactCheckButton enabled={true} text="Test claim" onFactCheck={mockOnFactCheck} />);

    await act(async () => {
      screen.getByRole('button', { name: /fact check/i }).click();
    });

    // handleClick should be called with the event, enabled, text, question, and onFactCheck
    expect(mockHandleClick).toHaveBeenCalledWith(
      expect.any(Object), // event
      true, // enabled
      'Test claim', // text
      undefined, // question
      mockOnFactCheck // onFactCheck
    );

    unmount();
  });
});
