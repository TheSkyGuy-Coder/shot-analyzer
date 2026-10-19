import { create } from 'zustand'

export type Tool = 'none' | 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse'

export interface Busy {
  title: string
  fraction: number
  text?: string
  jobId?: string
  /** Wird beim Klick auf "Abbrechen" aufgerufen. */
  onCancel?: () => void
}

export interface Guides {
  third: boolean
  phi: boolean
  center: boolean
  diag: boolean
}

interface UiState {
  /** Aktueller Frame unter dem Abspielkopf. */
  frame: number
  playing: boolean
  volume: number
  muted: boolean
  rate: number
  loopShot: boolean
  tool: Tool
  color: string
  width: number
  guides: Guides
  showDraw: boolean
  tab: string
  /** Empfindlichkeit 1..10 für Schnittkandidaten. */
  sens: number
  busy: Busy | null
  helpOpen: boolean
  toastText: string | null
}

const stored = (k: string, fallback: number): number => {
  try {
    const v = localStorage.getItem(k)
    return v === null ? fallback : Number(v)
  } catch {
    return fallback
  }
}

export const useUi = create<UiState>(() => ({
  frame: 0,
  playing: false,
  volume: stored('sa.volume', 0.8),
  muted: stored('sa.muted', 0) === 1,
  rate: 1,
  loopShot: false,
  tool: 'none',
  color: '#ff3b30',
  width: 3,
  guides: { third: false, phi: false, center: false, diag: false },
  showDraw: true,
  tab: 'labels',
  sens: 6,
  busy: null,
  helpOpen: false,
  toastText: null
}))

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(text: string): void {
  useUi.setState({ toastText: text })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => useUi.setState({ toastText: null }), 3600)
}

export function persistAudio(): void {
  const { volume, muted } = useUi.getState()
  try {
    localStorage.setItem('sa.volume', String(volume))
    localStorage.setItem('sa.muted', muted ? '1' : '0')
  } catch {
    /* ignorieren */
  }
}
