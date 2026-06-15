// ──────────────────────────────────────────────────────────────────
// Autonomy metrics (IMPLEMENTATION_PLAN §4 item 12). PURE: turns the raw
// instrumentation events (from /metrics) into the manager dashboard's
// funnel + autonomy index. No store/UI imports.
//
// Funnel — how far teams get through the build pipeline (mission →
// hardware → firmware → testing → telemetry), counted by distinct
// sessions that confirmed each phase.
//
// Autonomy index — how independently students work: self-driven actions
// vs. assisted ones (AI tutor / consultant / copilot / accepted fixes). A
// higher index means the team is driving the engineering themselves.
// ──────────────────────────────────────────────────────────────────
import { PHASES } from './phases.js'

// events that indicate the user leaned on assistance
const ASSISTED = new Set([
  'assistant_ask', 'assistant_answer', 'assistant_local_enable',
  'consult', 'consult_result', 'copilot',
  'suggestion_accepted', 'fix_applied', 'debug_session', 'debug_result',
])
// events that indicate independent engineering work
const SELF_DRIVEN = new Set([
  'component_add', 'component_remove', 'component_rotate', 'component_flip',
  'wire', 'wire_auto', 'wire_remove', 'wire_clear',
  'objective', 'framework', 'format', 'cube_u', 'template_load',
  'hwtest_run', 'hwtest_select', 'generate_architecture',
  'phase_complete', 'mission_draft_save', 'brainstorm', 'scan', 'fw_edit',
])

const FUNNEL_PHASES = PHASES.map(p => ({ id: p.id, label: p.label }))

function sessionKey(e) { return e.sessionId || `member-${e.memberId || 'anon'}` }

export function computeMetrics(events = []) {
  const sessions = new Map() // key -> { key, memberId, phases:Set, self, assisted, first, last, events }
  const byPhaseSessions = Object.fromEntries(FUNNEL_PHASES.map(p => [p.id, new Set()]))
  const byMember = new Map() // memberId -> { self, assisted, sessions:Set, phases:Set }
  const dwell = {} // section -> ms

  for (const e of events) {
    const k = sessionKey(e)
    if (!sessions.has(k)) sessions.set(k, { key: k, memberId: e.memberId ?? null, phases: new Set(), self: 0, assisted: 0, first: e.at, last: e.at, count: 0 })
    const s = sessions.get(k)
    s.count++
    if (e.at && (!s.first || e.at < s.first)) s.first = e.at
    if (e.at && (!s.last || e.at > s.last)) s.last = e.at

    const mk = e.memberId ?? 'anon'
    if (!byMember.has(mk)) byMember.set(mk, { memberId: e.memberId ?? null, self: 0, assisted: 0, sessions: new Set(), phases: new Set() })
    const m = byMember.get(mk)
    m.sessions.add(k)

    if (ASSISTED.has(e.name)) { s.assisted++; m.assisted++ }
    else if (SELF_DRIVEN.has(e.name)) { s.self++; m.self++ }

    if (e.name === 'phase_complete') {
      const ph = e.payload?.target
      if (ph && byPhaseSessions[ph]) { byPhaseSessions[ph].add(k); s.phases.add(ph); m.phases.add(ph) }
    }
    if (e.name === 'section_dwell' && e.payload?.section != null) {
      dwell[e.payload.section] = (dwell[e.payload.section] || 0) + (e.payload.durationMs || 0)
    }
  }

  const totalSessions = sessions.size || 0
  const funnel = FUNNEL_PHASES.map((p, i) => {
    const count = byPhaseSessions[p.id].size
    const prev = i === 0 ? totalSessions : byPhaseSessions[FUNNEL_PHASES[i - 1].id].size
    return { id: p.id, label: p.label, count, ofTotal: totalSessions ? Math.round((count / totalSessions) * 100) : 0, conversion: prev ? Math.round((count / prev) * 100) : 0 }
  })

  let self = 0, assisted = 0
  for (const s of sessions.values()) { self += s.self; assisted += s.assisted }
  const autonomyIndex = (self + assisted) ? Math.round((self / (self + assisted)) * 100) : null

  const members = [...byMember.values()].map(m => ({
    memberId: m.memberId,
    self: m.self,
    assisted: m.assisted,
    sessions: m.sessions.size,
    phasesDone: m.phases.size,
    autonomy: (m.self + m.assisted) ? Math.round((m.self / (m.self + m.assisted)) * 100) : null,
  }))

  return {
    totalSessions,
    totalEvents: events.length,
    funnel,
    autonomy: { index: autonomyIndex, self, assisted },
    members,
    dwell,
    completedAll: byPhaseSessions[FUNNEL_PHASES[FUNNEL_PHASES.length - 1].id].size,
  }
}
