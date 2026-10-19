import { useState } from 'react'
import { addCutAtPlayhead, exportShotClip, removeCutAtCurrentShot, setNote, toggleLabel } from '@/lib/actions'
import { gotoShot } from '@/lib/player'
import { shotIndexAt } from '@/lib/shots'
import { itemText } from '@/lib/taxonomy'
import { fmtFrameTime } from '@/lib/time'
import { useProject } from '@/store/project'
import { useUi } from '@/store/ui'

export function LabelsPanel(): React.JSX.Element {
  const project = useProject((s) => s.project)
  // Nur bei Shot-Wechsel neu rendern, nicht bei jedem Frame.
  const idx = useUi((s) => (useProject.getState().project ? shotIndexAt(useProject.getState().project!.shots, s.frame) : 0))
  const [clipMode, setClipMode] = useState<'exact' | 'copy'>('exact')

  if (!project) return <p className="muted">Öffne ein Video, um Shots zu markieren.</p>
  const shot = project.shots[idx]
  if (!shot) return <p className="muted">–</p>
  const fps = project.video.fps
  const sizeAxis = project.taxonomy[0]
  const labeled = sizeAxis ? project.shots.filter((s) => s.labels[sizeAxis.id]).length : 0

  return (
    <div>
      <div className="shothead">
        <b>Shot {idx + 1} / {project.shots.length}</b>
        <span className="muted">{fmtFrameTime(shot.startFrame, fps)} – {fmtFrameTime(shot.endFrame, fps)} · {((shot.endFrame - shot.startFrame) / fps).toFixed(2)} s</span>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={() => gotoShot(idx - 1)}>◀ Shot</button>
        <button onClick={() => gotoShot(idx + 1)}>Shot ▶</button>
        <button onClick={addCutAtPlayhead}>✂ Schnitt hier</button>
        <button disabled={idx === 0} onClick={removeCutAtCurrentShot}>Schnitt davor entfernen</button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        {sizeAxis?.title} markiert: {labeled} von {project.shots.length} Shots · Tasten 1–{Math.min(9, sizeAxis?.items.length ?? 0)} setzen die Größe
      </div>

      {project.taxonomy.map((ax, axIdx) => (
        <div key={ax.id}>
          <div className="axis">{ax.title}{ax.mode === 'multi' ? ' (mehrere möglich)' : ''}</div>
          <div>
            {ax.items.map((it, i) => {
              const v = shot.labels[ax.id]
              const on = Array.isArray(v) ? v.includes(it.id) : v === it.id
              return (
                <span
                  key={it.id}
                  className={`chip${on ? ' on' : ''}`}
                  style={on && it.color ? { background: it.color, borderColor: it.color } : undefined}
                  onClick={() => toggleLabel(ax.id, it.id)}
                >
                  {it.icon ? `${it.icon} ` : ''}{itemText(it)}
                  {axIdx === 0 && i < 9 ? <sup className="hk">{i + 1}</sup> : null}
                </span>
              )
            })}
          </div>
        </div>
      ))}

      <div className="axis">Notizen zum Shot</div>
      <textarea
        key={shot.id}
        defaultValue={shot.note}
        placeholder="Was fällt an Komposition, Licht, Blickführung auf? Warum funktioniert dieser Shot?"
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="axis">Diesen Shot exportieren</div>
      <div className="row">
        <select value={clipMode} onChange={(e) => setClipMode(e.target.value as 'exact' | 'copy')}>
          <option value="exact">Bildgenau (neu kodiert)</option>
          <option value="copy">Schnell (ohne Neukodierung)</option>
        </select>
        <button onClick={() => void exportShotClip(clipMode)}>Als Clip speichern</button>
      </div>
    </div>
  )
}
