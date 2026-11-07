import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '../shared/utils';
import type { DriveFile } from '../shared/drive';
import { useObjectUrl } from './useObjectUrl';

export function FileCard({
  file,
  loadImage,
  onClick,
}: {
  file: DriveFile;
  /** Fetches the full image; used only when Drive has no thumbnail for it. */
  loadImage: (fileId: string) => Promise<Blob>;
  onClick: () => void;
}) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [fallback, setFallback] = useState<Blob | null>(null);
  const fallbackUrl = useObjectUrl(fallback);
  const isImage = file.mimeType?.startsWith('image/');
  const isVideo = file.mimeType?.startsWith('video/');

  // Only load previews for cards near the viewport
  useEffect(() => {
    const el = cardRef.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const needsFallback = visible && isImage && (!file.thumbnailLink || thumbFailed);
  useEffect(() => {
    if (!needsFallback) return;
    let cancelled = false;
    loadImage(file.id)
      .then((blob) => !cancelled && setFallback(blob))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsFallback, file.id, loadImage]);

  const thumbnail = !visible
    ? null
    : file.thumbnailLink && !thumbFailed
      ? file.thumbnailLink
      : fallbackUrl;

  return (
    <button ref={cardRef} className="file-card" onClick={onClick} title={file.name}>
      <div className="file-preview">
        {thumbnail ? (
          <img src={thumbnail} alt="" referrerPolicy="no-referrer" onError={() => setThumbFailed(true)} />
        ) : (
          <div className="file-preview-placeholder">{isImage ? '🖼️' : isVideo ? '🎬' : '📄'}</div>
        )}
        {isVideo && thumbnail && <span className="file-play-badge">▶</span>}
      </div>
      <div className="file-info">
        <h3>{file.name}</h3>
        <p className="file-meta">
          {formatBytes(Number(file.size || 0))} · {new Date(file.createdTime).toLocaleDateString()}
        </p>
      </div>
      <div className="file-badges">
        {file.shared && <span className="file-badge file-badge-shared">Shared</span>}
        <span className="file-badge">{file.folder}</span>
      </div>
    </button>
  );
}
