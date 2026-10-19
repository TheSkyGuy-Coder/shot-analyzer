import { useEffect, useRef } from 'react'
import { gotoShot } from '@/lib/player'
import { shotIndexAt } from '@/lib/shots'
import { itemOf, itemText } from '@/lib/taxonomy'
import { useProject } from '@/store/project'
import { useUi } from '@/store/ui'

export function StatsPanel(): React.JSX.Element {
  const project = useProject((s) => s.project)
  const idx = useUi((s) => (useProject.getState().project ? shotIndexAt(useProject.getState().project!.shots, s.frame) : 0))
  const cv = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = cv.current
    if (!c || !project) return
    const r = c.getBoundingClientRect()
    const dp = window.devicePixelRatio || 1
    c.width = r.width * dp
    c.height = r.height * dp
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    ctx.scale(dp, dp)
    const fps = project.video.fps
    const L = project.shots.map((s) => (s.endFrame - s.startFrame) / fps)
    const max = Math.max(...L)
    const bw = r.width / project.shots.length
    const sizeAx = project.taxonomy[0]
    project.shots.forEach((s, i) => {
      const hh = Math.sqrt(L[i] / max) * (r.height - 8)
      const id = sizeAx ? (s.labels[sizeAx.id] as string | undefined) : undefined
      ctx.fillStyle = (id && sizeAx && itemOf(project.taxonomy, sizeAx.id, id)?.color) || '#5a6272'
      ctx.fillRect(i * bw + 0.5, r.height - hh, Math.max(1, bw - 1), hh)
      if (i === idx) {
        ctx.strokeStyle = '#fff'
        ctx.strokeRect(i * bw + 0.5, r.height - hh, Math.max(1, bw - 1), hh)
      }
    })
    c.onclick = (e) => gotoShot(Math.floor((e.clientX - c.getBoundingClientRect().left) / bw))
  }, [project, idx])

  if (!project) return <p className="muted">Öffne ein Video.</p>
  const fps = project.video.fps
  const tot = project.video.frames / fps
  const L = project.shots.map((s) => (s.endFrame - s.startFrame) / fps)
  const sorted = [...L].sort((a, b) => a - b)
  const med = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  const mmss = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

  return (
    <div>
      <div className="kv">
        <span>Shots</span><span>{project.shots.length}</span>
        <span>Laufzeit</span><span>{mmss(tot)}</span>
        <span>Ø Shot-Länge (ASL)</span><span>{(tot / project.shots.length).toFixed(2)} s</span>
        <span>Median</span><span>{med.toFixed(2)} s</span>
        <span>Kürzester / längster</span><span>{sorted[0].toFixed(2)} / {sorted[sorted.length - 1].toFixed(2)} s</span>
      </div>
      <div className="axis">Shot-Längen im Verlauf</div>
      <canvas ref={cv} style={{ width: '100%', height: 90, background: '#101216', borderRadius: 6, cursor: 'pointer' }} />
      <div className="muted" style={{ fontSize: 11 }}>Klick auf einen Balken springt zum Shot.</div>
      {project.taxonomy.map((ax) => {
        const rows = ax.items
          .map((it) => {
            let n = 0
            let dur = 0
            project.shots.forEach((s, i) => {
              const v = s.labels[ax.id]
              if (Array.isArray(v) ? v.includes(it.id) : v === it.id) {
                n++
                dur += L[i]
              }
            })
            return { it, n, dur }
          })
          .filter((r) => r.n > 0)
        return (
          <div key={ax.id}>
            <div className="axis">{ax.title}</div>
            {rows.length === 0 && <div className="muted" style={{ fontSize: 12 }}>Noch nichts markiert.</div>}
            {rows.map(({ it, n, dur }) => (
              <div key={it.id} className="statrow">
                <span>{itemText(it)}</span>
                <div className="bar"><i style={{ width: `${(dur / tot) * 100}%`, background: it.color ?? 'var(--accent)' }} /></div>
                <span className="muted" title="Anzahl Shots / Anteil der Laufzeit">{n}× {Math.round((dur / tot) * 100)}%</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
