/// <reference types="chrome" />

import { useState, useEffect } from 'react';
import { formatBytes, blobToBase64 } from '../shared/utils';

function App() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ usage: number; limit: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ base64: string; blob: Blob } | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);



  const uploadFile = (blob: Blob, metadata: { name: string; type: string }) => {
    blobToBase64(blob).then((fileBase64) => {
      chrome.runtime.sendMessage({
        type: 'UPLOAD_FILE',
        payload: { fileBase64, metadata },
      }, (response) => {
        if (response?.success) {
          alert(`${metadata.type === 'recording' ? 'Recording' : 'Screenshot'} saved to Google Drive!`);
          checkStorageQuota();
        } else {
          setError('Upload failed: ' + (response?.error || 'Unknown error'));
        }
      });
    });
  };

  const openEditor = (base64: string) => {
    const storageKey = `pending_edit_${Date.now()}`;
    chrome.storage.local.set({ [storageKey]: base64 }, () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL(`src/editor/index.html?storageKey=${storageKey}`),
      });
    });
    setPreview(null);
  };

  const checkAuthStatus = () => {
    chrome.runtime.sendMessage({ type: 'AUTH_STATUS' }, (response) => {
      if (response?.signedIn) {
        setIsSignedIn(true);
        setUserEmail(response.email);
        setUserName(response.name);
        checkStorageQuota();
      }
    });
  };

  const checkStorageQuota = () => {
    chrome.runtime.sendMessage({ type: 'CHECK_STORAGE_QUOTA' }, (response) => {
      if (response?.success) {
        setStorageInfo({ usage: response.usage, limit: response.limit });
      }
    });
  };

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    chrome.runtime.sendMessage({ type: 'AUTH_REQUEST', payload: { type: 'LOGIN' } }, (response) => {
      setLoading(false);
      if (response?.success) {
        setIsSignedIn(true);
        setUserEmail(response.email);
        setUserName(response.name);
        checkStorageQuota();
      } else {
        setError(response?.error || 'Sign in failed');
      }
    });
  };

  const handleSignOut = () => {
    chrome.runtime.sendMessage({ type: 'AUTH_REQUEST', payload: { type: 'LOGOUT' } }, () => {
      setIsSignedIn(false);
      setUserEmail(null);
      setUserName(null);
      setStorageInfo(null);
    });
  };

  const handleCapture = async (mode: 'full' | 'area') => {
    setError(null);

    if (mode === 'full') {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (!activeTab?.id) {
          setError('No active tab found.');
          return;
        }

        const response = await new Promise<any>((resolve, reject) => {
          chrome.runtime.sendMessage(
            { type: 'CAPTURE_SCREENSHOT', payload: { mode: 'tab', tabId: activeTab.id } },
            (res) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else resolve(res);
            }
          );
        });

        if (response?.success && response.dataUrl) {
          const res = await fetch(response.dataUrl);
          const blob = await res.blob();
          const base64 = await blobToBase64(blob);
          setPreview({ base64, blob });
        } else {
          setError(response?.error || 'Capture failed');
        }
      } catch (err) {
        setError('Capture failed: ' + String(err));
      }
    } else if (mode === 'area') {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id) {
        setError('No active tab found.');
        return;
      }
      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        setError('Cannot capture on browser pages. Open a regular website first.');
        return;
      }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: false },
          world: 'ISOLATED',
          files: ['content.js'],
        });
      } catch (err) {
        console.error('Inject error:', err);
        setError('Cannot inject script on this page. Please refresh or try another page.');
        return;
      }
      try {
        await chrome.tabs.sendMessage(tab.id!, { type: 'CAPTURE_AREA_SELECT' });
      } catch (err) {
        console.error('Message error:', err);
        setError('Could not connect to page. Please refresh the page and try again.');
      }
      return;
    }
  };

  const handleToggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' } as MediaTrackConstraints,
        audio: { echoCancellation: true, noiseSuppression: true } as MediaTrackConstraints,
      });

      setIsRecording(true);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `recording-${timestamp}.webm`;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
      });
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        uploadFile(blob, { name: fileName, type: 'recording' });
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();

      stream.getVideoTracks()[0].onended = () => {
        mediaRecorder.stop();
        setIsRecording(false);
      };
    } catch (err) {
      if (String(err).includes('NotAllowedError')) {
        setError('Recording cancelled');
      } else {
        setError('Recording failed: ' + String(err));
      }
    }
  };

  const openDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') });
  };



  if (!isSignedIn) {
    return (
      <div className="popup-container">
        <div className="logo">
          <h1>Pramana</h1>
          <p>Capture. Edit. Share.</p>
        </div>
        {error && <div className="error-message">{error}</div>}
        <button className="btn-primary" onClick={handleSignIn} disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="popup-container">
        <div className="preview-header">
          <button className="btn-back" onClick={() => setPreview(null)}>
            &larr; Back
          </button>
          <span className="preview-title">Preview</span>
        </div>
        <div className="preview-image">
          <img src={`data:image/png;base64,${preview.base64}`} alt="Screenshot" />
        </div>
        <div className="preview-actions">
          <button
            className="btn-primary"
            onClick={() => {
              uploadFile(preview.blob, {
                name: `screenshot-${Date.now()}.png`,
                type: 'screenshot',
              });
              setPreview(null);
            }}
          >
            Save to Drive
          </button>
          <button
            className="btn-secondary"
            onClick={() => openEditor(preview.base64)}
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <div className="header">
        <h1>Pramana</h1>
        <button className="btn-icon" onClick={handleSignOut} title="Sign out">🚪</button>
      </div>

      <div className="user-info">
        {userName && <span className="user-name">{userName}</span>}
        {userEmail && <span className="user-email">{userEmail}</span>}
      </div>

      {storageInfo && (
        <div className="storage-info">
          <span>Drive: {formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.limit)}</span>
          <div className="storage-bar">
            <div
              className={`storage-fill ${storageInfo.usage / storageInfo.limit > 0.9 ? 'warning' : ''}`}
              style={{ width: `${(storageInfo.usage / storageInfo.limit) * 100}%` }}
            />
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="capture-section">
        <h2>Capture</h2>
        <div className="capture-buttons">
          <button className="btn-capture" onClick={() => handleCapture('full')}>
            <span className="icon">🖥️</span>
            <span>Full Screen</span>
          </button>
          <button className="btn-capture" onClick={() => handleCapture('area')}>
            <span className="icon">✂️</span>
            <span>Select Area</span>
          </button>
        </div>
      </div>

      <div className="record-section">
        <h2>Record</h2>
        <button
          className={`btn-record ${isRecording ? 'recording' : ''}`}
          onClick={handleToggleRecording}
        >
          {isRecording ? '⏹️ Stop Recording' : '🔴 Start Recording'}
        </button>
      </div>

      <div className="library-section">
        <button className="btn-library" onClick={openDashboard}>
          📚 Open Library
        </button>
      </div>
    </div>
  );
}

export default App;
