# Requirements

## Functional Requirements

### Screenshot Capture ✅
- Two capture buttons: **Visible Tab** (everything visible in the current tab) and **Select Area**
- Visible Tab uses `captureVisibleTab(windowId)`: instant, no picker
- Select Area injects the overlay on demand (`scripting.executeScript`); Escape cancels
- Crop uses the capture's own resolution (`image width / viewport width`), so HiDPI screens crop correctly
- Output format: **PNG**

### Screen Recording ✅
- **Record Tab** (that tab's video + audio at its own size, which keeps playing for the user; switching tabs keeps recording the original tab; closing it ends the recording) and **Record Screen** (screen/window/tab via Chrome's share picker in a small Pramana recorder window that must stay open)
- Optional microphone, mixed into the recording; permission is asked once on a visible page
- Runs in an offscreen document: keeps recording after the popup closes; toolbar badge shows REC; reopening the popup shows the timer
- Maximum duration: **10 minutes**; stops automatically when sharing ends
- Output format chosen in the popup: **MP4** (default; H.264 with AAC audio where Chrome can encode it, otherwise Opus) or **WebM** (VP9/Opus). If Chrome can't record MP4 it records WebM and says so. MP3 isn't offered: it is audio only, and Chrome has no MP3 encoder
- Finished recordings open in the Library to review, rename, save or discard

### Screenshot Editor ✅
- One object-based editor (`src/shared/editor/`) used in both places: the on-page modal (Select Area, rendered in a shadow root) and the editor tab (Visible Tab → Edit)
- 9 tools: Select, Highlight, Draw, Text, Arrow, Rectangle, Blur, Emoji, Eraser
- Annotations stay selectable, movable and deletable until saved
- Text is typed inline on the canvas
- Blur pixelates hard enough to make text unreadable
- 12 colors (also for text), brush and font size, 24 emoji
- Undo/redo (30 steps); keyboard shortcuts below
- The editor tab keeps the screenshot across a refresh

### Pramana Library (Dashboard) ✅
- Shows only files created by Pramana
- Sign-in prompt when signed out; error with Try again when loading fails
- Grid with lazy thumbnails (Drive thumbnails, full image as fallback)
- Search, folder tabs with counts, sort (newest, oldest, name, size)
- Preview for images and **video playback**
- Rename, download, **share link** (anyone with the link can view; copy link; stop sharing), open in Drive
- Delete moves the file to Drive's trash after an in-page confirmation
- Storage usage, including unlimited accounts

### Account & Storage ✅
- Google OAuth login (no separate Pramana account); expired tokens are refreshed and the request retried once
- `Pramana/` folder with Screenshots, Recordings and Other subfolders, created on first upload
- Uploads up to 5 MB are multipart; larger ones are resumable (8 MB chunks, progress shown)
- Listing follows Drive pagination

### Testing ✅
- 139 Vitest tests (unit, integration, component) and a headless end-to-end run of the built extension; see `TESTING.md`

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
| Crash Safety | Error boundaries prevent full UI crashes | ✅ |

## File Size Limits

| Type | Max Size | Upload Strategy |
|---|---|---|
| Screenshot (PNG) | ~10MB | Multipart up to 5 MB, resumable above |
| Recording (WebM) | ~500MB (10 min) | Resumable upload in 8 MB chunks |

## Keyboard Shortcuts

| Shortcut | Action | Context |
|---|---|---|
| `V` `H` `P` `T` `A` `R` `B` `E` `X` | Select, Highlight, Draw, Text, Arrow, Rectangle, Blur, Emoji, Eraser | Editor |
| `Ctrl+Z` | Undo | Editor |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo | Editor |
| `Ctrl+C` | Copy image (with annotations) | Editor |
| `Ctrl+S` | Save to Drive | Editor |
| `Delete` / `Backspace` | Delete selected annotation | Editor (Select tool) |
| `Escape` | Deselect; cancel text entry | Editor |
| `Escape` | Cancel area selection | Select Area overlay |
| `Enter` | Place text | Editor (Text tool) |

## MVP Scope Checklist

- [x] Google login
- [x] Google Drive connection
- [x] Storage quota monitoring
- [x] Screenshot capture (Visible Tab + Select Area)
- [x] DPR-aware area crop
- [x] Screen recording with audio
- [x] Screenshot editing with tools
- [x] Object-based select/move/delete
- [x] Pramana file library with folder tabs
- [x] File preview with base64 auth
- [x] File download from the Library
- [x] Upload and file management
- [x] Test suite (139 Vitest tests + headless end-to-end run)
- [x] Share link, rename, sort, video preview, trash instead of delete
- [x] Background (offscreen) recording, screen recording, microphone
- [x] Resumable uploads for large files
- [ ] Basic video trimming (post-MVP)
- [ ] Offline upload queue (post-MVP)

## Known Limitations

- No video trimming yet (FFmpeg WASM, post-MVP)
- No offline upload queue (an unsaved recording does stay in the Library until saved or discarded)
- WebM recordings have no duration in their header, so some players can't seek until fully loaded (MP4 recordings don't have this problem)
- Screen recording always shows Chrome's share picker (opened on Entire screen, one click) and, on Linux Wayland, Ubuntu's own share dialog. Browsers can't remember screen-share consent, and the OS dialog can't be skipped by an extension
- With MP4, the audio may be Opus rather than AAC (depends on the Chrome build); a few players (e.g. older QuickTime) can't play Opus-in-MP4
- Visible Tab captures the visible part of the page only (no full-page scrolling capture)
- Screen recording keeps a small Pramana window open while recording (it can be minimized; closing it discards the recording)
