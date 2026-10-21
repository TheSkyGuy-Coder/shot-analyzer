import { fmtBytes } from '@/lib/time'
import { useEffect, useState } from 'react'
import { useUi } from '@/store/ui'
import type { AppInfo } from '@shared/types'

export function BusyDialog(): React.JSX.Element | null {
  const busy = useUi((s) => s.busy)
  if (!busy) return null
  return (
    <div className="modal">
      <div className="card">
        <h3>{busy.title}</h3>
        <div className="bar big"><i style={{ width: `${Math.round(busy.fraction * 100)}%` }} /></div>
        <p className="muted">{busy.text ?? ''} {busy.fraction > 0 ? `(${Math.round(busy.fraction * 100)} %)` : ''}</p>
        {busy.onCancel && <button onClick={busy.onCancel}>Abbrechen (Esc)</button>}
      </div>
    </div>
  )
}

export function Toast(): React.JSX.Element {
  const text = useUi((s) => s.toastText)
  return <div id="toast" className={text ? 'show' : ''}>{text}</div>
}

const KEYS: [string, string][] = [
  ['Leertaste', 'Play / Pause'],
  ['← →', 'Ein Frame zurück / vor (mit Shift: 1 Sekunde)'],
  ['↑ ↓', 'Vorheriger / nächster Shot'],
  ['C  oder  Strg+K', 'Schnitt am Abspielkopf setzen'],
  ['Entf', 'Schnitt vor dem aktuellen Shot entfernen (Shots werden verbunden)'],
  ['Alt + ← →', 'Nächsten Schnitt um 1 Frame verschieben (mit Shift: 5 Frames)'],
  ['Strg+Z / Strg+Y', 'Rückgängig / Wiederholen (auch Strg+Shift+Z)'],
  ['Strg+S / Strg+O', 'Analyse speichern / Video öffnen'],
  ['M', 'Ton aus / an'],
  ['1 … 7', 'Einstellungsgröße des aktuellen Shots setzen'],
  ['V P L A R E', 'Werkzeug: Auswahl, Stift, Linie, Pfeil, Rechteck, Ellipse'],
  ['G', 'Drittel-Raster ein / aus'],
  ['Esc', 'Werkzeug abwählen, Dialog schließen oder Vorgang abbrechen'],
  ['F1  oder  ?', 'Diese Hilfe'],
  ['Doppelklick Timeline', 'Schnitt setzen'],
  ['Schnitt ziehen', 'Schnitt verschieben. Rastet auf ganze Frames und auf erkannte Kandidaten (gelbe Marken) ein. Alt = nur Frames.'],
  ['Mausrad Timeline', 'Zoom (Shift + Rad: verschieben)']
]

export function HelpDialog(): React.JSX.Element | null {
  const open = useUi((s) => s.helpOpen)
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    if (open) void window.api.appInfo().then(setInfo)
  }, [open])
  if (!open) return null
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && useUi.setState({ helpOpen: false })}>
      <div className="card wide">
        <h3>Kurzanleitung</h3>
        <p className="muted">
          1) Video öffnen (beim ersten Mal wird ein Vorschau-Video erzeugt, das dauert kurz). 2) „Auto-Schnitte“ ausführen und die Timeline prüfen.
          3) Fehlende Schnitte per Doppelklick oder mit C setzen, falsche mit Entf entfernen. 4) Shot für Shot labeln. 5) Komposition mit dem Zeichenwerkzeug markieren.
          6) Reiter „Farbe“ und „Statistik“ ansehen. 7) Im Modus „Szenen“ Shots in Szenen (Ordner) legen und per Drag and Drop sortieren; mit der Gruppierung
          nach Kameraposition, Größe oder Funktion lässt sich die Abdeckung einer Szene prüfen. Alles wird automatisch gespeichert; mit „Analyse speichern“ erhältst du eine Datei zur Abgabe.
        </p>
        <table>
          <tbody>
            {KEYS.map(([k, d]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>)}
          </tbody>
        </table>
        <p className="muted">
          Die Erkennung findet harte Schnitte zuverlässig. Überblendungen, Wischer und Schnitte zwischen sehr ähnlichen Bildern können fehlen; die Empfindlichkeit lässt sich anpassen, den Rest korrigiert man von Hand.
          Dein Originalvideo wird nie verändert oder hochgeladen. Alles läuft lokal.
        </p>
        {info && (
          <div className="muted" style={{ fontSize: 12 }}>
            Version {info.version} · {info.ffmpegVersion.slice(0, 60)} · Vorschau-Cache {fmtBytes(info.cacheBytes)}{' '}
            <button onClick={() => void window.api.clearCache().then(() => window.api.appInfo().then(setInfo))}>Cache leeren</button>
          </div>
        )}
        <div style={{ marginTop: 12 }}><button className="primary" onClick={() => useUi.setState({ helpOpen: false })}>Schließen</button></div>
      </div>
    </div>
  )
}
