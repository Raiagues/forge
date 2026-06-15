import { useMemo, useState } from 'react'
import useForge from '../../store/useForge'
import * as session from '../../lib/session.js'
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
  const user = useForge(s => s.auth.user)
  const toggleObjectiveCategory = useForge(s => s.toggleObjectiveCategory)
  const addBrainstormCard = useForge(s => s.addBrainstormCard)

  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [submitOpen, setSubmitOpen] = useState(false)

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
        <button onClick={() => setSubmitOpen(o => !o)} style={{
          ...mono, fontSize: 10.5, letterSpacing: '.04em', padding: '5px 11px', borderRadius: 14, cursor: 'pointer',
          border: `1px solid ${submitOpen ? GOLD : 'var(--poster-line)'}`, background: submitOpen ? 'var(--poster-card-sel)' : 'transparent', color: CREAM,
        }}>{submitOpen ? 'fechar' : '+ enviar desafio'}</button>
      </div>

      {submitOpen && <SubmitForm user={user} onDone={() => setSubmitOpen(false)} />}

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

// ── organisation submission form ───────────────────────────────────
// Any signed-in member submits a challenge on behalf of an organisation;
// it lands in the admin review queue (status=pending) and only appears on
// the public board once an admin approves it. Reuses the poster tokens.
const fieldStyle = {
  width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid var(--poster-line)',
  background: 'var(--poster-input)', color: CREAM, ...mono, fontSize: 12, outline: 'none', boxSizing: 'border-box',
}
const labelStyle = { ...mono, fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', display: 'block', marginBottom: 3 }

function Field({ label, children }) {
  return <label style={{ display: 'block' }}><span style={labelStyle}>{label}</span>{children}</label>
}

function SubmitForm({ user, onDone }) {
  const [form, setForm] = useState({ org: '', location: '', region: '', category: 'earth_obs', problem: '', cost: '', value: '', contact: '' })
  const [state, setState] = useState({ busy: false, error: null, done: false })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  if (!user) {
    return (
      <div style={{ border: '1px solid var(--poster-line)', borderRadius: 'var(--r-md)', background: 'var(--poster-card-sel)', padding: '12px 14px', marginBottom: 10 }}>
        <div style={{ ...mono, fontSize: 12, color: CREAM, lineHeight: 1.5 }}>Entre na sua conta para enviar um desafio da sua organização. As submissões passam por revisão antes de aparecer no quadro.</div>
      </div>
    )
  }

  if (state.done) {
    return (
      <div style={{ border: `1px solid ${GOLD}`, borderRadius: 'var(--r-md)', background: 'var(--poster-card-sel)', padding: '12px 14px', marginBottom: 10 }}>
        <div style={{ ...slab, fontSize: 13, fontWeight: 700, color: CREAM, marginBottom: 4 }}>Desafio enviado para revisão</div>
        <div style={{ ...mono, fontSize: 11.5, color: 'var(--poster-fg-dim)', lineHeight: 1.5 }}>Um administrador vai avaliar a submissão. Quando aprovada, ela aparece no quadro de desafios reais.</div>
        <button onClick={onDone} style={{ ...mono, fontSize: 11, marginTop: 8, padding: '5px 12px', borderRadius: 14, cursor: 'pointer', border: `1px solid ${GOLD}`, background: 'transparent', color: CREAM }}>concluir</button>
      </div>
    )
  }

  const submit = async () => {
    setState({ busy: true, error: null, done: false })
    const res = await session.submitChallenge(form)
    if (res.ok) { setState({ busy: false, error: null, done: true }) }
    else { setState({ busy: false, error: res.error || 'falha ao enviar', done: false }) }
  }

  return (
    <div style={{ border: '1px solid var(--poster-line)', borderRadius: 'var(--r-md)', background: 'var(--poster-card-sel)', padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ ...slab, fontSize: 13, fontWeight: 700, color: CREAM, marginBottom: 2 }}>Enviar desafio da sua organização</div>
      <div style={{ ...mono, fontSize: 10.5, color: 'var(--poster-fg-dim)', marginBottom: 10 }}>passa por revisão de um administrador antes de entrar no quadro</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 9 }}>
        <Field label="Organização *"><input value={form.org} onChange={set('org')} placeholder="ex.: Cooperativa agrícola — MT" style={fieldStyle} /></Field>
        <Field label="Categoria *">
          <select value={form.category} onChange={set('category')} style={fieldStyle}>
            {CHALLENGE_CATEGORIES.map(cid => <option key={cid} value={cid}>{catLabel(cid)}</option>)}
          </select>
        </Field>
        <Field label="Local"><input value={form.location} onChange={set('location')} placeholder="ex.: Sorriso, MT" style={fieldStyle} /></Field>
        <Field label="UF / região"><input value={form.region} onChange={set('region')} placeholder="ex.: MT" maxLength={4} style={fieldStyle} /></Field>
      </div>

      <div style={{ marginBottom: 9 }}>
        <Field label="Problema * (mín. 20 caracteres)"><textarea value={form.problem} onChange={set('problem')} rows={3} placeholder="Descreva o problema real que o satélite poderia atacar." style={{ ...fieldStyle, resize: 'vertical' }} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 9 }}>
        <Field label="Custo do problema"><textarea value={form.cost} onChange={set('cost')} rows={2} placeholder="Qual o impacto/custo de não resolver?" style={{ ...fieldStyle, resize: 'vertical' }} /></Field>
        <Field label="O que uma solução vale"><textarea value={form.value} onChange={set('value')} rows={2} placeholder="Que dado/produto resolveria?" style={{ ...fieldStyle, resize: 'vertical' }} /></Field>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Field label="Contato (opcional)"><input value={form.contact} onChange={set('contact')} placeholder="e-mail ou telefone para retorno" style={fieldStyle} /></Field>
      </div>

      {state.error && <div style={{ ...mono, fontSize: 11, color: 'var(--err2, #C04030)', marginBottom: 8 }}>{state.error}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={submit} disabled={state.busy} style={{
          ...slab, fontSize: 12.5, fontWeight: 700, padding: '7px 16px', borderRadius: 'var(--r-sm)', cursor: state.busy ? 'default' : 'pointer',
          border: 'none', background: 'var(--btn-bg)', color: 'var(--btn-fg)', opacity: state.busy ? 0.6 : 1,
        }}>{state.busy ? 'enviando…' : 'enviar para revisão'}</button>
        <button onClick={onDone} style={{ ...mono, fontSize: 11, padding: '7px 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer', border: '1px solid var(--poster-line)', background: 'transparent', color: 'var(--poster-fg-dim)' }}>cancelar</button>
      </div>
    </div>
  )
}
