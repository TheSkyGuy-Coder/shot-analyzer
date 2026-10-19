/**
 * Plugin-Schnittstelle. Hier hängen später der Licht-Planer, die Szenenansicht, der Planungsmodus usw. ein.
 *
 *   registerPanel({ id, title, component })   -> neuer Reiter in der rechten Leiste
 *   registerOverlay({ id, paint })            -> zeichnet über das Videobild (und ins PNG-Standbild)
 *
 * Plugins lesen/schreiben ihre Daten über useProject (shot.ext[id] bzw. project.ext[id]);
 * sie werden mit der Analyse gespeichert und wieder geladen. Siehe docs/PLUGINS.md.
 */
import type { ComponentType } from 'react'
import type { Project, Shot } from '@shared/project'

export interface PanelPlugin {
  id: string
  title: string
  component: ComponentType
}

export interface OverlayPlugin {
  id: string
  paint(ctx: CanvasRenderingContext2D, w: number, h: number, ctxInfo: { project: Project; shot: Shot; frame: number }): void
}

export const panelRegistry: PanelPlugin[] = []
export const overlayRegistry: OverlayPlugin[] = []

export function registerPanel(p: PanelPlugin): void {
  if (!panelRegistry.some((x) => x.id === p.id)) panelRegistry.push(p)
}

export function registerOverlay(o: OverlayPlugin): void {
  if (!overlayRegistry.some((x) => x.id === o.id)) overlayRegistry.push(o)
}
