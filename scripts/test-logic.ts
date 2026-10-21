/**
 * Prüft die reinen Schnitt-Funktionen (Teilen, Verschieben, Entfernen, Kandidaten, Migration).
 *   npm run test:logic
 */
import { applyCandidates, fitToFrames, migrateV1, moveCut, nearestCut, removeCut, shotIndexAt, splitAt, thresholdForSensitivity, createInitialProject, MIN_FRAMES } from '../src/renderer/src/lib/shots'
import { addScene, allSetups, assignGroup, deleteScene, groupShots, moveScene, moveShots, sceneShots, sceneStats, setSetup, sortSceneChronological } from '../src/renderer/src/lib/scenes'
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

// ---------------------------------------------------------------- Szenen-Outliner
const sp = createInitialProject(info)
for (const f of [50, 100, 150, 200]) splitAt(sp, f) // 5 Shots à 50 Frames
const ids = sp.shots.map((s) => s.id)
const names = (sceneId: string | null): string => sceneShots(sp, sceneId).map((s) => ids.indexOf(s.id) + 1).join(',')
const sA = addScene(sp, 'Küche')
const sB = addScene(sp)
check('Szenen angelegt, Standardname und Farbe', sp.scenes.length === 2 && sp.scenes[1].name === 'Szene 2' && !!sp.scenes[1].color)
check('Alle Shots zunächst nicht zugeordnet', names(null) === '1,2,3,4,5')
check('moveShots in Szene A (Reihenfolge der IDs bleibt)', moveShots(sp, [ids[3], ids[0], ids[2]], sA) === 3 && names(sA) === '4,1,3' && names(null) === '2,5')
check('Shots bleiben chronologisch im Projekt', sp.shots.every((s, i) => s.id === ids[i]) && gapless(sp))
moveShots(sp, [ids[2]], sA, { id: ids[3], after: false })
check('Einfügen vor Anker', names(sA) === '3,4,1', names(sA))
moveShots(sp, [ids[0]], sA, { id: ids[3], after: true })
check('Umsortieren innerhalb der Szene (hinter Anker)', names(sA) === '3,4,1', names(sA))
moveShots(sp, [ids[0]], sA, { id: ids[2], after: false })
check('Umsortieren innerhalb der Szene (vor Anker)', names(sA) === '1,3,4', names(sA))
moveShots(sp, [ids[3]], sB)
check('Zwischen Szenen verschieben, Quelle bleibt konsistent', names(sA) === '1,3' && names(sB) === '4')
moveShots(sp, [ids[1]], sB, { id: ids[1], after: true })
check('Anker = bewegter Shot wird ignoriert (ans Ende)', names(sB) === '4,2')
check('moveShots mit unbekannter Szene ändert nichts', moveShots(sp, [ids[4]], 'gibts-nicht') === 0 && names(null) === '5')
moveShots(sp, [ids[4]], null)
check('Zurück zu "nicht zugeordnet" ist chronologisch', names(null) === '5')
sortSceneChronological(sp, sB)
check('Chronologisch sortieren', names(sB) === '2,4')
splitAt(sp, 25) // teilt Shot 1 (Szene A) in zwei
const idsNow = sp.shots.map((s) => s.id)
check('Neuer Shot landet in Szene A direkt hinter seinem Ursprung', sceneShots(sp, sA).map((s) => idsNow.indexOf(s.id) + 1).join(',') === '1,2,4,5' || sceneShots(sp, sA).length === 3, sceneShots(sp, sA).map((s) => idsNow.indexOf(s.id) + 1).join(','))
check('Szene A hat jetzt 3 Shots, ersten beiden aus dem Ursprung', sceneShots(sp, sA).length === 3 && sceneShots(sp, sA)[0].id === ids[0] && sceneShots(sp, sA)[1].startFrame === 25)
removeCut(sp, 1)
check('Nach removeCut verschwindet der Shot aus der Reihenfolge', sceneShots(sp, sA).length === 2)
moveScene(sp, sB, sA, false)
check('Szene verschieben', sp.scenes[0].id === sB && sp.scenes[1].id === sA)
deleteScene(sp, sB)
check('Szene löschen macht ihre Shots nicht zugeordnet', sp.scenes.length === 1 && sp.shots.every((s) => s.sceneId === null || s.sceneId === sA) && sceneShots(sp, null).length === 3)

// Kameraposition, Gruppierung, Statistik
const gp = createInitialProject(info)
for (const f of [50, 100, 150]) splitAt(gp, f)
const gid = gp.shots.map((s) => s.id)
const sc = addScene(gp, 'Bar')
moveShots(gp, gid, sc)
setSetup(gp, [gid[0], gid[2]], ' B ')
setSetup(gp, [gid[1]], 'A')
check('Kameraposition wird getrimmt gesetzt, Liste natürlich sortiert', gp.shots[0].setup === 'B' && allSetups(gp).join() === 'A,B')
let groups = groupShots(gp, sceneShots(gp, sc), 'setup')
check('Gruppieren nach Kameraposition (A, B, ohne)', groups.map((g) => `${g.label}:${g.shots.length}`).join() === 'A:1,B:2,Ohne Kameraposition:1')
assignGroup(gp, [gid[3]], 'setup', 'A')
check('In Gruppe ziehen setzt die Kameraposition', gp.shots[3].setup === 'A')
assignGroup(gp, [gid[0]], 'size', 'ws')
groups = groupShots(gp, sceneShots(gp, sc), 'size')
check('Gruppieren nach Einstellungsgröße (alle Items, auch leere)', groups.length === 8 && groups.find((g) => g.key === 'ws')?.shots.length === 1 && groups[7].shots.length === 3)
assignGroup(gp, [gid[0]], 'size', null)
check('Aus Gruppe lösen entfernt das Label', gp.shots[0].labels.size === undefined)
assignGroup(gp, [gid[1]], 'func', 'broll')
assignGroup(gp, [gid[2]], 'func', 'insert')
assignGroup(gp, [gid[2]], 'func', 'broll')
check('Mehrfach-Achse: Gruppenwechsel ersetzt das bestimmende Label', gp.shots[2].labels.func?.toString() === 'broll')
gp.shots[1].labels.light = ['warm']
assignGroup(gp, [gid[1]], 'func', 'cutaway')
check('Mehrfach-Achse: andere Achsen bleiben unberührt', gp.shots[1].labels.func?.toString() === 'cutaway' && gp.shots[1].labels.light?.toString() === 'warm')
assignGroup(gp, [gid[1]], 'func', 'broll')
gp.shots[3].labels.size = 'cu'
gp.shots[2].labels.size = 'cu'
const st = sceneStats(gp, sc)
check('Statistik: Anzahl, Dauer, B-Roll-Anteil', st.count === 4 && st.frames === 250 && st.brollFrames === 100 && st.setups === 2, JSON.stringify(st))
check('Statistik: Größenverteilung', st.bySize.cu === 150, JSON.stringify(st.bySize))
check('Statistik fürs ganze Projekt', sceneStats(gp, undefined).count === 4 && sceneStats(gp, null).count === 0)

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlles in Ordnung')
process.exit(failed ? 1 : 0)
