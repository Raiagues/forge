import { useMemo, useState } from 'react'
import useForge from '../../store/useForge'
import { OBJECTIVE_CATEGORIES_BY_ID } from '../../mission/index.js'
import { SEED_CHALLENGES, CHALLENGE_CATEGORIES, filterChallenges } from '../../mission/challenges.js'
import { ZONE_RECT, CARD_W, CARD_H } from '../../mission/brainstorm.js'
import { mono, slab, CREAM, GOLD } from '../onboarding/posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// ChallengeBoard — real-world problem briefing cards inside the mission
// exploration space (Prompt Part 2). Cards reflect real Brazilian
// contexts; clicking one grounds the student: it selects the matching
// objective category and seeds the brainstorming canvas with concrete,
// problem-specific cards. Filter by category + search; cards matching the
// already-selected objectives are highlighted. Vintage-briefing styling
// reuses the existing poster tokens — no new visual patterns.
// ──────────────────────────────────────────────────────────────────

const catLabel = (id) => OBJECTIVE_CATEGORIES_BY_ID[id]?.label || id

export default function ChallengeBoard() {
  const missionPlan = useForge(s => s.missionPlan)
  const challenges = useForge(s => s.challenges)        // backend-loaded; falls back to seeds
  const toggleObjectiveCategory = useForge(s => s.toggleObjectiveCategory)
  const addBrainstormCard = useForge(s => s.addBrainstormCard)

  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(null)

  const all = (challenges && challenges.length) ? challenges : SEED_CHALLENGES
  const cats = missionPlan.objectiveCategories || []
  const seededIds = useMemo(
    () => new Set((missionPlan.brainstorm?.cards || []).map(c => c.fromChallenge).filter(Boolean)),
    [missionPlan.brainstorm],
  )
  const list = useMemo(() => filterChallenges(all, { category, query }), [all, category, query])

  const seedFromChallenge = (c) => {
    if (!cats.includes(c.category)) toggleObjectiveCategory(c.category)
    if (seededIds.has(c.id)) return                       // already grounded → don't duplicate
    Object.entries(c.cards || {}).forEach(([zone, texts]) => {
      const r = ZONE_RECT[zone]; if (!r) return
      texts.forEach((text, i) => addBrainstormCard({
        zone, fromChallenge: c.id, text,
        x: r.x + 16 + (i % 2) * (CARD_W + 12),
        y: r.y + 150 + Math.floor(i / 2) * (CARD_H + 12),
      }))
    })
  }
  const onPick = (c) => {
    const opening = expanded !== c.id
    setExpanded(opening ? c.id : null)
    if (opening) seedFromChallenge(c)
  }

  return (
    <div style={{ flexShrink: 0, border: '1px solid var(--poster-line)', borderRadius: 'var(--r-lg)', background: 'var(--poster-card)', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9, flexWrap: 'wrap' }}>
        <span style={{ ...slab, fontSize: 15, fontWeight: 700, color: CREAM }}>Desafios reais</span>
        <span style={{ ...mono, fontSize: 10.5, color: 'var(--poster-fg-dim)' }}>problemas de organizações que o satélite pode atacar</span>
        <span style={{ flex: 1 }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="buscar…"
          style={{ width: 150, padding: '5px 9px', borderRadius: 6, border: '1px solid var(--poster-line)', background: 'var(--poster-input)', color: CREAM, ...mono, fontSize: 12 }} />
      </div>

      {/* category filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {['all', ...CHALLENGE_CATEGORIES].map(cid => {
          const active = category === cid
          return (
            <button key={cid} onClick={() => setCategory(cid)} style={{
              ...mono, fontSize: 10.5, letterSpacing: '.04em', padding: '4px 9px', borderRadius: 14, cursor: 'pointer',
              border: `1px solid ${active ? GOLD : 'var(--poster-line)'}`,
              background: active ? 'var(--poster-card-sel)' : 'transparent',
              color: active ? CREAM : 'var(--poster-fg-dim)',
            }}>{cid === 'all' ? 'todos' : catLabel(cid)}</button>
          )
        })}
      </div>

      {/* horizontal briefing-card strip */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {list.length === 0 && <div style={{ ...mono, fontSize: 12, color: 'var(--poster-fg-dim)', padding: '8px 2px' }}>nenhum desafio para este filtro.</div>}
        {list.map(c => {
          const isExp = expanded === c.id
          const relevant = cats.includes(c.category)         // matches a selected objective
          const seeded = seededIds.has(c.id)
          return (
            <button key={c.id} onClick={() => onPick(c)} style={{
              flexShrink: 0, width: isExp ? 380 : 250, textAlign: 'left', cursor: 'pointer',
              borderRadius: 'var(--r-md)', padding: '10px 11px',
              border: `1.5px solid ${relevant ? GOLD : 'var(--poster-line)'}`,
              background: relevant ? 'var(--poster-card-sel)' : 'var(--poster-card)',
              transition: 'width .18s', color: CREAM,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ ...slab, fontSize: 13.5, fontWeight: 700, lineHeight: 1.2, flex: 1 }}>{c.org}</span>
                {seeded && <span title="já semeado no canvas" style={{ ...mono, fontSize: 9, color: 'var(--ok2)' }}>✓</span>}
              </div>
              <div style={{ ...mono, fontSize: 10, letterSpacing: '.06em', color: GOLD, marginBottom: 6 }}>{c.location} · {catLabel(c.category)}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--poster-fg-dim)', display: isExp ? 'block' : '-webkit-box', WebkitLineClamp: isExp ? 'none' : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.problem}</div>
              {isExp && (
                <div style={{ marginTop: 8, ...mono, fontSize: 11, lineHeight: 1.6, color: 'var(--poster-fg-dim)' }}>
                  <div style={{ color: CREAM, marginBottom: 2 }}>custo do problema</div>
                  <div style={{ marginBottom: 6 }}>{c.cost}</div>
                  <div style={{ color: CREAM, marginBottom: 2 }}>o que uma solução vale</div>
                  <div>{c.value}</div>
                  <div style={{ marginTop: 8, color: 'var(--ok2)' }}>✦ canvas semeado com este desafio — edite à vontade</div>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
