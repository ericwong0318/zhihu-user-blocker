import { logError, logWarn, logInfo, getLogs, clearLogs, logAiProvider } from './logger';
import { mockChromeStorage } from '../../test/setup';
import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(async () => {
  (global as unknown as Record<string, unknown>).chrome = {
    storage: mockChromeStorage,
  };
  await clearLogs();
});

describe('logger', () => {
  it('stores an error log entry in chrome.storage.local', async () => {
    logError('boom', 'background');
    // logger writes asynchronously; wait a tick
    await new Promise((r) => setTimeout(r, 10));
    const logs = await getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ level: 'error', message: 'boom', context: 'background' });
  });

  it('records warn and info levels', async () => {
    await logWarn('careful');
    await logInfo('note');
    const logs = await getLogs();
    expect(logs.map((l) => l.level)).toEqual(['warn', 'info']);
  });

  it('clears all logs', async () => {
    await logError('x');
    expect((await getLogs()).length).toBeGreaterThan(0);
    await clearLogs();
    expect(await getLogs()).toHaveLength(0);
  });

  it('caps stored entries at 200 (newest kept)', async () => {
    for (let i = 0; i < 250; i++) await logError(`e${i}`);
    const logs = await getLogs();
    expect(logs).toHaveLength(200);
    // Oldest kept entry after dropping 50 oldest
    expect(logs[0].message).toBe('e50');
  });

  describe('logAiProvider', () => {
    it('logs AI provider connection attempt', async () => {
      logAiProvider('info', 'Connecting to provider', 'fact-check', {
        provider: 'openai',
        model: 'gpt-4o-mini',
        status: 'connecting',
        attemptNumber: 1,
      });
      await new Promise((r) => setTimeout(r, 10));
      const logs = await getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('info');
      expect(logs[0].provider).toBe('openai');
      expect(logs[0].model).toBe('gpt-4o-mini');
      expect(logs[0].status).toBe('connecting');
      expect(logs[0].attemptNumber).toBe(1);
    });

    it('logs AI provider success with prompt and response', async () => {
      logAiProvider('ai-provider', 'Provider completed', 'fact-check', {
        provider: 'claude',
        model: 'claude-3-5-sonnet-latest',
        prompt: 'Test prompt',
        response: 'Test response',
        durationMs: 1500,
        status: 'success',
      });
      await new Promise((r) => setTimeout(r, 10));
      const logs = await getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('ai-provider');
      expect(logs[0].provider).toBe('claude');
      expect(logs[0].prompt).toBe('Test prompt');
      expect(logs[0].response).toBe('Test response');
      expect(logs[0].durationMs).toBe(1500);
      expect(logs[0].status).toBe('success');
    });

    it('logs AI provider error with timeout status', async () => {
      logAiProvider('error', 'Provider timed out', 'fact-check', {
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        prompt: 'Test prompt',
        durationMs: 180000,
        status: 'timeout',
      });
      await new Promise((r) => setTimeout(r, 10));
      const logs = await getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].provider).toBe('gemini');
      expect(logs[0].status).toBe('timeout');
      expect(logs[0].durationMs).toBe(180000);
    });

    it('logs AI provider failed status', async () => {
      logAiProvider('error', 'Provider failed', 'fact-check', {
        provider: 'local',
        model: 'llama3.1',
        prompt: 'Test prompt',
        durationMs: 5000,
        status: 'failed',
      });
      await new Promise((r) => setTimeout(r, 10));
      const logs = await getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('failed');
    });
  });
});
