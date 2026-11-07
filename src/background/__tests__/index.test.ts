import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Background message router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers both onMessage and onInstalled listeners', async () => {
    const messageListener = vi.fn();
    const installedListener = vi.fn();
    (globalThis.chrome as any).runtime.onMessage.addListener = messageListener;
    (globalThis.chrome as any).runtime.onInstalled.addListener = installedListener;

    await import('../index');

    expect(messageListener).toHaveBeenCalledTimes(1);
    expect(messageListener).toHaveBeenCalledWith(expect.any(Function));
    expect(installedListener).toHaveBeenCalledTimes(1);
  });
});

describe('Message handler routing', () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    let capturedHandler: any;
    const mockAddListener = vi.fn((fn: any) => {
      capturedHandler = fn;
    });
    (globalThis.chrome as any).runtime.onMessage.addListener = mockAddListener;
    (globalThis.chrome as any).runtime.onInstalled.addListener = vi.fn();

    await import('../index');
    handler = capturedHandler;
  });

  it('returns true for async handling', () => {
    const result = handler({ type: 'AUTH_STATUS' }, {}, vi.fn());
    expect(result).toBe(true);
  });

  it('handles unknown message type', async () => {
    const sendResponse = vi.fn();
    await handler({ type: 'UNKNOWN_TYPE' }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 10));

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Unknown message type' })
    );
  });

  it('handles AUTH_STATUS message', async () => {
    (globalThis.chrome as any).storage.local.get = vi.fn().mockResolvedValue({
      is_signed_in: true,
      user_email: 'test@gmail.com',
      user_name: 'Test User',
    });

    const sendResponse = vi.fn();
    await handler({ type: 'AUTH_STATUS' }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 10));

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ signedIn: true, email: 'test@gmail.com', name: 'Test User' })
    );
  });

  it('handles OPEN_EDITOR message', async () => {
    const mockCreate = vi.fn();
    (globalThis.chrome as any).tabs.create = mockCreate;

    const sendResponse = vi.fn();
    await handler({ type: 'OPEN_EDITOR', payload: { storageKey: 'test-key' } }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('storageKey=test-key') })
    );
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('returns error for unknown message type', async () => {
    const sendResponse = vi.fn();
    await handler({ type: 'NONEXISTENT' }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 10));

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe('Message handler responses', () => {
  let handler: any;

  const send = async (message: unknown, sender: object = { id: 'test-extension', url: 'chrome-extension://test/src/dashboard/index.html' }) => {
    const sendResponse = vi.fn();
    handler(message, sender, sendResponse);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    return sendResponse.mock.calls[0][0];
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    (globalThis.chrome as any).runtime.onMessage.addListener = vi.fn((fn: any) => {
      handler = fn;
    });
    (globalThis.chrome as any).runtime.onInstalled.addListener = vi.fn();
    (globalThis.chrome as any).identity.getAuthToken = vi.fn((_opts: unknown, cb: (t: string) => void) => cb('test-token'));
    await import('../index');
  });

  it('marks CHECK_STORAGE_QUOTA responses as successful', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ storageQuota: { limit: '1000', usage: '400' } }))));

    expect(await send({ type: 'CHECK_STORAGE_QUOTA' })).toEqual(
      expect.objectContaining({ success: true, limit: 1000, usage: 400 })
    );
  });

  it('responds with an error instead of hanging when a handler throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    expect(await send({ type: 'CHECK_STORAGE_QUOTA' })).toEqual({ success: false, error: 'Network error' });
  });

  it('gives the Google token to extension pages', async () => {
    expect(await send({ type: 'GET_AUTH_TOKEN' })).toEqual({ success: true, token: 'test-token' });
  });

  it('never gives the Google token to content scripts on web pages', async () => {
    const fromWebPage = { id: 'test-extension', url: 'https://example.com/', tab: { id: 1, url: 'https://example.com/' } };
    expect(await send({ type: 'GET_AUTH_TOKEN' }, fromWebPage)).toEqual({ success: false, error: 'Not allowed' });
  });

  it('leaves messages addressed to the offscreen recorder alone', () => {
    const sendResponse = vi.fn();
    expect(handler({ target: 'offscreen', type: 'OFFSCREEN_STOP' }, {}, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
