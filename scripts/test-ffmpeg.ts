/**
 * Prüft die FFmpeg-Schicht ohne Electron:
 * erzeugt ein Testvideo mit bekannten Schnitten und lässt Probe, Proxy, Schnitterkennung,
 * Clip-Export und Frame-Extraktion darüber laufen.
 *   npm run test:ffmpeg
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectScenes, exportClip, extractFrame, FFMPEG_PATH, ffmpegVersion, makeProxy, probeFile } from '../src/main/ffmpeg'
import type { VideoInfo } from '../src/shared/types'

const dir = mkdtempSync(join(tmpdir(), 'sa-test-'))
const src = join(dir, 'source.mp4')
// Drei bekannte Schnitte bei 2.0 s, 4.5 s und 7.0 s (25 fps) -> Frames 50, 112/113, 175.
execFileSync(FFMPEG_PATH, [
  '-y', '-loglevel', 'error',
  '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=25:d=2',
  '-f', 'lavfi', '-i', 'mandelbrot=s=1280x720:r=25',
  '-f', 'lavfi', '-i', 'smptebars=s=1280x720:r=25:d=2.5',
  '-f', 'lavfi', '-i', 'color=c=0x224466:s=1280x720:r=25:d=2',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=9.5',
  '-filter_complex', '[1:v]trim=duration=2.5,setpts=PTS-STARTPTS[a];[0:v][a][2:v][3:v]concat=n=4:v=1:a=0[v]',
  '-map', '[v]', '-map', '4:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src
])

let failed = 0
const check = (name: string, ok: boolean, extra = ''): void => {
  console.log(`${ok ? 'OK    ' : 'FEHLER'} ${name} ${extra}`)
  if (!ok) failed++
}

async function main(): Promise<void> {
  console.log('FFmpeg:', await ffmpegVersion())
  const p = await probeFile(src)
  check('probe: fps ~25', Math.abs(p.fps - 25) < 0.01, `(${p.fps})`)
  check('probe: Audio erkannt', p.hasAudio)
  check('probe: 1280x720', p.width === 1280 && p.height === 720)

  const info: VideoInfo = { ...p, key: 'testkey', path: src, name: 'source.mp4', size: statSync(src).size }
  let last = 0
  const proxy = await makeProxy(info, join(dir, 'proxies'), 'job-proxy', (f) => (last = f))
  check('proxy: erzeugt', statSync(proxy.proxyPath).size > 1000, `(${proxy.frames} Frames)`)
  check('proxy: Fortschritt gemeldet', last > 0.5, `(${last.toFixed(2)})`)
  const pp = await probeFile(proxy.proxyPath)
  check('proxy: 720p, Audio vorhanden', pp.height === 720 && pp.hasAudio)
  const again = await makeProxy(info, join(dir, 'proxies'), 'job-proxy2', () => {})
  check('proxy: Cache wird wiederverwendet', again.reused)

  const cands = await detectScenes(proxy.proxyPath, info.fps, 0.08, 'job-scene', proxy.duration, () => {})
  console.log('Kandidaten:', JSON.stringify(cands))
  const strong = cands.filter((c) => c.score >= 0.3).map((c) => c.frame)
  for (const expected of [50, 112, 175]) {
    check(`Schnitt bei Frame ~${expected} gefunden`, strong.some((f) => Math.abs(f - expected) <= 2), `(gefunden: ${strong.join(', ')})`)
  }
  check('keine überzähligen starken Schnitte', strong.length === 3, `(${strong.length})`)

  const clip = join(dir, 'clip.mp4')
  await exportClip(src, clip, 2.0 - 0.25 / 25, 2.5, 'exact', 'job-clip', () => {})
  const cp = await probeFile(clip)
  check('Clip-Export: ~2.5 s', Math.abs(cp.duration - 2.5) < 0.15, `(${cp.duration.toFixed(2)} s)`)

  const png = await extractFrame(src, 3.0)
  writeFileSync(join(dir, 'frame.png'), Buffer.from(png, 'base64'))
  check('Frame-Extraktion: PNG', Buffer.from(png, 'base64').subarray(1, 4).toString() === 'PNG')

  // Abbruch muss sauber als Fehler "cancelled" ankommen.
  const { cancelJob } = await import('../src/main/ffmpeg')
  const slow = makeProxy({ ...info, key: 'cancelme' }, join(dir, 'proxies'), 'job-cancel', () => {})
  setTimeout(() => cancelJob('job-cancel'), 150)
  let cancelledOk = false
  try { await slow } catch (e) { cancelledOk = (e as Error).message === 'cancelled' }
  check('Abbrechen funktioniert', cancelledOk)

  console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlles in Ordnung')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
