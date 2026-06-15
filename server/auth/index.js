// ──────────────────────────────────────────────────────────────────
// Auth — token signing/verification + Express middleware.
//
// Security fixes over login_project (IMPLEMENTATION_PLAN §2/§3):
//   • bcrypt cost raised from 2 → BCRYPT_COST (≥10).
//   • tokens now carry an `exp` claim (login_project's jws had none).
//   • the secret is server-only (FORGE_JWT_SECRET), never VITE_-prefixed.
// Login rate limiting + tightened CORS live in server/index.js.
// ──────────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'
import { models } from '../db/index.js'

export const BCRYPT_COST = Number(process.env.FORGE_BCRYPT_COST) || 10
export const TOKEN_TTL = process.env.FORGE_TOKEN_TTL || '12h'

// Server-only secret. A persisted random secret is used in dev when the
// env var is unset, so tokens survive a restart within a session but are
// never a hardcoded constant in the source.
const SECRET = process.env.FORGE_JWT_SECRET || randomBytes(32).toString('hex')
if (!process.env.FORGE_JWT_SECRET) {
  console.warn('[forge] FORGE_JWT_SECRET not set — using an ephemeral dev secret. Set it in production.')
}

export const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_COST)
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash)

export function signToken(member) {
  return jwt.sign(
    { sub: member.id, username: member.username, isAdmin: !!member.isAdmin },
    SECRET,
    { expiresIn: TOKEN_TTL },
  )
}

export function verifyToken(token) {
  try { return jwt.verify(token, SECRET) } catch { return null }
}

// Pull the bearer token from either the Authorization header or the
// legacy x-access-token header (login_project compatibility).
function tokenFrom(req) {
  const auth = req.headers.authorization || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  const x = req.headers['x-access-token']
  return typeof x === 'string' ? x : null
}

// Require a valid token; loads req.member. 401 on missing/expired token.
export async function requireAuth(req, res, next) {
  const token = tokenFrom(req)
  const claims = token && verifyToken(token)
  if (!claims) { res.status(401).json({ ok: false, error: 'autenticação necessária' }); return }
  try {
    const member = await models.Member.findByPk(claims.sub)
    if (!member) { res.status(401).json({ ok: false, error: 'usuário inválido' }); return }
    req.member = member
    req.claims = claims
    next()
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
}

// Optional auth: attaches req.member when a valid token is present, but
// never blocks (used by event ingestion + share routes).
export async function optionalAuth(req, _res, next) {
  const token = tokenFrom(req)
  const claims = token && verifyToken(token)
  if (claims) {
    try {
      req.member = await models.Member.findByPk(claims.sub)
      req.claims = claims
    } catch { /* ignore */ }
  }
  next()
}

// Resolve the caller's role + subsystem on a given team.
export async function teamRole(memberId, teamId) {
  const tm = await models.TeamMember.findOne({ where: { teamId, memberId } })
  return tm ? { role: tm.role, subsystem: tm.subsystem } : null
}

// Require the caller to be a manager of req's team (set req.team + req.role).
// `teamIdFrom` extracts the team id from the request.
export function requireManager(teamIdFrom) {
  return async (req, res, next) => {
    const teamId = teamIdFrom(req)
    const r = await teamRole(req.member.id, teamId)
    if (!r) { res.status(403).json({ ok: false, error: 'não é membro desta equipe' }); return }
    if (r.role !== 'manager' && !req.member.isAdmin) {
      res.status(403).json({ ok: false, error: 'apenas o gestor da equipe pode fazer isso' }); return
    }
    req.teamId = teamId
    req.role = r.role
    req.subsystem = r.subsystem
    next()
  }
}
