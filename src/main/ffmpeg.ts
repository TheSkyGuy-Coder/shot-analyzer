/**
 * Alles rund um FFmpeg. Diese Datei hängt bewusst nicht von Electron ab,
 * damit sie sich mit "npm run test:ffmpeg" direkt in Node testen lässt.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import type { SceneCandidate } from '../shared/project'
import type { ProxyResult, VideoInfo } from '../shared/types'

/** Im gepackten Programm liegen die Binaries in app.asar.unpacked. */
const unpacked = (p: string): string => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')

export const FFMPEG_PATH = unpacked(ffmpegStatic as unknown as string)
export const FFPROBE_PATH = unpacked((ffprobeStatic as unknown as { path: string }).path)

const procs = new Map<string, ChildProcess>()
const cancelled = new Set<string>()

export function cancelJob(jobId: string): void {
  cancelled.add(jobId)
  procs.get(jobId)?.kill()
}

interface RunOpts {
  jobId?: string
  /** Gesamtdauer in Sekunden, um aus dem Fortschritt einen Anteil zu berechnen. */
  totalSec?: number
  /** Auf welchem Kanal ffmpeg den -progress-Report schreibt. */
  progressPipe?: 1 | 2
  onProgress?: (fraction: number) => void
}

interface RunResult {
  stdout: Buffer
  stderr: string
}

function run(bin: string, args: string[], opts: RunOpts = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    if (opts.jobId) procs.set(opts.jobId, child)
    const out: Buffer[] = []
    let errTail = ''
    const rest: Record<number, string> = { 1: '', 2: '' }

    const parseProgress = (which: 1 | 2, chunk: string): boolean => {
      if (opts.progressPipe !== which) return false
      rest[which] += chunk
      const lines = rest[which].split(/\r?\n/)
      rest[which] = lines.pop() ?? ''
      for (const line of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line)
        if (m && opts.totalSec && opts.onProgress) {
          opts.onProgress(Math.min(1, Number(m[1]) / 1e6 / opts.totalSec))
        }
      }
      return true
    }

    child.stdout.on('data', (d: Buffer) => {
      if (!parseProgress(1, d.toString())) out.push(d)
    })
    child.stderr.on('data', (d: Buffer) => {
      const s = d.toString()
      if (!parseProgress(2, s)) errTail = (errTail + s).slice(-4000)
    })
    child.on('error', (e) => {
      if (opts.jobId) procs.delete(opts.jobId)
      reject(e)
    })
    child.on('close', (code) => {
      if (opts.jobId) procs.delete(opts.jobId)
      if (opts.jobId && cancelled.has(opts.jobId)) {
        cancelled.delete(opts.jobId)
        reject(new Error('cancelled'))
      } else if (code === 0) {
        resolve({ stdout: Buffer.concat(out), stderr: errTail })
      } else {
        reject(new Error(`ffmpeg beendete sich mit Code ${code}: ${errTail.split('\n').slice(-6).join('\n')}`))
      }
    })
  })
}

const ff = (args: string[], opts?: RunOpts): Promise<RunResult> =>
  run(FFMPEG_PATH, ['-hide_banner', '-nostdin', ...args], opts)

export async function ffmpegVersion(): Promise<string> {
  try {
    const { stdout } = await run(FFMPEG_PATH, ['-version'])
    return stdout.toString().split('\n')[0].trim()
  } catch {
    return 'nicht gefunden'
  }
}

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
  duration?: string
  tags?: { rotate?: string }
  side_data_list?: { rotation?: number }[]
}

function parseRate(s: string | undefined): [number, number] | null {
  if (!s) return null
  const [n, d] = s.split('/').map(Number)
  if (!n || !d || !isFinite(n) || !isFinite(d)) return null
  return [n, d]
}

export interface ProbeResult extends Omit<VideoInfo, 'key' | 'path' | 'name' | 'size'> {}

export async function probeFile(path: string): Promise<ProbeResult> {
  const { stdout } = await run(FFPROBE_PATH, [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path
  ])
  const j = JSON.parse(stdout.toString()) as { streams?: ProbeStream[]; format?: { duration?: string } }
  const streams = j.streams ?? []
  const v = streams.find((s) => s.codec_type === 'video')
  if (!v) throw new Error('Die Datei enthält keine Videospur.')
  const rate = parseRate(v.avg_frame_rate) ?? parseRate(v.r_frame_rate) ?? [25, 1]
  const duration = Number(v.duration) || Number(j.format?.duration) || 0
  if (!duration) throw new Error('Die Länge des Videos konnte nicht bestimmt werden.')
  const rot = Math.abs(v.side_data_list?.find((x) => x.rotation !== undefined)?.rotation ?? Number(v.tags?.rotate ?? 0))
  const swap = rot === 90 || rot === 270
  const fps = rate[0] / rate[1]
  return {
    duration,
    fps,
    fpsNum: rate[0],
    fpsDen: rate[1],
    frames: Math.round(duration * fps),
    width: (swap ? v.height : v.width) ?? 0,
    height: (swap ? v.width : v.height) ?? 0,
    codec: v.codec_name ?? '?',
    hasAudio: streams.some((s) => s.codec_type === 'audio')
  }
}

/**
 * Erzeugt ein leichtes Vorschauvideo (H.264, max. 720p, konstante Bildrate, kurze GOP).
 * Die Oberfläche spielt NUR dieses Video ab – so laufen auch ProRes, H.265 usw.,
 * und das Springen auf einzelne Frames ist schnell und genau. Das Original bleibt unberührt.
 */
export async function makeProxy(
  info: VideoInfo,
  outDir: string,
  jobId: string,
  onProgress: (f: number) => void
): Promise<ProxyResult> {
  await mkdir(outDir, { recursive: true })
  const out = join(outDir, `${info.key}.mp4`)
  if (existsSync(out)) {
    const p = await probeFile(out)
    return { proxyPath: out, reused: true, frames: p.frames, duration: p.duration }
  }
  const tmp = join(outDir, `${info.key}.tmp.mp4`)
  const args = [
    '-y', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1',
    '-i', info.path,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', `scale=-2:'min(720,ih)',fps=${info.fpsNum}/${info.fpsDen},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-g', '6', '-keyint_min', '6', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-movflags', '+faststart',
    tmp
  ]
  try {
    await ff(args, { jobId, totalSec: info.duration, progressPipe: 1, onProgress })
    await rename(tmp, out)
  } catch (e) {
    await rm(tmp, { force: true })
    throw e
  }
  const p = await probeFile(out)
  return { proxyPath: out, reused: false, frames: p.frames, duration: p.duration }
}

/**
 * Sucht Schnittkandidaten mit dem FFmpeg-Filter "scene" auf dem Proxy.
 * Rückgabe: alle Frames ab minScore mit ihrem Score. Welche davon als Schnitt gelten,
 * entscheidet die Oberfläche über den Empfindlichkeits-Regler.
 */
export async function detectScenes(
  proxyPath: string,
  fps: number,
  minScore: number,
  jobId: string,
  totalSec: number,
  onProgress: (f: number) => void
): Promise<SceneCandidate[]> {
  const args = [
    '-loglevel', 'error', '-nostats', '-progress', 'pipe:2',
    '-i', proxyPath, '-an',
    '-vf', `scale=320:-2,select='gte(scene,${minScore})',metadata=print:file=-`,
    '-f', 'null', '-'
  ]
  const { stdout } = await ff(args, { jobId, totalSec, progressPipe: 2, onProgress })
  const out: SceneCandidate[] = []
  let t: number | null = null
  for (const line of stdout.toString().split(/\r?\n/)) {
    const a = /pts_time:([0-9.]+)/.exec(line)
    if (a) t = Number(a[1])
    const b = /lavfi\.scene_score=([0-9.]+)/.exec(line)
    if (b && t !== null) {
      const frame = Math.round(t * fps)
      if (frame > 0) out.push({ frame, score: Number(b[1]) })
      t = null
    }
  }
  return out
}

export async function exportClip(
  src: string,
  outPath: string,
  startSec: number,
  durationSec: number,
  mode: 'exact' | 'copy',
  jobId: string,
  onProgress: (f: number) => void
): Promise<void> {
  const base = ['-y', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-ss', String(Math.max(0, startSec)), '-i', src, '-t', String(durationSec), '-map', '0:v:0', '-map', '0:a:0?']
  const codec =
    mode === 'copy'
      ? ['-c', 'copy', '-avoid_negative_ts', 'make_zero']
      : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k']
  await ff([...base, ...codec, '-movflags', '+faststart', outPath], { jobId, totalSec: durationSec, progressPipe: 1, onProgress })
}

export async function extractFrame(src: string, timeSec: number): Promise<string> {
  const { stdout } = await ff([
    '-loglevel', 'error', '-ss', String(Math.max(0, timeSec)), '-i', src,
    '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'
  ])
  return stdout.toString('base64')
}

export const safeBase = (p: string): string => basename(p).replace(/\.[^.]+$/, '')
