/**
 * Agent 1 – De-Noiser & Claim Extractor
 *
 * This module provides a comprehensive implementation that prepares the
 * raw Zhihu answer text for downstream processing. It handles:
 * - Text cleaning (whitespace, line breaks, markdown normalization)
 * - URL extraction and validation
 * - Markdown element extraction (headers, lists, code blocks, tables)
 * - Claim extraction (factual statements, opinions, questions)
 * - Resource extraction (links, citations, images, tables)
 * - Language detection (basic)
 */

import { FactCheckLanguage } from '../prompt';

/** Internal language hint type - accepts 'zh' as shorthand for 'zh-CN' */
export type LanguageHint = FactCheckLanguage | 'zh';

export type ParsedInput = {
  /** Cleaned text ready for the next stage */
  cleanedText: string;
  /** Extracted URLs with metadata */
  urls: ExtractedUrl[];
  /** Extracted markdown elements */
  markdownElements: MarkdownElement[];
  /** Extracted claims (factual statements that can be verified) */
  claims: ExtractedClaim[];
  /** Extracted resources (images, tables, citations) */
  resources: ExtractedResource[];
  /** Detected language of the text */
  detectedLanguage: FactCheckLanguage;
  /** Statistics about the parsed content */
  stats: ParsingStats;
};

export type ExtractedUrl = {
  url: string;
  title?: string;
  context?: string; // Surrounding text for context
  isLikelyCitation: boolean;
};

export type MarkdownElement = {
  type: 'header' | 'list' | 'codeBlock' | 'blockquote' | 'table' | 'horizontalRule' | 'image';
  level?: number; // For headers: 1-6
  content: string;
  rawMarkdown: string;
  lineStart: number;
  lineEnd: number;
  metadata?: Record<string, string>;
};

export type ExtractedClaim = {
  text: string;
  type: 'factual' | 'opinion' | 'question' | 'prediction' | 'definition';
  confidence: number; // 0-1
  position: { start: number; end: number };
  supportingUrls: string[];
};

export type ExtractedResource = {
  type: 'image' | 'table' | 'citation' | 'video' | 'code';
  content: string;
  metadata?: Record<string, string>;
  position: { start: number; end: number };
};

export type ParsingStats = {
  originalLength: number;
  cleanedLength: number;
  urlCount: number;
  claimCount: number;
  markdownElementCount: number;
  resourceCount: number;
  languageConfidence: number;
};

/**
 * URL regex pattern - matches HTTP/HTTPS URLs
 */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;

/**
 * Clean trailing punctuation from URLs
 */
function cleanUrl(url: string): string {
  return url.replace(/[.,;:!?)\]](?:\s|$)/g, '').trim();
}

/**
 * Markdown header regex
 */
const HEADER_REGEX = /^(#{1,6})\s+(.+)$/gm;

/**
 * Markdown list regex (ordered and unordered)
 */
const LIST_REGEX = /^(\s*)([-*+]|\d+\.)\s+(.+)$/gm;

/**
 * Markdown code block regex
 */
const CODE_BLOCK_REGEX = /```(\w+)?\n([\s\S]*?)```/g;

/**
 * Markdown blockquote regex
 */
const BLOCKQUOTE_REGEX = /^>\s*(.+)$/gm;

/**
 * Markdown table regex - matches complete markdown tables
 */
const TABLE_REGEX = /^\|.+\|\n\|[-:| ]+\|\n(?:\|.+\|\n?)+/gm;

/**
 * Markdown image regex
 */
const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Markdown link regex (non-image)
 */
const LINK_REGEX = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Chinese punctuation and characters for language detection
 */
const CHINESE_PUNCTUATION = /[，。；：？！、《》""''（）【】〔〕]/g;
const CHINESE_CHARS = /[\u4e00-\u9fff]/g;

/**
 * Claim detection patterns
 */
const FACTUAL_CLAIM_PATTERNS = [
  /(?:research|study|data|statistics?|evidence|proof|survey|report)s?\s+(?:show|indicate|suggest|prove|demonstrate|reveal)/i,
  /(?:according to|cited in|published in|reported by|stated by)\s+/i,
  /\d+(?:\.\d+)?%\s+(?:of|people|users|participants|respondents)/i,
  /(?:in|during)\s+(?:20\d{2}|19\d{2})/i,
  /(?:study|experiment|analysis|investigation)\s+(?:found|showed|revealed|indicated)/i,
];

const OPINION_PATTERNS = [
  /(?:i think|i believe|in my opinion|personally|i feel|it seems to me)/i,
  /(?:should|must|ought to|need to|have to)\s+\w+/i,
  /(?:best|worst|better|worse|superior|inferior)\s+(?:option|choice|way|method|approach)/i,
];

const QUESTION_PATTERNS = [
  /\?\s*$/,
  /^(?:why|how|what|when|where|who|which)\s+/i,
  /(?:wonder|curious|question)\b/i,
];

const PREDICTION_PATTERNS = [
  /(?:will|would|going to|likely to|expected to|predicted to|forecast)\s+\w+/i,
  /(?:in the future|eventually|someday|soon)\b/i,
];

const DEFINITION_PATTERNS = [
  /(?:is|are|means|refers to|defined as|defined by)\s+/i,
  /(?:definition|meaning of)\s+/i,
];

/**
 * De-noise the raw answer and extract structured information.
 *
 * @param raw   The original answer/question text from Zhihu.
 * @param lang  The language selected UI language (used as hint for language detection).
 * @returns     An object containing the cleaned text and extracted structured data.
 */
export const parse = (
  raw: string,
  lang: LanguageHint = 'en',
): ParsedInput => {
  const originalLength = raw.length;

  // 1. Basic cleaning
  const cleaned = cleanText(raw);

  // 2. Extract URLs with context
  const urls = extractUrls(raw);

  // 3. Extract markdown elements
  const markdownElements = extractMarkdownElements(raw);

  // 4. Extract claims
  const claims = extractClaims(cleaned, urls.map(u => u.url));

  // 5. Extract resources (images, tables, etc.)
  const resources = extractResources(raw);

  // 6. Detect language (use hint if provided and not 'en')
  // Normalize 'zh' to 'zh-CN' for backwards compatibility
  const normalizedLang = lang === 'zh' ? 'zh-CN' : lang;
  const effectiveHint = normalizedLang === 'zh-CN' || normalizedLang === 'zh-TW' ? normalizedLang : 'en';
  const detectedLanguage = effectiveHint !== 'en' ? effectiveHint : detectLanguage(cleaned, effectiveHint);

  // 7. Compute stats
  const stats: ParsingStats = {
    originalLength,
    cleanedLength: cleaned.length,
    urlCount: urls.length,
    claimCount: claims.length,
    markdownElementCount: markdownElements.length,
    resourceCount: resources.length,
    languageConfidence: detectedLanguage === lang ? 0.9 : 0.5,
  };

  return {
    cleanedText: cleaned,
    urls,
    markdownElements,
    claims,
    resources,
    detectedLanguage,
    stats,
  };
};

/**
 * Clean the raw text: trim, normalize whitespace, handle markdown
 */
function cleanText(raw: string): string {
  let text = raw;

  // Normalize line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Trim leading/trailing whitespace
  text = text.trim();

  // Collapse multiple consecutive blank lines (3+ -> 2)
  text = text.replace(/\n{3,}/g, '\n\n');

  // Normalize spaces (but preserve intentional indentation in code blocks)
  // We'll handle this more carefully by not normalizing inside code blocks
  const lines = text.split('\n');
  const processedLines = lines.map((line, i) => {
    // Don't trim lines that look like code (start with 4 spaces or tab)
    if (/^(\s{4}|\t)/.test(line)) {
      return line;
    }
    // Don't trim lines inside list items excessively
    if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      return line.replace(/^\s+/, '').replace(/\s+$/, '');
    }
    return line.trim();
  });

  return processedLines.join('\n');
}

/**
 * Extract URLs with surrounding context
 */
function extractUrls(text: string): ExtractedUrl[] {
  const urls: ExtractedUrl[] = [];
  let match;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const rawUrl = match[0];
    const url = cleanUrl(rawUrl);
    const start = match.index;
    const end = start + url.length;

    // Get surrounding context (50 chars before and after)
    const contextStart = Math.max(0, start - 50);
    const contextEnd = Math.min(text.length, end + 50);
    const context = text.slice(contextStart, contextEnd).trim();

    // Check if it looks like a citation (in brackets, parentheses, or reference format)
    const beforeChar = text[start - 1] || '';
    const afterChar = text[end] || '';
    const isLikelyCitation =
      /[\[\(]/.test(beforeChar) ||
      /[\]\)]/.test(afterChar) ||
      context.includes('source') ||
      context.includes('reference') ||
      context.includes('citation') ||
      context.includes('ref') ||
      context.includes('来源') ||
      context.includes('参考');

    // Try to extract title from markdown link format - search entire text
    let title: string | undefined;
    const LINK_REGEX_WITH_URL = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/;
    const linkMatch = LINK_REGEX_WITH_URL.exec(text);
    if (linkMatch && linkMatch[2]) {
      const linkUrl = linkMatch[2].replace(/\/$/, '').split(/[?#]/)[0];
      const cleanExtractedUrl = url.replace(/\/$/, '').split(/[?#]/)[0];
      if (linkUrl === cleanExtractedUrl || linkUrl.includes(cleanExtractedUrl)) {
        title = linkMatch[1];
      }
    }

    urls.push({
      url,
      title,
      context,
      isLikelyCitation,
    });
  }

  // Deduplicate URLs
  const seen = new Set<string>();
  return urls.filter(u => {
    if (seen.has(u.url)) return false;
    seen.add(u.url);
    return true;
  });
}

/**
 * Extract markdown elements with position info
 */
function extractMarkdownElements(text: string): MarkdownElement[] {
  const elements: MarkdownElement[] = [];
  const seenTables = new Set<string>();

  // Headers
  let headerMatch;
  while ((headerMatch = HEADER_REGEX.exec(text)) !== null) {
    const level = headerMatch[1].length;
    const lineStart = text.substring(0, headerMatch.index).split('\n').length - 1;
    elements.push({
      type: 'header',
      level,
      content: headerMatch[2].trim(),
      rawMarkdown: headerMatch[0],
      lineStart,
      lineEnd: lineStart,
    });
  }

  // Code blocks
  let codeMatch;
  while ((codeMatch = CODE_BLOCK_REGEX.exec(text)) !== null) {
    const lineStart = text.substring(0, codeMatch.index).split('\n').length - 1;
    const lineEnd = lineStart + codeMatch[2].split('\n').length;
    elements.push({
      type: 'codeBlock',
      content: codeMatch[2].trim(),
      rawMarkdown: codeMatch[0],
      lineStart,
      lineEnd,
      metadata: { language: codeMatch[1] || 'unknown' },
    });
  }

  // Lists
  let listMatch;
  while ((listMatch = LIST_REGEX.exec(text)) !== null) {
    const lineStart = text.substring(0, listMatch.index).split('\n').length - 1;
    elements.push({
      type: 'list',
      content: listMatch[3].trim(),
      rawMarkdown: listMatch[0],
      lineStart,
      lineEnd: lineStart,
    });
  }

  // Blockquotes
  let bqMatch;
  while ((bqMatch = BLOCKQUOTE_REGEX.exec(text)) !== null) {
    const lineStart = text.substring(0, bqMatch.index).split('\n').length - 1;
    elements.push({
      type: 'blockquote',
      content: bqMatch[1].trim(),
      rawMarkdown: bqMatch[0],
      lineStart,
      lineEnd: lineStart,
    });
  }

  // Tables (with deduplication)
  let tableMatch;
  while ((tableMatch = TABLE_REGEX.exec(text)) !== null) {
    const tableKey = tableMatch[0];
    if (!seenTables.has(tableKey)) {
      seenTables.add(tableKey);
      const headerLine = tableMatch[0].split('\n')[0];
      const lineStart = text.substring(0, tableMatch.index).split('\n').length - 1;
      elements.push({
        type: 'table',
        content: `Header: ${headerLine}`,
        rawMarkdown: tableMatch[0],
        lineStart,
        lineEnd: lineStart + tableMatch[0].split('\n').length,
      });
    }
  }

  // Images
  let imgMatch;
  while ((imgMatch = IMAGE_REGEX.exec(text)) !== null) {
    const lineStart = text.substring(0, imgMatch.index).split('\n').length - 1;
    elements.push({
      type: 'image',
      content: `Alt: ${imgMatch[1]}, URL: ${imgMatch[2]}`,
      rawMarkdown: imgMatch[0],
      lineStart,
      lineEnd: lineStart,
    });
  }

  // Horizontal rules
  const hrRegex = /^[-*_]{3,}$/gm;
  let hrMatch;
  while ((hrMatch = hrRegex.exec(text)) !== null) {
    const lineStart = text.substring(0, hrMatch.index).split('\n').length - 1;
    elements.push({
      type: 'horizontalRule',
      content: '---',
      rawMarkdown: hrMatch[0],
      lineStart,
      lineEnd: lineStart,
    });
  }

  // Sort by position
  return elements.sort((a, b) => a.lineStart - b.lineStart);
}

/**
 * Extract claims from cleaned text
 */
function extractClaims(text: string, urls: string[]): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];
  
  // Use the sentence splitter
  const sentences = splitIntoSentences(text);
  
  let currentPos = 0;
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) continue;

    // Find the sentence position by searching from current position
    const start = text.indexOf(trimmed, currentPos);
    if (start === -1) continue;
    const end = start + trimmed.length;
    currentPos = end;

    // Skip very short sentences (lowered threshold for better coverage)
    // But allow shorter sentences if they have strong claim indicators
    const hasStrongIndicators = /\d+%|study|research|shows|proves|evidence|According|published/i.test(trimmed);
    if (trimmed.length < 15 && !hasStrongIndicators) continue;

    const claimType = classifyClaim(trimmed);
    const confidence = calculateClaimConfidence(trimmed, claimType);
    const supportingUrls = findSupportingUrls(trimmed, urls);

    if (confidence >= 0.1) {
      // Include claims that meet minimum threshold
      claims.push({
        text: trimmed,
        type: claimType,
        confidence,
        position: { start, end },
        supportingUrls,
      });
    }
  }
  
  // If no claims found, try without sentence splitting
  if (claims.length === 0 && text.trim().length > 0) {
    const fullText = text.trim();
    const claimType = classifyClaim(fullText);
    const confidence = calculateClaimConfidence(fullText, claimType);
    
    if (confidence >= 0.1) {
      claims.push({
        text: fullText,
        type: claimType,
        confidence,
        position: { start: 0, end: fullText.length },
        supportingUrls: findSupportingUrls(fullText, urls),
      });
    }
  }

  return claims;
}

/**
 * Split text into sentences (basic implementation)
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or newline
  // This is a simplified version; a full implementation would use a proper NLP library
  const sentences = text
    .split(/(?<=[.!?。！？])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  // If no sentences found, treat the whole text as one sentence
  if (sentences.length === 0 && text.trim().length > 0) {
    return [text.trim()];
  }
  
  return sentences;
}

/**
 * Classify the type of claim
 */
function classifyClaim(sentence: string): ExtractedClaim['type'] {
  const lower = sentence.toLowerCase();

  // Check for question patterns first
  if (QUESTION_PATTERNS.some(p => p.test(sentence))) {
    return 'question';
  }

  // Check for prediction patterns
  if (PREDICTION_PATTERNS.some(p => p.test(sentence))) {
    return 'prediction';
  }

  // Check for definition patterns
  if (DEFINITION_PATTERNS.some(p => p.test(sentence))) {
    return 'definition';
  }

  // Check for factual claim patterns
  if (FACTUAL_CLAIM_PATTERNS.some(p => p.test(sentence))) {
    return 'factual';
  }

  // Check for opinion patterns
  if (OPINION_PATTERNS.some(p => p.test(sentence))) {
    return 'opinion';
  }

  // Default: check for factual indicators (numbers, citations, specific claims)
  if (/\d+(?:\.\d+)?%/.test(sentence) || /\b(?:study|research|data|evidence)\b/i.test(sentence)) {
    return 'factual';
  }

  // Check for subjective language
  if (/\b(?:think|believe|feel|seem|appear|probably|maybe|perhaps)\b/i.test(sentence)) {
    return 'opinion';
  }

  // Default to factual for statements that look like assertions
  return 'factual';
}

/**
 * Calculate confidence score for a claim
 */
function calculateClaimConfidence(sentence: string, type: ExtractedClaim['type']): number {
  let confidence = 0.6; // Base confidence (increased from 0.5)

  // Boost for factual indicators
  if (type === 'factual') {
    if (/\d+(?:\.\d+)?%/.test(sentence)) confidence += 0.2;
    if (/\b(?:study|research|data|evidence|statistics|survey)\b/i.test(sentence)) confidence += 0.15;
    if (/\b(?:according to|cited|published|reported)\b/i.test(sentence)) confidence += 0.15;
    if (/https?:\/\//.test(sentence)) confidence += 0.1;
  }

  // Boost for clear opinion markers
  if (type === 'opinion') {
    if (/\b(?:i think|i believe|in my opinion|in my view)\b/i.test(sentence)) confidence += 0.3;
    if (/\b(?:should|must|ought to|best|worst)\b/i.test(sentence)) confidence += 0.1;
  }

  // Boost for clear questions
  if (type === 'question') {
    if (/\?$/.test(sentence.trim())) confidence += 0.3;
  }

  // Boost for predictions with temporal markers
  if (type === 'prediction') {
    if (/\b(?:will|going to|expected to|predicted)\b/i.test(sentence)) confidence += 0.2;
  }

  // Boost for definitions
  if (type === 'definition') {
    if (/\b(?:is|are|means|defined as)\b/i.test(sentence)) confidence += 0.2;
  }

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Find URLs that appear near the claim (likely supporting evidence)
 */
function findSupportingUrls(sentence: string, urls: string[]): string[] {
  return urls.filter(url => {
    // Simple heuristic: URL is supporting if it shares domain keywords with sentence
    // or appears in close proximity (handled by context in extractUrls)
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      // Check if domain name appears in sentence
      const domainParts = domain.split('.');
      return domainParts.some(part => part.length > 3 && sentence.toLowerCase().includes(part.toLowerCase()));
    } catch {
      return false;
    }
  });
}

/**
 * Extract resources (images, tables, citations, code blocks)
 */
function extractResources(text: string): ExtractedResource[] {
  const resources: ExtractedResource[] = [];

  // Images
  let imgMatch;
  while ((imgMatch = IMAGE_REGEX.exec(text)) !== null) {
    resources.push({
      type: 'image',
      content: `Alt: ${imgMatch[1]}, URL: ${imgMatch[2]}`,
      metadata: { alt: imgMatch[1], url: imgMatch[2] },
      position: { start: imgMatch.index, end: imgMatch.index + imgMatch[0].length },
    });
  }

  // Code blocks
  let codeMatch;
  while ((codeMatch = CODE_BLOCK_REGEX.exec(text)) !== null) {
    resources.push({
      type: 'code',
      content: codeMatch[2].trim(),
      metadata: { language: codeMatch[1] || 'unknown' },
      position: { start: codeMatch.index, end: codeMatch.index + codeMatch[0].length },
    });
  }

  // Tables (with deduplication)
  const seenTableResources = new Set<string>();
  let tableMatch;
  while ((tableMatch = TABLE_REGEX.exec(text)) !== null) {
    const tableContent = tableMatch[0];
    if (!seenTableResources.has(tableContent)) {
      seenTableResources.add(tableContent);
      const headerLine = tableMatch[0].split('\n')[0];
      resources.push({
        type: 'table',
        content: `Header: ${headerLine}`,
        position: { start: tableMatch.index, end: tableMatch.index + tableMatch[0].length },
      });
    }
  }

  // Citations (bracketed numbers or [author, year] patterns)
  const citationRegex = /\[\d+(?:,\s*\d+)*\]|\([A-Za-z]+,\s*\d{4}\)/g;
  let citeMatch;
  while ((citeMatch = citationRegex.exec(text)) !== null) {
    resources.push({
      type: 'citation',
      content: citeMatch[0],
      position: { start: citeMatch.index, end: citeMatch.index + citeMatch[0].length },
    });
  }

  return resources;
}

/**
 * Detect the language of the text
 */
function detectLanguage(text: string, hintLang: FactCheckLanguage): FactCheckLanguage {
  const chineseCharCount = (text.match(CHINESE_CHARS) || []).length;
  const chinesePunctCount = (text.match(CHINESE_PUNCTUATION) || []).length;
  const totalChars = text.length;

  if (totalChars === 0) return hintLang;

  const chineseRatio = (chineseCharCount + chinesePunctCount) / totalChars;

  if (chineseRatio > 0.3) {
    // Check for traditional vs simplified Chinese characters
    // Count unique traditional vs simplified characters
    const traditionalUnique = /[繁體傳統語點號]/g;
    const simplifiedUnique = /[简体简化语标]/g;
    
    const tradCount = (text.match(traditionalUnique) || []).length;
    const simpCount = (text.match(simplifiedUnique) || []).length;
    
    if (tradCount > simpCount) return 'zh-TW';
    return 'zh-CN';
  }

  // If hint suggests Chinese but ratio is low, trust the hint
  if (hintLang === 'zh-CN' || hintLang === 'zh-TW') {
    return hintLang;
  }

  return 'en';
}

/**
 * Get a summary of the parsed input for debugging/logging
 */
export const getParsingSummary = (parsed: ParsedInput): string => {
  return (
    `Parser Summary:\n` +
    `  Original length: ${parsed.stats.originalLength}\n` +
    `  Cleaned length: ${parsed.stats.cleanedLength}\n` +
    `  URLs found: ${parsed.stats.urlCount}\n` +
    `  Claims extracted: ${parsed.stats.claimCount}\n` +
    `  Markdown elements: ${parsed.stats.markdownElementCount}\n` +
    `  Resources: ${parsed.stats.resourceCount}\n` +
    `  Detected language: ${parsed.detectedLanguage} (confidence: ${parsed.stats.languageConfidence})`
  );
};