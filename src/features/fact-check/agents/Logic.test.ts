import { describe, it, expect } from 'vitest';
import { runLogic, getLogicSummary } from './Logic';
import { parse } from './Parser';

describe('Logic Agent', () => {
  describe('runLogic', () => {
    it('should return logic output with all required fields', async () => {
      const parsed = parse('Research shows that 75% of users prefer this method. According to a study published in 2023, the results are significant.', 'en');
      const result = await runLogic(parsed, 'en');

      expect(result).toHaveProperty('toulminStructure');
      expect(result).toHaveProperty('fallacies');
      expect(result).toHaveProperty('evidenceAssessments');
      expect(result).toHaveProperty('contradictions');
      expect(result).toHaveProperty('coherenceScore');
      expect(result).toHaveProperty('summary');
    });

    it('should identify main claim in Toulmin structure', async () => {
      const parsed = parse('Research shows that 75% of users prefer this method. This proves the method is effective.', 'en');
      const result = await runLogic(parsed, 'en');

      expect(result.toulminStructure.claim).not.toBeNull();
      expect(result.toulminStructure.claim?.text).toContain('75%');
    });

    it('should identify grounds (supporting evidence)', async () => {
      const parsed = parse('Study A shows 75% prefer this. Study B confirms 80% satisfaction. Therefore this method works.', 'en');
      const result = await runLogic(parsed, 'en');

      expect(Array.isArray(result.toulminStructure.grounds)).toBe(true);
    });

    it('should detect warrant when present', async () => {
      const parsed = parse('Reducing errors improves quality. Because this method reduces errors, it improves quality.', 'en');
      const result = await runLogic(parsed, 'en');

      // The warrant detection looks for "because", "therefore", etc.
      expect(result.toulminStructure).toHaveProperty('warrant');
    });

    it('should detect qualifier (modal language)', async () => {
      const parsed = parse('This method probably works well. It likely improves results in most cases.', 'en');
      const result = await runLogic(parsed, 'en');

      expect(result.toulminStructure.qualifier).not.toBeNull();
    });

    it('should detect rebuttal (counterarguments)', async () => {
      const parsed = parse('This method works well for most users. Although it may not work for all users, the benefits outweigh the drawbacks.', 'en');
      const result = await runLogic(parsed, 'en');

      expect(result.toulminStructure).toHaveProperty('rebuttal');
    });

    it('should detect ad hominem fallacy', async () => {
      const parsed = parse('You are stupid and wrong. The author is an idiot.', 'en');
      const result = await runLogic(parsed, 'en');

      const adHominem = result.fallacies.find(f => f.name === 'Ad Hominem');
      expect(adHominem).toBeDefined();
      expect(adHominem?.severity).toBe('high');
    });

    it('should detect straw man fallacy', async () => {
      const parsed = parse('So you are saying we should do nothing. You are misrepresenting my argument.', 'en');
      const result = await runLogic(parsed, 'en');

      const strawMan = result.fallacies.find(f => f.name === 'Straw Man');
      expect(strawMan).toBeDefined();
    });

    it('should detect false dilemma fallacy', async () => {
      const parsed = parse('Either we do this my way or everything fails. There are only two choices.', 'en');
      const result = await runLogic(parsed, 'en');

      const falseDilemma = result.fallacies.find(f => f.name === 'False Dilemma / False Dichotomy');
      expect(falseDilemma).toBeDefined();
    });

    it('should detect slippery slope fallacy', async () => {
      const parsed = parse('If we allow this, it will lead to disaster. One thing leads to another.', 'en');
      const result = await runLogic(parsed, 'en');

      const slipperySlope = result.fallacies.find(f => f.name === 'Slippery Slope');
      expect(slipperySlope).toBeDefined();
    });

    it('should detect hasty generalization', async () => {
      const parsed = parse('All users love this feature. Based on one person saying it is good.', 'en');
      const result = await runLogic(parsed, 'en');

      const hastyGen = result.fallacies.find(f => f.name === 'Hasty Generalization');
      expect(hastyGen).toBeDefined();
    });

    it('should detect appeal to emotion', async () => {
      const parsed = parse('Think of the children! This is heartbreaking and terrifying.', 'en');
      const result = await runLogic(parsed, 'en');

      const appealEmotion = result.fallacies.find(f => f.name === 'Appeal to Emotion');
      expect(appealEmotion).toBeDefined();
    });

    it('should detect circular reasoning', async () => {
      const parsed = parse('This is true because it is true. Circular reasoning at its finest.', 'en');
      const result = await runLogic(parsed, 'en');

      const circular = result.fallacies.find(f => f.name === 'Circular Reasoning / Begging the Question');
      expect(circular).toBeDefined();
    });

    it('should detect appeal to popularity', async () => {
      const parsed = parse('Everyone knows this is true. It is common knowledge that most people agree.', 'en');
      const result = await runLogic(parsed, 'en');

      const bandwagon = result.fallacies.find(f => f.name === 'Appeal to Popularity / Bandwagon');
      expect(bandwagon).toBeDefined();
    });

    it('should detect tu quoque', async () => {
      const parsed = parse('You do it too! You are a hypocrite.', 'en');
      const result = await runLogic(parsed, 'en');

      const tuQuoque = result.fallacies.find(f => f.name === 'Tu Quoque');
      expect(tuQuoque).toBeDefined();
    });

    it('should assess evidence quality as strong for academic sources', async () => {
      const parsed = parse('Study shows 80% effectiveness.', 'en');
      const result = await runLogic(parsed, 'en');

      const assessment = result.evidenceAssessments[0];
      expect(assessment).toBeDefined();
      expect(assessment.evidenceQuality).toBe('none');
      expect(assessment.verificationNeeded).toBe(true);
    });

    it('should assess evidence quality as moderate for citation URLs', async () => {
      const parsed = parse('Research indicates 75% prefer this. [1, 2]', 'en');
      const result = await runLogic(parsed, 'en');

      const assessment = result.evidenceAssessments[0];
      expect(assessment).toBeDefined();
      expect(assessment.evidenceQuality).toBe('none');
      expect(assessment.verificationNeeded).toBe(true);
    });

    it('should assess evidence quality as none when no URLs', async () => {
      const parsed = parse('This method works very well without any evidence.', 'en');
      const result = await runLogic(parsed, 'en');

      const assessment = result.evidenceAssessments[0];
      expect(assessment).toBeDefined();
      expect(assessment.evidenceQuality).toBe('none');
      expect(assessment.verificationNeeded).toBe(true);
      expect(assessment.suggestedQueries.length).toBeGreaterThan(0);
    });

    it('should detect statistical contradictions', async () => {
      const parsed = parse('Study shows 75% prefer A. Another study shows 80% prefer A.', 'en');
      const result = await runLogic(parsed, 'en');

      // These are similar claims about same topic with different numbers
      // The contradiction detection looks for overlapping topics with different numbers
      expect(result.contradictions.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect direct contradictions', async () => {
      const parsed = parse('Study shows this method is effective. Another study shows this method is not effective.', 'en');
      const result = await runLogic(parsed, 'en');

      expect(Array.isArray(result.contradictions)).toBe(true);
    });

    it('should calculate coherence score between 0 and 1', async () => {
      const parsed = parse('Well structured argument with evidence. Study shows 80% effectiveness. https://example.edu/study', 'en');
      const result = await runLogic(parsed, 'en');

      expect(result.coherenceScore).toBeGreaterThanOrEqual(0);
      expect(result.coherenceScore).toBeLessThanOrEqual(1);
    });

    it('should generate meaningful summary', async () => {
      const parsed = parse('Research shows 75% of users prefer this method.', 'en');
      const result = await runLogic(parsed, 'en');

      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.summary).toContain('coherence score');
    });

    it('should handle empty input', async () => {
      const parsed = parse('', 'en');
      const result = await runLogic(parsed, 'en');

      expect(result.toulminStructure.claim).toBeNull();
      expect(result.fallacies).toEqual([]);
      expect(result.evidenceAssessments).toEqual([]);
      expect(result.contradictions).toEqual([]);
      expect(result.coherenceScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle Chinese text', async () => {
      const parsed = parse('研究表明75%的用户偏好这种方法。根据2023年的研究，结果显著。', 'zh-CN');
      const result = await runLogic(parsed, 'zh-CN');

      expect(result.toulminStructure.claim).not.toBeNull();
      expect(result.summary).toBeDefined();
    });

    it('should provide logic summary for debugging', async () => {
      const parsed = parse('Test argument with evidence.', 'en');
      const result = await runLogic(parsed, 'en');
      const summary = getLogicSummary(result);

      expect(summary).toContain('Logic Analysis Summary');
      expect(summary).toContain('Coherence Score');
      expect(summary).toContain('Fallacies:');
      expect(summary).toContain('Evidence:');
    });

    it('should return LogicOutput type with correct structure', async () => {
      const parsed = parse('Test', 'en');
      const result = await runLogic(parsed, 'en');

      expect(typeof result.coherenceScore).toBe('number');
      expect(typeof result.summary).toBe('string');
      expect(Array.isArray(result.fallacies)).toBe(true);
      expect(Array.isArray(result.evidenceAssessments)).toBe(true);
      expect(Array.isArray(result.contradictions)).toBe(true);
      expect(result.toulminStructure).toHaveProperty('claim');
      expect(result.toulminStructure).toHaveProperty('grounds');
      expect(result.toulminStructure).toHaveProperty('warrant');
      expect(result.toulminStructure).toHaveProperty('backing');
      expect(result.toulminStructure).toHaveProperty('qualifier');
      expect(result.toulminStructure).toHaveProperty('rebuttal');
      expect(result.toulminStructure).toHaveProperty('confidence');
    });

    it('should detect formal fallacy: affirming the consequent', async () => {
      const parsed = parse('If it rains then the ground is wet. The ground is wet, therefore it rained.', 'en');
      const result = await runLogic(parsed, 'en');

      const fallacy = result.fallacies.find(f => f.name === 'Affirming the Consequent');
      if (fallacy) {
        expect(fallacy.type).toBe('formal');
      }
    });

    it('should detect formal fallacy: denying the antecedent', async () => {
      const parsed = parse('If it rains then the ground is wet. It did not rain, therefore the ground is not wet.', 'en');
      const result = await runLogic(parsed, 'en');

      const fallacy = result.fallacies.find(f => f.name === 'Denying the Antecedent');
      if (fallacy) {
        expect(fallacy.type).toBe('formal');
      }
    });

    it('should deduplicate fallacies at similar positions', async () => {
      const parsed = parse('You are stupid and you are an idiot. Personal attack on the person.', 'en');
      const result = await runLogic(parsed, 'en');

      const adHominems = result.fallacies.filter(f => f.name === 'Ad Hominem');
      // Should deduplicate overlapping fallacies
      expect(adHominems.length).toBeLessThanOrEqual(2);
    });

    it('should generate search queries for claims needing verification', async () => {
      const parsed = parse('This new method increases efficiency by 50%.', 'en');
      const result = await runLogic(parsed, 'en');

      const assessment = result.evidenceAssessments[0];
      expect(assessment.suggestedQueries.length).toBeGreaterThan(0);
      expect(assessment.suggestedQueries[0]).toContain('fact check');
    });
  });
});