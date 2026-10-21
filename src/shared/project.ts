/**
 * Projektdatei-Format (Version 2).
 *
 * Alle Positionen sind FRAMES (ganze Zahlen), keine Sekunden. Dadurch gibt es kein
 * Rundungsproblem beim Verschieben von Schnitten, und Frame-Snapping ist automatisch erfüllt.
 * Ein Shot belegt die Frames [startFrame, endFrame) – endFrame ist exklusiv.
 *
 * Szenen/Locations: `scenes` ist die Ordnerliste des Szenen-Outliners, `shot.sceneId` ordnet einen Shot zu.
 * Die Reihenfolge der Shots innerhalb einer Szene steht in `scene.order` (unabhängig von der Zeit im Video),
 * `shot.setup` ist die frei benennbare Kameraposition.
 * Plugins speichern eigene Daten unter shot.ext[pluginId] bzw. project.ext[pluginId].
 */

export interface LabelItem {
  id: string
  label: string
  /** Englischer Kurzbegriff, z. B. "CU". */
  en?: string
  color?: string
  /** Platz für spätere Icons (Name oder Emoji). */
  icon?: string
}

export interface LabelAxis {
  id: string
  title: string
  mode: 'single' | 'multi'
  items: LabelItem[]
}

export interface PaletteColor {
  hex: string
  share: number
}

export interface Palette {
  colors: PaletteColor[]
  luma: number
  contrast: number
  sat: number
  warm: number
  failed?: boolean
}

export type ShapeType = 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse'

export interface Shape {
  type: ShapeType
  color: string
  /** Strichstärke als Anteil der Bildbreite. */
  w: number
  /** Normalisierte Koordinaten 0..1 relativ zum Bild. */
  pts: [number, number][]
}

export type LabelValue = string | string[]

export interface Shot {
  id: string
  startFrame: number
  endFrame: number
  labels: Record<string, LabelValue>
  note: string
  draw: Shape[]
  palette: Palette | null
  sceneId: string | null
  /** Kameraposition / Setup, z. B. "A" oder "Kamera 2 links". Leer = nicht angegeben. */
  setup?: string
  ext: Record<string, unknown>
}

export interface Scene {
  id: string
  name: string
  location: string
  color?: string
  /** Shot-IDs in der vom Nutzer gewählten Reihenfolge. Fehlende Shots werden chronologisch angehängt. */
  order?: string[]
}

export interface SceneCandidate {
  frame: number
  score: number
}

export interface ProjectVideoRef {
  name: string
  size: number
  duration: number
  fps: number
  frames: number
  width: number
  height: number
}

export interface Project {
  app: 'shot-analyzer'
  version: 2
  video: ProjectVideoRef
  taxonomy: LabelAxis[]
  shots: Shot[]
  scenes: Scene[]
  /** Alle von FFmpeg gefundenen Schnittkandidaten (ab Mindestscore), für den Empfindlichkeits-Regler. */
  candidates: SceneCandidate[]
  strip: { colors: string[] } | null
  ext: Record<string, unknown>
}
