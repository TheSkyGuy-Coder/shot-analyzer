# Module und Plugins

Neue Funktionen (Szenenansicht, Planungsmodus, 2D/3D-Licht-Planer, eigene Label-Editoren) sollen den Kern nicht verändern müssen. Dafür gibt es zwei Einstiegspunkte in `src/renderer/src/lib/plugins.ts`.

## Reiter in der rechten Leiste

```tsx
// src/renderer/src/panels/LightPlanner.tsx
import { registerPanel } from '@/lib/plugins'
import { useProject } from '@/store/project'
import { useUi } from '@/store/ui'
import { shotIndexAt } from '@/lib/shots'

function LightPlanner(): React.JSX.Element {
  const project = useProject((s) => s.project)
  const idx = useUi((s) => (useProject.getState().project ? shotIndexAt(useProject.getState().project!.shots, s.frame) : 0))
  if (!project) return <p className="muted">Öffne ein Video.</p>
  const shot = project.shots[idx]
  const plan = (shot.ext['lightplanner'] as { lights: unknown[] } | undefined) ?? { lights: [] }

  return (
    <button onClick={() =>
      useProject.getState().commit((p) => {
        p.shots[idx].ext['lightplanner'] = { lights: [...plan.lights, { x: 0, y: 0 }] }
      })
    }>
      Licht hinzufügen ({plan.lights.length})
    </button>
  )
}

registerPanel({ id: 'lightplanner', title: 'Licht', component: LightPlanner })
```

Danach in `src/renderer/src/panels/index.ts` importieren (`import './LightPlanner'`). Der Reiter erscheint automatisch.

## Zeichnen über das Videobild

```ts
import { registerOverlay } from '@/lib/plugins'

registerOverlay({
  id: 'lightplanner-overlay',
  paint(ctx, w, h, { shot }) {
    // ctx ist die Zeichenfläche über dem Video, w/h die Größe. Hier z. B. Lichtrichtung als Pfeil.
  }
})
```

Overlays werden auch ins exportierte Standbild (PNG) gezeichnet, in Originalauflösung.

## Daten speichern

- Pro Shot: `shot.ext['<id>']`, pro Film: `project.ext['<id>']`. Beliebiges JSON.
- Immer über `useProject.getState().commit(draft => { … })` ändern. Das ergibt Undo/Redo und Autosave ohne weiteren Aufwand. Für schnelle Wiederholungen (Ziehen) einen Schlüssel mitgeben: `commit(fn, 'drag:' + id)`, dann zählt es als ein Undo-Schritt.
- Für berechnete Daten, die nicht rückgängig gemacht werden sollen: `useProject.getState().patch(…)`.

## Wichtige Bausteine

| Was | Wo |
| --- | --- |
| Projektdaten (Frames, Shots, Szenen, Taxonomie) | `src/shared/project.ts` |
| Aktueller Frame, Wiedergabe, Werkzeuge | `useUi` in `src/renderer/src/store/ui.ts` |
| Springen, Abspielen | `seekFrame`, `gotoShot`, `togglePlay` in `lib/player.ts` |
| Schnitte setzen/verschieben | `splitAt`, `moveCut`, `removeCut` in `lib/shots.ts` |
| Dialoge, Dateien, FFmpeg | `window.api` (`src/shared/types.ts`), umgesetzt in `src/main/ipc.ts` |

## Für den 3D-Planer (Ausblick)

- `three` und `@react-three/fiber` als Abhängigkeiten ergänzen, den 3D-Raum als eigenen Reiter oder eigene Ansicht registrieren.
- Der Plan pro Shot (Subjekt, Kamera, Lichter, Reflektoren) liegt unter `shot.ext['setplan']`. Die 2D-Plan-Ansicht ist eine reine Projektion davon und braucht keine eigenen Daten.
- Szenen (`project.scenes`, `shot.sceneId`) sind im Datenmodell bereits angelegt; ein Raum kann einer Szene zugeordnet werden und für alle ihre Shots gelten.
