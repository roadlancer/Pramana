import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { createDriveClient, summarizeQuota, MULTIPART_LIMIT, UPLOAD_CHUNK_SIZE } from '../drive';
import type { TokenProvider } from '../drive';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function folderLookups(fetchMock: ReturnType<typeof vi.fn>) {
  // Pramana root, then the subfolder
  fetchMock.mockResolvedValueOnce(json({ files: [{ id: 'root' }] }));
  fetchMock.mockResolvedValueOnce(json({ files: [{ id: 'shots' }] }));
}

describe('summarizeQuota', () => {
  it('classifies plenty of space as normal', () => {
    expect(summarizeQuota({ limit: '16106127360', usage: '5000000000' })).toEqual({
      usage: 5000000000,
      limit: 16106127360,
      available: 11106127360,
      status: 'normal',
    });
  });

  it('warns when under 500 MB is left', () => {
    expect(summarizeQuota({ limit: '1000000000', usage: '700000000' }).status).toBe('warning');
  });

  it('reports full when nothing is left', () => {
    expect(summarizeQuota({ limit: '100', usage: '120' })).toMatchObject({ status: 'full', available: 0 });
  });

  it('handles unlimited accounts that have no limit', () => {
    expect(summarizeQuota({ usage: '42' })).toEqual({ usage: 42, limit: null, available: null, status: 'normal' });
  });
});

describe('createDriveClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let getToken: Mock<TokenProvider>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    getToken = vi.fn<TokenProvider>(async (refresh) => (refresh ? 'fresh-token' : 'old-token'));
  });

  it('retries once with a fresh token after a 401', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: { message: 'Invalid Credentials' } }, 401))
      .mockResolvedValueOnce(json({ storageQuota: { limit: '100', usage: '10' } }));

    const quota = await createDriveClient(getToken).getQuota();

    expect(quota.usage).toBe(10);
    expect(getToken).toHaveBeenLastCalledWith(true);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token');
  });

  it('surfaces the Drive error message when a request fails', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'Rate limit exceeded' } }, 403));
    await expect(createDriveClient(getToken).getQuota()).rejects.toThrow('Rate limit exceeded');
  });

  it('fails clearly when signed out', async () => {
    await expect(createDriveClient(async () => null).getQuota()).rejects.toThrow('Not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists files from every subfolder across pages, newest first', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ files: [{ id: 'root' }] }))
      .mockResolvedValueOnce(json({ files: [{ id: 'shots', name: 'Screenshots' }, { id: 'recs', name: 'Recordings' }] }))
      .mockImplementation(async (url: string) => {
        const params = new URL(url).searchParams;
        if (params.get('q')!.includes("'shots'")) {
          return params.get('pageToken')
            ? json({ files: [{ id: 'b', name: 'b.png', createdTime: '2026-01-02T00:00:00Z' }] })
            : json({ files: [{ id: 'a', name: 'a.png', createdTime: '2026-01-01T00:00:00Z' }], nextPageToken: 'p2' });
        }
        return json({ files: [{ id: 'c', name: 'c.webm', createdTime: '2026-01-03T00:00:00Z' }] });
      });

    const files = await createDriveClient(getToken).listFiles();

    expect(files.map((f) => [f.id, f.folder])).toEqual([
      ['c', 'Recordings'],
      ['b', 'Screenshots'],
      ['a', 'Screenshots'],
    ]);
  });

  it('creates the Pramana folder when it is missing and fails if Drive returns no id', async () => {
    fetchMock.mockResolvedValueOnce(json({ files: [] })).mockResolvedValueOnce(json({}));
    await expect(createDriveClient(getToken).listFiles()).rejects.toThrow('Could not create the Pramana folder');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ name: 'Pramana' });
  });

  it('uploads small files in a single multipart request', async () => {
    folderLookups(fetchMock);
    fetchMock.mockResolvedValueOnce(json({ id: 'new-file' }));

    const id = await createDriveClient(getToken).upload(new Blob(['png'], { type: 'image/png' }), { name: 'a.png', kind: 'screenshot' });

    expect(id).toBe('new-file');
    expect(fetchMock.mock.calls[2][0]).toContain('uploadType=multipart');
  });

  it('uploads large files in resumable chunks and reports progress', async () => {
    folderLookups(fetchMock);
    const size = MULTIPART_LIMIT + UPLOAD_CHUNK_SIZE;
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { Location: 'https://upload.example/session' } }))
      .mockImplementation(async (_url: string, init: RequestInit) => {
        const [, end] = (init.headers as Record<string, string>)['Content-Range'].match(/bytes \d+-(\d+)/)!;
        return Number(end) + 1 < size
          ? new Response(null, { status: 308, headers: { Range: `bytes=0-${end}` } })
          : json({ id: 'big-file' });
      });
    const progress = vi.fn();

    const id = await createDriveClient(getToken).upload(
      new Blob([new Uint8Array(size)], { type: 'video/webm' }),
      { name: 'r.webm', kind: 'recording' },
      progress
    );

    expect(id).toBe('big-file');
    expect(fetchMock.mock.calls[2][0]).toContain('uploadType=resumable');
    const chunkCalls = fetchMock.mock.calls.slice(3);
    expect(chunkCalls.length).toBe(Math.ceil(size / UPLOAD_CHUNK_SIZE));
    expect(chunkCalls.every(([url]) => url === 'https://upload.example/session')).toBe(true);
    expect(progress).toHaveBeenLastCalledWith(1);
  });

  it('moves files to the trash instead of deleting them', async () => {
    fetchMock.mockResolvedValue(json({ id: 'f1' }));
    await createDriveClient(getToken).trash('f1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/files/f1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ trashed: true });
  });

  it('shares with anyone who has the link and returns the link', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'perm' })).mockResolvedValueOnce(json({ webViewLink: 'https://drive.google.com/file/d/f1/view' }));

    const link = await createDriveClient(getToken).share('f1');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ role: 'reader', type: 'anyone' });
    expect(link).toBe('https://drive.google.com/file/d/f1/view');
  });

  it('stops sharing by removing the anyone-with-link permission', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await createDriveClient(getToken).unshare('f1');
    expect(fetchMock.mock.calls[0][0]).toContain('/files/f1/permissions/anyoneWithLink');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });
});
