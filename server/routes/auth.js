// Auth routes — register / login / me. Login rate limiting is applied in
// server/index.js. Security fixes (bcrypt cost, token expiry) live in
// server/auth/index.js.
import { Router } from 'express'
import { models, dbReady } from '../db/index.js'
import { hashPassword, verifyPassword, signToken, requireAuth } from '../auth/index.js'
import { profileFor } from './profile.js'

const router = Router()

// Guard every DB-backed route when the sqlite driver is unavailable.
router.use((req, res, next) => {
  if (!dbReady()) { res.status(503).json({ ok: false, error: 'banco de dados indisponível' }); return }
  next()
})

const USERNAME_RE = /^[\w.-]{3,32}$/

router.post('/register', async (req, res) => {
  const { username, password, name } = req.body || {}
  if (!USERNAME_RE.test(username || '')) { res.status(400).json({ ok: false, error: 'usuário inválido (3–32 caracteres)' }); return }
  if (!password || String(password).length < 6) { res.status(400).json({ ok: false, error: 'senha muito curta (mínimo 6)' }); return }
  try {
    const exists = await models.Member.findOne({ where: { username } })
    if (exists) { res.status(409).json({ ok: false, error: 'usuário já existe' }); return }
    const member = await models.Member.create({
      username,
      name: (name || username).trim(),
      passhash: await hashPassword(String(password)),
    })
    const token = signToken(member)
    res.json({ ok: true, token, profile: await profileFor(member) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) { res.status(400).json({ ok: false, error: 'usuário e senha obrigatórios' }); return }
  try {
    const member = await models.Member.findOne({ where: { username } })
    // constant-ish path: always run a compare to avoid trivial user enumeration
    const ok = member ? await verifyPassword(String(password), member.passhash) : false
    if (!member || !ok) { res.status(401).json({ ok: false, error: 'usuário ou senha inválidos' }); return }
    const token = signToken(member)
    res.json({ ok: true, token, profile: await profileFor(member) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  res.json({ ok: true, profile: await profileFor(req.member) })
})

export default router
