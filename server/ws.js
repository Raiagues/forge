// ──────────────────────────────────────────────────────────────────
// Real-time collaboration + presence (IMPLEMENTATION_PLAN §4 item 11).
//
// A WebSocket server attached to the unified HTTP server. Clients connect
// with ?token=<jwt>&projectId=<id>; the server authenticates, tracks who
// is present per project, and fans out mission/hardware/task changes to
// every other member of the same project. Presence (who is online + their
// subsystem) is broadcast on join/leave so the top bar can show avatars.
//
// Routes call broadcastToProject() to push authoritative changes (a task
// moved, mission state saved) to collaborators without a refresh.
// ──────────────────────────────────────────────────────────────────
import { WebSocketServer } from 'ws'
import { verifyToken } from './auth/index.js'
import { models, dbReady } from './db/index.js'

// projectId -> Set<client>. Each client carries its identity.
const rooms = new Map()

function roomOf(projectId) {
  const key = String(projectId)
  if (!rooms.has(key)) rooms.set(key, new Set())
  return rooms.get(key)
}

function presenceList(projectId) {
  const seen = new Map()
  for (const c of roomOf(projectId)) {
    if (c.readyState !== c.OPEN) continue
    // de-dup by member so multiple tabs collapse into one avatar
    seen.set(c.identity.id, c.identity)
  }
  return [...seen.values()]
}

function send(client, msg) {
  try { client.send(JSON.stringify(msg)) } catch { /* dropped */ }
}

// Broadcast to everyone in a project (optionally excluding the origin).
export function broadcastToProject(projectId, type, data, exclude = null) {
  for (const c of roomOf(projectId)) {
    if (c === exclude || c.readyState !== c.OPEN) continue
    send(c, { type, data })
  }
}

function broadcastPresence(projectId) {
  broadcastToProject(projectId, 'presence', { members: presenceList(projectId) })
}

// Confirm the member actually belongs to the project's team before they
// can join the collaboration room.
async function authorize(memberId, projectId) {
  if (!dbReady()) return null
  const project = await models.Project.findByPk(projectId)
  if (!project) return null
  const tm = await models.TeamMember.findOne({ where: { teamId: project.teamId, memberId } })
  if (!tm) return null
  const member = await models.Member.findByPk(memberId)
  if (!member) return null
  return { project, role: tm.role, subsystem: tm.subsystem, member }
}

export function attachWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/collab' })

  wss.on('connection', async (ws, req) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      const token = url.searchParams.get('token')
      const projectId = url.searchParams.get('projectId')
      const claims = token && verifyToken(token)
      if (!claims || !projectId) { send(ws, { type: 'error', data: { error: 'token e projectId obrigatórios' } }); ws.close(); return }

      const auth = await authorize(claims.sub, projectId)
      if (!auth) { send(ws, { type: 'error', data: { error: 'sem acesso a este projeto' } }); ws.close(); return }

      ws.identity = {
        id: auth.member.id,
        username: auth.member.username,
        name: auth.member.name,
        role: auth.role,
        subsystem: auth.subsystem,
      }
      ws.projectId = String(projectId)
      roomOf(projectId).add(ws)

      send(ws, { type: 'welcome', data: { identity: ws.identity, members: presenceList(projectId) } })
      broadcastPresence(projectId)

      ws.on('message', async (raw) => {
        let msg
        try { msg = JSON.parse(raw.toString()) } catch { return }
        if (!msg || typeof msg.type !== 'string') return

        if (msg.type === 'mission_state') {
          // managers (and the assigned-subsystem members) push shared
          // design changes; persist + fan out to the rest of the room.
          if (ws.identity.role === 'manager' || msg.scoped) {
            try {
              const project = await models.Project.findByPk(ws.projectId)
              if (project) { project.missionState = msg.data; await project.save() }
            } catch { /* best-effort persistence */ }
          }
          broadcastToProject(ws.projectId, 'mission_state', { state: msg.data, by: ws.identity.username }, ws)
        } else if (msg.type === 'cursor' || msg.type === 'activity') {
          broadcastToProject(ws.projectId, msg.type, { ...msg.data, by: ws.identity }, ws)
        } else if (msg.type === 'ping') {
          send(ws, { type: 'pong', data: {} })
        }
      })

      ws.on('close', () => {
        roomOf(ws.projectId)?.delete(ws)
        broadcastPresence(ws.projectId)
      })
    } catch {
      try { ws.close() } catch { /* ignore */ }
    }
  })

  return wss
}
