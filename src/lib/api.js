// ──────────────────────────────────────────────────────────────────
// Backend client for the unified GuiaSat API (auth, teams, projects,
// tasks, events, metrics, reports, share).
//
// Graceful by design: GuiaSat ships as a static site on GitHub Pages with
// NO backend, so every call degrades to { ok:false, offline:true } when
// the server is unreachable. Callers treat the backend as optional — the
// platform stays fully usable single-user (consistent with the existing
// analytics/serial best-effort pattern). The token is kept in
// localStorage; the secret/JWT lives server-side only.
// ──────────────────────────────────────────────────────────────────

// Public API base URL (NOT a secret — a plain endpoint, so VITE_ is fine).
export const API_BASE = (import.meta.env?.VITE_FORGE_API || 'http://localhost:3001').replace(/\/$/, '')
export const WS_BASE = API_BASE.replace(/^http/, 'ws')

const TOKEN_KEY = 'forge_token'

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null } catch { return null }
}
export function setToken(token) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

// cached availability probe (re-checked on demand)
let availability = null
export async function checkAvailable() {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: 'GET' })
    availability = res.ok
  } catch {
    availability = false
  }
  return availability
}
export const isAvailable = () => availability

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) { const t = getToken(); if (t) headers.Authorization = `Bearer ${t}` }
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method, headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    availability = true
    let data = {}
    try { data = await res.json() } catch { /* non-JSON */ }
    if (!res.ok) return { ok: false, status: res.status, error: data.error || `HTTP ${res.status}`, ...data }
    return { ok: true, ...data }
  } catch {
    availability = false
    return { ok: false, offline: true, error: 'servidor indisponível' }
  }
}

export const api = {
  base: API_BASE,
  // auth
  register: (username, password, name) => request('/auth/register', { method: 'POST', auth: false, body: { username, password, name } }),
  login: (username, password) => request('/auth/login', { method: 'POST', auth: false, body: { username, password } }),
  me: () => request('/auth/me'),

  // teams
  listTeams: () => request('/teams'),
  createTeam: (name, institution) => request('/teams', { method: 'POST', body: { name, institution } }),
  addMember: (teamId, payload) => request(`/teams/${teamId}/members`, { method: 'POST', body: payload }),
  updateMember: (teamId, memberId, payload) => request(`/teams/${teamId}/members/${memberId}`, { method: 'PATCH', body: payload }),
  removeMember: (teamId, memberId) => request(`/teams/${teamId}/members/${memberId}`, { method: 'DELETE' }),

  // projects
  listProjects: () => request('/projects'),
  createProject: (teamId, name) => request('/projects', { method: 'POST', body: { teamId, name } }),
  loadProject: (id) => request(`/projects/${id}`),
  saveProject: (id, missionState, opts = {}) => request(`/projects/${id}`, { method: 'PUT', body: { missionState, ...opts } }),
  enableShare: (id) => request(`/projects/${id}/share`, { method: 'POST' }),
  disableShare: (id) => request(`/projects/${id}/share`, { method: 'DELETE' }),

  // tasks
  listTasks: (projectId) => request(`/tasks?projectId=${projectId}`),
  createTask: (payload) => request('/tasks', { method: 'POST', body: payload }),
  updateTask: (id, payload) => request(`/tasks/${id}`, { method: 'PATCH', body: payload }),
  deleteTask: (id, projectId) => request(`/tasks/${id}`, { method: 'DELETE', body: { projectId } }),

  // autonomy events
  sendEvents: (payload) => request('/events', { method: 'POST', body: payload }),

  // metrics (manager)
  metrics: (teamId) => request(`/metrics/${teamId}`),

  // phase reports
  listReports: (projectId) => request(`/reports?projectId=${projectId}`),
  fileReport: (payload) => request('/reports', { method: 'POST', body: payload }),

  // public share summary (no auth)
  share: (token) => request(`/share/${token}`, { auth: false }),
}
