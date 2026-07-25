import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callProvider, callProviders, ProviderId } from './providers';

import { parseResult, SYSTEM_PROMPT } from './prompt';
import * as logging from '../../features/logging';

// Mock global fetch so we can assert the request shape per provider without
// hitting the network.
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (global as Record<string, unknown>).fetch = fetchMock as unknown as typeof fetch;
  
  // Mock the logging functions
  vi.spyOn(logging, 'logError').mockImplementation(() => {});
  vi.spyOn(logging, 'logWarn').mockImplementation(() => {});
  vi.spyOn(logging, 'logInfo').mockImplementation(() => {});
  vi.spyOn(logging, 'logAiProvider').mockImplementation(() => {});
});

// Build a successful fetch response whose JSON body is an OpenAI-style
// chat/completions payload wrapping the given content string.
const okOpenAi = (content: string) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content } }] }),
});

// Build a successful fetch response for the Claude messages shape.
const okClaude = (content: string) => ({
  ok: true,
  json: async () => ({ content: [{ type: 'text', text: content }] }),
});

// Build a successful fetch response for the Gemini shape.
const okGemini = (content: string) => ({
  ok: true,
  json: async () => ({
    candidates: [{ content: { parts: [{ text: content }] } }],
  }),
});

describe('callProvider', () => {
  it('returns an error when no provider is configured', async () => {
    const res = await callProvider('some text', undefined, { provider: '' as ProviderId });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.attempts).toHaveLength(0);
  });

  it('returns an error when a cloud provider has no API key', async () => {
    const res = await callProvider('text', undefined, { provider: 'claude' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/API key/i);
      expect(res.attempts[0].provider).toBe('claude');
    }
  });

  it('posts to the Claude endpoint with the shared system prompt', async () => {
    fetchMock.mockResolvedValue(okClaude('{"verdict":"unverified"}'));
    const res = await callProvider('claim', undefined, {
      provider: 'claude',
      apiKey: 'k',
      model: 'm',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('k');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('m');
    expect(body.system).toBe(SYSTEM_PROMPT);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.provider).toBe('claude');
  });

  it('posts to the Gemini endpoint with the key in the query string', async () => {
    fetchMock.mockResolvedValue(okGemini('{}'));
    await callProvider('claim', undefined, {
      provider: 'gemini',
      apiKey: 'gk',
      model: 'gm',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('key=gk');
    expect(JSON.parse(init.body).systemInstruction.parts[0].text).toBe(
      SYSTEM_PROMPT,
    );
  });

  it('posts to a local OpenAI-compatible server without an API key', async () => {
    fetchMock.mockResolvedValue(okOpenAi('{"verdict":"credible"}'));
    const res = await callProvider('claim', undefined, {
      provider: 'local',
      model: 'llama3.1',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(init.headers['Authorization']).toBeUndefined();
    expect(res.ok).toBe(true);
  });

  it('posts to the Other (OpenAI-compatible) endpoint with a bearer token', async () => {
    fetchMock.mockResolvedValue(okOpenAi('{"verdict":"misleading"}'));
    await callProvider('claim', undefined, {
      provider: 'other',
      apiKey: 'ok',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers['Authorization']).toBe('Bearer ok');
  });

  it('posts to the Other (OpenAI-compatible) endpoint without Authorization when base URL is localhost', async () => {
    fetchMock.mockResolvedValue(okOpenAi('{"verdict":"credible"}'));
    await callProvider('claim', undefined, {
      provider: 'other',
      apiKey: 'dummy-key',
      model: 'llama3.1',
      baseUrl: 'http://localhost:11434/v1',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('posts to the Other (OpenAI-compatible) endpoint without Authorization when base URL is 127.0.0.1', async () => {
    fetchMock.mockResolvedValue(okOpenAi('{"verdict":"credible"}'));
    await callProvider('claim', undefined, {
      provider: 'other',
      apiKey: 'dummy-key',
      model: 'llama3.1',
      baseUrl: 'http://127.0.0.1:8080/v1',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8080/v1/chat/completions');
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('posts to the Other (OpenAI-compatible) endpoint without Authorization when base URL is private IP', async () => {
    fetchMock.mockResolvedValue(okOpenAi('{"verdict":"credible"}'));
    await callProvider('claim', undefined, {
      provider: 'other',
      apiKey: 'dummy-key',
      model: 'llama3.1',
      baseUrl: 'http://192.168.1.100:11434/v1',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://192.168.1.100:11434/v1/chat/completions');
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('posts to OpenRouter with a bearer token and default base URL', async () => {
    fetchMock.mockResolvedValue(okOpenAi('{"verdict":"credible"}'));
    const res = await callProvider('claim', undefined, {
      provider: 'openrouter',
      apiKey: 'ork',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers['Authorization']).toBe('Bearer ork');
    expect(res.ok).toBe(true);
  });

  it('returns an error when OpenRouter has no API key', async () => {
    const res = await callProvider('claim', undefined, { provider: 'openrouter' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/OpenRouter/i);
  });

  it('posts to OpenAI with a bearer token', async () => {
    fetchMock.mockResolvedValue(okOpenAi('{"verdict":"credible"}'));
    const res = await callProvider('claim', undefined, {
      provider: 'openai',
      apiKey: 'oai',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers['Authorization']).toBe('Bearer oai');
    expect(res.ok).toBe(true);
  });

  it('posts to DeepSeek with a bearer token', async () => {
    fetchMock.mockResolvedValue(okOpenAi('{"verdict":"unverified"}'));
    const res = await callProvider('claim', undefined, {
      provider: 'deepseek',
      apiKey: 'ds',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(init.headers['Authorization']).toBe('Bearer ds');
    expect(res.ok).toBe(true);
  });

  it('returns an error when DeepSeek has no API key', async () => {
    const res = await callProvider('claim', undefined, { provider: 'deepseek' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/DeepSeek/i);
  });

  it('returns an error when OpenAI has no API key', async () => {
    const res = await callProvider('claim', undefined, { provider: 'openai' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/OpenAI/i);
  });

  it('surfaces a provider HTTP error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    });
    const res = await callProvider('claim', undefined, {
      provider: 'claude',
      apiKey: 'bad',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Authentication failed \(401\)/);
  });

  it('returns a clean message for a 429 rate-limit error with a JSON body', async () => {
    const body = JSON.stringify({
      error: {
        message:
          'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day',
        code: 429,
      },
    });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => body,
    });
    const res = await callProvider('claim', undefined, {
      provider: 'openrouter',
      apiKey: 'ork',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/^Rate limit exceeded\./);
      // The raw JSON payload must not be shown to the user.
      expect(res.error).not.toContain('"error"');
      expect(res.error).toContain('free-models-per-day');
    }
  });

  it('falls back to a generic message for an unparseable error body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '<html>oops</html>',
    });
    const res = await callProvider('claim', undefined, {
      provider: 'openai',
      apiKey: 'oai',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/server error \(500\)/);
  });

  it('includes a Simplified Chinese instruction in the prompt when language is zh-CN', async () => {
    fetchMock.mockResolvedValue(okOpenAi('{"verdict":"credible"}'));
    await callProvider('claim', undefined, {
      provider: 'openai',
      apiKey: 'oai',
      language: 'zh-CN',
    });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    const userMsg = body.messages.find(
      (m: { role: string; content: string }) => m.role === 'user',
    );
    expect(userMsg.content).toContain('中文（简体）');

  });

  it('includes an English instruction in the prompt when language is en', async () => {
    fetchMock.mockResolvedValue(okOpenAi('{"verdict":"credible"}'));
    await callProvider('claim', undefined, {
      provider: 'openai',
      apiKey: 'oai',
      language: 'en',
    });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    const userMsg = body.messages.find(
      (m: { role: string; content: string }) => m.role === 'user',
    );
    expect(userMsg.content).toContain('in English');

  });
});

describe('callProviders (fallback)', () => {
  it('uses the first provider when it succeeds', async () => {
    fetchMock.mockResolvedValue(okOpenAi('{"verdict":"credible"}'));
    const res = await callProviders('claim', undefined, [
      { provider: 'openai', apiKey: 'oai' },
      { provider: 'claude', apiKey: 'ck' },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.provider).toBe('openai');
    // Only the first provider should have been called.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the next provider when the first fails', async () => {
    // First call fails with 401, second succeeds.
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'unauthorized',
      })
      .mockResolvedValueOnce(okClaude('{"verdict":"credible"}'));
    const res = await callProviders('claim', undefined, [
      { provider: 'openai', apiKey: 'bad' },
      { provider: 'claude', apiKey: 'ck' },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.provider).toBe('claude');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back through multiple providers and reports all attempts', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'rate',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'boom',
      })
      .mockResolvedValueOnce(okOpenAi('{"verdict":"unverified"}'));
    const res = await callProviders('claim', undefined, [
      { provider: 'openai', apiKey: 'oai' },
      { provider: 'deepseek', apiKey: 'ds' },
      { provider: 'local', model: 'llama3.1' },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.provider).toBe('local');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns an aggregated error when all providers fail', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'no key',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'down',
      });
    const res = await callProviders('claim', undefined, [
      { provider: 'openai', apiKey: 'bad' },
      { provider: 'claude', apiKey: 'bad' },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/All providers failed/);
      expect(res.attempts).toHaveLength(2);
      expect(res.attempts[0].provider).toBe('openai');
      expect(res.attempts[1].provider).toBe('claude');
    }
  });

  it('skips providers with no provider selected and uses a valid one', async () => {
    fetchMock.mockResolvedValue(okOpenAi('{"verdict":"credible"}'));
    const res = await callProviders('claim', undefined, [
      { provider: '' as ProviderId },
      { provider: 'openai', apiKey: 'oai' },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.provider).toBe('openai');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a disabled-style error when no providers are configured', async () => {

    const res = await callProviders('claim', undefined, []);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/No fact-check provider configured/);
      expect(res.attempts).toHaveLength(0);
    }
  });

  it('reports each provider attempt via the onStage reporter', async () => {
    const stages: Array<{ stage: string; isRetry: boolean }> = [];
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'no key',
      })
      .mockResolvedValueOnce(okOpenAi('{"verdict":"credible"}'));
    const res = await callProviders(
      'claim',
      undefined,
      [
        { provider: 'openai', apiKey: 'bad', model: 'gpt-4o-mini' },
        { provider: 'claude', apiKey: 'ck', model: 'claude-3' },
      ],
      (stage, isRetry) => stages.push({ stage, isRetry }),
    );
    expect(res.ok).toBe(true);
    // First attempt reported, then a fallback notice, then the second attempt.
    expect(stages[0].stage).toContain('openai');
    expect(stages[0].isRetry).toBe(false);
    expect(stages[1].stage).toContain('failed');
    expect(stages[1].isRetry).toBe(true);
    expect(stages[2].stage).toContain('claude');
  });
});

describe('parseResult', () => {
  it('parses a fenced JSON response into a FactCheckResult', () => {
    const raw =
      '```json\n{"validityVsTruth":"x","verdict":"credible","fallacies":[]}\n```';
    const r = parseResult(raw);
    expect(r.verdict).toBe('credible');
    expect(r.validityVsTruth).toBe('x');
  });

  it('falls back to a plain text result when JSON is malformed', () => {
    const r = parseResult('not json at all');
    expect(r.verdict).toBe('unverified');
    expect(r.validityVsTruth).toContain('not json');
  });

  it('coerces unknown verdicts to unverified', () => {
    const r = parseResult('{"verdict":"banana"}');
    expect(r.verdict).toBe('unverified');
  });

  it('extracts rhetoric and fallacies', () => {
    const r = parseResult(
      JSON.stringify({
        validityVsTruth: 'v',
        rhetoric: { ethos: 'e', pathos: 'p', logos: 'l' },
        fallacies: [{ name: 'Straw man', quote: 'q', explanation: 'ex' }],
        verdict: 'misleading',
      }),
    );
    expect(r.rhetoric.ethos).toBe('e');
    expect(r.fallacies[0].name).toBe('Straw man');
  });
});
