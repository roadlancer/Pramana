/// <reference types="chrome" />

import { handleAuth, checkAuthStatus, getToken } from './auth';
import { handleCapture, handleCaptureArea } from './capture';
import { drive, handleUpload } from './storage';
import {
  getRecordingState,
  startRecording,
  stopRecording,
  pauseRecording,
  resumeRecording,
  togglePauseRecording,
  handleRecordingStarted,
  handleRecordingFinished,
  handleRecordingFailed,
  handleWindowRemoved,
} from './recording';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Pramana extension installed');
});

chrome.windows.onRemoved.addListener((windowId) => {
  handleWindowRemoved(windowId);
});

// Keyboard shortcuts (manifest "commands"), so a recording can be controlled with nothing on screen
chrome.commands?.onCommand.addListener((command) => {
  if (command === 'stop-recording') stopRecording();
  if (command === 'pause-recording') togglePauseRecording();
});

// Tokens are only handed to the extension's own pages, never to content scripts
export function isExtensionPage(sender: chrome.runtime.MessageSender) {
  return sender.id === chrome.runtime.id && !!sender.url?.startsWith(chrome.runtime.getURL(''));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Messages meant for the recorders are answered there
  if (message.target === 'offscreen' || message.target === 'recorder') return false;

  const handleMessage = async () => {
    switch (message.type) {
      case 'AUTH_REQUEST':
        return await handleAuth(message.payload);

      case 'AUTH_STATUS':
        return await checkAuthStatus();

      case 'GET_AUTH_TOKEN': {
        if (!isExtensionPage(sender)) return { success: false, error: 'Not allowed' };
        const token = await getToken(!!message.payload?.refresh);
        return token ? { success: true, token } : { success: false, error: 'Not signed in to Google' };
      }

      case 'CAPTURE_SCREENSHOT':
        return await handleCapture(message.payload, sender);

      case 'CAPTURE_AREA':
        return await handleCaptureArea(message.payload, sender);

      case 'UPLOAD_FILE':
        return await handleUpload(message.payload);

      case 'CHECK_STORAGE_QUOTA':
        return { success: true, ...(await drive.getQuota()) };

      case 'OPEN_EDITOR': {
        const { storageKey } = message.payload;
        chrome.tabs.create({
          url: chrome.runtime.getURL(`src/editor/index.html?storageKey=${storageKey}`),
        });
        return { success: true };
      }

      case 'START_RECORDING':
        return await startRecording(message.payload);

      case 'STOP_RECORDING':
        return await stopRecording();

      case 'PAUSE_RECORDING':
        return await pauseRecording();

      case 'RESUME_RECORDING':
        return await resumeRecording();

      case 'GET_RECORDING_STATE':
        return { success: true, ...(await getRecordingState()) };

      case 'RECORDING_STARTED':
        return await handleRecordingStarted();

      case 'RECORDING_FINISHED':
        return await handleRecordingFinished();

      case 'RECORDING_FAILED':
        return await handleRecordingFailed(message.payload?.error || 'Recording failed');

      default:
        console.warn('Unknown message type:', message.type);
        return { success: false, error: 'Unknown message type' };
    }
  };

  handleMessage()
    .then(sendResponse)
    .catch((error) => sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
