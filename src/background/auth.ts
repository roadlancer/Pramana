/// <reference types="chrome" />

export async function handleAuth(payload: { type: string }) {
  if (payload.type === 'LOGIN') {
    try {
      const token = await getAuthToken();
      const userInfo = await getUserInfo(token);
      await chrome.storage.local.set({
        auth_token: token,
        is_signed_in: true,
        user_email: userInfo.email,
        user_name: userInfo.name,
      });
      return { success: true, token, email: userInfo.email, name: userInfo.name };
    } catch (error) {
      console.error('Auth failed:', error);
      const errorMsg = String(error);
      if (errorMsg.includes('user did not approve') || errorMsg.includes('access_denied')) {
        return { success: false, error: 'Access denied. Please click "Allow" on the consent screen.' };
      }
      return { success: false, error: errorMsg };
    }
  }
  if (payload.type === 'LOGOUT') {
    const data = await chrome.storage.local.get(['auth_token']);
    if (data.auth_token) {
      chrome.identity.removeCachedAuthToken({ token: data.auth_token });
    }
    await chrome.identity.clearAllCachedAuthTokens();
    await chrome.storage.local.remove(['auth_token', 'is_signed_in', 'user_email', 'user_name']);
    return { success: true };
  }
  return { success: false, error: 'Unknown auth action' };
}

function getAuthToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || '';
        if (msg.includes('user did not approve') || msg.includes('access_denied')) {
          reject(new Error('User cancelled the consent screen. Please click "Allow" when prompted.'));
        } else if (msg.includes('OAuth2 not approved')) {
          reject(new Error('OAuth consent screen not configured. Check Google Cloud Console.'));
        } else {
          reject(new Error(msg || 'Failed to get auth token'));
        }
      } else if (token) {
        resolve(token);
      } else {
        reject(new Error('No token received'));
      }
    });
  });
}

async function getUserInfo(token: string): Promise<{ email: string; name: string }> {
  try {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const data = await response.json();

    if (data.email) {
      return {
        email: data.email,
        name: data.name || data.given_name || 'User',
      };
    }

    const driveResponse = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const driveData = await driveResponse.json();

    if (driveData.user) {
      return {
        email: driveData.user.emailAddress || 'unknown@gmail.com',
        name: driveData.user.displayName || 'User',
      };
    }

    return { email: 'unknown@gmail.com', name: 'User' };
  } catch (error) {
    console.error('Failed to get user info:', error);
    return { email: 'unknown@gmail.com', name: 'User' };
  }
}

export async function checkAuthStatus() {
  const data = await chrome.storage.local.get(['is_signed_in', 'user_email', 'user_name']);
  return {
    signedIn: data.is_signed_in || false,
    email: data.user_email || null,
    name: data.user_name || null,
  };
}

export async function getStoredToken(): Promise<string | null> {
  try {
    const token = await new Promise<string | null>((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
          resolve(null);
        } else {
          resolve(token);
        }
      });
    });
    if (token) return token;
  } catch {}

  const data = await chrome.storage.local.get(['auth_token']);
  return data.auth_token || null;
}

export async function checkStorageQuota(token: string) {
  try {
    const response = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const data = await response.json();

    if (data.error) {
      console.error('Drive API error:', data.error);
      throw new Error(data.error.message || 'Failed to check storage quota');
    }

    const { limit, usage } = data.storageQuota;
    const available = Number(limit) - Number(usage);
    return {
      limit: Number(limit),
      usage: Number(usage),
      available,
      status: (available > 524288000 ? 'normal' : available > 0 ? 'warning' : 'full') as 'normal' | 'warning' | 'full',
    };
  } catch (error) {
    console.error('Storage check failed:', error);
    throw error;
  }
}
