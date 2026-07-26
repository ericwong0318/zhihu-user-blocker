import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from './types/request';
import { mockChromeStorage } from './test/setup';
import type { FactCheckConfig } from './features/fact-check/providers';

// Re-create the listener logic in isolation by importing the module side-effect.
// We simulate chrome.runtime.onMessage by capturing the registered listener.
type MessageListener = (
  req: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;
type ConnectListener = (port: chrome.runtime.Port) => void;

const listeners: MessageListener[] = [];
const connectListeners: ConnectListener[] = [];




const mockRuntime = {
  onMessage: {
    addListener: (fn: MessageListener) => listeners.push(fn),
  },
  onConnect: {
    addListener: (fn: ConnectListener) => connectListeners.push(fn),
  },
  sendMessage: {
    addListener: (fn: (message: unknown) => void) => fn,
  },
  openOptionsPage: vi.fn(),
};

const mockAction = {
  onClicked: {
    addListener: vi.fn(),
  },
};

beforeEach(() => {
  listeners.length = 0;
  connectListeners.length = 0;
  (global as { chrome: unknown }).chrome = {
    runtime: mockRuntime,
    storage: mockChromeStorage,
    action: mockAction,
  };
  // Clear module registry so background.ts re-registers its listener fresh.
  vi.resetModules();
});

const sendResponse = vi.fn();

async function dispatch(request: Request) {
  // Import after chrome is set so the listener registers against our mock.
  await import('./background');
  const listener = listeners[listeners.length - 1];
  const result = listener(request, {}, sendResponse);
  // Allow async storage callbacks to flush.
  await new Promise((r) => setTimeout(r, 0));
  return result;
}

describe('background message handler', () => {
  it('blockUser adds a new user without duplicates', async () => {
    const r1 = await dispatch({
      action: 'blockUser',
      userId: 'u1',
      userName: 'Alice',
    });
    expect(r1).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });

    // Block same user again -> no duplicate
    sendResponse.mockClear();
    await dispatch({ action: 'blockUser', userId: 'u1', userName: 'Alice' });
    const stored = (await mockChromeStorage.sync.get({
      zhihuBlockedUsers: [],
    })) as { zhihuBlockedUsers: Array<{ id: string; name: string }> };
    expect(stored.zhihuBlockedUsers).toHaveLength(1);
  });

  it('unblockUser removes the user', async () => {
    await dispatch({ action: 'blockUser', userId: 'u1', userName: 'Alice' });
    sendResponse.mockClear();
    const r = await dispatch({ action: 'unblockUser', userId: 'u1' });
    expect(r).toBe(true);
    const stored = (await mockChromeStorage.sync.get({
      zhihuBlockedUsers: [],
    })) as { zhihuBlockedUsers: Array<{ id: string; name: string }> };
    expect(stored.zhihuBlockedUsers).toHaveLength(0);
  });

  it('getBlockedUsers returns the current list', async () => {
    await dispatch({ action: 'blockUser', userId: 'u1', userName: 'Alice' });
    sendResponse.mockClear();
    await dispatch({ action: 'getBlockedUsers' });
    expect(sendResponse).toHaveBeenCalledWith({
      users: [{ id: 'u1', name: 'Alice' }],
    });
  });

  it('returns undefined for unknown actions', async () => {
    const r = await dispatch({ action: 'unknown' });
    expect(r).toBeUndefined();
  });

  it('registers an action.onClicked listener that opens the options page', async () => {
    mockAction.onClicked.addListener.mockClear();
    await import('./background');
    expect(mockAction.onClicked.addListener).toHaveBeenCalledTimes(1);
    const handler = mockAction.onClicked.addListener.mock.calls[0][0];
    handler();
    expect(mockRuntime.openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it('cancels the in-flight fact-check when the content port disconnects', async () => {
    const captured: { signal?: AbortSignal } = {};
    const callProvidersMock = vi.fn(
      (
        text: string,
        question: string | undefined,
        configs: FactCheckConfig[],
        onStage: (stage: string, isRetry: boolean) => void,
        signal?: AbortSignal,
      ) => {
        captured.signal = signal;
        return new Promise(() => {
          // Keep the promise pending to simulate an in-flight request.
        });
      },
    );
    await mockChromeStorage.sync.set({
      factCheckConfigs: [{ provider: 'openai', apiKey: 'oai' }],
    });
    vi.doMock('./features/fact-check/providers', () => ({
      callProviders: callProvidersMock,
    }));

    await import('./background');
    expect(connectListeners).toHaveLength(1);

    const onMessageAddListener = vi.fn();
    const onDisconnectAddListener = vi.fn();
    const onDisconnectRemoveListener = vi.fn();
    const postMessage = vi.fn();
    const port = {
      name: 'factCheck',
      disconnect: vi.fn(),
      onMessage: { addListener: onMessageAddListener },
      onDisconnect: { addListener: onDisconnectAddListener, removeListener: onDisconnectRemoveListener },
      postMessage,
    } as unknown as chrome.runtime.Port;
    connectListeners[0](port);

    expect(onMessageAddListener).toHaveBeenCalledTimes(1);
    const messageListener = onMessageAddListener.mock.calls[0][0];
    messageListener({ text: 'hello', question: 'What is the question?' });
    await new Promise((r) => setTimeout(r, 0));

    expect(callProvidersMock).toHaveBeenCalledTimes(1);
    expect(captured.signal).toBeDefined();

    expect(onDisconnectAddListener).toHaveBeenCalledTimes(2);
    const disconnectHandler = onDisconnectAddListener.mock.calls[1][0];
    disconnectHandler();
    expect(captured.signal?.aborted).toBe(true);
  });

  it('streams stage updates and the final result over the fact-check port', async () => {
    const callProvidersMock = vi.fn(
      (
        text: string,
        question: string | undefined,
        configs: FactCheckConfig[],
        onStage: (stage: string, isRetry: boolean) => void,
      ) => {
        onStage('Contacting AI provider…', false);
        onStage('Contacting AI provider…', true);
        return Promise.resolve({
          ok: true,
          result: {
            validityVsTruth: 'Stage streaming works.',
            rhetoric: { ethos: 'Low', pathos: 'Low', logos: 'High' },
            fallacies: [],
            verdict: 'credible',
          },
          provider: 'openai',
        });
      },
    );

    await mockChromeStorage.sync.set({
      factCheckConfigs: [{ provider: 'openai', apiKey: 'oai' }],
    });
    vi.doMock('./features/fact-check/providers', () => ({
      callProviders: callProvidersMock,
    }));

    await import('./background');
    expect(connectListeners).toHaveLength(1);

    const onMessageAddListener = vi.fn();
    const onDisconnectAddListener = vi.fn();
    const onDisconnectRemoveListener = vi.fn();
    const postMessage = vi.fn();
    const port = {
      name: 'factCheck',
      disconnect: vi.fn(),
      onMessage: { addListener: onMessageAddListener },
      onDisconnect: { addListener: onDisconnectAddListener, removeListener: onDisconnectRemoveListener },
      postMessage,
    } as unknown as chrome.runtime.Port;
    connectListeners[0](port);

    const messageListener = onMessageAddListener.mock.calls[0][0];
    messageListener({ text: 'hello', question: 'What is the question?' });
    await new Promise((r) => setTimeout(r, 0));

    expect(callProvidersMock).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      stage: 'Contacting AI provider…',
      isRetry: false,
    });
    expect(postMessage).toHaveBeenCalledWith({
      stage: 'Contacting AI provider…',
      isRetry: true,
    });
    expect(postMessage).toHaveBeenCalledWith({
      result: expect.objectContaining({ verdict: 'credible' }),
      provider: 'openai',
    });
  });

  it('round-trips a blockUser message from a content script and persists it', async () => {
    // Register the background listener (populates `listeners`).
    await dispatch({ action: 'getBlockedUsers' });
    const listener = listeners[listeners.length - 1];
    // Simulate a content script sending a blockUser message via chrome.runtime.onMessage.
    listener(
      { action: 'blockUser', userId: 'u9', userName: 'Zoe' },
      {},
      vi.fn(),
    );
    await new Promise((r) => setTimeout(r, 0));

    // The user should now be persisted in storage (the integration contract).
    const stored = (await mockChromeStorage.sync.get({
      zhihuBlockedUsers: [],
    })) as { zhihuBlockedUsers: Array<{ id: string; name: string }> };
    expect(stored.zhihuBlockedUsers).toEqual([{ id: 'u9', name: 'Zoe' }]);
  });
});
