import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drive, handleUpload } from '../storage';

describe('handleUpload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('decodes the base64 payload and uploads it to the matching folder', async () => {
    const upload = vi.spyOn(drive, 'upload').mockResolvedValue('file-1');

    const result = await handleUpload({ fileBase64: btoa('png-bytes'), metadata: { name: 'a.png', type: 'screenshot' } });

    expect(result).toEqual({ success: true, fileId: 'file-1' });
    const [blob, meta] = upload.mock.calls[0];
    expect(meta).toEqual({ name: 'a.png', kind: 'screenshot' });
    expect(blob.type).toBe('image/png');
    expect(await blob.text()).toBe('png-bytes');
  });

  it('files unknown types under Other', async () => {
    const upload = vi.spyOn(drive, 'upload').mockResolvedValue('file-2');
    await handleUpload({ fileBase64: btoa('x'), metadata: { name: 'x.bin', type: 'mystery' } });
    expect(upload.mock.calls[0][1].kind).toBe('other');
  });

  it('returns the Drive error message on failure', async () => {
    vi.spyOn(drive, 'upload').mockRejectedValue(new Error('Storage quota exceeded'));
    expect(await handleUpload({ fileBase64: btoa('x'), metadata: { type: 'screenshot' } })).toEqual({
      success: false,
      error: 'Storage quota exceeded',
    });
  });
});
