// The editor injects its own styles so it looks the same in the extension's editor tab
// and inside the shadow root it gets on a web page (where page CSS can't reach it).
export const EDITOR_CSS = `
.pe-root, .pe-root * { box-sizing: border-box; margin: 0; }
.pe-root {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  background: #0d1117; color: #e6edf3;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.pe-header {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 16px; background: #161b22; border-bottom: 1px solid #30363d; flex-shrink: 0;
}
.pe-title { font-size: 15px; font-weight: 600; }
.pe-header-actions { display: flex; gap: 8px; }
.pe-btn {
  padding: 7px 14px; border-radius: 6px; font: inherit; font-weight: 500; cursor: pointer;
  background: #21262d; border: 1px solid #30363d; color: #c9d1d9; transition: background 0.15s;
}
.pe-btn:hover:not(:disabled) { background: #30363d; }
.pe-btn:disabled { opacity: 0.6; cursor: progress; }
.pe-btn-primary { background: #238636; border-color: #2ea043; color: #fff; }
.pe-btn-primary:hover:not(:disabled) { background: #2ea043; }
.pe-body { flex: 1; display: flex; min-height: 0; }
.pe-toolbar {
  width: 248px; flex-shrink: 0; overflow-y: auto; padding: 12px;
  display: flex; flex-direction: column; gap: 12px;
  background: #161b22; border-right: 1px solid #30363d;
}
.pe-tool-group, .pe-history-group { display: flex; flex-wrap: wrap; gap: 4px; }
.pe-tool-btn {
  display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;
  background: transparent; border: 1px solid transparent; border-radius: 6px;
  color: #8b949e; cursor: pointer; transition: all 0.15s;
}
.pe-tool-btn:hover:not(:disabled) { background: #21262d; color: #e6edf3; }
.pe-tool-btn.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }
.pe-tool-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.pe-divider { height: 1px; background: #30363d; }
.pe-section { display: flex; flex-direction: column; gap: 8px; }
.pe-section[hidden] { display: none; }
.pe-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }
.pe-hint { font-size: 12px; color: #8b949e; }
.pe-swatches, .pe-emoji-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.pe-swatch {
  width: 24px; height: 24px; border-radius: 4px; border: 2px solid transparent; cursor: pointer;
}
.pe-swatch.active { border-color: #fff; box-shadow: 0 0 0 2px #1f6feb; }
.pe-row { display: flex; align-items: center; gap: 8px; }
.pe-row input[type=range] { flex: 1; accent-color: #1f6feb; }
.pe-row span { font-size: 11px; color: #8b949e; min-width: 28px; }
.pe-row span:last-child { text-align: right; }
.pe-emoji-btn {
  width: 32px; height: 32px; font-size: 18px; cursor: pointer;
  background: transparent; border: 1px solid transparent; border-radius: 4px;
}
.pe-emoji-btn:hover { background: #21262d; }
.pe-emoji-btn.active { border-color: #1f6feb; background: #1f6feb22; }
.pe-stage {
  flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center;
  overflow: hidden; padding: 16px;
}
.pe-canvas-wrap { position: relative; line-height: 0; box-shadow: 0 4px 24px rgba(0,0,0,0.5); }
.pe-canvas-wrap canvas { display: block; }
.pe-text-input {
  position: absolute; min-width: 40px; padding: 0 2px; line-height: 1.2;
  background: rgba(13,17,23,0.6); border: 1px dashed #1f6feb; outline: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
`;
