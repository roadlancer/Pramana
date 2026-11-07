/// <reference types="node" />
// Runs the exact commands the Help page shows, against copies in a temp folder (no sudo, no real system files).
import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UBUNTU_COMMANDS } from '../ubuntuCommands';

const hasGnuSed = process.platform === 'linux';
let dir: string;
let conf: string;

// Point the command at the temp copy and drop sudo
const run = (command: string, env: Record<string, string> = {}) =>
  execSync(command.replace(/^sudo /, '').replaceAll('/etc/gdm3/custom.conf', conf), { shell: '/bin/bash', env: { ...process.env, ...env } });

const STOCK_CONF = '[daemon]\n# Uncomment the line below to force the login screen to use Xorg\n#WaylandEnable=false\n\n[security]\n';
const DESKTOP = '[Desktop Entry]\nName=Google Chrome\nExec=/usr/bin/google-chrome-stable %U\n\n[Desktop Action new-window]\nExec=/usr/bin/google-chrome-stable\n';

describe.runIf(hasGnuSed)('Ubuntu commands on the Help page', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pramana-ubuntu-'));
    conf = join(dir, 'custom.conf');
  });

  it("switches Ubuntu's stock login config to Xorg, and undoes it", () => {
    writeFileSync(conf, STOCK_CONF);
    run(UBUNTU_COMMANDS.xorg);
    expect(readFileSync(conf, 'utf8')).toMatch(/^\[daemon\]\n# Uncomment.*\nWaylandEnable=false\n/);

    run(UBUNTU_COMMANDS.undoXorg);
    expect(readFileSync(conf, 'utf8')).toBe(STOCK_CONF);
  });

  it('adds the setting when the config has none, and overrides an explicit true', () => {
    writeFileSync(conf, '[daemon]\nAutomaticLoginEnable=false\n');
    run(UBUNTU_COMMANDS.xorg);
    expect(readFileSync(conf, 'utf8')).toBe('[daemon]\nWaylandEnable=false\nAutomaticLoginEnable=false\n');

    writeFileSync(conf, '[daemon]\nWaylandEnable=true\n');
    run(UBUNTU_COMMANDS.xorg);
    expect(readFileSync(conf, 'utf8')).toBe('[daemon]\nWaylandEnable=false\n');
  });

  it("adds the auto-select switch to every Chrome launcher line, in the user's own folder", () => {
    const home = join(dir, 'home');
    mkdirSync(home);
    const source = join(dir, 'google-chrome.desktop');
    writeFileSync(source, DESKTOP);
    run(UBUNTU_COMMANDS.chrome.replace('/usr/share/applications/google-chrome.desktop', source), { HOME: home });

    const launcher = join(home, '.local/share/applications/google-chrome.desktop');
    const exec = readFileSync(launcher, 'utf8').match(/^Exec=.*$/gm);
    expect(exec).toEqual([
      'Exec=/usr/bin/google-chrome-stable --auto-select-desktop-capture-source="Entire screen" %U',
      'Exec=/usr/bin/google-chrome-stable --auto-select-desktop-capture-source="Entire screen"',
    ]);

    run(UBUNTU_COMMANDS.undoChrome.replace(' && pkill -x chrome', ''), { HOME: home });
    expect(existsSync(launcher)).toBe(false);
  });
});
