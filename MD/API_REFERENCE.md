# API Reference

> Living document — reflects the implemented message contracts and Drive API usage.

## 1. Internal Messaging

Every background handler replies; if a handler throws, the reply is `{ success: false, error }`.

| Message | From → To | Payload | Response |
|---|---|---|---|
| `AUTH_REQUEST` | Popup/Library → Background | `{ type: 'LOGIN' \| 'LOGOUT' }` | `{ success, email?, name?, error? }` |
| `AUTH_STATUS` | Any → Background | — | `{ signedIn, email, name }` |
| `GET_AUTH_TOKEN` | Extension pages → Background | `{ refresh?: boolean }` | `{ success, token? }`. Refused for content scripts (`sender.url` must be an extension page) |
| `CAPTURE_SCREENSHOT` | Popup → Background | `{ mode: 'tab', tabId }` | `{ success, dataUrl }` |
| `CAPTURE_AREA` | Content → Background | `{ x, y, width, height }` (CSS px) | `{ success, base64, area }` |
| `CAPTURE_AREA_SELECT` | Popup → Content | — | `{ success }` |
| `UPLOAD_FILE` | Popup/Content → Background | `{ fileBase64, metadata: { name, type: 'screenshot' \| 'recording' \| 'other', mimeType? } }` | `{ success, fileId }` |
| `CHECK_STORAGE_QUOTA` | Popup → Background | — | `{ success, usage, limit \| null, available \| null, status }` |
| `OPEN_EDITOR` | Any → Background | `{ storageKey }` | `{ success }` |
| `START_RECORDING` | Popup → Background | `{ source: 'tab' \| 'screen', mic, tabId?, format?: 'mp4' \| 'webm' }` | Tab: `{ success, recording: { startedAt, source }, warning? }`. Screen: `{ success, pending: true }` (recorder window opened) |
| `RECORDING_STARTED` | Recorder window → Background | — | `{ success, recording }` once the user picked what to share |
| `STOP_RECORDING` | Popup / shortcut → Background | — | `{ success }` |
| `PAUSE_RECORDING` / `RESUME_RECORDING` | Popup, recorder window, shortcut → Background | — | `{ success, recording }` (state with `pausedAt` / `pausedMs`); badge shows `❚❚` while paused |
| `GET_RECORDING_STATE` | Popup → Background | — | `{ success, recording \| null, error \| null }` |
| `RECORDING_FINISHED` | Offscreen / recorder window → Background | — | Closes the recorder, opens Library `?review=recording` |
| `RECORDING_FAILED` | Offscreen / recorder window → Background | `{ error }` | Stored for the popup to show |
| `OFFSCREEN_START` | Background → Offscreen (`target: 'offscreen'`) | `{ streamId, mic, maxDurationMs, tabSize?, format }` | `{ success, warning?, error? }` |
| `OFFSCREEN_STOP` / `OFFSCREEN_PAUSE` / `OFFSCREEN_RESUME` | Background → Offscreen | — | `{ success }` |
| `RECORDER_STOP` / `RECORDER_PAUSE` / `RECORDER_RESUME` | Background → Recorder window (`target: 'recorder'`) | — | — |

Keyboard shortcuts (manifest `commands`, changeable at `chrome://extensions/shortcuts`): `pause-recording` Alt+Shift+P toggles pause, `stop-recording` Alt+Shift+S stops. While recording, the toolbar icon's badge (`REC` / `❚❚`) and tooltip are the only on-screen signs: the popup closes itself once a recording starts and the screen recorder window minimizes.

The Library and editor pages do not message the background for Drive work. They use `createPageDriveClient()` (below) with the token from `GET_AUTH_TOKEN`.

## 2. Drive Client (`src/shared/drive.ts`)

```typescript
const drive = createDriveClient(getToken);   // background: getToken from auth.ts
const drive = createPageDriveClient();       // extension pages

drive.upload(blob, { name, kind }, onProgress?) // → fileId; multipart ≤ 5 MB, resumable above
drive.listFiles()                                // → DriveFile[] across subfolders, all pages, newest first
drive.fetchBlob(fileId)
drive.rename(fileId, name)
drive.trash(fileId)                              // moves to Drive trash
drive.share(fileId)                              // → webViewLink (anyone with the link can view)
drive.unshare(fileId)
drive.getQuota()                                 // → { usage, limit | null, available | null, status }
```

```typescript
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: string;
  thumbnailLink?: string;
  webViewLink?: string;
  shared?: boolean;
  folder: string; // "Screenshots" | "Recordings" | "Other"
}
```

### Endpoints

| Operation | Request |
|---|---|
| Find folder | `GET /drive/v3/files?q=name='…' and mimeType='application/vnd.google-apps.folder' and trashed=false` |
| Create folder | `POST /drive/v3/files` |
| List files | `GET /drive/v3/files?q='<folder>' in parents and mimeType!='…folder' and trashed=false&fields=nextPageToken,files(id,name,mimeType,size,createdTime,thumbnailLink,webViewLink,shared)&pageSize=1000` |
| Small upload | `POST /upload/drive/v3/files?uploadType=multipart` |
| Large upload | `POST /upload/drive/v3/files?uploadType=resumable` → `PUT <Location>` with `Content-Range`, 308 until complete |
| Download/preview | `GET /drive/v3/files/{id}?alt=media` |
| Rename / trash | `PATCH /drive/v3/files/{id}` with `{ name }` / `{ trashed: true }` |
| Share | `POST /drive/v3/files/{id}/permissions` `{ role: 'reader', type: 'anyone' }` |
| Stop sharing | `DELETE /drive/v3/files/{id}/permissions/anyoneWithLink` |
| Quota | `GET /drive/v3/about?fields=storageQuota` |
| User info | `GET /oauth2/v3/userinfo` |

### Errors

| Status | Behaviour |
|---|---|
| 401 | One retry with a refreshed token, then `DriveError('…', 401)` |
| Other non-2xx | `DriveError` with Drive's `error.message` |

### Quota status

`available > 500 MB` → `normal`; `0 < available ≤ 500 MB` → `warning`; `0` → `full`; no `limit` → unlimited (`limit: null`, `normal`).

## 3. Storage Keys

| Where | Key | Purpose |
|---|---|---|
| `chrome.storage.local` | `auth_token`, `is_signed_in`, `user_email`, `user_name` | Auth |
| `chrome.storage.local` | `pending_edit_<timestamp>` | Screenshot waiting in the editor (cleared on save/discard or after 24 h) |
| `chrome.storage.local` | `record_mic`, `record_format` | Microphone toggle, recording format (`mp4` / `webm`) |
| `chrome.storage.session` | `recording_state` (`{ startedAt, source, pausedAt, pausedMs }`), `recording_error`, `recorder_window` | Recording in progress / last failure / open recorder window. Popup and recorder window follow `recording_state` live via `onChanged` |
| IndexedDB `pramana` → `recordings` | `pending` | Finished recording awaiting review |
