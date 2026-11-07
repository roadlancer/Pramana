/// <reference types="chrome" />

import { useCallback, useEffect, useRef, useState } from 'react';
import { recordStream } from '../shared/captureRecorder';
import type { ActiveRecording, RecordingFormat } from '../shared/captureRecorder';
import { formatDuration, recordedSeconds } from '../shared/utils';

// Screen recording needs a visible page: Chrome's share picker can't open from the background
// worker, and the stream it returns only works in the page that asked for it.

const DEFAULT_MAX_MS = 10 * 60 * 1000;

// On Linux, the desktop (e.g. Ubuntu on Wayland) shows its own Share Screen dialog after Chrome's
const isLinux = /linux/i.test(navigator.userAgent) && !/android|cros/i.test(navigator.userAgent);

function ShareSteps() {
  return (
    <ol className="share-steps">
      <li>
        In Chrome's window, <strong>Entire screen</strong> is selected: click <strong>Share</strong>.
      </li>
      {isLinux && (
        <li>
          If your system asks too (Ubuntu's <strong>Share Screen</strong> window), pick your display and click <strong>Share</strong>.
        </li>
      )}
    </ol>
  );
}

function cancelMessage(error: DOMException) {
  // Chrome reports a denial by the operating system as "Permission denied by system"
  if (/system/i.test(error.message)) return 'Your system did not allow screen sharing. Click Share in its window when it asks.';
  return isLinux ? 'Nothing was shared. Click Share in both windows to start recording.' : 'Nothing was shared. Click Share in Chrome\'s window to start recording.';
}

type Phase =
  | { name: 'picking' }
  | { name: 'choose'; error?: string }
  | { name: 'recording'; warning?: string }
  | { name: 'saving' };

function App() {
  const params = new URLSearchParams(window.location.search);
  const mic = params.get('mic') === '1';
  const maxDurationMs = Number(params.get('max')) || DEFAULT_MAX_MS;
  const format: RecordingFormat = params.get('format') === 'webm' ? 'webm' : 'mp4';

  const [phase, setPhase] = useState<Phase>({ name: 'picking' });
  const [elapsed, setElapsed] = useState(0);
  const [timing, setTiming] = useState<{ startedAt: number; pausedAt?: number | null; pausedMs?: number } | null>(null);
  const recordingRef = useRef<ActiveRecording | null>(null);
  const autoStarted = useRef(false);
  const paused = !!timing?.pausedAt;

  // Timing comes from the background's state, which also changes on shortcuts and the popup
  useEffect(() => {
    const onSessionChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.recording_state?.newValue) setTiming(changes.recording_state.newValue);
    };
    chrome.storage.session?.onChanged?.addListener(onSessionChange);
    return () => chrome.storage.session?.onChanged?.removeListener(onSessionChange);
  }, []);


  // The popup's Stop button reaches the recording through the background
  useEffect(() => {
    const onMessage = (message: { target?: string; type?: string }) => {
      if (message.target !== 'recorder') return false;
      if (message.type === 'RECORDER_STOP') stop();
      if (message.type === 'RECORDER_PAUSE') recordingRef.current?.pause();
      if (message.type === 'RECORDER_RESUME') recordingRef.current?.resume();
      return false;
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  // Closing this window would lose the recording, so ask first
  useEffect(() => {
    if (phase.name !== 'recording' || !timing) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    const update = () => setElapsed(recordedSeconds(timing));
    update();
    const tick = setInterval(update, 500);
    return () => {
      window.removeEventListener('beforeunload', warn);
      clearInterval(tick);
    };
  }, [phase, timing]);

  const choose = useCallback(async () => {
    setPhase({ name: 'picking' });
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        // Opens the picker on "Entire screen"; the user can still switch to a window or tab
        video: { frameRate: 30, displaySurface: 'monitor' },
        monitorTypeSurfaces: 'include',
        audio: true,
        selfBrowserSurface: 'exclude',
        systemAudio: 'include',
        surfaceSwitching: 'include',
      } as DisplayMediaStreamOptions);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      // InvalidStateError: Chrome wants a click before showing the picker
      const message =
        name === 'InvalidStateError' ? undefined : name === 'NotAllowedError' ? cancelMessage(error as DOMException) : `Could not start: ${error}`;
      setPhase({ name: 'choose', error: message });
      return;
    }

    // Claim the recording slot before recording, so a refused start leaves nothing behind
    const response = await chrome.runtime.sendMessage({ type: 'RECORDING_STARTED' }).catch((error) => ({ success: false, error }));
    if (!response?.success) {
      display.getTracks().forEach((t) => t.stop());
      setPhase({ name: 'choose', error: `Recording failed: ${response?.error || 'Pramana could not start the recording'}` });
      return;
    }

    try {
      const recording = await recordStream(display, { playCapturedAudio: false, mic, maxDurationMs, format });
      recordingRef.current = recording;
      recording.onFinishing = () => setPhase({ name: 'saving' });
      setTiming(response.recording);
      setPhase({ name: 'recording', warning: recording.warning });
    } catch (error) {
      display.getTracks().forEach((t) => t.stop());
      const message = `Recording failed: ${error instanceof Error ? error.message : error}`;
      chrome.runtime.sendMessage({ type: 'RECORDING_FAILED', payload: { error: message } });
      setPhase({ name: 'choose', error: message });
    }
  }, [mic, maxDurationMs, format]);

  // Through the background, so the badge and popup show the pause too
  const togglePause = () => chrome.runtime.sendMessage({ type: paused ? 'RESUME_RECORDING' : 'PAUSE_RECORDING' }).catch(() => {});

  const stop = () => {
    setPhase({ name: 'saving' });
    recordingRef.current?.stop();
  };

  // Open Chrome's picker straight away; the button is only needed if Chrome wants a click first
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    choose();
  }, [choose]);

  return (
    <div className="recorder-window">
      <h1>Record your screen</h1>
      {phase.name === 'picking' && <ShareSteps />}
      {phase.name === 'choose' && (
        <>
          <ShareSteps />
          <p>You can also pick a window or tab instead, and include its audio in Chrome's window.</p>
          {mic && <p className="record-note">Your microphone will be recorded too.</p>}
          {phase.error && <p className="error-message">{phase.error}</p>}
          <button className="btn-primary" onClick={choose} autoFocus>
            {phase.error ? 'Choose again' : 'Choose what to record'}
          </button>
          <button className="btn-ghost" onClick={() => window.close()}>
            Cancel
          </button>
        </>
      )}
      {phase.name === 'recording' && (
        <>
          <p className={`recorder-timer${paused ? ' paused' : ''}`} role="timer">
            {paused ? '❚❚' : '●'} {formatDuration(elapsed)} / {formatDuration(Math.round(maxDurationMs / 1000))}
          </p>
          {phase.warning && <p className="notice notice-info">{phase.warning}</p>}
          <p>
            Controls are on the Pramana icon in Chrome's toolbar, or use Alt+Shift+P (pause) and Alt+Shift+S (stop). Keep this
            window open (minimized is fine): closing it discards the recording.
          </p>
          <button className="btn-ghost" onClick={togglePause}>
            {paused ? '▶️ Resume' : '⏸️ Pause'}
          </button>
          <button className="btn-record recording" onClick={stop}>
            ⏹️ Stop recording
          </button>
        </>
      )}
      {phase.name === 'saving' && <p>Saving your recording…</p>}
    </div>
  );
}

export default App;
