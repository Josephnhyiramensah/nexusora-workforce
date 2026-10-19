// Minimal, secure preload. Exposes only a tiny, read-only surface to the web
// app so it can tell it's running inside the desktop shell (e.g. to tweak UI).
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
});
