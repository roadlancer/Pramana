import { describe, it, expect } from 'vitest';
import { formatBytes, distToSegment, hexToRgba, rgbToHex, formatDuration, recordedSeconds } from '../utils';

describe('formatBytes', () => {
  it('returns "0 B" for zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes correctly', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes correctly', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(2621440)).toBe('2.5 MB');
  });

  it('formats gigabytes correctly', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('formats terabytes correctly', () => {
    expect(formatBytes(1099511627776)).toBe('1 TB');
  });

  it('handles decimal rounding', () => {
    expect(formatBytes(1234)).toBe('1.2 KB');
    expect(formatBytes(1234567)).toBe('1.2 MB');
  });
});

describe('distToSegment', () => {
  it('returns distance to endpoint when segment is a point', () => {
    const p = { x: 3, y: 4 };
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 0 };
    expect(distToSegment(p, a, b)).toBe(5);
  });

  it('returns perpendicular distance to line segment', () => {
    const p = { x: 0, y: 1 };
    const a = { x: 0, y: 0 };
    const b = { x: 2, y: 0 };
    expect(distToSegment(p, a, b)).toBe(1);
  });

  it('returns distance to nearest endpoint when projection is outside segment', () => {
    const p = { x: -1, y: 0 };
    const a = { x: 0, y: 0 };
    const b = { x: 2, y: 0 };
    expect(distToSegment(p, a, b)).toBe(1);
  });

  it('returns 0 when point is on the segment', () => {
    const p = { x: 1, y: 0 };
    const a = { x: 0, y: 0 };
    const b = { x: 2, y: 0 };
    expect(distToSegment(p, a, b)).toBe(0);
  });

  it('handles diagonal segments', () => {
    const p = { x: 0, y: 0 };
    const a = { x: 1, y: 1 };
    const b = { x: 3, y: 1 };
    expect(distToSegment(p, a, b)).toBeCloseTo(Math.sqrt(2));
  });
});

describe('hexToRgba', () => {
  it('converts hex to rgba with full opacity', () => {
    expect(hexToRgba('#FF0000', 1)).toBe('rgba(255,0,0,1)');
  });

  it('converts hex to rgba with partial opacity', () => {
    expect(hexToRgba('#00FF00', 0.5)).toBe('rgba(0,255,0,0.5)');
  });

  it('converts hex to rgba with zero opacity', () => {
    expect(hexToRgba('#0000FF', 0)).toBe('rgba(0,0,255,0)');
  });

  it('handles lowercase hex', () => {
    expect(hexToRgba('#ff9500', 0.3)).toBe('rgba(255,149,0,0.3)');
  });

  it('handles mixed case hex', () => {
    expect(hexToRgba('#FFcc00', 1)).toBe('rgba(255,204,0,1)');
  });
});

describe('rgbToHex', () => {
  it('converts rgb string to hex', () => {
    expect(rgbToHex('rgb(255, 0, 0)')).toBe('#ff0000');
  });

  it('converts rgb with no spaces', () => {
    expect(rgbToHex('rgb(0,255,0)')).toBe('#00ff00');
  });

  it('returns hex as-is if already hex', () => {
    expect(rgbToHex('#0000ff')).toBe('#0000ff');
  });

  it('handles rgb(0,0,0)', () => {
    expect(rgbToHex('rgb(0, 0, 0)')).toBe('#000000');
  });

  it('handles rgb(255,255,255)', () => {
    expect(rgbToHex('rgb(255, 255, 255)')).toBe('#ffffff');
  });

  it('returns input for invalid format', () => {
    expect(rgbToHex('invalid')).toBe('invalid');
  });
});

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(600)).toBe('10:00');
  });
});

describe('recordedSeconds', () => {
  it('counts time since the start, minus paused time', () => {
    expect(recordedSeconds({ startedAt: 0, pausedMs: 0 }, 65_400)).toBe(65);
    expect(recordedSeconds({ startedAt: 0, pausedMs: 20_000 }, 65_000)).toBe(45);
  });

  it('stays still while paused', () => {
    const state = { startedAt: 0, pausedAt: 30_000, pausedMs: 5_000 };
    expect(recordedSeconds(state, 31_000)).toBe(25);
    expect(recordedSeconds(state, 90_000)).toBe(25);
  });
});
