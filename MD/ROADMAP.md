# Roadmap

## Development Phases

### Phase 1 — Foundation ✅ Complete
- [x] Chrome extension project setup (Manifest V3)
- [x] React + TypeScript + Vite build pipeline
- [x] Base UI structure / component scaffolding
- [x] Manifest configuration (permissions, background service worker; content script injected on demand)
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
- [x] Two capture buttons: Visible Tab + Select Area

### Phase 5 — Screenshot Editor ✅ Complete
- [x] Object-based rendering (elements stored as data, not pixels)
- [x] 9 tools: Select, Highlight, Draw, Text, Arrow, Rectangle, Blur, Emoji, Eraser
- [x] Select tool: click to select, drag to move, Delete/Backspace to remove
- [x] Color picker (12 colors)
- [x] Brush size slider
- [x] Font size slider
- [x] Undo/Redo (Ctrl+Z / Ctrl+Shift+Z, 30-step stack)
- [x] Inline editor modal (after Select Area, on same page)
- [x] Full-page editor (after Visible Tab → Edit, opens in new tab)
- [x] Save to Drive from editor
- [x] `willReadFrequently` canvas optimization
- [x] SVG icons in toolbar (innerHTML, not textContent)
- [x] Overlay canvas `pointer-events: none` + centered with `transform: translate(-50%, -50%)`
- [x] Canvas fitting: `max-width:100%;max-height:100%` with flex wrapper

### Phase 6 — Screen Recording ✅ Complete
- [x] Tab recording via `tabCapture` + `MediaRecorder` (VP9/WebM)
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
- [x] IntersectionObserver mock for dashboard tests
- [x] Pure function extraction (`src/shared/utils.ts`)
- [x] Unit tests: formatBytes, distToSegment, hexToRgba, rgbToHex, DEFAULT_COLORS, EMOJI_LIST
- [x] Integration tests: handleAuth, checkStorageQuota, handleCapture, handleCaptureArea, handleStorage, message router
- [x] Component tests: Dashboard App (folder tabs, search, file display)
- [x] E2E test scenarios documented in TESTING.md
- [x] Initial 59 tests

### Phase 8.5 — Code Quality ✅ Complete
- [x] Removed dead Zustand store (never wired to any component)
- [x] Removed Vite scaffold leftovers (App.tsx, main.tsx, assets/)
- [x] Added ErrorBoundary component for crash-safe React UIs
- [x] Fixed dashboard thumbnails (lazy-loaded via IntersectionObserver)
- [x] Removed CSS duplication (duplicate .user-email, .storage-info, .storage-bar, .storage-fill rules)
- [x] Fixed private field access in shared editor (added getCurrentTool/getIsDrawing getters)
- [x] Added .env.example for developer onboarding
- [x] Cleaned up blank lines in popup and dashboard

### Phase 8.6 — Hardening & Missing Features ✅ Complete
- [x] Fixed storage meter never showing (quota response), router replies on errors instead of hanging
- [x] One object-based editor for both contexts (Select tool everywhere, inline text, single Save button, strong blur)
- [x] Fixed first editor drag being lost; editor keeps the screenshot across refresh
- [x] Escape cancels area selection; on-demand injection only, guarded against double injection; editor in a shadow root
- [x] Recording in an offscreen document (survives popup close), Record Screen, microphone, tab audio passthrough, REC badge
- [x] Recording review in the Library before saving
- [x] Shared Drive client: 401 refresh + retry, pagination, resumable uploads with progress, trash instead of delete
- [x] Library: sign-in prompt, error/retry, sort, rename, share link / stop sharing / open in Drive, video playback, Drive thumbnails, in-page confirm dialog
- [x] Replaced `alert` / `confirm` / `prompt` with toasts, notices and dialogs
- [x] Unlimited-storage accounts; Google token only given to extension pages
- [x] Fewer permissions: no declared content scripts, no `downloads`, no web-accessible pages
- [x] Build: content script as its own IIFE bundle, no duplicate icons, coverage works, `typecheck` really checks
- [x] Screen recording moved to a visible recorder window (the worker-based picker failed instantly); `desktopCapture` permission dropped
- [x] Tab recordings at the tab's own size (were 800×600 with black bars)
- [x] Recording format choice: MP4 (default) or WebM; share picker opens immediately on Entire screen
- [x] 151 tests + `pnpm test:e2e` headless end-to-end run (incl. tab switching and closing the recorded tab)

### Phase 8.7 — Polish ✅ Complete
- [x] Copy image to the clipboard (editor, popup preview, Library)
- [x] Recording stays off screen: popup closes, recorder window minimizes; Pause/Resume/Stop on the toolbar icon and Alt+Shift+P / Alt+Shift+S (Option on Mac)
- [x] Redesigned popup that fits without scrolling
- [x] Help page: what each OS shows when recording, Mac permission, Ubuntu commands to remove the pop-ups (tested), with undo
- [x] 196 tests + 12 end-to-end scenarios

### Phase 9 — Release 🟡 In Progress
- [x] Privacy policy (`docs/privacy-policy.html`, for GitHub Pages)
- [x] Store listing text and data-usage answers ([STORE_LISTING.md](STORE_LISTING.md))
- [x] `pnpm package`: checked store zip without the dev `key`; version 1.0.0
- [x] Publishing guide ([PUBLISHING.md](PUBLISHING.md)) and GitHub Actions CI
- [x] User documentation: in-extension Help page
- [ ] Manual checks on a real Google account, plus one Windows and one Mac machine
- [ ] Developer account, store item, OAuth client for the store ID, consent screen in production
- [ ] Store screenshots (1280×800) and promo tile (440×280)
- [ ] Submit for review

## What's Working Now

| Feature | Status | Notes |
|---|---|---|
| Google OAuth login | ✅ | `drive.file` scope only; refresh + retry on expired token |
| Visible Tab capture | ✅ | `captureVisibleTab(windowId)`; popup → preview → save/edit |
| Select Area capture | ✅ | On-demand injection → overlay (Escape cancels) → crop → editor in shadow root |
| Editor | ✅ | One object-based editor for page modal and editor tab; 9 tools; inline text; strong blur; shortcuts |
| Upload to Drive | ✅ | Multipart ≤ 5 MB, resumable above |
| Tab recording | ✅ | Offscreen document, tab audio, optional mic, 10-minute limit, review before saving |
| Screen recording | ✅ | Recorder window opens Chrome's picker on Entire screen, then minimizes; pause/resume; shortcuts |
| Library | ✅ | Sign-in gate, search, tabs, sort, thumbnails, image/video preview, rename, download, trash |
| Copy image | ✅ | Editor, popup preview, Library |
| Help page | ✅ | Per-OS recording guide; Ubuntu pop-up removal commands |
| Sharing | ✅ | Share link, copy link, stop sharing, open in Drive |
| Test suite | ✅ | 196 tests + 12 headless end-to-end scenarios; GitHub Actions CI |

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
