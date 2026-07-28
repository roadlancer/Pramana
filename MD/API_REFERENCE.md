# API Reference

> Living document — reflects the actual implemented message contracts and API usage.

## 1. Internal Messaging (Extension Contexts)

### Message Types

| Message | From → To | Payload | Response | Purpose |
|---|---|---|---|---|
| `AUTH_REQUEST` | Popup → Background | `{ type: 'LOGIN' \| 'LOGOUT' }` | `{ success, email?, name?, error? }` | Trigger Google OAuth flow |
| `AUTH_STATUS` | Any → Background | `{}` | `{ signedIn, email, name }` | Check current auth state |
| `CAPTURE_SCREENSHOT` | Popup → Background | `{ mode: 'tab' }` | `{ success, dataUrl, error? }` | Capture visible tab via `captureVisibleTab(windowId)` — instant, no picker |
| `CAPTURE_AREA` | Content → Background | `{ x, y, width, height }` | `{ success, base64, area, error? }` | Capture full tab for area cropping |
| `CAPTURE_AREA_SELECT` | Popup → Content | `{}` | `{ success }` | Tell content script to show selection overlay (must respond via `sendResponse({ success: true })` and `return true`) |
| `UPLOAD_FILE` | Any → Background | `{ fileBase64, metadata: { name, type } }` | `{ success, fileId, error? }` | Upload file to Google Drive |
| `CHECK_STORAGE_QUOTA` | Popup/Dashboard → Background | `{}` | `{ limit, usage, available, status }` | Get Drive storage info |
| `LIST_FILES` | Dashboard → Background | `{}` | `{ success, files[], error? }` | List files in Pramana folder with `folder` field |
| `DELETE_FILE` | Dashboard → Background | `{ fileId }` | `{ success, error? }` | Delete file from Drive |
| `FETCH_FILE_DATA` | Dashboard → Background | `{ fileId }` | `{ success, base64, mimeType, error? }` | Fetch file content as base64 (authorized) |
| `DOWNLOAD_FILE` | Dashboard → Background | `{ fileId, fileName }` | `{ success, error? }` | Fetch file + trigger chrome.downloads |
| `OPEN_EDITOR` | Content/Popup → Background | `{ storageKey }` | `{ success }` | Open editor page in new tab |

### Message Flow: Select Area Capture

```
Popup                          Content Script                 Background
  │                                  │                            │
  ├─ executeScript(content.js) ──────►│ (ISOLATED world)          │
  ├─ sendMessage(CAPTURE_AREA_SELECT)►│                            │
  │  (promise-based chrome.tabs)      │                            │
  │                                  ├─ sendResponse({success})   │
  │                                  │  return true (MV3 async)   │
  │                                  │ (show overlay)              │
  │                                  │ (user drags)                │
  │                                  │ (remove overlay)            │
  │                                  │ (forced reflow + delay)     │
  │                                  ├─ sendMessage(CAPTURE_AREA)─►│
  │                                  │                            │ (captureVisibleTab(windowId))
  │                                  │◄─ { success, base64 } ─────┤
  │                                  │ (DPR-aware crop)            │
  │                                  │ (open editor modal)         │
  │                                  │                            │
```

### Message Flow: Upload

```
Popup/Content                    Background                    Google Drive
  │                                  │                            │
  ├─ sendMessage(UPLOAD_FILE) ──────►│                            │
  │  { fileBase64, metadata }        │                            │
  │                                  ├─ getStoredToken()           │
  │                                  │ (auto-refresh if expired)   │
  │                                  ├─ getOrCreateFolder() ──────►│
  │                                  ├─ getOrCreateSubfolder() ───►│
  │                                  ├─ fetch(multipart upload) ──►│
  │                                  │◄─ { id } ──────────────────┤
  │◄─ { success, fileId } ──────────┤                            │
```

### Message Flow: File Preview & Download

```
Dashboard                       Background                    Google Drive
  │                                  │                            │
  ├─ sendMessage(FETCH_FILE_DATA) ──►│                            │
  │  { fileId }                      ├─ fetch(?alt=media) ───────►│
  │                                  │◄─ file content ────────────┤
  │◄─ { success, base64, mimeType } ┤                            │
  │ (display in preview modal)       │                            │
  │                                  │                            │
  ├─ sendMessage(DOWNLOAD_FILE) ────►│                            │
  │  { fileId, fileName }            ├─ fetch(?alt=media) ───────►│
  │                                  ├─ chrome.downloads.download  │
  │◄─ { success } ──────────────────┤                            │
```

## 2. Google Drive API Usage

| Operation | API Call | Endpoint |
|---|---|---|
| Check storage quota | GET | `https://www.googleapis.com/drive/v3/about?fields=storageQuota` |
| Create folder | POST | `https://www.googleapis.com/drive/v3/files` (mimeType: folder) |
| Upload file | POST | `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` |
| List files | GET | `https://www.googleapis.com/drive/v3/files?q=...` |
| Delete file | DELETE | `https://www.googleapis.com/drive/v3/files/{fileId}` |
| Fetch file data | GET | `https://www.googleapis.com/drive/v3/files/{fileId}?alt=media` |
| Get user info | GET | `https://www.googleapis.com/oauth2/v3/userinfo` |

### Upload Format

Multipart upload with metadata + file content:

```
POST /upload/drive/v3/files?uploadType=multipart
Authorization: Bearer <token>
Content-Type: multipart/related; boundary=...

--boundary
Content-Type: application/json

{
  "name": "screenshot-1234567890.png",
  "parents": ["<subfolder-id>"]
}
--boundary
Content-Type: image/png

<binary data>
--boundary--
```

### Folder Structure

```
Pramana/                          (created on first login)
├── Screenshots/                  (for screenshot uploads)
├── Recordings/                   (for recording uploads)
└── Other/                        (fallback)
```

Folders are created lazily — only when the first file of that type is uploaded. `getOrCreateFolder()` and `getOrCreateSubfolder()` handle this with search-then-create logic and error fallback.

### List Files Response

`listFiles` returns files with a `folder` field indicating which subfolder they belong to:

```typescript
interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
  folder: string;  // "Screenshots" | "Recordings" | "Other"
}
```

### Storage Quota Response

```json
{
  "storageQuota": {
    "limit": "16106127360",
    "usage": "12884901888",
    "usageInDrive": "10737418240"
  }
}
```

Storage states:
- `available > 524288000` (500MB) → `"normal"`
- `0 < available ≤ 524288000` → `"warning"`
- `available = 0` → `"full"`

## 3. Error Handling

| HTTP Code | Meaning | Behavior |
|---|---|---|
| 401 | Token expired | Silent refresh via `chrome.identity.getAuthToken({ interactive: false })` |
| 403 | Rate limit / storage full | Error toast, retry or pause uploads |
| 404 | File not found | Remove orphaned metadata |
| 500/503 | Server error | Error toast, user retries |

### Error Response Format

```json
{
  "error": {
    "code": 403,
    "message": "The storage quota has been exceeded.",
    "errors": [{ "reason": "storageQuotaExceeded", "domain": "global" }]
  }
}
```

## 4. Data Formats

### File Upload Payload

```typescript
{
  fileBase64: string;     // Base64-encoded file content (no data: prefix)
  metadata: {
    name: string;         // e.g., "screenshot-1234567890.png"
    type: string;         // "screenshot" | "recording" | "other"
  };
}
```

### File Item (from LIST_FILES)

```typescript
{
  id: string;             // Google Drive file ID
  name: string;           // File name
  mimeType: string;       // MIME type
  size: string;           // File size in bytes
  createdTime: string;    // ISO 8601 timestamp
  folder: string;         // Subfolder name: "Screenshots" | "Recordings" | "Other"
}
```

### Fetch File Data Response

```typescript
{
  success: boolean;
  base64?: string;        // Base64-encoded file content
  mimeType?: string;      // MIME type of the file
  error?: string;         // Error message if failed
}
```

## 5. Chrome Storage Keys

| Key | Type | Purpose |
|---|---|---|
| `auth_token` | `string` | Cached OAuth token |
| `is_signed_in` | `boolean` | Auth state flag |
| `user_email` | `string` | User's Google email |
| `user_name` | `string` | User's display name |
| `pending_edit_*` | `string` | Base64 image data for editor tab |

## 6. Test Coverage

The following message handlers have integration tests in `src/background/__tests__/`:

| Handler | Test File | Test Cases |
|---|---|---|
| `checkStorageQuota` | `auth.test.ts` | 5 (normal, warning, full, error, API error) |
| `handleCapture` | `capture.test.ts` | 3 (tab capture, no tab, unhandled mode) |
| `handleCaptureArea` | `capture.test.ts` | 3 (success, no window info, failure) |
| `handleStorage` routing | `storage.test.ts` | 6 (LIST_FILES, DELETE, UNKNOWN, UPLOAD success/error, DELETE failure) |
| Message router | `index.test.ts` | 6 (listener registration, async, unknown, AUTH_STATUS, OPEN_EDITOR, error) |
