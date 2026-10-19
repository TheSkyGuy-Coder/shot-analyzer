import { addCutAtPlayhead, currentShotIndex } from '@/lib/actions'
import { gotoShot, stepFrames, togglePlay } from '@/lib/player'
import { fmtFrameTime } from '@/lib/time'
import { persistAudio, useUi } from '@/store/ui'
import { useProject } from '@/store/project'
import { Icon } from './Icon'

function TimeDisplay(): React.JSX.Element {
  const frame = useUi((s) => s.frame)
  const video = useProject((s) => s.project?.video)
  if (!video) return <span id="time" className="muted">–</span>
  return (
    <span id="time">
      {fmtFrameTime(frame, video.fps)} / {fmtFrameTime(video.frames, video.fps)}  ·  Frame {frame}
    </span>
  )
}

/** Erster Druck springt an den Anfang des Shots, wenn man schon weiter drin ist; sonst zum vorherigen Shot. */
function previousTarget(): number {
  const p = useProject.getState().project
  const f = useUi.getState().frame
  const i = currentShotIndex()
  return p && f - p.shots[i].startFrame > 12 ? i : i - 1
}

export function Transport(): React.JSX.Element {
  const has = useProject((s) => !!s.project)
  const fps = useProject((s) => s.project?.video.fps)
  const playing = useUi((s) => s.playing)
  const volume = useUi((s) => s.volume)
  const muted = useUi((s) => s.muted)
  const rate = useUi((s) => s.rate)
  const loopShot = useUi((s) => s.loopShot)

  const setAudio = (patch: { volume?: number; muted?: boolean }): void => {
    useUi.setState(patch)
    persistAudio()
  }
  const speaker = muted || volume === 0 ? 'muted' : 'speaker'

  return (
    <div id="transport">
      <button disabled={!has} onClick={() => gotoShot(previousTarget())} title="Vorheriger Shot (↑)"><Icon name="prevShot" /></button>
      <button disabled={!has} onClick={() => stepFrames(-1)} title="Ein Frame zurück (←)"><Icon name="stepBack" /></button>
      <button disabled={!has} onClick={togglePlay} title="Play/Pause (Leertaste)" style={{ minWidth: 40 }}><Icon name={playing ? 'pause' : 'play'} /></button>
      <button disabled={!has} onClick={() => stepFrames(1)} title="Ein Frame vor (→)"><Icon name="stepFwd" /></button>
      <button disabled={!has} onClick={() => gotoShot(currentShotIndex() + 1)} title="Nächster Shot (↓)"><Icon name="nextShot" /></button>
      <TimeDisplay />
      <button onClick={() => setAudio({ muted: !muted })} className={muted ? 'on' : ''} title="Ton aus/an (M)"><Icon name={speaker} /></button>
      <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume} style={{ width: 80 }} title="Lautstärke"
        onChange={(e) => setAudio({ volume: Number(e.target.value), muted: false })} />
      <select value={rate} onChange={(e) => useUi.setState({ rate: Number(e.target.value) })} title="Wiedergabegeschwindigkeit">
        {[0.25, 0.5, 1, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
      </select>
      <label className="small"><input type="checkbox" checked={loopShot} onChange={(e) => useUi.setState({ loopShot: e.target.checked })} /> Shot wiederholen</label>
      <button disabled={!has} onClick={addCutAtPlayhead} title="Schnitt am Abspielkopf (C oder Strg+K)"><Icon name="cut" /> Schnitt setzen</button>
      <button disabled={!has} onClick={() => window.dispatchEvent(new Event('timeline:fit'))}><Icon name="fit" /> Alles</button>
      {fps ? <span className="muted small">{fps.toFixed(3).replace(/\.?0+$/, '')} fps</span> : null}
    </div>
  )
}
