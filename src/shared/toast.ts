// Small non-blocking notification, used instead of alert() on pages and inside the on-page editor
export type ToastKind = 'info' | 'success' | 'error';

const COLORS: Record<ToastKind, string> = { info: '#1f6feb', success: '#238636', error: '#da3633' };

export function showToast(message: string, kind: ToastKind = 'info', root: Node = document.body, durationMs = 3500) {
  const toast = document.createElement('div');
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; max-width: 360px;
    padding: 12px 16px; border-radius: 8px; color: #fff; background: #161b22;
    border-left: 4px solid ${COLORS[kind]}; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  `;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
  return toast;
}
