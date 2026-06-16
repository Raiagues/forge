import useForge from '../../store/useForge'
import { BRAINSTORM_ZONES, suggestForZone } from '../../mission/brainstorm.js'
import { mono, CREAM, GOLD } from '../onboarding/posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// MissionBrainstorm — structured ideation that BELONGS to the platform
// (Prompt Part 4). No floating cards, no pastels, no container box: the
// canvas is the page. Each zone is a labelled column (a subtle divider via
// the poster tokens) holding standard cards that stack and sort by
// priority. Cards reorder vertically, delete, and move between zones via a
// "mover para" select — never by dragging across the screen. Zones can be
// auto-seeded from the selected challenges, and each has an AI button that
// drafts 2–3 context-specific cards.
// ──────────────────────────────────────────────────────────────────

const PRIORITIES = ['alta', 'média', 'baixa']
const PRI_ORDER = { alta: 0, 'média': 1, baixa: 2 }
const PRI_COLOR = { alta: 'var(--poster-gold)', 'média': 'var(--poster-fg-dim)', baixa: 'var(--poster-line)' }
const nextPriority = (p) => PRIORITIES[(PRIORITIES.indexOf(p || 'média') + 1) % PRIORITIES.length]

function Card({ c, zones, store }) {
  const draft = !!c.draft
  return (
    <div style={{
      background: 'var(--poster-card)', border: `1px solid ${draft ? GOLD : 'var(--poster-line)'}`,
      borderStyle: draft ? 'dashed' : 'solid', borderRadius: 'var(--r-md)', padding: '8px 10px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => store.updateBrainstormCard(c.id, { priority: nextPriority(c.priority) })}
          title="prioridade (clique para alternar)" style={{ ...mono, fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${PRI_COLOR[c.priority || 'média']}`, background: 'transparent', color: PRI_COLOR[c.priority || 'média'] }}>
          {c.priority || 'média'}
        </button>
        {c.auto && <span title="gerado automaticamente a partir do desafio" style={{ ...mono, fontSize: 9, color: 'var(--poster-fg-dim)' }}>auto</span>}
        <span style={{ flex: 1 }} />
        {!draft && (
          <>
            <button onClick={() => store.moveBrainstormCard(c.id, -1)} title="subir" style={iconBtn}>▲</button>
            <button onClick={() => store.moveBrainstormCard(c.id, 1)} title="descer" style={iconBtn}>▼</button>
          </>
        )}
        <button onClick={() => store.removeBrainstormCard(c.id)} title="remover" style={{ ...iconBtn, fontSize: 13 }}>×</button>
      </div>
      <textarea value={c.text} onChange={e => store.updateBrainstormCard(c.id, { text: e.target.value })} rows={2}
        placeholder="escreva uma ideia…" style={{
          width: '100%', resize: 'vertical', background: 'transparent', border: 'none', outline: 'none',
          color: CREAM, fontSize: 12.5, lineHeight: 1.45, fontFamily: "'Space Grotesk', sans-serif",
        }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {draft ? (
          <>
            <button onClick={() => store.acceptBrainstormDraft(c.id)} style={{ ...mono, fontSize: 10.5, padding: '3px 9px', borderRadius: 5, border: 'none', cursor: 'pointer', background: GOLD, color: 'var(--poster-bg-solid)' }}>aceitar</button>
            <button onClick={() => store.removeBrainstormCard(c.id)} style={{ ...mono, fontSize: 10.5, padding: '3px 9px', borderRadius: 5, cursor: 'pointer', border: '1px solid var(--poster-line)', background: 'transparent', color: 'var(--poster-fg-dim)' }}>descartar</button>
            <span style={{ ...mono, fontSize: 9, color: GOLD, marginLeft: 'auto' }}>sugestão IA</span>
          </>
        ) : (
          <select value="" onChange={e => { if (e.target.value) store.moveBrainstormCardToZone(c.id, e.target.value) }}
            title="mover para outra zona" style={{ ...mono, fontSize: 10, color: 'var(--poster-fg-dim)', background: 'transparent', border: '1px solid var(--poster-line)', borderRadius: 5, padding: '2px 4px', cursor: 'pointer' }}>
            <option value="">mover para…</option>
            {zones.filter(z => z.id !== c.zone).map(z => <option key={z.id} value={z.id}>{z.label.split(' ')[0]}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

export default function MissionBrainstorm() {
  const missionPlan = useForge(s => s.missionPlan)
  const store = useForge()
  const cards = missionPlan.brainstorm?.cards || []

  // AI: draft 2–3 zone-relevant cards from the live mission context (free,
  // local — the same context-aware engine used elsewhere; no API cost).
  const runAI = (zoneId) => {
    const ctx = {
      categories: missionPlan.objectiveCategories || [],
      cubeU: missionPlan.cubeU, budgetBRL: missionPlan.budgetBRL,
      teamSize: missionPlan.team?.size,
    }
    const existing = new Set(cards.filter(c => c.zone === zoneId).map(c => (c.text || '').trim().toLowerCase()))
    const picks = suggestForZone(zoneId, ctx).filter(t => !existing.has(t.trim().toLowerCase())).slice(0, 3)
    picks.forEach(text => store.addBrainstormCard({ zone: zoneId, text, priority: 'média', draft: true }))
  }

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ fontFamily: "'Zilla Slab', serif", fontSize: 22, fontWeight: 700, color: CREAM, margin: 0 }}>Brainstorming da missão</h2>
        <p style={{ ...mono, fontSize: 11.5, color: 'var(--poster-fg-dim)', marginTop: 2 }}>organize as ideias por zona e prioridade — cartões marcados “auto” vieram dos desafios escolhidos.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 18, marginTop: 14 }}>
        {BRAINSTORM_ZONES.map(z => {
          const zoneCards = cards
            .map((c, i) => ({ c, i }))
            .filter(({ c }) => c.zone === z.id)
            .sort((a, b) => (PRI_ORDER[a.c.priority] ?? 1) - (PRI_ORDER[b.c.priority] ?? 1) || a.i - b.i)
            .map(({ c }) => c)
          return (
            <section key={z.id}>
              {/* zone header + subtle divider (tokens only, no custom color) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <span style={{ ...mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: CREAM }}>{z.label.split(' ')[0]}</span>
                <span style={{ ...mono, fontSize: 10, color: 'var(--poster-fg-dim)' }}>{zoneCards.length}</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => runAI(z.id)} title="sugestões da IA para esta zona" style={{ ...mono, fontSize: 10, padding: '2px 8px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${GOLD}`, background: 'transparent', color: GOLD }}>IA</button>
                <button onClick={() => store.addBrainstormCard({ zone: z.id, text: '', priority: 'média' })} title="adicionar cartão" style={{ ...mono, fontSize: 13, padding: '0 6px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--poster-line)', background: 'transparent', color: 'var(--poster-fg-dim)' }}>+</button>
              </div>
              <div style={{ borderTop: '1px solid var(--poster-line)', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ ...mono, fontSize: 10, color: 'var(--poster-fg-dim)', marginTop: -3, marginBottom: 1 }}>{z.hint}</div>
                {zoneCards.length === 0 && <div style={{ ...mono, fontSize: 11, color: 'var(--poster-line)' }}>vazio — use + ou IA</div>}
                {zoneCards.map(c => <Card key={c.id} c={c} zones={BRAINSTORM_ZONES} store={store} />)}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--poster-fg-dim)',
  fontSize: 10, padding: '0 2px', lineHeight: 1,
}
