import { useEffect, useRef, useState } from 'react'
import {
  addCutAtPlayhead, clearAllCuts, exportCsv, exportPng, openProjectFile, openVideoDialog, runAutoDetect, saveProjectFile
} from '@/lib/actions'
import { thresholdForSensitivity } from '@/lib/shots'
import { useProject } from '@/store/project'
import { useUi } from '@/store/ui'
import { Icon } from './Icon'

interface Item {
  label: string
  keys?: string
  run?: () => void
  disabled?: boolean
  sep?: boolean
}

function MenuBar({ menus }: { menus: { title: string; items: Item[] }[] }): React.JSX.Element {
  const [open, setOpen] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open === null) return
    const away = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div id="menubar" ref={ref}>
      {menus.map((m, i) => (
        <div key={m.title} className="menuroot">
          <span
            className={`menutitle${open === i ? ' open' : ''}`}
            onMouseDown={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
          >
            {m.title}
          </span>
          {open === i && (
            <div className="menu">
              {m.items.map((it, j) =>
                it.sep ? (
                  <div key={j} className="menusep" />
                ) : (
                  <div
                    key={j}
                    className={`menuitem${it.disabled ? ' disabled' : ''}`}
                    onClick={() => {
                      if (it.disabled) return
                      setOpen(null)
                      it.run?.()
                    }}
                  >
                    <span>{it.label}</span>
                    <span className="keys">{it.keys}</span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function Header(): React.JSX.Element {
  const has = useProject((s) => !!s.project)
  const detected = useProject((s) => !!s.project?.ext.detected)
  const canUndo = useProject((s) => s.past.length > 0)
  const canRedo = useProject((s) => s.future.length > 0)
  const sens = useUi((s) => s.sens)
  const mode = useUi((s) => s.mode)
  const thr = thresholdForSensitivity(sens)
  const undo = useProject((s) => s.undo)
  const redo = useProject((s) => s.redo)

  const menus = [
    {
      title: 'Datei',
      items: [
        { label: 'Video öffnen …', keys: 'Strg+O', run: () => void openVideoDialog() },
        { label: 'Analyse laden …', run: () => void openProjectFile() },
        { label: 'Analyse speichern …', keys: 'Strg+S', disabled: !has, run: () => void saveProjectFile() },
        { sep: true, label: '' },
        { label: 'Exportieren: CSV-Tabelle …', disabled: !has, run: () => void exportCsv() },
        { label: 'Exportieren: Standbild (PNG) …', disabled: !has, run: () => void exportPng() }
      ]
    },
    {
      title: 'Bearbeiten',
      items: [
        { label: 'Rückgängig', keys: 'Strg+Z', disabled: !canUndo, run: undo },
        { label: 'Wiederholen', keys: 'Strg+Y', disabled: !canRedo, run: redo },
        { sep: true, label: '' },
        { label: 'Alle Schnitte löschen', disabled: !has, run: clearAllCuts }
      ]
    },
    {
      title: 'Analyse',
      items: [
        { label: 'Auto-Schnitte', disabled: !has, run: () => void runAutoDetect() },
        { label: 'Neu erkennen', disabled: !detected, run: () => void runAutoDetect(true) },
        { sep: true, label: '' },
        { label: 'Schnitt am Abspielkopf setzen', keys: 'C', disabled: !has, run: addCutAtPlayhead }
      ]
    },
    {
      title: 'Ansicht',
      items: [
        { label: 'Modus: Analyse (Schnitte und Labels)', run: () => useUi.setState({ mode: 'analyze' }) },
        { label: 'Modus: Szenen-Outliner', run: () => useUi.setState({ mode: 'scenes' }) }
      ]
    },
    {
      title: 'Hilfe',
      items: [{ label: 'Kurzanleitung und Tastenkürzel', keys: 'F1', run: () => useUi.setState({ helpOpen: true }) }]
    }
  ] satisfies { title: string; items: Item[] }[]

  return (
    <header>
      <MenuBar menus={menus} />
      <div id="toolbar">
        <button className="tb" onClick={() => void openVideoDialog()} title="Video öffnen (Strg+O)"><Icon name="open" /></button>
        <button className="tb" disabled={!has} onClick={() => void saveProjectFile()} title="Analyse speichern (Strg+S)"><Icon name="save" /></button>
        <div className="tsep" />
        <button className="tb" disabled={!canUndo} onClick={undo} title="Rückgängig (Strg+Z)"><Icon name="undo" /></button>
        <button className="tb" disabled={!canRedo} onClick={redo} title="Wiederholen (Strg+Y)"><Icon name="redo" /></button>
        <div className="tsep" />
        <button disabled={!has} onClick={() => void runAutoDetect()} title="Schnitte automatisch mit FFmpeg erkennen und setzen">Auto-Schnitte</button>
        {detected && (
          <button className="tb" onClick={() => void runAutoDetect(true)} title="Video erneut analysieren"><Icon name="refresh" /></button>
        )}
        <label className="small" title={`Schwelle ${thr.toFixed(2)}. Höher = mehr Schnitte, auch schwache.`}>
          Empfindlichkeit
          <input type="range" min={1} max={10} value={sens} onChange={(e) => useUi.setState({ sens: Number(e.target.value) })} style={{ width: 90 }} />
          <span className="val">{sens}</span>
        </label>
        <div className="tsep" />
        <button disabled={!has} onClick={clearAllCuts} title="Alle Schnitte entfernen">Schnitte löschen</button>
        <div className="spacer" />
        <div className="seg" title="Arbeitsmodus">
          <button className={mode === 'analyze' ? 'on' : ''} onClick={() => useUi.setState({ mode: 'analyze' })}>Analyse</button>
          <button className={mode === 'scenes' ? 'on' : ''} disabled={!has} onClick={() => useUi.setState({ mode: 'scenes' })}>Szenen</button>
        </div>
        <button className="tb" onClick={() => useUi.setState({ helpOpen: true })} title="Hilfe und Tastenkürzel (F1)"><Icon name="help" /></button>
      </div>
    </header>
  )
}
