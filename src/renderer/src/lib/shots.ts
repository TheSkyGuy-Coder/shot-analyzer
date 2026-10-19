/**
 * Reine Funktionen auf dem Projektmodell. Sie verändern das übergebene Objekt
 * (gedacht für den Immer-"Draft" im Store) und sind dadurch leicht zu testen.
 */
import type { Project, Shot, LabelValue } from '@shared/project'
import type { VideoInfo } from '@shared/types'
import { cloneTaxonomy } from './taxonomy'
import { clamp, uid } from './time'

/** Kürzeste erlaubte Shot-Länge in Frames. */
export const MIN_FRAMES = 2

export function newShot(startFrame: number, endFrame: number, labels?: Record<string, LabelValue>): Shot {
  return {
    id: uid(),
    startFrame,
    endFrame,
    labels: labels ? (JSON.parse(JSON.stringify(labels)) as Record<string, LabelValue>) : {},
    note: '',
    draw: [],
    palette: null,
    sceneId: null,
    ext: {}
  }
}

export function createInitialProject(info: VideoInfo): Project {
  return {
    app: 'shot-analyzer',
    version: 2,
    video: {
      name: info.name, size: info.size, duration: info.duration, fps: info.fps,
      frames: info.frames, width: info.width, height: info.height
    },
    taxonomy: cloneTaxonomy(),
    shots: [newShot(0, info.frames)],
    scenes: [],
    candidates: [],
    strip: null,
    ext: {}
  }
}

/** Index des Shots, der den Frame enthält (binäre Suche). */
export function shotIndexAt(shots: readonly { startFrame: number }[], frame: number): number {
  let lo = 0
  let hi = shots.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (shots[mid].startFrame <= frame) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Setzt einen Schnitt vor `frame`. Der neue Shot erbt Labels und Szene. */
export function splitAt(p: Project, frame: number): boolean {
  if (!p.shots.length) return false
  const i = shotIndexAt(p.shots, frame)
  const s = p.shots[i]
  if (frame - s.startFrame < MIN_FRAMES || s.endFrame - frame < MIN_FRAMES) return false
  const n = newShot(frame, s.endFrame, s.labels)
  n.sceneId = s.sceneId
  s.endFrame = frame
  s.palette = null
  p.shots.splice(i + 1, 0, n)
  return true
}

/** Entfernt den Schnitt am Anfang von Shot `shotIdx` (verbindet ihn mit dem Vorgänger). */
export function removeCut(p: Project, shotIdx: number): boolean {
  if (shotIdx < 1 || shotIdx >= p.shots.length) return false
  const a = p.shots[shotIdx - 1]
  const b = p.shots[shotIdx]
  a.endFrame = b.endFrame
  a.palette = null
  p.shots.splice(shotIdx, 1)
  return true
}

/** Verschiebt den Schnitt am Anfang von Shot `shotIdx`. Gibt den tatsächlichen Frame zurück. */
export function moveCut(p: Project, shotIdx: number, frame: number): number {
  const a = p.shots[shotIdx - 1]
  const b = p.shots[shotIdx]
  const f = clamp(Math.round(frame), a.startFrame + MIN_FRAMES, b.endFrame - MIN_FRAMES)
  a.endFrame = f
  b.startFrame = f
  a.palette = null
  b.palette = null
  return f
}

/** Setzt Schnitte an allen Kandidaten ab `threshold`. Gibt die Anzahl neu gesetzter Schnitte zurück. */
export function applyCandidates(p: Project, threshold: number): number {
  let n = 0
  const sorted = p.candidates.filter((c) => c.score >= threshold).sort((x, y) => x.frame - y.frame)
  for (const c of sorted) if (splitAt(p, c.frame)) n++
  return n
}

/** Empfindlichkeit 1..10 -> Score-Schwelle. Mittelwert 6 entspricht 0.30. */
export const thresholdForSensitivity = (s: number): number => 0.5 - 0.04 * (s - 1)

/**
 * Welcher Schnitt ist dem Frame am nächsten? Gesucht wird unter den beiden Grenzen des
 * aktuellen Shots. Rückgabe: Index des Shots, dessen Anfang der Schnitt ist (>= 1), sonst -1.
 */
export function nearestCut(p: Project, frame: number): number {
  const i = shotIndexAt(p.shots, frame)
  const s = p.shots[i]
  const left = i >= 1 ? frame - s.startFrame : Infinity
  const right = i + 1 < p.shots.length ? s.endFrame - frame : Infinity
  if (left === Infinity && right === Infinity) return -1
  return left <= right ? i : i + 1
}

/** Passt ein geladenes Projekt an die tatsächliche Länge des Proxys an. */
export function fitToFrames(p: Project, frames: number): void {
  p.shots = p.shots.filter((s) => s.startFrame < frames)
  if (!p.shots.length) p.shots = [newShot(0, frames)]
  p.shots[0].startFrame = 0
  for (let i = 0; i < p.shots.length; i++) {
    p.shots[i].endFrame = i + 1 < p.shots.length ? p.shots[i + 1].startFrame : frames
  }
  p.candidates = p.candidates.filter((c) => c.frame < frames)
  p.video.frames = frames
}

/** Wandelt die Analyse-Datei des ersten HTML-Prototyps (Sekunden) in das Frame-Format um. */
export function migrateV1(raw: Record<string, unknown>): Project | null {
  const shots = raw.shots as
    | { start: number; end: number; labels?: Record<string, LabelValue>; note?: string; draw?: Project['shots'][0]['draw']; palette?: Project['shots'][0]['palette']; ext?: Record<string, unknown> }[]
    | undefined
  if (!Array.isArray(shots) || !shots.length) return null
  const fps = typeof raw.fps === 'number' && raw.fps > 0 ? raw.fps : 25
  const v = (raw.video ?? {}) as { name?: string; size?: number; duration?: number }
  const duration = v.duration ?? shots[shots.length - 1].end
  const frames = Math.round(duration * fps)
  const p: Project = {
    app: 'shot-analyzer',
    version: 2,
    video: { name: v.name ?? '', size: v.size ?? 0, duration, fps, frames, width: 0, height: 0 },
    taxonomy: cloneTaxonomy(),
    shots: shots.map((s) => {
      const n = newShot(Math.round(s.start * fps), Math.round(s.end * fps), s.labels)
      n.note = s.note ?? ''
      n.draw = s.draw ?? []
      n.palette = s.palette ?? null
      n.ext = s.ext ?? {}
      return n
    }),
    scenes: [],
    candidates: [],
    strip: (raw.strip as Project['strip']) ?? null,
    ext: {}
  }
  fitToFrames(p, frames)
  return p
}
