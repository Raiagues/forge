import useForge from '../../store/useForge'
import { deadlineStatus, daysUntil } from '../../mission/tasks.js'
import { subsystemForSection } from '../../mission/roles.js'

// ──────────────────────────────────────────────────────────────────
// TaskHighlightStrip — cross-screen assigned-task highlighting.
//
// Each phase screen shows a thin collapsible strip at the top listing
// the current member's assigned tasks for that phase's subsystem,
// sorted mine-first then by deadline urgency. Tasks from all members
// are shown but the current user's are visually promoted (bold + left
// accent). Clicking a task navigates to the team panel.
//
// Rendered by every phase panel that has an owning subsystem
// (HardwareSection, SerialTest/FirmwarePanel, HardwareTestPanel).
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const DL_COLOR = { overdue: 'var(--err2)', soon: 'var(--warn2)', ok: 'var(--ink4)', none: 'var(--ink4)' }

// urgency sort: overdue first, then soon, then ok, then no deadline
const URGENCY = { overdue: 0, soon: 1, ok: 2, none: 3 }

export default function TaskHighlightStrip({ section }) {
  const user = useForge(s => s.auth.user)
  const tasks = useForge(s => s.tasks)
  const setSection = useForge(s => s.setSection)
  const subsystem = subsystemForSection(section)

  if (!user || !tasks.length || !subsystem) return null

  // tasks for this phase's subsystem, excluding done
  const phaseTasks = tasks.filter(t => t.subsystem === subsystem && t.state !== 'done')
  if (!phaseTasks.length) return null

  // sort: mine first, then by deadline urgency
  const sorted = [...phaseTasks].sort((a, b) => {
    const aMine = a.assigneeId === user.id ? 0 : 1
    const bMine = b.assigneeId === user.id ? 0 : 1
    if (aMine !== bMine) return aMine - bMine
    return (URGENCY[deadlineStatus(a)] ?? 3) - (URGENCY[deadlineStatus(b)] ?? 3)
  })

  const myCount = sorted.filter(t => t.assigneeId === user.id).length

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px',
      background: 'var(--paper2)', borderBottom: '1px solid var(--rule)',
      overflowX: 'auto', flexShrink: 0,
    }}>
      <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', whiteSpace: 'nowrap', flexShrink: 0 }}>
        suas tarefas{myCount > 0 ? ` (${myCount})` : ''}
      </span>
      {sorted.map(t => {
        const mine = t.assigneeId === user.id
        const dl = deadlineStatus(t)
        const days = daysUntil(t.deadline)
        return (
          <button key={t.id} onClick={() => setSection('team')}
            style={{
              ...mono, fontSize: 11, padding: '2px 8px', borderRadius: 5,
              border: mine ? '1.5px solid var(--navy)' : '1px solid var(--rule)',
              background: mine ? 'var(--paper)' : 'transparent',
              color: mine ? 'var(--ink)' : 'var(--ink3)',
              fontWeight: mine ? 700 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis',
            }}
            title={`${t.title}${t.deadline ? ` · ${t.deadline}` : ''}`}>
            {t.title}
            {t.deadline && (
              <span style={{ marginLeft: 4, fontSize: 9.5, color: DL_COLOR[dl] }}>
                {dl === 'overdue' ? `${-days}d⚠` : dl === 'soon' ? `${days}d` : ''}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
