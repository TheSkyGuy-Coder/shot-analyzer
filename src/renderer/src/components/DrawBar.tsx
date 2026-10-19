import { currentShotIndex } from '@/lib/actions'
import { useProject } from '@/store/project'
import { useUi, type Guides, type Tool } from '@/store/ui'

const TOOLS: { id: Tool; icon: string; title: string }[] = [
  { id: 'none', icon: '🖱️', title: 'Auswahl: Klick = Play/Pause (V)' },
  { id: 'pen', icon: '✏️', title: 'Stift (P)' },
  { id: 'line', icon: '╱', title: 'Linie (L)' },
  { id: 'arrow', icon: '➜', title: 'Pfeil, z. B. Blickrichtung (A)' },
  { id: 'rect', icon: '▭', title: 'Rechteck (R)' },
  { id: 'ellipse', icon: '◯', title: 'Ellipse (E)' }
]

const GUIDES: { id: keyof Guides; label: string; title: string }[] = [
  { id: 'third', label: '⌗ Drittel', title: 'Drittelregel (G)' },
  { id: 'phi', label: 'φ', title: 'Goldener Schnitt' },
  { id: 'center', label: '✛', title: 'Mittelachsen' },
  { id: 'diag', label: '╳', title: 'Diagonalen' }
]

export function DrawBar(): React.JSX.Element {
  const tool = useUi((s) => s.tool)
  const color = useUi((s) => s.color)
  const width = useUi((s) => s.width)
  const guides = useUi((s) => s.guides)
  const showDraw = useUi((s) => s.showDraw)
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
    <div id="drawbar">
      {TOOLS.map((t) => (
        <button key={t.id} className={`tool${tool === t.id ? ' on' : ''}`} title={t.title} onClick={() => useUi.setState({ tool: t.id })}>
          {t.icon}
        </button>
      ))}
      <input type="color" value={color} title="Farbe" onChange={(e) => useUi.setState({ color: e.target.value })} />
      <input type="range" min={1} max={12} value={width} title="Strichstärke" style={{ width: 70 }} onChange={(e) => useUi.setState({ width: Number(e.target.value) })} />
      <button disabled={!hasProject} onClick={undoShape} title="Letzte Zeichnung dieses Shots entfernen">⌫</button>
      <button disabled={!hasProject} onClick={clearShapes} title="Alle Zeichnungen dieses Shots löschen (Strg+Z holt sie zurück)">🗑</button>
      <div className="sep" />
      {GUIDES.map((g) => (
        <button key={g.id} className={guides[g.id] ? 'on' : ''} title={g.title} onClick={() => useUi.setState({ guides: { ...guides, [g.id]: !guides[g.id] } })}>
          {g.label}
        </button>
      ))}
      <label className="small">
        <input type="checkbox" checked={showDraw} onChange={(e) => useUi.setState({ showDraw: e.target.checked })} /> Zeichnung zeigen
      </label>
    </div>
  )
}
