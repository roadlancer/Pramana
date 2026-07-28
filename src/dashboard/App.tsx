/// <reference types="chrome" />

import { useState, useEffect } from 'react';
import { formatBytes } from '../shared/utils';

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
  folder: string;
}

const FOLDERS = ['All', 'Screenshots', 'Recordings', 'Other'] as const;

function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [storageInfo, setStorageInfo] = useState<{ usage: number; limit: number } | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    loadFiles();
    checkStorageQuota();
  }, []);

  const loadFiles = async () => {
    setLoading(true);
    chrome.runtime.sendMessage({ type: 'LIST_FILES' }, (response) => {
      if (response?.success) {
        setFiles(response.files || []);
      }
      setLoading(false);
    });
  };

  const checkStorageQuota = async () => {
    chrome.runtime.sendMessage({ type: 'CHECK_STORAGE_QUOTA' }, (response) => {
      if (response?.success) {
        setStorageInfo({ usage: response.usage, limit: response.limit });
      }
    });
  };



  const filteredFiles = files.filter((file) => {
    const matchesFolder = activeFolder === 'All' || file.folder === activeFolder;
    const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  const folderCounts = (folder: string) => {
    if (folder === 'All') return files.length;
    return files.filter((f) => f.folder === folder).length;
  };

  const handlePreview = async (file: FileItem) => {
    setPreviewFile(file);
    setPreviewUrl(null);
    if (file.mimeType?.startsWith('image/')) {
      chrome.runtime.sendMessage({ type: 'FETCH_FILE_DATA', payload: { fileId: file.id } }, (response) => {
        if (response?.success) {
          setPreviewUrl(`data:${response.mimeType};base64,${response.base64}`);
        }
      });
    }
  };

  const handleDownload = (file: FileItem) => {
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_FILE', payload: { fileId: file.id, fileName: file.name } });
  };

  const handleDelete = (fileId: string) => {
    if (confirm('Are you sure you want to delete this file?')) {
      chrome.runtime.sendMessage({ type: 'DELETE_FILE', payload: { fileId } }, () => {
        loadFiles();
        setPreviewFile(null);
        setPreviewUrl(null);
      });
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Pramana Library</h1>
        {storageInfo && (
          <div className="storage-bar">
            <div className="storage-text">
              Drive: {formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.limit)}
            </div>
            <div className="storage-progress">
              <div
                className="storage-fill"
                style={{ width: `${(storageInfo.usage / storageInfo.limit) * 100}%` }}
              />
            </div>
          </div>
        )}
      </header>

      <div className="controls">
        <input
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="folder-tabs">
        {FOLDERS.map((folder) => (
          <button
            key={folder}
            className={`folder-tab ${activeFolder === folder ? 'active' : ''}`}
            onClick={() => setActiveFolder(folder)}
          >
            {folder}
            <span className="folder-count">{folderCounts(folder)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading files...</div>
      ) : filteredFiles.length === 0 ? (
        <div className="empty-state">
          <p>No files found. Capture something to get started!</p>
        </div>
      ) : (
        <div className="file-grid">
          {filteredFiles.map((file) => (
            <div key={file.id} className="file-card" onClick={() => handlePreview(file)}>
              <div className="file-preview">
                {file.mimeType?.startsWith('image/') ? (
                  <img src={`chrome-extension://${chrome.runtime.id}/icons/icon128.png`} alt={file.name} />
                ) : (
                  <div className="video-placeholder">🎬</div>
                )}
              </div>
              <div className="file-info">
                <h3>{file.name}</h3>
                <p className="file-meta">{formatBytes(Number(file.size || 0))} · {new Date(file.createdTime).toLocaleDateString()}</p>
              </div>
              <div className="file-folder-badge">{file.folder}</div>
            </div>
          ))}
        </div>
      )}

      {previewFile && (
        <div className="preview-overlay" onClick={() => { setPreviewFile(null); setPreviewUrl(null); }}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <h2>{previewFile.name}</h2>
              <button className="preview-close" onClick={() => { setPreviewFile(null); setPreviewUrl(null); }}>✕</button>
            </div>
            <div className="preview-content">
              {previewFile.mimeType?.startsWith('image/') ? (
                previewUrl ? (
                  <img src={previewUrl} alt={previewFile.name} className="preview-image" />
                ) : (
                  <div className="preview-loading">Loading preview...</div>
                )
              ) : (
                <div className="preview-video-placeholder">
                  <p>🎬 Video Recording</p>
                  <p className="preview-meta">{previewFile.name}</p>
                </div>
              )}
            </div>
            <div className="preview-details">
              <span>📁 {previewFile.folder}</span>
              <span>📏 {formatBytes(Number(previewFile.size || 0))}</span>
              <span>📅 {new Date(previewFile.createdTime).toLocaleDateString()}</span>
            </div>
            <div className="preview-actions">
              <button className="btn-primary" onClick={() => handleDownload(previewFile)}>Download</button>
              <button className="btn-danger" onClick={() => handleDelete(previewFile.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
