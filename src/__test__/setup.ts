import '@testing-library/jest-dom/vitest';

// Mock chrome API globally
const mockChrome = {
  runtime: {
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    lastError: undefined as { message: string } | undefined,
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
  identity: {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn(),
    clearAllCachedAuthTokens: vi.fn(),
  },
  tabs: {
    captureVisibleTab: vi.fn().mockResolvedValue('data:image/png;base64,MOCK'),
    create: vi.fn(),
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
  downloads: {
    download: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
};

// @ts-expect-error - mock chrome global
globalThis.chrome = mockChrome;
