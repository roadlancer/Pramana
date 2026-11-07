import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const store = vi.hoisted(() => ({ savePendingRecording: vi.fn() }));
vi.mock('../../shared/recordingStore', () => store);

class FakeTrack extends EventTarget {
  kind: string;
  constructor(kind: string) {
    super();
    this.kind = kind;
  }
  stop = vi.fn();
}

class FakeStream {
  tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = tracks;
  }
  getTracks = () => this.tracks;
  getVideoTracks = () => this.tracks.filter((t) => t.kind === 'video');
  getAudioTracks = () => this.tracks.filter((t) => t.kind === 'audio');
}

class FakeRecorder {
  static isTypeSupported: (type: string) => boolean = () => true;
  static last: FakeRecorder;
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  stream: FakeStream;
  options?: MediaRecorderOptions;
  constructor(stream: FakeStream, options?: MediaRecorderOptions) {
    this.stream = stream;
    this.options = options;
    FakeRecorder.last = this;
  }
  start = vi.fn(() => {
    this.state = 'recording';
  });
  pause = vi.fn(() => {
    this.state = 'paused';
  });
  resume = vi.fn(() => {
    this.state = 'recording';
  });
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['frame'], { type: 'video/webm' }) });
    this.onstop?.();
  }
}

const sources: { connect: ReturnType<typeof vi.fn> }[] = [];
class FakeAudioContext {
  destination = { kind: 'speakers' };
  createMediaStreamDestination = () => ({ stream: new FakeStream([new FakeTrack('audio')]) });
  createMediaStreamSource = () => {
    const source = { connect: vi.fn() };
    sources.push(source);
    return source;
  };
  close = vi.fn();
}

let onMessage: (message: any, sender: unknown, sendResponse: (r: any) => void) => unknown;
let getUserMedia: ReturnType<typeof vi.fn>;
let captured: FakeStream;

const send = (message: object) =>
  new Promise<any>((resolve) => {
    onMessage({ target: 'offscreen', ...message }, {}, resolve);
  });

const startPayload = { streamId: 's1', mic: false, maxDurationMs: 600_000 };

beforeAll(async () => {
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('MediaStream', FakeStream);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  (globalThis.chrome as any).runtime.onMessage.addListener = vi.fn((fn: typeof onMessage) => {
    onMessage = fn;
  });
  await import('../recorder');
});

beforeEach(() => {
  vi.clearAllMocks();
  sources.length = 0;
  store.savePendingRecording.mockResolvedValue(undefined);
  (globalThis.chrome as any).runtime.sendMessage = vi.fn();
  captured = new FakeStream([new FakeTrack('video'), new FakeTrack('audio')]);
  getUserMedia = vi.fn().mockResolvedValue(captured);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
});

describe('offscreen recorder', () => {
  it('records the captured tab and keeps playing its audio', async () => {
    expect(await send({ type: 'OFFSCREEN_START', payload: startPayload })).toEqual({ success: true, warning: undefined });

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: 's1', maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 } },
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: 's1' } },
    });
    expect(sources[0].connect).toHaveBeenCalledWith(expect.objectContaining({ kind: 'speakers' }));
    expect(FakeRecorder.last.options).toEqual({ mimeType: 'video/mp4;codecs=avc1,mp4a.40.2' });
    expect(FakeRecorder.last.start).toHaveBeenCalledWith(1000);
  });

  it('saves the recording locally and tells the background when stopped', async () => {
    await send({ type: 'OFFSCREEN_START', payload: startPayload });
    await send({ type: 'OFFSCREEN_STOP' });

    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'RECORDING_FINISHED' }));
    const saved = store.savePendingRecording.mock.calls[0][0];
    expect(saved.fileName).toMatch(/^recording-.*\.mp4$/);
    expect(saved.blob.type).toBe('video/mp4');
    expect(saved.blob.size).toBeGreaterThan(0);
    captured.tracks.forEach((t) => expect(t.stop).toHaveBeenCalled());
  });

  it('stops when the user ends sharing', async () => {
    await send({ type: 'OFFSCREEN_START', payload: startPayload });
    captured.getVideoTracks()[0].dispatchEvent(new Event('ended'));
    await vi.waitFor(() => expect(store.savePendingRecording).toHaveBeenCalled());
  });

  it('records WebM when asked', async () => {
    await send({ type: 'OFFSCREEN_START', payload: { ...startPayload, format: 'webm' } });
    expect(FakeRecorder.last.options).toEqual({ mimeType: 'video/webm;codecs=vp9,opus' });
    await send({ type: 'OFFSCREEN_STOP' });
    await vi.waitFor(() => expect(store.savePendingRecording).toHaveBeenCalled());
    const saved = store.savePendingRecording.mock.calls[0][0];
    expect(saved.fileName).toMatch(/\.webm$/);
    expect(saved.blob.type).toBe('video/webm');
  });

  it('falls back to WebM and says so when this Chrome cannot record MP4', async () => {
    const original = FakeRecorder.isTypeSupported;
    FakeRecorder.isTypeSupported = (t: string) => !t.startsWith('video/mp4');
    try {
      const response = await send({ type: 'OFFSCREEN_START', payload: { ...startPayload, format: 'mp4' } });
      expect(response.warning).toMatch(/can’t record MP4/);
      expect(FakeRecorder.last.options).toEqual({ mimeType: 'video/webm;codecs=vp9,opus' });
      await send({ type: 'OFFSCREEN_STOP' });
      await vi.waitFor(() => expect(store.savePendingRecording).toHaveBeenCalled());
      expect(store.savePendingRecording.mock.calls[0][0].fileName).toMatch(/\.webm$/);
    } finally {
      FakeRecorder.isTypeSupported = original;
    }
  });

  it('stops by itself at the time limit', async () => {
    vi.useFakeTimers();
    await send({ type: 'OFFSCREEN_START', payload: { ...startPayload, maxDurationMs: 5000 } });
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(store.savePendingRecording).toHaveBeenCalled());
  });

  it('pauses and resumes; paused time does not count towards the limit', async () => {
    vi.useFakeTimers();
    await send({ type: 'OFFSCREEN_START', payload: { ...startPayload, maxDurationMs: 5000 } });
    await vi.advanceTimersByTimeAsync(3000);

    expect(await send({ type: 'OFFSCREEN_PAUSE' })).toEqual({ success: true });
    expect(FakeRecorder.last.pause).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.savePendingRecording).not.toHaveBeenCalled();

    await send({ type: 'OFFSCREEN_RESUME' });
    expect(FakeRecorder.last.resume).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1999);
    expect(store.savePendingRecording).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await vi.waitFor(() => expect(store.savePendingRecording).toHaveBeenCalled());
  });

  it('mixes in the microphone when allowed', async () => {
    const micStream = new FakeStream([new FakeTrack('audio')]);
    getUserMedia.mockResolvedValueOnce(captured).mockResolvedValueOnce(micStream);

    await send({ type: 'OFFSCREEN_START', payload: { ...startPayload, mic: true } });

    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: true });
    expect(sources).toHaveLength(2);
    await send({ type: 'OFFSCREEN_STOP' });
  });

  it('keeps recording without a voice track when the microphone is blocked', async () => {
    getUserMedia.mockResolvedValueOnce(captured).mockRejectedValueOnce(new Error('NotAllowedError'));

    const response = await send({ type: 'OFFSCREEN_START', payload: { ...startPayload, mic: true } });

    expect(response.success).toBe(true);
    expect(response.warning).toMatch(/Microphone was not available/);
    await send({ type: 'OFFSCREEN_STOP' });
  });

  it('reports a capture that could not start', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
    expect(await send({ type: 'OFFSCREEN_START', payload: startPayload })).toEqual({
      success: false,
      error: 'Recording failed: Permission denied',
    });
  });

  it("records at the tab's own size so the video has no black bars", async () => {
    await send({ type: 'OFFSCREEN_START', payload: { ...startPayload, tabSize: { width: 1280, height: 657 } } });
    expect(getUserMedia.mock.calls[0][0].video.mandatory).toMatchObject({ minWidth: 1280, maxWidth: 1280, minHeight: 658, maxHeight: 658 });
    await send({ type: 'OFFSCREEN_STOP' });
  });

  it('ignores messages meant for the background', () => {
    expect(onMessage({ type: 'AUTH_STATUS' }, {}, vi.fn())).toBe(false);
  });
});

describe('captureSize', () => {
  it('keeps the tab size and shape, scaled down to fit Full HD, with even dimensions', async () => {
    const { captureSize } = await import('../recorder');
    expect(captureSize({ width: 1280, height: 657 }, 1)).toEqual({ width: 1280, height: 658 });
    expect(captureSize({ width: 1440, height: 900 }, 2)).toEqual({ width: 1728, height: 1080 });
    expect(captureSize({ width: 3000, height: 800 }, 1)).toEqual({ width: 1920, height: 512 });
  });
});

describe('pickMimeType', () => {
  it('prefers MP4 with AAC, then MP4 with Opus, then plain MP4', async () => {
    const { pickMimeType } = await import('../../shared/captureRecorder');
    expect(pickMimeType('mp4', () => true)).toEqual({ mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', format: 'mp4', fellBack: false });
    expect(pickMimeType('mp4', (t) => !t.includes('mp4a'))).toEqual({ mimeType: 'video/mp4;codecs=avc1,opus', format: 'mp4', fellBack: false });
  });

  it('prefers VP9 with Opus, then VP8, then the browser default for WebM', async () => {
    const { pickMimeType } = await import('../../shared/captureRecorder');
    expect(pickMimeType('webm', () => true).mimeType).toBe('video/webm;codecs=vp9,opus');
    expect(pickMimeType('webm', (t) => !t.includes('vp9')).mimeType).toBe('video/webm;codecs=vp8,opus');
    expect(pickMimeType('webm', () => false)).toEqual({ mimeType: '', format: 'webm', fellBack: false });
  });

  it('falls back from MP4 to WebM when MP4 is unsupported', async () => {
    const { pickMimeType } = await import('../../shared/captureRecorder');
    expect(pickMimeType('mp4', (t) => t.startsWith('video/webm'))).toEqual({ mimeType: 'video/webm;codecs=vp9,opus', format: 'webm', fellBack: true });
  });
});
