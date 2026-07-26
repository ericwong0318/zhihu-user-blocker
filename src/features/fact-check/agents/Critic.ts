/**
 * Agent 4 – Critic & Synthesizer
 *
 * This module synthesizes the outputs from all previous agents (Parser, Logic, Bias)
 * into a final, structured FactCheckResult. It:
 * - Validates and reconciles findings from all agents
 * - Resolves conflicts between Logic and Bias analyses
 * - Produces the final JSON output matching the required schema
 * - Provides confidence scoring and uncertainty quantification
 */

import { FactCheckLanguage, parseResult, FactCheckResult, Verdict } from '../prompt';
import { ParsedInput } from './Parser';
import { LogicOutput } from './Logic';
import { BiasOutput } from './Bias';

export type CriticInput = {
  parsed: ParsedInput;
  logic: LogicOutput;
  bias: BiasOutput;
  language: FactCheckLanguage;
};

export type CriticOutput = FactCheckResult & {
  /** Metadata about the synthesis process */
  meta: {
    /** Whether the critic could produce a definitive verdict from agent outputs alone */
    synthesizedFromAgents: boolean;
    /** Confidence in the final verdict (0-1) */
    verdictConfidence: number;
    /** Which agents contributed to the verdict */
    contributingAgents: ('parser' | 'logic' | 'bias')[];
    /** Any warnings or caveats */
    warnings: string[];
    /** Processing timestamp */
    timestamp: string;
  };
};

/**
 * Synthesize the final fact-check result from all agent outputs.
 *
 * @param input   Combined output from Parser, Logic, and Bias agents.
 * @param language UI language for localization.
 * @returns       Final FactCheckResult with metadata.
 */
export const synthesize = async (
  input: CriticInput,
  language: FactCheckLanguage = 'en',
): Promise<CriticOutput> => {
  const { parsed, logic, bias } = input;
  const warnings: string[] = [];
  const contributingAgents: ('parser' | 'logic' | 'bias')[] = [];

  // 1. Determine validity vs truth assessment
  const validityVsTruth = synthesizeValidityVsTruth(logic, bias, warnings);

  // 2. Synthesize rhetoric analysis
  const rhetoric = synthesizeRhetoric(bias, warnings);

  // 3. Synthesize fallacies (combining Logic's formal/informal fallacies with Bias's cognitive biases)
  const fallacies = synthesizeFallacies(logic, bias, warnings);

  // 4. Determine verdict
  const { verdict, confidence } = determineVerdict(logic, bias, validityVsTruth, warnings);

  // 5. Collect sources from evidence assessments
  const sources = synthesizeSources(logic, parsed);

  // 6. Check if we have enough agent data to synthesize without external AI
  const synthesizedFromAgents = canSynthesizeFromAgents(logic, bias, parsed);

  if (!synthesizedFromAgents) {
    warnings.push('Insufficient agent data for full synthesis; external AI provider recommended.');
  }

  contributingAgents.push('parser', 'logic', 'bias');

  return {
    validityVsTruth,
    rhetoric,
    fallacies,
    verdict,
    sources,
    meta: {
      synthesizedFromAgents,
      verdictConfidence: confidence,
      contributingAgents,
      warnings,
      timestamp: new Date().toISOString(),
    },
  };
};

/**
 * Synthesize the validity vs truth assessment from Logic and Bias outputs.
 */
function synthesizeValidityVsTruth(logic: LogicOutput, bias: BiasOutput, warnings: string[]): string {
  const parts: string[] = [];

  // Logic coherence assessment
  if (logic.coherenceScore > 0.7) {
    parts.push('The argument demonstrates strong logical coherence.');
  } else if (logic.coherenceScore > 0.4) {
    parts.push('The argument has moderate logical coherence with some structural gaps.');
  } else {
    parts.push('The argument shows weak logical coherence and significant structural issues.');
  }

  // Toulmin structure
  if (logic.toulminStructure.claim) {
    parts.push(`Main claim identified: "${logic.toulminStructure.claim.text.substring(0, 100)}..."`);
  }
  if (logic.toulminStructure.grounds.length > 0) {
    parts.push(`${logic.toulminStructure.grounds.length} supporting ground(s) provided.`);
  }
  if (logic.toulminStructure.warrant) {
    parts.push('Explicit warrant (logical connection) present.');
  } else {
    parts.push('No explicit warrant identified; logical connection is implicit.');
    warnings.push('Missing explicit warrant reduces argument transparency.');
  }
  if (logic.toulminStructure.rebuttal) {
    parts.push('Counterarguments acknowledged (rebuttal present).');
  }

  // Evidence quality
  const strongEvidence = logic.evidenceAssessments.filter(e => e.evidenceQuality === 'strong').length;
  const moderateEvidence = logic.evidenceAssessments.filter(e => e.evidenceQuality === 'moderate').length;
  const weakEvidence = logic.evidenceAssessments.filter(e => e.evidenceQuality === 'weak').length;
  const noEvidence = logic.evidenceAssessments.filter(e => e.evidenceQuality === 'none').length;

  if (logic.evidenceAssessments.length > 0) {
    parts.push(
      `Evidence quality: ${strongEvidence} strong, ${moderateEvidence} moderate, ${weakEvidence} weak, ${noEvidence} unsupported claim(s).`,
    );
    if (noEvidence > 0) {
      warnings.push(`${noEvidence} factual claim(s) lack supporting evidence.`);
    }
  } else {
    parts.push('No factual claims with assessable evidence found.');
  }

  // Contradictions
  if (logic.contradictions.length > 0) {
    parts.push(`${logic.contradictions.length} internal contradiction(s) detected.`);
    warnings.push('Internal contradictions undermine argument reliability.');
  }

  // Bias impact on truth assessment
  if (bias.biasScore > 0.5) {
    parts.push('High bias/manipulation score suggests the argument may prioritize persuasion over truth.');
    warnings.push('High manipulation risk may distort factual presentation.');
  } else if (bias.biasScore > 0.3) {
    parts.push('Moderate bias detected; some persuasive techniques may color factual claims.');
  }

  // Source credibility
  if (bias.sourceCredibility.overallCredibility === 'high') {
    parts.push('Sources are highly credible (academic/official).');
  } else if (bias.sourceCredibility.overallCredibility === 'moderate') {
    parts.push('Sources have moderate credibility.');
  } else if (bias.sourceCredibility.overallCredibility === 'low') {
    parts.push('Sources have low credibility; claims should be independently verified.');
    warnings.push('Low source credibility reduces trust in factual assertions.');
  }

  return parts.join(' ');
}

/**
 * Synthesize rhetoric analysis from Bias output.
 */
function synthesizeRhetoric(bias: BiasOutput, warnings: string[]): FactCheckResult['rhetoric'] {
  const ethos = bias.rhetoric.ethos;
  const pathos = bias.rhetoric.pathos;
  const logos = bias.rhetoric.logos;

  return {
    ethos: formatRhetoricDimension(ethos, 'authority and credibility'),
    pathos: formatRhetoricDimension(pathos, 'emotional appeal'),
    logos: formatRhetoricDimension(logos, 'logical reasoning'),
  };
}

function formatRhetoricDimension(dim: BiasOutput['rhetoric']['ethos'], fallback: string): string {
  if (dim.level === 'none') {
    return `Minimal ${fallback} detected.`;
  }
  const levelDesc = dim.level === 'high' ? 'Strong' : dim.level === 'moderate' ? 'Moderate' : 'Weak';
  const indicators = dim.evidence.slice(0, 3).join(', ');
  return `${levelDesc} ${fallback}${indicators ? ` (${indicators})` : ''}.`;
}

/**
 * Synthesize fallacies from both Logic and Bias agents.
 */
function synthesizeFallacies(logic: LogicOutput, bias: BiasOutput, warnings: string[]): FactCheckResult['fallacies'] {
  const fallacies: FactCheckResult['fallacies'] = [];

  // Add logical fallacies from Logic agent
  for (const lf of logic.fallacies) {
    fallacies.push({
      name: lf.name,
      quote: lf.quote,
      explanation: lf.explanation,
    });
  }

  // Add cognitive biases from Bias agent (as fallacies)
  for (const cb of bias.cognitiveBiases) {
    fallacies.push({
      name: `Cognitive Bias: ${cb.name}`,
      quote: cb.quote,
      explanation: cb.explanation,
    });
  }

  // Add persuasion techniques as fallacies if manipulative
  for (const pt of bias.persuasionTechniques) {
    if (pt.effectiveness === 'high' && (pt.type === 'psychological' || pt.type === 'structural')) {
      fallacies.push({
        name: `Persuasion Technique: ${pt.name}`,
        quote: pt.quote,
        explanation: `${pt.description} (Effectiveness: ${pt.effectiveness})`,
      });
    }
  }

  // Add emotional manipulation techniques
  for (const em of bias.emotionalManipulation.techniques) {
    if (em.risk === 'high' || em.risk === 'medium') {
      fallacies.push({
        name: `Emotional Manipulation: ${em.name}`,
        quote: em.quote,
        explanation: `${em.description} (Risk: ${em.risk})`,
      });
    }
  }

  // Deduplicate by name and quote similarity
  const uniqueFallacies = deduplicateFallacies(fallacies);

  if (uniqueFallacies.length > 10) {
    warnings.push(`Many fallacies/biases detected (${uniqueFallacies.length}); showing top 10.`);
    return uniqueFallacies.slice(0, 10);
  }

  return uniqueFallacies;
}

/**
 * Deduplicate fallacies based on name and quote overlap.
 */
function deduplicateFallacies(fallacies: FactCheckResult['fallacies']): FactCheckResult['fallacies'] {
  const unique: FactCheckResult['fallacies'] = [];
  for (const f of fallacies) {
    const isDuplicate = unique.some(
      uf => uf.name === f.name && quoteOverlap(uf.quote, f.quote) > 0.5,
    );
    if (!isDuplicate) unique.push(f);
  }
  return unique;
}

/**
 * Calculate quote overlap ratio (simple Jaccard on words).
 */
function quoteOverlap(q1: string, q2: string): number {
  const words1 = new Set(q1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(q2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Determine the final verdict based on all agent outputs.
 */
function determineVerdict(
  logic: LogicOutput,
  bias: BiasOutput,
  validityVsTruth: string,
  warnings: string[],
): { verdict: Verdict; confidence: number } {
  let score = 0.5; // Start neutral
  let verdict: Verdict = 'unverified';

  // Logic coherence heavily influences verdict
  if (logic.coherenceScore >= 0.7) score += 0.25;
  else if (logic.coherenceScore >= 0.5) score += 0.1;
  else if (logic.coherenceScore < 0.3) score -= 0.2;

  // Evidence quality
  const strongE = logic.evidenceAssessments.filter(e => e.evidenceQuality === 'strong').length;
  const modE = logic.evidenceAssessments.filter(e => e.evidenceQuality === 'moderate').length;
  const weakE = logic.evidenceAssessments.filter(e => e.evidenceQuality === 'weak').length;
  const noneE = logic.evidenceAssessments.filter(e => e.evidenceQuality === 'none').length;

  score += strongE * 0.1;
  score += modE * 0.05;
  score -= weakE * 0.05;
  score -= noneE * 0.1;

  // Contradictions
  score -= logic.contradictions.length * 0.15;

  // High-severity fallacies
  const highFallacies = logic.fallacies.filter(f => f.severity === 'high').length;
  const medFallacies = logic.fallacies.filter(f => f.severity === 'medium').length;
  score -= highFallacies * 0.15;
  score -= medFallacies * 0.08;

  // Bias score
  score -= bias.biasScore * 0.3;

  // Source credibility
  if (bias.sourceCredibility.overallCredibility === 'high') score += 0.1;
  else if (bias.sourceCredibility.overallCredibility === 'low') score -= 0.15;

  // Emotional manipulation
  if (bias.emotionalManipulation.overallRisk === 'high') score -= 0.2;
  else if (bias.emotionalManipulation.overallRisk === 'medium') score -= 0.1;

  // Framing effect (mixed framing can be manipulative)
  if (bias.framing.framingEffect === 'mixed') score -= 0.05;

  // Clamp score
  score = Math.max(0, Math.min(1, score));

  // Determine verdict
  if (score >= 0.65) verdict = 'credible';
  else if (score <= 0.35) verdict = 'misleading';
  else verdict = 'unverified';

  // Confidence is based on how far from the threshold we are
  const distanceFromThreshold = Math.abs(score - 0.5);
  const confidence = Math.min(0.95, 0.5 + distanceFromThreshold * 0.9);

  return { verdict, confidence };
}

/**
 * Synthesize sources from evidence assessments and parsed URLs.
 */
function synthesizeSources(logic: LogicOutput, parsed: ParsedInput): FactCheckResult['sources'] {
  const sources: FactCheckResult['sources'] = [];

  // Add sources from evidence assessments
  for (const assessment of logic.evidenceAssessments) {
    for (const urlObj of assessment.supportingUrls) {
      sources.push({
        title: urlObj.title || urlObj.url,
        url: urlObj.url,
      });
    }
  }

  // Add citation resources from parser
  for (const resource of parsed.resources) {
    if (resource.type === 'citation' && resource.metadata?.url) {
      sources.push({
        title: resource.metadata.title || resource.content,
        url: resource.metadata.url,
      });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return sources.filter(s => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

/**
 * Check if we have enough data from agents to synthesize without external AI.
 */
function canSynthesizeFromAgents(logic: LogicOutput, bias: BiasOutput, parsed: ParsedInput): boolean {
  // Need at least a main claim and some evidence assessment
  const hasClaim = !!logic.toulminStructure.claim;
  const hasEvidence = logic.evidenceAssessments.length > 0;
  const hasParsedContent = parsed.cleanedText.length > 50;

  return hasClaim && hasEvidence && hasParsedContent;
}

/**
 * Get a summary of the critic synthesis for debugging/logging
 */
export const getCriticSummary = (output: CriticOutput): string => {
  return (
    `Critic Synthesis Summary:\n` +
    `  Verdict: ${output.verdict} (confidence: ${(output.meta.verdictConfidence * 100).toFixed(1)}%)\n` +
    `  Synthesized from agents: ${output.meta.synthesizedFromAgents}\n` +
    `  Contributing agents: ${output.meta.contributingAgents.join(', ')}\n` +
    `  Fallacies found: ${output.fallacies.length}\n` +
    `  Sources: ${output.sources?.length || 0}\n` +
    `  Warnings: ${output.meta.warnings.length}\n` +
    `  Validity vs Truth: ${output.validityVsTruth.substring(0, 100)}...`
  );
};

/**
 * Compatibility function for the old pipeline interface.
 * Takes a string (enriched response) and returns a FactCheckResult.
 * This maintains backward compatibility with the pipeline.ts interface.
 */
export const synthesizeFromString = (
  enrichedResponse: string,
  _language: FactCheckLanguage = 'en',
): FactCheckResult => {
  return parseResult(enrichedResponse);
};
