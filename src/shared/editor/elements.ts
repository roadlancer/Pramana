import { distToSegment, hexToRgba } from '../utils';
import type { EditorElement, Point } from './types';

export const TEXT_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const HIT_MARGIN = 8;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pixel block size for the blur tool. Blocks scale with the region so text inside it
 * becomes unreadable (roughly a quarter of the region's short side, never below 16px).
 */
export function blurBlockSize(width: number, height: number): number {
  return Math.max(16, Math.round(Math.min(Math.abs(width), Math.abs(height)) / 4));
}

export function normalizeRect<T extends Bounds>(el: T): T {
  return {
    ...el,
    x: el.width < 0 ? el.x + el.width : el.x,
    y: el.height < 0 ? el.y + el.height : el.y,
    width: Math.abs(el.width),
    height: Math.abs(el.height),
  };
}

export function elementBounds(el: EditorElement): Bounds {
  switch (el.type) {
    case 'arrow':
      return {
        x: Math.min(el.x1, el.x2),
        y: Math.min(el.y1, el.y2),
        width: Math.abs(el.x2 - el.x1),
        height: Math.abs(el.y2 - el.y1),
      };
    case 'draw': {
      const xs = el.points.map((p) => p.x);
      const ys = el.points.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
    default:
      return normalizeRect({ x: el.x, y: el.y, width: el.width, height: el.height });
  }
}

export function hitTestElement(pt: Point, el: EditorElement): boolean {
  if (el.type === 'arrow') {
    return distToSegment(pt, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <= HIT_MARGIN + el.lineWidth;
  }
  if (el.type === 'draw') {
    for (let i = 1; i < el.points.length; i++) {
      if (distToSegment(pt, el.points[i - 1], el.points[i]) <= HIT_MARGIN + el.lineWidth) return true;
    }
    return el.points.length === 1 && Math.hypot(pt.x - el.points[0].x, pt.y - el.points[0].y) <= HIT_MARGIN + el.lineWidth;
  }
  const b = elementBounds(el);
  return (
    pt.x >= b.x - HIT_MARGIN &&
    pt.x <= b.x + b.width + HIT_MARGIN &&
    pt.y >= b.y - HIT_MARGIN &&
    pt.y <= b.y + b.height + HIT_MARGIN
  );
}

/** Topmost element under the point, or null. */
export function hitTest(elements: EditorElement[], pt: Point): EditorElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (hitTestElement(pt, elements[i])) return elements[i];
  }
  return null;
}

export function moveElement(el: EditorElement, dx: number, dy: number): EditorElement {
  switch (el.type) {
    case 'arrow':
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case 'draw':
      return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    default:
      return { ...el, x: el.x + dx, y: el.y + dy };
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, el: Extract<EditorElement, { type: 'arrow' }>) {
  const headLength = 15 + el.lineWidth * 2;
  const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
  ctx.strokeStyle = el.color;
  ctx.fillStyle = el.color;
  ctx.lineWidth = el.lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(el.x1, el.y1);
  ctx.lineTo(el.x2, el.y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(el.x2, el.y2);
  ctx.lineTo(el.x2 - headLength * Math.cos(angle - Math.PI / 6), el.y2 - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(el.x2 - headLength * Math.cos(angle + Math.PI / 6), el.y2 - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

// Pixelates what is already drawn on the canvas inside the region
function pixelate(ctx: CanvasRenderingContext2D, rect: Bounds) {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (w < 2 || h < 2) return;
  const block = blurBlockSize(w, h);
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.ceil(w / block));
  small.height = Math.max(1, Math.ceil(h / block));
  const smallCtx = small.getContext('2d');
  if (!smallCtx) return;
  smallCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
}

export function renderElement(ctx: CanvasRenderingContext2D, el: EditorElement) {
  ctx.save();
  switch (el.type) {
    case 'highlight': {
      const r = normalizeRect(el);
      ctx.fillStyle = hexToRgba(el.color, 0.3);
      ctx.fillRect(r.x, r.y, r.width, r.height);
      break;
    }
    case 'rectangle': {
      const r = normalizeRect(el);
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.lineWidth;
      ctx.lineJoin = 'round';
      ctx.strokeRect(r.x, r.y, r.width, r.height);
      break;
    }
    case 'blur':
      pixelate(ctx, normalizeRect(el));
      break;
    case 'arrow':
      drawArrow(ctx, el);
      break;
    case 'draw':
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(el.points[0].x, el.points[0].y);
      for (const p of el.points.slice(1)) ctx.lineTo(p.x, p.y);
      if (el.points.length === 1) ctx.lineTo(el.points[0].x + 0.1, el.points[0].y);
      ctx.stroke();
      break;
    case 'text':
      ctx.font = `${el.fontSize}px ${TEXT_FONT}`;
      ctx.fillStyle = el.color;
      ctx.textBaseline = 'top';
      ctx.fillText(el.text, el.x, el.y);
      break;
    case 'emoji':
      ctx.font = `${el.fontSize}px serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(el.emoji, el.x, el.y);
      break;
  }
  ctx.restore();
}

export function renderSelection(ctx: CanvasRenderingContext2D, el: EditorElement, scale: number) {
  const pad = 6 * scale;
  const b = elementBounds(el);
  ctx.save();
  ctx.strokeStyle = '#1f6feb';
  ctx.lineWidth = 2 * scale;
  ctx.setLineDash([6 * scale, 4 * scale]);
  ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
  ctx.restore();
}

/** True when a freshly drawn shape is too small to keep (an accidental click). */
export function isTooSmall(el: EditorElement): boolean {
  if (el.type === 'text' || el.type === 'emoji') return false;
  if (el.type === 'draw') return false;
  const b = elementBounds(el);
  return b.width < 3 && b.height < 3;
}
