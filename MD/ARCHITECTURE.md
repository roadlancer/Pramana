# Architecture

## Overview

Pramana is a Chrome Extension (Manifest V3) with no backend server. All persistent storage lives in the user's own Google Drive; all processing (capture, editing) happens client-side in the browser.

## Core Principle: User-Owned Storage

Pramana authenticates via the user's Google account and only ever reads/writes inside a single managed folder:

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

| Context | Role in Pramana | Lifecycle |
|---|---|---|
| **Background (service worker)** | Auth/token handling, Drive API calls, capture coordination (`captureVisibleTab` via `windowId`), opening editor tabs, file download | Can be killed/restarted by Chrome at any time |
| **Content script** | Area-selection overlay + inline editor modal, injected into active page via `executeScript` (world: 'ISOLATED') on each capture; `sendResponse({ success: true })` + `return true` for MV3 async responses | Runs per-tab, isolated from page JS; re-injected on each capture |
| **Popup** | Toolbar UI — capture/record actions (Full Screen + Select Area only), preview with save/edit option | Destroyed when closed |
| **Editor (extension page)** | Full-page screenshot editor (opened in new tab from popup) | Full page context |
| **Dashboard (extension page)** | File library — browsing, searching, previewing, downloading, managing captures | Full page context, longer-lived |

## File Structure

```
src/
├── background/
│   ├── index.ts          # Message router (14 message types)
│   ├── auth.ts           # Google OAuth, token management, user info
│   ├── capture.ts        # handleCapture (resolves windowId via chrome.tabs.get, calls captureVisibleTab(windowId)); handleCaptureArea
│   └── storage.ts        # Google Drive upload/list/delete/fetch
├── content/
│   └── index.ts          # Area selection overlay + inline editor (self-contained, inlines distToSegment)
├── popup/
│   └── App.tsx           # Popup UI with capture/record/preview
├── editor/
│   └── App.tsx           # Full-page editor (uses shared editor module)
├── dashboard/
│   └── App.tsx           # File library with folder tabs, preview, download
├── shared/
│   ├── utils.ts          # Pure utility functions (formatBytes, blobToBase64, distToSegment, hexToRgba, rgbToHex)
│   ├── store.ts          # Zustand global state (defined, not yet wired)
│   └── editor/           # Reusable canvas editor module
│       ├── types.ts      # Tool types, colors, emoji list
│       ├── canvas.ts     # Canvas manager with undo/redo, overlay with pointer-events:none + centered transform
│       ├── tools.ts      # 7 tool implementations (uses hexToRgba from shared/utils)
│       ├── ui.ts         # Toolbar UI (vanilla DOM, uses rgbToHex from shared/utils)
│       └── index.ts      # Public API: createEditor()
├── __test__/
│   └── setup.ts          # Global test setup + Chrome API mocks
└── __mocks__/
    └── chrome.ts         # Chrome API mock utilities (placeholder)
```

## Data Flow

### Screenshot Capture (Full Screen)

```
User clicks "Full Screen" in Popup
        ↓
Popup sends CAPTURE_SCREENSHOT to background with tabId
        ↓
Background resolves windowId via chrome.tabs.get(tabId)
        ↓
Background calls captureVisibleTab(windowId) — instant, no picker dialog
        ↓
Image captured → returned as dataUrl to Popup
        ↓
User clicks "Save to Drive" → uploads directly
   or clicks "Edit" → opens Editor page in new tab
        ↓
Editor: user annotates with tools
        ↓
Save to Drive → base64 → background → Drive API
```

### Screenshot Capture (Select Area)

```
User clicks "Select Area" in Popup
        ↓
Popup injects content.js into active tab via chrome.scripting.executeScript (world: 'ISOLATED')
        ↓
Popup sends CAPTURE_AREA_SELECT message to content script (promise-based chrome.tabs.sendMessage)
        ↓
Content script receives message → sendResponse({ success: true }) → return true (MV3 async)
        ↓
Content script creates dark overlay + crosshair cursor
        ↓
User drags to select region
        ↓
On mouseup: cleanupOverlay() → removes from DOM → forced reflow → setTimeout(200) → ensures repaint
        ↓
Background captures full tab via captureVisibleTab(windowId)
        ↓
Content script crops to selected region (DPR-aware via img.naturalWidth / window.innerWidth)
        ↓
Inline editor modal opens on the same page
        ↓
User annotates with tools (object-based, select/move/delete)
        ↓
Save to Drive → base64 → background → Drive API
```

### Screen Recording

```
User clicks "Start Recording" in Popup
        ↓
Popup calls getDisplayMedia (screen + audio)
        ↓
MediaRecorder captures video/webm
        ↓
On stop: blob → base64 → background → Drive API
        ↓
Recording saved to Pramana/Recordings/
```

### File Preview & Download (Dashboard)

```
User clicks file card in Dashboard
        ↓
Dashboard sends FETCH_FILE_DATA to background
        ↓
Background fetches file via Drive API (with auth headers) → returns base64
        ↓
Dashboard displays base64 data URL in preview modal
        ↓
User clicks Download → DOWNLOAD_FILE message
        ↓
Background fetches file → converts to blob → chrome.downloads.download
```

## Editor Architecture

### Object-Based Rendering

The editor uses an **object-based** approach instead of direct pixel drawing. Each annotation is stored as a data object:

```typescript
type EditorElement = {
  id: number;
  type: 'highlight' | 'rectangle' | 'arrow' | 'text' | 'emoji' | 'draw' | 'blur';
  color?: string;
  lineWidth?: number;
  x?: number; y?: number;
  width?: number; height?: number;
  x1?: number; y1?: number; x2?: number; y2?: number;
  points?: { x: number; y: number }[];
  text?: string;
  emoji?: string;
  fontSize?: number;
  pixelSize?: number;
  opacity?: number;
};
```

**Rendering pipeline:**
1. Draw base screenshot image
2. Iterate through `elements[]` array, rendering each
3. If an element is selected, draw selection handles (dashed blue border)

**Benefits:**
- Elements can be selected, moved, and deleted after placement
- Undo/redo works on the element array (JSON serialize/deserialize)
- Canvas re-renders cleanly from objects on every frame

### Tools

| Tool | Behavior |
|------|----------|
| `select` | Click to select element, drag to move, Delete/Backspace to remove |
| `highlight` | Semi-transparent colored rectangle overlay |
| `draw` | Freehand pencil strokes |
| `text` | Click to place, prompt for text input |
| `arrow` | Drag from→to, draws arrowhead line |
| `rectangle` | Drag to draw outlined rectangle |
| `blur` | Drag rectangle → pixelates that region |
| `emoji` | Click to place fire emoji (extensible) |
| `eraser` | Click on any element to delete it |

### Two Editor Contexts

| Context | Location | Module | Use Case |
|---------|----------|--------|----------|
| **Inline modal** | Content script (on page) | Self-contained in `content/index.ts` (inlined `distToSegment`, no ES module imports) | After Select Area capture |
| **Full-page editor** | `src/editor/App.tsx` | Uses `src/shared/editor/` | After Full Screen capture (via popup "Edit" button) |

The content script editor is fully self-contained — it inlines all necessary pure functions directly. Content scripts cannot use ES module `import` statements (Chrome injects them as classic scripts), so `distToSegment` is duplicated into the content script.

### Editor Canvas Fitting

The shared editor canvas uses CSS constraints to fit large screenshots without scrolling:

- Canvas: `max-width: 100%; max-height: 100%` — visually scales to fit container while keeping full resolution buffer
- Overlay canvas: same constraints + `pointer-events: none` (so mouse events pass through to main canvas) + `position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)` (centers over main canvas)
- Wrapper: `display: flex; align-items: center; justify-content: center; overflow: hidden` — centers canvas in available space

### Two Editor Contexts

| Context | Location | Module | Use Case |
|---------|----------|--------|----------|
| **Inline modal** | Content script (on page) | Self-contained in `content/index.ts` (inlined `distToSegment`, no ES module imports) | After Select Area capture |
| **Full-page editor** | `src/editor/App.tsx` | Uses `src/shared/editor/` | After Full Screen capture (via popup "Edit" button) |

## Key Implementation Details

### Pure Utility Functions (Shared)

Pure functions extracted into `src/shared/utils.ts` for testability:

```typescript
formatBytes(bytes: number): string        // Human-readable file sizes
blobToBase64(blob: Blob): Promise<string> // Blob → base64 for messaging
distToSegment(p, a, b): number            // Point-to-line-segment distance (geometry)
hexToRgba(hex, alpha): string             // Hex color → rgba string
rgbToHex(rgb): string                     // CSS rgb() → hex color
```

### DPR-Aware Area Crop

`captureVisibleTab` returns an image at actual screen resolution (may differ from CSS pixel dimensions on HiDPI/Retina displays). The crop uses the image's own DPR to compute correct coordinates:

```typescript
const imgDpr = img.naturalWidth / window.innerWidth;
canvas.width = area.width * imgDpr;
canvas.height = area.height * imgDpr;
ctx.drawImage(img, area.x * imgDpr, area.y * imgDpr, ...);
```

This prevents black regions in captured screenshots when screen DPR ≠ 1.

### Blob-to-Base64 Conversion

Chrome's `chrome.runtime.sendMessage` cannot serialize Blob objects. All file data is converted to base64 strings before sending:

```typescript
// Popup/Content → Background
{ type: 'UPLOAD_FILE', payload: { fileBase64: string, metadata: { name, type } } }

// Background reconstructs Blob
const byteCharacters = atob(fileBase64);
const byteArray = new Uint8Array(byteCharacters.length);
// ... → new Blob([byteArray], { type: mimeType })
```

### Token Refresh

`getStoredToken()` in `auth.ts` first tries `chrome.identity.getAuthToken({ interactive: false })` for automatic refresh, falling back to the stored token. This prevents stale-token upload failures.

### Content Script Timing

After removing the overlay before capture, forced reflow + setTimeout ensures the browser has re-rendered:

```
cleanupOverlay() → removes from DOM
void document.body.offsetHeight → forced reflow
setTimeout(200) → allows browser to complete repaint
sendMessage → background calls captureVisibleTab (clean screenshot)
```

### Content Script Message Response

Content script listeners must call `sendResponse()` and return `true` for async responses. Without this, `chrome.runtime.lastError` is set to "The message port closed before a response was received" even when the message was successfully handled:

```typescript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CAPTURE_AREA_SELECT') {
    createOverlay();
    sendResponse({ success: true });
  }
  return true; // Critical: keeps message port open for MV3 async
});
```

### Overlay Capture Timing

After removing the overlay before capture, forced reflow + setTimeout ensures the browser has re-rendered:

```
cleanupOverlay() → removes existing overlay from DOM
void document.body.offsetHeight → forced reflow
setTimeout(200) → allows browser to complete repaint
sendMessage → background calls captureVisibleTab (clean screenshot)
```

### Overlay Persistence Fix

`createOverlay()` removes existing `#pramana-area-overlay` before creating a new one. `closeEditorModal()` also cleans up lingering overlays to prevent duplicates after repeated captures.

### Authorized File Preview

Dashboard image preview uses base64 data URLs fetched through the background (Drive API requires auth headers, can't use direct URLs in `<img>` tags):

```
Dashboard → FETCH_FILE_DATA (fileId) → Background → Drive API (?alt=media) → base64 → Dashboard
```

## Error Handling

| Scenario | Handling |
|---|---|
| Upload failure | Error toast, user can retry |
| Token expired | Chrome Identity API silent refresh; fallback to stored token |
| Drive storage low | Warning toast, uploads continue |
| Drive storage full | Error toast, capture still works |
| Extension reloaded | Content script shows "Please refresh the page" notification; popup falls back to `executeScript` injection |
| Chrome:// page capture | Blocked with error message |
| Area capture DPR mismatch | Uses `img.naturalWidth / window.innerWidth` to compute actual DPR |
| Editor canvas overflow | Canvas CSS max-width/max-height constrains visual size; overlay canvas `pointer-events:none` allows tool interaction; overlay centered via `transform: translate(-50%, -50%)` |
| Overlay blocking tools | Overlay canvas `pointer-events: none` prevents event interception by absolute-positioned overlay |

## State Management

| State | Storage | Purpose |
|---|---|---|
| UI state (active tool, selection) | Local variables in editor | Fast reads/writes |
| Auth token | `chrome.storage.local` | Persisted across sessions |
| User info (email, name) | `chrome.storage.local` | Displayed in popup |
| Storage quota | `chrome.storage.local` | Cached Drive usage info |
| Editor pending image | `chrome.storage.local` | Pass image data between popup and editor tab |
| Editor elements | In-memory array | Undo/redo stack, re-rendered on each frame |

## Testing Architecture

| Type | Framework | Target |
|---|---|---|
| Unit tests | Vitest | Pure utility functions (`formatBytes`, `hexToRgba`, `distToSegment`, etc.) |
| Integration tests | Vitest | Background handlers (auth, capture, storage, message router) |
| Component tests | @testing-library/react | React UI components (Dashboard) |
| E2E tests | Playwright (manual) | Full extension flows in Chrome |

Chrome APIs are mocked globally in `src/__test__/setup.ts` for all tests.

## Why Manifest V3

Manifest V2 extensions are being phased out by Chrome; V3 is the current and only forward-compatible option. Key constraint: the background service worker can be killed/restarted at any time — no long-lived in-memory state there.

## Why Google Drive as the Only Backend

- No server to build, host, or secure
- No storage cost to Pramana — the product can stay free indefinitely
- Privacy is structural, not just policy: Pramana architecturally cannot see files outside its own folder
- Files remain usable/portable even if the extension is uninstalled
