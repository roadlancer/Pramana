import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCapture, handleCaptureArea } from '../capture';

describe('handleCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures tab when mode is tab', async () => {
    const mockCaptureVisibleTab = vi.fn().mockResolvedValue('data:image/png;base64,TEST');
    (globalThis.chrome as any).tabs.captureVisibleTab = mockCaptureVisibleTab;
    (globalThis.chrome as any).tabs.get = vi.fn().mockResolvedValue({ id: 1, windowId: 1 });

    const sender = { tab: { id: 1, windowId: 1 } } as chrome.runtime.MessageSender;
    const result = await handleCapture({ mode: 'tab' } as any, sender);

    expect(result.success).toBe(true);
    expect(result.dataUrl).toBe('data:image/png;base64,TEST');
    expect(mockCaptureVisibleTab).toHaveBeenCalledWith(1, { format: 'png' });
  });

  it('returns error when no tab id', async () => {
    const sender = { tab: undefined } as chrome.runtime.MessageSender;
    const result = await handleCapture({ mode: 'tab' } as any, sender);
    expect(result.success).toBe(false);
  });

  it('returns error for unhandled modes', async () => {
    const sender = {} as chrome.runtime.MessageSender;
    const result = await handleCapture({ mode: 'full' } as any, sender);
    expect(result.success).toBe(false);
  });
});

describe('handleCaptureArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures visible tab and returns base64 with area', async () => {
    const mockCaptureVisibleTab = vi.fn().mockResolvedValue('data:image/png;base64,AREA');
    (globalThis.chrome as any).tabs.captureVisibleTab = mockCaptureVisibleTab;

    const sender = { tab: { id: 1, windowId: 1 } } as chrome.runtime.MessageSender;
    const area = { x: 10, y: 20, width: 100, height: 50 };
    const result = await handleCaptureArea(area, sender);

    expect(result.success).toBe(true);
    expect(result.base64).toBe('AREA');
    expect(result.area).toEqual(area);
    expect(mockCaptureVisibleTab).toHaveBeenCalledWith(1, { format: 'png' });
  });

  it('returns error when no tab/window info', async () => {
    const sender = { tab: undefined } as chrome.runtime.MessageSender;
    const area = { x: 0, y: 0, width: 100, height: 100 };
    const result = await handleCaptureArea(area, sender);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No tab/window info');
  });

  it('returns error on capture failure', async () => {
    const mockCaptureVisibleTab = vi.fn().mockRejectedValue(new Error('Capture failed'));
    (globalThis.chrome as any).tabs.captureVisibleTab = mockCaptureVisibleTab;

    const sender = { tab: { id: 1, windowId: 1 } } as chrome.runtime.MessageSender;
    const area = { x: 0, y: 0, width: 100, height: 100 };
    const result = await handleCaptureArea(area, sender);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Capture failed');
  });
});
