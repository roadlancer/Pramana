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
