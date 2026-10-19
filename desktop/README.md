# Nexusora Workforce — Desktop (Electron)

An installable Windows desktop app that wraps the hosted Workforce web app in a
secure, branded window. The app logic stays the web app; this shell just makes
it a real desktop program with its own icon, Start-menu entry and window — and
builds `.exe` / `.msi` installers to hand out.

It points at a **configurable URL**, so the same build can target dev, staging
or production.

## Which URL it opens

Resolved in this order:

1. `WF_APP_URL` environment variable (wins if set).
2. `config.json` in the app's user-data folder (`%APPDATA%/Nexusora Workforce/config.json`) — copy `config.example.json` and set `appUrl`. Lets IT point an installed copy at a different server without rebuilding.
3. The baked default in `main.js` (`DEFAULT_URL`). **Set this to the production URL before building installers for distribution.**

## See it as a desktop app now (dev)

With the client dev server running (`cd client && npm run dev`, serving `http://localhost:5173`):

```bash
cd desktop
npm install          # first time only
npm run dev          # opens the app in a desktop window → localhost:5173
```

`npm run dev` sets `WF_APP_URL=http://localhost:5173` for you. To point it at the live site instead, run `npm start` (uses the default URL), or set `WF_APP_URL` yourself.

> The PWA service worker only runs in a production build, so to see the PWA/offline behaviour specifically, use `cd client && npm run build && npm run preview` and point the desktop app at the preview URL. For everyday "is it a desktop app" testing, `npm run dev` against the dev server is fine.

## Build the installers (.exe / .msi)

Run on **Windows** (Windows installers are built on Windows — correct icons, and where you'd add code-signing):

```bash
cd desktop
npm install
# point the build at your live app:
#   Git Bash:    WF_APP_URL=https://app.nexusoraworkforce.com npm run dist
#   PowerShell:  $env:WF_APP_URL="https://app.nexusoraworkforce.com"; npm run dist
npm run dist         # builds BOTH nsis (.exe) and msi into desktop/dist/
```

Other targets: `npm run dist:exe` (NSIS only), `npm run dist:msi` (MSI only), `npm run pack` (unpacked folder, no installer — quickest smoke test).

Output lands in `desktop/dist/` as `Nexusora-Workforce-Setup-<version>.exe` / `.msi` (git-ignored).

## Notes

- **Electron download:** `npm install` fetches the Electron binary from GitHub releases. If your network blocks it, set a mirror: `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` before `npm install`.
- **Code signing:** unsigned installers trigger a SmartScreen warning on other machines. For real distribution, add a Windows code-signing certificate to the electron-builder `win` config (`certificateFile` / `certificatePassword`, or the env vars `CSC_LINK` / `CSC_KEY_PASSWORD`).
- **Security:** the shell runs with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; external links open in the real browser; only one instance runs at a time.
- **Auto-update** is not wired yet — a later step (electron-updater + a release feed) once distribution is settled.
