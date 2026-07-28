import { CanvasManager } from './canvas';
import { ToolHandler } from './tools';
import { createToolbar } from './ui';
import type { EditorController, EditorOptions, Tool } from './types';

export function createEditor(
  container: HTMLElement,
  options: EditorOptions = {}
): EditorController {
  const cm = new CanvasManager(container);
  const th = new ToolHandler(cm);

  const toolbarEl = document.createElement('div');
  toolbarEl.className = 'pe-toolbar-wrapper';
  container.appendChild(toolbarEl);

  const toolbar = createToolbar(toolbarEl, {
    onToolChange: (tool: Tool) => th.setTool(tool),
    onColorChange: (color: string) => th.setColor(color),
    onSizeChange: (size: number) => th.setLineWidth(size),
    onFontSizeChange: (size: number) => th.setFontSize(size),
    onEmojiChange: (emoji: string) => th.setEmoji(emoji),
    onUndo: () => {
      cm.undo();
      updateState();
    },
    onRedo: () => {
      cm.redo();
      updateState();
    },
    onSave: () => {
      if (options.onSave) {
        cm.toBlob().then((blob) => options.onSave!(blob));
      }
    },
    onCancel: () => {
      if (options.onCancel) options.onCancel();
    },
  });

  function updateState() {
    toolbar.updateUndoRedo(cm.canUndo(), cm.canRedo());
    controller.onStateChange?.({
      canUndo: cm.canUndo(),
      canRedo: cm.canRedo(),
      tool: th['currentTool'],
    });
  }

  cm.canvas.addEventListener('mousedown', (e: MouseEvent) => {
    th.onMouseDown(e);
    updateState();
  });
  cm.canvas.addEventListener('mousemove', (e: MouseEvent) => {
    th.onMouseMove(e);
  });
  cm.canvas.addEventListener('mouseup', (e: MouseEvent) => {
    th.onMouseUp(e);
    updateState();
  });
  cm.canvas.addEventListener('mouseleave', (e: MouseEvent) => {
    if (th['isDrawing']) {
      th.onMouseUp(e);
      updateState();
    }
  });

  const controller: EditorController = {
    setTool: (tool: Tool) => th.setTool(tool),
    setColor: (color: string) => th.setColor(color),
    setLineWidth: (w: number) => th.setLineWidth(w),
    setFontSize: (s: number) => th.setFontSize(s),
    setEmoji: (e: string) => th.setEmoji(e),
    undo: () => {
      cm.undo();
      updateState();
    },
    redo: () => {
      cm.redo();
      updateState();
    },
    canUndo: () => cm.canUndo(),
    canRedo: () => cm.canRedo(),
    getImageBlob: () => cm.toBlob(),
    getImageBase64: () => cm.toBase64(),
    destroy: () => {
      cm.destroy();
      toolbarEl.remove();
    },
    onStateChange: undefined,
  };

  if (options.imageBase64) {
    cm.loadImage('data:image/png;base64,' + options.imageBase64).then(updateState);
  } else if (options.imageUrl) {
    cm.loadImage(options.imageUrl).then(updateState);
  }

  updateState();

  return controller;
}

export type { EditorController, EditorOptions, Tool };
export { DEFAULT_COLORS, EMOJI_LIST } from './types';
