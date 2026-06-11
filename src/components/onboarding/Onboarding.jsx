import { useState } from 'react'
import useForge from '../../store/useForge'
import { FRAMEWORK_LIST, COMING_SOON_FRAMEWORKS, OBJECTIVES } from '../../mission/index.js'
import { track } from '../../lib/analytics.js'

// ──────────────────────────────────────────────────────────────────
// Onboarding — first-visit entry + guided mission intake.
//
// DESIGN RATIONALE (aesthetic research):
// · NASA JPL "Exoplanet Travel Bureau" posters → flat layered discs,
//   big celestial bodies, cream-on-deep-navy, confident display type.
// · CNES 70s/Soviet space poster graphics → diagonal dynamism, high
//   contrast, technical annotations as graphic texture.
// · Teenage Engineering / Playdate → dense mono microcopy, honest
//   controls; Linear → restraint, type-led hierarchy.
// Synthesis: deep navy field, cream + mission-patch gold/burnt-orange
// accents, Zilla Slab display over Space Mono annotations, one big
// poster graphic (planet + orbit + satellite) and generous negative
// space. The user must know what FORGE is within five seconds.
//
// FLOW RATIONALE: not a tooltip tour — a real mission intake mirroring
// the decisions a junior satellite engineer makes before touching
// hardware: context (who is this mission for) → framework/rules →
// scientific objective → identity & budget. Every selection is applied
// to the REAL missionPlan immediately, so exiting at any point lands in
// a workspace already carrying the collected context.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const slab = { fontFamily: "'Zilla Slab', 'Space Grotesk', serif" }
const CREAM = '#F4EFE6'
const GOLD = '#C9A227'
const ORANGE = '#C96F2B'

// ── poster graphic: planet + orbit + satellite (pure SVG, flat) ────
function PosterArt({ size = 460 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 460 460" aria-hidden="true">
      {/* starfield — deterministic, subtle */}
      {Array.from({ length: 40 }, (_, i) => {
        const x = (i * 97) % 460, y = (i * 53 + 31) % 460
        return <circle key={i} cx={x} cy={y} r={i % 7 === 0 ? 1.6 : 0.9} fill={CREAM} opacity={0.4} />
      })}
      {/* planet disc, JPL-poster flat shading */}
      <circle cx="230" cy="250" r="120" fill={ORANGE} />
      <circle cx="230" cy="250" r="120" fill="url(#shade)" />
      <path d="M110 250a120 120 0 0 0 240 0" fill="#A3551D" opacity=".5" />
      {/* meridian texture */}
      <ellipse cx="230" cy="250" rx="120" ry="120" fill="none" stroke={CREAM} strokeOpacity=".14" />
      <ellipse cx="230" cy="250" rx="64" ry="120" fill="none" stroke={CREAM} strokeOpacity=".12" />
      <ellipse cx="230" cy="250" rx="120" ry="44" fill="none" stroke={CREAM} strokeOpacity=".12" />
      {/* orbit + satellite */}
      <ellipse cx="230" cy="250" rx="196" ry="86" fill="none" stroke={CREAM} strokeOpacity=".5"
        strokeWidth="1.2" strokeDasharray="5 7" transform="rotate(-18 230 250)" />
      <g style={{ animation: 'onb-orbit 26s linear infinite', transformOrigin: '230px 250px' }}>
        <g transform="rotate(-18 230 250)">
          <g transform="translate(426 250)">
            <rect x="-7" y="-7" width="14" height="14" fill={CREAM} />
            <rect x="-23" y="-3.5" width="13" height="7" fill={GOLD} />
            <rect x="10" y="-3.5" width="13" height="7" fill={GOLD} />
          </g>
        </g>
      </g>
      <defs>
        <radialGradient id="shade" cx="36%" cy="32%" r="80%">
          <stop offset="0%" stopColor={CREAM} stopOpacity=".25" />
          <stop offset="55%" stopColor={CREAM} stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity=".3" />
        </radialGradient>
      </defs>
    </svg>
  )
}

// ── mission-patch style emblem per mission kind ────────────────────
function PatchEmblem({ kind }) {
  const inner = {
    competition: <><circle cx="24" cy="24" r="9" fill="none" stroke={GOLD} strokeWidth="2" /><path d="M24 8v7M24 33v7M8 24h7M33 24h7" stroke={GOLD} strokeWidth="2" /></>,
    research:    <><circle cx="21" cy="21" r="8" fill="none" stroke={GOLD} strokeWidth="2.4" /><path d="M27 27l9 9" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" /></>,
    hobby:       <><path d="M24 9l3.6 9.6L38 22l-9 6.4 2.6 10.6L24 33l-7.6 6 2.6-10.6-9-6.4 10.4-3.4z" fill="none" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" /></>,
    professional:<><rect x="13" y="17" width="22" height="16" rx="2" fill="none" stroke={GOLD} strokeWidth="2" /><path d="M19 17v-3a5 5 0 0 1 10 0v3" fill="none" stroke={GOLD} strokeWidth="2" /></>,
  }[kind]
  return (
    <svg width="64" height="64" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="22" fill="none" stroke={CREAM} strokeOpacity=".8" strokeWidth="1.6" />
      <circle cx="24" cy="24" r="18.5" fill="none" stroke={CREAM} strokeOpacity=".3" strokeWidth="1" strokeDasharray="2 3" />
      {inner}
    </svg>
  )
}

const MISSION_KINDS = [
  { id: 'competition',  label: 'Competição universitária', desc: 'OBSAT, CanSat e afins — regras e pontuação guiam o projeto.' },
  { id: 'research',     label: 'Pesquisa acadêmica',       desc: 'Coleta de dados científicos com rigor de metodologia.' },
  { id: 'hobby',        label: 'Projeto pessoal',          desc: 'Aprender fazendo: um payload de balão ou bancada, no seu ritmo.' },
  { id: 'professional', label: 'Missão profissional',      desc: 'Prototipagem séria com requisitos e orçamento de verdade.' },
]

// ── shared chrome ──────────────────────────────────────────────────
function ExitLink({ children = 'sair e ir para o workspace →' }) {
  const skipOnboarding = useForge(s => s.skipOnboarding)
  return (
    <button onClick={skipOnboarding} style={{
      ...mono, fontSize: 13, letterSpacing: '.04em', color: 'rgba(244,239,230,.78)',
      background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
      textUnderlineOffset: 3,
    }}>{children}</button>
  )
}

function StepDots({ steps, current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 26, height: 26, borderRadius: '50%', ...mono, fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: i < current ? GOLD : i === current ? CREAM : 'transparent',
            color: i <= current ? '#18243A' : 'rgba(244,239,230,.6)',
            border: `1.5px solid ${i <= current ? 'transparent' : 'rgba(244,239,230,.4)'}`,
          }}>{i < current ? '✓' : i + 1}</span>
          <span style={{
            ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
            color: i === current ? CREAM : 'rgba(244,239,230,.55)',
          }}>{s}</span>
          {i < steps.length - 1 && <span style={{ width: 26, height: 1, background: 'rgba(244,239,230,.3)' }} />}
        </div>
      ))}
    </div>
  )
}

function Card({ selected, onClick, children, width = 300 }) {
  return (
    <button onClick={onClick} style={{
      width, textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: '20px 20px 18px',
      background: selected ? 'rgba(244,239,230,.12)' : 'rgba(244,239,230,.04)',
      border: `1.5px solid ${selected ? GOLD : 'rgba(244,239,230,.25)'}`,
      transition: 'all .15s', color: CREAM,
    }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'rgba(244,239,230,.55)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'rgba(244,239,230,.25)' }}
    >{children}</button>
  )
}

const primaryBtn = {
  ...slab, fontSize: 19, fontWeight: 700, letterSpacing: '.01em',
  background: CREAM, color: '#18243A', border: 'none', borderRadius: 8,
  padding: '13px 28px', cursor: 'pointer',
}
const ghostBtn = {
  ...slab, fontSize: 19, fontWeight: 600,
  background: 'transparent', color: CREAM, borderRadius: 8,
  border: '1.5px solid rgba(244,239,230,.5)', padding: '13px 28px', cursor: 'pointer',
}

// ── landing: what FORGE is, in five seconds ────────────────────────
function Landing() {
  const startGuided = useForge(s => s.startGuided)
  const skipOnboarding = useForge(s => s.skipOnboarding)
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, padding: '0 48px' }}>
      <div style={{ maxWidth: 560 }}>
        <div style={{ ...mono, fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: GOLD, marginBottom: 18 }}>
          plataforma de desenvolvimento de missões
        </div>
        <h1 style={{ ...slab, fontSize: 96, fontWeight: 700, lineHeight: .95, color: CREAM, margin: '0 0 22px', letterSpacing: '-0.01em' }}>
          FORGE
        </h1>
        <p style={{ fontSize: 21, lineHeight: 1.5, color: 'rgba(244,239,230,.92)', margin: '0 0 10px', maxWidth: 520 }}>
          Monte, valide, programe e opere o satélite da sua equipe — da escolha
          dos sensores à estação terrestre, em um só lugar.
        </p>
        <p style={{ ...mono, fontSize: 13.5, lineHeight: 1.6, color: 'rgba(244,239,230,.7)', margin: '0 0 34px' }}>
          feito para equipes universitárias de CubeSat e balão estratosférico ·
          OBSAT e além · simulação honesta de hardware
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={startGuided} style={primaryBtn}>Começar com configuração guiada</button>
          <button onClick={skipOnboarding} style={ghostBtn}>Pular para o workspace</button>
        </div>
        <div style={{ ...mono, fontSize: 11.5, color: 'rgba(244,239,230,.55)', marginTop: 14 }}>
          a configuração guiada leva ~2 minutos · dá para sair a qualquer momento
        </div>
      </div>
      <div style={{ flexShrink: 1, minWidth: 0 }}><PosterArt /></div>
    </div>
  )
}

// ── guided flow ────────────────────────────────────────────────────
function Flow() {
  const {
    missionPlan, selectFramework, setMissionKind, selectObjective,
    setPlanName, setBudget, finishOnboarding, comingSoon,
  } = useForge()
  const [kind, setKind] = useState(missionPlan.kind || null)
  const [step, setStep] = useState(0)

  const isCompetition = kind === 'competition'
  const steps = isCompetition || kind == null
    ? ['tipo de missão', 'competição', 'objetivo', 'identidade']
    : ['tipo de missão', 'objetivo', 'identidade']

  const competitions = FRAMEWORK_LIST.filter(f => f.kind === 'competition')

  // every choice is applied to the real plan IMMEDIATELY (selectFramework
  // resets the plan, so it runs first and the kind is re-stamped after)
  const chooseKind = (k) => {
    setKind(k)
    if (k !== 'competition') { selectFramework('custom'); setMissionKind(k); setStep(1) }
    else { setStep(1); track('onboarding', { action: 'kind_competition' }) }
  }
  const chooseCompetition = (id) => { selectFramework(id); setMissionKind('competition'); setStep(2) }
  const objStep = isCompetition ? 2 : 1
  const idStep = isCompetition ? 3 : 2

  const screens = []
  screens[0] = (
    <>
      <h2 style={h2}>Que tipo de missão você vai voar?</h2>
      <p style={sub}>Isso define as regras de validação e as recomendações que o FORGE aplica ao seu projeto.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 320px)', gap: 16, justifyContent: 'center' }}>
        {MISSION_KINDS.map(k => (
          <Card key={k.id} width={320} selected={kind === k.id} onClick={() => chooseKind(k.id)}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <PatchEmblem kind={k.id} />
              <div>
                <div style={{ ...slab, fontSize: 21, fontWeight: 700, marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 14, lineHeight: 1.45, color: 'rgba(244,239,230,.78)' }}>{k.desc}</div>
              </div>
            </div>
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
            <div style={{ fontSize: 14, lineHeight: 1.45, color: 'rgba(244,239,230,.78)' }}>{f.tagline}</div>
          </Card>
        ))}
        {COMING_SOON_FRAMEWORKS.map(f => (
          <Card key={f.id} onClick={(e) => comingSoon(f.name, e.currentTarget, `framework_${f.id}`)}>
            <div style={{ ...slab, fontSize: 23, fontWeight: 700, marginBottom: 4, opacity: .65 }}>{f.name}</div>
            <div style={{ ...mono, fontSize: 12, color: 'rgba(244,239,230,.6)', marginBottom: 8 }}>{f.full}</div>
            <div style={{ fontSize: 14, lineHeight: 1.45, color: 'rgba(244,239,230,.6)' }}>{f.tagline}</div>
          </Card>
        ))}
      </div>
    </>
  )
  screens[objStep] = (
    <>
      <h2 style={h2}>O que a missão vai medir?</h2>
      <p style={sub}>O objetivo científico escolhe os sensores recomendados e molda o firmware gerado.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 320px)', gap: 16, justifyContent: 'center' }}>
        {OBJECTIVES.map(o => (
          <Card key={o.id} width={320} selected={missionPlan.objectiveId === o.id}
            onClick={() => { selectObjective(o.id); setStep(idStep) }}>
            <div style={{ ...slab, fontSize: 20, fontWeight: 700, marginBottom: 5 }}>{o.label}</div>
            <div style={{ fontSize: 14, lineHeight: 1.45, color: 'rgba(244,239,230,.78)' }}>{o.desc}</div>
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
        <label style={{ ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(244,239,230,.7)' }}>
          nome da missão
          <input value={missionPlan.name} onChange={e => setPlanName(e.target.value)} placeholder="ex.: ARARA-1"
            style={inputStyle} autoFocus />
        </label>
        <label style={{ ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(244,239,230,.7)' }}>
          orçamento (R$ · opcional)
          <input type="number" value={missionPlan.budgetBRL ?? ''} onChange={e => setBudget(e.target.value)} placeholder="ex.: 300"
            style={inputStyle} />
        </label>
        <button onClick={finishOnboarding} disabled={missionPlan.name.trim().length < 2}
          style={{ ...primaryBtn, marginTop: 10, opacity: missionPlan.name.trim().length < 2 ? .45 : 1 }}>
          Entrar no workspace →
        </button>
        <div style={{ ...mono, fontSize: 11.5, color: 'rgba(244,239,230,.6)', textAlign: 'center' }}>
          próximo passo lá dentro: escolher o hardware e ver a placa ganhar vida
        </div>
      </div>
    </>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '26px 44px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ ...slab, fontSize: 22, fontWeight: 700, color: CREAM }}>FORGE</span>
        <StepDots steps={steps} current={step} />
        <ExitLink />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 0' }}>
        <div>{screens[step]}</div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} style={{
            ...mono, fontSize: 13, color: 'rgba(244,239,230,.75)', background: 'none',
            border: 'none', cursor: 'pointer',
          }}>← voltar</button>
        )}
      </div>
    </div>
  )
}

const h2 = { ...slab, fontSize: 40, fontWeight: 700, color: CREAM, textAlign: 'center', margin: '0 0 8px' }
const sub = { ...mono, fontSize: 13.5, color: 'rgba(244,239,230,.7)', textAlign: 'center', margin: '0 0 30px', lineHeight: 1.5 }
const inputStyle = {
  display: 'block', width: '100%', marginTop: 6, padding: '11px 13px', borderRadius: 7,
  background: 'rgba(244,239,230,.07)', border: '1.5px solid rgba(244,239,230,.3)',
  color: CREAM, fontSize: 17, fontFamily: "'Space Grotesk', sans-serif", outline: 'none',
}

export default function Onboarding() {
  const onboarding = useForge(s => s.onboarding)
  if (!onboarding) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 150, overflow: 'hidden',
      background: 'radial-gradient(120% 120% at 75% 20%, #223255 0%, #18243A 55%, #101A2C 100%)',
    }}>
      {/* worn-poster grain + frame, in the spirit of printed mission art */}
      <div style={{
        position: 'absolute', inset: 14, border: '1.5px solid rgba(244,239,230,.22)',
        borderRadius: 4, pointerEvents: 'none',
      }} />
      <div style={{ position: 'absolute', inset: 0 }}>
        {onboarding === 'landing' ? <Landing /> : <Flow />}
      </div>
      <div style={{
        position: 'absolute', bottom: 22, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none',
        ...mono, fontSize: 10.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(244,239,230,.45)',
      }}>forge mission systems · est. 2025 · simulação honesta</div>
    </div>
  )
}
