import { describe, it, expect } from 'vitest';
import { detectOS, shortcutLabels } from '../platform';

describe('detectOS', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/146.0 Safari/537.36', 'mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0 Safari/537.36', 'windows'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/146.0 Safari/537.36', 'linux'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/146.0 Safari/537.36', 'chromeos'],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/146.0 Mobile Safari/537.36', 'other'],
  ])('%s → %s', (ua, os) => {
    expect(detectOS(ua)).toBe(os);
  });
});

describe('shortcutLabels', () => {
  it('names Option on a Mac and Alt elsewhere', () => {
    expect(shortcutLabels('mac')).toEqual({ pause: 'Option+Shift+P', stop: 'Option+Shift+S' });
    expect(shortcutLabels('windows')).toEqual({ pause: 'Alt+Shift+P', stop: 'Alt+Shift+S' });
  });
});
