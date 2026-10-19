import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api, JobProgress } from '../shared/types'

const api: Api = {
  pickVideo: () => ipcRenderer.invoke('dialog:pickVideo'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  probe: (path) => ipcRenderer.invoke('video:probe', path),
  makeProxy: (info, jobId) => ipcRenderer.invoke('video:makeProxy', info, jobId),
  detectScenes: (proxyPath, fps, minScore, jobId) => ipcRenderer.invoke('video:detectScenes', proxyPath, fps, minScore, jobId),
  exportClip: (req) => ipcRenderer.invoke('video:exportClip', req),
  extractFrame: (src, t) => ipcRenderer.invoke('video:extractFrame', src, t),
  cancelJob: (jobId) => ipcRenderer.invoke('job:cancel', jobId),
  mediaUrl: (path) => `media://proxy/${encodeURIComponent(path)}`,
  saveProjectAs: (name, json) => ipcRenderer.invoke('project:saveAs', name, json),
  openProjectFile: () => ipcRenderer.invoke('project:open'),
  autosaveSave: (key, json) => ipcRenderer.invoke('autosave:save', key, json),
  autosaveLoad: (key) => ipcRenderer.invoke('autosave:load', key),
  saveText: (name, content, ext) => ipcRenderer.invoke('file:saveText', name, content, ext),
  saveBase64: (name, b64, ext) => ipcRenderer.invoke('file:saveBase64', name, b64, ext),
  appInfo: () => ipcRenderer.invoke('app:info'),
  clearCache: () => ipcRenderer.invoke('cache:clear'),
  onProgress: (cb) => {
    const h = (_e: unknown, p: JobProgress): void => cb(p)
    ipcRenderer.on('job:progress', h)
    return () => ipcRenderer.removeListener('job:progress', h)
  }
}

contextBridge.exposeInMainWorld('api', api)
