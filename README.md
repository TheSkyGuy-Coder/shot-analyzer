# Shot Analyzer

Lokales Analyse-Werkzeug für die Lehre: Kurzfilme in Shots zerlegen, jeden Shot labeln (Größe, Winkel, Bewegung, Besetzung, Funktion, Licht), die Komposition direkt auf dem Bild markieren, Farben und Shot-Längen auswerten.

**Alles läuft lokal.** Videos werden nirgends hochgeladen, die App braucht kein Internet. Das Originalvideo wird nie verändert.

## Für Studierende: Installation (Windows)

1. Auf GitHub unter **Releases** die Datei `Shot-Analyzer-Setup-x.y.z.exe` herunterladen.
2. Doppelklick. Beim ersten Start zeigt Windows evtl. „Der Computer wurde durch Windows geschützt“, weil die App nicht signiert ist. Dann **„Weitere Informationen“ → „Trotzdem ausführen“**.
3. Video in das Fenster ziehen (oder „Video öffnen“). Beim ersten Öffnen erzeugt die App ein leichtes Vorschau-Video, das dauert je nach Länge einige Sekunden bis Minuten. Danach öffnet dasselbe Video sofort.

Alle Formate aus Premiere und After Effects (ProRes, H.264, H.265, MOV, MXF, …) sind möglich.

Die wichtigsten Tasten stehen in der App unter **F1**.

## Arbeitsablauf

1. **Auto-Schnitte** erkennt harte Schnitte. Die gelben Marken auf der Timeline zeigen schwächere Kandidaten, die noch keine Schnitte sind.
2. Fehlende Schnitte setzen (`C`, Doppelklick), falsche entfernen (`Entf`), Schnitte per Maus ziehen oder mit `Alt`+`←/→` Frame für Frame feinjustieren. Beim Ziehen rastet der Schnitt auf ganze Frames und auf erkannte Kandidaten ein.
3. Shot für Shot labeln. Mit den Zifferntasten `1`–`7` lässt sich die Einstellungsgröße direkt setzen.
4. Zeichnen: Stift, Linie, Pfeil, Rechteck, Ellipse, dazu Drittel-Raster, Goldener Schnitt, Mittelachsen, Diagonalen.
5. Reiter **Farbe** und **Statistik** auswerten.
6. **Analyse speichern** erzeugt eine `.json`-Datei (zum Abgeben oder Teilen). Zwischendurch speichert die App automatisch.
7. Export: einzelner Shot als Clip (bildgenau oder schnell), CSV-Tabelle, Standbild mit Zeichnung in Originalauflösung.

Strg+Z / Strg+Y funktionieren überall: Schnitte, Labels, Zeichnungen, Notizen.

## Für Entwickler

Stack: Electron, electron-vite, React 19, TypeScript, Zustand + Immer, FFmpeg/ffprobe (`ffmpeg-static`, `ffprobe-static`).

```bash
npm install
npm run dev          # Entwicklungsmodus mit Hot Reload
npm run typecheck
npm test             # Logik-Tests und FFmpeg-Tests (ohne Oberfläche)
npm run build        # nur bauen
npm run dist         # Windows-Installer nach release/ (am besten unter Windows bzw. per GitHub Actions)
```

Ein End-to-End-Test der echten App (benötigt Xvfb unter Linux): siehe Kopfkommentar in `scripts/e2e.mjs`.

### Aufbau

```
src/main/        Electron-Hauptprozess: FFmpeg (ffmpeg.ts), IPC (ipc.ts), media://-Protokoll (index.ts)
src/preload/     Brücke zwischen Oberfläche und Hauptprozess (window.api)
src/shared/      Projektformat (project.ts) und Schnittstellen-Typen (types.ts)
src/renderer/    Oberfläche (React)
  src/store/     project.ts (Daten + Undo/Redo), ui.ts (Abspielzustand, Werkzeuge)
  src/lib/       Schnittlogik (shots.ts), Aktionen (actions.ts), Player, Hotkeys, Plugin-Register
  src/components Viewer, Timeline, Transport, Zeichenleiste, Header, Dialoge
  src/panels/    Reiter rechts: Labels, Farbe, Statistik
```

Wie die App funktioniert, in drei Sätzen: Beim Öffnen erzeugt FFmpeg einen **Proxy** (H.264, max. 720p, konstante Bildrate, kurze GOP, im Cache-Ordner der App). Die Oberfläche spielt nur diesen Proxy ab, daher gilt `Frame = Zeit × fps` und Frame-genaues Springen funktioniert zuverlässig. Alle Schnitte, Labels und Zeichnungen sind in **Frames** gespeichert; Exporte rechnen auf das Originalvideo zurück.

### Erweitern (Szenenansicht, Planer, 3D-Licht)

Siehe [docs/PLUGINS.md](docs/PLUGINS.md). Neue Module registrieren Reiter und Overlays und legen ihre Daten pro Shot unter `shot.ext[<id>]` ab. Sie werden automatisch mit der Analyse gespeichert.

### Release veröffentlichen

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions baut daraufhin den Windows-Installer und hängt ihn an ein neues Release (`.github/workflows/release.yml`).

## Lizenzen

Die App selbst steht unter MIT-Lizenz (siehe `LICENSE`). Sie liefert **FFmpeg** als eigenständiges Programm mit (`ffmpeg-static`). Diese FFmpeg-Builds sind mit `--enable-gpl` gebaut und stehen unter der **GPL**; die Lizenztexte und Quellhinweise des Pakets liegen im Installationsordner unter `resources/app.asar.unpacked/node_modules/ffmpeg-static/` (u. a. `ffmpeg.LICENSE`, `ffmpeg.README`). Dasselbe gilt für das mitgelieferte `ffprobe` (`ffprobe-static`, dort ebenfalls Lizenzdateien im Paketordner). Bei der Weitergabe diese Dateien nicht entfernen. Für Lehre und nicht-kommerzielle Weitergabe über GitHub ist das unproblematisch; bei kommerzieller Nutzung vorher die FFmpeg-Lizenzbedingungen prüfen (<https://ffmpeg.org/legal.html>).
