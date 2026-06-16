// ──────────────────────────────────────────────────────────────────
// Weekly team-availability model — PURE helpers for the per-member
// recurring free/blocked hours overlay, superimposed on one weekly grid.
// No store/UI imports. Works client-side with the team roster stored in
// the Zustand store; the backend can later persist/sync via the same
// session thunk pattern (session.js).
// ──────────────────────────────────────────────────────────────────

export const DAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
export const DAY_LABELS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
export const HOURS_START = 7
export const HOURS_END = 23
export const HOUR_COUNT = HOURS_END - HOURS_START

// slot key: "seg-9" = Monday 9:00–10:00
export const slotKey = (day, hour) => `${day}-${hour}`
export const parseSlotKey = (key) => {
  const [day, h] = key.split('-')
  return { day, hour: Number(h) }
}

// types: 'free' (available, green) or 'blocked' (unavailable, red)
export const SLOT_TYPES = { FREE: 'free', BLOCKED: 'blocked' }

// default empty schedule for a member
export function emptySchedule() {
  return {} // slotKey → 'free' | 'blocked'
}

// toggle a slot for a member: cycles free → blocked → off (removed)
export function cycleSlot(schedule, key) {
  const cur = schedule[key]
  if (!cur) return { ...schedule, [key]: SLOT_TYPES.FREE }
  if (cur === SLOT_TYPES.FREE) return { ...schedule, [key]: SLOT_TYPES.BLOCKED }
  const next = { ...schedule }
  delete next[key]
  return next
}

// set a range of slots (drag-paint)
export function setSlots(schedule, keys, type) {
  const next = { ...schedule }
  for (const k of keys) {
    if (type) next[k] = type
    else delete next[k]
  }
  return next
}

// superimpose all members' schedules into a grid of arrays:
// slotKey → [{ memberId, name, type }]
export function superimpose(members, schedules) {
  const grid = {}
  for (const m of members) {
    const sched = schedules[m.memberId] || {}
    for (const [key, type] of Object.entries(sched)) {
      if (!grid[key]) grid[key] = []
      grid[key].push({ memberId: m.memberId, name: m.name || m.username, type })
    }
  }
  return grid
}

// per-slot summary: { free: N, blocked: N, total: N }
export function slotSummary(entries) {
  if (!entries?.length) return { free: 0, blocked: 0, total: 0 }
  let free = 0, blocked = 0
  for (const e of entries) {
    if (e.type === SLOT_TYPES.FREE) free++
    else blocked++
  }
  return { free, blocked, total: entries.length }
}

// member colors for overlay (deterministic from memberId)
const PALETTE = [
  '#3A7CA5', '#D97706', '#7C3AED', '#059669', '#DC2626',
  '#2563EB', '#CA8A04', '#9333EA', '#0D9488', '#E11D48',
]
export function memberColor(memberId, idx) {
  return PALETTE[(idx ?? memberId) % PALETTE.length]
}
