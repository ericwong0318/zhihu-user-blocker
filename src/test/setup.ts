import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';

// Mock chrome.storage for tests (both sync and local share the same store)
type StorageValue = unknown;
type StorageItems = Record<string, StorageValue>;

let store: StorageItems = {};
const changeListeners: Array<
  (changes: StorageItems, areaName: string) => void
> = [];

const makeArea = () => ({
  get: vi.fn(
    (
      keys: string | string[] | StorageItems | null,
      cb?: (result: StorageItems) => void,
    ) => {
      const result: StorageItems = {};
      if (typeof keys === 'object' && keys !== null && !Array.isArray(keys)) {
        for (const k of Object.keys(keys))
          result[k] = k in store ? store[k] : keys[k];
      } else if (typeof keys === 'string') {
        result[keys] = store[keys];
      }
      if (cb) cb(result);
      return Promise.resolve(result);
    },
  ),
  set: vi.fn((items: StorageItems, cb?: () => void) => {
    Object.assign(store, items);
    if (cb) cb();
    return Promise.resolve();
  }),
});

const onChanged = {
  addListener: (listener: (typeof changeListeners)[number]) => {
    changeListeners.push(listener);
  },
  removeListener: (listener: (typeof changeListeners)[number]) => {
    const index = changeListeners.indexOf(listener);
    if (index !== -1) changeListeners.splice(index, 1);
  },
};

export const mockChromeStorage = {
  sync: makeArea(),
  local: makeArea(),
  onChanged,
  triggerOnChanged: (
    changes: StorageItems,
    areaName = 'sync'
  ) => {
    changeListeners.slice().forEach((listener) => listener(changes, areaName));
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  store = {};
  changeListeners.length = 0;
  (global as Record<string, unknown>).chrome = { storage: mockChromeStorage };
});
