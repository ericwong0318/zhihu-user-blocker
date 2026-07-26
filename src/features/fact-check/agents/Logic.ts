/**
 * Agent 2 – Formal Logician & Fact-Checker
 *
 * This module receives the parsed input from the Parser agent and performs:
 * - Claim analysis and verification preparation
 * - Toulmin argument structure mapping (claim, grounds, warrant, backing, qualifier, rebuttal)
 * - Logical fallacy detection (formal and informal)
 * - Evidence quality assessment
 * - Contradiction detection
 * - External verification readiness (prepares queries for fact-checking APIs)
 */

import { FactCheckLanguage } from '../prompt';
import { ParsedInput, ExtractedClaim, ExtractedUrl } from './Parser';

export type ToulminElement =
  | 'claim'
  | 'grounds'
  | 'warrant'
  | 'backing'
  | 'qualifier'
  | 'rebuttal';

export type ToulminStructure = {
  claim: ExtractedClaim | null;
  grounds: ExtractedClaim[];
  warrant: ExtractedClaim | null;
  backing: ExtractedClaim[];
  qualifier: ExtractedClaim | null;
  rebuttal: ExtractedClaim | null;
  confidence: number; // Overall confidence in the argument structure
};

export type LogicalFallacy = {
  name: string;
  type: 'formal' | 'informal';
  description: string;
  location: { start: number; end: number };
  quote: string;
  explanation: string;
  severity: 'low' | 'medium' | 'high';
};

export type EvidenceAssessment = {
  claim: ExtractedClaim;
  supportingUrls: ExtractedUrl[];
  evidenceQuality: 'strong' | 'moderate' | 'weak' | 'none';
  verificationNeeded: boolean;
  suggestedQueries: string[];
};

export type Contradiction = {
  claim1: ExtractedClaim;
  claim2: ExtractedClaim;
  type: 'direct' | 'implicit' | 'statistical';
  explanation: string;
};

export type LogicOutput = {
  /** Toulmin argument structure */
  toulminStructure: ToulminStructure;
  /** Detected logical fallacies */
  fallacies: LogicalFallacy[];
  /** Evidence assessment for each factual claim */
  evidenceAssessments: EvidenceAssessment[];
  /** Detected contradictions */
  contradictions: Contradiction[];
  /** Overall logical coherence score (0-1) */
  coherenceScore: number;
  /** Summary for the next agent */
  summary: string;
};

/**
 * Logical fallacy patterns with detection logic
 */
const FORMAL_FALLACIES = [
  {
    name: 'Affirming the Consequent',
    pattern: /if\s+.+then\s+.+,\s*.+\s+(?:is|are)\s+.+,\s*therefore\s+.+/gi,
    description: 'Assuming that if P implies Q, and Q is true, then P must be true.',
    severity: 'high' as const,
  },
  {
    name: 'Denying the Antecedent',
    pattern: /if\s+.+then\s+.+,\s*(?:not\s+.+|.+\s+not)\s*,\s*therefore\s*(?:not\s+.+|.+\s+not)/gi,
    description: 'Assuming that if P implies Q, and P is false, then Q must be false.',
    severity: 'high' as const,
  },
  {
    name: 'Undistributed Middle',
    pattern: /\b(all|every)\s+\w+\s+(?:are|is)\s+\w+.*\b(all|every)\s+\w+\s+(?:are|is)\s+\w+/gi,
    description: 'Invalid categorical syllogism where the middle term is not distributed.',
    severity: 'medium' as const,
  },
];

const INFORMAL_FALLACIES = [
  {
    name: 'Ad Hominem',
    patterns: [
      /\b(?:you|he|she|they|the author|the speaker)\s+(?:is|are)\s+(?:stupid|wrong|biased|ignorant|unqualified|idiot|moron)/gi,
      /\b(?:attack|criticize)\s+the\s+person/gi,
      /\bpersonal\s+attack/gi,
    ],
    description: 'Attacking the person making the argument rather than the argument itself.',
    severity: 'high' as const,
  },
  {
    name: 'Straw Man',
    patterns: [
      /\b(?:so\s+you\s+say|you\s+are\s+saying|what\s+you\s+mean\s+is)\s+.+/gi,
      /\bmisrepresent\w*\s+(?:the\s+)?(?:argument|position|view)/gi,
      /\bdistort\w*\s+(?:the\s+)?(?:argument|position|view)/gi,
    ],
    description: 'Misrepresenting an opponent\'s argument to make it easier to attack.',
    severity: 'high' as const,
  },
  {
    name: 'False Dilemma / False Dichotomy',
    patterns: [
      /\b(?:either|only)\s+.+\s+(?:or|nor)\s+.+/gi,
      /\b(?:two|both)\s+(?:choices|options|possibilities)\b/gi,
      /\bno\s+middle\s+ground\b/gi,
      /\bblack\s+and\s+white\b/gi,
    ],
    description: 'Presenting only two alternatives when more exist.',
    severity: 'medium' as const,
  },
  {
    name: 'Slippery Slope',
    patterns: [
      /\bif\s+.+\s+then\s+.+\s+will\s+(?:lead\s+to|result\s+in|cause)\s+.+/gi,
      /\bslippery\s+slope\b/gi,
      /\bdomino\s+effect\b/gi,
      /\bone\s+thing\s+leads\s+to\s+another\b/gi,
    ],
    description: 'Arguing that a small step will inevitably lead to extreme consequences without evidence.',
    severity: 'medium' as const,
  },
  {
    name: 'Hasty Generalization',
    patterns: [
      /\b(?:all|every|always|never)\s+\w+\s+(?:are|is)\b/gi,
      /\bbased\s+on\s+(?:a\s+)?(?:few|one|single|small\s+sample)\b/gi,
      /\banecdotal\s+evidence\b/gi,
    ],
    description: 'Drawing a broad conclusion from a small or unrepresentative sample.',
    severity: 'medium' as const,
  },
  {
    name: 'Appeal to Authority',
    patterns: [
      /\b(?:expert|authority|professor|doctor|scientist)\s+(?:says|said|states|stated|claims|claimed)\b/gi,
      /\bas\s+(?:an\s+)?(?:expert|authority)\b/gi,
      /\baccording\s+to\s+(?:an\s+)?(?:expert|authority)\b/gi,
    ],
    description: 'Using an authority figure\'s opinion as evidence without verifying their expertise or the consensus.',
    severity: 'low' as const,
  },
  {
    name: 'Appeal to Emotion',
    patterns: [
      /\b(?:fear|anger|pity|sympathy|hope|pride|guilt|shame)\b/gi,
      /\b(?:think\s+of\s+the|imagine\s+if|what\s+if)\b/gi,
      /\bheartbreaking|devastating|terrifying|outrageous\b/gi,
    ],
    description: 'Manipulating emotions rather than using valid reasoning.',
    severity: 'medium' as const,
  },
  {
    name: 'Circular Reasoning / Begging the Question',
    patterns: [
      /\b(?:because|since)\s+.+\s+(?:is|are)\s+true\b.*\b(?:therefore|thus|so)\s+.+\s+(?:is|are)\s+true\b/gi,
      /\bcircular\s+reasoning\b/gi,
      /\bbegging\s+the\s+question\b/gi,
    ],
    description: 'The conclusion is assumed in the premise.',
    severity: 'high' as const,
  },
  {
    name: 'Red Herring',
    patterns: [
      /\b(?:by\s+the\s+way|incidentally|speaking\s+of|that\s+reminds\s+me)\b/gi,
      /\boff\s+topic\b/gi,
      /\birrelevant\b/gi,
    ],
    description: 'Introducing an irrelevant topic to divert attention from the original issue.',
    severity: 'low' as const,
  },
  {
    name: 'Appeal to Popularity / Bandwagon',
    patterns: [
      /\b(?:everyone|everybody|most\s+people|the\s+majority|popular)\s+(?:thinks?|believes?|agrees?|knows?)\b/gi,
      /\bcommon\s+knowledge\b/gi,
      /\bwidely\s+accepted\b/gi,
    ],
    description: 'Arguing that something is true because many people believe it.',
    severity: 'low' as const,
  },
  {
    name: 'Tu Quoque',
    patterns: [
      /\byou\s+(?:too|also)\b/gi,
      /\bhypocrite\b/gi,
      /\bpractice\s+what\s+you\s+preach\b/gi,
    ],
    description: 'Dismissing an argument because the arguer doesn\'t follow it themselves.',
    severity: 'medium' as const,
  },
  {
    name: 'Equivocation',
    patterns: [
      // This is harder to detect automatically, but we can flag potential cases
    ],
    description: 'Using a word with multiple meanings ambiguously.',
    severity: 'low' as const,
  },
  {
    name: 'No True Scotsman',
    patterns: [
      /\bno\s+true\s+\w+\s+(?:would|could)\b/gi,
      /\bnot\s+a\s+real\s+\w+\b/gi,
    ],
    description: 'Redefining a category to exclude counterexamples.',
    severity: 'medium' as const,
  },
];

/**
 * Run logical analysis and fact-checking preparation.
 *
 * @param input    Parsed input from the Parser agent.
 * @param language UI language (currently unused but passed for future localization).
 * @returns        Structured logical analysis output.
 */
export const runLogic = async (
  input: ParsedInput,
  _language: FactCheckLanguage = 'en',
): Promise<LogicOutput> => {
  const { cleanedText, claims, urls } = input;

  // 1. Build Toulmin structure
  const toulminStructure = buildToulminStructure(claims, cleanedText);

  // 2. Detect logical fallacies
  const fallacies = detectFallacies(cleanedText, claims);

  // 3. Assess evidence for factual claims
  const evidenceAssessments = assessEvidence(claims, urls);

  // 4. Detect contradictions
  const contradictions = detectContradictions(claims);

  // 5. Calculate coherence score
  const coherenceScore = calculateCoherenceScore(
    toulminStructure,
    fallacies,
    evidenceAssessments,
    contradictions,
  );

  // 6. Generate summary for next agent
  const summary = generateSummary(toulminStructure, fallacies, evidenceAssessments, contradictions);

  return {
    toulminStructure,
    fallacies,
    evidenceAssessments,
    contradictions,
    coherenceScore,
    summary,
  };
};

/**
 * Build Toulmin argument structure from claims
 */
function buildToulminStructure(claims: ExtractedClaim[], text: string): ToulminStructure {
  // Find the main claim (usually the first factual claim or highest confidence claim)
  const factualClaims = claims.filter(c => c.type === 'factual');
  const opinionClaims = claims.filter(c => c.type === 'opinion');
  const definitionClaims = claims.filter(c => c.type === 'definition');

  let mainClaim: ExtractedClaim | null = null;
  if (factualClaims.length > 0) {
    mainClaim = factualClaims.reduce((max, c) => (c.confidence > max.confidence ? c : max), factualClaims[0]);
  } else if (opinionClaims.length > 0) {
    mainClaim = opinionClaims.reduce((max, c) => (c.confidence > max.confidence ? c : max), opinionClaims[0]);
  } else if (definitionClaims.length > 0) {
    mainClaim = definitionClaims[0];
  }

  // Find grounds (evidence supporting the claim)
  const grounds = claims.filter(
    c => c !== mainClaim &&
    (c.type === 'factual' || c.type === 'definition') &&
    c.supportingUrls.length > 0,
  );

  // Find warrant (the logical connection - often implicit)
  // Look for claims that express general principles or rules
  const warrantCandidates = claims.filter(
    c => c !== mainClaim &&
    !grounds.includes(c) &&
    (c.text.includes('therefore') || c.text.includes('thus') || c.text.includes('because') ||
     c.text.includes('since') || c.text.includes('implies') || c.text.includes('follows')),
  );
  const warrant = warrantCandidates.length > 0 ? warrantCandidates[0] : null;

  // Find backing (support for the warrant)
  const backing = claims.filter(
    c => c !== mainClaim && !grounds.includes(c) && c !== warrant &&
    c.supportingUrls.length > 0,
  );

  // Find qualifier (modal language indicating strength)
  const qualifierCandidates = claims.filter(
    c => c !== mainClaim && !grounds.includes(c) && c !== warrant &&
    (c.text.includes('probably') || c.text.includes('likely') || c.text.includes('possibly') ||
     c.text.includes('may') || c.text.includes('might') || c.text.includes('could') ||
     c.text.includes('generally') || c.text.includes('typically') || c.text.includes('often')),
  );
  const qualifier = qualifierCandidates.length > 0 ? qualifierCandidates[0] : null;

  // Find rebuttal (acknowledged counterarguments)
  const rebuttalCandidates = claims.filter(
    c => c !== mainClaim && !grounds.includes(c) && c !== warrant &&
    (c.text.includes('however') || c.text.includes('although') || c.text.includes('but') ||
     c.text.includes('yet') || c.text.includes('except') || c.text.includes('unless') ||
     c.text.includes('counter') || c.text.includes('objection') || c.text.includes('critic')),
  );
  const rebuttal = rebuttalCandidates.length > 0 ? rebuttalCandidates[0] : null;

  // Calculate overall confidence
  let confidence = 0.5;
  if (mainClaim) confidence += 0.1;
  if (grounds.length > 0) confidence += Math.min(0.2, grounds.length * 0.05);
  if (warrant) confidence += 0.1;
  if (backing.length > 0) confidence += Math.min(0.1, backing.length * 0.03);
  if (qualifier) confidence += 0.05; // Qualifiers show nuanced thinking
  if (rebuttal) confidence += 0.05; // Rebuttals show balanced reasoning

  return {
    claim: mainClaim,
    grounds,
    warrant,
    backing,
    qualifier,
    rebuttal,
    confidence: Math.min(1, confidence),
  };
}

/**
 * Detect logical fallacies in the text
 */
function detectFallacies(text: string, claims: ExtractedClaim[]): LogicalFallacy[] {
  const fallacies: LogicalFallacy[] = [];

  // Check formal fallacies
  for (const fallacy of FORMAL_FALLACIES) {
    const matches = text.matchAll(fallacy.pattern);
    for (const match of matches) {
      if (match.index !== undefined) {
        fallacies.push({
          name: fallacy.name,
          type: 'formal',
          description: fallacy.description,
          location: { start: match.index, end: match.index + match[0].length },
          quote: match[0].substring(0, 200),
          explanation: fallacy.description,
          severity: fallacy.severity,
        });
      }
    }
  }

  // Check informal fallacies
  for (const fallacy of INFORMAL_FALLACIES) {
    for (const pattern of fallacy.patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match.index !== undefined) {
          fallacies.push({
            name: fallacy.name,
            type: 'informal',
            description: fallacy.description,
            location: { start: match.index, end: match.index + match[0].length },
            quote: match[0].substring(0, 200),
            explanation: fallacy.description,
            severity: fallacy.severity,
          });
        }
      }
    }
  }

  // Deduplicate fallacies (same name and overlapping location)
  const uniqueFallacies: LogicalFallacy[] = [];
  for (const f of fallacies) {
    const isDuplicate = uniqueFallacies.some(
      uf => uf.name === f.name &&
      Math.abs(uf.location.start - f.location.start) < 50,
    );
    if (!isDuplicate) {
      uniqueFallacies.push(f);
    }
  }

  // Sort by severity and position
  const severityOrder = { high: 3, medium: 2, low: 1 };
  return uniqueFallacies.sort((a, b) => {
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.location.start - b.location.start;
  });
}

/**
 * Assess evidence quality for each factual claim
 */
function assessEvidence(claims: ExtractedClaim[], urls: ExtractedUrl[]): EvidenceAssessment[] {
  const factualClaims = claims.filter(c => c.type === 'factual' || c.type === 'definition');

  return factualClaims.map(claim => {
    const supportingUrls = claim.supportingUrls.map(urlStr =>
      urls.find(u => u.url === urlStr),
    ).filter((u): u is ExtractedUrl => u !== undefined);

    let evidenceQuality: EvidenceAssessment['evidenceQuality'] = 'none';
    let verificationNeeded = false;
    const suggestedQueries: string[] = [];

    if (supportingUrls.length === 0) {
      evidenceQuality = 'none';
      verificationNeeded = true;
      // Generate search query from claim
      suggestedQueries.push(generateSearchQuery(claim.text));
    } else {
      // Assess quality based on URL characteristics
      const citationUrls = supportingUrls.filter(u => u.isLikelyCitation);
      const hasAcademicSource = supportingUrls.some(u =>
        /\.(?:edu|gov|org)(?:\/|$)/i.test(u.url) ||
        /(?:arxiv|pubmed|doi|scholar|researchgate)/i.test(u.url),
      );
      const hasReputableSource = supportingUrls.some(u =>
        /\.(?:com|net|io)(?:\/|$)/i.test(u.url) &&
        (u.title?.length ?? 0) > 10,
      );

      if (hasAcademicSource) {
        evidenceQuality = 'strong';
      } else if (citationUrls.length > 0 || hasReputableSource) {
        evidenceQuality = 'moderate';
      } else {
        evidenceQuality = 'weak';
      }

      // Still need verification if only weak/moderate sources
      if (evidenceQuality !== 'strong') {
        verificationNeeded = true;
        suggestedQueries.push(generateSearchQuery(claim.text));
      }
    }

    return {
      claim,
      supportingUrls,
      evidenceQuality,
      verificationNeeded,
      suggestedQueries,
    };
  });
}

/**
 * Generate a search query for fact-checking a claim
 */
function generateSearchQuery(claimText: string): string {
  // Extract key terms from the claim
  const words = claimText
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !/^(?:the|and|for|are|but|not|you|all|this|that|with|from|have|has|been|were|will|would|could|should|what|when|where|which|who|whom|whose|why|how)$/.test(w))
    .slice(0, 8);

  return words.join(' ') + ' fact check';
}

/**
 * Detect contradictions between claims
 */
function detectContradictions(claims: ExtractedClaim[]): Contradiction[] {
  const contradictions: Contradiction[] = [];
  const factualClaims = claims.filter(c => c.type === 'factual');

  for (let i = 0; i < factualClaims.length; i++) {
    for (let j = i + 1; j < factualClaims.length; j++) {
      const claim1 = factualClaims[i];
      const claim2 = factualClaims[j];

      // Check for direct numerical contradictions
      const nums1 = claim1.text.match(/\d+(?:\.\d+)?%?/g) || [];
      const nums2 = claim2.text.match(/\d+(?:\.\d+)?%?/g) || [];

      if (nums1.length > 0 && nums2.length > 0) {
        // Simple check: if they mention similar topics but different numbers
        const topic1 = extractTopic(claim1.text);
        const topic2 = extractTopic(claim2.text);

        const nums1Str: string[] = nums1 as string[];
        const nums2Str: string[] = nums2 as string[];
        
        if (topicsOverlap(topic1, topic2) && nums1Str.some(n => !nums2Str.includes(n))) {
          contradictions.push({
            claim1,
            claim2,
            type: 'statistical',
            explanation: `Conflicting numerical claims about ${topic1}: "${nums1Str.join(', ')}" vs "${nums2Str.join(', ')}"`,
          });
        }
      }

      // Check for direct logical contradiction (A vs not A)
      const negation1 = claim1.text.toLowerCase().includes('not') || claim1.text.toLowerCase().includes('no ');
      const negation2 = claim2.text.toLowerCase().includes('not') || claim2.text.toLowerCase().includes('no ');

      if (negation1 !== negation2 && topicsOverlap(extractTopic(claim1.text), extractTopic(claim2.text))) {
        const sharedWords = getSharedKeywords(claim1.text, claim2.text);
        if (sharedWords.length >= 3) {
          contradictions.push({
            claim1,
            claim2,
            type: 'direct',
            explanation: `Direct contradiction detected: "${claim1.text.substring(0, 100)}..." vs "${claim2.text.substring(0, 100)}..."`,
          });
        }
      }
    }
  }

  return contradictions;
}

/**
 * Extract main topic from a claim
 */
function extractTopic(text: string): string {
  // Simple topic extraction: remove common words, keep nouns
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'us', 'our',
    'i', 'me', 'my', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'not', 'no', 'yes',
    'very', 'really', 'quite', 'just', 'only', 'even', 'still', 'already', 'yet', 'also',
    'then', 'than', 'so', 'such', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
    'about', 'into', 'over', 'under', 'again', 'more', 'most', 'some', 'any', 'all', 'each',
    'every', 'few', 'many', 'much', 'other', 'another', 'such', 'own', 'same', 'different',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  return words.slice(0, 5).join(' ');
}

/**
 * Check if two topics overlap
 */
function topicsOverlap(topic1: string, topic2: string): boolean {
  const words1 = new Set(topic1.split(' '));
  const words2 = topic2.split(' ');
  return words2.some(w => words1.has(w) && w.length > 3);
}

/**
 * Get shared keywords between two texts
 */
function getSharedKeywords(text1: string, text2: string): string[] {
  const words1 = new Set(text1.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3));
  const words2 = text2.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  return words2.filter(w => words1.has(w));
}

/**
 * Calculate overall logical coherence score
 */
function calculateCoherenceScore(
  toulmin: ToulminStructure,
  fallacies: LogicalFallacy[],
  evidence: EvidenceAssessment[],
  contradictions: Contradiction[],
): number {
  let score = 0.5; // Base score

  // Toulmin structure completeness
  if (toulmin.claim) score += 0.1;
  if (toulmin.grounds.length > 0) score += Math.min(0.15, toulmin.grounds.length * 0.03);
  if (toulmin.warrant) score += 0.05;
  if (toulmin.backing.length > 0) score += Math.min(0.1, toulmin.backing.length * 0.02);
  if (toulmin.qualifier) score += 0.03;
  if (toulmin.rebuttal) score += 0.03;

  // Penalize fallacies
  const highSeverityFallacies = fallacies.filter(f => f.severity === 'high').length;
  const mediumSeverityFallacies = fallacies.filter(f => f.severity === 'medium').length;
  const lowSeverityFallacies = fallacies.filter(f => f.severity === 'low').length;

  score -= highSeverityFallacies * 0.15;
  score -= mediumSeverityFallacies * 0.08;
  score -= lowSeverityFallacies * 0.03;

  // Reward strong evidence
  const strongEvidence = evidence.filter(e => e.evidenceQuality === 'strong').length;
  const moderateEvidence = evidence.filter(e => e.evidenceQuality === 'moderate').length;
  const weakEvidence = evidence.filter(e => e.evidenceQuality === 'weak').length;
  const noEvidence = evidence.filter(e => e.evidenceQuality === 'none').length;

  score += strongEvidence * 0.05;
  score += moderateEvidence * 0.02;
  score -= weakEvidence * 0.02;
  score -= noEvidence * 0.05;

  // Penalize contradictions
  score -= contradictions.length * 0.1;

  return Math.max(0, Math.min(1, score));
}

/**
 * Generate summary for the next agent (Bias/Critic)
 */
function generateSummary(
  toulmin: ToulminStructure,
  fallacies: LogicalFallacy[],
  evidence: EvidenceAssessment[],
  contradictions: Contradiction[],
): string {
  const parts: string[] = [];

  if (toulmin.claim) {
    parts.push(`Main claim: "${toulmin.claim.text.substring(0, 100)}..."`);
  }

  if (toulmin.grounds.length > 0) {
    parts.push(`${toulmin.grounds.length} supporting ground(s) identified.`);
  }

  if (toulmin.warrant) {
    parts.push(`Warrant present: "${toulmin.warrant.text.substring(0, 80)}..."`);
  } else {
    parts.push('No explicit warrant (logical connection) identified.');
  }

  if (fallacies.length > 0) {
    const highCount = fallacies.filter(f => f.severity === 'high').length;
    const medCount = fallacies.filter(f => f.severity === 'medium').length;
    parts.push(`${fallacies.length} logical fallacy(s) detected (${highCount} high, ${medCount} medium severity).`);
  } else {
    parts.push('No obvious logical fallacies detected.');
  }

  const strongE = evidence.filter(e => e.evidenceQuality === 'strong').length;
  const modE = evidence.filter(e => e.evidenceQuality === 'moderate').length;
  const weakE = evidence.filter(e => e.evidenceQuality === 'weak').length;
  const noneE = evidence.filter(e => e.evidenceQuality === 'none').length;

  if (evidence.length > 0) {
    parts.push(`Evidence quality: ${strongE} strong, ${modE} moderate, ${weakE} weak, ${noneE} none.`);
  }

  if (contradictions.length > 0) {
    parts.push(`${contradictions.length} contradiction(s) detected.`);
  }

  parts.push(`Overall coherence score: ${(toulmin.confidence * 100).toFixed(0)}%`);

  return parts.join(' ');
}

/**
 * Get a summary of the logic analysis for debugging/logging
 */
export const getLogicSummary = (output: LogicOutput): string => {
  return (
    `Logic Analysis Summary:\n` +
    `  Coherence Score: ${(output.coherenceScore * 100).toFixed(1)}%\n` +
    `  Main Claim: ${output.toulminStructure.claim ? 'Present' : 'None'}\n` +
    `  Grounds: ${output.toulminStructure.grounds.length}\n` +
    `  Warrant: ${output.toulminStructure.warrant ? 'Present' : 'Missing'}\n` +
    `  Backing: ${output.toulminStructure.backing.length}\n` +
    `  Qualifier: ${output.toulminStructure.qualifier ? 'Present' : 'None'}\n` +
    `  Rebuttal: ${output.toulminStructure.rebuttal ? 'Present' : 'None'}\n` +
    `  Fallacies: ${output.fallacies.length} (${output.fallacies.filter(f => f.severity === 'high').length} high, ${output.fallacies.filter(f => f.severity === 'medium').length} medium, ${output.fallacies.filter(f => f.severity === 'low').length} low)\n` +
    `  Evidence: ${output.evidenceAssessments.length} claims assessed\n` +
    `  Contradictions: ${output.contradictions.length}\n` +
    `  Summary: ${output.summary}`
  );
};