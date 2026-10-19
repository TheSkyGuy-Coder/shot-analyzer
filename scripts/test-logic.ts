/**
 * Prüft die reinen Schnitt-Funktionen (Teilen, Verschieben, Entfernen, Kandidaten, Migration).
 *   npm run test:logic
 */
import { applyCandidates, fitToFrames, migrateV1, moveCut, nearestCut, removeCut, shotIndexAt, splitAt, thresholdForSensitivity, createInitialProject, MIN_FRAMES } from '../src/renderer/src/lib/shots'
import type { VideoInfo } from '../src/shared/types'

let failed = 0
const check = (name: string, ok: boolean, extra = ''): void => {
  console.log(`${ok ? 'OK    ' : 'FEHLER'} ${name} ${extra}`)
  if (!ok) failed++
}
const info: VideoInfo = { key: 'k', path: '/x.mp4', name: 'x.mp4', size: 1, duration: 10, fps: 25, fpsNum: 25, fpsDen: 1, frames: 250, width: 1920, height: 1080, codec: 'h264', hasAudio: true }
const bounds = (p: ReturnType<typeof createInitialProject>): string => p.shots.map((s) => `${s.startFrame}-${s.endFrame}`).join(' ')
const gapless = (p: ReturnType<typeof createInitialProject>): boolean =>
  p.shots[0].startFrame === 0 && p.shots[p.shots.length - 1].endFrame === p.video.frames && p.shots.every((s, i) => i === 0 || s.startFrame === p.shots[i - 1].endFrame)

const p = createInitialProject(info)
check('Start: ein Shot über alle Frames', bounds(p) === '0-250')
check('Teilen bei 100', splitAt(p, 100) && bounds(p) === '0-100 100-250')
check('Teilen direkt neben einem Schnitt wird abgelehnt', !splitAt(p, 101) && !splitAt(p, 99) && bounds(p) === '0-100 100-250')
p.shots[0].labels.size = 'cu'
splitAt(p, 50)
check('Neuer Shot erbt Labels', p.shots[1].labels.size === 'cu')
check('shotIndexAt', shotIndexAt(p.shots, 49) === 0 && shotIndexAt(p.shots, 50) === 1 && shotIndexAt(p.shots, 249) === 2)
check('moveCut verschiebt exakt', moveCut(p, 1, 60.4) === 60 && bounds(p) === '0-60 60-100 100-250')
check('moveCut begrenzt durch Mindestlänge', moveCut(p, 1, 999) === 100 - MIN_FRAMES && moveCut(p, 1, -5) === MIN_FRAMES)
moveCut(p, 1, 60)
check('Lückenlos nach Verschieben', gapless(p))
check('nearestCut: Frame 62 -> Schnitt bei 60', nearestCut(p, 62) === 1)
check('nearestCut: Frame 98 -> Schnitt bei 100', nearestCut(p, 98) === 2)
check('removeCut verbindet Shots', removeCut(p, 1) && bounds(p) === '0-100 100-250' && gapless(p))
check('removeCut am ersten Shot unmöglich', !removeCut(p, 0))

const q = createInitialProject(info)
q.candidates = [{ frame: 50, score: 0.2 }, { frame: 120, score: 0.6 }, { frame: 121, score: 0.5 }, { frame: 200, score: 0.35 }]
check('Empfindlichkeit 6 -> Schwelle 0.30', Math.abs(thresholdForSensitivity(6) - 0.3) < 1e-9)
check('Kandidaten ab Schwelle 0.3 (121 zu nah an 120)', applyCandidates(q, 0.3) === 2 && bounds(q) === '0-120 120-200 200-250', bounds(q))
check('Zweiter Lauf setzt nichts doppelt', applyCandidates(q, 0.3) === 0)
check('Niedrige Schwelle ergänzt weitere', applyCandidates(q, 0.1) === 1 && bounds(q) === '0-50 50-120 120-200 200-250')

const r = createInitialProject(info)
splitAt(r, 100)
fitToFrames(r, 180)
check('fitToFrames kürzt auf neue Länge', bounds(r) === '0-100 100-180' && gapless(r))
fitToFrames(r, 90)
check('fitToFrames entfernt Shots hinter dem Ende', bounds(r) === '0-90' && gapless(r))

const v1 = migrateV1({ app: 'shot-analyzer', version: 1, fps: 25, video: { name: 'a.mp4', size: 5, duration: 10 }, shots: [
  { start: 0, end: 4, labels: { size: 'cu', light: ['lowkey'] }, note: 'n', draw: [], palette: null, ext: {} },
  { start: 4, end: 10, labels: {}, note: '', draw: [], palette: null, ext: {} }] })
check('Prototyp-Datei (Sekunden) wird in Frames migriert', !!v1 && bounds(v1) === '0-100 100-250' && v1.shots[0].labels.size === 'cu' && v1.version === 2)

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlles in Ordnung')
process.exit(failed ? 1 : 0)
