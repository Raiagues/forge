// ──────────────────────────────────────────────────────────────────
// Schedule model (Prompt B Part 3/5) — PURE. Planned day-offsets per
// pipeline phase from the project start (day 0). Dependencies (PHASE_DEPS)
// constrain edits: a phase cannot start before every phase it requires
// has ended. Shared by the Gantt view and the pipeline timeline strip.
// ──────────────────────────────────────────────────────────────────
import { PHASE_IDS, PHASE_DEPS } from './phases.js'

export const DEFAULT_DUR = { mission: 7, hardware: 14, firmware: 14, testing: 14, telemetry: 7 }
export const DAY_MS = 86400000

// sequential default plan that respects the (linear) dependency order
export function defaultSchedule() {
  const out = {}
  let d = 0
  for (const id of PHASE_IDS) { const dur = DEFAULT_DUR[id] || 7; out[id] = [d, d + dur]; d += dur }
  return out
}

// merge stored phase dates over the defaults
export function resolveSchedule(schedule) {
  return { ...defaultSchedule(), ...(schedule?.phases || {}) }
}

// earliest day a phase may start = max end of its required upstream phases
export function earliestStart(id, plan) {
  const reqs = PHASE_DEPS[id] || []
  return reqs.reduce((m, r) => Math.max(m, plan[r] ? plan[r][1] : 0), 0)
}

// whole-day offset of an ISO timestamp from the project start
export function dayOffset(iso, startISO) {
  if (!iso || !startISO) return null
  return Math.round((new Date(iso) - new Date(startISO)) / DAY_MS)
}

// today's offset from the project start (clamped ≥ 0)
export function todayOffset(startISO) {
  if (!startISO) return 0
  return Math.max(0, Math.round((Date.now() - new Date(startISO)) / DAY_MS))
}

// schedule health for a phase: 'done' | 'late' | 'ahead' | 'ontrack' | 'future'
export function phaseScheduleState(id, plan, { confirmed, confirmedAt, startISO } = {}) {
  const [start, end] = plan[id] || [0, 0]
  const today = todayOffset(startISO)
  if (confirmed) {
    const actual = dayOffset(confirmedAt, startISO)
    return actual != null && actual <= end ? 'ahead' : 'done'
  }
  if (today > end) return 'late'
  if (today >= start) return 'ontrack'
  return 'future'
}
