export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** mm:ss(.cc) */
export function fmtTime(sec: number, centis = true): string {
  const t = Math.max(0, sec || 0)
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return String(m).padStart(2, '0') + ':' + (centis ? s.toFixed(2).padStart(5, '0') : String(Math.floor(s)).padStart(2, '0'))
}

export const frameToSec = (frame: number, fps: number): number => frame / fps

export function fmtFrameTime(frame: number, fps: number, centis = true): string {
  return fmtTime(frame / fps, centis)
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}
