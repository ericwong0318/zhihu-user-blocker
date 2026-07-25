export type LogLevel = 'error' | 'warn' | 'info' | 'ai-provider';

export type LogEntry = {
  time: number;
  level: LogLevel;
  message: string;
  context?: string;
  // Extended fields for AI provider logging
  provider?: string;
  model?: string;
  prompt?: string;
  response?: string;
  durationMs?: number;
  status?: 'connected' | 'connecting' | 'failed' | 'success' | 'timeout';
  attemptNumber?: number;
  totalAttempts?: number;
};

const STORAGE_KEY = 'zhihuErrorLog';
const MAX_ENTRIES = 200;

const hasChrome = () =>
  typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;

// In-memory buffer is the source of truth. All reads/writes are serialized
// through `chain` so rapid calls can't clobber each other (chrome.storage
// callbacks are async and would otherwise race).
let buffer: LogEntry[] = [];
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<unknown> = Promise.resolve();

const persist = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (hasChrome()) {
      chrome.storage.local.set({ [STORAGE_KEY]: buffer });
    }
  }, 0);
};

const loadFromStorage = (): Promise<void> =>
  new Promise((resolve) => {
    if (loaded) {
      resolve();
      return;
    }
    if (!hasChrome()) {
      loaded = true;
      resolve();
      return;
    }
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, (result) => {
      buffer = (result[STORAGE_KEY] as LogEntry[]) || [];
      loaded = true;
      resolve();
    });
  });

const add = (level: LogLevel, message: string, context?: string) => {
  const entry: LogEntry = { time: Date.now(), level, message, context };
  chain = chain.then(() =>
    loadFromStorage().then(() => {
      buffer = [...buffer, entry].slice(-MAX_ENTRIES);
      persist();
    }),
  );
};

export const logError = (message: string, context?: string) =>
  add('error', message, context);
export const logWarn = (message: string, context?: string) =>
  add('warn', message, context);
export const logInfo = (message: string, context?: string) =>
  add('info', message, context);

/**
 * Log AI provider connection status and interaction details.
 * Used by fact-check providers to log connection status, prompts, responses, and timing.
 */
export const logAiProvider = (
  level: LogLevel,
  message: string,
  context: string,
  details?: {
    provider?: string;
    model?: string;
    prompt?: string;
    response?: string;
    durationMs?: number;
    status?: 'connected' | 'connecting' | 'failed' | 'success' | 'timeout';
    attemptNumber?: number;
    totalAttempts?: number;
  },
) => {
  const entry: LogEntry = {
    time: Date.now(),
    level,
    message,
    context,
    provider: details?.provider,
    model: details?.model,
    prompt: details?.prompt,
    response: details?.response,
    durationMs: details?.durationMs,
    status: details?.status,
    attemptNumber: details?.attemptNumber,
    totalAttempts: details?.totalAttempts,
  };
  chain = chain.then(() =>
    loadFromStorage().then(() => {
      buffer = [...buffer, entry].slice(-MAX_ENTRIES);
      persist();
    }),
  );
};

export const getLogs = (): Promise<LogEntry[]> => {
  chain = chain.then(() => loadFromStorage().then(() => buffer));
  return chain as Promise<LogEntry[]>;
};

export const clearLogs = (): Promise<void> => {
  chain = chain.then(() => {
    buffer = [];
    loaded = true;
    if (hasChrome()) {
      chrome.storage.local.set({ [STORAGE_KEY]: [] });
    }
  });
  return chain as Promise<void>;
};