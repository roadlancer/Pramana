import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const clipboard = vi.hoisted(() => ({ copyImageToClipboard: vi.fn() }));
vi.mock('../../shared/clipboard', () => clipboard);

import App from '../App';

type Handler = (msg: any) => any;

describe('Popup App', () => {
  let handlers: Record<string, Handler>;
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {
      AUTH_STATUS: () => ({ signedIn: true, email: 'test@test.com', name: 'Test User' }),
      CHECK_STORAGE_QUOTA: () => ({ success: true, usage: 1000, limit: 10000 }),
      GET_RECORDING_STATE: () => ({ success: true, recording: null, error: null }),
    };
    sendMessage = vi.fn((msg: any, callback?: (r: unknown) => void) => {
      callback?.(handlers[msg.type]?.(msg));
    });
    (chrome.runtime as any).sendMessage = sendMessage;
    (chrome.runtime as any).lastError = undefined;
    (chrome.tabs.query as any) = vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
    (chrome.storage.local.get as any) = vi.fn().mockResolvedValue({});
    vi.stubGlobal('alert', vi.fn());
    // The popup closes itself once a recording starts; jsdom would tear the page down
    vi.spyOn(window, 'close').mockImplementation(() => {});
  });

  it('shows the storage meter from the quota response', async () => {
    render(<App />);
    expect(await screen.findByText(/Drive: 1000 B \/ 9\.8 KB/)).toBeInTheDocument();
  });

  it('shows usage without a bar for unlimited accounts', async () => {
    handlers.CHECK_STORAGE_QUOTA = () => ({ success: true, usage: 2048, limit: null });
    render(<App />);
    expect(await screen.findByText(/2 KB used \(unlimited\)/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('captures the visible tab and saves it without a browser alert', async () => {
    handlers.CAPTURE_SCREENSHOT = () => ({ success: true, dataUrl: 'data:image/png;base64,SHOT' });
    handlers.UPLOAD_FILE = () => ({ success: true, fileId: 'f1' });
    render(<App />);

    fireEvent.click(await screen.findByText('Visible Tab'));
    fireEvent.click(await screen.findByText('Save to Drive'));

    expect(await screen.findByText('Screenshot saved to Google Drive.')).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UPLOAD_FILE', payload: expect.objectContaining({ fileBase64: 'SHOT' }) }),
      expect.any(Function)
    );
    expect(alert).not.toHaveBeenCalled();
  });

  it('copies the screenshot from the preview', async () => {
    handlers.CAPTURE_SCREENSHOT = () => ({ success: true, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
    clipboard.copyImageToClipboard.mockImplementation(async (image: Promise<Blob>) => void (await image));
    render(<App />);

    fireEvent.click(await screen.findByText('Visible Tab'));
    fireEvent.click(await screen.findByText('Copy'));

    expect(await screen.findByText('Screenshot copied. Paste it anywhere with Ctrl+V.')).toBeInTheDocument();
    expect(clipboard.copyImageToClipboard).toHaveBeenCalledWith(expect.any(Promise));
    expect(screen.getByAltText('Screenshot')).toBeInTheDocument();
  });

  it('shows why copying failed', async () => {
    handlers.CAPTURE_SCREENSHOT = () => ({ success: true, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
    clipboard.copyImageToClipboard.mockRejectedValue(new Error('Document is not focused.'));
    render(<App />);

    fireEvent.click(await screen.findByText('Visible Tab'));
    fireEvent.click(await screen.findByText('Copy'));

    expect(await screen.findByText('Copy failed: Document is not focused.')).toBeInTheDocument();
  });

  it('keeps the preview and shows the error when the upload fails', async () => {
    handlers.CAPTURE_SCREENSHOT = () => ({ success: true, dataUrl: 'data:image/png;base64,SHOT' });
    handlers.UPLOAD_FILE = () => ({ success: false, error: 'Quota exceeded' });
    render(<App />);

    fireEvent.click(await screen.findByText('Visible Tab'));
    fireEvent.click(await screen.findByText('Save to Drive'));

    expect(await screen.findByText('Upload failed: Quota exceeded')).toBeInTheDocument();
    expect(screen.getByAltText('Screenshot')).toBeInTheDocument();
  });

  it('starts a tab recording and closes itself so it is not in the video', async () => {
    handlers.START_RECORDING = () => ({ success: true, recording: { startedAt: Date.now(), source: 'tab' } });
    render(<App />);

    fireEvent.click(await screen.findByText('Record Tab'));

    await waitFor(() => expect(window.close).toHaveBeenCalled());
    expect(sendMessage).toHaveBeenCalledWith(
      { type: 'START_RECORDING', payload: { source: 'tab', mic: false, tabId: 1, format: 'mp4' } },
      expect.any(Function)
    );
  });

  it('stays open to show a warning about the recording', async () => {
    handlers.START_RECORDING = () => ({ success: true, recording: { startedAt: Date.now(), source: 'tab' }, warning: 'Microphone was not available' });
    render(<App />);
    fireEvent.click(await screen.findByText('Record Tab'));
    expect(await screen.findByText('Microphone was not available')).toBeInTheDocument();
    expect(window.close).not.toHaveBeenCalled();
  });

  it('records in the chosen format and remembers it', async () => {
    handlers.START_RECORDING = () => ({ success: true, recording: { startedAt: Date.now(), source: 'tab' } });
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Format'), { target: { value: 'webm' } });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ record_format: 'webm' });
    fireEvent.click(screen.getByText('Record Tab'));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'START_RECORDING', payload: expect.objectContaining({ format: 'webm' }) }),
        expect.any(Function)
      )
    );
  });

  it('uses the remembered format', async () => {
    (chrome.storage.local.get as any) = vi.fn().mockResolvedValue({ record_format: 'webm' });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Format')).toHaveValue('webm'));
  });

  it('starts a screen recording', async () => {
    handlers.START_RECORDING = () => ({ success: true, recording: { startedAt: Date.now(), source: 'screen' } });
    render(<App />);
    fireEvent.click(await screen.findByText('Record Screen'));
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'START_RECORDING', payload: expect.objectContaining({ source: 'screen' }) }),
        expect.any(Function)
      )
    );
  });

  it('closes itself while the recorder window takes over a screen recording', async () => {
    handlers.START_RECORDING = () => ({ success: true, pending: true });
    render(<App />);
    fireEvent.click(await screen.findByText('Record Screen'));
    await waitFor(() => expect(window.close).toHaveBeenCalled());
  });

  it('shows why a recording could not start', async () => {
    handlers.START_RECORDING = () => ({ success: false, error: 'Could not capture this tab' });
    render(<App />);
    fireEvent.click(await screen.findByText('Record Tab'));
    expect(await screen.findByText('Could not capture this tab')).toBeInTheDocument();
    expect(window.close).not.toHaveBeenCalled();
  });

  it('picks up a recording that is already running when reopened', async () => {
    handlers.GET_RECORDING_STATE = () => ({ success: true, recording: { startedAt: Date.now() - 65_000, source: 'tab' } });
    render(<App />);
    await waitFor(() => expect(screen.getByRole('timer')).toHaveTextContent('● Recording 1:05 / 10:00'));
  });

  it('pauses and resumes, leaving paused time out of the timer', async () => {
    const startedAt = Date.now() - 65_000;
    handlers.GET_RECORDING_STATE = () => ({ success: true, recording: { startedAt, source: 'screen', pausedAt: null, pausedMs: 0 } });
    handlers.PAUSE_RECORDING = () => ({ success: true, recording: { startedAt, source: 'screen', pausedAt: Date.now() - 5_000, pausedMs: 20_000 } });
    handlers.RESUME_RECORDING = () => ({ success: true, recording: { startedAt, source: 'screen', pausedAt: null, pausedMs: 25_000 } });
    render(<App />);

    fireEvent.click(await screen.findByText('Pause'));
    await waitFor(() => expect(screen.getByRole('timer')).toHaveTextContent('❚❚ Paused 0:40 / 10:00'));
    fireEvent.click(screen.getByText('Resume'));
    await waitFor(() => expect(screen.getByRole('timer')).toHaveTextContent('● Recording 0:40 / 10:00'));
    expect(screen.getByText('Pause')).toBeInTheDocument();
  });

  it('follows the recording when it changes elsewhere (shortcut, recorder window)', async () => {
    let onChange: (changes: object) => void = () => {};
    (chrome.storage.session.onChanged.addListener as any) = vi.fn((fn) => (onChange = fn));
    render(<App />);
    await screen.findByText('Record Screen');

    act(() => onChange({ recording_state: { newValue: { startedAt: Date.now(), source: 'screen', pausedAt: null, pausedMs: 0 } } }));
    expect(await screen.findByText('Stop')).toBeInTheDocument();
    act(() => onChange({ recording_state: { newValue: undefined } }));
    expect(await screen.findByText('Record Screen')).toBeInTheDocument();
  });

  it('stops the recording and explains where it went', async () => {
    handlers.GET_RECORDING_STATE = () => ({ success: true, recording: { startedAt: Date.now(), source: 'tab' } });
    handlers.STOP_RECORDING = () => ({ success: true });
    render(<App />);

    fireEvent.click(await screen.findByText('Stop'));

    expect(await screen.findByText(/open in your Library/)).toBeInTheDocument();
    expect(screen.getByText('Record Tab')).toBeInTheDocument();
  });

  it('asks for microphone access on a visible page when enabling the mic', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) },
    });
    render(<App />);

    fireEvent.click(await screen.findByLabelText('Include microphone'));

    await waitFor(() =>
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://test/src/dashboard/index.html?grant=microphone' })
    );
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ record_mic: true });
  });

  it('shows the sign-in screen when signed out', async () => {
    handlers.AUTH_STATUS = () => ({ signedIn: false });
    render(<App />);
    expect(await screen.findByText('Sign in with Google')).toBeInTheDocument();
  });
});
