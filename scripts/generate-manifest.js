import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const envPath = join(process.cwd(), '.env');
const envContent = readFileSync(envPath, 'utf-8');

const envVars = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    if (key) {
      envVars[key] = value;
    }
  }
});

// --store: the Chrome Web Store assigns the extension ID, so a store upload carries no "key"
const forStore = process.argv.includes('--store');
const { version } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));

// Pins the extension ID for unpacked builds, so the OAuth client works during development.
// Set VITE_EXTENSION_KEY to the store item's public key to give dev builds the store's ID.
const DEV_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtyllFskxE9Rsg3Jz9AYJfLH7iOj3wSUonoENlpAME8gtenpTRkNbxdF42wH027OUmHBz5Dm40lxO9IOucPiz8nEZnWQSzBFgVmqTW2RvGl0geVcYar/quKC1iS5hAtU0CC+/wXBFKNN9ti8oM0vbPgWlg8oJ22p8YlqkQxnqFTu0nZx3m7j1iZ/M976n9QxDV565B2xthO105oJB9CCAmG1uAhckHW4o5ksArmLxoFmx/RHclQI3WKHqcxIFVjFPpak2oA5ykcyFvYXcdyb85edQ3fCaMRtvru1EQzm88pavPbS6/Ki3p9FmJACqSZUwuhgQ8wOw3vFH+atjX8tQfwIDAQAB";

const clientId = envVars['VITE_GOOGLE_CLIENT_ID'];
if (!clientId) {
  console.error('VITE_GOOGLE_CLIENT_ID not found in .env');
  process.exit(1);
}

const manifestTemplate = {
  manifest_version: 3,
  name: "Pramana",
  version,
  ...(forStore ? {} : { key: envVars['VITE_EXTENSION_KEY'] || DEV_KEY }),
  description: "Capture, edit, store, organize, and share screenshots and recordings — all from your own Google Drive.",
  permissions: [
    "identity",
    "tabCapture",
    "storage",
    "activeTab",
    "scripting",
    "offscreen"
  ],
  host_permissions: [
    "https://www.googleapis.com/*"
  ],
  oauth2: {
    client_id: clientId,
    scopes: ["https://www.googleapis.com/auth/drive.file"]
  },
  background: {
    service_worker: "background.js",
    type: "module"
  },
  action: {
    default_popup: "src/popup/index.html",
    default_icon: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  commands: {
    "pause-recording": {
      suggested_key: { default: "Alt+Shift+P" },
      description: "Pause or resume the recording"
    },
    "stop-recording": {
      suggested_key: { default: "Alt+Shift+S" },
      description: "Stop the recording"
    }
  },
  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
};

const distDir = join(process.cwd(), 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifestTemplate, null, 2));
console.log(`manifest.json ${version}${forStore ? ' (store, no key)' : ''} generated with client ID:`, clientId.substring(0, 20) + '...');
