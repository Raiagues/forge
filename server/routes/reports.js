// Backend-stored phase reports (IMPLEMENTATION_PLAN §4 item 14 / A7).
// When a phase is confirmed, the frontend persists a report here so the
// Reports section + the shareable summary read from the backend instead
// of only the local store. Any team member may file; all members read.
import { Router } from 'express'
import { models, dbReady } from '../db/index.js'
import { requireAuth, teamRole } from '../auth/index.js'
import { broadcastToProject } from '../ws.js'

const router = Router()
router.use((req, res, next) => {
  if (!dbReady()) { res.status(503).json({ ok: false, error: 'banco de dados indisponível' }); return }
  next()
})
router.use(requireAuth)

async function projectCtx(req, res, next) {
  const projectId = Number(req.body?.projectId ?? req.query.projectId)
  const project = await models.Project.findByPk(projectId)
  if (!project) { res.status(404).json({ ok: false, error: 'projeto não encontrado' }); return }
  const r = await teamRole(req.member.id, project.teamId)
  if (!r && !req.member.isAdmin) { res.status(403).json({ ok: false, error: 'sem acesso ao projeto' }); return }
  req.project = project
  req.role = r?.role || 'member'
  next()
}

const shape = (r) => ({
  id: r.id, projectId: r.projectId, phaseId: r.phaseId, authorName: r.authorName,
  summary: r.summary, criteria: r.criteria, confirmedAt: r.confirmedAt, createdAt: r.createdAt,
})

router.get('/', projectCtx, async (req, res) => {
  const reports = await models.PhaseReport.findAll({ where: { projectId: req.project.id }, order: [['createdAt', 'DESC']] })
  res.json({ ok: true, reports: reports.map(shape) })
})

// file a report (one per phase confirmation; latest wins per phase)
router.post('/', projectCtx, async (req, res) => {
  const { phaseId, summary, criteria, confirmedAt } = req.body || {}
  if (!phaseId) { res.status(400).json({ ok: false, error: 'phaseId obrigatório' }); return }
  try {
    const report = await models.PhaseReport.create({
      projectId: req.project.id,
      phaseId: String(phaseId),
      authorId: req.member.id,
      authorName: req.member.name || req.member.username,
      summary: summary || '',
      criteria: Array.isArray(criteria) ? criteria : [],
      confirmedAt: confirmedAt || new Date().toISOString(),
    })
    broadcastToProject(req.project.id, 'report', { report: shape(report) })
    res.json({ ok: true, report: shape(report) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
