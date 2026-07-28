/// <reference types="chrome" />

import { useEffect, useRef } from 'react';
import { createEditor } from '../shared/editor';
import type { EditorController } from '../shared/editor';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<EditorController | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const imageUrl = params.get('image');
    const storageKey = params.get('storageKey');

    async function init() {
      let base64: string | undefined;

      if (imageUrl) {
        const resp = await fetch(imageUrl);
        const blob = await resp.blob();
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(blob);
        });
      } else if (storageKey) {
        const data = await chrome.storage.local.get([storageKey]);
        base64 = data[storageKey];
        await chrome.storage.local.remove([storageKey]);
      }

      if (!base64) {
        containerRef.current!.innerHTML =
          '<div style="padding:40px;text-align:center;color:#e6edf3;">No image to edit. Capture a screenshot first.</div>';
        return;
      }

      controllerRef.current = createEditor(containerRef.current!, {
        imageBase64: base64,
        onCancel: () => window.close(),
      });
    }

    init();

    return () => {
      controllerRef.current?.destroy();
    };
  }, []);

  const handleSave = async () => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    const blob = await ctrl.getImageBlob();
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1];
      chrome.runtime.sendMessage(
        {
          type: 'UPLOAD_FILE',
          payload: {
            fileBase64: b64,
            metadata: {
              name: `screenshot-edited-${Date.now()}.png`,
              type: 'screenshot',
            },
          },
        },
        (resp) => {
          if (chrome.runtime.lastError) {
            alert('Extension was reloaded. Please refresh and try again.');
            return;
          }
          if (resp?.success) {
            alert('Screenshot saved to Google Drive!');
            window.close();
          } else {
            alert('Upload failed: ' + (resp?.error || 'Unknown error'));
          }
        }
      );
    };
    reader.readAsDataURL(blob);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        controllerRef.current?.undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        controllerRef.current?.redo();
      } else if (e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="editor-root">
      <header className="editor-header">
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Pramana Editor
        </h1>
        <button className="editor-save-btn" onClick={handleSave}>
          Save to Drive
        </button>
      </header>
      <div
        ref={containerRef}
        style={{ flex: 1, display: 'flex', overflow: 'hidden' }}
      />
    </div>
  );
}

export default App;
