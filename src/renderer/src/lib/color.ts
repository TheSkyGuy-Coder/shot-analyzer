import type { Palette } from '@shared/project'
import { clamp } from './time'

type RGB = [number, number, number]

export const toHex = (c: readonly number[]): string =>
  '#' + c.map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('')

function kmeans(px: RGB[], k: number, iters = 10): { hex: string; share: number }[] {
  let seed = 12345
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const n = px.length
  if (!n) return []
  const d2 = (a: RGB, b: RGB): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  const cent: RGB[] = [[...px[Math.floor(rnd() * n)]] as RGB]
  while (cent.length < k) {
    const d = px.map((p) => {
      let m = Infinity
      for (const c of cent) {
        const x = d2(p, c)
        if (x < m) m = x
      }
      return m
    })
    const sum = d.reduce((a, b) => a + b, 0)
    if (sum === 0) break
    let r = rnd() * sum
    let idx = 0
    for (; idx < n - 1; idx++) {
      r -= d[idx]
      if (r <= 0) break
    }
    cent.push([...px[idx]] as RGB)
  }
  const assign = new Int32Array(n)
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      let best = 0
      let bd = Infinity
      for (let c = 0; c < cent.length; c++) {
        const x = d2(px[i], cent[c])
        if (x < bd) {
          bd = x
          best = c
        }
      }
      assign[i] = best
    }
    const sums = cent.map(() => [0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      const s = sums[assign[i]]
      s[0] += px[i][0]
      s[1] += px[i][1]
      s[2] += px[i][2]
      s[3]++
    }
    sums.forEach((s, c) => {
      if (s[3]) cent[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]
    })
  }
  const counts = new Array<number>(cent.length).fill(0)
  for (let i = 0; i < n; i++) counts[assign[i]]++
  return cent
    .map((c, i) => ({ hex: toHex(c), share: counts[i] / n }))
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share)
}

/** Palette und Messwerte aus RGBA-Pixeln. Schwarze Letterbox-Balken oben/unten werden ignoriert. */
export function analyzePixels(data: Uint8ClampedArray, w: number, h: number): Palette {
  let top = 0
  let bot = h - 1
  const rowMax = (y: number): number => {
    let m = 0
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      m = Math.max(m, data[i], data[i + 1], data[i + 2])
    }
    return m
  }
  while (top < bot && rowMax(top) < 22) top++
  while (bot > top && rowMax(bot) < 22) bot--
  const px: RGB[] = []
  let sL = 0
  let sL2 = 0
  let sS = 0
  let sR = 0
  let sB = 0
  for (let y = top; y <= bot; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      px.push([r, g, b])
      const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      sL += L
      sL2 += L * L
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      sS += mx ? (mx - mn) / mx : 0
      sR += r
      sB += b
    }
  }
  const n = px.length || 1
  const mean = sL / n
  return {
    colors: kmeans(px, 5),
    luma: mean,
    contrast: Math.sqrt(Math.max(0, sL2 / n - mean * mean)),
    sat: sS / n,
    warm: (sR - sB) / n / 255
  }
}
