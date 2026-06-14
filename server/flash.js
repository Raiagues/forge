// GuiaSat flash + serial server for the Serial Test page.
//
// The backend owns the ESP32 serial port (via serial_bridge.py) so the browser
// never touches Web Serial — no popup, hardcoded port, persistent connection.
//
//   POST /flash        { code } or { files: { name → content } }
//                                → compile + upload, streaming logs as text.
//                                  `files` writes the whole generated set
//                                  (main.ino + headers) into the sketch dir
//                                  so #include references resolve.
//   GET  /serial                 → SSE stream of live serial lines.
//   POST /serial/send  { line }  → write a line to the board.
//   GET  /detect                 → real esptool chip handshake (is it an ESP32?).
//
//   POST /analytics/events       → append events to analytics/sessions/<sid>.jsonl
//   GET  /analytics/sessions     → list recorded session files
//   GET  /analytics/export       → merged JSON of every session (for analysis)
//
// Flashing transparently stops the bridge (frees the port) and restarts it
// afterwards, so serial monitoring resumes on its own. One port, no abstractions.

import express from 'express'
import cors from 'cors'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, mkdir, appendFile, readdir, readFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT) || 3001
const FQBN = 'esp32:esp32:esp32'
const SKETCH = 'forge_sketch'
const BAUD = 115200
const HERE = dirname(fileURLToPath(import.meta.url))
const BRIDGE = join(HERE, 'serial_bridge.py')

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// ── binary resolution ──────────────────────────────────────────────
function resolveBin(name) {
  const candidates = [
    join(process.env.HOME || '', '.local/bin', name),
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
  ]
  for (const dir of (process.env.PATH || '').split(':')) {
    if (dir) candidates.push(join(dir, name))
  }
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return name // fall back to PATH lookup at spawn time
}
const resolveArduinoCli = () => resolveBin('arduino-cli')
const resolveEsptool = () => (existsSync(resolveBin('esptool')) ? resolveBin('esptool') : resolveBin('esptool.py'))
const resolvePython = () => resolveBin('python3')

// First /dev/ttyUSB* or /dev/ttyACM* device (single hardcoded board).
function findPort() {
  let devs = []
  try { devs = readdirSync('/dev') } catch { return null }
  const match = devs.filter((d) => d.startsWith('ttyUSB') || d.startsWith('ttyACM')).sort()
  return match.length ? join('/dev', match[0]) : null
}

// ── serial bridge lifecycle ────────────────────────────────────────
let bridge = null          // the python child process, or null
let bridgeBuf = ''         // partial line buffer from its stdout
const serialClients = new Set() // open SSE responses

function broadcast(line) {
  for (const res of serialClients) {
    try { res.write(`data: ${line}\n\n`) } catch { /* dropped client */ }
  }
}

function startBridge() {
  if (bridge) return
  const port = findPort()
  if (!port) { broadcast('# sem porta serial — conecte o ESP32'); return }
  const child = spawn(resolvePython(), ['-u', BRIDGE, port, String(BAUD)])
  bridge = child
  bridgeBuf = ''
  child.stdout.on('data', (d) => {
    bridgeBuf += d.toString()
    let i
    while ((i = bridgeBuf.indexOf('\n')) >= 0) {
      const line = bridgeBuf.slice(0, i)
      bridgeBuf = bridgeBuf.slice(i + 1)
      if (line.startsWith('__BRIDGE_OPEN__')) broadcast(`# serial ativo · ${line.replace('__BRIDGE_OPEN__', '').trim()}`)
      else if (line.startsWith('__BRIDGE_ERROR__')) broadcast(`# erro de serial: ${line.replace('__BRIDGE_ERROR__', '').trim()}`)
      else broadcast(line)
    }
  })
  child.stderr.on('data', (d) => broadcast(`# bridge: ${d.toString().trim()}`))
  child.on('exit', () => { if (bridge === child) bridge = null })
}

function stopBridge() {
  return new Promise((resolve) => {
    const child = bridge
    if (!child) { resolve(); return }
    bridge = null
    child.once('exit', () => setTimeout(resolve, 250)) // let the OS release the FD
    try { child.kill('SIGTERM') } catch { resolve() }
    setTimeout(() => { try { child.kill('SIGKILL') } catch { /* gone */ } }, 1200)
  })
}

// ── run a command, streaming stdout+stderr to a response ───────────
function stream(res, cmd, args) {
  return new Promise((resolve) => {
    res.write(`$ ${cmd.split('/').pop()} ${args.join(' ')}\n`)
    let child
    try { child = spawn(cmd, args) } catch (e) { res.write(`ERROR: ${e.message}\n`); resolve(1); return }
    child.stdout.on('data', (d) => res.write(d))
    child.stderr.on('data', (d) => res.write(d))
    child.on('error', (e) => { res.write(`ERROR: ${e.message}\n`); resolve(1) })
    child.on('close', (code) => resolve(code ?? 1))
  })
}

// ── GET /serial : live serial as Server-Sent Events ────────────────
app.get('/serial', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
  res.write(': connected\n\n')
  serialClients.add(res)
  startBridge()
  req.on('close', () => {
    serialClients.delete(res)
    if (serialClients.size === 0) stopBridge()
  })
})

// ── POST /serial/send : write a line to the board ──────────────────
app.post('/serial/send', (req, res) => {
  const line = req.body && typeof req.body.line === 'string' ? req.body.line : ''
  if (bridge && bridge.stdin.writable) {
    bridge.stdin.write(line.replace(/\n+$/, '') + '\n')
    res.end('ok')
  } else {
    res.status(409).end('serial not connected')
  }
})

// ── GET /detect : real chip handshake over the ROM bootloader ──────
app.get('/detect', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  const port = findPort()
  if (!port) { res.status(500).end('ERROR: no serial port found. Plug in the ESP32.\n'); return }
  const hadClients = serialClients.size > 0
  await stopBridge() // free the port so esptool can talk to the ROM
  res.write(`Detecting board on ${port}...\n`)
  await stream(res, resolveEsptool(), ['--port', port, 'flash_id'])
  if (hadClients) startBridge() // reboots into the firmware and resumes serial
  res.end('\n-- detection done --\n')
})

// ── POST /flash : compile + upload, releasing/reacquiring the port ─
app.post('/flash', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')

  const code = req.body && typeof req.body.code === 'string' ? req.body.code : ''
  // multi-file sketch: { files: { 'main.ino': ..., 'sensor_x.h': ... } }
  // names are restricted to plain basenames (no paths) for safety.
  const FILE_SAFE = /^[\w.-]+$/
  const rawFiles = req.body && req.body.files && typeof req.body.files === 'object' ? req.body.files : null
  const files = rawFiles
    ? Object.entries(rawFiles).filter(([n, c]) => FILE_SAFE.test(n) && typeof c === 'string' && c.trim())
    : []
  if (!files.length && !code.trim()) { res.status(400).end('ERROR: no code provided\n'); return }

  const cli = resolveArduinoCli()
  const ok = await new Promise((resolve) => {
    let p
    try { p = spawn(cli, ['version']) } catch { resolve(false); return }
    p.on('error', () => resolve(false))
    p.on('close', (c) => resolve(c === 0))
  })
  if (!ok) {
    res.status(500).end('ERROR: arduino-cli not found. Install it and the esp32 core (arduino-cli core install esp32:esp32).\n')
    return
  }

  const port = findPort()
  if (!port) {
    res.status(500).end('ERROR: no serial port found (looked for /dev/ttyUSB* and /dev/ttyACM*). Plug in the ESP32.\n')
    return
  }

  const hadClients = serialClients.size > 0
  await stopBridge() // free the port for the upload

  try {
    const dir = await mkdtemp(join(tmpdir(), 'forge-flash-'))
    const sketchDir = join(dir, SKETCH)
    await mkdir(sketchDir)
    if (files.length) {
      // arduino-cli requires the entry sketch to be named after the dir;
      // every .h lands beside it so the #include references resolve.
      for (const [name, content] of files) {
        const target = name.endsWith('.ino') ? `${SKETCH}.ino` : name
        await writeFile(join(sketchDir, target), content, 'utf8')
        res.write(`Writing ${name}${target !== name ? ` -> ${target}` : ''}\n`)
      }
    } else {
      await writeFile(join(sketchDir, `${SKETCH}.ino`), code, 'utf8')
    }

    res.write(`Using port ${port}\n`)
    res.write('Compiling...\n')
    const compiled = await stream(res, cli, ['compile', '--fqbn', FQBN, sketchDir])
    if (compiled !== 0) { if (hadClients) startBridge(); res.end('ERROR: compile failed\n'); return }

    res.write('Uploading...\n')
    const uploaded = await stream(res, cli, ['upload', '-p', port, '--fqbn', FQBN, sketchDir])
    if (uploaded !== 0) {
      if (hadClients) startBridge()
      res.end('ERROR: upload failed (board busy or disconnected — replug and retry)\n')
      return
    }

    res.write('Flash complete — resuming serial\n')
  } catch (e) {
    res.write(`ERROR: ${e.message}\n`)
  } finally {
    if (hadClients) startBridge() // bridge restart reboots the board → serial resumes
    res.end()
  }
})

// ── analytics persistence (user-testing sessions) ───────────────────
// Events arrive in batches from src/lib/analytics.js and land on disk as
// one JSONL file per session under analytics/sessions/. No database, no
// cloud — files you can copy after a testing day.
const ANALYTICS_DIR = join(HERE, '..', 'analytics', 'sessions')
const SID_SAFE = /^[\w.-]+$/

app.post('/analytics/events', async (req, res) => {
  const { sessionId, events } = req.body || {}
  if (!sessionId || !SID_SAFE.test(sessionId) || !Array.isArray(events) || !events.length) {
    res.status(400).json({ ok: false, error: 'sessionId + events[] required' }); return
  }
  try {
    await mkdir(ANALYTICS_DIR, { recursive: true })
    const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n'
    await appendFile(join(ANALYTICS_DIR, `${sessionId}.jsonl`), lines, 'utf8')
    res.json({ ok: true, stored: events.length })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/analytics/sessions', async (_req, res) => {
  try {
    await mkdir(ANALYTICS_DIR, { recursive: true })
    const files = (await readdir(ANALYTICS_DIR)).filter((f) => f.endsWith('.jsonl'))
    res.json({ ok: true, sessions: files.map((f) => f.replace(/\.jsonl$/, '')) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/analytics/export', async (_req, res) => {
  try {
    await mkdir(ANALYTICS_DIR, { recursive: true })
    const files = (await readdir(ANALYTICS_DIR)).filter((f) => f.endsWith('.jsonl'))
    const sessions = {}
    for (const f of files) {
      const raw = await readFile(join(ANALYTICS_DIR, f), 'utf8')
      sessions[f.replace(/\.jsonl$/, '')] = raw.trim().split('\n').filter(Boolean).map((l) => {
        try { return JSON.parse(l) } catch { return null }
      }).filter(Boolean)
    }
    res.json({ exported: new Date().toISOString(), sessionCount: files.length, sessions })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── POST /consult : the live mission consultant (Anthropic) ─────────
// The key lives ONLY here (server-side, read from ANTHROPIC_API_KEY in a
// git-ignored .env — see .env.example). The browser never sees it. With
// no key set, this returns 503 and the frontend falls back to its local
// heuristic consultant (offline, no cost). Model: claude-opus-4-8.
//
// Raw HTTPS to the Messages API (Node 18+ global fetch) keeps the backend
// dependency-free, consistent with the rest of this server. One short,
// non-streaming completion per call — small output, fast.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const ANTHROPIC_MODEL = 'claude-opus-4-8'

app.post('/consult', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    res.status(503).json({ ok: false, error: 'ANTHROPIC_API_KEY not set — using offline consultant' })
    return
  }
  const system = typeof req.body?.system === 'string' ? req.body.system : ''
  const message = typeof req.body?.message === 'string' ? req.body.message : ''
  if (!message.trim()) { res.status(400).json({ ok: false, error: 'message required' }); return }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: message }],
      }),
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      res.status(502).json({ ok: false, error: `anthropic ${r.status}`, detail: detail.slice(0, 500) })
      return
    }
    const data = await r.json()
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    res.json({ ok: true, text })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.listen(PORT, () => {
  console.log(`[forge] flash + serial server on http://localhost:${PORT}`)
})
