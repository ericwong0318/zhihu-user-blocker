/**
 * NewsFetcher Agent
 *
 * This agent fetches real-time news articles relevant to extracted claims
 * using NewsAPI.ai (Event Registry) to enhance the fact-checking pipeline
 * with current evidence.
 *
 * It follows the same functional pattern as other agents (Parser, Logic, Bias, Critic).
 */

import { ExtractedClaim } from './Parser';
import { FactCheckLanguage } from '../prompt';
import {
  NewsApiConfig,
  NewsArticle,
  NewsSearchParams,
  searchNewsApi,
  factCheckLanguageToNewsApiLang,
  isNewsApiConfigured,
} from '../providers/newsapi';

/** Configuration for NewsFetcher */
export type NewsFetcherConfig = {
  /** NewsAPI.ai configuration */
  newsApi: NewsApiConfig;
  /** Maximum articles to fetch per claim */
  maxArticlesPerClaim?: number;
  /** Maximum total articles to fetch */
  maxTotalArticles?: number;
  /** Minimum relevance threshold (0-1) */
  minRelevance?: number;
  /** Days back to search for articles */
  daysBack?: number;
};

/** Result of news fetching for a set of claims */
export type NewsFetchResult = {
  /** All fetched articles */
  articles: NewsArticle[];
  /** Articles grouped by claim */
  articlesByClaim: Map<string, NewsArticle[]>;
  /** Search metadata */
  metadata: {
    totalSearches: number;
    totalArticlesFound: number;
    totalArticlesReturned: number;
    searchTimeMs: number;
    errors: string[];
  };
};

/** Default configuration */
const DEFAULT_CONFIG = {
  maxArticlesPerClaim: 5,
  maxTotalArticles: 20,
  minRelevance: 0.15,
  daysBack: 30,
};

/**
 * Extract search keywords from claims
 * Prioritizes factual claims and extracts key entities/terms
 */
export function extractKeywordsFromClaims(claims: ExtractedClaim[]): string[] {
  const keywords: string[] = [];
  const seen = new Set<string>();

  // Focus on factual and definition claims for news search
  const relevantClaims = claims.filter(
    c => c.type === 'factual' || c.type === 'definition'
  );

  for (const claim of relevantClaims) {
    // Extract key terms from the claim text
    const terms = extractKeyTerms(claim.text);
    
    for (const term of terms) {
      const normalized = term.toLowerCase().trim();
      if (normalized.length >= 3 && !seen.has(normalized)) {
        seen.add(normalized);
        keywords.push(term);
      }
    }
  }

  // Also add high-confidence opinion/prediction claims if we need more keywords
  if (keywords.length < 3) {
    const otherClaims = claims.filter(
      c => c.type === 'opinion' || c.type === 'prediction'
    ).sort((a, b) => b.confidence - a.confidence);

    for (const claim of otherClaims) {
      const terms = extractKeyTerms(claim.text);
      for (const term of terms) {
        const normalized = term.toLowerCase().trim();
        if (normalized.length >= 3 && !seen.has(normalized)) {
          seen.add(normalized);
          keywords.push(term);
        }
      }
      if (keywords.length >= 8) break;
    }
  }

  return keywords.slice(0, 10); // Limit to 10 keywords max
}

/**
 * Extract key terms from text for news search
 */
function extractKeyTerms(text: string): string[] {
  // Remove common stop words and extract meaningful terms
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
    'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we',
    'us', 'our', 'i', 'me', 'my', 'you', 'your', 'he', 'him', 'his', 'she',
    'her', 'not', 'no', 'yes', 'very', 'really', 'quite', 'just', 'only',
    'even', 'still', 'already', 'yet', 'also', 'then', 'than', 'so', 'such',
    'what', 'which', 'who', 'when', 'where', 'why', 'how', 'about', 'into',
    'over', 'under', 'again', 'more', 'most', 'some', 'any', 'all', 'each',
    'every', 'few', 'many', 'much', 'other', 'another', 'own', 'same',
    'different', 'said', 'says', 'say', 'according', 'accordingly',
  ]);

  // Extract words (including compound terms with hyphens)
  const words = text
    .toLowerCase()
    .replace(/[^\w\s\-']/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .filter(w => !/^\d+$/.test(w)) // Filter out pure numbers
    .slice(0, 15);

  // Also try to extract quoted phrases as potential exact matches
  const quotedPhrases = text.match(/"([^"]+)"/g) || [];
  const phrases = quotedPhrases.map(p => p.slice(1, -1)).filter(p => p.length > 3);

  return [...words, ...phrases];
}

/**
 * Filter and rank articles by relevance to claims
 */
export function filterAndRankArticles(
  articles: NewsArticle[],
  claims: ExtractedClaim[]
): NewsArticle[] {
  if (articles.length === 0 || claims.length === 0) return [];

  // Score each article based on relevance to claims
  const scoredArticles = articles.map(article => {
    let score = article.relevance; // Base score from API

    // Boost score based on keyword matches in title and body
    const searchText = `${article.title} ${article.body}`.toLowerCase();
    
    for (const claim of claims) {
      const claimTerms = extractKeyTerms(claim.text);
      let matchCount = 0;
      
      for (const term of claimTerms) {
        if (searchText.includes(term.toLowerCase())) {
          matchCount++;
        }
      }
      
      // Boost based on term matches
      if (matchCount > 0) {
        score += Math.min(0.3, matchCount * 0.05);
      }

      // Boost for high-confidence claims
      if (claim.confidence > 0.7) {
        score += 0.1;
      }
    }

    // Boost for recent articles
    const articleDate = new Date(article.date);
    const daysOld = (Date.now() - articleDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 7) score += 0.1;
    else if (daysOld < 30) score += 0.05;

    // Boost for reputable sources
    const reputableDomains = [
      'reuters.com', 'apnews.com', 'bbc.com', 'nytimes.com', 'washingtonpost.com',
      'theguardian.com', 'wsj.com', 'ft.com', 'economist.com', 'bloomberg.com',
      'cnn.com', 'nbcnews.com', 'abcnews.go.com', 'cbsnews.com', 'npr.org',
      'pbs.org', 'abc.net.au', 'smh.com.au', 'theage.com.au', 'scmp.com',
      'globaltimes.cn', 'chinadaily.com.cn', 'xinhuanet.com', 'people.com.cn',
    ];
    
    const url = article.url.toLowerCase();
    if (reputableDomains.some(d => url.includes(d))) {
      score += 0.15;
    }

    return { article, score };
  });

  // Sort by score descending
  scoredArticles.sort((a, b) => b.score - a.score);

  // Deduplicate by URL (keep highest scored)
  const seenUrls = new Set<string>();
  const uniqueArticles: NewsArticle[] = [];
  
  for (const { article } of scoredArticles) {
    const urlKey = article.url.toLowerCase().split('?')[0].split('#')[0];
    if (!seenUrls.has(urlKey)) {
      seenUrls.add(urlKey);
      uniqueArticles.push(article);
    }
  }

  return uniqueArticles;
}

/**
 * Fetch relevant news articles for a set of claims
 */
export async function fetchRelevantNews(
  claims: ExtractedClaim[],
  config: NewsFetcherConfig,
  language: FactCheckLanguage = 'en',
  signal?: AbortSignal
): Promise<NewsFetchResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  
  // Validate configuration
  if (!isNewsApiConfigured(config.newsApi)) {
    return {
      articles: [],
      articlesByClaim: new Map(),
      metadata: {
        totalSearches: 0,
        totalArticlesFound: 0,
        totalArticlesReturned: 0,
        searchTimeMs: 0,
        errors: ['NewsAPI.ai is not configured (missing API key)'],
      },
    };
  }

  const effectiveConfig = { ...DEFAULT_CONFIG, ...config };
  const keywords = extractKeywordsFromClaims(claims);
  
  if (keywords.length === 0) {
    return {
      articles: [],
      articlesByClaim: new Map(),
      metadata: {
        totalSearches: 0,
        totalArticlesFound: 0,
        totalArticlesReturned: 0,
        searchTimeMs: 0,
        errors: ['No keywords extracted from claims'],
      },
    };
  }

  const lang = factCheckLanguageToNewsApiLang(language);
  const articlesByClaim = new Map<string, NewsArticle[]>();
  let totalArticlesFound = 0;

  // Search for articles using combined keywords (more efficient)
  const searchParams: NewsSearchParams = {
    keywords,
    lang,
    maxResults: effectiveConfig.maxTotalArticles,
    daysBack: effectiveConfig.daysBack,
    minRelevance: effectiveConfig.minRelevance,
  };

  try {
    const result = await searchNewsApi(config.newsApi, searchParams);
    totalArticlesFound += result.totalResults;
    
    // Filter and rank articles
    const rankedArticles = filterAndRankArticles(result.articles, claims);
    const limitedArticles = rankedArticles.slice(0, effectiveConfig.maxTotalArticles);
    
    // Distribute articles to claims
    for (const claim of claims) {
      const claimKeywords = extractKeyTerms(claim.text);
      const claimArticles = limitedArticles.filter(article => {
        const searchText = `${article.title} ${article.body}`.toLowerCase();
        return claimKeywords.some(kw => searchText.includes(kw.toLowerCase()));
      }).slice(0, effectiveConfig.maxArticlesPerClaim);
      
      articlesByClaim.set(claim.text, claimArticles);
    }
    
    const allArticles = Array.from(articlesByClaim.values()).flat();
    const uniqueArticles = Array.from(new Map(allArticles.map(a => [a.url, a])).values());
    
    return {
      articles: uniqueArticles,
      articlesByClaim,
      metadata: {
        totalSearches: 1,
        totalArticlesFound,
        totalArticlesReturned: uniqueArticles.length,
        searchTimeMs: Date.now() - startTime,
        errors,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    errors.push(err instanceof Error ? err.message : String(err));
    return {
      articles: [],
      articlesByClaim: new Map(),
      metadata: {
        totalSearches: 1,
        totalArticlesFound: 0,
        totalArticlesReturned: 0,
        searchTimeMs: Date.now() - startTime,
        errors,
      },
    };
  }
}

/**
 * Get a summary of the news fetch result for logging/debugging
 */
export function getNewsFetchSummary(result: NewsFetchResult): string {
  return (
    `NewsFetcher Summary:\n` +
    `  Keywords searched: ${result.metadata.totalSearches} query(s)\n` +
    `  Articles found: ${result.metadata.totalArticlesFound}\n` +
    `  Articles returned: ${result.metadata.totalArticlesReturned}\n` +
    `  Claims with articles: ${result.articlesByClaim.size}\n` +
    `  Search time: ${result.metadata.searchTimeMs}ms\n` +
    (result.metadata.errors.length > 0
      ? `  Errors: ${result.metadata.errors.join('; ')}`
      : '')
  );
}