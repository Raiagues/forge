// Task allocation — kanban + deadlines (IMPLEMENTATION_PLAN §4 item 10).
// Managers create/assign/delete any task; members may move/update tasks
// for their own assigned subsystem (role enforced server-side).
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

const STATES = ['backlog', 'doing', 'review', 'done']

async function projectCtx(req, res, next) {
  const projectId = Number(req.body?.projectId ?? req.query.projectId ?? req.task?.projectId)
  const project = await models.Project.findByPk(projectId)
  if (!project) { res.status(404).json({ ok: false, error: 'projeto não encontrado' }); return }
  const r = await teamRole(req.member.id, project.teamId)
  if (!r && !req.member.isAdmin) { res.status(403).json({ ok: false, error: 'sem acesso ao projeto' }); return }
  req.project = project
  req.role = r?.role || (req.member.isAdmin ? 'manager' : 'member')
  req.subsystem = r?.subsystem || null
  next()
}

const shape = (t) => ({
  id: t.id, projectId: t.projectId, title: t.title, description: t.description,
  state: t.state, subsystem: t.subsystem, assigneeId: t.assigneeId, deadline: t.deadline, order: t.order,
})

// list tasks for a project
router.get('/', projectCtx, async (req, res) => {
  const tasks = await models.Task.findAll({ where: { projectId: req.project.id }, order: [['order', 'ASC'], ['id', 'ASC']] })
  res.json({ ok: true, tasks: tasks.map(shape) })
})

// create a task (manager only)
router.post('/', projectCtx, async (req, res) => {
  if (req.role !== 'manager') { res.status(403).json({ ok: false, error: 'apenas o gestor cria tarefas' }); return }
  const { title, description, subsystem, assigneeId, deadline, state } = req.body || {}
  if (!title || !String(title).trim()) { res.status(400).json({ ok: false, error: 'título obrigatório' }); return }
  try {
    const count = await models.Task.count({ where: { projectId: req.project.id } })
    const task = await models.Task.create({
      projectId: req.project.id,
      title: String(title).trim(), description: description || null,
      subsystem: subsystem || null, assigneeId: assigneeId || null,
      deadline: deadline || null, state: STATES.includes(state) ? state : 'backlog',
      order: count,
    })
    broadcastToProject(req.project.id, 'task', { action: 'create', task: shape(task) })
    res.json({ ok: true, task: shape(task) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// load the task then its project context for member-scoped edits
async function loadTask(req, res, next) {
  const task = await models.Task.findByPk(Number(req.params.id))
  if (!task) { res.status(404).json({ ok: false, error: 'tarefa não encontrada' }); return }
  req.task = task
  projectCtx(req, res, next)
}

// members may only move/update tasks in their own subsystem; managers any
function canEditTask(req) {
  if (req.role === 'manager') return true
  // a member can update a task assigned to them or matching their subsystem
  if (req.task.assigneeId === req.member.id) return true
  if (req.subsystem && req.task.subsystem && req.subsystem === req.task.subsystem) return true
  return false
}

router.patch('/:id', loadTask, async (req, res) => {
  if (!canEditTask(req)) { res.status(403).json({ ok: false, error: 'sem permissão para editar esta tarefa' }); return }
  const { title, description, subsystem, assigneeId, deadline, state, order } = req.body || {}
  try {
    // members are limited to workflow fields; only managers re-scope a task
    if (req.role === 'manager') {
      if (title != null) req.task.title = String(title).trim()
      if (description !== undefined) req.task.description = description || null
      if (subsystem !== undefined) req.task.subsystem = subsystem || null
      if (assigneeId !== undefined) req.task.assigneeId = assigneeId || null
      if (deadline !== undefined) req.task.deadline = deadline || null
    }
    if (state && STATES.includes(state)) req.task.state = state
    if (order != null) req.task.order = Math.max(0, Math.round(order))
    await req.task.save()
    broadcastToProject(req.task.projectId, 'task', { action: 'update', task: shape(req.task) })
    res.json({ ok: true, task: shape(req.task) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.delete('/:id', loadTask, async (req, res) => {
  if (req.role !== 'manager') { res.status(403).json({ ok: false, error: 'apenas o gestor remove tarefas' }); return }
  try {
    const projectId = req.task.projectId
    const id = req.task.id
    await req.task.destroy()
    broadcastToProject(projectId, 'task', { action: 'delete', taskId: id })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
