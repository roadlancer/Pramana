/// <reference types="chrome" />

// Tab recordings run here so they keep going after the popup closes.
import { recordStream } from '../shared/captureRecorder';
import type { ActiveRecording, RecordingFormat } from '../shared/captureRecorder';

interface StartPayload {
  streamId: string;
  mic: boolean;
  maxDurationMs: number;
  /** The tab's size in CSS pixels, when known. */
  tabSize?: { width: number; height: number };
  format?: RecordingFormat;
}

let active: ActiveRecording | null = null;

const MAX_SIZE = { width: 1920, height: 1080 };

/**
 * Video size for a tab: its real pixels, scaled down to fit Full HD, keeping its shape.
 * Without explicit sizes Chrome records tabs at a small fixed size with black bars.
 */
export function captureSize(tab: { width: number; height: number }, pixelRatio: number) {
  const width = tab.width * pixelRatio;
  const height = tab.height * pixelRatio;
  const scale = Math.min(1, MAX_SIZE.width / width, MAX_SIZE.height / height);
  // Encoders want even dimensions
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

function videoLimits(tabSize?: { width: number; height: number }) {
  if (!tabSize?.width || !tabSize?.height) return { maxWidth: MAX_SIZE.width, maxHeight: MAX_SIZE.height, maxFrameRate: 30 };
  const { width, height } = captureSize(tabSize, window.devicePixelRatio || 1);
  return { minWidth: width, maxWidth: width, minHeight: height, maxHeight: height, maxFrameRate: 30 };
}

function tabConstraints(streamId: string, limits = {}) {
  return { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId, ...limits } } as unknown as MediaTrackConstraints;
}

async function start({ streamId, mic, maxDurationMs, tabSize, format }: StartPayload) {
  const captured = await navigator.mediaDevices.getUserMedia({
    video: tabConstraints(streamId, videoLimits(tabSize)),
    audio: tabConstraints(streamId),
  });
  active = await recordStream(captured, { playCapturedAudio: true, mic, maxDurationMs, format });
  return active.warning;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  if (message.type === 'OFFSCREEN_START') {
    start(message.payload)
      .then((warning) => sendResponse({ success: true, warning }))
      .catch((error) => sendResponse({ success: false, error: `Recording failed: ${error instanceof Error ? error.message : error}` }));
    return true;
  }

  if (message.type === 'OFFSCREEN_PAUSE' || message.type === 'OFFSCREEN_RESUME') {
    if (message.type === 'OFFSCREEN_PAUSE') active?.pause();
    else active?.resume();
    sendResponse({ success: !!active });
  }

  if (message.type === 'OFFSCREEN_STOP') {
    active?.stop();
    active = null;
    sendResponse({ success: true });
  }
  return false;
});
