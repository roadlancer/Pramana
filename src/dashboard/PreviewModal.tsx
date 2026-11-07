import { useEffect, useState } from 'react';
import { formatBytes } from '../shared/utils';
import { showToast } from '../shared/toast';
import { copyImageToClipboard } from '../shared/clipboard';
import type { DriveClient, DriveFile } from '../shared/drive';
import { ConfirmDialog } from './ConfirmDialog';
import { downloadBlob, useObjectUrl } from './useObjectUrl';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function PreviewModal({
  file,
  drive,
  onUpdated,
  onTrashed,
  onClose,
}: {
  file: DriveFile;
  drive: DriveClient;
  onUpdated: (changes: Partial<DriveFile>) => void;
  onTrashed: () => void;
  onClose: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState(file.name);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingTrash, setConfirmingTrash] = useState(false);
  const mediaUrl = useObjectUrl(blob);
  const isImage = file.mimeType?.startsWith('image/');
  const isVideo = file.mimeType?.startsWith('video/');

  useEffect(() => {
    if (!isImage && !isVideo) return;
    let cancelled = false;
    setBlob(null);
    setLoadError(null);
    drive
      .fetchBlob(file.id)
      .then((b) => !cancelled && setBlob(b))
      .catch((error) => !cancelled && setLoadError(errorText(error)));
    return () => {
      cancelled = true;
    };
  }, [drive, file.id, isImage, isVideo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !confirmingTrash && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirmingTrash]);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    try {
      await action();
    } catch (error) {
      showToast(`${label} failed: ${errorText(error)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const rename = () =>
    run('Rename', async () => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === file.name) return setName(file.name);
      await drive.rename(file.id, trimmed);
      onUpdated({ name: trimmed });
      showToast('Renamed', 'success');
    });

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      showToast('Share link copied to clipboard', 'success');
    } catch {
      showToast(`Share link: ${link}`, 'info', document.body, 10_000);
    }
  };

  const copyImage = () =>
    run('Copy', async () => {
      await copyImageToClipboard(blob!);
      showToast('Image copied. Paste it anywhere with Ctrl+V.', 'success');
    });

  const share = () =>
    run('Sharing', async () => {
      const link = await drive.share(file.id);
      onUpdated({ shared: true, webViewLink: link });
      await copyLink(link);
    });

  const unshare = () =>
    run('Stop sharing', async () => {
      await drive.unshare(file.id);
      onUpdated({ shared: false });
      showToast('Link sharing turned off', 'success');
    });

  const download = () =>
    run('Download', async () => {
      downloadBlob(blob || (await drive.fetchBlob(file.id)), file.name);
    });

  const trash = () =>
    run('Delete', async () => {
      await drive.trash(file.id);
      showToast('Moved to Google Drive trash', 'success');
      onTrashed();
    });

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" role="dialog" aria-label={file.name} onClick={(e) => e.stopPropagation()}>
        <div className="preview-header">
          <input
            className="rename-input"
            value={name}
            aria-label="File name"
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setName(file.name);
              }
            }}
          />
          <button className="preview-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="preview-content">
          {loadError ? (
            <div className="preview-loading">Could not load preview: {loadError}</div>
          ) : !mediaUrl ? (
            <div className="preview-loading">{isImage || isVideo ? 'Loading preview...' : 'No preview for this file type'}</div>
          ) : isVideo ? (
            <video src={mediaUrl} controls className="preview-image" />
          ) : (
            <img src={mediaUrl} alt={file.name} className="preview-image" />
          )}
        </div>
        <div className="preview-details">
          <span>📁 {file.folder}</span>
          <span>📏 {formatBytes(Number(file.size || 0))}</span>
          <span>📅 {new Date(file.createdTime).toLocaleString()}</span>
          {file.shared && <span>🔗 Anyone with the link can view</span>}
        </div>
        <div className="preview-actions">
          <button className="btn-primary" onClick={download} disabled={!!busy}>
            {busy === 'Download' ? 'Downloading…' : 'Download'}
          </button>
          {isImage && (
            <button className="btn-ghost" onClick={copyImage} disabled={!!busy || !blob}>
              Copy image
            </button>
          )}
          {file.shared ? (
            <>
              <button className="btn-ghost" onClick={() => file.webViewLink && copyLink(file.webViewLink)} disabled={!!busy}>
                Copy link
              </button>
              <button className="btn-ghost" onClick={unshare} disabled={!!busy}>
                Stop sharing
              </button>
            </>
          ) : (
            <button className="btn-ghost" onClick={share} disabled={!!busy}>
              {busy === 'Sharing' ? 'Sharing…' : 'Share link'}
            </button>
          )}
          {file.webViewLink && (
            <a className="btn-ghost" href={file.webViewLink} target="_blank" rel="noreferrer">
              Open in Drive
            </a>
          )}
          <button className="btn-danger" onClick={() => setConfirmingTrash(true)} disabled={!!busy}>
            Delete
          </button>
        </div>
      </div>
      {confirmingTrash && (
        <ConfirmDialog
          title="Delete this file?"
          message={`"${file.name}" will be moved to your Google Drive trash. You can restore it from Drive for 30 days.`}
          confirmLabel="Move to trash"
          onCancel={() => setConfirmingTrash(false)}
          onConfirm={() => {
            setConfirmingTrash(false);
            trash();
          }}
        />
      )}
    </div>
  );
}
