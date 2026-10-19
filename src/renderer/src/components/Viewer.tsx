import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { attachVideo, resetLoop, syncTick } from '@/lib/player'
import { paintAll, paintShape } from '@/lib/drawing'
import { shotIndexAt } from '@/lib/shots'
import { clamp } from '@/lib/time'
import { useProject } from '@/store/project'
import { useUi } from '@/store/ui'
import type { Shape } from '@shared/project'

export function Viewer(): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef<Shape | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const proxyPath = useProject((s) => s.proxyPath)
  const project = useProject((s) => s.project)
  const { tool, color, width, guides, showDraw, volume, muted, rate, loopShot } = useUi(
    useShallow((s) => ({ tool: s.tool, color: s.color, width: s.width, guides: s.guides, showDraw: s.showDraw, volume: s.volume, muted: s.muted, rate: s.rate, loopShot: s.loopShot }))
  )
  // Der Shot-Index wird bei jedem Neuzeichnen berechnet; die Subscription unten löst es nur bei Shot-Wechseln aus.
  const shotIdx = project ? shotIndexAt(project.shots, useUi.getState().frame) : 0

  // Video-Element registrieren und Bildschirm-Takt starten.
  useEffect(() => {
    attachVideo(videoRef.current)
    let raf = 0
    const tick = (): void => {
      syncTick()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      attachVideo(null)
    }
  }, [])

  // Shot-Index bei jedem Frame-Wechsel nachführen, damit Zeichnungen zum richtigen Shot gehören.
  const [, force] = useState(0)
  useEffect(() => useUi.subscribe((s, prev) => {
    const p = useProject.getState().project
    if (!p || s.frame === prev.frame) return
    if (shotIndexAt(p.shots, s.frame) !== shotIndexAt(p.shots, prev.frame)) force((n) => n + 1)
  }), [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = clamp(volume, 0, 1)
    v.muted = muted
  }, [volume, muted, proxyPath])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate
  }, [rate, proxyPath])

  useEffect(() => {
    resetLoop()
  }, [loopShot])

  // Bildfläche an das Seitenverhältnis des Videos anpassen.
  useEffect(() => {
    const wrap = wrapRef.current
    const v = videoRef.current
    if (!wrap) return
    const fit = (): void => {
      const vw = v?.videoWidth || project?.video.width || 16
      const vh = v?.videoHeight || project?.video.height || 9
      const ar = vw / vh
      const aw = wrap.clientWidth
      const ah = wrap.clientHeight
      let W = aw
      let H = aw / ar
      if (H > ah) {
        H = ah
        W = ah * ar
      }
      setSize({ w: Math.floor(W), h: Math.floor(H) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    v?.addEventListener('loadedmetadata', fit)
    return () => {
      ro.disconnect()
      v?.removeEventListener('loadedmetadata', fit)
    }
  }, [project?.video.width, project?.video.height, proxyPath])

  // Overlay neu zeichnen.
  const render = (): void => {
    const c = canvasRef.current
    const p = useProject.getState().project
    if (!c || !p || !size.w) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(size.w * dpr)
    c.height = Math.round(size.h * dpr)
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    const frame = useUi.getState().frame
    const shot = p.shots[shotIndexAt(p.shots, frame)]
    if (!shot) return
    paintAll(ctx, size.w, size.h, { project: p, shot, frame, guides, showDraw })
    if (dragging.current) paintShape(ctx, dragging.current, size.w, size.h)
  }
  useEffect(render, [size, project, shotIdx, guides, showDraw])

  const pt = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (tool === 'none') return
    videoRef.current?.pause()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = pt(e)
    dragging.current = { type: tool, color, w: width / Math.max(size.w, 1), pts: tool === 'pen' ? [p] : [p, p] }
    render()
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const d = dragging.current
    if (!d) return
    const p = pt(e)
    if (d.type === 'pen') d.pts.push(p)
    else d.pts[1] = p
    render()
  }
  const onUp = (): void => {
    const d = dragging.current
    dragging.current = null
    if (!d) return
    const tiny = d.type !== 'pen' && Math.hypot((d.pts[1][0] - d.pts[0][0]) * size.w, (d.pts[1][1] - d.pts[0][1]) * size.h) < 4
    if (!tiny) {
      const idx = shotIndexAt(useProject.getState().project!.shots, useUi.getState().frame)
      useProject.getState().commit((p) => {
        p.shots[idx].draw.push(d)
      })
    }
    render()
  }

  const loaded = !!project
  return (
    <div id="viewerWrap" ref={wrapRef}>
      <div id="frame" style={{ width: size.w, height: size.h, display: loaded ? 'block' : 'none' }}>
        <video
          ref={videoRef}
          src={proxyPath ? window.api.mediaUrl(proxyPath) : undefined}
          crossOrigin="anonymous"
          playsInline
          preload="auto"
          onClick={() => (tool === 'none' ? videoRef.current && (videoRef.current.paused ? void videoRef.current.play() : videoRef.current.pause()) : undefined)}
          onPlay={() => useUi.setState({ playing: true })}
          onPause={() => useUi.setState({ playing: false })}
          onEnded={() => useUi.setState({ playing: false })}
        />
        <canvas
          ref={canvasRef}
          id="draw"
          style={{ pointerEvents: tool === 'none' ? 'none' : 'auto', cursor: 'crosshair' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
    </div>
  )
}
