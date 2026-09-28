import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PRODUCT_NAME } from '@shared/constants'
import { loadLocalEnv } from './env'
import { closeDb } from './database/db'
import { registerIpc } from './ipc'

// `build/` only exists in the dev tree — packaged apps get their icon
// from the OS-level bundle/exe resource that electron-builder embeds,
// so this is purely for a branded dev-mode window/taskbar icon.
const ICON_PATH = app.isPackaged
  ? undefined
  : join(__dirname, process.platform === 'win32' ? '../../build/icon.ico' : '../../build/icon.png')

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    // Kept just under the CSS stacked-layout breakpoint (980x700 in global.css)
    // so any window size the user can reach lands cleanly in one layout or the
    // other, instead of a dead zone between "too narrow for the desk layout"
    // and "not narrow enough to trigger stacking". Also lets the app fit on
    // common small laptop screens (e.g. 1366x768 minus OS taskbar/dock chrome).
    minWidth: 960,
    minHeight: 680,
    show: false,
    backgroundColor: '#050507',
    title: `${PRODUCT_NAME} — Strategy Tester`,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    icon: ICON_PATH,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  window.webContents.on('console-message', (event) => {
    if (event.message.includes('Download the React DevTools')) return
    console.log('[renderer]', event.message)
  })
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('[load-fail]', code, description)
  })
  window.on('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  loadLocalEnv()
  electronApp.setAppUserModelId('com.kairos.strategy-tester')
  // BrowserWindow's `icon` option is ignored on macOS — the Dock icon
  // needs to be set explicitly, but only matters in dev; a packaged app
  // gets its Dock icon from the .icns baked into the bundle.
  if (process.platform === 'darwin' && ICON_PATH) {
    app.dock?.setIcon(ICON_PATH)
  }
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => closeDb())
