// Autonomy session instrumentation (IMPLEMENTATION_PLAN §4 item 12).
// The frontend posts structured events here when a backend is reachable;
// they feed the manager metrics dashboard + funnel. Optional auth so
// anonymous/local sessions still record (memberId null).
import { Router } from 'express'
import { models, dbReady } from '../db/index.js'
import { optionalAuth } from '../auth/index.js'

const router = Router()
router.use((req, res, next) => {
  if (!dbReady()) { res.status(503).json({ ok: false, error: 'banco de dados indisponível' }); return }
  next()
})

// batch ingest — { sessionId, projectId?, teamId?, events: [{ name, payload, at? }] }
router.post('/', optionalAuth, async (req, res) => {
  const { sessionId, projectId, teamId, events } = req.body || {}
  if (!Array.isArray(events) || !events.length) { res.status(400).json({ ok: false, error: 'events[] obrigatório' }); return }
  try {
    const rows = events.slice(0, 500).map(e => ({
      sessionId: sessionId || null,
      memberId: req.member?.id || null,
      projectId: projectId || null,
      teamId: teamId || null,
      name: String(e.name || e.eventName || 'event'),
      payload: e.payload || {},
      at: e.at || e.timestamp || new Date().toISOString(),
    }))
    await models.Event.bulkCreate(rows)
    res.json({ ok: true, stored: rows.length })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
