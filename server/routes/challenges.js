// ──────────────────────────────────────────────────────────────────
// Real-world challenges — organisation submission + admin review queue +
// anonymized market-intelligence aggregates.
//
//   • GET  /challenges                 → approved challenges (PUBLIC; feeds
//                                         store.challenges via setChallenges)
//   • POST /challenges                 → an org member submits a challenge
//                                         (status=pending, isSeed=false)
//   • GET  /challenges/mine            → the caller's own submissions
//   • GET  /challenges/review          → full moderation queue (ADMIN)
//   • POST /challenges/:id/review      → approve / reject (ADMIN)
//   • GET  /challenges/intelligence    → anonymized aggregates (ADMIN):
//                                         category/region heat + timeline
//
// Reuses the existing auth (requireAuth) and platform-admin guard
// (requireAdmin). DB-backed; returns 503 when sqlite is unavailable so
// the frontend falls back to the bundled SEED_CHALLENGES.
// ──────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { models, dbReady } from '../db/index.js'
import { requireAuth, requireAdmin } from '../auth/index.js'

const router = Router()

const dbGuard = (req, res, next) => {
  if (!dbReady()) { res.status(503).json({ ok: false, error: 'banco de dados indisponível' }); return }
  next()
}

// Public shape — mirrors SEED_CHALLENGES so the ChallengeBoard renders
// backend and bundled challenges identically. No submitter/PII fields.
const publicShape = (c) => ({
  id: c.slug, org: c.org, location: c.location, region: c.region,
  category: c.category, problem: c.problem, cost: c.cost, value: c.value,
  cards: c.cards || {}, seed: !!c.isSeed,
})

// Admin/owner shape — adds moderation + submitter metadata.
const adminShape = (c) => ({
  id: c.id, slug: c.slug, org: c.org, location: c.location, region: c.region,
  category: c.category, problem: c.problem, cost: c.cost, value: c.value,
  cards: c.cards || {}, status: c.status, isSeed: !!c.isSeed,
  submitterId: c.submitterId, submitterName: c.submitterName, contact: c.contact,
  reviewNote: c.reviewNote, reviewedAt: c.reviewedAt,
  createdAt: c.createdAt, updatedAt: c.updatedAt,
})

const slugify = (s) => String(s || '')
  .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)

// ── public: approved challenges for the board / store ──────────────
router.get('/', dbGuard, async (_req, res) => {
  try {
    const rows = await models.Challenge.findAll({
      where: { status: 'approved' },
      order: [['isSeed', 'DESC'], ['createdAt', 'ASC']],
    })
    res.json({ ok: true, challenges: rows.map(publicShape) })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// ── submit a challenge (any signed-in member) → pending ────────────
router.post('/', dbGuard, requireAuth, async (req, res) => {
  const { org, location, region, category, problem, cost, value, contact, cards } = req.body || {}
  if (!org || !String(org).trim()) { res.status(400).json({ ok: false, error: 'organização obrigatória' }); return }
  if (!category || !String(category).trim()) { res.status(400).json({ ok: false, error: 'categoria obrigatória' }); return }
  if (!problem || String(problem).trim().length < 20) { res.status(400).json({ ok: false, error: 'descreva o problema (mín. 20 caracteres)' }); return }
  try {
    const slug = `${slugify(org) || 'desafio'}-${randomBytes(3).toString('hex')}`
    const challenge = await models.Challenge.create({
      slug,
      org: String(org).trim(),
      location: location ? String(location).trim() : null,
      region: region ? String(region).trim().toUpperCase().slice(0, 4) : null,
      category: String(category).trim(),
      problem: String(problem).trim(),
      cost: cost ? String(cost).trim() : null,
      value: value ? String(value).trim() : null,
      contact: contact ? String(contact).trim() : null,
      cards: cards && typeof cards === 'object' ? cards : {},
      status: 'pending',
      isSeed: false,
      submitterId: req.member.id,
      submitterName: req.member.name || req.member.username,
    })
    res.json({ ok: true, challenge: adminShape(challenge) })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// ── the caller's own submissions (track review status) ─────────────
router.get('/mine', dbGuard, requireAuth, async (req, res) => {
  try {
    const rows = await models.Challenge.findAll({
      where: { submitterId: req.member.id },
      order: [['createdAt', 'DESC']],
    })
    res.json({ ok: true, challenges: rows.map(adminShape) })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// ── admin: moderation queue (optionally filtered by status) ────────
router.get('/review', dbGuard, requireAuth, requireAdmin, async (req, res) => {
  const status = String(req.query.status || '')
  const where = ['pending', 'approved', 'rejected'].includes(status) ? { status } : {}
  try {
    const rows = await models.Challenge.findAll({ where, order: [['createdAt', 'DESC']] })
    const counts = { pending: 0, approved: 0, rejected: 0 }
    for (const c of await models.Challenge.findAll({ attributes: ['status'] })) {
      counts[c.status] = (counts[c.status] || 0) + 1
    }
    res.json({ ok: true, challenges: rows.map(adminShape), counts })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// ── admin: approve / reject a submission ───────────────────────────
router.post('/:id/review', dbGuard, requireAuth, requireAdmin, async (req, res) => {
  const { decision, note } = req.body || {}
  if (!['approved', 'rejected', 'pending'].includes(decision)) { res.status(400).json({ ok: false, error: 'decisão inválida' }); return }
  try {
    const challenge = await models.Challenge.findByPk(Number(req.params.id))
    if (!challenge) { res.status(404).json({ ok: false, error: 'desafio não encontrado' }); return }
    if (challenge.isSeed) { res.status(400).json({ ok: false, error: 'desafios semente não passam por moderação' }); return }
    challenge.status = decision
    challenge.reviewNote = note ? String(note).trim() : null
    challenge.reviewerId = req.member.id
    challenge.reviewedAt = new Date()
    await challenge.save()
    res.json({ ok: true, challenge: adminShape(challenge) })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// ── admin: anonymized market-intelligence aggregates ───────────────
// Demand signal across organisation submissions (isSeed=false). No org
// names, submitter identity or contact details are returned — only counts
// by category, region, a category×region heat matrix and a monthly
// timeline.
router.get('/intelligence', dbGuard, requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = await models.Challenge.findAll({ where: { isSeed: false } })
    const counts = { pending: 0, approved: 0, rejected: 0 }
    const byCat = new Map()
    const byRegion = new Map()
    const heat = new Map()       // `${category}|${region}` → count
    const timeline = new Map()   // 'YYYY-MM' → { total, approved }

    const bump = (map, key) => {
      const k = key || '—'
      const cur = map.get(k) || { key: k, total: 0, pending: 0, approved: 0, rejected: 0 }
      return cur
    }

    for (const c of rows) {
      counts[c.status] = (counts[c.status] || 0) + 1

      const cat = bump(byCat, c.category)
      cat.total++; cat[c.status] = (cat[c.status] || 0) + 1; byCat.set(cat.key, cat)

      const reg = bump(byRegion, c.region)
      reg.total++; reg[c.status] = (reg[c.status] || 0) + 1; byRegion.set(reg.key, reg)

      const hk = `${c.category || '—'}|${c.region || '—'}`
      heat.set(hk, (heat.get(hk) || 0) + 1)

      const month = (c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt)).toISOString().slice(0, 7)
      const tl = timeline.get(month) || { month, total: 0, approved: 0 }
      tl.total++; if (c.status === 'approved') tl.approved++
      timeline.set(month, tl)
    }

    res.json({
      ok: true,
      total: rows.length,
      counts,
      byCategory: [...byCat.values()].sort((a, b) => b.total - a.total),
      byRegion: [...byRegion.values()].sort((a, b) => b.total - a.total),
      heat: [...heat.entries()].map(([k, count]) => {
        const [category, region] = k.split('|')
        return { category, region, count }
      }).sort((a, b) => b.count - a.count),
      timeline: [...timeline.values()].sort((a, b) => a.month.localeCompare(b.month)),
    })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

export default router
