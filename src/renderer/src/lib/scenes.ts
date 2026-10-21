/**
 * Szenen-Outliner: reine Funktionen auf dem Projektmodell (wie shots.ts, für den Immer-Draft gedacht).
 *
 * Idee: `project.shots` bleibt IMMER chronologisch (die Timeline hängt davon ab). Die Sortierung im Outliner
 * ist eine zweite Sicht darauf: pro Szene `scene.order`, dazu die optionale Kameraposition `shot.setup`.
 */
import type { LabelAxis, Project, Scene, Shot } from '@shared/project'
import { uid } from './time'

export const SCENE_COLORS = ['#3e63dd', '#46a758', '#f5a524', '#e5484d', '#8e4ec6', '#12a594', '#f76b15', '#d6409f']

export type GroupBy = 'manual' | 'setup' | string // string = Achsen-ID aus der Taxonomie

export interface Group {
  /** null = "Ohne Angabe". */
  key: string | null
  label: string
  color?: string
  shots: Shot[]
}

export interface SceneStats {
  count: number
  frames: number
  brollFrames: number
  /** Frames pro Einstellungsgröße (Item-ID). */
  bySize: Record<string, number>
  setups: number
}

const sceneIdOf = (p: Project, s: Shot): string | null => (s.sceneId && p.scenes.some((x) => x.id === s.sceneId) ? s.sceneId : null)

/** Shots einer Szene in Anzeigereihenfolge. `null` = nicht zugeordnete Shots (chronologisch). */
export function sceneShots(p: Project, sceneId: string | null): Shot[] {
  const inScene = p.shots.filter((s) => sceneIdOf(p, s) === sceneId)
  const scene = sceneId ? p.scenes.find((x) => x.id === sceneId) : undefined
  if (!scene?.order?.length) return inScene
  const byId = new Map(inScene.map((s) => [s.id, s]))
  const out: Shot[] = []
  const seen = new Set<string>()
  for (const id of scene.order) {
    const s = byId.get(id)
    if (s && !seen.has(id)) {
      out.push(s)
      seen.add(id)
    }
  }
  for (const s of inScene) if (!seen.has(s.id)) out.push(s)
  return out
}

export function addScene(p: Project, name?: string): string {
  const id = uid()
  p.scenes.push({
    id,
    name: name?.trim() || `Szene ${p.scenes.length + 1}`,
    location: '',
    color: SCENE_COLORS[p.scenes.length % SCENE_COLORS.length]
  })
  return id
}

export function renameScene(p: Project, id: string, name: string): void {
  const sc = p.scenes.find((x) => x.id === id)
  if (sc && name.trim()) sc.name = name.trim()
}

export function updateScene(p: Project, id: string, patch: Partial<Pick<Scene, 'location' | 'color'>>): void {
  const sc = p.scenes.find((x) => x.id === id)
  if (sc) Object.assign(sc, patch)
}

/** Löscht die Szene, ihre Shots werden "nicht zugeordnet". */
export function deleteScene(p: Project, id: string): void {
  for (const s of p.shots) if (s.sceneId === id) s.sceneId = null
  p.scenes = p.scenes.filter((x) => x.id !== id)
}

/** Verschiebt Szene `id` vor/hinter die Szene `anchorId`. */
export function moveScene(p: Project, id: string, anchorId: string, after: boolean): void {
  if (id === anchorId) return
  const from = p.scenes.findIndex((x) => x.id === id)
  if (from < 0 || !p.scenes.some((x) => x.id === anchorId)) return
  const [sc] = p.scenes.splice(from, 1)
  const at = p.scenes.findIndex((x) => x.id === anchorId)
  p.scenes.splice(at + (after ? 1 : 0), 0, sc)
}

export interface Anchor {
  id: string
  after: boolean
}

/**
 * Verschiebt Shots in eine Szene (`null` = nicht zugeordnet). Mit `anchor` landen sie vor/hinter diesem Shot,
 * sonst am Ende der Szene. Die übergebene ID-Reihenfolge bleibt erhalten. Gibt die Anzahl bewegter Shots zurück.
 */
export function moveShots(p: Project, ids: string[], target: string | null, anchor?: Anchor | null): number {
  const set = new Set(ids)
  const moving = ids.map((id) => p.shots.find((s) => s.id === id)).filter((s): s is Shot => !!s)
  if (!moving.length) return 0
  if (target && !p.scenes.some((x) => x.id === target)) return 0
  // Reihenfolgen aller Szenen vor der Änderung festschreiben (ohne die bewegten Shots).
  const orders = new Map<string, string[]>()
  for (const sc of p.scenes) orders.set(sc.id, sceneShots(p, sc.id).filter((s) => !set.has(s.id)).map((s) => s.id))
  for (const s of moving) s.sceneId = target
  for (const sc of p.scenes) sc.order = orders.get(sc.id)
  if (target) {
    const sc = p.scenes.find((x) => x.id === target) as Scene
    const list = sc.order as string[]
    let at = list.length
    if (anchor && !set.has(anchor.id)) {
      const i = list.indexOf(anchor.id)
      if (i >= 0) at = i + (anchor.after ? 1 : 0)
    }
    list.splice(at, 0, ...moving.map((s) => s.id))
  }
  return moving.length
}

/** Ordnet die Shots der Szene wieder nach der Zeit im Video. */
export function sortSceneChronological(p: Project, id: string): void {
  const sc = p.scenes.find((x) => x.id === id)
  if (sc) sc.order = p.shots.filter((s) => sceneIdOf(p, s) === id).map((s) => s.id)
}

export function setSetup(p: Project, ids: string[], name: string): void {
  const v = name.trim()
  for (const s of p.shots) {
    if (!ids.includes(s.id)) continue
    if (v) s.setup = v
    else delete s.setup
  }
}

/** Alle vorkommenden Kamerapositionen, natürlich sortiert (A, B, Kamera 2, Kamera 10). */
export function allSetups(p: Project, sceneId?: string | null): string[] {
  const set = new Set<string>()
  for (const s of p.shots) if (s.setup && (sceneId === undefined || sceneIdOf(p, s) === sceneId)) set.add(s.setup)
  return [...set].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
}

/** Wert eines Shots für die Gruppierung (Item-ID bzw. Kameraposition), null = ohne Angabe. */
export function groupKeyOf(p: Project, s: Shot, by: GroupBy): string | null {
  if (by === 'manual') return null
  if (by === 'setup') return s.setup || null
  const ax = p.taxonomy.find((a) => a.id === by)
  const v = s.labels[by]
  if (!ax || v === undefined) return null
  if (!Array.isArray(v)) return v || null
  // Mehrfachauswahl: das in der Taxonomie zuerst stehende Label bestimmt die Gruppe.
  return ax.items.find((i) => v.includes(i.id))?.id ?? null
}

export function groupShots(p: Project, shots: Shot[], by: GroupBy): Group[] {
  if (by === 'manual') return [{ key: null, label: '', shots }]
  const groups: Group[] = []
  if (by === 'setup') {
    for (const name of allSetups(p)) groups.push({ key: name, label: name, shots: [] })
  } else {
    const ax = p.taxonomy.find((a) => a.id === by)
    if (!ax) return [{ key: null, label: '', shots }]
    for (const it of ax.items) groups.push({ key: it.id, label: it.en ? `${it.label} · ${it.en}` : it.label, color: it.color, shots: [] })
  }
  const none: Group = { key: null, label: by === 'setup' ? 'Ohne Kameraposition' : 'Ohne Angabe', shots: [] }
  for (const s of shots) (groups.find((g) => g.key !== null && g.key === groupKeyOf(p, s, by)) ?? none).shots.push(s)
  return [...groups, none]
}

/** Setzt für die Shots den Gruppenwert (Drag and Drop in eine Gruppe). */
export function assignGroup(p: Project, ids: string[], by: GroupBy, key: string | null): void {
  if (by === 'manual') return
  if (by === 'setup') return setSetup(p, ids, key ?? '')
  const ax: LabelAxis | undefined = p.taxonomy.find((a) => a.id === by)
  if (!ax) return
  for (const s of p.shots) {
    if (!ids.includes(s.id)) continue
    if (ax.mode === 'single') {
      if (key) s.labels[by] = key
      else delete s.labels[by]
    } else {
      const cur = Array.isArray(s.labels[by]) ? (s.labels[by] as string[]) : []
      const old = ax.items.find((i) => cur.includes(i.id))?.id
      const next = cur.filter((x) => x !== old)
      if (key && !next.includes(key)) next.push(key)
      if (next.length) s.labels[by] = next
      else delete s.labels[by]
    }
  }
}

/** Kennzahlen einer Szene (`null` = nicht zugeordnet, `undefined` = ganzes Projekt). */
export function sceneStats(p: Project, sceneId: string | null | undefined): SceneStats {
  const shots = sceneId === undefined ? p.shots : sceneShots(p, sceneId)
  const st: SceneStats = { count: shots.length, frames: 0, brollFrames: 0, bySize: {}, setups: 0 }
  const setups = new Set<string>()
  for (const s of shots) {
    const len = s.endFrame - s.startFrame
    st.frames += len
    const func = s.labels.func
    if (Array.isArray(func) ? func.includes('broll') : func === 'broll') st.brollFrames += len
    const size = s.labels.size
    if (typeof size === 'string' && size) st.bySize[size] = (st.bySize[size] ?? 0) + len
    if (s.setup) setups.add(s.setup)
  }
  st.setups = setups.size
  return st
}
