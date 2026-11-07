# Tech Stack

## Core

| Layer | Choice | Why |
|---|---|---|
| Extension platform | Chrome Manifest V3 | Current standard; Manifest V2 extensions are being phased out |
| Frontend framework | React 19 | Component reuse across popup, dashboard, and editor UIs |
| Language | TypeScript ~6.0 | Type safety for Chrome API + Drive API payloads |
| Build tool | Vite 8.1 | Fast dev server + HMR, multi-entry extension builds |
| Styling | Global CSS (`index.css`) | Single stylesheet, dark theme, consistent across all UIs |
| Package manager | pnpm | Fast, disk-efficient, strict dependency resolution |
| Linting | oxlint | Fast Rust-based linter |

## Auth & Storage

| Layer | Choice | Why |
|---|---|---|
| Auth | Google OAuth 2.0 via Chrome Identity API | Native Chrome integration, no raw OAuth redirect handling |
| Remote storage | Google Drive API v3 | Core product principle — no Pramana-owned cloud |
| Extension state | Chrome Storage API (`local`) | Auth tokens, user info, storage quota cache, editor pending data |
| UI state management | React `useState` + local variables | Lightweight, no external state library needed |

## Capture

| Layer | Choice | Why |
|---|---|---|
| Visible Tab capture | `chrome.tabs.captureVisibleTab(windowId)` | Instant, no picker |
| Area selection | `chrome.scripting.executeScript` on demand + `chrome.tabs.sendMessage` | No content script on every page; injected only when the user clicks Select Area |
| Area crop | Canvas `drawImage` scaled by `image width / viewport width` | Matches the capture's real resolution on HiDPI screens |
| Tab recording | `chrome.tabCapture.getMediaStreamId` (background) → `getUserMedia` in an offscreen document, exact tab size up to 1920×1080 | Keeps recording after the popup closes; no black bars |
| Screen recording | `getDisplayMedia()` in a small visible recorder window | The share picker needs a page to open from, and its stream only works in that page |
| Audio | Web Audio mix of tab/screen audio and the microphone | One audio track; tab audio routed back to the speakers |
| Encoder | `MediaRecorder`: MP4 (H.264 + AAC/Opus) by default, WebM (VP9/Opus) on request; falls back to WebM | Native, no dependencies; MP4 has a real duration and plays almost everywhere |
| Hand-off | IndexedDB | Finished recording passes from offscreen document to the Library |

## Editing

| Layer | Choice | Why |
|---|---|---|
| Editor | One vanilla Canvas + DOM module (`src/shared/editor/`) | Same editor in the page modal and the editor tab |
| Isolation on web pages | Shadow root + injected CSS | Page styles and shortcuts can't interfere |
| Rendering | Immutable element array, re-rendered per change | Select/move/delete after placement; history stores arrays directly |
| Text | Inline `<input>` over the canvas | No `prompt()` |
| Blur | Pixelation with blocks ≥ ¼ of the region's short side (min 16 px) | Text becomes unreadable |
| Canvas fitting | Full-resolution canvas scaled with `ResizeObserver` | Sharp output, fits any window |

## File Management

| Layer | Choice | Why |
|---|---|---|
| Drive access | `src/shared/drive.ts` client used by background and pages | One implementation of auth retry, pagination and uploads |
| Large files | Pages fetch/upload directly with a token from the background | Avoids the ~64 MB runtime message limit |
| Uploads | Multipart ≤ 5 MB, resumable (8 MB chunks) above | Reliable for recordings |
| Preview | `fetch` → Blob → object URL | Works for images and video |
| Thumbnails | Drive `thumbnailLink`, full image as fallback; `IntersectionObserver` | Small downloads, only for visible cards |
| Download | Object URL + `<a download>` | No `downloads` permission needed |
| Delete | Drive trash (`PATCH trashed: true`) | Restorable |
| Sharing | Drive `anyone` reader permission + `webViewLink` | Share with one click, revoke with one click |

## Testing

| Layer | Choice | Why |
|---|---|---|
| Test runner | Vitest 4.1 | Fast, Vite-native, Jest-compatible API |
| DOM environment | jsdom | Simulates browser APIs for unit/integration tests |
| Component testing | @testing-library/react | React component rendering and interaction testing |
| User interaction | @testing-library/user-event | Simulates user clicks, typing, keyboard shortcuts |
| Test setup | `src/__test__/setup.ts` | Global Chrome API mocks, IntersectionObserver mock, jsdom environment config |
| Pure functions | `src/shared/utils.ts` | Extracted for testability: formatBytes, hexToRgba, rgbToHex, distToSegment |

### Test Commands

```bash
pnpm test           # Run all tests once
pnpm test:watch     # Run tests in watch mode
pnpm test:ui        # Open Vitest UI
pnpm test:coverage  # Run with V8 coverage report
```

## Build & Output

Two Vite builds: `vite.config.ts` (pages + background, ES modules) and `vite.content.config.ts` (content script as one IIFE, since content scripts can't import modules).

```
dist/
├── manifest.json        # Generated with OAuth client ID + key field
├── background.js        # Service worker (ES module)
├── content.js           # Content script incl. the shared editor (IIFE)
├── icons/
└── src/
    ├── popup/  editor/  dashboard/  offscreen/   # index.html + page bundle
    └── shared/          # Shared chunks (React, Drive client, ...) and CSS
```

## Decision Log

| Decision | Status | Notes |
|---|---|---|
| Tailwind CSS → Global CSS | **Changed** | Tailwind removed; single `index.css` with dark theme |
| Fabric.js/Konva.js → Vanilla Canvas | **Decided** | No external drawing library; object-based rendering with vanilla API |
| npm → pnpm | **Changed** | pnpm for faster installs and strict deps |
| Content script bundling | **Changed** | Separate IIFE build so the content script can import the shared editor (previously it inlined a second copy) |
| Editor contexts | **Changed** | One shared object-based editor for the page modal and the editor tab |
| Blob vs Base64 for messaging | **Decided** | Base64 strings for all file data through `chrome.runtime.sendMessage` (Blobs can't be serialized) |
| DPR crop method | **Decided** | Uses `img.naturalWidth / window.innerWidth` instead of `window.devicePixelRatio` to match actual capture resolution |
| File preview method | **Changed** | Pages fetch Blobs directly with a token from the background (object URLs; works for video) |
| File download method | **Changed** | Object URL + `<a download>`; `downloads` permission dropped |
| Pure function extraction | **Decided** | formatBytes, hexToRgba, rgbToHex, distToSegment extracted to shared/utils for unit testing |
| Test framework | **Decided** | Vitest + @testing-library/react for unit/integration/component tests |
| Chrome API mocking | **Decided** | Global mocks in setup.ts; no actual Chrome APIs called in tests |
| Full screen capture | **Decided** | `captureVisibleTab` via background (not `getDisplayMedia`) — no picker dialog, instant capture |
| Area injection | **Decided** | `chrome.scripting.executeScript` + promise-based `chrome.tabs.sendMessage` (MV3 compliant) |
| Overlay canvas | **Decided** | `pointer-events: none` + `transform: translate(-50%, -50%)` to center over main canvas |
| Error boundaries | **Decided** | `ErrorBoundary` component wraps all React apps for crash-safe UIs |
| Lazy thumbnails | **Decided** | `IntersectionObserver` with 200px rootMargin for dashboard file grid thumbnails |
| Removed Zustand | **Changed** | Zustand store removed; all state managed via React `useState` + local variables |
| Recording host | **Decided** | Tab: offscreen document (`USER_MEDIA`). Screen: visible recorder window, because `chooseDesktopMedia` from the worker has no window and fails at once |
| Content script delivery | **Decided** | Injected on demand only; no manifest `content_scripts`, no `<all_urls>` |
| Delete behaviour | **Decided** | Move to Drive trash instead of permanent delete |
| E2E testing | **Decided** | Own CDP runner (`e2e/run.mjs`) against headless Chromium with a fake Drive; no extra dependencies |
