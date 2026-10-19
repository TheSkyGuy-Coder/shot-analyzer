import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import type { Project } from '@shared/project'
import type { VideoInfo } from '@shared/types'

const HISTORY_LIMIT = 300
/** Gleiche Aktionen innerhalb dieser Zeit (z. B. Ziehen eines Schnitts) zählen als ein Undo-Schritt. */
const COALESCE_MS = 900

interface ProjectState {
  video: VideoInfo | null
  proxyPath: string | null
  project: Project | null
  past: Project[]
  future: Project[]
  lastKey: string | null
  lastAt: number
  /** Wird bei jeder Änderung hochgezählt (Autosave, "ungespeichert"-Anzeige). */
  revision: number

  open(video: VideoInfo, proxyPath: string, project: Project): void
  close(): void
  /** Änderung, die rückgängig gemacht werden kann. Mit `key` werden schnelle Wiederholungen zusammengefasst. */
  commit(recipe: (p: Draft<Project>) => void, key?: string): void
  /** Änderung ohne Undo-Schritt (berechnete Daten wie Farbpaletten). */
  patch(recipe: (p: Draft<Project>) => void): void
  undo(): void
  redo(): void
}

export const useProject = create<ProjectState>((set, get) => ({
  video: null,
  proxyPath: null,
  project: null,
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,
  revision: 0,

  open: (video, proxyPath, project) =>
    set({ video, proxyPath, project, past: [], future: [], lastKey: null, lastAt: 0, revision: 0 }),

  close: () => set({ video: null, proxyPath: null, project: null, past: [], future: [], lastKey: null }),

  commit: (recipe, key) => {
    const { project, past, lastKey, lastAt, revision } = get()
    if (!project) return
    const next = produce(project, recipe)
    if (next === project) return
    const now = Date.now()
    const coalesce = key !== undefined && key === lastKey && now - lastAt < COALESCE_MS && past.length > 0
    set({
      project: next,
      past: coalesce ? past : [...past.slice(-(HISTORY_LIMIT - 1)), project],
      future: [],
      lastKey: key ?? null,
      lastAt: now,
      revision: revision + 1
    })
  },

  patch: (recipe) => {
    const { project, revision } = get()
    if (!project) return
    const next = produce(project, recipe)
    if (next !== project) set({ project: next, revision: revision + 1 })
  },

  undo: () => {
    const { project, past, future, revision } = get()
    if (!project || !past.length) return
    set({
      project: past[past.length - 1],
      past: past.slice(0, -1),
      future: [project, ...future],
      lastKey: null,
      revision: revision + 1
    })
  },

  redo: () => {
    const { project, past, future, revision } = get()
    if (!project || !future.length) return
    set({
      project: future[0],
      past: [...past, project],
      future: future.slice(1),
      lastKey: null,
      revision: revision + 1
    })
  }
}))
