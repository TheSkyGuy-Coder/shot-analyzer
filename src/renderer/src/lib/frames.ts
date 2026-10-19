/**
 * Zweites, unsichtbares <video> auf dem Proxy für Hintergrundarbeiten (Farbanalyse),
 * damit der Abspielkopf im sichtbaren Player dabei nicht springt.
 */
let helper: HTMLVideoElement | null = null
let helperUrl = ''
let lock: Promise<unknown> = Promise.resolve()

function makeVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.preload = 'auto'
    v.playsInline = true
    v.style.cssText = 'position:fixed;left:-10000px;top:0;width:160px;height:90px;opacity:0;pointer-events:none'
    document.body.appendChild(v)
    v.onloadeddata = () => resolve(v)
    v.onerror = () => {
      v.remove()
      reject(new Error('Hilfsvideo konnte nicht geladen werden'))
    }
    v.src = url
  })
}

export function seekTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.max(0, Math.min(t, (v.duration || t) - 0.001))
    if (Math.abs(v.currentTime - target) < 1e-6 && v.readyState >= 2) return resolve()
    let done = false
    const fin = (): void => {
      if (done) return
      done = true
      v.removeEventListener('seeked', fin)
      clearTimeout(to)
      resolve()
    }
    const to = setTimeout(fin, 4000)
    v.addEventListener('seeked', fin)
    v.currentTime = target
  })
}

/** Führt `fn` mit dem Hilfsvideo aus. Aufrufe laufen nacheinander. */
export function withHelper<T>(url: string, fn: (v: HTMLVideoElement) => Promise<T>): Promise<T> {
  const p = lock.then(async () => {
    if (!helper || helperUrl !== url) {
      helper?.remove()
      helper = await makeVideo(url)
      helperUrl = url
    }
    return fn(helper)
  })
  lock = p.catch(() => undefined)
  return p
}

export function releaseHelper(): void {
  helper?.remove()
  helper = null
  helperUrl = ''
}

const cvs = document.createElement('canvas')
const ctx = cvs.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D

export function grabPixels(v: HTMLVideoElement, w: number, h: number): Uint8ClampedArray {
  cvs.width = w
  cvs.height = h
  ctx.drawImage(v, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}
