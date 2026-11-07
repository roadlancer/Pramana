/// <reference types="chrome" />

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPageDriveClient } from '../shared/drive';
import type { DriveFile, StorageQuota } from '../shared/drive';
import { getPendingRecording } from '../shared/recordingStore';
import type { PendingRecording } from '../shared/recordingStore';
import { StorageMeter } from '../shared/StorageMeter';
import { FileCard } from './FileCard';
import { PreviewModal } from './PreviewModal';
import { RecordingReview } from './RecordingReview';
import { MicPermission } from './MicPermission';
import { Help } from './Help';

const drive = createPageDriveClient();

const FOLDERS = ['All', 'Screenshots', 'Recordings', 'Other'] as const;

const SORTS = {
  newest: { label: 'Newest first', compare: (a: DriveFile, b: DriveFile) => b.createdTime.localeCompare(a.createdTime) },
  oldest: { label: 'Oldest first', compare: (a: DriveFile, b: DriveFile) => a.createdTime.localeCompare(b.createdTime) },
  name: { label: 'Name', compare: (a: DriveFile, b: DriveFile) => a.name.localeCompare(b.name) },
  size: { label: 'Largest first', compare: (a: DriveFile, b: DriveFile) => Number(b.size || 0) - Number(a.size || 0) },
} as const;

type SortKey = keyof typeof SORTS;
type AuthState = 'checking' | 'signedOut' | 'signedIn';

const loadImage = (fileId: string) => drive.fetchBlob(fileId);

function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('grant') === 'microphone') return <MicPermission />;
  if (params.has('help')) return <Help />;
  return <Library />;
}

function Library() {
  const [auth, setAuth] = useState<AuthState>('checking');
  const [signingIn, setSigningIn] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [quota, setQuota] = useState<StorageQuota | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pendingRecording, setPendingRecording] = useState<PendingRecording | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setFiles(await drive.listFiles());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
    drive.getQuota().then(setQuota).catch(() => {});
  }, []);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'AUTH_STATUS' }, (response) => {
      setAuth(response?.signedIn ? 'signedIn' : 'signedOut');
    });
    getPendingRecording()
      .then(setPendingRecording)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (auth === 'signedIn') loadFiles();
  }, [auth, loadFiles]);

  const signIn = () => {
    setSigningIn(true);
    chrome.runtime.sendMessage({ type: 'AUTH_REQUEST', payload: { type: 'LOGIN' } }, (response) => {
      setSigningIn(false);
      if (response?.success) setAuth('signedIn');
      else setLoadError(response?.error || 'Sign in failed');
    });
  };

  const visibleFiles = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return files
      .filter((f) => (activeFolder === 'All' || f.folder === activeFolder) && f.name.toLowerCase().includes(query))
      .sort(SORTS[sort].compare);
  }, [files, activeFolder, searchQuery, sort]);

  const folderCount = (folder: string) => (folder === 'All' ? files.length : files.filter((f) => f.folder === folder).length);
  const previewFile = files.find((f) => f.id === previewId) || null;

  const updateFile = (id: string, changes: Partial<DriveFile>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...changes } : f)));

  if (auth === 'checking') {
    return <div className="dashboard-container loading">Loading…</div>;
  }

  if (auth === 'signedOut') {
    return (
      <div className="dashboard-container centered-panel">
        <h1>Pramana Library</h1>
        <p>Sign in with Google to see the screenshots and recordings Pramana saved to your Drive.</p>
        {loadError && <p className="error-message">{loadError}</p>}
        <button className="btn-primary" onClick={signIn} disabled={signingIn}>
          {signingIn ? 'Signing in…' : 'Sign in with Google'}
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Pramana Library</h1>
        <div className="dashboard-header-actions">
          {quota && (
            <div className="dashboard-storage">
              <StorageMeter quota={quota} />
            </div>
          )}
          <a className="btn-ghost" href="?help">
            Help
          </a>
        </div>
      </header>

      <div className="controls">
        <input
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort files">
          {Object.entries(SORTS).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button className="btn-ghost" onClick={loadFiles} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="folder-tabs">
        {FOLDERS.map((folder) => (
          <button
            key={folder}
            className={`folder-tab ${activeFolder === folder ? 'active' : ''}`}
            onClick={() => setActiveFolder(folder)}
          >
            {folder}
            <span className="folder-count">{folderCount(folder)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading files...</div>
      ) : loadError ? (
        <div className="empty-state">
          <p className="error-message">Could not load your files: {loadError}</p>
          <button className="btn-primary" onClick={loadFiles}>
            Try again
          </button>
        </div>
      ) : visibleFiles.length === 0 ? (
        <div className="empty-state">
          <p>{files.length === 0 ? 'No files yet. Capture something to get started!' : 'No files match your search.'}</p>
        </div>
      ) : (
        <div className="file-grid">
          {visibleFiles.map((file) => (
            <FileCard key={file.id} file={file} loadImage={loadImage} onClick={() => setPreviewId(file.id)} />
          ))}
        </div>
      )}

      {previewFile && (
        <PreviewModal
          key={previewFile.id}
          file={previewFile}
          drive={drive}
          onUpdated={(changes) => updateFile(previewFile.id, changes)}
          onTrashed={() => {
            setFiles((prev) => prev.filter((f) => f.id !== previewFile.id));
            setPreviewId(null);
          }}
          onClose={() => setPreviewId(null)}
        />
      )}

      {pendingRecording && (
        <RecordingReview
          recording={pendingRecording}
          drive={drive}
          onDone={(saved) => {
            setPendingRecording(null);
            if (saved) loadFiles();
          }}
        />
      )}
    </div>
  );
}

export default App;
