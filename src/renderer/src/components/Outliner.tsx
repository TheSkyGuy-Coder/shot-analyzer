import { useRef, useState } from 'react'
import type { Project, Shot } from '@shared/project'
import { gotoShot, togglePlay } from '@/lib/player'
import {
  addScene, allSetups, assignGroup, deleteScene, groupShots, moveScene, moveShots, renameScene,
  sceneShots, sceneStats, setSetup, sortSceneChronological, updateScene, type Anchor, type GroupBy
} from '@/lib/scenes'
import { useSeen, useThumb } from '@/lib/thumbs'
import { shotIndexAt } from '@/lib/shots'
import { fmtTime } from '@/lib/time'
import { useProject } from '@/store/project'
import { toast, useUi } from '@/store/ui'
import { Icon } from './Icon'

const NONE = '_none'
const folderKey = (id: string | null): string => id ?? NONE

interface Drop {
  folder: string | null
  /** undefined = Folder ohne Gruppierung, sonst Gruppenwert (null = "Ohne Angabe"). */
  group?: string | null
  anchor: Anchor | null
}

const commit = (fn: Parameters<ReturnType<typeof useProject.getState>['commit']>[0], key?: string): void => useProject.getState().commit(fn, key)

/* --------------------------------------------------------------------------- kleine Bausteine */

function Thumb({ frame }: { frame: number }): React.JSX.Element {
  const [ref, seen] = useSeen<HTMLDivElement>()
  const url = useThumb(frame, seen)
  const ratio = useProject((s) => (s.project ? s.project.video.width / s.project.video.height : 16 / 9))
  return (
    <div ref={ref} className="thumb" style={{ aspectRatio: String(ratio) }}>
      {url && <img src={url} alt="" draggable={false} />}
    </div>
  )
}

function SizeBar({ p, sceneId }: { p: Project; sceneId: string | null }): React.JSX.Element | null {
  const st = sceneStats(p, sceneId)
  const sizes = p.taxonomy.find((a) => a.id === 'size')
  if (!sizes || !st.frames) return null
  const total = Object.values(st.bySize).reduce((a, b) => a + b, 0)
  if (!total) return null
  return (
    <div className="sizebar" title={sizes.items.filter((i) => st.bySize[i.id]).map((i) => `${i.en ?? i.label}: ${Math.round((st.bySize[i.id] / st.frames) * 100)} %`).join('\n')}>
      {sizes.items.filter((i) => st.bySize[i.id]).map((i) => (
        <i key={i.id} style={{ width: `${(st.bySize[i.id] / total) * 100}%`, background: i.color ?? '#777' }} />
      ))}
    </div>
  )
}

function chipsOf(p: Project, s: Shot): { text: string; title: string; color?: string; func?: boolean }[] {
  const out: { text: string; title: string; color?: string; func?: boolean }[] = []
  for (const ax of p.taxonomy) {
    if (ax.id === 'light') continue
    const v = s.labels[ax.id]
    const vals = v === undefined ? [] : Array.isArray(v) ? v : [v]
    for (const id of vals) {
      const it = ax.items.find((i) => i.id === id)
      if (it) out.push({ text: it.en ?? it.label, title: `${ax.title}: ${it.label}`, color: ax.id === 'size' ? it.color : undefined, func: ax.id === 'func' })
    }
  }
  return out
}

/* --------------------------------------------------------------------------- Zeile */

interface RowProps {
  p: Project
  shot: Shot
  maxFrames: number
  sceneColor: string
  folder: string | null
  group?: string | null
  selected: boolean
  current: boolean
  drop: Drop | null
  onSelect(e: React.MouseEvent, id: string): void
  onDragStart(e: React.DragEvent, id: string): void
  onOver(e: React.DragEvent, d: Drop): void
  onDrop(e: React.DragEvent, d: Drop): void
  onEnd(): void
}

function ShotRow(props: RowProps): React.JSX.Element {
  const { p, shot, maxFrames, sceneColor, folder, group, selected, current, drop } = props
  const idx = p.shots.indexOf(shot)
  const fps = p.video.fps
  const frames = shot.endFrame - shot.startFrame
  const mid = Math.floor((shot.startFrame + shot.endFrame - 1) / 2)
  const size = p.taxonomy.find((a) => a.id === 'size')?.items.find((i) => i.id === shot.labels.size)
  const chips = chipsOf(p, shot)
  const pal = shot.palette?.colors ?? []
  const here = drop && drop.folder === folder && drop.group === group && drop.anchor?.id === shot.id
  const cls = ['shotrow', selected ? 'sel' : '', current ? 'cur' : '', here ? (drop?.anchor?.after ? 'drop-after' : 'drop-before') : ''].join(' ')

  const over = (e: React.DragEvent): void => {
    const r = e.currentTarget.getBoundingClientRect()
    props.onOver(e, { folder, group, anchor: { id: shot.id, after: e.clientY > r.top + r.height / 2 } })
  }
  const dropHere = (e: React.DragEvent): void => {
    const r = e.currentTarget.getBoundingClientRect()
    props.onDrop(e, { folder, group, anchor: { id: shot.id, after: e.clientY > r.top + r.height / 2 } })
  }

  return (
    <div
      className={cls}
      draggable
      onClick={(e) => props.onSelect(e, shot.id)}
      onDoubleClick={() => {
        gotoShot(idx)
        if (!useUi.getState().playing) togglePlay()
      }}
      onDragStart={(e) => props.onDragStart(e, shot.id)}
      onDragEnd={props.onEnd}
      onDragOver={over}
      onDrop={dropHere}
    >
      <div className="rail"><i style={{ background: size?.color ?? sceneColor }} /></div>
      <Thumb frame={mid} />
      <div className="sinfo">
        <div className="sline">
          <b>Shot {idx + 1}</b>
          <span className="muted">{fmtTime(shot.startFrame / fps)} – {fmtTime(shot.endFrame / fps)}</span>
          <span>{(frames / fps).toFixed(1).replace('.', ',')} s</span>
          {shot.setup && <span className="setup" title="Kameraposition">{shot.setup}</span>}
          {shot.note && <span className="muted" title={shot.note}>Notiz</span>}
        </div>
        <div className="schips">
          {chips.length ? chips.map((c, i) => (
            <span key={i} className={`mini${c.func ? ' func' : ''}`} title={c.title} style={c.color ? { borderLeft: `3px solid ${c.color}` } : undefined}>{c.text}</span>
          )) : <span className="muted">nicht bewertet</span>}
        </div>
        <div className="dur"><i style={{ width: `${Math.max(2, (frames / maxFrames) * 100)}%`, background: size?.color ?? sceneColor }} /></div>
      </div>
      {pal.length > 0 && (
        <div className="spal" title="Farbpalette">
          {pal.slice(0, 5).map((c, i) => <i key={i} style={{ background: c.hex }} />)}
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------------- Ordner */

interface FolderProps {
  p: Project
  sceneId: string | null
  flatSel(e: React.MouseEvent, id: string): void
  drop: Drop | null
  sceneDrop: { id: string; after: boolean } | null
  playId: string | undefined
  hooks: Omit<RowProps, 'p' | 'shot' | 'maxFrames' | 'sceneColor' | 'folder' | 'group' | 'selected' | 'current' | 'drop'> & {
    onDropHeader(e: React.DragEvent, folder: string | null): void
    onSceneOver(e: React.DragEvent, id: string): void
    onSceneDrop(e: React.DragEvent, id: string): void
    onSceneDragStart(e: React.DragEvent, id: string): void
  }
}

function Folder({ p, sceneId, drop, sceneDrop, playId, hooks }: FolderProps): React.JSX.Element {
  const key = folderKey(sceneId)
  const scene = sceneId ? p.scenes.find((x) => x.id === sceneId) : undefined
  const collapsed = useUi((s) => !!s.collapsed[key])
  const by: GroupBy = useUi((s) => s.groupBy[key] ?? 'manual')
  const sel = useUi((s) => s.sel)
  const [editing, setEditing] = useState(false)
  const shots = sceneShots(p, sceneId)
  const st = sceneStats(p, sceneId)
  const fps = p.video.fps
  const color = scene?.color ?? '#7a7a7a'
  const maxFrames = Math.max(1, ...shots.map((s) => s.endFrame - s.startFrame))
  const groups = groupShots(p, shots, by)
  const dragOverHeader = drop && drop.folder === sceneId && drop.anchor === null && drop.group === undefined
  const sceneLine = sceneDrop && sceneDrop.id === sceneId ? (sceneDrop.after ? 'scene-after' : 'scene-before') : ''
  const setBy = (v: string): void => useUi.setState((s) => ({ groupBy: { ...s.groupBy, [key]: v } }))

  const headOver = (e: React.DragEvent): void => {
    if (sceneId) hooks.onSceneOver(e, sceneId) // Szenen-Drag: Linie davor/dahinter
    hooks.onOver(e, { folder: sceneId, anchor: null })
  }

  return (
    <div className={`folder ${sceneLine}`}>
      <div
        className={`fhead${dragOverHeader ? ' droptarget' : ''}`}
        onDragOver={headOver}
        onDrop={(e) => (sceneId ? hooks.onSceneDrop(e, sceneId) : undefined) ?? hooks.onDropHeader(e, sceneId)}
      >
        <button className="tb" title={collapsed ? 'Aufklappen' : 'Zuklappen'} onClick={() => useUi.setState((s) => ({ collapsed: { ...s.collapsed, [key]: !collapsed } }))}>
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} />
        </button>
        {scene ? (
          <span className="grip" draggable onDragStart={(e) => hooks.onSceneDragStart(e, scene.id)} onDragEnd={hooks.onEnd} title="Szene verschieben"><Icon name="grip" /></span>
        ) : <span className="grip off" />}
        {scene ? (
          <input type="color" className="fcolor" value={color} title="Farbe der Szene" onChange={(e) => commit((d) => updateScene(d, scene.id, { color: e.target.value }), `scol-${scene.id}`)} />
        ) : <span className="fcolor off" />}
        {scene && editing ? (
          <input
            className="fname-edit" autoFocus defaultValue={scene.name}
            onBlur={(e) => { setEditing(false); if (e.target.value.trim() && e.target.value !== scene.name) commit((d) => renameScene(d, scene.id, e.target.value)) }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { e.currentTarget.value = scene.name; e.currentTarget.blur() } }}
          />
        ) : (
          <b className="fname" title={scene ? 'Doppelklick zum Umbenennen' : undefined} onDoubleClick={() => scene && setEditing(true)}>{scene ? scene.name : 'Nicht zugeordnet'}</b>
        )}
        {scene && (
          <input
            key={scene.id + scene.location} className="floc" defaultValue={scene.location} placeholder="Location"
            onBlur={(e) => { if (e.target.value !== scene.location) commit((d) => updateScene(d, scene.id, { location: e.target.value.trim() })) }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        )}
        <div className="fstats">
        <span className="fstat" title="Anzahl Shots">{st.count} Shots</span>
        <span className="fstat" title="Gesamtdauer">{fmtTime(st.frames / fps, false)}</span>
        <span className={`fstat${st.brollFrames ? ' broll' : ''}`} title="Anteil Shots mit Funktion B-Roll (nach Dauer)">B-Roll {st.frames ? Math.round((st.brollFrames / st.frames) * 100) : 0} %</span>
        <SizeBar p={p} sceneId={sceneId} />
        </div>
        <div className="fctl">
        <select className="fgroup" value={by} onChange={(e) => setBy(e.target.value)} title="Gruppierung: Shots per Drag and Drop in eine Gruppe ziehen, um den Wert zu setzen">
          <option value="manual">Manuell sortiert</option>
          <option value="setup">Nach Kameraposition</option>
          {p.taxonomy.map((a) => <option key={a.id} value={a.id}>Nach {a.title}</option>)}
        </select>
        {scene && by === 'manual' && (
          <button className="tb" title="Chronologisch sortieren (wie im Video)" onClick={() => commit((d) => sortSceneChronological(d, scene.id))}><Icon name="sortTime" /></button>
        )}
        {scene && (
          <button className="tb" title="Szene löschen (Shots bleiben erhalten)" onClick={() => commit((d) => deleteScene(d, scene.id))}><Icon name="trash" /></button>
        )}
        </div>
      </div>

      {!collapsed && (
        <div className="fbody" style={{ ['--scene' as string]: color }}>
          {!shots.length && <div className="empty muted">{scene ? 'Leer: Shots hierher ziehen.' : 'Alle Shots sind einer Szene zugeordnet. Hierher ziehen, um sie wieder zu lösen.'}</div>}
          {groups.map((g) => {
            if (by !== 'manual' && !g.shots.length && g.key === null) return null
            const lastId = g.shots.length ? g.shots[g.shots.length - 1].id : undefined
            const laneDrop = drop && drop.folder === sceneId && drop.group === g.key && by !== 'manual'
            return (
              <div key={String(g.key)} className="grp">
                {by !== 'manual' && (
                  <div
                    className={`lane${laneDrop && !drop?.anchor ? ' droptarget' : ''}`}
                    onDragOver={(e) => hooks.onOver(e, { folder: sceneId, group: g.key, anchor: lastId ? { id: lastId, after: true } : null })}
                    onDrop={(e) => hooks.onDrop(e, { folder: sceneId, group: g.key, anchor: lastId ? { id: lastId, after: true } : null })}
                  >
                    {g.color && <i style={{ background: g.color }} />}
                    <span>{g.label}</span>
                    <span className="muted">{g.shots.length}</span>
                  </div>
                )}
                {g.shots.map((s) => (
                  <ShotRow
                    key={s.id} {...hooks} p={p} shot={s} maxFrames={maxFrames} sceneColor={color} folder={sceneId}
                    group={by === 'manual' ? undefined : g.key} selected={sel.includes(s.id)} current={playId === s.id} drop={drop}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------------- Auswahlleiste */

function SelectionBar({ p }: { p: Project }): React.JSX.Element | null {
  const sel = useUi((s) => s.sel)
  const shots = p.shots.filter((s) => sel.includes(s.id))
  if (!shots.length) return null
  const ids = shots.map((s) => s.id)
  const frames = shots.reduce((a, s) => a + s.endFrame - s.startFrame, 0)
  const scenes = new Set(shots.map((s) => s.sceneId && p.scenes.some((x) => x.id === s.sceneId) ? s.sceneId : NONE))
  const sceneValue = scenes.size === 1 ? [...scenes][0] : '__mixed'
  const setups = new Set(shots.map((s) => s.setup ?? ''))
  const setupValue = setups.size === 1 ? [...setups][0] : ''

  return (
    <div className="selbar">
      <span><b>{shots.length}</b> ausgewählt · {fmtTime(frames / p.video.fps, false)}</span>
      <label className="small">
        Szene
        <select value={sceneValue} onChange={(e) => commit((d) => { moveShots(d, ids, e.target.value === NONE ? null : e.target.value) })}>
          {sceneValue === '__mixed' && <option value="__mixed" disabled>(verschieden)</option>}
          <option value={NONE}>Nicht zugeordnet</option>
          {p.scenes.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
        </select>
      </label>
      <label className="small">
        Kameraposition
        <input
          key={ids.join() + setupValue} list="setups" type="text" defaultValue={setupValue}
          placeholder={setups.size > 1 ? '(verschieden)' : 'z. B. A'} style={{ width: 120 }}
          onBlur={(e) => { if (e.target.value.trim() !== setupValue && !(setups.size > 1 && !e.target.value.trim())) commit((d) => setSetup(d, ids, e.target.value)) }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <datalist id="setups">{allSetups(p).map((s) => <option key={s} value={s} />)}</datalist>
      </label>
      <button onClick={() => useUi.setState({ sel: [], selAnchor: null })}>Auswahl aufheben</button>
    </div>
  )
}

/* --------------------------------------------------------------------------- Outliner */

export function Outliner(): React.JSX.Element {
  const p = useProject((s) => s.project)
  const sel = useUi((s) => s.sel)
  const playId = useUi((s) => {
    const pr = useProject.getState().project
    return pr ? pr.shots[shotIndexAt(pr.shots, s.frame)]?.id : undefined
  })
  const [drop, setDrop] = useState<Drop | null>(null)
  const [sceneDrop, setSceneDrop] = useState<{ id: string; after: boolean } | null>(null)
  const dragIds = useRef<string[]>([])
  const dragScene = useRef<string | null>(null)

  if (!p) return <div className="outl"><div className="empty muted" style={{ padding: 16 }}>Öffne zuerst ein Video. Danach kannst du hier Szenen anlegen und Shots sortieren.</div></div>

  const folders: (string | null)[] = [...p.scenes.map((s) => s.id), null]

  // Sichtbare Shots in Anzeigereihenfolge (für Shift-Auswahl und Drag mehrerer Shots).
  const visible = (): string[] => {
    const ui = useUi.getState()
    const out: string[] = []
    for (const f of folders) {
      if (ui.collapsed[folderKey(f)]) continue
      const shots = sceneShots(p, f)
      for (const g of groupShots(p, shots, ui.groupBy[folderKey(f)] ?? 'manual')) for (const s of g.shots) out.push(s.id)
    }
    return out
  }

  const end = (): void => {
    dragIds.current = []
    dragScene.current = null
    setDrop(null)
    setSceneDrop(null)
  }

  const onSelect = (e: React.MouseEvent, id: string): void => {
    const ui = useUi.getState()
    if (e.shiftKey && ui.selAnchor) {
      const order = visible()
      const a = order.indexOf(ui.selAnchor)
      const b = order.indexOf(id)
      if (a >= 0 && b >= 0) return void useUi.setState({ sel: order.slice(Math.min(a, b), Math.max(a, b) + 1) })
    }
    if (e.ctrlKey || e.metaKey) {
      useUi.setState({ sel: ui.sel.includes(id) ? ui.sel.filter((x) => x !== id) : [...ui.sel, id], selAnchor: id })
      return
    }
    useUi.setState({ sel: [id], selAnchor: id })
    const i = p.shots.findIndex((s) => s.id === id)
    if (i >= 0) gotoShot(i)
  }

  const onDragStart = (e: React.DragEvent, id: string): void => {
    const ui = useUi.getState()
    let ids = ui.sel.includes(id) ? visible().filter((x) => ui.sel.includes(x)) : [id]
    if (!ui.sel.includes(id)) useUi.setState({ sel: [id], selAnchor: id })
    if (!ids.length) ids = [id]
    dragIds.current = ids
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-shot-ids', JSON.stringify(ids))
  }

  const onOver = (e: React.DragEvent, d: Drop): void => {
    if (dragScene.current) return
    if (!dragIds.current.length) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDrop(d)
  }

  const perform = (d: Drop): void => {
    const ids = dragIds.current
    if (!ids.length) return
    const by = useUi.getState().groupBy[folderKey(d.folder)] ?? 'manual'
    commit((draft) => {
      if (d.group !== undefined && by !== 'manual') assignGroup(draft, ids, by, d.group)
      moveShots(draft, ids, d.folder, d.anchor)
    })
    if (d.folder === null && p.scenes.length === 0) toast('Lege zuerst eine Szene an, dann kannst du Shots hineinziehen')
  }

  const onDrop = (e: React.DragEvent, d: Drop): void => {
    if (!dragIds.current.length) return
    e.preventDefault()
    e.stopPropagation()
    perform(d)
    end()
  }

  const hooks = {
    flatSel: onSelect,
    onSelect,
    onDragStart,
    onOver,
    onDrop,
    onEnd: end,
    onDropHeader: (e: React.DragEvent, folder: string | null) => onDrop(e, { folder, anchor: null }),
    onSceneDragStart: (e: React.DragEvent, id: string) => {
      dragScene.current = id
      dragIds.current = []
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('application/x-scene-id', id)
    },
    onSceneOver: (e: React.DragEvent, id: string) => {
      if (!dragScene.current) return
      e.preventDefault()
      e.stopPropagation()
      const r = e.currentTarget.getBoundingClientRect()
      setSceneDrop({ id, after: e.clientY > r.top + r.height / 2 })
    },
    onSceneDrop: (e: React.DragEvent, id: string) => {
      const moving = dragScene.current
      if (!moving) return undefined
      e.preventDefault()
      e.stopPropagation()
      const after = sceneDrop?.id === id ? sceneDrop.after : false
      commit((d) => moveScene(d, moving, id, after))
      end()
      return true
    }
  }

  const total = sceneStats(p, undefined)
  const fps = p.video.fps
  const newScene = (fromSelection: boolean): void => {
    const ids = fromSelection ? visible().filter((x) => sel.includes(x)) : []
    commit((d) => {
      const id = addScene(d)
      if (ids.length) moveShots(d, ids, id)
    })
  }

  return (
    <div className="outl">
      <div className="outl-bar">
        <button onClick={() => newScene(false)} title="Neue, leere Szene anlegen"><Icon name="plus" /> Szene</button>
        <button disabled={!sel.length} onClick={() => newScene(true)} title="Ausgewählte Shots in eine neue Szene legen"><Icon name="folder" /> Szene aus Auswahl</button>
        <div className="tsep" />
        <button className="tb" title="Alle zuklappen" onClick={() => useUi.setState({ collapsed: Object.fromEntries(folders.map((f) => [folderKey(f), true])) })}><Icon name="collapseAll" /></button>
        <button className="tb" title="Alle aufklappen" onClick={() => useUi.setState({ collapsed: {} })}><Icon name="expandAll" /></button>
        <div className="spacer" />
        <span className="muted">
          {total.count} Shots · {fmtTime(total.frames / fps, false)} · B-Roll {total.frames ? Math.round((total.brollFrames / total.frames) * 100) : 0} %
        </span>
      </div>
      <div className="outl-list" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null) }}>
        {folders.map((f) => (
          <Folder key={folderKey(f)} p={p} sceneId={f} flatSel={onSelect} drop={drop} sceneDrop={sceneDrop} playId={playId} hooks={hooks} />
        ))}
      </div>
      <SelectionBar p={p} />
    </div>
  )
}
