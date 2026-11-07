/// <reference types="chrome" />

const PENDING_EDIT_PREFIX = 'pending_edit_';
const PENDING_EDIT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Pending images are kept until saved, so drop abandoned ones (key is pending_edit_<timestamp>)
export async function removeStalePendingEdits(currentKey: string, now = Date.now()) {
  const all = await chrome.storage.local.get(null);
  const stale = Object.keys(all).filter((key) => {
    if (!key.startsWith(PENDING_EDIT_PREFIX) || key === currentKey) return false;
    const createdAt = Number(key.slice(PENDING_EDIT_PREFIX.length));
    return !createdAt || now - createdAt > PENDING_EDIT_MAX_AGE_MS;
  });
  if (stale.length) await chrome.storage.local.remove(stale);
}
