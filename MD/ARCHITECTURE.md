# Architecture

## Overview

Pramana is a Chrome Extension (Manifest V3) with no backend server. All persistent storage lives in the user's own Google Drive; all processing (capture, editing, recording) happens client-side in the browser.

## Core Principle: User-Owned Storage

Pramana authenticates via the user's Google account (`drive.file` scope) and only ever reads/writes inside a single folder it created:

```
Google Drive
     |
     └── Pramana/
           ├── Screenshots/
           ├── Recordings/
           └── Other/
```

It never requests access to, lists, or displays the rest of the user's Drive.

## Execution Contexts (Manifest V3)

| Context | Role | Lifecycle |
|---|---|---|
| **Background (service worker)** | Message router, Google auth/token provider, tab capture, uploads sent by the content script, recording lifecycle (offscreen document, badge, state) | Can be killed/restarted by Chrome at any time; recording state lives in `chrome.storage.session` |
| **Content script** | Area-selection overlay, crop, and the shared editor mounted in a **shadow root** on the page. Injected on demand by the popup (`scripting.executeScript`), never declared in the manifest | Per tab; guards against double injection |
| **Popup** | Capture (Visible Tab, Select Area), recording controls (Record Tab / Record Screen, microphone toggle), storage meter | Destroyed when closed; nothing long-running lives here |
| **Offscreen document** | Tab recordings: owns the `MediaRecorder`, mixes tab audio with the microphone, plays tab audio back, saves to IndexedDB | Created for a tab recording, closed when it ends |
| **Screen recorder window** | Screen recordings: small visible window that opens Chrome's share picker (`getDisplayMedia`) and records while open | Opened by Record Screen, closed when the recording ends |
| **Editor page** | Full-page editor (shared editor module) for Visible Tab captures; uploads directly to Drive | Opened in a new tab |
| **Dashboard (Library)** | Browse, search, sort, preview (images + video), rename, share link, download, trash; reviews finished recordings; one-time microphone permission page | Full page |

## File Structure

```
src/
├── background/
│   ├── index.ts          # Message router; GET_AUTH_TOKEN only answers extension pages
│   ├── auth.ts           # Google OAuth, token provider with refresh after 401
│   ├── capture.ts        # captureVisibleTab for Visible Tab and Select Area
│   ├── storage.ts        # Drive client instance + uploads coming from the content script
│   └── recording.ts      # Offscreen document, recorder window, tab stream IDs, badge, session state
├── content/index.ts      # Overlay + crop + shared editor in a shadow root (bundled as one IIFE)
├── offscreen/
│   ├── index.html
│   └── recorder.ts       # Tab capture at the tab's own size, hands the stream to captureRecorder
├── recorder/
│   └── App.tsx           # Screen recorder window: share picker, timer, Stop
├── popup/App.tsx
├── editor/
│   ├── App.tsx           # Hosts the shared editor; uploads directly via the Drive client
│   └── pendingEdits.ts   # Cleans up abandoned pending screenshots
├── dashboard/
│   ├── App.tsx           # Library: auth gate, list, filters, sort
│   ├── FileCard.tsx      # Lazy thumbnails (Drive thumbnailLink, full-image fallback)
│   ├── PreviewModal.tsx  # Preview, rename, share, download, trash
│   ├── RecordingReview.tsx
│   ├── ConfirmDialog.tsx
│   ├── MicPermission.tsx
│   └── useObjectUrl.ts
└── shared/
    ├── drive.ts          # Drive client used by background and pages
    ├── captureRecorder.ts # MediaRecorder + audio mixing + 10-minute limit, shared by both recorders
    ├── recordingStore.ts # IndexedDB hand-off of the finished recording
    ├── StorageMeter.tsx  # Handles unlimited accounts
    ├── toast.ts          # Non-blocking notifications (no alert/confirm/prompt)
    ├── ErrorBoundary.tsx
    ├── utils.ts
    └── editor/           # One object-based editor for both contexts
        ├── index.ts      # createEditor(): DOM, state, input, history
        ├── elements.ts   # Pure rendering, hit-testing, moving, blur sizing
        ├── types.ts
        ├── styles.ts     # Injected CSS (works inside a shadow root)
        └── icons.ts
```

## Build

| Output | Built by | Why |
|---|---|---|
| Popup, Library, Editor, Offscreen pages + `background.js` | `vite.config.ts` | ES modules with shared chunks |
| `content.js` | `vite.content.config.ts` (IIFE) | Content scripts are classic scripts: the shared editor must be bundled in, not imported |
| `manifest.json` | `scripts/generate-manifest.js` | Injects the OAuth client ID from `.env` |

## Data Flow

### Visible Tab capture

```
Popup ──CAPTURE_SCREENSHOT──► Background ── captureVisibleTab(windowId) ──► dataUrl
Popup shows preview
  ├─ Save to Drive → UPLOAD_FILE (base64) → Background → Drive (multipart)
  └─ Edit → chrome.storage.local["pending_edit_<ts>"] → Editor tab
        Editor → Drive client (direct upload) → pending image removed only after a successful save
```

### Select Area capture

```
Popup ── executeScript(content.js) + CAPTURE_AREA_SELECT ──► Content script
Content: overlay (Escape cancels) → user drags → overlay removed → reflow + 200 ms
Content ──CAPTURE_AREA──► Background ── captureVisibleTab ──► base64
Content: crop at capture resolution (image width / viewport width) → shared editor in shadow root
Save → UPLOAD_FILE (base64) → Background → Drive
```

### Tab recording

```
Popup ──START_RECORDING {source: 'tab', mic, tabId}──► Background
Background: tabCapture.getMediaStreamId({targetTabId}) + tab size (chrome.tabs.get)
Background → offscreen.createDocument(USER_MEDIA) → OFFSCREEN_START {streamId, mic, tabSize, ...}
Offscreen: getUserMedia(chromeMediaSource: 'tab', exact tab size up to 1920×1080, 30 fps) [+ mic]
  → AudioContext mix → MediaRecorder (1 s chunks); tab audio routed back to the speakers
```

A tab recording follows **that tab**, not whatever tab is in front: switching tabs keeps recording the original one (Chrome keeps rendering it), navigating inside it keeps recording, and closing it ends the recording and keeps what was captured.

The offscreen document has no UI, so Chrome can't prompt for the microphone there. Turning on "Include microphone" opens a Library page once to grant it for the extension.

### Screen recording

Chrome's share picker can't open from the service worker (there's no window to attach it to), and the stream it returns only works in the page that asked for it. So:

```
Popup ──START_RECORDING {source: 'screen', mic}──► Background → windows.create(recorder window)  (reply: pending)
Recorder window opens getDisplayMedia straight away, with Entire screen preselected (a button appears only if Chrome wants a click)
  → RECORDING_STARTED → Background marks the recording, badge REC
  → captureRecorder records in the window (mic prompt can appear here directly)
Stop: popup (STOP_RECORDING → RECORDER_STOP), the window's Stop button, or Chrome's "Stop sharing" bar
Closing the window mid-recording asks first; if closed anyway the recording is discarded and the popup says so
```

### After either recording

```
Stop / end of sharing / 10 minutes → blob saved to IndexedDB → RECORDING_FINISHED
Background closes the offscreen doc or recorder window → opens Library ?review=recording
Library: preview, rename, Save (resumable upload with progress) or Discard
```

### Library

Extension pages talk to Drive directly with `createPageDriveClient()`, which borrows the token from the background (`GET_AUTH_TOKEN`). That keeps large files (video preview, downloads, recording uploads) out of runtime messages, which are limited to about 64 MB.

## Drive Client (`shared/drive.ts`)

- Every request carries the token; a **401 triggers one retry** with a refreshed token (the background drops the cached token first).
- Listing follows `nextPageToken`, so libraries with more than one page of files are complete.
- Uploads up to 5 MB use multipart; larger ones use a **resumable session** in 8 MB chunks with progress.
- Delete moves files to Drive's **trash** (restorable).
- Sharing creates an `anyone` reader permission and returns `webViewLink`; un-sharing deletes the `anyoneWithLink` permission.
- Quota: accounts without a `limit` are treated as unlimited.

## Editor Architecture

One module, `shared/editor`, renders in both contexts. Annotations are data, re-rendered on every change:

```typescript
type EditorElement =
  | { type: 'highlight' | 'rectangle' | 'blur'; x; y; width; height; color; lineWidth }
  | { type: 'arrow'; x1; y1; x2; y2; color; lineWidth }
  | { type: 'draw'; points: Point[]; color; lineWidth }
  | { type: 'text'; x; y; width; height; text; color; fontSize }
  | { type: 'emoji'; x; y; width; height; emoji; fontSize };
```

- Element arrays are never mutated, so undo/redo (30 steps) stores them directly. Moves are recorded once per drag.
- Tools: Select, Highlight, Draw, Text (inline input, no `prompt()`), Arrow, Rectangle, Blur, Emoji (24 choices), Eraser. Single-key shortcuts (V H P T A R B E X), Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Ctrl+C (Copy image), Ctrl+S, Delete, Escape.
- Copy image (`src/shared/clipboard.ts`): writes a PNG with `navigator.clipboard.write`, passing the image as a promise so the click's permission is kept; also in the popup preview and the Library preview. Not available on `http://` pages (no async clipboard there).
- Blur pixelates with blocks of a quarter of the region's short side (min 16 px), so text inside is unreadable.
- Keyboard handling uses the capture phase, so shortcuts reach the editor before the page underneath.
- The canvas keeps full resolution and is scaled to fit with a `ResizeObserver`.

## State Management

| State | Storage | Purpose |
|---|---|---|
| Auth token, user info | `chrome.storage.local` | Persisted across sessions |
| Pending screenshot for the editor | `chrome.storage.local["pending_edit_<ts>"]` | Survives an editor refresh; removed after save/discard, or after 24 h |
| Recording in progress | `chrome.storage.session` (`recording_state`, `recorder_window`) | Popup timer after reopening; cleared on finish/failure |
| Finished recording awaiting review | IndexedDB `pramana/recordings` | Shared by offscreen document and Library |
| Microphone preference, recording format | `chrome.storage.local["record_mic"]`, `["record_format"]` (`mp4` default / `webm`) | Popup controls |
| Editor elements, history | In memory | Re-rendered per change |

## Error Handling

| Scenario | Handling |
|---|---|
| Handler throws | Router always replies `{ success: false, error }`; callers never hang |
| Token expired | One retry with a refreshed token |
| Upload fails | Toast/notice with the Drive message; editor Save re-enables; recordings stay in IndexedDB for retry |
| Signed out in Library | Sign-in prompt instead of an empty list |
| Library load fails | Error with Try again |
| Microphone blocked | Recording continues without voice and says so |
| Browser pages (`chrome://`) | Select Area refuses with a message |

## Why Manifest V3 / Why Drive

MV3 is the only forward-compatible extension platform; the service worker can be killed at any time, which is why recording lives in an offscreen document and state lives in `chrome.storage.session`. Drive as the only backend means no server to run or secure, no storage cost, and privacy enforced by the `drive.file` scope.
