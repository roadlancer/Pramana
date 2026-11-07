import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const drive = vi.hoisted(() => ({
  listFiles: vi.fn(),
  getQuota: vi.fn(),
  fetchBlob: vi.fn(),
  rename: vi.fn(),
  trash: vi.fn(),
  share: vi.fn(),
  unshare: vi.fn(),
  upload: vi.fn(),
}));
const recordings = vi.hoisted(() => ({
  getPendingRecording: vi.fn(),
  clearPendingRecording: vi.fn(),
}));

vi.mock('../../shared/drive', () => ({ createPageDriveClient: () => drive }));
vi.mock('../../shared/recordingStore', () => recordings);
const clipboard = vi.hoisted(() => ({ copyImageToClipboard: vi.fn() }));
vi.mock('../../shared/clipboard', () => clipboard);

import App from '../App';

const files = [
  { id: '1', name: 'screenshot-1.png', mimeType: 'image/png', size: '1024', createdTime: '2024-01-01T00:00:00Z', folder: 'Screenshots' },
  { id: '2', name: 'recording-1.webm', mimeType: 'video/webm', size: '4096', createdTime: '2024-01-02T00:00:00Z', folder: 'Recordings' },
];

function mockAuth(signedIn: boolean) {
  (chrome.runtime.sendMessage as any) = vi.fn((msg: any, cb?: (r: unknown) => void) => {
    if (msg.type === 'AUTH_STATUS') cb?.({ signedIn });
    if (msg.type === 'AUTH_REQUEST') cb?.({ success: true });
  });
}

describe('Dashboard App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/');
    mockAuth(true);
    drive.listFiles.mockResolvedValue(files);
    drive.getQuota.mockResolvedValue({ usage: 1024000, limit: 16106127360, available: 0, status: 'normal' });
    drive.fetchBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    recordings.getPendingRecording.mockResolvedValue(null);
    recordings.clearPendingRecording.mockResolvedValue(undefined);
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  it('lists files with folder counts and storage usage', async () => {
    render(<App />);
    expect(await screen.findByText('screenshot-1.png')).toBeInTheDocument();
    expect(screen.getByText('recording-1.webm')).toBeInTheDocument();
    expect(screen.getByText('All').closest('button')?.textContent).toContain('2');
    expect(await screen.findByText(/Drive: 1000 KB \/ 15 GB/)).toBeInTheDocument();
  });

  it('asks signed-out users to sign in instead of claiming there are no files', async () => {
    mockAuth(false);
    render(<App />);
    expect(await screen.findByText('Sign in with Google')).toBeInTheDocument();
    expect(screen.queryByText(/No files/)).toBeNull();

    fireEvent.click(screen.getByText('Sign in with Google'));
    expect(await screen.findByText('screenshot-1.png')).toBeInTheDocument();
  });

  it('shows the error and lets the user retry when loading fails', async () => {
    drive.listFiles.mockRejectedValueOnce(new Error('Network down'));
    render(<App />);
    expect(await screen.findByText('Could not load your files: Network down')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Try again'));
    expect(await screen.findByText('screenshot-1.png')).toBeInTheDocument();
  });

  it('filters by search and folder, and sorts', async () => {
    render(<App />);
    await screen.findByText('screenshot-1.png');

    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'record' } });
    expect(screen.queryByText('screenshot-1.png')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: '' } });

    fireEvent.change(screen.getByLabelText('Sort files'), { target: { value: 'oldest' } });
    const names = [...document.querySelectorAll('.file-info h3')].map((h) => h.textContent);
    expect(names).toEqual(['screenshot-1.png', 'recording-1.webm']);

    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.startsWith('Recordings'))!);
    expect(screen.queryByText('screenshot-1.png')).toBeNull();
  });

  it('plays videos in the preview', async () => {
    drive.fetchBlob.mockResolvedValue(new Blob(['v'], { type: 'video/webm' }));
    render(<App />);
    fireEvent.click(await screen.findByText('recording-1.webm'));
    await waitFor(() => expect(document.querySelector('video')).toHaveAttribute('src', 'blob:preview'));
  });

  it('moves a file to the trash after confirming in a dialog', async () => {
    drive.trash.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<App />);
    fireEvent.click(await screen.findByText('screenshot-1.png'));
    fireEvent.click(screen.getByText('Delete'));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/moved to your Google Drive trash/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Move to trash'));

    await waitFor(() => expect(drive.trash).toHaveBeenCalledWith('1'));
    await waitFor(() => expect(screen.queryByText('screenshot-1.png')).toBeNull());
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('shares a file and copies the link', async () => {
    drive.share.mockResolvedValue('https://drive.google.com/file/d/1/view');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<App />);
    fireEvent.click(await screen.findByText('screenshot-1.png'));
    fireEvent.click(screen.getByText('Share link'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://drive.google.com/file/d/1/view'));
    expect(await screen.findByText('Stop sharing')).toBeInTheDocument();
    expect(screen.getByText('Open in Drive')).toHaveAttribute('href', 'https://drive.google.com/file/d/1/view');
  });

  it('copies an image from the preview, but offers no copy for videos', async () => {
    const image = new Blob(['x'], { type: 'image/png' });
    drive.fetchBlob.mockResolvedValue(image);
    clipboard.copyImageToClipboard.mockResolvedValue(undefined);
    render(<App />);
    fireEvent.click(await screen.findByText('screenshot-1.png'));

    const copy = screen.getByText('Copy image');
    await waitFor(() => expect(copy).toBeEnabled());
    fireEvent.click(copy);
    await waitFor(() => expect(clipboard.copyImageToClipboard).toHaveBeenCalledWith(image));
    expect(await screen.findByText('Image copied. Paste it anywhere with Ctrl+V.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close'));
    fireEvent.click(screen.getByText('recording-1.webm'));
    expect(screen.queryByText('Copy image')).toBeNull();
  });

  it('renames a file from the preview', async () => {
    drive.rename.mockResolvedValue(undefined);
    render(<App />);
    fireEvent.click(await screen.findByText('screenshot-1.png'));

    const input = screen.getByLabelText('File name');
    fireEvent.change(input, { target: { value: 'login-bug.png' } });
    fireEvent.blur(input);

    await waitFor(() => expect(drive.rename).toHaveBeenCalledWith('1', 'login-bug.png'));
    expect(await screen.findByText('login-bug.png')).toBeInTheDocument();
  });

  it('offers a finished recording for review and uploads it', async () => {
    recordings.getPendingRecording.mockResolvedValue({ blob: new Blob(['v'], { type: 'video/webm' }), fileName: 'recording-x.webm', createdAt: 1 });
    drive.upload.mockResolvedValue('new');
    render(<App />);

    expect(await screen.findByText('Review your recording')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Save to Drive')[0]);

    await waitFor(() =>
      expect(drive.upload).toHaveBeenCalledWith(expect.any(Blob), { name: 'recording-x.webm', kind: 'recording' }, expect.any(Function))
    );
    await waitFor(() => expect(recordings.clearPendingRecording).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Review your recording')).toBeNull());
  });

  it('keeps the .mp4 extension when an MP4 recording is renamed', async () => {
    recordings.getPendingRecording.mockResolvedValue({ blob: new Blob(['v'], { type: 'video/mp4' }), fileName: 'recording-x.mp4', createdAt: 1 });
    drive.upload.mockResolvedValue('new');
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Recording name'), { target: { value: 'demo-for-client' } });
    fireEvent.click(screen.getAllByText('Save to Drive')[0]);

    await waitFor(() => expect(drive.upload).toHaveBeenCalledWith(expect.any(Blob), { name: 'demo-for-client.mp4', kind: 'recording' }, expect.any(Function)));
  });

  it('shows the microphone permission page when asked', async () => {
    window.history.replaceState(null, '', '/?grant=microphone');
    render(<App />);
    expect(screen.getByText('Allow microphone')).toBeInTheDocument();
  });
});
