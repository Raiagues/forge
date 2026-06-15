// ──────────────────────────────────────────────────────────────────
// Task / kanban model (IMPLEMENTATION_PLAN §4 item 10). PURE helpers for
// the team kanban board + deadline overlays. No store/UI imports.
// ──────────────────────────────────────────────────────────────────

export const TASK_STATES = [
  { id: 'backlog', label: 'A fazer' },
  { id: 'doing', label: 'Em andamento' },
  { id: 'review', label: 'Revisão' },
  { id: 'done', label: 'Concluído' },
]
export const TASK_STATE_IDS = TASK_STATES.map(s => s.id)

export function groupByState(tasks = []) {
  const out = Object.fromEntries(TASK_STATE_IDS.map(id => [id, []]))
  for (const t of tasks) (out[t.state] || out.backlog).push(t)
  for (const id of TASK_STATE_IDS) out[id].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id)
  return out
}

export const nextState = (id) => TASK_STATE_IDS[Math.min(TASK_STATE_IDS.length - 1, TASK_STATE_IDS.indexOf(id) + 1)]
export const prevState = (id) => TASK_STATE_IDS[Math.max(0, TASK_STATE_IDS.indexOf(id) - 1)]

// whole-day difference between a YYYY-MM-DD deadline and today
export function daysUntil(deadline, now = Date.now()) {
  if (!deadline) return null
  const d = new Date(deadline + 'T00:00:00')
  if (Number.isNaN(+d)) return null
  return Math.round((d - new Date(new Date(now).toDateString())) / 86400000)
}

// deadline health for an open task: 'overdue' | 'soon' | 'ok' | 'none'.
// Done tasks never warn.
export function deadlineStatus(task, now = Date.now()) {
  if (!task?.deadline) return 'none'
  if (task.state === 'done') return 'ok'
  const d = daysUntil(task.deadline, now)
  if (d == null) return 'none'
  if (d < 0) return 'overdue'
  if (d <= 3) return 'soon'
  return 'ok'
}

// progress summary for a project's task set
export function taskStats(tasks = []) {
  const byState = Object.fromEntries(TASK_STATE_IDS.map(id => [id, 0]))
  let overdue = 0
  for (const t of tasks) {
    byState[t.state] = (byState[t.state] || 0) + 1
    if (deadlineStatus(t) === 'overdue') overdue++
  }
  const total = tasks.length
  const done = byState.done || 0
  return { total, done, overdue, byState, pct: total ? Math.round((done / total) * 100) : 0 }
}
