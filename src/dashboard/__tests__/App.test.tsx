import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

vi.mock('chrome', () => ({
  default: {
    runtime: {
      sendMessage: vi.fn(),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
  },
}));

describe('Dashboard App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.runtime.sendMessage as any).mockImplementation(
      (message: any, callback: any) => {
        if (message.type === 'LIST_FILES') {
          callback({
            success: true,
            files: [
              {
                id: '1',
                name: 'screenshot-1.png',
                mimeType: 'image/png',
                size: '1024',
                createdTime: '2024-01-01T00:00:00Z',
                folder: 'Screenshots',
              },
              {
                id: '2',
                name: 'recording-1.webm',
                mimeType: 'video/webm',
                size: '2048',
                createdTime: '2024-01-02T00:00:00Z',
                folder: 'Recordings',
              },
            ],
          });
        } else if (message.type === 'CHECK_STORAGE_QUOTA') {
          callback({ success: true, usage: 1024000, limit: 16106127360 });
        }
      }
    );
  });

  it('renders the library header', () => {
    render(<App />);
    expect(screen.getByText('Pramana Library')).toBeInTheDocument();
  });

  it('displays folder tabs', () => {
    render(<App />);
    // Tabs contain text + count span, so textContent includes count
    const allTab = screen.getByText('All').closest('button');
    const screenshotsTab = screen.getAllByRole('button').find(
      (b) => b.textContent?.includes('Screenshots')
    );
    const recordingsTab = screen.getAllByRole('button').find(
      (b) => b.textContent?.includes('Recordings')
    );
    const otherTab = screen.getAllByRole('button').find(
      (b) => b.textContent?.includes('Other')
    );

    expect(allTab).toBeTruthy();
    expect(screenshotsTab).toBeTruthy();
    expect(recordingsTab).toBeTruthy();
    expect(otherTab).toBeTruthy();
  });

  it('shows file count in All tab', () => {
    render(<App />);
    const allTab = screen.getByText('All').closest('button');
    expect(allTab?.textContent).toContain('2');
  });

  it('displays search input', () => {
    render(<App />);
    expect(screen.getByPlaceholderText('Search files...')).toBeInTheDocument();
  });

  it('shows storage usage', () => {
    render(<App />);
    expect(screen.getByText(/Drive:/)).toBeInTheDocument();
  });

  it('displays file cards', () => {
    render(<App />);
    expect(screen.getByText('screenshot-1.png')).toBeInTheDocument();
    expect(screen.getByText('recording-1.webm')).toBeInTheDocument();
  });
});
