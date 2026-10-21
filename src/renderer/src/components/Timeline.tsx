import { useEffect, useRef } from 'react'
import { addCutAtPlayhead } from '@/lib/actions'
import { pause, seekFrame } from '@/lib/player'
import { moveCut, MIN_FRAMES, shotIndexAt } from '@/lib/shots'
import { itemOf } from '@/lib/taxonomy'
import { clamp, fmtFrameTime } from '@/lib/time'
import { useProject } from '@/store/project'
import { useUi } from '@/store/ui'

const R = { s0: 22, s1: 72, c0: 76, c1: 92 }
const STEPS_SEC = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800]
const SNAP_PX = 6

interface Drag {
  type: 'scrub' | 'cut'
  shotId?: string
  origin?: number
  /** Letzter gesetzter Frame, auf den der Schnitt zeigt. */
  frame?: number
}

export function Timeline(): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const view = useRef({ f0: 0, f1: 1 })
  const dirty = useRef(true)
  const drag = useRef<Drag | null>(null)
  const lastSig = useRef('')

  useEffect(() => {
    const cv = ref.current as HTMLCanvasElement
    const ctx = cv.getContext('2d') as CanvasRenderingContext2D
    let W = 0
    let H = 0
    let dpr = 1
    let raf = 0

    const frames = (): number => useProject.getState().project?.video.frames ?? 1
    const fit = (): void => {
      view.current = { f0: 0, f1: Math.max(frames(), 2) }
      dirty.current = true
    }
    const resize = (): void => {
      const r = cv.getBoundingClientRect()
      dpr = window.devicePixelRatio || 1
      W = r.width
      H = r.height
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
      dirty.current = true
    }
    const f2x = (f: number): number => ((f - view.current.f0) / (view.current.f1 - view.current.f0)) * W
    const x2f = (x: number): number => view.current.f0 + (x / W) * (view.current.f1 - view.current.f0)
    const clampView = (): void => {
      const v = view.current
      const span = v.f1 - v.f0
      const total = frames()
      if (span >= total) {
        v.f0 = 0
        v.f1 = total
        return
      }
      if (v.f0 < 0) {
        v.f0 = 0
        v.f1 = span
      }
      if (v.f1 > total) {
        v.f1 = total
        v.f0 = total - span
      }
    }

    const cutAt = (x: number): number => {
      const p = useProject.getState().project
      if (!p) return 0
      let best = 0
      let bd = 7
      for (let i = 1; i < p.shots.length; i++) {
        const d = Math.abs(f2x(p.shots[i].startFrame) - x)
        if (d < bd) {
          bd = d
          best = i
        }
      }
      return best
    }

    const draw = (): void => {
      const st = useProject.getState()
      const p = st.project
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#232323'
      ctx.fillRect(0, 0, W, H)
      if (!p) return
      const fps = p.video.fps
      const frame = useUi.getState().frame
      const cur = shotIndexAt(p.shots, frame)
      const v = view.current
      const spanSec = (v.f1 - v.f0) / fps

      ctx.font = '11px "Segoe UI", "Noto Sans", "DejaVu Sans", sans-serif'
      ctx.lineWidth = 1
      const step = STEPS_SEC.find((s) => (s / spanSec) * W >= 70) ?? 1800
      for (let t = Math.ceil(v.f0 / fps / step) * step; t * fps <= v.f1; t += step) {
        const x = Math.round(f2x(t * fps)) + 0.5
        ctx.strokeStyle = '#484848'
        ctx.beginPath()
        ctx.moveTo(x, 12)
        ctx.lineTo(x, R.s0 - 2)
        ctx.stroke()
        ctx.fillStyle = '#a0a0a0'
        ctx.fillText(fmtFrameTime(t * fps, fps, step < 1), x + 3, 10)
      }

      p.shots.forEach((s, i) => {
        const x0 = f2x(s.startFrame)
        const x1 = f2x(s.endFrame)
        if (x1 < 0 || x0 > W) return
        const w = x1 - x0
        const sizeId = s.labels[p.taxonomy[0]?.id] as string | undefined
        const item = sizeId ? itemOf(p.taxonomy, p.taxonomy[0].id, sizeId) : undefined
        const col = item?.color
        ctx.fillStyle = col ? col + '55' : '#3a3a3a'
        ctx.fillRect(x0 + 0.5, R.s0, Math.max(0, w - 1), R.s1 - R.s0)
        if (col) {
          ctx.fillStyle = col
          ctx.fillRect(x0 + 0.5, R.s1 - 4, Math.max(0, w - 1), 4)
        }
        const sceneCol = s.sceneId ? p.scenes.find((x) => x.id === s.sceneId)?.color : undefined
        if (sceneCol) {
          ctx.fillStyle = sceneCol
          ctx.fillRect(x0 + 0.5, R.s0, Math.max(0, w - 1), 3)
        }
        if (i === cur) {
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.strokeRect(x0 + 1.5, R.s0 + 1, Math.max(0, w - 3), R.s1 - R.s0 - 2)
          ctx.lineWidth = 1
        }
        if (w > 24) {
          ctx.save()
          ctx.beginPath()
          ctx.rect(x0, R.s0, w, R.s1 - R.s0)
          ctx.clip()
          ctx.fillStyle = '#fff'
          ctx.fillText(String(i + 1), x0 + 5, R.s0 + 14)
          if (w > 46 && item?.en) {
            ctx.fillStyle = '#d5d9e0'
            ctx.fillText(item.en, x0 + 5, R.s0 + 28)
          }
          ctx.restore()
        }
      })

      // Farbstreifen
      if (p.strip?.colors.length) {
        const n = p.strip.colors.length
        const per = p.video.frames / n
        for (let j = 0; j < n; j++) {
          const x0 = f2x(j * per)
          const x1 = f2x((j + 1) * per)
          if (x1 < 0 || x0 > W) continue
          ctx.fillStyle = p.strip.colors[j]
          ctx.fillRect(Math.floor(x0), R.c0, Math.ceil(x1 - x0) + 1, R.c1 - R.c0)
        }
      }

      // Erkannte Kandidaten, an denen (noch) kein Schnitt liegt: kleine gelbe Marken oben.
      const cutSet = new Set(p.shots.map((s) => s.startFrame))
      ctx.fillStyle = '#f5c542'
      for (const c of p.candidates) {
        if (cutSet.has(c.frame)) continue
        const x = f2x(c.frame)
        if (x < 0 || x > W) continue
        ctx.fillRect(Math.round(x) - 1, R.s0 - 8, 2, 6 + Math.round(c.score * 4))
      }

      for (let i = 1; i < p.shots.length; i++) {
        const x = Math.round(f2x(p.shots[i].startFrame)) + 0.5
        if (x < -5 || x > W + 5) continue
        const active = drag.current?.type === 'cut' && drag.current.shotId === p.shots[i].id
        ctx.strokeStyle = active ? '#3a8ad0' : '#fff'
        ctx.lineWidth = active ? 2 : 1
        ctx.globalAlpha = 0.9
        ctx.beginPath()
        ctx.moveTo(x, R.s0)
        ctx.lineTo(x, R.c1)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.lineWidth = 1
        ctx.fillStyle = active ? '#3a8ad0' : '#fff'
        ctx.beginPath()
        ctx.moveTo(x - 4, R.s0)
        ctx.lineTo(x + 4, R.s0)
        ctx.lineTo(x, R.s0 + 6)
        ctx.fill()
      }

      // Info beim Ziehen eines Schnitts.
      const d = drag.current
      if (d?.type === 'cut' && d.frame !== undefined && d.origin !== undefined) {
        const delta = d.frame - d.origin
        const label = `Frame ${d.frame}  (${delta > 0 ? '+' : ''}${delta})`
        const x = f2x(d.frame)
        const tw = ctx.measureText(label).width + 12
        const tx = clamp(x - tw / 2, 2, W - tw - 2)
        ctx.fillStyle = '#000c'
        ctx.fillRect(tx, R.c1 + 2, tw, 16)
        ctx.fillStyle = '#fff'
        ctx.fillText(label, tx + 6, R.c1 + 14)
      }

      const px = f2x(frame + 0.5)
      ctx.strokeStyle = '#e0483c'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, H)
      ctx.stroke()
      ctx.lineWidth = 1
      ctx.fillStyle = '#e0483c'
      ctx.beginPath()
      ctx.moveTo(px - 5, 0)
      ctx.lineTo(px + 5, 0)
      ctx.lineTo(px, 7)
      ctx.fill()
    }

    const loop = (): void => {
      const st = useProject.getState()
      const ui = useUi.getState()
      // Während der Wiedergabe den Ausschnitt mitführen.
      if (ui.playing && st.project) {
        const v = view.current
        if (ui.frame < v.f0 || ui.frame > v.f1) {
          const span = v.f1 - v.f0
          v.f0 = ui.frame - span * 0.1
          v.f1 = v.f0 + span
          clampView()
        }
      }
      const sig = `${st.project ? st.revision : 'x'}|${ui.frame}|${view.current.f0}|${view.current.f1}|${W}`
      if (dirty.current || sig !== lastSig.current) {
        lastSig.current = sig
        dirty.current = false
        draw()
      }
      raf = requestAnimationFrame(loop)
    }

    // Beim Laden eines Projekts komplett einpassen.
    let lastProject = useProject.getState().project?.video.name
    const unsub = useProject.subscribe((s) => {
      const name = s.project?.video.name
      if (name !== lastProject || (s.revision === 0 && s.project)) {
        lastProject = name
        fit()
      }
    })

    const xOf = (e: MouseEvent | WheelEvent): number => e.clientX - cv.getBoundingClientRect().left

    /** Rundet auf ganze Frames und rastet bei Kandidaten ein, solange Alt nicht gedrückt ist. */
    const snapFrame = (x: number, alt: boolean): number => {
      let f = Math.round(x2f(x))
      if (!alt) {
        const p = useProject.getState().project
        if (p) {
          let best = Infinity
          for (const c of p.candidates) {
            const d = Math.abs(f2x(c.frame) - x)
            if (d < SNAP_PX && d < best) {
              best = d
              f = c.frame
            }
          }
        }
      }
      return f
    }

    const onDown = (e: MouseEvent): void => {
      const st = useProject.getState()
      if (!st.project) return
      const x = xOf(e)
      const i = cutAt(x)
      if (i > 0) {
        pause()
        const s = st.project.shots[i]
        drag.current = { type: 'cut', shotId: s.id, origin: s.startFrame, frame: s.startFrame }
        seekFrame(s.startFrame)
      } else {
        drag.current = { type: 'scrub' }
        seekFrame(Math.floor(x2f(x)))
      }
      dirty.current = true
    }
    const onMove = (e: MouseEvent): void => {
      const st = useProject.getState()
      if (!st.project) return
      const x = xOf(e)
      const d = drag.current
      if (!d) {
        if (e.target === cv) cv.style.cursor = cutAt(x) > 0 ? 'ew-resize' : 'pointer'
        return
      }
      if (d.type === 'scrub') {
        seekFrame(Math.floor(clamp(x2f(x), 0, st.project.video.frames - 1)))
      } else {
        const idx = st.project.shots.findIndex((s) => s.id === d.shotId)
        if (idx < 1) return
        const target = snapFrame(x, e.altKey)
        let applied = target
        st.commit((p) => {
          applied = moveCut(p, idx, target)
        }, `drag:${d.shotId}`)
        d.frame = applied
        seekFrame(applied)
      }
      dirty.current = true
    }
    const onUp = (): void => {
      drag.current = null
      dirty.current = true
    }
    const onDbl = (e: MouseEvent): void => {
      const st = useProject.getState()
      if (!st.project) return
      seekFrame(Math.floor(x2f(xOf(e))))
      addCutAtPlayhead()
    }
    const onWheel = (e: WheelEvent): void => {
      const st = useProject.getState()
      if (!st.project) return
      e.preventDefault()
      const v = view.current
      const span = v.f1 - v.f0
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const dd = ((e.deltaX || e.deltaY) / W) * span
        v.f0 += dd
        v.f1 += dd
      } else {
        const fc = x2f(xOf(e))
        const f = e.deltaY > 0 ? 1.2 : 1 / 1.2
        const ns = clamp(span * f, Math.min(MIN_FRAMES * 4, frames()), frames())
        const a = (fc - v.f0) / span
        v.f0 = fc - a * ns
        v.f1 = v.f0 + ns
      }
      clampView()
      dirty.current = true
    }

    resize()
    fit()
    const ro = new ResizeObserver(resize)
    ro.observe(cv)
    cv.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    cv.addEventListener('dblclick', onDbl)
    cv.addEventListener('wheel', onWheel, { passive: false })
    const fitBtn = (): void => fit()
    window.addEventListener('timeline:fit', fitBtn)
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      unsub()
      ro.disconnect()
      cv.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      cv.removeEventListener('dblclick', onDbl)
      cv.removeEventListener('wheel', onWheel)
      window.removeEventListener('timeline:fit', fitBtn)
    }
  }, [])

  return (
    <div id="tlWrap">
      <canvas ref={ref} id="tl" />
    </div>
  )
}
