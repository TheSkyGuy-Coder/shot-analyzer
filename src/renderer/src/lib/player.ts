/**
 * Steuerung des Video-Elements. Es gibt genau ein sichtbares <video> (im Viewer).
 * Es spielt immer den Proxy ab (konstante Bildrate), deshalb gilt: Frame = floor(Zeit * fps).
 */
import { useProject } from '@/store/project'
import { useUi } from '@/store/ui'
import { clamp } from './time'

let el: HTMLVideoElement | null = null
let loopIdx: number | null = null

export const getVideoEl = (): HTMLVideoElement | null => el
export function attachVideo(v: HTMLVideoElement | null): void {
  el = v
}

const meta = (): { fps: number; frames: number } | null => {
  const p = useProject.getState().project
  return p ? { fps: p.video.fps, frames: p.video.frames } : null
}

export function frameFromTime(t: number, fps: number, frames: number): number {
  return clamp(Math.floor(t * fps + 0.001), 0, Math.max(0, frames - 1))
}

/** Springt auf einen Frame. Zielzeit ist die Mitte des Frames, damit nie der Nachbarframe angezeigt wird. */
export function seekFrame(f: number): void {
  const m = meta()
  if (!m || !el) return
  const fr = clamp(Math.round(f), 0, m.frames - 1)
  loopIdx = null
  el.currentTime = (fr + 0.5) / m.fps
  useUi.setState({ frame: fr })
}

export function stepFrames(n: number): void {
  el?.pause()
  seekFrame(useUi.getState().frame + n)
}

export function togglePlay(): void {
  if (!el) return
  if (el.paused) {
    const m = meta()
    if (m && useUi.getState().frame >= m.frames - 1) seekFrame(0)
    void el.play()
  } else el.pause()
}

export function pause(): void {
  el?.pause()
}

export function gotoShot(i: number): void {
  const p = useProject.getState().project
  if (!p) return
  const s = p.shots[clamp(i, 0, p.shots.length - 1)]
  el?.pause()
  seekFrame(s.startFrame)
}

export function resetLoop(): void {
  loopIdx = null
}

/** Wird pro Bildschirm-Refresh aufgerufen: Frame-Anzeige nachführen und Shot-Schleife steuern. */
export function syncTick(): void {
  const m = meta()
  const p = useProject.getState().project
  if (!el || !m || !p) return
  const fr = frameFromTime(el.currentTime, m.fps, m.frames)
  if (fr !== useUi.getState().frame) useUi.setState({ frame: fr })
  if (useUi.getState().loopShot && !el.paused) {
    if (loopIdx === null) {
      let i = 0
      while (i + 1 < p.shots.length && p.shots[i + 1].startFrame <= fr) i++
      loopIdx = i
    }
    const s = p.shots[loopIdx]
    if (s && (fr >= s.endFrame || fr < s.startFrame - 1)) el.currentTime = (s.startFrame + 0.5) / m.fps
  }
}
