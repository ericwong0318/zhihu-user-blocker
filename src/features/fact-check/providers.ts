// Provider dispatch for the online AI fact-check feature. Each provider
// receives the SAME shared prompt (see prompt.ts) so the analysis framework
// (Validity/Truth, Ethos/Pathos/Logos, Fallacies) is consistent. The background
// service worker calls callProviders(); the content script never sees the key.
//
// Users can configure MULTIPLE providers in a preferred order. callProviders
// tries each in turn and falls back to the next one when a provider fails
// (network error, bad key, rate limit, server error, etc.).

import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseResult,
  FactCheckResult,
  FactCheckLanguage,
} from './prompt';
import { logError, logWarn, logAiProvider } from '../../features/logging';
import {
  type NewsApiConfig,
  type NewsSearchParams,
  type NewsArticle,
  type NewsSearchResult,
  searchNewsApi,
  fetchNewsApiArticle,
  factCheckLanguageToNewsApiLang,
  isNewsApiConfigured,
  DEFAULT_NEWSAPI_URL,
} from './providers/newsapi';

export type ProviderId =
  | 'claude'
  | 'local'
  | 'gemini'
  | 'openai'
  | 'deepseek'
  | 'openrouter'
  | 'other';

export type FactCheckConfig = {
  provider: ProviderId;
  // API key for cloud providers. "local" and "other" may omit it.
  apiKey?: string;
  // Model name, e.g. "claude-3-5-sonnet-latest", "llama3.1", "deepseek-chat".
  model?: string;
  // Base URL override (used by "local" and "other").
  baseUrl?: string;
  // Language the AI reply should be written in.
  language?: FactCheckLanguage;
  // Per-provider request timeout in seconds. Default: 3600 (1 hour).
  timeoutSec?: number;
};

// One failed attempt, recorded so the user can see WHY each provider was skipped.
export type ProviderAttempt = { provider: ProviderId; error: string };

export type FactCheckResponse =
  | { ok: true; result: FactCheckResult; provider: ProviderId }
  | { ok: false; error: string; attempts: ProviderAttempt[] };

const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1';
const DEFAULT_OPENAI_URL = 'https://api.openai.com/v1';
const DEFAULT_DEEPSEEK_URL = 'https://api.deepseek.com/v1';
const DEFAULT_OPENROUTER_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OTHER_URL = 'https://api.openai.com/v1';

// Return true if the base URL points to a local/private address that typically
// doesn't require (or rejects) an Authorization header (e.g. Ollama, LocalAI).
const isLocalUrl = (baseUrl: string): boolean => {
  try {
    const url = new URL(baseUrl);
    const host = url.hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.startsWith('172.16.') ||
      host.startsWith('172.17.') ||
      host.startsWith('172.18.') ||
      host.startsWith('172.19.') ||
      host.startsWith('172.20.') ||
      host.startsWith('172.21.') ||
      host.startsWith('172.22.') ||
      host.startsWith('172.23.') ||
      host.startsWith('172.24.') ||
      host.startsWith('172.25.') ||
      host.startsWith('172.26.') ||
      host.startsWith('172.27.') ||
      host.startsWith('172.28.') ||
      host.startsWith('172.29.') ||
      host.startsWith('172.30.') ||
      host.startsWith('172.31.')
    );
  } catch {
    return false;
  }
};

// Output token budget for OpenAI-compatible providers. Caps response length
// (not thinking time) and helps avoid runaway generation. Claude already sets
// max_tokens: 1500 in its own branch.
const OPENAI_MAX_TOKENS = 1500;

// Turn a non-OK provider HTTP response into a clean, user-facing error message.
// Provider error bodies are often raw JSON (e.g. {"error":{"message":...}}); we
// extract the meaningful text instead of dumping the whole payload to the user.
const formatProviderError = (status: number, detail: string): string => {
  let message = '';
  try {
    const parsed = JSON.parse(detail);
    const errObj = parsed?.error ?? parsed;
    message =
      errObj?.message ||
      errObj?.error?.message ||
      (typeof errObj === 'string' ? errObj : '');
  } catch {
    message = detail.trim();
  }
  message = message.slice(0, 200).trim();

  if (status === 429) {
    return `Rate limit exceeded. ${message || 'The provider has reached its request limit.'} Try again later or upgrade your plan.`;
  }
  if (status === 401 || status === 403) {
    return `Authentication failed (${status}). ${message || 'Check your API key in Options.'}`;
  }
  if (status === 404) {
    return `Provider endpoint not found (404). ${message || 'Check the model name and base URL in Options.'}`;
  }
  if (status >= 500) {
    return `The provider returned a server error (${status}). ${message || 'Please try again later.'}`;
  }
  return `Provider returned ${status}. ${message || 'Please try again.'}`;
};

// Shape of a single content block in a Claude messages response.
type ClaudeContentBlock = { type: string; text?: string };
// Shape of a single part in a Gemini generateContent response.
type GeminiPart = { text?: string };

// Pull the textual completion out of each provider's response shape.
const extractText = (provider: ProviderId, data: unknown): string => {
  if (provider === 'claude') {
    // data.content is an array of blocks; concatenate text blocks.
    const blocks: ClaudeContentBlock[] = Array.isArray(
      (data as { content?: unknown }).content,
    )
      ? (data as { content: ClaudeContentBlock[] }).content
      : [];
    return blocks
      .filter((b) => b?.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n');
  }
  if (provider === 'gemini') {
    const parts: GeminiPart[] =
      (data as { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> })
        ?.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p?.text ?? '').join('\n');
  }
  // All OpenAI-compatible providers (local, openai, deepseek, openrouter,
  // other) return choices[0].message.content.
  return (
    (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
      ?.message?.content ?? ''
  );
};

// Call a SINGLE provider. Returns ok:false (never throws) so callProviders can
// decide whether to fall back. The request is not time-limited — the AI provider
// may take as long as it needs. The AbortController is only used for external
// cancellation (e.g. when the user closes the popover or the port disconnects).
export const callProvider = async (
  text: string,
  question: string | undefined,
  config: FactCheckConfig,
  signal?: AbortSignal,
): Promise<FactCheckResponse> => {
  if (!config || !config.provider) {
    return {
      ok: false,
      error: 'No fact-check provider configured.',
      attempts: [],
    };
  }

  const userPrompt = buildUserPrompt(text, question, config.language);
  const model = config.model || defaultModel(config.provider);
  const startTime = Date.now();

  // Log connection attempt
  logAiProvider('info', `Connecting to AI provider "${config.provider}"`, 'fact-check', {
    provider: config.provider,
    model,
    status: 'connecting',
    attemptNumber: 1,
    requestBody: { model, max_tokens: config.provider === 'claude' ? 2500 : OPENAI_MAX_TOKENS, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }] },
    providerSequence: 1,
  });

  try {
    let url: string;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    let body: string;

    switch (config.provider) {
      case 'claude': {
        if (!config.apiKey)
          return {
            ok: false,
            error: 'Claude API key is missing.',
            attempts: [
              { provider: 'claude', error: 'Claude API key is missing.' },
            ],
          };
        url = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = config.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = JSON.stringify({
          model,
          max_tokens: 2500,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        });
        break;
      }
      case 'gemini': {
        if (!config.apiKey)
          return {
            ok: false,
            error: 'Gemini API key is missing.',
            attempts: [
              { provider: 'gemini', error: 'Gemini API key is missing.' },
            ],
          };
        const base =
          config.baseUrl || 'https://generativelanguage.googleapis.com';
        url = `${base}/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
        body = JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        });
        break;
      }
      case 'local': {
        // OpenAI-compatible local server (Ollama, local Qwen/DashScope, llama.cpp, …).
        // No key required by default; base URL is configurable.
        const base = (config.baseUrl || DEFAULT_LOCAL_URL).replace(/\/$/, '');
        url = `${base}/chat/completions`;
        // Skip Authorization header for local URLs (Ollama, LocalAI, etc.) which
        // typically don't require or reject Bearer tokens.
        if (config.apiKey && !isLocalUrl(base)) {
          headers.Authorization = `Bearer ${config.apiKey}`;
        }
        body = JSON.stringify({
          model,
          max_tokens: OPENAI_MAX_TOKENS,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });
        break;
      }
      case 'other': {
        const base = (config.baseUrl || DEFAULT_OTHER_URL).replace(/\/$/, '');
        url = `${base}/chat/completions`;
        // Skip Authorization header for local URLs (Ollama, LocalAI, etc.) which
        // typically don't require or reject Bearer tokens.
        if (config.apiKey && !isLocalUrl(base)) {
          headers.Authorization = `Bearer ${config.apiKey}`;
        }
        body = JSON.stringify({
          model,
          max_tokens: OPENAI_MAX_TOKENS,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });
        break;
      }
      case 'openai': {
        if (!config.apiKey)
          return {
            ok: false,
            error: 'OpenAI API key is missing.',
            attempts: [
              { provider: 'openai', error: 'OpenAI API key is missing.' },
            ],
          };
        const base = (config.baseUrl || DEFAULT_OPENAI_URL).replace(/\/$/, '');
        url = `${base}/chat/completions`;
        headers.Authorization = `Bearer ${config.apiKey}`;
        body = JSON.stringify({
          model,
          max_tokens: OPENAI_MAX_TOKENS,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });
        break;
      }
      case 'deepseek': {
        if (!config.apiKey)
          return {
            ok: false,
            error: 'DeepSeek API key is missing.',
            attempts: [
              { provider: 'deepseek', error: 'DeepSeek API key is missing.' },
            ],
          };
        const base = (config.baseUrl || DEFAULT_DEEPSEEK_URL).replace(
          /\/$/,
          '',
        );
        url = `${base}/chat/completions`;
        headers.Authorization = `Bearer ${config.apiKey}`;
        body = JSON.stringify({
          model,
          max_tokens: OPENAI_MAX_TOKENS,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });
        break;
      }
      case 'openrouter': {
        if (!config.apiKey)
          return {
            ok: false,
            error: 'OpenRouter API key is missing.',
            attempts: [
              {
                provider: 'openrouter',
                error: 'OpenRouter API key is missing.',
              },
            ],
          };
        const base = (config.baseUrl || DEFAULT_OPENROUTER_URL).replace(
          /\/$/,
          '',
        );
        url = `${base}/chat/completions`;
        headers.Authorization = `Bearer ${config.apiKey}`;
        body = JSON.stringify({
          model,
          max_tokens: OPENAI_MAX_TOKENS,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });
        break;
      }
      default:
        return { ok: false, error: 'Unknown provider.', attempts: [] };
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    // Per-provider timeout (default 180s = 3 minutes)
    const timeoutMs = (config.timeoutSec ?? 180) * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      if (signal?.aborted) {
        throw new Error('Fact-check request cancelled.');
      }
      res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onAbort);
      const aborted = controller.signal.aborted;
      const error = aborted
        ? 'Fact-check request timed out.'
        : err instanceof Error
          ? err.message
          : String(err);
      const durationMs = Date.now() - startTime;
      
      // Log timeout or connection failure
      logAiProvider('error', `AI provider "${config.provider}" ${aborted ? 'timed out' : 'connection failed'}`, 'fact-check', {
        provider: config.provider,
        model,
        prompt: userPrompt,
        durationMs,
        status: aborted ? 'timeout' : 'failed',
      });
      
      // Surface connection failures so they are visible in the log.
      logError(
        `Fact-check provider "${config.provider}" request failed`,
        error,
      );
      return {
        ok: false,
        error,
        attempts: [{ provider: config.provider, error }],
      };
    }
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const error = formatProviderError(res.status, detail);
      const durationMs = Date.now() - startTime;
      
      // Log HTTP error response
      logAiProvider('error', `AI provider "${config.provider}" returned HTTP ${res.status}`, 'fact-check', {
        provider: config.provider,
        model,
        prompt: userPrompt,
        response: detail,
        durationMs,
        status: 'failed',
      });
      
      logWarn(
        `Fact-check provider "${config.provider}" returned an error`,
        error,
      );
      return {
        ok: false,
        error,
        attempts: [{ provider: config.provider, error }],
      };
    }

    const data = await res.json();
    const raw = extractText(config.provider, data);
    const durationMs = Date.now() - startTime;
    
    // Log successful response
    logAiProvider('ai-provider', `AI provider "${config.provider}" completed successfully`, 'fact-check', {
      provider: config.provider,
      model,
      prompt: userPrompt,
      response: raw,
      durationMs,
      status: 'success',
    });
    
    return { ok: true, result: parseResult(raw), provider: config.provider };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;
    
    // Log error
    logAiProvider('error', `AI provider "${config.provider}" failed`, 'fact-check', {
      provider: config.provider,
      model,
      prompt: userPrompt,
      durationMs,
      status: 'failed',
    });
    
    return {
      ok: false,
      error,
      attempts: [{ provider: config.provider, error }],
    };
  }
};

// Try each configured provider in order, falling back to the next one when a
// provider fails. Returns the first successful result, or an aggregated error
// listing every failed attempt if all providers fail.
/**
 * Report the current provider attempt to the UI. `isRetry` is true when this is
 * a fallback attempt after a previous provider failed.
 */
type StageReporter = (stage: string, isRetry: boolean) => void;

export const callProviders = async (
  text: string,
  question: string | undefined,
  configs: FactCheckConfig[],
  onStage?: StageReporter,
  signal?: AbortSignal,
): Promise<FactCheckResponse> => {
  const attempts: ProviderAttempt[] = [];
  let isRetry = false;

  for (const cfg of configs || []) {
    if (signal?.aborted) {
      return { ok: false, error: 'Fact-check request cancelled.', attempts };
    }
    if (!cfg || !cfg.provider) continue;
    const model = cfg.model ? ` (${cfg.model})` : '';
    onStage?.(`Contacting ${cfg.provider}${model}…`, isRetry);
    const res = await callProvider(text, question, cfg, signal);
    if (signal?.aborted) {
      return res.ok
        ? res
        : {
            ok: false,
            error: 'Fact-check request cancelled.',
            attempts: [...attempts, ...res.attempts],
          };
    }
    if (res.ok) return res;
    attempts.push(...res.attempts);
    // Announce the fallback so the UI can show the next provider.
    onStage?.(`${cfg.provider} failed — trying next provider…`, true);
    isRetry = true;
  }

  if (attempts.length === 0) {
    return {
      ok: false,
      error: 'No fact-check provider configured.',
      attempts: [],
    };
  }

  const summary = attempts
    .map((a) => `${a.provider}: ${a.error}`)
    .join('  •  ');
  return {
    ok: false,
    error: `All providers failed. ${summary}`,
    attempts,
  };
};

const defaultModel = (provider: ProviderId): string => {
  switch (provider) {
    case 'claude':
      return 'claude-3-5-sonnet-latest';
    case 'gemini':
      return 'gemini-1.5-flash';
    case 'local':
      return 'llama3.1';
    case 'openrouter':
      return 'openai/gpt-4o-mini';
    case 'openai':
      return 'gpt-4o-mini';
    case 'deepseek':
      return 'deepseek-chat';
    case 'other':
      return 'gpt-4o-mini';
  }
};

// Re-export NewsAPI.ai types and functions for external use
export {
  type NewsApiConfig,
  type NewsSearchParams,
  type NewsArticle,
  type NewsSearchResult,
  searchNewsApi,
  fetchNewsApiArticle,
  factCheckLanguageToNewsApiLang,
  isNewsApiConfigured,
  DEFAULT_NEWSAPI_URL,
} from './providers/newsapi';
