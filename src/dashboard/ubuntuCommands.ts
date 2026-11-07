// Shown on the Help page for Ubuntu users to copy into a terminal.
// Tested against Ubuntu's stock /etc/gdm3/custom.conf, a file without the setting, and one set to true
export const UBUNTU_COMMANDS = {
  xorg: `sudo sh -c 'f=/etc/gdm3/custom.conf; grep -qE "^#?\\s*WaylandEnable=" $f && sed -i -E "s/^#?\\s*WaylandEnable=.*/WaylandEnable=false/" $f || sed -i "/^\\[daemon\\]/a WaylandEnable=false" $f'`,
  xorgCheck: 'echo $XDG_SESSION_TYPE',
  chrome: `mkdir -p ~/.local/share/applications && cp /usr/share/applications/google-chrome.desktop ~/.local/share/applications/ && sed -i 's#^Exec=/usr/bin/google-chrome-stable#Exec=/usr/bin/google-chrome-stable --auto-select-desktop-capture-source="Entire screen"#' ~/.local/share/applications/google-chrome.desktop`,
  chromeRestart: 'pkill -x chrome',
  undoXorg: `sudo sed -i -E 's/^WaylandEnable=false/#WaylandEnable=false/' /etc/gdm3/custom.conf`,
  undoChrome: 'rm ~/.local/share/applications/google-chrome.desktop && pkill -x chrome',
};
