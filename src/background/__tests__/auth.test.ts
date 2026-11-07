import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getToken } from '../auth';

const identity = () => (globalThis.chrome as any).identity;
const local = () => (globalThis.chrome as any).storage.local;

describe('getToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    local().get = vi.fn().mockResolvedValue({});
  });

  it('returns the cached Chrome identity token and stores it', async () => {
    identity().getAuthToken = vi.fn((_opts: unknown, cb: (t: string) => void) => cb('cached'));

    expect(await getToken()).toBe('cached');
    expect(identity().getAuthToken).toHaveBeenCalledWith({ interactive: false }, expect.any(Function));
    expect(local().set).toHaveBeenCalledWith({ auth_token: 'cached' });
  });

  it('drops the rejected token before fetching a new one on refresh', async () => {
    const tokens = ['stale', 'fresh'];
    identity().getAuthToken = vi.fn((_opts: unknown, cb: (t: string) => void) => cb(tokens.shift()!));

    expect(await getToken(true)).toBe('fresh');
    expect(identity().removeCachedAuthToken).toHaveBeenCalledWith({ token: 'stale' });
    expect(local().remove).toHaveBeenCalledWith(['auth_token']);
  });

  it('returns null when the user is signed out', async () => {
    identity().getAuthToken = vi.fn((_opts: unknown, cb: (t?: string) => void) => cb(undefined));
    expect(await getToken()).toBeNull();
  });
});
