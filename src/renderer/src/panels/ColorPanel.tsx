import { useEffect } from 'react'
import { computeAllColors, computePalette, resetPalette } from '@/lib/actions'
import { shotIndexAt } from '@/lib/shots'
import { useProject } from '@/store/project'
import { toast, useUi } from '@/store/ui'

export function ColorPanel(): React.JSX.Element {
  const project = useProject((s) => s.project)
  const idx = useUi((s) => (useProject.getState().project ? shotIndexAt(useProject.getState().project!.shots, s.frame) : 0))
  const shot = project?.shots[idx]
  const needs = !!shot && !shot.palette

  useEffect(() => {
    if (needs && shot) void computePalette(shot.id)
  }, [needs, shot?.id])

  if (!project || !shot) return <p className="muted">Öffne ein Video.</p>
  const p = shot.palette

  return (
    <div>
      <div className="shothead"><b>Shot {idx + 1}</b><span className="muted">Palette aus der Shot-Mitte</span></div>
      {!p && <p className="muted">Berechne Palette …</p>}
      {p && (p.failed || !p.colors.length) && <p className="muted">Palette konnte nicht berechnet werden.</p>}
      {p && !p.failed && p.colors.length > 0 && (
        <>
          <div className="swatches">
            {p.colors.map((c) => <div key={c.hex} style={{ background: c.hex, flex: c.share }} />)}
          </div>
          {p.colors.map((c) => (
            <div
              key={c.hex}
              className="sw"
              title="Klicken zum Kopieren"
              onClick={() => navigator.clipboard.writeText(c.hex).then(() => toast(`${c.hex} kopiert`), () => toast(c.hex))}
            >
              <i style={{ background: c.hex }} />
              <span>{c.hex.toUpperCase()}</span>
              <span className="muted">{Math.round(c.share * 100)} %</span>
            </div>
          ))}
          <div className="axis">Messwerte</div>
          <div className="kv">
            <span>Helligkeit</span>
            <span>{Math.round(p.luma * 100)} % ({p.luma < 0.35 ? 'eher Low-Key' : p.luma > 0.6 ? 'eher High-Key' : 'mittlere Tonalität'})</span>
            <span>Kontrast</span><span>{Math.round(p.contrast * 100)} %</span>
            <span>Sättigung</span><span>{Math.round(p.sat * 100)} %</span>
            <span>Farbtemperatur</span><span>{p.warm > 0.06 ? 'warm' : p.warm < -0.06 ? 'kalt' : 'neutral'}</span>
          </div>
        </>
      )}
      <div className="axis">Ganzer Film</div>
      <p className="muted" style={{ fontSize: 12 }}>
        Berechnet für alle Shots die Palette und zeigt unter der Timeline einen Farbstreifen über die gesamte Laufzeit.
      </p>
      <div className="row">
        <button className="primary" onClick={() => void computeAllColors()}>{project.strip ? 'Farbanalyse erneuern' : 'Farbanalyse für ganzen Film'}</button>
        <button onClick={() => resetPalette(shot.id)}>Diesen Shot neu</button>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Letterbox-Balken werden bei der Palette ausgeblendet.</p>
    </div>
  )
}
