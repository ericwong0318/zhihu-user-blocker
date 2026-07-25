import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FactCheck from './FactCheck';
import { mockChromeStorage } from '../../../test/setup';

describe('FactCheck UI', () => {
  beforeEach(() => {
    (global as Record<string, unknown>).chrome = { storage: mockChromeStorage };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows streaming AI thinking text and renders a final result', async () => {
    await mockChromeStorage.sync.set({
      factCheckConfigs: [
        {
          provider: 'openai',
          apiKey: 'fake',
          model: 'gpt-4o-mini',
          language: 'en',
        },
      ],
    });

    const onFactCheck = vi.fn(
      (text: string, onStage?: (stage: string, isRetry?: boolean) => void) => {
        return new Promise((resolve) => {
          window.setTimeout(() => {
            onStage?.('Parsing text…', false);
          }, 50);
          window.setTimeout(() => {
            onStage?.('Running logic analysis…', false);
          }, 100);
          window.setTimeout(
            () =>
              resolve({
                validityVsTruth: 'The claim is mostly unsupported.',
                rhetoric: { ethos: 'Moderate', pathos: 'Low', logos: 'Medium' },
                fallacies: [],
                verdict: 'credible',
                provider: 'OpenAI',
              }),
            2000,
          );
        });
      },
    ) as unknown as React.ComponentProps<typeof FactCheck>['onFactCheck'];

    render(
      <FactCheck
        text="Some test text"
        enabled={true}
        onFactCheck={onFactCheck}
      />,
    );

    // Flush the useEffect that reads provider config from storage so
    // providerInfo is populated before we click.
    await act(async () => {});

    const button = screen.getByRole('button', { name: /fact check/i });
    fireEvent.click(button);

    // Loading header appears
    await waitFor(() =>
      expect(screen.getByText(/AI is thinking/i)).toBeInTheDocument(),
    );

    // Pipeline stages should appear in the thinking text area
    await waitFor(() => {
      // Check that thinking text area contains the stages
      const thinkingContainer = screen.getByText(/Parsing text/i).closest('div');
      expect(thinkingContainer).toBeInTheDocument();
      expect(screen.getByText(/Parsing text/i)).toBeInTheDocument();
      expect(screen.getByText(/Running logic analysis/i)).toBeInTheDocument();
      expect(screen.getByText(/Analyzing bias/i)).toBeInTheDocument();
      expect(screen.getByText(/Synthesizing verdict/i)).toBeInTheDocument();
    });

    // Final result renders
    await waitFor(
      () => expect(screen.getByText(/Credible/i)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(screen.getByText(/via OpenAI/i)).toBeInTheDocument();
    expect(onFactCheck).toHaveBeenCalledWith(
      'Some test text',
      expect.any(Function),
    );
  });

  it('shows retry indicator when the provider callback reports a retry', async () => {
    await mockChromeStorage.sync.set({
      factCheckConfigs: [
        {
          provider: 'openai',
          apiKey: 'fake',
          model: 'gpt-4o-mini',
          language: 'en',
        },
      ],
    });

    let stageCallback: ((stage: string, isRetry?: boolean) => void) | undefined;
    const onFactCheck = vi.fn(
      (text: string, onStage?: (stage: string, isRetry?: boolean) => void) => {
        stageCallback = onStage;
        return new Promise((resolve) => {
          window.setTimeout(() => {
            stageCallback?.('Contacting AI provider…', false);
          }, 50);
          window.setTimeout(
            () =>
              resolve({
                validityVsTruth: 'The claim has mixed evidence.',
                rhetoric: { ethos: 'Low', pathos: 'Medium', logos: 'High' },
                fallacies: [],
                verdict: 'misleading',
                provider: 'OpenAI',
              }),
            2000,
          );
        });
      },
    ) as unknown as React.ComponentProps<typeof FactCheck>['onFactCheck'];

    render(
      <FactCheck
        text="Retry test text"
        enabled={true}
        onFactCheck={onFactCheck}
      />,
    );

    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: /fact check/i }));
    await waitFor(() =>
      expect(screen.getByText(/AI is thinking/i)).toBeInTheDocument(),
    );

    expect(stageCallback).toBeDefined();
    act(() => {
      stageCallback?.('Contacting AI provider…', true);
    });

    // The retry indicator appears in the thinking text
    expect(await screen.findByText(/Retrying/i)).toBeInTheDocument();

    await waitFor(
      () => expect(screen.getByText(/Misleading/i)).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });
});
