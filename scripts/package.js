// Checks dist/ is fit for the Chrome Web Store and zips it to release/pramana-<version>.zip.
// Run through `pnpm package`, which builds first. The store manifest (no "key") is only in the zip:
// dist/ gets the development manifest back, so the unpacked extension keeps its ID.
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { join, relative } from 'path';

const root = process.cwd();
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const writeManifest = (...args) =>
  execFileSync('node', [join(root, 'scripts/generate-manifest.js'), ...args], { stdio: 'inherit' });

function listFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) listFiles(path, out);
    else out.push(relative(dist, path));
  }
  return out;
}

function problemsWith(manifest, files) {
  const problems = [];
  if (manifest.key) problems.push('manifest has a "key": the store assigns the extension ID');
  if (manifest.version !== version) problems.push(`manifest version ${manifest.version} is not package.json's ${version}`);
  if (!/^\d+-\w+\.apps\.googleusercontent\.com$/.test(manifest.oauth2?.client_id || '')) {
    problems.push(`oauth2.client_id "${manifest.oauth2?.client_id}" is not a real Google client ID: set VITE_GOOGLE_CLIENT_ID in .env`);
  }
  const referenced = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const file of referenced) if (!files.includes(file)) problems.push(`manifest refers to ${file}, which is not in dist/`);
  for (const file of files) if (/\.map$|__tests__|\.test\.|e2e\//.test(file)) problems.push(`${file} should not ship`);
  return problems;
}

function pack() {
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf-8'));
  const files = listFiles(dist);
  const problems = problemsWith(manifest, files);
  if (problems.length) {
    console.error('Not packaged:\n' + problems.map((p) => `  - ${p}`).join('\n'));
    process.exitCode = 1;
    return;
  }

  // The SVG icons are sources for the PNGs; the store package only needs what the manifest uses
  const shipped = files.filter((f) => !f.endsWith('.svg'));
  const out = join(root, 'release', `pramana-${version}.zip`);
  mkdirSync(join(root, 'release'), { recursive: true });
  rmSync(out, { force: true });
  execFileSync('zip', ['-q', '-X', out, ...shipped], { cwd: dist });

  console.log(`release/pramana-${version}.zip: ${shipped.length} files, ${(statSync(out).size / 1024).toFixed(0)} KB`);
  console.log('Upload it at https://chrome.google.com/webstore/devconsole');
  if (!existsSync(join(root, '.env'))) console.warn('Note: no .env found');
}

writeManifest('--store');
try {
  pack();
} finally {
  writeManifest();
}
