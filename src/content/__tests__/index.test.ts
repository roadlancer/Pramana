import { describe, it, expect, vi, beforeAll } from 'vitest';

describe('content script', () => {
  let onMessage: (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;
  let addListener: ReturnType<typeof vi.fn>;
  let scaleArea: typeof import('../index').scaleArea;

  beforeAll(async () => {
    addListener = vi.fn((fn: typeof onMessage) => {
      onMessage = fn;
    });
    (globalThis.chrome as any).runtime.onMessage.addListener = addListener;
    ({ scaleArea } = await import('../index'));
  });

  it('removes the selection overlay when Escape is pressed', () => {
    const sendResponse = vi.fn();
    onMessage({ type: 'CAPTURE_AREA_SELECT' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
    expect(document.getElementById('pramana-area-overlay')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.getElementById('pramana-area-overlay')).toBeNull();
  });

  it('only registers one listener when injected again', async () => {
    vi.resetModules();
    await import('../index');
    expect(addListener).toHaveBeenCalledTimes(1);
  });

  it('scales a CSS-pixel selection to the capture resolution', () => {
    expect(scaleArea({ x: 10, y: 20, width: 100, height: 50 }, 2560, 1280)).toEqual({ x: 20, y: 40, width: 200, height: 100 });
  });
});
