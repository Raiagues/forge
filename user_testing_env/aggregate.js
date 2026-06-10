#!/usr/bin/env node
// Aggregate user-testing analytics: merges analytics/sessions/*.jsonl into
// analytics/aggregate.json and prints a quick validation summary.
//
//   node user_testing_env/aggregate.js

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SESSIONS_DIR = join(ROOT, 'analytics', 'sessions')
const OUT = join(ROOT, 'analytics', 'aggregate.json')

const files = (await readdir(SESSIONS_DIR).catch(() => []))
  .filter((f) => f.endsWith('.jsonl'))

if (!files.length) {
  console.log('Nenhuma sessão encontrada em analytics/sessions/. Rode ./start_test_user.sh e teste com usuários primeiro.')
  process.exit(0)
}

const sessions = {}
for (const f of files) {
  const raw = await readFile(join(SESSIONS_DIR, f), 'utf8')
  sessions[f.replace(/\.jsonl$/, '')] = raw.trim().split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l) } catch { return null } })
    .filter(Boolean)
}

const all = Object.values(sessions).flat()
const byName = {}
for (const e of all) byName[e.eventName] = (byName[e.eventName] || 0) + 1

const accepted = byName.suggestion_accepted || 0
const rejected = byName.suggestion_rejected || 0
const rated = accepted + rejected

const aggregate = {
  exported: new Date().toISOString(),
  sessionCount: files.length,
  totalEvents: all.length,
  eventsByName: Object.fromEntries(Object.entries(byName).sort((a, b) => b[1] - a[1])),
  validation: {
    debugSessions: byName.debug_session || 0,
    suggestionAcceptRate: rated ? +(accepted / rated).toFixed(2) : null,
    fixesApplied: byName.fix_applied || 0,
    invalidWires: byName.wire_invalid || 0,
  },
  sessions,
}

await writeFile(OUT, JSON.stringify(aggregate, null, 2), 'utf8')

console.log(`Sessões agregadas: ${files.length} · eventos: ${all.length}`)
console.log(`→ ${OUT}`)
console.log('')
console.log('Validação rápida:')
console.log(`  sessões de debug (assistente usado): ${aggregate.validation.debugSessions}`)
console.log(`  taxa de aceitação de sugestões:      ${aggregate.validation.suggestionAcceptRate ?? 'sem avaliações'}`)
console.log(`  correções aplicadas via assistente:  ${aggregate.validation.fixesApplied}`)
console.log('')
console.log('Top eventos:')
for (const [name, n] of Object.entries(aggregate.eventsByName).slice(0, 12)) {
  console.log(`  ${String(n).padStart(5)}  ${name}`)
}
