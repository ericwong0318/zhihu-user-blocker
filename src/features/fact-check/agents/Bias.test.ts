import { describe, it, expect } from 'vitest';
import { analyzeBias, getBiasSummary } from './Bias';
import { LogicOutput } from './Logic';

describe('Bias Agent', () => {
  const createMockLogicOutput = (overrides: Partial<LogicOutput> = {}): LogicOutput => ({
    toulminStructure: {
      claim: { text: 'Main claim', type: 'factual', confidence: 0.8, position: { start: 0, end: 10 }, supportingUrls: [] },
      grounds: [],
      warrant: null,
      backing: [],
      qualifier: null,
      rebuttal: null,
      confidence: 0.5,
    },
    fallacies: [],
    evidenceAssessments: [],
    contradictions: [],
    coherenceScore: 0.5,
    summary: 'Test summary',
    ...overrides,
  });

  describe('analyzeBias', () => {
    it('should return BiasOutput with all required fields', async () => {
      const logicOutput = createMockLogicOutput();
      const result = await analyzeBias(logicOutput);

      expect(result).toHaveProperty('rhetoric');
      expect(result).toHaveProperty('cognitiveBiases');
      expect(result).toHaveProperty('persuasionTechniques');
      expect(result).toHaveProperty('framing');
      expect(result).toHaveProperty('sourceCredibility');
      expect(result).toHaveProperty('emotionalManipulation');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('biasScore');
      expect(typeof result.biasScore).toBe('number');
      expect(result.biasScore).toBeGreaterThanOrEqual(0);
      expect(result.biasScore).toBeLessThanOrEqual(1);
    });

    it('should detect pathos-heavy rhetoric with emotional language', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'This is terrifying and heartbreaking! Think of the children! We must act now or face catastrophe!',
      });
      const result = await analyzeBias(logicOutput);

      expect(result.rhetoric.pathos.level).toBe('high');
      expect(result.rhetoric.overallBalance).toBe('pathos-heavy');
    });

    it('should detect logos-heavy rhetoric with logical indicators', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'The data shows 75% effectiveness. Research demonstrates significant correlation. Therefore, the conclusion follows logically from the evidence.',
      });
      const result = await analyzeBias(logicOutput);

      expect(result.rhetoric.logos.level).toBe('high');
      expect(result.rhetoric.overallBalance).toBe('logos-heavy');
    });

    it('should detect ethos-heavy rhetoric with authority indicators', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'As a professor with 20 years of experience and published peer-reviewed research, I can confirm this is true based on my expertise.',
      });
      const result = await analyzeBias(logicOutput);

      expect(result.rhetoric.ethos.level).toBe('high');
      expect(result.rhetoric.overallBalance).toBe('ethos-heavy');
    });

    it('should detect confirmation bias', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'This confirms my belief. I only look for evidence that supports my view and ignore contradicting facts.',
      });
      const result = await analyzeBias(logicOutput);

      const confirmationBias = result.cognitiveBiases.find(b => b.name === 'Confirmation Bias');
      expect(confirmationBias).toBeDefined();
      expect(confirmationBias?.category).toBe('decision');
    });

    it('should detect availability heuristic', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'This just happened recently! Everyone is talking about this viral story. It must be important.',
      });
      const result = await analyzeBias(logicOutput);

      const availability = result.cognitiveBiases.find(b => b.name === 'Availability Heuristic');
      expect(availability).toBeDefined();
    });

    it('should detect anchoring bias', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'The first number was 100. Starting from that initial estimate, we can adjust slightly.',
      });
      const result = await analyzeBias(logicOutput);

      const anchoring = result.cognitiveBiases.find(b => b.name === 'Anchoring Bias');
      expect(anchoring).toBeDefined();
    });

    it('should detect bandwagon effect', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Everyone is using this! Millions of people agree. It is the most popular choice.',
      });
      const result = await analyzeBias(logicOutput);

      const bandwagon = result.cognitiveBiases.find(b => b.name === 'Bandwagon Effect');
      expect(bandwagon).toBeDefined();
    });

    it('should detect authority bias', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Dr. Smith says this is true. As an expert, the authority recommends this approach.',
      });
      const result = await analyzeBias(logicOutput);

      const authority = result.cognitiveBiases.find(b => b.name === 'Authority Bias');
      expect(authority).toBeDefined();
    });

    it('should detect sunk cost fallacy', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'We have already invested so much time and money. We can not stop now or it would be a waste.',
      });
      const result = await analyzeBias(logicOutput);

      const sunkCost = result.cognitiveBiases.find(b => b.name === 'Sunk Cost Fallacy');
      expect(sunkCost).toBeDefined();
    });

    it('should detect optimism bias', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'This will definitely work! It is guaranteed to succeed. There is no risk of failure.',
      });
      const result = await analyzeBias(logicOutput);

      const optimism = result.cognitiveBiases.find(b => b.name === 'Optimism Bias');
      expect(optimism).toBeDefined();
    });

    it('should detect negativity bias', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'This is the worst thing ever. Nothing works. Everything fails. Terrible disaster.',
      });
      const result = await analyzeBias(logicOutput);

      const negativity = result.cognitiveBiases.find(b => b.name === 'Negativity Bias');
      expect(negativity).toBeDefined();
    });

    it('should detect survivorship bias', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'The successful people show this works. Those who failed are ignored.',
      });
      const result = await analyzeBias(logicOutput);

      const survivorship = result.cognitiveBiases.find(b => b.name === 'Survivorship Bias');
      expect(survivorship).toBeDefined();
    });

    it('should detect false cause / correlation-causation', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'After the event happened, the result occurred. Therefore the event caused the result.',
      });
      const result = await analyzeBias(logicOutput);

      const falseCause = result.cognitiveBiases.find(b => b.name === 'False Cause / Correlation-Causation');
      expect(falseCause).toBeDefined();
    });

    it('should detect social proof persuasion technique', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Join millions of satisfied customers! Trusted by thousands. 95% of users recommend this.',
      });
      const result = await analyzeBias(logicOutput);

      const socialProof = result.persuasionTechniques.find(t => t.name === 'Social Proof');
      expect(socialProof).toBeDefined();
      expect(socialProof?.effectiveness).toBe('high');
    });

    it('should detect scarcity technique', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Only 3 left! Limited time offer. Last chance to buy before it is gone.',
      });
      const result = await analyzeBias(logicOutput);

      const scarcity = result.persuasionTechniques.find(t => t.name === 'Scarcity');
      expect(scarcity).toBeDefined();
      expect(scarcity?.effectiveness).toBe('high');
    });

    it('should detect reciprocity technique', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Get a free gift! We give you this bonus for free. In return for your support.',
      });
      const result = await analyzeBias(logicOutput);

      const reciprocity = result.persuasionTechniques.find(t => t.name === 'Reciprocity');
      expect(reciprocity).toBeDefined();
    });

    it('should detect commitment & consistency technique', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'As someone who cares about this issue, you should pledge to support us. Stay consistent with your values.',
      });
      const result = await analyzeBias(logicOutput);

      const commitment = result.persuasionTechniques.find(t => t.name === 'Commitment & Consistency');
      expect(commitment).toBeDefined();
    });

    it('should detect unity technique', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'We are all in this together. Our community stands united against them. Join our tribe.',
      });
      const result = await analyzeBias(logicOutput);

      const unity = result.persuasionTechniques.find(t => t.name === 'Unity');
      expect(unity).toBeDefined();
    });

    it('should detect framing effect technique', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Save 90%! Gain significant benefits. Avoid the 10% failure rate. This is an opportunity.',
      });
      const result = await analyzeBias(logicOutput);

      const framing = result.persuasionTechniques.find(t => t.name === 'Framing Effect');
      expect(framing).toBeDefined();
    });

    it('should detect gain framing', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'You will gain benefits and improve your situation. This advantage will enhance your results.',
      });
      const result = await analyzeBias(logicOutput);

      const gainFrame = result.framing.frames.find(f => f.name === 'Gain Frame');
      expect(gainFrame).toBeDefined();
      expect(gainFrame?.valence).toBe('positive');
    });

    it('should detect loss framing', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'You will lose money and miss out. The cost and risk of damage.',
      });
      const result = await analyzeBias(logicOutput);

      const lossFrame = result.framing.frames.find(f => f.name === 'Loss Frame');
      expect(lossFrame).toBeDefined();
      expect(lossFrame?.valence).toBe('negative');
    });

    it('should detect moral framing', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'This is the right thing to do. It is ethical and just. The moral choice is clear.',
      });
      const result = await analyzeBias(logicOutput);

      const moralFrame = result.framing.frames.find(f => f.name === 'Moral Frame');
      expect(moralFrame).toBeDefined();
    });

    it('should detect fear mongering', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'If we do not act now, catastrophe will strike! This is the end of the world. Imminent doom approaches.',
      });
      const result = await analyzeBias(logicOutput);

      const fearMongering = result.emotionalManipulation.techniques.find(t => t.name === 'Fear Mongering');
      expect(fearMongering).toBeDefined();
      expect(fearMongering?.risk).toBe('high');
      expect(result.emotionalManipulation.overallRisk).toBe('high');
    });

    it('should detect guilt tripping', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'How could you be so selfish? Think of the children! You should feel guilty if you do not help.',
      });
      const result = await analyzeBias(logicOutput);

      const guiltTrip = result.emotionalManipulation.techniques.find(t => t.name === 'Guilt Tripping');
      expect(guiltTrip).toBeDefined();
      expect(guiltTrip?.risk).toBe('high');
    });

    it('should detect gaslighting', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'You are crazy and imagining things. That never happened. Everyone agrees with me, not you.',
      });
      const result = await analyzeBias(logicOutput);

      const gaslighting = result.emotionalManipulation.techniques.find(t => t.name === 'Gaslighting');
      expect(gaslighting).toBeDefined();
      expect(gaslighting?.risk).toBe('high');
    });

    it('should detect false urgency', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Act now! Today only! Do not wait! Limited time offer ends in 2 hours!',
      });
      const result = await analyzeBias(logicOutput);

      const falseUrgency = result.emotionalManipulation.techniques.find(t => t.name === 'False Urgency');
      expect(falseUrgency).toBeDefined();
      expect(falseUrgency?.risk).toBe('medium');
    });

    it('should detect us vs them manipulation', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'They are the enemy trying to destroy us. Protect our way of life from those people. Save our future.',
      });
      const result = await analyzeBias(logicOutput);

      const usVsThem = result.emotionalManipulation.techniques.find(t => t.name === 'Us vs Them');
      expect(usVsThem).toBeDefined();
      expect(usVsThem?.risk).toBe('high');
    });

    it('should assess source credibility for academic domains', async () => {
      const logicOutput = createMockLogicOutput({
        evidenceAssessments: [{
          claim: { text: 'Test', type: 'factual', confidence: 0.8, position: { start: 0, end: 4 }, supportingUrls: ['https://arxiv.org/abs/1234'] },
          supportingUrls: [{ url: 'https://arxiv.org/abs/1234', title: '', context: '', isLikelyCitation: true }],
          evidenceQuality: 'strong',
          verificationNeeded: false,
          suggestedQueries: [],
        }],
      });
      const result = await analyzeBias(logicOutput);

      expect(result.sourceCredibility.sources.length).toBeGreaterThan(0);
      const source = result.sourceCredibility.sources[0];
      expect(source.credibility).toBe('high');
      expect(source.domain).toContain('arxiv.org');
    });

    it('should assess source credibility for reputable news', async () => {
      const logicOutput = createMockLogicOutput({
        evidenceAssessments: [{
          claim: { text: 'Test', type: 'factual', confidence: 0.8, position: { start: 0, end: 4 }, supportingUrls: ['https://reuters.com/article/123'] },
          supportingUrls: [{ url: 'https://reuters.com/article/123', title: '', context: '', isLikelyCitation: true }],
          evidenceQuality: 'moderate',
          verificationNeeded: true,
          suggestedQueries: [],
        }],
      });
      const result = await analyzeBias(logicOutput);

      const source = result.sourceCredibility.sources[0];
      expect(source.credibility).toBe('moderate');
    });

    it('should assess low credibility for unknown domains', async () => {
      const logicOutput = createMockLogicOutput({
        evidenceAssessments: [{
          claim: { text: 'Test', type: 'factual', confidence: 0.8, position: { start: 0, end: 4 }, supportingUrls: ['https://randomblog.xyz/post'] },
          supportingUrls: [{ url: 'https://randomblog.xyz/post', title: '', context: '', isLikelyCitation: false }],
          evidenceQuality: 'weak',
          verificationNeeded: true,
          suggestedQueries: [],
        }],
      });
      const result = await analyzeBias(logicOutput);

      const source = result.sourceCredibility.sources[0];
      expect(source.credibility).toBe('low');
    });

    it('should generate meaningful summary', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Test argument with some emotional language.',
      });
      const result = await analyzeBias(logicOutput);

      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.summary).toContain('Rhetorical balance');
    });

    it('should calculate bias score between 0 and 1', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Terrifying catastrophe! Everyone agrees! Act now or die! Limited time!',
      });
      const result = await analyzeBias(logicOutput);

      expect(result.biasScore).toBeGreaterThanOrEqual(0);
      expect(result.biasScore).toBeLessThanOrEqual(1);
    });

    it('should have lower bias score for logos-heavy balanced argument', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Data shows 75% effectiveness. Research confirms the results. Logical analysis follows from evidence.',
      });
      const result = await analyzeBias(logicOutput);

      expect(result.biasScore).toBeLessThan(0.5);
    });

    it('should have higher bias score for pathos-heavy manipulative argument', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Terrifying disaster! Think of the children! You are selfish if you disagree! Everyone knows this! Act now!',
      });
      const result = await analyzeBias(logicOutput);

      expect(result.biasScore).toBeGreaterThan(0.3);
    });

    it('should handle empty input gracefully', async () => {
      const logicOutput = createMockLogicOutput({
        summary: '',
        toulminStructure: {
          claim: null,
          grounds: [],
          warrant: null,
          backing: [],
          qualifier: null,
          rebuttal: null,
          confidence: 0,
        },
      });
      const result = await analyzeBias(logicOutput);

      expect(result.rhetoric.overallBalance).toBe('balanced');
      expect(result.cognitiveBiases).toEqual([]);
      expect(result.persuasionTechniques).toEqual([]);
      expect(result.framing.frames).toEqual([]);
      expect(result.emotionalManipulation.techniques).toEqual([]);
      expect(result.biasScore).toBe(0);
    });

    it('should deduplicate cognitive biases at similar positions', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'This confirms my belief and supports my view and proves my theory.',
      });
      const result = await analyzeBias(logicOutput);

      const confirmationBiases = result.cognitiveBiases.filter(b => b.name === 'Confirmation Bias');
      expect(confirmationBiases.length).toBeLessThanOrEqual(1);
    });

    it('should deduplicate persuasion techniques at similar positions', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Join millions of users! Trusted by thousands! Everyone is using this!',
      });
      const result = await analyzeBias(logicOutput);

      const socialProofs = result.persuasionTechniques.filter(t => t.name === 'Social Proof');
      expect(socialProofs.length).toBeLessThanOrEqual(1);
    });

    it('should provide bias summary for debugging', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Test argument.',
      });
      const result = await analyzeBias(logicOutput);
      const summary = getBiasSummary(result);

      expect(summary).toContain('Bias Analysis Summary');
      expect(summary).toContain('Bias Score:');
      expect(summary).toContain('Rhetoric:');
      expect(summary).toContain('Cognitive Biases:');
      expect(summary).toContain('Persuasion Techniques:');
      expect(summary).toContain('Framing:');
      expect(summary).toContain('Source Credibility:');
      expect(summary).toContain('Emotional Manipulation:');
      expect(summary).toContain('Summary:');
    });

    it('should detect fundamental attribution error', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'He is lazy and stupid. It is his character flaw, not the situation.',
      });
      const result = await analyzeBias(logicOutput);

      const fae = result.cognitiveBiases.find(b => b.name === 'Fundamental Attribution Error');
      expect(fae).toBeDefined();
    });

    it('should detect halo effect', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'The beautiful successful person must be right. Good looking experts are trustworthy.',
      });
      const result = await analyzeBias(logicOutput);

      const halo = result.cognitiveBiases.find(b => b.name === 'Halo Effect');
      expect(halo).toBeDefined();
    });

    it('should detect likability technique', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'I understand, I have been there too. We are friends, just like you. I am honest and genuine.',
      });
      const result = await analyzeBias(logicOutput);

      const likability = result.persuasionTechniques.find(t => t.name === 'Likability');
      expect(likability).toBeDefined();
    });

    it('should detect commitment & consistency technique', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'You promised to support this. Stay consistent with your pledge. As someone who values this, you must agree.',
      });
      const result = await analyzeBias(logicOutput);

      const commitment = result.persuasionTechniques.find(t => t.name === 'Commitment & Consistency');
      expect(commitment).toBeDefined();
    });

    it('should detect economic frame', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'The cost is affordable. Price is low. Budget friendly financial decision.',
      });
      const result = await analyzeBias(logicOutput);

      const economic = result.framing.frames.find(f => f.name === 'Economic Frame');
      expect(economic).toBeDefined();
    });

    it('should detect security frame', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'This protects your safety. Secure and safe. We guard your security.',
      });
      const result = await analyzeBias(logicOutput);

      const security = result.framing.frames.find(f => f.name === 'Security Frame');
      expect(security).toBeDefined();
    });

    it('should detect freedom frame', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'You have the freedom to choose. Liberty and autonomy. Independent control.',
      });
      const result = await analyzeBias(logicOutput);

      const freedom = result.framing.frames.find(f => f.name === 'Freedom Frame');
      expect(freedom).toBeDefined();
    });

    it('should detect risk frame', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'There is a risk and uncertainty. Probability of chance. Likelihood and odds.',
      });
      const result = await analyzeBias(logicOutput);

      const risk = result.framing.frames.find(f => f.name === 'Risk Frame');
      expect(risk).toBeDefined();
    });

    it('should detect anchoring in negotiation', async () => {
      const logicOutput = createMockLogicOutput({
        summary: 'Regular price was $100. Discount 50% off! Compare at $200!',
      });
      const result = await analyzeBias(logicOutput);

      const anchoring = result.persuasionTechniques.find(t => t.name === 'Anchoring in Negotiation');
      expect(anchoring).toBeDefined();
    });
  });
});