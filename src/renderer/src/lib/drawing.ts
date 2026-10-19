import type { Project, Shape, Shot } from '@shared/project'
import type { Guides } from '@/store/ui'
import { overlayRegistry } from './plugins'

export function paintShape(c: CanvasRenderingContext2D, s: Shape, w: number, h: number): void {
  const P = s.pts.map((p) => [p[0] * w, p[1] * h] as const)
  if (!P.length) return
  c.save()
  c.strokeStyle = s.color
  c.fillStyle = s.color
  c.lineWidth = Math.max(1, s.w * w)
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.beginPath()
  if (s.type === 'pen') {
    c.moveTo(P[0][0], P[0][1])
    for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1])
    if (P.length === 1) c.lineTo(P[0][0] + 0.01, P[0][1])
  } else if (P.length >= 2) {
    const [a, b] = [P[0], P[1]]
    if (s.type === 'line' || s.type === 'arrow') {
      c.moveTo(a[0], a[1])
      c.lineTo(b[0], b[1])
    } else if (s.type === 'rect') {
      c.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
    } else if (s.type === 'ellipse') {
      c.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 || 0.1, Math.abs(b[1] - a[1]) / 2 || 0.1, 0, 0, Math.PI * 2)
    }
  }
  c.stroke()
  if (s.type === 'arrow' && P.length >= 2) {
    const dx = P[1][0] - P[0][0]
    const dy = P[1][1] - P[0][1]
    if (Math.hypot(dx, dy) > 2) {
      const ang = Math.atan2(dy, dx)
      const L = Math.max(12, c.lineWidth * 4.5)
      c.beginPath()
      c.moveTo(P[1][0], P[1][1])
      c.lineTo(P[1][0] - L * Math.cos(ang - 0.4), P[1][1] - L * Math.sin(ang - 0.4))
      c.lineTo(P[1][0] - L * Math.cos(ang + 0.4), P[1][1] - L * Math.sin(ang + 0.4))
      c.closePath()
      c.fill()
    }
  }
  c.restore()
}

export function paintGuides(c: CanvasRenderingContext2D, g: Guides, w: number, h: number): void {
  const L: [number, number, number, number][] = []
  if (g.third) L.push([w / 3, 0, w / 3, h], [(2 * w) / 3, 0, (2 * w) / 3, h], [0, h / 3, w, h / 3], [0, (2 * h) / 3, w, (2 * h) / 3])
  if (g.phi) {
    const a = 0.381966
    const b = 0.618034
    L.push([a * w, 0, a * w, h], [b * w, 0, b * w, h], [0, a * h, w, a * h], [0, b * h, w, b * h])
  }
  if (g.center) L.push([w / 2, 0, w / 2, h], [0, h / 2, w, h / 2])
  if (g.diag) L.push([0, 0, w, h], [w, 0, 0, h])
  if (!L.length) return
  c.save()
  for (const [col, lw] of [['rgba(0,0,0,.45)', 2.5], ['rgba(255,255,255,.85)', 1]] as const) {
    c.strokeStyle = col
    c.lineWidth = lw
    c.beginPath()
    for (const l of L) {
      c.moveTo(l[0], l[1])
      c.lineTo(l[2], l[3])
    }
    c.stroke()
  }
  c.restore()
}

export interface PaintArgs {
  project: Project
  shot: Shot
  frame: number
  guides: Guides
  showDraw: boolean
}

/** Gemeinsame Zeichenroutine für Viewer und PNG-Export: Hilfslinien, Zeichnungen, Plugin-Overlays. */
export function paintAll(c: CanvasRenderingContext2D, w: number, h: number, a: PaintArgs): void {
  paintGuides(c, a.guides, w, h)
  if (a.showDraw) for (const s of a.shot.draw) paintShape(c, s, w, h)
  for (const o of overlayRegistry) {
    try {
      o.paint(c, w, h, { project: a.project, shot: a.shot, frame: a.frame })
    } catch (e) {
      console.error(`Overlay ${o.id}:`, e)
    }
  }
}
