/// <reference types="chrome" />

function distToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

let overlay: HTMLDivElement | null = null;
let selection: HTMLDivElement | null = null;
let isDrawing = false;
let startX = 0;
let startY = 0;

const DEFAULT_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#007AFF', '#5856D6', '#AF52DE', '#FF2D55',
  '#FFFFFF', '#000000', '#8E8E93', '#F2F2F7',
];

const SVG_ICONS: Record<string, string> = {
  highlight:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.3"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
  draw: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
  text: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="12 5 19 5 19 12"/></svg>',
  rectangle:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
  blur: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" opacity="0.5"/><circle cx="12" cy="12" r="5" opacity="0.3"/><circle cx="12" cy="12" r="1"/></svg>',
  emoji: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
  eraser:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>',
  select: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  redo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
};

type EditorElement = {
  id: number;
  type: string;
  color?: string;
  lineWidth?: number;
  fontSize?: number;
  text?: string;
  emoji?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  points?: { x: number; y: number }[];
  pixelSize?: number;
  opacity?: number;
};

let editorCanvas: HTMLCanvasElement;
let editorCtx: CanvasRenderingContext2D;
let baseImage: HTMLImageElement | null = null;
let activeTool = 'highlight';
let activeColor = DEFAULT_COLORS[0];
let lineWidth = 4;
let fontSize = 24;
let elements: EditorElement[] = [];
let selectedId: number | null = null;
let isEditorDrawing = false;
let editorStart = { x: 0, y: 0 };
let currentElement: EditorElement | null = null;
let dragOffset = { x: 0, y: 0 };
let isDragging = false;
let nextId = 1;
let undoStack: EditorElement[][] = [];
let redoStack: EditorElement[][] = [];

function createOverlay() {
  const existing = document.getElementById('pramana-area-overlay');
  if (existing) existing.remove();
  overlay = document.createElement('div');
  overlay.id = 'pramana-area-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.3); z-index: 999999;
  `;
  document.body.appendChild(overlay);
  document.body.style.cursor = 'crosshair';
  overlay.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function onMouseDown(e: MouseEvent) {
  isDrawing = true;
  startX = e.clientX;
  startY = e.clientY;
  selection = document.createElement('div');
  selection.style.cssText = `
    position: fixed; left: ${startX}px; top: ${startY}px;
    width: 0px; height: 0px; border: 2px dashed #fff;
    background: rgba(255, 255, 255, 0.1);
    pointer-events: none; z-index: 1000000;
  `;
  document.body.appendChild(selection);
}

function onMouseMove(e: MouseEvent) {
  if (!isDrawing || !selection) return;
  selection.style.left = `${Math.min(startX, e.clientX)}px`;
  selection.style.top = `${Math.min(startY, e.clientY)}px`;
  selection.style.width = `${Math.abs(e.clientX - startX)}px`;
  selection.style.height = `${Math.abs(e.clientY - startY)}px`;
}

function onMouseUp(e: MouseEvent) {
  if (!isDrawing) return;
  isDrawing = false;
  const width = Math.abs(e.clientX - startX);
  const height = Math.abs(e.clientY - startY);

  if (selection) { selection.remove(); selection = null; }
  cleanupOverlay();

  if (width > 10 && height > 10) {
    const area = {
      x: Math.min(startX, e.clientX),
      y: Math.min(startY, e.clientY),
      width,
      height,
    };

    void document.body.offsetHeight;
    setTimeout(() => {
      try {
        chrome.runtime.sendMessage(
          { type: 'CAPTURE_AREA', payload: area },
          (response) => {
            if (chrome.runtime.lastError) {
              showNotification('Extension was reloaded. Please refresh the page.');
              return;
            }
            if (response?.success && response.base64) {
              cropAndOpenEditor(response.base64, area);
            } else {
              showNotification('Capture failed: ' + (response?.error || 'Unknown'));
            }
          }
        );
      } catch {
        showNotification('Extension was reloaded. Please refresh the page.');
      }
    }, 200);
  }
}

function cropAndOpenEditor(base64: string, area: { x: number; y: number; width: number; height: number }) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const imgDpr = img.naturalWidth / window.innerWidth;
    canvas.width = area.width * imgDpr;
    canvas.height = area.height * imgDpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, area.x * imgDpr, area.y * imgDpr, area.width * imgDpr, area.height * imgDpr, 0, 0, canvas.width, canvas.height);
    const croppedBase64 = canvas.toDataURL('image/png').split(',')[1];
    openEditorModal(croppedBase64);
  };
  img.src = 'data:image/png;base64,' + base64;
}

function openEditorModal(imageBase64: string) {
  closeEditorModal();

  const modal = document.createElement('div');
  modal.id = 'pramana-editor-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: #0d1117; z-index: 9999999;
    display: flex; flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #e6edf3;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px; background: #161b22; border-bottom: 1px solid #30363d; flex-shrink: 0;
  `;
  const title = document.createElement('div');
  title.style.cssText = 'font-size: 16px; font-weight: 600;';
  title.textContent = 'Pramana Editor';
  header.appendChild(title);

  const headerBtns = document.createElement('div');
  headerBtns.style.cssText = 'display: flex; gap: 8px;';
  const backBtn = document.createElement('button');
  backBtn.textContent = '\u2190 Back';
  backBtn.style.cssText = 'background:transparent;border:1px solid #30363d;color:#e6edf3;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;';
  backBtn.onclick = closeEditorModal;
  headerBtns.appendChild(backBtn);

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save to Drive';
  saveBtn.style.cssText = 'background:#238636;border:1px solid #2ea043;color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;';
  saveBtn.onclick = () => saveEditedImage(saveBtn);
  headerBtns.appendChild(saveBtn);
  header.appendChild(headerBtns);
  modal.appendChild(header);

  const body = document.createElement('div');
  body.style.cssText = 'flex: 1; display: flex; overflow: hidden;';
  modal.appendChild(body);

  body.appendChild(buildToolbar());

  const canvasArea = document.createElement('div');
  canvasArea.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center; overflow: auto; padding: 20px; background: #0d1117;';
  body.appendChild(canvasArea);

  document.body.appendChild(modal);

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position: relative; display: inline-block;';

  editorCanvas = document.createElement('canvas');
  editorCanvas.style.cssText = 'display: block; max-width: 100%; max-height: calc(100vh - 80px);';
  editorCtx = editorCanvas.getContext('2d', { willReadFrequently: true })!;

  wrapper.appendChild(editorCanvas);
  canvasArea.appendChild(wrapper);

  baseImage = new Image();
  baseImage.onload = () => {
    editorCanvas.width = baseImage!.naturalWidth;
    editorCanvas.height = baseImage!.naturalHeight;
    elements = [];
    selectedId = null;
    undoStack = [];
    redoStack = [];
    nextId = 1;
    renderCanvas();
  };
  baseImage.src = 'data:image/png;base64,' + imageBase64;

  editorCanvas.addEventListener('mousedown', onEditorMouseDown);
  editorCanvas.addEventListener('mousemove', onEditorMouseMove);
  editorCanvas.addEventListener('mouseup', onEditorMouseUp);
  editorCanvas.addEventListener('mouseleave', onEditorMouseUp);
  document.addEventListener('keydown', onEditorKeyDown);
}

function renderCanvas() {
  if (!baseImage || !editorCtx) return;
  const w = editorCanvas.width;
  const h = editorCanvas.height;
  editorCtx.clearRect(0, 0, w, h);
  editorCtx.drawImage(baseImage, 0, 0, w, h);

  for (const el of elements) {
    renderElement(editorCtx, el);
  }

  if (selectedId !== null) {
    const sel = elements.find((e) => e.id === selectedId);
    if (sel) drawSelectionHandles(sel);
  }
}

function renderElement(ctx: CanvasRenderingContext2D, el: EditorElement) {
  ctx.save();
  switch (el.type) {
    case 'highlight':
      ctx.fillStyle = (el.color || '#FF3B30') + '4D';
      ctx.fillRect(el.x!, el.y!, el.width!, el.height!);
      break;
    case 'rectangle':
      ctx.strokeStyle = el.color || '#FF3B30';
      ctx.lineWidth = el.lineWidth || 4;
      ctx.lineJoin = 'round';
      ctx.strokeRect(el.x!, el.y!, el.width!, el.height!);
      break;
    case 'arrow':
      drawArrow(ctx, el.x1!, el.y1!, el.x2!, el.y2!, el.color || '#FF3B30', el.lineWidth || 4);
      break;
    case 'text':
      ctx.font = `${el.fontSize || 24}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = el.color || '#FF3B30';
      ctx.textBaseline = 'top';
      ctx.fillText(el.text || '', el.x!, el.y!);
      break;
    case 'emoji':
      ctx.font = `${(el.fontSize || 48)}px serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(el.emoji || '', el.x!, el.y!);
      break;
    case 'draw':
      if (el.points && el.points.length > 1) {
        ctx.strokeStyle = el.color || '#FF3B30';
        ctx.lineWidth = el.lineWidth || 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
      }
      break;
    case 'blur':
      applyBlur(ctx, el.x!, el.y!, el.width!, el.height!, el.pixelSize || 10);
      break;
  }
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, lw: number) {
  const headLength = 15 + lw * 2;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function applyBlur(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pixelSize: number) {
  if (w < 2 || h < 2) return;
  const temp = document.createElement('canvas');
  temp.width = w;
  temp.height = h;
  const tempCtx = temp.getContext('2d')!;
  tempCtx.drawImage(editorCanvas, x, y, w, h, 0, 0, w, h);
  const smallW = Math.max(1, Math.floor(w / pixelSize));
  const smallH = Math.max(1, Math.floor(h / pixelSize));
  const small = document.createElement('canvas');
  small.width = smallW;
  small.height = smallH;
  const smallCtx = small.getContext('2d')!;
  smallCtx.drawImage(temp, 0, 0, smallW, smallH);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, smallW, smallH, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
}

function drawSelectionHandles(el: EditorElement) {
  const ctx = editorCtx;
  ctx.save();
  ctx.strokeStyle = '#1f6feb';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);

  if (el.type === 'draw' && el.points && el.points.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of el.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = (el.lineWidth || 4) + 4;
    ctx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);
  } else if (el.type === 'text' || el.type === 'emoji') {
    const pad = 4;
    ctx.strokeRect(el.x! - pad, el.y! - pad, (el.width || 100) + pad * 2, (el.height || 30) + pad * 2);
  } else if (el.type === 'arrow') {
    const pad = 10;
    const minX = Math.min(el.x1!, el.x2!) - pad;
    const minY = Math.min(el.y1!, el.y2!) - pad;
    const maxX = Math.max(el.x1!, el.x2!) + pad;
    const maxY = Math.max(el.y1!, el.y2!) + pad;
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
  } else {
    const pad = 4;
    ctx.strokeRect(el.x! - pad, el.y! - pad, el.width! + pad * 2, el.height! + pad * 2);
  }

  ctx.setLineDash([]);
  ctx.restore();
}

function hitTest(pt: { x: number; y: number }): number | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    const hit = hitTestElement(pt, el);
    if (hit) return el.id;
  }
  return null;
}

function hitTestElement(pt: { x: number; y: number }, el: EditorElement): boolean {
  const margin = 8;
  switch (el.type) {
    case 'highlight':
    case 'rectangle':
    case 'blur':
      return pt.x >= el.x! - margin && pt.x <= el.x! + el.width! + margin &&
             pt.y >= el.y! - margin && pt.y <= el.y! + el.height! + margin;
    case 'arrow': {
      const minX = Math.min(el.x1!, el.x2!) - margin;
      const minY = Math.min(el.y1!, el.y2!) - margin;
      const maxX = Math.max(el.x1!, el.x2!) + margin;
      const maxY = Math.max(el.y1!, el.y2!) + margin;
      if (pt.x < minX || pt.x > maxX || pt.y < minY || pt.y > maxY) return false;
      const dist = distToSegment(pt, { x: el.x1!, y: el.y1! }, { x: el.x2!, y: el.y2! });
      return dist < margin + (el.lineWidth || 4);
    }
    case 'text':
    case 'emoji':
      return pt.x >= el.x! - margin && pt.x <= el.x! + (el.width || 100) + margin &&
             pt.y >= el.y! - margin && pt.y <= el.y! + (el.height || 30) + margin;
    case 'draw': {
      if (!el.points || el.points.length === 0) return false;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of el.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const pad = (el.lineWidth || 4) + margin;
      return pt.x >= minX - pad && pt.x <= maxX + pad && pt.y >= minY - pad && pt.y <= maxY + pad;
    }
    default:
      return false;
  }
}



function pushUndo() {
  undoStack.push(JSON.parse(JSON.stringify(elements)));
  if (undoStack.length > 30) undoStack.shift();
  redoStack = [];
}

function doUndo() {
  if (undoStack.length === 0) return;
  redoStack.push(JSON.parse(JSON.stringify(elements)));
  elements = undoStack.pop()!;
  selectedId = null;
  renderCanvas();
}

function doRedo() {
  if (redoStack.length === 0) return;
  undoStack.push(JSON.parse(JSON.stringify(elements)));
  elements = redoStack.pop()!;
  selectedId = null;
  renderCanvas();
}

function getEditorPoint(e: MouseEvent) {
  const rect = editorCanvas.getBoundingClientRect();
  const sx = editorCanvas.width / rect.width;
  const sy = editorCanvas.height / rect.height;
  return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
}

function onEditorMouseDown(e: MouseEvent) {
  const pt = getEditorPoint(e);

  if (activeTool === 'select') {
    const hitId = hitTest(pt);
    selectedId = hitId;
    renderCanvas();
    if (hitId !== null) {
      isDragging = true;
      const el = elements.find((e) => e.id === hitId)!;
      if (el.type === 'arrow') {
        dragOffset = { x: pt.x - el.x1!, y: pt.y - el.y1! };
      } else {
        dragOffset = { x: pt.x - el.x!, y: pt.y - el.y! };
      }
    }
    return;
  }

  if (activeTool === 'eraser') {
    const hitId = hitTest(pt);
    if (hitId !== null) {
      pushUndo();
      elements = elements.filter((e) => e.id !== hitId);
      selectedId = null;
      renderCanvas();
    }
    return;
  }

  isEditorDrawing = true;
  editorStart = pt;
  const id = nextId++;

  if (activeTool === 'text') {
    const input = prompt('Enter text:');
    if (input) {
      pushUndo();
      editorCtx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      const metrics = editorCtx.measureText(input);
      elements.push({
        id, type: 'text', x: pt.x, y: pt.y,
        width: metrics.width, height: fontSize,
        text: input, color: activeColor, fontSize,
      });
      renderCanvas();
    }
    return;
  }

  if (activeTool === 'emoji') {
    pushUndo();
    elements.push({
      id, type: 'emoji', x: pt.x - 24, y: pt.y - 24,
      width: 48, height: 48, emoji: '\uD83D\uDD25', fontSize: 48,
    });
    renderCanvas();
    isEditorDrawing = false;
    return;
  }

  if (activeTool === 'draw') {
    currentElement = {
      id, type: 'draw', points: [{ x: pt.x, y: pt.y }],
      color: activeColor, lineWidth,
    };
    return;
  }

  if (activeTool === 'highlight') {
    currentElement = {
      id, type: 'highlight', x: pt.x, y: pt.y, width: 0, height: 0,
      color: activeColor, opacity: 0.3,
    };
    return;
  }

  if (activeTool === 'rectangle') {
    currentElement = {
      id, type: 'rectangle', x: pt.x, y: pt.y, width: 0, height: 0,
      color: activeColor, lineWidth,
    };
    return;
  }

  if (activeTool === 'arrow') {
    currentElement = {
      id, type: 'arrow', x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y,
      color: activeColor, lineWidth,
    };
    return;
  }

  if (activeTool === 'blur') {
    currentElement = {
      id, type: 'blur', x: pt.x, y: pt.y, width: 0, height: 0,
      pixelSize: Math.max(6, Math.floor(lineWidth * 2.5)),
    };
    return;
  }
}

function onEditorMouseMove(e: MouseEvent) {
  const pt = getEditorPoint(e);

  if (isDragging && selectedId !== null) {
    const el = elements.find((e) => e.id === selectedId)!;
    if (el.type === 'arrow') {
      const dx = pt.x - dragOffset.x - el.x1!;
      const dy = pt.y - dragOffset.y - el.y1!;
      el.x1! += dx;
      el.y1! += dy;
      el.x2! += dx;
      el.y2! += dy;
    } else if (el.type === 'draw' && el.points) {
      let minX = Infinity, minY = Infinity;
      for (const p of el.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
      }
      const dx = pt.x - dragOffset.x - minX;
      const dy = pt.y - dragOffset.y - minY;
      for (const p of el.points) {
        p.x += dx;
        p.y += dy;
      }
    } else {
      el.x = pt.x - dragOffset.x;
      el.y = pt.y - dragOffset.y;
    }
    renderCanvas();
    return;
  }

  if (!isEditorDrawing || !currentElement) return;

  if (currentElement.type === 'draw') {
    currentElement.points!.push({ x: pt.x, y: pt.y });
    renderCanvas();
    return;
  }

  const x = Math.min(editorStart.x, pt.x);
  const y = Math.min(editorStart.y, pt.y);
  const w = Math.abs(pt.x - editorStart.x);
  const h = Math.abs(pt.y - editorStart.y);

  if (currentElement.type === 'arrow') {
    currentElement.x2 = pt.x;
    currentElement.y2 = pt.y;
  } else {
    currentElement.x = x;
    currentElement.y = y;
    currentElement.width = w;
    currentElement.height = h;
  }

  renderCanvas();
  if (currentElement.type !== 'draw') {
    renderElement(editorCtx, currentElement);
  }
}

function onEditorMouseUp(_e: MouseEvent) {
  if (isDragging) {
    isDragging = false;
    pushUndo();
    return;
  }

  if (!isEditorDrawing || !currentElement) return;
  isEditorDrawing = false;

  pushUndo();
  elements.push(currentElement);
  currentElement = null;
  renderCanvas();
}

function onEditorKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    doUndo();
  } else if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
    e.preventDefault();
    doRedo();
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId !== null) {
    e.preventDefault();
    pushUndo();
    elements = elements.filter((el) => el.id !== selectedId);
    selectedId = null;
    renderCanvas();
  } else if (e.key === 'Escape') {
    selectedId = null;
    renderCanvas();
  }
}

function buildToolbar(): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = `
    width: 260px; background: #161b22; border-right: 1px solid #30363d;
    overflow-y: auto; flex-shrink: 0; padding: 12px; display: flex; flex-direction: column; gap: 10px;
  `;

  const toolGroup = document.createElement('div');
  toolGroup.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px;';
  const tools = ['select', 'highlight', 'draw', 'text', 'arrow', 'rectangle', 'blur', 'emoji', 'eraser'];
  const toolBtns: HTMLElement[] = [];

  for (const tool of tools) {
    const btn = document.createElement('button');
    btn.innerHTML = SVG_ICONS[tool];
    btn.style.cssText = 'width:36px;height:36px;background:transparent;border:1px solid transparent;border-radius:6px;color:#8b949e;cursor:pointer;display:flex;align-items:center;justify-content:center;';
    btn.title = tool.charAt(0).toUpperCase() + tool.slice(1);
    if (tool === activeTool) {
      btn.style.background = '#1f6feb';
      btn.style.color = '#fff';
      btn.style.borderColor = '#1f6feb';
    }
    btn.addEventListener('click', () => {
      activeTool = tool;
      selectedId = null;
      toolBtns.forEach((b) => {
        b.style.background = 'transparent';
        b.style.color = '#8b949e';
        b.style.borderColor = 'transparent';
      });
      btn.style.background = '#1f6feb';
      btn.style.color = '#fff';
      btn.style.borderColor = '#1f6feb';
      editorCanvas.style.cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';
      renderCanvas();
    });
    toolBtns.push(btn);
    toolGroup.appendChild(btn);
  }
  panel.appendChild(toolGroup);

  panel.appendChild(createDivider());

  const undoRedo = document.createElement('div');
  undoRedo.style.cssText = 'display:flex;gap:4px;';
  const undoBtn = document.createElement('button');
  undoBtn.innerHTML = SVG_ICONS['undo'];
  undoBtn.style.cssText = 'width:36px;height:36px;background:transparent;border:1px solid transparent;border-radius:6px;color:#8b949e;cursor:pointer;display:flex;align-items:center;justify-content:center;';
  undoBtn.title = 'Undo (Ctrl+Z)';
  undoBtn.addEventListener('click', doUndo);
  const redoBtn = document.createElement('button');
  redoBtn.innerHTML = SVG_ICONS['redo'];
  redoBtn.style.cssText = 'width:36px;height:36px;background:transparent;border:1px solid transparent;border-radius:6px;color:#8b949e;cursor:pointer;display:flex;align-items:center;justify-content:center;';
  redoBtn.title = 'Redo (Ctrl+Shift+Z)';
  redoBtn.addEventListener('click', doRedo);
  undoRedo.appendChild(undoBtn);
  undoRedo.appendChild(redoBtn);
  panel.appendChild(undoRedo);

  panel.appendChild(createDivider());

  const colorLabel = document.createElement('div');
  colorLabel.textContent = 'Color';
  colorLabel.style.cssText = 'font-size:11px;color:#8b949e;';
  panel.appendChild(colorLabel);

  const swatches = document.createElement('div');
  swatches.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
  const swatchEls: HTMLElement[] = [];
  for (const c of DEFAULT_COLORS) {
    const sw = document.createElement('button');
    sw.style.cssText = `width:22px;height:22px;border-radius:4px;border:2px solid ${c === activeColor ? '#fff' : 'transparent'};cursor:pointer;background:${c};`;
    sw.addEventListener('click', () => {
      activeColor = c;
      swatchEls.forEach((s) => (s.style.borderColor = 'transparent'));
      sw.style.borderColor = '#fff';
    });
    swatchEls.push(sw);
    swatches.appendChild(sw);
  }
  panel.appendChild(swatches);

  const sizeRow = document.createElement('div');
  sizeRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
  const sLabel = document.createElement('span');
  sLabel.textContent = 'Size';
  sLabel.style.cssText = 'font-size:11px;color:#8b949e;width:30px;';
  const sizeSlider = document.createElement('input');
  sizeSlider.type = 'range';
  sizeSlider.min = '1';
  sizeSlider.max = '20';
  sizeSlider.value = String(lineWidth);
  sizeSlider.style.cssText = 'flex:1;accent-color:#1f6feb;';
  const sizeVal = document.createElement('span');
  sizeVal.textContent = String(lineWidth);
  sizeVal.style.cssText = 'font-size:11px;color:#8b949e;width:24px;text-align:right;';
  sizeSlider.addEventListener('input', () => {
    lineWidth = parseInt(sizeSlider.value);
    sizeVal.textContent = String(lineWidth);
  });
  sizeRow.appendChild(sLabel);
  sizeRow.appendChild(sizeSlider);
  sizeRow.appendChild(sizeVal);
  panel.appendChild(sizeRow);

  const fontSizeRow = document.createElement('div');
  fontSizeRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
  const fLabel = document.createElement('span');
  fLabel.textContent = 'Font';
  fLabel.style.cssText = 'font-size:11px;color:#8b949e;width:30px;';
  const fontSlider = document.createElement('input');
  fontSlider.type = 'range';
  fontSlider.min = '12';
  fontSlider.max = '72';
  fontSlider.value = String(fontSize);
  fontSlider.style.cssText = 'flex:1;accent-color:#1f6feb;';
  const fontVal = document.createElement('span');
  fontVal.textContent = String(fontSize);
  fontVal.style.cssText = 'font-size:11px;color:#8b949e;width:24px;text-align:right;';
  fontSlider.addEventListener('input', () => {
    fontSize = parseInt(fontSlider.value);
    fontVal.textContent = String(fontSize);
  });
  fontSizeRow.appendChild(fLabel);
  fontSizeRow.appendChild(fontSlider);
  fontSizeRow.appendChild(fontVal);
  panel.appendChild(fontSizeRow);

  return panel;
}

function createDivider(): HTMLElement {
  const d = document.createElement('div');
  d.style.cssText = 'height:1px;background:#30363d;';
  return d;
}

function saveEditedImage(saveBtn: HTMLButtonElement) {
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  selectedId = null;
  renderCanvas();
  editorCanvas.toBlob((blob) => {
    if (!blob) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1];
      try {
        chrome.runtime.sendMessage(
          {
            type: 'UPLOAD_FILE',
            payload: {
              fileBase64: b64,
              metadata: { name: `screenshot-edited-${Date.now()}.png`, type: 'screenshot' },
            },
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              showNotification('Extension was reloaded. Please refresh.');
              return;
            }
            if (resp?.success) {
              showNotification('Screenshot saved to Google Drive!');
              closeEditorModal();
            } else {
              showNotification('Upload failed: ' + (resp?.error || 'Unknown'));
              saveBtn.disabled = false;
              saveBtn.textContent = 'Save to Drive';
            }
          }
        );
      } catch {
        showNotification('Extension was reloaded. Please refresh.');
      }
    };
    reader.readAsDataURL(blob);
  }, 'image/png');
}

function closeEditorModal() {
  const modal = document.getElementById('pramana-editor-modal');
  if (modal) modal.remove();
  document.removeEventListener('keydown', onEditorKeyDown);
  elements = [];
  undoStack = [];
  redoStack = [];
  selectedId = null;
  baseImage = null;
  const leftover = document.getElementById('pramana-area-overlay');
  if (leftover) leftover.remove();
  document.body.style.cursor = '';
}

function showNotification(text: string) {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; background: #1a1a2e;
    color: #fff; padding: 12px 20px; border-radius: 8px; border: 1px solid #16213e;
    z-index: 9999999; font-family: -apple-system, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  div.textContent = text;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

function cleanupOverlay() {
  if (overlay) {
    overlay.removeEventListener('mousedown', onMouseDown);
    overlay.remove();
    overlay = null;
  }
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
  document.body.style.cursor = '';
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CAPTURE_AREA_SELECT') {
    createOverlay();
    sendResponse({ success: true });
  }
  return true;
});
