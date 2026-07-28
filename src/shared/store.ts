import { create } from 'zustand';

interface AppState {
  isSignedIn: boolean;
  token: string | null;
  storageInfo: {
    usage: number;
    limit: number;
    available: number;
    status: 'normal' | 'warning' | 'full';
  } | null;
  isRecording: boolean;
  recordingSource: 'screen' | 'tab' | 'window';

  setSignedIn: (signedIn: boolean) => void;
  setToken: (token: string | null) => void;
  setStorageInfo: (info: AppState['storageInfo']) => void;
  setRecording: (recording: boolean) => void;
  setRecordingSource: (source: 'screen' | 'tab' | 'window') => void;
}

export const useStore = create<AppState>((set) => ({
  isSignedIn: false,
  token: null,
  storageInfo: null,
  isRecording: false,
  recordingSource: 'screen',

  setSignedIn: (signedIn) => set({ isSignedIn: signedIn }),
  setToken: (token) => set({ token }),
  setStorageInfo: (storageInfo) => set({ storageInfo }),
  setRecording: (isRecording) => set({ isRecording }),
  setRecordingSource: (recordingSource) => set({ recordingSource }),
}));
