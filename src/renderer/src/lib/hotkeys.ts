/**
 * Tastenkürzel (bewusst nah an Premiere Pro):
 *   Leertaste            Play/Pause
 *   ← →                  ein Frame zurück/vor        (Shift: 1 Sekunde)
 *   ↑ ↓                  vorheriger/nächster Shot
 *   C  oder  Strg+K      Schnitt am Abspielkopf
 *   Entf                 Schnitt vor dem aktuellen Shot entfernen
 *   Alt+← →              nächsten Schnitt um 1 Frame verschieben (Alt+Shift: 5 Frames)
 *   Strg+Z / Strg+Y      Rückgängig / Wiederholen (auch Strg+Shift+Z)
 *   Strg+S / Strg+O      Analyse speichern / Video öffnen
 *   M                    Ton aus/an
 *   1 … 7                Einstellungsgröße setzen
 *   V P L A R E          Werkzeug: Auswahl, Stift, Linie, Pfeil, Rechteck, Ellipse
 *   G                    Drittel-Raster ein/aus
 *   Esc                  Werkzeug abwählen / Dialog schließen
 *   F1  oder  ?          Hilfe
 * Im Szenen-Modus gelten nur Leertaste, Pfeile und M (Schnitt- und Label-Kürzel sind gesperrt).
 */
import { useEffect } from 'react'
import {
  addCutAtPlayhead, labelByNumber, nudgeNearestCut, openVideoDialog, removeCutAtCurrentShot, saveProjectFile
} from './actions'
import { gotoShot, seekFrame, stepFrames, togglePlay } from './player'
import { currentShotIndex } from './actions'
import { useProject } from '@/store/project'
import { persistAudio, useUi, type Tool } from '@/store/ui'

const TOOL_KEYS: Record<string, Tool> = { v: 'none', p: 'pen', l: 'line', a: 'arrow', r: 'rect', e: 'ellipse' }

export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      const tag = t.tagName
      const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['range', 'checkbox', 'color'].includes((t as HTMLInputElement).type))
      if (typing) {
        if (e.key === 'Escape') t.blur() // Esc verlässt das Notizfeld, danach gelten die Hotkeys wieder
        return
      }
      const ui = useUi.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const hasProject = !!useProject.getState().project
      let used = true

      if (ui.busy) {
        if (key === 'escape') ui.busy.onCancel?.()
        e.preventDefault()
        return
      }

      if (mod) {
        if (key === 'z' && !e.shiftKey) useProject.getState().undo()
        else if (key === 'y' || (key === 'z' && e.shiftKey)) useProject.getState().redo()
        else if (key === 's') void saveProjectFile()
        else if (key === 'o') void openVideoDialog()
        else if (key === 'k' && hasProject) addCutAtPlayhead()
        else used = false
        if (used) e.preventDefault()
        return
      }

      if (key === 'f1' || e.key === '?') {
        useUi.setState({ helpOpen: !ui.helpOpen })
        e.preventDefault()
        return
      }
      if (key === 'escape') {
        if (ui.helpOpen) useUi.setState({ helpOpen: false })
        else useUi.setState({ tool: 'none' })
        return
      }
      if (!hasProject) return
      // Im Szenen-Modus nur Wiedergabe und Navigation, damit nichts aus Versehen geschnitten oder gelabelt wird.
      if (ui.mode === 'scenes' && ![' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'm'].includes(key)) return

      if (e.altKey) {
        if (key === 'arrowleft') nudgeNearestCut(e.shiftKey ? -5 : -1)
        else if (key === 'arrowright') nudgeNearestCut(e.shiftKey ? 5 : 1)
        else used = false
        if (used) e.preventDefault()
        return
      }

      const fps = useProject.getState().project?.video.fps ?? 25
      switch (key) {
        case ' ': togglePlay(); break
        case 'arrowleft': e.shiftKey ? seekFrame(ui.frame - Math.round(fps)) : stepFrames(-1); break
        case 'arrowright': e.shiftKey ? seekFrame(ui.frame + Math.round(fps)) : stepFrames(1); break
        case 'arrowup': gotoShot(currentShotIndex() - 1); break
        case 'arrowdown': gotoShot(currentShotIndex() + 1); break
        case 'c': addCutAtPlayhead(); break
        case 'delete': case 'backspace': removeCutAtCurrentShot(); break
        case 'm': useUi.setState({ muted: !ui.muted }); persistAudio(); break
        case 'g': useUi.setState({ guides: { ...ui.guides, third: !ui.guides.third } }); break
        default:
          if (/^[1-9]$/.test(key) && !e.shiftKey) labelByNumber(Number(key))
          else if (TOOL_KEYS[key]) useUi.setState({ tool: TOOL_KEYS[key] })
          else used = false
      }
      if (used) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
