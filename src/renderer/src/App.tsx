import { useEffect, useState } from 'react'
import { ToolBox, ViewerBar } from './components/DrawBar'
import { Header } from './components/Header'
import { Outliner } from './components/Outliner'
import { BusyDialog, HelpDialog, Toast } from './components/Overlays'
import { Timeline } from './components/Timeline'
import { Transport } from './components/Transport'
import { Viewer } from './components/Viewer'
import { loadProjectJson, openVideo, setBusyProgress, startAutosave } from './lib/actions'
import { useHotkeys } from './lib/hotkeys'
import { shotIndexAt } from './lib/shots'
import { fmtFrameTime } from './lib/time'
import { panelRegistry } from './lib/plugins'
import { useProject } from './store/project'
import { toast, useUi } from './store/ui'
import './panels'

const VIDEO_RE = /\.(mp4|mov|m4v|mkv|webm|avi|mxf|mpg|mpeg|mts|m2ts|wmv|flv|ogv)$/i

function Sidebar(): React.JSX.Element {
  const tab = useUi((s) => s.tab)
  const mode = useUi((s) => s.mode)
  if (mode === 'scenes') return <aside><Outliner /></aside>
  const active = panelRegistry.find((p) => p.id === tab) ?? panelRegistry[0]
  const Panel = active.component
  return (
    <aside>
      <div id="tabs">
        {panelRegistry.map((p) => (
          <button key={p.id} className={p.id === active.id ? 'on' : ''} onClick={() => useUi.setState({ tab: p.id })}>{p.title}</button>
        ))}
      </div>
      <div id="panels"><Panel /></div>
    </aside>
  )
}

function DropHint(): React.JSX.Element | null {
  const has = useProject((s) => !!s.project)
  if (has) return null
  return (
    <div id="drop">
      <div><b>Video hierher ziehen</b> oder Datei &gt; Video öffnen wählen.</div>
      <div className="muted" style={{ maxWidth: 440 }}>
        Alles läuft lokal auf deinem Rechner, es wird nichts hochgeladen. Auch Formate wie ProRes oder H.265 aus Premiere und After Effects sind möglich.
        Eine gespeicherte Analyse (.json) kann ebenfalls hineingezogen werden.
      </div>
    </div>
  )
}

function StatusBar(): React.JSX.Element {
  const project = useProject((s) => s.project)
  const frame = useUi((s) => s.frame)
  if (!project) return <footer id="statusbar"><span>Bereit</span></footer>
  const v = project.video
  const idx = shotIndexAt(project.shots, frame)
  return (
    <footer id="statusbar">
      <span>{v.name}</span>
      <span>{v.width}×{v.height}</span>
      <span>{v.fps.toFixed(3).replace(/\.?0+$/, '')} fps</span>
      <span>Shot {idx + 1} / {project.shots.length}</span>
      <span>Frame {frame} / {v.frames}</span>
      <span>{fmtFrameTime(frame, v.fps)}</span>
    </footer>
  )
}

export function App(): React.JSX.Element {
  const [over, setOver] = useState(false)
  const mode = useUi((s) => s.mode)
  useHotkeys()

  useEffect(() => {
    const off = window.api.onProgress((p) => setBusyProgress(p.jobId, p.fraction, p.text))
    const offSave = startAutosave()
    return () => {
      off()
      offSave()
    }
  }, [])

  useEffect(() => {
    const prevent = (e: DragEvent): void => {
      e.preventDefault()
      // Nur Datei-Drags (Video, Analyse) zeigen die Ablage-Markierung, nicht das Umsortieren im Outliner.
      setOver((e.type === 'dragenter' || e.type === 'dragover') && !!e.dataTransfer?.types.includes('Files'))
    }
    const drop = async (e: DragEvent): Promise<void> => {
      e.preventDefault()
      setOver(false)
      const f = e.dataTransfer?.files[0]
      if (!f) return
      if (/\.json$/i.test(f.name)) await loadProjectJson(await f.text())
      else if (VIDEO_RE.test(f.name) || f.type.startsWith('video/')) await openVideo(window.api.pathForFile(f))
      else toast('Dieses Dateiformat wird nicht unterstützt')
    }
    window.addEventListener('dragenter', prevent)
    window.addEventListener('dragover', prevent)
    window.addEventListener('dragleave', prevent)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', prevent)
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('dragleave', prevent)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return (
    <div className={`app${over ? ' dragover' : ''}`}>
      <Header />
      <main className={mode === 'scenes' ? 'scenes' : ''}>
        <section id="stage">
          <ViewerBar />
          <div className="viewerArea">
            <ToolBox />
            <Viewer />
            <DropHint />
          </div>
          <Transport />
          <Timeline />
        </section>
        <Sidebar />
      </main>
      <StatusBar />
      <BusyDialog />
      <HelpDialog />
      <Toast />
    </div>
  )
}
