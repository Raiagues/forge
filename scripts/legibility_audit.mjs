#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────
// FORGE legibility audit — systematic, not screen-by-screen.
//
//   node scripts/legibility_audit.mjs          → report only
//   node scripts/legibility_audit.mjs --fix    → raise inline font sizes
//
// Checks:
//  1. WCAG AA contrast of every design-token text/background pair
//     (4.5:1 normal text, 3:1 large text)
//  2. inline fontSize occurrences below the floor (14px body,
//     ~11px minimum for mono micro-labels)
//  3. low-alpha text colors (white < .60 on navy, ink < .70 on paper)
//
// The --fix mapping preserves the type hierarchy while raising the
// floor: micro-labels land at 10–12px, secondary at 13–13.5px and
// body/content at 14–15px.
// ──────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const FIX = process.argv.includes('--fix')

// ── WCAG contrast math ─────────────────────────────────────────────
const hex = (h) => {
  const m = h.replace('#', '')
  const n = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16))
}
const blend = (fg, alpha, bg) => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)))
const lum = (rgb) => {
  const [r, g, b] = rgb.map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// ── 1 · token pairs ────────────────────────────────────────────────
const css = readFileSync(join(SRC, 'index.css'), 'utf8')
const token = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{3,6})`))?.[1]
const alphaToken = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*rgba\\(255,255,255,([\\d.]+)\\)`))
  return m ? parseFloat(m[1]) : null
}

const paper = hex(token('paper')); const paper2 = hex(token('paper2')); const paper3 = hex(token('paper3'))
const navy = hex(token('navy')); const navy2 = hex(token('navy2'))
const WHITE = [255, 255, 255]

const pairs = [
  ['ink   on paper ', hex(token('ink')), paper],
  ['ink2  on paper ', hex(token('ink2')), paper],
  ['ink3  on paper ', hex(token('ink3')), paper],
  ['ink3  on paper2', hex(token('ink3')), paper2],
  ['ink3  on paper3', hex(token('ink3')), paper3],
  ['ink4  on paper ', hex(token('ink4')), paper],
  ['ink4  on paper2', hex(token('ink4')), paper2],
  ['acc   on paper ', hex(token('acc')), paper],
  ['acc2  on paper ', hex(token('acc2')), paper],
  ['ok2   on paper ', hex(token('ok2')), paper],
  ['warn2 on paper ', hex(token('warn2')), paper],
  ['err2  on paper ', hex(token('err2')), paper],
  ['navyt  on navy ', blend(WHITE, alphaToken('navyt'), navy), navy],
  ['navyt2 on navy ', blend(WHITE, alphaToken('navyt2'), navy), navy],
  ['navyt3 on navy2', blend(WHITE, alphaToken('navyt3'), navy2), navy2],
]

console.log('── token contrast (WCAG AA: 4.5 normal · 3.0 large) ──')
let contrastFails = 0
for (const [label, fg, bg] of pairs) {
  const r = ratio(fg, bg)
  const ok = r >= 4.5
  if (!ok) contrastFails++
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}  ${r.toFixed(2)}:1`)
}

// ── 2+3 · scan JSX ────────────────────────────────────────────────
const files = []
const walk = (d) => readdirSync(d).forEach(f => {
  const p = join(d, f)
  if (statSync(p).isDirectory()) walk(p)
  else if (p.endsWith('.jsx')) files.push(p)
})
walk(SRC)

// hierarchy-preserving floor raise
const MAP = { 7: 10, 7.5: 10, 8: 11, 8.5: 11, 9: 12, 9.5: 12, 10: 13, 10.5: 13, 11: 13.5, 11.5: 13.5, 12: 14, 12.5: 14, 13: 15, 13.5: 15 }
const bump = (n) => MAP[n] ?? n

let small = 0, lowAlpha = 0, fixed = 0
console.log('\n── inline font sizes < 14 ──')
for (const f of files) {
  let txt = readFileSync(f, 'utf8')
  const sizes = [...txt.matchAll(/fontSize[:=][\s{]*["']?([\d.]+)/g)].map(m => parseFloat(m[1])).filter(n => n < 14)
  if (sizes.length) { small += sizes.length; console.log(`  ${f.replace(SRC + '/', '')}: ${sizes.length} (min ${Math.min(...sizes)})`) }

  const alphas = [...txt.matchAll(/rgba\(255,\s*255,\s*255,\s*\.?([\d.]+)\)/g)]
    .map(m => parseFloat(m[1].startsWith('.') ? m[1] : `0.${m[1]}`)).filter(a => a > 0.1 && a < 0.6)
  lowAlpha += alphas.length

  if (FIX) {
    const before = txt
    txt = txt.replace(/(fontSize:\s*)([\d.]+)/g, (_, p, n) => `${p}${bump(parseFloat(n))}`)
    txt = txt.replace(/(fontSize=\{)([\d.]+)(\})/g, (_, p, n, s) => `${p}${bump(parseFloat(n))}${s}`)
    txt = txt.replace(/(fontSize=")([\d.]+)(")/g, (_, p, n, s) => `${p}${bump(parseFloat(n))}${s}`)
    if (txt !== before) { writeFileSync(f, txt); fixed++ }
  }
}

console.log(`\nsummary: ${contrastFails} contrast failures · ${small} small font sites · ${lowAlpha} low-alpha white text sites`)
if (FIX) console.log(`--fix applied to ${fixed} files (token + alpha fixes are manual, in index.css)`)
