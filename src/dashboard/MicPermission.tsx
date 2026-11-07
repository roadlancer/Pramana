import { useState } from 'react';

// The offscreen recorder has no UI, so Chrome can't prompt for the microphone there.
// Granting it once on this visible extension page covers the whole extension.
export function MicPermission() {
  const [state, setState] = useState<'idle' | 'granted' | 'denied'>('idle');

  const request = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setState('granted');
    } catch {
      setState('denied');
    }
  };

  return (
    <div className="dashboard-container centered-panel">
      <h1>Microphone access</h1>
      {state === 'granted' ? (
        <p>Microphone enabled. Your next recording will include your voice. You can close this tab.</p>
      ) : (
        <>
          <p>Pramana needs your permission once to record your voice along with the screen.</p>
          {state === 'denied' && (
            <p className="error-message">
              Access was blocked. Allow the microphone from the icon in the address bar, then try again.
            </p>
          )}
          <button className="btn-primary" onClick={request}>
            Allow microphone
          </button>
        </>
      )}
    </div>
  );
}
