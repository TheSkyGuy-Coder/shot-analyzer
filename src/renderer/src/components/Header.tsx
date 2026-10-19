import {
  clearAllCuts, exportCsv, exportPng, openProjectFile, openVideoDialog, runAutoDetect, saveProjectFile
} from '@/lib/actions'
import { thresholdForSensitivity } from '@/lib/shots'
import { useProject } from '@/store/project'
import { useUi } from '@/store/ui'

export function Header(): React.JSX.Element {
  const has = useProject((s) => !!s.project)
  const detected = useProject((s) => !!s.project?.ext.detected)
  const canUndo = useProject((s) => s.past.length > 0)
  const canRedo = useProject((s) => s.future.length > 0)
  const sens = useUi((s) => s.sens)
  const thr = thresholdForSensitivity(sens)
  const undo = useProject((s) => s.undo)
  const redo = useProject((s) => s.redo)

  return (
    <header>
      <h1>🎬 Shot Analyzer</h1>
      <button className="primary" onClick={() => void openVideoDialog()} title="Video öffnen (Strg+O)">Video öffnen</button>
      <div className="grp">
        <button disabled={!canUndo} onClick={undo} title="Rückgängig (Strg+Z)">↶ Undo</button>
        <button disabled={!canRedo} onClick={redo} title="Wiederholen (Strg+Y)">↷ Redo</button>
      </div>
      <div className="grp">
        <button disabled={!has} onClick={() => void runAutoDetect()} title="Schnitte automatisch mit FFmpeg erkennen und setzen">Auto-Schnitte</button>
        <label className="small" title={`Schwelle ${thr.toFixed(2)}. Höher = mehr Schnitte, auch schwache.`}>
          Empfindlichkeit
          <input type="range" min={1} max={10} value={sens} onChange={(e) => useUi.setState({ sens: Number(e.target.value) })} style={{ width: 90 }} />
        </label>
        {detected && <button onClick={() => void runAutoDetect(true)} title="Video erneut analysieren">↻ Neu erkennen</button>}
        <button disabled={!has} onClick={clearAllCuts} title="Alle Schnitte entfernen">Schnitte löschen</button>
      </div>
      <div className="grp">
        <button disabled={!has} onClick={() => void saveProjectFile()} title="Analyse als Datei speichern (Strg+S)">Analyse speichern</button>
        <button onClick={() => void openProjectFile()}>Analyse laden</button>
        <button disabled={!has} onClick={() => void exportCsv()}>CSV</button>
        <button disabled={!has} onClick={() => void exportPng()} title="Aktuelles Standbild inkl. Zeichnung in Originalauflösung">Standbild PNG</button>
      </div>
      <div className="grp">
        <button onClick={() => useUi.setState({ helpOpen: true })} title="Hilfe und Tastenkürzel (F1)">? Hilfe</button>
      </div>
    </header>
  )
}
