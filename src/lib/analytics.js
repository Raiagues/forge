// ──────────────────────────────────────────────────────────────────
// Behavioural analytics for user-testing sessions.
//
// Two layers:
//   1. localStorage (always) — inspected in the dev Analytics view.
//   2. best-effort batched flush to the local backend, which appends
//      events to analytics/sessions/<sessionId>.jsonl on disk so a
//      testing day produces copyable files even across browser resets.
//
// Event shape (stable, inspected during testing):
//   { timestamp: ISO string, sessionId: UUID, eventName: string, payload: {} }
// sessionId is generated once per browser session (sessionStorage);
// resetSession() starts a fresh tester with a new id.
// The local log is capped at MAX_EVENTS (oldest discarded).
// ──────────────────────────────────────────────────────────────────

const KEY = 'forge_analytics'
const SID_KEY = 'forge_session_id'
const MAX_EVENTS = 2000
const SERVER = import.meta.env?.VITE_FLASH_SERVER || 'http://localhost:3001'
const FLUSH_MS = 3000

function uuid() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID() } catch { /* fall through */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function makeSessionId() {
  try {
    let id = sessionStorage.getItem(SID_KEY)
    if (!id) { id = uuid(); sessionStorage.setItem(SID_KEY, id) }
    return id
  } catch { return uuid() }
}

const SID = makeSessionId()

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}

let events = load()

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(events)) } catch { /* storage full/unavailable */ }
}

// ── server flush (file persistence for testing sessions) ──────────
// Best-effort: if the backend is down, localStorage remains the source
// of truth and the batch retries on the next flush.
let pending = []
let flushTimer = null

async function flushToServer() {
  flushTimer = null
  if (!pending.length) return
  const batch = pending
  pending = []
  try {
    await fetch(`${SERVER}/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SID, events: batch }),
    })
  } catch {
    pending = [...batch, ...pending].slice(-500)
  }
}

function scheduleFlush() {
  if (!flushTimer) flushTimer = setTimeout(flushToServer, FLUSH_MS)
}

// flush whatever is left when the tab closes / reloads
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (!pending.length) return
    try {
      navigator.sendBeacon?.(
        `${SERVER}/analytics/events`,
        new Blob([JSON.stringify({ sessionId: SID, events: pending })], { type: 'application/json' }),
      )
      pending = []
    } catch { /* best effort */ }
  })
}

export function track(eventName, payload = {}) {
  const event = { timestamp: new Date().toISOString(), sessionId: SID, eventName, payload }
  events.push(event)
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS)
  persist()
  pending.push(event)
  scheduleFlush()
}

export function getEvents() { return [...events] }
export function clearEvents() { events = []; persist() }
export function currentSession() { return SID }

// New tester, clean slate: flush remaining events, drop the session id
// and reload — sessionStorage mints a fresh id and the app state resets.
export async function resetSession() {
  track('session_reset')
  await flushToServer()
  try { sessionStorage.removeItem(SID_KEY) } catch { /* ignore */ }
  window.location.reload()
}

// Full event array, for the "Exportar JSON" download.
export function exportJSON() { return JSON.stringify(events, null, 2) }

// ── summarisation for the dev view ────────────────────────────────
const fmtMs = (ms) => {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

export function summarize(evts = events, { knownSections = [] } = {}) {
  const byType = {}
  const dwell = {}        // section -> total ms (from section_dwell events)
  const components = {}   // componentId -> count (component_add)
  const comingSoon = {}   // featureId -> count (coming_soon_click)
  const sessions = new Set()

  for (const e of evts) {
    sessions.add(e.sessionId)
    byType[e.eventName] = (byType[e.eventName] || 0) + 1
    const p = e.payload || {}
    if (e.eventName === 'section_dwell' && p.section != null) dwell[p.section] = (dwell[p.section] || 0) + (p.durationMs || 0)
    if (e.eventName === 'component_add' && p.componentId) components[p.componentId] = (components[p.componentId] || 0) + 1
    if (e.eventName === 'coming_soon_click' && p.featureId) comingSoon[p.featureId] = (comingSoon[p.featureId] || 0) + 1
  }

  const visited = new Set(Object.keys(dwell))
  const ignored = knownSections.filter((s) => !visited.has(s))
  const ts = evts.map((e) => new Date(e.timestamp).getTime()).filter((n) => !Number.isNaN(n))
  const span = ts.length ? { from: new Date(Math.min(...ts)), to: new Date(Math.max(...ts)) } : null

  return {
    total: evts.length,
    sessions: sessions.size,
    span,
    byType: Object.entries(byType).sort((a, b) => b[1] - a[1]),
    dwell: Object.entries(dwell).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, fmtMs(v), v]),
    topComponents: Object.entries(components).sort((a, b) => b[1] - a[1]),
    topComingSoon: Object.entries(comingSoon).sort((a, b) => b[1] - a[1]),
    ignored,
  }
}
