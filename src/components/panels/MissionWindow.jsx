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
import { usePanelWidth } from '../ui/usePanelWidth'
import { PanelDivider } from '../ui/Resizable'

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

const STEP_DEFS = [
  { id: 'team', title: 'equipe' },
  { id: 'format', title: 'formato' },
  { id: 'objective', title: 'objetivo' },
  { id: 'brainstorm', title: 'ideias' },
  { id: 'restrictions', title: 'restrições' },
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
    missionPlan, setPlanName, setBudget, setCubeU, setFabRule,
    toggleObjectiveCategory, setTeamField, addTeamMember, setTeamMember, removeTeamMember,
    setPriorityRanking, openPhaseReview, missionStep, setMissionStep, sidebarCollapsed,
  } = useForge()
  const board = useForge(s => s.board)
  const [asmW, setAsmW] = usePanelWidth('forge.missionAsmW', 300, 220, 460)

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
      <p style={sub}>Comece pela identidade da missão — o nome e quem está construindo. O resto da missão é desta equipe.</p>
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
      <p style={sub}>Hoje o GuiaSat monta CubeSats. Escolha o tamanho — ele fixa os orçamentos de massa, volume e energia.</p>
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

  // ── step 3: objetivo (visual category cards, multi-select) ───────
  screensById.objective = (
    <>
      <h2 style={h2}>O que a missão vai fazer?</h2>
      <p style={sub}>Escolha uma ou mais categorias — cada objetivo adiciona uma carga útil ao satélite.</p>
      <div style={{ width: 640, maxWidth: '100%', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
          {OBJECTIVE_CATEGORIES.map(c => {
            const active = cats.includes(c.id)
            return (
              <button key={c.id} onClick={() => toggleObjectiveCategory(c.id)} style={{
                textAlign: 'left', cursor: 'pointer', borderRadius: 'var(--r-lg)', padding: '14px 14px 12px',
                background: active ? 'var(--poster-card-sel)' : 'var(--poster-card)',
                border: `1.5px solid ${active ? GOLD : 'var(--poster-line)'}`, transition: 'all .15s', color: CREAM,
                display: 'flex', flexDirection: 'column', gap: 7,
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--poster-gold)' : 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={c.icon} />
                </svg>
                <div style={{ ...slab, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{c.label}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--poster-fg-dim)' }}>{c.desc}</div>
              </button>
            )
          })}
        </div>
        <div style={{ width: 320, margin: '0 auto' }}>
          <LockedPill label="objetivo · missão personalizada" featureKey="custom_objective" />
        </div>
      </div>
    </>
  )

  // ── step 4: ideias (brainstorming canvas — FMEA/design-thinking) ──
  screensById.brainstorm = (
    <div style={{ height: '72vh', minHeight: 420, display: 'flex', flexDirection: 'column' }}>
      <MissionBrainstorm />
    </div>
  )

  // ── step 5: restrições (budget + fab target + university + priorities) ─
  screensById.restrictions = (
    <>
      <h2 style={h2}>Restrições e prioridades</h2>
      <p style={sub}>O orçamento alimenta o medidor de custos; o alvo de fabricação e a afiliação contextualizam o projeto.</p>
      <div style={{ width: 480, maxWidth: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={label}>orçamento total (R$)
            <input type="number" value={missionPlan.budgetBRL ?? ''} onChange={e => setBudget(e.target.value)} placeholder="ex.: 300" style={inputStyle} />
          </label>
          {/* university affiliation (moved here from the team step / advanced options) */}
          <label style={label}>afiliação (universidade)
            <input value={missionPlan.team?.institution || ''} onChange={e => setTeamField('institution', e.target.value)} placeholder="ex.: UFMG" style={inputStyle} />
          </label>
        </div>
        <label style={label}>alvo de fabricação
          <select value={board.ruleId} onChange={e => setFabRule(e.target.value)}
            style={{ ...inputStyle, fontFamily: "'Space Mono', monospace", fontSize: 14 }}>
            {FAB_RULES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <span style={{ ...mono, fontSize: 10.5, color: 'var(--poster-fg-dim)', lineHeight: 1.5, display: 'block', marginTop: 6, textTransform: 'none', letterSpacing: 0 }}>
            trilha mín {fabRule.minTraceMm} mm · isolamento {fabRule.minClearanceMm} mm · {fabRule.material}
          </span>
        </label>

        <div>
          <span style={label}>prioridades da missão</span>
          <p style={{ ...mono, fontSize: 11, color: 'var(--poster-fg-dim)', margin: '6px 0 8px', lineHeight: 1.5, textTransform: 'none', letterSpacing: 0 }}>
            clique para priorizar; use ▲▼ para ordenar (a primeira é a mais importante).
          </p>
          {ranked.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {ranked.map((id, i) => {
                const p = MISSION_PRIORITIES.find(x => x.id === id)
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${GOLD}`, background: 'var(--poster-card-sel)' }}>
                    <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: GOLD, width: 18 }}>{i + 1}</span>
                    <span style={{ ...slab, fontSize: 14, color: CREAM, flex: 1 }}>{p?.label}</span>
                    <button onClick={() => movePriority(i, -1)} disabled={i === 0} title="subir" style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'var(--poster-line)' : 'var(--poster-fg-dim)', fontSize: 12 }}>▲</button>
                    <button onClick={() => movePriority(i, 1)} disabled={i === ranked.length - 1} title="descer" style={{ background: 'none', border: 'none', cursor: i === ranked.length - 1 ? 'default' : 'pointer', color: i === ranked.length - 1 ? 'var(--poster-line)' : 'var(--poster-fg-dim)', fontSize: 12 }}>▼</button>
                    <button onClick={() => removePriority(id)} title="remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--poster-fg-dim)', fontSize: 14 }}>×</button>
                  </div>
                )
              })}
            </div>
          )}
          {unranked.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {unranked.map(p => (
                <button key={p.id} onClick={() => addPriority(p.id)} style={{ ...mono, fontSize: 12.5, padding: '7px 12px', borderRadius: 7, border: '1.5px solid var(--poster-line)', background: 'var(--poster-card)', color: CREAM, cursor: 'pointer' }}>
                  + {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
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
        <div style={{ width: asmW, flexShrink: 0, borderLeft: '1px solid var(--poster-line)', padding: '10px 4px 6px 14px', minHeight: 0 }}>
          <SatelliteAssembly plan={missionPlan} />
        </div>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', gap: 22 }}>
        {stepIdx > 0 && (
          <button onClick={() => goByIndex(stepIdx - 1)} style={{ ...mono, fontSize: 13, color: 'var(--poster-fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>← voltar</button>
        )}
        {stepIdx < STEP_DEFS.length - 1 && (
          <button onClick={() => goByIndex(stepIdx + 1)} style={{ ...mono, fontSize: 13, color: 'var(--poster-fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>avançar →</button>
        )}
      </div>
    </div>
  )
}
