import { rgbToHex } from '../utils';
import type { Tool } from './types';
import { DEFAULT_COLORS, EMOJI_LIST } from './types';

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
  undo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  redo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
};

const TOOL_TITLES: Record<Tool, string> = {
  select: 'Select',
  highlight: 'Highlight',
  draw: 'Draw',
  text: 'Text',
  arrow: 'Arrow',
  rectangle: 'Rectangle',
  blur: 'Blur',
  emoji: 'Emoji',
  eraser: 'Eraser',
};

export type ToolbarCallbacks = {
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onSizeChange: (size: number) => void;
  onFontSizeChange: (size: number) => void;
  onEmojiChange: (emoji: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onCancel: () => void;
};

function el(
  tag: string,
  attrs?: Record<string, string>,
  children?: (HTMLElement | string)[]
): HTMLElement {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') e.className = v;
      else e.setAttribute(k, v);
    }
  }
  if (children) {
    for (const c of children) {
      if (typeof c === 'string') {
        if (c.startsWith('<svg') || c.startsWith('<SVG')) {
          e.innerHTML += c;
        } else {
          e.appendChild(document.createTextNode(c));
        }
      } else {
        e.appendChild(c);
      }
    }
  }
  return e;
}

export function createToolbar(
  container: HTMLElement,
  callbacks: ToolbarCallbacks
): { setActiveTool: (t: Tool) => void; updateUndoRedo: (u: boolean, r: boolean) => void; setColor: (c: string) => void; setEmoji: (e: string) => void } {
  const tools: Tool[] = [
    'highlight',
    'draw',
    'text',
    'arrow',
    'rectangle',
    'blur',
    'emoji',
    'eraser',
  ];

  let activeTool: Tool = 'highlight';
  let activeColor = DEFAULT_COLORS[0];
  let activeEmoji = EMOJI_LIST[0];

  const panel = el('div', { className: 'pe-toolbar' });

  const toolGroup = el('div', { className: 'pe-tool-group' });
  const toolButtons: Record<string, HTMLElement> = {};

  for (const tool of tools) {
    const btn = el(
      'button',
      {
        className: 'pe-tool-btn' + (tool === activeTool ? ' active' : ''),
        title: TOOL_TITLES[tool],
      },
      [SVG_ICONS[tool]]
    );
    btn.addEventListener('click', () => {
      Object.values(toolButtons).forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTool = tool;
      callbacks.onToolChange(tool);
      updateVisibility();
    });
    toolButtons[tool] = btn;
    toolGroup.appendChild(btn);
  }
  panel.appendChild(toolGroup);

  const divider1 = el('div', { className: 'pe-divider' });
  panel.appendChild(divider1);

  const undoBtn = el(
    'button',
    { className: 'pe-tool-btn pe-undo-btn', title: 'Undo (Ctrl+Z)' },
    [SVG_ICONS['undo']]
  ) as HTMLButtonElement;
  undoBtn.addEventListener('click', callbacks.onUndo);
  const redoBtn = el(
    'button',
    { className: 'pe-tool-btn pe-redo-btn', title: 'Redo (Ctrl+Shift+Z)' },
    [SVG_ICONS['redo']]
  ) as HTMLButtonElement;
  redoBtn.addEventListener('click', callbacks.onRedo);
  panel.appendChild(undoBtn);
  panel.appendChild(redoBtn);

  const divider2 = el('div', { className: 'pe-divider' });
  panel.appendChild(divider2);

  const colorSection = el('div', { className: 'pe-color-section' });
  const colorSwatches = el('div', { className: 'pe-color-swatches' });
  const swatchEls: HTMLElement[] = [];
  for (const c of DEFAULT_COLORS) {
    const sw = el('button', {
      className: 'pe-color-swatch' + (c === activeColor ? ' active' : ''),
    });
    sw.style.background = c;
    sw.addEventListener('click', () => {
      swatchEls.forEach((s) => s.classList.remove('active'));
      sw.classList.add('active');
      activeColor = c;
      callbacks.onColorChange(c);
    });
    swatchEls.push(sw);
    colorSwatches.appendChild(sw);
  }
  colorSection.appendChild(colorSwatches);

  const sizeRow = el('div', { className: 'pe-size-row' });
  const sizeLabel = el('span', { className: 'pe-size-label' }, ['Size']);
  const sizeSlider = el('input', {
    className: 'pe-size-slider',
    type: 'range',
    min: '1',
    max: '20',
    value: '4',
  }) as HTMLInputElement;
  const sizeValue = el('span', { className: 'pe-size-value' }, ['4']);
  sizeSlider.addEventListener('input', () => {
    const v = parseInt(sizeSlider.value);
    sizeValue.textContent = String(v);
    callbacks.onSizeChange(v);
  });
  sizeRow.appendChild(sizeLabel);
  sizeRow.appendChild(sizeSlider);
  sizeRow.appendChild(sizeValue);
  colorSection.appendChild(sizeRow);

  const fontSizeRow = el('div', { className: 'pe-size-row pe-font-size-row' });
  const fontSizeLabel = el('span', { className: 'pe-size-label' }, ['Font']);
  const fontSizeSlider = el('input', {
    className: 'pe-size-slider',
    type: 'range',
    min: '12',
    max: '72',
    value: '24',
  }) as HTMLInputElement;
  const fontSizeValue = el('span', { className: 'pe-size-value' }, ['24']);
  fontSizeSlider.addEventListener('input', () => {
    const v = parseInt(fontSizeSlider.value);
    fontSizeValue.textContent = String(v);
    callbacks.onFontSizeChange(v);
  });
  fontSizeRow.appendChild(fontSizeLabel);
  fontSizeRow.appendChild(fontSizeSlider);
  fontSizeRow.appendChild(fontSizeValue);
  colorSection.appendChild(fontSizeRow);

  const emojiSection = el('div', { className: 'pe-emoji-section' });
  const emojiGrid = el('div', { className: 'pe-emoji-grid' });
  const emojiBtns: HTMLElement[] = [];
  for (const e of EMOJI_LIST) {
    const eb = el(
      'button',
      {
        className: 'pe-emoji-btn' + (e === activeEmoji ? ' active' : ''),
      },
      [e]
    );
    eb.addEventListener('click', () => {
      emojiBtns.forEach((b) => b.classList.remove('active'));
      eb.classList.add('active');
      activeEmoji = e;
      callbacks.onEmojiChange(e);
    });
    emojiBtns.push(eb);
    emojiGrid.appendChild(eb);
  }
  emojiSection.appendChild(emojiGrid);
  colorSection.appendChild(emojiSection);
  panel.appendChild(colorSection);

  const actionGroup = el('div', { className: 'pe-action-group' });
  const cancelBtn = el('button', { className: 'pe-btn pe-btn-cancel' }, [
    'Cancel',
  ]);
  cancelBtn.addEventListener('click', callbacks.onCancel);
  const saveBtn = el('button', { className: 'pe-btn pe-btn-save' }, [
    'Save to Drive',
  ]);
  saveBtn.addEventListener('click', callbacks.onSave);
  actionGroup.appendChild(cancelBtn);
  actionGroup.appendChild(saveBtn);
  panel.appendChild(actionGroup);

  container.appendChild(panel);

  function updateVisibility() {
    const isColorTool = ['highlight', 'draw', 'arrow', 'rectangle', 'eraser'].includes(activeTool);
    const isTextTool = activeTool === 'text';
    const isEmojiTool = activeTool === 'emoji';
    const isBlurTool = activeTool === 'blur';

    colorSwatches.style.display = isColorTool ? 'flex' : 'none';
    (sizeRow as HTMLElement).style.display =
      isColorTool || isTextTool || isBlurTool ? 'flex' : 'none';
    (fontSizeRow as HTMLElement).style.display = isTextTool ? 'flex' : 'none';
    (emojiSection as HTMLElement).style.display = isEmojiTool ? 'flex' : 'none';
  }

  function updateUndoRedo(canUndo: boolean, canRedo: boolean) {
    undoBtn.disabled = !canUndo;
    redoBtn.disabled = !canRedo;
    undoBtn.style.opacity = canUndo ? '1' : '0.3';
    redoBtn.style.opacity = canRedo ? '1' : '0.3';
  }

  updateVisibility();

  return {
    setActiveTool: (t: Tool) => {
      activeTool = t;
      Object.values(toolButtons).forEach((b) => b.classList.remove('active'));
      if (toolButtons[t]) toolButtons[t].classList.add('active');
      updateVisibility();
    },
    updateUndoRedo,
    setColor: (c: string) => {
      activeColor = c;
      swatchEls.forEach((s) => {
        s.classList.toggle('active', s.style.background === c || rgbToHex(s.style.background) === c);
      });
    },
    setEmoji: (e: string) => {
      activeEmoji = e;
      emojiBtns.forEach((b) => {
        b.classList.toggle('active', b.textContent === e);
      });
    },
  };
}
