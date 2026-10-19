/**
 * Alle Aktionen der Oberfläche (Öffnen, Erkennen, Speichern, Exportieren, ...).
 * Komponenten und Hotkeys rufen nur diese Funktionen auf.
 */
import type { LabelValue, Palette, Project } from '@shared/project'
import type { VideoInfo } from '@shared/types'
import { analyzePixels, toHex } from './color'
import { grabPixels, releaseHelper, seekTo, withHelper } from './frames'
import { getVideoEl, gotoShot, pause, seekFrame } from './player'
import { paintAll } from './drawing'
import {
  applyCandidates, createInitialProject, fitToFrames, migrateV1, moveCut, newShot, nearestCut, removeCut, shotIndexAt,
  splitAt, thresholdForSensitivity
} from './shots'
import { itemText } from './taxonomy'
import { clamp, fmtFrameTime, uid } from './time'
import { useProject } from '@/store/project'
import { toast, useUi } from '@/store/ui'

const api = (): Window['api'] => window.api

/** Analyse, die per Datei geladen wurde, bevor das passende Video geöffnet ist. */
let pending: unknown = null

export const currentShotIndex = (): number => {
  const p = useProject.getState().project
  return p ? shotIndexAt(p.shots, useUi.getState().frame) : 0
}

/* ------------------------------------------------------------------ Fortschritt / Abbruch */

interface BusyOpts {
  title: string
  text?: string
  cancellable?: boolean
}

async function withBusy<T>(opts: BusyOpts, fn: (jobId: string, isCancelled: () => boolean) => Promise<T>): Promise<T | undefined> {
  const jobId = uid()
  let cancelled = false
  useUi.setState({
    busy: {
      title: opts.title, text: opts.text, fraction: 0, jobId,
      onCancel: opts.cancellable === false ? undefined : () => {
        cancelled = true
        void api().cancelJob(jobId)
        useUi.setState((s) => (s.busy ? { busy: { ...s.busy, text: 'Wird abgebrochen …' } } : s))
      }
    }
  })
  try {
    return await fn(jobId, () => cancelled)
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    if (cancelled || /cancelled/.test(msg)) return undefined
    console.error(e)
    toast(`Fehler: ${msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '').slice(0, 220)}`)
    return undefined
  } finally {
    useUi.setState({ busy: null })
  }
}

export function setBusyProgress(jobId: string, fraction: number, text?: string): void {
  useUi.setState((s) => (s.busy && s.busy.jobId === jobId ? { busy: { ...s.busy, fraction, text: text ?? s.busy.text } } : s))
}

function setBusyLocal(fraction: number, text: string): void {
  useUi.setState((s) => (s.busy ? { busy: { ...s.busy, fraction, text } } : s))
}

/* ------------------------------------------------------------------ Projekt laden */

function parseProject(json: unknown, info: VideoInfo, frames: number): Project | null {
  let raw: Record<string, unknown>
  try {
    raw = (typeof json === 'string' ? JSON.parse(json) : json) as Record<string, unknown>
  } catch {
    return null
  }
  if (!raw || raw.app !== 'shot-analyzer') return null
  let p: Project | null
  if (raw.version === 2) {
    p = raw as unknown as Project
    if (!Array.isArray(p.shots) || !p.shots.length || !Array.isArray(p.taxonomy)) return null
    p.scenes ??= []
    p.candidates ??= []
    p.strip ??= null
    p.ext ??= {}
    p.shots = p.shots.map((s) => ({ ...newShot(0, 1), ...s }))
  } else {
    p = migrateV1(raw)
  }
  if (!p) return null
  p.video = {
    name: info.name, size: info.size, duration: info.duration, fps: info.fps,
    frames, width: info.width, height: info.height
  }
  fitToFrames(p, frames)
  return p
}

export async function openVideoDialog(): Promise<void> {
  const path = await api().pickVideo()
  if (path) await openVideo(path)
}

export async function openVideo(path: string): Promise<void> {
  pause()
  releaseHelper()
  const result = await withBusy({ title: 'Video wird vorbereitet …', text: 'Datei wird gelesen' }, async (jobId, isCancelled) => {
    const info = await api().probe(path)
    setBusyProgress(jobId, 0, 'Vorschau-Video wird erstellt (nur beim ersten Öffnen, danach sofort)')
    const proxy = await api().makeProxy(info, jobId)
    if (isCancelled()) return null
    let project: Project | null = null
    let source = ''
    if (pending) {
      project = parseProject(pending, info, proxy.frames)
      if (project) source = 'Analyse aus Datei geladen'
      pending = null
    }
    if (!project) {
      const saved = await api().autosaveLoad(info.key)
      if (saved) {
        project = parseProject(saved, info, proxy.frames)
        if (project) source = 'Gespeicherte Analyse wiederhergestellt'
      }
    }
    if (!project) {
      project = createInitialProject(info)
      project.video.frames = proxy.frames
      project.shots = [newShot(0, proxy.frames)]
    }
    return { info, proxy, project, source }
  })
  if (!result) return
  useProject.getState().open(result.info, result.proxy.proxyPath, result.project)
  useUi.setState({ frame: 0, playing: false, tab: 'labels' })
  requestAnimationFrame(() => seekFrame(0))
  toast(result.source || 'Video geladen. Starte mit „Auto-Schnitte“ oder setze Schnitte von Hand.')
}

/* ------------------------------------------------------------------ Schnitte */

export async function runAutoDetect(force = false): Promise<void> {
  const st = useProject.getState()
  if (!st.project || !st.proxyPath) return
  pause()
  const sens = useUi.getState().sens
  const threshold = thresholdForSensitivity(sens)
  const already = !!st.project.ext.detected && !force
  if (!already) {
    const cands = await withBusy({ title: 'Schnitte werden gesucht …', text: 'FFmpeg analysiert das Video' }, async (jobId) =>
      api().detectScenes(st.proxyPath as string, st.project!.video.fps, 0.08, jobId)
    )
    if (!cands) return
    useProject.getState().commit((p) => {
      p.candidates = cands
      p.ext.detected = true
    })
  }
  const before = useProject.getState().project!.shots.length
  useProject.getState().commit((p) => {
    applyCandidates(p, threshold)
  })
  const p = useProject.getState().project!
  const set = p.candidates.filter((c) => c.score >= threshold).length
  toast(`${set} Schnitte erkannt, ${p.shots.length - before} neu gesetzt. Bitte in der Timeline prüfen.`)
}

export function addCutAtPlayhead(): void {
  const frame = useUi.getState().frame
  let ok = false
  useProject.getState().commit((p) => {
    ok = splitAt(p, frame)
  })
  if (!ok) toast('Hier ist kein Schnitt möglich (zu nah an einem bestehenden Schnitt)')
}

export function removeCutAtCurrentShot(): void {
  const idx = currentShotIndex()
  if (idx < 1) return toast('Der erste Shot hat keinen Schnitt davor')
  useProject.getState().commit((p) => {
    removeCut(p, idx)
  })
}

/** Verschiebt den dem Abspielkopf nächsten Schnitt um `delta` Frames und folgt ihm mit dem Abspielkopf. */
export function nudgeNearestCut(delta: number): void {
  const st = useProject.getState()
  if (!st.project) return
  const idx = nearestCut(st.project, useUi.getState().frame)
  if (idx < 1) return toast('Kein Schnitt in der Nähe')
  const from = st.project.shots[idx].startFrame
  let to = from
  st.commit((p) => {
    to = moveCut(p, idx, from + delta)
  }, `nudge:${st.project.shots[idx].id}`)
  if (to === from) return toast('Weiter geht es nicht (Mindestlänge eines Shots)')
  pause()
  seekFrame(to)
}

export function clearAllCuts(): void {
  const st = useProject.getState()
  if (!st.project || st.project.shots.length < 2) return
  if (!window.confirm('Alle Schnitte entfernen? Mit Strg+Z lässt sich das rückgängig machen.')) return
  st.commit((p) => {
    p.shots = [newShot(0, p.video.frames)]
    p.strip = null
  })
  seekFrame(useUi.getState().frame)
}

/* ------------------------------------------------------------------ Labels */

export function toggleLabel(axisId: string, itemId: string): void {
  const idx = currentShotIndex()
  useProject.getState().commit((p) => {
    const ax = p.taxonomy.find((a) => a.id === axisId)
    const s = p.shots[idx]
    if (!ax || !s) return
    if (ax.mode === 'single') {
      if (s.labels[axisId] === itemId) delete s.labels[axisId]
      else s.labels[axisId] = itemId
    } else {
      const arr = ((s.labels[axisId] as string[] | undefined) ?? []).slice()
      const k = arr.indexOf(itemId)
      if (k >= 0) arr.splice(k, 1)
      else arr.push(itemId)
      if (arr.length) s.labels[axisId] = arr
      else delete s.labels[axisId]
    }
  })
}

export function setNote(text: string): void {
  const idx = currentShotIndex()
  const id = useProject.getState().project?.shots[idx]?.id
  useProject.getState().commit((p) => {
    if (p.shots[idx]) p.shots[idx].note = text
  }, `note:${id}`)
}

/** Zifferntasten 1..n setzen die erste Label-Achse (Einstellungsgröße). */
export function labelByNumber(n: number): void {
  const p = useProject.getState().project
  const ax = p?.taxonomy[0]
  const it = ax?.items[n - 1]
  if (ax && it) toggleLabel(ax.id, it.id)
}

/* ------------------------------------------------------------------ Speichern / Laden */

const baseName = (p: Project): string => p.video.name.replace(/\.[^.]+$/, '') || 'analyse'

export async function saveProjectFile(): Promise<void> {
  const p = useProject.getState().project
  if (!p) return
  const path = await api().saveProjectAs(`${baseName(p)}.analyse.json`, JSON.stringify(p))
  if (path) toast('Analyse gespeichert')
}

export async function openProjectFile(): Promise<void> {
  const r = await api().openProjectFile()
  if (!r) return
  await loadProjectJson(r.json)
}

export async function loadProjectJson(json: string): Promise<void> {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return toast('Datei konnte nicht gelesen werden')
  }
  const o = raw as { app?: string; video?: { name?: string } }
  if (o?.app !== 'shot-analyzer') return toast('Das ist keine Shot-Analyzer-Datei')
  const st = useProject.getState()
  if (st.video && st.project) {
    const p = parseProject(raw, st.video, st.project.video.frames)
    if (!p) return toast('Analyse konnte nicht geladen werden')
    if (o.video?.name && o.video.name !== st.video.name && !window.confirm(`Die Analyse gehört zu „${o.video.name}“, geöffnet ist „${st.video.name}“. Trotzdem laden?`)) return
    st.commit((d) => {
      Object.assign(d, p)
    })
    toast('Analyse geladen')
  } else {
    pending = raw
    toast(`Analyse geladen. Wähle jetzt das passende Video${o.video?.name ? ` (${o.video.name})` : ''}.`)
    await openVideoDialog()
  }
}

/* ------------------------------------------------------------------ Autosave */

let autosaveTimer: ReturnType<typeof setTimeout> | undefined
export function startAutosave(): () => void {
  return useProject.subscribe((s, prev) => {
    if (s.revision === prev.revision || !s.project || !s.video || s.revision === 0) return
    clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => {
      const cur = useProject.getState()
      if (cur.project && cur.video) void api().autosaveSave(cur.video.key, JSON.stringify(cur.project))
    }, 800)
  })
}

/* ------------------------------------------------------------------ Exporte */

export async function exportCsv(): Promise<void> {
  const p = useProject.getState().project
  if (!p) return
  const q = (x: unknown): string => '"' + String(x).replace(/"/g, '""') + '"'
  const fps = p.video.fps
  const text = (s: Project['shots'][0], axId: string): string => {
    const ax = p.taxonomy.find((a) => a.id === axId)
    const v: LabelValue | undefined = s.labels[axId]
    if (!ax || v === undefined) return ''
    const arr = Array.isArray(v) ? v : [v]
    return arr.map((id) => { const it = ax.items.find((i) => i.id === id); return it ? itemText(it) : id }).join(' | ')
  }
  const head = ['Nr', 'Start', 'Ende', 'Startframe', 'Endframe', 'Dauer (s)', ...p.taxonomy.map((a) => a.title), 'Notiz', 'Farben']
  const rows = p.shots.map((s, i) => [
    i + 1, fmtFrameTime(s.startFrame, fps), fmtFrameTime(s.endFrame, fps), s.startFrame, s.endFrame,
    ((s.endFrame - s.startFrame) / fps).toFixed(2).replace('.', ','),
    ...p.taxonomy.map((a) => text(s, a.id)), s.note.replace(/\s+/g, ' '), (s.palette?.colors ?? []).map((c) => c.hex).join(' ')
  ])
  const csv = '﻿' + [head, ...rows].map((r) => r.map(q).join(';')).join('\r\n')
  const path = await api().saveText(`${baseName(p)}.csv`, csv, 'csv')
  if (path) toast('CSV gespeichert')
}

/** Standbild des aktuellen Frames in Originalauflösung, inklusive Zeichnung und Hilfslinien. */
export async function exportPng(): Promise<void> {
  const st = useProject.getState()
  const ui = useUi.getState()
  if (!st.project || !st.video) return
  const p = st.project
  const shot = p.shots[shotIndexAt(p.shots, ui.frame)]
  const t = (ui.frame + 0.5) / p.video.fps
  let bmp: ImageBitmap | null = null
  try {
    const b64 = await api().extractFrame(st.video.path, t)
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }))
  } catch {
    // Original nicht mehr erreichbar: Bild aus dem Proxy-Video verwenden.
  }
  const el = getVideoEl()
  const w = bmp?.width ?? el?.videoWidth ?? 0
  const h = bmp?.height ?? el?.videoHeight ?? 0
  if (!w || !h) return toast('Standbild konnte nicht erzeugt werden')
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  if (bmp) ctx.drawImage(bmp, 0, 0, w, h)
  else if (el) ctx.drawImage(el, 0, 0, w, h)
  paintAll(ctx, w, h, { project: p, shot, frame: ui.frame, guides: ui.guides, showDraw: ui.showDraw })
  const b64 = c.toDataURL('image/png').split(',')[1]
  const idx = shotIndexAt(p.shots, ui.frame) + 1
  const path = await api().saveBase64(`${baseName(p)}_shot${idx}.png`, b64, 'png')
  if (path) toast('Standbild gespeichert')
}

export async function exportShotClip(mode: 'exact' | 'copy'): Promise<void> {
  const st = useProject.getState()
  if (!st.project || !st.video) return
  const p = st.project
  const idx = currentShotIndex()
  const s = p.shots[idx]
  const fps = p.video.fps
  const path = await withBusy({ title: `Shot ${idx + 1} wird exportiert …`, text: mode === 'exact' ? 'Bildgenau (neu kodiert)' : 'Schnell (ohne Neukodierung, am Anfang evtl. ungenau)' }, async (jobId) =>
    api().exportClip({
      src: st.video!.path,
      startSec: s.startFrame / fps,
      durationSec: (s.endFrame - s.startFrame) / fps,
      suggestedName: `${baseName(p)}_shot${String(idx + 1).padStart(2, '0')}.mp4`,
      mode,
      jobId
    })
  )
  if (path) toast('Clip gespeichert')
}

/* ------------------------------------------------------------------ Farbanalyse */

const paletteJobs = new Set<string>()

export async function computePalette(shotId: string): Promise<void> {
  const st = useProject.getState()
  if (!st.project || !st.proxyPath || paletteJobs.has(shotId)) return
  const shot = st.project.shots.find((s) => s.id === shotId)
  if (!shot) return
  const fps = st.project.video.fps
  const mid = Math.floor((shot.startFrame + shot.endFrame - 1) / 2)
  paletteJobs.add(shotId)
  let pal: Palette
  try {
    pal = await withHelper(api().mediaUrl(st.proxyPath), async (v) => {
      await seekTo(v, (mid + 0.5) / fps)
      return analyzePixels(grabPixels(v, 96, 54), 96, 54)
    })
  } catch {
    pal = { colors: [], luma: 0, contrast: 0, sat: 0, warm: 0, failed: true }
  } finally {
    paletteJobs.delete(shotId)
  }
  useProject.getState().patch((p) => {
    const s = p.shots.find((x) => x.id === shotId)
    if (s) s.palette = pal
  })
}

export function resetPalette(shotId: string): void {
  useProject.getState().patch((p) => {
    const s = p.shots.find((x) => x.id === shotId)
    if (s) s.palette = null
  })
}

export async function computeAllColors(): Promise<void> {
  const st = useProject.getState()
  if (!st.project || !st.proxyPath) return
  pause()
  const url = api().mediaUrl(st.proxyPath)
  const p0 = st.project
  const fps = p0.video.fps
  await withBusy({ title: 'Farbanalyse …', text: 'Paletten pro Shot' }, async (_jobId, isCancelled) => {
    const todo = p0.shots.filter((s) => !s.palette || s.palette.failed)
    const duration = p0.video.frames / fps
    const N = clamp(Math.round(duration), 60, 300)
    const total = todo.length + N
    let k = 0
    for (const s of todo) {
      if (isCancelled()) return
      await computePalette(s.id)
      setBusyLocal(++k / total, `Shot-Paletten … ${k}/${todo.length}`)
    }
    const colors: string[] = []
    await withHelper(url, async (v) => {
      for (let j = 0; j < N; j++) {
        if (isCancelled()) return
        await seekTo(v, ((j + 0.5) / N) * duration)
        const d = grabPixels(v, 16, 9)
        let r = 0
        let g = 0
        let b = 0
        const n = d.length / 4
        for (let i = 0; i < d.length; i += 4) {
          r += d[i]
          g += d[i + 1]
          b += d[i + 2]
        }
        colors.push(toHex([r / n, g / n, b / n]))
        if (j % 5 === 0) setBusyLocal((todo.length + j) / total, `Farbstreifen … ${j}/${N}`)
      }
    })
    if (isCancelled()) return
    useProject.getState().patch((p) => {
      p.strip = { colors }
    })
    toast('Farbanalyse fertig')
  })
}

export { gotoShot }
