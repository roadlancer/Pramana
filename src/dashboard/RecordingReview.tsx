import { useState } from 'react';
import { formatBytes } from '../shared/utils';
import { showToast } from '../shared/toast';
import type { DriveClient } from '../shared/drive';
import type { PendingRecording } from '../shared/recordingStore';
import { clearPendingRecording } from '../shared/recordingStore';
import { useObjectUrl } from './useObjectUrl';

/** Shown when a finished recording is waiting to be saved or discarded. */
export function RecordingReview({
  recording,
  drive,
  onDone,
}: {
  recording: PendingRecording;
  drive: DriveClient;
  onDone: (saved: boolean) => void;
}) {
  const videoUrl = useObjectUrl(recording.blob);
  const [name, setName] = useState(recording.fileName);
  const [progress, setProgress] = useState<number | null>(null);

  const save = async () => {
    setProgress(0);
    try {
      const extension = recording.fileName.match(/\.\w+$/)?.[0] || '.webm';
      const base = name.trim() || 'recording';
      const fileName = base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`;
      await drive.upload(recording.blob, { name: fileName, kind: 'recording' }, setProgress);
      await clearPendingRecording();
      showToast('Recording saved to Google Drive', 'success');
      onDone(true);
    } catch (error) {
      setProgress(null);
      showToast(`Upload failed: ${error instanceof Error ? error.message : error}. Your recording is kept here, try again.`, 'error');
    }
  };

  const discard = async () => {
    await clearPendingRecording();
    onDone(false);
  };

  const uploading = progress !== null;

  return (
    <div className="preview-overlay">
      <div className="preview-modal" role="dialog" aria-label="Review recording">
        <div className="preview-header">
          <h2>Review your recording</h2>
        </div>
        <div className="preview-content">
          {videoUrl && <video src={videoUrl} controls autoPlay className="preview-image" />}
        </div>
        <div className="preview-details">
          <input
            className="rename-input"
            value={name}
            aria-label="Recording name"
            onChange={(e) => setName(e.target.value)}
            disabled={uploading}
          />
          <span>📏 {formatBytes(recording.blob.size)}</span>
          {recording.warning && <span className="warning-text">⚠️ {recording.warning}</span>}
        </div>
        {uploading && (
          <div className="upload-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
            <div className="upload-progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        <div className="preview-actions">
          <button className="btn-primary" onClick={save} disabled={uploading}>
            {uploading ? `Uploading… ${Math.round(progress * 100)}%` : 'Save to Drive'}
          </button>
          <button className="btn-danger" onClick={discard} disabled={uploading}>
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
