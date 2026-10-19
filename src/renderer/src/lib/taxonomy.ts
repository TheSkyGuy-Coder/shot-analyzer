import type { LabelAxis, LabelItem } from '@shared/project'

/**
 * Standard-Label-Set. Beim Anlegen eines Projekts wird eine KOPIE in die Projektdatei geschrieben,
 * damit eine weitergegebene Analyse immer ihre eigenen Label-Definitionen mitbringt.
 * Ein Label-Editor (eigene Sets, Icons) kann diese Struktur später direkt bearbeiten.
 */
export const DEFAULT_TAXONOMY: LabelAxis[] = [
  {
    id: 'size', title: 'Einstellungsgröße', mode: 'single',
    items: [
      { id: 'ecu', label: 'Detail', en: 'ECU', color: '#e5484d' },
      { id: 'cu', label: 'Groß', en: 'CU', color: '#f76b15' },
      { id: 'mcu', label: 'Nah', en: 'MCU', color: '#f5a524' },
      { id: 'ms', label: 'Halbnah', en: 'Mid', color: '#46a758' },
      { id: 'mls', label: 'Halbtotale', en: 'MLS', color: '#12a594' },
      { id: 'ws', label: 'Totale', en: 'Wide', color: '#3e63dd' },
      { id: 'ews', label: 'Weit', en: 'EWS', color: '#8e4ec6' }
    ]
  },
  {
    id: 'angle', title: 'Kamerawinkel', mode: 'single',
    items: [
      { id: 'eye', label: 'Augenhöhe' }, { id: 'low', label: 'Untersicht' }, { id: 'high', label: 'Aufsicht' },
      { id: 'bird', label: 'Vogelperspektive' }, { id: 'worm', label: 'Froschperspektive' }, { id: 'dutch', label: 'Dutch Angle' }
    ]
  },
  {
    id: 'move', title: 'Kamerabewegung', mode: 'single',
    items: [
      { id: 'static', label: 'Statisch' }, { id: 'pan', label: 'Schwenk' }, { id: 'tilt', label: 'Neigung' },
      { id: 'dolly', label: 'Fahrt' }, { id: 'hand', label: 'Handheld' }, { id: 'zoom', label: 'Zoom' },
      { id: 'gimbal', label: 'Steadicam/Gimbal' }, { id: 'crane', label: 'Kran/Drohne' }
    ]
  },
  {
    id: 'subject', title: 'Bildinhalt / Besetzung', mode: 'single',
    items: [
      { id: 'single', label: 'Single' }, { id: 'two', label: 'Two-Shot' }, { id: 'group', label: 'Gruppe' },
      { id: 'ots', label: 'Over-the-Shoulder' }, { id: 'pov', label: 'POV' }, { id: 'none', label: 'Ohne Person' }
    ]
  },
  {
    id: 'func', title: 'Funktion im Schnitt', mode: 'multi',
    items: [
      { id: 'establishing', label: 'Establishing' }, { id: 'master', label: 'Master' }, { id: 'insert', label: 'Insert' },
      { id: 'cutaway', label: 'Cutaway' }, { id: 'broll', label: 'B-Roll' }, { id: 'reaction', label: 'Reaction' },
      { id: 'transition', label: 'Übergang' }
    ]
  },
  {
    id: 'light', title: 'Licht', mode: 'multi',
    items: [
      { id: 'highkey', label: 'High-Key' }, { id: 'lowkey', label: 'Low-Key' }, { id: 'hard', label: 'Hart' },
      { id: 'soft', label: 'Weich' }, { id: 'front', label: 'Frontlicht' }, { id: 'side', label: 'Seitenlicht' },
      { id: 'back', label: 'Gegenlicht' }, { id: 'top', label: 'Oberlicht' }, { id: 'silh', label: 'Silhouette' },
      { id: 'natural', label: 'Natürlich' }, { id: 'artificial', label: 'Kunstlicht' },
      { id: 'practical', label: 'Motiviert (Practicals)' }, { id: 'warm', label: 'Warm' }, { id: 'cold', label: 'Kalt' }
    ]
  }
]

export const cloneTaxonomy = (): LabelAxis[] => JSON.parse(JSON.stringify(DEFAULT_TAXONOMY)) as LabelAxis[]

export function itemOf(taxonomy: LabelAxis[], axisId: string, itemId: string): LabelItem | undefined {
  return taxonomy.find((a) => a.id === axisId)?.items.find((i) => i.id === itemId)
}

export function itemText(it: LabelItem): string {
  return it.en ? `${it.label} · ${it.en}` : it.label
}
