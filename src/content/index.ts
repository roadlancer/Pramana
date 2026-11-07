/// <reference types="chrome" />

// Injected on demand by the popup (Select Area). Shows the selection overlay, crops the
// capture, and opens the shared editor in a shadow root so page CSS can't affect it.

import { createEditor } from '../shared/editor';
import type { EditorController } from '../shared/editor';
import { blobToBase64 } from '../shared/utils';
import { showToast } from '../shared/toast';

type Area = { x: number; y: number; width: number; height: number };

const OVERLAY_ID = 'pramana-area-overlay';
const EDITOR_HOST_ID = 'pramana-editor-host';
const MIN_SELECTION = 10;

let overlay: HTMLDivElement | null = null;
let selection: HTMLDivElement | null = null;
let isSelecting = false;
let startX = 0;
let startY = 0;
let editor: EditorController | null = null;

function notify(text: string, kind: 'info' | 'success' | 'error' = 'info') {
  const host = document.getElementById(EDITOR_HOST_ID);
  showToast(text, kind, host?.shadowRoot || document.body);
}

export function createOverlay() {
  cleanupOverlay();
  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.3); z-index: 2147483646; cursor: crosshair;
  `;
  overlay.title = 'Drag to select an area. Press Escape to cancel.';
  document.body.appendChild(overlay);
  overlay.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onOverlayKeyDown, true);
}

function onOverlayKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopPropagation();
  cleanupOverlay();
}

function onMouseDown(e: MouseEvent) {
  isSelecting = true;
  startX = e.clientX;
  startY = e.clientY;
  selection = document.createElement('div');
  selection.style.cssText = `
    position: fixed; left: ${startX}px; top: ${startY}px;
    width: 0px; height: 0px; border: 2px dashed #fff;
    background: rgba(255, 255, 255, 0.1);
    pointer-events: none; z-index: 2147483647;
  `;
  document.body.appendChild(selection);
}

function onMouseMove(e: MouseEvent) {
  if (!isSelecting || !selection) return;
  selection.style.left = `${Math.min(startX, e.clientX)}px`;
  selection.style.top = `${Math.min(startY, e.clientY)}px`;
  selection.style.width = `${Math.abs(e.clientX - startX)}px`;
  selection.style.height = `${Math.abs(e.clientY - startY)}px`;
}

function onMouseUp(e: MouseEvent) {
  if (!isSelecting) return;
  const area: Area = {
    x: Math.min(startX, e.clientX),
    y: Math.min(startY, e.clientY),
    width: Math.abs(e.clientX - startX),
    height: Math.abs(e.clientY - startY),
  };
  cleanupOverlay();
  if (area.width <= MIN_SELECTION || area.height <= MIN_SELECTION) return;

  // Force a reflow and wait a frame so the overlay is gone from the capture
  void document.body.offsetHeight;
  setTimeout(() => {
    try {
      chrome.runtime.sendMessage({ type: 'CAPTURE_AREA', payload: area }, (response) => {
        if (chrome.runtime.lastError) {
          notify('Pramana was updated. Please refresh the page.', 'error');
          return;
        }
        if (response?.success && response.base64) {
          cropAndOpenEditor(response.base64, area);
        } else {
          notify('Capture failed: ' + (response?.error || 'Unknown error'), 'error');
        }
      });
    } catch {
      notify('Pramana was updated. Please refresh the page.', 'error');
    }
  }, 200);
}

function cleanupOverlay() {
  isSelecting = false;
  selection?.remove();
  selection = null;
  overlay?.removeEventListener('mousedown', onMouseDown);
  overlay?.remove();
  overlay = null;
  document.getElementById(OVERLAY_ID)?.remove();
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('keydown', onOverlayKeyDown, true);
}

/** Converts a CSS-pixel selection into image pixels (the capture is at device resolution). */
export function scaleArea(area: Area, imageWidth: number, viewportWidth: number): Area {
  const ratio = imageWidth / viewportWidth;
  return { x: area.x * ratio, y: area.y * ratio, width: area.width * ratio, height: area.height * ratio };
}

function cropAndOpenEditor(base64: string, area: Area) {
  const img = new Image();
  img.onload = () => {
    const crop = scaleArea(area, img.naturalWidth, window.innerWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(crop.width);
    canvas.height = Math.round(crop.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    openEditorModal(canvas.toDataURL('image/png').split(',')[1]);
  };
  img.src = 'data:image/png;base64,' + base64;
}

function openEditorModal(imageBase64: string) {
  closeEditorModal();
  const host = document.createElement('div');
  host.id = EDITOR_HOST_ID;
  host.style.cssText = 'position: fixed; inset: 0; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.appendChild(host);

  editor = createEditor(shadow, {
    imageBase64,
    cancelLabel: 'Close',
    onCancel: closeEditorModal,
    onSave: async (blob) => {
      const fileBase64 = await blobToBase64(blob);
      const response = await chrome.runtime
        .sendMessage({
          type: 'UPLOAD_FILE',
          payload: { fileBase64, metadata: { name: `screenshot-${Date.now()}.png`, type: 'screenshot' } },
        })
        .catch(() => ({ success: false, error: 'Pramana was updated. Please refresh the page.' }));
      if (!response?.success) {
        notify('Upload failed: ' + (response?.error || 'Unknown error'), 'error');
        throw new Error(response?.error);
      }
      closeEditorModal();
      showToast('Screenshot saved to Google Drive!', 'success');
    },
  });
}

function closeEditorModal() {
  editor?.destroy();
  editor = null;
  document.getElementById(EDITOR_HOST_ID)?.remove();
  cleanupOverlay();
}

// The popup injects this script on every Select Area click; only the first copy listens
const loadedFlag = '__pramanaContentLoaded';
const globalScope = window as unknown as Record<string, boolean>;
if (!globalScope[loadedFlag]) {
  globalScope[loadedFlag] = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'CAPTURE_AREA_SELECT') return false;
    createOverlay();
    sendResponse({ success: true });
    return false;
  });
}
