/// <reference types="chrome" />

// Google Drive client shared by the background worker and extension pages.
// Everything lives under a single app-created `Pramana/` folder (drive.file scope).

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_FOLDER = 'Pramana';
const FILE_FIELDS = 'id,name,mimeType,size,createdTime,thumbnailLink,webViewLink,shared';

// Files above this size use a resumable upload instead of a single multipart request
export const MULTIPART_LIMIT = 5 * 1024 * 1024;
// Resumable chunks must be a multiple of 256 KiB
export const UPLOAD_CHUNK_SIZE = 32 * 256 * 1024;

export const SUBFOLDERS = {
  screenshot: 'Screenshots',
  recording: 'Recordings',
  other: 'Other',
} as const;

export type FileKind = keyof typeof SUBFOLDERS;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: string;
  thumbnailLink?: string;
  webViewLink?: string;
  shared?: boolean;
  folder: string;
}

export interface StorageQuota {
  usage: number;
  // null when the account has unlimited storage
  limit: number | null;
  available: number | null;
  status: 'normal' | 'warning' | 'full';
}

/** Returns a token; `refresh` asks for a new one because the previous one was rejected. */
export type TokenProvider = (refresh?: boolean) => Promise<string | null>;

export class DriveError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
  }
}

const LOW_SPACE_BYTES = 500 * 1024 * 1024;

export function summarizeQuota(raw: { limit?: string; usage?: string }): StorageQuota {
  const usage = Number(raw.usage || 0);
  if (raw.limit === undefined) {
    return { usage, limit: null, available: null, status: 'normal' };
  }
  const limit = Number(raw.limit);
  const available = Math.max(0, limit - usage);
  const status = available > LOW_SPACE_BYTES ? 'normal' : available > 0 ? 'warning' : 'full';
  return { usage, limit, available, status };
}

export function createDriveClient(getToken: TokenProvider) {
  const folderCache = new Map<string, string>();

  async function request(url: string, init: RequestInit = {}, refresh = false): Promise<Response> {
    const token = await getToken(refresh);
    if (!token) throw new DriveError('Not signed in to Google', 401);
    const response = await fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
    // An expired token gets one retry with a fresh token
    if (response.status === 401 && !refresh) return request(url, init, true);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new DriveError(data.error?.message || `Drive request failed (${response.status})`, response.status);
    }
    return response;
  }

  async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    return (await request(url, init)).json();
  }

  async function listAll<T>(q: string, fields: string): Promise<T[]> {
    const results: T[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q, fields: `nextPageToken,files(${fields})`, pageSize: '1000' });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await requestJson<{ files?: T[]; nextPageToken?: string }>(`${API}/files?${params}`);
      results.push(...(data.files || []));
      pageToken = data.nextPageToken;
    } while (pageToken);
    return results;
  }

  async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
    const cacheKey = `${parentId || ''}/${name}`;
    const cached = folderCache.get(cacheKey);
    if (cached) return cached;

    let q = `name='${name}' and mimeType='${FOLDER_MIME}' and trashed=false`;
    if (parentId) q += ` and '${parentId}' in parents`;
    const [existing] = await listAll<{ id: string }>(q, 'id');

    let id = existing?.id;
    if (!id) {
      const created = await requestJson<{ id?: string }>(`${API}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId && { parents: [parentId] }) }),
      });
      if (!created.id) throw new DriveError(`Could not create the ${name} folder`, 500);
      id = created.id;
    }
    folderCache.set(cacheKey, id);
    return id;
  }

  async function getRootFolder() {
    return findOrCreateFolder(ROOT_FOLDER);
  }

  async function uploadMultipart(blob: Blob, metadata: object): Promise<string> {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    const result = await requestJson<{ id: string }>(`${UPLOAD_API}?uploadType=multipart&fields=id`, {
      method: 'POST',
      body: form,
    });
    return result.id;
  }

  async function uploadResumable(blob: Blob, metadata: object, onProgress?: (fraction: number) => void): Promise<string> {
    const session = await request(`${UPLOAD_API}?uploadType=resumable&fields=id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': blob.type || 'application/octet-stream',
        'X-Upload-Content-Length': String(blob.size),
      },
      body: JSON.stringify(metadata),
    });
    const location = session.headers.get('Location');
    if (!location) throw new DriveError('Drive did not start the upload', 500);

    // The session URL authorizes the upload itself, so chunks are sent without a token
    let offset = 0;
    for (;;) {
      const end = Math.min(offset + UPLOAD_CHUNK_SIZE, blob.size);
      const response = await fetch(location, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${blob.size}` },
        body: blob.slice(offset, end),
      });
      if (response.status === 308) {
        const range = response.headers.get('Range');
        offset = range ? Number(range.split('-')[1]) + 1 : end;
        onProgress?.(offset / blob.size);
        continue;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new DriveError(data.error?.message || `Upload failed (${response.status})`, response.status);
      }
      onProgress?.(1);
      return (await response.json()).id;
    }
  }

  return {
    async upload(
      blob: Blob,
      { name, kind }: { name: string; kind: FileKind },
      onProgress?: (fraction: number) => void
    ): Promise<string> {
      const root = await getRootFolder();
      const folderId = await findOrCreateFolder(SUBFOLDERS[kind] || SUBFOLDERS.other, root);
      const metadata = { name, parents: [folderId] };
      return blob.size > MULTIPART_LIMIT
        ? uploadResumable(blob, metadata, onProgress)
        : uploadMultipart(blob, metadata);
    },

    async listFiles(): Promise<DriveFile[]> {
      const root = await getRootFolder();
      const subfolders = await listAll<{ id: string; name: string }>(
        `'${root}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
        'id,name'
      );
      const perFolder = await Promise.all(
        subfolders.map(async (folder) => {
          const files = await listAll<Omit<DriveFile, 'folder'>>(
            `'${folder.id}' in parents and mimeType!='${FOLDER_MIME}' and trashed=false`,
            FILE_FIELDS
          );
          return files.map((file) => ({ ...file, folder: folder.name }));
        })
      );
      return perFolder
        .flat()
        .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
    },

    async fetchBlob(fileId: string): Promise<Blob> {
      return (await request(`${API}/files/${fileId}?alt=media`)).blob();
    },

    async rename(fileId: string, name: string): Promise<void> {
      await request(`${API}/files/${fileId}?fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    },

    // Moves to Drive's trash rather than deleting, so the user can still restore it
    async trash(fileId: string): Promise<void> {
      await request(`${API}/files/${fileId}?fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      });
    },

    /** Makes the file viewable by anyone with the link and returns that link. */
    async share(fileId: string): Promise<string> {
      await request(`${API}/files/${fileId}/permissions?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      });
      const file = await requestJson<{ webViewLink: string }>(`${API}/files/${fileId}?fields=webViewLink`);
      return file.webViewLink;
    },

    async unshare(fileId: string): Promise<void> {
      await request(`${API}/files/${fileId}/permissions/anyoneWithLink`, { method: 'DELETE' });
    },

    async getQuota(): Promise<StorageQuota> {
      const data = await requestJson<{ storageQuota: { limit?: string; usage?: string } }>(
        `${API}/about?fields=storageQuota`
      );
      return summarizeQuota(data.storageQuota);
    },
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;

/** Drive client for extension pages, which borrow the background worker's Google token. */
export function createPageDriveClient(): DriveClient {
  return createDriveClient(async (refresh) => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN', payload: { refresh } });
    return response?.token ?? null;
  });
}
