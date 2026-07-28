import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkStorageQuota } from '../auth';

describe('checkStorageQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns normal status when plenty of space', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        storageQuota: { limit: '16106127360', usage: '5000000000' },
      }),
    }));

    const result = await checkStorageQuota('test-token');
    expect(result.status).toBe('normal');
    expect(result.limit).toBe(16106127360);
    expect(result.usage).toBe(5000000000);
    expect(result.available).toBe(16106127360 - 5000000000);
  });

  it('returns warning status when space is low', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        storageQuota: { limit: '16106127360', usage: '15700000000' },
      }),
    }));

    const result = await checkStorageQuota('test-token');
    expect(result.status).toBe('warning');
  });

  it('returns full status when no space', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        storageQuota: { limit: '16106127360', usage: '16106127360' },
      }),
    }));

    const result = await checkStorageQuota('test-token');
    expect(result.status).toBe('full');
    expect(result.available).toBe(0);
  });

  it('throws on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    await expect(checkStorageQuota('test-token')).rejects.toThrow('Network error');
  });

  it('throws on API error in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: { message: 'Invalid token' } }),
    }));

    await expect(checkStorageQuota('test-token')).rejects.toThrow('Invalid token');
  });
});
