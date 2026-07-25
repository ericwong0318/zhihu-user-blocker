import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFactCheckConfig } from './useFactCheckConfig';
import { normalizeFactCheckConfigs } from '../storage';

// Mock the storage module
vi.mock('../storage', () => ({
  normalizeFactCheckConfigs: vi.fn(),
}));

describe('useFactCheckConfig', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    
    // Mock chrome.storage - onChanged is on chrome.storage directly, not on sync
    global.chrome = {
      storage: {
        sync: {
          get: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    } as unknown as typeof global.chrome;

    // Default mock for normalizeFactCheckConfigs
    (normalizeFactCheckConfigs as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with default values', async () => {
    global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { factCheckConfigs: unknown; factCheckConfig: unknown; factCheckTimeoutSec: number; factCheckEnabled: boolean }) => void) => {
      callback({ factCheckConfigs: null, factCheckConfig: null, factCheckTimeoutSec: 9, factCheckEnabled: false });
    });
    global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

    const { result } = renderHook(() => useFactCheckConfig());
    
    await waitFor(() => {
      expect(result.current.factCheckEnabled).toBe(false);
      expect(result.current.language).toBe('en');
      expect(result.current.timeoutSec).toBe(9);
    });
  });

  it('should load config from storage on mount', async () => {
    const mockConfigs = [
      { provider: 'openai', apiKey: 'key1', language: 'zh-CN', model: 'gpt-4' },
      { provider: 'claude', apiKey: 'key2', language: 'en', model: 'claude-3' },
    ];
    
    (normalizeFactCheckConfigs as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockConfigs);
    
    global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { factCheckConfigs: typeof mockConfigs; factCheckConfig: unknown; factCheckTimeoutSec: number; factCheckEnabled: boolean }) => void) => {
      callback({ 
        factCheckConfigs: mockConfigs, 
        factCheckConfig: null, 
        factCheckTimeoutSec: 15,
        factCheckEnabled: true,
      });
    });
    global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

    const { result } = renderHook(() => useFactCheckConfig());
    
    await waitFor(() => {
      expect(result.current.factCheckEnabled).toBe(true);
      expect(result.current.language).toBe('zh-CN'); // First config's language
      expect(result.current.timeoutSec).toBe(15);
    });
  });

  it('should handle missing timeout value', async () => {
    const mockConfigs = [{ provider: 'openai', apiKey: 'key1', language: 'en' }];
    
    (normalizeFactCheckConfigs as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockConfigs);
    
    global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { factCheckConfigs: typeof mockConfigs; factCheckConfig: unknown; factCheckTimeoutSec: number | undefined; factCheckEnabled: boolean }) => void) => {
      callback({ 
        factCheckConfigs: mockConfigs, 
        factCheckConfig: null, 
        factCheckTimeoutSec: undefined,
        factCheckEnabled: true,
      });
    });
    global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

    const { result } = renderHook(() => useFactCheckConfig());
    
    await waitFor(() => {
      expect(result.current.factCheckEnabled).toBe(true);
      expect(result.current.language).toBe('en');
      expect(result.current.timeoutSec).toBe(9); // Default value
    });
  });

  it('should listen for storage changes', async () => {
    // Initial load returns empty config
    global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { factCheckConfigs: unknown; factCheckConfig: unknown; factCheckTimeoutSec: number; factCheckEnabled: boolean }) => void) => {
      callback({ factCheckConfigs: null, factCheckConfig: null, factCheckTimeoutSec: 9, factCheckEnabled: false });
    });
    
    let changeListener: (changes: Record<string, { oldValue: unknown; newValue: unknown }>, area: string) => void;
    global.chrome.storage.onChanged.addListener.mockImplementation((listener) => {
      changeListener = listener;
    });
    global.chrome.storage.onChanged.removeListener.mockImplementation(() => {});

    const { result } = renderHook(() => useFactCheckConfig());
    
    await waitFor(() => {
      expect(result.current.factCheckEnabled).toBe(false);
    });

    // Simulate storage change - the hook's load() function will be called
    // which reads from storage again. So we need to update the mock to return new values
    await act(async () => {
      // Update the mock for when load() is called again
      global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { factCheckConfigs: Array<{ provider: string; apiKey: string; language: string }>; factCheckConfig: unknown; factCheckTimeoutSec: number; factCheckEnabled: boolean }) => void) => {
        callback({ 
          factCheckConfigs: [{ provider: 'openai', apiKey: 'newkey', language: 'zh-CN' }], 
          factCheckConfig: null, 
          factCheckTimeoutSec: 20,
          factCheckEnabled: true,
        });
      });
      (normalizeFactCheckConfigs as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
        { provider: 'openai', apiKey: 'newkey', language: 'zh-CN' }
      ]);
      if (changeListener) {
        changeListener({
          factCheckConfigs: { 
            oldValue: null, 
            newValue: [{ provider: 'openai', apiKey: 'newkey', language: 'zh-CN' }] 
          },
          factCheckTimeoutSec: { oldValue: 9, newValue: 20 },
          factCheckEnabled: { oldValue: false, newValue: true },
        }, 'sync');
      }
    });

    await waitFor(() => {
      expect(result.current.factCheckEnabled).toBe(true);
      expect(result.current.language).toBe('zh-CN');
      expect(result.current.timeoutSec).toBe(20);
    });
  });

  it('should ignore storage changes from non-sync area', async () => {
    global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { factCheckConfigs: unknown; factCheckConfig: unknown; factCheckTimeoutSec: number }) => void) => {
      callback({ factCheckConfigs: null, factCheckConfig: null, factCheckTimeoutSec: 9 });
    });
    
    let changeListener: (changes: Record<string, { oldValue: unknown; newValue: unknown }>, area: string) => void;
    global.chrome.storage.onChanged.addListener.mockImplementation((listener) => {
      changeListener = listener;
    });

    const { result } = renderHook(() => useFactCheckConfig());
    
    await waitFor(() => {
      expect(result.current.factCheckEnabled).toBe(false);
    });

    // Simulate storage change from local area (should be ignored)
    await act(async () => {
      if (changeListener) {
        changeListener({
          factCheckConfigs: { 
            oldValue: null, 
            newValue: [{ provider: 'openai', apiKey: 'newkey', language: 'zh-CN' }] 
          },
        }, 'local');
      }
    });

    // Should not update
    await waitFor(() => {
      expect(result.current.factCheckEnabled).toBe(false);
    });
  });

  it('should handle missing chrome.storage gracefully', async () => {
    delete (global as { chrome?: { storage?: unknown } }).chrome?.storage;
    
    const { result } = renderHook(() => useFactCheckConfig());
    
    await waitFor(() => {
      expect(result.current.factCheckEnabled).toBe(false);
      expect(result.current.language).toBe('en');
      expect(result.current.timeoutSec).toBe(9);
    });
  });

  it('should provide setter functions', async () => {
    global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { factCheckConfigs: unknown; factCheckConfig: unknown; factCheckTimeoutSec: number }) => void) => {
      callback({ factCheckConfigs: null, factCheckConfig: null, factCheckTimeoutSec: 9 });
    });
    global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

    const { result } = renderHook(() => useFactCheckConfig());
    
    await waitFor(() => {
      expect(result.current.factCheckEnabled).toBe(false);
    });

    act(() => {
      result.current.setFactCheckEnabled(true);
    });

    expect(result.current.factCheckEnabled).toBe(true);

    act(() => {
      result.current.setLanguage('zh-CN');
    });

    expect(result.current.language).toBe('zh-CN');

    act(() => {
      result.current.setTimeoutSec(30);
    });

    expect(result.current.timeoutSec).toBe(30);
  });

  it('should cleanup listener on unmount', async () => {
    global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { factCheckConfigs: unknown; factCheckConfig: unknown; factCheckTimeoutSec: number }) => void) => {
      callback({ factCheckConfigs: null, factCheckConfig: null, factCheckTimeoutSec: 9 });
    });
    
    const removeListenerMock = vi.fn();
    global.chrome.storage.onChanged.addListener.mockImplementation(() => {});
    global.chrome.storage.onChanged.removeListener = removeListenerMock;

    const { unmount } = renderHook(() => useFactCheckConfig());
    
    unmount();
    
    expect(removeListenerMock).toHaveBeenCalled();
  });

  it('should use factCheckConfig as fallback when factCheckConfigs is null', async () => {
    const mockConfig = { provider: 'claude', apiKey: 'fallback-key', language: 'en' };
    
    (normalizeFactCheckConfigs as unknown as ReturnType<typeof vi.fn>).mockReturnValue([mockConfig]);
    
    global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { factCheckConfigs: unknown; factCheckConfig: typeof mockConfig; factCheckTimeoutSec: number; factCheckEnabled: boolean }) => void) => {
      callback({ 
        factCheckConfigs: null, 
        factCheckConfig: mockConfig, 
        factCheckTimeoutSec: 9,
        factCheckEnabled: true,
      });
    });
    global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

    const { result } = renderHook(() => useFactCheckConfig());
    
    await waitFor(() => {
      expect(result.current.factCheckEnabled).toBe(true);
      expect(result.current.language).toBe('en');
    });
  });
});
