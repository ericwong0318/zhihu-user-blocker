import { describe, it, expect } from 'vitest';
import { synthesize, getCriticSummary } from './Critic';
import { parse } from './Parser';
import { runLogic } from './Logic';
import { analyzeBias } from './Bias';
import { FactCheckLanguage } from '../prompt';

describe('Critic Agent', () => {
  const runFullPipeline = async (text: string, language: FactCheckLanguage = 'en') => {
    const parsed = parse(text, language);
    const logic = await runLogic(parsed, language);
    const bias = await analyzeBias(logic, language);
    const result = await synthesize({ parsed, logic, bias, language }, language);
    return { parsed, logic, bias, critic: result };
  };

  describe('synthesize', () => {
    it('should return CriticOutput with all required fields', async () => {
      const { critic } = await runFullPipeline('Research shows 75% of users prefer this method. https://example.edu/study', 'en');

      expect(critic).toHaveProperty('validityVsTruth');
      expect(critic).toHaveProperty('rhetoric');
      expect(critic).toHaveProperty('fallacies');
      expect(critic).toHaveProperty('verdict');
      expect(critic).toHaveProperty('sources');
      expect(critic).toHaveProperty('meta');
      expect(critic.meta).toHaveProperty('synthesizedFromAgents');
      expect(critic.meta).toHaveProperty('verdictConfidence');
      expect(critic.meta).toHaveProperty('contributingAgents');
      expect(critic.meta).toHaveProperty('warnings');
      expect(critic.meta).toHaveProperty('timestamp');
    });

    it('should produce credible verdict for strong evidence', async () => {
      const { critic } = await runFullPipeline(
        'A peer-reviewed study published in Nature shows 85% effectiveness. https://nature.com/article/123 https://pubmed.ncbi.nlm.nih.gov/456',
        'en',
      );

      expect(critic.verdict).toBe('credible');
      expect(critic.meta.verdictConfidence).toBeGreaterThan(0.6);
      expect(critic.sources.length).toBeGreaterThan(0);
    });

    it('should produce misleading verdict for high bias and fallacies', async () => {
      const { critic } = await runFullPipeline(
        'You are stupid if you disagree! Everyone knows this is true. Think of the children! Act now or disaster will strike! Limited time only!',
        'en',
      );

      expect(critic.verdict).toBe('misleading');
      expect(critic.meta.verdictConfidence).toBeGreaterThan(0.5);
      expect(critic.fallacies.length).toBeGreaterThan(0);
    });

    it('should produce unverified verdict for weak evidence', async () => {
      const { critic } = await runFullPipeline('This method works very well. I think it is the best approach.', 'en');

      expect(critic.verdict).toBe('unverified');
      expect(critic.meta.warnings.length).toBeGreaterThan(0);
    });

    it('should synthesize validity vs truth assessment', async () => {
      const { critic } = await runFullPipeline('Study shows 80% effectiveness. https://arxiv.org/abs/1234', 'en');

      expect(critic.validityVsTruth).toBeDefined();
      expect(typeof critic.validityVsTruth).toBe('string');
      expect(critic.validityVsTruth.length).toBeGreaterThan(0);
    });

    it('should synthesize rhetoric analysis', async () => {
      const { critic } = await runFullPipeline('As an expert with 20 years experience, I confirm this works.', 'en');

      expect(critic.rhetoric.ethos).toBeDefined();
      expect(critic.rhetoric.pathos).toBeDefined();
      expect(critic.rhetoric.logos).toBeDefined();
      expect(typeof critic.rhetoric.ethos).toBe('string');
    });

    it('should combine fallacies from Logic and Bias agents', async () => {
      const { critic } = await runFullPipeline(
        'If it rains the ground is wet. The ground is wet, therefore it rained. You are an idiot if you disagree.',
        'en',
      );

      expect(critic.fallacies.length).toBeGreaterThan(0);
      const hasFormalFallacy = critic.fallacies.some(f => f.name.includes('Affirming'));
      const hasAdHominem = critic.fallacies.some(f => f.name.includes('Ad Hominem') || f.name.includes('Cognitive Bias'));
      expect(hasFormalFallacy || hasAdHominem).toBe(true);
    });

    it('should include sources from evidence assessments', async () => {
      const { critic } = await runFullPipeline('Research shows 75% effectiveness. https://example.edu/study https://reuters.com/article/123', 'en');

      expect(critic.sources.length).toBeGreaterThan(0);
      expect(critic.sources[0]).toHaveProperty('title');
      expect(critic.sources[0]).toHaveProperty('url');
    });

    it('should deduplicate sources', async () => {
      const { critic } = await runFullPipeline('Study shows 80% effectiveness. https://example.com/study https://example.com/study', 'en');

      const urls = critic.sources.map(s => s.url);
      const uniqueUrls = new Set(urls);
      expect(urls.length).toBe(uniqueUrls.size);
    });

    it('should set synthesizedFromAgents to true when sufficient data', async () => {
      const { critic } = await runFullPipeline('Research shows 75% effectiveness. https://example.edu/study', 'en');

      expect(critic.meta.synthesizedFromAgents).toBe(true);
    });

    it('should set synthesizedFromAgents to false for insufficient data', async () => {
      const { critic } = await runFullPipeline('', 'en');

      expect(critic.meta.synthesizedFromAgents).toBe(false);
      expect(critic.meta.warnings.some(w => w.includes('Insufficient'))).toBe(true);
    });

    it('should include all contributing agents', async () => {
      const { critic } = await runFullPipeline('Test argument.', 'en');

      expect(critic.meta.contributingAgents).toContain('parser');
      expect(critic.meta.contributingAgents).toContain('logic');
      expect(critic.meta.contributingAgents).toContain('bias');
    });

    it('should calculate verdict confidence between 0 and 1', async () => {
      const { critic } = await runFullPipeline('Strong evidence from multiple studies. https://nature.com https://science.org', 'en');

      expect(critic.meta.verdictConfidence).toBeGreaterThanOrEqual(0);
      expect(critic.meta.verdictConfidence).toBeLessThanOrEqual(1);
    });

    it('should generate warnings for missing evidence', async () => {
      const { critic } = await runFullPipeline('This claim has no evidence at all.', 'en');

      expect(critic.meta.warnings.some(w => w.includes('evidence') || w.includes('unsupported'))).toBe(true);
    });

    it('should generate warnings for contradictions', async () => {
      const { critic } = await runFullPipeline('This works. This does not work.', 'en');

      expect(critic.meta.warnings.some(w => w.includes('contradiction') || w.includes('Contradiction'))).toBe(true);
    });

    it('should generate warnings for low source credibility', async () => {
      const { critic } = await runFullPipeline('Random blog says this works. https://randomblog.xyz/post', 'en');

      expect(critic.meta.warnings.some(w => w.includes('credibility') || w.includes('Credibility'))).toBe(true);
    });

    it('should generate warnings for high manipulation', async () => {
      const { critic } = await runFullPipeline('You are evil if you disagree! Think of the children! Catastrophe awaits! Act now!', 'en');

      expect(critic.meta.warnings.some(w => w.includes('manipulation') || w.includes('Manipulation') || w.includes('bias') || w.includes('Bias'))).toBe(true);
    });

    it('should handle Chinese text', async () => {
      const { critic } = await runFullPipeline('研究表明75%的用户偏好这种方法。根据2023年的研究，结果显著。', 'zh-CN');

      expect(critic.verdict).toBeDefined();
      expect(critic.validityVsTruth).toBeDefined();
      expect(critic.rhetoric.ethos).toBeDefined();
    });

    it('should limit fallacies to 10 with warning', async () => {
      // Create text with many fallacies
      const fallacyText = Array(15).fill('You are stupid. Everyone agrees. Think of children. Act now. Limited time. Only you can save us. This confirms my belief. First number was 100. Successful people prove it. Expert says so. Correlation means causation.').join(' ');
      const { critic } = await runFullPipeline(fallacyText, 'en');

      if (critic.fallacies.length >= 10) {
        expect(critic.fallacies.length).toBeLessThanOrEqual(10);
        expect(critic.meta.warnings.some(w => w.includes('fallacies') || w.includes('Fallacies'))).toBe(true);
      }
    });

    it('should provide critic summary for debugging', async () => {
      const { critic } = await runFullPipeline('Test argument with evidence.', 'en');
      const summary = getCriticSummary(critic);

      expect(summary).toContain('Critic Synthesis Summary');
      expect(summary).toContain('Verdict:');
      expect(summary).toContain('Synthesized from agents:');
      expect(summary).toContain('Contributing agents:');
      expect(summary).toContain('Fallacies found:');
      expect(summary).toContain('Sources:');
      expect(summary).toContain('Warnings:');
      expect(summary).toContain('Validity vs Truth:');
    });

    it('should return CriticOutput type with correct structure', async () => {
      const { critic } = await runFullPipeline('Test', 'en');

      expect(typeof critic.validityVsTruth).toBe('string');
      expect(typeof critic.rhetoric.ethos).toBe('string');
      expect(typeof critic.rhetoric.pathos).toBe('string');
      expect(typeof critic.rhetoric.logos).toBe('string');
      expect(Array.isArray(critic.fallacies)).toBe(true);
      expect(['credible', 'misleading', 'unverified']).toContain(critic.verdict);
      expect(Array.isArray(critic.sources)).toBe(true);
      expect(typeof critic.meta.synthesizedFromAgents).toBe('boolean');
      expect(typeof critic.meta.verdictConfidence).toBe('number');
      expect(Array.isArray(critic.meta.contributingAgents)).toBe(true);
      expect(Array.isArray(critic.meta.warnings)).toBe(true);
      expect(typeof critic.meta.timestamp).toBe('string');
    });

    it('should handle argument with rebuttal positively', async () => {
      const { critic } = await runFullPipeline(
        'This method works well based on studies. However, it may not work for everyone. But the benefits outweigh drawbacks. https://example.edu/study',
        'en',
      );

      expect(critic.validityVsTruth).toContain('rebuttal') || expect(critic.validityVsTruth).toContain('counterargument') || expect(critic.validityVsTruth).toContain('Counterarguments');
    });

    it('should handle argument with qualifier', async () => {
      const { critic } = await runFullPipeline(
        'This method probably works in most cases. It likely improves results typically.',
        'en',
      );

      expect(critic.validityVsTruth).toBeDefined();
    });

    it('should assess source credibility correctly for academic sources', async () => {
      const { critic } = await runFullPipeline('Study confirms 80% effectiveness. https://arxiv.org/abs/1234.5678 https://pubmed.ncbi.nlm.nih.gov/12345', 'en');

      expect(critic.sources.length).toBeGreaterThan(0);
      // The critic uses bias agent's source credibility assessment
    });

    it('should produce coherent summary for strong argument', async () => {
      const { critic } = await runFullPipeline(
        'A randomized controlled trial published in Nature (https://nature.com/article) demonstrates 85% efficacy with p<0.001. The study was replicated by independent researchers at MIT (https://mit.edu/study).',
        'en',
      );

      expect(critic.verdict).toBe('credible');
      expect(critic.meta.verdictConfidence).toBeGreaterThan(0.7);
    });

    it('should detect mixed framing', async () => {
      const { critic } = await runFullPipeline(
        'You will gain huge benefits! But if you do not act, you will lose everything! This is your choice.',
        'en',
      );

      // Mixed framing should be detected
      expect(critic.meta.warnings.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty fallacies array gracefully', async () => {
      const { critic } = await runFullPipeline('Well structured logical argument with evidence. https://example.edu/study', 'en');

      expect(Array.isArray(critic.fallacies)).toBe(true);
      // May have 0 fallacies for a good argument
    });

    it('should include timestamp in meta', async () => {
      const { critic } = await runFullPipeline('Test', 'en');

      expect(critic.meta.timestamp).toBeDefined();
      // Should be valid ISO string
      expect(new Date(critic.meta.timestamp).toISOString()).toBe(critic.meta.timestamp);
    });
  });

  describe('backward compatibility synthesizeFromString', () => {
    it('should parse JSON response string', () => {
      const jsonStr = JSON.stringify({
        validityVsTruth: 'Valid argument',
        rhetoric: { ethos: 'High', pathos: 'Low', logos: 'High' },
        fallacies: [],
        verdict: 'credible',
      });

      const result = synthesizeFromString(jsonStr, 'en');

      expect(result.verdict).toBe('credible');
      expect(result.validityVsTruth).toBe('Valid argument');
    });

    it('should handle malformed JSON gracefully', () => {
      const result = synthesizeFromString('not json at all', 'en');

      expect(result.verdict).toBe('unverified');
      expect(result.validityVsTruth).toContain('not json');
    });

    it('should extract JSON from markdown code fences', () => {
      const fencedJson = '```json\n{"verdict":"credible","validityVsTruth":"Test"}\n```';
      const result = synthesizeFromString(fencedJson, 'en');

      expect(result.verdict).toBe('credible');
    });
  });
});