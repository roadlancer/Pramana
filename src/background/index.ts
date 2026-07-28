/// <reference types="chrome" />

import { handleAuth, checkAuthStatus, getStoredToken, checkStorageQuota } from './auth';
import { handleCapture, handleCaptureArea } from './capture';
import { handleStorage } from './storage';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Pramana extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleMessage = async () => {
    switch (message.type) {
      case 'AUTH_REQUEST':
        return await handleAuth(message.payload);

      case 'AUTH_STATUS':
        return await checkAuthStatus();

      case 'CAPTURE_SCREENSHOT':
        return await handleCapture(message.payload, sender);

      case 'CAPTURE_AREA':
        return await handleCaptureArea(message.payload, sender);

      case 'UPLOAD_FILE': {
        const token = await getStoredToken();
        if (!token) return { success: false, error: 'Not authenticated' };
        const { fileBase64, metadata } = message.payload;
        return await handleStorage({ type: 'UPLOAD', fileBase64, metadata, token });
      }

      case 'CHECK_STORAGE_QUOTA': {
        const token = await getStoredToken();
        if (!token) return { success: false, error: 'Not authenticated' };
        return await checkStorageQuota(token);
      }

      case 'LIST_FILES': {
        const token = await getStoredToken();
        if (!token) return { success: false, error: 'Not authenticated' };
        return await handleStorage({ type: 'LIST_FILES', token });
      }

      case 'DELETE_FILE': {
        const token = await getStoredToken();
        if (!token) return { success: false, error: 'Not authenticated' };
        return await handleStorage({ type: 'DELETE_FILE', fileId: message.payload.fileId, token });
      }

      case 'FETCH_FILE_DATA': {
        const token = await getStoredToken();
        if (!token) return { success: false, error: 'Not authenticated' };
        return await handleStorage({ type: 'FETCH_FILE_DATA', fileId: message.payload.fileId, token });
      }

      case 'DOWNLOAD_FILE': {
        const token = await getStoredToken();
        if (!token) return { success: false, error: 'Not authenticated' };
        const result = await handleStorage({ type: 'FETCH_FILE_DATA', fileId: message.payload.fileId, token }) as { success: boolean; base64?: string; mimeType?: string; error?: string };
        if (!result.success) return result;
        const binary = atob(result.base64!);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const ext = result.mimeType?.includes('video') ? '.webm' : '.png';
        const blob = new Blob([bytes], { type: result.mimeType });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url, filename: message.payload.fileName || `pramana${ext}` });
        return { success: true };
      }

      case 'OPEN_EDITOR': {
        const { storageKey } = message.payload;
        chrome.tabs.create({
          url: chrome.runtime.getURL(`src/editor/index.html?storageKey=${storageKey}`),
        });
        return { success: true };
      }

      default:
        console.warn('Unknown message type:', message.type);
        return { success: false, error: 'Unknown message type' };
    }
  };

  handleMessage().then(sendResponse);
  return true;
});
