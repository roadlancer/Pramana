// End-to-end run of the built Pramana extension in headless Chromium.
// Google APIs are answered by an in-memory fake Drive; everything else is real Chrome.
//
//   pnpm test:e2e                 build, then run every scenario
//   node e2e/run.mjs <filter>     run scenarios whose name contains <filter>
//   CHROME_PATH=/path/to/chrome   use a specific Chromium (branded Chrome ignores --load-extension)
//   E2E_FAKE_MEDIA=1              fake camera/mic devices: enables the microphone scenario, but
//                                 Chromium then can't capture tabs, so recording scenarios skip
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { CDP } from './cdp.mjs';
import { createFakeDrive } from './fakeDrive.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const DIST = join(HERE, '..', 'dist');
const OUT = join(HERE, '.artifacts');
const EXT = join(OUT, 'ext');
const PROFILE = join(OUT, 'profile');
const SHOTS = join(OUT, 'shots');
const FAKE_MEDIA = !!process.env.E2E_FAKE_MEDIA;

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(process.env.HOME, '.cache', 'ms-playwright');
  const builds = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse() : [];
  for (const build of builds) {
    for (const bin of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      if (existsSync(join(cache, build, bin))) return join(cache, build, bin);
    }
  }
  throw new Error('No Chromium found. Run `npx playwright install chromium` or set CHROME_PATH.');
}
const CHROME = findChromium();
if (!existsSync(join(DIST, 'manifest.json'))) throw new Error('dist/ is missing. Run `pnpm build` first.');
const EXT_ID = 'dolihaakilhbijbbknbanpangkaoedgh';
const EXT_URL = `chrome-extension://${EXT_ID}`;
const WEB = 'http://127.0.0.1:5600';
const only = process.argv[2];

// Test copy of the build. Headless Chrome can't click the toolbar icon, which is what grants
// activeTab, so the copy gets <all_urls> to stand in for that grant.
mkdirSync(OUT, { recursive: true });
rmSync(EXT, { recursive: true, force: true });
rmSync(PROFILE, { recursive: true, force: true });
if (!only) rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
cpSync(DIST, EXT, { recursive: true });
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('<all_urls>');
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest, null, 2));

const drive = createFakeDrive({ thumbBase: WEB });
const server = http
  .createServer((req, res) => {
    const thumb = req.url.match(/^\/thumb\/(.+)$/);
    if (thumb) {
      const data = drive.thumb(thumb[1]);
      res.writeHead(data ? 200 : 404, { 'Content-Type': 'image/png' });
      return res.end(data);
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    if (req.url.startsWith('/other')) return res.end('<title>Other tab</title><body style="background:#000;margin:0"><h1 style="color:#fff">Other tab</h1></body>');
    res.end(readFileSync(join(HERE, 'page.html')));
  })
  .listen(5600, '127.0.0.1');

const chrome = spawn(CHROME, [
  '--headless=new',
  `--user-data-dir=${PROFILE}`,
  '--remote-debugging-port=0',
  `--disable-extensions-except=${EXT}`,
  `--load-extension=${EXT}`,
  `--allowlisted-extension-id=${EXT_ID}`,
  '--auto-accept-this-tab-capture',
  // Picks the test page in getDisplayMedia's share picker (Record Screen)
  '--auto-select-tab-capture-source-by-title=Acme Dashboard',
  // Either fake-media flag stops Chromium from capturing tabs, so they are opt-in
  ...(FAKE_MEDIA ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : []),
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=1280,800',
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
]);
let chromeLog = '';
chrome.stderr.on('data', (d) => (chromeLog += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, { timeout = 8000, interval = 100, what = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${what}${last instanceof Error ? `: ${last.message}` : ''}`);
}

const wsUrl = await waitFor(
  () => existsSync(join(PROFILE, 'DevToolsActivePort')) && readFileSync(join(PROFILE, 'DevToolsActivePort'), 'utf8').split('\n'),
  { timeout: 15000, what: 'Chrome to start' }
).then(([port, path]) => `ws://127.0.0.1:${port}${path}`);

const cdp = new CDP(wsUrl);
await cdp.ready();

// ---- Target wiring: every page, worker and offscreen doc gets fake Google APIs ----
const sessions = new Map(); // sessionId -> targetInfo
const consoleErrors = [];
cdp.on(async (msg) => {
  const { method, params, sessionId } = msg;
  if (method === 'Target.attachedToTarget') {
    const s = params.sessionId;
    sessions.set(s, params.targetInfo);
    try {
      await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*googleapis.com*' }] }, s);
      await cdp.send('Runtime.enable', {}, s);
      await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, s).catch(() => {});
    } catch {}
    await cdp.send('Runtime.runIfWaitingForDebugger', {}, s).catch(() => {});
  }
  if (method === 'Target.detachedFromTarget') sessions.delete(params.sessionId);
  if (method === 'Fetch.requestPaused') {
    const { request, requestId } = params;
    const body = Buffer.concat((request.postDataEntries || []).map((e) => Buffer.from(e.bytes || '', 'base64')));
    let r;
    try {
      r = drive.handle({ method: request.method, url: request.url, headers: request.headers, body });
    } catch (e) {
      r = { status: 500, headers: { 'Content-Type': 'application/json' }, body: Buffer.from(JSON.stringify({ error: { message: String(e) } })) };
    }
    const headers = { ...r.headers, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': 'Location, Range' };
    await cdp
      .send('Fetch.fulfillRequest', {
        requestId,
        responseCode: r.status,
        responseHeaders: Object.entries(headers).map(([name, value]) => ({ name, value: String(value) })),
        body: r.body.toString('base64'),
      }, sessionId)
      .catch((e) => console.log('fulfill failed', e.message));
  }
  if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(`[${sessions.get(sessionId)?.url}] ${params.exceptionDetails.exception?.description || params.exceptionDetails.text}`);
  }
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(`[${sessions.get(sessionId)?.url}] ${params.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
});
await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
await cdp.send('Target.setDiscoverTargets', { discover: true });
for (const t of (await cdp.send('Target.getTargets')).targetInfos) {
  if (t.type === 'service_worker' && t.url.startsWith(EXT_URL)) await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
}

// ---- Helpers ----
const sessionFor = (pred, what) => waitFor(() => [...sessions].find(([, t]) => pred(t))?.[0], { what });

async function open(url, { newWindow = true } = {}) {
  const { targetId } = await cdp.send('Target.createTarget', { url, newWindow });
  const s = await sessionFor((t) => t.targetId === targetId, `session for ${url}`);
  await cdp.send('Page.enable', {}, s);
  await waitFor(() => evaluate(s, 'document.readyState === "complete"'), { what: `${url} to load` });
  return s;
}

async function evaluate(s, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, s);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

const deepQuery = `(sel) => { const out = []; const walk = (root) => { root.querySelectorAll(sel).forEach((e) => out.push(e)); root.querySelectorAll('*').forEach((e) => e.shadowRoot && walk(e.shadowRoot)); }; walk(document); return out; }`;

async function rectOf(s, selector, text) {
  return waitFor(
    () =>
      evaluate(s, `(() => {
        const all = (${deepQuery})(${JSON.stringify(selector)});
        const el = all.find((e) => ${text ? `e.textContent.trim().includes(${JSON.stringify(text)})` : 'true'} && e.getClientRects().length);
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, top: r.top, width: r.width, height: r.height };
      })()`),
    { what: `${selector} ${text || ''}` }
  );
}

async function mouse(s, type, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, s);
}
async function click(s, selector, text) {
  const r = await rectOf(s, selector, text);
  await mouse(s, 'mouseMoved', r.x, r.y);
  await mouse(s, 'mousePressed', r.x, r.y);
  await mouse(s, 'mouseReleased', r.x, r.y);
  await sleep(150);
}
async function drag(s, x1, y1, x2, y2) {
  await mouse(s, 'mouseMoved', x1, y1);
  await mouse(s, 'mousePressed', x1, y1);
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + ((x2 - x1) * i) / 8, y: y1 + ((y2 - y1) * i) / 8, button: 'left', buttons: 1 }, s);
  await mouse(s, 'mouseReleased', x2, y2);
  await sleep(150);
}
async function key(s, keyName, modifiers = 0) {
  const codes = { Escape: 27, Delete: 46, Enter: 13 };
  const base = { key: keyName, code: codes[keyName] ? keyName : `Key${keyName.toUpperCase()}`, windowsVirtualKeyCode: codes[keyName] || keyName.toUpperCase().charCodeAt(0), modifiers };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }, s);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, s);
  await sleep(100);
}
async function shot(s, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, s);
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
}
// Clicks "Copy image" and returns what the clipboard then holds
async function copyFromEditor(s, origin, root = 'document') {
  await cdp.send('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, s);
  await evaluate(s, `navigator.clipboard.writeText('before copy').then(() => true)`);
  await click(s, 'button', 'Copy image');
  await waitFor(() => evaluate(s, `[...${root}.querySelectorAll('button')].some(b => b.textContent === 'Copied ✓')`), { what: 'Copied ✓' });
  return evaluate(s, `navigator.clipboard.read().then(async (items) => {
    const item = items.find(i => i.types.includes('image/png'));
    if (!item) return null;
    const bmp = await createImageBitmap(await item.getType('image/png'));
    return { w: bmp.width, h: bmp.height };
  })`);
}
const textOf = (s) => evaluate(s, `(${deepQuery})('body')[0].innerText + ' ' + (${deepQuery})('.pe-root, [role=status], [role=alert]').map(e => e.innerText).join(' ')`);
const uploads = () => drive.log.filter((l) => l.startsWith('UPLOAD'));
const findFile = (pred) => drive.files.find(pred);

// ---- Scenarios ----
const results = [];
class Skip extends Error {}
async function scenario(name, fn) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) return;
  if (/record/i.test(name)) {
    const inner = fn;
    fn = async () => {
      try {
        await inner();
      } finally {
        await stopAnyRecording().catch(() => {});
      }
    };
  }
  const t0 = Date.now();
  const errorsBefore = consoleErrors.length;
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`PASS  ${name}`);
  } catch (e) {
    if (e instanceof Skip) {
      results.push({ name, ok: true, skipped: e.message });
      console.log(`SKIP  ${name}\n      ${e.message}`);
      return;
    }
    results.push({ name, ok: false, error: e.message });
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
  for (const err of consoleErrors.slice(errorsBefore)) console.log(`      console: ${err.slice(0, 300)}`);
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// Signed-in state as the background stores it after Google login
const bootstrap = await open(`${EXT_URL}/src/popup/index.html`);
await evaluate(bootstrap, `chrome.storage.local.set({ is_signed_in: true, user_email: 'tester@example.com', user_name: 'Test User', auth_token: 'fake-token' })`);
const web = await open(`${WEB}/`);
const webTab = await evaluate(bootstrap, `chrome.tabs.query({ url: '${WEB}/*' }).then(([t]) => ({ id: t.id, windowId: t.windowId, url: t.url }))`);
await cdp.send('Target.closeTarget', { targetId: sessions.get(bootstrap).targetId });

// The popup runs as a tab here, so "active tab" has to be pointed at the web page
async function openPopup(activeTab = webTab) {
  const s = await open(`${EXT_URL}/src/popup/index.html`);
  await waitFor(async () => (await textOf(s)).includes('GB / '), { what: 'popup to load' });
  await evaluate(s, `chrome.tabs.realQuery = chrome.tabs.query.bind(chrome.tabs); chrome.tabs.query = async () => [${JSON.stringify(activeTab)}]; window.close = () => { window.__closed = true; }; true`);
  return s;
}

// Review tabs already open, so reviewTab() waits for the one the next recording opens
const seenReviewTabs = new Set();
async function reviewTab() {
  const lib = await sessionFor(
    (t) => t.url.includes('/src/dashboard/index.html?review=recording') && !seenReviewTabs.has(t.targetId),
    'Library review tab'
  );
  seenReviewTabs.add(sessions.get(lib).targetId);
  await cdp.send('Page.enable', {}, lib);
  await waitFor(async () => (await textOf(lib)).includes('Review your recording'), { what: 'review dialog', timeout: 10000 });
  return lib;
}

// Average brightness (0-255) of the recorded video at `fraction` of its length
async function frameColor(lib, fraction, name) {
  const result = await waitFor(() => evaluate(lib, `(async () => {
    const v = document.querySelector('video');
    if (!v || v.readyState < 1) return null;
    v.pause();
    if (!isFinite(v.duration)) { v.currentTime = 1e9; await new Promise(r => v.addEventListener('seeked', r, { once: true })); }
    v.currentTime = v.duration * ${fraction};
    await new Promise(r => v.addEventListener('seeked', r, { once: true }));
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    const x = c.getContext('2d'); x.drawImage(v, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return { rgb: Math.round(sum / (d.length / 4)), png: c.toDataURL('image/png') };
  })()`), { what: 'video frame', timeout: 10000 });
  if (name) writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(result.png.split(',')[1], 'base64'));
  return result.rgb;
}

// Leaves no recording running, so one failed recording scenario can't break the next
async function stopAnyRecording() {
  const p = await open(`${EXT_URL}/src/popup/index.html`);
  const state = await evaluate(p, `chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' })`);
  if (state?.recording) {
    await evaluate(p, `chrome.runtime.sendMessage({ type: 'STOP_RECORDING' })`);
    await reviewTab().then(discardReview).catch(() => {});
  }
  await cdp.send('Target.closeTarget', { targetId: sessions.get(p).targetId });
}

async function discardReview(lib) {
  await click(lib, 'button', 'Discard');
  await waitFor(async () => !(await textOf(lib)).includes('Review your recording'), { what: 'review to close' });
}

await scenario('Popup shows account, Drive usage meter, capture and record options', async () => {
  const s = await openPopup();
  const text = await waitFor(async () => {
    const t = await textOf(s);
    return t.includes('GB / ') && t;
  }, { what: 'storage meter' });
  assert(text.includes('Test User') && text.includes('3.2 GB / 15 GB'), `unexpected popup text: ${text}`);
  for (const label of ['Visible Tab', 'Select Area', 'Record Tab', 'Record Screen', 'Include microphone', 'Open Library']) {
    assert(text.includes(label), `missing ${label}`);
  }
  const bar = await evaluate(s, `document.querySelector('.storage-fill').style.width`);
  assert(bar.startsWith('21.3'), `storage bar width ${bar}`);
  await shot(s, '01-popup');
});

await scenario('Visible Tab capture → preview → Copy, Save to Drive (no alert)', async () => {
  const s = await openPopup();
  await evaluate(s, `window.alert = (m) => { window.__alert = m; }; true`);
  await click(s, 'button', 'Visible Tab');
  await rectOf(s, 'img[alt=Screenshot]');
  await shot(s, '02-popup-preview');
  await cdp.send('Browser.grantPermissions', { origin: EXT_URL, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, s);
  await evaluate(s, `navigator.clipboard.writeText('before copy').then(() => true)`);
  await click(s, 'button', 'Copy');
  await waitFor(async () => (await textOf(s)).includes('Screenshot copied.'), { what: 'copied notice' });
  const copied = await evaluate(s, `navigator.clipboard.read().then(async (items) => { const i = items.find(x => x.types.includes('image/png')); if (!i) return null; const b = await createImageBitmap(await i.getType('image/png')); const img = document.querySelector('img[alt=Screenshot]'); return b.width === img.naturalWidth && b.height === img.naturalHeight; })`);
  assert(copied, 'clipboard does not hold the screenshot');
  const before = uploads().length;
  await click(s, 'button', 'Save to Drive');
  await waitFor(async () => (await textOf(s)).includes('Screenshot saved to Google Drive.'), { what: 'saved notice' });
  assert(uploads().length === before + 1, 'no upload reached Drive');
  const f = drive.files.at(-1);
  assert(f.parents[0] === 'shots' && f.mimeType === 'image/png' && f.data.length > 10000, `bad upload ${f.name} ${f.mimeType} ${f.data.length}`);
  assert(!(await evaluate(s, 'window.__alert')), 'alert() was used');
});

await scenario('Visible Tab → Edit opens the full-page editor; draw, text, select/move, blur, undo, copy, save', async () => {
  const s = await openPopup();
  await click(s, 'button', 'Visible Tab');
  await rectOf(s, 'img[alt=Screenshot]');
  await click(s, 'button', 'Edit');
  const ed = await sessionFor((t) => t.url.includes('/src/editor/index.html'), 'editor tab');
  await cdp.send('Page.enable', {}, ed);
  await waitFor(() => evaluate(ed, `!!document.querySelector('canvas') && document.querySelector('canvas').width > 0`), { what: 'editor canvas' });
  const canvas = await rectOf(ed, 'canvas');
  const toolCount = await evaluate(ed, `document.querySelectorAll('.pe-tool-group .pe-tool-btn').length`);
  assert(toolCount === 9, `expected 9 tools, got ${toolCount}`);
  const saveButtons = await evaluate(ed, `[...document.querySelectorAll('button')].filter(b => b.textContent === 'Save to Drive').length`);
  assert(saveButtons === 1, `expected one Save button, got ${saveButtons}`);

  const cx = (fx) => canvas.left + canvas.width * fx;
  const cy = (fy) => canvas.top + canvas.height * fy;
  // 1) The very first drag (default Highlight tool) must draw
  await drag(ed, cx(0.05), cy(0.1), cx(0.3), cy(0.2));
  // 2) Rectangle
  await click(ed, 'button[title^="Rectangle"]');
  await drag(ed, cx(0.4), cy(0.4), cx(0.6), cy(0.6));
  // 3) Inline text (no prompt)
  await click(ed, 'button[title^="Text"]');
  await evaluate(ed, `window.prompt = () => { window.__prompted = true; return 'x'; }; true`);
  await mouse(ed, 'mousePressed', cx(0.7), cy(0.1));
  await mouse(ed, 'mouseReleased', cx(0.7), cy(0.1));
  await rectOf(ed, '.pe-text-input');
  await cdp.send('Input.insertText', { text: 'Fix this' }, ed);
  await key(ed, 'Enter');
  // 4) Blur over the API key line of the page capture
  await click(ed, 'button[title^="Blur"]');
  const secret = await evaluate(web, `(() => { const r = document.querySelector('.secret').getBoundingClientRect(); return { x: r.x / innerWidth, y: r.y / innerHeight, w: r.width / innerWidth, h: r.height / innerHeight }; })()`);
  await drag(ed, cx(secret.x), cy(secret.y), cx(secret.x + secret.w * 0.6), cy(secret.y + secret.h));
  await shot(ed, '03-editor-annotated');

  // 5) Select & move the rectangle, then undo the move
  await click(ed, 'button[title^="Select"]');
  await drag(ed, cx(0.4), cy(0.5), cx(0.5), cy(0.8));
  await shot(ed, '04-editor-moved');
  const moved = await evaluate(ed, `document.querySelector('canvas').toDataURL().length`);
  await key(ed, 'z', 2 /* ctrl */);
  const undone = await evaluate(ed, `document.querySelector('canvas').toDataURL().length`);
  assert(moved !== undone, 'undo did not change the canvas');
  assert(!(await evaluate(ed, 'window.__prompted')), 'prompt() was used for text');

  // 6) Refresh keeps the screenshot
  await cdp.send('Page.reload', {}, ed);
  await sleep(800);
  await waitFor(() => evaluate(ed, `document.readyState === 'complete' && !!document.querySelector('canvas') && document.querySelector('canvas').width > 0`), { what: 'editor after reload' });

  // 7) Copy image puts the annotated screenshot on the clipboard
  await drag(ed, cx(0.1), cy(0.7), cx(0.3), cy(0.9));
  const copied = await copyFromEditor(ed, EXT_URL);
  const canvasSize = await evaluate(ed, `[document.querySelector('canvas').width, document.querySelector('canvas').height]`);
  assert(copied && copied.w === canvasSize[0] && copied.h === canvasSize[1], `clipboard has ${JSON.stringify(copied)}, canvas is ${canvasSize}`);

  // 8) Save with Ctrl+S
  const before = uploads().length;
  await key(ed, 's', 2);
  await waitFor(() => uploads().length === before + 1, { what: 'editor upload' });
  await waitFor(async () => (await textOf(ed)).includes('saved to Google Drive'), { what: 'editor saved toast' });
  const f = drive.files.at(-1);
  assert(f.name.startsWith('screenshot-edited-') && f.parents[0] === 'shots', `bad edited upload ${f.name}`);
  writeFileSync(join(SHOTS, '05-edited-upload.png'), f.data);
  const pending = await evaluate(ed, `chrome.storage.local.get(null).then(d => Object.keys(d).filter(k => k.startsWith('pending_edit_')).length)`).catch(() => 0);
  assert(pending === 0, `pending screenshot not cleared (${pending})`);
});

await scenario('Select Area on a web page: Escape cancels; drag opens isolated editor; copy; save uploads', async () => {
  const s = await openPopup();
  await evaluate(s, `window.__calls = []; const es = chrome.scripting.executeScript.bind(chrome.scripting); chrome.scripting.executeScript = (...a) => { window.__calls.push('exec'); return es(...a).then(r => { window.__calls.push('exec-ok'); return r; }, e => { window.__calls.push('exec-err ' + e.message); throw e; }); }; const sm = chrome.tabs.sendMessage.bind(chrome.tabs); chrome.tabs.sendMessage = (...a) => { window.__calls.push('send'); return sm(...a).then(r => { window.__calls.push('send-ok ' + JSON.stringify(r)); return r; }, e => { window.__calls.push('send-err ' + e.message); throw e; }); }; true`);
  await click(s, 'button', 'Select Area');
  await waitFor(() => evaluate(web, `!!document.getElementById('pramana-area-overlay')`), { what: 'selection overlay' }).catch(async (e) => {
    throw new Error(e.message + ' | calls: ' + JSON.stringify(await evaluate(s, 'window.__calls')) + ' | popup: ' + (await textOf(s).catch(() => '?')).replace(/\s+/g, ' ').slice(0, 300) + ' | web url: ' + (await evaluate(web, 'location.href').catch((x) => x.message)));
  });
  await key(web, 'Escape');
  assert(!(await evaluate(web, `!!document.getElementById('pramana-area-overlay')`)), 'Escape did not cancel the overlay');

  // Second Select Area click injects the script again; it must not double up
  await click(s, 'button', 'Select Area');
  await waitFor(() => evaluate(web, `!!document.getElementById('pramana-area-overlay')`), { what: 'overlay again' });
  await click(s, 'button', 'Select Area').catch(() => {});
  await waitFor(() => evaluate(web, `!!document.getElementById('pramana-area-overlay')`), { what: 'overlay third' });
  await shot(web, '06-overlay');
  await drag(web, 20, 60, 700, 330);
  await waitFor(() => evaluate(web, `!!document.getElementById('pramana-editor-host')`), { what: 'inline editor' });
  const hosts = await evaluate(web, `document.querySelectorAll('#pramana-editor-host').length`);
  assert(hosts === 1, `${hosts} editors opened`);
  await waitFor(() => evaluate(web, `document.getElementById('pramana-editor-host').shadowRoot.querySelector('canvas').width > 0`), { what: 'inline canvas' });
  const size = await evaluate(web, `(() => { const c = document.getElementById('pramana-editor-host').shadowRoot.querySelector('canvas'); return [c.width, c.height, devicePixelRatio]; })()`);
  assert(Math.abs(size[0] - 680 * size[2]) <= 2 && Math.abs(size[1] - 270 * size[2]) <= 2, `crop size ${size}`);

  // Page CSS must not leak into the editor
  const btnBg = await evaluate(web, `getComputedStyle(document.getElementById('pramana-editor-host').shadowRoot.querySelector('.pe-btn-primary')).backgroundColor`);
  assert(btnBg !== 'rgb(255, 105, 180)', 'page CSS leaked into the editor');

  // Keys go to the editor, not the page
  await evaluate(web, `window.pageKeys.length = 0; true`);
  await key(web, 'r');
  const pageKeys = await evaluate(web, `window.pageKeys.length`);
  assert(pageKeys === 0, `page received ${pageKeys} editor keystrokes`);

  const c = await rectOf(web, 'canvas', '');
  const canvasRect = await evaluate(web, `(() => { const r = document.getElementById('pramana-editor-host').shadowRoot.querySelector('canvas').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
  await drag(web, canvasRect.left + 20, canvasRect.top + 20, canvasRect.left + canvasRect.width / 2, canvasRect.top + canvasRect.height / 2);
  void c;
  await shot(web, '07-inline-editor');
  const host = `document.getElementById('pramana-editor-host').shadowRoot`;
  const copied = await copyFromEditor(web, WEB, host);
  const canvasSize = await evaluate(web, `[${host}.querySelector('canvas').width, ${host}.querySelector('canvas').height]`);
  assert(copied && copied.w === canvasSize[0] && copied.h === canvasSize[1], `clipboard has ${JSON.stringify(copied)}, canvas is ${canvasSize}`);
  const before = uploads().length;
  await click(web, 'button', 'Save to Drive');
  await waitFor(() => uploads().length === before + 1, { what: 'inline upload' });
  await waitFor(() => evaluate(web, `!document.getElementById('pramana-editor-host')`), { what: 'editor to close' });
  await waitFor(async () => (await evaluate(web, 'document.body.innerText')).includes('Screenshot saved to Google Drive!'), { what: 'toast' });
  writeFileSync(join(SHOTS, '08-inline-upload.png'), drive.files.at(-1).data);
});

await scenario('Record Tab: popup closes itself, pause/resume (paused time left out), review in Library, save to Drive', async () => {
  if (FAKE_MEDIA) throw new Skip('tab capture does not work with fake media devices');
  const s = await openPopup();
  await click(s, 'button', 'Record Tab');
  const t0 = Date.now();
  const started = await waitFor(async () => {
    if (await evaluate(s, 'window.__closed')) return 'ok';
    const t = await textOf(s);
    return /fail|Could not|error/i.test(t) && t;
  }, { what: 'popup to close itself once recording starts', timeout: 10000 });
  if (started !== 'ok') throw new Error('popup says: ' + started.split('\n').filter((l) => /fail|Could not|error/i.test(l)).join(' | '));
  const offscreen = await waitFor(async () => (await cdp.send('Target.getTargets')).targetInfos.find((t) => t.url.includes('/src/offscreen/')), { what: 'offscreen document' });
  assert(offscreen, 'no offscreen document');
  await shot(s, '09-popup-recording');
  // Close the popup mid-recording
  await cdp.send('Target.closeTarget', { targetId: sessions.get(s).targetId });
  await sleep(2500);

  const s2 = await openPopup();
  await waitFor(async () => /● Recording 0:0[2-9]/.test(await textOf(s2)), { what: 'reopened popup to show running timer' });

  // Pause for 3 s: the badge and timer show it, and the video leaves it out
  await click(s2, 'button', 'Pause');
  await waitFor(async () => (await textOf(s2)).includes('❚❚ Paused'), { what: 'paused state' });
  assert((await evaluate(s2, 'chrome.action.getBadgeText({})')) === '❚❚', 'badge does not show the pause');
  const frozen = (await textOf(s2)).match(/Paused (\d+:\d+)/)[1];
  await sleep(3000);
  assert((await textOf(s2)).includes(`Paused ${frozen}`), 'timer kept running while paused');
  await click(s2, 'button', 'Resume');
  await waitFor(async () => (await textOf(s2)).includes('● Recording'), { what: 'resumed state' });
  assert((await evaluate(s2, 'chrome.action.getBadgeText({})')) === 'REC', 'badge did not return to REC');
  await sleep(1000);
  await click(s2, 'button', 'Stop');
  const wallSeconds = (Date.now() - t0) / 1000;
  const lib = await reviewTab();
  const [rawDuration, duration] = await waitFor(() => evaluate(lib, `(async () => { const v = document.querySelector('video'); if (!v || v.readyState < 1) return null; const raw = v.duration; if (!isFinite(v.duration)) { v.currentTime = 1e9; await new Promise(r => setTimeout(r, 300)); } return [String(raw), v.duration]; })()`), { what: 'video metadata' });
  console.log(`      MP4 duration known before seeking: ${rawDuration}`);
  assert(duration > 1.5, `recording too short: ${duration}s`);
  console.log(`      video ${duration.toFixed(1)}s for ${wallSeconds.toFixed(1)}s on the clock (3s paused)`);
  assert(duration < wallSeconds - 2, `paused time is in the video: ${duration}s of ${wallSeconds}s`);
  const [vw, vh] = await evaluate(lib, `[document.querySelector('video').videoWidth, document.querySelector('video').videoHeight]`);
  const [tw, th] = await evaluate(web, `[innerWidth * devicePixelRatio, innerHeight * devicePixelRatio]`);
  console.log(`      recorded ${vw}x${vh} for a ${tw}x${th} tab`);
  assert(Math.abs(vw / vh - tw / th) < 0.05, `video ${vw}x${vh} doesn't match the tab's shape ${tw}x${th} (letterboxed)`);
  await shot(lib, '10-recording-review');
  const before = uploads().length;
  await click(lib, 'button', 'Save to Drive');
  await waitFor(() => uploads().length === before + 1, { what: 'recording upload', timeout: 15000 });
  const f = drive.files.at(-1);
  assert(f.parents[0] === 'recs' && f.mimeType === 'video/mp4' && f.name.endsWith('.mp4') && f.data.length > 1000, `bad recording ${f.name} ${f.mimeType} ${f.data.length}`);
  assert(f.data.subarray(4, 8).toString() === 'ftyp', 'uploaded file is not an MP4 container');
  await waitFor(async () => !(await textOf(lib)).includes('Review your recording'), { what: 'review to close' });
  writeFileSync(join(SHOTS, '11-recording.mp4'), f.data);
  const badge = await evaluate(lib, `chrome.action.getBadgeText({})`);
  assert(badge === '', `badge still "${badge}"`);
});

await scenario('Record Screen: popup closes, recorder window minimizes, icon shows REC + shortcuts, records what was picked', async () => {
  if (FAKE_MEDIA) throw new Skip('screen capture does not work with fake media devices');
  const s = await openPopup();
  await click(s, 'button', 'Record Screen');
  await waitFor(() => evaluate(s, 'window.__closed'), { what: 'popup to close itself' });
  const rec = await sessionFor((t) => t.url.includes('/src/recorder/index.html'), 'recorder window');
  await cdp.send('Page.enable', {}, rec);
  // No click: the picker opens by itself (the test flag picks the Acme Dashboard tab in it)
  await waitFor(async () => (await textOf(rec)).includes('Stop recording'), { what: 'screen recording to start without a click', timeout: 10000 });
  await shot(rec, '09b-recorder-window');
  const badge = await evaluate(rec, `chrome.action.getBadgeText({})`);
  assert(badge === 'REC', `badge "${badge}"`);
  const title = await evaluate(rec, `chrome.action.getTitle({})`);
  assert(title.includes('Alt+Shift+S stop'), `icon tooltip "${title}"`);
  const winState = await waitFor(() => evaluate(rec, `chrome.windows.getCurrent().then(w => w.state === 'minimized' && w.state)`), { what: 'recorder window to minimize' });
  assert(winState === 'minimized', `recorder window is ${winState}`);
  await sleep(2500);

  // Stop from the popup, like a user would
  const s2 = await openPopup();
  await waitFor(async () => (await textOf(s2)).includes('● Recording'), { what: 'popup to show the screen recording' });
  await click(s2, 'button', 'Stop');
  const lib = await reviewTab();
  const color = await frameColor(lib, 0.5, '10b-screen-recording-frame');
  assert(color > 180, `expected the light test page in the video, got brightness ${color}`);
  await waitFor(async () => !(await cdp.send('Target.getTargets')).targetInfos.some((t) => t.url.includes('/src/recorder/')), { what: 'recorder window to close' });
  await discardReview(lib);
});

await scenario('Record Tab keeps recording the original tab after switching to another tab', async () => {
  if (FAKE_MEDIA) throw new Skip('tab capture does not work with fake media devices');
  // A normal browser window, so the tab switch happens the way it does for a user
  const helper = await open(`${EXT_URL}/src/popup/index.html`);
  const win = await evaluate(helper, `chrome.windows.create({ url: '${WEB}/?switch', type: 'normal', focused: true }).then(async (w) => { await new Promise(r => setTimeout(r, 800)); const [t] = await chrome.tabs.query({ windowId: w.id }); return { windowId: w.id, tab: { id: t.id, windowId: w.id, url: t.url } }; })`);
  await cdp.send('Target.closeTarget', { targetId: sessions.get(helper).targetId });

  const s = await openPopup(win.tab);
  await click(s, 'button', 'Record Tab');
  await waitFor(async () => (await textOf(s)).includes('● Recording'), { what: 'recording to start', timeout: 10000 });
  await sleep(2000);
  const other = await evaluate(s, `chrome.tabs.create({ windowId: ${win.windowId}, url: '${WEB}/other', active: true }).then(t => t.id)`);
  await waitFor(async () => (await evaluate(s, `chrome.tabs.realQuery({ windowId: ${win.windowId}, active: true }).then(([t]) => t?.id)`)) === other, { what: 'other tab to become active' }).catch(async (e) => {
    throw new Error(e.message + ' | ' + JSON.stringify(await evaluate(s, `chrome.tabs.realQuery({}).then(ts => ts.map(t => [t.id, t.windowId, t.active, t.url.slice(0, 50)]))`)) + ' | win ' + JSON.stringify(win) + ' other ' + other);
  });
  await sleep(3000);
  const stillRecording = await evaluate(s, `chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' }).then(r => !!r.recording)`);
  assert(stillRecording, 'recording stopped when the tab was switched');
  await click(s, 'button', 'Stop');
  const lib = await reviewTab();
  const before = await frameColor(lib, 0.15, '10c-frame-before-switch');
  const after = await frameColor(lib, 0.9, '10d-frame-after-switch');
  console.log(`      brightness before switch ${before}, after switch ${after} (recorded page is light, other tab is black)`);
  // The other tab is black (~0); the recorded page stays light
  assert(after > 120 && Math.abs(after - before) < 30, `after switching tabs the video changed to brightness ${after}: it followed the new tab`);
  await evaluate(s, `chrome.windows.remove(${win.windowId})`);
  await discardReview(lib);
});

await scenario('Closing the recorded tab stops the recording and keeps what was recorded', async () => {
  if (FAKE_MEDIA) throw new Skip('tab capture does not work with fake media devices');
  const doomed = await open(`${WEB}/?doomed`);
  const doomedTab = await evaluate(doomed, `1`).then(async () => {
    const p = await open(`${EXT_URL}/src/popup/index.html`);
    const t = await evaluate(p, `chrome.tabs.query({ url: '${WEB}/?doomed' }).then(([t]) => ({ id: t.id, windowId: t.windowId, url: t.url }))`);
    await cdp.send('Target.closeTarget', { targetId: sessions.get(p).targetId });
    return t;
  });
  const s = await openPopup(doomedTab);
  // This one is recorded as WebM, chosen in the popup
  await evaluate(s, `(() => { const sel = [...document.querySelectorAll('select')].find(x => x.closest('label')?.textContent.includes('Format')); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, 'webm'); sel.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await click(s, 'button', 'Record Tab');
  await waitFor(async () => (await textOf(s)).includes('● Recording'), { what: 'recording to start', timeout: 10000 });
  await sleep(2000);
  await cdp.send('Target.closeTarget', { targetId: sessions.get(doomed).targetId });
  const lib = await reviewTab();
  const duration = await waitFor(() => evaluate(lib, `(async () => { const v = document.querySelector('video'); if (!v || v.readyState < 1) return null; if (!isFinite(v.duration)) { v.currentTime = 1e9; await new Promise(r => setTimeout(r, 300)); } return v.duration; })()`), { what: 'video metadata' });
  assert(duration > 1, `recording too short: ${duration}s`);
  const reviewName = await evaluate(lib, `document.querySelector('[aria-label="Recording name"]').value`);
  assert(reviewName.endsWith('.webm'), `expected a WebM recording, got ${reviewName}`);
  await evaluate(lib, `chrome.storage.local.set({ record_format: 'mp4' })`);
  const state = await evaluate(lib, `chrome.action.getBadgeText({})`);
  assert(state === '', `badge still "${state}"`);
  await discardReview(lib);
});

await scenario('Library: thumbnails, sort, search, preview, rename, share/unshare, download, trash', async () => {
  const lib = await open(`${EXT_URL}/src/dashboard/index.html`);
  await waitFor(async () => (await textOf(lib)).includes('login-page.png'), { what: 'file list' });
  await waitFor(async () => (await textOf(lib)).includes('Drive: 3.2 GB / 15 GB'), { what: 'storage meter' });
  await waitFor(() => evaluate(lib, `[...document.querySelectorAll('.file-preview img')].filter(i => i.complete && i.naturalWidth > 0).length >= 2`), { what: 'thumbnails' });
  await shot(lib, '12-library');

  await evaluate(lib, `(() => { const s = document.querySelector('.sort-select'); s.value = 'name'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(200);
  const names = await evaluate(lib, `[...document.querySelectorAll('.file-info h3')].map(h => h.textContent)`);
  assert(JSON.stringify(names) === JSON.stringify([...names].sort((a, b) => a.localeCompare(b))), `not sorted by name: ${names}`);

  await click(lib, '.file-card', 'login-page.png');
  await waitFor(() => evaluate(lib, `!!document.querySelector('.preview-modal img.preview-image')?.naturalWidth`), { what: 'image preview' });

  // Rename
  await evaluate(lib, `(() => { const i = document.querySelector('.preview-modal .rename-input'); i.focus(); i.select(); })()`);
  await cdp.send('Input.insertText', { text: 'login-error.png' }, lib);
  await key(lib, 'Enter');
  await waitFor(() => findFile((f) => f.id === 'img1')?.name === 'login-error.png', { what: 'rename in Drive' });

  // Share → link copied, Stop sharing
  await cdp.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: EXT_URL }).catch(() => {});
  await click(lib, 'button', 'Share link');
  await waitFor(() => findFile((f) => f.id === 'img1')?.shared, { what: 'share in Drive' });
  await waitFor(async () => (await textOf(lib)).includes('Stop sharing'), { what: 'shared state' });
  await shot(lib, '13-preview-shared');
  await click(lib, 'button', 'Stop sharing');
  await waitFor(() => findFile((f) => f.id === 'img1')?.shared === false, { what: 'unshare in Drive' });

  // Download through the browser's download path
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SHOTS, eventsEnabled: true });
  await click(lib, 'button', 'Download');
  await waitFor(() => existsSync(join(SHOTS, 'login-error.png')), { what: 'downloaded file' });

  // Trash with in-page confirmation
  await click(lib, '.preview-actions button', 'Delete');
  await rectOf(lib, '[role=alertdialog]');
  await shot(lib, '14-confirm-trash');
  await click(lib, '[role=alertdialog] button', 'Move to trash');
  await waitFor(() => findFile((f) => f.id === 'img1')?.trashed === true, { what: 'file moved to Drive trash' });
  await waitFor(async () => !(await textOf(lib)).includes('login-error.png'), { what: 'card removed' });
});

await scenario('Library: recorded video plays in the preview', async () => {
  const video = drive.files.find((f) => f.mimeType?.startsWith('video/'));
  if (!video) throw new Skip('needs the tab recording scenario to have run');
  const lib = await open(`${EXT_URL}/src/dashboard/index.html`);
  await click(lib, '.file-card', video.name);
  await waitFor(() => evaluate(lib, `(document.querySelector('.preview-modal video')?.readyState || 0) >= 1`), { what: 'video to load' });
  await shot(lib, '15-video-preview');
});

await scenario('Help page: recording guide, Mac permission, Ubuntu commands with undo', async () => {
  const h = await open(`${EXT_URL}/src/dashboard/index.html?help=ubuntu`);
  const text = await waitFor(async () => { const t = await textOf(h); return t.includes('Pramana Help') && t; }, { what: 'help page' });
  for (const part of ["Ubuntu: remove the screen-sharing pop-ups", 'WaylandEnable=false', '--auto-select-desktop-capture-source', 'Undo', 'Mac: allow screen recording']) {
    assert(text.includes(part), `help page is missing "${part}"`);
  }
  await shot(h, '17-help');
  await cdp.send('Target.closeTarget', { targetId: sessions.get(h).targetId });
});

await scenario('Library asks to sign in when signed out', async () => {
  const lib = await open(`${EXT_URL}/src/dashboard/index.html`);
  await evaluate(lib, `chrome.storage.local.set({ is_signed_in: false })`);
  await cdp.send('Page.reload', {}, lib);
  await sleep(800);
  await waitFor(async () => (await textOf(lib)).includes('Sign in with Google'), { what: 'sign-in prompt' });
  assert(!(await textOf(lib)).includes('No files'), 'still claims there are no files');
  await shot(lib, '16-library-signed-out');
  await evaluate(lib, `chrome.storage.local.set({ is_signed_in: true })`);
});

await scenario('Microphone permission page grants access', async () => {
  if (!FAKE_MEDIA) throw new Skip('needs a microphone; rerun with E2E_FAKE_MEDIA=1');
  const p = await open(`${EXT_URL}/src/dashboard/index.html?grant=microphone`);
  await click(p, 'button', 'Allow microphone');
  await waitFor(async () => (await textOf(p)).includes('Microphone enabled'), { what: 'mic granted' });
});

const skipped = results.filter((r) => r.skipped).length;
console.log(`\n${results.filter((r) => r.ok && !r.skipped).length} passed, ${results.filter((r) => !r.ok).length} failed, ${skipped} skipped`);
console.log(`Screenshots: ${SHOTS}`);
console.log('Drive log:\n  ' + drive.log.join('\n  '));
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ results, driveLog: drive.log, consoleErrors }, null, 2));
cdp.close();
chrome.kill();
server.close();
if (results.some((r) => !r.ok)) {
  writeFileSync(join(OUT, 'chrome-stderr.log'), chromeLog);
  process.exitCode = 1;
}
