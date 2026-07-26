export {
  callProviders,
  callProvider,
  type ProviderId,
  type FactCheckConfig,
  type ProviderAttempt,
  type FactCheckResponse,
} from './providers';

export {
  runFactCheckPipeline,
  MAX_FACTCHECK_MS,
} from './pipeline';

export {
  normalizeFactCheckConfigs,
  hasFactCheckConfigs,
} from './storage';

export {
  parse,
  runLogic,
  analyzeBias,
  synthesize,
  type ParsedInput,
} from './agents';

export {
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseResult,
  type Verdict,
  type FactCheckLanguage,
  type FactCheckResult,
  type FactCheckResultWithProvider,
  LANGUAGE_LABELS,
} from './prompt';

// NewsAPI.ai provider
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
} from './providers';

// NewsFetcher agent
export {
  fetchRelevantNews,
  extractKeywordsFromClaims,
  filterAndRankArticles,
  type NewsFetcherConfig,
  type NewsFetchResult,
  getNewsFetchSummary,
} from './agents/NewsFetcher';

// Components
export { default as FactCheck } from './components/FactCheck';
export { FactCheckButton, type FactCheckButtonProps } from './components/FactCheckButton';

// Hooks
export { useFactCheckAction, type FactCheckResult as FactCheckActionResult } from './hooks/useFactCheckAction';
export { useFactCheckConfig } from './hooks/useFactCheckConfig';
export { useFactCheckContainers } from './hooks/useFactCheckContainers';
export { useFactCheckRunner, runFactCheck } from './hooks/useFactCheckRunner';
