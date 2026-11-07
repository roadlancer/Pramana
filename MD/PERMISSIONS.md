# Permissions & Privacy Justification

> Needed for the Chrome Web Store review process. Also an internal check that no permission is requested without a clear reason.

## Chrome Extension Permissions

| Permission | Why it's needed | Scope discipline |
|---|---|---|
| `identity` | Google OAuth login via Chrome Identity API | Only used to obtain a `drive.file` token |
| `activeTab` | Capture the visible tab (`captureVisibleTab`) and inject the area-selection script into the tab the user is on | Granted only when the user opens the Pramana popup on that tab |
| `scripting` | Inject the area-selection script with `chrome.scripting.executeScript` | Only on the Select Area click; no content script is declared in the manifest |
| `tabCapture` | Record the current tab | Only on the Record Tab click |
| `offscreen` | Keep a tab recording running after the popup closes | Document exists only while recording |
| `storage` | Auth state, the screenshot waiting in the editor, recording state, the mic and format preferences | No browsing data is stored |

Host permission: `https://www.googleapis.com/*` only, to call the Drive API.

Screen recording uses the standard web share picker (`getDisplayMedia`) in a Pramana window and needs no extension permission.

**Explicitly not requested:** `desktopCapture`, `<all_urls>` or any broad host access, declared content scripts on every page, `downloads` (downloads use a normal link from the Library page), history, tabs content reading.

## Google OAuth Scope

| Scope | Why |
|---|---|
| `https://www.googleapis.com/auth/drive.file` | Access **only** to files and folders Pramana itself created. Structurally prevents browsing the user's Drive |

**Explicitly not requested:** `drive.readonly` or full `drive`.

## Chrome Web Store Permission Justification

> Use this text in the Chrome Web Store submission form.

- **`identity`**: Signs the user in with Google so Pramana can save captures to the user's own Google Drive.
- **`activeTab`**: When the user opens Pramana on a tab and clicks a capture button, Pramana takes a screenshot of that tab or shows the area-selection overlay on it.
- **`scripting`**: Injects the area-selection overlay and editor into the current tab when the user clicks Select Area. Nothing is injected otherwise.
- **`tabCapture`**: Records the current tab when the user clicks Record Tab.
- **`offscreen`**: Runs the tab recorder in a hidden extension document so a recording continues after the popup closes.
- **`storage`**: Keeps sign-in state, a screenshot that is open in the editor, the in-progress recording state, and the microphone and video-format preferences.

## Microphone

Only requested when the user turns on "Include microphone". Chrome asks once on a Pramana page; the recorder then mixes the mic into recordings. If access is blocked, recordings continue without voice and the user is told.

## Sharing

"Share link" makes a single file viewable by anyone with its link (Drive `anyone` reader permission). It is off by default, shown with a "Shared" badge, and can be turned off with "Stop sharing".

## Data Handling Summary

- No data leaves the user's browser and their own Google Drive; there is no Pramana server
- No analytics or telemetry
- No data is shared with third parties
- Deleting a file moves it to the user's Drive trash, where it can be restored
- Uninstalling the extension does not delete the user's Drive files
- The Google token is only handed to Pramana's own extension pages, never to scripts running in web pages
- Test suite uses mocked Chrome APIs and a fake Drive, with no real auth or Drive calls
