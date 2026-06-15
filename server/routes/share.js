// Public read-only mission summary (IMPLEMENTATION_PLAN §4 item 14).
// No auth: a project's manager enables a share token (POST /projects/:id/share)
// and anyone with the link gets a sanitized snapshot — mission overview,
// hardware list, schedule and phase reports. No editing, no PII beyond
// names already on the mission, no credentials.
import { Router } from 'express'
import { models, dbReady } from '../db/index.js'

const router = Router()
router.use((req, res, next) => {
  if (!dbReady()) { res.status(503).json({ ok: false, error: 'banco de dados indisponível' }); return }
  next()
})

router.get('/:token', async (req, res) => {
  try {
    const project = await models.Project.findOne({ where: { shareToken: req.params.token } })
    if (!project) { res.status(404).json({ ok: false, error: 'resumo não encontrado ou compartilhamento desativado' }); return }
    const team = await models.Team.findByPk(project.teamId)
    const reports = await models.PhaseReport.findAll({ where: { projectId: project.id }, order: [['createdAt', 'ASC']] })
    const tasks = await models.Task.findAll({ where: { projectId: project.id } })
    const ms = project.missionState || {}
    const plan = ms.missionPlan || {}
    // sanitize: expose only the public mission picture
    res.json({
      ok: true,
      summary: {
        project: { name: project.name, isDemo: !!project.isDemo, updatedAt: project.updatedAt },
        team: team ? { name: team.name, institution: team.institution } : null,
        mission: {
          name: plan.name || project.name,
          framework: plan.frameworkId || null,
          cubeU: plan.cubeU || null,
          objectives: plan.objectiveCategories || plan.objectives || [],
          budgetBRL: plan.budgetBRL ?? null,
          environment: plan.environment || null,
          components: plan.components || ms.components || [],
        },
        schedule: ms.schedule || null,
        phaseState: ms.phaseState || null,
        reports: reports.map(r => ({ phaseId: r.phaseId, summary: r.summary, criteria: r.criteria, confirmedAt: r.confirmedAt, authorName: r.authorName })),
        taskStats: {
          total: tasks.length,
          done: tasks.filter(t => t.state === 'done').length,
          byState: tasks.reduce((a, t) => { a[t.state] = (a[t.state] || 0) + 1; return a }, {}),
        },
      },
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
