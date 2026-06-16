import useForge from '../../store/useForge'
import { getFramework } from '../../mission/index.js'
import { SEED_CHALLENGES } from '../../mission/challenges.js'
import BudgetMeters from '../ui/BudgetMeters'
import { mono, slab, CREAM, GOLD } from '../onboarding/posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// MissionDocument — the consolidated, one-page mission definition (Prompt
// brainstorm-v3 Part 3). Replaces the old read-only summary modal: a full
// screen that READS as an engineering document and is inline-editable. It
// is derived live from the mission data (challenges + brainstorm cards +
// budgets), so it stays accessible from the sidebar under the Mission phase.
//   identity · desafios · decisões confirmadas (cards "decididos" por zona)
//   · perguntas em aberto · ideias · orçamento → confirmar → hardware.
// ──────────────────────────────────────────────────────────────────

const DECISION_ZONES = [
  { id: 'constraints', label: 'Restrições' },
  { id: 'failures', label: 'Riscos / modos de falha' },
  { id: 'questions', label: 'Perguntas resolvidas' },
  { id: 'ideas', label: 'Ideias confirmadas' },
]
const sectionTitle = { ...slab, fontSize: 15, fontWeight: 700, color: CREAM, marginBottom: 8, letterSpacing: '.02em' }
const docInput = { width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', outline: 'none', color: CREAM, fontFamily: "'Space Grotesk', sans-serif" }

function EditLine({ value, onChange, placeholder, prefix }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, padding: '2px 0' }}>
      {prefix && <span style={{ ...mono, fontSize: 11, color: GOLD, flexShrink: 0 }}>{prefix}</span>}
      <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ ...docInput, fontSize: 13, padding: '2px 0' }}
        onFocus={e => (e.target.style.borderBottomColor = 'var(--poster-line)')}
        onBlur={e => (e.target.style.borderBottomColor = 'transparent')} />
    </div>
  )
}

export default function MissionDocument() {
  const missionPlan = useForge(s => s.missionPlan)
  const challengesAll = useForge(s => s.challenges)
  const setPlanName = useForge(s => s.setPlanName)
  const setTeamField = useForge(s => s.setTeamField)
  const setBudget = useForge(s => s.setBudget)
  const updateBrainstormCard = useForge(s => s.updateBrainstormCard)
  const addBrainstormCard = useForge(s => s.addBrainstormCard)
  const setMissionStep = useForge(s => s.setMissionStep)
  const openPhaseReview = useForge(s => s.openPhaseReview)

  const fw = getFramework(missionPlan.frameworkId)
  const cards = missionPlan.brainstorm?.cards || []
  const all = (challengesAll && challengesAll.length) ? challengesAll : SEED_CHALLENGES
  const chosen = (missionPlan.challenges || []).map(id => all.find(c => c.id === id)).filter(Boolean)
  const decided = cards.filter(c => c.decided)
  const openQuestions = cards.filter(c => c.zone === 'questions' && !c.decided && (c.text || '').trim())
  const ideas = cards.filter(c => c.zone === 'ideas' && !c.decided && (c.text || '').trim())

  let n = 0
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 2px 18px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, marginBottom: 4 }}>documento da missão</div>
          <input value={missionPlan.name} onChange={e => setPlanName(e.target.value)} placeholder="Nome da missão"
            style={{ ...docInput, fontFamily: "'Zilla Slab', serif", fontSize: 28, fontWeight: 700, marginBottom: 18 }} />

          {/* identity */}
          <section style={{ marginBottom: 22 }}>
            <div style={sectionTitle}>Identidade</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
              <EditLine prefix="equipe" value={missionPlan.team?.name || ''} onChange={v => setTeamField('name', v)} placeholder="equipe" />
              <div style={{ ...mono, fontSize: 12.5, color: 'var(--poster-fg-dim)', padding: '2px 0' }}>competição · {fw?.name || 'OBSAT'}</div>
              <div style={{ ...mono, fontSize: 12.5, color: 'var(--poster-fg-dim)', padding: '2px 0' }}>formato · CubeSat {missionPlan.cubeU || '1U'}</div>
              <EditLine prefix="local" value={missionPlan.team?.city || ''} onChange={v => setTeamField('city', v)} placeholder="cidade" />
            </div>
          </section>

          {/* selected challenges */}
          <section style={{ marginBottom: 22 }}>
            <div style={sectionTitle}>Desafios escolhidos</div>
            {chosen.length === 0 && <div style={{ ...mono, fontSize: 12, color: 'var(--poster-fg-dim)' }}>nenhum desafio selecionado.</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {chosen.map(c => (
                <div key={c.id} style={{ border: '1px solid var(--poster-line)', borderRadius: 'var(--r-md)', background: 'var(--poster-card)', padding: '8px 10px', maxWidth: 240 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: CREAM }}>{c.org}</div>
                  <div style={{ ...mono, fontSize: 10, color: GOLD }}>{c.location}</div>
                </div>
              ))}
            </div>
          </section>

          {/* confirmed decisions — the "decided" cards by zone, numbered */}
          <section style={{ marginBottom: 22 }}>
            <div style={sectionTitle}>Decisões confirmadas</div>
            {decided.length === 0 && <div style={{ ...mono, fontSize: 12, color: 'var(--poster-fg-dim)' }}>marque cartões como “decidido” no brainstorming para consolidá-los aqui.</div>}
            {DECISION_ZONES.map(z => {
              const zc = decided.filter(c => c.zone === z.id)
              if (!zc.length) return null
              return (
                <div key={z.id} style={{ marginBottom: 10 }}>
                  <div style={{ ...mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', marginBottom: 3 }}>{z.label}</div>
                  {zc.map(c => <EditLine key={c.id} prefix={`${++n}.`} value={c.text} onChange={v => updateBrainstormCard(c.id, { text: v })} />)}
                </div>
              )
            })}
            <button onClick={() => addBrainstormCard({ zone: 'constraints', text: '', priority: 'alta', decided: true })}
              style={addBtn}>+ adicionar decisão</button>
          </section>

          {/* open questions — undecided Perguntas, as a checklist */}
          <section style={{ marginBottom: 22 }}>
            <div style={sectionTitle}>Perguntas em aberto</div>
            {openQuestions.length === 0 && <div style={{ ...mono, fontSize: 12, color: 'var(--poster-fg-dim)' }}>nenhuma pendência.</div>}
            {openQuestions.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'baseline', gap: 7, padding: '2px 0' }}>
                <span style={{ ...mono, fontSize: 12, color: 'var(--poster-fg-dim)', flexShrink: 0 }}>☐</span>
                <input value={c.text} onChange={e => updateBrainstormCard(c.id, { text: e.target.value })} style={{ ...docInput, fontSize: 13 }} />
              </div>
            ))}
            <button onClick={() => addBrainstormCard({ zone: 'questions', text: '', priority: 'média' })} style={addBtn}>+ adicionar pergunta</button>
          </section>

          {/* ideas */}
          <section style={{ marginBottom: 22 }}>
            <div style={sectionTitle}>Ideias a explorar</div>
            {ideas.length === 0 && <div style={{ ...mono, fontSize: 12, color: 'var(--poster-fg-dim)' }}>—</div>}
            {ideas.map(c => <EditLine key={c.id} prefix="·" value={c.text} onChange={v => updateBrainstormCard(c.id, { text: v })} />)}
            <button onClick={() => addBrainstormCard({ zone: 'ideas', text: '', priority: 'baixa' })} style={addBtn}>+ adicionar ideia</button>
          </section>

          {/* budget + constraints */}
          <section style={{ marginBottom: 8 }}>
            <div style={sectionTitle}>Orçamento e limites</div>
            <label style={{ ...mono, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', display: 'block', marginBottom: 10 }}>orçamento (R$)
              <input type="number" value={missionPlan.budgetBRL ?? ''} onChange={e => setBudget(e.target.value)} placeholder="ex.: 3000"
                style={{ width: 160, marginTop: 4, padding: '6px 9px', borderRadius: 'var(--r-md)', border: '1px solid var(--poster-line)', background: 'var(--poster-card)', fontSize: 13.5, color: CREAM, display: 'block', fontFamily: "'Space Grotesk', sans-serif" }} />
            </label>
            <BudgetMeters showFormat={false} />
          </section>
        </div>
      </div>

      {/* fixed action bar */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--poster-line)', padding: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <button onClick={() => setMissionStep('brainstorm')} style={{ ...mono, fontSize: 13, color: 'var(--poster-fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>← voltar ao brainstorming</button>
        <button onClick={() => openPhaseReview('mission')} style={{ ...mono, fontSize: 13.5, fontWeight: 700, color: 'var(--poster-bg-solid)', background: GOLD, border: 'none', borderRadius: 6, padding: '10px 20px', cursor: 'pointer' }}>Confirmar e ir para hardware →</button>
      </div>
    </div>
  )
}

const addBtn = { ...mono, fontSize: 11.5, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0 0' }
