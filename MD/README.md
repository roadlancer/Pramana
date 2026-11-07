# Pramana (प्रमाण)

A free, privacy-first Chrome extension that unifies screenshot capture, screen recording, editing, storage, organization, and sharing — built entirely on top of the user's own Google Drive.

> **Capture anything on your screen, edit it, store it in your own Google Drive, organize it, and share it — all from one workspace.**

`Pramana = Capture + Edit + Storage + Organization + Sharing`

---

## Why Pramana

Most workflows today stitch together separate tools:

```
Screenshot Tool → Image Editor → Screen Recorder → Video Editor → Cloud Storage → Sharing Platform
```

Pramana replaces that chain with one continuous flow:

```
Capture → Edit → Store → Organize → Share
```

The core idea: instead of Pramana hosting your files on its own servers, it connects to **your own Google Drive** and manages a single `Pramana/` folder there. You own everything. Pramana never touches the rest of your Drive, and never needs to run (or pay for) its own storage infrastructure — which is what lets it stay free.

---

## Who it's for

Developers, designers, students, teachers, content creators, remote teams, customer support teams, product managers, and technical writers — anyone who regularly captures, annotates, and shares screen content.

---

## Documentation

| Doc | Covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, data flow, component breakdown |
| [REQUIREMENTS.md](./REQUIREMENTS.md) | Functional/non-functional requirements, MVP scope |
| [TECH_STACK.md](./TECH_STACK.md) | Every technology used, and why |
| [ROADMAP.md](./ROADMAP.md) | Phased build plan + future features |
| [API_REFERENCE.md](./API_REFERENCE.md) | Internal contracts: messaging, Drive API usage, metadata schema |
| [PERMISSIONS.md](./PERMISSIONS.md) | Chrome permissions + OAuth scopes, justified for store review |
| [TESTING.md](./TESTING.md) | Test infrastructure, QA checklist, E2E scenarios |

---

## Development Setup

```bash
# clone
git clone <repo-url>
cd Pramana

# install
pnpm install

# build into dist/ (load it unpacked in Chrome)
pnpm build

# Chrome Web Store package: release/pramana-<version>.zip (see MD/PUBLISHING.md)
pnpm package

# run tests
pnpm test

# run tests in watch mode
pnpm test:watch

# run tests with coverage
pnpm test:coverage
```

Then in Chrome: `chrome://extensions` → enable Developer Mode → **Load unpacked** → select the `dist/` folder.

Copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID` before building; `scripts/generate-manifest.js` writes it into `dist/manifest.json`.

---

## Project Status

**MVP feature-complete; next step is the Chrome Web Store release (Phase 9).**

| Feature | Status |
|---|---|
| Google sign-in (`drive.file` scope only), token refresh after expiry | Working |
| Visible Tab capture → preview → save or edit | Working |
| Select Area capture (on-demand injection, Escape to cancel) | Working |
| One object-based editor for both the page modal and the editor tab: 9 tools incl. Select, inline text, strong blur, undo/redo, shortcuts | Working |
| Editor keeps the screenshot across a refresh | Working |
| Tab recording in an offscreen document (keeps going after the popup closes and when you switch tabs), tab audio, optional microphone, 10-minute limit, recorded at the tab's own size | Working |
| Screen/window/tab recording: Chrome's share picker opens straight away on Entire screen | Working |
| Recording format: MP4 (default) or WebM, chosen in the popup | Working |
| Recording review in the Library before saving; resumable upload with progress | Working |
| Library: thumbnails, search, folder tabs, sort, image/video preview, rename, download, move to Drive trash | Working |
| Share link (anyone with the link), copy link, stop sharing, open in Drive | Working |
| Sign-in prompt and error/retry states in the Library; unlimited-storage accounts | Working |
| Tests: 162 unit/integration/component tests + headless end-to-end run of the built extension | Working |

See `ROADMAP.md` for phase tracking and `TESTING.md` for how to run the tests.
