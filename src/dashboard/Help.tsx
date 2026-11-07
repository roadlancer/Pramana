import { useEffect, useState } from 'react';
import { detectOS, shortcutLabels } from '../shared/platform';
import type { OS } from '../shared/platform';
import { UBUNTU_COMMANDS } from './ubuntuCommands';


function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the command can still be selected by hand
    }
  };
  return (
    <div className="help-command">
      <code>{text}</code>
      <button className="btn-ghost" onClick={copy}>
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}

const OS_NAMES: Record<OS, string> = { mac: 'Mac', windows: 'Windows', linux: 'Linux', chromeos: 'ChromeOS', other: 'your computer' };

export function Help() {
  const os = detectOS();
  const keys = shortcutLabels(os);

  // ?help=ubuntu (from the recorder window) jumps straight to the Ubuntu section
  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get('help');
    if (section) document.getElementById(`help-${section}`)?.scrollIntoView();
  }, []);

  return (
    <div className="dashboard-container help-page">
      <header className="dashboard-header">
        <h1>Pramana Help</h1>
        <a className="btn-ghost" href="?">
          ← Library
        </a>
      </header>

      <section className="help-section">
        <h2>Recording your screen</h2>
        <p>
          <strong>Record Tab</strong> starts straight away with no pop-ups. <strong>Record Screen</strong> needs your permission each time:
          Chrome shows <em>Choose what to share</em> with <strong>Entire screen</strong> already selected, so you click{' '}
          <strong>Share</strong>. Chrome requires this for every extension, so websites and extensions can't watch your screen without
          you knowing.
        </p>
        <table className="help-table">
          <thead>
            <tr>
              <th />
              <th>Windows</th>
              <th>Mac</th>
              <th>Ubuntu</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Chrome's picker</td>
              <td>Click Share</td>
              <td>Click Share</td>
              <td>Click Share</td>
            </tr>
            <tr>
              <td>System permission</td>
              <td>None</td>
              <td>Once: allow Chrome to record the screen</td>
              <td>Ubuntu's Share Screen window, each time (can be removed, below)</td>
            </tr>
            <tr>
              <td>Computer sound</td>
              <td>Tick “Share system audio” in the picker</td>
              <td>Only from a tab: use Record Tab</td>
              <td>Only from a tab: use Record Tab</td>
            </tr>
          </tbody>
        </table>
        <p>
          While recording, the controls are on the Pramana icon in Chrome's toolbar ({keys.pause} pauses or resumes, {keys.stop}{' '}
          stops), so nothing of Pramana appears in your video. Chrome's own “sharing your screen” bar does: click <strong>Hide</strong>{' '}
          on it after you start.
        </p>
        {os !== 'other' && <p className="help-note">You are using {OS_NAMES[os]}.</p>}
      </section>

      <section className="help-section" id="help-mac">
        <h2>Mac: allow screen recording</h2>
        <p>
          If recording your screen fails with “did not allow screen sharing”, open <strong>System Settings → Privacy &amp; Security → Screen
          Recording</strong> (called “Screen &amp; System Audio Recording” on newer macOS), turn on <strong>Google Chrome</strong>, then quit
          and reopen Chrome. You only do this once.
        </p>
      </section>

      <section className="help-section" id="help-ubuntu">
        <h2>Ubuntu: remove the screen-sharing pop-ups</h2>
        <p>
          Optional, for your own computer. Open a terminal (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd>), paste a command and press Enter.
          Each step works on its own; do one or both. For Google Chrome installed from google.com on Ubuntu 22.04 or later.
        </p>

        <h3>1. Remove Ubuntu's “Share Screen” window</h3>
        <p>Switches your login to Xorg, which doesn't ask before apps see the screen. Asks for your password.</p>
        <Command text={UBUNTU_COMMANDS.xorg} />
        <p>
          Restart your computer. To check, this should print <code>x11</code>:
        </p>
        <Command text={UBUNTU_COMMANDS.xorgCheck} />
        <p className="help-note">
          Without a command: at the login screen click your name, then the ⚙️ at the bottom right, and choose “Ubuntu on Xorg”.
        </p>

        <h3>2. Remove Chrome's “Choose what to share” window</h3>
        <p className="help-warning">
          ⚠️ After this, <strong>any website</strong> that asks to share your screen gets your whole screen without asking, including
          video calls. Only do this on a computer you use for recording.
        </p>
        <Command text={UBUNTU_COMMANDS.chrome} />
        <p>Then close Chrome completely (this closes every Chrome window) and open it again from the dock or app menu:</p>
        <Command text={UBUNTU_COMMANDS.chromeRestart} />
        <p className="help-note">
          To check, open <code>chrome://version</code>: “Command Line” should include <code>--auto-select-desktop-capture-source</code>.
          Chrome started any other way (from a terminal, or by a link from another app) shows the picker as usual.
        </p>

        <h3>Undo</h3>
        <p>Back to Ubuntu's normal login (then restart):</p>
        <Command text={UBUNTU_COMMANDS.undoXorg} />
        <p>Chrome's picker back:</p>
        <Command text={UBUNTU_COMMANDS.undoChrome} />
      </section>
    </div>
  );
}
