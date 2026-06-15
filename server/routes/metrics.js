// Manager metrics — raw aggregates for the autonomy dashboard + funnel
// (IMPLEMENTATION_PLAN §4 item 12). Returns the team's instrumentation
// events (capped) plus roster; the funnel/autonomy index is derived on
// the frontend (src/mission/autonomy.js) so the math stays pure + testable.
// Manager-only.
import { Router } from 'express'
import { Op } from 'sequelize'
import { models, dbReady } from '../db/index.js'
import { requireAuth, teamRole } from '../auth/index.js'

const router = Router()
router.use((req, res, next) => {
  if (!dbReady()) { res.status(503).json({ ok: false, error: 'banco de dados indisponível' }); return }
  next()
})
router.use(requireAuth)

router.get('/:teamId', async (req, res) => {
  const teamId = Number(req.params.teamId)
  const r = await teamRole(req.member.id, teamId)
  if ((!r || r.role !== 'manager') && !req.member.isAdmin) { res.status(403).json({ ok: false, error: 'apenas o gestor vê as métricas' }); return }
  try {
    const projects = await models.Project.findAll({ where: { teamId } })
    const projectIds = projects.map(p => p.id)
    const events = await models.Event.findAll({
      where: { [Op.or]: [{ teamId }, { projectId: projectIds.length ? projectIds : [-1] }] },
      order: [['at', 'DESC']],
      limit: 5000,
    })
    const memberships = await models.TeamMember.findAll({ where: { teamId }, include: [{ model: models.Member }] })
    res.json({
      ok: true,
      teamId,
      members: memberships.map(m => ({ memberId: m.memberId, username: m.member?.username, name: m.member?.name, role: m.role, subsystem: m.subsystem })),
      projects: projects.map(p => ({ id: p.id, name: p.name })),
      events: events.map(e => ({ sessionId: e.sessionId, memberId: e.memberId, projectId: e.projectId, name: e.name, payload: e.payload, at: e.at })),
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
