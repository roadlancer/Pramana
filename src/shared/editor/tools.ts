import { hexToRgba } from '../utils';
import type { Tool, Point } from './types';
import { CanvasManager } from './canvas';

export class ToolHandler {
  private canvasManager: CanvasManager;
  private currentTool: Tool = 'select';
  private color = '#FF3B30';
  private lineWidth = 4;
  private fontSize = 24;
  private emoji = '🔥';
  private isDrawing = false;
  private startPoint: Point = { x: 0, y: 0 };
  private snapshot: ImageData | null = null;
  private tempCanvas: HTMLCanvasElement;
  private tempCtx: CanvasRenderingContext2D;

  constructor(canvasManager: CanvasManager) {
    this.canvasManager = canvasManager;
    this.tempCanvas = document.createElement('canvas');
    this.tempCtx = this.tempCanvas.getContext('2d')!;
  }

  setTool(tool: Tool) {
    this.currentTool = tool;
    const cursor =
      tool === 'select'
        ? 'default'
        : tool === 'text'
          ? 'text'
          : tool === 'emoji'
            ? 'pointer'
            : 'crosshair';
    this.canvasManager.canvas.style.cursor = cursor;
  }

  setColor(color: string) {
    this.color = color;
  }
  setLineWidth(w: number) {
    this.lineWidth = w;
  }
  setFontSize(s: number) {
    this.fontSize = s;
  }
  setEmoji(e: string) {
    this.emoji = e;
  }

  onMouseDown(e: MouseEvent) {
    if (this.currentTool === 'select') return;

    const point = this.canvasManager.getCanvasPoint(e);
    this.isDrawing = true;
    this.startPoint = point;

    if (this.currentTool === 'text') {
      this.placeText(point);
      return;
    }

    if (this.currentTool === 'emoji') {
      this.placeEmoji(point);
      return;
    }

    this.snapshot = this.canvasManager.ctx.getImageData(
      0,
      0,
      this.canvasManager.width,
      this.canvasManager.height
    );

    if (this.currentTool === 'draw' || this.currentTool === 'eraser') {
      const ctx = this.canvasManager.ctx;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = this.lineWidth;
      if (this.currentTool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = this.color;
      }
    }

    if (this.currentTool === 'blur') {
      this.tempCanvas.width = this.canvasManager.width;
      this.tempCanvas.height = this.canvasManager.height;
      this.tempCtx.drawImage(this.canvasManager.canvas, 0, 0);
    }
  }

  onMouseMove(e: MouseEvent) {
    if (!this.isDrawing) return;

    const point = this.canvasManager.getCanvasPoint(e);

    switch (this.currentTool) {
      case 'draw':
      case 'eraser':
        this.drawFreehand(point);
        break;
      case 'highlight':
        this.drawHighlight(point);
        break;
      case 'arrow':
        this.drawArrowPreview(point);
        break;
      case 'rectangle':
        this.drawRectanglePreview(point);
        break;
      case 'blur':
        this.drawBlurPreview(point);
        break;
    }
  }

  onMouseUp(e: MouseEvent) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    const point = this.canvasManager.getCanvasPoint(e);

    switch (this.currentTool) {
      case 'draw':
      case 'eraser':
        this.canvasManager.ctx.globalCompositeOperation = 'source-over';
        this.canvasManager.pushUndo();
        break;
      case 'highlight':
        this.finishHighlight(point);
        break;
      case 'arrow':
        this.finishArrow(point);
        break;
      case 'rectangle':
        this.finishRectangle(point);
        break;
      case 'blur':
        this.finishBlur(point);
        break;
    }
  }

  private drawFreehand(point: Point) {
    const ctx = this.canvasManager.ctx;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  private drawHighlight(point: Point) {
    const ctx = this.canvasManager.overlayCtx;
    const w = this.canvasManager.width;
    const h = this.canvasManager.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = hexToRgba(this.color, 0.3);
    const x = Math.min(this.startPoint.x, point.x);
    const y = Math.min(this.startPoint.y, point.y);
    const width = Math.abs(point.x - this.startPoint.x);
    const height = Math.abs(point.y - this.startPoint.y);
    ctx.fillRect(x, y, width, height);
  }

  private finishHighlight(point: Point) {
    const ctx = this.canvasManager.ctx;
    ctx.fillStyle = hexToRgba(this.color, 0.3);
    const x = Math.min(this.startPoint.x, point.x);
    const y = Math.min(this.startPoint.y, point.y);
    const width = Math.abs(point.x - this.startPoint.x);
    const height = Math.abs(point.y - this.startPoint.y);
    ctx.fillRect(x, y, width, height);
    this.canvasManager.clearOverlay();
    this.canvasManager.pushUndo();
  }

  private drawArrowPreview(point: Point) {
    const ctx = this.canvasManager.overlayCtx;
    const w = this.canvasManager.width;
    const h = this.canvasManager.height;
    ctx.clearRect(0, 0, w, h);
    if (this.snapshot) {
      this.canvasManager.ctx.putImageData(this.snapshot, 0, 0);
    }
    this.drawArrowOnCtx(this.canvasManager.ctx, this.startPoint, point);
  }

  private finishArrow(point: Point) {
    if (this.snapshot) {
      this.canvasManager.ctx.putImageData(this.snapshot, 0, 0);
    }
    this.drawArrowOnCtx(this.canvasManager.ctx, this.startPoint, point);
    this.canvasManager.clearOverlay();
    this.canvasManager.pushUndo();
    this.snapshot = null;
  }

  private drawArrowOnCtx(
    ctx: CanvasRenderingContext2D,
    from: Point,
    to: Point
  ) {
    const headLength = 15 + this.lineWidth * 2;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLength * Math.cos(angle - Math.PI / 6),
      to.y - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      to.x - headLength * Math.cos(angle + Math.PI / 6),
      to.y - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  private drawRectanglePreview(point: Point) {
    const ctx = this.canvasManager.overlayCtx;
    const w = this.canvasManager.width;
    const h = this.canvasManager.height;
    ctx.clearRect(0, 0, w, h);
    if (this.snapshot) {
      this.canvasManager.ctx.putImageData(this.snapshot, 0, 0);
    }
    this.drawRectOnCtx(this.canvasManager.ctx, this.startPoint, point);
  }

  private finishRectangle(point: Point) {
    if (this.snapshot) {
      this.canvasManager.ctx.putImageData(this.snapshot, 0, 0);
    }
    this.drawRectOnCtx(this.canvasManager.ctx, this.startPoint, point);
    this.canvasManager.clearOverlay();
    this.canvasManager.pushUndo();
    this.snapshot = null;
  }

  private drawRectOnCtx(
    ctx: CanvasRenderingContext2D,
    from: Point,
    to: Point
  ) {
    const x = Math.min(from.x, to.x);
    const y = Math.min(from.y, to.y);
    const w = Math.abs(to.x - from.x);
    const h = Math.abs(to.y - from.y);

    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.lineJoin = 'round';
    ctx.strokeRect(x, y, w, h);
  }

  private drawBlurPreview(point: Point) {
    const ctx = this.canvasManager.overlayCtx;
    const w = this.canvasManager.width;
    const h = this.canvasManager.height;
    ctx.clearRect(0, 0, w, h);

    const x = Math.min(this.startPoint.x, point.x);
    const y = Math.min(this.startPoint.y, point.y);
    const bw = Math.abs(point.x - this.startPoint.x);
    const bh = Math.abs(point.y - this.startPoint.y);

    if (bw < 2 || bh < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, bw, bh);
    ctx.clip();

    const pixelSize = Math.max(6, Math.floor(Math.min(bw, bh) / 15));
    const temp = document.createElement('canvas');
    temp.width = bw;
    temp.height = bh;
    const tempCtx = temp.getContext('2d')!;
    tempCtx.drawImage(
      this.tempCanvas,
      x,
      y,
      bw,
      bh,
      0,
      0,
      bw,
      bh
    );
    const smallW = Math.max(1, Math.floor(bw / pixelSize));
    const smallH = Math.max(1, Math.floor(bh / pixelSize));
    const small = document.createElement('canvas');
    small.width = smallW;
    small.height = smallH;
    const smallCtx = small.getContext('2d')!;
    smallCtx.drawImage(temp, 0, 0, smallW, smallH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, smallW, smallH, x, y, bw, bh);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
  }

  private finishBlur(point: Point) {
    const ctx = this.canvasManager.ctx;
    const x = Math.min(this.startPoint.x, point.x);
    const y = Math.min(this.startPoint.y, point.y);
    const bw = Math.abs(point.x - this.startPoint.x);
    const bh = Math.abs(point.y - this.startPoint.y);

    if (bw < 2 || bh < 2) return;

    const pixelSize = Math.max(6, Math.floor(Math.min(bw, bh) / 15));
    const temp = document.createElement('canvas');
    temp.width = bw;
    temp.height = bh;
    const tempCtx = temp.getContext('2d')!;
    tempCtx.drawImage(this.tempCanvas, x, y, bw, bh, 0, 0, bw, bh);
    const smallW = Math.max(1, Math.floor(bw / pixelSize));
    const smallH = Math.max(1, Math.floor(bh / pixelSize));
    const small = document.createElement('canvas');
    small.width = smallW;
    small.height = smallH;
    const smallCtx = small.getContext('2d')!;
    smallCtx.drawImage(temp, 0, 0, smallW, smallH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, smallW, smallH, x, y, bw, bh);
    ctx.imageSmoothingEnabled = true;
    this.canvasManager.clearOverlay();
    this.canvasManager.pushUndo();
  }

  private placeText(point: Point) {
    const input = prompt('Enter text:');
    if (!input) return;

    const ctx = this.canvasManager.ctx;
    ctx.font = `${this.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = this.color;
    ctx.textBaseline = 'top';
    ctx.fillText(input, point.x, point.y);
    this.canvasManager.pushUndo();
  }

  private placeEmoji(point: Point) {
    const ctx = this.canvasManager.ctx;
    ctx.font = `${this.fontSize * 2}px serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(this.emoji, point.x - this.fontSize, point.y - this.fontSize);
    this.canvasManager.pushUndo();
  }


}
