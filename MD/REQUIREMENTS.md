# Requirements

## Functional Requirements

### Screenshot Capture ✅
- Capture full screen or a user-selected area (two capture buttons: **Full Screen** and **Select Area**)
- Full Screen: uses `captureVisibleTab(windowId)` — instant, no picker dialog
- Select Area: uses `chrome.scripting.executeScript` + content script overlay, promise-based messaging
- Output format: **PNG** (lossless, universally supported)
- DPR-aware area crop (uses `img.naturalWidth / window.innerWidth` to avoid black regions)
- Post-capture editing: highlight, arrow, text, rectangle, blur, freehand drawing, emoji, eraser
- Select/move/delete placed elements
- Undo/redo across all tools

### Screen Recording ✅
- Record screen or browser tab
- Record microphone audio alongside video
- Maximum recording duration: **10 minutes**
- Output format: **WebM** (VP9 codec)
- Auto-stop when user stops sharing

### Screenshot Editor ✅
- **Inline editor** (modal on same page) — after Select Area capture; content script inlines all pure functions (no ES module imports)
- **Full-page editor** (new tab) — after Full Screen capture (via popup "Edit" button); uses `src/shared/editor/` module
- 9 tools: Select, Highlight, Draw, Text, Arrow, Rectangle, Blur, Emoji, Eraser
- Object-based rendering — elements can be selected, moved, deleted after placement
- Color picker (12 preset colors)
- Brush size and font size controls
- Undo/Redo (30-step stack)
- Canvas fitting: `max-width:100%;max-height:100%` with centered overlay (`pointer-events:none` + `transform: translate(-50%,-50%)`)
- Save edited screenshot to Google Drive

### Pramana Library (Dashboard) ✅
- Shows only files created by Pramana (never the user's full Drive)
- Grid view of files with thumbnails
- Search by filename
- Folder tabs: All / Screenshots / Recordings / Other (with file counts)
- File preview modal (images fetched via background auth, displayed as base64 data URL)
- Download files (via `chrome.downloads`)
- Delete files with confirmation
- Storage usage display

### Account & Storage ✅
- Google OAuth login (no separate Pramana account)
- Auto-creation of `Pramana/` folder with subfolders
- Upload, metadata tracking, and file organization
- Storage quota monitoring with status indicators

### Testing ✅
- Vitest test framework with jsdom environment
- Unit tests for pure utility functions (29 cases)
- Integration tests for background handlers (22 cases)
- Component tests for React UI (6 cases)
- Chrome API mocking in global test setup
- 59 total tests, all passing

## Non-Functional Requirements

| Requirement | Detail | Status |
|---|---|---|
| Privacy | No access to Drive content outside Pramana folder | ✅ |
| Cost | No backend server — free to run | ✅ |
| Performance | Capture feels instant, no noticeable lag | ✅ |
| Portability | Files remain in user's Drive, independent of extension | ✅ |
| Compatibility | Chrome (Manifest V3) | ✅ |
| Accessibility | Keyboard shortcuts, high contrast dark theme | ✅ |
| Testability | Pure functions extracted for unit testing | ✅ |

## File Size Limits

| Type | Max Size | Upload Strategy |
|---|---|---|
| Screenshot (PNG) | ~10MB | Single multipart upload |
| Recording (WebM) | ~500MB (10 min) | Single upload (chunked upload planned) |

## Keyboard Shortcuts

| Shortcut | Action | Context |
|---|---|---|
| `Ctrl+Z` | Undo | Editor |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo | Editor |
| `Ctrl+S` | Save to Drive | Full-page editor |
| `Delete` / `Backspace` | Delete selected element | Editor (select tool) |
| `Escape` | Deselect / close | Editor |

## MVP Scope Checklist

- [x] Google login
- [x] Google Drive connection
- [x] Storage quota monitoring
- [x] Screenshot capture (Full Screen + Select Area — two buttons only)
- [x] DPR-aware area crop
- [x] Screen recording with audio
- [x] Screenshot editing with tools
- [x] Object-based select/move/delete
- [x] Pramana file library with folder tabs
- [x] File preview with base64 auth
- [x] File download via chrome.downloads
- [x] Upload and file management
- [x] Test suite (Vitest, 59 tests passing)
- [ ] Basic video trimming (post-MVP)
- [ ] Offline upload queue (post-MVP)

## Known Limitations

- Recording runs in popup context — closing popup stops recording
- No chunked upload for large files yet (single multipart upload)
- No video trimming/FFmpeg integration yet
- No offline upload queue yet
- Emoji tool is hardcoded to fire emoji (extensible)
- Content script must be re-injected after extension reload (user must refresh page)
