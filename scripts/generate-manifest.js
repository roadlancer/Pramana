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

const clientId = envVars['VITE_GOOGLE_CLIENT_ID'];
if (!clientId) {
  console.error('VITE_GOOGLE_CLIENT_ID not found in .env');
  process.exit(1);
}

const manifestTemplate = {
  manifest_version: 3,
  name: "Pramana",
  version: "0.1.0",
  key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtyllFskxE9Rsg3Jz9AYJfLH7iOj3wSUonoENlpAME8gtenpTRkNbxdF42wH027OUmHBz5Dm40lxO9IOucPiz8nEZnWQSzBFgVmqTW2RvGl0geVcYar/quKC1iS5hAtU0CC+/wXBFKNN9ti8oM0vbPgWlg8oJ22p8YlqkQxnqFTu0nZx3m7j1iZ/M976n9QxDV565B2xthO105oJB9CCAmG1uAhckHW4o5ksArmLxoFmx/RHclQI3WKHqcxIFVjFPpak2oA5ykcyFvYXcdyb85edQ3fCaMRtvru1EQzm88pavPbS6/Ki3p9FmJACqSZUwuhgQ8wOw3vFH+atjX8tQfwIDAQAB",
  description: "Capture, edit, store, organize, and share screenshots and recordings — all from your own Google Drive.",
  permissions: [
    "identity",
    "tabCapture",
    "desktopCapture",
    "storage",
    "activeTab",
    "scripting"
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
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["content.js"],
      run_at: "document_idle"
    }
  ],
  action: {
    default_popup: "src/popup/index.html",
    default_icon: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  web_accessible_resources: [
    {
      resources: ["src/dashboard/index.html", "src/editor/index.html"],
      matches: ["<all_urls>"]
    }
  ]
};

const distDir = join(process.cwd(), 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifestTemplate, null, 2));
console.log('manifest.json generated with client ID:', clientId.substring(0, 20) + '...');
