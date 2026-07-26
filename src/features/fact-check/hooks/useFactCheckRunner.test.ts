import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { runFactCheck, useFactCheckRunner } from './useFactCheckRunner';

describe('useFactCheckRunner', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Mock chrome.runtime
    global.chrome = {
      runtime: {
        connect: vi.fn(),
        lastError: null,
      },
    } as unknown as typeof global.chrome;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runFactCheck', () => {
    it('should return error when chrome.runtime.connect is not available', async () => {
      delete (global.chrome as { runtime?: { connect?: unknown } }).runtime?.connect;

      const result = await runFactCheck('test text', 'en', undefined, 9);

      expect(result).toEqual({ error: 'Extension unavailable.' });
    });

    it('should connect to factCheck port and send message', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      global.chrome.runtime.connect.mockReturnValue(mockPort);
      global.chrome.runtime.lastError = null;

      let messageHandler: ((msg: unknown) => void) | undefined;

      mockPort.onMessage.addListener.mockImplementation((handler) => {
        messageHandler = handler;
      });

      mockPort.onDisconnect.addListener.mockImplementation(() => {});

      const promise = runFactCheck('test text', undefined, 'zh-CN', undefined, 30);

      // Verify port was created with correct name
      expect(global.chrome.runtime.connect).toHaveBeenCalledWith({ name: 'factCheck' });

      // Verify message was posted
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        text: 'test text',
        question: undefined,
        language: 'zh-CN',
        timeoutSec: 30,
      });

      // Simulate successful response
      act(() => {
        messageHandler?.({ result: { verdict: 'credible', sources: [] } });
      });

      const result = await promise;
      expect(result).toEqual({ verdict: 'credible', sources: [], provider: null });
    });

    it('should handle error response from background', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      global.chrome.runtime.connect.mockReturnValue(mockPort);
      global.chrome.runtime.lastError = null;

      let messageHandler: ((msg: unknown) => void) | undefined;

      mockPort.onMessage.addListener.mockImplementation((handler) => {
        messageHandler = handler;
      });

      mockPort.onDisconnect.addListener.mockImplementation(() => {});

      const promise = runFactCheck('test text', undefined, 'en', undefined, 9);

      // Simulate error response
      act(() => {
        messageHandler?.({ error: 'Provider failed' });
      });

      const result = await promise;
      expect(result).toEqual({ error: 'Provider failed' });
    });

    it('should handle disabled provider response', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      global.chrome.runtime.connect.mockReturnValue(mockPort);
      global.chrome.runtime.lastError = null;

      let messageHandler: ((msg: unknown) => void) | undefined;

      mockPort.onMessage.addListener.mockImplementation((handler) => {
        messageHandler = handler;
      });

      mockPort.onDisconnect.addListener.mockImplementation(() => {});

      const promise = runFactCheck('test text', undefined, 'en', undefined, 9);

      // Simulate disabled response
      act(() => {
        messageHandler?.({ disabled: true });
      });

      const result = await promise;
      expect(result).toEqual({ error: 'No provider configured.' });
    });

    it('should stream stage messages to onStage callback', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      global.chrome.runtime.connect.mockReturnValue(mockPort);
      global.chrome.runtime.lastError = null;

      let messageHandler: ((msg: unknown) => void) | undefined;

      mockPort.onMessage.addListener.mockImplementation((handler) => {
        messageHandler = handler;
      });

      mockPort.onDisconnect.addListener.mockImplementation(() => {});

      const onStage = vi.fn();
      const promise = runFactCheck('test text', undefined, 'en', onStage, 9);

      // Simulate stage message — should be streamed to onStage, not ignored
      act(() => {
        messageHandler?.({ stage: 'Contacting provider...' });
      });

      expect(onStage).toHaveBeenCalledWith('Contacting provider...', false);

      // Should not resolve yet, need a result
      // Simulate final result
      act(() => {
        messageHandler?.({ result: { verdict: 'unverified' } });
      });

      const result = await promise;
      expect(result).toEqual({ verdict: 'unverified', provider: null });
    });

    it('should stream stage messages with isRetry flag to onStage callback', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      global.chrome.runtime.connect.mockReturnValue(mockPort);
      global.chrome.runtime.lastError = null;

      let messageHandler: ((msg: unknown) => void) | undefined;

      mockPort.onMessage.addListener.mockImplementation((handler) => {
        messageHandler = handler;
      });

      mockPort.onDisconnect.addListener.mockImplementation(() => {});

      const onStage = vi.fn();
      const promise = runFactCheck('test text', undefined, 'en', onStage, 9);

      // Simulate retry stage message
      act(() => {
        messageHandler?.({ stage: 'Trying next provider...', isRetry: true });
      });

      expect(onStage).toHaveBeenCalledWith('Trying next provider...', true);

      // Simulate final result
      act(() => {
        messageHandler?.({ result: { verdict: 'credible' } });
      });

      const result = await promise;
      expect(result).toEqual({ verdict: 'credible', provider: null });
    });

    it('should handle port disconnect with error', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      global.chrome.runtime.connect.mockReturnValue(mockPort);
      global.chrome.runtime.lastError = { message: 'Connection failed' };

      let disconnectHandler: (() => void) | undefined;

      mockPort.onMessage.addListener.mockImplementation(() => {});

      mockPort.onDisconnect.addListener.mockImplementation((handler) => {
        disconnectHandler = handler;
      });

      const promise = runFactCheck('test text', undefined, 'en', undefined, 9);

      // Simulate disconnect
      act(() => {
        disconnectHandler?.();
      });

      const result = await promise;
      expect(result).toEqual({ error: 'Connection failed' });
    });

    it('should handle port disconnect without error', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      global.chrome.runtime.connect.mockReturnValue(mockPort);
      global.chrome.runtime.lastError = null;

      let disconnectHandler: (() => void) | undefined;

      mockPort.onMessage.addListener.mockImplementation(() => {});

      mockPort.onDisconnect.addListener.mockImplementation((handler) => {
        disconnectHandler = handler;
      });

      const promise = runFactCheck('test text', undefined, 'en', undefined, 9);

      // Simulate disconnect without error
      act(() => {
        disconnectHandler?.();
      });

      const result = await promise;
      expect(result).toEqual({ error: 'Connection closed.' });
    });

    it('should handle null message', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      global.chrome.runtime.connect.mockReturnValue(mockPort);
      global.chrome.runtime.lastError = null;

      let messageHandler: ((msg: unknown) => void) | undefined;

      mockPort.onMessage.addListener.mockImplementation((handler) => {
        messageHandler = handler;
      });

      mockPort.onDisconnect.addListener.mockImplementation(() => {});

      const promise = runFactCheck('test text', undefined, 'en', undefined, 9);

      // Simulate null message
      act(() => {
        messageHandler?.(null);
      });

      const result = await promise;
      expect(result).toEqual({ error: 'No response.' });
    });
  });

  describe('useFactCheckRunner', () => {
    it('should return a memoized callback', () => {
      const { result, rerender } = renderHook(
        ({ language, timeoutSec }) => useFactCheckRunner(language, timeoutSec),
        { initialProps: { language: 'en', timeoutSec: 9 } }
      );

      const callback1 = result.current;

      // Rerender with same props
      rerender({ language: 'en', timeoutSec: 9 });
      const callback2 = result.current;

      expect(callback1).toBe(callback2);
    });

    it('should return new callback when language changes', () => {
      const { result, rerender } = renderHook(
        ({ language, timeoutSec }) => useFactCheckRunner(language, timeoutSec),
        { initialProps: { language: 'en', timeoutSec: 9 } }
      );

      const callback1 = result.current;

      // Rerender with different language
      rerender({ language: 'zh-CN', timeoutSec: 9 });
      const callback2 = result.current;

      expect(callback1).not.toBe(callback2);
    });

    it('should return new callback when timeoutSec changes', () => {
      const { result, rerender } = renderHook(
        ({ language, timeoutSec }) => useFactCheckRunner(language, timeoutSec),
        { initialProps: { language: 'en', timeoutSec: 9 } }
      );

      const callback1 = result.current;

      // Rerender with different timeout
      rerender({ language: 'en', timeoutSec: 15 });
      const callback2 = result.current;

      expect(callback1).not.toBe(callback2);
    });

    it('should call runFactCheck with correct parameters', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      global.chrome.runtime.connect.mockReturnValue(mockPort);
      global.chrome.runtime.lastError = null;

      let messageHandler: ((msg: unknown) => void) | undefined;

      mockPort.onMessage.addListener.mockImplementation((handler) => {
        messageHandler = handler;
      });

      mockPort.onDisconnect.addListener.mockImplementation(() => {});

      const { result } = renderHook(
        ({ language, timeoutSec }) => useFactCheckRunner(language, timeoutSec),
        { initialProps: { language: 'zh-CN', timeoutSec: 15 } }
      );

      // Start the call and immediately simulate response
      const promise = result.current('test claim');

      // Verify message was posted with correct params
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        text: 'test claim',
        question: undefined,
        language: 'zh-CN',
        timeoutSec: 15,
      });

      // Simulate response
      act(() => {
        messageHandler?.({ result: { verdict: 'credible' } });
      });

      // Await the promise
      await promise;
    });
  });
});
