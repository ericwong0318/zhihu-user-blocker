import { useState } from 'react';

export interface FactCheckResult {
  verdict: string;
  validityVsTruth?: string;
  rhetoric?: { ethos?: string; pathos?: string; logos?: string };
  fallacies?: { name: string; quote?: string; explanation: string }[];
  sources?: { url: string; title?: string }[];
}

export type StageReporter = (stage: string, isRetry?: boolean) => void;

export const useFactCheckAction = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FactCheckResult | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thinkingText, setThinkingText] = useState<string>('');

  const handleClick = async (
    _e: React.MouseEvent<HTMLElement>,
    enabled: boolean,
    text: string,
    question: string | undefined,
    onFactCheck: (
      text: string,
      question?: string,
      onStage?: StageReporter,
    ) => Promise<unknown>,
  ) => {
    if (result || error) return;
    if (!enabled) return;
    setLoading(true);
    setError(null);
    setThinkingText('');
    try {
      const res = await onFactCheck(text, question, (stage: string, isRetry?: boolean) => {
        setThinkingText((prev) => {
          const prefix = isRetry ? 'Retrying… ' : '';
          const newLine = prev ? '\n\n' : '';
          return `${prev}${newLine}${prefix}${stage}`;
        });
      });
      if (res && typeof res === 'object' && 'error' in res) {
        setError((res as { error: string }).error);
      } else {
        setResult(res as FactCheckResult);
        if (res && typeof res === 'object' && 'provider' in res) {
          setProvider((res as { provider?: string }).provider ?? null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    result,
    provider,
    error,
    thinkingText,
    setError,
    setResult,
    handleClick,
  };
};
