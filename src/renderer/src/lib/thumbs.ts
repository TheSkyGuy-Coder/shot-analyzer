/**
 * Vorschaubilder für den Szenen-Outliner. Sie entstehen im unsichtbaren Hilfsvideo (siehe frames.ts),
 * einzeln nacheinander und nur für Zeilen, die tatsächlich sichtbar sind. Nichts davon wird gespeichert.
 */
import { useEffect, useRef, useState } from 'react'
import { seekTo, withHelper } from './frames'
import { useProject } from '@/store/project'

const MAX_CACHE = 800
const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()
const canvas = document.createElement('canvas')

export const THUMB_W = 128

function request(proxyPath: string, frame: number, fps: number, aspect: number): Promise<string | null> {
  const key = `${proxyPath}|${frame}`
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  const running = inflight.get(key)
  if (running) return running
  const job = withHelper(window.api.mediaUrl(proxyPath), async (v) => {
    await seekTo(v, (frame + 0.5) / fps)
    const w = THUMB_W
    const h = Math.max(1, Math.round(w / aspect))
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    ctx.drawImage(v, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.7)
  })
    .then((url) => {
      cache.set(key, url)
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string)
      return url
    })
    .catch(() => null)
    .finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}

/** Liefert das Vorschaubild für `frame` (null, solange es noch berechnet wird oder `enabled` false ist). */
export function useThumb(frame: number, enabled: boolean): string | null {
  const proxyPath = useProject((s) => s.proxyPath)
  const fps = useProject((s) => s.project?.video.fps ?? 25)
  const aspect = useProject((s) => (s.project ? s.project.video.width / s.project.video.height : 16 / 9))
  const key = proxyPath ? `${proxyPath}|${frame}` : ''
  const [url, setUrl] = useState<string | null>(() => (key ? cache.get(key) ?? null : null))

  useEffect(() => {
    if (!proxyPath) return setUrl(null)
    const hit = cache.get(key)
    if (hit) return setUrl(hit)
    setUrl(null)
    if (!enabled) return
    let dead = false
    void request(proxyPath, frame, fps, aspect).then((u) => {
      if (!dead && u) setUrl(u)
    })
    return () => {
      dead = true
    }
  }, [key, enabled, proxyPath, frame, fps, aspect])

  return url
}

/** true, sobald das Element (mit etwas Vorlauf) im sichtbaren Bereich war. */
export function useSeen<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return [ref, seen]
}
