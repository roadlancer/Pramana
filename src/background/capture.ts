/// <reference types="chrome" />

export async function handleCapture(
  payload: { mode: 'full' | 'tab' | 'area' | 'start' | 'stop'; tabId?: number; source?: string; mic?: boolean },
  sender: chrome.runtime.MessageSender
) {
  switch (payload.mode) {
    case 'tab': {
      const tabId = payload.tabId || sender.tab?.id;
      if (!tabId) return { success: false, error: 'No tab ID' };
      try {
        const tab = await chrome.tabs.get(tabId);
        return await captureTab(tab.windowId);
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
    default:
      console.warn('Capture mode not handled in background:', payload.mode);
      return { success: false, error: 'Use popup for capture' };
  }
}

export async function handleCaptureArea(
  area: { x: number; y: number; width: number; height: number },
  sender: chrome.runtime.MessageSender
) {
  try {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (!tabId || !windowId) return { success: false, error: 'No tab/window info' };

    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    const base64 = dataUrl.split(',')[1];

    return { success: true, base64, area };
  } catch (error) {
    console.error('Area capture failed:', error);
    return { success: false, error: String(error) };
  }
}

async function captureTab(windowId?: number) {
  if (!windowId) return { success: false, error: 'No window ID' };
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    return { success: true, dataUrl, type: 'screenshot' };
  } catch (error) {
    console.error('Tab capture failed:', error);
    return { success: false, error: String(error) };
  }
}
