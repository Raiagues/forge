import { useState } from 'react'
import useForge from '../../store/useForge'
import { suggestForZone } from '../../mission/brainstorm.js'
import { mono, CREAM, GOLD } from '../onboarding/posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// MissionBrainstorm — calm, scannable ideation (Prompts: brainstorm v2/v3).
//
// Judgment call on zone count: five abstract zones overwhelm students with
// no structured-brainstorming background, so we merge "Restrições técnicas"
// + "Modos de falha" into a single "Riscos e restrições" column (each card
// tagged risco/restrição by its underlying zone) → FOUR columns total:
// Objetivos (read-only, from the chosen challenges) · Riscos e restrições ·
// Perguntas em aberto · Ideias. Trello/Linear-style: a fixed horizontal row
// of equal columns that fill the height; only each card LIST scrolls.
//
// Cards at rest are plain text blocks with a colored LEFT border = priority
// (vermelho alta · âmbar média · nenhuma baixa), accent when "decidido".
// All controls (decidir / excluir / prioridade) appear only on hover; the
// "auto" origin is a hover tooltip, not a permanent badge. Move between
// columns by DRAG-AND-DROP. Decided cards float to the top.
// ──────────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: 'objectives', label: 'Objetivos', zones: ['objectives'], readOnly: true, hint: 'definidos pelos desafios escolhidos' },
  { id: 'risks', label: 'Riscos e restrições', zones: ['constraints', 'failures'], add: 'constraints', hint: 'limites e o que pode dar errado' },
  { id: 'questions', label: 'Perguntas em aberto', zones: ['questions'], add: 'questions', hint: 'o que ainda precisa resolver' },
  { id: 'ideas', label: 'Ideias', zones: ['ideas'], add: 'ideas', hint: 'opções a explorar' },
]
const PRIORITIES = ['alta', 'média', 'baixa']
const PRI_ORDER = { alta: 0, 'média': 1, baixa: 2 }
const PRI_BORDER = { alta: 'var(--err2)', 'média': 'var(--warn2)', baixa: 'transparent' }
const nextPriority = (p) => PRIORITIES[(PRIORITIES.indexOf(p || 'média') + 1) % PRIORITIES.length]
const ZONE_TAG = { constraints: 'restrição', failures: 'risco' }

function iconBtn(active) {
  return { background: active ? GOLD : 'rgba(12,20,30,.6)', border: 'none', cursor: 'pointer', color: active ? 'var(--poster-bg-solid)' : CREAM, fontSize: 11, lineHeight: 1, padding: '3px 5px', borderRadius: 4 }
}

function Card({ c, readOnly, store }) {
  const [hover, setHover] = useState(false)
  const border = c.decided ? GOLD : PRI_BORDER[c.priority || 'média']
  return (
    <div draggable={!readOnly} onDragStart={e => e.dataTransfer.setData('text/plain', c.id)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      title={c.auto ? 'gerado automaticamente a partir do desafio' : undefined}
      style={{
        position: 'relative', background: c.decided ? 'var(--poster-card-sel)' : 'var(--poster-card)',
        borderLeft: `3px solid ${border}`, border: '1px solid var(--poster-line)', borderLeftWidth: 3,
        borderRadius: 'var(--r-md)', padding: '8px 10px', cursor: readOnly ? 'default' : 'grab',
      }}>
      {c.decided && <span style={{ position: 'absolute', top: 6, right: 8, ...mono, fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase', color: GOLD }}>decidido</span>}
      {ZONE_TAG[c.zone] && <span style={{ ...mono, fontSize: 8.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', display: 'block', marginBottom: 3 }}>{ZONE_TAG[c.zone]}</span>}
      {readOnly
        ? <div style={{ fontSize: 12.5, color: CREAM, lineHeight: 1.45 }}>{c.text}</div>
        : <textarea value={c.text} onChange={e => store.updateBrainstormCard(c.id, { text: e.target.value })} rows={2}
            placeholder="escreva…" style={{ width: '100%', resize: 'none', background: 'transparent', border: 'none', outline: 'none', color: CREAM, fontSize: 12.5, lineHeight: 1.45, fontFamily: "'Space Grotesk', sans-serif", paddingRight: c.decided ? 48 : 0 }} />}

      {/* controls — only on hover, never at rest */}
      {hover && !readOnly && (
        <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
          <button onClick={() => store.updateBrainstormCard(c.id, { priority: nextPriority(c.priority) })} title={`prioridade: ${c.priority || 'média'} (clique p/ alternar)`} style={iconBtn(false)}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: PRI_BORDER[c.priority || 'média'] === 'transparent' ? 'var(--poster-line)' : PRI_BORDER[c.priority || 'média'] }} />
          </button>
          <button onClick={() => store.toggleBrainstormDecided(c.id)} title={c.decided ? 'desmarcar decisão' : 'bater o martelo (decidido)'} style={iconBtn(c.decided)}>✓</button>
          <button onClick={() => store.removeBrainstormCard(c.id)} title="excluir" style={iconBtn(false)}>×</button>
        </div>
      )}
    </div>
  )
}

function Column({ col, cards, store, ctx }) {
  const colCards = cards
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => col.zones.includes(c.zone))
    .sort((a, b) => (b.c.decided ? 1 : 0) - (a.c.decided ? 1 : 0)
      || (PRI_ORDER[a.c.priority] ?? 1) - (PRI_ORDER[b.c.priority] ?? 1)
      || a.i - b.i)
    .map(({ c }) => c)

  const runAI = () => {
    const zone = col.add || col.zones[0]
    const existing = new Set(cards.filter(c => col.zones.includes(c.zone)).map(c => (c.text || '').trim().toLowerCase()))
    suggestForZone(col.zones[0], ctx).filter(t => !existing.has(t.trim().toLowerCase())).slice(0, 3)
      .forEach(text => store.addBrainstormCard({ zone, text, priority: 'média', draft: false }))
  }
  const onDrop = (e) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (id && col.add) store.moveBrainstormCardToZone(id, col.add)
  }

  return (
    <section onDragOver={col.readOnly ? undefined : (e => e.preventDefault())} onDrop={col.readOnly ? undefined : onDrop}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--poster-line)', borderRadius: 'var(--r-lg)', background: 'var(--poster-bg)', minHeight: 0 }}>
      {/* fixed header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '9px 11px', borderBottom: '1px solid var(--poster-line)' }}>
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: CREAM }}>{col.label}</span>
        <span style={{ ...mono, fontSize: 9.5, color: 'var(--poster-fg-dim)', background: 'var(--poster-card)', borderRadius: 8, padding: '0 6px' }}>{colCards.length}</span>
        <span style={{ flex: 1 }} />
        {!col.readOnly && <button onClick={runAI} title="sugestões da IA" style={{ ...mono, fontSize: 10, padding: '2px 7px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${GOLD}`, background: 'transparent', color: GOLD }}>IA</button>}
        {!col.readOnly && <button onClick={() => store.addBrainstormCard({ zone: col.add, text: '', priority: 'média' })} title="adicionar" style={{ ...mono, fontSize: 13, padding: '0 6px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--poster-line)', background: 'transparent', color: 'var(--poster-fg-dim)' }}>+</button>}
      </div>
      {/* scrollable card list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '9px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
        <div style={{ ...mono, fontSize: 9.5, color: 'var(--poster-fg-dim)', marginTop: -2 }}>{col.hint}</div>
        {colCards.length === 0 && <div style={{ ...mono, fontSize: 10.5, color: 'var(--poster-line)' }}>{col.readOnly ? '—' : 'vazio — use + ou IA'}</div>}
        {colCards.map(c => <Card key={c.id} c={c} readOnly={col.readOnly} store={store} />)}
      </div>
    </section>
  )
}

export default function MissionBrainstorm() {
  const missionPlan = useForge(s => s.missionPlan)
  const store = useForge()
  const cards = missionPlan.brainstorm?.cards || []
  const ctx = { categories: missionPlan.objectiveCategories || [], cubeU: missionPlan.cubeU, budgetBRL: missionPlan.budgetBRL, teamSize: missionPlan.team?.size }
  return (
    <div style={{ display: 'flex', gap: 12, height: '100%', minHeight: 0 }}>
      {COLUMNS.map(col => <Column key={col.id} col={col} cards={cards} store={store} ctx={ctx} />)}
    </div>
  )
}
