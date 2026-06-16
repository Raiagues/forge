import useForge from '../../store/useForge'
import {
  getFramework, resolveObjective,
} from '../../mission/index.js'
import {
  mono, slab, CREAM, GOLD, NAVY_FIELD, h2, sub, inputStyle, StepDots, Card,
} from '../onboarding/posterKit.jsx'
import SatelliteAssembly from '../onboarding/SatelliteAssembly.jsx'
import MissionBrainstorm from './MissionBrainstorm.jsx'
import MissionDocument from './MissionDocument.jsx'
import ChallengeBoard, { SelectedChallengesSummary } from './ChallengeBoard.jsx'
import { usePanelWidth } from '../ui/usePanelWidth'
import { PanelDivider } from '../ui/Resizable'
import { useEffect } from 'react'

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
  { id: 'challenges', title: 'desafio' },
  { id: 'brainstorm', title: 'ideias' },
  { id: 'document', title: 'documento' },
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
    missionPlan, setPlanName, setBudget, setCubeU, setTeamField,
    openPhaseReview, missionStep, setMissionStep, sidebarCollapsed,
    seedBrainstormFromChallenges,
  } = useForge()
  const [asmW, setAsmW] = usePanelWidth('forge.missionAsmW', 320, 240, 480)

  const steps = STEP_DEFS.map(s => s.title)
  const stepIdx = Math.max(0, STEP_DEFS.findIndex(s => s.id === missionStep))
  const goByIndex = (i) => setMissionStep(STEP_DEFS[Math.max(0, Math.min(STEP_DEFS.length - 1, i))].id)

  const selectedChallenges = missionPlan.challenges || []
  // Finalizing the brainstorming only needs: at least one challenge chosen
  // and at least one brainstorm card. (The stricter `complete` — which also
  // wants mission name + team + budget — was over-gating this button.)
  const canFinalize = selectedChallenges.length > 0 && (missionPlan.brainstorm?.cards || []).length > 0
  // arriving at the brainstorm step seeds the zones from the chosen
  // challenges (deduped server-side by fromChallenge) — Part 4 auto-pop.
  useEffect(() => { if (missionStep === 'brainstorm') seedBrainstormFromChallenges() }, [missionStep, seedBrainstormFromChallenges])

  // objective is now implicit in the challenge selection (Part 3)
  const complete = missionPlan.name.trim().length >= 2
    && !!(missionPlan.team?.name || '').trim()
    && selectedChallenges.length > 0
    && missionPlan.budgetBRL != null
  const fw = getFramework(missionPlan.frameworkId)
  const resolved = resolveObjective(missionPlan)

  const screensById = {}

  // ── step 1: missão + equipe (Part 2) ─────────────────────────────
  // Only fields that actually influence downstream decisions: identity,
  // team CONTEXT (size, university, location — they affect feasibility,
  // lab/fab access and supplier/shipping) and budget. No per-member names
  // or roles here (that lives in the Team panel), no redundant fields.
  screensById.team = (
    <>
      <CompetitionLock />
      <h2 style={h2}>Missão e equipe</h2>
      <p style={sub}>Apenas o que influencia as decisões da missão.</p>
      <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* group 1 — mission identity */}
        <div>
          <div style={{ ...label, marginBottom: 10 }}>identidade da missão</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={label}>nome da missão
              <input value={missionPlan.name} onChange={e => setPlanName(e.target.value)} placeholder="ex.: ARARA-1" style={inputStyle} autoFocus />
            </label>
            <label style={label}>nome da equipe
              <input value={missionPlan.team?.name || ''} onChange={e => setTeamField('name', e.target.value)} placeholder="ex.: Equipe Zênite" style={inputStyle} />
            </label>
          </div>
        </div>

        {/* group 2 — team context (affects what is feasible / sourceable) */}
        <div>
          <div style={{ ...label, marginBottom: 10 }}>contexto da equipe</div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, marginBottom: 14 }}>
            <label style={label}>nº de integrantes
              <input type="number" min="1" value={missionPlan.team?.size ?? ''} onChange={e => setTeamField('size', e.target.value === '' ? '' : Math.max(1, +e.target.value))} placeholder="ex.: 6" style={inputStyle} />
            </label>
            <label style={label}>universidade / instituição
              <input value={missionPlan.team?.institution || ''} onChange={e => setTeamField('institution', e.target.value)} placeholder="ex.: UFMG" style={inputStyle} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 14 }}>
            <label style={label}>cidade
              <input value={missionPlan.team?.city || ''} onChange={e => setTeamField('city', e.target.value)} placeholder="ex.: Belo Horizonte" style={inputStyle} />
            </label>
            <label style={label}>estado (UF)
              <input value={missionPlan.team?.state || ''} onChange={e => setTeamField('state', e.target.value.toUpperCase().slice(0, 2))} placeholder="MG" style={inputStyle} />
            </label>
          </div>
        </div>

        {/* group 3 — budget */}
        <div>
          <div style={{ ...label, marginBottom: 10 }}>orçamento</div>
          <label style={label}>orçamento total estimado (R$)
            <input type="number" value={missionPlan.budgetBRL ?? ''} onChange={e => setBudget(e.target.value)} placeholder="ex.: 3000" style={inputStyle} />
          </label>
        </div>
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

  // ── step 3: desafios (challenge selection = the objective, Part 3) ──
  screensById.challenges = <ChallengeBoard />

  // ── step 4: brainstorming — fixed-height columns, fills the viewport;
  // only each card list scrolls (Trello/Linear pattern).
  screensById.brainstorm = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 10 }}>
      <div style={{ flexShrink: 0 }}><SelectedChallengesSummary /></div>
      <div style={{ flex: 1, minHeight: 0 }}><MissionBrainstorm /></div>
    </div>
  )

  // ── step 5: documento da missão — consolidated definition (replaces the
  // old summary modal); has its own action bar.
  screensById.document = <MissionDocument />

  const current = STEP_DEFS[stepIdx]
  // brainstorm + document fill the viewport (no page scroll) and drop the
  // satellite sidebar to make room for the 4 columns / the document
  const wide = current.id === 'brainstorm' || current.id === 'document'

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
        {/* Part 5: content capped at ~900px + centred for the form steps;
            the brainstorm/document steps fill the width and height (no page
            scroll) and hide the satellite sidebar to make room. */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: wide ? 'stretch' : 'center', overflowY: wide ? 'hidden' : 'auto', padding: wide ? '14px 0 0' : '20px 0' }}>
          <div style={{ width: '100%', maxWidth: wide ? 'none' : 900, margin: '0 auto', flex: wide ? 1 : undefined, minHeight: 0, display: wide ? 'flex' : 'block', flexDirection: 'column' }}>{screensById[current.id]}</div>
        </div>
        {!wide && <>
          <PanelDivider w={asmW} setW={setAsmW} side="left" />
          {/* satellite sidebar — the only full-window-edge element (Part 5) */}
          <div style={{ width: asmW, flexShrink: 0, borderLeft: '1px solid var(--poster-line)', padding: '10px 4px 6px 14px', minHeight: 0 }}>
            <SatelliteAssembly plan={missionPlan} />
          </div>
        </>}
      </div>

      {/* fixed bottom action bar — the document step provides its own */}
      {current.id !== 'document' && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, paddingTop: 4 }}>
          {stepIdx > 0 && (
            <button onClick={() => goByIndex(stepIdx - 1)} style={{ ...mono, fontSize: 13, color: 'var(--poster-fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>← {STEP_DEFS[stepIdx - 1].title}</button>
          )}
          {stepIdx < STEP_DEFS.length - 1 && (
            <button onClick={() => goByIndex(stepIdx + 1)} disabled={current.id === 'brainstorm' && !canFinalize}
              title={current.id === 'brainstorm' && !canFinalize ? 'escolha ao menos um desafio e adicione ao menos um cartão' : undefined}
              style={{ ...mono, fontSize: 13, letterSpacing: '.03em', color: 'var(--poster-bg-solid)', background: (current.id === 'brainstorm' && !canFinalize) ? 'var(--poster-line)' : GOLD, border: 'none', borderRadius: 6, padding: '9px 18px', cursor: (current.id === 'brainstorm' && !canFinalize) ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
              {current.id === 'brainstorm' ? 'Finalizar brainstorming →' : `Continuar para ${STEP_DEFS[stepIdx + 1].title} →`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
