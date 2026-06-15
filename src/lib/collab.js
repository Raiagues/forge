// ──────────────────────────────────────────────────────────────────
// Collaboration link — a module-level SINGLETON WebSocket to the unified
// server's /collab endpoint (IMPLEMENTATION_PLAN §4 item 11). Like
// serialLink.js it lives outside React: panels mount/unmount while the
// link, presence and incoming changes survive. Parsed messages are
// written into the Zustand store via collab* actions so every view stays
// a pure function of state.
//
// Graceful: if there is no backend (static demo) connect() is a silent
// no-op and the app runs single-user.
// ──────────────────────────────────────────────────────────────────
import useForge from '../store/useForge'
import { WS_BASE, getToken } from './api.js'

let ws = null
let projectId = null
let reconnectTimer = null
let manualClose = false

const store = () => useForge.getState()
export const isConnected = () => !!ws && ws.readyState === WebSocket.OPEN

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)) } catch { /* dropped */ }
    return true
  }
  return false
}

export function connect(pid) {
  const token = getToken()
  if (!token || !pid) return
  if (ws && projectId === String(pid)) return
  disconnect(true)
  projectId = String(pid)
  manualClose = false
  let socket
  try { socket = new WebSocket(`${WS_BASE}/collab?token=${encodeURIComponent(token)}&projectId=${encodeURIComponent(pid)}`) }
  catch { return }
  ws = socket

  socket.onopen = () => { store().collabSetStatus(true) }
  socket.onmessage = (ev) => {
    let msg
    try { msg = JSON.parse(ev.data) } catch { return }
    const { type, data } = msg || {}
    if (type === 'welcome') store().collabWelcome(data)
    else if (type === 'presence') store().collabPresence(data.members || [])
    else if (type === 'mission_state') store().collabMissionState(data.state, data.by)
    else if (type === 'task') store().collabTask(data)
    else if (type === 'report') store().collabReport(data.report)
    else if (type === 'activity') store().collabActivity(data)
    else if (type === 'error') store().collabSetStatus(false, data?.error)
  }
  socket.onclose = () => {
    store().collabSetStatus(false)
    if (ws === socket) ws = null
    if (!manualClose && projectId) {
      reconnectTimer = setTimeout(() => connect(projectId), 4000)
    }
  }
  socket.onerror = () => { /* close handler reconnects */ }
}

export function disconnect(silent = false) {
  manualClose = true
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  const sock = ws
  ws = null
  if (!silent) projectId = null
  try { sock?.close() } catch { /* ignore */ }
  if (!silent) store().collabSetStatus(false)
}

// push the shared mission state to collaborators (managers / scoped edits)
export function pushMissionState(state, { scoped = false } = {}) {
  return send({ type: 'mission_state', data: state, scoped })
}

// broadcast a lightweight activity/cursor ping (presence liveliness)
export function pushActivity(data) {
  return send({ type: 'activity', data })
}
