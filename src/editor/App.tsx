/// <reference types="chrome" />

import { useEffect, useRef, useState } from 'react';
import { createEditor } from '../shared/editor';
import { createPageDriveClient } from '../shared/drive';
import { showToast } from '../shared/toast';
import { removeStalePendingEdits } from './pendingEdits';

const drive = createPageDriveClient();

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const storageKey = new URLSearchParams(window.location.search).get('storageKey');
    let destroyed = false;
    let destroy: (() => void) | undefined;

    async function init() {
      if (!storageKey) {
        setMissing(true);
        return;
      }
      // The pending image stays in storage until it is saved, so a refresh doesn't lose it
      const data = await chrome.storage.local.get([storageKey]);
      const base64: string | undefined = data[storageKey];
      await removeStalePendingEdits(storageKey);
      if (destroyed) return;
      if (!base64) {
        setMissing(true);
        return;
      }

      const discard = () => {
        chrome.storage.local.remove([storageKey]);
        window.close();
      };

      const editor = createEditor(container!, {
        imageBase64: base64,
        cancelLabel: 'Discard',
        onCancel: discard,
        onSave: async (blob) => {
          try {
            await drive.upload(blob, { name: `screenshot-edited-${Date.now()}.png`, kind: 'screenshot' });
          } catch (error) {
            showToast(`Upload failed: ${error instanceof Error ? error.message : error}`, 'error');
            throw error;
          }
          await chrome.storage.local.remove([storageKey]);
          showToast('Screenshot saved to Google Drive. Closing…', 'success');
          setTimeout(() => window.close(), 1200);
        },
      });
      destroy = editor.destroy;
    }

    init();
    return () => {
      destroyed = true;
      destroy?.();
    };
  }, []);

  if (missing) {
    return <div className="editor-empty">No image to edit. Capture a screenshot first.</div>;
  }
  return <div ref={containerRef} className="editor-page" />;
}

export default App;
