# Chrome Web Store Listing

> Text to paste into the Chrome Web Store developer console. Permission justifications are in [PERMISSIONS.md](PERMISSIONS.md).

## Store listing tab

**Name:** Pramana

**Summary** (132 characters max):

> Screenshots and screen recordings saved to your own Google Drive. Annotate, blur, copy and share. Free and private: no servers.

**Category:** Productivity → Tools (or Workflow & Planning)

**Language:** English

**Description:**

```
Capture, annotate and share, and keep everything in your own Google Drive.

SCREENSHOTS
• Visible Tab: capture everything you can see in one click
• Select Area: drag to capture just the part you need
• Editor: highlight, draw, arrows, boxes, text, emoji, and a strong blur for passwords and personal details. Undo, move and delete anything before saving
• Copy image: paste straight into Slack, email, docs or chat

SCREEN RECORDING
• Record Tab: starts instantly, keeps going if you switch tabs
• Record Screen: your whole screen or a single window
• Include your microphone, pause and resume, up to 10 minutes per recording
• Nothing of Pramana appears in your video: controls live on the toolbar icon, plus keyboard shortcuts
• MP4 by default, so recordings play everywhere

YOUR DRIVE, YOUR FILES
• Saved to a "Pramana" folder in your Google Drive
• Library: search, sort, preview, rename, download, delete
• Share link: anyone with the link can view; stop sharing any time

PRIVATE BY DESIGN
• No Pramana servers, no analytics, no ads
• Pramana can only see the files it created in your Drive (drive.file permission)
• Captures happen only when you click a Pramana button

Free. Made for bug reports, how-to guides, design feedback and quick explanations.
```

## Graphics

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 PNG | `public/icons/icon128.png` |
| Screenshots (1 to 5) | 1280×800 or 640×400 PNG/JPEG | To make: popup, editor with blur, Library, recording review, Help page |
| Small promo tile | 440×280 PNG/JPEG | To make |

## Privacy practices tab

**Single purpose:**

> Pramana captures screenshots and screen recordings of what the user chooses and saves them to the user's own Google Drive, with tools to annotate, organize and share them.

**Permission justifications:** copy from [PERMISSIONS.md](PERMISSIONS.md#chrome-web-store-permission-justification). Host permission `https://www.googleapis.com/*`: "Calls the Google Drive API to save, list and share the user's own captures."

**Remote code:** No, Pramana does not use remote code. All code is in the package.

**Data usage** (tick these, all others unticked):

| Data type | Collected? | Notes for the form |
|---|---|---|
| Personally identifiable information | Yes | Google account name and email, shown in the popup; stays in the browser |
| Authentication information | Yes | Google sign-in token, used only to call Google Drive |
| Website content | Yes | Screenshots and recordings the user makes, saved only to the user's Drive |

Certify all three: not sold to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness or lending.

**Privacy policy URL:** the published `docs/privacy-policy.html` (see [PUBLISHING.md](PUBLISHING.md), step 3).
