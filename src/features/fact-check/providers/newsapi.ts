/**
 * NewsAPI.ai (Event Registry) Provider
 *
 * This module provides functions to search and fetch news articles from
 * NewsAPI.ai (Event Registry API) for real-time fact-checking evidence.
 *
 * API Documentation: https://newsapi.ai/docs/api
 * Base URL: https://eventregistry.org/api/v1
 */

import { FactCheckLanguage } from '../prompt';

/** NewsAPI.ai configuration */
export interface NewsApiConfig {
  /** API key from NewsAPI.ai (Event Registry) */
  apiKey: string;
  /** Base URL for the API (default: https://eventregistry.org/api/v1) */
  baseUrl?: string;
}

/** Search parameters for NewsAPI.ai article search */
export interface NewsSearchParams {
  /** Keywords to search for (from extracted claims) */
  keywords: string[];
  /** Language of articles (ISO 639-1 code: 'eng', 'chi', etc.) */
  lang?: string;
  /** Maximum number of articles to return (max 100) */
  maxResults?: number;
  /** Days back to search (default: 30) */
  daysBack?: number;
  /** Minimum article relevance score (0-1) */
  minRelevance?: number;
  /** News sources to include (optional) */
  sourceUris?: string[];
  /** Categories to filter by (optional) */
  categories?: string[];
}

/** Normalized news article structure */
export interface NewsArticle {
  /** Unique article URI from NewsAPI.ai */
  uri: string;
  /** Article title */
  title: string;
  /** Article body text (may be truncated) */
  body: string;
  /** Article URL */
  url: string;
  /** Source name */
  source: string;
  /** Source URI */
  sourceUri: string;
  /** Publication date (ISO 8601) */
  date: string;
  /** Language code */
  lang: string;
  /** Relevance score (0-1) */
  relevance: number;
  /** Image URL if available */
  image?: string;
  /** Article concepts/entities */
  concepts?: Array<{ uri: string; label: string; score: number }>;
  /** Article categories */
  categories?: Array<{ uri: string; label: string; score: number }>;
}

/** Search result from NewsAPI.ai */
export interface NewsSearchResult {
  /** Array of matching articles */
  articles: NewsArticle[];
  /** Total number of matching articles */
  totalResults: number;
  /** Search query used */
  query: string;
  /** Time taken for search (ms) */
  searchTimeMs: number;
}

/** Default NewsAPI.ai base URL */
export const DEFAULT_NEWSAPI_URL = 'https://eventregistry.org/api/v1';

/** Default search parameters */
const DEFAULT_SEARCH_PARAMS = {
  maxResults: 20,
  daysBack: 30,
  minRelevance: 0.1,
  lang: 'eng',
};

/**
 * Build search query from keywords
 */
function buildQuery(keywords: string[]): string {
  const query = keywords.slice(0, 10).join(' OR ');
  return query;
}

/**
 * Raw article response from NewsAPI.ai
 */
interface RawNewsApiArticle {
  uri: string;
  title: string;
  body: string;
  url: string;
  source: { title: string; uri: string };
  date: string;
  lang: string;
  sim: number;
  image?: string;
  concepts?: Array<{ uri: string; label: string; score: number }>;
  categories?: Array<{ uri: string; label: string; score: number }>;
}

/**
 * Normalize NewsAPI.ai article response to internal format
 */
export function normalizeNewsApiArticle(raw: RawNewsApiArticle): NewsArticle {
  return {
    uri: raw.uri,
    title: raw.title,
    body: raw.body,
    url: raw.url,
    source: raw.source.title,
    sourceUri: raw.source.uri,
    date: raw.date,
    lang: raw.lang,
    relevance: raw.sim,
    image: raw.image,
    concepts: raw.concepts,
    categories: raw.categories,
  };
}

/**
 * Search NewsAPI.ai for articles matching keywords
 */
export async function searchNewsApi(
  config: NewsApiConfig,
  params: NewsSearchParams
): Promise<NewsSearchResult> {
  const startTime = Date.now();
  const baseUrl = config.baseUrl || DEFAULT_NEWSAPI_URL;
  const query = buildQuery(params.keywords);

  const searchParams = new URLSearchParams({
    apiKey: config.apiKey,
    query,
    lang: params.lang || DEFAULT_SEARCH_PARAMS.lang,
    maxItems: String(params.maxResults || DEFAULT_SEARCH_PARAMS.maxResults),
    daysBack: String(params.daysBack || DEFAULT_SEARCH_PARAMS.daysBack),
    minRelevance: String(params.minRelevance || DEFAULT_SEARCH_PARAMS.minRelevance),
  });

  if (params.sourceUris && params.sourceUris.length > 0) {
    searchParams.append('sourceUri', params.sourceUris.join(','));
  }
  if (params.categories && params.categories.length > 0) {
    searchParams.append('categoryUri', params.categories.join(','));
  }

  const url = `${baseUrl}/article/getArticles?${searchParams.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NewsAPI.ai search failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const articles = (data.articles?.results || []).map(normalizeNewsApiArticle);

  return {
    articles,
    totalResults: data.articles?.totalResults || 0,
    query,
    searchTimeMs: Date.now() - startTime,
  };
}

/**
 * Fetch a single article by URI from NewsAPI.ai
 */
export async function fetchNewsApiArticle(
  config: NewsApiConfig,
  articleUri: string
): Promise<NewsArticle | null> {
  const baseUrl = config.baseUrl || DEFAULT_NEWSAPI_URL;
  const url = `${baseUrl}/article/getArticle?apiKey=${config.apiKey}&uri=${encodeURIComponent(articleUri)}`;

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) return null;
    const errorText = await response.text();
    throw new Error(`NewsAPI.ai fetch failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (!data.article) return null;

  return normalizeNewsApiArticle(data.article);
}

/**
 * Convert FactCheckLanguage to NewsAPI.ai language code
 */
export function factCheckLanguageToNewsApiLang(lang: FactCheckLanguage): string {
  switch (lang) {
    case 'zh-CN':
    case 'zh-TW':
      return 'chi';
    case 'en':
    default:
      return 'eng';
  }
}

/**
 * Check if NewsAPI.ai is configured
 */
export function isNewsApiConfigured(config?: NewsApiConfig): boolean {
  return !!config?.apiKey && config.apiKey.trim().length > 0;
}
