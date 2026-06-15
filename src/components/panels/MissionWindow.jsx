import useForge from '../../store/useForge'
import {
  getFramework, resolveObjective, OBJECTIVE_CATEGORIES, MISSION_PRIORITIES,
  FAB_RULES, getFabRule,
} from '../../mission/index.js'
import {
  mono, slab, CREAM, GOLD, NAVY_FIELD, h2, sub, inputStyle, StepDots, Card,
} from '../onboarding/posterKit.jsx'
import SatelliteAssembly from '../onboarding/SatelliteAssembly.jsx'
import MissionBrainstorm from './MissionBrainstorm.jsx'
import ChallengeBoard from './ChallengeBoard.jsx'
import BudgetMeters from '../ui/BudgetMeters'
import { usePanelWidth } from '../ui/usePanelWidth'
import { PanelDivider } from '../ui/Resizable'
import { useState } from 'react'

// ──────────────────────────────────────────────────────────────────
// MissionWindow — the mission-definition flow (Part 2 redesign).
//
// A structured, visual flow — NOT a chat and NOT a free-text form. The
// competition is LOCKED to OBSAT (the only one supported today), so it is
// pre-filled and shown read-only rather than chosen. Four steps:
//
//   equipe → formato → objetivo → restrições
//
// WHY TEAM FIRST: the team is the mission's identity, captured before any
// engineering decision. Asking "who are you?" up front (mission name + team
// + members) frames the rest of the flow as *this team's* satellite and
// avoids interrupting the engineering reasoning later with administrative
// fields. It also means the SatelliteAssembly bus appears on the very first
// answer, so progress feels owned immediately.
//
// Every field is live-bound to missionPlan; the SatelliteAssembly side
// panel grows per decision. The current step lives in the store
// (missionStep) so the sidebar + step pipeline can jump straight to it.
// ──────────────────────────────────────────────────────────────────

const label = { ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)' }

// The objective, brainstorming and restrictions are NOT sequential — they
// are one continuous exploration (Part 1). They live together in a single
// "explorar" step where selecting objectives, brainstorming and seeing the
// constraints react all happen in the same space.
const STEP_DEFS = [
  { id: 'team', title: 'equipe' },
  { id: 'format', title: 'formato' },
  { id: 'explore', title: 'explorar' },
]

// CubeSat sizes — centred visual cards with dimensions + a mini stack
// illustration whose height grows with U.
const CUBE_SIZES = [
  { u: '1U', dims: '10 × 10 × 10 cm', note: 'um cubo — missão compacta' },
  { u: '2U', dims: '10 × 10 × 20 cm', note: 'dois cubos — mais carga útil' },
  { u: '3U', dims: '10 × 10 × 30 cm', note: 'três cubos — payload completo' },
]

function CubeIcon({ u, active }) {
  const n = { '1U': 1, '2U': 2, '3U': 3 }[u] || 1
  const unit = 16, w = 26, top = 6
  const h = n * unit
  const col = active ? 'var(--poster-gold)' : 'var(--poster-fg-dim)'
  return (
    <svg width="34" height="60" viewBox="0 0 40 60" aria-hidden="true">
      <g stroke={col} strokeWidth="1.6" fill="none">
        <rect x={(40 - w) / 2} y={top} width={w} height={h} />
        {Array.from({ length: n - 1 }, (_, i) => (
          <line key={i} x1={(40 - w) / 2} y1={top + unit * (i + 1)} x2={(40 - w) / 2 + w} y2={top + unit * (i + 1)} strokeOpacity=".6" />
        ))}
      </g>
    </svg>
  )
}

// locked banner: the supported competition is pre-filled, others are "em breve"
function CompetitionLock() {
  const comingSoon = useForge(s => s.comingSoon)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 7, border: `1.5px solid ${GOLD}`, background: 'var(--poster-card-sel)' }}>
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)' }}>competição universitária</span>
        <span style={{ ...slab, fontSize: 14, fontWeight: 700, color: CREAM }}>OBSAT</span>
        <span title="Pré-definido — único disponível hoje" style={{ ...mono, fontSize: 11, color: GOLD }}>🔒</span>
      </span>
      <button onClick={(e) => comingSoon('Outras competições', e.currentTarget, 'framework_lasc')}
        style={{ ...mono, fontSize: 11, letterSpacing: '.06em', color: 'var(--poster-fg-dim)', background: 'none', border: '1px dashed var(--poster-line)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>
        outras competições · em breve
      </button>
    </div>
  )
}

// a disabled, clickable "em breve" pill that explains itself on click
function LockedPill({ label: text, featureKey }) {
  const comingSoon = useForge(s => s.comingSoon)
  return (
    <button onClick={(e) => comingSoon(text, e.currentTarget, featureKey)}
      style={{ ...mono, fontSize: 12, letterSpacing: '.04em', color: 'var(--poster-fg-dim)', background: 'var(--poster-card)', border: '1px dashed var(--poster-line)', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      {text} <span style={{ color: GOLD, marginLeft: 6 }}>em breve</span>
    </button>
  )
}

export default function MissionWindow() {
  const {
    missionPlan, setPlanName, setCubeU, setFabRule,
    toggleObjectiveCategory, setTeamField, addTeamMember, setTeamMember, removeTeamMember,
    setPriorityRanking, openPhaseReview, missionStep, setMissionStep, sidebarCollapsed,
  } = useForge()
  const board = useForge(s => s.board)
  const [asmW, setAsmW] = usePanelWidth('forge.missionAsmW', 320, 240, 480)
  const [advOpen, setAdvOpen] = useState(false)   // fab/priorities collapsible

  const steps = STEP_DEFS.map(s => s.title)
  const stepIdx = Math.max(0, STEP_DEFS.findIndex(s => s.id === missionStep))
  const goByIndex = (i) => setMissionStep(STEP_DEFS[Math.max(0, Math.min(STEP_DEFS.length - 1, i))].id)

  const cats = missionPlan.objectiveCategories || []
  const ranked = missionPlan.priorityRanking || []
  const unranked = MISSION_PRIORITIES.filter(p => !ranked.includes(p.id))
  const addPriority = (id) => setPriorityRanking([...ranked, id])
  const removePriority = (id) => setPriorityRanking(ranked.filter(x => x !== id))
  const movePriority = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= ranked.length) return
    const next = ranked.slice();[next[i], next[j]] = [next[j], next[i]]
    setPriorityRanking(next)
  }

  const complete = missionPlan.name.trim().length >= 2
    && !!(missionPlan.team?.name || '').trim()
    && cats.length > 0
    && missionPlan.budgetBRL != null
  const fw = getFramework(missionPlan.frameworkId)
  const resolved = resolveObjective(missionPlan)
  const fabRule = getFabRule(board.ruleId)

  const screensById = {}

  // ── step 1: equipe (mission name + team identity) ────────────────
  screensById.team = (
    <>
      <CompetitionLock />
      <h2 style={h2}>Quem é a equipe?</h2>
      <p style={sub}>Comece pela identidade: o nome da missão e quem está construindo.</p>
      <div style={{ width: 480, maxWidth: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={label}>nome da missão
            <input value={missionPlan.name} onChange={e => setPlanName(e.target.value)} placeholder="ex.: ARARA-1" style={inputStyle} autoFocus />
          </label>
          <label style={label}>nome da equipe
            <input value={missionPlan.team?.name || ''} onChange={e => setTeamField('name', e.target.value)} placeholder="ex.: Equipe Zênite" style={inputStyle} />
          </label>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={label}>integrantes</span>
            <button onClick={() => addTeamMember()} style={{ ...mono, fontSize: 12, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ adicionar</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {(missionPlan.team?.members || []).length === 0 && (
              <div style={{ ...mono, fontSize: 12, color: 'var(--poster-fg-dim)' }}>nenhum integrante ainda — adicione nome e função.</div>
            )}
            {(missionPlan.team?.members || []).map((m, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                <input value={m.name} onChange={e => setTeamMember(i, 'name', e.target.value)} placeholder="nome" style={{ ...inputStyle, marginTop: 0 }} />
                <input value={m.role} onChange={e => setTeamMember(i, 'role', e.target.value)} placeholder="função (ex.: firmware)" style={{ ...inputStyle, marginTop: 0 }} />
                <button onClick={() => removeTeamMember(i)} title="remover" style={{ ...mono, fontSize: 14, color: 'var(--poster-fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
              </div>
            ))}
          </div>
        </div>

        {/* the situation analysis is a future consultant feature */}
        <LockedPill label="situação da equipe" featureKey="team_situation" />
      </div>
    </>
  )

  // ── step 2: formato (CubeSat only; 1U/2U/3U) ─────────────────────
  screensById.format = (
    <>
      <h2 style={h2}>Qual o formato do satélite?</h2>
      <p style={sub}>Escolha o tamanho do CubeSat — ele fixa massa, volume e energia.</p>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 22 }}>
        <Card width={220} selected onClick={() => {}}>
          <div style={{ ...slab, fontSize: 20, fontWeight: 700, marginBottom: 4 }}>CubeSat</div>
          <div style={{ ...mono, fontSize: 12, color: GOLD, marginBottom: 6 }}>padrão · selecionado</div>
          <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--poster-fg-dim)' }}>Estrutura cúbica modular (1U a 3U).</div>
        </Card>
        <Card width={220} onClick={(e) => useForge.getState().comingSoon('CanSat', e.currentTarget, 'framework_cansat')}>
          <div style={{ ...slab, fontSize: 20, fontWeight: 700, marginBottom: 4, opacity: .6 }}>CanSat</div>
          <div style={{ ...mono, fontSize: 12, color: 'var(--poster-fg-dim)', marginBottom: 6 }}>em breve</div>
          <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--poster-fg-dim)' }}>Satélite-lata cilíndrico — disponível em breve.</div>
        </Card>
      </div>

      <div style={{ ...label, textAlign: 'center', marginBottom: 12 }}>tamanho do CubeSat</div>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        {CUBE_SIZES.map(s => {
          const active = (missionPlan.cubeU || '1U') === s.u
          return (
            <button key={s.u} onClick={() => setCubeU(s.u)} style={{
              width: 170, cursor: 'pointer', borderRadius: 'var(--r-lg)', padding: '18px 16px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              background: active ? 'var(--poster-card-sel)' : 'var(--poster-card)',
              border: `1.5px solid ${active ? GOLD : 'var(--poster-line)'}`, transition: 'all .15s', color: CREAM,
            }}>
              <CubeIcon u={s.u} active={active} />
              <div style={{ ...slab, fontSize: 19, fontWeight: 700 }}>{s.u}</div>
              <div style={{ ...mono, fontSize: 12, color: GOLD }}>{s.dims}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--poster-fg-dim)', textAlign: 'center' }}>{s.note}</div>
            </button>
          )
        })}
      </div>
    </>
  )

  // ── integrated EXPLORE space: objective + brainstorming + restrictions
  // are one continuous thinking process (Prompt Part 1). Objectives are
  // live seeds (select/deselect any time), the challenge board grounds the
  // canvas in real problems, and the constraints react on the definition
  // panel to the right — no separate locked steps.
  screensById.explore = (
    <div style={{ height: '76vh', minHeight: 480, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {/* objective seeds — multi-select, never locked */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
          <span style={{ ...slab, fontSize: 16, fontWeight: 700, color: CREAM }}>O que a missão vai fazer?</span>
          <span style={{ ...mono, fontSize: 10.5, color: 'var(--poster-fg-dim)' }}>selecione objetivos — eles semeiam as ideias e as restrições reagem ao lado</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {OBJECTIVE_CATEGORIES.map(c => {
            const active = cats.includes(c.id)
            return (
              <button key={c.id} onClick={() => toggleObjectiveCategory(c.id)} title={c.desc} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                border: `1.5px solid ${active ? GOLD : 'var(--poster-line)'}`,
                background: active ? 'var(--poster-card-sel)' : 'var(--poster-card)', color: CREAM, ...mono, fontSize: 12,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--poster-gold)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={c.icon} /></svg>
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* real-world challenge board (Part 2) */}
      <ChallengeBoard />

      {/* the brainstorming canvas fills the rest */}
      <div style={{ flex: 1, minHeight: 240 }}><MissionBrainstorm /></div>

      {/* fab target + priorities — available but secondary, collapsed */}
      <div style={{ flexShrink: 0, border: '1px solid var(--poster-line)', borderRadius: 'var(--r-md)', background: 'var(--poster-card)' }}>
        <button onClick={() => setAdvOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer' }}>
          <span style={{ ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)' }}>fabricação e prioridades</span>
          <span style={{ flex: 1 }} />
          <span style={{ ...mono, fontSize: 12, color: 'var(--poster-fg-dim)' }}>{advOpen ? '−' : '+'}</span>
        </button>
        {advOpen && (
          <div style={{ padding: '0 12px 12px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ ...label, flex: 1, minWidth: 200 }}>alvo de fabricação
              <select value={board.ruleId} onChange={e => setFabRule(e.target.value)} style={{ ...inputStyle, fontFamily: "'Space Mono', monospace", fontSize: 14 }}>
                {FAB_RULES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <span style={{ ...mono, fontSize: 10, color: 'var(--poster-fg-dim)', lineHeight: 1.5, display: 'block', marginTop: 5, textTransform: 'none', letterSpacing: 0 }}>trilha mín {fabRule.minTraceMm} mm · isol {fabRule.minClearanceMm} mm · {fabRule.material}</span>
            </label>
            <div style={{ flex: 1, minWidth: 220 }}>
              <span style={label}>prioridades</span>
              {ranked.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '6px 0' }}>
                  {ranked.map((id, i) => {
                    const p = MISSION_PRIORITIES.find(x => x.id === id)
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px', borderRadius: 6, border: `1px solid ${GOLD}`, background: 'var(--poster-card-sel)' }}>
                        <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: GOLD, width: 14 }}>{i + 1}</span>
                        <span style={{ fontSize: 13, color: CREAM, flex: 1 }}>{p?.label}</span>
                        <button onClick={() => movePriority(i, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--poster-fg-dim)', fontSize: 11 }}>▲</button>
                        <button onClick={() => movePriority(i, 1)} disabled={i === ranked.length - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--poster-fg-dim)', fontSize: 11 }}>▼</button>
                        <button onClick={() => removePriority(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--poster-fg-dim)', fontSize: 13 }}>×</button>
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {unranked.map(p => (
                  <button key={p.id} onClick={() => addPriority(p.id)} style={{ ...mono, fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--poster-line)', background: 'var(--poster-card)', color: CREAM, cursor: 'pointer' }}>+ {p.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const current = STEP_DEFS[stepIdx]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px 36px 22px', background: NAVY_FIELD, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...slab, fontSize: 22, fontWeight: 700, color: CREAM }}>Definição da missão</div>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)' }}>
            {complete && fw && resolved
              ? `${missionPlan.name} · ${fw.name} · CubeSat ${missionPlan.cubeU}`
              : 'monte a missão passo a passo — o hardware vem depois'}
          </div>
        </div>
        {/* the step pipeline is redundant with the expanded sidebar, so it
            only appears when the sidebar is collapsed (Part 2) */}
        {sidebarCollapsed && <StepDots steps={steps} current={stepIdx} onStep={goByIndex} />}
        {complete ? (
          <button onClick={() => openPhaseReview('mission')} style={{ ...mono, fontSize: 13, letterSpacing: '.04em', color: 'var(--poster-bg-solid)', background: GOLD, border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 700 }}>revisar e avançar →</button>
        ) : <span style={{ width: 10 }} />}
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 0' }}>
          <div>{screensById[current.id]}</div>
        </div>
        <PanelDivider w={asmW} setW={setAsmW} side="left" />
        <div style={{ width: asmW, flexShrink: 0, borderLeft: '1px solid var(--poster-line)', padding: '10px 4px 6px 14px', minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: current.id === 'explore' ? 'auto' : 'hidden' }}>
          {/* the satellite is always the live feedback; in the explore step
              the definition (budget, meters, constraints) crystallises below
              it as the student selects objectives (Part 1) */}
          <div style={{ flexShrink: 0, height: current.id === 'explore' ? 300 : '100%', minHeight: current.id === 'explore' ? 300 : 0 }}>
            <SatelliteAssembly plan={missionPlan} />
          </div>
          {current.id === 'explore' && <ExploreDefinition cats={cats} />}
        </div>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        {stepIdx > 0 && (
          <button onClick={() => goByIndex(stepIdx - 1)} style={{ ...mono, fontSize: 13, color: 'var(--poster-fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>← {STEP_DEFS[stepIdx - 1].title}</button>
        )}
        {stepIdx < STEP_DEFS.length - 1 && (
          // action-oriented: name the destination, not a generic "próximo"
          <button onClick={() => goByIndex(stepIdx + 1)} style={{ ...mono, fontSize: 13, letterSpacing: '.03em', color: 'var(--poster-bg-solid)', background: GOLD, border: 'none', borderRadius: 6, padding: '9px 18px', cursor: 'pointer', fontWeight: 700 }}>
            Continuar para {STEP_DEFS[stepIdx + 1].title} →
          </button>
        )}
      </div>
    </div>
  )
}

// short engineering constraint that "appears" per selected objective —
// the restrictions are a continuous presence, not a separate form (Part 1)
const CONSTRAINT_NOTE = {
  earth_obs: 'Imagem gera muito dado — banda/downlink e revisita são o gargalo.',
  atmospheric: 'Sensor ambiental é leve, mas exige amostragem e calibração.',
  communication: 'Enlace em LEO é intermitente — janelas curtas de contato.',
  radiation: 'Ambiente de radiação exige proteger o MCU (SEU/latch-up).',
  attitude_control: 'Determinar atitude pede IMU calibrado; controle ativo pesa no orçamento.',
  tech_demo: 'Componente sem heritage de voo aumenta o risco.',
}
const MASS_CAP = { '1U': '~1,3 kg', '2U': '~2,6 kg', '3U': '~4 kg' }

// the crystallising mission definition shown beside the exploration: the
// budget meters react, and the relevant constraints surface as objectives
// are chosen (Part 1).
function ExploreDefinition({ cats }) {
  const missionPlan = useForge(s => s.missionPlan)
  const setBudget = useForge(s => s.setBudget)
  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 6 }}>
      <label style={label}>orçamento (R$)
        <input type="number" value={missionPlan.budgetBRL ?? ''} onChange={e => setBudget(e.target.value)} placeholder="ex.: 300" style={inputStyle} />
      </label>
      <div>
        <div style={{ ...label, marginBottom: 8 }}>orçamentos</div>
        <BudgetMeters showFormat={false} />
      </div>
      <div>
        <div style={{ ...label, marginBottom: 7 }}>restrições que reagem</div>
        <div style={{ ...mono, fontSize: 11, lineHeight: 1.6, color: 'var(--poster-fg-dim)' }}>
          <div>· Massa do {missionPlan.cubeU || '1U'}: até {MASS_CAP[missionPlan.cubeU || '1U']}</div>
          {cats.length === 0 && <div>· selecione um objetivo para ver as restrições associadas</div>}
          {cats.map(c => CONSTRAINT_NOTE[c] && <div key={c}>· {CONSTRAINT_NOTE[c]}</div>)}
        </div>
      </div>
    </div>
  )
}
