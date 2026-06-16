import { useMemo, useState } from 'react'
import useForge from '../../store/useForge'
import { OBJECTIVE_CATEGORIES_BY_ID } from '../../mission/index.js'
import { SEED_CHALLENGES, CHALLENGE_CATEGORIES, filterChallenges } from '../../mission/challenges.js'
import { mono, slab, CREAM, GOLD } from '../onboarding/posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// ChallengeBoard — challenge selection IS the mission objective (Part 3).
// A full-width GRID of real-world problem cards using the platform's poster
// card tokens (no floating shadows / pastels). Multi-select writes straight
// to missionPlan.challenges; the objective categories + downstream
// constraints are derived from the chosen challenges. The brainstorming
// step (next) seeds its zones from this selection.
// ──────────────────────────────────────────────────────────────────

const catLabel = (id) => OBJECTIVE_CATEGORIES_BY_ID[id]?.label || id

export default function ChallengeBoard() {
  const missionPlan = useForge(s => s.missionPlan)
  const challenges = useForge(s => s.challenges)        // backend-loaded; falls back to seeds
  const toggleMissionChallenge = useForge(s => s.toggleMissionChallenge)

  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')

  const all = (challenges && challenges.length) ? challenges : SEED_CHALLENGES
  const selected = missionPlan.challenges || []
  const list = useMemo(() => filterChallenges(all, { category, query }), [all, category, query])

  const pill = (active) => ({
    ...mono, fontSize: 11, letterSpacing: '.04em', padding: '5px 12px', borderRadius: 16, cursor: 'pointer',
    border: `1px solid ${active ? GOLD : 'var(--poster-line)'}`,
    background: active ? 'var(--poster-card-sel)' : 'transparent',
    color: active ? CREAM : 'var(--poster-fg-dim)',
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ ...slab, fontSize: 22, fontWeight: 700, color: CREAM, margin: 0 }}>Escolha um desafio real</h2>
        <span style={{ ...mono, fontSize: 11.5, color: 'var(--poster-fg-dim)' }}>o objetivo da missão vem do desafio — selecione um ou mais</span>
      </div>

      {/* filters + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
        {['all', ...CHALLENGE_CATEGORIES].map(cid => (
          <button key={cid} onClick={() => setCategory(cid)} style={pill(category === cid)}>{cid === 'all' ? 'todos' : catLabel(cid)}</button>
        ))}
        <span style={{ flex: 1 }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="buscar…"
          style={{ width: 160, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--poster-line)', background: 'var(--poster-input)', color: CREAM, ...mono, fontSize: 12 }} />
      </div>

      {/* card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {list.length === 0 && <div style={{ ...mono, fontSize: 12.5, color: 'var(--poster-fg-dim)' }}>nenhum desafio para este filtro.</div>}
        {list.map(c => {
          const on = selected.includes(c.id)
          return (
            <button key={c.id} onClick={() => toggleMissionChallenge(c.id)} style={{
              textAlign: 'left', cursor: 'pointer', borderRadius: 'var(--r-lg)', padding: '14px 15px', color: CREAM,
              background: on ? 'var(--poster-card-sel)' : 'var(--poster-card)',
              border: `1.5px solid ${on ? GOLD : 'var(--poster-line)'}`,
              display: 'flex', flexDirection: 'column', gap: 8, minHeight: 150,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ ...slab, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, flex: 1 }}>{c.org}</span>
                <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${on ? GOLD : 'var(--poster-line)'}`, background: on ? GOLD : 'transparent', color: 'var(--poster-bg-solid)', fontSize: 11, fontWeight: 800 }}>{on ? '✓' : ''}</span>
              </div>
              <div style={{ ...mono, fontSize: 10, letterSpacing: '.05em', color: GOLD }}>{c.location} · {catLabel(c.category)}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--poster-fg-dim)', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.problem}</div>
            </button>
          )
        })}
      </div>

      {selected.length > 0 && (
        <div style={{ ...mono, fontSize: 11.5, color: 'var(--poster-fg-dim)', marginTop: 14 }}>
          {selected.length} desafio{selected.length > 1 ? 's' : ''} selecionado{selected.length > 1 ? 's' : ''} · objetivos: {(missionPlan.objectiveCategories || []).map(catLabel).join(' · ')}
        </div>
      )}
    </div>
  )
}

// compact read-only summary of the selected challenges, shown as a
// reference on later steps (Part 3).
export function SelectedChallengesSummary() {
  const missionPlan = useForge(s => s.missionPlan)
  const challenges = useForge(s => s.challenges)
  const all = (challenges && challenges.length) ? challenges : SEED_CHALLENGES
  const sel = (missionPlan.challenges || []).map(id => all.find(c => c.id === id)).filter(Boolean)
  if (sel.length === 0) return null
  return (
    <div style={{ border: '1px solid var(--poster-line)', borderRadius: 'var(--r-md)', background: 'var(--poster-card)', padding: '10px 12px' }}>
      <div style={{ ...mono, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', marginBottom: 7 }}>desafios escolhidos</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sel.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, flexShrink: 0, marginTop: 5 }} />
            <span style={{ fontSize: 12.5, color: CREAM, flex: 1 }}>{c.org}<span style={{ ...mono, fontSize: 10.5, color: 'var(--poster-fg-dim)' }}> · {c.location}</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}
