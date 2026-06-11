import { useState } from 'react'
import useForge from '../../store/useForge'
import { FRAMEWORK_LIST, COMING_SOON_FRAMEWORKS, OBJECTIVES, getFramework, resolveObjective } from '../../mission/index.js'
import { track } from '../../lib/analytics.js'
import {
  mono, slab, CREAM, GOLD, NAVY_FIELD, primaryBtn, h2, sub, inputStyle,
  MISSION_KINDS, StepDots, Card,
} from '../onboarding/posterKit.jsx'
import SatelliteAssembly from '../onboarding/SatelliteAssembly.jsx'

// ──────────────────────────────────────────────────────────────────
// MissionWindow — the home window (rail target "Mission").
//
// This is WHERE THE USER DEFINES WHAT THEY ARE BUILDING AND WHY:
// mission type → competition/framework → scientific objective →
// identity & constraints. It is the same guided intake that the
// first-visit onboarding leads into — there is exactly ONE place each
// of these decisions lives, and the Hardware window (how it is built)
// reads this context instead of re-asking for it.
//
// Reopening this window later resumes at the first incomplete step and
// lets the user revisit any completed step through the rail dots; every
// field is live-bound to missionPlan, so edits ripple instantly.
// ──────────────────────────────────────────────────────────────────

// ── advanced options: team information (future release teaser) ─────
// Collapsed by default, clearly optional. The fields are intentionally
// styled as LOCKED-BUT-COMING (gold lock, dashed frame, "em breve" tag,
// per-field tooltip) rather than disabled-broken — a teaser, not a
// placeholder. No generic "under development" popup here by design.
const TEAM_FIELDS = [
  { id: 'team',        label: 'nome da equipe',            ph: 'ex.: Equipe Zenite' },
  { id: 'institution', label: 'instituição / universidade', ph: 'ex.: UFMG' },
  { id: 'size',        label: 'tamanho da equipe',          ph: 'ex.: 6 integrantes' },
  { id: 'program',     label: 'competição / programa',      ph: 'ex.: OBSAT 2026' },
]

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--poster-gold)' }} strokeWidth="2.4" strokeLinecap="round">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function AdvancedOptions() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 4 }}>
      <button onClick={() => { track('panel_toggle', { panel: 'advanced_options', action: open ? 'close' : 'open' }); setOpen(v => !v) }}
        style={{
          ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
          color: 'var(--poster-fg-dim)', background: 'none', border: 'none', cursor: 'pointer',
          padding: '2px 0', display: 'flex', alignItems: 'center', gap: 7,
        }}>
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>▸</span>
        opções avançadas
        <span style={{ fontSize: 10, color: 'var(--poster-fg-dim)', textTransform: 'none', letterSpacing: '.04em' }}>opcional</span>
      </button>

      {open && (
        <div style={{
          marginTop: 9, padding: '12px 14px', borderRadius: 8,
          border: '1.5px dashed var(--poster-line)', background: 'var(--poster-card)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <span style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: GOLD }}>
              informações da equipe
            </span>
            <span style={{
              ...mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase',
              color: 'var(--poster-bg-solid)', background: GOLD, borderRadius: 3, padding: '1.5px 6px',
            }}>em breve</span>
          </div>
          {TEAM_FIELDS.map(f => (
            <label key={f.id}
              title="Disponível em uma versão futura — as informações da equipe vão alimentar relatórios da missão e inscrições em competições."
              style={{
                ...mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
                color: 'var(--poster-fg-dim)', display: 'block', marginBottom: 9, cursor: 'help',
              }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LockIcon />{f.label}</span>
              <input disabled placeholder={f.ph} style={{
                ...inputStyle, marginTop: 4, padding: '8px 11px', fontSize: 14.5,
                background: 'var(--poster-card)', border: '1px dashed var(--poster-line)',
                color: 'var(--poster-fg-dim)', cursor: 'help',
              }} />
            </label>
          ))}
          <div style={{ ...mono, fontSize: 10.5, color: 'var(--poster-fg-dim)', lineHeight: 1.55 }}>
            estes campos chegam numa versão futura — vão alimentar relatórios
            da missão e inscrição em competições
          </div>
        </div>
      )}
    </div>
  )
}

export default function MissionWindow() {
  const {
    missionPlan, selectFramework, setMissionKind, selectObjective,
    setPlanName, setBudget, setSection, comingSoon,
  } = useForge()
  const kind = missionPlan.kind || null
  const isCompetition = kind === 'competition'
  const steps = isCompetition || kind == null
    ? ['tipo de missão', 'competição', 'objetivo', 'identidade']
    : ['tipo de missão', 'objetivo', 'identidade']
  const objStep = isCompetition || kind == null ? 2 : 1
  const idStep = isCompetition || kind == null ? 3 : 2

  // resume where the plan actually is: first incomplete decision
  const firstIncomplete = !kind ? 0
    : (isCompetition && !missionPlan.frameworkId) ? 1
    : !missionPlan.objectiveId ? objStep
    : idStep
  const [step, setStep] = useState(firstIncomplete)
  const complete = !!kind && !!missionPlan.frameworkId && !!missionPlan.objectiveId && missionPlan.name.trim().length >= 2

  const competitions = FRAMEWORK_LIST.filter(f => f.kind === 'competition')
  const fw = getFramework(missionPlan.frameworkId)
  const resolved = resolveObjective(missionPlan)

  // every choice is applied to the real plan IMMEDIATELY (selectFramework
  // resets the plan, so it runs first and the kind is re-stamped after)
  const chooseKind = (k) => {
    // next step is index 1 in both layouts: competition picker for
    // competition missions, objective for everything else
    if (k !== 'competition') { selectFramework('custom'); setMissionKind(k) }
    else { setMissionKind(k); track('onboarding', { action: 'kind_competition' }) }
    setStep(1)
  }
  const chooseCompetition = (id) => { selectFramework(id); setMissionKind('competition'); setStep(2) }

  const screens = []
  screens[0] = (
    <>
      <h2 style={h2}>Que tipo de missão você vai voar?</h2>
      <p style={sub}>Isso define as regras de validação e as recomendações que o FORGE aplica ao seu projeto.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(260px, 320px))', gap: 16, justifyContent: 'center' }}>
        {MISSION_KINDS.map(k => (
          <Card key={k.id} width="100%" selected={kind === k.id} onClick={() => chooseKind(k.id)}>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, marginBottom: 7 }}>{k.tag}</div>
            <div style={{ ...slab, fontSize: 22, fontWeight: 700, marginBottom: 5 }}>{k.label}</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--poster-fg-dim)' }}>{k.desc}</div>
          </Card>
        ))}
      </div>
    </>
  )
  if (isCompetition || kind == null) screens[1] = (
    <>
      <h2 style={h2}>Qual competição?</h2>
      <p style={sub}>Os requisitos oficiais (massa, telemetria, enlace) entram direto na validação do projeto.</p>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        {competitions.map(f => (
          <Card key={f.id} selected={missionPlan.frameworkId === f.id} onClick={() => chooseCompetition(f.id)}>
            <div style={{ ...slab, fontSize: 23, fontWeight: 700, marginBottom: 4 }}>{f.name}</div>
            <div style={{ ...mono, fontSize: 12, color: GOLD, marginBottom: 8 }}>{f.full}</div>
            <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--poster-fg-dim)' }}>{f.tagline}</div>
          </Card>
        ))}
        {COMING_SOON_FRAMEWORKS.map(f => (
          <Card key={f.id} onClick={(e) => comingSoon(f.name, e.currentTarget, `framework_${f.id}`)}>
            <div style={{ ...slab, fontSize: 23, fontWeight: 700, marginBottom: 4, opacity: .65 }}>{f.name}</div>
            <div style={{ ...mono, fontSize: 12, color: 'var(--poster-fg-dim)', marginBottom: 8 }}>{f.full}</div>
            <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--poster-fg-dim)' }}>{f.tagline}</div>
          </Card>
        ))}
      </div>
    </>
  )
  screens[objStep] = (
    <>
      <h2 style={h2}>O que a missão vai medir?</h2>
      <p style={sub}>O objetivo científico escolhe os sensores recomendados e molda o firmware gerado.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(260px, 320px))', gap: 16, justifyContent: 'center' }}>
        {OBJECTIVES.map(o => (
          <Card key={o.id} width="100%" selected={missionPlan.objectiveId === o.id}
            onClick={() => { selectObjective(o.id); setStep(idStep) }}>
            <div style={{ ...slab, fontSize: 20, fontWeight: 700, marginBottom: 5 }}>{o.label}</div>
            <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--poster-fg-dim)' }}>{o.desc}</div>
          </Card>
        ))}
      </div>
    </>
  )
  screens[idStep] = (
    <>
      <h2 style={h2}>Dê um nome à missão</h2>
      <p style={sub}>O orçamento alimenta a validação de custos — dá para ajustar depois.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 380, margin: '0 auto' }}>
        <label style={{ ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)' }}>
          nome da missão
          <input value={missionPlan.name} onChange={e => setPlanName(e.target.value)} placeholder="ex.: ARARA-1"
            style={inputStyle} autoFocus />
        </label>
        <label style={{ ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)' }}>
          orçamento (R$ · opcional)
          <input type="number" value={missionPlan.budgetBRL ?? ''} onChange={e => setBudget(e.target.value)} placeholder="ex.: 300"
            style={inputStyle} />
        </label>
        <AdvancedOptions />
        <button
          onClick={() => { track('onboarding', { action: 'to_hardware' }); setSection('hardware') }}
          disabled={missionPlan.name.trim().length < 2}
          style={{ ...primaryBtn, marginTop: 10, opacity: missionPlan.name.trim().length < 2 ? .45 : 1 }}>
          Continuar para o hardware →
        </button>
        <div style={{ ...mono, fontSize: 11.5, color: 'var(--poster-fg-dim)', textAlign: 'center' }}>
          lá você escolhe sensores e componentes — sem repetir nada do que definiu aqui
        </div>
      </div>
    </>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px 36px 22px', background: NAVY_FIELD, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...slab, fontSize: 22, fontWeight: 700, color: CREAM }}>Definição da missão</div>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)' }}>
            {complete && fw && resolved
              ? `${missionPlan.name} · ${fw.name} · ${resolved.label}`
              : 'o quê e por quê — o hardware vem depois'}
          </div>
        </div>
        <StepDots steps={steps} current={step} />
        {complete ? (
          <button onClick={() => setSection('hardware')} style={{
            ...mono, fontSize: 13, letterSpacing: '.04em', color: 'var(--poster-bg-solid)', background: GOLD,
            border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 700,
          }}>ir para o hardware →</button>
        ) : <span style={{ width: 10 }} />}
      </div>

      {/* content + persistent satellite assembly (gamified progress —
          every decision visibly adds a subsystem, see SatelliteAssembly) */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 0' }}>
          <div>{screens[step]}</div>
        </div>
        <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--poster-line)', padding: '10px 4px 6px 14px', minHeight: 0 }}>
          <SatelliteAssembly plan={missionPlan} />
        </div>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', gap: 22 }}>
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} style={{
            ...mono, fontSize: 13, color: 'var(--poster-fg-dim)', background: 'none',
            border: 'none', cursor: 'pointer',
          }}>← voltar</button>
        )}
        {step < steps.length - 1 && (kind != null) && (
          <button onClick={() => setStep(s => s + 1)} style={{
            ...mono, fontSize: 13, color: 'var(--poster-fg-dim)', background: 'none',
            border: 'none', cursor: 'pointer',
          }}>avançar →</button>
        )}
      </div>
    </div>
  )
}
