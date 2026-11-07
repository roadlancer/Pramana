// Records a captured stream (tab or screen) with optional microphone, used by both the
// offscreen tab recorder and the visible screen-recorder window.

import { savePendingRecording } from './recordingStore';

export type RecordingFormat = 'mp4' | 'webm';

export const DEFAULT_FORMAT: RecordingFormat = 'mp4';

export interface RecordOptions {
  /** Play the captured audio back to the user (capturing a tab mutes it). */
  playCapturedAudio: boolean;
  mic: boolean;
  maxDurationMs: number;
  format?: RecordingFormat;
}

export interface ActiveRecording {
  stop(): void;
  /** Paused time is left out of the video and doesn't count towards the time limit. */
  pause(): void;
  resume(): void;
  /** Set when the recording started with reduced functionality (e.g. no microphone). */
  warning?: string;
  /** Called when recording ends for any reason, before the file is saved. */
  onFinishing?: () => void;
}

// Best first. MP4 audio is AAC where Chrome can encode it, Opus otherwise.
const MIME_TYPES: Record<RecordingFormat, string[]> = {
  mp4: ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4'],
  webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
};

/**
 * MediaRecorder type for the requested format. Older Chrome versions can't record MP4,
 * so that falls back to WebM (`fellBack`) rather than failing.
 */
export function pickMimeType(
  format: RecordingFormat = DEFAULT_FORMAT,
  isSupported: (type: string) => boolean = (t) => MediaRecorder.isTypeSupported(t)
): { mimeType: string; format: RecordingFormat; fellBack: boolean } {
  const wanted = MIME_TYPES[format].find(isSupported);
  if (wanted) return { mimeType: wanted, format, fellBack: false };
  const fallback = format === 'webm' ? '' : MIME_TYPES.webm.find(isSupported) || '';
  return { mimeType: fallback, format: 'webm', fellBack: format !== 'webm' };
}

export function recordingFileName(format: RecordingFormat = 'webm', date = new Date()) {
  return `recording-${date.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${format}`;
}

/**
 * Starts recording `captured`. When it ends (stop(), the user ending sharing, or the time limit)
 * the result is saved to IndexedDB and RECORDING_FINISHED (or RECORDING_FAILED) is sent.
 */
export async function recordStream(captured: MediaStream, options: RecordOptions): Promise<ActiveRecording> {
  const streams = [captured];
  const audioContext = new AudioContext();
  const mixed = audioContext.createMediaStreamDestination();
  let hasAudio = false;
  let warning: string | undefined;

  if (captured.getAudioTracks().length > 0) {
    const capturedAudio = audioContext.createMediaStreamSource(captured);
    capturedAudio.connect(mixed);
    if (options.playCapturedAudio) capturedAudio.connect(audioContext.destination);
    hasAudio = true;
  }

  if (options.mic) {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streams.push(micStream);
      audioContext.createMediaStreamSource(micStream).connect(mixed);
      hasAudio = true;
    } catch {
      warning = 'Microphone was not available, so the recording has no voice track.';
    }
  }

  const output = new MediaStream([...captured.getVideoTracks(), ...(hasAudio ? mixed.stream.getAudioTracks() : [])]);
  const { mimeType, format, fellBack } = pickMimeType(options.format);
  if (fellBack) {
    const note = 'This version of Chrome can’t record MP4, so this recording is WebM.';
    warning = warning ? `${warning} ${note}` : note;
  }
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(output, mimeType ? { mimeType } : undefined);

  const stop = () => {
    if (recorder.state !== 'inactive') recorder.stop();
  };
  // The time limit counts recorded time only, so the timer is held while paused
  let remainingMs = options.maxDurationMs;
  let timerStartedAt = Date.now();
  let stopTimer = setTimeout(stop, remainingMs);
  const pause = () => {
    if (recorder.state !== 'recording') return;
    recorder.pause();
    clearTimeout(stopTimer);
    remainingMs -= Date.now() - timerStartedAt;
  };
  const resume = () => {
    if (recorder.state !== 'paused') return;
    recorder.resume();
    timerStartedAt = Date.now();
    stopTimer = setTimeout(stop, Math.max(0, remainingMs));
  };
  const active: ActiveRecording = { stop, pause, resume, warning };

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = async () => {
    active.onFinishing?.();
    clearTimeout(stopTimer);
    streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    audioContext.close();
    try {
      const blob = new Blob(chunks, { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
      await savePendingRecording({ blob, fileName: recordingFileName(format), createdAt: Date.now(), warning });
      chrome.runtime.sendMessage({ type: 'RECORDING_FINISHED' });
    } catch (error) {
      chrome.runtime.sendMessage({ type: 'RECORDING_FAILED', payload: { error: `Could not keep the recording: ${error}` } });
    }
  };

  // Stop when the user ends sharing, closes the captured tab, or picks "Stop sharing"
  captured.getVideoTracks()[0]?.addEventListener('ended', stop);
  recorder.start(1000);
  return active;
}
