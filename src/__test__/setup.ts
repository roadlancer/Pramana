import '@testing-library/jest-dom/vitest';

// Mock chrome API globally
const mockChrome = {
  runtime: {
    id: 'test-extension',
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    getContexts: vi.fn().mockResolvedValue([]),
    ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
    lastError: undefined as { message: string } | undefined,
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  },
  identity: {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn().mockResolvedValue(undefined),
    clearAllCachedAuthTokens: vi.fn(),
  },
  tabs: {
    captureVisibleTab: vi.fn().mockResolvedValue('data:image/png;base64,MOCK'),
    create: vi.fn(),
    get: vi.fn(),
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
  action: {
    setBadgeText: vi.fn().mockResolvedValue(undefined),
    setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    setTitle: vi.fn().mockResolvedValue(undefined),
  },
  commands: {
    onCommand: { addListener: vi.fn() },
  },
  offscreen: {
    createDocument: vi.fn().mockResolvedValue(undefined),
    closeDocument: vi.fn().mockResolvedValue(undefined),
    Reason: { USER_MEDIA: 'USER_MEDIA' },
  },
  scripting: {
    executeScript: vi.fn(),
  },
  tabCapture: {
    getMediaStreamId: vi.fn(),
  },
  windows: {
    create: vi.fn().mockResolvedValue({ id: 99 }),
    update: vi.fn().mockResolvedValue({ id: 99 }),
    remove: vi.fn().mockResolvedValue(undefined),
    onRemoved: { addListener: vi.fn() },
  },
};

// @ts-expect-error - mock chrome global
globalThis.chrome = mockChrome;

// Mock IntersectionObserver for jsdom
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}
// @ts-expect-error - mock IntersectionObserver global
globalThis.IntersectionObserver = MockIntersectionObserver;

// jsdom has no canvas implementation; every 2D context call is a no-op
HTMLCanvasElement.prototype.getContext = vi.fn(
  () => new Proxy({}, { get: (_target, prop) => (prop === 'canvas' ? document.createElement('canvas') : vi.fn()) })
) as unknown as typeof HTMLCanvasElement.prototype.getContext;
