import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startRecording,
  stopRecording,
  pauseRecording,
  resumeRecording,
  togglePauseRecording,
  handleRecordingStarted,
  handleRecordingFinished,
  handleRecordingFailed,
  handleWindowRemoved,
  MAX_RECORDING_MS,
} from '../recording';

const c = () => globalThis.chrome as any;

describe('background recording control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    c().storage.session.get = vi.fn().mockResolvedValue({});
    c().runtime.getContexts = vi.fn().mockResolvedValue([]);
    c().runtime.sendMessage = vi.fn().mockResolvedValue({ success: true });
    c().tabCapture.getMediaStreamId = vi.fn((_opts: unknown, cb: (id: string) => void) => cb('tab-stream'));
    c().tabs.get = vi.fn().mockResolvedValue({ id: 7, width: 1280, height: 657 });
  });

  describe('tab recording', () => {
    it('records the tab in an offscreen document and marks the toolbar icon', async () => {
      const result = await startRecording({ source: 'tab', mic: true, tabId: 7 });

      expect(result.success).toBe(true);
      expect(c().tabCapture.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 7 }, expect.any(Function));
      expect(c().offscreen.createDocument).toHaveBeenCalledWith(expect.objectContaining({ url: 'src/offscreen/index.html' }));
      expect(c().runtime.sendMessage).toHaveBeenCalledWith({
        target: 'offscreen',
        type: 'OFFSCREEN_START',
        payload: { streamId: 'tab-stream', mic: true, maxDurationMs: MAX_RECORDING_MS, tabSize: { width: 1280, height: 657 }, format: 'mp4' },
      });
      expect(c().storage.session.set).toHaveBeenCalledWith({ recording_state: expect.objectContaining({ source: 'tab' }) });
      expect(c().action.setBadgeText).toHaveBeenCalledWith({ text: 'REC' });
    });

    it('reuses an existing offscreen document', async () => {
      c().runtime.getContexts = vi.fn().mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }]);
      await startRecording({ source: 'tab', mic: false, tabId: 7 });
      expect(c().offscreen.createDocument).not.toHaveBeenCalled();
    });

    it('closes the offscreen document when the recorder fails to start', async () => {
      c().runtime.sendMessage = vi.fn().mockResolvedValue({ success: false, error: 'Recording failed: denied' });
      expect(await startRecording({ source: 'tab', mic: false, tabId: 7 })).toEqual({ success: false, error: 'Recording failed: denied' });
      expect(c().offscreen.closeDocument).toHaveBeenCalled();
    });

    it('forwards stop to the offscreen recorder', async () => {
      c().storage.session.get = vi.fn().mockResolvedValue({ recording_state: { startedAt: 1, source: 'tab' } });
      expect(await stopRecording()).toEqual({ success: true });
      expect(c().runtime.sendMessage).toHaveBeenCalledWith({ target: 'offscreen', type: 'OFFSCREEN_STOP' });
    });
  });

  describe('screen recording', () => {
    it('opens the visible recorder window instead of calling the picker from the worker', async () => {
      const result = await startRecording({ source: 'screen', mic: true });

      expect(result).toEqual({ success: true, pending: true });
      expect(c().windows.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: `chrome-extension://test/src/recorder/index.html?mic=1&max=${MAX_RECORDING_MS}&format=mp4`, type: 'popup' })
      );
      expect(c().storage.session.set).toHaveBeenCalledWith({ recorder_window: 99 });
      expect(c().offscreen.createDocument).not.toHaveBeenCalled();
      expect(c().action.setBadgeText).not.toHaveBeenCalled();
    });

    it('passes the chosen format to the recorder window', async () => {
      await startRecording({ source: 'screen', mic: false, format: 'webm' });
      expect(c().windows.create).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('format=webm') }));
    });

    it('focuses the recorder window if it is already open', async () => {
      c().storage.session.get = vi.fn().mockResolvedValue({ recorder_window: 99 });
      await startRecording({ source: 'screen', mic: false });
      expect(c().windows.update).toHaveBeenCalledWith(99, { focused: true });
      expect(c().windows.create).not.toHaveBeenCalled();
    });

    it('marks the recording as started once the user picked what to share', async () => {
      expect(await handleRecordingStarted()).toEqual({ success: true, recording: expect.objectContaining({ source: 'screen' }) });
      expect(c().action.setBadgeText).toHaveBeenCalledWith({ text: 'REC' });
    });

    it('minimizes the recorder window once recording starts, so it is not in the video', async () => {
      c().storage.session.get = vi.fn().mockResolvedValue({ recorder_window: 99 });
      await handleRecordingStarted();
      expect(c().windows.update).toHaveBeenCalledWith(99, { state: 'minimized' });
      expect(c().action.setTitle).toHaveBeenCalledWith({ title: expect.stringContaining('Alt+Shift+S stop') });
    });

    it('sends Stop to the recorder window', async () => {
      c().storage.session.get = vi.fn().mockResolvedValue({ recording_state: { startedAt: 1, source: 'screen' } });
      await stopRecording();
      expect(c().runtime.sendMessage).toHaveBeenCalledWith({ target: 'recorder', type: 'RECORDER_STOP' });
    });

    it('reports a recording lost because its window was closed', async () => {
      c().storage.session.get = vi.fn().mockResolvedValue({ recorder_window: 99, recording_state: { startedAt: 1, source: 'screen' } });
      await handleWindowRemoved(99);
      expect(c().storage.session.set).toHaveBeenCalledWith({ recording_error: expect.stringContaining('recorder window was closed') });
    });

    it('ignores other windows closing', async () => {
      c().storage.session.get = vi.fn().mockResolvedValue({ recorder_window: 99, recording_state: { startedAt: 1, source: 'screen' } });
      await handleWindowRemoved(5);
      expect(c().storage.session.set).not.toHaveBeenCalled();
    });
  });

  it('refuses to start a second recording', async () => {
    c().storage.session.get = vi.fn().mockResolvedValue({ recording_state: { startedAt: 1, source: 'tab' } });
    expect(await startRecording({ source: 'screen', mic: false })).toEqual({
      success: false,
      error: 'A recording is already in progress',
    });
  });

  describe('pause and resume', () => {
    const sessionState = (state: object) => (c().storage.session.get = vi.fn().mockResolvedValue({ recording_state: state }));

    it('pauses the tab recorder and shows it on the toolbar icon', async () => {
      sessionState({ startedAt: 1000, source: 'tab', pausedAt: null, pausedMs: 0 });
      const result = await pauseRecording();

      expect(c().runtime.sendMessage).toHaveBeenCalledWith({ target: 'offscreen', type: 'OFFSCREEN_PAUSE' });
      expect(result.recording).toMatchObject({ pausedAt: expect.any(Number), pausedMs: 0 });
      expect(c().storage.session.set).toHaveBeenCalledWith({ recording_state: result.recording });
      expect(c().action.setBadgeText).toHaveBeenCalledWith({ text: '❚❚' });
      expect(c().action.setTitle).toHaveBeenCalledWith({ title: expect.stringContaining('paused') });
    });

    it('resumes the screen recorder and adds the pause to the paused time', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(50_000);
      sessionState({ startedAt: 1000, source: 'screen', pausedAt: 40_000, pausedMs: 3_000 });
      const result = await resumeRecording();

      expect(c().runtime.sendMessage).toHaveBeenCalledWith({ target: 'recorder', type: 'RECORDER_RESUME' });
      expect(result.recording).toEqual({ startedAt: 1000, source: 'screen', pausedAt: null, pausedMs: 13_000 });
      expect(c().action.setBadgeText).toHaveBeenCalledWith({ text: 'REC' });
      vi.restoreAllMocks();
    });

    it('toggles between the two for the keyboard shortcut', async () => {
      sessionState({ startedAt: 1, source: 'screen', pausedAt: null, pausedMs: 0 });
      await togglePauseRecording();
      expect(c().runtime.sendMessage).toHaveBeenCalledWith({ target: 'recorder', type: 'RECORDER_PAUSE' });

      sessionState({ startedAt: 1, source: 'screen', pausedAt: 5, pausedMs: 0 });
      await togglePauseRecording();
      expect(c().runtime.sendMessage).toHaveBeenCalledWith({ target: 'recorder', type: 'RECORDER_RESUME' });
    });

    it('needs a recording to pause', async () => {
      expect(await pauseRecording()).toEqual({ success: false, error: 'Not recording' });
      expect(c().runtime.sendMessage).not.toHaveBeenCalled();
    });
  });

  it('closes the recorder and opens the Library to review a finished recording', async () => {
    c().storage.session.get = vi.fn().mockResolvedValue({ recorder_window: 99 });
    await handleRecordingFinished();
    expect(c().storage.session.remove).toHaveBeenCalledWith(['recording_state']);
    expect(c().action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(c().offscreen.closeDocument).toHaveBeenCalled();
    expect(c().windows.remove).toHaveBeenCalledWith(99);
    expect(c().tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://test/src/dashboard/index.html?review=recording' });
  });

  it('keeps the error for the popup to show when recording fails', async () => {
    await handleRecordingFailed('Disk full');
    expect(c().storage.session.set).toHaveBeenCalledWith({ recording_error: 'Disk full' });
  });
});
