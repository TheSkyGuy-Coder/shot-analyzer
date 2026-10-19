import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { Readable } from 'node:stream'
import { app, BrowserWindow, Menu, protocol, session, shell } from 'electron'
import { proxyDir, registerIpc } from './ipc'

// Das Schema "media://" liefert der Oberfläche die Proxy-Videos aus dem Cache-Ordner
// (mit Range-Unterstützung, damit das Springen im Video funktioniert).
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 940,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#14161a',
    title: 'Shot Analyzer',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  mainWindow.on('closed', () => (mainWindow = null))
}

void app.whenReady().then(() => {
  // SA_FORCE_CSP erlaubt, die Sicherheitsrichtlinie der installierten App auch im Test zu prüfen.
  if (app.isPackaged || process.env['SA_FORCE_CSP']) {
    Menu.setApplicationMenu(null) // Alt-Taste soll kein Menü öffnen (wird für Cut-Nudge gebraucht)
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: media:; media-src 'self' blob: media:; connect-src 'self' media:"
          ]
        }
      })
    })
  }

  protocol.handle('media', async (req) => {
    const u = new URL(req.url)
    const file = normalize(decodeURIComponent(u.pathname.slice(1)))
    const root = normalize(proxyDir()) + sep
    if (!file.startsWith(root)) return new Response('Zugriff verweigert', { status: 403 })

    let size: number
    try {
      size = (await stat(file)).size
    } catch {
      return new Response('Nicht gefunden', { status: 404 })
    }

    // Range-Anfragen selbst bedienen: ohne 206/Content-Range gilt das Video als nicht durchsuchbar.
    let start = 0
    let end = size - 1
    let status = 200
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '')
    if (m && (m[1] !== '' || m[2] !== '')) {
      if (m[1] === '') {
        start = Math.max(0, size - Number(m[2]))
      } else {
        start = Number(m[1])
        if (m[2] !== '') end = Math.min(end, Number(m[2]))
      }
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      }
      status = 206
    }

    const headers = new Headers({
      'Content-Type': extname(file).toLowerCase() === '.mp4' ? 'video/mp4' : 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      // Ohne CORS-Header gilt eine Leinwand, auf die ein Video-Frame gezeichnet wurde, als "tainted",
      // und die Pixel (Farbanalyse) wären nicht lesbar.
      'Access-Control-Allow-Origin': '*'
    })
    if (status === 206) headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
    return new Response(body, { status, headers })
  })

  registerIpc(() => mainWindow)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
