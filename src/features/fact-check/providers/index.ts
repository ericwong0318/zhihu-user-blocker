// Re-export NewsAPI.ai provider
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
} from './newsapi';