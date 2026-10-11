#!/usr/bin/env node
// Capture the screenshots used by README.md (docs/screenshots/) and by the VAST
// answer sheets (submission/images/) from a running build of the site.
//
//   node scripts/capture_screenshots.mjs [baseUrl] [--only=docs|submission]
//
// baseUrl defaults to http://127.0.0.1:5174 (the Vite dev server:
// `cd app && npx vite --port 5174 --strictPort --host 127.0.0.1`).
// Desktop shots are 1440×900 at deviceScaleFactor 2; phone shots are 390×844
// at deviceScaleFactor 2. Every PNG is converted to WebP with `cwebp` when it is
// installed (GitHub and Chrome both render WebP); otherwise the PNG is kept.
// Only the mouse cursor and text caret are hidden. Scroll-story steps are
// scrolled to the activation line and given time for the canvas transition.

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'app', 'package.json'))
const { chromium } = require('playwright')

const args = process.argv.slice(2)
const BASE = (args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:5174').replace(/\/+$/, '')
const ONLY = (args.find((a) => a.startsWith('--only=')) ?? '').slice(7)
const DOCS = path.join(ROOT, 'docs', 'screenshots')
const SUB = path.join(ROOT, 'submission', 'images')
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const STEP_WAIT = 2200 // canvas transitions run ~1.2–1.6 s
const QUALITY = 82

let hasCwebp = true
try {
  execFileSync('cwebp', ['-version'], { stdio: 'ignore' })
} catch {
  hasCwebp = false
  console.warn('cwebp not found: keeping PNG files')
}

const saved = []
/** Write a PNG buffer to dir/name.(webp|png); returns the path written. */
function save(buf, dir, name) {
  fs.mkdirSync(dir, { recursive: true })
  const png = path.join(dir, `${name}.png`)
  fs.writeFileSync(png, buf)
  let out = png
  if (hasCwebp) {
    out = path.join(dir, `${name}.webp`)
    execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), '-m', '6', '-sharp_yuv', png, '-o', out])
    fs.rmSync(png)
  }
  const kb = (fs.statSync(out).size / 1024).toFixed(0)
  saved.push(out)
  console.log(`saved ${path.relative(ROOT, out)}  ${kb} KB`)
  return out
}
const wantDocs = ONLY !== 'submission'
const wantSub = ONLY !== 'docs'
const docs = (buf, name) => wantDocs && save(buf, DOCS, name)
const sub = (buf, name) => wantSub && save(buf, SUB, name)

const browser = await chromium.launch({ channel: 'chrome' })
const problems = []

async function open(route, viewport = DESKTOP) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  page.on('pageerror', (e) => problems.push(`${route}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && problems.push(`${route}: ${m.text().slice(0, 200)}`))
  await page.goto(`${BASE}/#/${route}`, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: '*,*::before,*::after{cursor:none!important;caret-color:transparent!important}' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1800)
  return page
}

const shot = (page) => page.screenshot()

/** Put story step i on the activation line (viewport middle on desktop;
    just under the pinned stage on phones and tablets). */
async function gotoStep(page, i) {
  await page.evaluate((i) => {
    const el = document.querySelectorAll('.chapter-story .step')[i]
    const r = el.getBoundingClientRect()
    const y = window.innerWidth <= 960 ? r.top - window.innerHeight * 0.6 : r.top + r.height / 2 - window.innerHeight / 2
    window.scrollTo(0, window.scrollY + y)
  }, i)
}

async function scrollTo(page, selector) {
  await page.evaluate((s) => {
    const el = document.querySelector(s)
    const r = el.getBoundingClientRect()
    window.scrollTo(0, window.scrollY + r.top - Math.max(0, (window.innerHeight - r.height) / 2))
  }, selector)
  await page.waitForTimeout(1200)
}

/** Element screenshot of a figure, placed just below the sticky header. A
    figure taller than the viewport gets a taller viewport for the shot, so
    the header never lands on top of it. */
async function fig(page, locator, wait = 1200) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator
  await el.scrollIntoViewIfNeeded()
  const vp = page.viewportSize()
  const h = (await el.boundingBox()).height
  const header = await page.evaluate(() => document.querySelector('header')?.getBoundingClientRect().height ?? 0)
  const need = Math.ceil(h + header + 48)
  if (need > vp.height) await page.setViewportSize({ width: vp.width, height: need })
  await el.evaluate((node, top) => {
    window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - top)
  }, header + 24)
  await page.waitForTimeout(wait)
  const buf = await el.screenshot()
  if (need > vp.height) {
    await page.setViewportSize(vp)
    await page.waitForTimeout(300)
  }
  return buf
}

async function press(page, figSel, text) {
  await page.locator(`${figSel} button`, { hasText: text }).first().click()
  await page.mouse.move(2, 2)
  await page.waitForTimeout(900)
}

/** Opener, every story step and the closing bridge. */
async function chapter(mc, { midStep, slowSteps = {} } = {}) {
  const page = await open(mc)
  const opener = await shot(page)
  docs(opener, `${mc}-opener`)
  const n = await page.locator('.chapter-story .step').count()
  const steps = []
  for (let i = 0; i < n; i++) {
    await gotoStep(page, i)
    if (i === midStep) {
      await page.waitForTimeout(550)
      docs(await shot(page), `${mc}-step-${i + 1}-mid`)
      await page.waitForTimeout(STEP_WAIT)
    } else {
      await page.waitForTimeout(slowSteps[i] ?? STEP_WAIT)
    }
    const buf = await shot(page)
    steps.push(buf)
    docs(buf, `${mc}-step-${i + 1}`)
  }
  await scrollTo(page, '.bridge')
  docs(await shot(page), `${mc}-bridge`)
  return { page, steps }
}

// ---------- Home ----------
{
  const page = await open('')
  docs(await shot(page), 'home')
  await scrollTo(page, '.route__title')
  docs(await shot(page), 'home-chapters')
  await scrollTo(page, '#code-sheet-h')
  docs(await shot(page), 'home-signal-code')
  await page.close()
}

// ---------- MC1 ----------
{
  const { page, steps } = await chapter('mc1')
  docs(await fig(page, '#fig-weight'), 'mc1-fig-weight')
  docs(await fig(page, '#fig-chain'), 'mc1-fig-chain')
  docs(await fig(page, '#fig-cands'), 'mc1-fig-candidates')
  if (wantSub) {
    sub(steps[1], 'mc1-q1-layer')
    sub(await fig(page, '#fig-weight'), 'mc1-q1-weights')
    for (const [label, name] of [['8327', '8327'], ['979893388', '979893388'], ['Mar de la Vida', 'mardelavida'], ['Oceanfront Oasis', 'oceanfront']]) {
      await page.locator('#fig-ego').scrollIntoViewIfNeeded()
      await press(page, '#fig-ego', label)
      sub(await fig(page, '#fig-ego'), `mc1-q1-ego-${name}`)
    }
    sub(await fig(page, '#fig-pct'), 'mc1-q2-percentiles')
    sub(await fig(page, '#fig-rubric'), 'mc1-q2-rubric')
    sub(await fig(page, '#fig-chain'), 'mc1-q2-chain')
    sub(await fig(page, '#fig-dist'), 'mc1-q2-distance')
    sub(await fig(page, '#fig-cands'), 'mc1-q3-candidates')
    sub(await fig(page, '#fig-loo'), 'mc1-q3-leave-one-out')
    sub(await fig(page, '#fig-abl'), 'mc1-q3-ablation')
    sub(steps[4], 'mc1-q3-loops')
    sub(await fig(page, '#fig-evidence'), 'mc1-q3-evidence-903311212')
    await page.locator('#fig-cands').scrollIntoViewIfNeeded()
    await page.evaluate(() =>
      [...document.querySelectorAll('#fig-cands button.cand')].find((b) => b.innerText.split('\n')[1]?.trim() === '48')?.click(),
    )
    await page.waitForTimeout(900)
    await press(page, '#fig-evidence', 'Trace path to suspect')
    sub(await fig(page, '#fig-evidence'), 'mc1-q3-evidence-48')
  }
  await page.close()
}

// ---------- MC2 ----------
{
  // the lifespans (step 3) and handover (step 4) scenes play over several seconds
  const { page, steps } = await chapter('mc2', { slowSteps: { 2: 6000, 3: 7500 } })
  docs(await fig(page, '#fig-tax'), 'mc2-fig-taxonomy')
  docs(await fig(page, '#fig-score'), 'mc2-fig-scorecard')
  docs(await fig(page, '#fig-handover'), 'mc2-fig-handover')
  if (wantSub) {
    sub(steps[0], 'mc2-q1-currents')
    sub(steps[1], 'mc2-q1-fish')
    sub(steps[2], 'mc2-q1-lifespan')
    sub(await fig(page, '#fig-tax'), 'mc2-q1-taxonomy')
    sub(await fig(page, '#fig-gap'), 'mc2-q1-gap')
    sub(steps[4], 'mc2-q2-bundles')
    sub(await fig(page, '#fig-score'), 'mc2-q2-scorecard')
    sub(await fig(page, '#fig-bundle'), 'mc2-q2-bundle-carp')
    for (const b of ['tuna', 'cod2']) {
      await page.locator('#fig-score').scrollIntoViewIfNeeded()
      await page.evaluate((b) =>
        [...document.querySelectorAll('#fig-score button.mc2-score__row')].find((r) => r.innerText.trim().split(/\s+/)[0] === b)?.click(), b)
      await page.mouse.move(2, 2)
      await page.waitForTimeout(900)
      sub(await fig(page, '#fig-bundle'), `mc2-q2-bundle-${b}`)
    }
    sub(await fig(page, '#fig-added'), 'mc2-q3-added')
    sub(await fig(page, '#fig-revived'), 'mc2-q3-revived')
    sub(await fig(page, '#fig-trans'), 'mc2-q3-transitions')
    sub(steps[5], 'mc2-q3-verdicts')
    sub(steps[3], 'mc2-q4-story')
    sub(await fig(page, '#fig-handover'), 'mc2-q4-handover')
    sub(await fig(page, '#fig-pairs'), 'mc2-q4-pairs')
    sub(await fig(page, '#fig-consol'), 'mc2-q4-consolidation')
  }
  await page.close()
}

// ---------- MC3 ----------
{
  // step 3 is the break-apart; also grab it mid-morph
  const { page, steps } = await chapter('mc3', { midStep: 2 })
  docs(await fig(page, '#mc3-ablation'), 'mc3-fig-ablation')
  docs(await fig(page, '#mc3-map'), 'mc3-fig-map')
  docs(await fig(page, '#mc3-investigate'), 'mc3-fig-investigate')
  if (wantSub) {
    sub(steps[2], 'mc3-q1-break')
    sub(steps[3], 'mc3-q1-chance')
    sub(await fig(page, '#mc3-owners'), 'mc3-q1-owners')
    sub(await fig(page, page.locator('#q1 figure.fig').nth(1)), 'mc3-q1-top30')
    sub(await fig(page, '#mc3-anomaly'), 'mc3-q1-bg00148')
    sub(steps[5], 'mc3-q2-similar')
    sub(await fig(page, '#mc3-map'), 'mc3-q2-map-text')
    await press(page, '#mc3-map', 'Structure space')
    sub(await fig(page, '#mc3-map'), 'mc3-q2-map-structure')
    await press(page, '#mc3-map', 'Text space') // the terms figure follows the map's space
    sub(await fig(page, page.locator('#q2 figure.fig').nth(1)), 'mc3-q2-terms')
    sub(await fig(page, '#mc3-cohesion'), 'mc3-q3-cohesion')
    await page.locator('#mc3-margin').scrollIntoViewIfNeeded()
    await press(page, '#mc3-margin', 'Opacity = margin')
    sub(await fig(page, '#mc3-margin'), 'mc3-q3-margin')
    sub(await fig(page, '#mc3-k'), 'mc3-q3-k')
    sub(steps[4], 'mc3-q4-small')
    sub(await fig(page, '#mc3-investigate'), 'mc3-q4-investigate')
    sub(await fig(page, '#mc3-overlap'), 'mc3-q4-overlap')
  }
  await page.close()
}

// ---------- Method ----------
if (wantDocs) {
  const page = await open('method')
  docs(await shot(page), 'method')
  await scrollTo(page, '#judge-h')
  docs(await shot(page), 'method-verdicts')
  await page.close()
}

// ---------- Phone ----------
if (wantDocs) {
  let page = await open('', PHONE)
  docs(await shot(page), 'phone-home')
  await page.close()
  page = await open('mc1', PHONE)
  for (const i of [0, 1]) {
    await gotoStep(page, i)
    await page.waitForTimeout(STEP_WAIT)
  }
  docs(await shot(page), 'phone-mc1-step-2')
  await page.close()
  page = await open('mc3', PHONE)
  docs(await shot(page), 'phone-mc3-opener')
  await page.close()
}

await browser.close()

const total = saved.reduce((s, f) => s + fs.statSync(f).size, 0)
console.log(`\n${saved.length} images, ${(total / 1048576).toFixed(1)} MB`)
for (const dir of [DOCS, SUB]) {
  if (!fs.existsSync(dir)) continue
  const files = fs.readdirSync(dir).filter((f) => /\.(webp|png)$/.test(f))
  const mb = files.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0) / 1048576
  console.log(`${path.relative(ROOT, dir)}: ${files.length} files, ${mb.toFixed(1)} MB`)
}
if (problems.length) console.log('\nPage errors:\n' + [...new Set(problems)].join('\n'))
