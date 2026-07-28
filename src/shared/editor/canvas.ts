import type { Point } from './types';

export class CanvasManager {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private baseCanvas: HTMLCanvasElement;
  private baseCtx: CanvasRenderingContext2D;
  private overlayCanvas: HTMLCanvasElement;
  overlayCtx: CanvasRenderingContext2D;
  private undoStack: ImageData[] = [];
  private redoStack: ImageData[] = [];
  private maxUndoSteps = 20;
  private _width = 0;
  private _height = 0;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;image-rendering:pixelated;max-width:100%;max-height:100%;';

    this.baseCanvas = document.createElement('canvas');
    this.baseCtx = this.baseCanvas.getContext('2d')!;

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.style.cssText =
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);image-rendering:pixelated;max-width:100%;max-height:100%;pointer-events:none;';
    this.overlayCtx = this.overlayCanvas.getContext('2d')!;

    const wrapper = document.createElement('div');
    wrapper.style.cssText =
      'position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;width:100%;height:100%;';
    wrapper.appendChild(this.canvas);
    wrapper.appendChild(this.overlayCanvas);
    container.appendChild(wrapper);

    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  get width() {
    return this._width;
  }
  get height() {
    return this._height;
  }

  loadImage(source: string | HTMLImageElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this._width = img.naturalWidth;
        this._height = img.naturalHeight;
        this.canvas.width = this._width;
        this.canvas.height = this._height;
        this.baseCanvas.width = this._width;
        this.baseCanvas.height = this._height;
        this.overlayCanvas.width = this._width;
        this.overlayCanvas.height = this._height;

        this.baseCtx.drawImage(img, 0, 0);
        this.ctx.drawImage(img, 0, 0);
        this.pushUndo();
        resolve();
      };
      img.onerror = reject;
      if (typeof source === 'string') {
        img.src = source;
      } else {
        img.src = source.src;
      }
    });
  }

  loadImageData(imageData: ImageData) {
    this._width = imageData.width;
    this._height = imageData.height;
    this.canvas.width = this._width;
    this.canvas.height = this._height;
    this.baseCanvas.width = this._width;
    this.baseCanvas.height = this._height;
    this.overlayCanvas.width = this._width;
    this.overlayCanvas.height = this._height;

    this.baseCtx.putImageData(imageData, 0, 0);
    this.ctx.putImageData(imageData, 0, 0);
    this.pushUndo();
  }

  resize(width: number, height: number) {
    const imageData = this.ctx.getImageData(0, 0, this._width, this._height);
    this._width = width;
    this._height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.baseCanvas.width = width;
    this.baseCanvas.height = height;
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
    this.baseCtx.putImageData(
      imageData,
      0,
      0,
      0,
      0,
      Math.min(imageData.width, width),
      Math.min(imageData.height, height)
    );
    this.ctx.drawImage(this.baseCanvas, 0, 0);
  }

  clearOverlay() {
    this.overlayCtx.clearRect(0, 0, this._width, this._height);
  }

  flushOverlay() {
    this.ctx.drawImage(this.overlayCanvas, 0, 0);
    this.clearOverlay();
  }

  pushUndo() {
    const data = this.ctx.getImageData(0, 0, this._width, this._height);
    this.undoStack.push(data);
    if (this.undoStack.length > this.maxUndoSteps) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(): boolean {
    if (this.undoStack.length <= 1) return false;
    const current = this.undoStack.pop()!;
    this.redoStack.push(current);
    const prev = this.undoStack[this.undoStack.length - 1];
    this.ctx.putImageData(prev, 0, 0);
    this.baseCtx.putImageData(prev, 0, 0);
    return true;
  }

  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const next = this.redoStack.pop()!;
    this.undoStack.push(next);
    this.ctx.putImageData(next, 0, 0);
    this.baseCtx.putImageData(next, 0, 0);
    return true;
  }

  canUndo() {
    return this.undoStack.length > 1;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  getCanvasPoint(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this._width / rect.width;
    const scaleY = this._height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  toBlob(type = 'image/png'): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      }, type);
    });
  }

  toBase64(): string {
    return this.canvas.toDataURL('image/png').split(',')[1];
  }

  destroy() {
    this.canvas.remove();
    this.overlayCanvas.remove();
  }
}
