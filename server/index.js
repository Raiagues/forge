// ──────────────────────────────────────────────────────────────────
// Unified GuiaSat server (IMPLEMENTATION_PLAN §3/§4).
//
// One process, one DB: auth + teams + projects + tasks + autonomy events
// + metrics + phase reports + the public share summary + WebSocket
// collaboration, with the original ESP32 flash/serial + analytics +
// consultant routes folded in (server/routes/device.js).
//
// Security: tightened CORS (allow-list), login rate limiting, server-only
// JWT secret with token expiry, bcrypt cost ≥10 (see server/auth).
// SQLite is optional: if the driver is missing the DB-backed routes return
// 503 and the device routes still work (keeps the static demo functional).
// ──────────────────────────────────────────────────────────────────
import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'

import { initDb, dbReady } from './db/index.js'
import { seedDatabase } from './seed.js'
import { attachWebSocket } from './ws.js'

import deviceRouter from './routes/device.js'
import authRouter from './routes/auth.js'
import teamsRouter from './routes/teams.js'
import projectsRouter from './routes/projects.js'
import tasksRouter from './routes/tasks.js'
import eventsRouter from './routes/events.js'
import metricsRouter from './routes/metrics.js'
import reportsRouter from './routes/reports.js'
import shareRouter from './routes/share.js'

const PORT = Number(process.env.PORT) || 3001

// ── tightened CORS (was wide-open cors() in login_project) ──────────
// Allow the local dev origins + the GitHub Pages site by default; extend
// via FORGE_CORS_ORIGINS (comma-separated). Same-origin / tooling
// requests (no Origin header) are allowed.
const DEFAULT_ORIGINS = [
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:4173', 'http://127.0.0.1:4173',
  'https://raiagues.github.io',
]
const ALLOWED = new Set([...DEFAULT_ORIGINS, ...(process.env.FORGE_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)])
const corsOptions = {
  origin(origin, cb) {
    if (!origin || ALLOWED.has(origin)) return cb(null, true)
    cb(null, false)
  },
  credentials: true,
}

// ── lightweight login rate limiter (no extra deps) ──────────────────
// Per-IP sliding window on the auth routes to blunt credential stuffing.
const RL_WINDOW_MS = 60_000
const RL_MAX = 20
const hits = new Map() // ip -> [timestamps]
function loginRateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown'
  const now = Date.now()
  const arr = (hits.get(ip) || []).filter(t => now - t < RL_WINDOW_MS)
  arr.push(now)
  hits.set(ip, arr)
  if (arr.length > RL_MAX) { res.status(429).json({ ok: false, error: 'muitas tentativas — tente novamente em instantes' }); return }
  next()
}
// occasional cleanup so the map can't grow unbounded
setInterval(() => {
  const now = Date.now()
  for (const [ip, arr] of hits) {
    const keep = arr.filter(t => now - t < RL_WINDOW_MS)
    if (keep.length) hits.set(ip, keep); else hits.delete(ip)
  }
}, RL_WINDOW_MS).unref?.()

const app = express()
app.set('trust proxy', true)
app.use(cors(corsOptions))
app.use(express.json({ limit: '2mb' }))

// health / capability probe — the frontend uses this to decide whether to
// surface the collaboration features (graceful when the backend is absent).
app.get('/health', (_req, res) => res.json({ ok: true, db: dbReady(), ts: Date.now() }))

// device + analytics + consult (unchanged endpoints, mounted at root)
app.use('/', deviceRouter)

// auth (rate-limited) + the rest of the collaboration API
app.use('/auth', loginRateLimit, authRouter)
app.use('/teams', teamsRouter)
app.use('/projects', projectsRouter)
app.use('/tasks', tasksRouter)
app.use('/events', eventsRouter)
app.use('/metrics', metricsRouter)
app.use('/reports', reportsRouter)
app.use('/share', shareRouter)

const httpServer = createServer(app)
attachWebSocket(httpServer)

async function boot() {
  const db = await initDb()
  if (db) {
    try {
      const summary = await seedDatabase()
      console.log(`[forge] database ready — seeded ${summary.members} accounts (core + demo team)`)
    } catch (e) {
      console.warn(`[forge] seed failed: ${e.message}`)
    }
  }
  httpServer.listen(PORT, () => {
    console.log(`[forge] unified server on http://localhost:${PORT} (db: ${dbReady() ? 'on' : 'off'}, ws: /collab)`)
  })
}

boot()
