/* eslint-disable react-refresh/only-export-components */
// ──────────────────────────────────────────────────────────────────
// posterKit — shared pieces of the GuiaSat poster surfaces (the landing
// overlay, the Mission window and the Telemetry ground station):
// palette, type, buttons, cards, the step rail, the poster planet and
// the mission-patch emblems.
//
// Every colour here is a CSS token (see index.css → --poster-*), so the
// poster surfaces flip with the theme: a navy/cream space-agency poster
// in dark, a paper/ink poster in light. CREAM/GOLD/ORANGE/NAVY_FIELD are
// kept as named exports for compatibility, now resolving to tokens.
// (Mixing constants and components here intentionally trades fast-refresh
// granularity for a single import point — hence the lint exception.)
// ──────────────────────────────────────────────────────────────────

export const mono = { fontFamily: "'Space Mono', monospace" }
export const slab = { fontFamily: "'Space Grotesk', sans-serif" }
// poster foreground / accents (themed via index.css)
export const CREAM = 'var(--poster-fg)'
export const GOLD = 'var(--poster-gold)'
export const ORANGE = 'var(--poster-orange)'
export const DIM = 'var(--poster-fg-dim)'
export const LINE = 'var(--poster-line)'

export const NAVY_FIELD = 'var(--poster-bg)'

export const primaryBtn = {
  ...slab, fontSize: 19, fontWeight: 700, letterSpacing: '.01em',
  background: 'var(--btn-bg)', color: 'var(--btn-fg)', border: 'none', borderRadius: 'var(--r-md)',
  padding: '13px 28px', cursor: 'pointer',
}
export const ghostBtn = {
  ...slab, fontSize: 19, fontWeight: 600,
  background: 'transparent', color: CREAM, borderRadius: 'var(--r-md)',
  border: '1.5px solid var(--poster-line)', padding: '13px 28px', cursor: 'pointer',
}

export const h2 = { ...slab, fontSize: 28, fontWeight: 600, color: CREAM, textAlign: 'center', margin: '0 0 8px', letterSpacing: '-0.01em' }
export const sub = { ...mono, fontSize: 13.5, color: DIM, textAlign: 'center', margin: '0 0 30px', lineHeight: 1.5 }
export const inputStyle = {
  display: 'block', width: '100%', marginTop: 6, padding: '11px 13px', borderRadius: 'var(--r-sm)',
  background: 'var(--poster-input)', border: '1.5px solid var(--poster-line)',
  color: CREAM, fontSize: 17, fontFamily: "'Space Grotesk', sans-serif", outline: 'none',
}

// ── poster graphic: planet + orbit + satellite (pure SVG, flat) ────
// SVG presentation attributes don't resolve var() in Chrome/Safari, so the
// poster ink is driven by currentColor (svg style.color = --poster-fg) and
// the gold/orange accents go through inline style.fill (which does resolve
// var() everywhere). Same pattern in PatchEmblem and SatelliteAssembly.
const gold = { fill: 'var(--poster-gold)' }
const orange = { fill: 'var(--poster-orange)' }
export function PosterArt({ size = 460 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 460 460" aria-hidden="true" style={{ color: 'var(--poster-fg)' }}>
      {Array.from({ length: 40 }, (_, i) => {
        const x = (i * 97) % 460, y = (i * 53 + 31) % 460
        return <circle key={i} cx={x} cy={y} r={i % 7 === 0 ? 1.6 : 0.9} fill="currentColor" opacity={0.4} />
      })}
      <circle cx="230" cy="250" r="120" style={orange} />
      <circle cx="230" cy="250" r="120" fill="url(#shade)" />
      <path d="M110 250a120 120 0 0 0 240 0" fill="#A3551D" opacity=".5" />
      <ellipse cx="230" cy="250" rx="120" ry="120" fill="none" stroke="currentColor" strokeOpacity=".14" />
      <ellipse cx="230" cy="250" rx="64" ry="120" fill="none" stroke="currentColor" strokeOpacity=".12" />
      <ellipse cx="230" cy="250" rx="120" ry="44" fill="none" stroke="currentColor" strokeOpacity=".12" />
      <ellipse cx="230" cy="250" rx="196" ry="86" fill="none" stroke="currentColor" strokeOpacity=".5"
        strokeWidth="1.2" strokeDasharray="5 7" transform="rotate(-18 230 250)" />
      <g style={{ animation: 'onb-orbit 26s linear infinite', transformOrigin: '230px 250px' }}>
        <g transform="rotate(-18 230 250)">
          <g transform="translate(426 250)">
            <rect x="-7" y="-7" width="14" height="14" fill="currentColor" />
            <rect x="-23" y="-3.5" width="13" height="7" style={gold} />
            <rect x="10" y="-3.5" width="13" height="7" style={gold} />
          </g>
        </g>
      </g>
      <defs>
        {/* sphere shading is light-independent: a white highlight → black core */}
        <radialGradient id="shade" cx="36%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".25" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity=".3" />
        </radialGradient>
      </defs>
    </svg>
  )
}

// ── mission-patch style emblem per mission kind ────────────────────
export function PatchEmblem({ kind }) {
  const gs = { stroke: 'var(--poster-gold)' }
  const inner = {
    competition: <><circle cx="24" cy="24" r="9" fill="none" style={gs} strokeWidth="2" /><path d="M24 8v7M24 33v7M8 24h7M33 24h7" style={gs} strokeWidth="2" /></>,
    research:    <><circle cx="21" cy="21" r="8" fill="none" style={gs} strokeWidth="2.4" /><path d="M27 27l9 9" style={gs} strokeWidth="2.6" strokeLinecap="round" /></>,
    hobby:       <><path d="M24 9l3.6 9.6L38 22l-9 6.4 2.6 10.6L24 33l-7.6 6 2.6-10.6-9-6.4 10.4-3.4z" fill="none" style={gs} strokeWidth="2" strokeLinejoin="round" /></>,
    professional:<><rect x="13" y="17" width="22" height="16" rx="2" fill="none" style={gs} strokeWidth="2" /><path d="M19 17v-3a5 5 0 0 1 10 0v3" fill="none" style={gs} strokeWidth="2" /></>,
  }[kind]
  return (
    <svg width="64" height="64" viewBox="0 0 48 48" style={{ color: 'var(--poster-fg)' }}>
      <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeOpacity=".8" strokeWidth="1.6" />
      <circle cx="24" cy="24" r="18.5" fill="none" stroke="currentColor" strokeOpacity=".3" strokeWidth="1" strokeDasharray="2 3" />
      {inner}
    </svg>
  )
}

export const MISSION_KINDS = [
  { id: 'competition',  tag: 'Competição', label: 'Competição universitária', desc: 'OBSAT, CanSat e afins — regras e pontuação guiam o projeto.' },
  { id: 'research',     tag: 'Pesquisa',   label: 'Pesquisa acadêmica',       desc: 'Coleta de dados científicos com rigor de metodologia.' },
  { id: 'hobby',        tag: 'Pessoal',    label: 'Projeto pessoal',          desc: 'Aprender fazendo: um payload de balão ou bancada, no seu ritmo.' },
  { id: 'professional', tag: 'Profissional', label: 'Missão profissional',    desc: 'Prototipagem séria com requisitos e orçamento de verdade.' },
]

// `onStep(i)` makes every node a direct-navigation button (Part 2). Without
// it the dots are display-only (the original onboarding behaviour).
export function StepDots({ steps, current, onStep }) {
  const clickable = typeof onStep === 'function'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={clickable ? () => onStep(i) : undefined}
            disabled={!clickable}
            title={clickable ? `Ir para ${s}` : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: 0, border: 'none',
              background: 'none', cursor: clickable ? 'pointer' : 'default',
            }}>
            <span style={{
              width: 26, height: 26, borderRadius: '50%', ...mono, fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: i < current ? GOLD : i === current ? CREAM : 'transparent',
              color: i <= current ? 'var(--poster-bg-solid)' : DIM,
              border: `1.5px solid ${i <= current ? 'transparent' : LINE}`,
            }}>{i < current ? '✓' : i + 1}</span>
            <span style={{
              ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
              color: i === current ? CREAM : DIM,
            }}>{s}</span>
          </button>
          {i < steps.length - 1 && <span style={{ width: 26, height: 1, background: LINE }} />}
        </div>
      ))}
    </div>
  )
}

export function Card({ selected, onClick, children, width = 300 }) {
  return (
    <button onClick={onClick} style={{
      width, textAlign: 'left', cursor: 'pointer', borderRadius: 'var(--r-lg)', padding: '20px 20px 18px',
      background: selected ? 'var(--poster-card-sel)' : 'var(--poster-card)',
      border: `1.5px solid ${selected ? GOLD : 'var(--poster-line)'}`,
      transition: 'all .15s', color: CREAM,
    }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--poster-fg-dim)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--poster-line)' }}
    >{children}</button>
  )
}
