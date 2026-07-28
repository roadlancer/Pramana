/// <reference types="chrome" />

export async function handleStorage(payload: {
  type?: string;
  fileBase64?: string;
  metadata?: Record<string, unknown>;
  token?: string;
  fileId?: string;
}) {
  switch (payload.type) {
    case 'UPLOAD':
      return uploadFile(payload.fileBase64!, payload.metadata!, payload.token!);
    case 'LIST_FILES':
      return listFiles(payload.token!);
    case 'DELETE_FILE':
      return deleteFile(payload.fileId!, payload.token!);
    case 'FETCH_FILE_DATA':
      return fetchFileData(payload.fileId!, payload.token!);
    default:
      console.warn('Unknown storage action:', payload.type);
      return { success: false, error: 'Unknown action' };
  }
}

async function uploadFile(
  fileBase64: string,
  metadata: Record<string, unknown>,
  token: string
) {
  try {
    const fileName = (metadata.name as string) || `pramana-${Date.now()}`;
    const folderId = await getOrCreateFolder(token);
    const subfolderId = await getOrCreateSubfolder(token, folderId, metadata.type as string || 'other');

    const fileMetadata = {
      name: fileName,
      parents: [subfolderId],
    };

    const byteCharacters = atob(fileBase64);
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteArray[i] = byteCharacters.charCodeAt(i);
    }
    const mimeType = metadata.type === 'recording' ? 'video/webm' : 'image/png';
    const fileBlob = new Blob([byteArray], { type: mimeType });

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    form.append('file', fileBlob);

    console.log('Uploading file:', fileName, 'to subfolder:', subfolderId);

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      }
    );

    const result = await response.json();

    if (result.error) {
      console.error('Upload error:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true, fileId: result.id };
  } catch (error) {
    console.error('Upload failed:', error);
    return { success: false, error: String(error) };
  }
}

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
  folder: string;
}

async function listFiles(token: string) {
  try {
    const folderId = await getOrCreateFolder(token);
    const allFiles: FileItem[] = [];

    const subfoldersRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)&pageSize=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const subfoldersData = await subfoldersRes.json();
    const subfolders: Array<{ id: string; name: string }> = subfoldersData.files || [];

    for (const sub of subfolders) {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${sub.id}' in parents and trashed=false&fields=files(id,name,mimeType,size,createdTime)&orderBy=createdTime desc&pageSize=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.files) {
        for (const f of data.files) {
          if (f.mimeType !== 'application/vnd.google-apps.folder') {
            allFiles.push({ ...f, folder: sub.name });
          }
        }
      }
    }

    allFiles.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
    return { success: true, files: allFiles };
  } catch (error) {
    console.error('List files failed:', error);
    return { success: false, error: String(error) };
  }
}

async function fetchFileData(fileId: string, token: string) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error?.message || 'Fetch failed' };
    }
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const mimeType = blob.type || 'application/octet-stream';
    return { success: true, base64, mimeType };
  } catch (error) {
    console.error('Fetch file data failed:', error);
    return { success: false, error: String(error) };
  }
}

async function deleteFile(fileId: string, token: string) {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      return { success: true };
    } else {
      const data = await response.json();
      return { success: false, error: data.error?.message || 'Delete failed' };
    }
  } catch (error) {
    console.error('Delete failed:', error);
    return { success: false, error: String(error) };
  }
}

async function getOrCreateFolder(token: string): Promise<string> {
  const folderName = 'Pramana';

  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const searchData = await searchResponse.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const createData = await createResponse.json();
  return createData.id;
}

async function getOrCreateSubfolder(token: string, parentId: string, type: string): Promise<string> {
  const subfolderNames: Record<string, string> = {
    screenshot: 'Screenshots',
    recording: 'Recordings',
    other: 'Other',
  };
  const subfolderName = subfolderNames[type] || 'Other';

  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${subfolderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const searchData = await searchResponse.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: subfolderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  const createData = await createResponse.json();

  if (createData.error) {
    console.error('Subfolder create error:', createData.error);
    return parentId;
  }

  if (!createData.id) {
    console.error('Subfolder created but no ID returned:', createData);
    return parentId;
  }

  return createData.id;
}
