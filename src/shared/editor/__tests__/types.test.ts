import { describe, it, expect } from 'vitest';
import { DEFAULT_COLORS, EMOJI_LIST } from '../types';

describe('DEFAULT_COLORS', () => {
  it('has 12 colors', () => {
    expect(DEFAULT_COLORS).toHaveLength(12);
  });

  it('all colors are valid hex format', () => {
    for (const color of DEFAULT_COLORS) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('includes primary colors', () => {
    expect(DEFAULT_COLORS).toContain('#FF3B30'); // Red
    expect(DEFAULT_COLORS).toContain('#007AFF'); // Blue
    expect(DEFAULT_COLORS).toContain('#34C759'); // Green
  });

  it('includes black and white', () => {
    expect(DEFAULT_COLORS).toContain('#FFFFFF');
    expect(DEFAULT_COLORS).toContain('#000000');
  });
});

describe('EMOJI_LIST', () => {
  it('has at least one emoji', () => {
    expect(EMOJI_LIST.length).toBeGreaterThan(0);
  });

  it('all entries are strings', () => {
    for (const emoji of EMOJI_LIST) {
      expect(typeof emoji).toBe('string');
    }
  });

  it('includes fire emoji', () => {
    expect(EMOJI_LIST).toContain('🔥');
  });
});
