import { describe, it, expect, vi, beforeEach } from 'vitest';
import { removeStalePendingEdits } from '../pendingEdits';

describe('removeStalePendingEdits', () => {
  const now = 1_800_000_000_000;
  const day = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes only abandoned pending images, keeping the current one', async () => {
    (globalThis.chrome as any).storage.local.get = vi.fn().mockResolvedValue({
      [`pending_edit_${now - 2 * day}`]: 'old',
      [`pending_edit_${now - 60_000}`]: 'recent',
      [`pending_edit_${now - 3 * day}`]: 'current-but-old',
      auth_token: 'tok',
    });
    const remove = vi.fn().mockResolvedValue(undefined);
    (globalThis.chrome as any).storage.local.remove = remove;

    await removeStalePendingEdits(`pending_edit_${now - 3 * day}`, now);

    expect(remove).toHaveBeenCalledWith([`pending_edit_${now - 2 * day}`]);
  });

  it('does nothing when there is nothing stale', async () => {
    (globalThis.chrome as any).storage.local.get = vi.fn().mockResolvedValue({ [`pending_edit_${now}`]: 'x' });
    const remove = vi.fn();
    (globalThis.chrome as any).storage.local.remove = remove;

    await removeStalePendingEdits(`pending_edit_${now}`, now);

    expect(remove).not.toHaveBeenCalled();
  });
});
