/**
 * Fact-Check Pipeline – orchestrates the four-agent pipeline.
 *
 * Pipeline stages:
 * 1. Parser – de-noises raw text, extracts claims, URLs, markdown, resources
 * 2. Logic – maps arguments to Toulmin structure, detects fallacies, assesses evidence
 * 3. Bias – analyzes rhetoric (ethos/pathos/logos), cognitive biases, persuasion techniques
 * 4. Critic – synthesizes all agent outputs into final FactCheckResult
 *
 * The pipeline can run fully locally (using the four agents) or fall back to
 * external AI providers via the background script when local synthesis is insufficient.
 */

import {
  FactCheckLanguage,
  FactCheckResultWithProvider,
  FactCheckResult,
} from './prompt';
import { parse, ParsedInput, getParsingSummary } from './agents/Parser';
import { runLogic, LogicOutput, getLogicSummary } from './agents/Logic';
import { analyzeBias, BiasOutput, getBiasSummary } from './agents/Bias';
import { synthesize, CriticOutput, getCriticSummary } from './agents/Critic';
import { NewsFetcherConfig } from './agents/NewsFetcher';
import { NewsApiConfig } from './providers/newsapi';

// Maximum time (ms) a SINGLE provider attempt is allowed before it is aborted.
// Each attempt gets its own 9s window; on timeout the pipeline falls back to
// the next provider and the UI recounts its progress bar.
export const MAX_FACTCHECK_MS = 9000;

/**
 * Run the full fact-check pipeline using the four local agents.
 *
 * @param text        The raw Zhihu answer/question text.
 * @param language    UI language selected by the user.
 * @param onStage     Optional callback reporting the current pipeline stage so
 *                    the UI can show a "thinking" progress indicator.
 * @returns           A promise resolving to the final FactCheckResult.
 */
export const runFactCheckPipelineLocal = async (
  text: string,
  language: FactCheckLanguage,
  onStage?: (stage: string) => void,
): Promise<FactCheckResult> => {
  // 1️⃣ Parser – clean the input and extract structured data
  onStage?.('Parsing text…');
  const parsed: ParsedInput = parse(text, language);

  if (parsed.stats.claimCount === 0 && parsed.cleanedText.trim().length < 50) {
    onStage?.('Input too short for meaningful analysis');
    return createMinimalResult('Input too short for meaningful fact-check analysis.', language);
  }

  // 2️⃣ Logic – formal logical analysis and fact-checking preparation
  onStage?.('Running logic analysis…');
  const logic: LogicOutput = await runLogic(parsed, language);

  // 3️⃣ Bias – rhetorical and cognitive bias analysis
  onStage?.('Analyzing bias & rhetoric…');
  const bias: BiasOutput = await analyzeBias(logic, text, language);

  // 4️⃣ Critic – synthesize final verdict
  onStage?.('Synthesizing verdict…');
  const critic: CriticOutput = await synthesize({ parsed, logic, bias, language }, language);

  // Convert CriticOutput to FactCheckResult (drop meta)
  const { meta, ...result } = critic;
  return result;
};

/**
 * Run the full fact-check pipeline with optional external AI provider fallback.
 *
 * This is the main entry point used by the UI. It first tries the local
 * four-agent pipeline. If the Critic cannot produce a definitive verdict
 * (verdict === 'unverified' or low confidence), it falls back to the
 * background script's AI provider chain.
 *
 * @param text        The raw Zhihu answer/question text.
 * @param language    UI language selected by the user.
 * @param onFactCheck Callback that talks to the background worker and returns
 *                    a FactCheckResultWithProvider (or an error object).
 * @param onStage     Optional callback reporting the current pipeline stage.
 * @returns           A promise resolving to the final FactCheckResultWithProvider.
 */
export const runFactCheckPipeline = async (
  text: string,
  language: FactCheckLanguage,
  onFactCheck: (
    t: string,
    onStage?: (stage: string, isRetry?: boolean) => void,
  ) => Promise<FactCheckResultWithProvider | { error: string }>,
  onStage?: (stage: string, isRetry?: boolean) => void,
): Promise<FactCheckResultWithProvider> => {
  // Stage 1: Local four-agent pipeline
  onStage?.('Parsing text…', false);
  const parsed: ParsedInput = parse(text, language);

  onStage?.('Running logic analysis…', false);
  const logic: LogicOutput = await runLogic(parsed, language);

  onStage?.('Analyzing bias & rhetoric…', false);
  const bias: BiasOutput = await analyzeBias(logic, text, language);

  onStage?.('Synthesizing verdict…', false);
  const critic: CriticOutput = await synthesize({ parsed, logic, bias, language }, language);

  // If the Critic produced a definitive verdict with good confidence, return it
  if (
    critic.verdict &&
    critic.verdict !== 'unverified' &&
    critic.meta.verdictConfidence >= 0.6
  ) {
    return {
      ...critic,
      provider: 'local-pipeline',
    };
  }

  // Fallback: ask the background provider directly
  onStage?.('Contacting AI provider…', false);
  const providerResult = await onFactCheck(text, onStage);
  if ('error' in providerResult) {
    // Return a minimal error result that matches FactCheckResult shape
    return {
      validityVsTruth: providerResult.error,
      rhetoric: { ethos: '', pathos: '', logos: '' },
      fallacies: [],
      verdict: 'unverified',
      provider: 'error',
    };
  }
  return {
    ...providerResult,
    provider: providerResult.provider ?? 'external',
  };
};

/**
 * Create a minimal FactCheckResult for edge cases.
 */
function createMinimalResult(message: string, language: FactCheckLanguage): FactCheckResult {
  return {
    validityVsTruth: message,
    rhetoric: { ethos: '', pathos: '', logos: '' },
    fallacies: [],
    verdict: 'unverified',
    sources: undefined,
  };
}

/**
 * Get a combined summary of all pipeline stages for debugging/logging.
 */
export const getPipelineSummary = (
  parsed: ParsedInput,
  logic: LogicOutput,
  bias: BiasOutput,
  critic: CriticOutput,
): string => {
  return (
    '=== FACT-CHECK PIPELINE SUMMARY ===\n\n' +
    getParsingSummary(parsed) + '\n\n' +
    getLogicSummary(logic) + '\n\n' +
    getBiasSummary(bias) + '\n\n' +
    getCriticSummary(critic)
  );
};