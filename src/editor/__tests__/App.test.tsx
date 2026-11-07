import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const drive = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('../../shared/drive', () => ({ createPageDriveClient: () => drive }));

import App from '../App';

const local = () => (globalThis.chrome as any).storage.local;

describe('Editor page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/?storageKey=pending_edit_123');
    local().get = vi.fn(async (keys: string[] | null) => (keys === null ? {} : { pending_edit_123: 'AAAA' }));
    window.close = vi.fn();
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(['png'], { type: 'image/png' }));
    };
  });

  it('opens the pending screenshot and keeps it until saved', async () => {
    render(<App />);
    await screen.findByText('Save to Drive');
    expect(local().remove).not.toHaveBeenCalledWith(['pending_edit_123']);
  });

  it('uploads to Drive and then clears the pending screenshot', async () => {
    drive.upload.mockResolvedValue('file-1');
    render(<App />);
    (await screen.findByText('Save to Drive')).click();

    await waitFor(() => expect(drive.upload).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ kind: 'screenshot' })));
    await waitFor(() => expect(local().remove).toHaveBeenCalledWith(['pending_edit_123']));
    expect(await screen.findByText(/saved to Google Drive/)).toBeInTheDocument();
  });

  it('keeps the screenshot and shows the error when the upload fails', async () => {
    drive.upload.mockRejectedValue(new Error('Offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<App />);
    (await screen.findByText('Save to Drive')).click();

    expect(await screen.findByText('Upload failed: Offline')).toBeInTheDocument();
    expect(local().remove).not.toHaveBeenCalledWith(['pending_edit_123']);
  });

  it('opens only one editor under React StrictMode double effects', async () => {
    const { StrictMode } = await import('react');
    render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    await screen.findByText('Save to Drive');
    expect(document.querySelectorAll('.pe-root')).toHaveLength(1);
  });

  it('explains when there is nothing to edit', async () => {
    window.history.replaceState(null, '', '/');
    render(<App />);
    expect(await screen.findByText(/No image to edit/)).toBeInTheDocument();
  });
});
