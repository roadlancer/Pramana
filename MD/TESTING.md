# Testing Strategy

## Commands

```bash
pnpm test            # Unit, integration and component tests (Vitest + jsdom)
pnpm test:watch
pnpm test:ui
pnpm test:coverage   # V8 coverage report
pnpm typecheck       # tsc -b (app + build configs)
pnpm lint            # oxlint
pnpm test:e2e        # Build, then drive the real extension in headless Chromium
```

## Layers

| Layer | Tooling | What it covers |
|---|---|---|
| Unit | Vitest | Pure logic: `utils`, editor `elements` (hit-testing, moving, blur sizing), Drive quota summary, recorder MIME choice |
| Integration | Vitest + mocked `chrome.*` and `fetch` | Background router, token refresh, uploads, recording lifecycle, Drive client (pagination, 401 retry, resumable upload, trash, share), offscreen recorder |
| Component | @testing-library/react | Popup, Library, editor page, shared editor (real DOM events) |
| End-to-end | `e2e/run.mjs` (Chrome DevTools Protocol, no extra dependencies) | The built `dist/` loaded into headless Chromium; real Chrome APIs; Google APIs answered by an in-memory fake Drive |

Global mocks for `chrome.*`, `IntersectionObserver` and the 2D canvas live in `src/__test__/setup.ts`.

## Test Files

```
src/
├── background/__tests__/   auth, capture, index (router), recording, storage
├── content/__tests__/      overlay Escape, single injection, crop scaling
├── dashboard/__tests__/    Ubuntu Help commands run against temp copies of the real files; Library: Help page, list, sign-in gate, retry, filters/sort, video, trash dialog, share, rename, recording review, mic page
├── editor/__tests__/       editor page (save/keep pending image, StrictMode), pendingEdits cleanup
├── offscreen/__tests__/    tab recorder: capture size, start/stop/limit/ended/mic mixing/failures
├── popup/__tests__/        storage meter, capture + save, recording start/stop/state, mic permission
├── recorder/__tests__/     screen recorder window: picker, share-step guide, cancel / blocked by system, stop, close warning, refused start
└── shared/
    ├── __tests__/          drive client, utils
    └── editor/__tests__/   createEditor behaviour, elements, constants
```

**Current: 196 tests in 20 files, all passing.**

## End-to-End Run

`pnpm test:e2e` copies `dist/` to `e2e/.artifacts/ext`, adds `<all_urls>` to that copy (headless Chrome can't click the toolbar icon, which is what grants `activeTab`), and launches Playwright's Chromium (`CHROME_PATH` overrides; branded Chrome ignores `--load-extension`). Screenshots and the uploaded files land in `e2e/.artifacts/shots`.

| Scenario | Verifies |
|---|---|
| Popup | Account, storage meter (3.2 GB / 15 GB, bar width), all controls |
| Visible Tab → Copy, Save | Real `captureVisibleTab`, Copy puts the screenshot on the real clipboard, upload reaches `Pramana/Screenshots`, no `alert()` |
| Visible Tab → Edit | Editor tab, 9 tools, single Save button, first drag draws, inline text (no `prompt()`), blur over an API key, select/move, undo, survives reload, Copy image (clipboard holds the full-size PNG), Ctrl+S upload, pending image cleared |
| Select Area | On-demand injection, Escape cancels, repeated injection opens one editor, crop size matches DPR, Copy image works on the web page, page CSS doesn't leak in, page doesn't receive editor keystrokes, save uploads |
| Record Tab | Offscreen document, popup closes itself on start, reopened popup shows timer, Pause/Resume (badge `❚❚`, timer frozen, paused seconds left out of the video), review in Library, video size matches the tab, saved as a real MP4 with a known duration, upload to `Recordings`, badge cleared |
| Record Screen | Popup closes itself, recorder window opens the share picker without a click (auto-selects the test tab) and minimizes once recording, badge and shortcut tooltip, Stop from the popup, recorded frame shows the page, window closes |
| Switch tabs while recording | Recording continues; frames after switching still show the recorded tab, not the new one |
| Close the recorded tab | Recording stops and what was captured opens for review; this one is recorded as WebM via the popup's Format menu |
| Library | Thumbnails, sort, preview, rename, share/unshare, download, trash via in-page dialog |
| Recorded video | Plays in preview |
| Help page | Recording guide, Mac permission, Ubuntu commands with undo |
| Signed out | Sign-in prompt instead of "No files" |
| Microphone page | `E2E_FAKE_MEDIA=1` only (fake devices disable tab capture) |

## Manual Checks Before Release

These need a real signed-in Chrome profile and Google account:

- [ ] Sign in with Google (consent screen) and sign out
- [ ] Record Screen: pick a window and a whole screen (headless only covers picking a tab); stop from Chrome's "Stop sharing" bar; try closing the recorder window mid-recording
- [ ] Record with microphone: first time opens the permission page; voice is in the recording
- [ ] Upload a recording over 5 MB (resumable path) and confirm it plays from Drive
- [ ] Shared link opens for a signed-out browser; Stop sharing revokes it
- [ ] Deleted file appears in Drive's trash and can be restored
- [ ] Select Area on a few complex sites (SPA, sites with strict CSP, pages with zoom)
- [ ] Capture on `chrome://` pages shows the error message

## CI Pipeline

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: cp .env.example .env && pnpm build
      - run: npx playwright install chromium && node e2e/run.mjs
```
