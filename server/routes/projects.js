// Projects (multi-project architecture, IMPLEMENTATION_PLAN §3/§4). Each
// project owns a shared mission-state snapshot; loading a project hydrates
// the store, saving it persists + broadcasts to collaborators. Scope is
// per-project rather than replacing the single-design model.
import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { models, dbReady } from '../db/index.js'
import { requireAuth, teamRole } from '../auth/index.js'
import { broadcastToProject } from '../ws.js'

const router = Router()
router.use((req, res, next) => {
  if (!dbReady()) { res.status(503).json({ ok: false, error: 'banco de dados indisponível' }); return }
  next()
})
router.use(requireAuth)

// resolve the caller's role on a project (via its team); 403 if not a member
async function projectAccess(req, res, next) {
  const project = await models.Project.findByPk(Number(req.params.id))
  if (!project) { res.status(404).json({ ok: false, error: 'projeto não encontrado' }); return }
  const r = await teamRole(req.member.id, project.teamId)
  if (!r && !req.member.isAdmin) { res.status(403).json({ ok: false, error: 'sem acesso a este projeto' }); return }
  req.project = project
  req.role = r?.role || (req.member.isAdmin ? 'manager' : 'member')
  req.subsystem = r?.subsystem || null
  next()
}

const shape = (p) => ({ id: p.id, teamId: p.teamId, name: p.name, isDemo: !!p.isDemo, shareToken: p.shareToken, updatedAt: p.updatedAt })

// list projects across all teams the caller belongs to
router.get('/', async (req, res) => {
  try {
    const memberships = await models.TeamMember.findAll({ where: { memberId: req.member.id } })
    const teamIds = memberships.map(m => m.teamId)
    const projects = await models.Project.findAll({ where: { teamId: teamIds } })
    res.json({ ok: true, projects: projects.map(shape) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// create a project under a team the caller manages
router.post('/', async (req, res) => {
  const { teamId, name } = req.body || {}
  const r = await teamRole(req.member.id, Number(teamId))
  if (!r || (r.role !== 'manager' && !req.member.isAdmin)) { res.status(403).json({ ok: false, error: 'apenas o gestor pode criar projetos' }); return }
  try {
    const project = await models.Project.create({ teamId: Number(teamId), name: (name || 'Missão').trim(), missionState: {} })
    res.json({ ok: true, project: shape(project) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// load a project's full mission state (hydrate the store)
router.get('/:id', projectAccess, async (req, res) => {
  res.json({ ok: true, project: shape(req.project), missionState: req.project.missionState || {}, role: req.role, subsystem: req.subsystem })
})

// save the shared mission state — managers (or scoped members) only
router.put('/:id', projectAccess, async (req, res) => {
  if (req.role !== 'manager' && !req.body?.scoped) { res.status(403).json({ ok: false, error: 'somente o gestor edita a missão compartilhada' }); return }
  try {
    req.project.missionState = req.body?.missionState ?? {}
    if (typeof req.body?.name === 'string' && req.body.name.trim()) req.project.name = req.body.name.trim()
    await req.project.save()
    broadcastToProject(req.project.id, 'mission_state', { state: req.project.missionState, by: req.member.username })
    res.json({ ok: true, project: shape(req.project) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// enable a public share token for the read-only summary (item 14)
router.post('/:id/share', projectAccess, async (req, res) => {
  if (req.role !== 'manager') { res.status(403).json({ ok: false, error: 'apenas o gestor pode compartilhar' }); return }
  try {
    if (!req.project.shareToken) { req.project.shareToken = randomBytes(9).toString('hex'); await req.project.save() }
    res.json({ ok: true, shareToken: req.project.shareToken })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.delete('/:id/share', projectAccess, async (req, res) => {
  if (req.role !== 'manager') { res.status(403).json({ ok: false, error: 'apenas o gestor pode alterar o compartilhamento' }); return }
  try { req.project.shareToken = null; await req.project.save(); res.json({ ok: true }) } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

export default router
