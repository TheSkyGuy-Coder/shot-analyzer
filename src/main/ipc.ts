import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { ClipRequest, VideoInfo } from '../shared/types'
import {
  cancelJob, detectScenes, exportClip, extractFrame, FFMPEG_PATH, ffmpegVersion, makeProxy, probeFile
} from './ffmpeg'

export const proxyDir = (): string => join(app.getPath('userData'), 'proxies')
const autosaveDir = (): string => join(app.getPath('userData'), 'autosave')

const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mxf', 'mpg', 'mpeg', 'mts', 'm2ts', 'wmv', 'flv', 'ogv']

function sender(win: () => BrowserWindow | null) {
  let lastSent = 0
  return (jobId: string, fraction: number, text?: string, force = false): void => {
    const now = Date.now()
    if (!force && now - lastSent < 90) return
    lastSent = now
    win()?.webContents.send('job:progress', { jobId, fraction, text })
  }
}

async function dirSize(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0
  let total = 0
  for (const f of await readdir(dir)) total += (await stat(join(dir, f))).size
  return total
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const progress = sender(getWindow)

  ipcMain.handle('dialog:pickVideo', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Video öffnen',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: VIDEO_EXT }, { name: 'Alle Dateien', extensions: ['*'] }]
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('video:probe', async (_e, path: string): Promise<VideoInfo> => {
    const [p, st] = await Promise.all([probeFile(path), stat(path)])
    const key = createHash('sha1').update(`${path}|${st.size}|${Math.round(st.mtimeMs)}`).digest('hex').slice(0, 16)
    return { ...p, key, path, name: basename(path), size: st.size }
  })

  ipcMain.handle('video:makeProxy', (_e, info: VideoInfo, jobId: string) =>
    makeProxy(info, proxyDir(), jobId, (f) => progress(jobId, f))
  )

  ipcMain.handle('video:detectScenes', async (_e, proxyPath: string, fps: number, minScore: number, jobId: string) => {
    const p = await probeFile(proxyPath)
    const r = await detectScenes(proxyPath, fps, minScore, jobId, p.duration, (f) => progress(jobId, f))
    progress(jobId, 1, undefined, true)
    return r
  })

  ipcMain.handle('video:exportClip', async (_e, req: ClipRequest) => {
    const r = await dialog.showSaveDialog({
      title: 'Shot als Clip speichern',
      defaultPath: req.suggestedName,
      filters: [{ name: 'MP4-Video', extensions: ['mp4'] }]
    })
    if (r.canceled || !r.filePath) return null
    await exportClip(req.src, r.filePath, req.startSec, req.durationSec, req.mode, req.jobId, (f) => progress(req.jobId, f))
    return r.filePath
  })

  ipcMain.handle('video:extractFrame', (_e, src: string, t: number) => extractFrame(src, t))
  ipcMain.handle('job:cancel', (_e, jobId: string) => cancelJob(jobId))

  ipcMain.handle('project:saveAs', async (_e, defaultName: string, json: string) => {
    const r = await dialog.showSaveDialog({
      title: 'Analyse speichern',
      defaultPath: defaultName,
      filters: [{ name: 'Shot-Analyse', extensions: ['json'] }]
    })
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, json, 'utf8')
    return r.filePath
  })

  ipcMain.handle('project:open', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Analyse öffnen',
      properties: ['openFile'],
      filters: [{ name: 'Shot-Analyse', extensions: ['json'] }]
    })
    if (r.canceled) return null
    return { path: r.filePaths[0], json: await readFile(r.filePaths[0], 'utf8') }
  })

  ipcMain.handle('autosave:save', async (_e, key: string, json: string) => {
    if (!/^[a-f0-9]{8,64}$/.test(key)) return
    await mkdir(autosaveDir(), { recursive: true })
    await writeFile(join(autosaveDir(), `${key}.json`), json, 'utf8')
  })

  ipcMain.handle('autosave:load', async (_e, key: string) => {
    if (!/^[a-f0-9]{8,64}$/.test(key)) return null
    const f = join(autosaveDir(), `${key}.json`)
    return existsSync(f) ? readFile(f, 'utf8') : null
  })

  ipcMain.handle('file:saveText', async (_e, defaultName: string, content: string, ext: string) => {
    const r = await dialog.showSaveDialog({ defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, content, 'utf8')
    return r.filePath
  })

  ipcMain.handle('file:saveBase64', async (_e, defaultName: string, base64: string, ext: string) => {
    const r = await dialog.showSaveDialog({ defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, Buffer.from(base64, 'base64'))
    return r.filePath
  })

  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(),
    ffmpegPath: FFMPEG_PATH,
    ffmpegVersion: await ffmpegVersion(),
    userData: app.getPath('userData'),
    cacheBytes: await dirSize(proxyDir())
  }))

  ipcMain.handle('cache:clear', async () => {
    await rm(proxyDir(), { recursive: true, force: true })
  })
}
