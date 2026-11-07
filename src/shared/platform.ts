export type OS = 'mac' | 'windows' | 'linux' | 'chromeos' | 'other';

export function detectOS(userAgent = navigator.userAgent): OS {
  if (/CrOS/.test(userAgent)) return 'chromeos';
  if (/Mac OS X|Macintosh/.test(userAgent)) return 'mac';
  if (/Windows/.test(userAgent)) return 'windows';
  if (/Linux/i.test(userAgent) && !/Android/.test(userAgent)) return 'linux';
  return 'other';
}

/** The recording shortcuts as the user's keyboard labels them (Chrome maps Alt to Option on a Mac). */
export function shortcutLabels(os: OS = detectOS()) {
  const mod = os === 'mac' ? 'Option+Shift' : 'Alt+Shift';
  return { pause: `${mod}+P`, stop: `${mod}+S` };
}
