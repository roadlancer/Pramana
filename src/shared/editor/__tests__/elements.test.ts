import { describe, it, expect } from 'vitest';
import { blurBlockSize, elementBounds, hitTest, moveElement, normalizeRect } from '../elements';
import type { EditorElement } from '../types';

const rect: EditorElement = { id: 1, type: 'rectangle', x: 10, y: 10, width: 100, height: 50, color: '#000000', lineWidth: 4 };
const arrow: EditorElement = { id: 2, type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 100, color: '#000000', lineWidth: 4 };
const stroke: EditorElement = { id: 3, type: 'draw', points: [{ x: 200, y: 200 }, { x: 260, y: 200 }], color: '#000000', lineWidth: 4 };

describe('blurBlockSize', () => {
  it('uses blocks big enough to hide a line of text', () => {
    // A 40px-tall text line becomes a single row of 16px blocks
    expect(blurBlockSize(300, 40)).toBe(16);
    expect(blurBlockSize(400, 200)).toBe(50);
  });

  it('never goes below 16px', () => {
    expect(blurBlockSize(10, 10)).toBe(16);
  });
});

describe('normalizeRect', () => {
  it('flips negative sizes', () => {
    expect(normalizeRect({ x: 100, y: 100, width: -60, height: -30 })).toEqual({ x: 40, y: 70, width: 60, height: 30 });
  });
});

describe('hitTest', () => {
  const elements = [rect, arrow, stroke];

  it('finds the topmost element under the point', () => {
    expect(hitTest(elements, { x: 50, y: 50 })?.id).toBe(2);
    expect(hitTest(elements, { x: 100, y: 30 })?.id).toBe(1);
  });

  it('hits arrows and strokes along their line, not their bounding box', () => {
    expect(hitTest([arrow], { x: 90, y: 10 })).toBeNull();
    expect(hitTest([stroke], { x: 230, y: 203 })?.id).toBe(3);
    expect(hitTest([stroke], { x: 230, y: 240 })).toBeNull();
  });

  it('returns null on empty space', () => {
    expect(hitTest(elements, { x: 500, y: 500 })).toBeNull();
  });
});

describe('moveElement', () => {
  it('moves every kind of element without mutating it', () => {
    expect(moveElement(rect, 5, -5)).toMatchObject({ x: 15, y: 5 });
    expect(moveElement(arrow, 10, 10)).toMatchObject({ x1: 10, y1: 10, x2: 110, y2: 110 });
    expect(elementBounds(moveElement(stroke, -200, 0))).toEqual({ x: 0, y: 200, width: 60, height: 0 });
    expect(rect).toMatchObject({ x: 10, y: 10 });
  });
});
