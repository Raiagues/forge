// ──────────────────────────────────────────────────────────────────
// Session orchestrator (IMPLEMENTATION_PLAN §4 items 9-14). Ties the REST
// client (api.js) + the WebSocket link (collab.js) to the Zustand store.
// Components call these thunks; the store itself stays network-free (no
// import cycles), mirroring how serialLink.js drives the fw* slice.
//
// Everything is best-effort: with no backend the calls return
// { offline:true } and the UI falls back to single-user mode.
// ──────────────────────────────────────────────────────────────────
import useForge from '../store/useForge'
import { api, getToken, setToken, checkAvailable } from './api.js'
import * as collab from './collab.js'
import { setEventSink, currentSession, track } from './analytics.js'

const store = () => useForge.getState()

// ── autonomy event forwarding (item 12) ────────────────────────────
// Batches analytics events to the backend /events table when signed in.
let queue = []
let timer = null
const AUTONOMY_EVENTS = new Set([
  'phase_complete', 'phase_review', 'phase_review_confirm',
  'assistant_ask', 'consult', 'copilot', 'suggestion_accepted', 'suggestion_rejected',
  'fix_applied', 'debug_session', 'component_add', 'component_remove',
  'wire', 'wire_auto', 'generate_architecture', 'hwtest_run', 'objective', 'framework',
  'nav_click', 'section_dwell', 'demo_mode', 'project_open',
])

function flushEvents() {
  timer = null
  if (!queue.length) return
  const s = store()
  if (!s.auth.user) { queue = []; return }
  const batch = queue.slice(0, 200)
  queue = queue.slice(200)
  api.sendEvents({
    sessionId: currentSession(),
    projectId: s.activeProjectId || undefined,
    teamId: s.activeTeamId || undefined,
    events: batch.map(e => ({ name: e.eventName, payload: e.payload, at: e.timestamp })),
  }).finally(() => { if (queue.length) scheduleFlush() })
}
function scheduleFlush() { if (!timer) timer = setTimeout(flushEvents, 4000) }

function installEventSink() {
  setEventSink((event) => {
    if (!store().auth.user) return
    if (!AUTONOMY_EVENTS.has(event.eventName)) return
    queue.push(event)
    if (queue.length > 500) queue = queue.slice(-500)
    scheduleFlush()
  })
}

// ── boot / restore ─────────────────────────────────────────────────
export async function bootSession() {
  await checkAvailable()
  installEventSink()
  const token = getToken()
  if (!token) { store().authChecked(); return }
  const res = await api.me()
  if (res.ok) {
    store().applyProfile(res.profile)
    await loadTeams()
    await loadProjects()
  } else {
    if (res.status === 401) setToken(null)
    store().authChecked()
  }
}

// ── auth ───────────────────────────────────────────────────────────
export async function login(username, password) {
  store().setAuthBusy(true)
  const res = await api.login(username, password)
  if (!res.ok) { store().setAuthError(res.offline ? 'servidor indisponível' : (res.error || 'falha no login')); return res }
  setToken(res.token)
  store().applyProfile(res.profile)
  await loadTeams()
  await loadProjects()
  return res
}

export async function register(username, password, name) {
  store().setAuthBusy(true)
  const res = await api.register(username, password, name)
  if (!res.ok) { store().setAuthError(res.offline ? 'servidor indisponível' : (res.error || 'falha no cadastro')); return res }
  setToken(res.token)
  store().applyProfile(res.profile)
  await loadTeams()
  await loadProjects()
  return res
}

export function logout() {
  collab.disconnect()
  setToken(null)
  store().logoutLocal()
}

// ── teams ──────────────────────────────────────────────────────────
export async function loadTeams() {
  const res = await api.listTeams()
  if (res.ok) store().setTeams(res.teams)
  return res
}
export async function createTeam(name, institution) {
  const res = await api.createTeam(name, institution)
  if (res.ok) await loadTeams()
  return res
}
export async function addTeamMember(teamId, payload) {
  const res = await api.addMember(teamId, payload)
  if (res.ok) await loadTeams()
  return res
}
export async function updateTeamMember(teamId, memberId, payload) {
  const res = await api.updateMember(teamId, memberId, payload)
  if (res.ok) await loadTeams()
  return res
}
export async function removeTeamMember(teamId, memberId) {
  const res = await api.removeMember(teamId, memberId)
  if (res.ok) await loadTeams()
  return res
}

// ── projects ───────────────────────────────────────────────────────
export async function loadProjects() {
  const res = await api.listProjects()
  if (res.ok) store().setProjects(res.projects)
  return res
}
export async function createProject(teamId, name) {
  const res = await api.createProject(teamId, name)
  if (res.ok) await loadProjects()
  return res
}

// open a project: hydrate the store, wire role gating, connect realtime
export async function openProject(id) {
  const res = await api.loadProject(id)
  if (!res.ok) return res
  store().hydrateShared(res.missionState || {})
  store().setActiveProject(id, res.role, res.subsystem)
  store().setDemoMode(!!res.project?.isDemo)
  await Promise.all([loadTasks(id), loadReports(id)])
  collab.connect(id)
  track('project_open', { project: String(id) })
  return res
}

// persist + broadcast the shared mission state (managers / scoped edits).
// broadcastOnly: realtime fan-out via WS (the server persists for managers/
// scoped members) — used by the debounced auto-sync. Falls back to the HTTP
// PUT when the socket is down so edits still persist.
export async function saveShared({ scoped = false, name, broadcastOnly = false } = {}) {
  const s = store()
  if (!s.activeProjectId) return { ok: false, error: 'nenhum projeto ativo' }
  const snapshot = s.snapshotShared()
  const sent = collab.pushMissionState(snapshot, { scoped })
  if (broadcastOnly && sent) return { ok: true, broadcast: true }
  return api.saveProject(s.activeProjectId, snapshot, { scoped, name })
}

// lightweight presence ping when the user navigates (item 11)
export function pushActivity(data) { collab.pushActivity(data) }

// ── tasks ──────────────────────────────────────────────────────────
export async function loadTasks(projectId = store().activeProjectId) {
  if (!projectId) return { ok: false }
  const res = await api.listTasks(projectId)
  if (res.ok) store().setTasks(res.tasks)
  return res
}
export async function createTask(payload) {
  const projectId = store().activeProjectId
  const res = await api.createTask({ projectId, ...payload })
  if (res.ok) store().upsertTask(res.task)
  return res
}
export async function updateTask(id, payload) {
  const projectId = store().activeProjectId
  const res = await api.updateTask(id, { projectId, ...payload })
  if (res.ok) store().upsertTask(res.task)
  return res
}
export async function deleteTask(id) {
  const projectId = store().activeProjectId
  const res = await api.deleteTask(id, projectId)
  if (res.ok) store().removeTask(id)
  return res
}

// ── reports (item 14 / A7) ─────────────────────────────────────────
export async function loadReports(projectId = store().activeProjectId) {
  if (!projectId) return { ok: false }
  const res = await api.listReports(projectId)
  if (res.ok) store().setReports(res.reports)
  return res
}
export async function fileReport(payload) {
  const projectId = store().activeProjectId
  if (!projectId) return { ok: false }
  const res = await api.fileReport({ projectId, ...payload })
  if (res.ok) store().addReport(res.report)
  return res
}

// ── metrics (item 12) ──────────────────────────────────────────────
export async function loadMetrics(teamId = store().activeTeamId) {
  if (!teamId) return { ok: false }
  const res = await api.metrics(teamId)
  if (res.ok) store().setMetrics(res)
  return res
}

// ── share (item 14) ────────────────────────────────────────────────
export async function enableShare(id = store().activeProjectId) {
  const res = await api.enableShare(id)
  if (res.ok) await loadProjects()
  return res
}
export async function disableShare(id = store().activeProjectId) {
  const res = await api.disableShare(id)
  if (res.ok) await loadProjects()
  return res
}
