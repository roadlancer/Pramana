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

# dev build (loads unpacked into Chrome)
pnpm dev

# production build
pnpm build

# run tests
pnpm test

# run tests in watch mode
pnpm test:watch

# run tests with coverage
pnpm test:coverage
```

Then in Chrome: `chrome://extensions` → enable Developer Mode → **Load unpacked** → select the `dist/` folder.

**Note:** After reloading the extension, you must **refresh the page** you want to capture for the content script to re-inject. Only two capture buttons: **Full Screen** and **Select Area**.

---

## Project Status

**Active development — core features working, test suite in place.**

| Feature | Status |
|---|---|
| Google OAuth login | Working |
| Full Screen capture (via captureVisibleTab, no picker) | Working |
| Select Area capture (scripting.executeScript + sendResponse) | Working |
| DPR-aware area crop (no black layer) | Working |
| Inline editor with tools (object-based, select/move/delete) | Working |
| Full-page editor with shared module | Working |
| Upload to Google Drive | Working |
| Drive folder/subfolder management | Working |
| Screen recording | Working |
| Dashboard / file library with folder tabs | Working |
| File preview (base64 via background auth) | Working |
| File download (via chrome.downloads) | Working |
| Test suite (59 tests, all passing) | Working |

See `ROADMAP.md` for detailed phase tracking.
