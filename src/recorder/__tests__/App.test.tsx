import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const recorder = vi.hoisted(() => ({ recordStream: vi.fn() }));
vi.mock('../../shared/captureRecorder', () => recorder);

import App from '../App';

describe('Screen recorder window', () => {
  let getDisplayMedia: ReturnType<typeof vi.fn>;
  let stop: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;
  let resume: ReturnType<typeof vi.fn>;
  let onSessionChange: (changes: object) => void;
  let onMessage: (message: object) => void;
  const display = { getTracks: () => [{ stop: vi.fn() }] };

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/?mic=1&max=600000&format=mp4');
    getDisplayMedia = vi.fn().mockResolvedValue(display);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } });
    stop = vi.fn();
    pause = vi.fn();
    resume = vi.fn();
    recorder.recordStream.mockResolvedValue({ stop, pause, resume });
    (chrome.storage.session.onChanged.addListener as any) = vi.fn((fn: typeof onSessionChange) => (onSessionChange = fn));
    (chrome.runtime as any).sendMessage = vi.fn().mockResolvedValue({ success: true, recording: { startedAt: Date.now(), source: 'screen' } });
    (chrome.runtime.onMessage as any).addListener = vi.fn((fn: typeof onMessage) => (onMessage = fn));
    (chrome.runtime.onMessage as any).removeListener = vi.fn();
  });

  it("opens Chrome's share picker on Entire screen without an extra click and starts recording", async () => {
    render(<App />);

    await screen.findByText('⏹️ Stop recording');
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: true, selfBrowserSurface: 'exclude', video: expect.objectContaining({ displaySurface: 'monitor' }) })
    );
    expect(recorder.recordStream).toHaveBeenCalledWith(display, { playCapturedAudio: false, mic: true, maxDurationMs: 600000, format: 'mp4' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'RECORDING_STARTED' });
    expect(screen.getByRole('timer')).toHaveTextContent('0:00 / 10:00');
  });

  it('records WebM when that format was chosen', async () => {
    window.history.replaceState(null, '', '/?mic=0&max=600000&format=webm');
    render(<App />);
    await screen.findByText('⏹️ Stop recording');
    expect(recorder.recordStream).toHaveBeenCalledWith(display, expect.objectContaining({ format: 'webm', mic: false }));
  });

  it('falls back to a button when Chrome wants a click before showing the picker', async () => {
    getDisplayMedia.mockRejectedValueOnce(new DOMException('needs activation', 'InvalidStateError'));
    render(<App />);

    fireEvent.click(await screen.findByText('Choose what to record'));
    await screen.findByText('⏹️ Stop recording');
    expect(screen.queryByText(/Nothing was shared/)).toBeNull();
  });

  it('lets the user choose again after cancelling the picker', async () => {
    getDisplayMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    render(<App />);

    expect(await screen.findByText(/^Nothing was shared\./)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Choose again'));
    await screen.findByText('⏹️ Stop recording');
  });

  it('says when the operating system blocked screen sharing', async () => {
    getDisplayMedia.mockRejectedValueOnce(new DOMException('Permission denied by system', 'NotAllowedError'));
    render(<App />);
    expect(await screen.findByText(/Your system did not allow screen sharing/)).toBeInTheDocument();
  });

  it('explains which Share buttons to click while the pickers are open', async () => {
    getDisplayMedia.mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText(/In Chrome's window/)).toHaveTextContent("In Chrome's window, Entire screen is selected: click Share.");
    // jsdom's user agent says Linux, so the desktop step is shown
    expect(screen.getByText(/If your system asks too/)).toBeInTheDocument();
  });

  it('stops from the popup', async () => {
    render(<App />);
    await screen.findByText('⏹️ Stop recording');

    act(() => onMessage({ target: 'recorder', type: 'RECORDER_STOP' }));
    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(screen.getByText('Saving your recording…')).toBeInTheDocument();
  });

  it('pauses and resumes when the background says so, and shows it', async () => {
    const startedAt = Date.now() - 30_000;
    render(<App />);
    await screen.findByText('⏹️ Stop recording');

    act(() => onMessage({ target: 'recorder', type: 'RECORDER_PAUSE' }));
    expect(pause).toHaveBeenCalled();
    act(() => onSessionChange({ recording_state: { newValue: { startedAt, source: 'screen', pausedAt: Date.now() - 10_000, pausedMs: 0 } } }));
    await waitFor(() => expect(screen.getByRole('timer')).toHaveTextContent('❚❚ 0:20 / 10:00'));
    expect(screen.getByText('▶️ Resume')).toBeInTheDocument();

    act(() => onMessage({ target: 'recorder', type: 'RECORDER_RESUME' }));
    expect(resume).toHaveBeenCalled();
  });

  it('asks the background to pause, so the toolbar icon shows it too', async () => {
    render(<App />);
    fireEvent.click(await screen.findByText('⏸️ Pause'));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'PAUSE_RECORDING' });
    expect(pause).not.toHaveBeenCalled();
  });

  it('stops from its own button', async () => {
    render(<App />);
    fireEvent.click(await screen.findByText('⏹️ Stop recording'));
    expect(stop).toHaveBeenCalled();
  });

  it('warns before the window is closed mid-recording', async () => {
    render(<App />);
    await screen.findByText('⏹️ Stop recording');

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not record when the background refuses to start', async () => {
    (chrome.runtime as any).sendMessage = vi.fn().mockResolvedValue({ success: false, error: 'busy' });
    render(<App />);
    expect(await screen.findByText('Recording failed: busy')).toBeInTheDocument();
    expect(recorder.recordStream).not.toHaveBeenCalled();
  });
});
