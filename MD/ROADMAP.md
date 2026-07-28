# Roadmap

## Development Phases

### Phase 1 — Foundation ✅ Complete
- [x] Chrome extension project setup (Manifest V3)
- [x] React + TypeScript + Vite build pipeline
- [x] Base UI structure / component scaffolding
- [x] Manifest configuration (permissions, background service worker, content scripts)
- [x] `generate-manifest.js` for OAuth client ID injection
- [x] Fixed Extension ID via `key` field in manifest

### Phase 2 — Google Integration ✅ Complete
- [x] Google login flow (OAuth 2.0 via Chrome Identity API)
- [x] Token handling & auto-refresh
- [x] Drive connection test
- [x] Automatic `Pramana/` folder creation with subfolders (Screenshots, Recordings, Other)
- [x] User info fetching (oauth2/v3/userinfo with Drive API fallback)
- [x] Storage quota monitoring

### Phase 3 — Storage System ✅ Complete
- [x] File upload pipeline to Drive API (multipart)
- [x] Blob-to-base64 conversion for messaging
- [x] File listing from Pramana folder only (with `folder` field per file)
- [x] File deletion from Drive
- [x] Folder/subfolder creation with error handling
- [x] `FETCH_FILE_DATA` — fetch file content as base64 via background
- [x] `DOWNLOAD_FILE` — fetch + trigger chrome.downloads

### Phase 4 — Screenshot System ✅ Complete
- [x] Full screen capture (`captureVisibleTab(windowId)` — instant, no picker dialog)
- [x] Area selection capture (content script overlay + `chrome.scripting.executeScript`)
- [x] Selection overlay: hide before capture, forced reflow + setTimeout for clean screenshot
- [x] DPR-aware area crop (`img.naturalWidth / window.innerWidth` — no black layer)
- [x] Screenshot preview in popup with "Save to Drive" and "Edit" options
- [x] Two capture buttons only: Full Screen + Select Area

### Phase 5 — Screenshot Editor ✅ Complete
- [x] Object-based rendering (elements stored as data, not pixels)
- [x] 9 tools: Select, Highlight, Draw, Text, Arrow, Rectangle, Blur, Emoji, Eraser
- [x] Select tool: click to select, drag to move, Delete/Backspace to remove
- [x] Color picker (12 colors)
- [x] Brush size slider
- [x] Font size slider
- [x] Undo/Redo (Ctrl+Z / Ctrl+Shift+Z, 30-step stack)
- [x] Inline editor modal (after Select Area, on same page)
- [x] Full-page editor (after Full Screen, opens in new tab)
- [x] Save to Drive from editor
- [x] `willReadFrequently` canvas optimization
- [x] SVG icons in toolbar (innerHTML, not textContent)
- [x] Overlay canvas `pointer-events: none` + centered with `transform: translate(-50%, -50%)`
- [x] Canvas fitting: `max-width:100%;max-height:100%` with flex wrapper

### Phase 6 — Screen Recording ✅ Complete
- [x] Screen recording via `getDisplayMedia()` + `MediaRecorder` (VP9/WebM)
- [x] Microphone audio capture
- [x] Recording controls (start/stop)
- [x] Auto-stop when user stops sharing
- [x] Upload recording to Drive

### Phase 7 — Dashboard (Pramana Library) ✅ Complete
- [x] File library UI (grid view)
- [x] Search across filenames
- [x] Folder tabs (All / Screenshots / Recordings / Other) with file counts
- [x] File preview modal (images via FETCH_FILE_DATA → base64 data URL)
- [x] Download files (via DOWNLOAD_FILE → chrome.downloads)
- [x] Delete files with confirmation
- [x] Storage usage display

### Phase 8 — Testing ✅ Complete
- [x] Vitest test framework setup (jsdom environment)
- [x] Chrome API mock utility (`src/__test__/setup.ts`)
- [x] Pure function extraction (`src/shared/utils.ts`)
- [x] Unit tests: formatBytes, distToSegment, hexToRgba, rgbToHex, DEFAULT_COLORS, EMOJI_LIST
- [x] Integration tests: handleAuth, checkStorageQuota, handleCapture, handleCaptureArea, handleStorage, message router
- [x] Component tests: Dashboard App (folder tabs, search, file display)
- [x] E2E test scenarios documented in TESTING.md
- [x] 59 tests passing

### Phase 9 — Release ⬜ Not Started
- [ ] Privacy policy drafting
- [ ] User documentation
- [ ] Chrome Web Store listing & publishing

## What's Working Now

| Feature | Status | Notes |
|---|---|---|
| Google OAuth login | ✅ | Real Google OAuth, `drive.file` scope only |
| Full Screen capture | ✅ | Via `captureVisibleTab(windowId)` — instant, no picker; popup → preview → save/edit |
| Select Area capture | ✅ | `executeScript` → content script overlay → DPR-aware crop → inline editor |
| Inline editor | ✅ | Object-based, 9 tools, select/move/delete |
| Full-page editor | ✅ | Opens in new tab, uses shared editor module with centered overlay canvas |
| Upload to Drive | ✅ | Base64 → background → multipart upload |
| Drive folder management | ✅ | Auto-creates Pramana/Screenshots, etc. |
| Screen recording | ✅ | WebM, mic audio, auto-stop |
| Dashboard library | ✅ | Grid view, folder tabs, search, preview, download, delete |
| Storage quota display | ✅ | In popup and dashboard |
| File preview | ✅ | Base64 data URLs fetched via background (auth headers) |
| File download | ✅ | Via chrome.downloads API |
| Test suite | ✅ | 59 tests: 29 unit, 22 integration, 8 component |

## Future Roadmap (Post-MVP)

**Video Editing**
- Video trimming (FFmpeg WASM integration)
- Frame-by-frame annotations
- Export format selection (WebM fast / MP4 converted)

**AI Features**
- OCR text extraction from screenshots
- Automatic summaries of recordings
- Smart file naming
- AI-powered search across captures

**Advanced Recording**
- Webcam overlay
- Cursor effects
- Click animations
- Background blur

**Collaboration**
- Team workspaces
- Shared captures
- Comments
- Review workflows

## Explicitly NOT in Scope

- No cross-browser support (Firefox, Safari) — Chromium-based only
- No mobile companion app
- No team/collaboration features (post-MVP)
- No custom analytics or telemetry — Chrome Web Store provides metrics
- No monetization (free forever)
