# Testing Strategy

> Checklist-style QA doc with current test status.

## Testing Frameworks

| Type | Framework | Purpose |
|---|---|---|
| Unit tests | **Vitest** | Fast, Vite-native, Jest-compatible API |
| Component tests | **@testing-library/react** | React component rendering and interaction |
| E2E tests | **Playwright** | Load unpacked extension, test popup/dashboard flows |
| CI/CD | **GitHub Actions** | Run tests on push/PR, lint check, build verification |

## Test Infrastructure

### Setup

```bash
pnpm test           # Run all tests once
pnpm test:watch     # Run tests in watch mode
pnpm test:ui        # Open Vitest UI
pnpm test:coverage  # Run with coverage report
```

### File Structure

```
src/
├── __test__/
│   └── setup.ts              # Global test setup + Chrome API mocks
├── __mocks__/
│   └── chrome.ts             # Chrome API mock utilities
├── shared/
│   ├── __tests__/
│   │   └── utils.test.ts     # Unit tests: formatBytes, distToSegment, hexToRgba, rgbToHex
│   └── utils.ts              # Pure utility functions (extracted for testability)
├── shared/editor/
│   └── __tests__/
│       └── types.test.ts     # Constants tests: DEFAULT_COLORS, EMOJI_LIST
├── background/
│   └── __tests__/
│       ├── auth.test.ts      # Integration: checkStorageQuota
│       ├── capture.test.ts   # Integration: handleCapture, handleCaptureArea
│       ├── storage.test.ts   # Integration: handleStorage routing, upload, delete
│       └── index.test.ts     # Integration: message router (all 14 types)
└── dashboard/
    └── __tests__/
        └── App.test.tsx      # Component: folder tabs, search, file display
```

### Chrome API Mocking

All Chrome APIs are mocked globally in `src/__test__/setup.ts`:
- `chrome.runtime.sendMessage/onMessage`
- `chrome.storage.local.get/set/remove`
- `chrome.identity.getAuthToken`
- `chrome.tabs.captureVisibleTab/create/query/sendMessage`
- `chrome.downloads.download`
- `chrome.scripting.executeScript`

## Test Results

### Unit Tests (Pure Functions) ✅

| Test | Cases | Status |
|------|-------|--------|
| `formatBytes()` | 7 | ✅ All pass |
| `distToSegment()` | 5 | ✅ All pass |
| `hexToRgba()` | 5 | ✅ All pass |
| `rgbToHex()` | 6 | ✅ All pass |
| `DEFAULT_COLORS` | 3 | ✅ All pass |
| `EMOJI_LIST` | 3 | ✅ All pass |

### Integration Tests (Background Handlers) ✅

| Test | Cases | Status |
|------|-------|--------|
| `checkStorageQuota()` | 5 | ✅ All pass |
| `handleCapture()` / `handleCaptureArea()` | 5 | ✅ All pass |
| `handleStorage()` routing | 5 | ✅ All pass |
| Message router | 7 | ✅ All pass |

### Component Tests (React) ✅

| Test | Cases | Status |
|------|-------|--------|
| Dashboard App | 6 | ✅ All pass |

**Total: 59 tests, all passing**

## CI Pipeline

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

## E2E Test Scenarios (Playwright — Manual)

> These scenarios should be run manually with Playwright or by a human tester using the unpacked extension.

### Auth Flow
- [ ] Click "Sign in with Google" → OAuth popup appears
- [ ] Complete OAuth → popup closes, user info displayed
- [ ] Click sign out → state cleared, sign-in button shown
- [ ] Reload extension → still signed in (token persisted)

### Screenshot Capture
- [ ] Click "Full Screen" → `captureVisibleTab(windowId)` fires instantly → capture shown in preview
- [ ] Click "Save to Drive" in preview → file uploaded to Pramana/Screenshots/
- [ ] Click "Edit" in preview → editor opens in new tab
- [ ] Click "Select Area" → overlay appears → drag to select → editor opens on same page

### Area Selection
- [ ] Content script injected via `chrome.scripting.executeScript` (world: 'ISOLATED')
- [ ] Overlay covers full page with semi-transparent dark background
- [ ] Crosshair cursor appears
- [ ] Drag to create selection rectangle (dashed border)
- [ ] Release: overlay removed, no black layer in captured image
- [ ] Editor modal opens with cropped region

### Editor
- [ ] All 9 tools selectable (highlight, draw, text, arrow, rectangle, blur, emoji, eraser, select)
- [ ] Select tool: click element to select, drag to move
- [ ] Delete/Backspace removes selected element
- [ ] Undo/Redo works across all tools
- [ ] Color picker changes active color
- [ ] Brush size slider works
- [ ] Font size slider works
- [ ] Save to Drive uploads edited screenshot

### Screen Recording
- [ ] Click "Start Recording" → screen picker appears
- [ ] Select screen → recording starts (button shows "Stop Recording")
- [ ] Click "Stop Recording" → recording saved to Pramana/Recordings/
- [ ] Stop sharing via browser UI → recording auto-stops and saves
- [ ] Microphone audio captured when enabled

### Dashboard / Library
- [ ] Opens in new tab with file grid
- [ ] Folder tabs (All/Screenshots/Recordings/Other) filter correctly
- [ ] File counts update when switching tabs
- [ ] Search filters files by name
- [ ] Click file card → preview modal opens
- [ ] Image files show preview (fetched via background auth)
- [ ] Download button triggers Chrome download
- [ ] Delete button shows confirmation, then removes file
- [ ] Storage usage displayed correctly

### Edge Cases
- [ ] Capture on chrome:// page → error message shown
- [ ] Extension reload → content script shows "Please refresh" message
- [ ] Upload with expired token → automatic refresh → upload succeeds
- [ ] Large recording (>100MB) → upload completes (single multipart)
- [ ] No files in library → empty state shown
- [ ] Overlay canvas pointer-events:none → tools receive mouse events correctly
- [ ] Overlay canvas centered via transform → tools draw at correct coordinates
- [ ] Repeated area captures → overlay persistence fix prevents duplicates

## Manual QA Checklist

- [ ] Extension loads without errors in chrome://extensions
- [ ] No console errors in popup, dashboard, or editor
- [ ] All captures produce correct output (no black layers, no overlays)
- [ ] Files appear in correct Drive subfolders
- [ ] Dashboard shows only Pramana files (privacy-critical)
- [ ] Extension works after browser restart
- [ ] Works on pages with various content types (static, dynamic, SPA)
