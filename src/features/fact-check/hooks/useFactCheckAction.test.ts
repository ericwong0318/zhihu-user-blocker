import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFactCheckAction, FactCheckResult } from './useFactCheckAction';

describe('useFactCheckAction', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useFactCheckAction());

    expect(result.current.loading).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.provider).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.thinkingText).toBe('');
  });

  it('should set loading and clear thinking text when handleClick is called', async () => {
    const onFactCheck = vi.fn().mockResolvedValue({ verdict: 'credible' });

    const { result } = renderHook(() => useFactCheckAction());

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleClick(mockEvent, true, 'Test claim', undefined, onFactCheck);
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.thinkingText).toBe('');
  });

  it('should not call onFactCheck if disabled', async () => {
    const onFactCheck = vi.fn().mockResolvedValue({ verdict: 'credible' });

    const { result } = renderHook(() => useFactCheckAction());

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleClick(mockEvent, false, 'Test claim', undefined, onFactCheck);
    });

    expect(onFactCheck).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('should not call onFactCheck if result already exists', async () => {
    const onFactCheck = vi.fn().mockResolvedValue({ verdict: 'credible' });

    const { result } = renderHook(() => useFactCheckAction());

    // First call
    act(() => {
      result.current.setResult({ verdict: 'credible' });
    });

    // Second call should be ignored
    const mockEvent = { preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleClick(mockEvent, true, 'Test claim', undefined, onFactCheck);
    });

    expect(onFactCheck).not.toHaveBeenCalled();
  });

  it('should not call onFactCheck if error already exists', async () => {
    const onFactCheck = vi.fn().mockResolvedValue({ verdict: 'credible' });

    const { result } = renderHook(() => useFactCheckAction());

    // Set error first
    act(() => {
      result.current.setError('Previous error');
    });

    // Second call should be ignored
    const mockEvent = { preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleClick(mockEvent, true, 'Test claim', undefined, onFactCheck);
    });

    expect(onFactCheck).not.toHaveBeenCalled();
  });

  it('should set result on successful fact check', async () => {
    const mockResult: FactCheckResult = {
      verdict: 'credible',
      validityVsTruth: 'Valid',
      rhetoric: { ethos: 'high', pathos: 'medium', logos: 'high' },
      fallacies: [],
      sources: [{ url: 'https://example.com', title: 'Source' }],
    };
    // The provider is stored separately, not in the result
    const onFactCheck = vi.fn().mockResolvedValue({ ...mockResult, provider: 'openai' });

    const { result } = renderHook(() => useFactCheckAction());

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLElement>;

    await act(async () => {
      result.current.handleClick(mockEvent, true, 'Test claim', undefined, onFactCheck);
    });

    expect(result.current.loading).toBe(false);
    // The result includes the provider field from the response
    expect(result.current.result).toEqual({ ...mockResult, provider: 'openai' });
    expect(result.current.provider).toBe('openai');
  });

  it('should set error on failed fact check', async () => {
    const onFactCheck = vi.fn().mockResolvedValue({ error: 'API key invalid' });

    const { result } = renderHook(() => useFactCheckAction());

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLElement>;

    await act(async () => {
      result.current.handleClick(mockEvent, true, 'Test claim', undefined, onFactCheck);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('API key invalid');
    expect(result.current.result).toBeNull();
  });

  it('should set error on exception', async () => {
    const onFactCheck = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useFactCheckAction());

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLElement>;

    await act(async () => {
      result.current.handleClick(mockEvent, true, 'Test claim', undefined, onFactCheck);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Network error');
  });

  it('should set error on non-Error exception', async () => {
    const onFactCheck = vi.fn().mockRejectedValue('String error');

    const { result } = renderHook(() => useFactCheckAction());

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLElement>;

    await act(async () => {
      result.current.handleClick(mockEvent, true, 'Test claim', undefined, onFactCheck);
    });

    expect(result.current.error).toBe('String error');
  });

  it('should clear result when setResult is called with null', () => {
    const { result } = renderHook(() => useFactCheckAction());

    act(() => {
      result.current.setResult({ verdict: 'credible' });
    });

    expect(result.current.result).toEqual({ verdict: 'credible' });

    act(() => {
      result.current.setResult(null);
    });

    expect(result.current.result).toBeNull();
  });

  it('should set error when setError is called', () => {
    const { result } = renderHook(() => useFactCheckAction());

    act(() => {
      result.current.setError('Test error');
    });

    expect(result.current.error).toBe('Test error');
  });

  it('should clear error when setError is called with null', () => {
    const { result } = renderHook(() => useFactCheckAction());

    act(() => {
      result.current.setError('Test error');
    });

    act(() => {
      result.current.setError(null);
    });

    expect(result.current.error).toBeNull();
  });

  it('should stream thinking text from onStage callback', async () => {
    const onFactCheck = vi.fn().mockImplementation(
      (
        _text: string,
        _question: string | undefined,
        onStage?: (stage: string, isRetry?: boolean) => void,
      ) => {
        onStage?.('Parsing text…');
        onStage?.('Contacting provider…', true);
        return Promise.resolve({ verdict: 'credible' });
      },
    );

    const { result } = renderHook(() => useFactCheckAction());

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLElement>;

    await act(async () => {
      result.current.handleClick(mockEvent, true, 'Test claim', undefined, onFactCheck);
    });

    // thinkingText should accumulate stages with newlines
    expect(result.current.thinkingText).toContain('Parsing text…');
    expect(result.current.thinkingText).toContain('Retrying… Contacting provider…');
  });

  it('should handle response with provider field', async () => {
    const onFactCheck = vi.fn().mockResolvedValue({
      verdict: 'misleading',
      provider: 'claude',
    });

    const { result } = renderHook(() => useFactCheckAction());

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLElement>;

    await act(async () => {
      result.current.handleClick(mockEvent, true, 'Test claim', undefined, onFactCheck);
    });

    expect(result.current.provider).toBe('claude');
    expect(result.current.result?.verdict).toBe('misleading');
  });

  it('should handle response without provider field', async () => {
    const onFactCheck = vi.fn().mockResolvedValue({ verdict: 'unverified' });

    const { result } = renderHook(() => useFactCheckAction());

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLElement>;

    await act(async () => {
      result.current.handleClick(mockEvent, true, 'Test claim', undefined, onFactCheck);
    });

    expect(result.current.provider).toBeNull();
    expect(result.current.result?.verdict).toBe('unverified');
  });
});
