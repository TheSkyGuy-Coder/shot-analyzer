/**
 * End-to-End-Test der echten Electron-App (unter Xvfb):
 *   npm run build && xvfb-run -a node scripts/e2e.mjs <video> <ausgabeordner>
 * Gegen ein gepacktes Programm:  SA_EXE=release/linux-unpacked/shot-analyzer xvfb-run -a node scripts/e2e.mjs ...
 * Dialoge werden im Hauptprozess durch feste Pfade ersetzt.
 */
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, rmSync, statSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const [video, outDir] = [resolve(process.argv[2]), resolve(process.argv[3])]
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
const userData = join(outDir, 'userdata')

let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK    ' : 'FEHLER'} ${name} ${extra}`)
  if (!ok) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  const app = await electron.launch({
    executablePath: process.env.SA_EXE ?? resolve('node_modules/electron/dist/electron'),
    args: [...(process.env.SA_EXE ? [] : ['.']), '--no-sandbox', '--disable-gpu', `--user-data-dir=${userData}`],
    env: { ...process.env, SA_FORCE_CSP: '1' }
  })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {})
  await page.waitForSelector('header')
  return { app, page, errors }
}

async function stubDialogs(app, { open, save }) {
  await app.evaluate(({ dialog }, { open, save }) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [open] })
    let n = 0
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: save[Math.min(n++, save.length - 1)] })
  }, { open, save })
}

const waitIdle = (page, timeout = 180000) =>
  page.waitForFunction(() => !document.querySelector('.modal .bar.big'), null, { timeout })
const headline = async (page) => (await page.locator('.shothead b').first().textContent())?.trim()
const timeText = async (page) => (await page.locator('#time').textContent())?.replace(/\s+/g, ' ')
const frameNow = async (page) => Number(/Frame (\d+)/.exec(await timeText(page))?.[1])

// ------------------------------------------------------------------ Lauf 1
{
  const { app, page, errors } = await launch()
  check('Fenster startet', true)
  await page.screenshot({ path: join(outDir, '01-leer.png') })

  const saves = ['clip.mp4', 'shot.csv', 'shot.png', 'analyse.json'].map((n) => join(outDir, n))
  await stubDialogs(app, { open: video, save: saves })
  await page.getByRole('button', { name: 'Video öffnen' }).first().click()
  await page.waitForSelector('.modal .bar.big', { timeout: 10000 }).catch(() => {})
  const t0 = Date.now()
  await waitIdle(page)
  console.log(`      Vorschau erstellt in ${((Date.now() - t0) / 1000).toFixed(1)} s`)

  await page.waitForFunction(() => document.querySelector('#frame video')?.readyState >= 2, null, { timeout: 15000 }).catch(() => {})
  const info = await page.evaluate(() => {
    const v = document.querySelector('#frame video')
    return { ready: v.readyState, w: v.videoWidth, h: v.videoHeight, dur: v.duration, err: v.error && v.error.message, src: v.src.slice(0, 40) }
  })
  check('Proxy lädt im Player', info.ready >= 2 && !info.err, JSON.stringify(info))
  check('Proxy: 1280x720, ~9 s', info.w === 1280 && info.h === 720 && Math.abs(info.dur - 9.04) < 0.2)
  check('Start: Shot 1 / 1', (await headline(page)) === 'Shot 1 / 1', await headline(page))

  // Frame-Schritte
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await sleep(300)
  check('→ ×3 = Frame 3', (await frameNow(page)) === 3, await timeText(page))
  await page.keyboard.press('ArrowLeft')
  await sleep(200)
  check('← = Frame 2', (await frameNow(page)) === 2)

  // Auto-Schnitte
  await page.getByRole('button', { name: 'Auto-Schnitte' }).click()
  await waitIdle(page)
  await sleep(500)
  check('Auto-Schnitte: 4 Shots', (await headline(page)).endsWith('/ 4'), await headline(page))
  await page.screenshot({ path: join(outDir, '02-nach-auto.png') })

  // Shot-Navigation und Cut-Nudge mit Undo
  await page.keyboard.press('ArrowDown')
  await sleep(300)
  const cutFrame = await frameNow(page)
  check('↓ springt auf Schnitt ~50', Math.abs(cutFrame - 50) <= 2, `Frame ${cutFrame}`)
  await page.keyboard.press('Alt+ArrowRight')
  await sleep(250)
  await page.keyboard.press('Alt+ArrowRight')
  await sleep(250)
  const moved = await frameNow(page)
  check('Alt+→ ×2 verschiebt Schnitt um 2 Frames', moved === cutFrame + 2, `${cutFrame} -> ${moved}`)
  check('Alt+Shift+← verschiebt um 5', await (async () => {
    await page.keyboard.press('Alt+Shift+ArrowLeft'); await sleep(250); return (await frameNow(page)) === moved - 5
  })())
  await page.keyboard.press('Control+z')
  await sleep(250)
  const afterUndo = await page.evaluate(() => document.querySelector('.shothead span')?.textContent)
  console.log(`      nach Strg+Z: ${afterUndo}`)
  await page.keyboard.press('Control+y')
  await sleep(250)

  // Label per Zifferntaste, Undo
  await page.keyboard.press('3')
  await sleep(200)
  check('Taste 3 setzt „Nah“', await page.locator('.chip.on', { hasText: 'Nah' }).count() === 1)
  await page.keyboard.press('Control+z')
  await sleep(200)
  check('Strg+Z nimmt Label zurück', await page.locator('.chip.on', { hasText: 'Nah' }).count() === 0)
  await page.keyboard.press('Control+Shift+z')
  await sleep(200)
  check('Strg+Shift+Z stellt Label wieder her', await page.locator('.chip.on', { hasText: 'Nah' }).count() === 1)
  await page.locator('.chip', { hasText: 'Handheld' }).click()
  await page.locator('.chip', { hasText: 'Low-Key' }).click()
  await page.locator('.chip', { hasText: 'Weich' }).click()
  await page.locator('textarea').fill('Test-Notiz zum Shot')
  await page.keyboard.press('Escape')

  // Manueller Schnitt
  await page.keyboard.press('ArrowDown')
  await sleep(300)
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight')
  await sleep(300)
  await page.keyboard.press('c')
  await sleep(300)
  check('C setzt Schnitt: 5 Shots', (await headline(page)).endsWith('/ 5'), await headline(page))
  await page.keyboard.press('Delete')
  await sleep(300)
  check('Entf entfernt Schnitt: 4 Shots', (await headline(page)).endsWith('/ 4'), await headline(page))

  // Timeline-Mausinteraktion: Doppelklick setzt Schnitt, Ziehen verschiebt ihn
  const tl = page.locator('#tl')
  const box = await tl.boundingBox()
  await page.mouse.dblclick(box.x + box.width * 0.3, box.y + 45)
  await sleep(400)
  check('Doppelklick Timeline setzt Schnitt', (await headline(page)).endsWith('/ 5'), await headline(page))
  await page.screenshot({ path: join(outDir, '03-timeline.png') })

  // Zeichnen
  await page.keyboard.press('p')
  const fb = await page.locator('#draw').boundingBox()
  await page.mouse.move(fb.x + fb.width * 0.3, fb.y + fb.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(fb.x + fb.width * 0.5, fb.y + fb.height * 0.6, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.press('a')
  await page.mouse.move(fb.x + fb.width * 0.6, fb.y + fb.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(fb.x + fb.width * 0.8, fb.y + fb.height * 0.4, { steps: 4 })
  await page.mouse.up()
  await page.keyboard.press('g')
  await sleep(300)
  const nonEmpty = await page.evaluate(() => {
    const c = document.querySelector('#draw')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
    return n
  })
  check('Zeichnung und Raster sichtbar', nonEmpty > 500, `${nonEmpty} Pixel`)
  await page.screenshot({ path: join(outDir, '04-zeichnen.png') })

  // Ton
  await page.keyboard.press('Escape')
  const aud = await page.evaluate(async () => {
    const v = document.querySelector('#frame video')
    v.currentTime = 0.2
    v.muted = false
    await v.play()
    await new Promise((r) => setTimeout(r, 1200))
    const bytes = v.webkitAudioDecodedByteCount
    v.pause()
    return { bytes, muted: v.muted, vol: v.volume }
  })
  check('Audio wird dekodiert', aud.bytes > 10000, JSON.stringify(aud))
  await page.keyboard.press('m')
  await sleep(200)
  check('M schaltet Ton aus', await page.evaluate(() => document.querySelector('#frame video').muted))
  await page.keyboard.press('m')

  // Farbe + Statistik
  await page.getByRole('button', { name: 'Farbe' }).click()
  await page.waitForSelector('.swatches', { timeout: 15000 })
  check('Farbpalette wird berechnet', await page.locator('.sw').count() >= 3, `${await page.locator('.sw').count()} Farben`)
  await page.getByRole('button', { name: 'Farbanalyse für ganzen Film' }).click()
  await page.waitForSelector('.modal .bar.big', { timeout: 5000 }).catch(() => {})
  await waitIdle(page, 120000)
  await sleep(400)
  await page.screenshot({ path: join(outDir, '05-farbe.png') })
  await page.getByRole('button', { name: 'Statistik' }).click()
  await sleep(300)
  check('Statistik zeigt Shots', /Shots/.test(await page.locator('#panels').textContent()))
  await page.screenshot({ path: join(outDir, '06-statistik.png') })
  await page.getByRole('button', { name: 'Labels' }).click()

  // Exporte
  await page.getByRole('button', { name: 'Als Clip speichern' }).click()
  await waitIdle(page, 60000)
  await sleep(500)
  check('Clip-Export erzeugt Datei', existsSync(saves[0]) && statSync(saves[0]).size > 2000)
  if (existsSync(saves[0])) {
    const d = execFileSync('node_modules/ffprobe-static/bin/linux/x64/ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', saves[0]]).toString().trim()
    console.log(`      Clip-Länge ${d} s`)
  }
  await page.getByRole('button', { name: 'CSV' }).click()
  await sleep(800)
  check('CSV exportiert', existsSync(saves[1]))
  if (existsSync(saves[1])) console.log(readFileSync(saves[1], 'utf8').split('\n').slice(0, 3).join('\n').slice(0, 400))
  await page.getByRole('button', { name: 'Standbild PNG' }).click()
  await sleep(2500)
  check('PNG exportiert', existsSync(saves[2]) && statSync(saves[2]).size > 5000)
  await page.getByRole('button', { name: 'Analyse speichern' }).click()
  await sleep(800)
  check('Analyse-JSON gespeichert', existsSync(saves[3]))

  // Hilfe
  await page.keyboard.press('F1')
  await sleep(500)
  check('F1 öffnet Hilfe', await page.locator('.card.wide').count() === 1)
  await page.screenshot({ path: join(outDir, '07-hilfe.png') })
  await page.keyboard.press('Escape')

  await sleep(1500) // Autosave abwarten
  const shotsBefore = await headline(page)
  console.log('      Fehler in Lauf 1:', errors.length ? errors.join(' | ') : 'keine')
  check('keine Konsolenfehler (Lauf 1)', errors.length === 0)
  await app.close()
  globalThis.__shotsBefore = shotsBefore
}

// ------------------------------------------------------------------ Lauf 2: Autosave + Proxy-Cache
{
  const { app, page, errors } = await launch()
  await stubDialogs(app, { open: video, save: [join(outDir, 'x')] })
  await page.getByRole('button', { name: 'Video öffnen' }).first().click()
  const t0 = Date.now()
  await page.waitForSelector('.shothead b', { timeout: 60000 })
  console.log(`      Wieder geöffnet in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  check('Autosave stellt Analyse wieder her', (await headline(page)) === globalThis.__shotsBefore, `${await headline(page)} (vorher ${globalThis.__shotsBefore})`)
  await page.getByRole('button', { name: 'Labels' }).click()
  const hasLabel = await page.evaluate(() => [...document.querySelectorAll('.chip.on')].map((c) => c.textContent))
  console.log('      Labels des aktuellen Shots:', hasLabel.join(', '))
  check('keine Konsolenfehler (Lauf 2)', errors.length === 0, errors.join(' | '))
  await app.close()
}

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlles in Ordnung')
process.exit(failed ? 1 : 0)
