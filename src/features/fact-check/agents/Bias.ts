/**
 * Agent 3 – Fallacy & Rhetorical Analyst
 *
 * This module receives the logic analysis output and performs:
 * - Rhetorical analysis (Ethos, Pathos, Logos assessment)
 * - Cognitive bias detection
 * - Persuasion technique identification
 * - Framing analysis
 * - Emotional manipulation detection
 * - Source credibility evaluation
 */

import { FactCheckLanguage } from '../prompt';
import { LogicOutput } from './Logic';
import { ExtractedClaim } from './Parser';

export type RhetoricAnalysis = {
  ethos: RhetoricDimension;
  pathos: RhetoricDimension;
  logos: RhetoricDimension;
  overallBalance: 'ethos-heavy' | 'pathos-heavy' | 'logos-heavy' | 'balanced';
};

export type RhetoricDimension = {
  score: number; // 0-1
  level: 'none' | 'low' | 'moderate' | 'high';
  indicators: string[];
  evidence: string[];
};

export type CognitiveBias = {
  name: string;
  category: 'memory' | 'decision' | 'social' | 'attribution' | 'probability';
  description: string;
  location: { start: number; end: number };
  quote: string;
  explanation: string;
  confidence: number; // 0-1
};

export type PersuasionTechnique = {
  name: string;
  type: 'rhetorical' | 'psychological' | 'structural';
  description: string;
  location: { start: number; end: number };
  quote: string;
  effectiveness: 'low' | 'medium' | 'high';
};

export type FramingAnalysis = {
  frames: Frame[];
  dominantFrame: string | null;
  framingEffect: 'positive' | 'negative' | 'neutral' | 'mixed';
};

export type Frame = {
  name: string;
  description: string;
  evidence: string[];
  valence: 'positive' | 'negative' | 'neutral';
};

export type SourceCredibility = {
  sources: SourceAssessment[];
  overallCredibility: 'high' | 'moderate' | 'low' | 'unknown';
};

export type SourceAssessment = {
  url: string;
  domain: string;
  credibility: 'high' | 'moderate' | 'low' | 'unknown';
  factors: CredibilityFactor[];
};

export type CredibilityFactor = {
  factor: string;
  present: boolean;
  weight: number;
};

export type EmotionalManipulation = {
  techniques: ManipulationTechnique[];
  overallRisk: 'low' | 'medium' | 'high';
};

export type ManipulationTechnique = {
  name: string;
  description: string;
  location: { start: number; end: number };
  quote: string;
  risk: 'low' | 'medium' | 'high';
};

export type BiasOutput = {
  rhetoric: RhetoricAnalysis;
  cognitiveBiases: CognitiveBias[];
  persuasionTechniques: PersuasionTechnique[];
  framing: FramingAnalysis;
  sourceCredibility: SourceCredibility;
  emotionalManipulation: EmotionalManipulation;
  summary: string;
  biasScore: number; // 0-1, higher = more biased/manipulative
};

/**
 * Rhetorical analysis patterns
 */
const ETHOS_INDICATORS = {
  positive: [
    /\b(?:expert|authority|professor|doctor|researcher|scientist|scholar)\b/i,
    /\b(?:experience|expertise|credentials|qualifications|background)\b/i,
    /\b(?:published|peer.reviewed|academic|university|institute)\b/i,
    /\b(?:years\s+of|decades\s+of)\s+\w+\s+experience/i,
    /\b(?:certified|licensed|accredited|recognized)\b/i,
  ],
  negative: [
    /\b(?:unqualified|no\s+experience|amateur|layperson)\b/i,
    /\b(?:anonymous|unknown\s+source|unverified)\b/i,
  ],
};

const PATHOS_INDICATORS = {
  positive: [
    /\b(?:hope|inspire|uplift|encourage|motivate|empower)\b/i,
    /\b(?:compassion|empathy|care|concern|solidarity)\b/i,
  ],
  negative: [
    /\b(?:fear|terror|panic|alarm|danger|threat|crisis|disaster|catastrophe)\b/i,
    /\b(?:anger|outrage|furious|infuriating|unacceptable)\b/i,
    /\b(?:pity|sympathy|heartbreaking|devastating|tragic)\b/i,
    /\b(?:guilt|shame|should\s+feel|ought\s+to\s+feel)\b/i,
    /\b(?:pride|arrogance|superior|elite|exclusive)\b/i,
    /\b(?:think\s+of\s+the|imagine\s+if|what\s+if)\b/i,
    /\b(?:children|families|victims|innocent|helpless)\b/i,
  ],
};

const LOGOS_INDICATORS = {
  positive: [
    /\b(?:data|statistics|evidence|research|study|analysis|facts|figures)\b/i,
    /\b(?:therefore|thus|hence|consequently|follows|implies|logic)\b/i,
    /\b(?:because|since|as\s+a\s+result|due\s+to)\b/i,
    /\b(?:premise|conclusion|argument|reasoning|deduction|induction)\b/i,
    /\d+(?:\.\d+)?%|\d+(?:,\d{3})*(?:\.\d+)?/,
    /\b(?:correlation|causation|significant|p.value|confidence\s+interval)\b/i,
  ],
  negative: [
    /\b(?:obviously|clearly|everyone\s+knows|common\s+sense|self.evident)\b/i,
    /\b(?:just\s+trust\s+me|believe\s+me|take\s+my\s+word)\b/i,
  ],
};

/**
 * Cognitive bias patterns
 */
const COGNITIVE_BIASES = [
  {
    name: 'Confirmation Bias',
    category: 'decision' as const,
    patterns: [
      /\b(?:confirm|support|prove)\s+(?:my|our|the)\s+(?:belief|view|opinion|theory)/gi,
      /\bignoring?\s+(?:evidence|data|facts)\s+that\s+(?:contradict|oppose)/gi,
      /\bonly\s+(?:looking|searching)\s+for\s+(?:evidence|information)\s+that/gi,
    ],
    description: 'Favoring information that confirms pre-existing beliefs.',
  },
  {
    name: 'Availability Heuristic',
    category: 'probability' as const,
    patterns: [
      /\b(?:recent|latest|just\s+happened|breaking)\s+(?:news|event|study|case)/gi,
      /\b(?:vivid|memorable|dramatic|shocking)\s+(?:example|case|story)/gi,
      /\b(?:everyone\s+is\s+talking\s+about|trending|viral)\b/gi,
    ],
    description: 'Overestimating importance of information that is readily available.',
  },
  {
    name: 'Anchoring Bias',
    category: 'decision' as const,
    patterns: [
      /\b(?:first|initial|original)\s+(?:number|figure|estimate|price|offer)/gi,
      /\bstarting\s+(?:from|at|with)\s+\d+/gi,
      /\banchor(?:ed|ing)?\s+(?:at|to|on)/gi,
    ],
    description: 'Relying too heavily on the first piece of information encountered.',
  },
  {
    name: 'Bandwagon Effect',
    category: 'social' as const,
    patterns: [
      /\b(?:everyone|everybody|most\s+people|the\s+majority|millions)\s+(?:are|use|buy|believe|think|agree)/gi,
      /\b(?:popular|trending|viral|best.selling|widely\s+used)\b/gi,
      /\bjoin\s+(?:the\s+)?(?:millions|thousands|movement)\b/gi,
    ],
    description: 'Adopting beliefs or behaviors because many others do.',
  },
  {
    name: 'Authority Bias',
    category: 'social' as const,
    patterns: [
      /\b(?:expert|authority|celebrity|influencer|leader)\s+(?:says|recommends|endorses|supports)/gi,
      /\bas\s+(?:an\s+)?(?:expert|authority|professional)\b/gi,
      /\b(?:dr\.|prof\.)\s+\w+\s+(?:says|states|recommends)/gi,
    ],
    description: 'Overvaluing opinions from perceived authority figures.',
  },
  {
    name: 'Halo Effect',
    category: 'attribution' as const,
    patterns: [
      /\b(?:beautiful|attractive|successful|famous|rich)\s+(?:person|people|expert|source)\b/gi,
      /\b(?:good\s+looking|well\s+dressed|charismatic)\s+(?:so|therefore)\b/gi,
    ],
    description: 'Letting one positive trait influence overall judgment.',
  },
  {
    name: 'Sunk Cost Fallacy',
    category: 'decision' as const,
    patterns: [
      /\b(?:already\s+(?:invested|spent|put\s+in)|so\s+far)\s+(?:much|a\s+lot)\b/gi,
      /\bcan\'t\s+(?:quit|stop|give\s+up)\s+now\b/gi,
      /\bwaste\s+(?:of|the)\s+(?:time|money|effort)\b/gi,
    ],
    description: 'Continuing an endeavor due to past investment despite negative outcomes.',
  },
  {
    name: 'Fundamental Attribution Error',
    category: 'attribution' as const,
    patterns: [
      /\b(?:he|she|they|people)\s+(?:is|are)\s+(?:lazy|stupid|greedy|selfish|evil)\b/gi,
      /\b(?:character|personality|nature)\s+(?:flaw|defect|problem)\b/gi,
      /\bnot\s+(?:the\s+)?(?:situation|circumstances|context)\b/gi,
    ],
    description: 'Overemphasizing personality traits and underemphasizing situational factors.',
  },
  {
    name: 'Optimism Bias',
    category: 'probability' as const,
    patterns: [
      /\b(?:will\s+surely|definitely\s+will|certain\s+to|guaranteed\s+to)\s+\w+/gi,
      /\b(?:no\s+risk|risk.free|can\'t\s+fail|won\'t\s+go\s+wrong)\b/gi,
      /\beverything\s+will\s+(?:work\s+out|be\s+fine|turn\s+out\s+well)\b/gi,
    ],
    description: 'Overestimating positive outcomes and underestimating risks.',
  },
  {
    name: 'Negativity Bias',
    category: 'memory' as const,
    patterns: [
      /\b(?:worst|terrible|awful|horrible|disastrous|catastrophic)\b/gi,
      /\b(?:danger|threat|risk|problem|issue|failure)\b/gi,
      /\b(?:never\s+works|always\s+fails|nothing\s+works)\b/gi,
    ],
    description: 'Giving more weight to negative information than positive.',
  },
  {
    name: 'Survivorship Bias',
    category: 'memory' as const,
    patterns: [
      /\b(?:successful|winners|survivors)\s+(?:show|prove|demonstrate)/gi,
      /\b(?:those\s+who\s+(?:succeeded|made\s+it|survived))\b/gi,
      /\bignoring?\s+(?:failures|those\s+who\s+(?:failed|didn\'t\s+make\s+it))\b/gi,
    ],
    description: 'Focusing on successes while ignoring failures.',
  },
  {
    name: 'False Cause / Correlation-Causation',
    category: 'probability' as const,
    patterns: [
      /\b(?:because|since|due\s+to)\s+.+\s+(?:happened|occurred|resulted)\b/gi,
      /\bcorrelation\s+(?:means|proves|shows)\s+causation/gi,
      /\b(?:after|following)\s+.+,\s+(?:therefore|so)\s+.+/gi,
    ],
    description: 'Assuming causation from correlation alone.',
  },
];

/**
 * Persuasion technique patterns
 */
const PERSUASION_TECHNIQUES = [
  {
    name: 'Social Proof',
    type: 'psychological' as const,
    patterns: [
      /\b(?:testimonial|review|rating|endorsement)\b/gi,
      /\b(?:customers|users|clients|patients)\s+(?:love|recommend|swear\s+by)/gi,
      /\b(?:join|trusted\s+by)\s+\d+\s+(?:users|customers|people)/gi,
    ],
    description: 'Using others\' actions to validate a choice.',
    effectiveness: 'high' as const,
  },
  {
    name: 'Scarcity',
    type: 'psychological' as const,
    patterns: [
      /\b(?:limited|only|few)\s+(?:left|available|remaining|spots|items)/gi,
      /\b(?:last\s+chance|final\s+offer|ending\s+soon|while\s+supplies\s+last)/gi,
      /\bexclusive|rare|unique|one.of.a.kind\b/gi,
    ],
    description: 'Creating urgency through limited availability.',
    effectiveness: 'high' as const,
  },
  {
    name: 'Reciprocity',
    type: 'psychological' as const,
    patterns: [
      /\b(?:free|gift|bonus|complimentary)\b/gi,
      /\bgive\s+(?:you|away)\s+(?:free|something)\b/gi,
      /\bin\s+return\s+for\b/gi,
    ],
    description: 'Offering something free to create obligation.',
    effectiveness: 'medium' as const,
  },
  {
    name: 'Commitment & Consistency',
    type: 'psychological' as const,
    patterns: [
      /\b(?:pledge|commit|promise|agree)\s+to\b/gi,
      /\b(?:consistent\s+with|in\s+line\s+with)\s+(?:your|our)\s+(?:values|beliefs|goals)\b/gi,
      /\bas\s+someone\s+who\s+(?:cares|believes|values)\b/gi,
    ],
    description: 'Leveraging desire to be consistent with past commitments.',
    effectiveness: 'high' as const,
  },
  {
    name: 'Likability',
    type: 'rhetorical' as const,
    patterns: [
      /\b(?:friend|buddy|pal|we\'re\s+in\s+this\s+together)\b/gi,
      /\b(?:just\s+like\s+you|i\s+understand|i\'ve\s+been\s+there)\b/gi,
      /\b(?:honest|transparent|genuine|authentic)\b/gi,
    ],
    description: 'Building rapport to increase persuasiveness.',
    effectiveness: 'medium' as const,
  },
  {
    name: 'Unity',
    type: 'rhetorical' as const,
    patterns: [
      /\b(?:we|us|our|together|community|tribe|family)\b/gi,
      /\b(?:insider|member|belong|part\s+of)\b/gi,
      /\bvs\.?\s+(?:them|outsiders|the\s+establishment)\b/gi,
    ],
    description: 'Creating shared identity to foster agreement.',
    effectiveness: 'high' as const,
  },
  {
    name: 'Framing Effect',
    type: 'structural' as const,
    patterns: [
      /\b(?:save|gain|benefit|advantage|opportunity)\b/gi,
      /\b(?:lose|loss|cost|disadvantage|risk)\b/gi,
      /\b(?:90%|ninety.percent)\s+(?:success|effective|survival)\b/gi,
      /\b(?:10%|ten.percent)\s+(?:failure|mortality|risk)\b/gi,
    ],
    description: 'Presenting equivalent information in different ways to influence decisions.',
    effectiveness: 'high' as const,
  },
  {
    name: 'Anchoring in Negotiation',
    type: 'structural' as const,
    patterns: [
      /\b(?:regular\s+price|originally|was)\s+\$\d+/gi,
      /\b(?:discount|off|save)\s+\d+%\b/gi,
      /\bcompare\s+(?:at|to)\s+\$\d+/gi,
    ],
    description: 'Setting a reference point to make subsequent offers seem better.',
    effectiveness: 'medium' as const,
  },
];

/**
 * Framing patterns
 */
const FRAMES = [
  {
    name: 'Gain Frame',
    patterns: [/\b(?:gain|benefit|advantage|improve|increase|boost|enhance|save)\b/gi],
    valence: 'positive' as const,
  },
  {
    name: 'Loss Frame',
    patterns: [/\b(?:lose|lose|loss|cost|risk|danger|harm|damage|miss\s+out)\b/gi],
    valence: 'negative' as const,
  },
  {
    name: 'Risk Frame',
    patterns: [/\b(?:risk|uncertain|probability|chance|likelihood|odds)\b/gi],
    valence: 'neutral' as const,
  },
  {
    name: 'Moral Frame',
    patterns: [/\b(?:right|wrong|ethical|moral|just|fair|unjust|immoral)\b/gi],
    valence: 'neutral' as const,
  },
  {
    name: 'Economic Frame',
    patterns: [/\b(?:cost|price|affordable|expensive|budget|financial|economic|money)\b/gi],
    valence: 'neutral' as const,
  },
  {
    name: 'Security Frame',
    patterns: [/\b(?:safe|secure|protect|defend|guard|shield|safety|security)\b/gi],
    valence: 'positive' as const,
  },
  {
    name: 'Freedom Frame',
    patterns: [/\b(?:free|freedom|liberty|choice|autonomy|independent|control)\b/gi],
    valence: 'positive' as const,
  },
];

/**
 * Emotional manipulation patterns
 */
const MANIPULATION_TECHNIQUES = [
  {
    name: 'Fear Mongering',
    patterns: [
      /\b(?:catastrophe|disaster|apocalypse|doom|end\s+of\s+the\s+world)\b/gi,
      /\b(?:if\s+we\s+don\'t|unless\s+we)\s+.+\s+(?:will|shall)\s+(?:die|fail|collapse|end)/gi,
      /\bimminent\s+(?:threat|danger|collapse|disaster)\b/gi,
    ],
    description: 'Exaggerating threats to provoke fear and compliance.',
    risk: 'high' as const,
  },
  {
    name: 'Guilt Tripping',
    patterns: [
      /\b(?:how\s+could\s+you|you\s+should\s+feel\s+(?:guilty|ashamed))\b/gi,
      /\b(?:think\s+of|what\s+about)\s+(?:the\s+)?(?:children|victims|poor|helpless)/gi,
      /\b(?:selfish|heartless|cruel|inhumane)\s+(?:if\s+you|to)\b/gi,
    ],
    description: 'Inducing guilt to manipulate behavior.',
    risk: 'high' as const,
  },
  {
    name: 'Love Bombing / Flattery',
    patterns: [
      /\b(?:you\s+are\s+(?:amazing|brilliant|special|unique|the\s+best))\b/gi,
      /\b(?:only\s+you|people\s+like\s+you|someone\s+as\s+(?:smart|wise|kind)\s+as\s+you)\b/gi,
      /\b(?:exclusive\s+offer|special\s+access|VIP)\s+for\s+you\b/gi,
    ],
    description: 'Excessive praise to lower defenses and create obligation.',
    risk: 'medium' as const,
  },
  {
    name: 'Gaslighting',
    patterns: [
      /\b(?:you\'re\s+(?:crazy|wrong|imagining|overreacting|too\s+sensitive))\b/gi,
      /\b(?:that\s+never\s+happened|i\s+never\s+said\s+that|you\'re\s+misremembering)\b/gi,
      /\b(?:everyone\s+agrees|no\s+one\s+else\s+thinks\s+that)\b/gi,
    ],
    description: 'Making someone question their own perception of reality.',
    risk: 'high' as const,
  },
  {
    name: 'False Urgency',
    patterns: [
      /\b(?:act\s+now|immediately|right\s+now|today\s+only|limited\s+time)\b/gi,
      /\b(?:deadline|expires|ends)\s+(?:soon|today|in\s+\d+\s+(?:hours|minutes))/gi,
      /\bdon\'t\s+(?:wait|delay|hesitate|miss\s+out)\b/gi,
    ],
    description: 'Creating artificial time pressure to prevent critical thinking.',
    risk: 'medium' as const,
  },
  {
    name: 'Us vs Them',
    patterns: [
      /\b(?:they|them|those\s+people|the\s+other\s+side)\s+(?:are|want|will)\s+(?:evil|dangerous|destroy|hurt)/gi,
      /\b(?:enemy|opponent|adversary|threat)\s+(?:to\s+us|to\s+our)\b/gi,
      /\b(?:protect\s+our|defend\s+our|save\s+our)\s+(?:way\s+of\s+life|values|future)\b/gi,
    ],
    description: 'Creating tribal division to bypass rational evaluation.',
    risk: 'high' as const,
  },
];

/**
 * Source credibility factors
 */
const CREDIBILITY_FACTORS: CredibilityFactor[] = [
  { factor: 'HTTPS', present: false, weight: 0.1 },
  { factor: 'Known domain (edu/gov/org)', present: false, weight: 0.3 },
  { factor: 'Reputable news/media', present: false, weight: 0.2 },
  { factor: 'Academic institution', present: false, weight: 0.3 },
  { factor: 'Author credentials visible', present: false, weight: 0.2 },
  { factor: 'Publication date recent', present: false, weight: 0.15 },
  { factor: 'Citations/references present', present: false, weight: 0.2 },
  { factor: 'Peer-reviewed', present: false, weight: 0.25 },
  { factor: 'Transparent funding', present: false, weight: 0.15 },
  { factor: 'No obvious conflict of interest', present: false, weight: 0.15 },
];

const REPUTABLE_DOMAINS = [
  'edu', 'gov', 'nih.gov', 'cdc.gov', 'who.int',
  'nature.com', 'science.org', 'cell.com', 'pnas.org',
  'arxiv.org', 'pubmed.ncbi.nlm.nih.gov',
  'reuters.com', 'apnews.com', 'bbc.com', 'npr.org',
  'economist.com', 'ft.com', 'wsj.com', 'nytimes.com',
  'washingtonpost.com', 'theguardian.com',
];

const LOW_CREDIBILITY_TLDS = ['xyz', 'top', 'club', 'online', 'site', 'space', 'info', 'biz'];

/**
 * Analyze rhetoric and bias from logic output.
 *
 * @param logicOutput The output from the Logic agent.
 * @param language UI language.
 * @returns Structured bias analysis output.
 */
export const analyzeBias = async (
  logicOutput: LogicOutput,
  _language: FactCheckLanguage = 'en',
): Promise<BiasOutput> => {
  const text = logicOutput.summary; // Use the logic summary as the text to analyze
  // Also consider the original claims' text
  const fullText = logicOutput.toulminStructure.claim?.text + ' ' +
    logicOutput.toulminStructure.grounds.map(g => g.text).join(' ') + ' ' +
    logicOutput.toulminStructure.warrant?.text + ' ' +
    logicOutput.toulminStructure.backing.map(b => b.text).join(' ') + ' ' +
    logicOutput.toulminStructure.qualifier?.text + ' ' +
    logicOutput.toulminStructure.rebuttal?.text + ' ' + text;

  // 1. Rhetorical analysis
  const rhetoric = analyzeRhetoric(fullText);

  // 2. Cognitive bias detection
  const cognitiveBiases = detectCognitiveBiases(fullText);

  // 3. Persuasion techniques
  const persuasionTechniques = detectPersuasionTechniques(fullText);

  // 4. Framing analysis
  const framing = analyzeFraming(fullText);

  // 5. Source credibility (from logic's evidence assessments)
  const sourceCredibility = assessSourceCredibility(logicOutput.evidenceAssessments);

  // 6. Emotional manipulation
  const emotionalManipulation = detectEmotionalManipulation(fullText);

  // 7. Generate summary
  const summary = generateBiasSummary(rhetoric, cognitiveBiases, persuasionTechniques, framing, emotionalManipulation);

  // 8. Calculate overall bias score
  const biasScore = calculateBiasScore(rhetoric, cognitiveBiases, persuasionTechniques, emotionalManipulation);

  return {
    rhetoric,
    cognitiveBiases,
    persuasionTechniques,
    framing,
    sourceCredibility,
    emotionalManipulation,
    summary,
    biasScore,
  };
};

/**
 * Analyze rhetorical appeals (Ethos, Pathos, Logos)
 */
function analyzeRhetoric(text: string): RhetoricAnalysis {
  const analyzeDimension = (indicators: typeof ETHOS_INDICATORS): RhetoricDimension => {
    const positiveMatches = indicators.positive.reduce((count, pattern) => {
      return count + (text.match(pattern) || []).length;
    }, 0);
    const negativeMatches = indicators.negative.reduce((count, pattern) => {
      return count + (text.match(pattern) || []).length;
    }, 0);

    const rawScore = positiveMatches * 0.1 - negativeMatches * 0.05;
    const score = Math.max(0, Math.min(1, rawScore));

    let level: RhetoricDimension['level'] = 'none';
    if (score >= 0.7) level = 'high';
    else if (score >= 0.4) level = 'moderate';
    else if (score > 0) level = 'low';

    const foundIndicators = [
      ...indicators.positive.filter(p => p.test(text)).map(p => p.source),
      ...indicators.negative.filter(p => p.test(text)).map(p => 'NOT ' + p.source),
    ];

    return {
      score,
      level,
      indicators: foundIndicators,
      evidence: foundIndicators.slice(0, 5),
    };
  };

  const ethos = analyzeDimension(ETHOS_INDICATORS);
  const pathos = analyzeDimension(PATHOS_INDICATORS);
  const logos = analyzeDimension(LOGOS_INDICATORS);

  // Determine overall balance
  const scores = { ethos: ethos.score, pathos: pathos.score, logos: logos.score };
  const maxScore = Math.max(scores.ethos, scores.pathos, scores.logos);
  let overallBalance: RhetoricAnalysis['overallBalance'] = 'balanced';

  if (maxScore > 0.3) {
    if (scores.ethos === maxScore && scores.ethos > scores.pathos * 1.3 && scores.ethos > scores.logos * 1.3) {
      overallBalance = 'ethos-heavy';
    } else if (scores.pathos === maxScore && scores.pathos > scores.ethos * 1.3 && scores.pathos > scores.logos * 1.3) {
      overallBalance = 'pathos-heavy';
    } else if (scores.logos === maxScore && scores.logos > scores.ethos * 1.3 && scores.logos > scores.pathos * 1.3) {
      overallBalance = 'logos-heavy';
    }
  }

  return { ethos, pathos, logos, overallBalance };
}

/**
 * Detect cognitive biases
 */
function detectCognitiveBiases(text: string): CognitiveBias[] {
  const biases: CognitiveBias[] = [];

  for (const bias of COGNITIVE_BIASES) {
    for (const pattern of bias.patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match.index !== undefined) {
          biases.push({
            name: bias.name,
            category: bias.category,
            description: bias.description,
            location: { start: match.index, end: match.index + match[0].length },
            quote: match[0].substring(0, 200),
            explanation: bias.description,
            confidence: 0.7, // Base confidence for pattern match
          });
        }
      }
    }
  }

  // Deduplicate
  const uniqueBiases: CognitiveBias[] = [];
  for (const b of biases) {
    const isDuplicate = uniqueBiases.some(
      ub => ub.name === b.name && Math.abs(ub.location.start - b.location.start) < 50,
    );
    if (!isDuplicate) uniqueBiases.push(b);
  }

  return uniqueBiases.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Detect persuasion techniques
 */
function detectPersuasionTechniques(text: string): PersuasionTechnique[] {
  const techniques: PersuasionTechnique[] = [];

  for (const tech of PERSUASION_TECHNIQUES) {
    for (const pattern of tech.patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match.index !== undefined) {
          techniques.push({
            name: tech.name,
            type: tech.type,
            description: tech.description,
            location: { start: match.index, end: match.index + match[0].length },
            quote: match[0].substring(0, 200),
            effectiveness: tech.effectiveness,
          });
        }
      }
    }
  }

  // Deduplicate
  const unique: PersuasionTechnique[] = [];
  for (const t of techniques) {
    const isDuplicate = unique.some(
      ut => ut.name === t.name && Math.abs(ut.location.start - t.location.start) < 50,
    );
    if (!isDuplicate) unique.push(t);
  }

  return unique.sort((a, b) => {
    const effOrder = { high: 3, medium: 2, low: 1 };
    return effOrder[b.effectiveness] - effOrder[a.effectiveness];
  });
}

/**
 * Analyze framing
 */
function analyzeFraming(text: string): FramingAnalysis {
  const frames: Frame[] = [];

  for (const frame of FRAMES) {
    const matches = frame.patterns.reduce((arr, pattern) => {
      return arr.concat([...text.matchAll(pattern)]);
    }, [] as RegExpMatchArray[]);

    if (matches.length > 0) {
      frames.push({
        name: frame.name,
        description: `${frame.name} framing detected`,
        evidence: matches.slice(0, 3).map(m => m[0]),
        valence: frame.valence,
      });
    }
  }

  // Determine dominant frame
  const dominantFrame = frames.length > 0
    ? frames.reduce((max, f) => f.evidence.length > max.evidence.length ? f : max).name
    : null;

  // Determine framing effect
  const positiveFrames = frames.filter(f => f.valence === 'positive').length;
  const negativeFrames = frames.filter(f => f.valence === 'negative').length;

  let framingEffect: FramingAnalysis['framingEffect'] = 'neutral';
  if (positiveFrames > negativeFrames * 1.5) framingEffect = 'positive';
  else if (negativeFrames > positiveFrames * 1.5) framingEffect = 'negative';
  else if (positiveFrames > 0 && negativeFrames > 0) framingEffect = 'mixed';

  return { frames, dominantFrame, framingEffect };
}

/**
 * Assess source credibility from evidence assessments
 */
function assessSourceCredibility(evidenceAssessments: LogicOutput['evidenceAssessments']): SourceCredibility {
  const sources: SourceAssessment[] = [];

  for (const assessment of evidenceAssessments) {
    for (const urlObj of assessment.supportingUrls) {
      try {
        const url = new URL(urlObj.url);
        const domain = url.hostname.replace('www.', '');

        let credibility: SourceAssessment['credibility'] = 'unknown';
        const factors: CredibilityFactor[] = CREDIBILITY_FACTORS.map(f => ({ ...f }));

        // Check HTTPS
        if (url.protocol === 'https:') {
          factors[0].present = true;
        }

        // Check known reputable domains
        const isReputable = REPUTABLE_DOMAINS.some(d => domain.includes(d));
        const isAcademic = /\.(?:edu|ac\.\w+)(?:\/|$)/i.test(domain);
        const isGov = /\.(?:gov|gov\.\w+)(?:\/|$)/i.test(domain);

        if (isAcademic) {
          factors[3].present = true;
          factors[1].present = true;
        } else if (isGov) {
          factors[1].present = true;
        } else if (isReputable) {
          factors[2].present = true;
        }

        // Check for low credibility TLDs
        const tld = domain.split('.').pop() || '';
        const isLowCredTLD = LOW_CREDIBILITY_TLDS.includes(tld);

        // Calculate credibility score
        let credScore = factors.reduce((sum, f) => sum + (f.present ? f.weight : 0), 0);
        if (isLowCredTLD) credScore -= 0.2;

        if (credScore >= 0.6) credibility = 'high';
        else if (credScore >= 0.3) credibility = 'moderate';
        else if (credScore > 0) credibility = 'low';
        else credibility = 'unknown';

        sources.push({ url: urlObj.url, domain, credibility, factors });
      } catch {
        sources.push({
          url: urlObj.url,
          domain: 'invalid',
          credibility: 'unknown',
          factors: CREDIBILITY_FACTORS.map(f => ({ ...f })),
        });
      }
    }
  }

  // Determine overall credibility
  const highCount = sources.filter(s => s.credibility === 'high').length;
  const moderateCount = sources.filter(s => s.credibility === 'moderate').length;
  const lowCount = sources.filter(s => s.credibility === 'low').length;

  let overallCredibility: SourceCredibility['overallCredibility'] = 'unknown';
  if (sources.length === 0) overallCredibility = 'unknown';
  else if (highCount > 0 && highCount >= moderateCount + lowCount) overallCredibility = 'high';
  else if (moderateCount > lowCount) overallCredibility = 'moderate';
  else if (lowCount > 0) overallCredibility = 'low';

  return { sources, overallCredibility };
}

/**
 * Detect emotional manipulation
 */
function detectEmotionalManipulation(text: string): EmotionalManipulation {
  const techniques: ManipulationTechnique[] = [];

  for (const tech of MANIPULATION_TECHNIQUES) {
    for (const pattern of tech.patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match.index !== undefined) {
          techniques.push({
            name: tech.name,
            description: tech.description,
            location: { start: match.index, end: match.index + match[0].length },
            quote: match[0].substring(0, 200),
            risk: tech.risk,
          });
        }
      }
    }
  }

  // Deduplicate
  const unique: ManipulationTechnique[] = [];
  for (const t of techniques) {
    const isDuplicate = unique.some(
      ut => ut.name === t.name && Math.abs(ut.location.start - t.location.start) < 50,
    );
    if (!isDuplicate) unique.push(t);
  }

  // Determine overall risk
  const highRisk = unique.filter(t => t.risk === 'high').length;
  const mediumRisk = unique.filter(t => t.risk === 'medium').length;

  let overallRisk: EmotionalManipulation['overallRisk'] = 'low';
  if (highRisk > 0) overallRisk = 'high';
  else if (mediumRisk > 1) overallRisk = 'high';
  else if (mediumRisk > 0) overallRisk = 'medium';

  return { techniques: unique, overallRisk };
}

/**
 * Generate bias analysis summary
 */
function generateBiasSummary(
  rhetoric: RhetoricAnalysis,
  cognitiveBiases: CognitiveBias[],
  persuasionTechniques: PersuasionTechnique[],
  framing: FramingAnalysis,
  emotionalManipulation: EmotionalManipulation,
): string {
  const parts: string[] = [];

  parts.push(`Rhetorical balance: ${rhetoric.overallBalance} (Ethos: ${rhetoric.ethos.level}, Pathos: ${rhetoric.pathos.level}, Logos: ${rhetoric.logos.level})`);

  if (cognitiveBiases.length > 0) {
    parts.push(`${cognitiveBiases.length} cognitive bias(es) detected: ${cognitiveBiases.map(b => b.name).join(', ')}`);
  } else {
    parts.push('No obvious cognitive biases detected.');
  }

  if (persuasionTechniques.length > 0) {
    parts.push(`${persuasionTechniques.length} persuasion technique(s): ${persuasionTechniques.map(t => t.name).join(', ')}`);
  } else {
    parts.push('No obvious persuasion techniques detected.');
  }

  if (framing.dominantFrame) {
    parts.push(`Dominant frame: ${framing.dominantFrame} (${framing.framingEffect} framing)`);
  }

  if (emotionalManipulation.techniques.length > 0) {
    parts.push(`${emotionalManipulation.techniques.length} emotional manipulation technique(s) detected (${emotionalManipulation.overallRisk} risk)`);
  } else {
    parts.push('No emotional manipulation detected.');
  }

  return parts.join(' | ');
}

/**
 * Calculate overall bias score (0-1, higher = more biased/manipulative)
 */
function calculateBiasScore(
  rhetoric: RhetoricAnalysis,
  cognitiveBiases: CognitiveBias[],
  persuasionTechniques: PersuasionTechnique[],
  emotionalManipulation: EmotionalManipulation,
): number {
  let score = 0;

  // Pathos-heavy rhetoric increases bias score
  if (rhetoric.overallBalance === 'pathos-heavy') score += 0.2;
  else if (rhetoric.overallBalance === 'ethos-heavy') score += 0.1; // Can be legitimate authority

  // Logos-heavy reduces bias score
  if (rhetoric.overallBalance === 'logos-heavy') score -= 0.15;

  // Cognitive biases
  score += cognitiveBiases.length * 0.05;

  // Persuasion techniques (weighted by effectiveness)
  for (const tech of persuasionTechniques) {
    if (tech.effectiveness === 'high') score += 0.08;
    else if (tech.effectiveness === 'medium') score += 0.04;
    else score += 0.02;
  }

  // Emotional manipulation
  for (const manip of emotionalManipulation.techniques) {
    if (manip.risk === 'high') score += 0.15;
    else if (manip.risk === 'medium') score += 0.08;
    else score += 0.03;
  }

  // Framing effect
  if (emotionalManipulation.overallRisk === 'high') score += 0.1;

  return Math.max(0, Math.min(1, score));
}

/**
 * Get a summary of the bias analysis for debugging/logging
 */
export const getBiasSummary = (output: BiasOutput): string => {
  return (
    `Bias Analysis Summary:\n` +
    `  Bias Score: ${(output.biasScore * 100).toFixed(1)}%\n` +
    `  Rhetoric: ${output.rhetoric.overallBalance} (E:${output.rhetoric.ethos.level}, P:${output.rhetoric.pathos.level}, L:${output.rhetoric.logos.level})\n` +
    `  Cognitive Biases: ${output.cognitiveBiases.length}\n` +
    `  Persuasion Techniques: ${output.persuasionTechniques.length}\n` +
    `  Framing: ${output.framing.dominantFrame || 'none'} (${output.framing.framingEffect})\n` +
    `  Source Credibility: ${output.sourceCredibility.overallCredibility}\n` +
    `  Emotional Manipulation: ${output.emotionalManipulation.overallRisk} risk (${output.emotionalManipulation.techniques.length} techniques)\n` +
    `  Summary: ${output.summary}`
  );
};