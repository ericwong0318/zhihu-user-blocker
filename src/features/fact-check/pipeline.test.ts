import { describe, it, expect, vi } from 'vitest';
import { runFactCheckPipeline, runFactCheckPipelineLocal } from './pipeline';
import { FactCheckResult } from './prompt';

describe('Fact-Check Multi-Agent Pipeline', () => {
  describe('runFactCheckPipelineLocal (local four-agent pipeline)', () => {
    it('should produce credible verdict for well-structured argument with strong evidence', async () => {
      const text = 'A randomized controlled trial published in Nature (https://nature.com/article/123) demonstrates 85% efficacy with p<0.001. This proves the treatment works because the mechanism is well understood. The study was replicated by independent researchers at MIT (https://mit.edu/study/456).';
      const result = await runFactCheckPipelineLocal(text, 'en');

      expect(result.verdict).toBe('credible');
      expect(result.validityVsTruth).toContain('strong logical coherence');
      expect(result.rhetoric.logos).toContain('Strong');
      expect(result.sources).toBeDefined();
      expect(result.sources?.length).toBeGreaterThan(0);
    });

    it('should produce misleading verdict for argument with high bias and fallacies', async () => {
      const text = 'You are stupid if you disagree! Everyone knows this is true. Think of the children! Act now or catastrophe will strike! Limited time only!';
      const result = await runFactCheckPipelineLocal(text, 'en');

      expect(result.verdict).toBe('misleading');
      expect(result.fallacies.length).toBeGreaterThan(0);
      expect(result.rhetoric.pathos).toContain('Strong');
    });

    it('should produce unverified verdict for weak evidence', async () => {
      const text = 'This method works very well. I think it is the best approach.';
      const result = await runFactCheckPipelineLocal(text, 'en');

      expect(result.verdict).toBe('unverified');
      expect(result.validityVsTruth).toContain('unsupported claim');
    });

    it('should detect formal fallacies like affirming the consequent', async () => {
      const text = 'If it rains then the ground is wet. The ground is wet, therefore it rained.';
      const result = await runFactCheckPipelineLocal(text, 'en');

      const hasFormalFallacy = result.fallacies.some(f =>
        f.name.includes('Affirming') || f.name.includes('Consequent')
      );
      expect(hasFormalFallacy).toBe(true);
    });

    it('should detect ad hominem fallacy', async () => {
      const text = 'You are an idiot and wrong. The author is stupid.';
      const result = await runFactCheckPipelineLocal(text, 'en');

      const hasAdHominem = result.fallacies.some(f =>
        f.name.includes('Ad Hominem') || f.name.includes('Cognitive Bias')
      );
      expect(hasAdHominem).toBe(true);
    });

    it('should analyze rhetoric (ethos, pathos, logos)', async () => {
      const text = 'As a professor with 20 years experience, I confirm this works. The data shows 80% effectiveness. This will save lives!';
      const result = await runFactCheckPipelineLocal(text, 'en');

      expect(result.rhetoric.ethos).toBeDefined();
      expect(result.rhetoric.pathos).toBeDefined();
      expect(result.rhetoric.logos).toBeDefined();
    });

    it('should detect cognitive biases', async () => {
      const text = 'This confirms my belief. I only look for evidence that supports my view. Everyone is doing it!';
      const result = await runFactCheckPipelineLocal(text, 'en');

      // Fallacies should include cognitive biases
      expect(result.fallacies.length).toBeGreaterThan(0);
    });

    it('should extract and include sources from URLs', async () => {
      const text = 'Study shows 80% effectiveness. https://arxiv.org/abs/1234.5678 https://pubmed.ncbi.nlm.nih.gov/12345';
      const result = await runFactCheckPipelineLocal(text, 'en');

      expect(result.sources).toBeDefined();
      expect(result.sources?.length).toBeGreaterThan(0);
      expect(result.sources?.[0].url).toContain('arxiv.org');
    });

    it('should handle empty/short input gracefully', async () => {
      const result = await runFactCheckPipelineLocal('', 'en');

      expect(result.verdict).toBe('unverified');
      expect(result.validityVsTruth).toContain('too short');
    });

    it('should handle Chinese text', async () => {
      const text = '研究表明75%的用户偏好这种方法。根据2023年的研究，结果显著。';
      const result = await runFactCheckPipelineLocal(text, 'zh-CN');

      expect(result.verdict).toBeDefined();
      expect(result.validityVsTruth).toBeDefined();
    });

    it('should detect contradictions', async () => {
      const text = 'This method works perfectly. This method does not work at all.';
      const result = await runFactCheckPipelineLocal(text, 'en');

      expect(result.validityVsTruth).toContain('contradiction');
    });

    it('should detect persuasion techniques', async () => {
      const text = 'Join millions of satisfied customers! Only 3 left! Free gift if you act now!';
      const result = await runFactCheckPipelineLocal(text, 'en');

      const hasPersuasion = result.fallacies.some(f =>
        f.name.includes('Persuasion') || f.name.includes('Social Proof') || f.name.includes('Scarcity')
      );
      expect(hasPersuasion).toBe(true);
    });

    it('should detect emotional manipulation', async () => {
      const text = 'You are crazy if you disagree! Think of the children! Act now or everyone dies!';
      const result = await runFactCheckPipelineLocal(text, 'en');

      const hasManipulation = result.fallacies.some(f =>
        f.name.includes('Emotional Manipulation') || f.name.includes('Fear') || f.name.includes('Guilt')
      );
      expect(hasManipulation).toBe(true);
    });

    it('should assess source credibility', async () => {
      const text = 'Random blog claims this works. https://randomblog.xyz/post';
      const result = await runFactCheckPipelineLocal(text, 'en');

      const hasCredibility = result.validityVsTruth.includes('credibility');
      const hasFallacies = result.fallacies.length > 0;
      expect(hasCredibility || hasFallacies).toBe(true);
    });
  });

  describe('runFactCheckPipeline (with external provider fallback)', () => {
    it('should return local pipeline result when verdict is definitive', async () => {
      const text = 'A peer-reviewed study in Nature (https://nature.com/article) shows 85% efficacy with p<0.001.';
      const onFactCheckMock = vi.fn().mockResolvedValue({
        validityVsTruth: 'Should not be called',
        rhetoric: { ethos: '', pathos: '', logos: '' },
        fallacies: [],
        verdict: 'credible',
      });

      const result = await runFactCheckPipeline(text, 'en', onFactCheckMock);

      // Local pipeline should produce credible verdict, so fallback not called
      expect(onFactCheckMock).not.toHaveBeenCalled();
      expect(result.verdict).toBe('credible');
      expect(result.provider).toBe('local-pipeline');
    });

    it('should fall back to external provider when local verdict is unverified', async () => {
      const text = 'This is a weak argument with no evidence.';
      const mockProviderResult: FactCheckResult = {
        validityVsTruth: 'Verified by external AI',
        rhetoric: { ethos: '', pathos: '', logos: '' },
        fallacies: [],
        verdict: 'credible',
      };

      const onFactCheckMock = vi.fn().mockResolvedValue(mockProviderResult);
      const onStageMock = vi.fn();

      const result = await runFactCheckPipeline(text, 'en', onFactCheckMock, onStageMock);

      expect(onFactCheckMock).toHaveBeenCalledWith(text, expect.any(Function));
      expect(result.verdict).toBe('credible');
      expect(result.validityVsTruth).toBe('Verified by external AI');
    });

    it('should fall back when local confidence is low', async () => {
      const text = 'This is a vague statement with no clear claim or evidence. It might be something or nothing.';
      const mockProviderResult: FactCheckResult = {
        validityVsTruth: 'External analysis result',
        rhetoric: { ethos: '', pathos: '', logos: '' },
        fallacies: [],
        verdict: 'misleading',
      };

      const onFactCheckMock = vi.fn().mockResolvedValue(mockProviderResult);
      const onStageMock = vi.fn();

      const result = await runFactCheckPipeline(text, 'en', onFactCheckMock, onStageMock);

      expect(onFactCheckMock).toHaveBeenCalled();
      expect(result.verdict).toBe('misleading');
    });

    it('should handle provider error gracefully', async () => {
      const text = 'Weak argument.';
      const onFactCheckMock = vi.fn().mockResolvedValue({ error: 'Provider failed' });

      const result = await runFactCheckPipeline(text, 'en', onFactCheckMock);

      expect(result.verdict).toBe('unverified');
      expect(result.validityVsTruth).toBe('Provider failed');
      expect(result.provider).toBe('error');
    });

    it('should pass stage callback to external provider', async () => {
      const text = 'Weak argument with no evidence.';
      const stages: string[] = [];
      const onFactCheckMock = vi.fn().mockImplementation(async (t, onStage) => {
        onStage?.('Provider stage 1', false);
        onStage?.('Provider stage 2', true);
        return { verdict: 'credible', validityVsTruth: 'OK', rhetoric: { ethos: '', pathos: '', logos: '' }, fallacies: [] };
      });

      const onStage = vi.fn((stage) => stages.push(stage));

      await runFactCheckPipeline(text, 'en', onFactCheckMock, onStage);

      expect(onFactCheckMock).toHaveBeenCalledWith(text, expect.any(Function));
    });
  });

  describe('Pipeline integration', () => {
    it('should produce consistent results for same input', async () => {
      const text = 'Study shows 80% effectiveness. https://example.edu/study';

      const result1 = await runFactCheckPipelineLocal(text, 'en');
      const result2 = await runFactCheckPipelineLocal(text, 'en');

      expect(result1.verdict).toBe(result2.verdict);
      expect(result1.validityVsTruth).toBe(result2.validityVsTruth);
    });

    it('should handle complex markdown input', async () => {
      const text = `# Research Findings

Recent studies demonstrate significant results:

- **Study 1**: 85% efficacy (https://nature.com/study1)
- **Study 2**: 78% efficacy (https://science.org/study2)

\`\`\`python
def analyze():
    return "significant"
\`\`\`

> Expert consensus supports this conclusion.

**Therefore**, this treatment is effective.`;

      const result = await runFactCheckPipelineLocal(text, 'en');

      expect(result.verdict).toBeDefined();
      expect(result.sources).toBeDefined();
      expect(result.sources?.length).toBeGreaterThan(0);
    });

    it('should handle argument with rebuttal', async () => {
      const text = 'This treatment works based on clinical trials. However, it may not work for all patients. Despite this limitation, the benefits outweigh risks. https://clinicaltrials.gov/study';
      const result = await runFactCheckPipelineLocal(text, 'en');

      const hasRebuttal = result.validityVsTruth.includes('rebuttal');
      const hasCounterargument = result.validityVsTruth.includes('counterargument');
      expect(hasRebuttal || hasCounterargument).toBe(true);
    });

    it('should handle argument with qualifier', async () => {
      const text = 'This approach probably works in most cases. It typically improves outcomes generally.';
      const result = await runFactCheckPipelineLocal(text, 'en');

      expect(result.validityVsTruth).toBeDefined();
    });
  });
});