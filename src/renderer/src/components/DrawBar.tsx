import { currentShotIndex } from '@/lib/actions'
import { useProject } from '@/store/project'
import { useUi, type Guides, type Tool } from '@/store/ui'
import { Icon, type IconName } from './Icon'

const TOOLS: { id: Tool; icon: IconName; title: string }[] = [
  { id: 'none', icon: 'select', title: 'Auswahl: Klick = Play/Pause (V)' },
  { id: 'pen', icon: 'pen', title: 'Stift (P)' },
  { id: 'line', icon: 'line', title: 'Linie (L)' },
  { id: 'arrow', icon: 'arrow', title: 'Pfeil, z. B. Blickrichtung (A)' },
  { id: 'rect', icon: 'rect', title: 'Rechteck (R)' },
  { id: 'ellipse', icon: 'ellipse', title: 'Ellipse (E)' }
]

const GUIDES: { id: keyof Guides; icon: IconName; title: string }[] = [
  { id: 'third', icon: 'third', title: 'Drittelregel (G)' },
  { id: 'phi', icon: 'phi', title: 'Goldener Schnitt' },
  { id: 'center', icon: 'center', title: 'Mittelachsen' },
  { id: 'diag', icon: 'diag', title: 'Diagonalen' }
]

/** Senkrechte Werkzeugleiste links vom Viewer (wie in DCC-Programmen). */
export function ToolBox(): React.JSX.Element {
  const tool = useUi((s) => s.tool)
  const hasProject = useProject((s) => !!s.project)

  const undoShape = (): void => {
    const idx = currentShotIndex()
    useProject.getState().commit((p) => {
      p.shots[idx]?.draw.pop()
    })
  }
  const clearShapes = (): void => {
    const idx = currentShotIndex()
    const p = useProject.getState().project
    if (!p?.shots[idx]?.draw.length) return
    useProject.getState().commit((d) => {
      d.shots[idx].draw = []
    })
  }

  return (
    <div id="toolbox">
      {TOOLS.map((t) => (
        <button key={t.id} className={`tb${tool === t.id ? ' on' : ''}`} title={t.title} onClick={() => useUi.setState({ tool: t.id })}>
          <Icon name={t.icon} />
        </button>
      ))}
      <div className="hsep" />
      <button className="tb" disabled={!hasProject} onClick={undoShape} title="Letzte Zeichnung dieses Shots entfernen"><Icon name="eraser" /></button>
      <button className="tb" disabled={!hasProject} onClick={clearShapes} title="Alle Zeichnungen dieses Shots löschen (Strg+Z holt sie zurück)"><Icon name="trash" /></button>
    </div>
  )
}

/** Leiste direkt über dem Viewer: Zeichenoptionen und Bildraster. */
export function ViewerBar(): React.JSX.Element {
  const color = useUi((s) => s.color)
  const width = useUi((s) => s.width)
  const guides = useUi((s) => s.guides)
  const showDraw = useUi((s) => s.showDraw)

  return (
    <div id="viewerbar">
      <label className="small">
        Farbe
        <input type="color" value={color} title="Farbe" onChange={(e) => useUi.setState({ color: e.target.value })} />
      </label>
      <label className="small">
        Stärke
        <input type="range" min={1} max={12} value={width} title="Strichstärke" style={{ width: 70 }} onChange={(e) => useUi.setState({ width: Number(e.target.value) })} />
        <span className="val">{width}</span>
      </label>
      <label className="small">
        <input type="checkbox" checked={showDraw} onChange={(e) => useUi.setState({ showDraw: e.target.checked })} /> Zeichnung zeigen
      </label>
      <div className="spacer" />
      <span className="small">Raster</span>
      {GUIDES.map((g) => (
        <button key={g.id} className={`tb${guides[g.id] ? ' on' : ''}`} title={g.title} onClick={() => useUi.setState({ guides: { ...guides, [g.id]: !guides[g.id] } })}>
          <Icon name={g.icon} />
        </button>
      ))}
    </div>
  )
}
