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
| UI state management | Zustand 5.0 (defined, not yet wired) | Lightweight, no boilerplate |

## Capture

| Layer | Choice | Why |
|---|---|---|
| Full screen capture | `chrome.tabs.captureVisibleTab(windowId)` | Chrome Extension API, instant capture with no picker dialog; background resolves `windowId` via `chrome.tabs.get()` |
| Area selection | `chrome.scripting.executeScript` + `chrome.tabs.sendMessage` (promise-based) | MV3 requirement; content script drawn on page, background captures, content script crops |
| Area crop | DPR-aware canvas drawImage | Uses `img.naturalWidth / window.innerWidth` to avoid black regions |
| Screen recording | `getDisplayMedia()` + `MediaRecorder` | Native browser recording (VP9/WebM) |
| Audio capture | `getDisplayMedia()` with audio constraints | Echo cancellation + noise suppression |

## Editing

| Layer | Choice | Why |
|---|---|---|
| Image editor (inline) | Vanilla Canvas API + DOM | Self-contained in content script, inlines all pure functions (no ES module imports — Chrome injects content scripts as classic scripts) |
| Image editor (full-page) | Shared module (`src/shared/editor/`) | Reusable across editor page; creates own canvas in `CanvasManager` with `pointer-events: none` overlay |
| Rendering approach | Object-based (element array) | Supports select/move/delete after placement |
| Undo/Redo | JSON serialize/deserialize of element array | Simple, reliable, 30-step stack |
| Tool rendering | Direct Canvas 2D API | No external drawing library needed |
| SVG icons | innerHTML (not textContent) | Toolbar buttons render SVG icons properly |
| Canvas fitting | `max-width:100%; max-height:100%` + flex wrapper | Image scales to fit without scroll; overlay centered with `transform: translate(-50%, -50%)` |

## File Management

| Layer | Choice | Why |
|---|---|---|
| File preview | Base64 data URLs via background fetch | Drive API requires auth headers, can't use direct URLs in `<img>` |
| File download | `chrome.downloads.download` | Native Chrome download manager, shows in Downloads bar |
| File listing | Drive API query with subfolder iteration | Returns `folder` field for each file (Screenshots/Recordings/Other) |

## Testing

| Layer | Choice | Why |
|---|---|---|
| Test runner | Vitest 4.1 | Fast, Vite-native, Jest-compatible API |
| DOM environment | jsdom | Simulates browser APIs for unit/integration tests |
| Component testing | @testing-library/react | React component rendering and interaction testing |
| User interaction | @testing-library/user-event | Simulates user clicks, typing, keyboard shortcuts |
| Test setup | `src/__test__/setup.ts` | Global Chrome API mocks, jsdom environment config |
| Pure functions | `src/shared/utils.ts` | Extracted for testability: formatBytes, hexToRgba, rgbToHex, distToSegment |

### Test Commands

```bash
pnpm test           # Run all tests once
pnpm test:watch     # Run tests in watch mode
pnpm test:ui        # Open Vitest UI
pnpm test:coverage  # Run with V8 coverage report
```

## Build & Output

```
dist/
├── manifest.json           # Generated with OAuth client ID + key field
├── background.js           # Service worker (10 KB)
├── content.js              # Content script (18 KB)
├── icons/                  # Extension icons
└── src/
    ├── popup/
    │   ├── index.html
    │   └── popup.js        # Popup bundle (6 KB)
    ├── editor/
    │   ├── index.html
    │   └── editor.js       # Editor page bundle (20 KB)
    ├── dashboard/
    │   ├── index.html
    │   └── dashboard.js    # Dashboard bundle (4 KB)
    └── shared/
        ├── utils-*.js      # Shared utility functions (1 KB)
        ├── src-*.js        # Shared editor module (191 KB)
        └── *.css           # Global styles (11 KB)
```

## Decision Log

| Decision | Status | Notes |
|---|---|---|
| Tailwind CSS → Global CSS | **Changed** | Tailwind removed; single `index.css` with dark theme |
| Fabric.js/Konva.js → Vanilla Canvas | **Decided** | No external drawing library; object-based rendering with vanilla API |
| npm → pnpm | **Changed** | pnpm for faster installs and strict deps |
| Content script embedding | **Decided** | Content script inlines all pure functions (no ES module imports — Chrome injects content scripts as classic scripts) |
| Editor contexts | **Decided** | Two editors: inline modal (content script) and full-page (editor tab) |
| Blob vs Base64 for messaging | **Decided** | Base64 strings for all file data through `chrome.runtime.sendMessage` (Blobs can't be serialized) |
| DPR crop method | **Decided** | Uses `img.naturalWidth / window.innerWidth` instead of `window.devicePixelRatio` to match actual capture resolution |
| File preview method | **Decided** | Base64 data URLs fetched through background (Drive auth headers required) |
| File download method | **Decided** | `chrome.downloads.download` with blob URL (native Chrome download UI) |
| Pure function extraction | **Decided** | formatBytes, hexToRgba, rgbToHex, distToSegment extracted to shared/utils for unit testing |
| Test framework | **Decided** | Vitest + @testing-library/react for unit/integration/component tests |
| Chrome API mocking | **Decided** | Global mocks in setup.ts; no actual Chrome APIs called in tests |
| Full screen capture | **Decided** | `captureVisibleTab` via background (not `getDisplayMedia`) — no picker dialog, instant capture |
| Area injection | **Decided** | `chrome.scripting.executeScript` + promise-based `chrome.tabs.sendMessage` (MV3 compliant) |
| Overlay canvas | **Decided** | `pointer-events: none` + `transform: translate(-50%, -50%)` to center over main canvas |
