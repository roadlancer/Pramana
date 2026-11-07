import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyImageToClipboard } from '../clipboard';

class FakeClipboardItem {
  items: Record<string, Promise<Blob>>;
  constructor(items: Record<string, Promise<Blob>>) {
    this.items = items;
  }
}

function stubClipboard() {
  const write = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('ClipboardItem', FakeClipboardItem);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } });
  return write;
}

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

describe('copyImageToClipboard', () => {
  it('writes a PNG to the clipboard, also when given a promise of one', async () => {
    const write = stubClipboard();
    const png = new Blob(['png'], { type: 'image/png' });

    await copyImageToClipboard(Promise.resolve(png));

    const [[items]] = write.mock.calls;
    expect(items).toHaveLength(1);
    expect(await items[0].items['image/png']).toBe(png);
  });

  it('converts other image types to PNG, the only one Chrome accepts', async () => {
    const write = stubClipboard();
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4, height: 3, close }));
    const converted = new Blob(['png'], { type: 'image/png' });
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext = () => ({ drawImage: vi.fn() });
        convertToBlob = vi.fn().mockResolvedValue(converted);
      }
    );

    await copyImageToClipboard(new Blob(['jpg'], { type: 'image/jpeg' }));

    expect(await write.mock.calls[0][0][0].items['image/png']).toBe(converted);
    expect(close).toHaveBeenCalled();
  });

  it('explains when the page has no image clipboard (http:// pages)', async () => {
    await expect(copyImageToClipboard(new Blob(['png'], { type: 'image/png' }))).rejects.toThrow(
      "This page doesn't allow copying images"
    );
  });
});
