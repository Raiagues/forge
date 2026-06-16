// One-command dev launcher: starts the unified backend (Sequelize/SQLite +
// auth + WebSocket + flash/serial) AND the Vite frontend together, so the
// whole platform comes up with a single `npm run dev`. Prefixes each
// process's output and tears both down together on Ctrl-C / exit.
import { spawn } from 'node:child_process'

const C = { server: '36', web: '35', dim: '90' }  // ANSI colors
const procs = []
let down = false

function tag(name) { return `\x1b[${C[name] || C.dim}m[${name}]\x1b[0m ` }
function prefixed(name, buf) {
  const t = tag(name)
  return buf.toString().replace(/\n(?!$)/g, `\n${t}`).replace(/^/, t)
}
function run(name, args) {
  const p = spawn('npm', ['run', ...args], { shell: true, stdio: ['inherit', 'pipe', 'pipe'] })
  p.stdout.on('data', (d) => process.stdout.write(prefixed(name, d)))
  p.stderr.on('data', (d) => process.stderr.write(prefixed(name, d)))
  p.on('exit', (code) => { console.log(`${tag(name)}saiu (código ${code})`); shutdown() })
  procs.push(p)
}
function shutdown() {
  if (down) return
  down = true
  for (const p of procs) { try { p.kill('SIGTERM') } catch { /* noop */ } }
  setTimeout(() => process.exit(0), 200)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log('GuiaSat — iniciando backend + frontend (uma vez só)…')
run('server', ['server'])         // node server/index.js  → :3001
run('web', ['dev:web', '--', '--host'])   // vite            → :5173
