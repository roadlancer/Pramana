# Permissions & Privacy Justification

> Needed for the Chrome Web Store review process. Also useful as an internal check that no permission is requested without a clear reason.

## Chrome Extension Permissions

| Permission | Why it's needed | Scope discipline |
|---|---|---|
| `identity` | Google OAuth login via Chrome Identity API | Only used to obtain a Drive-scoped token |
| `tabCapture` | Capture the active browser tab via `captureVisibleTab(windowId)` | Only triggered by explicit user action (Full Screen button) |
| `desktopCapture` | Capture full screen / application window | Only triggered by explicit user action |
| `storage` | Chrome Storage API for settings, auth tokens, editor state | No sensitive data stored beyond non-secret preferences |
| `activeTab` | Inject the area-selection overlay content script | Limited to the tab the user is actively interacting with |
| `scripting` | Programmatically inject content script via `chrome.scripting.executeScript` (MV3 requirement) | Only injected on explicit capture request (Select Area button) |
| `downloads` | Save files to user's local Downloads folder | Only triggered by explicit user download action |

**Explicitly not requested:** `<all_urls>` host permissions for content reading, background page access to browsing history, or any permission that would allow reading page content unrelated to the capture overlay.

## Google OAuth Scope

| Scope | Why |
|---|---|
| `https://www.googleapis.com/auth/drive.file` | Grants access **only** to files/folders the app itself creates or that the user explicitly opens with Pramana — structurally prevents browsing the user's full Drive |

**Explicitly not requested:** `drive.readonly` or full `drive` scope — would allow listing/reading the entire Drive, unnecessary and against the core privacy principle.

## Chrome Web Store Permission Justification

> Use this text in the Chrome Web Store submission form.

**Why does the extension need each permission?**

- **`identity`**: Required for Google OAuth 2.0 login. Pramana uses the user's own Google Drive for storage — this permission enables the Chrome Identity API to authenticate without handling raw OAuth redirects.

- **`tabCapture`**: Required to capture the active browser tab as a screenshot via `captureVisibleTab(windowId)`. Only triggered when the user explicitly clicks the Full Screen capture button.

- **`desktopCapture`**: Required to capture the full screen or an application window. Only triggered when the user explicitly clicks the capture button.

- **`storage`**: Required to persist user preferences, auth tokens, and session state across browser restarts. Stores only non-sensitive settings and cached data.

- **`activeTab`**: Required to inject the area-selection overlay into the current tab when the user chooses area-select capture mode. Limited to the tab the user is actively interacting with.

- **`scripting`**: Required in Manifest V3 to programmatically inject the content script for area selection via `chrome.scripting.executeScript`. Only injected on explicit capture request, not persistently.

- **`downloads`**: Required to save files to the user's local Downloads folder when they click the Download button in the dashboard. Only triggered by explicit user action.

## Data Handling Summary

- No data leaves the user's browser + their own Google Drive — there is no Pramana server
- No analytics/telemetry collection — Chrome Web Store provides built-in metrics
- No data is shared with third parties
- Uninstalling the extension does not delete the user's Drive files
- OAuth token handled exclusively by Chrome Identity API — never logged or stored in plain text
- Content scripts only run when explicitly triggered by user action
- File preview uses base64 data URLs fetched through background (Drive API requires auth headers)
- Test suite uses mocked Chrome APIs — no real auth or Drive calls during testing
