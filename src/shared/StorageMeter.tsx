import { formatBytes } from './utils';
import type { StorageQuota } from './drive';

export function StorageMeter({ quota }: { quota: Pick<StorageQuota, 'usage' | 'limit'> }) {
  if (quota.limit === null) {
    return <span className="storage-text">Drive: {formatBytes(quota.usage)} used (unlimited)</span>;
  }
  const percent = quota.limit > 0 ? Math.min(100, (quota.usage / quota.limit) * 100) : 0;
  return (
    <>
      <span className="storage-text">
        Drive: {formatBytes(quota.usage)} / {formatBytes(quota.limit)}
      </span>
      <div className="storage-bar" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`storage-fill ${percent > 90 ? 'warning' : ''}`} style={{ width: `${percent}%` }} />
      </div>
    </>
  );
}
