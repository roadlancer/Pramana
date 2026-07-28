import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStorage } from '../storage';

describe('handleStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes LIST_FILES correctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ files: [] }),
    }));

    const result = await handleStorage({ type: 'LIST_FILES', token: 'test-token' });
    expect(result.success).toBe(true);
  });

  it('routes DELETE_FILE correctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const result = await handleStorage({
      type: 'DELETE_FILE',
      fileId: 'test-file-id',
      token: 'test-token',
    });
    expect(result.success).toBe(true);
  });

  it('returns error for unknown action type', async () => {
    const result = await handleStorage({ type: 'UNKNOWN', token: 'test-token' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('routes UPLOAD to uploadFile successfully', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ files: [{ id: 'folder-id' }] }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ files: [{ id: 'subfolder-id' }] }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ id: 'uploaded-file-id' }),
      })
    );

    const result = await handleStorage({
      type: 'UPLOAD',
      fileBase64: btoa('test image data'),
      metadata: { name: 'test.png', type: 'screenshot' },
      token: 'test-token',
    });
    expect(result.success).toBe(true);
    expect((result as any).fileId).toBe('uploaded-file-id');
  });

  it('handles upload error from Drive API', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ files: [{ id: 'folder-id' }] }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ files: [{ id: 'subfolder-id' }] }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ error: { message: 'Storage quota exceeded' } }),
      })
    );

    const result = await handleStorage({
      type: 'UPLOAD',
      fileBase64: btoa('test'),
      metadata: { name: 'test.png', type: 'screenshot' },
      token: 'test-token',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Storage quota exceeded');
  });

  it('DELETE_FILE returns error on API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Not found' } }),
    }));

    const result = await handleStorage({
      type: 'DELETE_FILE',
      fileId: 'nonexistent',
      token: 'test-token',
    });
    expect(result.success).toBe(false);
  });
});
