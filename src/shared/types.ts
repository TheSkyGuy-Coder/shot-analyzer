import type { SceneCandidate } from './project'

export interface VideoInfo {
  /** Stabiler Schlüssel aus Pfad, Größe und Änderungsdatum (für Proxy-Cache und Autosave). */
  key: string
  path: string
  name: string
  size: number
  duration: number
  fps: number
  fpsNum: number
  fpsDen: number
  frames: number
  width: number
  height: number
  codec: string
  hasAudio: boolean
}

export interface ProxyResult {
  proxyPath: string
  reused: boolean
  /** Tatsächliche Länge des Proxys. Die Timeline richtet sich danach. */
  frames: number
  duration: number
}

export interface JobProgress {
  jobId: string
  fraction: number
  text?: string
}

export interface ClipRequest {
  src: string
  startSec: number
  durationSec: number
  suggestedName: string
  mode: 'exact' | 'copy'
  jobId: string
}

export interface AppInfo {
  version: string
  ffmpegPath: string
  ffmpegVersion: string
  userData: string
  cacheBytes: number
}

/** Alles, was die Oberfläche vom Hauptprozess aufrufen darf (per preload als window.api). */
export interface Api {
  pickVideo(): Promise<string | null>
  pathForFile(file: File): string
  probe(path: string): Promise<VideoInfo>
  makeProxy(info: VideoInfo, jobId: string): Promise<ProxyResult>
  detectScenes(proxyPath: string, fps: number, minScore: number, jobId: string): Promise<SceneCandidate[]>
  exportClip(req: ClipRequest): Promise<string | null>
  /** PNG des Originalvideos in voller Auflösung als Base64. */
  extractFrame(src: string, timeSec: number): Promise<string>
  cancelJob(jobId: string): Promise<void>
  mediaUrl(path: string): string
  saveProjectAs(defaultName: string, json: string): Promise<string | null>
  openProjectFile(): Promise<{ path: string; json: string } | null>
  autosaveSave(key: string, json: string): Promise<void>
  autosaveLoad(key: string): Promise<string | null>
  saveText(defaultName: string, content: string, ext: string): Promise<string | null>
  saveBase64(defaultName: string, base64: string, ext: string): Promise<string | null>
  appInfo(): Promise<AppInfo>
  clearCache(): Promise<void>
  onProgress(cb: (p: JobProgress) => void): () => void
}
