// In-memory Google Drive + userinfo, answering intercepted googleapis.com requests.
import { readFileSync } from 'node:fs';

const FOLDER = 'application/vnd.google-apps.folder';

export function createFakeDrive({ thumbBase }) {
  let nextId = 100;
  const sessions = new Map();
  const log = [];
  const png = readFileSync(new URL('./sample.png', import.meta.url));
  const files = [
    { id: 'root', name: 'Pramana', mimeType: FOLDER, parents: [] },
    { id: 'shots', name: 'Screenshots', mimeType: FOLDER, parents: ['root'] },
    { id: 'recs', name: 'Recordings', mimeType: FOLDER, parents: ['root'] },
    { id: 'img1', name: 'login-page.png', mimeType: 'image/png', parents: ['shots'], createdTime: '2026-10-01T10:00:00Z', data: png },
    { id: 'img2', name: 'checkout-bug.png', mimeType: 'image/png', parents: ['shots'], createdTime: '2026-10-05T10:00:00Z', data: png },
  ];

  const meta = (f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.data ? String(f.data.length) : undefined,
    createdTime: f.createdTime,
    shared: !!f.shared,
    webViewLink: `https://drive.google.com/file/d/${f.id}/view`,
    ...(f.mimeType.startsWith('image/') && { thumbnailLink: `${thumbBase}/thumb/${f.id}` }),
  });
  const json = (body, status = 200, headers = {}) => ({ status, headers: { 'Content-Type': 'application/json', ...headers }, body: Buffer.from(JSON.stringify(body)) });
  const find = (id) => files.find((f) => f.id === id && !f.trashed);

  function addFile({ name, parents, mimeType, data }) {
    const f = { id: `f${nextId++}`, name, parents, mimeType, data, createdTime: new Date().toISOString() };
    files.push(f);
    log.push(`UPLOAD ${name} ${data.length}B → ${parents}`);
    return f;
  }

  function parseMultipart(body, contentType) {
    const boundary = contentType.match(/boundary=(.+)$/)[1];
    const parts = body.toString('latin1').split(`--${boundary}`).slice(1, -1);
    const [metaPart, filePart] = parts.map((p) => {
      const idx = p.indexOf('\r\n\r\n');
      return { headers: p.slice(0, idx), body: Buffer.from(p.slice(idx + 4, -2), 'latin1') };
    });
    const type = (filePart.headers.match(/Content-Type: (.+)/i) || [])[1]?.trim() || 'application/octet-stream';
    return { metadata: JSON.parse(metaPart.body.toString()), data: filePart.body, type };
  }

  function handle({ method, url, headers, body }) {
    const u = new URL(url);
    const path = u.pathname;
    if (method === 'OPTIONS') return { status: 204, headers: {}, body: Buffer.alloc(0) };

    if (path === '/oauth2/v3/userinfo') return json({ email: 'tester@example.com', name: 'Test User' });
    if (path === '/drive/v3/about') return json({ storageQuota: { limit: String(15 * 1024 ** 3), usage: String(3.2 * 1024 ** 3) } });

    if (path === '/upload/drive/v3/files' && u.searchParams.get('uploadType') === 'multipart') {
      const { metadata, data, type } = parseMultipart(body, headers['Content-Type'] || headers['content-type']);
      return json({ id: addFile({ ...metadata, mimeType: type, data }).id });
    }
    if (path === '/upload/drive/v3/files' && u.searchParams.get('uploadType') === 'resumable' && method === 'POST') {
      const sid = `s${nextId++}`;
      sessions.set(sid, { metadata: JSON.parse(body.toString()), type: headers['X-Upload-Content-Type'], total: Number(headers['X-Upload-Content-Length']), chunks: [] });
      log.push(`RESUMABLE start ${sid}`);
      return { status: 200, headers: { Location: `https://www.googleapis.com/upload/drive/v3/files?upload_id=${sid}` }, body: Buffer.alloc(0) };
    }
    if (path === '/upload/drive/v3/files' && u.searchParams.get('upload_id') && method === 'PUT') {
      const s = sessions.get(u.searchParams.get('upload_id'));
      s.chunks.push(body);
      const received = s.chunks.reduce((n, c) => n + c.length, 0);
      log.push(`RESUMABLE chunk ${body.length}B (${received}/${s.total})`);
      if (received < s.total) return { status: 308, headers: { Range: `bytes=0-${received - 1}` }, body: Buffer.alloc(0) };
      return json({ id: addFile({ ...s.metadata, mimeType: s.type, data: Buffer.concat(s.chunks) }).id });
    }

    if (path === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') || '';
      let res = files.filter((f) => !f.trashed);
      const name = q.match(/name='([^']+)'/);
      if (name) res = res.filter((f) => f.name === name[1]);
      const parent = q.match(/'([^']+)' in parents/);
      if (parent) res = res.filter((f) => f.parents.includes(parent[1]));
      if (q.includes(`mimeType='${FOLDER}'`)) res = res.filter((f) => f.mimeType === FOLDER);
      if (q.includes(`mimeType!='${FOLDER}'`)) res = res.filter((f) => f.mimeType !== FOLDER);
      return json({ files: res.map(meta) });
    }
    if (path === '/drive/v3/files' && method === 'POST') {
      const b = JSON.parse(body.toString());
      const f = { id: `f${nextId++}`, ...b, parents: b.parents || [] };
      files.push(f);
      log.push(`FOLDER ${b.name}`);
      return json({ id: f.id });
    }

    const perm = path.match(/^\/drive\/v3\/files\/([^/]+)\/permissions(?:\/(.+))?$/);
    if (perm) {
      const f = find(perm[1]);
      if (!f) return json({ error: { message: 'File not found' } }, 404);
      f.shared = method === 'POST';
      log.push(`${f.shared ? 'SHARE' : 'UNSHARE'} ${f.name}`);
      return method === 'POST' ? json({ id: 'anyoneWithLink' }) : { status: 204, headers: {}, body: Buffer.alloc(0) };
    }

    const one = path.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (one) {
      const f = find(one[1]);
      if (!f) return json({ error: { message: 'File not found' } }, 404);
      if (method === 'PATCH') {
        const b = JSON.parse(body.toString());
        Object.assign(f, b);
        log.push(`PATCH ${f.name} ${JSON.stringify(b)}`);
        return json({ id: f.id });
      }
      if (u.searchParams.get('alt') === 'media') return { status: 200, headers: { 'Content-Type': f.mimeType }, body: f.data };
      return json(meta(f));
    }
    return json({ error: { message: `fake drive: unhandled ${method} ${path}` } }, 400);
  }

  return { handle, files, log, thumb: (id) => find(id)?.data };
}
