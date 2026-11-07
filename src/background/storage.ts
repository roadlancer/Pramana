/// <reference types="chrome" />

import { createDriveClient, SUBFOLDERS } from '../shared/drive';
import type { FileKind } from '../shared/drive';
import { getToken } from './auth';

export const drive = createDriveClient(getToken);

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

// Uploads from the content script arrive as base64 because runtime messages can't carry Blobs
export async function handleUpload(payload: {
  fileBase64: string;
  metadata: { name?: string; type?: string; mimeType?: string };
}) {
  try {
    const { fileBase64, metadata } = payload;
    const kind: FileKind = metadata.type && metadata.type in SUBFOLDERS ? (metadata.type as FileKind) : 'other';
    const mimeType = metadata.mimeType || (kind === 'recording' ? 'video/webm' : 'image/png');
    const name = metadata.name || `pramana-${Date.now()}`;
    const fileId = await drive.upload(base64ToBlob(fileBase64, mimeType), { name, kind });
    return { success: true, fileId };
  } catch (error) {
    console.error('Upload failed:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
