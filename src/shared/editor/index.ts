import { DEFAULT_COLORS, DEFAULT_TOOL, EMOJI_LIST, TOOLS } from './types';
import type { EditorController, EditorElement, EditorOptions, Point, Tool } from './types';
import { hitTest, isTooSmall, moveElement, normalizeRect, renderElement, renderSelection, TEXT_FONT } from './elements';
import { ICONS } from './icons';
import { EDITOR_CSS } from './styles';
import { copyImageToClipboard } from '../clipboard';

const MAX_UNDO = 30;

const TOOL_TITLES: Record<Tool, string> = {
  select: 'Select & move (V)',
  highlight: 'Highlight (H)',
  draw: 'Draw (P)',
  text: 'Text (T)',
  arrow: 'Arrow (A)',
  rectangle: 'Rectangle (R)',
  blur: 'Blur (B)',
  emoji: 'Emoji (E)',
  eraser: 'Eraser (X)',
};

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select', h: 'highlight', p: 'draw', t: 'text', a: 'arrow', r: 'rectangle', b: 'blur', e: 'emoji', x: 'eraser',
};

const TOOL_HINTS: Record<Tool, string> = {
  select: 'Click an annotation to select it, drag to move it, Delete to remove it.',
  highlight: 'Drag to highlight an area.',
  draw: 'Drag to draw freehand.',
  text: 'Click where the text should go, type, then press Enter.',
  arrow: 'Drag from the start of the arrow to its tip.',
  rectangle: 'Drag to draw a box.',
  blur: 'Drag over anything sensitive to pixelate it.',
  emoji: 'Pick an emoji, then click to place it.',
  eraser: 'Click an annotation to remove it.',
};

const COLOR_TOOLS: Tool[] = ['highlight', 'draw', 'text', 'arrow', 'rectangle'];
const SIZE_TOOLS: Tool[] = ['draw', 'arrow', 'rectangle'];

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children);
  return el;
}

function slider(label: string, min: number, max: number, value: number, onInput: (v: number) => void) {
  const input = h('input', { type: 'range', min: String(min), max: String(max), value: String(value) });
  const output = h('span', { textContent: String(value) });
  input.addEventListener('input', () => {
    output.textContent = input.value;
    onInput(Number(input.value));
  });
  return h('div', { className: 'pe-row' }, [h('span', { textContent: label }), input, output]);
}

/**
 * Object-based screenshot editor used both in the editor tab and in the on-page modal.
 * Annotations are stored as data, so they stay selectable, movable and deletable until saved.
 */
export function createEditor(container: HTMLElement | ShadowRoot, options: EditorOptions): EditorController {
  let tool: Tool = DEFAULT_TOOL;
  let color = DEFAULT_COLORS[0];
  let lineWidth = 4;
  let fontSize = 24;
  let emoji = EMOJI_LIST[0];

  let elements: EditorElement[] = [];
  let undoStack: EditorElement[][] = [];
  let redoStack: EditorElement[][] = [];
  let selectedId: number | null = null;
  let nextId = 1;
  let draft: EditorElement | null = null;
  let drag: { start: Point; before: EditorElement[]; moved: boolean } | null = null;
  let textInput: HTMLInputElement | null = null;
  let pendingText: { at: Point; color: string; fontSize: number } | null = null;
  let saving = false;
  let ready = false;
  let copyReset: ReturnType<typeof setTimeout> | undefined;

  // Header
  const cancelBtn = h('button', { className: 'pe-btn', textContent: options.cancelLabel || 'Cancel' });
  const copyBtn = h('button', { className: 'pe-btn', textContent: 'Copy image', title: 'Copy image (Ctrl+C)' });
  const saveBtn = h('button', { className: 'pe-btn pe-btn-primary', textContent: 'Save to Drive', title: 'Save to Drive (Ctrl+S)' });
  cancelBtn.addEventListener('click', () => options.onCancel());
  copyBtn.addEventListener('click', () => void copy());
  saveBtn.addEventListener('click', () => void save());
  const header = h('header', { className: 'pe-header' }, [
    h('span', { className: 'pe-title', textContent: options.title || 'Pramana Editor' }),
    h('div', { className: 'pe-header-actions' }, [cancelBtn, copyBtn, saveBtn]),
  ]);

  // Toolbar
  const toolButtons = {} as Record<Tool, HTMLButtonElement>;
  const toolGroup = h('div', { className: 'pe-tool-group' });
  for (const t of TOOLS) {
    const btn = h('button', { className: 'pe-tool-btn', title: TOOL_TITLES[t] });
    btn.innerHTML = ICONS[t];
    btn.dataset.tool = t;
    btn.addEventListener('click', () => setTool(t));
    toolButtons[t] = btn;
    toolGroup.append(btn);
  }

  const undoBtn = h('button', { className: 'pe-tool-btn', title: 'Undo (Ctrl+Z)' });
  undoBtn.innerHTML = ICONS.undo;
  undoBtn.addEventListener('click', () => undo());
  const redoBtn = h('button', { className: 'pe-tool-btn', title: 'Redo (Ctrl+Shift+Z)' });
  redoBtn.innerHTML = ICONS.redo;
  redoBtn.addEventListener('click', () => redo());

  const hint = h('p', { className: 'pe-hint' });

  const swatches = DEFAULT_COLORS.map((c) => {
    const sw = h('button', { className: 'pe-swatch', title: c });
    sw.style.background = c;
    sw.addEventListener('click', () => {
      color = c;
      swatches.forEach((s) => s.classList.toggle('active', s === sw));
    });
    return sw;
  });
  swatches[0].classList.add('active');
  const colorSection = h('div', { className: 'pe-section' }, [
    h('span', { className: 'pe-label', textContent: 'Color' }),
    h('div', { className: 'pe-swatches' }, swatches),
  ]);

  const sizeSection = h('div', { className: 'pe-section' }, [slider('Size', 1, 20, lineWidth, (v) => (lineWidth = v))]);
  const fontSection = h('div', { className: 'pe-section' }, [slider('Font', 12, 96, fontSize, (v) => (fontSize = v))]);

  const emojiButtons = EMOJI_LIST.map((e) => {
    const btn = h('button', { className: 'pe-emoji-btn', textContent: e });
    btn.addEventListener('click', () => {
      emoji = e;
      emojiButtons.forEach((b) => b.classList.toggle('active', b === btn));
    });
    return btn;
  });
  emojiButtons[0].classList.add('active');
  const emojiSection = h('div', { className: 'pe-section' }, [
    h('span', { className: 'pe-label', textContent: 'Emoji' }),
    h('div', { className: 'pe-emoji-grid' }, emojiButtons),
  ]);

  const toolbar = h('aside', { className: 'pe-toolbar' }, [
    toolGroup,
    h('div', { className: 'pe-divider' }),
    h('div', { className: 'pe-history-group' }, [undoBtn, redoBtn]),
    h('div', { className: 'pe-divider' }),
    hint,
    colorSection,
    sizeSection,
    fontSection,
    emojiSection,
  ]);

  // Canvas
  const canvas = h('canvas');
  const ctx = canvas.getContext('2d');
  const wrap = h('div', { className: 'pe-canvas-wrap' }, [canvas]);
  const stage = h('div', { className: 'pe-stage' }, [wrap]);

  const style = h('style', { textContent: EDITOR_CSS });
  const root = h('div', { className: 'pe-root' }, [style, header, h('div', { className: 'pe-body' }, [toolbar, stage])]);
  container.append(root);

  const image = new Image();
  image.onload = () => {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    ready = true;
    fit();
    render();
  };
  image.src = 'data:image/png;base64,' + options.imageBase64;

  // Scale the canvas down to fit the stage while keeping its full-resolution pixels
  function fit() {
    if (!ready) return;
    const scale = Math.min(1, (stage.clientWidth - 32) / canvas.width, (stage.clientHeight - 32) / canvas.height);
    if (!(scale > 0)) return;
    canvas.style.width = `${canvas.width * scale}px`;
    canvas.style.height = `${canvas.height * scale}px`;
  }
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  resizeObserver?.observe(stage);

  /** Canvas pixels per CSS pixel. */
  function pixelRatio() {
    const rect = canvas.getBoundingClientRect();
    return rect.width ? canvas.width / rect.width : 1;
  }

  function getPoint(e: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    const ratio = pixelRatio();
    return { x: (e.clientX - rect.left) * ratio, y: (e.clientY - rect.top) * ratio };
  }

  function render() {
    if (!ctx || !ready) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    for (const el of elements) renderElement(ctx, el);
    if (draft) renderElement(ctx, draft);
    const selected = elements.find((el) => el.id === selectedId);
    if (selected) renderSelection(ctx, selected, pixelRatio());
  }

  function updateHistoryButtons() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  function remember(previous: EditorElement[]) {
    undoStack = [...undoStack, previous].slice(-MAX_UNDO);
    redoStack = [];
  }

  // Element arrays are never mutated in place, so history can hold them directly
  function commit(next: EditorElement[]) {
    remember(elements);
    elements = next;
    render();
    updateHistoryButtons();
  }

  function undo() {
    commitText();
    const previous = undoStack.at(-1);
    if (!previous) return;
    undoStack = undoStack.slice(0, -1);
    redoStack = [...redoStack, elements];
    elements = previous;
    selectedId = null;
    render();
    updateHistoryButtons();
  }

  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    redoStack = redoStack.slice(0, -1);
    undoStack = [...undoStack, elements];
    elements = next;
    selectedId = null;
    render();
    updateHistoryButtons();
  }

  function setTool(next: Tool) {
    commitText();
    tool = next;
    if (next !== 'select') selectedId = null;
    for (const t of TOOLS) toolButtons[t].classList.toggle('active', t === next);
    hint.textContent = TOOL_HINTS[next];
    colorSection.hidden = !COLOR_TOOLS.includes(next);
    sizeSection.hidden = !SIZE_TOOLS.includes(next);
    fontSection.hidden = next !== 'text';
    emojiSection.hidden = next !== 'emoji';
    canvas.style.cursor = next === 'select' ? 'default' : next === 'text' ? 'text' : next === 'eraser' ? 'pointer' : 'crosshair';
    render();
  }

  function openTextInput(at: Point) {
    const ratio = pixelRatio();
    const input = h('input', { className: 'pe-text-input', type: 'text', placeholder: 'Type…' });
    input.style.left = `${at.x / ratio}px`;
    input.style.top = `${at.y / ratio}px`;
    input.style.fontSize = `${fontSize / ratio}px`;
    input.style.color = color;
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commitText();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelText();
      }
    });
    input.addEventListener('blur', () => commitText());
    pendingText = { at, color, fontSize };
    textInput = input;
    wrap.append(input);
    input.focus();
  }

  function cancelText() {
    const input = textInput;
    textInput = null;
    pendingText = null;
    input?.remove();
  }

  function commitText() {
    const input = textInput;
    const pending = pendingText;
    if (!input || !pending) return;
    const text = input.value.trim();
    cancelText();
    if (!text) return;
    let width = text.length * pending.fontSize * 0.6;
    if (ctx) {
      ctx.save();
      ctx.font = `${pending.fontSize}px ${TEXT_FONT}`;
      width = ctx.measureText(text)?.width ?? width;
      ctx.restore();
    }
    commit([
      ...elements,
      { id: nextId++, type: 'text', x: pending.at.x, y: pending.at.y, width, height: pending.fontSize * 1.2, text, color: pending.color, fontSize: pending.fontSize },
    ]);
  }

  function deleteSelected() {
    if (selectedId === null) return;
    const id = selectedId;
    selectedId = null;
    commit(elements.filter((el) => el.id !== id));
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    if (textInput) {
      commitText();
      return;
    }
    const pt = getPoint(e);

    switch (tool) {
      case 'select': {
        const hit = hitTest(elements, pt);
        selectedId = hit?.id ?? null;
        if (hit) drag = { start: pt, before: elements, moved: false };
        render();
        return;
      }
      case 'eraser': {
        const hit = hitTest(elements, pt);
        if (hit) commit(elements.filter((el) => el.id !== hit.id));
        return;
      }
      case 'text':
        openTextInput(pt);
        return;
      case 'emoji': {
        const size = fontSize * 2;
        commit([...elements, { id: nextId++, type: 'emoji', x: pt.x - size / 2, y: pt.y - size / 2, width: size, height: size, emoji, fontSize: size }]);
        return;
      }
      case 'draw':
        draft = { id: nextId++, type: 'draw', points: [pt], color, lineWidth };
        return;
      case 'arrow':
        draft = { id: nextId++, type: 'arrow', x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, color, lineWidth };
        return;
      default:
        draft = { id: nextId++, type: tool, x: pt.x, y: pt.y, width: 0, height: 0, color, lineWidth };
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (!drag && !draft) return;
    const pt = getPoint(e);

    if (drag) {
      const { start, before } = drag;
      elements = before.map((el) => (el.id === selectedId ? moveElement(el, pt.x - start.x, pt.y - start.y) : el));
      drag.moved = true;
    } else if (draft?.type === 'draw') {
      draft = { ...draft, points: [...draft.points, pt] };
    } else if (draft?.type === 'arrow') {
      draft = { ...draft, x2: pt.x, y2: pt.y };
    } else if (draft && 'width' in draft) {
      draft = { ...draft, width: pt.x - draft.x, height: pt.y - draft.y };
    }
    render();
  }

  function onMouseUp() {
    if (drag) {
      if (drag.moved) {
        remember(drag.before);
        updateHistoryButtons();
      }
      drag = null;
      return;
    }
    if (!draft) return;
    const done = draft;
    draft = null;
    if (isTooSmall(done)) {
      render();
      return;
    }
    commit([...elements, done.type === 'highlight' || done.type === 'rectangle' || done.type === 'blur' ? normalizeRect(done) : done]);
  }

  function onKeyDown(e: KeyboardEvent) {
    const target = e.composedPath()[0];
    if (target instanceof HTMLInputElement && target.type === 'text') return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    let handled = true;
    if (mod && key === 'z' && !e.shiftKey) undo();
    else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) redo();
    else if (mod && key === 's') void save();
    else if (mod && key === 'c' && !e.shiftKey) void copy();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId !== null) deleteSelected();
    else if (e.key === 'Escape' && selectedId !== null) {
      selectedId = null;
      render();
    } else if (!mod && !e.altKey && TOOL_KEYS[key]) setTool(TOOL_KEYS[key]);
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function getImageBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not export the image'))), 'image/png');
    });
  }

  async function copy() {
    commitText();
    selectedId = null;
    render();
    clearTimeout(copyReset);
    try {
      // Not awaited before writing: the clipboard needs the click's permission, which an await would lose
      await copyImageToClipboard(getImageBlob());
      copyBtn.textContent = 'Copied ✓';
    } catch (error) {
      console.error('Copy failed:', error);
      copyBtn.textContent = 'Copy failed';
      copyBtn.title = `${error instanceof Error ? error.message : error}. Save to Drive instead.`;
    }
    copyReset = setTimeout(() => {
      copyBtn.textContent = 'Copy image';
      copyBtn.title = 'Copy image (Ctrl+C)';
    }, 2000);
  }

  async function save() {
    if (saving) return;
    commitText();
    selectedId = null;
    render();
    saving = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await options.onSave(await getImageBlob());
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save to Drive';
    }
  }

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  // Capture phase so the editor gets shortcuts before the page underneath it
  window.addEventListener('keydown', onKeyDown, true);

  setTool(DEFAULT_TOOL);
  updateHistoryButtons();

  return {
    setTool,
    getTool: () => tool,
    getElements: () => elements,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    getImageBlob,
    save,
    copy,
    destroy() {
      clearTimeout(copyReset);
      cancelText();
      resizeObserver?.disconnect();
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown, true);
      root.remove();
    },
  };
}

export type { EditorController, EditorElement, EditorOptions, Tool };
export { DEFAULT_COLORS, DEFAULT_TOOL, EMOJI_LIST } from './types';
