// Team management (IMPLEMENTATION_PLAN §4 item 10): create teams, add /
// onboard members, assign roles + subsystems. Role enforcement is
// server-side (managers configure the team; members are read-mostly).
import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { models, dbReady } from '../db/index.js'
import { requireAuth, teamRole, hashPassword } from '../auth/index.js'
import { profileFor } from './profile.js'

const router = Router()
router.use((req, res, next) => {
  if (!dbReady()) { res.status(503).json({ ok: false, error: 'banco de dados indisponível' }); return }
  next()
})
router.use(requireAuth)

async function membersOf(teamId) {
  const rows = await models.TeamMember.findAll({
    where: { teamId },
    include: [{ model: models.Member }],
  })
  return rows.map(tm => ({
    teamMemberId: tm.id,
    memberId: tm.memberId,
    username: tm.member?.username,
    name: tm.member?.name,
    role: tm.role,
    subsystem: tm.subsystem,
  }))
}

// list teams the caller belongs to
router.get('/', async (req, res) => {
  const memberships = await models.TeamMember.findAll({ where: { memberId: req.member.id }, include: [{ model: models.Team }] })
  const teams = []
  for (const tm of memberships) {
    teams.push({
      id: tm.teamId,
      name: tm.team?.name,
      institution: tm.team?.institution,
      isDemo: !!tm.team?.isDemo,
      role: tm.role,
      subsystem: tm.subsystem,
      isOwner: tm.team?.ownerId === req.member.id,
      members: await membersOf(tm.teamId),
    })
  }
  res.json({ ok: true, teams })
})

// create a team — caller becomes its manager
router.post('/', async (req, res) => {
  const { name, institution } = req.body || {}
  if (!name || !String(name).trim()) { res.status(400).json({ ok: false, error: 'nome da equipe obrigatório' }); return }
  try {
    const team = await models.Team.create({ name: String(name).trim(), institution: institution || null, ownerId: req.member.id })
    await models.TeamMember.create({ teamId: team.id, memberId: req.member.id, role: 'manager', subsystem: null })
    res.json({ ok: true, team: { id: team.id, name: team.name, institution: team.institution, role: 'manager', isOwner: true, members: await membersOf(team.id) } })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// manager guard for a :teamId param
async function managerGuard(req, res, next) {
  const teamId = Number(req.params.teamId)
  const r = await teamRole(req.member.id, teamId)
  if (!r) { res.status(403).json({ ok: false, error: 'não é membro desta equipe' }); return }
  if (r.role !== 'manager' && !req.member.isAdmin) { res.status(403).json({ ok: false, error: 'apenas o gestor pode gerenciar a equipe' }); return }
  req.teamId = teamId
  next()
}

// add a member to the team — onboards a new account if needed (member
// onboarding flow, item 11). Returns the created credentials for an
// invited account so the manager can share them.
router.post('/:teamId/members', managerGuard, async (req, res) => {
  const { username, name, role, subsystem, password } = req.body || {}
  if (!username || !String(username).trim()) { res.status(400).json({ ok: false, error: 'usuário obrigatório' }); return }
  try {
    let member = await models.Member.findOne({ where: { username: String(username).trim() } })
    let createdCredentials = null
    if (!member) {
      // honor an explicit password, otherwise mint a one-time temporary
      // password returned to the manager (no hardcoded default credential).
      const pw = password && String(password).length >= 6 ? String(password) : randomBytes(6).toString('base64url')
      member = await models.Member.create({ username: String(username).trim(), name: (name || username).trim(), passhash: await hashPassword(pw) })
      createdCredentials = { username: member.username, password: pw }
    }
    const exists = await models.TeamMember.findOne({ where: { teamId: req.teamId, memberId: member.id } })
    if (exists) { res.status(409).json({ ok: false, error: 'já é membro da equipe' }); return }
    await models.TeamMember.create({
      teamId: req.teamId, memberId: member.id,
      role: role === 'manager' ? 'manager' : 'member',
      subsystem: subsystem || null,
    })
    res.json({ ok: true, members: await membersOf(req.teamId), createdCredentials })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// update a membership's role / subsystem
router.patch('/:teamId/members/:memberId', managerGuard, async (req, res) => {
  const { role, subsystem } = req.body || {}
  try {
    const tm = await models.TeamMember.findOne({ where: { teamId: req.teamId, memberId: Number(req.params.memberId) } })
    if (!tm) { res.status(404).json({ ok: false, error: 'membro não encontrado' }); return }
    if (role === 'manager' || role === 'member') tm.role = role
    if (subsystem !== undefined) tm.subsystem = subsystem || null
    await tm.save()
    res.json({ ok: true, members: await membersOf(req.teamId) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// remove a member (cannot remove the team owner)
router.delete('/:teamId/members/:memberId', managerGuard, async (req, res) => {
  try {
    const team = await models.Team.findByPk(req.teamId)
    if (team && team.ownerId === Number(req.params.memberId)) { res.status(400).json({ ok: false, error: 'não é possível remover o gestor dono da equipe' }); return }
    await models.TeamMember.destroy({ where: { teamId: req.teamId, memberId: Number(req.params.memberId) } })
    res.json({ ok: true, members: await membersOf(req.teamId) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
