/// <reference types="chrome" />

// Tab recordings run in an offscreen document so they keep going after the popup closes.
// Screen recordings run in a small visible recorder window: Chrome's share picker needs a
// page to open from, and the stream it returns only works in that page.

import { shortcutLabels } from '../shared/platform';

export const OFFSCREEN_PATH = 'src/offscreen/index.html';
export const RECORDER_PATH = 'src/recorder/index.html';
export const MAX_RECORDING_MS = 10 * 60 * 1000;

export type RecordingSource = 'tab' | 'screen';
export type RecordingFormat = 'mp4' | 'webm';

export interface RecordingState {
  startedAt: number;
  source: RecordingSource;
  /** Set while paused */
  pausedAt?: number | null;
  /** Total time spent paused before the current pause */
  pausedMs?: number;
}

const STATE_KEY = 'recording_state';
const ERROR_KEY = 'recording_error';
const WINDOW_KEY = 'recorder_window';

export async function getRecordingState(): Promise<{ recording: RecordingState | null; error: string | null }> {
  const data = await chrome.storage.session.get([STATE_KEY, ERROR_KEY]);
  return { recording: data[STATE_KEY] || null, error: data[ERROR_KEY] || null };
}

function getTabStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (id) resolve(id);
      else reject(new Error('Could not capture this tab'));
    });
  });
}

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Record the tab the user chose, after the popup closes',
  });
}

async function closeOffscreenDocument() {
  try {
    await chrome.offscreen.closeDocument();
  } catch {
    // Not open
  }
}

async function closeRecorderWindow() {
  const { [WINDOW_KEY]: windowId } = await chrome.storage.session.get([WINDOW_KEY]);
  await chrome.storage.session.remove([WINDOW_KEY]);
  if (windowId) await chrome.windows.remove(windowId).catch(() => {});
}

const KEYS = shortcutLabels();
const SHORTCUTS = `${KEYS.pause} pause/resume, ${KEYS.stop} stop`;

// The toolbar icon is the recording's only on-screen sign: badge, plus the tooltip on hover
async function setRecordingBadge(mode: 'recording' | 'paused' | 'off') {
  await chrome.action.setBadgeText({ text: mode === 'recording' ? 'REC' : mode === 'paused' ? '❚❚' : '' });
  if (mode !== 'off') await chrome.action.setBadgeBackgroundColor({ color: mode === 'recording' ? '#e94560' : '#6b7280' });
  await chrome.action.setTitle({
    title:
      mode === 'recording'
        ? `Pramana: recording. Click to pause or stop (${SHORTCUTS})`
        : mode === 'paused'
          ? `Pramana: paused. Click to resume or stop (${SHORTCUTS})`
          : 'Pramana',
  });
}

async function markStarted(source: RecordingSource): Promise<RecordingState> {
  const state: RecordingState = { startedAt: Date.now(), source, pausedAt: null, pausedMs: 0 };
  await chrome.storage.session.set({ [STATE_KEY]: state });
  await chrome.storage.session.remove([ERROR_KEY]);
  await setRecordingBadge('recording');
  return state;
}

async function openScreenRecorder(mic: boolean, format: RecordingFormat) {
  const { [WINDOW_KEY]: existing } = await chrome.storage.session.get([WINDOW_KEY]);
  if (existing) {
    const focused = await chrome.windows.update(existing, { focused: true }).catch(() => null);
    if (focused) return;
  }
  const url = chrome.runtime.getURL(`${RECORDER_PATH}?mic=${mic ? 1 : 0}&max=${MAX_RECORDING_MS}&format=${format}`);
  const win = await chrome.windows.create({ url, type: 'popup', width: 460, height: 400, focused: true });
  await chrome.storage.session.set({ [WINDOW_KEY]: win?.id });
}

export async function startRecording(payload: { source: RecordingSource; mic: boolean; tabId?: number; format?: RecordingFormat }) {
  const format: RecordingFormat = payload.format === 'webm' ? 'webm' : 'mp4';
  const { recording } = await getRecordingState();
  if (recording) return { success: false, error: 'A recording is already in progress' };

  try {
    if (payload.source === 'screen') {
      // Recording starts once the user picks something in the recorder window (RECORDING_STARTED)
      await openScreenRecorder(payload.mic, format);
      return { success: true, pending: true };
    }

    if (!payload.tabId) return { success: false, error: 'No active tab found.' };
    const streamId = await getTabStreamId(payload.tabId);
    const tab = await chrome.tabs.get(payload.tabId).catch(() => null);
    const tabSize = tab?.width && tab?.height ? { width: tab.width, height: tab.height } : undefined;
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'OFFSCREEN_START',
      payload: { streamId, mic: payload.mic, maxDurationMs: MAX_RECORDING_MS, tabSize, format },
    });
    if (!response?.success) {
      await closeOffscreenDocument();
      return { success: false, error: response?.error || 'Recording failed to start' };
    }
    return { success: true, recording: await markStarted('tab'), warning: response.warning as string | undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Sent by the recorder window once the user picked a screen, window or tab
export async function handleRecordingStarted() {
  const { recording } = await getRecordingState();
  if (recording) return { success: false, error: 'A recording is already in progress' };
  const state = await markStarted('screen');
  // Out of the way, so it isn't in the video; the toolbar icon has the controls
  const { [WINDOW_KEY]: windowId } = await chrome.storage.session.get([WINDOW_KEY]);
  if (windowId) await chrome.windows.update(windowId, { state: 'minimized' }).catch(() => {});
  return { success: true, recording: state };
}

function sendToRecorder(recording: RecordingState, action: 'STOP' | 'PAUSE' | 'RESUME') {
  const target = recording.source === 'screen' ? 'recorder' : 'offscreen';
  return chrome.runtime.sendMessage({ target, type: `${target.toUpperCase()}_${action}` }).catch(() => null);
}

export async function stopRecording() {
  const { recording } = await getRecordingState();
  if (!recording) return { success: false, error: 'Not recording' };
  await sendToRecorder(recording, 'STOP');
  return { success: true };
}

export async function pauseRecording() {
  const { recording } = await getRecordingState();
  if (!recording) return { success: false, error: 'Not recording' };
  if (recording.pausedAt) return { success: true, recording };
  await sendToRecorder(recording, 'PAUSE');
  const state: RecordingState = { ...recording, pausedAt: Date.now() };
  await chrome.storage.session.set({ [STATE_KEY]: state });
  await setRecordingBadge('paused');
  return { success: true, recording: state };
}

export async function resumeRecording() {
  const { recording } = await getRecordingState();
  if (!recording) return { success: false, error: 'Not recording' };
  if (!recording.pausedAt) return { success: true, recording };
  await sendToRecorder(recording, 'RESUME');
  const state: RecordingState = { ...recording, pausedAt: null, pausedMs: (recording.pausedMs || 0) + Date.now() - recording.pausedAt };
  await chrome.storage.session.set({ [STATE_KEY]: state });
  await setRecordingBadge('recording');
  return { success: true, recording: state };
}

export async function togglePauseRecording() {
  const { recording } = await getRecordingState();
  if (!recording) return { success: false, error: 'Not recording' };
  return recording.pausedAt ? resumeRecording() : pauseRecording();
}

async function endRecording() {
  await chrome.storage.session.remove([STATE_KEY]);
  await setRecordingBadge('off');
  await closeOffscreenDocument();
  await closeRecorderWindow();
}

// Called once the recording has been saved locally
export async function handleRecordingFinished() {
  await endRecording();
  await chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html?review=recording') });
  return { success: true };
}

export async function handleRecordingFailed(error: string) {
  await endRecording();
  await chrome.storage.session.set({ [ERROR_KEY]: error });
  return { success: true };
}

// The user closed the recorder window themselves
export async function handleWindowRemoved(windowId: number) {
  const { [WINDOW_KEY]: recorderWindow } = await chrome.storage.session.get([WINDOW_KEY]);
  if (windowId !== recorderWindow) return;
  await chrome.storage.session.remove([WINDOW_KEY]);
  const { recording } = await getRecordingState();
  if (recording?.source === 'screen') {
    await handleRecordingFailed('The recorder window was closed, so the screen recording was discarded.');
  }
}
