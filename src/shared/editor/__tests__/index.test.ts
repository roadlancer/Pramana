import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { createEditor } from '../index';
import type { EditorController } from '../index';
import { DEFAULT_TOOL } from '../types';

let container: HTMLDivElement;
let editor: EditorController;
let onSave: Mock<(blob: Blob) => Promise<void>>;
let onCancel: Mock<() => void>;

const canvas = () => container.querySelector('canvas')!;
const mouse = (type: string, x: number, y: number, target: EventTarget = canvas()) =>
  target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
const drag = (x1: number, y1: number, x2: number, y2: number) => {
  mouse('mousedown', x1, y1);
  mouse('mousemove', x2, y2, window);
  mouse('mouseup', x2, y2, window);
};
const key = (k: string, opts: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));
const toolButton = (title: string) => container.querySelector<HTMLButtonElement>(`button[title^="${title}"]`)!;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  onSave = vi.fn<(blob: Blob) => Promise<void>>().mockResolvedValue(undefined);
  onCancel = vi.fn<() => void>();
  editor = createEditor(container, { imageBase64: 'AAAA', onSave, onCancel });
});

afterEach(() => {
  editor.destroy();
  container.remove();
});

describe('createEditor', () => {
  it('starts on the tool the toolbar shows as active, so the first drag draws', () => {
    expect(editor.getTool()).toBe(DEFAULT_TOOL);
    expect(container.querySelector('.pe-tool-btn.active')).toHaveAttribute('title', 'Highlight (H)');

    drag(10, 10, 110, 60);

    expect(editor.getElements()).toEqual([
      expect.objectContaining({ type: 'highlight', x: 10, y: 10, width: 100, height: 50 }),
    ]);
  });

  it('offers all nine tools including Select', () => {
    expect(container.querySelectorAll('.pe-tool-group .pe-tool-btn')).toHaveLength(9);
    expect(toolButton('Select')).toBeTruthy();
  });

  it('normalizes shapes dragged up and to the left', () => {
    editor.setTool('rectangle');
    drag(100, 100, 40, 70);
    expect(editor.getElements()[0]).toMatchObject({ x: 40, y: 70, width: 60, height: 30 });
  });

  it('ignores accidental clicks that would leave an empty shape', () => {
    drag(10, 10, 11, 11);
    expect(editor.getElements()).toHaveLength(0);
  });

  it('selects, moves and deletes an annotation', () => {
    editor.setTool('rectangle');
    drag(10, 10, 60, 60);
    toolButton('Select').click();

    drag(12, 12, 112, 32);
    expect(editor.getElements()[0]).toMatchObject({ x: 110, y: 30 });

    key('Delete');
    expect(editor.getElements()).toHaveLength(0);
  });

  it('undoes a move back to where the annotation was', () => {
    editor.setTool('rectangle');
    drag(10, 10, 60, 60);
    editor.setTool('select');
    drag(12, 12, 112, 12);

    key('z', { ctrlKey: true });
    expect(editor.getElements()[0]).toMatchObject({ x: 10, y: 10 });
    key('z', { ctrlKey: true, shiftKey: true });
    expect(editor.getElements()[0]).toMatchObject({ x: 110, y: 10 });
  });

  it('erases the annotation that was clicked', () => {
    drag(10, 10, 60, 60);
    editor.setTool('eraser');
    mouse('mousedown', 30, 30);
    expect(editor.getElements()).toHaveLength(0);
    expect(editor.canUndo()).toBe(true);
  });

  it('types text inline instead of using a browser prompt', () => {
    const prompt = vi.spyOn(window, 'prompt');
    editor.setTool('text');
    mouse('mousedown', 50, 40);

    const input = container.querySelector<HTMLInputElement>('.pe-text-input')!;
    expect(input).toBeTruthy();
    input.value = 'Bug here';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(prompt).not.toHaveBeenCalled();
    expect(container.querySelector('.pe-text-input')).toBeNull();
    expect(editor.getElements()).toEqual([expect.objectContaining({ type: 'text', text: 'Bug here', x: 50, y: 40 })]);
  });

  it('discards inline text on Escape', () => {
    editor.setTool('text');
    mouse('mousedown', 50, 40);
    const input = container.querySelector<HTMLInputElement>('.pe-text-input')!;
    input.value = 'nope';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(editor.getElements()).toHaveLength(0);
  });

  it('shows the color palette for the text tool', () => {
    editor.setTool('text');
    const colorSection = container.querySelector('.pe-swatches')!.parentElement!;
    expect(colorSection.hidden).toBe(false);
  });

  it('switches tools with single-key shortcuts', () => {
    key('r');
    expect(editor.getTool()).toBe('rectangle');
    key('v');
    expect(editor.getTool()).toBe('select');
  });

  it('has a single Save button that saves, also on Ctrl+S', async () => {
    canvas().toBlob = (cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' }));
    const saveButtons = [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Save to Drive');
    expect(saveButtons).toHaveLength(1);

    key('s', { ctrlKey: true });
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.any(Blob)));
  });

  it('re-enables Save after a failed upload so the user can retry', async () => {
    canvas().toBlob = (cb: BlobCallback) => cb(new Blob(['png']));
    onSave.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const saveBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Save to Drive')!;

    saveBtn.click();
    expect(saveBtn.disabled).toBe(true);
    await vi.waitFor(() => expect(saveBtn.disabled).toBe(false));
    expect(saveBtn.textContent).toBe('Save to Drive');
  });

  it('copies the annotated image from the Copy button and on Ctrl+C', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    canvas().toBlob = (cb: BlobCallback) => cb(png);
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('ClipboardItem', class { items: Record<string, Promise<Blob>>; constructor(items: Record<string, Promise<Blob>>) { this.items = items; } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } });
    const copyBtn = toolButton('Copy image');

    copyBtn.click();
    await vi.waitFor(() => expect(copyBtn.textContent).toBe('Copied ✓'));
    expect(await write.mock.calls[0][0][0].items['image/png']).toBe(png);

    key('c', { ctrlKey: true });
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    vi.unstubAllGlobals();
  });

  it('says when copying is not possible on the page', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const copyBtn = toolButton('Copy image');

    copyBtn.click();
    await vi.waitFor(() => expect(copyBtn.textContent).toBe('Copy failed'));
    expect(copyBtn.title).toBe("This page doesn't allow copying images. Save to Drive instead.");
  });

  it('calls onCancel from the cancel button', () => {
    container.querySelector<HTMLButtonElement>('.pe-header-actions .pe-btn')!.click();
    expect(onCancel).toHaveBeenCalled();
  });

  it('stops listening to the window once destroyed', () => {
    editor.destroy();
    key('r');
    expect(container.querySelector('.pe-root')).toBeNull();
    editor = createEditor(container, { imageBase64: 'AAAA', onSave, onCancel });
  });
});
